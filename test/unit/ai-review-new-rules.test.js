'use strict';
// Hai luật của "Soát dữ liệu trước khi chốt lương" (lib/ai/review.ts): net-nonpositive, formula-changed-recently
// và mảng systemFindings (phát hiện không gắn người). Toàn người giả (qa_*), tháng 10/2026, dữ liệu của ai-review-world.js.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { assertPlain } = require('../helpers/plain-text');
const { review } = require('../../lib/ai/review.ts');
const { loadPayroll } = require('../../lib/ai/payroll-loader.ts');
const { DEFAULTS } = require('../../public/payroll-params.js');
const W = require('./ai-review-world.js');

const { person, world, find, workDay } = W;

// các ngày Thứ 2 đến Thứ 6 của tháng 10/2026 (22 ngày)
const WEEKDAYS = Array.from({ length: 31 }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`).filter(date => {
  const dow = new Date(date + 'T00:00:00Z').getUTCDay();
  return dow >= 1 && dow <= 5;
});
const fullMonth = () => Object.fromEntries(WEEKDAYS.map(date => [date, workDay()]));
const sysOf = (result, rule) => result.systemFindings.filter(f => f.rule === rule);
const skippedOf = (result, rule) => result.checked.skipped.find(s => s.rule === rule);

/* ================= net-nonpositive ================= */
test('net-nonpositive: đủ 22 ngày công thì thực nhận dương và không bị gắn; lịch tháng trống bị bỏ qua (chưa có số để soát)', async () => {
  const a = await person('qa_a');
  const b = await person('qa_b');
  const result = await review(await world({ people: [a, b], days: { qa_a: fullMonth() } }));
  assert.deepEqual(find(result, 'net-nonpositive'), []);
  assert.ok(result.checked.ruleIds.includes('net-nonpositive'), 'luật đã chạy');
});

test('net-nonpositive: thiếu bộ máy tính lương thì luật bị bỏ qua kèm lý do; không bị gắn gì', async () => {
  const a = await person('qa_a');
  const result = await review(
    await world({ people: [a], days: { qa_a: { '2026-10-05': workDay() } }, withPayroll: false })
  );
  assert.deepEqual(find(result, 'net-nonpositive'), []);
  // lý do bỏ qua viết bằng tiếng Việt thường, không có tên mô-đun
  assert.match(skippedOf(result, 'net-nonpositive').reason, /bộ máy tính lương/);
  assertPlain(skippedOf(result, 'net-nonpositive').reason, 'lý do bỏ qua net-nonpositive');
});

test('net-nonpositive: Admin tắt luật bằng ai.rule.netNonpositive.enabled = false thì bỏ qua với lý do "Admin tắt"', async () => {
  const a = await person('qa_a');
  const input = await world({ people: [a], days: { qa_a: { '2026-10-05': workDay() } } });
  const result = await review({ ...input, params: { ...DEFAULTS, 'ai.rule.netNonpositive.enabled': false } });
  assert.deepEqual(find(result, 'net-nonpositive'), []);
  assert.equal(skippedOf(result, 'net-nonpositive').reason, 'Admin tắt');
});

/* ================= formula-changed-recently ================= */
const TEN = Array.from({ length: 10 }, (_, i) => person(`qa_p${i}`));
const CHANGED = { ...DEFAULTS, 'advance.rate': 0.5 };
const change = (key, effectiveMonth = '2026-10') => ({ key, effectiveMonth, createdAt: '2026-10-02T03:00:00.000Z' });
const run = async (params, extra, people = TEN) => {
  const days = Object.fromEntries(people.map(p => [p.username, fullMonth()]));
  const advances = Object.fromEntries(people.map(p => [p.username, true])); // tạm ứng chỉ vào thực nhận của người đã được duyệt
  return review({ ...(await world({ people, days })), advances, params, payroll: loadPayroll(params), ...extra });
};

test('formula-changed-recently: advance.rate 0.8 → 0.5 đổi thực nhận của 10/10 người thì gắn mức vừa, kèm số người và tổng chênh lệch', async () => {
  const result = await run(CHANGED, { paramChanges: [change('advance.rate')], payrollBefore: loadPayroll(DEFAULTS) });
  const hits = sysOf(result, 'formula-changed-recently');
  assert.equal(hits.length, 1);
  const [hit] = hits;
  assert.equal(hit.severity, 'medium');
  assert.equal(hit.username, undefined, 'không gắn người');
  assert.equal(hit.id, 'formula-changed-recently:system:2026-10');
  const inputs = hit.evidence.inputs;
  assert.equal(inputs.changeCount, 1);
  assert.deepEqual(inputs.paramKeys, ['advance.rate']);
  assert.deepEqual(inputs.formulaKeys, []);
  assert.equal(inputs.peopleChanged, 10);
  assert.equal(inputs.peopleTotal, 10);
  assert.equal(inputs.share, 1);
  // tay: mỗi người đi làm T2–T7 nên có 13 ngày công trong 15 ngày đầu của 10/2026 (1, 2, 3, 5, 6, 7, 8, 9, 10, 12, 13, 14, 15/10); cơ sở tạm ứng 13 × 6.000.000 / 26 = 3.000.000;
  // tạm ứng 0,8 → 2.400.000, 0,5 → 1.500.000, chênh 900.000 mỗi người
  assert.equal(inputs.totalDiffVnd, 10 * 900000);
  assert.equal(result.findings.filter(f => f.rule === 'formula-changed-recently').length, 0);
});

test('formula-changed-recently: chỉ đổi advance.eligibleTypes.tts (1 TTS trong 10 người, 0,1 < ngưỡng 0,2) thì không gắn', async () => {
  const people = [...TEN.slice(0, 9), await person('qa_tts', { type: 'tts' })];
  const params = { ...DEFAULTS, 'advance.eligibleTypes.tts': false };
  const result = await run(
    params,
    { payrollBefore: loadPayroll(DEFAULTS), paramChanges: [change('advance.eligibleTypes.tts')] },
    people
  );
  assert.deepEqual(sysOf(result, 'formula-changed-recently'), []);
});

test('formula-changed-recently: không có bộ máy của tháng trước thì chỉ nhắc xem lại (mức thấp, chưa đo người)', async () => {
  const result = await run(CHANGED, { paramChanges: [change('advance.rate')] });
  const [hit] = sysOf(result, 'formula-changed-recently');
  assert.ok(hit);
  assert.equal(hit.severity, 'low');
  assert.equal(hit.evidence.inputs.peopleChanged, null);
  assert.equal(hit.evidence.inputs.totalDiffVnd, null);
});

test('formula-changed-recently: thay đổi có hiệu lực từ tháng trước không gắn; không có thay đổi nào cũng không gắn', async () => {
  const before = loadPayroll(DEFAULTS);
  const previous = await run(CHANGED, { paramChanges: [change('advance.rate', '2026-09')], payrollBefore: before });
  assert.deepEqual(sysOf(previous, 'formula-changed-recently'), []);
  const none = await run(CHANGED, { payrollBefore: before });
  assert.deepEqual(sysOf(none, 'formula-changed-recently'), []);
});

test('formula-changed-recently: khoá formula.* được tách riêng khỏi khoá tham số', async () => {
  const result = await run(CHANGED, { paramChanges: [change('advance.rate'), change('formula.luongThang')] });
  const [hit] = sysOf(result, 'formula-changed-recently');
  assert.equal(hit.evidence.inputs.changeCount, 2);
  assert.deepEqual(hit.evidence.inputs.formulaKeys, ['luongThang']);
  assert.deepEqual(hit.evidence.inputs.paramKeys, ['advance.rate']);
});

/* ================= systemFindings ================= */
test('systemFindings là mảng riêng ở cấp trên: phát hiện hệ thống không có username, không đếm vào summary, xếp theo mức rồi theo id', async () => {
  const params = { ...DEFAULTS, 'advance.rate': 0.5 };
  const result = await run(params, { paramChanges: [change('advance.rate')], payrollBefore: loadPayroll(DEFAULTS) });
  assert.deepEqual(
    result.systemFindings.map(f => f.id),
    ['formula-changed-recently:system:2026-10']
  );
  for (const f of result.systemFindings) {
    assert.equal(Object.hasOwn(f, 'username'), false, f.id);
    assert.equal(f.month, '2026-10');
    assert.ok(f.digest && f.evidence && f.message);
  }
  assert.ok(
    result.findings.every(f => f.username),
    'findings theo người luôn có username'
  );
  assert.equal(result.summary.total, result.findings.length);
  const empty = await run(DEFAULTS, {});
  assert.deepEqual(empty.systemFindings, []);
});
