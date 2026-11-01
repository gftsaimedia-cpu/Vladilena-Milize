'use strict';
// 300 ca vàng của khối công thức cũ: đầu vào + kết quả của khối đã đóng băng, lưu ở
// test/fixtures/payroll-golden-v0.json. File vàng KHÔNG đổi khi bộ máy mới thay khối cũ: nó là test hồi quy vĩnh viễn.
// Tạo lại (chỉ khi cố ý đổi bộ sinh):
//   node test/helpers/golden.ts --write && npx prettier --write test/fixtures/payroll-golden-v0.json
const fs = require('node:fs');
const path = require('node:path');
const { createLegacyEngine } = require('./legacy-payroll');
const { generateCases, KNOWN_CASES, GENERATOR_VERSION } = require('./payroll-cases');
const { digest } = require('./payroll-differential');
const { withoutPaidDays } = require('./legacy-params');

const GOLDEN_SEED = 20261015;
const GOLDEN_COUNT = 300;
const GOLDEN_PATH = path.join(__dirname, '../fixtures/payroll-golden-v0.json');

// Các số tiền chính (đồng nguyên và số thực của m.total, kpiPay...) cộng dấu vân tay của TOÀN BỘ kết quả
function summarize(output?) {
  const { m } = output;
  return {
    total: m.total,
    gross: m.net.gross,
    insurance: m.net.insurance,
    tax: m.net.tax,
    advance: m.net.advance,
    net: m.net.net,
    kpiPay: m.kpiPay,
    allow: m.allow,
    count: m.count,
    overHours: m.overHours,
    // bỏ m.paidDays: khối cũ không có trường này; không đổi dấu vân tay đã ghi của khối cũ
    digest: digest({ m: withoutPaidDays(output.m), payDays: output.payDays, pendingItems: output.pendingItems })
  };
}

function buildGolden() {
  const legacy = createLegacyEngine();
  const generated = generateCases(GOLDEN_SEED, GOLDEN_COUNT - KNOWN_CASES.length);
  const cases = [...KNOWN_CASES, ...generated].map(c => ({ ...c, expected: summarize(legacy.computeMonth(c.input)) }));
  return {
    meta: {
      note: 'Ca vàng của khối công thức lương cũ (test/fixtures/legacy-payroll-block.js, chép tại commit 9cf7f6a). Người và lịch đều bịa.',
      seed: GOLDEN_SEED,
      generatorVersion: GENERATOR_VERSION,
      count: cases.length,
      known: KNOWN_CASES.length
    },
    cases
  };
}

const readGolden = () => JSON.parse(fs.readFileSync(GOLDEN_PATH, 'utf8'));

module.exports = { GOLDEN_SEED, GOLDEN_COUNT, GOLDEN_PATH, summarize, buildGolden, readGolden };

if (require.main === module) {
  if (!process.argv.includes('--write')) {
    console.log('Dùng --write để ghi ' + path.relative(process.cwd(), GOLDEN_PATH));
  } else {
    const golden = buildGolden();
    fs.writeFileSync(GOLDEN_PATH, JSON.stringify(golden, null, 2) + '\n');
    console.log(`Đã ghi ${golden.cases.length} ca vàng (seed ${GOLDEN_SEED}) vào ${GOLDEN_PATH}`);
  }
}
