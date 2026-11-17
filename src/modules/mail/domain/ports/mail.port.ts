export interface SendMailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

export interface IMailPort {
  sendMail(options: SendMailOptions): Promise<boolean>;
  sendPasswordResetOtp(email: string, otp: string): Promise<boolean>;
  sendTemporaryPassword(
    email: string,
    fullName: string,
    tempPassword: string,
    studentCode?: string,
  ): Promise<boolean>;
}
