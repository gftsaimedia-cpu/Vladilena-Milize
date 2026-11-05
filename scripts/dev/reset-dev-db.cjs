'use strict';
// Đưa DB dev về trống rồi nạp lại migrations/postgres/schema.sql. Dùng trước `npm run test:api` (web) vì các test
// giao diện với BE thật cần DB thử mới: cài đặt, kỳ lương và phiếu tích tụ theo tháng qua các lần chạy.
// An toàn: chỉ chạy với DATABASE_URL trỏ máy này (127.0.0.1 hoặc localhost) và tên DB kết thúc bằng _dev.
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

const url = process.env.DATABASE_URL;
if (!url) throw new Error('Cần DATABASE_URL của DB dev (xem docs/postgres-local.md).');
const u = new URL(url);
const db = decodeURIComponent(u.pathname.slice(1));
if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(u.hostname) || !db.endsWith('_dev')) {
  throw new Error(`Từ chối reset ${u.hostname}/${db}: chỉ DB dev trên máy này, tên kết thúc bằng _dev.`);
}
(async () => {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await client.query(fs.readFileSync(path.join(__dirname, '../../migrations/postgres/schema.sql'), 'utf8'));
    console.log(`Đã reset ${db}: schema trống, admin sẽ được tạo lại khi BE khởi động (cần ADMIN_PASSWORD).`);
  } finally {
    await client.end();
  }
})().catch(err => {
  console.error(err.message);
  process.exit(1);
});
