'use strict';
// AI soát cho chức vụ là dữ liệu, khối phụ cấp thêm và số sửa phiếu.
// Toàn người giả (qa_*), tháng 10/2026. Mỗi luật có ca phải bắn và ca không được bắn, đếm đúng/sai để ra precision và recall.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { assertPlain } = require('../helpers/plain-text');
const { review, RULES } = require('../../lib/ai/review.ts');
const { suggestFromPreview, PREVIEW_RULES } = require('../../lib/ai/preview-suggestions.ts');
const { THRESHOLDS, resolveThresholds } = require('../../lib/ai/thresholds.ts');
const { benefitOf, blockDefsOf } = require('../../lib/ai/positions.ts');
const { loadPayroll } = require('../../lib/ai/payroll-loader.ts');
const { DEFAULTS } = require('../../public/payroll-params.js');
const W = require('./ai-review-world.js');

const { person, world, find, otDay, workDay } = W;

// chức vụ mới "hdo2" sao chép từ nv (cờ và bảng bậc), như POST /api/positions sẽ dựng
const copyPosition = (from, code, flags = {}) => {
  const out = { ...DEFAULTS };
  for (const key of Object.keys(DEFAULTS))
    if (new RegExp(`^(type|level)\\.${from}\\.`).test(key)) out[key.replace(`.${from}.`, `.${code}.`)] = DEFAULTS[key];
  return { ...out, ...flags };
};
const withParams = async (options, params) => {
  const input = { ...(await world(options)), params };
  return { ...input, payroll: loadPayroll(params) };
};
const ids = (result, rule) => find(result, rule).map(f => `${f.username}|${f.date || f.month}`);
const systemOf = (result, rule) => result.systemFindings.filter(f => f.rule === rule);
const tally = cases => {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  for (const { flagged, expect } of cases) {
    if (flagged && expect) tp++;
    else if (flagged) fp++;
    else if (expect) fn++;
    else tn++;
  }
  return { tp, fp, fn, tn, precision: tp / (tp + fp || 1), recall: tp / (tp + fn || 1) };
};

/* ---------- KPI_TYPES: cờ quyền lợi thay danh sách loại ghi cứng ---------- */
test('benefitOf: đọc cờ theo chức vụ; vắng khoá là false; khoá sai kiểu là lỗi', () => {
  assert.equal(benefitOf(DEFAULTS, 'nv', 'ot'), true);
  assert.equal(benefitOf(DEFAULTS, 'ctv', 'kpi'), true);
  assert.equal(benefitOf(DEFAULTS, 'tts', 'ot'), false);
  assert.equal(benefitOf(DEFAULTS, 'tts', 'kpi'), false);
  assert.equal(benefitOf(DEFAULTS, 'khong-co', 'ot'), false, 'chức vụ lạ không có quyền lợi');
  assert.throws(() => benefitOf({ 'type.x.benefit.ot': 'true' }, 'x', 'ot'), /true hoặc false/);
});

test('KPI_TYPES: ba chức vụ mặc định đọc từ cờ cho đúng kết quả cũ (ctv, nv có OT và KPI; tts không)', () => {
  for (const [type, expected] of [
    ['ctv', true],
    ['nv', true],
    ['tts', false]
  ]) {
    assert.equal(benefitOf(DEFAULTS, type, 'ot'), expected, `${type}.ot`);
    assert.equal(benefitOf(DEFAULTS, type, 'kpi'), expected, `${type}.kpi`);
  }
});

test('ot-above-team theo cờ benefit.ot: OT của chức vụ mới tính vào nhóm, chức vụ tắt cờ OT thì bị bỏ qua', async () => {
  const team = ['qa_1', 'qa_2', 'qa_3', 'qa_4', 'qa_5'];
  const light = Object.fromEntries(team.map(u => [u, { '2026-10-05': otDay('20:00') }]));
  const heavyDays = Object.fromEntries(
    ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'].map(d => [d, otDay('20:00')])
  );
  const people = async type => [...team.map(u => person(u)), await person('qa_heavy', { type })];
  const days = { ...light, qa_heavy: heavyDays };
  const on = await review(await withParams({ people: await people('hdo2'), days }, await copyPosition('nv', 'hdo2')));
  assert.deepEqual(ids(on, 'ot-above-team'), ['qa_heavy|2026-10'], 'chức vụ mới có cờ OT');
  const off = await review(
    await withParams(
      { people: await people('hdo2'), days },
      await copyPosition('nv', 'hdo2', { 'type.hdo2.benefit.ot': false })
    )
  );
  assert.deepEqual(ids(off, 'ot-above-team'), [], 'tắt cờ OT thì không xét');
});

