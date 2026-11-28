import { afterAll, beforeAll, describe, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { TestSessionController } from '../../src/modules/test-session/presentation/test-session.controller';
import { StartSessionUseCase } from '../../src/modules/test-session/application/use-cases/start-session.use-case';
import { SubmitResponseUseCase } from '../../src/modules/test-session/application/use-cases/submit-response.use-case';
import { ResumeSessionUseCase } from '../../src/modules/test-session/application/use-cases/resume-session.use-case';
import { GetActiveSessionUseCase } from '../../src/modules/test-session/application/use-cases/get-active-session.use-case';
import { GetSessionResultUseCase } from '../../src/modules/test-session/application/use-cases/get-session-result.use-case';
import { GetSessionReviewUseCase } from '../../src/modules/test-session/application/use-cases/get-session-review.use-case';
import { ComputeResultUseCase } from '../../src/modules/test-session/application/use-cases/compute-result.use-case';
import { SessionCleanupService } from '../../src/modules/test-session/application/services/session-cleanup.service';
import { PrismaTestSessionRepository } from '../../src/modules/test-session/infrastructure/persistence/prisma-test-session.repository';
import { RedisSessionCacheService } from '../../src/modules/test-session/infrastructure/cache/redis-session-cache.service';
import { CatEngineService } from '../../src/modules/cat-engine/application/services/cat-engine.service';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { PrismaUserRepository } from '../../src/modules/auth/infrastructure/persistence/prisma-user.repository';
import { JwtStrategy } from '../../src/modules/auth/infrastructure/providers/jwt.strategy';
import { ExamRoundController } from '../../src/modules/exam-round/presentation/exam-round.controller';
import { AdminExamRoundsUseCase } from '../../src/modules/exam-round/application/use-cases/admin-exam-rounds.use-case';
import { ListRoundParticipantsUseCase } from '../../src/modules/exam-round/application/use-cases/list-round-participants.use-case';
import { GetStudentExamRoundsUseCase } from '../../src/modules/exam-round/application/use-cases/get-student-exam-rounds.use-case';
import { GetExamRoundDetailUseCase } from '../../src/modules/exam-round/application/use-cases/get-exam-round-detail.use-case';
import { GetCurrentRoundSessionUseCase } from '../../src/modules/test-session/application/use-cases/get-current-round-session.use-case';

const url = process.env.ADMIN_TEST_DATABASE_URL;
const parsed = url ? new URL(url) : undefined;
if (
  parsed &&
  (!['127.0.0.1', 'localhost'].includes(parsed.hostname) ||
    parsed.pathname !== '/apt_admin_test')
)
  throw new Error('Use isolated local apt_admin_test only');
const suite = url ? describe : describe.skip;
suite('exam round authentication with PostgreSQL', () => {
  const prisma = new PrismaService({ datasourceUrl: url });
  const admin = randomUUID();
  const teacher = randomUUID();
  const student = randomUUID();
  const roundId = randomUUID();
  const secret = 'integration-test-only-secret-for-jwt';
  let app: INestApplication;
  let jwt: JwtService;
  beforeAll(async () => {
    await prisma.$connect();
    await prisma.user.createMany({
      data: [
        {
          id: admin,
          email: `${admin}@example.test`,
          fullName: 'Admin',
          role: 'ADMIN',
        },
        {
          id: teacher,
          email: `${teacher}@example.test`,
          fullName: 'GV',
          role: 'TEACHER',
        },
        {
          id: student,
          email: `${student}@example.test`,
          fullName: 'SV',
          role: 'STUDENT',
        },
      ],
    });
    const opensAt = new Date(Date.now() + 60 * 60 * 1000);
    await prisma.examRound.create({
      data: {
        id: roundId,
        name: 'Test',
        createdById: admin,
        opensAt,
        closesAt: new Date(opensAt.getTime() + 2 * 60 * 60 * 1000),
        durationMinutes: 45,
      },
    });
    const module = await Test.createTestingModule({
      imports: [PassportModule, JwtModule.register({ secret })],
      controllers: [ExamRoundController, TestSessionController],
      providers: [
        JwtStrategy,
        {
          provide: StartSessionUseCase,
          useValue: {
            execute: async () => ({ sessionId: 'test', expiresAt: new Date() }),
          },
        },
        ...[
          SubmitResponseUseCase,
          ResumeSessionUseCase,
          GetActiveSessionUseCase,
          GetSessionResultUseCase,
          GetSessionReviewUseCase,
          ComputeResultUseCase,
          SessionCleanupService,
          PrismaTestSessionRepository,
          RedisSessionCacheService,
          CatEngineService,
          'IItemRepository',
        ].map((provide) => ({ provide, useValue: {} })),
        { provide: ConfigService, useValue: { getOrThrow: () => secret } },
        {
          provide: 'IUserRepository',
          useValue: new PrismaUserRepository(prisma),
        },
        {
          provide: AdminExamRoundsUseCase,
          useValue: new AdminExamRoundsUseCase(prisma),
        },
        {
          provide: ListRoundParticipantsUseCase,
          useValue: new ListRoundParticipantsUseCase(prisma),
        },
        { provide: GetStudentExamRoundsUseCase, useValue: {} },
        { provide: GetExamRoundDetailUseCase, useValue: {} },
        { provide: GetCurrentRoundSessionUseCase, useValue: {} },
      ],
    }).compile();
    jwt = module.get(JwtService);
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
    await prisma.examRound.deleteMany({ where: { id: roundId } });
    await prisma.user.deleteMany({
      where: { id: { in: [admin, teacher, student] } },
    });
    await prisma.$disconnect();
  });
  it('requires JWT and uses the current database role, not the token role', async () => {
    const body = {
      closesAt: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
    };
    const adminToken = jwt.sign({ sub: admin, role: 'ADMIN' });
    const teacherToken = jwt.sign({ sub: teacher, role: 'ADMIN' });
    await request(app.getHttpServer())
      .patch(`/exam-rounds/${roundId}`)
      .send(body)
      .expect(401);
    await request(app.getHttpServer())
      .patch(`/exam-rounds/${roundId}`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send(body)
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/exam-rounds/${roundId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(body)
      .expect(200);
    await prisma.user.update({
      where: { id: admin },
      data: { role: 'TEACHER' },
    });
    await request(app.getHttpServer())
      .patch(`/exam-rounds/${roundId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(body)
      .expect(403);
  });
  it('blocks ADMIN and TEACHER from starting a student session', async () => {
    await prisma.user.update({ where: { id: admin }, data: { role: 'ADMIN' } });
    const token = (id: string) => jwt.sign({ sub: id });
    await request(app.getHttpServer())
      .post('/sessions')
      .set('Authorization', `Bearer ${token(admin)}`)
      .send({ examRoundId: roundId })
      .expect(403);
    await request(app.getHttpServer())
      .post('/sessions')
      .set('Authorization', `Bearer ${token(teacher)}`)
      .send({ examRoundId: roundId })
      .expect(403);
    await request(app.getHttpServer())
      .post('/sessions')
      .set('Authorization', `Bearer ${token(student)}`)
      .send({ examRoundId: roundId })
      .expect(201);
  });
  it('restricts participant monitoring to ADMIN and validates the query', async () => {
    await prisma.user.update({ where: { id: admin }, data: { role: 'ADMIN' } });
    await prisma.examRound.update({
      where: { id: roundId },
      data: { status: 'SCHEDULED' },
    });
    const token = (id: string) => jwt.sign({ sub: id });
    const path = `/exam-rounds/${roundId}/participants`;
    await request(app.getHttpServer()).get(path).expect(401);
    await request(app.getHttpServer())
      .get(path)
      .set('Authorization', `Bearer ${token(teacher)}`)
      .expect(403);
    await request(app.getHttpServer())
      .get(path)
      .set('Authorization', `Bearer ${token(student)}`)
      .expect(403);
    await request(app.getHttpServer())
      .get(`${path}?pageSize=101`)
      .set('Authorization', `Bearer ${token(admin)}`)
      .expect(400);
    await request(app.getHttpServer())
      .get(path)
      .set('Authorization', `Bearer ${token(admin)}`)
      .expect(200);
  });
});
