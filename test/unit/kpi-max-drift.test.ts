// Mức KPI tối đa theo bậc (level.<loại>.<bậc>.kpi) trong bộ tham số mặc định phải bằng levels[].kpi của khối công thức cũ đã đóng băng
// (test/fixtures/legacy-payroll-block.js). Máy chủ không giữ bản sao KPI_MAX mà đọc khoá này theo tháng (kpiMaxOf). Hành vi phía máy chủ
// (GET /api/kpi/scores báo kpiMax, PUT /api/kpi vượt mức là 400) nằm ở test/api/server-reads-params.test.ts.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { serverSource } = require('../helpers/server-source');
const { DEFAULTS } = require('../../src/engine/payroll-params');
const { createLegacyEngine } = require('../helpers/legacy-payroll');

const { TYPES } = createLegacyEngine();
const kpiLevels = (type?) => Object.keys(TYPES[type].levels).map(level => TYPES[type].levels[level].kpi);
const defaultLevels = (type?) => {
  const out: any[] = [];
  for (let n = 1; Object.hasOwn(DEFAULTS, `level.${type}.${n}.kpi`); n++) out.push(DEFAULTS[`level.${type}.${n}.kpi`]);
  return out;
};

test('DEFAULTS có level.<loại>.<bậc>.kpi đúng các loại có KPI trong khối cũ (ctv, nv) và không có loại nào khác (TTS không có KPI)', () => {
  const withKpi = Object.keys(TYPES).filter(type => TYPES[type].kpi);
  assert.deepEqual(withKpi.sort(), ['ctv', 'nv']);
  const inDefaults = new Set<any>(
    Object.keys(DEFAULTS)
      .filter(key => /^level\.[a-z]+\.\d+\.kpi$/.test(key) && DEFAULTS[key])
      .map(key => key.split('.')[1])
  );
  assert.deepEqual([...inDefaults].sort(), withKpi.sort());
});

for (const type of ['ctv', 'nv']) {
  test(`DEFAULTS level.${type}.<bậc>.kpi khớp từng bậc với levels[].kpi của khối cũ`, () => {
    assert.deepEqual(defaultLevels(type), kpiLevels(type));
  });
}

test('bậc trong khối cũ đánh số liên tục từ 1 nên khoá level.<loại>.<bậc>.kpi liên tục từ 1 (server.js đếm số bậc theo khoá liên tiếp)', () => {
  for (const type of ['ctv', 'nv']) {
    const levels = Object.keys(TYPES[type].levels).map(Number);
    assert.deepEqual(
      levels,
      levels.map((_, index) => index + 1),
      type
    );
  }
});

test('server.js không còn bản sao KPI_MAX (đọc khoá theo tháng qua kpiMaxOf)', () => {
  const source = serverSource(); // kpiMaxOf nằm ở server.js hoặc src/domain/kpi.js
  assert.doesNotMatch(
    source,
    /^const KPI_MAX = /m,
    'KPI_MAX là hằng số trùng: phải đọc level.<loại>.<bậc>.kpi từ bộ tham số'
  );
  assert.match(source, /level\.\$\{staff\.type\}\.\$\{staff\.level\}\.kpi/);
});
