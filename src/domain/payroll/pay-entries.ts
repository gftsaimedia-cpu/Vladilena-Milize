'use strict';
// Khoản điền thêm theo người, theo tháng.
// Lớp lưu trữ và quy tắc trên bảng `pay_entries` (src/platform/db.ts): tạo, sửa khi chờ duyệt, quyết định, huỷ, xác nhận cờ thuế và bảo hiểm, liệt kê,
// nạp khoản ĐÃ DUYỆT cho bộ máy tính lương. Route nằm ở src/domain/pay-entries.ts.
//
// Quy tắc (máy chủ tự kiểm, không tin giao diện; cột INTEGER của SQLite ép chuỗi số thành số nên kiểu được chặn ở đây):
//   - lập: số tiền là số nguyên đồng > 0 (kiểu number, không chuỗi), tới trần system.entries.maxAmount; nhãn, lý do đúng độ dài; nhân sự được trả lương
//   - khoản trừ: luôn sau thuế (không mang cờ thuế, bảo hiểm); nhãn không được là "phạt", "fine", "penalty" (BLLĐ 45/2019/QH14 Điều 127)
//   - duyệt: người duyệt khác người lập khi system.entries.requireApproval bật (403 SELF_DECISION_FORBIDDEN); tắt thì khoản có hiệu lực ngay khi lập
//   - kỳ đã duyệt hoặc chi trả khoá mọi thay đổi: 409 PERIOD_LOCKED kèm suggestMonth (kỳ mở kế tiếp)
//   - khoá lạc quan: rev lệch thì 409 REV_STALE và không ghi gì
//   - cờ miễn thuế và nền bảo hiểm chỉ có hiệu lực sau khi Kế toán xác nhận (confirmFlags); sửa cờ thì mất xác nhận
// Mọi giới hạn lấy từ bộ tham số hiệu lực của tháng (system.entries.*, control.reason*Length). Mọi ghi chạy trong store.transaction cùng dòng nhật ký.
const store = require('../../platform/db');
const paramsStore = require('../../params/store');
const authz = require('../../platform/authz');
const audit = require('../../platform/audit');
const PayrollCalendar = require('../../engine/payroll-calendar');
const PayEntriesCalc = require('../../engine/pay-entries-calc');
const config = require('../../platform/config');
const { USERNAME_RE } = require('../input');
const { warnIf, warn, selfDecision } = require('../../platform/warnings');

const { transaction } = store;
const { PayEntriesRepository } = require('../../data');
const entriesRepo = new PayEntriesRepository(store.queryBuilder);
// Nhãn không chứa dấu ngoặc nhọn của thẻ HTML: lớp phòng thủ thêm ở máy chủ (giao diện vẫn thoát ký tự khi hiện)
const HAS_MARKUP = /[<>]/;
const STATUSES = ['pending', 'approved', 'rejected', 'void'];
const DECISIONS = ['approved', 'rejected'];
// Nhãn khoản trừ cấm: từ nguyên vẹn (không tính chữ nằm trong từ khác), không phân biệt hoa thường
const FORBIDDEN_LABEL = /(^|[^\p{L}\p{N}])(phạt|fine|penalty)($|[^\p{L}\p{N}])/iu;

function fail(status?, code?, message?, details?) {
  return Object.assign(new Error(message), { code, httpStatus: status, ...(details ? { details } : {}) });
}
const bad = (code?, message?) => fail(400, code, message);

const limitsFor = async (month?) => {
  if (!PayrollCalendar.isValidMonth(month)) throw bad('BAD_MONTH', 'month phải có dạng YYYY-MM');
  const P = (await paramsStore.resolve(month)).params;
  return {
    requireApproval: P['system.entries.requireApproval'] !== false,
    maxPerBatch: P['system.entries.maxPerBatch'],
    maxAmount: P['system.entries.maxAmount'],
    // Không bao giờ vượt CHECK của bảng pay_entries (nhãn 1-80, lý do 10-300): tham số lớn hơn thì lấy giới hạn của lược đồ, để DB không trả 500
    labelMax: Math.min(P['system.entries.labelMaxLength'], config.ENTRIES_LABEL_MAX),
    reasonMax: Math.min(P['control.reasonMaxLength'], config.REASON_MAX)
  };
};
const nowIso = () => new Date(Date.now()).toISOString();

