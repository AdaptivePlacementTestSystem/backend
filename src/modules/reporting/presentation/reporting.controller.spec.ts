import { describe, it, expect, vi } from 'vitest';
import { ValidationPipe } from '@nestjs/common';
import { ROLES_KEY } from '../../../shared/decorators/roles.decorator';
import { UserRole } from '../../auth/domain/enums/user-role.enum';
import { ReportingController } from './reporting.controller';
import { OverviewQueryDto } from '../application/dto/overview-query.dto';

const pipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  forbidNonWhitelisted: true,
});

describe('ReportingController: GET /reports/overview', () => {
  it('chỉ ADMIN xem được tổng quan; báo cáo lớp vẫn mở cho TEACHER và ADMIN', () => {
    const proto = ReportingController.prototype;
    expect(Reflect.getMetadata(ROLES_KEY, proto.getOverview)).toEqual([
      UserRole.ADMIN,
    ]);
    expect(Reflect.getMetadata(ROLES_KEY, proto.getDistribution)).toEqual([
      UserRole.TEACHER,
      UserRole.ADMIN,
    ]);
  });

  it('chuyển examRoundId sang use-case', async () => {
    const overview = { execute: vi.fn().mockResolvedValue({}) };
    const controller = new ReportingController(
      {} as any,
      {} as any,
      overview as any,
      {} as any,
      {} as any,
    );

    await controller.getOverview({ examRoundId: 'r-1' });
    await controller.getOverview({});

    expect(overview.execute).toHaveBeenNthCalledWith(1, 'r-1');
    expect(overview.execute).toHaveBeenNthCalledWith(2, undefined);
  });

  it('examRoundId phải là UUID, không nhận tham số lạ', async () => {
    const run = (value: unknown) =>
      pipe.transform(value, { type: 'query', metatype: OverviewQueryDto });

    await expect(run({})).resolves.toBeInstanceOf(OverviewQueryDto);
    await expect(
      run({ examRoundId: '3f2b8a52-6c1d-4f8e-9a57-1b2c3d4e5f60' }),
    ).resolves.toBeInstanceOf(OverviewQueryDto);
    await expect(run({ examRoundId: 'khong-phai-uuid' })).rejects.toBeDefined();
    await expect(run({ other: 1 })).rejects.toBeDefined();
  });
});
