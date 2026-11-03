require('../helpers/require-isolated-database');
process.env.SESSION_SECRET = 'db-pay-entries-tests';
const { test, after } = require('node:test'),
  assert = require('node:assert/strict');
const store = require('../../src/platform/db'),
  auth = require('../../src/platform/auth');
const db = store.db;

after(() => store.setDefaultContractResolver(null));

const insert = async (over: any = {}) => {
  const r = {
    username: 'pe_user',
    month: '2026-10',
    direction: 'add',
    amount: 500000,
    label: 'Thưởng một lần',
    reason: 'Thưởng hoàn thành dự án',
    created_by: 'pe_admin',
    created_at: '2026-10-16T01:00:00.000Z',
    ...over
  };
  const keys = Object.keys(r);
  return (
    await db
      .prepare(`INSERT INTO pay_entries (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`)
      .run(...keys.map(k => r[k]))
  ).lastInsertRowid;
};
const row = async (id?) => await db.prepare('SELECT * FROM pay_entries WHERE id = ?').get(id);
const approve = async (id?) =>
  await db
    .prepare(
      "UPDATE pay_entries SET status='approved', rev=rev+1, decided_by='pe_boss', decided_at='2026-10-16T02:00:00.000Z' WHERE id=?"
    )
    .run(id);

test('pay_entries: thêm dòng nhận mặc định pending, rev 1 và các cột tuỳ chọn là null', async () => {
  const r = await row(await insert());
  assert.equal(r.status, 'pending');
  assert.equal(r.rev, 1);
  assert.equal(r.tax_mode, null);
  assert.equal(r.tax_cap, null);
  assert.equal(r.insurance_base, null);
  assert.equal(r.slip_line, null);
  assert.equal(r.decided_by, null);
});

test('pay_entries: CHECK từ chối số tiền không dương, không nguyên, hướng/tháng/trạng thái sai', async () => {
  await assert.rejects(async () => await insert({ amount: 0 }));
  await assert.rejects(async () => await insert({ amount: -1 }));
  await assert.rejects(async () => await insert({ amount: 1500.5 }));
  await assert.rejects(async () => await insert({ direction: 'plus' }));
  await assert.rejects(async () => await insert({ month: '2026-1' }));
  await assert.rejects(async () => await insert({ month: 'abcd-ef' }));
  await assert.rejects(async () => await insert({ status: 'done' }));
  await assert.rejects(async () => await insert({ tax_mode: 'half' }));
  await assert.rejects(async () => await insert({ tax_cap: -5 }));
  await assert.rejects(async () => await insert({ insurance_base: 1.5 }));
  await assert.rejects(async () => await insert({ username: '' }));
  for (const mode of ['none', 'full', 'cap'])
    assert.ok(await insert({ tax_mode: mode, tax_cap: mode === 'cap' ? 1000000 : null }));
});

test('pay_entries: CHECK nhãn 1 đến 80 ký tự, lý do 10 đến 300 ký tự (biên)', async () => {
  assert.ok(await insert({ label: 'a'.repeat(80) }));
  await assert.rejects(async () => await insert({ label: 'a'.repeat(81) }));
  await assert.rejects(async () => await insert({ label: '' }));
  assert.ok(await insert({ reason: 'x'.repeat(10) }));
  assert.ok(await insert({ reason: 'x'.repeat(300) }));
  await assert.rejects(async () => await insert({ reason: 'x'.repeat(9) }));
  await assert.rejects(async () => await insert({ reason: 'x'.repeat(301) }));
});

test('pay_entries: cấm DELETE ở mọi trạng thái', async () => {
  const id = await insert();
  await assert.rejects(async () => await db.prepare('DELETE FROM pay_entries WHERE id = ?').run(id), /không được xoá/);
  await approve(id);
  await assert.rejects(async () => await db.prepare('DELETE FROM pay_entries WHERE id = ?').run(id), /không được xoá/);
  assert.ok(await row(id));
});

test('pay_entries: khoản chờ duyệt vẫn sửa được số tiền; người lập và giờ lập thì không', async () => {
  const id = await insert();
  await db.prepare('UPDATE pay_entries SET amount = 700000, rev = rev + 1 WHERE id = ?').run(id);
  assert.equal((await row(id)).amount, 700000);
  await assert.rejects(
    async () => await db.prepare("UPDATE pay_entries SET created_by = 'khac' WHERE id = ?").run(id),
    /người lập/
  );
  await assert.rejects(
    async () => await db.prepare("UPDATE pay_entries SET created_at = '2020-01-01T00:00:00.000Z' WHERE id = ?").run(id)
  );
});

