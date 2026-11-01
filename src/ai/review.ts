'use strict';
// Soát dữ liệu trước khi chốt lương.
//
// review(input) → { asOf, month, findings, checked, checklist, summary }
//
// Giới hạn mà mọi dòng trong file này tuân theo:
//   - Chạy hoàn toàn trên máy GFT, theo luật; không gọi mô hình hay API bên ngoài, không mạng, không ghi file.
//   - Chỉ GỢI Ý: hàm chỉ đọc đầu vào và trả phát hiện; không sửa lương, công, KPI hay hồ sơ (đầu vào không bị đổi).
//   - Mỗi phát hiện nêu luật nào bắn (rule), đầu vào đã dùng (evidence.inputs) và ngưỡng (evidence.threshold, đánh dấu proposal).
//   - Thuần: không I/O, không đồng hồ. "Bây giờ" truyền vào qua input.asOf; công thức lương lấy từ input.payroll (calcMonth) chứ
//     không viết lại ở đây (bộ máy dùng chung src/engine/payroll-engine.ts). Thiếu payroll thì các luật cần nó được bỏ qua và ghi vào checked.skipped.
//   - Evidence chỉ chứa trường luật cần (EVIDENCE_FIELDS); không có tên, lương, ghi chú hay số tiền nếu luật không cần số tiền.
//
// input:
//   asOf        ISO có múi giờ, ví dụ '2026-11-04T09:00:00+07:00' (bắt buộc)
//   month       'YYYY-MM' tháng đang soát (bắt buộc)
//   staff       [{ username, role, type, level, locked, shiftCode, startDate, birthday, leaveAdjust, idorm, nightPct, ... }] (listStaff)
//   insuredUnset [username] những người cột staff.insured còn NULL (SELECT username FROM staff WHERE insured IS NULL): các người này đóng bảo hiểm theo
//               insurance.coverage.<hợp đồng> của bộ máy đang tính (như payrollPeople), không theo mặc định cũ mà listStaff đã điền; mặc định rỗng
//   sheets      [{ username, month, days, kpiPct, kpiAmt, kpiAdmPct, kpiAdmAmt }] của mọi tháng cần xét (lịch sử KPI, phép)
//   approvals   [{ username, date, item, fingerprint, status, rev, submittedAt, decidedAt }] (store.approvals.list, mọi trạng thái)
//   sessions    [{ username, date, state, entry }] (store.listSessions)
//   holidays    ['YYYY-MM-DD']
//   kpiScores   [{ username, month, parts }] điểm KPI 5 thành phần, parts như GET /api/sheet trả về (kpiParts: { complete, wework, user, peer,
//               manager, self } 0..100, hoặc null / { complete: false } khi chưa đủ)
//   slipOverrides [{ username, month, values }]
//   advances    { <tên đăng nhập>: true } người được Admin duyệt tạm ứng của tháng soát: tạm ứng ⑥ = số theo quy tắc; người không có thì 0
//   payroll     bộ máy tính lương { calcMonth, computeMonth } = loadPayroll(params) của src/ai/payroll-loader.ts; thiếu thì bỏ qua các luật cần tiền / công
//   params      bộ tham số phẳng (AiParams): ai.threshold.<tên> và ai.rule.<id>.enabled (luật tắt vào checked.skipped); mặc định PayrollParams.DEFAULTS
//   thresholds  ghi đè ngưỡng theo tên lên giá trị của params (src/ai/thresholds.ts); ghi đè luôn là proposal
//   paramChanges [{ key, effectiveMonth, createdAt }] các dòng param_versions có hiệu lực ĐÚNG tháng đang soát (luật formula-changed-recently); mặc định rỗng
//   payrollBefore bộ máy tính lương của tháng liền trước = loadPayroll(resolve(tháng trước).params); có thì luật formula-changed-recently đo số người đổi thực nhận
//   itemStatuses trạng thái của khoản được soát, mặc định ['pending']
//   includeImpacts true thì kết quả có thêm `impacts`: tiền tác động của mọi khoản đang soát (cần payroll)

const ApprovalView = require('../engine/approval-view');
const ActualHours = require('../engine/actual-hours');
const KpiScore = require('../engine/kpi-score');
const PayrollParams = require('../engine/payroll-params');
const quality = require('../domain/findings/data-quality');
const { resolveThresholds, resolveLimits, describeThresholds, isRuleEnabled } = require('./thresholds');
const { benefitOf } = require('./positions');
const { createRules } = require('./rules-extra');
const { units, SEVERITY_RANK } = require('./units');

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
// Chức vụ có OT hay KPI do cờ quyền lợi của bộ tham số quyết định (type.<mã>.benefit.ot / .kpi), không theo danh sách loại ghi cứng
const hasBenefit = (ctx?, person?, flag?) => benefitOf(ctx.params, person.type, flag, person.level);
const DAY_FIELDS = ['kind', 'shift', 'in', 'out', 'extraKind', 'extraIn', 'extraOut', 'preset', 'breakMin'];
const SLIP_COMPARABLE = Object.freeze({
  attendance: (m?) => m.attendance,
  travel: (m?) => m.travel,
  kpiPay: (m?) => m.kpiPay,
  otPay: (m?) => m.otPay + m.holWorkPay + (m.makeupPay || 0), // cùng ô otPay của phiếu: giờ làm bù là tiền làm thêm giờ
  exempt: (m?) => m.net && m.net.exempt,
  insurance: (m?) => m.net && m.net.insurance,
  tax: (m?) => m.net && m.net.tax,
  advance: (m?) => m.net && m.net.advance
});
// Lượt chấm công đang chờ Admin xử lý (khớp reason của src/engine/punch.ts và actual-hours.js)
const PUNCH_WAITING = Object.freeze([
  'forgot-in',
  'forgot-out',
  'needs-review',
  'legacy-review',
  'off-shift',
  'incomplete-shift'
]);

/* ---------- ngày, giờ, chữ ---------- */
// Đơn vị và độ rộng định dạng: src/ai/units.ts (khoá unit.* của bộ tham số); ở đây chỉ còn chữ hiển thị tiền
const {
  isRealDate,
  toMin,
  spanOf,
  vnDateOf,
  vnClockOf,
  dayStartOf,
  addDays,
  dayDiff,
  nextMonthOf,
  previousMonthOf,
  monthOf,
  dm,
  hoursText,
  round2,
  digestOf,
  median,
  minPerHour,
  msPerMin
} = units;
const vndText = (amount?) =>
  Math.round(amount)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' ₫';

// Ngày khai chiếu như estimateSheet() của server.js và projectDay của src/domain/approvals/approvals.ts: chỉ giữ trường khai tay
function projectDay(entry?) {
  if (!entry || typeof entry !== 'object' || entry.kind === 'pending') return null;
  if (entry.kind !== 'work' && entry.kind !== 'makeup') return { kind: entry.kind };
  return Object.fromEntries(DAY_FIELDS.filter(key => Object.hasOwn(entry, key)).map(key => [key, entry[key]]));
}

