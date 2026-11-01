'use strict';
// Các kịch bản đo tải. Mỗi kịch bản nhận ctx và trả PhaseStats đã kết thúc.
//   ctx = { base, users: [tên], admin, password, month, spreadSec, seconds, think: [min, max], admins, state }
// ctx.state giữ qua các pha: sessions (Map tên → Session đã đăng nhập), confirmed (các lượt Check-in đã được xác nhận).
const { Session, sampleHealth, pool, sleep, jitter } = require('./client');
const { PhaseStats } = require('./stats');

const MAX_RETRIES = 3; // người dùng thật bấm lại khi gặp "máy chủ bận"; không thử mãi

// Chạy một pha: tạo PhaseStats, lấy mẫu health, gọi body(stats), kết thúc
async function phase(ctx?, name?, body?) {
  const stats = new PhaseStats(name);
  const stopHealth = sampleHealth(ctx.base, stats);
  try {
    await body(stats);
  } finally {
    stats.finish();
    await stopHealth();
  }
  return stats;
}

// Gọi, gặp 503/429 thì chờ Retry-After rồi thử lại (tối đa MAX_RETRIES); mọi lần thử đều được đo
async function callWithRetry(session?, method?, route?, options?) {
  let result = await session.call(method, route, options);
  for (let attempt = 0; attempt < MAX_RETRIES && (result.status === 503 || result.status === 429); attempt++) {
    await sleep(Math.min(10, result.retryAfter || 1) * 1000 + jitter(0, 500));
    result = await session.call(method, route, options);
  }
  return result;
}

const arrival = (ctx?, i?, count?) => (ctx.spreadSec > 0 ? (i / count) * ctx.spreadSec * 1000 + jitter(0, 200) : 0);

// 1) Đăng nhập: mọi người đăng nhập trong spreadSec giây (0 = cùng một lúc, thử độ chịu bão đăng nhập)
async function login(ctx?) {
  ctx.state.sessions = new Map();
  const stats = await phase(ctx, 'login', async stats => {
    await Promise.all(
      ctx.users.map(async (username, i) => {
        await sleep(arrival(ctx, i, ctx.users.length));
        const session = new Session(ctx.base, username);
        const result = await callWithRetry(session, 'POST', '/api/login', {
          body: { username, password: ctx.password },
          stats
        });
        if (result.status === 200) ctx.state.sessions.set(username, session);
      })
    );
  });
  stats.extra = { loggedIn: ctx.state.sessions.size, expected: ctx.users.length };
  return stats;
}

// Đăng nhập Admin (không đo), dùng cho pha có Admin
async function adminSession(ctx?) {
  if (ctx.state.admin) return ctx.state.admin;
  const session = new Session(ctx.base, ctx.admin);
  const result = await callWithRetry(session, 'POST', '/api/login', {
    body: { username: ctx.admin, password: ctx.password }
  });
  if (result.status !== 200) throw new Error(`Admin đo tải không đăng nhập được (${result.status})`);
  ctx.state.admin = session;
  return session;
}

// 2) Check-in đầu ca: mọi người bấm Check-in trong spreadSec giây; 10 % gửi lại cùng requestId (mạng chập chờn, bấm đúp)
async function punchIn(ctx?) {
  ctx.state.confirmed = [];
  ctx.state.unconfirmed = [];
  const stats = await phase(ctx, 'checkin', async stats => {
    await Promise.all(
      [...ctx.state.sessions].map(async ([username, session]: any, i) => {
        await sleep(arrival(ctx, i, ctx.state.sessions.size));
        const requestId = `lt-in-${username}-${Math.random().toString(36).slice(2, 10)}`;
        const body = { type: 'in', requestId };
        const first = await callWithRetry(session, 'POST', '/api/punch', { body, stats });
        if (first.status !== 200) return ctx.state.unconfirmed.push({ username, status: first.status });
        const sessionId = first.data?.open?.id;
        ctx.state.confirmed.push({ username, requestId, sessionId });
        if (Math.random() < 0.1) {
          const again = await callWithRetry(session, 'POST', '/api/punch', { body, stats });
          // Gửi lại phải trả đúng lượt cũ, không sinh lượt mới
          if (again.status !== 200 || again.data?.open?.id !== sessionId)
            ctx.state.unconfirmed.push({ username, status: again.status, duplicateMismatch: true });
        }
      })
    );
  });
  stats.extra = { confirmed: ctx.state.confirmed.length, unconfirmed: ctx.state.unconfirmed.length };
  return stats;
}

