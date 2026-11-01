'use strict';
// Lưu tham số tính lương: kiểm, xem trước tác động, ghi cả lô hoặc không.
//   preview(me, body)        → { ok, errors, warnings, impact }: LUÔN trả dữ liệu (kể cả ok:false), không ghi gì (không bảng nào, không nhật ký)
//   save(me, actx, body)     → ghi các dòng param_versions + MỘT dòng nhật ký cho mỗi khoá + config_rev trong CÙNG giao dịch
//   revert(me, actx, body)   → thêm một dòng mới mang giá trị của phiên bản cũ (không xoá, không sửa dòng nào)
// Thân yêu cầu: { changes:[{ key, value }], effectiveMonth?, reason?, expectedRev, basis? }
//   - effectiveMonth mặc định là tháng chưa chốt công sớm nhất; tháng đã chốt công, duyệt hoặc chi trả vẫn đặt được, kèm cảnh báo PERIOD_LOCKED.
//   - expectedRev là paramsRev của GET /api/settings/params cho đúng tháng hiệu lực; lệch là 409 PARAMS_STALE (có người vừa lưu).
//   - Khoá có backing settings:* KHÔNG ghi ở đây (400 PARAM_BACKED_BY_SETTINGS); khoá ops, locked, fixed là 400 PARAM_LOCKED;
//     khoá chưa nối vào bộ máy (registry wired:false) là 400 PARAM_NOT_WIRED ở Lưu, còn xem trước vẫn kiểm được và liệt kê ở notWired.
//   - Quyền theo editableBy của từng khoá: admin → config.payroll, accounting → config.legal (một lô trộn cần cả hai, thiếu một là 403 FORBIDDEN_CAP).
//   - Bật params_mode = active ở lần Lưu đầu: chỉ khi KHÔNG phải môi trường thật, hoặc PARAMS_ALLOW_ACTIVATE=1 (xem activationAllowed).
// Lỗi ném ra có `code` và `httpStatus` (server.js trả đúng như vậy); danh sách lỗi từng khoá nằm ở details.errors.
// Không publish sự kiện ở đây: server.js gọi events.publish SAU khi hàm trả (sau COMMIT) với `notice` của kết quả.
const crypto = require('node:crypto');
const store = require('../platform/db');
const audit = require('../platform/audit');
const authz = require('../platform/authz');
const config = require('../platform/config');
const Params = require('../engine/payroll-params');
const PayrollCalendar = require('../engine/payroll-calendar');
const registry = require('./registry');
const paramsStore = require('./store');
const configRev = require('./config-rev');
const service = require('../domain/payroll/payroll-service');
const { vnToday } = require('../platform/request-rules');
const Engine = require('../engine/payroll-engine');
const { isKeyWired } = require('./wired-flag');
const Attributes = require('./attributes');
const Positions = require('./positions');
const BlockDefs = require('./block-defs');
const { validateValue, crossChecks } = require('./validate');
const { warnIf, warn, optionalReason } = require('../platform/warnings');

const fail = (httpStatus?, code?, message?, details?) =>
  Object.assign(new Error(message), { code, httpStatus, ...(details ? { details } : {}) });
// Mã lỗi từng khoá → trạng thái HTTP (còn lại là 400)
const STATUS_OF = {
  FORBIDDEN_CAP: 403,
  ATTR_TYPE_LOCKED: 409,
  POSITION_CODE_CLASH: 409,
  BLOCK_CODE_CLASH: 409,
  SCHEDULE_EDIT_NOT_ALLOWED: 409,
  SHIFT_EDIT_NOT_ALLOWED: 409
};
// Mục giả cho khoá thuộc tính mở rộng của lớp (không có mục registry riêng): Admin sửa, không theo cờ wired (một thuộc tính chưa đổi tiền cho tới khi công thức dùng)
const ATTR_ENTRY = Object.freeze({
  id: 'class.level.attr',
  label: 'Thuộc tính của level',
  editableBy: 'admin',
  class: 'attribute'
});
// Mục giả cho khoá của chức vụ mới (position.def.<mã>, type.<mã>.*, level.<mã>.<bậc>.*): C&B sửa, kiểm theo luật của khoá mẫu cùng đuôi (src/params/positions.ts)
const POSITION_ENTRY = Object.freeze({ id: 'position', label: 'Chức vụ', editableBy: 'admin', class: 'position' });
// Mục giả cho khoá của khối phụ cấp thêm (block.def.<mã>, type.<chức vụ>.block.<mã>.<trường>): C&B sửa; cờ thuế, bảo hiểm chỉ Kế toán xác nhận (confirmBlock)
const BLOCK_ENTRY = Object.freeze({ id: 'block', label: 'Khối phụ cấp', editableBy: 'admin', class: 'block' });
const FLAG_FIELDS = ['tax', 'taxCap', 'insuranceBase'];
// Dấu xác nhận cờ của Kế toán chỉ còn khi khối KHÔNG đổi: mất khi đổi cờ (thuế, hạn mức, bảo hiểm) hoặc nhãn, cách tính, theo ngày đi làm, điều kiện mất; với khối miễn thuế toàn bộ
// còn mất khi đổi số tiền theo chức vụ. Mặc định an toàn.
const CONFIRM_FIELDS = [...FLAG_FIELDS, 'label', 'method', 'scalesWithDays', 'loss'];
const confirmationLost = (prev?, next?, moneyChanged?) =>
  CONFIRM_FIELDS.some(f => !same(prev[f] ?? null, next[f] ?? null)) || (next.tax === 'full' && moneyChanged);
const BLOCK_MONEY_ROW = /^type.[^.]+.block.([^.]+).(amount|pct|byLevel.[0-9]+)$/;
// Sửa lịch làm việc của chức vụ ở môi trường thật là một bước triển khai có chủ đích (như PARAMS_ALLOW_ACTIVATE):
// cần SCHEDULE_ALLOW_EDIT=1. Sandbox, máy phát triển và test được sửa tự do.
const scheduleEditAllowed = () =>
  process.env.SCHEDULE_ALLOW_EDIT === '1' ||
  !(process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === '1');
// Sửa giờ vào, ra của sáu ca có sẵn (shift.preset.<mã>.in | out): cùng cách mở như lịch làm việc (SHIFT_ALLOW_EDIT=1)
const SHIFT_KEY = /^shift\.preset\.[a-z0-9]+\.(in|out)$/;
const shiftEditAllowed = () =>
  process.env.SHIFT_ALLOW_EDIT === '1' || !(process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === '1');
// Khoá không thuộc nhóm lương (nhật ký mức normal); còn lại là mức pay vì đổi tiền của người
const NON_PAY_PREFIXES = ['system.', 'employeeCode.', 'contract.', 'catalog.', 'slip.', 'approval.', 'period.'];
const same = (a?, b?) => JSON.stringify(a) === JSON.stringify(b);
const nextMonthOf = (month?) => {
  const [y, m] = month.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
};
const nowIso = () => new Date(Date.now()).toISOString();

