'use strict';
// SettingsRepository (Kysely, src/data) chạy trên kết nối của ứng dụng: SQLite hoặc PostgreSQL tuỳ DB_DIALECT; cùng một câu lệnh Kysely
// phải cho cùng kết quả ở cả hai (PostgreSQL qua lớp dịch SQL).
require('../helpers/require-isolated-database');
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const store = require('../../src/platform/db');
const { createQueryBuilder, SettingsRepository } = require('../../src/data');

after(() => store.db.close());

test('SettingsRepository: set rồi get trả đúng giá trị JSON, ghi đè khi đặt lại, fallback khi chưa có', async () => {
  await store.ready;
  const repo = new SettingsRepository(createQueryBuilder(store.db));
  assert.equal(await repo.get('khong_co', 'mac-dinh'), 'mac-dinh');
  assert.equal(await repo.has('repo_thu'), false);
  await repo.set('repo_thu', { a: 1, ten: 'Việt' });
  assert.deepEqual(await repo.get('repo_thu'), { a: 1, ten: 'Việt' });
  assert.equal(await repo.has('repo_thu'), true);
  await repo.set('repo_thu', [1, 2, 3]);
  assert.deepEqual(await repo.get('repo_thu'), [1, 2, 3]);
});

test('SettingsRepository: store.getSetting/setSetting dùng cùng repository và nằm trong giao dịch của store.transaction', async () => {
  await store.ready;
  await store.setSetting('giao_dich_thu', 1);
  await assert.rejects(
    () =>
      store.transaction(async () => {
        await store.setSetting('giao_dich_thu', 2);
        throw new Error('hoàn tác');
      }),
    /hoàn tác/
  );
  assert.equal(await store.getSetting('giao_dich_thu'), 1, 'lệnh Kysely trong giao dịch bị hoàn tác cùng giao dịch');
});

test('Kysely biên dịch theo cú pháp gốc của dialect đang chạy: ? trên SQLite, $1 trên PostgreSQL (không qua bộ dịch)', async () => {
  await store.ready;
  const qb = createQueryBuilder(store.db);
  const compiled = qb.selectFrom('settings').select('value_json').where('key', '=', 'k').compile();
  const placeholder = typeof store.db.native === 'function' ? '$1' : '?';
  assert.equal(compiled.sql, `select "value_json" from "settings" where "key" = ${placeholder}`);
  assert.deepEqual(compiled.parameters, ['k']);
});
