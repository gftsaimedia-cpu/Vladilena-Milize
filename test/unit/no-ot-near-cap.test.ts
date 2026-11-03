'use strict';
// Không còn luật AI ot-near-cap, ngưỡng của nó (holidayOtCapHours, otDayCapHours, holidayOtWarnHours) và khoá tham số của nó
// (ai.rule.otNearCap.enabled, ai.threshold.holidayOtWarnHours) ở bất kỳ đâu trong mã, tệp mô tả tham số, giao diện, script và spec.
require('../helpers/require-isolated-database');
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const store = require('../../src/platform/db');
const registry = require('../../src/params/registry');
const { DEFAULTS } = require('../../src/engine/payroll-params');

after(() => store.db.close());

const ROOT = path.join(__dirname, '../..');
const read = (file?) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const REMOVED_NAMES = [
  'ot-near-cap',
  'otNearCap',
  'ot_near_cap',
  'holidayOtWarnHours',
  'holidayOtCapHours',
  'otDayCapHours',
  'cumulativeHours',
  'hourEpsilon'
];
const REMOVED_KEYS = ['ai.rule.otNearCap.enabled', 'ai.threshold.holidayOtWarnHours', 'ai.limit.hourEpsilon'];

test('khoá tham số của luật không còn trong DEFAULTS và registry', () => {
  for (const key of REMOVED_KEYS) {
    assert.ok(!Object.hasOwn(DEFAULTS, key), `DEFAULTS ${key}`);
  }
  assert.equal(registry.entryFor('ai.threshold.holidayOtWarnHours'), null);
  assert.ok(!registry.entries.some(entry => /holidayOtCapHours|otDayCapHours|holidayOtWarnHours/.test(entry.id)));
});

test('không tệp nào trong lib, public, scripts, server.js và spec còn nhắc tên luật hoặc tên ngưỡng đã bỏ', async () => {
  const walk = (folder?) =>
    fs.readdirSync(path.join(ROOT, folder), { withFileTypes: true }).flatMap(entry => {
      const rel = path.posix.join(folder, entry.name);
      return entry.isDirectory() ? walk(rel) : /\.(js|cjs|ts|html|json|md)$/.test(entry.name) ? [rel] : [];
    });
  const files = [...walk('src'), ...walk('scripts'), ...walk('spec')];
  assert.ok(files.length > 100, 'quét đủ tệp');
  for (const file of files) {
    const text = await read(file);
    for (const name of REMOVED_NAMES) assert.ok(!text.includes(name), `${file}: ${name}`);
  }
});
