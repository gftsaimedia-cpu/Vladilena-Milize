'use strict';
// DB demo chỉ có MỘT "bây giờ" (ngày today lúc S.NOW_TIME giờ Việt Nam, ghi ở khoá demo_dataset) và serve-demo chạy đồng hồ giả từ đúng mốc đó.
// scripts/db/demo/selfcheck.js → clockProblems báo mọi phiên, lượt bấm hay yêu cầu điều chỉnh nằm sau mốc; phiên còn mở phải thuộc ngày today trở về trước.
// Bài dựng bộ dữ liệu demo (người bịa demo_*) trong bộ nhớ, không mở data/demo.sqlite hay data/luong.sqlite.
process.env.DB_PATH = ':memory:';
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const S = require('../../scripts/db/demo/scenarios.js');
const H = require('../../scripts/db/demo/helpers.js');
const gen = require('../../scripts/db/demo/generate.js');
const selfcheck = require('../../scripts/db/demo/selfcheck.js');
const store = require('../../lib/db');
const { loadPayroll } = require('../../lib/ai/payroll-loader.js');

const today = S.TODAY;

before(() => {
  const payroll = loadPayroll();
  const generator = gen.create({ store, payroll, passHash: H.fixedHash('demo-test'), today });
  generator.seedAll(S.PERSONAS, S.ADMINS, []);
  store.setSetting('demo_dataset', { version: 1, today, personas: S.PERSONAS.length, bulk: 0 });
});

test('L4: bộ dữ liệu demo dựng trong bộ nhớ không có phiên, lượt bấm hay yêu cầu nào sau "bây giờ" của ngày today (clockProblems rỗng)', () => {
  assert.equal(S.NOW_LOCAL, `${S.TODAY}T${S.NOW_TIME}`, 'một mốc giờ duy nhất cho dữ liệu và đồng hồ');
  assert.deepEqual(selfcheck.clockProblems({ store, today }), []);
});

test('L4: clockProblems báo phiên còn mở thuộc ngày sau today và khoá demo_dataset ghi sai ngày', () => {
  assert.ok(
    selfcheck.clockProblems({ store, today: '2026-11-20' }).some(p => p.includes('demo_dataset')),
    'ngày dựng khác ngày ghi ở khoá thì phải báo'
  );
  // mỗi người chỉ có tối đa một phiên đang mở: chọn người chưa có
  const username = store.db
    .prepare(
      "SELECT username FROM staff WHERE username NOT IN (SELECT username FROM attendance_sessions WHERE state = 'open') LIMIT 1"
    )
    .get().username;
  const entry = { kind: 'pending', presIn: `${today}T08:00:00+07:00` };
  const futureDate = '2026-11-27';
  const id = store.createSession(username, futureDate, 'open', entry);
  try {
    const problems = selfcheck.clockProblems({ store, today });
    assert.ok(
      problems.some(p => p.includes('phiên còn mở thuộc ngày')),
      JSON.stringify(problems)
    );
    assert.ok(
      problems.every(p => !p.includes(username)),
      'thông báo chỉ có số đếm, không có tên'
    );
  } finally {
    store.db.prepare('DELETE FROM attendance_sessions WHERE id = ?').run(id.id ?? id);
  }
  assert.deepEqual(selfcheck.clockProblems({ store, today }), []);
});

test('L4: serve-demo mặc định lấy --today từ khoá demo_dataset của chính DB demo, không còn ngày gõ cứng', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../scripts/db/demo/serve-demo.js'), 'utf8');
  assert.match(source, /datasetToday/, 'đọc today từ demo_dataset');
  assert.doesNotMatch(source, /'2026-11-02'/, 'không còn ngày mặc định gõ cứng');
});
