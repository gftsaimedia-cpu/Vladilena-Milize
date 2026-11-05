import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import 'reflect-metadata';
import type { Values } from '../../src/modules/positions/domain/version-chain';
import {
  LevelNotFoundError,
  LevelStaleError,
  PositionInputError,
  PositionNotFoundError,
  PositionStaleError
} from '../../src/modules/positions/positions.errors';
import type { StoredVersion, WriteMeta } from '../../src/modules/positions/positions.repository';
import { PositionsService } from '../../src/modules/positions/positions.service';
import { PositionsController } from '../../src/modules/positions/positions.controller';

type Rec = {
  id: number;
  code: string;
  level?: number;
  month: string;
  rev: number;
  reason: string | null;
  by: string;
  values: Values;
};

/** Bảng phiên bản trong bộ nhớ, cùng hợp đồng với PositionsRepository (bỏ qua trx). */
class MemoryPositions {
  types: Rec[] = [];
  levels: Rec[] = [];
  writes: Array<{ fn: string; set: Values }> = [];
  private nextId = 100;

  addType(code: string, month: string, values: Values, rev = 0, reason: string | null = null): Rec {
    const rec = { id: this.nextId++, code, month, rev, reason, by: 'seed', values: { ...values } };
    this.types.push(rec);
    return rec;
  }

  addLevel(code: string, level: number, month: string, values: Values, rev = 0): Rec {
    const rec = { id: this.nextId++, code, level, month, rev, reason: null, by: 'seed', values: { ...values } };
    this.levels.push(rec);
    return rec;
  }

  type(code: string, month: string) {
    return this.types.find(r => r.code === code && r.month === month);
  }

  level(code: string, level: number, month: string) {
    return this.levels.find(r => r.code === code && r.level === level && r.month === month);
  }

  private chain(rows: Rec[]): StoredVersion[] {
    return rows
      .slice()
      .sort((a, b) => a.month.localeCompare(b.month))
      .map(r => ({ id: r.id, month: r.month, rev: r.rev, values: { ...r.values } }));
  }

  private apply(rec: Rec, set: Values, meta: WriteMeta) {
    rec.values = { ...rec.values, ...set };
    rec.rev += 1;
    rec.by = meta.actor;
    if ('reason' in meta) rec.reason = meta.reason ?? null;
  }

  private copy(list: Rec[], fromId: number, month: string, set: Values, meta: WriteMeta): number {
    const from = list.find(r => r.id === fromId)!;
    // Như PositionsRepository: dòng chép mới có rev = rev dòng gốc + 1.
    const rec = { ...from, id: this.nextId++, month, rev: from.rev + 1, reason: meta.reason ?? null, by: meta.actor, values: { ...from.values, ...set } };
    list.push(rec);
    return rec.id;
  }

  async typeChain(_trx: unknown, code: string) {
    return this.chain(this.types.filter(r => r.code === code));
  }
  async levelChain(_trx: unknown, code: string, level: number) {
    return this.chain(this.levels.filter(r => r.code === code && r.level === level));
  }
  async maxLevelAt(_trx: unknown, code: string, month: string) {
    return Math.max(0, ...this.levels.filter(r => r.code === code && r.month <= month).map(r => r.level!));
  }
  async insertTypeFrom(_trx: unknown, fromId: number, month: string, set: Values, meta: WriteMeta) {
    this.writes.push({ fn: 'insertTypeFrom', set });
    return this.copy(this.types, fromId, month, set, meta);
  }
  async updateType(_trx: unknown, id: number, set: Values, meta: WriteMeta) {
    this.writes.push({ fn: 'updateType', set });
    this.apply(this.types.find(r => r.id === id)!, set, meta);
  }
  async insertLevelFrom(_trx: unknown, fromId: number, month: string, set: Values, meta: WriteMeta) {
    this.writes.push({ fn: 'insertLevelFrom', set });
    return this.copy(this.levels, fromId, month, set, meta);
  }
  async updateLevel(_trx: unknown, id: number, set: Values, meta: WriteMeta) {
    this.writes.push({ fn: 'updateLevel', set });
    this.apply(this.levels.find(r => r.id === id)!, set, meta);
  }
  async insertLevel(_trx: unknown, code: string, level: number, month: string, values: Values, meta: WriteMeta) {
    this.writes.push({ fn: 'insertLevel', set: values });
    const rec = { id: this.nextId++, code, level, month, rev: 0, reason: meta.reason ?? null, by: meta.actor, values: { ...values } };
    this.levels.push(rec);
    return rec.id;
  }
}

