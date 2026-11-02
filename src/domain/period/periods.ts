'use strict';
// Vòng đời kỳ lương: danh sách kiểm, chốt công, tính lương và bản chụp phiếu, AI kiểm tra, duyệt phiếu, duyệt kỳ, chi trả,
// mở lại, kiểm lại bản chụp, và số ước tính của chính nhân sự. Trạng thái và bất biến nằm ở src/platform/db.ts (store.periods, store.payroll,
// trigger); file này lo luật nghiệp vụ, danh sách kiểm, nhật ký và đầu vào. Mọi ghi nằm trong MỘT store.transaction cùng dòng nhật ký.
//   Quyền (kiểm ở server.js theo ROUTE_CAPS): attendance.lock, payroll.calculate, ai.review.read, payroll.approve, payroll.pay,
//   period.reopen (+ period.reopen.inputs khi mở về trạng thái trước "tính lương"), payroll.view, audit.read.
const { AsyncList } = require('../../shared/async-list');
const store = require('../../platform/db');
const audit = require('../../platform/audit');
const paramsStore = require('../../params/store');
const service = require('../payroll/payroll-service');
const config = require('../../platform/config');
const crypto = require('node:crypto');
const Params = require('../../engine/payroll-params');
const hashOf = (value?) => crypto.createHash('sha256').update(Params.canonical(value)).digest('hex');
const Engine = require('../../engine/payroll-engine');
const WorkSchedule = require('../../engine/work-schedule');
const PunchRules = require('../../engine/punch');
const PayrollCalendar = require('../../engine/payroll-calendar');
const { allowanceTotalOf } = require('./period-allowance'); // tổng phụ cấp (thành phần ③) của một bản chụp
const { formulasOf } = require('../payroll/slip-formulas'); // công thức dưới từng dòng Chi tiết của phiếu Admin
const { errorSummaryOf, staleOf } = require('./period-stale'); // phiếu lỗi gom theo mã; kỳ đã tính mà đầu vào hoặc tham số đổi sau đó
const payEntries = require('../payroll/pay-entries');
const explanations = require('../explanation/explanations');
const { AbsentDay } = require('../explanation/absent-day');
const sharedCache = require('../../ops/shared-cache'); // phép tính nặng chỉ-đọc dùng chung giữa các yêu cầu
const { closeStaleIn } = require('../attendance');
const { isatRefusal } = require('../isat-rule'); // ngày iSAT đúng thứ và đúng quyền lợi
const { warn, selfDecision, optionalReason } = require('../../platform/warnings');
const { CHECKLIST_TEXT, soften, warnNegativeNet, warnLockChecklist, autoCounts } = require('./period-warnings'); // câu cảnh báo của kỳ lương

const error = (code?, message?, httpStatus = 409, details?) =>
  Object.assign(new Error(message), { code, httpStatus, ...(details ? { details } : {}) });
