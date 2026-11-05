import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EmployeeDays, type ClaimStatus, type DayClaim, type EmployeeDaysInput } from '../../src/modules/requests/domain';
import { RequestsRepository } from '../../src/modules/requests/requests.repository';
import { RequestsService } from '../../src/modules/requests/requests.service';
import { createScriptedKysely, type ScriptedLogEntry, type ScriptedQuery } from './helpers/scripted-kysely';
import {
  NV_UUID,
  FakeAttendanceRepository,
  FakeHolidaysRepository,
  FakeRequestsRepository,
  leaveRequest,
  lwmRequest,
  makeService,
  otRequest,
  seed,
  shiftChange,
  staffContext
} from './helpers/requests-fakes';

const nvDays = (input: Partial<EmployeeDaysInput> = {}) =>
  new EmployeeDays({
    regularDows: [1, 2, 3, 4, 5, 6],
    holidays: [],
    defaultShift: { startTime: '08:00', endTime: '17:00' },
    schedules: [],
    activeRequests: [],
    claims: [],
    ...input
  });

const sqlOf = (log: ScriptedLogEntry[]): ScriptedQuery[] => log.filter((e): e is ScriptedQuery => typeof e !== 'string');

// ---- EmployeeDays (domain thuần) ----

test('shiftOf: holiday, then shift change, then schedule, then default', () => {
  const change = shiftChange('2026-11-12', '2026-11-12', 'NORMAL', '10:00', '19:00', 'PENDING');
  const days = new EmployeeDays({
    regularDows: [1, 2, 3, 4, 5, 6],
    holidays: ['2026-09-02'],
    defaultShift: { startTime: '08:00', endTime: '17:00' },
    schedules: [
      { date: '2026-09-02', startTime: '08:00', endTime: '17:00', onLeave: false },
      { date: '2026-11-13', startTime: '09:00', endTime: '18:00', onLeave: false },
      { date: '2026-11-17', startTime: '08:00', endTime: '17:00', onLeave: true }
    ],
    activeRequests: [change],
    // Ca đổi đọc từ dòng SHIFT_CHANGE của đơn trên ngày đó (Ruling F1).
    claims: [
      {
        employeeId: NV_UUID,
        date: '2026-11-12',
        status: 'SHIFT_CHANGE',
        requestId: change.id,
        baseRequestId: null,
        requestStatus: 'PENDING',
        baseRequestStatus: null
      }
    ]
  });
  assert.equal(days.shiftOf('2026-09-02'), null);
  assert.deepEqual(days.shiftOf('2026-11-12'), { startDate: '2026-11-12', startTime: '10:00', endTime: '19:00' });
  assert.equal(days.shiftOf('2026-11-13')?.startTime, '09:00');
  assert.equal(days.shiftOf('2026-11-14')?.startTime, '08:00'); // T7 của nv
  assert.equal(days.shiftOf('2026-11-15'), null); // CN
  assert.equal(days.shiftOf('2026-11-17'), null); // lịch ON_LEAVE
});

test('shiftOf ignores a rejected shift change and a shift change on a non-working day', () => {
  const days = nvDays({
    activeRequests: [
      shiftChange('2026-11-12', '2026-11-12', 'NORMAL', '10:00', '19:00', 'REJECTED'),
      shiftChange('2026-11-15', '2026-11-15', 'FLEX', '06:00', '15:00', 'APPROVED')
    ]
  });
  assert.equal(days.shiftOf('2026-11-12')?.startTime, '08:00');
  assert.equal(days.shiftOf('2026-11-15'), null);
});

test('working days skip Sundays, the type rest days and holidays', () => {
  const nv = nvDays({ holidays: ['2026-11-16'] });
  assert.deepEqual(nv.workingDaysBetween('2026-11-13', '2026-11-17'), ['2026-11-13', '2026-11-14', '2026-11-17']);
  assert.equal(nv.isHoliday('2026-11-16'), true);
  assert.equal(nv.isWorkingDay('2026-11-16'), false);
  assert.equal(nv.isWorkingDay('2026-11-14'), true);
  const tts = nvDays({ regularDows: [1, 2, 3, 4, 5] });
  assert.equal(tts.isWorkingDay('2026-11-14'), false);
});

