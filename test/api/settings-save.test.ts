'use strict';
// Đường ghi cài đặt, nhóm GHI THÀNH CÔNG:
//   - lần ghi đầu bật params_mode = active (có nhật ký); phản hồi { paramsRev, paramsHash, saved:[{key,value,version,effectiveMonth,previous}] };
//   - nhật ký MỘT dòng cho mỗi khoá trong cùng giao dịch với dòng param_versions và với config_rev (lỗi nhật ký làm hoàn tác cả lô);
//   - hai lần Lưu cùng expectedRev: một thắng, một nhận 409 PARAMS_STALE, không ghi dở;
//   - tháng hiệu lực mặc định là tháng chưa chốt sớm nhất; sàn mềm đi qua khi có acknowledge {key, code}; cảnh báo PARAM_LATER_VERSION_EXISTS.
// Các lỗi (không lưu gì) ở settings-save-failures.test.ts; tác động lan ra ước tính, AI, tính lương ở save-applies-everywhere.test.ts.
// Dòng param_versions chỉ-thêm-dòng nên rò sang test sau: mỗi test dùng tháng riêng và chọn giá trị KHÁC giá trị đang hiệu lực
// (S.differing) thay vì giả định mặc định. Test đầu tiên của file phải là test "lần ghi đầu bật active".
// Chạy như `todo` khi cờ READY của test/helpers/settings-api.ts chưa bật; RED=1 ép chạy như test thường để thấy từng test đỏ vì gì.
const S = require('../helpers/settings-api');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const audit = require('../../src/platform/audit');

const { F, store } = S;
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
const KEYS = S.adminKeys();
const ONE = S.readyWith(KEYS[0], 'khoá số Admin sửa được và đã nối');
const TWO = S.readyWith(KEYS.length >= 2, 'hai khoá số Admin sửa được và đã nối');
const HISTORY = ONE.todo
  ? ONE
  : S.pendingUnless(
      'GET /settings/params/history chưa có chính sách quyền trong src/platform/authz.ts (TK 4.7, ngoài hợp đồng R1)',
      S.mentions('src/platform/authz.ts', /settings\/params\/history/)
    );
// Tháng của mỗi test chạy tới 2027: ngày vào làm là đầu năm của tháng đó để số phép cộng tay 30 ngày nằm trong quỹ phép của đúng năm đó
const startOf = (month?) => (month < '2027' ? '2026-01-05' : `${month.slice(0, 4)}-01-01`);
async function setup(month?) {
  await S.seed(month, { startDate: startOf(month) });
  await F.person('qa_plain', 'staff', { type: 'nv', level: 1, startDate: startOf(month) });
  for (const role of ['hr', 'manager', 'accounting', 'cb']) await S.grant(ACCOUNT[role], role);
}
const modeRows = async () =>
  (await S.auditRows()).filter(r => /mode/i.test(r.action) || /params_mode/.test(r.entity_id || ''));

