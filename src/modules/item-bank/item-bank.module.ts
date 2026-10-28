import { Module } from '@nestjs/common';
import { ItemBankController } from './presentation/item-bank.controller';
import { ItemService } from './application/services/item.service';
import { ListItemsUseCase } from './application/use-cases/list-items.use-case';
import { GetItemUseCase } from './application/use-cases/get-item.use-case';
import { GenerateExplanationUseCase } from './application/use-cases/generate-explanation.use-case';
import { PrismaItemRepository } from './infrastructure/persistence/prisma-item.repository';
import { AiExplainerModule } from '../ai-explainer/ai-explainer.module';

@Module({
  imports: [AiExplainerModule],
  controllers: [ItemBankController],
  providers: [
    ItemService,
    ListItemsUseCase,
    GetItemUseCase,
    GenerateExplanationUseCase,
    {
      provide: 'IItemRepository',
      useClass: PrismaItemRepository,
    },
  ],
  exports: ['IItemRepository', ItemService],
})
export class ItemBankModule {}
