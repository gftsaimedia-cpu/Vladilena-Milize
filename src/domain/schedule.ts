'use strict';
const { rulesFor, vnToday } = require('../platform/request-rules');

// Lịch làm việc của MỘT người cho mọi nơi của máy chủ (PUT /sheet, chấm công, duyệt, leaveDates, /team): giải bằng rulesFor(tháng).workSchedule
// (src/engine/work-schedule.ts, một nguồn), tức lịch của loại nhân sự theo tham số của THÁNG chứa ngày (type.<mã>.dows, workdays, workdaysMode).
//   scheduleOf(staff, month)   lịch hiệu lực { source, from, pattern, workdays }
//   isWorkDay(staff, date)     ngày có phải ngày làm theo lịch của người (tháng của ngày quyết định)
//   isWorkDayFn(staff)         hàm đóng date → boolean cho punch.js (staff.isWorkDay)
const scheduleOf = async (staff?, month?) => (await rulesFor(month)).workSchedule.scheduleOf(staff, month);
async function isWorkDay(staff?, date?) {
  const ws = (await rulesFor(date.slice(0, 7))).workSchedule;
  return ws.isWorkDay(ws.scheduleFor(staff, date), date);
}
// Tháng của ngày d, ngày trước và ngày sau nó (ca đêm cuối tháng lấy lịch của ngày công, không của tháng chấm)
const monthsAround = (dates?) => {
  const months = new Set<any>();
  for (const value of dates) {
    const [y, m, d] = String(value).slice(0, 10).split('-').map(Number);
    for (const shift of [-1, 0, 1]) {
      const x = new Date(Date.UTC(y, m - 1, d + shift));
      months.add(`${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}`);
    }
  }
  return months;
};
// Hàm đóng date → boolean ĐỒNG BỘ cho src/engine/punch.ts (staff.isWorkDay): punch.js dùng chung với trình duyệt nên không async được.
// Vì vậy nạp trước lịch của các tháng quanh các ngày sẽ dùng (mặc định hôm nay); ngày ngoài các tháng đó là lỗi lập trình.
async function isWorkDayFn(staff, ...dates) {
  const byMonth = new Map<any, any>();
  for (const month of monthsAround(dates.length ? dates : [vnToday()]))
    byMonth.set(month, (await rulesFor(month)).workSchedule);
  return date => {
    const ws = byMonth.get(date.slice(0, 7));
    if (!ws) throw new Error(`Lịch làm việc tháng ${date.slice(0, 7)} chưa được nạp cho punchStaff`);
    return ws.isWorkDay(ws.scheduleFor(staff, date), date);
  };
}

// Lịch của người trong tháng cho giao diện (GET /sheet): { workSchedule, scheduledDates }
async function scheduleView(staff?, month?) {
  if (!staff) return {};
  const ws = (await rulesFor(month)).workSchedule;
  const workSchedule = ws.scheduleOf(staff, month);
  return {
    workSchedule: {
      ...workSchedule,
      describe: ws.describe(workSchedule),
      workdaysStd: ws.workdaysOf(workSchedule, month)
    },
    scheduledDates: ws.scheduledDates(workSchedule, month)
  };
}
// GET /api/team: schedules = lịch của từng loại nhân sự trong tháng (một lần cho cả bảng)
async function team(month?) {
  const ws = (await rulesFor(month)).workSchedule;
  const params = (await rulesFor(month)).params;
  const schedules: Record<string, any> = {};
  for (const key of Object.keys(params)) {
    const m = /^type.([^.]+).dows$/.exec(key);
    if (!m) continue;
    const schedule = ws.scheduleOf({ type: m[1] }, month);
    schedules[m[1]] = {
      ...schedule,
      workdaysStd: ws.workdaysOf(schedule, month),
      scheduledDates: ws.scheduledDates(schedule, month)
    };
  }
  return { schedules };
}
// Trạng thái ngày công cho GET/POST /punch: workDate (ngày công của lượt) và scheduled (ngày đó có trong lịch của người)
const punchSchedule = async (staff?, date?) => ({ workDate: date, scheduled: await isWorkDay(staff, date) });

// GET /api/staff/:u/schedule?month= (chính mình hoặc profile.read): lịch của người trong tháng theo loại nhân sự
async function staffView(staff?, month?) {
  const ws = (await rulesFor(month)).workSchedule;
  const schedule = ws.scheduleOf(staff, month);
  return {
    username: staff.username,
    month,
    type: staff.type,
    source: schedule.source,
    schedule,
    workdaysStd: ws.workdaysOf(schedule, month),
    scheduledDates: ws.scheduledDates(schedule, month)
  };
}

export = { scheduleOf, isWorkDay, isWorkDayFn, scheduleView, punchSchedule, team, staffView };
