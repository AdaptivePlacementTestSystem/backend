import { ImportQuestionBatchesController } from './presentation/import-question-batches.controller';
import { ParseQuestionSpreadsheetUseCase } from './application/parse-question-spreadsheet.use-case';
import { SaveQuestionImportUseCase } from './application/save-question-import.use-case';
import { CheckExactDuplicatesUseCase } from './application/check-exact-duplicates.use-case';
import { CheckNearDuplicatesUseCase } from './application/check-near-duplicates.use-case';
import { CheckSemanticDuplicatesUseCase } from './application/check-semantic-duplicates.use-case';
import { RunBatchChecksUseCase } from './application/run-batch-checks.use-case';
import { LlmGatewayModule } from '../llm-gateway/llm-gateway.module';
import { CreateAiBatchController } from './presentation/create-ai-batch.controller';
import { CreateAiBatchUseCase } from './application/create-ai-batch.use-case';
import { Module } from '@nestjs/common';
import { AdminItemBatchesController } from './presentation/admin-item-batches.controller';
import { AssignBatchController } from './presentation/assign-batch.controller';
import { GetAdminBatchUseCase } from './application/get-admin-batch.use-case';
import { UpdateBatchDeadlinesUseCase } from './application/update-batch-deadlines.use-case';
import { AssignBatchUseCase } from './application/assign-batch.use-case';
import { RefreshBatchStatusUseCase } from './application/refresh-batch-status.use-case';
import { FinalCheckBatchUseCase } from './application/final-check-batch.use-case';
import { DecideFlagUseCase } from './application/decide-flag.use-case';
import { ImportBatchUseCase } from './application/import-batch.use-case';
import { FinalizeBatchController } from './presentation/finalize-batch.controller';
import { TeacherReviewController } from './presentation/teacher-review.controller';
import { TeacherReviewUseCase } from './application/teacher-review.use-case';

@Module({
  imports: [LlmGatewayModule],
  controllers: [
    AdminItemBatchesController,
    AssignBatchController,
    CreateAiBatchController,
    ImportQuestionBatchesController,
    FinalizeBatchController,
    TeacherReviewController,
  ],
  providers: [
    GetAdminBatchUseCase,
    AssignBatchUseCase,
    UpdateBatchDeadlinesUseCase,
    CreateAiBatchUseCase,
    CheckExactDuplicatesUseCase,
    CheckNearDuplicatesUseCase,
    CheckSemanticDuplicatesUseCase,
    RunBatchChecksUseCase,
    ParseQuestionSpreadsheetUseCase,
    SaveQuestionImportUseCase,
    RefreshBatchStatusUseCase,
    FinalCheckBatchUseCase,
    DecideFlagUseCase,
    ImportBatchUseCase,
    TeacherReviewUseCase,
  ],
})
export class ItemGenerationModule {}
