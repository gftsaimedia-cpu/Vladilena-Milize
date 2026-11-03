// Lớp dữ liệu: PostgreSQL. Truy vấn có kiểu ở src/data (Kysely); lược đồ do migrations/postgres/*.sql dựng.
const { PostgresDatabase } = require('../data/postgres-database');
const {
  createQueryBuilder,
  AdvisoryLocks,
  SettingsRepository,
  AdvanceApprovalsRepository,
  AuditLogRepository,
  ParamVersionsRepository,
  PayrollPeriodsRepository,
  PayrollRunsRepository,
  PayslipsRepository,
  SlipOverridesRepository,
  StaffRolesRepository,
  StaffRepository,
  PunchesRepository,
  CorrectionsRepository,
  TimesheetsRepository,
  KpiScoresRepository
} = require('../data');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { AsyncLocalStorage } = require('node:async_hooks');
const { warnIf, optionalReason } = require('./warnings'); // warnings.js không require src/platform/db
const config = require('./config'); // hằng số kỹ thuật có tên (không số trong mã)
const { AsyncList } = require('../shared/async-list');
const { PersonName, titleCase } = require('../domain/employee/person-name'); // lớp thuần, không require src/platform/db

// Ứng dụng chỉ nhận URL kết nối tới một database PostgreSQL cụ thể. Test runner tự tạo
// database riêng và truyền URL đó qua DATABASE_URL; cấu hình legacy không chọn database.
const legacyDatabaseVariables = ['DB_PATH', 'PG_TEST_URL'].filter(name => process.env[name]);
if (legacyDatabaseVariables.length)
  throw new Error(`Cấu hình database cũ không được hỗ trợ: ${legacyDatabaseVariables.join(', ')}. Chỉ dùng DATABASE_URL.`);
if (!process.env.DATABASE_URL)
  throw new Error(
    [
      'Chưa chọn cơ sở dữ liệu nên ứng dụng không mở DB nào (tránh vô tình dùng nhầm DB).',
      'Đặt DATABASE_URL trỏ tới database PostgreSQL rồi chạy lại.',
      '  DATABASE_URL=postgres://user:mật-khẩu@máy-chủ:5432/tên-db'
    ].join('\n')
  );

const db = new PostgresDatabase({ url: process.env.DATABASE_URL });
// Trình dựng truy vấn có kiểu (Kysely, src/data) trên chính kết nối này; các kho lần lượt chuyển từ SQL thô sang repository.
const queryBuilder = createQueryBuilder(db);
const locks = new AdvisoryLocks(queryBuilder);
const settingsRepo = new SettingsRepository(queryBuilder);
const advanceApprovalsRepo = new AdvanceApprovalsRepository(queryBuilder);
const auditRepo = new AuditLogRepository(queryBuilder);
const paramVersionsRepo = new ParamVersionsRepository(queryBuilder);
const periodsRepo = new PayrollPeriodsRepository(queryBuilder);
const runsRepo = new PayrollRunsRepository(queryBuilder);
const payslipsRepo = new PayslipsRepository(queryBuilder);
const slipOverridesRepo = new SlipOverridesRepository(queryBuilder);
const staffRolesRepo = new StaffRolesRepository(queryBuilder);
const staffRepo = new StaffRepository(queryBuilder);
const punchesRepo = new PunchesRepository(queryBuilder);
const correctionsRepo = new CorrectionsRepository(queryBuilder);
const timesheetsRepo = new TimesheetsRepository(queryBuilder);
const kpiScoresRepo = new KpiScoresRepository(queryBuilder);
// Lược đồ do migrations/postgres/*.sql dựng (PostgresDatabase chạy chúng lúc mở, xem `ready` bên dưới).

// Đồng hồ chỉ đọc qua Date.now() để test và sandbox giả được giờ.
const now = () => new Date(Date.now()).toISOString();
// Thêm cột chỉ khi chưa có (nâng cấp DB cũ). Tên bảng, tên cột và kiểu luôn là hằng số trong mã, không lấy từ người dùng.

// Gói ghi nhiều bước thành một: lỗi thì hoàn tác cả gói. Dùng SAVEPOINT nên gọi lồng nhau được.
let transactionId = 0;
// Giao dịch ngoài cùng có kết nối riêng từ pg.Pool; giao dịch lồng trong cùng ngữ cảnh async dùng SAVEPOINT.
const insideTransaction = new AsyncLocalStorage();
const outermost = (write?) => insideTransaction.run(true, () => db.runTransaction(write));
async function transaction(write?) {
  if (insideTransaction.getStore()) return await savepoint(write);
  return await outermost(write);
}
async function savepoint(write?) {
  const name = `write_${++transactionId}`;
  await db.exec(`SAVEPOINT ${name}`);
  try {
    const value = await write();
    await db.exec(`RELEASE ${name}`);
    return value;
  } catch (error) {
    await db.exec(`ROLLBACK TO ${name}`);
    await db.exec(`RELEASE ${name}`);
    throw error;
  }
}
// Lỗi khi khởi động mà người vận hành phải tự xử lý: in hướng dẫn tiếng Việt rồi thoát, không in cả dòng stack.
function bootFail(lines?) {
  console.error(['', ...lines, ''].join('\n'));
  process.exit(1);
}

// nâng cấp DB cũ

// Admin duyệt KPI

// số lần lưu lịch khai, khoá lạc quan cho PUT /api/sheet (dòng cũ = 0)
// Số Admin sửa tay trên phiếu lương (theo người + tháng); chỉ Admin thấy, không đổi lịch / số ước tính

// phép năm: ngày đầu đi làm 'YYYY-MM-DD'
// phép năm: ngày sinh 'YYYY-MM-DD'
// phép năm: Admin cộng/trừ tay
// thuế TNCN: 'long' = HĐLĐ từ 3 tháng · 'short' = dưới 3 tháng / thử việc / vãng lai; null = mặc định theo loại nhân sự
// đóng BH bắt buộc (1/0); null = mặc định theo loại hợp đồng
// số người phụ thuộc đã đăng ký giảm trừ gia cảnh
// tên vị trí công việc (in trên phiếu lương)
// Admin bật/tắt cho từng người: khấu trừ thuế TNCN, giảm trừ gia cảnh, tạm ứng; null = có

// Khoá tài khoản thay cho xoá: locked_at null = đang hoạt động; session_version tăng thì mọi phiên đăng nhập cũ hết hiệu lực

// ca cố định tại lúc check-in; không sửa các dòng cũ
// ca của ngày tại lúc gửi yêu cầu
const withContext = (r?) =>
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

// KPI theo 5 thành phần. Chỉ thêm bảng, không đụng bảng cũ.
// Điểm lưu SỐ NGUYÊN theo phần trăm của điểm: điểm × 100 (87,5 điểm = 8750), từ 0 đến 10000, để phép tính không dùng số thực.
// Cột CHECK chặn cả số thập phân lọt vào (typeof phải là integer); khoá JSON ngoài API là user và self, cột đặt tên khác để tránh từ dễ nhầm.
const KPI_COLUMNS = { wework: 'wework', user: 'user_score', peer: 'peer', manager: 'manager', self: 'self_score' };
const KPI_KEYS = Object.keys(KPI_COLUMNS);
const KPI_SCORE_MAX = 10000;
const KPI_MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const kpiCheck = (column?) =>
  `${column} INTEGER CHECK (${column} IS NULL OR (typeof(${column}) = 'integer' AND ${column} >= 0 AND ${column} <= ${KPI_SCORE_MAX}))`;

