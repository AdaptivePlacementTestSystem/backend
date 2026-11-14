import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ErrorCode } from '@apt/shared-types';

export const accountNotFound = (): NotFoundException =>
  new NotFoundException({
    code: ErrorCode.NOT_FOUND,
    message: 'Không tìm thấy tài khoản.',
  });

/** 403: thao tác bị cấm theo quy tắc nghiệp vụ (BR-17, BR-18, BR-19). */
export const actionForbidden = (message: string): ForbiddenException =>
  new ForbiddenException({ code: ErrorCode.FORBIDDEN, message });

export const invalidRequest = (message: string): BadRequestException =>
  new BadRequestException({ code: ErrorCode.VALIDATION_FAILED, message });
