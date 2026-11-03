'use strict';
// Giới hạn giờ của OT và làm thêm chỉ gồm DAY_HOURS_CAP (giờ ròng một ngày) và MONTH_OT_CAP (OT cộng giờ ca chính ngày lễ một tháng).
// Không còn khoá tham số, hằng số hay kiểm tra cho: OT tối đa mỗi ngày, OT cộng giờ lễ tối đa mỗi tháng, OT cộng dồn năm, độ dài mỗi
// đoạn làm thêm; các khoá cũ truyền vào bộ tham số không đổi kết quả kiểm.
require('../helpers/require-isolated-database');
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const store = require('../../src/platform/db');
const registry = require('../../src/params/registry');
const limits = require('../../src/domain/overtime/hour-limits').HourLimits;
const workHours = require('../../src/domain/overtime/worked-hours').WorkedHours;
const { DEFAULTS } = require('../../src/engine/payroll-params');

after(() => store.db.close());

const ROOT = path.join(__dirname, '../..');
const read = (file?) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const REMOVED_KEYS = [
  'ot.dayCapHours',
  'ot.holidayMonthCapHours',
  'ot.yearCapHours',
  'time.maxExtraHours',
  'law.ceiling.otDayShare',
  'law.ceiling.otYearHours'
];
const REMOVED_NAMES = [
  'SHEET_OT_DAY_CAP',
  'SHEET_HOLIDAY_OT_MONTH',
  'SHEET_OT_YEAR_CAP',
  'OT_DAY_CAP',
  'OT_HOLIDAY_MONTH_CAP',
  'MAX_EXTRA',
  'OT_NIGHT_OR_LONG'
];
const shift = (extra: any = {}) => ({ kind: 'work', in: '08:00', out: '17:00', ...extra });
const ot = (extraOut?) => shift({ extraKind: 'ot', extraOut });

test('các khoá giới hạn giờ đã bỏ không còn trong DEFAULTS, registry và tệp mô tả tham số', async () => {
  for (const key of REMOVED_KEYS) {
    assert.ok(!Object.hasOwn(DEFAULTS, key), `DEFAULTS ${key}`);
    assert.equal(registry.entryFor(key), null, `registry ${key}`);
  }
  for (const file of [
    'src/params/registry.data.json',
    'src/params/keys.lock.json',
    'scripts/params/hand-defaults.json',
    'scripts/params/plain-text.json'
  ])
    for (const key of REMOVED_KEYS) assert.ok(!(await read(file)).includes(`"${key}"`), `${file}: ${key}`);
});

test('hai trần còn lại vẫn có khoá nguồn: law.ceiling.otDayTotalHours (12) và law.ceiling.otMonthHours (40)', () => {
  assert.equal(DEFAULTS['law.ceiling.otDayTotalHours'], 12);
  assert.equal(DEFAULTS['law.ceiling.otMonthHours'], 40);
  assert.equal(limits.DAY_HOURS_CAP, 12);
  assert.equal(limits.MONTH_OT_CAP, 40);
});

test('không còn mã đọc khoá hay hằng số của các giới hạn giờ đã bỏ trong máy chủ, bộ máy và giao diện', async () => {
  const walk = (folder?) =>
    fs.readdirSync(path.join(ROOT, folder), { withFileTypes: true }).flatMap(entry => {
      const rel = path.posix.join(folder, entry.name);
      return entry.isDirectory() ? walk(rel) : /\.(js|cjs|html|json)$/.test(entry.name) ? [rel] : [];
    });
  const files = [...walk('src'), ...walk('scripts')];
  for (const file of files) {
    const text = await read(file);
    for (const key of REMOVED_KEYS) assert.ok(!text.includes(key), `${file}: ${key}`);
    for (const name of REMOVED_NAMES) assert.ok(!new RegExp(`\\b${name}\\b`).test(text), `${file}: ${name}`);
  }
});

test('mô-đun giới hạn và giờ làm không xuất hằng số của giới hạn đã bỏ', () => {
  assert.deepEqual(
    Object.keys(limits).filter(name => /YEAR|DAY_CAP|HOLIDAY/.test(name)),
    []
  );
  assert.equal(workHours.MAX_EXTRA, undefined);
});

test('OT 5 giờ trong ngày (ca 4 giờ) và OT 20 giờ trong tháng đều qua kiểm giới hạn, dù truyền các khoá tham số cũ', async () => {
  const legacy = { 'ot.dayCapHours': 1, 'ot.holidayMonthCapHours': 1, 'ot.yearCapHours': 1, 'time.maxExtraHours': 1 };
  const shortShift = { kind: 'work', in: '08:00', out: '12:00', extraKind: 'ot', extraOut: '17:00' };
  assert.equal(limits.dayNetHours(shortShift, { breakHours: 1, breakAfterHours: 4 }), 9);
  const days = Object.fromEntries(
    ['01', '02', '05', '06', '07'].map(d => [`2026-10-${d}`, ot('21:00')]) // 5 ngày × 4 giờ = 20 giờ
  );
  days['2026-10-08'] = shortShift;
  await assert.doesNotReject(async () =>
    limits.checkSheetLimits({ params: legacy, month: '2026-10', clean: days, prevDays: {}, holidays: ['2026-10-12'] })
  );
});
