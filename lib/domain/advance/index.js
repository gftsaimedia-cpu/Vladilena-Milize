'use strict';
// Duyệt tạm ứng theo tháng. advanceApprovals: đối tượng dùng chung, đọc / ghi qua kho settings hiện hành của lib/db.js
// (gọi store.getSetting mỗi lần nên DB mở lại trong test vẫn đúng).
const store = require('../../db');
const { AdvanceApprovals } = require('./advance-approvals');

const advanceApprovals = new AdvanceApprovals({
  getSetting: (key, fallback) => store.getSetting(key, fallback),
  setSetting: (key, value) => store.setSetting(key, value),
  clock: () => new Date(Date.now()).toISOString()
});

module.exports = { AdvanceApprovals, advanceApprovals };
