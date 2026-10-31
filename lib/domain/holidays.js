'use strict';
const store = require('../db');
const config = require('../config');
const { HttpError } = require('../http');
const { validDate } = require('./input');

// Tên ngày lễ (ví dụ "Tết Dương lịch"): chỉ là nhãn hiển thị, lưu ở khoá riêng của bảng settings { 'YYYY-MM-DD': 'Tên' }; KHÔNG ảnh hưởng cách tính ngày lễ
// (danh sách ngày vẫn ở khoá `holidays`). Ngày bị bỏ khỏi danh sách thì tên của ngày đó cũng bị bỏ.
const KEY = 'holiday_names';
const HAS_MARKUP = /[<>]/;
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);

const read = async () => {
  const value = await store.getSetting(KEY, {});
  return isObj(value) ? value : {};
};
// Bản tên cho danh sách ngày mới `dates`: `incoming` (đối tượng, thay toàn bộ) hoặc vắng (giữ tên hiện có của các ngày còn lại). Lỗi đầu vào là 400, không ghi gì.
async function clean(incoming, dates) {
  if (incoming === undefined) {
    const current = await read();
    return Object.fromEntries(Object.entries(current).filter(([date]) => dates.includes(date)));
  }
  if (!isObj(incoming)) throw new HttpError(400, 'Tên ngày lễ phải là đối tượng { "YYYY-MM-DD": "tên" }');
  const out = {};
  for (const [date, raw] of Object.entries(incoming)) {
    if (!validDate(date) || !dates.includes(date))
      throw new HttpError(
        400,
        `Ngày ${String(date).slice(0, config.ERROR_ECHO_FIELD_MAX)} không nằm trong danh sách ngày lễ, không đặt được tên`
      );
    if (raw === null || raw === '') continue; // xoá tên
    const name = typeof raw === 'string' ? raw.trim() : '';
    if (!name || [...name].length > config.HOLIDAY_NAME_MAX)
      throw new HttpError(400, `Tên ngày lễ ${date} phải từ 1 đến ${config.HOLIDAY_NAME_MAX} ký tự`);
    if (HAS_MARKUP.test(name)) throw new HttpError(400, `Tên ngày lễ ${date} không được chứa ký tự < hoặc >`);
    out[date] = name;
  }
  return out;
}
// Ghi (trong giao dịch của PUT /holidays); trả true khi có đổi
async function write(names) {
  const before = await read();
  if (JSON.stringify(sorted(before)) === JSON.stringify(sorted(names))) return false;
  await store.setSetting(KEY, sorted(names));
  return true;
}
const sorted = names => Object.fromEntries(Object.entries(names).sort(([a], [b]) => (a < b ? -1 : 1)));

module.exports = { read, clean, write };
