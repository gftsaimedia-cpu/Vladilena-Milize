'use strict';
// Hai luật của "Soát dữ liệu trước khi chốt lương" cho khối phụ cấp thêm và số sửa phiếu.
// Tách khỏi review.js để review.js không phình quá trần cỡ file. Thuần: không I/O, không đồng hồ; chỉ đọc.
//
//   createRules({ monthPay, slipComparable, vndText }) → { RULES, RUNNERS }
//     monthPay(ctx, person)  kết quả lương cả tháng của một người theo chuỗi của app (review.js), null khi bộ máy báo lỗi
//     slipComparable         SLIP_COMPARABLE của review.js: ô phiếu → hàm lấy số tự tính
//     vndText(số)            chữ tiền "1.234.567 ₫"
//   RULES: mục danh mục theo khuôn của review.js (có thể có skipWhen(ctx) → lý do bỏ qua hoặc null); RUNNERS: id → ctx → [phát hiện]
const { blockDefsOf, requestedFlags, flagsConfirmed } = require('./positions.js');

// Ô thu nhập mà số sửa của Admin hay dùng để "cộng thêm" một khoản; chỉ ô có số tự tính ở SLIP_COMPARABLE
const ENTRY_LIKE_FIELDS = Object.freeze(['attendance', 'travel', 'kpiPay', 'otPay']);

function createRules({ monthPay, slipComparable, vndText }) {
  const RULES = [
    {
      id: 'block-flags-unconfirmed',
      severity: 'medium',
      scope: 'system',
      label: 'Khối phụ cấp có cờ thuế hoặc bảo hiểm chờ Kế toán xác nhận',
      fields: ['code', 'label', 'taxMode', 'insuranceBase'],
      thresholds: [],
      note: 'Khối do C&B thêm đề nghị miễn thuế hoặc tính vào nền bảo hiểm nhưng chưa có dấu xác nhận của Kế toán: bộ máy vẫn tính như chịu thuế và không vào nền bảo hiểm'
    },
    {
      id: 'override-looks-like-entry',
      severity: 'low',
      scope: 'person',
      label: 'Số sửa trên phiếu trông như một khoản cộng thêm',
      fields: ['fields'],
      thresholds: ['overrideEntryRoundVnd'],
      // Cần bộ máy lương để biết số tự tính; chỉ bỏ qua khi tháng này có số sửa mà thiếu bộ máy (không có số sửa thì không có gì để soát)
      skipWhen: ctx =>
        !ctx.payroll && ctx.slipOverrides.some(o => o && o.month === ctx.month)
          ? 'Chưa nạp được bộ máy tính lương nên luật cần số tiền không chạy'
          : null
    }
  ];

  const RUNNERS = {
    // Một phát hiện cho mỗi khối thêm có cờ thuế hoặc bảo hiểm chưa được Kế toán xác nhận (khối ngưng dùng thì bỏ qua)
    'block-flags-unconfirmed': ctx =>
      blockDefsOf(ctx.params)
        .filter(({ def }) => !def.deprecated && !flagsConfirmed(def))
        .flatMap(({ code, def }) => {
          const flags = requestedFlags(def);
          if (!flags) return [];
          const label = typeof def.label === 'string' && def.label ? def.label : code;
          const asked = [];
          if (flags.taxMode) asked.push(flags.taxMode === 'full' ? 'miễn thuế toàn bộ' : 'miễn thuế đến hạn mức');
          if (flags.insuranceBase) asked.push('tính vào nền bảo hiểm');
          return [
            {
              system: true,
              key: code,
              message: `Khối "${label}" đề nghị ${asked.join(' và ')} nhưng Kế toán chưa xác nhận: bảng lương vẫn tính như chịu thuế và không vào nền bảo hiểm. Nhờ Kế toán xác nhận trước khi chốt`,
              inputs: { code, label, taxMode: flags.taxMode, insuranceBase: flags.insuranceBase }
            }
          ];
        }),

    // Số Admin sửa trên phiếu cao hơn số tự tính đúng một số tròn: dấu hiệu của khoản cộng thêm, nên đi qua khoản điền thêm (có duyệt, nhật ký, thuế)
    'override-looks-like-entry'(ctx) {
      const hits = [];
      const unit = ctx.thresholds.overrideEntryRoundVnd.value;
      for (const override of ctx.slipOverrides) {
        if (!override || override.month !== ctx.month || !override.values) continue;
        const person = ctx.personBy.get(override.username);
        if (!person) continue;
        const m = monthPay(ctx, person);
        if (!m) continue;
        const fields = [];
        for (const key of ENTRY_LIKE_FIELDS) {
          if (!Object.hasOwn(override.values, key)) continue;
          const computed = Math.round(slipComparable[key](m) || 0);
          const value = Math.round(override.values[key]);
          const diff = value - computed;
          if (diff > 0 && diff % unit === 0) fields.push({ key, computed, override: value, diff });
        }
        if (!fields.length) continue;
        hits.push({
          username: person.username,
          message: `Phiếu lương có ${fields.length} ô Admin sửa tăng đúng một số tròn so với số tự tính (${fields.map(f => `${f.key} +${vndText(f.diff)}`).join(', ')}): trông như một khoản cộng thêm. Nếu đúng, nhập thành khoản điền thêm để có duyệt và nhật ký`,
          inputs: { fields }
        });
      }
      return hits;
    }
  };
  return { RULES, RUNNERS };
}

module.exports = { createRules, ENTRY_LIKE_FIELDS };
