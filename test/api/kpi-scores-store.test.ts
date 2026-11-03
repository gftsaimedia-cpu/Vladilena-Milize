// Lưu trữ điểm KPI 5 thành phần (src/platform/db.ts): bảng kpi_scores, kpi_score_log (không có công tắc kpi_five_from).
// Điểm lưu số nguyên điểm × 100 (0..10000).
require('../helpers/require-isolated-database');
const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const store = require('../../src/platform/db');

const realNow = Date.now;
let clock = Date.parse('2026-10-15T03:00:00Z');
Date.now = () => clock;

const ALL = { wework: 10000, user: 9000, peer: 8000, manager: 8500, self: 10000 };
const scoresOf = async (u?, m?) => (await store.getKpiScores(u, m))?.scores;
const logRows = async () => (await store.db.prepare('SELECT COUNT(*) AS n FROM kpi_score_log').get()).n;
async function code(fn?) {
  try {
    await fn();
  } catch (error) {
    return error.code;
  }
  assert.fail('phải ném lỗi');
}

beforeEach(async () => {
  clock = Date.parse('2026-10-15T03:00:00Z');
  for (const table of ['kpi_score_log', 'kpi_scores', 'timesheets', 'settings'])
    await store.db.exec('DELETE FROM ' + table);
});
after(() => {
  Date.now = realNow;
  store.db.close();
});

test('tạo mới: ghi đủ 5 điểm, người và giờ tạo, mỗi điểm một dòng nhật ký (cũ null, mới, người sửa)', async () => {
  assert.equal(await store.getKpiScores('an', '2026-10'), null);
  const { item, changed } = await store.setKpiScores('an', '2026-10', ALL, 'admin', 'nhập từ kết quả đánh giá');
  assert.deepEqual(changed, ['wework', 'user', 'peer', 'manager', 'self']);
  assert.deepEqual(item.scores, ALL);
  assert.equal(item.complete, true);
  assert.equal(item.createdBy, 'admin');
  assert.equal(item.updatedBy, 'admin');
  assert.equal(item.createdAt, '2026-10-15T03:00:00.000Z');
  assert.deepEqual(await store.getKpiScores('an', '2026-10'), item);
  const log = await store.listKpiScoreLog({ username: 'an', month: '2026-10' });
  assert.equal(log.length, 5);
  assert.deepEqual(
    log.map(l => [l.field, l.oldValue, l.newValue, l.by, l.reason]),
    [
      ['wework', null, 10000, 'admin', 'nhập từ kết quả đánh giá'],
      ['user', null, 9000, 'admin', 'nhập từ kết quả đánh giá'],
      ['peer', null, 8000, 'admin', 'nhập từ kết quả đánh giá'],
      ['manager', null, 8500, 'admin', 'nhập từ kết quả đánh giá'],
      ['self', null, 10000, 'admin', 'nhập từ kết quả đánh giá']
    ]
  );
});

test('điểm 0 hợp lệ và khác null: chưa đủ điểm thì complete=false, có đủ 5 (kể cả 0) thì complete=true', async () => {
  await store.setKpiScores('an', '2026-10', { wework: 9000, user: 9000, peer: 9000, manager: 9000 }, 'admin');
  assert.equal((await store.getKpiScores('an', '2026-10')).complete, false);
  assert.equal((await scoresOf('an', '2026-10')).self, null);
  await store.setKpiScores('an', '2026-10', { self: 0 }, 'admin');
  const item = await store.getKpiScores('an', '2026-10');
  assert.equal(item.scores.self, 0);
  assert.equal(item.complete, true);
});

test('sửa một điểm: thêm đúng một dòng nhật ký (cũ, mới), các điểm khác và người tạo giữ nguyên', async () => {
  await store.setKpiScores('an', '2026-10', ALL, 'admin');
  clock += 60000;
  const { item, changed } = await store.setKpiScores('an', '2026-10', { peer: 7550 }, 'admin2', 'nhập lại');
  assert.deepEqual(changed, ['peer']);
  assert.deepEqual(item.scores, { ...ALL, peer: 7550 });
  assert.equal(item.createdBy, 'admin');
  assert.equal(item.createdAt, '2026-10-15T03:00:00.000Z');
  assert.equal(item.updatedBy, 'admin2');
  assert.equal(item.updatedAt, '2026-10-15T03:01:00.000Z');
  const log = await store.listKpiScoreLog({ username: 'an', month: '2026-10' });
  assert.equal(log.length, 6);
  assert.deepEqual(
    [log[5].field, log[5].oldValue, log[5].newValue, log[5].by, log[5].reason],
    ['peer', 8000, 7550, 'admin2', 'nhập lại']
  );
});

