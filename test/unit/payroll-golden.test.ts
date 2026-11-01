'use strict';
// Ca vàng của khối công thức lương cũ: 300 ca người bịa, đầu vào và kết quả
// của khối đã đóng băng (test/fixtures/legacy-payroll-block.js) lưu ở test/fixtures/payroll-golden-v0.json.
// Giữ làm test hồi quy VĨNH VIỄN: bộ máy dùng chung (src/engine/payroll-engine.ts) phải trả đúng từng đồng này.
// Tạo lại file vàng: xem đầu test/helpers/golden.ts. Đổi nội dung file vàng = đổi công thức.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createLegacyEngine } = require('../helpers/legacy-payroll');
const { generateCases, KNOWN_CASES, FOCUS_NAMES } = require('../helpers/payroll-cases');
const { GOLDEN_SEED, GOLDEN_COUNT, summarize, readGolden } = require('../helpers/golden');

const golden = readGolden();
const legacy = createLegacyEngine();
const known = (id?) => KNOWN_CASES.find(c => c.id === id);
const run = (id?) => legacy.computeMonth(known(id).input).m;

test('ca vàng: đủ 300 ca, hạt cố định 20261015, mã ca không trùng', () => {
  assert.equal(golden.meta.seed, GOLDEN_SEED);
  assert.equal(GOLDEN_SEED, 20261015);
  assert.equal(golden.cases.length, GOLDEN_COUNT);
  assert.equal(golden.cases.length, 300);
  assert.equal(new Set<any>(golden.cases.map(c => c.id)).size, 300);
  assert.equal(golden.meta.known, KNOWN_CASES.length);
});

test('ca vàng: phủ đủ ba loại nhân sự, mọi loại ngày, OT, làm bù, ngày lễ, ca đêm, KPI cũ và 5 thành phần, giờ thực tế', async () => {
  const count = (tag?) => golden.cases.filter(c => c.tags.includes(tag)).length;
  const need = {
    tts: 20,
    ctv: 20,
    nv: 50,
    'night-day': 20,
    'ot-day': 20,
    'makeup-hours-day': 20,
    'makeup-day': 20,
    'holiday-work-day': 20,
    holidays: 50,
    'leave-day': 20,
    'unpaid-day': 20,
    'willmakeup-day': 20,
    'approved-day': 20,
    'isat-day': 20,
    'noshow-day': 1,
    approvals: 50,
    'kpi-legacy': 20,
    'kpi-five': 20,
    'actual-hours': 30,
    sessions: 30,
    upto: 10,
    known: 6
  };
  for (const [tag, minimum] of Object.entries<any>(need))
    assert.ok((await count(tag)) >= minimum, `tag ${tag}: ${await count(tag)} < ${minimum}`);
  // mỗi tình huống bắt buộc của bộ sinh xuất hiện ít nhất 5 lần
  for (const focus of FOCUS_NAMES)
    assert.ok((await count(focus)) >= 5, `tình huống ${focus}: ${await count(focus)} < 5`);
});

test('ca vàng: bộ sinh với hạt 20261015 tạo lại đúng đầu vào đã lưu (bộ sinh lặp lại được)', () => {
  const regenerated = generateCases(GOLDEN_SEED, GOLDEN_COUNT - KNOWN_CASES.length);
  const stored = golden.cases.slice(KNOWN_CASES.length);
  assert.equal(regenerated.length, stored.length);
  const different = regenerated.filter(
    (c, i) => JSON.stringify(c) !== JSON.stringify({ ...stored[i], expected: undefined })
  );
  assert.deepEqual(
    different.map(c => c.id),
    [],
    'bộ sinh ra ca khác file vàng: đổi bộ sinh thì phải tạo lại file vàng có chủ ý (test/helpers/golden.ts)'
  );
});

