(function (root: any, factory: any) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PayBlocksCalc = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // Phép tính thuần của "khối phụ cấp do C&B thêm". Dùng chung trình duyệt và máy chủ:
  // bộ máy tính lương (src/engine/payroll-engine.ts) gọi attach() và mergeSums() ở đúng hai chỗ; không I/O, không đồng hồ, không con số nào ngoài 0 và 1.
  // Khối là DỮ LIỆU trong bộ tham số phẳng của tháng:
  //   block.def.<mã>                      { label, component, mode, method: 'fixed'|'pctBase'|'byLevel', scalesWithDays, loss, tax: 'none'|'full'|'cap', taxCap,
  //                                         insuranceBase, deprecated, flagsConfirmedBy, flagsConfirmedAt }
  //   type.<chức vụ>.block.<mã>.on        bật cho chức vụ
  //   type.<chức vụ>.block.<mã>.amount    số tiền cố định (đồng nguyên) khi method = fixed
  //   type.<chức vụ>.block.<mã>.pct       tỷ lệ lương cơ bản của bậc khi method = pctBase (0,075 là 7,5 %)
  //   type.<chức vụ>.block.<mã>.byLevel.<bậc>  số tiền theo bậc khi method = byLevel
  // Quy tắc:
  //   - Khối cộng vào tổng thu nhập SAU cây tongThuNhap (r.total += tổng các khối); không có khối nào áp cho người thì KHÔNG có trường mới trong m.
  //   - scalesWithDays: nhân tỷ lệ ngày đi làm (cùng tỷ lệ của phụ cấp đi lại). loss: mất khối (số tiền 0) khi nghỉ đủ số ngày xét chuyên cần hoặc giờ vượt ngưỡng,
  //     theo đúng phép so sánh của chuyên cần (attendance.absentCompare, attendance.overLimitCompare); số ngày nghỉ và ngưỡng giờ vượt do bộ máy đưa vào, cùng số với đường tiền của chuyên cần.
  //   - Cờ miễn thuế (tax) và nền bảo hiểm (insuranceBase) C&B chỉ ĐỀ NGHỊ: chỉ có hiệu lực khi Kế toán xác nhận (flagsConfirmedBy khác rỗng); chưa xác nhận thì tính
  //     như chịu thuế và không vào nền bảo hiểm. Nền bảo hiểm chỉ cộng khi insurance.base = withFlaggedAllowances (như khoản điền thêm).
  const METHODS = Object.freeze(['fixed', 'pctBase', 'byLevel']);
  const TAX_MODES = Object.freeze(['none', 'full', 'cap']);
  const DEF_PREFIX = 'block.def.';
  const own = (set?, key?) => (Object.hasOwn(set, key) ? set[key] : undefined);
  const confirmed = (item?) => typeof item.flagsConfirmedBy === 'string' && item.flagsConfirmedBy !== '';
  const isObj = (v?) => !!v && typeof v === 'object' && !Array.isArray(v);

  function blockError(message?) {
    return Object.assign(new Error(message), { code: 'PAYROLL_BAD_BLOCK' });
  }

  // Định nghĩa khối đang dùng của bộ tham số P, sắp theo mã; nhớ theo đối tượng P (bộ tham số không đổi sau khi dựng)
  const defsCache = new WeakMap<any, any>();
  function defsOf(P?) {
    if (!defsCache.has(P)) {
      const list: any[] = [];
      for (const key of Object.keys(P))
        if (key.startsWith(DEF_PREFIX) && isObj(P[key]) && !P[key].deprecated)
          list.push({ code: key.slice(DEF_PREFIX.length), def: P[key] });
      list.sort((a: any, b: any) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
      defsCache.set(P, list);
    }
    return defsCache.get(P);
  }

  // Số tiền của một khối cho một người (trước khi xét mất khối). ctx: { type, level, base, ratio }
  function amountOf(P?, code?, def?, ctx?) {
    const prefix = `type.${ctx.type}.block.${code}.`;
    let amount;
    if (def.method === 'fixed') amount = own(P, `${prefix}amount`);
    else if (def.method === 'pctBase') {
      const pct = own(P, `${prefix}pct`);
      amount = typeof pct === 'number' ? pct * ctx.base : undefined;
    } else if (def.method === 'byLevel') amount = own(P, `${prefix}byLevel.${ctx.level}`);
    else throw blockError(`Khối "${def.label}" có cách tính không hợp lệ`);
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0)
      throw blockError(
        `Khối "${def.label}" chưa có số tiền cho chức vụ ${ctx.type}${def.method === 'byLevel' ? `, bậc ${ctx.level}` : ''}`
      );
    return def.scalesWithDays ? amount * ctx.ratio : amount;
  }

  // Ngày nghỉ xét chuyên cần (absent) và ngưỡng giờ vượt của chuyên cần (overLimit) KHÔNG tính lại ở đây: bộ máy (payroll-engine.js → calcMonth) tính MỘT lần
  // (ngày nghỉ đã trừ ngày nghỉ không lương được miễn; ngưỡng đã cộng biên độ attendance.overLimitTolerance) rồi đưa vào ctx, nên khối, cờ r.attendOk
  // và đường tiền của chuyên cần luôn dùng cùng một số.
  // Khối bị mất (số tiền 0) vì nghỉ nhiều hoặc giờ vượt ngưỡng; so: phép so sánh có tên của bộ máy
  function lostOf(P, def, r, so, { absent, overLimit }: any) {
    const loss = def.loss;
    if (!loss) return false;
    if (loss.kind === 'absentDays') return so(P['attendance.absentCompare'], absent, loss.days);
    if (loss.kind === 'overLimitHours') return so(P['attendance.overLimitCompare'], r.overHours, overLimit);
    throw blockError(`Khối "${def.label}" có điều kiện mất không hợp lệ`);
  }

  // Các khối áp cho một người trong tháng đã tính (r = kết quả tháng; chỉ khối có type.<chức vụ>.block.<mã>.on = true).
  // Mỗi phần tử: { code, label, amount, taxMode, taxCap, insuranceBase, flagsConfirmedBy, lost }. Số tiền làm tròn đồng một lần bằng hàm round của bộ máy (ctx.round; không có thì giữ nguyên số).
  function itemsFor(P?, r?, ctx?) {
    const out: any[] = [];
    for (const { code, def } of defsOf(P)) {
      if (own(P, `type.${ctx.type}.block.${code}.on`) !== true) continue;
      const lost = lostOf(P, def, r, ctx.so, ctx);
      out.push({
        code,
        label: def.label,
        amount: lost ? 0 : (ctx.round || (x => x))(amountOf(P, code, def, ctx)),
        taxMode: TAX_MODES.includes(def.tax) ? def.tax : 'none',
        taxCap: typeof def.taxCap === 'number' ? def.taxCap : null,
        insuranceBase: def.insuranceBase === true,
        flagsConfirmedBy: typeof def.flagsConfirmedBy === 'string' ? def.flagsConfirmedBy : null,
        lost
      });
    }
    return out;
  }

  // Cửa 1 của bộ máy: thêm khối vào kết quả tháng r (r.blocks và cộng vào r.total). Không khối nào áp cho người: không đổi gì.
  //   staff: hồ sơ; kernel: { typeKey, levelOf, so } của bộ máy; ratio: tỷ lệ ngày đi làm (tyLeNgayDiLam);
  //   absent, overLimit: ngày nghỉ xét chuyên cần và ngưỡng giờ vượt của chuyên cần, do bộ máy tính một lần
  function attach(r, P, staff, { typeKey, levelOf, so, ratio, absent, overLimit, round }: any) {
    if (!defsOf(P).length) return r;
    const type = typeKey(staff);
    const items = itemsFor(P, r, {
      type,
      level: staff.level,
      base: levelOf(staff).base,
      ratio,
      so,
      absent,
      overLimit,
      round
    });
    if (items.length) {
      r.blocks = items;
      for (const item of items) r.total += item.amount;
    }
    return r;
  }

  // Phần miễn thuế và nền bảo hiểm của các khối trong m (cờ chưa xác nhận: 0)
  function sumsOf(m?, P?) {
    const out = { exempt: 0, insuranceBase: 0 };
    const flagged = P['insurance.base'] === 'withFlaggedAllowances';
    for (const item of m.blocks || []) {
      if (!confirmed(item)) continue;
      if (item.taxMode === 'full') out.exempt += item.amount;
      else if (item.taxMode === 'cap') out.exempt += Math.min(item.amount, item.taxCap == null ? 0 : item.taxCap);
      if (flagged && item.insuranceBase) out.insuranceBase += item.amount;
    }
    return out;
  }

  // Cửa 2: cộng phần của khối vào tổng hợp khoản điền thêm; m không có khối thì trả đúng đối tượng cũ (không đổi bit nào)
  function mergeSums(sums?, m?, P?) {
    if (!m.blocks) return sums;
    const b = sumsOf(m, P);
    return { ...sums, exempt: sums.exempt + b.exempt, insuranceBase: sums.insuranceBase + b.insuranceBase };
  }

  return { METHODS, TAX_MODES, DEF_PREFIX, defsOf, itemsFor, attach, sumsOf, mergeSums };
});
