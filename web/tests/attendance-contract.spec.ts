import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { attendanceFromWeek, employeeFromDto } from '../src/builders/api/attendance';
import { weekDto } from '../src/mock/attendance';
import { employeeDto } from '../src/mock/attendance-employee';

// Hợp đồng: DTO của dữ liệu giả có đúng cấu trúc khoá (đệ quy) và kiểu giá trị như phản hồi THẬT của BE (web/tests/fixtures/api),
// và builder chạy được trên chính phản hồi BE đó. Không dùng trình duyệt.
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/api/${name}.json`, import.meta.url), 'utf8'));

type Shape = { [key: string]: Shape } | { '[]': Shape } | string;
const typeOf = (v: unknown): string => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);

/** Gộp mọi phần tử của mảng thành một cấu trúc: khoá nào xuất hiện ở bất kỳ phần tử nào thì có mặt. */
function shapeOf(v: unknown): Shape {
  if (Array.isArray(v)) {
    const merged: Record<string, Shape> = {};
    for (const item of v) merge(merged, shapeOf(item));
    return { '[]': v.length ? merged : 'empty' };
  }
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shapeOf(x)]));
  return typeOf(v);
}
function merge(into: Record<string, Shape>, s: Shape) {
  if (typeof s === 'string') {
    into['$'] = into['$'] && into['$'] !== 'null' ? into['$'] : s;
    return;
  }
  for (const [k, x] of Object.entries(s)) {
    if (k in into && typeof into[k] !== 'string' && typeof x !== 'string') merge(into[k] as Record<string, Shape>, x);
    else if (!(k in into) || into[k] === 'null') into[k] = x;
  }
}

/** So hai cấu trúc: cùng tập khoá; kiểu giá trị giống nhau (null khớp mọi kiểu vì BE trả null khi trống); mảng rỗng một bên thì bỏ qua. */
function diff(a: Shape, b: Shape, path: string, out: string[]) {
  if (typeof a === 'string' || typeof b === 'string') {
    if (a !== b && a !== 'null' && b !== 'null' && a !== 'empty' && b !== 'empty') out.push(`${path}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
    return;
  }
  if ('[]' in a || '[]' in b) {
    const x = (a as any)['[]'];
    const y = (b as any)['[]'];
    if (x === undefined || y === undefined) out.push(`${path}: một bên không phải mảng`);
    else if (x !== 'empty' && y !== 'empty') diff(x, y, `${path}[]`, out);
    return;
  }
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (!(k in a)) out.push(`${path}.${k}: thiếu ở mock`);
    else if (!(k in b)) out.push(`${path}.${k}: thừa ở mock`);
    else diff(a[k], b[k], `${path}.${k}`, out);
  }
}

test('DTO giả của lưới tuần cùng cấu trúc khoá với phản hồi BE', () => {
  const out: string[] = [];
  diff(shapeOf(weekDto({ month: '2026-10' })), shapeOf(fixture('attendance-week')), 'week', out);
  expect(out).toEqual([]);
});

test('DTO giả của hồ sơ chấm công cùng cấu trúc khoá với phản hồi BE', () => {
  const out: string[] = [];
  diff(shapeOf(employeeDto('tran-minh-quan', '2026-10')), shapeOf(fixture('attendance-employee')), 'employee', out);
  expect(out).toEqual([]);
});

test('builder chạy trên phản hồi BE thật và giữ nguyên số liệu của BE', () => {
  const week = fixture('attendance-week');
  const view = attendanceFromWeek(week, []);
  expect(view.rows.map(r => r.totals)).toEqual(week.rows.map((r: any) => r.totals));
  expect(view.rows.map(r => r.needsAction)).toEqual(week.rows.map((r: any) => r.needsAction));
  expect(view.groups).toEqual(week.groups);
  expect(view.tiles.map(t => t.value)).toEqual(['6', '1 / 3', '0', '0', '4', '0 giờ']);
  const emp = fixture('attendance-employee');
  const profile = employeeFromDto(emp);
  expect(profile.data.chips).toEqual(emp.chips);
  expect([profile.prevId, profile.nextId]).toEqual([emp.prev, emp.next]);
  expect(profile.data.history.map(h => h.date)).toEqual(emp.dayHistory.map((h: any) => h.date));
});

test('mock và builder dùng được cùng nhau (mock → builder không lỗi, tổng giữ nguyên)', () => {
  const dto = weekDto({ month: '2026-10', q: 'ha' })!;
  const view = attendanceFromWeek(dto, []);
  expect(view.matched).toBe(dto.rows.length);
  expect(view.rows.every(r => /ha/i.test(r.person.name.normalize('NFD').replace(/[̀-ͯ]/g, '')) || /ha/.test(r.person.id))).toBe(true);
});
