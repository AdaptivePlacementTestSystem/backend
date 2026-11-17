import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

interface ErrorResponse {
  statusCode: number;
  message: string | string[];
  error: string;
  code?: string;
  timestamp: string;
  path: string;
}

/**
 * Global exception filter — chuẩn hóa tất cả HTTP error response.
 * Đăng ký tại main.ts: app.useGlobalFilters(new HttpExceptionFilter())
 */
@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<{ url: string }>();
    const status = exception.getStatus?.() ?? HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionResponse = exception.getResponse();

    const message =
      typeof exceptionResponse === 'object' && 'message' in exceptionResponse
        ? (exceptionResponse as { message: string | string[] }).message
        : exception.message;

    const code =
      typeof exceptionResponse === 'object' && 'code' in exceptionResponse
        ? (exceptionResponse as { code?: string }).code
        : undefined;

    const errorBody: ErrorResponse = {
      statusCode: status,
      message,
      error: exception.name,
      ...(code ? { code } : {}),
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    if (status >= 500) {
      this.logger.error(`${request.url} → ${status}`, exception.stack);
    }

    response.status(status).json(errorBody);
  }
}
