'use strict';
// node s-one.js <url> [base] [shimNow]  : một yêu cầu admin, đo thời gian
const L = require('./lib');
const fs = require('node:fs'),
  path = require('node:path');
const SP = L.WORK;
(async () => {
  const url = process.argv[2];
  const base = process.argv[3] || 'base1000';
  const db = path.join(SP, 'db', `one-${base}.sqlite`);
  L.copyDb(path.join(SP, 'db', base + '.sqlite'), db);
  const cookies = JSON.parse(fs.readFileSync(path.join(L.WORK, 'out', 'cookies.json')));
  const prof = process.env.PROF ? ['--cpu-prof', '--cpu-prof-dir=' + process.env.PROF] : [];
  const srv = await L.startServer({
    db,
    shimNow: process.argv[4] || '2026-11-26T12:00:00+07:00',
    name: 'one',
    nodeArgs: prof
  });
  const c = L.makeClient();
  for (let i = 0; i < 2; i++) {
    const r = await c.request('GET', url, { cookie: cookies['demo_admin'] });
    console.log(url, r.status, Math.round(r.ms), 'ms', Math.round(r.bytes / 1024), 'KB');
  }
  c.destroy();
  await srv.stop();
})();
