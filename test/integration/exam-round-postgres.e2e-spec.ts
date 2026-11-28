import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expectContract } from './admin-exam-contract.helper';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { UnauthorizedException, ValidationPipe } from '@nestjs/common';
import type { INestApplication, ExecutionContext } from '@nestjs/common';
import request from 'supertest';
import { JwtAuthGuard } from '../../src/shared/guards/jwt-auth.guard';
import { ExamRoundController } from '../../src/modules/exam-round/presentation/exam-round.controller';
import { GetStudentExamRoundsUseCase } from '../../src/modules/exam-round/application/use-cases/get-student-exam-rounds.use-case';
import { GetExamRoundDetailUseCase } from '../../src/modules/exam-round/application/use-cases/get-exam-round-detail.use-case';
import { GetCurrentRoundSessionUseCase } from '../../src/modules/test-session/application/use-cases/get-current-round-session.use-case';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { AdminExamRoundsUseCase } from '../../src/modules/exam-round/application/use-cases/admin-exam-rounds.use-case';
import { ListRoundParticipantsUseCase } from '../../src/modules/exam-round/application/use-cases/list-round-participants.use-case';
import { PrismaTestSessionRepository } from '../../src/modules/test-session/infrastructure/persistence/prisma-test-session.repository';
import { TestSessionEntity } from '../../src/modules/test-session/domain/entities/test-session.entity';

const testUrl = process.env.ADMIN_TEST_DATABASE_URL;
const parsed = testUrl ? new URL(testUrl) : undefined;
if (
  parsed &&
  (!['127.0.0.1', 'localhost'].includes(parsed.hostname) ||
    parsed.pathname !== '/apt_admin_test')
) {
  throw new Error(
    'ADMIN_TEST_DATABASE_URL must point to the isolated local apt_admin_test database',
  );
}
const suite = testUrl ? describe : describe.skip;

