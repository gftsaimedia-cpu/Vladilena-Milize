'use strict';
// Luồng kỳ lương dùng chung (bản chụp phiếu, không lệch một đồng): dựng một tháng người bịa qua API thật,
// duyệt hết khoản chờ, chốt công, tính lương rồi đọc phiếu từ bảng payslips.
// Kết quả mong đợi tính bằng bộ máy lương dùng chung trên chính dữ liệu đã lưu trong DB (đọc thẳng từ bảng, không qua loadInputs), nên
// lệch nào của src/domain/payroll/payroll-service.ts hay của bản chụp phiếu đều lộ ra bằng từng đồng.
const zlib = require('node:zlib');
const F = require('./api-fixture');
const PunchRules = require('../../src/engine/punch');
const service = require('../../src/domain/payroll/payroll-service');

const { store } = F;
const pad = (n?) => String(n).padStart(2, '0');
const dowOf = (date?) => new Date(date + 'T00:00:00Z').getUTCDay();
const datesOf = (month?) =>
  Array.from(
    { length: new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)).getUTCDate() },
    (_, i) => `${month}-${pad(i + 1)}`
  );
const nextMonthStart = (month?) => {
  const y = +month.slice(0, 4),
    m = +month.slice(5, 7);
  return m === 12 ? `${y + 1}-01-02` : `${y}-${pad(m + 1)}-02`;
};
const T = (date?, time?) => new Date(`${date}T${time}:00+07:00`).toISOString();
const SHIFT = PunchRules.SHIFT;
const SCHED = { tts: [1, 2, 3, 4, 5], ctv: [1, 2, 3, 4, 5, 6], nv: [1, 2, 3, 4, 5, 6] };

// Bốn người bịa phủ ba loại nhân sự, ca ngày, flex và đêm, OT, làm bù, iSAT, phép, nghỉ không lương, ngày lễ
const PEOPLE = [
  { username: 'qa_tts1', type: 'tts', level: 3, shiftCode: 'n1' },
  { username: 'qa_ctv1', type: 'ctv', level: 2, shiftCode: 'n2' },
  { username: 'qa_nv1', type: 'nv', level: 1, shiftCode: 'g2', nightPct: 60 },
  { username: 'qa_nv2', type: 'nv', level: 3, shiftCode: 'f2', nightPct: 40, idorm: true }
];

// Lịch của một người trong tháng: ngày công theo ca đã gán, rải các tình huống theo thứ tự ngày (xác định, không ngẫu nhiên)
function sheetOf(person?, month?, holiday?) {
  const [tin, tout] = SHIFT[person.shiftCode];
  const base = { kind: 'work', in: tin, out: tout, preset: person.shiftCode };
  const hm = (t?) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  const at = (minutes?) => `${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}`;
  const days: Record<string, any> = {};
  const dates = datesOf(month).filter(d => SCHED[person.type].includes(dowOf(d)) && d !== holiday);
  dates.slice(0, 22).forEach((date, i) => {
    const saturday = dowOf(date) === 6;
    if (person.username === 'qa_tts1') {
      if (i % 11 !== 5) days[date] = { ...base };
    } else if (person.username === 'qa_ctv1') {
      if (i % 9 === 4) days[date] = { kind: 'leave' };
      else if (i % 6 === 1) days[date] = { ...base, extraKind: 'ot', extraOut: at(hm(tout) + 120) };
      else if (i % 13 === 7) days[date] = { ...base, extraKind: 'makeup', extraOut: at(hm(tout) + 60) };
      else days[date] = { ...base };
    } else if (person.username === 'qa_nv1') {
      if (i % 7 === 3) days[date] = { kind: 'leave' };
      else if (i % 5 === 2) days[date] = { ...base, extraKind: 'ot', extraOut: '09:00' };
      else days[date] = { ...base };
    } else {
      if (saturday && i % 2 === 0) days[date] = { kind: 'isat' };
      else if (i % 10 === 4) {
        // Nghỉ sẽ làm bù phải khai ngày và giờ làm bù dự kiến (cùng tháng, khác ngày nghỉ)
        const makeupDate = dates[(i + 1) % dates.length];
        days[date] = { kind: 'willmakeup', makeupPlans: [{ date: makeupDate, from: tin, to: tout }] };
      } else if (i % 6 === 2)
        days[date] = { ...base, extraKind: 'ot', extraIn: '11:00' }; // OT trước ca giữ phụ cấp ca (ngày có giờ bù mất phụ cấp ca)
      else days[date] = { ...base };
    }
  });
  // một người đi làm đúng ngày lễ (giờ vào ra đúng ca, không làm thêm)
  if (holiday && person.username === 'qa_ctv1') days[holiday] = { ...base };
  // TTS: Thứ 7 đầu tiên nghỉ không lương (ngày ngoài lịch chỉ khai được loại này)
  if (person.type === 'tts') {
    const saturdays = datesOf(month).filter(d => dowOf(d) === 6 && d !== holiday);
    if (saturdays[0]) days[saturdays[0]] = { kind: 'unpaid' };
  }
  return days;
}

