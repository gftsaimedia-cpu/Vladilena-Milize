'use strict';
// So sánh kép bộ máy tính lương với khối công thức cũ đã đóng băng.
// Harness: ứng viên là chính khối cũ (hai bản nạp riêng) và phải không lệch; có thêm các ca cố ý làm lệch
// (một đồng ở thực lĩnh, một chữ số lẻ ở một dòng của rows, sửa đầu vào, ném lỗi) để chứng minh harness bắt được; options.reference thay khối cũ bằng bộ máy tham chiếu.
// Bộ máy dùng chung không còn so với khối cũ vì quy tắc lương đã đổi sau khi khối cũ đóng băng: các đẳng thức tiền của nó ở payroll-engine-invariants.test.ts,
// còn các lựa chọn mặc định so với bộ máy chạy tham số mặc định (pay-tail-default-differential, levels-night-engine).
// Số ca của lần chạy tự kiểm mặc định 600 (mỗi ca tốn khoảng 3 ms mỗi bộ máy): đặt PAYROLL_DIFF_CASES=5000 để chạy đủ 5.000 ca.
// Chạy lại đúng ca lệch: PAYROLL_DIFF_SEED=<hạt in ra khi đỏ>.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createLegacyEngine } = require('../helpers/legacy-payroll');
const { payrollEngineDifferential } = require('../helpers/payroll-differential');

const FIXED_SEED = 20261016; // hạt cố định của bộ 5.000 ca (khác hạt của bộ ca vàng)
const SELF_CHECK_CASES = Number(process.env.PAYROLL_DIFF_CASES) || 600;
const randomSeed = () => Number(process.env.PAYROLL_DIFF_SEED) || crypto.randomInt(1, 2 ** 31 - 1);

// Bộ máy ứng viên làm lệch kết quả của khối cũ theo cách `tamper` mô tả
function tampered(tamper?) {
  const engine = createLegacyEngine();
  return input => {
    const out = engine.computeMonth(input);
    tamper(out, input);
    return out;
  };
}
// Chạy harness mà mong nó đỏ; trả thông báo lỗi (console.error của harness bị tắt trong lúc chạy)
function expectRed(candidate?, options?) {
  const original = console.error;
  console.error = () => {};
  try {
    payrollEngineDifferential(candidate, options);
  } catch (error) {
    return error.message;
  } finally {
    console.error = original;
  }
  assert.fail('harness lẽ ra phải báo lệch nhưng đã cho qua');
}

// ---------- harness ----------
test('so sánh kép: ứng viên là chính khối cũ (bản nạp riêng) thì không lệch ở bộ ca hạt cố định', () => {
  const run = payrollEngineDifferential(createLegacyEngine().computeMonth, {
    cases: SELF_CHECK_CASES,
    seed: FIXED_SEED
  });
  assert.equal(run.cases, SELF_CHECK_CASES);
  assert.equal(run.legacyErrors, 0, 'bộ sinh không được tạo ca làm khối cũ ném lỗi');
});

test('so sánh kép: ứng viên là chính khối cũ thì không lệch ở một hạt ngẫu nhiên mới mỗi lần chạy', () => {
  payrollEngineDifferential(createLegacyEngine().computeMonth, { cases: 150, seed: randomSeed() });
});

test('so sánh kép: lệch ĐÚNG MỘT ĐỒNG ở thực lĩnh thì bị bắt và thông báo in hạt giống', () => {
  const message = expectRed(
    tampered(out => {
      out.m.net.net += 1;
    }),
    { cases: 40, seed: FIXED_SEED }
  );
  assert.match(message, new RegExp(`seed=${FIXED_SEED}`));
  assert.match(message, /PAYROLL_DIFF_SEED/);
  assert.match(message, /m\.net\.net/);
});

test('so sánh kép: lệch một chữ số lẻ rất nhỏ ở một dòng của rows (so từng trường, không so gần đúng) thì bị bắt', () => {
  const message = expectRed(
    tampered(out => {
      const row = out.m.rows.find(r => r.total > 0);
      if (row) row.total += 1e-9;
    }),
    { cases: 40, seed: FIXED_SEED }
  );
  assert.match(message, /m\.rows\[\d+\]\.total/);
});

test('so sánh kép: bộ máy sửa đầu vào (bỏ một ngày khỏi lịch) thì bị bắt', () => {
  const message = expectRed(
    tampered((out, input) => {
      delete input.days[Object.keys(input.days)[0]];
    }),
    { cases: 40, seed: FIXED_SEED }
  );
  assert.match(message, /đầu vào bị ứng viên sửa/);
});

test('so sánh kép: bộ máy ném lỗi ở ca mà khối cũ tính được thì bị bắt', () => {
  const message = expectRed(
    () => {
      throw new Error('PARAM thiếu');
    },
    { cases: 10, seed: FIXED_SEED }
  );
  assert.match(message, /PARAM thiếu/);
});

test('so sánh kép: ứng viên không trả { m } thì bị bắt; gọi mà không có hạt giống thì từ chối', () => {
  assert.match(
    expectRed(() => ({}), { cases: 5, seed: FIXED_SEED }),
    /không trả về/
  );
  assert.throws(() => payrollEngineDifferential(createLegacyEngine().computeMonth, { cases: 5 }), /seed/);
});

test('so sánh kép: có options.reference thì so với bộ máy tham chiếu đó, bắt lệch một đồng và cho qua khi bằng nhau', () => {
  const reference = createLegacyEngine();
  const same = createLegacyEngine();
  payrollEngineDifferential(input => same.computeMonth(input), {
    cases: 20,
    seed: FIXED_SEED,
    reference: (input?) => reference.computeMonth(input)
  });
  const message = expectRed(
    input => {
      const out = same.computeMonth(input);
      out.m.net.net += 1;
      return out;
    },
    { cases: 20, seed: FIXED_SEED, reference: (input?) => reference.computeMonth(input) }
  );
  assert.match(message, /m.net.net/);
});
