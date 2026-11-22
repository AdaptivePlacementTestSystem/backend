import { effectiveStatus } from '../../domain/effective-status';
import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { CreateExamRoundDto } from '../dto/create-exam-round.dto';

@Injectable()
export class AdminExamRoundsUseCase {
  constructor(private readonly prisma: PrismaService) {}

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
}
