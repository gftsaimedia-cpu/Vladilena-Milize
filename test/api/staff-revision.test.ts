'use strict';
// Hồ sơ nhân sự có phiên bản (src/domain/staff.ts → staffRevision, server.js → PUT /staff/:u):
//   - hồ sơ trả về có `rev` (chuỗi băm 16 ký tự hex), đổi khi hồ sơ đổi ở bất kỳ cột nào;
//   - PUT /api/staff/:u với expectedRev khác rev hiện tại là 409 STAFF_STALE kèm currentRev và KHÔNG lưu gì; đúng rev thì lưu;
//   - body chỉ có `locked` (kèm hoặc không kèm expectedRev) đi nhánh khoá / mở khoá, không bị đòi họ tên.
// Người bịa qa_*, đồng hồ giả của api-fixture.
const F = require('../helpers/api-fixture');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { store } = F;
const USER = 'qa_rev';

before(async () => {
  await F.start();
  await F.person('admin', 'admin', { type: 'tts', level: 0, shiftCode: null, startDate: null });
  await F.person(USER, 'staff', { type: 'nv', level: 1, startDate: '2026-01-05' });
});
after(F.stop);

const revOf = async (username?) => {
  const res = await F.call('GET', '/staff');
  assert.equal(res.status, 200);
  return res.data.staff.find(s => s.username === username).rev;
};
// Hồ sơ gửi lại y nguyên (như màn Hồ sơ), đổi họ tên và các trường truyền thêm
const profile = async (patch: any = {}) => {
  const staff = await store.getStaff(USER);
  return {
    name: staff.name,
    role: staff.role,
    type: staff.type,
    level: staff.level,
    shiftCode: staff.shiftCode,
    startDate: staff.startDate,
    nightPct: staff.nightPct,
    ...patch
  };
};
const put = async (body?) => await F.call('PUT', `/staff/${USER}`, { body });

test('Hồ sơ trả về có rev là chuỗi hex 16 ký tự, và rev đổi khi hồ sơ đổi', async () => {
  const rev = await revOf(USER);
  assert.match(rev, /^[0-9a-f]{16}$/);
  assert.equal(await revOf(USER), rev, 'không đổi gì thì rev không đổi');
  const saved = await put(await profile({ name: 'Tên mới một' }));
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  const next = await revOf(USER);
  assert.notEqual(next, rev);
  assert.equal(saved.data.staff.rev, next, 'phản hồi PUT mang rev mới');
});

test('expectedRev sai: 409 STAFF_STALE kèm currentRev, không lưu gì (không bảng nào đổi)', async () => {
  const rev = await revOf(USER);
  const before = await F.snapshot();
  const res = await put(await profile({ name: 'Tên không được lưu', expectedRev: '0000000000000000' }));
  assert.equal(res.status, 409, JSON.stringify(res.data));
  assert.equal(res.data.code, 'STAFF_STALE');
  assert.equal(res.data.currentRev, rev);
  assert.match(res.data.error, /vừa được người khác sửa/);
  assert.deepEqual(F.changedTables(before, await F.snapshot()), []);
  assert.notEqual((await store.getStaff(USER)).name, 'Tên không được lưu');
});

test('expectedRev đúng thì lưu; dùng lại rev cũ sau khi đã lưu thì 409 (người sau không ghi đè người trước)', async () => {
  const rev = await revOf(USER);
  const first = await put(await profile({ name: 'Tên người thứ nhất', expectedRev: rev }));
  assert.equal(first.status, 200, JSON.stringify(first.data));
  assert.equal((await store.getStaff(USER)).name, 'Tên người thứ nhất');
  const second = await put(await profile({ name: 'Tên người thứ hai', expectedRev: rev }));
  assert.equal(second.status, 409, JSON.stringify(second.data));
  assert.equal(second.data.code, 'STAFF_STALE');
  assert.equal(second.data.currentRev, await revOf(USER));
  assert.equal((await store.getStaff(USER)).name, 'Tên người thứ nhất', 'bản của người thứ hai không được lưu');
});

test('expectedRev không phải chuỗi hoặc rỗng là 400 và không lưu gì; thiếu expectedRev thì giữ hành vi cũ (ghi đè)', async () => {
  const before = await F.snapshot();
  for (const bad of [123, '', true, ['abc']]) {
    const res = await put(await profile({ name: 'Không lưu', expectedRev: bad }));
    assert.equal(res.status, 400, JSON.stringify(bad));
  }
  assert.deepEqual(F.changedTables(before, await F.snapshot()), []);
  const noRev = await put(await profile({ name: 'Tên không kèm rev' }));
  assert.equal(noRev.status, 200, JSON.stringify(noRev.data));
  assert.equal((await store.getStaff(USER)).name, 'Tên không kèm rev');
});

