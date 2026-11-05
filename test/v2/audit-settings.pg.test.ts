// param.set / setting.set ghi nhật ký trong cùng transaction với kho cài đặt (spec audit-log mục 6; người dùng chốt
// 2026-11-05: hai mã, không dùng settings.save; vùng chấm công ghi cả toạ độ).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Kysely } from 'kysely';
import type { DB } from '../../src/database/schema';
import type { AuditLog } from '../../src/modules/audit/audit-log';
import { SettingsReader } from '../../src/modules/settings/settings-reader';
import { SettingsStaleError } from '../../src/modules/settings/settings.errors';
import { SettingsRepository } from '../../src/modules/settings/settings.repository';
import { SettingsService } from '../../src/modules/settings/settings.service';
import { auditKit } from './helpers/audit-pg';
import { withTempDb } from './helpers/pg-temp-db';

const NOW = new Date('2026-11-05T03:00:00.000Z');

async function setup(db: Kysely<DB>) {
  await db.insertInto('staff').values({ username: 'binh', name: 'Bình', type: 'nv', uuid: 'u-binh', pass_hash: 'x', created_at: '2026-11-05' }).execute();
  const kit = auditKit(db);
  const repo = new SettingsRepository(db);
  const make = (log: AuditLog) => new SettingsService(repo, new SettingsReader(repo), kit.tx, log);
  return { ...kit, repo, svc: make(kit.log), failing: make(kit.failingLog) };
}

const plain = (r: { requestId: unknown }) => ({ ...r, requestId: undefined });

test('param.set writes one row per group save, with only the cells that changed', async t => {
  await withTempDb(t, 'audit_settings', async db => {
    const { svc, rows, verify } = await setup(db);
    // weekendRate gửi lên nhưng không đổi (2 → 2): không vào nhật ký.
    await svc.saveGroup(
      'overtime',
      { effectiveMonth: '2026-12', values: { weekdayRate: 1.8, weekendRate: 2 }, reason: 'Theo quyết định 11/2026', stamp: 0 },
      'admin',
      NOW
    );
    await svc.saveGroup('kpi-weights', { effectiveMonth: '2026-12', values: { wework: 35, user: 29, peer: 18, manager: 12, self: 6 }, stamp: 0 }, 'hr', NOW);

    const written = await rows();
    assert.deepEqual(written.map(plain), [
      {
        actor: 'admin',
        action: 'param.set',
        entityKind: 'param',
        entityId: 'overtime',
        subject: null,
        month: '2026-12',
        before: { weekdayRate: 1.5 },
        after: { weekdayRate: 1.8 },
        reason: 'Theo quyết định 11/2026',
        sensitivity: 'pay',
        requestId: undefined
      },
      {
        actor: 'hr',
        action: 'param.set',
        entityKind: 'param',
        entityId: 'kpi-weights',
        subject: null,
        month: '2026-12',
        before: { wework: 40, user: 24 },
        after: { wework: 35, user: 29 },
        reason: null,
        sensitivity: 'pay',
        requestId: undefined
      }
    ]);
    assert.match(String(written[0].requestId), /^[0-9a-f-]{36}$/);
    assert.deepEqual(await verify(), { ok: true, checked: 2, firstBadId: null, reason: null });
  });
});

test('setting.set records a personal work week as the effective week before and after', async t => {
  await withTempDb(t, 'audit_settings', async db => {
    const { svc, rows } = await setup(db);
    const typeWeek = (await svc.getWorkWeek('binh', '2026-12', NOW)).weekdays;
    await svc.saveWorkWeek('binh', { weekdays: [1, 2, 3, 4, 5], effectiveMonth: '2026-12', reason: 'Nghỉ Thứ Bảy', stamp: 0 }, 'hr', NOW);

    assert.deepEqual((await rows()).map(plain), [
      {
        actor: 'hr',
        action: 'setting.set',
        entityKind: 'work-week',
        entityId: 'binh',
        subject: 'binh',
        month: '2026-12',
        before: { weekdays: typeWeek, source: 'type' },
        after: { weekdays: [1, 2, 3, 4, 5], source: 'own' },
        reason: 'Nghỉ Thứ Bảy',
        sensitivity: 'pay',
        requestId: undefined
      }
    ]);
  });
});

