/* Quy tắc phép năm — dùng chung cho trình duyệt (window.LeaveRules) và máy chủ (require('./src/engine/leave')).
   Căn cứ Bộ luật Lao động 45/2019/QH14 Điều 113, 114; Nghị định 145/2020/NĐ-CP Điều 65:
   · 1 ngày mỗi tháng làm việc tròn, tính từ ngày vào làm, KỂ CẢ thời gian thử việc; ngày vào làm không cộng thêm (leave.accrual.start = 0)
   · +1 ngày mỗi leave.seniority.stepYears năm tròn (thâm niên); tròn một năm không cộng riêng
   · +1 ngày vào sinh nhật hằng năm, CHỈ cấp Nhân viên (type nv), theo iFourteen của quy chế phúc lợi
     ("từ cấp Nhân viên trở lên"); CTV không có ngày sinh nhật
   · cộng thêm "điều chỉnh phép" do Admin nhập (một số không gắn ngày, có thể âm): là số mở đầu của quỹ phép đầu tiên hệ thống quản lý của người đó
   · mỗi năm dương lịch N là một quỹ phép riêng = phép được cộng trong năm N; quỹ N hết hạn vào cuối tháng leave.expiry.month của năm N+1 (mặc định tháng 1),
     phần chưa dùng (dùng quỹ cũ trước, kể cả ngày nghỉ tháng 1 năm N+1 tới ngày hết hạn) được quy tiền vào phiếu lương của tháng liền sau (settlementFor)
     rồi trừ khỏi số dư. leave.expiry.month = 0 thì phép không hết hạn;
   · phép cộng trước năm leave.expiry.fromYear không tính vào quỹ nào: không nằm trong số dư, phép hết hạn hay tiền quy đổi; ngày nghỉ phép trước 01/01 của năm đó cũng không trừ.
     Quỹ đầu tiên của một người là năm max(năm vào làm, leave.expiry.fromYear); số dư hiện tại chỉ gồm các quỹ đang mở.
   Ngày dạng 'YYYY-MM-DD'; so sánh chuỗi được vì cùng định dạng. */
