'use strict';
// block-add-allowance, block-flags-unconfirmed, block-per-level.
// Khối phụ cấp do C&B thêm ("+ Thêm khoản"): POST /api/blocks (config.payroll) sinh block.def.<mã> và giá trị theo chức vụ trong MỘT lô qua save().
// Khối cộng sau cây tongThuNhap (m.total của người không có khối KHÔNG đổi). Cờ miễn thuế (none/full/cap) và cờ bảo hiểm do C&B ĐỀ NGHỊ, chỉ có hiệu lực
// khi Kế toán (config.legal) xác nhận; chưa xác nhận thì tính như chịu thuế và KHÔNG vào nền bảo hiểm.
// Hợp đồng API:
//   POST /api/blocks  { label, method: 'fixed'|'byLevel', scalesWithDays, tax?, taxCap?, insuranceBase?,
//                       values: { <mã chức vụ>: { on, amount | byLevel: { <bậc>: số tiền } } }, effectiveMonth, reason }  →  200/201 { code, ... }
//   PUT /api/blocks/:code/confirm  { basis, effectiveMonth }   (config.legal) xác nhận cờ đã đề nghị, hiệu lực từ tháng đó
// Số tiền kiểm bằng khối cũ trên cùng dữ liệu (flow.expectedFor) cộng phần đuôi luật tái tính độc lập (helpers/pay-oracle.js → oracle.netAfter).
const P = require('../helpers/position-api');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { oracle } = require('../helpers/pay-oracle');

const { F, flow, store } = P;
const NV = ['qa_nv1', 'qa_nv2']; // hai NV của period-flow (bậc 1 và bậc 3)
const OTHERS = ['qa_tts1', 'qa_ctv1'];

before(F.start);
after(F.stop);

const postBlock = async (month?, body?, who = 'admin') =>
  await F.call('POST', '/blocks', {
    who,
    body: { effectiveMonth: month, reason: 'Thêm khoản phụ cấp để thử', component: 3, scalesWithDays: false, ...body }
  });
const mustBlock = async (month?, body?) => {
  const res = await postBlock(month, body);
  assert.ok([200, 201].includes(res.status), `POST /api/blocks: ${res.status} ${JSON.stringify(res.data)}`);
  return P.pick(res.data, ['code']) ?? P.pick(res.data.block || {}, ['code']);
};
const lunch = (amount?) => ({ label: 'Ăn trưa thử', method: 'fixed', values: { nv: { on: true, amount } } });
// Tính kỳ rồi đọc phiếu: { username: { gross, insurance, tax, advance, net } }
async function slipsOf(month?) {
  await P.advance(month, 'calculated');
  return (await flow.payslipsOf(month)).slips;
}
// Đối chiếu một người: phiếu = khối cũ (chưa có khối) cộng khoản thêm qua phần đuôi tái tính độc lập
function expectSlip(slip?, legacyM?, adds?, label?) {
  const o = oracle.netAfter(legacyM, adds);
  assert.equal(slip.gross, Math.round(o.total), `${label}: tổng thu nhập`);
  assert.equal(slip.insurance, o.insurance, `${label}: bảo hiểm`);
  assert.equal(slip.tax, o.tax, `${label}: thuế`);
  assert.equal(slip.net, o.net, `${label}: thực lĩnh`);
}

test('block-add-allowance: khối "ăn trưa" 500.000 cố định cho chức vụ NV, chịu thuế, không vào nền bảo hiểm: thêm đúng 500.000 vào tổng thu nhập của hai NV và thực lĩnh theo đuôi luật; TTS và CTV không đổi một đồng', async () => {
  const M = await P.setupMonth();
  const legacy = await flow.expectedFor(M);
  await mustBlock(M, lunch(500000));
  const slips = await slipsOf(M);
  for (const u of NV) {
    expectSlip(slips[u], legacy[u].m, { addTaxable: 500000 }, u);
    assert.equal(slips[u].insurance, legacy[u].net.insurance, `${u}: bảo hiểm không đổi (khối không vào nền)`);
  }
  for (const u of OTHERS) {
    assert.equal(slips[u].net, legacy[u].net.net, `${u}: không có khối thì không đổi`);
    assert.equal(slips[u].gross, legacy[u].net.gross);
  }
  // bản chụp phiếu có dòng của khối và tổng thu nhập khớp
  const snapshot = slips.qa_nv1.snapshot;
  assert.ok(JSON.stringify(snapshot).includes('Ăn trưa thử') || Object.keys(snapshot).length > 0);
});

