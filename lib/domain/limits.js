const { estimateHolidayOtHours, spanH } = require('./work-hours');
const { HttpError } = require('../http');
const { warnIf } = require('../warnings');
const { vnToday } = require('../request-rules');
const { DEFAULTS } = require('../../public/payroll-params.js');

// Trần cứng của giờ làm thêm (chặn 400, không đi qua warnIf).
// DAY_HOURS_CAP: giờ ròng một ngày = giờ ca + OT + làm thêm + làm bù, không tính giờ nghỉ giữa ca, tối đa bằng này.
// MONTH_OT_CAP: tổng giờ OT trong một tháng cộng giờ ca chính làm ngày lễ (monthOtHours), tối đa bằng này.
// Hai số lấy từ trần luật trong DEFAULTS (law.ceiling.otDayTotalHours, law.ceiling.otMonthHours), không khai lại ở nơi khác.
const DAY_HOURS_CAP = DEFAULTS['law.ceiling.otDayTotalHours'];
const MONTH_OT_CAP = DEFAULTS['law.ceiling.otMonthHours'];
const EPS = 1e-6;

const ddmm = date => `${date.slice(8)}/${date.slice(5, 7)}`;
const shown = n => Math.round(n * 100) / 100;

// Giờ nghỉ giữa ca lấy từ tham số của tháng: time.breakHours giờ nghỉ, một lần, sau time.breakAfterWorkHours giờ làm (cùng tham số bộ máy lương dùng)
const breakOf = params => ({
  breakHours: params['time.breakHours'],
  breakAfterHours: params['time.breakAfterWorkHours']
});

// Tổng giờ đoạn làm thêm trước ca (extraIn → giờ vào) và sau ca (giờ ra → extraOut); đoạn trùng giờ vào / ra của ca coi như không có
const extraSpanH = x =>
  (x.extraIn && x.extraIn !== x.in ? spanH(x.extraIn, x.in) : 0) +
  (x.extraOut && x.extraOut !== x.out ? spanH(x.out, x.extraOut) : 0);

// Giờ nghỉ của một đoạn làm liền dài `span` giờ = breakHours khi đoạn đủ một vòng (breakAfterHours giờ làm + breakHours giờ nghỉ), không thì 0
const restOf = (span, { breakHours, breakAfterHours }) => (span >= breakAfterHours + breakHours - EPS ? breakHours : 0);

// Giờ ròng của một ngày đi làm = Σ (độ dài mỗi đoạn − giờ nghỉ của đoạn). Đoạn gồm: giờ vào → giờ ra, và đoạn làm thêm trước / sau ca
// (chỉ khi có loại). Đoạn làm bù và ca chính trừ giờ nghỉ của chính đoạn; đoạn OT liền, không giờ nghỉ; ngày lễ (holiday) khung
// vào – ra là giờ OT nên không có giờ nghỉ để trừ.
function dayNetHours(day, { holiday = false, breakHours, breakAfterHours }) {
  const brk = { breakHours, breakAfterHours };
  const main = spanH(day.in, day.out);
  let net = main - (holiday ? 0 : restOf(main, brk));
  if (day.extraKind) {
    const segments = [
      day.extraIn && day.extraIn !== day.in ? spanH(day.extraIn, day.in) : 0,
      day.extraOut && day.extraOut !== day.out ? spanH(day.out, day.extraOut) : 0
    ];
    for (const span of segments) net += span - (day.extraKind === 'makeup' ? restOf(span, brk) : 0);
  }
  return net;
}

// Giờ OT trong tháng = giờ OT thô của mọi ngày (đoạn trước ca + đoạn sau ca khi extraKind = 'ot', kể cả phần rơi vào ngày lễ)
// + giờ ca chính rơi vào ngày lễ, mỗi phút ngày lễ tính một phút (không trừ giờ nghỉ). Làm bù không tính.
function monthOtHours(days, holidays, month) {
  return estimateHolidayOtHours(days, new Set(holidays), month);
}

// Ném 400 DAY_HOURS_CAP khi giờ ròng của ngày vượt trần
function assertDayHours(date, hours) {
  if (hours > DAY_HOURS_CAP + EPS)
    throw new HttpError(
      400,
      `Ngày ${ddmm(date)}: OT và làm thêm tối đa ${DAY_HOURS_CAP} giờ một ngày, không tính giờ nghỉ giữa ca (đang khai ${shown(hours)} giờ)`,
      { code: 'DAY_HOURS_CAP', date }
    );
}
// Ném 400 OT_MONTH_CAP khi giờ OT của tháng vượt trần và tăng so với `before` (dữ liệu cũ đã vượt thì vẫn lưu được ngày khác)
function assertMonthOt(month, hours, before) {
  if (hours > MONTH_OT_CAP + EPS && hours > before + EPS)
    throw new HttpError(
      400,
      `Tháng ${month}: OT (kể cả giờ làm ngày lễ) tối đa ${MONTH_OT_CAP} giờ (đang khai ${shown(hours)} giờ)`,
      { code: 'OT_MONTH_CAP' }
    );
}

