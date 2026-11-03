'use strict';
// Chạy thử luồng kỳ lương (chốt công → tính lương → duyệt → chi trả) trên MỘT BẢN SAO của DB demo, bằng máy chủ thật trong cùng tiến trình
// (đồng hồ giả: ngày 2 của tháng sau), rồi đếm phiếu theo trạng thái, cờ AI theo luật, phiếu lỗi theo mã, và kiểm các kỳ vọng của kịch bản
// (scenarios.js → PAYSLIP, PERIOD_EXPECT). Đi đúng các route của Admin: lock-attendance, calculate, ai-review, GET payslips có bộ lọc.
//   DEMO_PG_CONTROL_URL=postgres://… node scripts/db/demo/period-check.ts --snapshot=data/demo.pgbak.gz [--month=2026-10] [--today=YYYY-MM-DD] [--full] [--keep=copy.pgbak.gz]
//   --full   đi tiếp: duyệt phiếu (lô sạch, từng phiếu có cờ), loại phiếu lỗi khi duyệt kỳ, chi trả
//   --keep   lưu bản sao đã kiểm tra thành file .pgbak.gz mới; không ghi đè file có sẵn
// AN TOÀN: snapshot chỉ đọc; công cụ khôi phục vào database tạm do chính lần chạy tạo trên DEMO_PG_CONTROL_URL rồi dọn đúng DB đó.
// Chỉ in số đếm và tên đăng nhập giả demo_*, không in tên hay tiền.
// Mã thoát: 0 = mọi kỳ vọng đạt, 2 = có kỳ vọng lệch, 1 = lỗi khác.
const fs = require('node:fs');
const path = require('node:path');
const { withDemoSnapshot, saveDemoSnapshot } = require('./demo-dir');

const ROOT = path.join(__dirname, '..', '..', '..');
const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v === undefined ? true : v];
  })
);
const fail = (message?, code = 1) => {
  if (workflowStarted) throw new Error(message);
  console.error(message);
  process.exit(code);
};
let workflowStarted = false;
if (typeof args.snapshot !== 'string' || typeof args.db === 'string')
  fail('Cần --snapshot=<file.pgbak.gz>; tạo snapshot bằng scripts/ops/pg-backup.ts backup. --db đã bị gỡ.');
if (typeof args.keep === 'string' && !/\.pgbak\.gz$/i.test(args.keep))
  fail('--keep phải là đường dẫn file .pgbak.gz rõ ràng; công cụ không giữ thư mục DB.');
if (typeof args.keep === 'string' && fs.existsSync(args.keep)) fail('--keep từ chối ghi đè file đã tồn tại.');
const month = typeof args.month === 'string' ? args.month : '2026-10';
if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) fail('--month phải có dạng YYYY-MM');
const nextMonthStart = (m?) => {
  const y = +m.slice(0, 4),
    n = +m.slice(5, 7);
  return n === 12 ? `${y + 1}-01-02` : `${y}-${String(n + 1).padStart(2, '0')}-02`;
};
const today = typeof args.today === 'string' ? args.today : nextMonthStart(month);
if (!/^\d{4}-\d{2}-\d{2}$/.test(today) || Number.isNaN(Date.parse(today))) fail('--today phải có dạng YYYY-MM-DD');

