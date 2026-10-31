const OUT = require('path').join(require('./lib').WORK, 'out');
const fs = require('fs');
const files = fs
  .readdirSync(OUT)
  .filter(f => /^ci(IDX)?-n300-c0-spread\d+-open-r\d\.json$/.test(f))
  .sort();
for (const f of files) {
  const o = require(OUT + '/' + f);
  const c = o.checkin;
  console.log(
    o.label.padEnd(34),
    'rate/s',
    (300 / Number(/spread(\d+)/.exec(f)[1])).toFixed(1),
    '| mở-app(4 GET) p50/p95/max',
    c.getLat.p50,
    c.getLat.p95,
    c.getLat.max,
    '| bấm Check-in p50/p95/max',
    c.postLat.p50,
    c.postLat.p95,
    c.postLat.max,
    '|',
    JSON.stringify(c.statuses),
    '| openFail',
    JSON.stringify(o.openFail),
    '| retries',
    o.retries || 0,
    '| db',
    o.dataOk,
    'cpuAvg',
    o.checkinMon.cpuAvgPct
  );
}
