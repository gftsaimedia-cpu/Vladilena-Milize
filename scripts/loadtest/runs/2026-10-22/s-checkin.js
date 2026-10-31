'use strict';
// node s-checkin.js --n=1000 --conc=50 --round=1 [--sse=0] [--admins=0] [--checkout=1] [--base=base1000]
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
const N = Number(args.n || 100),
  CONC = Number(args.conc || 50),
  ROUND = args.round || '1',
  SSE = Number(args.sse || 0),
  ADMINS = Number(args.admins || 0);
const CHECKOUT = args.checkout === undefined ? true : args.checkout !== '0';
const BASE = args.base || 'base1000';
const OPEN = args.open === '1'; // mô phỏng mở ứng dụng: 4 yêu cầu GET như NV.reloadAll rồi mới bấm Check-in
const SPREAD = Number(args.spread || 0); // giây: thời điểm bắt đầu của mỗi người rải đều ngẫu nhiên trong khoảng này (mở, không giới hạn đồng thời)
const runTasks = async (tasks, conc) =>
  SPREAD ? Promise.all(tasks.map(t => L.sleep(Math.random() * SPREAD * 1000).then(t))) : await L.pool(tasks, conc);
const label = `ci${BASE === 'base1000' ? '' : 'IDX'}-n${N}-c${CONC}${args.ka === '0' ? '-nka' : ''}${args.retry === '1' ? '-retry' : ''}${SPREAD ? '-spread' + SPREAD : ''}${OPEN ? '-open' : ''}${SSE ? '-sse' + SSE : ''}${ADMINS ? '-adm' + ADMINS : ''}-r${ROUND}`;
const SP = L.WORK;
const DATE = '2026-11-26';

function openSse(cookie) {
  return new Promise(resolve => {
    const http = require('node:http');
    const req = http.request(
      { host: '127.0.0.1', port: L.PORT, path: '/api/events', method: 'GET', agent: false, headers: { cookie } },
      res => {
        res.on('data', () => {});
        resolve({ status: res.statusCode, req });
      }
    );
    req.on('error', () => resolve({ status: 0, req }));
    req.end();
  });
}
const summarize = arr => ({
  n: arr.length,
  p50: L.r1(L.pct(arr, 50)),
  p95: L.r1(L.pct(arr, 95)),
  p99: L.r1(L.pct(arr, 99)),
  max: L.r1(Math.max(...arr)),
  mean: L.r1(arr.reduce((a, b) => a + b, 0) / arr.length)
});

