'use strict';
// Nhật ký kiểm toán phía ứng dụng. Lưu trữ, chuỗi băm và trigger "chỉ thêm" nằm ở src/platform/db.ts (store.audit).
// Quy tắc: gọi write() BÊN TRONG store.transaction của thao tác (lỗi thì cả thay đổi lẫn dòng nhật ký cùng hoàn tác);
// request bị từ chối (4xx) ném lỗi trước khi tới đây nên không để lại dòng nào.
// KHÔNG BAO GIỜ ghi: mật khẩu, hàm băm, cookie, khoá phiên, toạ độ GPS, thân yêu cầu nguyên văn. Chỉ ghi qua danh sách trường cho phép.
const crypto = require('node:crypto');
const store = require('./db');
const authz = require('./authz');
const warnings = require('./warnings');

// Ngữ cảnh của một yêu cầu HTTP: người làm, vai trò lúc làm, mã yêu cầu nối nhiều dòng của một thao tác
async function context(me?) {
  return { actor: me.username, actorRoles: await authz.rolesOf(me), requestId: crypto.randomUUID() };
}

// Hàng rào cuối: dữ liệu đưa vào nhật ký có dấu hiệu bí mật thì dừng cả thao tác (lỗi lập trình, không lưu gì)
const SECRET_RE = /scrypt\$|luong_sid|pass_?hash|session_secret|"?(lat|lng)"?\s*:/i;
// Thao tác có cảnh báo: after.warnings = các mã cảnh báo của yêu cầu, để gom feedback sau này; after.self = true khi có việc tự làm về chính mình
// (SELF_DECISION_FORBIDDEN chỉ cảnh báo). Chỉ thêm khi yêu cầu thật sự có cảnh báo, nên thao tác bình thường không có hai trường này.
const SELF_CODES = ['SELF_DECISION_FORBIDDEN', 'APPROVAL_SELF']; // mã cảnh báo "tự làm về chính mình"
function withWarnings(ctx?, entry?) {
  const found = warnings.codes();
  if (!found.length) return entry;
  const after = entry.after == null ? {} : entry.after;
  if (typeof after !== 'object' || Array.isArray(after)) return entry;
  // after.self chỉ trên dòng nói về chính người làm (lô nhiều người chỉ đánh dấu dòng của người tự làm cho mình)
  const self = found.some(code => SELF_CODES.includes(code)) && entry.subject === ctx.actor ? { self: true } : {};
  return { ...entry, after: { ...after, warnings: found, ...self } };
}
async function write(ctx?, entry?) {
  entry = withWarnings(ctx, entry);
  const text = JSON.stringify([entry.before ?? null, entry.after ?? null, entry.reason ?? null, entry.entityId]);
  if (SECRET_RE.test(text)) throw new Error(`Nhật ký ${entry.action}: dữ liệu có dấu hiệu bí mật, không ghi`);
  return await store.audit.write({
    actor: ctx.actor,
    actorRoles: ctx.actorRoles,
    requestId: ctx.requestId,
    sensitivity: 'normal',
    ...entry
  });
}

// Lấy các trường cho phép của một đối tượng
const pick = (object?, fields?) =>
  Object.fromEntries(fields.filter(f => object && Object.hasOwn(object, f)).map(f => [f, object[f]]));
// So hai đối tượng theo danh sách trường: { changed: [trường], before, after } chỉ gồm trường đổi; null nếu không đổi gì
function diff(before?, after?, fields?) {
  const changed = fields.filter(f => JSON.stringify(before ? before[f] : undefined) !== JSON.stringify(after[f]));
  if (!changed.length) return null;
  return { changed, before: before ? pick(before, changed) : null, after: pick(after, changed) };
}

// Hồ sơ nhân sự: nhóm trường theo mức nhạy cảm (chỉ trường không nhạy cảm có cũ, mới; ngày sinh chỉ ghi "đã đổi")
// familyName, givenName, contractStatus (thử việc / chính thức), resignedOn (ngày nghỉ việc): không nhạy cảm
const STAFF_PLAIN = [
  'name',
  'familyName',
  'givenName',
  'role',
  'shiftCode',
  'startDate',
  'jobTitle',
  'contractStatus',
  'resignedOn'
];
const STAFF_PAY = [
  'type',
  'level',
  'nightPct',
  'idorm',
  'contract',
  'insured',
  'dependants',
  'leaveAdjust',
  'taxOn',
  'deductOn',
  'advanceOn'
];
const STAFF_PII = ['birthday'];
// Ghi các dòng của một lần lưu hồ sơ: prev null khi tạo mới. passwordSet: có đặt/đổi mật khẩu (chỉ ghi cờ, không ghi giá trị).
async function staffSaved(ctx?, prev?, next?, { passwordSet = false }: any = {}) {
  const action = prev ? 'staff.update' : 'staff.create';
  const base = { action, entityKind: 'staff', entityId: next.username, subject: next.username };
  const plain = diff(prev, next, STAFF_PLAIN);
  const pay = diff(prev, next, STAFF_PAY);
  const pii = diff(prev, next, STAFF_PII);
  if (plain || passwordSet || !prev) {
    const after = { ...(plain ? plain.after : {}), ...(passwordSet ? { passwordSet: true } : {}) };
    await write(ctx, { ...base, before: plain ? plain.before : null, after });
  }
  if (pay) await write(ctx, { ...base, before: pay.before, after: pay.after, sensitivity: 'pay' });
  if (pii) await write(ctx, { ...base, before: null, after: { changed: pii.changed }, sensitivity: 'pii' });
}
async function staffLock(ctx?, username?, locked?) {
  await write(ctx, {
    action: locked ? 'staff.lock' : 'staff.unlock',
    entityKind: 'staff',
    entityId: username,
    subject: username,
    after: { locked }
  });
}

// Số sửa phiếu: MỘT dòng cho mỗi ô đổi (cũ, mới), mức nhạy cảm pay
async function slipOverride(ctx?, username?, month?, before?, after?, reason?) {
  const keys = [...new Set<any>([...Object.keys(before), ...Object.keys(after)])].sort();
  let rows = 0;
  for (const key of keys) {
    const was = Object.hasOwn(before, key) ? before[key] : null,
      now = Object.hasOwn(after, key) ? after[key] : null;
    if (was === now) continue;
    await write(ctx, {
      action: 'slip.override',
      entityKind: 'slip_override',
      entityId: `${username}:${month}:${key}`,
      subject: username,
      month,
      before: { [key]: was },
      after: { [key]: now },
      reason: reason || null,
      sensitivity: 'pay'
    });
    rows++;
  }
  return rows;
}

// Dòng gửi ra ngoài (GET /api/audit): chỉ các trường đã có, không có gì thêm
const publicRow = (row?) => ({
  id: row.id,
  at: row.at,
  actor: row.actor,
  actorRoles: row.actorRoles,
  action: row.action,
  entityKind: row.entityKind,
  entityId: row.entityId,
  subject: row.subject,
  month: row.month,
  before: row.before,
  after: row.after,
  reason: row.reason,
  sensitivity: row.sensitivity,
  requestId: row.requestId
});

export = { context, write, pick, staffSaved, staffLock, slipOverride, publicRow };
