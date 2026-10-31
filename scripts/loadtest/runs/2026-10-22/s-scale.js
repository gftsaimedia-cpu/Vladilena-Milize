'use strict';
// node s-scale.js --base=base300 --round=1 [--att=1] : thời gian 1 Admin theo số nhân sự
const L = require('./lib');
const fs = require('node:fs'),
  path = require('node:path');
const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v === undefined ? true : v];
  })
);
const BASE = args.base || 'base300';
const ROUND = args.round || '1';
const SP = L.WORK;
(async () => {
  const label = `scale-${BASE}-r${ROUND}`;
  const db = path.join(SP, 'db', `${label}.sqlite`);
  L.copyDb(path.join(SP, 'db', BASE + '.sqlite'), db);
  const cookiesAll = JSON.parse(fs.readFileSync(path.join(L.WORK, 'out', 'cookies.json')));
  const srv = await L.startServer({ db, shimNow: '2026-11-26T12:00:00+07:00', name: label });
  const c = L.makeClient();
  const admin = cookiesAll['demo_admin'];
  await L.sleep(1000);
  const staffCount = (await c.request('GET', '/api/today', { cookie: admin })).json.rows.length;
  const out = { label, staffCount, ms: {} };
  const med = async (name, url, reps = 5) => {
    const t = [];
    let last;
    for (let i = 0; i < reps; i++) {
      last = await c.request('GET', url, { cookie: admin });
      t.push(last.ms);
    }
    out.ms[name] = { median: L.r1(L.pct(t, 50)), max: L.r1(Math.max(...t)), status: last.status };
    console.log(name, JSON.stringify(out.ms[name]));
  };
  await med('today', '/api/today');
  await med('approvals', '/api/approvals');
  await med('staff', '/api/staff');
  await med('estimates', '/api/periods/2026-10/estimates?pageSize=200');
  await med('periodView', '/api/periods/2026-10', 3);
  if (args.att) {
    await med('attendance', '/api/attendance?month=2026-11', 1);
    await med('team', '/api/team?month=2026-11', 1);
  }
  const view = await c.request('GET', '/api/periods/2026-10', { cookie: admin });
  const probe = await c.request('POST', '/api/periods/2026-10/lock-attendance', {
    cookie: admin,
    body: { rev: view.json.rev }
  });
  const lock =
    probe.status === 200
      ? probe
      : await c.request('POST', '/api/periods/2026-10/lock-attendance', {
          cookie: admin,
          body: {
            rev: view.json.rev,
            reason: 'Đo hiệu năng trên dữ liệu demo',
            acknowledge: ((probe.json && probe.json.checklist) || []).filter(x => x.acknowledgeable).map(x => x.code)
          }
        });
  const after = await c.request('GET', '/api/periods/2026-10', { cookie: admin });
  const calc = await c.request('POST', '/api/periods/2026-10/calculate', {
    cookie: admin,
    body: { rev: after.json.rev }
  });
  out.ms.lock = { ms: L.r1(lock.ms), status: lock.status };
  out.ms.calculate = { ms: L.r1(calc.ms), status: calc.status };
  console.log('lock', JSON.stringify(out.ms.lock), 'calculate', JSON.stringify(out.ms.calculate));
  fs.writeFileSync(path.join(L.WORK, 'out', `${label}.json`), JSON.stringify(out, null, 1));
  c.destroy();
  await srv.stop();
  for (const s of ['', '-wal', '-shm']) fs.rmSync(db + s, { force: true });
})().catch(e => {
  console.error(e);
  process.exit(1);
});