const NOW = new Date('2026-11-05T03:00:00.000Z'); // 10:00 ngày 05/11/2026 giờ Việt Nam
const NV = { name: 'Nhân viên', workdays: 26, flexPct: 20, nightPct: 40, travelPct: 15, attendancePct: 25, 'benefit.makeup': true };
const CTV = { name: 'Chuyên trách viên', workdays: 26, flexPct: 10, nightPct: 30, travelPct: 0, attendancePct: 0 };
const LEVEL2 = { name: 'Chuyên viên', baseSalary: 6_500_000, kpiMax: 6_500_000, nightPct: null };
const NEW_LEVEL = { name: 'Bậc 5', baseSalary: 9_000_000, kpiMax: null, nightPct: null };

function setup(seed = true) {
  const repo = new MemoryPositions();
  if (seed) {
    repo.addType('nv', '2000-01', NV);
    repo.addType('ctv', '2000-01', CTV);
    for (let l = 1; l <= 4; l++) repo.addLevel('nv', l, '2000-01', l === 2 ? LEVEL2 : { ...LEVEL2, name: `Bậc ${l}` });
  }
  const tx = {
    locks: [] as string[],
    run: async <T>(cb: (trx: any) => Promise<T>) => cb({}),
    acquireAdvisoryLock: async (_trx: unknown, key: string) => {
      tx.locks.push(key);
    }
  };
  const svc = new PositionsService(repo as any, tx as any);
  return { repo, tx, svc };
}

const put = (items: unknown[], month = '2026-11', reason?: string) => ({ effectiveMonth: month, reason, items });
const nv = (changes: Values, expectedRev = 0) => ({ code: 'nv', expectedRev, changes });

