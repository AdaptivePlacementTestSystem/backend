import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { writeFileSync } from 'node:fs';
import { ExamRoundController } from '../modules/exam-round/presentation/exam-round.controller';
import { RosterGridController } from '../modules/exam-round/presentation/roster-grid.controller';
import { AdminExamRoundsUseCase } from '../modules/exam-round/application/use-cases/admin-exam-rounds.use-case';
import { RosterGridUseCase } from '../modules/exam-round/application/use-cases/roster-grid.use-case';
import { ListRoundParticipantsUseCase } from '../modules/exam-round/application/use-cases/list-round-participants.use-case';
import { GetStudentExamRoundsUseCase } from '../modules/exam-round/application/use-cases/get-student-exam-rounds.use-case';
import { GetExamRoundDetailUseCase } from '../modules/exam-round/application/use-cases/get-exam-round-detail.use-case';
import { GetCurrentRoundSessionUseCase } from '../modules/test-session/application/use-cases/get-current-round-session.use-case';
import { JwtAuthGuard } from '../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../shared/guards/roles.guard';

@Module({
  controllers: [ExamRoundController, RosterGridController],
  providers: [
    AdminExamRoundsUseCase,
    RosterGridUseCase,
    ListRoundParticipantsUseCase,
    GetStudentExamRoundsUseCase,
    GetExamRoundDetailUseCase,
    GetCurrentRoundSessionUseCase,
  ].map((provide) => ({ provide, useValue: {} })),
})
class AdminExamContractModule {}

async function main() {
  const builder = Test.createTestingModule({
    imports: [AdminExamContractModule],
  });
  builder.overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true });
  builder.overrideGuard(RolesGuard).useValue({ canActivate: () => true });
  const module = await builder.compile();
  const app = module.createNestApplication();
  app.setGlobalPrefix('api/v1');
  const doc = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Admin exam API')
      .setVersion('1.0.0')
      .addBearerAuth()
      .build(),
    {
      include: [AdminExamContractModule],
      operationIdFactory: (controller, method) => `${controller}_${method}`,
    },
  );
  const methods: Record<string, string[]> = {
    '/api/v1/exam-rounds/{id}': ['patch'],
    '/api/v1/exam-rounds/{id}/publish': ['post'],
    '/api/v1/exam-rounds/{id}/close': ['post'],
    '/api/v1/exam-rounds/{id}/participants': ['get'],
    '/api/v1/exam-rounds/{roundId}/participants/import/upload': ['post'],
    '/api/v1/exam-rounds/{roundId}/participants/import/grid': ['get', 'delete'],
    '/api/v1/exam-rounds/{roundId}/participants/import/grid/{studentId}': [
      'delete',
    ],
    '/api/v1/exam-rounds/{roundId}/participants/import/save': ['post'],
    '/api/v1/exam-rounds/{roundId}/participants/import/template': ['get'],
  };
  doc.paths = Object.fromEntries(
    Object.entries(methods).map(([path, allowed]) => {
      const item = doc.paths[path];
      if (!item) throw new Error(`Missing controller path: ${path}`);
      const result = Object.fromEntries(
        Object.entries(item).filter(([method]) => allowed.includes(method)),
      );
      if (Object.keys(result).length !== allowed.length)
        throw new Error(`Missing controller method: ${path}`);
      return [path, result];
    }),
  );
  doc.components ??= {};
  doc.components.schemas ??= {};
  doc.components.schemas = {};
  doc.components.schemas.AdminExamHttpError = {
    type: 'object',
    required: ['statusCode', 'message'],
    properties: {
      statusCode: { type: 'integer' },
      message: {
        oneOf: [
          { type: 'string' },
          { type: 'array', items: { type: 'string' } },
        ],
      },
      error: { type: 'string' },
      code: { type: 'string' },
      timestamp: { type: 'string' },
      path: { type: 'string' },
    },
  };
  for (const item of Object.values(doc.paths)) {
    for (const operation of Object.values(item)) {
      if (
        !operation ||
        typeof operation !== 'object' ||
        !('responses' in operation)
      )
        continue;
      for (const parameter of operation.parameters ?? []) {
        if (
          'in' in parameter &&
          parameter.in === 'path' &&
          'schema' in parameter
        )
          parameter.schema = { type: 'string', format: 'uuid' };
      }
      for (const status of [
        '400',
        '401',
        '403',
        '404',
        '409',
        '410',
        '413',
        '422',
      ]) {
        operation.responses[status] ??= {
          description: 'Lỗi xử lý hoặc phân quyền',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AdminExamHttpError' },
            },
          },
        };
      }
    }
  }
  writeFileSync('openapi-admin-exam.json', JSON.stringify(doc, null, 2) + '\n');
  await app.close();
}
void main();
