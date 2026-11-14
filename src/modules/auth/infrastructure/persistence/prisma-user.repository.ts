import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { IUserRepository } from '../../domain/repositories/user.repository.interface';
import { UserEntity } from '../../domain/entities/user.entity';
import { UserRole } from '../../domain/enums/user-role.enum';
import { AuthProviderType } from '../../domain/enums/auth-provider-type.enum';
import type {
  AccountChanges,
  AccountKind,
  AccountProfile,
  AccountQuery,
  AccountRecord,
  Paged,
} from '../../domain/repositories/account.types';
import {
  DuplicateAccountError,
  type DuplicateField,
} from '../../domain/errors/duplicate-account.error';

@Injectable()
export class PrismaUserRepository implements IUserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<UserEntity | null> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    return user ? this.toDomain(user) : null;
  }

  async findByEmail(email: string): Promise<UserEntity | null> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    return user ? this.toDomain(user) : null;
  }

  async findByExternalId(
    provider: string,
    externalId: string,
  ): Promise<UserEntity | null> {
    const user = await this.prisma.user.findFirst({
      where: {
        authProvider: provider as any,
        externalId,
      },
    });
    return user ? this.toDomain(user) : null;
  }

  async save(user: UserEntity): Promise<UserEntity> {
    const saved = await this.prisma.user.upsert({
      where: { id: user.id },
      create: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role as any,
        passwordHash: user.passwordHash,
        authProvider: user.authProvider as any,
        externalId: user.externalId,
        mustChangePassword: user.mustChangePassword,
        isActive: user.isActive,
        passwordChangedAt: user.passwordChangedAt,
      },
      update: {
        email: user.email,
        fullName: user.fullName,
        role: user.role as any,
        passwordHash: user.passwordHash,
        authProvider: user.authProvider as any,
        externalId: user.externalId,
        mustChangePassword: user.mustChangePassword,
        isActive: user.isActive,
        passwordChangedAt: user.passwordChangedAt,
      },
    });
    return this.toDomain(saved);
  }

  async updatePassword(
    userId: string,
    passwordHash: string,
    options: { mustChangePassword?: boolean } = {},
  ): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        mustChangePassword: options.mustChangePassword ?? false,
        passwordChangedAt: new Date(),
      },
    });
  }

  async findByStudentCode(studentCode: string): Promise<UserEntity | null> {
    const profile = await this.prisma.studentProfile.findUnique({
      where: { studentCode },
      include: { user: true },
    });
    return profile ? this.toDomain(profile.user) : null;
  }

  async findByTeacherCode(teacherCode: string): Promise<UserEntity | null> {
    const profile = await this.prisma.teacherProfile.findUnique({
      where: { teacherCode },
      include: { user: true },
    });
    return profile ? this.toDomain(profile.user) : null;
  }

  async createAccount(
    user: UserEntity,
    profile: AccountProfile,
  ): Promise<AccountRecord> {
    try {
      // Tạo lồng nhau trong một lệnh ghi: user và hồ sơ cùng thành công hoặc cùng thất bại.
      const saved = await this.prisma.user.create({
        data: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          role: user.role as any,
          passwordHash: user.passwordHash,
          authProvider: user.authProvider as any,
          externalId: user.externalId,
          mustChangePassword: user.mustChangePassword,
          isActive: user.isActive,
          passwordChangedAt: user.passwordChangedAt,
          ...(profile.kind === 'STUDENT'
            ? {
                studentProfile: {
                  create: { studentCode: profile.studentCode },
                },
              }
            : {
                teacherProfile: {
                  create: { teacherCode: profile.teacherCode },
                },
              }),
        },
      });
      return { user: this.toDomain(saved), profile };
    } catch (error) {
      throw this.mapUniqueViolation(error, profile.kind) ?? error;
    }
  }

  async findAccountById(
    id: string,
    kind: AccountKind,
  ): Promise<AccountRecord | null> {
    const raw = await this.prisma.user.findFirst({
      where: { id, role: this.rolesOf(kind) as any },
      include: { studentProfile: true, teacherProfile: true },
    });
    return raw ? this.toAccountRecord(raw, kind) : null;
  }

  async findAccounts(query: AccountQuery): Promise<Paged<AccountRecord>> {
    const q = query.q?.trim();
    const profileRelation =
      query.kind === 'STUDENT' ? 'studentProfile' : 'teacherProfile';
    const codeField = query.kind === 'STUDENT' ? 'studentCode' : 'teacherCode';
    const where: any = {
      role: this.rolesOf(query.kind),
      ...(q
        ? {
            OR: [
              { email: { contains: q, mode: 'insensitive' } },
              { fullName: { contains: q, mode: 'insensitive' } },
              {
                [profileRelation]: {
                  [codeField]: { contains: q, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        include: { studentProfile: true, teacherProfile: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return {
      items: rows.map((row) => this.toAccountRecord(row, query.kind)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async updateAccount(
    id: string,
    kind: AccountKind,
    changes: AccountChanges,
  ): Promise<AccountRecord> {
    try {
      const raw = await this.prisma.user.update({
        where: { id },
        data: {
          ...(changes.fullName !== undefined
            ? { fullName: changes.fullName }
            : {}),
          ...(changes.email !== undefined ? { email: changes.email } : {}),
        },
        include: { studentProfile: true, teacherProfile: true },
      });
      return this.toAccountRecord(raw, kind);
    } catch (error) {
      throw this.mapUniqueViolation(error, kind) ?? error;
    }
  }

  async findAccountByUserId(id: string): Promise<AccountRecord | null> {
    const raw = await this.prisma.user.findUnique({
      where: { id },
      include: { studentProfile: true, teacherProfile: true },
    });
    if (!raw) return null;
    return this.toAccountRecord(
      raw,
      raw.role === UserRole.STUDENT ? 'STUDENT' : 'TEACHER',
    );
  }

  async findTakenEmails(emails: string[]): Promise<Set<string>> {
    if (emails.length === 0) return new Set();
    const rows = await this.prisma.user.findMany({
      where: { email: { in: emails } },
      select: { email: true },
    });
    return new Set(rows.map((row) => row.email.toLowerCase()));
  }

  async findTakenCodes(
    kind: AccountKind,
    codes: string[],
  ): Promise<Set<string>> {
    if (codes.length === 0) return new Set();
    if (kind === 'STUDENT') {
      const rows = await this.prisma.studentProfile.findMany({
        where: { studentCode: { in: codes } },
        select: { studentCode: true },
      });
      return new Set(rows.map((row) => row.studentCode));
    }
    const rows = await this.prisma.teacherProfile.findMany({
      where: { teacherCode: { in: codes } },
      select: { teacherCode: true },
    });
    return new Set(rows.map((row) => row.teacherCode));
  }

  async createAccounts(
    items: ReadonlyArray<{ user: UserEntity; profile: AccountProfile }>,
  ): Promise<void> {
    if (items.length === 0) return;
    try {
      // $transaction([...]) chạy các lệnh tạo lồng nhau trong cùng một transaction: một lỗi thì hoàn tác tất cả.
      await this.prisma.$transaction(
        items.map(({ user, profile }) =>
          this.prisma.user.create({
            data: {
              id: user.id,
              email: user.email,
              fullName: user.fullName,
              role: user.role as any,
              passwordHash: user.passwordHash,
              authProvider: user.authProvider as any,
              externalId: user.externalId,
              mustChangePassword: user.mustChangePassword,
              isActive: user.isActive,
              passwordChangedAt: user.passwordChangedAt,
              ...(profile.kind === 'STUDENT'
                ? {
                    studentProfile: {
                      create: { studentCode: profile.studentCode },
                    },
                  }
                : {
                    teacherProfile: {
                      create: { teacherCode: profile.teacherCode },
                    },
                  }),
            },
          }),
        ),
      );
    } catch (error) {
      throw this.mapUniqueViolation(error, items[0].profile.kind) ?? error;
    }
  }

  async setActive(id: string, isActive: boolean): Promise<void> {
    await this.prisma.user.update({ where: { id }, data: { isActive } });
  }

  async updateRole(id: string, role: UserRole): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: { role: role as any },
    });
  }

  /**
   * Vai trò thuộc mỗi loại tài khoản: danh sách giảng viên gồm cả Admin (Admin vốn là giảng viên
   * được nâng quyền; cần hiện trong tab Giảng viên để thu hồi, SRS L0).
   */
  private rolesOf(kind: AccountKind): { in: string[] } {
    return { in: kind === 'STUDENT' ? ['STUDENT'] : ['TEACHER', 'ADMIN'] };
  }

  private toAccountRecord(raw: any, kind: AccountKind): AccountRecord {
    const user = this.toDomain(raw);
    return kind === 'STUDENT'
      ? {
          user,
          profile: { kind, studentCode: raw.studentProfile?.studentCode ?? '' },
        }
      : {
          user,
          profile: { kind, teacherCode: raw.teacherProfile?.teacherCode ?? '' },
        };
  }

  /** Đổi lỗi P2002 của Prisma thành lỗi miền; lỗi khác trả undefined. */
  private mapUniqueViolation(
    error: unknown,
    kind: AccountKind,
  ): DuplicateAccountError | undefined {
    const e = error as { code?: string; meta?: { target?: unknown } };
    if (e?.code !== 'P2002') return undefined;
    const rawTarget = e.meta?.target;
    const target = (
      Array.isArray(rawTarget)
        ? rawTarget.join(',')
        : typeof rawTarget === 'string'
          ? rawTarget
          : ''
    ).toLowerCase();
    let field: DuplicateField = 'email';
    if (target.includes('student_code')) field = 'studentCode';
    else if (target.includes('teacher_code')) field = 'teacherCode';
    else if (!target.includes('email')) {
      field = kind === 'STUDENT' ? 'studentCode' : 'teacherCode';
    }
    return new DuplicateAccountError(field);
  }

  private toDomain(raw: any): UserEntity {
    return new UserEntity(
      raw.id,
      raw.email,
      raw.fullName,
      raw.role as UserRole,
      raw.passwordHash,
      raw.authProvider as AuthProviderType,
      raw.externalId,
      raw.mustChangePassword,
      raw.isActive,
      raw.passwordChangedAt,
      raw.createdAt,
    );
  }
}
