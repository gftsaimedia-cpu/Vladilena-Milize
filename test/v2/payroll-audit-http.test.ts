// Route tính lương, duyệt phiếu và lưu KPI: lỗi ghi nhật ký là lỗi lập trình nên ra 500 (spec audit-log mục 4),
// không bị đổi thành 400 CALCULATE_ERROR.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AuditEntryError } from '../../src/modules/audit';
import { PayrollController } from '../../src/modules/payroll/payroll.controller';

const ADMIN: any = { username: 'admin', name: 'Admin', role: 'admin', type: 'ql', level: 0 };

describe('Nhật ký ở các route lương', () => {
  it('an audit entry error from calculate, decide or KPI save is rethrown unchanged', async () => {
    const boom = new AuditEntryError('Nhật ký payroll.calculate: actor không được để trống');
    const fail = async () => {
      throw boom;
    };
    const svc: any = { calculatePeriodPayslips: fail, decidePayslip: fail, setKpiScore: fail };
    const ctrl = new PayrollController(svc);
    await assert.rejects(ctrl.calculatePeriod('2026-10', {}, ADMIN), err => err === boom);
    await assert.rejects(ctrl.decidePayslip('2026-10', 'nam', { decision: 'approve' }, ADMIN), err => err === boom);
    await assert.rejects(ctrl.setKpiScore('2026-10', 'nam', { wework: 80 }, ADMIN), err => err === boom);
  });
});
