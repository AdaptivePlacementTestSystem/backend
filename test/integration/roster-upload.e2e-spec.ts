import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { expectContract } from './admin-exam-contract.helper';
import { randomUUID } from 'node:crypto';
import * as ExcelJS from 'exceljs';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { UnauthorizedException, ValidationPipe } from '@nestjs/common';
import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import request from 'supertest';
import { JwtAuthGuard } from '../../src/shared/guards/jwt-auth.guard';
import { RosterGridController } from '../../src/modules/exam-round/presentation/roster-grid.controller';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { ExcelRosterParser } from '../../src/modules/exam-round/infrastructure/excel-roster.parser';
import { RedisRosterGridStore } from '../../src/modules/exam-round/infrastructure/redis-roster-grid.store';
import { RosterGridUseCase } from '../../src/modules/exam-round/application/use-cases/roster-grid.use-case';

const url = process.env.ADMIN_TEST_DATABASE_URL;
const parsed = url ? new URL(url) : undefined;
if (
  parsed &&
  (!['127.0.0.1', 'localhost'].includes(parsed.hostname) ||
    parsed.pathname !== '/apt_admin_test')
)
  throw new Error('Use isolated local apt_admin_test only');
const port = Number(process.env.ADMIN_TEST_REDIS_PORT);
const suite = url && port > 0 ? describe : describe.skip;

