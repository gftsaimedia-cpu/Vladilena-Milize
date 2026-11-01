'use strict';
// Đường ghi cài đặt, nhóm LỖI: mọi lần PUT /api/settings/params bị từ chối phải KHÔNG lưu gì (không bảng nào đổi, kể cả nhật ký và settings),
// không bật params_mode, không tăng config_rev.
// Hợp đồng lỗi: 400 PARAM_UNKNOWN_KEY / PARAM_INVALID_VALUE / PARAM_OPTION_UNAVAILABLE / PARAM_NOT_WIRED / REASON_REQUIRED (lý do quá dài) /
// BAD_MONTH / PARAM_BATCH_TOO_LARGE, 403 cho khoá vai trò không sửa được, 409 PARAMS_STALE.
// Sàn luật, sàn mềm, lý do và căn cứ thiếu, tháng đã chốt chỉ cảnh báo và vẫn lưu: settings-save-warns.test.ts.
// Chạy như `todo` khi cờ READY của test/helpers/settings-api.ts chưa bật; RED=1 ép chạy như test thường để thấy từng test đỏ vì gì.
// Nhóm này không bao giờ ghi thành công nên không để dòng param_versions nào cho test sau.
const S = require('../helpers/settings-api');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

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
// Seed một tháng có người bịa và vai trò; chế độ về defaults-only để thấy lỗi không làm bật active
async function setup(month?) {
  await S.seed(month);
  await F.person('qa_plain', 'staff', { type: 'nv', level: 1, startDate: '2026-01-05' });
  for (const role of ['hr', 'manager', 'accounting', 'cb']) await S.grant(ACCOUNT[role], role);
  await S.setMode('defaults-only');
}
// Chụp mọi thứ có thể đổi: tất cả bảng, số phiên bản chung, chế độ
const state = async () => ({
  tables: await F.snapshot(),
  configRev: await S.configRev(),
  mode: await store.params.getMode(),
  rows: await S.rowCount()
});
const assertUnchanged = async (before?, what?) => {
  const after = await state();
  assert.deepEqual(F.changedTables(before.tables, after.tables), [], `${what}: không bảng nào được đổi`);
  assert.equal(after.mode, before.mode, `${what}: không bật params_mode`);
  assert.equal(after.configRev, before.configRev, `${what}: không tăng config_rev`);
  assert.equal(after.rows, before.rows, `${what}: không thêm dòng param_versions`);
};
const refuse = (res?, status?, codes?, what?) => {
  assert.ok([].concat(status).includes(res.status), `${what}: ${res.status} ${JSON.stringify(res.data).slice(0, 300)}`);
  const list = Array.isArray(codes) ? codes : [codes];
  assert.ok(list.includes(res.data.code), `${what}: mã ${res.data.code}, mong ${list.join('|')}`);
};

/* ================= kiểm giá trị từng khoá ================= */
test(
  'R1: khoá lạ, giá trị sai kiểu/âm/lẻ là 400 (PARAM_UNKNOWN_KEY, PARAM_INVALID_VALUE) kèm tên khoá; không lưu gì',
  S.READY,
  async () => {
    const M = monthOf();
    await setup(M);
    const base = await S.adminKey();
    assert.ok(base, 'registry phải có khoá level.nv.1.base do Admin sửa');
    const before = await state();
    const unknown = await S.saveChanges([{ key: 'khong.co.khoa.nay', value: 1 }], { month: M });
    refuse(unknown, 400, 'PARAM_UNKNOWN_KEY', 'khoá lạ');
    assert.ok(JSON.stringify(unknown.data).includes('khong.co.khoa.nay'), 'nêu khoá lỗi');
    for (const value of ['abc', -5, 1.5, null, {}, [], true]) {
      const res = await S.saveChanges([{ key: base.key, value }], { month: M });
      refuse(res, 400, 'PARAM_INVALID_VALUE', `value=${JSON.stringify(value)}`);
      assert.ok(JSON.stringify(res.data).includes(base.key));
    }
    await assertUnchanged(before, 'giá trị sai');
  }
);

