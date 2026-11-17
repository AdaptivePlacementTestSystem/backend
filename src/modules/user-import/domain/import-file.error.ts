/** File import không hợp lệ: sai định dạng, quá dung lượng, quá số dòng, thiếu cột (IMPORT_FILE_INVALID). */
export class ImportFileError extends Error {
  constructor(
    message: string,
    /** 400 mặc định; 413 khi quá dung lượng. */
    public readonly status: 400 | 413 = 400,
  ) {
    super(message);
    this.name = 'ImportFileError';
  }
}
