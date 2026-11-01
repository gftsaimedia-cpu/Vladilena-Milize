'use strict';
// Không nhập công thức: mọi khoá formula.* bị khoá (editableBy locked), PUT /api/settings/params từ chối 400 PARAM_LOCKED kèm lý do, không ghi gì;
// bộ máy vẫn chạy công thức có sẵn (DEFAULT_GRAPH) nên tiền không đổi.
const P = require('../helpers/position-api');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const registry = require('../../src/params/registry');

const { F } = P;

before(F.start);
after(F.stop);

test('formula-khoá: bảy khoá formula.* trong registry là locked kèm lý do', () => {
  const entries = registry.entries.filter(e => e.id.startsWith('formula.'));
  assert.equal(entries.length, 7);
  for (const e of entries) {
    assert.equal(e.editableBy, 'locked', e.id);
    assert.equal(e.lockReason, 'Công thức do hệ thống giữ, cấu hình bằng biểu mẫu', e.id);
  }
});

test('formula-khoá: lưu công thức qua PUT /api/settings/params bị 400 PARAM_LOCKED với lý do, kể cả giá trị null, và không ghi gì', async () => {
  const M = await P.setupMonth();
  const before = await F.snapshot();
  for (const value of ['tổng theo ngày', null]) {
    const res = await P.saveChanges([{ key: 'formula.tamUng', value }], { month: M });
    assert.equal(res.status, 400, JSON.stringify(res.data));
    assert.equal(res.data.code, 'PARAM_LOCKED');
    assert.match(res.data.error, /Công thức do hệ thống giữ, cấu hình bằng biểu mẫu/);
  }
  assert.deepEqual(F.changedTables(before, await F.snapshot()), []);
});
