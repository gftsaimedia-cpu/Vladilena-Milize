'use strict';
// Kiểm kê tĩnh các chỗ cảnh báo và các chỗ từ chối:
//   - mọi mã quy trình, nghiệp vụ (kỳ, tự duyệt, sàn luật tham số, ngày lễ) chỉ ghi cảnh báo qua `warnIf` của src/platform/warnings.ts, không `throw` thẳng;
//   - mọi mã nhóm K1 (bảo mật, quyền), K2 (định dạng, không tồn tại, trạng thái không thể) và K3 (chống ghi đè) KHÔNG BAO GIỜ đi qua `warnIf`.
// Dò mã nguồn (server.js và lib/**/*.js, trừ src/platform/warnings.ts), không chạy máy chủ. Chặn lùi: thêm một chỗ ném mã cảnh báo sẽ làm test này đỏ.
// Mã không phải HttpError có mã (câu lỗi trần của lịch ước tính) không kiểm được ở đây; chúng nằm trong test/api/warnings-cases.test.ts.
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const assert = require('node:assert/strict');

const ROOT = path.join(__dirname, '../..');
function sources() {
  const out = [path.join(ROOT, 'src/server.ts')];
  const walk = (dir?) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/.(js|ts)$/.test(entry.name) && path.basename(full) !== 'warnings.js') out.push(full);
    }
  };
  walk(path.join(ROOT, 'src'));
  return out.map(file => ({
    file: path.relative(ROOT, file).replaceAll('\\', '/'),
    text: fs.readFileSync(file, 'utf8')
  }));
}
const SOURCES = sources();

// Mã cảnh báo (kỳ, tự duyệt, sàn luật tham số, ngày lễ): phải đi qua warnIf
const WARN_CODES = [
  'PERIOD_NOT_READY',
  'PAYSLIP_STATE',
  'PAYSLIP_NEGATIVE_NET',
  'SELF_DECISION_FORBIDDEN',
  'APPROVAL_SELF',
  'EDIT_CREATOR_ONLY',
  'PARAM_CROSS_CHECK_FAILED',
  'PARAM_BELOW_LEGAL_FLOOR',
  'DUPLICATE_ENTRY',
  'LABEL_FORBIDDEN',
  'HOLIDAY_LEAVE_CONFLICT',
  'HOLIDAY_OT_CONFLICT'
];
// Kỳ đã chốt: cảnh báo PERIOD_LOCKED ở phần lớn chỗ ghi; riêng vài chỗ ném thẳng vì phiếu đã chốt không đổi được (tạm ứng)
const LOCKED_CODE = 'PERIOD_LOCKED';
// Lý do / ghi chú tuỳ chọn (optionalReason, bọc thành softReason trong src/platform/db.ts): thiếu thì lưu bình thường
// Ba cổng triển khai môi trường thật luôn từ chối; bật hay tắt bằng biến môi trường lúc triển khai
const DEPLOY_GATES = ['PARAMS_DEFAULTS_ONLY', 'SCHEDULE_EDIT_NOT_ALLOWED', 'SHIFT_EDIT_NOT_ALLOWED'];
// Chỗ ném thẳng mã cảnh báo nhưng thực chất là K2 (không có gì để làm): bỏ qua khi quét throw
const K2_THROWS = [
  { code: 'PERIOD_NOT_READY', text: /chưa có lần tính lương/i }, // chưa có lần tính hiện hành: không có phiếu để duyệt hay bỏ qua
  { code: 'PAYSLIP_STATE', text: /Chỉ trả lại phiếu/ }, // trả lại phiếu nháp hoặc phiếu lỗi: không có gì để trả
  { code: 'SELF_DECISION_FORBIDDEN', text: /Không được tự sửa các trường này/ } // đặt mật khẩu của chính mình qua hồ sơ (bảo mật)
];
// Mã nhóm K1, K2, K3: không bao giờ qua warnIf
const KEPT_CODES = [
  ...DEPLOY_GATES,
  'FORBIDDEN_CAP', // K1
  'NO_ROUTE_POLICY',
  'LAST_ADMIN',
  'SELF_ADMIN_REMOVAL',
  'USE_PASSWORD_RESET',
  'USE_OWN_PASSWORD',
  'ROLE_SELF_ESCALATION',
  'ROLE_CAP_RESERVED',
  'PAYSLIP_NOT_VISIBLE',
  'BAD_MONTH', // K2
  'BAD_TARGET',
  'PAYSLIP_NOT_FOUND',
  'PARAM_UNKNOWN_KEY',
  'PARAM_INVALID_VALUE',
  'PARAM_NOT_WIRED',
  'PARAM_OPTION_UNAVAILABLE',
  'PARAM_BATCH_TOO_LARGE',
  'PERIOD_STALE', // K3
  'SLIP_STALE',
  'PARAMS_STALE',
  'ROLE_STALE',
  'ROLE_REV_REQUIRED'
];