/* ---------- chấm công theo ngày ---------- */
function groupSessions(list?) {
  const byUser = new Map<any, any>();
  for (const session of Array.isArray(list) ? list : []) {
    if (!session || typeof session.username !== 'string' || !session.entry || typeof session.entry !== 'object')
      continue;
    const date = (session.entry.plannedShift && session.entry.plannedShift.date) || session.date;
    if (!isRealDate(date)) continue;
    if (!byUser.has(session.username)) byUser.set(session.username, new Map());
    const byDate = byUser.get(session.username);
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push(session);
  }
  return byUser;
}
// Có mặt trong một ngày công: số lượt, các khoảng có mặt (phút epoch, gộp) và cờ `open` khi có lượt thiếu một đầu
function presenceOf(list?) {
  const presence: Record<string, any> = { count: 0, runs: [], open: false, firstInMin: null, lastOutMin: null };
  const runs: any[] = [];
  for (const session of list || []) {
    const entry = session.entry;
    const from = Date.parse(entry.presIn) / msPerMin;
    const to = Date.parse(entry.presOut) / msPerMin;
    const hasIn = Number.isFinite(from);
    const hasOut = Number.isFinite(to);
    if (!hasIn && !hasOut) continue;
    presence.count++;
    if (hasIn && (presence.firstInMin === null || from < presence.firstInMin)) presence.firstInMin = Math.floor(from);
    if (hasOut && (presence.lastOutMin === null || to > presence.lastOutMin)) presence.lastOutMin = Math.ceil(to);
    if (hasIn && hasOut && to > from && session.state !== 'open') runs.push([Math.floor(from), Math.ceil(to)]);
    else presence.open = true;
  }
  runs.sort((a: any, b: any) => a[0] - b[0]);
  for (const run of runs) {
    const last = presence.runs[presence.runs.length - 1];
    if (last && run[0] <= last[1]) last[1] = Math.max(last[1], run[1]);
    else presence.runs.push([run[0], run[1]]);
  }
  return presence;
}
const overlapMin = (segment?, runs?) =>
  runs.reduce((sum, run) => sum + Math.max(0, Math.min(segment.to, run[1]) - Math.max(segment.from, run[0])), 0);

// Các đoạn làm thêm đã khai (trước ca, sau ca) cần đối chiếu Check-in/out, tính theo phút epoch từ ngày công
function declaredSegments(day?, date?) {
  const inMin = toMin(day.in);
  const outMin = toMin(day.out);
  if (inMin === null || outMin === null) return [];
  const start = dayStartOf(date) + inMin;
  const end = start + spanOf(inMin, outMin);
  const label = (from?, to?) => `${vnClockOf(from)}-${vnClockOf(to)}`;
  const segments: any[] = [];
  const extraIn = toMin(day.extraIn);
  const extraOut = toMin(day.extraOut);
  if (extraIn !== null && day.extraIn !== day.in) {
    const from = start - spanOf(extraIn, inMin);
    segments.push({ from, to: start, label: label(from, start) });
  }
  if (extraOut !== null && day.extraOut !== day.out) {
    const to = end + spanOf(outMin, extraOut);
    segments.push({ from: end, to, label: label(end, to) });
  }
  return segments;
}

// OT khai trên ngày lễ (mục 'ot', dòng duyệt mang holiday hoặc dấu vân tay holiday_work|…): giờ vào – ra của ngày là khung giờ OT
const isHolidayOt = (row?) => row.item === 'ot' && (!!row.holiday || /^holiday_work\|/.test(String(row.fingerprint)));
function holidayWindow(day?, date?) {
  const inMin = toMin(day.in);
  const outMin = toMin(day.out);
  if (inMin === null || outMin === null) return [];
  const from = dayStartOf(date) + inMin;
  const to = from + spanOf(inMin, outMin);
  return [{ from, to, label: `${vnClockOf(from)}-${vnClockOf(to)}` }];
}

/* ---------- danh mục luật ---------- */
// Hai luật khối phụ cấp và số sửa phiếu ở rules-extra.js (monthPay ở dưới, gọi muộn nên bọc lại)
const EXTRA = createRules({
  monthPay: (ctx?, person?) => monthPay(ctx, person),
  slipComparable: SLIP_COMPARABLE,
  vndText
});

