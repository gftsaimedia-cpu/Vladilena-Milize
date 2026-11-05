import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { planChange, versionAt } from '../../src/modules/positions/domain/version-chain';
import { parseAddLevel, parseSaveLevel, parseSavePositions } from '../../src/modules/positions/domain/position-input';
import { PositionInputError } from '../../src/modules/positions/positions.errors';

describe('planChange', () => {
  it('inserts a version for a month that has none', () => {
    assert.deepEqual(planChange([{ month: '2000-01', values: { a: 1, b: 2 } }], '2026-11', { a: 5, b: 2 }), {
      base: '2000-01',
      mode: 'insert',
      set: { a: 5 },
      carry: []
    });
  });

  it('updates in place when a version starts that month', () => {
    const chain = [
      { month: '2000-01', values: { a: 1 } },
      { month: '2026-11', values: { a: 2 } }
    ];
    assert.deepEqual(planChange(chain, '2026-11', { a: 3 }), { base: '2026-11', mode: 'update', set: { a: 3 }, carry: [] });
  });

  it('returns null when nothing changes', () => {
    assert.equal(planChange([{ month: '2000-01', values: { a: 1 } }], '2026-11', { a: 1 }), null);
  });

  it('carries each field until a version set its own value', () => {
    const chain = [
      { month: '2027-02', values: { a: 1, b: 1 } },
      { month: '2000-01', values: { a: 1, b: 1 } },
      { month: '2026-12', values: { a: 1, b: 9 } }
    ];
    assert.deepEqual(planChange(chain, '2026-11', { a: 2, b: 3 })?.carry, [
      { month: '2026-12', set: { a: 2 } },
      { month: '2027-02', set: { a: 2 } }
    ]);
  });

  it('spec example: KPI 6.8M reaches the December version that kept the old KPI', () => {
    const chain = [
      { month: '2000-01', values: { baseSalary: 6_500_000, kpiMax: 6_500_000 } },
      { month: '2026-12', values: { baseSalary: 7_000_000, kpiMax: 6_500_000 } }
    ];
    assert.deepEqual(planChange(chain, '2026-11', { kpiMax: 6_800_000 }), {
      base: '2000-01',
      mode: 'insert',
      set: { kpiMax: 6_800_000 },
      carry: [{ month: '2026-12', set: { kpiMax: 6_800_000 } }]
    });
  });

  it('carries a tick the same way', () => {
    const chain = [
      { month: '2000-01', values: { 'benefit.makeup': true } },
      { month: '2026-12', values: { 'benefit.makeup': true } }
    ];
    assert.deepEqual(planChange(chain, '2026-11', { 'benefit.makeup': false })?.carry, [
      { month: '2026-12', set: { 'benefit.makeup': false } }
    ]);
  });

  it('throws when no version is in force', () => {
    assert.throws(() => planChange([{ month: '2027-01', values: { a: 1 } }], '2026-11', { a: 2 }), /no version in force/);
  });
});

describe('versionAt', () => {
  it('picks the latest version not after the month', () => {
    const chain = [{ month: '2026-12' }, { month: '2000-01' }, { month: '2026-11' }];
    assert.equal(versionAt(chain, '2026-11')?.month, '2026-11');
    assert.equal(versionAt(chain, '2026-10')?.month, '2000-01');
    assert.equal(versionAt(chain, '1999-12'), null);
  });
});

const CUR = '2026-11';
const item = (changes: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  code: 'nv',
  expectedRev: 0,
  changes,
  ...extra
});
const positions = (over: Record<string, unknown> = {}) => ({ effectiveMonth: CUR, items: [item({ flexPct: 25 })], ...over });
const levelBody = (changes: Record<string, unknown>) => ({ effectiveMonth: CUR, expectedRev: 0, changes });
const addBody = (values: Record<string, unknown>) => ({
  effectiveMonth: CUR,
  level: 5,
  values: { name: 'Bậc 5', baseSalary: 9_000_000, kpiMax: null, nightPct: null, ...values }
});

