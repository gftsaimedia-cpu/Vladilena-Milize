'use strict';
const { HttpError } = require('../../platform/http');

// Khoá lạc quan của lịch khai: expectedRev là rev trong GET /api/sheet mà người gọi đã thấy; lệch thì 409 SHEET_STALE và không ghi gì.
// Thiếu expectedRev thì ghi đè, không so rev. Mỗi lần store.setSheet tăng rev; Admin duyệt KPI không tăng.
// Gọi trong cùng transaction với setSheet. Phụ thuộc: sheetOf(username, month) → { rev }.
class SheetRevision {
  declare sheetOf: any;

  constructor({ sheetOf }: any) {
    this.sheetOf = sheetOf;
  }

  async assert(username?, month?, expectedRev?) {
    if (expectedRev === undefined) return;
    if (!Number.isInteger(expectedRev) || expectedRev < 0)
      throw new HttpError(400, 'expectedRev phải là số nguyên không âm');
    const { rev } = await this.sheetOf(username, month);
    if (rev !== expectedRev)
      throw new HttpError(409, 'Lịch tháng này vừa được người khác sửa, tải lại rồi làm lại', {
        code: 'SHEET_STALE',
        rev
      });
  }
}

export = { SheetRevision };
