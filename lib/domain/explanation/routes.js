'use strict';
// Route giải trình (nghiệp vụ ở explanation-service.js). lib/domain/routes.js gửi /api/explanations/... tới handle().
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
const store = require('../../db');
const authz = require('../../authz');
const events = require('../../events');
const { HttpError, send, readJson } = require('../../http');
const { USERNAME_RE } = require('../input');
const { container } = require('../container');
const { AbsentDay } = require('./absent-day');

const CAP = 'attendance.correct';
const absentDay = new AbsentDay({ store });
const isAdmin = me => authz.scopeOf(me, CAP) === 'all';
const auditRow = (...args) => container.lateCheckout.auditExplanation(...args);
// requestedOut: giờ nhân sự bấm Check-out muộn (lượt đang "Quên Check-out" chờ duyệt); Admin duyệt thì giờ này thành giờ Check-out
const requestedOut = row =>
  (row.kind === 'late-checkout' && row.sessionId && (store.getSession(row.sessionId) || {}).entry?.requestedOut) ||
  null;
const withName = row => ({
  ...row,
  name: (store.getStaff(row.username) || {}).name || row.username,
  requestedOut: requestedOut(row)
});
const changed = row => {
  events.emit.approvalsChanged(row.date.slice(0, 7)); // Admin nạp lại
  // giải trình gắn với một lượt quyết định trạng thái hiển thị của lượt đó: màn Chấm công đang mở nạp lại
  if (row.sessionId) events.emit.attendanceChanged('explanation', row.date.slice(0, 7));
  events.emit.punchChanged(row.username, row.date); // nhân sự nạp lại
};

async function handle({ req, res, seg, url, me, actx }) {
  const explanations = container.explanations;
  const method = req.method;
  if (seg.length === 2 && method === 'GET') {
    const status = url.searchParams.get('status') || undefined;
    const asked = (url.searchParams.get('user') || '').toLowerCase();
    if (asked && !USERNAME_RE.test(asked)) throw new HttpError(400, 'user không hợp lệ');
    const admin = isAdmin(me);
    const username = admin ? asked || undefined : me.username;
    return send(res, 200, {
      items: explanations.list({ username, status }).map(withName),
      waitingForYou: explanations.countOpen(me.username), // yêu cầu đang chờ chính người xem trả lời
      toRead: admin ? explanations.countOpen() : 0 // đã trả lời, Admin chưa đọc
    });
  }
  if (seg.length === 2 && method === 'POST') {
    const body = await readJson(req);
    if (body && body.username && String(body.username).toLowerCase() !== me.username) {
      if (!isAdmin(me))
        throw new HttpError(403, 'Chỉ Admin được yêu cầu người khác giải trình', { code: 'FORBIDDEN_CAP' });
      const row = store.transaction(() => {
        const made = explanations.request({
          username: String(body.username).toLowerCase(),
          date: body.date,
          prompt: body.prompt,
          kind: body.source === 'ai' ? 'ai' : 'admin',
          requestedBy: body.source === 'ai' ? `ai (${me.username})` : me.username,
          ruleId: body.ruleId
        });
        auditRow(actx, 'explanation.request', null, made, made.prompt);
        return made;
      });
      changed(row);
      return send(res, 200, { item: withName(row) });
    }
    if (body && body.sessionId === undefined && body.date !== undefined) {
      const row = store.transaction(() => {
        const made = explanations.submitAbsentDay({
          username: me.username,
          date: body.date,
          text: body.text,
          stateOf: (username, date) => absentDay.stateOf(username, date)
        });
        auditRow(actx, 'explanation.self', null, made, null);
        return made;
      });
      changed(row);
      return send(res, 200, { item: withName(row) });
    }
    const session = store.getSession(Number(body && body.sessionId));
    const row = store.transaction(() => {
      const before = session ? container.explanationRepository.lateFor(session.id) : null;
      const made = explanations.submitLate({ username: me.username, session, text: body && body.text });
      auditRow(actx, 'explanation.late-checkout', before && before.view(), made, null);
      return made;
    });
    changed(row);
    return send(res, 200, { item: withName(row) });
  }
  if (seg.length === 4 && method === 'POST' && /^\d+$/.test(seg[2]) && (seg[3] === 'answer' || seg[3] === 'decide')) {
    const id = Number(seg[2]);
    const body = await readJson(req);
    const row = store.transaction(() => {
      const before = explanations.byId(id);
      const done =
        seg[3] === 'answer'
          ? explanations.answer({ id, username: me.username, text: body && body.text })
          : explanations.decide({
              id,
              by: me.username,
              approve: !!(body && body.approve),
              note: body && body.note,
              expectedRev: body && body.expectedRev,
              isSelf: !!before && authz.isSelfDecision(me, before.username)
            });
      auditRow(actx, `explanation.${seg[3]}`, before, done, null);
      // Check-out muộn: duyệt thì giờ bấm thành giờ Check-out của lượt, không duyệt thì lượt giữ "Quên Check-out" (cùng giao dịch)
      if (seg[3] === 'decide') container.lateCheckout.sync(done, actx);
      // Giải trình ngày: duyệt ngày quên chấm thì ghi công theo giờ ca, không duyệt thì bỏ công đã ghi theo giải trình này (cùng giao dịch)
      const day = seg[3] === 'decide' ? container.adminPresence.syncExplanation({ view: done, actx }) : null;
      return { done, recorded: !!(day && day.set.length) };
    });
    changed(row.done);
    return send(res, 200, { item: withName(row.done), recorded: row.recorded });
  }
  throw new HttpError(404, 'Không có đường dẫn này');
}
module.exports = { handle };
