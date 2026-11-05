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
