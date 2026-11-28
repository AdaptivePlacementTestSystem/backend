import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  StreamableFile,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiProduces,
} from '@nestjs/swagger';
import {
  gridResponse,
  saveRequest,
  saveResponse,
  uploadResponse,
} from './admin-exam.schemas';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsUUID } from 'class-validator';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { Roles } from '../../../shared/decorators/roles.decorator';
import {
  CurrentUser,
  JwtPayload,
} from '../../../shared/decorators/current-user.decorator';
import { UserRole } from '../../auth/domain/enums/user-role.enum';
import { UploadSizeFilter } from '../../user-import/presentation/upload-size.filter';
import { RosterGridUseCase } from '../application/use-cases/roster-grid.use-case';

class SaveRosterDto {
  @IsUUID()
  operationId!: string;
}

@ApiBearerAuth()
@Controller('exam-rounds/:roundId/participants/import')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class RosterGridController {
  constructor(private readonly roster: RosterGridUseCase) {}
  @Post('upload')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOkResponse({ schema: uploadResponse })
  @HttpCode(HttpStatus.OK)
  @UseFilters(UploadSizeFilter)
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @Param('roundId', ParseUUIDPipe) roundId: string,
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file?: { buffer: Buffer; originalname: string },
  ) {
    return this.roster.upload(user.sub, roundId, file);
  }
  @Post('save')
  @ApiBody({ schema: saveRequest })
  @ApiOkResponse({ schema: saveResponse })
  @HttpCode(HttpStatus.OK)
  save(
    @Param('roundId', ParseUUIDPipe) roundId: string,
    @CurrentUser() user: JwtPayload,
    @Body() body: SaveRosterDto,
  ) {
    return this.roster.save(user.sub, roundId, body.operationId);
  }

  @Get('template')
  @ApiProduces(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  @Header(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  @Header('Content-Disposition', 'attachment; filename="danh-sach-thi.xlsx"')
  async template(
    @Param('roundId', ParseUUIDPipe) roundId: string,
  ): Promise<StreamableFile> {
    return new StreamableFile(await this.roster.template(roundId));
  }

  @Get('grid')
  @ApiOkResponse({ schema: gridResponse })
  load(
    @Param('roundId', ParseUUIDPipe) roundId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.roster.load(user.sub, roundId);
  }
  @Delete('grid/:studentId')
  @ApiOkResponse({ schema: gridResponse })
  remove(
    @Param('roundId', ParseUUIDPipe) roundId: string,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.roster.remove(user.sub, roundId, studentId);
  }
  @Delete('grid')
  @ApiNoContentResponse()
  @HttpCode(HttpStatus.NO_CONTENT)
  clear(
    @Param('roundId', ParseUUIDPipe) roundId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.roster.clear(user.sub, roundId);
  }
}