test('shiftsAround lists the shifts of the day before, the day and the day after', () => {
  const days = nvDays({ schedules: [{ date: '2026-11-16', startTime: '22:00', endTime: '07:00', onLeave: false }] });
  assert.deepEqual(days.shiftsAround('2026-11-16'), [
    { startDate: '2026-11-16', startTime: '22:00', endTime: '07:00' },
    { startDate: '2026-11-17', startTime: '08:00', endTime: '17:00' }
  ]);
});

const claim = (date: string, status: ClaimStatus, requestStatus: DayClaim['requestStatus'] = 'PENDING'): DayClaim => ({
  employeeId: NV_UUID,
  date,
  status,
  requestId: `req-${date}`,
  baseRequestId: null,
  requestStatus,
  baseRequestStatus: null
});

test('isOnLeave reads only the LEAVE and LEAVE_WITH_MAKEUP day_status rows', () => {
  const days = nvDays({
    claims: [
      claim('2026-11-10', 'LEAVE'),
      claim('2026-11-12', 'LEAVE', 'APPROVED'),
      claim('2026-11-19', 'LEAVE_WITH_MAKEUP'),
      claim('2026-11-13', 'SHIFT_CHANGE'),
      claim('2026-11-14', 'ISAT', 'APPROVED')
    ]
  });
  for (const d of ['2026-11-10', '2026-11-12', '2026-11-19']) {
    assert.equal(days.isOnLeave(d), true, d);
  }
  for (const d of ['2026-11-09', '2026-11-11', '2026-11-13', '2026-11-14', '2026-11-20']) {
    assert.equal(days.isOnLeave(d), false, d);
  }
});

test('isOnLeave ignores an ON_LEAVE schedule and the active request list when no row holds the day', () => {
  const days = nvDays({
    schedules: [{ date: '2026-11-17', startTime: '08:00', endTime: '17:00', onLeave: true }],
    activeRequests: [leaveRequest('2026-11-10', '2026-11-11', 'PENDING')]
  });
  assert.equal(days.isOnLeave('2026-11-17'), false);
  assert.equal(days.isOnLeave('2026-11-10'), false);
  assert.equal(days.shiftOf('2026-11-17'), null); // lịch ON_LEAVE vẫn là ngày không có ca
});

test('isOnLeave keeps non-working days inside an active leave range on leave', () => {
  const claims = [claim('2026-11-12', 'LEAVE'), claim('2026-11-13', 'LEAVE'), claim('2026-11-14', 'ISAT', 'APPROVED'), claim('2026-11-16', 'LEAVE')];
  const active = nvDays({ claims, activeRequests: [leaveRequest('2026-11-12', '2026-11-16', 'PENDING')], holidays: ['2026-11-17'] });
  assert.equal(active.isOnLeave('2026-11-15'), true); // Chủ nhật trong khoảng
  assert.equal(active.isOnLeave('2026-11-14'), false); // ngày làm việc mang dòng ISAT
  assert.equal(active.isOnLeave('2026-11-17'), false); // ngoài khoảng

  const holiday = nvDays({ activeRequests: [leaveRequest('2026-11-16', '2026-11-18', 'APPROVED')], holidays: ['2026-11-17'] });
  assert.equal(holiday.isOnLeave('2026-11-17'), true); // ngày lễ trong khoảng
  assert.equal(holiday.isOnLeave('2026-11-18'), false); // ngày làm việc không có dòng

  const rejected = nvDays({ claims, activeRequests: [leaveRequest('2026-11-12', '2026-11-16', 'REJECTED')] });
  assert.equal(rejected.isOnLeave('2026-11-15'), false);
});

test('windowsOn lists OT and makeup slots of the day', () => {
  const days = nvDays({
    activeRequests: [
      otRequest('2026-11-12', '18:00', '22:00', 'APPROVED'),
      lwmRequest('2026-11-10', '2026-11-10', [
        { date: '2026-11-12', startTime: '06:00', endTime: '07:00' },
        { date: '2026-11-13', startTime: '18:00', endTime: '22:00' }
      ]),
      otRequest('2026-11-12', '20:00', '22:00', 'REJECTED'),
      otRequest('2026-11-13', '18:00', '22:00', 'PENDING'),
      otRequest('2026-11-12', '18:00', '22:00', 'PENDING', { otStartTime: null, otEndTime: null })
    ]
  });
  assert.deepEqual(days.windowsOn('2026-11-12'), [
    { date: '2026-11-12', startTime: '06:00', endTime: '07:00', kind: 'MAKEUP' },
    { date: '2026-11-12', startTime: '18:00', endTime: '22:00', kind: 'OT' }
  ]);
  assert.deepEqual(days.windowsOn('2026-11-14'), []);
});