/* ---------- bật chế độ active ---------- */
// Môi trường thật (NODE_ENV=production hoặc COOKIE_SECURE=1) KHÔNG tự bật active ở lần Lưu đầu: bật là một bước triển khai
// có chủ đích. Ở đó phải đặt PARAMS_ALLOW_ACTIVATE=1 mới được.
// Sandbox, máy phát triển và test (không đặt hai biến trên) được tự bật.
const activationAllowed = () =>
  process.env.PARAMS_ALLOW_ACTIVATE === '1' ||
  !(process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === '1');

/* ---------- tháng hiệu lực ---------- */
// Tháng chưa chốt công sớm nhất kể từ tháng có kỳ lương sớm nhất: không dòng nào được có hiệu lực trước tháng này, nếu không bộ tham số của tháng đã chốt đổi.
// Chưa có kỳ nào thì không tháng nào bị khoá (lockedBefore trả rỗng) và tháng mặc định là tháng hiện tại.
// Đọc trạng thái kỳ trực tiếp (không qua assertPeriodOpen, vì hàm đó chỉ cảnh báo chứ không ném lỗi): khoá tham số từ 'attendance_locked' (SCOPE_LOCKED_FROM.params)
async function lockedBefore() {
  let month = await store.repos.periods.firstMonth();
  if (!month) return '';
  while ((await store.periods.get(month)).status !== 'open') month = nextMonthOf(month);
  return month;
}
const earliestOpenMonth = async () => (await lockedBefore()) || vnToday().slice(0, 7);
async function effectiveMonthOf(body?) {
  const month =
    body.effectiveMonth === undefined || body.effectiveMonth === null ? await earliestOpenMonth() : body.effectiveMonth;
  const floor = await lockedBefore();
  if (!PayrollCalendar.isValidMonth(month)) throw fail(400, 'BAD_MONTH', 'effectiveMonth phải có dạng YYYY-MM');
  // Đặt hiệu lực cho tháng đã chốt được, cảnh báo tháng đó cần tính lại
  warnIf('PERIOD_LOCKED', month < floor, {
    message: `Tháng ${month} đã chốt công: tham số mới có hiệu lực từ tháng đó làm số đã tính của các kỳ từ ${month} lệch cài đặt, cần tính lại (kỳ đã duyệt giữ số cũ).`
  });
  await store.assertPeriodOpen(month, 'params'); // tháng sau tháng đã khoá nhưng chính nó đã khoá (hiếm): cùng một lỗi như mọi route ghi
  return month;
}

