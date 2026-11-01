'use strict';
// Ghi bộ dữ liệu demo vào DB qua các hàm của src/platform/db.ts (store), như thể máy chủ vừa lưu. Dữ liệu hợp lệ đi qua store.setSheet +
// approvals.reconcile + approvals.decide, Check-in/out đi theo đúng các bước của POST /punch (punch.js: openSessionDay, buildDay);
// dữ liệu bất thường ghi thẳng bằng SQL (đánh dấu unreasonable trong scenarios.js).
// Đồng hồ: mọi lệnh ghi chạy dưới Date.now giả (mỗi sự kiện đặt đúng giờ của nó) nên submitted_at, decided_at... không phụ thuộc ngày chạy.
const H = require('./helpers');
const S = require('./scenarios');
const { validatePersona } = require('./validate');
const ApprovalView = require('../../../src/engine/approval-view');
const ActualHours = require('../../../src/engine/actual-hours');

const { P, SCHED, SHIFT } = H;
const ADMIN = 'demo_admin';
const HISTORY_MONTHS = ['2026-07', '2026-08', '2026-09'];
const DEFAULT_SAVE_AT = {
  '2026-07': '2026-08-01T09:00',
  '2026-08': '2026-09-01T09:00',
  '2026-09': '2026-10-01T09:00',
  '2026-10': '2026-10-31T19:00',
  '2026-11': '2026-11-10T09:00'
};
const DEFAULT_KPI_ADM_AT = {
  '2026-07': '2026-08-05T10:00',
  '2026-08': '2026-09-05T10:00',
  '2026-09': '2026-10-06T10:00',
  '2026-10': '2026-11-06T10:00'
};

