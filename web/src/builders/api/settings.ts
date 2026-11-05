// Kiểu dữ liệu của kho cài đặt (BE v2 §5) và bảng đổi khoá nhóm ↔ đường dẫn. File thuần: không import gì của trang.

export type GroupKey = 'overtime' | 'attendance' | 'kpiWeights' | 'insurance' | 'tax' | 'payCalendar';
export type GroupPath = 'overtime' | 'attendance' | 'kpi-weights' | 'insurance' | 'tax' | 'pay-calendar';

export const GROUP_PATH: Record<GroupKey, GroupPath> = {
  overtime: 'overtime',
  attendance: 'attendance',
  kpiWeights: 'kpi-weights',
  insurance: 'insurance',
  tax: 'tax',
  payCalendar: 'pay-calendar',
};

export type Bracket = { upTo: number | null; ratePct: number };
export type Values = Record<string, number | Bracket[]>;
export type GroupState = {
  from: string;
  stamp: number;
  values: Values;
  defaults: Values;
  limits: Record<string, any>;
  sum?: number;
};
export type SettingsResponse = { month: string; minMonth: string; groups: Record<GroupKey, GroupState> };
export type SaveBody = { effectiveMonth: string; values: Values; reason: string | null; stamp: number };
export type SaveResult = { ok: true; effectiveMonth: string; changed: string[]; stamp: number };
export type HistoryItem = {
  id: number;
  field: string;
  month: string | null;
  from: any;
  to: any;
  by: string;
  at: string;
  reason: string | null;
};
export type PayDayItem = { month: string; payDay: number; payDate: string };
export type WorkWeek = {
  username: string;
  month: string;
  minMonth: string;
  weekdays: number[];
  source: 'type' | 'own';
  from: string | null;
  standardWorkdays: number;
  typeWeekdays: number[];
  typeStandardWorkdays: number;
  stamp: number;
};
export type WorkWeekBody = { effectiveMonth: string; weekdays: number[] | null; reason: string | null; stamp: number };
export type Zone = { lat: number; lng: number; radiusM: number };
export type ShiftRow = {
  code: string;
  name: string;
  kind: 'normal' | 'flex' | 'night';
  startTime: string;
  endTime: string;
};
