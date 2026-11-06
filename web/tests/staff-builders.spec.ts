import { expect, test } from '@playwright/test';
import { staffProfileFromEmployee, staffRowFromEmployee, type EmployeeDTO } from '../src/builders/api/staff';

// Màn Nhân sự trên phản hồi BE thật: phòng ban và trạng thái nhân sự do BE tính (departmentName, staffStatus). Không dùng trình duyệt.
const emp = (over: Partial<EmployeeDTO> & Record<string, unknown> = {}): EmployeeDTO =>
  ({
    profile: { uuid: 'u1', fullName: 'Nguyễn Thu Hà', birthday: null, dependants: 0 },
    account: { username: 'ha', roles: ['staff'], isLocked: false, lockedAt: null, createdAt: '2026-01-05T01:00:00.000Z' },
    contract: {
      position: { type: 'nv', level: 1, jobTitle: null },
      shift: { type: 'NORMAL', startTime: '08:00', endTime: '17:00' },
      leave: { totalDays: 12, usedDays: 0, remainingDays: 12 },
      status: 'nv',
      term: null,
      effectiveFrom: '2026-01-05',
      resignedOn: null,
      hasInsurance: null
    },
    departmentId: 2,
    departmentName: 'Phòng ban 2',
    staffStatus: 'working',
    ...over
  }) as EmployeeDTO;

test('the row takes department and status from the server', () => {
  const row = staffRowFromEmployee(emp());
  expect([row.dept, row.status, row.statusLabel]).toEqual(['Phòng ban 2', 'ok', 'Chính thức']);
});

test('a person with no department shows the dash', () => {
  expect(staffRowFromEmployee(emp({ departmentId: null, departmentName: null })).dept).toBe('—');
});

test('probation, on leave and resigned map to the four row statuses', () => {
  const status = (staffStatus: string) => staffRowFromEmployee(emp({ staffStatus } as any)).status;
  expect([status('probation'), status('on_leave'), status('resigned'), status('working')]).toEqual(['try', 'off', 'out', 'ok']);
});

test('an older response without staffStatus keeps the old rules', () => {
  const old = emp({ staffStatus: undefined, departmentName: undefined } as any);
  expect([staffRowFromEmployee(old).status, staffRowFromEmployee(old).dept]).toEqual(['ok', '—']);
});

test('the drawer shows the department name', () => {
  const fact = staffProfileFromEmployee(emp(), '2026-11-06').groups[0].facts.find(f => f.label === 'Phòng ban');
  expect(fact?.value).toBe('Phòng ban 2');
});
