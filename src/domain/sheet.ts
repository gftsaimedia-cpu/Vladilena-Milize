const store = require('../platform/db');
const payrollService = require('./payroll/payroll-service'); // nạp đầu vào một tháng, chạy bộ máy dùng chung
const { rulesFor, vnToday } = require('../platform/request-rules');
const schedule = require('./schedule'); // lịch làm việc của người (một nguồn)
const { leaveDates } = require('./leave-days'); // ngày nghỉ phép năm thực sự trừ phép

// Lịch ước tính chỉ chứa các trường người dùng được khai tay. Dữ liệu chấm công cũ
// vẫn giữ nguyên trong DB, nhưng không mang nguồn/duyệt chấm công vào phép tính.
async function estimateSheet(username?, month?) {
  const sheet = await store.getSheet(username, month);
  // Chỉ các trường khai tay (một nguồn với bộ máy tính lương): payrollService.estimateDays
  return { ...sheet, days: payrollService.estimateDays(sheet.days) };
}
// hai ngày giáp ranh của tháng: ngày cuối tháng trước và ngày 1 tháng sau (để kiểm chồng giờ ca đêm qua ranh giới tháng)
async function neighborDays(username?, month?) {
  const [y, m] = month.split('-').map(Number),
    mk = (t?) => `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`;
  const pm = mk(new Date(y, m - 2, 1)),
    nm = mk(new Date(y, m, 1));
  const prevLast = `${pm}-${String(new Date(y, m - 1, 0).getDate()).padStart(2, '0')}`,
    nextFirst = `${nm}-01`;
  const out: Record<string, any> = {},
    a = (await estimateSheet(username, pm)).days[prevLast],
    b = (await estimateSheet(username, nm)).days[nextFirst];
  if (a) out[prevLast] = a;
  if (b) out[nextFirst] = b;
  return out;
}
const leaveSummary = async (s?) => {
  const { ledger } = (await rulesFor()).leave;
  const a = ledger(
    s,
    (await leaveDates(s)).filter(d => d <= vnToday()),
    vnToday()
  );
  const { settled, ...rest } = a;
  return { ...rest, balance: a.balance };
};

export = { estimateSheet, leaveDates, neighborDays, leaveSummary, schedule };