(async () => {
  const db = path.join(SP, 'db', `${label}.sqlite`);
  L.copyDb(path.join(SP, 'db', BASE + '.sqlite'), db);
  {
    const d = new DatabaseSync(db);
    d.exec(`DELETE FROM punches WHERE session_id IN (SELECT id FROM attendance_sessions WHERE date='${DATE}')`);
    d.exec(`DELETE FROM attendance_sessions WHERE date='${DATE}'`);
    d.close();
  }
  const cookies = JSON.parse(fs.readFileSync(path.join(L.WORK, 'out', 'cookies.json')));
  const names = L.bulkNames(N);
  const srv = await L.startServer({ db, shimNow: `${DATE}T08:00:00+07:00`, name: label });
  const KA = args.ka !== '0';
  const RETRY = args.retry === '1';
  let retries = 0;
  const c0 = L.makeClient(L.PORT, 2000, KA);
  const c = {
    ...c0,
    request: async (m, u, o) => {
      const t0 = Date.now();
      let r = await c0.request(m, u, o);
      for (let a = 0; RETRY && r.status === 0 && a < 8; a++) {
        retries++;
        await L.sleep(500 + Math.random() * 1500);
        r = await c0.request(m, u, o);
      }
      if (RETRY) r.ms = Date.now() - t0;
      return r;
    }
  };
  const out = { label, N, CONC, SSE, ADMINS };
  const me = await c.request('GET', '/api/me', { cookie: cookies[names[0]] });
  if (me.status !== 200) throw new Error('cookie cũ không dùng được: ' + me.status);
  await L.sleep(1200);
  out.idleRssMB = L.monSummary(srv.mon).rssLastMB;
  const sseConns = [];
  if (SSE) {
    const users = Math.ceil(SSE / 5);
    const sseNames = L.bulkNames(1000).slice(1000 - users);
    for (const u of sseNames) for (let k = 0; k < 5; k++) sseConns.push(await openSse(cookies[u]));
    out.sseOpen = sseConns.filter(s => s.status === 200).length;
    await L.sleep(1500);
    out.rssWithSseMB = L.monSummary(srv.mon).rssLastMB;
  }
  let stopAdmins = false;
  const adminLat = {};
  const adminLoops = [];
  const adminCookie = cookies['demo_admin'];
  if (ADMINS) {
    const eps = ['/api/today', '/api/attendance?month=2026-11', '/api/approvals'];
    for (let a = 0; a < ADMINS; a++)
      adminLoops.push(
        (async () => {
          let k = a;
          while (!stopAdmins) {
            const ep = eps[k++ % eps.length];
            const r = await c.request('GET', ep, { cookie: adminCookie });
            (adminLat[ep] ||= []).push(r.status === 200 ? r.ms : -1);
            await L.sleep(500);
          }
        })()
      );
  }
  const mi0 = L.monIdx(srv.mon);
  const rid = (p, u) => `${p}-${u}-${Math.random().toString(36).slice(2, 10)}`;
  const openFail = {};
  const getLat = [],
    inLat = [],
    statuses = {},
    errs = {};
  const sessionIds = {};
  const note = r => {
    const k = r.status || r.error;
    statuses[k] = (statuses[k] || 0) + 1;
    if (r.status !== 200) {
      const m = (r.json && r.json.error) || r.error || r.status;
      errs[m] = (errs[m] || 0) + 1;
    }
  };
  const t0 = Date.now();
  await runTasks(
    names.map(u => async () => {
      let g;
      if (OPEN) {
        const t0 = Date.now();
        const rs = await Promise.all([
          c.request('GET', '/api/me', { cookie: cookies[u] }),
          c.request('GET', '/api/punch', { cookie: cookies[u] }),
          c.request('GET', '/api/sheet?month=2026-11', { cookie: cookies[u] }),
          c.request('GET', '/api/me/estimate?month=2026-11', { cookie: cookies[u] })
        ]);
        g = { ms: Date.now() - t0 };
        for (const x of rs)
          if (x.status !== 200) openFail[x.status || x.error] = (openFail[x.status || x.error] || 0) + 1;
      } else g = await c.request('GET', '/api/punch', { cookie: cookies[u] });
      getLat.push(g.ms);
      const r = await c.request('POST', '/api/punch', {
        cookie: cookies[u],
        body: { type: 'in', requestId: rid('in', u), location: { lat: 21.0285, lng: 105.8542, accuracy: 20 } }
      });
      inLat.push(r.ms);
      note(r);
      if (r.status === 200 && r.json)
        sessionIds[u] = (r.json.openSession && r.json.openSession.id) || (r.json.open && r.json.open.id);
    }),
    CONC
  );
  const wallIn = Date.now() - t0;
  out.checkin = {
    wallMs: wallIn,
    reqPerSec: L.r1(((2 * N) / wallIn) * 1000),
    postPerSec: L.r1((N / wallIn) * 1000),
    getLat: summarize(getLat),
    postLat: summarize(inLat),
    statuses,
    errors: errs
  };
  out.checkinMon = L.monSummary(srv.mon, mi0);
  if (CHECKOUT) {
    await L.sleep(1000);
    const outLat = [],
      st2 = {},
      er2 = {};
    const mi1 = L.monIdx(srv.mon);
    const t1 = Date.now();
    await runTasks(
      names.map(u => async () => {
        const r = await c.request('POST', '/api/punch', {
          cookie: cookies[u],
          body: { type: 'out', sessionId: sessionIds[u], requestId: rid('out', u) }
        });
        outLat.push(r.ms);
        const k = r.status || r.error;
        st2[k] = (st2[k] || 0) + 1;
        if (r.status !== 200) {
          const m = (r.json && r.json.error) || r.error;
          er2[m] = (er2[m] || 0) + 1;
        }
      }),
      CONC
    );
    const wallOut = Date.now() - t1;
    out.checkout = {
      wallMs: wallOut,
      postPerSec: L.r1((N / wallOut) * 1000),
      postLat: summarize(outLat),
      statuses: st2,
      errors: er2
    };
    out.checkoutMon = L.monSummary(srv.mon, mi1);
  }
  stopAdmins = true;
  await Promise.all(adminLoops);
  if (ADMINS)
    out.adminBackground = Object.fromEntries(
      Object.entries(adminLat).map(([k, v]) => [
        k,
        {
          n: v.length,
          errors: v.filter(x => x < 0).length,
          p50: L.r1(
            L.pct(
              v.filter(x => x >= 0),
              50
            )
          ),
          p95: L.r1(
            L.pct(
              v.filter(x => x >= 0),
              95
            )
          ),
          max: L.r1(Math.max(...v))
        }
      ])
    );
  out.peakRssMB = L.monSummary(srv.mon).rssMaxMB;
  out.retries = retries;
  out.openFail = openFail;
  for (const s of sseConns)
    try {
      s.req.destroy();
    } catch {}
  c0.destroy();
  await srv.stop();
  const d = new DatabaseSync(db, { readOnly: true });
  const q = s => d.prepare(s).get();
  const inList = names.map(u => `'${u}'`).join(',');
  out.db = {
    sessionsToday: q(`SELECT COUNT(*) n FROM attendance_sessions WHERE date='${DATE}' AND username IN (${inList})`).n,
    distinctUsers: q(
      `SELECT COUNT(DISTINCT username) n FROM attendance_sessions WHERE date='${DATE}' AND username IN (${inList})`
    ).n,
    sessionsOpen: q(
      `SELECT COUNT(*) n FROM attendance_sessions WHERE date='${DATE}' AND state='open' AND username IN (${inList})`
    ).n,
    sessionsClosed: q(
      `SELECT COUNT(*) n FROM attendance_sessions WHERE date='${DATE}' AND state='closed' AND username IN (${inList})`
    ).n,
    punchIn: q(
      `SELECT COUNT(*) n FROM punches p JOIN attendance_sessions s ON s.id=p.session_id WHERE s.date='${DATE}' AND p.type='in'`
    ).n,
    punchOut: q(
      `SELECT COUNT(*) n FROM punches p JOIN attendance_sessions s ON s.id=p.session_id WHERE s.date='${DATE}' AND p.type='out'`
    ).n,
    dupInPerSession: q(
      `SELECT COUNT(*) n FROM (SELECT session_id FROM punches WHERE type='in' GROUP BY session_id HAVING COUNT(*)>1)`
    ).n,
    punchRequests: q(`SELECT COUNT(*) n FROM punch_requests`).n,
    integrity: q('PRAGMA integrity_check').integrity_check
  };
  d.close();
  out.dataOk =
    out.db.sessionsToday === N &&
    out.db.distinctUsers === N &&
    out.db.punchIn === N &&
    out.db.dupInPerSession === 0 &&
    (CHECKOUT ? out.db.punchOut === N && out.db.sessionsClosed === N : out.db.sessionsOpen === N);
  fs.writeFileSync(path.join(L.WORK, 'out', `${label}.json`), JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out, null, 1));
  for (const s of ['', '-wal', '-shm']) fs.rmSync(db + s, { force: true });
})().catch(e => {
  console.error(e);
  process.exit(1);
});
