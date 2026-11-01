// Băm mật khẩu bằng scrypt và phiên đăng nhập bằng cookie ký HMAC — chỉ dùng module có sẵn của Node.js.
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const store = require('./db');
const { DEFAULTS } = require('../engine/payroll-params');

// Mọi con số của mô-đun đọc từ registry tham số, vì mô-đun nạp trước khi có cơ sở dữ liệu nên dùng
// PayrollParams.DEFAULTS (ops và locked không đổi theo tháng). FALLBACK là bản chép CHUYỂN TIẾP của các khoá system.auth.* và
// unit.msPerSecond đề xuất mà registry chưa có: khoá đã có trong DEFAULTS thì DEFAULTS thắng, và
// scripts/params/check-fallbacks.ts kiểm hai bên bằng nhau. Bỏ bảng này khi registry có đủ khoá.
const FALLBACK = Object.freeze({
  'system.auth.scryptSaltBytes': 16, // locked: độ dài muối scrypt của mật khẩu mới
  'system.auth.scryptKeyBytes': 64, // locked: độ dài khoá scrypt; đổi là mọi mật khẩu đã băm không đăng nhập được
  'system.auth.usernameKeyChars': 80, // ops: số ký tự tên đăng nhập đưa vào khoá giới hạn đoán mật khẩu (chặn tên dài làm đầy bộ nhớ)
  'system.auth.trustProxyMaxHops': 10, // locked: TRUST_PROXY chỉ nhận số nguyên từ 1 tới mức này
  'system.auth.adminPasswordMinProduction': 12, // ops: độ dài tối thiểu ADMIN_PASSWORD khi NODE_ENV=production
  'system.auth.generatedPasswordBytes': 12, // locked: số byte ngẫu nhiên của mật khẩu Admin tự sinh
  'system.auth.sessionSecretBytes': 32, // locked: số byte khoá ký phiên tự sinh
  'system.auth.passMarkChars': 16, // locked: độ dài dấu mật khẩu gắn vào cookie phiên; đổi là mọi phiên cũ hết hiệu lực
  'unit.msPerSecond': 1000 // locked: đơn vị
});
const param = (key?) => {
  if (Object.hasOwn(DEFAULTS, key)) return DEFAULTS[key];
  if (Object.hasOwn(FALLBACK, key)) return FALLBACK[key];
  throw Object.assign(new Error(`Thiếu tham số ${key}`), { code: 'PARAM_MISSING', key });
};
const MS_SECOND = param('unit.msPerSecond');
const MS_MINUTE = param('unit.msPerDay') / param('unit.minutesPerDay'); // mili giây trong một phút
const SALT_BYTES = param('system.auth.scryptSaltBytes');
const KEY_BYTES = param('system.auth.scryptKeyBytes');

function hashPassword(password?) {
  const salt = crypto.randomBytes(SALT_BYTES).toString('hex');
  const hash = crypto.scryptSync(password, salt, KEY_BYTES).toString('hex');
  return `scrypt$${salt}$${hash}`;
}
function verifyPassword(password?, stored?) {
  if (!stored || !stored.startsWith('scrypt$')) return false;
  const [, salt, hash] = stored.split('$');
  const got = crypto.scryptSync(password, salt, KEY_BYTES);
  const want = Buffer.from(hash, 'hex');
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}
// Bản bất đồng bộ của hai hàm trên (crypto.scrypt chạy trên thread pool, không chặn event loop): dùng ở đường có người thật chờ
// (POST /login, PUT /password, POST /staff/:u/password, POST /staff). Bản đồng bộ dùng cho dựng dữ liệu, script và test.
// Hai bản cho cùng kết quả: cùng muối/số byte/khoá nên băm bên này kiểm được bên kia.
// promisify gọi tại lúc dùng (không giữ hàm đã bọc lúc nạp mô-đun) để test/api/mvp-auth.test.ts đếm được số lần băm.
const scryptAsync = (...args) => promisify(crypto.scrypt)(...args);
async function hashPasswordAsync(password?) {
  const salt = crypto.randomBytes(SALT_BYTES).toString('hex');
  const hash = (await scryptAsync(password, salt, KEY_BYTES)).toString('hex');
  return `scrypt$${salt}$${hash}`;
}
async function verifyPasswordAsync(password?, stored?) {
  if (!stored || !stored.startsWith('scrypt$')) return false;
  const [, salt, hash] = stored.split('$');
  const got = await scryptAsync(password, salt, KEY_BYTES);
  const want = Buffer.from(hash, 'hex');
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}
// Băm giả cho tên đăng nhập không tồn tại: vẫn chạy scrypt nên thời gian phản hồi không lộ tên nào có thật
const DUMMY_HASH = hashPassword(crypto.randomBytes(SALT_BYTES).toString('hex'));
// Kiểm mật khẩu đăng nhập; row = dòng staff hoặc undefined. Luôn chạy một lần băm dù có tài khoản hay không.
function verifyLogin(password?, row?) {
  const matches = verifyPassword(password, row ? row.pass_hash : DUMMY_HASH);
  return !!row && matches;
}
async function verifyLoginAsync(password?, row?) {
  const matches = await verifyPasswordAsync(password, row ? row.pass_hash : DUMMY_HASH);
  return !!row && matches;
}

