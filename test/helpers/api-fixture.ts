'use strict';
// Dựng máy chủ thật trên PostgreSQL test riêng cho các test API (khoá kỳ, bản chụp phiếu, quyền, nhật ký).
// Kiểm tra DB test và đặt SESSION_SECRET TRƯỚC khi require src/platform/db.
// Chỉ người bịa (qa_*); đồng hồ giả bằng cách ghi đè Date.now như test/api/checkin.test.ts.
require('./require-isolated-database');
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'qa-v1a-api-tests';
const crypto = require('node:crypto');
const store = require('../../src/platform/db');
const auth = require('../../src/platform/auth');
const server = require('./server');

const realNow = Date.now;
let clock = Date.parse('2026-11-02T09:00:00+07:00');
let base: any = null;

const at = (vnTime?) => {
  clock = typeof vnTime === 'number' ? vnTime : Date.parse(vnTime + '+07:00');
}; // đặt đồng hồ giả theo giờ Việt Nam: at('2026-11-02T09:00:00'); nhận cả mili giây (giá trị của now())
const now = () => clock; // mili giây của đồng hồ giả, để đặt lại bằng at(now())

async function start() {
  Date.now = () => clock;
  await new Promise<any>(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
}
async function stop() {
  Date.now = realNow;
  server.closeAllConnections();
  await new Promise<any>(resolve => server.close(resolve));
  await store.db.close();
}

// Gọi API như người dùng đã đăng nhập (who = tên đăng nhập) hoặc chưa đăng nhập (who = null). route bắt đầu bằng /, không gồm /api.
async function call(method?, route?, { who = 'admin', body }: any = {}) {
  // explainPunches: test chỉ cần lượt trễ / sớm / ngoài ca làm đầu vào thì mọi lần bấm kèm giải trình (lần bấm hợp lệ bỏ qua câu này)
  if (route === '/punch' && method === 'POST' && fixture.explainPunches && body && body.explanation === undefined)
    body = { ...body, explanation: 'Giải trình lúc bấm' };
  const headers: Record<string, any> = { 'Content-Type': 'application/json' };
  if (who) headers.Cookie = auth.cookieHeader(await auth.createSession(who), 86400);
  const response = await fetch(base + '/api' + route, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  return { status: response.status, data: (await response.json().catch(() => ({}))) as any };
}

async function person(username?, role = 'staff', extra: any = {}) {
  await store.upsertStaff({
    username,
    name: 'Người thử ' + username,
    role,
    type: 'nv',
    level: 1,
    nightPct: 40,
    shiftCode: 'n1',
    startDate: '2026-01-05',
    passHash: auth.hashPassword('test-pass'),
    ...extra
  });
}

const tables = async () =>
  (
    await store.db
      .prepare(
        "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> 'schema_migrations' ORDER BY table_name"
      )
      .all()
  ).map(row => row.name);

// Xoá hết dòng của mọi bảng (bảng chỉ-thêm-dòng như audit_log, param_versions, payslips từ chối DELETE nên bị bỏ qua), rồi trả DB về trạng thái dùng được.
// Danh mục chức vụ, bậc, ca (src/domain/position/schema.js) là dữ liệu nền do migration nạp, như hai khoá settings giữ lại: không xoá
const CATALOG_TABLES = ['benefit_types', 'position_types', 'position_type_benefits', 'position_levels', 'work_shifts'];
async function reset({ keep = [] }: any = {}) {
  for (const name of await tables()) {
    if (keep.includes(name) || CATALOG_TABLES.includes(name)) continue;
    try {
      // settings giữ lại khoá do migration đặt (chế độ tham số) và công tắc Agents
      if (name === 'settings')
        await store.db.exec("DELETE FROM settings WHERE key NOT IN ('params_mode', 'agents_enabled')");
      else await store.db.exec(`DELETE FROM ${name}`);
    } catch {
      /* bảng chỉ thêm dòng */
    }
  }
}

// Dấu vân tay của toàn bộ dữ liệu (mọi bảng, trừ các bảng nêu trong exclude), để khẳng định "không lưu gì".
async function snapshot(exclude: any[] = []) {
  const out: Record<string, any> = {};
  for (const name of await tables()) {
    if (exclude.includes(name)) continue;
    const rows = await store.db.prepare(`SELECT * FROM ${name} ORDER BY ctid`).all();
    out[name] = {
      rows: rows.length,
      digest: crypto
        .createHash('sha256')
        .update(
          // Sắp theo nội dung: PostgreSQL không có rowid, UPDATE giữ nguyên giá trị vẫn đổi chỗ vật lý của dòng
          JSON.stringify(
            rows
              .map(row =>
                JSON.stringify(row, (key, value) =>
                  value instanceof Uint8Array ? 'blob:' + Buffer.from(value).toString('hex') : value
                )
              )
              .sort()
          )
        )
        .digest('hex')
    };
  }
  return out;
}
// Tên các bảng có dữ liệu khác nhau giữa hai dấu vân tay
const changedTables = (before?, after?) =>
  Object.keys(after).filter(name => !before[name] || before[name].digest !== after[name].digest);

const fixture = {
  store,
  auth,
  server,
  start,
  stop,
  call,
  person,
  reset,
  snapshot,
  changedTables,
  tables,
  at,
  now,
  explainPunches: false
};
module.exports = fixture;
