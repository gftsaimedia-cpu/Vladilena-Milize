'use strict';
// Đo tốc độ các câu truy vấn mới của luồng kỳ lương ở quy mô lớn (mặc định 1.000 nhân sự, vài năm nhật ký): EXPLAIN QUERY PLAN và thời gian
// TRƯỚC / SAU khi có các chỉ mục ứng viên, trên MỘT BẢN SAO của DB demo.
//   npm run seed:demo -- --db=<đường dẫn> --scale=1000 --no-check
//   node scripts/db/demo/period-check.js --db=<đường dẫn> --full --keep=<bản sao đã qua kỳ lương>
//   node scripts/db/perf-check.js --db=<bản sao đã qua kỳ lương> [--audit-rows=200000] [--param-rows=20000] [--runs=15] [--plans]
// AN TOÀN: không mở data/luong.sqlite (từ chối theo đường dẫn và theo tên file), chỉ nhận DB demo (khoá demo_dataset); DB nguồn chỉ được đọc
// (VACUUM INTO), mọi ghi, kể cả dữ liệu tổng hợp và việc gỡ chỉ mục ứng viên, diễn ra trên bản sao trong thư mục tạm. Dữ liệu tổng hợp là bịa
// (tên đăng nhập demo_*), nhật ký tổng hợp KHÔNG có chuỗi băm hợp lệ: chỉ dùng để đo, không bao giờ để verify().
// CANDIDATES phải khớp các CREATE INDEX trong lib/db.js (khối "Chỉ mục cho các đường đọc kỳ lương"): sửa một bên thì sửa bên kia.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.join(__dirname, '..', '..');
const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v === undefined ? true : v];
  })
);
const fail = (message, code = 1) => {
  console.error(message);
  process.exit(code);
};
const canonical = file => {
  const full = path.resolve(file);
  let real = full;
  try {
    real = path.join(fs.realpathSync.native(path.dirname(full)), path.basename(full));
  } catch {}
  return process.platform === 'win32' || process.platform === 'darwin' ? real.toLowerCase() : real;
};
const refuseReal = file => {
  const wanted = canonical(file);
  if (wanted === canonical(path.join(ROOT, 'data', 'luong.sqlite')) || path.basename(wanted) === 'luong.sqlite')
    fail('Từ chối chạy: đường dẫn trỏ vào DB lương thật (data/luong.sqlite).');
};
const num = (name, fallback, max) => {
  if (args[name] === undefined) return fallback;
  const value = Number(args[name]);
  if (!Number.isInteger(value) || value < 0 || value > max) fail(`--${name} phải là số nguyên từ 0 đến ${max}`);
  return value;
};

if (typeof args.db !== 'string')
  fail('Cách dùng: node scripts/db/perf-check.js --db=<bản sao DB demo> [--audit-rows=200000]');
refuseReal(args.db);
if (!fs.existsSync(args.db)) fail(`Không thấy file ${args.db}`);
{
  let marked = false;
  try {
    const probe = new DatabaseSync(args.db, { readOnly: true });
    marked = !!probe.prepare("SELECT 1 FROM settings WHERE key = 'demo_dataset'").get();
    probe.close();
  } catch {}
  if (!marked) fail('Từ chối chạy: file không phải DB demo (thiếu khoá demo_dataset).');
}
const AUDIT_ROWS = num('audit-rows', 200000, 2000000);
const PARAM_ROWS = num('param-rows', 20000, 500000);
const RUNS = num('runs', 15, 200);

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'aicb-perf-check-'));
const copy = path.join(work, 'copy.sqlite');
{
  const source = new DatabaseSync(args.db, { readOnly: true });
  source.exec(`VACUUM INTO '${copy.replace(/'/g, "''")}'`);
  source.close();
}
process.env.DB_PATH = copy;
const store = require('../../lib/db');
const Params = require('../../public/payroll-params.js');
const db = store.db;

/* ---------- chỉ mục ứng viên (khớp lib/db.js) ---------- */
const CANDIDATES = [
  { name: 'audit_actor_id', sql: 'CREATE INDEX audit_actor_id ON audit_log (actor, id)' },
  { name: 'audit_action_id', sql: 'CREATE INDEX audit_action_id ON audit_log (action, id)' },
  { name: 'audit_month_id', sql: 'CREATE INDEX audit_month_id ON audit_log (month, id)' },
  { name: 'audit_kind_id', sql: 'CREATE INDEX audit_kind_id ON audit_log (entity_kind, id)' },
  {
    name: 'param_versions_batch',
    sql: 'CREATE INDEX param_versions_batch ON param_versions (batch_id) WHERE batch_id IS NOT NULL'
  }
  // Đã đo và KHÔNG thêm: audit_log (subject, id) (0,35 → 0,23 ms: mỗi người chỉ vài chục dòng); payslips (run_id, status, username) (1,3 → 0,07 ms
  // trên 1.070 phiếu: dưới 2 ms sẵn rồi); param_versions (effective_month, key, id) (resolvedRows không nhanh hơn: tốn ở truy vấn con theo từng dòng).
];
const exists = name => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = ?").get(name);

