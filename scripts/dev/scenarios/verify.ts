'use strict';
// Đối chiếu từng trường hợp của out/cases.json với hệ thống: mở BẢN SAO của DB đã dựng (file dựng giữ sạch), cùng ứng dụng trong tiến trình,
// đồng hồ 01/03/2027 09:30. Đọc qua API (nhãn chấm công, dòng ngày và tiền của phiếu, kỳ lương, số phép) và ảnh chụp lúc dựng (out/probes.json),
// mã trả về của các lời gọi (out/events.jsonl). Ghi out/report.md và out/report.json.
//   node --import tsx scripts/dev/scenarios/verify.ts [--db out/scenario-year.pgbak.gz] [--out-dir dir]
const fs = require('node:fs');
const path = require('node:path');

const { OUT: OUT_ROOT, outputDirectory, scenarioControlUrl, snapshotPath, openScenarioDatabase, assertScenarioRuntimePlatform, safeErrorText } = require('./lib/postgres');
assertScenarioRuntimePlatform();
const args = process.argv.slice(2);
const OUT = outputDirectory(path.resolve(args.includes('--out-dir') ? args[args.indexOf('--out-dir') + 1] : OUT_ROOT));
const dbArg = args.includes('--db') ? args[args.indexOf('--db') + 1] : null;
const built = snapshotPath(path.resolve(dbArg || path.join(OUT, 'scenario-year.pgbak.gz')), OUT);
const controlUrl = scenarioControlUrl();
if (!fs.existsSync(built)) throw new Error(`Chưa có DB kịch bản: ${built}. Chạy generate.cjs trước.`);
const { meta, cases } = JSON.parse(fs.readFileSync(path.join(OUT, 'cases.json'), 'utf8'));
const probes = JSON.parse(fs.readFileSync(path.join(OUT, 'probes.json'), 'utf8'));
const refs: Record<string, any> = {};
const eventLines = fs
  .readFileSync(path.join(OUT, 'events.jsonl'), 'utf8')
  .trim()
  .split('\n')
  .filter(Boolean)
  .map(JSON.parse);
for (const line of eventLines) if (line.ref) refs[line.ref] = line;

const { toLocal, parseLocal, REPO } = require('./lib/boot');
const startLocal =
  meta.lastEvent && parseLocal(meta.lastEvent) >= parseLocal('2027-03-01T09:30')
    ? toLocal(parseLocal(meta.lastEvent) + 60000)
    : '2027-03-01T09:30';
const { createClient } = require('./lib/client');
const { compactSlip } = require('./lib/ops');
const { dayView, LABEL_TEXT } = require('./lib/view');
const { byUser, PAYROLL } = require('./lib/cast');

const SEVERITY = ['OK', 'SKIP', 'CHECK', 'PENDING-RULE', 'DIFF', 'ERROR'];
const worst = (list?) => list.reduce((a, b) => (SEVERITY.indexOf(b) > SEVERITY.indexOf(a) ? b : a), 'OK');
const PENDING_TAGS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'];
const inWindow = (month?) => !month || (month >= meta.window.from && month <= meta.window.to);
const enc = encodeURIComponent;

// So một trường: tiền của phiếu là đồng nguyên (khớp đúng), số trong dòng ngày chưa làm tròn (lệch tối đa 0,01)
function same(expected?, actual?) {
  if (typeof expected === 'number') {
    if (typeof actual !== 'number') return false;
    return Number.isInteger(expected) ? Math.abs(actual - expected) < 0.5 : Math.abs(actual - expected) <= 0.011;
  }
  if (typeof expected === 'boolean') return actual === expected;
  return String(actual) === String(expected);
}
const diffFields = (fields?, actual?) =>
  Object.entries<any>(fields)
    .filter(([k, v]: any) => !same(v, actual ? actual[k] : undefined))
    .map(([k, v]: any) => ({ field: k, expected: v, actual: actual ? (actual[k] ?? null) : null }));