const HEAVY_ADMIN_ROUTES = (month?) => [
  `/api/team?month=${month}`,
  '/api/approvals?status=pending',
  `/api/periods/${month}/estimates`,
  '/api/staff'
];

// 3) Hỗn hợp ổn định: người dùng xem lịch/trạng thái với thời gian nghỉ ngẫu nhiên + vài Admin liên tục mở màn nặng
async function mix(ctx?) {
  const deadline = performance.now() + ctx.seconds * 1000;
  const admin = ctx.admins > 0 ? await adminSession(ctx) : null;
  const stats = await phase(ctx, 'mix', async stats => {
    const staffLoop = async ([username, session]: any, i?) => {
      await sleep(jitter(0, ctx.think[1])); // lệch pha để không đồng loạt
      while (performance.now() < deadline) {
        await session.call('GET', '/api/me', { stats });
        await session.call('GET', `/api/sheet?month=${ctx.month}`, { stats });
        await session.call('GET', '/api/punch', { stats });
        // 5 % vòng lặp có một lệnh ghi (lưu lịch rỗng: đi qua toàn bộ đường ghi mà không đổi dữ liệu nghiệp vụ)
        if (Math.random() < 0.05)
          await session.call('PUT', '/api/sheet', { body: { month: ctx.month, days: {} }, stats });
        await sleep(jitter(ctx.think[0], ctx.think[1]));
      }
    };
    const adminLoop = async (k?) => {
      const routes = HEAVY_ADMIN_ROUTES(ctx.month);
      await sleep(jitter(0, 2000));
      for (let n = k; performance.now() < deadline; n++) {
        await admin.call('GET', routes[n % routes.length], { stats });
        await sleep(jitter(2000, 5000));
      }
    };
    await Promise.all([
      ...[...ctx.state.sessions].map(staffLoop),
      ...Array.from({ length: admin ? ctx.admins : 0 }, (_, k) => adminLoop(k))
    ]);
  });
  return stats;
}

// 4) Admin dồn: nhiều Admin cùng mở màn nặng liên tục (thử bộ nhớ đệm và bộ từ chối khi quá tải)
async function adminBurst(ctx?) {
  const admin = await adminSession(ctx);
  const routes = HEAVY_ADMIN_ROUTES(ctx.month);
  return phase(ctx, 'admin-burst', async stats => {
    await pool(ctx.admins * routes.length * 3, ctx.admins, async i => {
      await admin.call('GET', routes[i % routes.length], { stats });
    });
  });
}

// 5) Dò chi phí từng màn Admin nặng: mỗi route gọi tuần tự 3 lần (lần đầu "lạnh" rồi "ấm"); ghi thời gian từng lần vào extra.
async function probe(ctx?) {
  const admin = await adminSession(ctx);
  const extra: Record<string, any> = {};
  const stats = await phase(ctx, 'probe', async stats => {
    for (const route of HEAVY_ADMIN_ROUTES(ctx.month)) {
      extra[route] = [];
      for (let i = 0; i < 3; i++) extra[route].push(Math.round((await admin.call('GET', route, { stats })).ms));
    }
  });
  stats.extra = extra;
  return stats;
}

const SCENARIOS = { login, checkin: punchIn, mix, 'admin-burst': adminBurst, probe };
// Thứ tự mặc định: kịch bản sau cần phiên đăng nhập của kịch bản login
const DEFAULT_ORDER = ['login', 'checkin', 'mix', 'admin-burst'];

module.exports = { SCENARIOS, DEFAULT_ORDER };
