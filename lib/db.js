// Lớp dữ liệu: SQLite có sẵn trong Node.js (node:sqlite), không cần cài thêm gói nào.
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { warnIf, optionalReason } = require('./warnings'); // warnings.js không require lib/db
const config = require('./config'); // hằng số kỹ thuật có tên (không số trong mã)
const agentsOn = () => module.exports.getSetting(config.AGENTS_SETTING_KEY, config.AGENTS_OFF) === config.AGENTS_ON; // công tắc Agents bật
const { PersonName, titleCase } = require('./domain/employee/person-name'); // lớp thuần, không require lib/db

// Không có đường dẫn mặc định: chạy nhầm `npm start` hay `npm run seed` sẽ không âm thầm mở DB thật (data/luong.sqlite).
const DB_PATH = process.env.DB_PATH;
if (!DB_PATH)
  throw new Error(
    [
      'Chưa đặt biến môi trường DB_PATH nên ứng dụng không mở cơ sở dữ liệu (tránh vô tình dùng data/luong.sqlite).',
      'Cách đặt rồi chạy lại:',
      '  bash:       DB_PATH=./data/dev.sqlite npm start',
      "  PowerShell: $env:DB_PATH='./data/dev.sqlite'; npm start",
      '  npm start còn đọc được dòng DB_PATH=./data/dev.sqlite trong file .env cạnh server.js;',
      '  npm run seed và npm run sandbox không đọc .env, chỉ nhận biến môi trường (sandbox luôn dùng DB trong RAM).',
      'Muốn dùng DB thật, đặt rõ DB_PATH=./data/luong.sqlite. Docker đã đặt sẵn biến này.'
    ].join('\n')
  );
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);

// Đồng hồ chỉ đọc qua Date.now() để test và sandbox giả được giờ.
const now = () => new Date(Date.now()).toISOString();
// Thêm cột chỉ khi chưa có (nâng cấp DB cũ). Tên bảng, tên cột và kiểu luôn là hằng số trong mã, không lấy từ người dùng.
function addColumn(table, name, type) {
  if (!/^[a-z_]+$/.test(table) || !/^[a-z_]+$/.test(name))
    throw new Error(`Tên bảng hoặc cột không hợp lệ: ${table}.${name}`);
  const exists = db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .some(column => column.name === name);
  if (!exists) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
}
// Gói ghi nhiều bước thành một: lỗi thì hoàn tác cả gói. Dùng SAVEPOINT nên gọi lồng nhau được.
let transactionId = 0;
function transaction(write) {
  const name = `write_${++transactionId}`;
  db.exec(`SAVEPOINT ${name}`);
  try {
    const value = write();
    db.exec(`RELEASE ${name}`);
    return value;
  } catch (error) {
    db.exec(`ROLLBACK TO ${name}`);
    db.exec(`RELEASE ${name}`);
    throw error;
  }
}
// Lỗi khi khởi động mà người vận hành phải tự xử lý: in hướng dẫn tiếng Việt rồi thoát, không in cả dòng stack.
function bootFail(lines) {
  console.error(['', ...lines, ''].join('\n'));
  process.exit(1);
}
db.exec(`
  PRAGMA journal_mode = WAL;
  -- Chờ khoá ghi thay vì báo SQLITE_BUSY ngay: mặc định của node:sqlite là 0, nên chỉ cần một tiến trình thứ hai
  -- (sao lưu, soát dữ liệu) đang đọc là lượt ghi của app có thể nhận lỗi. Số ở lib/config.js.
  PRAGMA busy_timeout = ${Number(config.DB_BUSY_TIMEOUT_MS)};
  CREATE TABLE IF NOT EXISTS staff (
    username   TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    role       TEXT NOT NULL DEFAULT 'staff',   -- 'staff' | 'admin'
    type       TEXT NOT NULL DEFAULT 'tts',     -- 'tts' | 'ctv' | 'nv'
    level      INTEGER NOT NULL DEFAULT 1,
    night_pct  INTEGER,                          -- chỉ nhóm 'nv': 40 | 60
    idorm      INTEGER NOT NULL DEFAULT 0,
    shift_code TEXT,                             -- ca cố định: n1 n2 f1 f2 g1 g2
    pass_hash  TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS timesheets (
    username   TEXT NOT NULL,
    month      TEXT NOT NULL,                    -- 'YYYY-MM'
    days_json  TEXT NOT NULL DEFAULT '{}',
    kpi_pct    REAL,
    kpi_amt    REAL,                             -- mức đề xuất lương KPI
    kpi_adm_pct REAL,                            -- % KPI Admin duyệt (null = chưa duyệt)
    kpi_adm_amt REAL,                            -- mức KPI Admin duyệt
    updated_at TEXT NOT NULL,
    PRIMARY KEY (username, month)
  );
  CREATE TABLE IF NOT EXISTS settings (
    key        TEXT PRIMARY KEY,
    value_json TEXT NOT NULL
  );
`);
addColumn('staff', 'shift_code', 'TEXT'); // nâng cấp DB cũ
addColumn('timesheets', 'kpi_amt', 'REAL');
addColumn('timesheets', 'kpi_adm_pct', 'REAL'); // Admin duyệt KPI
addColumn('timesheets', 'kpi_adm_amt', 'REAL');
addColumn('timesheets', 'rev', 'INTEGER NOT NULL DEFAULT 0'); // số lần lưu lịch khai, khoá lạc quan cho PUT /api/sheet (dòng cũ = 0)
// Số Admin sửa tay trên phiếu lương (theo người + tháng); chỉ Admin thấy, không đổi lịch / số ước tính
db.exec(`CREATE TABLE IF NOT EXISTS slip_overrides (
  username    TEXT NOT NULL,
  month       TEXT NOT NULL,
  values_json TEXT NOT NULL,
  updated_by  TEXT,
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (username, month)
)`);
addColumn('staff', 'start_date', 'TEXT'); // phép năm: ngày đầu đi làm 'YYYY-MM-DD'
addColumn('staff', 'birthday', 'TEXT'); // phép năm: ngày sinh 'YYYY-MM-DD'
addColumn('staff', 'leave_adjust', 'REAL NOT NULL DEFAULT 0'); // phép năm: Admin cộng/trừ tay
addColumn('staff', 'contract', 'TEXT'); // thuế TNCN: 'long' = HĐLĐ từ 3 tháng · 'short' = dưới 3 tháng / thử việc / vãng lai; null = mặc định theo loại nhân sự
addColumn('staff', 'insured', 'INTEGER'); // đóng BH bắt buộc (1/0); null = mặc định theo loại hợp đồng
addColumn('staff', 'dependants', 'INTEGER NOT NULL DEFAULT 0'); // số người phụ thuộc đã đăng ký giảm trừ gia cảnh
addColumn('staff', 'job_title', 'TEXT'); // tên vị trí công việc (in trên phiếu lương)
// Admin bật/tắt cho từng người: khấu trừ thuế TNCN, giảm trừ gia cảnh, tạm ứng; null = có
for (const column of ['tax_on', 'deduct_on', 'advance_on']) addColumn('staff', column, 'INTEGER');
// Khoá tài khoản thay cho xoá: locked_at null = đang hoạt động; session_version tăng thì mọi phiên đăng nhập cũ hết hiệu lực
addColumn('staff', 'locked_at', 'TEXT');
addColumn('staff', 'locked_by', 'TEXT');
addColumn('staff', 'session_version', 'INTEGER NOT NULL DEFAULT 0');
db.exec(`
  CREATE TABLE IF NOT EXISTS punches (            -- check-in / check-out: mỗi lần bấm một dòng
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    at       TEXT NOT NULL,                       -- ISO UTC theo đồng hồ máy chủ
    type     TEXT NOT NULL,                       -- 'in' | 'out'
    ip       TEXT,                                -- chỉ để tham khảo, không dùng để chặn
    auto     INTEGER NOT NULL DEFAULT 0           -- 1 = máy chủ tự đóng ca sau 16 tiếng
  );
  CREATE INDEX IF NOT EXISTS punches_user ON punches (username, id);
  CREATE TABLE IF NOT EXISTS corrections (        -- yêu cầu điều chỉnh giờ chấm công
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    username   TEXT NOT NULL,
    date       TEXT NOT NULL,                     -- ngày công 'YYYY-MM-DD'
    req_in     TEXT NOT NULL,                     -- khoảng có mặt xin sửa, ISO UTC
    req_out    TEXT NOT NULL,
    reason     TEXT NOT NULL,
    status     TEXT NOT NULL DEFAULT 'pending',   -- 'pending' | 'approved' | 'rejected' | 'replaced'
    decided_by TEXT,
    decided_at TEXT,
    note       TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS attendance_days (    -- giờ chấm công gửi Admin, tách khỏi lịch ước tính
    username   TEXT NOT NULL,
    date       TEXT NOT NULL,
    entry_json TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (username, date)
  );
`);

addColumn('punches', 'context_json', 'TEXT'); // ca cố định tại lúc check-in; không sửa các dòng cũ
addColumn('corrections', 'context_json', 'TEXT'); // ca của ngày tại lúc gửi yêu cầu
const withContext = r =>
  r
    ? {
        ...r,
        sessionId: r.session_id ?? null,
        sessionVersion: r.session_version ?? null,
        context: r.context_json ? JSON.parse(r.context_json) : null
      }
    : null;

// Sao chép lịch sử chấm công một lần. Giữ nguyên JSON bảng lương cũ để không mất dữ liệu;
// API chỉ chiếu các trường khai tay khi đọc lịch ước tính.
if (!db.prepare('SELECT 1 FROM settings WHERE key = ?').get('attendance_split_v1')) {
  db.exec('BEGIN');
  try {
    const copy = db.prepare(
      'INSERT OR IGNORE INTO attendance_days (username, date, entry_json, updated_at) VALUES (?, ?, ?, ?)'
    );
    for (const row of db.prepare('SELECT username, days_json, updated_at FROM timesheets').all()) {
      for (const [date, entry] of Object.entries(JSON.parse(row.days_json))) {
        if (entry && entry.src) copy.run(row.username, date, JSON.stringify(entry), row.updated_at);
      }
    }
    db.prepare('INSERT INTO settings (key, value_json) VALUES (?, ?)').run(
      'attendance_split_v1',
      JSON.stringify({ at: now() })
    );
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
// KPI theo 5 thành phần. Chỉ thêm bảng, không đụng bảng cũ.
// Điểm lưu SỐ NGUYÊN theo phần trăm của điểm: điểm × 100 (87,5 điểm = 8750), từ 0 đến 10000, để phép tính không dùng số thực.
// Cột CHECK chặn cả số thập phân lọt vào (typeof phải là integer); khoá JSON ngoài API là user và self, cột đặt tên khác để tránh từ dễ nhầm.
const KPI_COLUMNS = { wework: 'wework', user: 'user_score', peer: 'peer', manager: 'manager', self: 'self_score' };
const KPI_KEYS = Object.keys(KPI_COLUMNS);
const KPI_SCORE_MAX = 10000;
const KPI_MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const kpiCheck = column =>
  `${column} INTEGER CHECK (${column} IS NULL OR (typeof(${column}) = 'integer' AND ${column} >= 0 AND ${column} <= ${KPI_SCORE_MAX}))`;
db.exec(`
  CREATE TABLE IF NOT EXISTS kpi_scores (           -- điểm 5 thành phần KPI, mỗi người mỗi tháng một dòng; null = chưa nhập
    username    TEXT NOT NULL,
    month       TEXT NOT NULL,                       -- 'YYYY-MM'
    ${kpiCheck('wework')},                           -- Base Wework (điểm × 100)
    ${kpiCheck('user_score')},                       -- người dùng
    ${kpiCheck('peer')},                             -- đồng nghiệp
    ${kpiCheck('manager')},                          -- quản lý trực tiếp
    ${kpiCheck('self_score')},                       -- tự đánh giá
    created_by  TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    updated_by  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    PRIMARY KEY (username, month)
  );
  CREATE INDEX IF NOT EXISTS kpi_scores_month ON kpi_scores (month);
  CREATE TABLE IF NOT EXISTS kpi_score_log (        -- nhật ký chỉ thêm dòng: mã không UPDATE hay DELETE (trừ khi xoá hẳn tài khoản)
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    username  TEXT NOT NULL,
    month     TEXT NOT NULL,
    field     TEXT NOT NULL,                         -- wework | user | peer | manager | self (điểm × 100) | amt (đồng)
    old_value REAL,
    new_value REAL,
    by        TEXT NOT NULL,
    at        TEXT NOT NULL,
    reason    TEXT
  );
  CREATE INDEX IF NOT EXISTS kpi_score_log_user_month ON kpi_score_log (username, month, id);
`);
// Lỗi có mã để server.js đổi thành mã HTTP 400. `field` là khoá gây lỗi (không chứa giá trị người dùng nhập).
function kpiError(code, message, field) {
  return Object.assign(new Error(message), { code, ...(field ? { field } : {}) });
}
const rowToKpiScores = r =>
  r == null
    ? null
    : {
        username: r.username,
        month: r.month,
        scores: Object.fromEntries(KPI_KEYS.map(key => [key, r[KPI_COLUMNS[key]]])),
        complete: KPI_KEYS.every(key => r[KPI_COLUMNS[key]] != null),
        createdBy: r.created_by,
        createdAt: r.created_at,
        updatedBy: r.updated_by,
        updatedAt: r.updated_at
      };
const rowToKpiLog = r => ({
  id: r.id,
  username: r.username,
  month: r.month,
  field: r.field,
  oldValue: r.old_value,
  newValue: r.new_value,
  by: r.by,
  at: r.at,
  reason: r.reason ?? null
});
function checkKpiMonth(month) {
  if (typeof month !== 'string' || !KPI_MONTH_RE.test(month))
    throw kpiError('KPI_MONTH_INVALID', 'Tháng phải có dạng YYYY-MM');
}
// Gom và kiểm cả gói thay đổi trước khi ghi: một giá trị sai thì không ghi gì. Trả về [{ key, value }] (value null = xoá điểm).
function checkKpiPatch(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch))
    throw kpiError('KPI_EMPTY_PATCH', 'Không có điểm nào để lưu');
  const entries = [];
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue; // khoá vắng = giữ nguyên
    if (!KPI_KEYS.includes(key) && key !== 'amt')
      throw kpiError('KPI_KEY_UNKNOWN', `Không có thành phần KPI "${key}"`, key);
    if (value !== null) {
      if (key === 'amt') {
        if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
          throw kpiError('KPI_AMT_INVALID', 'Mức KPI phải là số không âm', key);
      } else if (!Number.isSafeInteger(value) || value < 0 || value > KPI_SCORE_MAX)
        throw kpiError(
          'KPI_SCORE_INVALID',
          `Điểm ${key} phải là số nguyên từ 0 đến ${KPI_SCORE_MAX} (điểm × 100)`,
          key
        );
    }
    entries.push({ key, value });
  }
  if (!entries.length) throw kpiError('KPI_EMPTY_PATCH', 'Không có điểm nào để lưu');
  return entries;
}
// Mặc định thuế/BH khi Admin chưa chọn: TTS = hợp đồng dưới 3 tháng, không đóng BH; CTV/NV = HĐLĐ từ 3 tháng, có đóng BH.
// Chức vụ là dữ liệu (mã mới ngoài tts/ctv/nv): server đặt hàm tra khoá type.<mã>.defaultContract qua setDefaultContractResolver.
// Hàm trả 'short' | 'long', hoặc giá trị khác/ném lỗi thì dùng mặc định ở dưới.
let defaultContractResolver = null;
const setDefaultContractResolver = fn => {
  defaultContractResolver = typeof fn === 'function' ? fn : null;
};
const defaultContract = type => {
  if (defaultContractResolver) {
    try {
      const v = defaultContractResolver(type);
      if (v === 'short' || v === 'long') return v;
    } catch {
      // resolver lỗi: rơi về mặc định ở dưới
    }
  }
  return type === 'tts' ? 'short' : 'long';
};
const rowToStaff = r =>
  r &&
  (() => {
    const contract = r.contract === 'long' || r.contract === 'short' ? r.contract : defaultContract(r.type);
    const parts = r.given_name ? null : PersonName.parse(r.name); // dòng thêm thẳng bằng SQL chưa có họ/tên tách sẵn
    return {
      uuid: r.uuid || null,
      username: r.username,
      name: r.name,
      familyName: parts ? parts.familyName : r.family_name || '',
      givenName: parts ? parts.givenName : r.given_name,
      role: r.role,
      type: r.type,
      level: r.level,
      nightPct: r.night_pct,
      idorm: !!r.idorm,
      shiftCode: r.shift_code || null,
      createdAt: r.created_at,
      startDate: r.start_date || null,
      birthday: r.birthday || null,
      leaveAdjust: r.leave_adjust || 0,
      contract,
      insured: r.insured == null ? contract === 'long' : !!r.insured,
      dependants: r.dependants || 0,
      jobTitle: r.job_title || '',
      taxOn: r.tax_on == null ? true : !!r.tax_on,
      deductOn: r.deduct_on == null ? true : !!r.deduct_on,
      advanceOn: r.advance_on == null ? true : !!r.advance_on,
      locked: !!r.locked_at,
      lockedAt: r.locked_at || null,
      lockedBy: r.locked_by || null,
      // Nhân sự được trả lương: null trong DB = suy từ role (admin cũ = không)
      payrollSubject: r.payroll_subject == null ? r.role !== 'admin' : !!r.payroll_subject,
      contractStatus: r.contract_status || null, // 'probation' | 'official' | null: Admin nhập, chỉ để hiển thị
      resignedOn: r.resigned_on || null,
      leaveBalance: r.leave_balance ?? null, // số phép còn lại lưu sẵn (lib/domain/leave), null = chưa tính
      leaveBalanceOn: r.leave_balance_on || null
    };
  })();
