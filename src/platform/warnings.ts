'use strict';
// Cảnh báo: kiểm tra quy trình, nghiệp vụ chỉ ghi cảnh báo vào phản hồi, không chặn.
//
//   run(fn)                         mở một danh sách cảnh báo cho một yêu cầu HTTP (AsyncLocalStorage; server.js bật ở createServer)
//   warnIf(code, violated, opts)    MỌI kiểm tra về quy trình, nghiệp vụ đi qua đây. violated = điều kiện vi phạm. Ghi cảnh báo rồi chạy tiếp; trả true khi vi phạm.
//   warn(code, message, extra)      ghi một cảnh báo (không điều kiện)
//   scope({ label, details }, fn)   chạy fn (đồng bộ): cảnh báo ghi trong fn mở đầu bằng "<label>: " và mang thêm details (lô nhiều người: mỗi người một nhãn)
//   selfDecision(isSelf, {doing})   cảnh báo khi người thao tác tự làm việc về chính mình
//   take()                          các cảnh báo của yêu cầu hiện tại (src/platform/http.ts → send gộp vào phản hồi 2xx; yêu cầu lỗi thì bỏ)
//   optionalReason(value, opts)     lý do không bắt buộc: cắt khoảng trắng, quá dài thì lỗi 400
//
// Kiểm tra bảo mật, quyền, định dạng, không tồn tại, quá cỡ và chống ghi đè KHÔNG đi qua mô-đun này.
const { AsyncLocalStorage } = require('node:async_hooks');
const config = require('./config'); // lá của đồ thị require: không require ngược lên db hay http (test require-cycles)

// Lớp lỗi do src/platform/http.ts đưa vào lúc nạp (warnings.js không require src/platform/http để tránh vòng).
let HttpErrorClass: any = null;
const bindHttpError = (cls?) => {
  HttpErrorClass = cls;
};
const makeHttpError = (status?, message?, details?) => {
  if (HttpErrorClass) return new HttpErrorClass(status, message, details);
  return Object.assign(new Error(message), { status, details }); // chưa nạp src/platform/http (chỉ xảy ra khi dùng riêng mô-đun này)
};

const context = new AsyncLocalStorage();
// Trả đúng thứ fn trả (giá trị hoặc Promise): người gọi hàm async thì await, người gọi hàm thường nhận giá trị ngay
const run = (fn?) => context.run({ list: [], dropped: 0, scope: null }, fn);
// Trong scope() mọi cảnh báo mang tên người đang xử lý, nên cùng một cảnh báo của hai người là hai mục khác nhau
// fn đồng bộ: trả giá trị; fn async: trả Promise và trả nhãn cũ khi Promise xong.
function scope(who?, fn?) {
  const ctx = context.getStore();
  if (!ctx) return fn();
  const outer = ctx.scope;
  ctx.scope = who;
  const restore = () => {
    ctx.scope = outer;
  };
  let result;
  try {
    result = fn();
  } catch (error) {
    restore();
    throw error;
  }
  if (result && typeof result.then === 'function') return result.finally(restore);
  restore();
  return result;
}

// Một cảnh báo: { code, message, severity: 'warn' | 'danger', ...extra }. extra có thể là count, link, details (chỉ tháng, tên đăng nhập, số đếm; không dữ liệu nhập tay).
function warn(code?, message?, extra: any = {}) {
  const ctx = context.getStore();
  if (!ctx) return; // ngoài yêu cầu HTTP (script, test gọi thẳng): không có nơi nhận
  if (ctx.scope) {
    message = `${ctx.scope.label}: ${message}`;
    extra = { ...extra, details: { ...ctx.scope.details, ...extra.details } };
  }
  if (ctx.list.some(w => w.code === code && w.message === message)) return;
  if (ctx.list.length < config.WARN_MAX) ctx.list.push({ code, message, severity: 'warn', ...extra });
  else ctx.dropped++; // quá trần: không mất lặng lẽ, take() thêm một mục WARNINGS_TRUNCATED nêu số cảnh báo bị gộp
}