/* ---------- kiểm một lô ---------- */
// Trả { month, resolved, items, skipped, notWired, errors, warnings }. items: các thay đổi hợp lệ và thật sự đổi giá trị.
// options.serverBatch: lô do máy chủ dựng (sao chép chức vụ) có trần riêng system.positions.maxCopyKeys; yêu cầu HTTP không bao giờ đặt được cờ này
// options.copyBatch: lô sao chép chức vụ (addPosition): chép nguyên giá trị của chức vụ nguồn, kể cả khoá chưa nối (type.<mã>.probationPayPct) mà Lưu thường từ chối; yêu cầu HTTP cũng không đặt được cờ này
async function inspect(me, body, { forSave, serverBatch = false, copyBatch = false, confirm = null }: any) {
  if (!body || !Array.isArray(body.changes) || !body.changes.length)
    throw fail(400, 'PARAM_NO_CHANGES', 'Chưa có thay đổi nào để lưu');
  const month = await effectiveMonthOf(body);
  const resolved = await paramsStore.resolve(month);
  const maxChanges = resolved.params[serverBatch ? 'system.positions.maxCopyKeys' : 'system.params.maxChanges'];
  if (body.changes.length > maxChanges)
    throw fail(400, 'PARAM_BATCH_TOO_LARGE', `Một lần lưu tối đa ${maxChanges} thay đổi`, { maxChanges });
  const errors: any[] = [],
    warnings: any[] = [],
    items: any[] = [],
    skipped: any[] = [],
    notWired: any[] = [];
  const seen = new Set<any>();
  const err = (code?, key?, message?, extra?) => errors.push({ code, key, message, ...extra });
  // Định nghĩa thuộc tính kiểm trước giá trị của nó: một lô có thể vừa tạo cột vừa điền ô (kiểm theo định nghĩa của lô)
  const batchDefs = new Map<any, any>();
  // Giá trị thô của cả lô: khoá chức vụ mới kiểm theo khoá gốc cùng lô (src/params/positions.ts), theo thứ tự nào trong lô cũng vậy
  const batchDraft: Record<string, any> = {};
  for (const c of body.changes) if (c && typeof c.key === 'string' && 'value' in c) batchDraft[c.key] = c.value;
  const batchPositions = new Set<any>(); // chức vụ định nghĩa trong cùng lô: khoá của chức vụ đó được kiểm theo định nghĩa của lô
  const batchBlocks = new Set<any>(); // khối định nghĩa trong cùng lô
  // khối có số tiền theo chức vụ đổi trong lô này (làm mất xác nhận cờ của khối miễn thuế toàn bộ)
  const moneyChanged = new Set<any>();
  for (const c of body.changes) {
    const m = c && typeof c.key === 'string' ? BLOCK_MONEY_ROW.exec(c.key) : null;
    if (m && !same(resolved.params[c.key], c.value)) moneyChanged.add(m[1]);
  }
  const isDef = (c?) =>
    c &&
    typeof c.key === 'string' &&
    (Attributes.classify(c.key)?.kind === 'def' ||
      Positions.classify(c.key)?.kind === 'def' ||
      BlockDefs.classify(c.key)?.kind === 'def');
  const ordered = [...body.changes.filter(isDef), ...body.changes.filter(c => !isDef(c))];
  for (const change of ordered) {
    const key = change && typeof change.key === 'string' ? change.key : null;
    if (!key || !('value' in change)) {
      err('PARAM_INVALID_VALUE', key, 'Mỗi thay đổi cần key và value');
      continue;
    }
    if (seen.has(key)) {
      err('PARAM_DUPLICATE_KEY', key, `Khoá ${key} xuất hiện hai lần trong một lần lưu`);
      continue;
    }
    seen.add(key);
    const block = BlockDefs.classify(key);
    if (block) {
      // Thêm khối và giá trị theo chức vụ là việc của C&B (config.payroll); xác nhận cờ thuế, bảo hiểm chỉ qua confirmBlock (config.legal)
      const cap = confirm ? 'config.legal' : registry.WRITE_CAP.admin;
      if (!(await authz.can(me, cap))) {
        err('FORBIDDEN_CAP', key, `Cần quyền ${cap} để sửa khối phụ cấp`, { cap });
        continue;
      }
      // Không tin client: dấu xác nhận của Kế toán do máy chủ đặt (bỏ mọi giá trị client gửi), gắn lại SAU khi đã kiểm và chuẩn hoá.
      let value = change.value;
      if (block.kind === 'def' && value && typeof value === 'object' && !Array.isArray(value)) {
        const { flagsConfirmedBy, flagsConfirmedAt, ...rest } = value;
        value = rest;
      }
      const checked = validateValue(key, value, {
        params: resolved.params,
        positions: batchPositions,
        blocks: batchBlocks
      });
      if (!checked.ok) {
        err(checked.code, key, checked.message);
        continue;
      }
      if (block.kind === 'def') {
        const prev = resolved.params[key];
        if (confirm) checked.value = { ...checked.value, flagsConfirmedBy: confirm.by, flagsConfirmedAt: confirm.at };
        else if (prev && prev.flagsConfirmedBy && !confirmationLost(prev, checked.value, moneyChanged.has(block.code)))
          checked.value = {
            ...checked.value,
            flagsConfirmedBy: prev.flagsConfirmedBy,
            flagsConfirmedAt: prev.flagsConfirmedAt
          };
      }
      if (block.kind === 'def') batchBlocks.add(block.code);
      const before = resolved.params[key];
      if (same(before, checked.value)) {
        skipped.push({ key, reason: 'UNCHANGED' });
        continue;
      }
      items.push({ key, entry: BLOCK_ENTRY, value: checked.value, before, warnings: [], wired: true });
      continue;
    }
    const position = Positions.classify(key);
    if (position) {
      if (!(await authz.can(me, registry.WRITE_CAP.admin))) {
        err('FORBIDDEN_CAP', key, `Cần quyền ${registry.WRITE_CAP.admin} để sửa chức vụ`, {
          cap: registry.WRITE_CAP.admin
        });
        continue;
      }
      const checked = validateValue(key, change.value, {
        params: resolved.params,
        positions: batchPositions,
        blocks: batchBlocks,
        draft: batchDraft
      });
      if (!checked.ok) {
        err(checked.code, key, checked.message);
        continue;
      }
      if (position.kind === 'def') batchPositions.add(position.code);
      if (position.kind === 'schedule' && !batchPositions.has(position.code) && !scheduleEditAllowed()) {
        err(
          'SCHEDULE_EDIT_NOT_ALLOWED',
          key,
          'Sửa lịch làm việc của chức vụ chưa được mở ở môi trường này (cần SCHEDULE_ALLOW_EDIT)'
        );
        continue;
      }
      // Khoá type.<mã>.* của chức vụ thêm sau đi theo cờ wired của MỤC MẪU (type.<type>.…) như chức vụ mặc định (ví dụ probationPayPct chưa nối: 400 PARAM_NOT_WIRED);
      // lô sao chép chức vụ (copyBatch) vẫn chép nguyên giá trị nguồn
      const template =
        position.kind === 'type'
          ? Positions.translate(key, {
              params: resolved.params,
              positions: batchPositions,
              blocks: batchBlocks,
              draft: batchDraft
            })
          : null;
      const templateEntry = template && template.templateKey ? registry.entryFor(template.templateKey) : null;
      if (templateEntry && !isKeyWired(templateEntry.entry, template.templateKey)) {
        if (forSave && !copyBatch) {
          err('PARAM_NOT_WIRED', key, `${templateEntry.entry.label} chưa nối vào bộ máy; lưu sẽ không có tác dụng`);
          continue;
        }
        notWired.push(key); // xem trước vẫn kiểm giá trị nhưng không tính tác động
      }
      for (const w of checked.warnings || [])
        warnings.push({ ...w, ack: `${w.code}:${key}`, label: POSITION_ENTRY.label });
      const before = resolved.params[key];
      if (same(before, checked.value)) {
        skipped.push({ key, reason: 'UNCHANGED' });
        continue;
      }
      items.push({
        key,
        entry: POSITION_ENTRY,
        value: checked.value,
        before,
        warnings: checked.warnings || [],
        wired: !notWired.includes(key)
      });
      continue;
    }
    const attr = Attributes.classify(key);
    if (attr) {
      if (!authz.can(me, registry.WRITE_CAP.admin)) {
        err('FORBIDDEN_CAP', key, `Cần quyền ${registry.WRITE_CAP.admin} để sửa thuộc tính của level`, {
          cap: registry.WRITE_CAP.admin
        });
        continue;
      }
      const checked = validateValue(key, change.value, {
        params: resolved.params,
        defs: batchDefs
      });
      if (!checked.ok) {
        err(checked.code, key, checked.message);
        continue;
      }
      if (attr.kind === 'def') batchDefs.set(attr.code, { ...checked.value, code: attr.code });
      const before = resolved.params[key];
      if (same(before, checked.value)) {
        skipped.push({ key, reason: 'UNCHANGED' });
        continue;
      }
      items.push({ key, entry: ATTR_ENTRY, value: checked.value, before, warnings: [], wired: true, attribute: attr }); // wired: vào bộ tham số nháp của xem trước; bản thân thuộc tính không đổi tiền
      continue;
    }
    const hit = registry.entryFor(key);
    if (!hit || !Object.hasOwn(Params.DEFAULTS, key)) {
      err('PARAM_UNKNOWN_KEY', key, `Không có tham số "${key.slice(0, config.REASON_MAX)}"`);
      continue;
    }
    const entry = hit.entry;
    if (entry.backing) {
      err(
        'PARAM_BACKED_BY_SETTINGS',
        key,
        `${entry.label} không lưu ở đây; hãy sửa ở mục "${entry.backingSectionLabel || entry.backing}"`,
        { section: entry.backingSection || null }
      );
      continue;
    }
    const capability = registry.WRITE_CAP[entry.editableBy];
    if (!capability || entry.class === 'fixed' || entry.class === 'removed') {
      const why = entry.class === 'formula' && entry.lockReason ? `: ${entry.lockReason}` : ''; // công thức bị khoá: nêu lý do
      err('PARAM_LOCKED', key, `${entry.label} không sửa được trên màn hình${why}`);
      continue;
    }
    if (!(await authz.can(me, capability))) {
      err('FORBIDDEN_CAP', key, `Cần quyền ${capability} để sửa ${entry.label}`, { cap: capability });
      continue;
    }
    // Giờ ca ở môi trường thật là một bước triển khai có chủ đích (SHIFT_ALLOW_EDIT=1), như SCHEDULE_ALLOW_EDIT; xem trước vẫn kiểm được
    if (SHIFT_KEY.test(key) && forSave && !shiftEditAllowed()) {
      err('SHIFT_EDIT_NOT_ALLOWED', key, 'Sửa giờ ca chưa được mở ở môi trường này (cần SHIFT_ALLOW_EDIT)');
      continue;
    }
    if (!isKeyWired(entry, key)) {
      if (forSave && !copyBatch) {
        err('PARAM_NOT_WIRED', key, `${entry.label} chưa nối vào bộ máy; lưu sẽ không có tác dụng`);
        continue;
      }
      notWired.push(key); // xem trước vẫn kiểm giá trị bên dưới nhưng không tính tác động
    }
    const checked = validateValue(key, change.value, {
      params: resolved.params,
      defs: batchDefs,
      draft: batchDraft
    });
    if (!checked.ok) {
      if (checked.errors)
        for (const e of checked.errors) err(e.code, key, e.message, e.path ? { path: e.path } : undefined);
      else err(checked.code, key, checked.message);
      continue;
    }
    for (const w of checked.warnings) warnings.push({ ...w, ack: `${w.code}:${key}`, label: entry.label });
    const before = resolved.params[key];
    if (same(before, checked.value)) {
      skipped.push({ key, reason: 'UNCHANGED' });
      continue;
    }
    items.push({
      key,
      entry,
      value: checked.value,
      before,
      warnings: checked.warnings,
      wired: !notWired.includes(key)
    });
  }
  // Lô chỉ đổi số tiền của khối miễn thuế toàn bộ đã xác nhận: thêm dòng định nghĩa bỏ dấu xác nhận (cùng lô, cùng lý do, có nhật ký)
  if (!errors.length && !confirm)
    for (const code of moneyChanged) {
      const defKey = `block.def.${code}`;
      const def = resolved.params[defKey];
      if (def && def.flagsConfirmedBy && def.tax === 'full' && !seen.has(defKey)) {
        const { flagsConfirmedBy, flagsConfirmedAt, ...cleared } = def;
        items.push({ key: defKey, entry: BLOCK_ENTRY, value: cleared, before: def, warnings: [], wired: true });
      }
    }
  // Kiểm liên trường trên bộ tham số SAU khi áp, chỉ báo lỗi MỚI (lỗi đã có từ trước không chặn lần lưu khác)
  if (!errors.length && items.length) {
    const drafts = items.map(i => ({ key: i.key, value: i.value, effectiveMonth: month }));
    const after = (await paramsStore.resolve(month, { drafts, active: true })).params;
    const old = new Set<any>(
      [...crossChecks(resolved.params), ...Positions.scheduleErrors(resolved.params)].map(e => `${e.key}|${e.message}`)
    );
    const scheduleTouched = items.some(i => /.dows$/.test(i.key));
    // Kiểm chéo chỉ cảnh báo; bộ máy không vỡ vì tham số lạ: lỗi tính của một người thành phiếu lỗi (status error), không thành 0 ₫
    for (const e of [...crossChecks(after), ...(scheduleTouched ? Positions.scheduleErrors(after) : [])])
      if (!old.has(`${e.key}|${e.message}`)) {
        const consequence =
          'Giá trị vẫn được lưu; phiếu lương của người bị ảnh hưởng có thể báo lỗi (phiếu lỗi, không phải 0 ₫) hoặc tính sai cho tới khi sửa lại.';
        warnIf('PARAM_CROSS_CHECK_FAILED', true, { message: e.message, consequence, details: { key: e.key } });
        warnings.push({
          code: e.code,
          key: e.key,
          message: `${e.message}. ${consequence}`,
          ack: `${e.code}:${e.key}`
        });
      }
    // thuộc tính mở rộng: trần số lượng mỗi lớp
    if (items.some(i => i.attribute)) {
      const max = after['system.attr.maxPerClass'];
      if (Params.attributeDefs(after).length > max)
        err('ATTR_TOO_MANY', 'class.level.attr', `Mỗi lớp có tối đa ${max} thuộc tính tuỳ chỉnh`, { max });
    }
  }
  if (forSave && !errors.length && !items.length)
    throw fail(400, 'PARAM_NO_CHANGES', 'Các giá trị gửi lên đều bằng giá trị đang dùng, không có gì để lưu', {
      skipped
    });
  return { month, resolved, items, skipped, notWired, errors, warnings };
}
const httpStatusOf = (errors?) => STATUS_OF[errors[0].code] || 400;

