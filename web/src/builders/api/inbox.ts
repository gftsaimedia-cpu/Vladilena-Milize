// Việc chờ duyệt (chuông, thẻ Việc cần duyệt) từ GET /api/v2/requests?status=PENDING. Mỗi đơn đang chờ là một việc
// "decide"; duyệt / từ chối qua PATCH /api/v2/requests/:id/review. BE chưa có việc "nhắc giải trình" (quên chấm công
// mà chưa gửi đơn) nên nhóm Chấm công trống.
import type { InboxGroup, InboxItem } from '../../mock/inbox';
import { INBOX_GROUPS } from '../../constants/labels';
import { dm, initials, vndc, weekdayName } from '../../utils/format';

export type RequestDTO = {
  id: string;
  employeeId: string;
  type: 'LEAVE' | 'OVERTIME' | 'ADVANCE' | 'SHIFT_CHANGE' | 'LEAVE_WITH_MAKEUP' | 'EXPLANATION' | 'ISAT';
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  reason: string | null;
  createdAt: string;
  leaveType?: string | null;
  leaveStartDate?: string | null;
  leaveEndDate?: string | null;
  leaveDaysCount?: number | null;
  explanationDate?: string | null;
  actualCheckIn?: string | null;
  actualCheckOut?: string | null;
  otDate?: string | null;
  otStartTime?: string | null;
  otEndTime?: string | null;
  otHours?: number | null;
  advanceAmount?: number | null;
  advancePeriod?: string | null;
  changeStartDate?: string | null;
  changeEndDate?: string | null;
  isat?: { saturday?: string } | null;
};

export type PersonInfo = { name: string; title: string };

const GROUP_OF: Record<RequestDTO['type'], InboxGroup> = {
  LEAVE: 'leave',
  LEAVE_WITH_MAKEUP: 'leave',
  ISAT: 'leave',
  OVERTIME: 'ot',
  SHIFT_CHANGE: 'ot',
  EXPLANATION: 'exp',
  ADVANCE: 'adv'
};
const LABELS = Object.fromEntries(INBOX_GROUPS.map(g => [g.key, g.label])) as Record<InboxGroup, string>;
const LEAVE_LABEL: Record<string, string> = {
  ANNUAL: 'Phép năm',
  PERSONAL_PAID: 'Việc riêng có lương',
  PERSONAL_UNPAID: 'Việc riêng không lương',
  SOCIAL_INSURANCE: 'Chế độ BHXH',
  WELFARE: 'Phúc lợi nội bộ',
  UNPAID: 'Không lương'
};

const quote = (s: string | null) => `“${String(s || '').trim()}”`;
const longDay = (iso: string) => `${weekdayName(iso)} ${dm(iso)}`;
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

function daysBetween(from?: string | null, to?: string | null): string[] {
  if (!from) return [];
  const out: string[] = [];
  for (let d = from; d <= (to || from) && out.length < 62; d = addDays(d, 1)) out.push(d);
  return out;
}

// "09–10/11" khi cùng tháng, "30/10–02/11" khi khác tháng, "09/11" khi một ngày.
function spanText(from: string, to?: string | null): string {
  if (!to || to === from) return dm(from);
  return from.slice(0, 7) === to.slice(0, 7) ? `${from.slice(8, 10)}–${dm(to)}` : `${dm(from)}–${dm(to)}`;
}

// Tuổi của việc: "35 phút", "3 giờ", "2 ngày".
export function ageText(createdAt: string, now: number): string {
  const min = Math.max(0, Math.floor((now - Date.parse(createdAt)) / 60000));
  if (min < 60) return `${min} phút`;
  if (min < 24 * 60) return `${Math.floor(min / 60)} giờ`;
  return `${Math.floor(min / (24 * 60))} ngày`;
}

type Body = Pick<InboxItem, 'what' | 'when' | 'head' | 'sub' | 'facts' | 'days'>;

