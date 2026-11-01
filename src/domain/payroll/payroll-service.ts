'use strict';
// Dịch vụ tính lương phía máy chủ: nạp đầu vào của một tháng MỘT lượt (chỉ đọc), rồi chạy bộ máy dùng chung
// (src/engine/payroll-engine.ts) với bộ tham số của tháng. Không ghi gì vào DB: việc ghi (lần chạy, phiếu, kỳ) là của src/domain/period/periods.ts.
//   loadInputs(month, { usernames?, lookbackMonths?, asOf?, params? })  đầu vào của mọi nhân sự được trả lương (hoặc chỉ các `usernames`)
//   computeFor(month, staff, inputs, params)                  một người: { m, payDays, pendingItems, actualReport, trace }
// Đầu vào của một người đúng như test/helpers/period-flow.ts → legacyInput: lịch qua estimateDays, hàng duyệt, phiên Check-in/out
// (chỉ khi đã bật giờ thực tế), KPI theo cách tính của tháng, công tắc và ngày lễ.
const crypto = require('node:crypto');
const { AsyncList } = require('../../shared/async-list');
const store = require('../../platform/db');
const Params = require('../../engine/payroll-params');
const Engine = require('../../engine/payroll-engine');
const KpiScore = require('../../engine/kpi-score');
const PayrollCalendar = require('../../engine/payroll-calendar');
const paramsStore = require('../../params/store');
const PayTailCalc = require('../../engine/pay-tail-calc'); // kiểm phương án bảo hiểm và thuế chưa dùng được
const payEntries = require('./pay-entries');
const LeaveRules = require('../../engine/leave'); // phép năm: số ngày phép dư hết hạn quy tiền vào phiếu
const { benefitOf } = require('../../platform/request-rules');
const { leaveDates } = require('../leave-days'); // ngày nghỉ phép năm thực sự trừ phép
const { advanceApprovals } = require('../advance'); // tạm ứng ⑥ = số theo quy tắc, chỉ khi Admin đã duyệt tạm ứng của tháng
const explanations = require('../explanation/explanations'); // giải trình chưa được Admin duyệt: ngày đó không tính lương
const { PayrollPolicy } = require('./policy'); // hợp đồng tính thuế theo thâm niên
const { AdminPresence } = require('../attendance/admin-presence'); // ngày có lượt Admin khai thay không bị giữ vì giải trình

// Lịch ước tính chỉ chứa các trường người dùng được khai tay (dữ liệu Check-in/out nằm trong lịch cũ không được mang vào phép tính).
const ESTIMATE_FIELDS = ['kind', 'shift', 'in', 'out', 'extraKind', 'extraIn', 'extraOut', 'preset', 'breakMin'];
function estimateDays(days?) {
  const out: Record<string, any> = {};
  for (const [date, entry] of Object.entries<any>(days || {})) {
    if (!entry || entry.kind === 'pending') continue;
    // Loại 'makeup' cũ giữ giờ đã khai: để hiện lại và để PUT /sheet nhận ra ngày gửi lại không đổi
    out[date] =
      entry.kind === 'work' || entry.kind === 'makeup'
        ? Object.fromEntries(ESTIMATE_FIELDS.filter(key => Object.hasOwn(entry, key)).map(key => [key, entry[key]]))
        : { kind: entry.kind };
    // Hai trường chữ không vào phép tính lương nhưng phải theo lịch ra màn hình: giải trình Check-in/out và ngày làm bù
    if (typeof entry.punchNote === 'string' && entry.punchNote) out[date].punchNote = entry.punchNote;
    if (entry.kind === 'willmakeup') {
      if (Array.isArray(entry.makeupPlans)) out[date].makeupPlans = entry.makeupPlans;
      else if (typeof entry.makeupDate === 'string' && entry.makeupDate) out[date].makeupDate = entry.makeupDate;
    }
    // Bản ghi cũ có giờ ra làm thêm mà thiếu extraKind là làm bù (đúng như calcDay và approval-view đọc)
    if (!out[date].extraKind && out[date].extraOut) out[date].extraKind = 'makeup';
  }
  return out;
}

