'use strict';
// Lịch chấm công của một nhân viên trong một tháng: mỗi ngày là một bản khai (đi làm, nghỉ, làm bù...).
// "Số ngày đi làm thực tế" chỉ có MỘT nơi trả lời là workedDays() ở đây, tính ra khi hỏi, không lưu sẵn thành thuộc tính,
// để bảng, phiếu và bản in không thể lệch nhau.
class AttendanceCalendar {
  // days: ngày 'YYYY-MM-DD' → bản khai của ngày đó
  constructor({ month, days }) {
    this.month = month; // tháng, dạng 'YYYY-MM'
    this.days = days || {}; // bản khai các ngày trong tháng
  }

  // Bản khai của một ngày, rỗng nếu ngày đó chưa khai
  dayOf(date) {
    return this.days[date] ?? null;
  }

  // Số ngày đi làm thực tế của tháng. Chưa nối: quy tắc đếm ngày làm bù, ngày nghỉ có lương chưa có ở đây
  workedDays() {
    return this.#notWired('workedDays');
  }

  // Tóm tắt tháng: ngày đủ công, phút đi muộn, ngày thiếu chấm
  summary() {
    return this.#notWired('summary');
  }

  // Phương thức chưa nối: báo rõ thay vì trả kết quả giả
  #notWired(method) {
    throw new Error(`AttendanceCalendar.${method} chưa nối`);
  }
}

module.exports = { AttendanceCalendar };
