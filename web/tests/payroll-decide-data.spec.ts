// Duyệt / từ chối phiếu trên dữ liệu giả (mock/payroll.ts decidePayslip): lý do từ chối lưu đã cắt khoảng trắng, trống thành
// null, duyệt thì bỏ lý do. Chạy trong Node, không mở trang. Trạng thái giả nằm trong bộ nhớ, dùng chung với các file test Node
// khác cùng worker (payroll-mock đếm số phiếu theo trạng thái), nên chỉ đụng hai phiếu và trả chúng về như cũ sau mỗi test:
// GFT-0156 vốn bị từ chối, không lý do; GFT-0101 vốn đã duyệt.
import { expect, test } from '@playwright/test';
import { decidePayslip, payslipView } from '../src/mock/payroll';

const M = '2026-10';

test.afterEach(() => {
  decidePayslip(M, 'GFT-0156', 'reject');
  decidePayslip(M, 'GFT-0101', 'approve');
});

test('rejecting keeps the reason trimmed', () => {
  expect(decidePayslip(M, 'GFT-0156', 'reject', '  x  ')).toMatchObject({ status: 'rejected', decisionNote: 'x' });
  expect(payslipView(M, 'GFT-0156')?.decisionNote).toBe('x');
});

test('rejecting with a blank or no reason stores null', () => {
  decidePayslip(M, 'GFT-0156', 'reject', 'Sai điểm');
  expect(decidePayslip(M, 'GFT-0156', 'reject', '   ')).toMatchObject({ status: 'rejected', decisionNote: null });
  decidePayslip(M, 'GFT-0156', 'reject', 'Sai điểm');
  expect(decidePayslip(M, 'GFT-0156', 'reject')).toMatchObject({ status: 'rejected', decisionNote: null });
  expect(payslipView(M, 'GFT-0156')?.decisionNote).toBeNull();
});

test('approving after a rejection clears the reason', () => {
  expect(decidePayslip(M, 'GFT-0101', 'reject', 'Sai điểm')).toMatchObject({ status: 'rejected', decisionNote: 'Sai điểm' });
  expect(decidePayslip(M, 'GFT-0101', 'approve', 'bỏ qua')).toMatchObject({ status: 'done', decisionNote: null });
  expect(payslipView(M, 'GFT-0101')?.decisionNote).toBeNull();
});

test('an unknown slip or month decides nothing', () => {
  expect(decidePayslip(M, 'GFT-9999', 'reject', 'x')).toBeNull();
  expect(decidePayslip('2026-11', 'GFT-0156', 'reject', 'x')).toBeNull();
});