// điểm lưu là số nguyên điểm × KPI_UNITS (cùng KpiScore); quy tắc KPI dựng từ bộ tham số của tháng (KpiScore.create)
const kpiScoresOut = (row?, rules?) => {
  const units = rules.toUnits(1);
  return Object.fromEntries(
    rules.COMPONENTS.map(c => [c.key, row && row.scores[c.key] != null ? row.scores[c.key] / units : null])
  );
};

// Ô điểm KPI trên phiếu → thành phần KPI: Base Wework, Người dùng, QLTT (quản lý trực tiếp), Peer, Tự đánh giá
const SLIP_KPI_CELLS = Object.freeze({
  kpiBase: 'wework',
  kpiUser: 'user',
  kpiQltt: 'manager',
  kpiPeer: 'peer',
  kpiSelf: 'self'
});
// Điểm KPI đã nhập (0 … 100) điền sẵn vào 5 ô điểm của phiếu; ô chưa nhập là null. Không có dòng điểm nào thì null. Chỉ để hiển thị: tiền KPI vẫn do bộ máy tính từ cùng các điểm này; số Admin sửa trên phiếu vẫn thắng ở giao diện.
async function kpiSlipCells(username?, month?, params?) {
  try {
    const rules = KpiScore.create(params || (await paramsStore.resolve(month)).params);
    const row = await store.getKpiScores(username, month);
    if (!row) return null;
    const parts = kpiScoresOut(row, rules);
    return Object.fromEntries(Object.entries<any>(SLIP_KPI_CELLS).map(([cell, key]: any) => [cell, parts[key]]));
  } catch {
    return null; // bộ tham số của lần tính hỏng: phiếu vẫn trả được, chỉ thiếu ô điền sẵn
  }
}

// KPI của một người trong tháng: 5 thành phần (src/ai/review.ts → ctx.kpi)
async function kpiOf(username?, month?, sheet?, rules?) {
  return {
    method: 'five',
    parts: kpiScoresOut(await store.getKpiScores(username, month), rules),
    pct: sheet.kpiPct,
    amt: sheet.kpiAmt,
    admPct: null,
    admAmt: sheet.kpiAdmAmt
  };
}