// warnIf(code, violated, { message, consequence, details, severity, count, link, quiet })
//   violated     đúng khi VI PHẠM
//   message      chuỗi hoặc hàm trả chuỗi (chỉ gọi khi vi phạm): câu tiếng Việt nói chuyện gì bất thường, bao nhiêu, hệ quả tiền
//   consequence  hệ quả cho tiền lương / bước sau, nối vào SAU message: cảnh báo = "<message>. <consequence>"
//   details      chi tiết đi kèm cảnh báo (tháng, ngày, tên đăng nhập, số đếm)
//   quiet        true: không ghi cảnh báo (chỉ trả true); dùng khi nơi khác đã ghi cảnh báo chi tiết hơn cho cùng việc
// Trả true khi vi phạm (đã ghi cảnh báo), false khi không.
function warnIf(code?, violated?, opts: any = {}) {
  if (!violated) return false;
  if (opts.quiet) return true;
  const say = (v?) => (typeof v === 'function' ? v() : v);
  const message = say(opts.message);
  const extra: Record<string, any> = {};
  if (opts.severity) extra.severity = opts.severity;
  if (opts.count !== undefined) extra.count = opts.count;
  if (opts.link) extra.link = opts.link;
  if (opts.details !== undefined) extra.details = opts.details;
  const text = opts.consequence ? `${String(message).replace(/[.:;,\s]+$/, '')}. ${say(opts.consequence)}` : message;
  warn(code, text, extra);
  return true;
}
// Tự làm việc về chính mình: chỉ cảnh báo (nhật ký ghi after.self = true, xem src/platform/audit.ts).
// doing: việc đang làm, ví dụ "duyệt phiếu lương".
function selfDecision(isSelf, { doing }: any) {
  return warnIf('SELF_DECISION_FORBIDDEN', isSelf, {
    message: `Bạn đang ${doing} của chính mình; việc này được ghi vào nhật ký là tự thực hiện. Số tiền không đổi vì việc này.`
  });
}

const take = () => {
  const ctx = context.getStore();
  if (!ctx) return [];
  return ctx.dropped
    ? [
        ...ctx.list,
        {
          code: 'WARNINGS_TRUNCATED',
          message: `Còn ${ctx.dropped} cảnh báo khác không hiện hết (một lần lưu chỉ hiện tối đa ${config.WARN_MAX} cảnh báo); xem nhật ký hoặc chia nhỏ lần lưu.`,
          severity: 'warn',
          count: ctx.dropped
        }
      ]
    : ctx.list.slice();
};
// Mã cảnh báo (không trùng) của yêu cầu hiện tại, để ghi vào nhật ký (after.warnings)
const codes = () => [...new Set<any>(take().map(w => w.code))].slice(0, config.WARN_CODES_AUDIT_MAX);

// Lý do không bắt buộc: nhận cả lý do rỗng hay ngắn. Trả chuỗi đã cắt khoảng trắng ('' khi không có), để cột NOT NULL lưu được.
// Quá max là lỗi dữ liệu. opts: { max, tooLong (hàm dựng lỗi hoặc chuỗi khi quá dài), code }
function optionalReason(value?, opts: any = {}) {
  const max = opts.max === undefined ? config.REASON_MAX : opts.max;
  const text = typeof value === 'string' ? value.trim() : '';
  if (max && text.length > max) {
    if (typeof opts.tooLong === 'function') throw opts.tooLong();
    throw makeHttpError(400, opts.tooLong || `Lý do tối đa ${max} ký tự`, { code: opts.code || 'REASON_REQUIRED' });
  }
  return text;
}

export = {
  run,
  warn,
  warnIf,
  scope,
  bindHttpError,
  selfDecision,
  take,
  codes,
  optionalReason
};