test('ca vàng: khối cũ đóng băng cho đúng kết quả đã lưu ở cả 300 ca (từng trường tiền và vân tay toàn bộ kết quả)', () => {
  const wrong: any[] = [];
  for (const c of golden.cases) {
    const actual = summarize(legacy.computeMonth(c.input));
    try {
      assert.deepStrictEqual(actual, c.expected);
    } catch {
      wrong.push(`${c.id}: net ${actual.net} khác ${c.expected.net} (total ${actual.total} khác ${c.expected.total})`);
    }
  }
  assert.deepEqual(wrong, []);
});

test('ca vàng: hai lần chạy bằng hai bộ nạp riêng cho kết quả giống hệt nhau (tính lặp lại)', () => {
  const other = createLegacyEngine();
  for (const c of golden.cases.filter((x, i) => i % 3 === 0))
    assert.deepStrictEqual(summarize(other.computeMonth(c.input)), summarize(legacy.computeMonth(c.input)), c.id);
});

test('ca vàng: số tiền của file vàng không có NaN, vô cực hay -0 (JSON không giữ được các giá trị đó)', () => {
  for (const c of golden.cases)
    for (const [key, value] of Object.entries<any>(c.expected)) {
      if (key === 'digest' || value === null) continue;
      assert.ok(Number.isFinite(value) && !Object.is(value, -0), `${c.id}.${key} = ${value}`);
    }
});

// ---------- số tiền đã biết (NV level 1: lương cơ bản 6.000.000 ₫, KPI tối đa 6.000.000 ₫) ----------
test('KPI 5 thành phần: NV level 1, KPI 6.000.000, điểm 100/90/80/85/100 là 92,2% và trả đúng 5.532.000 ₫', () => {
  const m = run('known-kpi-five-100-90-80-85-100');
  assert.equal(m.kpiMethod, 'five');
  assert.equal(m.kpiPct, 92.2);
  assert.equal(m.kpiPass, true);
  assert.equal(m.kpiPay, 5532000);
});

test('KPI 5 thành phần trong khối lịch sử: tổng 74% dưới mốc cũ nên KPI bằng 0', () => {
  const m = run('known-kpi-five-80-70-70-70-70');
  assert.equal(m.kpiPct, 74);
  assert.equal(m.kpiPass, false);
  assert.equal(m.kpiReason, 'below-pass');
  assert.equal(m.kpiPay, 0);
});

test('KPI 5 thành phần: Base Wework 74 dưới 75 nên KPI bằng 0 dù bốn thành phần kia đều 100', () => {
  const m = run('known-kpi-five-wework-74');
  assert.equal(m.kpiGate, false);
  assert.equal(m.kpiReason, 'wework');
  assert.equal(m.kpiPay, 0);
});

test('KPI 5 thành phần: năm điểm đúng 75 là đạt mốc và trả đúng 4.500.000 ₫', () => {
  const m = run('known-kpi-five-75x5');
  assert.equal(m.kpiPct, 75);
  assert.equal(m.kpiPass, true);
  assert.equal(m.kpiPay, 4500000);
});

test('T6-5: 23,75 giờ vượt ngưỡng còn chuyên cần và KPI không bị nhân tỷ lệ (6.000.000 ₫)', () => {
  const m = run('known-t65-over-limit-23.75h');
  assert.equal(m.overHours, 23.75);
  assert.equal(m.attendOk, true);
  assert.equal(m.kpiRatio, 1);
  assert.equal(m.kpiPay, 6000000);
});

test('T6-5: 24,25 giờ vượt ngưỡng mất chuyên cần và KPI nhân 2 ngày đi làm / 26 ngày công (461.538 ₫)', () => {
  const m = run('known-t65-over-limit-24.25h');
  assert.equal(m.overHours, 24.25);
  assert.equal(m.attendOk, false);
  assert.equal(m.count, 2);
  assert.equal(m.kpiRatio, 2 / 26);
  assert.equal(m.kpiPay, ((6000000 * 100) / 100) * (2 / 26));
  assert.equal(Math.round(m.kpiPay), 461538);
});
