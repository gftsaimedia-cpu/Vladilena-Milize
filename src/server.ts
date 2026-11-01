// Lương Nhân Sự — web app tính lương tự phục vụ. Chạy: npm start (Node.js >= 22.13; npm install để có NestJS và trình nạp TypeScript tsx).
// Toàn bộ HTTP là ứng dụng NestJS (module theo nghiệp vụ: src/modules/*); file này chỉ là điểm vào, chạy thẳng bằng `node --import tsx`.
import './preload'; // đặt luồng libuv và nạp .env: phải đứng đầu
import { createServer } from './bootstrap';
import { start } from './main';

const server = createServer();
if (require.main === module)
  start(server).catch(error => {
    console.error(error);
    process.exit(1);
  });
module.exports = server;
