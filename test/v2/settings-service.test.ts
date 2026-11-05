import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import 'reflect-metadata';
import type { ChainVersion, Values } from '../../src/common/version-chain';
import { defaultsOf, encodeValues, GROUP_KEYS, type GroupKey } from '../../src/modules/settings/domain/setting-groups';
import { SettingsReader } from '../../src/modules/settings/settings-reader';
import type { ChangeRow, SettingsRepository, StaffRef, StoredChange, WriteMeta } from '../../src/modules/settings/settings.repository';
import type { Zone } from '../../src/modules/settings/domain/attendance-zone';
import {
  SettingsEmployeeNotFoundError,
  SettingsGroupNotFoundError,
  SettingsInputError,
  SettingsStaleError
} from '../../src/modules/settings/settings.errors';
import { SettingsService } from '../../src/modules/settings/settings.service';

const NOW = new Date('2026-11-05T03:00:00Z');
const OT_DEFAULTS = { weekdayRate: 1.5, weekendRate: 2, holidayRate: 3 };

/** Kho cài đặt trong bộ nhớ, cùng các hàm public với SettingsRepository (bỏ qua tham số `q`). */
class MemorySettings {
  db = {} as never;
  lastClosed: string | null = null;
  changes: StoredChange[] = [];
  zoneRow: Zone | null = null;
  private chains = new Map<GroupKey, ChainVersion[]>();
  private weekChains = new Map<string, ChainVersion[]>();
  private staff: StaffRef[] = [
    { uuid: 'u-binh', username: 'nv-binh', type: 'nv' },
    { uuid: 'u-ha', username: 'tts-ha', type: 'tts' },
    { uuid: 'u-chau', username: 'ctv-chau', type: 'ctv' }
  ];
  // Tuần của loại như seed: nv/ctv T2–T7 (26 ngày), tts T2–T6 (22 ngày).
  private typeWeeks: Record<string, { weekdays: number[]; workdays: number }> = {
    nv: { weekdays: [1, 2, 3, 4, 5, 6], workdays: 26 },
    ctv: { weekdays: [1, 2, 3, 4, 5, 6], workdays: 26 },
    tts: { weekdays: [1, 2, 3, 4, 5], workdays: 22 }
  };

  constructor() {
    for (const g of GROUP_KEYS) this.chains.set(g, [{ month: '2000-01', values: encodeValues(defaultsOf(g)) }]);
  }

  async groupChain(_q: unknown, g: GroupKey): Promise<ChainVersion[]> {
    return (this.chains.get(g) as ChainVersion[]).map(v => ({ month: v.month, values: { ...v.values } })).sort((a, b) => a.month.localeCompare(b.month));
  }

  async writeGroupVersion(_q: unknown, g: GroupKey, month: string, values: Values, _meta: WriteMeta): Promise<void> {
    const chain = this.chains.get(g) as ChainVersion[];
    const at = chain.find(v => v.month === month);
    if (at) at.values = { ...values };
    else chain.push({ month, values: { ...values } });
  }

  async insertChanges(_q: unknown, rows: ChangeRow[], meta: WriteMeta): Promise<number[]> {
    return rows.map(r => {
      const id = this.changes.length + 1;
      this.changes.push({ ...r, id, changedBy: meta.actor, changedAt: meta.at });
      return id;
    });
  }

  async stampOf(_q: unknown, setting: string, subject: string | null): Promise<number> {
    return Math.max(0, ...this.changes.filter(c => c.setting === setting && c.subject === subject).map(c => c.id));
  }

  async history(_q: unknown, setting: string, subject: string | null, limit = 200): Promise<StoredChange[]> {
    return this.changes
      .filter(c => c.setting === setting && c.subject === subject)
      .sort((a, b) => b.id - a.id)
      .slice(0, limit);
  }

  async maxChangeId(): Promise<number> {
    return this.changes.length;
  }

  async lastClosedMonth(): Promise<string | null> {
    return this.lastClosed;
  }

  async staffByUsername(_q: unknown, username: string): Promise<StaffRef | null> {
    return this.staff.find(s => s.username === username) ?? null;
  }

  async staffByUuid(_q: unknown, uuid: string): Promise<StaffRef | null> {
    return this.staff.find(s => s.uuid === uuid) ?? null;
  }

  async staffList(_q: unknown): Promise<StaffRef[]> {
    return [...this.staff].sort((a, b) => (a.username < b.username ? -1 : a.username > b.username ? 1 : 0));
  }