/* ---------- đọc ---------- */
const rowTo = (r?) =>
  r && {
    id: r.id,
    username: r.username,
    month: r.month,
    direction: r.direction,
    amount: r.amount,
    label: r.label,
    slipLine: r.slip_line ?? null,
    reason: r.reason,
    taxMode: r.tax_mode ?? null,
    taxCap: r.tax_cap ?? null,
    insuranceBase: r.insurance_base ?? null,
    flagsConfirmedBy: r.flags_confirmed_by ?? null,
    flagsConfirmedAt: r.flags_confirmed_at ?? null,
    status: r.status,
    rev: r.rev,
    createdBy: r.created_by,
    createdAt: r.created_at,
    decidedBy: r.decided_by ?? null,
    decidedAt: r.decided_at ?? null,
    decisionNote: r.decision_note ?? null
  };
const get = async (id?) => rowTo(await entriesRepo.find(id));
const hasFlags = (e?) =>
  e.taxMode === 'full' || e.taxMode === 'cap' || (e.insuranceBase != null && e.insuranceBase > 0);

// Liệt kê theo tháng (bắt buộc), tuỳ chọn theo người và trạng thái; cũ → mới theo id
async function list({ month, username, status }: any = {}) {
  if (!PayrollCalendar.isValidMonth(month)) throw bad('BAD_MONTH', 'month phải có dạng YYYY-MM');
  if (status != null && !STATUSES.includes(status)) throw bad('BAD_STATUS', 'status không hợp lệ');
  return (
    await entriesRepo.list({
      month,
      username: username ? String(username).toLowerCase() : undefined,
      status: status || undefined
    })
  ).map(rowTo);
}

// Khoản ĐÃ DUYỆT của một tháng, gom theo người, đúng hình bộ máy nhận (src/engine/pay-entries-calc.ts): không lý do, không người lập.
// Một lượt đọc cho cả tháng (src/domain/payroll/payroll-service.ts → loadInputs gọi một lần). Người không có khoản nào không có mục trong Map.
async function approvedByUser(month?) {
  const out = new Map<any, any>();
  for (const row of await entriesRepo.approvedOf(month)) {
    const entry = rowTo(row);
    if (!out.has(entry.username)) out.set(entry.username, []);
    out.get(entry.username).push(entry);
  }
  for (const [username, entries] of out) out.set(username, PayEntriesCalc.list(entries));
  return out;
}

