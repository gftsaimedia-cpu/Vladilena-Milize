import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeName,
  normalizePosition,
  normalizeShift,
  normalizeLeave,
  ShiftType,
  ContractStatus
} from '../../src/domain/employee-v2/types';
import { EmployeeProfile } from '../../src/domain/employee-v2/employee-profile';
import { EmployeeAccount } from '../../src/domain/employee-v2/employee-account';
import { EmployeeContract } from '../../src/domain/employee-v2/employee-contract';
import { Employee } from '../../src/domain/employee-v2/employee';

describe('Employee v2 Domain Types & Normalizers', () => {
  test('normalizeName handles familyName + givenName', () => {
    const name = normalizeName({ familyName: 'Nguyen Van', givenName: 'An' });
    assert.equal(name.familyName, 'Nguyen Van');
    assert.equal(name.givenName, 'An');
    assert.equal(name.fullName, 'Nguyen Van An');
    assert.deepEqual(name.toJSON?.(), {
      familyName: 'Nguyen Van',
      givenName: 'An',
      fullName: 'Nguyen Van An'
    });
  });

  test('normalizeName handles single-word and multi-word fullName', () => {
    const single = normalizeName({ fullName: 'Khoa' });
    assert.equal(single.familyName, '');
    assert.equal(single.givenName, 'Khoa');
    assert.equal(single.fullName, 'Khoa');

    const multi = normalizeName({ fullName: 'Bui Dang Khoa' });
    assert.equal(multi.familyName, 'Bui Dang');
    assert.equal(multi.givenName, 'Khoa');
    assert.equal(multi.fullName, 'Bui Dang Khoa');
  });

  test('normalizeName throws on empty or invalid input', () => {
    assert.throws(() => normalizeName(null), /Name is required/);
    assert.throws(() => normalizeName({}), /Name is required/);
    assert.throws(() => normalizeName({ fullName: '   ' }), /Name is required/);
  });

  test('normalizePosition handles valid and default values', () => {
    const pos = normalizePosition({ type: 'dev', level: 2, jobTitle: 'Senior Dev' });
    assert.equal(pos.type, 'dev');
    assert.equal(pos.level, 2);
    assert.equal(pos.jobTitle, 'Senior Dev');
    assert.deepEqual(pos.toJSON?.(), {
      type: 'dev',
      level: 2,
      jobTitle: 'Senior Dev'
    });

    const defaultPos = normalizePosition({ type: 'manager' });
    assert.equal(defaultPos.type, 'manager');
    assert.equal(defaultPos.level, 1);
    assert.equal(defaultPos.jobTitle, null);
  });

  test('normalizePosition throws on invalid type or level', () => {
    assert.throws(() => normalizePosition(null), /Position type is required/);
    assert.throws(() => normalizePosition({ type: '' }), /Position type is required/);
    assert.throws(() => normalizePosition({ type: 'dev', level: 0 }), /Position level must be an integer >= 1/);
    assert.throws(() => normalizePosition({ type: 'dev', level: 1.5 }), /Position level must be an integer >= 1/);
  });

  test('normalizeShift handles valid and overnight shift calculations', () => {
    const dayShift = normalizeShift({
      type: 'NORMAL',
      startTime: '08:00',
      endTime: '17:00',
      allowancePct: 0
    });
    assert.equal(dayShift.type, 'NORMAL');
    assert.equal(dayShift.startTime, '08:00');
    assert.equal(dayShift.endTime, '17:00');
    assert.equal(dayShift.allowancePct, 0);
    assert.equal(dayShift.isOvernight?.(), false);

    const nightShift = normalizeShift({
      type: 'NIGHT',
      startTime: '22:00',
      endTime: '06:00',
      allowancePct: 0.3
    });
    assert.equal(nightShift.type, 'NIGHT');
    assert.equal(nightShift.isOvernight?.(), true);
    assert.deepEqual(nightShift.toJSON?.(), {
      type: 'NIGHT',
      startTime: '22:00',
      endTime: '06:00',
      allowancePct: 0.3,
      isOvernight: true
    });
  });

  test('normalizeShift throws on invalid type or time format', () => {
    assert.throws(
      () => normalizeShift({ type: 'INVALID' as any, startTime: '08:00', endTime: '17:00' }),
      /Invalid shift type/
    );
    assert.throws(
      () => normalizeShift({ type: 'NORMAL', startTime: '8:00', endTime: '17:00' }),
      /Invalid shift startTime/
    );
    assert.throws(
      () => normalizeShift({ type: 'NORMAL', startTime: '08:00', endTime: '25:00' }),
      /Invalid shift endTime/
    );
    assert.throws(
      () => normalizeShift({ type: 'NORMAL', startTime: '08:00', endTime: '17:00', allowancePct: -0.1 }),
      /allowancePct must be a number >= 0/
    );
  });

  test('normalizeLeave calculates remaining days correctly', () => {
    const leave = normalizeLeave({ totalDays: 14, usedDays: 4.5 });
    assert.equal(leave.totalDays, 14);
    assert.equal(leave.usedDays, 4.5);
    assert.equal(leave.remainingDays?.(), 9.5);
    assert.deepEqual(leave.toJSON?.(), {
      totalDays: 14,
      usedDays: 4.5,
      remainingDays: 9.5
    });

    const defaultLeave = normalizeLeave({});
    assert.equal(defaultLeave.totalDays, 0);
    assert.equal(defaultLeave.usedDays, 0);
    assert.equal(defaultLeave.remainingDays?.(), 0);
  });

  test('normalizeLeave throws on negative numbers', () => {
    assert.throws(() => normalizeLeave({ totalDays: -1 }), /totalDays must be a number >= 0/);
    assert.throws(() => normalizeLeave({ usedDays: -0.5 }), /usedDays must be a number >= 0/);
  });
});