suite('roster upload on PostgreSQL and Redis', () => {
  const prisma = new PrismaService({ datasourceUrl: url });
  const admin = randomUUID();
  const other = randomUUID();
  const student = randomUUID();
  const student2 = randomUUID();
  const roundId = randomUUID();
  const code = `SV-${randomUUID()}`;
  const code2 = `SV-${randomUUID()}`;
  let app: INestApplication;
  const config = {
    get: (key: string) =>
      (
        ({ 'redis.host': '127.0.0.1', 'redis.port': port }) as Record<
          string,
          string | number
        >
      )[key],
  } as unknown as ConfigService;
  const grid = new RedisRosterGridStore(config);
  const service = new RosterGridUseCase(
    prisma,
    new ExcelRosterParser(config),
    grid,
  );
  beforeAll(async () => {
    await prisma.$connect();
    grid.onModuleInit();
    const module = await Test.createTestingModule({
      imports: [
        MulterModule.register({ limits: { fileSize: 2097152, files: 1 } }),
      ],
      controllers: [RosterGridController],
      providers: [{ provide: RosterGridUseCase, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(context: ExecutionContext) {
          const req = context.switchToHttp().getRequest();
          const role = req.headers['x-test-role'];
          if (!role) throw new UnauthorizedException();
          req.user = { sub: admin, role };
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
    await prisma.user.createMany({
      data: [
        {
          id: admin,
          email: `${admin}@example.test`,
          fullName: 'Admin',
          role: 'ADMIN',
        },
        {
          id: student,
          email: `${student}@example.test`,
          fullName: 'SV',
          role: 'STUDENT',
        },
        {
          id: student2,
          email: `${student2}@example.test`,
          fullName: 'SV 2',
          role: 'STUDENT',
        },
        {
          id: other,
          email: `${other}@example.test`,
          fullName: 'Admin 2',
          role: 'ADMIN',
        },
      ],
    });
    await prisma.studentProfile.createMany({
      data: [
        { userId: student, studentCode: code },
        { userId: student2, studentCode: code2 },
      ],
    });
    const opensAt = new Date(Date.now() + 60 * 60 * 1000);
    await prisma.examRound.create({
      data: {
        id: roundId,
        name: 'Test',
        createdById: admin,
        opensAt,
        closesAt: new Date(opensAt.getTime() + 60 * 60 * 1000),
        durationMinutes: 45,
      },
    });
  });
  afterAll(async () => {
    await grid.clear(admin, roundId);
    await grid.clear(other, roundId);
    await app?.close();
    await grid.onModuleDestroy();
    await prisma.rosterImportEvent.deleteMany({ where: { roundId } });
    await prisma.examRoundParticipant.deleteMany({ where: { roundId } });
    await prisma.examRound.deleteMany({ where: { id: roundId } });
    await prisma.studentProfile.deleteMany({
      where: { userId: { in: [student, student2] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [admin, other, student, student2] } },
    });
    await prisma.$disconnect();
  });
  it('validates rows and keeps uploaded data in the caller grid only', async () => {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet('Danh sách');
    sheet.addRows([
      ['MSSV', 'Ghi chú'],
      [code, 'ghi chú'],
      [code, 'trùng'],
      ['khong-co', ''],
    ]);
    const file = {
      originalname: 'roster.xlsx',
      buffer: Buffer.from(await book.xlsx.writeBuffer()),
    };
    const result = await service.upload(admin, roundId, file);
    expect(result.added).toBe(1);
    expect(result.rejected.map((row) => row.reason)).toEqual([
      'Trùng MSSV trong file',
      'MSSV không tồn tại',
    ]);
    expect((await service.load(other, roundId)).grid).toEqual([]);
    expect(
      await prisma.examRoundParticipant.count({ where: { roundId } }),
    ).toBe(0);
    const second = await service.upload(admin, roundId, file);
    expect(second.ignoredDuplicates).toBe(1);
    await service.remove(admin, roundId, student);
    expect((await service.load(admin, roundId)).grid).toEqual([]);
  });
  it('returns a downloadable empty template only to ADMIN', async () => {
    const route = `/exam-rounds/${roundId}/participants/import/template`;
    await request(app.getHttpServer())
      .get(route)
      .set('x-test-role', 'TEACHER')
      .expect(403);
    const response = await request(app.getHttpServer())
      .get(route)
      .set('x-test-role', 'ADMIN')
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(response.headers['content-type']).toMatch(/spreadsheetml/);
    expect(response.headers['content-disposition']).toContain(
      'danh-sach-thi.xlsx',
    );
    const rows = await new ExcelRosterParser(config).read({
      buffer: response.body,
      originalname: 'mau.xlsx',
    });
    expect(rows).toEqual([]);
  });
  it('handles multipart upload and role checks over HTTP', async () => {
    const book = new ExcelJS.Workbook();
    book.addWorksheet('Sheet').addRows([
      ['MSSV', 'Ghi chú'],
      [code, 'HTTP'],
    ]);
    const file = Buffer.from(await book.xlsx.writeBuffer());
    const route = `/exam-rounds/${roundId}/participants/import`;
    await request(app.getHttpServer()).get(`${route}/grid`).expect(401);
    await request(app.getHttpServer())
      .get(`${route}/grid`)
      .set('x-test-role', 'STUDENT')
      .expect(403);
    const response = await request(app.getHttpServer())
      .post(`${route}/upload`)
      .set('x-test-role', 'ADMIN')
      .attach('file', file, 'roster.xlsx')
      .expect(200);
    expectContract(
      '/api/v1/exam-rounds/{roundId}/participants/import/upload',
      'post',
      200,
      response.body,
    );
    expect(response.body.added).toBe(1);
    expect(response.body.grid[0].studentCode).toBe(code);
    const loaded = await request(app.getHttpServer())
      .get(`${route}/grid`)
      .set('x-test-role', 'ADMIN')
      .expect(200);
    expectContract(
      '/api/v1/exam-rounds/{roundId}/participants/import/grid',
      'get',
      200,
      loaded.body,
    );
    const removed = await request(app.getHttpServer())
      .delete(`${route}/grid/${student}`)
      .set('x-test-role', 'ADMIN')
      .expect(200);
    expectContract(
      '/api/v1/exam-rounds/{roundId}/participants/import/grid/{studentId}',
      'delete',
      200,
      removed.body,
    );
    await request(app.getHttpServer())
      .delete(`${route}/grid`)
      .set('x-test-role', 'ADMIN')
      .expect(204);
    expect(
      await prisma.examRoundParticipant.count({ where: { roundId } }),
    ).toBe(0);
  });
  it('validates and saves through the HTTP endpoint', async () => {
    const book = new ExcelJS.Workbook();
    book.addWorksheet('Sheet').addRows([['MSSV'], [code2]]);
    const route = `/exam-rounds/${roundId}/participants/import`;
    const uploaded = await request(app.getHttpServer())
      .post(`${route}/upload`)
      .set('x-test-role', 'ADMIN')
      .attach('file', Buffer.from(await book.xlsx.writeBuffer()), 'roster.xlsx')
      .expect(200);
    const operationId = uploaded.body.operationId;
    await request(app.getHttpServer())
      .post(`${route}/save`)
      .send({ operationId })
      .expect(401);
    await request(app.getHttpServer())
      .post(`${route}/save`)
      .set('x-test-role', 'STUDENT')
      .send({ operationId })
      .expect(403);
    await request(app.getHttpServer())
      .post(`${route}/save`)
      .set('x-test-role', 'TEACHER')
      .send({ operationId })
      .expect(403);
    await request(app.getHttpServer())
      .post(`${route}/save`)
      .set('x-test-role', 'ADMIN')
      .send({ operationId: 'bad' })
      .expect(400);
    const saved = await request(app.getHttpServer())
      .post(`${route}/save`)
      .set('x-test-role', 'ADMIN')
      .send({ operationId })
      .expect(200);
    expectContract(
      '/api/v1/exam-rounds/{roundId}/participants/import/save',
      'post',
      200,
      saved.body,
    );
    await request(app.getHttpServer())
      .post(`${route}/save`)
      .set('x-test-role', 'ADMIN')
      .send({ operationId })
      .expect(200);
    expect(
      await prisma.rosterImportEvent.count({ where: { operationId } }),
    ).toBe(1);
    await prisma.rosterImportEvent.deleteMany({ where: { operationId } });
    await prisma.examRoundParticipant.deleteMany({
      where: { roundId, studentId: student2 },
    });
  });
  it('serializes two admins saving the same student', async () => {
    const book = new ExcelJS.Workbook();
    book.addWorksheet('Sheet').addRows([['MSSV'], [code2]]);
    const file = {
      originalname: 'roster.xlsx',
      buffer: Buffer.from(await book.xlsx.writeBuffer()),
    };
    const first = await service.upload(admin, roundId, file);
    const second = await service.upload(other, roundId, file);
    const results = await Promise.allSettled([
      service.save(admin, roundId, first.operationId!),
      service.save(other, roundId, second.operationId!),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    expect(
      await prisma.examRoundParticipant.count({
        where: { roundId, studentId: student2 },
      }),
    ).toBe(1);
    expect(await prisma.rosterImportEvent.count({ where: { roundId } })).toBe(
      1,
    );
    await prisma.rosterImportEvent.deleteMany({ where: { roundId } });
    await prisma.examRoundParticipant.deleteMany({
      where: { roundId, studentId: student2 },
    });
    await grid.clear(admin, roundId);
    await grid.clear(other, roundId);
  });
  it('saves once, records audit, and safely retries after Redis cleanup fails', async () => {
    const book = new ExcelJS.Workbook();
    book.addWorksheet('Sheet').addRows([['MSSV'], [code]]);
    const file = {
      originalname: 'roster.xlsx',
      buffer: Buffer.from(await book.xlsx.writeBuffer()),
    };
    const upload = await service.upload(admin, roundId, file);
    const operationId = upload.operationId!;
    const clear = vi
      .spyOn(grid, 'clearCommitted')
      .mockRejectedValueOnce(new Error('redis down'));
    expect(await service.save(admin, roundId, operationId)).toEqual({
      operationId,
      added: 1,
    });
    expect(
      await prisma.examRoundParticipant.count({ where: { roundId } }),
    ).toBe(1);
    expect(
      await prisma.rosterImportEvent.count({ where: { operationId } }),
    ).toBe(1);
    expect((await service.load(admin, roundId)).grid).toEqual([]);
    expect(await service.save(admin, roundId, operationId)).toEqual({
      operationId,
      added: 1,
    });
    expect(
      await prisma.examRoundParticipant.count({ where: { roundId } }),
    ).toBe(1);
    await expect(service.save(other, roundId, operationId)).rejects.toThrow();
    clear.mockRestore();
  });
  it('handles concurrent saves of the same operation on PostgreSQL', async () => {
    const book = new ExcelJS.Workbook();
    book.addWorksheet('Sheet').addRows([['MSSV'], [code2]]);
    const route = `/exam-rounds/${roundId}/participants/import`;
    const uploaded = await request(app.getHttpServer())
      .post(`${route}/upload`)
      .set('x-test-role', 'ADMIN')
      .attach('file', Buffer.from(await book.xlsx.writeBuffer()), 'roster.xlsx')
      .expect(200);
    const operationId = uploaded.body.operationId;
    const results = await Promise.all(
      [1, 2, 3].map(() =>
        request(app.getHttpServer())
          .post(`${route}/save`)
          .set('x-test-role', 'ADMIN')
          .send({ operationId }),
      ),
    );
    expect(results.some((result) => result.status === 200)).toBe(true);
    expect(results.every((result) => [200, 409].includes(result.status))).toBe(
      true,
    );
    expect(
      await prisma.rosterImportEvent.count({ where: { operationId } }),
    ).toBe(1);
    expect(
      await prisma.examRoundParticipant.count({
        where: { roundId, studentId: student2 },
      }),
    ).toBe(1);
    await prisma.rosterImportEvent.deleteMany({ where: { operationId } });
    await prisma.examRoundParticipant.deleteMany({
      where: { roundId, studentId: student2 },
    });
  });
  it('rejects reusing an operation from a different round', async () => {
    const otherRound = randomUUID();
    const operationId = randomUUID();
    const opensAt = new Date(Date.now() + 3600000);
    await prisma.examRound.create({
      data: {
        id: otherRound,
        name: 'Other',
        createdById: admin,
        opensAt,
        closesAt: new Date(opensAt.getTime() + 3600000),
        durationMinutes: 45,
      },
    });
    try {
      await prisma.rosterImportEvent.create({
        data: { operationId, roundId, adminId: admin, addedCount: 0 },
      });
      await request(app.getHttpServer())
        .post(`/exam-rounds/${otherRound}/participants/import/save`)
        .set('x-test-role', 'ADMIN')
        .send({ operationId })
        .expect(409);
      expect(
        await prisma.rosterImportEvent.count({
          where: { operationId, roundId: otherRound },
        }),
      ).toBe(0);
    } finally {
      await prisma.rosterImportEvent.deleteMany({ where: { operationId } });
      await prisma.examRound.delete({ where: { id: otherRound } });
    }
  });
  it('rejects saving a closed round without recording an operation', async () => {
    const book = new ExcelJS.Workbook();
    book.addWorksheet('Sheet').addRows([['MSSV'], [code2]]);
    const route = `/exam-rounds/${roundId}/participants/import`;
    const uploaded = await request(app.getHttpServer())
      .post(`${route}/upload`)
      .set('x-test-role', 'ADMIN')
      .attach('file', Buffer.from(await book.xlsx.writeBuffer()), 'roster.xlsx')
      .expect(200);
    const operationId = uploaded.body.operationId;
    await prisma.examRound.update({
      where: { id: roundId },
      data: { status: 'CLOSED' },
    });
    try {
      await request(app.getHttpServer())
        .post(`${route}/save`)
        .set('x-test-role', 'ADMIN')
        .send({ operationId })
        .expect(409);
      expect(
        await prisma.rosterImportEvent.count({ where: { operationId } }),
      ).toBe(0);
    } finally {
      await prisma.examRound.update({
        where: { id: roundId },
        data: { status: 'DRAFT' },
      });
      await grid.clear(admin, roundId);
    }
  });
  it('rejects a stale operation and rolls back on a duplicate participant', async () => {
    const book = new ExcelJS.Workbook();
    book.addWorksheet('Sheet').addRows([['MSSV'], [code2]]);
    const file = {
      originalname: 'roster.xlsx',
      buffer: Buffer.from(await book.xlsx.writeBuffer()),
    };
    const first = await service.upload(admin, roundId, file);
    const second = await service.upload(admin, roundId, file);
    expect(first.operationId).not.toBe(second.operationId);
    await expect(
      service.save(admin, roundId, first.operationId!),
    ).rejects.toThrow();
    await prisma.examRoundParticipant.create({
      data: { roundId, studentId: student2 },
    });
    await expect(
      service.save(admin, roundId, second.operationId!),
    ).rejects.toThrow();
    expect(
      await prisma.rosterImportEvent.count({
        where: { operationId: second.operationId! },
      }),
    ).toBe(0);
    expect((await service.load(admin, roundId)).grid).toHaveLength(1);
    await grid.clear(admin, roundId);
  });
  it('blocks grid edits while a save holds the lock', async () => {
    const token = randomUUID();
    expect(await grid.acquireSave(admin, roundId, token)).toBe(true);
    try {
      await expect(
        grid.merge(admin, roundId, [
          { studentId: student, studentCode: code, note: '' },
        ]),
      ).rejects.toThrow();
      await expect(grid.clear(admin, roundId)).rejects.toThrow();
    } finally {
      await grid.releaseSave(admin, roundId, token);
    }
  });
  it('refuses uploads for a closed round', async () => {
    await prisma.examRound.update({
      where: { id: roundId },
      data: { status: 'CLOSED' },
    });
    await expect(service.upload(admin, roundId)).rejects.toThrow();
  });
});
