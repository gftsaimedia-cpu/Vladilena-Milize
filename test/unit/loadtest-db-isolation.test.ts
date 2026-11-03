'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');

// Run the load-test entrypoint with a fake admin pool; no DB, child process or socket is opened.
async function runSetup({
  failure = 'load'
}: { failure?: 'load' | 'create' | 'seed' | 'server' | 'signal' | 'spawn' } = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../../scripts/loadtest/run.ts'), 'utf8');
  const statements: string[] = [];
  const messages: string[] = [];
  let ended = false;
  let seedStoreClosed = false;
  let databaseEnvironment: Record<string, string> | undefined;
  let serverEnvironment: Record<string, string> | undefined;
  let sentToChild = false;
  let unhandledSpawnError = false;
  let finish: (exitCode: number) => void;
  const finished = new Promise<number>(resolve => (finish = resolve));
  const environment: Record<string, string> = {
    LT_DATABASE_URL: 'postgres://example.invalid/load-control',
    DATABASE_URL: 'postgres://example.invalid/application',
    PG_TEST_URL: 'postgres://example.invalid/test',
    DB_PATH: '/fake/dev-db'
  };
  const fakeProcess = {
    env: environment,
    argv: ['node', 'scripts/loadtest/run.ts'],
    execPath: 'node',
    set exitCode(value: number) {
      finish(value);
    }
  };
  const context = {
    __dirname: path.join(__dirname, '../../scripts/loadtest'),
    process: fakeProcess,
    console: { error: (message: string) => messages.push(message) },
    URL,
    require(name: string) {
      if (name === 'pg')
        return {
          Pool: class {
            async query(sql: string) {
              statements.push(sql);
              if (failure === 'create' && sql.startsWith('CREATE DATABASE ')) throw new Error('CREATE failed');
            }
            async end() {
              ended = true;
            }
          }
        };
      if (name === '../../src/platform/db') {
        databaseEnvironment = { ...environment };
        if (failure === 'load') throw new Error('stop before loading application DB');
        return { db: { close: async () => (seedStoreClosed = true) } };
      }
      if (name === '../../src/platform/auth') return { hashPassword: () => 'fake-hash' };
      if (name === './kit/scenarios') return { SCENARIOS: {}, DEFAULT_ORDER: [] };
      if (name === './kit/stats') return {};
      if (name === './kit/seed')
        return {
          DEFAULT_PREFIX: 'lt_',
          async seedLoadUsers() {
            if (failure === 'seed') throw new Error('seed failed');
          }
        };
      if (name === './kit/reconcile') return {};
      if (name === 'node:child_process')
        return {
          spawn(_executable: string, _args: string[], options: any) {
            serverEnvironment = { ...options.env };
            if (failure === 'signal')
              return {
                exitCode: null,
                signalCode: 'SIGKILL',
                connected: false,
                on() {},
                send() {
                  sentToChild = true;
                  throw new Error('IPC closed');
                }
              };
            if (failure === 'spawn') {
              let onError: ((error: Error) => void) | undefined;
              const child = {
                exitCode: null,
                signalCode: null,
                connected: false,
                kill() {},
                on(event: string, callback: (error: Error) => void) {
                  if (event === 'error') onError = callback;
                },
                once(event: string, callback: (error: Error) => void) {
                  if (event === 'error') onError = callback;
                }
              };
              queueMicrotask(() => {
                if (onError) onError(new Error('spawn failed'));
                else {
                  unhandledSpawnError = true;
                  fakeProcess.exitCode = 2;
                }
              });
              return child;
            }
            return { exitCode: 1, on() {} };
          }
        };
      if (name.startsWith('node:')) return require(name);
      throw new Error(`Unexpected module: ${name}`);
    },
    fetch: async () => ({ ok: false }),
    setTimeout: failure === 'signal' || failure === 'spawn' ? (callback: () => void) => (callback(), 0) : setTimeout,
    clearTimeout
  };
  vm.runInNewContext(stripTypeScriptTypes(source, { mode: 'strip' }), context, { filename: 'loadtest/run.ts' });
  const exitCode = await finished;
  return {
    statements,
    messages,
    ended,
    seedStoreClosed,
    databaseEnvironment,
    serverEnvironment,
    sentToChild,
    unhandledSpawnError,
    exitCode
  };
}

test('a failure while loading the app cleans up only the newly created load-test DB', async () => {
  const result = await runSetup();
  assert.equal(result.exitCode, 2);
  const create = result.statements.find(sql => sql.startsWith('CREATE DATABASE '));
  assert.ok(create);
  const name = create.slice('CREATE DATABASE '.length);
  assert.match(name, /^lt_[0-9a-f]+$/);
  assert.deepEqual(result.statements, [create, `DROP DATABASE IF EXISTS ${name} WITH (FORCE)`]);
  assert.equal(result.ended, true);
  assert.ok(result.databaseEnvironment);
  assert.equal(new URL(result.databaseEnvironment.DATABASE_URL).pathname, `/${name}`);
  assert.equal(result.databaseEnvironment.DB_PATH, '');
  assert.equal(result.databaseEnvironment.PG_TEST_URL, '');
});

test('a failed CREATE closes the admin pool without dropping an existing DB', async () => {
  const result = await runSetup({ failure: 'create' });
  assert.equal(result.exitCode, 2);
  assert.equal(result.ended, true);
  assert.equal(result.statements.length, 1);
  assert.match(result.statements[0], /^CREATE DATABASE lt_[0-9a-f]+$/);
  assert.equal(result.databaseEnvironment, undefined);
});

test('a seed failure closes the application connection and cleans up the temporary DB', async () => {
  const result = await runSetup({ failure: 'seed' });
  assert.equal(result.exitCode, 2);
  assert.equal(result.seedStoreClosed, true);
  assert.equal(result.ended, true);
  assert.match(result.statements[1], /^DROP DATABASE IF EXISTS lt_[0-9a-f]+ WITH \(FORCE\)$/);
});

test('the child server inherits the temporary DB selection when startup fails', async () => {
  const result = await runSetup({ failure: 'server' });
  assert.equal(result.exitCode, 2);
  assert.equal(result.seedStoreClosed, true);
  assert.ok(result.serverEnvironment);
  assert.equal(result.serverEnvironment.DATABASE_URL, result.databaseEnvironment?.DATABASE_URL);
  assert.equal(result.serverEnvironment.DB_PATH, '');
  assert.equal(result.serverEnvironment.PG_TEST_URL, '');
  assert.equal(result.ended, true);
  assert.match(result.statements[1], /^DROP DATABASE IF EXISTS lt_[0-9a-f]+ WITH \(FORCE\)$/);
});

test('a child killed by a signal is recognized as exited and its temporary DB is cleaned up', async () => {
  const result = await runSetup({ failure: 'signal' });
  assert.equal(result.exitCode, 2);
  assert.equal(result.sentToChild, false);
  assert.ok(result.messages.some(message => /thoát sớm/.test(message)));
  assert.equal(result.ended, true);
  assert.match(result.statements[1], /^DROP DATABASE IF EXISTS lt_[0-9a-f]+ WITH \(FORCE\)$/);
});

test('an asynchronous spawn error is handled and its temporary DB is cleaned up', async () => {
  const result = await runSetup({ failure: 'spawn' });
  assert.equal(result.exitCode, 2);
  assert.equal(result.unhandledSpawnError, false);
  assert.ok(result.messages.some(message => /spawn failed/.test(message)));
  assert.equal(result.ended, true);
  assert.match(result.statements[1], /^DROP DATABASE IF EXISTS lt_[0-9a-f]+ WITH \(FORCE\)$/);
});
