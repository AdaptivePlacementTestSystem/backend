import { AdminExamRoundsUseCase } from './application/use-cases/admin-exam-rounds.use-case';
import { Module } from '@nestjs/common';
import { ExamRoundController } from './presentation/exam-round.controller';
import { GetStudentExamRoundsUseCase } from './application/use-cases/get-student-exam-rounds.use-case';
import { GetExamRoundDetailUseCase } from './application/use-cases/get-exam-round-detail.use-case';
import { TestSessionModule } from '../test-session/test-session.module';

@Module({
  imports: [TestSessionModule],
  controllers: [ExamRoundController],
  providers: [
    AdminExamRoundsUseCase,
    GetStudentExamRoundsUseCase,
    GetExamRoundDetailUseCase,
  ],
  exports: [GetStudentExamRoundsUseCase, GetExamRoundDetailUseCase],
})
export class ExamRoundModule {}
