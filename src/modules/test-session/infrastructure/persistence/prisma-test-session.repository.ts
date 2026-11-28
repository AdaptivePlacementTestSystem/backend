import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { TestSessionEntity } from '../../domain/entities/test-session.entity';
import {
  ErrorCode,
  ExamRoundStatus,
  SessionStatus,
  StoppingReason,
  UserRole,
} from '@apt/shared-types';
import { effectiveStatus } from '../../../exam-round/domain/effective-status';
import { SessionResponseEntity } from '../../domain/entities/session-response.entity';

@Injectable()
export class PrismaTestSessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<TestSessionEntity | null> {
    const raw = await this.prisma.testSession.findUnique({
      where: { id },
      include: {
        responses: {
          orderBy: { answeredAt: 'asc' },
          include: {
            item: true,
          },
        },
      },
    });

    if (!raw) return null;

    const responses = raw.responses.map(
      (r: any) =>
        new SessionResponseEntity(
          r.id,
          r.sessionId,
          r.itemId,
          r.response,
          r.isCorrect,
          r.thetaAfter,
          r.seAfter,
          r.responseTimeMs,
          r.answeredAt,
          r.item ? r.item.irtB : 0,
        ),
    );

    return new TestSessionEntity(
      raw.id,
      raw.studentId,
      raw.examRoundId,
      raw.status as SessionStatus,
      raw.thetaFinal,
      raw.seFinal,
      raw.stoppingReason as StoppingReason,
      raw.startedAt,
      raw.completedAt,
      responses,
      raw.expiresAt,
    );
  }

  async create(session: TestSessionEntity): Promise<TestSessionEntity> {
    const saved = await this.prisma.$transaction(async (tx) => {
      // Cùng thứ tự khóa kỳ rồi người dùng cho mọi lần bắt đầu phiên.
      await tx.$queryRaw`SELECT id FROM exam_rounds WHERE id = ${session.examRoundId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${session.studentId}::uuid FOR UPDATE`;
      const round = await tx.examRound.findUnique({
        where: { id: session.examRoundId },
      });
      const user = await tx.user.findUnique({
        where: { id: session.studentId },
      });
      const now = new Date();
      if (!user || !user.isActive || user.role !== UserRole.STUDENT) {
        throw new ForbiddenException('Tài khoản sinh viên không hợp lệ');
      }
      if (!round || effectiveStatus(round, now) !== ExamRoundStatus.OPEN) {
        throw new ConflictException({
          code: ErrorCode.ROUND_NOT_OPEN,
          message: 'Kỳ thi hiện không mở.',
        });
      }
      const participant = await tx.examRoundParticipant.findUnique({
        where: { roundId_studentId: { roundId: round.id, studentId: user.id } },
      });
      if (!participant)
        throw new ForbiddenException({
          code: ErrorCode.NOT_IN_ROUND,
          message: 'Bạn không thuộc danh sách thi của kỳ này.',
        });
      const completed = await tx.testSession.findFirst({
        where: {
          studentId: user.id,
          examRoundId: round.id,
          status: SessionStatus.COMPLETED,
        },
        select: { id: true },
      });
      if (completed)
        throw new ConflictException({
          code: ErrorCode.ROUND_ALREADY_COMPLETED,
          message: 'Bạn đã hoàn thành bài thi của kỳ này.',
        });
      const active = await tx.testSession.findFirst({
        where: { studentId: user.id, status: SessionStatus.IN_PROGRESS },
        select: { id: true },
      });
      if (active)
        throw new ConflictException({
          code: ErrorCode.SESSION_IN_PROGRESS,
          message: 'Bạn đang có một bài thi chưa hoàn thành.',
          details: { sessionId: active.id },
        });
      const expiresAt = new Date(
        Math.min(
          now.getTime() + round.durationMinutes * 60000,
          round.closesAt.getTime(),
        ),
      );
      return tx.testSession.create({
        data: {
          id: session.id,
          studentId: user.id,
          examRoundId: round.id,
          status: SessionStatus.IN_PROGRESS,
          startedAt: now,
          expiresAt,
        },
      });
    });

    return new TestSessionEntity(
      saved.id,
      saved.studentId,
      saved.examRoundId,
      saved.status as SessionStatus,
      saved.thetaFinal,
      saved.seFinal,
      saved.stoppingReason as StoppingReason,
      saved.startedAt,
      saved.completedAt,
      [],
      saved.expiresAt,
    );
  }

  /**
   * Quyết định #16: Ghi nhận response VÀ tăng times_used của Item trong cùng transaction.
   * Chống đếm trùng nhờ UNIQUE(session_id, item_id).
   */
  async recordResponse(response: SessionResponseEntity): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.sessionResponse.create({
        data: {
          id: response.id,
          sessionId: response.sessionId,
          itemId: response.itemId,
          response: response.response,
          isCorrect: response.isCorrect,
          thetaAfter: response.thetaAfter,
          seAfter: response.seAfter,
          responseTimeMs: response.responseTimeMs,
          answeredAt: response.answeredAt,
        },
      }),
      this.prisma.item.update({
        where: { id: response.itemId },
        data: { timesUsed: { increment: 1 } },
      }),
    ]);
  }

  async complete(
    sessionId: string,
    thetaFinal: number,
    seFinal: number,
    stoppingReason: StoppingReason,
  ): Promise<void> {
    await this.prisma.testSession.update({
      where: { id: sessionId },
      data: {
        status: 'COMPLETED',
        thetaFinal,
        seFinal,
        stoppingReason: stoppingReason as any,
        completedAt: new Date(),
      },
    });
  }
}
