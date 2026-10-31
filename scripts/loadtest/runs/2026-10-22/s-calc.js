'use strict';
// node s-calc.js --round=1 [--reps=3] [--base=base1000] [--tag=]
const L = require('./lib');
const fs = require('node:fs'),
  path = require('node:path');
const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v === undefined ? true : v];
  })
);
const ROUND = args.round || '1',
  REPS = Number(args.reps || 3),
  BASE = args.base || 'base1000',
  TAG = args.tag || '';
const MONTH = '2026-10';
const SP = L.WORK;
(async () => {
  const cookies = JSON.parse(fs.readFileSync(path.join(L.WORK, 'out', 'cookies.json')));
  const admin = cookies['demo_admin'];
  const runs = [];
  for (let i = 1; i <= REPS; i++) {
    const label = `calc${TAG}-r${ROUND}-${i}`;
    const db = path.join(SP, 'db', `${label}.sqlite`);
    L.copyDb(path.join(SP, 'db', BASE + '.sqlite'), db);
    const srv = await L.startServer({ db, shimNow: '2026-11-26T12:00:00+07:00', name: label });
    const c = L.makeClient();
    await L.sleep(1000);
    const row = { i, idleRssMB: L.monSummary(srv.mon).rssLastMB };
    const view = await c.request('GET', `/api/periods/${MONTH}`, { cookie: admin });
    const probe = await c.request('POST', `/api/periods/${MONTH}/lock-attendance`, {
      cookie: admin,
      body: { rev: view.json.rev }
    });
    const lock =
      probe.status === 200
        ? probe
        : await c.request('POST', `/api/periods/${MONTH}/lock-attendance`, {
            cookie: admin,
            body: {
              rev: view.json.rev,
              reason: 'Đo hiệu năng trên dữ liệu demo',
              acknowledge: ((probe.json && probe.json.checklist) || []).filter(x => x.acknowledgeable).map(x => x.code)
            }
          });
    row.lock = { status: lock.status, ms: L.r1(lock.ms) };
    const after = await c.request('GET', `/api/periods/${MONTH}`, { cookie: admin });
    const mi = L.monIdx(srv.mon);
    // trong lúc tính, một nhân sự gọi /api/punch
    const staffProbe = (async () => {
      await L.sleep(300);
      return c.request('GET', '/api/punch', { cookie: cookies['demo_bulk_0001'] });
    })();
    const calc = await c.request('POST', `/api/periods/${MONTH}/calculate`, {
      cookie: admin,
      body: { rev: after.json.rev }
    });
    const sp = await staffProbe;
    row.calculate = {
      status: calc.status,
      ms: L.r1(calc.ms),
      err: calc.status === 200 ? undefined : calc.text.slice(0, 200),
      staffWaitedMs: L.r1(sp.ms),
      mon: L.monSummary(srv.mon, mi)
    };
    const est = await c.request('GET', `/api/periods/${MONTH}/estimates?pageSize=200`, { cookie: admin });
    row.estimatesAfterCalc = { status: est.status, ms: L.r1(est.ms) };
    const ps = await c.request('GET', `/api/periods/${MONTH}/payslips?pageSize=200`, { cookie: admin });
    row.payslips200 = { status: ps.status, ms: L.r1(ps.ms), total: ps.json && ps.json.total };
    row.peakRssMB = L.monSummary(srv.mon).rssMaxMB;
    runs.push(row);
    console.log(JSON.stringify(row));
    c.destroy();
    await srv.stop();
    for (const s of ['', '-wal', '-shm']) fs.rmSync(db + s, { force: true });
  }
  fs.writeFileSync(path.join(L.WORK, 'out', `calc${TAG}-r${ROUND}.json`), JSON.stringify(runs, null, 1));
})().catch(e => {
  console.error(e);
  process.exit(1);
});