async function main() {
  const scenario = await openScenarioDatabase({ controlUrl, snapshot: built, initialLocal: startLocal, variant: null });
  const app = scenario.app;
  let client: any;
  try {
  const { rulesFor } = require(path.join(REPO, 'src', 'platform', 'request-rules'));
  const { leaveDates } = require(path.join(REPO, 'src', 'domain', 'leave-days'));
  client = createClient(app);
  await client.ready;
  const slipCache = new Map<any, any>();
  async function slipOf(u?, month?) {
    const key = `${u}|${month}`;
    if (slipCache.has(key)) return slipCache.get(key);
    let res = await client.request('admin1', 'GET', `/api/periods/${month}/payslips/${enc(u)}`);
    let out;
    if (res.status === 200) out = { source: 'payslip', ...compactSlip(res.body) };
    else {
      // Kỳ chưa tính: đọc phiếu ước tính của tháng
      res = await client.request('admin1', 'GET', `/api/periods/${month}/estimates/${enc(u)}`);
      out = res.status === 200 ? { source: 'estimate', ...(compactSlip(res.body) || {}) } : null;
    }
    slipCache.set(key, out);
    return out;
  }
  const periodCache = new Map<any, any>();
  async function periodOf(month?) {
    if (!periodCache.has(month)) {
      const res = await client.request('admin1', 'GET', `/api/periods/${month}`);
      periodCache.set(month, res.body || {});
    }
    return periodCache.get(month);
  }
  async function leaveNow(u?) {
    const month = app.clock.local().slice(0, 7);
    const sheet = await client.request('admin1', 'GET', `/api/sheet?month=${month}&user=${enc(u)}`);
    const ledger = await client.request('admin1', 'GET', `/api/leave/ledger?user=${enc(u)}`);
    const lb = sheet.body && sheet.body.leaveBalance;
    return {
      sheet: lb ? { total: lb.accrued, used: lb.used, expired: lb.expired, balance: lb.balance } : null,
      ledger: ledger.body ? { balance: ledger.body.balance, on: ledger.body.on } : null
    };
  }
  const rowOf = (slip?, date?) =>
    slip && slip.rows ? slip.rows.find(r => r.date === date) || { missing: true } : null;

  async function evaluate(check?, tags?) {
    const pending = tags.some(t => PENDING_TAGS.includes(t));
    const isCheck = tags.includes('CHECK') || tags.includes('DEFECT?');
    const verdict = (fields?, actual?, source?) => {
      if (actual == null) return { outcome: 'ERROR', actual: null, note: `không đọc được ${source}` };
      const diffs = diffFields(fields, actual);
      if (!diffs.length) return { outcome: 'OK', actual: pickFields(fields, actual) };
      if (check.now && !diffFields(check.now, actual).length)
        return {
          outcome: 'PENDING-RULE',
          actual: pickFields(fields, actual),
          diffs,
          note: 'đúng hành vi hiện tại của code'
        };
      if (pending) return { outcome: 'PENDING-RULE', actual: pickFields(fields, actual), diffs };
      return { outcome: isCheck ? 'CHECK' : 'DIFF', actual: pickFields(fields, actual), diffs };
    };
    const pickFields = (fields?, actual?) => Object.fromEntries(Object.keys(fields).map(k => [k, actual[k] ?? null]));
    switch (check.type) {
      case 'slip': {
        if (!inWindow(check.month)) return { outcome: 'SKIP' };
        return verdict(check.fields, await slipOf(check.u, check.month), `phiếu ${check.month}`);
      }
      case 'row': {
        if (!inWindow(check.date.slice(0, 7))) return { outcome: 'SKIP' };
        return verdict(
          check.fields,
          rowOf(await slipOf(check.u, check.date.slice(0, 7)), check.date),
          `dòng ${check.date}`
        );
      }
      case 'leave': {
        const p = probes[check.key];
        if (!p)
          return { outcome: inWindow(null) && meta.only ? 'SKIP' : 'ERROR', note: `không có ảnh chụp ${check.key}` };
        if (check.fields.none)
          return p.sheet === null ? { outcome: 'OK', actual: { sheet: null } } : { outcome: 'DIFF', actual: p.sheet };
        return { ...verdict(check.fields, p.sheet, `số phép ${check.key}`), at: p.at, ledger: p.ledger };
      }
      case 'http': {
        const r = refs[check.ref];
        if (!r) return { outcome: meta.only ? 'SKIP' : 'ERROR', note: `không có lời gọi ${check.ref}` };
        const actual = { status: r.status, code: r.code || null, warn: (r.warn || []).join(',') };
        const want = { status: check.fields.status, ...(check.fields.code ? { code: check.fields.code } : {}) };
        const v = verdict(want, actual, check.ref);
        if (check.fields.warn && !(r.warn || []).includes(check.fields.warn)) {
          v.diffs = [...(v.diffs || []), { field: 'warn', expected: check.fields.warn, actual: actual.warn }];
          if (v.outcome === 'OK') v.outcome = pending ? 'PENDING-RULE' : isCheck ? 'CHECK' : 'DIFF';
        }
        // nowarn: mã cảnh báo KHÔNG được có trong trả lời
        if (check.fields.nowarn && (r.warn || []).includes(check.fields.nowarn)) {
          v.diffs = [
            ...(v.diffs || []),
            { field: 'nowarn', expected: `không có ${check.fields.nowarn}`, actual: actual.warn }
          ];
          if (v.outcome === 'OK') v.outcome = pending ? 'PENDING-RULE' : isCheck ? 'CHECK' : 'DIFF';
        }
        return { ...v, actual: { ...actual, error: r.error } };
      }
      // So một trường của hai ảnh chụp phiếu (trước / sau một thao tác): 'eq' giữ nguyên, 'ne' đổi
      case 'probeCompare': {
        const a = probes[check.before];
        const b = probes[check.after];
        if (!a || !b)
          return { outcome: meta.only ? 'SKIP' : 'ERROR', note: `thiếu ảnh chụp ${check.before} / ${check.after}` };
        const x = a.slip ? a.slip[check.field] : undefined;
        const y = b.slip ? b.slip[check.field] : undefined;
        const ok = check.op === 'eq' ? same(x, y) || x === y : !(same(x, y) || x === y);
        const actual = { [`${check.field} trước`]: x ?? null, [`${check.field} sau`]: y ?? null };
        if (ok) return { outcome: 'OK', actual };
        return {
          outcome: pending ? 'PENDING-RULE' : isCheck ? 'CHECK' : 'DIFF',
          actual,
          diffs: [{ field: check.field, expected: check.op === 'eq' ? 'giữ nguyên' : 'đổi', actual: `${x} → ${y}` }]
        };
      }
      // Tổng giờ OT (otH) trên các dòng ngày của các phiếu tháng, tối thiểu min
      case 'otSum': {
        if (!check.months.every(inWindow)) return { outcome: 'SKIP' };
        let sum = 0;
        const byMonth: Record<string, any> = {};
        for (const m of check.months) {
          const s = await slipOf(check.u, m);
          if (!s) return { outcome: 'ERROR', note: `không đọc được phiếu ${m}` };
          byMonth[m] = (s.rows || []).reduce((acc, r) => acc + (Number(r.otH) || 0), 0);
          sum += byMonth[m];
        }
        const actual = { otH: Math.round(sum * 100) / 100, ...byMonth };
        if (sum >= check.min - 1e-6) return { outcome: 'OK', actual };
        return {
          outcome: pending ? 'PENDING-RULE' : isCheck ? 'CHECK' : 'DIFF',
          actual,
          diffs: [{ field: 'otH', expected: `≥ ${check.min}`, actual: actual.otH }]
        };
      }
      case 'label': {
        if (!inWindow(check.date.slice(0, 7))) return { outcome: 'SKIP' };
        const view = await dayView(client, check.u, check.date);
        const r = verdict({ label: check.label }, { label: view.label }, 'nhãn');
        if (r.outcome !== 'OK' && check.now && view.label === check.now) r.outcome = 'PENDING-RULE';
        return { ...r, view };
      }
      case 'labelProbe': {
        const p = probes[check.key];
        if (!p) return { outcome: meta.only ? 'SKIP' : 'ERROR' };
        return verdict({ label: check.label }, { label: p.label }, 'nhãn lúc chụp');
      }
      case 'period': {
        if (!inWindow(check.month)) return { outcome: 'SKIP' };
        const p = await periodOf(check.month);
        return verdict(check.fields, { status: p.status }, `kỳ ${check.month}`);
      }
      case 'slipProbe': {
        const p = probes[check.key];
        if (!p) return { outcome: meta.only ? 'SKIP' : 'ERROR' };
        return verdict(check.fields, p.slip, `phiếu lúc chụp ${check.key}`);
      }
      case 'rowProbe': {
        const p = probes[check.key];
        if (!p) return { outcome: meta.only ? 'SKIP' : 'ERROR' };
        return verdict(check.fields, rowOf(p.slip, check.date), `dòng lúc chụp ${check.key}`);
      }
      case 'observe': {
        const w = check.what;
        let actual: any = null;
        if (w.row)
          actual = inWindow(w.row[1].slice(0, 7))
            ? rowOf(await slipOf(w.row[0], w.row[1].slice(0, 7)), w.row[1])
            : 'SKIP';
        else if (w.http) actual = refs[w.http] || null;
        else if (w.leave) actual = probes[w.leave] || null;
        else if (w.leaveNow) actual = await leaveNow(w.leaveNow);
        else if (w.slip) {
          const s = inWindow(w.slip[1]) ? await slipOf(w.slip[0], w.slip[1]) : 'SKIP';
          actual = s && s !== 'SKIP' ? { ...s, rows: undefined } : s;
        }
        if (actual === 'SKIP') return { outcome: 'SKIP' };
        return { outcome: actual ? 'CHECK' : meta.only ? 'SKIP' : 'ERROR', actual };
      }
      default:
        return { outcome: 'ERROR', note: `không biết loại kiểm ${check.type}` };
    }
  }

  const results: any[] = [];
  for (const c of cases) {
    const tags = c.tags || [];
    const checks: any[] = [];
    for (const check of c.checks || []) {
      try {
        checks.push({ check, ...(await evaluate(check, tags)) });
      } catch (error) {
        checks.push({ check, outcome: 'ERROR', note: String(error && error.message) });
      }
    }
    const real = checks.filter(x => x.outcome !== 'SKIP');
    results.push({
      id: c.id,
      aliases: c.aliases || [],
      u: c.u,
      title: c.title,
      tags,
      outcome: real.length ? worst(real.map(x => x.outcome)) : 'SKIP',
      checks
    });
  }

  // Phép năm 01–02/2027: số của chính mô-đun phép của hệ thống (rulesFor(tháng).leave.ledger trên các ngày phép đang lưu) tại các mốc,
  // quyết toán trên phiếu tháng 2, số dư hôm nay theo màn lịch và theo sổ phép
  const ledgerAt = async (staff?, date?) => {
    const got = (await rulesFor(date.slice(0, 7))).leave.ledger(
      staff,
      (await leaveDates(staff)).filter(d => d <= date),
      date
    );
    return {
      total: got.total,
      used: got.used,
      expired: got.expired,
      balance: got.balance,
      expiring: got.expiring ? got.expiring.days : null
    };
  };
  const leaveRows: any[] = [];
  const accountHolders = [...PAYROLL.filter(p => !meta.only || meta.only.includes(p.u))];
  for (const p of accountHolders) {
    const staff = await app.store.getStaff(p.u);
    if (!staff || staff.type === 'tts') continue;
    const dates = await leaveDates(staff);
    const dec = await ledgerAt(staff, '2026-12-31');
    const jan31 = await ledgerAt(staff, '2027-01-31');
    const feb1 = await ledgerAt(staff, '2027-02-01');
    const feb28 = await ledgerAt(staff, '2027-02-28');
    const febSlip = await slipOf(p.u, '2027-02');
    const janSlip = await slipOf(p.u, '2027-01');
    const now = await leaveNow(p.u);
    leaveRows.push({
      id: p.id,
      u: p.u,
      type: staff.type,
      start: staff.startDate,
      resignedOn: staff.resignedOn || null,
      dec31: dec,
      usedJan: dates.filter(d => d.startsWith('2027-01')).length,
      jan31,
      expiringJan31: jan31.expiring,
      expiredFeb1: feb1.expired - jan31.expired,
      feb1,
      usedFeb: dates.filter(d => d.startsWith('2027-02')).length,
      feb28,
      settleDays: febSlip ? (febSlip.quyetToanNgay ?? 0) : null,
      settlePay: febSlip ? (febSlip.quyetToanPhep ?? 0) : null,
      febSource: febSlip ? febSlip.source : null,
      janSettle: janSlip ? (janSlip.quyetToanPhep ?? 0) : null,
      nowSheet: now.sheet,
      nowLedger: now.ledger
    });
  }
  const lvRow = (u?) => leaveRows.find(r => r.u === u) || {};
  const owner = {
    A1: {
      text: 'Phép tích luỹ trước 2026 hết hạn 31/01/2027 và được quy tiền ở phiếu tháng 2',
      people: ['ctv3_giang', 'nv4_hai', 'nv2_kim', 'nv2_quynh'].map(u => ({
        u,
        expiredFeb1: lvRow(u).expiredFeb1,
        settleDays: lvRow(u).settleDays,
        settlePay: lvRow(u).settlePay
      }))
    },
    A2: {
      text: 'Số dư âm chỉ cảnh báo; ngày phép vượt số dư vẫn trả lương nếu Admin duyệt',
      people: [
        {
          u: 'nv1_em',
          at: 'LV-21',
          probe: (probes['LV-21'] || {}).sheet || null,
          warn: (refs['P05-01'] || {}).warn || null
        },
        {
          u: 'nv1_be',
          at: 'LV-30',
          probe: (probes['LV-30'] || {}).sheet || null,
          warn: (refs['P41-03'] || {}).warn || null
        }
      ]
    },
    A3: {
      text: 'Nghỉ việc: sổ phép dừng ở ngày nghỉ nhưng màn lịch vẫn cộng tới hôm nay; không có quy tiền phép còn lại khi nghỉ',
      people: ['nv1_bao', 'ctv1_cuong'].map(u => ({
        u,
        atResign:
          u === 'nv1_bao' ? (probes['P23-1111'] || {}).ledger || null : (probes['P24-0630'] || {}).sheet || null,
        now: lvRow(u).nowSheet || null,
        ledgerNow: lvRow(u).nowLedger || null
      }))
    },
    A4: {
      text: 'Phép chờ duyệt giữ chỗ lúc hết hạn; từ chối sau đó thì quyết toán chỉ đổi khi tính lại',
      people: [
        {
          u: 'ctv2_chi',
          run1: (probes['P03-run1'] || {}).slip
            ? {
                quyetToanNgay: probes['P03-run1'].slip.quyetToanNgay,
                quyetToanPhep: probes['P03-run1'].slip.quyetToanPhep
              }
            : null,
          final: { settleDays: lvRow('ctv2_chi').settleDays, settlePay: lvRow('ctv2_chi').settlePay }
        }
      ]
    }
  };

  const periodsTable: any[] = [];
  for (const m of [
    '2026-01',
    '2026-02',
    '2026-03',
    '2026-04',
    '2026-05',
    '2026-06',
    '2026-07',
    '2026-08',
    '2026-09',
    '2026-10',
    '2026-11',
    '2026-12',
    '2027-01',
    '2027-02',
    '2027-03'
  ]) {
    if (!inWindow(m)) continue;
    const p = await periodOf(m);
    const locks = eventLines.filter(l => l.op === 'period' && l.path === `/api/periods/${m}/lock-attendance`);
    periodsTable.push({
      month: m,
      status: p.status,
      slips: p.counts ? (p.counts.total ?? null) : null,
      totals: p.totals || null,
      // Mỗi lần khoá công: mã cảnh báo và mục danh sách kiểm còn mở; lần khoá không có gì thì bỏ
      lockWarn: locks
        .map(l =>
          [
            (l.warn || []).join(', '),
            l.checklist && l.checklist.length ? `danh sách kiểm: ${l.checklist.join(', ')}` : '',
            l.status !== 200 ? `HTTP ${l.status}${l.code ? ` ${l.code}` : ''}` : ''
          ]
            .filter(Boolean)
            .join('; ')
        )
        .filter(Boolean)
        .join(' | ')
    });
  }

  // D10: lần chạy lương đã tính không sửa được tham số (trigger của DB). Thử trên bản sao đối chiếu, bản sao bị xoá sau đó
  {
    const run = await app.store.db.prepare('SELECT id FROM payroll_runs ORDER BY id LIMIT 1').get();
    let d10;
    if (!run) d10 = { outcome: 'ERROR', note: 'không có lần chạy lương nào' };
    else
      try {
        await app.store.db.prepare(`UPDATE payroll_runs SET params_json = '{}' WHERE id = ?`).run(run.id);
        d10 = { outcome: 'DIFF', actual: { error: null }, note: 'UPDATE không bị chặn' };
      } catch (error) {
        const message = String(error && error.message);
        d10 = { outcome: /không được sửa/.test(message) ? 'OK' : 'CHECK', actual: { error: message.slice(0, 160) } };
      }
    results.push({
      id: 'D10',
      u: 'admin1',
      title: 'Lần chạy lương bất biến (thử UPDATE trên bản sao)',
      tags: ['VERIFY'],
      outcome: d10.outcome,
      checks: [{ check: { type: 'db', what: 'UPDATE payroll_runs SET params_json' }, ...d10 }]
    });
  }
  const tally: Record<string, any> = {};
  for (const r of results) tally[r.outcome] = (tally[r.outcome] || 0) + 1;
  const report = {
    meta: { ...meta, verifiedAt: startLocal, db: path.relative(process.cwd(), built) },
    tally,
    periods: periodsTable,
    results,
    leave: leaveRows,
    owner,
    labels: LABEL_TEXT
  };
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
  fs.writeFileSync(path.join(OUT, 'report.md'), renderMarkdown(report));
  console.log(
    `Đối chiếu ${results.length} trường hợp: ${Object.entries<any>(tally)
      .map(([k, v]: any) => `${k} ${v}`)
      .join(', ')}`
  );
  console.log(`Báo cáo: ${path.relative(process.cwd(), path.join(OUT, 'report.md'))}`);
  } finally {
    if (client) await client.close().catch(() => {});
    await scenario.close();
  }
}