test(
  'R1 save: lần ghi đầu bật params_mode = active (có nhật ký, có lý do); phản hồi đủ { paramsRev, paramsHash, saved }; lần ghi sau không bật lại',
  TWO,
  async () => {
    const M = monthOf();
    await setup(M);
    await S.setMode('defaults-only');
    const [base, other] = KEYS;
    assert.equal((await S.version()).data.mode, 'defaults-only');
    const revBefore = await S.configRev();
    const [value] = await S.differing(base, M);
    const res = await S.saveChanges([{ key: base.key, value }], { month: M });
    assert.equal(res.status, 200, JSON.stringify(res.data).slice(0, 400));
    assert.ok(Number.isInteger(res.data.paramsRev) && res.data.paramsRev >= 1);
    assert.match(res.data.paramsHash, /^[0-9a-f]{64}$/);
    assert.equal(res.data.saved.length, 1);
    const saved = res.data.saved[0];
    assert.deepEqual([saved.key, saved.value, saved.effectiveMonth], [base.key, value, M]);
    assert.ok(Number.isInteger(saved.version) && saved.version >= 1);
    assert.deepEqual(
      [saved.previous.value, saved.previous.version],
      [base.was, 0],
      'trước đó là mặc định của mã (phiên bản 0)'
    );
    assert.equal(await store.params.getMode(), 'active');
    const version = (await S.version()).data;
    assert.equal(version.mode, 'active');
    assert.ok(version.configRev > revBefore, `config_rev ${revBefore} → ${version.configRev}`);
    if ('configRev' in res.data) assert.equal(res.data.configRev, version.configRev);
    const view = (await S.paramsView(M)).data;
    assert.equal(view.paramsRev, res.data.paramsRev);
    assert.equal(view.paramsHash, res.data.paramsHash);
    assert.equal(view.mode, 'active');
    const modes = await modeRows();
    assert.ok(modes.length >= 1, 'lần ghi đầu phải ghi nhật ký việc bật active');
    assert.equal((await modes.at(-1)).actor, 'admin');
    assert.ok((await modes.at(-1)).reason, 'nhật ký đổi chế độ có lý do');
    assert.equal((await S.auditRows('param.set')).filter(r => r.entity_id === base.key).length, 1);
    // lần ghi sau không bật lại chế độ
    const modeCount = (await modeRows()).length;
    const [otherValue] = await S.differing(other, M);
    const again = await S.saveChanges([{ key: other.key, value: otherValue }], { month: M });
    assert.equal(again.status, 200, JSON.stringify(again.data).slice(0, 300));
    assert.equal((await modeRows()).length, modeCount, 'không bật lại active');
    assert.ok(again.data.paramsRev > res.data.paramsRev);
  }
);

test(
  'R1 save: nhật ký MỘT dòng param.set cho mỗi khoá (khoá, trước/sau, tháng, lý do, mức pay, cùng mã yêu cầu), dòng param_versions khớp, chuỗi băm nhật ký còn nguyên',
  TWO,
  async () => {
    const M = monthOf();
    await setup(M);
    const [base, other] = KEYS;
    const [v1] = await S.differing(base, M);
    const [v2] = await S.differing(other, M);
    const rows0 = await S.rowCount();
    const audit0 = (await S.auditRows('param.set')).length;
    const res = await S.saveChanges(
      [
        { key: base.key, value: v1 },
        { key: other.key, value: v2 }
      ],
      { month: M, reason: 'Điều chỉnh hai khoản cùng lúc' }
    );
    assert.equal(res.status, 200, JSON.stringify(res.data).slice(0, 300));
    assert.equal(res.data.saved.length, 2);
    assert.equal(await S.rowCount(), rows0 + 2);
    const newRows = (await S.paramRows()).slice(rows0);
    assert.deepEqual(newRows.map(r => r.key).sort(), [base.key, other.key].sort());
    for (const row of newRows) {
      assert.equal(row.effective_month, M);
      assert.equal(row.created_by, 'admin');
      assert.equal(row.reason, 'Điều chỉnh hai khoản cùng lúc');
    }
    if ('batch_id' in newRows[0]) assert.equal(new Set<any>(newRows.map(r => r.batch_id)).size, 1, 'cùng một batch_id');
    const rows = (await S.auditRows('param.set')).slice(audit0);
    assert.equal(rows.length, 2, 'đúng một dòng nhật ký cho mỗi khoá');
    assert.deepEqual(rows.map(r => r.entity_id).sort(), [base.key, other.key].sort());
    for (const r of rows) {
      assert.equal(r.entity_kind, 'param');
      assert.equal(r.actor, 'admin');
      assert.equal(r.reason, 'Điều chỉnh hai khoản cùng lúc');
      assert.equal(r.sensitivity, 'pay', 'khoá nhóm lương, phụ cấp dùng mức pay');
      assert.ok(r.before && r.after, 'có trước và sau');
      assert.equal(r.after.value, res.data.saved.find(s => s.key === r.entity_id).value);
      assert.equal(r.after.effectiveMonth, M);
    }
    assert.ok(rows[0].request_id);
    assert.equal(rows[0].request_id, rows[1].request_id, 'hai dòng của một lô cùng mã yêu cầu');
    assert.equal((await F.call('GET', '/audit/verify')).data.ok, true);
  }
);