/* ---------- block-flags-unconfirmed ---------- */
const blockParams = defs => ({
  ...DEFAULTS,
  ...Object.fromEntries(Object.entries(defs).map(([c, d]) => [`block.def.${c}`, d]))
});

test('blockDefsOf: chỉ lấy khoá block.def.<mã> có giá trị là đối tượng, xếp theo mã', () => {
  const params = {
    'block.def.b': { label: 'B' },
    'block.def.a': { label: 'A' },
    'block.def.a.source': { x: 1 },
    'block.def.c': 5,
    'type.nv.block.a.on': true
  };
  assert.deepEqual(
    blockDefsOf(params).map(item => item.code),
    ['a', 'b']
  );
});

test('block-flags-unconfirmed: khối có cờ thuế hoặc bảo hiểm chưa xác nhận bị gắn, nêu cờ nào đang chờ; khối còn lại không', async () => {
  const cases = [];
  const run = async defs => review({ ...(await world({})), params: blockParams(defs) });
  const scenario = [
    ['miễn thuế toàn bộ, chưa xác nhận', { antrua: { label: 'Ăn trưa', tax: 'full' } }, true],
    ['miễn thuế đến hạn mức, chưa xác nhận', { antrua: { label: 'Ăn trưa', tax: 'cap' } }, true],
    ['tính vào nền bảo hiểm, chưa xác nhận', { antrua: { label: 'Ăn trưa', insuranceBase: true } }, true],
    ['cả hai cờ, chưa xác nhận', { antrua: { label: 'Ăn trưa', tax: 'full', insuranceBase: true } }, true],
    [
      'đã xác nhận (flagsConfirmedBy)',
      { antrua: { label: 'Ăn trưa', tax: 'full', flagsConfirmedBy: 'ketoan' } },
      false
    ],
    [
      'đã xác nhận (flagsConfirmed)',
      { antrua: { label: 'Ăn trưa', insuranceBase: true, flagsConfirmed: true } },
      false
    ],
    [
      'không đề nghị cờ nào (chịu thuế, ngoài nền bảo hiểm)',
      { antrua: { label: 'Ăn trưa', tax: 'none', insuranceBase: false } },
      false
    ],
    ['khối ngưng dùng', { antrua: { label: 'Ăn trưa', tax: 'full', deprecated: true } }, false],
    ['chưa có khối nào', {}, false]
  ];
  for (const [label, defs, expect] of scenario) {
    const result = await run(defs);
    const hits = systemOf(result, 'block-flags-unconfirmed');
    cases.push({ label, flagged: hits.length === 1, expect });
    assert.equal(hits.length === 1, expect, label);
  }
  const both = systemOf(
    await run({ antrua: { label: 'Ăn trưa', tax: 'full', insuranceBase: true } }),
    'block-flags-unconfirmed'
  )[0];
  assert.equal(both.id, 'block-flags-unconfirmed:system:antrua');
  assert.equal(Object.hasOwn(both, 'username'), false);
  assert.deepEqual(both.evidence.inputs, { code: 'antrua', label: 'Ăn trưa', taxMode: 'full', insuranceBase: true });
  assert.match(both.message, /miễn thuế toàn bộ và tính vào nền bảo hiểm/);
  assert.match(both.message, /Kế toán/);
  assert.equal(both.evidence.threshold.proposal, false, 'luật không có ngưỡng số');
  assert.ok(both.evidence.threshold.basis, 'giải thích luật thay cho ngưỡng');
  const t = tally(cases);
  assert.deepEqual([t.precision, t.recall], [1, 1]);
  assert.deepEqual([t.tp, t.fp, t.fn, t.tn], [4, 0, 0, 5]);
});

test('block-flags-unconfirmed: Admin tắt luật (ai.rule.blockFlagsUnconfirmed.enabled = false) thì bỏ qua với lý do "Admin tắt"', async () => {
  const params = {
    ...blockParams({ antrua: { label: 'Ăn trưa', tax: 'full' } }),
    'ai.rule.blockFlagsUnconfirmed.enabled': false
  };
  const result = await review({ ...(await world({})), params });
  assert.deepEqual(systemOf(result, 'block-flags-unconfirmed'), []);
  assert.equal(result.checked.skipped.find(s => s.rule === 'block-flags-unconfirmed').reason, 'Admin tắt');
});

