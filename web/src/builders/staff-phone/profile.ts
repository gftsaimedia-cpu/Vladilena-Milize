// Dựng màn Tôi từ GET /me, GET /punch (tên ca) và GET /sheet (lịch làm việc, phép năm).
import { initialsOf, shiftName } from './common';

const dmy = (iso?) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');

export function buildProfile({ me, punch, sheet }: any) {
  const u = me.user;
  const facts = [
    { label: 'Tên đăng nhập', value: u.username },
    { label: 'Ca cố định', value: shiftName(punch && punch.shiftConfig && punch.shiftConfig.shifts, u.shiftCode) },
    {
      label: 'Lịch làm việc',
      value: (sheet && sheet.workSchedule && sheet.workSchedule.describe && sheet.workSchedule.describe.label) || ''
    },
    { label: 'Ngày bắt đầu làm', value: dmy(u.startDate) }
  ];
  if (me.benefits && me.benefits.paidLeave && sheet && sheet.leaveBalance)
    facts.push({ label: 'Phép năm còn', value: `${sheet.leaveBalance.balance} ngày` });
  return {
    name: u.name,
    initials: initialsOf(u.name),
    roleLine: [u.levelName || me.positionLabel, u.jobTitle].filter(Boolean).join(' · '),
    username: u.username,
    facts: facts.filter(f => f.value)
  };
}
