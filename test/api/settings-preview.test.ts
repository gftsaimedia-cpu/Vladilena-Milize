'use strict';
// Xem trước tác động của một lần Lưu: POST /api/settings/params/preview
//   { changes:[{key,value}], effectiveMonth } → 200 LUÔN (lỗi nằm trong errors, cùng mã như PUT):
//   { ok, errors, warnings, impact:{ month, people:[{username,name,before,after,diff}], totals }, previewToken }
//   - quyền: config.read và payroll.view phạm vi all (và salary.read): Admin, C&B, Kế toán; hr, quản lý, nhân sự là 403, ẩn danh 401;
//   - people sắp theo |diff| giảm dần và cắt ở trần (system.params.previewMaxPeople, mặc định 50); totals luôn tính cả người bị cắt;
//   - KHÔNG ghi bảng nào, không ghi nhật ký, không đổi params_mode hay config_rev; xem trước chạy cả khi chế độ còn defaults-only.
// Test gắn S.READY chạy như `todo` khi chưa sẵn sàng (test/helpers/settings-api.ts → READY); RED=1 để thấy từng test đỏ vì gì.
const S = require('../helpers/settings-api');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../../src/engine/payroll-engine');

const { F, store, flow } = S;
const monthOf = S.monthPool();

before(F.start);
after(F.stop);

const ACCOUNT = {
  staff: 'qa_plain',
  hr: 'qa_nv2',
  manager: 'qa_tts1',
  accounting: 'qa_ctv1',
  cb: 'qa_nv1',
  admin: 'admin'
};
async function setup(month?) {
  await S.seed(month);
  await F.person('qa_plain', 'staff', { type: 'nv', level: 1, startDate: '2026-01-05' });
  for (const role of ['hr', 'manager', 'accounting', 'cb']) await S.grant(ACCOUNT[role], role);
  await S.setMode('defaults-only');
}
const state = async () => ({
  tables: await F.snapshot(),
  configRev: await S.configRev(),
  mode: await store.params.getMode()
});
const MAX_PEOPLE = () => S.DEFAULTS['system.params.previewMaxPeople'] ?? 50;
// Thực lĩnh và tổng thu nhập của một người theo bộ máy với một bộ tham số: chuẩn để so với before/after của xem trước
const engineNet = async (username?, month?, params?) =>
  Engine.computeMonth(await flow.legacyInput(username, month), params).m.net;
const body = (changes?, month?) => ({ changes, effectiveMonth: month });
const codesOf = (data?) => (data.errors || []).map(e => e.code);

test(
  'R1 preview: đổi khoản ảnh hưởng tiền cho 200 { ok, errors, warnings, impact, previewToken }; before/after/diff của người bị ảnh hưởng bằng đúng bộ máy chạy hai bộ tham số',
  S.readyWith(S.wiredMoneyKey(), 'khoá tiền đã nối (wired) cho NV'),
  async () => {
    const M = monthOf();
    await setup(M);
    const money = await S.wiredMoneyKey();
    const res = await S.preview(body([{ key: money.key, value: money.value }], M));
    assert.equal(res.status, 200, JSON.stringify(res.data).slice(0, 400));
    assert.equal(res.data.ok, true, JSON.stringify(res.data.errors));
    assert.deepEqual(res.data.errors, []);
    assert.ok(Array.isArray(res.data.warnings));
    const { impact } = res.data;
    assert.equal(impact.month, M);
    assert.ok(Array.isArray(impact.people) && impact.people.length >= 1);
    // totals: { people, affected, truncated, before, after, delta }
    for (const key of ['people', 'affected', 'truncated', 'before', 'after', 'delta'])
      assert.ok(Object.hasOwn(impact.totals, key), `totals.${key}`);
    const row = impact.people.find(p => p.username === money.user);
    assert.ok(row, 'người dùng khoá đó có trong danh sách');
    assert.equal(typeof row.name, 'string');
    const before = await engineNet(money.user, M, await flow.paramsOf(M));
    const after = await engineNet(money.user, M, { ...(await flow.paramsOf(M)), [money.key]: money.value });
    assert.notEqual(after.net, before.net, 'điều kiện của bài: đổi khoá làm đổi thực lĩnh');
    // before/after/diff là đối tượng { gross, net }
    assert.deepEqual(row.before, { gross: before.gross, net: before.net });
    assert.deepEqual(row.after, { gross: after.gross, net: after.net });
    assert.deepEqual(row.diff, { gross: after.gross - before.gross, net: after.net - before.net });
    // sắp theo |diff| giảm dần
    const diffs = impact.people.map(p => Math.abs(p.diff.net));
    assert.deepEqual(
      diffs,
      [...diffs].sort((a: any, b: any) => b - a)
    );
    // người không bị ảnh hưởng (loại khác) có diff 0 hoặc không có mặt
    for (const p of impact.people.filter(p => ['qa_ctv1', 'qa_tts1'].includes(p.username)))
      assert.deepEqual(p.diff, { gross: 0, net: 0 }, p.username);
    assert.ok(impact.totals.affected >= 1);
  }
);

