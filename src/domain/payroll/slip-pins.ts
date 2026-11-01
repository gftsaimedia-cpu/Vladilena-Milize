'use strict';
// Ô số lượng Admin ghim trên phiếu: tính lại bản chụp theo ghim bằng bộ máy lương (src/engine/payroll-engine.ts → repin), từ CHÍNH bản chụp
// và bộ tham số của lần tính (không đọc lại lịch, Check-in/out), nên số luôn khớp bản chụp dù dữ liệu đầu vào đã đổi sau đó. Chỉ đọc, không ghi DB.
// Phiếu ước tính, phiếu của lần tính nháp và phiếu đã chốt đều đi qua đây với cùng một phép tính; ô tiền sửa thẳng áp SAU (src/domain/payroll/slip-paid.ts → paidFigures).
const Pins = require('../../engine/payroll-pins');
const service = require('./payroll-service');

// Bản chụp đã tính lại theo ghim trong `values` (số Admin đã sửa của phiếu), hoặc null khi không có ghim nào làm đổi tiền hay phiếu không tính lại được.
// snapshot: bản chụp (m kèm trace); terms: hồ sơ đã chụp (staffTerms); params: bộ tham số của lần tính; month: 'YYYY-MM'.
function repinned(snapshot?, terms?, values?, params?, month?) {
  const pins = Pins.pinsOf(values);
  if (!Pins.hasEffect(pins) || !snapshot || !terms || !params) return null;
  try {
    const m = service.engineFor(params).repin(snapshot, terms, pins, month);
    return m ? { ...m, trace: m.trace } : null;
  } catch {
    return null; // bản chụp hay hồ sơ hỏng: giữ bản chụp gốc, các ô tiền sửa tay vẫn áp lên bản gốc
  }
}

// Có ghim nào làm đổi tiền trong số Admin đã sửa của phiếu không (rẻ: không đọc bản chụp)
const hasPins = (values?) => Pins.hasEffect(Pins.pinsOf(values));

export = { repinned, hasPins };
