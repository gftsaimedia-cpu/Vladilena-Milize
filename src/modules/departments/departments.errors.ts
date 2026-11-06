export class DepartmentInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DepartmentInputError';
  }
}

export class DepartmentNotFoundError extends Error {
  constructor(message = 'Không tìm thấy phòng ban') {
    super(message);
    this.name = 'DepartmentNotFoundError';
  }
}

export class DepartmentNameTakenError extends Error {
  constructor(message = 'Tên phòng ban đã có') {
    super(message);
    this.name = 'DepartmentNameTakenError';
  }
}

export class DepartmentNotEmptyError extends Error {
  constructor(message = 'Phòng ban còn nhân sự, chưa xoá được') {
    super(message);
    this.name = 'DepartmentNotEmptyError';
  }
}
