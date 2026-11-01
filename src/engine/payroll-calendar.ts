(function (root: any, factory: any) {
  // payroll-params.js phải nạp trước trang (trình duyệt) để mô-đun lấy mặc định từ DEFAULTS; vắng thì dùng FALLBACK.
  const params = typeof module === 'object' && module.exports ? require('./payroll-params') : root.PayrollParams;
  const api = factory(params);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PayrollCalendar = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (PayrollParams) {
  'use strict';
  // Mọi con số đến từ bộ tham số phẳng `params` qua create(params); hàm trần của mô-đun = create(mặc định), mặc định là
  // PayrollParams.DEFAULTS. FALLBACK là bản chép của đúng các khoá mô-đun này đọc, để trang chưa nạp
  // payroll-params.js (và test nạp mô-đun trong `vm`) vẫn chạy. Phải bằng
  // PayrollParams.DEFAULTS (scripts/params/check-fallbacks.ts kiểm).
  const FALLBACK = Object.freeze({
    'unit.minutesPerHour': 60,
    'unit.minutesPerDay': 1440,
    'unit.msPerDay': 86400000,
    'time.workHoursPerDay': 8,
    'time.breakAfterWorkHours': 4,
    'time.breakHours': 1,
    'time.nightStartHour': 22,
    'time.nightEndHour': 6
  });
  function isValidMonth(value?) {
    return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) && Number(value.slice(0, 4)) >= 1000;
  }
  function isValidDate(value?) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !isValidMonth(value.slice(0, 7)))
      return false;
    const t = new Date(value + 'T00:00:00Z');
    return Number.isFinite(t.getTime()) && t.toISOString().slice(0, 10) === value;
  }
  // Bộ tham số phẳng → các hàm tách giờ. Khoá vắng là lỗi (không đoán giá trị).
  function build(P?) {
    const need = (key?) => {
      if (!Object.hasOwn(P, key))
        throw Object.assign(new Error(`Thiếu tham số ${key}`), { code: 'PARAM_MISSING', key });
      return P[key];
    };
    const MIN_H = need('unit.minutesPerHour');
    const DAY = need('unit.minutesPerDay');
    const MS_DAY = need('unit.msPerDay');
    const WORK_MIN = need('time.workHoursPerDay') * MIN_H; // một công
    const BREAK_EVERY = need('time.breakAfterWorkHours') * MIN_H; // làm liền bấy nhiêu phút thì nghỉ
    const CYCLE = BREAK_EVERY + need('time.breakHours') * MIN_H; // một vòng: giờ làm + giờ nghỉ
    const NIGHT_FROM = need('time.nightStartHour') * MIN_H; // khung đêm [từ, đến) trong ngày dân sự
    const NIGHT_TO = need('time.nightEndHour') * MIN_H;

    function minutes(value?) {
      if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
      return Number(value.slice(0, 2)) * MIN_H + Number(value.slice(3));
    }
    // Only main-shift work is counted here. Extra segments retain their own approval rules.
    function splitMainWork(entry?, date?, holidays?) {
      // holidayBreakH: phần giờ ngày lễ (đã nằm trong holidayH) là phút nằm trong giờ nghỉ của ca, nay tính như giờ làm
      // holidayBreakNightH: phần của holidayBreakH rơi vào khung đêm (giờ nghỉ đêm đã trả theo hệ số ngày lễ nên không trả thêm Off Paid)
      const zero = { normalH: 0, holidayH: 0, nightH: 0, holidayNightH: 0, holidayBreakH: 0, holidayBreakNightH: 0 };
      if (!isValidDate(date) || !entry) return zero;
      const d = entry.attendanceConfirmed
        ? { ...entry, in: entry.plannedShift?.in || entry.in, out: entry.plannedShift?.out || entry.out, breakMin: 0 }
        : entry;
      const start = minutes(d.in),
        out = minutes(d.out);
      if (start === null || out === null) return zero;
      const end = out > start ? out : out + DAY;
      const hol = new Set<any>(Array.from(holidays || []).filter(isValidDate));
      const next = new Date(Date.parse(date + 'T00:00:00Z') + MS_DAY).toISOString().slice(0, 10);
      const holidayAt = (minute?) => hol.has(minute < DAY ? date : next);
      const work: any[] = [];
      // Một đoạn làm liền chỉ nghỉ MỘT lần (1 ca làm nghỉ 1 tiếng); breakSlots, splitMainWork và actual-hours phải trùng nhau.
      // Giờ làm ngày lễ là OT nên không có giờ nghỉ: phút nghỉ rơi vào ngày lễ vẫn là phút làm (holidayBreak ghi các phút đó).
      const holidayBreak = new Set<any>();
      for (let t = start; t < end; t++) {
        const inBreak = t - start >= BREAK_EVERY && t - start < CYCLE;
        if (inBreak && holidayAt(t)) holidayBreak.add(t);
        if (!inBreak || holidayAt(t)) work.push(t);
      }
      // Giờ tính từ Check-in/out thực tế: cắt đúng phút làm việc ở đầu ca (vào trễ) và cuối ca (ra sớm),
      // để phần ngày lễ của ca qua nửa đêm chỉ mất đúng phần bị cắt.
      const cutStart = Math.min(work.length, Math.max(0, Math.floor(Number(d.cutStartMin) || 0)));
      const cutEnd = Math.min(work.length - cutStart, Math.max(0, Math.floor(Number(d.cutEndMin) || 0)));
      if (cutStart || cutEnd) (work.splice(work.length - cutEnd, cutEnd), work.splice(0, cutStart));
      // Legacy breakMin has no timestamps: distribute this deduction across actual work minutes.
      const deduction = Math.max(0, Number(d.breakMin) || 0);
      const weight = work.length ? Math.max(0, work.length - deduction) / work.length : 0;
      // Trần một công (WORK_MIN) chỉ áp cho phút ngày thường; phút ngày lễ là OT nên tính hết
      let paid = 0;
      for (const minute of work) {
        const holiday = holidayAt(minute);
        const amount = holiday ? weight : Math.min(weight, WORK_MIN - paid);
        if (amount <= 0) continue;
        const local = minute % DAY,
          night = local >= NIGHT_FROM || local < NIGHT_TO;
        zero[holiday ? 'holidayH' : 'normalH'] += amount / MIN_H;
        if (night) zero.nightH += amount / MIN_H;
        if (holiday && night) zero.holidayNightH += amount / MIN_H;
        if (holidayBreak.has(minute)) {
          zero.holidayBreakH += amount / MIN_H;
          if (night) zero.holidayBreakNightH += amount / MIN_H;
        }
        if (!holiday) paid += amount;
      }
      // Round minute accumulation so exact whole-hour caps do not drift above server limits.
      for (const key of Object.keys(zero)) zero[key] = Math.round(zero[key] * 1e10) / 1e10;
      return zero;
    }
    // Đoạn làm thêm (OT hoặc làm bù, trước hoặc sau ca) tách theo NGÀY DÂN SỰ của từng phút làm việc. Đoạn làm bù trừ giờ nghỉ của
    // chính đoạn (nghỉ MỘT lần time.breakHours sau time.breakAfterWorkHours giờ làm, giống breakSlots của payroll-engine.js); đoạn OT
    // không có giờ nghỉ, mọi phút có mặt đều tính. normalH + holidayH = extraWorkHours.
    // holidayNightH là phần giờ ngày lễ rơi vào khung 22h–6h (đã nằm trong holidayH).
    // isRest (tuỳ chọn, hàm ngày → đúng/sai): có thì thêm weekendH = phần normalH rơi vào ngày isRest đúng (ngày nghỉ cuối tuần của người), tính theo ngày dân sự của từng phút;
    // ngày lễ thắng ngày nghỉ cuối tuần nên phút ngày lễ không vào weekendH.
    function splitExtraWork(entry?, date?, holidays?, isRest?) {
      const zero: Record<string, any> = {
        normalH: 0,
        holidayH: 0,
        holidayNightH: 0,
        ...(isRest ? { weekendH: 0 } : {})
      };
      if (!isValidDate(date) || !entry) return zero;
      const kind = entry.extraKind || (entry.extraOut ? 'makeup' : '');
      const start = minutes(entry.in),
        out = minutes(entry.out);
      if (!kind || start === null || out === null) return zero;
      const spanOf = (from?, to?) => (((to - from) % DAY) + DAY) % DAY || DAY; // a → b qua nửa đêm; trùng nhau = 24 giờ
      const mainEnd = start + spanOf(start, out);
      const segments: any[] = [];
      const extraIn = minutes(entry.extraIn),
        extraOut = minutes(entry.extraOut);
      if (extraIn !== null && entry.extraIn !== entry.in) segments.push([start - spanOf(extraIn, start), start]);
      if (extraOut !== null && entry.extraOut !== entry.out) segments.push([mainEnd, mainEnd + spanOf(out, extraOut)]);
      const hol = new Set<any>(Array.from(holidays || []).filter(isValidDate));
      const hasBreak = kind !== 'ot'; // OT không trừ giờ nghỉ
      const dayKey = (offset?) =>
        new Date(Date.parse(date + 'T00:00:00Z') + offset * MS_DAY).toISOString().slice(0, 10);
      const isHoliday = new Map<any, any>(),
        isRestDate = new Map<any, any>();
      let normal = 0,
        weekend = 0,
        holiday = 0,
        holidayNight = 0;
      for (const [from, to] of segments) {
        for (let t = from; t < to; t++) {
          if (hasBreak && t - from >= BREAK_EVERY && t - from < CYCLE) continue; // giờ nghỉ của đoạn làm bù (một lần mỗi đoạn)
          const offset = Math.floor(t / DAY);
          if (!isHoliday.has(offset)) {
            isHoliday.set(offset, hol.has(dayKey(offset)));
            isRestDate.set(offset, !isHoliday.get(offset) && !!isRest && !!isRest(dayKey(offset)));
          }
          const local = ((t % DAY) + DAY) % DAY;
          if (!isHoliday.get(offset)) {
            normal++;
            if (isRestDate.get(offset)) weekend++;
          } else {
            holiday++;
            if (local >= NIGHT_FROM || local < NIGHT_TO) holidayNight++;
          }
        }
      }
      return {
        normalH: normal / MIN_H,
        holidayH: holiday / MIN_H,
        holidayNightH: holidayNight / MIN_H,
        ...(isRest ? { weekendH: weekend / MIN_H } : {})
      };
    }

    return { splitMainWork, splitExtraWork };
  }

  // Một bộ tham số → một bản mô-đun (nhớ theo đối tượng: bộ tham số của tháng được đóng băng và dùng lại cho cả bảng lương)
  const built = new WeakMap<any, any>();
  function create(params?) {
    if (!params || typeof params !== 'object')
      throw new TypeError('create(params): cần bộ tham số phẳng (PayrollParams.DEFAULTS)');
    if (!built.has(params))
      built.set(params, Object.freeze({ isValidDate, isValidMonth, ...build(params), FALLBACK, create }));
    return built.get(params);
  }
  // Mặc định: PayrollParams.DEFAULTS (hàm trần của mô-đun = create(mặc định)); vắng payroll-params.js thì FALLBACK
  return create(PayrollParams && PayrollParams.DEFAULTS ? PayrollParams.DEFAULTS : FALLBACK);
});
