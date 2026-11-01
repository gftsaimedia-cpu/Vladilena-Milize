'use strict';
// Khách HTTP cho bộ đo tải: mỗi người dùng ảo một "phiên" giữ cookie, mọi lời gọi đo thời gian và ghi vào PhaseStats.
// Chỉ dùng fetch có sẵn của Node, không thư viện ngoài. Mô hình MỞ cho phần lớn kịch bản: người dùng ảo nghỉ (think time) rồi gửi tiếp
// bất kể máy chủ chậm hay không, vì người thật không đợi nhau (mô hình đóng tự giảm tải khi máy chủ chậm nên che mất quá tải).
const REQUEST_TIMEOUT_MS = 30000;

const sleep = (ms?) => new Promise(resolve => setTimeout(resolve, ms));
const jitter = (min?, max?) => min + Math.random() * (max - min);

class Session {
  declare base: any;
  declare name: any;
  declare cookie: any;

  constructor(base?, name?) {
    this.base = base;
    this.name = name;
    this.cookie = '';
  }

  // Trả { status, ms, data }. Mất kết nối/timeout thì status 0. stats null = không ghi số đo (ví dụ bước chuẩn bị).
  async call(method?, route?, { body, stats, headers = {} }: any = {}) {
    const started = performance.now();
    let response;
    try {
      response = await fetch(this.base + route, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Accept-Encoding': 'gzip',
          ...(this.cookie ? { Cookie: this.cookie } : {}),
          ...headers
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });
    } catch {
      if (stats) stats.recordNetworkError();
      return { status: 0, ms: performance.now() - started, data: null };
    }
    let data: any = null;
    try {
      data = (await response.json()) as any;
    } catch {
      /* thân rỗng hoặc không phải JSON */
    }
    const ms = performance.now() - started;
    const setCookie = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
    if (setCookie.length) this.cookie = setCookie.map(c => c.split(';')[0]).join('; ');
    if (stats) stats.record(response.status, ms);
    return { status: response.status, ms, data, retryAfter: Number(response.headers.get('retry-after')) || 0 };
  }

  login(username?, password?, stats?) {
    return this.call('POST', '/api/login', { body: { username, password }, stats });
  }
}

// Lấy mẫu /api/health đều đặn trong lúc một pha chạy; trả hàm dừng. Nếu máy chủ không có health thì bỏ qua lặng lẽ.
function sampleHealth(base?, stats?, everyMs = 500) {
  let stopped = false;
  const loop = (async () => {
    while (!stopped) {
      try {
        const r = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(5000) });
        if (r.ok) {
          const h: any = await r.json();
          // Lấy cửa sổ đo từ lần trước; độ trễ vòng lặp theo mili giây
          stats.recordHealth({ lag99: h.loopLagMs?.p99, lagMax: h.loopLagMs?.max, rssMb: h.rssMb });
        }
      } catch {
        /* health không trả lời được cũng là tín hiệu nhưng đã thể hiện ở các yêu cầu khác */
      }
      await sleep(everyMs);
    }
  })();
  return async () => {
    stopped = true;
    await loop;
  };
}

// Chạy fn(i) cho i = 0..count-1 với tối đa `concurrency` việc cùng lúc
async function pool(count?, concurrency?, fn?) {
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, count) }, async () => {
    while (next < count) {
      const i = next++;
      await fn(i);
    }
  });
  await Promise.all(workers);
}

module.exports = { Session, sampleHealth, pool, sleep, jitter };