/* ---------- xem trước tác động ---------- */
const amountsOf = (net?) => ({
  gross: net.gross,
  insurance: net.insurance,
  tax: net.tax,
  advance: net.advance,
  net: net.net
});
const sumOf = (list?) =>
  list.reduce(
    (t, n) => ({
      gross: t.gross + n.gross,
      insurance: t.insurance + n.insurance,
      tax: t.tax + n.tax,
      advance: t.advance + n.advance,
      net: t.net + n.net
    }),
    { gross: 0, insurance: 0, tax: 0, advance: 0, net: 0 }
  );
// scope: { positions } khi thay đổi dành riêng cho chức vụ (đã kiểm mã). Thêm vào kết quả: ripple, companyCost, decreased, belowMinWage, scope
async function impactOf(month?, beforeParams?, afterParams?, maxPeople?, { scope }: any = {}) {
  // Đầu vào nạp theo từng bộ tham số: quy tắc KPI (và mọi thứ dựng từ params) của "sau" theo bản nháp, không theo bộ hiện hành
  const inputsBefore = await service.loadInputs(month, { params: beforeParams });
  const inputsAfter = await service.loadInputs(month, { params: afterParams });
  const inputs = inputsBefore;
  const people: any[] = [],
    errors: any[] = [];
  const before: any[] = [],
    after: any[] = [];
  const both: any[] = []; // người tính được cả hai phía: dữ liệu cho ripple, chi phí công ty, người giảm, dưới lương tối thiểu
  for (const [username, person] of inputs.people) {
    const run = (params?, side?, loaded?) => {
      try {
        // hồ sơ của đúng bộ đầu vào (người cột NULL đóng bảo hiểm theo insurance.coverage của chính bộ tham số này)
        return service.computeFor(month, (loaded.people.get(username) || person).staff, loaded, params, { upTo: null })
          .m;
      } catch (e) {
        errors.push({ username, side, code: typeof e.code === 'string' ? e.code : 'CALC_ERROR' });
        return null;
      }
    };
    const wasM = run(beforeParams, 'before', inputsBefore),
      nowM = run(afterParams, 'after', inputsAfter);
    const was = wasM && amountsOf(wasM.net),
      now = nowM && amountsOf(nowM.net);
    if (was) before.push(was);
    if (now) after.push(now);
    if (was && now) both.push({ username, person: inputsAfter.people.get(username) || person, wasM, nowM });
    if (was && now && (was.net !== now.net || was.gross !== now.gross))
      people.push({
        username,
        name: person.staff.name,
        type: person.staff.type,
        before: { gross: was.gross, net: was.net },
        after: { gross: now.gross, net: now.net },
        diff: { gross: now.gross - was.gross, net: now.net - was.net }
      });
  }
  people.sort((a: any, b: any) => Math.abs(b.diff.net) - Math.abs(a.diff.net) || a.username.localeCompare(b.username));
  const totalBefore = sumOf(before),
    totalAfter = sumOf(after);
  const { changedPeople, ...extra } = extrasOf(both, beforeParams, afterParams, people, scope, maxPeople);
  return {
    month,
    people: people.slice(0, maxPeople), // totals bên dưới luôn tính cả người bị cắt
    ...extra,
    totals: {
      people: inputs.people.size,
      affected: people.length,
      truncated: people.length > maxPeople,
      before: totalBefore,
      after: totalAfter,
      delta: { gross: totalAfter.gross - totalBefore.gross, net: totalAfter.net - totalBefore.net }
    },
    errors,
    changedPeople // đầy đủ, chỉ để chạy luật gợi ý (preview() gỡ trước khi trả)
  };
}
/* ---------- phần thêm của xem trước: chỉ cộng thêm trường, không đổi trường cũ ---------- */
const sumBy = (rows?, pick?) => rows.reduce((total, row) => total + pick(row), 0);
const changeOf = (was?, now?) => ({ before: was, after: now, delta: now - was });
function extrasOf(both?, beforeParams?, afterParams?, changedPeople?, scope?, maxPeople?) {
  // ripple: chênh theo từng thành phần ① đến ⑧ (tổng và theo người) cùng tổng thu nhập và thực lĩnh
  const parts = both.map(row => ({ ...row, was: service.thanhPhanOf(row.wasM), now: service.thanhPhanOf(row.nowM) }));
  const ripplePeople = parts
    .map(row => ({
      username: row.username,
      name: row.person.staff.name,
      type: row.person.staff.type,
      delta: {
        ...Object.fromEntries(service.COMPONENTS.map(c => [c.key, row.now[c.key] - row.was[c.key]])),
        gross: row.nowM.net.gross - row.wasM.net.gross,
        net: row.nowM.net.net - row.wasM.net.net
      }
    }))
    .filter(row => Object.values<any>(row.delta).some(v => v !== 0))
    .sort((a: any, b: any) => Math.abs(b.delta.net) - Math.abs(a.delta.net) || a.username.localeCompare(b.username));
  const ripple = {
    components: service.COMPONENTS.map(c => ({
      id: c.id,
      key: c.key,
      label: c.label,
      ...changeOf(
        sumBy(parts, r => r.was[c.key]),
        sumBy(parts, r => r.now[c.key])
      )
    })),
    gross: changeOf(
      sumBy(both, r => r.wasM.net.gross),
      sumBy(both, r => r.nowM.net.gross)
    ),
    net: changeOf(
      sumBy(both, r => r.wasM.net.net),
      sumBy(both, r => r.nowM.net.net)
    ),
    people: ripplePeople.slice(0, maxPeople),
    truncated: ripplePeople.length > maxPeople
  };
  // chi phí công ty = tổng thu nhập + bảo hiểm công ty đóng (tỷ lệ là tham số; phần bảo hiểm tai nạn lao động cần kế toán xác nhận)
  const cost = (m?) => m.net.gross + m.net.employer;
  const companyCost = changeOf(
    sumBy(both, r => cost(r.wasM)),
    sumBy(both, r => cost(r.nowM))
  );
  // decreased: người BỊ GIẢM thực lĩnh (decrease là mức giảm, dương)
  const down = changedPeople.filter(p => p.diff.net < 0);
  const decreased = {
    count: down.length,
    people: down
      .map(p => ({
        username: p.username,
        name: p.name,
        type: p.type,
        before: p.before.net,
        after: p.after.net,
        diff: p.diff.net,
        decrease: -p.diff.net
      }))
      .sort((a: any, b: any) => b.decrease - a.decrease || a.username.localeCompare(b.username))
      .slice(0, maxPeople),
    truncated: down.length > maxPeople
  };
  // belowMinWage: người đóng bảo hiểm mà lương cơ bản (sau thay đổi) thấp hơn lương tối thiểu vùng; cảnh báo, không chặn. wasBelow: đã thấp từ trước
  const minOf = (params?) => params[`law.regionMinWage.${params['law.region']}`];
  const kernelNow = Engine.kernelFor(afterParams),
    kernelWas = Engine.kernelFor(beforeParams);
  const minWage = minOf(afterParams);
  const belowList = both
    .map(row => ({
      row,
      base: kernelNow.levelOf(row.person.staff).base,
      wasBase: kernelWas.levelOf(row.person.staff).base,
      insured: kernelNow.baoHiemOf(row.person.staff, row.nowM).insured
    }))
    .filter(x => x.insured && Number.isFinite(minWage) && x.base < minWage)
    .map(x => ({
      username: x.row.username,
      name: x.row.person.staff.name,
      type: x.row.person.staff.type,
      level: x.row.person.staff.level,
      base: x.base,
      minWage,
      wasBelow: x.wasBase < minOf(beforeParams)
    }));
  const belowMinWage = {
    count: belowList.length,
    minWage,
    region: afterParams['law.region'],
    people: belowList.slice(0, maxPeople)
  };
  const out: Record<string, any> = { ripple, companyCost, decreased, belowMinWage, changedPeople };
  if (scope) {
    const inside = both.filter(r => scope.positions.includes(r.person.staff.type));
    const outsideChanged = changedPeople.filter(p => !scope.positions.includes(p.type));
    out.scope = {
      positions: scope.positions,
      inside: inside.length,
      outside: both.length - inside.length,
      insideAffected: changedPeople.length - outsideChanged.length,
      outsideAffected: outsideChanged.length,
      leak: outsideChanged.length > 0,
      outsidePeople: outsideChanged
        .slice(0, maxPeople)
        .map(p => ({ username: p.username, name: p.name, type: p.type, diff: p.diff.net }))
    };
  }
  return out;
}
// scope của yêu cầu: { position } hoặc { positions }; trả { positions } đã kiểm mã với bảng chức vụ, hoặc ném 400
function scopeOf(body?, params?) {
  const raw = body && body.scope;
  if (raw === undefined || raw === null) return null;
  const list =
    raw && Array.isArray(raw.positions) ? raw.positions : raw && raw.position !== undefined ? [raw.position] : [];
  const known = Positions.codesOf(params);
  if (!list.length || list.some(code => typeof code !== 'string' || !known.includes(code)))
    throw fail(400, 'POSITION_UNKNOWN', 'Chức vụ trong phạm vi xem trước không có trong bảng chức vụ');
  return { positions: [...new Set<any>(list)] };
}
async function preview(me?, body?) {
  // Trả lương từng người: cần xem toàn bộ phiếu lương VÀ quyền xem lương
  for (const cap of ['payroll.view', 'salary.read'])
    if ((await authz.scopeOf(me, cap)) !== 'all')
      throw fail(403, 'FORBIDDEN_CAP', `Xem trước tác động cần quyền ${cap} ở phạm vi toàn bộ`, { cap });
  let seen;
  try {
    seen = await inspect(me, body, { forSave: false });
  } catch (e) {
    if (!e.code || !e.httpStatus) throw e;
    // Luôn 200: lỗi đầu vào nằm trong errors (cùng mã như PUT)
    return {
      ok: false,
      month: null,
      errors: [{ code: e.code, message: e.message, ...e.details }],
      warnings: [],
      skipped: [],
      notWired: [],
      impact: null
    };
  }
  const { month, resolved, items, skipped, notWired, errors, warnings } = seen;
  const out: Record<string, any> = {
    ok: errors.length === 0,
    month,
    errors,
    warnings,
    skipped,
    notWired,
    impact: null,
    info: []
  };
  // Mọi thay đổi hợp lệ (kể cả định nghĩa và giá trị thuộc tính, vì công thức trong cùng lô có thể dùng chúng) vào bộ tham số nháp
  const counted = items.filter(i => i.wired);
  if (!out.ok || !counted.length) return out;
  const drafts = counted.map(i => ({ key: i.key, value: i.value, effectiveMonth: month }));
  const after = await paramsStore.resolve(month, { drafts, active: true });
  let scope;
  try {
    scope = scopeOf(body, after.params);
  } catch (e) {
    return { ...out, ok: false, errors: [{ code: e.code, message: e.message }] };
  }
  const { changedPeople, ...impact }: any = await impactOf(
    month,
    resolved.params,
    after.params,
    resolved.params['system.params.previewMaxPeople'],
    { scope }
  );
  out.impact = impact;
  if (impact.scope && impact.scope.leak)
    out.info.push({
      code: 'SCOPE_LEAK',
      message: `Thay đổi dành cho chức vụ ${impact.scope.positions.join(', ')} nhưng làm đổi tiền của ${impact.scope.outsideAffected} người ở chức vụ khác.`
    });
  // Chỉ đếm, không ghi tên hay số tiền ra nhật ký chạy (như ai-review)
  console.log(
    `[params-preview] month=${month} keys=${counted.length} people=${out.impact.totals.people} affected=${out.impact.totals.affected} errors=${out.impact.errors.length}`
  );
  return out;
}