test('pay_entries: sau approved không đổi được tiền, hướng, thuế, bảo hiểm, người, tháng', async () => {
  const id = await insert({ tax_mode: 'cap', tax_cap: 1000000, insurance_base: 2000000 });
  await approve(id);
  const frozen = [
    ['amount', 1],
    ['direction', 'deduct'],
    ['tax_mode', 'none'],
    ['tax_cap', 5],
    ['insurance_base', 5],
    ['username', 'nguoi_khac'],
    ['month', '2026-11']
  ];
  for (const [col, val] of frozen) {
    await assert.rejects(
      async () => await db.prepare(`UPDATE pay_entries SET ${col} = ? WHERE id = ?`).run(val, id),
      /đã duyệt không được sửa/,
      col
    );
  }
  const r = await row(id);
  assert.equal(r.amount, 500000);
  assert.equal(r.direction, 'add');
  assert.equal(r.tax_cap, 1000000);
});

test('pay_entries: sau approved vẫn đổi được nhãn, ghi chú và cho phép approved sang void', async () => {
  const id = await insert();
  await approve(id);
  await db
    .prepare("UPDATE pay_entries SET label = 'Nhãn mới', decision_note = 'ok', rev = rev + 1 WHERE id = ?")
    .run(id);
  assert.equal((await row(id)).label, 'Nhãn mới');
  await db.prepare("UPDATE pay_entries SET status = 'void', rev = rev + 1 WHERE id = ?").run(id);
  assert.equal((await row(id)).status, 'void');
});

test('pay_entries: approved không lùi về pending/rejected; void là trạng thái cuối', async () => {
  const id = await insert();
  await approve(id);
  await assert.rejects(
    async () => await db.prepare("UPDATE pay_entries SET status = 'pending' WHERE id = ?").run(id),
    /không lùi/
  );
  await assert.rejects(
    async () => await db.prepare("UPDATE pay_entries SET status = 'rejected' WHERE id = ?").run(id),
    /không lùi/
  );
  await db.prepare("UPDATE pay_entries SET status = 'void' WHERE id = ?").run(id);
  await assert.rejects(
    async () => await db.prepare("UPDATE pay_entries SET status = 'approved' WHERE id = ?").run(id),
    /đã huỷ/
  );
  await assert.rejects(
    async () => await db.prepare("UPDATE pay_entries SET status = 'pending' WHERE id = ?").run(id),
    /đã huỷ/
  );
});

test('pay_entries: chờ duyệt đi được sang rejected và void', async () => {
  const a = await insert(),
    b = await insert();
  await db
    .prepare(
      "UPDATE pay_entries SET status = 'rejected', decided_by = 'pe_boss', decision_note = 'sai số' WHERE id = ?"
    )
    .run(a);
  await db.prepare("UPDATE pay_entries SET status = 'void' WHERE id = ?").run(b);
  assert.equal((await row(a)).status, 'rejected');
  assert.equal((await row(b)).status, 'void');
});

async function person(username?, type?, contract?) {
  await store.upsertStaff({
    username,
    name: username,
    role: 'staff',
    type,
    level: 1,
    shiftCode: 'n1',
    contract,
    passHash: auth.hashPassword('test-pass')
  });
}

test('defaultContract: không đặt resolver giữ hành vi cũ (tts short, ctv và nv long)', async () => {
  store.setDefaultContractResolver(null);
  await person('dc_tts', 'tts');
  await person('dc_ctv', 'ctv');
  await person('dc_nv', 'nv');
  await db.prepare("UPDATE staff SET contract = NULL WHERE username LIKE 'dc_%'").run();
  assert.equal((await store.getStaff('dc_tts')).contract, 'short');
  assert.equal((await store.getStaff('dc_ctv')).contract, 'long');
  assert.equal((await store.getStaff('dc_nv')).contract, 'long');
  assert.equal((await store.getStaff('dc_tts')).insured, false);
  assert.equal((await store.getStaff('dc_nv')).insured, true);
});

test('defaultContract: resolver quyết định cho mã mới, giá trị lạ hoặc lỗi thì rơi về hành vi cũ', async () => {
  await person('dc_new', 'moi');
  await db.prepare("UPDATE staff SET contract = NULL WHERE username LIKE 'dc_%'").run();
  const map = { moi: 'short' };
  store.setDefaultContractResolver(type => map[type]);
  assert.equal((await store.getStaff('dc_new')).contract, 'short');
  assert.equal((await store.getStaff('dc_nv')).contract, 'long', 'resolver trả undefined: giữ cũ');
  assert.equal((await store.getStaff('dc_tts')).contract, 'short');
  store.setDefaultContractResolver(() => 'khac');
  assert.equal((await store.getStaff('dc_new')).contract, 'long', 'giá trị lạ: giữ cũ');
  assert.equal((await store.getStaff('dc_tts')).contract, 'short');
  store.setDefaultContractResolver(() => {
    throw new Error('lỗi tra khoá');
  });
  assert.equal((await store.getStaff('dc_nv')).contract, 'long', 'resolver ném lỗi: giữ cũ');
  store.setDefaultContractResolver('không phải hàm');
  assert.equal((await store.getStaff('dc_tts')).contract, 'short');
});

test('defaultContract: hợp đồng đã lưu trong hồ sơ luôn thắng resolver', async () => {
  store.setDefaultContractResolver(() => 'short');
  await person('dc_set', 'nv', 'long');
  assert.equal((await store.getStaff('dc_set')).contract, 'long');
});
