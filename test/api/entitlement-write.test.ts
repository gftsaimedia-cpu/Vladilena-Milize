'use strict';
// matrix-cell-write, entitlement-override: bảng quyền lợi là MỘT GÓC NHÌN trên khoá có sẵn,
// nên ghi một ô là PUT /api/settings/params (đường ghi duy nhất: tháng áp dụng, lý do, nhật ký, hoàn tác), đọc lại ở GET /api/entitlements và có hiệu lực ở
// máy chủ và bộ máy. Ghi đè theo chức vụ (type.<mã>.ot.rate, advanceRate, overLimitHours; null = kế thừa) vẫn bị sàn luật chặn.
const P = require('../helpers/position-api');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { Engine, caseOf, clone } = require('../helpers/pay-oracle');
const { SHIFT } = require('../../src/engine/punch');

const { F, flow } = P;
const KNOWN = 'known-kpi-five-100-90-80-85-100';

before(F.start);
after(F.stop);

const matrix = async (month?) => (await F.call('GET', `/entitlements?month=${month}`)).data;

test('matrix-cell-write: ghi ô (đi lại của NV) 15 % → 20 % bằng PUT /api/settings/params: bảng đọc lại thấy 20 %, paramsRev tăng, tham số hiệu lực và bộ máy trả đi lại 6.000.000 × 20 % ÷ 26 = 46.153,85', async () => {
  const M = await P.setupMonth();
  const before = await matrix(M);
  assert.ok(P.hasNumber(before.cells, 0.15), 'ô đi lại 15 % trước khi ghi');
  const save = await P.saveChanges([{ key: 'type.nv.travel', value: 0.2 }], { month: M });
  assert.equal(save.status, 200, JSON.stringify(save.data));
  const after = await matrix(M);
  assert.ok(P.hasNumber(after.cells, 0.2), 'ô đi lại 20 % sau khi ghi');
  assert.ok(after.paramsRev > before.paramsRev, 'paramsRev tăng sau mỗi lần ghi');
  assert.equal(after.paramsRev, await P.paramsRevOf(M));
  assert.equal((await P.paramsOf(M))['type.nv.travel'], 0.2);
  const input = clone(caseOf(KNOWN).input);
  const { m } = Engine.create(await P.paramsOf(M)).computeMonth(input);
  assert.equal(m.travel, Math.round((6000000 * 0.2) / 26));
  assert.equal(m.travel, 46154);
});

test('matrix-cell-write: tắt ô OT của NV (type.nv.benefit.ot = false) thì khai OT của NV vẫn lưu kèm cảnh báo BENEFIT_NOT_ALLOWED, còn CTV khai không cảnh báo; nhật ký ghi lý do', async () => {
  const M = await P.setupMonth();
  const audit0 = (await P.auditRows('param.set')).length;
  const save = await P.saveChanges([{ key: 'type.nv.benefit.ot', value: false }], { month: M });
  assert.equal(save.status, 200, JSON.stringify(save.data));
  assert.ok((await P.auditRows('param.set')).length > audit0);
  const date = P.firstDow(M, 2);
  const otDay = (person?) => {
    const [shiftIn, shiftOut] = SHIFT[person];
    const extraOut = `${String((Number(shiftOut.slice(0, 2)) + 1) % 24).padStart(2, '0')}:${shiftOut.slice(3)}`;
    return { kind: 'work', in: shiftIn, out: shiftOut, preset: person, extraKind: 'ot', extraOut };
  };
  const put = async (who?, shift?) =>
    await F.call('PUT', '/sheet', { who, body: { month: M, days: { [date]: otDay(shift) } } });
  const nv = await put('qa_nv2', 'f2'); // NV bậc 3, ca f2
  assert.equal(nv.status, 200, JSON.stringify(nv.data));
  assert.ok(
    nv.data.warnings.some(w => w.code === 'BENEFIT_NOT_ALLOWED'),
    JSON.stringify(nv.data.warnings)
  );
  const ctv = await put('qa_ctv1', 'n2'); // CTV, ca n2
  assert.equal(ctv.status, 200, JSON.stringify(ctv.data));
  assert.ok(!(ctv.data.warnings || []).some(w => w.code === 'BENEFIT_NOT_ALLOWED'), JSON.stringify(ctv.data.warnings));
});

