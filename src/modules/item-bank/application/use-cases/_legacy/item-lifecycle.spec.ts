// VÔ HIỆU HÓA (DC-32, #106): CRUD câu hỏi bằng form đã bỏ; câu hỏi chỉ vào hệ thống qua lô (AI sinh / import file).
// Giữ làm tham khảo cho luồng duyệt A/B ở đợt module lô/gói; KHÔNG biên dịch (loại khỏi tsconfig, vitest). Import tương đối đã lệch một cấp.
import { describe, it, expect, vi } from 'vitest';
import { CloneItemUseCase } from './clone-item.use-case';
import { UpdateItemUseCase } from './update-item.use-case';
import { DeleteItemUseCase } from './delete-item.use-case';
import { ItemEntity } from '../../domain/entities/item.entity';
import { ItemStatus, Skill, CEFRLevel } from '@apt/shared-types';
import { BadRequestException, ConflictException } from '@nestjs/common';

describe('Item Lifecycle: Clone, Update, Delete Rules (Quyết định #64 & #75, SRS v3.0)', () => {
  const sampleApprovedItem = new ItemEntity(
    'item-1',
    'Sample question',
    { A: 'opt1', B: 'opt2', C: 'opt3', D: 'opt4' },
    'A',
    Skill.VOCABULARY,
    CEFRLevel.B1,
    -0.2,
    1.0,
    0.25,
    ItemStatus.FINAL_APPROVED,
    'batch-1',
    null,
    'hash-1',
    'grammar-tense',
    'teacher-1',
    new Date(),
    10, // timesUsed > 0
    true, // calibrated
  );

  const sampleDraftItem = new ItemEntity(
    'item-2',
    'Draft question',
    { A: 'opt1', B: 'opt2', C: 'opt3', D: 'opt4' },
    'B',
    Skill.GRAMMAR,
    CEFRLevel.A2,
    -1.0,
    1.0,
    0.25,
    ItemStatus.DRAFT,
    'batch-1',
    null,
    'hash-2',
    null,
    null,
    null,
    0,
    false,
  );

  describe('CloneItemUseCase', () => {
    it('nhân bản câu hỏi gốc thành câu mới ở trạng thái DRAFT và reset timesUsed, calibrated', async () => {
      const mockRepo = {
        findById: vi.fn().mockResolvedValue(sampleApprovedItem),
        save: vi.fn().mockImplementation((item) => Promise.resolve(item)),
      };
      const mockPrisma = {
        explanation: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({}),
        },
      };

      const cloneUseCase = new CloneItemUseCase(
        mockRepo as any,
        mockPrisma as any,
      );
      const cloned = await cloneUseCase.execute('item-1');

      expect(cloned.id).not.toBe('item-1');
      expect(cloned.content).toBe(sampleApprovedItem.content);
      expect(cloned.status).toBe(ItemStatus.DRAFT);
      expect(cloned.timesUsed).toBe(0);
      expect(cloned.calibrated).toBe(false);
      expect(cloned.approvedById).toBeNull();
      expect(cloned.approvedAt).toBeNull();
    });
  });

  describe('UpdateItemUseCase', () => {
    it('CẤM sửa câu hỏi đã FINAL_APPROVED (ném BadRequestException theo Quyết định #64)', async () => {
      const mockRepo = {
        findById: vi.fn().mockResolvedValue(sampleApprovedItem),
        save: vi.fn(),
      };

      const updateUseCase = new UpdateItemUseCase(mockRepo as any);
      await expect(
        updateUseCase.execute('item-1', { content: 'New content' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('cho phép sửa câu hỏi ở trạng thái DRAFT', async () => {
      const mockRepo = {
        findById: vi.fn().mockResolvedValue(sampleDraftItem),
        save: vi.fn().mockImplementation((item) => Promise.resolve(item)),
      };

      const updateUseCase = new UpdateItemUseCase(mockRepo as any);
      const updated = await updateUseCase.execute('item-2', {
        content: 'Updated draft content',
      });

      expect(updated.content).toBe('Updated draft content');
      expect(mockRepo.save).toHaveBeenCalled();
    });
  });

  describe('DeleteItemUseCase', () => {
    it('CẤM xóa câu hỏi đã FINAL_APPROVED hoặc đã có response trong kỳ thi (ném ConflictException)', async () => {
      const mockRepo = {
        findById: vi.fn().mockResolvedValue(sampleApprovedItem),
      };
      const mockPrisma = {
        sessionResponse: {
          count: vi.fn().mockResolvedValue(5),
        },
      };

      const deleteUseCase = new DeleteItemUseCase(
        mockRepo as any,
        mockPrisma as any,
      );
      await expect(deleteUseCase.execute('item-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('cho phép xóa câu DRAFT chưa từng làm bài', async () => {
      const mockRepo = {
        findById: vi.fn().mockResolvedValue(sampleDraftItem),
      };
      const mockPrisma = {
        sessionResponse: {
          count: vi.fn().mockResolvedValue(0),
        },
        explanation: {
          deleteMany: vi.fn().mockResolvedValue({}),
        },
        item: {
          delete: vi.fn().mockResolvedValue({}),
        },
      };

      const deleteUseCase = new DeleteItemUseCase(
        mockRepo as any,
        mockPrisma as any,
      );
      await expect(deleteUseCase.execute('item-2')).resolves.toBeUndefined();
      expect(mockPrisma.item.delete).toHaveBeenCalledWith({
        where: { id: 'item-2' },
      });
    });
  });
});