/* ---------- override-looks-like-entry ---------- */
const WORK_DAYS = Object.fromEntries(
  ['05', '06', '07', '08', '09', '12', '13', '14', '15', '16'].map(d => [`2026-10-${d}`, workDay()])
);
// Số tự tính của ô chuyên cần và đi lại lấy từ chính phát hiện slip-override-gap của bộ soát (ô lệch rất lớn nên chắc chắn bị gắn)
const computed = async () => {
  const probe = await review(
    await world({
      people: [await person('qa_a')],
      days: { qa_a: WORK_DAYS },
      slipOverrides: [{ username: 'qa_a', month: '2026-10', values: { attendance: 1e9, travel: 1e9 } }]
    })
  );
  const fields = find(probe, 'slip-override-gap', 'qa_a')[0].evidence.inputs.fields;
  const of = key => fields.find(f => f.key === key).computed;
  return { attendance: of('attendance'), travel: of('travel') };
};
const overrideCase = async (values, extra = {}) =>
  review(
    await world({
      people: [await person('qa_a')],
      days: { qa_a: WORK_DAYS },
      slipOverrides: [{ username: 'qa_a', month: '2026-10', values }],
      ...extra
    })
  );

test('override-looks-like-entry: số sửa tăng đúng bội 100.000 ₫ so với số tự tính bị gắn; các ca khác không', async () => {
  const { attendance, travel } = await computed();
  assert.ok(attendance > 0 && travel > 0);
  const scenario = [
    ['tăng 500.000 ở chuyên cần', { attendance: attendance + 500000 }, true],
    ['tăng 100.000 ở đi lại', { travel: travel + 100000 }, true],
    ['tăng 1.000.000 ở tiền KPI (số tự tính 0)', { kpiPay: 1000000 }, true],
    ['tăng 123.456 (không tròn)', { attendance: attendance + 123456 }, false],
    ['sửa nhỏ 5.000 (sai số làm tròn)', { attendance: attendance + 5000 }, false],
    ['giảm 500.000 (không phải cộng thêm)', { attendance: attendance - 500000 }, false],
    ['bằng số tự tính', { attendance }, false],
    ['ô không phải thu nhập (bảo hiểm tăng 500.000)', { insurance: 500000 }, false],
    ['không có số sửa', {}, false]
  ];
  const cases = [];
  for (const [label, values, expect] of scenario) {
    const flagged = ids(await overrideCase(values), 'override-looks-like-entry').length === 1;
    cases.push({ label, flagged, expect });
    assert.equal(flagged, expect, label);
  }
  const hit = find(await overrideCase({ attendance: attendance + 500000 }), 'override-looks-like-entry')[0];
  assert.deepEqual(hit.evidence.inputs.fields, [
    { key: 'attendance', computed: attendance, override: attendance + 500000, diff: 500000 }
  ]);
  assert.equal(hit.evidence.threshold.overrideEntryRoundVnd, 100000);
  assert.equal(hit.evidence.threshold.proposal, true, 'ngưỡng là đề xuất, chờ chủ dự án chốt');
  assert.match(hit.message, /khoản điền thêm/);
  assert.equal(hit.severity, 'low');
  const t = tally(cases);
  assert.deepEqual([t.precision, t.recall, t.tp, t.fp, t.fn, t.tn], [1, 1, 3, 0, 0, 6]);
});

test('override-looks-like-entry: tháng khác không xét; ngưỡng đổi qua params; thiếu bộ máy lương thì bỏ qua có lý do', async () => {
  const { attendance } = await computed();
  const other = await review(
    await world({
      people: [await person('qa_a')],
      days: { qa_a: WORK_DAYS },
      slipOverrides: [{ username: 'qa_a', month: '2026-09', values: { attendance: attendance + 500000 } }]
    })
  );
  assert.deepEqual(ids(other, 'override-looks-like-entry'), []);
  const tuned = {
    ...(await world({
      people: [await person('qa_a')],
      days: { qa_a: WORK_DAYS },
      slipOverrides: [{ username: 'qa_a', month: '2026-10', values: { attendance: attendance + 150000 } }]
    })),
    params: { ...DEFAULTS, 'ai.threshold.overrideEntryRoundVnd': 50000 }
  };
  assert.deepEqual(ids(await review(tuned), 'override-looks-like-entry'), ['qa_a|2026-10'], 'bội của 50.000');
  assert.equal(
    (await review(tuned)).findings.find(f => f.rule === 'override-looks-like-entry').evidence.threshold.sources
      .overrideEntryRoundVnd,
    'Admin đặt trong Cài đặt ai.threshold.overrideEntryRoundVnd (mặc định 100000)'
  );
  const noPayroll = await overrideCase({ attendance: attendance + 500000 }, { withPayroll: false });
  assert.deepEqual(ids(noPayroll, 'override-looks-like-entry'), []);
  // lý do bỏ qua viết bằng tiếng Việt thường, không có tên mô-đun
  const skippedReason = noPayroll.checked.skipped.find(s => s.rule === 'override-looks-like-entry').reason;
  assert.match(skippedReason, /bộ máy tính lương/);
  assertPlain(skippedReason, 'lý do bỏ qua override-looks-like-entry');
  const noOverride = await review(
    await world({ people: [await person('qa_a')], days: { qa_a: WORK_DAYS }, withPayroll: false })
  );
  assert.ok(
    noOverride.checked.ruleIds.includes('override-looks-like-entry'),
    'không có số sửa: không cần bộ máy, vẫn tính là đã chạy'
  );
});