/* ---------- giới hạn đoán mật khẩu ---------- */
// Hai lớp, lưu trong bộ nhớ, mất khi khởi động lại:
// 1) 5 lần sai trong 15 phút với cùng (địa chỉ, tên đăng nhập) thì khoá cặp đó 15 phút;
// 2) từ một địa chỉ, sai mật khẩu với 30 tên đăng nhập KHÁC NHAU trong 15 phút (thử một mật khẩu trên nhiều tài khoản) thì
//    khoá cả địa chỉ 15 phút. Một người sai nhiều lần chỉ tính một tên; ngưỡng 30 chừa chỗ cho văn phòng dùng chung một địa chỉ.
// Cả hai bảng không bao giờ bỏ mục đang khoá khi đầy bộ nhớ.
const LOGIN_MAX_FAILURES = param('system.login.maxFailures');
const LOGIN_SPRAY_USERS = param('system.login.sprayUsers');
const LOGIN_WINDOW_MS = param('system.login.windowMin') * MS_MINUTE;
const LOGIN_MAX_KEYS = param('system.login.maxKeys');
const LOGIN_NAME_CHARS = param('system.auth.usernameKeyChars');
const attempts = new Map<any, any>(); // key → { failures: [thời điểm sai], lockedUntil }
const sprayed = new Map<any, any>(); // địa chỉ → { users: Map(tên → lần sai gần nhất), lockedUntil }
const loginKey = (address?, username?) => `${address}|${username.slice(0, LOGIN_NAME_CHARS)}`;
const splitKey = (key?) => {
  const i = key.indexOf('|');
  return i < 0 ? [key, ''] : [key.slice(0, i), key.slice(i + 1)];
};
// Quá giới hạn thì bỏ các mục cũ nhất không đang khoá (đẩy khoá ra là mở cửa cho kẻ đoán mật khẩu)
function evictUnlocked(map?, now?, limit?) {
  for (const [key, entry] of map) {
    if (map.size <= limit) break;
    if (entry.lockedUntil <= now) map.delete(key);
  }
}
function pruneAttempts(now?, limit = LOGIN_MAX_KEYS) {
  for (const [key, entry] of attempts) {
    entry.failures = entry.failures.filter(t => now - t < LOGIN_WINDOW_MS);
    if (entry.lockedUntil <= now && !entry.failures.length) attempts.delete(key);
  }
  evictUnlocked(attempts, now, limit);
}
function pruneSprayed(now?, limit = LOGIN_MAX_KEYS) {
  for (const [address, entry] of sprayed) {
    for (const [name, at] of entry.users) if (now - at >= LOGIN_WINDOW_MS) entry.users.delete(name);
    if (entry.lockedUntil <= now && !entry.users.size) sprayed.delete(address);
  }
  evictUnlocked(sprayed, now, limit);
}
const secondsLeft = (until?, now?) => (until > now ? Math.ceil((until - now) / MS_SECOND) : 0);
// Số giây còn bị khoá (0 = được thử): khoá của cặp hoặc khoá của cả địa chỉ, cái nào lâu hơn
function loginWait(key?) {
  const now = Date.now();
  pruneAttempts(now);
  pruneSprayed(now);
  const pair = attempts.get(key),
    address = sprayed.get(splitKey(key)[0]);
  return Math.max(secondsLeft(pair ? pair.lockedUntil : 0, now), secondsLeft(address ? address.lockedUntil : 0, now));
}
// Ghi một lần sai. Trả { addressWait }: > 0 nghĩa là lần sai này vừa làm địa chỉ bị khoá (đủ 30 tên khác nhau).
function loginFailed(key?) {
  const now = Date.now(),
    [address, username] = splitKey(key);
  let addressWait = 0;
  let spray = sprayed.get(address);
  if (!spray && sprayed.size >= LOGIN_MAX_KEYS) pruneSprayed(now, LOGIN_MAX_KEYS - 1);
  if (spray || sprayed.size < LOGIN_MAX_KEYS) {
    spray = spray || { users: new Map(), lockedUntil: 0 };
    for (const [name, at] of spray.users) if (now - at >= LOGIN_WINDOW_MS) spray.users.delete(name);
    spray.users.set(username, now);
    if (spray.users.size >= LOGIN_SPRAY_USERS) {
      spray.lockedUntil = now + LOGIN_WINDOW_MS;
      spray.users.clear();
    }
    sprayed.set(address, spray);
    addressWait = secondsLeft(spray.lockedUntil, now);
  }
  // Bộ nhớ đầy toàn khoá còn hiệu lực: không nhận khoá mới thay vì đẩy khoá đang có ra
  if (!attempts.has(key) && attempts.size >= LOGIN_MAX_KEYS) {
    pruneAttempts(now, LOGIN_MAX_KEYS - 1);
    if (attempts.size >= LOGIN_MAX_KEYS) return { addressWait };
  }
  const entry = attempts.get(key) || { failures: [], lockedUntil: 0 };
  entry.failures = entry.failures.filter(t => now - t < LOGIN_WINDOW_MS);
  entry.failures.push(now);
  if (entry.failures.length >= LOGIN_MAX_FAILURES) {
    entry.lockedUntil = now + LOGIN_WINDOW_MS;
    entry.failures = [];
  }
  attempts.set(key, entry);
  return { addressWait };
}
function loginSucceeded(key?) {
  attempts.delete(key);
  // Người này đăng nhập được: lần gõ nhầm trước đó không còn tính vào số tên khác nhau của địa chỉ
  const spray = sprayed.get(splitKey(key)[0]);
  if (spray) spray.users.delete(splitKey(key)[1]);
}

