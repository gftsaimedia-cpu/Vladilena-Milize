'use strict';
// Bảng ngưỡng DUY NHẤT của "Soát dữ liệu trước khi chốt lương".
// Mỗi ô: value (giá trị), proposal (true = giá trị đề xuất, chưa được xác nhận), source (nguồn hoặc lý do).
// Ngưỡng nhắc lại một luật nghiệp vụ có sẵn thì proposal false và source nêu luật đó.
// Đổi một ngưỡng: sửa đúng một ô ở đây (hoặc truyền `thresholds: { tênNgưỡng: giáTrị }` vào review()); không sửa trong review.js.
// Không ngưỡng nào ở đây đổi tiền, công hay hồ sơ: chúng chỉ quyết định khoản nào được gắn "Cần xem".
// GIÁ TRỊ đang chạy lấy từ bộ tham số (AiParams): khoá ai.threshold.<tên>, hoặc khoá gốc mà ngưỡng nhắc lại
// (PARAM_KEY). Bảng THRESHOLDS vẫn giữ nhãn proposal, nguồn và giá trị mặc định (nguồn sinh của PayrollParams.DEFAULTS, và giá trị
// dùng khi bộ tham số không có khoá đó); đổi giá trị thật ở Cài đặt, không sửa review.js.
const PayrollParams = require('../engine/payroll-params');

const entry = (value?, proposal?, source?) => Object.freeze({ value, proposal, source });

const THRESHOLDS = Object.freeze({
  // --- Tần suất khai ---
  isatPerMonth: entry(
    4,
    true,
    'Đề xuất: IA v3 gợi ý "iSAT lần thứ 4"; iSAT không giới hạn theo luật (LUAT-DU-AN 12.4 #4 chưa chốt)'
  ),
  approvedLeavePerMonth: entry(
    3,
    true,
    'Đề xuất: bằng ngưỡng mất chuyên cần; "Nghỉ được duyệt" chưa có giới hạn riêng (LUAT-DU-AN 12.4 #3 đã trả lời 26/10/2026: Đ43, ngày đã duyệt tính như nghỉ không lương)'
  ),
  // --- Hạn và lịch sử khai ---
  reportDeadlineDay: entry(
    3,
    false,
    'Chủ dự án, 15/10/2026: nhân sự báo công trước ngày 3 của tháng sau (ghi ở khung đầu LUAT-DU-AN, "Nhịp tháng"; ngày 3 tính cả ngày)'
  ),
  rejectedLookbackDays: entry(60, true, 'Đề xuất: khoản cùng loại bị từ chối trong 60 ngày gần nhất'),
  repeatedEditsRev: entry(
    3,
    true,
    'Đề xuất: khoản chờ duyệt đã đổi từ 2 lần (rev từ 3 trở lên; rev tăng cả khi Admin quyết định)'
  ),
  // --- Đối chiếu Check-in/out ---
  presenceGapMin: entry(
    30,
    true,
    'Đề xuất: IA v3 ghi 30 phút là "giả định của thiết kế, C&B quyết"; khai nhưng không có Check-in luôn bị gắn'
  ),
  // --- OT ---
  otMedianFactor: entry(2, true, 'Đề xuất: OT của một người từ 2 lần trung vị của nhóm trở lên'),
  otMedianMinHours: entry(8, true, 'Đề xuất: và ít nhất 8 giờ OT trong tháng, để người OT ít không bị gắn'),
  otMedianMinPeers: entry(5, true, 'Đề xuất: chỉ so khi có ít nhất 5 người có OT trong tháng'),
  // --- Chuyên cần (nhắc lại luật nghiệp vụ) ---
  attendMaxAbsentDays: entry(
    3,
    false,
    'LUAT-DU-AN 8.2; THAO-LUAN Đ8 (lead 15/10/2026): nghỉ đủ 3 ngày là mất chuyên cần'
  ),
  overLimitHours: entry(24, false, 'LUAT-DU-AN 8.1: giờ vượt ngưỡng từ 24 giờ là mất chuyên cần'),
  // --- Tiền ---
  impactVnd: entry(500000, true, 'Đề xuất: IA v3 gợi ý 500.000 ₫ cho "Tác động lớn"'),
  slipDiffVnd: entry(500000, true, 'Đề xuất: số Admin sửa trên phiếu lệch từ 500.000 ₫'),
  slipDiffRatio: entry(0.2, true, 'Đề xuất: và lệch từ 20% so với số tự tính'),
  // --- KPI ---
  kpiFullMonths: entry(3, true, 'Đề xuất: tự đánh giá 100% từ 3 tháng liên tiếp'),
  kpiFullPct: entry(100, false, 'Tự đánh giá tối đa là 100% (LUAT-DU-AN 8.3)'),
  // --- Tham số và công thức ---
  paramChangePeoplePct: entry(
    0.2,
    true,
    'Đề xuất: thay đổi tham số hoặc công thức làm đổi thực nhận từ 20% số người (cùng mức 20% với ngưỡng đổi thực nhận và ngưỡng lệch số phiếu)'
  ),
  // --- Chức vụ, khối phụ cấp, số sửa phiếu (gợi ý, không chặn) ---
  formulaChangeTotalVnd: entry(
    5000000,
    true,
    'Đề xuất: tổng thực nhận của mọi người đổi từ 5.000.000 ₫ (tuyệt đối) khi xem trước một thay đổi; chủ dự án chốt'
  ),
  scopeLeakMinPeople: entry(
    1,
    true,
    'Đề xuất: thay đổi dành cho một chức vụ mà chạm từ 1 người ngoài chức vụ là gắn (không có mức "chấp nhận được")'
  ),
  overrideEntryRoundVnd: entry(
    100000,
    true,
    'Đề xuất: số sửa tăng so với số tự tính đúng bội của 100.000 ₫ thì trông như một khoản cộng thêm; chủ dự án chốt'
  )
});

