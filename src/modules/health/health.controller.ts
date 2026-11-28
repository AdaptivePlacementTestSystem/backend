import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { ApiOkResponse, ApiProperty, ApiResponse } from '@nestjs/swagger';

class HealthResponseDto {
  @ApiProperty({ enum: ['ok'] }) status: string;
  @ApiProperty() uptime: number;
  @ApiProperty({ format: 'date-time' }) timestamp: string;
}
class ReadinessChecksDto {
  @ApiProperty({ enum: ['up', 'down'] }) database: string;
  @ApiProperty({ enum: ['up', 'down'] }) redis: string;
}
class ReadinessResponseDto {
  @ApiProperty({ enum: ['ok', 'degraded'] }) status: string;
  @ApiProperty({ type: ReadinessChecksDto }) checks: ReadinessChecksDto;
  @ApiProperty({ format: 'date-time' }) timestamp: string;
}

@Controller()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  @Get('health')
  @ApiOkResponse({ type: HealthResponseDto })
  getHealth() {
    return {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  @ApiOkResponse({ type: ReadinessResponseDto })
  @ApiResponse({ status: 503, type: ReadinessResponseDto })
  async getReady(@Res() res: Response) {
    const checks: Record<string, string> = {
      database: 'down',
      redis: 'down',
    };

    let isReady = true;

    // Kiểm tra PostgreSQL qua Prisma
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = 'up';
    } catch {
      isReady = false;
    }

    // Kiểm tra Redis
    try {
      const redisHost = this.configService.getOrThrow<string>('redis.host');
      const redisPort = this.configService.getOrThrow<number>('redis.port');
      const redis = new Redis({
        host: redisHost,
        port: redisPort,
        connectTimeout: 2000,
        lazyConnect: true,
        enableOfflineQueue: false,
        retryStrategy: () => null,
      });
      await redis.connect();
      const pong = await redis.ping();
      await redis.quit();
      if (pong === 'PONG') {
        checks.redis = 'up';
      } else {
        isReady = false;
      }
    } catch {
      isReady = false;
    }

    const statusCode = isReady ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE;
    return res.status(statusCode).json({
      status: isReady ? 'ok' : 'degraded',
      checks,
      timestamp: new Date().toISOString(),
    });
  }
}
