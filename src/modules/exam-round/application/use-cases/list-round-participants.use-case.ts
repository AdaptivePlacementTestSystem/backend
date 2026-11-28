import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { ParticipantsQueryDto } from '../dto/participants-query.dto';
import { Workbook } from 'exceljs';
import { isUUID } from 'class-validator';

type Row = {
  studentId: string;
  studentCode: string | null;
  fullName: string;
  note: string | null;
  status: string;
  sessionId: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  expiresAt: Date | null;
  overdue: boolean;
  thetaFinal: number | null;
  cefrLevel: string | null;
};
type Summary = {
  notStarted: number;
  inProgress: number;
  completed: number;
  abandoned: number;
};

@Injectable()
export class ListRoundParticipantsUseCase {
  constructor(private readonly prisma: PrismaService) {}
  async export(
    roundId: string,
    query: {
      format?: string;
      status?: string;
      q?: string;
      studentIds?: string;
    },
  ) {
    const format = query.format ?? 'csv';
    if (
      !['csv', 'xlsx'].includes(format) ||
      (query.status &&
        !['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'ABANDONED'].includes(
          query.status,
        )) ||
      (query.q && query.q.length > 100)
    )
      throw new BadRequestException('Bộ lọc xuất không hợp lệ');
    const ids = query.studentIds ? query.studentIds.split(',') : [];
    if (ids.length > 1000 || ids.some((id) => !isUUID(id)))
      throw new BadRequestException('Danh sách sinh viên không hợp lệ');
    const search = query.q?.trim()
      ? `%${query.q.trim().replace(/[\\%_]/g, '\\$&')}%`
      : null;
    const rows = await this.prisma.$transaction(
      async (tx) => {
        const round = await tx.examRound.findUnique({ where: { id: roundId } });
        if (!round) throw new NotFoundException('Không tìm thấy kỳ thi');
        return tx.$queryRaw<Row[]>(Prisma.sql`
        SELECT u.id AS "studentId", sp.student_code AS "studentCode", u.full_name AS "fullName", p.note,
          COALESCE(s.status::text, 'NOT_STARTED') AS status, s.id AS "sessionId",
          s.started_at AS "startedAt", s.completed_at AS "completedAt", s.expires_at AS "expiresAt",
          COALESCE(s.status::text = 'IN_PROGRESS' AND s.expires_at <= CURRENT_TIMESTAMP, false) AS overdue,
          s.theta_final AS "thetaFinal", lp.cefr_level::text AS "cefrLevel"
        FROM exam_round_participants p JOIN users u ON u.id = p.student_id
        LEFT JOIN student_profiles sp ON sp.user_id = u.id
        LEFT JOIN LATERAL (SELECT ts.id, ts.status, ts.started_at, ts.completed_at, ts.expires_at, ts.theta_final FROM test_sessions ts WHERE ts.exam_round_id = p.round_id AND ts.student_id = p.student_id ORDER BY ts.started_at DESC, ts.id DESC LIMIT 1) s ON true
        LEFT JOIN language_profiles lp ON lp.test_session_id = s.id
        WHERE p.round_id = ${roundId}::uuid
          ${search ? Prisma.sql`AND (sp.student_code ILIKE ${search} OR u.full_name ILIKE ${search})` : Prisma.empty}
          ${query.status ? Prisma.sql`AND COALESCE(s.status::text, 'NOT_STARTED') = ${query.status}` : Prisma.empty}
          ${ids.length ? Prisma.sql`AND u.id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})` : Prisma.empty}
        ORDER BY sp.student_code ASC NULLS LAST, u.id ASC`);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    const headers = [
      'MSSV',
      'Họ tên',
      'Trạng thái',
      'Bắt đầu',
      'Hoàn thành',
      'CEFR',
      'Theta',
    ];
    const values = rows.map((r) => [
      r.studentCode ?? '',
      r.fullName,
      r.status,
      r.startedAt?.toISOString() ?? '',
      r.completedAt?.toISOString() ?? '',
      r.cefrLevel ?? '',
      r.thetaFinal ?? '',
    ]);
    if (format === 'xlsx') {
      const workbook = new Workbook();
      const sheet = workbook.addWorksheet('Ket qua');
      sheet.addRow(headers);
      for (const row of values) sheet.addRow(row);
      return {
        contentType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        filename: 'participants.xlsx',
        data: Buffer.from(await workbook.xlsx.writeBuffer()),
      };
    }
    const escape = (value: string | number) => {
      const text = String(value ?? '');
      const safe = /^[\t\r\n ]*[=+\-@]/.test(text) ? `'${text}` : text;
      return `"${safe.replace(/"/g, '""')}"`;
    };
    return {
      contentType: 'text/csv; charset=utf-8',
      filename: 'participants.csv',
      data: Buffer.from(
        '\uFEFF' +
          [headers, ...values]
            .map((row) => row.map(escape).join(','))
            .join('\r\n'),
        'utf8',
      ),
    };
  }
  async execute(roundId: string, query: ParticipantsQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const offset = (page - 1) * pageSize;
    if (!Number.isSafeInteger(offset))
      throw new BadRequestException('Trang không hợp lệ');
    const text = query.q?.trim();
    const search = text ? `%${text.replace(/[\\%_]/g, '\\$&')}%` : null;
    return this.prisma.$transaction(
      async (tx) => {
        const round = await tx.examRound.findUnique({ where: { id: roundId } });
        if (!round) throw new NotFoundException('Không tìm thấy kỳ thi');
        const base = Prisma.sql`
        FROM exam_round_participants p
        JOIN users u ON u.id = p.student_id
        LEFT JOIN student_profiles sp ON sp.user_id = u.id
        LEFT JOIN LATERAL (
          SELECT ts.id, ts.status, ts.started_at, ts.completed_at, ts.expires_at, ts.theta_final
          FROM test_sessions ts WHERE ts.exam_round_id = p.round_id AND ts.student_id = p.student_id
          ORDER BY ts.started_at DESC, ts.id DESC LIMIT 1
        ) s ON true
        LEFT JOIN language_profiles lp ON lp.test_session_id = s.id
        WHERE p.round_id = ${roundId}::uuid`;
        const filter = Prisma.sql`
        ${search ? Prisma.sql`AND (sp.student_code ILIKE ${search} OR u.full_name ILIKE ${search})` : Prisma.empty}
        ${query.status ? Prisma.sql`AND COALESCE(s.status::text, 'NOT_STARTED') = ${query.status}` : Prisma.empty}`;
        const rows = await tx.$queryRaw<Row[]>(Prisma.sql`
        SELECT u.id AS "studentId", sp.student_code AS "studentCode", u.full_name AS "fullName", p.note,
          COALESCE(s.status::text, 'NOT_STARTED') AS status, s.id AS "sessionId",
          s.started_at AS "startedAt", s.completed_at AS "completedAt", s.expires_at AS "expiresAt",
          COALESCE(s.status::text = 'IN_PROGRESS' AND s.expires_at <= CURRENT_TIMESTAMP, false) AS overdue,
          s.theta_final AS "thetaFinal", lp.cefr_level::text AS "cefrLevel"
        ${base} ${filter} ORDER BY sp.student_code ASC NULLS LAST, u.id ASC LIMIT ${pageSize} OFFSET ${offset}`);
        const [count] = await tx.$queryRaw<{ total: number }[]>(
          Prisma.sql`SELECT COUNT(*)::int AS total ${base} ${filter}`,
        );
        const [summary] = await tx.$queryRaw<Summary[]>(Prisma.sql`
        SELECT COUNT(*) FILTER (WHERE s.id IS NULL)::int AS "notStarted",
          COUNT(*) FILTER (WHERE s.status::text = 'IN_PROGRESS')::int AS "inProgress",
          COUNT(*) FILTER (WHERE s.status::text = 'COMPLETED')::int AS completed,
          COUNT(*) FILTER (WHERE s.status::text = 'ABANDONED')::int AS abandoned
        ${base}`);
        return { data: rows, total: count.total, page, pageSize, summary };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
