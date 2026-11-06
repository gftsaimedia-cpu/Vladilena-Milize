/** Số gửi lên sai luật (400); field là tên ô sai, 'values' khi cả khối sai, 'sum' khi tổng KPI sai. */
export class SettingsInputError extends Error {
  constructor(
    message: string,
    readonly field: string
  ) {
    super(message);
    this.name = 'SettingsInputError';
  }
}

/** Tên nhóm cài đặt không có trong danh mục (404). */
export class SettingsGroupNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SettingsGroupNotFoundError';
  }
}

/** Nhân viên không tồn tại (404). */
export class SettingsEmployeeNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SettingsEmployeeNotFoundError';
  }
}

/** Nhóm vừa được người khác lưu: stamp đã đổi (409); stamp là giá trị hiện tại. */
export class SettingsStaleError extends Error {
  constructor(
    message: string,
    readonly stamp: number
  ) {
    super(message);
    this.name = 'SettingsStaleError';
  }
}

/** Một nhóm cài đặt chưa có phiên bản nào có hiệu lực ở tháng đó (tháng trước phiên bản đầu tiên). */
export class SettingsMissingError extends Error {
  constructor(
    readonly group: string,
    readonly month: string
  ) {
    super(`Không có cài đặt ${group} nào có hiệu lực ở tháng ${month}`);
    this.name = 'SettingsMissingError';
  }
}

/** Loại nhân sự chưa có tuần làm việc ở tháng đó, vd. tài khoản quản trị đầu tiên (loại ql) không có dòng position_types. */
export class TypeWeekMissingError extends Error {
  constructor(
    readonly typeCode: string,
    readonly month: string
  ) {
    super(`Loại nhân sự ${typeCode} chưa có tuần làm việc ở tháng ${month}`);
    this.name = 'TypeWeekMissingError';
  }
}
