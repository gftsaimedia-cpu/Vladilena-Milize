'use strict';
// Chạy thử luồng kỳ lương (chốt công → tính lương → AI kiểm tra) trên MỘT BẢN SAO của DB demo, bằng máy chủ thật trong cùng tiến trình
// (đồng hồ giả: ngày 2 của tháng sau), rồi đếm phiếu theo trạng thái, cờ AI theo luật, phiếu lỗi theo mã, và kiểm các kỳ vọng của kịch bản
// (scenarios.js → PAYSLIP, PERIOD_EXPECT). Đi đúng các route của Admin: lock-attendance, calculate, ai-review, GET payslips có bộ lọc.
//   node scripts/db/demo/period-check.ts --db=data/demo [--month=2026-10] [--today=YYYY-MM-DD] [--full] [--keep=đường/dẫn/bản-sao.sqlite]
//   --full   đi tiếp: duyệt phiếu (lô sạch, từng phiếu có cờ), loại phiếu lỗi khi duyệt kỳ, chi trả
//   --keep   giữ bản sao ở đường dẫn này (mặc định xoá khi xong); chỉ ghi đè được file chưa có hoặc file demo
// AN TOÀN: không bao giờ mở data/luong.sqlite (từ chối theo đường dẫn và theo tên file) và chỉ nhận DB demo (khoá demo_dataset). DB nguồn
// chỉ được đọc (VACUUM INTO từ kết nối chỉ đọc); mọi ghi diễn ra trên bản sao. Chỉ in số đếm và tên đăng nhập giả demo_*, không in tên hay tiền.
// Mã thoát: 0 = mọi kỳ vọng đạt, 2 = có kỳ vọng lệch, 1 = lỗi khác.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { demoInfo, copyDemo } = require('./demo-dir');

const ROOT = path.join(__dirname, '..', '..', '..');
const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v === undefined ? true : v];
  })
);
const fail = (message?, code = 1) => {
  console.error(message);
  process.exit(code);
};
const canonical = (file?) => {
  const full = path.resolve(file);
  let real = full;
  try {
    real = path.join(fs.realpathSync.native(path.dirname(full)), path.basename(full));
  } catch {}
  return process.platform === 'win32' || process.platform === 'darwin' ? real.toLowerCase() : real;
};
const refuseReal = (file?) => {
  if (path.basename(path.resolve(file)).toLowerCase() === 'luong')
    fail('Từ chối chạy: đường dẫn trông như DB lương thật.');
};
// Thư mục là DB demo (có khoá demo_dataset)? Hỏng hoặc không phải DB demo là không.
const isDemoDb = (dir?) => demoInfo(dir).marked;

if (typeof args.db !== 'string')
  fail('Cách dùng: node scripts/db/demo/period-check.ts --db=data/demo [--month=2026-10] [--full]');
refuseReal(args.db);
if (!fs.existsSync(args.db)) fail(`Không thấy ${args.db}. Dựng trước bằng: npm run seed:demo`);
if (!isDemoDb(args.db)) fail('Từ chối chạy: thư mục không phải DB demo (thiếu khoá demo_dataset).');
const month = typeof args.month === 'string' ? args.month : '2026-10';
if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) fail('--month phải có dạng YYYY-MM');
const nextMonthStart = (m?) => {
  const y = +m.slice(0, 4),
    n = +m.slice(5, 7);
  return n === 12 ? `${y + 1}-01-02` : `${y}-${String(n + 1).padStart(2, '0')}-02`;
};
const today = typeof args.today === 'string' ? args.today : nextMonthStart(month);
if (!/^\d{4}-\d{2}-\d{2}$/.test(today) || Number.isNaN(Date.parse(today))) fail('--today phải có dạng YYYY-MM-DD');

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'aicb-period-check-'));
const copy = typeof args.keep === 'string' ? args.keep : path.join(work, 'copy');
refuseReal(copy);
if (canonical(copy) === canonical(args.db)) fail('Từ chối chạy: bản sao trùng DB nguồn.');
if (fs.existsSync(copy) && !isDemoDb(copy)) fail('Từ chối ghi đè: --keep trỏ vào thư mục đã có mà không phải DB demo.');
copyDemo(args.db, copy);

process.env.DB_PATH = copy;
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'demo-period-check';
const store = require('../../../lib/db');
const auth = require('../../../lib/auth');
const server = require('../../../src/server');
const S = require('./scenarios');

