import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { ADMIN, type Api, ScenarioEnv } from '../helpers/scenario-env';

// Dữ liệu rác vào mọi route: không được có 5xx (lỗi đầu vào phải là 4xx), cả với admin lẫn nhân viên.
const env = new ScenarioEnv();
const enabled = ScenarioEnv.enabled();
let admin: Api;
let nv: Api;

before(async () => {
  if (enabled) await env.start('sc_fuzz');
});
after(async () => {
  if (enabled) await env.stop();
});
beforeEach(async () => {
  if (!enabled) return;
  await env.reset();
  await env.staff({ username: 'nv1' });
  env.at('2026-11-05T09:00:00+07:00');
  admin = await env.login(ADMIN);
  nv = await env.login('nv1');
});

const GARBAGE_QUERY = ['abc', '-1', '0', '1e9', '99999999999999999999', '2026-13', '2026-02-30', '%00', '%E0%A4%A', "'; DROP TABLE staff;--", '[]', '{}', 'null', '😀'];
const GARBAGE_BODIES: unknown[] = [{}, [], 'x', 5, null, { employeeId: 5 }, { employeeId: [] }, { employeeId: { a: 1 } }, { month: 5 }, { date: [] }, { action: {} }, { reason: 5 }, { startDate: 1, endDate: [] }, { slots: 'x' }, { slots: [null, 5, 'x'] }, { conditions: 5 }, { decision: {} }, { employeeIds: {} }];

const GET_ROUTES = [
  '/api/v2/employees?status=X&shiftType=Y&q=Z',
  '/api/v2/attendance/timesheets?employeeId=X&startDate=D&endDate=D&status=X',
  '/api/v2/attendance/punches?employeeId=X&workDate=D',
  '/api/v2/attendance/week?from=D&days=X&q=X&group=X&month=X',
  '/api/v2/attendance/employees/nv1?month=X',
  '/api/v2/overview?month=X&days=X',
  '/api/v2/requests?employeeId=X&type=X&status=X&limit=X&offset=X',
  '/api/v2/requests/explanations-due',
  '/api/v2/payroll/X',
  '/api/v2/payroll/2026-10/X',
  '/api/v2/system/periods/X',
  '/api/v2/system/audit?limit=X&offset=X&from=D&to=D&actor=X&action=X&subject=X&month=X&kind=X',
  '/api/v2/holidays?year=X',
  '/api/v2/settings?month=X',
  '/api/v2/settings/pay-days?year=X',
  '/api/v2/settings/work-weeks?month=X',
  '/api/v2/settings/work-weeks/nv1?month=X',
  '/api/v2/settings/X/history',
  '/api/v2/settings/attendance-zone/history',
  '/api/v2/employees/X',
  '/api/v2/attendance/timesheets/X/D'
];
const ME_GET = [
  '/api/v2/me/attendance?month=X',
  '/api/v2/me/attendance/X',
  '/api/v2/me/requests?status=X',
  '/api/v2/me/requests/X',
  '/api/v2/me/income?month=X'
];

