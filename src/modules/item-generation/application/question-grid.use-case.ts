import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { isUUID } from 'class-validator';
import { ParseQuestionSpreadsheetUseCase } from './parse-question-spreadsheet.use-case';
import { RedisQuestionGridStore } from '../infrastructure/redis-question-grid.store';
import { SaveQuestionImportUseCase } from './save-question-import.use-case';

@Injectable()
export class QuestionGridUseCase {
  constructor(
    private readonly parse: ParseQuestionSpreadsheetUseCase,
    private readonly grid: RedisQuestionGridStore,
    private readonly saveImport: SaveQuestionImportUseCase,
  ) {}

  async upload(
    adminId: string,
    file: { buffer: Buffer; originalname: string; size: number } | undefined,
  ) {
    await this.load(adminId);
    const parsed = await this.parse.execute(file);
    const rows = parsed.rows.map(({ candidate }) => ({
      // Duplicate identity follows the parser's normalized question text.
      rowKey: createHash('sha256')
        .update(
          candidate.content
            .normalize('NFKC')
            .trim()
            .replace(/\s+/g, ' ')
            .toLowerCase(),
        )
        .digest('hex'),
      candidate,
    }));
    const added = rows.length ? await this.grid.merge(adminId, rows) : 0;
    const snapshot = await this.grid.snapshot(adminId);
    return {
      added,
      duplicates: rows.length - added,
      rejected: parsed.rejected,
      rows: snapshot?.rows ?? [],
      operationId: snapshot?.operationId ?? null,
    };
  }

  async load(adminId: string) {
    const snapshot = await this.grid.snapshot(adminId);
    if (
      snapshot &&
      (await this.saveImport.findExisting(adminId, snapshot.operationId))
    ) {
      await this.grid.clearCommitted(adminId, snapshot.operationId);
      return { rows: [], operationId: null, expired: false };
    }
    return {
      rows: snapshot?.rows ?? [],
      operationId: snapshot?.operationId ?? null,
      expired: await this.grid.hasExpired(adminId),
    };
  }
  async remove(adminId: string, rowKey: string) {
    await this.grid.remove(adminId, rowKey);
    return this.load(adminId);
  }
  async clear(adminId: string) {
    await this.grid.clear(adminId);
    return { rows: [], operationId: null, expired: false };
  }

  async save(adminId: string, body: { operationId?: unknown; name?: unknown }) {
    if (
      !body ||
      typeof body.operationId !== 'string' ||
      !isUUID(body.operationId) ||
      (body.name !== undefined &&
        (typeof body.name !== 'string' || body.name.length > 100))
    )
      throw new BadRequestException('Mã thao tác hoặc tên lô không hợp lệ');
    const operationId = body.operationId;
    const prior = await this.saveImport.findExisting(adminId, operationId);
    if (prior) {
      await this.grid.clearCommitted(adminId, operationId);
      return prior;
    }
    const token = randomUUID();
    if (!(await this.grid.acquireSave(adminId, token)))
      throw new ConflictException('Lưới đang được lưu');
    try {
      const retry = await this.saveImport.findExisting(adminId, operationId);
      if (retry) {
        await this.grid.clearCommitted(adminId, operationId);
        return retry;
      }
      const snapshot = await this.grid.snapshot(adminId);
      if (!snapshot)
        throw new GoneException('Lưới đã hết hạn hoặc không tồn tại');
      if (snapshot.operationId !== operationId)
        throw new ConflictException('Lưới đã thay đổi, hãy tải lại');
      if (!snapshot.rows.length)
        throw new UnprocessableEntityException('Lưới không có câu hỏi');
      const result = await this.saveImport.execute(adminId, {
        operationId,
        name: body.name as string | undefined,
        rows: snapshot.rows.map((row) => row.candidate),
      });
      await this.grid.clearCommitted(adminId, operationId);
      return result;
    } finally {
      await this.grid.releaseSave(adminId, token);
    }
  }
}