test('lưu lại đúng giá trị đang có: không đổi, không thêm nhật ký, không đổi updated_at', async () => {
  await store.setKpiScores('an', '2026-10', ALL, 'admin');
  const before = await store.getKpiScores('an', '2026-10');
  clock += 60000;
  const result = await store.setKpiScores('an', '2026-10', { wework: 10000, user: 9000 }, 'admin2');
  assert.deepEqual(result.changed, []);
  assert.deepEqual(await store.getKpiScores('an', '2026-10'), before);
  assert.equal(await logRows(), 5);
});

test('null xoá một điểm (ghi nhật ký cũ -> null); xoá điểm chưa có thì không tạo dòng nào', async () => {
  await store.setKpiScores('an', '2026-10', ALL, 'admin');
  const { item, changed } = await store.setKpiScores('an', '2026-10', { user: null }, 'admin');
  assert.deepEqual(changed, ['user']);
  assert.equal(item.scores.user, null);
  assert.equal(item.complete, false);
  const last = await (await store.listKpiScoreLog({ username: 'an', month: '2026-10' })).at(-1);
  assert.deepEqual([last.field, last.oldValue, last.newValue], ['user', 9000, null]);
  const none = await store.setKpiScores('binh', '2026-10', { peer: null }, 'admin');
  assert.deepEqual(none, { item: null, changed: [] });
  assert.equal(await store.getKpiScores('binh', '2026-10'), null);
});

test('giá trị sai thì không ghi gì: ngoài 0..10000, số thập phân, chuỗi, NaN, Infinity, boolean, mảng, BigInt', async () => {
  await store.setKpiScores('an', '2026-10', ALL, 'admin');
  const before = await store.getKpiScores('an', '2026-10');
  const logBefore = await logRows();
  for (const bad of [10001, -1, 87.5, 8750.5, '9000', NaN, Infinity, -Infinity, true, [9000], {}, 1e400, 10n]) {
    assert.equal(
      await code(() => store.setKpiScores('an', '2026-10', { peer: bad }, 'admin')),
      'KPI_SCORE_INVALID',
      String(bad)
    );
  }
  assert.deepEqual(await store.getKpiScores('an', '2026-10'), before);
  assert.equal(await logRows(), logBefore);
});

test('biên: 0 và 10000 hợp lệ, 10001 và -1 bị từ chối bằng mã KPI_SCORE_INVALID kèm khoá gây lỗi', async () => {
  await store.setKpiScores('an', '2026-10', { wework: 0, self: 10000 }, 'admin');
  assert.deepEqual(await scoresOf('an', '2026-10'), { wework: 0, user: null, peer: null, manager: null, self: 10000 });
  try {
    await store.setKpiScores('an', '2026-10', { manager: 10001 }, 'admin');
    assert.fail();
  } catch (error) {
    assert.equal(error.code, 'KPI_SCORE_INVALID');
    assert.equal(error.field, 'manager');
  }
});

test('một giá trị sai trong gói thì cả gói bị từ chối, kể cả khi khoá hợp lệ đứng trước: không dòng điểm, không nhật ký', async () => {
  assert.equal(
    await code(() => store.setKpiScores('an', '2026-10', { wework: 8000, user: 12000, peer: 7000 }, 'admin')),
    'KPI_SCORE_INVALID'
  );
  assert.equal(await store.getKpiScores('an', '2026-10'), null);
  assert.equal(await logRows(), 0);
});

