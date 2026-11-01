(function (root: any, factory: any) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PayEntriesCalc = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // Phép tính thuần của "khoản điền thêm". Dùng chung trình duyệt và máy chủ:
  // bộ máy tính lương (src/engine/payroll-engine.ts) gọi sums() ở đúng một chỗ, không I/O, không đồng hồ, không con số nào ngoài 0 và 1.
  // Một khoản gửi vào bộ máy có dạng (chỉ khoản ĐÃ DUYỆT, máy chủ nạp ở src/domain/payroll/payroll-service.ts → loadInputs):
  //   { id, direction: 'add'|'deduct', amount (đồng nguyên > 0), label, slipLine?, taxMode?: 'none'|'full'|'cap', taxCap?, insuranceBase?, flagsConfirmedBy? }
  // Quy tắc:
  //   khoản cộng  vào tổng thu nhập (chịu thuế); riêng khoản có cờ miễn thuế ĐÃ xác nhận (flagsConfirmedBy khác rỗng) thì phần miễn
  //               ('full' = cả khoản, 'cap' = tới hạn mức taxCap) đi vào khoản miễn thuế. Chưa xác nhận: chịu thuế như thường.
  //   nền bảo hiểm cộng thêm insuranceBase của khoản cộng đã xác nhận cờ, CHỈ khi nơi gọi báo insuranceFlagged (insurance.base = withFlaggedAllowances)
  //   khoản trừ   trừ SAU thuế khỏi thực lĩnh; không giảm thu nhập chịu thuế, bảo hiểm hay thuế
  const DIRECTIONS = Object.freeze(['add', 'deduct']);
  const TAX_MODES = Object.freeze(['none', 'full', 'cap']);

  function entryError(message?) {
    return Object.assign(new Error(message), { code: 'PAYROLL_BAD_ENTRY' });
  }
  const isMoney = (value?) => Number.isSafeInteger(value) && value > 0;
  const isMoneyOrZero = (value?) => Number.isSafeInteger(value) && value >= 0;
  const confirmed = (entry?) => typeof entry.flagsConfirmedBy === 'string' && entry.flagsConfirmedBy !== '';

  // Phần của khoản miễn thuế (0 nếu không có cờ, chưa xác nhận, hoặc là khoản trừ)
  function exemptOf(entry?) {
    if (entry.direction !== 'add' || !confirmed(entry)) return 0;
    if (entry.taxMode === 'full') return entry.amount;
    if (entry.taxMode === 'cap') return Math.min(entry.amount, isMoneyOrZero(entry.taxCap) ? entry.taxCap : 0);
    return 0;
  }
  // Phần đi vào nền bảo hiểm (chỉ khi nơi gọi bật nền có cờ)
  function insuranceBaseOf(entry?, insuranceFlagged?) {
    if (!insuranceFlagged || entry.direction !== 'add' || !confirmed(entry)) return 0;
    return isMoneyOrZero(entry.insuranceBase) ? entry.insuranceBase : 0;
  }

  // Tổng hợp một danh sách khoản. Dữ liệu sai dạng ném PAYROLL_BAD_ENTRY (phiếu của người đó thành "lỗi", không tính ra số lạ âm thầm).
  // Trả { add, deduct, exempt, insuranceBase }, đều là số nguyên không âm.
  function sums(entries?, { insuranceFlagged = false }: any = {}) {
    const out = { add: 0, deduct: 0, exempt: 0, insuranceBase: 0 };
    for (const entry of entries || []) {
      if (!entry || !DIRECTIONS.includes(entry.direction)) throw entryError('Khoản điền thêm có hướng không hợp lệ');
      if (!isMoney(entry.amount)) throw entryError('Số tiền khoản điền thêm phải là số nguyên đồng lớn hơn 0');
      if (entry.taxMode != null && !TAX_MODES.includes(entry.taxMode))
        throw entryError('Cờ thuế của khoản điền thêm không hợp lệ');
      out[entry.direction] += entry.amount;
      out.exempt += exemptOf(entry);
      out.insuranceBase += insuranceBaseOf(entry, insuranceFlagged);
    }
    return out;
  }

  // Bản sao chỉ gồm các trường bộ máy cần (không lý do, không người lập): đây là phần đi vào m.entries và bản chụp phiếu
  const pick = (entry?) => ({
    id: entry.id,
    direction: entry.direction,
    amount: entry.amount,
    label: entry.label,
    slipLine: entry.slipLine ?? null,
    taxMode: entry.taxMode ?? null,
    taxCap: entry.taxCap ?? null,
    insuranceBase: entry.insuranceBase ?? null,
    flagsConfirmedBy: entry.flagsConfirmedBy ?? null
  });
  const list = (entries?) => (entries || []).map(pick);

  // Hai cửa của bộ máy (src/engine/payroll-engine.ts): giữ phần của bộ máy nhỏ, mọi quy tắc nằm ở đây.
  //   attach(r, entries)  thêm khoản vào kết quả tháng r: r.entries (liệt kê) và cộng khoản cộng vào r.total. Không có khoản nào: không đổi gì.
  //   sumsOf(m, P)        tổng hợp của m.entries theo bộ tham số P (nền bảo hiểm có cờ chỉ khi insurance.base = withFlaggedAllowances); không có khoản: toàn 0
  function attach(r?, entries?) {
    if (entries && entries.length) {
      r.entries = list(entries);
      r.total += sums(r.entries).add;
    }
    return r;
  }
  const sumsOf = (m?, P?) => sums(m.entries, { insuranceFlagged: P['insurance.base'] === 'withFlaggedAllowances' });

  //   netOf(m, P)         hai trường thêm của m.net (entriesAdd, entriesDeduct), chỉ khi m có khoản: không khoản nào thì {} và m.net không đổi
  const netOf = (m?, P?) => {
    if (!m.entries) return {};
    const { add, deduct } = sumsOf(m, P);
    return { entriesAdd: add, entriesDeduct: deduct };
  };

  return { DIRECTIONS, TAX_MODES, sums, list, attach, sumsOf, netOf };
});
