/**
 * Cổng sinh mật khẩu tạm (BR-05): 12 ký tự, thỏa chính sách mật khẩu.
 * Tách thành cổng để test không phụ thuộc ngẫu nhiên và để đổi thuật toán sau này.
 */
export interface ITemporaryPasswordGenerator {
  generate(): string;
}

export const TEMPORARY_PASSWORD_GENERATOR = 'ITemporaryPasswordGenerator';
