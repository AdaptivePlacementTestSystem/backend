import {
  Body,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  CurrentUser,
  type JwtPayload,
} from '../../../shared/decorators/current-user.decorator';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { UserRole } from '../../auth/domain/enums/user-role.enum';
import {
  ParseQuestionSpreadsheetUseCase,
  type ImportedCandidate,
} from '../application/parse-question-spreadsheet.use-case';
import { SaveQuestionImportUseCase } from '../application/save-question-import.use-case';
@Controller('item-batches/import')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class ImportQuestionBatchesController {
  constructor(
    private readonly parse: ParseQuestionSpreadsheetUseCase,
    private readonly saveImport: SaveQuestionImportUseCase,
  ) {}
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
  @Post('save')
  save(
    @CurrentUser() admin: JwtPayload,
    @Body() body: { name?: string; rows: ImportedCandidate[] },
  ) {
    return this.saveImport.execute(admin.sub, body);
  }
}