test(
  'R1: phương án chưa dùng được là 400 PARAM_OPTION_UNAVAILABLE',
  S.readyWith(S.unavailableOptionKey(), 'khoá lựa chọn có phương án available:false'),
  async () => {
    const M = monthOf();
    await setup(M);
    const found = S.unavailableOptionKey();
    const before = await state();
    refuse(
      await S.saveChanges([{ key: found.key, value: found.value }], { month: M }),
      400,
      'PARAM_OPTION_UNAVAILABLE',
      found.key
    );
    await assertUnchanged(before, 'phương án chưa dùng được');
  }
);

test(
  'R1: khoá chưa nối (wired:false) là 400 PARAM_NOT_WIRED, không được lưu thành ô giả',
  S.readyWith(S.notWiredKey(), 'khoá wired:false mà Admin sửa được'),
  async () => {
    const M = monthOf();
    await setup(M);
    const found = await S.notWiredKey();
    const before = await state();
    const res = await S.saveChanges([{ key: found.key, value: found.value }], { month: M });
    refuse(res, 400, 'PARAM_NOT_WIRED', found.key);
    assert.ok(JSON.stringify(res.data).includes(found.key));
    await assertUnchanged(before, 'khoá chưa nối');
    // GET cho thấy khoá đó không dùng được (available:false) thay vì để Admin thử rồi mới biết
    const view = (await S.paramsView(M)).data;
    const text = JSON.stringify(view);
    assert.ok(text.includes('"available":false') || text.includes('wired'), 'màn Cài đặt phải biết khoá chưa nối');
  }
);

/* ================= lý do, căn cứ, hình dạng yêu cầu ================= */
test(
  'R1: hình dạng yêu cầu sai là 400 và không lưu gì: changes trống, không phải mảng, trùng khoá, thiếu key/value, quá 50 thay đổi, JSON hỏng',
  S.READY,
  async () => {
    const M = monthOf();
    await setup(M);
    const base = await S.adminKey();
    const rev = await S.paramsRevOf(M);
    const before = await state();
    const one = { key: base.key, value: base.value };
    const ok = (extra?) => ({ effectiveMonth: M, reason: S.REASON, expectedRev: rev, ...extra });
    for (const [name, body] of Object.entries<any>({
      'changes trống': ok({ changes: [] }),
      'changes không phải mảng': ok({ changes: 'x' }),
      'thiếu changes': ok({}),
      'trùng khoá': ok({ changes: [one, one] }),
      'thiếu key': ok({ changes: [{ value: 1 }] }),
      'thiếu value': ok({ changes: [{ key: base.key }] }),
      'phần tử không phải đối tượng': ok({ changes: [5] })
    })) {
      const res = await S.save(body);
      assert.equal(res.status, 400, `${name}: ${res.status} ${JSON.stringify(res.data).slice(0, 200)}`);
    }
    const many = Array.from({ length: 51 }, (_, i) => ({ key: `khoa.gia.${i}`, value: i }));
    refuse(await S.save(ok({ changes: many })), 400, 'PARAM_BATCH_TOO_LARGE', '51 thay đổi');
    const raw = await fetch(`http://127.0.0.1:${F.server.address().port}/api/settings/params`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: require('../../src/platform/auth').cookieHeader(
          await require('../../src/platform/auth').createSession('admin'),
          86400
        )
      },
      body: '{khong phai json'
    });
    assert.equal(raw.status, 400);
    // chỉ kiểm mã 400: phản hồi không kèm code BAD_JSON
    await assertUnchanged(before, 'hình dạng sai');
  }
);

