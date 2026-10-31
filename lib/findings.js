'use strict';
// Bỏ qua phát hiện AI của một phiếu lương, có lý do. Nằm trên bảng ai_finding_actions của lib/db.js
// (store.aiFindings: chỉ thêm dòng, không sửa, không xoá).
//
// Đơn vị ở đây là CỜ CỦA PHIẾU: (tháng, tài khoản, mã luật). Cờ do bước "AI kiểm tra" gắn vào phiếu của lần tính hiện hành (payslips.flags_json).
//   findingId   `slip:<luật>:<tài khoản>:<tháng>` (tiền tố `slip:` để không trùng id phát hiện từng ngày `luật:tài khoản:ngày` của lib/ai/review.js)
//   digest      băm đầu vào của LẦN TÍNH hiện hành (payroll_runs.inputs_digest). Tính lại với đầu vào đã đổi thì băm đổi và mọi lần bỏ qua
//               cũ hết hiệu lực (store.aiFindings.isDismissed so digest); tính lại với đầu vào y nguyên thì giữ.
// Một phát hiện "còn hiệu lực" (active) khi phiếu còn cờ đó và chưa có lần bỏ qua khớp digest. Phiếu hết cờ (AI chạy lại, không còn gì) thì không còn gì phải bỏ qua.
//
//   dismiss({ month, username, rule, reason, by }, actx?)   bỏ qua một cờ; lý do 10–300 ký tự; ghi nhật ký cùng giao dịch; lặp lại thì không ghi thêm
//   activeFindings(month, username)                          mã luật còn hiệu lực trên phiếu (mảng chữ, có thể rỗng)
const crypto = require('node:crypto');
const { AsyncList } = require('./shared/async-list');
const store = require('./db');
const audit = require('./audit');
const authz = require('./authz');
const config = require('./config');
const { warnIf, optionalReason } = require('./warnings');
const PayrollCalendar = require('../public/payroll-calendar.js');

const error = (code, message, httpStatus = 409, details) =>
  Object.assign(new Error(message), { code, httpStatus, ...(details ? { details } : {}) });
const needMonth = month => {
  if (!PayrollCalendar.isValidMonth(month)) throw error('BAD_MONTH', 'Tháng phải có dạng YYYY-MM', 400);
  return month;
};
const needText = (value, name) => {
  if (typeof value !== 'string' || !value.trim()) throw error('BAD_ARGS', `Thiếu ${name}`, 400);
  return value.trim();
};
const findingIdOf = (month, username, rule) => `slip:${rule}:${username}:${month}`;
// Băm của lần tính = đầu vào + bộ tham số của lần chạy: đổi tham số (kể cả khi đầu vào y nguyên) thì mọi lần bỏ qua cũ hết hiệu lực.
// Lần bỏ qua ghi bằng băm chỉ có đầu vào thì không khớp, hết hiệu lực; Admin bỏ qua lại.
const digestOf = run => `${run.inputsDigest || `run:${run.id}`}|${run.paramsHash || ''}`;

// Lần tính hiện hành, phiếu của người đó và các cờ trên phiếu
async function slipOf(month, username) {
  const run = await store.payroll.currentRun(month);
  if (!run) return { run: null, slip: null, rules: [] };
  const slip = await store.payroll.getPayslip(run.id, username);
  return { run, slip, rules: slip && Array.isArray(slip.flags) ? slip.flags : [] };
}
const dismissedNow = async (month, username, rule, run) =>
  await store.aiFindings.isDismissed(findingIdOf(month, username, rule), digestOf(run));

async function activeFindings(month, username) {
  needMonth(month);
  const { run, rules } = await slipOf(month, needText(username, 'username'));
  return run ? AsyncList.filter(rules, async rule => !(await dismissedNow(month, username, rule, run))) : [];
}

