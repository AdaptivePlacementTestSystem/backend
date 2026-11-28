import { AdminExamRoundsUseCase } from './application/use-cases/admin-exam-rounds.use-case';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { RosterGridController } from './presentation/roster-grid.controller';
import { RosterGridUseCase } from './application/use-cases/roster-grid.use-case';
import { ListRoundParticipantsUseCase } from './application/use-cases/list-round-participants.use-case';
import { ExcelRosterParser } from './infrastructure/excel-roster.parser';
import { RedisRosterGridStore } from './infrastructure/redis-roster-grid.store';
import { ExamRoundController } from './presentation/exam-round.controller';
import { GetStudentExamRoundsUseCase } from './application/use-cases/get-student-exam-rounds.use-case';
import { GetExamRoundDetailUseCase } from './application/use-cases/get-exam-round-detail.use-case';
import { TestSessionModule } from '../test-session/test-session.module';

@Module({
  imports: [
    TestSessionModule,
    MulterModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        limits: {
          fileSize: config.get<number>('accountImport.maxFileBytes') ?? 2097152,
          files: 1,
        },
      }),
    }),
  ],
  controllers: [ExamRoundController, RosterGridController],
  providers: [
    AdminExamRoundsUseCase,
    RosterGridUseCase,
    ListRoundParticipantsUseCase,
    ExcelRosterParser,
    RedisRosterGridStore,
    GetStudentExamRoundsUseCase,
    GetExamRoundDetailUseCase,
  ],
  exports: [GetStudentExamRoundsUseCase, GetExamRoundDetailUseCase],
})
export class ExamRoundModule {}
