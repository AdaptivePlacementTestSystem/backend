import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { TestSessionEntity } from '../../domain/entities/test-session.entity';
import { SessionStatus, StoppingReason } from '@apt/shared-types';
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
    const saved = await this.prisma.testSession.create({
      data: {
        id: session.id,
        studentId: session.studentId,
        examRoundId: session.examRoundId,
        status: session.status as any,
        startedAt: session.startedAt,
        expiresAt: session.expiresAt,
      },
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