test(
  'R1 preview: không ghi gì: không bảng nào, không nhật ký, không bật params_mode, không đổi config_rev, kể cả khi chế độ còn defaults-only',
  S.readyWith(S.wiredMoneyKey(), 'khoá tiền đã nối (wired) cho NV'),
  async () => {
    const M = monthOf();
    await setup(M);
    const money = await S.wiredMoneyKey();
    const before = await state();
    for (const mode of ['defaults-only', 'active']) {
      await S.setMode(mode);
      const snapshot = await state();
      const ok = await S.preview(body([{ key: money.key, value: money.value }], M));
      assert.equal(ok.status, 200);
      assert.equal(ok.data.ok, true, mode);
      const bad = await S.preview(body([{ key: 'khong.co.khoa', value: 1 }], M));
      assert.equal(bad.status, 200);
      const after = await state();
      assert.deepEqual(F.changedTables(snapshot.tables, after.tables), [], `${mode}: không bảng nào đổi`);
      assert.equal(after.mode, mode);
      assert.equal(after.configRev, snapshot.configRev);
    }
    assert.equal(await S.rowCount(), 0, 'không có dòng param_versions');
    assert.equal((await S.auditRows()).length, before.tables.audit_log.rows, 'nhật ký không thêm dòng');
  }
);

test(
  'R1 preview: lỗi vẫn là 200 { ok:false, errors } với đúng mã của PUT: khoá lạ, giá trị sai, khoá locked, chưa nối',
  S.READY,
  async () => {
    const M = monthOf();
    await setup(M);
    const base = await S.adminKey();
    const unknown = await S.preview(body([{ key: 'khong.co.khoa', value: 1 }], M));
    assert.equal(unknown.status, 200);
    assert.equal(unknown.data.ok, false);
    assert.deepEqual(codesOf(unknown.data), ['PARAM_UNKNOWN_KEY']);
    assert.equal(unknown.data.errors[0].key, 'khong.co.khoa');
    const invalid = await S.preview(body([{ key: base.key, value: 'abc' }], M));
    assert.equal(invalid.status, 200);
    assert.deepEqual(codesOf(invalid.data), ['PARAM_INVALID_VALUE']);
    assert.equal(invalid.data.errors[0].key, base.key);
    // lô nhiều khoá: mọi lỗi cùng được trả (không dừng ở lỗi đầu), khoá tốt không tạo lỗi
    const many = await S.preview(
      body(
        [
          { key: base.key, value: base.value },
          { key: 'khong.co.khoa', value: 1 },
          { key: base.key === 'level.nv.1.base' ? 'level.nv.2.base' : 'level.nv.1.base', value: -1 }
        ],
        M
      )
    );
    assert.equal(many.status, 200);
    assert.equal(many.data.ok, false);
    assert.ok(
      codesOf(many.data).includes('PARAM_UNKNOWN_KEY') && codesOf(many.data).includes('PARAM_INVALID_VALUE'),
      JSON.stringify(many.data.errors)
    );
    const locked = await S.lockedKey();
    if (locked) {
      const res = await S.preview(body([{ key: locked.key, value: locked.value }], M));
      assert.equal(res.status, 200);
      assert.equal(res.data.ok, false);
      assert.ok(
        ['PARAM_LOCKED', 'FORBIDDEN_CAP'].some(c => codesOf(res.data).includes(c)),
        JSON.stringify(res.data.errors)
      );
    }
    const notWired = await S.notWiredKey();
    if (notWired) {
      const res = await S.preview(body([{ key: notWired.key, value: notWired.value }], M));
      assert.equal(res.status, 200);
      // xem trước KHÔNG báo PARAM_NOT_WIRED trong errors; liệt kê khoá ở `notWired` và không tính tác động (PUT mới trả 400 PARAM_NOT_WIRED)
      assert.ok((res.data.notWired || []).includes(notWired.key), JSON.stringify(res.data));
      assert.equal(res.data.impact, null);
    }
  }
);

test(
  'R1 preview: phương án chưa dùng được là lỗi trong errors; sàn cứng là cảnh báo PARAM_BELOW_LEGAL_FLOOR và sàn mềm là cảnh báo PARAM_FLOOR_ACK_REQUIRED (ok true)',
  S.readyWith(S.hardFloorKey() && S.softFloorKey(), 'khoá có sàn cứng và khoá có sàn mềm'),
  async () => {
    const M = monthOf();
    await setup(M);
    const hard = await S.hardFloorKey();
    const soft = await S.softFloorKey();
    const h = await S.preview(body([{ key: hard.key, value: hard.value }], M));
    assert.equal(h.status, 200);
    assert.equal(h.data.ok, true, JSON.stringify(h.data.errors));
    assert.ok(
      h.data.warnings.some(x => x.code === 'PARAM_BELOW_LEGAL_FLOOR'),
      JSON.stringify(h.data.warnings)
    );
    const w = await S.preview(body([{ key: soft.key, value: soft.value }], M));
    assert.equal(w.status, 200);
    assert.equal(w.data.ok, true, JSON.stringify(w.data.errors));
    assert.ok(
      w.data.warnings.some(x => x.code === 'PARAM_FLOOR_ACK_REQUIRED'),
      JSON.stringify(w.data.warnings)
    );
    const option = S.unavailableOptionKey();
    if (option) {
      const o = await S.preview(body([{ key: option.key, value: option.value }], M));
      assert.equal(o.status, 200);
      assert.ok(codesOf(o.data).includes('PARAM_OPTION_UNAVAILABLE'), JSON.stringify(o.data.errors));
    }
  }
);

