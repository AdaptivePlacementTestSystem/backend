/* Runtime smoke tests for the three core JSON responses, using fake services. */
require('reflect-metadata');
const { Module, ValidationPipe } = require('@nestjs/common');
const { Test } = require('@nestjs/testing');
const {
  PARAMTYPES_METADATA,
  SELF_DECLARED_DEPS_METADATA,
} = require('@nestjs/common/constants');
const request = require('supertest');
const assert = require('node:assert/strict');
const {
  AuthController,
} = require('../dist/modules/auth/presentation/auth.controller');
const {
  TestSessionController,
} = require('../dist/modules/test-session/presentation/test-session.controller');
const { JwtAuthGuard } = require('../dist/shared/guards/jwt-auth.guard');
const { RolesGuard } = require('../dist/shared/guards/roles.guard');
const {
  AuthThrottlerGuard,
} = require('../dist/modules/auth/infrastructure/throttling/auth-throttler.guard');
const { createOpenApiDocument } = require('../dist/openapi/contract');

const controllers = [AuthController, TestSessionController];
const tokens = new Set();
for (const controller of controllers) {
  const types = Reflect.getMetadata(PARAMTYPES_METADATA, controller) || [];
  for (const { index, param } of Reflect.getMetadata(
    SELF_DECLARED_DEPS_METADATA,
    controller,
  ) || [])
    types[index] = param;
  types.filter(Boolean).forEach((token) => tokens.add(token));
}
const fixtures = {
  LoginUseCase: {
    execute: async () => ({
      accessToken: 'fake-token',
      user: {
        id: 's',
        email: 's@example.test',
        fullName: 'Test',
        role: 'STUDENT',
        mustChangePassword: false,
      },
    }),
  },
  LoginFailureLimiter: { run: async (_ip, fn) => fn() },
  StartSessionUseCase: {
    execute: async () => ({
      sessionId: 's1',
      expiresAt: new Date('2026-11-24T00:00:00Z'),
    }),
  },
  SubmitResponseUseCase: { execute: async () => ({ shouldStop: false }) },
  PrismaTestSessionRepository: { findById: async () => ({ studentId: 's' }) },
};
class ContractTestModule {}
Module({
  controllers,
  providers: [...tokens].map((provide) => ({
    provide,
    useValue: fixtures[provide.name] || {},
  })),
})(ContractTestModule);

function check(schema, value, document) {
  if (schema.$ref)
    return check(
      document.components.schemas[schema.$ref.split('/').pop()],
      value,
      document,
    );
  if (schema.oneOf)
    return assert(
      schema.oneOf.some((candidate) => {
        try {
          check(candidate, value, document);
          return true;
        } catch {
          return false;
        }
      }),
    );
  if (schema.type === 'object') {
    assert(value && typeof value === 'object' && !Array.isArray(value));
    for (const name of schema.required || [])
      assert(Object.hasOwn(value, name), `missing ${name}`);
    for (const [name, property] of Object.entries(schema.properties || {}))
      if (Object.hasOwn(value, name)) check(property, value[name], document);
  } else if (schema.type === 'array') {
    assert(Array.isArray(value));
    for (const item of value) check(schema.items, item, document);
  } else if (schema.type) assert.equal(typeof value, schema.type);
  if (schema.enum) assert(schema.enum.includes(value));
}

async function main() {
  const builder = Test.createTestingModule({ imports: [ContractTestModule] });
  builder.overrideGuard(JwtAuthGuard).useValue({
    canActivate: (ctx) => {
      ctx.switchToHttp().getRequest().user = { sub: 's', role: 'STUDENT' };
      return true;
    },
  });
  for (const guard of [RolesGuard, AuthThrottlerGuard])
    builder.overrideGuard(guard).useValue({ canActivate: () => true });
  const module = await builder.compile();
  const app = module.createNestApplication();
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  await app.init();
  try {
    const spec = createOpenApiDocument(app);
    const cases = [
      [
        'post',
        '/api/v1/auth/login',
        '/api/v1/auth/login',
        200,
        { email: 's@example.test', password: 'test' },
      ],
      [
        'post',
        '/api/v1/sessions',
        '/api/v1/sessions',
        201,
        { examRoundId: '123e4567-e89b-42d3-a456-426614174000' },
      ],
      [
        'post',
        '/api/v1/sessions/{id}/responses',
        '/api/v1/sessions/s1/responses',
        200,
        { itemId: 'i', response: 'A' },
      ],
    ];
    for (const [method, path, url, status, body] of cases) {
      const response = await request(app.getHttpServer())
        [method](url)
        .send(body)
        .expect(status);
      const schema =
        spec.paths[path][method].responses[status].content['application/json']
          .schema;
      check(schema, response.body, spec);
    }
    console.log('OpenAPI HTTP smoke tests passed: login, start and submit');
  } finally {
    await app.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
