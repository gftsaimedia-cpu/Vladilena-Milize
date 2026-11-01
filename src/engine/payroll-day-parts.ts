(function (root: any, factory: any) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PayrollDayParts = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // Chia tiền của MỘT dòng ngày (kết quả calcDay của src/engine/payroll-engine.ts) thành các thành phần có tên (partsOfDay) và bốn cột tiền của phiếu (columnsOfDay); DAY_VARIABLES và dayArraysOf là từ vựng và dữ liệu mảng theo ngày của công thức.
  // Thuần: chỉ đọc các trường của dòng ngày, không tham số, không I/O, không đồng hồ, không DOM.

  // Các thành phần có tên của một ngày (tổng khớp c.total đến sai số thực; tổng tháng lấy từ c.total, xem tongThanhPhanNgay)
  function partsOfDay(c?) {
    const holiday = c.kind === 'holiday';
    if (c.kind !== 'work' && !holiday)
      return { tienNgayCong: c.total, phuCapCa: 0, gioNghiDem: 0, lamBu: 0, tienOt: 0, tienLamLe: 0, ngayDiLam: 0 }; // nghỉ phép có lương, iSAT, các loại ngày không có tiền (0)
    return {
      tienNgayCong: holiday
        ? (c.holBase || 0) + (c.normalWorkH || 0) * c.hourly
        : c.daily - c.cut - ((c.holMainH ?? c.holWorkH) - (c.holMainBreakH || 0)) * c.hourly, // dòng không có holMainH: holWorkH chỉ là giờ ca chính
      phuCapCa: c.bonus || 0,
      gioNghiDem: c.breakPay || 0,
      lamBu: c.makeupPay || 0,
      tienOt: c.otPay || 0,
      tienLamLe: c.holWorkPay || 0,
      ngayDiLam: holiday && !(c.hours > 0) ? 0 : 1 // ngày lễ đi làm thật là ngày công
    };
  }
  // Bốn cột tiền của một dòng ngày trên phiếu (nguồn duy nhất cho phiếu A4 và thẻ Thu nhập), lấy từ các thành phần có tên ở trên:
  // luongNgay = tiền ngày công + giờ trừ (cột Trừ giờ hiện riêng); phuCapCa = phụ cấp ca + giờ nghỉ đêm; lamThem = làm bù + OT + OT ngày lễ.
  // Mỗi cột làm tròn đồng, phần lệch làm tròn dồn vào luongNgay để luongNgay + phuCapCa + lamThem − truGio = c.pay (số nguyên đồng của ngày), dòng cũ không có pay thì làm tròn của c.total.
  function columnsOfDay(c?) {
    const p = partsOfDay(c);
    const truGio = Math.round(c.kind === 'work' ? c.cut || 0 : 0); // dòng lễ không trừ giờ thiếu
    const phuCapCa = Math.round(p.phuCapCa + p.gioNghiDem);
    const lamThem = Math.round(p.lamBu + p.tienOt + p.tienLamLe);
    const thanhTien = Number.isFinite(c.pay) ? c.pay : Math.round(c.total); // pay: số nguyên đồng của ngày (apportion), cộng cả tháng đúng bằng dòng ngày của tháng
    return { luongNgay: thanhTien - phuCapCa - lamThem + truGio, phuCapCa, lamThem, truGio };
  }

  /* ---------- dòng tiền nguyên đồng của tháng ---------- */
  // Mỗi dòng tiền của phiếu làm tròn đồng MỘT lần từ số thực của tổng hợp tháng r (kết quả calcMonth, đã áp ghim nếu có); round là hàm làm tròn đồng của nơi gọi.
  // Tổng thu nhập, tổng phụ cấp và các tổng khác là tổng đúng của các dòng nguyên này, không làm tròn lại.
  //   workBase  lương ngày công trước khi trừ giờ thiếu = tiền cơ bản − tiền ngày nghỉ, lễ + tiền giờ thiếu
  //   leavePay, isatPay, holidayPay  tiền ngày nghỉ có lương, iSAT, lễ (cộng phần ô số lượng ghim đổi mà dòng ngày không đổi theo: r.pinAdjust)
  //   otPay  OT + giờ làm ngày lễ + giờ làm bù;  flexPay, nightPay  phụ cấp ca Flex, các ca còn lại;  breakPay  giờ nghỉ đêm;  lateCut  tiền giờ thiếu
  function linesOf(r?, round?) {
    const adj = r.pinAdjust || {};
    const rows = Array.isArray(r.rows) ? r.rows : [];
    const sum = (test?, pick?) => rows.reduce((s, row) => (test(row) ? s + (Number(pick(row)) || 0) : s), 0);
    return {
      workBase: round(r.basePay - r.off + r.cut),
      leavePay: round(
        sum(
          row => row.kind === 'leave',
          row => row.total
        ) + (adj.leavePay || 0)
      ),
      isatPay: round(
        sum(
          row => row.kind === 'isat',
          row => row.total
        ) + (adj.isatPay || 0)
      ),
      holidayPay: round(
        sum(
          row => row.kind === 'holiday',
          row => row.holBase
        ) + (adj.holidayPay || 0)
      ),
      otPay: round((r.otPay || 0) + (r.holWorkPay || 0) + (r.makeupPay || 0)),
      flexPay: round(
        sum(
          row => row.shift === 'flex',
          row => row.bonus
        )
      ),
      nightPay: round(
        sum(
          row => row.shift !== 'flex',
          row => row.bonus
        )
      ),
      breakPay: round(r.breakPay || 0),
      lateCut: round(Math.max(0, r.cut || 0))
    };
  }
  // Tiền ngày của tháng = các dòng nguyên đồng lấy từ ngày, trừ giờ thiếu
  const dayPayOf = (L?) =>
    L.workBase + L.leavePay + L.isatPay + L.holidayPay + L.otPay + L.flexPay + L.nightPay + L.breakPay - L.lateCut;
  // Chia số nguyên `target` cho các số thực xs: mỗi số lấy phần nguyên dưới, phần còn thiếu (hoặc thừa) chia từng đồng cho số có phần lẻ lớn nhất (nhỏ nhất)
  // trước, số 0 không nhận đồng nào; tổng kết quả đúng bằng target
  function apportion(xs?, target?) {
    const out = xs.map(x => Math.floor(x));
    let left = target - out.reduce((s, x) => s + x, 0);
    const order = xs
      .map((x, i) => ({ i, f: x - Math.floor(x), live: x !== 0 }))
      .filter(e => e.live)
      .sort((a: any, b: any) => b.f - a.f || a.i - b.i);
    if (!order.length) return out;
    for (let k = 0; left !== 0; k += 1) {
      const e = left > 0 ? order[k % order.length] : order[order.length - 1 - (k % order.length)];
      out[e.i] += left > 0 ? 1 : -1;
      left += left > 0 ? -1 : 1;
    }
    return out;
  }
  // Ghi pay (số nguyên đồng của ngày) vào mỗi dòng ngày: tổng pay các ngày đúng bằng target
  function payRows(rows?, target?) {
    const paid = apportion(
      rows.map(row => Number(row.total) || 0),
      target
    );
    rows.forEach((row, i) => {
      row.pay = paid[i];
    });
    return rows;
  }

  // Biến theo NGÀY cho "tổng theo ngày (…)": mỗi biến là một danh sách, mỗi dòng của lịch tháng (m.rows) một số, theo thứ tự ngày.
  // pick(dòng, thànhPhầnNgày) lấy từ dòng calcDay và các thành phần có tên của ngày (partsOfDay). Cộng theo ngày bằng "tổng theo ngày" cho đúng
  // từng bit số cộng dồn của calcMonth (cùng thứ tự ngày, cùng phép cộng).
  const dayVariable = (key?, label?, unit?, from?, pick?) => ({
    key,
    label,
    synonyms: [],
    kind: 'variable',
    unit,
    domain: 'day',
    from,
    pick
  });
  const DAY_VARIABLES = Object.freeze({
    tienTrongNgay: dayVariable('tienTrongNgay', 'Tiền công cả ngày', 'VND', 'rows[].total', row =>
      Number.isFinite(row.pay) ? row.pay : row.total || 0
    ),
    tienNgayCongNgay: dayVariable(
      'tienNgayCongNgay',
      'Tiền ngày công trong ngày',
      'VND',
      'rows[].parts.tienNgayCong',
      (row, parts) => parts.tienNgayCong
    ),
    phuCapCaNgay: dayVariable(
      'phuCapCaNgay',
      'Phụ cấp ca trong ngày',
      'VND',
      'rows[].parts.phuCapCa',
      (row, parts) => parts.phuCapCa
    ),
    gioNghiDemNgay: dayVariable(
      'gioNghiDemNgay',
      'Tiền giờ nghỉ đêm trong ngày',
      'VND',
      'rows[].parts.gioNghiDem',
      (row, parts) => parts.gioNghiDem
    ),
    lamBuNgay: dayVariable(
      'lamBuNgay',
      'Tiền làm bù trong ngày',
      'VND',
      'rows[].parts.lamBu',
      (row, parts) => parts.lamBu
    ),
    tienOtNgay: dayVariable(
      'tienOtNgay',
      'Tiền OT trong ngày',
      'VND',
      'rows[].parts.tienOt',
      (row, parts) => parts.tienOt
    ),
    tienLamLeNgay: dayVariable(
      'tienLamLeNgay',
      'Tiền làm ngày lễ trong ngày',
      'VND',
      'rows[].parts.tienLamLe',
      (row, parts) => parts.tienLamLe
    ),
    gioOtNgay: dayVariable('gioOtNgay', 'Giờ OT trong ngày', 'hour', 'rows[].otH', row => row.otH || 0),
    gioLamBuNgay: dayVariable(
      'gioLamBuNgay',
      'Giờ làm bù trong ngày',
      'hour',
      'rows[].makeupH',
      row => row.makeupH || 0
    ),
    gioLamLeNgay: dayVariable(
      'gioLamLeNgay',
      'Giờ làm ngày lễ trong ngày',
      'hour',
      'rows[].holWorkH',
      row => row.holWorkH || 0
    ),
    gioDemNgay: dayVariable(
      'gioDemNgay',
      'Giờ làm đêm trong ngày',
      'hour',
      'rows[].nightH (trừ giờ đêm ngày lễ)',
      row => Math.max(0, (row.nightH || 0) - (row.holMainNightH ?? row.holNightH ?? 0)) // dòng không có holMainNightH: holNightH chỉ của ca chính
    )
  });
  // Biến tiền theo ngày ↔ dòng tiền của tháng trong vết tính (trace): khi vết là số nguyên đồng, các số của từng ngày được chia lại
  // (apportion) để cộng cả tháng đúng bằng số của vết
  const TRACE_OF_DAY = {
    tienNgayCongNgay: 'tienNgayCong',
    phuCapCaNgay: 'phuCapCa',
    gioNghiDemNgay: 'gioNghiDem',
    lamBuNgay: 'lamBu',
    tienOtNgay: 'tienOt',
    tienLamLeNgay: 'tienLamLe'
  };
  // { <khoá>: [số mỗi ngày] } cho ctx.variables
  function dayArraysOf(rows?, trace?) {
    const out: Record<string, any> = {};
    for (const key of Object.keys(DAY_VARIABLES)) out[key] = [];
    for (const row of rows) {
      const parts = partsOfDay(row);
      for (const entry of Object.values(DAY_VARIABLES)) out[entry.key].push(entry.pick(row, parts));
    }
    for (const [key, traceKey] of Object.entries(TRACE_OF_DAY))
      if (trace && Number.isInteger(trace[traceKey])) out[key] = apportion(out[key], trace[traceKey]);
    return out;
  }

  return { partsOfDay, columnsOfDay, linesOf, dayPayOf, apportion, payRows, DAY_VARIABLES, dayArraysOf };
});