test('giao dịch hoàn tác khi ghi dở dang: lỗi ở dòng nhật ký thì điểm, mức KPI và nhật ký đều về như cũ', async () => {
  await store.setKpiScores('an', '2026-10', { wework: 8000 }, 'admin');
  const before = await store.getKpiScores('an', '2026-10');
  const logBefore = await logRows();
  // Mô phỏng lỗi giữa chừng: dòng nhật ký của điểm "peer" bị chặn ở tầng DB, sau khi điểm và mức KPI đã ghi.
  await store.db.exec(
    "CREATE FUNCTION fail_peer_log_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'giả lập lỗi ghi nhật ký'; END $$"
  );
  await store.db.exec(
    "CREATE TRIGGER fail_peer_log BEFORE INSERT ON kpi_score_log FOR EACH ROW WHEN (NEW.field = 'peer') EXECUTE FUNCTION fail_peer_log_fn()"
  );
  try {
    await assert.rejects(
      async () => await store.setKpiScores('an', '2026-10', { wework: 9000, amt: 4000000, peer: 7000 }, 'admin'),
      /giả lập lỗi/
    );
  } finally {
    await store.db.exec('DROP TRIGGER fail_peer_log ON kpi_score_log');
    await store.db.exec('DROP FUNCTION fail_peer_log_fn()');
  }
  assert.deepEqual(await store.getKpiScores('an', '2026-10'), before);
  assert.equal(await logRows(), logBefore);
  assert.equal((await store.getSheet('an', '2026-10')).kpiAdmAmt, null);
  // sau lỗi, kho vẫn dùng được
  assert.deepEqual((await store.setKpiScores('an', '2026-10', { peer: 7000 }, 'admin')).changed, ['peer']);
});

test('ràng buộc CHECK của bảng chặn cả ghi trực tiếp ngoài kho (số thập phân, ngoài khoảng)', async () => {
  const insert = async (value?) =>
    await store.db
      .prepare(
        "INSERT INTO kpi_scores (username, month, wework, created_by, created_at, updated_by, updated_at) VALUES ('x', '2026-10', ?, 'a', 't', 'a', 't')"
      )
      .run(value);
  await assert.rejects(async () => await insert(87.5), /CHECK|check constraint|invalid input syntax/i);
  await assert.rejects(async () => await insert(10001), /CHECK|check constraint|invalid input syntax/i);
  await assert.rejects(async () => await insert(-1), /CHECK|check constraint|invalid input syntax/i);
  await assert.rejects(async () => await insert('90.5'), /CHECK|check constraint|invalid input syntax/i);
  await assert.rejects(async () => await insert('abc'), /CHECK|check constraint|invalid input syntax/i);
  await insert(8750);
  assert.equal((await store.getKpiScores('x', '2026-10')).scores.wework, 8750);
});

test('khoá lạ, gói rỗng, tháng sai, thiếu người: lỗi có mã, không ghi gì', async () => {
  assert.equal(await code(() => store.setKpiScores('an', '2026-10', { bonus: 100 }, 'admin')), 'KPI_KEY_UNKNOWN');
  assert.equal(await code(() => store.setKpiScores('an', '2026-10', { user_score: 100 }, 'admin')), 'KPI_KEY_UNKNOWN');
  assert.equal(await code(() => store.setKpiScores('an', '2026-10', {}, 'admin')), 'KPI_EMPTY_PATCH');
  assert.equal(
    await code(() => store.setKpiScores('an', '2026-10', { wework: undefined }, 'admin')),
    'KPI_EMPTY_PATCH'
  );
  assert.equal(await code(() => store.setKpiScores('an', '2026-10', null, 'admin')), 'KPI_EMPTY_PATCH');
  for (const month of ['2026-13', '2026-1', '', '2026-10-01', null, 202610])
    assert.equal(await code(() => store.setKpiScores('an', month, { wework: 1 }, 'admin')), 'KPI_MONTH_INVALID');
  assert.equal(await code(() => store.setKpiScores('', '2026-10', { wework: 1 }, 'admin')), 'KPI_ARGS_INVALID');
  assert.equal(await code(() => store.setKpiScores('an', '2026-10', { wework: 1 }, '')), 'KPI_ARGS_INVALID');
  assert.equal(await store.getKpiScores('an', '2026-10'), null);
  assert.equal(await logRows(), 0);
});