// Số proxy tin cậy phía trước máy chủ (TRUST_PROXY=n, n từ 1 đến system.auth.trustProxyMaxHops); 0 = không tin X-Forwarded-For.
const TRUST_PROXY_MAX = param('system.auth.trustProxyMaxHops');
function trustedHops(env = process.env) {
  const n = Number(env.TRUST_PROXY);
  return Number.isInteger(n) && n >= 1 && n <= TRUST_PROXY_MAX ? n : 0;
}
// Thông báo khi TRUST_PROXY được đặt nhưng sai dạng (hành vi vẫn là không tin header); null nếu bỏ trống hoặc hợp lệ.
// Không in lại giá trị.
function trustProxyWarning(env = process.env) {
  const raw = String(env.TRUST_PROXY ?? '').trim();
  if (!raw || trustedHops(env)) return null;
  return `Cảnh báo: TRUST_PROXY phải là số nguyên từ 1 đến ${TRUST_PROXY_MAX} (số proxy tin cậy phía trước). Giá trị hiện tại bị bỏ qua, máy chủ chỉ dùng địa chỉ kết nối nên giới hạn đăng nhập sẽ tính theo địa chỉ của proxy.`;
}

// Mật khẩu cho tài khoản admin đầu tiên (DB trống). ADMIN_PASSWORD để trống: môi trường production thì từ chối khởi động,
// còn lại sinh mật khẩu ngẫu nhiên (không in ra, không có mật khẩu mặc định đoán được).
const ADMIN_PASSWORD_MIN_PRODUCTION = param('system.auth.adminPasswordMinProduction');
function bootstrapAdminPassword(env = process.env) {
  const given = String(env.ADMIN_PASSWORD || '');
  if (given.trim()) {
    if (env.NODE_ENV === 'production' && given.length < ADMIN_PASSWORD_MIN_PRODUCTION)
      throw new Error(
        `ADMIN_PASSWORD quá ngắn: môi trường production cần ít nhất ${ADMIN_PASSWORD_MIN_PRODUCTION} ký tự. Đặt mật khẩu dài hơn trong .env rồi khởi động lại.`
      );
    return { password: given, generated: false };
  }
  if (env.NODE_ENV === 'production')
    throw new Error(
      'Chưa đặt ADMIN_PASSWORD: DB chưa có tài khoản nào nên không thể tạo Admin đầu tiên. Đặt ADMIN_PASSWORD (mật khẩu mạnh) trong .env rồi khởi động lại.'
    );
  return {
    password: crypto.randomBytes(param('system.auth.generatedPasswordBytes')).toString('base64url'),
    generated: true
  };
}

