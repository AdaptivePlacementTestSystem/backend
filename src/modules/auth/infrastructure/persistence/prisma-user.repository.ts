import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { IUserRepository } from '../../domain/repositories/user.repository.interface';
import { UserEntity } from '../../domain/entities/user.entity';
import { UserRole } from '../../domain/enums/user-role.enum';
import { AuthProviderType } from '../../domain/enums/auth-provider-type.enum';

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
