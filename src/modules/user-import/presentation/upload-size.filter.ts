import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ErrorCode } from '@apt/shared-types';
import type { Response } from 'express';

/**
 * Multer ném PayloadTooLargeException (413) không kèm mã nghiệp vụ khi file vượt giới hạn dung lượng;
 * đổi thành IMPORT_FILE_INVALID để giao diện hiện đúng thông báo (SRS mục X: 400 / 413).
 */
@Catch(PayloadTooLargeException)
export class UploadSizeFilter implements ExceptionFilter {
  catch(_exception: PayloadTooLargeException, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const req = host.switchToHttp().getRequest<{ url: string }>();
    res.status(HttpStatus.PAYLOAD_TOO_LARGE).json({
      statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
      message: 'File vượt quá dung lượng cho phép.',
      error: 'PayloadTooLargeException',
      code: ErrorCode.IMPORT_FILE_INVALID,
      timestamp: new Date().toISOString(),
      path: req.url,
    });
  }
}