function correctionFilter({ username, status, month, sessionId } = {}) {
  const where = [],
    args = [];
  if (username) {
    where.push('username = ?');
    args.push(username);
  }
  if (status) {
    where.push('status = ?');
    args.push(status);
  }
  if (month) {
    where.push('date LIKE ?');
    args.push(month + '-%');
  }
  if (sessionId !== undefined && sessionId !== null) {
    where.push('session_id = ?');
    args.push(sessionId);
  }
  return { sql: where.length ? 'WHERE ' + where.join(' AND ') : '', args };
}

/* ===================== Kỳ lương, nhật ký, tham số, AI, vai trò =====================
 * Chỉ THÊM: bảng mới, chỉ mục, trigger, cột mới có mặc định. Không đổi, không xoá dòng hay cột nào đã có.
 * Khoá ngoại ĐANG BẬT: node:sqlite bật `enableForeignKeyConstraints` mặc định nên `PRAGMA foreign_keys` = 1
 * và REFERENCES được ép thật.
 * Mốc đánh dấu trong settings (chạy một lần, chạy lại không đổi gì): backend_v4_v1a_v1, staff_payroll_subject_v1.
 */
// Lỗi có mã cho server.js: code là mã lỗi (PERIOD_LOCKED, REASON_REQUIRED...), httpStatus là mã HTTP đề xuất, details là phần chi tiết
// KHÔNG chứa dữ liệu nhập tay (chỉ tháng, trạng thái, tên đăng nhập, số đếm).
function storeError(code, message, httpStatus = 400, details = undefined) {
  return Object.assign(new Error(message), { code, httpStatus, ...(details ? { details } : {}) });
}
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
// Nhận 'YYYY-MM' hoặc 'YYYY-MM-DD' (lấy tháng chứa ngày đó); khác thế là BAD_MONTH.
function monthOf(value) {
  if (typeof value === 'string') {
    if (KPI_MONTH_RE.test(value)) return value;
    if (DATE_RE.test(value)) return value.slice(0, 7);
  }
  throw storeError('BAD_MONTH', 'Tháng phải có dạng YYYY-MM');
}
const safeParse = (text, fallback = null) => {
  try {
    return text == null ? fallback : JSON.parse(text);
  } catch {
    return fallback;
  }
};
const REASON_MIN = 10;
const REASON_MAX = 300;
// Lý do không bắt buộc: nhận cả lý do rỗng hay ngắn và trả '' để lưu vào cột NOT NULL. Quá 300 ký tự là lỗi dữ liệu (storeError).
const softReason = (value, code = 'REASON_REQUIRED') => {
  const fail = () => storeError(code, `Lý do tối đa ${REASON_MAX} ký tự`);
  return optionalReason(value, { max: REASON_MAX, tooLong: fail, code });
};
// Cột có CHECK (length BETWEEN 10 AND 300) (ai_finding_actions.note, param_versions.reason, pay_entries.reason) không lưu được chuỗi rỗng,
// và SQLite không sửa CHECK tại chỗ (phải viết lại bảng). Khi thiếu lý do chỗ ghi dùng câu này;
// lý do quá ngắn thì nối thêm cho đủ 10 ký tự.
const NO_REASON_TEXT = 'Không ghi lý do';
const padReason = text => {
  const t = typeof text === 'string' ? text.trim() : '';
  if (!t) return NO_REASON_TEXT;
  return t.length < REASON_MIN ? `${t} (không ghi thêm lý do)` : t;
};
const clampPage = (page, pageSize, fallbackSize = 50) => {
  const size = Math.min(200, Math.max(1, Math.trunc(Number(pageSize)) || fallbackSize));
  const index = Math.max(1, Math.trunc(Number(page)) || 1);
  return { limit: size, offset: (index - 1) * size, page: index, pageSize: size };
};

