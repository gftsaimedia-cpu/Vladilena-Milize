import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TransactionCoordinator } from '../../src/database/transaction';
import { AuditLog } from '../../src/modules/audit/audit-log';
import { AuditRepository } from '../../src/modules/audit/audit.repository';
import { AuditService } from '../../src/modules/audit/audit.service';
import { hashOf, type StoredAuditRow } from '../../src/modules/audit/domain/audit-chain';
import { AuditEntryError } from '../../src/modules/audit/domain/audit-entry';
import type { Kysely } from 'kysely';
import type { Client } from 'pg';
import type { DB } from '../../src/database/schema';
import { withTempDb } from './helpers/pg-temp-db';

const ENTRY = { actor: 'admin', action: 'param.set', entityKind: 'param', entityId: 'ot.rate' };

test('appends three rows that chain', async t => {
  await withTempDb(t, 'audit_log', async (db, client) => {
    const tx = new TransactionCoordinator(db);
    const log = new AuditLog(new AuditRepository(), tx);
    const times = ['2026-11-05T01:00:00.000Z', '2026-11-05T02:00:00.000Z', '2026-11-05T03:00:00.000Z'];
    let n = 0;
    log.now = () => new Date(times[n++]);

    const ids: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      const out = await tx.run(trx => log.append(trx, ENTRY));
      ids.push(out.id);
    }
    assert.deepEqual(ids, [1, 2, 3]);

    const rows = (await client.query('SELECT * FROM audit_log ORDER BY id')).rows as StoredAuditRow[];
    assert.equal(rows.length, 3);
    assert.equal(rows[0].prev_hash, '');
    assert.equal(rows[1].prev_hash, rows[0].hash);
    assert.equal(rows[2].prev_hash, rows[1].hash);
    rows.forEach((row, i) => {
      assert.equal(row.hash, hashOf(row));
      assert.equal(row.at, times[i]);
    });
  });
});

test('keeps Vietnamese text and odd key order intact', async t => {
  await withTempDb(t, 'audit_log', async (db, client) => {
    const tx = new TransactionCoordinator(db);
    const log = new AuditLog(new AuditRepository(), tx);
    await tx.run(trx =>
      log.append(trx, { ...ENTRY, reason: 'Theo quyết định số 12 — tháng 11', before: { b: 1, a: 2 } })
    );
    const row = (await client.query('SELECT * FROM audit_log ORDER BY id')).rows[0] as StoredAuditRow;
    assert.equal(row.before_json, '{"b":1,"a":2}');
    assert.equal(row.reason, 'Theo quyết định số 12 — tháng 11');
    assert.equal(row.hash, hashOf(row));
  });
});

test('rolls back with the caller', async t => {
  await withTempDb(t, 'audit_log', async (db, client) => {
    const tx = new TransactionCoordinator(db);
    const log = new AuditLog(new AuditRepository(), tx);
    await assert.rejects(
      tx.run(async trx => {
        await log.append(trx, ENTRY);
        throw new Error('boom');
      }),
      /boom/
    );
    assert.equal((await client.query('SELECT count(*)::int AS n FROM audit_log')).rows[0].n, 0);

    const out = await tx.run(trx => log.append(trx, ENTRY));
    assert.equal(out.id, 1);
    const row = (await client.query('SELECT * FROM audit_log')).rows[0];
    assert.equal(row.prev_hash, '');
  });
});

test('serialises two writers with the advisory lock', async t => {
  await withTempDb(t, 'audit_log', async (db, client) => {
    const tx = new TransactionCoordinator(db);
    const log = new AuditLog(new AuditRepository(), tx);
    let releaseA: () => void = () => {};
    const gate = new Promise<void>(resolve => {
      releaseA = resolve;
    });
    let aAppended: () => void = () => {};
    const aReady = new Promise<void>(resolve => {
      aAppended = resolve;
    });
    let bDone = false;

    const a = tx.run(async trx => {
      const out = await log.append(trx, ENTRY);
      aAppended();
      await gate;
      return out;
    });
    try {
      await aReady;
      const b = tx.run(trx => log.append(trx, { ...ENTRY, entityId: 'ot.cap' })).then(out => {
        bDone = true;
        return out;
      });
      await new Promise(resolve => setTimeout(resolve, 150));
      assert.equal(bDone, false);
      releaseA();
      const [outA, outB] = await Promise.all([a, b]);
      assert.deepEqual([outA.id, outB.id], [1, 2]);
      const rows = (await client.query('SELECT * FROM audit_log ORDER BY id')).rows as StoredAuditRow[];
      assert.equal(rows[1].prev_hash, rows[0].hash);
    } finally {
      releaseA();
      await a.catch(() => undefined);
    }
  });
});

test('refuses a bad entry before touching the table', async t => {
  await withTempDb(t, 'audit_log', async (db, client) => {
    const tx = new TransactionCoordinator(db);
    const log = new AuditLog(new AuditRepository(), tx);
    await assert.rejects(
      tx.run(trx => log.append(trx, { ...ENTRY, actor: '' })),
      AuditEntryError
    );
    assert.equal((await client.query('SELECT count(*)::int AS n FROM audit_log')).rows[0].n, 0);
  });
});

async function seedStaff(client: Client): Promise<void> {
  await client.query(`INSERT INTO staff (username, name, pass_hash, created_at)
    VALUES ('admin', 'Nguyễn Văn A', 'x', '2026-01-01T00:00:00.000Z'),
           ('hr', 'Lê Thị B', 'x', '2026-01-01T00:00:00.000Z')`);
}

