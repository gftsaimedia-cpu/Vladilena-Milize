'use strict';
// Các lần cộng phép có ngày phát sinh của một người tới hết ngày `upTo`, dựng theo ĐÚNG quy tắc đếm của src/engine/leave.ts → counted
// (tháng tròn tính từ ngày vào làm, lùi về cuối tháng nếu tháng ngắn hơn; năm tròn = 12 tháng tròn, chỉ để tính mốc thâm niên mỗi leave.seniority.stepYears năm;
// sinh nhật chỉ cấp Nhân viên). Chỉ lấy các lần cộng từ 01/01 của năm quỹ đầu tiên (max(năm vào làm, leave.expiry.fromYear),
// leave.expiry.month ≥ 1): lần cộng trước đó không nằm trong quỹ nào. Điều chỉnh tay của Admin là số mở đầu của quỹ đầu tiên, không phải dòng có ngày.
// Tổng số ngày của các dòng = counted(...).total − điều chỉnh tay (đối chiếu trong test).
// Thuần: không đọc DB, không đọc đồng hồ.
const NV_TYPE = 'nv'; // cùng quy ước NV_TYPE của src/engine/leave.ts
const MONTHS_PER_YEAR = 12; // đơn vị lịch, không phải tham số nghiệp vụ
const SENIORITY_DAYS = 1; // src/engine/leave.ts cộng 1 ngày mỗi bậc thâm niên
const pad = (n?) => String(n).padStart(2, '0');
const daysIn = (y?, m?) => new Date(y, m, 0).getDate();
const iso = (y?, m?, d?) => `${y}-${pad(m)}-${pad(Math.min(d, daysIn(y, m)))}`;
const parts = (s?) => s.split('-').map(Number);

// Ngày tròn k tháng kể từ `start` (cùng cách src/engine/leave.ts → fullMonths)
function monthMark(start?, k?) {
  const [sy, sm, sd] = parts(start);
  const t = new Date(sy, sm - 1 + k, 1);
  return iso(t.getFullYear(), t.getMonth() + 1, sd);
}

// staff: { type, startDate, birthday }; P: bộ tham số phẳng của tháng. Trả [{ kind, onDate, days }] theo ngày tăng dần
function accrualEvents(staff?, upTo?, P?) {
  const start = staff.startDate;
  if (!start || upTo < start) return [];
  const out: any[] = [];
  const startDays = P['leave.accrual.start'];
  const monthDays = P['leave.accrual.perMonth'];
  const birthdayDays = P['leave.accrual.birthday'];
  const stepYears = P['leave.seniority.stepYears'];
  // Chỉ giữ lần cộng sau 31/12 của năm liền trước quỹ đầu tiên
  const first = P['leave.expiry.month'] >= 1 ? Math.max(parts(start)[0], P['leave.expiry.fromYear']) : null;
  const floor = first === null ? '' : `${first - 1}-12-31`;
  if (startDays) out.push({ kind: 'start', onDate: start, days: startDays });
  for (let k = 1; ; k++) {
    const onDate = monthMark(start, k);
    if (onDate > upTo) break;
    out.push({ kind: 'month', onDate, days: monthDays });
    if (k % MONTHS_PER_YEAR === 0) {
      const years = k / MONTHS_PER_YEAR;
      if (stepYears > 0 && years % stepYears === 0) out.push({ kind: 'seniority', onDate, days: SENIORITY_DAYS });
    }
  }
  if (staff.type === NV_TYPE && staff.birthday) {
    const [, bm, bd] = parts(staff.birthday);
    for (let y = parts(start)[0]; y <= Number(upTo.slice(0, 4)); y++) {
      const onDate = iso(y, bm, bd);
      if (onDate >= start && onDate <= upTo) out.push({ kind: 'birthday', onDate, days: birthdayDays });
    }
  }
  return out
    .filter(e => e.onDate > floor)
    .sort((a: any, b: any) => (a.onDate < b.onDate ? -1 : a.onDate > b.onDate ? 1 : 0));
}

export = { accrualEvents, monthMark };
