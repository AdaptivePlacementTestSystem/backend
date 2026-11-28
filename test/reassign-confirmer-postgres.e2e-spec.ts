import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ReassignConfirmerUseCase } from '../src/modules/item-generation/application/reassign-confirmer.use-case';
import { ReviewNoticeOutboxWorker } from '../src/modules/item-generation/application/review-notice-outbox.worker';
import { TeacherReviewUseCase } from '../src/modules/item-generation/application/teacher-review.use-case';
import { TeacherItemAccess } from '../src/modules/item-bank/application/services/teacher-item-access';

const url = process.env.Q1Q8_TEST_DATABASE_URL ?? '';
const safe =
  /^postgresql:\/\/[^@]+@127\.0\.0\.1:63655\/apt_ai_review_[0-9a-f]{8}\?schema=public$/.test(
    url,
  );
describe.skipIf(!safe)(
  'confirmer reassignment and outbox on isolated PostgreSQL',
  () => {
    const db = new PrismaClient({ datasources: { db: { url } } });
    const admin = randomUUID(),
      a = randomUUID(),
      oldB = randomUUID(),
      newB = randomUUID(),
      batch = randomUUID(),
      first = randomUUID();
    beforeAll(async () => {
      if (await db.reviewNoticeOutbox.count({ where: { status: 'PENDING' } }))
        throw new Error('Outbox test requires an empty dedicated test queue');
      await db.user.createMany({
        data: [admin, a, oldB, newB].map((id, index) => ({
          id,
          email: `${id}@example.test`,
          fullName: id,
          role: index ? 'TEACHER' : 'ADMIN',
        })),
      });
      await db.itemBatch.create({
        data: {
          id: batch,
          source: 'IMPORTED',
          createdById: admin,
          status: 'IN_REVIEW',
          confirmerId: oldB,
        },
      });
      await db.item.createMany({
        data: ['DRAFT', 'FIRST_APPROVED'].map((status, index) => ({
          id: index ? first : randomUUID(),
          batchId: batch,
          reviewerId: a,
          content: `Synthetic ${index}`,
          options: { A: 'a', B: 'b', C: 'c', D: 'd' },
          correctAnswer: 'A',
          skill: 'GRAMMAR',
          cefrTarget: 'A2',
          irtB: 0,
          status: status as 'DRAFT' | 'FIRST_APPROVED',
          secondReview: { dueAt: '2099-01-01T00:00:00Z' },
          secondAssignmentNoticeSent: true,
          secondReminderSent: true,
        })),
      });
    });
    afterAll(async () => {
      await db.itemReviewEvent.deleteMany({ where: { batchId: batch } });
      await db.item.deleteMany({ where: { batchId: batch } });
      await db.itemBatch.deleteMany({ where: { id: batch } });
      await db.user.deleteMany({
        where: { id: { in: [admin, a, oldB, newB] } },
      });
      await db.$disconnect();
    });
    it('changes B atomically, revokes old B and records one pending notice', async () => {
      const service = new ReassignConfirmerUseCase(db as never);
      await expect(
        service.execute(batch, admin, { toConfirmerId: a, reason: 'test' }),
      ).rejects.toThrow();
      await expect(
        service.execute(batch, admin, { toConfirmerId: newB, reason: ' ' }),
      ).rejects.toThrow();
      expect(
        await service.execute(batch, admin, {
          toConfirmerId: newB,
          reason: 'Đổi người xác nhận',
        }),
      ).toEqual({ confirmerId: newB, affected: 2 });
      const review = new TeacherReviewUseCase(db as never);
      await expect(review.decide(oldB, first, 'CONFIRM')).rejects.toThrow();
      expect((await review.list(newB)).map((item) => item.id)).toContain(first);
      const access = new TeacherItemAccess(db as never);
      expect(await access.allowedIds(oldB)).not.toContain(first);
      expect(await access.allowedIds(newB)).toContain(first);
      expect(
        await db.reviewNoticeOutbox.count({
          where: { batchId: batch, recipientId: newB, status: 'PENDING' },
        }),
      ).toBe(1);
      const event = await db.itemReviewEvent.findFirstOrThrow({
        where: { batchId: batch, action: 'REASSIGN_CONFIRMER' },
      });
      expect(event.itemId).toBeNull();
      expect(event.details).toMatchObject({
        fromConfirmerId: oldB,
        toConfirmerId: newB,
        reason: 'Đổi người xác nhận',
      });
    });
    it('retries failed delivery and sends at most once concurrently', async () => {
      const mail = {
        sendMail: vi
          .fn()
          .mockRejectedValueOnce(new Error('fake SMTP unavailable'))
          .mockResolvedValue(true),
      };
      const one = new ReviewNoticeOutboxWorker(db as never, mail as never),
        two = new ReviewNoticeOutboxWorker(db as never, mail as never);
      await one.processOne();
      const pending = await db.reviewNoticeOutbox.findFirstOrThrow({
        where: { batchId: batch },
      });
      expect(pending).toMatchObject({ status: 'PENDING', attempts: 1 });
      await db.reviewNoticeOutbox.update({
        where: { id: pending.id },
        data: { availableAt: new Date('2000-01-01T00:00:00Z') },
      });
      await Promise.all([one.processOne(), two.processOne()]);
      expect(mail.sendMail).toHaveBeenCalledTimes(2);
      expect(
        (
          await db.reviewNoticeOutbox.findUniqueOrThrow({
            where: { id: pending.id },
          })
        ).status,
      ).toBe('SENT');
      expect(
        await db.item.count({
          where: { batchId: batch, secondAssignmentNoticeSent: false },
        }),
      ).toBe(0);
    });
  },
);
