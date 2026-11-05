import { SHIFT_CATALOG } from '../../../common/shift-catalog';

export type FrameShiftType = 'NORMAL' | 'FLEX' | 'NIGHT';

export interface ShiftFrame {
  shiftType: FrameShiftType;
  startTime: string;
  endTime: string;
}

export const SHIFT_FRAMES: ReadonlyArray<ShiftFrame> = SHIFT_CATALOG.map(({ shiftType, startTime, endTime }) => ({
  shiftType,
  startTime,
  endTime
}));

export function findShiftFrame(shiftType: unknown, startTime: unknown): ShiftFrame | null {
  return SHIFT_FRAMES.find(f => f.shiftType === shiftType && f.startTime === startTime) ?? null;
}