test('Body chỉ có locked (không kèm expectedRev) đi nhánh khoá: không bị đòi họ tên, khoá rồi mở khoá được', async () => {
  const locked = await put({ locked: true });
  assert.equal(locked.status, 200, JSON.stringify(locked.data));
  assert.ok((await store.getStaffRow(USER)).locked_at, 'đã khoá');
  assert.equal(locked.data.staff.name, (await store.getStaff(USER)).name, 'hồ sơ không đổi, chỉ khoá');
  const unlocked = await put({ locked: false });
  assert.equal(unlocked.status, 200, JSON.stringify(unlocked.data));
  assert.equal((await store.getStaffRow(USER)).locked_at, null);
});

test('Body { locked, expectedRev } vẫn là nhánh khoá: rev đúng thì khoá được, rev sai thì 409 STAFF_STALE và không đổi gì', async () => {
  const stale = await put({ locked: true, expectedRev: 'ffffffffffffffff' });
  assert.equal(stale.status, 409, JSON.stringify(stale.data));
  assert.equal(stale.data.code, 'STAFF_STALE');
  assert.equal((await store.getStaffRow(USER)).locked_at, null, 'không khoá');
  const rev = await revOf(USER);
  const ok = await put({ locked: true, expectedRev: rev });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.ok((await store.getStaffRow(USER)).locked_at);
  assert.equal(
    (await put({ locked: false, expectedRev: await revOf(USER) })).status,
    200,
    'mở khoá bằng rev mới (khoá cũng làm rev đổi)'
  );
});

test('Nhân sự thường không sửa được hồ sơ: PUT /api/staff/:u trả 403 dù kèm expectedRev đúng', async () => {
  await F.person('qa_rev_staff', 'staff', { type: 'nv', level: 1 });
  const before = await F.snapshot();
  const res = await F.call('PUT', `/staff/${USER}`, {
    who: 'qa_rev_staff',
    body: await profile({ name: 'Không được', expectedRev: await revOf(USER) })
  });
  assert.equal(res.status, 403, JSON.stringify(res.data));
  assert.deepEqual(F.changedTables(before, await F.snapshot()), []);
});

/* ---------- cột kỹ thuật tự đổi không làm rev đổi (session_version và pass_hash không nằm trong phần băm) ---------- */
test('Đăng xuất (tăng session_version) và đổi mật khẩu không làm rev đổi; PUT với rev cũ vẫn 200', async () => {
  await F.person('qa_rev_b', 'staff', { type: 'nv', level: 1, startDate: '2026-01-05' });
  const rev = await revOf('qa_rev_b');
  const before = await store.getStaffRow('qa_rev_b');
  // tăng session_version trực tiếp
  await store.bumpSessionVersion('qa_rev_b');
  assert.equal(await revOf('qa_rev_b'), rev, 'bumpSessionVersion không đổi rev');
  // đăng xuất qua API
  const out = await F.call('POST', '/logout', { who: 'qa_rev_b' });
  assert.equal(out.status, 200, JSON.stringify(out.data));
  assert.equal(await revOf('qa_rev_b'), rev, 'đăng xuất không đổi rev');
  // nhân sự tự đổi mật khẩu
  const changed = await F.call('PUT', '/password', {
    who: 'qa_rev_b',
    body: { current: 'test-pass', next: 'mat-khau-moi-123' }
  });
  assert.equal(changed.status, 200, JSON.stringify(changed.data));
  const after = await store.getStaffRow('qa_rev_b');
  assert.notEqual(after.pass_hash, before.pass_hash, 'điều kiện: mật khẩu đã đổi thật');
  assert.ok(after.session_version > before.session_version, 'điều kiện: session_version đã tăng');
  assert.equal(await revOf('qa_rev_b'), rev, 'đổi mật khẩu không đổi rev');
  // Admin mở hồ sơ trước đó, giờ lưu với rev cũ: vẫn 200 (không bị 409 oan)
  const saved = await F.call('PUT', '/staff/qa_rev_b', {
    body: {
      name: 'Tên sau khi đổi mật khẩu',
      role: 'staff',
      type: 'nv',
      level: 1,
      shiftCode: after.shift_code,
      startDate: '2026-01-05',
      nightPct: after.night_pct,
      expectedRev: rev
    }
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.equal((await store.getStaff('qa_rev_b')).name, 'Tên sau khi đổi mật khẩu');
});

test('Khoá tài khoản làm rev đổi (locked_at là thay đổi thật); mở khoá đổi tiếp và về đúng rev ban đầu', async () => {
  await F.person('qa_rev_c', 'staff', { type: 'nv', level: 1, startDate: '2026-01-05' });
  const rev = await revOf('qa_rev_c');
  const locked = await F.call('PUT', '/staff/qa_rev_c', { body: { locked: true, expectedRev: rev } });
  assert.equal(locked.status, 200, JSON.stringify(locked.data));
  const lockedRev = await revOf('qa_rev_c');
  assert.notEqual(lockedRev, rev, 'khoá đổi rev');
  assert.equal(
    (await F.call('PUT', '/staff/qa_rev_c', { body: { locked: false, expectedRev: lockedRev } })).status,
    200
  );
  assert.notEqual(await revOf('qa_rev_c'), lockedRev, 'mở khoá đổi rev');
  assert.equal(await revOf('qa_rev_c'), rev, 'khoá rồi mở khoá trả hồ sơ về đúng trạng thái cũ nên rev trở về như cũ');
});
