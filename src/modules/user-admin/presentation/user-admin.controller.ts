import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { UserRole } from '../../auth/domain/enums/user-role.enum';
import type { Paged } from '../../auth/domain/repositories/account.types';
import type { AccountView } from '../application/account-view';
import {
  CreateStudentDto,
  CreateTeacherDto,
  ListAccountsQueryDto,
  UpdateAccountDto,
} from '../application/dto/account.dto';
import { CreateAccountUseCase } from '../application/use-cases/create-account.use-case';
import { ListAccountsUseCase } from '../application/use-cases/list-accounts.use-case';
import { UpdateAccountUseCase } from '../application/use-cases/update-account.use-case';

/**
 * Quản lý tài khoản SV và GV (UCADM09, S24) — chỉ ADMIN (BR-16).
 * Route theo SRS mục X: `/students`, `/teachers` (danh sách, tạo, sửa).
 */
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class UserAdminController {
  constructor(
    private readonly createAccount: CreateAccountUseCase,
    private readonly listAccounts: ListAccountsUseCase,
    private readonly updateAccount: UpdateAccountUseCase,
  ) {}

  @Get('students')
  listStudents(
    @Query() query: ListAccountsQueryDto,
  ): Promise<Paged<AccountView>> {
    return this.listAccounts.execute({
      kind: 'STUDENT',
      q: query.q,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  @Post('students')
  @HttpCode(HttpStatus.CREATED)
  createStudent(@Body() dto: CreateStudentDto): Promise<AccountView> {
    return this.createAccount.execute({
      kind: 'STUDENT',
      studentCode: dto.studentCode,
      fullName: dto.fullName,
      email: dto.email,
    });
  }

  @Patch('students/:id')
  updateStudent(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateAccountDto,
  ): Promise<AccountView> {
    return this.updateAccount.execute({
      kind: 'STUDENT',
      id,
      fullName: dto.fullName,
      email: dto.email,
    });
  }

  @Get('teachers')
  listTeachers(
    @Query() query: ListAccountsQueryDto,
  ): Promise<Paged<AccountView>> {
    return this.listAccounts.execute({
      kind: 'TEACHER',
      q: query.q,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  @Post('teachers')
  @HttpCode(HttpStatus.CREATED)
  createTeacher(@Body() dto: CreateTeacherDto): Promise<AccountView> {
    return this.createAccount.execute({
      kind: 'TEACHER',
      teacherCode: dto.teacherCode,
      fullName: dto.fullName,
      email: dto.email,
    });
  }

  @Patch('teachers/:id')
  updateTeacher(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateAccountDto,
  ): Promise<AccountView> {
    return this.updateAccount.execute({
      kind: 'TEACHER',
      id,
      fullName: dto.fullName,
      email: dto.email,
    });
  }
}