describe('fuzz đầu vào: không 5xx', { skip: !enabled }, () => {
  it('GET admin với tham số rác', async () => {
    const bad: string[] = [];
    for (const route of GET_ROUTES) {
      for (const g of GARBAGE_QUERY) {
        const path = route.replace(/=X/g, `=${g}`).replace(/=D/g, `=${g}`).replace(/\/X(\/|\?|$)/g, `/${encodeURIComponent(g)}$1`).replace(/\/D$/, `/${encodeURIComponent(g)}`);
        const r = await admin.get(path);
        if (r.status >= 500) bad.push(`GET ${path} → ${r.status}`);
      }
    }
    assert.deepEqual(bad, []);
  });

  it('GET /me với tham số rác', async () => {
    const bad: string[] = [];
    for (const route of ME_GET) {
      for (const g of GARBAGE_QUERY) {
        const path = route.replace(/=X/g, `=${g}`).replace(/\/X$/, `/${encodeURIComponent(g)}`);
        const r = await nv.get(path);
        if (r.status >= 500) bad.push(`GET ${path} → ${r.status}`);
      }
    }
    assert.deepEqual(bad, []);
  });

  it('POST/PUT/PATCH/DELETE với thân rác', async () => {
    const targets: Array<[keyof Api, string, 'admin' | 'nv']> = [
      ['post', '/api/v2/attendance/punches', 'admin'],
      ['post', '/api/v2/attendance/recalculate', 'admin'],
      ['post', '/api/v2/requests/leave', 'admin'],
      ['post', '/api/v2/requests/leave-with-makeup', 'admin'],
      ['post', '/api/v2/requests/overtime', 'admin'],
      ['post', '/api/v2/requests/shift-change', 'admin'],
      ['post', '/api/v2/requests/explanation', 'admin'],
      ['post', '/api/v2/requests/advance', 'admin'],
      ['post', '/api/v2/requests/isat', 'admin'],
      ['post', '/api/v2/requests/explanations-due/remind', 'admin'],
      ['patch', '/api/v2/requests/11111111-1111-4111-8111-111111111111/review', 'admin'],
      ['patch', '/api/v2/requests/11111111-1111-4111-8111-111111111111/cancel', 'admin'],
      ['post', '/api/v2/payroll/2026-10/calculate', 'admin'],
      ['post', '/api/v2/payroll/2026-10/nv1/decision', 'admin'],
      ['put', '/api/v2/payroll/2026-10/kpi/nv1', 'admin'],
      ['post', '/api/v2/system/periods/2026-10/unlock', 'admin'],
      ['post', '/api/v2/system/periods/2026-10/unapprove', 'admin'],
      ['post', '/api/v2/holidays', 'admin'],
      ['post', '/api/v2/holidays/quick-add', 'admin'],
      ['put', '/api/v2/employees/nv1', 'admin'],
      ['post', '/api/v2/employees', 'admin'],
      ['put', '/api/v2/positions', 'admin'],
      ['put', '/api/v2/settings/attendance-zone', 'admin'],
      ['put', '/api/v2/settings/work-weeks/nv1', 'admin'],
      ['put', '/api/v2/settings/attendance', 'admin'],
      ['put', '/api/v2/system/settings/foo', 'admin'],
      ['post', '/api/v2/me/punches', 'nv'],
      ['post', '/api/v2/me/requests/leave', 'nv'],
      ['post', '/api/v2/me/requests/leave-with-makeup', 'nv'],
      ['post', '/api/v2/me/requests/overtime', 'nv'],
      ['post', '/api/v2/me/requests/shift-change', 'nv'],
      ['post', '/api/v2/me/requests/explanation', 'nv'],
      ['post', '/api/v2/me/requests/advance', 'nv'],
      ['post', '/api/v2/me/requests/isat', 'nv'],
      ['post', '/api/v2/me/requests/leave/preview', 'nv'],
      ['patch', '/api/v2/me/requests/11111111-1111-4111-8111-111111111111/cancel', 'nv'],
      ['put', '/api/v2/auth/password', 'nv']
    ];
    const bad: string[] = [];
    for (const [m, path, who] of targets) {
      for (const body of GARBAGE_BODIES) {
        const api = who === 'admin' ? admin : nv;
        const r = await (api as any)[m](path, body);
        if (r.status >= 500) bad.push(`${m.toUpperCase()} ${path} ${JSON.stringify(body)} → ${r.status}`);
      }
    }
    assert.deepEqual(bad, []);
  });

  it('thân đúng dạng nhưng từng trường mang kiểu/giá trị sai: không 5xx', async () => {
    const templates: Array<[keyof Api, string, 'admin' | 'nv', Record<string, unknown>]> = [
      ['post', '/api/v2/me/requests/leave', 'nv', { leaveType: 'ANNUAL', reason: 'x', startDate: '2026-11-10', endDate: '2026-11-11' }],
      ['post', '/api/v2/me/requests/leave-with-makeup', 'nv', { reason: 'x', startDate: '2026-11-10', endDate: '2026-11-10', slots: [{ date: '2026-11-12', startTime: '18:00', endTime: '22:00' }] }],
      ['post', '/api/v2/me/requests/overtime', 'nv', { reason: 'x', otDate: '2026-11-10', startTime: '18:00', endTime: '20:00' }],
      ['post', '/api/v2/me/requests/shift-change', 'nv', { reason: 'x', startDate: '2026-11-10', endDate: '2026-11-11', shiftType: 'FLEX', startTime: '13:00' }],
      ['post', '/api/v2/me/requests/explanation', 'nv', { reason: 'x', workDate: '2026-11-03', actualCheckIn: '08:00', actualCheckOut: '17:00' }],
      ['post', '/api/v2/me/requests/isat', 'nv', { saturday: '2026-11-14', team: 'T', conditions: { NO_VIOLATION: true } }],
      ['post', '/api/v2/me/punches', 'nv', { kind: 'IN', lat: 10.8, lng: 106.7, accuracyM: 5 }],
      ['post', '/api/v2/requests/advance', 'admin', { employeeId: 'nv1', period: '2026-11' }],
      ['post', '/api/v2/requests/leave', 'admin', { employeeId: 'nv1', leaveType: 'ANNUAL', reason: 'x', startDate: '2026-11-10', endDate: '2026-11-11' }],
      ['post', '/api/v2/attendance/punches', 'admin', { employeeId: 'nv1', type: 'IN', punchedAt: '2026-11-03T08:00:00+07:00', workDate: '2026-11-03', latitude: 1, longitude: 1, accuracyMeters: 1, note: 'x' }],
      ['put', '/api/v2/payroll/2026-10/kpi/nv1', 'admin', { wework: 80, user: 80, peer: 80, manager: 80, self: 80, proposedAmount: 1000 }],
      ['post', '/api/v2/holidays', 'admin', { date: '2026-12-25', name: 'Noel' }],
      ['put', '/api/v2/employees/nv1', 'admin', { name: 'A', birthday: '1990-01-01', dependants: 1, contract: 'long', insured: true, shiftType: 'NORMAL', shiftStartTime: '08:00', shiftEndTime: '17:00', positionType: 'nv', positionLevel: 1 }],
      ['patch', '/api/v2/requests/11111111-1111-4111-8111-111111111111/review', 'admin', { action: 'APPROVE', note: 'x' }]
    ];
    const junk: unknown[] = [null, 5, [], {}, '', true, '2026-02-30', 'x'.repeat(3000)];
    const bad: string[] = [];
    for (const [m, path, who, tpl] of templates) {
      const api = who === 'admin' ? admin : nv;
      for (const key of Object.keys(tpl)) {
        for (const j of junk) {
          const r = await (api as any)[m](path, { ...tpl, [key]: j });
          if (r.status >= 500) bad.push(`${m.toUpperCase()} ${path} ${key}=${JSON.stringify(j)?.slice(0, 30)} → ${r.status}`);
        }
      }
    }
    assert.deepEqual(bad, []);
  });

  it('thân không phải JSON / sai content-type / quá lớn: 4xx', async () => {
    const cookie = String((await env.rawLogin(ADMIN)).headers.get('set-cookie')).split(';')[0];
    const send = (headers: Record<string, string>, body: string) =>
      fetch(env.base + '/api/v2/holidays', { method: 'POST', headers: { cookie, ...headers }, body });
    assert.ok((await send({ 'content-type': 'application/json' }, '{bad json')).status < 500);
    assert.ok((await send({ 'content-type': 'text/plain' }, 'x')).status < 500);
    assert.ok((await send({ 'content-type': 'application/json' }, JSON.stringify({ name: 'x'.repeat(2_000_000) }))).status < 500);
  });

  it('hồi quy: PUT cấu hình hệ thống thiếu value / null → 400; ngày công /me không có thật → 400', async () => {
    for (const body of [{}, { value: null }]) {
      const r = await admin.put('/api/v2/system/settings/foo', body);
      assert.equal(r.status, 400, JSON.stringify(body));
      assert.equal(r.body.code, 'BAD_SETTING_INPUT');
    }
    assert.equal((await admin.put('/api/v2/system/settings/foo', { value: 'ok' })).status, 200);
    for (const d of ['2026-02-30', '2026-13-01', '20261103', '2026-11-3']) {
      assert.equal((await nv.get(`/api/v2/me/attendance/${d}`)).status, 400, d);
    }
  });
});
