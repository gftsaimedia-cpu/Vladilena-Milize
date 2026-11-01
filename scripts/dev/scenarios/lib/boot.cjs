'use strict';
// Nạp ứng dụng thật trong cùng tiến trình với đồng hồ đóng băng (chỉ tiến, không lùi) và một file SQLite riêng của kịch bản.
// Mọi biến môi trường ứng dụng đọc được đặt TRƯỚC khi require: server.js chỉ nạp .env cho biến chưa đặt, nên giá trị ở đây luôn thắng.
const path = require('node:path');
const crypto = require('node:crypto');

const REPO = path.resolve(__dirname, '..', '..', '..', '..');
const NativeDate = Date;
const VN_OFFSET_MS = 7 * 3600000;

// 'YYYY-MM-DDTHH:mm[:ss]' giờ Việt Nam → mốc ms; sai dạng thì ném lỗi
function parseLocal(local) {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(local));
  if (!m) throw new Error(`Giờ kịch bản sai dạng: ${local}`);
  const ms = NativeDate.parse(`${m[1]}T${m[2]}:${m[3]}:${m[4] || '00'}+07:00`);
  if (!Number.isFinite(ms)) throw new Error(`Giờ kịch bản không có thật: ${local}`);
  return ms;
}
const toLocal = ms => new NativeDate(ms + VN_OFFSET_MS).toISOString().slice(0, 19);

function boot({ dbPath, initialLocal, variant = 'B', quietWarnings = true }) {
  let clock = parseLocal(initialLocal);
  function FrozenDate(...args) {
    if (!new.target) return new NativeDate(clock).toString();
    return Reflect.construct(NativeDate, args.length ? args : [clock], new.target);
  }
  Object.setPrototypeOf(FrozenDate, NativeDate);
  FrozenDate.prototype = NativeDate.prototype;
  FrozenDate.now = () => clock;
  global.Date = FrozenDate;

  Object.assign(process.env, {
    DB_PATH: dbPath,
    SESSION_SECRET: crypto.randomBytes(32).toString('hex'),
    SESSION_COOKIE_NAME: 'luong_scenario_sid',
    SESSION_DAYS: '14',
    COOKIE_SECURE: '0',
    TZ: 'Asia/Ho_Chi_Minh',
    NODE_ENV: 'development',
    WRITE_RATE_PER_MINUTE: '1000000',
    SHED_MAX_LAG_MS: '600000',
    SHED_MAX_INFLIGHT: '100000',
    PASSWORD_HASH_CONCURRENCY: '4',
    AUDIT_KEY: '',
    ACCESS_LOG: 'off',
    TRUST_PROXY: '0',
    SCHEDULE_ALLOW_EDIT: '0',
    SHIFT_ALLOW_EDIT: '0',
    PARAMS_ALLOW_ACTIVATE: '0'
  });
  delete process.env.PORT;
  // Cảnh báo console của ứng dụng (ví dụ lỗi đã được trả 4xx) không làm rối dòng tiến độ
  if (quietWarnings) {
    console.warn = () => {};
    // Dòng nhật ký nội bộ của bước AI soát lặp lại mỗi lần duyệt: bỏ để dòng tiến độ dễ đọc
    const log = console.log;
    console.log = (...items) =>
      typeof items[0] === 'string' && items[0].startsWith('[ai-review]') ? undefined : log(...items);
  }
  const store = require(path.join(REPO, 'lib', 'db.js'));
  const auth = require(path.join(REPO, 'lib', 'auth.js'));
  require(path.join(REPO, 'lib/register-ts'));
  const app = require(path.join(REPO, 'src/server'));
  const clockApi = {
    now: () => clock,
    local: () => toLocal(clock),
    // Chỉ tiến: lùi đồng hồ khi đã có dữ liệu chấm công làm sai trạng thái lượt mở
    set(ms) {
      if (ms < clock) throw new Error(`Đồng hồ không lùi: ${toLocal(clock)} → ${toLocal(ms)}`);
      clock = ms;
    },
    setLocal(local) {
      clockApi.set(parseLocal(local));
    }
  };
  return { store, auth, app, clock: clockApi, REPO, NativeDate };
}

module.exports = { boot, parseLocal, toLocal, REPO, NativeDate };
