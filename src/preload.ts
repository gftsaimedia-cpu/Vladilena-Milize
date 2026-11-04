import path from 'node:path';
import { loadDotEnv } from './env';

// Phải chạy TRƯỚC mọi module khác của máy chủ (src/server.ts import file này đầu tiên):
// - số luồng libuv phải đặt trước việc nền đầu tiên (băm mật khẩu, nén gzip); biến môi trường do người vận hành đặt thì giữ nguyên;
// - .env phải được nạp trước mọi module đọc biến môi trường lúc nạp (DB_PATH, SESSION_SECRET...).
process.env.UV_THREADPOOL_SIZE = process.env.UV_THREADPOOL_SIZE || '16';
loadDotEnv(path.join(__dirname, '..'));
