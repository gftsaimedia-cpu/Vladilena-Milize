'use strict';
const { rulesFor } = require('../../platform/request-rules');

// Giờ làm việc: ca theo giờ (cùng quy tắc với giao diện), giờ OT, giờ ròng của một ngày, giờ OT trong tháng.
// Phần đo thời gian là hàm tĩnh thuần; phần cần giờ nghỉ giữa ca là phương thức của đối tượng dựng từ tham số của tháng.
const EPS = 1e-6;

class WorkedHours {
  #breakHours;
  #breakAfterHours;

  // breakHours: giờ nghỉ, một lần, sau breakAfterHours giờ làm (cùng tham số bộ máy lương dùng: time.breakHours, time.breakAfterWorkHours)
  constructor({ breakHours, breakAfterHours }: any) {
    this.#breakHours = breakHours;
    this.#breakAfterHours = breakAfterHours;
  }

  get breakHours() {
    return this.#breakHours;
  }

  get breakAfterHours() {
    return this.#breakAfterHours;
  }

  static forParams(params?) {
    return new WorkedHours({
      breakHours: params['time.breakHours'],
      breakAfterHours: params['time.breakAfterWorkHours']
    });
  }

  /* ---------- đo thời gian ---------- */
  static toMin(t?) {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  }

  static overlapsNight(a?, b?) {
    let e = b;
    if (e <= a) e += 1440;
    for (let t = a; t < e; t++) {
      const x = t % 1440;
      if (x >= 1320 || x < 360) return true;
    }
    return false;
  }

  // Số giờ từ tin đến tout; tout <= tin tính là qua nửa đêm
  static spanH(tin?, tout?) {
    const a = WorkedHours.toMin(tin),
      b = WorkedHours.toMin(tout);
    let diff = b - a;
    if (diff <= 0) diff += 1440;
    return diff / 60;
  }

  static shiftFor(tin?, tout?) {
    const a = WorkedHours.toMin(tin),
      b = WorkedHours.toMin(tout);
    if (WorkedHours.overlapsNight(a, b)) return 'night';
    if (a < 420 || b >= 1320) return 'flex';
    return 'normal';
  }

  /* ---------- giờ OT ---------- */
  // Giờ OT của một ngày đi làm: đoạn trước ca cộng đoạn sau ca, chỉ khi loại làm thêm là OT. OT không trừ giờ nghỉ: mỗi phút có mặt
  // trong đoạn là một phút OT (khớp splitExtraWork của bộ máy lương), nên ví dụ 17:00–22:00 sau ca ngày là 5 giờ.
  static extraOtHours(x?) {
    return x.extraKind === 'ot' && x.in && x.out
      ? (x.extraIn ? WorkedHours.spanH(x.extraIn, x.in) : 0) + (x.extraOut ? WorkedHours.spanH(x.out, x.extraOut) : 0)
      : 0;
  }

  // ca đêm cũng có OT (đoạn OT vẫn không được rơi vào 22h–6h)
  static estimateOtHours(x?) {
    return x.in && x.out ? WorkedHours.extraOtHours(x) : 0;
  }

  static actualOtHours(x?) {
    return !x.otReview || x.otReview.ok ? WorkedHours.extraOtHours(x) : 0;
  }

  static async estimateHolidayOtHours(days?, holidays?, month?) {
    const payrollCalendar = (await rulesFor(month)).calendar;
    return Object.entries<any>(days).reduce(
      (sum, [date, x]: any) =>
        sum +
        WorkedHours.estimateOtHours(x) +
        (x.kind === 'work' && x.in && x.out ? payrollCalendar.splitMainWork(x, date, holidays).holidayH : 0),
      0
    );
  }

  static async actualHolidayOtHours(rows?, holidays?, month?) {
    const payrollCalendar = (await rulesFor(month)).calendar;
    const holidayShifts = new Map<any, any>();
    for (const s of rows)
      if (s.state === 'closed' && s.entry.attendanceConfirmed && s.entry.kind === 'work') {
        const p = s.entry.plannedShift,
          key = p ? `${p.startIso}/${p.endIso}` : String(s.id);
        const h = payrollCalendar.splitMainWork(s.entry, s.date, holidays).holidayH;
        holidayShifts.set(key, Math.max(holidayShifts.get(key) || 0, h));
      }
    return (
      rows.reduce((sum, s) => sum + WorkedHours.actualOtHours(s.entry), 0) +
      [...holidayShifts.values()].reduce((sum, h) => sum + h, 0)
    );
  }

  // Giờ OT trong tháng = giờ OT thô của mọi ngày (đoạn trước ca + đoạn sau ca khi extraKind = 'ot', kể cả phần rơi vào ngày lễ)
  // + giờ ca chính rơi vào ngày lễ, mỗi phút ngày lễ tính một phút (không trừ giờ nghỉ). Làm bù không tính.
  static async monthOtHours(days?, holidays?, month?) {
    return await WorkedHours.estimateHolidayOtHours(days, new Set<any>(holidays), month);
  }

  /* ---------- giờ ròng của một ngày ---------- */
  // Tổng giờ đoạn làm thêm trước ca (extraIn → giờ vào) và sau ca (giờ ra → extraOut); đoạn trùng giờ vào / ra của ca coi như không có
  static extraSpanH(x?) {
    return (
      (x.extraIn && x.extraIn !== x.in ? WorkedHours.spanH(x.extraIn, x.in) : 0) +
      (x.extraOut && x.extraOut !== x.out ? WorkedHours.spanH(x.out, x.extraOut) : 0)
    );
  }

  // Giờ nghỉ của một đoạn làm liền dài `span` giờ = breakHours khi đoạn đủ một vòng (breakAfterHours giờ làm + breakHours giờ nghỉ), không thì 0
  restOf(span?) {
    return span >= this.#breakAfterHours + this.#breakHours - EPS ? this.#breakHours : 0;
  }

  // Giờ ròng của một ngày đi làm = Σ (độ dài mỗi đoạn − giờ nghỉ của đoạn). Đoạn gồm: giờ vào → giờ ra, và đoạn làm thêm trước / sau ca
  // (chỉ khi có loại). Đoạn làm bù và ca chính trừ giờ nghỉ của chính đoạn; đoạn OT liền, không giờ nghỉ; ngày lễ (holiday) khung
  // vào – ra là giờ OT nên không có giờ nghỉ để trừ.
  dayNetHours(day?, { holiday = false }: any = {}) {
    const main = WorkedHours.spanH(day.in, day.out);
    let net = main - (holiday ? 0 : this.restOf(main));
    if (day.extraKind) {
      const segments = [
        day.extraIn && day.extraIn !== day.in ? WorkedHours.spanH(day.extraIn, day.in) : 0,
        day.extraOut && day.extraOut !== day.out ? WorkedHours.spanH(day.out, day.extraOut) : 0
      ];
      for (const span of segments) net += span - (day.extraKind === 'makeup' ? this.restOf(span) : 0);
    }
    return net;
  }
}

export = { WorkedHours, EPS };
