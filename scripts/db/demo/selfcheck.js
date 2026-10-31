'use strict';
// Tự kiểm sau khi dựng DB: chạy "Soát dữ liệu trước khi chốt lương" (lib/ai/review.js + payroll-loader.js) cho các tháng đã chọn,
// dựng đầu vào đúng như route GET /api/ai/review (server.js → aiReviewResult), rồi so với kỳ vọng ghi trong scenarios.js:
//   ai.fire: luật PHẢI bắn (theo người, hoặc theo người + ngày); ai.miss: luật KHÔNG được bắn (ca sát ngưỡng).
// Thêm bước "phiếu kỳ lương": tính lương tháng S.PAYSLIP_MONTH trong tiến trình bằng lib/payroll-service.js (cùng hàm mà bước "Tính lương"
// của kỳ gọi), gắn cờ AI lên phiếu như periods.aiReview (cờ = mã luật của các phát hiện của người đó trong tháng), rồi so với
// S.PAYSLIP (từng persona) và S.PERIOD_EXPECT (số đếm cả kỳ). Không ghi gì vào DB; luồng route thật chạy bằng period-check.js.
// Không in tên hay số tiền: chỉ mã luật, tên đăng nhập giả và số đếm.
const { review, RULES } = require('../../../lib/ai/review.js');
const KpiScore = require('../../../public/kpi-score.js');
const S = require('./scenarios.js');

function buildInput(store, payroll, month, asOf) {
  const staff = store.listStaff();
  const people = staff.filter(s => s.role !== 'admin');
  const sheets = people.flatMap(s =>
    store.listSheets(s.username).map(({ month: sheetMonth }) => ({
      username: s.username,
      month: sheetMonth,
      ...store.getSheet(s.username, sheetMonth)
    }))
  );
  const slipOverrides = people
    .map(s => ({ username: s.username, month, values: store.getSlipOverride(s.username, month).values }))
    .filter(o => Object.keys(o.values).length);
  const scoreOut = row =>
    Object.fromEntries(
      KpiScore.COMPONENTS.map(c => [c.key, row && row.scores[c.key] != null ? row.scores[c.key] / 100 : null])
    );
  const kpiScores = store
    .listKpiScores(month)
    .filter(row => people.some(s => s.username === row.username))
    .map(row => ({
      username: row.username,
      month,
      parts: row.complete ? { complete: true, ...scoreOut(row) } : { complete: false }
    }));
  return {
    asOf,
    month,
    staff,
    sheets,
    approvals: store.approvals.list({ status: 'all' }),
    sessions: store.listSessions(),
    holidays: store.getSetting('holidays', []),
    kpiScores,
    slipOverrides,
    payroll
  };
}

// persona.ai.fire / miss: chuỗi (cả người) hoặc { rule, date } (một khoản)
const norm = item => (typeof item === 'string' ? { rule: item, date: null } : item);

