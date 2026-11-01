'use strict';
// Đường tham số của "Soát dữ liệu trước khi chốt lương" (src/ai/thresholds.ts và src/ai/review.ts): giá trị ngưỡng và công tắc luật
// lấy từ bộ tham số phẳng (input.params, mặc định PayrollParams.DEFAULTS). Toàn người giả (qa_*), tháng 10/2026, dữ liệu của ai-review-world.js.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { review } = require('../../src/ai/review');
const { THRESHOLDS, resolveThresholds, ruleKeyOf } = require('../../src/ai/thresholds');
const { DEFAULTS } = require('../../src/engine/payroll-params');
const W = require('./ai-review-world.js');

const { person, world, find } = W;
const withParams = async (options?, overrides?) => ({
  ...(await world(options)),
  params: { ...DEFAULTS, ...overrides }
});
const ids = (result?, rule?) => find(result, rule).map(f => `${f.username}|${f.date || f.month}`);

// ba lần iSAT trong tháng: mặc định (ngưỡng 4) không bị gắn; ngưỡng 3 thì lần thứ 3 bị gắn
const THREE_ISAT = { '2026-10-03': { kind: 'isat' }, '2026-10-10': { kind: 'isat' }, '2026-10-17': { kind: 'isat' } };

test('resolveThresholds(undefined, DEFAULTS) bằng đúng bảng THRESHOLDS, từng ô: giá trị, cờ proposal và chữ nguồn', () => {
  const resolved = resolveThresholds(undefined, DEFAULTS);
  assert.deepEqual(Object.keys(resolved).sort(), Object.keys(THRESHOLDS).sort());
  for (const [name, item] of Object.entries<any>(THRESHOLDS)) {
    assert.equal(resolved[name].value, item.value, `${name}.value`);
    assert.equal(resolved[name].proposal, item.proposal, `${name}.proposal`);
    assert.equal(resolved[name].source, item.source, `${name}.source`);
  }
  assert.deepEqual(resolved, THRESHOLDS);
  // không tham số thứ hai cũng là mặc định
  assert.deepEqual(resolveThresholds(undefined), THRESHOLDS);
});

test('Ngưỡng ghi đè qua params: ai.threshold.isatPerMonth = 3 cho giá trị mới, proposal true, nguồn ghi rõ khoá và mặc định', () => {
  const resolved = resolveThresholds(undefined, { ...DEFAULTS, 'ai.threshold.isatPerMonth': 3 });
  assert.equal(resolved.isatPerMonth.value, 3);
  assert.equal(resolved.isatPerMonth.proposal, true);
  assert.equal(resolved.isatPerMonth.source, 'Admin đặt trong Cài đặt ai.threshold.isatPerMonth (mặc định 4)');
  assert.equal(resolved.approvedLeavePerMonth.value, THRESHOLDS.approvedLeavePerMonth.value, 'ngưỡng khác không đổi');
  assert.deepEqual(resolved.otMedianFactor, THRESHOLDS.otMedianFactor);
});

test('Ngưỡng bằng giá trị mặc định giữ nguyên ô (nhãn và nguồn của bảng đã chốt không bị thay)', () => {
  const resolved = resolveThresholds(undefined, { ...DEFAULTS, 'ai.threshold.isatPerMonth': 4 });
  assert.equal(resolved.isatPerMonth, THRESHOLDS.isatPerMonth);
});