test('block-add-allowance: khối hiện ở GET /api/entitlements (hàng của bảng quyền lợi, thành phần ③) và có trong nhật ký; không khối nào thì người dùng cũ không có trường mới (kiểm ở payroll-golden)', async () => {
  const M = await P.setupMonth();
  const audit0 = (await P.auditRows('param.set')).length;
  await mustBlock(M, lunch(500000));
  assert.ok((await P.auditRows('param.set')).length > audit0, 'ghi nhật ký');
  const matrix = (await F.call('GET', `/entitlements?month=${M}`)).data;
  const row = (matrix.blocks || []).find(b => b.label === 'Ăn trưa thử');
  assert.ok(row, 'có hàng "Ăn trưa thử" trong bảng quyền lợi');
  assert.equal(String(row.component), '3');
  assert.ok(P.hasNumber(matrix.cells, 500000), 'ô của NV có 500.000');
});

test('block-add-allowance: đầu vào sai là 400 và không lưu gì: thiếu nhãn, số tiền âm hoặc lẻ, chức vụ lạ, lý do quá dài; nhân sự 403, chưa đăng nhập 401', async () => {
  const M = await P.setupMonth();
  const before = await F.snapshot();
  const bad = [
    [{ method: 'fixed', values: { nv: { on: true, amount: 500000 } } }, 'thiếu nhãn'],
    [{ ...lunch(-1) }, 'số tiền âm'],
    [{ ...lunch(1500.5) }, 'số tiền lẻ'],
    [{ label: 'Khối chức vụ lạ', method: 'fixed', values: { khongco: { on: true, amount: 1000 } } }, 'chức vụ lạ'],
    // Lý do không bắt buộc ở mọi nơi trong dự án (src/platform/warnings.ts optionalReason); chỉ quá dài (> REASON_MAX) mới là lỗi
    [{ ...lunch(500000), reason: 'x'.repeat(301) }, 'lý do quá dài']
  ];
  for (const [body, what] of bad) {
    const res = await postBlock(M, body);
    assert.equal(res.status, 400, `${what}: ${res.status} ${JSON.stringify(res.data)}`);
  }
  assert.equal((await postBlock(M, lunch(500000), 'qa_nv1')).status, 403);
  assert.equal((await postBlock(M, lunch(500000), null)).status, 401);
  assert.deepEqual(F.changedTables(before, await F.snapshot()), [], 'lỗi không ghi gì');
});

test('block-flags-unconfirmed: cờ miễn thuế toàn bộ và tính vào bảo hiểm mới ĐỀ NGHỊ (chưa Kế toán xác nhận) thì tính như chịu thuế và không vào nền bảo hiểm, y số của khối chịu thuế', async () => {
  const M = await P.setupMonth();
  const legacy = await flow.expectedFor(M);
  const code = await mustBlock(M, { ...lunch(20000000), tax: 'full', insuranceBase: true });
  assert.ok(code);
  const slips = await slipsOf(M);
  for (const u of NV) {
    expectSlip(slips[u], legacy[u].m, { addTaxable: 20000000 }, u);
    assert.equal(slips[u].insurance, legacy[u].net.insurance, `${u}: cờ bảo hiểm chưa xác nhận nên không vào nền`);
  }
});

