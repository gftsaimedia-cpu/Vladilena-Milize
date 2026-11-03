'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PostgresDatabase } = require('../../src/data/postgres-database');

test('requires a concrete PostgreSQL URL instead of opening an implicit local database', () => {
  for (const options of [{}])
    assert.throws(() => new PostgresDatabase(options), /URL PostgreSQL tường minh/);
});

test('rejects non-empty legacy database options even when a PostgreSQL URL is present', () => {
  const url = 'postgres://user:secret@127.0.0.1:1/should_not_connect';
  for (const options of [{ memory: true }, { dataDir: './old-data' }, { isolatedFrom: 'postgres://host/control' }]) {
    assert.throws(() => new PostgresDatabase({ url, ...options }), /không hỗ trợ cấu hình database cũ/);
  }
});

test('does not accept a malformed or non-PostgreSQL URL', () => {
  for (const url of ['not a url', 'https://example.invalid/app']) {
    assert.throws(() => new PostgresDatabase({ url }), /Địa chỉ PostgreSQL không hợp lệ/);
  }
});
