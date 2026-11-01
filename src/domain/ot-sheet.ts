'use strict';
// OT khai ở Check-in/out (POST /ot) được duyệt (PUT /ot) thì thành OT của ngày đó trong Lịch ước tính: cùng chỗ lưu và cùng dòng duyệt với
// OT khai trên lịch (PUT /sheet + PUT /approvals/decide), nên bộ máy đọc đúng một nguồn và mỗi ngày chỉ có một khoản OT.
const store = require('../platform/db');
const { HttpError } = require('../platform/http');
const { rulesFor } = require('../platform/request-rules');
const payrollService = require('./payroll/payroll-service');
const { estimateSheet } = require('./sheet');
const { reconcileMonthApprovals } = require('./approvals');
const { shiftFor } = require('./overtime/worked-hours').WorkedHours;
const { checkSheetLimits, checkDayHours } = require('./overtime/hour-limits').HourLimits;

const SESSION_NOTE = 'Duyệt OT ở Check-in/out';

// Khung OT của một lượt, đã chuẩn hoá thành chuỗi rỗng khi không có
const windowOf = (x?) => ({ extraIn: x.extraIn || '', extraOut: x.extraOut || '' });
const sameWindow = (a?, b?) => a.extraIn === b.extraIn && a.extraOut === b.extraOut;

// Ngày lưu trong Lịch ước tính sau khi thêm OT của lượt: ngày đi làm đã khai giữ nguyên giờ ca, chỉ thêm khung OT;
// ngày chưa khai (hoặc chỉ có dữ liệu chờ xử lý của Check-in/out) lấy giờ ca của lượt. Trả null khi ngày đã có đúng khung OT này.
function dayWithOt(session?, stored?) {
  const plan = session.entry.plannedShift;
  const want = windowOf(session.entry);
  const own = stored && stored.kind !== 'pending' ? stored : null;
  if (own && own.kind !== 'work')
    throw new HttpError(409, `Ngày ${session.date} đã khai là ngày không đi làm trên Lịch ước tính — không thêm OT`, {
      code: 'OT_DAY_NOT_WORK'
    });
  if (own && own.extraKind === 'makeup')
    throw new HttpError(409, `Ngày ${session.date} đã có giờ làm bù trên Lịch ước tính — không thêm OT`, {
      code: 'OT_DAY_HAS_MAKEUP'
    });
  if (own && own.extraKind === 'ot' && (own.extraIn || own.extraOut)) {
    if (sameWindow(windowOf(own), want)) return null;
    if (own.otSessionId !== session.id)
      throw new HttpError(
        409,
        `Ngày ${session.date} đã có OT khác khung giờ trên Lịch ước tính — xử lý ở màn Yêu cầu`,
        {
          code: 'OT_DAY_HAS_OT'
        }
      );
  }
  const base = own || {
    kind: 'work',
    shift: shiftFor(plan.in, plan.out),
    in: plan.in,
    out: plan.out,
    preset: plan.code || '',
    breakMin: 0
  };
  return { ...base, extraKind: 'ot', ...want, otSessionId: session.id };
}

// Gọi TRONG giao dịch duyệt OT, sau khi đã kiểm khai OT. Ghi khung OT vào ngày, đồng bộ dòng duyệt của ngày rồi duyệt khoản đó
// (cùng người duyệt). Trả true khi có ghi lịch hoặc đổi dòng duyệt.
async function payOnSheet({ session, staff, by }: any) {
  const month = session.date.slice(0, 7);
  const sheet = await store.getSheet(session.username, month);
  const next = dayWithOt(session, sheet.days[session.date]);
  const holidays = await store.getSetting('holidays', []);
  let changed = false;
  if (next) {
    const prevDays = (await estimateSheet(session.username, month)).days;
    const days = { ...sheet.days, [session.date]: next };
    const params = (await rulesFor(month)).params,
      clean = payrollService.estimateDays(days);
    await checkDayHours({ params, clean, prevDays, holidays });
    await checkSheetLimits({ params, month, clean, prevDays, holidays });
    await store.setSheet(session.username, month, days, sheet.kpiPct, sheet.kpiAmt);
    changed = true;
  }
  await reconcileMonthApprovals(session.username, month, holidays, staff.type);
  const row = await store.approvals.get(session.username, session.date);
  if (!row || row.item !== 'ot') throw new HttpError(409, `Ngày ${session.date} không có khoản OT để duyệt`);
  if (row.status !== 'approved') {
    await store.approvals.decide(
      [{ username: row.username, date: row.date, rev: row.rev, fingerprint: row.fingerprint }],
      'approved',
      by,
      SESSION_NOTE
    );
    changed = true;
  }
  return changed;
}

export = { SESSION_NOTE, payOnSheet };