/* ---------- kiểm đầu vào ---------- */
const isInt = (value?) => typeof value === 'number' && Number.isSafeInteger(value);
function text(value, label, { min, max, required = true, markup = false }: any) {
  if (value == null || value === '') {
    if (required) throw bad('BAD_FIELD', `${label} là bắt buộc`);
    return null;
  }
  if (typeof value !== 'string') throw bad('BAD_FIELD', `${label} phải là chữ`);
  const t = value.normalize('NFC').trim();
  // Đếm theo ký tự thật (điểm mã) như length() của SQLite trong CHECK của bảng: emoji là một ký tự, không phải hai
  const size = [...t].length;
  if (size < min || size > max) throw bad('BAD_FIELD', `${label} cần từ ${min} đến ${max} ký tự`);
  if (markup && HAS_MARKUP.test(t)) throw bad('BAD_FIELD', `${label} không được chứa ký tự < hoặc >`);
  return t;
}
// Nhận đầu vào của một khoản (lập mới) và trả các trường đã làm sạch. Không nhận trạng thái, người lập, người xác nhận từ thân yêu cầu.
// ctx: giới hạn của tháng; `partial` (sửa) dùng giá trị hiện có cho trường vắng.
function clean(input?, limits?, current: any = null) {
  const b = input && typeof input === 'object' && !Array.isArray(input) ? input : null;
  if (!b) throw bad('BAD_BODY', 'Mỗi khoản phải là một đối tượng');
  const pick = (key?) => (Object.hasOwn(b, key) ? b[key] : current ? current[key] : undefined);
  const month = pick('month');
  if (!PayrollCalendar.isValidMonth(month)) throw bad('BAD_MONTH', 'month phải có dạng YYYY-MM');
  const direction = pick('direction');
  if (!PayEntriesCalc.DIRECTIONS.includes(direction))
    throw bad('BAD_DIRECTION', 'direction phải là "add" (cộng) hoặc "deduct" (trừ)');
  const amount = pick('amount');
  if (!isInt(amount) || amount < 1) throw bad('BAD_AMOUNT', 'Số tiền phải là số nguyên đồng lớn hơn 0');
  if (amount > limits.maxAmount) throw bad('BAD_AMOUNT', 'Số tiền vượt giới hạn cho một khoản, kiểm tra lại số không');
  const label = text(pick('label'), 'Nhãn', { min: 1, max: limits.labelMax, markup: true });
  // slipLine: null hoặc chuỗi rỗng xoá dòng riêng (phiếu dùng lại nhãn)
  const slipLine = text(pick('slipLine'), 'Dòng trên phiếu', {
    min: 1,
    max: limits.labelMax,
    required: false,
    markup: true
  });
  // Lý do không bắt buộc; cột pay_entries.reason có CHECK 10–300 nên thiếu lý do thì lưu câu mặc định (store.padReason)
  const reason = store.padReason(text(pick('reason'), 'Lý do', { min: 1, max: limits.reasonMax, required: false }));
  // Nhãn khoản trừ chứa chữ "phạt": lưu và cảnh báo nêu căn cứ luật (Bộ luật Lao động số 45/2019/QH14, hiệu lực 01/01/2021, Điều 127)
  warnIf('LABEL_FORBIDDEN', direction === 'deduct' && [label, slipLine].some(t => t && FORBIDDEN_LABEL.test(t)), {
    message: () =>
      `Nhãn khoản trừ ${[...new Set<any>([label, slipLine].filter(t => t && FORBIDDEN_LABEL.test(t)))].map(t => `"${t}"`).join(', ')} có chữ "phạt": Bộ luật Lao động 45/2019/QH14, Điều 127 không cho phạt tiền người lao động (cần pháp chế xác nhận). Khoản vẫn được lưu và trừ sau thuế như mọi khoản trừ.`
  });
  // Cờ thuế, bảo hiểm: chỉ khoản cộng; khoản trừ luôn sau thuế
  // Cờ thừa kế từ khoản đã lưu (trường vắng trong thân yêu cầu) bị bỏ khi khoản thành khoản trừ, hoặc khi taxMode không còn là "cap"
  // (hạn mức đi theo chế độ). Cờ GỬI RÕ trong thân yêu cầu thì vẫn bị kiểm.
  const sent = (key?) => Object.hasOwn(b, key);
  const deduct = direction === 'deduct';
  const taxMode = (deduct && !sent('taxMode') ? null : pick('taxMode')) ?? null;
  const insuranceBase = (deduct && !sent('insuranceBase') ? null : pick('insuranceBase')) ?? null;
  const taxCap = ((deduct || taxMode !== 'cap') && !sent('taxCap') ? null : pick('taxCap')) ?? null;
  if (deduct && (taxMode !== null || taxCap !== null || insuranceBase !== null))
    throw bad('FLAGS_ON_DEDUCT', 'Khoản trừ luôn trừ sau thuế, không có cờ miễn thuế hay tính vào nền bảo hiểm');
  if (taxMode !== null && !PayEntriesCalc.TAX_MODES.includes(taxMode))
    throw bad('BAD_TAX_MODE', 'taxMode phải là "none", "full", "cap" hoặc để trống');
  if (taxMode === 'cap') {
    if (!isInt(taxCap) || taxCap < 0) throw bad('BAD_TAX_CAP', 'Hạn mức miễn thuế phải là số nguyên đồng không âm');
  } else if (taxCap !== null) throw bad('BAD_TAX_CAP', 'Hạn mức miễn thuế chỉ dùng khi taxMode là "cap"');
  if (insuranceBase !== null && (!isInt(insuranceBase) || insuranceBase < 0 || insuranceBase > amount))
    throw bad('BAD_INSURANCE_BASE', 'Phần tính vào nền bảo hiểm phải là số nguyên đồng từ 0 đến số tiền của khoản');
  return { month, direction, amount, label, slipLine, reason, taxMode, taxCap, insuranceBase };
}
const flagKey = (e?) => JSON.stringify([e.taxMode, e.taxCap, e.insuranceBase]);

