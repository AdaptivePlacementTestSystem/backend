import { ApiOkResponse, ApiCreatedResponse } from '@nestjs/swagger';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Res,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import {
  CurrentUser,
  type JwtPayload,
} from '../../../shared/decorators/current-user.decorator';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { UserRole } from '../../auth/domain/enums/user-role.enum';
import { ParseQuestionSpreadsheetUseCase } from '../application/parse-question-spreadsheet.use-case';
import { QuestionGridUseCase } from '../application/question-grid.use-case';
@Controller('item-batches/import')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class ImportQuestionBatchesController {
  constructor(
    private readonly parse: ParseQuestionSpreadsheetUseCase,
    private readonly questionGrid: QuestionGridUseCase,
  ) {}
  @ApiOkResponse({
    content: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
        schema: { type: 'string', format: 'binary' },
      },
    },
  })
  @Get('template')
  async template(@Res() response: Response) {
    const buffer = await this.parse.template();
    response.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    response.setHeader(
      'Content-Disposition',
      'attachment; filename="question-import-template.xlsx"',
    );
    response.setHeader('Cache-Control', 'no-store');
    response.send(buffer);
  }
  @ApiCreatedResponse({
    schema: { type: 'object', additionalProperties: true },
  })
  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024 } }),
  )
  upload(
    @CurrentUser() admin: JwtPayload,
    @UploadedFile()
    file: { buffer: Buffer; originalname: string; size: number },
  ) {
    return this.questionGrid.upload(admin.sub, file);
  }
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  @Get('grid')
  grid(@CurrentUser() admin: JwtPayload) {
    return this.questionGrid.load(admin.sub);
  }
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  @Delete('grid/:rowKey')
  remove(@CurrentUser() admin: JwtPayload, @Param('rowKey') rowKey: string) {
    return this.questionGrid.remove(admin.sub, rowKey);
  }
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  @Delete('grid')
  clear(@CurrentUser() admin: JwtPayload) {
    return this.questionGrid.clear(admin.sub);
  }
  @ApiCreatedResponse({
    schema: { type: 'object', additionalProperties: true },
  })
  @Post('preview')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024 } }),
  )
  preview(
    @UploadedFile()
    file: {
      buffer: Buffer;
      originalname: string;
      size: number;
    },
  ) {
    return this.parse.execute(file);
  }
  @ApiCreatedResponse({
    schema: { type: 'object', additionalProperties: true },
  })
  @Post('save')
  save(
    @CurrentUser() admin: JwtPayload,
    @Body() body: { name?: unknown; operationId?: unknown },
  ) {
    return this.questionGrid.save(admin.sub, body);
  }
}
