import { expect, test } from '@playwright/test';
import { payrollScreenFromPayslips } from '../src/builders/api/payroll';

// Bảng lương trên phản hồi BE thật: mỗi phiếu có khối employee (phòng ban, trạng thái nhân sự). Không dùng trình duyệt.
const slip = (username: string, employee?: object) =>
  ({
    id: 1,
    username,
    status: 'draft',
    gross: 0,
    insurance: 0,
    tax: 0,
    net: 0,
    details: { fullName: `Người ${username}`, positionLevelText: 'NV bậc 1', standardWorkdays: 26, actualWorkDays: 20, baseSalaryPolicy: 1, baseSalaryActual: 1, kpiApplicable: false, kpiScores: {}, kpiActualPay: 0, totalAllowanceActual: 0, otPayTotal: 0, lateEarlyDeductionAmount: 0 },
    ...(employee ? { employee } : {})
  }) as any;
const block = (departmentName: string | null, staffStatus: string) => ({ id: 'u', username: 'x', name: 'x', departmentId: null, departmentName, jobTitle: null, staffStatus });
const totals = {} as any;

test('a payslip line takes department and status from the employee block', () => {
  const screen = payrollScreenFromPayslips([slip('ha', block('Phòng ban 2', 'probation'))], '2026-10', totals) as any;
  expect([screen.lines[0].dept, screen.lines[0].ps]).toEqual(['Phòng ban 2', 'try']);
});

test('no department shows the dash, and no block keeps the old defaults', () => {
  const screen = payrollScreenFromPayslips([slip('a', block(null, 'on_leave')), slip('b')], '2026-10', totals) as any;
  const byId = Object.fromEntries(screen.lines.map((l: any) => [l.id, [l.dept, l.ps]]));
  expect(byId).toEqual({ a: ['—', 'off'], b: ['—', undefined] });
});
