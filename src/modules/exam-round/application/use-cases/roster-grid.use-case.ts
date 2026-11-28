import {
  BadRequestException,
  ConflictException,
  GoneException,
  UnprocessableEntityException,
  Logger,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ExamRoundStatus, UserRole, ErrorCode } from '@apt/shared-types';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { effectiveStatus } from '../../domain/effective-status';
import { ExcelRosterParser } from '../../infrastructure/excel-roster.parser';
import {
  RedisRosterGridStore,
  type RosterGridRow,
} from '../../infrastructure/redis-roster-grid.store';

@Injectable()
export class RosterGridUseCase {
  private readonly logger = new Logger(RosterGridUseCase.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly parser: ExcelRosterParser,
    private readonly grid: RedisRosterGridStore,
  ) {}

  private async ensureEditable(roundId: string): Promise<void> {
    const round = await this.prisma.examRound.findUnique({
      where: { id: roundId },
    });
    if (!round) throw new NotFoundException('Không tìm thấy kỳ thi');
    const status = effectiveStatus(round, new Date());
    if (
      status !== ExamRoundStatus.DRAFT &&
      status !== ExamRoundStatus.SCHEDULED
    ) {
      throw new ConflictException('Chỉ nhập danh sách khi kỳ chưa mở');
    }
  }

  private async currentGrid(adminId: string, roundId: string) {
    const snapshot = await this.grid.snapshot(adminId, roundId);
    if (!snapshot) return null;
    const committed = await this.prisma.rosterImportEvent.findUnique({
      where: { operationId: snapshot.operationId },
    });
    if (
      committed &&
      committed.adminId === adminId &&
      committed.roundId === roundId
    ) {
      await this.grid.clearCommitted(adminId, roundId, snapshot.operationId);
      return this.grid.snapshot(adminId, roundId);
    }
    return snapshot;
  }

  async upload(
    adminId: string,
    roundId: string,
    file?: { buffer: Buffer; originalname: string },
  ) {
    await this.ensureEditable(roundId);
    if (!file) throw new BadRequestException('Chưa chọn file .xlsx');
    const rows = await this.parser.read(file);
    const rejected: { row: number; studentCode: string; reason: string }[] = [];
    const candidates = rows.filter((row) => {
      if (!row.error) return true;
      rejected.push({
        row: row.row,
        studentCode: row.studentCode,
        reason: row.error,
      });
      return false;
    });
    const profiles = await this.prisma.studentProfile.findMany({
      where: {
        studentCode: { in: candidates.map((row) => row.studentCode) },
        user: { role: UserRole.STUDENT },
      },
      select: { studentCode: true, userId: true },
    });
    const byCode = new Map(
      profiles.map((profile) => [profile.studentCode, profile.userId]),
    );
    const existing = await this.prisma.examRoundParticipant.findMany({
      where: {
        roundId,
        studentId: { in: profiles.map((profile) => profile.userId) },
      },
      select: { studentId: true },
    });
    const inRound = new Set(existing.map((entry) => entry.studentId));
    const seen = new Set<string>();
    const valid: RosterGridRow[] = [];
    for (const row of candidates) {
      const studentId = byCode.get(row.studentCode);
      if (!studentId) {
        rejected.push({
          row: row.row,
          studentCode: row.studentCode,
          reason: 'MSSV không tồn tại',
        });
      } else if (seen.has(studentId)) {
        rejected.push({
          row: row.row,
          studentCode: row.studentCode,
          reason: 'Trùng MSSV trong file',
        });
      } else if (inRound.has(studentId)) {
        seen.add(studentId);
        rejected.push({
          row: row.row,
          studentCode: row.studentCode,
          reason: 'Đã có trong kỳ',
        });
      } else {
        seen.add(studentId);
        valid.push({ studentId, studentCode: row.studentCode, note: row.note });
      }
    }
    await this.currentGrid(adminId, roundId);
    const added = valid.length
      ? await this.grid.merge(adminId, roundId, valid)
      : 0;
    const snapshot = await this.currentGrid(adminId, roundId);
    if (snapshot === null && (await this.grid.hasExpired(adminId, roundId))) {
      throw new GoneException({
        code: ErrorCode.IMPORT_GRID_EXPIRED,
        message: 'Lưới danh sách thi đã hết hạn',
      });
    }
    return {
      grid: snapshot?.rows ?? [],
      operationId: snapshot?.operationId ?? null,
      rejected,
      added,
      ignoredDuplicates: valid.length - added,
    };
  }

  async template(roundId: string): Promise<Buffer> {
    await this.ensureEditable(roundId);
    return this.parser.template();
  }

