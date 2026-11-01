'use strict';
// Tổng bằng tổng các dòng nguyên đồng ở các phản hồi của máy chủ: phiếu ước tính một người (Admin), phiếu đã tính, danh sách phiếu và GET /me/estimate không có
// trường tiền nào có phần lẻ; allowanceTotal, gross, taxable, afterInsurance, net là cộng trừ đúng các dòng (cells, lines); Thành tiền các ngày cộng đúng tiền ngày.
// Chỉ người bịa (qa_*) và DB trong bộ nhớ.
const P = require('../helpers/period-api');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { F } = P;
const monthOf = P.monthPool();

before(F.start);
after(F.stop);

const LINE_CELLS = [
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
];
const NET_MONEY = [
  'gross',
  'exempt',
  'taxable',
  'insurance',
  'employer',
  'deduction',
  'assessable',
  'tax',
  'advance',
  'net'
];
const whole = (label?, v?) => assert.ok(Number.isInteger(v), `${label} = ${v} có phần lẻ`);

function checkPayslip(p?, label?) {
  const m = p.snapshot;
  const sum = LINE_CELLS.reduce((s, k) => s + p.cells[k], 0) - p.cells.lateCut + (m.net.entriesAdd || 0);
  const blocks = (m.blocks || []).reduce((s, b) => s + b.amount, 0);
  for (const k of [...LINE_CELLS, 'lateCut']) whole(`${label} cells.${k}`, p.cells[k]);
  for (const k of ['gross', 'insurance', 'tax', 'advance', 'net']) whole(`${label} ${k}`, p[k]);
  whole(`${label} allowanceTotal`, p.allowanceTotal);
  for (const k of NET_MONEY) if (k in m.net) whole(`${label} snapshot.net.${k}`, m.net[k]);
  for (const k of ['total', 'work', 'travel', 'attendance', 'allow', 'kpiPay'])
    whole(`${label} snapshot.${k}`, m[k] || 0);
  for (const [k, v] of Object.entries<any>(m.trace))
    if (typeof v === 'number' && !['ngayDiLam', 'tyLeNgayDiLam', 'heSoNgayKpi', 'gioVuotNguong'].includes(k))
      whole(`${label} trace.${k}`, v);
  assert.equal(p.gross, sum + blocks, `${label}: tổng thu nhập = tổng các dòng`);
  assert.equal(m.net.taxable, p.gross - m.net.exempt, `${label}: chịu thuế`);
  assert.equal(p.net, p.gross - p.insurance - p.tax - p.advance, `${label}: thực nhận`);
  assert.equal(
    p.allowanceTotal,
    p.cells.attendance + p.cells.travel + p.cells.flexPay + p.cells.breakPay + p.cells.nightPay + blocks,
    `${label}: tổng phụ cấp`
  );
  const rows = m.rows.filter(r => r.kind !== 'invalid');
  assert.equal(
    rows.reduce((s, r) => s + r.pay, 0),
    m.work,
    `${label}: Thành tiền các ngày = tiền ngày của tháng`
  );
  for (const r of rows) {
    whole(`${label} ${r.date} pay`, r.pay);
    if (r.cot)
      assert.equal(r.cot.luongNgay + r.cot.phuCapCa + r.cot.lamThem - r.cot.truGio, r.pay, `${label} ${r.date}`);
  }
}

test('phiếu ước tính một người và phiếu đã tính: không trường tiền nào có phần lẻ, tổng bằng tổng các dòng', async () => {
  const M = monthOf();
  await P.seed(M, { withActual: true });
  for (const user of ['qa_nv1', 'qa_nv2', 'qa_ctv1', 'qa_tts1']) {
    const res = await F.call('GET', `/periods/${M}/estimates/${user}`, { who: 'admin' });
    assert.equal(res.status, 200, JSON.stringify(res.data).slice(0, 300));
    checkPayslip(res.data.payslip, `estimate ${user}`);
  }
  const done = await P.setupMonth(monthOf(), 'calculated', { withActual: true });
  const list = await F.call('GET', `/periods/${done}/payslips?pageSize=50`, { who: 'admin' });
  assert.equal(list.status, 200, JSON.stringify(list.data).slice(0, 300));
  for (const row of list.data.rows) {
    for (const k of ['gross', 'insurance', 'tax', 'advance', 'net', 'allowanceTotal'])
      whole(`list ${row.username} ${k}`, row[k]);
    const res = await F.call('GET', `/periods/${done}/payslips/${row.username}`, { who: 'admin' });
    checkPayslip(res.data.payslip, `payslip ${row.username}`);
  }
});

test('GET /me/estimate: tổng thu nhập, tổng phụ cấp, thực nhận và vết nguyên đồng, tổng bằng tổng các dòng', async () => {
  const M = monthOf();
  await P.seed(M, { withActual: true });
  const res = await F.call('GET', `/me/estimate?month=${M}&rows=1`, { who: 'qa_nv1' });
  assert.equal(res.status, 200, JSON.stringify(res.data).slice(0, 300));
  const d = res.data;
  assert.ok(d.m && d.net, 'có ước tính');
  whole('allowanceTotal', d.allowanceTotal);
  for (const k of ['gross', 'insurance', 'tax', 'advance', 'net']) whole(`net.${k}`, d.net[k]);
  for (const k of ['total', 'work', 'travel', 'attendance', 'allow']) whole(`m.${k}`, d.m[k] || 0);
  assert.equal(d.net.gross, d.m.total);
  assert.equal(d.net.net, d.net.gross - d.net.insurance - d.net.tax - d.net.advance);
  assert.equal(
    d.m.rows.reduce((s, r) => s + (r.pay || 0), 0),
    d.m.work
  );
  for (const [k, v] of Object.entries<any>(d.trace))
    if (typeof v === 'number' && !['ngayDiLam', 'tyLeNgayDiLam', 'heSoNgayKpi', 'gioVuotNguong'].includes(k))
      whole(`trace.${k}`, v);
});