const S = require('./scenarios');
const ADMIN = S.ADMINS[0].username;
let base = '';
let store;
let auth;
let server;
let database;
let setStopAction;
async function call(method?, route?, body?, who = ADMIN) {
  const response = await fetch(base + '/api' + route, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: auth.cookieHeader(await auth.createSession(who), 86400) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  return { status: response.status, data: (await response.json().catch(() => ({}))) as any };
}
const revOf = async () => (await call('GET', `/periods/${month}`)).data.rev;
const log = console.log;
const short = (data?) => JSON.stringify(data).slice(0, 300);

async function main() {
  process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'demo-period-check';
  auth = require('../../../src/platform/auth');
  server = require('../../../src/server');
  const realNow = Date.now;
  let shutdownRequested = false;
  let serverClosePromise: Promise<void> | null = null;
  const stopServer = (): Promise<void> => {
    shutdownRequested = true;
    if (!server.listening) return Promise.resolve();
    if (!serverClosePromise) {
      server.closeAllConnections();
      serverClosePromise = new Promise<void>(resolve => server.close(() => resolve()));
    }
    return serverClosePromise;
  };
  setStopAction(stopServer);
  Date.now = () => Date.parse(`${today}T09:00:00+07:00`);
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    if (shutdownRequested) return { problems: [] };
    base = `http://127.0.0.1:${server.address().port}`;
    const problems: any[] = [];
    const expect = (ok?, text?) => {
      if (!ok) problems.push(text);
    };

    /* ---------- chốt công → tính lương ---------- */
    let view0 = (await call('GET', `/periods/${month}`)).data;
    if (view0.status !== 'open') {
      const reopened = await call('POST', `/periods/${month}/reopen`, {
        rev: view0.rev,
        to: 'open',
        reason: 'Demo: mở bản sao để diễn tập lại kỳ lương'
      });
      if (reopened.status !== 200) fail(`Mở lại kỳ ${month} thất bại: ${reopened.status} ${short(reopened.data)}`);
      view0 = (await call('GET', `/periods/${month}`)).data;
    }
    log(`Kỳ ${month}: trạng thái ban đầu ${view0.status}; đồng hồ giả ${today} 09:00`);
    let step = await call('POST', `/periods/${month}/lock-attendance`, { rev: view0.rev });
    let acknowledged: any[] = [];
    if (step.status === 409 && step.data.checklist) {
      // Như Admin: xem danh sách kiểm, bỏ qua kèm lý do các mục chặn bỏ qua được (dữ liệu demo cố ý còn khoản chưa xử lý)
      const items = step.data.checklist;
      acknowledged = items.filter(i => i.acknowledgeable).map(i => i.code);
      log(
        `Chốt công bị chặn bởi: ${items.map(i => `${i.code}×${i.count}${i.acknowledgeable ? '' : ' (không bỏ qua được)'}`).join(', ')}`
      );
      step = await call('POST', `/periods/${month}/lock-attendance`, {
        rev: view0.rev,
        acknowledge: acknowledged,
        reason: 'Demo: bỏ qua danh sách kiểm để thử luồng kỳ lương'
      });
    }
    if (step.status !== 200) fail(`Chốt công thất bại: ${step.status} ${short(step.data)}`);
    log(`Chốt công: ${step.data.status}${acknowledged.length ? ` (bỏ qua ${acknowledged.join(', ')})` : ''}`);
    step = await call('POST', `/periods/${month}/calculate`, { rev: await revOf() });
    if (step.status !== 200) fail(`Tính lương thất bại: ${step.status} ${short(step.data)}`);
    log(`Tính lương: ${step.data.status}; phiếu ${JSON.stringify(step.data.counts)}`);

    /* ---------- đếm, đọc qua đúng route của Admin ---------- */
    const view = (await call('GET', `/periods/${month}`)).data;
    const list = async (query = '') => (await call('GET', `/periods/${month}/payslips?pageSize=200${query}`)).data;
    // Mọi phiếu của kỳ: đọc từng trang tối đa 200 dòng như màn hình; đo thời gian lần đọc đầu (nạp bản chụp) và lần đọc sau
    const listAll = async () => {
      const rows: any[] = [];
      let total = 0;
      for (let page = 1; ; page++) {
        const got = (await call('GET', `/periods/${month}/payslips?pageSize=200&page=${page}`)).data;
        total = got.total;
        rows.push(...got.rows);
        if (!got.rows.length || rows.length >= total) return { total, rows };
      }
    };
    const t0 = performance.now();
    const everything = await listAll();
    const t1 = performance.now();
    await listAll();
    log(
      `Đọc ${everything.rows.length} phiếu qua API: lần đầu ${Math.round(t1 - t0)} ms, lần sau ${Math.round(performance.now() - t1)} ms`
    );
    const all = everything.rows;
    expect(everything.total === all.length, `danh sách phiếu: total ${everything.total} khác số dòng ${all.length}`);
    const byStatus: Record<string, any> = {};
    const byRule: Record<string, any> = {};
    const byError: Record<string, any> = {};
    const byType: Record<string, any> = {};
    let flagged = 0;
    for (const p of all) {
      byStatus[p.status] = (byStatus[p.status] || 0) + 1;
      if (p.flags.length) flagged++;
      for (const flag of p.flags) byRule[flag] = (byRule[flag] || 0) + 1;
      if (p.status === 'error') byError[p.errorCode] = (byError[p.errorCode] || 0) + 1;
      byType[p.type] = (byType[p.type] || 0) + 1;
    }
    const persona = new Map<any, any>(S.PERSONAS.map(x => [x.username, x]));
    const healthy = all.filter(p => p.status !== 'error');
    log('\nPhiếu theo trạng thái ' + JSON.stringify(byStatus));
    log('Phiếu lỗi theo mã ' + JSON.stringify(byError));
    log('Phiếu theo loại nhân sự ' + JSON.stringify(byType));
    const kept = view.attendanceKept || { kept: 0, of: 0 };
    const lost = kept.of - kept.kept;
    log(`Phụ cấp chuyên cần: có ở ${kept.of} người, giữ ${kept.kept}, mất ${lost}`);
    const iDorm = healthy.filter(p => persona.get(p.username) && persona.get(p.username).idorm).length;
    const advanceOff = healthy.filter(
      p => persona.get(p.username) && persona.get(p.username).advanceOn === false
    ).length;
    log(`iDorm (phiếu thường): ${iDorm}; tắt tạm ứng (phiếu thường): ${advanceOff}`);

    // Bộ lọc danh sách phiếu: mỗi bộ lọc phải khớp với cách đếm ở trên
    const filtered = {
      'status=error': (await list('&status=error')).total,
      'status=draft': (await list('&status=draft')).total,
      'q=demo_bad': (await list('&q=demo_bad')).total,
      'type=nv': (await list('&type=nv')).total,
      'type=tts': (await list('&type=tts')).total
    };
    log('Bộ lọc danh sách phiếu ' + JSON.stringify(filtered));
    expect(filtered['status=error'] === (byStatus.error || 0), 'bộ lọc status=error lệch số đếm');
    expect(filtered['status=draft'] === (byStatus.draft || 0), 'bộ lọc status=draft lệch số đếm');
    expect(filtered['type=nv'] === (byType.nv || 0), 'bộ lọc type=nv lệch số đếm');
    expect(filtered['type=tts'] === (byType.tts || 0), 'bộ lọc type=tts lệch số đếm');
    const badTypeFilter = await call('GET', `/periods/${month}/payslips?type=intern`);
    log(
      `type=intern (loại ngoài bảng) → HTTP ${badTypeFilter.status}: phiếu lỗi loại này chỉ tìm được bằng status=error`
    );

    /* ---------- kỳ vọng của kịch bản ---------- */
    const bySlip = new Map<any, any>(all.map(p => [p.username, p]));
    const expectations = S.PERSONAS.filter(p => p.payslip && p.payslip.month === month);
    for (const p of expectations) {
      const slip = bySlip.get(p.username);
      const want = p.payslip;
      if (!slip) {
        problems.push(`${p.username}: không có phiếu trong kỳ ${month}`);
        continue;
      }
      // `pending` is a legacy scenario expectation from the removed AI review step; current unapproved slips remain `draft`.
      const expectedStatus = want.status === 'pending' ? 'draft' : want.status;
      expect(slip.status === expectedStatus, `${p.username}: phiếu ${slip.status}, kỳ vọng ${expectedStatus}`);
      if (want.errorCode)
        expect(slip.errorCode === want.errorCode, `${p.username}: mã lỗi ${slip.errorCode}, kỳ vọng ${want.errorCode}`);
    }
    if (month === S.PERIOD_EXPECT.month) {
      const E = S.PERIOD_EXPECT;
      expect(
        JSON.stringify(Object.entries<any>(byError).sort()) ===
          JSON.stringify(Object.entries<any>(E.errorCodes).sort()),
        `phiếu lỗi theo mã ${JSON.stringify(byError)}, kỳ vọng ${JSON.stringify(E.errorCodes)}`
      );
      for (const t of E.types) expect(byType[t] > 0, `kỳ không có loại nhân sự ${t}`);
      expect(kept.kept >= E.attendanceKept, 'không ai còn phụ cấp chuyên cần');
      expect(lost >= E.attendanceLost, 'không ai mất phụ cấp chuyên cần');
      expect(iDorm >= E.iDorm, 'không có người ở iDorm trong phiếu thường');
      expect(advanceOff >= E.advanceOff, 'không có người tắt tạm ứng trong phiếu thường');
    }
    log(`\nKỳ vọng kịch bản (PAYSLIP + PERIOD_EXPECT): ${expectations.length} persona`);

    /* ---------- đường phụ: duyệt, loại phiếu lỗi, chi trả ---------- */
    if (args.full) {
      const decide = (items?, note?) =>
        call('PUT', `/periods/${month}/payslips/decide`, { items, action: 'approve', ...(note ? { note } : {}) });
      const fresh = (await listAll()).rows;
      const clean = fresh.filter(p => p.status === 'draft').map(p => ({ username: p.username, rev: p.rev }));
      for (let i = 0; i < clean.length; i += 200) {
        const r = await decide(clean.slice(i, i + 200));
        expect(r.status === 200, `duyệt lô phiếu sạch: HTTP ${r.status} ${short(r.data)}`);
      }
      const early = await call('POST', `/periods/${month}/approve`, { rev: await revOf(), excludeErrors: [] });
      log(`Duyệt kỳ khi chưa loại phiếu lỗi: HTTP ${early.status} ${early.data.code || ''} (phải bị chặn)`);
      expect(early.status === 409, 'duyệt kỳ khi còn phiếu lỗi chưa loại phải bị chặn (409)');
      const errors = fresh
        .filter(p => p.status === 'error')
        .map(p => ({ username: p.username, reason: 'Demo: hồ sơ sai, loại khỏi kỳ này' }));
      const approved = await call('POST', `/periods/${month}/approve`, { rev: await revOf(), excludeErrors: errors });
      log(
        `Duyệt kỳ kèm loại ${errors.length} phiếu lỗi: HTTP ${approved.status} ${approved.data.status || approved.data.code || ''}`
      );
      expect(approved.status === 200, `duyệt kỳ: HTTP ${approved.status} ${short(approved.data)}`);
      if (approved.status === 200) {
        const paid = await call('POST', `/periods/${month}/mark-paid`, { rev: await revOf(), paidAt: today });
        log(`Chi trả: HTTP ${paid.status} ${paid.data.status || ''}`);
        expect(paid.status === 200, `chi trả: HTTP ${paid.status} ${short(paid.data)}`);
      }
    }

    /* ---------- nhật ký ---------- */
    const audited = await store.db
      .prepare('SELECT action, COUNT(*) AS n FROM audit_log GROUP BY action ORDER BY action')
      .all();
    log('Nhật ký kiểm toán theo hành động ' + JSON.stringify(Object.fromEntries(audited.map(r => [r.action, r.n]))));
    const chain = (await call('GET', '/audit/verify')).data;
    expect(chain.ok === true, `chuỗi băm nhật ký: ${short(chain)}`);
    log(`\nKết quả: ${problems.length ? problems.length + ' kỳ vọng lệch' : 'mọi kỳ vọng đạt'}`);
    for (const p of problems) log('  - ' + p);
    return { problems };
  } finally {
    Date.now = realNow;
    await stopServer();
    if (typeof args.keep === 'string') await saveDemoSnapshot(database.url, args.keep);
  }
}

withDemoSnapshot(args.snapshot, async context => {
  workflowStarted = true;
  store = context.store;
  database = context.database;
  setStopAction = context.setStopAction;
  return main();
})
  .then(result => process.exit(result.problems.length ? 2 : 0))
  .catch(error => {
    console.error(String(error && error.message).replace(/\/\/[^@/\s]*@/g, '//***@'));
    process.exit(1);
  });