test(
  'R1 save: dòng param_versions, nhật ký và config_rev cùng một giao dịch: lỗi khi ghi nhật ký làm hoàn tác cả lô (không dòng tham số, không config_rev, không bật chế độ)',
  TWO,
  async () => {
    const M = monthOf();
    await setup(M);
    await S.setMode('defaults-only');
    const [base, other] = KEYS;
    const [v1] = await S.differing(base, M);
    const [v2] = await S.differing(other, M);
    const before = { tables: await F.snapshot(), configRev: await S.configRev(), mode: await store.params.getMode() };
    const original = audit.write;
    let calls = 0;
    audit.write = async (...args) => {
      calls++;
      if (calls >= 2) throw new Error('lỗi ghi nhật ký giả để thử hoàn tác');
      return await original(...args);
    };
    let res;
    try {
      res = await S.saveChanges(
        [
          { key: base.key, value: v1 },
          { key: other.key, value: v2 }
        ],
        { month: M }
      );
    } finally {
      audit.write = original;
    }
    assert.ok(calls >= 2, `nhật ký phải được gọi trong giao dịch (gọi ${calls} lần)`);
    assert.ok(res.status >= 500, `lỗi nhật ký phải là lỗi máy chủ, không phải 200: ${res.status}`);
    assert.deepEqual(F.changedTables(before.tables, await F.snapshot()), [], 'không bảng nào đổi');
    assert.equal(await S.configRev(), before.configRev);
    assert.equal(await store.params.getMode(), before.mode);
  }
);

test(
  'R1 save: hai lần Lưu cùng expectedRev gửi đồng thời — đúng một thắng (200), một nhận 409 PARAMS_STALE kèm paramsRev mới; chỉ dòng của bên thắng được ghi',
  TWO,
  async () => {
    const M = monthOf();
    await setup(M);
    const [base, other] = KEYS;
    const [v1] = await S.differing(base, M);
    const [v2] = await S.differing(other, M);
    const rev = await S.paramsRevOf(M);
    const rows0 = await S.rowCount();
    const send = async (changes?) => await S.save({ changes, effectiveMonth: M, reason: S.REASON, expectedRev: rev });
    const [a, b] = await Promise.all([
      await send([{ key: base.key, value: v1 }]),
      await send([{ key: other.key, value: v2 }])
    ]);
    assert.deepEqual([a.status, b.status].sort(), [200, 409], `${JSON.stringify([a.data, b.data]).slice(0, 400)}`);
    const winner = a.status === 200 ? a : b;
    const loser = a.status === 200 ? b : a;
    assert.equal(loser.data.code, 'PARAMS_STALE');
    assert.equal(loser.data.paramsRev, winner.data.paramsRev, 'bên thua thấy paramsRev của bên thắng');
    assert.equal(await S.rowCount(), rows0 + winner.data.saved.length, 'chỉ dòng của bên thắng');
    assert.ok((await S.paramRows()).slice(rows0).every(r => winner.data.saved.some(s => s.key === r.key)));
    // bên thua tải lại rồi lưu được
    const mine = loser === a ? { key: base.key, value: v1 } : { key: other.key, value: v2 };
    const retry = await S.saveChanges([mine], { month: M });
    assert.equal(retry.status, 200, JSON.stringify(retry.data).slice(0, 300));
    assert.ok(retry.data.paramsRev > winner.data.paramsRev);
  }
);

