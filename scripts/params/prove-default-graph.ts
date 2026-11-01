'use strict';
// Chứng minh: cây của đồ thị công thức tháng MẶC ĐỊNH (src/engine/payroll-graph.ts) cho ĐÚNG từng bit số của bộ máy (m.trace) trên
// 300 ca vàng và N ca so sánh kép có hạt giống. Không dung sai: so bằng Object.is. Lệch một ca là thoát 1 và in ca đó.
//
//   node scripts/params/prove-default-graph.ts [--cases=1000] [--seed=20261016]
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const PayrollEngine = require(path.join(ROOT, 'src/engine/payroll-engine'));
const PayrollParams = require(path.join(ROOT, 'src/engine/payroll-params'));
const Graph = require(path.join(ROOT, 'src/engine/payroll-graph'));
const { generateCases } = require(path.join(ROOT, 'test/helpers/payroll-cases.ts'));
const { readGolden } = require(path.join(ROOT, 'test/helpers/golden.ts'));

const arg = (name?, fallback?) => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split('=')[1]) : fallback;
};
const CASES = arg('cases', 1000);
const SEED = arg('seed', 20261016);

const params = PayrollParams.DEFAULTS;
const tally = Object.fromEntries(Graph.ORDER.map(k => [k, { exact: 0, mismatch: 0, skipped: 0 }]));
const mismatches: any[] = [];
let computed = 0;
let threw = 0;

function check(label?, input?) {
  let out;
  try {
    out = PayrollEngine.computeMonth(input, params);
  } catch {
    threw++;
    return;
  }
  computed++;
  const { m } = out;
  const ctx = Graph.contextFor(m, input.staff, params);
  for (const key of Graph.ORDER) {
    const want = m.trace[key];
    if (want === null || want === undefined) {
      tally[key].skipped++; // công thức không áp dụng cho loại này (ví dụ hệ số ngày KPI của loại không có KPI)
      continue;
    }
    let got;
    try {
      got = Graph.evalNamed(key, ctx);
    } catch (e) {
      got = `LỖI ${e.code || e.message}`;
    }
    if (Object.is(got, want)) tally[key].exact++;
    else {
      tally[key].mismatch++;
      if (mismatches.length < 20) mismatches.push({ ca: label, key, cây: got, bộMáy: want });
    }
  }
}

const golden = readGolden();
golden.cases.forEach(c => check(`vàng ${c.id}`, c.input));
const goldenComputed = computed;
generateCases(SEED, CASES).forEach((c, i) => check(`so sánh kép #${i} (seed ${SEED})`, c.input));

console.log(
  `ca vàng: ${golden.cases.length} (tính được ${goldenComputed}); ca so sánh kép: ${CASES} (seed ${SEED}); ném lỗi ở bộ máy: ${threw}`
);
let bad = 0;
for (const key of Graph.ORDER) {
  const t = tally[key];
  bad += t.mismatch;
  console.log(
    `${key.padEnd(16)} khớp từng bit ${String(t.exact).padStart(5)}   lệch ${t.mismatch}   bỏ qua (không áp dụng) ${t.skipped}`
  );
}
if (bad) {
  console.error('\nLỆCH:');
  for (const x of mismatches) console.error(JSON.stringify(x));
  process.exit(1);
}
console.log('\nKhớp từng bit trên mọi ca.');