const SEED_ROWS: Array<{ at: string; actor: string; action: string; after?: unknown }> = [
  { at: '2026-11-04T16:59:59.999Z', actor: 'admin', action: 'param.set' },
  { at: '2026-11-04T17:00:00.000Z', actor: 'admin', action: 'param.set' },
  { at: '2026-11-05T09:00:00.000Z', actor: 'hr', action: 'request.decide', after: { status: 'APPROVED' } },
  { at: '2026-11-05T16:59:59.999Z', actor: 'system', action: 'period.lock' },
  { at: '2026-11-05T17:00:00.000Z', actor: 'admin', action: 'holiday.add' }
];

async function seedAudit(db: Kysely<DB>, client: Client, rows = SEED_ROWS) {
  await seedStaff(client);
  const tx = new TransactionCoordinator(db);
  const log = new AuditLog(new AuditRepository(), tx);
  const out: Array<{ id: number; hash: string }> = [];
  for (const { at, ...rest } of rows) {
    log.now = () => new Date(at);
    out.push(await tx.run(trx => log.append(trx, { ...ENTRY, ...rest })));
  }
  return { service: new AuditService(db, new AuditRepository()), out };
}

const ids = (r: { items: Array<{ id: number }> }) => r.items.map(i => i.id);

test('lists newest first with names and parsed JSON', async t => {
  await withTempDb(t, 'audit_log', async (db, client) => {
    const { service } = await seedAudit(db, client);
    const r = await service.list({});
    assert.equal(r.total, 5);
    assert.equal(r.limit, 25);
    assert.equal(r.offset, 0);
    assert.deepEqual(ids(r), [5, 4, 3, 2, 1]);
    assert.deepEqual(r.items.find(i => i.id === 3), {
      id: 3,
      at: '2026-11-05T09:00:00.000Z',
      actor: 'hr',
      actorName: 'Lê Thị B',
      action: 'request.decide',
      entityKind: 'param',
      entityId: 'ot.rate',
      subject: null,
      month: null,
      before: null,
      after: { status: 'APPROVED' },
      reason: null,
      sensitivity: 'normal',
      requestId: null
    });
    assert.equal(r.items.find(i => i.id === 4)?.actorName, null);
    for (const item of r.items) assert.equal('hash' in item, false);
  });
});

test('filters by Vietnam-time days', async t => {
  await withTempDb(t, 'audit_log', async (db, client) => {
    const { service } = await seedAudit(db, client);
    const day = await service.list({ from: '2026-11-05', to: '2026-11-05' });
    assert.deepEqual(ids(day), [4, 3, 2]);
    assert.equal(day.total, 3);
    assert.deepEqual(ids(await service.list({ to: '2026-11-04' })), [1]);
    assert.deepEqual(ids(await service.list({ from: '2026-11-06' })), [5]);
  });
});

test('filters by actor and action and pages', async t => {
  await withTempDb(t, 'audit_log', async (db, client) => {
    const { service } = await seedAudit(db, client);
    assert.equal((await service.list({ actor: 'admin' })).total, 3);
    const page = await service.list({ action: 'param.set', limit: '1', offset: '1' });
    assert.deepEqual(ids(page), [1]);
    assert.equal(page.total, 2);
  });
});

test('keeps the dropdown values whatever the filter', async t => {
  await withTempDb(t, 'audit_log', async (db, client) => {
    const { service } = await seedAudit(db, client);
    const r = await service.list({ actor: 'nobody' });
    assert.deepEqual(r.items, []);
    assert.equal(r.total, 0);
    assert.deepEqual(r.people, [
      { username: 'hr', name: 'Lê Thị B' },
      { username: 'admin', name: 'Nguyễn Văn A' },
      { username: 'system', name: null }
    ]);
    assert.deepEqual(r.actions, ['holiday.add', 'param.set', 'period.lock', 'request.decide']);
  });
});

test('an offset past the end is just empty', async t => {
  await withTempDb(t, 'audit_log', async (db, client) => {
    const { service } = await seedAudit(db, client);
    const r = await service.list({ offset: '100' });
    assert.deepEqual(r.items, []);
    assert.equal(r.total, 5);
  });
});

test('verify walks the chain across pages', async t => {
  await withTempDb(t, 'audit_log', async (db, client) => {
    const { service } = await seedAudit(db, client);
    assert.deepEqual(await service.verify(2), { ok: true, checked: 5, firstBadId: null, reason: null });
  });
});

test('verify on an empty table is ok', async t => {
  await withTempDb(t, 'audit_log', async db => {
    const service = new AuditService(db, new AuditRepository());
    assert.deepEqual(await service.verify(), { ok: true, checked: 0, firstBadId: null, reason: null });
  });
});

test('verify reports a forged row', async t => {
  await withTempDb(t, 'audit_log', async (db, client) => {
    const { service, out } = await seedAudit(db, client, SEED_ROWS.slice(0, 3));
    await client.query(
      "INSERT INTO audit_log (id, at, actor, action, entity_kind, entity_id, sensitivity, prev_hash, hash) VALUES (4, '2026-11-05T05:00:00.000Z', 'mallory', 'param.set', 'param', 'x', 'normal', $1, 'sha256:deadbeef')",
      [out[2].hash]
    );
    assert.deepEqual(await service.verify(), { ok: false, checked: 3, firstBadId: 4, reason: 'HASH' });
  });
});
