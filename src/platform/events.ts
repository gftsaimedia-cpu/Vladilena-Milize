'use strict';
// Lớp sự kiện báo cho màn đang mở.
// Trung lập với đường truyền: publish() chọn người nhận và chiếu trường, rồi đưa khung văn bản cho từng kết nối; SSE là đường truyền hiện có
// (handleSse); đường truyền khác chỉ cần một handler khác gọi cùng lớp này.
//   publish(name, payload, audience)  phát một sự kiện; PHẢI gọi SAU KHI giao dịch đã COMMIT (xem batch() nếu nhiều sự kiện)
//   batch()                           gom sự kiện trong lúc làm việc, flush() sau COMMIT, discard() nếu lỗi
//   handleSse(req, res, me, opts)     GET /api/events: mở luồng, hello, nhịp tim, kiểm phiên, trần kết nối
//   closeUser(username, reason)       đóng mọi luồng của một tài khoản bằng bye (đăng xuất, khoá, đổi mật khẩu)
//   closeAll()                        tắt máy chủ êm (SIGTERM): kết thúc mọi luồng, khách tự nối lại
// Payload chỉ là GỢI Ý NẠP LẠI: không tên, tiền, lý do tự do, giá trị tham số, mã băm. Mọi tin có thể mất hoặc lặp; không phát lại tin lỡ
// (Last-Event-ID chỉ để biết đây là lần nối lại: gửi hello rồi resync).
const { AsyncList } = require('../shared/async-list');
const getStore = () => require('./db');
const getAuth = () => require('./auth');
const authz = require('./authz');
const config = require('./config');
const getConfigRev = () => require('../params/config-rev');
const registry = require('../params/registry');

const MS_PER_SEC = 1000; // đơn vị, không phải tham số

/* ========================= danh mục sự kiện (nơi duy nhất định nghĩa) ========================= */
// audiences: kiểu người nhận mà người gọi được dùng (`all`, `users`, `cap`); dùng kiểu khác thì publish ném lỗi lập trình, để không ai phát nhầm
//   "request.decided" cho tất cả mọi người.
// tiers: xét theo thứ tự, người nhận nhận TẦNG ĐẦU TIÊN mà họ đủ điều kiện (`cap` ở phạm vi `all`; không có `cap` = ai cũng đủ); không tầng nào
//   khớp thì không nhận. `fields` là danh sách trường được phép; trường khác của payload bị bỏ trước khi gửi.
const EVENTS = Object.freeze({
  'params.changed': {
    audiences: ['all'],
    tiers: [
      { name: 'full', cap: 'config.read', fields: ['configRev', 'fromMonth', 'kind', 'groups', 'by'] },
      { name: 'short', fields: ['configRev', 'fromMonth'] }
    ]
  },
  'period.changed': {
    audiences: ['all'],
    tiers: [
      { name: 'full', cap: 'payroll.view', fields: ['month', 'status', 'rev'] },
      { name: 'short', fields: ['month', 'stage'] } // stage: open | locked | paid
    ]
  },
  'approvals.changed': {
    audiences: ['cap'],
    tiers: [{ name: 'queue', cap: authz.DECIDE_ALL, fields: ['month', 'pending'] }]
  },
  'attendance.changed': {
    audiences: ['cap'],
    tiers: [{ name: 'queue', cap: 'attendance.correct', fields: ['kind', 'month'] }] // kind: forgot | ot | punch | explanation
  },
  // kind: 'advance' khi là yêu cầu ứng lương (không có ngày); khoản tự khai thì không có kind và có date
  'request.decided': { audiences: ['users'], tiers: [{ name: 'self', fields: ['month', 'date', 'decision', 'kind'] }] },
  'punch.corrected': { audiences: ['users'], tiers: [{ name: 'self', fields: ['month', 'date'] }] },
  // Chính người đó vừa Check-in / Check-out (hoặc lượt quá hạn của họ được đóng tự động): máy thứ hai của họ nạp lại. Không mang giờ, tên hay toạ độ.
  'punch.changed': { audiences: ['users'], tiers: [{ name: 'self', fields: ['month', 'date'] }] },
  'estimate.changed': { audiences: ['users'], tiers: [{ name: 'self', fields: ['month'] }] },
  'payslip.available': { audiences: ['users'], tiers: [{ name: 'self', fields: ['month'] }] },
  // vai trò của chính người đó vừa đổi: màn nạp lại /api/me để lấy năng lực mới (không mang dữ liệu)
  'roles.changed': { audiences: ['users'], tiers: [{ name: 'self', fields: [] }] },
  'announcement.posted': { audiences: ['all'], tiers: [{ name: 'all', fields: ['id'] }] } // tên dành sẵn, chỉ mang id
});
const SYSTEM_FRAMES = Object.freeze(['hello', 'resync', 'bye']);