test(
  'R1 save: hai lần Lưu cùng một khoá cùng expectedRev: một thắng, giá trị của bên thua không bao giờ lọt vào DB',
  ONE,
  async () => {
    const M = monthOf();
    await setup(M);
    const base = KEYS[0];
    const [v1, v2] = await S.differing(base, M, 2);
    const rev = await S.paramsRevOf(M);
    const rows0 = await S.rowCount();
    const send = async (value?) =>
      await S.save({ changes: [{ key: base.key, value }], effectiveMonth: M, reason: S.REASON, expectedRev: rev });
    const [a, b] = await Promise.all([await send(v1), await send(v2)]);
    assert.deepEqual([a.status, b.status].sort(), [200, 409]);
    const stored = (await S.paramRows()).slice(rows0);
    assert.equal(stored.length, 1);
    assert.equal(JSON.parse(stored[0].value_json), a.status === 200 ? v1 : v2);
  }
);

test(
  'R1 save: bỏ trống effectiveMonth thì dùng tháng chưa chốt sớm nhất tính từ tháng quản lý đầu tiên (earliestOpenMonth); phản hồi ghi fromMonth',
  ONE,
  async () => {
    const A = monthOf();
    await S.setupMonth(A, 'calculated'); // trước A còn tháng mở nên tháng mặc định có thể nhỏ hơn A: so với earliestOpenMonth()
    const base = KEYS[0];
    const earliest = await require('../../src/params/save').earliestOpenMonth();
    const [value] = await S.differing(base, earliest);
    const rev = await S.paramsRevOf(earliest);
    const res = await S.save({ changes: [{ key: base.key, value }], reason: S.REASON, expectedRev: rev });
    assert.equal(res.status, 200, JSON.stringify(res.data).slice(0, 300));
    assert.equal(res.data.saved[0].effectiveMonth, earliest);
    assert.equal(res.data.fromMonth, earliest);
    assert.equal(S.valueOfKey((await S.paramsView(earliest)).data, base.key), value);
  }
);

test(
  'R1 save: khoá do mô-đun khác sở hữu (công tắc ngày, GPS, ngày lễ) là 400 PARAM_BACKED_BY_SETTINGS và không lưu gì',
  S.readyWith(S.backedKey(), 'khoá có backing settings:*'),
  async () => {
    const M = monthOf();
    await setup(M);
    const found = await S.backedKey();
    const before = await F.snapshot();
    const res = await S.saveChanges([{ key: found.key, value: found.value }], { month: M });
    assert.equal(res.status, 400, JSON.stringify(res.data).slice(0, 300));
    assert.ok(JSON.stringify(res.data).includes('PARAM_BACKED_BY_SETTINGS'));
    assert.deepEqual(F.changedTables(before, await F.snapshot()), []);
  }
);

test(
  'R1 save: giá trị bằng giá trị đang dùng là 400 PARAM_NO_CHANGES (kèm skipped), không ghi gì, không tăng config_rev',
  ONE,
  async () => {
    const M = monthOf();
    await setup(M);
    const base = KEYS[0];
    const [value] = await S.differing(base, M);
    assert.equal((await S.saveChanges([{ key: base.key, value }], { month: M })).status, 200);
    const before = { tables: await F.snapshot(), configRev: await S.configRev() };
    const same = await S.saveChanges([{ key: base.key, value }], { month: M });
    assert.equal(same.status, 400);
    assert.equal(same.data.code, 'PARAM_NO_CHANGES');
    assert.deepEqual(same.data.skipped, [{ key: base.key, reason: 'UNCHANGED' }]);
    assert.deepEqual(F.changedTables(before.tables, await F.snapshot()), []);
    assert.equal(await S.configRev(), before.configRev);
  }
);

