import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  PARAMTYPES_METADATA,
  SELF_DECLARED_DEPS_METADATA,
  CONTROLLER_WATERMARK,
} from '@nestjs/common/constants';
import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ProfileAccessGuard } from '../modules/language-profile/presentation/guards/profile-access.guard';
import { EduZApiKeyGuard } from '../modules/language-profile/presentation/guards/eduz-api-key.guard';
import { JwtAuthGuard } from '../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../shared/guards/roles.guard';
import { AuthThrottlerGuard } from '../modules/auth/infrastructure/throttling/auth-throttler.guard';
import { createOpenApiDocument } from './contract';

function findControllers(directory: string): any[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return findControllers(path);
    if (!entry.name.endsWith('.controller.js')) return [];
    const exports = require(path) as Record<string, unknown>;
    return Object.values(exports).filter(
      (value) =>
        typeof value === 'function' &&
        Reflect.getMetadata(CONTROLLER_WATERMARK, value),
    );
  });
}
const controllers = findControllers(join(__dirname, '..', 'modules')).sort(
  (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
);
const tokens = new Set<any>();
for (const controller of controllers) {
  const types: any[] =
    Reflect.getMetadata(PARAMTYPES_METADATA, controller) ?? [];
  const injected: { index: number; param: any }[] =
    Reflect.getMetadata(SELF_DECLARED_DEPS_METADATA, controller) ?? [];
  for (const { index, param } of injected) types[index] = param;
  for (const token of types) if (token) tokens.add(token);
}
@Module({
  controllers,
  providers: [...tokens].map((provide) => ({ provide, useValue: {} })),
})
class ContractModule {}

async function main() {
  const builder = Test.createTestingModule({ imports: [ContractModule] });
  for (const guard of [
    JwtAuthGuard,
    RolesGuard,
    AuthThrottlerGuard,
    ProfileAccessGuard,
    EduZApiKeyGuard,
  ]) {
    builder.overrideGuard(guard).useValue({ canActivate: () => true });
  }
  const module = await builder.compile();
  const app = module.createNestApplication();
  app.setGlobalPrefix('api/v1');
  const document = createOpenApiDocument(app, 'api/v1', [ContractModule]);
  const inventoryDocument = SwaggerModule.createDocument(
    app,
    new DocumentBuilder().setTitle('API inventory').setVersion('1').build(),
    { include: [ContractModule] },
  );
  const inventory = Object.entries(inventoryDocument.paths)
    .flatMap(([path, methods]) =>
      Object.keys(methods)
        .filter((method) =>
          ['get', 'post', 'put', 'patch', 'delete'].includes(method),
        )
        .map((method) => ({
          method: method.toUpperCase(),
          path,
          contract: document.paths[path]?.[method] ? 'documented' : 'pending',
        })),
    )
    .sort(
      (a, b) =>
        a.path.localeCompare(b.path, 'en') ||
        a.method.localeCompare(b.method, 'en'),
    );
  writeFileSync('openapi.json', JSON.stringify(document, null, 2) + '\n');
  writeFileSync(
    'openapi-inventory.json',
    JSON.stringify(inventory, null, 2) + '\n',
  );
  await app.close();
}
void main();
