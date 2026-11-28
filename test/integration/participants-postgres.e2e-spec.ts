import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expectContract } from './admin-exam-contract.helper';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { ListRoundParticipantsUseCase } from '../../src/modules/exam-round/application/use-cases/list-round-participants.use-case';
import { AdminExamRoundsUseCase } from '../../src/modules/exam-round/application/use-cases/admin-exam-rounds.use-case';
import { Workbook } from 'exceljs';

const url = process.env.ADMIN_TEST_DATABASE_URL;
const parsed = url ? new URL(url) : undefined;
if (
  parsed &&
  (!['127.0.0.1', 'localhost'].includes(parsed.hostname) ||
    parsed.pathname !== '/apt_admin_test')
)
  throw new Error('Use isolated local apt_admin_test only');
const suite = url ? describe : describe.skip;
suite('participant monitoring in PostgreSQL', () => {
  const prisma = new PrismaService({ datasourceUrl: url });
  const service = new ListRoundParticipantsUseCase(prisma);
  const admin = randomUUID();
  const students = Array.from({ length: 5 }, () => randomUUID());
  const round = randomUUID();
  const otherRound = randomUUID();
  const prefix = randomUUID().slice(0, 8);
  beforeAll(async () => {
    await prisma.$connect();
    await prisma.user.create({
      data: {
        id: admin,
        email: `${admin}@example.test`,
        fullName: 'Admin',
        role: 'ADMIN',
      },
    });
    await prisma.user.createMany({
      data: students.map((id, i) => ({
        id,
        email: `${id}@example.test`,
        fullName: `Sinh viên ${i}`,
        role: 'STUDENT' as const,
      })),
    });
    await prisma.studentProfile.createMany({
      data: students.map((id, i) => ({
        userId: id,
        studentCode: `${prefix}-${i}`,
      })),
    });
    const now = Date.now();
    const roundData = (id: string) => ({
      id,
      name: 'Test',
      createdById: admin,
      status: 'CLOSED' as const,
      opensAt: new Date(now - 7200000),
      closesAt: new Date(now - 3600000),
      durationMinutes: 45,
    });
    await prisma.examRound.create({ data: roundData(round) });
    await prisma.examRound.create({ data: roundData(otherRound) });
    await prisma.examRoundParticipant.createMany({
      data: [
        ...students
          .slice(0, 4)
          .map((studentId) => ({ roundId: round, studentId })),
        { roundId: otherRound, studentId: students[4] },
      ],
    });
    const session = (
      studentId: string,
      status: 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED',
      startedAt: number,
    ) => ({
      id: randomUUID(),
      studentId,
      examRoundId: round,
      status,
      startedAt: new Date(startedAt),
      expiresAt: new Date(startedAt + 60000),
    });
    await prisma.testSession.createMany({
      data: [
        session(students[1], 'IN_PROGRESS', now - 300000),
        session(students[2], 'COMPLETED', now - 240000),
        session(students[3], 'IN_PROGRESS', now - 200000),
        session(students[3], 'ABANDONED', now - 100000),
      ],
    });
  });
  afterAll(async () => {
    await prisma.testSession.deleteMany({
      where: { examRoundId: { in: [round, otherRound] } },
    });
    await prisma.examRoundParticipant.deleteMany({
      where: { roundId: { in: [round, otherRound] } },
    });
    await prisma.examRound.deleteMany({
      where: { id: { in: [round, otherRound] } },
    });
    await prisma.studentProfile.deleteMany({
      where: { userId: { in: students } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [admin, ...students] } },
    });
    await prisma.$disconnect();
  });
  it('returns latest status, correct counts, overdue flag and excludes other rounds', async () => {
    const result = await service.execute(round, { page: 1, pageSize: 2 });
    expectContract('/api/v1/exam-rounds/{id}/participants', 'get', 200, result);
    expect(result.total).toBe(4);
    expect(result.data).toHaveLength(2);
    expect(result.summary).toEqual({
      notStarted: 1,
      inProgress: 1,
      completed: 1,
      abandoned: 1,
    });
    expect(result.data[1]).toMatchObject({
      studentId: students[1],
      status: 'IN_PROGRESS',
      overdue: true,
    });
    const last = await service.execute(round, { page: 2, pageSize: 2 });
    expect(last.data.map((row) => row.status)).toEqual([
      'COMPLETED',
      'ABANDONED',
    ]);
    const beyond = await service.execute(round, { page: 10, pageSize: 2 });
    expect(beyond.total).toBe(4);
    expect(beyond.data).toEqual([]);
  });
  it('filters status and literal search without widening the round scope', async () => {
    const found = await service.execute(round, {
      q: `${prefix}-2`,
      status: 'COMPLETED',
    });
    expect(found.total).toBe(1);
    expect(found.data[0].studentId).toBe(students[2]);
    expect((await service.execute(round, { q: '%' })).total).toBe(0);
    expect((await service.execute(otherRound, {})).total).toBe(1);
    await expect(service.execute(randomUUID(), {})).rejects.toThrow();
  });
  it('exports filtered CSV and XLSX using actual participant records', async () => {
    const csv = await service.export(round, {
      format: 'csv',
      status: 'COMPLETED',
    });
    expect(csv.data.toString('utf8')).toContain('Sinh viên 2');
    expect(csv.data.toString('utf8')).not.toContain('Sinh viên 1');
    const xlsx = await service.export(round, {
      format: 'xlsx',
      studentIds: students[2],
    });
    const workbook = new Workbook();
    await workbook.xlsx.load(xlsx.data as never);
    expect(workbook.worksheets[0].rowCount).toBe(2);
    expect(workbook.worksheets[0].getRow(2).getCell(2).value).toBe(
      'Sinh viên 2',
    );
    await expect(
      service.export(round, { studentIds: 'bad-id' }),
    ).rejects.toThrow();
  });
  it('removes a draft participant but preserves sessions and closed rounds', async () => {
    const remove = new AdminExamRoundsUseCase(prisma);
    await expect(
      remove.removeParticipant(round, students[2]),
    ).rejects.toThrow();
    const draft = randomUUID();
    await prisma.examRound.create({
      data: {
        id: draft,
        name: 'Draft',
        createdById: admin,
        status: 'DRAFT',
        opensAt: new Date(Date.now() + 3600000),
        closesAt: new Date(Date.now() + 7200000),
        durationMinutes: 45,
      },
    });
    try {
      await prisma.examRoundParticipant.create({
        data: { roundId: draft, studentId: students[0] },
      });
      expect(await remove.removeParticipant(draft, students[0])).toEqual({
        removed: true,
      });
      expect(
        await prisma.examRoundParticipant.count({ where: { roundId: draft } }),
      ).toBe(0);
      await prisma.examRoundParticipant.createMany({
        data: [students[0], students[1]].map((studentId) => ({
          roundId: draft,
          studentId,
        })),
      });
      await prisma.examRound.update({
        where: { id: draft },
        data: {
          status: 'OPEN',
          opensAt: new Date(Date.now() - 60000),
          closesAt: new Date(Date.now() + 3600000),
        },
      });
      await prisma.testSession.create({
        data: {
          studentId: students[0],
          examRoundId: draft,
          status: 'IN_PROGRESS',
          expiresAt: new Date(Date.now() + 60000),
        },
      });
      await expect(
        remove.removeParticipant(draft, students[0]),
      ).rejects.toThrow(/đã có phiên/);
      await expect(
        remove.removeParticipant(draft, students[1]),
      ).resolves.toEqual({ removed: true });
      await expect(
        remove.removeParticipant(draft, students[0]),
      ).rejects.toThrow();
    } finally {
      await prisma.testSession.deleteMany({ where: { examRoundId: draft } });
      await prisma.examRoundParticipant.deleteMany({
        where: { roundId: draft },
      });
      await prisma.examRound.delete({ where: { id: draft } });
    }
  });
});