function create({ store, payroll, passHash, today = S.TODAY, log = () => {} }: any) {
  const realNow = Date.now;
  let clock = H.at('2026-07-01T08:00');
  const setClock = (ms?) => {
    clock = ms;
  };
  const nowMs = H.at(`${today}T${S.NOW_TIME}`);
  const holidays = S.HOLIDAYS;
  const stats = { warnings: [] as any[], skippedFutureEvents: 0, skippedFuturePunches: 0 };
  const warn = (text?) => stats.warnings.push(text);

  /* ---------- Check-in/out: các bước của POST /punch ---------- */
  const punchStaff = (s?) => ({ shiftCode: s.shiftCode, sched: SCHED[s.type] || SCHED.tts });
  const ipOf = (u?) => `203.0.113.${(H.hashSeed(u) % 200) + 1}`; // dải địa chỉ dành cho tài liệu, không phải IP thật
  const sessionOverlap = async (u?, inIso?, outIso?, excludeId?) => {
    const a = Date.parse(inIso),
      b = Date.parse(outIso);
    for (const s of await store.listSessions({ username: u })) {
      if (s.id === excludeId || !s.entry.presIn) continue;
      const start = Date.parse(s.entry.presIn),
        end = s.state === 'open' ? Infinity : Date.parse(s.entry.presOut);
      if (Number.isFinite(start) && !Number.isNaN(end) && a < end && b > start) return true;
    }
    return false;
  };
  async function closeStale(staff?, t?) {
    const session = await store.openSession(staff.username);
    if (!session || !session.entry.presIn || !P.forgotOut(session.entry.presIn, t)) return;
    const entry = { ...session.entry, kind: 'pending', reason: 'forgot-out' };
    delete entry.presOut;
    await store.updateSession(session.id, session.version, { date: session.date, state: 'closed', entry });
    await store.addPunch(
      staff.username,
      t,
      'out',
      null,
      true,
      { plannedShift: entry.plannedShift || null },
      session.id
    );
  }
  async function punchIn(u?, t?, fast?) {
    const staff = await store.getStaff(u);
    if (!fast) await closeStale(staff, t);
    if (await store.openSession(u)) throw new Error(`Spec lỗi: ${u} đang có lượt mở lúc Check-in ${t}`);
    const opened = P.openSessionDay(punchStaff(staff), t);
    if (!fast && (await sessionOverlap(u, t, new Date(Date.parse(t) + 1).toISOString())))
      throw new Error(`Spec lỗi: chồng giờ ${u} ${t}`);
    const session = await store.createSession(u, opened.date, 'open', opened.entry);
    await store.addPunch(u, t, 'in', ipOf(u), false, { plannedShift: opened.entry.plannedShift || null }, session.id);
  }
  async function punchOut(u?, t?, fast?) {
    const staff = await store.getStaff(u);
    let session = await store.openSession(u);
    if (!session) throw new Error(`Spec lỗi: ${u} không có lượt mở để Check-out lúc ${t}`);
    let entry;
    if (session.entry.outsideShift || !session.entry.plannedShift)
      entry = { ...session.entry, kind: 'pending', reason: 'off-shift', presOut: t };
    else {
      entry = P.buildDay(punchStaff(staff), session.entry.presIn, t, 'punch', {
        plannedShift: session.entry.plannedShift
      }).entry;
      const duplicate = (await store.listSessions({ username: u })).some(
        s =>
          s.id !== session.id &&
          s.entry.plannedShift?.startIso === session.entry.plannedShift.startIso &&
          s.entry.plannedShift?.code === session.entry.plannedShift.code
      );
      if (duplicate && entry.kind !== 'pending')
        entry = { ...entry, kind: 'pending', reason: 'multiple-sessions', attendanceConfirmed: false };
    }
    if (!fast && (await sessionOverlap(u, entry.presIn, t, session.id)))
      throw new Error(`Spec lỗi: chồng giờ ${u} ${t}`);
    session = await store.updateSession(session.id, session.version, { date: session.date, state: 'closed', entry });
    await store.addPunch(u, t, 'out', ipOf(u), false, { plannedShift: entry.plannedShift || null }, session.id);
  }
  // Admin điều chỉnh: các bước của POST /corrections + applyCorrection (approve = true)
  async function correct(u?, date?, inHM?, outHM?, reason?) {
    const staff = await store.getStaff(u);
    const session = (await store.listSessions({ username: u, date }))[0];
    if (!session) throw new Error(`Spec lỗi: không có lượt ${date} của ${u} để điều chỉnh`);
    const snapshot = session.entry.plannedShift || session.entry.assignedShift;
    const code = snapshot?.code || staff.shiftCode;
    const plannedShift = P.planShift({ ...punchStaff(staff), shiftCode: code }, date);
    if (plannedShift && snapshot?.code === code && snapshot.date === date) plannedShift.kind = snapshot.kind;
    const presence = P.presenceFor(code, date, inHM, outHM);
    const id = await store.addCorrection({
      username: u,
      date,
      reqIn: presence.inIso,
      reqOut: presence.outIso,
      reason,
      sessionId: session.id,
      sessionVersion: session.version,
      context: { plannedShift, before: session.entry }
    });
    const result = P.buildDay(punchStaff(staff), presence.inIso, presence.outIso, 'admin', {
      plannedShift,
      approveIncomplete: true
    });
    if (!plannedShift || result.entry.kind === 'pending')
      throw new Error(`Spec lỗi: điều chỉnh ${u} ${date} không khớp ca`);
    const entry = { ...result.entry };
    const context = {
      plannedShift,
      originalRequest: { date, reqIn: presence.inIso, reqOut: presence.outIso, plannedShift },
      before: session.entry,
      after: entry
    };
    const updated = await store.updateSession(session.id, session.version, {
      date: plannedShift.date,
      state: 'closed',
      entry
    });
    store.db
      .prepare('UPDATE corrections SET session_id=?,session_version=?,context_json=? WHERE id=?')
      .run(updated.id, session.version, JSON.stringify(context), id);
    await store.decideCorrection(
      id,
      'approved',
      ADMIN,
      'Admin xác nhận trực tiếp',
      presence.inIso,
      presence.outIso,
      updated.date
    );
  }

  /* ---------- lịch, KPI, tiền ---------- */
  const isCleanDate = (d?) =>
    /^\d{4}-\d{2}-\d{2}$/.test(d) && new Date(d + 'T00:00:00Z').toISOString().slice(0, 10) === d;
  async function saveSheet(u?, month?, days?, pct?, amt?) {
    const history = month < store.approvals.CUTOFF_MONTH;
    await store.transaction(async () => {
      await store.setSheet(u, month, days, pct, amt);
      const staffType = (await store.getStaff(u)).type;
      const declared = store.approvals.declaredItems(days, { holidays, staffType });
      for (const date of Object.keys(declared))
        if (!date.startsWith(month + '-') || !isCleanDate(date)) delete declared[date];
      await store.approvals.reconcile(
        u,
        month,
        declared,
        history ? { approveBefore: store.approvals.CUTOFF_MONTH } : {}
      );
    });
  }
  // Lương tháng đúng chuỗi của app: lịch → payView → ActualHours.apply → calcMonth. Dùng cho phiếu sửa số theo tỉ lệ số tự tính.
  async function computeMonth(u?, month?, asOfIso = new Date(clock).toISOString()) {
    const staff = await store.getStaff(u);
    const sheet = await store.getSheet(u, month);
    const days: Record<string, any> = {};
    for (const [date, entry] of Object.entries<any>(sheet.days)) {
      if (!entry || entry.kind === 'pending') continue;
      days[date] =
        entry.kind === 'work' || entry.kind === 'makeup'
          ? Object.fromEntries(
              ['kind', 'shift', 'in', 'out', 'extraKind', 'extraIn', 'extraOut', 'preset', 'breakMin']
                .filter(key => Object.hasOwn(entry, key))
                .map(key => [key, entry[key]])
            )
          : { kind: entry.kind };
    }
    let payDays = ApprovalView.payView(days, await store.approvals.forSheet(u, month), undefined, {
      holidays,
      staffType: staff.type
    }).payDays;
    payDays = ActualHours.apply(payDays, await store.listSessions({ username: u }), {
      asOf: asOfIso,
      staff,
      holidays,
      month
    }).days;
    const row = staff.type === 'tts' ? null : await store.getKpiScores(u, month);
    const kpi: Record<string, any> = {
      method: 'five',
      parts: row
        ? Object.fromEntries(Object.entries<any>(row.scores).map(([k, v]: any) => [k, v == null ? null : v / 100]))
        : null,
      pct: sheet.kpiPct,
      amt: sheet.kpiAmt,
      admPct: null,
      admAmt: sheet.kpiAdmAmt
    };
    return payroll.calcMonth(staff, payDays, kpi, holidays, month, null);
  }

  /* ---------- dữ liệu thô bất thường (SQL trực tiếp) ---------- */
  const RAW = {
    // 12/11: chỉ có lượt ra
    async onlyOut(u?) {
      const date = '2026-11-12',
        t = H.vn(date, '17:02:11');
      const planned = P.planShift(punchStaff(await store.getStaff(u)), date);
      const session = await store.createSession(
        u,
        date,
        'closed',
        { kind: 'pending', reason: 'forgot-in', src: 'punch', presOut: t, plannedShift: planned },
        null,
        t
      );
      await store.addPunch(u, t, 'out', ipOf(u), false, { plannedShift: planned }, session.id);
    },
    // 13/11: hai lượt chồng giờ
    async overlap(u?) {
      const date = '2026-11-13',
        staff = await store.getStaff(u);
      const planned = P.planShift(punchStaff(staff), date);
      for (const [a, b] of [
        ['08:00:09', '12:00:41'],
        ['11:00:15', '17:00:30']
      ]) {
        const inIso = H.vn(date, a),
          outIso = H.vn(date, b);
        const entry = P.buildDay(punchStaff(staff), inIso, outIso, 'punch', {
          plannedShift: planned,
          approveIncomplete: true
        }).entry;
        const session = await store.createSession(u, date, 'closed', entry, null, inIso, outIso);
        await store.addPunch(u, inIso, 'in', ipOf(u), false, { plannedShift: planned }, session.id);
        await store.addPunch(u, outIso, 'out', ipOf(u), false, { plannedShift: planned }, session.id);
      }
    },
    // lượt chấm công thô không có phiên (trước khi có attendance_sessions) và attendance_days cũ chưa chuyển
    async rawPunches(u?) {
      await store.addPunch(u, H.vn('2026-10-20', '08:01:12'), 'in', ipOf(u), false, null, null);
      await store.addPunch(u, H.vn('2026-10-20', '17:03:40'), 'out', ipOf(u), false, null, null);
      await store.db
        .prepare('INSERT INTO attendance_days (username, date, entry_json, updated_at) VALUES (?, ?, ?, ?)')
        .run(
          u,
          '2026-10-21',
          JSON.stringify({
            kind: 'work',
            in: '08:00',
            out: '17:00',
            src: 'punch',
            presIn: H.vn('2026-10-21', '08:04:00'),
            presOut: H.vn('2026-10-21', '17:01:00')
          }),
          H.vn('2026-10-21', '17:01:00')
        );
    },
    // dòng duyệt 07/10 tự duyệt: người duyệt là chính người khai
    selfApprove(u?) {
      store.db
        .prepare(
          "UPDATE sheet_approvals SET status = 'approved', decided_by = ?, decided_at = ?, rev = rev + 1 WHERE username = ? AND date = ?"
        )
        .run(u, new Date(clock).toISOString(), u, '2026-10-07');
    },
    // 09/10 đã duyệt, rồi lịch bị sửa thẳng trong DB: dấu vân tay của dòng duyệt không còn khớp
    async staleFingerprint(u?) {
      const row = await store.approvals.get(u, '2026-10-09');
      await store.approvals.decide(
        [{ username: u, date: row.date, rev: row.rev, fingerprint: row.fingerprint }],
        'approved',
        ADMIN
      );
      const sheet = await store.getSheet(u, '2026-10');
      sheet.days['2026-10-09'] = { ...sheet.days['2026-10-09'], extraOut: '19:00' };
      store.db
        .prepare('UPDATE timesheets SET days_json = ? WHERE username = ? AND month = ?')
        .run(JSON.stringify(sheet.days), u, '2026-10');
    }
  };
  const RAW_AT = {
    onlyOut: '2026-11-12T20:00',
    overlap: '2026-11-13T20:00',
    rawPunches: '2026-10-20T20:00',
    selfApprove: '2026-11-06T10:00',
    staleFingerprint: '2026-11-06T10:05'
  };

  /* ---------- Check-in/out đều đặn ---------- */
  const rowOfDay = (days?, date?) => days[date] || null;
  // Trả [{ inMs, outMs | null }]. finalDays: { ngày: ngày lịch cuối cùng } gộp các tháng.
  function punchPlan(p?, finalDays?, att?) {
    const out: any[] = [];
    const sched = SCHED[p.type] || SCHED.tts;
    const hol = new Set<any>(holidays);
    const from = [att.from || S.SETTINGS.punchStart, p.startDate || '0000-00-00'].sort().pop();
    const to = [att.to || today, today].sort()[0];
    const extra = att.extra || {};
    const skip = new Set<any>(att.skip || []);
    for (let date = from; date <= to; date = H.addDays(date, 1)) {
      if (skip.has(date)) continue;
      const base = Date.parse(date + 'T00:00:00+07:00');
      const random = H.rng(`${p.username}|${date}`);
      let pairs: any = null;
      if (Object.hasOwn(extra, date)) {
        const value = extra[date];
        if (value === null) continue;
        const list = Array.isArray(value[0]) ? value : [value];
        pairs = list.map(([a, b]: any) => {
          const inMs = base + H.toMin(a) * 60000;
          return {
            inMs,
            outMs: b === null ? null : base + H.toMin(b) * 60000 + (H.toMin(b) <= H.toMin(a) ? 86400000 : 0)
          };
        });
      } else {
        const day = rowOfDay(finalDays, date);
        const monthIsBlank = date.startsWith('2026-11');
        const kind = day
          ? day.kind || 'work'
          : sched.includes(H.dowOf(date)) && !hol.has(date) && monthIsBlank
            ? 'work'
            : null;
        if (kind !== 'work' && kind !== 'makeup') continue;
        const shift = H.shiftTimes(p);
        const dIn = day && day.in ? day.in : shift[0];
        const dOut = day && day.out ? day.out : shift[1];
        if (!p.shiftCode && !(day && day.in)) continue;
        const mainSpan = H.spanH(dIn, dOut) * 60;
        const pre = day && day.extraIn && day.extraIn !== day.in ? H.spanH(day.extraIn, dIn) * 60 : 0;
        const post = day && day.extraOut && day.extraOut !== day.out ? H.spanH(dOut, day.extraOut) * 60 : 0;
        const start = H.toMin(dIn) - pre;
        const end = H.toMin(dIn) + mainSpan + post;
        // Máy chủ coi vào muộn dù chỉ 1 phút là 'incomplete-shift' (chờ Admin): đa số ngày vào sớm vài phút, khoảng 7% ngày vào muộn 1–6 phút (dưới 15 phút không bị trừ giờ)
        const early = kind === 'makeup' ? random.int(-3, 2) : random() < 0.07 ? random.int(1, 6) : -random.int(1, 14);
        const late = random.int(0, 14);
        pairs = [
          {
            inMs: base + (start + early) * 60000 + random.int(0, 59) * 1000,
            outMs: base + (end + late) * 60000 + random.int(0, 59) * 1000
          }
        ];
      }
      for (const pair of pairs) out.push(pair);
    }
    return out;
  }

  /* ---------- một persona ---------- */
  function monthPlan(p?, month?) {
    let spec = p.cal && Object.hasOwn(p.cal, month) ? p.cal[month] : undefined;
    if (spec === false) return [];
    if (spec === undefined) {
      if (p.startDate && !p.sheetsBeforeStart && `${month}-${H.pad(H.daysInMonth(month))}` < p.startDate) return [];
      spec = {};
    }
    const list = Array.isArray(spec) ? spec : [spec];
    const kpiSpec = kpiOf(p, month);
    return list.map(s => {
      const days = H.buildMonthDays(
        { ...p, type: (p.typeByMonth && p.typeByMonth[month]) || p.type },
        month,
        holidays,
        { edits: s.edits, blank: month === '2026-11', from: s.from, to: s.to }
      );
      Object.assign(days, (p.rawDays && p.rawDays[month]) || {});
      return {
        at: H.at(s.at || DEFAULT_SAVE_AT[month]),
        days: Object.fromEntries(Object.entries<any>(days).sort(([a]: any, [b]: any) => (a < b ? -1 : 1))),
        pct: kpiSpec ? kpiSpec.pct : null,
        amt: kpiSpec ? kpiSpec.amt : null
      };
    });
  }
  // KPI cũ (tự đánh giá + Admin duyệt) theo tháng; mặc định 80–94% cho CTV/NV, TTS không có
  function kpiOf(p?, month?) {
    if (
      p.kpi === false ||
      ((p.typeByMonth && p.typeByMonth[month]) || p.type) === 'tts' ||
      p.role === 'admin' ||
      !['2026-07', '2026-08', '2026-09', '2026-10'].includes(month)
    )
      return null;
    if (p.kpi && p.kpi[month]) return p.kpi[month];
    const cap = (S.KPI_MAX[p.type] || [])[p.level - 1];
    if (!cap) return null;
    const pct = 80 + (H.hashSeed(p.username + month) % 15);
    return month === '2026-10' ? { pct, amt: cap } : { pct, amt: cap, admPct: pct, admAmt: cap };
  }

  function planPersona(p?, opts: any = {}) {
    const events: any[] = [];
    const push = (atMs?, run?, label?, kind = 'other') =>
      events.push({ at: atMs, order: events.length, run, label, kind });
    const finalDays: Record<string, any> = {};
    const allSheets: Record<string, any> = {};
    for (const month of S.MONTHS) {
      const saves = monthPlan(p, month);
      if (!saves.length) continue;
      saves.forEach(save =>
        push(save.at, () => saveSheet(p.username, month, save.days, save.pct, save.amt), `sheet ${month}`, 'sheet')
      );
      const last = saves[saves.length - 1];
      allSheets[month] = last.days;
      Object.assign(finalDays, last.days);
      const kpiSpec = kpiOf(p, month);
      if (kpiSpec && kpiSpec.admPct != null) {
        const when = kpiSpec.admAt || DEFAULT_KPI_ADM_AT[month];
        push(
          H.at(when),
          () => store.setKpiApproval(p.username, month, kpiSpec.admPct, kpiSpec.admAmt ?? null),
          `kpi adm ${month}`
        );
      }
    }
    for (const d of p.decisions || []) {
      push(
        H.at(d.at),
        async () => {
          const row = await store.approvals.get(p.username, d.date);
          if (!row) throw new Error(`Spec lỗi: ${p.username} không có dòng duyệt ${d.date}`);
          await store.approvals.decide(
            [{ username: p.username, date: d.date, rev: row.rev, fingerprint: row.fingerprint }],
            d.status,
            ADMIN,
            d.note
          );
        },
        `decide ${d.date}`
      );
    }
    for (const s of p.scores || []) {
      push(
        H.at(s.at),
        async () => {
          const patch = Object.fromEntries(
            Object.entries<any>(s.scores).map(([k, v]: any) => [k, Math.round(v * 100)])
          );
          if (s.amt != null) patch.amt = s.amt;
          await store.setKpiScores(p.username, s.month, patch, ADMIN, s.reason || null);
        },
        `scores ${s.month}`
      );
    }
    for (const s of p.slip || []) {
      push(
        H.at(s.at),
        async () =>
          store.setSlipOverride(p.username, s.month, s.values(await computeMonth(p.username, s.month)), ADMIN),
        `slip ${s.month}`
      );
    }
    for (const c of p.changes || []) {
      push(
        H.at(c.at),
        async () => {
          const columns = { type: 'type', level: 'level', shiftCode: 'shift_code' };
          for (const [key, value] of Object.entries<any>(c.patch)) {
            await store.db.prepare(`UPDATE staff SET ${columns[key]} = ? WHERE username = ?`).run(value, p.username);
          }
          if (c.patch.type) {
            const staffType = (await store.getStaff(p.username)).type;
            for (const { month } of await store.listSheets(p.username)) {
              const sheet = await store.getSheet(p.username, month);
              const declared = store.approvals.declaredItems(sheet.days, { holidays, staffType });
              for (const date of Object.keys(declared))
                if (!date.startsWith(month + '-') || !isCleanDate(date)) delete declared[date];
              await store.approvals.reconcile(p.username, month, declared, {
                approveBefore: store.approvals.CUTOFF_MONTH
              });
            }
          }
        },
        'change'
      );
    }
    if (p.locked) push(H.at(p.locked.at), () => store.lockStaff(p.username, p.locked.by), 'lock');
    for (const name of p.raw || []) push(H.at(RAW_AT[name]), () => RAW[name](p.username), `raw ${name}`);
    for (const c of p.corrections || [])
      push(H.at(c.at), () => correct(p.username, c.date, c.in, c.out, c.reason), 'correct');
    if (p.att !== false) {
      const plan = punchPlan(p, finalDays, p.att || {});
      for (const pair of plan) {
        if (pair.inMs > nowMs) {
          stats.skippedFuturePunches++;
          continue;
        }
        push(pair.inMs, () => punchIn(p.username, new Date(pair.inMs).toISOString(), opts.fast), 'in');
        if (pair.outMs !== null && pair.outMs <= nowMs)
          push(pair.outMs, () => punchOut(p.username, new Date(pair.outMs).toISOString(), opts.fast), 'out');
        else if (pair.outMs !== null) stats.skippedFuturePunches++;
      }
    }
    return { events, allSheets };
  }

  async function writePersona(p?, opts: any = {}) {
    const createdAt = H.vn(p.startDate && p.startDate < '2026-07-01' ? p.startDate : '2026-07-01', '08:00');
    setClock(Date.parse(createdAt));
    await store.upsertStaff({
      username: p.username,
      name: p.name,
      role: p.role,
      type: p.initialType || p.type,
      level: p.initialLevel || p.level,
      nightPct: p.nightPct ?? null,
      idorm: !!p.idorm,
      shiftCode: p.shiftCode ?? null,
      passHash,
      createdAt,
      startDate: p.startDate ?? null,
      birthday: p.birthday ?? null,
      leaveAdjust: p.leaveAdjust || 0,
      contract: p.contract,
      insured: p.insured,
      dependants: p.dependants || 0,
      jobTitle: p.jobTitle,
      taxOn: p.taxOn,
      deductOn: p.deductOn,
      advanceOn: p.advanceOn
    });
    const { events, allSheets } = planPersona(p, opts);
    // kiểm "máy chủ có nhận lịch này không"
    const issues = validatePersona(p, allSheets, holidays, today);
    if (!p.unreasonable && issues.length)
      throw new Error(
        `Persona ${p.username} khai hợp lệ nhưng máy chủ sẽ từ chối: ${issues.map(i => `${i.code}@${i.date || i.month}`).join(', ')}`
      );
    p.serverRejects = [...new Set<any>(issues.map(i => i.code))];
    events.sort((a: any, b: any) => a.at - b.at || a.order - b.order);
    for (const e of events) {
      if (e.at > nowMs && e.kind !== 'sheet') {
        stats.skippedFutureEvents++;
        continue;
      }
      setClock(Math.min(e.at, nowMs));
      try {
        await e.run();
      } catch (error) {
        throw new Error(`${p.username} · ${e.label}: ${error.message}`);
      }
    }
  }

  /* ---------- toàn bộ ---------- */
  async function seedAll(personas?, admins?, bulk?) {
    Date.now = () => clock;
    try {
      // cài đặt hệ thống, đúng như Admin đặt
      setClock(H.at('2026-09-28T09:00'));
      for (const a of admins)
        await store.upsertStaff({
          username: a.username,
          name: a.name,
          role: 'admin',
          type: 'tts',
          level: 0,
          contract: 'long',
          insured: true,
          passHash,
          createdAt: H.vn('2026-07-01', '08:00')
        });
      await store.setSetting('holidays', holidays);
      setClock(H.at('2026-09-29T10:00'));
      await store.setSetting('geofence', S.SETTINGS.geofence);
      setClock(H.at('2026-10-14T16:00'));
      // một giao dịch cho cả đợt ghi: nhanh hơn nhiều so với mỗi lệnh một lần ghi đĩa, và lỗi giữa chừng không để lại dữ liệu dở dang
      await store.transaction(async () => {
        for (const p of personas) await writePersona(p);
        for (const p of bulk) await writePersona(p, { fast: true });
      });
    } finally {
      Date.now = realNow;
    }
  }

  return { seedAll, computeMonth, stats, warn, setClock, writePersona, nowMs };
}

