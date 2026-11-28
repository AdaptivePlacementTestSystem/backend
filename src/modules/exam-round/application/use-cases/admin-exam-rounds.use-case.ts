import { effectiveStatus } from '../../domain/effective-status';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ExamRoundStatus } from '@apt/shared-types';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { CreateExamRoundDto } from '../dto/create-exam-round.dto';
import { UpdateExamRoundDto } from '../dto/update-exam-round.dto';

@Injectable()
export class AdminExamRoundsUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async removeParticipant(roundId: string, studentId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM exam_rounds WHERE id = ${roundId}::uuid FOR UPDATE`;
      const round = await tx.examRound.findUnique({ where: { id: roundId } });
      if (!round) throw new NotFoundException('Không tìm thấy kỳ thi');
      if (effectiveStatus(round, new Date()) === ExamRoundStatus.CLOSED)
        throw new ConflictException('Không thể gỡ thí sinh khỏi kỳ đã đóng');
      const participant = await tx.examRoundParticipant.findUnique({
        where: { roundId_studentId: { roundId, studentId } },
      });
      if (!participant)
        throw new NotFoundException('Không tìm thấy thí sinh trong kỳ');
      if (
        await tx.testSession.count({
          where: { examRoundId: roundId, studentId },
        })
      )
        throw new ConflictException('Không thể gỡ thí sinh đã có phiên thi');
      if (
        effectiveStatus(round, new Date()) !== ExamRoundStatus.DRAFT &&
        (await tx.examRoundParticipant.count({ where: { roundId } })) <= 1
      )
        throw new ConflictException(
          'Kỳ đã công bố phải có ít nhất một thí sinh',
        );
      await tx.examRoundParticipant.delete({
        where: { roundId_studentId: { roundId, studentId } },
      });
      return { removed: true };
    });
  }

  async list() {
    const now = new Date();
    const rounds = await this.prisma.examRound.findMany({
      include: { _count: { select: { participants: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return rounds.map(({ _count, ...round }) => ({
      ...round,
      participantCount: _count.participants,
      effectiveStatus: effectiveStatus(round, now),
    }));
  }

  async create(dto: CreateExamRoundDto, createdById: string) {
    const name = dto.name.trim();
    const opensAt = new Date(dto.opensAt);
    const closesAt = new Date(dto.closesAt);
    if (
      !name ||
      !Number.isFinite(opensAt.getTime()) ||
      !Number.isFinite(closesAt.getTime()) ||
      closesAt <= opensAt
    ) {
      throw new BadRequestException(
        'Tên kỳ thi và khung thời gian không hợp lệ',
      );
    }
    if (dto.durationMinutes * 60000 > closesAt.getTime() - opensAt.getTime()) {
      throw new BadRequestException(
        'Thời lượng không được vượt quá khung thời gian kỳ thi',
      );
    }
    return this.prisma.examRound.create({
      data: {
        name,
        opensAt,
        closesAt,
        durationMinutes: dto.durationMinutes,
        createdById,
      },
    });
  }

  async update(id: string, dto: UpdateExamRoundDto) {
    if (Object.values(dto).every((value) => value === undefined)) {
      throw new BadRequestException('Không có thông tin cần cập nhật');
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM exam_rounds WHERE id = ${id}::uuid FOR UPDATE`;
      const round = await tx.examRound.findUnique({ where: { id } });
      if (!round) throw new NotFoundException('Không tìm thấy kỳ thi');
      const now = new Date();
      const status = effectiveStatus(round, now);
      if (status === ExamRoundStatus.CLOSED) {
        throw new ConflictException('Kỳ thi đã đóng không được sửa');
      }
      if (
        status !== ExamRoundStatus.DRAFT &&
        (dto.name !== undefined || dto.durationMinutes !== undefined)
      ) {
        throw new ConflictException('Kỳ đã công bố chỉ được sửa thời gian');
      }
      const opensAt =
        dto.opensAt === undefined ? round.opensAt : new Date(dto.opensAt);
      const closesAt =
        dto.closesAt === undefined ? round.closesAt : new Date(dto.closesAt);
      const durationMinutes = dto.durationMinutes ?? round.durationMinutes;
      const name = dto.name === undefined ? round.name : dto.name.trim();
      if (
        !name ||
        !Number.isFinite(opensAt.getTime()) ||
        !Number.isFinite(closesAt.getTime()) ||
        closesAt <= opensAt ||
        durationMinutes * 60000 > closesAt.getTime() - opensAt.getTime()
      ) {
        throw new BadRequestException(
          'Tên kỳ thi và khung thời gian không hợp lệ',
        );
      }
      if (status === ExamRoundStatus.SCHEDULED && opensAt <= now) {
        throw new ConflictException('Thời điểm mở phải ở tương lai');
      }
      if (
        status === ExamRoundStatus.OPEN &&
        (dto.opensAt !== undefined ||
          (dto.closesAt !== undefined && closesAt <= round.closesAt))
      ) {
        throw new ConflictException(
          'Kỳ đang mở chỉ được kéo dài thời điểm đóng',
        );
      }
      return tx.examRound.update({
        where: { id },
        data: { name, opensAt, closesAt, durationMinutes },
      });
    });
  }

  async publish(id: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM exam_rounds WHERE id = ${id}::uuid FOR UPDATE`;
      const round = await tx.examRound.findUnique({ where: { id } });
      if (!round) throw new NotFoundException('Không tìm thấy kỳ thi');
      const now = new Date();
      if (
        effectiveStatus(round, now) !== ExamRoundStatus.DRAFT ||
        round.opensAt <= now
      ) {
        throw new ConflictException(
          'Chỉ công bố kỳ nháp có thời điểm mở ở tương lai',
        );
      }
      if (
        round.closesAt <= round.opensAt ||
        round.durationMinutes < 5 ||
        round.durationMinutes > 180 ||
        round.durationMinutes * 60000 >
          round.closesAt.getTime() - round.opensAt.getTime()
      ) {
        throw new ConflictException('Khung thời gian kỳ thi không hợp lệ');
      }
      const count = await tx.examRoundParticipant.count({
        where: { roundId: id },
      });
      if (count === 0)
        throw new ConflictException('Kỳ thi cần ít nhất một thí sinh');
      return tx.examRound.update({
        where: { id },
        data: { status: ExamRoundStatus.SCHEDULED },
      });
    });
  }

  async close(id: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM exam_rounds WHERE id = ${id}::uuid FOR UPDATE`;
      const round = await tx.examRound.findUnique({ where: { id } });
      if (!round) throw new NotFoundException('Không tìm thấy kỳ thi');
      const status = effectiveStatus(round, new Date());
      if (status !== ExamRoundStatus.DRAFT && status !== ExamRoundStatus.OPEN) {
        throw new ConflictException('Chỉ hủy kỳ nháp hoặc đóng kỳ đang mở');
      }
      return tx.examRound.update({
        where: { id },
        data: { status: ExamRoundStatus.CLOSED },
      });
    });
  }
}
