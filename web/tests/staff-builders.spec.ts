import { expect, test } from '@playwright/test';
import { staffProfileFromEmployee, staffRowFromEmployee, type EmployeeDTO, type EmployeeWithWork } from '../src/builders/api/staff';

// Màn Nhân sự trên phản hồi BE thật: phòng ban (departmentName) và trạng thái (`work`) do BE tính, FE chỉ ánh xạ. Không dùng trình duyệt.
const LABEL = { ok: 'Chính thức', try: 'Thử việc', off: 'Tạm nghỉ', out: 'Đã nghỉ việc' } as const;
const STATUS = { working: 'ok', probation: 'try', on_leave: 'off', resigned: 'out' } as const;
// Như BE: `work` đi kèm mỗi hồ sơ, suy từ staffStatus.
const withWork = (e: EmployeeDTO): EmployeeWithWork => {
  const status = STATUS[(e.staffStatus ?? 'working') as keyof typeof STATUS];
  return { ...e, work: { active: status !== 'out', status, statusLabel: LABEL[status], joinedOn: e.contract.effectiveFrom ?? '', tenure: status === 'out' ? '' : '10 ngày' } };
};
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
  const row = staffRowFromEmployee(withWork(emp()));
  expect([row.dept, row.status, row.statusLabel]).toEqual(['Phòng ban 2', 'ok', 'Chính thức']);
});

test('a person with no department shows the dash', () => {
  expect(staffRowFromEmployee(withWork(emp({ departmentId: null, departmentName: null }))).dept).toBe('—');
});

test('probation, on leave and resigned map to the four row statuses', () => {
  const status = (staffStatus: string) => staffRowFromEmployee(withWork(emp({ staffStatus } as any))).status;
  expect([status('probation'), status('on_leave'), status('resigned'), status('working')]).toEqual(['try', 'off', 'out', 'ok']);
});

test('an older response without staffStatus keeps the old rules', () => {
  const old = emp({ staffStatus: undefined, departmentName: undefined } as any);
  expect([staffRowFromEmployee(withWork(old)).status, staffRowFromEmployee(withWork(old)).dept]).toEqual(['ok', '—']);
});

test('the drawer shows the department name', () => {
  const fact = staffProfileFromEmployee(withWork(emp())).groups[0].facts.find(f => f.label === 'Phòng ban');
  expect(fact?.value).toBe('Phòng ban 2');
});

test('the people index carries department and status for the Yêu cầu tab', async () => {
  const { peopleOf } = await import('../src/builders/api/staff');
  const map = peopleOf([emp(), emp({ departmentName: null, staffStatus: 'on_leave', account: { username: 'mai', roles: [], isLocked: false, lockedAt: null, createdAt: '2026-01-01T00:00:00Z' }, profile: { uuid: 'u2', fullName: 'Mai', birthday: null, dependants: 0 } } as any)]);
  expect([map.get('ha')?.dept, map.get('ha')?.ps, map.get('u2')?.dept, map.get('u2')?.ps]).toEqual(['Phòng ban 2', 'ok', '—', 'off']);
});
