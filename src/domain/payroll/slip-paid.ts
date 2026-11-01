'use strict';
// Số chi trả của phiếu (số Admin đã sửa là số chi trả).
// Chỉ đọc, không ghi DB. Dùng ở src/domain/period/periods.ts (phiếu, danh sách, ước tính) và src/domain/payroll/slip-pins.ts.
const store = require('../../platform/db');
const Engine = require('../../engine/payroll-engine');
const ActualHours = require('../../engine/actual-hours');
const DayParts = require('../../engine/payroll-day-parts');

const numOr0 = (value?) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

/* ========================= số chi trả (số Admin đã sửa) ========================= */
// "Số đã sửa" là số chi trả: với phiếu có số Admin sửa, mọi nơi của máy chủ trả số chi trả = số tự tính của bản chụp
// đã áp các ô sửa, tính lại tổng lương, thuế TNCN và thực lĩnh. Bản chụp không đổi; số chi trả tính lúc đọc, không ghi vào bảng phiếu.
// Cùng phép tính với src/engine/admin/view-phieu.js → effective(); các ô tiền khớp SLIP_MONEY của server.js.
// Các ô tiền cộng vào TỔNG LƯƠNG (lateCut trừ đi)
const SLIP_INCOME_KEYS = Object.freeze([
  'workBase',
  'leavePay',
  'settlePay',
  'isatPay',
  'holidayPay',
  'otPay',
  'attendance',
  'travel',
  'flexPay',
  'breakPay',
  'nightPay',
  'kpiPay'
]);
// Các ô tiền còn lại làm đổi số chi trả: trừ đi trễ về sớm, miễn thuế, bảo hiểm, thuế, tạm ứng
const SLIP_DEDUCT_KEYS = Object.freeze(['lateCut', 'exempt', 'insurance', 'tax', 'advance']);
const RUN_FINAL = 'final'; // lần chạy đã chốt khi duyệt kỳ: số sửa đã đóng băng vào phiếu (src/platform/db.ts → freezeOverrides)
// Số tự tính của từng ô Admin sửa được, đọc từ bản chụp (cùng cách gom số như view-phieu.js → figures); null khi bản chụp thiếu hay hỏng
function slipBasisOf(snapshot?) {
  const m = snapshot;
  const n = m && m.net;
  if (!n || !Array.isArray(m.rows) || !Number.isFinite(m.total)) return null;
  // Các dòng tiền nguyên đồng do bộ máy ghi vào bản chụp (m.lines: mỗi dòng làm tròn một lần); bản chụp cũ chưa có thì làm tròn từ số thực bằng cùng phép tính.
  // Ngày công tính theo Check-in/out: ngày "Nghỉ, sẽ làm bù" là ngày nghỉ, không vào lương cơ bản theo ngày công; giờ làm bù là tiền làm thêm giờ
  // (lương giờ × giờ, gồm phần trả thêm ngày lễ), cùng ô otPay với OT và làm ngày lễ; lateCut chỉ là tiền giờ thiếu
  const lines =
    m.lines ||
    DayParts.linesOf({ ...m, basePay: numOr0(m.basePay), off: numOr0(m.off), cut: numOr0(m.cut) }, Math.round);
  const auto = {
    ...lines,
    settlePay: Math.round(numOr0(m.settlePay)),
    attendance: Math.round(numOr0(m.attendance)),
    travel: Math.round(numOr0(m.travel)),
    kpiPay: Math.round(numOr0(m.kpiPay)),
    exempt: numOr0(n.exempt),
    insurance: numOr0(n.insurance),
    tax: numOr0(n.tax),
    advance: numOr0(n.advance)
  };
  return { total: m.total, n, auto };
}
// Mọi ô sửa được của phiếu theo số TỰ TÍNH, cùng tên với PUT /api/slip-override. Ô TIỀN lấy từ `snapshot` (bản chụp đã tính lại theo ô số lượng ghim nếu có, nên ô
// tiền chưa bị sửa tay đã đi theo ghim); ô SỐ LƯỢNG lấy từ `original` (bản chụp gốc chưa ghim), để cột "số tự tính" của ô đã ghim vẫn là số gốc Admin so với.
// Giao diện lấy cột "số tự tính" từ đây thay vì tự gom từ các dòng ngày. null khi bản chụp thiếu hay hỏng.
function cellsOf(snapshot?, original = snapshot) {
  const basis = slipBasisOf(snapshot);
  if (!basis) return null;
  const m = original;
  const adj = m.pinAdjust || {};
  const parts = m.kpiParts && typeof m.kpiParts === 'object' ? m.kpiParts : {};
  const holidays = m.rows.filter(r => r.kind === 'holiday' && r.holBase > 0).length + numOr0(adj.holidayDays);
  return {
    ...basis.auto,
    kpiAmt: numOr0(m.kpiAmt),
    workDays: numOr0(m.count), // ngày đi làm thực tế; ngày nghỉ sẽ làm bù không cộng
    leaveDays: numOr0(m.leave),
    unpaidDays: numOr0(m.unpaid) + numOr0(m.approved) + numOr0(m.noshow),
    isatDays: numOr0(m.isat),
    holidayDays: holidays,
    settleDays: numOr0(m.settleDays),
    // giờ OT theo loại: ot15H trả theo ot.rate (ngày thường, Thứ Bảy trong lịch), ot20H theo ot.weekendRate (cuối tuần ngoài lịch), ot30H ngày lễ
    ot15H: numOr0(m.otHours) - numOr0(m.otWeekendHours) - numOr0(m.otHolHours),
    ot20H: numOr0(m.otWeekendHours),
    ot30H: numOr0(m.holWorkHours) + numOr0(m.otHolHours),
    debtH: numOr0(m.debt),
    kpiPct: m.kpiPct == null ? null : m.kpiPct,
    kpiBase: parts.wework ?? null,
    kpiUser: parts.user ?? null,
    kpiQltt: parts.manager ?? null,
    kpiPeer: parts.peer ?? null,
    kpiSelf: parts.self ?? null
  };
}
// Số chi trả của một phiếu: basis từ slipBasisOf, values là các ô Admin sửa, taxFrom là PayrollEngine.create(params của lần chạy).taxFrom.
// Trả null khi không ô tiền nào được sửa (giữ nguyên số đã lưu, từng đồng). Thuế tính lại bằng taxFrom nếu Admin không sửa tay thuế;
// thiếu taxFrom thì thuế giữ số cũ và taxStale báo ô thu nhập đã sửa mà thuế không tính lại được.
function paidFigures(basis?, values?, taxFrom?, force = false) {
  if (!basis || !values) return null;
  const has = (k?) => Object.hasOwn(values, k) && Number.isFinite(values[k]);
  const incomeTouched = SLIP_INCOME_KEYS.some(has) || has('lateCut');
  if (!incomeTouched && !SLIP_DEDUCT_KEYS.some(has) && !force) return null; // force: bản chụp đã tính lại theo ô số lượng ghim (src/domain/payroll/slip-pins.ts), số chi trả luôn có
  const { n, auto } = basis;
  const V = (k?) => (has(k) ? values[k] : auto[k]);
  const total = Math.round(
    basis.total + SLIP_INCOME_KEYS.reduce((s, k) => s + V(k) - auto[k], 0) - (V('lateCut') - auto.lateCut)
  );
  const exempt = has('exempt') ? values.exempt : Math.min(total, n.exempt);
  const taxable = Math.max(0, total - exempt);
  const insurance = V('insurance');
  // giảm trừ gia cảnh lấy từ bản chụp (n.deduction); bản chụp cũ không có thì engine coi là 0
  const taxAuto = taxFrom
    ? taxFrom({ contract: n.contract, taxOn: n.taxOn, deduction: n.deduction }, total, taxable, insurance).tax
    : n.tax;
  const tax = has('tax') ? values.tax : taxAuto;
  const advance = V('advance');
  return {
    gross: total,
    exempt,
    taxable,
    insurance,
    tax,
    advance,
    net: total - insurance - tax - advance - (Number(n.entriesDeduct) || 0), // khoản điền thêm kiểu trừ trừ sau thuế
    taxStale: incomeTouched && !taxFrom && !has('tax')
  };
}
// Bộ tính thuế của bộ tham số đã chụp ở lần chạy; không dựng được bộ máy thì null (thuế giữ số của bản chụp)
const taxFromCache = new WeakMap<any, any>(); // theo từng bộ tham số: dựng bộ máy một lần cho cả danh sách ước tính
function taxFromOf(params?) {
  // run.params null hoặc không phải đối tượng (dữ liệu hỏng): WeakMap không nhận khoá đó, nên không nhớ và không dựng bộ máy
  const cacheable = params !== null && typeof params === 'object';
  if (cacheable && taxFromCache.has(params)) return taxFromCache.get(params);
  let taxFrom: any = null;
  try {
    const kernel = Engine.create(params);
    taxFrom = typeof kernel.taxFrom === 'function' ? kernel.taxFrom : null;
  } catch {
    taxFrom = null;
  }
  if (cacheable) taxFromCache.set(params, taxFrom);
  return taxFrom;
}
// Số Admin đang sửa của một phiếu: kỳ đã duyệt dùng số đã đóng băng trên phiếu, chưa duyệt dùng số đang sửa (slip_overrides)
async function overrideValuesOf(run?, row?) {
  if (run.status === RUN_FINAL) return (row.override && row.override.values) || {};
  return (await store.getSlipOverride(row.username, run.month)).values;
}
// Hàng phiếu với số chi trả: gross, insurance, tax, advance, net là số chi trả, computed giữ số tự tính của bản chụp. Không có số sửa: trả nguyên hàng.
// Chỉ phiếu có số sửa tiền mới có hàng chi trả (thêm exempt, taxable, afterInsurance = gross − BH); không thì null.
function paidRow(row?, basis?, values?, taxFrom?, force = false) {
  const paid = row.status === 'error' ? null : paidFigures(basis, values, taxFrom, force);
  if (!paid) return null;
  return {
    ...row,
    gross: paid.gross,
    insurance: paid.insurance,
    tax: paid.tax,
    advance: paid.advance,
    net: paid.net,
    exempt: paid.exempt,
    taxable: paid.taxable,
    afterInsurance: paid.gross - paid.insurance,
    computed: { gross: row.gross, insurance: row.insurance, tax: row.tax, advance: row.advance, net: row.net },
    overridden: true
  };
}
/* ---------- bản chụp gửi cho NHÂN SỰ khi phiếu có số Admin sửa ---------- */
// Nhân sự chỉ nhận số chi trả, không nhận số tự tính của bản chụp. Với phiếu có số sửa, bản chụp gửi đi là một BẢN SAO:
//   - tổng thu nhập, miễn thuế, chịu thuế, bảo hiểm, thuế, tạm ứng, thực lĩnh lấy theo số chi trả (m.total, m.net, m.trace);
//   - ô Admin sửa ánh xạ thẳng một dòng (PAID_DIRECT) thì dòng đó mang giá trị sửa;
//   - ô sửa mà tiền của nó nằm rải trong nhiều dòng (PAID_WITHHELD) thì BỎ các dòng chi tiết đó, không đoán cách chia, và bỏ cả dòng ngày của phiếu;
//   - số dẫn xuất từ số tự tính (chia nhỏ bảo hiểm, thu nhập tính thuế, số ngày ứng) bị bỏ khi số gốc của chúng đã bị sửa hay đã đổi.
// Bản chụp trong DB không đổi; Admin vẫn nhận bản chụp gốc cùng số tự tính (computed) để đối chiếu.
const PAID_DIRECT = Object.freeze({
  attendance: ['attendance', 'phuCapChuyenCan'], // [trường của m, khoá của m.trace]
  travel: ['travel', 'phuCapDiLai'],
  kpiPay: ['kpiPay', 'luongKpi'],
  breakPay: ['breakPay', 'gioNghiDem']
});
const PAID_WITHHELD = Object.freeze([
  {
    keys: ['workBase', 'leavePay', 'settlePay', 'isatPay', 'holidayPay', 'lateCut'], // tiền ngày công
    m: ['base', 'basePay', 'off', 'cut', 'work'],
    trace: ['tienNgayCong', 'tongThanhPhanNgay']
  },
  {
    keys: ['otPay'], // OT, làm ngày lễ và giờ làm bù cùng một ô
    m: ['otPay', 'otWeekdayPay', 'otWeekendPay', 'holWorkPay', 'otHolPay', 'makeupPay', 'makeupHolPremium', 'work'],
    trace: ['tienOt', 'tienLamLe', 'lamBu', 'tongThanhPhanNgay']
  },
  { keys: ['flexPay', 'nightPay'], m: ['bonus', 'work'], trace: ['phuCapCa', 'tongThanhPhanNgay'] }
]);
const hasValue = (values?, key?) => Object.hasOwn(values, key) && Number.isFinite(values[key]);
// snapshot: bản chụp đã lưu; values: ô Admin sửa; paid: số chi trả (kết quả paidFigures hoặc hàng phiếu đã áp). Không có số sửa: trả nguyên bản chụp.
function staffPaidSnapshot(snapshot?, values?, paid?) {
  if (!paid || !snapshot || !snapshot.net) return snapshot;
  const has = (key?) => hasValue(values, key);
  const out: Record<string, any> = { ...snapshot, total: paid.gross };
  const trace = snapshot.trace ? { ...snapshot.trace } : null;
  const net = {
    ...snapshot.net,
    gross: paid.gross,
    exempt: paid.exempt,
    taxable: paid.taxable,
    insurance: paid.insurance,
    tax: paid.tax,
    advance: paid.advance,
    net: paid.net
  };
  const dropFrom = (target?, keys?) => keys.forEach(key => delete target[key]);
  // số dẫn xuất từ số tự tính của thuế và miễn thuế: không còn đúng sau khi số chi trả đổi
  dropFrom(net, ['assessable', 'taxDue']);
  if (has('exempt') || paid.exempt !== snapshot.net.exempt) dropFrom(net, ['exemptNight', 'exemptOt']);
  if (has('insurance')) dropFrom(net, ['bhxh', 'bhyt', 'bhtn', 'employer']);
  if (has('advance')) {
    dropFrom(net, ['advanceDays']);
    delete out.advanceBase;
  }
  for (const [key, [mKey, traceKey]] of Object.entries<any>(PAID_DIRECT))
    if (has(key)) {
      out[mKey] = values[key];
      if (trace) trace[traceKey] = values[key];
    }
  if (has('attendance') || has('travel')) out.allow = numOr0(out.travel) + numOr0(out.attendance);
  let dayDetailGone = false;
  for (const group of PAID_WITHHELD)
    if (group.keys.some(has)) {
      dropFrom(out, group.m);
      if (trace) dropFrom(trace, group.trace);
      dayDetailGone = true;
    }
  if (dayDetailGone || snapshot.pinned) delete out.rows; // dòng ngày mang tiền tự tính của từng ngày (phiếu có ô số lượng ghim: các dòng ngày không đổi theo)
  out.net = net;
  if (trace) {
    Object.assign(trace, {
      tongThuNhap: paid.gross,
      mienThue: paid.exempt,
      thuNhapChiuThue: paid.taxable,
      baoHiem: paid.insurance,
      thueTncn: paid.tax,
      tamUng: paid.advance,
      thucLinh: paid.net
    });
    out.trace = trace;
  }
  return out;
}

