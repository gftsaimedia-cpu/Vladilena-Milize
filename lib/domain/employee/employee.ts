'use strict';
// Nhân viên của một tháng: tổ hợp của Hồ sơ (Profile, nhận dạng bằng uuid), Vị trí (Position: chức vụ + bậc hiệu lực của tháng) và Ca được xếp
// (Shift). Các phần đó được dựng sẵn và truyền vào (EmployeeDirectory dựng từ DB); nhân viên không tự đọc DB.
// Việc có ghi (chấm công, gửi yêu cầu, trả lời giải trình) nằm ở các service của từng module, vì cần giao dịch, khoá kỳ, nhật ký và sự kiện.
class Employee {
  declare profile: any;
  declare position: any;
  declare shift: any;

  // profile: Profile; position: Position | null (bậc không có trong danh mục của tháng); shift: Shift | null (chưa xếp ca)
  constructor({ profile, position, shift }: any) {
    this.profile = profile;
    this.position = position ?? null;
    this.shift = shift ?? null;
  }

  get uuid() {
    return this.profile.uuid;
  }

  get username() {
    return this.profile.username;
  }

  // Họ tên theo thứ tự Việt Nam: họ và tên đệm trước, tên sau
  get fullName() {
    return [this.profile.familyName, this.profile.givenName].filter(Boolean).join(' ') || this.profile.fullName;
  }

  // Câu hỏi về chức vụ, trả lời thẳng từ position (không có vị trí thì không có quyền lợi nào)
  can(benefit?) {
    return !!this.position && this.position.can(benefit);
  }

  benefits() {
    return this.position ? { ...this.position.benefits } : {};
  }

  baseSalary() {
    return this.position ? this.position.baseSalary : null;
  }

  // dow: 0 = Chủ nhật … 6 = thứ Bảy (lịch của chức vụ)
  worksOn(dow?) {
    return !!this.position && this.position.worksOn(dow);
  }

  // Phụ cấp ca hưởng theo ca được xếp: 'flex' | 'night' | null (ca Normal hoặc chưa xếp ca)
  shiftAllowance() {
    return this.shift ? this.shift.allowance() : null;
  }

  // Phần trăm phụ cấp ca tương ứng (theo bậc, bậc không đặt riêng thì theo chức vụ); không có phụ cấp ca thì 0
  shiftAllowancePct() {
    const kind = this.shiftAllowance();
    if (!kind || !this.position) return 0;
    return kind === 'night' ? this.position.nightPct : this.position.flexPct;
  }

  isResignedBy(date?) {
    return this.profile.isResignedBy(date);
  }

  view() {
    return {
      ...this.profile.info(),
      fullName: this.fullName,
      position: this.position ? { ...this.position } : null,
      shift: this.shift ? { ...this.shift } : null,
      shiftAllowance: this.shiftAllowance(),
      shiftAllowancePct: this.shiftAllowancePct()
    };
  }
}

export = { Employee };