// fields: các trường evidence.inputs được phép (luật chỉ được đưa vào đúng những trường này)
// thresholds: tên ngưỡng trong src/ai/thresholds.ts; note: lời giải thích khi luật không có ngưỡng số
const RULES = Object.freeze([
  {
    id: 'isat-frequency',
    severity: 'medium',
    scope: 'item',
    label: 'iSAT nhiều lần trong tháng',
    fields: ['ordinal', 'count'],
    thresholds: ['isatPerMonth']
  },
  {
    id: 'approved-leave-frequency',
    severity: 'medium',
    scope: 'item',
    label: '"Nghỉ được duyệt" nhiều lần trong tháng',
    fields: ['ordinal', 'count'],
    thresholds: ['approvedLeavePerMonth']
  },
  {
    id: 'leave-with-checkin',
    severity: 'high',
    scope: 'item',
    label: 'Có Check-in ngày khai nghỉ',
    fields: ['kind', 'sessions', 'firstIn', 'lastOut'],
    thresholds: [],
    note: 'Bất kỳ lượt Check-in/out nào trong ngày khai Nghỉ phép năm, iSAT hoặc Nghỉ được duyệt'
  },
  {
    id: 'late-declaration',
    severity: 'medium',
    scope: 'item',
    label: 'Khai sau hạn',
    fields: ['submittedDate', 'deadlineDate', 'daysLate'],
    thresholds: ['reportDeadlineDay']
  },
  {
    id: 'previously-rejected',
    severity: 'medium',
    scope: 'item',
    label: 'Khoản cùng loại vừa bị từ chối',
    fields: ['rejectedDate', 'rejectedOn', 'rejectedCount'],
    thresholds: ['rejectedLookbackDays']
  },
  {
    id: 'repeated-edits',
    severity: 'low',
    scope: 'item',
    label: 'Khai báo bị đổi nhiều lần',
    fields: ['rev'],
    thresholds: ['repeatedEditsRev']
  },
  {
    id: 'ot-checkin-mismatch',
    severity: 'high',
    scope: 'item',
    label: 'Giờ khai làm thêm không khớp Check-in/out',
    fields: ['item', 'declared', 'presence', 'declaredMin', 'coveredMin', 'shortfallMin'],
    thresholds: ['presenceGapMin']
  },
  {
    id: 'ot-after-pending-makeup',
    severity: 'medium',
    scope: 'item',
    label: 'OT chờ duyệt khi còn làm bù chờ duyệt trước đó',
    fields: ['makeupDates', 'makeupCount'],
    thresholds: [],
    note: 'OT chỉ được tính khi các ngày trước không còn giờ phải bù (LUAT-DU-AN 5.3)'
  },
  {
    id: 'holiday-work-review',
    severity: 'medium',
    scope: 'item',
    label: 'OT ngày lễ',
    fields: ['hours'],
    thresholds: [],
    note: 'Mọi khoản OT ngày lễ đều "Cần xem" (tiền lớn: giờ được duyệt tính OT ngày lễ)'
  },
  {
    id: 'attendance-allowance-risk',
    severity: 'high',
    scope: 'item',
    label: 'Khoản làm đổi chuyên cần',
    fields: [
      'pivotal',
      'tipping',
      'absentDaysIfApproved',
      'overHoursIfApproved',
      'attendOkIfApproved',
      'absentDaysIfRejected',
      'overHoursIfRejected',
      'attendOkIfRejected'
    ],
    thresholds: ['attendMaxAbsentDays', 'overLimitHours'],
    note: 'So sánh duyệt với từ chối khoản này, giả định các khoản chờ duyệt khác của người đó được duyệt',
    needs: ['payroll']
  },
  {
    id: 'large-pay-impact',
    severity: 'medium',
    scope: 'item',
    label: 'Tác động tiền lớn',
    fields: ['impactVnd'],
    thresholds: ['impactVnd'],
    note: 'Chênh tổng thu nhập ước tính giữa duyệt và từ chối khoản này, giả định các khoản chờ duyệt khác được duyệt',
    needs: ['payroll']
  },
  {
    id: 'ot-above-team',
    severity: 'medium',
    scope: 'person',
    label: 'OT cao hơn nhiều so với nhóm',
    fields: ['otHours', 'teamMedianHours', 'peers'],
    thresholds: ['otMedianFactor', 'otMedianMinHours', 'otMedianMinPeers'],
    needs: ['payroll']
  },
  {
    id: 'missing-start-date',
    severity: 'medium',
    scope: 'person',
    label: 'Thiếu ngày vào làm',
    fields: ['type'],
    thresholds: [],
    note: 'CTV và NV phải có ngày vào làm hợp lệ để tính phép năm và tiền lễ (LUAT-DU-AN 7.2, 7.5)'
  },
  {
    id: 'negative-leave',
    severity: 'high',
    scope: 'person',
    label: 'Phép năm âm',
    fields: ['used', 'accrued', 'balance'],
    thresholds: [],
    note: 'Phép đã dùng lớn hơn phép còn trong sổ phép theo từng năm (LUAT-DU-AN 7.5)'
  },
  {
    id: 'missing-fixed-shift',
    severity: 'high',
    scope: 'person',
    label: 'Chưa có ca cố định',
    fields: ['type'],
    thresholds: [],
    note: 'Mã ca trong hồ sơ không có trong bảng ca nên Check-in/out không gán được ca để tính giờ công'
  },
  {
    id: 'slip-override-gap',
    severity: 'medium',
    scope: 'person',
    label: 'Số sửa trên phiếu lệch nhiều so với số tự tính',
    fields: ['fields'],
    thresholds: ['slipDiffVnd', 'slipDiffRatio'],
    needs: ['payroll']
  },
  {
    id: 'locked-with-pending',
    severity: 'medium',
    scope: 'item',
    label: 'Tài khoản đã khoá còn khoản chờ duyệt',
    fields: ['lockedSince'],
    thresholds: [],
    note: 'Tài khoản đã bị khoá nhưng khoản vẫn nằm trong hàng chờ duyệt'
  },
  {
    id: 'kpi-self-100-streak',
    severity: 'low',
    scope: 'person',
    label: 'Tự đánh giá KPI 100% nhiều tháng liên tiếp',
    fields: ['streakMonths', 'months', 'selfPct'],
    thresholds: ['kpiFullMonths', 'kpiFullPct'],
    skipWhen: () => 'KPI theo 5 thành phần: không có % tự đánh giá để soát'
  },
  {
    id: 'net-nonpositive',
    severity: 'high',
    scope: 'person',
    label: 'Thực nhận ước tính bằng hoặc dưới 0',
    fields: ['net', 'gross', 'insurance', 'tax', 'advance', 'workDays'],
    thresholds: [],
    note: 'Thực nhận = tổng thu nhập − bảo hiểm − thuế − tạm ứng ≤ 0; bộ máy không tự kẹp thực lĩnh ở 0 (thiết kế backend-v4 mục 4.14). Người chưa khai ngày nào trong tháng bị bỏ qua (chỉ còn khoản trừ cố định)',
    needs: ['payroll']
  },
  {
    id: 'formula-changed-recently',
    severity: 'low',
    scope: 'system',
    label: 'Công thức hoặc tham số đổi có hiệu lực từ tháng này',
    fields: ['changeCount', 'formulaKeys', 'paramKeys', 'peopleChanged', 'peopleTotal', 'share', 'totalDiffVnd'],
    thresholds: ['paramChangePeoplePct'],
    note: 'Có tham số đổi giá trị, hiệu lực đúng từ tháng này. Có bộ máy của tháng trước thì đo số người đổi thực nhận (chỉ gắn khi đủ nhiều); không có thì chỉ nhắc xem lại'
  },
  ...EXTRA.RULES
]);
const EVIDENCE_FIELDS = Object.freeze(Object.fromEntries(RULES.map(rule => [rule.id, rule.fields])));

