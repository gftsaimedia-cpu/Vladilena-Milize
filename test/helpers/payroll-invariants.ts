'use strict';
// Các đẳng thức tiền mà MỌI kết quả tháng của bộ máy lương phải thỏa, không cần bộ máy chuẩn để so:
//   - các dòng tiền (m.lines), phụ cấp đi lại, chuyên cần, KPI đều là số nguyên đồng; tổng thu nhập là tổng đúng của chúng (mỗi dòng làm tròn một lần);
//   - tiền ngày (m.work) = workBase + leavePay + isatPay + holidayPay + otPay + flexPay + nightPay + breakPay − lateCut, và pay của các dòng ngày cộng lại đúng bằng số đó;
//   - gross = tổng thu nhập; bảo hiểm = BHXH + BHYT + BHTN khi có đóng; thực lĩnh = gross − bảo hiểm − thuế − tạm ứng (cả năm số là số nguyên đồng, thuế và bảo hiểm không âm);
//   - tính hai lần cùng đầu vào cho cùng kết quả và bộ máy không sửa đầu vào.
//
//   payrollEngineInvariants(engineFn, { cases, seed, label })   engineFn(input) -> { m }; ném AssertionError kèm hạt giống khi có ca vi phạm
const assert = require('node:assert/strict');
const { generateCases } = require('./payroll-cases');
const { digest } = require('./payroll-differential');

const isDong = (x?) => Number.isInteger(x);
const sum = (values?) => values.reduce((s, x) => s + x, 0);

// Danh sách đẳng thức bị vi phạm của một kết quả tháng m (rỗng nghĩa là đúng hết)
function monthProblems(m?) {
  const problems: any[] = [];
  const need = (ok?, text?) => {
    if (!ok) problems.push(text);
  };
  const net = m.net;
  const { lines } = m;
  need(lines && typeof lines === 'object', 'thiếu m.lines');
  if (!lines || !net) return problems;
  for (const [name, value] of Object.entries<any>(lines))
    need(isDong(value), `m.lines.${name} không phải số nguyên đồng: ${value}`);
  for (const name of ['travel', 'attendance', 'kpiPay'])
    need(isDong(m[name]), `m.${name} không phải số nguyên đồng: ${m[name]}`);
  const dayPay =
    lines.workBase +
    lines.leavePay +
    lines.isatPay +
    lines.holidayPay +
    lines.otPay +
    lines.flexPay +
    lines.nightPay +
    lines.breakPay -
    lines.lateCut;
  need(m.work === dayPay, `m.work ${m.work} khác tổng các dòng ngày ${dayPay}`);
  need(m.allow === m.travel + m.attendance, `m.allow ${m.allow} khác đi lại + chuyên cần ${m.travel + m.attendance}`);
  const extra = sum((m.blocks || []).map(b => b.amount)) + (m.settlePay || 0);
  need(
    m.entries !== undefined || m.total === dayPay + m.allow + m.kpiPay + extra,
    `m.total ${m.total} khác tổng các dòng ${dayPay + m.allow + m.kpiPay + extra}`
  );
  need(Array.isArray(m.rows), 'thiếu m.rows');
  if (Array.isArray(m.rows)) {
    const paid = sum(m.rows.map(r => r.pay));
    need(
      m.rows.every(r => isDong(r.pay)),
      'có dòng ngày với pay không phải số nguyên đồng'
    );
    need(paid === dayPay, `tổng pay các dòng ngày ${paid} khác tiền ngày ${dayPay}`);
  }
  for (const name of ['gross', 'insurance', 'tax', 'advance', 'net', 'exempt', 'taxable'])
    need(isDong(net[name]), `m.net.${name} không phải số nguyên đồng: ${net[name]}`);
  need(net.gross === Math.round(m.total), `m.net.gross ${net.gross} khác tổng thu nhập ${m.total}`);
  need(net.insurance >= 0 && net.tax >= 0 && net.advance >= 0, 'bảo hiểm, thuế, tạm ứng không được âm');
  need(
    net.insurance === net.bhxh + net.bhyt + net.bhtn,
    `bảo hiểm ${net.insurance} khác BHXH + BHYT + BHTN ${net.bhxh + net.bhyt + net.bhtn}`
  );
  if (m.entries === undefined && !(m.blocks && m.blocks.length))
    need(
      net.net === net.gross - net.insurance - net.tax - net.advance,
      `thực lĩnh ${net.net} khác gross − bảo hiểm − thuế − tạm ứng ${net.gross - net.insurance - net.tax - net.advance}`
    );
  return problems;
}

function runOnce(engineFn?, input?) {
  const copy = JSON.parse(JSON.stringify(input));
  const before = digest(copy);
  const out = engineFn(copy);
  return { out, mutated: digest(copy) !== before };
}

// Vi phạm của một ca (đầu vào + cách tính); rỗng nghĩa là đúng hết
function caseProblems(engineFn?, input?) {
  const first = runOnce(engineFn, input);
  const second = runOnce(engineFn, input);
  const problems = monthProblems(first.out.m);
  if (first.mutated) problems.push('bộ máy sửa đầu vào');
  if (digest(first.out) !== digest(second.out)) problems.push('tính hai lần ra hai kết quả khác nhau');
  return problems;
}

function payrollEngineInvariants(engineFn?, options: any = {}) {
  const { cases = 5000, seed, label = 'ứng viên', inputs } = options;
  assert.equal(typeof engineFn, 'function', 'payrollEngineInvariants cần engineFn(input)');
  const list = inputs || generateCases(seed, cases);
  assert.ok(inputs || Number.isInteger(seed), 'payrollEngineInvariants cần seed là số nguyên hoặc danh sách inputs');
  const bad: any[] = [];
  for (const c of list) {
    const problems = caseProblems(engineFn, c.input);
    if (problems.length) bad.push({ id: c.id, problems });
  }
  if (bad.length) {
    const lines = bad.slice(0, 5).map(x => `  - ${x.id}: ${x.problems.slice(0, 3).join('; ')}`);
    const message = [
      `payrollEngineInvariants (${label}): ${bad.length}/${list.length} ca vi phạm đẳng thức tiền${seed ? `, hạt giống seed=${seed}` : ''}.`,
      ...lines
    ].join('\n');
    console.error(message);
    throw new assert.AssertionError({ message, actual: bad.length, expected: 0, operator: 'invariants' });
  }
  return { cases: list.length };
}

module.exports = { monthProblems, caseProblems, payrollEngineInvariants };