/* ---------- cổng kỳ lương và người ---------- */
const nextMonthOf = (month?) => {
  const [y, m] = month.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
};
// Kỳ lương đã duyệt hoặc chi trả: lập khoản vẫn được; phiếu đã chốt không đổi nên khoản chỉ vào lương khi kỳ được tính lại hoặc lập ở kỳ mở kế tiếp
// (suggestMonth; vòng lặp dừng vì số kỳ có dòng là hữu hạn)
async function assertOpen(month?) {
  const period = await store.periods.get(month);
  if (['approved', 'paid'].includes(period.status)) {
    let suggestMonth = nextMonthOf(month);
    while (['approved', 'paid'].includes((await store.periods.get(suggestMonth)).status))
      suggestMonth = nextMonthOf(suggestMonth);
    warn(
      'PERIOD_LOCKED',
      `Kỳ lương ${month} đã ${period.status === 'paid' ? 'chi trả' : 'duyệt'}: phiếu đã chốt không đổi, khoản vừa lưu không vào phiếu này trừ khi kỳ được tính lại; nên lập khoản ở kỳ ${suggestMonth}.`,
      { details: { month, suggestMonth } }
    );
  }
}
// Không ai lập, sửa, huỷ khoản về chính mình (như số sửa phiếu)
const checkSelf = (username?, me?, what?) => selfDecision(authz.isSelfDecision(me, username), { doing: what });
// Người nhận khoản mới phải là nhân sự được trả lương
async function checkSubject(username?, me?, what?) {
  if (typeof username !== 'string' || !USERNAME_RE.test(username))
    throw bad('BAD_USERNAME', 'Tên đăng nhập không hợp lệ');
  if (!(await store.getStaff(username))) throw fail(404, 'NO_SUCH_STAFF', 'Không có nhân sự này');
  if (!(await store.isPayrollSubject(username)))
    throw bad('NOT_PAYROLL_SUBJECT', 'Người này không thuộc diện được trả lương');
  checkSelf(username, me, what);
}
const need = async (id?, rev?) => {
  if (!Number.isInteger(id) || id < 1) throw bad('BAD_ID', 'Mã khoản không hợp lệ');
  const row = await get(id);
  if (!row) throw fail(404, 'ENTRY_NOT_FOUND', 'Không có khoản này');
  if (rev !== undefined && rev !== null && (!Number.isSafeInteger(rev) || rev < 0))
    throw bad('BAD_REV', 'rev phải là số nguyên không âm');
  if (rev !== undefined && rev !== null && rev !== row.rev)
    throw fail(409, 'REV_STALE', 'Khoản đã được người khác đổi, tải lại rồi làm lại', { rev: row.rev });
  return row;
};
const requireRev = (rev?) => {
  if (!Number.isSafeInteger(rev) || rev < 0) throw bad('BAD_REV', 'Thiếu rev của khoản (số lần đổi bạn đã thấy)');
  return rev;
};
const notPending = (row?) =>
  fail(409, 'ENTRY_NOT_PENDING', 'Khoản không còn ở trạng thái chờ duyệt', { status: row.status, rev: row.rev });

/* ---------- nhật ký ---------- */
const AUDIT_FIELDS = [
  'username',
  'month',
  'direction',
  'amount',
  'label',
  'slipLine',
  'taxMode',
  'taxCap',
  'insuranceBase',
  'flagsConfirmedBy',
  'status'
];
const auditEntry = async (actx?, action?, entry?, before?, reason?) =>
  await audit.write(actx, {
    action,
    entityKind: 'pay_entry',
    entityId: String(entry.id),
    subject: entry.username,
    month: entry.month,
    before: before ? audit.pick(before, AUDIT_FIELDS) : null,
    after: audit.pick(entry, AUDIT_FIELDS),
    reason: reason || null,
    sensitivity: 'pay'
  });

