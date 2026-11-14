/** Một thư mật khẩu tạm cần gửi. `tempPassword` chỉ tồn tại trong bộ nhớ, không được ghi log hay Redis. */
export interface TemporaryPasswordMail {
  email: string;
  fullName: string;
  tempPassword: string;
  /** MSSV (chỉ sinh viên). */
  studentCode?: string;
}

/**
 * Cổng hàng đợi gửi email hàng loạt (SRS: "đẩy job email vào hàng đợi"). Triển khai hiện tại chạy trong tiến trình;
 * có thể thay bằng BullMQ mà không đổi use-case. Gửi lỗi không bao giờ làm hỏng tác vụ gọi (BR-05).
 */
export interface IMailQueue {
  /** Xếp hàng các thư và trả ngay (không chờ gửi). Trả về số thư đã xếp hàng. */
  enqueueTemporaryPasswords(items: TemporaryPasswordMail[]): number;
}

export const MAIL_QUEUE = 'IMailQueue';
