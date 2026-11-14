import { Type } from 'class-transformer';
import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MAX_PAGE_SIZE } from '../use-cases/list-accounts.use-case';

export class CreateStudentDto {
  @IsString({ message: 'MSSV phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'MSSV không được để trống' })
  @MaxLength(50, { message: 'MSSV tối đa 50 ký tự' })
  studentCode!: string;

  @IsString({ message: 'Họ tên phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Họ tên không được để trống' })
  @MaxLength(200, { message: 'Họ tên tối đa 200 ký tự' })
  fullName!: string;

  @IsEmail({}, { message: 'Email không đúng định dạng' })
  @MaxLength(255, { message: 'Email tối đa 255 ký tự' })
  email!: string;
}

export class CreateTeacherDto {
  @IsString({ message: 'Mã GV phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Mã GV không được để trống' })
  @MaxLength(50, { message: 'Mã GV tối đa 50 ký tự' })
  teacherCode!: string;

  @IsString({ message: 'Họ tên phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Họ tên không được để trống' })
  @MaxLength(200, { message: 'Họ tên tối đa 200 ký tự' })
  fullName!: string;

  @IsEmail({}, { message: 'Email không đúng định dạng' })
  @MaxLength(255, { message: 'Email tối đa 255 ký tự' })
  email!: string;
}

export class UpdateAccountDto {
  @IsOptional()
  @IsString({ message: 'Họ tên phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Họ tên không được để trống' })
  @MaxLength(200, { message: 'Họ tên tối đa 200 ký tự' })
  fullName?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Email không đúng định dạng' })
  @MaxLength(255, { message: 'Email tối đa 255 ký tự' })
  email?: string;
}

export class ListAccountsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page phải là số nguyên' })
  @Min(1, { message: 'page tối thiểu là 1' })
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'pageSize phải là số nguyên' })
  @Min(1, { message: 'pageSize tối thiểu là 1' })
  @Max(MAX_PAGE_SIZE, { message: `pageSize tối đa ${MAX_PAGE_SIZE}` })
  pageSize?: number;
}
