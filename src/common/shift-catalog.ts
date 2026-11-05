// Sáu ca cố định của công ty. Khung giờ khớp SHIFT_FRAMES (requests) và các dòng work_shifts trong schema.sql.

export type ShiftCode = 'Normal1' | 'Normal2' | 'Flex1' | 'Flex2' | 'Night1' | 'Night2';

export interface CatalogShift {
  code: ShiftCode;
  kind: 'normal' | 'flex' | 'night';
  shiftType: 'NORMAL' | 'FLEX' | 'NIGHT';
  startTime: string;
  endTime: string;
}

export const SHIFT_CATALOG: ReadonlyArray<CatalogShift> = [
  { code: 'Normal1', kind: 'normal', shiftType: 'NORMAL', startTime: '08:00', endTime: '17:00' },
  { code: 'Normal2', kind: 'normal', shiftType: 'NORMAL', startTime: '10:00', endTime: '19:00' },
  { code: 'Flex1', kind: 'flex', shiftType: 'FLEX', startTime: '06:00', endTime: '15:00' },
  { code: 'Flex2', kind: 'flex', shiftType: 'FLEX', startTime: '13:00', endTime: '22:00' },
  { code: 'Night1', kind: 'night', shiftType: 'NIGHT', startTime: '22:00', endTime: '07:00' },
  { code: 'Night2', kind: 'night', shiftType: 'NIGHT', startTime: '21:00', endTime: '06:00' }
];

/** Ca mặc định khi người dùng chưa có lịch: Normal1. */
export const DEFAULT_SHIFT: CatalogShift = SHIFT_CATALOG[0];

/** Tra ca theo mã; null khi mã không thuộc danh mục. */
export function shiftByCode(code: unknown): CatalogShift | null {
  return SHIFT_CATALOG.find(s => s.code === code) ?? null;
}