/* ---------- ngữ cảnh ---------- */
function prepare(input?) {
  if (!input || typeof input !== 'object') throw new TypeError('Thiếu dữ liệu đầu vào');
  const asOfMs = typeof input.asOf === 'string' ? Date.parse(input.asOf) : NaN;
  if (!Number.isFinite(asOfMs)) throw new TypeError('asOf phải là thời điểm ISO hợp lệ');
  if (typeof input.month !== 'string' || !MONTH_RE.test(input.month)) throw new TypeError('month phải có dạng YYYY-MM');
  const params = input.params && typeof input.params === 'object' ? input.params : PayrollParams.DEFAULTS;
  const thresholds = resolveThresholds(input.thresholds, params);
  const month = input.month;
  const insuredUnset = new Set<any>(Array.isArray(input.insuredUnset) ? input.insuredUnset : []);
  const people = (Array.isArray(input.staff) ? input.staff : [])
    .filter(
      person => person && typeof person.username === 'string' && (person.payrollSubject ?? person.role !== 'admin')
    )
    // insured null: bộ máy tự lấy insurance.coverage.<hợp đồng> của chính tháng nó tính (cả bộ máy tháng trước ở payrollBefore)
    .map(person => (insuredUnset.has(person.username) ? { ...person, insured: null } : person));
  const personBy = new Map<any, any>(people.map(person => [person.username, person]));
  const holidays = (Array.isArray(input.holidays) ? input.holidays : []).filter(isRealDate);
  const sheetBy = new Map<any, any>();
  for (const sheet of Array.isArray(input.sheets) ? input.sheets : []) {
    if (!sheet || typeof sheet.username !== 'string' || !MONTH_RE.test(sheet.month)) continue;
    sheetBy.set(`${sheet.username}|${sheet.month}`, sheet);
  }
  const statuses = Array.isArray(input.itemStatuses) ? input.itemStatuses : ['pending'];
  const rows: any[] = [];
  for (const row of Array.isArray(input.approvals) ? input.approvals : []) {
    if (!row || typeof row.username !== 'string' || !isRealDate(row.date)) continue;
    if (!ApprovalView.ITEMS.includes(row.item) || !['pending', 'approved', 'rejected'].includes(row.status)) continue;
    rows.push(row);
  }
  const rowsByUser = new Map<any, any>();
  for (const row of rows) {
    if (!rowsByUser.has(row.username)) rowsByUser.set(row.username, []);
    rowsByUser.get(row.username).push(row);
  }
  const sessionsBy = groupSessions(input.sessions);
  const kpiScoreBy = new Map<any, any>();
  for (const item of Array.isArray(input.kpiScores) ? input.kpiScores : [])
    if (item && typeof item.username === 'string') kpiScoreBy.set(`${item.username}|${item.month}`, item.parts || null);
  const ctx: Record<string, any> = {
    asOf: input.asOf,
    today: vnDateOf(input.asOf),
    month,
    params,
    thresholds,
    limits: resolveLimits(params),
    people,
    personBy,
    holidays,
    payroll:
      input.payroll && typeof input.payroll.calcMonth === 'function' && typeof input.payroll.computeMonth === 'function'
        ? input.payroll
        : null,
    sheets: Array.isArray(input.sheets) ? input.sheets : [],
    slipOverrides: Array.isArray(input.slipOverrides) ? input.slipOverrides : [],
    advances: input.advances && typeof input.advances === 'object' ? input.advances : {},
    rows,
    payrollBefore:
      input.payrollBefore &&
      typeof input.payrollBefore.calcMonth === 'function' &&
      typeof input.payrollBefore.computeMonth === 'function'
        ? input.payrollBefore
        : null,
    paramChanges: (Array.isArray(input.paramChanges) ? input.paramChanges : []).filter(
      change => change && typeof change.key === 'string' && change.effectiveMonth === month
    ),
    payrollErrors: 0,
    cache: new Map()
  };
  ctx.sessionsOf = (username?) => {
    const byDate = sessionsBy.get(username);
    return byDate ? [...byDate.values()].flat() : [];
  };
  ctx.presence = (username?, date?) => {
    const byDate = sessionsBy.get(username);
    return presenceOf(byDate ? byDate.get(date) : []);
  };
  ctx.sheet = (username?, sheetMonth = month) => sheetBy.get(`${username}|${sheetMonth}`) || null;
  ctx.days = (username?) => {
    const sheet = ctx.sheet(username);
    const out: Record<string, any> = {};
    for (const [date, entry] of Object.entries<any>((sheet && sheet.days) || {})) {
      if (!isRealDate(date) || !date.startsWith(month + '-')) continue;
      const day = projectDay(entry);
      if (day) out[date] = day;
    }
    return out;
  };
  // Điểm 5 thành phần của một người trong tháng soát (null = chưa đủ hoặc chưa nhập)
  ctx.kpiParts = (username?) => kpiScoreBy.get(`${username}|${month}`) || null;
  ctx.kpi = (username?) => {
    const sheet = ctx.sheet(username);
    // KPI 5 thành phần: calcMonth bỏ qua % tự đánh giá và % Admin cũ, chỉ dùng parts và mức KPI
    return {
      method: 'five',
      parts: ctx.kpiParts(username),
      pct: sheet ? sheet.kpiPct : null,
      amt: sheet ? sheet.kpiAmt : null,
      admPct: null,
      admAmt: sheet ? sheet.kpiAdmAmt : null
    };
  };
  // Hàng duyệt của tháng đang soát (mọi trạng thái), theo người rồi theo ngày
  ctx.monthRows = (username?) =>
    Object.fromEntries(
      (rowsByUser.get(username) || []).filter(row => row.date.startsWith(month + '-')).map(row => [row.date, row])
    );
  ctx.rowsOf = (username?) => rowsByUser.get(username) || [];
  ctx.reviewRows = rows.filter(
    row => row.date.startsWith(month + '-') && statuses.includes(row.status) && personBy.has(row.username)
  );
  ctx.activePeople = people.filter(person => !person.locked);
  return ctx;
}

// Lương tháng theo đúng chuỗi của app: lịch → ApprovalView.payView → ActualHours.apply → calcMonth, chạy trong bộ máy
// dùng chung (payroll.computeMonth). rowsMap: { ngày: hàng duyệt } quyết định khoản nào được tính; upTo: chỉ tính đến ngày này
// (null = cả tháng). rawDays: tính thẳng lịch đã khai, không qua duyệt và Check-in/out (calcMonth). payroll: bộ máy khác (so tháng trước). Lỗi công thức → null.
function payResult(ctx?, person?, rowsMap?, upTo?, rawDays = false, payroll = ctx.payroll) {
  if (!payroll) return null;
  try {
    const days = ctx.days(person.username);
    const kpi = ctx.kpi(person.username);
    // Tham số thứ 7 (entries) để trống như computeMonth ở dưới; tham số thứ 8 là asOf để engine không đọc đồng hồ thật
    const advance = ctx.advances[person.username] === true;
    if (rawDays) {
      return payroll.calcMonth(person, days, kpi, ctx.holidays, ctx.month, upTo, undefined, ctx.asOf, { advance });
    }
    return payroll.computeMonth({
      ...(advance ? { advanceApproved: advance } : {}),
      staff: person,
      days,
      approvals: rowsMap,
      sessions: ctx.sessionsOf(person.username),
      kpi,
      holidays: ctx.holidays,
      month: ctx.month,
      upTo,
      asOf: ctx.asOf
    }).m;
  } catch {
    ctx.payrollErrors++;
    return null;
  }
}
// Tính một lần cho mỗi (người, kiểu) rồi giữ lại
function memo(ctx?, key?, build?) {
  if (!ctx.cache.has(key)) ctx.cache.set(key, build());
  return ctx.cache.get(key);
}
// So sánh "duyệt" với "từ chối" một khoản chờ duyệt, GIẢ ĐỊNH các khoản chờ duyệt khác của cùng người trong tháng được duyệt
// (nếu tính chúng như chưa duyệt thì mọi khoản của người có 3 iSAT chờ đều trông như quyết định được chuyên cần, đó là nhiễu).
// Trả { appr, rej, tipping, tipAfter }: tháng nếu khoản được duyệt, tháng nếu bị từ chối, và khi bị từ chối thì ngày này có phải
// ngày làm đủ ngưỡng mất chuyên cần không (tính chuyên cần đến hết ngày trước đó còn giữ, đến hết ngày này thì mất).
function counterfactual(ctx?, row?) {
  return memo(ctx, `cf|${row.username}|${row.date}`, () => {
    const person = ctx.personBy.get(row.username);
    const optimistic: Record<string, any> = {};
    for (const [date, other] of Object.entries<any>(ctx.monthRows(row.username)))
      optimistic[date] = other.status === 'pending' ? { ...other, status: 'approved' } : other;
    const rejectedRows = { ...optimistic, [row.date]: { ...row, status: 'rejected' } };
    const appr = payResult(ctx, person, { ...optimistic, [row.date]: { ...row, status: 'approved' } }, null);
    const rej = payResult(ctx, person, rejectedRows, null);
    if (!appr || !rej) return null;
    let tipAfter: any = null;
    let tipping = false;
    if (rej.attendOk === false) {
      const before = payResult(ctx, person, rejectedRows, addDays(row.date, -1));
      tipAfter = payResult(ctx, person, rejectedRows, row.date);
      tipping = !!before && !!tipAfter && before.attendOk === true && tipAfter.attendOk === false;
    }
    return { appr, rej, tipping, tipAfter };
  });
}
// Tổng giờ OT của lịch khai (coi mọi khoản là đã duyệt), OT chưa tính vẫn chiếm chỗ như máy chủ đếm
function declaredHours(ctx?, person?) {
  return memo(ctx, `hours|${person.username}`, () => {
    const m = payResult(ctx, person, {}, null, true);
    if (!m) return null;
    let otHours = 0;
    for (const row of m.rows) otHours += (row.otH || 0) + (row.otHold || 0);
    return { otHours };
  });
}

