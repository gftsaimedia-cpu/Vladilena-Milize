'use strict';
// Dữ liệu giả cho test của src/ai/review.ts: toàn người giả (qa_*), tháng 10/2026, không đụng data/.
// world() dựng đầu vào của review() giống cách máy chủ sẽ dựng: mỗi ngày có khoản cần duyệt sinh một hàng duyệt chờ duyệt
// (fingerprint tính bằng chính ApprovalView), muốn đổi hàng nào thì truyền rows['username|YYYY-MM-DD'].
const P = require('../../src/engine/punch.js');
const ApprovalView = require('../../src/engine/approval-view.js');
const { loadPayroll } = require('../../src/ai/payroll-loader');
const { DEFAULTS } = require('../../src/engine/payroll-params.js');
const { declaredPunches } = require('../helpers/declared-punches');

const payroll = loadPayroll();
const MONTH = '2026-10';
const ASOF = '2026-11-04T09:00:00+07:00'; // sau hạn mùng 3 của tháng 10
const ON_TIME = '2026-10-20T03:00:00.000Z'; // 10:00 giờ VN ngày 20/10: đúng hạn

const person = (username?, extra: any = {}) => ({
  username,
  name: 'Người Giả ' + username,
  role: 'staff',
  type: 'nv',
  level: 1,
  nightPct: 40,
  idorm: false,
  shiftCode: 'n1',
  startDate: '2026-01-05',
  birthday: '1995-06-15',
  leaveAdjust: 30,
  locked: false,
  lockedAt: null,
  ...extra
});

const vn = (date?, hm?, plus = 0) => {
  const d = new Date(Date.parse(date + 'T00:00:00Z') + plus * 86400000).toISOString().slice(0, 10);
  return `${d}T${hm}:00+07:00`;
};
const punchStaff = (code?) => ({ shiftCode: code, sched: [1, 2, 3, 4, 5, 6] });

// Lượt đã đóng dựng bằng PunchRules.buildDay như máy chủ. outPlus = 1 khi ra sau 0 giờ (ca đêm).
async function closedSession(username?, code?, date?, inHm?, outHm?, outPlus = 0) {
  const planned = P.planShift(await punchStaff(code), date);
  const built = P.buildDay(await punchStaff(code), vn(date, inHm), vn(date, outHm, outPlus), 'admin', {
    plannedShift: planned,
    approveIncomplete: true
  });
  return { username, date: built.date, state: 'closed', entry: built.entry };
}
async function openSessionFor(username?, code?, date?, inHm?) {
  const planned = P.planShift(await punchStaff(code), date);
  const built = P.openDay(await punchStaff(code), vn(date, inHm), planned);
  return { username, date: built.date, state: 'open', entry: built.entry };
}

const workDay = (extra: any = {}) => ({ kind: 'work', in: '08:00', out: '17:00', ...extra });
const otDay = (extraOut = '19:00') => workDay({ extraKind: 'ot', extraIn: '', extraOut });
const makeupHoursDay = (extraOut = '18:00') => workDay({ extraKind: 'makeup', extraIn: '', extraOut });

// Lượt Check-in/out đúng giờ cho mọi ngày đi làm đã khai và mọi ngày Thứ Hai đến Thứ Bảy chưa khai (người giả đi làm đủ ngoài các ngày test nêu)
function attendedSessions(staff?, declared?, holidays?, month?) {
  const filled: Record<string, any> = {};
  for (let d = 1; d <= 31; d++) {
    const date = `${month}-${String(d).padStart(2, '0')}`;
    const at = new Date(date + 'T00:00:00Z');
    if (at.toISOString().slice(0, 10) !== date || at.getUTCDay() === 0 || holidays.includes(date) || declared[date])
      continue;
    filled[date] = workDay();
  }
  return declaredPunches(staff, { ...filled, ...declared });
}

function world(options: any = {}) {
  const {
    people = [],
    days = {},
    holidays = [],
    sessions,
    rows = {},
    extraRows = [],
    slipOverrides = [],
    kpi = {},
    otherSheets = [],
    month = MONTH,
    asOf = ASOF,
    thresholds,
    withPayroll = true,
    lateOn = false // luật late-declaration TẮT mặc định (ai.rule.lateDeclaration.enabled = false): test của luật này bật lên
  } = options;
  const approvals: any[] = [];
  for (const staff of people) {
    for (const [date, day] of Object.entries<any>(days[staff.username] || {})) {
      const found = ApprovalView.itemOf(day, { date, holidays, staffType: staff.type });
      if (!found) continue;
      approvals.push({
        username: staff.username,
        name: staff.name,
        date,
        item: found.item,
        fingerprint: found.fingerprint,
        status: 'pending',
        rev: 1,
        submittedAt: ON_TIME,
        decidedBy: null,
        decidedAt: null,
        note: null,
        ...(rows[`${staff.username}|${date}`] || {})
      });
    }
  }
  approvals.push(...extraRows);
  const sheets = people.map(staff => ({
    username: staff.username,
    month,
    days: days[staff.username] || {},
    kpiPct: null,
    kpiAmt: null,
    kpiAdmPct: null,
    kpiAdmAmt: null,
    ...(kpi[staff.username] || {})
  }));
  return {
    asOf,
    month,
    staff: people,
    sheets: [...sheets, ...otherSheets],
    approvals,
    sessions: sessions || people.flatMap(staff => attendedSessions(staff, days[staff.username] || {}, holidays, month)),
    holidays,
    slipOverrides,
    payroll: withPayroll ? payroll : undefined,
    thresholds,
    ...(lateOn ? { params: { ...DEFAULTS, 'ai.rule.lateDeclaration.enabled': true } } : {})
  };
}

// Tháng chỉ có MỘT ngày công được trả (05/10); các ngày Thứ Hai đến Thứ Bảy còn lại khai "Nghỉ sẽ làm bù" (không lương).
// Mới có 1 ngày có lương nên quy tắc 14 ngày không lương làm bảo hiểm về 0; thu nhập chỉ 323.077 ₫.
function onePaidDayMonth(month = MONTH) {
  const out: Record<string, any> = {};
  for (let d = 1; d <= 31; d++) {
    const date = `${month}-${String(d).padStart(2, '0')}`;
    const day = new Date(date + 'T00:00:00Z');
    if (day.toISOString().slice(0, 10) !== date || day.getUTCDay() === 0) continue;
    out[date] = date === `${month}-05` ? workDay() : { kind: 'willmakeup' };
  }
  return out;
}

const find = (result?, rule?, username?, date?) =>
  result.findings.filter(f => f.rule === rule && (!username || f.username === username) && (!date || f.date === date));

module.exports = {
  payroll,
  MONTH,
  ASOF,
  ON_TIME,
  person,
  vn,
  closedSession,
  openSessionFor,
  workDay,
  otDay,
  makeupHoursDay,
  onePaidDayMonth,
  world,
  find
};
