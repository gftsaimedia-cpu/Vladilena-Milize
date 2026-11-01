'use strict';
// Kiểm "máy chủ có nhận lịch này không" cho dữ liệu demo. Phản chiếu các kiểm tra chính của cleanDays và PUT /sheet trong server.js
// (không import được vì server.js không xuất hàm). Chỉ dùng để: persona hợp lệ phải không có vi phạm nào; persona `unreasonable`
// thì báo cho biết máy chủ hôm nay sẽ từ chối những gì. Không sửa dữ liệu, không đọc DB.
const PayrollCalendar = require('../../../src/engine/payroll-calendar');
const { accrued } = require('../../../src/engine/leave');
const H = require('./helpers');

const KINDS = ['work', 'makeup', 'leave', 'unpaid', 'willmakeup', 'approved', 'isat'];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const EPS = 1e-6;

// Các ngày "Nghỉ phép năm" thật sự trừ phép (bỏ ngày lễ trong lịch làm việc), qua mọi tháng
function leaveDates(p?, allSheets?, holidays?) {
  const hol = new Set<any>(holidays);
  const sched = H.SCHED[p.type] || H.SCHED.tts;
  const out: any[] = [];
  for (const days of Object.values<any>(allSheets))
    for (const [date, x] of Object.entries<any>(days))
      if (x && x.kind === 'leave' && !(hol.has(date) && sched.includes(H.dowOf(date)))) out.push(date);
  return out.sort();
}

// days: { 'YYYY-MM-DD': ngày } của một tháng. allSheets: { tháng: days } để tính phép. Trả [{ code, date? }]
function validatePersona(p?, allSheets?, holidays?, today?) {
  const issues: any[] = [];
  const add = (code?, date?, month?) =>
    issues.push({ code, date: date || null, month: month || (date ? date.slice(0, 7) : null) });
  const hol = new Set<any>(holidays);
  const assigned = H.SHIFT[p.shiftCode];
  for (const [month, days] of Object.entries<any>(allSheets)) {
    const type = (p.typeByMonth && p.typeByMonth[month]) || p.type; // người đổi loại giữa chừng: mỗi tháng theo loại của tháng đó
    const sched = H.SCHED[type] || H.SCHED.tts;
    const dates = Object.keys(days).sort();
    for (const date of dates) {
      const d = days[date] || {};
      if (!PayrollCalendar.isValidDate(date)) {
        add('date.invalid', date, month);
        continue;
      }
      if (!date.startsWith(month)) add('date.outsideMonth', date, month);
      const kind = d.kind === undefined ? 'work' : d.kind;
      if (!KINDS.includes(kind)) {
        add('day.kindUnknown', date);
        continue;
      }
      const dow = H.dowOf(date);
      if (dow === 0) add('day.sunday', date);
      if (!sched.includes(dow) && kind !== 'makeup' && kind !== 'unpaid' && dow !== 0) add('day.offSchedule', date);
      if (kind === 'work' || kind === 'makeup') {
        if (typeof d.in !== 'string' || typeof d.out !== 'string' || !TIME_RE.test(d.in) || !TIME_RE.test(d.out)) {
          add('day.time', date);
          continue;
        }
        if (H.spanH(d.in, d.out) > 9 + EPS) add('day.span9', date);
        const extraIn = d.extraIn && d.extraIn !== d.in ? d.extraIn : '';
        const extraOut = d.extraOut && d.extraOut !== d.out ? d.extraOut : '';
        const extraKind = d.extraKind || (extraOut ? 'makeup' : '');
        if (extraKind && !extraIn && !extraOut) add('day.extraEmpty', date);
        if (d.extraKind && !['makeup', 'ot'].includes(d.extraKind)) add('day.extraKind', date);
        if (kind === 'work' && assigned && !(d.in === assigned[0] && d.out === assigned[1])) add('day.shiftLock', date);
        if (kind === 'makeup') {
          if (hol.has(date)) add('day.makeupHoliday', date);
          if (sched.includes(dow)) add('day.makeupInSchedule', date);
        }
        if (
          (kind === 'makeup' && H.overlapsNight(H.toMin(d.in), H.toMin(d.out))) ||
          (extraIn && H.overlapsNight(H.toMin(extraIn), H.toMin(d.in))) ||
          (extraOut && H.overlapsNight(H.toMin(d.out), H.toMin(extraOut)))
        )
          add('day.nightExtra', date);
        if (hol.has(date) && sched.includes(dow) && extraKind) add('day.holidayExtra', date);
        if (extraKind === 'ot' && type === 'tts') add('day.ttsOt', date);
      }
      if ((kind === 'isat' || kind === 'approved') && type !== 'nv') add('day.nvOnly', date);
      if (kind === 'isat' && dow !== 6) add('day.isatSaturday', date);
      if (type === 'tts' && (kind === 'leave' || (kind === 'unpaid' && sched.includes(dow)))) add('day.ttsLeave', date);
    }
    // chồng giờ sang ngày hôm sau (chỉ các khoá ngày hợp lệ)
    const real = dates.filter(d => PayrollCalendar.isValidDate(d));
    for (let i = 0; i + 1 < real.length; i++) {
      const a = days[real[i]],
        b = days[real[i + 1]];
      if (!a || !b || H.addDays(real[i], 1) !== real[i + 1] || !a.in || !b.in) continue;
      if (!TIME_RE.test(a.in) || !TIME_RE.test(b.in) || !TIME_RE.test(a.out || '') || !TIME_RE.test(b.out || ''))
        continue;
      if (H.P.workBounds(a, real[i]).end > H.P.workBounds(b, real[i + 1]).start) add('day.overlapNext', real[i]);
    }
  }
  // phép năm: ở mỗi ngày phép, số đã dùng đến ngày đó không vượt số đã cộng; nghỉ không lương T2–T6 chỉ khi hết phép
  const leave = leaveDates(p, allSheets, holidays);
  for (const date of leave) {
    const got = accrued(p, date).total,
      used = leave.filter(x => x <= date).length;
    if (used > got + EPS) add('leave.balance', date);
  }
  for (const [month, days] of Object.entries<any>(allSheets))
    if (((p.typeByMonth && p.typeByMonth[month]) || p.type) !== 'tts')
      for (const [date, x] of Object.entries<any>(days)) {
        if (!x || x.kind !== 'unpaid') continue;
        const dow = H.dowOf(date);
        const left = accrued(p, date).total - leave.filter(l => l < date).length;
        if (dow >= 1 && dow <= 5 && left >= 1 - EPS) add('unpaid.weekdayWithLeave', date, month);
      }
  void today;
  return issues;
}

module.exports = { validatePersona };
