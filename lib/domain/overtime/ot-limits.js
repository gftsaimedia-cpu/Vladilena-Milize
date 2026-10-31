'use strict';
// Hai trần giờ làm chặn cứng, MỘT nguồn đọc: khoá trần luật của registry (law.ceiling.*).
//   dayCap    giờ ròng một ngày (giờ ca + OT + làm thêm + làm bù, không tính giờ nghỉ giữa ca)
//   monthCap  tổng giờ OT trong một tháng, cộng giờ ca chính làm ngày lễ
// Đổi trần = đổi giá trị khoá trong bộ tham số; mọi nơi kiểm trần đọc qua class này nên không phải sửa chỗ nào khác.
const { DEFAULTS } = require('../../../public/payroll-params.js');

const DAY_KEY = 'law.ceiling.otDayTotalHours';
const MONTH_KEY = 'law.ceiling.otMonthHours';

const positive = (value, key) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0)
    throw new Error(`Trần giờ làm ${key} phải là số dương (đang là ${String(value)})`);
  return value;
};

class OtLimits {
  #dayCap;
  #monthCap;

  constructor({ dayCap, monthCap }) {
    this.#dayCap = positive(dayCap, DAY_KEY);
    this.#monthCap = positive(monthCap, MONTH_KEY);
    Object.freeze(this);
  }

  // Đọc từ bộ tham số của tháng; khoá vắng thì rơi về mặc định của registry
  static of(params = {}) {
    const read = key => (Object.hasOwn(params, key) ? params[key] : DEFAULTS[key]);
    return new OtLimits({ dayCap: read(DAY_KEY), monthCap: read(MONTH_KEY) });
  }

  static defaults() {
    return OtLimits.of({});
  }

  get dayCap() {
    return this.#dayCap;
  }

  get monthCap() {
    return this.#monthCap;
  }
}

OtLimits.DAY_KEY = DAY_KEY;
OtLimits.MONTH_KEY = MONTH_KEY;

module.exports = { OtLimits };
