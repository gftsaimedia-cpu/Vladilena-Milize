'use strict';
// node s-admin.js --round=1 [--base=base1000] [--tag=]
const L = require('./lib');
const fs = require('node:fs'),
  path = require('node:path');
const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v === undefined ? true : v];
  })
);
const ROUND = args.round || '1';
const BASE = args.base || 'base1000';
const TAG = args.tag || '';
const MONTH = '2026-10';
const SP = L.WORK;
const label = `admin${TAG}-r${ROUND}`;

const HEAVY = new Set(['GET /api/attendance?month=2026-11', 'GET /api/team?month=2026-11']);
const HEAVY_REPS = Number(args.heavyreps || 2);
const ENDPOINTS = [
  ['GET /api/today', '/api/today'],
  ['GET /api/attendance?month=2026-11', '/api/attendance?month=2026-11'],
  ['GET /api/team?month=2026-11', '/api/team?month=2026-11'],
  ['GET /api/approvals', '/api/approvals'],
  ['GET /api/staff', '/api/staff'],
  [`GET /api/periods/${MONTH}/estimates?pageSize=200 (trang 1)`, `/api/periods/${MONTH}/estimates?pageSize=200`]
];

(async () => {
  const db = path.join(SP, 'db', `${label}.sqlite`);
  L.copyDb(path.join(SP, 'db', BASE + '.sqlite'), db);
  const cookies = JSON.parse(fs.readFileSync(path.join(L.WORK, 'out', 'cookies.json')));
  const admin = cookies['demo_admin'];
  const staff = cookies['demo_bulk_0001'];
  const srv = await L.startServer({ db, shimNow: '2026-11-26T12:00:00+07:00', name: label });
  const c = L.makeClient();
  const c10 = L.makeClient(L.PORT, 2000, false); // mỗi Admin một kết nối mới mỗi lần (tránh lỗi tái dùng kết nối giữ-sống đã bị máy chủ đóng)
  const out = { label, single: {}, tenAdmins: {}, calc: {}, payslips: {} };
  await L.sleep(1200);
  out.idleRssMB = L.monSummary(srv.mon).rssLastMB;
  const warm = await c.request('GET', '/api/me', { cookie: admin });
  if (warm.status !== 200) throw new Error('cookie admin không dùng được ' + warm.status);

  // 1 Admin
  for (const [name, url] of ENDPOINTS) {
    const times = [];
    let last;
    const reps = HEAVY.has(name) ? HEAVY_REPS : 6;
    for (let i = 0; i < reps; i++) {
      last = await c.request('GET', url, { cookie: admin });
      times.push(last.ms);
    }
    const rest = times.length > 1 ? times.slice(1) : times;
    out.single[name] = {
      status: last.status,
      kb: Math.round(last.bytes / 1024),
      first: L.r1(times[0]),
      median: L.r1(L.pct(rest, 50)),
      max: L.r1(Math.max(...rest)),
      rows:
        last.json && (last.json.rows ? last.json.rows.length : last.json.items ? last.json.items.length : undefined),
      total: last.json && last.json.total
    };
    console.log(name, JSON.stringify(out.single[name]));
  }
  // đủ 1.000 người qua 5 trang estimates (mỗi trang tính lại cả kỳ?)
  {
    const t0 = Date.now();
    const times = [];
    for (let p = 1; p <= 5; p++) {
      const r = await c.request('GET', `/api/periods/${MONTH}/estimates?pageSize=200&page=${p}`, { cookie: admin });
      times.push(L.r1(r.ms));
    }
    out.single['estimates cả 1.000 người (5 trang x 200)'] = { totalMs: Date.now() - t0, pages: times };
    console.log('5 trang estimates', JSON.stringify(times));
  }

  // 10 Admin cùng lúc, kèm một nhân sự dò GET /api/punch mỗi 100 ms
  let probing = true;
  const probeLat = [];
  const probe = (async () => {
    while (probing) {
      const r = await c.request('GET', '/api/punch', { cookie: staff });
      probeLat.push(r.status === 200 ? r.ms : -1);
      await L.sleep(100);
    }
  })();
  // đo nền (không có Admin) trước
  await L.sleep(1500);
  const baseProbe = probeLat.splice(0);
  for (const [name, url] of ENDPOINTS) {
    if (HEAVY.has(name) && !args.heavy10) {
      out.tenAdmins[name] = { skipped: 'quá chậm (xem phép 1 Admin); đo riêng' };
      continue;
    }
    const lats = [];
    const errs = [];
    const mi = L.monIdx(srv.mon);
    const t0 = Date.now();
    for (let rep = 0; rep < 3; rep++) {
      const rs = await Promise.all(Array.from({ length: 10 }, () => c10.request('GET', url, { cookie: admin })));
      for (const r of rs) {
        lats.push(r.ms);
        if (r.status !== 200) errs.push(r.status || r.error);
      }
    }
    const pl = probeLat.splice(0);
    out.tenAdmins[name] = {
      n: lats.length,
      errors: errs.length,
      errKinds: [...new Set(errs)].join(','),
      p50: L.r1(L.pct(lats, 50)),
      p95: L.r1(L.pct(lats, 95)),
      max: L.r1(Math.max(...lats)),
      wallPerBatchMs: Math.round((Date.now() - t0) / 3),
      probe: { n: pl.length, p50: L.r1(L.pct(pl, 50)), p95: L.r1(L.pct(pl, 95)), max: L.r1(Math.max(...pl)) }
    };
    console.log('10 admin', name, JSON.stringify(out.tenAdmins[name]));
  }
  probing = false;
  await probe;
  out.probeBaseline = {
    n: baseProbe.length,
    p50: L.r1(L.pct(baseProbe, 50)),
    p95: L.r1(L.pct(baseProbe, 95)),
    max: L.r1(Math.max(...baseProbe))
  };

  // Chốt công và tính lương cả kỳ
  const view = await c.request('GET', `/api/periods/${MONTH}`, { cookie: admin });
  out.calc.initialStatus = view.json && view.json.status;
  if (view.json && view.json.status === 'open') {
    const probe0 = await c.request('POST', `/api/periods/${MONTH}/lock-attendance`, {
      cookie: admin,
      body: { rev: view.json.rev }
    });
    if (probe0.status === 200) out.calc.lock = { status: 200, ms: L.r1(probe0.ms), note: 'qua ngay' };
    else {
      const lock = await c.request('POST', `/api/periods/${MONTH}/lock-attendance`, {
        cookie: admin,
        body: {
          rev: view.json.rev,
          reason: 'Đo hiệu năng trên dữ liệu demo',
          acknowledge: ((probe0.json && probe0.json.checklist) || []).filter(i => i.acknowledgeable).map(i => i.code)
        }
      });
      out.calc.lock = {
        status: lock.status,
        ms: L.r1(lock.ms),
        err: lock.status === 200 ? undefined : lock.text.slice(0, 200)
      };
    }
  }
  const after = await c.request('GET', `/api/periods/${MONTH}`, { cookie: admin });
  if (after.json && after.json.status === 'attendance_locked') {
    const mi = L.monIdx(srv.mon);
    const calc = await c.request('POST', `/api/periods/${MONTH}/calculate`, {
      cookie: admin,
      body: { rev: after.json.rev }
    });
    out.calc.calculate = {
      status: calc.status,
      ms: L.r1(calc.ms),
      err: calc.status === 200 ? undefined : calc.text.slice(0, 200),
      mon: L.monSummary(srv.mon, mi)
    };
  } else out.calc.calculate = { skipped: after.json && after.json.status };
  console.log('calc', JSON.stringify(out.calc));

  // Danh sách phiếu
  const ps = [];
  const t0 = Date.now();
  let total = 0;
  for (let p = 1; p <= 5; p++) {
    const r = await c.request('GET', `/api/periods/${MONTH}/payslips?pageSize=200&page=${p}`, { cookie: admin });
    ps.push(L.r1(r.ms));
    total += r.json && r.json.rows ? r.json.rows.length : 0;
  }
  out.payslips.fiveByTwoHundred = { totalMs: Date.now() - t0, pages: ps, rows: total };
  const one = [];
  for (let i = 0; i < 5; i++)
    one.push((await c.request('GET', `/api/periods/${MONTH}/payslips?pageSize=200`, { cookie: admin })).ms);
  out.payslips.page200 = { median: L.r1(L.pct(one, 50)), max: L.r1(Math.max(...one)) };
  const viewT = [];
  for (let i = 0; i < 5; i++) viewT.push((await c.request('GET', `/api/periods/${MONTH}`, { cookie: admin })).ms);
  out.payslips.periodView = { median: L.r1(L.pct(viewT, 50)), max: L.r1(Math.max(...viewT)) };
  for (const name of ['payslips pageSize=200 (10 Admin)']) {
    const lats = [];
    const errs = [];
    for (let rep = 0; rep < 3; rep++) {
      const rs = await Promise.all(
        Array.from({ length: 10 }, () =>
          c10.request('GET', `/api/periods/${MONTH}/payslips?pageSize=200`, { cookie: admin })
        )
      );
      for (const r of rs) {
        lats.push(r.ms);
        if (r.status !== 200) errs.push(r.status);
      }
    }
    out.payslips.tenAdmins = {
      n: lats.length,
      errors: errs.length,
      p50: L.r1(L.pct(lats, 50)),
      p95: L.r1(L.pct(lats, 95)),
      max: L.r1(Math.max(...lats))
    };
  }
  console.log('payslips', JSON.stringify(out.payslips));
  out.peakRssMB = L.monSummary(srv.mon).rssMaxMB;
  out.mon = L.monSummary(srv.mon);
  fs.writeFileSync(path.join(L.WORK, 'out', `${label}.json`), JSON.stringify(out, null, 1));
  c.destroy();
  await srv.stop();
  for (const s of ['', '-wal', '-shm']) fs.rmSync(db + s, { force: true });
})().catch(e => {
  console.error(e);
  process.exit(1);
});
