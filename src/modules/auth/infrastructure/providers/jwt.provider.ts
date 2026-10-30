import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

export interface JwtTokenPayload {
  sub: string;
  email: string;
  role: string;
}

@Injectable()
export class JwtProvider {
  constructor(private readonly jwtService: JwtService) {}

  generateToken(payload: JwtTokenPayload): string {
    return this.jwtService.sign(payload);
  }

  verifyToken(token: string): JwtTokenPayload {
    return this.jwtService.verify<JwtTokenPayload>(token);
  }
}