// Phiếu của kỳ `month` như bước "Tính lương" rồi "AI kiểm tra" sẽ ra, không ghi DB. findings: phát hiện của review() cho đúng tháng đó.
// Trả { slips: [{ username, type, status, errorCode, flags, attendOk, iDorm, advanceOff }], summary, problems }.
function slipCheck({ store, personas, month, asOf, findings }) {
  const service = require('../../../lib/payroll-service.js');
  const params = service.paramsFor(month).params;
  const inputs = service.loadInputs(month, { asOf, params });
  const flagsOf = new Map();
  for (const f of findings) {
    if (!flagsOf.has(f.username)) flagsOf.set(f.username, new Set());
    flagsOf.get(f.username).add(f.rule);
  }
  const slips = [];
  for (const [username, person] of inputs.people) {
    const staff = person.staff;
    const slip = {
      username,
      type: staff.type,
      status: 'pending',
      errorCode: null,
      flags: [...(flagsOf.get(username) || [])].sort(),
      attendOk: null,
      iDorm: !!staff.idorm,
      advanceOff: staff.advanceOn === false
    };
    try {
      const out = service.computeFor(month, staff, inputs, params);
      slip.attendOk = typeof out.m.attendOk === 'boolean' ? out.m.attendOk : null;
    } catch (e) {
      slip.status = 'error';
      slip.errorCode = typeof e.code === 'string' ? e.code : 'CALC_ERROR';
    }
    slips.push(slip);
  }
  const E = S.PERIOD_EXPECT;
  const problems = [];
  const by = new Map(slips.map(x => [x.username, x]));
  for (const p of personas) {
    const want = p.payslip;
    if (!want || want.month !== month) continue;
    const slip = by.get(p.username);
    if (!slip) {
      problems.push(`${p.username}: không có phiếu trong kỳ ${month}`);
      continue;
    }
    if (slip.status !== want.status) problems.push(`${p.username}: phiếu ${slip.status}, kỳ vọng ${want.status}`);
    if (want.errorCode && slip.errorCode !== want.errorCode)
      problems.push(`${p.username}: mã lỗi ${slip.errorCode}, kỳ vọng ${want.errorCode}`);
    for (const rule of want.flags || [])
      if (!slip.flags.includes(rule)) problems.push(`${p.username}: thiếu cờ ${rule}`);
    if (want.noFlags && slip.flags.length)
      problems.push(`${p.username}: phiếu phải sạch, có cờ ${slip.flags.join(',')}`);
  }
  const errors = {};
  const rules = new Set();
  let flagged = 0;
  const okSlips = slips.filter(x => x.status !== 'error');
  for (const x of slips) {
    if (x.status === 'error') errors[x.errorCode] = (errors[x.errorCode] || 0) + 1;
    if (x.flags.length) flagged++;
    for (const r of x.flags) rules.add(r);
  }
  const summary = {
    month,
    total: slips.length,
    errors,
    flagged,
    rules: rules.size,
    types: [...new Set(slips.map(x => x.type))].sort(),
    attendanceKept: okSlips.filter(x => x.attendOk === true).length,
    attendanceLost: okSlips.filter(x => x.attendOk === false).length,
    iDorm: okSlips.filter(x => x.iDorm).length,
    advanceOff: okSlips.filter(x => x.advanceOff).length
  };
  if (JSON.stringify(Object.entries(errors).sort()) !== JSON.stringify(Object.entries(E.errorCodes).sort()))
    problems.push(`phiếu lỗi theo mã ${JSON.stringify(errors)}, kỳ vọng ${JSON.stringify(E.errorCodes)}`);
  if (flagged < E.minFlagged) problems.push(`chỉ ${flagged} phiếu có cờ, kỳ vọng ít nhất ${E.minFlagged}`);
  if (rules.size < E.minRules) problems.push(`cờ chỉ trải trên ${rules.size} luật, kỳ vọng ít nhất ${E.minRules}`);
  for (const t of E.types) if (!summary.types.includes(t)) problems.push(`kỳ không có loại nhân sự ${t}`);
  for (const key of ['attendanceKept', 'attendanceLost', 'iDorm', 'advanceOff'])
    if (summary[key] < E[key]) problems.push(`${key} = ${summary[key]}, kỳ vọng ít nhất ${E[key]}`);
  return { slips, summary, problems };
}

// Luật đồng hồ: DB demo chỉ có một "bây giờ" (ngày today lúc S.NOW_TIME giờ Việt Nam, đã ghi ở khoá demo_dataset) và serve-demo chạy đồng hồ giả
// từ đúng mốc đó. Không một phiên, lượt bấm hay yêu cầu điều chỉnh nào được nằm sau mốc; phiên còn mở chỉ được thuộc ngày today trở về trước và đã
// bắt đầu trước mốc. Nếu không, nhân sự demo bấm Check-out sẽ đóng nhầm phiên "tương lai" và Admin không thấy gì trong ngày today.
// Trả danh sách lỗi (chuỗi, chỉ có mã và số đếm, không có tên); rỗng = đạt.
function clockProblems({ store, today }) {
  const problems = [];
  const asOfMs = Date.parse(`${today}T${S.NOW_TIME}:00+07:00`);
  const marker = store.getSetting('demo_dataset', null);
  if (!marker || marker.today !== today)
    problems.push(`khoá demo_dataset ghi today=${marker && marker.today}, khác ngày dựng ${today}`);
  const after = value => value != null && Date.parse(value) > asOfMs;
  const count = (label, n) => {
    if (n) problems.push(`${n} ${label} sau "hôm nay" ${today} ${S.NOW_TIME}`);
  };
  let sessionsAfter = 0;
  let openAfterDay = 0;
  let openStartedAfter = 0;
  for (const s of store.db
    .prepare('SELECT state, date, entry_json, created_at, updated_at FROM attendance_sessions')
    .all()) {
    const entry = JSON.parse(s.entry_json);
    if (after(s.created_at) || after(s.updated_at) || after(entry.presIn) || after(entry.presOut)) sessionsAfter++;
    if (s.state !== 'open') continue;
    if (s.date > today) openAfterDay++;
    if (!entry.presIn || after(entry.presIn)) openStartedAfter++;
  }
  count('phiên Check-in/out có mốc thời gian', sessionsAfter);
  count('phiên còn mở thuộc ngày', openAfterDay);
  count('phiên còn mở bắt đầu', openStartedAfter);
  count(
    'lượt bấm (punches)',
    store.db
      .prepare('SELECT at FROM punches')
      .all()
      .filter(row => after(row.at)).length
  );
  count(
    'yêu cầu điều chỉnh có mốc thời gian',
    store.db
      .prepare('SELECT created_at, decided_at, req_in, req_out FROM corrections')
      .all()
      .filter(row => [row.created_at, row.decided_at, row.req_in, row.req_out].some(after)).length
  );
  return problems;
}

