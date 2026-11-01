'use strict';
// Phần của src/domain/period/periods.ts: tóm tắt phiếu lỗi và phát hiện kỳ đã tính mà đầu vào hoặc tham số đã đổi.
const store = require('../../platform/db');
const paramsStore = require('../../params/store');
const service = require('../payroll/payroll-service');
const Params = require('../../engine/payroll-params');

// Phiếu lỗi của lần tính hiện hành gom theo mã: { code, count, message }. message là câu của lỗi đầu tiên (công thức hỏng ghi rõ "Công thức đã lưu không hợp lệ"),
// để màn kỳ lương nói thẳng nguyên nhân thay vì chỉ đếm số phiếu lỗi. Không mang tên hay số tiền.
function errorSummaryOf(slips?) {
  const byCode = new Map<any, any>();
  for (const r of slips) {
    if (r.status !== 'error') continue;
    const code = r.errorCode || 'CALC_ERROR';
    const have = byCode.get(code);
    if (have) have.count++;
    else byCode.set(code, { code, count: 1, message: r.errorDetail || null });
  }
  return [...byCode.values()];
}
// Kỳ đã tính mà đầu vào hoặc tham số ĐÃ ĐỔI sau lần tính hiện hành: so băm của lần chạy với băm tính mới từ dữ liệu hiện tại.
// Chỉ kỳ đã tính hoặc đã soát (còn tính lại được); kỳ đã duyệt, đã chi trả không bao giờ tính lại nên không bị đánh dấu.
//   inputs  điểm KPI, lịch, số sửa phiếu, hồ sơ, ngày lễ, công tắc đổi sau khi tính (băm lại với đúng thời điểm tính của lần chạy)
//   params  bộ tham số hiệu lực của tháng khác bộ đã chụp (ví dụ vừa mở lại kỳ rồi đổi cài đặt)
async function staleOf(month?, period?, run?) {
  const none = { stale: false, staleReasons: [] as any[] };
  if (!run || !['calculated', 'reviewed'].includes(period.status)) return none;
  const staleReasons: any[] = [];
  const current = await paramsStore.resolve(month);
  if (current.hash !== run.paramsHash) {
    // Bản phát hành thêm khoá mặc định mới làm băm đổi dù không giá trị nào đổi: chỉ tính khoá có trong bản chụp, hoặc khoá mới đã bị Admin đặt khác mặc định
    const snapshot = (await store.payroll.getRun(run.id, { params: true })).params || {};
    const same = (x?, y?) => Params.canonical(x) === Params.canonical(y);
    const moved = Object.keys({ ...snapshot, ...current.params }).some(key =>
      Object.hasOwn(snapshot, key)
        ? !same(snapshot[key], current.params[key])
        : Object.hasOwn(current.params, key) && !same(current.params[key], Params.DEFAULTS[key])
    );
    if (moved) staleReasons.push('params');
  }
  const asOf = run.switches && run.switches.asOf;
  if (run.inputsDigest && service.digestOf(await service.loadInputs(month, { asOf })) !== run.inputsDigest)
    staleReasons.push('inputs');
  return { stale: staleReasons.length > 0, staleReasons };
}

export = { errorSummaryOf, staleOf };
