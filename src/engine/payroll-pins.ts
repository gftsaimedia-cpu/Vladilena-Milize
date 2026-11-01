(function (root: any, factory: any) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PayrollPins = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // Ô SỐ LƯỢNG Admin sửa trên phiếu lương là ĐẦU VÀO GHIM của bộ máy: ghim ngày công, ngày nghỉ, giờ OT, điểm KPI... thì
  // các ô tiền phụ thuộc, bảo hiểm, thuế, thực nhận tính lại theo; ô tiền sửa thẳng giữ đúng số sửa (src/domain/payroll/slip-paid.ts). Thuần: không I/O, không đồng hồ, không DOM.
  // Bộ máy (src/engine/payroll-engine.ts → repinMonth) đổi các số tổng hợp của một bản chụp tháng theo ghim bằng apply() ở đây, rồi chạy lại phần tháng (finishMonth).
  // Mỗi thay đổi số lượng đi kèm tiền của chính nó theo đơn giá hiện có của bản chụp (lương một ngày, trung bình tiền một giờ OT đang có, hoặc giờ × hệ số khi chưa có giờ nào).
  // Chỉ bộ phương án mặc định (pay.method A) được hỗ trợ khi ghim: các phương án khác chưa dùng được (registry options.available = false).
  const DAY_KEYS = Object.freeze([
    'workDays',
    'leaveDays',
    'unpaidDays',
    'isatDays',
    'holidayDays',
    'ot15H',
    'ot20H',
    'ot30H',
    'debtH'
  ]);
  const KPI_PART_KEYS = Object.freeze({
    kpiBase: 'wework',
    kpiUser: 'user',
    kpiQltt: 'manager',
    kpiPeer: 'peer',
    kpiSelf: 'self'
  });
  const KPI_KEYS = Object.freeze(['kpiAmt', 'kpiPct', ...Object.keys(KPI_PART_KEYS)]);
  // Ô hiển thị không có đường tính trong bộ máy (nhận và lưu nhưng không đổi tiền): hiện không còn ô nào
  const IGNORED_KEYS = Object.freeze<string[]>([]);
  const SETTLE_KEY = 'settleDays';
  const KEYS = Object.freeze([...DAY_KEYS, ...KPI_KEYS, SETTLE_KEY, ...IGNORED_KEYS]);
  const finite = (value?) => typeof value === 'number' && Number.isFinite(value);

  // Các ghim hợp lệ của một bộ giá trị sửa phiếu (ô khác bị bỏ)
  function pinsOf(values?) {
    const out: Record<string, any> = {};
    if (values && typeof values === 'object')
      for (const key of KEYS) if (Object.hasOwn(values, key) && finite(values[key])) out[key] = values[key];
    return out;
  }
  // Có ghim nào làm đổi tiền hay không (ghim chỉ có ô bị bỏ qua thì bản chụp giữ nguyên)
  const hasEffect = (pins?) => Object.keys(pins).some(key => !IGNORED_KEYS.includes(key));

  // Đổi các số tổng hợp của r (kết quả tháng, bản sao) và parts (các thành phần ngày của vết) theo ghim ngày công, nghỉ, OT, nợ giờ.
  // u: đơn giá { daily, hourly, otRate, weekendRate, holidayRate, paidLeave, paidHoliday, isat, holidayDaysNow }
  // Trả adj: phần tiền và số ngày nằm ở các dòng ngày (rows) mà ghim đổi nhưng rows không đổi theo { leavePay, isatPay, holidayPay, holidayDays } (chỉ khoá khác 0)
  function apply(r?, parts?, pins?, u?) {
    const adj = { leavePay: 0, isatPay: 0, holidayPay: 0, holidayDays: 0 };
    const has = (key?) => Object.hasOwn(pins, key);
    const atLeast0 = (value?) => Math.max(0, value);
    // tiền của số ngày/giờ đổi: vào tổng thành phần ngày (r.work), tiền lương cơ bản (r.basePay) và vết
    const dayPay = (amount?, { off = 0, base = 0 }: any = {}) => {
      r.work += amount;
      r.basePay += amount;
      r.off += off;
      r.base += base;
      parts.tienNgayCong += amount;
    };
    if (has('workDays')) {
      // ô Ngày công của phiếu = ngày đi làm thực tế, không gồm ngày nghỉ sẽ làm bù (cùng cách đếm với src/domain/payroll/slip-paid.ts → cellsOf)
      const count = atLeast0(pins.workDays);
      const delta = count - r.count;
      r.count = count;
      if (typeof r.paidDays === 'number') r.paidDays = atLeast0(r.paidDays + delta); // ngày công ghim là ngày có lương
      dayPay(delta * u.daily, { base: delta * u.daily });
      parts.ngayDiLam += delta;
    }
    if (has('leaveDays')) {
      const count = atLeast0(pins.leaveDays);
      const money = (count - r.leave) * (u.paidLeave ? u.daily : 0);
      if (typeof r.paidDays === 'number' && u.paidLeave) r.paidDays = atLeast0(r.paidDays + count - r.leave);
      r.leave = count;
      adj.leavePay += money;
      dayPay(money, { off: money });
    }
    if (has('isatDays')) {
      const count = atLeast0(pins.isatDays);
      const money = (count - r.isat) * (u.isat ? u.daily : 0);
      if (typeof r.paidDays === 'number' && u.isat) r.paidDays = atLeast0(r.paidDays + count - r.isat);
      r.isat = count;
      adj.isatPay += money;
      dayPay(money, { off: money });
    }
    if (has('holidayDays')) {
      const count = atLeast0(r.holiday + pins.holidayDays - u.holidayDaysNow);
      const money = (count - r.holiday) * (u.paidHoliday ? u.daily : 0);
      if (typeof r.paidDays === 'number' && u.paidHoliday) r.paidDays = atLeast0(r.paidDays + count - r.holiday);
      adj.holidayDays += pins.holidayDays - u.holidayDaysNow;
      adj.holidayPay += money;
      r.holiday = count;
      dayPay(money, { off: money });
    }
    if (has('unpaidDays')) r.unpaid = atLeast0(pins.unpaidDays - r.approved - r.noshow); // nghỉ không lương không có tiền (pay.method A)
    // Giờ OT trên phiếu có ba loại: ot15H = OT trả theo ot.rate (ngày thường), ot20H = OT trả theo ot.weekendRate (cuối tuần ngoài lịch), ot30H = OT ngày lễ.
    // Ghim đổi số giờ của một loại theo đơn giá trung bình hiện có của loại đó; otHours và otPay là tổng của hai loại ngày thường.
    // otHolHours, otHolPay: chỉ có ở bản chụp của bộ máy cũ (OT ngày lễ tách riêng).
    const pinOt = (pin?, now?, pay?, rate?, onDelta?) => {
      const delta = Math.max(pin - now, -now);
      const money = delta * (now > 0 ? pay / now : u.hourly * rate);
      r.otHours += delta;
      r.otPay += money;
      r.work += money;
      parts.tienOt += money;
      onDelta(delta, money);
    };
    if (has('ot15H')) {
      const now = r.otHours - (r.otWeekendHours || 0) - (r.otHolHours || 0);
      const pay = r.otPay - (r.otWeekendPay || 0) - (r.otHolPay || 0);
      pinOt(pins.ot15H, now, pay, u.otRate, (delta, money) => {
        if (r.otWeekdayPay !== undefined) r.otWeekdayPay += money;
      });
    }
    if (has('ot20H')) {
      pinOt(pins.ot20H, r.otWeekendHours || 0, r.otWeekendPay || 0, u.weekendRate, (delta, money) => {
        r.otWeekendHours = (r.otWeekendHours || 0) + delta;
        r.otWeekendPay = (r.otWeekendPay || 0) + money;
      });
    }
    if (has('ot30H')) {
      const now = r.holWorkHours + (r.otHolHours || 0);
      const delta = Math.max(pins.ot30H - now, -r.holWorkHours);
      const unit = now > 0 ? (r.holWorkPay + (r.otHolPay || 0)) / now : u.hourly * u.holidayRate;
      r.holWorkHours += delta;
      r.holWorkPay += delta * unit;
      r.work += delta * unit;
      parts.tienLamLe += delta * unit;
    }
    if (has('debtH')) r.debt = atLeast0(pins.debtH);
    return Object.fromEntries(Object.entries(adj).filter(([, value]: any) => value !== 0));
  }

  // Đầu vào KPI của tháng dựng lại từ bản chụp r rồi chồng ghim KPI lên (cùng hình kpiPct của calcMonth). Không có ghim KPI thì trả đúng đầu vào gốc.
  function kpiInput(r?, pins?) {
    const has = (key?) => Object.hasOwn(pins, key);
    if (r.kpiMethod === 'five') {
      const parts: Record<string, any> = { ...(r.kpiParts || {}) };
      for (const [key, part] of Object.entries(KPI_PART_KEYS)) if (has(key)) parts[part] = pins[key];
      return {
        method: 'five',
        parts,
        pct: r.kpiSelfPct,
        amt: r.kpiSelfAmt,
        admPct: null,
        admAmt: has('kpiAmt') ? pins.kpiAmt : r.kpiAmt,
        totalPct: has('kpiPct') ? pins.kpiPct : null
      };
    }
    // tháng chưa tính KPI 5 thành phần: % Admin duyệt thay cho % tự đánh giá; ghim mức KPI cũng coi là Admin đã duyệt
    const touched = has('kpiPct') || has('kpiAmt');
    const approved = r.kpiApproved || touched;
    return {
      pct: r.kpiSelfPct,
      amt: r.kpiSelfAmt,
      admPct: approved ? (has('kpiPct') ? pins.kpiPct : r.kpiPct) : null,
      admAmt: approved ? (has('kpiAmt') ? pins.kpiAmt : r.kpiAmt) : null
    };
  }

  return { KEYS, DAY_KEYS, KPI_KEYS, KPI_PART_KEYS, IGNORED_KEYS, pinsOf, hasEffect, apply, kpiInput };
});
