// position.save / level.save ghi nhật ký trong cùng transaction với chức vụ và bậc (spec audit-log mục 6).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Kysely } from 'kysely';
import type { DB } from '../../src/database/schema';
import type { AuditLog } from '../../src/modules/audit/audit-log';
import { PositionStaleError } from '../../src/modules/positions/positions.errors';
import { PositionsRepository } from '../../src/modules/positions/positions.repository';
import { PositionsService } from '../../src/modules/positions/positions.service';
import { auditKit } from './helpers/audit-pg';
import { withTempDb } from './helpers/pg-temp-db';

const NOW = new Date('2026-11-05T03:00:00.000Z');

function setup(db: Kysely<DB>) {
  const kit = auditKit(db);
  const make = (log: AuditLog) => new PositionsService(new PositionsRepository(), kit.tx, log);
  return { ...kit, svc: make(kit.log), failing: make(kit.failingLog) };
}

const countOf = async (db: Kysely<DB>, table: 'position_types' | 'position_levels') =>
  Number((await db.selectFrom(table).select(eb => eb.fn.countAll().as('n')).executeTakeFirstOrThrow()).n);

test('position.save writes one row per position that changed, with only the changed cells', async t => {
  await withTempDb(t, 'audit_positions', async db => {
    const { svc, rows, verify } = setup(db);
    await svc.savePositions(
      {
        effectiveMonth: '2026-12',
        reason: 'Theo quyết định 11/2026',
        items: [
          { code: 'nv', expectedRev: 0, changes: { flexPct: 22, travelPct: 15, benefits: { makeup: false } } },
          { code: 'ctv', expectedRev: 0, changes: { flexPct: 12 } },
          { code: 'tts', expectedRev: 0, changes: { flexPct: 10 } }
        ]
      },
      'admin',
      NOW
    );

    const written = await rows();
    assert.deepEqual(
      written.map(r => ({ ...r, requestId: undefined })),
      [
        {
          actor: 'admin',
          action: 'position.save',
          entityKind: 'position',
          entityId: 'nv',
          subject: null,
          month: '2026-12',
          before: { flexPct: 20, 'benefit.makeup': true },
          after: { flexPct: 22, 'benefit.makeup': false },
          reason: 'Theo quyết định 11/2026',
          sensitivity: 'pay',
          requestId: undefined
        },
        {
          actor: 'admin',
          action: 'position.save',
          entityKind: 'position',
          entityId: 'ctv',
          subject: null,
          month: '2026-12',
          before: { flexPct: 10 },
          after: { flexPct: 12 },
          reason: 'Theo quyết định 11/2026',
          sensitivity: 'pay',
          requestId: undefined
        }
      ]
    );
    assert.match(String(written[0].requestId), /^[0-9a-f-]{36}$/);
    assert.equal(written[1].requestId, written[0].requestId);
    assert.deepEqual(await verify(), { ok: true, checked: 2, firstBadId: null, reason: null });
  });
});

test('a save that changes nothing, or is stale, writes no row', async t => {
  await withTempDb(t, 'audit_positions', async db => {
    const { svc, rows } = setup(db);
    await svc.savePositions({ effectiveMonth: '2026-11', items: [{ code: 'nv', expectedRev: 0, changes: { flexPct: 20 } }] }, 'admin', NOW);
    await svc.saveLevel('nv', '2', { effectiveMonth: '2026-11', expectedRev: 0, changes: { kpiMax: 6_500_000 } }, 'admin', NOW);
    await assert.rejects(
      svc.savePositions({ effectiveMonth: '2026-11', items: [{ code: 'nv', expectedRev: 7, changes: { flexPct: 30 } }] }, 'admin', NOW),
      PositionStaleError
    );
    assert.equal((await rows()).length, 0);
  });
});

test('level.save records an edited level with its old and new cells', async t => {
  await withTempDb(t, 'audit_positions', async db => {
    const { svc, rows } = setup(db);
    await svc.saveLevel(
      'nv',
      '2',
      { effectiveMonth: '2026-11', expectedRev: 0, reason: 'Tăng KPI', changes: { kpiMax: 6_800_000, baseSalary: 6_500_000 } },
      'hr',
      NOW
    );

    const [row] = await rows();
    assert.deepEqual({ ...row, requestId: undefined }, {
      actor: 'hr',
      action: 'level.save',
      entityKind: 'level',
      entityId: 'nv:2',
      subject: null,
      month: '2026-11',
      before: { kpiMax: 6_500_000 },
      after: { kpiMax: 6_800_000 },
      reason: 'Tăng KPI',
      sensitivity: 'pay',
      requestId: undefined
    });
  });
});