// Dựng dữ liệu của tháng `month` (đồng hồ giả: ngày 2 của tháng sau, tháng đã kết thúc). Mỗi ngày đi làm có một lượt Check-in/out (punches: false thì không tạo lượt nào).
// startDate: ngày vào làm của bốn người; số cộng tay 30 ngày phép nằm trong quỹ phép của năm vào làm (hoặc năm leave.expiry.fromYear nếu muộn hơn)
// và hết hạn cuối tháng 1 năm sau, nên tháng sau năm đó phải cho ngày vào làm nằm trong năm của tháng.
async function seedMonth(month?, { startDate = '2026-01-05', punches = true }: any = {}) {
  await F.reset();
  await F.at(nextMonthStart(month) + 'T09:00:00');
  await F.person('admin', 'admin', { type: 'tts', level: 0, shiftCode: null, startDate: null });
  for (const p of PEOPLE) await F.person(p.username, 'staff', { ...p, startDate, leaveAdjust: 30 }); // cộng tay 30 ngày phép: số dư trong năm vào làm không phụ thuộc tham số leave.accrual.* mà test khác đã lưu (param_versions chỉ thêm dòng)
  const holiday = datesOf(month).find(d => dowOf(d) === 3 && d > `${month}-04`); // một ngày Thứ Tư
  await store.setSetting('holidays', [holiday]);
  for (const p of PEOPLE) {
    const res = await F.call('PUT', '/sheet', {
      who: p.username,
      body: { month, days: await sheetOf(p, month, holiday) }
    });
    if (res.status !== 200)
      throw new Error(`dựng lịch ${p.username} ${month}: ${res.status} ${JSON.stringify(res.data)}`);
  }
  const pendingRows = await store.approvals.list({ status: 'pending' });
  if (pendingRows.length)
    await store.approvals.decide(
      pendingRows.map(r => ({ username: r.username, date: r.date, rev: r.rev, fingerprint: r.fingerprint })),
      'approved',
      'admin',
      'Duyệt để dựng dữ liệu thử'
    );
  if (punches) {
    for (const p of PEOPLE) {
      const days = (await store.getSheet(p.username, month)).days;
      let n = 0;
      for (const [date, day] of Object.entries<any>(days)) {
        if (day.kind !== 'work') continue;
        const plan = PunchRules.planShift({ shiftCode: p.shiftCode, sched: SCHED[p.type] }, date);
        if (!plan) continue;
        n++;
        // có mặt thêm đúng đoạn làm thêm đã khai (OT hoặc làm bù) để khoản đã duyệt được trả
        const minutes = (t?) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
        const mod = (x?) => ((x % 1440) + 1440) % 1440;
        const after = day.extraOut ? mod(minutes(day.extraOut) - minutes(day.out)) : 0;
        const before = day.extraIn ? mod(minutes(day.in) - minutes(day.extraIn)) : 0;
        // ca linh hoạt vào ra đúng giờ ca
        const onTime = p.shiftCode === 'f2';
        const late = n % 5 === 0 && !before && !onTime ? 20 : -before; // thỉnh thoảng trễ 20 phút
        const early = n % 7 === 0 && !after && !onTime ? 40 : -after; // thỉnh thoảng về sớm 40 phút
        const entry = PunchRules.buildDay(
          { shiftCode: p.shiftCode },
          new Date(Date.parse(plan.startIso) + late * 60000).toISOString(),
          new Date(Date.parse(plan.endIso) - early * 60000).toISOString(),
          'punch',
          { plannedShift: plan, approveIncomplete: true }
        ).entry;
        await store.createSession(p.username, plan.date, 'closed', entry);
      }
    }
  }
  return { month, holiday };
}

