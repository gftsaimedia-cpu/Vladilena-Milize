// Lý do một lần chấm công bị từ chối theo cài đặt (ngày làm, vùng chấm công).
export type PunchRefusedCode = 'NOT_A_WORKDAY' | 'NO_LOCATION' | 'OUTSIDE_ZONE';

export class PunchRefusedError extends Error {
  constructor(
    readonly code: PunchRefusedCode,
    message: string,
    readonly details: Record<string, number> = {}
  ) {
    super(message);
    this.name = 'PunchRefusedError';
  }
}