db.exec(`
  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at TEXT NOT NULL,                       -- ISO UTC
    actor TEXT NOT NULL,                    -- username hoặc 'system'
    actor_roles TEXT,                       -- vai trò lúc làm (mảng JSON)
    action TEXT NOT NULL,                   -- 'param.set', 'request.decide', 'slip.override', 'period.lock'...
    entity_kind TEXT NOT NULL, entity_id TEXT NOT NULL,
    subject TEXT,                           -- người bị tác động
    month TEXT,
    before_json TEXT, after_json TEXT,      -- chỉ qua danh sách trường cho phép của lib/audit.js, không bao giờ chứa bí mật
    reason TEXT,
    sensitivity TEXT NOT NULL DEFAULT 'normal' CHECK (sensitivity IN ('normal','pay','pii')),
    request_id TEXT,                        -- mã yêu cầu HTTP, để nối nhiều dòng của một thao tác
    prev_hash TEXT NOT NULL, hash TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS audit_at ON audit_log (at);
  CREATE INDEX IF NOT EXISTS audit_entity ON audit_log (entity_kind, entity_id, id);
  CREATE INDEX IF NOT EXISTS audit_subject_month ON audit_log (subject, month, id);
  CREATE INDEX IF NOT EXISTS audit_actor_at ON audit_log (actor, at);
  CREATE INDEX IF NOT EXISTS audit_action_at ON audit_log (action, at);
  CREATE TRIGGER IF NOT EXISTS audit_log_no_update BEFORE UPDATE ON audit_log
    BEGIN SELECT RAISE(ABORT, 'audit_log chỉ được thêm dòng'); END;
  CREATE TRIGGER IF NOT EXISTS audit_log_no_delete BEFORE DELETE ON audit_log
    BEGIN SELECT RAISE(ABORT, 'audit_log chỉ được thêm dòng'); END;

  CREATE TABLE IF NOT EXISTS param_versions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    key             TEXT NOT NULL,
    effective_month TEXT NOT NULL CHECK (effective_month GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]'),
    value_json      TEXT NOT NULL,          -- giá trị đã kiểm, JSON; Infinity lưu là null (TK 4.9)
    reason          TEXT NOT NULL CHECK (length(reason) BETWEEN 10 AND 300),
    basis           TEXT,                   -- căn cứ (số văn bản, điều khoản) Admin ghi
    ack_json        TEXT,                   -- các cảnh báo sàn luật đã xác nhận (mã + người xác nhận)
    created_by      TEXT NOT NULL,
    created_at      TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS param_versions_key_month ON param_versions (key, effective_month, id);
  CREATE TRIGGER IF NOT EXISTS param_versions_no_update BEFORE UPDATE ON param_versions
    BEGIN SELECT RAISE(ABORT, 'param_versions chỉ được thêm dòng'); END;
  CREATE TRIGGER IF NOT EXISTS param_versions_no_delete BEFORE DELETE ON param_versions
    BEGIN SELECT RAISE(ABORT, 'param_versions chỉ được thêm dòng'); END;

  -- Kỳ lương. Không có dòng = ước tính (open). Khác TK 6.4 một chỗ: status có thêm 'open' để mở lại kỳ về "đang mở"
  -- mà vẫn giữ rev và reopen_count (nếu xoá dòng thì mất lịch sử). Dòng 'open' và không có dòng là một.
  CREATE TABLE IF NOT EXISTS payroll_periods (
    month TEXT PRIMARY KEY,
    status TEXT NOT NULL CHECK (status IN ('open','attendance_locked','calculated','reviewed','approved','paid')),
    rev INTEGER NOT NULL DEFAULT 1,
    current_run_id INTEGER,
    attendance_locked_by TEXT, attendance_locked_at TEXT,
    calculated_by TEXT, calculated_at TEXT,
    reviewed_by TEXT, reviewed_at TEXT,
    approved_by TEXT, approved_at TEXT,
    paid_by TEXT, paid_at TEXT, paid_ref TEXT,
    reopen_count INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS payroll_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month TEXT NOT NULL,
    run_no INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('draft','final','superseded')),
    engine_version TEXT NOT NULL,
    params_hash TEXT NOT NULL, params_rev INTEGER NOT NULL, params_json TEXT NOT NULL,
    switches_json TEXT NOT NULL,            -- ngày lễ của tháng
    inputs_digest TEXT,                     -- băm chuẩn hoá đầu vào đã dùng
    slips_total INTEGER, slips_error INTEGER,
    created_by TEXT NOT NULL, created_at TEXT NOT NULL, finished_at TEXT,
    UNIQUE (month, run_no)
  );
  CREATE TABLE IF NOT EXISTS payslips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER NOT NULL REFERENCES payroll_runs(id),
    username TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('draft','pending','approved','error')),
    rev INTEGER NOT NULL DEFAULT 1,
    error_code TEXT, error_detail TEXT,
    gross INTEGER, insurance INTEGER, tax INTEGER, advance INTEGER, net INTEGER,   -- đồng nguyên, sau làm tròn của calcNet và số sửa
    staff_terms_json TEXT NOT NULL,         -- loại, level, base, hợp đồng, BH, người phụ thuộc, iDorm... đúng lúc tính
    snapshot_gz BLOB NOT NULL,              -- gzip(JSON(m)), gồm rows (zlib có sẵn của Node)
    override_json TEXT,                     -- số sửa đóng băng lúc duyệt kỳ (kèm lý do)
    flags_json TEXT,                        -- mã phát hiện AI còn mở hoặc đã bỏ qua khi tính (mảng); không rỗng thì không vào duyệt cả lô
    decided_by TEXT, decided_at TEXT, note TEXT,
    UNIQUE (run_id, username)
  );
  CREATE INDEX IF NOT EXISTS payslips_run_status ON payslips (run_id, status);
  CREATE INDEX IF NOT EXISTS payslips_user ON payslips (username, run_id);
  -- Bất biến ở tầng DB (lớp phòng thủ thứ hai sau assertPeriodOpen). Không bao giờ xoá lần chạy hay phiếu.
  CREATE TRIGGER IF NOT EXISTS payroll_runs_no_delete BEFORE DELETE ON payroll_runs
    BEGIN SELECT RAISE(ABORT, 'payroll_runs không được xoá'); END;
  CREATE TRIGGER IF NOT EXISTS payroll_runs_guard_update BEFORE UPDATE ON payroll_runs
    WHEN NEW.month IS NOT OLD.month OR NEW.run_no IS NOT OLD.run_no OR NEW.engine_version IS NOT OLD.engine_version
      OR NEW.params_hash IS NOT OLD.params_hash OR NEW.params_rev IS NOT OLD.params_rev
      OR NEW.params_json IS NOT OLD.params_json OR NEW.switches_json IS NOT OLD.switches_json
      OR NEW.inputs_digest IS NOT OLD.inputs_digest OR NEW.created_by IS NOT OLD.created_by
      OR NEW.created_at IS NOT OLD.created_at
      OR NOT (NEW.status = OLD.status OR (OLD.status = 'draft' AND NEW.status IN ('final','superseded'))
              OR (OLD.status = 'final' AND NEW.status = 'superseded'))
      OR (OLD.status IN ('final','superseded') AND (NEW.slips_total IS NOT OLD.slips_total
              OR NEW.slips_error IS NOT OLD.slips_error OR NEW.finished_at IS NOT OLD.finished_at))
    BEGIN SELECT RAISE(ABORT, 'lần chạy lương đã tính không được sửa tham số, đầu vào hay lùi trạng thái'); END;
  CREATE TRIGGER IF NOT EXISTS payslips_no_delete BEFORE DELETE ON payslips
    BEGIN SELECT RAISE(ABORT, 'payslips không được xoá'); END;
  CREATE TRIGGER IF NOT EXISTS payslips_guard_update BEFORE UPDATE ON payslips
    WHEN NEW.run_id IS NOT OLD.run_id OR NEW.username IS NOT OLD.username
      OR NEW.error_code IS NOT OLD.error_code OR NEW.error_detail IS NOT OLD.error_detail
      OR NEW.gross IS NOT OLD.gross OR NEW.insurance IS NOT OLD.insurance OR NEW.tax IS NOT OLD.tax
      OR NEW.advance IS NOT OLD.advance OR NEW.net IS NOT OLD.net
      OR NEW.staff_terms_json IS NOT OLD.staff_terms_json OR NEW.snapshot_gz IS NOT OLD.snapshot_gz
      OR (OLD.status = 'error' AND NEW.status IS NOT 'error')
    BEGIN SELECT RAISE(ABORT, 'bản chụp phiếu lương không được sửa'); END;
  CREATE TRIGGER IF NOT EXISTS payslips_frozen_update BEFORE UPDATE ON payslips
    WHEN (SELECT status FROM payroll_runs WHERE id = OLD.run_id) IN ('final','superseded')
    BEGIN SELECT RAISE(ABORT, 'phiếu của lần chạy đã chốt không được đổi'); END;

  CREATE TABLE IF NOT EXISTS ai_finding_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    finding_id TEXT NOT NULL, digest TEXT NOT NULL,      -- id ổn định và băm bằng chứng của phát hiện
    month TEXT NOT NULL, rule_id TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('dismiss','restore')),
    by TEXT NOT NULL, at TEXT NOT NULL, note TEXT NOT NULL CHECK (length(note) BETWEEN 10 AND 300)
  );
  CREATE INDEX IF NOT EXISTS ai_finding_actions_finding ON ai_finding_actions (finding_id, id);
  CREATE INDEX IF NOT EXISTS ai_finding_actions_month ON ai_finding_actions (month, finding_id, id);
  CREATE TRIGGER IF NOT EXISTS ai_finding_actions_no_update BEFORE UPDATE ON ai_finding_actions
    BEGIN SELECT RAISE(ABORT, 'ai_finding_actions chỉ được thêm dòng'); END;
  CREATE TRIGGER IF NOT EXISTS ai_finding_actions_no_delete BEFORE DELETE ON ai_finding_actions
    BEGIN SELECT RAISE(ABORT, 'ai_finding_actions chỉ được thêm dòng'); END;
  CREATE TABLE IF NOT EXISTS ai_review_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month TEXT NOT NULL, run_id INTEGER,                   -- payroll_runs.id nếu chạy sau 'calculate'
    rules_json TEXT NOT NULL, thresholds_hash TEXT NOT NULL, params_hash TEXT NOT NULL,
    findings_total INTEGER, summary_json TEXT,             -- chỉ số đếm theo mức và luật; KHÔNG tên, KHÔNG tiền
    by TEXT NOT NULL, at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS ai_review_runs_month ON ai_review_runs (month, id);
  CREATE TRIGGER IF NOT EXISTS ai_review_runs_no_update BEFORE UPDATE ON ai_review_runs
    BEGIN SELECT RAISE(ABORT, 'ai_review_runs chỉ được thêm dòng'); END;
  CREATE TRIGGER IF NOT EXISTS ai_review_runs_no_delete BEFORE DELETE ON ai_review_runs
    BEGIN SELECT RAISE(ABORT, 'ai_review_runs chỉ được thêm dòng'); END;

  -- Gán vai trò (TK 10.1): chỉ thêm, thu hồi bằng revoked_at. Cột id là khoá phụ để đánh dấu thu hồi.
  CREATE TABLE IF NOT EXISTS staff_roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL, role TEXT NOT NULL,
    granted_by TEXT NOT NULL, granted_at TEXT NOT NULL, revoked_at TEXT
  );
  CREATE UNIQUE INDEX IF NOT EXISTS staff_roles_active ON staff_roles (username, role) WHERE revoked_at IS NULL;
  CREATE INDEX IF NOT EXISTS staff_roles_role ON staff_roles (role) WHERE revoked_at IS NULL;
  CREATE TRIGGER IF NOT EXISTS staff_roles_no_delete BEFORE DELETE ON staff_roles
    BEGIN SELECT RAISE(ABORT, 'staff_roles chỉ được thu hồi (revoked_at), không xoá'); END;
  CREATE TRIGGER IF NOT EXISTS staff_roles_guard_update BEFORE UPDATE ON staff_roles
    WHEN NEW.username IS NOT OLD.username OR NEW.role IS NOT OLD.role OR NEW.granted_by IS NOT OLD.granted_by
      OR NEW.granted_at IS NOT OLD.granted_at OR OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL
    BEGIN SELECT RAISE(ABORT, 'staff_roles chỉ được đặt revoked_at một lần'); END;

  -- Khoản điền thêm theo người, theo tháng (docs/architecture/2026-10-16-CONG-THUC-TU-DO.md mục 5.11; chủ dự án duyệt bảng 16/10/2026, Q18).
  -- Chỉ thêm dòng, không xoá. Các giới hạn 80 (nhãn), 10 đến 300 (lý do) là giới hạn kỹ thuật của lược đồ lấy từ thiết kế 5.11
  -- (cùng kiểu CHECK của ai_finding_actions.note); không phải tham số nghiệp vụ nên không nằm ở registry.
  CREATE TABLE IF NOT EXISTS pay_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL CHECK (length(username) > 0),
    month TEXT NOT NULL CHECK (month GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]'),
    direction TEXT NOT NULL CHECK (direction IN ('add','deduct')),
    amount INTEGER NOT NULL CHECK (typeof(amount) = 'integer' AND amount > 0),   -- VND đồng nguyên
    label TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 80),
    slip_line TEXT,                         -- dòng trên phiếu lương; null = dùng nhãn
    reason TEXT NOT NULL CHECK (length(reason) BETWEEN 10 AND 300),
    tax_mode TEXT CHECK (tax_mode IS NULL OR tax_mode IN ('none','full','cap')),
    tax_cap INTEGER CHECK (tax_cap IS NULL OR (typeof(tax_cap) = 'integer' AND tax_cap >= 0)),
    insurance_base INTEGER CHECK (insurance_base IS NULL OR (typeof(insurance_base) = 'integer' AND insurance_base >= 0)),
    flags_confirmed_by TEXT, flags_confirmed_at TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','void')),
    rev INTEGER NOT NULL DEFAULT 1,
    created_by TEXT NOT NULL, created_at TEXT NOT NULL,
    decided_by TEXT, decided_at TEXT, decision_note TEXT
  );
  CREATE INDEX IF NOT EXISTS pay_entries_month_status ON pay_entries (month, status);
  CREATE INDEX IF NOT EXISTS pay_entries_user_month ON pay_entries (username, month);
  CREATE TRIGGER IF NOT EXISTS pay_entries_no_delete BEFORE DELETE ON pay_entries
    BEGIN SELECT RAISE(ABORT, 'pay_entries không được xoá (huỷ bằng trạng thái void)'); END;
  -- Người lập và thời điểm lập không bao giờ đổi; 'void' là trạng thái cuối; 'approved' chỉ đi tiếp sang 'void'
  CREATE TRIGGER IF NOT EXISTS pay_entries_guard_update BEFORE UPDATE ON pay_entries
    WHEN NEW.created_by IS NOT OLD.created_by OR NEW.created_at IS NOT OLD.created_at
      OR (OLD.status = 'void' AND NEW.status IS NOT 'void')
      OR (OLD.status = 'approved' AND NEW.status NOT IN ('approved','void'))
    BEGIN SELECT RAISE(ABORT, 'pay_entries: không đổi người lập, không mở lại khoản đã huỷ, không lùi khoản đã duyệt'); END;
  -- Sau khi duyệt, các trường tiền và đối tượng của khoản không đổi được (cho phép approved -> void)
  CREATE TRIGGER IF NOT EXISTS pay_entries_frozen_update BEFORE UPDATE ON pay_entries
    WHEN OLD.status = 'approved' AND (NEW.amount IS NOT OLD.amount OR NEW.direction IS NOT OLD.direction
      OR NEW.tax_mode IS NOT OLD.tax_mode OR NEW.tax_cap IS NOT OLD.tax_cap
      OR NEW.insurance_base IS NOT OLD.insurance_base OR NEW.username IS NOT OLD.username OR NEW.month IS NOT OLD.month)
    BEGIN SELECT RAISE(ABORT, 'khoản điền thêm đã duyệt không được sửa số tiền, hướng, thuế, bảo hiểm, người hay tháng'); END;

  -- Yêu cầu ứng lương (chủ dự án 23/10/2026, Đ36): nhân sự gửi, người có quyền duyệt quyết định; tạm ứng ⑥ của tháng = tổng "granted" của các yêu cầu đã duyệt.
  -- API không xoá dòng (huỷ bằng trạng thái cancelled). 'pending' đi tiếp sang 'approved' | 'rejected' | 'cancelled'; 'approved' chỉ đi tiếp sang 'cancelled'.
  CREATE TABLE IF NOT EXISTS advance_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL CHECK (length(username) > 0),
    month TEXT NOT NULL CHECK (month GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]'),
    amount INTEGER NOT NULL CHECK (typeof(amount) = 'integer' AND amount > 0),     -- số xin, VND đồng nguyên
    cap INTEGER NOT NULL CHECK (typeof(cap) = 'integer' AND cap >= 0),             -- mức tối đa của tháng lúc gửi
    note TEXT,                                                                      -- lời nhắn của nhân sự (không bắt buộc)
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
    granted INTEGER CHECK (granted IS NULL OR (typeof(granted) = 'integer' AND granted > 0)),  -- số được duyệt (có thể thấp hơn số xin)
    rev INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    decided_by TEXT, decided_at TEXT, decision_note TEXT,
    cancelled_by TEXT, cancelled_at TEXT
  );
  CREATE INDEX IF NOT EXISTS advance_requests_month_status ON advance_requests (month, status);
  CREATE INDEX IF NOT EXISTS advance_requests_user_month ON advance_requests (username, month);
  CREATE UNIQUE INDEX IF NOT EXISTS advance_requests_one_pending ON advance_requests (username, month) WHERE status = 'pending';
  CREATE TRIGGER IF NOT EXISTS advance_requests_guard_update BEFORE UPDATE ON advance_requests
    WHEN NEW.username IS NOT OLD.username OR NEW.month IS NOT OLD.month OR NEW.amount IS NOT OLD.amount
      OR NEW.created_at IS NOT OLD.created_at
      OR OLD.status IN ('rejected','cancelled') OR (OLD.status = 'approved' AND NEW.status NOT IN ('approved','cancelled'))
    BEGIN SELECT RAISE(ABORT, 'advance_requests: không đổi người, tháng, số xin; yêu cầu đã từ chối hoặc huỷ là trạng thái cuối'); END;
`);
// Cột mới trên bảng có sẵn (dòng cũ nhận giá trị mặc định, không dòng nào bị viết lại)
addColumn('slip_overrides', 'reason', 'TEXT'); // lý do sửa số (dòng có trước khi thêm cột: rỗng)
addColumn('slip_overrides', 'rev', 'INTEGER NOT NULL DEFAULT 1'); // khoá lạc quan cho PUT /api/slip-override
addColumn('staff', 'payroll_subject', 'INTEGER'); // 1 = nhân sự được trả lương; null = suy từ role (admin cũ = 0)
// Mã lô lưu: các khoá lưu trong CÙNG một lần bấm "Lưu" chung một mã, để hoàn tác cả lô.
// Dòng cũ (trước khi có cột) để null: không hoàn tác theo lô được, chỉ hoàn tác được từng khoá. Thêm cột không chạy trigger và không viết lại dòng nào.
addColumn('param_versions', 'batch_id', 'TEXT');

// Chỉ mục cho các đường đọc của kỳ lương. Đo bằng scripts/db/perf-check.js (1.000 nhân sự, 200.000 dòng nhật ký, 20.000 dòng tham số):
// lọc nhật ký theo actor, action, loại thực thể hoặc tháng không có id cuối chỉ mục thì phải xếp lại cả tập khớp vì thứ tự (..., at) hay (entity_id, id) khác thứ tự
// id của câu hỏi (ORDER BY id DESC LIMIT 50); thêm id vào cuối cho phép đọc 50 dòng đầu rồi dừng. Danh sách này phải khớp CANDIDATES ở perf-check.js.
db.exec(`
  CREATE INDEX IF NOT EXISTS audit_actor_id ON audit_log (actor, id);
  CREATE INDEX IF NOT EXISTS audit_action_id ON audit_log (action, id);
  CREATE INDEX IF NOT EXISTS audit_month_id ON audit_log (month, id);
  CREATE INDEX IF NOT EXISTS audit_kind_id ON audit_log (entity_kind, id);
  CREATE INDEX IF NOT EXISTS param_versions_batch ON param_versions (batch_id) WHERE batch_id IS NOT NULL;
`);

// Mốc một lần. Chạy lại không đổi gì. Cả gói nằm trong một giao dịch.
function once(marker, run) {
  if (db.prepare('SELECT 1 FROM settings WHERE key = ?').get(marker)) return false;
  transaction(() => {
    run();
    db.prepare('INSERT INTO settings (key, value_json) VALUES (?, ?)').run(marker, JSON.stringify({ at: now() }));
  });
  return true;
}
once('backend_v4_v1a_v1', () => {
  // params_mode: 'defaults-only' = bỏ qua mọi dòng param_versions (công tắc lùi nhanh). Chỉ đặt khi chưa có.
  const seed = db.prepare('INSERT OR IGNORE INTO settings (key, value_json) VALUES (?, ?)');
  seed.run('params_mode', JSON.stringify('defaults-only'));
});
// Cờ "nhân sự được trả lương": tài khoản admin cũ = 0, còn lại = 1, cho cùng kết quả với các chỗ lọc role !== 'admin'.
once('staff_payroll_subject_v1', () => {
  db.exec(
    "UPDATE staff SET payroll_subject = CASE WHEN role = 'admin' THEN 0 ELSE 1 END WHERE payroll_subject IS NULL"
  );
});
// Bảng của các mô-đun lib/domain: danh tính trên bảng staff (uuid, họ/tên, thử việc/chính thức, ngày nghỉ việc,
// số phép lưu sẵn), danh mục chức vụ/bậc/ca có phiên bản theo tháng, sổ phép, giải trình. Mỗi mô-đun tự giữ DDL của mình.
require('./domain/employee/schema').ensureEmployeeSchema(db, { addColumn, once });
require('./domain/position/schema').ensureCatalog(db, { once, now });
require('./domain/leave/schema').ensureLeaveSchema(db);
require('./domain/explanation/schema').ensureExplanationSchema(db, { transaction, addColumn });
// Hồ sơ đang lưu mã ca cũ (n1 … g2) chuyển sang mã mới của danh mục ca (Normal1 … Night2); mọi đầu vào vẫn nhận mã cũ
once('staff_shift_codes_v1', () => {
  db.exec(
    'UPDATE staff SET shift_code = (SELECT code FROM work_shifts WHERE preset = staff.shift_code) WHERE shift_code IN (SELECT preset FROM work_shifts WHERE preset <> code)'
  );
});

/* ---------- Nhật ký kiểm toán ---------- */
const AUDIT_SENSITIVITY = ['normal', 'pay', 'pii'];
const AUDIT_JSON_MAX = 65536; // chặn một dòng nhật ký phình vô hạn (ví dụ ném cả lịch vào before/after)
const auditKey = () => {
  const key = process.env.AUDIT_KEY;
  return typeof key === 'string' && key.length ? key : null;
};
// Chuỗi chuẩn hoá của một dòng (không gồm hash). Có id để lộ ra chỗ bị xoá, có prev_hash để nối chuỗi.
const auditCanonical = r =>
  JSON.stringify([
    r.id,
    r.prev_hash,
    r.at,
    r.actor,
    r.actor_roles ?? null,
    r.action,
    r.entity_kind,
    r.entity_id,
    r.subject ?? null,
    r.month ?? null,
    r.before_json ?? null,
    r.after_json ?? null,
    r.reason ?? null,
    r.sensitivity,
    r.request_id ?? null
  ]);