function run({ store, payroll, personas, today, months = ['2026-10', '2026-11'] }) {
  const asOf = `${today}T${S.NOW_TIME}:00+07:00`;
  const findings = [];
  const findingsByMonth = {};
  const perMonth = {};
  let payrollErrors = 0;
  const skipped = new Set();
  for (const month of months) {
    const result = review(buildInput(store, payroll, month, asOf));
    perMonth[month] = result.summary.total;
    payrollErrors += result.checked.payrollErrors;
    for (const s of result.checked.skipped) skipped.add(`${month}:${s.rule}`);
    findings.push(...result.findings);
    findingsByMonth[month] = result.findings;
  }
  // chỉ kiểm phiếu khi kỳ nằm trong các tháng đã soát
  const period = months.includes(S.PAYSLIP_MONTH)
    ? slipCheck({ store, personas, month: S.PAYSLIP_MONTH, asOf, findings: findingsByMonth[S.PAYSLIP_MONTH] })
    : null;
  const ruleIds = RULES.map(r => r.id);
  const missingRules = S.AI_RULES.filter(id => !ruleIds.includes(id)).concat(
    ruleIds.filter(id => !S.AI_RULES.includes(id))
  );
  const hits = Object.fromEntries(ruleIds.map(id => [id, 0]));
  const users = Object.fromEntries(ruleIds.map(id => [id, new Set()]));
  for (const f of findings) {
    hits[f.rule]++;
    users[f.rule].add(f.username);
  }
  const mismatches = [];
  for (const p of personas) {
    for (const item of (p.ai && p.ai.fire) || []) {
      const { rule, date } = norm(item);
      const ok = findings.some(f => f.rule === rule && f.username === p.username && (!date || f.date === date));
      if (!ok) mismatches.push({ kind: 'thiếu phát hiện', username: p.username, rule, date });
    }
    for (const item of (p.ai && p.ai.miss) || []) {
      const { rule, date } = norm(item);
      const bad = findings.some(f => f.rule === rule && f.username === p.username && (!date || f.date === date));
      if (bad) mismatches.push({ kind: 'bắn thừa', username: p.username, rule, date });
    }
  }
  const system = new Set(S.SYSTEM_RULES || []);
  const zero = ruleIds.filter(id => !hits[id] && !system.has(id));
  // bảng luật → persona (spec) kèm số lần bắn thật
  const mapping = ruleIds.map(rule => ({
    rule,
    fire: personas.filter(p => ((p.ai && p.ai.fire) || []).some(i => norm(i).rule === rule)).map(p => p.username),
    miss: personas.filter(p => ((p.ai && p.ai.miss) || []).some(i => norm(i).rule === rule)).map(p => p.username),
    hits: hits[rule],
    people: users[rule].size
  }));
  const noMiss = mapping.filter(m => !m.miss.length && !system.has(m.rule)).map(m => m.rule);
  const noFire = mapping.filter(m => !m.fire.length && !system.has(m.rule)).map(m => m.rule);
  return {
    months,
    perMonth,
    hits,
    zero,
    mismatches,
    mapping,
    missingRules,
    payrollErrors,
    skipped: [...skipped],
    noMiss,
    noFire,
    findings,
    period,
    clock: clockProblems({ store, today })
  };
}

module.exports = { run, buildInput, slipCheck, clockProblems };