test('claimOn returns the day_status row of the date, or null', () => {
  const row = {
    employeeId: NV_UUID,
    date: '2026-11-14',
    status: 'ISAT',
    requestId: 'isat-1',
    baseRequestId: null,
    requestStatus: 'APPROVED',
    baseRequestStatus: null
  } as const;
  const days = nvDays({ claims: [row] });
  assert.deepEqual(days.claimOn('2026-11-14'), row);
  assert.equal(days.claimOn('2026-11-13'), null);
  assert.equal(nvDays().claimOn('2026-11-14'), null);
});

test('windowSourcesOn names the request and status behind each window, with the same filter as windowsOn', () => {
  const ot = otRequest('2026-11-12', '18:00', '22:00', 'APPROVED');
  const lwm = lwmRequest('2026-11-10', '2026-11-10', [{ date: '2026-11-12', startTime: '06:00', endTime: '07:00' }]);
  const days = nvDays({
    activeRequests: [
      ot,
      lwm,
      otRequest('2026-11-12', '20:00', '22:00', 'REJECTED'),
      otRequest('2026-11-13', '18:00', '22:00', 'PENDING'),
      otRequest('2026-11-12', '18:00', '22:00', 'PENDING', { otStartTime: null, otEndTime: null })
    ]
  });
  assert.deepEqual(days.windowSourcesOn('2026-11-12'), [
    { kind: 'MAKEUP', requestId: lwm.id, requestStatus: 'PENDING' },
    { kind: 'OT', requestId: ot.id, requestStatus: 'APPROVED' }
  ]);
  assert.deepEqual(
    days.windowSourcesOn('2026-11-12').map(s => s.kind),
    days.windowsOn('2026-11-12').map(w => w.kind)
  );
  assert.deepEqual(days.windowSourcesOn('2026-11-14'), []);
});

test('shiftOf ignores an active shift change on a date that has no SHIFT_CHANGE claim', () => {
  const night = shiftChange('2026-11-09', '2026-11-15', 'NIGHT', '22:00', '07:00', 'APPROVED');
  const flex = shiftChange('2026-11-13', '2026-11-13', 'FLEX', '06:00', '15:00', 'PENDING');
  const held = (date: string, requestId: string): DayClaim => ({ ...claim(date, 'SHIFT_CHANGE', 'APPROVED'), requestId });
  const days = nvDays({
    activeRequests: [night, flex],
    claims: [
      held('2026-11-09', night.id),
      claim('2026-11-10', 'LEAVE'), // đơn nghỉ đã thay ngày này (T3)
      // 11/11 không có dòng: ngày bị bỏ rồi được trả (T4)
      held('2026-11-12', night.id),
      held('2026-11-13', flex.id), // dòng của đơn đổi ca khác: ca theo đơn giữ dòng
      claim('2026-11-14', 'ISAT', 'APPROVED'), // Thứ Bảy iSAT đã duyệt bị bỏ khỏi đơn (C2)
      held('2026-11-15', night.id) // dòng trên CN: ngày không làm việc vẫn không có ca
    ]
  });
  const regular = (date: string) => ({ startDate: date, startTime: '08:00', endTime: '17:00' });

  assert.deepEqual(days.shiftOf('2026-11-09'), { startDate: '2026-11-09', startTime: '22:00', endTime: '07:00' });
  assert.deepEqual(days.shiftOf('2026-11-10'), regular('2026-11-10'));
  assert.deepEqual(days.shiftOf('2026-11-11'), regular('2026-11-11'));
  assert.deepEqual(days.shiftOf('2026-11-12'), { startDate: '2026-11-12', startTime: '22:00', endTime: '07:00' });
  assert.deepEqual(days.shiftOf('2026-11-13'), { startDate: '2026-11-13', startTime: '06:00', endTime: '15:00' });
  assert.deepEqual(days.shiftOf('2026-11-14'), regular('2026-11-14'));
  assert.equal(days.shiftOf('2026-11-15'), null);
});

test('withShiftOverride changes only the given days', () => {
  const days = nvDays({ schedules: [{ date: '2026-11-13', startTime: '09:00', endTime: '18:00', onLeave: false }] });
  const next = days.withShiftOverride(['2026-11-12'], { startTime: '10:00', endTime: '19:00' });
  assert.deepEqual(next.shiftOf('2026-11-12'), { startDate: '2026-11-12', startTime: '10:00', endTime: '19:00' });
  assert.equal(next.shiftOf('2026-11-13')?.startTime, '09:00');
  assert.equal(days.shiftOf('2026-11-12')?.startTime, '08:00'); // bản gốc không đổi
});

