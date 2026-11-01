// Tab Ca làm: dựng từ GET /settings/shifts (ca và giờ), GET /staff (ca cố định của từng người), GET /positions (nhãn loại).
// buildShiftOverview thuần (không gọi mạng); loadShiftOverview đọc máy chủ rồi dựng.
import { api } from '@/services/http';
import { TYPE_SHORT } from './common';

// Chức vụ chỉ để ghi nhãn loại: người xem không có quyền đọc (403) thì dùng nhãn mặc định; lỗi khác nổi lên.
const optional = (path?) =>
  api('GET', path).catch(e => {
    if (e && e.status === 403) return null;
    throw e;
  });

const cap = (s?) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

/** "08:00 – 17:00"; ca qua nửa đêm (giờ ra không sau giờ vào) thêm " hôm sau". */
const hoursOf = (s?) => `${s.in} – ${s.out}${s.out <= s.in ? ' hôm sau' : ''}`;

/** Dòng phụ của người chưa có ca: "CTV · Practitioner"; bậc trùng tên loại (Nhân viên) thì chỉ ghi "NV". */
function subOf(p?, posByCode?) {
  const pos = posByCode.get(p.type) || null;
  const lvl = pos && (pos.levels || []).find(l => l.level === p.level);
  const level = p.levelName || (lvl && lvl.name) || '';
  const short = (pos && pos.short) || TYPE_SHORT[p.type] || String(p.type || '').toUpperCase();
  const label = pos ? pos.label : '';
  return [short, level && level !== label && level !== short ? level : ''].filter(Boolean).join(' · ');
}

/** Hình dạng ShiftsView đọc: { assigned, shifts: [{ code, name, hours, type, count }], unassigned: [{ username, name, sub }] }. */
export function buildShiftOverview(staffRes?, settingsShiftsRes?, positionsRes?) {
  const people = ((staffRes && staffRes.staff) || []).filter(s => s.payrollSubject === true && !s.locked);
  const positions = positionsRes && Array.isArray(positionsRes.positions) ? positionsRes.positions : [];
  const posByCode = new Map<any, any>(positions.map(p => [p.code, p]));
  const counts = new Map<any, any>();
  for (const p of people) if (p.shiftCode) counts.set(p.shiftCode, (counts.get(p.shiftCode) || 0) + 1);
  return {
    assigned: people.filter(p => p.shiftCode).length,
    shifts: ((settingsShiftsRes && settingsShiftsRes.shifts) || []).map(s => ({
      code: s.code,
      name: s.name,
      hours: hoursOf(s),
      type: cap(s.kind),
      count: counts.get(s.code) || 0
    })),
    unassigned: people
      .filter(p => !p.shiftCode)
      .sort((a: any, b: any) => a.name.localeCompare(b.name, 'vi'))
      .map(p => ({ username: p.username, name: p.name, sub: subOf(p, posByCode) }))
  };
}

/** Đọc máy chủ rồi dựng tab Ca làm. */
export async function loadShiftOverview() {
  const [staff, shifts, positions] = await Promise.all([
    api('GET', '/staff'),
    api('GET', '/settings/shifts'),
    optional('/positions')
  ]);
  return buildShiftOverview(staff, shifts, positions);
}
