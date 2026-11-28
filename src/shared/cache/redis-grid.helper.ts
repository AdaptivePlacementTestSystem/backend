import {
  BadRequestException,
  ConflictException,
  type Logger,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';

export interface RedisGridConfig {
  ttl: number;
  maxRows: number;
  markerTtl: number;
}

export function readGridConfig(config: ConfigService): RedisGridConfig {
  const ttl = config.get<number>('accountImport.gridTtlSeconds') ?? 1800;
  const maxRows = config.get<number>('accountImport.maxRows') ?? 1000;
  const markerTtl = Math.max(
    ttl + 1,
    config.get<number>('accountImport.jobTtlSeconds') ?? 3600,
  );
  return { ttl, maxRows, markerTtl };
}

export function createGridRedisClient(
  config: ConfigService,
  logger: Logger,
  warningMessage: string,
): Redis {
  const client = new Redis({
    host: config.get<string>('redis.host') ?? 'localhost',
    port: config.get<number>('redis.port') ?? 6379,
    maxRetriesPerRequest: 1,
  });
  client.on('error', () => logger.warn(warningMessage));
  return client;
}

export function parseGridSnapshot<T>(
  entries: Record<string, string>,
): { operationId: string; rows: T[] } | null {
  if (!entries.__grid__) return null;
  const operationId = entries.__operation__;
  if (!operationId)
    throw new ConflictException('Lưới thiếu mã thao tác; hãy xóa và tải lại');
  delete entries.__grid__;
  delete entries.__operation__;
  return {
    operationId,
    rows: Object.values(entries).map((value) => JSON.parse(value) as T),
  };
}

export async function evalGridMerge(
  redis: Redis,
  script: string,
  keys: [string, string, string],
  rows: unknown[],
  cfg: RedisGridConfig,
): Promise<number> {
  const result = await redis.eval(
    script,
    3,
    keys[0],
    keys[1],
    keys[2],
    JSON.stringify(rows),
    cfg.maxRows,
    cfg.ttl,
    cfg.markerTtl,
    randomUUID(),
  );
  if (result === -2) throw new ConflictException('Lưới đang được lưu');
  if (result === -1)
    throw new BadRequestException('Lưới vượt số dòng cho phép');
  return Number(result);
}
