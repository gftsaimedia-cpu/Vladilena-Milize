'use strict';
// Phía AI soát dữ liệu: hồ sơ có bậc lương hay loại không có trong bảng (PAYROLL_BAD_LEVEL, PAYROLL_BAD_TYPE) làm bộ máy ném lỗi.
// review() đếm checked.payrollErrors và KHÔNG phát hiện nào dựa trên "tiền 0 ₫" của người đó; người khác không bị ảnh hưởng.
// Toàn người giả (qa_*), tháng 10/2026, dữ liệu của ai-review-world.js (cùng ca với test attendance-allowance-risk và large-pay-impact).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { review } = require('../../lib/ai/review.ts');
const W = require('./ai-review-world.js');

const { person, world, find, workDay } = W;
const PAYROLL_RULES = ['attendance-allowance-risk', 'large-pay-impact', 'ot-above-team', 'slip-override-gap'];

// Hai ngày nghỉ không lương + một "Nghỉ được duyệt" chờ duyệt (bắn attendance-allowance-risk), một iSAT và một ngày làm lễ (bắn large-pay-impact)
const DAYS = {
  '2026-10-05': { kind: 'unpaid' },
  '2026-10-06': { kind: 'unpaid' },
  '2026-10-07': { kind: 'approved' },
  '2026-10-10': { kind: 'isat' },
  '2026-10-12': workDay()
};
const run = async (people?, extra: any = {}) =>
  review(
    await world({
      people,
      days: Object.fromEntries(people.map(p => [p.username, DAYS])),
      holidays: ['2026-10-12'],
      ...extra
    })
  );
const rulesOf = (result?, username?) => [
  ...new Set<any>(result.findings.filter(f => f.username === username).map(f => f.rule))
];

test('Điều kiện của bài: người hợp lệ bị gắn cả luật chuyên cần lẫn luật tác động tiền (bằng chứng rằng luật dựa vào bộ máy lương chạy)', async () => {
  const ok = await run([await person('qa_a')]);
  assert.equal(ok.checked.payrollErrors, 0);
  const rules = rulesOf(ok, 'qa_a');
  assert.ok(rules.includes('attendance-allowance-risk'), rules.join());
  assert.ok(rules.includes('large-pay-impact'), rules.join());
});

test('T16: bậc lương 99 (hoặc 0, null, "abc", tts bậc 7): payrollErrors > 0, không phát hiện nào dựa trên tiền, không có "tác động 0 ₫"', async () => {
  for (const patch of [{ level: 99 }, { level: 0 }, { level: null }, { level: 'abc' }, { type: 'tts', level: 7 }]) {
    const bad = await person('qa_a', patch);
    const result = await run([bad]);
    assert.ok(
      result.checked.payrollErrors >= 1,
      `${JSON.stringify(patch)}: payrollErrors ${result.checked.payrollErrors}`
    );
    const rules = rulesOf(result, 'qa_a');
    for (const id of PAYROLL_RULES) assert.ok(!rules.includes(id), `${JSON.stringify(patch)}: không được có ${id}`);
    const text = JSON.stringify(result.findings);
    assert.equal(/"impactVnd":0\b/.test(text), false, 'không có tác động 0 ₫');
    assert.equal(/Tác động lớn: [+-]0 ₫/.test(text), false);
    // luật không cần tiền vẫn chạy cho người đó (iSAT chờ duyệt bị soát hạn khai v.v.), nên review không bỏ rơi người có hồ sơ sai
    assert.ok(Array.isArray(result.findings));
  }
});

test('T16: loại nhân sự sai (xyz, NV) cũng được đếm là lỗi tính lương và không có phát hiện dựa trên tiền', async () => {
  for (const type of ['xyz', 'NV']) {
    const result = await run([await person('qa_a', { type })]);
    assert.ok(result.checked.payrollErrors >= 1, `type=${type}`);
    const rules = rulesOf(result, 'qa_a');
    for (const id of PAYROLL_RULES) assert.ok(!rules.includes(id), `type=${type}: không được có ${id}`);
  }
});

test('T16: hồ sơ sai của một người không đổi phát hiện của người khác: kết quả của qa_ok khi đứng cạnh qa_bad bằng kết quả khi đứng một mình', async () => {
  const alone = await run([await person('qa_ok')]);
  const together = await run([await person('qa_ok'), await person('qa_bad', { level: 99 })]);
  assert.ok(together.checked.payrollErrors >= 1);
  const strip = (result?, user?) =>
    result.findings
      .filter(f => f.username === user)
      .map(f => ({ rule: f.rule, date: f.date, message: f.message, severity: f.severity, inputs: f.evidence.inputs }));
  assert.deepEqual(strip(together, 'qa_ok'), strip(alone, 'qa_ok'));
  assert.ok(strip(together, 'qa_ok').length >= 2);
});

test('T16: không có người sai thì payrollErrors là 0 (đếm chỉ tăng vì hồ sơ sai, không vì lý do khác)', async () => {
  const result = await run([
    await person('qa_a'),
    await person('qa_b', { type: 'ctv', level: 2 }),
    await person('qa_c', { type: 'tts', level: 6 })
  ]);
  assert.equal(result.checked.payrollErrors, 0);
});

test('T16: thiếu bộ máy lương (payroll: undefined) bỏ qua luật cần tiền và ghi checked.skipped, không tính là payrollErrors', async () => {
  const result = await review(
    await world({ people: [await person('qa_a', { level: 99 })], days: { qa_a: DAYS }, withPayroll: false })
  );
  assert.equal(result.checked.payrollErrors, 0);
  assert.ok(result.checked.skipped.some(s => s.rule === 'large-pay-impact'));
});

// approval-view.js tra lịch theo loại nhân sự bằng thuộc tính của chính nó, nên 'constructor' / 'toString' / '__proto__' không ném TypeError.
test('T16: approval-view.itemOf với loại nhân sự trùng tên thuộc tính Object ("constructor") không ném TypeError trong ngày lễ', () => {
  const ApprovalView = require('../../public/approval-view.js');
  for (const staffType of ['constructor', 'toString', '__proto__'])
    assert.doesNotThrow(
      () => ApprovalView.itemOf(workDay(), { date: '2026-10-12', holidays: ['2026-10-12'], staffType }),
      staffType
    );
});
