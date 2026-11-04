import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SystemRequest } from '../../src/modules/requests/domain';
import { RequestsRepository } from '../../src/modules/requests/requests.repository';
import { RequestsService } from '../../src/modules/requests/requests.service';
import { RequestsController } from '../../src/modules/requests/requests.controller';
import { AttendanceRepository } from '../../src/modules/attendance/attendance.repository';
import { WorkSchedule } from '../../src/modules/attendance/domain';
import { createScriptedKysely, type ScriptedLogEntry, type ScriptedQuery } from './helpers/scripted-kysely';

class FakeRequestsRepository extends RequestsRepository {
  requests: Map<string, SystemRequest> = new Map();

  constructor() {
    super({} as any);
  }

  override async save(request: SystemRequest): Promise<void> {
    this.requests.set(request.id, request);
  }

  override async findById(id: string): Promise<SystemRequest | null> {
    return this.requests.get(id) || null;
  }

  override async list(filter: any = {}): Promise<SystemRequest[]> {
    let result = Array.from(this.requests.values());
    if (filter.employeeId) result = result.filter((r) => r.employeeId === filter.employeeId);
    if (filter.type) result = result.filter((r) => r.type === filter.type);
    if (filter.status) result = result.filter((r) => r.status === filter.status);
    return result;
  }

  override async count(filter: any = {}): Promise<number> {
    const items = await this.list(filter);
    return items.length;
  }
}

class FakeAttendanceRepository extends AttendanceRepository {
  schedules: Map<string, WorkSchedule> = new Map();
  dayStatuses: Map<string, string> = new Map();

  constructor() {
    super({} as any);
  }

  override async ensureDefaultSchedule(employeeId: string, workDate: string): Promise<WorkSchedule> {
    const key = `${employeeId}:${workDate}`;
    const existing = this.schedules.get(key);
    if (existing) return existing;
    const def = WorkSchedule.create({
      employeeId,
      workDate,
      shiftType: 'NORMAL',
      plannedStartTime: '08:00',
      plannedEndTime: '17:00',
    });
    this.schedules.set(key, def);
    return def;
  }

  override async saveSchedule(schedule: WorkSchedule): Promise<void> {
    this.schedules.set(`${schedule.employeeId}:${schedule.workDate}`, schedule);
  }

  override async updateDayStatus(employeeId: string, workDate: string, status: string): Promise<void> {
    this.dayStatuses.set(`${employeeId}:${workDate}`, status);
  }
}

const lwmRequest = () =>
  new SystemRequest({ id: 'r1', employeeId: 'u1', title: 't', type: 'LEAVE_WITH_MAKEUP', reason: 'r',
    status: 'PENDING', leaveStartDate: '2026-11-10', leaveEndDate: '2026-11-11', leaveDaysCount: 2,
    makeupSlots: [{ date: '2026-11-15', startTime: '06:00', endTime: '20:00', workMinutes: 720 },
      { date: '2026-11-16', startTime: '18:00', endTime: '22:00', workMinutes: 240 }] });
const otRequest = () =>
  new SystemRequest({ id: 'r2', employeeId: 'u1', title: 't', type: 'OVERTIME', reason: 'r',
    status: 'PENDING', otDate: '2026-11-12', otStartTime: '18:00', otEndTime: '22:00', otHours: 4 });
const explanationRequest = () =>
  new SystemRequest({ id: 'r3', employeeId: 'u1', title: 't', type: 'EXPLANATION', reason: 'r',
    status: 'PENDING', explanationDate: '2026-11-04', explanationCases: ['LATE_CHECK_IN', 'MISSING_CHECK_OUT'],
    actualCheckIn: '08:20' });

const insertTargets = (log: ScriptedLogEntry[]) =>
  log.map(e => (typeof e === 'string' ? e : e.sql.match(/^insert into "(\w+)"/)?.[1]));
const sqlOf = (log: ScriptedLogEntry[]): ScriptedQuery[] =>
  log.filter((e): e is ScriptedQuery => typeof e !== 'string');

test('round trip keeps slots, cases and the new columns', () => {
  const req = lwmRequest();
  const row = req.toRow();
  assert.ok(!('correction_date' in row) && !('makeup_start_time' in row));
  assert.deepEqual(req.toMakeupSlotRows()[0],
    { request_id: 'r1', work_date: '2026-11-15', start_time: '06:00', end_time: '20:00', work_minutes: 720 });
  const back = SystemRequest.fromRow(row, null, { makeupSlots: req.makeupSlots });
  assert.deepEqual(back.toJSON(), req.toJSON());
  assert.equal(req.toJSON().owedMinutes, 960);

  const explanation = explanationRequest();
  assert.deepEqual(explanation.toExplanationCaseRows(), [
    { request_id: 'r3', case_code: 'LATE_CHECK_IN' },
    { request_id: 'r3', case_code: 'MISSING_CHECK_OUT' }
  ]);
  const explanationRow = explanation.toRow();
  assert.equal(explanationRow.explanation_date, '2026-11-04');
  assert.equal(explanationRow.actual_check_in, '08:20');
  const explanationBack = SystemRequest.fromRow(explanationRow, null, { explanationCases: explanation.explanationCases });
  assert.deepEqual(explanationBack.toJSON(), explanation.toJSON());
});