/* ---------- các luật ---------- */
function frequencyHits(ctx?, kind?, thresholdName?, label?) {
  const hits: any[] = [];
  const limit = ctx.thresholds[thresholdName].value;
  for (const row of ctx.reviewRows) {
    if (row.item !== kind) continue;
    const dates = Object.entries<any>(ctx.days(row.username))
      .filter(([, day]: any) => day.kind === kind)
      .map(([date]: any) => date)
      .sort();
    const ordinal = dates.indexOf(row.date) + 1;
    if (ordinal < limit || ordinal === 0) continue;
    hits.push({
      row,
      message: `${label} lần thứ ${ordinal} trong tháng`,
      inputs: { ordinal, count: dates.length }
    });
  }
  return hits;
}

const RUNNERS = {
  'isat-frequency': (ctx?) => frequencyHits(ctx, 'isat', 'isatPerMonth', 'iSAT'),
  'approved-leave-frequency': (ctx?) => frequencyHits(ctx, 'approved', 'approvedLeavePerMonth', 'Nghỉ được duyệt'),

  'leave-with-checkin'(ctx?) {
    const hits: any[] = [];
    for (const row of ctx.reviewRows) {
      if (!['leave', 'isat', 'approved'].includes(row.item)) continue;
      const presence = ctx.presence(row.username, row.date);
      if (!presence.count) continue;
      const firstIn = presence.firstInMin === null ? null : vnClockOf(presence.firstInMin);
      const lastOut = presence.lastOutMin === null ? null : vnClockOf(presence.lastOutMin);
      hits.push({
        row,
        message: `Có Check-in ngày này${firstIn ? ` (${firstIn}${lastOut ? ` đến ${lastOut}` : ', chưa Check-out'})` : ''}`,
        inputs: { kind: row.item, sessions: presence.count, firstIn, lastOut }
      });
    }
    return hits;
  },

  'late-declaration'(ctx?) {
    const hits: any[] = [];
    const day = ctx.thresholds.reportDeadlineDay.value;
    for (const row of ctx.reviewRows) {
      const submittedDate = vnDateOf(row.submittedAt);
      if (!submittedDate) continue;
      const deadlineDate = addDays(nextMonthOf(monthOf(row.date)) + '-01', day - 1);
      if (submittedDate <= deadlineDate) continue;
      hits.push({
        row,
        message: `Khai ngày ${dm(submittedDate)}, sau hạn mùng ${day}`,
        inputs: { submittedDate, deadlineDate, daysLate: dayDiff(submittedDate, deadlineDate) }
      });
    }
    return hits;
  },

  'previously-rejected'(ctx?) {
    const hits: any[] = [];
    const since = addDays(ctx.today, -ctx.thresholds.rejectedLookbackDays.value);
    for (const row of ctx.reviewRows) {
      const earlier = ctx
        .rowsOf(row.username)
        .filter(other => other.status === 'rejected' && other.item === row.item && other.date !== row.date)
        .map(other => ({ other, decided: vnDateOf(other.decidedAt) || other.date }))
        .filter(entry => entry.decided >= since)
        .sort((a: any, b: any) => b.decided.localeCompare(a.decided) || b.other.date.localeCompare(a.other.date));
      if (!earlier.length) continue;
      const last = earlier[0];
      hits.push({
        row,
        message: `Lần trước bị từ chối (${dm(last.other.date)})`,
        inputs: { rejectedDate: last.other.date, rejectedOn: last.decided, rejectedCount: earlier.length }
      });
    }
    return hits;
  },

  'repeated-edits'(ctx?) {
    const limit = ctx.thresholds.repeatedEditsRev.value;
    return ctx.reviewRows
      .filter(row => Number.isInteger(row.rev) && row.rev >= limit)
      .map(row => ({
        row,
        message: `Khai báo đã bị đổi ${row.rev - 1} lần (rev ${row.rev})`,
        inputs: { rev: row.rev }
      }));
  },

  'ot-checkin-mismatch'(ctx?) {
    const hits: any[] = [];
    const gap = ctx.thresholds.presenceGapMin.value;
    for (const row of ctx.reviewRows) {
      if (!['ot', 'makeup_hours'].includes(row.item)) continue;
      if (row.date >= ctx.today) continue;
      const day = ctx.days(row.username)[row.date];
      if (!day) continue;
      const segments = isHolidayOt(row) ? holidayWindow(day, row.date) : declaredSegments(day, row.date);
      if (!segments.length) continue;
      const presence = ctx.presence(row.username, row.date);
      if (presence.open) continue; // lượt còn mở hoặc thiếu một đầu: chưa biết giờ thật, để luồng Quên check-in/out xử lý
      const declaredMin = segments.reduce((sum, segment) => sum + (segment.to - segment.from), 0);
      const coveredMin = segments.reduce((sum, segment) => sum + overlapMin(segment, presence.runs), 0);
      const shortfallMin = declaredMin - coveredMin;
      const noCheckin = presence.count === 0;
      if (!noCheckin && shortfallMin < gap) continue;
      const declared = segments.map(segment => segment.label);
      const seen = presence.runs.map(run => `${vnClockOf(run[0])}-${vnClockOf(run[1])}`);
      hits.push({
        row,
        message: noCheckin
          ? `Khai làm thêm ${declared.join(', ')} nhưng không có Check-in ngày này`
          : `Khai ${declared.join(', ')}, Check-in/out chỉ phủ ${coveredMin} phút (thiếu ${shortfallMin} phút)`,
        inputs: { item: row.item, declared, presence: seen, declaredMin, coveredMin, shortfallMin }
      });
    }
    return hits;
  },

  'ot-after-pending-makeup'(ctx?) {
    const hits: any[] = [];
    const pendingMakeup = ctx.rows.filter(row => row.status === 'pending' && row.item === 'makeup_hours');
    for (const row of ctx.reviewRows) {
      if (row.item !== 'ot' || isHolidayOt(row)) continue; // OT ngày lễ không bị giữ vì giờ bù chờ duyệt
      const earlier = pendingMakeup
        .filter(
          other => other.username === row.username && other.date.startsWith(ctx.month + '-') && other.date < row.date
        )
        .map(other => other.date)
        .sort();
      if (!earlier.length) continue;
      hits.push({
        row,
        message: `Chờ duyệt làm bù ${dm(earlier[0])}${earlier.length > 1 ? ` và ${earlier.length - 1} ngày khác` : ''} trước OT này`,
        inputs: { makeupDates: earlier.slice(0, ctx.limits.evidenceListMax), makeupCount: earlier.length }
      });
    }
    return hits;
  },

  'holiday-work-review'(ctx?) {
    const hits: any[] = [];
    for (const row of ctx.reviewRows) {
      if (!isHolidayOt(row)) continue;
      const day = ctx.days(row.username)[row.date];
      const inMin = day ? toMin(day.in) : null;
      const outMin = day ? toMin(day.out) : null;
      const hours = inMin === null || outMin === null ? null : round2(spanOf(inMin, outMin) / minPerHour);
      hits.push({
        row,
        message: `${hours === null ? 'Có khai báo OT vào ngày lễ' : `Có ${hoursText(hours)} giờ OT vào ngày lễ`}. Cần kiểm tra khoản này vì giờ OT được duyệt trong ngày lễ tính OT ngày lễ (tiền lớn).`,
        inputs: { hours }
      });
    }
    return hits;
  },

  'attendance-allowance-risk'(ctx?) {
    const hits: any[] = [];
    const maxAbsent = ctx.thresholds.attendMaxAbsentDays.value;
    for (const row of ctx.reviewRows) {
      const cf = counterfactual(ctx, row);
      if (!cf || cf.rej.attendOk === null) continue;
      const pivotal = cf.appr.attendOk !== cf.rej.attendOk;
      if (!pivotal && !cf.tipping) continue;
      const parts: any[] = [];
      if (pivotal)
        parts.push(
          cf.appr.attendOk
            ? 'Duyệt khoản này thì giữ chuyên cần, từ chối thì mất'
            : 'Duyệt khoản này thì mất chuyên cần, từ chối thì giữ'
        );
      if (cf.tipping) {
        parts.push(
          cf.tipAfter.absent >= maxAbsent
            ? `Ngày nghỉ thứ ${cf.tipAfter.absent}, mất chuyên cần`
            : `Giờ vượt ngưỡng lên ${hoursText(cf.tipAfter.overHours)} giờ, mất chuyên cần`
        );
      }
      hits.push({
        row,
        message: parts.join('. '),
        inputs: {
          pivotal,
          tipping: cf.tipping,
          absentDaysIfApproved: cf.appr.absent,
          overHoursIfApproved: round2(cf.appr.overHours),
          attendOkIfApproved: cf.appr.attendOk,
          absentDaysIfRejected: cf.rej.absent,
          overHoursIfRejected: round2(cf.rej.overHours),
          attendOkIfRejected: cf.rej.attendOk
        }
      });
    }
    return hits;
  },

  'large-pay-impact'(ctx?) {
    const hits: any[] = [];
    const limit = ctx.thresholds.impactVnd.value;
    for (const row of ctx.reviewRows) {
      const cf = counterfactual(ctx, row);
      if (!cf) continue;
      const impactVnd = Math.round(cf.appr.total - cf.rej.total);
      if (Math.abs(impactVnd) < limit) continue;
      hits.push({
        row,
        message: `Nếu duyệt khoản này, tổng thu nhập sẽ ${impactVnd > 0 ? 'tăng' : 'giảm'} ${vndText(Math.abs(impactVnd))}.`,
        inputs: { impactVnd }
      });
    }
    return hits;
  },

  'ot-above-team'(ctx?) {
    const hits: any[] = [];
    const { otMedianFactor, otMedianMinHours, otMedianMinPeers } = ctx.thresholds;
    const rows: any[] = [];
    for (const person of ctx.activePeople) {
      if (!hasBenefit(ctx, person, 'ot')) continue; // chỉ chức vụ có quyền lợi OT (cờ type.<mã>.benefit.ot)
      const hasOt = Object.values<any>(ctx.days(person.username)).some(day => day.extraKind === 'ot');
      if (!hasOt) continue;
      const hours = declaredHours(ctx, person);
      if (hours && hours.otHours > 0) rows.push({ person, otHours: hours.otHours });
    }
    if (rows.length < otMedianMinPeers.value) return hits;
    const teamMedian = median(rows.map(entry => entry.otHours));
    for (const entry of rows) {
      if (entry.otHours < otMedianFactor.value * teamMedian || entry.otHours < otMedianMinHours.value) continue;
      hits.push({
        username: entry.person.username,
        message: `OT ${hoursText(entry.otHours)} giờ trong tháng, trung vị của ${rows.length} người có OT là ${hoursText(teamMedian)} giờ`,
        inputs: { otHours: round2(entry.otHours), teamMedianHours: round2(teamMedian), peers: rows.length }
      });
    }
    return hits;
  },

  'locked-with-pending'(ctx?) {
    const hits: any[] = [];
    for (const row of ctx.reviewRows) {
      const person = ctx.personBy.get(row.username);
      if (!person.locked) continue;
      hits.push({
        row,
        message: 'Tài khoản đã khoá nhưng khoản này vẫn chờ duyệt',
        inputs: { lockedSince: vnDateOf(person.lockedAt) || null }
      });
    }
    return hits;
  },

  'kpi-self-100-streak'(ctx?) {
    const hits: any[] = [];
    const needed = ctx.thresholds.kpiFullMonths.value;
    const full = ctx.thresholds.kpiFullPct.value;
    for (const person of ctx.activePeople) {
      if (!hasBenefit(ctx, person, 'kpi')) continue;
      const current = ctx.sheet(person.username);
      if (
        !current ||
        Number(current.kpiPct) !== full ||
        (current.kpiAdmPct !== null && current.kpiAdmPct !== undefined)
      )
        continue;
      const months = [ctx.month];
      for (let back = previousMonthOf(ctx.month); ; back = previousMonthOf(back)) {
        const sheet = ctx.sheet(person.username, back);
        if (!sheet || Number(sheet.kpiPct) !== full) break;
        months.unshift(back);
      }
      if (months.length < needed) continue;
      hits.push({
        username: person.username,
        message: `Tự đánh giá KPI ${full}% ${months.length} tháng liên tiếp, tháng này chưa có % Admin duyệt`,
        inputs: { streakMonths: months.length, months, selfPct: full }
      });
    }
    return hits;
  },

  'missing-fixed-shift'(ctx?) {
    const hits: any[] = [];
    for (const person of ctx.activePeople) {
      if (Object.hasOwn(ActualHours.SHIFT_TIMES, person.shiftCode)) continue;
      hits.push({
        username: person.username,
        message: 'Chưa có ca cố định: Check-in/out không gán được ca để tính giờ công',
        inputs: { type: person.type }
      });
    }
    return hits;
  },

  'slip-override-gap'(ctx?) {
    const hits: any[] = [];
    const { slipDiffVnd, slipDiffRatio } = ctx.thresholds;
    for (const override of ctx.slipOverrides) {
      if (!override || override.month !== ctx.month || !override.values) continue;
      const person = ctx.personBy.get(override.username);
      if (!person) continue;
      const computedMonth = payResult(ctx, person, ctx.monthRows(person.username), null);
      if (!computedMonth) continue;
      const fields: any[] = [];
      for (const [key, pick] of Object.entries<any>(SLIP_COMPARABLE)) {
        if (!Object.hasOwn(override.values, key)) continue;
        const computed = Math.round(pick(computedMonth) || 0);
        const value = Math.round(override.values[key]);
        const diff = value - computed;
        const ratio = computed === 0 ? Infinity : Math.abs(diff) / Math.abs(computed);
        if (Math.abs(diff) >= slipDiffVnd.value && ratio >= slipDiffRatio.value)
          fields.push({ key, computed, override: value, diff });
      }
      if (!fields.length) continue;
      hits.push({
        username: person.username,
        message: `Phiếu lương có ${fields.length} ô Admin đã sửa lệch nhiều so với số tự tính (${fields.map(f => f.key).join(', ')})`,
        inputs: { fields }
      });
    }
    return hits;
  }
};

