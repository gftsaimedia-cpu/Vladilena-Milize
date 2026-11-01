'use strict';
// Một hệ thống lương: tháng không bao giờ đổi cách tính. Test quét mã nguồn và spec, đỏ khi tên của công tắc theo tháng xuất hiện lại.
// Ngoại lệ: tên khoá đã bỏ trong bảng khoá của tham số (src/params), danh sách chữ hiển thị của scripts/params, và chính file này.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '../..');
const SCAN = ['src', 'scripts', 'spec'];
const TEXT = /\.(js|cjs|mjs|ts|json|md|html|css)$/;
const SKIP_FILES = new Set<any>([
  'src/params/registry.data.json',
  'src/params/keys.lock.json',
  'scripts/params/plain-text.json',
  'test/unit/no-month-rules.test.ts'
]);
const FORBIDDEN = [
  'REORG_FROM_MONTH',
  'GO_LIVE',
  'FIRST_MANAGED_MONTH',
  'firstManagedMonth',
  'period_first_managed_month',
  'actual_hours_from',
  'actualHoursFrom',
  'getActualHoursFrom',
  'setActualHoursFrom',
  'actualFrom',
  'checkinFrom',
  'kpiFrom',
  'kpi_five_from',
  'getKpiFiveFrom',
  'PERIOD_UNMANAGED',
  'ACTUAL_FROM_PAST',
  'shiftSwitchDate',
  'punchPayFrom',
  'calendarPay',
  'methodOf'
];

function* filesUnder(rel?) {
  const full = path.join(ROOT, rel);
  const stat = fs.statSync(full);
  if (stat.isFile()) {
    yield rel;
    return;
  }
  for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    yield* filesUnder(path.posix.join(rel.split(path.sep).join('/'), entry.name));
  }
}

test('mã nguồn và spec không còn tên công tắc theo tháng (luật tháng 10 / luật tháng 11, ngày bật Check-in/out, tháng quản lý đầu tiên)', () => {
  const hits: any[] = [];
  let scanned = 0;
  for (const root of SCAN)
    for (const rel of filesUnder(root)) {
      if (!TEXT.test(rel) || SKIP_FILES.has(rel)) continue;
      scanned += 1;
      const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      for (const word of FORBIDDEN) if (text.includes(word)) hits.push(`${rel}: ${word}`);
    }
  assert.ok(scanned > 200, 'quét được ' + scanned + ' file');
  assert.deepEqual(hits, []);
});

test('tên công tắc theo tháng chỉ còn trong bảng khoá đã bỏ của tham số, không có khoá nào sống', () => {
  const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/params/registry.data.json'), 'utf8'));
  const alive: any[] = [];
  const walk = (value?) => {
    if (Array.isArray(value)) return value.forEach(walk);
    if (!value || typeof value !== 'object') return;
    if (
      typeof value.key === 'string' &&
      value.class !== 'removed' &&
      /actualHoursFrom|shiftSwitchDate|switch\./.test(value.key)
    )
      alive.push(value.key);
    Object.values<any>(value).forEach(walk);
  };
  walk(registry);
  assert.deepEqual(alive, []);
});
