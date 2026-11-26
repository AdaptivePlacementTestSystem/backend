import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, it, vi } from 'vitest';
import request from 'supertest';
import { AdminItemBatchesController } from './admin-item-batches.controller';
import { GetAdminBatchUseCase } from '../application/get-admin-batch.use-case';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';

describe('API lô câu hỏi: phân quyền', () => {
  let app: INestApplication;
  const getAdminBatch = {
    list: vi.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 }),
    execute: vi.fn().mockResolvedValue({ total: 0 }),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AdminItemBatchesController],
      providers: [
        RolesGuard,
        { provide: GetAdminBatchUseCase, useValue: getAdminBatch },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: {
          switchToHttp(): {
            getRequest(): {
              headers: Record<string, string>;
              user?: { role: string };
            };
          };
        }) => {
          const req = context.switchToHttp().getRequest();
          req.user = { role: req.headers['x-test-role'] };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });

  it('chặn GV và SV, cho Admin xem danh sách', async () => {
    await request(app.getHttpServer())
      .get('/item-batches')
      .set('x-test-role', 'TEACHER')
      .expect(403);
    await request(app.getHttpServer())
      .get('/item-batches')
      .set('x-test-role', 'STUDENT')
      .expect(403);
    await request(app.getHttpServer())
      .get('/item-batches')
      .set('x-test-role', 'ADMIN')
      .expect(200);
  });
  it('kiểm tra UUID và phân trang qua HTTP', async () => {
    await request(app.getHttpServer())
      .get('/item-batches/not-a-uuid')
      .set('x-test-role', 'ADMIN')
      .expect(400);
    await request(app.getHttpServer())
      .get('/item-batches?page=0')
      .set('x-test-role', 'ADMIN')
      .expect(400);
    await request(app.getHttpServer())
      .get('/item-batches/2c2db1b1-9670-4e3c-a126-a6825f84ca56')
      .set('x-test-role', 'ADMIN')
      .expect(200);
  });
});
