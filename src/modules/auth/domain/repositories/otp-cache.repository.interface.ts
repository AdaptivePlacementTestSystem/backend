export interface OtpRecord {
  hash: string;
  attempts: number;
}

export interface IOtpCacheRepository {
  saveOtp(email: string, otpHash: string, ttlSeconds?: number): Promise<void>;
  getOtp(email: string): Promise<OtpRecord | null>;
  incrementAttempts(email: string): Promise<number>;
  deleteOtp(email: string): Promise<void>;
}