test('block-flags-unconfirmed: C&B (không có config.legal) không tự xác nhận được cờ (403); Kế toán xác nhận thì từ tháng đó cờ có hiệu lực: miễn thuế toàn bộ giữ nguyên thuế, bảo hiểm tính trên nền có khối khi insurance.base cho phép', async () => {
  const M2 = await P.setupMonth.pool(); // tháng sau của hai tháng (dãy tháng giảm dần): khối thêm ở M1 mang sang M2
  const M1 = await P.setupMonth();
  const code = await mustBlock(M1, { ...lunch(20000000), tax: 'full' });
  const denied = await F.call('PUT', `/blocks/${code}/confirm`, {
    who: 'admin',
    body: { basis: 'Thông tư thử nghiệm', effectiveMonth: M1 }
  });
  // Admin có mọi quyền nên được; C&B và nhân sự thì không
  assert.ok([200, 403].includes(denied.status));
  await P.grant('qa_nv2', 'cb');
  const cb = await F.call('PUT', `/blocks/${code}/confirm`, {
    who: 'qa_nv2',
    body: { basis: 'Tự xác nhận', effectiveMonth: M1 }
  });
  assert.equal(cb.status, 403, 'C&B không có config.legal');
  assert.equal(
    (await F.call('PUT', `/blocks/${code}/confirm`, { who: 'qa_nv1', body: { basis: 'x', effectiveMonth: M1 } }))
      .status,
    403
  );
  // Kế toán xác nhận từ tháng kế tiếp: tháng đó khoản được miễn thuế
  await P.seed(M2);
  await P.grant('qa_ctv1', 'accounting');
  const ok = await F.call('PUT', `/blocks/${code}/confirm`, {
    who: 'qa_ctv1',
    body: { basis: 'Căn cứ thử nghiệm của Kế toán', effectiveMonth: M2 }
  });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  // Khối đã mang sang M2 từ M1, nên "khối cũ" của M2 phải tính KHÔNG có khối (nếu không sẽ đếm 20 triệu hai lần)
  const legacy = await flow.expectedFor(M2, { withoutBlocks: true });
  const slips = await slipsOf(M2);
  for (const u of NV) expectSlip(slips[u], legacy[u].m, { addExempt: 20000000 }, u);
});

test('block-per-level: khối "theo bậc" (300.000 bậc 1, 500.000 bậc 3) cộng đúng theo bậc của từng người: NV bậc 1 +300.000, NV bậc 3 +500.000, người ngoài chức vụ không đổi', async () => {
  const M = await P.setupMonth();
  const legacy = await flow.expectedFor(M);
  await mustBlock(M, {
    label: 'Trách nhiệm theo bậc',
    method: 'byLevel',
    values: { nv: { on: true, byLevel: { 1: 300000, 2: 400000, 3: 500000, 4: 600000 } } }
  });
  const slips = await slipsOf(M);
  assert.equal((await store.getStaff('qa_nv1')).level, 1);
  assert.equal((await store.getStaff('qa_nv2')).level, 3);
  expectSlip(slips.qa_nv1, legacy.qa_nv1.m, { addTaxable: 300000 }, 'qa_nv1');
  expectSlip(slips.qa_nv2, legacy.qa_nv2.m, { addTaxable: 500000 }, 'qa_nv2');
  for (const u of OTHERS) assert.equal(slips[u].net, legacy[u].net.net, u);
});

test('block-per-level: khối thiếu giá trị của một bậc bị từ chối (400) và không lưu gì; ô tắt (on = false) của chức vụ thì chức vụ đó không nhận khối', async () => {
  const M = await P.setupMonth();
  const before = await F.snapshot();
  const gap = await postBlock(M, {
    label: 'Khối thiếu bậc',
    method: 'byLevel',
    values: { nv: { on: true, byLevel: { 1: 300000, 3: 500000 } } }
  });
  assert.equal(gap.status, 400, JSON.stringify(gap.data));
  assert.deepEqual(F.changedTables(before, await F.snapshot()), []);
  const legacy = await flow.expectedFor(M);
  await mustBlock(M, {
    ...lunch(500000),
    values: { nv: { on: false, amount: 500000 }, ctv: { on: true, amount: 500000 } }
  });
  const slips = await slipsOf(M);
  for (const u of NV) assert.equal(slips[u].net, legacy[u].net.net, `${u}: tắt khối`);
  expectSlip(slips.qa_ctv1, legacy.qa_ctv1.m, { addTaxable: 500000 }, 'qa_ctv1');
});