describe('EmployeeProfile', () => {
  test('creates profile with generated uuid and defaults', () => {
    const profile = new EmployeeProfile({
      fullName: 'Nguyen Van An'
    });
    assert.ok(profile.uuid && typeof profile.uuid === 'string');
    assert.equal(profile.name.fullName, 'Nguyen Van An');
    assert.equal(profile.birthday, null);
    assert.equal(profile.dependants, 0);
  });

  test('creates profile with explicit properties', () => {
    const profile = new EmployeeProfile({
      uuid: 'custom-uuid-123',
      name: { familyName: 'Tran', givenName: 'Binh', fullName: 'Tran Binh' },
      birthday: '1995-05-20',
      dependants: 2
    });
    assert.equal(profile.uuid, 'custom-uuid-123');
    assert.equal(profile.name.familyName, 'Tran');
    assert.equal(profile.name.givenName, 'Binh');
    assert.equal(profile.birthday, '1995-05-20');
    assert.equal(profile.dependants, 2);
    assert.deepEqual(profile.toJSON(), {
      uuid: 'custom-uuid-123',
      familyName: 'Tran',
      givenName: 'Binh',
      fullName: 'Tran Binh',
      birthday: '1995-05-20',
      dependants: 2
    });
  });

  test('validates birthday format and dependants integer', () => {
    assert.throws(() => new EmployeeProfile({ fullName: 'A', birthday: '95-05-20' }), /Invalid birthday/);
    assert.throws(() => new EmployeeProfile({ fullName: 'A', dependants: -1 }), /dependants must be an integer >= 0/);
    assert.throws(() => new EmployeeProfile({ fullName: 'A', dependants: 1.5 }), /dependants must be an integer >= 0/);
  });

  test('update returns new immutable instance', () => {
    const original = new EmployeeProfile({
      uuid: 'fixed-uuid',
      fullName: 'Nguyen Van An',
      birthday: '1990-01-01',
      dependants: 0
    });
    const updated = original.update({
      givenName: 'Binh',
      dependants: 1
    });

    assert.notEqual(original, updated);
    assert.equal(original.dependants, 0);
    assert.equal(original.name.givenName, 'An');
    assert.equal(updated.uuid, 'fixed-uuid');
    assert.equal(updated.dependants, 1);
    assert.equal(updated.name.givenName, 'Binh');
    assert.equal(updated.name.fullName, 'Nguyen Van Binh');
  });
});