test(
  'R1 save: acknowledge dạng chuỗi mã trơn ("PARAM_FLOOR_ACK_REQUIRED") cũng được nhận cho cả lô (KHÁC THIẾT KẾ: hợp đồng chỉ nói mảng { key, code })',
  S.readyWith(S.softFloorKey(), 'khoá có sàn mềm (cảnh báo)'),
  async () => {
    const M = monthOf();
    await setup(M);
    const soft = await S.softFloorKey();
    const res = await S.saveChanges([{ key: soft.key, value: soft.value }], {
      month: M,
      extra: { basis: 'Căn cứ thử cho khoá pháp lý', acknowledge: ['PARAM_FLOOR_ACK_REQUIRED'] }
    });
    assert.equal(res.status, 200, JSON.stringify(res.data).slice(0, 300));
  }
);

test(
  'R1 save: hoàn tác một khoá (POST /settings/params/revert) thêm một dòng MỚI mang giá trị của phiên bản cũ, không xoá hay sửa dòng nào',
  ONE,
  async () => {
    const M = monthOf();
    await setup(M);
    const base = KEYS[0];
    const [v1, v2] = await S.differing(base, M, 2);
    const first = await S.saveChanges([{ key: base.key, value: v1 }], { month: M });
    assert.equal(first.status, 200);
    assert.equal((await S.saveChanges([{ key: base.key, value: v2 }], { month: M })).status, 200);
    const rows0 = await S.rowCount();
    const res = await F.call('POST', '/settings/params/revert', {
      body: {
        key: base.key,
        toVersion: first.data.saved[0].version,
        effectiveMonth: M,
        reason: 'Hoàn tác về phiên bản trước',
        expectedRev: await S.paramsRevOf(M)
      }
    });
    assert.equal(res.status, 200, JSON.stringify(res.data).slice(0, 300));
    assert.equal(await S.rowCount(), rows0 + 1, 'chỉ thêm một dòng');
    assert.equal(S.valueOfKey((await S.paramsView(M)).data, base.key), v1);
    const kept = (await S.paramRows()).find(r => r.id === first.data.saved[0].version);
    assert.equal(JSON.parse(kept.value_json), v1, 'dòng cũ nguyên vẹn');
  }
);

test(
  'R1 save: sàn mềm đi qua khi acknowledge đúng { key, code }; nhật ký ghi lại',
  S.readyWith(S.softFloorKey(1), 'khoá có sàn mềm (cảnh báo)'),
  async () => {
    const M = monthOf();
    await setup(M);
    const soft = await S.softFloorKey(1);
    const res = await S.saveChanges([{ key: soft.key, value: soft.value }], {
      month: M,
      extra: {
        basis: 'Căn cứ thử cho khoá pháp lý',
        acknowledge: [{ key: soft.key, code: 'PARAM_FLOOR_ACK_REQUIRED' }]
      }
    });
    assert.equal(res.status, 200, JSON.stringify(res.data).slice(0, 300));
    assert.equal(res.data.saved[0].value, soft.value);
    const row = (await S.auditRows('param.set')).find(r => r.entity_id === soft.key);
    assert.ok(row, 'có dòng nhật ký');
    assert.ok(
      JSON.stringify(row).includes('PARAM_FLOOR_ACK_REQUIRED') || row.reason,
      'nhật ký giữ việc đã xác nhận cảnh báo'
    );
  }
);

