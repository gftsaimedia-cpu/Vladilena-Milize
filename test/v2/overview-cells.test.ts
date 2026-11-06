import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ageText, caseText, cellOf, foldText, isPresent, slipStateOf } from '../../src/modules/overview/domain';

const TODAY = '2026-10-20'; // thứ Ba
const SHIFT = 'HC 08:00–17:00';
const MON_SAT = [1, 2, 3, 4, 5, 6];
const row = (over: Record<string, unknown>) => ({
  workDate: '2026-10-14',
  actualCheckIn: '2026-10-14T01:00:00Z',
  actualCheckOut: '2026-10-14T10:00:00Z',
  status: 'PRESENT',
  metrics: { lateMinutes: 0 },
  deductionMinutes: 0,
  ...over
});

test('ô ngày: hôm nay chưa chấm vào là nocheck, không phải vắng', () => {
  const c = cellOf(undefined, TODAY, TODAY, MON_SAT, SHIFT);
  assert.deepEqual([c.kind, c.base, c.text, c.label, c.in, c.live], ['nocheck', 'nocheck', SHIFT, 'Chưa Check-in', null, false]);
  // Dòng ngày chờ tính của hôm nay, chưa có lần chấm nào: cũng chưa phải đi làm.
  const pending = cellOf(row({ workDate: TODAY, status: 'PENDING', actualCheckIn: null, actualCheckOut: null }) as any, TODAY, TODAY, MON_SAT, SHIFT);
  assert.equal(pending.kind, 'nocheck');
});

test('ô ngày: quá khứ không có dòng là vắng, tương lai là fu, ngoài tuần làm là off', () => {
  assert.deepEqual([cellOf(undefined, '2026-10-19', TODAY, MON_SAT, SHIFT).kind, cellOf(undefined, '2026-10-19', TODAY, MON_SAT, SHIFT).text], ['absent', '—']);
  const fu = cellOf(undefined, '2026-10-21', TODAY, MON_SAT, SHIFT);
  assert.deepEqual([fu.kind, fu.text, fu.label], ['fu', SHIFT, 'Ca dự kiến']);
  const sun = cellOf(undefined, '2026-10-18', TODAY, MON_SAT, SHIFT);
  assert.deepEqual([sun.kind, sun.text], ['off', '']);
  // Tuần làm T2–T6: thứ Bảy là off kể cả tương lai.
  assert.equal(cellOf(undefined, '2026-10-24', TODAY, [1, 2, 3, 4, 5], SHIFT).kind, 'off');
  // Dòng ngày chờ tính, quá khứ, không có lần chấm nào: vắng.
  assert.equal(cellOf(row({ status: 'PENDING', actualCheckIn: null, actualCheckOut: null }) as any, '2026-10-14', TODAY, MON_SAT, SHIFT).kind, 'absent');
});

test('ô ngày: đi làm, đang làm, muộn, nghỉ', () => {
  const work = cellOf(row({}) as any, '2026-10-14', TODAY, MON_SAT, SHIFT);
  assert.deepEqual([work.kind, work.text, work.in, work.out, work.live, work.aria], ['work', '08:00–17:00', '08:00', '17:00', false, 'Đi làm, 08:00–17:00']);
  assert.ok(isPresent(work));
  const live = cellOf(row({ workDate: TODAY, actualCheckIn: '2026-10-20T01:05:00Z', actualCheckOut: null }) as any, TODAY, TODAY, MON_SAT, SHIFT);
  assert.deepEqual([live.kind, live.text, live.live, live.aria], ['work', '08:05–…', true, 'Đi làm, 08:05–…, đang làm']);
  // Quá khứ có giờ vào mà thiếu giờ ra: dấu "?" và không phải đang làm.
  assert.equal(cellOf(row({ actualCheckOut: null }) as any, '2026-10-14', TODAY, MON_SAT, SHIFT).text, '08:00–?');
  const late = cellOf(row({ deductionMinutes: 20, metrics: { lateMinutes: 20 } }) as any, '2026-10-14', TODAY, MON_SAT, SHIFT);
  assert.deepEqual([late.kind, late.label, late.lateMinutes], ['late', 'Đi muộn', 20]);
  const holiday = cellOf(row({ status: 'HOLIDAY', actualCheckIn: null, actualCheckOut: null }) as any, '2026-10-14', TODAY, MON_SAT, SHIFT);
  assert.deepEqual([holiday.kind, holiday.text, holiday.label], ['leave', 'Nghỉ lễ', 'Nghỉ có phép']);
  const paid = cellOf(row({ status: 'LEAVE_PAID', actualCheckIn: null, actualCheckOut: null }) as any, '2026-10-14', TODAY, MON_SAT, SHIFT);
  assert.deepEqual([paid.kind, paid.text], ['leave', 'Nghỉ']);
});

test('ô ngày: đơn chờ duyệt phủ lên thành todo, giữ loại gốc', () => {
  const c = cellOf(undefined, '2026-10-15', TODAY, MON_SAT, SHIFT, { id: 'r1', what: 'Nghỉ phép' });
  assert.deepEqual([c.kind, c.base, c.itemId, c.label, c.aria], ['todo', 'absent', 'r1', 'Cần xử lý', 'Cần xử lý, Nghỉ phép']);
});

test('nhãn và chữ dùng chung', () => {
  assert.equal(caseText(['MISSING_CHECK_IN', 'MISSING_CHECK_OUT']), 'Quên chấm công');
  assert.equal(caseText(['LATE_CHECK_IN']), 'Vào muộn');
  assert.equal(ageText('2026-10-20T00:00:00Z', Date.parse('2026-10-20T00:35:00Z')), '35 phút');
  assert.equal(ageText('2026-10-18T00:00:00Z', Date.parse('2026-10-20T05:00:00Z')), '2 ngày');
  assert.equal(foldText('Trần Đức'), 'tran duc');
  assert.deepEqual(['approved', 'final', 'rejected', 'pending', 'draft', 'error'].map(slipStateOf), ['done', 'done', 'rejected', 'pending', 'draft', 'draft']);
});