test('R1 preview: tháng hiệu lực đã khoá là 200 ok:true kèm cảnh báo PERIOD_LOCKED', S.READY, async () => {
  await S.setupMonth('2026-10', 'calculated');
  await S.setMode('defaults-only');
  const base = await S.adminKey();
  const res = await S.preview(body([{ key: base.key, value: base.value }], '2026-10'));
  assert.equal(res.status, 200);
  assert.equal(res.data.ok, true, JSON.stringify(res.data.errors));
  const locked = res.data.warnings.find(e => e.code === 'PERIOD_LOCKED');
  assert.ok(locked, JSON.stringify(res.data.warnings));
});

test(
  'R1 preview: quyền — Admin, C&B, Kế toán xem trước được; hr, quản lý, nhân sự là 403 FORBIDDEN_CAP; ẩn danh 401; C&B xem trước khoá pháp lý nhận FORBIDDEN_CAP trong errors',
  S.READY,
  async () => {
    const M = monthOf();
    await setup(M);
    const base = await S.adminKey();
    const request = body([{ key: base.key, value: base.value }], M);
    for (const role of ['admin', 'cb', 'accounting']) {
      const res = await S.preview(request, ACCOUNT[role]);
      assert.equal(res.status, 200, `${role}: ${JSON.stringify(res.data).slice(0, 200)}`);
    }
    for (const role of ['hr', 'manager', 'staff']) {
      const res = await S.preview(request, ACCOUNT[role]);
      assert.equal(res.status, 403, role);
      assert.equal(res.data.code, 'FORBIDDEN_CAP', role);
      assert.equal(JSON.stringify(res.data).includes('qa_'), false, `${role}: không lộ tên người`);
    }
    assert.equal((await S.preview(request, null)).status, 401);
    const acc = await S.accountingKey();
    if (acc) {
      const cb = await S.preview(body([{ key: acc.key, value: acc.value }], M), ACCOUNT.cb);
      assert.equal(cb.status, 200);
      assert.ok(codesOf(cb.data).includes('FORBIDDEN_CAP'), JSON.stringify(cb.data.errors));
      const accounting = await S.preview(request, ACCOUNT.accounting);
      assert.ok(
        codesOf(accounting.data).includes('FORBIDDEN_CAP'),
        'Kế toán xem trước khoá Admin bị FORBIDDEN_CAP trong errors'
      );
    }
  }
);

test(
  'R1 preview: people cắt ở trần và sắp theo |diff| giảm dần; totals vẫn tính cả người bị cắt',
  S.readyWith(S.wiredMoneyKey(), 'khoá tiền đã nối (wired) cho NV'),
  async () => {
    const M = monthOf();
    await setup(M);
    const money = await S.wiredMoneyKey();
    const cap = MAX_PEOPLE();
    const extra = cap + 8;
    const PunchRules = require('../../src/engine/punch');
    const [tin, tout] = PunchRules.SHIFT.n1;
    const monday = S.firstDow(M, 1);
    for (let i = 0; i < extra; i++) {
      const name = `qa_ext${String(i).padStart(3, '0')}`;
      await F.person(name, 'staff', { type: 'nv', level: 1, shiftCode: 'n1', startDate: '2026-01-05' });
      const days = { [monday]: { kind: 'work', in: tin, out: tout, preset: 'n1' } };
      const put = await F.call('PUT', '/sheet', { who: name, body: { month: M, days } });
      assert.equal(put.status, 200, JSON.stringify(put.data));
    }
    const res = await S.preview(body([{ key: money.key, value: money.value }], M));
    assert.equal(res.status, 200);
    const { people, totals } = res.data.impact;
    assert.equal(people.length, cap, `people cắt ở trần ${cap}`);
    assert.ok(totals.affected >= extra, `totals.affected ${totals.affected} phải gồm cả người bị cắt (≥ ${extra})`);
    assert.ok(totals.people >= extra + 1, 'totals.people là tổng số người, không phải số người được liệt kê');
    const diffs = people.map(p => Math.abs(p.diff.net));
    assert.deepEqual(
      diffs,
      [...diffs].sort((a: any, b: any) => b - a)
    );
  }
);

test(
  'R1 preview (THIẾT KẾ 3.5, chưa đạt): phản hồi có previewToken chuỗi ký (HMAC) để PUT sau này ép',
  { todo: 'save.js → preview chưa trả previewToken (hợp đồng R1: có trường, chưa ép)' },
  async () => {
    const M = monthOf();
    await setup(M);
    const base = await S.adminKey();
    const res = await S.preview(body([{ key: base.key, value: base.value }], M));
    assert.equal(typeof res.data.previewToken, 'string');
    assert.ok(res.data.previewToken.length > 20);
  }
);
