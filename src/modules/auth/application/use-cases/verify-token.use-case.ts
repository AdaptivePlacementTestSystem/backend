import { Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import type { IUserRepository } from '../../domain/repositories/user.repository.interface';
import { JwtProvider } from '../../infrastructure/providers/jwt.provider';
import { UserEntity } from '../../domain/entities/user.entity';

@Injectable()
export class VerifyTokenUseCase {
  constructor(
    @Inject('IUserRepository')
    private readonly userRepository: IUserRepository,
    private readonly jwtProvider: JwtProvider,
  ) {}

  async execute(token: string): Promise<UserEntity> {
    const payload = this.jwtProvider.verifyToken(token);
    if (!payload || !payload.sub) {
      throw new UnauthorizedException('Token không hợp lệ');
    }

    const user = await this.userRepository.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException('Người dùng không tồn tại');
    }

    return user;
  }
}
