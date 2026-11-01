'use strict';
// Giải trình lúc bấm: mọi lần Check-in / Check-out không hợp lệ phải đi kèm giải trình ngay lúc bấm. Hợp lệ hay không do SessionStatus
// (src/domain/attendance/session-status.ts) quyết, đúng luật nhãn của lượt:
//   Check-in : vào trễ quá attendance.graceMin, ngoài ca, ngoài vùng GPS, lượt thứ hai trong cùng một ca;
//   Check-out: về sớm, Check-out muộn quá config.CHECKOUT_GRACE_MIN (đường riêng của late-checkout-session.js).
// Bấm không hợp lệ mà chưa có giải trình thì 409 CHECKIN_NEEDS_EXPLANATION / CHECKOUT_NEEDS_EXPLANATION kèm trường hợp và số phút; có giải
// trình thì lần bấm được ghi đúng giờ bấm và giải trình gắn với lượt (punch-in / punch-out), lượt "Chờ xử lý" cho tới khi Admin quyết định.
const { HttpError } = require('../../platform/http');
const { SessionStatus } = require('../attendance/session-status');

const SIDE = {
  in: { code: 'CHECKIN_NEEDS_EXPLANATION', kind: 'punch-in' },
  out: { code: 'CHECKOUT_NEEDS_EXPLANATION', kind: 'punch-out' }
};

class PunchExplanation {
  declare classifier: any;
  declare lateCheckout: any;
  declare explanations: any;

  // classifier: SessionStatus; lateCheckout: LateCheckout (dựng entry khi đóng lượt, kiểm lượt trùng ca, ghi nhật ký); explanations: ExplanationService
  constructor({ classifier, lateCheckout, explanations }: any) {
    this.classifier = classifier;
    this.lateCheckout = lateCheckout;
    this.explanations = explanations;
  }

  // Các trường hợp Check-in không hợp lệ của lượt vừa dựng opened = { date, entry } (chưa lưu)
  async casesIn(username?, opened?) {
    const cases = await this.classifier.pressCases(
      { username, date: opened.date, state: 'open', entry: opened.entry },
      'in'
    );
    const planned = opened.entry.plannedShift;
    if (planned && (await this.lateCheckout.hasDuplicate(username, planned)))
      cases.push({ code: 'multiple', minutes: 0, note: SessionStatus.NOTE.multiple });
    return cases;
  }

  // Các trường hợp Check-out không hợp lệ nếu lượt đang mở session đóng lúc at (không kể Check-out muộn quá mức: đường riêng)
  async casesOut({ staff, session, at, sheetDay }: any) {
    const entry = await this.lateCheckout.closedEntry(staff, session, at);
    return await this.classifier.pressCases({ ...session, state: 'closed', entry }, 'out', sheetDay);
  }

  // Có trường hợp không hợp lệ mà chưa có giải trình kèm lần bấm: 409
  demand(side?, cases?, text?, details: any = {}) {
    if (!cases.length || (typeof text === 'string' && text.trim())) return;
    const notes = cases.map(c => c.note).join(' · ');
    throw new HttpError(409, `Cần giải trình: ${notes}`, {
      code: SIDE[side].code,
      case: cases[0].code,
      minutes: cases[0].minutes,
      note: notes,
      cases,
      ...details
    });
  }

  // Ghi giải trình kèm lần bấm vào lượt session (đã lưu); trả dạng view() của giải trình
  async record({ side, username, session, cases, text, actx }: any) {
    const prior = await this.explanations.forSession(session.id, SIDE[side].kind);
    const made = await this.explanations.submitForSession({
      username,
      session,
      text,
      kind: SIDE[side].kind,
      prompt: cases.map(c => c.note).join(' · ')
    });
    await this.lateCheckout.auditExplanation(actx, 'explanation.punch', prior, made, null);
    return made;
  }
}

export = { PunchExplanation };