// Thực nhận của tháng đang soát theo đúng chuỗi của app (một lần cho mỗi người), dùng cho net-nonpositive và formula-changed-recently
const monthPay = (ctx?, person?) =>
  memo(ctx, `pay|${person.username}`, () => payResult(ctx, person, ctx.monthRows(person.username), null));

Object.assign(RUNNERS, EXTRA.RUNNERS);

RUNNERS['net-nonpositive'] = (ctx?) => {
  const hits: any[] = [];
  for (const person of ctx.activePeople) {
    // Lịch trống cả tháng chỉ còn khoản trừ cố định (bảo hiểm): chưa khai gì thì chưa có số để soát, việc nhắc khai là của hạn báo công
    if (!Object.keys(ctx.days(person.username)).length) continue;
    const m = monthPay(ctx, person);
    if (!m || !m.net || !Number.isFinite(m.net.net) || m.net.net > 0) continue;
    const net = Math.round(m.net.net);
    hits.push({
      username: person.username,
      severity: net < 0 ? undefined : 'low',
      message:
        net < 0
          ? `Thực nhận ước tính âm ${vndText(-net)}: khoản trừ lớn hơn thu nhập. Kiểm tra lịch tháng, bảo hiểm, thuế và tạm ứng`
          : 'Thực nhận ước tính bằng 0: không còn gì sau các khoản trừ',
      inputs: {
        net,
        gross: Math.round(m.net.gross),
        insurance: Math.round(m.net.insurance),
        tax: Math.round(m.net.tax),
        advance: Math.round(m.net.advance),
        workDays: m.count
      }
    });
  }
  return hits;
};