test('matrix-cell-write: chỉ người có config.payroll ghi được ô (C&B, Admin); nhân sự 403, chưa đăng nhập 401, Kế toán chỉ có config.legal nên 403 ở khoá không phải luật; 403 không ghi gì', async () => {
  const M = await P.setupMonth();
  await P.grant('qa_nv2', 'cb');
  await P.grant('qa_ctv1', 'accounting');
  const before = await F.snapshot();
  const body = {
    changes: [{ key: 'type.nv.travel', value: 0.2 }],
    effectiveMonth: M,
    reason: 'Thử quyền ghi ô',
    expectedRev: await P.paramsRevOf(M)
  };
  for (const [who, status] of [
    ['qa_nv1', 403],
    [null, 401],
    ['qa_ctv1', 403]
  ])
    assert.equal((await F.call('PUT', '/settings/params', { who, body })).status, status, String(who));
  assert.deepEqual(F.changedTables(before, await F.snapshot()), []);
  assert.equal((await F.call('PUT', '/settings/params', { who: 'qa_nv2', body })).status, 200, 'C&B ghi được');
});

test('entitlement-override: ghi đè theo chức vụ type.nv.ot.rate dưới sàn luật (1,4 < 1,5, Bộ luật Lao động 2019 Điều 98) vẫn lưu, kèm cảnh báo PARAM_BELOW_LEGAL_FLOOR; 2,5 được; null (kế thừa) được', async () => {
  const M = await P.setupMonth();
  const low = await P.saveChanges([{ key: 'type.nv.ot.rate', value: 1.4 }], { month: M });
  assert.equal(low.status, 200, JSON.stringify(low.data));
  assert.ok(
    low.data.warnings.some(w => w.code === 'PARAM_BELOW_LEGAL_FLOOR'),
    JSON.stringify(low.data.warnings)
  );
  const ok = await P.saveChanges([{ key: 'type.nv.ot.rate', value: 2.5 }], { month: M });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  const inherit = await P.saveChanges([{ key: 'type.nv.ot.rate', value: null }], { month: M });
  assert.equal(inherit.status, 200, JSON.stringify(inherit.data));
});

test('entitlement-override: type.nv.advanceRate = 0,5 lưu qua API làm tạm ứng của hai NV trên phiếu giảm theo 50 % (đúng bộ máy chạy bộ tham số đó), TTS và CTV giữ tạm ứng cũ', async () => {
  const M = await P.setupMonth();
  const legacy = await flow.expectedFor(M);
  const save = await P.saveChanges([{ key: 'type.nv.advanceRate', value: 0.5 }], { month: M });
  assert.equal(save.status, 200, JSON.stringify(save.data));
  assert.equal((await P.paramsOf(M))['type.nv.advanceRate'], 0.5, 'bộ tham số hiệu lực của tháng mang ghi đè');
  await P.advance(M, 'calculated');
  const slips = (await flow.payslipsOf(M)).slips;
  // Tạm ứng chỉ trừ vào phiếu khi Admin đã duyệt yêu cầu của tháng (không duyệt thì 0), nên phiếu so với bộ máy chạy đúng bộ tham số đó,
  // còn tác động của ghi đè đo ở mức tạm ứng tối đa theo quy tắc (trace.tamUngToiDa).
  for (const u of ['qa_nv1', 'qa_nv2']) {
    const expected = await flow.computeFor(u, M);
    assert.equal(slips[u].advance, expected.net.advance, `${u}: tạm ứng`);
    assert.equal(slips[u].net, expected.net.net, `${u}: thực lĩnh`);
    const before = legacy[u].m;
    assert.ok(before.trace.tamUngToiDa > 0, `${u}: có mức tạm ứng tối đa để so`);
    assert.ok(
      Math.abs(expected.trace.tamUngToiDa - Math.round(before.advanceBase * 0.5)) <= 1,
      `${u}: mức tạm ứng tối đa giảm còn 50 % cơ sở tạm ứng`
    );
  }
  for (const u of ['qa_tts1', 'qa_ctv1'])
    assert.equal((await flow.computeFor(u, M)).trace.tamUngToiDa, legacy[u].m.trace.tamUngToiDa, `${u}: không đổi`);
});
