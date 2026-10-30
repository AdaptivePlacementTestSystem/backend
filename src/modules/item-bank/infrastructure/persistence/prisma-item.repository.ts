import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import {
  IItemRepository,
  ItemFilterOptions,
} from '../../domain/repositories/item.repository.interface';
import { ItemEntity, OptionMap } from '../../domain/entities/item.entity';
import { Skill, CEFRLevel, ItemStatus } from '@apt/shared-types';

@Injectable()
export class PrismaItemRepository implements IItemRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<ItemEntity | null> {
    const raw = await this.prisma.item.findUnique({ where: { id } });
    return raw ? this.toDomain(raw) : null;
  }

  async findAll(options?: ItemFilterOptions): Promise<ItemEntity[]> {
    const where: any = {};
    if (options?.status) where.status = options.status;
    if (options?.skill) where.skill = options.skill;

    const items = await this.prisma.item.findMany({
      where,
      take: options?.limit,
      skip: options?.offset,
      orderBy: { createdAt: 'desc' },
    });

    return items.map((i: any) => this.toDomain(i));
  }

  async incrementTimesUsed(id: string): Promise<void> {
    await this.prisma.item.update({
      where: { id },
      data: { timesUsed: { increment: 1 } },
    });
  }

  /**
   * Phương án A7 đã chốt (SRS v3.0):
   * CAT chỉ chọn các câu có status = 'FINAL_APPROVED'.
   * 1. Query lấy { id, irtB } các item FINAL_APPROVED, đúng skill, chưa nằm trong usedIds.
   * 2. Sắp xếp theo |irtB - theta| trong bộ nhớ, lấy Top-5 id.
   * 3. Query lấy chi tiết các item theo 5 id đó.
   */
  async findForCAT(
    skill: Skill,
    usedIds: string[],
    theta: number,
    limit: number = 5,
  ): Promise<ItemEntity[]> {
    const candidates = await this.prisma.item.findMany({
      where: {
        status: 'FINAL_APPROVED',
        skill: skill as any,
        id: usedIds.length > 0 ? { notIn: usedIds } : undefined,
      },
      select: {
        id: true,
        irtB: true,
      },
    });

    if (candidates.length === 0) {
      return [];
    }

    candidates.sort(
      (a: { id: string; irtB: number }, b: { id: string; irtB: number }) => {
        const distA = Math.abs(a.irtB - theta);
        const distB = Math.abs(b.irtB - theta);
        if (Math.abs(distA - distB) < 1e-6) {
          return a.id.localeCompare(b.id);
        }
        return distA - distB;
      },
    );

    const topIds = candidates
      .slice(0, limit)
      .map((c: { id: string; irtB: number }) => c.id);

    const fullItems = await this.prisma.item.findMany({
      where: {
        id: { in: topIds },
      },
    });

    return fullItems.map((item: any) => this.toDomain(item));
  }

  private toDomain(raw: any): ItemEntity {
    return new ItemEntity(
      raw.id,
      raw.content,
      raw.options as OptionMap,
      raw.correctAnswer,
      raw.skill as Skill,
      raw.cefrTarget as CEFRLevel,
      raw.irtB,
      raw.irtA,
      raw.irtC,
      raw.status as ItemStatus,
      raw.batchId,
      raw.packageId,
      raw.contentHash,
      raw.topicTag,
      raw.approvedById,
      raw.approvedAt,
      raw.timesUsed,
      raw.calibrated,
      raw.createdAt,
      raw.updatedAt,
    );
  }
}
