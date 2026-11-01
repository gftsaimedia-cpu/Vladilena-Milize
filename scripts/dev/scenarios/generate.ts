'use strict';
// Dựng DB kịch bản cả năm (01/2026 → 01/03/2027) bằng route HTTP thật của ứng dụng chạy trong cùng tiến trình, đồng hồ đóng băng đi tới theo
// một hàng đợi sự kiện duy nhất. Kết quả: out/scenario-year, out/events.jsonl (mọi lời gọi + trạng thái), out/cases.json, out/probes.json.
//   node scripts/dev/scenarios/generate.ts [--variant A|B] [--only u1,u2] [--from YYYY-MM] [--to YYYY-MM] [--smoke] [--no-early] [--out file]
// --smoke = 3 nhân vật × 2 tháng (kiểm chạy thông, không phải bản đầy đủ).
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');

const OUT = path.join(__dirname, 'out');
const args = process.argv.slice(2);
const flag = (name?) => args.includes(`--${name}`);
const opt = (name?, fallback?) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const smoke = flag('smoke');
const variant = opt('variant', 'B').toUpperCase();
const only = smoke ? ['nv2_lan', 'ctv1_binh', 'nv2_kim'] : opt('only', '') ? opt('only').split(',') : null;
const from = opt('from', smoke ? '2027-01' : '2026-01');
const to = opt('to', smoke ? '2027-02' : '2027-03');
const early = variant === 'B' ? !flag('no-early') : flag('early');
const dbFile = path.resolve(opt('out', path.join(OUT, 'scenario-year')));
if (!['A', 'B'].includes(variant)) throw new Error('--variant phải là A hoặc B');
if (path.dirname(dbFile) !== OUT) throw new Error('DB kịch bản chỉ được nằm trong scripts/dev/scenarios/out/');

fs.mkdirSync(OUT, { recursive: true });
fs.rmSync(dbFile, { recursive: true, force: true });
// Bản làm việc của server.cjs và giờ đã lưu thuộc bản dựng cũ: xoá để máy chủ chép lại từ bản dựng mới, giờ về mặc định
fs.rmSync(path.join(OUT, 'scenario-year.run'), { recursive: true, force: true });
fs.rmSync(path.join(OUT, 'clock.json'), { force: true });

const { boot, NativeDate } = require('./lib/boot');
const app = boot({ dbPath: dbFile, initialLocal: '2026-01-01T00:00', variant });
const { createClient } = require('./lib/client');
const { Story } = require('./lib/builder');
const story = require('./lib/story');
const queue = require('./lib/queue');
const { createOps } = require('./lib/ops');
const { dayView } = require('./lib/view');
const { ADMINS } = require('./lib/cast');

const t0 = performance.now();
const S = new Story({ variant });
queue.accounts(S);
story.globalCases(S);
story.protagonists(S);
story.periods(S);
queue.octoberAdmin(S);
queue.backgroundRoutine(S);
queue.defaultPunches(S, { early });

// Tháng mà sự kiện tác động (dùng cho --from/--to): bước kỳ lương theo tháng của kỳ, lịch theo tháng của lịch, còn lại theo ngày diễn ra
const monthOfEvent = (ev?) =>
  ev.op === 'period' || ev.op === 'sheet'
    ? ev.args.month
    : ev.op === 'decide'
      ? ev.args.dates[0].slice(0, 7)
      : ev.op === 'slip.pin' || ev.op === 'data.legacyHolidayApproval'
        ? (ev.args.month || ev.args.date).slice(0, 7)
        : ev.at.slice(0, 7);
const ALWAYS = new Set<any>(['data.bootstrap', 'staff.create', 'staff.change', 'roles', 'holidays.put']);
const userOf = (ev?) => ev.args.u || (ev.args.body && ev.args.body.username) || null;
const adminNames = new Set<any>(ADMINS.map(a => a.u));
const keep = (ev?) => {
  if (ev.op === 'holidays.put' && ev.ref !== 'G01' && only) return false;
  const u = userOf(ev);
  if (only && u && !only.includes(u) && !adminNames.has(u)) return false;
  if (only && !u && !ALWAYS.has(ev.op) && ev.op !== 'period') return false;
  if (ALWAYS.has(ev.op)) return true;
  const m = monthOfEvent(ev);
  return m >= from && m <= to;
};
const events = S.events.filter(keep).sort((a: any, b: any) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.seq - b.seq));
const cases = Object.values<any>(S.cases).filter(c => !only || only.includes(c.u));

const logStream = fs.createWriteStream(path.join(OUT, 'events.jsonl'));
const probes: Record<string, any> = {};
const vars: Record<string, any> = {};
let n = 0;
let mismatches = 0;
function log(ev?, rec?) {
  n++;
  const line: Record<string, any> = { n, at: ev.at, op: ev.op, ...rec };
  if (ev.caseId) line.caseId = ev.caseId;
  if (ev.tags) line.tags = ev.tags;
  if (ev.expect) {
    line.expect = ev.expect;
    if (ev.expect.status !== rec.status) mismatches++;
  }
  logStream.write(JSON.stringify(line) + '\n');
}

async function main() {
  const client = createClient(app);
  await client.ready;
  const ctx = {
    client,
    store: app.store,
    auth: app.auth,
    clock: app.clock,
    log,
    probes,
    vars,
    dayView: (u?, date?) => dayView(client, u, date)
  };
  const { ops } = createOps(ctx);
  console.log(
    `Dựng kịch bản: phương án ${variant}, ${events.length} sự kiện, tháng ${from} → ${to}${only ? `, chỉ ${only.join(', ')}` : ''}`
  );
  let month = '';
  let i = 0;
  for (const ev of events) {
    i++;
    app.clock.setLocal(ev.at);
    if (ev.at.slice(0, 7) !== month) {
      month = ev.at.slice(0, 7);
      const sec = ((performance.now() - t0) / 1000).toFixed(0);
      console.log(`  ${month}  sự kiện ${i}/${events.length}  ${sec}s`);
    }
    const run = ops[ev.op];
    if (!run) throw new Error(`Không có thao tác ${ev.op}`);
    try {
      await run(ev);
    } catch (error) {
      log(ev, { status: -1, code: 'GENERATOR_ERROR', error: String(error && error.message).slice(0, 240) });
      // Bước khởi tạo hỏng thì các bước sau vô nghĩa: dừng và nêu mã trường hợp
      if (ev.op === 'staff.create' || ev.op === 'data.bootstrap') throw error;
    }
  }
  await client.close();
  const meta = {
    builtAt: new NativeDate().toISOString(),
    variant,
    window: { from, to },
    only,
    early,
    events: events.length,
    calls: n,
    expectMismatches: mismatches,
    lastEvent: events.length ? events[events.length - 1].at : null,
    seconds: Math.round((performance.now() - t0) / 1000),
    notInDb: story.NOT_IN_DB
  };
  fs.writeFileSync(path.join(OUT, 'cases.json'), JSON.stringify({ meta, cases }, null, 1));
  fs.writeFileSync(path.join(OUT, 'probes.json'), JSON.stringify(probes, null, 1));
  await new Promise(resolve => logStream.end(resolve));
  app.store.db.close();
  console.log(
    `Xong sau ${meta.seconds}s: ${n} lời gọi, ${cases.length} trường hợp, DB ${path.relative(process.cwd(), dbFile)}`
  );
  process.exit(0);
}
main().catch(error => {
  console.error('Dựng kịch bản thất bại:', error && error.stack ? error.stack : error);
  process.exit(1);
});
