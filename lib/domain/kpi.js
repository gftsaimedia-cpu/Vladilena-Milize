const store = require('../db');
const { HttpError } = require('../http');
const KpiRules = require('../../public/kpi-score.js'); // KPI 5 thành phần: điểm, trọng số, ngưỡng
const { rulesFor, monthParams, typeParam } = require('../request-rules');
const { warnIf } = require('../warnings');

/* ---------- phép năm ---------- */
// Lương KPI tối đa của level (đồng): khoá level.<loại>.<level>.kpi; loại hay level không có KPI (TTS, Admin) thì null
const kpiMaxOf = (staff, params) => {
  if (!staff || !staff.payrollSubject) return null;
  const key = `level.${staff.type}.${staff.level}.kpi`;
  const source = params || monthParams();
  return (Object.hasOwn(source, key) && source[key]) || null;
};
function cleanKpi(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new HttpError(400, 'KPI không hợp lệ');
  return Math.max(0, Math.min(100, n));
}
// Lương KPI đề xuất / duyệt (đồng): số hữu hạn, không âm, không vượt mức tối đa của level (nếu loại nhân sự có KPI)
function cleanKpiAmt(v, staff, month) {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' || typeof v === 'string' ? Number(v) : NaN;
  if (!Number.isFinite(n) || n < 0) throw new HttpError(400, 'Lương KPI phải là số không âm');
  const max = kpiMaxOf(staff, monthParams(month));
  // Vượt trần chỉ cảnh báo; bộ máy kẹp mức KPI ở trần của bậc khi tính (public/payroll-engine.js → ca()), nên tiền KPI không vượt trần
  warnIf('KPI_OVER_CAP', max != null && n > max, {
    message: () => `Lương KPI không được vượt mức tối đa của level ${staff.level} (${max.toLocaleString('vi-VN')} đ)`, // lazy: max có thể null (TTS)
    consequence: () =>
      `Mức KPI ${n.toLocaleString('vi-VN')} ₫ được lưu nhưng bộ máy chỉ tính tối đa ${max.toLocaleString('vi-VN')} ₫ (phần vượt ${(n - max).toLocaleString('vi-VN')} ₫ không được trả).`
  });
  return n;
}

/* ---------- KPI 5 thành phần ---------- */
// Chỉ CTV và NV (không TTS, không Admin) có KPI
const hasKpi = (staff, params) => kpiMaxOf(staff, params) != null;
// Điểm trong DB là số nguyên (điểm × 100); API nhận và trả điểm 0 … 100 (tối đa 2 chữ số thập phân)
const kpiScoresOut = (row, KpiScore) =>
  Object.fromEntries(
    KpiScore.COMPONENTS.map(c => [c.key, row && row.scores[c.key] != null ? row.scores[c.key] / 100 : null])
  );
// Một dòng của GET/PUT /kpi/scores: điểm, tổng, cổng Wework, đạt, mức KPI
function kpiScoreItem(staff, month, row, params = monthParams(month)) {
  const KpiScore = KpiRules.create(params);
  const scores = kpiScoresOut(row, KpiScore),
    e = KpiScore.evaluate(scores, { pass: typeParam(params, staff.type, 'kpiPass') }),
    sheet = store.getSheet(staff.username, month);
  return {
    username: staff.username,
    name: staff.name,
    type: staff.type,
    level: staff.level,
    kpiMax: kpiMaxOf(staff, params),
    ...(staff.locked ? { locked: true } : {}),
    scores,
    complete: e.complete,
    missing: e.missing,
    total: e.total,
    weworkOk: e.weworkOk,
    pass: e.complete ? e.pass : null,
    reason: e.reason,
    amtProposed: sheet.kpiAmt,
    amtApproved: sheet.kpiAdmAmt,
    selfSuggested: sheet.kpiPct,
    updatedBy: row ? row.updatedBy : null,
    updatedAt: row ? row.updatedAt : null
  };
}
// Điểm gửi kèm /sheet và /team: chỉ khi đủ 5 điểm; chưa đủ thì không lộ điểm từng phần.
// Điểm "Tự đánh giá" (self) là phần của CHÍNH nhân sự, nên người đó luôn thấy self của mình, kể cả khi
// chưa đủ năm điểm (Admin xem điểm từng người ở GET /kpi/scores); chưa nhập thì không có khoá self.
function kpiPartsView(row, month, viewer) {
  const KpiScore = rulesFor(month).kpi;
  const own = !!viewer && !!row && viewer.username === row.username ? kpiScoresOut(row, KpiScore).self : null;
  const withSelf = parts => (own === null ? parts : { ...parts, self: own }); // chưa nhập thì không có khoá self
  if (!row || !row.complete) return withSelf({ complete: false });
  return { complete: true, ...kpiScoresOut(row, KpiScore) };
}
// Nhân sự không có quyền nhập điểm ở phạm vi all chỉ được lưu điểm `self` của CHÍNH MÌNH: người khác hoặc thành phần khác hoặc mức KPI là 403.
// wanted: tên đăng nhập trong yêu cầu (đã viết thường); scores, amt: thân yêu cầu. Trả true nếu đây là lần nhập tự đánh giá của chính chủ.
function selfScoreOnly(me, wanted, scores, amt) {
  const keys =
    scores && typeof scores === 'object' && !Array.isArray(scores)
      ? Object.keys(scores).filter(k => scores[k] !== undefined)
      : [];
  const ok = wanted === me.username && amt === undefined && keys.length === 1 && keys[0] === 'self';
  if (!ok) throw new HttpError(403, 'Bạn chỉ nhập được điểm Tự đánh giá của chính mình', { code: 'KPI_SELF_ONLY' });
  return true;
}
// Lỗi có mã KPI_* từ lib/db thành 400 (thông báo tiếng Việt, không chứa giá trị người dùng nhập)
function kpiHttpError(error) {
  return error && typeof error.code === 'string' && error.code.startsWith('KPI_')
    ? new HttpError(400, error.message)
    : error;
}

module.exports = {
  kpiMaxOf,
  hasKpi,
  cleanKpi,
  cleanKpiAmt,
  kpiScoresOut,
  kpiScoreItem,
  kpiPartsView,
  kpiHttpError,
  selfScoreOnly
};
