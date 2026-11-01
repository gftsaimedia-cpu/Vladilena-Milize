'use strict';
const { HttpError } = require('../../platform/http');
const { vnToday } = require('../../platform/request-rules');

// Cửa sổ tạo yêu cầu tạm ứng: mở khi ngày trong tháng của hôm nay (vnToday(), giờ Việt Nam) nằm trong REQUEST_DAYS.
// Yêu cầu tạo ngày 16 hoặc 17 của tháng M là tạm ứng của tháng M: tháng xin phải là tháng (YYYY-MM) của hôm nay.
class AdvanceRequestWindow {
  declare today: any;

  static REQUEST_DAYS = Object.freeze([16, 17]);
  static CLOSED_TEXT = `Chỉ gửi được yêu cầu tạm ứng vào ngày ${AdvanceRequestWindow.REQUEST_DAYS.join(' và ')} hằng tháng`;

  constructor({ today = vnToday }: any = {}) {
    this.today = today;
  }

  isOpen(today = this.today()) {
    return AdvanceRequestWindow.REQUEST_DAYS.includes(Number(today.slice(8, 10)));
  }

  view(today = this.today()) {
    return { days: [...AdvanceRequestWindow.REQUEST_DAYS], open: this.isOpen(today) };
  }

  assertOpen(today = this.today()) {
    if (!this.isOpen(today))
      throw new HttpError(409, AdvanceRequestWindow.CLOSED_TEXT, {
        code: 'ADVANCE_WINDOW_CLOSED',
        days: [...AdvanceRequestWindow.REQUEST_DAYS]
      });
  }

  assertMonthCurrent(month?, today = this.today()) {
    if (month !== today.slice(0, 7))
      throw new HttpError(409, 'Chỉ xin được tạm ứng của tháng hiện tại', { code: 'ADVANCE_MONTH_NOT_CURRENT', month });
  }
}

export = { AdvanceRequestWindow };
