import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './presentation/auth.controller';
import { LoginUseCase } from './application/use-cases/login.use-case';
import { VerifyTokenUseCase } from './application/use-cases/verify-token.use-case';
import { ChangePasswordUseCase } from './application/use-cases/change-password.use-case';
import { ForgotPasswordUseCase } from './application/use-cases/forgot-password.use-case';
import { ResetPasswordUseCase } from './application/use-cases/reset-password.use-case';
import { PrismaUserRepository } from './infrastructure/persistence/prisma-user.repository';
import { RedisOtpCacheService } from './infrastructure/cache/redis-otp-cache.service';
import { JwtProvider } from './infrastructure/providers/jwt.provider';
import { JwtStrategy } from './infrastructure/providers/jwt.strategy';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('jwt.secret'),
        signOptions: {
          expiresIn: (config.get<string>('jwt.expiresIn') || '1h') as any,
        },
      }),
    }),
    MailModule,
  ],
  controllers: [AuthController],
  providers: [
    LoginUseCase,
    VerifyTokenUseCase,
    ChangePasswordUseCase,
    ForgotPasswordUseCase,
    ResetPasswordUseCase,
    JwtProvider,
    JwtStrategy,
    {
      provide: 'IUserRepository',
      useClass: PrismaUserRepository,
    },
    {
      provide: 'IOtpCacheRepository',
      useClass: RedisOtpCacheService,
    },
    RedisOtpCacheService,
  ],
  exports: [
    JwtProvider,
    'IUserRepository',
    'IOtpCacheRepository',
    PassportModule,
  ],
})
export class AuthModule {}