describe('parseSavePositions / parseSaveLevel / parseAddLevel', () => {
  it('flattens ticks, trims the name and empties a blank reason', () => {
    const parsed = parseSavePositions(
      {
        effectiveMonth: '2026-11',
        reason: '  ',
        items: [{ code: 'nv', expectedRev: 0, changes: { flexPct: 25, name: ' NV ', benefits: { makeup: false } } }]
      },
      CUR
    );
    assert.deepEqual(parsed, {
      effectiveMonth: '2026-11',
      reason: null,
      items: [{ code: 'nv', expectedRev: 0, changes: { flexPct: 25, name: 'NV', 'benefit.makeup': false } }]
    });
    assert.equal(parseSavePositions(positions({ reason: ' Tăng Flex ' }), CUR).reason, 'Tăng Flex');
  });

  it('reads a level from the path and the full values of a new level', () => {
    const add = parseAddLevel('nv', addBody({}), CUR);
    assert.equal(add.level, 5);
    assert.deepEqual(add.values, { name: 'Bậc 5', baseSalary: 9_000_000, kpiMax: null, nightPct: null });
    const save = parseSaveLevel('tts', '2', levelBody({ kpiMax: null, nightPct: 50 }), CUR);
    assert.equal(save.level, 2);
    assert.deepEqual(save.changes, { kpiMax: null, nightPct: 50 });
  });

  it('names the month the save may start from', () => {
    assert.throws(
      () => parseSavePositions(positions({ effectiveMonth: '2026-10' }), CUR),
      (e: any) => e instanceof PositionInputError && e.field === 'effectiveMonth' && /từ 11\/2026 trở đi/.test(e.message)
    );
  });

  const BAD: Array<[string, () => unknown, string]> = [
    ['month in the past', () => parseSavePositions(positions({ effectiveMonth: '2026-10' }), CUR), 'effectiveMonth'],
    ['month 13', () => parseSavePositions(positions({ effectiveMonth: '2026-13' }), CUR), 'effectiveMonth'],
    ['no items', () => parseSavePositions(positions({ items: [] }), CUR), 'items'],
    ['same code twice', () => parseSavePositions(positions({ items: [item({}), item({})] }), CUR), 'items[1].code'],
    ['unknown code', () => parseSavePositions(positions({ items: [item({}, { code: 'ql' })] }), CUR), 'items[0].code'],
    [
      'missing rev',
      () => parseSavePositions(positions({ items: [{ code: 'nv', changes: {} }] }), CUR),
      'items[0].expectedRev'
    ],
    ['workdays 0', () => parseSavePositions(positions({ items: [item({ workdays: 0 })] }), CUR), 'items[0].changes.workdays'],
    ['workdays 32', () => parseSavePositions(positions({ items: [item({ workdays: 32 })] }), CUR), 'items[0].changes.workdays'],
    ['workdays 1.5', () => parseSavePositions(positions({ items: [item({ workdays: 1.5 })] }), CUR), 'items[0].changes.workdays'],
    ['flex -1', () => parseSavePositions(positions({ items: [item({ flexPct: -1 })] }), CUR), 'items[0].changes.flexPct'],
    ['flex 101', () => parseSavePositions(positions({ items: [item({ flexPct: 101 })] }), CUR), 'items[0].changes.flexPct'],
    ['flex as text', () => parseSavePositions(positions({ items: [item({ flexPct: '20' })] }), CUR), 'items[0].changes.flexPct'],
    ['blank name', () => parseSavePositions(positions({ items: [item({ name: '  ' })] }), CUR), 'items[0].changes.name'],
    [
      'name of 61',
      () => parseSavePositions(positions({ items: [item({ name: 'x'.repeat(61) })] }), CUR),
      'items[0].changes.name'
    ],
    ['nv night', () => parseSavePositions(positions({ items: [item({ nightPct: 40 })] }), CUR), 'items[0].changes.nightPct'],
    ['unknown field', () => parseSavePositions(positions({ items: [item({ foo: 1 })] }), CUR), 'items[0].changes.foo'],
    [
      'v1 tick',
      () => parseSavePositions(positions({ items: [item({ benefits: { approvedLeave: true } })] }), CUR),
      'items[0].changes.benefits.approvedLeave'
    ],
    [
      'tick as text',
      () => parseSavePositions(positions({ items: [item({ benefits: { kpi: 'yes' } })] }), CUR),
      'items[0].changes.benefits.kpi'
    ],
    ['reason of 301', () => parseSavePositions(positions({ reason: 'x'.repeat(301) }), CUR), 'reason'],
    ['level 0', () => parseSaveLevel('nv', '0', levelBody({}), CUR), 'level'],
    ['level abc', () => parseSaveLevel('nv', 'abc', levelBody({}), CUR), 'level'],
    ['salary 1.5', () => parseSaveLevel('tts', '1', levelBody({ baseSalary: 1.5 }), CUR), 'changes.baseSalary'],
    ['kpi -1', () => parseSaveLevel('tts', '1', levelBody({ kpiMax: -1 }), CUR), 'changes.kpiMax'],
    ['nv level night', () => parseSaveLevel('nv', '1', levelBody({ nightPct: 50 }), CUR), 'changes.nightPct'],
    ['level code', () => parseSaveLevel('ql', '1', levelBody({}), CUR), 'code'],
    ['level rev', () => parseSaveLevel('tts', '1', { effectiveMonth: CUR, changes: {} }, CUR), 'expectedRev'],
    ['add nv night', () => parseAddLevel('nv', addBody({ nightPct: 50 }), CUR), 'values.nightPct'],
    [
      'add without salary',
      () => parseAddLevel('tts', { effectiveMonth: CUR, level: 7, values: { name: 'Bậc 7', kpiMax: null, nightPct: null } }, CUR),
      'values.baseSalary'
    ],
    ['add level 0', () => parseAddLevel('tts', { ...addBody({}), level: 0 }, CUR), 'level']
  ];

  for (const [name, run, field] of BAD) {
    it(`rejects ${name} on ${field}`, () => {
      assert.throws(run, (e: any) => e instanceof PositionInputError && e.field === field);
    });
  }
});