// Một phát hiện cho cả tháng (không gắn người): có dòng param_versions hiệu lực đúng tháng này. Đủ dữ liệu thì đo tác động.
RUNNERS['formula-changed-recently'] = (ctx?) => {
  if (!ctx.paramChanges.length) return [];
  const formulaPrefix = 'formula.';
  const keys = [...new Set<any>(ctx.paramChanges.map(change => change.key))].sort();
  const formulaKeys = keys.filter(key => key.startsWith(formulaPrefix)).map(key => key.slice(formulaPrefix.length));
  const paramKeys = keys.filter(key => !key.startsWith(formulaPrefix));
  const listMax = ctx.limits.evidenceListMax;
  const inputs: Record<string, any> = {
    changeCount: keys.length,
    formulaKeys: formulaKeys.slice(0, listMax),
    paramKeys: paramKeys.slice(0, listMax),
    peopleChanged: null,
    peopleTotal: null,
    share: null,
    totalDiffVnd: null
  };
  const need = ctx.thresholds.paramChangePeoplePct.value;
  let severity;
  let message = `${keys.length} tham số hoặc công thức đổi có hiệu lực từ tháng này (${formulaKeys.length} công thức). Xem lại trước khi chốt`;
  if (ctx.payroll && ctx.payrollBefore) {
    let changed = 0;
    let total = 0;
    let diff = 0;
    for (const person of ctx.activePeople) {
      const now = monthPay(ctx, person);
      const before = payResult(ctx, person, ctx.monthRows(person.username), null, false, ctx.payrollBefore);
      if (!now || !before || !now.net || !before.net) continue;
      total++;
      const delta = Math.round(now.net.net) - Math.round(before.net.net);
      if (delta !== 0) changed++;
      diff += delta;
    }
    if (total) {
      inputs.peopleChanged = changed;
      inputs.peopleTotal = total;
      inputs.share = round2(changed / total);
      inputs.totalDiffVnd = diff;
      if (!changed || changed / total < need) return [];
      severity = 'medium';
      message = `Thay đổi tham số hoặc công thức từ tháng này làm đổi thực nhận của ${changed}/${total} người (${vndText(diff)} tổng). Xem lại trước khi chốt`;
    }
  }
  return [{ system: true, key: ctx.month, severity, message, inputs }];
};

// Hai luật dùng lại kết quả của src/domain/findings/data-quality.ts (một nguồn cho cảnh báo hồ sơ, không viết lại)
function qualityHits(ctx?) {
  const result = quality.evaluate({
    staff: ctx.activePeople,
    sheets: ctx.sheets,
    holidays: ctx.holidays,
    approvals: ctx.rows, // phép bị từ chối đã trả lại, không tính vào số đã dùng (khớp src/domain/sheet.ts → leaveDates)
    today: ctx.today,
    params: ctx.params
  });
  const missing: any[] = [];
  const negative: any[] = [];
  for (const issue of result.issues) {
    const person = ctx.personBy.get(issue.username);
    if (issue.code === 'missing-start-date') {
      missing.push({
        username: issue.username,
        message: 'Thiếu ngày vào làm hợp lệ, phép năm và tiền lễ không tính đúng được',
        inputs: { type: person.type }
      });
    } else if (issue.code === 'negative-leave') {
      negative.push({
        username: issue.username,
        message: `Đã dùng ${issue.used} ngày phép, số phép còn trong sổ là ${issue.accrued}: âm ${Math.abs(issue.balance)} ngày`,
        inputs: { used: issue.used, accrued: issue.accrued, balance: issue.balance }
      });
    }
  }
  return { 'missing-start-date': missing, 'negative-leave': negative };
}

/* ---------- ghép phát hiện ---------- */
function toFinding(rule?, hit?, ctx?) {
  const inputs = hit.inputs || {};
  for (const key of Object.keys(inputs))
    if (!rule.fields.includes(key)) throw new Error(`Luật ${rule.id} đưa vào evidence trường ngoài danh sách: ${key}`);
  const row = hit.row || null;
  const username = row ? row.username : hit.username;
  const finding: Record<string, any> = {
    rule: rule.id,
    severity: hit.severity || rule.severity,
    ...(hit.system ? {} : { username }),
    month: ctx.month
  };
  if (row) {
    finding.date = row.date;
    finding.item = row.item;
    finding.approval = { rev: row.rev, fingerprint: row.fingerprint };
  }
  finding.message = hit.message;
  finding.evidence = { inputs, threshold: describeThresholds(ctx.thresholds, rule.thresholds, rule.note) };
  // id ổn định để Admin bỏ qua một phát hiện; digest đổi khi đầu vào đổi, khi đó lần bỏ qua cũ hết hiệu lực
  // Phát hiện của cả hệ thống (scope 'system') không có người: id `luật:system:<khoá>` (khoá = tháng hoặc mã thuộc tính)
  finding.id = hit.system ? `${rule.id}:system:${hit.key}` : `${rule.id}:${username}:${row ? row.date : ctx.month}`;
  finding.digest = digestOf(JSON.stringify(inputs));
  return finding;
}