describe('EmployeeAccount', () => {
  test('validates username, passwordHash, and sets defaults', () => {
    const account = new EmployeeAccount({
      username: '  AN.NV  ',
      passwordHash: 'scrypt$hash123'
    });
    assert.equal(account.username, 'an.nv');
    assert.equal(account.passwordHash, 'scrypt$hash123');
    assert.deepEqual(account.roles, ['staff']);
    assert.equal(account.isLocked, false);
    assert.equal(account.lockedAt, null);
    assert.equal(account.lockedBy, null);
    assert.ok(account.createdAt);
  });

  test('throws on empty username, passwordHash, or empty roles', () => {
    assert.throws(() => new EmployeeAccount({ username: '', passwordHash: 'hash' }), /Username must be non-empty/);
    assert.throws(() => new EmployeeAccount({ username: 'user', passwordHash: '' }), /Password hash must be non-empty/);
    assert.throws(
      () => new EmployeeAccount({ username: 'user', passwordHash: 'hash', roles: [] }),
      /Roles must be non-empty/
    );
  });

  test('hasRole checks roles', () => {
    const account = new EmployeeAccount({
      username: 'lead',
      passwordHash: 'hash',
      roles: ['staff', 'manager']
    });
    assert.equal(account.hasRole('manager'), true);
    assert.equal(account.hasRole('admin'), false);
  });

  test('lock and unlock produce new instances', () => {
    const account = new EmployeeAccount({
      username: 'user',
      passwordHash: 'hash'
    });
    const locked = account.lock('admin-1', '2026-11-03T10:00:00Z');
    assert.equal(account.isLocked, false);
    assert.equal(locked.isLocked, true);
    assert.equal(locked.lockedBy, 'admin-1');
    assert.equal(locked.lockedAt, '2026-11-03T10:00:00Z');

    const unlocked = locked.unlock();
    assert.equal(unlocked.isLocked, false);
    assert.equal(unlocked.lockedBy, null);
    assert.equal(unlocked.lockedAt, null);
  });

  test('toJSON omits passwordHash for security but exposes primaryRole', () => {
    const account = new EmployeeAccount({
      username: 'admin_user',
      passwordHash: 'secret_hash',
      roles: ['admin', 'staff']
    });
    const json = account.toJSON();
    assert.equal('passwordHash' in json, false);
    assert.equal(json.username, 'admin_user');
    assert.equal(json.primaryRole, 'admin');
    assert.deepEqual(json.roles, ['admin', 'staff']);
    assert.equal(account.passwordHash, 'secret_hash');
  });

  test('update returns new immutable instance', () => {
    const account = new EmployeeAccount({
      username: 'user',
      passwordHash: 'old_hash'
    });
    const updated = account.update({
      passwordHash: 'new_hash',
      roles: ['staff', 'reviewer']
    });
    assert.notEqual(account, updated);
    assert.equal(account.passwordHash, 'old_hash');
    assert.equal(updated.passwordHash, 'new_hash');
    assert.deepEqual(updated.roles, ['staff', 'reviewer']);
  });
});

describe('EmployeeContract', () => {
  test('creates contract with default flags and normalized pillars', () => {
    const contract = new EmployeeContract({
      position: { type: 'dev', level: 1 },
      shift: { type: 'NORMAL', startTime: '08:30', endTime: '17:30' },
      leave: { totalDays: 12 }
    });
    assert.equal(contract.status, 'nv');
    assert.equal(contract.hasInsurance, true);
    assert.equal(contract.isUnionMember, false);
    assert.equal(contract.hasTax, true);
    assert.equal(contract.canAdvance, true);
    assert.equal(contract.isDormResident, false);
    assert.equal(contract.position.type, 'dev');
    assert.equal(contract.shift.startTime, '08:30');
    assert.equal(contract.leave.totalDays, 12);
  });

  test('validates status and date formats', () => {
    assert.throws(() => new EmployeeContract({ status: 'invalid' as any }), /Invalid contract status/);
    assert.throws(() => new EmployeeContract({ effectiveFrom: '2026/01/01' }), /Invalid effectiveFrom date/);
    assert.throws(() => new EmployeeContract({ endDate: 'bad-date' }), /Invalid endDate/);
    assert.throws(() => new EmployeeContract({ resignedOn: 'bad-date' }), /Invalid resignedOn date/);
  });

  test('changePosition, changeShift, updateLeave produce updated contracts', () => {
    const contract = new EmployeeContract({
      position: { type: 'dev', level: 1, jobTitle: 'Junior' },
      shift: { type: 'NORMAL', startTime: '08:00', endTime: '17:00' },
      leave: { totalDays: 12, usedDays: 2 }
    });

    const promoted = contract.changePosition({ level: 2, jobTitle: 'Mid Dev' });
    assert.equal(promoted.position.type, 'dev');
    assert.equal(promoted.position.level, 2);
    assert.equal(promoted.position.jobTitle, 'Mid Dev');
    assert.equal(contract.position.level, 1);

    const nightShift = contract.changeShift({
      type: 'NIGHT',
      startTime: '22:00',
      endTime: '06:00',
      allowancePct: 0.3
    });
    assert.equal(nightShift.shift.type, 'NIGHT');
    assert.equal(nightShift.shift.isOvernight?.(), true);

    const leaveUpdated = contract.updateLeave({ usedDays: 5 });
    assert.equal(leaveUpdated.leave.totalDays, 12);
    assert.equal(leaveUpdated.leave.usedDays, 5);
    assert.equal(leaveUpdated.leave.remainingDays?.(), 7);
  });

  test('toJSON serializes contract and nested components', () => {
    const contract = new EmployeeContract({
      position: { type: 'dev', level: 1, jobTitle: null },
      shift: { type: 'NORMAL', startTime: '08:00', endTime: '17:00', allowancePct: 0 },
      leave: { totalDays: 12, usedDays: 2 },
      status: 'nv',
      effectiveFrom: '2026-01-01',
      hasInsurance: true
    });
    const json = contract.toJSON();
    assert.equal(json.status, 'nv');
    assert.equal(json.effectiveFrom, '2026-01-01');
    assert.equal(json.position.type, 'dev');
    assert.equal(json.shift.type, 'NORMAL');
    assert.equal(json.leave.remainingDays, 10);
  });
});