const realNow = Date.now;
Date.now = () => Date.parse(`${today}T09:00:00+07:00`);
const ADMIN = S.ADMINS[0].username;
let base = '';
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
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  const problems: any[] = [];
  const expect = (ok?, text?) => {
    if (!ok) problems.push(text);
  };

  /* ---------- chốt công → tính lương → AI kiểm tra ---------- */
  const view0 = (await call('GET', `/periods/${month}`)).data;
  log(`Kỳ ${month}: trạng thái ban đầu ${view0.status}; đồng hồ giả ${today} 09:00`);
  // Bản sao demo dựng bằng --no-lifecycle chưa bật công tắc Agents (lớp vận hành bật nó); bước AI kiểm tra cần
  const cfg = require('../../../lib/config');
  await store.setSetting(cfg.AGENTS_SETTING_KEY, cfg.AGENTS_ON);
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
  step = await call('POST', `/periods/${month}/ai-review`, { rev: await revOf() });
  if (step.status !== 200) fail(`AI kiểm tra thất bại: ${step.status} ${short(step.data)}`);
  log(`AI kiểm tra: ${step.data.status}; phát hiện ${step.data.findings}; mức ${JSON.stringify(step.data.bySeverity)}`);

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
  log(`Phiếu có cờ AI: ${flagged}/${all.length}`);
  log('Cờ theo luật ' + JSON.stringify(Object.fromEntries(Object.entries<any>(byRule).sort())));
  log('Phiếu lỗi theo mã ' + JSON.stringify(byError));
  log('Phiếu theo loại nhân sự ' + JSON.stringify(byType));
  const kept = view.attendanceKept || { kept: 0, of: 0 };
  const lost = kept.of - kept.kept;
  log(`Phụ cấp chuyên cần: có ở ${kept.of} người, giữ ${kept.kept}, mất ${lost}`);
  const iDorm = healthy.filter(p => persona.get(p.username) && persona.get(p.username).idorm).length;
  const advanceOff = healthy.filter(p => persona.get(p.username) && persona.get(p.username).advanceOn === false).length;
  log(`iDorm (phiếu thường): ${iDorm}; tắt tạm ứng (phiếu thường): ${advanceOff}`);

  // Bộ lọc danh sách phiếu: mỗi bộ lọc phải khớp với cách đếm ở trên
  const filtered = {
    'status=error': (await list('&status=error')).total,
    'status=pending': (await list('&status=pending')).total,
    'flag=1': (await list('&flag=1')).total,
    'flag=0': (await list('&flag=0')).total,
    'q=demo_bad': (await list('&q=demo_bad')).total,
    'type=nv': (await list('&type=nv')).total,
    'type=tts': (await list('&type=tts')).total
  };
  log('Bộ lọc danh sách phiếu ' + JSON.stringify(filtered));
  expect(filtered['status=error'] === (byStatus.error || 0), 'bộ lọc status=error lệch số đếm');
  expect(filtered['status=pending'] === (byStatus.pending || 0), 'bộ lọc status=pending lệch số đếm');
  expect(filtered['flag=1'] === flagged, 'bộ lọc flag=1 lệch số đếm');
  expect(filtered['flag=1'] + filtered['flag=0'] === all.length, 'flag=1 + flag=0 khác tổng phiếu');
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
    expect(slip.status === want.status, `${p.username}: phiếu ${slip.status}, kỳ vọng ${want.status}`);
    if (want.errorCode)
      expect(slip.errorCode === want.errorCode, `${p.username}: mã lỗi ${slip.errorCode}, kỳ vọng ${want.errorCode}`);
    for (const rule of want.flags || [])
      expect(slip.flags.includes(rule), `${p.username}: thiếu cờ ${rule} (có ${slip.flags.join(',') || 'không'})`);
    if (want.noFlags) expect(!slip.flags.length, `${p.username}: phiếu phải sạch, có cờ ${slip.flags.join(',')}`);
  }
  if (month === S.PERIOD_EXPECT.month) {
    const E = S.PERIOD_EXPECT;
    expect(
      JSON.stringify(Object.entries<any>(byError).sort()) === JSON.stringify(Object.entries<any>(E.errorCodes).sort()),
      `phiếu lỗi theo mã ${JSON.stringify(byError)}, kỳ vọng ${JSON.stringify(E.errorCodes)}`
    );
    expect(flagged >= E.minFlagged, `chỉ ${flagged} phiếu có cờ, kỳ vọng ít nhất ${E.minFlagged}`);
    expect(
      Object.keys(byRule).length >= E.minRules,
      `cờ chỉ trải trên ${Object.keys(byRule).length} luật, kỳ vọng ít nhất ${E.minRules}`
    );
    for (const t of E.types) expect(byType[t] > 0, `kỳ không có loại nhân sự ${t}`);
    expect(kept.kept >= E.attendanceKept, 'không ai còn phụ cấp chuyên cần');
    expect(lost >= E.attendanceLost, 'không ai mất phụ cấp chuyên cần');
    expect(iDorm >= E.iDorm, 'không có người ở iDorm trong phiếu thường');
    expect(advanceOff >= E.advanceOff, 'không có người tắt tạm ứng trong phiếu thường');
  }
  log(`\nKỳ vọng kịch bản (PAYSLIP + PERIOD_EXPECT): ${expectations.length} persona`);

  /* ---------- đường phụ: bỏ qua phát hiện (chỉ ghi vào bản sao) ---------- */
  const target = all.find(p => p.status === 'pending' && p.flags.length > 1);
  if (target) {
    const body = {
      month,
      username: target.username,
      rule: target.flags[0],
      reason: 'Demo: đã xem, đúng dữ liệu thật của kỳ'
    };
    const first = await call('POST', '/ai/findings/dismiss', body);
    log(
      `Bỏ qua phát hiện ${body.rule} của ${body.username}: HTTP ${first.status}, còn lại ${JSON.stringify((first.data || {}).remaining)}`
    );
    expect(first.status === 200, `bỏ qua phát hiện: HTTP ${first.status} ${short(first.data)}`);
    const again = await call('POST', '/ai/findings/dismiss', body);
    expect(again.status === 200 && again.data.already === true, 'bỏ qua lần hai phải trả already = true');
    const n = (await store.db.prepare('SELECT COUNT(*) AS n FROM ai_finding_actions').get()).n;
    expect(n === 1, `ai_finding_actions có ${n} dòng, kỳ vọng 1 (lần hai không ghi thêm)`);
  } else problems.push('không có phiếu pending nào có từ hai cờ để thử bỏ qua phát hiện');

  /* ---------- đường phụ: duyệt, loại phiếu lỗi, chi trả ---------- */
  if (args.full) {
    const decide = (items?, note?) =>
      call('PUT', `/periods/${month}/payslips/decide`, { items, action: 'approve', ...(note ? { note } : {}) });
    const fresh = (await listAll()).rows;
    const clean = fresh
      .filter(p => p.status === 'pending' && !p.flags.length)
      .map(p => ({ username: p.username, rev: p.rev }));
    for (let i = 0; i < clean.length; i += 200) {
      const r = await decide(clean.slice(i, i + 200));
      expect(r.status === 200, `duyệt lô phiếu sạch: HTTP ${r.status} ${short(r.data)}`);
    }
    const withFlags = fresh.filter(p => p.status === 'pending' && p.flags.length);
    // Phiếu có cờ chưa bỏ qua thì không duyệt được; sau khi bỏ qua từng cờ kèm lý do cũng KHÔNG vào lô nhiều phiếu (D9)
    const dismissAll = async (p?) => {
      for (const rule of p.flags) {
        const r = await call('POST', '/ai/findings/dismiss', {
          month,
          username: p.username,
          rule,
          reason: 'Demo: đã xem từng cờ trước khi duyệt'
        });
        expect(r.status === 200, `bỏ qua cờ ${rule}: HTTP ${r.status} ${short(r.data)}`);
      }
    };
    const pair = withFlags.slice(0, 2);
    const beforeDismiss = await decide(
      pair.map(p => ({ username: p.username, rev: p.rev })),
      'Demo: thử duyệt lô có cờ'
    );
    log(`Duyệt lô 2 phiếu có cờ: HTTP ${beforeDismiss.status} ${beforeDismiss.data.code || ''} (phải bị chặn, D9)`);
    expect(beforeDismiss.status === 409, 'phiếu có cờ AI không được vào lô nhiều phiếu (409)');
    for (const p of pair) await dismissAll(p);
    const afterDismiss = await decide(
      pair.map(p => ({ username: p.username, rev: p.rev })),
      'Demo: thử duyệt lô có cờ đã bỏ qua'
    );
    log(
      `Duyệt lô 2 phiếu có cờ ĐÃ bỏ qua: HTTP ${afterDismiss.status} ${afterDismiss.data.code || ''} (vẫn phải bị chặn, D9)`
    );
    expect(afterDismiss.status === 409, 'cờ đã bỏ qua vẫn không được vào lô nhiều phiếu (409)');
    for (const p of withFlags) {
      await dismissAll(p);
      const r = await decide([{ username: p.username, rev: p.rev }], 'Demo: đã xem từng cờ trước khi duyệt');
      expect(r.status === 200, `duyệt phiếu có cờ (từng phiếu): HTTP ${r.status} ${short(r.data)}`);
    }
    log(
      `Đã duyệt ${clean.length} phiếu sạch theo lô và ${withFlags.length} phiếu có cờ từng phiếu (bỏ qua từng cờ kèm lý do)`
    );
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
}

main()
  .then(result => {
    Date.now = realNow;
    server.closeAllConnections();
    server.close(() => {
      store.db.close();
      if (typeof args.keep !== 'string') fs.rmSync(work, { recursive: true, force: true });
      process.exit(result.problems.length ? 2 : 0);
    });
  })
  .catch(error => {
    Date.now = realNow;
    console.error(error);
    try {
      store.db.close();
    } catch {}
    process.exit(1);
  });