const money = (v?) =>
  typeof v === 'number' ? v.toLocaleString('vi-VN', { maximumFractionDigits: 2 }) : v == null ? '—' : String(v);
const cell = (v?) =>
  (v && typeof v === 'object'
    ? Object.entries<any>(v)
        .map(([k, x]: any) => `${k} ${money(x)}`)
        .join('; ')
    : money(v)
  ).replace(/\|/g, '/');
function renderMarkdown(r?) {
  const L: any[] = [];
  L.push('# Báo cáo kịch bản cả năm', '');
  L.push(
    `Phương án ${r.meta.variant} · dựng ${r.meta.builtAt} · ${r.meta.calls} lời gọi trong ${r.meta.seconds}s · đối chiếu lúc ${r.meta.verifiedAt}${r.meta.only ? ` · CHỈ CHẠY THỬ: ${r.meta.only.join(', ')} tháng ${r.meta.window.from} → ${r.meta.window.to}` : ''}`,
    ''
  );
  L.push('## Tổng hợp', '', '| Kết quả | Số trường hợp |', '|---|---|');
  for (const k of SEVERITY) if (r.tally[k]) L.push(`| ${k} | ${r.tally[k]} |`);
  L.push(
    '',
    '## Kỳ lương',
    '',
    '| Tháng | Trạng thái | Số phiếu | Tổng thu nhập | Bảo hiểm | Thuế | Tạm ứng | Thực lĩnh | Phiếu đã duyệt / chờ / nháp / lỗi | Cảnh báo khi khoá công |',
    '|---|---|---|---|---|---|---|---|---|---|'
  );
  for (const p of r.periods) {
    const t = p.totals || {};
    const states = ['approved', 'pending', 'draft', 'error'].map(k => t[k] ?? '—').join(' / ');
    L.push(
      `| ${p.month} | ${p.status} | ${p.slips ?? '—'} | ${money(t.gross)} | ${money(t.insurance)} | ${money(t.tax)} | ${money(t.advance)} | ${money(t.net)} | ${states} | ${(p.lockWarn || '—').replace(/\|/g, '/')} |`
    );
  }
  L.push('', '## Phép năm 01–02/2027', '');
  L.push(
    '| Người | Số dư 31/12/2026 | Dùng T1 | Sắp hết hạn 31/01 | Hết hạn 01/02 | Quyết toán T2 (ngày / đồng) | Dùng T2 | Số dư 28/02/2027 | Hôm nay: màn lịch / sổ phép |',
    '|---|---|---|---|---|---|---|---|---|'
  );
  for (const x of r.leave)
    L.push(
      `| ${x.id} ${x.u} | ${money(x.dec31.balance)} | ${x.usedJan} | ${money(x.expiringJan31)} | ${money(x.expiredFeb1)} | ${money(x.settleDays)} / ${money(x.settlePay)}${x.febSource === 'estimate' ? ' (ước tính)' : ''} | ${x.usedFeb} | ${money(x.feb28.balance)} | ${x.nowSheet ? money(x.nowSheet.balance) : '—'} / ${x.nowLedger ? money(x.nowLedger.balance) : '—'} |`
    );
  L.push('', '### Việc chủ dự án cần chốt (A1–A4) với số thật', '');
  for (const [k, v] of Object.entries<any>(r.owner)) {
    L.push(`- **${k}**: ${v.text}`);
    for (const p of v.people)
      L.push(
        `  - ${p.u}: ${cell(
          Object.fromEntries(
            Object.entries<any>(p)
              .filter(([key]: any) => key !== 'u')
              .map(([key, val]: any) => [key, val && typeof val === 'object' ? JSON.stringify(val) : val])
          )
        )}`
      );
  }
  const lv = r.results.filter(x => x.checks.some(c => c.check.type === 'leave'));
  L.push(
    '',
    '### Các mốc phép (LV) đã chụp',
    '',
    '| Trường hợp | Mốc | Mong đợi | Thực tế | Kết quả |',
    '|---|---|---|---|---|'
  );
  for (const x of lv)
    for (const c of x.checks.filter(c => c.check.type === 'leave'))
      L.push(
        `| ${x.id} | ${c.check.key}${c.at ? ` (${c.at.slice(0, 10)})` : ''} | ${cell(c.check.fields)} | ${cell(c.actual)} | ${c.outcome} |`
      );
  L.push('', '## Từng trường hợp', '');
  const byU: Record<string, any> = {};
  for (const x of r.results) (byU[x.u] = byU[x.u] || []).push(x);
  for (const [u, list] of Object.entries<any>(byU)) {
    const p = byUser[u];
    L.push(
      `### ${p ? `${p.id || ''} ${u} — ${p.theme || ''}` : u}`,
      '',
      '| Mã | Nội dung | Kiểm | Mong đợi | Thực tế | Kết quả |',
      '|---|---|---|---|---|---|'
    );
    for (const x of list)
      for (const c of x.checks) {
        const what =
          c.check.type +
          (c.check.month ? ` ${c.check.month}` : '') +
          (c.check.date ? ` ${c.check.date}` : '') +
          (c.check.ref ? ` ${c.check.ref}` : '') +
          (c.check.key ? ` ${c.check.key}` : '');
        const expected = c.check.fields
          ? cell(c.check.fields)
          : c.check.label
            ? `${c.check.label}${c.check.now ? ` (hiện tại: ${c.check.now})` : ''}`
            : c.check.type === 'probeCompare'
              ? `${c.check.field} ${c.check.op === 'eq' ? 'giữ nguyên' : 'đổi'} (${c.check.before} → ${c.check.after})`
              : c.check.type === 'otSum'
                ? `otH ≥ ${c.check.min} (${c.check.months.join(', ')})`
                : c.check.type === 'db'
                  ? `bị trigger chặn: ${c.check.what}`
                  : '—';
        const actual =
          c.check.type === 'label' || c.check.type === 'labelProbe'
            ? cell(c.actual)
            : c.check.type === 'observe'
              ? c.actual
                ? JSON.stringify(c.actual).slice(0, 200)
                : '—'
              : cell(c.actual);
        L.push(
          `| ${x.id}${x.aliases && x.aliases.length ? ` (= ${x.aliases.join(', ')})` : ''}${x.tags.length ? ` [${x.tags.join(',')}]` : ''} | ${x.title} | ${what} | ${expected} | ${actual} | ${c.outcome}${c.note ? ` (${c.note})` : ''} |`
        );
      }
    L.push('');
  }
  const diffs = r.results.filter(x => x.outcome === 'DIFF');
  L.push('## Danh sách lệch (DIFF)', '');
  for (const x of diffs)
    L.push(
      `- ${x.id} ${x.u}: ${x.checks
        .filter(c => c.outcome === 'DIFF')
        .map(
          c =>
            (c.diffs || [])
              .map(d => `${d.field} mong đợi ${money(d.expected)}, thực tế ${money(d.actual)}`)
              .join('; ') ||
            c.note ||
            ''
        )
        .join(' | ')}`
    );
  L.push('', '## Phụ thuộc quy tắc đang chờ (PENDING-RULE)', '');
  for (const x of r.results.filter(x => x.outcome === 'PENDING-RULE'))
    L.push(`- ${x.id} [${x.tags.join(',')}] ${x.title}`);
  L.push('', '## Cần người xem (CHECK, DEFECT?)', '');
  for (const x of r.results.filter(x => x.outcome === 'CHECK')) L.push(`- ${x.id} [${x.tags.join(',')}] ${x.title}`);
  // Mã của danh mục không có trường hợp riêng: mã nằm trong một trường hợp khác (bí danh) hoặc không dựng trong DB
  L.push('', '## Mã danh mục gộp hoặc không dựng trong DB', '');
  for (const x of r.results.filter(x => x.aliases && x.aliases.length))
    L.push(`- ${x.aliases.join(', ')}: kiểm trong ${x.id} (${x.title}) → ${x.outcome}`);
  for (const x of r.meta.notInDb || [])
    L.push(`- ${x.id}: ${x.where === 'verify' ? 'chỉ kiểm lúc đối chiếu' : 'không dựng trong DB'}. ${x.reason}`);
  L.push('');
  return L.join('\n');
}

main().catch(error => {
  console.error('Đối chiếu thất bại:', safeErrorText(error));
  process.exitCode = 1;
});
