'use strict';
// node s-burst.js --round=1 : M kết nối mới đồng thời (mỗi yêu cầu một kết nối riêng, như 1.000 điện thoại), xem có bị từ chối không
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
const ROUND = args.round || '1';
const SP = L.WORK;
function one(cookie, url) {
  return new Promise(resolve => {
    const t0 = process.hrtime.bigint();
    const req = http.request(
      { host: '127.0.0.1', port: L.PORT, path: url, method: 'GET', agent: false, headers: { cookie } },
      res => {
        res.resume();
        res.on('end', () => resolve({ status: res.statusCode, ms: Number(process.hrtime.bigint() - t0) / 1e6 }));
      }
    );
    req.on('error', e => resolve({ status: 0, error: e.code, ms: Number(process.hrtime.bigint() - t0) / 1e6 }));
    req.end();
  });
}
(async () => {
  const label = `burst-r${ROUND}`;
  const db = path.join(SP, 'db', `${label}.sqlite`);
  L.copyDb(path.join(SP, 'db', 'base1000.sqlite'), db);
  const cookies = JSON.parse(fs.readFileSync(path.join(L.WORK, 'out', 'cookies.json')));
  const names = L.bulkNames(1000);
  const srv = await L.startServer({ db, shimNow: '2026-11-26T08:00:00+07:00', name: label });
  const out = [];
  for (const [url, label2] of [
    ['/api/me', 'GET /api/me (rất nhẹ)'],
    ['/api/punch', 'GET /api/punch (nhẹ)']
  ]) {
    for (const M of [200, 500, 800, 1000, 1500, 2000]) {
      const rs = await Promise.all(Array.from({ length: M }, (_, i) => one(cookies[names[i % 1000]], url)));
      const st = {};
      for (const r of rs) st[r.status || r.error] = (st[r.status || r.error] || 0) + 1;
      const okMs = rs.filter(r => r.status === 200).map(r => r.ms);
      const row = {
        url: label2,
        M,
        statuses: st,
        okP50: L.r1(L.pct(okMs, 50)),
        okP95: L.r1(L.pct(okMs, 95)),
        okMax: L.r1(Math.max(...okMs)),
        alive: srv.child.exitCode === null
      };
      out.push(row);
      console.log(JSON.stringify(row));
      await L.sleep(3000);
    }
  }
  await srv.stop();
  fs.writeFileSync(path.join(L.WORK, 'out', `${label}.json`), JSON.stringify(out, null, 1));
  for (const s of ['', '-wal', '-shm']) fs.rmSync(db + s, { force: true });
})().catch(e => {
  console.error(e);
  process.exit(1);
});
