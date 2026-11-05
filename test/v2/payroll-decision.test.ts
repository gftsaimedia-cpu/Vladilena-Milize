import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import 'reflect-metadata';
import { ACCESS_KEY } from '../../src/common';
import { PayrollController } from '../../src/modules/payroll/payroll.controller';
import { PayrollFinalizedError } from '../../src/modules/payroll/payroll.errors';
import { PayrollRepository } from '../../src/modules/payroll/payroll.repository';
import { gzipSync } from 'node:zlib';
import { createScriptedKysely, type ScriptedQuery } from './helpers/scripted-kysely';

const ADMIN: any = { username: 'admin', role: 'admin' };

describe('Duyệt / từ chối từng phiếu lương', () => {
  it('needs payroll.approve', () => {
    assert.deepEqual(Reflect.getMetadata(ACCESS_KEY, PayrollController.prototype.decidePayslip), { kind: 'cap', cap: 'payroll.approve' });
  });

  it('passes the decision, note and session actor to the service', async () => {
    const calls: any[] = [];
    const ctl = new PayrollController({ decidePayslip: async (...a: any[]) => (calls.push(a), { username: 'nam', status: 'approved' }) } as any);
    const res: any = await ctl.decidePayslip('2026-10', 'nam', { decision: 'approve', note: 'ok' }, ADMIN);
    assert.deepEqual(calls[0], ['2026-10', 'nam', 'approved', 'admin', 'ok']);
    assert.equal(res.payslip.status, 'approved');
  });

  it('maps errors: bad decision 400, no payslip 404, final month 409', async () => {
    const ok = new PayrollController({ decidePayslip: async () => null } as any);
    await assert.rejects(ok.decidePayslip('2026-10', 'nam', { decision: 'maybe' } as any, ADMIN), (e: any) => e.status === 400);
    await assert.rejects(ok.decidePayslip('2026-10', 'nam', { decision: 'reject' }, ADMIN), (e: any) => e.status === 404);
    const fin = new PayrollController({ decidePayslip: async () => { throw new PayrollFinalizedError(); } } as any);
    await assert.rejects(fin.decidePayslip('2026-10', 'nam', { decision: 'approve' }, ADMIN), (e: any) => e.status === 409 && e.details?.code === 'PAYROLL_FINALIZED');
  });

  it('updates only the payslip of the current draft run', async () => {
    const { db, log } = createScriptedKysely((q: ScriptedQuery) => {
      if (/from "payroll_runs"/.test(q.sql)) return [{ id: 7, status: 'draft' }];
      if (/^update "payslips"/.test(q.sql)) return [{ id: 1, run_id: 7, username: 'nam', status: 'rejected', gross: 1, insurance: 0, tax: 0, advance: 0, net: 1, snapshot_gz: gzipSync(Buffer.from('{}')), flags_json: null }];
      return [];
    });
    const repo = new PayrollRepository(db);
    await repo.decidePayslip('2026-10', 'nam', 'rejected', 'admin', 'thiếu công');
    const update = log.find(e => typeof e === 'object' && /^update "payslips"/.test(e.sql)) as ScriptedQuery;
    assert.match(update.sql, /"status" = \$1, "decided_by" = \$2, "decided_at" = \$3, "note" = \$4/);
    assert.match(update.sql, /where "run_id" = \$\d+ and "username" = \$\d+/);
    assert.deepEqual(update.parameters.slice(0, 2), ['rejected', 'admin']);
    assert.equal(update.parameters[3], 'thiếu công');
  });

  it('refuses a decision on a final run', async () => {
    const { db } = createScriptedKysely(q => (/from "payroll_runs"/.test(q.sql) ? [{ id: 7, status: 'final' }] : []));
    await assert.rejects(new PayrollRepository(db).decidePayslip('2026-10', 'nam', 'approved', 'admin'), PayrollFinalizedError);
  });
});
