// Route yêu cầu tạm ứng theo tháng (lưu ở ./advance-approvals.js). src/domain/routes.js gửi
// /api/advance-approvals/... tới handle(). Số tạm ứng là số theo quy tắc do bộ máy lương tính (src/domain/advance/advance-cap.ts → figuresOf); không ai nhập số.
// CHỈ người cần mới gửi yêu cầu; chỉ trừ vào phiếu khi Admin đã duyệt. Không xin, đang chờ, bị từ chối: 0.
//   GET  /api/advance-approvals?month=[&username=]   người duyệt (hoặc xem lương): CHỈ người đã gửi yêu cầu của tháng (mọi trạng thái), mỗi người
//        { username, name, eligible, reason?, amount, status, rev, requestedAt, decidedAt, decidedBy, note }, kèm pending (số chờ duyệt);
//        nhân sự: của mình (item, status null = chưa xin). Kèm rev của tháng, provisional (số còn chưa chốt vì chưa qua ngày advance.untilDay)
//        và window { days, open } (open = hôm nay là một ngày trong days: ngày được tạo yêu cầu)
//   POST /api/advance-approvals/request  { month, expectedRev? }                     nhân sự xin tạm ứng cho chính mình (mỗi tháng một yêu cầu; ngoài ngày window.days: 409 ADVANCE_WINDOW_CLOSED; month khác tháng hôm nay: 409 ADVANCE_MONTH_NOT_CURRENT)
//   POST /api/advance-approvals/withdraw { month, expectedRev? }                     nhân sự rút yêu cầu đang chờ của mình
//   POST /api/advance-approvals/approve  { month, username, expectedRev? }           duyệt yêu cầu đang chờ (expectedRev = rev của người đó)
//   POST /api/advance-approvals/reject   { month, username, expectedRev?, reason? }  từ chối yêu cầu đang chờ
//   POST /api/advance-approvals/cancel   { month, username, expectedRev?, reason? }  huỷ duyệt (yêu cầu về lại chờ duyệt)
//   POST /api/advance-approvals/approve-all { month, expectedRev? }                  duyệt mọi yêu cầu ĐANG CHỜ (expectedRev = rev của tháng);
//        bỏ qua người không còn được ứng, chính người duyệt, người ngoài phạm vi duyệt và người có số đã chốt bằng 0 (trả trong skipped)
// Quyền: gửi / rút chỉ cho chính mình (cổng ROUTE_CAPS: đã đăng nhập); duyệt, từ chối, huỷ duyệt cần request.decide.advance ở phạm vi từng người
// (cổng: request.decide.*). Kỳ đã duyệt hoặc đã chi trả: luôn 409 PERIOD_LOCKED (phiếu đã chốt, không đổi khoản trừ; kiểm chống ghi đè). Ghi, nhật ký trong một giao dịch; sự kiện sau khi COMMIT.
import { Inject, Injectable } from '@nestjs/common';
import { AUDIT, AUTHZ, EVENTS, STORE } from '../../core/tokens';

const advanceCap = require('../../domain/advance/advance-cap');
const { DECIDE_CAP } = require('../../domain/advance/advance-requests');
const { selfDecision, optionalReason } = require('../../platform/warnings');
const { HttpError, readJson } = require('../../platform/http');
const { validMonth, USERNAME_RE, NOTE_MAX } = require('../../domain/input');
const { AdvanceRequestWindow } = require('../../domain/advance/advance-request-window');
const requestWindow = new AdvanceRequestWindow();
const { DomainError } = require('../../domain/shared/domain-error');
const { advanceApprovals } = require('../../domain/advance/index');

// Trạng thái kỳ khoá mọi thay đổi tạm ứng: phiếu đã duyệt hoặc đã chi trả không đổi nữa
const LOCKED_STATUSES = Object.freeze(['approved', 'paid']);
const PERIOD_TEXT = Object.freeze({ approved: 'đã duyệt', paid: 'đã chi trả' });
// Việc của từng bước: tên nhật ký, câu "đang làm gì" cho cảnh báo tự duyệt, quyết định gửi tới nhân sự (null = không báo)
const ACTIONS = Object.freeze({
  request: { audit: 'advance.request', decision: null },
  withdraw: { audit: 'advance.withdraw', decision: null },
  approve: { audit: 'advance.approve', doing: 'duyệt tạm ứng', decision: 'approved' },
  reject: { audit: 'advance.reject', doing: 'từ chối tạm ứng', decision: 'rejected' },
  cancel: { audit: 'advance.cancel', doing: 'huỷ duyệt tạm ứng', decision: 'cancelled' }
});

// Người xem được của người khác: có quyền duyệt (phạm vi tất cả) hoặc xem lương

