'use strict';
// Hồ sơ nhân viên: thông tin của MỘT người trên bảng staff, nhận dạng bằng uuid (không đổi suốt đời hồ sơ; sinh một lần lúc thêm người).
// Tài khoản đăng nhập (username) cũng không đổi, nhưng truy vết luôn đi bằng uuid. Lớp chỉ giữ dữ liệu và trả lời câu hỏi đơn giản;
// sửa và ghi xuống DB đi qua EmployeeRepository (có nhật ký, khoá lạc quan).
const { PersonName } = require('./person-name');

const CONTRACT_STATUSES = Object.freeze(['probation', 'official']);
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const isDate = (value?) => typeof value === 'string' && DATE_RE.test(value);

class Profile {
  declare uuid: any;
  declare username: any;
  declare fullName: any;
  declare familyName: any;
  declare givenName: any;
  declare birthday: any;
  declare startDate: any;
  declare contractStatus: any;
  declare resignedOn: any;
  declare type: any;
  declare level: any;
  declare shiftCode: any;
  declare locked: any;
  declare payrollSubject: any;
  declare leaveBalance: any;
  declare leaveBalanceOn: any;

  // row: một dòng thô của bảng staff
  static fromRow(row?) {
    const name = row.given_name ? new PersonName(row.family_name, row.given_name) : PersonName.parse(row.name);
    return new Profile({
      uuid: row.uuid,
      username: row.username,
      fullName: row.name,
      familyName: name.familyName,
      givenName: name.givenName,
      birthday: row.birthday || null,
      startDate: row.start_date || null,
      contractStatus: row.contract_status || null,
      resignedOn: row.resigned_on || null,
      type: row.type,
      level: row.level,
      shiftCode: row.shift_code || null,
      locked: !!row.locked_at,
      payrollSubject: row.payroll_subject == null ? row.role !== 'admin' : !!row.payroll_subject,
      leaveBalance: row.leave_balance ?? null,
      leaveBalanceOn: row.leave_balance_on || null
    });
  }

  constructor(fields?) {
    this.uuid = fields.uuid; // mã định danh duy nhất, không đổi
    this.username = fields.username; // tài khoản đăng nhập, không đổi
    this.fullName = fields.fullName; // họ tên như đang hiển thị
    this.familyName = fields.familyName; // họ và tên đệm ("Bùi Đăng")
    this.givenName = fields.givenName; // tên ("Khoa")
    this.birthday = fields.birthday ?? null; // ngày sinh 'YYYY-MM-DD'
    this.startDate = fields.startDate ?? null; // ngày vào làm 'YYYY-MM-DD'
    this.contractStatus = fields.contractStatus ?? null; // 'probation' | 'official' | null; Admin nhập, không đổi tiền
    this.resignedOn = fields.resignedOn ?? null; // ngày nghỉ việc; null = còn làm
    this.type = fields.type; // mã chức vụ (loại nhân sự)
    this.level = fields.level; // bậc trong chức vụ
    this.shiftCode = fields.shiftCode ?? null; // ca được xếp (Normal1, Flex1, Night1...)
    this.locked = fields.locked === true; // tài khoản bị khoá
    this.payrollSubject = fields.payrollSubject !== false; // có trong bảng lương
    this.leaveBalance = fields.leaveBalance ?? null; // phép năm còn lại lưu sẵn
    this.leaveBalanceOn = fields.leaveBalanceOn ?? null; // ngày tính số dư trên
  }

  // Đã nghỉ việc tính đến ngày `date` (nghỉ từ ngày resignedOn: ngày đó vẫn là ngày làm cuối)
  isResignedBy(date?) {
    return isDate(this.resignedOn) && this.resignedOn < date;
  }

  // Bản sao dạng đối tượng thường để gửi ra API
  info() {
    return { ...this };
  }
}

export = { Profile, CONTRACT_STATUSES, isDate };
