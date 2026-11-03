'use strict';
// Lượt bị thay trong ngày công (src/domain/attendance/session-view.ts → supersededIds), cùng luật src/engine/actual-hours.ts dùng để tính
// lương: lượt Admin khai thay thắng các lượt bấm bị chặn cùng ngày; lượt chấm thật dùng được thắng lượt Admin; lượt đang mở giữ nguyên.
// Nhãn của ngày (src/engine/attendance-status.ts → dayStatus, dayNotes) bỏ qua lượt bị thay.
require('../helpers/require-isolated-database');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { supersededIds } = require('../../src/domain/attendance/session-view');
const { ADMIN_ORIGIN } = require('../../src/domain/attendance/attendance-sessions');
const AS = require('../../src/engine/attendance-status');

const DATE = '2026-11-10';
const plan = { code: 'Normal1', date: DATE, startIso: `${DATE}T01:00:00.000Z`, endIso: `${DATE}T10:00:00.000Z` };
const ses = (id?, extra: any = {}, entry: any = {}) => ({
  id,
  username: 'an',
  date: DATE,
  state: 'closed',
  ...extra,
  entry: { presIn: `${DATE}T01:00:00.000Z`, presOut: `${DATE}T10:00:00.000Z`, plannedShift: plan, ...entry }
});
const admin = (id?) => ses(id, { status: 'admin' }, { src: 'admin', origin: ADMIN_ORIGIN });
const forgotOut = (id?) =>
  ses(
    id,
    { status: 'pending', statusNote: 'Quên Check-out' },
    { kind: 'pending', reason: 'forgot-out', presOut: undefined }
  );
const ids = (list?) => [...supersededIds(list)].sort();
const mark = (list?) => {
  const out = supersededIds(list);
  return list.map(s => (out.has(s.id) ? { ...s, superseded: true } : s));
};

test('lượt Admin khai thay thay lượt quên Check-out, chờ đối soát, Check-out muộn chờ duyệt cùng ngày', () => {
  const review = ses(3, { status: 'pending' }, { reason: 'needs-review' });
  const lateOut = ses(4, { status: 'pending' }, { presOut: undefined, requestedOut: `${DATE}T11:30:00.000Z` });
  assert.deepEqual(ids([forgotOut(1), admin(2), review, lateOut]), [1, 3, 4]);
  const list = mark([forgotOut(1), admin(2)]);
  assert.equal(AS.dayStatus(list), 'admin');
  assert.deepEqual(AS.dayNotes(list), []);
  // nhãn riêng của từng lượt vẫn giữ
  assert.equal(AS.statusOf(list[0]), 'pending');
  assert.equal(AS.noteOf(list[0]), 'Quên Check-out');
});

test('lượt chấm thật dùng được thắng lượt Admin: lượt Admin bị thay, nhãn của ngày theo lượt thật', () => {
  const real = ses(1, { status: 'pending', statusNote: 'Vào trễ 20 phút' }, { presIn: `${DATE}T01:20:00.000Z` });
  assert.deepEqual(ids([real, admin(2)]), [2]);
  assert.equal(AS.dayStatus(mark([real, admin(2)])), 'pending');
  // giờ ra không sau giờ vào: không phải lượt dùng được, lượt Admin thắng
  const broken = ses(3, { status: 'pending' }, { presOut: `${DATE}T01:00:30.000Z` });
  assert.deepEqual(ids([broken, admin(2)]), [3]);
});

test('lượt đang mở giữ nguyên; ngày không có lượt Admin, khác người hoặc khác ngày công không bị đụng', () => {
  const open = ses(5, { state: 'open', status: 'checked-in' }, { presOut: undefined });
  assert.deepEqual(ids([open, forgotOut(1), admin(2)]), [1]);
  assert.deepEqual(ids([forgotOut(1)]), []);
  const other = { ...forgotOut(6), username: 'binh' };
  const night = ses(7, { status: 'pending' }, { presOut: undefined, plannedShift: { ...plan, date: '2026-11-09' } });
  assert.deepEqual(ids([other, night, admin(2)]), []);
  // lượt Admin chưa đủ giờ (không dùng được để tính giờ) không thay ai
  assert.deepEqual(
    ids([forgotOut(1), ses(8, {}, { origin: ADMIN_ORIGIN, plannedShift: { code: 'Normal1', date: DATE } })]),
    []
  );
});

test('dayStatus: mọi lượt đều bị đánh dấu thì vẫn dùng cả danh sách', () => {
  assert.equal(AS.dayStatus([{ status: 'pending', superseded: true }]), 'pending');
  assert.equal(AS.dayStatus([]), '');
});
