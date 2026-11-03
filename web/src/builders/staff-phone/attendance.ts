// Dựng dữ liệu màn Chấm công (tháng và chi tiết một ngày) từ GET /sheet?month= và GET /me/estimate?month=.
import { daysInMonth, dowOf, hoursText, minutesBetween, statusOf, vnTime } from './common';

const pad = (n?) => String(n).padStart(2, '0');
const sessionsOn = (sheet?, date?) => (sheet.attendanceSessions || []).filter(s => s.date === date);

/** Một dòng lượt: "Lượt n · HH:mm → HH:mm" kèm số giờ có mặt; lượt OT hoặc giờ bù vẫn hiện như lượt thường. */
function punchRow(s?, index?, nowIso?) {
  const e = s.entry || {};
  const start = e.presIn ? vnTime(e.presIn) : '';
  const end = e.presOut ? vnTime(e.presOut) : null;
  const present = e.presIn ? hoursText(minutesBetween(e.presIn, e.presOut || nowIso)) : '';
  const missingKind = e.presIn && !e.presOut && e.reason === 'forgot-out' && !e.requestedOut
    ? 'punch-out'
    : (e.forgotIn || (!e.presIn && e.presOut)) ? 'punch-in' : null;
  return {
    title: `Lượt ${index + 1} · ${start} → ${end || 'đang làm'}`,
    note: `${present} có mặt · giờ bấm gốc, luôn được giữ nguyên`,
    sessionId: s.id,
    explainMissing: s.state === 'closed' && missingKind && !(s.explanations || []).some(x => x.kind === missingKind),
    explainKind: missingKind
  };
}

/** Chi tiết một ngày: nhãn, các lượt vào/ra gốc (kể cả OT, giờ bù) và ghi nhận công của máy chủ. */
export function buildDayDetail({ date, sheet, me, shiftLine, nowIso }: any) {
  const list = sessionsOn(sheet, date);
  const holiday = (me.holidays || []).includes(date);
  const report = (sheet.actualReport && sheet.actualReport.report && sheet.actualReport.report[date]) || null;
  const rows: any[] = [];
  if (report && report.note) rows.push({ label: 'Công ngày này', value: report.note });
  if (holiday && !list.length) rows.push({ label: 'Công ngày này', value: 'Ngày lễ, nghỉ' });
  return {
    date,
    shift: shiftLine,
    status:
      holiday && !list.length
        ? { label: 'Ngày lễ', cls: 'p-draft' }
        : list.length
          ? statusOf(list[list.length - 1])
          : { label: 'Không có công', cls: 'p-draft' },
    punches: list.map((s, i) => punchRow(s, i, nowIso)),
    rows
  };
}

/** Thẻ tháng: ba số, lịch ngày, hôm nay, gần đây. Trả null khi tháng không có dữ liệu. */
export function buildAttendance({ month, sheet, estimate, me, today, nav, shiftLine, nowIso }: any) {
  const sessions = sheet.attendanceSessions || [];
  if (!sessions.length && !Object.keys(sheet.days || {}).length && !(sheet.corrections || []).length) return null;
  const scheduled = new Set<any>(sheet.scheduledDates || []);
  const holidays = new Set<any>(me.holidays || []);
  const withSession = new Set<any>(sessions.map(s => s.date));
  const days = Array.from({ length: daysInMonth(month) }, (_, i) => {
    const date = `${month}-${pad(i + 1)}`;
    let kind = 'ok';
    if (date === today) kind = 'today';
    else if (date > today) kind = 'fut';
    else if (holidays.has(date)) kind = 'hol';
    else if (!scheduled.has(date) && !withSession.has(date)) kind = dowOf(date) === 0 ? 'sun' : 'fut';
    return { date, kind };
  });
  const actual = sheet.actualReport || {};
  const missing = actual.missing || [];
  const m = (estimate && estimate.m) || {};
  const stats = [{ value: String(m.count ?? 0), label: 'Ngày đủ công' }];
  const reports = Object.values<any>(actual.report || {});
  stats.push({
    value: String(reports.reduce((s, r) => s + (Number(r && (r.late ?? r.lateMin)) || 0), 0)),
    label: 'Phút đi trễ'
  });
  const cutMinutes =
    m.short != null
      ? Math.round((Number(m.short) || 0) * 60)
      : reports.reduce(
          (s, r) =>
            s + (Number(r?.cutStartMin) || 0) + (Number(r?.cutEndMin) || 0) + (Number(r?.gapCutMin) || 0),
          0
        );
  stats.push({ value: String(cutMinutes), label: 'Phút bị trừ' });
  const byDate = new Map<any, any>();
  for (const s of sessions) byDate.set(s.date, [...(byDate.get(s.date) || []), s]);
  const dates = [...byDate.keys()].sort();
  const lastDate = byDate.has(today) ? today : dates[dates.length - 1];
  const lastList = byDate.get(lastDate) || [];
  const lastSession = lastList[lastList.length - 1];
  const le = (lastSession && lastSession.entry) || {};
  return {
    month,
    stateLabel: '',
    ...nav,
    shiftLine,
    stats,
    zeroNote: missing.length ? `${missing.length} ngày thiếu Check-in/out` : 'Không ngày nào thiếu chấm',
    days,
    sheetDate: missing[0] || null,
    today: {
      date: lastDate || today,
      time: le.presIn ? `${vnTime(le.presIn)} → ${le.presOut ? vnTime(le.presOut) : 'đang làm'}` : '—',
      note: le.presIn ? `Đã làm ${hoursText(minutesBetween(le.presIn, le.presOut || nowIso))}` : '',
      statusLabel: lastSession ? statusOf(lastSession).label : ''
    },
    recent: dates
      .filter(d => d <= today && d !== lastDate)
      .slice(-4)
      .reverse()
      .map(d => {
        const list = byDate.get(d);
        const first = list[0].entry || {};
        const last = list[list.length - 1].entry || {};
        return {
          date: d,
          note: holidays.has(d) ? 'Ngày lễ' : '',
          value: `${first.presIn ? vnTime(first.presIn) : '—'} – ${last.presOut ? vnTime(last.presOut) : '—'}`,
          valueNote: statusOf(list[list.length - 1]).label,
          muted: false
        };
      })
  };
}
