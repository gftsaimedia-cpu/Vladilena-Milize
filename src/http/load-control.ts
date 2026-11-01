// Giới hạn tải của máy chủ: một nơi giữ các bộ đếm và cổng, dùng chung cho cổng ApiGuard, route đăng nhập và công cụ vận hành.
import config = require('../platform/config');
import { RuntimeMonitor } from '../ops/runtime-monitor';
import { AsyncGate, RateLimiter, LoadShedder } from '../ops/limiters';

// Biến môi trường (số dương) ghi đè giá trị mặc định trong src/platform/config.ts: vận hành nới/siết giới hạn khi triển khai mà không sửa mã
const limitOf = (name: string, fallback: number): number =>
  Number(process.env[name]) > 0 ? Number(process.env[name]) : fallback;

export const monitor = new RuntimeMonitor();
/** Số yêu cầu API đang xử lý (không tính luồng SSE sống lâu). */
export const inflight = { count: 0 };
export const hashGate = new AsyncGate({
  limit: limitOf('PASSWORD_HASH_CONCURRENCY', config.PASSWORD_HASH_CONCURRENCY),
  maxQueue: config.PASSWORD_HASH_QUEUE_MAX,
  retryAfterSec: config.OVERLOAD_RETRY_AFTER_SEC
});
export const writeLimiter = new RateLimiter({
  perMinute: limitOf('WRITE_RATE_PER_MINUTE', config.WRITE_RATE_PER_MINUTE)
});
export const shedder = new LoadShedder({
  lagMs: () => monitor.recent().p50, // trễ KÉO DÀI (trung vị): một phép tính nặng đơn lẻ làm p99/max vọt lên nhưng không phải quá tải
  inflight: () => inflight.count,
  maxLagMs: limitOf('SHED_MAX_LAG_MS', config.SHED_MAX_LAG_MS),
  maxInflight: limitOf('SHED_MAX_INFLIGHT', config.SHED_MAX_INFLIGHT),
  retryAfterSec: config.OVERLOAD_RETRY_AFTER_SEC
});
