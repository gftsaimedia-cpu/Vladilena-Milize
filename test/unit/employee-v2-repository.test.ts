import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { EmployeeV2Repository, type StaffRow } from '../../src/data/employee-v2.repository';
import {
  Employee,
  EmployeeProfile,
  EmployeeAccount,
  EmployeeContract,
  Position,
  Shift,
  Leave,
  PersonName
} from '../../src/domain/employee-v2';
import { Kysely } from 'kysely';
import { AppDialect, AppDatabase } from '../../src/data/db-dialect';
import type { Schema } from '../../src/data/schema.generated';

function createMockRow(overrides: Partial<StaffRow> = {}): StaffRow {
  return {
    username: 'vladilena',
    name: 'Vladilena Milize',
    role: 'staff',
    type: 'officer',
    level: 2,
    idorm: 0,
    pass_hash: 'argon2$test_hash',
    created_at: '2026-01-01T00:00:00.000Z',
    start_date: '2026-01-15',
    birthday: '2000-06-12',
    contract: '2027-01-15',
    insured: 1,
    dependants: 1,
    job_title: 'Handler One',
    tax_on: 1,
    deduct_on: 1,
    advance_on: 1,
    locked_at: null,
    locked_by: null,
    session_version: 1,
    payroll_subject: 1,
    uuid: '99999999-9999-9999-9999-999999999999',
    family_name: 'Vladilena',
    given_name: 'Milize',
    contract_status: 'official',
    resigned_on: null,
    leave_balance: 10,
    leave_balance_on: null,
    shift_type: 'NORMAL',
    shift_start_time: '08:00',
    shift_end_time: '17:00',
    shift_allowance_pct: 0,
    leave_total_days: 12,
    leave_used_days: 2,
    ...overrides
  };
}

