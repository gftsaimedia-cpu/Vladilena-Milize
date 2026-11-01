/* Lịch làm việc: MỘT nguồn cho mọi câu hỏi "ngày nào là ngày làm".
   Dùng chung trình duyệt (window.WorkSchedule) và máy chủ (require('./src/engine/work-schedule')). Thuần: không I/O, không đồng hồ, không DOM.
   Lịch của một người trong một tháng = lịch của loại nhân sự của người đó (type.<mã>.dows, workdays, workdaysMode của bộ tham số tháng),
   hoặc các thứ trong staff.sched khi đầu vào của bộ máy hay của bước dựng lượt chấm công có mảng đó. Thứ trong tuần: 0 = Chủ nhật như Date.getUTCDay.
   Mọi con số đến từ bộ tham số phẳng `params` qua create(params); FALLBACK là bản chép CHUYỂN TIẾP (như punch.js, actual-hours.js) cho trang chưa nạp
   payroll-params.js và phải bằng PayrollParams.DEFAULTS (scripts/params/check-fallbacks.ts kiểm).
   Chỉ có lịch tuần (`week`); lịch theo chu kỳ (`cycle`) chưa hỗ trợ. Chủ nhật không bao giờ là ngày làm. */
(function (root: any, factory: any) {
  const PayrollParams = typeof module === 'object' && module.exports ? require('./payroll-params') : root.PayrollParams;
  const api = factory(PayrollParams);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WorkSchedule = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (PayrollParams) {
  'use strict';
  const FALLBACK = Object.freeze({
    'unit.daysPerWeek': 7,
    'type.ctv.dows': Object.freeze([1, 2, 3, 4, 5, 6]),
    'type.ctv.workdays': 26,
    'type.ctv.workdaysMode': 'fixed',
    'type.nv.dows': Object.freeze([1, 2, 3, 4, 5, 6]),
    'type.nv.workdays': 26,
    'type.nv.workdaysMode': 'fixed',
    'type.tts.dows': Object.freeze([1, 2, 3, 4, 5]),
    'type.tts.workdays': 22,
    'type.tts.workdaysMode': 'fixed'
  });
  // Nhãn thứ cho giao diện: chỉ số = thứ (0 = Chủ nhật)
  const DAY_LABEL = Object.freeze(['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']);
  const DAY_NAME = Object.freeze(['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy']);
  const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
  const ISO_DATE = 'YYYY-MM-DD'; // độ dài chuỗi ngày
  const hasOwn = (o?, k?) => Object.prototype.hasOwnProperty.call(o, k);
  const freeze = (value?) => {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const item of Object.values(value)) freeze(item);
    }
    return value;
  };
  const dowOf = (date?) => new Date(date + 'T00:00:00Z').getUTCDay();

  function build(P?) {
    // hai hằng đơn vị có bản chuyển tiếp: bộ tham số rút gọn của test vẫn dùng được; khoá lịch của chức vụ thì không đoán
    const unit = (key?) => (hasOwn(P, key) ? P[key] : FALLBACK[key]);
    const WEEK = unit('unit.daysPerWeek');
    const typeKeyOf = (type?) => (typeof type === 'string' && hasOwn(P, `type.${type}.dows`) ? type : null);

    /* ---------- lịch của chức vụ ---------- */
    const typeCache = new Map<any, any>();
    function typeSchedule(type?) {
      const code = typeKeyOf(type);
      // chức vụ lạ (không có khoá lịch trong bộ tham số của tháng) không có ngày làm: không rơi về chức vụ nào khác
      if (code === null)
        return freeze({
          source: 'type',
          from: null,
          pattern: { type: 'week', dows: [] },
          workdays: { mode: 'fixed', value: null }
        });
      if (!typeCache.has(code)) {
        const mode = hasOwn(P, `type.${code}.workdaysMode`) ? P[`type.${code}.workdaysMode`] : 'fixed';
        typeCache.set(
          code,
          freeze({
            source: 'type',
            from: null,
            pattern: { type: 'week', dows: [...P[`type.${code}.dows`]] },
            workdays:
              mode === 'computed'
                ? { mode: 'computed' }
                : { mode: 'fixed', value: hasOwn(P, `type.${code}.workdays`) ? P[`type.${code}.workdays`] : null }
          })
        );
      }
      return typeCache.get(code);
    }

    /* ---------- lịch của người ---------- */
    // Lịch của một người = lịch của loại nhân sự (tháng đã nằm trong bộ tham số `P` của mô-đun). Đầu vào có staff.sched (mảng thứ,
    // 0 = Chủ nhật; ca vàng của bộ máy và bước dựng lượt chấm công truyền vào) thì các thứ đó là ngày làm, ngày công chuẩn vẫn theo loại.
    // Cơ sở dữ liệu không lưu mảng này.
    function scheduleOf(staff?) {
      const base = typeSchedule(staff && staff.type);
      if (staff && Array.isArray(staff.sched))
        return freeze({
          source: 'person',
          from: null,
          pattern: { type: 'week', dows: [...staff.sched] },
          workdays: base.workdays
        });
      return base;
    }
    const scheduleFor = (staff?) => scheduleOf(staff);

    /* ---------- câu hỏi theo ngày ---------- */
    function patternHas(pattern?, date?) {
      if (!pattern) return false;
      if (pattern.type !== 'week')
        throw Object.assign(new Error('Lịch theo chu kỳ chưa được bật'), { code: 'SCHEDULE_CYCLE_NOT_ENABLED' });
      return pattern.dows.includes(dowOf(date));
    }
    const isWorkDay = (schedule?, date?) => patternHas(schedule.pattern, date);
    // Ngày nghỉ cuối tuần của người: Chủ nhật (thứ 0) hoặc Thứ Bảy (thứ unit.daysPerWeek − 1) mà lịch của người không có ngày đó;
    // Thứ Bảy nằm trong lịch là ngày làm thường. Ngày trong tuần khác không bao giờ là ngày nghỉ cuối tuần, dù không nằm trong lịch.
    const isRestDay = (schedule?, date?) => [0, WEEK - 1].includes(dowOf(date)) && !isWorkDay(schedule, date);
    function datesOf(pattern?, month?) {
      if (!pattern || !MONTH_RE.test(month)) return [];
      const [year, mon] = month.split('-').map(Number);
      const out: any[] = [];
      for (
        let d = new Date(Date.UTC(year, mon - 1, 1));
        d.getUTCMonth() === mon - 1;
        d.setUTCDate(d.getUTCDate() + 1)
      ) {
        const date = d.toISOString().slice(0, ISO_DATE.length);
        if (patternHas(pattern, date)) out.push(date);
      }
      return out;
    }
    const scheduledDates = (schedule?, month?) => datesOf(schedule.pattern, month);
    // Ngày công chuẩn của tháng: cố định, hoặc số ngày làm của tháng theo lịch (ngày lễ trong lịch vẫn tính)
    function workdaysOf(schedule?, month?) {
      const w = schedule.workdays;
      return w.mode === 'computed' ? scheduledDates(schedule, month).length : w.value;
    }

    // pay.method C: ngày công chuẩn của MỌI chức vụ = số ngày làm việc THỰC của tháng theo lịch của chức vụ (một nguồn lịch: đếm ở đây, không đếm riêng ở nơi khác).
    // Phương án khác trả chính P (cùng đối tượng); C thì nhớ một bản đã thay type.<mã>.workdays cho mỗi tháng.
    const monthViews = new Map<any, any>();
    function monthView(month?) {
      if (P['pay.method'] !== 'C' || typeof month !== 'string') return P;
      if (!monthViews.has(month)) {
        const patch: Record<string, any> = {};
        for (const key of Object.keys(P)) {
          const m = /^type\.([a-z0-9_]+)\.workdays$/.exec(key);
          if (m && Array.isArray(P[`type.${m[1]}.dows`]))
            patch[key] = datesOf(typeSchedule(m[1]).pattern, month).length;
        }
        monthViews.set(month, Object.freeze({ ...P, ...patch }));
      }
      return monthViews.get(month);
    }

    // Một người trong một tháng cho bộ máy tính lương: lịch hiệu lực, ngày công chuẩn của tháng, và bộ tham số mà bộ máy phải dùng.
    // Mẫu số lương ngày (type.<mã>.workdays) lệch với ngày công chuẩn của NGƯỜI (mảng thứ của đầu vào hoặc tự đếm theo lịch) thì trả bản bộ tham số thay đúng khoá đó
    // (cùng một cơ chế với monthView của pay.method C: daily, hourly, tỷ lệ ngày đi làm, miễn thuế, tạm ứng đều đọc một mẫu số). Mặc định: chính P, workdaysStd vắng.
    const views = new Map<any, any>();
    function forPerson(staff?, month?) {
      const schedule = scheduleOf(staff);
      const code = typeKeyOf(staff && staff.type);
      const key = `type.${code}.workdays`;
      const days = typeof month === 'string' && code !== null ? workdaysOf(schedule, month) : null;
      if (days === null || !hasOwn(P, key)) return { schedule, params: P };
      // chỉ ghi workdaysStd khi lịch là mảng thứ của đầu vào hoặc ngày công chuẩn tự đếm theo lịch: kỳ cũ và người mặc định giữ nguyên bản chụp
      const out: Record<string, any> = { schedule, params: P };
      if (schedule.source === 'person' || schedule.workdays.mode === 'computed') out.workdaysStd = days;
      if (days !== P[key]) {
        const id = `${key}=${days}`;
        if (!views.has(id)) views.set(id, Object.freeze({ ...P, [key]: days }));
        out.params = views.get(id);
      }
      return out;
    }

    /* ---------- hiển thị ---------- */
    function describe(schedule?) {
      const dows = schedule.pattern.dows;
      const run = dows.length > 1 && dows.every((d, i) => i === 0 || d === dows[i - 1] + 1);
      const label = run
        ? `${DAY_LABEL[dows[0]]} – ${DAY_LABEL[dows[dows.length - 1]]}`
        : dows.map(d => DAY_LABEL[d]).join(', ');
      return { kind: schedule.pattern.type, label, dows: [...dows] };
    }

    // Ngày thứ `day` của tháng `month` dạng YYYY-MM-DD (cho nơi đếm ngày theo số thứ tự)
    const dateIn = (month?, day?) => {
      const [year, mon] = month.split('-').map(Number);
      return new Date(Date.UTC(year, mon - 1, day)).toISOString().slice(0, ISO_DATE.length);
    };

    return {
      WEEK,
      dateIn,
      scheduleOf,
      scheduleFor,
      forPerson,
      monthView,
      isWorkDay,
      isRestDay,
      workdaysOf,
      scheduledDates,
      describe,
      DAY_LABEL,
      DAY_NAME
    };
  }

  // Một bộ tham số → một bản mô-đun (nhớ theo đối tượng: bộ tham số của tháng được đóng băng và dùng lại)
  const built = new WeakMap<any, any>();
  function create(params?) {
    if (!params || typeof params !== 'object')
      throw new TypeError('create(params): cần bộ tham số phẳng (PayrollParams.DEFAULTS)');
    if (!built.has(params)) built.set(params, Object.freeze({ ...build(params), FALLBACK, create }));
    return built.get(params);
  }
  return create(PayrollParams && PayrollParams.DEFAULTS ? PayrollParams.DEFAULTS : FALLBACK);
});
