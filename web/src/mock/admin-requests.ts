// Đơn của tab Yêu cầu trên dữ liệu giả (board Q1–Q4, 06/11).
// Đơn chờ: các việc "duyệt" của mock/inbox (cùng nguồn với chuông). Đơn Admin vừa duyệt / từ chối trong phiên: decidedInbox().
// Đơn đã xử lý từ trước (d1–d7): bảng HISTORY dưới đây, theo dữ liệu của bảng thiết kế Requests.
import {
  kindOfInbox,
  rowFromInbox,
  sortRequests,
  splitRole,
  type ReqKind,
  type ReqRow,
  type ReqStatus
} from '@/builders/api/admin-requests';
import { decidedInbox, pendingInbox } from './inbox';
import { personStatusOf } from './people-status';
import type { Fact } from './inbox';

/** "20/10 09:30" (giờ Việt Nam, năm 2026) → ISO UTC. */
const vn = (stamp: string) => {
  const [d, t] = stamp.split(' ');
  const [dd, mm] = d.split('/');
  return new Date(`2026-${mm}-${dd}T${t}:00+07:00`).toISOString();
};
const quote = (text: string) => `“${text}”`;

// Lúc gửi của các đơn đang chờ (chuông chỉ ghi tuổi; vài đơn có dòng "Gửi lúc").
const SENT: Record<string, string> = {
  'ib-l1': '27/10 16:20',
  'ib-l2': '28/10 07:10',
  'ib-l3': '27/10 11:05',
  'ib-o1': '23/10 09:15',
  'ib-o2': '27/10 08:30',
  'ib-e1': '27/10 20:14',
  'ib-e2': '26/10 09:02',
  'ib-e3': '15/10 08:40',
  'ib-e4': '22/10 16:25',
  'ib-a1': '27/10 09:30',
  'ib-a2': '25/10 18:12'
};

type History = {
  id: string;
  name: string;
  role: string;
  kind: ReqKind;
  status: Exclude<ReqStatus, 'pend'>;
  date: string;
  what: string;
  sent: string;
  decided: string;
  note?: string;
  head: string;
  sub: string;
  facts: Fact[];
};