// ---- Service ----

test('advance request is stored under the uuid and filed under the lock', async () => {
  const { service, lock } = makeService();
  const dto = await service.createAdvanceRequest({ employeeId: 'nv01', title: 't', reason: 'r', amount: 1_000_000, period: '2026-11' });
  assert.equal(dto.employeeId, NV_UUID);
  assert.deepEqual(lock.keys, [`requests_${NV_UUID}`]);
  await assert.rejects(
    service.createAdvanceRequest({ employeeId: 'ghost', title: 't', reason: 'r', amount: 1, period: '2026-11' }),
    /Không tìm thấy nhân sự: ghost/
  );
});

test('advance request can be approved (chuyển từ requests.test.ts "4. … tạm ứng")', async () => {
  const { service, repo } = makeService();
  const req = await service.createAdvanceRequest({
    employeeId: 'nv01',
    title: 'Tạm ứng lương giữa tháng',
    reason: 'Chi tiêu đột xuất',
    amount: 2000000,
    period: '2026-11'
  });
  assert.deepEqual([req.type, req.status, req.advanceAmount, req.advancePeriod], ['ADVANCE', 'PENDING', 2000000, '2026-11']);
  assert.deepEqual(repo.staffMonths, ['2026-11']);

  const reviewed = await service.reviewRequest(req.id, 'admin', 'APPROVE');
  assert.equal(reviewed.status, 'APPROVED');
});

test('loadDays without the holiday repository fails loudly', async () => {
  const service = new RequestsService(new FakeRequestsRepository(), new FakeAttendanceRepository());
  await assert.rejects((service as any).loadDays(staffContext(), '2026-11-12', '2026-11-12'), /Thiếu lịch lễ công ty/);
});

test('loadDays without the day status repository fails loudly', async () => {
  const service = new RequestsService(
    new FakeRequestsRepository(),
    new FakeAttendanceRepository(),
    undefined,
    new FakeHolidaysRepository()
  );
  await assert.rejects((service as any).loadDays(staffContext(), '2026-11-12', '2026-11-12'), /Thiếu bảng trạng thái ngày/);
});

test('loadDays reads one day either side and knows holidays, schedules, active requests and day_status', async () => {
  const ctx = makeService();
  const { service, repo, holidays, days: dayRows } = ctx;
  holidays.dates = [{ date: '2026-11-11', name: 'Lễ' }, { date: '2026-11-20', name: 'Ngoài khoảng' }];
  repo.schedules = [{ date: '2026-11-14', startTime: '22:00', endTime: '07:00', onLeave: false }];
  const pending = leaveRequest('2026-11-13', '2026-11-13', 'PENDING');
  await seed(ctx, pending);
  await seed(ctx, leaveRequest('2026-11-12', '2026-11-12', 'REJECTED'));

  const { days, active } = await (service as any).loadDays(staffContext(), '2026-11-12', '2026-11-13');
  assert.deepEqual(holidays.ranges, [['2026-11-11', '2026-11-14']]);
  assert.deepEqual(repo.scheduleRanges, [['2026-11-11', '2026-11-14']]);
  assert.deepEqual(dayRows.ranges, [['2026-11-11', '2026-11-14']]);
  assert.deepEqual(active.map((r: { id: string }) => r.id), [pending.id]);
  assert.equal(days.isHoliday('2026-11-11'), true);
  assert.equal(days.isOnLeave('2026-11-13'), true);
  assert.equal(days.isOnLeave('2026-11-12'), false);
  assert.equal(days.shiftOf('2026-11-14')?.startTime, '22:00');
});

test('requireTypeConfig refuses a staff type without configuration', async () => {
  const { service } = makeService();
  assert.deepEqual((service as any).requireTypeConfig(staffContext()), [1, 2, 3, 4, 5, 6]);
  assert.throws(() => (service as any).requireTypeConfig(staffContext({ regularDows: null })), /Thiếu cấu hình loại nhân sự nv/);
  await assert.rejects((service as any).loadDays(staffContext({ regularDows: null }), '2026-11-12', '2026-11-12'), /Thiếu cấu hình loại nhân sự nv/);
});

