'use strict';
// Bộ nhớ đệm dùng chung của tiến trình, khoá theo số lần ghi của DB (xem compute-cache.js).
const store = require('../platform/db');
const { ComputeCache } = require('./compute-cache');

// Số lần ghi đã chạy qua kết nối của TIẾN TRÌNH này kể từ lúc mở (PostgresDatabase.writes): tăng với mọi INSERT/UPDATE/DELETE. Chỉ đúng khi chạy MỘT
// tiến trình ứng dụng (như docker-compose.yml): ghi từ tiến trình khác không làm số này tăng, nên nhiều bản ứng dụng cùng một DB phải bỏ bộ nhớ đệm này.
const dataRevision = async () => store.db.writes;

export = { compute: new ComputeCache({ revision: dataRevision }), dataRevision };