/* ---------- số hiển thị của từng dòng ngày (trang 1 phiếu A4, thẻ Thu nhập) ---------- */
// Bốn cột tiền của dòng ngày trên phiếu (trang 1 bản in, ngày trong thẻ Thu nhập) do máy chủ tính, giao diện chỉ chọn ô và định dạng:
//   cot = { luongNgay, phuCapCa, lamThem, truGio } (đồng, số nguyên) từ PayrollEngine.columnsOfDay: lương ngày (mọi phần lương ngày: lương
//   ngày, hoặc lương ngày lễ cộng tiền giờ ngày thường của ca sang ngày sau), phụ cấp ca (phụ cấp ca + Off Paid), làm thêm (OT + làm bù +
//   OT ngày lễ), trừ giờ (giờ thiếu của ngày đi làm). luongNgay + phuCapCa + lamThem − truGio = làm tròn đồng của total.
// Dòng của bản chụp đã lưu không có cot: tính lại từ chính các trường calcDay của dòng, bằng đúng hàm đó. Chỉ đọc các trường của dòng, không
// đổi số nào của phiếu; bản chụp trong DB không đổi (trả bản sao).
function dayFiguresOf(row?) {
  if (!row || typeof row !== 'object') return row;
  const worked =
    row.kind === 'work'
      ? typeof row.daily === 'number' && Number.isFinite(row.daily)
      : row.kind === 'holiday' && numOr0(row.hours) > 0;
  return worked ? { ...row, cot: Engine.columnsOfDay(row) } : row;
}
/* Giờ bấm thật của dòng ngày (punchIn / punchOut, giờ Việt Nam HH:MM, null khi thiếu bên đó) nằm sẵn trong dòng của bản chụp tính từ
   khi ActualHours.apply ghi vào ngày. Dòng của bản chụp cũ chưa có hai trường này: lấy lúc đọc từ các lượt chấm công của tháng, cùng cách chọn
   lượt với ActualHours.punchTimesOf. Chỉ ngày đi làm, vắng, chờ xử lý (trừ chưa tới ngày) và ngày giữ vì giải trình nhận giờ bấm; bản chụp trong DB không đổi (trả bản sao). */
