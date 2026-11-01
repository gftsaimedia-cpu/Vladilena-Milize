'use strict';
// Một ca làm trong danh mục (bảng work_shifts): mã mới Normal1…Night2, tên, loại phụ cấp (normal | flex | night) và khoá giờ ca cũ (preset)
// để đọc giờ vào/ra trong bộ tham số (shift.preset.<preset>.in | out).
const KINDS = Object.freeze(['normal', 'flex', 'night']);

class Shift {
  declare code: any;
  declare preset: any;
  declare name: any;
  declare kind: any;
  declare sort: any;
  declare deprecated: any;
  declare rev: any;

  static fromRow(row?) {
    return new Shift({
      code: row.code,
      preset: row.preset,
      name: row.name,
      kind: row.kind,
      sort: row.sort,
      deprecated: row.deprecated === 1,
      rev: row.rev
    });
  }

  constructor(data?) {
    this.code = data.code; // mã ca ('Night1')
    this.preset = data.preset; // khoá giờ ca trong bộ tham số ('g1')
    this.name = data.name; // tên hiển thị ('Night 1')
    this.kind = data.kind; // 'normal' | 'flex' | 'night'
    this.sort = data.sort ?? 0; // thứ tự hiện trên màn
    this.deprecated = data.deprecated === true; // ngưng dùng: không xếp mới, người đang có giữ nguyên
    this.rev = data.rev ?? 0;
  }

  // Ca này hưởng phụ cấp ca nào: 'flex' | 'night' | null (ca Normal không có phụ cấp ca)
  allowance() {
    return this.kind === 'normal' ? null : this.kind;
  }
}

export = { Shift, KINDS };
