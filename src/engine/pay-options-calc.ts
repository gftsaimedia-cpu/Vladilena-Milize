(function (root: any, factory: any) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PayOptions = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // Phương án cách tính của ①, ②, ③, ⑥: thuần, dùng chung trình duyệt và máy chủ; bộ máy tính lương
  // (src/engine/payroll-engine.ts) gọi các hàm này ở vài móc nhỏ. Mỗi hàm nhận bộ tham số phẳng `set`; phương án MẶC ĐỊNH trả nguyên đối tượng
  // hoặc giá trị đầu vào, không phép tính nào thêm.
  /* ---------- phương án cách tính của ① và ③ (pay.method, attendance.lossMode, tiers, overLimitTolerance, shortHoursRounding) ---------- */
  // Phương án mặc định (A, all, 0, none) trả nguyên đối tượng hoặc giá trị đầu vào, không phép tính nào thêm. Phương án nào chọn được
  // do registry quy định (options.available); các hàm này chỉ thực hiện phương án đã lưu.
  // Quyền lợi theo từng bậc (ưu tiên: bậc → chức vụ → toàn cục): level.<mã>.<bậc>.<đuôi> (khác null) thay type.<mã>.<đuôi> cho người ở đúng bậc đó.
  // Đuôi: travel, attendance, flexBonus, nightOptions, benefit.<cờ>. Không có ghi đè nào của bậc thì trả đúng bộ tham số (cùng đối tượng);
  // có thì nhớ MỘT bản gộp cho mỗi (chức vụ, bậc) của mỗi bộ tham số.
  const LEVEL_OVERRIDE_RE =
    /^level\.([a-z0-9_]+)\.([0-9]+)\.(travel|attendance|flexBonus|nightOptions|benefit\.[A-Za-z0-9]+)$/;
  const levelIndex = new WeakMap<any, any>();
  function levelView(set?, staff?) {
    if (!staff || typeof staff.type !== 'string' || !['number', 'string'].includes(typeof staff.level)) return set; // hồ sơ sai để assertStaff báo
    if (!levelIndex.has(set)) {
      const patches = new Map<any, any>();
      for (const key of Object.keys(set)) {
        const m = LEVEL_OVERRIDE_RE.exec(key);
        if (!m || set[key] === null) continue;
        const [, type, level, tail] = m;
        const id = `${type}.${level}`;
        if (!patches.has(id)) patches.set(id, { patch: {}, view: null });
        patches.get(id).patch[`type.${type}.${tail}`] = set[key];
      }
      levelIndex.set(set, patches);
    }
    const found = levelIndex.get(set).get(`${staff.type}.${staff.level}`);
    if (!found) return set;
    if (!found.view) found.view = Object.freeze({ ...set, ...found.patch });
    return found.view;
  }
  // pay.method B (trần 100 % lương tháng) và D (lương tháng trừ ngày không lương): chỉnh r.basePay và r.work (tổng thành phần ngày) sau vòng các ngày
  function adjustBase(r?, set?, base?, daily?) {
    const method = set['pay.method'];
    if (method === 'B' && r.basePay > base) {
      r.work -= r.basePay - base;
      r.basePay = base;
    } else if (method === 'D') {
      const target = base - ((r.unpaid || 0) + (r.approved || 0) + (r.noshow || 0)) * daily;
      r.work += target - r.basePay;
      r.basePay = target;
    }
    return r;
  }
  // attendance.shortHoursRounding: làm tròn XUỐNG giờ vượt ngưỡng (halfHour = một bậc trừ attendance.stepMin phút, hour = một giờ); null giữ null
  function roundShort(hours?, set?) {
    const mode = set['attendance.shortHoursRounding'];
    if (hours === null || hours === undefined || mode === 'none') return hours;
    const step = mode === 'halfHour' ? set['attendance.stepMin'] / set['unit.minutesPerHour'] : 1;
    return Math.floor(hours / step) * step;
  }
  // attendance.lossMode = tiers: phụ cấp chuyên cần của người CÒN giữ được nhân tỷ lệ giữ của bậc nghỉ (attendance.tiers, từ N ngày nghỉ); mất hẳn khi
  // nghỉ đủ ngưỡng hoặc vượt ngưỡng giờ vẫn do cây công thức quyết định (giá trị 0 giữ nguyên 0)
  function tiered(name?, value?, v?, set?) {
    if (name !== 'phuCapChuyenCan' || set['attendance.lossMode'] !== 'tiers' || !value) return value;
    let keep = 1;
    for (const row of set['attendance.tiers'] || []) if (v.ngayNghiXetChuyenCan >= row.fromDays) keep = row.keepRatio;
    return value * keep;
  }

  /* ---------- phương án của ② và ⑥: advance.basis, advance.eligibleTypes ---------- */
  // Phương án mặc định (byWorkedDays, mọi chức vụ được tạm ứng) trả nguyên giá trị đầu vào. Phương án chưa chọn được (available: false) vẫn thực hiện đúng định nghĩa
  // khi một bộ tham số đặt chúng (test và xem trước); advance.basis amountByLevel và onRequest chưa nối vì thiếu bảng số tiền theo level và luồng yêu cầu tạm ứng.
  // Cơ sở tạm ứng: theo ngày đi làm (mặc định) hoặc % cố định của lương cơ bản của level (không phụ thuộc ngày làm)
  const advanceBase = (set?, workedBase?, levelBase?) =>
    set['advance.basis'] === 'fixedPctByLevel' ? levelBase : workedBase;
  // Chức vụ được tạm ứng (advance.eligibleTypes.<mã>); chức vụ chưa có khoá (thêm sau) được như mặc định
  const advanceEligible = (set?, type?) => set[`advance.eligibleTypes.${type}`] !== false;

  return { levelView, adjustBase, roundShort, tiered, advanceBase, advanceEligible };
});
