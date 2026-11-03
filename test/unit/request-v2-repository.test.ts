import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Kysely } from 'kysely';
import { AppDialect, AppDatabase } from '../../src/data/db-dialect';
import type { Schema } from '../../src/data/schema.generated';
import { RequestV2Repository } from '../../src/data/request-v2.repository';
import { SystemRequest, SystemRequestRow, RequestType, RequestStatus } from '../../src/domain/request-v2';

class MockDb implements AppDatabase {
  executedQueries: { sql: string; params: unknown[] }[] = [];
  handler: (sql: string, params: unknown[]) => { rows?: unknown[]; changes?: number } = () => ({ rows: [] });

  native(sql: string) {
    return {
      all: async (...params: unknown[]) => {
        this.executedQueries.push({ sql, params });
        const res = this.handler(sql, params);
        return (res.rows || []) as unknown[];
      },
      run: async (...params: unknown[]) => {
        this.executedQueries.push({ sql, params });
        const res = this.handler(sql, params);
        return { changes: res.changes ?? 1 };
      }
    };
  }
}

function createSampleRow(overrides: Partial<SystemRequestRow> = {}): SystemRequestRow {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    employee_id: 'a0000000-0000-0000-0000-000000000001',
    title: 'Xin nghỉ phép cá nhân',
    type: 'LEAVE',
    reason: 'Giải quyết việc gia đình',
    status: 'PENDING',
    reviewed_by: null,
    reviewed_at: null,
    review_note: null,
    created_at: '2026-11-03T10:00:00.000Z',
    updated_at: '2026-11-03T10:00:00.000Z',
    leave_type: 'PAID',
    leave_start_date: '2026-11-10',
    leave_end_date: '2026-11-12',
    leave_days_count: 3,
    correction_date: null,
    correction_punch_type: null,
    correction_actual_time: null,
    ot_date: null,
    ot_start_time: null,
    ot_end_time: null,
    ot_hours: null,
    advance_amount: null,
    advance_period: null,
    ...overrides
  };
}

