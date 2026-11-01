'use strict';
// src/engine/attendance-status.ts: bảng nhãn duy nhất của chấm công, nhãn của một ô ngày theo thứ tự ưu tiên, và cách suy tối thiểu
// khi lượt chưa có status do máy chủ gửi.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const AS = require('../../src/engine/attendance-status');

test('bảng nhãn có đúng sáu nhãn chấm công', () => {
  assert.deepEqual(AS.LABEL, {
    'checked-in': 'Đã Check-in',
    'checked-out': 'Đã Check-out',
    pending: 'Chờ xử lý',
    approved: 'Được phê duyệt',
    rejected: 'Bị từ chối',
    admin: 'Đã chấm công'
  });
  assert.deepEqual(Object.keys(AS.TONE).sort(), Object.keys(AS.LABEL).sort());
  assert.deepEqual([...AS.DAY_ORDER].sort(), Object.keys(AS.LABEL).sort());
});

test('statusOf lấy status của máy chủ, không phân loại lại giờ', () => {
  for (const code of Object.keys(AS.LABEL)) {
    // entry nói ngược lại (lượt chờ) nhưng máy chủ đã quyết định: theo máy chủ
    assert.equal(
      AS.statusOf({ status: code, state: 'closed', entry: { kind: 'pending', reason: 'forgot-out' } }),
      code
    );
    assert.equal(AS.labelOf({ status: code }), AS.LABEL[code]);
  }
});

test('thiếu status (dữ liệu cũ): chỉ Chờ xử lý khi entry.kind là pending, còn lại theo state', () => {
  assert.equal(AS.statusOf({ state: 'closed', entry: { kind: 'pending', reason: 'forgot-out' } }), 'pending');
  assert.equal(AS.statusOf({ state: 'closed', entry: { kind: 'work' } }), 'checked-out');
  assert.equal(AS.statusOf({ state: 'open', entry: { kind: 'pending', reason: 'open' } }), 'checked-in');
  assert.equal(AS.statusOf({ state: 'open', entry: {} }), 'checked-in');
  // dòng hiển thị của màn nhân viên chỉ có cờ open
  assert.equal(AS.statusOf({ open: true }), 'checked-in');
  assert.equal(AS.statusOf({ status: 'la-ma', state: 'closed', entry: {} }), 'checked-out');
  assert.equal(AS.statusOf(null), 'checked-out');
});

test('noteOf chỉ trả lý do ngắn của máy chủ, không tự viết', () => {
  assert.equal(AS.noteOf({ status: 'pending', statusNote: ' Vào trễ 22 phút ' }), 'Vào trễ 22 phút');
  assert.equal(AS.noteOf({ status: 'checked-out', statusNote: '' }), '');
  assert.equal(AS.noteOf({ status: 'pending' }), '');
  assert.equal(AS.noteOf(undefined), '');
});

test('dayStatus: Chờ xử lý > Bị từ chối > Đã Check-in > Được phê duyệt > Đã chấm công > Đã Check-out', () => {
  const s = (status?) => ({ status });
  assert.equal(AS.dayStatus([]), '');
  assert.equal(AS.dayStatus(undefined), '');
  assert.equal(AS.dayStatus([s('checked-out')]), 'checked-out');
  assert.equal(AS.dayStatus([s('checked-out'), s('admin')]), 'admin');
  assert.equal(AS.dayStatus([s('admin'), s('approved')]), 'approved');
  assert.equal(AS.dayStatus([s('approved'), s('checked-in')]), 'checked-in');
  assert.equal(AS.dayStatus([s('checked-in'), s('rejected')]), 'rejected');
  assert.equal(AS.dayStatus([s('rejected'), s('pending'), s('checked-out')]), 'pending');
  // lượt cũ không có status vẫn góp nhãn theo cách suy tối thiểu
  assert.equal(
    AS.dayStatus([s('checked-out'), { state: 'closed', entry: { kind: 'pending', reason: 'off-shift' } }]),
    'pending'
  );
});

test('dayNotes: các lý do khác nhau theo thứ tự lượt, bỏ trống và trùng', () => {
  const list = [
    { status: 'pending', statusNote: 'Vào trễ 22 phút' },
    { status: 'checked-out', statusNote: '' },
    { status: 'pending', statusNote: 'Vào trễ 22 phút' },
    { status: 'rejected', statusNote: 'Giải trình Check-out muộn' }
  ];
  assert.deepEqual(AS.dayNotes(list), ['Vào trễ 22 phút', 'Giải trình Check-out muộn']);
  assert.deepEqual(AS.dayNotes(null), []);
});
