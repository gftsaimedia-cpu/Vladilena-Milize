'use strict';
// Quyền Check-in của một nhân sự lúc iso (decide): được hay không, và theo quyền nào.
//   Quyền 'shift'        : iso nằm trong khung Check-in của ca được gán (PunchRules.checkInMsg: từ attendance.earlyCheckinMaxHours
//                          trước giờ vào ca đến trước giờ kết thúc ca của lần ca gần iso nhất), ngày công của lượt qua cổng ngày (dayBlock).
//   Quyền 'ot' / 'makeup_hours': ngoài khung đó, iso nằm trong khoảng giờ của khoản OT / làm bù theo giờ đã duyệt của ngày bắt đầu ca:
//                          trước ca = [giờ vào ca − đoạn làm thêm trước ca, giờ vào ca), sau ca = [giờ kết thúc ca, giờ kết thúc ca + đoạn làm thêm sau ca);
//                          ngày lễ có khoản OT đã duyệt: cả khung giờ vào – ra của ngày cộng hai đoạn làm thêm, vì giờ vào – ra của ngày lễ là khung OT.
//                          Ngày ngoài lịch hay ngày lễ: khung ca không áp dụng, chỉ khoảng giờ của khoản đã duyệt mới cho Check-in.
// Quyền chỉ tính từ dòng duyệt có status approved cùng loại khoản; không có quyền nào thì không được.
const PayrollParams = require('../../engine/payroll-params');

const MIN_PER_HOUR = PayrollParams.DEFAULTS['unit.minutesPerHour'];
const WINDOW_RE = /từ (\d{2}:\d{2}) đến trước (\d{2}:\d{2})/;
const ITEM_OF_KIND = { ot: 'ot', makeup: 'makeup_hours' };
const CODE = Object.freeze({ day: 'CHECKIN_NOT_ALLOWED', outside: 'CHECKIN_OUTSIDE_SHIFT' });

const toMin = (hm?) => {
  const [h, m] = hm.split(':').map(Number);
  return h * MIN_PER_HOUR + m;
};
const shiftDate = (date?, days?) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);

class CheckinEntitlement {
  declare punch: any;
  declare declared: any;
  declare dayBlock: any;
  declare punchStaff: any;

  static CODE = CODE;

  // punch: PunchRules hay hàm trả PunchRules của bộ tham số hiện tại.
  // declared(staff, date) → { day, approval, holiday } | null: ngày khai trong lịch ước tính, dòng duyệt hiệu lực của nó ({ item, status }), ngày đó có là ngày lễ.
  // dayBlock(staff, date) → { block, via, off }: cổng ngày công; block là câu báo ('' = qua), via là quyền khi qua ('shift' | 'ot' | 'makeup_hours'), off: ngày đã khai nghỉ cả ngày.
  // punchStaff(staff) → hồ sơ cho PunchRules (mặc định chính staff).
  constructor({ punch, declared, dayBlock, punchStaff = staff => staff }: any) {
    this.punch = typeof punch === 'function' ? punch : () => punch;
    this.declared = declared;
    this.dayBlock = dayBlock;
    this.punchStaff = punchStaff;
  }

  // → { allowed, entitlement, date } khi được; { allowed:false, code, message, date } khi không. date = ngày công mà lượt Check-in lúc này nhận.
  async decide(staff?, iso?) {
    const punch = await this.punch(),
      who = await this.punchStaff(staff, iso);
    const opened = punch.openSessionDay(who, iso);
    const day = await this.dayBlock(staff, opened.date);
    const window = punch.checkInMsg(who.shiftCode, iso);
    const byItem = !!day.via && day.via !== 'shift'; // ngày mở bởi khoản đã duyệt: khung ca không áp dụng
    if (!window && !byItem && !day.block) return { allowed: true, entitlement: 'shift', date: opened.date };
    const cover = await this.#cover(punch, staff, who, iso);
    if (cover.approved) return { allowed: true, entitlement: cover.approved, date: opened.date };
    if (day.block && (!window || day.off))
      return { allowed: false, code: CODE.day, message: day.block, date: opened.date };
    return {
      allowed: false,
      code: CODE.outside,
      message: this.#message(punch, who, byItem ? '' : window, cover),
      date: opened.date
    };
  }

  // Khoản làm thêm của các ngày bắt đầu ca quanh iso mà khoảng giờ chứa iso: { approved: loại khoản đã duyệt | null, pending: có khoản chờ duyệt }
  async #cover(punch?, staff?, who?, iso?) {
    const today = punch.vnDate(iso);
    const origin = punch.workBounds({ in: '00:00', out: '00:00' }, today).start; // 00:00 của ngày VN của iso, phút VN
    const t = origin + toMin(punch.vnTime(iso));
    const found: Record<string, any> = { approved: null, pending: false };
    for (const date of [shiftDate(today, -1), today, shiftDate(today, 1)]) {
      const declared = await this.declared(staff, date);
      const day = declared && declared.day;
      if (!day || (day.kind || 'work') !== 'work') continue;
      const kind = day.extraKind || (day.extraOut ? 'makeup' : '');
      const item = declared.holiday ? ITEM_OF_KIND.ot : ITEM_OF_KIND[kind];
      if (!item) continue;
      const shift = punch.SHIFT[who.shiftCode] || [];
      const from = day.in || shift[0],
        to = day.out || shift[1];
      if (!from || !to) continue;
      const core = punch.workBounds({ in: from, out: to }, date),
        full = punch.workBounds({ in: from, out: to, extraIn: day.extraIn, extraOut: day.extraOut }, date);
      const inRange = (a?, b?) => t >= a && t < b;
      const inside = declared.holiday
        ? inRange(full.start, full.end)
        : inRange(full.start, core.start) || inRange(core.end, full.end);
      if (!inside) continue;
      const approval = declared.approval;
      if (approval && approval.status === 'approved' && approval.item === item)
        found.approved = found.approved || approval.item;
      else if (!approval || approval.status === 'pending') found.pending = true;
    }
    return found;
  }

  #message(punch?, who?, window?, cover?) {
    if (cover.pending)
      return 'Yêu cầu OT hoặc làm bù cho giờ này đang chờ duyệt: Admin duyệt rồi bạn mới Check-in được.';
    if (!window)
      return 'Hôm nay không có lịch làm việc: chỉ Check-in được trong khoảng giờ OT hoặc làm bù đã được duyệt.';
    const shift = punch.SHIFT[who.shiftCode];
    const range = WINDOW_RE.exec(window);
    if (!shift || !range)
      return 'Chưa được gán ca cố định: nhờ Admin gán ca, hoặc gửi yêu cầu OT hoặc làm bù được duyệt để Check-in ngoài ca.';
    return `Bây giờ ngoài ca ${shift[0]}–${shift[1]} (Check-in trong ca từ ${range[1]} đến trước ${range[2]}). Check-in ngoài ca cần yêu cầu OT hoặc làm bù đã được duyệt cho đúng ngày và giờ này.`;
  }
}

export = { CheckinEntitlement };
