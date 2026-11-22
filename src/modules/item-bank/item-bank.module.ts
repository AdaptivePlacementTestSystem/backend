import { Module } from '@nestjs/common';
import { ItemBankController } from './presentation/item-bank.controller';
import { TeacherReviewController } from './presentation/teacher-review.controller';
import { ItemService } from './application/services/item.service';
import { ListItemsUseCase } from './application/use-cases/list-items.use-case';
import { GetItemUseCase } from './application/use-cases/get-item.use-case';
import { GenerateExplanationUseCase } from './application/use-cases/generate-explanation.use-case';
import { GetTeacherReviewTasksUseCase } from './application/use-cases/review/get-teacher-review-tasks.use-case';
import { GetBatchItemsForReviewUseCase } from './application/use-cases/review/get-batch-items-for-review.use-case';
import { EditItemUseCase } from './application/use-cases/review/edit-item.use-case';
import { ReviewItemUseCase } from './application/use-cases/review/review-item.use-case';
import { GetTeacherConfirmTasksUseCase } from './application/use-cases/review/get-teacher-confirm-tasks.use-case';
import { GetBatchItemsForConfirmUseCase } from './application/use-cases/review/get-batch-items-for-confirm.use-case';
import { ConfirmItemUseCase } from './application/use-cases/review/confirm-item.use-case';
import { ConfirmAllItemsUseCase } from './application/use-cases/review/confirm-all-items.use-case';
import { PrismaItemRepository } from './infrastructure/persistence/prisma-item.repository';
import { AiExplainerModule } from '../ai-explainer/ai-explainer.module';

@Module({
  imports: [AiExplainerModule],
  controllers: [ItemBankController, TeacherReviewController],
  providers: [
    ItemService,
    ListItemsUseCase,
    GetItemUseCase,
    GenerateExplanationUseCase,
    GetTeacherReviewTasksUseCase,
    GetBatchItemsForReviewUseCase,
    EditItemUseCase,
    ReviewItemUseCase,
    GetTeacherConfirmTasksUseCase,
    GetBatchItemsForConfirmUseCase,
    ConfirmItemUseCase,
    ConfirmAllItemsUseCase,
    {
      provide: 'IItemRepository',
      useClass: PrismaItemRepository,
    },
  ],
  exports: [
    'IItemRepository',
    ItemService,
    GetTeacherReviewTasksUseCase,
    GetBatchItemsForReviewUseCase,
    EditItemUseCase,
    ReviewItemUseCase,
    GetTeacherConfirmTasksUseCase,
    GetBatchItemsForConfirmUseCase,
    ConfirmItemUseCase,
    ConfirmAllItemsUseCase,
  ],
})
export class ItemBankModule {}
