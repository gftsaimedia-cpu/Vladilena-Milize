// Dựng phiếu thu nhập từ phiếu chính thức (GET /periods/:month/payslips/:username) hoặc số của GET /me/estimate.
// Mỗi ô tiền là một số của máy chủ; ô không có tiền thì không hiện (trừ dòng Tiền ngày công).
// Các dòng Thu nhập cộng đúng net.gross: workBase + leavePay + isatPay + holidayPay + otPay + flexPay + nightPay + breakPay + settlePay
// + travel + attendance + kpiPay + từng khối phụ cấp + khoản cộng thêm − lateCut. Các khoản trừ cộng đúng insurance + tax + advance + khoản trừ thêm.
const row = (label, amount, hint = '') => ({ label, hint, amount });
const nz = n => (typeof n === 'number' && Number.isFinite(n) ? n : 0);
const sum = list => list.reduce((s, x) => s + nz(x), 0);
const noNegZero = n => (n === 0 ? 0 : n);

// Khoản điền thêm: mỗi khoản một dòng khi các khoản cộng đúng số tổng của máy chủ, lệch thì một dòng tổng.
function entryRows(m, direction, total, label) {
  if (!nz(total)) return [];
  const items = (Array.isArray(m.entries) ? m.entries : []).filter(e => e && e.direction === direction);
  if (items.length && sum(items.map(e => e.amount)) === total)
    return items.map(e =>
      row(String(e.slipLine || e.label || label), direction === 'deduct' ? -nz(e.amount) : nz(e.amount))
    );
  return [row(label, direction === 'deduct' ? -total : total)];
}

// otPay của máy chủ = OT + làm bù + làm ngày lễ; vết (trace) tách ba phần cộng đúng otPay.
function otRows(lines, trace) {
  const parts = [trace.tienOt, trace.lamBu, trace.tienLamLe];
  if (parts.every(v => typeof v === 'number') && sum(parts) === nz(lines.otPay))
    return [
      row('Tiền OT', nz(trace.tienOt)),
      row('Tiền làm bù', nz(trace.lamBu)),
      row('Tiền làm ngày lễ', nz(trace.tienLamLe))
    ];
  return [row('Tiền OT', nz(lines.otPay))];
}

function incomeRows(m, trace) {
  const net = m.net || {};
  const rows = [];
  const optional = [];
  if (m.lines) {
    const lines = m.lines;
    rows.push(row('Tiền ngày công', nz(lines.workBase)));
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
    rows.push(row('Tiền ngày công', nz(trace.tienNgayCong)));
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
  for (const b of Array.isArray(m.blocks) ? m.blocks : [])
    optional.push([String(b.label || b.code || 'Khoản thêm'), b.amount]);
  for (const [label, amount] of optional) if (nz(amount)) rows.push(row(label, nz(amount)));
  rows.push(...entryRows(m, 'add', nz(net.entriesAdd), 'Khoản cộng thêm'));
  if (m.lines && nz(m.lines.lateCut)) rows.push(row('Trừ đi trễ, về sớm', -Math.abs(nz(m.lines.lateCut))));
  return rows;
}

function deductionRows(m, net) {
  const rows = [];
  const split = [net.bhxh, net.bhyt, net.bhtn];
  if (split.some(v => typeof v === 'number') && sum(split) === nz(net.insurance)) {
    for (const [label, amount] of [
      ['Bảo hiểm xã hội', net.bhxh],
      ['Bảo hiểm y tế', net.bhyt],
      ['Bảo hiểm thất nghiệp', net.bhtn]
    ])
      if (nz(amount)) rows.push(row(label, -Math.abs(nz(amount))));
  } else if (nz(net.insurance)) rows.push(row('Bảo hiểm', -Math.abs(nz(net.insurance))));
  if (nz(net.tax)) rows.push(row('Thuế thu nhập cá nhân', -Math.abs(nz(net.tax))));
  if (nz(net.advance)) rows.push(row('Tạm ứng', -Math.abs(nz(net.advance))));
  rows.push(...entryRows(m, 'deduct', nz(net.entriesDeduct), 'Khoản trừ thêm'));
  return rows;
}

function slip({ month, official, m, net, trace, nav, stateLabel, intro, upTo }) {
  const income = incomeRows({ ...m, net }, trace);
  const deductions = deductionRows(m, net);
  const deductionTotal = nz(net.insurance) + nz(net.tax) + nz(net.advance) + nz(net.entriesDeduct);
  return {
    month,
    stateLabel,
    official,
    intro,
    ...nav,
    figure: {
      label: official ? 'Thực nhận' : 'Thực nhận ước tính',
      amount: nz(net.net),
      note: official || !upTo ? '' : `Tính đến ${upTo.slice(8, 10)}/${upTo.slice(5, 7)}`
    },
    groups: [
      { title: 'Thu nhập', total: nz(net.gross), rows: income },
      { title: 'Các khoản trừ', total: noNegZero(-Math.abs(deductionTotal)), rows: deductions }
    ],
    total: { label: official ? 'Thực nhận' : 'Thực nhận ước tính', amount: nz(net.net) },
    sections: []
  };
}

/** Tháng không có phiếu cũng không có số: khung rỗng chỉ mang nút chuyển tháng. */
export const emptyIncome = (month, nav) => ({ month, empty: true, stateLabel: '', official: false, intro: '', ...nav });

/** Số của GET /me/estimate?month=; official=true (phiếu đã công bố cho nhân viên) thì dựng như phiếu chính thức. null khi không có công, không có tiền. */
export function buildEstimateIncome({ month, estimate, nav }) {
  const m = estimate.m || {};
  const net = estimate.net || m.net || {};
  if (!nz(m.count) && !nz(m.total) && !nz(net.net) && !nz(net.gross)) return null;
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
export function buildPayslipIncome({ month, res, nav }) {
  const p = res.payslip || {};
  const snap = p.snapshot || {};
  if (p.status === 'error' || !snap.net) return null;
  // gross, insurance, tax, advance, net của phiếu là số chi trả; bản chụp giữ phần chia nhỏ (bhxh, bhyt, bhtn, khoản thêm)
  const paid = {};
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
