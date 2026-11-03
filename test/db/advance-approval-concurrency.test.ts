'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PostgresDatabase } = require('../../src/data/postgres-database');
const { TemporaryPostgres } = require('../../scripts/dev/temporary-postgres');
const { AdvanceApprovalsRepository } = require('../../src/data');
const { AdvanceApprovals } = require('../../src/domain/advance/advance-approvals');
const pgBackup = require('../../src/ops/pg-backup');

const { testControlUrl: testUrl } = require('../helpers/postgres-control');
require('../helpers/require-isolated-database');
const store = require('../../src/platform/db');

before(async () => {
  await store.ready;
  for (const username of ['race_a', 'race_b', 'race_same', 'race_many_one', 'race_many_two', 'race_rollback'])
    await store.db
      .prepare('INSERT INTO staff (username, name, pass_hash, created_at) VALUES (?, ?, ?, ?)')
      .run(username, username, 'fake-hash', '2026-11-02T00:00:00.000Z');
});

after(async () => store.db.close());

function service(repository: any, lock = (key: string) => store.lock(key)) {
  return new AdvanceApprovals({
    repository,
    transaction: (write: () => Promise<unknown>) => store.transaction(write),
    lock,
    clock: () => '2026-11-02T00:00:00.000Z'
  });
}

function deferred<T>() {
  let resolve: (value: T) => void;
  const promise = new Promise<T>(done => (resolve = done));
  return { promise, resolve: (value: T) => resolve(value) };
}

