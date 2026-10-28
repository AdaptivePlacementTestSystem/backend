import { Controller, Post, Body, HttpCode, HttpStatus, Get, UseGuards } from '@nestjs/common';
import { LoginUseCase } from '../application/use-cases/login.use-case';
import { LoginDto, AuthResponseDto } from '../application/dto/login.dto';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../../../shared/decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly loginUseCase: LoginUseCase,
    private readonly prisma: PrismaService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto): Promise<AuthResponseDto> {
    return this.loginUseCase.execute(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
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
}
