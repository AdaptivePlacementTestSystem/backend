import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { ThrottlerLimitDetail } from '@nestjs/throttler';
import { ErrorCode } from '@apt/shared-types';

/** ThrottlerGuard trả lỗi 429 theo định dạng chuẩn của API (có `code`). */
@Injectable()
export class AuthThrottlerGuard extends ThrottlerGuard {
  protected throwThrottlingException(
    _context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    const seconds = detail.timeToBlockExpire || detail.timeToExpire;
    throw new HttpException(
      {
        code: ErrorCode.RATE_LIMITED,
        message: `Bạn thao tác quá nhanh. Vui lòng thử lại sau ${seconds} giây.`,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