async function waitForAdvisoryLock(pid: number) {
  for (let attempt = 0; attempt < 150; attempt++) {
    const row = await store.db
      .prepare(
        "SELECT EXISTS (SELECT 1 FROM pg_locks WHERE pid = ? AND locktype = 'advisory' AND NOT granted) AS waiting"
      )
      .get(pid);
    if (row.waiting) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error('the second PostgreSQL connection did not wait for the month lock');
}

test('two independent connections preserve both requests and advance the month revision', async () => {
  const firstRead = deferred<void>();
  const releaseFirst = deferred<void>();
  const secondPid = deferred<number>();
  const firstRepository = new AdvanceApprovalsRepository(store.queryBuilder);
  const secondRepository = new AdvanceApprovalsRepository(store.queryBuilder);
  const read = firstRepository.read.bind(firstRepository);
  let paused = false;
  firstRepository.read = async month => {
    const result = await read(month);
    if (!paused) {
      paused = true;
      firstRead.resolve();
      await releaseFirst.promise;
    }
    return result;
  };
  const first = service(firstRepository);
  const second = service(secondRepository, async key => {
    const row = await store.db.prepare('SELECT pg_backend_pid() AS pid').get();
    secondPid.resolve(row.pid);
    await store.lock(key);
  });
  let firstMove: Promise<any> | undefined;
  let secondMove: Promise<any> | undefined;
  try {
    firstMove = first.move('2026-11', 'race_a', 'request', { by: 'race_a', expectedRev: 0 });
    await Promise.race([
      firstRead.promise,
      firstMove.then(() => {
        throw new Error('first write did not pause');
      })
    ]);
    secondMove = second.move('2026-11', 'race_b', 'request', { by: 'race_b', expectedRev: 0 });
    await waitForAdvisoryLock(await secondPid.promise);
    releaseFirst.resolve();
    const changes = await Promise.all([firstMove, secondMove]);
    assert.deepEqual(
      changes.map(change => change.after.status),
      ['pending', 'pending']
    );
    const result = await second.read('2026-11');
    assert.equal(result.rev, 2);
    assert.deepEqual(Object.keys(result.users), ['race_a', 'race_b']);
    assert.equal(result.users.race_a.requestedAt, '2026-11-02T00:00:00.000Z');
    assert.equal(await store.getSetting('advance_approvals_2026-11', null), null);
  } finally {
    releaseFirst.resolve();
    await Promise.allSettled([firstMove, secondMove].filter(Boolean));
  }
});

test('concurrent changes for the same person with the same expected revision conflict', async () => {
  const approvals = service(new AdvanceApprovalsRepository(store.queryBuilder));
  const results = await Promise.allSettled([
    approvals.move('2026-12', 'race_same', 'request', { by: 'race_same', expectedRev: 0 }),
    approvals.move('2026-12', 'race_same', 'request', { by: 'race_same', expectedRev: 0 })
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const rejected = results.find(result => result.status === 'rejected') as PromiseRejectedResult;
  assert.equal(rejected.reason.code, 'ADVANCE_REQUEST_STALE');
  assert.equal((await approvals.read('2026-12')).rev, 1);
  assert.equal((await approvals.entryOf('2026-12', 'race_same')).rev, 1);
});

test('bulk approval checks the month revision and does not write when nothing changes', async () => {
  const approvals = service(new AdvanceApprovalsRepository(store.queryBuilder));
  assert.deepEqual(await approvals.approveMany('2027-01', [], { by: 'admin', expectedRev: 0 }), []);
  assert.equal(
    await store.db.prepare('SELECT 1 FROM advance_approval_months WHERE month = ?').get('2027-01'),
    undefined
  );
  await approvals.move('2027-01', 'race_many_one', 'request', { by: 'race_many_one' });
  await approvals.move('2027-01', 'race_many_two', 'request', { by: 'race_many_two' });
  await approvals.move('2027-01', 'race_many_two', 'withdraw', { by: 'race_many_two' });
  await assert.rejects(
    () => approvals.approveMany('2027-01', ['race_many_one'], { by: 'admin', expectedRev: 2 }),
    (error: any) => error.code === 'ADVANCE_REQUESTS_STALE'
  );
  const done = await approvals.approveMany('2027-01', ['race_many_one'], { by: 'admin', expectedRev: 3 });
  assert.equal(done.length, 1);
  assert.equal((await approvals.read('2027-01')).rev, 4);
  assert.equal((await approvals.entryOf('2027-01', 'race_many_two')).status, null);
  assert.equal((await approvals.entryOf('2027-01', 'race_many_two')).rev, 2);
});

test('a bulk approval racing a withdrawal waits and rejects the stale month revision', async () => {
  const seed = service(new AdvanceApprovalsRepository(store.queryBuilder));
  await seed.move('2027-04', 'race_a', 'request', { by: 'race_a' });
  await seed.move('2027-04', 'race_b', 'request', { by: 'race_b' });
  const firstRead = deferred<void>();
  const releaseFirst = deferred<void>();
  const secondPid = deferred<number>();
  const firstRepository = new AdvanceApprovalsRepository(store.queryBuilder);
  const read = firstRepository.read.bind(firstRepository);
  let paused = false;
  firstRepository.read = async month => {
    const result = await read(month);
    if (!paused) {
      paused = true;
      firstRead.resolve();
      await releaseFirst.promise;
    }
    return result;
  };
  const withdrawing = service(firstRepository);
  const bulk = service(new AdvanceApprovalsRepository(store.queryBuilder), async key => {
    const row = await store.db.prepare('SELECT pg_backend_pid() AS pid').get();
    secondPid.resolve(row.pid);
    await store.lock(key);
  });
  let withdrawal: Promise<any> | undefined;
  let approval: Promise<any> | undefined;
  try {
    withdrawal = withdrawing.move('2027-04', 'race_a', 'withdraw', { by: 'race_a', expectedRev: 1 });
    await Promise.race([
      firstRead.promise,
      withdrawal.then(() => {
        throw new Error('withdrawal did not pause');
      })
    ]);
    approval = bulk.approveMany('2027-04', ['race_a', 'race_b'], { by: 'admin', expectedRev: 2 });
    await waitForAdvisoryLock(await secondPid.promise);
    releaseFirst.resolve();
    await withdrawal;
    await assert.rejects(approval, (error: any) => error.code === 'ADVANCE_REQUESTS_STALE');
    const result = await bulk.read('2027-04');
    assert.equal(result.rev, 3);
    assert.equal(result.users.race_a.status, null);
    assert.equal(result.users.race_b.status, 'pending');
  } finally {
    releaseFirst.resolve();
    await Promise.allSettled([withdrawal, approval].filter(Boolean));
  }
});

test('an outer transaction rollback removes both the request and month revision', async () => {
  const approvals = service(new AdvanceApprovalsRepository(store.queryBuilder));
  await assert.rejects(
    () =>
      store.transaction(async () => {
        await approvals.move('2027-02', 'race_rollback', 'request', { by: 'race_rollback' });
        await store.audit.write({
          actor: 'race_rollback',
          action: 'advance.rollback-test',
          entityKind: 'advance_request',
          entityId: '2027-02/race_rollback',
          sensitivity: 'pay'
        });
        throw new Error('rollback requested');
      }),
    /rollback requested/
  );
  assert.equal((await approvals.read('2027-02')).rev, 0);
  assert.equal((await approvals.entryOf('2027-02', 'race_rollback')).status, null);
  assert.equal(
    await store.db.prepare('SELECT 1 FROM advance_approval_entries WHERE month = ?').get('2027-02'),
    undefined
  );
  assert.equal(
    await store.db.prepare("SELECT 1 FROM audit_log WHERE action = 'advance.rollback-test'").get(),
    undefined
  );
});

test('withdrawal and a new request retain the first insertion order and increment revisions', async () => {
  const approvals = service(new AdvanceApprovalsRepository(store.queryBuilder));
  await approvals.move('2027-03', 'race_a', 'request', { by: 'race_a' });
  await approvals.move('2027-03', 'race_b', 'request', { by: 'race_b' });
  await approvals.move('2027-03', 'race_a', 'withdraw', { by: 'race_a' });
  assert.deepEqual(
    [...(await approvals.requests('2027-03'))].map(([username]) => username),
    ['race_b']
  );
  await approvals.move('2027-03', 'race_a', 'request', { by: 'race_a', expectedRev: 2 });
  assert.deepEqual(
    [...(await approvals.requests('2027-03'))].map(([username]) => username),
    ['race_a', 'race_b']
  );
  assert.equal((await approvals.entryOf('2027-03', 'race_a')).rev, 3);
  assert.equal((await approvals.read('2027-03')).rev, 4);
});

test('database constraints reject invalid states and unknown staff', async () => {
  await assert.rejects(
    () =>
      store.db
        .prepare(
          'INSERT INTO advance_approval_entries (month, username, status, rev, requested_at, requested_by) VALUES (?, ?, ?, ?, ?, ?)'
        )
        .run('2027-03', 'race_same', 'invalid', 1, '2026-11-02T00:00:00.000Z', 'race_same'),
    (error: any) => error.code === '23514'
  );
  await assert.rejects(
    () =>
      store.db
        .prepare(
          'INSERT INTO advance_approval_entries (month, username, status, rev, requested_at, requested_by) VALUES (?, ?, ?, ?, ?, ?)'
        )
        .run('2027-03', 'no_such_person', 'pending', 1, '2026-11-02T00:00:00.000Z', 'no_such_person'),
    (error: any) => error.code === '23503'
  );
});

test('backup and restore preserve normalized requests, revisions and timestamps on PostgreSQL', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'advance-backup-test-'));
  try {
    await TemporaryPostgres.using(testUrl, 'test', async temporary => {
      const target = new PostgresDatabase({ url: temporary.url, max: 1 });
      try {
        await target.ready;
        const backup = await pgBackup.backup(store.db, directory);
        const report = await pgBackup.verifyFile(backup.file);
        assert.equal(report.ok, true, report.problems.join('; '));
        await pgBackup.restore(backup.file, target);
        const readRows = db =>
          db
            .prepare(
              'SELECT month, username, status, rev, requested_at, requested_by, decided_at, decided_by, reason FROM advance_approval_entries ORDER BY id'
            )
            .all();
        assert.deepEqual(await readRows(target), await readRows(store.db));
        assert.deepEqual(
          await target.prepare('SELECT month, rev FROM advance_approval_months ORDER BY month').all(),
          await store.db.prepare('SELECT month, rev FROM advance_approval_months ORDER BY month').all()
        );
      } finally {
        await target.close();
      }
    });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