suite('exam round PostgreSQL integration', () => {
  const prisma = new PrismaService({ datasourceUrl: testUrl });
  const service = new AdminExamRoundsUseCase(prisma);
  const adminId = randomUUID();
  const studentId = randomUUID();
  const roundId = randomUUID();
  let app: INestApplication;
  let opensAt: Date;
  let closesAt: Date;

  beforeAll(async () => {
    await prisma.$connect();
    const module = await Test.createTestingModule({
      controllers: [ExamRoundController],
      providers: [
        { provide: AdminExamRoundsUseCase, useValue: service },
        {
          provide: ListRoundParticipantsUseCase,
          useValue: new ListRoundParticipantsUseCase(prisma),
        },
        { provide: GetStudentExamRoundsUseCase, useValue: {} },
        { provide: GetExamRoundDetailUseCase, useValue: {} },
        { provide: GetCurrentRoundSessionUseCase, useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(context: ExecutionContext) {
          const req = context.switchToHttp().getRequest();
          const role = req.headers['x-test-role'];
          if (!role) throw new UnauthorizedException();
          req.user = { sub: adminId, role };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    opensAt = new Date(Date.now() + 60 * 60 * 1000);
    closesAt = new Date(opensAt.getTime() + 2 * 60 * 60 * 1000);
    await prisma.user.createMany({
      data: [
        {
          id: adminId,
          email: `${adminId}@example.test`,
          fullName: 'Admin test',
          role: 'ADMIN',
        },
        {
          id: studentId,
          email: `${studentId}@example.test`,
          fullName: 'Sinh viên test',
          role: 'STUDENT',
        },
      ],
    });
    await prisma.examRound.create({
      data: {
        id: roundId,
        name: 'Kỳ test',
        createdById: adminId,
        opensAt,
        closesAt,
        durationMinutes: 45,
      },
    });
  });

  afterAll(async () => {
    await prisma.examRoundParticipant.deleteMany({ where: { roundId } });
    await prisma.examRound.deleteMany({ where: { id: roundId } });
    await prisma.user.deleteMany({
      where: { id: { in: [adminId, studentId] } },
    });
    await app?.close();
    await prisma.$disconnect();
  });

  it('enforces publication conditions against PostgreSQL and persists updates', async () => {
    await expect(service.publish(roundId)).rejects.toThrow();
    await prisma.examRoundParticipant.create({ data: { roundId, studentId } });
    const published = await service.publish(roundId);
    expectContract('/api/v1/exam-rounds/{id}/publish', 'post', 201, published);
    expect(published.status).toBe('SCHEDULED');
    const later = new Date(closesAt.getTime() + 60 * 60 * 1000);
    await service.update(roundId, { closesAt: later.toISOString() });
    expect(
      (await prisma.examRound.findUniqueOrThrow({ where: { id: roundId } }))
        .closesAt,
    ).toEqual(later);
    await expect(
      service.update(roundId, { name: 'Không được đổi' }),
    ).rejects.toThrow();
  });

  it('serializes concurrent publication requests', async () => {
    await prisma.examRound.update({
      where: { id: roundId },
      data: { status: 'DRAFT' },
    });
    const results = await Promise.allSettled([
      service.publish(roundId),
      service.publish(roundId),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    expect(
      (await prisma.examRound.findUniqueOrThrow({ where: { id: roundId } }))
        .status,
    ).toBe('SCHEDULED');
  });

  it('enforces role and input validation at the HTTP boundary', async () => {
    await request(app.getHttpServer())
      .patch(`/exam-rounds/${roundId}`)
      .send({ closesAt: closesAt.toISOString() })
      .expect(401);
    await request(app.getHttpServer())
      .patch(`/exam-rounds/${roundId}`)
      .set('x-test-role', 'TEACHER')
      .send({ closesAt: closesAt.toISOString() })
      .expect(403);
    await request(app.getHttpServer())
      .post(`/exam-rounds/${roundId}/publish`)
      .set('x-test-role', 'STUDENT')
      .expect(403);
    await request(app.getHttpServer())
      .patch('/exam-rounds/not-a-uuid')
      .set('x-test-role', 'ADMIN')
      .send({ closesAt: closesAt.toISOString() })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/exam-rounds/${roundId}`)
      .set('x-test-role', 'ADMIN')
      .send({ status: 'OPEN' })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/exam-rounds/${roundId}`)
      .set('x-test-role', 'ADMIN')
      .send({ opensAt: null })
      .expect(400);
    const newClose = new Date(
      closesAt.getTime() + 90 * 60 * 1000,
    ).toISOString();
    const updated = await request(app.getHttpServer())
      .patch(`/exam-rounds/${roundId}`)
      .set('x-test-role', 'ADMIN')
      .send({ closesAt: newClose })
      .expect(200);
    expectContract('/api/v1/exam-rounds/{id}', 'patch', 200, updated.body);
  });
  it('close keeps an active session unchanged and blocks starts even when requests race', async () => {
    const repo = new PrismaTestSessionRepository(prisma);
    const openRound = randomUUID();
    const raceRound = randomUUID();
    const now = Date.now();
    const data = (id: string) => ({
      id,
      name: 'Kỳ đang mở',
      createdById: adminId,
      status: 'OPEN' as const,
      opensAt: new Date(now - 60000),
      closesAt: new Date(now + 3600000),
      durationMinutes: 45,
    });
    try {
      await prisma.examRound.create({ data: data(openRound) });
      await prisma.examRound.create({ data: data(raceRound) });
      await prisma.examRoundParticipant.createMany({
        data: [
          { roundId: openRound, studentId },
          { roundId: raceRound, studentId },
        ],
      });
      const session = await repo.create(
        new TestSessionEntity(randomUUID(), studentId, openRound),
      );
      const closedRound = await service.close(openRound);
      expectContract(
        '/api/v1/exam-rounds/{id}/close',
        'post',
        201,
        closedRound,
      );
      const persisted = await prisma.testSession.findUniqueOrThrow({
        where: { id: session.id },
      });
      expect(persisted.status).toBe('IN_PROGRESS');
      expect(persisted.expiresAt).toEqual(session.expiresAt);
      await expect(
        repo.create(new TestSessionEntity(randomUUID(), studentId, openRound)),
      ).rejects.toMatchObject({ response: { code: 'ROUND_NOT_OPEN' } });
      await prisma.testSession.delete({ where: { id: session.id } });
      const raceId = randomUUID();
      const results = await Promise.allSettled([
        repo.create(new TestSessionEntity(raceId, studentId, raceRound)),
        service.close(raceRound),
      ]);
      expect(results[1].status).toBe('fulfilled');
      expect(
        (await prisma.examRound.findUniqueOrThrow({ where: { id: raceRound } }))
          .status,
      ).toBe('CLOSED');
      const raceSession = await prisma.testSession.findUnique({
        where: { id: raceId },
      });
      expect(Boolean(raceSession)).toBe(results[0].status === 'fulfilled');
      await expect(
        repo.create(new TestSessionEntity(randomUUID(), studentId, raceRound)),
      ).rejects.toMatchObject({ response: { code: 'ROUND_NOT_OPEN' } });
    } finally {
      await prisma.testSession.deleteMany({
        where: { examRoundId: { in: [openRound, raceRound] } },
      });
      await prisma.examRoundParticipant.deleteMany({
        where: { roundId: { in: [openRound, raceRound] } },
      });
      await prisma.examRound.deleteMany({
        where: { id: { in: [openRound, raceRound] } },
      });
    }
  });
});
