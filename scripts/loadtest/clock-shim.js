'use strict';
// Nạp bằng `node -r` trước server.js khi chạy thử hiệu năng: đưa "hôm nay" tới 2026-11-26 12:00 giờ Việt Nam (ngày dữ liệu demo giả định)
// nhưng để đồng hồ vẫn chạy. Chỉ dùng cho loadtest, không bao giờ cho máy chủ thật.
const OFFSET = Date.parse('2026-11-26T12:00:00+07:00') - Date.now();
const NativeDate = Date;
function ShiftedDate(...args) {
  if (!new.target) return new NativeDate(NativeDate.now() + OFFSET).toString();
  return Reflect.construct(NativeDate, args.length ? args : [NativeDate.now() + OFFSET], new.target);
}
Object.setPrototypeOf(ShiftedDate, NativeDate);
ShiftedDate.prototype = NativeDate.prototype;
ShiftedDate.now = () => NativeDate.now() + OFFSET;
global.Date = ShiftedDate;