/* ---------- dữ liệu tổng hợp ---------- */
let seed = 20261015;
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
const pick = list => list[Math.floor(rnd() * list.length)];
const weighted = pairs => {
  const total = pairs.reduce((sum, [, w]) => sum + w, 0);
  let x = rnd() * total;
  for (const [value, w] of pairs) if ((x -= w) < 0) return value;
  return pairs[pairs.length - 1][0];
};
const staff = db
  .prepare("SELECT username FROM staff WHERE role != 'admin' ORDER BY username")
  .all()
  .map(r => r.username);
const count = table => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
const monthAdd = (month, n) => {
  const index = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 + n;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
};

function synthAudit(target) {
  const have = count('audit_log');
  if (have >= target) return 0;
  const last = db.prepare('SELECT id, at FROM audit_log ORDER BY id DESC LIMIT 1').get() || {
    id: 0,
    at: '2026-11-02T02:00:00.000Z'
  };
  const actions = [
    ['payslip.approve', 60, 'payslip', 'pay'],
    ['request.decide', 15, 'request', 'normal'],
    ['param.set', 8, 'param', 'pay'],
    ['ai.finding.dismiss', 8, 'ai-finding', 'pay'],
    ['slip.override', 5, 'slip', 'pay'],
    ['staff.update', 2, 'staff', 'pii'],
    ['period.calculate', 1, 'period', 'pay'],
    ['period.lock-attendance', 1, 'period', 'normal']
  ];
  const actors = [
    ['demo_admin', 55],
    ['demo_admin2', 15],
    ['system', 10],
    ['demo_cb_1', 10],
    ['demo_cb_2', 10]
  ];
  const insert = db.prepare(
    `INSERT INTO audit_log (id, at, actor, actor_roles, action, entity_kind, entity_id, subject, month, before_json, after_json, reason, sensitivity, request_id, prev_hash, hash)
     VALUES (?, ?, ?, '["admin"]', ?, ?, ?, ?, ?, NULL, '{"v":1}', ?, ?, ?, 'sha256:synthetic', 'sha256:synthetic')`
  );
  const step = (36 * 30 * 86400000) / (target - have); // dàn đều 36 tháng sau dòng cuối
  let at = Date.parse(last.at);
  db.exec('BEGIN');
  for (let id = last.id + 1; id <= last.id + (target - have); id++) {
    at += step;
    const [action, , kind, sensitivity] = weighted(actions.map(a => [a, a[1]]));
    const when = new Date(at).toISOString();
    const subject = kind === 'param' || kind === 'period' ? null : pick(staff);
    insert.run(
      id,
      when,
      weighted(actors),
      action,
      kind,
      kind === 'param'
        ? pick(Object.keys(Params.DEFAULTS))
        : kind === 'period'
          ? when.slice(0, 7)
          : `${subject}:${when.slice(0, 7)}`,
      subject,
      when.slice(0, 7),
      action === 'payslip.approve' ? null : 'Lý do tổng hợp để đo tốc độ',
      sensitivity,
      `req-${id}`
    );
  }
  db.exec('COMMIT');
  return target - have;
}
function synthParams(target) {
  const have = count('param_versions');
  if (have >= target) return 0;
  const keys = Object.keys(Params.DEFAULTS);
  const insert = db.prepare(
    `INSERT INTO param_versions (key, effective_month, value_json, reason, created_by, created_at, batch_id) VALUES (?, ?, '1', 'Dòng tổng hợp để đo tốc độ', 'demo_admin', ?, ?)`
  );
  db.exec('BEGIN');
  for (let i = 0; i < target - have; i++)
    insert.run(
      pick(keys),
      monthAdd('2026-10', Math.floor(rnd() * 36)),
      new Date(1.79e12 + i * 60000).toISOString(),
      i % 5 === 4 ? null : `batch-${Math.floor(i / 10)}` // một phần dòng cũ không thuộc lô nào
    );
  db.exec('COMMIT');
  return target - have;
}
function synthPayslips(months) {
  // Thêm các lần chạy 'final' của các tháng sau (mỗi tháng một phiếu cho mỗi nhân sự) để bảng payslips có kích thước nhiều tháng
  const lastMonth = db.prepare('SELECT MAX(month) AS m FROM payroll_runs').get().m || '2026-10';
  const gz = zlib.gzipSync('{"synthetic":true}');
  const run = db.prepare(
    `INSERT INTO payroll_runs (month, run_no, status, engine_version, params_hash, params_rev, params_json, switches_json, created_by, created_at)
     VALUES (?, 1, 'final', 'synthetic', 'h', 0, '{}', '{}', 'demo_admin', '2027-01-01T00:00:00.000Z')`
  );
  const slip = db.prepare(
    `INSERT INTO payslips (run_id, username, status, gross, insurance, tax, advance, net, staff_terms_json, snapshot_gz, flags_json)
     VALUES (?, ?, 'approved', 1, 1, 1, 1, 1, '{"type":"nv"}', ?, ?)`
  );
  db.exec('BEGIN');
  for (let i = 1; i <= months; i++) {
    const id = Number(run.run(monthAdd(lastMonth, i)).lastInsertRowid);
    for (const user of staff) slip.run(id, user, gz, rnd() < 0.02 ? '["isat-frequency"]' : null);
  }
  db.exec('COMMIT');
  return months * staff.length;
}
function synthFindings(monthsBack) {
  const rules = ['isat-frequency', 'ot-above-team', 'late-declaration'];
  const insert = db.prepare(
    `INSERT INTO ai_finding_actions (finding_id, digest, month, rule_id, action, by, at, note) VALUES (?, 'd', ?, ?, ?, 'demo_admin', ?, 'Ghi chú tổng hợp để đo')`
  );
  let n = 0;
  db.exec('BEGIN');
  for (let m = 0; m < monthsBack; m++) {
    const month = monthAdd('2027-01', m);
    for (const user of staff)
      for (const rule of rules) {
        if (rnd() > 0.5) continue;
        const id = `slip:${rule}:${user}:${month}`;
        insert.run(id, month, rule, 'dismiss', '2027-02-01T00:00:00.000Z');
        n++;
        if (rnd() < 0.1) {
          insert.run(id, month, rule, 'restore', '2027-02-02T00:00:00.000Z');
          n++;
        }
      }
  }
  db.exec('COMMIT');
  return n;
}

