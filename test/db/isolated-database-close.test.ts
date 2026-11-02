'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Client, Pool } = require('pg');
const { PostgresDatabase } = require('../../src/data/postgres-database');

const testUrl = process.env.PG_TEST_URL;
if (!testUrl) throw new Error('PG_TEST_URL is required: use a separate PostgreSQL test server.');

test('closing a temporary database allows another connection to close cleanly first', async () => {
  const owner = new PostgresDatabase({ isolatedFrom: testUrl });
  let client: any;
  let timer: NodeJS.Timeout | undefined;
  let closed = false;
  try {
    await owner.ready;
    const name = (await owner.prepare('SELECT current_database() AS name').get()).name;
    const target = new URL(testUrl);
    target.pathname = `/${name}`;
    client = new Client({ connectionString: target.toString() });
    const errors: Error[] = [];
    client.on('error', (error: Error) => errors.push(error));
    await client.connect();
    const ended = new Promise<void>(resolve => client.once('end', resolve));
    timer = setTimeout(() => client.end(), 150);
    await Promise.all([owner.close(), ended]);
    closed = true;
    assert.deepEqual(errors, []);
  } finally {
    if (timer) clearTimeout(timer);
    if (client) await client.end().catch(() => {});
    if (!closed) await owner.close();
  }
});

test('a failed CREATE DATABASE does not attempt to drop any database', async () => {
  const originalNow = Date.now;
  const originalQuery = Pool.prototype.query;
  const drops: string[] = [];
  let first: any;
  let second: any;
  let secondClosed = false;
  try {
    Date.now = () => 1893456000000;
    first = new PostgresDatabase({ isolatedFrom: testUrl });
    await first.ready;
    Pool.prototype.query = function (query: any, ...args: any[]) {
      if (typeof query === 'string' && /^DROP DATABASE\b/i.test(query)) drops.push(query);
      return originalQuery.call(this, query, ...args);
    };
    second = new PostgresDatabase({ isolatedFrom: testUrl });
    await assert.rejects(second.ready, /already exists/);
    await second.close();
    secondClosed = true;
    assert.deepEqual(drops, []);
    assert.ok(await first.prepare('SELECT 1 AS ok').get());
  } finally {
    Pool.prototype.query = originalQuery;
    Date.now = originalNow;
    if (second && !secondClosed) await second.close();
    if (first) await first.close();
  }
});
