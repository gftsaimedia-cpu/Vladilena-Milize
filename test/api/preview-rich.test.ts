'use strict';
// preview-ripple, preview-company-cost, preview-decreased, preview-below-minwage, preview-scope:
// POST /api/settings/params/preview giữ ok, errors, warnings, impact.people, impact.totals và THÊM trong `impact` (chỉ cộng thêm trường).
// Hình dạng:
//   ripple        { components: [{ id 1..8, key, label, before, after, delta }], gross, net, people: [{ username, delta: { wage, overtime, allowance, kpi, cut, advance, insurance, tax, gross, net } }] }
//   companyCost   { before, after, delta }                       tổng thu nhập + bảo hiểm công ty đóng (m.net.employer) của MỌI người
//   decreased     { count, people: [{ username, before, after, diff, decrease }] }
//   belowMinWage  { count, minWage, region, people: [{ username, base, minWage }] }   cảnh báo, không chặn
//   scope         { positions, inside, outside, insideAffected, outsideAffected, leak, outsidePeople }  khi gửi scope: { position }
// Số kỳ vọng tính bằng chính bộ máy chạy hai bộ tham số trên người bịa của period-flow (cùng cách test/api/settings-preview.test.ts).
const P = require('../helpers/position-api');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { closeTo } = require('../helpers/pay-oracle');

const { F, flow } = P;
const PEOPLE = flow.PEOPLE.map(p => p.username);

before(F.start);
after(F.stop);

// Kết quả của bộ máy cho cả bốn người với một bộ tham số (đầu vào đọc từ DB của tháng, như máy chủ)
const run = async (month?, over: any = {}) =>
  Object.fromEntries(
    await Promise.all(
      PEOPLE.map(async u => [
        u,
        P.Engine.computeMonth(await flow.legacyInput(u, month), { ...(await flow.paramsOf(month)), ...over }).m
      ])
    )
  );
const company = (m?) => m.net.gross + m.net.employer;
const preview = async (month?, changes?, extra: any = {}) =>
  await P.preview({ changes, effectiveMonth: month, ...extra });
const sumTrace = (m?, keys?) => keys.reduce((s, k) => s + m.trace[k], 0);

test('preview-ripple: tăng level.nv.3.base 7.000.000 → 8.000.000 cho đủ tám thành phần ①–⑧ và chuỗi lan truyền của người bị ảnh hưởng đúng số bộ máy (ngày công, phụ cấp, OT, tạm ứng, bảo hiểm, thực lĩnh)', async () => {
  const M = await P.setupMonth();
  const res = await preview(M, [{ key: 'level.nv.3.base', value: 8000000 }]);
  assert.equal(res.status, 200, JSON.stringify(res.data).slice(0, 300));
  assert.equal(res.data.ok, true, JSON.stringify(res.data.errors));
  const { ripple } = res.data.impact;
  assert.ok(ripple, 'có impact.ripple');
  assert.deepEqual(
    ripple.components.map(c => c.id),
    [1, 2, 3, 4, 5, 6, 7, 8],
    'đủ tám thành phần theo thứ tự ①–⑧'
  );
  for (const c of ripple.components)
    assert.ok(closeTo(c.after - c.before, c.delta, 1e-6), `${c.key}: delta = sau − trước`);
  const before = (await run(M))['qa_nv2'];
  const after = (await run(M, { 'level.nv.3.base': 8000000 }))['qa_nv2'];
  const row = ripple.people.find(p => p.username === 'qa_nv2');
  assert.ok(row, 'người bị ảnh hưởng nằm trong ripple.people');
  const d = row.delta;
  const delta = (a?, b?) => b - a;
  assert.ok(delta(before.trace.tienNgayCong, after.trace.tienNgayCong) > 0, 'điều kiện của bài');
  assert.ok(closeTo(d.wage, delta(before.trace.tienNgayCong, after.trace.tienNgayCong), 0.01), `ngày công ${d.wage}`);
  const overtime = ['lamBu', 'tienOt', 'tienLamLe'];
  assert.ok(
    closeTo(d.overtime, delta(sumTrace(before, overtime), sumTrace(after, overtime)), 0.01),
    `làm thêm ${d.overtime}`
  );
  const allowance = ['phuCapCa', 'gioNghiDem', 'phuCapDiLai', 'phuCapChuyenCan'];
  assert.ok(
    closeTo(d.allowance, delta(sumTrace(before, allowance), sumTrace(after, allowance)), 0.01),
    `phụ cấp ${d.allowance}`
  );
  assert.equal(d.advance, after.net.advance - before.net.advance, 'tạm ứng');
  assert.equal(d.insurance, after.net.insurance - before.net.insurance, 'bảo hiểm');
  assert.equal(d.tax, after.net.tax - before.net.tax, 'thuế');
  assert.equal(d.gross, after.net.gross - before.net.gross, 'tổng thu nhập');
  assert.equal(d.net, after.net.net - before.net.net, 'thực lĩnh');
  // một người đổi: tổng thành phần bằng đúng phần của người đó; người không bị ảnh hưởng không có mặt
  assert.deepEqual(
    ripple.people.map(p => p.username),
    ['qa_nv2']
  );
  const wage = ripple.components.find(c => c.key === 'wage');
  assert.ok(closeTo(wage.delta, d.wage, 0.01));
  assert.equal(ripple.net.delta, d.net);
});

