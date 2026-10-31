'use strict';
// Lối vào cũ của phần giải trình, giữ để các chỗ đang require('./explanations') (server.js, payroll-service.js, test) không phải đổi.
// Nghiệp vụ nằm ở lib/domain/explanation (Explanation kế thừa lớp Request chung, repository, service); bảng tạo ở lib/db.js.
// Chưa duyệt hoặc không duyệt thì ngày đó không tính lương (heldByUser).
const { container } = require('./domain/container');
const { lateCheckoutMin, needsExplanation, TEXT_MAX } = require('./domain/explanation');

const service = () => container.explanations;

module.exports = {
  lateCheckoutMin,
  needsExplanation,
  hasSessionAnswer: sessionId => service().hasSessionAnswer(sessionId),
  submitLate: args => service().submitLate(args),
  request: args => service().request(args),
  answer: args => service().answer(args),
  decide: args => service().decide(args),
  heldByUser: month => service().heldByUser(month),
  explainedByUser: month => service().explainedByUser(month),
  list: filter => service().list(filter),
  countOpen: username => service().countOpen(username),
  byId: id => service().byId(id),
  TEXT_MAX
};
