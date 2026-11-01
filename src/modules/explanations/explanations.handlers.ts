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
const store = require('../../platform/db');
const authz = require('../../platform/authz');
const events = require('../../platform/events');
const { HttpError, readJson } = require('../../platform/http');
const { USERNAME_RE } = require('../../domain/input');
const { container } = require('../../domain/container');
const { AbsentDay } = require('../../domain/explanation/absent-day');

const CAP = 'attendance.correct';
export const absentDay = new AbsentDay({ store });
export const isAdmin = async me => (await authz.scopeOf(me, CAP)) === 'all';
export const auditRow = async (...args) => await container.lateCheckout.auditExplanation(...args);
// requestedOut: giờ nhân sự bấm Check-out muộn (lượt đang "Quên Check-out" chờ duyệt); Admin duyệt thì giờ này thành giờ Check-out
const requestedOut = async row =>
  (row.kind === 'late-checkout' &&
    row.sessionId &&
    ((await store.getSession(row.sessionId)) || {}).entry?.requestedOut) ||
  null;
export const withName = async row => ({
  ...row,
  name: ((await store.getStaff(row.username)) || {}).name || row.username,
  requestedOut: await requestedOut(row)
});
export const changed = async row => {
  await events.emit.approvalsChanged(row.date.slice(0, 7)); // Admin nạp lại
  // giải trình gắn với một lượt quyết định trạng thái hiển thị của lượt đó: màn Chấm công đang mở nạp lại
  if (row.sessionId) await events.emit.attendanceChanged('explanation', row.date.slice(0, 7));
  await events.emit.punchChanged(row.username, row.date); // nhân sự nạp lại
};
