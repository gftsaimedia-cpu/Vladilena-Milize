import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sql, type Kysely } from 'kysely';
import type { DB } from '../../src/database/schema';
import { TransactionCoordinator } from '../../src/database/transaction';
import { defaultsOf, encodeValues } from '../../src/modules/settings/domain/setting-groups';
import { SettingsChanges } from '../../src/modules/settings/settings-changes';
import { SettingsReader } from '../../src/modules/settings/settings-reader';
import { SettingsStaleError, TypeWeekMissingError } from '../../src/modules/settings/settings.errors';
import { SettingsRepository, type ChangeRow } from '../../src/modules/settings/settings.repository';
import { SettingsService } from '../../src/modules/settings/settings.service';
import { AuditLog } from '../../src/modules/audit/audit-log';
import { AuditRepository } from '../../src/modules/audit/audit.repository';
import { withTempDb } from './helpers/pg-temp-db';

const META = { actor: 'admin', at: '2026-11-05T03:00:00.000Z' };

const change = (setting: string, subject: string | null): ChangeRow => ({
  setting,
  field: setting === 'work-week' ? 'weekdays' : 'weekdayRate',
  subject,
  effectiveMonth: '2026-12',
  oldJson: '1.5',
  newJson: '1.6',
  reason: null
});

async function seedStaff(db: Kysely<DB>) {
  for (const [username, type, uuid] of [
    ['nv-binh', 'nv', 'u-binh'],
    ['tts-ha', 'tts', 'u-ha']
  ]) {
    await db.insertInto('staff').values({ username, name: username, type, uuid, pass_hash: 'x', created_at: '2026-11-05' }).execute();
  }
}

test('reads the seeded snapshot', async t => {
  await withTempDb(t, 'settings_repo_seed', async db => {
    const reader = new SettingsReader(new SettingsRepository(db));
    assert.deepEqual(await reader.settingsFor('2026-11'), {
      overtime: { weekdayRate: 1.5, weekendRate: 2, holidayRate: 3 },
      attendance: { lateGraceMinutes: 15, diligenceLostFromDays: 3 },
      kpiWeights: { wework: 40, user: 24, peer: 18, manager: 12, self: 6 },
      insurance: { bhxhPct: 8, bhytPct: 1.5, bhtnPct: 1 },
      tax: {
        personalDeduction: 15500000,
        dependantDeduction: 6200000,
        shortContractPct: 10,
        shortContractThreshold: 5000000,
        brackets: [
          { upTo: 10000000, ratePct: 5 },
          { upTo: 30000000, ratePct: 10 },
          { upTo: 60000000, ratePct: 20 },
          { upTo: 100000000, ratePct: 30 },
          { upTo: null, ratePct: 35 }
        ]
      },
      payCalendar: { payDay: 10 }
    });
  });
});

test('picks the version in force for each month', async t => {
  await withTempDb(t, 'settings_repo_chain', async db => {
    const repo = new SettingsRepository(db);
    const reader = new SettingsReader(repo);
    await repo.writeGroupVersion(db, 'overtime', '2026-12', { weekdayRate: 1.6, weekendRate: 2, holidayRate: 3 }, META);
    await repo.writeGroupVersion(
      db,
      'tax',
      '2027-01',
      { ...encodeValues(defaultsOf('tax')), brackets: JSON.stringify([{ upTo: 20000000, ratePct: 10 }, { upTo: null, ratePct: 20 }]) },
      META
    );
    assert.equal((await reader.settingsFor('2026-11')).overtime.weekdayRate, 1.5);
    assert.equal((await reader.settingsFor('2026-12')).overtime.weekdayRate, 1.6);
    assert.equal((await reader.settingsFor('2027-05')).overtime.weekdayRate, 1.6);
    assert.equal((await reader.settingsFor('2026-12')).tax.brackets.length, 5);
    assert.deepEqual((await reader.settingsFor('2027-01')).tax.brackets, [
      { upTo: 20000000, ratePct: 10 },
      { upTo: null, ratePct: 20 }
    ]);

    // Ghi lại cùng tháng là upsert và xoá hẳn các bậc cũ của tháng đó.
    await repo.writeGroupVersion(
      db,
      'tax',
      '2027-01',
      { ...encodeValues(defaultsOf('tax')), personalDeduction: 16000000, brackets: JSON.stringify([{ upTo: null, ratePct: 7 }]) },
      META
    );
    const again = (await reader.settingsFor('2027-01')).tax;
    assert.equal(again.personalDeduction, 16000000);
    assert.deepEqual(again.brackets, [{ upTo: null, ratePct: 7 }]);
    assert.equal((await repo.groupChain(db, 'tax')).length, 2);
  });
});

