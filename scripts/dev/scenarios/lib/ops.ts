'use strict';
// Thực thi từng sự kiện của hàng đợi bằng route HTTP thật (ghi kho chỉ cho khởi tạo và các trường hợp DATA).
// Mỗi lời gọi được ghi lại (trạng thái, mã lỗi, mã cảnh báo); route từ chối thì ghi lại rồi chạy tiếp, không dừng.
const crypto = require('node:crypto');
const cal = require('./calendar');
const { byUser } = require('./cast');

const ADMIN = 'admin1';
const enc = encodeURIComponent;

// Hồ sơ đầy đủ gửi PUT /api/staff/:u (route thay cả hồ sơ: thiếu trường là về mặc định)
function profileBody(state?) {
  if (state.role === 'admin') return { name: state.name, role: 'admin', payrollSubject: false };
  if (state.role === 'cb') return { name: state.name, role: 'staff', type: 'nv', level: 1, payrollSubject: false };
  return {
    name: state.name,
    role: 'staff',
    type: state.type,
    level: state.level,
    ...(state.nightPct != null ? { nightPct: state.nightPct } : {}),
    shiftCode: state.shift || null,
    startDate: state.start,
    birthday: state.birthday || null,
    contract: state.contract || null,
    contractStatus: state.contractStatus || null,
    ...(state.insured != null ? { insured: state.insured } : {}),
    dependants: state.dependants || 0,
    idorm: !!state.idorm,
    leaveAdjust: state.leaveAdjust || 0,
    resignedOn: state.resignedOn || null,
    payrollSubject: true
  };
}

// Phần nhỏ của thân trả lời để ghi nhật ký (không ghi cả khối lớn)
function compact(body?) {
  if (!body || typeof body !== 'object') return {};
  const out: Record<string, any> = {};
  if (body.code) out.code = body.code;
  if (body.error) out.error = String(body.error).slice(0, 240);
  if (Array.isArray(body.warnings) && body.warnings.length)
    out.warn = [...new Set<any>(body.warnings.map(w => w.code))];
  for (const k of ['created', 'rev', 'decided', 'autoApproved', 'findings', 'paidAt'])
    if (body[k] !== undefined && typeof body[k] !== 'object') out[k] = body[k];
  if (typeof body.status === 'string') out.state = body.status; // trạng thái kỳ, không lẫn với mã HTTP
  if (Array.isArray(body.checklist)) out.checklist = body.checklist.map(i => `${i.code}:${i.count ?? ''}`);
  if (body.run && body.run.runNo) out.runNo = body.run.runNo;
  if (body.counts && typeof body.counts === 'object') out.counts = body.counts;
  return out;
}

// Phiếu gọn: các số tiền của tháng và các dòng ngày (chỉ trường cần đối chiếu)
const ROW_FIELDS = [
  'date',
  'kind',
  'shift',
  'total',
  'daily',
  'hours',
  'short',
  'cut',
  'bonus',
  'otH',
  'otPay',
  'otHold',
  'makeupH',
  'makeupPay',
  'breakPay',
  'holWorkH',
  'holWorkPay',
  'nightH',
  'paidOff',
  'extraOnly'
];
function compactSlip(body?) {
  if (!body || !body.payslip) return null;
  const p = body.payslip;
  const pick: Record<string, any> = {};
  for (const k of [
    'status',
    'workDays',
    'tienNgayCong',
    'phuCap',
    'ot',
    'kpi',
    'truTreSom',
    'khac',
    'attendOk',
    'quyetToanPhep',
    'quyetToanNgay',
    'khoanThem',
    'khoanTru',
    'gross',
    'insurance',
    'tax',
    'advance',
    'net',
    'errorCode'
  ])
    if (p[k] !== undefined) pick[k] = p[k];
  const snap = p.snapshot || {};
  pick.rows = (snap.rows || []).map(r =>
    Object.fromEntries(ROW_FIELDS.filter(k => r[k] !== undefined).map(k => [k, r[k]]))
  );
  pick.runNo = body.run && body.run.runNo;
  return pick;
}