test('setting.set records the attendance zone with its centre and radius', async t => {
  await withTempDb(t, 'audit_settings', async db => {
    const { svc, rows } = await setup(db);
    await svc.saveZone({ lat: 10.7769, lng: 106.7009, radiusM: 150, stamp: 0 }, 'admin', NOW);
    const { stamp } = await svc.getZone();
    await svc.saveZone({ lat: 10.8, lng: 106.65, radiusM: 200, reason: 'Dời văn phòng', stamp }, 'admin', NOW);

    const zoneRow = (before: unknown, after: unknown, reason: string | null) => ({
      actor: 'admin',
      action: 'setting.set',
      entityKind: 'setting',
      entityId: 'attendance-zone',
      subject: null,
      month: null,
      before,
      after,
      reason,
      sensitivity: 'normal',
      requestId: undefined
    });
    assert.deepEqual((await rows()).map(plain), [
      zoneRow(null, { lat: 10.7769, lng: 106.7009, radiusM: 150 }, null),
      zoneRow({ lat: 10.7769, lng: 106.7009, radiusM: 150 }, { lat: 10.8, lng: 106.65, radiusM: 200 }, 'Dời văn phòng')
    ]);
  });
});

test('a save that changes nothing, or is stale, writes no row', async t => {
  await withTempDb(t, 'audit_settings', async db => {
    const { svc, rows } = await setup(db);
    await svc.saveGroup('overtime', { effectiveMonth: '2026-12', values: { weekdayRate: 1.5 }, stamp: 0 }, 'admin', NOW);
    await assert.rejects(svc.saveGroup('overtime', { effectiveMonth: '2026-12', values: { weekdayRate: 1.9 }, stamp: 7 }, 'admin', NOW), SettingsStaleError);
    const typeWeek = (await svc.getWorkWeek('binh', '2026-12', NOW)).weekdays;
    await svc.saveWorkWeek('binh', { weekdays: null, effectiveMonth: '2026-12', stamp: 0 }, 'hr', NOW);
    assert.ok(typeWeek.length > 0);
    await svc.saveZone({ lat: 10.7769, lng: 106.7009, radiusM: 150, stamp: 0 }, 'admin', NOW);
    const { stamp } = await svc.getZone();
    await svc.saveZone({ lat: 10.7769, lng: 106.7009, radiusM: 150, stamp }, 'admin', NOW);

    assert.deepEqual((await rows()).map(r => r.entityId), ['attendance-zone']);
  });
});

test('when the audit write fails, the settings change is rolled back with it', async t => {
  await withTempDb(t, 'audit_settings', async db => {
    const { failing, repo, rows } = await setup(db);
    await assert.rejects(failing.saveGroup('overtime', { effectiveMonth: '2026-12', values: { weekdayRate: 1.8 }, stamp: 0 }, 'admin', NOW), /audit boom/);
    await assert.rejects(failing.saveWorkWeek('binh', { weekdays: [1, 2, 3, 4, 5], effectiveMonth: '2026-12', stamp: 0 }, 'hr', NOW), /audit boom/);
    await assert.rejects(failing.saveZone({ lat: 10.7769, lng: 106.7009, radiusM: 150, stamp: 0 }, 'admin', NOW), /audit boom/);

    assert.equal((await repo.groupChain(db, 'overtime')).length, 1);
    assert.deepEqual(await repo.workWeekChain(db, 'u-binh'), []);
    assert.equal(await repo.zone(db), null);
    assert.equal(await repo.maxChangeId(db), 0);
    assert.equal((await rows()).length, 0);
  });
});