(function (root: any) {
  // payroll-params.js phải nạp trước trang (trình duyệt) để mô-đun lấy mặc định từ DEFAULTS; vắng thì dùng FALLBACK.
  const PayrollParams =
    typeof module !== 'undefined' && module.exports ? require('./payroll-params') : root.PayrollParams;
  // Số ngày cộng cho mỗi sự kiện đọc từ bộ tham số phẳng `params` qua create(params); hàm trần của mô-đun = create(mặc định), mặc định
  // là PayrollParams.DEFAULTS. FALLBACK là bản chép của đúng các khoá mô-đun này đọc, để trang chưa nạp payroll-params.js
  // vẫn chạy. Phải bằng PayrollParams.DEFAULTS (scripts/params/check-fallbacks.ts kiểm).
  const FALLBACK = Object.freeze({
    'leave.accrual.start': 0, // ngày vào làm không cộng thêm
    'leave.accrual.perMonth': 1, // mỗi tháng làm việc tròn
    'leave.accrual.birthday': 1, // mỗi sinh nhật
    'leave.seniority.stepYears': 5, // thâm niên: +1 ngày mỗi 5 năm tròn
    'leave.expiry.month': 1, // phép tích luỹ tới 31/12 năm N hết hạn cuối tháng 1 năm N+1 (0 = không hết hạn)
    'leave.expiry.fromYear': 2026 // năm của quỹ phép đầu tiên: phép cộng trước năm này không tính
  });
  const NV_TYPE = 'nv'; // chỉ cấp Nhân viên có ngày sinh nhật
  const MONTHS_PER_YEAR = 12; // đơn vị lịch, không phải tham số nghiệp vụ
  const pad = (n?) => String(n).padStart(2, '0');
  const daysIn = (y?, m?) => new Date(y, m, 0).getDate();
  const iso = (y?, m?, d?) => `${y}-${pad(m)}-${pad(Math.min(d, daysIn(y, m)))}`; // ngày 31 / 29-02 không có thì lùi về ngày cuối tháng
  const parts = (s?) => s.split('-').map(Number);
  // Số tháng tròn kể từ ngày vào làm tới hết ngày upTo: tháng tròn thứ k vào ngày vào làm cộng k tháng, lùi về cuối tháng nếu tháng đó ngắn hơn
  function fullMonths(start?, upTo?) {
    const [sy, sm, sd] = parts(start);
    let n = 0;
    for (let k = 1; ; k++) {
      const t = new Date(sy, sm - 1 + k, 1);
      if (iso(t.getFullYear(), t.getMonth() + 1, sd) > upTo) break;
      n++;
    }
    return n;
  }

  // Bộ tham số phẳng → các hàm. Khoá vắng là lỗi (không đoán giá trị).
  function build(P?) {
    const need = (key?) => {
      if (!Object.hasOwn(P, key))
        throw Object.assign(new Error(`Thiếu tham số ${key}`), { code: 'PARAM_MISSING', key });
      return P[key];
    };
    const START_DAYS = need('leave.accrual.start');
    const MONTH_DAYS = need('leave.accrual.perMonth');
    const BIRTHDAY_DAYS = need('leave.accrual.birthday');
    const STEP_YEARS = need('leave.seniority.stepYears');
    const EXPIRY_MONTH = need('leave.expiry.month');
    const EXPIRY_FROM_YEAR = need('leave.expiry.fromYear');

    // Số ngày phép đã được cộng tính đến hết ngày upTo. start / adjust / total tính bằng ngày; months, seniority và birthdays là SỐ LẦN cộng
    // (tháng và sinh nhật cộng đúng tham số tương ứng; thâm niên cộng 1 ngày mỗi lần).
    function accrued(staff?, upTo?) {
      const adjust = Number(staff.leaveAdjust) || 0;
      const start = staff.startDate;
      if (!start || upTo < start) return { start: 0, months: 0, seniority: 0, birthdays: 0, adjust, total: adjust };
      const [sy] = parts(start);
      const months = fullMonths(start, upTo);
      const years = Math.floor(months / MONTHS_PER_YEAR); // năm tròn = 12 tháng tròn (cùng mốc, kể cả 29/02)
      const seniority = STEP_YEARS > 0 ? Math.floor(years / STEP_YEARS) : 0;
      // Ngày sinh nhật chỉ cho cấp Nhân viên (type nv) như iFourteen của quy chế phúc lợi; loại khác không có ngày này.
      let birthdays = 0;
      if (staff.type === NV_TYPE && staff.birthday) {
        const [, bm, bd] = parts(staff.birthday),
          uy = Number(upTo.slice(0, 4));
        for (let y = sy; y <= uy; y++) {
          const b = iso(y, bm, bd);
          if (b >= start && b <= upTo) birthdays++;
        }
      }
      return {
        start: START_DAYS,
        months,
        seniority,
        birthdays,
        adjust,
        total: START_DAYS + months * MONTH_DAYS + seniority + birthdays * BIRTHDAY_DAYS + adjust
      };
    }

    // Ngày cuối cùng còn dùng được của phép tích luỹ tới 31/12 năm `year`: cuối tháng leave.expiry.month của năm sau
    const expiryOf = (year?) => iso(year + 1, EXPIRY_MONTH, daysIn(year + 1, EXPIRY_MONTH));
    // Tháng liền sau tháng chứa ngày `date` ('YYYY-MM')
    const monthAfter = (date?) => {
      const [y, m] = parts(date);
      return m === MONTHS_PER_YEAR ? `${y + 1}-01` : `${y}-${pad(m + 1)}`;
    };
    // Năm của quỹ phép đầu tiên của người này = max(năm vào làm, leave.expiry.fromYear); không hết hạn / không ngày vào làm thì null.
    // Phép cộng ở các năm trước năm đó không nằm trong số dư, phép hết hạn hay tiền quy đổi.
    const firstYearOf = (staff?) =>
      EXPIRY_MONTH >= 1 && staff.startDate ? Math.max(parts(staff.startDate)[0], EXPIRY_FROM_YEAR) : null;
    // Phép được tính tới hết ngày upTo: accrued trừ phần tích luỹ tới 31/12 của năm liền trước quỹ đầu tiên
    // (ngày vào làm vẫn dùng để đếm tháng tròn, thâm niên, sinh nhật). Điều chỉnh phép của Admin là số mở đầu
    // của quỹ đầu tiên nên luôn được giữ nguyên. Cùng các trường như accrued.
    function counted(staff?, upTo?) {
      const got = accrued(staff, upTo);
      const first = firstYearOf(staff);
      if (first === null || first <= parts(staff.startDate)[0]) return got;
      const base = `${first - 1}-12-31`;
      const before = accrued(staff, base);
      const cut = upTo > base ? key => got[key] - before[key] : () => 0;
      const out: Record<string, any> = {
        start: cut('start'),
        months: cut('months'),
        seniority: cut('seniority'),
        birthdays: cut('birthdays'),
        adjust: got.adjust
      };
      // tổng = phần tích luỹ trong các năm được quản lý (hiệu hai mốc đã gồm điều chỉnh ở cả hai nên điều chỉnh tự triệt tiêu) + điều chỉnh một lần
      out.total = cut('total') + got.adjust;
      return out;
    }
    // Sổ phép tới hết ngày upTo. leaveDays: các ngày thực sự trừ phép (mọi tháng; ngày sau upTo hoặc trước 01/01 của năm quỹ đầu tiên không tính).
    // Mỗi năm N (từ năm quỹ đầu tiên) có một quỹ phép = phép tích luỹ trong năm N (cộng điều chỉnh phép nếu là năm đầu tiên);
    // dùng phép cũ trước: quỹ N còn lại khi hết hạn = tích luỹ tới 31/12 năm N − phần đã hết hạn trước đó − số ngày phép đã dùng tới ngày hết hạn (không âm).
    // Trả { ...counted, used, expired, settled: [{ year, on, days }], balance, expiring: { days, on } | null }, balance = total − used − expired.
    //   expiring chỉ có trong khoảng từ 01/01 năm N+1 tới ngày hết hạn, khi còn ngày sắp hết hạn
    function ledger(staff?, leaveDays?, upTo?) {
      const got = counted(staff, upTo);
      const first = firstYearOf(staff);
      const from = first === null ? '' : `${first}-01-01`;
      const dates = [...leaveDays].sort().filter(d => d >= from);
      const usedBy = (date?) => dates.filter(d => d <= date).length;
      let expired = 0,
        expiring: any = null;
      const settled: any[] = [];
      if (first !== null) {
        for (let y = first; `${y}-12-31` < upTo; y++) {
          const on = expiryOf(y);
          const pool = counted(staff, `${y}-12-31`).total - expired;
          if (on < upTo) {
            const days = Math.max(0, pool - usedBy(on));
            settled.push({ year: y, on, days });
            expired += days;
          } else {
            const days = Math.max(0, pool - usedBy(upTo));
            if (days > 0) expiring = { days, on };
            break;
          }
        }
      }
      const used = usedBy(upTo);
      return { ...got, used, expired, settled, balance: got.total - used - expired, expiring };
    }
    // Số ngày phép dư quy tiền vào phiếu lương tháng `month` ('YYYY-MM'): phần hết hạn của năm có ngày hết hạn nằm ở tháng liền trước tháng này
    function settlementFor(staff?, leaveDays?, month?) {
      if (EXPIRY_MONTH < 1 || !staff.startDate) return 0;
      const end = iso(
        Number(month.slice(0, 4)),
        Number(month.slice(5)),
        daysIn(Number(month.slice(0, 4)), Number(month.slice(5)))
      );
      return ledger(staff, leaveDays, end)
        .settled.filter(item => monthAfter(item.on) === month)
        .reduce((sum, item) => sum + item.days, 0);
    }

    return { accrued, counted, ledger, settlementFor };
  }

  // Một bộ tham số → một bản mô-đun (nhớ theo đối tượng)
  const built = new WeakMap<any, any>();
  function create(params?) {
    if (!params || typeof params !== 'object')
      throw new TypeError('create(params): cần bộ tham số phẳng (PayrollParams.DEFAULTS)');
    if (!built.has(params)) built.set(params, Object.freeze({ ...build(params), FALLBACK, create }));
    return built.get(params);
  }
  // Mặc định: PayrollParams.DEFAULTS (hàm trần của mô-đun = create(mặc định)); vắng payroll-params.js thì FALLBACK
  const api = create(PayrollParams && PayrollParams.DEFAULTS ? PayrollParams.DEFAULTS : FALLBACK);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LeaveRules = api;
})(this);

