'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { Client } = require('pg');

exports.run = (label, { fail = false, hold = false, grandchild = false } = {}) => {
  test(`isolated fixture ${label}`, async () => {
    const url = new URL(process.env.DATABASE_URL);
    const name = url.pathname.slice(1);
    assert.match(name, /^luong_test_[0-9a-f]{24}$/);
    assert.equal(process.env.PG_TEST_URL, '');
    assert.equal(process.env.DB_PATH, '');
    assert.ok(process.env.TEST_PG_CONTROL_URL);
    assert.equal(process.env.TEST_PG_DATABASE_NAME, name);
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    try {
      await client.connect();
      assert.equal((await client.query('SELECT current_database() AS name')).rows[0].name, name);
      await client.query('CREATE TABLE runner_fixture (label TEXT NOT NULL)');
      await client.query('INSERT INTO runner_fixture VALUES ($1)', [label]);
      fs.appendFileSync(process.env.PG_RUNNER_TRACE, `${label}:${name}\n`);
      if (process.env.PG_RUNNER_PID_FILE) fs.writeFileSync(process.env.PG_RUNNER_PID_FILE, String(process.pid));
      if (grandchild) {
        const descendant = spawn(process.execPath, [path.join(__dirname, 'grandchild.cjs')], {
          env: process.env,
          stdio: 'inherit'
        });
        descendant.unref();
        for (let attempt = 0; attempt < 200 && !fs.existsSync(process.env.PG_RUNNER_GRANDCHILD_PID_FILE); attempt++)
          await new Promise(resolve => setTimeout(resolve, 25));
      }
      if (hold) await new Promise(resolve => setTimeout(resolve, 30000));
      const peers = Number(process.env.PG_RUNNER_PEERS || '1');
      for (let attempt = 0; attempt < 200; attempt++) {
        if (fs.readFileSync(process.env.PG_RUNNER_TRACE, 'utf8').trim().split('\n').length >= peers) break;
        if (attempt === 199) throw new Error('parallel fixture did not start');
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      if (fail) throw new Error('intentional fixture failure');
    } finally {
      await client.end();
    }
  });
};
