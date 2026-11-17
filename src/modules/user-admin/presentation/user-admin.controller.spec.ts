import { describe, it, expect, vi } from 'vitest';
import { ValidationPipe } from '@nestjs/common';
import { ROLES_KEY } from '../../../shared/decorators/roles.decorator';
import { UserRole } from '../../auth/domain/enums/user-role.enum';
import { UserAdminController } from './user-admin.controller';
import {
  CreateStudentDto,
  CreateTeacherDto,
  ListAccountsQueryDto,
  UpdateAccountDto,
} from '../application/dto/account.dto';

const pipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  forbidNonWhitelisted: true,
});

const validateDto = (type: any, value: unknown) =>
  pipe.transform(value, { type: 'body', metatype: type });

describe('UserAdminController', () => {
  it('chỉ ADMIN được truy cập (BR-16)', () => {
    expect(Reflect.getMetadata(ROLES_KEY, UserAdminController)).toEqual([
      UserRole.ADMIN,
    ]);
  });

  it('chuyển loại STUDENT/TEACHER đúng cho từng route', async () => {
    const create = { execute: vi.fn().mockResolvedValue({}) };
    const list = { execute: vi.fn().mockResolvedValue({}) };
    const update = { execute: vi.fn().mockResolvedValue({}) };
    const controller = new UserAdminController(
      create as any,
      list as any,
      update as any,
    );

    await controller.createStudent({
      studentCode: '1',
      fullName: 'A',
      email: 'a@e.com',
    });
    await controller.createTeacher({
      teacherCode: 'G1',
      fullName: 'B',
      email: 'b@e.com',
    });
    await controller.listStudents({ q: 'x' });
    await controller.listTeachers({});
    await controller.updateStudent('id-1', { fullName: 'C' });
    await controller.updateTeacher('id-2', { email: 'c@e.com' });

    expect(create.execute.mock.calls[0][0]).toMatchObject({ kind: 'STUDENT' });
    expect(create.execute.mock.calls[1][0]).toMatchObject({ kind: 'TEACHER' });
    expect(list.execute.mock.calls[0][0]).toMatchObject({
      kind: 'STUDENT',
      q: 'x',
    });
    expect(list.execute.mock.calls[1][0]).toMatchObject({ kind: 'TEACHER' });
    expect(update.execute.mock.calls[0][0]).toMatchObject({
      kind: 'STUDENT',
      id: 'id-1',
    });
    expect(update.execute.mock.calls[1][0]).toMatchObject({
      kind: 'TEACHER',
      id: 'id-2',
    });
  });

  describe('kiểm tra dữ liệu vào (DTO)', () => {
    it('tạo sinh viên hợp lệ', async () => {
      await expect(
        validateDto(CreateStudentDto, {
          studentCode: '20110001',
          fullName: 'A',
          email: 'a@e.com',
        }),
      ).resolves.toBeInstanceOf(CreateStudentDto);
    });

    it('thiếu MSSV, email sai định dạng và trường lạ đều bị từ chối', async () => {
      await expect(
        validateDto(CreateStudentDto, { fullName: 'A', email: 'a@e.com' }),
      ).rejects.toBeDefined();
      await expect(
        validateDto(CreateStudentDto, {
          studentCode: '1',
          fullName: 'A',
          email: 'khong-phai-email',
        }),
      ).rejects.toBeDefined();
      await expect(
        validateDto(CreateStudentDto, {
          studentCode: '1',
          fullName: 'A',
          email: 'a@e.com',
          role: 'ADMIN',
        }),
      ).rejects.toBeDefined();
    });

    it('tạo giảng viên cần mã GV, không nhận studentCode', async () => {
      await expect(
        validateDto(CreateTeacherDto, {
          teacherCode: 'GV1',
          fullName: 'B',
          email: 'b@e.com',
        }),
      ).resolves.toBeInstanceOf(CreateTeacherDto);
      await expect(
        validateDto(CreateTeacherDto, {
          studentCode: '1',
          fullName: 'B',
          email: 'b@e.com',
        }),
      ).rejects.toBeDefined();
    });

    it('sửa tài khoản không nhận role, isActive hay mật khẩu', async () => {
      await expect(
        validateDto(UpdateAccountDto, { fullName: 'C' }),
      ).resolves.toBeDefined();
      await expect(
        validateDto(UpdateAccountDto, { role: 'ADMIN' }),
      ).rejects.toBeDefined();
      await expect(
        validateDto(UpdateAccountDto, { isActive: false }),
      ).rejects.toBeDefined();
    });

    it('tham số danh sách: ép kiểu số, cỡ trang tối đa 100', async () => {
      const ok = (await pipe.transform(
        { page: '2', pageSize: '50' },
        { type: 'query', metatype: ListAccountsQueryDto },
      )) as ListAccountsQueryDto;
      expect(ok.page).toBe(2);
      expect(ok.pageSize).toBe(50);

      await expect(
        pipe.transform(
          { pageSize: '1000' },
          { type: 'query', metatype: ListAccountsQueryDto },
        ),
      ).rejects.toBeDefined();
    });
  });
});