describe('EmployeeV2Repository.fromRow', () => {
  test('maps full modern row correctly into Employee aggregate', () => {
    const row = createMockRow();
    const emp = EmployeeV2Repository.fromRow(row, ['officer', 'evaluator']);

    assert.equal(emp.username, 'vladilena');
    assert.equal(emp.uuid, '99999999-9999-9999-9999-999999999999');
    assert.equal(emp.fullName, 'Vladilena Milize');
    assert.equal(emp.profile.familyName, 'Vladilena');
    assert.equal(emp.profile.givenName, 'Milize');
    assert.equal(emp.profile.birthday, '2000-06-12');
    assert.equal(emp.profile.dependants, 1);

    // Account
    assert.equal(emp.account.username, 'vladilena');
    assert.equal(emp.account.passwordHash, 'argon2$test_hash');
    assert.deepEqual([...emp.account.roles], ['staff', 'officer', 'evaluator']);
    assert.equal(emp.account.isLocked, false);
    assert.equal(emp.account.lockedAt, null);
    assert.equal(emp.account.lockedBy, null);

    // Contract & Position
    assert.equal(emp.contract.position.type, 'officer');
    assert.equal(emp.contract.position.level, 2);
    assert.equal(emp.contract.position.jobTitle, 'Handler One');

    // Shift
    assert.equal(emp.contract.shift.type, 'NORMAL');
    assert.equal(emp.contract.shift.startTime, '08:00');
    assert.equal(emp.contract.shift.endTime, '17:00');
    assert.equal(emp.contract.shift.allowancePct, 0);

    // Leave
    assert.equal(emp.contract.leave.totalDays, 12);
    assert.equal(emp.contract.leave.usedDays, 2);
    assert.equal(emp.contract.leave.remainingDays?.(), 10);

    // Contract flags and dates
    assert.equal(emp.contract.status, 'nv');
    assert.equal(emp.contract.effectiveFrom, '2026-01-15');
    assert.equal(emp.contract.endDate, '2027-01-15');
    assert.equal(emp.contract.resignedOn, null);
    assert.equal(emp.contract.hasInsurance, true);
    assert.equal(emp.contract.isUnionMember, true);
    assert.equal(emp.contract.hasTax, true);
    assert.equal(emp.contract.canAdvance, true);
    assert.equal(emp.contract.isDormResident, false);
  });

  test('normalizes shifts: NORMAL (0%), FLEX (10%), NIGHT (30%, 40%, 60%)', () => {
    // Normal shift forces 0%
    const normalRow = createMockRow({ shift_type: 'NORMAL', shift_allowance_pct: 20 });
    const normalEmp = EmployeeV2Repository.fromRow(normalRow);
    assert.equal(normalEmp.contract.shift.type, 'NORMAL');
    assert.equal(normalEmp.contract.shift.allowancePct, 0);

    // Flex shift forces 10%
    const flexRow = createMockRow({ shift_type: 'FLEX', shift_allowance_pct: 0 });
    const flexEmp = EmployeeV2Repository.fromRow(flexRow);
    assert.equal(flexEmp.contract.shift.type, 'FLEX');
    assert.equal(flexEmp.contract.shift.allowancePct, 10);

    // Night shifts: 30%, 40%, 60%
    for (const pct of [30, 40, 60]) {
      const nightRow = createMockRow({ shift_type: 'NIGHT', shift_allowance_pct: pct });
      const nightEmp = EmployeeV2Repository.fromRow(nightRow);
      assert.equal(nightEmp.contract.shift.type, 'NIGHT');
      assert.equal(nightEmp.contract.shift.allowancePct, pct);
    }

    // Night shift with invalid pct falls back to 30%
    const nightInvalid = createMockRow({ shift_type: 'NIGHT', shift_allowance_pct: 15 });
    const nightEmpFallback = EmployeeV2Repository.fromRow(nightInvalid);
    assert.equal(nightEmpFallback.contract.shift.allowancePct, 30);
  });

  test('handles legacy row: missing shift_type, leave_total_days, name parts, uuid', () => {
    const legacyRow = createMockRow({
      uuid: null,
      family_name: null,
      given_name: null,
      name: 'Shin Nouzen',
      shift_type: '' as any,
      shift_start_time: '' as any,
      shift_end_time: '' as any,
      shift_allowance_pct: undefined as any,
      leave_total_days: null as any,
      leave_used_days: null as any,
      contract_status: 'probation',
      start_date: null,
      contract: null,
      resigned_on: null,
      insured: null,
      deduct_on: 0,
      tax_on: 0,
      advance_on: 0,
      idorm: 1,
      role: 'admin',
      locked_at: '2026-03-01T12:00:00Z',
      locked_by: 'system'
    });

    const emp = EmployeeV2Repository.fromRow(legacyRow);

    // UUID auto-generated
    assert.ok(emp.uuid && emp.uuid.length > 10);
    // Name parsed from full name
    assert.equal(emp.profile.familyName, 'Shin');
    assert.equal(emp.profile.givenName, 'Nouzen');
    assert.equal(emp.fullName, 'Shin Nouzen');

    // Default NORMAL shift when shift_type is missing/empty
    assert.equal(emp.contract.shift.type, 'NORMAL');
    assert.equal(emp.contract.shift.allowancePct, 0);
    assert.equal(emp.contract.shift.startTime, '08:00');
    assert.equal(emp.contract.shift.endTime, '17:00');

    // Leave defaulted to 0
    assert.equal(emp.contract.leave.totalDays, 0);
    assert.equal(emp.contract.leave.usedDays, 0);

    // Legacy status 'probation' -> 'thuviec'
    assert.equal(emp.contract.status, 'thuviec');

    // Flag mappings
    assert.equal(emp.contract.hasInsurance, true); // insured !== 0 (null !== 0 is true)
    assert.equal(emp.contract.isUnionMember, false); // deduct_on === 1 is false
    assert.equal(emp.contract.hasTax, false); // tax_on !== 0 is false
    assert.equal(emp.contract.canAdvance, false); // advance_on !== 0 is false
    assert.equal(emp.contract.isDormResident, true); // idorm === 1 is true

    // Locked account
    assert.equal(emp.account.isLocked, true);
    assert.equal(emp.account.lockedAt, '2026-03-01T12:00:00Z');
    assert.equal(emp.account.lockedBy, 'system');
  });

  test('normalizes contract statuses and fallbacks', () => {
    const statuses = ['tts', 'ctv', 'thuviec', 'nv', 'nghiviec'] as const;
    for (const st of statuses) {
      const emp = EmployeeV2Repository.fromRow(createMockRow({ contract_status: st }));
      assert.equal(emp.contract.status, st);
    }

    assert.equal(EmployeeV2Repository.fromRow(createMockRow({ contract_status: 'official' })).contract.status, 'nv');
    assert.equal(
      EmployeeV2Repository.fromRow(createMockRow({ contract_status: 'probation' })).contract.status,
      'thuviec'
    );
    assert.equal(EmployeeV2Repository.fromRow(createMockRow({ contract_status: 'unknown_xyz' })).contract.status, 'nv');
    assert.equal(EmployeeV2Repository.fromRow(createMockRow({ contract_status: null })).contract.status, 'nv');
  });
});

