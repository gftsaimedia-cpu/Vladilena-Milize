const { rulesFor } = require('../request-rules');

/* ---------- ca làm việc theo giờ (cùng quy tắc với giao diện) ---------- */
const toMin = t => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
function overlapsNight(a, b) {
  let e = b;
  if (e <= a) e += 1440;
  for (let t = a; t < e; t++) {
    const x = t % 1440;
    if (x >= 1320 || x < 360) return true;
  }
  return false;
}
function spanH(tin, tout) {
  const a = toMin(tin),
    b = toMin(tout);
  let diff = b - a;
  if (diff <= 0) diff += 1440;
  return diff / 60;
}
function shiftFor(tin, tout) {
  const a = toMin(tin),
    b = toMin(tout);
  if (overlapsNight(a, b)) return 'night';
  if (a < 420 || b >= 1320) return 'flex';
  return 'normal';
}
// Giờ OT của một ngày đi làm: đoạn trước ca cộng đoạn sau ca, chỉ khi loại làm thêm là OT. OT không trừ giờ nghỉ: mỗi phút có mặt
// trong đoạn là một phút OT (khớp splitExtraWork của bộ máy lương), nên ví dụ 17:00–22:00 sau ca ngày là 5 giờ.
const extraOtHours = x =>
  x.extraKind === 'ot' && x.in && x.out
    ? (x.extraIn ? spanH(x.extraIn, x.in) : 0) + (x.extraOut ? spanH(x.out, x.extraOut) : 0)
    : 0;
const estimateOtHours = x => (x.in && x.out ? extraOtHours(x) : 0); // ca đêm cũng có OT (đoạn OT vẫn không được rơi vào 22h–6h)
const actualOtHours = x => (!x.otReview || x.otReview.ok ? extraOtHours(x) : 0);
function estimateHolidayOtHours(days, holidays, month) {
  const payrollCalendar = rulesFor(month).calendar;
  return Object.entries(days).reduce(
    (sum, [date, x]) =>
      sum +
      estimateOtHours(x) +
      (x.kind === 'work' && x.in && x.out ? payrollCalendar.splitMainWork(x, date, holidays).holidayH : 0),
    0
  );
}
function actualHolidayOtHours(rows, holidays, month) {
  const payrollCalendar = rulesFor(month).calendar;
  const holidayShifts = new Map();
  for (const s of rows)
    if (s.state === 'closed' && s.entry.attendanceConfirmed && s.entry.kind === 'work') {
      const p = s.entry.plannedShift,
        key = p ? `${p.startIso}/${p.endIso}` : String(s.id);
      const h = payrollCalendar.splitMainWork(s.entry, s.date, holidays).holidayH;
      holidayShifts.set(key, Math.max(holidayShifts.get(key) || 0, h));
    }
  return (
    rows.reduce((sum, s) => sum + actualOtHours(s.entry), 0) +
    [...holidayShifts.values()].reduce((sum, h) => sum + h, 0)
  );
}

module.exports = {
  toMin,
  overlapsNight,
  spanH,
  shiftFor,
  extraOtHours,
  estimateOtHours,
  actualOtHours,
  estimateHolidayOtHours,
  actualHolidayOtHours
};
