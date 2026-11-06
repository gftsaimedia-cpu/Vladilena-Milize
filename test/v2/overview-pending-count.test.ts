import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { OverviewController } from '../../src/modules/overview/overview.controller';
import { OverviewService } from '../../src/modules/overview/overview.service';

// Số chuông = đơn chờ duyệt + ngày cần giải trình (đúng hai nguồn của danh sách chuông và thẻ "Việc cần duyệt").
function make(opts: { total: number; due: unknown[] | Error }) {
  const requests = { listRequests: async () => ({ items: [], total: opts.total }) };
  const explanations = {
    listDue: async () => {
      if (opts.due instanceof Error) throw opts.due;
      return opts.due;
    }
  };
  return new OverviewService(null as any, null as any, null as any, null as any, requests as any, explanations as any, null as any, null as any);
}

describe('Số trên chuông Admin', () => {
  it('counts pending requests plus explanation reminders', async () => {
    assert.equal(await make({ total: 3, due: [{}, {}] }).pendingCount(), 5);
    assert.equal(await make({ total: 0, due: [] }).pendingCount(), 0);
  });

  it('a failing source throws instead of counting short', async () => {
    await assert.rejects(make({ total: 3, due: new Error('boom') }).pendingCount(), { message: 'boom' });
  });

  it('the controller returns the single number', async () => {
    const controller = new OverviewController(make({ total: 2, due: [{}] }));
    assert.deepEqual(await controller.pendingCount(), { count: 3 });
  });
});