test('level.save records a new level with all its cells', async t => {
  await withTempDb(t, 'audit_positions', async db => {
    const { svc, rows } = setup(db);
    await svc.addLevel(
      'nv',
      { effectiveMonth: '2026-11', level: 5, values: { name: 'Principal', baseSalary: 8_000_000, kpiMax: 8_000_000, nightPct: null } },
      'admin',
      NOW
    );

    const [row] = await rows();
    assert.deepEqual({ ...row, requestId: undefined }, {
      actor: 'admin',
      action: 'level.save',
      entityKind: 'level',
      entityId: 'nv:5',
      subject: null,
      month: '2026-11',
      before: null,
      after: { name: 'Principal', baseSalary: 8_000_000, kpiMax: 8_000_000, nightPct: null },
      reason: null,
      sensitivity: 'pay',
      requestId: undefined
    });
  });
});

test('when the audit write fails, the position and level changes are rolled back with it', async t => {
  await withTempDb(t, 'audit_positions', async db => {
    const { failing, rows } = setup(db);
    const types = await countOf(db, 'position_types');
    const levels = await countOf(db, 'position_levels');

    await assert.rejects(
      failing.savePositions({ effectiveMonth: '2026-12', items: [{ code: 'nv', expectedRev: 0, changes: { flexPct: 22 } }] }, 'admin', NOW),
      /audit boom/
    );
    await assert.rejects(
      failing.saveLevel('nv', '2', { effectiveMonth: '2026-12', expectedRev: 0, changes: { kpiMax: 6_800_000 } }, 'admin', NOW),
      /audit boom/
    );
    await assert.rejects(
      failing.addLevel('nv', { effectiveMonth: '2026-11', level: 5, values: { name: 'P', baseSalary: 1, kpiMax: null, nightPct: null } }, 'admin', NOW),
      /audit boom/
    );

    assert.equal(await countOf(db, 'position_types'), types);
    assert.equal(await countOf(db, 'position_levels'), levels);
    assert.equal((await rows()).length, 0);
  });
});

test('a failed audit write also rolls back an in-place edit of an existing month version', async t => {
  await withTempDb(t, 'audit_positions', async db => {
    const { svc, failing, rows } = setup(db);
    // Tạo sẵn phiên bản tháng 12, để lần lưu sau sửa tại chỗ (mode 'update') thay vì chép dòng mới.
    await svc.savePositions({ effectiveMonth: '2026-12', items: [{ code: 'nv', expectedRev: 0, changes: { flexPct: 22 } }] }, 'admin', NOW);
    await svc.saveLevel('nv', '2', { effectiveMonth: '2026-12', expectedRev: 0, changes: { kpiMax: 6_800_000 } }, 'admin', NOW);
    const nvDec = async () =>
      (await db.selectFrom('position_types').select(['flex_pct', 'rev']).where('code', '=', 'nv').where('effective_month', '=', '2026-12').executeTakeFirstOrThrow());
    const lvDec = async () =>
      (await db.selectFrom('position_levels').select(['kpi_max', 'rev']).where('type_code', '=', 'nv').where('level_no', '=', 2).where('effective_month', '=', '2026-12').executeTakeFirstOrThrow());
    const typeBefore = await nvDec();
    const levelBefore = await lvDec();

    await assert.rejects(
      failing.savePositions({ effectiveMonth: '2026-12', items: [{ code: 'nv', expectedRev: Number(typeBefore.rev), changes: { flexPct: 25 } }] }, 'admin', NOW),
      /audit boom/
    );
    await assert.rejects(
      failing.saveLevel('nv', '2', { effectiveMonth: '2026-12', expectedRev: Number(levelBefore.rev), changes: { kpiMax: 7_000_000 } }, 'admin', NOW),
      /audit boom/
    );

    assert.deepEqual(await nvDec(), typeBefore);
    assert.deepEqual(await lvDec(), levelBefore);
    assert.equal((await rows()).length, 2);
  });
});