  async load(adminId: string, roundId: string) {
    await this.ensureEditable(roundId);
    const snapshot = await this.currentGrid(adminId, roundId);
    if (snapshot === null && (await this.grid.hasExpired(adminId, roundId))) {
      throw new GoneException({
        code: ErrorCode.IMPORT_GRID_EXPIRED,
        message: 'Lưới danh sách thi đã hết hạn',
      });
    }
    return {
      grid: snapshot?.rows ?? [],
      operationId: snapshot?.operationId ?? null,
    };
  }
  async remove(adminId: string, roundId: string, studentId: string) {
    await this.ensureEditable(roundId);
    if (await this.grid.hasExpired(adminId, roundId))
      throw new GoneException({
        code: ErrorCode.IMPORT_GRID_EXPIRED,
        message: 'Lưới danh sách thi đã hết hạn',
      });
    await this.grid.remove(adminId, roundId, studentId);
    return this.load(adminId, roundId);
  }
  async clear(adminId: string, roundId: string): Promise<void> {
    await this.ensureEditable(roundId);
    await this.grid.clear(adminId, roundId);
  }

  async save(adminId: string, roundId: string, operationId: string) {
    const previous = await this.prisma.rosterImportEvent.findUnique({
      where: { operationId },
    });
    if (previous) {
      if (previous.adminId !== adminId || previous.roundId !== roundId)
        throw new ConflictException('Mã thao tác không hợp lệ');
      await this.grid
        .clearCommitted(adminId, roundId, operationId)
        .catch(() => this.logger.warn('Không thể dọn lưới đã lưu'));
      return { operationId, added: previous.addedCount };
    }
    const token = randomUUID();
    if (!(await this.grid.acquireSave(adminId, roundId, token)))
      throw new ConflictException('Lưới đang được lưu');
    try {
      // Yêu cầu khác có thể commit sau lần đọc đầu và trước khi ta lấy được khóa Redis.
      const committed = await this.prisma.rosterImportEvent.findUnique({
        where: { operationId },
      });
      if (committed) {
        if (committed.adminId !== adminId || committed.roundId !== roundId)
          throw new ConflictException('Mã thao tác không hợp lệ');
        await this.grid
          .clearCommitted(adminId, roundId, operationId)
          .catch(() => this.logger.warn('Không thể dọn lưới đã lưu'));
        return { operationId, added: committed.addedCount };
      }
      const snapshot = await this.grid.snapshot(adminId, roundId);
      if (!snapshot) {
        if (await this.grid.hasExpired(adminId, roundId))
          throw new GoneException({
            code: ErrorCode.IMPORT_GRID_EXPIRED,
            message: 'Lưới danh sách thi đã hết hạn',
          });
        throw new UnprocessableEntityException({
          code: ErrorCode.IMPORT_GRID_EMPTY,
          message: 'Lưới danh sách thi trống',
        });
      }
      if (snapshot.operationId !== operationId)
        throw new ConflictException('Lưới đã thay đổi, hãy tải lại');
      if (!snapshot.rows.length)
        throw new UnprocessableEntityException({
          code: ErrorCode.IMPORT_GRID_EMPTY,
          message: 'Lưới danh sách thi trống',
        });
      const result = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM exam_rounds WHERE id = ${roundId}::uuid FOR UPDATE`;
        const round = await tx.examRound.findUnique({ where: { id: roundId } });
        if (!round) throw new NotFoundException('Không tìm thấy kỳ thi');
        const existingOperation = await tx.rosterImportEvent.findUnique({
          where: { operationId },
        });
        if (existingOperation) {
          if (
            existingOperation.adminId !== adminId ||
            existingOperation.roundId !== roundId
          )
            throw new ConflictException('Mã thao tác không hợp lệ');
          return existingOperation.addedCount;
        }
        const status = effectiveStatus(round, new Date());
        if (
          status !== ExamRoundStatus.DRAFT &&
          status !== ExamRoundStatus.SCHEDULED
        )
          throw new ConflictException('Chỉ lưu danh sách khi kỳ chưa mở');
        const ids = snapshot.rows.map((row) => row.studentId);
        const students = await tx.user.count({
          where: { id: { in: ids }, role: UserRole.STUDENT },
        });
        if (students !== ids.length)
          throw new ConflictException(
            'Một số sinh viên không còn hợp lệ; hãy tải lại',
          );
        const duplicates = await tx.examRoundParticipant.count({
          where: { roundId, studentId: { in: ids } },
        });
        if (duplicates)
          throw new ConflictException(
            'Một số sinh viên đã có trong kỳ; hãy tải lại',
          );
        await tx.examRoundParticipant.createMany({
          data: snapshot.rows.map((row) => ({
            roundId,
            studentId: row.studentId,
            note: row.note || null,
          })),
        });
        await tx.rosterImportEvent.create({
          data: { operationId, roundId, adminId, addedCount: ids.length },
        });
        return ids.length;
      });
      await this.grid
        .clearCommitted(adminId, roundId, operationId)
        .catch(() => this.logger.warn('Không thể dọn lưới đã lưu'));
      return { operationId, added: result };
    } finally {
      await this.grid
        .releaseSave(adminId, roundId, token)
        .catch(() => this.logger.warn('Không thể giải phóng khóa lưới'));
    }
  }
}
