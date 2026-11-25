import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { Roles } from '../../../shared/decorators/roles.decorator';
import {
  CurrentUser,
  JwtPayload,
} from '../../../shared/decorators/current-user.decorator';
import { UserRole } from '../../auth/domain/enums/user-role.enum';
import type { ImportRow, UploadResult } from '../domain/import.types';
import {
  ClearImportGridUseCase,
  GetImportGridUseCase,
  RemoveImportRowUseCase,
} from '../application/use-cases/import-grid.use-cases';
import { DownloadImportTemplateUseCase } from '../application/use-cases/download-import-template.use-case';
import {
  GetImportSaveStatusUseCase,
  SaveImportUseCase,
  type ImportSaveStatus,
} from '../application/use-cases/save-import.use-case';
import {
  UploadImportFileUseCase,
  type UploadedFile as UploadedImportFile,
} from '../application/use-cases/upload-import-file.use-case';
import { ImportKindQueryDto, ImportRowParamDto } from './import.dto';
import { UploadSizeFilter } from './upload-size.filter';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiExtraModels,
  ApiNoContentResponse,
  ApiOkResponse,
} from '@nestjs/swagger';
import {
  ImportGridResponseDto,
  ImportUploadResponseDto,
  ImportSaveResponseDto,
  ImportJobResponseDto,
  NoImportJobResponseDto,
} from './import-response.dto';

const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Import tài khoản SV/GV bằng file (UCADM08, S19) — chỉ ADMIN (BR-16). Lưới tạm khóa theo (adminId, kind):
 * mỗi loại một lưới riêng. Route theo SRS mục X; `save-status` và `template` là đề xuất ngoài SRS.
 */
@Controller('users/import')
@ApiBearerAuth()
@ApiExtraModels(ImportJobResponseDto, NoImportJobResponseDto)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class UserImportController {
  constructor(
    private readonly upload: UploadImportFileUseCase,
    private readonly getGrid: GetImportGridUseCase,
    private readonly removeRow: RemoveImportRowUseCase,
    private readonly clearGrid: ClearImportGridUseCase,
    private readonly save: SaveImportUseCase,
    private readonly saveStatus: GetImportSaveStatusUseCase,
    private readonly template: DownloadImportTemplateUseCase,
  ) {}

  @Post('upload')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOkResponse({ type: ImportUploadResponseDto })
  @HttpCode(HttpStatus.OK)
  @UseFilters(UploadSizeFilter)
  @UseInterceptors(FileInterceptor('file'))
  uploadFile(
    @Query() query: ImportKindQueryDto,
    @UploadedFile() file: UploadedImportFile | undefined,
    @CurrentUser() admin: JwtPayload,
  ): Promise<UploadResult> {
    return this.upload.execute({ adminId: admin.sub, kind: query.kind, file });
  }

  @Get('grid')
  @ApiOkResponse({ type: ImportGridResponseDto })
  grid(
    @Query() query: ImportKindQueryDto,
    @CurrentUser() admin: JwtPayload,
  ): Promise<{ grid: ImportRow[] }> {
    return this.getGrid.execute(admin.sub, query.kind);
  }

  @Delete('grid/:rowKey')
  @ApiOkResponse({ type: ImportGridResponseDto })
  deleteRow(
    @Param() params: ImportRowParamDto,
    @Query() query: ImportKindQueryDto,
    @CurrentUser() admin: JwtPayload,
  ): Promise<{ grid: ImportRow[] }> {
    return this.removeRow.execute(admin.sub, query.kind, params.rowKey);
  }

  @Delete('grid')
  @ApiNoContentResponse()
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteGrid(
    @Query() query: ImportKindQueryDto,
    @CurrentUser() admin: JwtPayload,
  ): Promise<void> {
    return this.clearGrid.execute(admin.sub, query.kind);
  }

  @Post('save')
  @ApiAcceptedResponse({ type: ImportSaveResponseDto })
  @HttpCode(HttpStatus.ACCEPTED)
  saveGrid(
    @Query() query: ImportKindQueryDto,
    @CurrentUser() admin: JwtPayload,
  ): Promise<{ total: number }> {
    return this.save.execute(admin.sub, query.kind);
  }

  @Get('save-status')
  @ApiOkResponse({
    schema: {
      oneOf: [
        { $ref: '#/components/schemas/ImportJobResponseDto' },
        { $ref: '#/components/schemas/NoImportJobResponseDto' },
      ],
    },
  })
  status(
    @Query() query: ImportKindQueryDto,
    @CurrentUser() admin: JwtPayload,
  ): Promise<ImportSaveStatus> {
    return this.saveStatus.execute(admin.sub, query.kind);
  }

  @Get('template')
  @ApiOkResponse({
    content: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
        schema: { type: 'string', format: 'binary' },
      },
    },
    headers: { 'Content-Disposition': { schema: { type: 'string' } } },
  })
  async downloadTemplate(
    @Query() query: ImportKindQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, filename } = await this.template.execute(query.kind);
    res.setHeader('Content-Type', XLSX_MIME);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }
}