const HISTORY: History[] = [
  {
    id: 'd6',
    name: 'Hoàng Thị Mai',
    role: 'Tài chính · Kế toán viên',
    kind: 'leave',
    status: 'ok',
    date: '02–28/11',
    what: 'Không lương 23 ngày',
    sent: '20/10 09:30',
    decided: '21/10 10:05',
    note: 'Đã báo phòng Tài chính chia việc.',
    head: 'Không lương · 23 ngày',
    sub: 'Thứ Hai 02/11 – Thứ Bảy 28/11',
    facts: [
      ['Hình thức', 'Không lương'],
      ['Lý do', quote('Chăm người nhà nằm viện.')]
    ]
  },
  {
    id: 'd5',
    name: 'Phan Minh Khoa',
    role: 'Sản xuất · Công nhân vận hành',
    kind: 'leave',
    status: 'cancel',
    date: '21/10',
    what: 'Phép năm 1 ngày',
    sent: '19/10 17:30',
    decided: '20/10 08:15',
    head: 'Phép năm · 1 ngày',
    sub: 'Thứ Tư 21/10',
    facts: [
      ['Hình thức', 'Phép năm'],
      ['Lý do', quote('Đi làm giấy tờ.')]
    ]
  },
  {
    id: 'd1',
    name: 'Hoàng Minh Đức',
    role: 'Kinh doanh · Trưởng nhóm',
    kind: 'ot',
    status: 'ok',
    date: '20/10',
    what: 'Làm thêm 2 giờ',
    sent: '19/10 11:20',
    decided: '19/10 14:02',
    head: 'Làm thêm 2 giờ',
    sub: 'Thứ Ba 20/10 · 18:00–20:00',
    facts: [
      ['Ca hôm đó', 'HC 08:00–17:00'],
      ['Giờ làm thêm', '18:00–20:00'],
      ['Lý do', quote('Chốt báo giá cho khách.')]
    ]
  },
  {
    id: 'd2',
    name: 'Lý Thanh Tâm',
    role: 'Sản xuất · Công nhân vận hành',
    kind: 'adv',
    status: 'ok',
    date: '16/10',
    what: 'Tạm ứng 4.615.000 ₫',
    sent: '16/10 08:05',
    decided: '17/10 09:12',
    head: 'Tạm ứng 4.615.000 ₫',
    sub: 'Kỳ 01–15/10/2026',
    facts: [
      ['Số tiền được ứng', '4.615.000 ₫'],
      ['Cách tính', '80% lương các ngày công 01–15/10, cố định'],
      ['Trừ vào', 'Phiếu lương tháng 10']
    ]
  },
  {
    id: 'd3',
    name: 'Nguyễn Thu Hà',
    role: 'Tài chính · Kế toán tổng hợp',
    kind: 'shift',
    status: 'ok',
    date: '14/10',
    what: 'Sang Ca 2',
    sent: '12/10 10:00',
    decided: '12/10 15:40',
    head: 'Đổi sang Ca 2 · 1 ngày',
    sub: 'Thứ Tư 14/10',
    facts: [
      ['Ca đang làm', 'HC 08:00–17:00'],
      ['Ca mới', 'Ca 2 · 14:00–22:00'],
      ['Lý do', quote('Đổi ca với đồng nghiệp.')]
    ]
  },
  {
    id: 'd4',
    name: 'Trần Minh Quân',
    role: 'Kỹ thuật · Kỹ sư phần mềm',
    kind: 'exp',
    status: 'rej',
    date: '09/10',
    what: 'Đi muộn 47 phút',
    sent: '09/10 18:40',
    decided: '10/10 08:30',
    note: 'Camera cổng ghi bạn vào lúc 08:45, không phải 08:00.',
    head: 'Đi muộn 47 phút',
    sub: 'Thứ Sáu 09/10',
    facts: [
      ['Trường hợp', 'Vào muộn'],
      ['Giờ vào', '08:47'],
      ['Lý do', quote('Máy chấm công lỗi, tôi đến lúc 08:00.')]
    ]
  },
  {
    id: 'd7',
    name: 'Đặng Văn Phúc',
    role: 'Sản xuất · Công nhân vận hành',
    kind: 'exp',
    status: 'ok',
    date: '02/10',
    what: 'Quên Check-out',
    sent: '02/10 21:10',
    decided: '03/10 08:05',
    head: 'Quên Check-out',
    sub: 'Thứ Sáu 02/10',
    facts: [
      ['Trường hợp', 'Thiếu giờ ra'],
      ['Giờ vào', '07:55'],
      ['Giờ ra khai', '17:05'],
      ['Lý do', quote('Điện thoại hết pin lúc về.')]
    ]
  }
];

const personId = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/\s+/g, '-');

function historyRow(h: History): ReqRow {
  const [dept, title] = splitRole(h.role);
  const words = h.name.split(' ');
  return {
    id: h.id,
    kind: h.kind,
    status: h.status,
    personId: personId(h.name),
    name: h.name,
    initials: (words[words.length - 2][0] + words[words.length - 1][0]).toUpperCase(),
    dept,
    title,
    date: h.date,
    what: h.what,
    sentAt: vn(h.sent),
    reviewedAt: vn(h.decided),
    ...(h.note ? { reviewNote: h.note } : {}),
    head: h.head,
    sub: h.sub,
    facts: h.facts
  };
}

const sentOf = (id: string) => vn(SENT[id] ?? '28/10 09:40');

/** Mọi đơn của tab Yêu cầu: chờ (cũ nhất trước), rồi đã xử lý (mới xử lý nhất trước). Gắn trạng thái nhân sự giả. */
export function mockRequests(): ReqRow[] {
  const pending = pendingInbox()
    .filter(i => i.action === 'decide')
    .map(i => rowFromInbox(i, kindOfInbox(i), sentOf(i.id)));
  const decided = decidedInbox().map(d => ({
    ...rowFromInbox(d.item, kindOfInbox(d.item), sentOf(d.item.id), d.verb === 'approve' ? 'ok' : 'rej'),
    reviewedAt: d.at,
    ...(d.note ? { reviewNote: d.note } : {})
  }));
  const rows = [...pending, ...decided, ...HISTORY.map(historyRow)];
  return sortRequests(rows.map(r => ({ ...r, ps: personStatusOf(r.name) })));
}
