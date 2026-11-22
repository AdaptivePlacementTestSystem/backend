import { ValidationPipe } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { ROLES_KEY } from '../../../shared/decorators/roles.decorator';
import { UserRole } from '../../auth/domain/enums/user-role.enum';
import { CreateExamRoundDto } from '../application/dto/create-exam-round.dto';
import { ExamRoundController } from './exam-round.controller';

const pipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  forbidNonWhitelisted: true,
});
const valid = {
  name: 'Kỳ thi',
  opensAt: '2026-10-24T01:00:00.000Z',
  closesAt: '2026-10-24T03:00:00.000Z',
  durationMinutes: 45,
};
const validate = (value: unknown) =>
  pipe.transform(value, { type: 'body', metatype: CreateExamRoundDto });

describe('Admin exam round endpoints', () => {
  it('restricts list and create to ADMIN', () => {
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        Object.getOwnPropertyDescriptor(ExamRoundController.prototype, 'list')!
          .value,
      ),
    ).toEqual([UserRole.ADMIN]);
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        Object.getOwnPropertyDescriptor(
          ExamRoundController.prototype,
          'create',
        )!.value,
      ),
    ).toEqual([UserRole.ADMIN]);
  });
  it('validates required fields, duration bounds and forbids fields outside the schema', async () => {
    await expect(validate(valid)).resolves.toBeInstanceOf(CreateExamRoundDto);
    for (const invalid of [
      { ...valid, durationMinutes: 4 },
      { ...valid, durationMinutes: 181 },
      { ...valid, durationMinutes: 45.5 },
      { ...valid, opensAt: 'invalid' },
      { ...valid, name: '' },
      { ...valid, status: 'OPEN' },
      { ...valid, code: 'DEMO' },
    ]) {
      await expect(validate(invalid)).rejects.toBeDefined();
    }
  });
});
