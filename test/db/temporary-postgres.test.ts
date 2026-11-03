'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Client, Pool } = require('pg');
const { TemporaryPostgres } = require('../../scripts/dev/temporary-postgres');

const { testControlUrl: testUrl } = require('../helpers/postgres-control');
let admin: any;

before(() => {
  admin = new Pool({ connectionString: testUrl, max: 1 });
});
after(async () => {
  await admin.end();
});

const exists = async (name: string) =>
  !!(await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [name])).rowCount;

test('creates a separate database and removes it after use', async () => {
  const temporary = await TemporaryPostgres.create(testUrl, 'test');
  let client: any;
  try {
    assert.match(temporary.name, /^luong_test_[0-9a-f]{24}$/);
    assert.equal(await exists(temporary.name), true);
    assert.notEqual(new URL(temporary.url).pathname, new URL(testUrl).pathname);
    client = new Client({ connectionString: temporary.url });
    await client.connect();
    await client.query('CREATE TABLE sample (value INTEGER NOT NULL)');
    await client.query('INSERT INTO sample VALUES (7)');
    assert.equal((await client.query('SELECT value FROM sample')).rows[0].value, 7);
  } finally {
    if (client) await client.end();
    await temporary.close();
  }
  assert.equal(await exists(temporary.name), false);
  await temporary.close();
});

test('creates an explicitly named demo database and removes only that owned database', async () => {
  const temporary = await TemporaryPostgres.create(testUrl, 'demo');
  try {
    assert.match(temporary.name, /^luong_demo_[0-9a-f]{24}$/);
    assert.equal(await exists(temporary.name), true);
  } finally {
    await temporary.close();
  }
  assert.equal(await exists(temporary.name), false);
});

test('a name collision never removes the previously created database', async () => {
  const originalRandom = crypto.randomBytes;
  const bytes = originalRandom(12);
  let first: any;
  try {
    crypto.randomBytes = (size: number, ...args: any[]) =>
      size === 12 && args.length === 0 ? Buffer.from(bytes) : originalRandom(size, ...args);
    first = await TemporaryPostgres.create(testUrl, 'test');
    await assert.rejects(() => TemporaryPostgres.create(testUrl, 'test'), /already exists/);
    assert.equal(await exists(first.name), true);
  } finally {
    crypto.randomBytes = originalRandom;
    if (first) await first.close();
  }
});

test('a callback failure still removes the owned database', async () => {
  let name: string | undefined;
  await assert.rejects(
    () =>
      TemporaryPostgres.using(testUrl, 'test', async (temporary: any) => {
        name = temporary.name;
        assert.equal(await exists(name!), true);
        throw new Error('callback failed');
      }),
    /callback failed/
  );
  assert.ok(name);
  assert.equal(await exists(name), false);
});

test('waits for a connection that is closing instead of terminating it immediately', async () => {
  const temporary = await TemporaryPostgres.create(testUrl, 'test');
  const client = new Client({ connectionString: temporary.url });
  const errors: Error[] = [];
  client.on('error', (error: Error) => errors.push(error));
  let timer: NodeJS.Timeout | undefined;
  try {
    await client.connect();
    const ended = new Promise<void>(resolve => client.once('end', resolve));
    timer = setTimeout(() => client.end(), 150);
    await Promise.all([temporary.close(), ended]);
    assert.deepEqual(errors, []);
    assert.equal(await exists(temporary.name), false);
  } finally {
    if (timer) clearTimeout(timer);
    await client.end().catch(() => {});
    await temporary.close();
  }
});

test('reports cleanup failure and still closes the admin pool', async () => {
  const temporary = await TemporaryPostgres.create(testUrl, 'test');
  const originalQuery = Pool.prototype.query;
  const originalEnd = Pool.prototype.end;
  let ended = false;
  try {
    Pool.prototype.query = function (query: any, ...args: any[]) {
      if (typeof query === 'string' && query.startsWith(`DROP DATABASE ${temporary.name} `))
        return Promise.reject(new Error('cleanup failed'));
      return originalQuery.call(this, query, ...args);
    };
    Pool.prototype.end = function (...args: any[]) {
      ended = true;
      return originalEnd.call(this, ...args);
    };
    await assert.rejects(() => temporary.close(), /cleanup failed/);
    assert.equal(ended, true);
    assert.equal(await exists(temporary.name), true);
  } finally {
    Pool.prototype.query = originalQuery;
    Pool.prototype.end = originalEnd;
    await admin.query(`DROP DATABASE ${temporary.name} WITH (FORCE)`);
  }
});

test('rejects an unsupported purpose before creating a database', async () => {
  await assert.rejects(() => TemporaryPostgres.create(testUrl, 'test;drop database x'), /purpose/i);
});

test('rejects an application database as the control database before connecting', async () => {
  const originalQuery = Pool.prototype.query;
  let queries = 0;
  try {
    Pool.prototype.query = function () {
      queries++;
      return Promise.reject(new Error('unexpected connection'));
    };
    await assert.rejects(
      () => TemporaryPostgres.create('postgresql://example.invalid/luong_dev', 'test'),
      /control database/i
    );
    assert.equal(queries, 0);
  } finally {
    Pool.prototype.query = originalQuery;
  }
});