function createOps(ctx?) {
  const { client, store, auth, clock, log, probes, vars } = ctx;
  const state: Record<string, any> = {}; // hồ sơ đang có của từng người (gộp các lần đổi)
  const openOf: Record<string, any> = {}; // username → id lượt đang mở
  const lastOf: Record<string, any> = {}; // username → id lượt vừa đóng
  let reqSeq = 0;
  const call = async (ev?, as?, method?, path?, body?, ref?) => {
    const res = await client.request(as, method, path, body);
    log(ev, { as, method, path, status: res.status, ...compact(res.body), ref });
    return res;
  };
  const stamp = () => clock.local().replace(/[-:T]/g, '');
  const requestId = (u?, type?) => `sc-${u}-${stamp()}-${type}-${++reqSeq}`;

  async function punchOut(ev?, u?, explanation?, ref?) {
    let sessionId = ev.args.sessionId;
    if (sessionId === 'last') sessionId = lastOf[u];
    if (!sessionId) sessionId = openOf[u];
    if (!sessionId) {
      const st = await client.request(u, 'GET', '/api/punch');
      sessionId = st.body && st.body.openSession && st.body.openSession.id;
    }
    const body: Record<string, any> = {
      type: 'out',
      requestId: ev.args.requestId || requestId(u, 'out'),
      sessionId: sessionId || 1
    };
    if (explanation) body.explanation = explanation;
    const res = await call(ev, u, 'POST', '/api/punch', body, ref);
    if (res.status === 200) {
      lastOf[u] = sessionId;
      delete openOf[u];
    }
    return res;
  }

  const ops = {
    async 'data.bootstrap'(ev?) {
      const p = byUser[ev.args.u];
      await store.upsertStaff({
        username: p.u,
        name: p.name,
        role: 'admin',
        type: 'nv',
        level: 0,
        passHash: auth.hashPassword(crypto.randomBytes(24).toString('hex'))
      });
      await store.setPayrollSubject(p.u, false);
      log(ev, { as: 'store', method: 'DATA', path: 'upsertStaff(admin1)', status: 200 });
    },
    async 'staff.create'(ev?) {
      const p = byUser[ev.args.u];
      state[p.u] = { ...p, role: p.role || 'staff' };
      const body: Record<string, any> = {
        ...profileBody(state[p.u]),
        password: crypto.randomBytes(18).toString('base64url')
      };
      await call(ev, ADMIN, 'PUT', `/api/staff/${enc(p.u)}`, body, ev.ref);
    },
    async 'staff.change'(ev?) {
      const { u, set } = ev.args;
      if (set.locked) {
        await call(ev, ADMIN, 'PUT', `/api/staff/${enc(u)}`, { locked: true }, ev.ref);
        client.forget(u);
        return;
      }
      Object.assign(state[u], set);
      await call(ev, ADMIN, 'PUT', `/api/staff/${enc(u)}`, profileBody(state[u]), ev.ref);
    },
    async roles(ev?) {
      await call(
        ev,
        ADMIN,
        'PUT',
        `/api/staff/${enc(ev.args.u)}/roles`,
        { roles: ev.args.roles, reason: 'Giao vai trò C&B' },
        ev.ref
      );
    },
    async 'holidays.put'(ev?) {
      const dates = [...new Set<any>([...cal.HOLIDAY_DATES, ...(ev.args.add || [])])].sort();
      const names = Object.fromEntries(dates.map(d => [d, cal.HOLIDAYS[d] || 'Ngày nghỉ thêm']));
      await call(ev, ADMIN, 'PUT', '/api/holidays', { dates, names }, ev.ref);
    },
    async 'catalog.level'(ev?) {
      const { type, level, changes, effectiveMonth, reason } = ev.args;
      const cat = await client.request(ADMIN, 'GET', `/api/catalog/positions?month=${effectiveMonth}`);
      const pos = ((cat.body && cat.body.positions) || []).find(p => p.code === type);
      const lv = pos && (pos.levels || []).find(l => Number(l.level) === level);
      await call(
        ev,
        ADMIN,
        'PUT',
        '/api/catalog/levels',
        { type, level, changes, effectiveMonth, reason, expectedRev: lv && lv.rev },
        ev.ref
      );
    },
    async geofence(ev?) {
      const body = ev.args.enabled ? { lat: 21.0285, lng: 105.8542, radiusM: 200 } : null;
      await call(ev, ADMIN, 'PUT', '/api/settings/geofence', body, ev.ref);
    },
    async punch(ev?) {
      const { u, type, location, explanation, tryWithout } = ev.args;
      if (type === 'in') {
        const body: Record<string, any> = { type: 'in', requestId: ev.args.requestId || requestId(u, 'in') };
        if (location) body.location = location;
        const res = await call(ev, u, 'POST', '/api/punch', body, ev.ref);
        if (res.status === 200 && res.body && res.body.openSession) openOf[u] = res.body.openSession.id;
        return;
      }
      if (tryWithout) {
        const first = await punchOut(ev, u, null, ev.ref ? `${ev.ref}#1` : undefined);
        if (first.status === 200 || (first.body && first.body.code !== 'CHECKOUT_NEEDS_EXPLANATION')) return;
      }
      await punchOut(ev, u, explanation, ev.ref);
    },
    async sheet(ev?) {
      const { u, by, month, days, confirmDays } = ev.args;
      const cur = await store.getSheet(u, month);
      const merged = { ...cur.days };
      for (const [d, day] of Object.entries<any>(days)) {
        if (day === null) delete merged[d];
        else merged[d] = day;
      }
      const body: Record<string, any> = { month, days: merged, expectedRev: cur.rev };
      if (by !== u) body.user = u;
      if (confirmDays && confirmDays.length) body.confirmDays = confirmDays;
      await call(ev, by, 'PUT', '/api/sheet', body, ev.ref);
    },
    async decide(ev?) {
      const { u, dates, action, note } = ev.args;
      const by = ev.args.by || ADMIN;
      const items: any[] = [];
      for (const month of new Set<any>(dates.map(d => d.slice(0, 7)))) {
        const list = await client.request(by, 'GET', `/api/approvals?status=pending&user=${enc(u)}&month=${month}`);
        for (const it of (list.body && list.body.items) || [])
          if (dates.includes(it.date))
            items.push({ username: it.username, date: it.date, rev: it.rev, fingerprint: it.fingerprint });
      }
      if (!items.length)
        return log(ev, {
          as: by,
          method: 'PUT',
          path: '/api/approvals/decide',
          status: 0,
          code: 'NO_PENDING',
          ref: ev.ref
        });
      await call(ev, by, 'PUT', '/api/approvals/decide', { action, note: note || '', items }, ev.ref);
    },
    async 'expl.decide'(ev?) {
      const { u, date, approve, note } = ev.args;
      const list = await client.request(ADMIN, 'GET', `/api/explanations?user=${enc(u)}`);
      const item = ((list.body && list.body.items) || []).find(
        e => e.date === date && !['approved', 'rejected'].includes(e.status)
      );
      if (!item)
        return log(ev, {
          as: ADMIN,
          method: 'POST',
          path: '/api/explanations/:id/decide',
          status: 404,
          code: 'NO_EXPLANATION',
          ref: ev.ref
        });
      await call(
        ev,
        ADMIN,
        'POST',
        `/api/explanations/${item.id}/decide`,
        { approve, note: note || '', expectedRev: item.rev },
        ev.ref
      );
    },
    async advance(ev?) {
      const { action, u, month, reason } = ev.args;
      const staffSide = action === 'request' || action === 'withdraw';
      const as = staffSide ? u : ev.args.by || ADMIN;
      const body: Record<string, any> = { month };
      if (!staffSide && action !== 'approve-all') body.username = u;
      if (reason) body.reason = reason;
      await call(ev, as, 'POST', `/api/advance-approvals/${action}`, body, ev.ref);
    },
    async kpi(ev?) {
      const { u, month, scores, amt } = ev.args;
      const body: Record<string, any> = { month, user: u, scores };
      if (amt !== undefined) body.amt = amt;
      await call(ev, ev.args.as || ADMIN, 'PUT', '/api/kpi/scores', body, ev.ref);
    },
    async period(ev?) {
      const { month, step, body = {} } = ev.args;
      const as = ev.as || ADMIN;
      const view = await client.request(ADMIN, 'GET', `/api/periods/${month}`);
      const rev = view.body && Number.isInteger(view.body.rev) ? view.body.rev : 0;
      const { revDelta, ...rest } = body;
      await call(ev, as, 'POST', `/api/periods/${month}/${step}`, { rev: rev + (revDelta || 0), ...rest }, ev.ref);
    },
    async 'ot.note'(ev?) {
      const { u, date, reason } = ev.args;
      const sheet = await client.request(ADMIN, 'GET', `/api/sheet?month=${date.slice(0, 7)}&user=${enc(u)}`);
      const s = ((sheet.body && sheet.body.attendanceSessions) || []).find(x => x.date === date && x.state !== 'open');
      if (!s)
        return log(ev, { as: ADMIN, method: 'POST', path: '/api/ot', status: 404, code: 'NO_SESSION', ref: ev.ref });
      await call(ev, ADMIN, 'POST', '/api/ot', { sessionId: s.id, reason }, ev.ref);
    },
    async 'payentry.create'(ev?) {
      const res = await call(ev, ev.args.as, 'POST', '/api/pay-entries', ev.args.body, ev.ref);
      const entry = res.body && (res.body.entry || res.body);
      if (ev.var && entry && entry.id) vars[ev.var] = { id: entry.id, rev: entry.rev };
    },
    async 'payentry.decide'(ev?) {
      const v = vars[ev.args.var];
      if (!v)
        return log(ev, {
          as: ev.args.as,
          method: 'PUT',
          path: '/api/pay-entries/:id/decide',
          status: 0,
          code: 'NO_ENTRY',
          ref: ev.ref
        });
      const res = await call(
        ev,
        ev.args.as,
        'PUT',
        `/api/pay-entries/${v.id}/decide`,
        { decision: ev.args.decision, note: 'Đã kiểm', rev: v.rev },
        ev.ref
      );
      if (res.status === 200 && res.body && res.body.entry) v.rev = res.body.entry.rev;
    },
    async 'payentry.void'(ev?) {
      const v = vars[ev.args.var];
      if (!v)
        return log(ev, {
          as: ev.args.as,
          method: 'POST',
          path: '/api/pay-entries/:id/void',
          status: 0,
          code: 'NO_ENTRY',
          ref: ev.ref
        });
      await call(
        ev,
        ev.args.as,
        'POST',
        `/api/pay-entries/${v.id}/void`,
        { rev: v.rev, reason: ev.args.reason },
        ev.ref
      );
    },
    async 'probe.leave'(ev?) {
      const { u, key } = ev.args;
      const month = clock.local().slice(0, 7);
      const sheet = await client.request(ADMIN, 'GET', `/api/sheet?month=${month}&user=${enc(u)}`);
      const ledger = await client.request(ADMIN, 'GET', `/api/leave/ledger?user=${enc(u)}`);
      const lb = sheet.body && sheet.body.leaveBalance;
      probes[key] = {
        at: clock.local(),
        u,
        status: sheet.status,
        sheet: lb
          ? {
              total: lb.accrued,
              used: lb.used,
              expired: lb.expired,
              balance: lb.balance,
              expiring: lb.expiring ? lb.expiring.days : null,
              expiringOn: lb.expiring ? lb.expiring.on : null,
              adjust: lb.adjust
            }
          : null,
        ledger: ledger.body ? { balance: ledger.body.balance, on: ledger.body.on, summary: ledger.body.summary } : null
      };
      log(ev, { as: ADMIN, method: 'GET', path: `/api/sheet+ledger ${u}`, status: sheet.status, ref: key });
    },
    async 'probe.day'(ev?) {
      const { u, date, key } = ev.args;
      probes[key] = { at: clock.local(), u, date, ...(await ctx.dayView(u, date)) };
      log(ev, { as: ADMIN, method: 'GET', path: `/api/sheet day ${u} ${date}`, status: 200, ref: key });
    },
    async 'probe.slip'(ev?) {
      const { u, month, key } = ev.args;
      const res = await client.request(ADMIN, 'GET', `/api/periods/${month}/payslips/${enc(u)}`);
      probes[key] = { at: clock.local(), u, month, status: res.status, slip: compactSlip(res.body) };
      log(ev, { as: ADMIN, method: 'GET', path: `/api/periods/${month}/payslips/${u}`, status: res.status, ref: key });
    },
    async 'data.session'(ev?) {
      const { u, date, entry } = ev.args;
      const s = await store.createSession(u, date, 'closed', entry);
      log(ev, {
        as: 'store',
        method: 'DATA',
        path: `createSession(${u},${date},${entry.reason})`,
        status: s ? 200 : 500
      });
    },
    async 'data.legacyMakeup'(ev?) {
      const { u, date } = ev.args;
      const month = date.slice(0, 7);
      const cur = await store.getSheet(u, month);
      const days = {
        ...cur.days,
        [date]: {
          kind: 'makeup',
          shift: 'normal',
          in: '08:00',
          out: '17:00',
          extraKind: '',
          extraIn: '',
          extraOut: '',
          preset: '',
          breakMin: 0
        }
      };
      await store.setSheet(u, month, days, cur.kpiPct, cur.kpiAmt);
      log(ev, { as: 'store', method: 'DATA', path: `setSheet(${u},${month}) legacy makeup ${date}`, status: 200 });
    },
    async 'slip.pin'(ev?) {
      const { u, month, values, reason } = ev.args;
      await call(ev, ev.args.as || ADMIN, 'PUT', '/api/slip-override', { user: u, month, values, reason }, ev.ref);
    },
    // Ngày đi làm lễ khai từ trước khi OT ngày lễ dùng chung mục 'ot': lịch ghi thẳng kho, dòng duyệt mục 'holiday_work' đã duyệt
    async 'data.legacyHolidayApproval'(ev?) {
      const { u, date } = ev.args;
      const month = date.slice(0, 7);
      const cur = await store.getSheet(u, month);
      const day = {
        kind: 'work',
        shift: 'normal',
        in: ev.args.in,
        out: ev.args.out,
        extraKind: '',
        extraIn: '',
        extraOut: '',
        preset: '',
        breakMin: 0
      };
      await store.setSheet(u, month, { ...cur.days, [date]: day }, cur.kpiPct, cur.kpiAmt);
      const at = new Date(clock.now()).toISOString();
      await store.db
        .prepare(
          `INSERT INTO sheet_approvals (username, date, item, fingerprint, status, rev, submitted_at, decided_by, decided_at, note)
           VALUES (?, ?, 'holiday_work', ?, 'approved', 1, ?, 'system', ?, NULL)
           ON CONFLICT (username, date) DO UPDATE SET item = EXCLUDED.item, fingerprint = EXCLUDED.fingerprint, status = EXCLUDED.status,
             rev = EXCLUDED.rev, submitted_at = EXCLUDED.submitted_at, decided_by = EXCLUDED.decided_by, decided_at = EXCLUDED.decided_at, note = EXCLUDED.note`
        )
        .run(u, date, `holiday_work|${ev.args.in}-${ev.args.out}`, at, at);
      log(ev, {
        as: 'store',
        method: 'DATA',
        path: `setSheet+sheet_approvals(${u},${date}) holiday_work`,
        status: 200
      });
    },
    async 'data.badLevel'(ev?) {
      await store.upsertStaff({
        username: ev.args.u,
        name: 'Hồ Sơ Lỗi Bậc',
        role: 'staff',
        type: 'nv',
        level: 9,
        nightPct: 40,
        shiftCode: 'Normal1',
        startDate: '2027-02-01',
        passHash: auth.hashPassword(crypto.randomBytes(24).toString('hex'))
      });
      log(ev, { as: 'store', method: 'DATA', path: `upsertStaff(${ev.args.u}, level 9)`, status: 200 });
    }
  };
  return { ops, state };
}

module.exports = { createOps, compact, compactSlip };
