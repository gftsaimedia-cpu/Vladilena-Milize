'use strict';
// Gợi ý AI cho "xem trước" một thay đổi cài đặt (trường `suggestions` của kết quả xem trước).
// Hai luật, đều CHỈ GỢI Ý, không bao giờ chặn việc lưu:
//   formula-large-change   thay đổi làm đổi thực nhận của nhiều người, hoặc tổng chênh lớn
//   position-scope-leak    thay đổi dành cho một chức vụ nhưng có người ngoài chức vụ bị đổi tiền
//
// Thuần: không I/O, không đồng hồ, không đọc tham số ngoài `params` truyền vào; đầu vào không bị đổi. Không có tên người, không có
// tên đăng nhập trong kết quả: evidence chỉ chứa số người, mã chức vụ và số tiền cần để giải thích.
//
// suggestFromPreview({ impact, scope, params, thresholds }) → { suggestions, checked }
//   impact      kết quả `impactOf` của preview (lib/params/save.js) với mỗi người trong `people` có thêm `type` (mã chức vụ của người đó):
//               { month, people: [{ type, before: { net }, after: { net }, diff?: { net } }],
//                 totals: { people, affected, truncated?, delta: { net } } }
//               `people` có thể bị cắt (system.params.previewMaxPeople): luật đếm theo `totals` khi có thể, còn việc đếm người ngoài
//               chức vụ chỉ thấy phần không bị cắt (evidence.inputs.lowerBound = true khi cắt).
//   scope       { position: '<mã>' } hoặc { positions: ['<mã>', ...] } khi thay đổi dành riêng cho chức vụ; vắng thì luật scope-leak không chạy
//   params      bộ tham số phẳng của tháng; ngưỡng ai.threshold.* và công tắc ai.rule.<id>.enabled; vắng khoá thì dùng mặc định của thresholds.js
//   thresholds  ghi đè ngưỡng theo tên (như review()); ghi đè luôn là proposal
// Mỗi gợi ý: { rule, severity, month, message, evidence: { inputs, threshold }, id, digest }; threshold.proposal = true khi có ngưỡng đang là đề xuất.
// checked: { ruleIds: [luật đã chạy], skipped: [{ rule, reason }] }.

const PayrollParams = require('../../public/payroll-params.js');
const { resolveThresholds, resolveLimits, describeThresholds, isRuleEnabled } = require('./thresholds.js');
const { units } = require('./units.js');

const { round2, digestOf } = units;

const PREVIEW_RULES = Object.freeze([
  {
    id: 'formula-large-change',
    severity: 'medium',
    label: 'Thay đổi làm đổi thực nhận của nhiều người hoặc tổng chênh lớn',
    fields: ['peopleAffected', 'peopleTotal', 'share', 'totalDiffVnd', 'triggers'],
    thresholds: ['paramChangePeoplePct', 'formulaChangeTotalVnd']
  },
  {
    id: 'position-scope-leak',
    severity: 'medium',
    label: 'Thay đổi dành cho một chức vụ nhưng chạm người ngoài chức vụ',
    fields: ['positions', 'peopleInScope', 'peopleOutside', 'outsidePositions', 'outsideDiffVnd', 'lowerBound'],
    thresholds: ['scopeLeakMinPeople']
  }
]);

const num = value => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const netDiffOf = person => {
  if (person && person.diff && num(person.diff.net) !== null) return person.diff.net;
  const before = person && person.before ? num(person.before.net) : null;
  const after = person && person.after ? num(person.after.net) : null;
  return before !== null && after !== null ? after - before : 0;
};
const vndText = amount =>
  Math.round(amount)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' ₫';

function positionsOf(scope) {
  if (!scope || typeof scope !== 'object') return [];
  const list = Array.isArray(scope.positions) ? scope.positions : scope.position !== undefined ? [scope.position] : [];
  return [...new Set(list.filter(code => typeof code === 'string' && code !== ''))].sort();
}

function toSuggestion(rule, hit, ctx) {
  for (const key of Object.keys(hit.inputs))
    if (!rule.fields.includes(key)) throw new Error(`Luật ${rule.id} đưa vào evidence trường ngoài danh sách: ${key}`);
  return {
    rule: rule.id,
    severity: rule.severity,
    month: ctx.month,
    message: hit.message,
    evidence: { inputs: hit.inputs, threshold: describeThresholds(ctx.thresholds, rule.thresholds) },
    id: `${rule.id}:preview:${hit.key}`,
    digest: digestOf(JSON.stringify(hit.inputs))
  };
}

