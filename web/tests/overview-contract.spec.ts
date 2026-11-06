import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { overviewFrom } from '../src/builders/api/overview';
import { overviewDto, type OverviewDTO } from '../src/mock/overview';

// Chạy phía Node. Hợp đồng GET /api/v2/overview: fixture là phản hồi THẬT của BE; DTO của dữ liệu giả phải cùng cấu trúc khoá.
const fixture: OverviewDTO = JSON.parse(readFileSync(new URL('./fixtures/api/overview.json', import.meta.url), 'utf8'));

// Cấu trúc khoá đệ quy; mảng lấy phần tử đầu; null không ràng buộc (giá trị có thể vắng).
function shape(v: unknown): unknown {
  if (Array.isArray(v)) return v.length ? [shape(v[0])] : [];
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).sort().map(([k, x]) => [k, shape(x)]));
  return v === null ? null : typeof v;
}
function diff(a: any, b: any, path = ''): string[] {
  if (a === null || b === null) return [];
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return [`${path}: mảng khác không phải mảng`];
    return a.length && b.length ? diff(a[0], b[0], `${path}[]`) : [];
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const out: string[] = [];
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (!(k in a)) out.push(`${path}.${k}: thừa ở mock`);
      else if (!(k in b)) out.push(`${path}.${k}: thiếu ở mock`);
      else out.push(...diff(a[k], b[k], `${path}.${k}`));
    }
    return out;
  }
  return typeof a === typeof b ? [] : [`${path}: kiểu ${typeof a} khác ${typeof b}`];
}

test('mock overview DTO has the same key structure as the real BE response', () => {
  expect(diff(shape(fixture), shape(overviewDto('2026-10')))).toEqual([]);
});

test('builder maps the real BE response without computing anything', () => {
  const v = overviewFrom(fixture);
  expect(v.headline).toEqual({ blocking: 93, closeOn: '31/10', daysLeft: 11 });
  const k = Object.fromEntries(v.kpis.map(x => [x.key, x]));
  expect(k.staff.value).toBe('3');
  expect(k.present).toMatchObject({ value: '1', of: '3', note: '2 người chưa chấm công vào' });
  expect(k.requests.value).toBe('1');
  expect(k.payroll).toMatchObject({ value: '0,02', note: '2 phiếu lương' });
  expect(k.payroll.delta).toBeUndefined();
  expect(v.attendance).toMatchObject({ todayRate: 33, present: 1, total: 3 });
  expect(v.attendance.days).toHaveLength(6);
  expect(v.attendance.days.at(-1)).toEqual({ dow: 'Hôm nay', date: '20/10', rate: 33, today: true });
  expect(v.period).toMatchObject({
    statusLabel: 'Chờ duyệt',
    range: '01/10 – 31/10/2026',
    payday: '10/11/2026',
    netShare: 100,
    slips: { done: 0, pending: 0, draft: 2, rejected: 0, total: 2 }
  });
  expect(v.approvals.total).toBe(93);
  expect(v.approvals.groups).toEqual(fixture.approvals.groups);
  expect(v.approvals.items).toHaveLength(8);
  expect(v.approvals.items[0]).toMatchObject({ id: fixture.approvals.items[0].id, action: 'decide', name: 'Trần Thị Hai', personId: 'nv2', what: 'Nghỉ phép' });
  expect(v.payroll).toMatchObject({ updatedAt: '12:00', total: 2 });
  expect(v.payroll.rows[0]).toMatchObject({ id: 'nv1', days: '0 / 0', net: '7.000.000', status: 'draft' });
});

test('builder shows the month-over-month delta only when BE sends previous', () => {
  const v = overviewFrom({ ...fixture, payroll: { ...fixture.payroll, previous: { gross: 1, net: 1, grossDeltaPct: -3.2 } } });
  expect(v.kpis[0].delta).toEqual({ dir: 'down', text: '3,2%', good: true });
});

test('builder keeps request details (head, sub, facts) from GET /requests by id', () => {
  const detail = { ...overviewFrom(fixture).approvals.items[0], head: 'Nghỉ phép · 2 ngày', sub: 'Thứ Tư 15/10 – Thứ Năm 16/10', facts: [['Lý do', '“Về quê”']] as [string, string][] };
  const v = overviewFrom(fixture, new Map([[detail.id, detail]]));
  expect(v.approvals.items[0]).toMatchObject({ head: 'Nghỉ phép · 2 ngày', sub: detail.sub, facts: detail.facts, name: 'Trần Thị Hai' });
});
