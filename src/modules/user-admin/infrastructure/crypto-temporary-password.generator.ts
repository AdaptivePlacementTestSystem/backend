import { Injectable } from '@nestjs/common';
import { randomInt } from 'crypto';
import type { ITemporaryPasswordGenerator } from '../application/ports/temporary-password-generator.port';

const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%^&*-_';
const ALL = LOWER + UPPER + DIGITS + SYMBOLS;

export const TEMPORARY_PASSWORD_LENGTH = 12;

const pick = (chars: string): string => chars[randomInt(chars.length)];

/** Sinh mật khẩu tạm bằng bộ sinh số ngẫu nhiên an toàn của Node (crypto). */
@Injectable()
export class CryptoTemporaryPasswordGenerator implements ITemporaryPasswordGenerator {
  generate(): string {
    // Bảo đảm đủ 4 nhóm ký tự rồi điền ngẫu nhiên cho đủ độ dài.
    const chars = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)];
    while (chars.length < TEMPORARY_PASSWORD_LENGTH) {
      chars.push(pick(ALL));
    }
    // Fisher–Yates để vị trí bốn ký tự bắt buộc không cố định.
    for (let i = chars.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join('');
  }
}