function monthOf(body) {
  const month = body && body.month;
  if (!validMonth(month)) throw new HttpError(400, 'month phải có dạng YYYY-MM', { code: 'BAD_MONTH' });
  return month;
}
function userOf(value) {
  const username = typeof value === 'string' ? value.toLowerCase() : '';
  if (!USERNAME_RE.test(username)) throw new HttpError(400, 'username không hợp lệ', { code: 'BAD_USERNAME' });
  return username;
}
const revOf = body => (body.expectedRev !== undefined ? body.expectedRev : body.rev);

const figureOf = async (month, username) =>
  (await advanceCap.figuresOf(month, [username])).figures.get(username) || {
    eligible: false,
    reason: 'Không có nhân sự này',
    amount: 0
  };
function assertEligible(month, figure) {
  if (!figure || !figure.eligible)
    throw new HttpError(403, (figure && figure.reason) || 'Người này không thuộc diện được ứng lương', {
      code: 'ADVANCE_NOT_ELIGIBLE',
      month
    });
}

// Một dòng: số theo quy tắc + trạng thái yêu cầu

// Sau COMMIT: Admin nạp lại danh sách và huy hiệu; người được quyết định nạp lại ước tính và thẻ tạm ứng

// Nhân sự gửi hoặc rút yêu cầu của chính mình

// Admin duyệt, từ chối hoặc huỷ duyệt yêu cầu của một người

@Injectable()
export class AdvanceApprovalsHandlers {
  constructor(
    @Inject(AUTHZ) private readonly authz: any,
    @Inject(STORE) private readonly store: any,
    @Inject(AUDIT) private readonly audit: any,
    @Inject(EVENTS) private readonly events: any
  ) {}

  viewsAll = async me =>
    (await this.authz.scopeOf(me, DECIDE_CAP)) === 'all' || (await this.authz.scopeOf(me, 'payroll.view')) === 'all';

  assertEditable = async month => {
    const status = await this.store.periods.status(month);
    if (LOCKED_STATUSES.includes(status))
      throw DomainError.conflict(
        'PERIOD_LOCKED',
        `Kỳ lương ${month} ${PERIOD_TEXT[status]}: không đổi tạm ứng được nữa`,
        {
          month,
          status,
          scope: 'slip'
        }
      );
  };

  canDecide = async (me, username) => await this.authz.can(me, DECIDE_CAP, { username });

  itemOf = async (username, figure, entry) => ({
    username,
    name: ((await this.store.getStaff(username)) || {}).name || username,
    eligible: figure.eligible,
    ...(figure.reason ? { reason: figure.reason } : {}),
    amount: figure.amount,
    status: entry.status,
    rev: entry.rev,
    requestedAt: entry.requestedAt,
    decidedAt: entry.decidedAt,
    decidedBy: entry.decidedBy,
    note: entry.reason
  });

  auditMove = async (actx, action, month, username, before, after, reason) => {
    await this.audit.write(actx, {
      action,
      entityKind: 'advance_request',
      entityId: `${month}/${username}`,
      subject: username,
      month,
      before: before && before.status ? this.audit.pick(before, ['status', 'rev']) : null,
      after: this.audit.pick(after, ['status', 'rev']),
      reason: reason || null,
      sensitivity: 'pay'
    });
  };

  announce = async (month, usernames, decision) => {
    await this.events.emit.approvalsChanged(month);
    if (!decision) return;
    for (const username of usernames) {
      this.events.emit.advanceDecided(username, month, decision);
      this.events.emit.estimateChanged(username, month);
    }
  };

  list = async ({ res, url, me }) => {
    const q = url.searchParams;
    const month = q.get('month');
    if (!validMonth(month)) throw new HttpError(400, 'month phải có dạng YYYY-MM', { code: 'BAD_MONTH' });
    const asked = q.get('username') ? userOf(q.get('username')) : undefined;
    const all = await this.viewsAll(me);
    if (asked !== undefined && asked !== me.username && !all)
      throw new HttpError(403, 'Chỉ xem được tạm ứng của chính mình', { code: 'FORBIDDEN_CAP' });
    const target = asked !== undefined ? asked : all ? undefined : me.username;
    const doc = await advanceApprovals.read(month);
    if (target !== undefined) {
      const { provisional, figures } = await advanceCap.figuresOf(month, [target]);
      const figure = figures.get(target) || { eligible: false, reason: 'Không có nhân sự này', amount: 0 };
      return {
        month,
        scope: target === me.username ? 'self' : 'person',
        rev: doc.rev,
        provisional,
        window: requestWindow.view(),
        item: await this.itemOf(target, figure, await advanceApprovals.entryOf(month, target))
      };
    }
    // Chỉ người đã gửi yêu cầu (không liệt kê người được ứng mà chưa xin: trông như yêu cầu tự gửi)
    const requests = await advanceApprovals.requests(month);
    const { provisional, figures } = requests.size
      ? await advanceCap.figuresOf(month, [...requests.keys()])
      : { provisional: false, figures: new Map() };
    const items: any[] = [];
    for (const [username, entry] of requests)
      items.push(await this.itemOf(username, figures.get(username) || { eligible: false, amount: 0 }, entry));
    const pending = items.filter(r => r.status === 'pending').length;
    return {
      month,
      scope: 'all',
      rev: doc.rev,
      provisional,
      window: requestWindow.view(),
      pending,
      items
    };
  };

