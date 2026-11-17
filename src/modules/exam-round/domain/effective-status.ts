import { ExamRoundStatus } from '@apt/shared-types';

export interface ExamRoundTimeWindow {
  status: ExamRoundStatus | `${ExamRoundStatus}`;
  opensAt: Date;
  closesAt: Date;
}

/**
 * Trạng thái hiệu lực của kỳ thi tại thời điểm `now` (SRS 9b.5, BR-10, DC-10).
 * Nguồn duy nhất cho mọi quyết định về trạng thái kỳ thi; cột `status` chỉ được ghi
 * lại khi có truy cập (lazy, không dùng scheduler) nên không được tin trực tiếp.
 *
 * - DRAFT (chưa công bố) và CLOSED (đã đóng, kể cả đóng thủ công) giữ nguyên.
 * - SCHEDULED/OPEN: từ `closesAt` trở đi là CLOSED; từ `opensAt` là OPEN; trước đó SCHEDULED.
 */
export function effectiveStatus(
  round: ExamRoundTimeWindow,
  now: Date,
): ExamRoundStatus {
  if (round.status === ExamRoundStatus.DRAFT) return ExamRoundStatus.DRAFT;
  if (round.status === ExamRoundStatus.CLOSED) return ExamRoundStatus.CLOSED;
  if (now >= round.closesAt) return ExamRoundStatus.CLOSED;
  if (now >= round.opensAt) return ExamRoundStatus.OPEN;
  return ExamRoundStatus.SCHEDULED;
}
