'use strict';
// Độ bền của bộ tham số khi một dòng param_versions hỏng hoặc sai khoá (sửa tay trong DB, hoặc dòng của khoá đã bị khoá): store.resolve phải BỎ QUA dòng đó
// và báo lại trong `skipped`, KHÔNG ném lỗi, vì mọi route đọc tham số theo tháng (monthParams) sẽ 500 và bảng lương không dùng được
// (src/params/store.ts ghi: "Dòng của khoá lạ, hoặc giá trị sai cấu trúc, bị bỏ qua và báo lại; không bao giờ làm hỏng bảng lương").
// File này chỉ có test chèn dòng hỏng (append-only nên dòng ở lại cho tới hết tiến trình): đặt riêng để không làm hỏng test khác.
const S = require('../helpers/settings-api');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { F, store } = S;

before(F.start);
after(F.stop);

const insertRaw = async (key?, month?, valueJson?) =>
  await store.db
    .prepare(
      'INSERT INTO param_versions (key, effective_month, value_json, reason, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(key, month, valueJson, 'Dòng hỏng cho test độ bền', 'admin', new Date(Date.now()).toISOString());

// type.tts.dows sửa được có kiểm soát (lịch của chức vụ), nên dùng một khoá `locked` tìm được lúc chạy
test('Dòng param_versions của khoá không sửa được trên màn (khoá locked) KHÔNG làm resolve ném lỗi: bị bỏ qua và báo trong skipped; tính lương và PUT /api/sheet vẫn chạy', async () => {
  await S.seed('2026-10');
  await store.setSetting('params_mode', 'active');
  try {
    const locked = await S.lockedKey();
    assert.ok(locked, 'registry có khoá locked kiểu số');
    await insertRaw(locked.key, '2026-10', JSON.stringify(locked.value));
    const paramsStore = require('../../src/params/store');
    let resolved;
    await assert.doesNotReject(async () => {
      resolved = await paramsStore.resolve('2026-10');
    }, 'resolve không được ném TypeError vì một dòng hỏng');
    assert.ok(
      resolved.skipped.some(x => x.key === locked.key),
      JSON.stringify(resolved.skipped)
    );
    assert.deepEqual(resolved.params[locked.key], S.DEFAULTS[locked.key], 'giá trị mặc định giữ nguyên');
    const res = await F.call('PUT', '/sheet', { who: 'qa_tts1', body: { month: '2026-10', days: {} } });
    assert.notEqual(res.status, 500, JSON.stringify(res.data));
  } finally {
    await store.setSetting('params_mode', 'defaults-only');
  }
});

test('Dòng param_versions của khoá lạ hoặc giá trị sai kiểu bị bỏ qua và báo trong skipped, không ném lỗi', async () => {
  await S.seed('2026-11');
  await store.setSetting('params_mode', 'active');
  try {
    await insertRaw('khong.co.khoa.nay', '2026-11', '1');
    await insertRaw('type.nv.travel', '2026-11', '"abc"');
    await insertRaw('level.nv.1.base', '2026-11', '{"loi":true}');
    const paramsStore = require('../../src/params/store');
    let resolved;
    await assert.doesNotReject(async () => {
      resolved = await paramsStore.resolve('2026-11');
    });
    // dòng của khoá không sửa được (type.tts.dows) từ test trước vẫn hiện từ 2026-11, nên lọc theo khoá thay vì so cả danh sách
    for (const key of ['khong.co.khoa.nay', 'level.nv.1.base', 'type.nv.travel'])
      assert.ok(
        resolved.skipped.some(x => x.key === key),
        `${key} phải nằm trong skipped: ${JSON.stringify(resolved.skipped)}`
      );
    assert.equal(resolved.params['type.nv.travel'], S.DEFAULTS['type.nv.travel']);
    assert.equal(resolved.params['level.nv.1.base'], S.DEFAULTS['level.nv.1.base']);
  } finally {
    await store.setSetting('params_mode', 'defaults-only');
  }
});
