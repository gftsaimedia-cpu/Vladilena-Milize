'use strict';
// Hằng đơn vị và định dạng dùng chung của lib/ai/ và lib/data-quality.js (không có con số viết cứng).
// Thuần: không I/O, không đồng hồ. Hai loại hằng:
//   đơn vị     phút mỗi giờ, phút mỗi ngày, ms mỗi ngày, lệch múi giờ VN, phần trăm: đọc từ khoá unit.* của bộ tham số (khoá khoá cứng
//              `locked`, không đổi theo tháng, nên mặc định PayrollParams.DEFAULTS luôn đúng);
//   định dạng  độ rộng của chuỗi ngày, tháng, giờ ('YYYY-MM-DD', 'HH:MM'): suy ra từ chính khuôn chuỗi, không phải ngưỡng nghiệp vụ.
const PayrollParams = require('../../public/payroll-params.js');

const DATE_FORMAT = 'YYYY-MM-DD';
const CLOCK_FORMAT = 'HH:MM';
const DATE_LEN = DATE_FORMAT.length;
const MONTH_LEN = 'YYYY-MM'.length;
const MONTH_AT = 'YYYY-'.length; // vị trí số tháng trong chuỗi ngày
const DAY_AT = 'YYYY-MM-'.length; // vị trí số ngày trong chuỗi ngày
const CLOCK_AT = `${DATE_FORMAT}T`.length; // vị trí giờ:phút trong chuỗi ISO
const CLOCK_END = CLOCK_AT + CLOCK_FORMAT.length;
const HOUR_LEN = 'HH'.length;
const MINUTE_AT = 'HH:'.length;
const FIELD_PAD = 'MM'.length; // số chữ số của giờ, phút
const HEX_RADIX = '0123456789abcdef'.length;
const HASH_DIGITS = 'ffffffff'.length;
const PAIR = 1 + 1; // cặp (trung vị của số phần tử chẵn, chia đôi)

const built = new WeakMap();
function createUnits(params = PayrollParams.DEFAULTS) {
  if (built.has(params)) return built.get(params);
  const minPerHour = params['unit.minutesPerHour'];
  const minPerDay = params['unit.minutesPerDay'];
  const msPerDay = params['unit.msPerDay'];
  const vnOffsetMin = params['unit.vnUtcOffsetMin'];
  const percent = params['unit.percent'];
  const msPerMin = msPerDay / minPerDay;
  const api = {
    minPerHour,
    minPerDay,
    msPerDay,
    percent,
    vnOffsetMin,
    msPerMin,
    isRealDate: value => {
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
      const time = Date.parse(`${value}T00:00:00Z`);
      return Number.isFinite(time) && new Date(time).toISOString().slice(0, DATE_LEN) === value;
    },
    toMin: value => {
      if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
      return Number(value.slice(0, HOUR_LEN)) * minPerHour + Number(value.slice(MINUTE_AT));
    },
    spanOf: (from, to) => (((to - from) % minPerDay) + minPerDay) % minPerDay || minPerDay,
    vnDateOf: iso => {
      const time = typeof iso === 'string' ? Date.parse(iso) : NaN;
      return Number.isFinite(time) ? new Date(time + vnOffsetMin * msPerMin).toISOString().slice(0, DATE_LEN) : '';
    },
    vnClockOf: epochMin => new Date((epochMin + vnOffsetMin) * msPerMin).toISOString().slice(CLOCK_AT, CLOCK_END),
    dayStartOf: date => Date.parse(`${date}T00:00:00Z`) / msPerMin - vnOffsetMin,
    addDays: (date, days) =>
      new Date(Date.parse(`${date}T00:00:00Z`) + days * msPerDay).toISOString().slice(0, DATE_LEN),
    dayDiff: (later, earlier) =>
      Math.round((Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`)) / msPerDay),
    nextMonthOf: month => {
      const [year, mon] = month.split('-').map(Number);
      return new Date(Date.UTC(year, mon, 1)).toISOString().slice(0, MONTH_LEN);
    },
    previousMonthOf: month => {
      const [year, mon] = month.split('-').map(Number);
      return new Date(Date.UTC(year, mon - 1 - 1, 1)).toISOString().slice(0, MONTH_LEN);
    },
    monthOf: date => date.slice(0, MONTH_LEN),
    dm: date => `${date.slice(DAY_AT)}/${date.slice(MONTH_AT, MONTH_AT + FIELD_PAD)}`,
    round2: value => Math.round(value * percent) / percent,
    hoursText: hours => String(Math.round(hours * percent) / percent).replace('.', ','),
    digestOf: text => {
      let hash = 0x811c9dc5;
      for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
      }
      return hash.toString(HEX_RADIX).padStart(HASH_DIGITS, '0');
    },
    median: numbers => {
      const sorted = [...numbers].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / PAIR);
      return sorted.length % PAIR ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / PAIR;
    }
  };
  built.set(params, Object.freeze(api));
  return built.get(params);
}

// Thứ hạng mức độ: high trước, rồi medium, rồi low
const SEVERITY_RANK = Object.freeze(Object.fromEntries(['high', 'medium', 'low'].map((name, rank) => [name, rank])));

module.exports = { createUnits, units: createUnits(), SEVERITY_RANK, MONTH_LEN, DATE_LEN };