// Lỗi có mã để server.js đổi thành mã HTTP 400. `field` là khoá gây lỗi (không chứa giá trị người dùng nhập).
function kpiError(code?, message?, field?) {
  return Object.assign(new Error(message), { code, ...(field ? { field } : {}) });
}
const rowToKpiScores = (r?) =>
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
const rowToKpiLog = (r?) => ({
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
function checkKpiMonth(month?) {
  if (typeof month !== 'string' || !KPI_MONTH_RE.test(month))
    throw kpiError('KPI_MONTH_INVALID', 'Tháng phải có dạng YYYY-MM');
}
// Gom và kiểm cả gói thay đổi trước khi ghi: một giá trị sai thì không ghi gì. Trả về [{ key, value }] (value null = xoá điểm).
function checkKpiPatch(patch?) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch))
    throw kpiError('KPI_EMPTY_PATCH', 'Không có điểm nào để lưu');
  const entries: any[] = [];
  for (const [key, value] of Object.entries<any>(patch)) {
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
let defaultContractResolver: any = null;
const setDefaultContractResolver = (fn?) => {
  defaultContractResolver = typeof fn === 'function' ? fn : null;
};
const defaultContract = async (type?) => {
  if (defaultContractResolver) {
    try {
      const v = await defaultContractResolver(type);
      if (v === 'short' || v === 'long') return v;
    } catch {
      // resolver lỗi: rơi về mặc định ở dưới
    }
  }
  return type === 'tts' ? 'short' : 'long';
};
const rowToStaff = async (r?) =>
  r &&
  (await (async () => {
    const contract = r.contract === 'long' || r.contract === 'short' ? r.contract : await defaultContract(r.type);
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
      leaveBalance: r.leave_balance ?? null, // số phép còn lại lưu sẵn (src/domain/leave), null = chưa tính
      leaveBalanceOn: r.leave_balance_on || null
    };
  })());
/* ===================== Kỳ lương, nhật ký, tham số, AI, vai trò =====================
 * Chỉ THÊM: bảng mới, chỉ mục, trigger, cột mới có mặc định. Không đổi, không xoá dòng hay cột nào đã có.
 * Khoá ngoại ĐANG BẬT: REFERENCES được PostgreSQL ép thật.
 * Mốc đánh dấu trong settings (chạy một lần, chạy lại không đổi gì): backend_v4_v1a_v1, staff_payroll_subject_v1.
 */
// Lỗi có mã cho server.js: code là mã lỗi (PERIOD_LOCKED, REASON_REQUIRED...), httpStatus là mã HTTP đề xuất, details là phần chi tiết
// KHÔNG chứa dữ liệu nhập tay (chỉ tháng, trạng thái, tên đăng nhập, số đếm).
function storeError(code?, message?, httpStatus = 400, details: any = undefined) {
  return Object.assign(new Error(message), { code, httpStatus, ...(details ? { details } : {}) });
}
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
// Nhận 'YYYY-MM' hoặc 'YYYY-MM-DD' (lấy tháng chứa ngày đó); khác thế là BAD_MONTH.
function monthOf(value?) {
  if (typeof value === 'string') {
    if (KPI_MONTH_RE.test(value)) return value;
    if (DATE_RE.test(value)) return value.slice(0, 7);
  }
  throw storeError('BAD_MONTH', 'Tháng phải có dạng YYYY-MM');
}
const safeParse = (text?, fallback: any = null) => {
  try {
    return text == null ? fallback : JSON.parse(text);
  } catch {
    return fallback;
  }
};
const REASON_MIN = 10;
const REASON_MAX = 300;
// Lý do không bắt buộc: nhận cả lý do rỗng hay ngắn và trả '' để lưu vào cột NOT NULL. Quá 300 ký tự là lỗi dữ liệu (storeError).
const softReason = (value?, code = 'REASON_REQUIRED') => {
  const fail = () => storeError(code, `Lý do tối đa ${REASON_MAX} ký tự`);
  return optionalReason(value, { max: REASON_MAX, tooLong: fail, code });
};
// Cột có CHECK (length BETWEEN 10 AND 300) (ai_finding_actions.note, param_versions.reason, pay_entries.reason) không lưu được chuỗi rỗng,
// và sửa CHECK tại chỗ đòi migration riêng. Khi thiếu lý do chỗ ghi dùng câu này;
// lý do quá ngắn thì nối thêm cho đủ 10 ký tự.
const NO_REASON_TEXT = 'Không ghi lý do';
const padReason = (text?) => {
  const t = typeof text === 'string' ? text.trim() : '';
  if (!t) return NO_REASON_TEXT;
  return t.length < REASON_MIN ? `${t} (không ghi thêm lý do)` : t;
};
const clampPage = (page?, pageSize?, fallbackSize = 50) => {
  const size = Math.min(200, Math.max(1, Math.trunc(Number(pageSize)) || fallbackSize));
  const index = Math.max(1, Math.trunc(Number(page)) || 1);
  return { limit: size, offset: (index - 1) * size, page: index, pageSize: size };
};

// Cột mới trên bảng có sẵn (dòng cũ nhận giá trị mặc định, không dòng nào bị viết lại)
// lý do sửa số (dòng có trước khi thêm cột: rỗng)
// khoá lạc quan cho PUT /api/slip-override
// 1 = nhân sự được trả lương; null = suy từ role (admin cũ = 0)
// Mã lô lưu: các khoá lưu trong CÙNG một lần bấm "Lưu" chung một mã, để hoàn tác cả lô.
// Dòng cũ (trước khi có cột) để null: không hoàn tác theo lô được, chỉ hoàn tác được từng khoá. Thêm cột không chạy trigger và không viết lại dòng nào.

// Chỉ mục cho các đường đọc của kỳ lương. Đo bằng scripts/db/perf-check.js (1.000 nhân sự, 200.000 dòng nhật ký, 20.000 dòng tham số):
// lọc nhật ký theo actor, action, loại thực thể hoặc tháng không có id cuối chỉ mục thì phải xếp lại cả tập khớp vì thứ tự (..., at) hay (entity_id, id) khác thứ tự
// id của câu hỏi (ORDER BY id DESC LIMIT 50); thêm id vào cuối cho phép đọc 50 dòng đầu rồi dừng. Danh sách này phải khớp CANDIDATES ở perf-check.js.

