import assert from 'node:assert/strict';
import { test } from 'node:test';
import { KPI_PARTS, leaveIncomePayOf } from '../../src/modules/me/domain';

test('leaveIncomePayOf cộng nghỉ phép, quyết toán phép, iSAT và lương lễ; thiếu thì 0', () => {
  assert.equal(leaveIncomePayOf({ paidLeavePay: 100, leaveSettlementPay: 20, isatPay: 3, holidayPay: 4 }), 127);
  assert.equal(leaveIncomePayOf({ isatPay: 5 }), 5);
  assert.equal(leaveIncomePayOf(null), 0);
});

test('KPI_PARTS có năm phần theo thứ tự hiển thị', () => {
  assert.deepEqual(KPI_PARTS.map(p => p.key), ['wework', 'user', 'peer', 'manager', 'self']);
});