  /** uuid → weekdays (chuỗi JSON hoặc null) của phiên bản mới nhất có tháng không sau `month`. */
  async ownWeeksAt(_q: unknown, month: string): Promise<Map<string, string | null>> {
    const out = new Map<string, string | null>();
    for (const [uuid, chain] of this.weekChains) {
      const latest = chain.filter(v => v.month <= month).sort((a, b) => a.month.localeCompare(b.month)).pop();
      if (latest) out.set(uuid, latest.values.weekdays as string | null);
    }
    return out;
  }

  async typeWeekAt(_q: unknown, typeCode: string, _month: string): Promise<{ weekdays: number[]; workdays: number } | null> {
    return this.typeWeeks[typeCode] ?? null;
  }

  async workWeekChain(_q: unknown, uuid: string): Promise<ChainVersion[]> {
    return (this.weekChains.get(uuid) ?? []).map(v => ({ month: v.month, values: { ...v.values } })).sort((a, b) => a.month.localeCompare(b.month));
  }

  async writeWorkWeek(_q: unknown, uuid: string, month: string, weekdays: string | null, _meta: WriteMeta): Promise<void> {
    const chain = this.weekChains.get(uuid) ?? [];
    const at = chain.find(v => v.month === month);
    if (at) at.values = { weekdays };
    else chain.push({ month, values: { weekdays } });
    this.weekChains.set(uuid, chain);
  }

  async zone(): Promise<Zone | null> {
    return this.zoneRow ? { ...this.zoneRow } : null;
  }

  async saveZone(_q: unknown, zone: Zone, _meta: WriteMeta): Promise<void> {
    this.zoneRow = { ...zone };
  }
}

let mem: MemorySettings;
let svc: SettingsService;
let locks: string[];

beforeEach(() => {
  mem = new MemorySettings();
  locks = [];
  const repo = mem as unknown as SettingsRepository;
  const tx = {
    run: (cb: (trx: unknown) => Promise<unknown>) => cb({}),
    acquireAdvisoryLock: async (_trx: unknown, key: string) => {
      locks.push(key);
    }
  };
  svc = new SettingsService(repo, new SettingsReader(repo), tx as never);
});

const save = (g: string, month: string, values: Record<string, unknown>, stamp: number) =>
  svc.saveGroup(g, { effectiveMonth: month, values, stamp }, 'admin', NOW);

const rejectsField = (p: Promise<unknown>, field: string) =>
  assert.rejects(p, (e: unknown) => e instanceof SettingsInputError && e.field === field);

const pick = ({ id: _id, changedBy: _by, changedAt: _at, ...rest }: StoredChange) => rest;