// Người "nền" cho thử hiệu năng: nhân sự thường, Check-in/out tháng 11, vài khoản duyệt
function bulkPersonas(count?, startIndex?) {
  const out: any[] = [];
  for (let i = 1; i <= count; i++) {
    const tag = `bulk_${String(i).padStart(4, '0')}`;
    const r = H.rng(tag);
    const x = r();
    const type = x < 0.25 ? 'tts' : x < 0.5 ? 'ctv' : 'nv';
    const level = type === 'tts' ? r.int(1, 6) : r.int(1, 4);
    const shiftCode = r.pick(['n1', 'n1', 'n1', 'n2', 'f1', 'f2']);
    const edits: Record<string, any> = {};
    if (type === 'nv' && r() < 0.2) edits['2026-10-10'] = H.E.isat;
    if (type !== 'tts' && r() < 0.12) edits['2026-10-13'] = H.E.leave;
    const startDate = `2025-${String(r.int(1, 12)).padStart(2, '0')}-${String(r.int(1, 27)).padStart(2, '0')}`;
    out.push({
      group: 'Bulk',
      employeeCode: S.nextCode(type, S.unitAt(startIndex + i)),
      username: `demo_${tag}`,
      name: S.nameAt(startIndex + i),
      role: 'staff',
      type,
      level,
      shiftCode,
      startDate,
      contractType: S.contractTypeOf({ type, startDate }),
      birthday: S.BIRTHDAY(startIndex + i),
      covers: [],
      expect: 'Người nền cho thử hiệu năng.',
      unreasonable: false,
      ai: { fire: [], miss: [] },
      cal: { '2026-07': false, '2026-08': false, '2026-09': false, '2026-10': { edits } },
      att: { from: '2026-11-01' }
    });
  }
  return out;
}

module.exports = { create, bulkPersonas, SHIFT };
