import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ErrorCode, ItemBatchStatus, ItemStatus } from '@apt/shared-types';

/**
 * Khóa hàng ItemBatch trong transaction và xác minh lô đang ở trạng thái IN_REVIEW
 * (cùng kiểm tra confirmerId nếu đang thao tác phía GV vai B).
 */
export async function lockAndAssertBatchInReview(
  tx: any,
  batchId: string,
  expectedConfirmerId?: string,
): Promise<void> {
  if (typeof tx.$queryRaw === 'function') {
    await tx.$queryRaw`SELECT id FROM item_batches WHERE id = ${batchId}::uuid FOR UPDATE`;
  }

  const batch = await tx.itemBatch.findUnique({
    where: { id: batchId },
    select: { id: true, status: true, confirmerId: true },
  });

  if (!batch) {
    throw new NotFoundException(`Không tìm thấy lô câu hỏi: ${batchId}`);
  }

  if (batch.status !== ItemBatchStatus.IN_REVIEW) {
    throw new ConflictException({
      code: ErrorCode.CONFLICT,
      message: 'Lô câu hỏi không còn ở trạng thái đang duyệt (IN_REVIEW).',
    });
  }

  if (
    expectedConfirmerId !== undefined &&
    batch.confirmerId !== expectedConfirmerId
  ) {
    throw new ForbiddenException({
      code: ErrorCode.NOT_ASSIGNED,
      message:
        'Bạn không còn được phân công xác nhận câu hỏi trong lô này (NOT_ASSIGNED)',
    });
  }
}

/**
 * WP-6.1: Khi hết câu chờ xử lý (DRAFT / FIRST_APPROVED), chuyển lô sang
 * READY_TO_FINALIZE nếu còn ít nhất 1 câu SECOND_APPROVED; ngược lại chuyển thẳng DONE.
 */
export async function finalizeBatchIfNoPending(
  tx: any,
  batchId: string,
  excludeItemId?: string,
): Promise<boolean> {
  const remainingUnfinished = await tx.item.count({
    where: {
      batchId,
      ...(excludeItemId ? { id: { not: excludeItemId } } : {}),
      status: {
        in: [ItemStatus.DRAFT, ItemStatus.FIRST_APPROVED],
      },
    },
  });

  if (remainingUnfinished > 0) {
    return false;
  }

  const secondApprovedCount = await tx.item.count({
    where: {
      batchId,
      status: ItemStatus.SECOND_APPROVED,
    },
  });

  await tx.itemBatch.update({
    where: { id: batchId },
    data: {
      status:
        secondApprovedCount > 0
          ? ItemBatchStatus.READY_TO_FINALIZE
          : ItemBatchStatus.DONE,
    },
  });

  return true;
}