test('preview-company-cost: companyCost = tổng thu nhập + bảo hiểm công ty đóng của mọi người: trước, sau và chênh khớp bộ máy từng đồng', async () => {
  const M = await P.setupMonth();
  const res = await preview(M, [{ key: 'level.nv.3.base', value: 8000000 }]);
  assert.equal(res.status, 200, JSON.stringify(res.data).slice(0, 300));
  const cost = res.data.impact.companyCost;
  const before = await run(M);
  const after = await run(M, { 'level.nv.3.base': 8000000 });
  const sum = (set?) => PEOPLE.reduce((s, u) => s + company(set[u]), 0);
  assert.equal(cost.before, sum(before), 'trước');
  assert.equal(cost.after, sum(after), 'sau');
  assert.equal(cost.delta, sum(after) - sum(before), 'chênh');
  // chỉ người đổi lương làm đổi chi phí; những người khác đứng yên
  assert.equal(company(after.qa_nv2) - company(before.qa_nv2), cost.delta);
  for (const u of ['qa_tts1', 'qa_ctv1', 'qa_nv1']) assert.equal(company(after[u]), company(before[u]), u);
});

test('preview-decreased: hạ hệ số OT ngày có lịch (ot.rate 1,5 → 1,2) liệt kê đúng những người BỊ GIẢM thực lĩnh với đúng mức giảm; tăng hệ số thì không ai', async () => {
  const M = await P.setupMonth();
  const before = await run(M);
  const after = await run(M, { 'ot.rate': 1.2 });
  const down = PEOPLE.filter(u => after[u].net.net < before[u].net.net).sort();
  assert.ok(down.length >= 1, 'điều kiện của bài: có người làm OT bị giảm');
  const res = await preview(M, [{ key: 'ot.rate', value: 1.2 }]);
  assert.equal(res.status, 200, JSON.stringify(res.data).slice(0, 300));
  const { decreased } = res.data.impact;
  assert.equal(decreased.count, down.length, 'số người bị giảm');
  assert.deepEqual(decreased.people.map(p => p.username).sort(), down);
  for (const p of decreased.people) {
    assert.equal(p.before, before[p.username].net.net, `${p.username}: trước`);
    assert.equal(p.after, after[p.username].net.net, `${p.username}: sau`);
    assert.equal(p.decrease, before[p.username].net.net - after[p.username].net.net, `${p.username}: mức giảm`);
  }
  const up = await preview(M, [{ key: 'ot.rate', value: 1.8 }]);
  assert.equal(up.data.impact.decreased.count, 0, 'tăng hệ số thì không ai bị giảm');
  assert.deepEqual(up.data.impact.decreased.people, []);
});

