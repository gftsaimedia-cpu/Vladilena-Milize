// Dịch vụ kho cài đặt (BE v2 §5): nhóm cài đặt theo tháng, ngày trả lương, tuần làm việc từng người, vùng chấm công, 6 ca cố định.
// Dữ liệu giả (__MOCK__): mock/settings.ts, trả qua respond(); lỗi stale ném ApiError mang code SETTINGS_STALE như máy chủ.
import { api, qs } from '@/services/http';
import { respond } from '@/mock/respond';
import {
  groupHistory,
  MOCK_SHIFTS,
  payDaysOf,
  saveGroup,
  saveWorkWeekOf,
  saveZoneOf,
  settingsAt,
  workWeekHistory,
  workWeekOf,
  workWeeksAt,
  zoneOf
} from '@/mock/settings';
import {
  orNoWorkWeek,
  type GroupPath,
  type HistoryItem,
  type PayDayItem,
  type SaveBody,
  type SaveResult,
  type SettingsResponse,
  type ShiftRow,
  type WorkWeek,
  type WorkWeekBody,
  type Zone
} from '@/builders/api/settings';

export const STALE_TEXT = 'Có người vừa lưu trước, đã tải lại';
export const isStale = (e: unknown) => (e as any)?.code === 'SETTINGS_STALE';

// Hàm giả có thể ném (stale, ngoài khoảng): bọc lại để lỗi thành Promise bị từ chối như một lời gọi thật.
const mocked = async <T>(fn: () => T): Promise<T> => respond(fn());

export async function getSettings(month?: string): Promise<SettingsResponse> {
  if (__MOCK__) return mocked(() => settingsAt(month));
  return api('GET', `/settings${qs({ month })}`);
}

export async function saveSettingsGroup(group: GroupPath, body: SaveBody): Promise<SaveResult> {
  if (__MOCK__) return mocked(() => saveGroup(group, body));
  return api('PUT', `/settings/${group}`, body);
}

export async function getSettingsHistory(group: GroupPath): Promise<{ items: HistoryItem[] }> {
  if (__MOCK__) return mocked(() => groupHistory(group));
  return api('GET', `/settings/${group}/history`);
}

export async function getPayDays(year: number): Promise<{ year: number; items: PayDayItem[] }> {
  if (__MOCK__) return mocked(() => payDaysOf(year));
  return api('GET', `/settings/pay-days${qs({ year })}`);
}

/** Tuần làm việc của một người ở tháng month; null khi loại nhân sự của người đó không có tuần làm (404 WORK_WEEK_NOT_FOUND). */
export async function getWorkWeek(username: string, month?: string): Promise<WorkWeek | null> {
  if (__MOCK__) return orNoWorkWeek(mocked(() => workWeekOf(username, month)));
  return orNoWorkWeek(api('GET', `/settings/work-weeks/${encodeURIComponent(username)}${qs({ month })}`));
}

/**
 * Tuần làm việc của mọi người ở tháng month (BE §5.3): tuần riêng nếu có, không thì tuần của loại nhân sự; người có loại
 * không có tuần làm thì không có mặt. Dữ liệu giả không có danh sách nhân sự nên chỉ trả người có tuần riêng; người vắng mặt coi như T2–T7.
 */
export async function getWorkWeeks(month: string): Promise<{ month: string; weekdays: Record<string, number[]> }> {
  if (__MOCK__) return mocked(() => workWeeksAt(month));
  return api('GET', `/settings/work-weeks${qs({ month })}`);
}

export async function saveWorkWeek(
  username: string,
  body: WorkWeekBody
): Promise<{ ok: true; weekdays: number[]; source: 'type' | 'own'; standardWorkdays: number; stamp: number }> {
  if (__MOCK__) return mocked(() => saveWorkWeekOf(username, body));
  return api('PUT', `/settings/work-weeks/${encodeURIComponent(username)}`, body);
}

export async function getWorkWeekHistory(username: string): Promise<{ items: HistoryItem[] }> {
  if (__MOCK__) return mocked(() => workWeekHistory(username));
  return api('GET', `/settings/work-weeks/${encodeURIComponent(username)}/history`);
}

export async function getAttendanceZone(): Promise<{ zone: Zone | null; stamp: number }> {
  if (__MOCK__) return mocked(() => zoneOf());
  return api('GET', '/settings/attendance-zone');
}

export async function saveAttendanceZone(
  body: Zone & { reason: string | null; stamp: number }
): Promise<{ ok: true; zone: Zone; stamp: number }> {
  if (__MOCK__) return mocked(() => saveZoneOf(body));
  return api('PUT', '/settings/attendance-zone', body);
}

// 6 ca cố định, chỉ đọc: GET /employees/meta/shifts → { shifts: [{ code, name, kind, startTime, endTime }] }.
export async function getShifts(): Promise<ShiftRow[]> {
  if (__MOCK__) return respond(MOCK_SHIFTS);
  const { shifts = [] } = await api('GET', '/employees/meta/shifts');
  return shifts;
}