const pad = (n?) => String(n).padStart(2, '0');
const nowIso = () => new Date(Date.now()).toISOString();
const today = () => PunchRules.vnDate(nowIso());
const nextMonthOf = (month?) => {
  const [y, m] = month.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`;
};
const needMonth = (month?) => {
  if (!PayrollCalendar.isValidMonth(month)) throw error('BAD_MONTH', 'Tháng phải có dạng YYYY-MM', 400);
  return month;
};
const toSafeStaff = ({ sessionVersion, ...rest }: any) => rest; // không bao giờ đưa số phiên bản phiên vào bản chụp

/* ========================= danh sách kiểm trước khi chốt công ========================= */
// Mã không bỏ qua được: tháng chưa hết và còn phiên Check-in mở. Mã `block` khác bỏ qua được bằng acknowledge kèm lý do.
const NOT_ACKNOWLEDGEABLE = Object.freeze(['MONTH_NOT_ENDED', 'OPEN_SESSIONS']);
// "Bỏ qua kèm lý do" (acknowledge) chỉ có ở bước chốt công (lockAttendance). Danh sách của bước duyệt (forApprove) không có nơi nào nhận
// acknowledge nên không mục nào bỏ qua được ở đó,.
// Mục CẢNH BÁO (không chặn) cho bước duyệt kỳ:
//   PENDING_PAY_ENTRIES  còn khoản điền thêm chờ duyệt của kỳ (khoản chưa duyệt không vào lương)
//   RUN_STALE            lần tính hiện hành đã cũ (đầu vào hoặc tham số đổi sau khi tính): duyệt sẽ chốt số cũ
// stale: kết quả staleOf đã tính sẵn (view tính một lần); bỏ trống thì tự tính từ lần tính hiện hành.
async function approvalWarnings(month?, { people, stale }: any = {}) {
  return soften(await approvalWarningsRaw(month, { people, stale }), month);
}
async function approvalWarningsRaw(month?, { people, stale }: any = {}) {
  const names = new Set<any>((people || (await service.payrollPeople(month))).map(s => s.username));
  const items: any[] = [];
  const pending = (await payEntries.list({ month, status: 'pending' })).filter(e => names.has(e.username)).length;
  if (pending > 0)
    items.push({
      code: 'PENDING_PAY_ENTRIES',
      count: pending,
      severity: 'warn',
      link: 'pay-entries',
      acknowledgeable: false
    });
  const isStale =
    stale === undefined
      ? (await staleOf(month, await store.periods.get(month), await store.payroll.currentRun(month))).stale
      : !!stale;
  if (isStale) items.push({ code: 'RUN_STALE', count: 1, severity: 'warn', link: 'periods', acknowledgeable: false });
  return items;
}
// raw: true trả danh sách gốc (mục chặn vẫn severity 'block'); lockAttendance cần nó để biết mục nào vốn là chặn. Mặc định là danh sách đã mềm hoá (soften).
async function checklist(month?, { forApprove = false, stale, raw = false }: any = {}) {
  needMonth(month);
  const people = await service.payrollPeople(month);
  const names = new Set<any>(people.map(s => s.username));
  const items: any[] = [];
  const add = (code?, count?, severity?, link?) => {
    if (count > 0)
      items.push({
        code,
        count,
        severity,
        link,
        acknowledgeable: !forApprove && severity === 'block' && !NOT_ACKNOWLEDGEABLE.includes(code)
      });
  };
  if (today() <= service.lastDayOf(month)) add('MONTH_NOT_ENDED', 1, 'block', 'attendance');
  await closeStaleIn(month, names); // lượt mở quá 16 giờ là "quên Check-out", không phải "đang mở": đóng trước khi đếm (như các màn Admin)
  const sessions = (await store.listSessions({ month })).filter(s => names.has(s.username));
  add('OPEN_SESSIONS', sessions.filter(s => s.state === 'open').length, 'block', 'attendance');
  // Quên Check-in/out chờ Admin: phiên đóng tự động và ngày thiếu một đầu theo ActualHours
  const forgot = new Set<any>(
    sessions
      .filter(s => s.entry.kind === 'pending' && s.entry.reason === 'forgot-out')
      .map(s => `${s.username}|${s.date}`)
  );
  for (const s of sessions) if (s.entry && s.entry.forgotIn) forgot.add(`${s.username}|${s.date}`);
  // Ngày chờ Admin xử lý nhưng không phải quên Check-in/out (chờ đối soát, không khớp ca...): trả 0 ₫ nếu không báo
  const punchReview = new Set<any>();
  const absentDays = new Set<any>(); // ngày trong lịch không có lượt Check-in/out nào (bộ máy tính vắng)
  const inputs = await service.loadInputs(month);
  const params = (await service.paramsFor(month)).params;
  for (const [username, person] of inputs.people)
    try {
      const out = service.computeFor(month, person.staff, inputs, params);
      const report = (out.actualReport && out.actualReport.report) || {};
      for (const [date, r] of Object.entries<any>(report))
        if (r.state === 'forgot-in' || r.state === 'forgot-out') forgot.add(`${username}|${date}`);
      for (const date of (out.actualReport && out.actualReport.absent) || [])
        if (date.startsWith(month + '-')) absentDays.add(`${username}|${date}`);
      const leaveAbsence = new AbsentDay({ store });
      for (const [date, day] of Object.entries<any>(person.days || {}))
        if (
          day?.kind === 'leave' &&
          person.approvals?.[date]?.item === 'leave' &&
          person.approvals?.[date]?.status === 'rejected' &&
          (await leaveAbsence.stateOf(username, date)) === 'absent'
        )
          absentDays.add(`${username}|${date}`);
      for (const date of (out.actualReport && out.actualReport.missing) || [])
        if (date.startsWith(month + '-') && !forgot.has(`${username}|${date}`)) punchReview.add(`${username}|${date}`);
    } catch {
      /* lỗi tính của từng người báo ở bước tính lương, không chặn danh sách kiểm */
    }
  // Giải trình đã bị từ chối là đã chốt "không tính công": ngày đó không còn chờ Admin xử lý. Giải trình chưa quyết định giữ ngày 0 ₫ nên được đếm riêng.
  const rejectedDays = new Set<any>();
  const undecidedDays = new Set<any>();
  for (const [username, held] of await explanations.heldByUser(month))
    if (names.has(username))
      for (const h of held) (h.status === 'rejected' ? rejectedDays : undecidedDays).add(`${username}|${h.date}`);
  for (const key of rejectedDays) {
    forgot.delete(key);
    punchReview.delete(key);
  }
  // Ngày vắng mà chưa có giải trình nào (mọi trạng thái): Admin chưa có gì để xử lý, nhân viên có thể còn giải trình
  for (const [username, dates] of await explanations.explainedByUser(month))
    for (const date of dates) absentDays.delete(`${username}|${date}`);
  add('FORGOT_PUNCH', forgot.size, 'block', 'attendance');
  add('PUNCH_REVIEW', punchReview.size, 'block', 'attendance');
  add('EXPLANATION_PENDING', undecidedDays.size, 'warn', 'approvals');
  add('ABSENT_NO_EXPLANATION', absentDays.size, 'warn', 'attendance');
  add(
    'PENDING_APPROVALS',
    (await store.approvals.list({ status: 'pending' })).filter(
      r => r.date.startsWith(month + '-') && names.has(r.username)
    ).length,
    'block',
    'approvals'
  );
  add('MISSING_SHIFT', people.filter(s => !s.locked && !s.shiftCode).length, 'warn', 'staff');
  add(
    'MISSING_START_DATE',
    (
      await AsyncList.filter(
        people,
        async s =>
          (await service.paramsFor(month)).params[`type.${s.type}.startDateRequired`] &&
          !PayrollCalendar.isValidDate(s.startDate)
      )
    ).length,
    'block',
    'staff'
  );
  // Ngày iSAT đã lưu mà sai thứ hoặc chức vụ không có quyền lợi iSAT (đã lưu trước khi khai bị chặn): bộ máy không trả lương ngày đó
  const isatParams = (await service.paramsFor(month)).params;
  let badIsat = 0;
  for (const person of people)
    for (const [date, day] of Object.entries<any>((await store.getSheet(person.username, month)).days))
      if (
        day &&
        day.kind === 'isat' &&
        date.startsWith(month + '-') &&
        isatRefusal({ params: isatParams, staff: person, date })
      )
        badIsat++;
  add('ISAT_INVALID', badIsat, 'warn', 'attendance');
  if (forApprove) {
    const period = await store.periods.get(month);
    items.push(...(await approvalWarningsRaw(month, { people, stale })));
  }
  return raw ? items : soften(items, month);
}

/* ========================= xem ========================= */
const brief = (p?) => ({ month: p.month, status: p.status, rev: p.rev });
async function view(month?) {
  needMonth(month);
  const period = await store.periods.get(month);
  const run = await store.payroll.currentRun(month);
  // Mở lại về "calculated" xoá lần tính hiện hành: phải tính lương lại trước khi chạy AI hay duyệt phiếu. Giao diện đọc cờ này, không tự đoán.
  const needsRecalculate = period.status === 'calculated' && period.currentRunId == null;
  const slips = run ? await allSlips(run.id) : null;
  const stale = await staleOf(month, period, run);
  return {
    month,
    status: period.status,
    rev: period.rev,
    managed: true,
    reopenCount: period.reopenCount,
    stages: {
      attendanceLocked: { by: period.attendanceLockedBy, at: period.attendanceLockedAt },
      calculated: { by: period.calculatedBy, at: period.calculatedAt },
      reviewed: { by: period.reviewedBy, at: period.reviewedAt },
      approved: { by: period.approvedBy, at: period.approvedAt },
      paid: { by: period.paidBy, at: period.paidAt, ref: period.paidRef }
    },
    run,
    counts: run ? await store.payroll.countPayslips(run.id) : null,
    totals: slips ? totalsOf(await paidRows(run, slips)) : null, // tổng theo số chi trả (số Admin đã sửa)
    ...(slips ? { errorSummary: errorSummaryOf(slips) } : {}),
    attendanceKept: slips ? attendanceKeptOf(await runLines(run)) : null,
    needsRecalculate,
    ...stale,
    // Kỳ đã soát (sắp duyệt) chỉ còn các cảnh báo; kỳ mở hoặc đã tính có đủ danh sách kiểm
    checklist:
      period.status === 'open' || period.status === 'calculated'
        ? await checklist(month, { forApprove: period.status === 'calculated', stale: stale.stale })
        : period.status === 'reviewed'
          ? await approvalWarnings(month, { stale: stale.stale })
          : []
  };
}
async function list(year?) {
  const y = Number(year);
  if (!Number.isInteger(y) || y < 0) throw error('BAD_YEAR', 'year phải là số nguyên', 400);
  const known = new Map<any, any>((await store.periods.list({ year: y })).map(p => [p.month, p]));
  const payDay = Params.DEFAULTS['period.payDay'];
  return Promise.all(
    Array.from({ length: 12 }, async (_, i) => {
      const month = `${y}-${pad(i + 1)}`;
      const p = known.get(month) || (await store.periods.get(month));
      const run = p.currentRunId == null ? null : await store.payroll.getRun(p.currentRunId);
      const day = pad((await paramsStore.resolve(month)).params['period.payDay'] ?? payDay);
      return {
        month,
        status: p.status,
        rev: p.rev,
        managed: true,
        counts: run ? await store.payroll.countPayslips(run.id) : null,
        paydayExpected: `${nextMonthOf(month)}-${day}`
      };
    })
  );
}

/* ========================= các bước ghi ========================= */
// Kiểm tháng được quản lý, rev khớp và trạng thái trước khi làm việc nặng (kiểm danh sách, tính lương): báo đúng mã thay vì mã của bước sau
async function precheck(month?, rev?, from?) {
  needMonth(month);
  if (!Number.isInteger(rev)) throw error('BAD_REV', 'Thiếu số phiên bản (rev) của kỳ', 400);
  const period = await store.periods.get(month);
  if (period.rev !== rev)
    throw error('PERIOD_STALE', 'Kỳ đã được người khác đổi, tải lại rồi làm lại', 409, { month, rev: period.rev });
  if (!from.includes(period.status))
    throw error('PERIOD_STATE', 'Kỳ không ở trạng thái cho phép làm bước này', 409, {
      month,
      status: period.status,
      expected: from
    });
  return period;
}
// Lý do không bắt buộc (quá ${config.REASON_MAX} ký tự là lỗi). Trả '' khi không có.
const cleanText = (value?, label?) => {
  const bad = () => error('REASON_REQUIRED', `${label} tối đa ${config.REASON_MAX} ký tự`, 400);
  return optionalReason(value, { tooLong: bad });
};
const auditPeriod = async (actx?, action?, month?, before?, after?, reason?) =>
  await audit.write(actx, {
    action,
    entityKind: 'period',
    entityId: month,
    month,
    before,
    after,
    reason: reason || null,
    sensitivity: 'pay'
  });

async function lockAttendance(month, { rev, acknowledge, reason }: any, actx?, by?) {
  await precheck(month, rev, ['open']);
  const raw = await checklist(month, { raw: true });
  const items = soften(raw, month); // mọi mục là cảnh báo kèm câu hệ quả
  const ack = new Set<any>(Array.isArray(acknowledge) ? acknowledge.map(String) : []);
  const blockers = raw.filter(i => i.severity === 'block' && !(i.acknowledgeable && ack.has(i.code)));
  // Chốt công khi còn việc: vẫn chốt, mỗi mục là một cảnh báo (mã của mục) nói số lượng và hệ quả tiền
  warnLockChecklist(blockers, items);
  const acknowledged = raw.filter(i => i.severity === 'block' && ack.has(i.code)).map(i => i.code);
  const note = acknowledged.length ? cleanText(reason, 'Lý do bỏ qua danh sách kiểm') || null : null;
  return await store.transaction(async () => {
    const next = await store.periods.lockAttendance(month, { rev, by });
    await auditPeriod(
      actx,
      'period.lock-attendance',
      month,
      { status: 'open' },
      { status: next.status, acknowledged, checklist: Object.fromEntries(items.map(i => [i.code, i.count])) },
      note
    );
    return { ...brief(next), checklist: items };
  });
}

// Câu báo lỗi tính lương cho người đọc: công thức đã lưu hỏng nói rõ để Admin sửa ở Cài đặt › Công thức, các lỗi khác giữ nguyên thông báo
const BAD_FORMULA_PREFIX = 'Công thức đã lưu không hợp lệ';
const errorMessageOf = (e?) => {
  const text = String((e && e.message) || e).slice(0, config.REASON_MAX);
  return e && e.code === 'PAYROLL_BAD_FORMULA' && !text.startsWith(BAD_FORMULA_PREFIX)
    ? `${BAD_FORMULA_PREFIX}: ${text}`.slice(0, config.REASON_MAX)
    : text;
};

// Một phiếu: số tiền (đồng nguyên), điều khoản đã chụp, bản chụp m (kèm vết) hoặc lỗi
function slipOf(month?, staff?, inputs?, params?) {
  const terms = toSafeStaff(staff);
  try {
    const out = service.computeFor(month, staff, inputs, params);
    const net = out.m.net;
    return {
      username: staff.username,
      status: 'draft',
      gross: net.gross,
      insurance: net.insurance,
      tax: net.tax,
      advance: net.advance,
      net: net.net,
      staffTerms: terms,
      snapshot: { ...out.m, trace: out.m.trace }
    };
  } catch (e) {
    return {
      username: staff.username,
      status: 'error',
      errorCode: typeof e.code === 'string' ? e.code : 'CALC_ERROR',
      errorDetail: errorMessageOf(e),
      staffTerms: terms,
      snapshot: {}
    };
  }
}
async function calculate(month, { rev }: any, actx?, by?) {
  await precheck(month, rev, ['attendance_locked', 'calculated', 'reviewed']);
  const resolved = await paramsStore.resolve(month);
  return await store.transaction(async () => {
    const inputs = await service.loadInputs(month);
    const run = await store.payroll.createRun(month, {
      engineVersion: Engine.ENGINE_VERSION,
      paramsHash: resolved.hash,
      paramsRev: resolved.rev,
      params: resolved.params,
      switches: service.contextOf(inputs),
      inputsDigest: service.digestOf(inputs),
      by
    });
    let errors = 0;
    for (const [, person] of inputs.people) {
      const slip = slipOf(month, person.staff, inputs, resolved.params);
      if (slip.status === 'error') errors++;
      await store.payroll.addPayslip(run.id, slip);
    }
    await store.payroll.finishRun(run.id, { total: inputs.people.size, errors });
    const next = await store.periods.markCalculated(month, { rev, by, runId: run.id });
    await auditPeriod(actx, 'period.calculate', month, null, {
      status: next.status,
      runNo: run.runNo,
      slips: inputs.people.size,
      errors,
      paramsRev: resolved.rev
    });
    return {
      ...brief(next),
      run: await store.payroll.getRun(run.id),
      counts: await store.payroll.countPayslips(run.id)
    };
  });
}

async function decidePayslips(month?, body?, me?, actx?) {
  needMonth(month);
  const period = await store.periods.get(month);
  if (period.currentRunId == null)
    throw error('PERIOD_STATE', 'Kỳ chưa có lần tính lương', 409, { month, status: period.status });
  const items = Array.isArray(body.items) ? body.items : [];
  // Ghi chú chỉ nhận chữ: số hay đối tượng sẽ lọt qua cổng phát hiện AI bên dưới (chỉ chạy với ghi chú chữ) rồi bị store ép kiểu
  if (body.note !== undefined && body.note !== null && typeof body.note !== 'string')
    throw error('BAD_NOTE', 'Ghi chú phải là chữ', 400);
  // Không ai duyệt hay trả lại phiếu của chính mình
  // Chỉ cảnh báo, nhật ký ghi after.self
  selfDecision(
    items.some(i => i && i.username === me.username && me.payrollSubject),
    {
      doing: 'duyệt hoặc trả lại phiếu lương'
    }
  );
  return await store.transaction(async () => {
    // Phiếu có thực lĩnh chi trả âm (sau số đã sửa) vẫn duyệt được, kèm cảnh báo đỏ
    if (body.action === 'approve') {
      const run = await store.payroll.getRun(period.currentRunId);
      const chosen = new Set<any>(items.filter(i => i && typeof i.username === 'string').map(i => i.username));
      const rows = (await allSlips(run.id)).filter(r => chosen.has(r.username));
      const negative = await negativePaidNets(run, rows);
      warnNegativeNet(month, negative);
    }
    const decided = await store.payroll.decidePayslips(period.currentRunId, {
      items,
      action: body.action,
      note: body.note,
      by: me.username
    });
    for (const row of decided)
      await audit.write(actx, {
        action: body.action === 'approve' ? 'payslip.approve' : 'payslip.return',
        entityKind: 'payslip',
        entityId: `${month}:${row.username}`,
        subject: row.username,
        month,
        after: { status: row.status, rev: row.rev },
        reason: typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null,
        sensitivity: 'pay'
      });
    return decided;
  });
}

async function approve(month, { rev, excludeErrors }: any, actx?, by?) {
  const period = await precheck(month, rev, ['calculated', 'reviewed']);
  return await store.transaction(async () => {
    // Còn phiếu có thực lĩnh chi trả âm (kể cả số sửa lưu sau khi phiếu đã duyệt) thì cảnh báo; số sửa sẽ đóng băng đúng số này
    const run = period.currentRunId == null ? null : await store.payroll.getRun(period.currentRunId);
    if (run) {
      const negative = await negativePaidNets(run, await allSlips(run.id));
      warnNegativeNet(month, negative);
    }
    // Store tự duyệt các phiếu chưa xong và tự loại phiếu lỗi chưa loại; nhật ký ghi bao nhiêu phiếu mỗi loại
    const auto = run ? autoCounts(await allSlips(run.id), excludeErrors) : {};
    const next = await store.periods.approve(month, { rev, by, excludeErrors });
    await auditPeriod(
      actx,
      'period.approve',
      month,
      { status: period.status },
      { status: next.status, excluded: Array.isArray(excludeErrors) ? excludeErrors.length : 0, ...auto }
    );
    return brief(next);
  });
}
async function markPaid(month, { rev, paidAt, reference }: any, actx?, by?) {
  await precheck(month, rev, ['approved']);
  // Ngày chi trả chỉ nhận YYYY-MM-DD hợp lệ (Date.parse nhận cả "1" hay "May 5"); kiểm sau tháng và rev (lỗi tháng, rev báo trước)
  if (!PayrollCalendar.isValidDate(paidAt))
    throw error('BAD_PAID_AT', 'Ngày chi trả phải có dạng YYYY-MM-DD và là ngày có thật', 400);
  return await store.transaction(async () => {
    const next = await store.periods.markPaid(month, { rev, by, paidAt, reference });
    await auditPeriod(
      actx,
      'period.mark-paid',
      month,
      { status: 'approved' },
      { status: next.status, paidAt: next.paidAt }
    );
    return { ...brief(next), paidAt: next.paidAt };
  });
}
// Mở lại: về `open` hoặc `attendance_locked` cần period.reopen.inputs (Admin); về `calculated` chỉ cần period.reopen (C&B). `paid` không mở lại được.
async function reopen(month, { rev, to, reason }: any, actx?, by?) {
  needMonth(month);
  const period = await store.periods.get(month);
  const reasonText = cleanText(reason, 'Lý do mở lại kỳ');
  return await store.transaction(async () => {
    const next = await store.periods.reopen(month, { rev, by, to, reason: reasonText });
    await auditPeriod(
      actx,
      'period.reopen',
      month,
      { status: period.status },
      { status: next.status, to, reopenCount: next.reopenCount },
      reasonText
    );
    return brief(next);
  });
}
const REOPEN_INPUTS_CAP = (target?) => (target === 'calculated' ? null : 'period.reopen.inputs');

/* ========================= đọc phiếu ========================= */
// Các dòng tiền của một phiếu, lấy từ BẢN CHỤP (không tính lại). Số trong vết (trace) là số nguyên đồng cộng đúng bằng tổng thu nhập; bản chụp cũ
// có số thực thì làm tròn từng dòng. Phiếu lỗi hoặc bản chụp cũ không có vết: trả null.
//   tienNgayCong  tiền ngày công, đã trừ trễ sớm (truTreSom) và giờ làm lễ tách riêng
//   phuCap        đi lại + chuyên cần
//   ot            tiền OT;  kpi  lương KPI
//   truTreSom     tiền trừ do thiếu giờ (đi trễ, về sớm, thiếu giờ ngày làm): m.cut; ĐÃ nằm trong tienNgayCong, hiện thành dòng trừ, không cộng thêm
//   khac          các thành phần ngày còn lại (phụ cấp ca, giờ nghỉ đêm, làm bù, tiền làm lễ), để các dòng cộng lại bằng tổng thu nhập
//   attendOk      true/false = có phụ cấp chuyên cần và giữ/mất; null = loại này không có phụ cấp chuyên cần
//   khoanThem, khoanTru   khoản điền thêm đã duyệt (chỉ có khi phiếu có khoản): cộng nằm trong tổng thu nhập, trừ sau thuế
const numOr0 = (value?) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
// Ngày công chuẩn của người trong tháng: m.workdaysStd khi bộ máy ghi (tự đếm theo lịch), không thì type.<mã>.workdays của bộ tham số lần chạy sau khi
// qua đúng bước tháng của bộ máy (WorkSchedule.monthView: pay.method C đếm theo lịch); null khi thiếu tham số hay chức vụ. Chỉ đọc, không tính lương.
function workdaysStdOf(snapshot?, type?, params?, month?) {
  if (snapshot && typeof snapshot.workdaysStd === 'number') return snapshot.workdaysStd;
  if (!params || typeof type !== 'string') return null;
  const view = WorkSchedule.create(Params.fillLate(params)).monthView(month);
  const value = Object.hasOwn(view, `type.${type}.workdays`) ? view[`type.${type}.workdays`] : null;
  return typeof value === 'number' ? value : null;
}
function linesOf(snapshot?, std: any = null) {
  const trace = snapshot && snapshot.trace;
  if (!trace) return null;
  return {
    workDays: numOr0(snapshot.count),
    daysWorked: numOr0(snapshot.count), // số ngày công đã làm tính lương (cùng số với workDays)
    workdaysStd: std,
    tienNgayCong: Math.round(numOr0(trace.tienNgayCong)),
    phuCap: Math.round(numOr0(trace.phuCapDiLai)) + Math.round(numOr0(trace.phuCapChuyenCan)),
    allowanceTotal: allowanceTotalOf(snapshot), // gồm phuCap, phụ cấp ca, giờ nghỉ đêm và khoiThem; số tự tính, chưa áp số Admin sửa
    ot: Math.round(numOr0(trace.tienOt)),
    kpi: Math.round(numOr0(trace.luongKpi)),
    truTreSom: snapshot.lines ? snapshot.lines.lateCut : Math.round(numOr0(snapshot.cut)),
    khac:
      Math.round(numOr0(trace.phuCapCa)) +
      Math.round(numOr0(trace.gioNghiDem)) +
      Math.round(numOr0(trace.lamBu)) +
      Math.round(numOr0(trace.tienLamLe)),
    attendOk: typeof snapshot.attendOk === 'boolean' ? snapshot.attendOk : null,
    ...(snapshot.settlePay ? { quyetToanPhep: snapshot.settlePay, quyetToanNgay: numOr0(snapshot.settleDays) } : {}), // phép dư hết hạn quy tiền, đã nằm trong tổng thu nhập
    // khoản điền thêm đã duyệt: chỉ phiếu có khoản mới có hai dòng này; khoanThem đã nằm trong tổng thu nhập, khoanTru trừ sau thuế
    ...(snapshot.entries && snapshot.entries.length
      ? {
          khoanThem: numOr0(snapshot.net && snapshot.net.entriesAdd),
          khoanTru: numOr0(snapshot.net && snapshot.net.entriesDeduct)
        }
      : {}),
    // khối phụ cấp do C&B thêm (nằm trong tổng thu nhập, sau cây tongThuNhap): chỉ phiếu có khối mới có dòng này, kèm chi tiết từng khối (nhãn, số tiền)
    ...(snapshot.blocks && snapshot.blocks.length
      ? {
          khoiThem: snapshot.blocks.reduce((sum, b) => sum + numOr0(b.amount), 0),
          khoiThemChiTiet: snapshot.blocks.map(b => ({ code: b.code, label: b.label, amount: numOr0(b.amount) }))
        }
      : {})
  };
}
const NO_LINES = Object.freeze({
  workDays: null,
  daysWorked: null,
  workdaysStd: null,
  tienNgayCong: null,
  phuCap: null,
  allowanceTotal: null,
  ot: null,
  kpi: null,
  truTreSom: null,
  khac: null,
  attendOk: null
});
const slimSlip = (r?, lines?) => ({
  username: r.username,
  name: r.name ?? (r.staffTerms && r.staffTerms.name) ?? null,
  type: r.staffTerms && r.staffTerms.type,
  level: r.staffTerms && r.staffTerms.level,
  status: r.status,
  rev: r.rev,
  ...(lines || NO_LINES),
  gross: r.gross,
  insurance: r.insurance,
  tax: r.tax,
  advance: r.advance,
  net: r.net,
  // Thu nhập miễn thuế, chịu thuế và sau BH bắt buộc (có ở phiếu đã tính lương; hàng ước tính chưa có thì không hiện)
  exempt: r.exempt,
  taxable: r.taxable,
  afterInsurance: r.afterInsurance,
  // Phiếu có số Admin đã sửa: gross..net ở trên là số CHI TRẢ; computed là số tự tính của bản chụp để giao diện đối chiếu
  ...(r.computed ? { computed: r.computed, overridden: r.overridden } : {}),
  flags: r.flags,
  errorCode: r.errorCode,
  errorDetail: r.errorDetail ?? undefined,
  decidedBy: r.decidedBy,
  decidedAt: r.decidedAt,
  note: r.note
});

// Mọi phiếu của một lần chạy (không kèm bản chụp), theo trang tối đa của danh sách
async function allSlips(runId?, filter: any = {}) {
  const rows: any[] = [];
  for (let page = 1; ; page += 1) {
    const got = await store.payroll.listPayslips(runId, { ...filter, page, pageSize: config.PAYSLIP_PAGE_MAX });
    rows.push(...got.rows);
    if (!got.rows.length || rows.length >= got.total) return rows;
  }
}
const slipPins = require('../payroll/slip-pins'); // phiếu tính lại theo ô số lượng Admin ghim
const {
  slipBasisOf,
  cellsOf,
  paidFigures,
  taxFromOf,
  overrideValuesOf,
  paidRow,
  staffPaidSnapshot,
  withDayFigures,
  dayRowsOf,
  withoutPunchTimes,
  staffDayNotesOf
} = require('../payroll/slip-paid'); // số chi trả: số Admin đã sửa áp lên bản chụp (số tự tính)
// Các dòng của phiếu cho nhân sự: tính từ bản chụp đã thay số chi trả; dòng nào nguồn đã bị bỏ thì null (không hiện 0 ₫ giả)
function staffLinesOf(snapshot?, std?) {
  const lines: any = linesOf(snapshot, std);
  if (!lines) return lines;
  const gone = (key?) => !Object.hasOwn(snapshot.trace, key);
  if (gone('tienNgayCong')) lines.tienNgayCong = null;
  if (gone('tienOt')) lines.ot = null;
  if (['phuCapCa', 'gioNghiDem', 'lamBu', 'tienLamLe'].some(gone)) lines.khac = null;
  if (!Object.hasOwn(snapshot, 'cut')) lines.truTreSom = null;
  return lines;
}
// Dòng ngày công, phụ cấp... của phiếu: phiếu có ô số lượng ghim thì lấy từ bản chụp đã tính lại (pinnedSnapshot do withPaid gắn)
const linesFor = (r?, base?) => (r.pinnedSnapshot ? linesOf(r.pinnedSnapshot, base && base.workdaysStd) : base);
async function withPaid(run?, row?, scan?) {
  const values = await overrideValuesOf(run, row);
  // Ô số lượng ghim: tính lại từ chính bản chụp của phiếu và bộ tham số của lần tính; số chi trả lấy từ bản đã tính lại
  let pinnedSnapshot: any = null;
  if (row.status !== 'error' && slipPins.hasPins(values)) {
    const full = await store.payroll.getPayslip(run.id, row.username, { snapshot: true });
    pinnedSnapshot = full ? slipPins.repinned(full.snapshot, full.staffTerms, values, scan.params, run.month) : null;
  }
  const basis = pinnedSnapshot ? slipBasisOf(pinnedSnapshot) : scan.basis.get(row.username);
  const paid = paidRow(row, basis, values, scan.taxFrom, !!pinnedSnapshot);
  if (paid) return pinnedSnapshot ? { ...paid, pinnedSnapshot } : paid;
  // Không số sửa: số lưu giữ nguyên, thêm miễn thuế, chịu thuế và sau BH lấy từ bản chụp
  if (row.status === 'error' || !basis) return row;
  return {
    ...row,
    exempt: basis.n.exempt,
    taxable: basis.n.taxable,
    afterInsurance: Number.isFinite(row.gross) && Number.isFinite(row.insurance) ? row.gross - row.insurance : undefined
  };
}
async function paidRows(run?, rows?) {
  const scan = await runScan(run);
  return await AsyncList.map(rows, async row => await withPaid(run, row, scan));
}
// Phiếu có thực lĩnh chi trả âm (sau số đã sửa): [{ username, net }], thực lĩnh đúng 0 thì được
async function negativePaidNets(run?, rows?) {
  return (await paidRows(run, rows))
    .filter(row => typeof row.net === 'number' && row.net < 0)
    .map(row => ({ username: row.username, net: row.net }));
}

// Các dòng tiền và cơ sở tính số chi trả của mọi phiếu trong một lần chạy, nhớ theo tháng. Bản chụp không đổi được (trigger của db.js), nên khoá lần chạy + băm đầu vào + giờ xong là đủ.
// Số Admin đang sửa KHÔNG nằm trong bộ nhớ này (đổi được sau khi tính): đọc mỗi lần ở withPaid.
const linesCache = new Map<any, any>();
async function runScan(run?) {
  const key = `${run.id}:${run.inputsDigest}:${run.finishedAt}`;
  const hit = run.finishedAt && linesCache.get(run.month);
  if (hit && hit.key === key) return hit;
  const byUser = new Map<any, any>();
  const basis = new Map<any, any>();
  const params = (await store.payroll.getRun(run.id, { params: true })).params; // bộ tham số đã chụp của lần chạy (cho ngày công chuẩn)
  for (const row of await allSlips(run.id)) {
    const slip = await store.payroll.getPayslip(run.id, row.username, { snapshot: true });
    byUser.set(
      row.username,
      slip
        ? linesOf(
            slip.snapshot,
            workdaysStdOf(slip.snapshot, slip.staffTerms && slip.staffTerms.type, params, run.month)
          )
        : null
    );
    basis.set(row.username, slip ? slipBasisOf(slip.snapshot) : null);
  }
  const scan = { key, byUser, basis, taxFrom: taxFromOf(params), params };
  if (run.finishedAt) linesCache.set(run.month, scan);
  return scan;
}
async function runLines(run?) {
  return (await runScan(run)).byUser;
}
// Tổng của kỳ: cộng các số đồng nguyên đã lưu trên từng phiếu (không làm tròn thêm); phiếu lỗi không có số tiền nên cộng 0
const SUM_KEYS = Object.freeze(['gross', 'insurance', 'tax', 'advance', 'net']);
const COUNT_STATUSES = Object.freeze(['approved', 'pending', 'draft', 'error']);
function totalsOf(rows?) {
  const totals = {
    people: rows.length,
    ...Object.fromEntries(SUM_KEYS.map(key => [key, 0])),
    ...Object.fromEntries(COUNT_STATUSES.map(key => [key, 0]))
  };
  for (const row of rows) {
    for (const key of SUM_KEYS) totals[key] += numOr0(row[key]);
    if (COUNT_STATUSES.includes(row.status)) totals[row.status] += 1;
  }
  return totals;
}
// Số người có phụ cấp chuyên cần (of) và số người còn giữ (kept)
function attendanceKeptOf(lines?) {
  const out = { kept: 0, of: 0 };
  for (const line of lines.values())
    if (line && line.attendOk !== null) {
      out.of += 1;
      if (line.attendOk) out.kept += 1;
    }
  return out;
}
const needType = (type?, params?) => {
  if (type === undefined || type === null || type === '') return null;
  if (typeof type !== 'string' || !Object.hasOwn(params, `type.${type}.workdays`))
    throw error('BAD_TYPE', 'Loại nhân sự không có trong bảng loại', 400);
  return type;
};
const pageNumber = (value?) => Math.max(1, Math.trunc(Number(value)) || 1);
const pageSizeOf = (value?) =>
  Math.max(1, Math.min(Math.trunc(Number(value)) || config.PAYSLIP_PAGE_DEFAULT, config.PAYSLIP_PAGE_MAX));

// Danh sách phiếu của lần tính hiện hành. Bộ lọc status, q, flag chạy trong SQL; `type` lọc theo điều khoản đã chụp nên phải lấy cả tập rồi cắt trang.
async function payslips(month?, { status, q, flag, type, page, pageSize }: any = {}) {
  needMonth(month);
  const filterType = needType(type, (await paramsStore.resolve(month)).params); // tham số sai báo ngay cả khi chưa có lần tính
  const run = await store.payroll.currentRun(month);
  if (!run) return { month, run: null, total: 0, page: 1, pageSize: config.PAYSLIP_PAGE_DEFAULT, rows: [] };
  const size = pageSizeOf(pageSize);
  const filter = { status, q, flagged: flag === undefined ? undefined : flag === '1' };
  const lines = await runLines(run);
  let total, pageNo, rows;
  if (filterType) {
    const matched = (await allSlips(run.id, filter)).filter(r => r.staffTerms && r.staffTerms.type === filterType);
    total = matched.length;
    pageNo = pageNumber(page);
    rows = matched.slice((pageNo - 1) * size, pageNo * size);
  } else {
    const found = await store.payroll.listPayslips(run.id, { ...filter, page, pageSize: size });
    ({ total, page: pageNo, rows } = found);
  }
  return {
    month,
    run: { id: run.id, runNo: run.runNo, status: run.status },
    total,
    page: pageNo,
    pageSize: size,
    rows: (await paidRows(run, rows)).map(r => slimSlip(r, linesFor(r, lines.get(r.username))))
  };
}

// Hàng ước tính của MỘT người (chưa có lần tính nên chưa có phiên bản duyệt, cờ AI, người duyệt): dùng chung cho danh sách estimates() và
// phiếu một người estimateOne() để hai nơi không bao giờ lệch nhau.
async function estimateRow(month?, person?, inputs?, params?) {
  const slip = slipOf(month, person.staff, inputs, params);
  // Số Admin đã sửa là số chi trả cả khi chưa tính lương: áp lên số ước tính bằng bộ tham số đã giải của tháng; không số sửa thì giữ nguyên hàng
  const values = slip.status === 'error' ? {} : (await store.getSlipOverride(slip.username, month)).values;
  // Ô số lượng ghim: bản chụp tính lại theo ghim (chính bộ máy lương), rồi ô tiền sửa thẳng áp lên đó; computed giữ số tự tính chưa ghim
  const pinned =
    slip.status === 'error' ? null : slipPins.repinned(slip.snapshot, slip.staffTerms, values, params, month);
  const snapshot = pinned || slip.snapshot;
  const paid = Object.keys(values).length
    ? paidRow(slip, slipBasisOf(snapshot), values, taxFromOf(params), !!pinned)
    : null;
  return {
    ...(paid || slip),
    snapshot,
    cells: slip.status === 'error' ? null : cellsOf(snapshot, slip.snapshot), // ô sửa được theo số tự tính: tiền theo ghim, số lượng theo bản gốc
    rev: null,
    flags: [],
    decidedBy: null,
    decidedAt: null,
    note: null,
    lines:
      slip.status === 'error' ? null : linesOf(snapshot, workdaysStdOf(snapshot, slip.staffTerms.type, params, month))
  };
}
// Ước tính cả kỳ cho Admin TRƯỚC khi có lần tính lương: mọi nhân sự được trả lương, tính bằng payroll-service (loadInputs một lần, computeFor
// từng người, cả tháng, bộ tham số đã giải của tháng), cùng hàng gọn như payslips() với source 'estimate'. Không ghi gì vào DB.
// Phiếu lỗi (hồ sơ sai loại hoặc bậc...) thành hàng status 'error' kèm mã, không bao giờ là 0 ₫. Hàng hợp lệ có status 'draft' (chưa duyệt).
// totals và attendanceKept là của CẢ kỳ (không theo q, type); rows và total theo bộ lọc.
// Phần nặng (tính cả bảng lương) dùng chung giữa các yêu cầu cùng tháng: src/ops/compute-cache.ts (hết hạn khi DB có bất kỳ thay đổi nào hoặc sau vài giây).
// Kết quả chỉ được đọc, không sửa; lọc theo q, type và phân trang làm lại ở mỗi yêu cầu trên bản dùng chung này.
async function estimatesOfMonth(month?) {
  return await sharedCache.compute.get(`estimates|${month}`, async () => {
    const resolved = await paramsStore.resolve(month);
    const inputs = await service.loadInputs(month);
    const all: any[] = [];
    for (const [, person] of inputs.people) all.push(await estimateRow(month, person, inputs, resolved.params));
    all.sort((a: any, b: any) => (a.username < b.username ? -1 : a.username > b.username ? 1 : 0));
    return {
      resolved,
      asOf: inputs.asOf,
      all,
      totals: totalsOf(all),
      attendanceKept: attendanceKeptOf(new Map<any, any>(all.map(r => [r.username, r.lines])))
    };
  });
}
async function estimates(month?, { page, pageSize, q, type }: any = {}) {
  needMonth(month);
  const { resolved, asOf, all, totals, attendanceKept } = await estimatesOfMonth(month);
  const filterType = needType(type, resolved.params);
  const needle = typeof q === 'string' ? q.trim().toLocaleLowerCase('vi') : '';
  const matched = all.filter(
    r =>
      (!filterType || r.staffTerms.type === filterType) &&
      (!needle ||
        r.username.toLocaleLowerCase('vi').includes(needle) ||
        String(r.staffTerms.name || '')
          .toLocaleLowerCase('vi')
          .includes(needle))
  );
  const size = pageSizeOf(pageSize);
  const pageNo = pageNumber(page);
  return {
    month,
    source: 'estimate',
    run: null,
    period: brief(await store.periods.get(month)),
    paramsHash: resolved.hash,
    engineVersion: Engine.ENGINE_VERSION,
    asOf,
    total: matched.length,
    page: pageNo,
    pageSize: size,
    totals,
    attendanceKept,
    rows: matched.slice((pageNo - 1) * size, pageNo * size).map(r => ({ ...slimSlip(r, r.lines), source: 'estimate' }))
  };
}
// Phiếu ước tính đầy đủ của MỘT người khi kỳ chưa tính lương (Chi tiết ở bảng ước tính): cùng hàng với estimates() qua estimateRow, cùng dạng
// với payslip() (kèm staffTerms và bản chụp) nhưng tính trực tiếp, run null, source 'estimate'. Không ghi gì vào DB.
// Tên không có trong bảng lương của tháng: PAYSLIP_NOT_FOUND như payslip(). Hồ sơ không tính được: 200 với payslip.status 'error'.
async function estimateOne(month?, username?) {
  needMonth(month);
  const resolved = await paramsStore.resolve(month);
  const inputs = await service.loadInputs(month, { usernames: [username] });
  const person = inputs.people.get(username);
  if (!person) throw noSlipOfPerson(month);
  const row = await estimateRow(month, person, inputs, resolved.params);
  const kpiSlip = await service.kpiSlipCells(username, month, resolved.params); // 5 ô điểm KPI điền sẵn từ điểm đã nhập
  return {
    month,
    period: brief(await store.periods.get(month)),
    run: null,
    source: 'estimate',
    paramsHash: resolved.hash,
    engineVersion: Engine.ENGINE_VERSION,
    asOf: inputs.asOf,
    holidays: inputs.holidays,
    payslip: {
      ...slimSlip(row, row.lines),
      staffTerms: row.staffTerms,
      snapshot: await withDayFigures(row.snapshot, { username, month }), // dòng ngày kèm bốn cột tiền (cot: luongNgay, phuCapCa, lamThem, truGio) và giờ bấm thật cho trang 1 bản in
      // số Admin đang sửa (như phiếu đã tính) và các ô sửa được theo số tự tính của bản chụp đã tính lại theo ghim
      override: await store.getSlipOverride(username, month),
      cells: row.cells,
      // công thức của số tự tính từng dòng, dựng từ bản chụp ước tính và bộ tham số đã giải của tháng
      formulas: formulasOf({
        snapshot: row.snapshot,
        staffTerms: row.staffTerms,
        params: resolved.params,
        month,
        cells: row.cells
      }),
      kpiSlip
    }
  };
}
// Tài khoản có phiếu trong lần tính hiện hành (bỏ phiếu lỗi), để báo "phiếu lương đã có" sau khi chi trả
async function payslipUsers(month?) {
  needMonth(month);
  const run = await store.payroll.currentRun(month);
  return run ? (await allSlips(run.id)).filter(r => r.status !== 'error').map(r => r.username) : [];
}
// Phần của hàng phiếu nhân sự KHÔNG được thấy ở phiếu của chính mình: cờ AI, ghi chú và người/lúc duyệt, chi tiết lỗi (nội bộ của người duyệt).
function selfView(row?) {
  // gross..net đã là số chi trả; số tự tính (computed) và cờ overridden không đưa cho nhân sự
  const { flags, note, decidedBy, decidedAt, errorDetail, computed, overridden, ...visible } = row;
  return visible;
}
// Lỗi "không có phiếu của người này trong kỳ", dùng chung cho payslip() và estimateOne()
const noSlipOfPerson = (month?) => error('PAYSLIP_NOT_FOUND', 'Không có phiếu của người này trong kỳ', 404, { month });
// Một phiếu. viewerIsSelf: nhân sự xem của chính mình, chỉ khi kỳ đã chi trả và không thấy số Admin sửa.
async function payslip(month, username, { self }: any) {
  needMonth(month);
  const period = await store.periods.get(month);
  const run = await store.payroll.currentRun(month, { params: true });
  if (self && period.status !== 'paid')
    throw error('PAYSLIP_NOT_VISIBLE', 'Phiếu chính thức chỉ xem được sau khi kỳ lương đã chi trả', 403, { month });
  if (!run) throw error('PAYSLIP_NOT_FOUND', 'Kỳ này chưa có phiếu', 404, { month });
  const slip = await store.payroll.getPayslip(run.id, username, { snapshot: true });
  if (!slip) throw noSlipOfPerson(month);
  const std = workdaysStdOf(slip.snapshot, slip.staffTerms && slip.staffTerms.type, run.params, month);
  const paid = (await paidRows(run, [slip]))[0]; // số chi trả: số Admin đã sửa áp lên số tự tính (nhân sự cũng thấy số này)
  // Nhân sự xem phiếu có số Admin sửa: bản chụp và các dòng chi tiết cũng theo số chi trả, không còn số tự tính (staffPaidSnapshot)
  const shown = paid.pinnedSnapshot || slip.snapshot; // phiếu có ô số lượng ghim: bản chụp đã tính lại
  const snapshot = self && paid.overridden ? staffPaidSnapshot(shown, await overrideValuesOf(run, slip), paid) : shown;
  const lines = self ? staffLinesOf(snapshot, std) : linesOf(snapshot, std);
  const cells = self ? null : cellsOf(shown, slip.snapshot); // ô sửa được theo số tự tính: tiền theo bản đã tính lại theo ghim, số lượng theo bản gốc
  return {
    month,
    period: brief(period),
    run: {
      id: run.id,
      runNo: run.runNo,
      status: run.status,
      engineVersion: run.engineVersion,
      paramsHash: run.paramsHash,
      paramsRev: run.paramsRev
    },
    payslip: {
      ...(self ? selfView(slimSlip(paid, lines)) : slimSlip(paid, lines)),
      staffTerms: slip.staffTerms,
      // Admin: dòng ngày kèm bốn cột tiền (cot: luongNgay, phuCapCa, lamThem, truGio) cho trang 1 bản in; nhân sự nhận đúng bản chụp đã lưu
      snapshot: self ? snapshot : await withDayFigures(snapshot, { username, month }),
      ...(self
        ? {}
        : {
            override: slip.override,
            cells,
            // công thức của số tự tính từng dòng, dựng từ bản chụp và bộ tham số CỦA LẦN TÍNH này (không phải tham số hiện hành)
            formulas: formulasOf({
              snapshot: shown,
              original: slip.snapshot,
              staffTerms: slip.staffTerms,
              params: run.params,
              month,
              cells
            }),
            kpiSlip: await service.kpiSlipCells(username, month, run.params)
          })
    },
    source: 'snapshot'
  };
}

/* ========================= kiểm lại bản chụp ========================= */
// Tính lại từng phiếu từ đầu vào HIỆN CÓ trong DB, nhưng bằng điều khoản đã chụp (staff_terms_json), tham số, công tắc, ngày lễ và
// thời điểm tính của lần chạy: kỳ đã khoá nên đầu vào không đổi; lệch nghĩa là có người sửa dữ liệu ngoài đường API hoặc bộ máy đổi
// mà ENGINE_VERSION không tăng.
async function verify(month?) {
  needMonth(month);
  const run = await store.payroll.currentRun(month, { params: true });
  if (!run) return { month, run: null, checked: 0, mismatched: [] };
  const slips = await store.payroll.listPayslips(run.id, { pageSize: 200 });
  const all: any[] = [];
  for (let page = 1; (page - 1) * slips.pageSize < slips.total; page++)
    all.push(...(await store.payroll.listPayslips(run.id, { page, pageSize: slips.pageSize })).rows);
  const usernames = all.map(r => r.username);
  const inputs = await service.loadInputs(month, { usernames, asOf: run.switches.asOf, params: run.params });
  // ngày lễ của lần chạy, không phải của hôm nay
  inputs.holidays = run.switches.holidays || [];
  const frozen = run.params; // bộ tham số đã chụp của lần chạy (payroll_runs.params_json)
  const mismatched: any[] = [];
  for (const row of all) {
    const stored = await store.payroll.getPayslip(run.id, row.username, { snapshot: true });
    const fresh = inputs.people.has(row.username) ? slipOf(month, stored.staffTerms, inputs, frozen) : null;
    const sameData =
      !!fresh &&
      (fresh.status === 'error'
        ? stored.status === 'error' && stored.errorCode === fresh.errorCode
        : stored.status !== 'error' &&
          Params.canonical(withoutPunchTimes(JSON.parse(JSON.stringify(fresh.snapshot)))) ===
            Params.canonical(withoutPunchTimes(stored.snapshot)) &&
          ['gross', 'insurance', 'tax', 'advance', 'net'].every(k => fresh[k] === stored[k]));
    if (!sameData) mismatched.push(row.username);
  }
  return {
    month,
    runId: run.id,
    runNo: run.runNo,
    engineVersion: run.engineVersion,
    engineChanged: run.engineVersion !== Engine.ENGINE_VERSION,
    checked: all.length,
    mismatched
  };
}

/* ========================= số ước tính của chính nhân sự ========================= */
// GET /api/me/estimate: CHỈ dữ liệu của người đang đăng nhập. Mặc định là bộ máy chạy trên đầu vào hiện tại với bộ tham số của tháng, ghi rõ
// "ước tính". Theo tham số slip.staffVisibleFrom (mặc định estimateOnly: luôn là số ước tính): afterApproval hoặc afterPaid thì từ lúc đó trả BẢN CHỤP
// của lần chạy chốt (số tự tính, không có số Admin sửa) thay cho số ước tính.
// Tình trạng phụ cấp chuyên cần để giao diện hiện "đã nghỉ X ngày, thêm Y ngày sẽ mất" mà không viết cứng số và không tự so sánh:
// mọi ngưỡng lấy từ tham số của tháng, còn "còn bao nhiêu thì mất" do máy chủ tính theo đúng phép so sánh của bộ máy (gte: chạm ngưỡng là mất,
// gt: phải vượt ngưỡng mới mất; INVERSE trong src/engine/payroll-engine.ts).
//   daysUntilLoss   số ngày nghỉ nữa (nguyên) thì mất; 0 = đã mất vì số ngày nghỉ
//   hoursUntilLoss  số giờ vượt ngưỡng nữa thì mất (khoảng cách tới ngưỡng, không âm); 0 = đã mất vì giờ
//   hoursLossStrict true khi phép so sánh của giờ là gt: tới đúng ngưỡng vẫn còn, chỉ vượt mới mất (giờ liên tục, không có "thêm 1")
const gapOf = (value?, limit?) => Math.max(0, limit - value);
function allowanceStatus(staff?, m?, params?) {
  if (!params) return { hasAttendance: false }; // lần chạy thiếu bộ tham số đã chụp (params_json hỏng): không có cơ sở để báo chuyên cần
  const type = staff.type; // chức vụ lạ không có phụ cấp chuyên cần (bộ máy báo PAYROLL_BAD_TYPE cho người đó)
  if (!params[`type.${type}.attendance`]) return { hasAttendance: false };
  const maxAbsent = params[`type.${type}.maxAbsent`];
  const absentCompare = params['attendance.absentCompare'];
  const overLimitHours = params['attendance.overLimitHours'];
  const overLimitCompare = params['attendance.overLimitCompare'];
  const strictDays = absentCompare === 'gt';
  const strictHours = overLimitCompare === 'gt';
  return {
    hasAttendance: true,
    absentDays: m.absent,
    maxAbsent,
    absentCompare,
    daysUntilLoss: gapOf(m.absent, maxAbsent + (strictDays ? 1 : 0)),
    overLimitHours: m.overHours,
    overLimitThreshold: overLimitHours,
    overLimitCompare,
    hoursUntilLoss: gapOf(m.overHours, overLimitHours),
    hoursLossStrict: strictHours,
    kept: m.attendOk
  };
}
// src/engine/payroll-engine.ts → assertStaff (hồ sơ sai) và kernelFor (công thức đã lưu hỏng, ví dụ có vòng): báo lý do, không trả 500
const BAD_PROFILE_CODES = Object.freeze(['PAYROLL_BAD_TYPE', 'PAYROLL_BAD_LEVEL', 'PAYROLL_BAD_FORMULA']);
async function estimate(me?, month?, { rows }: any = {}) {
  needMonth(month);
  const resolved = await paramsStore.resolve(month);
  const period = await store.periods.get(month);
  const base: Record<string, any> = {
    month,
    period: brief(period),
    estimate: true,
    upTo: null,
    label: 'Số ước tính, chưa phải phiếu lương chính thức'
  };
  if (!me.payrollSubject) return { ...base, estimate: null, payrollSubject: false };
  const visibleFrom = resolved.params['slip.staffVisibleFrom'];
  const official =
    visibleFrom === 'afterPaid'
      ? period.status === 'paid'
      : visibleFrom === 'afterApproval'
        ? ['approved', 'paid'].includes(period.status)
        : false;
  if (official) {
    const final = await store.payroll.finalPayslip(me.username, month, { snapshot: true });
    // Phiếu chính thức mang lỗi (status 'error', bản chụp rỗng) không được hiện như phiếu chính thức rỗng: rơi xuống số ước tính
    if (final && final.status !== 'error' && final.snapshot && final.snapshot.net) {
      const run = await store.payroll.getRun(final.runId, { params: true });
      // Nhân sự thấy số CHI TRẢ như phiếu của payslip(): với phiếu có số Admin sửa (đóng băng ở phiếu), m, net và trace là bản sao theo số chi trả
      // (staffPaidSnapshot): ô đã sửa mang giá trị sửa, tổng thu nhập, bảo hiểm, thuế, thực lĩnh theo paidFigures, dòng không ánh xạ được bị bỏ.
      // Không đưa số tự tính hay giá trị ô sửa nào khác ra ngoài; cờ overridden vẫn báo cho giao diện.
      const values = await overrideValuesOf(run, final);
      const pinned = slipPins.repinned(final.snapshot, final.staffTerms, values, run.params, month); // ô số lượng ghim
      const paid = paidFigures(slipBasisOf(pinned || final.snapshot), values, taxFromOf(run.params), !!pinned);
      const view = paid ? staffPaidSnapshot(pinned || final.snapshot, values, paid) : final.snapshot;
      const { rows: dayRows, trace, ...m } = view;
      return {
        ...base,
        estimate: false,
        paramsHash: run.paramsHash,
        engineVersion: run.engineVersion,
        allowanceStatus: allowanceStatus(final.staffTerms, final.snapshot, run.params), // ngày nghỉ, giờ vượt, còn/mất chuyên cần: không phải số tiền
        source: 'snapshot',
        official: true,
        upTo: null,
        toDate: null,
        label: 'Phiếu lương chính thức',
        ...(paid ? { overridden: true } : {}),
        m: rows && dayRows ? { ...m, rows: await dayRowsOf(dayRows, { username: me.username, month }) } : m,
        ...staffDayNotesOf(dayRows), // ngày của ca làm lễ, số ngày nghỉ hưởng lương: ghi chú dòng của thẻ Thu nhập
        net: view.net,
        allowanceTotal: allowanceTotalOf({ trace, blocks: m.blocks }),
        trace,
        pendingItems: null,
        actualReport: null
      };
    }
  }
  const inputs = await service.loadInputs(month, { usernames: [me.username] });
  if (!inputs.people.has(me.username)) return { ...base, estimate: null, reason: 'NOT_STARTED' };
  const staff = inputs.people.get(me.username).staff;
  // Thu nhập hiển thị tới hôm nay, còn BH, thuế và thực lĩnh
  // lấy trên CẢ THÁNG theo lịch đã nhập (BH và thuế là khoản của tháng, không chia theo ngày; tính trên nửa tháng cho thực lĩnh âm).
  // Vì vậy m, net, trace, allowanceStatus là cả tháng; riêng tháng hiện tại có thêm khối toDate = phần tới hôm nay (không kèm net).
  let whole;
  try {
    whole = service.computeFor(month, staff, inputs, resolved.params, { upTo: null });
  } catch (e) {
    // hồ sơ sai (loại hoặc bậc lương không có trong bảng): báo lý do thay vì trả 0 ₫; lỗi khác là lỗi thật, để route trả 500
    if (e && BAD_PROFILE_CODES.includes(e.code))
      return { ...base, estimate: null, reason: e.code, message: errorMessageOf(e) };
    throw e;
  }
  const current = today().slice(0, month.length) === month;
  let toDate: any = null;
  if (current) {
    const cut = today();
    const part = service.computeFor(month, staff, inputs, resolved.params, { upTo: cut });
    const { rows: partRows, net: partNet, ...partM } = part.m;
    toDate = { upTo: cut, gross: partNet.gross, ...partM, ...(rows ? { rows: partRows } : {}) };
  }
  const { rows: dayRows, ...m } = whole.m;
  return {
    ...base,
    source: 'estimate',
    official: false,
    upTo: null, // m, net, trace, allowanceStatus tính cả tháng; ngày cắt của phần "tới hôm nay" nằm ở toDate.upTo
    m: rows ? { ...m, rows: await dayRowsOf(dayRows, { username: me.username, month }) } : m,
    ...staffDayNotesOf(dayRows),
    net: whole.m.net,
    allowanceTotal: allowanceTotalOf(whole.m),
    toDate,
    pendingItems: whole.pendingItems,
    actualReport: whole.actualReport,
    allowanceStatus: allowanceStatus(staff, whole.m, resolved.params),
    trace: whole.m.trace,
    paramsHash: resolved.hash,
    engineVersion: Engine.ENGINE_VERSION
  };
}

export = {
  payslipUsers,
  checklist,
  view,
  list,
  lockAttendance,
  calculate,
  decidePayslips,
  approve,
  markPaid,
  reopen,
  payslips,
  payslip,
  estimates,
  estimateOne,
  verify,
  estimate,
  REOPEN_INPUTS_CAP
};
