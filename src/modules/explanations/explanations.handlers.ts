import { Inject, Injectable } from '@nestjs/common';
import { AUTHZ, DOMAIN, EVENTS, STORE } from '../../core/tokens';
const { AsyncList } = require('../../shared/async-list');
// Route giải trình (nghiệp vụ ở explanation-service.js). src/domain/routes.js gửi /api/explanations/... tới handle().
//   GET  /api/explanations[?status=][&user=]   nhân sự: của mình; người có attendance.correct (Admin): mọi người (user= lọc một người)
//   POST /api/explanations { sessionId, text }                nhân sự giải trình Check-out muộn cho lượt của CHÍNH MÌNH (gửi lại sau khi bị từ chối;
//                                                             lần đầu thường gửi kèm POST /api/punch { explanation })
//   POST /api/explanations { date, text }                    nhân sự tự giải trình ngày vắng của CHÍNH MÌNH (ngày trong lịch, đã qua, không có lượt Check-in/out,
//                                                             kỳ chưa chốt công, chưa có giải trình về ngày đó): tạo giải trình loại admin, requestedBy = người gửi,
//                                                             trạng thái answered, chờ Admin duyệt (một công theo giờ ca) hoặc từ chối (vắng)
//   POST /api/explanations { username, date, prompt, source?, ruleId? }   Admin yêu cầu một người giải trình về một ngày (source 'ai' khi bấm từ phát hiện của AI)
//   POST /api/explanations/:id/answer { text }                nhân sự trả lời yêu cầu của mình
//   POST /api/explanations/:id/decide { approve, note?, expectedRev? }   Admin duyệt (approve true) hoặc không duyệt; chưa duyệt / không duyệt thì
//                                                             ngày đó không tính lương. expectedRev lệch → 409 EXPLANATION_STALE; tự duyệt của chính mình
//                                                             → cảnh báo. Giải trình Check-out muộn: duyệt thì giờ bấm thành
//                                                             giờ Check-out của lượt (late-checkout-session.js)
//                                                             Giải trình ngày: duyệt ngày quên Check-in/out thì ghi công theo giờ ca (phản hồi
//                                                             recorded; admin-presence.js → syncExplanation), từ chối thì bỏ công đó, ngày không tính công

const { HttpError, readJson } = require('../../platform/http');
const { USERNAME_RE } = require('../../domain/input');

const { AbsentDay } = require('../../domain/explanation/absent-day');

const CAP = 'attendance.correct';

// requestedOut: giờ nhân sự bấm Check-out muộn (lượt đang "Quên Check-out" chờ duyệt); Admin duyệt thì giờ này thành giờ Check-out

@Injectable()
export class ExplanationsHandlers {
  constructor(
    @Inject(STORE) private readonly store: any,
    @Inject(AUTHZ) private readonly authz: any,
    @Inject(DOMAIN) private readonly domain: any,
    @Inject(EVENTS) private readonly events: any
  ) {}

  private _absentDay: any;
  get absentDay() {
    return (this._absentDay ??= new AbsentDay({ store: this.store }));
  }

  isAdmin = async me => (await this.authz.scopeOf(me, CAP)) === 'all';

  auditRow = async (...args) => await this.domain.lateCheckout.auditExplanation(...args);

  requestedOut = async row =>
    (row.kind === 'late-checkout' &&
      row.sessionId &&
      ((await this.store.getSession(row.sessionId)) || {}).entry?.requestedOut) ||
    null;

  withName = async row => ({
    ...row,
    name: ((await this.store.getStaff(row.username)) || {}).name || row.username,
    requestedOut: await this.requestedOut(row)
  });

  changed = async row => {
    await this.events.emit.approvalsChanged(row.date.slice(0, 7)); // Admin nạp lại
    // giải trình gắn với một lượt quyết định trạng thái hiển thị của lượt đó: màn Chấm công đang mở nạp lại
    if (row.sessionId) await this.events.emit.attendanceChanged('explanation', row.date.slice(0, 7));
    await this.events.emit.punchChanged(row.username, row.date); // nhân sự nạp lại
  };
}
