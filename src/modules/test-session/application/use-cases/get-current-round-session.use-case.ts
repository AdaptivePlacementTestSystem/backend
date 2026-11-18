import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { RedisSessionCacheService } from '../../infrastructure/cache/redis-session-cache.service';
import { SessionCleanupService } from '../services/session-cleanup.service';
import type { IItemRepository } from '../../../item-bank/domain/repositories/item.repository.interface';
import {
  SessionStatus,
  StoppingReason,
} from '../../domain/entities/test-session.entity';

export interface CurrentRoundSessionDto {
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED';
  sessionId?: string;
  examRoundId?: string;
  startedAt?: Date;
  expiresAt?: Date;
  serverTime?: Date;
  itemCount?: number;
  maxItems?: number;
  currentItem?: {
    id: string;
    content: string;
    options: any;
    skill: string;
  } | null;
  completedAt?: Date | null;
  stoppingReason?: string | null;
  isExpired?: boolean;
}

@Injectable()
export class GetCurrentRoundSessionUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly cacheService: RedisSessionCacheService,
    private readonly sessionCleanupService: SessionCleanupService,
    @Inject('IItemRepository')
    private readonly itemRepository: IItemRepository,
  ) {}

  async execute(
    roundId: string,
    userId: string,
    userRole?: string,
  ): Promise<CurrentRoundSessionDto> {
    // 1. Kiểm tra kỳ thi tồn tại
    const round = await this.prisma.examRound.findUnique({
      where: { id: roundId },
    });
    if (!round) {
      throw new NotFoundException('Không tìm thấy kỳ thi');
    }

    // 2. Kiểm tra quyền thí sinh tham gia kỳ thi (nếu là Sinh viên)
    if (userRole !== 'ADMIN') {
      const participant = await this.prisma.examRoundParticipant.findUnique({
        where: {
          roundId_studentId: { roundId, studentId: userId },
        },
      });
      if (!participant) {
        throw new ForbiddenException(
          'Bạn không thuộc danh sách thí sinh của kỳ thi này',
        );
      }
    }

    // 3. Tìm phiên thi gần nhất của thí sinh cho kỳ này
    const session = await this.prisma.testSession.findFirst({
      where: {
        studentId: userId,
        examRoundId: roundId,
      },
      include: {
        responses: {
          orderBy: { answeredAt: 'asc' },
        },
      },
      orderBy: { startedAt: 'desc' },
    });

    if (!session) {
      return {
        status: 'NOT_STARTED',
      };
    }

    if (session.status === SessionStatus.COMPLETED) {
      return {
        status: 'COMPLETED',
        sessionId: session.id,
        examRoundId: session.examRoundId,
        completedAt: session.completedAt,
        stoppingReason: session.stoppingReason,
      };
    }

    if (session.status === SessionStatus.ABANDONED) {
      return {
        status: 'ABANDONED',
        sessionId: session.id,
        examRoundId: session.examRoundId,
        completedAt: session.completedAt,
        stoppingReason: session.stoppingReason,
      };
    }

    // 4. Phiên IN_PROGRESS -> Kiểm tra Lazy Cleanup K5 qua SessionCleanupService
    const maxItems = this.configService.get<number>('cat.maxItems') ?? 25;
    const cleanupResult =
      await this.sessionCleanupService.cleanupIfExpired(session);

    if (cleanupResult.isExpired) {
      return {
        status: cleanupResult.status as any,
        sessionId: session.id,
        examRoundId: session.examRoundId,
        isExpired: true,
        stoppingReason: cleanupResult.stoppingReason ?? StoppingReason.TIMEOUT,
      };
    }

    // 5. Phiên IN_PROGRESS còn hạn -> Đọc cache lấy câu hỏi hiện tại
    let cacheState = await this.cacheService.getState(session.id);
    if (!cacheState) {
      const responses = session.responses;
      const lastResponse =
        responses.length > 0 ? responses[responses.length - 1] : null;

      cacheState = {
        state: 'READY_FOR_NEXT',
        currentItemId: null,
        theta: lastResponse ? lastResponse.thetaAfter : -0.5,
        se: lastResponse ? lastResponse.seAfter : 1.0,
        lastSkillPicked: null,
        itemsAdministered: responses.map((r) => r.itemId),
        lastUpdated: new Date().toISOString(),
      };
      await this.cacheService.setState(session.id, cacheState);
    }

    let currentItem: any = null;
    if (cacheState.currentItemId) {
      const itemEntity = await this.itemRepository.findById(
        cacheState.currentItemId,
      );
      if (itemEntity) {
        currentItem = {
          id: itemEntity.id,
          content: itemEntity.content,
          options: itemEntity.options,
          skill: itemEntity.skill,
        };
      }
    }

    return {
      status: 'IN_PROGRESS',
      sessionId: session.id,
      examRoundId: session.examRoundId,
      startedAt: session.startedAt,
      expiresAt: session.expiresAt,
      serverTime: new Date(),
      itemCount: session.responses.length,
      maxItems,
      currentItem,
    };
  }
}
