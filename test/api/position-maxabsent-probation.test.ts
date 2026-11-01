'use strict';
// Chức vụ (src/params/positions.ts → classify, validate.js → allowanceErrors, save.js → copyBatch):
//   (a) type.ctv.maxAbsent và type.tts.maxAbsent (số ngày nghỉ tối đa giữ chuyên cần) lưu được qua PUT /api/settings/params;
//   (b) chức vụ có chuyên cần > 0 mà thiếu maxAbsent bị chặn lúc lưu (nếu lưu thì mọi phiếu của chức vụ đó thành lỗi);
//   (c) không có thử việc, nên type.<mã>.probationPayPct chưa nối: Lưu thường bị 400 PARAM_NOT_WIRED;
//   (d) sao chép chức vụ (POST /api/positions) vẫn chép nguyên probationPayPct của nguồn (lô sao chép được phép chép khoá chưa nối).
// Mỗi test lấy một tháng riêng, giảm dần (helpers/position-api.js → setupMonth): dòng param_versions chỉ thêm nên giá trị test trước đặt không rò sang test sau.
const P = require('../helpers/position-api');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { F } = P;

before(F.start);
after(F.stop);

const paramRowsOf = async (key?) => (await P.paramRows()).filter(row => row.key === key);

test('Chức vụ: type.ctv.maxAbsent và type.tts.maxAbsent lưu được qua PUT /api/settings/params và có hiệu lực ở tháng áp dụng', async () => {
  const M = await P.setupMonth();
  assert.equal(
    (await P.paramsOf(M))['type.ctv.maxAbsent'],
    undefined,
    'trước khi lưu: CTV chưa có số ngày nghỉ tối đa'
  );
  assert.equal(
    (await P.paramsOf(M))['type.tts.maxAbsent'],
    undefined,
    'trước khi lưu: TTS chưa có số ngày nghỉ tối đa'
  );
  const res = await P.saveChanges(
    [
      { key: 'type.ctv.maxAbsent', value: 4 },
      { key: 'type.tts.maxAbsent', value: 2 }
    ],
    { month: M }
  );
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.equal((await P.paramsOf(M))['type.ctv.maxAbsent'], 4);
  assert.equal((await P.paramsOf(M))['type.tts.maxAbsent'], 2);
  assert.equal((await P.paramsOf(M))['type.nv.maxAbsent'], 3, 'NV không đổi');
  assert.equal((await paramRowsOf('type.ctv.maxAbsent')).length, 1);
});

test('Chức vụ: maxAbsent không hợp lệ (-1, null, chữ, số lẻ âm) bị từ chối 400 và không lưu gì', async () => {
  const M = await P.setupMonth();
  for (const type of ['ctv', 'tts']) {
    for (const value of [-1, null, 'ba', -0.5]) {
      const before = await F.snapshot();
      const rowsBefore = await P.rowCount();
      const res = await P.saveChanges([{ key: `type.${type}.maxAbsent`, value }], { month: M });
      assert.equal(res.status, 400, `type.${type}.maxAbsent=${JSON.stringify(value)}: ${JSON.stringify(res.data)}`);
      assert.match(String(res.data.code), /^PARAM_/, JSON.stringify(res.data));
      assert.equal(await P.rowCount(), rowsBefore, 'không thêm dòng param_versions');
      assert.deepEqual(
        F.changedTables(before, await F.snapshot()),
        [],
        `type.${type}.maxAbsent=${JSON.stringify(value)}`
      );
    }
  }
  assert.equal((await P.paramsOf(M))['type.ctv.maxAbsent'], undefined);
});

test('L8: lô cho chức vụ sao chép chuyên cần > 0 mà thiếu maxAbsent vẫn lưu kèm cảnh báo PARAM_CROSS_CHECK_FAILED, có maxAbsent thì không cảnh báo', async () => {
  const M = await P.setupMonth();
  const code = await P.mustCopy(M, { label: 'Chuyên viên ngày nghỉ', copyFrom: 'ctv' });
  assert.equal((await P.paramsOf(M))[`type.${code}.maxAbsent`], undefined, 'bản sao từ CTV chưa có maxAbsent');
  assert.equal((await P.paramsOf(M))[`type.${code}.attendance`], 0);

  // chuyên cần > 0 mà thiếu maxAbsent: lưu và cảnh báo
  const bad = await P.saveChanges([{ key: `type.${code}.attendance`, value: 0.2 }], { month: M });
  assert.equal(bad.status, 200, JSON.stringify(bad.data));
  const crossCheck = bad.data.warnings.find(w => w.code === 'PARAM_CROSS_CHECK_FAILED');
  assert.ok(crossCheck, JSON.stringify(bad.data.warnings));
  assert.ok(JSON.stringify(crossCheck).includes(`type.${code}.maxAbsent`), 'báo rõ khoá còn thiếu');
  assert.equal((await P.paramsOf(M))[`type.${code}.attendance`], 0.2);

  // cùng lô có maxAbsent: không cảnh báo
  const ok = await P.saveChanges(
    [
      { key: `type.${code}.attendance`, value: 0.3 },
      { key: `type.${code}.maxAbsent`, value: 3 }
    ],
    { month: M }
  );
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.ok(
    !(ok.data.warnings || []).some(w => w.code === 'PARAM_CROSS_CHECK_FAILED'),
    JSON.stringify(ok.data.warnings)
  );
  assert.equal((await P.paramsOf(M))[`type.${code}.attendance`], 0.3);
  assert.equal((await P.paramsOf(M))[`type.${code}.maxAbsent`], 3);
});