const RUNNERS = {
  'formula-large-change'(ctx) {
    const { totals } = ctx.impact;
    if (!totals) return null;
    const total = num(totals.people);
    const affected = num(totals.affected);
    const delta = totals.delta ? num(totals.delta.net) : null;
    if (total === null || affected === null || delta === null) return null;
    const share = total > 0 ? affected / total : 0;
    const triggers = [];
    if (affected > 0 && share >= ctx.thresholds.paramChangePeoplePct.value) triggers.push('people-share');
    if (Math.abs(delta) >= ctx.thresholds.formulaChangeTotalVnd.value) triggers.push('total-amount');
    if (!triggers.length) return [];
    const parts = [];
    if (triggers.includes('people-share'))
      parts.push(`đổi thực nhận của ${affected}/${total} người (${Math.round(share * ctx.units.percent)}%)`);
    if (triggers.includes('total-amount')) parts.push(`tổng thực nhận đổi ${vndText(delta)}`);
    return [
      {
        key: ctx.month,
        message: `Thay đổi này ${parts.join(' và ')}. Xem lại danh sách người bị ảnh hưởng trước khi áp dụng`,
        inputs: {
          peopleAffected: affected,
          peopleTotal: total,
          share: round2(share),
          totalDiffVnd: Math.round(delta),
          triggers
        }
      }
    ];
  },

  'position-scope-leak'(ctx) {
    const positions = positionsOf(ctx.scope);
    if (!positions.length) return null;
    const people = Array.isArray(ctx.impact.people) ? ctx.impact.people : [];
    const inside = [];
    const outside = [];
    for (const person of people) {
      if (!person || typeof person.type !== 'string' || person.type === '') continue; // chưa biết chức vụ thì không kết luận được
      (positions.includes(person.type) ? inside : outside).push(person);
    }
    if (outside.length < ctx.thresholds.scopeLeakMinPeople.value) return [];
    const listMax = ctx.limits.evidenceListMax;
    const outsidePositions = [...new Set(outside.map(person => person.type))].sort();
    const outsideDiff = outside.reduce((sum, person) => sum + netDiffOf(person), 0);
    const lowerBound = Boolean(ctx.impact.totals && ctx.impact.totals.truncated);
    return [
      {
        key: `${ctx.month}:${positions.join('+')}`,
        message: `Thay đổi dành cho chức vụ ${positions.join(', ')} nhưng làm đổi thực nhận của ${lowerBound ? 'ít nhất ' : ''}${outside.length} người thuộc chức vụ khác (${outsidePositions.slice(0, listMax).join(', ')}). Kiểm tra khoá nào đang dùng chung`,
        inputs: {
          positions,
          peopleInScope: inside.length,
          peopleOutside: outside.length,
          outsidePositions: outsidePositions.slice(0, listMax),
          outsideDiffVnd: Math.round(outsideDiff),
          lowerBound
        }
      }
    ];
  }
};

function suggestFromPreview(input) {
  if (!input || typeof input !== 'object' || !input.impact || typeof input.impact !== 'object')
    throw new TypeError('Thiếu impact của xem trước');
  const params = input.params && typeof input.params === 'object' ? input.params : PayrollParams.DEFAULTS;
  const ctx = {
    impact: input.impact,
    scope: input.scope,
    month: typeof input.impact.month === 'string' ? input.impact.month : null,
    thresholds: resolveThresholds(input.thresholds, params),
    limits: resolveLimits(params),
    units
  };
  const suggestions = [];
  const ruleIds = [];
  const skipped = [];
  for (const rule of PREVIEW_RULES) {
    if (!isRuleEnabled(params, rule.id)) {
      skipped.push({ rule: rule.id, reason: 'Admin tắt' });
      continue;
    }
    const hits = RUNNERS[rule.id](ctx);
    if (hits === null) {
      skipped.push({
        rule: rule.id,
        reason:
          rule.id === 'position-scope-leak' ? 'Thay đổi không dành riêng cho chức vụ nào' : 'Thiếu totals của xem trước'
      });
      continue;
    }
    ruleIds.push(rule.id);
    for (const hit of hits) suggestions.push(toSuggestion(rule, hit, ctx));
  }
  return { suggestions, checked: { ruleIds, skipped } };
}

module.exports = { suggestFromPreview, PREVIEW_RULES };
