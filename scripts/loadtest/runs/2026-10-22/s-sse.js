'use strict';
// node s-sse.js --n=1000 --round=1 [--extra=0] [--base=base1000]
const L = require('./lib');
const http = require('node:http');
const fs = require('node:fs'),
  path = require('node:path');
const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v === undefined ? true : v];
  })
);
const N = Number(args.n || 1000),
  ROUND = args.round || '1',
  EXTRA = Number(args.extra || 0),
  BASE = args.base || 'base1000';
const SP = L.WORK;
const label = `sse-${N}-r${ROUND}`;
const NS = () => process.hrtime.bigint();

function openSse(cookie) {
  return new Promise(resolve => {
    const t0 = NS();
    const req = http.request(
      { host: '127.0.0.1', port: L.PORT, path: '/api/events', method: 'GET', agent: false, headers: { cookie } },
      res => {
        const conn = { req, status: res.statusCode, openMs: Number(NS() - t0) / 1e6, frames: [] };
        res.setEncoding('utf8');
        res.on('data', d => conn.frames.push({ at: NS(), text: d }));
        resolve(conn);
      }
    );
    req.on('error', () => resolve({ req, status: 0, frames: [], openMs: Number(NS() - t0) / 1e6 }));
    req.end();
  });
}

(async () => {
  const db = path.join(SP, 'db', `${label}.sqlite`);
  L.copyDb(path.join(SP, 'db', BASE + '.sqlite'), db);
  const cookies = JSON.parse(fs.readFileSync(path.join(L.WORK, 'out', 'cookies.json')));
  const srv = await L.startServer({ db, shimNow: '2026-11-26T12:00:00+07:00', name: label });
  const c = L.makeClient();
  const out = { label, N };
  const admin = cookies['demo_admin'];
  await c.request('GET', '/api/me', { cookie: admin });
  await L.sleep(2000);
  out.rssIdleMB = L.monSummary(srv.mon).rssLastMB;
  const probeIdle = [];
  for (let i = 0; i < 20; i++)
    probeIdle.push((await c.request('GET', '/api/punch', { cookie: cookies['demo_bulk_0001'] })).ms);
  out.probeIdle = { p50: L.r1(L.pct(probeIdle, 50)), max: L.r1(Math.max(...probeIdle)) };

  const users = Math.ceil(N / 5);
  const names = L.bulkNames(1000).slice(0, users);
  const conns = [];
  const t0 = Date.now();
  for (const u of names) for (let k = 0; k < 5 && conns.length < N; k++) conns.push(await openSse(cookies[u]));
  out.open = {
    total: conns.length,
    ok200: conns.filter(x => x.status === 200).length,
    wallMs: Date.now() - t0,
    openP95: L.r1(
      L.pct(
        conns.map(x => x.openMs),
        95
      )
    ),
    openMax: L.r1(Math.max(...conns.map(x => x.openMs)))
  };
  await L.sleep(2500);
  out.rssWithSseMB = L.monSummary(srv.mon).rssLastMB;
  // CPU nhàn rỗi với N luồng trong 30 s (đủ 1 nhịp tim 25 s)
  const m0 = L.monIdx(srv.mon);
  await L.sleep(30000);
  out.idle30s = L.monSummary(srv.mon, m0);
  // Nhân sự nhẹ khi có N luồng mở
  const probeSse = [];
  for (let i = 0; i < 20; i++)
    probeSse.push((await c.request('GET', '/api/punch', { cookie: cookies['demo_bulk_0001'] })).ms);
  out.probeWithSse = { p50: L.r1(L.pct(probeSse, 50)), max: L.r1(Math.max(...probeSse)) };
  // Thử vượt trần
  if (EXTRA) {
    const extra = [];
    const more = L.bulkNames(1000).slice(users, users + Math.ceil(EXTRA / 5));
    for (const u of more) for (let k = 0; k < 5 && extra.length < EXTRA; k++) extra.push(await openSse(cookies[u]));
    const st = {};
    for (const x of extra) st[x.status] = (st[x.status] || 0) + 1;
    out.overCap = { tried: extra.length, statuses: st };
    for (const x of extra)
      try {
        x.req.destroy();
      } catch {}
  }
  // Phát một sự kiện cho tất cả
  const effective = '2026-11';
  const rev = (await c.request('GET', `/api/settings/params?group=2&month=${effective}`, { cookie: admin })).json;
  const mi = L.monIdx(srv.mon);
  const mark = NS();
  const res = await c.request('PUT', '/api/settings/params', {
    cookie: admin,
    body: {
      changes: [{ key: 'level.nv.1.base', value: 6500000 }],
      effectiveMonth: effective,
      reason: 'Đo độ trễ phát SSE trên dữ liệu demo',
      expectedRev: rev && rev.paramsRev
    }
  });
  out.broadcast = {
    putStatus: res.status,
    putMs: L.r1(res.ms),
    err: res.status === 200 ? undefined : res.text.slice(0, 200)
  };
  await L.sleep(3000);
  const lat = conns
    .map(x => x.frames.find(f => /params\.changed/.test(f.text)))
    .filter(Boolean)
    .map(f => Number(f.at - mark) / 1e6);
  out.broadcast.received = lat.length;
  out.broadcast.latMs = lat.length
    ? { min: L.r1(Math.min(...lat)), p50: L.r1(L.pct(lat, 50)), p95: L.r1(L.pct(lat, 95)), max: L.r1(Math.max(...lat)) }
    : null;
  out.broadcast.mon = L.monSummary(srv.mon, mi);
  out.rssAfterMB = L.monSummary(srv.mon).rssLastMB;
  out.peakRssMB = L.monSummary(srv.mon).rssMaxMB;
  for (const x of conns)
    try {
      x.req.destroy();
    } catch {}
  await L.sleep(1500);
  c.destroy();
  await srv.stop();
  fs.writeFileSync(path.join(L.WORK, 'out', `${label}.json`), JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out, null, 1));
  for (const s of ['', '-wal', '-shm']) fs.rmSync(db + s, { force: true });
})().catch(e => {
  console.error(e);
  process.exit(1);
});