test('Đổi ngưỡng qua params làm đổi kết quả soát: iSAT 3 lần không bị gắn ở ngưỡng 4, bị gắn lần thứ 3 ở ngưỡng 3, kèm bằng chứng', async () => {
  const a = await person('qa_a');
  const options = { people: [a], days: { qa_a: THREE_ISAT } };
  assert.deepEqual(ids(await review(await world(options)), 'isat-frequency'), [], 'mặc định: chưa bị gắn');
  const result = await review(await withParams(options, { 'ai.threshold.isatPerMonth': 3 }));
  assert.deepEqual(ids(result, 'isat-frequency'), ['qa_a|2026-10-17']);
  const [hit] = find(result, 'isat-frequency');
  assert.equal(hit.message, 'iSAT lần thứ 3 trong tháng');
  assert.equal(hit.evidence.threshold.isatPerMonth, 3);
  assert.equal(hit.evidence.threshold.proposal, true, 'Admin đã đặt, chủ dự án chưa chốt');
  assert.equal(
    hit.evidence.threshold.sources.isatPerMonth,
    'Admin đặt trong Cài đặt ai.threshold.isatPerMonth (mặc định 4)'
  );
  // nâng ngưỡng lên thì ca bị gắn mặc định biến mất
  const four = { ...THREE_ISAT, '2026-10-24': { kind: 'isat' } };
  assert.deepEqual(ids(await review(await world({ people: [a], days: { qa_a: four } })), 'isat-frequency'), [
    'qa_a|2026-10-24'
  ]);
  assert.deepEqual(
    ids(
      await review(await withParams({ people: [a], days: { qa_a: four } }, { 'ai.threshold.isatPerMonth': 5 })),
      'isat-frequency'
    ),
    []
  );
});

test('Ngưỡng ghi đè bằng thresholds của người gọi vẫn thắng giá trị của params và luôn là proposal', () => {
  const resolved = resolveThresholds({ isatPerMonth: 2 }, { ...DEFAULTS, 'ai.threshold.isatPerMonth': 3 });
  assert.equal(resolved.isatPerMonth.value, 2);
  assert.equal(resolved.isatPerMonth.proposal, true);
  assert.match(resolved.isatPerMonth.source, /^Ghi đè khi gọi review\(\) \(mặc định 4\)$/);
});

test('Khoá nhắc lại luật đã chốt đổi qua params (period.reportDeadlineDay): giá trị mới, giữ cờ proposal false, nguồn nêu đúng khoá', () => {
  const resolved = resolveThresholds(undefined, { ...DEFAULTS, 'period.reportDeadlineDay': 5 });
  assert.equal(resolved.reportDeadlineDay.value, 5);
  assert.equal(THRESHOLDS.reportDeadlineDay.proposal, false, 'điều kiện của bài: ô gốc là luật đã chốt');
  assert.equal(resolved.reportDeadlineDay.proposal, false, 'luật đã chốt không thành proposal chỉ vì đổi khoá gốc');
  assert.equal(resolved.reportDeadlineDay.source, 'Lấy từ tham số period.reportDeadlineDay (mặc định 3)');
});

test('Luật tắt bằng ai.rule.<camelCase>.enabled = false: vào checked.skipped với lý do "Admin tắt", không có phát hiện, không nằm trong ruleIds', async () => {
  const a = await person('qa_a');
  const options = { people: [a], days: { qa_a: THREE_ISAT } };
  const on = await review(await withParams(options, { 'ai.threshold.isatPerMonth': 3 }));
  assert.equal(find(on, 'isat-frequency').length, 1, 'điều kiện của bài: luật này bắn ở dữ liệu này');
  assert.ok(on.checked.ruleIds.includes('isat-frequency'));
  assert.ok(!on.checked.skipped.some(s => s.rule === 'isat-frequency'));

  assert.equal(ruleKeyOf('isat-frequency'), 'ai.rule.isatFrequency.enabled');
  const off = await review(
    await withParams(options, { 'ai.threshold.isatPerMonth': 3, 'ai.rule.isatFrequency.enabled': false })
  );
  assert.deepEqual(find(off, 'isat-frequency'), []);
  assert.deepEqual(
    off.checked.skipped.filter(s => s.rule === 'isat-frequency'),
    [{ rule: 'isat-frequency', reason: 'Admin tắt' }]
  );
  assert.ok(!off.checked.ruleIds.includes('isat-frequency'));
  assert.equal(off.checked.ruleIds.length, on.checked.ruleIds.length - 1, 'chỉ tắt đúng một luật');
});