/* ================= expectedRev ================= */
test(
  'R1: thiếu hoặc sai kiểu expectedRev bị từ chối; expectedRev lệch là 409 PARAMS_STALE kèm paramsRev hiện tại; không lưu gì',
  S.READY,
  async () => {
    const M = monthOf();
    await setup(M);
    const base = await S.adminKey();
    const rev = await S.paramsRevOf(M);
    const before = await state();
    for (const expectedRev of [null, '0', 1.5, -1, {}]) {
      const res = await S.saveChanges([{ key: base.key, value: base.value }], {
        month: M,
        expectedRev: expectedRev === null ? null : expectedRev
      });
      assert.ok([400, 409].includes(res.status), `expectedRev=${JSON.stringify(expectedRev)}: ${res.status}`);
    }
    const stale = await S.saveChanges([{ key: base.key, value: base.value }], { month: M, expectedRev: rev + 5 });
    refuse(stale, 409, 'PARAMS_STALE', 'expectedRev lệch');
    assert.equal(stale.data.paramsRev, rev, 'trả paramsRev hiện tại để màn tải lại');
    await assertUnchanged(before, 'expectedRev sai');
  }
);

/* ================= tháng hiệu lực ================= */
test(
  'R1: vai trò không có năng lực sửa khoá là 403: Kế toán không sửa khoá Admin, C&B không sửa khoá pháp lý, ops và locked không ai sửa (kể cả Admin)',
  S.readyWith(S.accountingKey() && S.opsKey() && S.lockedKey(), 'đủ khoá editableBy accounting, ops và locked'),
  async () => {
    const M = monthOf();
    await setup(M);
    const admin = await S.adminKey();
    const acc = await S.accountingKey();
    const ops = await S.opsKey();
    const locked = await S.lockedKey();
    const before = await state();
    const cases = [
      ['kế toán sửa khoá Admin', 'qa_ctv1', admin, ['FORBIDDEN_CAP']],
      ['C&B sửa khoá pháp lý', 'qa_nv1', acc, ['FORBIDDEN_CAP']],
      // khoá ops/locked: nhận 400 PARAM_LOCKED hoặc 403 FORBIDDEN_CAP
      ['Admin sửa khoá ops', 'admin', ops, ['FORBIDDEN_CAP', 'PARAM_LOCKED'], [400, 403]],
      ['Admin sửa khoá locked', 'admin', locked, ['FORBIDDEN_CAP', 'PARAM_LOCKED'], [400, 403]],
      ['C&B sửa khoá ops', 'qa_nv1', ops, ['FORBIDDEN_CAP', 'PARAM_LOCKED'], [400, 403]]
    ];
    for (const [what, who, key, codes, statuses] of cases) {
      const res = await S.saveChanges([{ key: key.key, value: key.value }], {
        month: M,
        who,
        extra: { basis: 'Căn cứ thử' }
      });
      refuse(res, statuses || 403, codes, what);
    }
    await assertUnchanged(before, 'sai quyền');
  }
);

test(
  'R1: hr, quản lý, nhân sự thường bị chặn ở cổng (403 FORBIDDEN_CAP) với MỌI khoá; chưa đăng nhập là 401',
  S.READY,
  async () => {
    const M = monthOf();
    await setup(M);
    const base = await S.adminKey();
    const rev = await S.paramsRevOf(M);
    const before = await state();
    for (const role of ['hr', 'manager', 'staff']) {
      const res = await S.save(
        { changes: [{ key: base.key, value: base.value }], effectiveMonth: M, reason: S.REASON, expectedRev: rev },
        ACCOUNT[role]
      );
      refuse(res, 403, 'FORBIDDEN_CAP', role);
    }
    const anon = await S.save(
      { changes: [{ key: base.key, value: base.value }], effectiveMonth: M, reason: S.REASON, expectedRev: rev },
      null
    );
    assert.equal(anon.status, 401);
    await assertUnchanged(before, 'không có quyền');
  }
);

test(
  'R1: lô trộn khoá Admin và khoá pháp lý cần cả hai quyền: C&B hay Kế toán một mình bị 403 và KHÔNG khoá nào được lưu (cả lô hoặc không)',
  S.readyWith(S.accountingKey(), 'khoá editableBy accounting'),
  async () => {
    const M = monthOf();
    await setup(M);
    const admin = await S.adminKey();
    const acc = await S.accountingKey();
    const before = await state();
    for (const who of ['qa_nv1', 'qa_ctv1']) {
      const res = await S.saveChanges(
        [
          { key: admin.key, value: admin.value },
          { key: acc.key, value: acc.value }
        ],
        { month: M, who, extra: { basis: 'Căn cứ thử' } }
      );
      refuse(res, 403, 'FORBIDDEN_CAP', who);
    }
    await assertUnchanged(before, 'lô trộn quyền');
  }
);

