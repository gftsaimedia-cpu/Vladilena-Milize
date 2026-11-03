'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

test('a subprocess inherits the TypeScript loader', () => {
  const child = spawnSync(process.execPath, ['-e', "require('./src/domain/employee/person-name')"], {
    cwd: process.cwd(),
    encoding: 'utf8'
  });
  assert.equal(child.status, 0, child.stderr);
});