test('work week falls back to the type and follows own versions', async t => {
  await withTempDb(t, 'settings_repo_week', async db => {
    const repo = new SettingsRepository(db);
    const reader = new SettingsReader(repo);
    await seedStaff(db);
    assert.deepEqual(await reader.workWeekOf('u-binh', '2026-12'), {
      weekdays: [1, 2, 3, 4, 5, 6],
      source: 'type',
      standardWorkdays: 26,
      from: null,
      typeWeekdays: [1, 2, 3, 4, 5, 6],
      typeStandardWorkdays: 26
    });
    await repo.writeWorkWeek(db, 'u-binh', '2026-12', '[1,2,3,4,5]', META);
    await repo.writeWorkWeek(db, 'u-binh', '2027-03', null, META);
    assert.deepEqual(await reader.workWeekOf('u-binh', '2026-12'), {
      weekdays: [1, 2, 3, 4, 5],
      source: 'own',
      standardWorkdays: 22,
      from: '2026-12',
      typeWeekdays: [1, 2, 3, 4, 5, 6],
      typeStandardWorkdays: 26
    });
    assert.equal((await reader.workWeekOf('u-binh', '2026-11')).source, 'type');
    assert.equal((await reader.workWeekOf('u-binh', '2027-02')).standardWorkdays, 22);
    assert.equal((await reader.workWeekOf('u-binh', '2027-03')).source, 'type');
    assert.deepEqual((await reader.workWeekOf('u-ha', '2026-12')).weekdays, [1, 2, 3, 4, 5]);
    assert.equal((await reader.workWeekOf('u-ha', '2026-12')).standardWorkdays, 22);

    await assert.rejects(reader.workWeekOf('no-such-uuid', '2026-12'));
    // Loại nhân sự không có dòng position_types (tài khoản quản trị đầu tiên, loại ql).
    await db.insertInto('staff').values({ username: 'admin', name: 'admin', type: 'ql', uuid: 'u-admin', pass_hash: 'x', created_at: '2026-11-05' }).execute();
    await assert.rejects(reader.workWeekOf('u-admin', '2026-12'), (e: unknown) => {
      assert.ok(e instanceof TypeWeekMissingError);
      assert.equal(e.typeCode, 'ql');
      assert.equal(e.month, '2026-12');
      return true;
    });
    // Loại chưa có phiên bản nào ở tháng đó (seed bắt đầu từ 2000-01).
    await assert.rejects(reader.workWeekOf('u-binh', '1999-12'));

    assert.deepEqual(await repo.staffByUsername(db, 'nv-binh'), { uuid: 'u-binh', username: 'nv-binh', type: 'nv' });
    assert.deepEqual(await repo.staffByUuid(db, 'u-ha'), { uuid: 'u-ha', username: 'tts-ha', type: 'tts' });
    assert.equal(await repo.staffByUsername(db, 'nobody'), null);
    assert.equal(await repo.staffByUuid(db, 'nobody'), null);
    assert.deepEqual(await repo.typeWeekAt(db, 'tts', '2026-12'), { weekdays: [1, 2, 3, 4, 5], workdays: 22 });
    assert.equal(await repo.typeWeekAt(db, 'zzz', '2026-12'), null);
  });
});

test('work weeks of everyone for a month', async t => {
  await withTempDb(t, 'settings_repo_weeks', async db => {
    const repo = new SettingsRepository(db);
    const reader = new SettingsReader(repo);
    await seedStaff(db);
    await repo.writeWorkWeek(db, 'u-binh', '2026-12', '[1,2,3,4,5]', META);

    assert.deepEqual(await repo.staffList(db), [
      { uuid: 'u-binh', username: 'nv-binh', type: 'nv' },
      { uuid: 'u-ha', username: 'tts-ha', type: 'tts' }
    ]);
    assert.deepEqual([...(await repo.ownWeeksAt(db, '2026-11'))], []);
    assert.deepEqual([...(await repo.ownWeeksAt(db, '2027-01'))], [['u-binh', '[1,2,3,4,5]']]);

    assert.deepEqual(await reader.workWeeksAt('2026-11'), { 'nv-binh': [1, 2, 3, 4, 5, 6], 'tts-ha': [1, 2, 3, 4, 5] });
    assert.deepEqual(await reader.workWeeksAt('2026-12'), { 'nv-binh': [1, 2, 3, 4, 5], 'tts-ha': [1, 2, 3, 4, 5] });
    assert.deepEqual(Object.keys(await reader.workWeeksAt('2026-12')), ['nv-binh', 'tts-ha']);

    // Quay về tuần của loại từ 2027-03: bản mới nhất là null nên theo loại; tháng 2027-02 vẫn là tuần riêng.
    await repo.writeWorkWeek(db, 'u-binh', '2027-03', null, META);
    assert.deepEqual((await reader.workWeeksAt('2027-02'))['nv-binh'], [1, 2, 3, 4, 5]);
    assert.deepEqual((await reader.workWeeksAt('2027-03'))['nv-binh'], [1, 2, 3, 4, 5, 6]);
    assert.equal((await repo.ownWeeksAt(db, '2027-03')).get('u-binh'), null);

    // Cùng kết quả với route từng người.
    for (const month of ['2026-11', '2026-12', '2027-02', '2027-03']) {
      const all = await reader.workWeeksAt(month);
      assert.deepEqual(all['nv-binh'], (await reader.workWeekOf('u-binh', month)).weekdays);
      assert.deepEqual(all['tts-ha'], (await reader.workWeekOf('u-ha', month)).weekdays);
    }

    // Người thêm sau nhưng username đứng trước vẫn đứng đầu (ORDER BY username). Trigger tự cấp uuid nên không dựng được staff uuid NULL.
    await db.insertInto('staff').values({ username: 'ctv-chau', name: 'x', type: 'ctv', pass_hash: 'x', created_at: '2026-11-05' }).execute();
    assert.deepEqual((await repo.staffList(db)).map(s => s.username), ['ctv-chau', 'nv-binh', 'tts-ha']);
    assert.deepEqual(Object.keys(await reader.workWeeksAt('2026-12')), ['ctv-chau', 'nv-binh', 'tts-ha']);
  });
});

