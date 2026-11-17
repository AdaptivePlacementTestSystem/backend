import {
  ConflictException,
  HttpException,
  HttpStatus,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ErrorCode } from '@apt/shared-types';

/** 400 (sai định dạng, thiếu cột, quá dòng) hoặc 413 (quá dung lượng): IMPORT_FILE_INVALID. */
export const importFileInvalid = (
  message: string,
  status: 400 | 413 = 400,
): HttpException =>
  new HttpException({ code: ErrorCode.IMPORT_FILE_INVALID, message }, status);

/** 410: lưới tạm đã hết TTL (SRS mục X). */
export const importGridExpired = (): HttpException =>
  new HttpException(
    {
      code: ErrorCode.IMPORT_GRID_EXPIRED,
      message: 'Bảng import đã hết hạn. Vui lòng tải lại file.',
    },
    HttpStatus.GONE,
  );

/** 422: bấm Lưu khi lưới rỗng (BR-04). */
export const importGridEmpty = (): UnprocessableEntityException =>
  new UnprocessableEntityException({
    code: ErrorCode.IMPORT_GRID_EMPTY,
    message: 'Bảng import chưa có dòng nào để lưu.',
  });

/** 409: đang có tác vụ Lưu chạy cho cùng (admin, loại tài khoản). */
export const importJobRunning = (): ConflictException =>
  new ConflictException({
    code: ErrorCode.CONFLICT,
    message: 'Đang có một lần Lưu chạy cho loại tài khoản này. Vui lòng đợi.',
  });
