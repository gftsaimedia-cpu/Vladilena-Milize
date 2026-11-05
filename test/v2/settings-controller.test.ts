import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ACCESS_KEY } from '../../src/common';
import { SettingsController } from '../../src/modules/settings/settings.controller';
import {
  SettingsEmployeeNotFoundError,
  SettingsGroupNotFoundError,
  SettingsInputError,
  SettingsStaleError
} from '../../src/modules/settings/settings.errors';

const user = { username: 'admin' } as any;

const METHODS = [
  'getAll',
  'payDays',
  'getZone',
  'saveZone',
  'zoneHistory',
  'getWorkWeek',
  'saveWorkWeek',
  'workWeekHistory',
  'saveGroup',
  'groupHistory'
] as const;

/** Mỗi method của service ném `err`. */
const failing = (err: Error) =>
  new SettingsController(
    Object.fromEntries(
      METHODS.map(m => [
        m,
        async () => {
          throw err;
        }
      ])
    ) as any
  );

/** Gọi mọi handler của controller một lần. */
const callAll = (ctrl: SettingsController) => [
  () => ctrl.getAll('2026-11'),
  () => ctrl.payDays('2026'),
  () => ctrl.getZone(),
  () => ctrl.saveZone({}, user),
  () => ctrl.zoneHistory(),
  () => ctrl.getWorkWeek('binh', '2026-11'),
  () => ctrl.saveWorkWeek('binh', {}, user),
  () => ctrl.workWeekHistory('binh'),
  () => ctrl.saveGroup('overtime', {}, user),
  () => ctrl.groupHistory('overtime')
];

describe('SettingsController', () => {
  const READ = { kind: 'cap', cap: 'config.read' };
  const WRITE = { kind: 'cap', cap: 'config.write' };
  const ACCESS: Array<[(typeof METHODS)[number], unknown]> = [
    ['getAll', READ],
    ['payDays', READ],
    ['getZone', READ],
    ['saveZone', WRITE],
    ['zoneHistory', READ],
    ['getWorkWeek', READ],
    ['saveWorkWeek', WRITE],
    ['workWeekHistory', READ],
    ['saveGroup', WRITE],
    ['groupHistory', READ]
  ];

  for (const [method, rule] of ACCESS) {
    it(`${method} needs ${(rule as any).cap}`, () => {
      assert.deepEqual(Reflect.getMetadata(ACCESS_KEY, SettingsController.prototype[method]), rule);
    });
  }

  it('serves the routes of the route table', () => {
    const routes: Array<[(typeof METHODS)[number], number, string]> = [
      ['getAll', RequestMethod.GET, '/'],
      ['payDays', RequestMethod.GET, 'pay-days'],
      ['getZone', RequestMethod.GET, 'attendance-zone'],
      ['saveZone', RequestMethod.PUT, 'attendance-zone'],
      ['zoneHistory', RequestMethod.GET, 'attendance-zone/history'],
      ['getWorkWeek', RequestMethod.GET, 'work-weeks/:username'],
      ['saveWorkWeek', RequestMethod.PUT, 'work-weeks/:username'],
      ['workWeekHistory', RequestMethod.GET, 'work-weeks/:username/history'],
      ['saveGroup', RequestMethod.PUT, ':group'],
      ['groupHistory', RequestMethod.GET, ':group/history']
    ];
    assert.equal(Reflect.getMetadata(PATH_METADATA, SettingsController), 'api/v2/settings');
    for (const [m, verb, path] of routes) {
      const fn = SettingsController.prototype[m];
      assert.equal(Reflect.getMetadata(METHOD_METADATA, fn), verb, `${m} verb`);
      assert.equal(Reflect.getMetadata(PATH_METADATA, fn), path, `${m} path`);
    }
  });

  it('declares specific routes before the :group catch-alls', () => {
    const names = Object.getOwnPropertyNames(SettingsController.prototype);
    assert.ok(names.indexOf('saveZone') < names.indexOf('saveGroup'));
    assert.ok(names.indexOf('zoneHistory') < names.indexOf('groupHistory'));
    assert.ok(names.indexOf('saveWorkWeek') < names.indexOf('saveGroup'));
    assert.ok(names.indexOf('workWeekHistory') < names.indexOf('groupHistory'));
  });

  const CASES: Array<[Error, number, string, Record<string, unknown>]> = [
    [new SettingsInputError('Số sai', 'weekdayRate'), 400, 'BAD_SETTINGS_INPUT', { field: 'weekdayRate' }],
    [new SettingsGroupNotFoundError('x'), 404, 'SETTINGS_GROUP_NOT_FOUND', {}],
    [new SettingsEmployeeNotFoundError('x'), 404, 'EMPLOYEE_NOT_FOUND', {}],
    [new SettingsStaleError('x', 7), 409, 'SETTINGS_STALE', { stamp: 7 }]
  ];

  for (const [err, status, code, extra] of CASES) {
    it(`maps ${err.name} to ${status} ${code} on every route`, async () => {
      const ctrl = failing(err);
      for (const call of callAll(ctrl)) {
        await assert.rejects(call(), (e: any) => {
          assert.equal(e.status, status);
          assert.equal(e.details?.code, code);
          for (const [k, v] of Object.entries(extra)) assert.equal(e.details?.[k], v);
          return true;
        });
      }
    });
  }

  it('passes other errors through', async () => {
    const boom = new Error('db');
    for (const call of callAll(failing(boom))) await assert.rejects(call(), (e: any) => e === boom);
  });

  it('hands the raw params, body and username to the service', async () => {
    const seen: unknown[][] = [];
    const rec =
      (name: string) =>
      async (...args: unknown[]) => {
        seen.push([name, ...args]);
        return { ok: true };
      };
    const ctrl = new SettingsController(Object.fromEntries(METHODS.map(m => [m, rec(m)])) as any);
    const body = { values: { weekdayRate: 1.5 } };

    await ctrl.getAll('2026-11');
    await ctrl.getAll(undefined as any);
    await ctrl.payDays('2026');
    await ctrl.getZone();
    await ctrl.saveZone(body, user);
    await ctrl.zoneHistory();
    await ctrl.getWorkWeek('binh', '2026-11');
    await ctrl.saveWorkWeek('binh', body, user);
    await ctrl.workWeekHistory('binh');
    await ctrl.saveGroup('overtime', body, user);
    await ctrl.groupHistory('overtime');

    assert.deepEqual(seen, [
      ['getAll', '2026-11'],
      ['getAll', undefined],
      ['payDays', '2026'],
      ['getZone'],
      ['saveZone', body, 'admin'],
      ['zoneHistory'],
      ['getWorkWeek', 'binh', '2026-11'],
      ['saveWorkWeek', 'binh', body, 'admin'],
      ['workWeekHistory', 'binh'],
      ['saveGroup', 'overtime', body, 'admin'],
      ['groupHistory', 'overtime']
    ]);
  });
});