/* ---------- ghi ---------- */
// Lập một khoản. Trả { entry, notify } (notify: người cần được báo nạp lại ước tính khi khoản có hiệu lực ngay).
async function insert(fields?, username?, me?, actx?, limits?) {
  const t = nowIso();
  const immediate = !limits.requireApproval; // không bắt buộc duyệt: có hiệu lực ngay, ghi rõ ở ghi chú quyết định
  const id = await entriesRepo.insert({
    username,
    month: fields.month,
    direction: fields.direction,
    amount: fields.amount,
    label: fields.label,
    slip_line: fields.slipLine,
    reason: fields.reason,
    tax_mode: fields.taxMode,
    tax_cap: fields.taxCap,
    insurance_base: fields.insuranceBase,
    status: immediate ? 'approved' : 'pending',
    rev: 1,
    created_by: me.username,
    created_at: t,
    decided_by: immediate ? me.username : null,
    decided_at: immediate ? t : null,
    decision_note: immediate ? 'Có hiệu lực ngay khi lập (đang tắt bước duyệt khoản điền thêm)' : null
  });
  const entry = await get(id);
  await auditEntry(actx, 'entry.create', entry, null, entry.reason);
  return entry;
}

async function create(input?, me?, actx?) {
  const body = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const username = typeof body.username === 'string' ? body.username.toLowerCase() : body.username;
  return await transaction(async () => {
    const limits = await limitsFor(body.month);
    await checkSubject(username, me, 'lập khoản điền thêm về lương');
    const fields = clean(body, limits);
    await assertOpen(fields.month);
    return await insert(fields, username, me, actx, limits);
  });
}

// Một người hai lần trong cùng lô là nhập nhầm (trả hai lần): 400, không lưu gì. Dạng `usernames` (cùng một khoản cho nhiều người): tên trùng là lỗi.
// Dạng `entries` (mỗi dòng một khoản riêng): một người được nhiều khoản khác nhau, chỉ dòng trùng HẲN (cùng người, tháng, hướng, nhãn) là lỗi.
function assertNoDuplicates(items?, sharedEntry?) {
  const seen = new Map<any, any>();
  items.forEach((item, index) => {
    if (!item || typeof item !== 'object' || typeof item.username !== 'string') return; // dòng hỏng báo riêng ở bước kiểm từng dòng
    const username = item.username.toLowerCase();
    const key = sharedEntry
      ? username
      : JSON.stringify([
          username,
          item.month,
          item.direction,
          typeof item.label === 'string' ? item.label.trim() : null
        ]);
    // Lưu cả hai dòng và cảnh báo: cả hai khoản đều được tính, nếu cả hai được duyệt thì người này nhận (hoặc bị trừ) hai lần
    warnIf('DUPLICATE_ENTRY', seen.has(key), {
      message: `Khoản trùng: dòng ${index + 1} giống dòng ${seen.get(key)} (${username}): nếu cả hai được duyệt, ${username} nhận (hoặc bị trừ) hai lần.`
    });
    if (!seen.has(key)) seen.set(key, index + 1);
  });
}