function bodyOf(r: RequestDTO): Body {
  switch (r.type) {
    case 'LEAVE':
    case 'LEAVE_WITH_MAKEUP': {
      const kind = LEAVE_LABEL[r.leaveType || ''] || 'Nghỉ';
      const days = daysBetween(r.leaveStartDate, r.leaveEndDate);
      const count = r.leaveDaysCount ?? days.length;
      const span = r.leaveStartDate ? spanText(r.leaveStartDate, r.leaveEndDate) : '';
      return {
        what: kind,
        when: span,
        head: `${kind} · ${count} ngày${r.type === 'LEAVE_WITH_MAKEUP' ? ' (có làm bù)' : ''}`,
        sub: days.length > 1 ? `${longDay(days[0])} – ${longDay(days[days.length - 1])}` : days[0] ? longDay(days[0]) : '',
        facts: [['Hình thức', kind], ['Lý do', quote(r.reason)]],
        days
      };
    }
    case 'ISAT': {
      const day = r.isat?.saturday || '';
      return { what: 'iSAT', when: day ? dm(day) : '', head: 'Nghỉ Thứ Bảy (iSAT)', sub: day ? longDay(day) : '', facts: [['Lý do', quote(r.reason)]], days: day ? [day] : [] };
    }
    case 'OVERTIME': {
      const day = r.otDate || '';
      return {
        what: 'Làm thêm',
        when: day ? dm(day) : '',
        head: `Làm thêm · ${r.otHours ?? 0} giờ`,
        sub: day ? longDay(day) : '',
        facts: [['Khung giờ', `${r.otStartTime || '?'}–${r.otEndTime || '?'}`], ['Lý do', quote(r.reason)]],
        days: day ? [day] : []
      };
    }
    case 'SHIFT_CHANGE': {
      const days = daysBetween(r.changeStartDate, r.changeEndDate);
      return {
        what: 'Đổi ca',
        when: r.changeStartDate ? spanText(r.changeStartDate, r.changeEndDate) : '',
        head: 'Đổi ca',
        sub: days[0] ? longDay(days[0]) : '',
        facts: [['Lý do', quote(r.reason)]],
        days
      };
    }
    case 'EXPLANATION': {
      const day = r.explanationDate || '';
      return {
        what: 'Giải trình',
        when: day ? dm(day) : '',
        head: 'Giải trình chấm công',
        sub: day ? longDay(day) : '',
        facts: [['Giờ vào khai', r.actualCheckIn || 'Không khai'], ['Giờ ra khai', r.actualCheckOut || 'Không khai'], ['Lý do', quote(r.reason)]],
        days: day ? [day] : []
      };
    }
    case 'ADVANCE':
    default: {
      const amount = vndc(r.advanceAmount ?? 0);
      return {
        what: 'Tạm ứng',
        when: r.advancePeriod ? `${r.advancePeriod.slice(5, 7)}/${r.advancePeriod.slice(0, 4)}` : '',
        head: `Tạm ứng · ${amount}`,
        sub: r.advancePeriod ? `Trừ vào lương tháng ${Number(r.advancePeriod.slice(5, 7))}/${r.advancePeriod.slice(0, 4)}` : '',
        facts: [['Số tiền', amount], ['Lý do', quote(r.reason)]],
        days: []
      };
    }
  }
}

/** Các đơn đang chờ thành việc chờ duyệt, mới nhất trước. `people` tra họ tên, chức danh theo tên đăng nhập. */
export function inboxFromRequests(requests: RequestDTO[], people: Map<string, PersonInfo>, now: number): InboxItem[] {
  return requests
    .filter(r => r.status === 'PENDING')
    .map(r => {
      const group = GROUP_OF[r.type] ?? 'leave';
      const person = people.get(r.employeeId);
      const name = person?.name || r.employeeId;
      return {
        id: r.id,
        group,
        groupLabel: LABELS[group],
        action: 'decide' as const,
        personId: r.employeeId,
        name,
        initials: initials(name),
        role: person?.title || '—',
        age: ageText(r.createdAt, now),
        ...bodyOf(r)
      };
    });
}
