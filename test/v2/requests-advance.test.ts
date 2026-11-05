import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { RequestsService } from '../../src/modules/requests/requests.service';
import { NV_UUID, makeService } from './helpers/requests-fakes';

const SELF = { filedBy: 'self' as const };
const BODY = { employeeId: 'nv01' };
const ON_16TH = '2026-11-16T03:00:00Z';

describe('Tạm ứng do server tính (spec 2.5)', () => {
  let ctx: ReturnType<typeof makeService>;
  beforeEach(() => {
    ctx = makeService();
  });

  const at = (now: string) => {
    const fresh = makeService();
    fresh.service.now = () => new Date(now);
    return fresh;
  };

  it('advance window follows VN date', async () => {
    const closedMessage = 'Chỉ nộp tạm ứng ngày 16 và 17';
    await assert.rejects(at('2026-11-15T10:00:00Z').service.createAdvanceRequest(BODY as any, SELF), { message: closedMessage });
    assert.equal((await at('2026-11-15T17:30:00Z').service.createAdvanceRequest(BODY as any, SELF)).advancePeriod, '2026-11');
    assert.equal((await at('2026-11-17T16:30:00Z').service.createAdvanceRequest(BODY as any, SELF)).advancePeriod, '2026-11');
    await assert.rejects(at('2026-11-17T17:30:00Z').service.createAdvanceRequest(BODY as any, SELF), { message: closedMessage });
  });

  it('amount comes from the quote', async () => {
    ctx.service.now = () => new Date(ON_16TH);
    const dto = await ctx.service.createAdvanceRequest({ ...BODY, amount: 1, reason: 'x', title: 'y', period: '2026-10' } as any, SELF);
    assert.equal(dto.advanceAmount, 2_215_385);
    assert.equal(dto.advancePeriod, '2026-11');
    assert.equal(dto.title, 'Tạm ứng lương tháng 11');
    assert.equal(dto.reason, 'Tạm ứng lương tháng 11');
    assert.deepEqual(ctx.payroll.calls, [[NV_UUID, '2026-11']]);
  });

  it('one advance per month', async () => {
    ctx.service.now = () => new Date(ON_16TH);
    const first = await ctx.service.createAdvanceRequest(BODY as any, SELF);
    await assert.rejects(ctx.service.createAdvanceRequest(BODY as any, SELF), { message: 'Tháng 11 đã có đơn tạm ứng' });
    await assert.rejects(ctx.service.createAdvanceRequest({ ...BODY, period: '2026-11' } as any), {
      message: 'Tháng 11 đã có đơn tạm ứng'
    });
    await ctx.service.reviewRequest(first.id, 'admin', 'APPROVE');
    await assert.rejects(ctx.service.createAdvanceRequest(BODY as any, SELF), { message: 'Tháng 11 đã có đơn tạm ứng' });
  });

  it('cancelling the first advance allows filing again', async () => {
    ctx.service.now = () => new Date(ON_16TH);
    const first = await ctx.service.createAdvanceRequest(BODY as any, SELF);
    await ctx.service.cancelRequest(first.id, 'nv01');
    const second = await ctx.service.createAdvanceRequest(BODY as any, SELF);
    assert.notEqual(second.id, first.id);
  });

  it('a rejected advance does not block the month', async () => {
    ctx.service.now = () => new Date(ON_16TH);
    const first = await ctx.service.createAdvanceRequest(BODY as any, SELF);
    await ctx.service.reviewRequest(first.id, 'admin', 'REJECT');
    await ctx.service.createAdvanceRequest(BODY as any, SELF);
  });

  it('the one-per-month check runs under the employee lock', async () => {
    ctx.service.now = () => new Date(ON_16TH);
    await ctx.service.createAdvanceRequest(BODY as any, SELF);
    const listCalls = ctx.repo.calls.filter(([name]) => name === 'list');
    assert.ok(listCalls.length > 0);
    assert.ok(listCalls.every(([, trx]) => trx !== undefined));
  });

  it('zero amount refused', async () => {
    ctx.service.now = () => new Date(ON_16TH);
    ctx.payroll.quote = { amount: 0, workDays: 0, from: '2026-11-01', to: '2026-11-15' };
    await assert.rejects(ctx.service.createAdvanceRequest(BODY as any, SELF), { message: 'Chưa có ngày công 01–15/11' });
    assert.equal(ctx.repo.requests.size, 0);
  });

  it('quote failure refused', async () => {
    ctx.service.now = () => new Date(ON_16TH);
    ctx.payroll.failWith = new Error('boom');
    await assert.rejects(ctx.service.createAdvanceRequest(BODY as any, SELF), { message: 'Chưa tính được số tiền tạm ứng' });
    assert.equal(ctx.repo.requests.size, 0);
  });

  it('a duplicate month reports the duplicate even when the quote would fail', async () => {
    ctx.service.now = () => new Date(ON_16TH);
    await ctx.service.createAdvanceRequest(BODY as any, SELF);
    ctx.payroll.failWith = new Error('boom');
    await assert.rejects(ctx.service.createAdvanceRequest(BODY as any, SELF), { message: 'Tháng 11 đã có đơn tạm ứng' });
  });

  it('the quote is taken before the employee lock, not while it is held', async () => {
    ctx.service.now = () => new Date(ON_16TH);
    let held = false;
    const withLock = ctx.lock.withLock.bind(ctx.lock);
    ctx.lock.withLock = async (key: string, fn: (trx: any) => Promise<any>) => {
      held = true;
      try {
        return await withLock(key, fn);
      } finally {
        held = false;
      }
    };
    const heldDuringQuote: boolean[] = [];
    const advanceQuote = ctx.payroll.advanceQuote.bind(ctx.payroll);
    ctx.payroll.advanceQuote = async (employeeId: string, month: string) => {
      heldDuringQuote.push(held);
      return advanceQuote(employeeId, month);
    };
    await ctx.service.createAdvanceRequest(BODY as any, SELF);
    assert.deepEqual(heldDuringQuote, [false]);
  });

  it('missing payroll refused', async () => {
    const bare = new RequestsService(ctx.repo, ctx.att, undefined, ctx.holidays, ctx.days, ctx.gate);
    bare.now = () => new Date(ON_16TH);
    await assert.rejects(bare.createAdvanceRequest(BODY as any, SELF), { message: 'Chưa tính được số tiền tạm ứng' });
  });

  it('admin files any day for a given month', async () => {
    const dto = await ctx.service.createAdvanceRequest({ ...BODY, period: '2026-10' } as any);
    assert.equal(dto.advancePeriod, '2026-10');
    assert.deepEqual(ctx.payroll.calls, [[NV_UUID, '2026-10']]);
  });

  it('admin without a period uses the current month', async () => {
    const dto = await ctx.service.createAdvanceRequest(BODY as any);
    assert.equal(dto.advancePeriod, '2026-11');
  });

  it('preview advance', async () => {
    ctx.service.now = () => new Date(ON_16TH);
    assert.deepEqual(await ctx.service.previewRequest('advance', BODY, SELF), {
      ok: true,
      title: 'Tạm ứng lương tháng 11',
      summary: { month: '2026-11', amount: 2_215_385, workDays: 12 },
      warnings: []
    });
    assert.equal(ctx.repo.requests.size, 0);
  });

  it('preview reports the same refusals', async () => {
    assert.deepEqual(await ctx.service.previewRequest('advance', BODY, SELF), {
      ok: false,
      message: 'Chỉ nộp tạm ứng ngày 16 và 17'
    });
  });
});
