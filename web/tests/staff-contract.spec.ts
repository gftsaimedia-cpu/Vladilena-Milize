import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { staffListFromEmployees } from '../src/builders/api/staff';
import { staffListDto } from '../src/mock/staff';

// Chạy phía Node. Hợp đồng GET /api/v2/employees: fixture là phản hồi THẬT của BE (test/v2/employees-summary.pg.test.ts);
// DTO của dữ liệu giả phải cùng cấu trúc khoá (work, summary).
const read = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/api/${name}.json`, import.meta.url), 'utf8'));
const fixture = read('employees');

function diff(a: any, b: any, path = ''): string[] {
  if (a === null || b === null) return [];
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return [`${path}: mảng khác không phải mảng`];
    return a.length && b.length ? diff(a[0], b[0], `${path}[]`) : [];
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const out: string[] = [];
    // byType, byLevel là bảng tra theo mã nên khoá thay đổi theo dữ liệu: chỉ so kiểu của giá trị.
    if (/\.by(Type|Level)$/.test(path)) return out;
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (!(k in a)) out.push(`${path}.${k}: thừa ở mock`);
      else if (!(k in b)) out.push(`${path}.${k}: thiếu ở mock`);
      else out.push(...diff(a[k], b[k], `${path}.${k}`));
    }
    return out;
  }
  return typeof a === typeof b ? [] : [`${path}: kiểu ${typeof a} khác ${typeof b}`];
}

test('mock employees DTO has the same key structure as the real BE response', () => {
  expect(diff(fixture, staffListDto())).toEqual([]);
  expect(diff(read('employee-one').employee, staffListDto().employees[0])).toEqual([]);
});

test('builder only maps the real BE response', () => {
  const v = staffListFromEmployees(fixture);
  expect(v.total).toBe(6);
  expect(v.rows.map(r => r.id)).toEqual(['a', 'b', 'boss', 'c', 'd', 'e']);
  expect(v.stats.map(s => s.value)).toEqual(['4', '1', '1', '0,7']);
});
