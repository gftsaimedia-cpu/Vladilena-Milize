'use strict';
// OT thực tế khai ở Check-in/out: danh sách OT, kiểm khai OT.
// Các kiểm nghiệp vụ chỉ cảnh báo (warnIf); kiểm dữ liệu vẫn chặn.
const store = require('../platform/db');
const { HttpError } = require('../platform/http');
const { rulesFor, benefitOf } = require('../platform/request-rules');
const { TIME_RE } = require('./input');
const { toMin, overlapsNight, actualOtHours } = require('./overtime/worked-hours').WorkedHours;
const { warnIf } = require('../platform/warnings');
const { estimateSheet } = require('./sheet');
const { dayNetHours, breakOf, monthOtHours, assertDayHours, assertMonthOt } =
  require('./overtime/hour-limits').HourLimits;

async function listOt(status?) {
  const names = Object.fromEntries((await store.listStaff()).map(s => [s.username, s.name]));
  return (await store.listSessions())
    .filter(
      s =>
        s.entry.extraKind === 'ot' &&
        (!s.entry.otReview ? 'pending' : s.entry.otReview.ok ? 'approved' : 'rejected') === status
    )
    .map(s => ({ ...s.entry, ...s, sessionId: s.id, name: names[s.username] || s.username }))
    .sort((a: any, b: any) => b.date.localeCompare(a.date) || a.id - b.id);
}
// OT khai ở Check-in/out (POST /ot) chỉ ra tiền khi được duyệt (PUT /ot): lúc đó khung OT được ghi vào ngày trên Lịch ước tính và duyệt cùng dòng duyệt của ngày
// (src/domain/ot-sheet.ts), nguồn extra duy nhất của giờ thực tế ('attendance.extraSourceRule' = calendar, src/engine/actual-hours.ts → POLICY.extraSource).
// otReview của lượt bị bỏ khi dựng ngày tính tiền (LOCKED_FIELDS).
const OT_NOTE =
  'OT ghi ở Check-in/out khi được duyệt thành OT đã duyệt của ngày trên Lịch ước tính, và chỉ phần có mặt liền ca được trả.';
async function validateOtDeclaration(staff?, session?, body?) {
  if (session.state !== 'closed') throw new HttpError(409, 'Lượt này đang mở — Check-out trước khi khai OT');
  const e = session.entry,
    plan = e.plannedShift;
  // Các kiểm dưới đây là cảnh báo; OT vẫn lưu ở trạng thái chờ duyệt.
  warnIf(
    'BENEFIT_NOT_ALLOWED',
    !benefitOf((await rulesFor(session.date.slice(0, 7))).params, staff.type, 'ot', staff.level),
    {
      message: `Chức vụ của nhân sự này không có quyền lợi OT: OT vẫn lưu chờ duyệt. ${OT_NOTE} Chức vụ không có quyền lợi OT thì OT trên lịch cũng không được trả (0 ₫).`,
      details: { date: session.date, username: staff.username }
    }
  );
  // Lượt không có ca đối chiếu thì không có giờ vào – ra của ca để khai OT: lỗi dữ liệu, luôn chặn
  if (!plan) throw new HttpError(400, 'Cần xác nhận lượt chấm công và ca làm việc trước khi khai OT');
  warnIf('OT_NEEDS_CONFIRMED_SHIFT', !e.attendanceConfirmed || e.kind !== 'work' || plan.kind !== 'work', {
    message: `Lượt ngày ${session.date} chưa được xác nhận chấm công hoặc chưa có ca làm việc: OT vẫn lưu chờ duyệt. ${OT_NOTE}`,
    details: { date: session.date, username: staff.username }
  });
  const holidays = new Set<any>(await store.getSetting('holidays', []));
  if (e.extraKind && e.extraKind !== 'ot') throw new HttpError(409, 'Lượt này đang khai làm bù — không ghi đè bằng OT');
  const extra: Record<string, any> = {};
  for (const key of ['extraIn', 'extraOut']) {
    const value = body[key] ?? '';
    if (typeof value !== 'string' || (value && !TIME_RE.test(value)))
      throw new HttpError(400, 'Giờ OT phải có dạng HH:MM');
    extra[key] = value === (key === 'extraIn' ? plan.in : plan.out) ? '' : value;
  }
  if (!extra.extraIn && !extra.extraOut) throw new HttpError(400, 'Cần khai ít nhất một khoảng OT trước hoặc sau ca');
  const candidate = { ...e, in: plan.in, out: plan.out, extraKind: 'ot', ...extra };
  const a = Date.parse(e.presIn),
    b = Date.parse(e.presOut);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a)
    throw new HttpError(400, 'Cần đủ giờ có mặt hợp lệ trước khi khai OT');
  const dateRules = await rulesFor(session.date.slice(0, 7));
  const boundsError = dateRules.punch.extraFits({ ...candidate, src: 'admin' });
  warnIf('OT_OUTSIDE_PRESENCE', !!boundsError, {
    message: () =>
      `${boundsError}: bộ máy chỉ trả phần giờ có mặt liền với ca (không trả quá giờ đã chấm công). ${OT_NOTE}`,
    details: { date: session.date, username: staff.username }
  });
  for (const [start, end] of [
    [extra.extraIn, plan.in],
    [plan.out, extra.extraOut]
  ])
    if (start && end) {
      warnIf('OT_NIGHT', overlapsNight(toMin(start), toMin(end)), {
        message: `OT ngày ${session.date} rơi vào khung 22h–6h. ${OT_NOTE}`,
        details: { date: session.date, username: staff.username }
      });
    }
  // Khai OT chỉ đối chiếu lượt chấm công thực tế; lịch ước tính tính riêng.
  const rows = (await store.listSessions({ username: staff.username, month: session.date.slice(0, 7) })).filter(
    s => s.id !== session.id
  );
  // Hai trần cứng: giờ ròng của ngày (khung ca + đoạn OT, cộng OT của các lượt khác cùng ngày) và OT cả tháng so với Lịch ước tính
  const otherOtHours = rows.filter(s => s.date === session.date).reduce((sum, s) => sum + actualOtHours(s.entry), 0);
  const month = session.date.slice(0, 7);
  assertDayHours(
    session.date,
    dayNetHours(candidate, { holiday: holidays.has(session.date), ...breakOf(dateRules.params) }) + otherOtHours
  );
  const sheetDays = (await estimateSheet(staff.username, month)).days;
  const withCandidate = {
    ...sheetDays,
    [session.date]: { kind: 'work', in: plan.in, out: plan.out, ...extra, extraKind: 'ot' }
  };
  assertMonthOt(
    month,
    await monthOtHours(withCandidate, holidays, month),
    await monthOtHours(sheetDays, holidays, month)
  );
  return candidate;
}

export = { OT_NOTE, listOt, validateOtDeclaration };