// Nhập nhiều khoản một lần, tất cả hoặc không. Nhận { entries: [...] } (mỗi khoản đủ trường, có username)
// hoặc { usernames: [...], month, direction, amount, ... } (cùng một khoản cho nhiều người).
async function createBulk(input?, me?, actx?) {
  const body = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  if (body.entries !== undefined && body.usernames !== undefined)
    throw bad('BAD_BODY', 'Chỉ gửi entries hoặc usernames, không gửi cả hai');
  let items = body.entries;
  if (body.usernames !== undefined) {
    if (!Array.isArray(body.usernames)) throw bad('BAD_BODY', 'usernames phải là danh sách');
    const { usernames, ...shared } = body;
    items = usernames.map(username => ({ ...shared, username }));
  }
  if (!Array.isArray(items) || !items.length) throw bad('BAD_BODY', 'Cần ít nhất một khoản (entries hoặc usernames)');
  // month ở ngoài là tháng chung: khoản nào không tự ghi month thì nhận tháng đó (khoản ghi month riêng thì giữ)
  if (body.month !== undefined)
    items = items.map(item =>
      item && typeof item === 'object' && !Array.isArray(item) ? { month: body.month, ...item } : item
    );
  return await transaction(async () => {
    const limits = await limitsFor(body.month ?? (items[0] && items[0].month)); // trần mỗi lần nhập lấy theo tháng của khoản đầu
    if (items.length > limits.maxPerBatch)
      throw fail(400, 'TOO_MANY', `Mỗi lần nhập tối đa ${limits.maxPerBatch} khoản`, { max: limits.maxPerBatch });
    assertNoDuplicates(items, body.usernames !== undefined);
    const out: any[] = [];
    for (const [index, item] of items.entries()) {
      try {
        const username =
          item && typeof item.username === 'string' ? item.username.toLowerCase() : item && item.username;
        await checkSubject(username, me, 'lập khoản điền thêm về lương');
        const fields = clean(item, await limitsFor(item && item.month));
        const itemLimits = await limitsFor(fields.month);
        await assertOpen(fields.month);
        out.push(await insert(fields, username, me, actx, itemLimits));
      } catch (e) {
        if (e.httpStatus) e.message = `Dòng ${index + 1}: ${e.message}`;
        throw e;
      }
    }
    return out;
  });
}

// Sửa khi còn chờ duyệt (người, trạng thái, người lập không đổi được). Sửa cờ thuế hoặc bảo hiểm thì mất xác nhận.
async function update(id?, input?, me?, actx?) {
  const body = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  return await transaction(async () => {
    const row = await need(id, requireRev(body.rev));
    if (row.status !== 'pending') throw notPending(row);
    checkSelf(row.username, me, 'sửa khoản điền thêm về lương');
    // Chỉ người lập sửa được khoản chờ duyệt: người sửa không thể tự duyệt khoản mình đã sửa (người khác vẫn quyết định được qua decide)
    // (chỉ cảnh báo; khoản sửa vẫn chờ duyệt, nhật ký ghi người sửa)
    warnIf('EDIT_CREATOR_ONLY', row.createdBy !== me.username, {
      details: { createdBy: row.createdBy },
      message: 'Bạn sửa khoản do người khác lập: khoản vẫn chờ duyệt, nhật ký ghi người sửa.'
    });
    await assertOpen(row.month);
    const fields = clean(body, await limitsFor(row.month), row);
    if (fields.month !== row.month) await assertOpen(fields.month);
    const keepConfirm = flagKey(fields) === flagKey(row) && fields.amount === row.amount;
    const changed = await entriesRepo.updatePending(id, row.rev, {
      month: fields.month,
      direction: fields.direction,
      amount: fields.amount,
      label: fields.label,
      slip_line: fields.slipLine,
      reason: fields.reason,
      tax_mode: fields.taxMode,
      tax_cap: fields.taxCap,
      insurance_base: fields.insuranceBase,
      flags_confirmed_by: keepConfirm ? row.flagsConfirmedBy : null,
      flags_confirmed_at: keepConfirm ? row.flagsConfirmedAt : null
    });
    if (changed !== 1) throw fail(409, 'REV_STALE', 'Khoản đã được người khác đổi, tải lại rồi làm lại');
    const entry = await get(id);
    await auditEntry(actx, 'entry.update', entry, row, entry.reason);
    return entry;
  });
}

// Quyết định: 'approved' hoặc 'rejected'. Khi bắt buộc duyệt hai người, người duyệt phải khác người lập (SELF_DECISION_FORBIDDEN).
// Từ chối cần ghi chú đủ dài như một lý do.
async function decide(id?, input?, me?, actx?) {
  const body = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  if (!DECISIONS.includes(body.decision)) throw bad('BAD_DECISION', 'decision phải là "approved" hoặc "rejected"');
  return await transaction(async () => {
    const row = await need(id, requireRev(body.rev));
    const limits = await limitsFor(row.month);
    const note = text(body.note, 'Ghi chú', { min: 1, max: limits.reasonMax, required: false });
    if (row.status !== 'pending') throw notPending(row);
    if (limits.requireApproval && row.createdBy === me.username)
      selfDecision(true, { doing: 'duyệt khoản do mình lập (cần người khác duyệt)' });
    checkSelf(row.username, me, 'duyệt khoản điền thêm về lương');
    await assertOpen(row.month);
    const changed = await entriesRepo.update(id, row.rev, ['pending'], {
      status: body.decision,
      decided_by: me.username,
      decided_at: nowIso(),
      decision_note: note
    });
    if (changed !== 1) throw fail(409, 'REV_STALE', 'Khoản đã được người khác đổi, tải lại rồi làm lại');
    const entry = await get(id);
    await auditEntry(actx, 'entry.decide', entry, row, note);
    return entry;
  });
}