// Ngưỡng nhắc lại một luật đã có khoá riêng thì lấy từ khoá gốc; null = luật không có khoá tham số
const PARAM_KEY = Object.freeze({
  reportDeadlineDay: 'period.reportDeadlineDay',
  attendMaxAbsentDays: 'type.nv.maxAbsent',
  overLimitHours: 'attendance.overLimitHours',
  kpiFullPct: null
});
const paramKeyOf = (name?) => (Object.hasOwn(PARAM_KEY, name) ? PARAM_KEY[name] : `ai.threshold.${name}`);

// Giá trị của một ngưỡng theo bộ tham số. Khoá vắng hoặc null thì giữ ô mặc định;
// giá trị bằng mặc định thì giữ nguyên ô (nhãn proposal và nguồn không đổi); khác mặc định thì ngưỡng AI là proposal (Admin đã đặt,
// chưa xác nhận), còn ngưỡng nhắc lại luật giữ cờ của ô và ghi rõ lấy từ khoá nào.
function fromParams(name?, item?, params?) {
  const key = paramKeyOf(name);
  if (key === null) return item;
  const value = params[key];
  if (value === undefined || value === null) return item;
  if (typeof value !== typeof item.value) throw new TypeError(`Tham số ${key} sai kiểu dữ liệu`);
  if (typeof value === 'number' && !Number.isFinite(value)) throw new TypeError(`Tham số ${key} phải là số hữu hạn`);
  if (value === item.value) return item;
  const own = key === `ai.threshold.${name}`;
  return entry(
    value,
    own || item.proposal,
    `${own ? 'Admin đặt trong Cài đặt' : 'Lấy từ tham số'} ${key} (mặc định ${item.value})`
  );
}

// Giới hạn kỹ thuật của chính src/ai/ (không phải ngưỡng chính sách): khoá ai.limit.<tên> của bộ tham số; vắng khoá thì dùng mặc định dưới đây.
//   evidenceListMax  tối đa bao nhiêu mục một danh sách trong evidence (ngày làm bù, khoá tham số đổi...)
const LIMITS = Object.freeze({ evidenceListMax: 5 });
function resolveLimits(params = PayrollParams.DEFAULTS) {
  const out: Record<string, any> = {};
  for (const [name, fallback] of Object.entries<any>(LIMITS)) {
    const value = params[`ai.limit.${name}`];
    if (value === undefined || value === null) out[name] = fallback;
    else if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0)
      throw new TypeError(`Tham số ai.limit.${name} phải là số hữu hạn lớn hơn 0`);
    else out[name] = value;
  }
  return Object.freeze(out);
}

// Luật bật hay tắt: khoá ai.rule.<id viết camelCase>.enabled; vắng khoá thì bật.
const ruleKeyOf = (id?) =>
  `ai.rule.${id
    .split('-')
    .map((word, index) => (index ? word[0].toUpperCase() + word.slice(1) : word))
    .join('')}.enabled`;
function isRuleEnabled(params?, id?) {
  const value = params[ruleKeyOf(id)];
  if (value === undefined) return true;
  if (typeof value !== 'boolean') throw new TypeError(`Tham số ${ruleKeyOf(id)} phải là true hoặc false`);
  return value;
}

// Bảng ngưỡng hiện hành: giá trị lấy từ bộ tham số (mặc định PayrollParams.DEFAULTS), rồi ghép giá trị ghi đè của người gọi
// (chỉ khoá đã có, đúng kiểu); ghi đè luôn được tính là proposal vì đã khác bảng mặc định.
function resolveThresholds(overrides?, params = PayrollParams.DEFAULTS) {
  const out: Record<string, any> = {};
  for (const [name, item] of Object.entries<any>(THRESHOLDS)) out[name] = fromParams(name, item, params);
  for (const [name, value] of Object.entries<any>(overrides || {})) {
    if (!Object.hasOwn(THRESHOLDS, name)) throw new TypeError(`Ngưỡng không có trong bảng: ${name}`);
    if (typeof value !== typeof THRESHOLDS[name].value) throw new TypeError(`Ngưỡng ${name} sai kiểu dữ liệu`);
    if (typeof value === 'number' && !Number.isFinite(value)) throw new TypeError(`Ngưỡng ${name} phải là số hữu hạn`);
    out[name] = entry(value, true, `Ghi đè khi gọi review() (mặc định ${THRESHOLDS[name].value})`);
  }
  return out;
}

// Phần "threshold" của evidence: chỉ các ngưỡng rule dùng, kèm proposal (true nếu có ngưỡng nào là đề xuất) và nguồn của từng ngưỡng.
function describeThresholds(table?, names?, note?) {
  const threshold: Record<string, any> = {};
  const sources: Record<string, any> = {};
  let proposal = false;
  for (const name of names) {
    if (!Object.hasOwn(table, name)) throw new Error(`Ngưỡng không có trong bảng: ${name}`);
    threshold[name] = table[name].value;
    sources[name] = table[name].source;
    if (table[name].proposal) proposal = true;
  }
  return { ...threshold, ...(note ? { basis: note } : {}), proposal, sources };
}

export = {
  THRESHOLDS,
  LIMITS,
  resolveLimits,
  PARAM_KEY,
  resolveThresholds,
  describeThresholds,
  isRuleEnabled,
  ruleKeyOf
};
