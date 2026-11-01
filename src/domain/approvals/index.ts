const store = require('../../platform/db');
const { HttpError } = require('../../platform/http');
const { rulesFor } = require('../../platform/request-rules');
const { validMonth, validDate } = require('../input');
const { estimateSheet } = require('../sheet');
const schedule = require('../schedule'); // lịch làm việc của người (một nguồn)

// Lịch làm việc đã giải của người trong tháng, đưa vào ctx của khoản OT ngày lễ; staffType (nếu có) thay loại đang lưu (đổi loại chưa ghi)
const scheduleCtx = async (username?, month?, staffType?) => {
  const staff = await store.getStaff(username);
  return staff ? await schedule.scheduleOf({ ...staff, type: staffType ?? staff.type }, month) : undefined;
};

/* ---------- khoản tự khai chờ duyệt ---------- */
// Các dòng duyệt của một lịch tháng gửi cho trình duyệt: mỗi ngày có khoản cần duyệt đều có một mục, trạng thái là
// trạng thái hiệu lực (không có dòng hoặc dấu vân tay lệch = chờ duyệt). Luôn kèm fingerprint để payView tính đúng.
// Khoản OT ngày lễ cần lịch lễ và loại nhân sự (ctx); holidays / staffType truyền vào để tránh đọc lại khi gọi nhiều lần.
async function sheetApprovals(username?, month?, days?, givenHolidays?, givenStaffType?) {
  const holidays = givenHolidays === undefined ? await store.getSetting('holidays', []) : givenHolidays;
  const staffType = givenStaffType === undefined ? (await store.getStaff(username))?.type : givenStaffType;
  const approvalView = (await rulesFor(month)).approvalView;
  const rows = await store.approvals.forSheet(username, month),
    ctx = { holidays, staffType, schedule: await scheduleCtx(username, month, staffType) },
    out: Record<string, any> = {};
  for (const [date, day] of Object.entries<any>(days)) {
    const dayCtx = approvalView.dayCtx(ctx, date),
      found = approvalView.itemOf(day, dayCtx);
    if (!found) continue;
    const row = rows[date],
      same = !!row && row.fingerprint === found.fingerprint;
    out[date] = {
      item: found.item,
      fingerprint: found.fingerprint,
      ...(found.holiday ? { holiday: true } : {}),
      status: approvalView.effectiveStatus(day, row, dayCtx),
      rev: row ? row.rev : 0,
      decidedBy: same ? row.decidedBy : null,
      decidedAt: same ? row.decidedAt : null,
      note: same ? row.note : null
    };
  }
  return out;
}
// Admin đổi lịch lễ: khoản OT ngày lễ của mọi nhân sự trong các tháng có ngày thêm hoặc bỏ phải khớp lịch lễ mới.
// Ngày khai đi làm vừa thành ngày lễ thành chờ duyệt (đã duyệt sẵn nếu tháng ≤ 09/2026); ngày lễ bị bỏ thì dòng duyệt biến mất. Gọi trong transaction của PUT /holidays.
async function reconcileHolidayWork(before?, after?) {
  const old = new Set<any>(before);
  const next = new Set<any>(after);
  const months = new Set<any>(
    [...after.filter(d => !old.has(d)), ...before.filter(d => !next.has(d))].map(d => d.slice(0, 7))
  );
  if (!months.size) return;
  for (const staff of (await store.listStaff()).filter(s => s.payrollSubject))
    for (const month of [...months].sort()) await reconcileMonthApprovals(staff.username, month, after, staff.type);
}
// Các khoản cần duyệt của lịch ước tính một tháng đã lưu, đồng bộ vào bảng duyệt theo danh sách lễ và loại nhân sự đã cho.
// Khoá ngày ngoài tháng hoặc không phải ngày thật trong dữ liệu lưu cũ bị bỏ qua (không làm hỏng cả lần lưu).
// Tháng ≤ 09/2026 coi như đã duyệt, giống đợt di chuyển. Gọi trong transaction của người gọi.
async function reconcileMonthApprovals(username?, month?, holidays?, staffType?) {
  const declared = store.approvals.declaredItems((await estimateSheet(username, month)).days, {
    holidays,
    staffType,
    schedule: await scheduleCtx(username, month, staffType)
  });
  for (const date of Object.keys(declared))
    if (!date.startsWith(month + '-') || !validDate(date)) delete declared[date];
  return await store.approvals.reconcile(username, month, declared, { approveBefore: store.approvals.CUTOFF_MONTH });
}
// Đổi loại nhân sự đổi lịch làm việc (TTS không có Thứ 7), nên khoản OT ngày lễ của mọi tháng đã có lịch phải khớp loại mới.
async function reconcileStaffType(username?, type?) {
  const holidays = await store.getSetting('holidays', []);
  for (const { month } of (await store.listSheets(username)).sort((a: any, b: any) => a.month.localeCompare(b.month)))
    if (validMonth(month)) await reconcileMonthApprovals(username, month, holidays, type);
}
// Dòng duyệt của nhân sự được trả lương theo bộ lọc tháng / người; tài khoản ngoài bảng lương (Admin, tài khoản chỉ có vai trò) không có hàng chờ
async function listApprovals(filter?) {
  const outsiders = new Set<any>((await store.listStaff()).filter(s => !s.payrollSubject).map(s => s.username));
  return (await store.approvals.list(filter)).filter(row => !outsiders.has(row.username));
}
const tallyApprovals = (rows?) => {
  const counts = { pending: 0, approved: 0, rejected: 0 };
  for (const row of rows) counts[row.status]++;
  return counts;
};
const APPROVAL_HTTP_STATUS = {
  APPROVAL_NOT_FOUND: 404,
  APPROVAL_STALE: 409,
  APPROVAL_NOOP: 409,
  APPROVAL_SELF: 403,
  APPROVAL_NOTE_REQUIRED: 400,
  APPROVAL_NOTE_TOO_LONG: 400
};
function approvalHttpError(error?) {
  const status = APPROVAL_HTTP_STATUS[error.code];
  return status ? new HttpError(status, error.message, { code: error.code, items: error.items }) : error;
}

export = {
  sheetApprovals,
  reconcileHolidayWork,
  reconcileMonthApprovals,
  reconcileStaffType,
  listApprovals,
  tallyApprovals,
  approvalHttpError
};
