import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';

@Injectable()
export class GetErrorPatternsUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(examRoundId?: string) {
    return this.prisma.$queryRaw<
      Array<{
        topicTag: string;
        skill: string;
        studentCount: number;
        errorRate: number;
      }>
    >(Prisma.sql`
      SELECT i.topic_tag AS "topicTag", i.skill::text AS skill,
        COUNT(DISTINCT s.student_id)::int AS "studentCount",
        AVG(CASE WHEN r.is_correct THEN 0.0 ELSE 1.0 END)::float8 AS "errorRate"
      FROM session_responses r
      JOIN test_sessions s ON s.id = r.session_id
      JOIN items i ON i.id = r.item_id
      WHERE s.status = 'COMPLETED' AND i.topic_tag IS NOT NULL AND i.topic_tag <> ''
        ${examRoundId ? Prisma.sql`AND s.exam_round_id = ${examRoundId}::uuid` : Prisma.empty}
      GROUP BY i.topic_tag, i.skill
      ORDER BY "errorRate" DESC, i.topic_tag, i.skill
    `);
  }
}