describe('Employee Aggregate Root', () => {
  const makeSampleEmployee = () => {
    return new Employee({
      profile: {
        uuid: 'emp-001',
        fullName: 'Le Van Cuong',
        birthday: '1992-08-15',
        dependants: 1
      },
      account: {
        username: 'cuong.lv',
        passwordHash: 'hash-abc',
        roles: ['staff']
      },
      contract: {
        position: { type: 'sales', level: 2 },
        shift: { type: 'NORMAL', startTime: '08:00', endTime: '17:00' },
        leave: { totalDays: 12, usedDays: 1 },
        status: 'nv'
      }
    });
  };

  test('convenience getters delegate to pillars', () => {
    const emp = makeSampleEmployee();
    assert.equal(emp.uuid, 'emp-001');
    assert.equal(emp.username, 'cuong.lv');
    assert.equal(emp.fullName, 'Le Van Cuong');
  });

  test('mutations return new immutable Employee instances', () => {
    const emp = makeSampleEmployee();

    const updatedProfile = emp.updateProfile({ dependants: 2 });
    assert.notEqual(emp, updatedProfile);
    assert.equal(emp.profile.dependants, 1);
    assert.equal(updatedProfile.profile.dependants, 2);

    const lockedAccount = emp.updateAccount({ isLocked: true, lockedAt: '2026-11-03T11:00:00Z', lockedBy: 'hr' });
    assert.equal(lockedAccount.account.isLocked, true);
    assert.equal(emp.account.isLocked, false);

    const updatedContract = emp.updateContract({ status: 'nghiviec', resignedOn: '2026-11-30' });
    assert.equal(updatedContract.contract.status, 'nghiviec');
    assert.equal(updatedContract.contract.resignedOn, '2026-11-30');
    assert.equal(emp.contract.status, 'nv');

    const promoted = emp.changePosition({ level: 3 });
    assert.equal(promoted.contract.position.level, 3);
    assert.equal(emp.contract.position.level, 2);

    const newShift = emp.changeShift({ type: 'FLEX', startTime: '09:00', endTime: '18:00' });
    assert.equal(newShift.contract.shift.type, 'FLEX');

    const newLeave = emp.updateLeave({ usedDays: 3 });
    assert.equal(newLeave.contract.leave.usedDays, 3);
  });

  test('toDTO and toJSON return complete aggregate serialization', () => {
    const emp = makeSampleEmployee();
    const dto = emp.toDTO();
    assert.equal(dto.profile.uuid, 'emp-001');
    assert.equal(dto.profile.fullName, 'Le Van Cuong');
    assert.equal(dto.account.username, 'cuong.lv');
    assert.equal('passwordHash' in (dto.account as any), false);
    assert.equal(dto.contract.status, 'nv');
    assert.equal(dto.contract.position.type, 'sales');

    assert.deepEqual(emp.toJSON(), dto);
  });
});