test('L8: phụ cấp đi lại > 0 mà thiếu maxAbsent cũng có cảnh báo, còn lưu maxAbsent trước rồi mới đặt đi lại và chuyên cần thì không cảnh báo', async () => {
  const M = await P.setupMonth();
  const code = await P.mustCopy(M, { label: 'Chuyên viên đi lại', copyFrom: 'tts' });
  const bad = await P.saveChanges([{ key: `type.${code}.travel`, value: 0.1 }], { month: M });
  assert.equal(bad.status, 200, JSON.stringify(bad.data));
  assert.ok(
    bad.data.warnings.some(w => w.code === 'PARAM_CROSS_CHECK_FAILED'),
    JSON.stringify(bad.data.warnings)
  );
  // đặt maxAbsent rồi đi lại và chuyên cần cùng lô: không cảnh báo
  const first = await P.saveChanges([{ key: `type.${code}.maxAbsent`, value: 3 }], { month: M });
  assert.equal(first.status, 200, JSON.stringify(first.data));
  const second = await P.saveChanges(
    [
      { key: `type.${code}.travel`, value: 0.2 },
      { key: `type.${code}.attendance`, value: 0.2 }
    ],
    { month: M }
  );
  assert.equal(second.status, 200, JSON.stringify(second.data));
  assert.ok(
    !(second.data.warnings || []).some(w => w.code === 'PARAM_CROSS_CHECK_FAILED'),
    JSON.stringify(second.data.warnings)
  );
});

test('Không có thử việc: lưu type.nv, ctv, tts .probationPayPct là 400 PARAM_NOT_WIRED và không lưu gì', async () => {
  const M = await P.setupMonth();
  for (const key of ['type.nv.probationPayPct', 'type.ctv.probationPayPct', 'type.tts.probationPayPct']) {
    const before = await F.snapshot();
    const rowsBefore = await P.rowCount();
    const res = await P.saveChanges([{ key, value: 0.9 }], { month: M });
    assert.equal(res.status, 400, `${key}: ${JSON.stringify(res.data)}`);
    assert.equal(res.data.code, 'PARAM_NOT_WIRED', key);
    assert.ok(JSON.stringify(res.data).includes(key), 'nêu tên khoá');
    assert.equal(await P.rowCount(), rowsBefore, `${key}: không thêm dòng param_versions`);
    assert.deepEqual(F.changedTables(before, await F.snapshot()), [], key);
  }
  assert.equal((await P.paramsOf(M))['type.nv.probationPayPct'], 1, 'vẫn 100 %');
});

test('Không có thử việc: chức vụ thêm sau (sao chép) cũng không lưu được type.<mã>.probationPayPct (400 PARAM_NOT_WIRED)', async () => {
  const M = await P.setupMonth();
  const code = await P.mustCopy(M, { label: 'Chuyên viên thử việc', copyFrom: 'nv' });
  const key = `type.${code}.probationPayPct`;
  const before = await F.snapshot();
  const res = await P.saveChanges([{ key, value: 0.9 }], { month: M });
  assert.equal(res.status, 400, JSON.stringify(res.data).slice(0, 200));
  assert.equal(res.data.code, 'PARAM_NOT_WIRED');
  assert.deepEqual(F.changedTables(before, await F.snapshot()), []);
  assert.equal((await P.paramsOf(M))[key], 1);
});

test('Sao chép chức vụ từ nv, ctv, tts vẫn 200 và chức vụ mới có type.<mã>.probationPayPct bằng giá trị nguồn', async () => {
  const M = await P.setupMonth();
  for (const source of ['nv', 'ctv', 'tts']) {
    const res = await P.copyPosition(M, { label: `Bản sao của ${source}`, copyFrom: source });
    assert.equal(res.status, 200, `${source}: ${JSON.stringify(res.data)}`);
    const code = P.codeOf(res);
    assert.match(String(code), /^[a-z0-9]{2,16}$/);
    const params = await P.paramsOf(M);
    assert.equal(params[`type.${source}.probationPayPct`], 1, `${source}: nguồn là 100 %`);
    assert.equal(params[`type.${code}.probationPayPct`], params[`type.${source}.probationPayPct`], source);
    assert.ok(
      (await P.paramRows()).some(row => row.key === `type.${code}.probationPayPct`),
      'khoá có dòng param_versions'
    );
  }
});

test('Lô sao chép chỉ do máy chủ dựng: yêu cầu HTTP gửi thêm copyBatch hay serverBatch vẫn không lưu được khoá chưa nối', async () => {
  const M = await P.setupMonth();
  const before = await F.snapshot();
  const res = await P.saveChanges([{ key: 'type.nv.probationPayPct', value: 0.9 }], {
    month: M,
    extra: { copyBatch: true, serverBatch: true }
  });
  assert.equal(res.status, 400, JSON.stringify(res.data));
  assert.equal(res.data.code, 'PARAM_NOT_WIRED');
  assert.deepEqual(F.changedTables(before, await F.snapshot()), []);
});
