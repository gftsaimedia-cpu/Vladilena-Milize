'use strict';
// Ca làm sửa được (Cài đặt › Kỳ lương & chấm công › Ca làm): giờ vào, ra của sáu ca có sẵn là khoá registry shift.preset.<mã>.in | out,
// Admin sửa qua PUT /api/settings/params với tháng áp dụng và lý do. Kiểm: giờ HH:MM, dài đúng giờ làm cộng giờ nghỉ, giữ loại ca,
// không trùng cặp giờ với ca khác; ở môi trường thật cần SHIFT_ALLOW_EDIT=1. Mặc định giữ đúng giờ hôm nay. Chỉ người bịa (qa_*).
const F = require('../helpers/api-fixture');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const Params = require('../../src/engine/payroll-params');
const { rulesFor } = require('../../src/platform/request-rules');

const REASON = 'Đổi giờ ca theo thông báo của công ty tháng này';
before(async () => {
  await F.start();
  await F.at('2026-11-02T09:00:00');
  await F.person('admin', 'admin', { type: 'tts', level: 0, shiftCode: null, startDate: null });
  await F.person('qa_plain', 'staff');
});
after(F.stop);

const save = async (changes?, { month = '2027-02', who = 'admin' }: any = {}) => {
  const rev = (await F.call('GET', `/settings/params?month=${month}`, { who: 'admin' })).data.paramsRev;
  return F.call('PUT', '/settings/params', {
    who,
    body: { changes, effectiveMonth: month, reason: REASON, expectedRev: rev }
  });
};
const DEFAULT_SHIFT = {
  n1: ['08:00', '17:00'],
  n2: ['10:00', '19:00'],
  f1: ['06:00', '15:00'],
  f2: ['13:00', '22:00'],
  g1: ['21:00', '06:00'],
  g2: ['22:00', '07:00']
};
const change = (code?, tin?, tout?) => [
  { key: `shift.preset.${code}.in`, value: tin },
  { key: `shift.preset.${code}.out`, value: tout }
];

test('ca làm: mặc định giữ đúng giờ hôm nay ở cả bộ tham số lẫn quy tắc chấm công của tháng', async () => {
  for (const [code, [tin, tout]] of Object.entries<any>(DEFAULT_SHIFT)) {
    assert.equal(Params.DEFAULTS[`shift.preset.${code}.in`], tin);
    assert.equal(Params.DEFAULTS[`shift.preset.${code}.out`], tout);
  }
  assert.deepEqual(JSON.parse(JSON.stringify((await rulesFor('2026-11')).punch.SHIFT)), DEFAULT_SHIFT);
});

test('ca làm: Admin đổi giờ Normal 1 sang 09:00 đến 18:00 từ tháng áp dụng; tháng trước giữ giờ cũ; mã ca và gán ca không đổi', async () => {
  const res = await save(change('n1', '09:00', '18:00'));
  assert.equal(res.status, 200, JSON.stringify(res.data).slice(0, 400));
  assert.deepEqual((await rulesFor('2027-02')).punch.SHIFT.n1, ['09:00', '18:00']);
  assert.deepEqual((await rulesFor('2027-03')).punch.SHIFT.n1, ['09:00', '18:00'], 'các tháng sau theo giờ mới');
  assert.deepEqual(
    (await rulesFor('2027-01')).punch.SHIFT.n1,
    ['08:00', '17:00'],
    'tháng trước tháng áp dụng giữ giờ cũ'
  );
  assert.deepEqual((await rulesFor('2027-02')).punch.SHIFT.n2, ['10:00', '19:00'], 'ca khác không đổi');
  const bulk = await F.call('PUT', '/staff/shift-bulk', {
    body: { usernames: ['qa_plain'], preset: 'n1', effective: '2027-02-01', reason: REASON }
  });
  assert.ok([200, 400].includes(bulk.status), 'mã ca n1 vẫn nhận được');
});

