'use strict';
const { HttpError } = require('../../platform/http');
const { OtLimits } = require('../overtime/ot-limits');
const { WorkedHours } = require('../overtime/worked-hours');
const { DayMath } = require('./day-math');

const { dm, gap } = DayMath;

// Giờ làm thêm của một ngày đi làm khi làm sạch lịch (server.js → cleanDays), chặn vì là lỗi nhập.
// "Giờ bắt đầu (trước ca)" là lúc bắt đầu đoạn trước giờ vào, "Giờ kết thúc (sau ca)" là lúc kết thúc đoạn sau giờ ra: người dùng hay
// nhập giờ bắt đầu, kết thúc của một đoạn sau ca (07:00, 09:00 sau ca 22:00–07:00), khi đó báo đúng chuyện nhập nhầm ô thay vì câu trần 12 tiếng.
class ExtraTimes {
  declare limits: any;

  constructor({ limits = OtLimits.defaults() }: any = {}) {
    this.limits = limits;
  }

  // d: ngày gửi lên; extraIn / extraOut đã bỏ giờ trùng giờ vào / ra của ca
  check(date, d, { extraKind, extraIn, extraOut }: any) {
    const label = extraKind === 'ot' ? 'OT' : 'làm bù';
    if (extraKind && !extraIn && !extraOut)
      throw new HttpError(
        400,
        (d.extraIn && d.extraIn === d.in) || (d.extraOut && d.extraOut === d.out)
          ? `Ngày ${dm(date)}: giờ ${label} trùng giờ ca đang chọn. Chọn ca được gán rồi nhập giờ trước/sau ca.`
          : `Ngày ${dm(date)}: đã chọn ${label} nhưng chưa nhập giờ làm thêm`
      );
    const shiftMin = gap(d.in, d.out) || 1440;
    // Chỉ một ô có giờ, vượt trần và giờ nằm gần phía bên kia của ca (vd. chỉ "trước ca" 08:00 sau ca 22:00–07:00): nhập nhầm ô. Có cả
    // hai đoạn thì là khai thật (vd. 23:00 hôm trước tới 23:00 với ca 08:00–17:00), để DayHoursCapRule báo trần ngày
    const overCap = WorkedHours.extraSpanH({ in: d.in, out: d.out, extraIn, extraOut }) > this.limits.dayCap + 1e-6;
    const nearOtherSide =
      (extraIn && !extraOut && gap(d.out, extraIn) < gap(extraIn, d.in)) ||
      (extraOut && !extraIn && gap(extraOut, d.in) < gap(d.out, extraOut));
    const wrongSide =
      (extraIn && (gap(d.in, extraIn) <= shiftMin || (extraOut && gap(d.out, extraIn) < gap(d.out, extraOut)))) ||
      (extraOut && gap(d.in, extraOut) < shiftMin) ||
      (overCap && nearOtherSide);
    if (wrongSide)
      throw new HttpError(
        400,
        `Ngày ${dm(date)}: giờ ${label} không khớp ca ${d.in}–${d.out}. "Giờ bắt đầu (trước ca)" là lúc bắt đầu làm trước ${d.in}, "Giờ kết thúc (sau ca)" là lúc kết thúc làm sau ${d.out}; chỉ làm một phía thì để trống ô kia.`,
        { code: 'EXTRA_WRONG_SIDE' }
      );
  }
}

export = { ExtraTimes };
