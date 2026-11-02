// Dựng phiếu thu nhập từ phiếu chính thức (GET /periods/:month/payslips/:username) hoặc số của GET /me/estimate.
// Mỗi ô tiền là số máy chủ gửi; số 0 hiện nguyên giá trị, ô thiếu dữ liệu không bị đổi thành 0.
// Các dòng Thu nhập cộng đúng net.gross: workBase + leavePay + isatPay + holidayPay + otPay + flexPay + nightPay + breakPay + settlePay
// + travel + attendance + kpiPay + từng khối phụ cấp + khoản cộng thêm − lateCut. Các khoản trừ cộng đúng insurance + tax + advance + khoản trừ thêm.
const row = (label?, amount?, hint = '') => ({ label, hint, amount });
const isNum = n => typeof n === 'number' && Number.isFinite(n);
const nz = (n?) => (typeof n === 'number' && Number.isFinite(n) ? n : 0);
const sum = (list?) => list.reduce((s, x) => s + nz(x), 0);
const noNegZero = (n?) => (n === 0 ? 0 : n);

// Khoản điền thêm: mỗi khoản một dòng khi các khoản cộng đúng số tổng của máy chủ, lệch thì một dòng tổng.
function entryRows(m?, direction?, total?, label?) {
  if (!isNum(total)) return [];
  const items = (Array.isArray(m.entries) ? m.entries : []).filter(e => e && e.direction === direction && isNum(e.amount));
  if (items.length && sum(items.map(e => e.amount)) === total)
    return items.map(e =>
      row(String(e.slipLine || e.label || label), direction === 'deduct' ? -e.amount : e.amount)
    );
  return [row(label, direction === 'deduct' ? -total : total)];
}

// otPay của máy chủ = OT + làm bù + làm ngày lễ; vết (trace) tách ba phần cộng đúng otPay.
function otRows(lines?, trace?) {
  const parts = [trace.tienOt, trace.lamBu, trace.tienLamLe];
  if (parts.every(isNum) && isNum(lines.otPay) && sum(parts) === lines.otPay)
    return [
      row('Tiền OT', trace.tienOt),
      row('Tiền làm bù', trace.lamBu),
      row('Tiền làm ngày lễ', trace.tienLamLe)
    ];
  return isNum(lines.otPay) ? [row('Tiền OT', lines.otPay)] : [];
}

function incomeRows(m?, trace?) {
  const net = m.net || {};
  const rows: any[] = [];
  const optional: any[] = [];
  if (m.lines) {
    const lines = m.lines;
    if (isNum(lines.workBase)) rows.push(row('Tiền ngày công', lines.workBase));
    optional.push(['Tiền nghỉ phép', lines.leavePay], ['Tiền iSAT', lines.isatPay], ['Tiền ngày lễ', lines.holidayPay]);
    optional.push(['Tiền quyết toán phép dư', m.settlePay]);
    optional.push(...otRows(lines, trace).map(r => [r.label, r.amount]));
    optional.push(
      ['Phụ cấp ca linh hoạt', lines.flexPay],
      ['Phụ cấp ca đêm', lines.nightPay],
      ['Giờ nghỉ đêm', lines.breakPay]
    );
  } else {
    // bản chụp không còn các dòng nguyên đồng (số Admin sửa): lấy theo vết của phiếu
    if (isNum(trace.tienNgayCong)) rows.push(row('Tiền ngày công', trace.tienNgayCong));
    optional.push(
      ['Tiền quyết toán phép dư', m.settlePay],
      ['Tiền OT', trace.tienOt],
      ['Tiền làm bù', trace.lamBu],
      ['Tiền làm ngày lễ', trace.tienLamLe],
      ['Phụ cấp ca', trace.phuCapCa],
      ['Giờ nghỉ đêm', trace.gioNghiDem]
    );
  }
  optional.push(['Phụ cấp đi lại', m.travel], ['Phụ cấp chuyên cần', m.attendance], ['Lương KPI', m.kpiPay]);
  for (const b of Array.isArray(m.blocks) ? m.blocks : []) optional.push([String(b.label || b.code || 'Khoản thêm'), b.amount]);
  for (const [label, amount] of optional) if (isNum(amount)) rows.push(row(label, amount));
  rows.push(...entryRows(m, 'add', net.entriesAdd, 'Khoản cộng thêm'));
  if (m.lines && isNum(m.lines.lateCut)) rows.push(row('Trừ đi trễ, về sớm', -Math.abs(m.lines.lateCut)));
  return rows;
}