/* ---------- đo ---------- */
// Bọc db.prepare để bắt câu SQL và tham số thật mà hàm của store dùng (không chép lại SQL)
async function capture(fn) {
  const calls = [];
  const original = db.prepare.bind(db);
  db.prepare = sql => {
    const statement = original(sql);
    return new Proxy(statement, {
      get(target, prop) {
        const value = target[prop];
        if (typeof value !== 'function') return value;
        return (...a) => {
          if (['all', 'get', 'run'].includes(prop)) calls.push({ sql, args: a });
          return value.apply(target, a);
        };
      }
    });
  };
  try {
    await fn();
  } finally {
    delete db.prepare;
  }
  return calls;
}
const planOf = calls =>
  calls
    .filter(c => /^\s*(SELECT|WITH)/i.test(c.sql))
    .map(c =>
      db
        .prepare('EXPLAIN QUERY PLAN ' + c.sql)
        .all(...c.args)
        .map(r => r.detail)
    )
    .flat();
const median = list => [...list].sort((a, b) => a - b)[Math.floor(list.length / 2)];
const p95 = list => [...list].sort((a, b) => a - b)[Math.min(list.length - 1, Math.ceil(list.length * 0.95) - 1)];
async function time(fn) {
  for (let i = 0; i < 2; i++) await fn(); // khởi động
  const samples = [];
  let result;
  for (let i = 0; i < RUNS; i++) {
    const t = performance.now();
    result = await fn();
    samples.push(performance.now() - t);
  }
  return { median: median(samples), p95: p95(samples), result };
}

