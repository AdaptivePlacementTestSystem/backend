export type DuplicateField = 'email' | 'studentCode' | 'teacherCode';

/** Vi phạm ràng buộc duy nhất khi tạo/sửa tài khoản (BR-02). */
export class DuplicateAccountError extends Error {
  constructor(public readonly field: DuplicateField) {
    super(`Duplicate account field: ${field}`);
    this.name = 'DuplicateAccountError';
  }
}
