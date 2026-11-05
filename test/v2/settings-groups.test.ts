import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  SETTING_GROUPS,
  decodeValues,
  defaultsOf,
  encodeValues,
  limitsOf,
  validateGroupChange,
  type Bracket,
  type GroupKey
} from '../../src/modules/settings/domain/setting-groups';
import { SettingsInputError } from '../../src/modules/settings/settings.errors';

const bad = (g: GroupKey, values: unknown, field: string) =>
  assert.throws(
    () => validateGroupChange(g, values),
    (e: any) => e instanceof SettingsInputError && e.field === field
  );

describe('setting groups', () => {
  it('gives defaults and limits', () => {
    assert.deepEqual(defaultsOf('overtime'), { weekdayRate: 1.5, weekendRate: 2, holidayRate: 3 });
    assert.deepEqual(defaultsOf('kpi-weights'), { wework: 40, user: 24, peer: 18, manager: 12, self: 6 });
    assert.deepEqual(limitsOf('overtime').weekdayRate, { min: 1.5, max: 5, step: 0.01 });
    assert.deepEqual(limitsOf('tax').brackets, {
      minRows: 1,
      maxRows: 10,
      upTo: { min: 1, max: 1000000000, step: 1 },
      ratePct: { min: 0, max: 100, step: 0.01 }
    });
    assert.equal(SETTING_GROUPS['kpi-weights'].sum, 100);
    assert.equal((defaultsOf('tax').brackets as Bracket[]).at(-1)!.upTo, null);
  });

  it('accepts values on the 0.01 grid and rejects others', () => {
    for (const v of [1.5, 1.55, 1.6, 4.99, 5])
      assert.deepEqual(validateGroupChange('overtime', { weekdayRate: v }), { weekdayRate: v });
    bad('overtime', { weekdayRate: 1.49 }, 'weekdayRate');
    bad('overtime', { weekdayRate: 5.01 }, 'weekdayRate');
    bad('overtime', { weekdayRate: 1.555 }, 'weekdayRate');
    bad('overtime', { weekdayRate: '1.6' }, 'weekdayRate');
    bad('overtime', { weekdayRate: Number.NaN }, 'weekdayRate');
    bad('overtime', { foo: 1 }, 'foo');
    bad('overtime', {}, 'values');
    bad('overtime', null, 'values');
  });

  it('checks whole numbers, KPI sum and payday', () => {
    assert.deepEqual(validateGroupChange('attendance', { lateGraceMinutes: 10 }), { lateGraceMinutes: 10 });
    bad('attendance', { lateGraceMinutes: 10.5 }, 'lateGraceMinutes');
    bad('attendance', { lateGraceMinutes: 61 }, 'lateGraceMinutes');
    bad('attendance', { diligenceLostFromDays: 0 }, 'diligenceLostFromDays');
    assert.deepEqual(validateGroupChange('kpi-weights', { wework: 50, user: 20, peer: 15, manager: 10, self: 5 }), {
      wework: 50,
      user: 20,
      peer: 15,
      manager: 10,
      self: 5
    });
    bad('kpi-weights', { wework: 50 }, 'user');
    bad('kpi-weights', { wework: 40, user: 24, peer: 18, manager: 12, self: 4 }, 'sum');
    bad('insurance', { bhytPct: 100.01 }, 'bhytPct');
    bad('pay-calendar', { payDay: 29 }, 'payDay');
    bad('tax', { personalDeduction: 15500000.5 }, 'personalDeduction');
  });

  it('checks tax brackets as a whole', () => {
    const ok = [
      { upTo: 20000000, ratePct: 10 },
      { upTo: null, ratePct: 20 }
    ];
    assert.deepEqual(validateGroupChange('tax', { brackets: ok }), { brackets: ok });
    for (const b of [
      [],
      Array.from({ length: 11 }, (_, i) => ({ upTo: i === 10 ? null : (i + 1) * 1000000, ratePct: 5 })),
      [
        { upTo: null, ratePct: 5 },
        { upTo: null, ratePct: 10 }
      ],
      [
        { upTo: 30000000, ratePct: 5 },
        { upTo: 10000000, ratePct: 10 },
        { upTo: null, ratePct: 20 }
      ],
      [{ upTo: 10000000, ratePct: 5 }],
      [
        { upTo: '10000000', ratePct: 5 },
        { upTo: null, ratePct: 10 }
      ],
      [
        { upTo: 10000000, ratePct: 100.5 },
        { upTo: null, ratePct: 10 }
      ]
    ])
      bad('tax', { brackets: b }, 'brackets');
  });

  it('round-trips brackets through the chain encoding', () => {
    const enc = encodeValues(defaultsOf('tax'));
    assert.equal(typeof enc.brackets, 'string');
    assert.deepEqual(decodeValues('tax', enc), defaultsOf('tax'));
  });
});