  own = async ({ req, res, me, actx }, move) => {
    const body = await readJson(req);
    const month = monthOf(body);
    if (move === 'request') {
      requestWindow.assertOpen();
      requestWindow.assertMonthCurrent(month);
    }
    const username = me.username;
    const { provisional, figures } = await advanceCap.figuresOf(month, [username]);
    const figure = figures.get(username) || { eligible: false, reason: 'Không có nhân sự này', amount: 0 };
    if (move === 'request') {
      assertEligible(month, figure);
      if (!figure.amount && !provisional)
        throw DomainError.conflict(
          'ADVANCE_ZERO',
          'Tạm ứng của tháng này là 0 ₫ (không có ngày đi làm tới hạn tạm ứng)',
          {
            month
          }
        );
    }
    const done = await this.store.transaction(async () => {
      await this.assertEditable(month);
      const change = await advanceApprovals.move(month, username, move, { expectedRev: revOf(body), by: username });
      await this.auditMove(actx, ACTIONS[move].audit, month, username, change.before, change.after, null);
      return change;
    });
    await this.announce(month, [username], null);
    return {
      month,
      rev: (await advanceApprovals.read(month)).rev,
      item: await this.itemOf(username, figure, done.after)
    };
  };

  decideOne = async ({ req, res, me, actx }, move) => {
    const body = await readJson(req);
    const month = monthOf(body);
    const username = userOf(body && body.username);
    const reason =
      move === 'approve'
        ? null
        : optionalReason(body.reason, { max: NOTE_MAX, tooLong: `Lý do tối đa ${NOTE_MAX} ký tự` }) || null;
    const staff = await this.store.getStaff(username);
    if (!staff) throw new HttpError(404, 'Không có nhân sự này', { code: 'STAFF_NOT_FOUND' });
    if (!(await this.canDecide(me, username)))
      throw new HttpError(403, 'Bạn không có quyền duyệt tạm ứng của người này', { code: 'FORBIDDEN_CAP' });
    const figure = await figureOf(month, username);
    if (move === 'approve') assertEligible(month, figure);
    const done = await this.store.transaction(async () => {
      await this.assertEditable(month);
      selfDecision(this.authz.isSelfDecision(me, username), {
        doing: ACTIONS[move].doing
      });
      const change = await advanceApprovals.move(month, username, move, {
        expectedRev: revOf(body),
        by: me.username,
        reason
      });
      await this.auditMove(actx, ACTIONS[move].audit, month, username, change.before, change.after, reason);
      return change;
    });
    await this.announce(month, [username], ACTIONS[move].decision);
    return {
      month,
      rev: (await advanceApprovals.read(month)).rev,
      item: await this.itemOf(username, figure, done.after)
    };
  };

  approveAll = async ({ req, res, me, actx }) => {
    const body = await readJson(req);
    const month = monthOf(body);
    const pendingUsers = [...(await advanceApprovals.requests(month))]
      .filter(([, e]) => e.status === 'pending')
      .map(([u]) => u);
    const { provisional, figures } = pendingUsers.length
      ? await advanceCap.figuresOf(month, pendingUsers)
      : { provisional: false, figures: new Map() };
    const wanted: any[] = [];
    const skipped: any[] = [];
    for (const username of pendingUsers) {
      const figure = figures.get(username);
      if (!figure || !figure.eligible) skipped.push({ username, code: 'ADVANCE_NOT_ELIGIBLE' });
      // Số đã chốt (qua ngày advance.untilDay) bằng 0: duyệt không đổi tiền. Chưa chốt thì vẫn duyệt vì số còn tăng
      else if (!provisional && !(figure.amount > 0)) skipped.push({ username, code: 'ADVANCE_ZERO' });
      else if (!(await this.canDecide(me, username))) skipped.push({ username, code: 'FORBIDDEN_CAP' });
      else if (this.authz.isSelfDecision(me, username)) skipped.push({ username, code: 'SELF_DECISION_FORBIDDEN' });
      else wanted.push(username);
    }
    const done = await this.store.transaction(async () => {
      await this.assertEditable(month);
      const changes = await advanceApprovals.approveMany(month, wanted, { expectedRev: revOf(body), by: me.username });
      for (const c of changes)
        await this.auditMove(actx, 'advance.approve', month, c.username, c.before, c.after, 'Duyệt tất cả');
      return changes;
    });
    const approved = done.map(c => c.username);
    if (approved.length) await this.announce(month, approved, 'approved');
    return { month, rev: (await advanceApprovals.read(month)).rev, approved, skipped };
  };
}