async function dismiss({ month, username, rule, reason, by, me }, actx) {
  needMonth(month);
  needText(username, 'username');
  needText(rule, 'rule');
  needText(by, 'by');
  // Không ai bỏ qua phát hiện trên phiếu lương của chính mình (cùng luật với duyệt phiếu); me tuỳ chọn, mặc định đọc hồ sơ của `by`
  // Chỉ cảnh báo, nhật ký ghi after.self; lý do không bắt buộc (quá độ dài tối đa vẫn lỗi)
  warnIf('SELF_DECISION_FORBIDDEN', authz.isSelfDecision(me || (await store.getStaff(by.trim())), username.trim()), {
    message:
      'Bạn đang bỏ qua phát hiện AI trên phiếu lương của chính mình; việc này được ghi vào nhật ký là tự thực hiện. Số tiền không đổi.'
  });
  const note = optionalReason(reason, {
    tooLong: () => error('REASON_REQUIRED', `Lý do bỏ qua tối đa ${config.REASON_MAX} ký tự`, 400)
  });
  const ctx = actx || { actor: by, actorRoles: [], requestId: crypto.randomUUID() };
  const findingId = findingIdOf(month, username, rule);
  return await store.transaction(async () => {
    const { run, slip, rules } = await slipOf(month, username);
    if (!run) throw error('PERIOD_NOT_READY', 'Kỳ này chưa có lần tính lương', 409, { month });
    warnIf('PERIOD_STATE', run.status !== 'draft', {
      message: `Kỳ ${month} đã duyệt: việc bỏ qua phát hiện chỉ để ghi nhận, phiếu đã chốt không đổi số tiền.`
    });
    if (!slip) throw error('PAYSLIP_NOT_FOUND', 'Không có phiếu của người này trong kỳ', 404, { month });
    if (!rules.includes(rule))
      throw error('FINDING_NOT_FOUND', `Phiếu không có phát hiện "${rule}" nào để bỏ qua`, 404, { month });
    const already = await dismissedNow(month, username, rule, run);
    let row = await store.aiFindings.latest(findingId);
    if (!already) {
      row = await store.aiFindings.dismiss({ findingId, digest: digestOf(run), month, ruleId: rule, by, note });
      await audit.write(ctx, {
        action: 'ai.finding.dismiss',
        entityKind: 'ai-finding',
        entityId: findingId,
        subject: username,
        month,
        after: { rule, runId: run.id },
        reason: note,
        sensitivity: 'pay'
      });
    }
    return {
      month,
      username,
      rule,
      dismissed: true,
      already,
      by: row.by,
      at: row.at,
      remaining: await AsyncList.filter(rules, async r => !(await dismissedNow(month, username, r, run)))
    };
  });
}

// Gắn trạng thái "đã bỏ qua" vào danh sách phát hiện của AI (GET /api/ai/review): thêm dismissed = { by, at, note } hoặc null cho từng phát hiện, ghép theo
// (tháng, tài khoản, mã luật) với lần tính hiện hành. Dùng cùng băm với lúc bỏ qua (đầu vào + tham số của lần chạy): dữ liệu hay tham số đổi sau đó thì
// phát hiện hiện lại với dismissed null. Chưa có lần tính thì chưa ai bỏ qua được: tất cả null. Không đổi gì trong DB.
async function annotate(month, list) {
  needMonth(month);
  const run = await store.payroll.currentRun(month);
  const marks = new Map();
  if (run && list.length) {
    const digest = digestOf(run);
    const ids = new Set(list.map(f => findingIdOf(month, f.username, f.rule)));
    const digests = Object.fromEntries([...ids].map(id => [id, digest]));
    for (const id of await store.aiFindings.dismissedIds(month, digests))
      if (ids.has(id)) {
        const last = await store.aiFindings.latest(id);
        if (last) marks.set(id, { by: last.by, at: last.at, note: last.note });
      }
  }
  return list.map(f => ({ ...f, dismissed: marks.get(findingIdOf(month, f.username, f.rule)) || null }));
}

module.exports = { dismiss, activeFindings, annotate, findingIdOf };
