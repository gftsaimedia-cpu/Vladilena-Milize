'use strict';
// Vị trí (chức vụ + bậc) của nhân viên ở một tháng: một lớp chung cho mọi chức vụ, khác nhau nằm ở dữ liệu trong DB, không ở lớp con;
// chỉ tạo lớp con khi có một chức vụ cần HÀNH VI khác thật. Dựng bởi PositionCatalog.forMonth(month).
// Lớp chỉ giữ dữ liệu và trả lời câu hỏi "được hay không"; công thức tiền do bộ máy lương giữ, không tính ở đây.
class Position {
  declare type: any;
  declare typeName: any;
  declare level: any;
  declare name: any;
  declare baseSalary: any;
  declare kpiMax: any;
  declare standardWorkdays: any;
  declare flexPct: any;
  declare nightPct: any;
  declare travelPct: any;
  declare attendancePct: any;
  declare benefits: any;
  declare schedule: any;

  // data: phiên bản chức vụ và bậc hiệu lực của tháng, đã gom quyền lợi (tên → true/false) và lịch (thứ → 'regular')
  constructor(data?) {
    this.type = data.type; // mã chức vụ ('nv')
    this.typeName = data.typeName; // tên chức vụ ('Nhân viên')
    this.level = data.level; // bậc trong chức vụ, bắt đầu từ 1
    this.name = data.name; // tên bậc ('Advisor')
    this.baseSalary = data.baseSalary; // lương cơ bản tháng, VND đồng nguyên
    this.kpiMax = data.kpiMax ?? null; // KPI tối đa tháng, VND đồng nguyên; null nếu bậc không có lương KPI
    this.standardWorkdays = data.standardWorkdays; // ngày công chuẩn, mẫu số tính lương ngày
    this.flexPct = data.flexPct; // phụ cấp ca Flex, %
    this.nightPct = data.nightPct; // phụ cấp ca Night của bậc (bậc không đặt riêng thì theo chức vụ), %
    this.travelPct = data.travelPct; // phụ cấp đi lại, %
    this.attendancePct = data.attendancePct; // phụ cấp chuyên cần, %
    this.benefits = data.benefits || {}; // quyền lợi: tên → true/false
    this.schedule = data.schedule || {}; // lịch: thứ (0 = Chủ nhật … 6 = thứ Bảy) → 'regular'
  }

  // Có quyền lợi này không. Danh mục quyền lợi nằm trong DB (benefit_types); nơi dựng điền đủ mọi quyền lợi (thiếu = false),
  // nên tên lạ là gõ sai và ném lỗi
  can(benefit?) {
    if (!Object.hasOwn(this.benefits, benefit)) throw new Error(`Quyền lợi không có trong danh mục: ${benefit}`);
    return this.benefits[benefit] === true;
  }

  // dow: 0 = Chủ nhật, 1 đến 6 = thứ Hai đến thứ Bảy. Ngày không có trong lịch là không làm
  worksOn(dow?) {
    return this.schedule[dow] === 'regular';
  }
}

export = { Position };
