// Tab Yêu cầu của Admin: thứ tự inbox, lọc theo tập nhân sự, loại iSAT và số đếm, tính ở SQL.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Kysely } from 'kysely';
import { randomUUID } from 'node:crypto';
import type { DB } from '../../src/database/schema';
import { RequestsRepository } from '../../src/modules/requests/requests.repository';
import { withTempDb } from './helpers/pg-temp-db';

type Row = { title: string; type: string; status: string; createdAt: string; employee?: string };

async function seed(db: Kysely<DB>, rows: Row[]) {
  for (const username of ['ha', 'linh']) {
    await db
      .insertInto('staff')
      .values({ username, name: username, pass_hash: 'x', created_at: '2026-10-01', uuid: `u-${username}` })
      .execute();
  }
  for (const r of rows) {
    await db
      .insertInto('system_requests')
      .values({
        id: randomUUID(),
        employee_id: r.employee ?? 'u-ha',
        title: r.title,
        type: r.type,
        reason: 'x',
        status: r.status,
        created_at: new Date(r.createdAt),
        updated_at: new Date(r.createdAt)
      } as any)
      .execute();
  }
}

const ROWS: Row[] = [
  { title: 'P-old', type: 'LEAVE', status: 'PENDING', createdAt: '2026-10-15T01:00:00Z' },
  { title: 'P-new', type: 'OVERTIME', status: 'PENDING', createdAt: '2026-10-20T01:00:00Z', employee: 'u-linh' },
  { title: 'A', type: 'ADVANCE', status: 'APPROVED', createdAt: '2026-10-25T01:00:00Z' },
  { title: 'R', type: 'LEAVE', status: 'REJECTED', createdAt: '2026-10-30T01:00:00Z', employee: 'u-linh' },
  { title: 'C', type: 'EXPLANATION', status: 'CANCELLED', createdAt: '2026-10-18T01:00:00Z' },
  { title: 'S', type: 'ISAT', status: 'PENDING', createdAt: '2026-10-10T01:00:00Z' }
];

const titles = async (repo: RequestsRepository, filter: Parameters<RequestsRepository['list']>[0]) =>
  (await repo.list(filter)).map(r => r.title);

test('sort=inbox puts pending first (oldest first) and the rest after (newest first)', async t => {
  await withTempDb(t, 'req_inbox_sort', async db => {
    await seed(db, ROWS);
    const repo = new RequestsRepository(db);
    assert.deepEqual(await titles(repo, { sort: 'inbox' }), ['S', 'P-old', 'P-new', 'R', 'A', 'C']);
    assert.deepEqual(await titles(repo, { sort: 'inbox', limit: 2, offset: 1 }), ['P-old', 'P-new'], 'paging follows the inbox order');
    assert.deepEqual(await titles(repo, {}), ['R', 'A', 'P-new', 'C', 'P-old', 'S'], 'no sort keeps newest first');
  });
});

test('staffIds keeps only those people, and an empty list keeps nobody', async t => {
  await withTempDb(t, 'req_inbox_staff', async db => {
    await seed(db, ROWS);
    const repo = new RequestsRepository(db);
    assert.deepEqual(await titles(repo, { staffIds: ['u-linh'], sort: 'inbox' }), ['P-new', 'R']);
    assert.equal(await repo.count({ staffIds: ['u-linh'] }), 2);
    assert.deepEqual(await titles(repo, { staffIds: [] }), []);
    assert.equal(await repo.count({ staffIds: [] }), 0);
    assert.deepEqual(await titles(repo, { staffIds: ['u-linh'], employeeIds: ['u-ha'] }), [], 'both scopes must hold');
  });
});

test('excludeTypes hides those types from the list and the count', async t => {
  await withTempDb(t, 'req_inbox_exclude', async db => {
    await seed(db, ROWS);
    const repo = new RequestsRepository(db);
    assert.ok(!(await titles(repo, { excludeTypes: ['ISAT'] })).includes('S'));
    assert.equal(await repo.count({ excludeTypes: ['ISAT'] }), 5);
    assert.equal(await repo.count({}), 6);
  });
});

test('countGroups groups by status and type with the oldest creation time, outside the status and type picked', async t => {
  await withTempDb(t, 'req_inbox_counts', async db => {
    await seed(db, ROWS);
    const repo = new RequestsRepository(db);
    const groups = await repo.countGroups({ excludeTypes: ['ISAT'] });
    const key = (g: { status: string; type: string }) => `${g.status}:${g.type}`;
    assert.deepEqual(
      groups.map(g => [key(g), g.total]).sort(),
      [
        ['APPROVED:ADVANCE', 1],
        ['CANCELLED:EXPLANATION', 1],
        ['PENDING:LEAVE', 1],
        ['PENDING:OVERTIME', 1],
        ['REJECTED:LEAVE', 1]
      ]
    );
    const oldest = groups.find(g => key(g) === 'PENDING:LEAVE')!.oldest;
    assert.equal(oldest?.toISOString(), '2026-10-15T01:00:00.000Z');

    const linhOnly = await repo.countGroups({ excludeTypes: ['ISAT'], staffIds: ['u-linh'] });
    assert.deepEqual(linhOnly.map(g => [key(g), g.total]).sort(), [['PENDING:OVERTIME', 1], ['REJECTED:LEAVE', 1]]);
    assert.deepEqual(await repo.countGroups({ staffIds: [] }), []);
  });
});
