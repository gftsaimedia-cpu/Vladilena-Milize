// Dịch vụ cho Chấm công & phép: bảng công, Hôm nay, OT, ca làm, sổ phép, chấm công thay hàng loạt.
import { fromMock } from './mock';
import { api } from './http';
import {
  buildDayDetail,
  buildOvertime,
  buildSheetBody,
  buildToday,
  buildTimesheet
} from '@/builders/admin-attendance/timesheet';
import { dayKeyOf, hhmm, lateMinOf } from '@/builders/admin-attendance/common';

// ---------- Chấm công & phép ----------

const qs = (o?) => new URLSearchParams(o).toString();
const shiftsOf = () => api('GET', '/settings/shifts').catch(() => ({ shifts: [] }));

/** Tiêu đề chung của các tab: ngày quên Check-in/out, ngày nên đối soát, lượt đi trễ, số tab Hôm nay. */
export async function getAttendanceSummary(month?) {
  const [alerts, team, today] = await Promise.all([
    api('GET', '/alerts?' + qs({ month })),
    api('GET', '/team?' + qs({ month })),
    api('GET', '/today')
  ]);
  const sessions = team.rows.flatMap(r => r.attendanceSessions || []);
  const pendingDays = new Set<any>(
    sessions.filter(s => s.status === 'pending').map(s => `${s.username}|${dayKeyOf(s)}`)
  );
  return {
    month,
    empty: !sessions.length,
    forgot: alerts.missingPunches.length,
    reconcile: pendingDays.size,
    late: sessions.filter(s => lateMinOf(s.statusNote) > 0).length,
    inShift: today.rows.filter(r => r.status === 'checked-in').length
  };
}

/** Bảng công tháng. filter: all | pending | tts | ctv | nv. */
export async function getTimesheet(month?, { filter = 'all', q = '', page = 1 }: any = {}) {
  const [team, shifts, today, hol] = await Promise.all([
    api('GET', '/team?' + qs({ month })),
    shiftsOf(),
    api('GET', '/today'),
    api('GET', '/holidays')
  ]);
  return buildTimesheet(
    { team, shifts, today: today.today, holidays: (hol.dates || []).filter(d => d.startsWith(month)) },
    { filter, q, page }
  );
}

/** Các lượt Check-in/out của một người trong một ngày (hộp chi tiết ngày), kể cả OT và giờ bù. */
export async function getDayDetail(personId?, date?) {
  const [sheet, shifts] = await Promise.all([
    api('GET', '/sheet?' + qs({ month: date.slice(0, 7), user: personId })),
    shiftsOf()
  ]);
  return buildDayDetail({ sheet, shifts }, personId, date);
}

/** Admin chấm công thay một người một ngày (ngày khai thay theo quy tắc của máy chủ); lỗi và cảnh báo giữ nguyên văn. */
export async function saveTimeFix({ personId, date, checkIn, checkOut, shift }: any) {
  const sheet = await api('GET', '/sheet?' + qs({ month: date.slice(0, 7), user: personId }));
  const body = buildSheetBody(buildDayDetail({ sheet, shifts: { shifts: [] } }, personId, date), {
    date,
    checkIn,
    checkOut,
    shift
  });
  return api('PUT', '/sheet', body);
}

/** Tab Hôm nay. filter: all | in | none | late. */
export async function getToday(month?, { filter = 'all', q = '', page = 1 }: any = {}) {
  const [today, shifts] = await Promise.all([api('GET', '/today'), shiftsOf()]);
  return { ...buildToday({ today, shifts }, { filter, q, page }), updatedAt: hhmm(new Date().toISOString()) };
}

/** Tab Sửa giờ: yêu cầu sửa giờ của nhân viên. status: pending | approved | rejected | all. Chưa có yêu cầu nào. */
// Nối máy chủ: GET /api/periods/:month/time-fix-requests?status=
export const getTimeFixRequests = (month?, { status = 'pending' }: any = {}) =>
  fromMock({ month, status, counts: { pending: 0 }, rows: [] });

/** Tab Giờ OT: OT khai đối chiếu với Check-in/out. status: pending | approved | rejected. Chưa có lượt nào. */
// Nối máy chủ: GET /api/periods/:month/overtime?status=
export async function getOvertimeRequests(month?, { status = 'pending' }: any = {}) {
  const ot = await api('GET', '/ot?' + qs({ status }));
  return buildOvertime({ ot, month, status });
}

import { loadShiftOverview } from '@/builders/admin-attendance/shifts';
/** Tab Ca làm: ca cố định kèm số người, và người chưa có ca (GET /staff, /settings/shifts, /positions). */
export const getShiftOverview = () => loadShiftOverview();

/** Sổ phép của một người trong một năm: số dư tới hôm nay và các lần cộng/hết hạn (GET /leave/ledger?user=). */
export async function getLeaveLedger({ username, year }: any) {
  const res = await api('GET', '/leave/ledger?' + qs({ user: username }));
  const events = (res.events || []).filter(e => !year || String(e.onDate).startsWith(`${year}-`));
  return {
    username: res.username,
    hasAccount: res.hasAccount,
    balance: res.balance,
    on: res.on,
    summary: res.summary,
    events
  };
}

/** Tính lại sổ phép của mọi người (POST /leave/refresh); trả { checked, accounts, failed }. */
export const refreshLeave = () => api('POST', '/leave/refresh', {});

/** Chấm công thay hàng loạt: mỗi ngày trong `dates` của mỗi người trong `usernames` đi làm theo ca `preset` (PUT /sheet/bulk). */
export function bulkPunch({ month, usernames, dates, preset, expectedRevs }: any) {
  const days = Object.fromEntries(dates.map(date => [date, { kind: 'work', preset }]));
  return api('PUT', '/sheet/bulk', { month, usernames, days, ...(expectedRevs ? { expectedRevs } : {}) });
}

/** Người và ca để chọn trong hộp chấm hàng loạt: người thuộc bảng lương chưa khoá, và ca cố định (mã ngắn kèm giờ). */
export async function getBulkPunchOptions() {
  const [staff, catalog, settings] = await Promise.all([
    api('GET', '/staff'),
    api('GET', '/catalog/shifts'),
    shiftsOf()
  ]);
  const hours = new Map<any, any>((settings.shifts || []).map(s => [s.code, `${s.in}–${s.out}`]));
  return {
    people: ((staff && staff.staff) || [])
      .filter(s => s.payrollSubject === true && !s.locked)
      .map(s => ({ value: s.username, label: `${s.name} · ${s.username}` }))
      .sort((a: any, b: any) => a.label.localeCompare(b.label, 'vi')),
    shifts: ((catalog && catalog.shifts) || [])
      .filter(s => !s.deprecated)
      .map(s => ({ value: s.preset, label: hours.has(s.code) ? `${s.name} · ${hours.get(s.code)}` : s.name }))
  };
}