describe('PositionsService.savePositions', () => {
  it('rejects a month before the current one and writes nothing', async () => {
    const { repo, svc } = setup();
    await assert.rejects(
      svc.savePositions(put([nv({ flexPct: 25 })], '2026-10'), 'admin', NOW),
      (e: any) => e instanceof PositionInputError && e.field === 'effectiveMonth'
    );
    assert.deepEqual(repo.writes, []);
  });

  it('404 when no version is in force', async () => {
    const { repo, svc } = setup(false);
    repo.addType('nv', '2027-01', NV);
    await assert.rejects(svc.savePositions(put([nv({ flexPct: 25 })]), 'admin', NOW), PositionNotFoundError);
  });

  it('409 on a stale rev and nothing is written', async () => {
    const { repo, svc } = setup();
    await assert.rejects(svc.savePositions(put([nv({ flexPct: 25 }, 3)]), 'admin', NOW), PositionStaleError);
    assert.deepEqual(repo.writes, []);
  });

  it('one stale item keeps every item unsaved', async () => {
    const { repo, svc } = setup();
    const items = [{ code: 'ctv', expectedRev: 0, changes: { flexPct: 12 } }, nv({ flexPct: 25 }, 7)];
    await assert.rejects(svc.savePositions(put(items), 'admin', NOW), PositionStaleError);
    assert.deepEqual(repo.writes, []);
    assert.equal(repo.type('ctv', '2026-11'), undefined);
  });

  it('locks codes in sorted order', async () => {
    const { tx, svc } = setup();
    await svc.savePositions(put([nv({ flexPct: 25 }), { code: 'ctv', expectedRev: 0, changes: { flexPct: 12 } }]), 'admin', NOW);
    assert.deepEqual(tx.locks, ['positions:ctv', 'positions:nv']);
  });

  it('sends only changed fields', async () => {
    const { repo, svc } = setup();
    assert.deepEqual(await svc.savePositions(put([nv({ flexPct: 20, travelPct: 16 })]), 'admin', NOW), {
      ok: true,
      effectiveMonth: '2026-11'
    });
    assert.deepEqual(repo.writes, [{ fn: 'insertTypeFrom', set: { travelPct: 16 } }]);
    const created = repo.type('nv', '2026-11')!;
    assert.equal(created.values.travelPct, 16);
    assert.equal(created.values.flexPct, 20);
    assert.equal(created.by, 'admin');
  });

  it('a save that changes nothing writes nothing', async () => {
    const { repo, svc } = setup();
    const res = await svc.savePositions(put([nv({ flexPct: 20, 'benefits': { makeup: true } } as any)]), 'admin', NOW);
    assert.deepEqual(res, { ok: true, effectiveMonth: '2026-11' });
    assert.deepEqual(repo.writes, []);
    assert.equal(repo.type('nv', '2000-01')!.rev, 0);
  });

  it('carrying bumps the later rev so a stale editor of that month gets 409', async () => {
    const { repo, svc } = setup();
    repo.addType('nv', '2026-12', NV);
    await svc.savePositions(put([nv({ flexPct: 25 })]), 'admin', NOW);
    const dec = repo.type('nv', '2026-12')!;
    assert.equal(dec.values.flexPct, 25);
    assert.equal(dec.rev, 1);
    await assert.rejects(svc.savePositions(put([nv({ travelPct: 10 }, 0)], '2026-12'), 'other', NOW), PositionStaleError);
  });

  it('carries a tick change into a later version', async () => {
    const { repo, svc } = setup();
    repo.addType('nv', '2026-12', NV);
    await svc.savePositions(put([nv({ benefits: { makeup: false } } as any)]), 'admin', NOW);
    assert.equal(repo.type('nv', '2026-11')!.values['benefit.makeup'], false);
    assert.equal(repo.type('nv', '2026-12')!.values['benefit.makeup'], false);
  });

  it('reason goes only on the month row', async () => {
    const { repo, svc } = setup();
    await svc.savePositions(put([nv({ flexPct: 22 })], '2026-12', 'Tháng 12'), 'admin', NOW);
    await svc.savePositions(put([nv({ travelPct: 16 })], '2026-11', 'Tăng đi lại'), 'admin', NOW);
    assert.equal(repo.type('nv', '2026-11')!.reason, 'Tăng đi lại');
    assert.equal(repo.type('nv', '2026-12')!.reason, 'Tháng 12');
    assert.equal(repo.type('nv', '2026-12')!.values.travelPct, 16);
    // Dòng 11/2026 chép từ dòng gốc rev 0 nên có rev 1.
    await svc.savePositions(put([nv({ attendancePct: 30 }, 1)], '2026-11'), 'admin', NOW);
    assert.equal(repo.type('nv', '2026-11')!.reason, 'Tăng đi lại');
    assert.equal(repo.type('nv', '2026-11')!.rev, 2);
  });
});