/* ---------- ghi ---------- */
// Lý do thay đổi không bắt buộc (quá dài là lỗi). Cột param_versions.reason có CHECK 10–300 nên chỗ ghi dùng store.padReason('' → câu mặc định)
function needReason(body?) {
  const bad = () => fail(400, 'REASON_REQUIRED', `Lý do thay đổi tối đa ${config.REASON_MAX} ký tự`);
  return optionalReason(body.reason, { tooLong: bad });
}
async function save(me?, actx?, body?, options: any = {}) {
  if (!body || typeof body !== 'object') throw fail(400, 'PARAM_NO_CHANGES', 'Chưa có thay đổi nào để lưu');
  const reason = store.padReason(needReason(body));
  if ((await store.params.getMode()) !== 'active' && !activationAllowed())
    throw fail(
      409,
      'PARAMS_DEFAULTS_ONLY',
      'Cấu hình đang ở chế độ chỉ dùng mặc định; trên môi trường thật, bật chế độ áp dụng là một bước triển khai riêng (PARAMS_ALLOW_ACTIVATE) sau khi chủ dự án duyệt'
    );
  const { month, items, skipped, errors, warnings } = await inspect(me, body, {
    forSave: true,
    serverBatch: !!options.serverBatch,
    copyBatch: !!options.copyBatch,
    confirm: options.confirm || null
  });
  if (errors.length) throw fail(httpStatusOf(errors), errors[0].code, errors[0].message, { errors, warnings });
  const basis = typeof body.basis === 'string' ? body.basis.trim() : '';
  if (basis.length > config.REASON_MAX) throw fail(400, 'BASIS_TOO_LONG', `Căn cứ tối đa ${config.REASON_MAX} ký tự`);
  if (!Number.isSafeInteger(body.expectedRev) || body.expectedRev < 0)
    throw fail(
      400,
      'PARAM_REV_REQUIRED',
      'Thiếu số phiên bản cấu hình bạn đang xem (expectedRev); tải lại màn Cài đặt rồi lưu lại'
    );
  // Cảnh báo sàn chính sách không cần xác nhận từng cái; cảnh báo vẫn trả về và vào nhật ký (after.warnings)
  for (const w of warnings) warn(w.code, w.message, { details: { key: w.key } });
  const at = nowIso();
  return await store.transaction(async () => {
    // Kiểm lại trong giao dịch (không có await giữa kiểm và ghi): chỉ một người thắng khi hai yêu cầu tới cùng lúc
    const current = await paramsStore.resolve(month);
    if (current.rev !== body.expectedRev)
      throw fail(409, 'PARAMS_STALE', 'Có người vừa lưu cấu hình; hãy tải lại màn Cài đặt rồi làm lại', {
        paramsRev: current.rev,
        expectedRev: body.expectedRev
      });
    const modeBefore = await store.params.getMode();
    const batchId = crypto.randomUUID(); // một mã cho cả lô: hoàn tác theo lô, đối chiếu nhật ký
    const saved: any[] = [],
      later: any[] = [];
    for (const item of items) {
      const ackTokens = item.warnings.map(w => `${w.code}:${item.key}`);
      const ack = ackTokens.length ? JSON.stringify({ codes: ackTokens, by: me.username, at }) : null;
      const prev = current.applied.find(r => r.key === item.key);
      const version = await store.repos.params.insert({
        key: item.key,
        effective_month: month,
        value_json: JSON.stringify(item.value),
        reason,
        basis: basis || null,
        ack_json: ack,
        created_by: me.username,
        created_at: at,
        batch_id: batchId
      });
      saved.push({
        key: item.key,
        value: item.value,
        version,
        effectiveMonth: month,
        previous: { value: item.before, version: prev ? prev.id : 0 }
      });
      for (const row of await store.params.history({ key: item.key, limit: config.AUDIT_PAGE_MAX }))
        if (row.id !== version && row.effectiveMonth > month) {
          later.push({ code: 'PARAM_LATER_VERSION_EXISTS', key: item.key, laterEffectiveMonth: row.effectiveMonth });
          break;
        }
      await audit.write(actx, {
        action: 'param.set',
        entityKind: 'param',
        entityId: item.key,
        month,
        before: { value: item.before, version: prev ? prev.id : 0 },
        after: { value: item.value, effectiveMonth: month, version, acknowledged: ackTokens },
        reason,
        sensitivity: NON_PAY_PREFIXES.some(p => item.key.startsWith(p)) ? 'normal' : 'pay'
      });
    }
    // Lần ghi đầu tiên: bật chế độ active (từ đây các dòng có hiệu lực); nhật ký riêng
    if (modeBefore !== 'active') {
      await store.setSetting('params_mode', 'active');
      await audit.write(actx, {
        action: 'param.mode',
        entityKind: 'setting',
        entityId: 'params_mode',
        before: { mode: modeBefore },
        after: { mode: 'active' },
        reason
      });
    }
    const rev = await configRev.bump();
    const next = await paramsStore.resolve(month);
    return {
      ok: true,
      month,
      fromMonth: month,
      mode: 'active',
      paramsRev: next.rev,
      paramsHash: next.hash,
      configRev: rev,
      batchId,
      saved,
      skipped,
      warnings: later,
      instances: saved.map(s => ({
        key: s.key,
        value: s.value,
        default: Params.DEFAULTS[s.key],
        status: 'custom',
        effectiveMonth: s.effectiveMonth,
        version: s.version,
        reason,
        createdBy: me.username,
        createdAt: at,
        changedBy: me.username,
        changedAt: at
      })),
      // dữ liệu cho sự kiện params.changed (server.js publish sau khi giao dịch xong); không giá trị, không lý do
      notice: {
        configRev: rev,
        paramsRev: next.rev,
        paramsHash: next.hash,
        fromMonth: month,
        keys: saved.map(s => s.key),
        by: me.username
      }
    };
  });
}