function buildCases() {
  const run = db
    .prepare("SELECT id, month FROM payroll_runs WHERE month = '2026-10' ORDER BY run_no DESC LIMIT 1")
    .get();
  const sensitivities = ['normal', 'pay', 'pii'];
  const user = staff[Math.floor(staff.length / 2)];
  const lastAt = db.prepare('SELECT at FROM audit_log ORDER BY id DESC LIMIT 1').get().at;
  const midId = Math.floor(db.prepare('SELECT MAX(id) AS m FROM audit_log').get().m / 2);
  const weekStart = new Date(Date.parse(lastAt) - 120 * 86400000).toISOString();
  const weekEnd = new Date(Date.parse(lastAt) - 113 * 86400000).toISOString();
  const yearStart = new Date(Date.parse(lastAt) - 365 * 86400000).toISOString();
  const aud = (label, filter) => ({
    group: 'audit_log',
    label,
    fn: async () => (await store.audit.list({ sensitivities, ...filter })).length
  });
  const audCount = (label, filter) => ({
    group: 'audit_log',
    label,
    fn: () => store.audit.count({ sensitivities, ...filter })
  });
  return [
    aud('mới nhất (không lọc), 50 dòng', {}),
    aud('actor = admin', { actor: 'demo_admin' }),
    aud('actor = người ít việc', { actor: 'demo_cb_2' }),
    aud('action = payslip.approve', { action: 'payslip.approve' }),
    aud('action hiếm (period.lock-attendance)', { action: 'period.lock-attendance' }),
    aud('subject', { subject: user }),
    aud('subject + month', { subject: user, month: '2027-03' }),
    aud('month', { month: '2027-03' }),
    aud('entity = loại (payslip)', { entity: 'payslip' }),
    aud('entity = loại:id (param:<khoá>)', { entity: 'param:level.nv.2.base' }),
    aud('khoảng thời gian 7 ngày', { from: weekStart, to: weekEnd }),
    aud('con trỏ beforeId giữa bảng', { beforeId: midId }),
    aud('actor + action + month', { actor: 'demo_admin', action: 'payslip.approve', month: '2027-03' }),
    aud('actor + khoảng thời gian', { actor: 'demo_admin', from: weekStart, to: weekEnd }),
    aud('khoảng 12 tháng (gần hết bảng)', { from: yearStart, to: lastAt }),
    aud('actor + khoảng 12 tháng', { actor: 'demo_admin', from: yearStart, to: lastAt }),
    audCount('đếm tất cả', {}),
    audCount('đếm theo actor', { actor: 'demo_admin' }),
    {
      group: 'audit_log',
      label: 'đếm theo actor, chặn ở 10.000',
      fn: () => store.audit.count({ sensitivities, actor: 'demo_admin' }, { cap: 10000 })
    },
    audCount('đếm theo month', { month: '2027-03' }),
    audCount('đếm theo action', { action: 'param.set' }),
    {
      group: 'payslips',
      label: 'danh sách 1 lần chạy, trang 1',
      fn: async () => (await store.payroll.listPayslips(run.id, {})).rows.length
    },
    {
      group: 'payslips',
      label: 'status = error',
      fn: async () => (await store.payroll.listPayslips(run.id, { status: 'error' })).rows.length
    },
    {
      group: 'payslips',
      label: 'status = pending',
      fn: async () => (await store.payroll.listPayslips(run.id, { status: 'pending' })).rows.length
    },
    {
      group: 'payslips',
      label: 'lọc loại nv: nạp cả lần chạy rồi lọc (cách cũ)',
      fn: async () => {
        const rows = [];
        for (let page = 1; ; page++) {
          const got = await store.payroll.listPayslips(run.id, { page, pageSize: 200 });
          rows.push(...got.rows);
          if (!got.rows.length || rows.length >= got.total) break;
        }
        return rows.filter(r => r.staffTerms && r.staffTerms.type === 'nv').length;
      }
    },
    {
      group: 'payslips',
      label: 'lọc loại nv trong SQL (json_extract), trang 1',
      fn: async () => (await store.payroll.listPayslips(run.id, { type: 'nv' })).rows.length
    },
    {
      group: 'payslips',
      label: 'có cờ AI',
      fn: async () => (await store.payroll.listPayslips(run.id, { flagged: true })).rows.length
    },
    {
      group: 'payslips',
      label: 'tìm q (LIKE %q%)',
      fn: async () => (await store.payroll.listPayslips(run.id, { q: 'bulk_05' })).rows.length
    },
    {
      group: 'payslips',
      label: 'trang 5 (OFFSET)',
      fn: async () => (await store.payroll.listPayslips(run.id, { page: 5, pageSize: 200 })).rows.length
    },
    { group: 'payslips', label: 'đếm theo trạng thái', fn: async () => (await store.payroll.countPayslips(run.id)).total },
    {
      group: 'payslips',
      label: 'phiếu chính thức của 1 người',
      fn: async () => (await store.payroll.finalPayslip(user, '2026-10') ? 1 : 0)
    },
    { group: 'param_versions', label: 'resolvedRows(2026-10)', fn: async () => (await store.params.resolvedRows('2026-10')).length },
    { group: 'param_versions', label: 'resolvedRows(2028-06)', fn: async () => (await store.params.resolvedRows('2028-06')).length },
    {
      group: 'param_versions',
      label: 'history(khoá)',
      fn: async () => (await store.params.history({ key: 'level.nv.2.base', limit: 200 })).length
    },
    { group: 'param_versions', label: 'history(toàn bộ, 200)', fn: async () => (await store.params.history({ limit: 200 })).length },
    { group: 'param_versions', label: 'byBatch(1 lô)', fn: async () => (await store.params.byBatch('batch-777')).length },
    {
      group: 'ai_finding_actions',
      label: 'dismissedIds(tháng)',
      fn: async () => (await store.aiFindings.dismissedIds('2027-03')).size
    },
    {
      group: 'ai_finding_actions',
      label: 'isDismissed(1 cờ)',
      fn: async () => (await store.aiFindings.isDismissed(`slip:isat-frequency:${user}:2027-03`) ? 1 : 0)
    },
    { group: 'ai_finding_actions', label: 'list(tháng)', fn: async () => (await store.aiFindings.list({ month: '2027-03' })).length },
    {
      group: 'ai_finding_actions',
      label: 'list(luật)',
      fn: async () => (await store.aiFindings.list({ ruleId: 'ot-above-team' })).length
    }
  ];
}
const SCAN = /SCAN (?!.*USING)/;
const brief = plan => plan.map(d => d.replace(/^SEARCH |^SCAN /, m => (m === 'SCAN ' ? 'QUÉT ' : 'TRA '))).join(' ; ');

