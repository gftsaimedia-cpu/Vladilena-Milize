'use strict';
// Duyệt tạm ứng theo tháng. advanceApprovals: đối tượng dùng chung, đọc / ghi qua kho settings hiện hành của src/platform/db.ts
// (gọi store.getSetting mỗi lần nên DB mở lại trong test vẫn đúng).
const store = require('../../platform/db');
const { AdvanceApprovals } = require('./advance-approvals');

const advanceApprovals = new AdvanceApprovals({
  getSetting: async (key?, fallback?) => await store.getSetting(key, fallback),
  setSetting: async (key?, value?) => await store.setSetting(key, value),
  clock: () => new Date(Date.now()).toISOString()
});

export = { AdvanceApprovals, advanceApprovals };
