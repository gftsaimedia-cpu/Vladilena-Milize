'use strict';
// Lối vào cũ của phần giải trình, giữ để các chỗ đang require('./explanations') (server.js, payroll-service.js, test) không phải đổi.
// Nghiệp vụ nằm ở src/domain/explanation (Explanation kế thừa lớp Request chung, repository, service); bảng tạo ở src/platform/db.ts.
// Chưa duyệt hoặc không duyệt thì ngày đó không tính lương (heldByUser).
const { container } = require('../container');
const { lateCheckoutMin, needsExplanation, TEXT_MAX } = require('../explanation');

const service = () => container.explanations;

export = {
  lateCheckoutMin,
  needsExplanation,
  hasSessionAnswer: (sessionId?) => service().hasSessionAnswer(sessionId),
  submitLate: (args?) => service().submitLate(args),
  request: (args?) => service().request(args),
  answer: (args?) => service().answer(args),
  decide: (args?) => service().decide(args),
  heldByUser: async (month?) => await service().heldByUser(month),
  explainedByUser: async (month?) => await service().explainedByUser(month),
  list: async (filter?) => await service().list(filter),
  countOpen: (username?) => service().countOpen(username),
  byId: (id?) => service().byId(id),
  TEXT_MAX
};
