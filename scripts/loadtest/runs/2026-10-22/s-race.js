'use strict';
// Cùng một người bấm Check-in nhiều lần song song: (A) khác requestId, (B) cùng requestId. Kèm đo dung lượng DB tăng sau 1.000 người Check-in + Check-out.
const L = require('./lib');
const fs = require('node:fs'),
  path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const SP = L.WORK;
const DATE = '2026-11-26';
(async () => {
  const db = path.join(SP, 'db', 'race.sqlite');
  L.copyDb(path.join(SP, 'db', 'base1000.sqlite'), db);
  {
    const d = new DatabaseSync(db);
    d.exec(`DELETE FROM punches WHERE session_id IN (SELECT id FROM attendance_sessions WHERE date='${DATE}')`);
    d.exec(`DELETE FROM attendance_sessions WHERE date='${DATE}'`);
    d.exec('VACUUM');
    d.close();
  }
  const sizeBefore = fs.statSync(db).size;
  const cookies = JSON.parse(fs.readFileSync(path.join(L.WORK, 'out', 'cookies.json')));
  const names = L.bulkNames(1000);
  const srv = await L.startServer({ db, shimNow: `${DATE}T08:00:00+07:00`, name: 'race' });
  const c = L.makeClient();
  await L.sleep(800);
  const body = rid => ({ type: 'in', requestId: rid, location: { lat: 21.0285, lng: 105.8542, accuracy: 20 } });
  const out = { A: { users: 20, sendsPerUser: 5, statuses: {} }, B: { users: 20, sendsPerUser: 5, statuses: {} } };
  // A: khác requestId
  await Promise.all(
    names.slice(0, 20).flatMap(u =>
      Array.from({ length: 5 }, async (_, k) => {
        const r = await c.request('POST', '/api/punch', { cookie: cookies[u], body: body(`race-a-${u}-${k}`) });
        out.A.statuses[r.status] = (out.A.statuses[r.status] || 0) + 1;
      })
    )
  );
  // B: cùng requestId
  await Promise.all(
    names.slice(20, 40).flatMap(u =>
      Array.from({ length: 5 }, async () => {
        const r = await c.request('POST', '/api/punch', { cookie: cookies[u], body: body(`race-b-${u}`) });
        out.B.statuses[r.status] = (out.B.statuses[r.status] || 0) + 1;
      })
    )
  );
  // 1.000 người Check-in + Check-out để đo dung lượng DB tăng
  const sid = {};
  await L.pool(
    names.slice(40).map(u => async () => {
      const r = await c.request('POST', '/api/punch', { cookie: cookies[u], body: body('sz-in-' + u) });
      sid[u] = r.json && r.json.openSession && r.json.openSession.id;
    }),
    30
  );
  await L.pool(
    names.slice(40).map(u => async () => {
      await c.request('POST', '/api/punch', {
        cookie: cookies[u],
        body: { type: 'out', sessionId: sid[u], requestId: 'sz-out-' + u }
      });
    }),
    30
  );
  c.destroy();
  await srv.stop();
  const d = new DatabaseSync(db);
  const q = s => d.prepare(s).get();
  const sess = n =>
    q(
      `SELECT COUNT(*) n FROM attendance_sessions WHERE date='${DATE}' AND username IN (${names
        .slice(...n)
        .map(u => `'${u}'`)
        .join(',')})`
    ).n;
  out.A.sessionsInDb = sess([0, 20]);
  out.B.sessionsInDb = sess([20, 40]);
  out.A.maxSessionsPerUser = q(
    `SELECT MAX(n) m FROM (SELECT COUNT(*) n FROM attendance_sessions WHERE date='${DATE}' GROUP BY username)`
  ).m;
  out.sizeTest = {
    people: 960,
    punchesAdded: q(
      `SELECT COUNT(*) n FROM punches p JOIN attendance_sessions s ON s.id=p.session_id WHERE s.date='${DATE}'`
    ).n
  };
  d.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  try {
    out.dbstat = d
      .prepare(
        'SELECT name, ROUND(SUM(pgsize)/1048576.0,2) mb FROM dbstat GROUP BY name ORDER BY SUM(pgsize) DESC LIMIT 8'
      )
      .all();
  } catch (e) {
    out.dbstat = String(e);
  }
  d.close();
  out.sizeTest.bytesBefore = sizeBefore;
  out.sizeTest.bytesAfter = fs.statSync(db).size;
  out.sizeTest.growthKBPerPersonDay = Math.round(((out.sizeTest.bytesAfter - sizeBefore) / 1024 / 960) * 100) / 100;
  // thời gian sao lưu bằng API backup của node:sqlite khi máy chủ đã dừng
  const { backup } = require('node:sqlite');
  const src = new DatabaseSync(db, { readOnly: true });
  const dst = path.join(SP, 'db', 'race-backup.sqlite');
  const t0 = Date.now();
  await backup(src, dst);
  out.backupMs = Date.now() - t0;
  out.backupBytes = fs.statSync(dst).size;
  src.close();
  fs.rmSync(dst, { force: true });
  fs.writeFileSync(path.join(L.WORK, 'out', 'race.json'), JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out));
  for (const s of ['', '-wal', '-shm']) fs.rmSync(db + s, { force: true });
})().catch(e => {
  console.error(e);
  process.exit(1);
});