describe('PositionsService levels', () => {
  const level = (changes: Values, month = '2026-11', expectedRev = 0) => ({ effectiveMonth: month, expectedRev, changes });

  it('spec example: KPI 6.8M reaches the December version', async () => {
    const { repo, tx, svc } = setup();
    await svc.saveLevel('nv', '2', level({ baseSalary: 7_000_000 }, '2026-12'), 'admin', NOW);
    await svc.saveLevel('nv', '2', level({ kpiMax: 6_800_000 }, '2026-11'), 'admin', NOW);
    assert.deepEqual(repo.level('nv', 2, '2026-12')!.values, { ...LEVEL2, baseSalary: 7_000_000, kpiMax: 6_800_000 });
    assert.deepEqual(repo.level('nv', 2, '2026-11')!.values, { ...LEVEL2, kpiMax: 6_800_000 });
    assert.deepEqual(tx.locks, ['positions:nv', 'positions:nv']);
  });

  it('saveLevel 404 for a level that does not exist yet', async () => {
    const { svc } = setup();
    await assert.rejects(svc.saveLevel('nv', '9', level({ baseSalary: 1 }), 'admin', NOW), LevelNotFoundError);
  });

  it('saveLevel 409 on a stale rev', async () => {
    const { repo, svc } = setup();
    await assert.rejects(svc.saveLevel('nv', '2', level({ baseSalary: 1 }, '2026-11', 4), 'admin', NOW), LevelStaleError);
    assert.deepEqual(repo.writes, []);
  });

  it('addLevel needs the next level number', async () => {
    const { svc } = setup();
    const add = (lv: number) => ({ effectiveMonth: '2026-11', level: lv, values: NEW_LEVEL });
    await assert.rejects(svc.addLevel('nv', add(6), 'admin', NOW), LevelStaleError);
    assert.deepEqual(await svc.addLevel('nv', add(5), 'admin', NOW), { ok: true, effectiveMonth: '2026-11', level: 5 });
  });

  it('addLevel before a later version of the same level', async () => {
    const { repo, svc } = setup();
    repo.addLevel('nv', 5, '2026-12', NEW_LEVEL);
    await svc.addLevel('nv', { effectiveMonth: '2026-11', level: 5, values: NEW_LEVEL, reason: 'Sớm hơn' }, 'admin', NOW);
    const added = repo.level('nv', 5, '2026-11')!;
    assert.deepEqual(added.values, NEW_LEVEL);
    assert.equal(added.reason, 'Sớm hơn');
  });

  it('addLevel 404 when the type has no version that month', async () => {
    const { svc } = setup();
    await assert.rejects(
      svc.addLevel('tts', { effectiveMonth: '2026-11', level: 1, values: NEW_LEVEL }, 'admin', NOW),
      PositionNotFoundError
    );
  });
});

describe('PositionsController', () => {
  const user = { username: 'admin' } as any;
  const failing = (err: Error) =>
    new PositionsController({
      savePositions: async () => {
        throw err;
      },
      saveLevel: async () => {
        throw err;
      },
      addLevel: async () => {
        throw err;
      }
    } as any);

  const CASES: Array<[Error, number, string]> = [
    [new PositionInputError('Tháng sai', 'effectiveMonth'), 400, 'BAD_REQUEST'],
    [new PositionNotFoundError('x'), 404, 'POSITION_NOT_FOUND'],
    [new LevelNotFoundError('x'), 404, 'LEVEL_NOT_FOUND'],
    [new PositionStaleError('x'), 409, 'POSITION_STALE'],
    [new LevelStaleError('x'), 409, 'LEVEL_STALE']
  ];

  for (const [err, status, code] of CASES) {
    it(`maps ${err.name} to ${status} ${code} on every route`, async () => {
      const ctrl = failing(err);
      for (const call of [
        () => ctrl.savePositions({}, user),
        () => ctrl.saveLevel('nv', '1', {}, user),
        () => ctrl.addLevel('nv', {}, user)
      ]) {
        await assert.rejects(call(), (e: any) => {
          assert.equal(e.status, status);
          assert.equal(e.details?.code, code);
          if (code === 'BAD_REQUEST') assert.equal(e.details?.field, 'effectiveMonth');
          return true;
        });
      }
    });
  }

  it('passes other errors through and hands the username to the service', async () => {
    const boom = new Error('db');
    await assert.rejects(failing(boom).savePositions({}, user), (e: any) => e === boom);
    const seen: unknown[] = [];
    const ctrl = new PositionsController({
      savePositions: async (body: unknown, actor: string) => {
        seen.push(body, actor);
        return { ok: true, effectiveMonth: '2026-11' };
      }
    } as any);
    assert.deepEqual(await ctrl.savePositions({ a: 1 }, user), { ok: true, effectiveMonth: '2026-11' });
    assert.deepEqual(seen, [{ a: 1 }, 'admin']);
  });
});
