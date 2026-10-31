// Lương Nhân Sự — web app tính lương tự phục vụ. Chạy: node server.js (Node.js >= 22.13; npm install để có NestJS và trình nạp TypeScript).
// Toàn bộ HTTP là ứng dụng NestJS trong src/ (module theo nghiệp vụ: src/modules/*); file này chỉ là điểm vào.
// Số luồng libuv phải đặt TRƯỚC khi có việc nền đầu tiên (băm mật khẩu, nén gzip); biến môi trường do người vận hành đặt thì giữ nguyên.
process.env.UV_THREADPOOL_SIZE = process.env.UV_THREADPOOL_SIZE || String(require('./lib/config').UV_THREADPOOL_SIZE);
require('./lib/register-ts'); // nạp TypeScript lúc chạy cho src/** (kiểm kiểu: npm run typecheck)
require('./src/env').loadDotEnv(__dirname); // .env phải được nạp trước mọi module đọc biến môi trường lúc nạp (DB_PATH, SESSION_SECRET...)
const { createServer } = require('./src/bootstrap');
const { start } = require('./src/main');

const server = createServer();
if (require.main === module)
  start(server).catch(error => {
    console.error(error);
    process.exit(1);
  });
module.exports = server;
