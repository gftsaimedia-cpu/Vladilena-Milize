import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProfile, toNewStaffBody, toStaffPutBody } from '../../web/src/builders/admin-hr/staff';

test('new staff body sends contract status and excludes account credentials and leave edits', () => {
  const body = toNewStaffBody({
    name: ' Mai ',
    type: 'nv',
    level: '2',
    shift: '',
    start: '2026-11-01',
    birth: '',
    title: 'Quản lý',
    contractStatus: 'probation',
    username: 'mai',
    password: 'secret',
    leaveAdjust: 4
  });
  assert.deepEqual(body, {
    name: 'Mai',
    role: 'staff',
    type: 'nv',
    level: 2,
    shiftCode: null,
    startDate: '2026-11-01',
    birthday: null,
    jobTitle: 'Quản lý',
    contractStatus: 'probation'
  });
});

test('profile preserves nullable contract status and displays current leave balance only', () => {
  const profile = buildProfile({
    username: 'mai',
    name: 'Mai',
    type: 'nv',
    level: 1,
    contractStatus: null,
    leave: { total: 7, used: 2, balance: 5, adjust: 0 }
  });
  assert.equal(profile.contractStatus, null);
  assert.equal(profile.leave, 5);
});

test('profile update omits unchanged leave adjustment and sends contract status', () => {
  const body = toStaffPutBody(
    {
      name: 'Mai',
      role: 'staff',
      type: 'nv',
      level: '1',
      shift: '',
      start: '',
      iDorm: false,
      birthHidden: true,
      payHidden: true,
      contractStatus: 'official'
    },
    { rev: 'r1' }
  );
  assert.equal(body.contractStatus, 'official');
  assert.equal(Object.hasOwn(body, 'leaveAdjust'), false);
  assert.equal(Object.hasOwn(body, 'jobTitle'), false);
});

test('profile update leaves an unreturned contract status untouched', () => {
  const body = toStaffPutBody(
    {
      name: 'Mai',
      role: 'staff',
      type: 'nv',
      level: '1',
      shift: '',
      start: '',
      iDorm: false,
      birthHidden: true,
      payHidden: true
    },
    { rev: 'r1' }
  );
  assert.equal(Object.hasOwn(body, 'contractStatus'), false);
});
