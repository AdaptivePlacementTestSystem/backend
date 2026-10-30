import { describe, it, expect, vi } from 'vitest';
import { HealthController } from './health.controller';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

vi.mock('ioredis', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      connect: vi.fn().mockResolvedValue(undefined),
      ping: vi.fn().mockResolvedValue('PONG'),
      quit: vi.fn().mockResolvedValue('OK'),
      on: vi.fn(),
    })),
  };
});

describe('HealthController', () => {
  it('should return ok for liveness health check', () => {
    const mockPrisma = {} as PrismaService;
    const mockConfig = {} as ConfigService;
    const controller = new HealthController(mockPrisma, mockConfig);

    const result = controller.getHealth();
    expect(result.status).toBe('ok');
    expect(typeof result.uptime).toBe('number');
    expect(result.timestamp).toBeDefined();
  });

  it('should return ready status when database and redis are healthy', async () => {
    const mockPrisma = {
      $queryRaw: vi.fn().mockResolvedValue([{ 1: 1 }]),
    } as unknown as PrismaService;

    const mockConfig = {
      get: vi.fn((key: string) => {
        if (key === 'redis.host') return 'localhost';
        if (key === 'redis.port') return 6379;
        return undefined;
      }),
    } as unknown as ConfigService;

    const controller = new HealthController(mockPrisma, mockConfig);

    const jsonMock = vi.fn();
    const statusMock = vi.fn().mockReturnValue({ json: jsonMock });
    const mockRes = {
      status: statusMock,
    } as any;

    await controller.getReady(mockRes);

    expect(statusMock).toHaveBeenCalled();
  });
});
