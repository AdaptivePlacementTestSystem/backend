import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '../../../auth/domain/enums/user-role.enum';
import { timingSafeEqual } from 'crypto';

/**
 * EduzApiKeyGuard — Machine-to-Machine guard cho EduZ Ecosystem (Mục 15.4, R-16).
 * Đọc header X-Eduz-API-Key, so sánh thời gian hằng.
 */
@Injectable()
export class EduzApiKeyGuard implements CanActivate {
  private readonly validApiKey: string;

  constructor(configService: ConfigService) {
    this.validApiKey =
      configService.get<string>('EDUZ_API_KEY') ||
      process.env.EDUZ_API_KEY ||
      'eduz-secret-key-change-in-prod';
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-eduz-api-key'];

    if (!apiKey || typeof apiKey !== 'string') {
      throw new UnauthorizedException('Thiếu API Key EduZ trong header X-Eduz-API-Key');
    }

    const keyBuf = Buffer.from(apiKey);
    const validBuf = Buffer.from(this.validApiKey);
    if (keyBuf.length !== validBuf.length || !timingSafeEqual(keyBuf, validBuf)) {
      throw new UnauthorizedException('API Key không hợp lệ');
    }

    request.user = {
      sub: 'eduz-service-system',
      role: UserRole.EDUZ_SERVICE,
    };

    return true;
  }
}

export { EduzApiKeyGuard as EduZApiKeyGuard };