function deductionRows(m?, net?) {
  const rows: any[] = [];
  const split = [net.bhxh, net.bhyt, net.bhtn];
  if (split.some(isNum) && (!isNum(net.insurance) || sum(split) === net.insurance)) {
    for (const [label, amount] of [
      ['Bảo hiểm xã hội', net.bhxh],
      ['Bảo hiểm y tế', net.bhyt],
      ['Bảo hiểm thất nghiệp', net.bhtn]
    ])
      if (isNum(amount)) rows.push(row(label, -Math.abs(amount)));
  } else if (isNum(net.insurance)) rows.push(row('Bảo hiểm', -Math.abs(net.insurance)));
  if (isNum(net.tax)) rows.push(row('Thuế thu nhập cá nhân', -Math.abs(net.tax)));
  if (isNum(net.advance)) rows.push(row('Tạm ứng', -Math.abs(net.advance)));
  rows.push(...entryRows(m, 'deduct', net.entriesDeduct, 'Khoản trừ thêm'));
  return rows;
}

function slip({ month, official, m, net, trace, nav, stateLabel, intro, upTo }: any) {
  const income = incomeRows({ ...m, net }, trace);
  const deductions = deductionRows(m, net);
  // net.entriesDeduct chỉ được gửi khi có khoản; absence mang nghĩa không có khoản nào.
  const deductionEntries = net.entriesDeduct === undefined ? 0 : net.entriesDeduct;
  const deductionValues = [net.insurance, net.tax, net.advance, deductionEntries];
  const deductionTotal = deductionValues.every(isNum)
    ? deductionValues.reduce((total, value) => total + value, 0)
    : null;
  return {
    month,
    stateLabel,
    official,
    intro,
    ...nav,
    figure: {
      label: official ? 'Thực nhận' : 'Thực nhận ước tính',
      amount: net.net,
      note: official || !upTo ? '' : `Tính đến ${upTo.slice(8, 10)}/${upTo.slice(5, 7)}`
    },
    groups: [
      { title: 'Thu nhập', total: net.gross, rows: income },
      {
        title: 'Các khoản trừ',
        total: deductionTotal == null ? null : noNegZero(-Math.abs(deductionTotal)),
        rows: deductions
      }
    ],
    total: { label: official ? 'Thực nhận' : 'Thực nhận ước tính', amount: net.net },
    sections: []
  };
}

/** Tháng không có phiếu cũng không có số: khung rỗng chỉ mang nút chuyển tháng. */
export const emptyIncome = (month?, nav?) => ({
  month,
  empty: true,
  stateLabel: '',
  official: false,
  intro: '',
  ...nav
});

/** Số của GET /me/estimate?month=; official=true (phiếu đã công bố cho nhân viên) thì dựng như phiếu chính thức. null khi không có công, không có tiền. */
export function buildEstimateIncome({ month, estimate, nav }: any) {
  const m = estimate.m || {};
  const net = estimate.net || m.net || {};
  if (![m.count, m.total, net.net, net.gross].some(isNum)) return null;
  const official = !!estimate.official;
  return slip({
    month,
    official,
    m,
    net,
    trace: estimate.trace || {},
    nav,
    stateLabel: official ? 'Chính thức' : 'Ước tính',
    intro: official ? '' : estimate.label || '',
    upTo: estimate.toDate && estimate.toDate.upTo
  });
}

/** Phiếu chính thức của tháng đã chi trả; null khi phiếu lỗi hoặc không có bản chụp. */
export function buildPayslipIncome({ month, res, nav }: any) {
  const p = res.payslip || {};
  const snap = p.snapshot || {};
  if (p.status === 'error' || !snap.net) return null;
  // gross, insurance, tax, advance, net của phiếu là số chi trả; bản chụp giữ phần chia nhỏ (bhxh, bhyt, bhtn, khoản thêm)
  const paid: Record<string, any> = {};
  for (const k of ['gross', 'insurance', 'tax', 'advance', 'net']) if (typeof p[k] === 'number') paid[k] = p[k];
  return slip({
    month,
    official: true,
    m: snap,
    net: { ...snap.net, ...paid },
    trace: snap.trace || {},
    nav,
    stateLabel: 'Chính thức',
    intro: ''
  });
}
