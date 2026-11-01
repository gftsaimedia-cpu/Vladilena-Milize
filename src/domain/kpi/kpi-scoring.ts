'use strict';
const { HttpError } = require('../../platform/http');
const { warnIf } = require('../../platform/warnings');

// KPI của nhân sự: mức tối đa theo level, kiểm giá trị nhập, KPI 5 thành phần (điểm, tổng, cổng Wework, đạt).
// Phụ thuộc đi qua constructor để dùng và test không cần DB thật:
//   sheetOf(username, month)   Lịch ước tính (lấy kpiAmt, kpiAdmAmt, kpiPct)
//   monthParams(month?)        bộ tham số của tháng
//   rulesFor(month)            quy tắc theo tháng (rulesFor(month).kpi)
//   typeParam(params, type, suffix)
//   KpiRules                   src/engine/kpi-score.ts: KPI 5 thành phần, điểm, trọng số, ngưỡng
class KpiScoring {
  declare sheetOf: any;
  declare monthParams: any;
  declare rulesFor: any;
  declare typeParam: any;
  declare KpiRules: any;

  constructor({ sheetOf, monthParams, rulesFor, typeParam, KpiRules }: any) {
    this.sheetOf = sheetOf;
    this.monthParams = monthParams;
    this.rulesFor = rulesFor;
    this.typeParam = typeParam;
    this.KpiRules = KpiRules;
  }

  /* ---------- mức tối đa và giá trị nhập ---------- */
  // Lương KPI tối đa của level (đồng): khoá level.<loại>.<level>.kpi; loại hay level không có KPI (TTS, Admin) thì null
  async maxOf(staff?, params?) {
    if (!staff || !staff.payrollSubject) return null;
    const key = `level.${staff.type}.${staff.level}.kpi`;
    const source = params || (await this.monthParams());
    return (Object.hasOwn(source, key) && source[key]) || null;
  }

  // Chỉ CTV và NV (không TTS, không Admin) có KPI
  async has(staff?, params?) {
    return (await this.maxOf(staff, params)) != null;
  }

  static cleanScore(v?) {
    if (v == null || v === '') return null;
    const n = Number(v);
    if (!Number.isFinite(n)) throw new HttpError(400, 'KPI không hợp lệ');
    return Math.max(0, Math.min(100, n));
  }

  // Lương KPI đề xuất / duyệt (đồng): số hữu hạn, không âm, không vượt mức tối đa của level (nếu loại nhân sự có KPI)
  async cleanAmount(v?, staff?, month?) {
    if (v == null || v === '') return null;
    const n = typeof v === 'number' || typeof v === 'string' ? Number(v) : NaN;
    if (!Number.isFinite(n) || n < 0) throw new HttpError(400, 'Lương KPI phải là số không âm');
    const max = await this.maxOf(staff, await this.monthParams(month));
    // Vượt trần chỉ cảnh báo; bộ máy kẹp mức KPI ở trần của bậc khi tính (src/engine/payroll-engine.ts → ca()), nên tiền KPI không vượt trần
    warnIf('KPI_OVER_CAP', max != null && n > max, {
      message: () => `Lương KPI không được vượt mức tối đa của level ${staff.level} (${max.toLocaleString('vi-VN')} đ)`, // lazy: max có thể null (TTS)
      consequence: () =>
        `Mức KPI ${n.toLocaleString('vi-VN')} ₫ được lưu nhưng bộ máy chỉ tính tối đa ${max.toLocaleString('vi-VN')} ₫ (phần vượt ${(n - max).toLocaleString('vi-VN')} ₫ không được trả).`
    });
    return n;
  }

  /* ---------- KPI 5 thành phần ---------- */
  // Điểm trong DB là số nguyên (điểm × 100); API nhận và trả điểm 0 … 100 (tối đa 2 chữ số thập phân)
  static scoresOut(row?, KpiScore?) {
    return Object.fromEntries(
      KpiScore.COMPONENTS.map(c => [c.key, row && row.scores[c.key] != null ? row.scores[c.key] / 100 : null])
    );
  }

  // Một dòng của GET/PUT /kpi/scores: điểm, tổng, cổng Wework, đạt, mức KPI
  async scoreItem(staff?, month?, row?, given?) {
    const params = given === undefined ? await this.monthParams(month) : given;
    const KpiScore = this.KpiRules.create(params);
    const scores = KpiScoring.scoresOut(row, KpiScore),
      e = KpiScore.evaluate(scores, { pass: this.typeParam(params, staff.type, 'kpiPass') }),
      sheet = await this.sheetOf(staff.username, month);
    return {
      username: staff.username,
      name: staff.name,
      type: staff.type,
      level: staff.level,
      kpiMax: await this.maxOf(staff, params),
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
  async partsView(row?, month?, viewer?) {
    const KpiScore = (await this.rulesFor(month)).kpi;
    const own = !!viewer && !!row && viewer.username === row.username ? KpiScoring.scoresOut(row, KpiScore).self : null;
    const withSelf = (parts?) => (own === null ? parts : { ...parts, self: own }); // chưa nhập thì không có khoá self
    if (!row || !row.complete) return withSelf({ complete: false });
    return { complete: true, ...KpiScoring.scoresOut(row, KpiScore) };
  }

  /* ---------- quyền nhập và lỗi ---------- */
  // Nhân sự không có quyền nhập điểm ở phạm vi all chỉ được lưu điểm `self` của CHÍNH MÌNH: người khác hoặc thành phần khác hoặc mức KPI là 403.
  // wanted: tên đăng nhập trong yêu cầu (đã viết thường); scores, amt: thân yêu cầu. Trả true nếu đây là lần nhập tự đánh giá của chính chủ.
  static selfScoreOnly(me?, wanted?, scores?, amt?) {
    const keys =
      scores && typeof scores === 'object' && !Array.isArray(scores)
        ? Object.keys(scores).filter(k => scores[k] !== undefined)
        : [];
    const ok = wanted === me.username && amt === undefined && keys.length === 1 && keys[0] === 'self';
    if (!ok) throw new HttpError(403, 'Bạn chỉ nhập được điểm Tự đánh giá của chính mình', { code: 'KPI_SELF_ONLY' });
    return true;
  }

  // Lỗi có mã KPI_* từ src/platform/db thành 400 (thông báo tiếng Việt, không chứa giá trị người dùng nhập)
  static httpError(error?) {
    return error && typeof error.code === 'string' && error.code.startsWith('KPI_')
      ? new HttpError(400, error.message)
      : error;
  }
}

export = { KpiScoring };