describe('EmployeeV2Repository.toRow', () => {
  test('serializes Employee into Insertable<Schema["staff"]> completely', () => {
    const profile = new EmployeeProfile({
      uuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      name: new PersonName({ familyName: 'Anju', givenName: 'Emma' }),
      birthday: '2001-08-20',
      dependants: 2
    });
    const account = new EmployeeAccount({
      username: 'anju',
      passwordHash: 'argon2$anju_secret',
      roles: ['staff', 'specialist'],
      lockedAt: null,
      lockedBy: null,
      createdAt: '2026-02-01T10:00:00.000Z'
    });
    const contract = new EmployeeContract({
      position: new Position({ type: 'analyst', level: 3, jobTitle: 'Senior Snow Witch' }),
      shift: new Shift({ type: 'NIGHT', startTime: '22:00', endTime: '06:00', allowancePct: 60 }),
      leave: new Leave({ totalDays: 15, usedDays: 3 }),
      status: 'nv',
      effectiveFrom: '2026-02-01',
      endDate: '2028-02-01',
      resignedOn: null,
      hasInsurance: true,
      isUnionMember: true,
      hasTax: true,
      canAdvance: false,
      isDormResident: true
    });

    const employee = new Employee({ profile, account, contract });
    const row = EmployeeV2Repository.toRow(employee);

    assert.equal(row.uuid, 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    assert.equal(row.username, 'anju');
    assert.equal(row.name, 'Anju Emma');
    assert.equal(row.family_name, 'Anju');
    assert.equal(row.given_name, 'Emma');
    assert.equal(row.birthday, '2001-08-20');
    assert.equal(row.dependants, 2);
    assert.equal(row.pass_hash, 'argon2$anju_secret');
    assert.equal(row.role, 'staff');
    assert.equal(row.locked_at, null);
    assert.equal(row.locked_by, null);
    assert.equal(row.created_at, '2026-02-01T10:00:00.000Z');

    assert.equal(row.type, 'analyst');
    assert.equal(row.level, 3);
    assert.equal(row.job_title, 'Senior Snow Witch');

    assert.equal(row.shift_type, 'NIGHT');
    assert.equal(row.shift_start_time, '22:00');
    assert.equal(row.shift_end_time, '06:00');
    assert.equal(row.shift_allowance_pct, 60);

    assert.equal(row.leave_total_days, 15);
    assert.equal(row.leave_used_days, 3);
    assert.equal(row.leave_balance, 12);

    assert.equal(row.contract_status, 'official');
    assert.equal(row.start_date, '2026-02-01');
    assert.equal(row.contract, '2028-02-01');
    assert.equal(row.resigned_on, null);

    assert.equal(row.insured, 1);
    assert.equal(row.deduct_on, 1);
    assert.equal(row.tax_on, 1);
    assert.equal(row.advance_on, 0);
    assert.equal(row.idorm, 1);
    assert.equal(row.payroll_subject, 1);
  });

  test('maps domain contract.status to dbContractStatus (official, probation, null)', () => {
    const baseEmp = EmployeeV2Repository.fromRow(createMockRow());

    const testCases: Array<{ status: any; expected: string | null; useDomainContract: boolean }> = [
      { status: 'nv', expected: 'official', useDomainContract: true },
      { status: 'thuviec', expected: 'probation', useDomainContract: true },
      { status: 'tts', expected: null, useDomainContract: true },
      { status: 'ctv', expected: null, useDomainContract: true },
      { status: 'nghiviec', expected: null, useDomainContract: true },
      { status: 'official', expected: 'official', useDomainContract: false },
      { status: 'probation', expected: 'probation', useDomainContract: false },
      { status: 'other', expected: null, useDomainContract: false }
    ];

    for (const { status, expected, useDomainContract } of testCases) {
      let contract: any;
      if (useDomainContract) {
        contract = new EmployeeContract({
          position: baseEmp.contract.position,
          shift: baseEmp.contract.shift,
          leave: baseEmp.contract.leave,
          status,
          effectiveFrom: baseEmp.contract.effectiveFrom,
          endDate: baseEmp.contract.endDate,
          resignedOn: baseEmp.contract.resignedOn,
          hasInsurance: baseEmp.contract.hasInsurance,
          isUnionMember: baseEmp.contract.isUnionMember,
          hasTax: baseEmp.contract.hasTax,
          canAdvance: baseEmp.contract.canAdvance,
          isDormResident: baseEmp.contract.isDormResident
        });
      } else {
        contract = Object.assign(Object.create(EmployeeContract.prototype), baseEmp.contract, { status });
      }
      const emp = new Employee({
        profile: baseEmp.profile,
        account: baseEmp.account,
        contract
      });
      const row = EmployeeV2Repository.toRow(emp);
      assert.equal(row.contract_status, expected, `status ${status} should map to ${expected}`);
    }
  });

  test('round-trip fidelity between fromRow and toRow', () => {
    const originalRow = createMockRow();
    const emp = EmployeeV2Repository.fromRow(originalRow);
    const convertedRow = EmployeeV2Repository.toRow(emp);

    assert.equal(convertedRow.username, originalRow.username);
    assert.equal(convertedRow.name, originalRow.name);
    assert.equal(convertedRow.family_name, originalRow.family_name);
    assert.equal(convertedRow.given_name, originalRow.given_name);
    assert.equal(convertedRow.type, originalRow.type);
    assert.equal(convertedRow.level, originalRow.level);
    assert.equal(convertedRow.shift_type, originalRow.shift_type);
    assert.equal(convertedRow.shift_start_time, originalRow.shift_start_time);
    assert.equal(convertedRow.shift_end_time, originalRow.shift_end_time);
    assert.equal(convertedRow.shift_allowance_pct, originalRow.shift_allowance_pct);
    assert.equal(convertedRow.leave_total_days, originalRow.leave_total_days);
    assert.equal(convertedRow.leave_used_days, originalRow.leave_used_days);
    assert.equal(convertedRow.contract_status, 'official');
  });
});

describe('EmployeeV2Repository persistence operations with Kysely mock', () => {
  class MockDb implements AppDatabase {
    executedQueries: { sql: string; params: unknown[] }[] = [];
    handler: (sql: string, params: unknown[]) => { rows?: unknown[]; changes?: number } = () => ({ rows: [] });

    native(sql: string) {
      return {
        all: async (...params: unknown[]) => {
          this.executedQueries.push({ sql, params });
          const res = this.handler(sql, params);
          return (res.rows || []) as unknown[];
        },
        run: async (...params: unknown[]) => {
          this.executedQueries.push({ sql, params });
          const res = this.handler(sql, params);
          return { changes: res.changes ?? 1 };
        }
      };
    }
  }

  test('findAll loads staff rows and merges active staff_roles', async () => {
    const mock = new MockDb();
    const qb = new Kysely<Schema>({ dialect: new AppDialect(mock) });
    const repo = new EmployeeV2Repository(qb);

    mock.handler = sql => {
      if (sql.includes('from "staff"')) {
        return {
          rows: [
            createMockRow({ username: 'kurena', name: 'Kurena Kukumila', role: 'staff' }),
            createMockRow({ username: 'theoto', name: 'Theoto Rikka', role: 'admin' })
          ]
        };
      }
      if (sql.includes('from "staff_roles"')) {
        return {
          rows: [
            { username: 'kurena', role: 'sniper' },
            { username: 'kurena', role: 'scout' }
          ]
        };
      }
      return { rows: [] };
    };

    const employees = await repo.findAll();
    assert.equal(employees.length, 2);
    assert.equal(employees[0].username, 'kurena');
    assert.deepEqual([...employees[0].account.roles], ['staff', 'sniper', 'scout']);
    assert.equal(employees[1].username, 'theoto');
    assert.deepEqual([...employees[1].account.roles], ['admin']);
  });

  test('findByUsername queries staff by username and attaches extra roles', async () => {
    const mock = new MockDb();
    const qb = new Kysely<Schema>({ dialect: new AppDialect(mock) });
    const repo = new EmployeeV2Repository(qb);

    mock.handler = (sql, params) => {
      if (sql.includes('from "staff"')) {
        if (params[0] === 'raiden') {
          return { rows: [createMockRow({ username: 'raiden', name: 'Raiden Shuga', role: 'leader' })] };
        }
        return { rows: [] };
      }
      if (sql.includes('from "staff_roles"')) {
        return { rows: [{ role: 'tactician' }] };
      }
      return { rows: [] };
    };

    const found = await repo.findByUsername('raiden');
    assert.ok(found);
    assert.equal(found.username, 'raiden');
    assert.deepEqual([...found.account.roles], ['leader', 'tactician']);

    const notFound = await repo.findByUsername('nobody');
    assert.equal(notFound, null);
  });

  test('findByUuid and findByUsernameOrUuid locate staff correctly', async () => {
    const mock = new MockDb();
    const qb = new Kysely<Schema>({ dialect: new AppDialect(mock) });
    const repo = new EmployeeV2Repository(qb);

    mock.handler = (sql, params) => {
      if (sql.includes('from "staff"')) {
        if (params.includes('uuid-1234') || params.includes('lena')) {
          return { rows: [createMockRow({ username: 'lena', uuid: 'uuid-1234' })] };
        }
        return { rows: [] };
      }
      if (sql.includes('from "staff_roles"')) {
        return { rows: [] };
      }
      return { rows: [] };
    };

    const byUuid = await repo.findByUuid('uuid-1234');
    assert.ok(byUuid);
    assert.equal(byUuid.uuid, 'uuid-1234');

    const byOr = await repo.findByUsernameOrUuid('lena');
    assert.ok(byOr);
    assert.equal(byOr.username, 'lena');
  });

  test('save executes onConflict upsert on staff and syncs staff_roles', async () => {
    const mock = new MockDb();
    const qb = new Kysely<Schema>({ dialect: new AppDialect(mock) });
    const repo = new EmployeeV2Repository(qb);

    const activeRolesInDb = [{ id: 1, role: 'old_role' }];
    mock.handler = sql => {
      if (sql.includes('from "staff_roles"')) {
        return { rows: activeRolesInDb };
      }
      return { changes: 1 };
    };

    const employee = EmployeeV2Repository.fromRow(
      createMockRow({
        username: 'shin',
        role: 'leader'
      }),
      ['undertaker'] // desired additional role: 'undertaker', while 'old_role' should be revoked
    );

    const saved = await repo.save(employee, 'admin_actor');
    assert.equal(saved.username, 'shin');

    // Verify staff upsert query
    const staffUpsert = mock.executedQueries.find(q => q.sql.includes('insert into "staff"'));
    assert.ok(staffUpsert, 'Must have executed staff insert/upsert query');
    assert.ok(staffUpsert.sql.includes('on conflict ("username") do update set'));

    // Verify staff_roles revoke of old_role
    const revokeQuery = mock.executedQueries.find(
      q => q.sql.includes('update "staff_roles"') && q.sql.includes('set "revoked_at" =')
    );
    assert.ok(revokeQuery, 'Must have revoked old_role');

    // Verify staff_roles insert of undertaker
    const insertRoleQuery = mock.executedQueries.find(q => q.sql.includes('insert into "staff_roles"'));
    assert.ok(insertRoleQuery, 'Must have granted new undertaker role');
    assert.ok(insertRoleQuery.params.includes('undertaker'));
    assert.ok(insertRoleQuery.params.includes('admin_actor'));
  });

  test('deleteByUsername executes delete on staff and returns boolean', async () => {
    const mock = new MockDb();
    const qb = new Kysely<Schema>({ dialect: new AppDialect(mock) });
    const repo = new EmployeeV2Repository(qb);

    mock.handler = (sql, params) => {
      if (params.includes('existing_user')) {
        return { changes: 1 };
      }
      return { changes: 0 };
    };

    const deleted = await repo.deleteByUsername('existing_user');
    assert.equal(deleted, true);

    const notDeleted = await repo.deleteByUsername('missing_user');
    assert.equal(notDeleted, false);
  });
});
