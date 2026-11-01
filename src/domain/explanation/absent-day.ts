'use strict';
// Ngày vắng không phép của một người: ngày trong lịch làm việc đã qua giờ kết thúc ca mà không có lượt Check-in/out nào
// (ActualHours.apply ghi trạng thái 'absent', src/engine/actual-hours.js). Ngày này tính 0 công cho tới khi có giải trình được duyệt.
const { rulesFor, vnToday, nowIso } = require('../../platform/request-rules');
const schedule = require('../schedule');
const { estimateSheet } = require('../sheet');

class AbsentDay {
  declare store: any;

  // store: src/platform/db.ts
  constructor({ store }: any) {
    this.store = store;
  }

  // Ngày công của lượt (ca đêm thuộc ngày bắt đầu ca)
  static dayOf(session?) {
    return (session.entry.plannedShift && session.entry.plannedShift.date) || session.date;
  }

  // Tình trạng của ngày date với người username:
  //   'absent'        ngày vắng không phép (giải trình được)
  //   'future'        ngày sau hôm nay
  //   'punched'       đã có lượt Check-in/out (kể cả lượt Admin ghi) hoặc đang trong ca
  //   'off-schedule'  ngoài lịch làm việc, ngày lễ, hoặc ngoài thời gian làm việc của người
  //   'other'         còn lại: ngày đã khai nghỉ, ca chưa kết thúc, người không thuộc bảng lương
  async stateOf(username?, date?) {
    const staff = await this.store.getStaff(username);
    if (!staff || !staff.payrollSubject) return 'other';
    if (date > vnToday()) return 'future';
    const month = date.slice(0, 7);
    const sessions = await this.store.listSessions({ username, month });
    if (sessions.some(s => AbsentDay.dayOf(s) === date)) return 'punched';
    const holidays = await this.store.getSetting('holidays', []);
    const inService = (!staff.startDate || date >= staff.startDate) && (!staff.resignedOn || date <= staff.resignedOn);
    if (!inService || holidays.includes(date) || !(await schedule.isWorkDay(staff, date))) return 'off-schedule';
    const { absent } = (await rulesFor(month)).actualHours.apply(
      (await estimateSheet(username, month)).days,
      sessions,
      {
        asOf: nowIso(),
        staff,
        holidays,
        month
      }
    );
    return absent.includes(date) ? 'absent' : 'other';
  }
}

export = { AbsentDay };