/* ---------- Nhật ký kiểm toán ---------- */
const AUDIT_SENSITIVITY = ['normal', 'pay', 'pii'];
const AUDIT_JSON_MAX = 65536; // chặn một dòng nhật ký phình vô hạn (ví dụ ném cả lịch vào before/after)
const auditKey = () => {
  const key = process.env.AUDIT_KEY;
  return typeof key === 'string' && key.length ? key : null;
};
// Chuỗi chuẩn hoá của một dòng (không gồm hash). Có id để lộ ra chỗ bị xoá, có prev_hash để nối chuỗi.
const auditCanonical = (r?) =>
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
function auditHash(row?, kind?, key?) {
  const text = auditCanonical(row);
  return kind === 'hmac-sha256'
    ? 'hmac-sha256:' + crypto.createHmac('sha256', key).update(text).digest('hex')
    : 'sha256:' + crypto.createHash('sha256').update(text).digest('hex');
}
const rowToAudit = (r?) => ({
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
// Bộ lọc của người gọi → tiêu chí chuẩn hoá cho AuditLogRepository (chuẩn hoá tháng, ngày; bỏ giá trị rỗng).
function auditFilter(f: any = {}) {
  const c: Record<string, any> = { equals: {} };
  const eq = (column?, value?) => {
    if (value !== undefined && value !== null && value !== '') c.equals[column] = String(value);
  };
  eq('actor', f.actor);
  eq('action', f.action);
  eq('subject', f.subject);
  eq('subject_uuid', f.subjectUuid);
  // person: { uuid, username } — mọi dòng về một người: dòng có uuid, cộng dòng cũ chưa có uuid ghi theo tài khoản (tài khoản không đổi được)
  if (f.person && typeof f.person === 'object' && f.person.uuid)
    c.person = { uuid: String(f.person.uuid), username: String(f.person.username || '') };
  if (f.month) c.equals.month = monthOf(f.month);
  // entity: 'loại' hoặc 'loại:id'; hoặc entityKind và entityId riêng (cái sau ghi đè nếu cùng có)
  if (typeof f.entity === 'string' && f.entity) {
    const [kind, ...rest] = f.entity.split(':');
    eq('entity_kind', kind);
    if (rest.length) eq('entity_id', rest.join(':'));
  }
  eq('entity_kind', f.entityKind);
  eq('entity_id', f.entityId);
  // from, to: chuỗi ISO UTC; chỉ có ngày thì from = đầu ngày UTC, to = cuối ngày UTC (muốn biên giờ Việt Nam thì truyền ISO đủ)
  if (f.from) c.from = DATE_RE.test(f.from) ? f.from + 'T00:00:00.000Z' : String(f.from);
  if (f.to) c.to = DATE_RE.test(f.to) ? f.to + 'T23:59:59.999Z' : String(f.to);
  // sensitivities: chỉ trả các mức này (lọc theo năng lực người xem); bỏ trống = mọi mức
  if (Array.isArray(f.sensitivities)) c.sensitivities = f.sensitivities.filter(s => AUDIT_SENSITIVITY.includes(s));
  if (f.afterId !== undefined && f.afterId !== null) c.afterId = Math.max(0, Math.trunc(Number(f.afterId)) || 0);
  if (f.beforeId !== undefined && f.beforeId !== null) c.beforeId = Math.max(0, Math.trunc(Number(f.beforeId)) || 0);
  return c;
}
const auditStore = {
  // Ghi một dòng, nối vào chuỗi băm. Gọi BÊN TRONG giao dịch của thao tác (store.transaction): lỗi ở đâu thì cả hai cùng hoàn tác.
  // Tham số: { actor, actorRoles?, action, entityKind, entityId, subject?, month?, before?, after?, reason?, sensitivity?, requestId? }.
  // before và after là giá trị JSON bất kỳ (đã lọc qua danh sách trường cho phép ở src/platform/audit.ts), lưu bằng JSON.stringify.
  // Trả về { id, hash }.
  async write(entry?) {
    const e = entry && typeof entry === 'object' ? entry : {};
    const text = (value?, field?, { required = false, max = 200 }: any = {}) => {
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
    const json = (value?, field?) => {
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
    const uuidOf = async (username?) => {
      if (!username) return null;
      const hit = await queryBuilder
        .selectFrom('staff')
        .select('uuid')
        .where('username', '=', username)
        .executeTakeFirst();
      return hit ? hit.uuid || null : null;
    };
    const subjectUuid = await uuidOf(fields.subject),
      actorUuid = await uuidOf(fields.actor);
    return await transaction(async () => {
      const last = await auditRepo.last();
      const row: Record<string, any> = { id: last ? last.id + 1 : 1, prev_hash: last ? last.hash : '', ...fields };
      const key = auditKey();
      row.hash = auditHash(row, key ? 'hmac-sha256' : 'sha256', key);
      await auditRepo.insert({ ...row, subject_uuid: subjectUuid, actor_uuid: actorUuid });
      return { id: row.id, hash: row.hash };
    });
  },
  // Danh sách có lọc, con trỏ theo id (tối đa 200 dòng). Mặc định mới nhất trước; afterId (id > N) cho thứ tự cũ → mới (con trỏ sự kiện).
  // Bộ lọc: actor, action, entity ('loại' | 'loại:id'), entityKind, entityId, subject, month, from, to, sensitivities, afterId, beforeId, limit, order ('asc'|'desc').
  async list(filter: any = {}) {
    const criteria = auditFilter(filter);
    const limit = Math.min(200, Math.max(1, Math.trunc(Number(filter.limit)) || 50));
    const order = filter.order === 'asc' || (filter.order === undefined && filter.afterId != null) ? 'asc' : 'desc';
    return (await auditRepo.list(criteria, order, limit)).map(rowToAudit);
  },
  // Đếm số dòng khớp bộ lọc. options.cap (số nguyên dương): dừng đếm ở cap, nên trả về tối đa cap (bảng nhiều trăm nghìn dòng đếm hết mất hàng chục
  // mili giây; màn hình chỉ cần "từ 10.000 dòng trở lên"). Không có cap thì đếm đủ.
  async count(filter: any = {}, options: any = {}) {
    const criteria = auditFilter({ ...filter, afterId: undefined, beforeId: undefined });
    const cap = Number.isSafeInteger(options.cap) && options.cap > 0 ? options.cap : null;
    return auditRepo.count(criteria, cap);
  },
  // Kiểu băm sẽ dùng cho dòng kế tiếp: 'hmac-sha256' khi có AUDIT_KEY, ngược lại 'sha256'.
  mode() {
    return auditKey() ? 'hmac-sha256' : 'sha256';
  },
  // Đi lại cả chuỗi. Trả về { ok, checked, firstBadId, reason, unverifiable }.
  // reason: PREV_HASH (đứt nối hoặc thiếu dòng), ID_GAP, HASH (nội dung bị sửa), AUDIT_KEY_MISSING (dòng HMAC mà thiếu khoá: kiểm được nối chuỗi, chưa kiểm được nội dung).
  async verify() {
    let prev = '',
      lastId: any = null,
      checked = 0,
      unverifiable = 0,
      cursor = 0;
    const key = auditKey();
    for (;;) {
      const rows = await auditRepo.pageAfter(cursor, 1000);
      if (!rows.length) break;
      for (const r of rows) {
        const bad = (reason?) => ({ ok: false, checked, firstBadId: r.id, reason, unverifiable });
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
const rowToParam = (r?) => ({
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
  async getMode() {
    const value = await module.exports.getSetting('params_mode', 'defaults-only');
    return value === 'active' ? 'active' : 'defaults-only';
  },
  // Dòng đang hiệu lực của MỖI khoá cho tháng M: effective_month lớn nhất ≤ M, hoà thì id lớn nhất.
  // Không xét params_mode: bộ máy tham số bỏ qua kết quả này khi 'defaults-only'.
  async resolvedRows(month?) {
    return (await paramVersionsRepo.resolved(monthOf(month))).map(rowToParam);
  },
  // Lịch sử một khoá (mới nhất trước) hoặc toàn bộ nếu bỏ key; afterId, limit tối đa 200.
  async history({ key, afterId, limit }: any = {}) {
    const filter: Record<string, any> = {};
    if (key) filter.key = String(key);
    if (afterId != null) filter.beforeId = Math.trunc(Number(afterId)) || 0;
    const rows = await paramVersionsRepo.history(filter, Math.min(200, Math.max(1, Math.trunc(Number(limit)) || 50)));
    return rows.map(rowToParam);
  },
  async count() {
    return paramVersionsRepo.count();
  },
  // Id dòng mới nhất: bảng chỉ được thêm dòng (trigger chặn sửa/xoá) nên id tăng ⇔ có thay đổi; dùng làm khoá bộ nhớ đệm tham số
  async lastId() {
    return paramVersionsRepo.lastId();
  },
  // Các dòng của một lô lưu (cùng batch_id), cũ → mới. Mã rỗng, không phải chuỗi hoặc không có lô thì trả mảng rỗng (dòng cũ có batch_id null không thuộc lô nào).
  async byBatch(batchId?) {
    if (typeof batchId !== 'string' || !batchId) return [];
    return (await paramVersionsRepo.byBatch(batchId)).map(rowToParam);
  }
};

/* ---------- Kỳ lương ---------- */
const PERIOD_STATES = ['open', 'attendance_locked', 'calculated', 'reviewed', 'approved', 'paid'];
const periodRank = (status?) => PERIOD_STATES.indexOf(status);
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
const rowToPeriod = (r?, month?) =>
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
const readPeriod = async (month?) => rowToPeriod(await periodsRepo.find(month), month);
// Cổng ghi tập trung: gọi ở MỖI route ghi. Tháng chưa có dòng luôn mở.
// Phạm vi lạ là lỗi lập trình (Error thường). Khoá thì ở MỌI trạng thái (cả đã duyệt, đã chi trả) vẫn ghi và chỉ cảnh báo PERIOD_LOCKED { month, status, scope }.
const PERIOD_STATUS_TEXT = {
  attendance_locked: 'đã chốt công',
  calculated: 'đã tính lương',
  reviewed: 'đã qua bước kiểm tra cũ (đã bỏ)',
  approved: 'đã duyệt',
  paid: 'đã chi trả'
};
async function assertPeriodOpen(month?, scope?) {
  if (!Object.hasOwn(SCOPE_LOCKED_FROM, scope)) throw new Error(`Phạm vi khoá kỳ không hợp lệ: ${scope}`);
  const m = monthOf(month);
  const row = await periodsRepo.find(m);
  const locked = !!row && periodRank(row.status) >= periodRank(SCOPE_LOCKED_FROM[scope]);
  const details = locked ? { month: m, status: row.status, scope } : undefined;
  warnIf('PERIOD_LOCKED', locked, {
    details,
    message: () =>
      `Kỳ lương ${m} ${PERIOD_STATUS_TEXT[row.status] || 'đã khoá'}: dữ liệu vừa lưu có thể không còn khớp số đã tính hay phiếu đã duyệt, cần tính lại kỳ`
  });
}
function checkRev(rev?) {
  if (!Number.isSafeInteger(rev) || rev < 0) throw storeError('BAD_REV', 'Thiếu số phiên bản (rev) của kỳ');
}
// Kiểm tháng, tháng có được quản lý, rev khớp; trả về dòng hiện có (hoặc undefined nếu kỳ chưa có dòng).
async function loadPeriodForChange(monthArg?, rev?) {
  const month = monthOf(monthArg);
  checkRev(rev);
  const row = await periodsRepo.find(month);
  const current = row ? row.rev : 0;
  if (rev !== current)
    throw storeError('PERIOD_STALE', 'Kỳ đã được người khác đổi, tải lại rồi làm lại', 409, { month, rev: current });
  return { month, row };
}
function stateError(month?, status?, expected?, to?) {
  return storeError('PERIOD_STATE', 'Kỳ không ở trạng thái cho phép làm bước này', 409, {
    month,
    status,
    expected,
    to
  });
}
// Đổi trạng thái một bước: kiểm rev rồi trạng thái hiện tại thuộc `from`; ghi bước mới; rev + 1.
// `extra` là các cột bổ sung (đã nằm trong STAGE_COLUMNS hoặc current_run_id). Gọi trong giao dịch của người gọi.
async function advancePeriod(monthArg, rev, { from, to, by, extra = {}, clearAfter = false }: any) {
  return await transaction(async () => {
    const { month, row } = await loadPeriodForChange(monthArg, rev);
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
      for (const [stage, columns] of Object.entries<any>(STAGE_COLUMNS))
        if (periodRank(stage) > periodRank(to)) for (const c of columns) set[c] = null;
    if (!row) await periodsRepo.insertOpen(month);
    await periodsRepo.update(month, set);
    return await readPeriod(month);
  });
}
const requireBy = (by?) => {
  if (typeof by !== 'string' || !by) throw storeError('BAD_ARGS', 'Thiếu người thực hiện', 500);
  return by;
};
const periodsStore = {
  // Trạng thái hiệu lực của một tháng; tháng chưa có dòng là 'open'.
  get: async (month?) => await readPeriod(monthOf(month)),
  status: async (month?) => (await readPeriod(monthOf(month))).status,
  // Chỉ các tháng ĐÃ có dòng trong năm đó (service điền nốt đủ 12 tháng).
  async list({ year }: any = {}) {
    const rows = await periodsRepo.list(year ? Number(year) : undefined);
    return rows.map(r => rowToPeriod(r, r.month));
  },
  // Chốt công: open → attendance_locked. rev là rev đang thấy (0 nếu kỳ chưa có dòng). Danh sách kiểm do src/domain/period/periods.ts làm.
  lockAttendance: async (month, { rev, by }: any) =>
    await advancePeriod(month, rev, { from: ['open'], to: 'attendance_locked', by: requireBy(by) }),
  // Tính lương: attendance_locked | calculated | reviewed → calculated, gắn lần chạy hiện hành (runId phải là lần chạy nháp của đúng tháng).
  // Gọi cùng giao dịch với payroll.createRun, addPayslip, finishRun. Bước reviewed bị xoá (phải duyệt AI lại).
  async markCalculated(month, { rev, by, runId }: any) {
    return await transaction(async () => {
      const run = await payrollStore.getRun(runId);
      if (!run || run.month !== monthOf(month) || run.status !== 'draft')
        throw storeError('RUN_INVALID', 'Lần chạy lương không thuộc tháng này hoặc không còn là bản nháp', 409);
      return await advancePeriod(month, rev, {
        from: ['attendance_locked', 'calculated', 'reviewed'],
        to: 'calculated',
        by: requireBy(by),
        extra: { current_run_id: runId },
        clearAfter: true
      });
    });
  },
  // Duyệt kỳ: reviewed hoặc calculated (chưa qua AI kiểm tra, cảnh báo PERIOD_STATE) → approved. Phiếu lỗi được loại ra qua
  // excludeErrors: [{ username, reason }]. Phiếu draft và pending còn lại được duyệt luôn trong cùng giao dịch
  // (người duyệt là người bấm, ghi chú rỗng), phiếu lỗi chưa loại tự loại với lý do ''; cả hai vào cảnh báo PERIOD_NOT_READY.
  // Trong cùng giao dịch: đóng băng số sửa phiếu vào payslips.override_json rồi đặt lần chạy thành 'final'.
  async approve(month, { rev, by, excludeErrors = [] }: any) {
    requireBy(by);
    return await transaction(async () => {
      const { month: m } = await loadPeriodForChange(month, rev);
      const period = await readPeriod(m);
      if (period.status !== 'reviewed' && period.status !== 'calculated')
        throw stateError(m, period.status, ['calculated'], 'approved');
      const run = period.currentRunId == null ? null : await payrollStore.getRun(period.currentRunId);
      if (!run || run.status !== 'draft')
        throw storeError('PERIOD_NOT_READY', 'Chưa có lần tính lương hiện hành để duyệt', 409, { month: m });
      const excluded = new Map<any, any>();
      for (const item of Array.isArray(excludeErrors) ? excludeErrors : []) {
        if (!item || typeof item.username !== 'string') throw storeError('BAD_ARGS', 'excludeErrors sai dạng');
        excluded.set(item.username, softReason(item.reason));
      }
      const open = (await payslipsRepo.unapproved(run.id)).filter(
        p => !(p.status === 'error' && excluded.has(p.username))
      );
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
      for (const p of unapproved) await payslipsRepo.approveWithPeriod(run.id, p.username, by, t);
      for (const p of errored) excluded.set(p.username, '');
      for (const [username, reason] of excluded) await payslipsRepo.excludeError(run.id, username, reason, by, t);
      await freezeOverrides(run);
      await runsRepo.markFinal(run.id);
      return await advancePeriod(m, rev, { from: ['calculated', 'reviewed'], to: 'approved', by });
    });
  },
  // Chi trả: approved → paid. paidAt là ngày 'YYYY-MM-DD' hoặc ISO; reference tuỳ chọn (tối đa 100 ký tự). Kỳ đã chi trả không mở lại.
  async markPaid(month, { rev, by, paidAt, reference }: any) {
    const at =
      typeof paidAt === 'string' && (DATE_RE.test(paidAt) || !Number.isNaN(Date.parse(paidAt))) ? paidAt : null;
    if (!at) throw storeError('BAD_PAID_AT', 'Ngày chi trả không hợp lệ');
    const ref = reference == null || reference === '' ? null : String(reference).slice(0, 100);
    return await advancePeriod(month, rev, {
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
  async reopen(month, { rev, by, to, reason }: any) {
    requireBy(by);
    if (!['open', 'attendance_locked', 'calculated'].includes(to))
      throw storeError('BAD_TARGET', 'Chỉ mở lại về: open, attendance_locked hoặc calculated');
    softReason(reason);
    return await transaction(async () => {
      const { month: m, row } = await loadPeriodForChange(month, rev);
      const status = row ? row.status : 'open';
      const expected = PERIOD_STATES.filter(s => periodRank(s) > periodRank(to) && s !== 'paid');
      if (periodRank(status) <= periodRank(to) || !row) throw stateError(m, status, expected, to);
      warnIf('PERIOD_STATE', status === 'paid', {
        details: { month: m, status, expected, to },
        message: `Kỳ ${m} đã chi trả: mở lại không rút được tiền đã chuyển; khi chi trả lại cần bù trừ phần chênh với kế toán`
      });
      await runsRepo.supersede(m, ['draft', 'final']);
      return await advancePeriod(m, rev, {
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
const plainObjectOrNull = (value?) => (value && typeof value === 'object' && !Array.isArray(value) ? value : null);
const rowToRun = (r?, { params = false }: any = {}) =>
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
const rowToPayslip = (r?, { snapshot = false }: any = {}) =>
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
async function freezeOverrides(run?) {
  for (const p of await payslipsRepo.idsOf(run.id)) {
    const o = await slipOverridesRepo.find(p.username, run.month);
    const values = o ? safeParse(o.values_json, {}) : {};
    if (!Object.keys(values).length) continue;
    await payslipsRepo.setOverride(
      p.id,
      JSON.stringify({
        values,
        reason: o.reason ?? null,
        rev: o.rev ?? 1,
        updatedBy: o.updated_by ?? null,
        updatedAt: o.updated_at
      })
    );
  }
}
const payrollStore = {
  // Tạo lần chạy mới ở trạng thái 'draft' (run_no = lớn nhất + 1); các lần chạy nháp trước của tháng thành 'superseded'.
  // Cần kỳ đang ở attendance_locked | calculated | reviewed. Tham số: { engineVersion, paramsHash, paramsRev, params, switches, inputsDigest?, by }.
  // Gọi trong giao dịch cùng addPayslip, finishRun và periods.markCalculated.
  async createRun(monthArg?, o: any = {}) {
    const month = monthOf(monthArg);
    const bad = (field?) => storeError('BAD_ARGS', `Lần chạy lương thiếu hoặc sai ${field}`, 500);
    if (typeof o.engineVersion !== 'string' || !o.engineVersion) throw bad('engineVersion');
    if (typeof o.paramsHash !== 'string' || !o.paramsHash) throw bad('paramsHash');
    if (!Number.isSafeInteger(o.paramsRev) || o.paramsRev < 0) throw bad('paramsRev');
    if (!o.params || typeof o.params !== 'object') throw bad('params');
    if (!o.switches || typeof o.switches !== 'object') throw bad('switches');
    requireBy(o.by);
    return await transaction(async () => {
      const period = await readPeriod(month);
      if (!['attendance_locked', 'calculated', 'reviewed'].includes(period.status))
        throw stateError(month, period.status, ['attendance_locked', 'calculated', 'reviewed'], 'calculated');
      await runsRepo.supersede(month, ['draft']);
      const id = await runsRepo.insert({
        month,
        run_no: await runsRepo.nextRunNo(month),
        status: 'draft',
        engine_version: o.engineVersion,
        params_hash: o.paramsHash,
        params_rev: o.paramsRev,
        params_json: JSON.stringify(o.params),
        switches_json: JSON.stringify(o.switches),
        inputs_digest: o.inputsDigest ?? null,
        created_by: o.by,
        created_at: now()
      });
      return await payrollStore.getRun(id);
    });
  },
  // Thêm một phiếu vào lần chạy nháp. Tham số: { username, status: 'draft' | 'error', errorCode?, errorDetail?, gross, insurance, tax, advance, net
  // (đồng nguyên; null khi lỗi), staffTerms (đối tượng), snapshot (đối tượng, nén gzip), flags? (mảng mã) }.
  async addPayslip(runId?, p: any = {}) {
    const run = await payrollStore.getRun(runId);
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
    return await payslipsRepo.insert({
      run_id: runId,
      username: p.username,
      status: p.status,
      error_code: p.errorCode ?? null,
      error_detail: p.errorDetail == null ? null : String(p.errorDetail).slice(0, 300),
      gross: p.gross ?? null,
      insurance: p.insurance ?? null,
      tax: p.tax ?? null,
      advance: p.advance ?? null,
      net: p.net ?? null,
      staff_terms_json: JSON.stringify(p.staffTerms),
      snapshot_gz: zlib.gzipSync(JSON.stringify(p.snapshot)),
      flags_json: flags
    });
  },
  // Ghi số đếm khi tính xong (chỉ lần chạy nháp). Trả về lần chạy.
  async finishRun(runId, { total, errors }: any) {
    const run = await payrollStore.getRun(runId);
    if (!run || run.status !== 'draft') throw storeError('RUN_INVALID', 'Lần chạy lương không còn là bản nháp', 409);
    await runsRepo.finish(runId, total, errors, now());
    return await payrollStore.getRun(runId);
  },
  getRun: async (id?, opts?) => rowToRun(await runsRepo.find(id), opts),
  // Lần chạy hiện hành của kỳ (period.current_run_id); null nếu chưa tính hoặc vừa mở lại.
  async currentRun(month?, opts?) {
    const period = await readPeriod(monthOf(month));
    return period.currentRunId == null ? null : await payrollStore.getRun(period.currentRunId, opts);
  },
  getPayslip: async (runId?, username?, opts?) => rowToPayslip(await payslipsRepo.find(runId, username), opts),
  // Phiếu CHÍNH THỨC của một người ở một tháng: từ lần chạy 'final' (kỳ đã duyệt) mới nhất; null nếu chưa có (tháng trước cho luật so sánh).
  async finalPayslip(username?, month?, opts?) {
    return rowToPayslip(await payslipsRepo.finalOf(username, monthOf(month)), opts);
  },
  // Danh sách phiếu của một lần chạy, có phân trang; không trả bản chụp. Bộ lọc: status, type (loại nhân sự đã chụp trong staff_terms_json,
  // lọc bằng json_extract trong SQL nên không cần cột riêng và dòng cũ vẫn lọc được), q (username hoặc tên), flagged (true/false), page, pageSize (≤ 200).
  async listPayslips(runId?, { status, type, q, flagged, page, pageSize }: any = {}) {
    const like = q ? '%' + String(q).replace(/[\\%_]/g, c => '\\' + c) + '%' : undefined;
    const paging = clampPage(page, pageSize);
    const { total, rows } = await payslipsRepo.page(
      runId,
      { status: status || undefined, type: type ? String(type) : undefined, like, flagged },
      paging.limit,
      paging.offset
    );
    return { total, page: paging.page, pageSize: paging.pageSize, rows: rows.map(r => rowToPayslip(r)) };
  },
  async countPayslips(runId?) {
    const counts = { draft: 0, pending: 0, approved: 0, error: 0, total: 0 };
    for (const r of await payslipsRepo.countByStatus(runId)) {
      counts[r.status] = r.n;
      counts.total += r.n;
    }
    return counts;
  },
  // Duyệt hoặc trả lại phiếu: items [{ username, rev }] tối đa 200, CẢ LÔ HOẶC KHÔNG; action 'approve' | 'return'; note tuỳ chọn.
  // approve: phiếu không lỗi (PAYSLIP_ERROR luôn chặn); duyệt được phiếu 'draft' (chưa qua AI, cảnh báo PAYSLIP_STATE) và phiếu có cờ AI
  // cả lô lẫn riêng lẻ (cảnh báo PAYSLIP_FLAGGED), note tuỳ chọn; phiếu đã duyệt gửi lại thì giữ nguyên (không đổi rev hay người duyệt).
  // return: đưa phiếu về 'draft', note tuỳ chọn.
  // Máy chủ còn phải kiểm "không tự duyệt phiếu của mình" (SELF_DECISION_FORBIDDEN) ở route, vì cần biết người duyệt.
  async decidePayslips(runId, { items, action, note, by }: any) {
    requireBy(by);
    if (!['approve', 'return'].includes(action)) throw storeError('BAD_ARGS', 'action phải là approve hoặc return');
    if (!Array.isArray(items) || !items.length || items.length > 200)
      throw storeError('BAD_ARGS', 'Cần từ 1 đến 200 phiếu mỗi lần');
    const text = note == null || note === '' ? null : String(note).trim();
    if (text !== null && text.length > REASON_MAX) throw storeError('NOTE_TOO_LONG', 'Ghi chú quá dài');
    return await transaction(async () => {
      const run = await payrollStore.getRun(runId);
      if (!run || run.status !== 'draft')
        throw storeError('PERIOD_STATE', 'Lần chạy này đã chốt hoặc bị thay thế', 409, { runId });
      const seen = new Set<any>();
      const rows = await AsyncList.map(items, async item => {
        if (!item || typeof item.username !== 'string' || !Number.isSafeInteger(item.rev))
          throw storeError('BAD_ARGS', 'Mỗi phiếu cần username và rev');
        if (seen.has(item.username)) throw storeError('BAD_ARGS', 'Phiếu bị lặp trong lô');
        seen.add(item.username);
        const row = await payslipsRepo.find(runId, item.username);
        if (!row)
          throw storeError('PAYSLIP_NOT_FOUND', 'Không có phiếu này trong lần chạy', 404, { username: item.username });
        if (row.rev !== item.rev)
          throw storeError('PAYSLIP_STALE', 'Phiếu đã đổi, tải lại rồi làm lại', 409, {
            username: item.username,
            rev: row.rev
          });
        return row;
      });
      const flaggedOf = (r?) => safeParse(r.flags_json, []) || [];
      if (action === 'approve') {
        const errors = rows.filter(r => r.status === 'error');
        if (errors.length)
          throw storeError('PAYSLIP_ERROR', 'Phiếu lỗi không duyệt được', 409, {
            items: errors.map(r => ({ username: r.username }))
          });
        const wrong = await AsyncList.filter(rows, async r => r.status !== 'pending' && r.status !== 'draft');
        const stateItems = wrong.map(r => ({ username: r.username, status: r.status }));
        warnIf('PAYSLIP_STATE', wrong.length > 0, {
          count: wrong.length,
          details: { items: stateItems },
          message: () => `${wrong.length} phiếu đã duyệt từ trước, giữ nguyên`
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
      const t = now();
      return await AsyncList.map(rows, async r => {
        if (action === 'approve' && r.status === 'approved')
          return { username: r.username, status: 'approved', rev: r.rev };
        await payslipsRepo.decide(r.id, next, by, t, text);
        return { username: r.username, status: next, rev: r.rev + 1 };
      });
    });
  }
};

/* ---------- Vai trò theo năng lực ---------- */
// Vai trò chỉ là TÊN ở đây; tập năng lực của từng vai trò nằm trong mã (src/platform/authz.ts → ROLE_CAPS), không nằm trong DB.
// staff.role = 'admin' (tài khoản cũ) vẫn nghĩa là có vai trò admin: không cần dòng staff_roles.
const ROLE_RE = /^[a-z][a-z_]{1,31}$/;
const rowToRole = (r?) => ({
  id: r.id,
  username: r.username,
  role: r.role,
  grantedBy: r.granted_by,
  grantedAt: r.granted_at,
  revokedAt: r.revoked_at ?? null
});
const activeRoleRow = async (username?, role?) => await staffRolesRepo.activeRow(username, role);
const rolesStore = {
  // Gán một vai trò (đã gán còn hiệu lực thì trả về dòng cũ, created: false). Tài khoản phải có thật (ROLE_USER_UNKNOWN, 404).
  async grant(username?, role?, by?) {
    requireBy(by);
    if (typeof role !== 'string' || !ROLE_RE.test(role)) throw storeError('ROLE_UNKNOWN', 'Tên vai trò không hợp lệ');
    if (!(await staffRepo.exists(username))) throw storeError('ROLE_USER_UNKNOWN', 'Không có tài khoản này', 404);
    return await transaction(async () => {
      const current = await activeRoleRow(username, role);
      if (current) return { ...rowToRole(current), created: false };
      const id = await staffRolesRepo.insert(username, role, by, now());
      return { ...rowToRole(await staffRolesRepo.find(id)), created: true };
    });
  },
  // Thu hồi (đặt revoked_at). Trả về true nếu có vai trò còn hiệu lực. Không kiểm "admin cuối cùng" (route kiểm trước khi gọi).
  async revoke(username?, role?) {
    return (await staffRolesRepo.revoke(username, role, now())) > 0;
  },
  // Vai trò đã gán còn hiệu lực (không gồm admin suy từ staff.role, không gồm 'staff' mặc định).
  activeRoles: async (username?) => await staffRolesRepo.activeRoles(username),
  // Vai trò hiệu lực: các vai trò đã gán, cộng 'admin' nếu staff.role = 'admin'. Tài khoản bị khoá không có vai trò nào.
  async effectiveRoles(username?) {
    const staff = await staffRepo.roleAndLock(username);
    if (!staff || staff.locked_at) return [];
    const roles = new Set<any>(await rolesStore.activeRoles(username));
    if (staff.role === 'admin') roles.add('admin');
    return [...roles].sort();
  },
  // Danh sách dòng gán; includeRevoked để xem cả lịch sử.
  async list({ username, role, includeRevoked }: any = {}) {
    return (await staffRolesRepo.list({ username, role, includeRevoked })).map(rowToRole);
  },
  // Số tài khoản (chưa khoá) đang có một vai trò, gồm cả staff.role = 'admin' khi hỏi 'admin'.
  async countRole(role?) {
    if (role !== 'admin') return await staffRolesRepo.countAssigned(role);
    return await staffRolesRepo.countAdmins();
  },
  countAdmins: async () => await rolesStore.countRole('admin')
};

module.exports = {
  db,
  queryBuilder,
  repos: {
    params: paramVersionsRepo,
    periods: periodsRepo,
    staff: staffRepo,
    corrections: correctionsRepo,
    advanceApprovals: advanceApprovalsRepo
  },
  transaction,
  // Khoá tư vấn theo khoá nghiệp vụ tới hết giao dịch (xem src/data/locks.ts): gọi đầu giao dịch "đọc rồi mới chèn"
  lock: (key?) => locks.acquire(key),
  setDefaultContractResolver,
  async listStaff() {
    return await AsyncList.map(await staffRepo.all(), rowToStaff);
  },
  async getStaff(u?) {
    return await rowToStaff(await staffRepo.find(u));
  },
  async getStaffRow(u?) {
    return await staffRepo.find(u);
  },
  // Số phiên bản phiên đăng nhập; cố ý không nằm trong đối tượng nhân sự thường (không để lọt ra API). null nếu không có tài khoản.
  async getSessionVersion(u?) {
    const version = await staffRepo.sessionVersion(u);
    return version === null ? null : version || 0;
  },
  // contractStatus / resignedOn: undefined = giữ giá trị đang lưu, null = xoá. Họ/tên tách từ name; familyName + givenName chỉ được dùng khi
  // ghép lại đúng bằng name (Admin nhập riêng tên hai chữ), lệch thì name mới thắng (đổi tên mà còn họ/tên cũ trong đối tượng).
  async upsertStaff(s?, { insertOnly = false }: any = {}) {
    const flag = (v?) => (v == null ? null : v ? 1 : 0);
    const given = PersonName.from({ familyName: s.familyName, givenName: s.givenName });
    const parts = given.fullName && given.fullName === titleCase(s.name) ? given : PersonName.parse(s.name);
    // Ca cố định luôn lưu mã mới (Normal1 …); người gọi còn gửi mã cũ (n1 …) thì đổi theo bảng work_shifts, mã lạ giữ nguyên
    const shift = s.shiftCode ? await staffRepo.shiftByCodeOrPreset(s.shiftCode) : null;
    return await staffRepo.upsert(
      {
        username: s.username,
        name: s.name,
        role: s.role,
        type: s.type,
        level: s.level,
        night_pct: s.nightPct ?? null,
        idorm: s.idorm ? 1 : 0,
        shift_code: shift ? shift.code : (s.shiftCode ?? null),
        pass_hash: s.passHash,
        created_at: s.createdAt || now(),
        start_date: s.startDate ?? null,
        birthday: s.birthday ?? null,
        leave_adjust: Number(s.leaveAdjust) || 0,
        contract: s.contract === 'long' || s.contract === 'short' ? s.contract : null,
        insured: flag(s.insured),
        dependants: Math.max(0, Math.trunc(Number(s.dependants) || 0)),
        tax_on: flag(s.taxOn),
        deduct_on: flag(s.deductOn),
        advance_on: flag(s.advanceOn),
        job_title: s.jobTitle ? String(s.jobTitle) : null,
        // Dòng mới: mặc định theo role (admin = 0, còn lại = 1); dòng cũ: chỉ đổi khi người gọi nêu rõ payrollSubject
        payroll_subject: s.payrollSubject == null ? (s.role === 'admin' ? 0 : 1) : flag(s.payrollSubject),
        uuid: crypto.randomUUID(), // chỉ dùng khi thêm mới; dòng đã có giữ uuid cũ
        family_name: parts.familyName,
        given_name: parts.givenName || null,
        contract_status: s.contractStatus === 'probation' || s.contractStatus === 'official' ? s.contractStatus : null,
        resigned_on: typeof s.resignedOn === 'string' && s.resignedOn ? s.resignedOn : null
      },
      {
        payrollSubjectOverride: flag(s.payrollSubject),
        keepContractStatus: s.contractStatus === undefined,
        keepResignedOn: s.resignedOn === undefined
      },
      { insertOnly }
    );
  },
  // tất cả bảng chấm công của một người (để đếm ngày nghỉ phép năm qua các tháng)
  async listSheets(u?) {
    return (await timesheetsRepo.listOf(u)).map(r => ({
      month: r.month,
      days: JSON.parse(r.days_json)
    }));
  },
  // check-in / check-out
  async addPunch(u?, at?, type?, ip?, auto?, context?, sessionId: any = null) {
    await punchesRepo.insert({
      username: u,
      at,
      type,
      ip: ip || null,
      auto: auto ? 1 : 0,
      context_json: context ? JSON.stringify(context) : null,
      session_id: sessionId
    });
  },
  // Ghi bảng điều chỉnh giờ: máy chủ không gọi (không có tính năng sửa giờ Check-in/out; bảng chỉ còn được đọc).
  // addCorrection/decideCorrection dùng cho công cụ dữ liệu demo và test dựng dòng lịch sử.
  // Gửi lại cho cùng ngày thì yêu cầu cũ đang chờ chuyển sang 'replaced'
  async addCorrection(c?) {
    await correctionsRepo.replacePending(
      c.sessionId ? { sessionId: c.sessionId } : { username: c.username, date: c.date }
    );
    return await correctionsRepo.insert({
      username: c.username,
      date: c.date,
      req_in: c.reqIn,
      req_out: c.reqOut,
      reason: c.reason,
      created_at: now(),
      context_json: JSON.stringify(c.context || { plannedShift: c.plannedShift || null }),
      session_id: c.sessionId ?? null,
      session_version: c.sessionVersion ?? null
    });
  },
  async getCorrection(id?) {
    return withContext(await correctionsRepo.find(id));
  },
  async listCorrections(options: any = {}) {
    const page = options.limit === undefined ? undefined : { limit: options.limit, offset: options.offset || 0 };
    return (await correctionsRepo.list(options, page)).map(withContext);
  },
  async decideCorrection(id?, status?, by?, note?, reqIn?, reqOut?, effectiveDate?) {
    await correctionsRepo.decide(id, {
      status,
      by,
      at: now(),
      note: note || null,
      reqIn: reqIn || null,
      reqOut: reqOut || null,
      date: effectiveDate || null
    });
  },
  async setPassword(u?, passHash?) {
    await staffRepo.setPassword(u, passHash);
  },
  // Khoá thay cho xoá: giữ nguyên lịch sử lương, tăng session_version để mọi phiên đăng nhập đang mở hết hiệu lực.
  // Trả về true nếu có đổi (tài khoản có thật và chưa bị khoá).
  async lockStaff(u?, by?) {
    return await staffRepo.lock(u, by || null, now());
  },
  // Mở khoá: không tăng session_version, phiên cũ đã hết hiệu lực từ lúc khoá. Trả về true nếu có đổi.
  async unlockStaff(u?) {
    return await staffRepo.unlock(u);
  },
  // Làm mọi phiên đăng nhập của người này hết hiệu lực (ví dụ sau khi đổi mật khẩu). Trả về số phiên bản mới, null nếu không có tài khoản.
  async bumpSessionVersion(u?) {
    return await staffRepo.bumpSessionVersion(u);
  },
  async getSheet(u?, month?) {
    const r = await timesheetsRepo.find(u, month);
    return {
      days: r ? JSON.parse(r.days_json) : {},
      kpiPct: r && r.kpi_pct != null ? r.kpi_pct : null,
      kpiAmt: r && r.kpi_amt != null ? r.kpi_amt : null,
      kpiAdmPct: r && r.kpi_adm_pct != null ? r.kpi_adm_pct : null,
      kpiAdmAmt: r && r.kpi_adm_amt != null ? r.kpi_adm_amt : null,
      rev: r ? r.rev : 0
    };
  },
  async setSheet(u?, month?, days?, kpiPct?, kpiAmt?) {
    await timesheetsRepo.upsertSheet(u, month, JSON.stringify(days), kpiPct ?? null, kpiAmt ?? null, now());
  },
  async setKpiApproval(u?, month?, pct?, amt?) {
    await timesheetsRepo.upsertKpiApproval(u, month, pct ?? null, amt ?? null, now());
  },
  async getSlipOverride(u?, month?) {
    const r = await slipOverridesRepo.find(u, month);
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
  async setSlipOverride(u?, month?, values?, by?, reason?, opts: any = {}) {
    return await transaction(async () => {
      const current = await module.exports.getSlipOverride(u, month);
      if (opts.expectedRev !== undefined && opts.expectedRev !== current.rev)
        throw storeError('SLIP_STALE', 'Số sửa trên phiếu đã được người khác đổi, tải lại rồi làm lại', 409, {
          rev: current.rev
        });
      if (!Object.keys(values).length && current.rev === 0) return current; // chưa có gì để bỏ
      await slipOverridesRepo.upsert(
        u,
        month,
        JSON.stringify(values),
        by || null,
        now(),
        reason == null ? null : String(reason)
      );
      return await module.exports.getSlipOverride(u, month);
    });
  },
  // Điểm KPI 5 thành phần. Điểm là số nguyên điểm × 100 (0 đến 10000), null = chưa nhập.
  // Dòng trả về: { username, month, scores: { wework, user, peer, manager, self }, complete, createdBy, createdAt, updatedBy, updatedAt }.
  // null nếu người này chưa có dòng điểm nào ở tháng đó.
  async getKpiScores(u?, month?) {
    checkKpiMonth(month);
    return rowToKpiScores(await kpiScoresRepo.find(u, month));
  },
  async listKpiScores(month?) {
    checkKpiMonth(month);
    return (await kpiScoresRepo.listMonth(month)).map(rowToKpiScores);
  },
  // Lưu một phần điểm (patch: khoá vắng = giữ nguyên, null = xoá điểm đó) kèm nhật ký, trong MỘT giao dịch.
  // patch gồm wework, user, peer, manager, self (số nguyên 0..10000) và amt (mức KPI đã duyệt, đồng; ghi vào timesheets.kpi_adm_amt,
  // không đụng kpi_adm_pct). Mỗi giá trị thật sự đổi thêm một dòng nhật ký (cũ, mới, người sửa); giá trị không đổi thì không ghi gì.
  // Trả về { item, changed }: item là getKpiScores sau khi ghi (null nếu chưa có dòng điểm), changed là danh sách khoá đã đổi.
  // Lỗi có mã err.code: KPI_MONTH_INVALID, KPI_KEY_UNKNOWN, KPI_SCORE_INVALID, KPI_AMT_INVALID, KPI_EMPTY_PATCH, KPI_ARGS_INVALID.
  async setKpiScores(u?, month?, patch?, by?, reason?) {
    checkKpiMonth(month);
    if (typeof u !== 'string' || !u) throw kpiError('KPI_ARGS_INVALID', 'Thiếu tên đăng nhập', 'user');
    if (typeof by !== 'string' || !by) throw kpiError('KPI_ARGS_INVALID', 'Thiếu người sửa điểm', 'by');
    const entries = checkKpiPatch(patch);
    const why = reason == null || String(reason).trim() === '' ? null : String(reason).trim();
    return await transaction(async () => {
      await locks.acquire(`kpi:${u}:${month}`); // hai lần ghi cùng (người, tháng) xếp hàng: không cùng thấy "chưa có dòng"
      const t = now();
      const current = await kpiScoresRepo.find(u, month);
      const sheet = await timesheetsRepo.find(u, month);
      const changes: any[] = [];
      for (const { key, value } of entries) {
        const before = key === 'amt' ? (sheet ? sheet.kpi_adm_amt : null) : current ? current[KPI_COLUMNS[key]] : null;
        if (before !== value) changes.push({ key, before: before ?? null, after: value });
      }
      const scoreChanges = changes.filter(c => c.key !== 'amt');
      if (scoreChanges.length) {
        const columns = Object.fromEntries(scoreChanges.map(c => [KPI_COLUMNS[c.key], c.after]));
        if (current) await kpiScoresRepo.update(u, month, columns, by, t);
        else await kpiScoresRepo.insert(u, month, columns, by, t);
      }
      const amt = changes.find(c => c.key === 'amt');
      if (amt) await timesheetsRepo.upsertKpiAdmAmt(u, month, amt.after, t);
      for (const c of changes)
        await kpiScoresRepo.log({
          username: u,
          month,
          field: c.key,
          old_value: c.before,
          new_value: c.after,
          by,
          at: t,
          reason: why
        });
      return {
        item: rowToKpiScores(await kpiScoresRepo.find(u, month)),
        changed: changes.map(c => c.key)
      };
    });
  },
  // Nhật ký sửa điểm, cũ nhất trước. Lọc theo username và/hoặc month; limit tuỳ chọn.
  async listKpiScoreLog({ username, month, limit }: any = {}) {
    if (month) checkKpiMonth(month);
    const rows = await kpiScoresRepo.listLog(
      { username: username || undefined, month: month || undefined },
      limit !== undefined ? Math.max(0, Math.trunc(Number(limit)) || 0) : undefined
    );
    return rows.map(rowToKpiLog);
  },
  // getSetting/setSetting dưới đây cũng là chỗ src/params/config-rev.ts giữ số phiên bản chung của cấu hình: khoá settings.config_rev (số nguyên, vắng = 0),
  // tăng bằng setSetting TRONG store.transaction của thao tác đổi cấu hình. Không có bảng hay cột riêng cho nó.
  async getSetting(key?, fallback?) {
    return await settingsRepo.get(key, fallback);
  },
  async setSetting(key?, value?) {
    await settingsRepo.set(key, value);
  }
};
Object.assign(module.exports, {
  // Kỳ lương, nhật ký, tham số, AI, vai trò: xem chú thích khối cùng tên phía trên
  audit: auditStore,
  params: paramsStore,
  periods: periodsStore,
  payroll: payrollStore,
  roles: rolesStore,
  assertPeriodOpen,
  // Lý do cho cột có CHECK 10 đến 300 ký tự khi lý do không bắt buộc (xem padReason)
  NO_REASON_TEXT,
  padReason,
  // Cờ nhân sự được trả lương: true/false; null nếu không có tài khoản
  async isPayrollSubject(u?) {
    const r = await staffRepo.payrollSubjectRow(u);
    return r ? (r.payroll_subject == null ? r.role !== 'admin' : !!r.payroll_subject) : null;
  },
  async setPayrollSubject(u?, value?) {
    return await staffRepo.setPayrollSubject(u, value);
  }
});
const helpers = { now, transaction, bootFail, queryBuilder };
const sessionsApi = require('../domain/attendance/attendance-sessions')(db, helpers);
const approvalsApi = require('../domain/approvals/approvals')(db, helpers);
Object.assign(module.exports, sessionsApi);
module.exports.approvals = { ...approvalsApi }; // bản sao: bản gốc (dùng nội bộ lúc khởi tạo) không bị bọc chờ ready

// Nâng cấp dữ liệu lúc mở DB chạy bất đồng bộ; mọi lệnh bất đồng bộ của store chờ nó xong (test và server không cần gọi gì thêm).
// Lệnh đồng bộ (padReason, approvals.declaredItems, setDefaultContractResolver, db) không chờ.
const ready = (async () => {
  await db.ready; // chạy migrations/postgres/*.sql chưa chạy
})();
ready.catch(() => {}); // lỗi đã được bootFail in và thoát; tránh cảnh báo promise bị bỏ rơi
const gate = (fn?) =>
  async function (...args) {
    await ready;
    return fn.apply(this, args);
  };
const gateAll = (target?) => {
  for (const [key, value] of Object.entries<any>(target)) {
    if (typeof value === 'function' && value.constructor.name === 'AsyncFunction') target[key] = gate(value);
    else if (value && typeof value === 'object' && value.constructor === Object) gateAll(value);
  }
};
gateAll(module.exports);
module.exports.ready = ready;