// Đầu vào của khối cũ cho một người, đọc từ DB đúng như máy chủ phải nạp (lịch qua estimateSheet, hàng duyệt, phiên, công tắc)
async function legacyInput(username?, month?) {
  const sheet = await store.getSheet(username, month);
  const fields = ['kind', 'shift', 'in', 'out', 'extraKind', 'extraIn', 'extraOut', 'preset', 'breakMin'];
  const days: Record<string, any> = {};
  for (const [date, entry] of Object.entries<any>(sheet.days)) {
    if (!entry || entry.kind === 'pending') continue;
    days[date] =
      entry.kind === 'work' || entry.kind === 'makeup'
        ? Object.fromEntries(fields.filter(key => Object.hasOwn(entry, key)).map(key => [key, entry[key]]))
        : {
            kind: entry.kind,
            // "Nghỉ, sẽ làm bù": dấu vân tay của khoản duyệt gồm ngày/giờ làm bù, thiếu thì ngày bị coi là chưa duyệt
            ...(entry.kind === 'willmakeup' && entry.makeupPlans ? { makeupPlans: entry.makeupPlans } : {})
          };
    if (!days[date].extraKind && days[date].extraOut) days[date].extraKind = 'makeup';
  }
  return JSON.parse(
    JSON.stringify({
      staff:
        (await service.payrollPeople(month)).find(s => s.username === username) || (await store.getStaff(username)),
      days,
      approvals: await store.approvals.forSheet(username, month),
      sessions: (await store.listSessions({ username })).map(s => ({
        id: s.id,
        state: s.state,
        date: s.date,
        entry: s.entry
      })),
      kpi: { pct: sheet.kpiPct ?? null, amt: sheet.kpiAmt ?? null, admPct: null, admAmt: null },
      holidays: await store.getSetting('holidays', []),
      month,
      upTo: null,
      asOf: new Date(Date.now()).toISOString()
    })
  );
}
// Kết quả mong đợi cho từng người: { net: {gross, insurance, tax, advance, net}, total, m }. Bộ máy chung chạy trên đầu vào đọc thẳng từ DB
// (legacyInput), không qua loadInputs; hợp đồng theo thâm niên như bảng lương.
// withoutBlocks: bỏ các khối phụ cấp (block.def.*) khỏi bộ tham số, để lấy kết quả "khối cũ" cho tháng mà khối đã mang sang từ tháng trước.
async function expectedFor(month?, { withoutBlocks = false }: any = {}) {
  const resolved = (await service.paramsFor(month)).params;
  const params = withoutBlocks
    ? Object.fromEntries(Object.entries<any>(resolved).filter(([key]: any) => !key.startsWith('block.def.')))
    : resolved;
  return Object.fromEntries(
    await Promise.all(
      PEOPLE.map(async p => {
        const { m } = service.engineFor(params).computeMonth(await legacyInput(p.username, month));
        return [p.username, { m, total: m.total, net: m.net }];
      })
    )
  );
}

// Kết quả bộ máy cho MỘT người, đọc đầu vào từ DB, trên bộ tham số hiệu lực của tháng (thêm `over` nếu có)
async function computeFor(username?, month?, over: any = {}) {
  const params = { ...(await service.paramsFor(month)).params, ...over };
  return service.engineFor(params).computeMonth(await legacyInput(username, month)).m;
}

async function api(method?, route?, body?) {
  return await F.call(method, route, { body });
}
// Chốt công rồi tính lương. Trả { lock, calc } (phản hồi của hai bước) để test tự khẳng định từng bước.
async function lockAndCalculate(month?) {
  const rev = async () => (await api('GET', `/periods/${month}`)).data.rev;
  const lock = await api('POST', `/periods/${month}/lock-attendance`, { rev: await rev() });
  if (lock.status !== 200) return { lock };
  const calc = await api('POST', `/periods/${month}/calculate`, { rev: await rev() });
  return { lock, calc };
}

// Phiếu của lần chạy hiện tại của tháng, đọc thẳng từ bảng payslips: { username: { gross, insurance, tax, advance, net, snapshot, terms, run } }
async function payslipsOf(month?) {
  const run = await store.db
    .prepare("SELECT * FROM payroll_runs WHERE month = ? AND status != 'superseded' ORDER BY run_no DESC LIMIT 1")
    .get(month);
  if (!run) return { run: null, slips: {} };
  const slips: Record<string, any> = {};
  for (const row of await store.db.prepare('SELECT * FROM payslips WHERE run_id = ?').all(run.id))
    slips[row.username] = {
      ...row,
      snapshot: row.snapshot_gz ? JSON.parse(zlib.gunzipSync(Buffer.from(row.snapshot_gz)).toString('utf8')) : null,
      terms: row.staff_terms_json ? JSON.parse(row.staff_terms_json) : null
    };
  return { run, slips };
}

// Bộ tham số hiệu lực của tháng như máy chủ dùng (gồm dòng danh mục ca, chức vụ)
const paramsOf = async (month?) => (await service.paramsFor(month)).params;

module.exports = {
  PEOPLE,
  paramsOf,
  seedMonth,
  legacyInput,
  expectedFor,
  computeFor,
  lockAndCalculate,
  payslipsOf,
  api
};