// Hoàn tác = thêm dòng mới mang giá trị của phiên bản cũ (toVersion 0 là giá trị mặc định); không xoá, không sửa dòng nào
async function revert(me?, actx?, body?) {
  if (!body || typeof body.key !== 'string') throw fail(400, 'PARAM_UNKNOWN_KEY', 'Cần key của tham số cần hoàn tác');
  if (!Number.isSafeInteger(body.toVersion) || body.toVersion < 0)
    throw fail(400, 'PARAM_VERSION_NOT_FOUND', 'Cần toVersion là số phiên bản (0 = giá trị mặc định)');
  // Khoá do người dùng gửi: chỉ khoá có thật (mặc định hoặc thuộc tính mở rộng của lớp), tra bằng own-property TRƯỚC khi đọc giá trị
  // (constructor, toString… không được rơi vào Object.prototype)
  const known =
    Object.hasOwn(Params.DEFAULTS, body.key) ||
    !!Attributes.classify(body.key) ||
    !!Positions.classify(body.key) ||
    !!BlockDefs.classify(body.key);
  if (!known) throw fail(404, 'PARAM_UNKNOWN_KEY', 'Khoá này không có trong hệ thống');
  let value;
  if (body.toVersion === 0) {
    if (!Object.hasOwn(Params.DEFAULTS, body.key))
      throw fail(404, 'PARAM_VERSION_NOT_FOUND', 'Khoá này không có giá trị mặc định để quay về');
    value = JSON.parse(JSON.stringify(Params.DEFAULTS[body.key]));
  } else {
    const row = (await store.params.history({ key: body.key, limit: config.AUDIT_PAGE_MAX })).find(
      r => r.id === body.toVersion
    );
    if (!row) throw fail(404, 'PARAM_VERSION_NOT_FOUND', `Không có phiên bản ${body.toVersion} của khoá này`);
    value = row.value;
  }
  return await save(me, actx, { ...body, changes: [{ key: body.key, value }] });
}

