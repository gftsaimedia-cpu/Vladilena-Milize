// Dựng dữ liệu màn Hôm nay từ GET /me, GET /punch, GET /sheet và GET /me/estimate của chính người đăng nhập.
import { hoursText, initialsOf, minutesBetween, shiftName, vnDate, vnTime } from './common';

const GPS_NOTE = {
  icon: 'pin',
  lead: 'Bật vị trí khi Check-in.',
  text: 'Bạn phải ở trong vùng chấm công. Vị trí chỉ dùng để kiểm tra lúc bấm, không được lưu.'
};

function greeting(hour?) {
  if (hour < 11) return 'Chào buổi sáng';
  if (hour < 14) return 'Chào buổi trưa';
  if (hour < 18) return 'Chào buổi chiều';
  return 'Chào buổi tối';
}

/** Ca hôm nay: tên ca, trạng thái (working | done | not-started), giờ vào/ra, ghi chú. */
function buildShift({ me, punch }: any) {
  const open = punch.open;
  const last = punch.lastSession;
  const planned = (open && open.plannedShift) || (last && last.entry && last.entry.plannedShift);
  const code = (planned && planned.code) || me.user.shiftCode;
  const shift: Record<string, any> = {
    name: shiftName(punch.shiftConfig && punch.shiftConfig.shifts, code),
    state: 'not-started',
    now: vnTime(punch.serverNow),
    notes: []
  };
  if (open) {
    shift.state = 'working';
    shift.checkIn = open.since;
    shift.worked = hoursText(minutesBetween(open.at, punch.serverNow));
    if (planned && planned.startIso) {
      const diff = minutesBetween(planned.startIso, open.at);
      if (diff < 0) shift.checkInNote = `sớm ${-diff} phút`;
      else if (diff > 0) shift.checkInNote = `trễ ${diff} phút`;
    }
  } else if (punch.done && last && vnDate(punch.serverNow) === last.date) {
    shift.state = 'done';
    shift.checkIn = punch.done.in;
    shift.checkOut = punch.done.out;
    shift.worked = hoursText(minutesBetween(last.entry.presIn, last.entry.presOut));
  } else if (!punch.canCheckIn) {
    shift.locked = true;
    shift.lockedAt = '';
  }
  if (me.geofenceRequired) shift.notes.push(GPS_NOTE);
  if (punch.checkInBlock) shift.notes.push({ icon: 'info', lead: '', text: punch.checkInBlock });
  return shift;
}

const dmText = (d?) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

export function buildHome({ me, punch, sheet, estimate }: any) {
  const user = me.user;
  const today = vnDate(me.serverNow);
  const month = today.slice(0, 7);
  const actual = sheet.actualReport || {};
  const missing = actual.missing || [];
  const reports = Object.values<any>(actual.report || {});
  const toDate = estimate.toDate || {};
  const facts = [{ label: 'Ngày đủ công', hint: '', value: String(toDate.count ?? 0), tone: '' }];
  if (reports.some(r => r && (r.late != null || r.lateMin != null))) {
    const late = reports.reduce((s, r) => s + (Number(r && (r.late ?? r.lateMin)) || 0), 0);
    facts.push({ label: 'Đi trễ', hint: '', value: `${late} phút`, tone: '' });
  }
  facts.push({
    label: 'Thiếu Check-in/out',
    hint: '',
    value: `${missing.length} ngày`,
    tone: missing.length ? 'bad' : 'z'
  });
  if (me.benefits && me.benefits.paidLeave && sheet.leaveBalance)
    facts.push({ label: 'Phép năm còn', hint: '', value: `${sheet.leaveBalance.balance} ngày`, tone: '' });
  return {
    today,
    month,
    requestDeadline: null,
    payslipDate: null,
    greeting: greeting(Number(vnTime(me.serverNow).slice(0, 2))),
    user: {
      name: user.givenName || user.name,
      initials: initialsOf(user.name),
      roleLine: [user.levelName || me.positionLabel, user.jobTitle].filter(Boolean).join(' · ')
    },
    shift: buildShift({ me, punch }),
    alert: missing.length
      ? {
          title: `Ngày ${dmText(missing[0])} quên Check-out${missing.length > 1 ? `, và ${missing.length - 1} ngày khác` : ''}`,
          text: 'Ngày công đó đang chờ Admin xử lý.'
        }
      : null,
    pay: { amount: (estimate.net && estimate.net.net) ?? 0, days: toDate.count ?? 0, asOf: toDate.upTo || today },
    facts,
    todo: missing.length
      ? [
          {
            tone: 'pend',
            icon: 'clock',
            title: `${missing.length} ngày thiếu Check-in/out chờ Admin xử lý`,
            hint: missing.map(dmText).join(', ')
          }
        ]
      : [
          {
            tone: 'ok',
            icon: 'check',
            title: `Chấm công tháng ${Number(month.slice(5, 7))} đã đủ`,
            hint: 'Không ngày nào thiếu Check-in hay Check-out'
          }
        ]
  };
}
