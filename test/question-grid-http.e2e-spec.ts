import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { PrismaService } from '../src/shared/prisma/prisma.service';
import { PrismaUserRepository } from '../src/modules/auth/infrastructure/persistence/prisma-user.repository';
import { JwtStrategy } from '../src/modules/auth/infrastructure/providers/jwt.strategy';
import { ParseQuestionSpreadsheetUseCase } from '../src/modules/item-generation/application/parse-question-spreadsheet.use-case';
import { QuestionGridUseCase } from '../src/modules/item-generation/application/question-grid.use-case';
import { SaveQuestionImportUseCase } from '../src/modules/item-generation/application/save-question-import.use-case';
import { RedisQuestionGridStore } from '../src/modules/item-generation/infrastructure/redis-question-grid.store';
import { ImportQuestionBatchesController } from '../src/modules/item-generation/presentation/import-question-batches.controller';

const url = process.env.Q1Q8_TEST_DATABASE_URL ?? '';
const safe =
  /^postgresql:\/\/[^@]+@127\.0\.0\.1:63655\/apt_ai_review_[0-9a-f]{8}\?schema=public$/.test(
    url,
  );
describe.skipIf(!safe || process.env.ADMIN_TEST_REDIS_PORT !== '63657')(
  'question import HTTP authorization',
  () => {
    const db = new PrismaService({ datasources: { db: { url } } });
    const admin = randomUUID(),
      teacher = randomUUID();
    const secret = 'isolated-integration-test-secret-value';
    const config = {
      get: (key: string) =>
        (
          ({ 'redis.host': '127.0.0.1', 'redis.port': 63657 }) as Record<
            string,
            string | number
          >
        )[key],
      getOrThrow: () => secret,
    } as unknown as ConfigService;
    const grid = new RedisQuestionGridStore(config);
    const parser = new ParseQuestionSpreadsheetUseCase();
    const saver = new SaveQuestionImportUseCase(db);
    const service = new QuestionGridUseCase(parser, grid, saver);
    let app: INestApplication, jwt: JwtService;
    beforeAll(async () => {
      await db.$connect();
      await db.user.createMany({
        data: [admin, teacher].map((id, i) => ({
          id,
          email: `${id}@example.test`,
          fullName: 'Test',
          role: i ? 'TEACHER' : 'ADMIN',
        })),
      });
      grid.onModuleInit();
      const module = await Test.createTestingModule({
        imports: [PassportModule, JwtModule.register({ secret })],
        controllers: [ImportQuestionBatchesController],
        providers: [
          JwtStrategy,
          { provide: ConfigService, useValue: config },
          {
            provide: 'IUserRepository',
            useValue: new PrismaUserRepository(db),
          },
          { provide: ParseQuestionSpreadsheetUseCase, useValue: parser },
          { provide: QuestionGridUseCase, useValue: service },
        ],
      }).compile();
      jwt = module.get(JwtService);
      app = module.createNestApplication();
      await app.init();
    });
    afterAll(async () => {
      await grid.clear(admin);
      await grid.clear(teacher);
      await grid.onModuleDestroy();
      await app?.close();
      const batches = await db.itemBatch.findMany({
        where: { createdById: admin },
        select: { id: true },
      });
      const ids = batches.map((batch) => batch.id);
      await db.item.deleteMany({ where: { batchId: { in: ids } } });
      await db.itemBatch.deleteMany({ where: { id: { in: ids } } });
      await db.user.deleteMany({ where: { id: { in: [admin, teacher] } } });
      await db.$disconnect();
    });
    it('requires ADMIN and saves only server-staged content', async () => {
      const path = '/item-batches/import';
      await request(app.getHttpServer()).get(`${path}/grid`).expect(401);
      await request(app.getHttpServer())
        .get(`${path}/grid`)
        .set(
          'Authorization',
          `Bearer ${jwt.sign({ sub: teacher, role: 'ADMIN' })}`,
        )
        .expect(403);
      const token = jwt.sign({ sub: admin });
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Questions');
      sheet.addRow([
        'Skill',
        'CEFR',
        'Topic',
        'Question',
        'A',
        'B',
        'C',
        'D',
        'Answer',
        'Explanation',
        'IRT',
      ]);
      sheet.addRow([
        'GRAMMAR',
        'A2',
        '',
        'Original question?',
        'Yes',
        'No',
        'Maybe',
        'Later',
        'A',
        'Yes is correct.',
        0,
      ]);
      const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
      const upload = await request(app.getHttpServer())
        .post(`${path}/upload`)
        .set('Authorization', `Bearer ${token}`)
        .attach('file', buffer, 'questions.xlsx')
        .expect(201);
      const save = await request(app.getHttpServer())
        .post(`${path}/save`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          operationId: upload.body.operationId,
          rows: [{ content: 'Tampered' }],
        })
        .expect(201);
      const items = await db.item.findMany({
        where: { batchId: save.body.batchId },
      });
      if (items.length !== 1 || items[0].content !== 'Original question?')
        throw new Error('Staged content was not preserved');
    });
  },
);
