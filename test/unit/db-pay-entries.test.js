process.env.DB_PATH = ':memory:';
process.env.SESSION_SECRET = 'db-pay-entries-tests';
const { test, after } = require('node:test'),
  assert = require('node:assert/strict');
const store = require('../../lib/db'),
  auth = require('../../lib/auth');
const db = store.db;

after(() => store.setDefaultContractResolver(null));

const insert = (over = {}) => {
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
  return db
    .prepare(`INSERT INTO pay_entries (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`)
    .run(...keys.map(k => r[k])).lastInsertRowid;
};
const row = id => db.prepare('SELECT * FROM pay_entries WHERE id = ?').get(id);
const approve = id =>
  db
    .prepare(
      "UPDATE pay_entries SET status='approved', rev=rev+1, decided_by='pe_boss', decided_at='2026-10-16T02:00:00.000Z' WHERE id=?"
    )
    .run(id);

test('pay_entries: thêm dòng nhận mặc định pending, rev 1 và các cột tuỳ chọn là null', () => {
  const r = row(insert());
  assert.equal(r.status, 'pending');
  assert.equal(r.rev, 1);
  assert.equal(r.tax_mode, null);
  assert.equal(r.tax_cap, null);
  assert.equal(r.insurance_base, null);
  assert.equal(r.slip_line, null);
  assert.equal(r.decided_by, null);
});

test('pay_entries: CHECK từ chối số tiền không dương, không nguyên, hướng/tháng/trạng thái sai', () => {
  assert.throws(() => insert({ amount: 0 }));
  assert.throws(() => insert({ amount: -1 }));
  assert.throws(() => insert({ amount: 1500.5 }));
  assert.throws(() => insert({ direction: 'plus' }));
  assert.throws(() => insert({ month: '2026-1' }));
  assert.throws(() => insert({ month: 'abcd-ef' }));
  assert.throws(() => insert({ status: 'done' }));
  assert.throws(() => insert({ tax_mode: 'half' }));
  assert.throws(() => insert({ tax_cap: -5 }));
  assert.throws(() => insert({ insurance_base: 1.5 }));
  assert.throws(() => insert({ username: '' }));
  for (const mode of ['none', 'full', 'cap'])
    assert.ok(insert({ tax_mode: mode, tax_cap: mode === 'cap' ? 1000000 : null }));
});

test('pay_entries: CHECK nhãn 1 đến 80 ký tự, lý do 10 đến 300 ký tự (biên)', () => {
  assert.ok(insert({ label: 'a'.repeat(80) }));
  assert.throws(() => insert({ label: 'a'.repeat(81) }));
  assert.throws(() => insert({ label: '' }));
  assert.ok(insert({ reason: 'x'.repeat(10) }));
  assert.ok(insert({ reason: 'x'.repeat(300) }));
  assert.throws(() => insert({ reason: 'x'.repeat(9) }));
  assert.throws(() => insert({ reason: 'x'.repeat(301) }));
});

test('pay_entries: cấm DELETE ở mọi trạng thái', () => {
  const id = insert();
  assert.throws(() => db.prepare('DELETE FROM pay_entries WHERE id = ?').run(id), /không được xoá/);
  approve(id);
  assert.throws(() => db.prepare('DELETE FROM pay_entries WHERE id = ?').run(id), /không được xoá/);
  assert.ok(row(id));
});

test('pay_entries: khoản chờ duyệt vẫn sửa được số tiền; người lập và giờ lập thì không', () => {
  const id = insert();
  db.prepare('UPDATE pay_entries SET amount = 700000, rev = rev + 1 WHERE id = ?').run(id);
  assert.equal(row(id).amount, 700000);
  assert.throws(() => db.prepare("UPDATE pay_entries SET created_by = 'khac' WHERE id = ?").run(id), /người lập/);
  assert.throws(() =>
    db.prepare("UPDATE pay_entries SET created_at = '2020-01-01T00:00:00.000Z' WHERE id = ?").run(id)
  );
});

test('pay_entries: sau approved không đổi được tiền, hướng, thuế, bảo hiểm, người, tháng', () => {
  const id = insert({ tax_mode: 'cap', tax_cap: 1000000, insurance_base: 2000000 });
  approve(id);
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
    assert.throws(
      () => db.prepare(`UPDATE pay_entries SET ${col} = ? WHERE id = ?`).run(val, id),
      /đã duyệt không được sửa/,
      col
    );
  }
  const r = row(id);
  assert.equal(r.amount, 500000);
  assert.equal(r.direction, 'add');
  assert.equal(r.tax_cap, 1000000);
});

test('pay_entries: sau approved vẫn đổi được nhãn, ghi chú và cho phép approved sang void', () => {
  const id = insert();
  approve(id);
  db.prepare("UPDATE pay_entries SET label = 'Nhãn mới', decision_note = 'ok', rev = rev + 1 WHERE id = ?").run(id);
  assert.equal(row(id).label, 'Nhãn mới');
  db.prepare("UPDATE pay_entries SET status = 'void', rev = rev + 1 WHERE id = ?").run(id);
  assert.equal(row(id).status, 'void');
});