// Mã đứng đầu mỗi lời gọi warnIf(...)
const WARN_CALL = /\bwarnIf\(\s*(['"`])([A-Z][A-Z0-9_]*)\1/g;
function warnedCodes() {
  const found = new Map<any, any>();
  for (const { file, text } of SOURCES)
    for (const match of text.matchAll(WARN_CALL)) {
      if (!found.has(match[2])) found.set(match[2], new Set());
      found.get(match[2]).add(file);
    }
  return found;
}
// Văn bản của từng câu lệnh `throw ...;` (đếm ngoặc để không dừng ở dấu chấm phẩy trong hàm lồng)
function throwStatements(text?) {
  const out: any[] = [];
  for (const match of text.matchAll(/\bthrow\b/g)) {
    let depth = 0;
    let end = match.index;
    for (; end < text.length; end++) {
      const c = text[end];
      if ('([{'.includes(c)) depth++;
      else if (')]}'.includes(c)) {
        if (depth === 0) break;
        depth--;
      } else if (c === ';' && depth === 0) break;
    }
    out.push({ at: match.index, text: text.slice(match.index, end) });
  }
  return out;
}
const lineOf = (text?, index?) => text.slice(0, index).split('\n').length;

test('mọi mã cảnh báo quy trình và nghiệp vụ có ít nhất một lời gọi warnIf(<mã>, ...) trong server.js hoặc lib/', () => {
  const warned = warnedCodes();
  const missing = [...WARN_CODES, LOCKED_CODE].filter(code => !warned.has(code));
  assert.deepEqual(missing, [], `chưa đi qua warnIf: ${missing.join(', ')}`);
});

test('không còn câu lệnh throw nào ném thẳng mã cảnh báo (PERIOD_LOCKED của tạm ứng là chỗ duy nhất được ném)', () => {
  const direct: any[] = [];
  for (const { file, text } of SOURCES)
    for (const statement of throwStatements(text))
      for (const code of WARN_CODES)
        if (
          new RegExp(`['"\`]${code}['"\`]`).test(statement.text) &&
          !K2_THROWS.some(k2 => k2.code === code && k2.text.test(statement.text))
        )
          direct.push(`${file}:${lineOf(text, statement.at)} ${code}`);
  assert.deepEqual(direct, [], `còn ném thẳng:\n${direct.join('\n')}`);
  const locked: any[] = [];
  for (const { file, text } of SOURCES)
    for (const statement of throwStatements(text))
      if (new RegExp(`['"\`]${LOCKED_CODE}['"\`]`).test(statement.text)) locked.push(file);
  assert.deepEqual([...new Set<any>(locked)], ['src/modules/advance/advance-approvals.handlers.ts']);
});

test('K1/K2/K3: quyền, định dạng, trạng thái không thể và chống ghi đè không bao giờ đi qua warnIf (không biến thành cảnh báo)', () => {
  const warned = warnedCodes();
  const leaked = KEPT_CODES.filter(code => warned.has(code)).map(
    code => `${code} trong ${[...warned.get(code)].join(', ')}`
  );
  assert.deepEqual(leaked, [], `mã phải giữ từ chối nhưng đang qua warnIf:\n${leaked.join('\n')}`);
});

test('K1/K2/K3: các mã phải giữ từ chối vẫn còn được ném ở đâu đó trong mã (danh sách kiểm kê không lỗi thời)', () => {
  const all = SOURCES.map(s => s.text).join('\n');
  const gone = KEPT_CODES.filter(code => !new RegExp(`['"\`]${code}['"\`]`).test(all));
  assert.deepEqual(gone, [], `mã không còn trong mã nguồn (cập nhật danh sách?): ${gone.join(', ')}`);
});
