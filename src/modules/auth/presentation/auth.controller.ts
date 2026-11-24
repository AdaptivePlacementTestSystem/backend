import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Get,
  UseGuards,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { SkipThrottle } from '@nestjs/throttler';
import { LoginFailureLimiter } from '../infrastructure/throttling/login-failure-limiter';
import {
  ApiOkResponse,
  ApiAcceptedResponse,
  ApiNoContentResponse,
  ApiBearerAuth,
  ApiProperty,
} from '@nestjs/swagger';
import { AuthThrottlerGuard } from '../infrastructure/throttling/auth-throttler.guard';
import { AllowWhenMustChangePassword } from '../../../shared/decorators/allow-when-must-change-password.decorator';
import { LoginUseCase } from '../application/use-cases/login.use-case';
import { ChangePasswordUseCase } from '../application/use-cases/change-password.use-case';
import { ForgotPasswordUseCase } from '../application/use-cases/forgot-password.use-case';
import { ResetPasswordUseCase } from '../application/use-cases/reset-password.use-case';
import { LoginDto, AuthResponseDto } from '../application/dto/login.dto';
import {
  ChangePasswordDto,
  ChangePasswordResponseDto,
} from '../application/dto/change-password.dto';
import { ForgotPasswordDto } from '../application/dto/forgot-password.dto';
import { ResetPasswordDto } from '../application/dto/reset-password.dto';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import {
  CurrentUser,
  JwtPayload,
} from '../../../shared/decorators/current-user.decorator';

class AuthProfileResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() email: string;
  @ApiProperty() fullName: string;
  @ApiProperty() role: string;
  @ApiProperty({ nullable: true, type: String }) studentCode: string | null;
  @ApiProperty({ nullable: true, type: String }) teacherCode: string | null;
  @ApiProperty() mustChangePassword: boolean;
}

class ForgotPasswordResponseDto {
  @ApiProperty() success: boolean;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly loginUseCase: LoginUseCase,
    private readonly changePasswordUseCase: ChangePasswordUseCase,
    private readonly forgotPasswordUseCase: ForgotPasswordUseCase,
    private readonly resetPasswordUseCase: ResetPasswordUseCase,
    private readonly prisma: PrismaService,
    private readonly loginFailureLimiter: LoginFailureLimiter,
  ) {}

  @Post('login')
  @ApiOkResponse({ type: AuthResponseDto })
  @UseGuards(AuthThrottlerGuard)
  @SkipThrottle({ forgot: true, reset: true })
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
  ): Promise<AuthResponseDto> {
    // Giới hạn theo IP chỉ đếm lần thất bại (DECISIONS_LOG #135)
    return this.loginFailureLimiter.run(req.ip ?? 'unknown', () =>
      this.loginUseCase.execute(dto),
    );
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOkResponse({ type: AuthProfileResponseDto })
  @UseGuards(JwtAuthGuard)
  @AllowWhenMustChangePassword()
  async getProfile(@CurrentUser() user: JwtPayload) {
    const fullUser = await this.prisma.user.findUnique({
      where: { id: user.sub },
      include: {
        studentProfile: true,
        teacherProfile: true,
      },
    });
    return {
      id: user.sub,
      email: fullUser?.email ?? user.email,
      fullName: fullUser?.fullName ?? '',
      role: fullUser?.role ?? user.role,
      studentCode: fullUser?.studentProfile?.studentCode ?? null,
      teacherCode: fullUser?.teacherProfile?.teacherCode ?? null,
      mustChangePassword: fullUser?.mustChangePassword ?? false,
    };
  }

  @Post('change-password')
  @ApiBearerAuth()
  @ApiOkResponse({ type: ChangePasswordResponseDto })
  @UseGuards(JwtAuthGuard)
  @AllowWhenMustChangePassword()
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ChangePasswordDto,
  ): Promise<ChangePasswordResponseDto> {
    return this.changePasswordUseCase.execute(user.sub, dto);
  }

  @Post('forgot-password')
  @ApiAcceptedResponse({ type: ForgotPasswordResponseDto })
  @UseGuards(AuthThrottlerGuard)
  @SkipThrottle({ login: true, reset: true })
  @HttpCode(HttpStatus.ACCEPTED)
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
  ): Promise<{ success: boolean }> {
    return this.forgotPasswordUseCase.execute(dto);
  }

  @Post('reset-password')
  @ApiNoContentResponse()
  @UseGuards(AuthThrottlerGuard)
  @SkipThrottle({ login: true, forgot: true })
  @HttpCode(HttpStatus.NO_CONTENT)
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    await this.resetPasswordUseCase.execute(dto);
  }
}