describe('settings service: groups, history, pay days', () => {
  it('shows every group with defaults, limits, from and stamp', async () => {
    const view = await svc.getAll(undefined, NOW);
    assert.equal(view.month, '2026-11');
    assert.equal(view.minMonth, '2026-11');
    assert.deepEqual(view.groups.overtime, {
      from: '2000-01',
      stamp: 0,
      values: OT_DEFAULTS,
      defaults: OT_DEFAULTS,
      limits: {
        weekdayRate: { min: 1.5, max: 5, step: 0.01 },
        weekendRate: { min: 2, max: 5, step: 0.01 },
        holidayRate: { min: 3, max: 5, step: 0.01 }
      }
    });
    assert.equal(view.groups.kpiWeights.sum, 100);
    assert.deepEqual(Object.keys(view.groups), ['overtime', 'attendance', 'kpiWeights', 'insurance', 'tax', 'payCalendar']);
    assert.equal((view.groups.tax.values.brackets as unknown[]).length, 5);
    await rejectsField(svc.getAll('2026-13', NOW), 'month');
  });

  it('saves only changed cells from the chosen month (D1)', async () => {
    assert.deepEqual(
      await svc.saveGroup('overtime', { effectiveMonth: '2026-12', values: { weekdayRate: 1.6 }, reason: ' Theo QĐ ', stamp: 0 }, 'admin', NOW),
      { ok: true, effectiveMonth: '2026-12', changed: ['weekdayRate'], stamp: 1 }
    );
    assert.equal((await svc.getAll('2026-11', NOW)).groups.overtime.values.weekdayRate, 1.5);
    assert.equal((await svc.getAll('2026-12', NOW)).groups.overtime.values.weekdayRate, 1.6);
    assert.deepEqual(pick(mem.changes[0]), {
      setting: 'overtime',
      field: 'weekdayRate',
      subject: null,
      effectiveMonth: '2026-12',
      oldJson: '1.5',
      newJson: '1.6',
      reason: 'Theo QĐ'
    });
    assert.deepEqual(locks, ['settings:overtime']);
  });

  it('carries a new value into later versions that still had the old one', async () => {
    await save('overtime', '2027-03', { holidayRate: 3.5 }, 0);
    await save('overtime', '2026-12', { holidayRate: 3.2, weekdayRate: 1.7 }, 1);
    const at = async (m: string) => (await svc.getAll(m, NOW)).groups.overtime.values;
    assert.deepEqual(await at('2027-02'), { weekdayRate: 1.7, weekendRate: 2, holidayRate: 3.2 });
    assert.deepEqual(await at('2027-03'), { weekdayRate: 1.7, weekendRate: 2, holidayRate: 3.5 });
    assert.equal(mem.changes.length, 3); // carry không sinh dòng lịch sử
  });

  it('no-op, stale stamp, month floor, unknown group, bad input', async () => {
    assert.deepEqual(await save('overtime', '2026-11', { weekdayRate: 1.5 }, 0), { ok: true, effectiveMonth: '2026-11', changed: [], stamp: 0 });
    await save('overtime', '2026-11', { weekdayRate: 1.6 }, 0);
    await assert.rejects(save('overtime', '2026-11', { weekdayRate: 1.7 }, 0), (e: any) => e instanceof SettingsStaleError && e.stamp === 1);
    await rejectsField(save('overtime', '2026-10', { weekdayRate: 1.7 }, 1), 'effectiveMonth');
    mem.lastClosed = '2026-11';
    await rejectsField(save('overtime', '2026-11', { weekdayRate: 1.7 }, 1), 'effectiveMonth');
    await assert.rejects(save('bonus', '2026-12', { x: 1 }, 0), SettingsGroupNotFoundError);
    await rejectsField(save('overtime', '2026-12', { weekdayRate: 9 }, 1), 'weekdayRate');
    await rejectsField(
      svc.saveGroup('overtime', { effectiveMonth: '2026-12', values: { weekdayRate: 1.6 }, stamp: '1' }, 'admin', NOW),
      'stamp'
    );
  });

  it('undo is a save of the old value and shows newest first', async () => {
    await save('overtime', '2026-11', { weekdayRate: 1.6 }, 0);
    await save('overtime', '2026-11', { weekdayRate: 1.5 }, 1);
    const { items } = await svc.groupHistory('overtime');
    assert.deepEqual(
      items.map(i => [i.field, i.month, i.from, i.to, i.by]),
      [
        ['weekdayRate', '2026-11', 1.6, 1.5, 'admin'],
        ['weekdayRate', '2026-11', 1.5, 1.6, 'admin']
      ]
    );
  });

  it('tax history carries whole bracket arrays', async () => {
    const b = [
      { upTo: 20000000, ratePct: 10 },
      { upTo: null, ratePct: 20 }
    ];
    await save('tax', '2027-01', { brackets: b }, 0);
    const [item] = (await svc.groupHistory('tax')).items;
    assert.equal(item.field, 'brackets');
    assert.equal((item.from as unknown[]).length, 5);
    assert.deepEqual(item.to, b);
  });

  it('kpi-weights history is one row per save and the row can be undone', async () => {
    const next = { wework: 45, user: 19, peer: 18, manager: 12, self: 6 };
    const saved = await save('kpi-weights', '2026-12', next, 0);
    assert.deepEqual(saved.changed, ['wework', 'user']);
    const { items } = await svc.groupHistory('kpi-weights');
    assert.equal(items.length, 1);
    const [item] = items;
    assert.equal(item.field, 'weights');
    assert.deepEqual(item.from, { wework: 40, user: 24, peer: 18, manager: 12, self: 6 });
    assert.deepEqual(item.to, next);
    assert.equal(saved.stamp, item.id);

    const undo = await svc.saveGroup('kpi-weights', { effectiveMonth: '2026-12', values: item.from, stamp: saved.stamp }, 'admin', NOW);
    assert.equal(undo.ok, true);
    assert.deepEqual((await svc.getAll('2026-12', NOW)).groups.kpiWeights.values, { wework: 40, user: 24, peer: 18, manager: 12, self: 6 });
    assert.equal((await svc.groupHistory('kpi-weights')).items.length, 2);
  });

  it('pay days for a year', async () => {
    await save('pay-calendar', '2026-11', { payDay: 5 }, 0);
    const { year, items } = await svc.payDays('2026');
    assert.equal(year, 2026);
    assert.equal(items.length, 12);
    assert.deepEqual(items[9], { month: '2026-10', payDay: 10, payDate: '2026-11-10' });
    assert.deepEqual(items[10], { month: '2026-11', payDay: 5, payDate: '2026-12-05' });
    assert.deepEqual(items[11], { month: '2026-12', payDay: 5, payDate: '2027-01-05' });
    await rejectsField(svc.payDays('abc'), 'year');
  });

  it('rejects months before the seed month instead of failing with a 500', async () => {
    await rejectsField(svc.getAll('1999-12', NOW), 'month');
    await rejectsField(svc.payDays('1999'), 'year');
    assert.equal((await svc.getAll('2000-01', NOW)).groups.overtime.from, '2000-01');
    assert.equal((await svc.payDays('2000')).items.length, 12);
  });
});

