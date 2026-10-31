const OUT = require('path').join(require('./lib').WORK, 'out');
const fs = require('fs');
const files = fs
  .readdirSync(OUT)
  .filter(f => /^ci(IDX)?-n.*\.json$/.test(f))
  .sort();
const pad = (x, n) => String(x).padStart(n);
console.log(
  'label'.padEnd(28),
  'in:wall  post/s  p50   p95   p99   max  | err | out:wall post/s p50  p95  p99 | getP95 | ok  rssMax cpuMax'
);
for (const f of files) {
  const o = JSON.parse(fs.readFileSync(OUT + '/' + f));
  const c = o.checkin,
    k = o.checkout;
  console.log(
    o.label.padEnd(28),
    pad(c.wallMs, 6),
    pad(c.postPerSec, 6),
    pad(c.postLat.p50, 6),
    pad(c.postLat.p95, 6),
    pad(c.postLat.p99, 6),
    pad(c.postLat.max, 6),
    '|',
    JSON.stringify(c.statuses),
    '|',
    k
      ? [
          pad(k.wallMs, 6),
          pad(k.postPerSec, 6),
          pad(k.postLat.p50, 6),
          pad(k.postLat.p95, 6),
          pad(k.postLat.p99, 6)
        ].join(' ')
      : '-',
    '|',
    pad(c.getLat.p95, 6),
    '|',
    o.dataOk,
    pad(o.peakRssMB, 6),
    pad(o.checkinMon.cpuMaxPct, 4)
  );
}
