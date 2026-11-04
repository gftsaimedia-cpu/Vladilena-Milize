export type FrameShiftType = 'NORMAL' | 'FLEX' | 'NIGHT';

export interface ShiftFrame {
  shiftType: FrameShiftType;
  startTime: string;
  endTime: string;
}

export const SHIFT_FRAMES: ReadonlyArray<ShiftFrame> = [
  { shiftType: 'NORMAL', startTime: '08:00', endTime: '17:00' },
  { shiftType: 'NORMAL', startTime: '10:00', endTime: '19:00' },
  { shiftType: 'FLEX', startTime: '06:00', endTime: '15:00' },
  { shiftType: 'FLEX', startTime: '13:00', endTime: '22:00' },
  { shiftType: 'NIGHT', startTime: '22:00', endTime: '07:00' },
  { shiftType: 'NIGHT', startTime: '21:00', endTime: '06:00' }
];

export function findShiftFrame(shiftType: unknown, startTime: unknown): ShiftFrame | null {
  return SHIFT_FRAMES.find(f => f.shiftType === shiftType && f.startTime === startTime) ?? null;
}