function measure(cases) {
  return cases.map(c => {
    const plan = planOf(capture(c.fn));
    const t = time(c.fn);
    return { ...c, plan, median: t.median, p95: t.p95, rows: t.result };
  });
}

/* ---------- chạy ---------- */
const sizes = () => ({
  staff: staff.length,
  audit_log: count('audit_log'),
  param_versions: count('param_versions'),
  payroll_runs: count('payroll_runs'),
  payslips: count('payslips'),
  ai_finding_actions: count('ai_finding_actions')
});
const log = console.log;
const added = {
  audit: synthAudit(AUDIT_ROWS),
  params: synthParams(PARAM_ROWS),
  payslips: synthPayslips(num('slip-months', 11, 60)),
  findings: count('ai_finding_actions') < 5000 ? synthFindings(6) : 0
};
log('Quy mô sau khi thêm dữ liệu tổng hợp ' + JSON.stringify(sizes()));
log('Dòng tổng hợp đã thêm ' + JSON.stringify(added) + `; mỗi phép đo: ${RUNS} lần, lấy trung vị (p95 trong ngoặc)`);

const present = CANDIDATES.filter(c => exists(c.name));
for (const c of present) db.exec(`DROP INDEX ${c.name}`); // chỉ trên bản sao
const before = measure(buildCases());
for (const c of CANDIDATES) db.exec(c.sql);
const after = measure(buildCases());

const pad = (text, n) => String(text).padEnd(n);
const ms = v => (v < 10 ? v.toFixed(2) : v.toFixed(1)).padStart(7);
log('\n' + pad('Nhóm · phép đo', 56) + 'trước (ms)'.padStart(14) + 'sau (ms)'.padStart(14) + '  dòng');
let group = '';
for (let i = 0; i < before.length; i++) {
  const b = before[i],
    a = after[i];
  if (b.group !== group) {
    group = b.group;
    log(`\n[${group}]`);
  }
  log(
    pad('  ' + b.label, 56) +
      `${ms(b.median)} (${b.p95.toFixed(1)})`.padStart(14) +
      `${ms(a.median)} (${a.p95.toFixed(1)})`.padStart(14) +
      '  ' +
      b.rows
  );
  if (args.plans) {
    log('      trước: ' + brief(b.plan));
    log('      sau:   ' + brief(a.plan));
  }
}
const slow = before.filter(b => SCAN.test(b.plan.join(' ')));
log(`\nPhép đo có QUÉT cả bảng trước khi thêm chỉ mục: ${slow.length}/${before.length}`);
for (const b of slow) log('  - ' + b.group + ' · ' + b.label);
log('Kích thước file bản sao: ' + (fs.statSync(copy).size / 1048576).toFixed(1) + ' MB');
db.close();
fs.rmSync(work, { recursive: true, force: true });
