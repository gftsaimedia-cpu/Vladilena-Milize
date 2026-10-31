'use strict';
const L = require('./lib');
const fs = require('node:fs'),
  path = require('node:path');
const round = process.argv[2] || '1';
const SP = L.WORK;
(async () => {
  const db = path.join(SP, 'db', `login-r${round}.sqlite`);
  L.copyDb(path.join(SP, 'db', 'base1000.sqlite'), db);
  const srv = await L.startServer({ db, shimNow: '2026-11-26T08:00:00+07:00', name: `login-r${round}` });
  const c = L.makeClient();
  const out = {};
  const names = L.bulkNames(1000);
  let r = await L.loginAll(c, names.slice(0, 100), 1);
  out.serial100 = { ...r, cookies: undefined };
  r = await L.loginAll(c, ['demo_admin', ...names], 50);
  out.conc50_1000 = { ...r, cookies: undefined };
  fs.writeFileSync(path.join(L.WORK, 'out', 'cookies.json'), JSON.stringify(r.cookies));
  out.mon = L.monSummary(srv.mon);
  console.log(JSON.stringify(out, null, 1));
  fs.writeFileSync(path.join(L.WORK, 'out', `login-r${round}.json`), JSON.stringify(out, null, 1));
  c.destroy();
  await srv.stop();
})().catch(e => {
  console.error(e);
  process.exit(1);
});
