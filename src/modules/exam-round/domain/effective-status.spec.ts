import { describe, it, expect } from 'vitest';
import { ExamRoundStatus } from '@apt/shared-types';
import { effectiveStatus } from './effective-status';

const opensAt = new Date('2026-11-14T08:00:00Z');
const closesAt = new Date('2026-11-14T17:00:00Z');
const round = (status: ExamRoundStatus) => ({ status, opensAt, closesAt });

describe('effectiveStatus (SRS 9b.5)', () => {
  it('DRAFT giữ nguyên dù đã qua giờ mở/đóng', () => {
    expect(
      effectiveStatus(
        round(ExamRoundStatus.DRAFT),
        new Date('2026-11-14T10:00:00Z'),
      ),
    ).toBe(ExamRoundStatus.DRAFT);
  });

  it('SCHEDULED trước giờ mở vẫn là SCHEDULED', () => {
    expect(
      effectiveStatus(
        round(ExamRoundStatus.SCHEDULED),
        new Date('2026-11-14T07:59:59Z'),
      ),
    ).toBe(ExamRoundStatus.SCHEDULED);
  });

  it('SCHEDULED tới giờ mở chuyển thành OPEN (lazy, cột status chưa được ghi lại)', () => {
    expect(effectiveStatus(round(ExamRoundStatus.SCHEDULED), opensAt)).toBe(
      ExamRoundStatus.OPEN,
    );
  });

  it('OPEN trong khung giờ là OPEN', () => {
    expect(
      effectiveStatus(
        round(ExamRoundStatus.OPEN),
        new Date('2026-11-14T12:00:00Z'),
      ),
    ).toBe(ExamRoundStatus.OPEN);
  });

  it('tới giờ đóng là CLOSED dù cột status còn OPEN hoặc SCHEDULED', () => {
    expect(effectiveStatus(round(ExamRoundStatus.OPEN), closesAt)).toBe(
      ExamRoundStatus.CLOSED,
    );
    expect(effectiveStatus(round(ExamRoundStatus.SCHEDULED), closesAt)).toBe(
      ExamRoundStatus.CLOSED,
    );
  });

  it('CLOSED (đóng thủ công) không mở lại dù còn trong khung giờ', () => {
    expect(
      effectiveStatus(
        round(ExamRoundStatus.CLOSED),
        new Date('2026-11-14T12:00:00Z'),
      ),
    ).toBe(ExamRoundStatus.CLOSED);
  });
});