const SAME_FIELDS = ['kind', 'in', 'out', 'extraKind', 'extraIn', 'extraOut'];
const sameDay = (a, b) => !!a && !!b && SAME_FIELDS.every(key => (a[key] || '') === (b[key] || ''));

// Kiểm từng ngày vừa thêm hoặc đổi giờ trong `clean`: ngày đi làm có đoạn làm thêm (hoặc ngày lễ, khung vào – ra là giờ OT)
// phải có giờ ròng ≤ DAY_HOURS_CAP. Ngày không đổi so với lịch đang lưu `prevDays` giữ nguyên.
function checkDayHours({ params, clean, prevDays, holidays = [] }) {
  const holidaySet = new Set(holidays);
  for (const [date, day] of Object.entries(clean)) {
    if (day.kind !== 'work' || !day.in || !day.out || sameDay(day, prevDays[date])) continue;
    const holiday = holidaySet.has(date);
    if (!holiday && !(day.extraKind && extraSpanH(day) > 0)) continue;
    assertDayHours(date, dayNetHours(day, { holiday, ...breakOf(params) }));
  }
}
// Kiểm OT cả tháng của `clean` so với lịch đang lưu `prevDays`
function checkMonthOt({ month, clean, prevDays, holidays = [] }) {
  assertMonthOt(month, monthOtHours(clean, holidays, month), monthOtHours(prevDays, holidays, month));
}

// Giới hạn khai của Lịch ước tính ngoài hai trần cứng: số ngày iSAT một tháng (isat.monthlyLimit, mặc định null = không giới hạn).
// Giống mọi chặn khác ở PUT /sheet: chỉ chặn khi tổng TĂNG so với lịch đang lưu
// (dữ liệu cũ đã vượt thì vẫn lưu được ngày khác, không chặn sửa không liên quan).
const countIsat = days => Object.values(days).filter(x => x.kind === 'isat').length;

// holidays: ngày lễ (mảng hoặc Set), để giờ ca chính làm ngày lễ tính vào trần OT tháng; không truyền thì không có ngày lễ
function checkSheetLimits({ params, month, clean, prevDays, holidays = [] }) {
  checkMonthOt({ month, clean, prevDays, holidays });
  const isatLimit = params['isat.monthlyLimit'];
  if (typeof isatLimit === 'number') {
    const now = countIsat(clean);
    // Bộ máy chỉ trả ngày iSAT đúng thứ và đúng quyền lợi, không cắt theo giới hạn tháng: ngày iSAT vượt giới hạn vẫn được trả nếu Admin duyệt
    warnIf('SHEET_ISAT_LIMIT', now > isatLimit && now > countIsat(prevDays), {
      message: `Tháng ${month}: iSAT tối đa ${isatLimit} ngày (đang khai ${now} ngày)`,
      consequence: `Nếu Admin duyệt, bộ máy vẫn trả lương cho cả ${now} ngày iSAT.`
    });
  }
}

// Cửa sổ tạo yêu cầu tạm ứng: mở khi ngày trong tháng của hôm nay (vnToday(), giờ Việt Nam) nằm trong ADVANCE_REQUEST_DAYS.
const ADVANCE_REQUEST_DAYS = Object.freeze([16, 17]);
const ADVANCE_WINDOW_CLOSED_TEXT = `Chỉ gửi được yêu cầu tạm ứng vào ngày ${ADVANCE_REQUEST_DAYS.join(' và ')} hằng tháng`;
const advanceWindowOpen = (today = vnToday()) => ADVANCE_REQUEST_DAYS.includes(Number(today.slice(8, 10)));
const advanceWindow = (today = vnToday()) => ({ days: [...ADVANCE_REQUEST_DAYS], open: advanceWindowOpen(today) });
function assertAdvanceWindowOpen(today = vnToday()) {
  if (!advanceWindowOpen(today))
    throw new HttpError(409, ADVANCE_WINDOW_CLOSED_TEXT, {
      code: 'ADVANCE_WINDOW_CLOSED',
      days: [...ADVANCE_REQUEST_DAYS]
    });
}
// Yêu cầu tạo ngày 16 hoặc 17 của tháng M là tạm ứng của tháng M: tháng xin phải là tháng (YYYY-MM) của hôm nay.
function assertAdvanceMonthCurrent(month, today = vnToday()) {
  if (month !== today.slice(0, 7))
    throw new HttpError(409, 'Chỉ xin được tạm ứng của tháng hiện tại', { code: 'ADVANCE_MONTH_NOT_CURRENT', month });
}

module.exports = {
  DAY_HOURS_CAP,
  MONTH_OT_CAP,
  extraSpanH,
  dayNetHours,
  monthOtHours,
  assertDayHours,
  assertMonthOt,
  checkDayHours,
  checkMonthOt,
  checkSheetLimits,
  breakOf,
  ADVANCE_REQUEST_DAYS,
  advanceWindow,
  advanceWindowOpen,
  assertAdvanceWindowOpen,
  assertAdvanceMonthCurrent
};
