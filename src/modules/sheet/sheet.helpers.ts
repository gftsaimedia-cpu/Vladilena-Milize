import { Inject, Injectable } from '@nestjs/common';
import { RULES, STORE } from '../../core/tokens';

const { HttpError } = require('../../platform/http'); // tiện ích HTTP: lỗi, gửi JSON, đọc thân, tiêu đề bảo mật, file tĩnh
// quy tắc theo tháng của từng yêu cầu: rulesFor(tháng).<mô-đun> dựng bằng create(bộ tham số của tháng đó)
const { validDate, TIME_RE, NOTE_MAX } = require('../../domain/input'); // kiểm dạng tháng, ngày, giờ, tên đăng nhập
const { shiftFor } = require('../../domain/overtime/worked-hours').WorkedHours; // giờ ca, OT, giờ làm ngày lễ
const { estimateSheet, leaveDates } = require('../../domain/sheet'); // lịch ước tính và ngày phép
const { timesheet } = require('../../domain/timesheet/services'); // kiểm nghiệp vụ lịch khai
const { DayMath } = require('../../domain/timesheet/day-math');
const { sheetFlagsOf } = require('../../domain/positions'); // cờ quyền lợi và chức vụ

/* ---------- số liệu theo tham số của tháng, cho app nhân viên: chỉ đọc, không ghi ---------- */
// Bảng số phút bị trừ theo số phút trễ / về sớm (chỉ số = số phút, 0..SHIFT_WORK_MIN; trễ hơn nữa thì dùng phần tử cuối), dựng từ cutMin
// của đúng tháng: app nhân viên tra bảng thay vì tự làm tròn bằng quy tắc mặc định.

// Số phép năm tính đến hôm nay của một nhân sự theo quy tắc của tháng chứa hôm nay (cùng mã với kiểm số dư của PUT /sheet:
// rulesFor(tháng của ngày).leave.accrued và leaveDates); null khi chức vụ / bậc không có tài khoản phép

// Báo cáo từng ngày của ActualHours.apply (trạng thái, phút trễ / về sớm, phút bị trừ) cho cả tháng như app nhân viên. null khi không phải nhân sự được trả lương

/* ---------- kiểm tra dữ liệu vào ---------- */
// 'makeup': loại ngày cũ, chỉ để ngày đã lưu gửi lại không đổi đi qua; khai mới hoặc sửa bị chặn ở checkSheet (SHEET_MAKEUP_DAY_REMOVED)
export const DAY_KINDS = ['work', 'makeup', 'leave', 'unpaid', 'willmakeup', 'approved', 'isat'];

// Mã ca của một ngày: mã ca trong danh mục (Normal1…) hoặc mã cũ n1…g2 của ngày đã lưu trước đó
export const PRESET_RE = /^(n1|n2|f1|f2|g1|g2|[A-Z][A-Za-z]*[0-9]+)$/;

@Injectable()
export class SheetHelpers {
  constructor(
    @Inject(RULES) private readonly rules: any,
    @Inject(STORE) private readonly store: any
  ) {}

  cutRuleView = async month => {
    const ah = (await this.rules.rulesFor(month)).actualHours;
    const { GRACE_MIN, STEP_MIN, SHIFT_WORK_MIN } = ah.RULE;
    return {
      graceMin: GRACE_MIN,
      stepMin: STEP_MIN,
      shiftWorkMin: SHIFT_WORK_MIN,
      rounding: ah.POLICY.cutRounding,
      table: Array.from({ length: SHIFT_WORK_MIN + 1 }, (_, minutes) => ah.cutMin(minutes))
    };
  };

  leaveBalanceView = async staff => {
    if (!staff || !staff.payrollSubject) return null;
    const today = this.rules.vnToday();
    if (!sheetFlagsOf((await this.rules.rulesFor(today.slice(0, 7))).params, staff.type, staff.level).hasLeaveAccount)
      return null;
    // Sổ phép (src/engine/leave.ts → ledger): dùng phép cũ trước, phép tích luỹ tới 31/12 hết hạn cuối tháng leave.expiry.month của năm sau
    const got = (await this.rules.rulesFor(today.slice(0, 7))).leave.ledger(
      staff,
      (await leaveDates(staff)).filter(d => d <= today),
      today
    );
    return {
      asOf: today,
      accrued: got.total,
      start: got.start,
      months: got.months,
      seniority: got.seniority, // thâm niên (ngày)
      birthdays: got.birthdays,
      adjust: got.adjust,
      used: got.used,
      expired: got.expired, // phép đã hết hạn (đã quy tiền vào phiếu tháng liền sau)
      remaining: got.balance,
      balance: got.balance,
      expiring: got.expiring // { days, on } trong khoảng từ 01/01 tới ngày hết hạn, null khi không có
    };
  };

  actualReportView = async (staff, month) => {
    if (!staff || !staff.payrollSubject) return null;
    const { report, missing, absent } = (await this.rules.rulesFor(month)).actualHours.apply(
      (await estimateSheet(staff.username, month)).days,
      await this.store.listSessions({ username: staff.username, month }),
      {
        asOf: this.rules.nowIso(),
        staff,
        holidays: await this.store.getSetting('holidays', []),
        month
      }
    );
    return { report, missing, absent };
  };

  isShiftCode = async code =>
    typeof code === 'string' && PRESET_RE.test(code) && Object.hasOwn((await this.rules.rulesFor()).punch.SHIFT, code);