test('DTO of an OT request has empty child lists and null owedMinutes', () => {
  const dto = otRequest().toJSON();
  assert.deepEqual([dto.makeupSlots, dto.explanationCases, dto.owedMinutes, dto.changeStartDate], [[], [], null, null]);
  for (const key of ['correctionDate', 'correctionPunchType', 'correctionActualTime', 'makeupStartTime', 'makeupEndTime']) {
    assert.ok(!(key in dto), key);
  }
  for (const key of ['explanationDate', 'actualCheckIn', 'actualCheckOut', 'changeEndDate', 'newShiftType', 'isat']) {
    assert.equal((dto as any)[key], null, key);
  }
});

test('temporary factories fill the new fields', () => {
  const lwm = SystemRequest.createLeaveWithMakeupRequest({ employeeId: 'u1', title: 't', reason: 'r',
    leaveDate: '2026-11-10', makeupDate: '2026-11-12', makeupStartTime: '18:00', makeupEndTime: '22:00' }).toJSON();
  assert.deepEqual(
    [lwm.leaveStartDate, lwm.leaveEndDate, lwm.leaveType, lwm.leaveDaysCount, lwm.owedMinutes],
    ['2026-11-10', '2026-11-10', null, 1, 480]
  );
  assert.deepEqual(lwm.makeupSlots, [{ date: '2026-11-12', startTime: '18:00', endTime: '22:00', workMinutes: 240 }]);

  const shift = SystemRequest.createShiftChangeRequest({ employeeId: 'u1', title: 't', reason: 'r',
    changeDate: '2026-11-13', newShiftType: 'NIGHT', newStartTime: '22:00', newEndTime: '07:00' }).toJSON();
  assert.deepEqual([shift.changeStartDate, shift.changeEndDate, shift.leaveStartDate], ['2026-11-13', '2026-11-13', null]);

  const explanation = SystemRequest.createExplanationRequest({ employeeId: 'u1', title: 't', reason: 'r',
    workDate: '2026-11-04', actualCheckIn: '08:20', actualCheckOut: '17:40' }).toJSON();
  assert.deepEqual([explanation.explanationDate, explanation.actualCheckIn, explanation.actualCheckOut],
    ['2026-11-04', '08:20', '17:40']);
});

test('save writes a leave-with-makeup request and its slots in one transaction', async () => {
  const { db, log } = createScriptedKysely();
  await new RequestsRepository(db).save(lwmRequest());
  assert.deepEqual(insertTargets(log), ['BEGIN', 'system_requests', 'makeup_slots', 'COMMIT']);
  assert.match((log[2] as ScriptedQuery).sql, /on conflict \("request_id", "work_date", "start_time"\) do nothing/);
  assert.deepEqual((log[2] as ScriptedQuery).parameters,
    ['r1', '2026-11-15', '06:00', '20:00', 720, 'r1', '2026-11-16', '18:00', '22:00', 240]);
  const upsert = (log[1] as ScriptedQuery).sql;
  assert.ok(!/correction_|makeup_start_time|makeup_end_time/.test(upsert), upsert);
  for (const column of ['explanation_date', 'actual_check_in', 'actual_check_out', 'change_start_date', 'change_end_date']) {
    assert.ok(upsert.includes(`"${column}" = "excluded"."${column}"`), column);
  }
});

test('save writes explanation cases in the same transaction', async () => {
  const { db, log } = createScriptedKysely();
  await new RequestsRepository(db).save(explanationRequest());
  assert.deepEqual(insertTargets(log), ['BEGIN', 'system_requests', 'explanation_cases', 'COMMIT']);
  assert.match((log[2] as ScriptedQuery).sql, /on conflict \("request_id", "case_code"\) do nothing/);
  assert.deepEqual((log[2] as ScriptedQuery).parameters, ['r3', 'LATE_CHECK_IN', 'r3', 'MISSING_CHECK_OUT']);
});

test('a request without children is one statement', async () => {
  const { db, log } = createScriptedKysely();
  await new RequestsRepository(db).save(otRequest());
  assert.equal(log.length, 1);
  assert.match((log[0] as ScriptedQuery).sql, /^insert into "system_requests"/);
});