test('amt: ghi kpi_adm_amt của lịch, giữ nguyên kpi_adm_pct cũ, ghi nhật ký field amt; âm hoặc không phải số bị từ chối', async () => {
  await store.setSheet('an', '2026-10', {}, 80, 5000000);
  await store.setKpiApproval('an', '2026-10', 77, 4000000);
  const { item, changed } = await store.setKpiScores('an', '2026-10', { amt: 4500000 }, 'admin');
  assert.deepEqual(changed, ['amt']);
  assert.equal(item, null, 'chỉ đổi mức KPI thì không tạo dòng điểm');
  const sheet = await store.getSheet('an', '2026-10');
  assert.equal(sheet.kpiAdmAmt, 4500000);
  assert.equal(sheet.kpiAdmPct, 77, 'duyệt % cũ không bị đụng');
  assert.equal(sheet.kpiPct, 80);
  const log = await store.listKpiScoreLog({ username: 'an', month: '2026-10' });
  assert.deepEqual([log[0].field, log[0].oldValue, log[0].newValue], ['amt', 4000000, 4500000]);
  // chưa có dòng lịch: tự tạo dòng rỗng như setKpiApproval, và null xoá mức
  await store.setKpiScores('binh', '2026-10', { amt: 3000000 }, 'admin');
  assert.equal((await store.getSheet('binh', '2026-10')).kpiAdmAmt, 3000000);
  assert.deepEqual((await store.getSheet('binh', '2026-10')).days, {});
  await store.setKpiScores('binh', '2026-10', { amt: null }, 'admin');
  assert.equal((await store.getSheet('binh', '2026-10')).kpiAdmAmt, null);
  for (const bad of [-1, '4000000', NaN, Infinity, true])
    assert.equal(
      await code(() => store.setKpiScores('an', '2026-10', { amt: bad }, 'admin')),
      'KPI_AMT_INVALID',
      String(bad)
    );
  assert.equal((await store.getSheet('an', '2026-10')).kpiAdmAmt, 4500000);
});

test('điểm và amt cùng một lần ghi: cùng một giao dịch, nhật ký đủ các khoá', async () => {
  const { item, changed } = await store.setKpiScores('an', '2026-10', { wework: 9100, amt: 5000000 }, 'admin');
  assert.deepEqual(changed, ['wework', 'amt']);
  assert.equal(item.scores.wework, 9100);
  assert.equal((await store.getSheet('an', '2026-10')).kpiAdmAmt, 5000000);
  assert.equal(await logRows(), 2);
});

test('liệt kê theo tháng: chỉ đúng tháng đó, sắp theo username; tháng sai bị từ chối', async () => {
  await store.setKpiScores('binh', '2026-10', ALL, 'admin');
  await store.setKpiScores('an', '2026-10', { wework: 7000 }, 'admin');
  await store.setKpiScores('an', '2026-11', ALL, 'admin');
  assert.deepEqual(
    (await store.listKpiScores('2026-10')).map(r => [r.username, r.complete]),
    [
      ['an', false],
      ['binh', true]
    ]
  );
  assert.deepEqual(
    (await store.listKpiScores('2026-11')).map(r => r.username),
    ['an']
  );
  assert.deepEqual(await store.listKpiScores('2026-12'), []);
  assert.equal(await code(() => store.listKpiScores('2026-1')), 'KPI_MONTH_INVALID');
  assert.equal(await code(() => store.getKpiScores('an', 'abc')), 'KPI_MONTH_INVALID');
});

test('nhật ký lọc theo người, theo tháng và giới hạn, cũ nhất trước', async () => {
  await store.setKpiScores('an', '2026-10', { wework: 8000, user: 7000 }, 'admin');
  await store.setKpiScores('an', '2026-11', { wework: 9000 }, 'admin');
  await store.setKpiScores('binh', '2026-10', { wework: 6000 }, 'admin');
  assert.equal((await store.listKpiScoreLog()).length, 4);
  assert.equal((await store.listKpiScoreLog({ username: 'an' })).length, 3);
  assert.equal((await store.listKpiScoreLog({ month: '2026-10' })).length, 3);
  assert.equal((await store.listKpiScoreLog({ username: 'an', month: '2026-10', limit: 1 })).length, 1);
  const ids = (await store.listKpiScoreLog()).map(l => l.id);
  assert.deepEqual(
    ids,
    [...ids].sort((a: any, b: any) => a - b)
  );
});

test('lý do rỗng lưu thành null; chuỗi trắng hai đầu được cắt', async () => {
  await store.setKpiScores('an', '2026-10', { wework: 8000 }, 'admin', '   ');
  await store.setKpiScores('an', '2026-10', { user: 8000 }, 'admin', '  lý do  ');
  const log = await store.listKpiScoreLog();
  assert.equal(log[0].reason, null);
  assert.equal(log[1].reason, 'lý do');
});

test('KPI 5 thành phần không còn công tắc: store không còn getKpiFiveFrom, setKpiFiveFrom, getKpiFiveInfo', () => {
  assert.equal(store.getKpiFiveFrom, undefined);
  assert.equal(store.setKpiFiveFrom, undefined);
  assert.equal(store.getKpiFiveInfo, undefined);
});
