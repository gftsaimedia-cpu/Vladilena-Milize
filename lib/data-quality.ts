'use strict';

const LeaveRules = require('../public/leave');
const PayrollCalendar = require('../public/payroll-calendar');
const PayrollParams = require('../public/payroll-params');
const WorkSchedule = require('../public/work-schedule');
const { MONTH_LEN } = require('./ai/units');
const { benefitOf, positionFlagOf } = require('./ai/positions');

// Read-only reconciliation: source records are never changed or inferred here.
// params: bộ tham số phẳng của tháng đối soát (mặc định PayrollParams.DEFAULTS): luật phép năm (LeaveRules.create) và lịch (PayrollCalendar.create)
// đọc từ đây. Số phép đã dùng đếm lại bằng cùng quy tắc với lịch làm việc từ public/work-schedule.js
// (lịch của loại nhân sự theo bộ tham số): ngày nghỉ phép trùng ngày lễ nằm TRONG lịch của người thì không trừ phép.
// approvals: các dòng duyệt [{ username, date, item, status }] (store.approvals.list, mọi trạng thái; trạng thái khác 'rejected' bị bỏ qua).
// Cùng quy tắc với lib/domain/sheet.ts → leaveDates: ngày phép năm có dòng duyệt khoản 'leave' bị TỪ CHỐI thì đã trả lại phép,
// không tính là đã dùng; ngày phép đang chờ duyệt vẫn giữ chỗ (vẫn tính). Khớp theo (người, ngày); sheet đọc từ DB đã được reconcile nên dòng bị từ chối
// còn đó là ngày vẫn khai y nguyên. Thiếu approvals thì không ngày nào được coi là bị từ chối.
function evaluate({
  staff = [],
  sheets = [],
  holidays = [],
  approvals = [],
  today,
  params = PayrollParams.DEFAULTS
}: any) {
  const schedules = WorkSchedule.create(params);
  const isWorkDay = (person?, date?) => schedules.isWorkDay(schedules.scheduleFor(person, date), date);
  const { ledger } = LeaveRules.create(params);
  const { isValidDate } = PayrollCalendar.create(params);
  if (!isValidDate(today)) throw new TypeError('Ngày đối soát không hợp lệ');
  const holidayDates = new Set<any>(holidays.filter(isValidDate)),
    issues: any[] = [];
  const rejectedLeave = new Map<any, any>(); // username -> Set<ngày> phép năm bị Admin từ chối
  for (const row of Array.isArray(approvals) ? approvals : []) {
    if (!row || row.status !== 'rejected' || row.item !== 'leave' || typeof row.username !== 'string') continue;
    if (!rejectedLeave.has(row.username)) rejectedLeave.set(row.username, new Set());
    rejectedLeave.get(row.username).add(row.date);
  }
  for (const person of staff) {
    if (person.role === 'admin') continue;
    const identity = { username: person.username, name: person.name || person.username, severity: 'warning' };
    const days = new Map<any, any>();
    for (const sheet of sheets) {
      if (sheet.username !== person.username) continue;
      for (const [date, entry] of Object.entries<any>(sheet.days || {})) {
        if (isValidDate(date) && date.slice(0, MONTH_LEN) === sheet.month && entry) days.set(date, entry);
      }
    }
    // Tài khoản phép và ngày vào làm bắt buộc theo cờ của chức vụ (type.<mã>.benefit.leaveAccount, type.<mã>.startDateRequired), không theo tên loại
    if (benefitOf(params, person.type, 'leaveAccount', person.level)) {
      const startDate = isValidDate(person.startDate) ? person.startDate : null;
      if (!startDate && positionFlagOf(params, person.type, 'startDateRequired'))
        issues.push({
          ...identity,
          id: `missing-start-date:${person.username}`,
          code: 'missing-start-date',
          message: 'Thiếu ngày vào làm hợp lệ để đối soát phép năm. Cập nhật theo hồ sơ nhân sự.'
        });
      const usedDates: any[] = [];
      const rejected = rejectedLeave.get(person.username);
      for (const [date, entry] of days)
        if (
          entry.kind === 'leave' &&
          date <= today &&
          !(rejected && rejected.has(date)) &&
          !(holidayDates.has(date) && isWorkDay(person, date))
        )
          usedDates.push(date);
      // Số dư của sổ phép theo từng năm (cùng public/leave.js → ledger như màn Phép còn lại): quỹ cũ đã hết hạn không còn nằm trong số được cộng
      const led = ledger(
        { ...person, startDate, birthday: isValidDate(person.birthday) ? person.birthday : null },
        usedDates,
        today
      );
      const entitlement = led.total - led.expired;
      if (led.balance < 0)
        issues.push({
          ...identity,
          id: `negative-leave:${person.username}`,
          code: 'negative-leave',
          used: led.used,
          accrued: entitlement,
          balance: led.balance,
          message: `Đã dùng ${led.used} ngày phép, số phép còn trong sổ là ${entitlement}; còn ${led.balance} ngày. Kiểm tra ngày vào làm, điều chỉnh phép và lịch nghỉ.`
        });
    }
  }
  return { asOf: today, issues };
}

export = { evaluate };