test('zone, closed month, change log and stamps', async t => {
  await withTempDb(t, 'settings_repo_log', async db => {
    const repo = new SettingsRepository(db);
    const reader = new SettingsReader(repo);
    await seedStaff(db);
    assert.equal(await reader.zone(), null);
    await repo.saveZone(db, { lat: 10.7769, lng: 106.7009, radiusM: 150 }, META);
    assert.deepEqual(await reader.zone(), { lat: 10.7769, lng: 106.7009, radiusM: 150 });
    await repo.saveZone(db, { lat: 0, lng: 0, radiusM: 20 }, META);
    assert.deepEqual(await reader.zone(), { lat: 0, lng: 0, radiusM: 20 });

    assert.equal(await repo.lastClosedMonth(db), null);
    for (const [month, status] of [
      ['2026-09', 'paid'],
      ['2026-10', 'approved'],
      ['2026-11', 'calculated']
    ]) {
      await sql`INSERT INTO payroll_periods (month, status) VALUES (${month}, ${status})`.execute(db);
    }
    assert.equal(await repo.lastClosedMonth(db), '2026-10');

    assert.equal(await repo.maxChangeId(db), 0);
    const ids = await repo.insertChanges(db, [change('overtime', null), change('work-week', 'u-binh'), change('overtime', null)], META);
    assert.equal(ids.length, 3);
    assert.ok(ids[0] < ids[1] && ids[1] < ids[2]);
    assert.equal(await repo.stampOf(db, 'overtime', null), ids[2]);
    assert.equal(await repo.stampOf(db, 'work-week', 'u-binh'), ids[1]);
    assert.equal(await repo.stampOf(db, 'work-week', 'u-ha'), 0);
    const hist = await repo.history(db, 'overtime', null);
    assert.deepEqual(
      hist.map(h => h.id),
      [ids[2], ids[0]]
    );
    assert.equal(hist[0].changedBy, 'admin');
    assert.equal(hist[0].changedAt, '2026-11-05T03:00:00.000Z');
    assert.equal(hist[0].effectiveMonth, '2026-12');
    assert.equal(hist[0].reason, null);
    assert.equal((await repo.history(db, 'overtime', null, 1)).length, 1);
    assert.deepEqual(
      (await repo.history(db, 'work-week', 'u-binh')).map(h => h.id),
      [ids[1]]
    );
    assert.equal(await repo.maxChangeId(db), ids[2]);
    assert.deepEqual(await repo.insertChanges(db, [], META), []);
  });
});

test('two concurrent saves with the same stamp: one wins, the other gets stale', async t => {
  await withTempDb(t, 'settings_service_race', async db => {
    const repo = new SettingsRepository(db);
    const tx = new TransactionCoordinator(db);
    const svc = new SettingsService(repo, new SettingsReader(repo), tx, new SettingsChanges(), new AuditLog(new AuditRepository(), tx));
    const now = new Date('2026-11-05T03:00:00Z');
    const results = await Promise.allSettled([
      svc.saveGroup('overtime', { effectiveMonth: '2026-12', values: { weekdayRate: 1.6 }, stamp: 0 }, 'admin-a', now),
      svc.saveGroup('overtime', { effectiveMonth: '2027-01', values: { weekdayRate: 1.7 }, stamp: 0 }, 'admin-b', now)
    ]);
    const won = results.filter(r => r.status === 'fulfilled');
    const lost = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    assert.equal(won.length, 1);
    assert.equal(lost.length, 1);
    assert.ok(lost[0].reason instanceof SettingsStaleError);
    assert.equal(lost[0].reason.stamp, 1);
    assert.equal(await repo.stampOf(db, 'overtime', null), 1);
    assert.equal((await repo.groupChain(db, 'overtime')).length, 2);
  });
});
