'use strict';
// 10 Admin mở /api/attendance?month=2026-11 cùng lúc trên DB nguyên bản (chưa có chỉ mục), kèm 1 nhân sự gọi /api/punch mỗi 200 ms
const L = require('./lib');
const fs = require('node:fs'),
  path = require('node:path');
const SP = L.WORK;
(async () => {
  const label = 'heavy10';
  const db = path.join(SP, 'db', `${label}.sqlite`);
  L.copyDb(path.join(SP, 'db', 'base1000.sqlite'), db);
  const cookies = JSON.parse(fs.readFileSync(path.join(L.WORK, 'out', 'cookies.json')));
  const srv = await L.startServer({ db, shimNow: '2026-11-26T12:00:00+07:00', name: label });
  const c = L.makeClient();
  const c10 = L.makeClient(L.PORT, 2000, false);
  await L.sleep(1000);
  let probing = true;
  const pl = [];
  const probe = (async () => {
    while (probing) {
      const r = await c.request('GET', '/api/punch', { cookie: cookies.demo_bulk_0001 });
      pl.push({ at: Date.now(), ms: r.ms, s: r.status || r.error });
      await L.sleep(200);
    }
  })();
  await L.sleep(1000);
  const t0 = Date.now();
  const rs = await Promise.all(
    Array.from({ length: 10 }, () =>
      c10.request('GET', '/api/attendance?month=2026-11', { cookie: cookies.demo_admin })
    )
  );
  const wall = Date.now() - t0;
  probing = false;
  await probe;
  const lat = rs.map(r => Math.round(r.ms));
  const out = {
    wallMs: wall,
    adminStatuses: rs.map(r => r.status || r.error),
    adminLatMs: lat.sort((a, b) => a - b),
    probeMaxMs: Math.max(...pl.map(x => x.ms)),
    probeSamples: pl.length,
    peakRssMB: L.monSummary(srv.mon).rssMaxMB
  };
  fs.writeFileSync(path.join(L.WORK, 'out', 'heavy10.json'), JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out));
  c.destroy();
  c10.destroy();
  await srv.stop();
  for (const s of ['', '-wal', '-shm']) fs.rmSync(db + s, { force: true });
})().catch(e => {
  console.error(e);
  process.exit(1);
});
