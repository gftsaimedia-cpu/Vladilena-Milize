/** Một ca mặc định có hiệu lực từ `effectiveFrom` ('YYYY-MM-DD') cho tới phiên bản kế tiếp. */
export interface ShiftVersion {
  effectiveFrom: string;
  type: 'NORMAL' | 'FLEX' | 'NIGHT';
  startTime: string;
  endTime: string;
  allowancePct: number;
}

/** Ngày của phiên bản gốc (ca đang dùng trước lần đổi đầu tiên): đủ sớm để bao mọi ngày công. */
export const BASE_SHIFT_FROM = '2000-01-01';

/**
 * Ca mặc định áp dụng cho ngày `date`: phiên bản mới nhất có `effectiveFrom` không sau ngày đó. Chưa có lịch sử (hoặc ngày sớm hơn mọi
 * phiên bản) thì null: nơi gọi dùng ca hiện tại ở hồ sơ.
 */
export function shiftOn(versions: readonly ShiftVersion[], date: string): ShiftVersion | null {
  let found: ShiftVersion | null = null;
  for (const v of versions) {
    if (v.effectiveFrom <= date && (!found || v.effectiveFrom > found.effectiveFrom)) found = v;
  }
  return found;
}

export type ShiftSpec = Pick<ShiftVersion, 'type' | 'startTime' | 'endTime' | 'allowancePct'>;

/** Hai ca giống hệt nhau (loại, giờ vào, giờ ra, phụ cấp). */
export const sameShift = (a: ShiftSpec, b: ShiftSpec): boolean =>
  a.type === b.type && a.startTime === b.startTime && a.endTime === b.endTime && a.allowancePct === b.allowancePct;