const hasPunchSlot = (row?) =>
  row.kind === 'work' ||
  row.kind === 'noshow' ||
  (row.kind === 'holiday' && numOr0(row.hours) > 0) ||
  (row.kind === 'pending' && row.reason !== 'not-yet') ||
  !!row.held; // ngày giữ vì giải trình chưa duyệt hoặc bị từ chối
const needsPunch = (row?) => !!row && typeof row === 'object' && hasPunchSlot(row) && !('punchIn' in row);
async function withPunchTimes(rows?, username?, month?) {
  if (!Array.isArray(rows) || !rows.some(needsPunch) || !username || !month) return rows;
  const byDate = ActualHours.punchTimesOf(await store.listSessions({ username, month }));
  return rows.map(row =>
    needsPunch(row) ? { ...row, ...(byDate[row.date] || { punchIn: null, punchOut: null }) } : row
  );
}
// Dòng ngày kèm bốn cột tiền và giờ bấm thật. who = { username, month } của phiếu (thiếu thì chỉ kèm bốn cột tiền)
const dayRowsOf = async (rows?, who: any = {}) => await withPunchTimes(rows.map(dayFiguresOf), who.username, who.month);
const withDayFigures = async (snapshot?, who?) =>
  snapshot && Array.isArray(snapshot.rows) ? { ...snapshot, rows: await dayRowsOf(snapshot.rows, who) } : snapshot;
