'use strict';
// Các ngày nghỉ phép năm thực sự trừ phép của một người (tách khỏi src/domain/sheet.ts để src/domain/payroll/payroll-service.ts dùng được mà không vòng require).
const store = require('../platform/db');
const schedule = require('./schedule'); // lịch làm việc của người (một nguồn)

// Ngày phép chờ duyệt vẫn nằm trong danh sách này: ngày phép chờ duyệt giữ chỗ trong số dư, để nhân sự không khai quá phép trong lúc chờ
// (leaveSummary, kiểm số dư của PUT /sheet và số phép của app nhân viên đều dựa vào đây).
// Ngày phép bị Admin TỪ CHỐI thì trả lại phép, không tính là đã dùng; lương không đổi: ApprovalView đã trả ngày đó như nghỉ không lương.
// các ngày "Nghỉ phép năm" thực sự trừ phép (bỏ ngày lễ vì ngày lễ đã có lương lễ), qua mọi tháng; override = { month, days } để thay một tháng bằng dữ liệu đang lưu
async function leaveDates(staff?, override?, givenHolidays?) {
  const holidayDates = givenHolidays === undefined ? await store.getSetting('holidays', []) : givenHolidays;
  const holidays = new Set<any>(holidayDates),
    out: any[] = [];
  const sheets = (await store.listSheets(staff.username)).filter(s => !override || s.month !== override.month);
  if (override) sheets.push(override);
  const rejected = await rejectedLeaveDates(staff, override, holidays);
  for (const s of sheets)
    for (const [d, x] of Object.entries<any>(s.days)) {
      // lịch làm việc của người trong tháng chứa ngày đó, chỉ tra khi ngày trùng ngày lễ (hiếm)
      if (x.kind === 'leave' && !rejected.has(d) && !(holidays.has(d) && (await schedule.isWorkDay(staff, d))))
        out.push(d);
    }
  return out.sort();
}
// Ngày có dòng duyệt khoản "leave" ở trạng thái bị từ chối. Với tháng của override (lịch sắp lưu), dòng bị từ chối chỉ còn hiệu lực nếu ngày đó
// khai y nguyên (cùng mục và dấu vân tay): khai lại khác đi thì reconcile đưa về chờ duyệt nên lại giữ chỗ phép.
async function rejectedLeaveDates(staff?, override?, holidays?) {
  const rows = (await store.approvals.list({ username: staff.username, status: 'rejected' })).filter(
    r => r.item === 'leave'
  );
  if (!rows.length) return new Set();
  const declared = override
    ? store.approvals.declaredItems(override.days, {
        holidays: [...holidays],
        staffType: staff.type,
        schedule: await schedule.scheduleOf(staff, override.month)
      })
    : {};
  return new Set<any>(
    rows
      .filter(r => {
        if (!override || !r.date.startsWith(override.month + '-')) return true;
        const now = declared[r.date];
        return !!now && now.item === r.item && now.fingerprint === r.fingerprint;
      })
      .map(r => r.date)
  );
}
export = { leaveDates };
