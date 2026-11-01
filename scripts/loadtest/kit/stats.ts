'use strict';
// Thống kê cho bộ đo tải: bách phân vị, tóm tắt một pha, chấm đạt/không đạt theo mục tiêu.
// Mục tiêu mặc định: p95 dưới 500 ms, lỗi dưới 1 %. Lỗi chủ ý của bộ giới hạn tải (503 quá tải, 429 ghi dồn)
// KHÔNG tính vào "lỗi" mà đếm riêng thành "bị từ chối", vì đó là cách máy chủ tự vệ; nhưng nếu quá nhiều thì vẫn báo.

function percentile(sorted?, p?) {
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

class PhaseStats {
  declare name: any;
  declare latencies: any;
  declare byStatus: any;
  declare networkErrors: any;
  declare startedAt: any;
  declare endedAt: any;
  declare health: any;

  constructor(name?) {
    this.name = name;
    this.latencies = []; // ms, mọi yêu cầu có phản hồi
    this.byStatus = new Map();
    this.networkErrors = 0; // không nhận được phản hồi (ECONNRESET, timeout...)
    this.startedAt = performance.now();
    this.endedAt = null;
    this.health = []; // mẫu /api/health: { lag99, lagMax, rssMb }
  }

  record(status?, ms?) {
    this.latencies.push(ms);
    this.byStatus.set(status, (this.byStatus.get(status) || 0) + 1);
  }

  recordNetworkError() {
    this.networkErrors++;
  }

  recordHealth(sample?) {
    this.health.push(sample);
  }

  finish() {
    this.endedAt = performance.now();
  }

  summary(targets: any = {}) {
    const { p95Ms = 500, errorRate = 0.01, rejectedRate = 0.1 } = targets;
    const sorted = [...this.latencies].sort((a: any, b: any) => a - b);
    const total = sorted.length + this.networkErrors;
    const status = (code?) => this.byStatus.get(code) || 0;
    const rejected = status(503) + status(429);
    const serverErrors = [...this.byStatus]
      .filter(([code]: any) => code >= 500 && code !== 503)
      .reduce((n, [, c]: any) => n + c, 0);
    const clientErrors = [...this.byStatus]
      .filter(([code]: any) => code >= 400 && code < 500 && code !== 429)
      .reduce((n, [, c]: any) => n + c, 0);
    const failures = serverErrors + clientErrors + this.networkErrors;
    const seconds = Math.max(0.001, ((this.endedAt || performance.now()) - this.startedAt) / 1000);
    const round = (n?) => Math.round(n * 10) / 10;
    const p95 = round(percentile(sorted, 95));
    const out: Record<string, any> = {
      phase: this.name,
      requests: total,
      seconds: round(seconds),
      rps: round(total / seconds),
      p50: round(percentile(sorted, 50)),
      p95,
      p99: round(percentile(sorted, 99)),
      max: round(sorted[sorted.length - 1] || 0),
      ok: [...this.byStatus].filter(([code]: any) => code < 400).reduce((n, [, c]: any) => n + c, 0),
      rejected, // 503 + 429: máy chủ tự vệ
      failures, // lỗi thật: 5xx khác 503, 4xx khác 429, mất kết nối
      networkErrors: this.networkErrors,
      statuses: Object.fromEntries([...this.byStatus].sort((a: any, b: any) => a[0] - b[0])),
      loopLagMaxMs: this.health.reduce((m, h) => Math.max(m, h.lagMax || 0), 0),
      loopLagP99MaxMs: this.health.reduce((m, h) => Math.max(m, h.lag99 || 0), 0),
      rssMaxMb: this.health.reduce((m, h) => Math.max(m, h.rssMb || 0), 0)
    };
    const problems: any[] = [];
    if (total && p95 > p95Ms) problems.push(`p95 ${p95} ms vượt ${p95Ms} ms`);
    if (total && failures / total > errorRate)
      problems.push(`lỗi ${((failures / total) * 100).toFixed(1)} % vượt ${errorRate * 100} %`);
    if (total && rejected / total > rejectedRate)
      problems.push(`bị từ chối ${((rejected / total) * 100).toFixed(1)} % vượt ${rejectedRate * 100} %`);
    out.verdict = problems.length ? 'KHÔNG ĐẠT' : 'ĐẠT';
    out.problems = problems;
    return out;
  }
}

function formatTable(summaries?) {
  const rows = [['pha', 'yêu cầu', 'rps', 'p50', 'p95', 'p99', 'max', 'từ chối', 'lỗi', 'lag max', 'kết quả']];
  for (const s of summaries)
    rows.push(
      [s.phase, s.requests, s.rps, s.p50, s.p95, s.p99, s.max, s.rejected, s.failures, s.loopLagMaxMs, s.verdict].map(
        String
      )
    );
  const widths = rows[0].map((_, i) => Math.max(...rows.map(r => r[i].length)));
  return rows.map(r => r.map((cell, i) => cell.padEnd(widths[i])).join('  ')).join('\n');
}

module.exports = { percentile, PhaseStats, formatTable };
