import { Injectable, NotFoundException } from '@nestjs/common';
import {
  CEFRLevel,
  ErrorCode,
  ExamRoundStatus,
  ItemBatchStatus,
  ItemStatus,
  SessionStatus,
} from '@apt/shared-types';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { effectiveStatus } from '../../../exam-round/domain/effective-status';
import {
  CefrCounts,
  ItemStatusCounts,
  OpenExamRoundSummary,
  SystemOverviewEntity,
} from '../../domain/entities/system-overview.entity';

/** Lô đang chờ Admin hành động (`IN_REVIEW` chờ GV nên không tính) — SRS 9b.19. */
export const BATCH_STATUSES_NEEDING_ACTION = [
  ItemBatchStatus.READY_TO_ASSIGN,
  ItemBatchStatus.READY_TO_FINALIZE,
  ItemBatchStatus.FAILED,
  ItemBatchStatus.PARTIAL,
  ItemBatchStatus.PARTIALLY_IMPORTED,
] as const;

const zeroCounts = <K extends string>(keys: K[]): Record<K, number> =>
  Object.fromEntries(keys.map((key) => [key, 0])) as Record<K, number>;

/**
 * Tổng quan hệ thống cho Admin: 4 số, phân phối CEFR, thống kê 6 trạng thái câu,
 * bảng kỳ thi đang mở (SRS 9b.19). Chỉ đọc; `now` truyền vào để test được.
 */
@Injectable()
export class GetSystemOverviewUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(
    examRoundId?: string,
    now: Date = new Date(),
  ): Promise<SystemOverviewEntity> {
    if (examRoundId) {
      const round = await this.prisma.examRound.findUnique({
        where: { id: examRoundId },
        select: { id: true },
      });
      if (!round) {
        throw new NotFoundException({
          code: ErrorCode.NOT_FOUND,
          message: 'Không tìm thấy kỳ thi.',
        });
      }
    }

    const sessionWhere = {
      status: SessionStatus.COMPLETED as never,
      ...(examRoundId ? { examRoundId } : {}),
    };

    const [
      completedStudents,
      latestProfiles,
      itemGroups,
      batchesNeedingAction,
      candidateRounds,
    ] = await Promise.all([
      this.prisma.testSession.groupBy({
        by: ['studentId'],
        where: sessionWhere,
      }),
      // Mức CEFR mới nhất của mỗi SV (mỗi SV một lần), trong phạm vi kỳ nếu có lọc.
      this.prisma.languageProfile.findMany({
        where: examRoundId ? { testSession: { examRoundId } } : {},
        orderBy: { completedAt: 'desc' },
        distinct: ['studentId'],
        select: { cefrLevel: true },
      }),
      this.prisma.item.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.itemBatch.count({
        where: {
          status: { in: [...BATCH_STATUSES_NEEDING_ACTION] as never[] },
        },
      }),
      this.prisma.examRound.findMany({
        where: {
          status: {
            in: [ExamRoundStatus.SCHEDULED, ExamRoundStatus.OPEN] as never[],
          },
          opensAt: { lte: now },
          closesAt: { gt: now },
        },
        orderBy: { opensAt: 'asc' },
        select: {
          id: true,
          name: true,
          status: true,
          opensAt: true,
          closesAt: true,
          durationMinutes: true,
          _count: { select: { participants: true } },
          sessions: { select: { studentId: true, status: true } },
        },
      }),
    ]);

    const cefrDistribution: CefrCounts = zeroCounts(Object.values(CEFRLevel));
    for (const profile of latestProfiles) {
      cefrDistribution[profile.cefrLevel as CEFRLevel] += 1;
    }

    const itemStatusCounts: ItemStatusCounts = zeroCounts(
      Object.values(ItemStatus),
    );
    for (const group of itemGroups) {
      itemStatusCounts[group.status as ItemStatus] = group._count._all;
    }

    // Nguồn duy nhất về trạng thái kỳ là effectiveStatus (BR-10), không đọc cột `status`.
    const openRounds: OpenExamRoundSummary[] = candidateRounds
      .filter((round) => effectiveStatus(round, now) === ExamRoundStatus.OPEN)
      .map((round) => {
        const completed = new Set(
          round.sessions
            .filter((s) => s.status === SessionStatus.COMPLETED)
            .map((s) => s.studentId),
        );
        const inProgress = new Set(
          round.sessions
            .filter(
              (s) =>
                s.status === SessionStatus.IN_PROGRESS &&
                !completed.has(s.studentId),
            )
            .map((s) => s.studentId),
        );
        const participantCount = round._count.participants;
        return {
          id: round.id,
          name: round.name,
          opensAt: round.opensAt,
          closesAt: round.closesAt,
          durationMinutes: round.durationMinutes,
          participantCount,
          notStarted: Math.max(
            0,
            participantCount - completed.size - inProgress.size,
          ),
          inProgress: inProgress.size,
          completed: completed.size,
        };
      });

    return new SystemOverviewEntity(
      examRoundId ?? null,
      completedStudents.length,
      itemStatusCounts[ItemStatus.FINAL_APPROVED],
      batchesNeedingAction,
      openRounds.length,
      cefrDistribution,
      itemStatusCounts,
      openRounds,
      now,
    );
  }
}
