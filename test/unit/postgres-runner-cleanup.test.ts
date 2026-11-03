'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { stripTypeScriptTypes } = require('node:module');

test('runner reports a cleanup failure without printing its connection URL', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../../scripts/test/postgres-runner.ts'), 'utf8');
  const messages: string[] = [];
  let finish: (code: number) => void;
  const finished = new Promise<number>(resolve => (finish = resolve));
  const context = {
    process: {
      platform: 'linux',
      argv: ['node', 'postgres-runner.ts', 'fake-test.ts'],
      env: { PG_TEST_URL: 'postgresql://private-user:private-password@example.invalid/luong_test_control' },
      execPath: 'node',
      cwd: () => '/tmp',
      on() {},
      off() {},
      set exitCode(code: number) {
        finish(code);
      }
    },
    console: { error: (...parts: unknown[]) => messages.push(parts.join(' ')) },
    URL,
    setTimeout,
    clearTimeout,
    require(name: string) {
      if (name === 'node:fs') return { ...require(name), globSync: () => ['fake-test.ts'] };
      if (name === '../dev/temporary-postgres')
        return {
          TemporaryPostgres: {
            async using(_url: string, _purpose: string, run: (db: any) => Promise<void>) {
              await run({ name: `luong_test_${'a'.repeat(24)}`, url: 'postgresql://example.invalid/test' });
              throw new Error('cleanup failed postgresql://private-user:private-password@example.invalid/test');
            }
          }
        };
      if (name === 'node:child_process')
        return {
          spawn() {
            const child = new EventEmitter();
            queueMicrotask(() => child.emit('close', 0, null));
            return child;
          }
        };
      if (name.startsWith('node:')) return require(name);
      throw new Error(`Unexpected module: ${name}`);
    }
  };
  vm.runInNewContext(stripTypeScriptTypes(source, { mode: 'strip' }), context, { filename: 'postgres-runner.ts' });
  assert.equal(await finished, 1);
  assert.match(messages.join('\n'), /cleanup failed/);
  assert.doesNotMatch(messages.join('\n'), /private-user|private-password|postgresql:\/\//);
});
