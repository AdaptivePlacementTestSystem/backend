// VÔ HIỆU HÓA (DC-32, #106): CRUD câu hỏi bằng form đã bỏ; câu hỏi chỉ vào hệ thống qua lô (AI sinh / import file).
// Giữ làm tham khảo cho luồng duyệt A/B ở đợt module lô/gói; KHÔNG biên dịch (loại khỏi tsconfig, vitest). Import tương đối đã lệch một cấp.
import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import type { IItemRepository } from '../../domain/repositories/item.repository.interface';
import { ItemEntity, OptionMap } from '../../domain/entities/item.entity';
import { Skill, CEFRLevel, ItemStatus } from '@apt/shared-types';
import { randomUUID } from 'crypto';

import {
  IsString,
  IsNotEmpty,
  IsIn,
  IsEnum,
  IsNumber,
  IsOptional,
  IsObject,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class OptionMapDto implements OptionMap {
  @IsString()
  @IsNotEmpty()
  A: string;

  @IsString()
  @IsNotEmpty()
  B: string;

  @IsString()
  @IsNotEmpty()
  C: string;

  @IsString()
  @IsNotEmpty()
  D: string;
}

export class CreateItemDto {
  @IsString()
  @IsNotEmpty()
  content: string;

  @IsObject()
  @ValidateNested()
  @Type(() => OptionMapDto)
  options: OptionMapDto;

  @IsString()
  @IsIn(['A', 'B', 'C', 'D'], {
    message: 'Đáp án đúng phải là một trong các giá trị A, B, C, D',
  })
  correctAnswer: 'A' | 'B' | 'C' | 'D';

  @IsEnum(Skill)
  skill: Skill;

  @IsEnum(CEFRLevel)
  cefrTarget: CEFRLevel;

  @IsNumber()
  irtB: number;

  @IsString()
  @IsOptional()
  topicTag?: string;

  @IsString()
  @IsOptional()
  batchId?: string;
}

@Injectable()
export class CreateItemUseCase {
  constructor(
    @Inject('IItemRepository')
    private readonly itemRepository: IItemRepository,
  ) {}

  async execute(dto: CreateItemDto): Promise<ItemEntity> {
    if (!['A', 'B', 'C', 'D'].includes(dto.correctAnswer)) {
      throw new BadRequestException(
        'Đáp án đúng phải là một trong các giá trị A, B, C, D',
      );
    }

    const item = new ItemEntity(
      randomUUID(),
      dto.content,
      dto.options,
      dto.correctAnswer,
      dto.skill,
      dto.cefrTarget,
      dto.irtB,
      1.0, // Rasch 1PL
      0.25,
      ItemStatus.DRAFT,
      dto.batchId || '',
      null,
      null,
      dto.topicTag || null,
    );

    return this.itemRepository.save(item);
  }
}
