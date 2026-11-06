import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withTempDb } from './helpers/pg-temp-db.js';
import { AttendanceDaysRepository } from '../../src/modules/attendance/attendance-days.repository.js';
import { buildDay, type AttendanceDay, type DaySources } from '../../src/modules/attendance/domain/attendance-day.js';
import { vnInstant } from '../../src/modules/attendance/domain/calendar.js';

const NV1 = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-11-30T12:00:00Z');

function daySource(date: string, over: Partial<DaySources> = {}): DaySources {
  return {
    date,
    schedule: null,
    punches: [
      { type: 'IN', at: vnInstant(date, '08:00') },
      { type: 'OUT', at: vnInstant(date, '12:00') }
    ],
    otWindows: [],
    makeupWindows: [],
    halfShift: {
      half: 'FIRST',
      start: '08:00',
      end: '12:00',
      requestId: 'req-h1'
    },
    explanation: null,
    isHoliday: false,
    now: NOW,
    employment: { startDate: '2026-01-01', resignedOn: null },
    benefits: { paidLeave: true, paidHoliday: true, isat: true },
    workWeek: [1, 2, 3, 4, 5, 6],
    graceMinutes: 15,
    defaultShift: { type: 'NORMAL', start: '08:00', end: '17:00', allowancePct: 0 },
    ...over
  };
}

test('half-shift day row on PostgreSQL: upsert and listDays', async t => {
  await withTempDb(t, 'half_shift_day_row', async (db, client) => {
    await client.query(
      `INSERT INTO staff (username, name, role, type, level, pass_hash, created_at, uuid, start_date)
       VALUES ('nv1', 'nv1', 'staff', 'nv', 1, 'x', now(), $1, '2026-01-01')`,
      [NV1]
    );

    const repo = new AttendanceDaysRepository(db);

    // Ngày 1: Có đơn nửa ca FIRST, vào 08:00 ra 12:00 -> payUnits 0.5, halfShift FIRST
    const halfDay = buildDay(NV1, daySource('2026-11-10'));

    // Ngày 2: Không có đơn nửa ca, vào 08:00 ra 17:00 -> payUnits 1, halfShift null
    const normalDay = buildDay(
      NV1,
      daySource('2026-11-11', {
        halfShift: null,
        punches: [
          { type: 'IN', at: vnInstant('2026-11-11', '08:00') },
          { type: 'OUT', at: vnInstant('2026-11-11', '17:00') }
        ]
      })
    );

    await repo.upsertDays([halfDay, normalDay], NOW);

    // Đọc lại qua listDays
    const days = await repo.listDays(NV1, '2026-11-10', '2026-11-11');
    assert.equal(days.length, 2);

    const d1 = days.find(d => d.workDate === '2026-11-10')!;
    assert.equal((d1 as any).halfShift, 'FIRST');
    assert.equal(d1.payUnits, 0.5);
    assert.equal(d1.countsAsWorkday, true);
    assert.equal(d1.countsAsDayOff, true);

    const d2 = days.find(d => d.workDate === '2026-11-11')!;
    assert.equal((d2 as any).halfShift, null);
    assert.equal(d2.payUnits, 1);
    assert.equal(d2.countsAsWorkday, true);
    assert.equal(d2.countsAsDayOff, false);

    // Kiểm tra trực tiếp bảng timesheet_entries
    const row1 = (await client.query(`SELECT half_shift, pay_units, work_units FROM timesheet_entries WHERE work_date = '2026-11-10'`)).rows[0];
    assert.equal(row1.half_shift, 'FIRST');
    assert.equal(Number(row1.pay_units), 0.5);
    assert.equal(Number(row1.work_units), 0.5);

    const row2 = (await client.query(`SELECT half_shift, pay_units, work_units FROM timesheet_entries WHERE work_date = '2026-11-11'`)).rows[0];
    assert.equal(row2.half_shift, null);
    assert.equal(Number(row2.pay_units), 1);
    assert.equal(Number(row2.work_units), 1);
  });
});
