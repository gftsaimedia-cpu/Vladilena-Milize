'use strict';
const { WorkedHours } = require('../overtime/worked-hours');

const { toMin } = WorkedHours;

// Phép tính thuần về ngày và giờ của Lịch ước tính; không đọc DB, không ghi cảnh báo.
class DayMath {
  // Ngày hiện cho người dùng dạng dd/mm
  static dm(date?) {
    return `${date.slice(8)}/${date.slice(5, 7)}`;
  }

  // Phút từ a tới b theo chiều kim đồng hồ (qua nửa đêm được); trùng nhau = 0
  static gap(a?, b?) {
    return (((toMin(b) - toMin(a)) % 1440) + 1440) % 1440;
  }

  // Ngày ISO sau khi cộng days ngày (âm được), theo lịch địa phương
  static shiftDate(date?, days?) {
    const [y, m, d] = date.split('-').map(Number);
    const x = new Date(y, m - 1, d + days);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  }

  static dayOfWeek(date?) {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(y, m - 1, d).getDay();
  }

  static lastDayOf(month?) {
    const [y, m] = month.split('-').map(Number);
    return `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
  }

  // Hai ngày có cùng loại và cùng giờ (kể cả giờ làm thêm); dùng để không chặn lại cặp giờ đã lưu mà chưa sửa
  static sameHours(a?, b?) {
    return (
      !!a &&
      !!b &&
      ['kind', 'in', 'out', 'extraKind', 'extraIn', 'extraOut'].every(key => (a[key] || '') === (b[key] || ''))
    );
  }

  // Phút của khoảng khai [day.in, day.out) nằm ngoài khung ca [shiftIn, shiftOut) (đếm từng phút, qua nửa đêm được), để nhận ra giờ
  // đi làm rộng hơn ca được gán. wraps: khoảng khai chứa trọn ca.
  static outsideShift(day?, shiftIn?, shiftOut?) {
    const len = DayMath.gap(day.in, day.out) || 1440,
      shiftLen = DayMath.gap(shiftIn, shiftOut) || 1440,
      start = toMin(day.in),
      from = toMin(shiftIn);
    let min = 0;
    for (let t = 0; t < len; t++) if ((((start + t - from) % 1440) + 1440) % 1440 >= shiftLen) min++;
    return { min, wraps: min > 0 && len - min === shiftLen };
  }
}

export = { DayMath };
