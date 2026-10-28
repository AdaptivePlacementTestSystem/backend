import { ErrorCode } from '@apt/shared-types';
import { Injectable, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaTestSessionRepository } from '../../infrastructure/persistence/prisma-test-session.repository';
import { RedisSessionCacheService } from '../../infrastructure/cache/redis-session-cache.service';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { TestSessionEntity, SessionStatus, StoppingReason } from '../../domain/entities/test-session.entity';
import { ComputeResultUseCase } from './compute-result.use-case';
import { randomUUID } from 'crypto';

@Injectable()
export class StartSessionUseCase {
  constructor(
    private readonly sessionRepository: PrismaTestSessionRepository,
    private readonly cacheService: RedisSessionCacheService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly computeResultUseCase: ComputeResultUseCase,
  ) {}

  async execute(userId: string, examRoundId: string): Promise<{ sessionId: string; expiresAt: Date }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Không tìm thấy thông tin sinh viên');
    }
    if (!user.isActive) {
      throw new ForbiddenException('Tài khoản của bạn đã bị khóa');
    }

    // DC-07, DC-20: phiên thi luôn gắn với một kỳ thi; SV phải thuộc danh sách thi của kỳ (không tự thêm)
    const participant = await this.prisma.examRoundParticipant.findUnique({
      where: { roundId_studentId: { roundId: examRoundId, studentId: user.id } },
      include: { round: true },
    });
    if (!participant) {
      throw new ForbiddenException({ code: ErrorCode.NOT_IN_ROUND, message: 'Bạn không thuộc danh sách thi của kỳ này.' });
    }
    const round = participant.round;

    // Trạng thái hiệu lực chuyển lazy theo thời gian (DC-10): DRAFT/CLOSED (đóng thủ công) hoặc ngoài [opensAt, closesAt)
    const now = new Date();
    if (round.status === 'DRAFT' || round.status === 'CLOSED' || now < round.opensAt || now >= round.closesAt) {
      throw new ConflictException({ code: ErrorCode.ROUND_NOT_OPEN, message: 'Kỳ thi hiện không mở.' });
    }

    const completed = await this.prisma.testSession.findFirst({
      where: { studentId: user.id, examRoundId, status: SessionStatus.COMPLETED as any },
      select: { id: true },
    });
    if (completed) {
      throw new ConflictException({
        code: ErrorCode.ROUND_ALREADY_COMPLETED,
        message: 'Bạn đã hoàn thành bài thi của kỳ này.',
      });
    }

    // expires_at = min(startedAt + durationMinutes của kỳ, closesAt), tính 1 lần lúc bắt đầu phiên (DC-20)
    const expiresAt = new Date(
      Math.min(now.getTime() + round.durationMinutes * 60 * 1000, round.closesAt.getTime()),
    );

    const graceSeconds = this.configService.get<number>('cat.sessionGraceSeconds') ?? 60;
    const minItems = this.configService.get<number>('cat.boundaryMinItems') ?? 8;

    // Kiểm tra phiên thi IN_PROGRESS của sinh viên
    const activeSession = await this.prisma.testSession.findFirst({
      where: {
        studentId: user.id,
        status: SessionStatus.IN_PROGRESS as any,
      },
      include: {
        responses: {
          orderBy: { answeredAt: 'asc' },
        },
      },
      orderBy: { startedAt: 'desc' },
    });

    if (activeSession) {
      const isExpired = Date.now() > activeSession.expiresAt.getTime() + graceSeconds * 1000;
      if (isExpired) {
        // Phiên quá hạn -> Lazy Cleanup trong transaction
        if (activeSession.responses.length >= minItems) {
          const lastResponse = activeSession.responses[activeSession.responses.length - 1];
          const thetaFinal = lastResponse?.thetaAfter ?? -0.5;
          const seFinal = lastResponse?.seAfter ?? 0.35;
          await this.computeResultUseCase.execute(
            activeSession.id,
            thetaFinal,
            seFinal,
            StoppingReason.TIMEOUT as any,
          );
        } else {
          await this.prisma.testSession.update({
            where: { id: activeSession.id },
            data: {
              status: SessionStatus.ABANDONED as any,
              stoppingReason: StoppingReason.TIMEOUT as any,
              completedAt: new Date(),
            },
          });
        }
        await this.cacheService.deleteState(activeSession.id);
      } else {
        // Phiên còn hạn -> Ném 409 Conflict với code SESSION_IN_PROGRESS (SRS v3.0)
        throw new ConflictException({
          code: ErrorCode.SESSION_IN_PROGRESS,
          message: 'Bạn đang có một bài thi chưa hoàn thành.',
          details: { sessionId: activeSession.id },
        });
      }
    }

    const sessionId = randomUUID();
    const thetaInit = this.configService.get<number>('cat.thetaInit') ?? -0.5;

    const session = new TestSessionEntity(
      sessionId,
      user.id,
      examRoundId,
      SessionStatus.IN_PROGRESS,
      null,
      null,
      null,
      now,
      null,
      [],
      expiresAt,
    );
    await this.sessionRepository.create(session);

    await this.cacheService.setState(sessionId, {
      state: 'READY_FOR_NEXT',
      currentItemId: null,
      theta: thetaInit,
      se: 1.0,
      lastSkillPicked: null,
      itemsAdministered: [],
      lastUpdated: new Date().toISOString(),
    });

    return { sessionId, expiresAt };
  }
}