test('underEmployeeLock runs directly without a transaction coordinator', async () => {
  const service = new RequestsService(new FakeRequestsRepository(), new FakeAttendanceRepository());
  assert.equal(await (service as any).underEmployeeLock(NV_UUID, async () => 42), 42);
  const dto = await service.createAdvanceRequest({ employeeId: 'nv01', title: 't', reason: 'r', amount: 1, period: '2026-11' });
  assert.equal(dto.employeeId, NV_UUID);
});

// ---- Repository (SQL dựng sẵn) ----

test('findStaffContext reads the type version in effect', async () => {
  const { db, log } = createScriptedKysely(q => {
    if (q.sql.includes('from "staff"')) {
      return [{ uuid: 'u1', type: 'nv', shift_start_time: '08:00', shift_end_time: '17:00', leave_balance: null, leave_balance_on: null }];
    }
    if (q.sql.includes('from "position_types"')) return [{ id: 2, regular_dows: '[1,2,3,4,5,6]' }];
    if (q.sql.includes('from "position_type_benefits"')) {
      return [
        { benefit: 'ot', enabled: 1 },
        { benefit: 'makeup', enabled: '1' },
        { benefit: 'leaveAccount', enabled: 0 }
      ];
    }
    return [];
  });
  const found = await new RequestsRepository(db).findStaffContext('nv01', '2026-11');
  assert.deepEqual(found, {
    employeeId: 'u1',
    employeeType: 'nv',
    defaultShift: { startTime: '08:00', endTime: '17:00' },
    leaveBalance: 0,
    leaveBalanceOn: null,
    benefits: { ot: true, makeup: true, leaveAccount: false },
    regularDows: [1, 2, 3, 4, 5, 6]
  });
  const [staffQ, typeQ, benefitQ] = sqlOf(log);
  assert.equal(staffQ.parameters.filter(p => p === 'nv01').length, 2); // uuid = ? or username = ?
  assert.ok(typeQ.parameters.includes('2026-11') && typeQ.parameters.includes('nv'));
  assert.match(typeQ.sql, /order by "effective_month" desc/);
  assert.ok(benefitQ.parameters.includes(2));
});

test('findStaffContext without a type version has no days and no benefits; unknown staff is null', async () => {
  const staffRow = { uuid: 'u1', type: 'nv', shift_start_time: '09:00', shift_end_time: '18:00', leave_balance: 2.5, leave_balance_on: '2026-11-01' };
  const { db, log } = createScriptedKysely(q => (q.sql.includes('from "staff"') ? [staffRow] : []));
  const found = await new RequestsRepository(db).findStaffContext('u1', '2026-11');
  assert.deepEqual(found, {
    employeeId: 'u1',
    employeeType: 'nv',
    defaultShift: { startTime: '09:00', endTime: '18:00' },
    leaveBalance: 2.5,
    leaveBalanceOn: '2026-11-01',
    benefits: { ot: false, makeup: false, leaveAccount: false },
    regularDows: null
  });
  assert.equal(sqlOf(log).length, 2); // không tra quyền lợi khi không có phiên bản loại nhân sự

  const empty = createScriptedKysely(() => []);
  assert.equal(await new RequestsRepository(empty.db).findStaffContext('ghost', '2026-11'), null);
});

test('listScheduleDays reads dates and times as text', async () => {
  const { db, log } = createScriptedKysely(q =>
    q.sql.includes('from "work_schedules"')
      ? [
          { work_date: '2026-11-12', planned_start_time: '08:00', planned_end_time: '17:00', status: 'PLANNED' },
          { work_date: '2026-11-13', planned_start_time: '08:00', planned_end_time: '17:00', status: 'ON_LEAVE' }
        ]
      : []
  );
  const days = await new RequestsRepository(db).listScheduleDays(NV_UUID, '2026-11-11', '2026-11-14');
  assert.deepEqual(days, [
    { date: '2026-11-12', startTime: '08:00', endTime: '17:00', onLeave: false },
    { date: '2026-11-13', startTime: '08:00', endTime: '17:00', onLeave: true }
  ]);
  const [q] = sqlOf(log);
  assert.match(q.sql, /to_char\("work_date", 'YYYY-MM-DD'\)/);
  assert.match(q.sql, /to_char\("planned_start_time", 'HH24:MI'\)/);
  assert.match(q.sql, /to_char\("planned_end_time", 'HH24:MI'\)/);
  assert.deepEqual(q.parameters, [NV_UUID, '2026-11-11', '2026-11-14']);
});