function checklistOf(ctx?, findings?) {
  const items: any[] = [];
  const inMonth = ctx.rows.filter(row => row.date.startsWith(ctx.month + '-') && ctx.personBy.has(row.username));
  const pending = inMonth.filter(row => row.status === 'pending');
  const flagged = new Set<any>(findings.filter(f => f.item).map(f => `${f.username}|${f.date}`));
  const byItem: Record<string, any> = {};
  for (const row of pending) byItem[row.item] = (byItem[row.item] || 0) + 1;
  items.push({
    id: 'pending-items',
    label: 'Khoản tự khai còn chờ duyệt',
    status: pending.length ? 'attention' : 'ok',
    count: pending.length,
    detail: pending.length ? 'Khoản chưa duyệt không được tính tiền khi chốt ' : 'Không còn khoản chờ duyệt',
    byItem
  });
  const flaggedPending = pending.filter(row => flagged.has(`${row.username}|${row.date}`)).length;
  items.push({
    id: 'flagged-items',
    label: 'Khoản chờ duyệt có lý do "Cần xem"',
    status: flaggedPending ? 'attention' : 'ok',
    count: flaggedPending,
    detail: 'Xem từng khoản và duyệt hoặc từ chối trước khi chốt'
  });
  let waiting = 0;
  for (const person of ctx.people) {
    for (const session of ctx.sessionsOf(person.username)) {
      const inMonthSession = typeof session.date === 'string' && session.date.startsWith(ctx.month + '-');
      if (inMonthSession && session.entry.kind === 'pending' && PUNCH_WAITING.includes(session.entry.reason)) waiting++;
    }
  }
  items.push({
    id: 'punch-waiting',
    label: 'Lượt Check-in/out chờ Admin xử lý (quên check-in/out, chờ đối soát, lệch ca)',
    status: waiting ? 'attention' : 'ok',
    count: waiting,
    detail: 'Xử lý ở màn Chấm công trước khi chốt'
  });
  const profileCount = (rule?) => findings.filter(f => f.rule === rule).length;
  items.push({
    id: 'profile-gaps',
    label: 'Hồ sơ cần bổ sung (ngày vào làm, ca cố định, phép âm)',
    status: ['missing-start-date', 'missing-fixed-shift', 'negative-leave'].some(profileCount) ? 'attention' : 'ok',
    count: profileCount('missing-start-date') + profileCount('missing-fixed-shift') + profileCount('negative-leave'),
    detail: 'Cập nhật theo hồ sơ nhân sự; app không tự sửa'
  });
  const kpiPeople = ctx.activePeople.filter(person => hasBenefit(ctx, person, 'kpi'));
  const kpiOpen = kpiPeople.filter(
    person => !KpiScore.evaluate(ctx.kpiParts(person.username), { pass: 0 }).complete
  ).length;
  items.push({
    id: 'kpi-unapproved',
    label: 'CTV/NV chưa đủ 5 điểm KPI trong tháng',
    status: kpiOpen ? 'attention' : 'ok',
    count: kpiOpen,
    detail: 'Chưa đủ 5 điểm thì chưa có tiền KPI'
  });
  const slipCount = ctx.slipOverrides.filter(o => o && o.month === ctx.month && ctx.personBy.has(o.username)).length;
  items.push({
    id: 'slip-overrides',
    label: 'Phiếu lương có số Admin đã sửa',
    status: 'info',
    count: slipCount,
    detail: 'Phiếu sửa số không có nghĩa là đã chốt lương'
  });
  const monthHolidays = ctx.holidays.filter(date => date.startsWith(ctx.month + '-')).sort();
  items.push({
    id: 'holidays',
    label: 'Ngày lễ đã đặt cho tháng',
    status: 'info',
    count: monthHolidays.length,
    detail: monthHolidays.length
      ? `Đã đặt: ${monthHolidays.map(dm).join(', ')}. Đối chiếu với lịch nghỉ lễ của năm`
      : 'Chưa đặt ngày lễ nào. Nếu tháng này có ngày lễ thì đặt trước khi chốt'
  });
  return items;
}

function review(input?) {
  const ctx = prepare(input);
  const findings: any[] = [];
  const skipped: any[] = [];
  const ran: any[] = [];
  const qualityResult = qualityHits(ctx);
  const systemFindings: any[] = [];
  const seen = new Set<any>();
  for (const rule of RULES) {
    const needs = rule.needs || [];
    if (!isRuleEnabled(ctx.params, rule.id)) {
      skipped.push({ rule: rule.id, reason: 'Admin tắt' });
      continue;
    }
    const skipReason = typeof rule.skipWhen === 'function' ? rule.skipWhen(ctx) : null;
    if (skipReason) {
      skipped.push({ rule: rule.id, reason: skipReason });
      continue;
    }
    if (needs.includes('payroll') && !ctx.payroll) {
      skipped.push({ rule: rule.id, reason: 'Chưa nạp được bộ máy tính lương nên luật cần số tiền không chạy' });
      continue;
    }
    ran.push(rule.id);
    const hits = Object.hasOwn(RUNNERS, rule.id) ? RUNNERS[rule.id](ctx) : qualityResult[rule.id] || [];
    for (const hit of hits) {
      const finding = toFinding(rule, hit, ctx);
      if (seen.has(finding.id)) continue;
      seen.add(finding.id);
      (rule.scope === 'system' ? systemFindings : findings).push(finding);
    }
  }
  systemFindings.sort(
    (a: any, b: any) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.id.localeCompare(b.id)
  );
  findings.sort(
    (a: any, b: any) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      a.username.localeCompare(b.username) ||
      (a.date || '').localeCompare(b.date || '') ||
      a.rule.localeCompare(b.rule)
  );
  let days = 0;
  for (const person of ctx.people) days += Object.keys(ctx.days(person.username)).length;
  const bySeverity = { high: 0, medium: 0, low: 0 };
  const byRule: Record<string, any> = {};
  for (const finding of findings) {
    bySeverity[finding.severity]++;
    byRule[finding.rule] = (byRule[finding.rule] || 0) + 1;
  }
  // Tuỳ chọn includeImpacts: tiền tác động của MỌI khoản đang soát (cột "Tác động" và thứ tự "Cần xem" của màn Duyệt).
  // Là số tiền nên chỉ trả khi người gọi yêu cầu; cùng giả định với large-pay-impact (các khoản chờ duyệt khác được duyệt).
  const impacts: any[] = [];
  if (input.includeImpacts && ctx.payroll) {
    for (const row of ctx.reviewRows) {
      const cf = counterfactual(ctx, row);
      if (cf)
        impacts.push({
          username: row.username,
          date: row.date,
          item: row.item,
          impactVnd: Math.round(cf.appr.total - cf.rej.total)
        });
    }
  }
  return {
    ...(input.includeImpacts ? { impacts } : {}),
    asOf: ctx.asOf,
    month: ctx.month,
    findings,
    systemFindings,
    checked: {
      rules: ran.length,
      ruleIds: ran,
      staff: ctx.people.length,
      days,
      skipped,
      payrollErrors: ctx.payrollErrors
    },
    checklist: checklistOf(ctx, findings),
    summary: { total: findings.length, bySeverity, byRule }
  };
}

export = { review, RULES, EVIDENCE_FIELDS, SLIP_COMPARABLE };
