'use strict';
// Đồ dùng chung cho test lịch làm việc. Chỉ người bịa (qa_s_nv, qa_s_tts); không đụng DB thật.
//
// Hợp đồng ĐƯỢC GIẢ ĐỊNH:
//   - Lịch của người suy từ loại nhân sự (type.<mã>.dows của bộ tham số); đổi lịch cả loại bằng `over` của run().
//   - Kết quả tháng m.workdaysStd chỉ có khi ngày công chuẩn của loại là 'computed'.
const PunchRules = require('../../src/engine/punch');
const ApprovalView = require('../../src/engine/approval-view');
const Engine = require('../../src/engine/payroll-engine');
const { declaredPunches } = require('./declared-punches');
const { DEFAULTS } = require('./defaults-old-basis.js');

const pad = (n?) => String(n).padStart(2, '0');
const clone = (value?) => JSON.parse(JSON.stringify(value));
const dowOf = (date?) => new Date(date + 'T00:00:00Z').getUTCDay();
const daysInMonth = (month?) =>
  new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
// Các ngày của tháng rơi vào các thứ cho trước (0 = Chủ nhật)
const datesOn = (month?, dows?) =>
  Array.from({ length: daysInMonth(month) }, (_, i) => `${month}-${pad(i + 1)}`).filter(d => dows.includes(dowOf(d)));
const T = (date?, time?) => new Date(`${date}T${time}:00+07:00`).toISOString();

const MON_SAT = [1, 2, 3, 4, 5, 6];
const MON_FRI = [1, 2, 3, 4, 5];
const MWF = [1, 3, 5];
const WORK = Object.freeze({ kind: 'work', in: '08:00', out: '17:00' });

// Tham số `over` cho run(): loại NV chỉ làm các thứ `dows` (mặc định Hai, Tư, Sáu); thêm khoá khác qua `more`
const nvDows = (dows = MWF, more: any = {}) => ({ 'type.nv.dows': [...dows], ...more });

const NV = Object.freeze({
  username: 'qa_s_nv',
  type: 'nv',
  level: 1,
  nightPct: 40,
  shiftCode: 'n1',
  startDate: '2025-01-05'
});
const TTS = Object.freeze({ username: 'qa_s_tts', type: 'tts', level: 3, shiftCode: 'n1', startDate: '2025-01-05' });
const nvStaff = (over: any = {}) => ({ ...clone(NV), ...over });
const ttsStaff = (over: any = {}) => ({ ...clone(TTS), ...over });

// Đủ công: mọi ngày của các thứ cho trước đi làm 08:00-17:00 (ca n1)
const fullDays = (month?, dows?, over: any = {}) =>
  Object.fromEntries(datesOn(month, dows).map(d => [d, { ...WORK, ...over }]));
const without = (days, ...dates) => {
  const out = { ...days };
  for (const d of dates) delete out[d];
  return out;
};
const withDays = (days?, patch?) => ({ ...days, ...patch });

// Một hàng duyệt đã duyệt cho ngày khai (như máy chủ lưu), lấy mục và dấu vân tay từ ApprovalView
function approved(days?, holidays?, type?, dates?) {
  const rows: Record<string, any> = {};
  for (const date of dates) {
    const found = ApprovalView.itemOf(days[date], { date, holidays, staffType: type });
    if (!found) throw new Error(`ngày ${date} không phải khoản cần duyệt`);
    rows[date] = { item: found.item, fingerprint: found.fingerprint, rev: 1, status: 'approved' };
  }
  return rows;
}

// Lượt Check-in/out đã đóng đúng ca n1 (08:00-17:00 giờ Việt Nam) cho các ngày; `sched` là mảng thứ của người (để planShift gán loại lượt)
function punches(staff?, dates?, { sched, from = 0, to = 0 }: any = {}) {
  const plans = { shiftCode: staff.shiftCode, sched: sched || MON_SAT };
  let id = 0;
  return dates.map(date => {
    const plan = PunchRules.planShift(plans, date);
    const start = new Date(Date.parse(plan.startIso) + from * 60000).toISOString();
    const end = new Date(Date.parse(plan.endIso) + to * 60000).toISOString();
    const built = PunchRules.buildDay(plans, start, end, 'punch', { plannedShift: plan, approveIncomplete: true });
    return { id: ++id, username: staff.username, date: plan.date, state: 'closed', entry: built.entry };
  });
}

// Chạy chuỗi lương đầy đủ của một tháng với DEFAULTS cộng `over` (chỉ trong bộ nhớ)
function run(staff?, days?, o: any = {}) {
  const {
    month = '2026-10',
    holidays = [],
    approvals = {},
    sessions = declaredPunches(staff, days),
    asOf = '2026-11-04T09:00:00+07:00',
    over = {},
    kpi = null
  } = o;
  const params = { ...DEFAULTS, ...over };
  const result = Engine.create(params).computeMonth({
    staff: clone(staff),
    days: clone(days),
    approvals: clone(approvals),
    sessions: clone(sessions),
    kpi,
    holidays,
    month,
    upTo: null,
    asOf
  });
  return { ...result, params };
}
// Các số hay kiểm của một lần chạy
const money = (r?) => ({ gross: r.m.net.gross, net: r.m.net.net });
const state = (r?, date?) => r.actualReport && r.actualReport.report[date] && r.actualReport.report[date].state;

module.exports = {
  Engine,
  DEFAULTS,
  pad,
  clone,
  dowOf,
  daysInMonth,
  datesOn,
  T,
  MON_SAT,
  MON_FRI,
  MWF,
  WORK,
  nvDows,
  nvStaff,
  ttsStaff,
  fullDays,
  without,
  withDays,
  approved,
  punches,
  run,
  money,
  state
};