test('hai luật mới của review() nằm trong danh mục RULES với trường evidence và ngưỡng hợp lệ', () => {
  for (const id of ['block-flags-unconfirmed', 'override-looks-like-entry']) {
    const rule = RULES.find(r => r.id === id);
    assert.ok(rule, id);
    for (const name of rule.thresholds) assert.ok(Object.hasOwn(THRESHOLDS, name), `${id}: ${name}`);
    assert.ok(rule.thresholds.length || rule.note, id);
  }
});

/* ---------- formula-large-change, position-scope-leak (xem trước) ---------- */
const person2 = (type, diff) => ({ type, before: { net: 10000000 }, after: { net: 10000000 + diff } });
const impactOf = (people, totals = {}) => ({
  month: '2026-10',
  people,
  totals: {
    people: 20,
    affected: people.length,
    truncated: false,
    delta: { net: people.reduce((s, p) => s + (p.after.net - p.before.net), 0) },
    ...totals
  }
});
const rulesOf = result => result.suggestions.map(s => s.rule);

test('formula-large-change: nhiều người đổi hoặc tổng chênh lớn bị gắn; thay đổi nhỏ thì không', async () => {
  const nv = (count, diff) => Array.from({ length: count }, () => person2('nv', diff));
  const scenario = [
    ['4/20 người (20%), mỗi người 100.000: đủ tỷ lệ', await impactOf(await nv(4, 100000)), true],
    ['3/20 người (15%), tổng 300.000: không đủ', await impactOf(await nv(3, 100000)), false],
    ['1 người tăng 6.000.000: đủ tổng tiền', await impactOf(await nv(1, 6000000)), true],
    ['1 người giảm 6.000.000: đủ tổng (tuyệt đối)', await impactOf(await nv(1, -6000000)), true],
    ['1 người tăng 4.000.000: dưới ngưỡng tổng', await impactOf(await nv(1, 4000000)), false],
    ['không ai đổi', await impactOf([]), false]
  ];
  const cases = [];
  for (const [label, impact, expect] of scenario) {
    const result = suggestFromPreview({ impact });
    const flagged = rulesOf(result).includes('formula-large-change');
    cases.push({ label, flagged, expect });
    assert.equal(flagged, expect, label);
  }
  const t = tally(cases);
  assert.deepEqual([t.precision, t.recall, t.tp, t.fp, t.fn, t.tn], [1, 1, 3, 0, 0, 3]);
  const both = suggestFromPreview({ impact: await impactOf(await nv(10, 1000000)) }).suggestions[0];
  assert.equal(both.rule, 'formula-large-change');
  assert.deepEqual(both.evidence.inputs, {
    peopleAffected: 10,
    peopleTotal: 20,
    share: 0.5,
    totalDiffVnd: 10000000,
    triggers: ['people-share', 'total-amount']
  });
  assert.equal(both.evidence.threshold.paramChangePeoplePct, 0.2);
  assert.equal(both.evidence.threshold.formulaChangeTotalVnd, 5000000);
  assert.equal(both.evidence.threshold.proposal, true);
  assert.equal(both.severity, 'medium');
  assert.equal(both.id, 'formula-large-change:preview:2026-10');
  assert.match(both.digest, /^[0-9a-f]{8}$/);
  assert.match(both.message, /10\/20 người/);
});