// Huỷ (trạng thái cuối, không xoá dòng). Khoản đã duyệt cần lý do (đổi tiền trả cho người); khoản chờ duyệt không bắt buộc.
async function voidEntry(id?, input?, me?, actx?) {
  const body = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  return await transaction(async () => {
    const row = await need(id, body.rev);
    if (row.status !== 'pending' && row.status !== 'approved')
      throw fail(409, 'ENTRY_NOT_VOIDABLE', 'Chỉ huỷ được khoản đang chờ duyệt hoặc đã duyệt', {
        status: row.status,
        rev: row.rev
      });
    const limits = await limitsFor(row.month);
    const reason = text(body.reason, 'Lý do huỷ', { min: 1, max: limits.reasonMax, required: false });
    checkSelf(row.username, me, 'huỷ khoản điền thêm về lương');
    await assertOpen(row.month);
    const changed = await entriesRepo.update(id, row.rev, ['pending', 'approved'], { status: 'void' });
    if (changed !== 1) throw fail(409, 'REV_STALE', 'Khoản đã được người khác đổi, tải lại rồi làm lại');
    const entry = await get(id);
    await auditEntry(actx, 'entry.void', entry, row, reason);
    return { entry, wasApproved: row.status === 'approved' };
  });
}

// Kế toán xác nhận cờ miễn thuế và nền bảo hiểm của khoản (chỉ có hiệu lực khi được xác nhận). Khoản phải đang có cờ.
async function confirmFlags(id?, input?, me?, actx?) {
  const body = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  return await transaction(async () => {
    const row = await need(id, requireRev(body.rev));
    // Không ai tự xác nhận cờ thuế, bảo hiểm của khoản về lương của mình (như lập, sửa, duyệt, huỷ)
    checkSelf(row.username, me, 'xác nhận cờ thuế, bảo hiểm của khoản điền thêm về lương');
    if (row.status !== 'pending' && row.status !== 'approved')
      throw fail(409, 'ENTRY_NOT_CONFIRMABLE', 'Chỉ xác nhận cờ cho khoản đang chờ duyệt hoặc đã duyệt', {
        status: row.status,
        rev: row.rev
      });
    if (row.direction !== 'add' || !hasFlags(row))
      throw bad('NO_FLAGS', 'Khoản này không có cờ miễn thuế hay nền bảo hiểm để xác nhận');
    if (row.flagsConfirmedBy)
      throw fail(409, 'FLAGS_ALREADY_CONFIRMED', 'Cờ của khoản đã được xác nhận', { rev: row.rev });
    // Căn cứ (số văn bản, điều khoản) không bắt buộc; ghi vào nhật ký
    const basis = text(body.basis, 'Căn cứ', { min: 1, max: (await limitsFor(row.month)).reasonMax, required: false });
    await assertOpen(row.month);
    const changed = await entriesRepo.update(id, row.rev, ['pending', 'approved'], {
      flags_confirmed_by: me.username,
      flags_confirmed_at: nowIso()
    });
    if (changed !== 1) throw fail(409, 'REV_STALE', 'Khoản đã được người khác đổi, tải lại rồi làm lại');
    const entry = await get(id);
    await auditEntry(actx, 'entry.confirmFlags', entry, row, basis);
    return entry;
  });
}

export = {
  STATUSES,
  FORBIDDEN_LABEL,
  limitsFor,
  get,
  list,
  approvedByUser,
  create,
  createBulk,
  update,
  decide,
  voidEntry,
  confirmFlags
};