/* ========================= giới hạn ========================= */
// Giá trị mặc định ở src/platform/config.ts (EVENTS_*), cùng số với khoá `system.events.*` của registry (ops). configure() chỉ để test đổi nhanh.
let overrides: Record<string, any> = {};
const limits = () => ({
  heartbeatSec: config.EVENTS_HEARTBEAT_SEC,
  retryMs: config.EVENTS_RETRY_MS,
  maxPerUser: config.EVENTS_MAX_PER_USER,
  maxTotal: config.EVENTS_MAX_TOTAL,
  maxBacklogBytes: config.EVENTS_MAX_BACKLOG_BYTES,
  ...overrides
});
function configure(next: any = {}) {
  overrides = { ...next };
  if (timer) restartTimer();
}

/* ========================= khung SSE ========================= */
let seq = 0;
const nextId = () => `${getConfigRev().EPOCH}-${++seq}`;
const frame = (event?, data?, { id, retry }: any = {}) =>
  (retry ? `retry: ${retry}\n` : '') + (id ? `id: ${id}\n` : '') + `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

// Giá trị được phép ra khỏi máy chủ: số, chữ, đúng sai, null, hoặc mảng các giá trị đó. Đối tượng lồng bị bỏ.
const plain = (value?) =>
  value === null ||
  typeof value === 'string' ||
  typeof value === 'boolean' ||
  (typeof value === 'number' && Number.isFinite(value));
function project(payload?, fields?) {
  const out: Record<string, any> = {};
  for (const key of fields) {
    if (!payload || !Object.hasOwn(payload, key)) continue;
    const value = payload[key];
    if (plain(value)) out[key] = value;
    else if (Array.isArray(value) && value.every(plain)) out[key] = value;
  }
  return out;
}

/* ========================= kết nối ========================= */
const conns = new Set<any>();
const byUser = new Map<any, any>(); // tài khoản → các kết nối của họ (phát tới người cụ thể không phải quét mọi kết nối)
let timer: any = null;
let connId = 0;

function startTimer() {
  if (timer) return;
  timer = setInterval(heartbeat, limits().heartbeatSec * MS_PER_SEC);
  if (timer && typeof timer.unref === 'function') timer.unref();
}
function stopTimer() {
  if (timer) clearInterval(timer);
  timer = null;
}
function restartTimer() {
  stopTimer();
  if (conns.size) startTimer();
}

// Đóng một kết nối. bye: dữ liệu khung `bye` gửi trước khi đóng (null = đóng lặng, khách tự nối lại).
function drop(conn?, bye: any = null) {
  if (conn.closed) return;
  conn.closed = true;
  conns.delete(conn);
  const own = byUser.get(conn.username);
  if (own) {
    own.delete(conn);
    if (!own.size) byUser.delete(conn.username);
  }
  if (!conns.size) stopTimer();
  try {
    if (bye) conn.res.write(frame('bye', bye, { id: nextId() }));
  } catch {
    /* kết nối đã chết */
  }
  try {
    conn.res.end();
  } catch {
    /* đã đóng */
  }
}
function write(conn?, text?) {
  if (conn.closed) return false;
  try {
    conn.res.write(text);
  } catch {
    drop(conn);
    return false;
  }
  // áp lực ghi: khách quá chậm thì đóng, khách nối lại và nạp lại (không giữ hàng đợi không trần trong bộ nhớ)
  if (conn.res.writableLength > limits().maxBacklogBytes) {
    drop(conn);
    return false;
  }
  return true;
}

// Mỗi nhịp tim: kiểm lại phiên (đăng xuất, khoá, đổi mật khẩu, hết hạn thì bye) rồi gửi dòng chú thích
async function heartbeat() {
  for (const conn of [...conns]) {
    let fresh: any = null;
    try {
      fresh = await conn.checkSession();
    } catch {
      fresh = null;
    }
    if (!fresh) drop(conn, { reason: 'session' });
    else {
      conn.me = fresh;
      write(conn, ': ping\n\n');
    }
  }
}

/* ========================= phát ========================= */
async function audienceAllows(audience?, conn?, me?) {
  if (!audience || audience.all === true) return true;
  if (Array.isArray(audience.users)) return audience.users.includes(conn.username);
  if (typeof audience.cap === 'string') {
    const scope = await authz.scopeOf(me, audience.cap);
    return audience.scope ? scope === audience.scope : !!scope;
  }
  return false;
}
function audienceKind(audience?) {
  if (audience && audience.all === true) return 'all';
  if (audience && Array.isArray(audience.users)) return 'users';
  if (audience && typeof audience.cap === 'string') return 'cap';
  return null;
}
// Tầng của người nhận (quyền tính lại ở mỗi lần phát, không dùng bản chụp lúc nối)
const tierFor = async (def?, me?) =>
  (await AsyncList.find(def.tiers, async t => !t.cap || (await authz.scopeOf(me, t.cap)) === 'all')) || null;

// Trả số kết nối đã nhận. Không bao giờ ném lỗi ra cho người gọi sau COMMIT, trừ lỗi lập trình (tên lạ, kiểu người nhận không được phép).
async function publish(name?, payload?, audience?) {
  const def = EVENTS[name];
  if (!def) throw new Error(`Sự kiện không có trong danh mục: ${name}`);
  const kind = audienceKind(audience);
  if (!kind || !def.audiences.includes(kind))
    throw new Error(`Sự kiện ${name} không được phát tới kiểu người nhận này`);
  let sent = 0;
  const fresh = new Map<any, any>(); // tài khoản → hồ sơ mới đọc (một lần cho mỗi lần phát)
  // Người nhận cụ thể: chỉ duyệt kết nối của đúng những tài khoản đó (không đọc hồ sơ của ai khác). all / cap phải xét mọi kết nối.
  const targets =
    kind === 'users'
      ? [...new Set<any>(audience.users)].flatMap(username => [...(byUser.get(username) || [])])
      : [...conns];
  for (const conn of targets) {
    try {
      if (!fresh.has(conn.username)) fresh.set(conn.username, (await getStore().getStaff(conn.username)) || null);
      const me = fresh.get(conn.username);
      if (!me || me.locked) {
        drop(conn, { reason: 'session' });
        continue;
      }
      conn.me = me;
      if (!(await audienceAllows(audience, conn, me))) continue;
      const tier = await tierFor(def, me);
      if (!tier) continue;
      if (write(conn, frame(name, project(payload, tier.fields), { id: nextId() }))) sent++;
    } catch {
      drop(conn);
    }
  }
  return sent;
}

// Gom sự kiện trong lúc làm việc rồi phát SAU COMMIT: const b = events.batch(); b.publish(...); ...; (giao dịch xong) b.flush().
function batch() {
  const pending: any[] = [];
  return {
    publish(name?, payload?, audience?) {
      if (!EVENTS[name]) throw new Error(`Sự kiện không có trong danh mục: ${name}`);
      pending.push([name, payload, audience]);
    },
    async flush() {
      const items = pending.splice(0);
      return AsyncList.reduce(
        items,
        async (n, [name, payload, audience]: any) => n + (await publish(name, payload, audience)),
        0
      );
    },
    discard() {
      pending.length = 0;
    },
    get size() {
      return pending.length;
    }
  };
}

/* ========================= người phát theo nghiệp vụ (gọi SAU COMMIT) ========================= */
// Mỗi hàm là một dòng ở server.js. Chúng chỉ ghép tên sự kiện, người nhận và payload; chiếu trường vẫn do EVENTS làm.
// Giai đoạn của kỳ cho nhân viên: open | locked | paid (không lộ trạng thái chi tiết)
const STAGE_OF = Object.freeze({
  open: 'open',
  attendance_locked: 'locked',
  calculated: 'locked',
  reviewed: 'locked',
  approved: 'locked',
  paid: 'paid'
});
const groupsOf = (keys?) =>
  [
    ...new Set<any>(
      (keys || [])
        .map(key => registry.entryFor(key))
        .filter(Boolean)
        .map(found => found.entry.group)
    )
  ].sort((a: any, b: any) => a - b);
const emit = Object.freeze({
  // period: { month, status, rev } (kết quả của các bước /api/periods/:month/*)
  periodChanged: async (period?) =>
    await publish('period.changed', { ...period, stage: STAGE_OF[period.status] || 'locked' }, { all: true }),
  // info: result.notice của paramsSave.save/revert ({ configRev, fromMonth, keys, by }) hoặc { configRev, fromMonth, kind, by } của route công tắc.
  // Khoá được đổi thành MÃ NHÓM cài đặt (không có giá trị, không có tên khoá) trước khi ra khỏi máy chủ.
  paramsChanged: async (info?) =>
    await publish(
      'params.changed',
      { ...info, kind: info.kind || 'params', groups: info.groups || groupsOf(info.keys) },
      { all: true }
    ),
  approvalsChanged: async (month?) =>
    await publish(
      'approvals.changed',
      { month, pending: (await getStore().approvals.list({ status: 'pending' })).length },
      { cap: authz.DECIDE_ALL, scope: 'all' }
    ),
  // kind: 'forgot' | 'ot' | 'punch' (có người Check-in / Check-out hoặc lượt quá hạn được đóng tự động)
  attendanceChanged: async (kind?, month?) =>
    await publish('attendance.changed', { kind, month }, { cap: 'attendance.correct', scope: 'all' }),
  // rows: [{ username, date, status }] của store.approvals.decide ('approved' | 'rejected')
  // Mỗi người MỘT tin dù được duyệt nhiều dòng: ngày sớm nhất, decision 'mixed' khi các quyết định khác nhau (gợi ý nạp lại, không mang dữ liệu)
  requestsDecided: async (rows?) => {
    const byPerson = new Map<any, any>();
    for (const row of rows) {
      const have = byPerson.get(row.username);
      if (!have) byPerson.set(row.username, { date: row.date, decision: row.status });
      else {
        if (row.date < have.date) have.date = row.date;
        if (row.status !== have.decision) have.decision = 'mixed';
      }
    }
    let sent = 0;
    for (const [username, item] of byPerson)
      sent += await publish(
        'request.decided',
        { month: item.date.slice(0, 7), date: item.date, decision: item.decision },
        { users: [username] }
      );
    return sent;
  },
  // Yêu cầu ứng lương của một người vừa được duyệt hoặc từ chối: cùng tin request.decided với khoản tự khai, nhưng mang kind 'advance'
  // và KHÔNG có date (ứng lương không gắn ngày; màn nhân viên nhận ra ứng lương nhờ kind)
  advanceDecided: (username?, month?, decision?) =>
    publish('request.decided', { month, decision, kind: 'advance' }, { users: [username] }),
  punchCorrected: (username?, date?) =>
    publish('punch.corrected', { month: date.slice(0, 7), date }, { users: [username] }),
  punchChanged: async (username?, date?) =>
    await publish('punch.changed', { month: date.slice(0, 7), date }, { users: [username] }),
  rolesChanged: async (username?) => await publish('roles.changed', {}, { users: [username] }),
  estimateChanged: async (username?, month?) => await publish('estimate.changed', { month }, { users: [username] }),
  payslipAvailable: async (month?, usernames?) => await publish('payslip.available', { month }, { users: usernames })
});

/* ========================= SSE: GET /api/events ========================= */
// me: người đã xác thực (store.getStaff). opts.checkSession: () => hồ sơ mới | null, gọi mỗi nhịp tim (mặc định đọc lại cookie).
async function handleSse(req?, res?, me?, opts: any = {}) {
  if (!me || !me.username) {
    res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ error: 'Chưa đăng nhập' }));
  }
  const cfg = limits();
  if (conns.size >= cfg.maxTotal) {
    res.writeHead(503, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Retry-After': String(Math.ceil(cfg.retryMs / MS_PER_SEC))
    });
    return res.end(
      JSON.stringify({ error: 'Máy chủ đang giữ quá nhiều kết nối báo tin, thử lại sau', code: 'EVENTS_FULL' })
    );
  }
  const cookie = req.headers && req.headers.cookie;
  const conn = {
    id: ++connId,
    username: me.username,
    me,
    res,
    closed: false,
    checkSession:
      opts.checkSession ||
      (async () => {
        const user = await getAuth().readSession(cookie);
        return user && user === me.username ? await getStore().getStaff(user) : null;
      })
  };
  // trần mỗi người: kết nối thứ (maxPerUser + 1) đóng kết nối cũ nhất của người đó
  const mine = [...(byUser.get(me.username) || [])];
  for (const old of mine.slice(0, Math.max(0, mine.length - cfg.maxPerUser + 1))) drop(old, { reason: 'superseded' });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  if (typeof res.flushHeaders === 'function') res.flushHeaders();
  if (req.socket) {
    if (typeof req.socket.setTimeout === 'function') req.socket.setTimeout(0);
    if (typeof req.socket.setNoDelay === 'function') req.socket.setNoDelay(true);
  }
  conns.add(conn);
  if (!byUser.has(conn.username)) byUser.set(conn.username, new Set());
  byUser.get(conn.username).add(conn);
  startTimer();
  const cleanup = () => drop(conn);
  if (typeof req.on === 'function') req.on('close', cleanup);
  if (typeof res.on === 'function') {
    res.on('close', cleanup);
    res.on('error', cleanup);
  }
  const info = await getConfigRev().info();
  write(
    conn,
    frame(
      'hello',
      { epoch: info.epoch, serverTime: Date.now(), configRev: info.configRev, build: info.build },
      { id: nextId(), retry: cfg.retryMs }
    )
  );
  // Nối lại (Last-Event-ID) hoặc lần đầu: không phát lại tin lỡ; khách nối lại được báo nạp lại màn đang xem
  if (req.headers && req.headers['last-event-id']) write(conn, frame('resync', {}, { id: nextId() }));
  return conn;
}

function closeUser(username?, reason = 'session') {
  let closed = 0;
  for (const conn of [...(byUser.get(username) || [])]) {
    drop(conn, { reason });
    closed++;
  }
  return closed;
}
function closeAll() {
  for (const conn of [...conns]) drop(conn);
  stopTimer();
}
// Chỉ số đếm cho đo đạc và test: không có tên hay dữ liệu
const stats = () => ({
  connections: conns.size,
  users: byUser.size,
  heartbeatRunning: !!timer
});

export = {
  EVENTS,
  SYSTEM_FRAMES,
  publish,
  batch,
  handleSse,
  closeUser,
  closeAll,
  emit,
  configure,
  stats,
  frame
};
