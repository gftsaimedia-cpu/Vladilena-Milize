'use strict';
// node s-growth.js --mult=1 --round=1 [--base=base1000]: chi phí 1 lượt Check-in/GET punch khi bảng punches lớn dần (nhân bản dòng punches vào DB tạm)
const L = require('./lib');
const fs = require('node:fs'),
  path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v === undefined ? true : v];
  })
);
const MULT = Number(args.mult || 1),
  ROUND = args.round || '1',
  BASE = args.base || 'base1000';
const SP = L.WORK;
const DATE = '2026-11-26';
(async () => {
  const label = `growth-${BASE}-x${MULT}-r${ROUND}`;
  const db = path.join(SP, 'db', `${label}.sqlite`);
  L.copyDb(path.join(SP, 'db', BASE + '.sqlite'), db);
  const d = new DatabaseSync(db);
  d.exec(`DELETE FROM punches WHERE session_id IN (SELECT id FROM attendance_sessions WHERE date='${DATE}')`);
  d.exec(`DELETE FROM attendance_sessions WHERE date='${DATE}'`);
  const before = d.prepare('SELECT COUNT(*) n FROM punches').get().n;
  for (let k = 1; k < MULT; k++)
    d.exec(
      `INSERT INTO punches(username,at,type,ip,auto,context_json,session_id) SELECT username,at,type,ip,auto,context_json,session_id+${k * 10000000} FROM punches WHERE session_id < 10000000 AND at < '2026-11-26'`
    );
  const rows = d.prepare('SELECT COUNT(*) n FROM punches').get().n;
  d.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  d.close();
  const cookies = JSON.parse(fs.readFileSync(path.join(L.WORK, 'out', 'cookies.json')));
  const srv = await L.startServer({ db, shimNow: `${DATE}T08:00:00+07:00`, name: label });
  const c = L.makeClient();
  await L.sleep(1000);
  const names = L.bulkNames(60);
  const gets = [],
    posts = [],
    sids = {};
  for (let i = 0; i < 5; i++) await c.request('GET', '/api/punch', { cookie: cookies[names[59]] }); // làm nóng
  for (const u of names.slice(0, 40)) {
    gets.push((await c.request('GET', '/api/punch', { cookie: cookies[u] })).ms);
    const r = await c.request('POST', '/api/punch', {
      cookie: cookies[u],
      body: {
        type: 'in',
        requestId: 'g-' + u + Math.random().toString(36).slice(2, 8),
        location: { lat: 21.0285, lng: 105.8542, accuracy: 20 }
      }
    });
    if (r.status !== 200) throw new Error('check-in lỗi ' + r.status + r.text);
    posts.push(r.ms);
  }
  const out = {
    label,
    punchRowsBefore: before,
    punchRows: rows,
    mult: MULT,
    getMedianMs: L.r1(L.pct(gets, 50)),
    checkinMedianMs: L.r1(L.pct(posts, 50)),
    checkinP95Ms: L.r1(L.pct(posts, 95))
  };
  fs.writeFileSync(path.join(L.WORK, 'out', `${label}.json`), JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out));
  c.destroy();
  await srv.stop();
  for (const s of ['', '-wal', '-shm']) fs.rmSync(db + s, { force: true });
})().catch(e => {
  console.error(e);
  process.exit(1);
});
