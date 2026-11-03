'use strict';
// Duyệt tạm ứng theo tháng qua repository, trong cùng giao dịch và khoá của store.
const store = require('../../platform/db');
const { AdvanceApprovals } = require('./advance-approvals');

const advanceApprovals = new AdvanceApprovals({
  repository: store.repos.advanceApprovals,
  transaction: (write?) => store.transaction(write),
  lock: (key?) => store.lock(key),
  clock: () => new Date(Date.now()).toISOString()
});

export = { AdvanceApprovals, advanceApprovals };