test('ca làm: giờ sai dạng bị từ chối (400) và không lưu gì', async () => {
  const month = '2027-04';
  const cases = [
    [change('n2', '25:00', '19:00'), /HH:MM/],
    [change('n2', '9h', '18:00'), /HH:MM/]
  ];
  for (const [changes, pattern] of cases) {
    const res = await save(changes, { month });
    assert.ok([400, 422].includes(res.status), `${JSON.stringify(changes)} → ${res.status}`);
    assert.match(JSON.stringify(res.data), pattern);
  }
  assert.deepEqual(JSON.parse(JSON.stringify((await rulesFor(month)).punch.SHIFT)).n2, ['10:00', '19:00']);
});

test('ca làm: ca không dài đúng 9 giờ, giờ vào trùng giờ ra, đổi loại ca hoặc trùng ca khác vẫn lưu, kèm cảnh báo PARAM_CROSS_CHECK_FAILED nêu lý do', async () => {
  const cases = [
    ['2027-08', change('n2', '10:00', '18:00'), /dài đúng 9 giờ/],
    ['2027-09', change('n2', '06:30', '15:30'), /đổi loại ca/],
    ['2027-10', change('f2', '16:00', '01:00'), /đổi loại ca/],
    ['2027-11', change('n2', '09:00', '18:00'), /trùng cả giờ vào lẫn giờ ra/],
    ['2027-12', change('n2', '10:00', '10:00'), /không được trùng nhau/]
  ];
  for (const [month, changes, pattern] of cases) {
    const res = await save(changes, { month });
    assert.equal(
      res.status,
      200,
      `${JSON.stringify(changes)} → ${res.status} ${JSON.stringify(res.data).slice(0, 300)}`
    );
    assert.ok(
      res.data.warnings.some(w => w.code === 'PARAM_CROSS_CHECK_FAILED'),
      JSON.stringify(res.data.warnings)
    );
    assert.match(JSON.stringify(res.data.warnings), pattern);
    const code = changes[0].key.split('.')[2];
    assert.deepEqual(
      (await rulesFor(month)).punch.SHIFT[code],
      [changes[0].value, changes[1].value],
      'giá trị vẫn được lưu'
    );
  }
});

test('ca làm: ca đêm qua ngày đổi giờ trong khung đêm được; đổi sang ca không còn qua đêm vẫn lưu, kèm cảnh báo PARAM_CROSS_CHECK_FAILED', async () => {
  const ok = await save(change('g1', '20:30', '05:30'), { month: '2027-05' });
  assert.equal(ok.status, 200, JSON.stringify(ok.data).slice(0, 400));
  assert.deepEqual((await rulesFor('2027-05')).punch.SHIFT.g1, ['20:30', '05:30']);
  const day = await save(change('g2', '08:00', '17:00'), { month: '2027-06' });
  assert.equal(day.status, 200, JSON.stringify(day.data).slice(0, 300));
  assert.ok(
    day.data.warnings.some(w => w.code === 'PARAM_CROSS_CHECK_FAILED'),
    JSON.stringify(day.data.warnings)
  );
});

test('ca làm: nhân sự 403, chưa đăng nhập 401; môi trường thật cần SHIFT_ALLOW_EDIT=1', async () => {
  assert.equal((await save(change('f1', '07:00', '16:00'), { month: '2027-07', who: 'qa_plain' })).status, 403);
  assert.equal((await save(change('f1', '07:00', '16:00'), { month: '2027-07', who: null })).status, 401);
  const env = { NODE_ENV: process.env.NODE_ENV, SHIFT_ALLOW_EDIT: process.env.SHIFT_ALLOW_EDIT };
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.SHIFT_ALLOW_EDIT;
    const blocked = await save(change('f1', '06:30', '15:30'), { month: '2027-07' });
    assert.equal(blocked.status, 409);
    assert.match(JSON.stringify(blocked.data), /SHIFT_EDIT_NOT_ALLOWED/);
    assert.deepEqual((await rulesFor('2027-07')).punch.SHIFT.f1, ['06:00', '15:00']);
    process.env.SHIFT_ALLOW_EDIT = '1';
    const opened = await save(change('f1', '06:30', '15:30'), { month: '2027-07' });
    assert.equal(opened.status, 200, JSON.stringify(opened.data).slice(0, 300));
  } finally {
    for (const [key, value] of Object.entries<any>(env))
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
  }
});
