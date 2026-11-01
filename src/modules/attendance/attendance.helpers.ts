import { Inject, Injectable } from '@nestjs/common';
import { RULES, STORE } from '../../core/tokens';
import { SheetHelpers } from '../sheet';

const { CheckinEntitlement } = require('../../domain/attendance/checkin-entitlement'); // Check-in lúc này có được không, theo quyền nào
const { punchStaff } = require('../../domain/attendance'); // phiên Check-in/out dùng chung
const shiftsDomain = require('../../domain/shifts'); // giờ ca (nhân viên đọc qua phần bổ sung của /api/punch)
// quy tắc theo tháng của từng yêu cầu: rulesFor(tháng).<mô-đun> dựng bằng create(bộ tham số của tháng đó)
const { estimateSheet, schedule } = require('../../domain/sheet'); // lịch ước tính và ngày phép
const { sessionHistory } = require('../../domain/attendance/session-view');
const { sheetApprovals } = require('../../domain/approvals'); // khoản tự khai chờ duyệt

/* ---------- check-in / check-out ---------- */
// Nhân viên chỉ Check-in được cho ngày công (ngày punch.js gán cho lượt: ca đêm thuộc ngày bắt đầu ca, lượt ngoài khung ca thuộc ngày bấm) là:
//   ngày làm việc trong lịch của loại nhân sự và không phải ngày lễ; hoặc
//   ngày có khoản OT (kể cả OT khai trên ngày lễ) hay làm bù theo giờ ở trạng thái đã duyệt (sheetApprovals: khoản Admin khai thay được duyệt ngay khi lưu).
// Ngày tự khai đi làm không có khoản duyệt, khoản chờ duyệt hay bị từ chối đều không mở Check-in.
// Ngày nghỉ cả ngày cũng đóng Check-in: iSAT, nghỉ phép năm, nghỉ không lương đã khai (chờ duyệt hay đã duyệt, trừ khoản bị từ chối);
// nghỉ được duyệt, nghỉ sẽ làm bù chỉ khi đã duyệt. Ngoại lệ: ngày đó có khoản OT hay làm bù đã duyệt. checkInDay trả câu báo '' khi ngày qua, ngược lại câu báo cho nhân viên.
// Thời điểm bấm còn phải nằm trong khung ca hoặc trong khoảng giờ của khoản đã duyệt: src/domain/attendance/checkin-entitlement.ts (checkInVerdict) ghép hai điều kiện.
export const CHECKIN_ITEMS = ['ot', 'makeup_hours'];
export const OFF_DECLARED = ['isat', 'leave', 'unpaid'];
export const OFF_DAY_TEXT = {
  isat: 'nghỉ iSAT',
  leave: 'nghỉ phép năm',
  unpaid: 'nghỉ không lương',
  approved: 'nghỉ được duyệt',
  willmakeup: 'nghỉ, sẽ làm bù'
};
// block: câu báo ('' = ngày qua cổng); off: ngày đã khai nghỉ cả ngày; via: 'shift' khi ngày nằm trong lịch và không đóng, ngược lại loại khoản đã duyệt mở ngày đó.

// Ngày khai trong lịch ước tính của nhân sự và dòng duyệt hiệu lực của nó; null khi ngày không có khai

// "Nếu Check-out bây giờ": chạy ActualHours.apply của tháng trên ca đang mở được đóng vào lúc này

// Phần bổ sung (không lưu vào bản phát lại theo requestId) của GET / POST /api/punch

@Injectable()
export class AttendanceHelpers {
  constructor(
    @Inject(STORE) private readonly store: any,
    @Inject(RULES) private readonly rules: any,
    @Inject(SheetHelpers) private readonly sheetHelpers: SheetHelpers
  ) {}

  checkInDay = async (staff, date) => {
    const { day, approval } = (await this.declaredDay(staff, date)) || {};
    const holiday = (await this.store.getSetting('holidays', [])).includes(date);
    const scheduled = !holiday && (await schedule.isWorkDay(staff, date));
    const off = day && Object.hasOwn(OFF_DAY_TEXT, day.kind) ? day.kind : '';
    const closed = OFF_DECLARED.includes(off)
      ? !approval || approval.status !== 'rejected'
      : approval && approval.status === 'approved';
    if (approval && approval.status === 'approved' && CHECKIN_ITEMS.includes(approval.item))
      return { block: '', via: scheduled && !off ? 'shift' : approval.item };
    if (off && closed) return { block: `Hôm nay bạn ${OFF_DAY_TEXT[off]}, không Check-in được.`, via: '', off: true };
    if (scheduled) return { block: '', via: 'shift' };
    return {
      block: 'Hôm nay bạn không có lịch làm việc hay giờ OT/làm bù được duyệt nên không Check-in được.',
      via: ''
    };
  };

