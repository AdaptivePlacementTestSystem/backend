import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { IMailPort, SendMailOptions } from '../../domain/ports/mail.port';

/** Escape ký tự HTML để dữ liệu người dùng không chèn được thẻ vào email. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

@Injectable()
export class SmtpMailAdapter implements IMailPort {
  private readonly logger = new Logger(SmtpMailAdapter.name);
  private transporter: nodemailer.Transporter | null = null;
  private readonly from: string;
  private readonly isProduction: boolean;

  constructor(private readonly configService: ConfigService) {
    const host =
      this.configService.get<string>('mail.host') ?? 'smtp.gmail.com';
    const port = this.configService.get<number>('mail.port') ?? 465;
    const secure = this.configService.get<boolean>('mail.secure') ?? true;
    const user = this.configService.get<string>('mail.user');
    const pass = this.configService.get<string>('mail.pass');
    this.isProduction =
      this.configService.get<string>('nodeEnv') === 'production';
    this.from =
      this.configService.get<string>('mail.from') ??
      'Adaptive Placement Test System <noreply@apt.edu.vn>';

    if (user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user, pass },
      });
      this.logger.log(
        `SmtpMailAdapter đã khởi tạo SMTP transporter (${host}:${port})`,
      );
    } else {
      this.logger.warn(
        'SmtpMailAdapter: Chưa cấu hình mail.user hoặc mail.pass. Email sẽ chỉ được log ra console.',
      );
    }
  }

  async sendMail(options: SendMailOptions): Promise<boolean> {
    if (!this.transporter) {
      if (this.isProduction) {
        // Production mà thiếu SMTP là lỗi cấu hình: không được nuốt im lặng,
        // và tuyệt đối không log nội dung (có OTP / mật khẩu tạm).
        throw new Error('SMTP chưa được cấu hình (thiếu mail.user/mail.pass)');
      }
      this.logger.warn(
        `[DEV MAIL MOCK] Gửi tới: ${options.to} | Tiêu đề: ${options.subject}`,
      );
      if (options.text) this.logger.warn(`[DEV MAIL TEXT]: ${options.text}`);
      return true;
    }

    // D6 (#134): gửi ngay trong request; lỗi được ném lên để use-case quyết định
    // (forgot-password bắt và chỉ log để giữ phản hồi 202 đồng nhất).
    await this.transporter.sendMail({
      from: this.from,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    });
    this.logger.log('Email đã được gửi');
    return true;
  }

  async sendPasswordResetOtp(email: string, otp: string): Promise<boolean> {
    const subject = '[Adaptive Placement Test] Mã OTP đặt lại mật khẩu';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #1e3a8a; margin-top: 0;">Đặt lại mật khẩu tài khoản</h2>
        <p>Xin chào,</p>
        <p>Hệ thống nhận được yêu cầu đặt lại mật khẩu cho tài khoản <strong>${escapeHtml(email)}</strong>.</p>
        <p>Mã xác thực OTP của bạn là:</p>
        <div style="background-color: #f1f5f9; padding: 16px; text-align: center; border-radius: 6px; margin: 20px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #2563eb;">${otp}</span>
        </div>
        <p style="color: #64748b; font-size: 14px;">Mã OTP này có hiệu lực trong vòng <strong>10 phút</strong>. Vì lý do bảo mật, vui lòng không chia sẻ mã này với bất kỳ ai.</p>
        <p style="color: #64748b; font-size: 14px;">Nếu bạn không thực hiện yêu cầu này, hãy bỏ qua email này.</p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
        <p style="color: #94a3b8; font-size: 12px; margin-bottom: 0;">Adaptive Placement Test System — Hệ thống kiểm tra tiếng Anh thích ứng</p>
      </div>
    `;
    const text = `Mã OTP đặt lại mật khẩu của bạn là: ${otp}. Mã có hiệu lực trong 10 phút.`;

    return this.sendMail({ to: email, subject, text, html });
  }

  async sendTemporaryPassword(
    email: string,
    fullName: string,
    tempPassword: string,
    studentCode?: string,
  ): Promise<boolean> {
    const subject = '[Adaptive Placement Test] Thông tin tài khoản đăng nhập';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #1e3a8a; margin-top: 0;">Thông tin tài khoản mới</h2>
        <p>Xin chào <strong>${escapeHtml(fullName)}</strong>,</p>
        <p>Tài khoản của bạn đã được khởi tạo trên hệ thống Adaptive Placement Test.</p>
        <div style="background-color: #f1f5f9; padding: 16px; border-radius: 6px; margin: 20px 0;">
          <p style="margin: 4px 0;"><strong>Email đăng nhập:</strong> ${escapeHtml(email)}</p>
          ${studentCode ? `<p style="margin: 4px 0;"><strong>Mã sinh viên:</strong> ${escapeHtml(studentCode)}</p>` : ''}
          <p style="margin: 4px 0;"><strong>Mật khẩu tạm thời:</strong> <code style="font-size: 16px; font-weight: bold; color: #dc2626;">${escapeHtml(tempPassword)}</code></p>
        </div>
        <p style="color: #b45309; font-size: 14px; background-color: #fef3c7; padding: 10px; border-radius: 4px;">
          ⚠️ <strong>Lưu ý:</strong> Đây là mật khẩu tạm thời. Hệ thống sẽ bắt buộc bạn đổi mật khẩu mới trong lần đăng nhập đầu tiên.
        </p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
        <p style="color: #94a3b8; font-size: 12px; margin-bottom: 0;">Adaptive Placement Test System — Hệ thống kiểm tra tiếng Anh thích ứng</p>
      </div>
    `;
    const text = `Tài khoản: ${email}\nMật khẩu tạm thời: ${tempPassword}\nVui lòng đổi mật khẩu trong lần đăng nhập đầu tiên.`;

    return this.sendMail({ to: email, subject, text, html });
  }
}
