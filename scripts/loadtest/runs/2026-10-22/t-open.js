const L = require('./lib'),
  fs = require('fs'),
  path = require('path');
(async () => {
  const SP = L.WORK;
  const db = path.join(SP, 'db', 'test-open.sqlite');
  L.copyDb(path.join(SP, 'db', (process.argv[2] || 'base1000') + '.sqlite'), db);
  const ck = JSON.parse(fs.readFileSync(path.join(L.WORK, 'out', 'cookies.json')));
  const srv = await L.startServer({ db, shimNow: '2026-11-26T08:00:00+07:00', name: 'test-open' });
  const c = L.makeClient();
  await L.sleep(1000);
  const names = L.bulkNames(1000);
  const eps = {
    me: '/api/me',
    punch: '/api/punch',
    sheet: '/api/sheet?month=2026-11',
    'me/estimate': '/api/me/estimate?month=2026-11',
    'sheet 2026-10': '/api/sheet?month=2026-10'
  };
  for (const [k, u] of Object.entries(eps)) {
    const t = [];
    let sz = 0;
    for (let i = 0; i < 40; i++) {
      const r = await c.request('GET', u, { cookie: ck[names[i]] });
      t.push(r.ms);
      sz = r.bytes;
      if (r.status !== 200) console.log('ERR', k, r.status);
    }
    console.log(
      k.padEnd(14),
      'median',
      L.r1(L.pct(t, 50)),
      'p95',
      L.r1(L.pct(t, 95)),
      'ms',
      Math.round(sz / 1024),
      'KB'
    );
  }
  await srv.stop();
})();
