import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { IsatRegistration, SystemRequest } from '../../src/modules/requests/domain';
import { RequestsRepository } from '../../src/modules/requests/requests.repository';
import { createScriptedKysely, type ScriptedLogEntry, type ScriptedQuery } from './helpers/scripted-kysely';

const profile = {
  fullName: 'Nguyễn Văn A', positionType: 'nv', positionLevel: 2, levelName: 'Chuyên viên',
  shiftType: 'NORMAL', shiftStartTime: '08:00', shiftEndTime: '17:00'
};
const allPassed = { NO_VIOLATION: true, REPORTS_DONE: true, WORK_COMPLETED: true, OFFICIAL_EMPLOYEE: true };

const isatReq = () =>
  SystemRequest.createIsatRequest({
    employeeId: 'emp-uuid-1', saturday: '2026-11-07', team: 'VN Pod', conditions: allPassed, profile
  } as any);
const leaveReq = () =>
  SystemRequest.createLeaveRequest({
    employeeId: 'emp-uuid-1', title: 'Nghỉ phép', reason: 'Việc gia đình',
    leaveType: 'PAID', startDate: '2026-11-10', endDate: '2026-11-10', daysCount: 1
  });
const sqlOf = (log: ScriptedLogEntry[]): ScriptedQuery[] =>
  log.filter((e): e is ScriptedQuery => typeof e !== 'string');

// Giả lập DB có sẵn một đơn iSAT (và các dòng con xáo thứ tự) cùng các dòng system_requests cho trước.
const scriptedStore = (req: SystemRequest, requestRows: unknown[]) =>
  createScriptedKysely(q => {
    if (q.sql.includes('from "isat_registration_conditions"')) return req.isat!.toConditionRows(req.id).reverse() as any;
    if (q.sql.includes('from "isat_registrations"')) return [req.isat!.toRow(req.id)] as any;
    if (q.sql.includes('from "system_requests"')) return requestRows as any;
    return [];
  });

