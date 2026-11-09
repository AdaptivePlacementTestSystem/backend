import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import type { JwtSignOptions } from '@nestjs/jwt';
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
import { ThrottlerModule } from '@nestjs/throttler';
import Redis from 'ioredis';
import { RedisThrottlerStorage } from './infrastructure/throttling/redis-throttler.storage';
import { AuthThrottlerGuard } from './infrastructure/throttling/auth-throttler.guard';
import {
  forgotPasswordTracker,
  loginTracker,
} from './infrastructure/throttling/throttle-trackers';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('jwt.secret'),
        signOptions: {
          expiresIn: (config.get<string>('jwt.expiresIn') ||
            '1h') as JwtSignOptions['expiresIn'],
        },
      }),
    }),
    // Rate-limit cho login / forgot-password (D3): bộ đếm lưu trên Redis
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            name: 'login',
            ttl: config.getOrThrow<number>('rateLimit.loginTtlSeconds') * 1000,
            limit: config.getOrThrow<number>('rateLimit.loginLimit'),
            getTracker: loginTracker,
          },
          {
            name: 'forgot',
            ttl: config.getOrThrow<number>('rateLimit.forgotTtlSeconds') * 1000,
            limit: config.getOrThrow<number>('rateLimit.forgotLimit'),
            getTracker: forgotPasswordTracker,
          },
        ],
        storage: new RedisThrottlerStorage(
          new Redis({
            host: config.get<string>('redis.host') ?? 'localhost',
            port: config.get<number>('redis.port') ?? 6379,
            maxRetriesPerRequest: 1,
          }),
        ),
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
    AuthThrottlerGuard,
    {
      provide: 'IUserRepository',
      useClass: PrismaUserRepository,
    },
    RedisOtpCacheService,
    {
      provide: 'IOtpCacheRepository',
      useExisting: RedisOtpCacheService,
    },
  ],
  exports: [
    JwtProvider,
    'IUserRepository',
    'IOtpCacheRepository',
    PassportModule,
  ],
})
export class AuthModule {}
