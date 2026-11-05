import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import 'reflect-metadata';
import type { ChainVersion, Values } from '../../src/common/version-chain';
import { defaultsOf, encodeValues, GROUP_KEYS, type GroupKey } from '../../src/modules/settings/domain/setting-groups';
import { SettingsReader } from '../../src/modules/settings/settings-reader';
import type { ChangeRow, SettingsRepository, StoredChange, WriteMeta } from '../../src/modules/settings/settings.repository';
import { SettingsGroupNotFoundError, SettingsInputError, SettingsStaleError } from '../../src/modules/settings/settings.errors';
import { SettingsService } from '../../src/modules/settings/settings.service';

const NOW = new Date('2026-11-05T03:00:00Z');
const OT_DEFAULTS = { weekdayRate: 1.5, weekendRate: 2, holidayRate: 3 };

/** Kho cài đặt trong bộ nhớ, cùng các hàm public với SettingsRepository (bỏ qua tham số `q`). */
class MemorySettings {
  db = {} as never;
  lastClosed: string | null = null;
  changes: StoredChange[] = [];
  private chains = new Map<GroupKey, ChainVersion[]>();

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
});