test('pay_entries: approved không lùi về pending/rejected; void là trạng thái cuối', () => {
  const id = insert();
  approve(id);
  assert.throws(() => db.prepare("UPDATE pay_entries SET status = 'pending' WHERE id = ?").run(id), /không lùi/);
  assert.throws(() => db.prepare("UPDATE pay_entries SET status = 'rejected' WHERE id = ?").run(id), /không lùi/);
  db.prepare("UPDATE pay_entries SET status = 'void' WHERE id = ?").run(id);
  assert.throws(() => db.prepare("UPDATE pay_entries SET status = 'approved' WHERE id = ?").run(id), /đã huỷ/);
  assert.throws(() => db.prepare("UPDATE pay_entries SET status = 'pending' WHERE id = ?").run(id), /đã huỷ/);
});

test('pay_entries: chờ duyệt đi được sang rejected và void', () => {
  const a = insert(),
    b = insert();
  db.prepare(
    "UPDATE pay_entries SET status = 'rejected', decided_by = 'pe_boss', decision_note = 'sai số' WHERE id = ?"
  ).run(a);
  db.prepare("UPDATE pay_entries SET status = 'void' WHERE id = ?").run(b);
  assert.equal(row(a).status, 'rejected');
  assert.equal(row(b).status, 'void');
});

test('pay_entries: truy vấn theo (tháng, trạng thái) và (người, tháng) dùng chỉ mục', () => {
  const plan = sql =>
    db
      .prepare('EXPLAIN QUERY PLAN ' + sql)
      .all()
      .map(r => r.detail)
      .join(' | ');
  assert.match(
    plan("SELECT * FROM pay_entries WHERE month = '2026-10' AND status = 'pending'"),
    /pay_entries_month_status/
  );
  assert.match(plan("SELECT * FROM pay_entries WHERE username = 'u' AND month = '2026-10'"), /pay_entries_user_month/);
});

test('pay_entries: migration chạy lại trên DB đã có bảng không mất dòng (CREATE IF NOT EXISTS)', () => {
  const id = insert({ amount: 123456 });
  const before = db.prepare('SELECT count(*) n FROM pay_entries').get().n;
  const sql = db
    .prepare("SELECT name, sql FROM sqlite_master WHERE name LIKE 'pay_entries%' AND sql IS NOT NULL")
    .all();
  assert.ok(sql.length >= 5, 'bảng, hai chỉ mục, ba trigger');
  assert.equal(row(id).amount, 123456);
  assert.ok(before >= 1);
});

function person(username, type, contract) {
  store.upsertStaff({
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

test('defaultContract: không đặt resolver giữ hành vi cũ (tts short, ctv và nv long)', () => {
  store.setDefaultContractResolver(null);
  person('dc_tts', 'tts');
  person('dc_ctv', 'ctv');
  person('dc_nv', 'nv');
  db.prepare("UPDATE staff SET contract = NULL WHERE username LIKE 'dc_%'").run();
  assert.equal(store.getStaff('dc_tts').contract, 'short');
  assert.equal(store.getStaff('dc_ctv').contract, 'long');
  assert.equal(store.getStaff('dc_nv').contract, 'long');
  assert.equal(store.getStaff('dc_tts').insured, false);
  assert.equal(store.getStaff('dc_nv').insured, true);
});

test('defaultContract: resolver quyết định cho mã mới, giá trị lạ hoặc lỗi thì rơi về hành vi cũ', () => {
  person('dc_new', 'moi');
  db.prepare("UPDATE staff SET contract = NULL WHERE username LIKE 'dc_%'").run();
  const map = { moi: 'short' };
  store.setDefaultContractResolver(type => map[type]);
  assert.equal(store.getStaff('dc_new').contract, 'short');
  assert.equal(store.getStaff('dc_nv').contract, 'long', 'resolver trả undefined: giữ cũ');
  assert.equal(store.getStaff('dc_tts').contract, 'short');
  store.setDefaultContractResolver(() => 'khac');
  assert.equal(store.getStaff('dc_new').contract, 'long', 'giá trị lạ: giữ cũ');
  assert.equal(store.getStaff('dc_tts').contract, 'short');
  store.setDefaultContractResolver(() => {
    throw new Error('lỗi tra khoá');
  });
  assert.equal(store.getStaff('dc_nv').contract, 'long', 'resolver ném lỗi: giữ cũ');
  store.setDefaultContractResolver('không phải hàm');
  assert.equal(store.getStaff('dc_tts').contract, 'short');
});

test('defaultContract: hợp đồng đã lưu trong hồ sơ luôn thắng resolver', () => {
  store.setDefaultContractResolver(() => 'short');
  person('dc_set', 'nv', 'long');
  assert.equal(store.getStaff('dc_set').contract, 'long');
});
