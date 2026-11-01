// Mốc tổng KPI đạt (75 %): type.<loại>.kpiPass trong bộ tham số mặc định phải bằng kpiPass của khối công thức cũ đã đóng băng. Máy chủ không giữ
// bản sao KPI_PASS (đọc type.<loại>.kpiPass theo tháng); hành vi qua API ở test/api/server-reads-params.test.ts.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { serverSource } = require('../helpers/server-source');
const { DEFAULTS } = require('../../src/engine/payroll-params');
const { createLegacyEngine } = require('../helpers/legacy-payroll');

const { TYPES } = createLegacyEngine();

test('type.<loại>.kpiPass trong DEFAULTS bằng 75 và bằng kpiPass của mọi loại có KPI trong khối cũ', () => {
  const withKpi = Object.keys(TYPES).filter(type => TYPES[type].kpi);
  assert.deepEqual(withKpi.sort(), ['ctv', 'nv']);
  for (const type of withKpi) {
    assert.equal(DEFAULTS[`type.${type}.kpiPass`], TYPES[type].kpiPass, `type.${type}.kpiPass`);
    assert.equal(DEFAULTS[`type.${type}.kpiPass`], 75);
  }
});

test('loại không có KPI (TTS) không có kpiPass trong khối cũ và DEFAULTS không có type.tts.kpiPass có giá trị', () => {
  assert.equal(TYPES.tts.kpi, false);
  assert.equal(TYPES.tts.kpiPass, undefined);
  assert.ok(!DEFAULTS['type.tts.kpiPass'], 'TTS không có mốc đạt KPI');
});

test('server.js không còn bản sao KPI_PASS (đọc type.<loại>.kpiPass qua typeParam)', () => {
  const source = serverSource(); // kpiScoreItem nằm ở server.js hoặc src/domain/kpi.js
  assert.doesNotMatch(source, /^const KPI_PASS = /m);
  assert.match(source, /typeParam\(params, staff\.type, 'kpiPass'\)/);
});