// Hai kiểu băm, ghi ngay trong tiền tố của giá trị để chuỗi đổi khoá hay bật AUDIT_KEY về sau vẫn kiểm được:
// 'sha256:<hex>' khi không có AUDIT_KEY; 'hmac-sha256:<hex>' khi có (chống người sửa DB rồi viết lại cả chuỗi).
// Khoá chỉ đọc từ môi trường, không bao giờ ghi vào DB hay nhật ký.
function auditHash(row, kind, key) {
  const text = auditCanonical(row);
  return kind === 'hmac-sha256'
    ? 'hmac-sha256:' + crypto.createHmac('sha256', key).update(text).digest('hex')
    : 'sha256:' + crypto.createHash('sha256').update(text).digest('hex');
}
const rowToAudit = r => ({
  id: r.id,
  at: r.at,
  actor: r.actor,
  actorRoles: safeParse(r.actor_roles),
  action: r.action,
  entityKind: r.entity_kind,
  entityId: r.entity_id,
  subject: r.subject ?? null,
  month: r.month ?? null,
  before: safeParse(r.before_json),
  after: safeParse(r.after_json),
  reason: r.reason ?? null,
  sensitivity: r.sensitivity,
  requestId: r.request_id ?? null,
  prevHash: r.prev_hash,
  hash: r.hash,
  subjectUuid: r.subject_uuid ?? null, // uuid của người được ghi (dòng ghi trước khi có cột thì không có)
  actorUuid: r.actor_uuid ?? null
});
function auditFilter(f = {}) {
  const where = [],
    args = [];
  const eq = (column, value) => {
    if (value !== undefined && value !== null && value !== '') {
      where.push(`${column} = ?`);
      args.push(String(value));
    }
  };
  eq('actor', f.actor);
  eq('action', f.action);
  eq('subject', f.subject);
  eq('subject_uuid', f.subjectUuid);
  // person: { uuid, username } — mọi dòng về một người: dòng có uuid, cộng dòng cũ chưa có uuid ghi theo tài khoản (tài khoản không đổi được)
  if (f.person && typeof f.person === 'object' && f.person.uuid) {
    where.push('(subject_uuid = ? OR (subject_uuid IS NULL AND subject = ?))');
    args.push(String(f.person.uuid), String(f.person.username || ''));
  }
  if (f.month) {
    where.push('month = ?');
    args.push(monthOf(f.month));
  }
  // entity: 'loại' hoặc 'loại:id'; hoặc entityKind và entityId riêng
  if (typeof f.entity === 'string' && f.entity) {
    const [kind, ...rest] = f.entity.split(':');
    eq('entity_kind', kind);
    if (rest.length) eq('entity_id', rest.join(':'));
  }
  eq('entity_kind', f.entityKind);
  eq('entity_id', f.entityId);
  // from, to: chuỗi ISO UTC; chỉ có ngày thì from = đầu ngày UTC, to = cuối ngày UTC (muốn biên giờ Việt Nam thì truyền ISO đủ)
  if (f.from) {
    where.push('at >= ?');
    args.push(DATE_RE.test(f.from) ? f.from + 'T00:00:00.000Z' : String(f.from));
  }
  if (f.to) {
    where.push('at <= ?');
    args.push(DATE_RE.test(f.to) ? f.to + 'T23:59:59.999Z' : String(f.to));
  }
  // sensitivities: chỉ trả các mức này (lọc theo năng lực người xem); bỏ trống = mọi mức
  if (Array.isArray(f.sensitivities)) {
    const allowed = f.sensitivities.filter(s => AUDIT_SENSITIVITY.includes(s));
    where.push(`sensitivity IN (${allowed.length ? allowed.map(() => '?').join(',') : "''"})`);
    args.push(...allowed);
  }
  if (f.afterId !== undefined && f.afterId !== null) {
    where.push('id > ?');
    args.push(Math.max(0, Math.trunc(Number(f.afterId)) || 0));
  }
  if (f.beforeId !== undefined && f.beforeId !== null) {
    where.push('id < ?');
    args.push(Math.max(0, Math.trunc(Number(f.beforeId)) || 0));
  }
  return { sql: where.length ? 'WHERE ' + where.join(' AND ') : '', args };
}
const auditStore = {
  // Ghi một dòng, nối vào chuỗi băm. Gọi BÊN TRONG giao dịch của thao tác (store.transaction): lỗi ở đâu thì cả hai cùng hoàn tác.
  // Tham số: { actor, actorRoles?, action, entityKind, entityId, subject?, month?, before?, after?, reason?, sensitivity?, requestId? }.
  // before và after là giá trị JSON bất kỳ (đã lọc qua danh sách trường cho phép ở lib/audit.js), lưu bằng JSON.stringify.
  // Trả về { id, hash }.
  write(entry) {
    const e = entry && typeof entry === 'object' ? entry : {};
    const text = (value, field, { required = false, max = 200 } = {}) => {
      if (value === undefined || value === null || value === '') {
        if (required) throw storeError('AUDIT_ARGS', `Nhật ký thiếu ${field}`, 500);
        return null;
      }
      const s = String(value);
      if (s.length > max) throw storeError('AUDIT_ARGS', `Nhật ký: ${field} quá dài`, 500);
      return s;
    };
    const sensitivity = e.sensitivity ?? 'normal';
    if (!AUDIT_SENSITIVITY.includes(sensitivity)) throw storeError('AUDIT_ARGS', 'Nhật ký: mức nhạy cảm lạ', 500);
    const json = (value, field) => {
      if (value === undefined || value === null) return null;
      const s = JSON.stringify(value);
      if (s === undefined || s.length > AUDIT_JSON_MAX)
        throw storeError('AUDIT_ARGS', `Nhật ký: ${field} quá lớn`, 500);
      return s;
    };
    const roles = Array.isArray(e.actorRoles) ? e.actorRoles.map(String).sort() : e.actorRoles;
    const fields = {
      at: now(),
      actor: text(e.actor, 'actor', { required: true }),
      actor_roles: roles === undefined || roles === null ? null : json(roles, 'actorRoles'),
      action: text(e.action, 'action', { required: true }),
      entity_kind: text(e.entityKind, 'entityKind', { required: true }),
      entity_id: text(e.entityId, 'entityId', { required: true }),
      subject: text(e.subject, 'subject'),
      month: e.month ? monthOf(e.month) : null,
      before_json: json(e.before, 'before'),
      after_json: json(e.after, 'after'),
      reason: text(e.reason, 'reason', { max: REASON_MAX }),
      sensitivity,
      request_id: text(e.requestId, 'requestId', { max: 100 })
    };
    // uuid của người được ghi và người làm, tra theo tài khoản lúc ghi (không nằm trong chuỗi băm: chỉ để truy vết nhanh theo uuid)
    const uuidOf = username => {
      if (!username) return null;
      const hit = db.prepare('SELECT uuid FROM staff WHERE username = ?').get(username);
      return hit ? hit.uuid || null : null;
    };
    const subjectUuid = uuidOf(fields.subject),
      actorUuid = uuidOf(fields.actor);
    return transaction(() => {
      const last = db.prepare('SELECT id, hash FROM audit_log ORDER BY id DESC LIMIT 1').get();
      const row = { id: last ? last.id + 1 : 1, prev_hash: last ? last.hash : '', ...fields };
      const key = auditKey();
      row.hash = auditHash(row, key ? 'hmac-sha256' : 'sha256', key);
      db.prepare(
        `INSERT INTO audit_log (id, at, actor, actor_roles, action, entity_kind, entity_id, subject, month, before_json, after_json, reason, sensitivity, request_id, prev_hash, hash, subject_uuid, actor_uuid)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        row.id,
        row.at,
        row.actor,
        row.actor_roles,
        row.action,
        row.entity_kind,
        row.entity_id,
        row.subject,
        row.month,
        row.before_json,
        row.after_json,
        row.reason,
        row.sensitivity,
        row.request_id,
        row.prev_hash,
        row.hash,
        subjectUuid,
        actorUuid
      );
      return { id: row.id, hash: row.hash };
    });
  },
  // Danh sách có lọc, con trỏ theo id (tối đa 200 dòng). Mặc định mới nhất trước; afterId (id > N) cho thứ tự cũ → mới (con trỏ sự kiện).
  // Bộ lọc: actor, action, entity ('loại' | 'loại:id'), entityKind, entityId, subject, month, from, to, sensitivities, afterId, beforeId, limit, order ('asc'|'desc').
  list(filter = {}) {
    const { sql, args } = auditFilter(filter);
    const limit = Math.min(200, Math.max(1, Math.trunc(Number(filter.limit)) || 50));
    const order = filter.order === 'asc' || (filter.order === undefined && filter.afterId != null) ? 'ASC' : 'DESC';
    return db
      .prepare(`SELECT * FROM audit_log ${sql} ORDER BY id ${order} LIMIT ?`)
      .all(...args, limit)
      .map(rowToAudit);
  },
  // Đếm số dòng khớp bộ lọc. options.cap (số nguyên dương): dừng đếm ở cap, nên trả về tối đa cap (bảng nhiều trăm nghìn dòng đếm hết mất hàng chục
  // mili giây; màn hình chỉ cần "từ 10.000 dòng trở lên"). Không có cap thì đếm đủ.
  count(filter = {}, options = {}) {
    const { sql, args } = auditFilter({ ...filter, afterId: undefined, beforeId: undefined });
    const cap = Number.isSafeInteger(options.cap) && options.cap > 0 ? options.cap : null;
    if (cap)
      return db.prepare(`SELECT COUNT(*) AS total FROM (SELECT 1 FROM audit_log ${sql} LIMIT ?)`).get(...args, cap)
        .total;
    return db.prepare(`SELECT COUNT(*) AS total FROM audit_log ${sql}`).get(...args).total;
  },
  // Kiểu băm sẽ dùng cho dòng kế tiếp: 'hmac-sha256' khi có AUDIT_KEY, ngược lại 'sha256'.
  mode() {
    return auditKey() ? 'hmac-sha256' : 'sha256';
  },
  // Đi lại cả chuỗi. Trả về { ok, checked, firstBadId, reason, unverifiable }.
  // reason: PREV_HASH (đứt nối hoặc thiếu dòng), ID_GAP, HASH (nội dung bị sửa), AUDIT_KEY_MISSING (dòng HMAC mà thiếu khoá: kiểm được nối chuỗi, chưa kiểm được nội dung).
  verify() {
    let prev = '',
      lastId = null,
      checked = 0,
      unverifiable = 0,
      cursor = 0;
    const key = auditKey();
    const page = db.prepare('SELECT * FROM audit_log WHERE id > ? ORDER BY id LIMIT 1000');
    for (;;) {
      const rows = page.all(cursor);
      if (!rows.length) break;
      for (const r of rows) {
        const bad = reason => ({ ok: false, checked, firstBadId: r.id, reason, unverifiable });
        if (r.prev_hash !== prev) return bad('PREV_HASH');
        if (lastId !== null && r.id !== lastId + 1) return bad('ID_GAP');
        const kind = r.hash.startsWith('hmac-sha256:') ? 'hmac-sha256' : 'sha256';
        if (kind === 'hmac-sha256' && !key) unverifiable++;
        else if (auditHash(r, kind, key) !== r.hash) return bad('HASH');
        prev = r.hash;
        lastId = r.id;
        cursor = r.id;
        checked++;
      }
    }
    if (unverifiable) return { ok: false, checked, firstBadId: null, reason: 'AUDIT_KEY_MISSING', unverifiable };
    return { ok: true, checked, firstBadId: null, reason: null, unverifiable: 0 };
  }
};

/* ---------- Phiên bản tham số: chỉ ĐỌC ---------- */
const rowToParam = r => ({
  id: r.id,
  key: r.key,
  effectiveMonth: r.effective_month,
  value: safeParse(r.value_json),
  reason: r.reason,
  basis: r.basis ?? null,
  ack: safeParse(r.ack_json),
  createdBy: r.created_by,
  createdAt: r.created_at,
  batchId: r.batch_id ?? null // dòng cũ trước khi có cột: null
});
const paramsStore = {
  // 'defaults-only' (mặc định, kể cả khi chưa có dòng settings) hoặc 'active'. Đổi bằng setSetting('params_mode', ...).
  getMode() {
    const value = module.exports.getSetting('params_mode', 'defaults-only');
    return value === 'active' ? 'active' : 'defaults-only';
  },
  // Dòng đang hiệu lực của MỖI khoá cho tháng M: effective_month lớn nhất ≤ M, hoà thì id lớn nhất.
  // Không xét params_mode: bộ máy tham số bỏ qua kết quả này khi 'defaults-only'.
  resolvedRows(month) {
    const m = monthOf(month);
    return db
      .prepare(
        `SELECT p.* FROM param_versions p
         WHERE p.effective_month <= ?
           AND p.id = (SELECT q.id FROM param_versions q WHERE q.key = p.key AND q.effective_month <= ?
                       ORDER BY q.effective_month DESC, q.id DESC LIMIT 1)
         ORDER BY p.key`
      )
      .all(m, m)
      .map(rowToParam);
  },
  // Lịch sử một khoá (mới nhất trước) hoặc toàn bộ nếu bỏ key; afterId, limit tối đa 200.
  history({ key, afterId, limit } = {}) {
    const where = [],
      args = [];
    if (key) {
      where.push('key = ?');
      args.push(String(key));
    }
    if (afterId != null) {
      where.push('id < ?');
      args.push(Math.trunc(Number(afterId)) || 0);
    }
    return db
      .prepare(
        `SELECT * FROM param_versions ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT ?`
      )
      .all(...args, Math.min(200, Math.max(1, Math.trunc(Number(limit)) || 50)))
      .map(rowToParam);
  },
  count() {
    return db.prepare('SELECT COUNT(*) AS total FROM param_versions').get().total;
  },
  // Id dòng mới nhất: bảng chỉ được thêm dòng (trigger chặn sửa/xoá) nên id tăng ⇔ có thay đổi; dùng làm khoá bộ nhớ đệm tham số
  lastId() {
    return db.prepare('SELECT COALESCE(MAX(id), 0) AS id FROM param_versions').get().id;
  },
  // Các dòng của một lô lưu (cùng batch_id), cũ → mới. Mã rỗng, không phải chuỗi hoặc không có lô thì trả mảng rỗng (dòng cũ có batch_id null không thuộc lô nào).
  byBatch(batchId) {
    if (typeof batchId !== 'string' || !batchId) return [];
    return db.prepare('SELECT * FROM param_versions WHERE batch_id = ? ORDER BY id').all(batchId).map(rowToParam);
  }
};

/* ---------- Kỳ lương ---------- */
const PERIOD_STATES = ['open', 'attendance_locked', 'calculated', 'reviewed', 'approved', 'paid'];
const periodRank = status => PERIOD_STATES.indexOf(status);
// Phạm vi ghi → trạng thái đầu tiên bị khoá. Chốt công khoá lịch, duyệt, chấm công, tham số, ngày lễ (attendance, params);
// KPI, số sửa phiếu (kpi, slip) còn mở tới khi duyệt kỳ.
const SCOPE_LOCKED_FROM = {
  attendance: 'attendance_locked',
  params: 'attendance_locked',
  kpi: 'approved',
  slip: 'approved'
};
// Cột "ai, lúc nào" của từng bước; mở lại về bước nào thì xoá các bước sau nó (lịch sử còn ở audit_log).
const STAGE_COLUMNS = {
  attendance_locked: ['attendance_locked_by', 'attendance_locked_at'],
  calculated: ['calculated_by', 'calculated_at'],
  reviewed: ['reviewed_by', 'reviewed_at'],
  approved: ['approved_by', 'approved_at'],
  paid: ['paid_by', 'paid_at', 'paid_ref']
};
const rowToPeriod = (r, month) =>
  r
    ? {
        month: r.month,
        status: r.status,
        rev: r.rev,
        exists: true,
        currentRunId: r.current_run_id ?? null,
        attendanceLockedBy: r.attendance_locked_by ?? null,
        attendanceLockedAt: r.attendance_locked_at ?? null,
        calculatedBy: r.calculated_by ?? null,
        calculatedAt: r.calculated_at ?? null,
        reviewedBy: r.reviewed_by ?? null,
        reviewedAt: r.reviewed_at ?? null,
        approvedBy: r.approved_by ?? null,
        approvedAt: r.approved_at ?? null,
        paidBy: r.paid_by ?? null,
        paidAt: r.paid_at ?? null,
        paidRef: r.paid_ref ?? null,
        reopenCount: r.reopen_count
      }
    : {
        month,
        status: 'open',
        rev: 0,
        exists: false,
        currentRunId: null,
        attendanceLockedBy: null,
        attendanceLockedAt: null,
        calculatedBy: null,
        calculatedAt: null,
        reviewedBy: null,
        reviewedAt: null,
        approvedBy: null,
        approvedAt: null,
        paidBy: null,
        paidAt: null,
        paidRef: null,
        reopenCount: 0
      };
const readPeriod = month => rowToPeriod(db.prepare('SELECT * FROM payroll_periods WHERE month = ?').get(month), month);
// Cổng ghi tập trung: gọi ở MỖI route ghi. Tháng chưa có dòng luôn mở.
// Phạm vi lạ là lỗi lập trình (Error thường). Khoá thì ở MỌI trạng thái (cả đã duyệt, đã chi trả) vẫn ghi và chỉ cảnh báo PERIOD_LOCKED { month, status, scope }.
const PERIOD_STATUS_TEXT = {
  attendance_locked: 'đã chốt công',
  calculated: 'đã tính lương',
  reviewed: 'đã qua bước AI kiểm tra',
  approved: 'đã duyệt',
  paid: 'đã chi trả'
};
function assertPeriodOpen(month, scope) {
  if (!Object.hasOwn(SCOPE_LOCKED_FROM, scope)) throw new Error(`Phạm vi khoá kỳ không hợp lệ: ${scope}`);
  const m = monthOf(month);
  const row = db.prepare('SELECT status FROM payroll_periods WHERE month = ?').get(m);
  const locked = !!row && periodRank(row.status) >= periodRank(SCOPE_LOCKED_FROM[scope]);
  const details = locked ? { month: m, status: row.status, scope } : undefined;
  warnIf('PERIOD_LOCKED', locked, {
    details,
    message: () =>
      `Kỳ lương ${m} ${PERIOD_STATUS_TEXT[row.status] || 'đã khoá'}: dữ liệu vừa lưu có thể không còn khớp số đã tính hay phiếu đã duyệt, cần tính lại kỳ`
  });
}
function checkRev(rev) {
  if (!Number.isSafeInteger(rev) || rev < 0) throw storeError('BAD_REV', 'Thiếu số phiên bản (rev) của kỳ');
}
// Kiểm tháng, tháng có được quản lý, rev khớp; trả về dòng hiện có (hoặc undefined nếu kỳ chưa có dòng).
function loadPeriodForChange(monthArg, rev) {
  const month = monthOf(monthArg);
  checkRev(rev);
  const row = db.prepare('SELECT * FROM payroll_periods WHERE month = ?').get(month);
  const current = row ? row.rev : 0;
  if (rev !== current)
    throw storeError('PERIOD_STALE', 'Kỳ đã được người khác đổi, tải lại rồi làm lại', 409, { month, rev: current });
  return { month, row };
}
function stateError(month, status, expected, to) {
  return storeError('PERIOD_STATE', 'Kỳ không ở trạng thái cho phép làm bước này', 409, {
    month,
    status,
    expected,
    to
  });
}
// Đổi trạng thái một bước: kiểm rev rồi trạng thái hiện tại thuộc `from`; ghi bước mới; rev + 1.
// `extra` là các cột bổ sung (đã nằm trong STAGE_COLUMNS hoặc current_run_id). Gọi trong giao dịch của người gọi.
function advancePeriod(monthArg, rev, { from, to, by, extra = {}, clearAfter = false }) {
  return transaction(() => {
    const { month, row } = loadPeriodForChange(monthArg, rev);
    const status = row ? row.status : 'open';
    if (!from.includes(status)) throw stateError(month, status, from, to);
    const t = now();
    const set = { status: to, ...extra };
    const [byColumn, atColumn] = STAGE_COLUMNS[to] || [];
    if (byColumn) {
      set[byColumn] = by;
      if (!(atColumn in set)) set[atColumn] = t; // chi trả: paid_at là ngày chi trả người dùng nhập, không phải lúc bấm
    }
    if (clearAfter)
      for (const [stage, columns] of Object.entries(STAGE_COLUMNS))
        if (periodRank(stage) > periodRank(to)) for (const c of columns) set[c] = null;
    if (!row) {
      db.prepare('INSERT INTO payroll_periods (month, status, rev) VALUES (?, ?, 0)').run(month, 'open');
    }
    const columns = Object.keys(set);
    db.prepare(
      `UPDATE payroll_periods SET ${columns.map(c => `${c} = ?`).join(', ')}, rev = rev + 1 WHERE month = ?`
    ).run(...columns.map(c => set[c]), month);
    return readPeriod(month);
  });
}
const requireBy = by => {
  if (typeof by !== 'string' || !by) throw storeError('BAD_ARGS', 'Thiếu người thực hiện', 500);
  return by;
};
const periodsStore = {
  // Trạng thái hiệu lực của một tháng; tháng chưa có dòng là 'open'.
  get: month => readPeriod(monthOf(month)),
  status: month => readPeriod(monthOf(month)).status,
  // Chỉ các tháng ĐÃ có dòng trong năm đó (service điền nốt đủ 12 tháng).
  list({ year } = {}) {
    const rows = year
      ? db.prepare('SELECT * FROM payroll_periods WHERE month LIKE ? ORDER BY month').all(`${Number(year)}-%`)
      : db.prepare('SELECT * FROM payroll_periods ORDER BY month').all();
    return rows.map(r => rowToPeriod(r, r.month));
  },
  // Chốt công: open → attendance_locked. rev là rev đang thấy (0 nếu kỳ chưa có dòng). Danh sách kiểm do lib/periods.js làm.
  lockAttendance: (month, { rev, by }) =>
    advancePeriod(month, rev, { from: ['open'], to: 'attendance_locked', by: requireBy(by) }),
  // Tính lương: attendance_locked | calculated | reviewed → calculated, gắn lần chạy hiện hành (runId phải là lần chạy nháp của đúng tháng).
  // Gọi cùng giao dịch với payroll.createRun, addPayslip, finishRun. Bước reviewed bị xoá (phải duyệt AI lại).
  markCalculated(month, { rev, by, runId }) {
    return transaction(() => {
      const run = payrollStore.getRun(runId);
      if (!run || run.month !== monthOf(month) || run.status !== 'draft')
        throw storeError('RUN_INVALID', 'Lần chạy lương không thuộc tháng này hoặc không còn là bản nháp', 409);
      return advancePeriod(month, rev, {
        from: ['attendance_locked', 'calculated', 'reviewed'],
        to: 'calculated',
        by: requireBy(by),
        extra: { current_run_id: runId },
        clearAfter: true
      });
    });
  },
  // Xong bước "AI kiểm tra": calculated | reviewed → reviewed. Cần đã có lần chạy hiện hành.
  markReviewed(month, { rev, by }) {
    return transaction(() => {
      const current = readPeriod(monthOf(month));
      if (current.status !== 'open' && current.currentRunId == null)
        throw storeError('PERIOD_NOT_READY', 'Chưa có lần tính lương để duyệt', 409, { month: current.month });
      return advancePeriod(month, rev, { from: ['calculated', 'reviewed'], to: 'reviewed', by: requireBy(by) });
    });
  },
  // Duyệt kỳ: reviewed hoặc calculated (chưa qua AI kiểm tra, cảnh báo PERIOD_STATE) → approved. Phiếu lỗi được loại ra qua
  // excludeErrors: [{ username, reason }]. Phiếu draft và pending còn lại được duyệt luôn trong cùng giao dịch
  // (người duyệt là người bấm, ghi chú rỗng), phiếu lỗi chưa loại tự loại với lý do ''; cả hai vào cảnh báo PERIOD_NOT_READY.
  // Trong cùng giao dịch: đóng băng số sửa phiếu vào payslips.override_json rồi đặt lần chạy thành 'final'.
  approve(month, { rev, by, excludeErrors = [] }) {
    requireBy(by);
    return transaction(() => {
      const { month: m } = loadPeriodForChange(month, rev);
      const period = readPeriod(m);
      if (period.status !== 'reviewed') {
        if (period.status !== 'calculated') throw stateError(m, period.status, ['reviewed'], 'approved');
        warnIf('PERIOD_STATE', agentsOn(), {
          details: { month: m, status: period.status, expected: ['reviewed'], to: 'approved' },
          message: `Kỳ ${m} chưa qua bước AI kiểm tra: vẫn duyệt được nhưng lần tính này chưa được soát tự động`
        });
      }
      const run = period.currentRunId == null ? null : payrollStore.getRun(period.currentRunId);
      if (!run || run.status !== 'draft')
        throw storeError('PERIOD_NOT_READY', 'Chưa có lần tính lương hiện hành để duyệt', 409, { month: m });
      const excluded = new Map();
      for (const item of Array.isArray(excludeErrors) ? excludeErrors : []) {
        if (!item || typeof item.username !== 'string') throw storeError('BAD_ARGS', 'excludeErrors sai dạng');
        excluded.set(item.username, softReason(item.reason));
      }
      const open = db
        .prepare("SELECT username, status FROM payslips WHERE run_id = ? AND status != 'approved' ORDER BY username")
        .all(run.id)
        .filter(p => !(p.status === 'error' && excluded.has(p.username)));
      const unapproved = open.filter(p => p.status !== 'error');
      const errored = open.filter(p => p.status === 'error');
      const items = open.map(p => ({ username: p.username, status: p.status }));
      warnIf('PERIOD_NOT_READY', open.length > 0, {
        count: open.length,
        details: { month: m, count: open.length, items },
        message: () =>
          `Kỳ ${m} được duyệt khi còn phiếu chưa xong: ` +
          [
            unapproved.length && `${unapproved.length} phiếu chưa duyệt đã được duyệt luôn`,
            errored.length &&
              `${errored.length} người có phiếu lỗi nên chưa có lương trong kỳ này (phiếu đã loại khỏi kỳ, người đó không được trả)`
          ]
            .filter(Boolean)
            .join('; ')
      });
      const t = now();
      for (const p of unapproved)
        db.prepare(
          "UPDATE payslips SET status = 'approved', rev = rev + 1, decided_by = ?, decided_at = ?, note = NULL WHERE run_id = ? AND username = ?"
        ).run(by, t, run.id, p.username);
      for (const p of errored) excluded.set(p.username, '');
      for (const [username, reason] of excluded)
        db.prepare(
          "UPDATE payslips SET note = ?, decided_by = ?, decided_at = ? WHERE run_id = ? AND username = ? AND status = 'error'"
        ).run(reason, by, t, run.id, username);
      freezeOverrides(run);
      db.prepare("UPDATE payroll_runs SET status = 'final' WHERE id = ?").run(run.id);
      return advancePeriod(m, rev, { from: ['calculated', 'reviewed'], to: 'approved', by });
    });
  },
  // Chi trả: approved → paid. paidAt là ngày 'YYYY-MM-DD' hoặc ISO; reference tuỳ chọn (tối đa 100 ký tự). Kỳ đã chi trả không mở lại.
  markPaid(month, { rev, by, paidAt, reference }) {
    const at =
      typeof paidAt === 'string' && (DATE_RE.test(paidAt) || !Number.isNaN(Date.parse(paidAt))) ? paidAt : null;
    if (!at) throw storeError('BAD_PAID_AT', 'Ngày chi trả không hợp lệ');
    const ref = reference == null || reference === '' ? null : String(reference).slice(0, 100);
    return advancePeriod(month, rev, {
      from: ['approved'],
      to: 'paid',
      by: requireBy(by),
      extra: { paid_at: at, paid_ref: ref }
    });
  },
  // Mở lại: to ∈ 'open' | 'attendance_locked' | 'calculated', phải về bước TRƯỚC trạng thái hiện tại. Mở lại được cả kỳ 'paid'
  // (cảnh báo PERIOD_STATE, tiền đã chi không rút lại); lý do tuỳ chọn.
  // Quyền (Admin về 'open', C&B về 'calculated') do route kiểm theo `to`. Không xoá gì: mọi lần chạy nháp hoặc
  // đã chốt của tháng thành 'superseded' (phiếu giữ nguyên), kỳ không còn lần chạy hiện hành (lần tính kế tiếp là run_no mới),
  // bước sau điểm quay về bị xoá khỏi dòng kỳ (kể cả ngày và tham chiếu chi trả), reopen_count + 1.
  reopen(month, { rev, by, to, reason }) {
    requireBy(by);
    if (!['open', 'attendance_locked', 'calculated'].includes(to))
      throw storeError('BAD_TARGET', 'Chỉ mở lại về: open, attendance_locked hoặc calculated');
    softReason(reason);
    return transaction(() => {
      const { month: m, row } = loadPeriodForChange(month, rev);
      const status = row ? row.status : 'open';
      const expected = PERIOD_STATES.filter(s => periodRank(s) > periodRank(to) && s !== 'paid');
      if (periodRank(status) <= periodRank(to) || !row) throw stateError(m, status, expected, to);
      warnIf('PERIOD_STATE', status === 'paid', {
        details: { month: m, status, expected, to },
        message: `Kỳ ${m} đã chi trả: mở lại không rút được tiền đã chuyển; khi chi trả lại cần bù trừ phần chênh với kế toán`
      });
      db.prepare("UPDATE payroll_runs SET status = 'superseded' WHERE month = ? AND status IN ('draft', 'final')").run(
        m
      );
      return advancePeriod(m, rev, {
        from: [status],
        to,
        by,
        extra: { current_run_id: null, reopen_count: row.reopen_count + 1 },
        clearAfter: true
      });
    });
  }
};

/* ---------- Lần chạy lương và phiếu: bản chụp bất biến ---------- */
const PAYSLIP_AMOUNTS = ['gross', 'insurance', 'tax', 'advance', 'net'];
// Bộ tham số đã chụp của lần chạy phải là đối tượng; JSON hỏng (số, chuỗi, mảng, null) coi như thiếu để nơi dùng không ném TypeError
const plainObjectOrNull = value => (value && typeof value === 'object' && !Array.isArray(value) ? value : null);
const rowToRun = (r, { params = false } = {}) =>
  r
    ? {
        id: r.id,
        month: r.month,
        runNo: r.run_no,
        status: r.status,
        engineVersion: r.engine_version,
        paramsHash: r.params_hash,
        paramsRev: r.params_rev,
        ...(params ? { params: plainObjectOrNull(safeParse(r.params_json)) } : {}),
        switches: safeParse(r.switches_json, {}),
        inputsDigest: r.inputs_digest ?? null,
        slipsTotal: r.slips_total ?? null,
        slipsError: r.slips_error ?? null,
        createdBy: r.created_by,
        createdAt: r.created_at,
        finishedAt: r.finished_at ?? null
      }
    : null;
const rowToPayslip = (r, { snapshot = false } = {}) =>
  r
    ? {
        id: r.id,
        runId: r.run_id,
        username: r.username,
        ...(r.name !== undefined ? { name: r.name ?? null } : {}),
        status: r.status,
        rev: r.rev,
        errorCode: r.error_code ?? null,
        errorDetail: r.error_detail ?? null,
        gross: r.gross ?? null,
        insurance: r.insurance ?? null,
        tax: r.tax ?? null,
        advance: r.advance ?? null,
        net: r.net ?? null,
        staffTerms: safeParse(r.staff_terms_json, {}),
        override: safeParse(r.override_json),
        flags: safeParse(r.flags_json, []) || [],
        decidedBy: r.decided_by ?? null,
        decidedAt: r.decided_at ?? null,
        note: r.note ?? null,
        ...(snapshot ? { snapshot: safeParse(zlib.gunzipSync(r.snapshot_gz).toString('utf8')) } : {})
      }
    : null;
// Đóng băng số sửa phiếu của tháng vào từng phiếu của lần chạy (trước khi lần chạy thành 'final').
function freezeOverrides(run) {
  const find = db.prepare('SELECT * FROM slip_overrides WHERE username = ? AND month = ?');
  const set = db.prepare('UPDATE payslips SET override_json = ? WHERE id = ?');
  for (const p of db.prepare('SELECT id, username FROM payslips WHERE run_id = ?').all(run.id)) {
    const o = find.get(p.username, run.month);
    const values = o ? safeParse(o.values_json, {}) : {};
    if (!Object.keys(values).length) continue;
    set.run(
      JSON.stringify({
        values,
        reason: o.reason ?? null,
        rev: o.rev ?? 1,
        updatedBy: o.updated_by ?? null,
        updatedAt: o.updated_at
      }),
      p.id
    );
  }
}
const payrollStore = {
  // Tạo lần chạy mới ở trạng thái 'draft' (run_no = lớn nhất + 1); các lần chạy nháp trước của tháng thành 'superseded'.
  // Cần kỳ đang ở attendance_locked | calculated | reviewed. Tham số: { engineVersion, paramsHash, paramsRev, params, switches, inputsDigest?, by }.
  // Gọi trong giao dịch cùng addPayslip, finishRun và periods.markCalculated.
  createRun(monthArg, o = {}) {
    const month = monthOf(monthArg);
    const bad = field => storeError('BAD_ARGS', `Lần chạy lương thiếu hoặc sai ${field}`, 500);
    if (typeof o.engineVersion !== 'string' || !o.engineVersion) throw bad('engineVersion');
    if (typeof o.paramsHash !== 'string' || !o.paramsHash) throw bad('paramsHash');
    if (!Number.isSafeInteger(o.paramsRev) || o.paramsRev < 0) throw bad('paramsRev');
    if (!o.params || typeof o.params !== 'object') throw bad('params');
    if (!o.switches || typeof o.switches !== 'object') throw bad('switches');
    requireBy(o.by);
    return transaction(() => {
      const period = readPeriod(month);
      if (!['attendance_locked', 'calculated', 'reviewed'].includes(period.status))
        throw stateError(month, period.status, ['attendance_locked', 'calculated', 'reviewed'], 'calculated');
      db.prepare("UPDATE payroll_runs SET status = 'superseded' WHERE month = ? AND status = 'draft'").run(month);
      const runNo = db
        .prepare('SELECT COALESCE(MAX(run_no), 0) + 1 AS n FROM payroll_runs WHERE month = ?')
        .get(month).n;
      const id = Number(
        db
          .prepare(
            `INSERT INTO payroll_runs (month, run_no, status, engine_version, params_hash, params_rev, params_json, switches_json, inputs_digest, created_by, created_at)
             VALUES (?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            month,
            runNo,
            o.engineVersion,
            o.paramsHash,
            o.paramsRev,
            JSON.stringify(o.params),
            JSON.stringify(o.switches),
            o.inputsDigest ?? null,
            o.by,
            now()
          ).lastInsertRowid
      );
      return payrollStore.getRun(id);
    });
  },
  // Thêm một phiếu vào lần chạy nháp. Tham số: { username, status: 'draft' | 'error', errorCode?, errorDetail?, gross, insurance, tax, advance, net
  // (đồng nguyên; null khi lỗi), staffTerms (đối tượng), snapshot (đối tượng, nén gzip), flags? (mảng mã) }.
  addPayslip(runId, p = {}) {
    const run = payrollStore.getRun(runId);
    if (!run || run.status !== 'draft') throw storeError('RUN_INVALID', 'Lần chạy lương không còn là bản nháp', 409);
    if (typeof p.username !== 'string' || !p.username) throw storeError('BAD_ARGS', 'Phiếu thiếu username', 500);
    if (!['draft', 'error'].includes(p.status)) throw storeError('BAD_ARGS', 'Phiếu mới chỉ là draft hoặc error', 500);
    for (const field of PAYSLIP_AMOUNTS) {
      const v = p[field];
      if (v != null && !Number.isSafeInteger(v))
        throw storeError('BAD_ARGS', `Phiếu: ${field} phải là số nguyên đồng`, 500);
      if (v == null && p.status === 'draft') throw storeError('BAD_ARGS', `Phiếu: thiếu ${field}`, 500);
    }
    if (!p.staffTerms || typeof p.staffTerms !== 'object') throw storeError('BAD_ARGS', 'Phiếu thiếu staffTerms', 500);
    if (!p.snapshot || typeof p.snapshot !== 'object') throw storeError('BAD_ARGS', 'Phiếu thiếu snapshot', 500);
    const flags = Array.isArray(p.flags) && p.flags.length ? JSON.stringify(p.flags.map(String)) : null;
    return Number(
      db
        .prepare(
          `INSERT INTO payslips (run_id, username, status, error_code, error_detail, gross, insurance, tax, advance, net, staff_terms_json, snapshot_gz, flags_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          runId,
          p.username,
          p.status,
          p.errorCode ?? null,
          p.errorDetail == null ? null : String(p.errorDetail).slice(0, 300),
          p.gross ?? null,
          p.insurance ?? null,
          p.tax ?? null,
          p.advance ?? null,
          p.net ?? null,
          JSON.stringify(p.staffTerms),
          zlib.gzipSync(JSON.stringify(p.snapshot)),
          flags
        ).lastInsertRowid
    );
  },
  // Ghi số đếm khi tính xong (chỉ lần chạy nháp). Trả về lần chạy.
  finishRun(runId, { total, errors }) {
    const run = payrollStore.getRun(runId);
    if (!run || run.status !== 'draft') throw storeError('RUN_INVALID', 'Lần chạy lương không còn là bản nháp', 409);
    db.prepare('UPDATE payroll_runs SET slips_total = ?, slips_error = ?, finished_at = ? WHERE id = ?').run(
      total,
      errors,
      now(),
      runId
    );
    return payrollStore.getRun(runId);
  },
  getRun: (id, opts) => rowToRun(db.prepare('SELECT * FROM payroll_runs WHERE id = ?').get(id), opts),
  // Lần chạy hiện hành của kỳ (period.current_run_id); null nếu chưa tính hoặc vừa mở lại.
  currentRun(month, opts) {
    const period = readPeriod(monthOf(month));
    return period.currentRunId == null ? null : payrollStore.getRun(period.currentRunId, opts);
  },
  getPayslip: (runId, username, opts) =>
    rowToPayslip(db.prepare('SELECT * FROM payslips WHERE run_id = ? AND username = ?').get(runId, username), opts),
  // Phiếu CHÍNH THỨC của một người ở một tháng: từ lần chạy 'final' (kỳ đã duyệt) mới nhất; null nếu chưa có (tháng trước cho luật so sánh).
  finalPayslip(username, month, opts) {
    return rowToPayslip(
      db
        .prepare(
          `SELECT p.* FROM payslips p JOIN payroll_runs r ON r.id = p.run_id
           WHERE p.username = ? AND r.month = ? AND r.status = 'final' ORDER BY r.run_no DESC LIMIT 1`
        )
        .get(username, monthOf(month)),
      opts
    );
  },
  // Danh sách phiếu của một lần chạy, có phân trang; không trả bản chụp. Bộ lọc: status, type (loại nhân sự đã chụp trong staff_terms_json,
  // lọc bằng json_extract trong SQL nên không cần cột riêng và dòng cũ vẫn lọc được), q (username hoặc tên), flagged (true/false), page, pageSize (≤ 200).
  listPayslips(runId, { status, type, q, flagged, page, pageSize } = {}) {
    const where = ['p.run_id = ?'],
      args = [runId];
    if (status) {
      where.push('p.status = ?');
      args.push(status);
    }
    if (type) {
      where.push("json_extract(p.staff_terms_json, '$.type') = ?");
      args.push(String(type));
    }
    if (q) {
      where.push("(p.username LIKE ? ESCAPE '\\' OR s.name LIKE ? ESCAPE '\\')");
      const like = '%' + String(q).replace(/[\\%_]/g, c => '\\' + c) + '%';
      args.push(like, like);
    }
    if (flagged === true) where.push('p.flags_json IS NOT NULL');
    if (flagged === false) where.push('p.flags_json IS NULL');
    const from = `FROM payslips p LEFT JOIN staff s ON s.username = p.username WHERE ${where.join(' AND ')}`;
    const paging = clampPage(page, pageSize);
    const total = db.prepare(`SELECT COUNT(*) AS n ${from}`).get(...args).n;
    const rows = db
      .prepare(
        `SELECT p.id, p.run_id, p.username, s.name, p.status, p.rev, p.error_code, p.error_detail, p.gross, p.insurance, p.tax, p.advance, p.net,
                p.staff_terms_json, p.override_json, p.flags_json, p.decided_by, p.decided_at, p.note
         ${from} ORDER BY p.username LIMIT ? OFFSET ?`
      )
      .all(...args, paging.limit, paging.offset)
      .map(r => rowToPayslip(r));
    return { total, page: paging.page, pageSize: paging.pageSize, rows };
  },
  countPayslips(runId) {
    const counts = { draft: 0, pending: 0, approved: 0, error: 0, total: 0 };
    for (const r of db
      .prepare('SELECT status, COUNT(*) AS n FROM payslips WHERE run_id = ? GROUP BY status')
      .all(runId)) {
      counts[r.status] = r.n;
      counts.total += r.n;
    }
    return counts;
  },
  // Kết quả bước "AI kiểm tra" (chỉ lần chạy nháp): flagsByUser { username: [mã] }. Phiếu draft → pending; flags được thay mới cho phiếu
  // draft, pending và error (phiếu đã duyệt giữ nguyên). rev + 1 khi trạng thái hoặc cờ đổi, để lần duyệt dùng số cũ bị PAYSLIP_STALE.
  applyAiReview(runId, flagsByUser = {}) {
    return transaction(() => {
      const run = payrollStore.getRun(runId);
      if (!run || run.status !== 'draft') throw storeError('RUN_INVALID', 'Lần chạy lương không còn là bản nháp', 409);
      let changed = 0;
      const update = db.prepare('UPDATE payslips SET status = ?, flags_json = ?, rev = rev + 1 WHERE id = ?');
      for (const p of db
        .prepare("SELECT id, status, flags_json, username FROM payslips WHERE run_id = ? AND status != 'approved'")
        .all(runId)) {
        const list = flagsByUser[p.username];
        const flags = Array.isArray(list) && list.length ? JSON.stringify(list.map(String)) : null;
        const status = p.status === 'draft' ? 'pending' : p.status;
        if (status === p.status && flags === p.flags_json) continue;
        update.run(status, flags, p.id);
        changed++;
      }
      return { changed };
    });
  },
  // Duyệt hoặc trả lại phiếu: items [{ username, rev }] tối đa 200, CẢ LÔ HOẶC KHÔNG; action 'approve' | 'return'; note tuỳ chọn.
  // approve: phiếu không lỗi (PAYSLIP_ERROR luôn chặn); duyệt được phiếu 'draft' (chưa qua AI, cảnh báo PAYSLIP_STATE) và phiếu có cờ AI
  // cả lô lẫn riêng lẻ (cảnh báo PAYSLIP_FLAGGED), note tuỳ chọn; phiếu đã duyệt gửi lại thì giữ nguyên (không đổi rev hay người duyệt).
  // return: đưa phiếu về 'draft', note tuỳ chọn.
  // Máy chủ còn phải kiểm "không tự duyệt phiếu của mình" (SELF_DECISION_FORBIDDEN) ở route, vì cần biết người duyệt.
  decidePayslips(runId, { items, action, note, by }) {
    requireBy(by);
    if (!['approve', 'return'].includes(action)) throw storeError('BAD_ARGS', 'action phải là approve hoặc return');
    if (!Array.isArray(items) || !items.length || items.length > 200)
      throw storeError('BAD_ARGS', 'Cần từ 1 đến 200 phiếu mỗi lần');
    const text = note == null || note === '' ? null : String(note).trim();
    if (text !== null && text.length > REASON_MAX) throw storeError('NOTE_TOO_LONG', 'Ghi chú quá dài');
    return transaction(() => {
      const run = payrollStore.getRun(runId);
      if (!run || run.status !== 'draft')
        throw storeError('PERIOD_STATE', 'Lần chạy này đã chốt hoặc bị thay thế', 409, { runId });
      const seen = new Set();
      const rows = items.map(item => {
        if (!item || typeof item.username !== 'string' || !Number.isSafeInteger(item.rev))
          throw storeError('BAD_ARGS', 'Mỗi phiếu cần username và rev');
        if (seen.has(item.username)) throw storeError('BAD_ARGS', 'Phiếu bị lặp trong lô');
        seen.add(item.username);
        const row = db.prepare('SELECT * FROM payslips WHERE run_id = ? AND username = ?').get(runId, item.username);
        if (!row)
          throw storeError('PAYSLIP_NOT_FOUND', 'Không có phiếu này trong lần chạy', 404, { username: item.username });
        if (row.rev !== item.rev)
          throw storeError('PAYSLIP_STALE', 'Phiếu đã đổi, tải lại rồi làm lại', 409, {
            username: item.username,
            rev: row.rev
          });
        return row;
      });
      const flaggedOf = r => safeParse(r.flags_json, []) || [];
      if (action === 'approve') {
        const errors = rows.filter(r => r.status === 'error');
        if (errors.length)
          throw storeError('PAYSLIP_ERROR', 'Phiếu lỗi không duyệt được', 409, {
            items: errors.map(r => ({ username: r.username }))
          });
        const wrong = rows.filter(r => r.status !== 'pending' && (r.status !== 'draft' || agentsOn()));
        const stateItems = wrong.map(r => ({ username: r.username, status: r.status }));
        warnIf('PAYSLIP_STATE', wrong.length > 0, {
          count: wrong.length,
          details: { items: stateItems },
          message: () => {
            const drafts = wrong.filter(r => r.status === 'draft').length;
            return drafts
              ? `${drafts} phiếu chưa qua bước AI kiểm tra nhưng vẫn được duyệt`
              : `${wrong.length} phiếu đã duyệt từ trước, giữ nguyên`;
          }
        });
        const flagged = rows.filter(r => flaggedOf(r).length);
        const flaggedItems = flagged.map(r => ({ username: r.username, flags: flaggedOf(r) }));
        warnIf('PAYSLIP_FLAGGED', flagged.length > 0 && rows.length > 1, {
          count: flagged.length,
          details: { items: flaggedItems },
          message: `${flagged.length} phiếu còn phát hiện AI chưa xử lý nhưng vẫn được duyệt trong lô`
        });
      } else {
        const wrong = rows.filter(r => !['pending', 'approved'].includes(r.status));
        if (wrong.length)
          throw storeError('PAYSLIP_STATE', 'Chỉ trả lại phiếu đang chờ duyệt hoặc đã duyệt', 409, {
            items: wrong.map(r => ({ username: r.username, status: r.status }))
          });
      }
      const next = action === 'approve' ? 'approved' : 'draft';
      const update = db.prepare(
        'UPDATE payslips SET status = ?, rev = rev + 1, decided_by = ?, decided_at = ?, note = ? WHERE id = ?'
      );
      const t = now();
      return rows.map(r => {
        if (action === 'approve' && r.status === 'approved')
          return { username: r.username, status: 'approved', rev: r.rev };
        update.run(next, by, t, text, r.id);
        return { username: r.username, status: next, rev: r.rev + 1 };
      });
    });
  }
};

/* ---------- Bỏ qua phát hiện AI có lý do và lần chạy AI ---------- */
const rowToFindingAction = r => ({
  id: r.id,
  findingId: r.finding_id,
  digest: r.digest,
  month: r.month,
  ruleId: r.rule_id,
  action: r.action,
  by: r.by,
  at: r.at,
  note: r.note
});
const latestFindingAction = findingId =>
  db.prepare('SELECT * FROM ai_finding_actions WHERE finding_id = ? ORDER BY id DESC LIMIT 1').get(findingId);
const aiFindingStore = {
  // Bỏ qua một phát hiện. { findingId, digest, month, ruleId, by, note }: note tuỳ chọn, tối đa 300 ký tự.
  // digest là băm bằng chứng LÚC BỎ QUA; dữ liệu đổi thì digest hiện tại lệch và phát hiện hiện lại (isDismissed).
  // Việc so digest với phát hiện hiện tại (FINDING_STALE) do route làm vì store không biết phát hiện.
  dismiss({ findingId, digest, month, ruleId, by, note }) {
    requireBy(by);
    for (const [name, value] of [
      ['findingId', findingId],
      ['digest', digest],
      ['ruleId', ruleId]
    ])
      if (typeof value !== 'string' || !value) throw storeError('BAD_ARGS', `Thiếu ${name}`);
    const m = monthOf(month);
    const reason = padReason(softReason(note, 'NOTE_REQUIRED')); // cột note có CHECK 10 đến 300: thiếu lý do thì lưu NO_REASON_TEXT
    const id = Number(
      db
        .prepare(
          'INSERT INTO ai_finding_actions (finding_id, digest, month, rule_id, action, by, at, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        )
        .run(findingId, digest, m, ruleId, 'dismiss', by, now(), reason).lastInsertRowid
    );
    return rowToFindingAction(db.prepare('SELECT * FROM ai_finding_actions WHERE id = ?').get(id));
  },
  // Dòng mới nhất của một phát hiện (hoặc null).
  latest: findingId => {
    const r = latestFindingAction(findingId);
    return r ? rowToFindingAction(r) : null;
  },
  // Phát hiện đang "bỏ qua": dòng mới nhất là 'dismiss' VÀ digest khớp digest hiện tại (currentDigest). Thiếu currentDigest thì chỉ xét dòng mới nhất.
  isDismissed(findingId, currentDigest) {
    const last = latestFindingAction(findingId);
    return !!last && last.action === 'dismiss' && (currentDigest === undefined || last.digest === currentDigest);
  },
  // Cho một tháng: tập findingId đang bỏ qua. digests { findingId: digestHiệnTại } để áp luật hết hạn khi dữ liệu đổi (thiếu khoá thì không xét digest).
  dismissedIds(month, digests = {}) {
    const rows = db
      .prepare(
        `SELECT a.* FROM ai_finding_actions a
         WHERE a.month = ? AND a.id = (SELECT MAX(b.id) FROM ai_finding_actions b WHERE b.finding_id = a.finding_id)
           AND a.action = 'dismiss'`
      )
      .all(monthOf(month));
    return new Set(
      rows
        .filter(r => !Object.hasOwn(digests, r.finding_id) || digests[r.finding_id] === r.digest)
        .map(r => r.finding_id)
    );
  },
  // Lịch sử (cũ → mới), lọc theo findingId, month, ruleId; limit tối đa 200.
  list({ findingId, month, ruleId, limit } = {}) {
    const where = [],
      args = [];
    if (findingId) {
      where.push('finding_id = ?');
      args.push(String(findingId));
    }
    if (month) {
      where.push('month = ?');
      args.push(monthOf(month));
    }
    if (ruleId) {
      where.push('rule_id = ?');
      args.push(String(ruleId));
    }
    return db
      .prepare(
        `SELECT * FROM ai_finding_actions ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id LIMIT ?`
      )
      .all(...args, Math.min(200, Math.max(1, Math.trunc(Number(limit)) || 200)))
      .map(rowToFindingAction);
  }
};
// summary_json chỉ chứa SỐ ĐẾM (đối tượng lồng nhau, lá là số): chặn tên người, số tiền dạng chuỗi, mô tả lọt vào bảng.
function countsOnly(value, depth = 0) {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value >= 0;
  if (depth > 3 || !value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(value).every(v => countsOnly(v, depth + 1));
}
const rowToAiRun = r => ({
  id: r.id,
  month: r.month,
  runId: r.run_id ?? null,
  rules: safeParse(r.rules_json, []),
  thresholdsHash: r.thresholds_hash,
  paramsHash: r.params_hash,
  findingsTotal: r.findings_total ?? null,
  summary: safeParse(r.summary_json),
  by: r.by,
  at: r.at
});
const aiReviewStore = {
  // Ghi một lần chạy AI. { month, runId?, rules (mảng id luật), thresholdsHash, paramsHash, findingsTotal, summary, by }.
  // summary chỉ gồm số đếm theo mức và theo luật (AI_SUMMARY_NOT_COUNTS nếu có chuỗi, tên hay tiền).
  add({ month, runId, rules, thresholdsHash, paramsHash, findingsTotal, summary, by }) {
    requireBy(by);
    const m = monthOf(month);
    if (!Array.isArray(rules) || rules.some(r => typeof r !== 'string'))
      throw storeError('BAD_ARGS', 'rules phải là mảng id luật');
    if (typeof thresholdsHash !== 'string' || typeof paramsHash !== 'string')
      throw storeError('BAD_ARGS', 'Thiếu thresholdsHash hoặc paramsHash');
    if (findingsTotal != null && !(Number.isSafeInteger(findingsTotal) && findingsTotal >= 0))
      throw storeError('AI_SUMMARY_NOT_COUNTS', 'findingsTotal phải là số đếm');
    if (summary != null && !countsOnly(summary))
      throw storeError('AI_SUMMARY_NOT_COUNTS', 'Bản tóm tắt lần chạy AI chỉ được chứa số đếm', 500);
    const id = Number(
      db
        .prepare(
          `INSERT INTO ai_review_runs (month, run_id, rules_json, thresholds_hash, params_hash, findings_total, summary_json, by, at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          m,
          runId ?? null,
          JSON.stringify(rules),
          thresholdsHash,
          paramsHash,
          findingsTotal ?? null,
          summary == null ? null : JSON.stringify(summary),
          by,
          now()
        ).lastInsertRowid
    );
    return rowToAiRun(db.prepare('SELECT * FROM ai_review_runs WHERE id = ?').get(id));
  },
  // Lần chạy AI mới nhất của tháng (hoặc của một lần tính lương nếu có runId); null nếu chưa chạy. AI_NOT_RUN = không có dòng này sau lần tính gần nhất.
  latest(month, runId) {
    const r =
      runId == null
        ? db.prepare('SELECT * FROM ai_review_runs WHERE month = ? ORDER BY id DESC LIMIT 1').get(monthOf(month))
        : db
            .prepare('SELECT * FROM ai_review_runs WHERE month = ? AND run_id = ? ORDER BY id DESC LIMIT 1')
            .get(monthOf(month), runId);
    return r ? rowToAiRun(r) : null;
  }
};

/* ---------- Vai trò theo năng lực ---------- */
// Vai trò chỉ là TÊN ở đây; tập năng lực của từng vai trò nằm trong mã (lib/authz.js → ROLE_CAPS), không nằm trong DB.
// staff.role = 'admin' (tài khoản cũ) vẫn nghĩa là có vai trò admin: không cần dòng staff_roles.
const ROLE_RE = /^[a-z][a-z_]{1,31}$/;
const rowToRole = r => ({
  id: r.id,
  username: r.username,
  role: r.role,
  grantedBy: r.granted_by,
  grantedAt: r.granted_at,
  revokedAt: r.revoked_at ?? null
});
const activeRoleRow = (username, role) =>
  db.prepare('SELECT * FROM staff_roles WHERE username = ? AND role = ? AND revoked_at IS NULL').get(username, role);
const rolesStore = {
  // Gán một vai trò (đã gán còn hiệu lực thì trả về dòng cũ, created: false). Tài khoản phải có thật (ROLE_USER_UNKNOWN, 404).
  grant(username, role, by) {
    requireBy(by);
    if (typeof role !== 'string' || !ROLE_RE.test(role)) throw storeError('ROLE_UNKNOWN', 'Tên vai trò không hợp lệ');
    if (!db.prepare('SELECT 1 FROM staff WHERE username = ?').get(username))
      throw storeError('ROLE_USER_UNKNOWN', 'Không có tài khoản này', 404);
    return transaction(() => {
      const current = activeRoleRow(username, role);
      if (current) return { ...rowToRole(current), created: false };
      const id = Number(
        db
          .prepare('INSERT INTO staff_roles (username, role, granted_by, granted_at) VALUES (?, ?, ?, ?)')
          .run(username, role, by, now()).lastInsertRowid
      );
      return { ...rowToRole(db.prepare('SELECT * FROM staff_roles WHERE id = ?').get(id)), created: true };
    });
  },
  // Thu hồi (đặt revoked_at). Trả về true nếu có vai trò còn hiệu lực. Không kiểm "admin cuối cùng" (route kiểm trước khi gọi).
  revoke(username, role) {
    return (
      db
        .prepare('UPDATE staff_roles SET revoked_at = ? WHERE username = ? AND role = ? AND revoked_at IS NULL')
        .run(now(), username, role).changes > 0
    );
  },
  // Vai trò đã gán còn hiệu lực (không gồm admin suy từ staff.role, không gồm 'staff' mặc định).
  activeRoles: username =>
    db
      .prepare('SELECT role FROM staff_roles WHERE username = ? AND revoked_at IS NULL ORDER BY role')
      .all(username)
      .map(r => r.role),
  // Vai trò hiệu lực: các vai trò đã gán, cộng 'admin' nếu staff.role = 'admin'. Tài khoản bị khoá không có vai trò nào.
  effectiveRoles(username) {
    const staff = db.prepare('SELECT role, locked_at FROM staff WHERE username = ?').get(username);
    if (!staff || staff.locked_at) return [];
    const roles = new Set(rolesStore.activeRoles(username));
    if (staff.role === 'admin') roles.add('admin');
    return [...roles].sort();
  },
  // Danh sách dòng gán; includeRevoked để xem cả lịch sử.
  list({ username, role, includeRevoked } = {}) {
    const where = [],
      args = [];
    if (username) {
      where.push('username = ?');
      args.push(username);
    }
    if (role) {
      where.push('role = ?');
      args.push(role);
    }
    if (!includeRevoked) where.push('revoked_at IS NULL');
    return db
      .prepare(
        `SELECT * FROM staff_roles ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY username, role, id`
      )
      .all(...args)
      .map(rowToRole);
  },
  // Số tài khoản (chưa khoá) đang có một vai trò, gồm cả staff.role = 'admin' khi hỏi 'admin'.
  countRole(role) {
    const assigned = db
      .prepare(
        `SELECT COUNT(DISTINCT r.username) AS n FROM staff_roles r JOIN staff s ON s.username = r.username
         WHERE r.role = ? AND r.revoked_at IS NULL AND s.locked_at IS NULL`
      )
      .get(role).n;
    if (role !== 'admin') return assigned;
    return db
      .prepare(
        `SELECT COUNT(*) AS n FROM staff s WHERE s.locked_at IS NULL AND (s.role = 'admin' OR EXISTS
           (SELECT 1 FROM staff_roles r WHERE r.username = s.username AND r.role = 'admin' AND r.revoked_at IS NULL))`
      )
      .get().n;
  },
  countAdmins: () => rolesStore.countRole('admin')
};

module.exports = {
  db,
  transaction,
  setDefaultContractResolver,
  listStaff() {
    return db.prepare('SELECT * FROM staff ORDER BY role, type, name').all().map(rowToStaff);
  },
  getStaff(u) {
    return rowToStaff(db.prepare('SELECT * FROM staff WHERE username = ?').get(u));
  },
  getStaffRow(u) {
    return db.prepare('SELECT * FROM staff WHERE username = ?').get(u);
  },
  // Số phiên bản phiên đăng nhập; cố ý không nằm trong đối tượng nhân sự thường (không để lọt ra API). null nếu không có tài khoản.
  getSessionVersion(u) {
    const row = db.prepare('SELECT session_version FROM staff WHERE username = ?').get(u);
    return row ? row.session_version || 0 : null;
  },
  // contractStatus / resignedOn: undefined = giữ giá trị đang lưu, null = xoá. Họ/tên tách từ name; familyName + givenName chỉ được dùng khi
  // ghép lại đúng bằng name (Admin nhập riêng tên hai chữ), lệch thì name mới thắng (đổi tên mà còn họ/tên cũ trong đối tượng).
  upsertStaff(s) {
    const flag = v => (v == null ? null : v ? 1 : 0);
    const given = PersonName.from({ familyName: s.familyName, givenName: s.givenName });
    const parts = given.fullName && given.fullName === titleCase(s.name) ? given : PersonName.parse(s.name);
    const keep = v => (v === undefined ? 1 : 0);
    // Ca cố định luôn lưu mã mới (Normal1 …); người gọi còn gửi mã cũ (n1 …) thì đổi theo bảng work_shifts, mã lạ giữ nguyên
    const shift = s.shiftCode
      ? db.prepare('SELECT code FROM work_shifts WHERE code = ? OR preset = ?').get(s.shiftCode, s.shiftCode)
      : null;
    db.prepare(
      `INSERT INTO staff (username, name, role, type, level, night_pct, idorm, shift_code, pass_hash, created_at, start_date, birthday, leave_adjust, contract, insured, dependants, tax_on, deduct_on, advance_on, job_title, payroll_subject,
                  uuid, family_name, given_name, contract_status, resigned_on)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(username) DO UPDATE SET name=excluded.name, role=excluded.role, type=excluded.type,
                  level=excluded.level, night_pct=excluded.night_pct, idorm=excluded.idorm, shift_code=excluded.shift_code, pass_hash=excluded.pass_hash,
                  start_date=excluded.start_date, birthday=excluded.birthday, leave_adjust=excluded.leave_adjust,
                  contract=excluded.contract, insured=excluded.insured, dependants=excluded.dependants,
                  tax_on=excluded.tax_on, deduct_on=excluded.deduct_on, advance_on=excluded.advance_on, job_title=excluded.job_title,
                  payroll_subject=COALESCE(?, payroll_subject),
                  family_name=excluded.family_name, given_name=excluded.given_name,
                  contract_status=CASE WHEN ? THEN contract_status ELSE excluded.contract_status END,
                  resigned_on=CASE WHEN ? THEN resigned_on ELSE excluded.resigned_on END`
    ).run(
      s.username,
      s.name,
      s.role,
      s.type,
      s.level,
      s.nightPct ?? null,
      s.idorm ? 1 : 0,
      shift ? shift.code : (s.shiftCode ?? null),
      s.passHash,
      s.createdAt || now(),
      s.startDate ?? null,
      s.birthday ?? null,
      Number(s.leaveAdjust) || 0,
      s.contract === 'long' || s.contract === 'short' ? s.contract : null,
      flag(s.insured),
      Math.max(0, Math.trunc(Number(s.dependants) || 0)),
      flag(s.taxOn),
      flag(s.deductOn),
      flag(s.advanceOn),
      s.jobTitle ? String(s.jobTitle) : null,
      // Dòng mới: mặc định theo role (admin = 0, còn lại = 1); dòng cũ: chỉ đổi khi người gọi nêu rõ payrollSubject
      s.payrollSubject == null ? (s.role === 'admin' ? 0 : 1) : flag(s.payrollSubject),
      crypto.randomUUID(), // chỉ dùng khi thêm mới; dòng đã có giữ uuid cũ
      parts.familyName,
      parts.givenName || null,
      s.contractStatus === 'probation' || s.contractStatus === 'official' ? s.contractStatus : null,
      typeof s.resignedOn === 'string' && s.resignedOn ? s.resignedOn : null,
      flag(s.payrollSubject),
      keep(s.contractStatus),
      keep(s.resignedOn)
    );
  },
  // tất cả bảng chấm công của một người (để đếm ngày nghỉ phép năm qua các tháng)
  listSheets(u) {
    return db
      .prepare('SELECT month, days_json FROM timesheets WHERE username = ?')
      .all(u)
      .map(r => ({ month: r.month, days: JSON.parse(r.days_json) }));
  },
  // check-in / check-out
  addPunch(u, at, type, ip, auto, context, sessionId = null) {
    db.prepare(
      'INSERT INTO punches (username, at, type, ip, auto, context_json,session_id) VALUES (?, ?, ?, ?, ?, ?,?)'
    ).run(u, at, type, ip || null, auto ? 1 : 0, context ? JSON.stringify(context) : null, sessionId);
  },
  // Ghi bảng điều chỉnh giờ: máy chủ không gọi (không có tính năng sửa giờ Check-in/out; bảng chỉ còn được đọc).
  // addCorrection/decideCorrection dùng cho công cụ dữ liệu demo và test dựng dòng lịch sử.
  // Gửi lại cho cùng ngày thì yêu cầu cũ đang chờ chuyển sang 'replaced'
  addCorrection(c) {
    if (c.sessionId)
      db.prepare("UPDATE corrections SET status = 'replaced' WHERE session_id = ? AND status = 'pending'").run(
        c.sessionId
      );
    else
      db.prepare(
        "UPDATE corrections SET status = 'replaced' WHERE username = ? AND date = ? AND session_id IS NULL AND status = 'pending'"
      ).run(c.username, c.date);
    return Number(
      db
        .prepare(
          'INSERT INTO corrections (username, date, req_in, req_out, reason, created_at, context_json,session_id,session_version) VALUES (?, ?, ?, ?, ?, ?, ?,?,?)'
        )
        .run(
          c.username,
          c.date,
          c.reqIn,
          c.reqOut,
          c.reason,
          now(),
          JSON.stringify(c.context || { plannedShift: c.plannedShift || null }),
          c.sessionId ?? null,
          c.sessionVersion ?? null
        ).lastInsertRowid
    );
  },
  getCorrection(id) {
    return withContext(db.prepare('SELECT * FROM corrections WHERE id = ?').get(id));
  },
  listCorrections(options = {}) {
    const { sql, args } = correctionFilter(options);
    const page = options.limit === undefined ? '' : ' LIMIT ? OFFSET ?';
    if (options.limit !== undefined) args.push(options.limit, options.offset || 0);
    return db
      .prepare(`SELECT * FROM corrections ${sql} ORDER BY id DESC${page}`)
      .all(...args)
      .map(withContext);
  },
  decideCorrection(id, status, by, note, reqIn, reqOut, effectiveDate) {
    db.prepare(
      'UPDATE corrections SET status = ?, decided_by = ?, decided_at = ?, note = ?, req_in = COALESCE(?, req_in), req_out = COALESCE(?, req_out), date = COALESCE(?, date) WHERE id = ?'
    ).run(status, by, now(), note || null, reqIn || null, reqOut || null, effectiveDate || null, id);
  },
  setPassword(u, passHash) {
    db.prepare('UPDATE staff SET pass_hash = ? WHERE username = ?').run(passHash, u);
  },
  // Khoá thay cho xoá: giữ nguyên lịch sử lương, tăng session_version để mọi phiên đăng nhập đang mở hết hiệu lực.
  // Trả về true nếu có đổi (tài khoản có thật và chưa bị khoá).
  lockStaff(u, by) {
    return (
      db
        .prepare(
          `UPDATE staff
           SET locked_at = ?, locked_by = ?, session_version = session_version + 1
           WHERE username = ? AND locked_at IS NULL`
        )
        .run(now(), by || null, u).changes > 0
    );
  },
  // Mở khoá: không tăng session_version, phiên cũ đã hết hiệu lực từ lúc khoá. Trả về true nếu có đổi.
  unlockStaff(u) {
    return (
      db
        .prepare('UPDATE staff SET locked_at = NULL, locked_by = NULL WHERE username = ? AND locked_at IS NOT NULL')
        .run(u).changes > 0
    );
  },
  // Làm mọi phiên đăng nhập của người này hết hiệu lực (ví dụ sau khi đổi mật khẩu). Trả về số phiên bản mới, null nếu không có tài khoản.
  bumpSessionVersion(u) {
    const row = db
      .prepare('UPDATE staff SET session_version = session_version + 1 WHERE username = ? RETURNING session_version')
      .get(u);
    return row ? row.session_version : null;
  },
  getSheet(u, month) {
    const r = db.prepare('SELECT * FROM timesheets WHERE username = ? AND month = ?').get(u, month);
    return {
      days: r ? JSON.parse(r.days_json) : {},
      kpiPct: r && r.kpi_pct != null ? r.kpi_pct : null,
      kpiAmt: r && r.kpi_amt != null ? r.kpi_amt : null,
      kpiAdmPct: r && r.kpi_adm_pct != null ? r.kpi_adm_pct : null,
      kpiAdmAmt: r && r.kpi_adm_amt != null ? r.kpi_adm_amt : null,
      rev: r ? r.rev : 0
    };
  },
  setSheet(u, month, days, kpiPct, kpiAmt) {
    db.prepare(
      `INSERT INTO timesheets (username, month, days_json, kpi_pct, kpi_amt, updated_at, rev) VALUES (?, ?, ?, ?, ?, ?, 1)
                ON CONFLICT(username, month) DO UPDATE SET days_json=excluded.days_json, kpi_pct=excluded.kpi_pct, kpi_amt=excluded.kpi_amt, updated_at=excluded.updated_at, rev=rev+1`
    ).run(u, month, JSON.stringify(days), kpiPct ?? null, kpiAmt ?? null, now());
  },
  setKpiApproval(u, month, pct, amt) {
    db.prepare(
      `INSERT INTO timesheets (username, month, days_json, kpi_adm_pct, kpi_adm_amt, updated_at) VALUES (?, ?, '{}', ?, ?, ?)
                ON CONFLICT(username, month) DO UPDATE SET kpi_adm_pct=excluded.kpi_adm_pct, kpi_adm_amt=excluded.kpi_adm_amt, updated_at=excluded.updated_at`
    ).run(u, month, pct ?? null, amt ?? null, now());
  },
  getSlipOverride(u, month) {
    const r = db.prepare('SELECT * FROM slip_overrides WHERE username = ? AND month = ?').get(u, month);
    // reason: lý do lần sửa gần nhất (dòng có trước khi thêm cột: null). rev: số lần lưu (0 = chưa có dòng), dùng làm khoá lạc quan.
    return r
      ? {
          values: JSON.parse(r.values_json),
          updatedBy: r.updated_by || null,
          updatedAt: r.updated_at,
          reason: r.reason ?? null,
          rev: r.rev ?? 1
        }
      : { values: {}, updatedBy: null, updatedAt: null, reason: null, rev: 0 };
  },
  // values rỗng = bỏ hết số đã sửa, phiếu quay về số tự tính. Dòng được GIỮ với values {} (không xoá) để rev không quay về 1.
  // reason: lý do (route kiểm 10–300 ký tự khi values không rỗng). opts.expectedRev: khác rev hiện có thì ném SLIP_STALE (409)
  // và không ghi gì. Trả về trạng thái sau khi lưu (như getSlipOverride).
  setSlipOverride(u, month, values, by, reason, opts = {}) {
    return transaction(() => {
      const current = module.exports.getSlipOverride(u, month);
      if (opts.expectedRev !== undefined && opts.expectedRev !== current.rev)
        throw storeError('SLIP_STALE', 'Số sửa trên phiếu đã được người khác đổi, tải lại rồi làm lại', 409, {
          rev: current.rev
        });
      if (!Object.keys(values).length && current.rev === 0) return current; // chưa có gì để bỏ
      db.prepare(
        `INSERT INTO slip_overrides (username, month, values_json, updated_by, updated_at, reason, rev) VALUES (?, ?, ?, ?, ?, ?, 1)
                ON CONFLICT(username, month) DO UPDATE SET values_json=excluded.values_json, updated_by=excluded.updated_by, updated_at=excluded.updated_at, reason=excluded.reason, rev=rev+1`
      ).run(u, month, JSON.stringify(values), by || null, now(), reason == null ? null : String(reason));
      return module.exports.getSlipOverride(u, month);
    });
  },
  // Điểm KPI 5 thành phần. Điểm là số nguyên điểm × 100 (0 đến 10000), null = chưa nhập.
  // Dòng trả về: { username, month, scores: { wework, user, peer, manager, self }, complete, createdBy, createdAt, updatedBy, updatedAt }.
  // null nếu người này chưa có dòng điểm nào ở tháng đó.
  getKpiScores(u, month) {
    checkKpiMonth(month);
    return rowToKpiScores(db.prepare('SELECT * FROM kpi_scores WHERE username = ? AND month = ?').get(u, month));
  },
  listKpiScores(month) {
    checkKpiMonth(month);
    return db.prepare('SELECT * FROM kpi_scores WHERE month = ? ORDER BY username').all(month).map(rowToKpiScores);
  },
  // Lưu một phần điểm (patch: khoá vắng = giữ nguyên, null = xoá điểm đó) kèm nhật ký, trong MỘT giao dịch.
  // patch gồm wework, user, peer, manager, self (số nguyên 0..10000) và amt (mức KPI đã duyệt, đồng; ghi vào timesheets.kpi_adm_amt,
  // không đụng kpi_adm_pct). Mỗi giá trị thật sự đổi thêm một dòng nhật ký (cũ, mới, người sửa); giá trị không đổi thì không ghi gì.
  // Trả về { item, changed }: item là getKpiScores sau khi ghi (null nếu chưa có dòng điểm), changed là danh sách khoá đã đổi.
  // Lỗi có mã err.code: KPI_MONTH_INVALID, KPI_KEY_UNKNOWN, KPI_SCORE_INVALID, KPI_AMT_INVALID, KPI_EMPTY_PATCH, KPI_ARGS_INVALID.
  setKpiScores(u, month, patch, by, reason) {
    checkKpiMonth(month);
    if (typeof u !== 'string' || !u) throw kpiError('KPI_ARGS_INVALID', 'Thiếu tên đăng nhập', 'user');
    if (typeof by !== 'string' || !by) throw kpiError('KPI_ARGS_INVALID', 'Thiếu người sửa điểm', 'by');
    const entries = checkKpiPatch(patch);
    const why = reason == null || String(reason).trim() === '' ? null : String(reason).trim();
    return transaction(() => {
      const t = now();
      const current = db.prepare('SELECT * FROM kpi_scores WHERE username = ? AND month = ?').get(u, month);
      const sheet = db.prepare('SELECT kpi_adm_amt FROM timesheets WHERE username = ? AND month = ?').get(u, month);
      const changes = [];
      for (const { key, value } of entries) {
        const before = key === 'amt' ? (sheet ? sheet.kpi_adm_amt : null) : current ? current[KPI_COLUMNS[key]] : null;
        if (before !== value) changes.push({ key, before: before ?? null, after: value });
      }
      const scoreChanges = changes.filter(c => c.key !== 'amt');
      if (scoreChanges.length) {
        if (current) {
          const sets = scoreChanges.map(c => `${KPI_COLUMNS[c.key]} = ?`).join(', ');
          db.prepare(
            `UPDATE kpi_scores SET ${sets}, updated_by = ?, updated_at = ? WHERE username = ? AND month = ?`
          ).run(...scoreChanges.map(c => c.after), by, t, u, month);
        } else {
          const columns = scoreChanges.map(c => KPI_COLUMNS[c.key]);
          db.prepare(
            `INSERT INTO kpi_scores (username, month, ${columns.join(', ')}, created_by, created_at, updated_by, updated_at)
             VALUES (?, ?, ${columns.map(() => '?').join(', ')}, ?, ?, ?, ?)`
          ).run(u, month, ...scoreChanges.map(c => c.after), by, t, by, t);
        }
      }
      const amt = changes.find(c => c.key === 'amt');
      if (amt)
        db.prepare(
          `INSERT INTO timesheets (username, month, days_json, kpi_adm_amt, updated_at) VALUES (?, ?, '{}', ?, ?)
           ON CONFLICT(username, month) DO UPDATE SET kpi_adm_amt = excluded.kpi_adm_amt, updated_at = excluded.updated_at`
        ).run(u, month, amt.after, t);
      const log = db.prepare(
        'INSERT INTO kpi_score_log (username, month, field, old_value, new_value, by, at, reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      );
      for (const c of changes) log.run(u, month, c.key, c.before, c.after, by, t, why);
      return {
        item: rowToKpiScores(db.prepare('SELECT * FROM kpi_scores WHERE username = ? AND month = ?').get(u, month)),
        changed: changes.map(c => c.key)
      };
    });
  },
  // Nhật ký sửa điểm, cũ nhất trước. Lọc theo username và/hoặc month; limit tuỳ chọn.
  listKpiScoreLog({ username, month, limit } = {}) {
    const where = [],
      args = [];
    if (username) {
      where.push('username = ?');
      args.push(username);
    }
    if (month) {
      checkKpiMonth(month);
      where.push('month = ?');
      args.push(month);
    }
    if (limit !== undefined) args.push(Math.max(0, Math.trunc(Number(limit)) || 0));
    return db
      .prepare(
        `SELECT * FROM kpi_score_log ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id${limit !== undefined ? ' LIMIT ?' : ''}`
      )
      .all(...args)
      .map(rowToKpiLog);
  },
  // getSetting/setSetting dưới đây cũng là chỗ lib/params/config-rev.js giữ số phiên bản chung của cấu hình: khoá settings.config_rev (số nguyên, vắng = 0),
  // tăng bằng setSetting TRONG store.transaction của thao tác đổi cấu hình. Không có bảng hay cột riêng cho nó.
  getSetting(key, fallback) {
    const r = db.prepare('SELECT value_json FROM settings WHERE key = ?').get(key);
    return r ? JSON.parse(r.value_json) : fallback;
  },
  setSetting(key, value) {
    db.prepare(
      'INSERT INTO settings (key, value_json) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json'
    ).run(key, JSON.stringify(value));
  }
};
Object.assign(module.exports, {
  // Kỳ lương, nhật ký, tham số, AI, vai trò: xem chú thích khối cùng tên phía trên
  audit: auditStore,
  params: paramsStore,
  periods: periodsStore,
  payroll: payrollStore,
  aiFindings: aiFindingStore,
  aiReviews: aiReviewStore,
  roles: rolesStore,
  assertPeriodOpen,
  // Lý do cho cột có CHECK 10 đến 300 ký tự khi lý do không bắt buộc (xem padReason)
  NO_REASON_TEXT,
  padReason,
  // Cờ nhân sự được trả lương: true/false; null nếu không có tài khoản
  isPayrollSubject(u) {
    const r = db.prepare('SELECT role, payroll_subject FROM staff WHERE username = ?').get(u);
    return r ? (r.payroll_subject == null ? r.role !== 'admin' : !!r.payroll_subject) : null;
  },
  setPayrollSubject(u, value) {
    return db.prepare('UPDATE staff SET payroll_subject = ? WHERE username = ?').run(value ? 1 : 0, u).changes > 0;
  }
});
const helpers = { addColumn, now, transaction, bootFail };
Object.assign(module.exports, require('./attendance-sessions')(db, helpers));
module.exports.approvals = require('./approvals')(db, helpers);
