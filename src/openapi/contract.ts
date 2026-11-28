import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { INestApplication, Type } from '@nestjs/common';

export function createOpenApiDocument(
  app: INestApplication,
  prefix = 'api/v1',
  modules?: Type<unknown>[],
) {
  const config = new DocumentBuilder()
    .setTitle('Adaptive Placement Test API — Auth and Test Session')
    .setVersion('1.0.0')
    .addBearerAuth()
    .addApiKey(
      { type: 'apiKey', in: 'header', name: 'X-Eduz-API-Key' },
      'eduzApiKey',
    )
    .build();
  const document = SwaggerModule.createDocument(app, config, {
    ...(modules ? { include: modules } : {}),
    operationIdFactory: (controller, method) => `${controller}_${method}`,
  });
  const base = '/' + prefix.replace(/^\/+|\/+$/g, '');
  const included = new Set(
    [
      '/auth/login',
      '/auth/me',
      '/auth/change-password',
      '/auth/forgot-password',
      '/auth/reset-password',
      '/exam-rounds/mine',
      '/exam-rounds',
      '/exam-rounds/{id}',
      '/exam-rounds/{id}/publish',
      '/exam-rounds/{id}/close',
      '/exam-rounds/{id}/participants',
      '/exam-rounds/{id}/participants/{studentId}',
      '/exam-rounds/{id}/participants/export',
      '/exam-rounds/{roundId}/participants/import/upload',
      '/exam-rounds/{roundId}/participants/import/grid',
      '/exam-rounds/{roundId}/participants/import/grid/{studentId}',
      '/exam-rounds/{roundId}/participants/import/save',
      '/exam-rounds/{roundId}/participants/import/template',
      '/exam-rounds/{id}/session/current',
      '/reports/overview',
      '/reports/class-distribution',
      '/reports/distribution',
      '/reports/error-patterns',
      '/reports/exam-rounds',
      '/reports/export-csv',
      '/teacher/tasks/reviews',
      '/teacher/tasks/reviews/{batchId}',
      '/teacher/tasks/confirms',
      '/teacher/tasks/confirms/{batchId}',
      '/teacher/tasks/confirms/{batchId}/confirm-all',
      '/teacher/items/{id}',
      '/teacher/items/{id}/approve',
      '/teacher/items/{id}/reject',
      '/teacher/items/{id}/confirm',
      '/teacher/items/{id}/remove',
      '/health',
      '/ready',
      '/items',
      '/items/{id}',
      '/items/generate-explanation',
      '/explanations/items/{itemId}',
      '/placement-profiles/{studentCode}',
      '/placement-profiles/{studentCode}/history',
      '/placement-profiles/{studentCode}/eduz-export',
      '/students',
      '/students/{id}',
      '/teachers',
      '/teachers/{id}',
      '/users/{id}/lock',
      '/users/{id}/unlock',
      '/users/{id}/resend-temporary-password',
      '/users/{id}/role',
      '/users/import/upload',
      '/users/import/grid',
      '/users/import/grid/{rowKey}',
      '/users/import/save',
      '/users/import/save-status',
      '/users/import/template',
      '/sessions',
      '/sessions/active',
      '/sessions/{id}/next-item',
      '/sessions/{id}/responses',
      '/sessions/{id}/resume',
      '/sessions/{id}/result',
      '/sessions/{id}/review',
    ].map((path) => base + path),
  );
  document.paths = Object.fromEntries(
    Object.entries(document.paths).filter(([path]) => included.has(path)),
  );
  document.components ??= {};
  document.components.schemas ??= {};
  document.components.schemas.HttpErrorResponse = {
    type: 'object',
    required: ['statusCode', 'message', 'error', 'timestamp', 'path'],
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
      details: {},
      timestamp: { type: 'string', format: 'date-time' },
      path: { type: 'string' },
    },
  };
  for (const [path, item] of Object.entries(document.paths)) {
    if (path === `${base}/health` || path === `${base}/ready`) continue;
    for (const operation of Object.values(item)) {
      if (
        !operation ||
        typeof operation !== 'object' ||
        !('responses' in operation)
      )
        continue;
      const statuses = path.startsWith(`${base}/auth/`)
        ? [400, 401, 403, 429]
        : path.startsWith(`${base}/users/import/`) ||
            path.startsWith(`${base}/teacher/`)
          ? [400, 401, 403, 404, 409, 410, 413, 422]
          : [400, 401, 403, 404, 409];
      for (const status of statuses) {
        operation.responses[status] ??= {
          description:
            'Lỗi HTTP có thể xảy ra; không phải mọi trạng thái áp dụng cho mọi trường hợp.',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/HttpErrorResponse' },
            },
          },
        };
      }
    }
  }
  return document;
}