test('preview-below-minwage: level.nv.1.base 6.000.000 → 5.000.000 (dưới 5.310.000 vùng I) đưa NV bậc 1 hợp đồng dài đóng bảo hiểm vào belowMinWage; là cảnh báo (ok vẫn true); 6.500.000 thì không thêm ai', async () => {
  const M = await P.setupMonth();
  const res = await preview(M, [{ key: 'level.nv.1.base', value: 5000000 }]);
  assert.equal(res.status, 200, JSON.stringify(res.data).slice(0, 300));
  assert.equal(res.data.ok, true, 'cảnh báo, không chặn: ' + JSON.stringify(res.data.errors));
  const below = res.data.impact.belowMinWage;
  assert.equal(below.minWage, 5310000);
  // hợp đồng theo thâm niên: TTS làm đủ 3 tháng là hợp đồng dài và đã dưới mức tối thiểu từ trước (wasBelow); người mới dưới mức vì thay đổi chỉ có NV bậc 1
  assert.deepEqual(
    below.people.filter(p => !p.wasBelow).map(p => [p.username, p.base, p.minWage]),
    [['qa_nv1', 5000000, 5310000]]
  );
  assert.deepEqual(
    below.people.filter(p => p.wasBelow).map(p => p.username),
    ['qa_tts1']
  );
  // người trên mức tối thiểu không thuộc danh sách mới
  const fine = await preview(M, [{ key: 'level.nv.1.base', value: 6500000 }]);
  assert.deepEqual(
    fine.data.impact.belowMinWage.people.map(p => p.username),
    ['qa_tts1']
  );
  assert.equal(fine.data.impact.belowMinWage.people.filter(p => !p.wasBelow).length, 0);
});

test('preview-scope: gửi scope { position: "nv" } tách số người trong và ngoài chức vụ; thay đổi chạm người ngoài chức vụ (hạ ot.rate toàn cục) báo leak và liệt kê người đó, thay đổi chỉ của NV thì không', async () => {
  const M = await P.setupMonth();
  const inside = await preview(M, [{ key: 'level.nv.1.base', value: 6500000 }], { scope: { position: 'nv' } });
  assert.equal(inside.status, 200, JSON.stringify(inside.data).slice(0, 300));
  const scope = inside.data.impact.scope;
  assert.deepEqual(scope.positions, ['nv']);
  assert.equal(scope.inside, 2, 'hai NV (qa_nv1, qa_nv2)');
  assert.equal(scope.outside, 2, 'TTS và CTV');
  assert.equal(scope.insideAffected, 1, 'chỉ NV bậc 1 đổi');
  assert.equal(scope.outsideAffected, 0);
  assert.equal(scope.leak, false);
  assert.deepEqual(scope.outsidePeople, []);
  const wide = await preview(M, [{ key: 'ot.rate', value: 1.2 }], { scope: { position: 'nv' } });
  assert.equal(wide.status, 200);
  assert.equal(wide.data.impact.scope.leak, true, 'hạ hệ số OT toàn cục chạm CTV');
  assert.deepEqual(
    wide.data.impact.scope.outsidePeople.map(p => p.username),
    ['qa_ctv1']
  );
  assert.ok(wide.data.impact.scope.outsideAffected >= 1);
  // không gửi scope thì không có khối scope
  const plain = await preview(M, [{ key: 'ot.rate', value: 1.2 }]);
  assert.equal(plain.data.impact.scope, undefined);
});

test('preview-ripple: trường cũ của preview giữ nguyên (ok, errors, warnings, impact.people, impact.totals): thêm trường mới không đổi hợp đồng đang chạy', async () => {
  const M = await P.setupMonth();
  const res = await preview(M, [{ key: 'level.nv.3.base', value: 8000000 }]);
  assert.equal(res.status, 200, JSON.stringify(res.data).slice(0, 300));
  for (const name of ['ok', 'errors', 'warnings', 'impact']) assert.ok(Object.hasOwn(res.data, name), name);
  for (const name of ['month', 'people', 'totals']) assert.ok(Object.hasOwn(res.data.impact, name), `impact.${name}`);
  const row = res.data.impact.people.find(p => p.username === 'qa_nv2');
  const before = (await run(M))['qa_nv2'].net;
  const afterNet = (await run(M, { 'level.nv.3.base': 8000000 }))['qa_nv2'].net;
  assert.deepEqual(row.diff, { gross: afterNet.gross - before.gross, net: afterNet.net - before.net });
});
