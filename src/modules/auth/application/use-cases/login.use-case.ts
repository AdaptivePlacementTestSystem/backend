import {
  Injectable,
  UnauthorizedException,
  Inject,
  ForbiddenException,
} from '@nestjs/common';
import type { IUserRepository } from '../../domain/repositories/user.repository.interface';
import { JwtProvider } from '../../infrastructure/providers/jwt.provider';
import { LoginDto, AuthResponseDto } from '../dto/login.dto';
import { ErrorCode } from '@apt/shared-types';
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';

// Hash giả cùng tham số argon2 mặc định, tạo một lần khi cần.
let dummyHash: Promise<string> | undefined;
const getDummyHash = (): Promise<string> =>
  (dummyHash ??= argon2.hash(randomBytes(16).toString('hex')));

@Injectable()
export class LoginUseCase {
  constructor(
    @Inject('IUserRepository')
    private readonly userRepository: IUserRepository,
    private readonly jwtProvider: JwtProvider,
  ) {}

  async execute(dto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.userRepository.findByEmail(
      dto.email.trim().toLowerCase(),
    );

    // Luôn chạy argon2.verify (với hash giả khi không có user/mật khẩu) để thời
    // gian phản hồi không lộ email có tồn tại hay không (DECISIONS_LOG #135).
    // #62: lỗi định dạng hash coi như sai mật khẩu.
    const hash = user?.passwordHash ?? (await getDummyHash());
    const passwordMatches = await argon2
      .verify(hash, dto.password)
      .catch(() => false);

    if (!user || !user.passwordHash || !passwordMatches) {
      throw new UnauthorizedException({
        code: ErrorCode.INVALID_CREDENTIALS,
        message: 'Thông tin đăng nhập không chính xác',
      });
    }

    // Chỉ báo "bị khóa" khi mật khẩu ĐÚNG: người nhập bừa không dò được tài khoản nào đang bị khóa.
    if (!user.isActive) {
      throw new ForbiddenException({
        code: ErrorCode.ACCOUNT_LOCKED,
        message: 'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ Admin.',
      });
    }

    const token = this.jwtProvider.generateToken({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      accessToken: token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
      },
    };
  }
}