test('position-scope-leak: thay đổi dành cho một chức vụ mà đổi tiền người ngoài chức vụ bị gắn; chỉ trong chức vụ thì không', async () => {
  const scope = { position: 'nv' };
  const scenario = [
    ['chỉ người nv đổi', await impactOf([person2('nv', 100000), person2('nv', 100000)]), scope, false],
    ['một người ctv bị đổi', await impactOf([person2('nv', 100000), person2('ctv', 50000)]), scope, true],
    ['nhiều chức vụ ngoài', await impactOf([person2('ctv', 1), person2('tts', 1), person2('ctv', 1)]), scope, true],
    ['thay đổi không dành riêng cho chức vụ nào', await impactOf([person2('ctv', 100000)]), undefined, false],
    [
      'nhiều chức vụ trong phạm vi',
      await impactOf([person2('nv', 1), person2('ctv', 1)]),
      { positions: ['nv', 'ctv'] },
      false
    ],
    [
      'người chưa biết chức vụ không kết luận',
      await impactOf([{ before: { net: 1 }, after: { net: 2 } }]),
      scope,
      false
    ]
  ];
  const cases = [];
  for (const [label, impact, sc, expect] of scenario) {
    const result = suggestFromPreview({ impact, scope: sc });
    const flagged = rulesOf(result).includes('position-scope-leak');
    cases.push({ label, flagged, expect });
    assert.equal(flagged, expect, label);
  }
  const t = tally(cases);
  assert.deepEqual([t.precision, t.recall, t.tp, t.fp, t.fn, t.tn], [1, 1, 2, 0, 0, 4]);
  const leak = suggestFromPreview({
    impact: await impactOf([person2('nv', 100000), person2('ctv', 50000), person2('tts', -20000)]),
    scope
  }).suggestions.find(s => s.rule === 'position-scope-leak');
  assert.deepEqual(leak.evidence.inputs, {
    positions: ['nv'],
    peopleInScope: 1,
    peopleOutside: 2,
    outsidePositions: ['ctv', 'tts'],
    outsideDiffVnd: 30000,
    lowerBound: false
  });
  assert.equal(leak.evidence.threshold.scopeLeakMinPeople, 1);
  assert.equal(leak.evidence.threshold.proposal, true);
  assert.equal(leak.id, 'position-scope-leak:preview:2026-10:nv');
  // danh sách bị cắt: chỉ biết số người tối thiểu
  const cut = suggestFromPreview({
    impact: await impactOf([person2('ctv', 1)], { truncated: true, affected: 30 }),
    scope
  }).suggestions.find(s => s.rule === 'position-scope-leak');
  assert.equal(cut.evidence.inputs.lowerBound, true);
  assert.match(cut.message, /ít nhất 1 người/);
});

test('luật xem trước: ngưỡng và công tắc đọc từ params; thiếu khoá thì dùng mặc định của thresholds.js; kết quả ghi luật đã chạy và đã bỏ', async () => {
  const impact = await impactOf([person2('nv', 100000), person2('ctv', 100000)]);
  const base = suggestFromPreview({ impact, scope: { position: 'nv' } });
  assert.deepEqual(base.checked.ruleIds, ['formula-large-change', 'position-scope-leak']);
  assert.deepEqual(base.checked.skipped, []);
  assert.deepEqual(rulesOf(base), ['position-scope-leak']);
  // nâng ngưỡng số người ngoài chức vụ lên 2: 1 người ngoài không còn đủ
  const raised = suggestFromPreview({
    impact,
    scope: { position: 'nv' },
    params: { ...DEFAULTS, 'ai.threshold.scopeLeakMinPeople': 2 }
  });
  assert.deepEqual(rulesOf(raised), []);
  // hạ ngưỡng tổng tiền: 200.000 đủ
  const lowered = suggestFromPreview({
    impact,
    params: { ...DEFAULTS, 'ai.threshold.formulaChangeTotalVnd': 200000 }
  });
  assert.deepEqual(rulesOf(lowered), ['formula-large-change']);
  assert.equal(
    lowered.suggestions[0].evidence.threshold.sources.formulaChangeTotalVnd,
    'Admin đặt trong Cài đặt ai.threshold.formulaChangeTotalVnd (mặc định 5000000)'
  );
  // tắt luật
  const off = suggestFromPreview({
    impact,
    scope: { position: 'nv' },
    params: { ...DEFAULTS, 'ai.rule.positionScopeLeak.enabled': false, 'ai.rule.formulaLargeChange.enabled': false }
  });
  assert.deepEqual(off.suggestions, []);
  assert.deepEqual(
    off.checked.skipped.map(s => s.reason),
    ['Admin tắt', 'Admin tắt']
  );
  // không có phạm vi: scope-leak được ghi là bỏ qua
  const none = suggestFromPreview({ impact });
  assert.equal(
    none.checked.skipped.find(s => s.rule === 'position-scope-leak').reason,
    'Thay đổi không dành riêng cho chức vụ nào'
  );
  // bảng ngưỡng mặc định khớp mô tả
  const resolved = resolveThresholds(undefined, DEFAULTS);
  assert.equal(resolved.formulaChangeTotalVnd.proposal, true);
  assert.equal(resolved.scopeLeakMinPeople.value, 1);
  assert.equal(resolved.overrideEntryRoundVnd.value, 100000);
  for (const rule of PREVIEW_RULES)
    for (const name of rule.thresholds) assert.ok(Object.hasOwn(THRESHOLDS, name), name);
});