/* Tự kiểm tra: node src/engine/leave.ts */
if (typeof require !== 'undefined' && require.main === module) {
  const assert = require('node:assert');
  const { accrued, ledger, settlementFor } = module.exports;
  const s = { startDate: '2026-03-15', birthday: '1999-07-20', leaveAdjust: 0, type: 'nv' };
  assert.equal(accrued(s, '2026-03-14').total, 0); // chưa đi làm
  assert.equal(accrued(s, '2026-03-15').total, 0); // ngày đầu đi làm: chưa cộng
  assert.equal(accrued(s, '2026-04-14').total, 0); // chưa tròn tháng
  assert.equal(accrued(s, '2026-04-15').total, 1); // tròn 1 tháng
  assert.equal(accrued(s, '2026-07-20').total, 5); // 4 tháng + sinh nhật
  assert.equal(accrued({ ...s, type: 'ctv' }, '2026-07-20').total, 4); // CTV không có ngày sinh nhật
  assert.equal(accrued(s, '2027-03-15').total, 12 + 1 + 1); // tròn 1 năm: 12 tháng + 1 năm Nhân viên + sinh nhật 2026
  assert.equal(accrued({ startDate: '2026-01-31' }, '2026-02-28').months, 1); // 31/01 → tròn tháng 28/02
  assert.equal(accrued({ startDate: '2026-01-31' }, '2026-03-30').months, 1); // tròn tháng 2 là 31/03
  assert.equal(accrued({ startDate: '2026-05-01', birthday: '2000-02-29', type: 'nv' }, '2027-02-28').birthdays, 1); // 29/02 năm không nhuận → 28/02
  assert.equal(accrued({ startDate: '2026-08-01', birthday: '1990-03-10', type: 'nv' }, '2026-12-31').birthdays, 0); // sinh nhật trước ngày vào làm không tính
  assert.equal(accrued({ leaveAdjust: 3 }, '2026-10-06').total, 3); // chưa có ngày vào làm: chỉ số điều chỉnh
  assert.equal(accrued({ startDate: '2021-06-10', type: 'ctv' }, '2026-06-10').total, 61); // 60 tháng + 1 thâm niên
  assert.equal(accrued({ startDate: '2021-06-10', type: 'nv' }, '2026-06-10').total, 66); // + 5 năm Nhân viên
  // Chỉ phép cộng từ năm leave.expiry.fromYear (2026) mới nằm trong sổ: người vào làm 05/01/2025 có quỹ 2026 = 12 tháng (05/01–05/12/2026)
  const old = { startDate: '2025-01-05', type: 'ctv' };
  assert.equal(ledger(old, ['2026-12-02', '2026-12-03', '2027-01-06', '2027-01-07'], '2027-01-30').expiring.days, 8);
  assert.equal(ledger(old, [], '2027-02-02').balance, 1); // 13 − 12 hết hạn
  assert.equal(settlementFor(old, [], '2027-02'), 12);
  // Vào làm 10/06/2021: phép cộng trước 2026 không tính; quỹ 2026 = 12 tháng + năm Nhân viên + sinh nhật + thâm niên 5 năm = 15
  const p08 = { startDate: '2021-06-10', birthday: '1990-01-01', type: 'nv' };
  const jan = [4, 5, 6, 7, 8, 11, 12, 13, 14, 15].map(d => '2027-01-' + String(d).padStart(2, '0')); // 10 ngày làm việc
  assert.equal(ledger(p08, jan, '2027-01-30').expiring.days, 5);
  assert.equal(settlementFor(p08, jan, '2027-02'), 5);
  assert.equal(settlementFor({ ...p08, leaveAdjust: -8 }, jan, '2027-02'), 0); // điều chỉnh âm thuộc quỹ 2026: 15 − 8 − 10 < 0
  assert.equal(ledger({ startDate: '2027-01-10', type: 'ctv' }, [], '2027-03-01').settled.length, 0); // vào làm 2027: chưa có quỹ 2026
  console.log('leave.js: OK');
}