  cleanDays = async (days: any) => {
    if (!days || typeof days !== 'object' || Array.isArray(days)) throw new HttpError(400, 'days phải là object');
    const out = {};
    for (const [date, d] of Object.entries(days) as [string, any][]) {
      if (!validDate(date) || !d || typeof d !== 'object') throw new HttpError(400, `Ngày không hợp lệ: ${date}`);
      // Thiếu kind (bản ghi rất cũ) là đi làm; giá trị lạ bị từ chối, không âm thầm đổi thành đi làm
      const kind = d.kind === undefined ? 'work' : d.kind;
      if (!DAY_KINDS.includes(kind)) throw new HttpError(400, `Ngày ${DayMath.dm(date)}: loại ngày không hợp lệ`);
      if (kind === 'work' || kind === 'makeup') {
        if (typeof d.in !== 'string' || typeof d.out !== 'string' || !TIME_RE.test(d.in) || !TIME_RE.test(d.out))
          throw new HttpError(400, `Giờ không hợp lệ ở ngày ${DayMath.dm(date)}`);
        // Không giới hạn khoảng cách giữa giờ vào và giờ ra (vd. 20:00→09:00 được lưu); giờ trả lương do engine giới hạn
        if (
          (d.extraOut && (typeof d.extraOut !== 'string' || !TIME_RE.test(d.extraOut))) ||
          (d.extraIn && (typeof d.extraIn !== 'string' || !TIME_RE.test(d.extraIn)))
        )
          throw new HttpError(400, `Giờ làm thêm không hợp lệ ở ngày ${DayMath.dm(date)}`);
        if (d.extraKind != null && typeof d.extraKind !== 'string')
          throw new HttpError(400, `Ngày ${DayMath.dm(date)}: loại làm thêm không hợp lệ`);
        if (d.extraKind && !['makeup', 'ot'].includes(d.extraKind))
          throw new HttpError(400, `Ngày ${DayMath.dm(date)}: loại làm thêm phải là làm bù hoặc OT`);
        // làm thêm trước ca (giờ vào làm thêm → giờ vào) và/hoặc sau ca (giờ ra → giờ ra làm thêm); trùng giờ ca coi như không có
        const extraIn = d.extraIn && d.extraIn !== d.in ? d.extraIn : '',
          extraOut = d.extraOut && d.extraOut !== d.out ? d.extraOut : '';
        // Bản ghi cũ có giờ ra làm thêm mà thiếu extraKind là làm bù (đúng như calcDay và approval-view đọc): giữ nguyên giờ,
        // không xoá. Chỉ có giờ vào làm thêm thì calcDay không tính gì: giữ nguyên giờ, để extraKind rỗng, không đoán loại.
        const extraKind = d.extraKind || (extraOut ? 'makeup' : '');
        // Thiếu giờ làm thêm, giờ trùng giờ ca, nhập nhầm phía (trước / sau ca): src/domain/timesheet/services.ts → checkExtraTimes
        timesheet().extraTimes.check(date, d, { extraKind, extraIn, extraOut });
        if (d.preset != null && d.preset !== '' && !(await this.isShiftCode(d.preset)))
          throw new HttpError(400, `Ngày ${DayMath.dm(date)}: ca chọn sẵn không hợp lệ`);
        const breakMin = d.breakMin == null ? 0 : d.breakMin;
        if (!Number.isInteger(breakMin) || breakMin < 0 || breakMin > 1440)
          throw new HttpError(
            400,
            `Ngày ${DayMath.dm(date)}: số phút ra khỏi văn phòng phải là số nguyên từ 0 đến 1440`
          );
        out[date] = {
          kind,
          shift: shiftFor(d.in, d.out),
          in: d.in,
          out: d.out,
          extraKind,
          extraIn,
          extraOut,
          preset: d.preset || '',
          breakMin
        };
      } else out[date] = { kind };
      // Giải trình Check-in/out (tuỳ chọn, mọi loại ngày): chữ do người khai nhập, Admin xem khi duyệt
      if (d.punchNote != null) {
        if (typeof d.punchNote !== 'string')
          throw new HttpError(400, `Ngày ${DayMath.dm(date)}: giải trình phải là chữ`);
        const punchNote = d.punchNote.trim();
        if (punchNote.length > NOTE_MAX)
          throw new HttpError(400, `Ngày ${DayMath.dm(date)}: giải trình tối đa ${NOTE_MAX} ký tự`);
        if (punchNote) out[date].punchNote = punchNote;
      }
      // "Nghỉ, sẽ làm bù": ngày/giờ làm bù dự kiến CHỈ để Admin xem khi duyệt, không chặn gì (ngày nào, giờ nào, dài bao lâu, qua đêm, để trống).
      // Chỉ làm sạch kiểu dữ liệu: ô sai dạng thành rỗng, tối đa 31 dòng, bỏ dòng trống hoàn toàn.
      if (kind === 'willmakeup') {
        const text = (value, ok) => (typeof value === 'string' && ok(value) ? value : '');
        if (Array.isArray(d.makeupPlans)) {
          const plans = d.makeupPlans
            .filter(plan => plan && typeof plan === 'object' && !Array.isArray(plan))
            .slice(0, 31)
            .map(plan => ({
              date: text(plan.date, validDate),
              from: text(plan.from, v => TIME_RE.test(v)),
              to: text(plan.to, v => TIME_RE.test(v))
            }))
            .filter(plan => plan.date || plan.from || plan.to);
          if (plans.length) out[date].makeupPlans = plans;
        } else if (typeof d.makeupDate === 'string' && validDate(d.makeupDate)) {
          out[date].makeupDate = d.makeupDate; // dữ liệu cũ chỉ có ngày
        }
      }
    }
    return out;
  };
}
