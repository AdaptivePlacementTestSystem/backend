import { PrismaClient } from '@prisma/client';
import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AssignBatchUseCase } from '../src/modules/item-generation/application/assign-batch.use-case';
import { AssignmentPreviewUseCase } from '../src/modules/item-generation/application/assignment-preview.use-case';
import { TeacherReviewUseCase } from '../src/modules/item-generation/application/teacher-review.use-case';
import { ReassignBatchUseCase } from '../src/modules/item-generation/application/reassign-batch.use-case';
import { UpdateBatchDeadlinesUseCase } from '../src/modules/item-generation/application/update-batch-deadlines.use-case';
import { ImportBatchUseCase } from '../src/modules/item-generation/application/import-batch.use-case';
import { DecideFlagUseCase } from '../src/modules/item-generation/application/decide-flag.use-case';

// Run only against an explicitly supplied disposable database after migrations.
const databaseUrl = process.env.Q1Q8_TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)('Q1–Q8 on PostgreSQL', () => {
  const users: string[] = [];
  const batches: string[] = [];
  let db: PrismaClient;
  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.$connect();
  });
  afterAll(async () => {
    if (!db) return;
    await db.itemReviewEvent.deleteMany({
      where: { batchId: { in: batches } },
    });
    await db.itemCheckResult.deleteMany({
      where: { item: { batchId: { in: batches } } },
    });
    await db.item.deleteMany({ where: { batchId: { in: batches } } });
    await db.itemBatch.deleteMany({ where: { id: { in: batches } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.$disconnect();
  });
  async function user(role: 'ADMIN' | 'TEACHER') {
    const id = randomUUID();
    users.push(id);
    await db.user.create({
      data: { id, email: `${id}@example.test`, fullName: id, role },
    });
    return id;
  }
  async function batch(
    admin: string,
    status: 'READY_TO_ASSIGN' | 'IN_REVIEW' | 'FINAL_CHECKED',
    confirmerId?: string,
  ) {
    const id = randomUUID();
    batches.push(id);
    await db.itemBatch.create({
      data: { id, source: 'IMPORTED', createdById: admin, status, confirmerId },
    });
    return id;
  }
  async function item(
    batchId: string,
    status: 'DRAFT' | 'FIRST_APPROVED' | 'SECOND_APPROVED',
    reviewerId?: string,
  ) {
    const id = randomUUID();
    const contentHash = randomBytes(32).toString('hex');
    await db.item.create({
      data: {
        id,
        batchId,
        reviewerId,
        content: randomBytes(64).toString('hex'),
        contentHash,
        options: { A: 'a', B: 'b', C: 'c', D: 'd' },
        correctAnswer: 'A',
        skill: 'GRAMMAR',
        cefrTarget: 'B1',
        irtB: 0,
        status,
      },
    });
    return { id, contentHash };
  }
  it('assigns, exposes A approval immediately, reassigns DRAFT and audits deadlines', async () => {
    const admin = await user('ADMIN'),
      a = await user('TEACHER'),
      b = await user('TEACHER'),
      replacement = await user('TEACHER');
    const id = await batch(admin, 'READY_TO_ASSIGN');
    const first = await item(id, 'DRAFT'),
      second = await item(id, 'DRAFT');
    const preview = await new AssignmentPreviewUseCase(db as never).execute(
      id,
      [a],
    );
    await new AssignBatchUseCase(db as never).execute(id, admin, {
      confirmerId: b,
      firstDueAt: '2099-01-01T00:00:00Z',
      secondDueAt: '2099-01-02T00:00:00Z',
      batchRevision: preview.batchRevision,
      assignments: preview.assignments.map(({ itemId, reviewerId }) => ({
        itemId,
        reviewerId,
      })),
    });
    const review = new TeacherReviewUseCase(db as never);
    await review.decide(a, first.id, 'APPROVE');
    expect((await review.list(b)).map((entry) => entry.id)).toContain(first.id);
    expect(await review.confirmAll(b, id)).toEqual({ confirmed: 1 });
    const event = await db.itemReviewEvent.findFirstOrThrow({
      where: { batchId: id, action: 'CONFIRM_ALL' },
    });
    expect(event.itemId).toBeNull();
    expect(event.details).toEqual({ updatedCount: 1, itemIds: [first.id] });
    expect(
      await new ReassignBatchUseCase(db as never).execute(id, admin, {
        fromAssigneeId: a,
        toAssigneeId: replacement,
        reason: 'test reassignment',
      }),
    ).toEqual({ reassigned: 1 });
    expect(
      (await db.item.findUniqueOrThrow({ where: { id: second.id } }))
        .reviewerId,
    ).toBe(replacement);
    await new UpdateBatchDeadlinesUseCase(db as never).execute(id, admin, {
      firstDueAt: '2099-02-01T00:00:00Z',
      secondDueAt: '2099-02-02T00:00:00Z',
      reason: 'test',
    });
    const deadline = await db.itemReviewEvent.findFirstOrThrow({
      where: { batchId: id, action: 'UPDATE_DUE_DATE' },
    });
    expect(deadline.itemId).toBeNull();
    expect(deadline.details).toMatchObject({
      actorId: admin,
      reason: 'test',
      updatedCount: 1,
      itemIds: [second.id],
      oldDueDates: [
        {
          itemId: second.id,
          firstDueAt: '2099-01-01T00:00:00.000Z',
          secondDueAt: '2099-01-02T00:00:00.000Z',
        },
      ],
      newDueDates: {
        firstDueAt: '2099-02-01T00:00:00.000Z',
        secondDueAt: '2099-02-02T00:00:00.000Z',
      },
    });
    await review.decide(replacement, second.id, 'REJECT', 'test');
    await expect(
      new ReassignBatchUseCase(db as never).execute(id, admin, {
        fromAssigneeId: replacement,
        toAssigneeId: a,
        reason: 'test reassignment',
      }),
    ).rejects.toThrow();
  });
  it('records one batch audit under concurrent confirm-all', async () => {
    const admin = await user('ADMIN'),
      a = await user('TEACHER'),
      b = await user('TEACHER');
    const id = await batch(admin, 'IN_REVIEW', b);
    await item(id, 'FIRST_APPROVED', a);
    await item(id, 'FIRST_APPROVED', a);
    const review = new TeacherReviewUseCase(db as never);
    const result = await Promise.allSettled([
      review.confirmAll(b, id),
      review.confirmAll(b, id),
    ]);
    expect(result.filter((entry) => entry.status === 'fulfilled')).toHaveLength(
      1,
    );
    expect(
      await db.itemReviewEvent.count({
        where: { batchId: id, action: 'CONFIRM_ALL' },
      }),
    ).toBe(1);
    expect(
      await db.item.count({
        where: { batchId: id, status: 'SECOND_APPROVED' },
      }),
    ).toBe(2);
  });
  it('imports only once when two admins finalize the same batch concurrently', async () => {
    const admin = await user('ADMIN');
    const otherAdmin = await user('ADMIN');
    const id = await batch(admin, 'FINAL_CHECKED');
    const candidate = await item(id, 'SECOND_APPROVED');
    await db.itemCheckResult.create({
      data: {
        itemId: candidate.id,
        checkpoint: 'C3',
        contentHash: candidate.contentHash,
        level: 'PASS',
        reasonCodes: ['INDEPENDENT_ANSWER_CHECKED'],
      },
    });
    const importer = new ImportBatchUseCase(db as never);
    const attempts = await Promise.allSettled([
      importer.execute(id, admin),
      importer.execute(id, otherAdmin),
    ]);
    expect(
      attempts.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const rejected = attempts.find((result) => result.status === 'rejected');
    expect(rejected?.status === 'rejected' && rejected.reason.getStatus()).toBe(
      409,
    );
    expect(
      await db.itemReviewEvent.count({
        where: { batchId: id, itemId: candidate.id, action: 'IMPORT' },
      }),
    ).toBe(1);
    expect(
      (await db.item.findUniqueOrThrow({ where: { id: candidate.id } })).status,
    ).toBe('FINAL_APPROVED');
    await db.item.update({
      where: { id: candidate.id },
      data: { status: 'REJECTED' },
    });
  });
  it('imports eligible items while a soft flag remains and finishes after acceptance', async () => {
    const admin = await user('ADMIN');
    const id = await batch(admin, 'FINAL_CHECKED');
    const ready = await item(id, 'SECOND_APPROVED'),
      flagged = await item(id, 'SECOND_APPROVED');
    for (const entry of [ready, flagged])
      await db.itemCheckResult.create({
        data: {
          itemId: entry.id,
          checkpoint: 'C3',
          contentHash: entry.contentHash,
          level: 'PASS',
          reasonCodes: ['INDEPENDENT_ANSWER_CHECKED'],
          checkedAt: new Date(Date.now() - 5000),
        },
      });
    await db.itemCheckResult.create({
      data: {
        itemId: flagged.id,
        checkpoint: 'C3',
        contentHash: flagged.contentHash,
        level: 'SOFT',
        reasonCodes: ['TEST_WARNING'],
        checkedAt: new Date(Date.now() - 1000),
      },
    });
    const importer = new ImportBatchUseCase(db as never);
    expect(await importer.execute(id, admin)).toEqual({
      status: 'PARTIALLY_IMPORTED',
      imported: 1,
    });
    expect(
      (await db.item.findUniqueOrThrow({ where: { id: flagged.id } })).status,
    ).toBe('SECOND_APPROVED');
    const otherBatch = await batch(admin, 'FINAL_CHECKED');
    const newBankItem = await item(otherBatch, 'SECOND_APPROVED');
    await db.item.update({
      where: { id: newBankItem.id },
      data: {
        status: 'FINAL_APPROVED',
        approvedAt: new Date(),
        approvedById: admin,
      },
    });
    await expect(importer.execute(id, admin)).rejects.toThrow(
      /thay đổi sau C3/,
    );
    await db.item.update({
      where: { id: newBankItem.id },
      data: { status: 'REJECTED' },
    });
    await new DecideFlagUseCase(db as never).execute(
      id,
      flagged.id,
      admin,
      'IMPORT',
    );
    expect(await importer.execute(id, admin)).toEqual({
      status: 'DONE',
      imported: 1,
    });
  });
});
