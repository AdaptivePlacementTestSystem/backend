import { UserRole } from '../enums/user-role.enum';
import { AuthProviderType } from '../enums/auth-provider-type.enum';

/**
 * Domain Entity User — thuần TypeScript, không phụ thuộc NestJS hay Prisma.
 */
export class UserEntity {
  constructor(
    public readonly id: string,
    public readonly email: string,
    public readonly fullName: string,
    public readonly role: UserRole,
    public readonly passwordHash: string | null = null,
    public readonly authProvider: AuthProviderType | null = null,
    public readonly externalId: string | null = null,
    public readonly mustChangePassword: boolean = false,
    public readonly isActive: boolean = true,
    public readonly passwordChangedAt: Date | null = null,
    public readonly createdAt: Date = new Date(),
  ) {}

  isAdmin(): boolean {
    return this.role === UserRole.ADMIN;
  }

  isTeacher(): boolean {
    return this.role === UserRole.TEACHER;
  }

  isStudent(): boolean {
    return this.role === UserRole.STUDENT;
  }
}
