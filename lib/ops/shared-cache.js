'use strict';
// Bộ nhớ đệm dùng chung của tiến trình, khoá theo số lần ghi của DB (xem compute-cache.js).
const store = require('../db');
const { ComputeCache } = require('./compute-cache');

let revisionStatement = null;
// Số dòng đã thay đổi qua kết nối này kể từ lúc mở: tăng với mọi INSERT/UPDATE/DELETE, kể cả ngoài transaction
const dataRevision = () => {
  if (!revisionStatement) revisionStatement = store.db.prepare('SELECT total_changes() AS n');
  return revisionStatement.get().n;
};

module.exports = { compute: new ComputeCache({ revision: dataRevision }), dataRevision };