test('list reads DATE columns as text and loads children only for their types', async () => {
  const otOnly = createScriptedKysely(q => (q.sql.includes('from "system_requests"') ? [otRequest().toRow()] as any : []));
  const [ot] = await new RequestsRepository(otOnly.db).list({});
  assert.equal(ot.otDate, '2026-11-12');
  assert.equal(sqlOf(otOnly.log).length, 1);
  const [select] = sqlOf(otOnly.log);
  assert.ok(!select.sql.includes('select *'), select.sql);
  for (const column of ['leave_start_date', 'leave_end_date', 'explanation_date', 'ot_date', 'change_start_date', 'change_end_date']) {
    assert.ok(select.sql.includes(`to_char("${column}", 'YYYY-MM-DD') as "${column}"`), column);
  }

  const lwm = lwmRequest();
  const withSlots = createScriptedKysely(q => {
    if (q.sql.includes('from "system_requests"')) return [otRequest().toRow(), lwm.toRow()] as any;
    if (q.sql.includes('from "makeup_slots"')) return lwm.toMakeupSlotRows() as any;
    return [];
  });
  const [otItem, lwmItem] = await new RequestsRepository(withSlots.db).list({});
  assert.deepEqual(otItem.makeupSlots, []);
  assert.deepEqual(lwmItem.makeupSlots, lwm.makeupSlots);
  assert.equal(sqlOf(withSlots.log).length, 2);
  const slots = sqlOf(withSlots.log)[1];
  assert.match(slots.sql, /from "makeup_slots"/);
  assert.match(slots.sql, /to_char\("work_date", 'YYYY-MM-DD'\)/);
  assert.match(slots.sql, /order by "work_date", "start_time"/);
  assert.deepEqual(slots.parameters, ['r1']);
});

test('findById reads explanation cases back in the constant order', async () => {
  const req = explanationRequest();
  const { db, log } = createScriptedKysely(q => {
    if (q.sql.includes('from "system_requests"')) return [req.toRow()] as any;
    if (q.sql.includes('from "explanation_cases"')) return req.toExplanationCaseRows().reverse() as any;
    return [];
  });
  const found = await new RequestsRepository(db).findById('r3');
  assert.deepEqual(found!.toJSON(), req.toJSON());
  assert.deepEqual(found!.explanationCases, ['LATE_CHECK_IN', 'MISSING_CHECK_OUT']);
  const [select, cases] = sqlOf(log);
  assert.equal(sqlOf(log).length, 2);
  assert.match(select.sql, /to_char\("explanation_date", 'YYYY-MM-DD'\) as "explanation_date"/);
  assert.match(cases.sql, /from "explanation_cases"/);
  assert.deepEqual(cases.parameters, ['r3']);
});

test('listActive keeps PENDING and APPROVED of one employee', async () => {
  const lwm = lwmRequest();
  const { db, log } = createScriptedKysely(q => {
    if (q.sql.includes('from "system_requests"')) return [lwm.toRow()] as any;
    if (q.sql.includes('from "makeup_slots"')) return lwm.toMakeupSlotRows() as any;
    return [];
  });
  const [item] = await new RequestsRepository(db).listActive('u1');
  const [q] = sqlOf(log);
  assert.match(q.sql, /"employee_id" = \$1/);
  assert.match(q.sql, /"status" in \(\$2, \$3\)/);
  assert.match(q.sql, /to_char\("leave_start_date", 'YYYY-MM-DD'\) as "leave_start_date"/);
  assert.deepEqual(q.parameters, ['u1', 'PENDING', 'APPROVED']);
  assert.deepEqual(item.makeupSlots, lwm.makeupSlots);
});

test('the correction request is gone', () => {
  assert.equal((SystemRequest as any).createCorrectionRequest, undefined);
  assert.equal((RequestsService.prototype as any).createCorrectionRequest, undefined);
  assert.equal((RequestsController.prototype as any).createCorrection, undefined);
  assert.equal((WorkSchedule.prototype as any).withMakeUp, undefined);
});

test('approving OT writes no schedule; approving leave-with-makeup marks the leave day only', async () => {
  const repo = new FakeRequestsRepository();
  const att = new FakeAttendanceRepository();
  const service = new RequestsService(repo, att);

  await repo.save(otRequest());
  const ot = await service.reviewRequest('r2', 'admin', 'APPROVE');
  assert.equal(ot.status, 'APPROVED');
  assert.equal(att.schedules.size, 0);

  const lwm = await service.createLeaveWithMakeupRequest({ employeeId: 'u1', title: 't', reason: 'r',
    leaveDate: '2026-11-10', makeupDate: '2026-11-12', makeupStartTime: '18:00', makeupEndTime: '22:00' });
  await service.reviewRequest(lwm.id, 'admin', 'APPROVE');
  assert.deepEqual([...att.schedules.keys()], ['u1:2026-11-10']);
  assert.equal(att.schedules.get('u1:2026-11-10')!.status, 'ON_LEAVE');
});

test('approving a shift change writes the schedule on changeStartDate', async () => {
  const repo = new FakeRequestsRepository();
  const att = new FakeAttendanceRepository();
  const service = new RequestsService(repo, att);

  const shift = await service.createShiftChangeRequest({ employeeId: 'u1', title: 't', reason: 'r',
    changeDate: '2026-11-13', newShiftType: 'FLEX', newStartTime: '10:00', newEndTime: '19:00' });
  await service.reviewRequest(shift.id, 'admin', 'APPROVE');
  const sched = att.schedules.get('u1:2026-11-13');
  assert.deepEqual([sched?.shiftType, sched?.plannedStartTime, sched?.plannedEndTime, sched?.scheduleType],
    ['FLEX', '10:00', '19:00', 'SHIFT_CHANGE']);
  assert.equal(att.schedules.size, 1);
});
