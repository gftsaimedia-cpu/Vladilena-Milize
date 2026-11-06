// Chạy phía Node. Biểu mẫu Thêm / Sửa hồ sơ nhân sự → thân POST và PUT /api/v2/employees, và ngược lại từ hồ sơ BE trả.
import { expect, test } from '@playwright/test';
import type { EmployeeDTO } from '../src/builders/api/staff';
import {
  createProblem,
  editProblem,
  editStaffBody,
  emptyStaffForm,
  formFromEmployee,
  newStaffBody,
  type StaffForm
} from '../src/builders/admin-hr/staff-form';

const LEVELS = [
  { value: '1', label: 'Bậc 1 · Nhân viên' },
  { value: '2', label: 'Bậc 2 · Chuyên viên' }
];

const filled = (over: Partial<StaffForm> = {}): StaffForm => ({
  ...emptyStaffForm('2026-10-28'),
  name: 'Phan  Thị Hai',
  username: 'phan-thi-hai',
  password: 'Hai@2026',
  type: 'nv',
  level: '2',
  status: 'thuviec',
  ...over
});

const employee = (over: Partial<EmployeeDTO['contract']> = {}, dept: number | null = 3): EmployeeDTO => ({
  profile: { uuid: 'u-1', fullName: 'Lê Hoàng Nam', birthday: '1995-04-02', dependants: 0 },
  account: { username: 'le-hoang-nam', roles: ['staff'], isLocked: false, lockedAt: null, createdAt: '2024-03-04T00:00:00Z' },
  contract: {
    position: { type: 'nv', level: 2, jobTitle: 'Nhân viên kinh doanh' },
    shift: { type: 'NIGHT', startTime: '21:00', endTime: '06:00', allowancePct: 60 } as EmployeeDTO['contract']['shift'],
    leave: { totalDays: 12, usedDays: 0, remainingDays: 12 },
    status: 'thuviec',
    term: 'long',
    effectiveFrom: '2024-03-04',
    resignedOn: null,
    hasInsurance: true,
    ...over
  },
  departmentId: dept,
  departmentName: dept ? 'Kinh doanh' : null
});

test('a new person goes to the chosen department, or to none', () => {
  expect(newStaffBody(filled({ dept: '4' })).departmentId).toBe(4);
  expect(newStaffBody(filled({ dept: '' })).departmentId).toBeNull();
});

test('the new-person body keeps the account, name split and contract the BE reads', () => {
  expect(newStaffBody(filled({ job: ' Kế toán ', dept: '2' }))).toEqual({
    account: { username: 'phan-thi-hai', password: 'Hai@2026', roles: ['staff'] },
    profile: { name: { familyName: 'Phan Thị', givenName: 'Hai' }, birthday: null },
    contract: {
      status: 'thuviec',
      effectiveFrom: '2026-10-28',
      position: { type: 'nv', level: 2, jobTitle: 'Kế toán' },
      shift: { type: 'NORMAL' }
    },
    departmentId: 2
  });
});

test('an edit sends no account part, so the username, password and roles stay as they are', () => {
  const body = editStaffBody(filled({ password: '', dept: '' }));
  expect(body).not.toHaveProperty('account');
  expect(body).toEqual({
    profile: { name: { familyName: 'Phan Thị', givenName: 'Hai' }, birthday: null },
    contract: {
      status: 'thuviec',
      effectiveFrom: '2026-10-28',
      position: { type: 'nv', level: 2, jobTitle: null },
      shift: { type: 'NORMAL' }
    },
    departmentId: null
  });
});

test('an NV on the night shift sends the chosen night allowance; other types let the BE default it', () => {
  expect(editStaffBody(filled({ shift: 'NIGHT', nightPct: '40' })).contract.shift).toEqual({ type: 'NIGHT', allowancePct: 40 });
  expect(editStaffBody(filled({ type: 'ctv', status: '', shift: 'NIGHT' })).contract).toMatchObject({
    status: 'ctv',
    shift: { type: 'NIGHT' }
  });
});

test('the edit form starts from what the BE holds for the person', () => {
  expect(formFromEmployee(employee())).toEqual({
    name: 'Lê Hoàng Nam',
    username: 'le-hoang-nam',
    password: '',
    type: 'nv',
    level: '2',
    status: 'thuviec',
    job: 'Nhân viên kinh doanh',
    shift: 'NIGHT',
    nightPct: '60',
    start: '2024-03-04',
    birthday: '1995-04-02',
    dept: '3'
  });
});

test('only an NV carries Thử việc or Chính thức; a person without a department or title starts empty there', () => {
  const tts = formFromEmployee(
    employee({ status: 'tts', position: { type: 'tts', level: 6, jobTitle: null }, shift: { type: 'NORMAL', startTime: '08:00', endTime: '17:00' } }, null)
  );
  expect(tts).toMatchObject({ type: 'tts', level: '6', status: '', job: '', shift: 'NORMAL', nightPct: '', dept: '' });
});

test('an edit needs the same fields as a new person except the username and password', () => {
  const f = filled({ username: '', password: '' });
  expect(editProblem(f, LEVELS)).toBe('');
  expect(createProblem(f, [], LEVELS)).not.toBe('');
  expect(editProblem({ ...f, name: ' ' }, LEVELS)).not.toBe('');
  expect(editProblem({ ...f, level: '5' }, LEVELS)).not.toBe('');
  expect(editProblem({ ...f, status: '' }, LEVELS)).not.toBe('');
  expect(editProblem({ ...f, shift: 'NIGHT', nightPct: '' }, LEVELS)).not.toBe('');
  expect(editProblem({ ...f, start: '' }, LEVELS)).not.toBe('');
});
