'use strict';

const F = require('../helpers/api-fixture');
const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');

const { store } = F;

before(async () => {
  await F.start();
  await F.at('2026-11-02T09:00:00');
  await F.person('admin', 'admin', { type: 'tts', level: 0, shiftCode: null, startDate: null });
});

after(async () => {
  await F.stop();
});

describe('Employee V2 CRUD & PATCH API Endpoints', () => {
  test('POST /api/v2/employees creates employees with NORMAL, FLEX, NIGHT shifts and syncs to staff table', async () => {
    // 1. NORMAL shift employee
    const resNormal = await F.call('POST', '/v2/employees', {
      who: 'admin',
      body: {
        account: {
          username: 'emp_normal',
          password: 'NormalPass123!'
        },
        profile: {
          fullName: 'Nguyen Van Normal',
          birthday: '1990-01-01',
          dependants: 1
        },
        contract: {
          position: {
            type: 'nv',
            level: 1,
            jobTitle: 'Software Engineer'
          },
          shift: {
            type: 'NORMAL',
            startTime: '08:00',
            endTime: '17:00',
            allowancePct: 0
          },
          leave: {
            totalDays: 12,
            usedDays: 0
          },
          status: 'nv'
        }
      }
    });

    assert.ok([200, 201].includes(resNormal.status));
    assert.equal(resNormal.data.created, true);
    assert.equal(resNormal.data.employee.account.username, 'emp_normal');
    assert.equal(resNormal.data.employee.contract.shift.type, 'NORMAL');
    assert.equal(resNormal.data.employee.contract.shift.allowancePct, 0);

    const rowNormal = await store.queryBuilder
      .selectFrom('staff')
      .selectAll()
      .where('username', '=', 'emp_normal')
      .executeTakeFirst();

    assert.ok(rowNormal, 'staff row for emp_normal must exist');
    assert.equal(rowNormal.username, 'emp_normal');
    assert.equal(rowNormal.name, 'Nguyen Van Normal');
    assert.equal(rowNormal.shift_type, 'NORMAL');
    assert.equal(rowNormal.shift_start_time, '08:00');
    assert.equal(rowNormal.shift_end_time, '17:00');
    assert.equal(Number(rowNormal.shift_allowance_pct), 0);
    assert.equal(Number(rowNormal.leave_total_days), 12);
    assert.equal(Number(rowNormal.leave_used_days), 0);
    assert.equal(Number(rowNormal.leave_balance), 12);
    assert.equal(rowNormal.type, 'nv');
    assert.equal(Number(rowNormal.level), 1);
    assert.equal(rowNormal.job_title, 'Software Engineer');
    assert.ok(rowNormal.uuid, 'uuid must be set');

    // 2. FLEX shift employee
    const resFlex = await F.call('POST', '/v2/employees', {
      who: 'admin',
      body: {
        account: {
          username: 'emp_flex',
          password: 'FlexPass123!'
        },
        profile: {
          fullName: 'Tran Thi Flex'
        },
        contract: {
          shift: {
            type: 'FLEX',
            startTime: '06:00',
            endTime: '15:00',
            allowancePct: 10
          }
        }
      }
    });

    assert.ok([200, 201].includes(resFlex.status));
    assert.equal(resFlex.data.created, true);
    assert.equal(resFlex.data.employee.contract.shift.type, 'FLEX');
    assert.equal(resFlex.data.employee.contract.shift.allowancePct, 10);

    const rowFlex = await store.queryBuilder
      .selectFrom('staff')
      .selectAll()
      .where('username', '=', 'emp_flex')
      .executeTakeFirst();

    assert.ok(rowFlex, 'staff row for emp_flex must exist');
    assert.equal(rowFlex.shift_type, 'FLEX');
    assert.equal(rowFlex.shift_start_time, '06:00');
    assert.equal(rowFlex.shift_end_time, '15:00');
    assert.equal(Number(rowFlex.shift_allowance_pct), 10);

    // 3. NIGHT shift employee (40%)
    const resNight = await F.call('POST', '/v2/employees', {
      who: 'admin',
      body: {
        account: {
          username: 'emp_night',
          password: 'NightPass123!'
        },
        profile: {
          fullName: 'Le Van Night'
        },
        contract: {
          shift: {
            type: 'NIGHT',
            startTime: '21:00',
            endTime: '06:00',
            allowancePct: 40
          }
        }
      }
    });

    assert.ok([200, 201].includes(resNight.status));
    assert.equal(resNight.data.created, true);
    assert.equal(resNight.data.employee.contract.shift.type, 'NIGHT');
    assert.equal(resNight.data.employee.contract.shift.allowancePct, 40);

    const rowNight = await store.queryBuilder
      .selectFrom('staff')
      .selectAll()
      .where('username', '=', 'emp_night')
      .executeTakeFirst();

    assert.ok(rowNight, 'staff row for emp_night must exist');
    assert.equal(rowNight.shift_type, 'NIGHT');
    assert.equal(rowNight.shift_start_time, '21:00');
    assert.equal(rowNight.shift_end_time, '06:00');
    assert.equal(Number(rowNight.shift_allowance_pct), 40);

    // 4. Flat structure creation
    const resFlat = await F.call('POST', '/v2/employees', {
      who: 'admin',
      body: {
        username: 'emp_flat',
        name: 'Hoang Van Flat',
        shiftType: 'NORMAL',
        startTime: '08:00',
        endTime: '17:00',
        totalDays: 14,
        usedDays: 2,
        type: 'ql',
        level: 3
      }
    });

    assert.ok([200, 201].includes(resFlat.status));
    assert.equal(resFlat.data.created, true);

    const rowFlat = await store.queryBuilder
      .selectFrom('staff')
      .selectAll()
      .where('username', '=', 'emp_flat')
      .executeTakeFirst();

    assert.ok(rowFlat);
    assert.equal(rowFlat.type, 'ql');
    assert.equal(Number(rowFlat.level), 3);
    assert.equal(Number(rowFlat.leave_total_days), 14);
    assert.equal(Number(rowFlat.leave_used_days), 2);
    assert.equal(Number(rowFlat.leave_balance), 12);
  });

  test('GET /api/v2/employees lists employees and supports filters', async () => {
    // List all
    const all = await F.call('GET', '/v2/employees', { who: 'admin' });
    assert.equal(all.status, 200);
    assert.ok(Array.isArray(all.data.employees));
    assert.ok(all.data.employees.length >= 4);

    // Filter by shiftType
    const nights = await F.call('GET', '/v2/employees?shiftType=NIGHT', { who: 'admin' });
    assert.equal(nights.status, 200);
    assert.ok(nights.data.employees.every((e: any) => e.contract.shift.type === 'NIGHT'));
    assert.ok(nights.data.employees.some((e: any) => e.account.username === 'emp_night'));

    // Filter by q
    const flexSearch = await F.call('GET', '/v2/employees?q=flex', { who: 'admin' });
    assert.equal(flexSearch.status, 200);
    assert.ok(flexSearch.data.employees.some((e: any) => e.account.username === 'emp_flex'));
  });

  test('GET /api/v2/employees/:username looks up by username and uuid', async () => {
    // By username
    const byUsername = await F.call('GET', '/v2/employees/emp_normal', { who: 'admin' });
    assert.equal(byUsername.status, 200);
    assert.equal(byUsername.data.employee.account.username, 'emp_normal');
    assert.equal(byUsername.data.employee.profile.fullName, 'Nguyen Van Normal');

    const uuid = byUsername.data.employee.profile.uuid;
    assert.ok(uuid);

    // By uuid
    const byUuid = await F.call('GET', `/v2/employees/${uuid}`, { who: 'admin' });
    assert.equal(byUuid.status, 200);
    assert.equal(byUuid.data.employee.account.username, 'emp_normal');
    assert.equal(byUuid.data.employee.profile.uuid, uuid);

    // Missing employee returns 404
    const notFound = await F.call('GET', '/v2/employees/non_existent_user_9999', { who: 'admin' });
    assert.equal(notFound.status, 404);
    assert.equal(notFound.data.code, 'EMPLOYEE_NOT_FOUND');
  });

  test('PATCH /api/v2/employees/:username/profile updates profile and syncs to staff row', async () => {
    const res = await F.call('PATCH', '/v2/employees/emp_normal/profile', {
      who: 'admin',
      body: {
        fullName: 'Nguyen Van Normal Updated',
        birthday: '1995-05-15',
        dependants: 2
      }
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.updated, true);
    assert.equal(res.data.employee.profile.fullName, 'Nguyen Van Normal Updated');
    assert.equal(res.data.employee.profile.birthday, '1995-05-15');
    assert.equal(res.data.employee.profile.dependants, 2);

    const row = await store.queryBuilder
      .selectFrom('staff')
      .selectAll()
      .where('username', '=', 'emp_normal')
      .executeTakeFirst();

    assert.equal(row.name, 'Nguyen Van Normal Updated');
    assert.equal(row.birthday, '1995-05-15');
    assert.equal(Number(row.dependants), 2);
    assert.equal(row.given_name, 'Updated');
    assert.equal(row.family_name, 'Nguyen Van Normal');
  });

  test('PATCH /api/v2/employees/:username/account updates roles and lock status', async () => {
    // 1. Add hr role and lock account
    const lockRes = await F.call('PATCH', '/v2/employees/emp_normal/account', {
      who: 'admin',
      body: {
        roles: ['staff', 'hr'],
        isLocked: true
      }
    });

    assert.equal(lockRes.status, 200);
    assert.equal(lockRes.data.updated, true);
    assert.equal(lockRes.data.employee.account.isLocked, true);
    assert.deepEqual(lockRes.data.employee.account.roles, ['staff', 'hr']);

    const rowLocked = await store.queryBuilder
      .selectFrom('staff')
      .selectAll()
      .where('username', '=', 'emp_normal')
      .executeTakeFirst();

    assert.ok(rowLocked.locked_at, 'locked_at must be populated');

    const activeRoles = await store.roles.activeRoles('emp_normal');
    assert.ok(activeRoles.includes('hr'), 'staff_roles must have hr role granted');

    // 2. Unlock account
    const unlockRes = await F.call('PATCH', '/v2/employees/emp_normal/account', {
      who: 'admin',
      body: {
        isLocked: false
      }
    });

    assert.equal(unlockRes.status, 200);
    assert.equal(unlockRes.data.employee.account.isLocked, false);

    const rowUnlocked = await store.queryBuilder
      .selectFrom('staff')
      .selectAll()
      .where('username', '=', 'emp_normal')
      .executeTakeFirst();

    assert.equal(rowUnlocked.locked_at, null);
  });

  test('PATCH /api/v2/employees/:username/position updates position and syncs to staff row', async () => {
    const res = await F.call('PATCH', '/v2/employees/emp_normal/position', {
      who: 'admin',
      body: {
        type: 'dev',
        level: 3,
        jobTitle: 'Principal Engineer'
      }
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.updated, true);
    assert.equal(res.data.employee.contract.position.type, 'dev');
    assert.equal(res.data.employee.contract.position.level, 3);
    assert.equal(res.data.employee.contract.position.jobTitle, 'Principal Engineer');

    const row = await store.queryBuilder
      .selectFrom('staff')
      .selectAll()
      .where('username', '=', 'emp_normal')
      .executeTakeFirst();

    assert.equal(row.type, 'dev');
    assert.equal(Number(row.level), 3);
    assert.equal(row.job_title, 'Principal Engineer');
  });

  test('PATCH /api/v2/employees/:username/shift validates and updates shift', async () => {
    // 1. Reject invalid allowance for NORMAL shift
    const badNormal = await F.call('PATCH', '/v2/employees/emp_normal/shift', {
      who: 'admin',
      body: {
        type: 'NORMAL',
        allowancePct: 30
      }
    });
    assert.equal(badNormal.status, 400);
    assert.equal(badNormal.data.code, 'BAD_EMPLOYEE_INPUT');

    // 2. Reject invalid time format
    const badTime = await F.call('PATCH', '/v2/employees/emp_normal/shift', {
      who: 'admin',
      body: {
        type: 'NORMAL',
        startTime: '25:99',
        endTime: '17:00'
      }
    });
    assert.equal(badTime.status, 400);
    assert.equal(badTime.data.code, 'BAD_EMPLOYEE_INPUT');

    // 3. Switch to NIGHT shift 22:00-07:00 with 60% allowance
    const resValid = await F.call('PATCH', '/v2/employees/emp_normal/shift', {
      who: 'admin',
      body: {
        type: 'NIGHT',
        startTime: '22:00',
        endTime: '07:00',
        allowancePct: 60
      }
    });

    assert.equal(resValid.status, 200);
    assert.equal(resValid.data.updated, true);
    assert.equal(resValid.data.employee.contract.shift.type, 'NIGHT');
    assert.equal(resValid.data.employee.contract.shift.startTime, '22:00');
    assert.equal(resValid.data.employee.contract.shift.endTime, '07:00');
    assert.equal(resValid.data.employee.contract.shift.allowancePct, 60);

    const row = await store.queryBuilder
      .selectFrom('staff')
      .selectAll()
      .where('username', '=', 'emp_normal')
      .executeTakeFirst();

    assert.equal(row.shift_type, 'NIGHT');
    assert.equal(row.shift_start_time, '22:00');
    assert.equal(row.shift_end_time, '07:00');
    assert.equal(Number(row.shift_allowance_pct), 60);
  });

  test('PATCH /api/v2/employees/:username/leave updates leave days and supports useDays', async () => {
    // 1. Set totalDays: 12, usedDays: 3 -> remaining: 9
    const resLeave = await F.call('PATCH', '/v2/employees/emp_normal/leave', {
      who: 'admin',
      body: {
        totalDays: 12,
        usedDays: 3
      }
    });

    assert.equal(resLeave.status, 200);
    assert.equal(resLeave.data.updated, true);
    assert.equal(resLeave.data.employee.contract.leave.totalDays, 12);
    assert.equal(resLeave.data.employee.contract.leave.usedDays, 3);
    assert.equal(resLeave.data.employee.contract.leave.remainingDays, 9);

    const rowLeave = await store.queryBuilder
      .selectFrom('staff')
      .selectAll()
      .where('username', '=', 'emp_normal')
      .executeTakeFirst();

    assert.equal(Number(rowLeave.leave_total_days), 12);
    assert.equal(Number(rowLeave.leave_used_days), 3);
    assert.equal(Number(rowLeave.leave_balance), 9);

    // 2. Use 2 days via useDays
    const resUse = await F.call('PATCH', '/v2/employees/emp_normal/leave', {
      who: 'admin',
      body: {
        useDays: 2
      }
    });

    assert.equal(resUse.status, 200);
    assert.equal(resUse.data.employee.contract.leave.usedDays, 5);
    assert.equal(resUse.data.employee.contract.leave.remainingDays, 7);

    const rowUsed = await store.queryBuilder
      .selectFrom('staff')
      .selectAll()
      .where('username', '=', 'emp_normal')
      .executeTakeFirst();

    assert.equal(Number(rowUsed.leave_used_days), 5);
    assert.equal(Number(rowUsed.leave_balance), 7);

    // 3. Reject taking more than remaining
    const resExceed = await F.call('PATCH', '/v2/employees/emp_normal/leave', {
      who: 'admin',
      body: {
        useDays: 100
      }
    });
    assert.equal(resExceed.status, 400);
    assert.equal(resExceed.data.code, 'BAD_EMPLOYEE_INPUT');
  });

  test('PATCH /api/v2/employees/:username/contract and PUT /api/v2/employees/:username', async () => {
    // 1. PATCH contract
    const resContract = await F.call('PATCH', '/v2/employees/emp_normal/contract', {
      who: 'admin',
      body: {
        status: 'thuviec',
        hasInsurance: false,
        effectiveFrom: '2026-03-01'
      }
    });

    assert.equal(resContract.status, 200);
    assert.equal(resContract.data.employee.contract.status, 'thuviec');
    assert.equal(resContract.data.employee.contract.hasInsurance, false);
    assert.equal(resContract.data.employee.contract.effectiveFrom, '2026-03-01');

    const rowContract = await store.queryBuilder
      .selectFrom('staff')
      .selectAll()
      .where('username', '=', 'emp_normal')
      .executeTakeFirst();

    assert.equal(rowContract.contract_status, 'probation');
    assert.equal(Number(rowContract.insured), 0);
    assert.equal(rowContract.start_date, '2026-03-01');

    // 2. PUT full update
    const resPut = await F.call('PUT', '/v2/employees/emp_normal', {
      who: 'admin',
      body: {
        profile: {
          fullName: 'Nguyen Van Full Put',
          birthday: '1992-12-01',
          dependants: 3
        },
        contract: {
          position: {
            type: 'lead',
            level: 2,
            jobTitle: 'Tech Lead'
          },
          shift: {
            type: 'FLEX',
            startTime: '07:00',
            endTime: '16:00',
            allowancePct: 10
          },
          leave: {
            totalDays: 15,
            usedDays: 1
          },
          status: 'nv',
          hasInsurance: true
        }
      }
    });

    assert.equal(resPut.status, 200);
    assert.equal(resPut.data.updated, true);
    assert.equal(resPut.data.employee.profile.fullName, 'Nguyen Van Full Put');
    assert.equal(resPut.data.employee.contract.position.jobTitle, 'Tech Lead');
    assert.equal(resPut.data.employee.contract.shift.type, 'FLEX');

    const rowPut = await store.queryBuilder
      .selectFrom('staff')
      .selectAll()
      .where('username', '=', 'emp_normal')
      .executeTakeFirst();

    assert.equal(rowPut.name, 'Nguyen Van Full Put');
    assert.equal(rowPut.birthday, '1992-12-01');
    assert.equal(Number(rowPut.dependants), 3);
    assert.equal(rowPut.type, 'lead');
    assert.equal(Number(rowPut.level), 2);
    assert.equal(rowPut.job_title, 'Tech Lead');
    assert.equal(rowPut.shift_type, 'FLEX');
    assert.equal(Number(rowPut.shift_allowance_pct), 10);
    assert.equal(Number(rowPut.leave_total_days), 15);
    assert.equal(Number(rowPut.leave_used_days), 1);
    assert.equal(Number(rowPut.leave_balance), 14);
    assert.equal(Number(rowPut.insured), 1);
  });

  test('DELETE /api/v2/employees/:username removes employee and returns 404 on subsequent lookups', async () => {
    // Delete emp_flat
    const resDel = await F.call('DELETE', '/v2/employees/emp_flat', { who: 'admin' });
    assert.equal(resDel.status, 200);
    assert.equal(resDel.data.deleted, true);
    assert.equal(resDel.data.username, 'emp_flat');

    const row = await store.queryBuilder
      .selectFrom('staff')
      .selectAll()
      .where('username', '=', 'emp_flat')
      .executeTakeFirst();
    assert.equal(row, undefined, 'emp_flat should be deleted from staff table');

    // Deleting non-existent employee returns 404
    const resDelAgain = await F.call('DELETE', '/v2/employees/emp_flat', { who: 'admin' });
    assert.equal(resDelAgain.status, 404);
    assert.equal(resDelAgain.data.code, 'EMPLOYEE_NOT_FOUND');
  });
});
