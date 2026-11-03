'use strict';
// src/platform/warnings.ts → scope({ label, details }, fn): lô nhiều người trong một yêu cầu.
//   cảnh báo ghi trong fn mở đầu bằng "<label>: " và mang details của scope (trộn với details riêng của cảnh báo)
//   cùng một cảnh báo của hai người là hai mục (không bị gộp theo mã và câu)
//   ra khỏi scope (kể cả khi fn ném lỗi) thì cảnh báo trở lại không nhãn; scope lồng nhau trả về nhãn ngoài
//   ngoài yêu cầu HTTP thì chỉ chạy fn
require('../helpers/require-isolated-database');
process.env.SESSION_SECRET = 'warnings-scope-unit-tests';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const warnings = require('../../src/platform/warnings');

const person = (username?, fn?) => warnings.scope({ label: `Người ${username}`, details: { username } }, fn);

test('scope: cảnh báo mang nhãn và details của từng người; cùng mã cùng câu của hai người là hai mục', () => {
  warnings.run(async () => {
    for (const username of ['a', 'b'])
      await person(username, () =>
        warnings.warn('SAME', 'Ngày 02/11 là Chủ nhật', { details: { date: '2026-11-01' } })
      );
    const list = warnings.take();
    assert.deepEqual(
      list.map(w => [w.code, w.message, w.details]),
      [
        ['SAME', 'Người a: Ngày 02/11 là Chủ nhật', { username: 'a', date: '2026-11-01' }],
        ['SAME', 'Người b: Ngày 02/11 là Chủ nhật', { username: 'b', date: '2026-11-01' }]
      ]
    );
    assert.deepEqual(warnings.codes(), ['SAME']);
  });
});

test('scope: warnIf và selfDecision đi qua cùng đường nên cũng mang nhãn', () => {
  warnings.run(async () => {
    await person('c', () => {
      warnings.warnIf('X', true, { message: 'vi phạm' });
      warnings.selfDecision(true, { doing: 'chấm công thay' });
    });
    const [x, self] = warnings.take();
    assert.equal(x.message, 'Người c: vi phạm');
    assert.equal(self.code, 'SELF_DECISION_FORBIDDEN');
    assert.ok(self.message.startsWith('Người c: Bạn đang chấm công thay của chính mình'));
    assert.deepEqual(self.details, { username: 'c' });
  });
});

test('scope: fn ném lỗi thì nhãn được gỡ; scope lồng nhau trả về nhãn ngoài; cảnh báo ngoài scope không nhãn', () => {
  warnings.run(async () => {
    assert.throws(
      () =>
        person('d', () => {
          throw new Error('hỏng');
        }),
      /hỏng/
    );
    warnings.warn('OUT', 'ngoài scope');
    await person('e', () => {
      warnings.scope({ label: 'Trong', details: {} }, () => warnings.warn('IN', 'bên trong'));
      warnings.warn('BACK', 'quay lại');
    });
    assert.deepEqual(
      warnings.take().map(w => w.message),
      ['ngoài scope', 'Trong: bên trong', 'Người e: quay lại']
    );
  });
});

test('scope: ngoài yêu cầu HTTP chỉ chạy fn và trả giá trị của fn', () => {
  assert.equal(
    warnings.scope({ label: 'x', details: {} }, () => 42),
    42
  );
});