test('luật xem trước thuần: không sửa đầu vào, không có tên hay tên đăng nhập trong kết quả, đầu vào sai bị từ chối', async () => {
  const impact = await impactOf([
    { username: 'qa_x', name: 'TÊN GIẢ', ...person2('ctv', 6000000) },
    { username: 'qa_y', name: 'TÊN GIẢ 2', ...person2('nv', 100000) }
  ]);
  const before = JSON.stringify(impact);
  const result = suggestFromPreview({ impact, scope: { position: 'nv' } });
  assert.equal(JSON.stringify(impact), before);
  const text = JSON.stringify(result);
  assert.ok(!text.includes('qa_x') && !text.includes('TÊN GIẢ'), 'không lộ tên');
  assert.throws(() => suggestFromPreview({}), /impact/);
  assert.throws(
    () => suggestFromPreview({ impact, params: { ...DEFAULTS, 'ai.rule.positionScopeLeak.enabled': 'có' } }),
    /true hoặc false/
  );
  assert.throws(() => suggestFromPreview({ impact, thresholds: { khongCo: 1 } }), /Ngưỡng không có trong bảng/);
});

/* ---------- quyền lợi theo bậc: level.<mã>.<bậc>.benefit.<cờ> thắng cờ của chức vụ ---------- */
test('benefitOf theo bậc: khoá của bậc thắng cờ chức vụ, null thì kế thừa, vắng bậc thì dùng chức vụ, sai kiểu là lỗi', () => {
  const params = {
    ...DEFAULTS,
    'level.nv.2.benefit.ot': false,
    'level.tts.1.benefit.kpi': true,
    'level.nv.3.benefit.ot': null
  };
  assert.equal(benefitOf(params, 'nv', 'ot', 1), true, 'bậc 1 kế thừa chức vụ');
  assert.equal(benefitOf(params, 'nv', 'ot', 2), false, 'bậc 2 tắt');
  assert.equal(benefitOf(params, 'nv', 'ot', 3), true, 'null là kế thừa');
  assert.equal(benefitOf(params, 'nv', 'ot'), true, 'không truyền bậc: chức vụ');
  assert.equal(benefitOf(params, 'tts', 'kpi', 1), true, 'bậc bật cờ mà chức vụ tắt');
  assert.equal(benefitOf(params, 'tts', 'kpi', 2), false);
  assert.throws(() => benefitOf({ 'level.nv.1.benefit.ot': 'có' }, 'nv', 'ot', 1), /true hoặc false/);
});

test('OT theo bậc: chức vụ tắt cờ OT ở bậc 2 nhưng bật ở bậc 1 thì chỉ người bậc 1 vào nhóm ot-above-team', async () => {
  const team = ['qa_1', 'qa_2', 'qa_3', 'qa_4', 'qa_5'];
  const light = Object.fromEntries(team.map(u => [u, { '2026-10-05': otDay('20:00') }]));
  const heavyDays = Object.fromEntries(
    ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'].map(d => [d, otDay('20:00')])
  );
  const params = await copyPosition('nv', 'hdo2', { 'level.hdo2.2.benefit.ot': false });
  const run = async level =>
    review(
      await withParams(
        {
          people: [...team.map(u => person(u)), await person('qa_heavy', { type: 'hdo2', level })],
          days: { ...light, qa_heavy: heavyDays }
        },
        params
      )
    );
  assert.deepEqual(ids(await run(1), 'ot-above-team'), ['qa_heavy|2026-10'], 'bậc 1: có OT');
  assert.deepEqual(ids(await run(2), 'ot-above-team'), [], 'bậc 2: tắt OT');
});