// Bản chụp không kèm giờ bấm thật và nhãn ngày giữ (held): chỉ để hiển thị, so bản chụp đã lưu với bản tính lại không tính các trường này
const withoutPunchTimes = (snapshot?) =>
  snapshot && Array.isArray(snapshot.rows)
    ? {
        ...snapshot,
        rows: snapshot.rows.map(row => {
          if (!row || typeof row !== 'object' || !('punchIn' in row || 'punchOut' in row || 'held' in row)) return row;
          const { punchIn, punchOut, held, ...rest } = row;
          return rest;
        })
      }
    : snapshot;
/* Ghi chú ngày cho thẻ Thu nhập của nhân sự (GET /api/me/estimate), đọc từ dòng ngày, không phải tiền:
   - holidayShifts: các ca có giờ làm ngày lễ, để ghi ngày ở dòng "Làm ngày lễ" (ca bắt đầu ngày thường rồi sang lễ: onHoliday false);
   - paidDays: số ngày nghỉ hưởng lương có tiền nằm trong "Tiền ngày công" (lễ có lương ngày lễ, phép và iSAT hưởng lương), đếm theo dòng
     để không phụ thuộc cách bộ máy đếm m.holiday / m.count (ngày lễ có đi làm, ngày lễ khai đi làm mà vắng).
   Không có dòng ngày (phiếu có số Admin sửa hay ô ghim đã bỏ dòng ngày): không gửi hai trường này. */
function staffDayNotesOf(rows?) {
  if (!Array.isArray(rows)) return {};
  const ok = rows.filter(r => r && typeof r === 'object' && typeof r.date === 'string');
  const count = (test?) => ok.filter(test).length;
  return {
    holidayShifts: ok.filter(r => r.holWork).map(r => ({ date: r.date, onHoliday: r.kind === 'holiday' })),
    paidDays: {
      holiday: count(r => r.kind === 'holiday' && numOr0(r.holBase) > 0),
      leave: count(r => r.kind === 'leave' && r.paidOff === true),
      isat: count(r => r.kind === 'isat' && r.paidOff === true)
    }
  };
}

export = {
  numOr0,
  dayFiguresOf,
  dayRowsOf,
  withDayFigures,
  withoutPunchTimes,
  staffDayNotesOf,
  SLIP_INCOME_KEYS,
  SLIP_DEDUCT_KEYS,
  RUN_FINAL,
  slipBasisOf,
  cellsOf,
  paidFigures,
  taxFromOf,
  overrideValuesOf,
  paidRow,
  staffPaidSnapshot
};
