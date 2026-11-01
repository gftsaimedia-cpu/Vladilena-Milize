'use strict';
// Lượt Check-in/out của một người đã bấm đúng giờ như lịch đã khai: mỗi ngày đi làm hoặc làm bù có giờ vào – ra thì có một lượt đóng
// từ giờ vào đến giờ ra đã khai (giờ OT hoặc giờ bù đi kèm kéo dài lượt). Dùng cho test cần "người này đi làm đủ như khai".
const PunchRules = require('../../src/engine/punch');

const MON_SAT = [1, 2, 3, 4, 5, 6];
const vn = (date?, time?) => Date.parse(`${date}T${time}:00+07:00`);
const nextDay = (date?) => new Date(Date.parse(`${date}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
const minutes = (time?) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const dowOf = (date?) => new Date(`${date}T00:00:00Z`).getUTCDay();

function scheduleDows(staff?) {
  const entry =
    Array.isArray(staff.schedule) && staff.schedule.length ? staff.schedule[staff.schedule.length - 1] : null;
  return entry && entry.pattern && Array.isArray(entry.pattern.dows) ? entry.pattern.dows : MON_SAT;
}
// Mã ca có giờ vào – ra đúng bằng giờ đã khai; không có thì ca của người, rồi n1
const presetOf = (staff?, day?) =>
  Object.keys(PunchRules.SHIFT).find(
    code => PunchRules.SHIFT[code][0] === day.in && PunchRules.SHIFT[code][1] === day.out
  ) ||
  staff.shiftCode ||
  'n1';
// Giờ ra thuộc ngày hôm sau khi không muộn hơn giờ vào
const endDateOf = (date?, from?, to?) => (minutes(to) <= minutes(from) ? nextDay(date) : date);

// days: lịch đã khai; trả mảng { id, username, date, state: 'closed', entry }
function declaredPunches(staff?, days?) {
  const dows = scheduleDows(staff);
  const out: any[] = [];
  let id = 0;
  for (const date of Object.keys(days).sort()) {
    const day = days[date];
    if (!day || (day.kind !== 'work' && day.kind !== 'makeup') || !day.in || !day.out) continue;
    const startIso = new Date(vn(date, day.in)).toISOString();
    const endIso = new Date(vn(endDateOf(date, day.in, day.out), day.out)).toISOString();
    // giờ ra có mặt: giờ ra ca, hoặc giờ ra làm thêm nếu muộn hơn (tính từ giờ vào, qua nửa đêm thì sang ngày sau)
    const sinceIn = (hm?) => minutes(hm) + (minutes(hm) <= minutes(day.in) ? 1440 : 0);
    const pressTo = day.extraKind && day.extraOut && sinceIn(day.extraOut) > sinceIn(day.out) ? day.extraOut : day.out;
    const pressFrom =
      day.extraKind && day.extraIn && day.extraIn !== day.out && minutes(day.extraIn) < minutes(day.in)
        ? day.extraIn
        : day.in; // giờ bù, OT liền sau ca không kéo giờ vào sớm lên
    const plannedShift = {
      code: presetOf(staff, day),
      date,
      in: day.in,
      out: day.out,
      startIso,
      endIso,
      kind: dows.includes(dowOf(date)) ? 'work' : 'makeup'
    };
    out.push({
      id: ++id,
      username: staff.username,
      date,
      state: 'closed',
      entry: {
        kind: plannedShift.kind,
        in: day.in,
        out: day.out,
        extraKind: '',
        extraIn: '',
        extraOut: '',
        preset: plannedShift.code,
        breakMin: 0,
        src: 'punch',
        presIn: new Date(vn(date, pressFrom)).toISOString(),
        presOut: new Date(vn(endDateOf(date, pressFrom, pressTo), pressTo)).toISOString(),
        plannedShift,
        attendanceConfirmed: true
      }
    });
  }
  return out;
}

module.exports = { declaredPunches };