test(
  'R1 save: Kế toán sửa được khoá pháp lý (kèm căn cứ), C&B sửa được khoá Admin, Admin sửa được lô trộn hai loại',
  S.readyWith(S.accountingKey() && KEYS.length >= 1, 'khoá editableBy accounting và khoá Admin'),
  async () => {
    const M = monthOf();
    await setup(M);
    const acc = await S.accountingKey();
    const admin = KEYS[0];
    const byAccounting = await S.saveChanges([{ key: acc.key, value: acc.value }], {
      month: M,
      who: 'qa_ctv1',
      extra: { basis: 'Nghị định thử' }
    });
    assert.equal(byAccounting.status, 200, JSON.stringify(byAccounting.data).slice(0, 300));
    const [v1] = await S.differing(admin, M);
    const byCb = await S.saveChanges([{ key: admin.key, value: v1 }], { month: M, who: 'qa_nv1' });
    assert.equal(byCb.status, 200, JSON.stringify(byCb.data).slice(0, 300));
    const [v2] = await S.differing(admin, M);
    const mixed = await S.saveChanges(
      [
        { key: acc.key, value: acc.value + 1 },
        { key: admin.key, value: v2 }
      ],
      { month: M, who: 'admin', extra: { basis: 'Nghị định thử' } }
    );
    assert.equal(mixed.status, 200, JSON.stringify(mixed.data).slice(0, 300));
    assert.deepEqual(
      (await S.auditRows('param.set')).slice(-4).map(r => r.actor),
      ['qa_ctv1', 'qa_nv1', 'admin', 'admin']
    );
  }
);

test(
  'R1 save: lưu ở tháng sớm khi đã có phiên bản muộn hơn thì 200 kèm cảnh báo PARAM_LATER_VERSION_EXISTS; từ tháng muộn vẫn dùng giá trị đặt sau',
  ONE,
  async () => {
    const M = monthOf();
    const LATER = '2029-06'; // xa, chỉ để có phiên bản muộn
    await setup(M);
    const base = KEYS[0];
    const [late] = await S.differing(base, LATER);
    const first = await S.saveChanges([{ key: base.key, value: late }], { month: LATER });
    assert.equal(first.status, 200, JSON.stringify(first.data).slice(0, 300));
    const earlyValue = (await S.differing(base, M, 2)).find(v => v !== late);
    const res = await S.saveChanges([{ key: base.key, value: earlyValue }], { month: M });
    assert.equal(res.status, 200, JSON.stringify(res.data).slice(0, 300));
    const warning = (res.data.warnings || []).find(w => w.code === 'PARAM_LATER_VERSION_EXISTS');
    assert.ok(warning, JSON.stringify(res.data.warnings));
    assert.equal(warning.key, base.key);
    assert.equal(warning.laterEffectiveMonth, LATER);
    assert.equal(S.valueOfKey((await S.paramsView(LATER)).data, base.key), late);
    assert.equal(S.valueOfKey((await S.paramsView(M)).data, base.key), earlyValue);
  }
);

test(
  'R1 save: GET /api/settings/params/history?key= trả phiên bản mới nhất trước, gồm lý do, tháng áp dụng và người đổi (TK 4.7; chưa có trong hợp đồng R1)',
  HISTORY,
  async () => {
    const M = monthOf();
    await setup(M);
    const base = KEYS[0];
    const [v1, v2] = await S.differing(base, M, 2);
    assert.equal(
      (await S.saveChanges([{ key: base.key, value: v1 }], { month: M, reason: 'Phiên bản thứ nhất' })).status,
      200
    );
    assert.equal(
      (await S.saveChanges([{ key: base.key, value: v2 }], { month: M, reason: 'Phiên bản thứ hai' })).status,
      200
    );
    const history = await F.call('GET', `/settings/params/history?key=${base.key}&limit=5`);
    assert.equal(history.status, 200, JSON.stringify(history.data).slice(0, 300));
    const list = Array.isArray(history.data)
      ? history.data
      : history.data.versions || history.data.rows || history.data.history;
    assert.ok(Array.isArray(list) && list.length >= 2, JSON.stringify(history.data).slice(0, 300));
    assert.deepEqual([list[0].value, list[0].reason], [v2, 'Phiên bản thứ hai']);
    assert.deepEqual([list[1].value, list[1].reason], [v1, 'Phiên bản thứ nhất']);
    assert.equal(list[0].effectiveMonth, M);
    assert.equal(list[0].createdBy, 'admin');
    assert.equal((await F.call('GET', '/settings/params/history?key=khong.co')).status, 404);
  }
);