/* ---------- thêm chức vụ bằng sao chép ---------- */
// POST /api/positions { label, copyFrom, effectiveMonth?, reason, short?, acknowledge? }: máy chủ sinh mã từ nhãn (trùng là 409 POSITION_CODE_CLASH),
// dựng MỘT lô gồm định nghĩa và mọi khoá type.<nguồn>.*, level.<nguồn>.* rồi gọi cùng save() (một giao dịch, tháng áp dụng, lý do, nhật ký, hoàn tác).
async function addPosition(me?, actx?, body?) {
  if (!body || typeof body !== 'object') throw fail(400, 'POSITION_BAD_BODY', 'Thiếu thông tin chức vụ');
  if (!(await authz.can(me, registry.WRITE_CAP.admin)))
    throw fail(403, 'FORBIDDEN_CAP', `Cần quyền ${registry.WRITE_CAP.admin} để thêm chức vụ`, {
      cap: registry.WRITE_CAP.admin
    });
  const label = typeof body.label === 'string' ? body.label.trim() : '';
  if (!label) throw fail(400, 'PARAM_INVALID_VALUE', 'Cần nhập tên chức vụ');
  needReason(body);
  const month = await effectiveMonthOf(body);
  const resolved = await paramsStore.resolve(month);
  const set = resolved.params;
  const codes = Positions.codesOf(set);
  if (typeof body.copyFrom !== 'string' || !codes.includes(body.copyFrom))
    throw fail(400, 'POSITION_UNKNOWN', 'Chọn một chức vụ có sẵn để sao chép');
  const code = Positions.codeFromLabel(label);
  if (!code || Positions.isReservedCode(code))
    throw fail(400, 'PARAM_INVALID_VALUE', 'Tên chức vụ cần có ít nhất hai chữ cái hoặc số, bắt đầu bằng chữ');
  if (codes.includes(code) || Object.hasOwn(set, `position.def.${code}`))
    throw fail(409, 'POSITION_CODE_CLASH', `Đã có chức vụ trùng mã "${code}"; hãy đặt tên khác`, {
      positionCode: code
    });
  if (codes.length >= set['system.positions.max'])
    throw fail(409, 'POSITION_LIMIT', `Chỉ tạo được tối đa ${set['system.positions.max']} chức vụ`, {
      max: set['system.positions.max']
    });
  const def = { label, copiedFrom: body.copyFrom, ...(body.short === undefined ? {} : { short: body.short }) };
  const changes = Positions.copyChanges(set, body.copyFrom, code, def);
  const saved = await save(
    me,
    actx,
    {
      changes,
      effectiveMonth: month,
      reason: body.reason,
      basis: body.basis,
      acknowledge: body.acknowledge,
      expectedRev: resolved.rev
    },
    { serverBatch: true, copyBatch: true }
  );
  return { ...saved, position: { code, label, copiedFrom: body.copyFrom, effectiveMonth: month } };
}