  declaredDay = async (staff, date) => {
    const month = date.slice(0, 7);
    const day = (await estimateSheet(staff.username, month)).days[date];
    return day
      ? {
          day,
          approval: (await sheetApprovals(staff.username, month, { [date]: day }))[date] || null,
          holiday: (await this.store.getSetting('holidays', [])).includes(date)
        }
      : null;
  };

  punchState = async staff => {
    const punch = (await this.rules.rulesFor()).punch;
    const openSession = await this.store.openSession(staff.username),
      lastSession = await this.store.lastSession(staff.username);
    // Không có lượt mở: xét ngày công mà một lượt Check-in lúc này sẽ nhận. canCheckIn false kèm checkInBlock (câu lý do) khi bị chặn;
    // checkInBlock chỉ có mặt khi bị chặn
    const verdict = openSession ? null : await this.checkInVerdict(staff, this.rules.nowIso());
    const block = verdict && !verdict.allowed ? verdict.message : '';
    const canCheckIn = !openSession && !block;
    const shownOpen = await sessionHistory(openSession),
      shownLast = await sessionHistory(lastSession);
    const s = openSession || lastSession,
      shown = shownOpen || shownLast,
      day = s?.entry;
    // Nhãn của lượt do máy chủ phân loại (status, statusNote: cùng nơi với phiếu): record mang đúng nhãn đó để màn nhân viên không đọc kind 'pending' của lượt
    // đã bị từ chối thành "Chờ xử lý"; `pending` (lý do lượt đang chờ) chỉ có khi lượt thật sự chờ xử lý
    const record = day ? { ...day, status: shown.status, statusNote: shown.statusNote } : null;
    // Các trường tương thích mang đúng phiên đã chọn, không gộp danh sách phiên thành ngày lương.
    return {
      enabled: true,
      canCheckIn,
      ...(block ? { checkInBlock: block, checkInCode: verdict.code } : {}),
      ...(canCheckIn ? { checkInEntitlement: verdict.entitlement } : {}),
      openSession: shownOpen,
      lastSession: shownLast,
      open: openSession
        ? {
            id: openSession.id,
            at: day.presIn,
            since: punch.vnTime(day.presIn),
            date: openSession.date,
            plannedShift: day.plannedShift || null
          }
        : null,
      date: s?.date || punch.vnDate(this.rules.nowIso()),
      ...(await schedule.punchSchedule(staff, s?.date || punch.vnDate(this.rules.nowIso()))),
      record,
      sunday: false,
      outside: '',
      done: !openSession && day?.presOut ? { in: punch.vnTime(day.presIn), out: punch.vnTime(day.presOut) } : null,
      pending: !openSession && day?.kind === 'pending' && shown.status === 'pending' ? day.reason : null
    };
  };

  checkoutPreview = async staff => {
    const open = await this.store.openSession(staff.username);
    const planned = open && open.entry && open.entry.plannedShift;
    if (!planned || !planned.date || !planned.in || !planned.out) return null;
    const month = planned.date.slice(0, 7),
      now = this.rules.nowIso();
    const others = (await this.store.listSessions({ username: staff.username, month })).filter(s => s.id !== open.id);
    const closed = { id: open.id, date: open.date, state: 'closed', entry: { ...open.entry, presOut: now } };
    const { report } = (await this.rules.rulesFor(month)).actualHours.apply(
      { [planned.date]: { kind: 'work', in: planned.in, out: planned.out } },
      [...others, closed].filter(s => s.date === planned.date),
      {
        asOf: now,
        staff,
        holidays: await this.store.getSetting('holidays', []),
        month
      }
    );
    const r = report[planned.date];
    if (!r || r.state !== 'ok') return null; // ngoài lịch / ngoài ca: không áp được
    return { early: r.early || 0, cutEnd: r.cutEndMin || 0, cutStart: r.cutStartMin || 0, paidMin: r.paidMin };
  };

  private _checkinEntitlement: any;
  get checkinEntitlement() {
    return (this._checkinEntitlement ??= new CheckinEntitlement({
      punch: async () => (await this.rules.rulesFor()).punch,
      declared: this.declaredDay,
      dayBlock: this.checkInDay,
      punchStaff
    }));
  }

  punchExtras = async staff => ({
    serverNow: this.rules.nowIso(),
    cutRule: await this.sheetHelpers.cutRuleView(this.rules.vnToday().slice(0, 7)),
    shiftConfig: await shiftsDomain.employeeView(this.rules.vnToday().slice(0, 7)), // giờ ca và hai ngưỡng Check-in cho nhân viên (không có config.read)
    checkoutPreview: await this.checkoutPreview(staff)
  });

  checkInVerdict = async (staff, iso) => await this.checkinEntitlement.decide(staff, iso);
}