describe('RequestV2Repository', () => {
  test('save inserts or updates SystemRequest on conflict id', async () => {
    const mock = new MockDb();
    const qb = new Kysely<Schema>({ dialect: new AppDialect(mock) });
    const repo = new RequestV2Repository(qb);

    const req = SystemRequest.createLeaveRequest({
      employeeId: 'a0000000-0000-0000-0000-000000000001',
      title: 'Xin nghỉ phép',
      reason: 'Việc riêng',
      leaveType: 'PAID',
      startDate: '2026-11-10',
      endDate: '2026-11-11',
      daysCount: 2
    });

    await repo.save(req);

    assert.equal(mock.executedQueries.length, 1);
    const query = mock.executedQueries[0];
    assert.ok(query.sql.toLowerCase().includes('insert into "system_requests"'));
    assert.ok(query.sql.toLowerCase().includes('on conflict ("id") do update set'));
    assert.ok(query.params.includes(req.id));
    assert.ok(query.params.includes('a0000000-0000-0000-0000-000000000001'));
    assert.ok(query.params.includes('Xin nghỉ phép'));
    assert.ok(query.params.includes('LEAVE'));
  });

  test('findById returns null when request is not found', async () => {
    const mock = new MockDb();
    const qb = new Kysely<Schema>({ dialect: new AppDialect(mock) });
    const repo = new RequestV2Repository(qb);

    mock.handler = () => ({ rows: [] });

    const found = await repo.findById('non-existent-id');
    assert.equal(found, null);
    assert.ok(mock.executedQueries[0].sql.toLowerCase().includes('from "system_requests"'));
    assert.ok(mock.executedQueries[0].params.includes('non-existent-id'));
  });

  test('findById reconstructs aggregate accurately for all request types', async () => {
    const mock = new MockDb();
    const qb = new Kysely<Schema>({ dialect: new AppDialect(mock) });
    const repo = new RequestV2Repository(qb);

    // 1. Leave
    mock.handler = () => ({ rows: [createSampleRow({ type: 'LEAVE', leave_type: 'UNPAID', leave_days_count: 1.5 })] });
    const leaveReq = await repo.findById('11111111-1111-1111-1111-111111111111');
    assert.ok(leaveReq);
    assert.equal(leaveReq.type, 'LEAVE');
    assert.equal(leaveReq.leaveType, 'UNPAID');
    assert.equal(leaveReq.leaveDaysCount, 1.5);

    // 2. Correction
    mock.handler = () => ({
      rows: [
        createSampleRow({
          type: 'TIME_CORRECTION',
          correction_date: '2026-11-03',
          correction_punch_type: 'IN',
          correction_actual_time: '08:05'
        })
      ]
    });
    const corrReq = await repo.findById('22222222-2222-2222-2222-222222222222');
    assert.ok(corrReq);
    assert.equal(corrReq.type, 'TIME_CORRECTION');
    assert.equal(corrReq.correctionDate, '2026-11-03');
    assert.equal(corrReq.correctionPunchType, 'IN');
    assert.equal(corrReq.correctionActualTime, '08:05');

    // 3. Overtime
    mock.handler = () => ({
      rows: [
        createSampleRow({
          type: 'OVERTIME',
          ot_date: '2026-11-04',
          ot_start_time: '18:00',
          ot_end_time: '21:00',
          ot_hours: 3.0
        })
      ]
    });
    const otReq = await repo.findById('33333333-3333-3333-3333-333333333333');
    assert.ok(otReq);
    assert.equal(otReq.type, 'OVERTIME');
    assert.equal(otReq.otDate, '2026-11-04');
    assert.equal(otReq.otHours, 3.0);

    // 4. Advance
    mock.handler = () => ({
      rows: [
        createSampleRow({
          type: 'ADVANCE',
          advance_amount: '5000000',
          advance_period: '2026-11'
        })
      ]
    });
    const advReq = await repo.findById('44444444-4444-4444-4444-444444444444');
    assert.ok(advReq);
    assert.equal(advReq.type, 'ADVANCE');
    assert.equal(advReq.advanceAmount, 5000000n);
    assert.equal(advReq.advancePeriod, '2026-11');
  });

  test('list applies filtering and pagination correctly', async () => {
    const mock = new MockDb();
    const qb = new Kysely<Schema>({ dialect: new AppDialect(mock) });
    const repo = new RequestV2Repository(qb);

    mock.handler = () => ({
      rows: [createSampleRow({ id: 'id-1', status: 'PENDING' }), createSampleRow({ id: 'id-2', status: 'PENDING' })]
    });

    const results = await repo.list({
      employeeId: 'a0000000-0000-0000-0000-000000000001',
      type: 'LEAVE',
      status: 'PENDING',
      limit: 10,
      offset: 20
    });

    assert.equal(results.length, 2);
    const lastQuery = mock.executedQueries[mock.executedQueries.length - 1];
    const sql = lastQuery.sql.toLowerCase();
    assert.ok(sql.includes('"employee_id" ='));
    assert.ok(sql.includes('"type" ='));
    assert.ok(sql.includes('"status" ='));
    assert.ok(sql.includes('order by "created_at" desc'));
    assert.ok(sql.includes('limit'));
    assert.ok(sql.includes('offset'));
    assert.ok(lastQuery.params.includes('a0000000-0000-0000-0000-000000000001'));
    assert.ok(lastQuery.params.includes('LEAVE'));
    assert.ok(lastQuery.params.includes('PENDING'));
  });

  test('count applies filters and returns total number', async () => {
    const mock = new MockDb();
    const qb = new Kysely<Schema>({ dialect: new AppDialect(mock) });
    const repo = new RequestV2Repository(qb);

    mock.handler = () => ({ rows: [{ total: 42 }] });

    const total = await repo.count({
      employeeId: 'a0000000-0000-0000-0000-000000000001',
      type: 'OVERTIME',
      status: 'APPROVED'
    });

    assert.equal(total, 42);
    const lastQuery = mock.executedQueries[mock.executedQueries.length - 1];
    const sql = lastQuery.sql.toLowerCase();
    assert.ok(sql.includes('count(*)'));
    assert.ok(sql.includes('"employee_id" ='));
    assert.ok(sql.includes('"type" ='));
    assert.ok(sql.includes('"status" ='));
  });
});
