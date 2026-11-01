'use strict';
// Đo sức khoẻ tiến trình: độ trễ vòng lặp sự kiện, bộ nhớ, thời gian chạy.
// Máy chủ chỉ có MỘT tiến trình Node: vòng lặp bị chặn bởi một tính toán nặng là mọi người cùng chậm, nên độ trễ vòng lặp là
// chỉ số số một để biết đang nghẽn hay chưa (nhật ký truy cập và /api/health cùng đọc số này).
const { monitorEventLoopDelay } = require('node:perf_hooks');
const config = require('../platform/config');

const NS_PER_MS = 1e6;

class RuntimeMonitor {
  declare histogram: any;
  declare startedAt: any;
  declare previous: any;
  declare timer: any;

  constructor() {
    this.histogram = monitorEventLoopDelay({ resolution: config.LOOP_LAG_RESOLUTION_MS });
    this.startedAt = Date.now();
    this.previous = null;
  }

  start() {
    this.histogram.enable();
    // Cuốn chiếu: mỗi LOOP_LAG_WINDOW_MS lưu cửa sổ vừa xong rồi xoá số đo, để recent() chỉ phản ánh vài giây gần nhất
    this.timer = setInterval(() => {
      this.previous = this.lag();
      this.histogram.reset();
    }, config.LOOP_LAG_WINDOW_MS);
    this.timer.unref();
  }

  stop() {
    clearInterval(this.timer);
    this.histogram.disable();
  }

  // Độ trễ (mili giây) trong cửa sổ từ lần reset trước. Mỗi mẫu của Node gồm cả chu kỳ đo nên trừ đi để còn phần trễ thật.
  lag({ reset = false }: any = {}) {
    const ms = (nanos?) => Math.max(0, Math.round((nanos / NS_PER_MS - config.LOOP_LAG_RESOLUTION_MS) * 10) / 10);
    const h = this.histogram;
    const out = h.count
      ? { p50: ms(h.percentile(50)), p99: ms(h.percentile(99)), max: ms(h.max) }
      : { p50: 0, p99: 0, max: 0 };
    if (reset) h.reset();
    return out;
  }

  // Trễ trong cửa sổ hiện tại gộp với cửa sổ vừa xong (lấy giá trị xấu hơn): không bỏ sót đợt nghẽn nằm đúng ranh giới hai cửa sổ
  recent() {
    const now = this.lag();
    const before = this.previous || { p50: 0, p99: 0, max: 0 };
    return {
      p50: Math.max(now.p50, before.p50),
      p99: Math.max(now.p99, before.p99),
      max: Math.max(now.max, before.max)
    };
  }

  snapshot() {
    const mem = process.memoryUsage();
    return {
      uptimeSec: Math.round((Date.now() - this.startedAt) / 1000),
      loopLagMs: this.recent(),
      rssMb: Math.round(mem.rss / 1048576),
      heapMb: Math.round(mem.heapUsed / 1048576)
    };
  }
}

export = { RuntimeMonitor };
