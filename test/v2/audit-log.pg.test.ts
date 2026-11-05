import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TransactionCoordinator } from '../../src/database/transaction';
import { AuditLog } from '../../src/modules/audit/audit-log';
import { AuditRepository } from '../../src/modules/audit/audit.repository';
import { hashOf, type StoredAuditRow } from '../../src/modules/audit/domain/audit-chain';
import { AuditEntryError } from '../../src/modules/audit/domain/audit-entry';
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
