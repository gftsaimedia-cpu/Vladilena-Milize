'use strict';
// Bảng lương của một nhân viên trong một tháng. Lớp chỉ GIỮ các con số do bộ máy lương tính (tiền là số nguyên VND),
// không tự tính tiền ở đây (quy tắc: giao diện và lớp mô hình không tính tiền).
class Payroll {
  declare month: any;
  declare official: any;
  declare gross: any;
  declare insurance: any;
  declare tax: any;
  declare advance: any;
  declare net: any;

  constructor(data?) {
    this.month = data.month; // tháng, dạng 'YYYY-MM'
    this.official = data.official === true; // true = phiếu đã chốt (bất biến), false = ước tính
    this.gross = data.gross; // tổng thu nhập trước khấu trừ, VND
    this.insurance = data.insurance; // bảo hiểm người lao động đóng, VND
    this.tax = data.tax; // thuế thu nhập cá nhân, VND
    this.advance = data.advance; // tạm ứng đã trừ, VND
    this.net = data.net; // thực lĩnh, VND
  }

  isOfficial() {
    return this.official;
  }
}

export = { Payroll };