describe('settings service: per-person work week and attendance zone', () => {
  it('rejects a work week month before the seed month instead of failing with a 500', async () => {
    await rejectsField(svc.getWorkWeek('nv-binh', '1999-12', NOW), 'month');
    assert.equal((await svc.getWorkWeek('nv-binh', '2000-01', NOW)).source, 'type');
  });

  it('lists the work week of everyone for a month', async () => {
    const now = await svc.workWeeks(undefined, NOW);
    assert.equal(now.month, '2026-11');
    assert.deepEqual(now.weekdays, {
      'ctv-chau': [1, 2, 3, 4, 5, 6],
      'nv-binh': [1, 2, 3, 4, 5, 6],
      'tts-ha': [1, 2, 3, 4, 5]
    });
    assert.deepEqual(Object.keys(now.weekdays), ['ctv-chau', 'nv-binh', 'tts-ha']);

    await svc.saveWorkWeek('ctv-chau', { effectiveMonth: '2026-12', weekdays: [1, 3, 5], stamp: 0 }, 'admin', NOW);
    assert.deepEqual((await svc.workWeeks('2026-12', NOW)).weekdays['ctv-chau'], [1, 3, 5]);
    assert.deepEqual((await svc.workWeeks('2026-11', NOW)).weekdays['ctv-chau'], [1, 2, 3, 4, 5, 6]);

    // Người có loại không có tuần thì bị bỏ qua.
    (mem as unknown as { staff: StaffRef[] }).staff.push({ uuid: 'u-x', username: 'zzz-x', type: 'zzz' });
    assert.equal('zzz-x' in (await svc.workWeeks('2026-12', NOW)).weekdays, false);

    await rejectsField(svc.workWeeks('1999-12', NOW), 'month');
    await rejectsField(svc.workWeeks('2026-13', NOW), 'month');
  });

  it('skips a person whose type has no week in the month, even with an own week', async () => {
    (mem as unknown as { staff: StaffRef[] }).staff.push({ uuid: 'u-x', username: 'zzz-x', type: 'zzz' });
    await mem.writeWorkWeek({}, 'u-x', '2026-12', '[1,2,3]', { actor: 'admin', at: NOW.toISOString() });
    const { weekdays } = await svc.workWeeks('2026-12', NOW);
    assert.equal('zzz-x' in weekdays, false);
    assert.deepEqual(Object.keys(weekdays), ['ctv-chau', 'nv-binh', 'tts-ha']);
    // workWeekOf cũng không trả lời cho người này.
    await assert.rejects(svc.reader.workWeekOf('u-x', '2026-12'));
  });

  it('own week from a month, then back to the type week (Review Focus 4)', async () => {
    const before = await svc.getWorkWeek('nv-binh', '2026-12', NOW);
    assert.deepEqual(before, {
      username: 'nv-binh',
      month: '2026-12',
      minMonth: '2026-11',
      weekdays: [1, 2, 3, 4, 5, 6],
      source: 'type',
      standardWorkdays: 26,
      from: null,
      typeWeekdays: [1, 2, 3, 4, 5, 6],
      typeStandardWorkdays: 26,
      stamp: 0
    });
    assert.deepEqual(await svc.saveWorkWeek('nv-binh', { effectiveMonth: '2026-12', weekdays: [5, 4, 3, 2, 1], reason: null, stamp: 0 }, 'admin', NOW), {
      ok: true,
      weekdays: [1, 2, 3, 4, 5],
      source: 'own',
      standardWorkdays: 22,
      stamp: 1
    });
    assert.deepEqual(pick(mem.changes[0]), {
      setting: 'work-week',
      field: 'weekdays',
      subject: 'u-binh',
      effectiveMonth: '2026-12',
      oldJson: null,
      newJson: '[1,2,3,4,5]',
      reason: null
    });
    assert.deepEqual(locks, ['settings:work-week:u-binh']);
    await svc.saveWorkWeek('nv-binh', { effectiveMonth: '2027-03', weekdays: null, stamp: 1 }, 'admin', NOW);
    assert.equal((await svc.getWorkWeek('nv-binh', '2027-02', NOW)).standardWorkdays, 22);
    assert.equal((await svc.getWorkWeek('nv-binh', '2027-03', NOW)).source, 'type');
    const { items } = await svc.workWeekHistory('nv-binh');
    assert.deepEqual(
      items.map(i => [i.from, i.to]),
      [
        [[1, 2, 3, 4, 5], null],
        [null, [1, 2, 3, 4, 5]]
      ]
    );
  });

  it('Châu on Mon/Wed/Fri gets 13 standard days', async () => {
    const r = await svc.saveWorkWeek('ctv-chau', { effectiveMonth: '2026-12', weekdays: [1, 3, 5], stamp: 0 }, 'admin', NOW);
    assert.equal(r.standardWorkdays, 13);
  });

  it('work week refusals and per-person stamps', async () => {
    assert.equal((await svc.saveWorkWeek('nv-binh', { effectiveMonth: '2026-12', weekdays: null, stamp: 0 }, 'admin', NOW)).stamp, 0);
    assert.equal(mem.changes.length, 0);
    for (const w of [[], [0], [7]]) {
      await rejectsField(svc.saveWorkWeek('nv-binh', { effectiveMonth: '2026-12', weekdays: w, stamp: 0 }, 'admin', NOW), 'weekdays');
    }
    await assert.rejects(svc.getWorkWeek('nobody', '2026-12', NOW), SettingsEmployeeNotFoundError);
    await assert.rejects(svc.saveWorkWeek('nobody', { effectiveMonth: '2026-12', weekdays: [1], stamp: 0 }, 'admin', NOW), SettingsEmployeeNotFoundError);
    await assert.rejects(svc.workWeekHistory('nobody'), SettingsEmployeeNotFoundError);
    await svc.saveWorkWeek('nv-binh', { effectiveMonth: '2026-12', weekdays: [1, 2, 3, 4, 5], stamp: 0 }, 'admin', NOW);
    assert.equal((await svc.getWorkWeek('tts-ha', '2026-12', NOW)).stamp, 0);
    await assert.rejects(
      svc.saveWorkWeek('nv-binh', { effectiveMonth: '2026-12', weekdays: [1, 2, 3], stamp: 0 }, 'admin', NOW),
      (e: unknown) => e instanceof SettingsStaleError && e.stamp === 1
    );
    await rejectsField(svc.saveWorkWeek('nv-binh', { effectiveMonth: '2026-10', weekdays: [1, 2, 3], stamp: 1 }, 'admin', NOW), 'effectiveMonth');
  });

  it('attendance zone', async () => {
    assert.deepEqual(await svc.getZone(), { zone: null, stamp: 0 });
    const zone = { lat: 10.7769, lng: 106.7009, radiusM: 150 };
    assert.deepEqual(await svc.saveZone({ ...zone, reason: null, stamp: 0 }, 'admin', NOW), { ok: true, zone, stamp: 1 });
    assert.deepEqual(pick(mem.changes[0]), {
      setting: 'attendance-zone',
      field: 'zone',
      subject: null,
      effectiveMonth: null,
      oldJson: null,
      newJson: '{"lat":10.7769,"lng":106.7009,"radiusM":150}',
      reason: null
    });
    assert.deepEqual(locks, ['settings:attendance-zone']);
    assert.equal((await svc.saveZone({ ...zone, stamp: 1 }, 'admin', NOW)).stamp, 1);
    assert.equal(mem.changes.length, 1);
    await rejectsField(svc.saveZone({ ...zone, radiusM: 19, stamp: 1 }, 'admin', NOW), 'radiusM');
    await assert.rejects(svc.saveZone({ ...zone, radiusM: 200, stamp: 0 }, 'admin', NOW), SettingsStaleError);
    assert.deepEqual((await svc.zoneHistory()).items[0].to, zone);
  });

  it('a changed zone records the old zone', async () => {
    const zone = { lat: 10.7769, lng: 106.7009, radiusM: 150 };
    await svc.saveZone({ ...zone, stamp: 0 }, 'admin', NOW);
    await svc.saveZone({ ...zone, radiusM: 200, reason: 'Mở rộng', stamp: 1 }, 'admin', NOW);
    assert.equal(mem.changes[1].oldJson, '{"lat":10.7769,"lng":106.7009,"radiusM":150}');
    assert.deepEqual((await svc.getZone()), { zone: { ...zone, radiusM: 200 }, stamp: 2 });
    const [latest] = (await svc.zoneHistory()).items;
    assert.deepEqual([latest.field, latest.month, latest.from, latest.reason], ['zone', null, zone, 'Mở rộng']);
  });
});
