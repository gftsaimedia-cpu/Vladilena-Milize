'use strict';
// Bộ giới hạn tải trong bộ nhớ. Máy chủ chỉ có MỘT tiến trình nên không cần Redis: trạng thái nằm trong tiến trình
// và mất khi khởi động lại (đúng ý: giới hạn chỉ để chống quá tải tức thời, không phải sổ sách).
// Ba công cụ, không phụ thuộc DB, đều nhận đồng hồ/số đo qua tham số để test:
//   AsyncGate    - cho tối đa `limit` việc bất đồng bộ chạy cùng lúc, tối đa `maxQueue` việc xếp hàng; quá nữa thì từ chối ngay (không giữ socket chờ vô hạn).
//   RateLimiter  - mỗi khoá (tên đăng nhập) một xô token: nạp đều theo thời gian, hết token thì trả số giây phải chờ.
//   LoadShedder  - từ chối các route nặng khi vòng lặp sự kiện đang nghẽn hoặc quá nhiều yêu cầu đang xử lý.

// Ném khi cổng hết chỗ; server.js đổi thành 503 + Retry-After
class Overloaded extends Error {
  declare retryAfterSec: any;

  constructor(message?, retryAfterSec?) {
    super(message);
    this.retryAfterSec = retryAfterSec;
  }
}

class AsyncGate {
  declare limit: any;
  declare maxQueue: any;
  declare retryAfterSec: any;
  declare running: any;
  declare queue: any;

  constructor({ limit, maxQueue, retryAfterSec }: any) {
    this.limit = limit;
    this.maxQueue = maxQueue;
    this.retryAfterSec = retryAfterSec;
    this.running = 0;
    this.queue = [];
  }

  async run(task?) {
    if (this.running >= this.limit) {
      if (this.queue.length >= this.maxQueue)
        throw new Overloaded('Máy chủ đang bận, thử lại sau ít giây', this.retryAfterSec);
      await new Promise(resolve => this.queue.push(resolve)); // slot được chuyển thẳng cho người chờ lâu nhất, running không đổi
    } else {
      this.running++;
    }
    try {
      return await task();
    } finally {
      const next = this.queue.shift();
      if (next) next();
      else this.running--;
    }
  }

  stats() {
    return { running: this.running, queued: this.queue.length };
  }
}

class RateLimiter {
  declare capacity: any;
  declare refillPerMs: any;
  declare now: any;
  declare maxKeys: any;
  declare buckets: any;

  // perMinute: số token nạp mỗi phút (cũng là dung lượng xô); now: () => ms
  constructor({ perMinute, now = () => performance.now(), maxKeys = 10000 }: any) {
    this.capacity = perMinute;
    this.refillPerMs = perMinute / 60000;
    this.now = now;
    this.maxKeys = maxKeys;
    this.buckets = new Map(); // khoá → { tokens, at }
  }

  // Trả 0 nếu được phép (đã trừ 1 token), ngược lại số giây (làm tròn lên) phải chờ để có token
  take(key?) {
    const at = this.now();
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { tokens: this.capacity, at };
      if (this.buckets.size >= this.maxKeys) this.buckets.delete(this.buckets.keys().next().value); // bỏ khoá cũ nhất, bộ nhớ có trần
    } else {
      // Đồng hồ đơn điệu (performance.now) nên không lùi khi chỉnh giờ hệ thống; max(0) chặn thêm trường hợp now do bên ngoài tiêm vào bị lùi
      bucket.tokens = Math.min(this.capacity, bucket.tokens + Math.max(0, at - bucket.at) * this.refillPerMs);
      bucket.at = at;
    }
    this.buckets.delete(key);
    this.buckets.set(key, bucket);
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return 0;
    }
    return Math.max(1, Math.ceil((1 - bucket.tokens) / this.refillPerMs / 1000));
  }
}

class LoadShedder {
  [key: string]: any;

  declare shed: any;

  // lagMs: () => ms độ trễ vòng lặp kéo dài (trung vị vài giây gần nhất); inflight: () => số yêu cầu đang xử lý
  constructor({ lagMs, inflight, maxLagMs, maxInflight, retryAfterSec }: any) {
    Object.assign(this, { lagMs, inflight, maxLagMs, maxInflight, retryAfterSec });
    this.shed = 0;
  }

  // Trả null nếu nhận được, ngược lại lý do từ chối. Chỉ gọi cho route nặng; route thiết yếu (Check-in/out, đăng nhập, health) không qua đây.
  check() {
    const reason =
      this.inflight() >= this.maxInflight
        ? 'quá nhiều yêu cầu đang xử lý'
        : this.lagMs() >= this.maxLagMs
          ? 'máy chủ đang nghẽn'
          : null;
    if (reason) this.shed++;
    return reason;
  }
}

export = { Overloaded, AsyncGate, RateLimiter, LoadShedder };