describe('RequestsRepository - đơn iSAT', () => {
  it('saves an ISAT request across three tables in one transaction, idempotently', async () => {
    const { db, log } = createScriptedKysely();
    await new RequestsRepository(db).save(isatReq());
    assert.deepEqual(
      log.map(e => (typeof e === 'string' ? e : e.sql.match(/^insert into "(\w+)"/)?.[1])),
      ['BEGIN', 'system_requests', 'isat_registrations', 'isat_registration_conditions', 'COMMIT']
    );
    assert.match(sqlOf(log)[1].sql, /on conflict \("request_id"\) do nothing/);
    assert.match(sqlOf(log)[2].sql, /on conflict \("request_id", "code"\) do nothing/);
  });

  it('rolls the transaction back when a later insert fails', async () => {
    const { db, log } = createScriptedKysely(q => {
      if (q.sql.startsWith('insert into "isat_registration_conditions"')) throw new Error('conditions insert failed');
      return [];
    });
    await assert.rejects(new RequestsRepository(db).save(isatReq()), /conditions insert failed/);
    assert.deepEqual(
      log.map(e => (typeof e === 'string' ? e : e.sql.match(/^insert into "(\w+)"/)?.[1])),
      ['BEGIN', 'system_requests', 'isat_registrations', 'isat_registration_conditions', 'ROLLBACK']
    );
    assert.ok(!log.includes('COMMIT'));
  });

  it('skips the conditions insert when the registration has no conditions', async () => {
    const req = isatReq();
    const bare = SystemRequest.fromRow(req.toRow(), IsatRegistration.fromRows(req.isat!.toRow(req.id), []));
    assert.equal(bare.isat!.conditions.length, 0);
    const { db, log } = createScriptedKysely();
    await new RequestsRepository(db).save(bare);
    assert.deepEqual(
      log.map(e => (typeof e === 'string' ? e : e.sql.match(/^insert into "(\w+)"/)?.[1])),
      ['BEGIN', 'system_requests', 'isat_registrations', 'COMMIT']
    );
  });

  it('saves other request types without a transaction', async () => {
    const { db, log } = createScriptedKysely();
    await new RequestsRepository(db).save(leaveReq());
    assert.equal(log.length, 1);
    assert.match((log[0] as ScriptedQuery).sql, /^insert into "system_requests"/);
  });

  it('attaches registration and ordered conditions to ISAT rows only', async () => {
    const req = isatReq();
    const leaveRow = leaveReq().toRow();
    const { db, log } = scriptedStore(req, [req.toRow(), leaveRow]);
    const [isatItem, leaveItem] = await new RequestsRepository(db).list({});
    assert.deepEqual(isatItem.toJSON().isat, req.toJSON().isat);
    assert.equal(leaveItem.isat, null);
    const reg = sqlOf(log).find(q => q.sql.includes('from "isat_registrations"'))!;
    assert.match(reg.sql, /to_char\("isat_registrations"\."saturday", 'YYYY-MM-DD'\)/);
    assert.deepEqual(reg.parameters, [req.id]);
    const conditions = sqlOf(log).find(q => q.sql.includes('from "isat_registration_conditions"'))!;
    assert.match(conditions.sql, /order by "sort_order"/);
    assert.deepEqual(conditions.parameters, [req.id]);
  });

  it('runs no iSAT queries when the page has no ISAT rows', async () => {
    const { db, log } = createScriptedKysely(q => (q.sql.includes('from "system_requests"') ? [leaveReq().toRow()] as any : []));
    await new RequestsRepository(db).list({});
    assert.equal(sqlOf(log).length, 1);
  });

  it('findById attaches the registration too', async () => {
    const req = isatReq();
    const { db, log } = scriptedStore(req, [req.toRow()]);
    const found = await new RequestsRepository(db).findById(req.id);
    assert.deepEqual(found!.toJSON(), req.toJSON());
    assert.equal(sqlOf(log).length, 3);
  });

  it('findById runs no iSAT queries for other types and returns null when missing', async () => {
    const leave = leaveReq();
    const first = createScriptedKysely(() => [leave.toRow()] as any);
    const found = await new RequestsRepository(first.db).findById(leave.id);
    assert.equal(found!.isat, null);
    assert.equal(sqlOf(first.log).length, 1);

    const second = createScriptedKysely();
    assert.equal(await new RequestsRepository(second.db).findById('missing'), null);
    assert.equal(sqlOf(second.log).length, 1);
  });

  it('maps an ISAT row whose registration row is missing to isat null', async () => {
    const req = isatReq();
    const { db } = createScriptedKysely(q => (q.sql.includes('from "system_requests"') ? [req.toRow()] as any : []));
    const [item] = await new RequestsRepository(db).list({});
    assert.equal(item.type, 'ISAT');
    assert.equal(item.isat, null);
    assert.equal(item.toJSON().isat, null);
  });

  describe('resolveStaffUuid', () => {
    it('selects the uuid by uuid or username and maps the row', async () => {
      const { db, log } = createScriptedKysely(q => (q.sql.includes('from "staff"') ? [{ uuid: 'emp-uuid-1' }] as any : []));
      assert.equal(await new RequestsRepository(db).resolveStaffUuid('nguyen-van-a'), 'emp-uuid-1');
      const [staffQ] = sqlOf(log);
      assert.equal(sqlOf(log).length, 1);
      assert.match(staffQ.sql, /^select "uuid" from "staff" where \("uuid" = \$1 or "username" = \$2\)/);
      assert.deepEqual(staffQ.parameters, ['nguyen-van-a', 'nguyen-van-a']);
    });

    it('returns null when no staff row matches or the row has no uuid', async () => {
      const none = createScriptedKysely();
      assert.equal(await new RequestsRepository(none.db).resolveStaffUuid('ghost'), null);

      const blank = createScriptedKysely(() => [{ uuid: null }] as any);
      assert.equal(await new RequestsRepository(blank.db).resolveStaffUuid('ghost'), null);
    });
  });

  describe('employeeIds filter', () => {
    it('list matches any of the given employee ids', async () => {
      const { db, log } = createScriptedKysely();
      await new RequestsRepository(db).list({ employeeIds: ['nguyen-van-a', 'emp-uuid-1'], type: 'ISAT' });
      const [q] = sqlOf(log);
      assert.match(q.sql, /where "employee_id" in \(\$1, \$2\) and "type" = \$3/);
      assert.deepEqual(q.parameters, ['nguyen-van-a', 'emp-uuid-1', 'ISAT']);
    });

    it('count matches any of the given employee ids', async () => {
      const { db, log } = createScriptedKysely(() => [{ total: '3' }] as any);
      assert.equal(await new RequestsRepository(db).count({ employeeIds: ['nguyen-van-a', 'emp-uuid-1'], status: 'PENDING' }), 3);
      const [q] = sqlOf(log);
      assert.match(q.sql, /where "employee_id" in \(\$1, \$2\) and "status" = \$3/);
      assert.deepEqual(q.parameters, ['nguyen-van-a', 'emp-uuid-1', 'PENDING']);
    });

    it('employeeIds wins over employeeId when both are given', async () => {
      const { db, log } = createScriptedKysely();
      await new RequestsRepository(db).list({ employeeId: 'single', employeeIds: ['a', 'b'] });
      const [q] = sqlOf(log);
      assert.match(q.sql, /"employee_id" in \(\$1, \$2\)/);
      assert.ok(!q.parameters.includes('single'));
    });

    it('an empty employeeIds list never emits an empty IN', async () => {
      const noFilter = createScriptedKysely();
      await new RequestsRepository(noFilter.db).list({ employeeIds: [] });
      const noFilterCount = createScriptedKysely();
      await new RequestsRepository(noFilterCount.db).count({ employeeIds: [] });
      for (const q of [sqlOf(noFilter.log)[0], sqlOf(noFilterCount.log)[0]]) {
        assert.ok(!/ in \(/.test(q.sql), q.sql);
        // list chọn rõ cột "employee_id"; chỉ phần sau FROM không được lọc theo nhân sự.
        assert.ok(!q.sql.slice(q.sql.indexOf(' from ')).includes('employee_id'), q.sql);
        assert.deepEqual(q.parameters, []);
      }

      const equality = createScriptedKysely();
      await new RequestsRepository(equality.db).list({ employeeId: 'single', employeeIds: [] });
      const equalityCount = createScriptedKysely();
      await new RequestsRepository(equalityCount.db).count({ employeeId: 'single', employeeIds: [] });
      for (const q of [sqlOf(equality.log)[0], sqlOf(equalityCount.log)[0]]) {
        assert.match(q.sql, /where "employee_id" = \$1/);
        assert.ok(!/ in \(/.test(q.sql), q.sql);
        assert.deepEqual(q.parameters, ['single']);
      }
    });
  });

  describe('findIsatProfile', () => {
    const staffRow = {
      uuid: 'emp-uuid-1', name: 'Nguyễn Văn A', type: 'nv', level: 2,
      shift_type: 'NORMAL', shift_start_time: '08:00', shift_end_time: '17:00'
    };
    const respondWith = (staff: unknown[], levels: unknown[], benefits: unknown[]) =>
      createScriptedKysely(q => {
        if (q.sql.includes('from "staff"')) return staff as any;
        if (q.sql.includes('from "position_levels"')) return levels as any;
        if (q.sql.includes('"position_type_benefits"')) return benefits as any;
        return [];
      });

    it('resolves uuid or username with level name and isat flag effective at the month', async () => {
      const { db, log } = respondWith([staffRow], [{ name: 'Chuyên viên' }], [{ enabled: 1 }]);
      assert.deepEqual(await new RequestsRepository(db).findIsatProfile('nguyen-van-a', '2026-11'), {
        employeeId: 'emp-uuid-1', isatEnabled: true, snapshot: profile
      });
      const [staffQ, levelQ, benefitQ] = sqlOf(log);
      assert.equal(staffQ.parameters.filter(p => p === 'nguyen-van-a').length, 2); // uuid = ? or username = ?
      assert.ok(levelQ.parameters.includes('2026-11'));
      assert.ok(levelQ.parameters.includes('nv') && levelQ.parameters.includes(2));
      assert.match(levelQ.sql, /order by "effective_month" desc/);
      assert.ok(benefitQ.parameters.includes('2026-11') && benefitQ.parameters.includes('isat') && benefitQ.parameters.includes('nv'));
      // Phiên bản chức vụ mới nhất trước, rồi mới tra quyền lợi: điều kiện isat nằm ở ON của left join, không ở WHERE.
      assert.match(
        benefitQ.sql,
        /from "position_types" left join "position_type_benefits" on "position_type_benefits"\."type_id" = "position_types"\."id" and "position_type_benefits"\."benefit" = \$\d+ where/
      );
      assert.ok(!benefitQ.sql.includes('inner join'));
      assert.ok(!benefitQ.sql.split(' where ')[1].includes('"position_type_benefits"'));
      assert.match(benefitQ.sql, /order by "position_types"\."effective_month" desc limit/);
    });

    it('returns null when there is no staff row', async () => {
      const { db, log } = respondWith([], [], []);
      assert.equal(await new RequestsRepository(db).findIsatProfile('ghost', '2026-11'), null);
      assert.equal(sqlOf(log).length, 1);
    });

    it('returns null when the staff row has no uuid', async () => {
      const { db, log } = respondWith([{ ...staffRow, uuid: null }], [{ name: 'Chuyên viên' }], [{ enabled: 1 }]);
      assert.equal(await new RequestsRepository(db).findIsatProfile('nguyen-van-a', '2026-11'), null);
      assert.equal(sqlOf(log).length, 1);
    });

    it('turns the isat flag off when the benefit row is missing', async () => {
      const { db } = respondWith([staffRow], [{ name: 'Chuyên viên' }], []);
      const found = await new RequestsRepository(db).findIsatProfile('emp-uuid-1', '2026-11');
      assert.equal(found!.isatEnabled, false);
    });

    it('turns the isat flag off when the newest type version has no isat benefit row', async () => {
      const { db } = respondWith([staffRow], [{ name: 'Chuyên viên' }], [{ enabled: null }]);
      const found = await new RequestsRepository(db).findIsatProfile('emp-uuid-1', '2026-11');
      assert.equal(found!.isatEnabled, false);
    });

    it('turns the isat flag off when the benefit is disabled', async () => {
      const { db } = respondWith([staffRow], [{ name: 'Chuyên viên' }], [{ enabled: 0 }]);
      const found = await new RequestsRepository(db).findIsatProfile('emp-uuid-1', '2026-11');
      assert.equal(found!.isatEnabled, false);
    });

    it('snapshots a null level name when the catalog has none', async () => {
      const { db } = respondWith([staffRow], [], [{ enabled: 1 }]);
      const found = await new RequestsRepository(db).findIsatProfile('emp-uuid-1', '2026-11');
      assert.equal(found!.snapshot.levelName, null);
      assert.deepEqual(found!.snapshot, { ...profile, levelName: null });
    });
  });
});
