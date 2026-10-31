const L = require('./lib'),
  fs = require('fs'),
  path = require('path');
(async () => {
  const base = process.argv[2];
  const SP = L.WORK;
  const db = path.join(SP, 'db', 'test-reset.sqlite');
  L.copyDb(path.join(SP, 'db', base + '.sqlite'), db);
  const ck = JSON.parse(fs.readFileSync(path.join(L.WORK, 'out', 'cookies.json')));
  const srv = await L.startServer({ db, shimNow: '2026-11-26T12:00:00+07:00', name: 'test-reset' });
  const c10 = L.makeClient(L.PORT, 2000, false);
  await L.sleep(1000);
  const t0 = Date.now();
  const rs = await Promise.all(
    Array.from({ length: 3 }, () => c10.request('GET', '/api/attendance?month=2026-11', { cookie: ck.demo_admin }))
  );
  console.log(base, 'wall', Date.now() - t0, rs.map(r => (r.status || r.error) + ':' + Math.round(r.ms)).join(' '));
  await srv.stop();
})();