// POST /api/positions/:mã/levels { name, base, kpi?, effectiveMonth?, reason, acknowledge? }: thêm bậc kế tiếp cho một chức vụ (cả ba chức vụ mặc định).
// Dựng MỘT lô level.<mã>.<n+1>.{name,base[,kpi]} rồi gọi cùng save() (tháng áp dụng, lý do, nhật ký, khoá kỳ, hoàn tác). Bậc không xoá được.
const LATEST_MONTH = '9999-12'; // tháng đủ xa để lấy dòng hiệu lực mới nhất của mọi khoá
async function addLevel(me?, actx?, code?, body?) {
  if (!body || typeof body !== 'object') throw fail(400, 'LEVEL_BAD_BODY', 'Thiếu thông tin bậc');
  if (!(await authz.can(me, registry.WRITE_CAP.admin)))
    throw fail(403, 'FORBIDDEN_CAP', `Cần quyền ${registry.WRITE_CAP.admin} để thêm bậc`, {
      cap: registry.WRITE_CAP.admin
    });
  needReason(body);
  const month = await effectiveMonthOf(body);
  const resolved = await paramsStore.resolve(month);
  // bậc của chức vụ đã có dòng hiệu lực muộn hơn tháng áp dụng (thêm sớm hơn sẽ trùng số bậc)
  const prefix = `level.${code}.`; // so khớp theo tiền tố, không ghép mã từ URL vào biểu thức chính quy
  const later = (await store.params.resolvedRows(LATEST_MONTH))
    .filter(
      row => row.key.startsWith(prefix) && row.key.endsWith('.base') && row.value !== null && row.effectiveMonth > month
    )
    .map(row => ({ level: Number(row.key.slice(prefix.length, -'.base'.length)), effectiveMonth: row.effectiveMonth }))
    .filter(l => Number.isInteger(l.level));
  const built = Positions.buildLevel(resolved.params, code, body, later);
  const saved = await save(
    me,
    actx,
    {
      changes: built.changes,
      effectiveMonth: month,
      reason: body.reason,
      basis: body.basis,
      acknowledge: body.acknowledge,
      expectedRev: resolved.rev
    },
    { serverBatch: true }
  );
  return {
    ...saved,
    level: { position: code, level: built.level, name: built.name, base: body.base, effectiveMonth: month }
  };
}

/* ---------- thêm khối phụ cấp và xác nhận cờ ---------- */
// POST /api/blocks { label, component?, method: 'fixed'|'pctBase'|'byLevel', scalesWithDays?, loss?, tax?, taxCap?, insuranceBase?,
//   values: { <chức vụ>: { on, amount | pct | byLevel: { <bậc>: số tiền } } } (hoặc positions: [{ position, on, amount?, pct? }]), effectiveMonth?, reason }
// Máy chủ sinh mã khối từ nhãn (trùng là 409 BLOCK_CODE_CLASH), dựng MỘT lô block.def.<mã> + type.<chức vụ>.block.<mã>.<trường> rồi gọi cùng save().
async function addBlock(me?, actx?, body?) {
  if (!body || typeof body !== 'object') throw fail(400, 'BLOCK_BAD_BODY', 'Thiếu thông tin khoản phụ cấp');
  if (!(await authz.can(me, registry.WRITE_CAP.admin)))
    throw fail(403, 'FORBIDDEN_CAP', `Cần quyền ${registry.WRITE_CAP.admin} để thêm khoản phụ cấp`, {
      cap: registry.WRITE_CAP.admin
    });
  needReason(body);
  const month = await effectiveMonthOf(body);
  const resolved = await paramsStore.resolve(month);
  let built;
  try {
    built = BlockDefs.buildCreate(resolved.params, body);
  } catch (e) {
    throw fail(e.httpStatus || 400, e.code || 'PARAM_INVALID_VALUE', e.message);
  }
  const saved = await save(
    me,
    actx,
    { changes: built.changes, effectiveMonth: month, reason: body.reason, expectedRev: resolved.rev },
    { serverBatch: true }
  );
  return {
    ...saved,
    code: built.code,
    block: { code: built.code, label: built.def.label, component: built.def.component }
  };
}
// PUT /api/blocks/:mã/confirm { basis, effectiveMonth?, reason? }: Kế toán (config.legal) xác nhận cờ thuế, bảo hiểm ĐÃ ĐỀ NGHỊ của khối, hiệu lực từ tháng đó.
// Máy chủ tự đặt flagsConfirmedBy và flagsConfirmedAt từ người đang đăng nhập; chưa xác nhận thì khối tính như chịu thuế và không vào nền bảo hiểm.
async function confirmBlock(me?, actx?, code?, body?) {
  if (!(await authz.can(me, registry.WRITE_CAP.accounting)))
    throw fail(403, 'FORBIDDEN_CAP', `Cần quyền ${registry.WRITE_CAP.accounting} để xác nhận cờ thuế, bảo hiểm`, {
      cap: registry.WRITE_CAP.accounting
    });
  const basis = body && typeof body.basis === 'string' ? body.basis.trim() : '';
  const month = await effectiveMonthOf(body);
  const resolved = await paramsStore.resolve(month);
  const key = `block.def.${code}`;
  const def = Object.hasOwn(resolved.params, key) ? resolved.params[key] : null;
  if (!def || typeof def !== 'object')
    throw fail(404, 'BLOCK_UNKNOWN', 'Không có khoản phụ cấp này trong tháng áp dụng');
  if ((def.tax ?? 'none') === 'none' && !def.insuranceBase)
    throw fail(
      400,
      'BLOCK_NO_FLAGS',
      'Khoản này không đề nghị cờ miễn thuế hay tính vào bảo hiểm, không có gì để xác nhận'
    );
  // Kế toán chỉ xác nhận ĐÚNG cờ đã xem: expectedFlags { tax, taxCap, insuranceBase } hoặc rev (paramsRev đã thấy) lệch hiện tại là 409, để không xác nhận cờ vừa bị C&B đổi
  if (body.rev !== undefined && body.rev !== resolved.rev)
    throw fail(409, 'PARAMS_STALE', 'Cấu hình vừa đổi từ lúc bạn xem; tải lại rồi xác nhận', {
      paramsRev: resolved.rev
    });
  if (body.expectedFlags !== undefined) {
    const seen = body.expectedFlags && typeof body.expectedFlags === 'object' ? body.expectedFlags : {};
    const now = { tax: def.tax ?? 'none', taxCap: def.taxCap ?? null, insuranceBase: !!def.insuranceBase };
    if (seen.tax !== now.tax || (seen.taxCap ?? null) !== now.taxCap || !!seen.insuranceBase !== now.insuranceBase)
      throw fail(
        409,
        'BLOCK_FLAGS_CHANGED',
        'Cờ thuế, bảo hiểm của khoản đã đổi từ lúc bạn xem; tải lại rồi xác nhận',
        { flags: now }
      );
  }
  const at = nowIso();
  const reason =
    typeof body.reason === 'string' && body.reason.trim()
      ? body.reason
      : `Kế toán xác nhận cờ thuế, bảo hiểm của khoản ${def.label}`;
  const saved = await save(
    me,
    actx,
    { changes: [{ key, value: def }], effectiveMonth: month, reason, basis, expectedRev: resolved.rev },
    { confirm: { by: me.username, at } }
  );
  return { ...saved, code, confirmedBy: me.username, confirmedAt: at };
}

export = {
  preview,
  save,
  revert,
  addPosition,
  addLevel,
  addBlock,
  confirmBlock,
  earliestOpenMonth,
  lockedBefore,
  activationAllowed,
  shiftEditAllowed
};