// Khoá ký phiên: lấy từ biến môi trường SESSION_SECRET. Môi trường production (NODE_ENV=production hoặc COOKIE_SECURE=1) BẮT BUỘC có:
// nếu để máy chủ sinh rồi lưu vào settings.session_secret thì mọi bản sao lưu mang theo khoá ký cookie. Dev và sandbox: không có thì sinh một lần
// và lưu trong DB.
const isProduction = (env = process.env) => env.NODE_ENV === 'production' || env.COOKIE_SECURE === '1';
async function sessionSecret(env = process.env, db = store) {
  if (env.SESSION_SECRET) return env.SESSION_SECRET;
  if (isProduction(env))
    throw new Error(
      'Chưa đặt SESSION_SECRET: môi trường production (NODE_ENV=production hoặc COOKIE_SECURE=1) cần khoá ký phiên đặt bằng biến môi trường, không sinh và lưu trong cơ sở dữ liệu (bản sao lưu sẽ mang theo khoá). Đặt SESSION_SECRET (chuỗi ngẫu nhiên dài) trong .env rồi khởi động lại.'
    );
  let secret = await db.getSetting('session_secret', null);
  if (!secret) {
    secret = crypto.randomBytes(param('system.auth.sessionSecretBytes')).toString('hex');
    await db.setSetting('session_secret', secret);
  }
  return secret;
}
// Có SESSION_SECRET trong môi trường thì dùng ngay (đồng bộ). Không có thì đọc/sinh trong DB (bất đồng bộ): server.js chờ auth.ready trước khi nhận kết nối.
let SECRET = process.env.SESSION_SECRET || null;
const ready = SECRET
  ? Promise.resolve()
  : sessionSecret().then(value => {
      SECRET = value;
    });
ready.catch(() => {}); // lỗi được báo lại ở nơi chờ ready (server.js dừng tiến trình); tránh cảnh báo promise bị bỏ rơi
const SESSION_DAYS = Number(process.env.SESSION_DAYS || param('system.session.days'));
// Thời hạn cookie (giây) và phiên (mili giây) theo SESSION_DAYS; server.js dùng SESSION_MAX_AGE_SEC cho Max-Age
const SESSION_MS = SESSION_DAYS * param('unit.msPerDay');
const SESSION_MAX_AGE_SEC = SESSION_MS / MS_SECOND;
const COOKIE = process.env.SESSION_COOKIE_NAME || 'luong_sid';
if (!/^[A-Za-z0-9_-]+$/.test(COOKIE)) throw new Error('SESSION_COOKIE_NAME không hợp lệ');

const sign = (data?) => {
  if (!SECRET) throw new Error('Khoá ký phiên chưa sẵn sàng: chờ auth.ready trước khi ký');
  return crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
};
// Dấu của mật khẩu hiện tại gắn vào phiên: đổi mật khẩu (tự đổi hoặc Admin đặt lại) thì mọi phiên cũ hết hiệu lực
const passMark = async (username?) => {
  await ready;
  const row = await store.getStaffRow(username);
  return row ? sign(`pw:${row.pass_hash}`).slice(0, param('system.auth.passMarkChars')) : null;
};

// Số phiên bản phiên của tài khoản: đăng xuất, khoá hoặc đổi mật khẩu làm nó tăng, mọi cookie cũ hết hiệu lực
const sessionVersionOf = async (username?) => (await store.getSessionVersion(username)) || 0;

async function createSession(username?) {
  await ready;
  const payload = Buffer.from(
    JSON.stringify({
      u: username,
      v: await passMark(username),
      sv: await sessionVersionOf(username),
      exp: Date.now() + SESSION_MS
    })
  ).toString('base64url');
  return `${payload}.${sign(payload)}`;
}
async function readSession(cookieHeader?) {
  await ready;
  const m = new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`).exec(cookieHeader || '');
  if (!m) return null;
  const [payload, sig] = m[1].split('.');
  if (!payload || !sig) return null;
  const want = Buffer.from(sign(payload)),
    got = Buffer.from(sig);
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
  try {
    const s = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (!(s.exp > Date.now()) || !s.v || s.v !== (await passMark(s.u))) return null;
    const row = await store.getStaffRow(s.u);
    // Cookie cũ chưa có sv coi như phiên bản 0; tài khoản bị khoá không còn phiên nào hợp lệ
    return row && !row.locked_at && (s.sv ?? 0) === (await sessionVersionOf(s.u)) ? s.u : null;
  } catch {
    return null;
  }
}
function cookieHeader(value?, maxAgeSec?) {
  const secure = process.env.COOKIE_SECURE === '1' ? '; Secure' : '';
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure}`;
}

export = {
  ready,
  hashPassword,
  hashPasswordAsync,
  verifyPassword,
  verifyPasswordAsync,
  verifyLogin,
  verifyLoginAsync,
  bootstrapAdminPassword,
  trustedHops,
  trustProxyWarning,
  loginKey,
  loginWait,
  loginFailed,
  loginSucceeded,
  createSession,
  readSession,
  cookieHeader,
  SESSION_DAYS,
  SESSION_MAX_AGE_SEC,
  sessionSecret,
  isProduction,
  FALLBACK
};
