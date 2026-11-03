'use strict';
// Bốn cột tiền của một dòng ngày trên phiếu (PayrollEngine.columnsOfDay, gắn vào dòng ngày bởi src/domain/payroll/slip-paid.ts → dayFiguresOf):
//   luongNgay + phuCapCa + lamThem − truGio = làm tròn đồng của total; mỗi cột là số nguyên đồng.
//   luongNgay = mọi phần lương ngày (kể cả lương ngày lễ và tiền giờ ngày thường của ca sang ngày sau) + giờ trừ;
//   phuCapCa = phụ cấp ca + Off Paid; lamThem = OT + làm bù + OT ngày lễ; truGio = giờ thiếu của ngày đi làm.
// Ca tham chiếu: NV bậc 1 (6.000.000 / 26 = 230.769 mỗi ngày), ca đêm 40 %, ca Night2 22:00–07:00.
require('../helpers/require-isolated-database');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../../src/engine/payroll-engine');
const { DEFAULTS } = require('../../src/engine/payroll-params');
const { dayFiguresOf, withDayFigures } = require('../../src/domain/payroll/slip-paid');

const KINDS = { Normal1: 'normal', Flex1: 'flex', Night1: 'night', Night2: 'night', n1: 'normal', g2: 'night' };
const P = { ...DEFAULTS, 'shift.allowance.basis': 'assigned', 'type.nv.nightPct': 40 };
for (const [code, kind] of Object.entries<any>(KINDS)) P[`shift.kind.${code}`] = kind;
const E = Engine.create(P);
const NIGHT = { username: 'qa_night', type: 'nv', level: 1, startDate: '2025-01-06', shiftCode: 'Night2' };
const DAY = { username: 'qa_day', type: 'nv', level: 1, startDate: '2025-01-06', shiftCode: 'Normal1' };
const TTS = { username: 'qa_tts', type: 'tts', level: 1, startDate: '2025-01-06', shiftCode: 'Normal1' };
const HOLIDAY = '2026-10-01';
const nightShift = { kind: 'work', in: '22:00', out: '07:00', preset: 'Night2' };
const dayShift = { kind: 'work', in: '08:00', out: '17:00', preset: 'Normal1' };

const dayOf = (staff?, d?, date?, holiday = false) =>
  E.calcDay(staff, d, holiday, null, { date, holidays: holiday ? [date] : [] });
// dòng như bản chụp đã lưu: qua JSON, chưa có cột tiền
const stored = (row?) => JSON.parse(JSON.stringify({ date: '2026-10-05', ...row }));
// cột tiền do máy chủ gắn vào dòng đã lưu, kèm kiểm cộng trừ ra đúng Thành tiền
async function columnsOf(row?) {
  const cot = dayFiguresOf(await stored(row)).cot;
  assert.ok(cot, 'dòng có cột tiền');
  for (const [k, v] of Object.entries<any>(cot)) assert.ok(Number.isInteger(v), `${k} là số nguyên đồng: ${v}`);
  assert.equal(
    cot.luongNgay + cot.phuCapCa + cot.lamThem - cot.truGio,
    Math.round(row.total),
    'các cột cộng đúng Thành tiền'
  );
  return cot;
}

test('ca đêm trúng ngày lễ 01/10: Lương ngày 403.846 · Phụ cấp ca 129.808 · Làm thêm 207.692 · Trừ giờ 0 · Thành tiền 741.346', async () => {
  const row = dayOf(NIGHT, nightShift, HOLIDAY, true);
  assert.equal(row.kind, 'holiday');
  assert.equal(Math.round(row.total), 741346);
  assert.deepEqual(await columnsOf(row), { luongNgay: 403846, phuCapCa: 129808, lamThem: 207692, truGio: 0 });
});

test('ngày thường: toàn bộ là Lương ngày', async () => {
  const row = dayOf(DAY, dayShift, '2026-10-05');
  assert.deepEqual(await columnsOf(row), { luongNgay: 230769, phuCapCa: 0, lamThem: 0, truGio: 0 });
});

test('ca đêm thường: Phụ cấp ca gồm phụ cấp đêm và Off Paid', async () => {
  const row = dayOf(NIGHT, nightShift, '2026-10-05');
  assert.deepEqual(await columnsOf(row), { luongNgay: 230769, phuCapCa: 129808, lamThem: 0, truGio: 0 });
});

test('ngày có OT đã duyệt: Làm thêm = tiền OT, các cột cộng đúng Thành tiền', async () => {
  const row = dayOf(DAY, { ...dayShift, extraKind: 'ot', extraOut: '18:00' }, '2026-10-05');
  assert.equal(row.otH, 1);
  const cot = await columnsOf(row);
  assert.equal(cot.lamThem, Math.round(row.otPay));
  assert.equal(cot.luongNgay, 230769);
});

test('ngày có giờ làm bù: Làm thêm = tiền làm bù, không phụ cấp ca', async () => {
  const row = dayOf(NIGHT, { ...nightShift, extraKind: 'makeup', extraIn: '20:00', extraOut: '09:00' }, '2026-10-02');
  assert.equal(row.makeupH, 4);
  assert.deepEqual(await columnsOf(row), { luongNgay: 230769, phuCapCa: 0, lamThem: 115385, truGio: 0 });
});

test('ngày bị trừ giờ: Lương ngày là đủ ngày, Trừ giờ là tiền giờ thiếu', async () => {
  const row = dayOf(DAY, { kind: 'work', in: '08:00', out: '16:00', preset: 'Normal1' }, '2026-10-05');
  assert.ok(row.cut > 0, 'có giờ thiếu');
  const cot = await columnsOf(row);
  assert.equal(cot.truGio, Math.round(row.cut));
  assert.equal(cot.luongNgay, 230769);
});

test('TTS ngày lễ không lương: dòng nghỉ lễ 0 đồng, không có cột tiền (phiếu hiện ô gạch ngang)', async () => {
  const row = dayOf(TTS, dayShift, HOLIDAY, true);
  assert.deepEqual([row.kind, row.hours, row.total], ['holiday', 0, 0]);
  assert.equal(dayFiguresOf(await stored(row)).cot, undefined);
});

test('dòng của bản chụp cũ không có cột tiền: máy chủ tính lại từ chính các trường của dòng, bản gốc không đổi', async () => {
  const row = await stored(dayOf(NIGHT, nightShift, HOLIDAY, true));
  assert.equal(Object.hasOwn(row, 'cot'), false);
  const snapshot = { rows: [row, { date: '2026-10-06', kind: 'leave', total: 230769 }] };
  const out = await withDayFigures(snapshot);
  assert.deepEqual(out.rows[0].cot, { luongNgay: 403846, phuCapCa: 129808, lamThem: 207692, truGio: 0 });
  assert.equal(out.rows[1].cot, undefined, 'ngày không đi làm không có cột tiền');
  assert.equal(Object.hasOwn(snapshot.rows[0], 'cot'), false, 'bản chụp gốc không bị ghi thêm');
});

test('dòng thiếu trường tiền coi là 0: không NaN', () => {
  const bare = dayFiguresOf({ date: HOLIDAY, kind: 'holiday', hours: 8, total: 0 });
  assert.deepEqual(bare.cot, { luongNgay: 0, phuCapCa: 0, lamThem: 0, truGio: 0 });
  const work = dayFiguresOf({ date: '2026-10-05', kind: 'work', daily: 100, total: 100, cut: 0 });
  assert.deepEqual(work.cot, { luongNgay: 100, phuCapCa: 0, lamThem: 0, truGio: 0 });
});