/* ================= cả lô hoặc không ================= */
test(
  'R1: một khoá hỏng trong lô làm CẢ LÔ không lưu: khoá lạ, giá trị sai, chưa nối, khoá locked; khoá hợp lệ đứng trước hay sau đều không được ghi',
  S.READY,
  async () => {
    const M = monthOf();
    await setup(M);
    const good = (await S.wiredMoneyKey()) || (await S.adminKey());
    assert.ok(good, 'cần một khoá hợp lệ');
    const goodChange = { key: good.key, value: good.value };
    const bads = [
      ['khoá lạ', { key: 'khong.co.khoa', value: 1 }],
      ['giá trị sai', { key: good.key === 'level.nv.1.base' ? 'level.nv.2.base' : 'level.nv.1.base', value: 'abc' }]
    ];
    const locked = await S.lockedKey();
    if (locked) bads.push(['khoá locked', { key: locked.key, value: locked.value }]);
    const notWired = await S.notWiredKey();
    if (notWired) bads.push(['chưa nối', { key: notWired.key, value: notWired.value }]);
    const before = await state();
    for (const [what, bad] of bads)
      for (const order of [
        [goodChange, bad],
        [bad, goodChange]
      ]) {
        const res = await S.saveChanges(order, { month: M, extra: { basis: 'Căn cứ thử' } });
        assert.ok(res.status >= 400 && res.status < 500, `${what}: ${res.status}`);
        await assertUnchanged(before, `${what}, thứ tự ${order[0] === goodChange ? 'tốt trước' : 'hỏng trước'}`);
      }
    assert.equal(await S.rowCount(), before.rows, 'không dòng param_versions nào, kể cả của khoá hợp lệ');
  }
);

test(
  'R1: lỗi không tạo dòng nhật ký nào và không bật params_mode: nhật ký và chế độ y nguyên sau cả loạt lỗi',
  S.READY,
  async () => {
    const M = monthOf();
    await setup(M);
    const base = await S.adminKey();
    const audit0 = (await S.auditRows()).length;
    const res = await S.saveChanges([{ key: base.key, value: 'abc' }], { month: M });
    assert.equal(res.status, 400);
    await S.saveChanges([{ key: base.key, value: base.value }], { month: M, reason: S.text(301) });
    await S.saveChanges([{ key: base.key, value: base.value }], { month: M, expectedRev: 999 });
    assert.equal((await S.auditRows()).length, audit0);
    assert.equal(await store.params.getMode(), 'defaults-only');
  }
);

/* ================= phiên bản chung ================= */
test(
  'R1: GET /api/settings/version trả { configRev, mode, epoch, build } cho mọi người đã đăng nhập (kể cả nhân viên), chưa đăng nhập là 401; không đổi theo lần gọi',
  S.READY,
  async () => {
    const M = monthOf();
    await setup(M);
    const admin = await S.version();
    assert.equal(admin.status, 200, JSON.stringify(admin.data));
    for (const key of ['configRev', 'mode', 'epoch', 'build']) assert.ok(Object.hasOwn(admin.data, key), key);
    assert.ok(Number.isInteger(admin.data.configRev) && admin.data.configRev >= 0);
    assert.equal(admin.data.mode, 'defaults-only');
    for (const who of ['qa_plain', 'qa_nv2', 'qa_tts1']) {
      const res = await S.version(who);
      assert.equal(res.status, 200, who);
      assert.equal(res.data.configRev, admin.data.configRev);
    }
    assert.equal((await S.version(null)).status, 401);
    assert.equal((await S.version()).data.configRev, admin.data.configRev, 'đọc không làm đổi');
    assert.equal(admin.data.configRev, await S.configRev(), 'bằng khoá config_rev trong settings');
  }
);