const pad = (n?) => String(n).padStart(2, '0');
const lastDayOf = (month?) => {
  const [y, m] = month.split('-').map(Number);
  return `${month}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`;
};
const previousMonth = (month?) => {
  const [y, m] = month.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`;
};
// Nhân sự được trả lương trong tháng: payrollSubject, đã bắt đầu làm trước hết tháng; tài khoản đã khoá chỉ khi có dữ liệu trong tháng
// params: bộ tham số dùng để quyết "đóng bảo hiểm" của người cột NULL (mặc định: bộ hiệu lực của tháng); xem trước một thay đổi truyền bộ nháp để thấy đúng người bị ảnh hưởng
async function payrollPeople(month?, usernames?, params?) {
  const end = lastDayOf(month);
  // Người chưa ghi riêng "đóng bảo hiểm" (cột NULL) đóng theo lựa chọn của Kế toán cho hợp đồng của họ ở tháng này (insurance.coverage.<hợp đồng>);
  // src/platform/db.ts → rowToStaff chỉ biết mặc định cố định (dài đóng, ngắn không), trùng mặc định của lựa chọn; người đã ghi riêng giữ nguyên.
  const unsetInsured = new Set<any>(await store.repos.staff.usernamesWithUnsetInsured());
  const coverage = params || (await paramsStore.resolve(month)).params;
  // Khi tax.contract.basis = 'tenure': hợp đồng tính thuế, bảo hiểm theo thâm niên tới hết tháng lương
  // (đủ tax.longTermMonths tháng → 'long', chưa đủ → 'short'); không thì giữ hợp đồng trong hồ sơ (src/domain/payroll/policy.ts)
  const withContract = (s?) => {
    const contract = PayrollPolicy.contractFor(coverage, s.startDate, month, s.contract);
    return contract === s.contract ? s : { ...s, contract }; // bảo hiểm chưa ghi riêng đi theo hợp đồng này ở bước dưới
  };
  const staff = (await store.listStaff())
    .map(withContract)
    .map(s =>
      unsetInsured.has(s.username) ? { ...s, insured: coverage[`insurance.coverage.${s.contract}`] === true } : s
    )
    .filter(s => s.payrollSubject)
    .filter(s => !usernames || usernames.includes(s.username))
    .filter(s => !PayrollCalendar.isValidDate(s.startDate) || s.startDate <= end)
    .filter(s => !PayrollCalendar.isValidDate(s.resignedOn) || s.resignedOn >= `${month}-01`); // nghỉ việc trước tháng này: không vào bảng lương
  return AsyncList.filter(staff, async s => {
    if (!s.locked) return true;
    return (
      Object.keys((await store.getSheet(s.username, month)).days).length > 0 ||
      (await store.listSessions({ username: s.username, month })).length > 0
    );
  });
}

// Số ngày phép dư hết hạn quy tiền vào phiếu tháng `month` của từng người có tài khoản phép: Map tên đăng nhập → ngày (> 0).
// Chỉ tháng liền sau tháng hết hạn (mặc định tháng 2) mới có; các tháng khác trả Map rỗng mà không đọc lịch nghỉ của ai.
async function leaveSettlements(month?, staffList?, params?) {
  const out = new Map<any, any>();
  const rules = LeaveRules.create(params);
  for (const staff of staffList) {
    if (!benefitOf(params, staff.type, 'leaveAccount', staff.level) || !PayrollCalendar.isValidDate(staff.startDate))
      continue;
    const days = rules.settlementFor(staff, await leaveDates(staff), month);
    if (days > 0) out.set(staff.username, days);
  }
  return out;
}

// params: bộ tham số dựng quy tắc KPI; mặc định là bộ hiệu lực của tháng (kiểm lại bản chụp truyền bộ đã chụp của lần chạy)
async function loadInputs(month?, { usernames, lookbackMonths = 0, asOf, params }: any = {}) {
  if (!PayrollCalendar.isValidMonth(month))
    throw Object.assign(new Error('Tháng phải có dạng YYYY-MM'), { code: 'BAD_MONTH', httpStatus: 400 });
  const holidays = await store.getSetting('holidays', []);
  const when = asOf || new Date(Date.now()).toISOString();
  const kpiRules = KpiScore.create(params || (await paramsStore.resolve(month)).params);
  const entriesOf = await payEntries.approvedByUser(month); // khoản điền thêm ĐÃ DUYỆT của tháng, một lượt đọc
  const heldOf = await explanations.heldByUser(month); // ngày có giải trình chưa duyệt hoặc bị từ chối, theo người: [{ date, status }]
  // Giải trình bị từ chối giữ ngày dù ngày đó có lượt Admin khai thay; giải trình chưa quyết định (chờ trả lời, đã trả lời) chỉ giữ ngày
  // chưa có lượt Admin (src/domain/attendance/admin-presence.ts): giờ Admin khai thắng
  const heldFor = async (username?) => {
    const declared = AdminPresence.declaredDates(await store.listSessions({ username, month }));
    const held = heldOf.get(username).filter(h => h.status === 'rejected' || !declared.has(h.date));
    const dates = held.map(h => h.date);
    const rejected = held.filter(h => h.status === 'rejected').map(h => h.date); // phần bị từ chối của các ngày giữ lại: nhãn Bị từ chối trên phiếu
    return dates.length
      ? { explanationHold: dates, ...(rejected.length ? { explanationRejected: rejected } : {}) }
      : {};
  };
  const advanceOf = await advanceApprovals.approvedSet(month); // người được Admin duyệt tạm ứng của tháng: chưa duyệt thì tạm ứng ⑥ = 0
  const people = new Map<any, any>();
  const loadParams = params || (await paramsStore.resolve(month)).params;
  // chỉ khi tháng này là tháng liền sau tháng hết hạn phép (leave.expiry.month, 0 = không hết hạn) mới đọc lịch nghỉ của mọi người
  const expiryMonth = loadParams['leave.expiry.month'];
  const settlesThisMonth = expiryMonth >= 1 && Number(month.slice(5)) === (expiryMonth % 12) + 1;
  const staffList = await payrollPeople(month, usernames, params);
  const settleOf = settlesThisMonth ? await leaveSettlements(month, staffList, loadParams) : new Map();
  for (const staff of staffList) {
    const sheet = await store.getSheet(staff.username, month);
    const history: Record<string, any> = {};
    let cursor = month;
    for (let i = 0; i < lookbackMonths; i++) {
      cursor = previousMonth(cursor);
      history[cursor] = await store.getSheet(staff.username, cursor);
    }
    people.set(
      staff.username,
      JSON.parse(
        JSON.stringify({
          staff,
          days: estimateDays(sheet.days),
          approvals: await store.approvals.forSheet(staff.username, month),
          // chỉ lấy lượt chấm công của đúng tháng tính, để băm đầu vào không đổi khi tháng khác có lượt mới
          sessions: (await store.listSessions({ username: staff.username, month })).map(s => ({
            id: s.id,
            state: s.state,
            date: s.date,
            entry: s.entry
          })),
          kpi: await kpiOf(staff.username, month, sheet, kpiRules),
          // chỉ người có khoản mới có trường entries: người không có thì đầu vào và inputs_digest không đổi
          ...(entriesOf.has(staff.username) ? { entries: entriesOf.get(staff.username) } : {}),
          // chỉ người được duyệt tạm ứng mới có trường advance: người khác có đầu vào và inputs_digest không đổi; duyệt / huỷ duyệt làm lần tính lỗi thời
          ...(advanceOf.has(staff.username) ? { advance: true } : {}),
          // chỉ người có ngày giải trình chưa được duyệt mới có trường explanationHold (và explanationRejected khi có ngày bị từ chối): người không có thì đầu vào và băm không đổi
          ...(heldOf.has(staff.username) ? await heldFor(staff.username) : {}),
          // chỉ người có phép dư hết hạn quy tiền trong tháng này mới có trường leaveSettleDays
          ...(settleOf.has(staff.username) ? { leaveSettleDays: settleOf.get(staff.username) } : {}),
          ...(lookbackMonths ? { history } : {})
        })
      )
    );
  }
  // Số Admin đã sửa trên phiếu (chỉ người có số sửa): đi vào băm đầu vào để kỳ đã tính biết "số sửa đổi sau khi tính" là lỗi thời
  const overrides: Record<string, any> = {};
  for (const username of people.keys()) {
    const { values } = await store.getSlipOverride(username, month);
    if (Object.keys(values).length) overrides[username] = values;
  }
  return { month, holidays, asOf: when, people, overrides };
}

// Ngày lễ và thời điểm tính: đúng cái cần để tính lại một lần chạy (đi vào payroll_runs.switches_json)
const contextOf = (inputs?) => ({ holidays: inputs.holidays, asOf: inputs.asOf });

const engines = new WeakMap<any, any>();
const engineFor = (params?) => {
  if (!engines.has(params)) engines.set(params, Engine.create(params));
  return engines.get(params);
};
// Một người. `person` là phần tử của inputs.people; `staff` có thể là điều khoản đã chụp (staff_terms_json) khi kiểm lại.
// upTo null = cả tháng (chốt lương); undefined = tới hôm nay (ước tính của nhân sự xem giữa tháng).
function computeFor(month?, staff?, inputs?, params?, options: any = {}) {
  PayTailCalc.assertAvailable(params); // phương án chưa dùng được lọt qua đường không kiểm bị từ chối rõ ràng, không rơi âm thầm về cách tính khác
  const upTo = Object.hasOwn(options, 'upTo') ? options.upTo : null; // truyền upTo: undefined để tính tới hôm nay
  const person = inputs.people.get(staff.username);
  if (!person) throw Object.assign(new Error('Không có đầu vào của người này'), { code: 'NO_INPUT' });
  const input = JSON.parse(
    JSON.stringify({
      staff,
      days: person.days,
      approvals: person.approvals,
      sessions: person.sessions,
      kpi: person.kpi,
      ...(person.entries ? { entries: person.entries } : {}),
      ...(person.advance ? { advanceApproved: true } : {}),
      ...(person.leaveSettleDays ? { leaveSettleDays: person.leaveSettleDays } : {}),
      ...(person.explanationHold ? { explanationHold: person.explanationHold } : {}),
      ...(person.explanationRejected ? { explanationRejected: person.explanationRejected } : {}),
      holidays: inputs.holidays,
      month,
      upTo,
      asOf: inputs.asOf
    })
  );
  if (upTo === undefined) delete input.upTo;
  return engineFor(params).computeMonth(input);
}

// Băm chuẩn hoá của MỌI đầu vào (vào payroll_runs.inputs_digest): đổi dữ liệu thì băm đổi
const digestOf = (inputs?) =>
  crypto
    .createHash('sha256')
    .update(
      Params.canonical({
        month: inputs.month,
        context: contextOf(inputs),
        people: Object.fromEntries(inputs.people),
        // không có số sửa thì băm không đổi (lần chạy đã có không bị đánh dấu lỗi thời)
        ...(inputs.overrides && Object.keys(inputs.overrides).length ? { overrides: inputs.overrides } : {})
      })
    )
    .digest('hex');

const paramsFor = async (month?) => await paramsStore.resolve(month);

// Tám thành phần của khung lương tách từ kết quả một tháng, để xem trước hiện chuỗi lan truyền. Chỉ để hiển thị: tổng gốc của bộ máy giữ
// chuỗi cộng hiện có. ⑤ đang nằm TRONG tienNgayCong (daily − cut) nên ① cộng lại phần trừ; ⑤ đến ⑧ là số tiền bị trừ (dương).
const COMPONENTS = Object.freeze([
  { id: 1, key: 'wage', label: 'Lương cơ bản' },
  { id: 2, key: 'overtime', label: 'Tiền làm thêm' },
  { id: 3, key: 'allowance', label: 'Phụ cấp' },
  { id: 4, key: 'kpi', label: 'Lương KPI' },
  { id: 5, key: 'cut', label: 'Trừ đi trễ, về sớm' },
  { id: 6, key: 'advance', label: 'Tạm ứng' },
  { id: 7, key: 'insurance', label: 'Bảo hiểm' },
  { id: 8, key: 'tax', label: 'Thuế TNCN' }
]);
function thanhPhanOf(m?) {
  const t = m.trace;
  const cut = m.cut || 0;
  return {
    wage: t.tienNgayCong + cut + (t.quyetToanPhepDu || 0), // gồm quyết toán phép dư hết hạn
    overtime: t.lamBu + t.tienOt + t.tienLamLe,
    // khối phụ cấp do C&B thêm cũng là phụ cấp (③) dù nằm ngoài cây tongThuNhap
    allowance:
      t.phuCapCa +
      t.gioNghiDem +
      t.phuCapDiLai +
      t.phuCapChuyenCan +
      (m.blocks || []).reduce((sum, b) => sum + b.amount, 0),
    kpi: t.luongKpi,
    cut,
    advance: m.net.advance,
    insurance: m.net.insurance,
    tax: m.net.tax
  };
}

export = {
  loadInputs,
  computeFor,
  estimateDays,
  contextOf,
  digestOf,
  paramsFor,
  COMPONENTS,
  thanhPhanOf,
  engineFor,
  lastDayOf,
  previousMonth,
  payrollPeople,
  kpiSlipCells
};
