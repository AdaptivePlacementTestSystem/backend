import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './presentation/auth.controller';
import { LoginUseCase } from './application/use-cases/login.use-case';
import { VerifyTokenUseCase } from './application/use-cases/verify-token.use-case';
import { PrismaUserRepository } from './infrastructure/persistence/prisma-user.repository';
import { JwtProvider } from './infrastructure/providers/jwt.provider';
import { JwtStrategy } from './infrastructure/providers/jwt.strategy';

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
  ],
  controllers: [AuthController],
  providers: [
    LoginUseCase,
    VerifyTokenUseCase,
    JwtProvider,
    JwtStrategy,
    {
      provide: 'IUserRepository',
      useClass: PrismaUserRepository,
    },
  ],
  exports: [JwtProvider, 'IUserRepository', PassportModule],
})
export class AuthModule {}