test('Tắt một luật không làm mất phát hiện của luật khác', async () => {
  const a = await person('qa_a');
  const options = { people: [a], days: { qa_a: THREE_ISAT } };
  const result = await review(
    await withParams(options, { 'ai.threshold.isatPerMonth': 3, 'ai.rule.kpiSelf100Streak.enabled': false })
  );
  assert.deepEqual(ids(result, 'isat-frequency'), ['qa_a|2026-10-17']);
});

test('Tắt chính luật đang bắn: isat-frequency tắt thì không còn phát hiện iSAT dù ngưỡng đã hạ', async () => {
  const a = await person('qa_a');
  const result = await review(
    await withParams(
      { people: [a], days: { qa_a: THREE_ISAT } },
      { 'ai.threshold.isatPerMonth': 3, 'ai.rule.isatFrequency.enabled': false }
    )
  );
  assert.deepEqual(find(result, 'isat-frequency'), []);
  assert.ok(result.checked.skipped.some(s => s.rule === 'isat-frequency' && s.reason === 'Admin tắt'));
});

test('Tham số sai kiểu hoặc không hữu hạn ném TypeError (không đoán): ngưỡng số, ngưỡng nhắc lại luật, công tắc luật', async () => {
  const a = await person('qa_a');
  const options = { people: [a], days: { qa_a: THREE_ISAT } };
  const bad: any[] = [
    ['ai.threshold.isatPerMonth', '4'],
    ['ai.threshold.isatPerMonth', NaN],
    ['ai.threshold.isatPerMonth', Infinity],
    ['ai.threshold.isatPerMonth', -Infinity],
    ['ai.threshold.isatPerMonth', true],
    ['ai.threshold.isatPerMonth', {}],
    ['period.reportDeadlineDay', '3'],
    ['period.reportDeadlineDay', NaN],
    ['period.reportDeadlineDay', Infinity],
    ['ai.rule.kpiSelf100Streak.enabled', 'false'],
    ['ai.rule.kpiSelf100Streak.enabled', 0],
    ['ai.rule.isatFrequency.enabled', 'true']
  ];
  for (const [key, value] of bad) {
    await assert.rejects(
      async () => review(await withParams(options, { [key]: value })),
      TypeError,
      `${key} = ${String(value)}`
    );
  }
  assert.throws(() => resolveThresholds(undefined, { ...DEFAULTS, 'ai.threshold.isatPerMonth': NaN }), TypeError);
  assert.throws(() => resolveThresholds(undefined, { ...DEFAULTS, 'period.reportDeadlineDay': '3' }), TypeError);
});

test('Khoá vắng hoặc null trong params giữ ô mặc định (không lỗi, không đổi)', () => {
  const params = { ...DEFAULTS };
  delete params['ai.threshold.isatPerMonth'];
  params['period.reportDeadlineDay'] = null;
  const resolved = resolveThresholds(undefined, params);
  assert.equal(resolved.isatPerMonth, THRESHOLDS.isatPerMonth);
  assert.equal(resolved.reportDeadlineDay, THRESHOLDS.reportDeadlineDay);
});

test('review() không có params chạy như trước: bằng kết quả với params = DEFAULTS, không luật nào bị bỏ vì "Admin tắt"', async () => {
  const a = await person('qa_a');
  const options = { people: [a], days: { qa_a: { ...THREE_ISAT, '2026-10-24': { kind: 'isat' } } } };
  const without = await review(await world(options));
  const withDefaults = await review({ ...(await world(options)), params: DEFAULTS });
  assert.equal(JSON.stringify(without), JSON.stringify(withDefaults));
  assert.deepEqual(ids(without, 'isat-frequency'), ['qa_a|2026-10-24']);
  // chỉ late-declaration tắt mặc định (ai.rule.lateDeclaration.enabled = false); các luật khác không bị bỏ vì "Admin tắt"
  assert.deepEqual(
    without.checked.skipped.filter(s => s.reason === 'Admin tắt').map(s => s.rule),
    ['late-declaration']
  );
});
