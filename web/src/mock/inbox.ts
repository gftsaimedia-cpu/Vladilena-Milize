// Việc chờ xử lý giả: nguồn chung của chuông, thẻ Việc cần duyệt ở Tổng quan và (sau này) màn Chấm công.
// Một mảng trong bộ nhớ; xử lý một việc chỉ bỏ nó khỏi mảng, không đổi công, giờ hay lương (spec mục 1).
import { initials } from '@/utils/format';

export type InboxGroup = 'att' | 'leave' | 'ot' | 'exp' | 'adv';

export type InboxItem = {
  id: string;
  group: InboxGroup;
  groupLabel: string;
  action: 'decide' | 'remind';
  personId: string;
  name: string;
  initials: string;
  role: string;
  what: string;
  when: string;
  age: string;
  head: string;
  sub: string;
  facts: [string, string][];
  days: string[];
  cellLabel?: string;
  leave?: { type: 'Phép năm' | 'Nghỉ ốm'; reason: string };
  declared?: { from: string; to: string };
  missing?: 'in' | 'out';
};

export type SystemNote = { id: string; text: string; when: string };

import { INBOX_GROUPS } from '../constants/labels';
export { INBOX_GROUPS };

export const SYSTEM_NOTES: SystemNote[] = [
  { id: 'sn-1', text: 'Đã nhận dữ liệu máy chấm công lúc 09:30.', when: 'Hôm nay 09:30' },
  { id: 'sn-2', text: 'Kỳ công tháng 10 kết thúc ngày 31/10.', when: 'Hôm qua' },
  { id: 'sn-3', text: 'Đã thêm 2 nhân viên mới vào danh sách Nhân sự.', when: '26/10' }
];

// personId → [họ tên, "Phòng ban · Chức danh"]
const PEOPLE: Record<string, [string, string]> = {
  'nguyen-thu-ha': ['Nguyễn Thu Hà', 'Tài chính · Kế toán tổng hợp'],
  'tran-minh-quan': ['Trần Minh Quân', 'Kỹ thuật · Kỹ sư phần mềm'],
  'le-hoang-nam': ['Lê Hoàng Nam', 'Kinh doanh · Nhân viên kinh doanh'],
  'pham-ngoc-anh': ['Phạm Ngọc Anh', 'Nhân sự · Chuyên viên nhân sự'],
  'vo-duc-thinh': ['Võ Đức Thịnh', 'Kỹ thuật · Trưởng nhóm QA'],
  'do-mai-linh': ['Đỗ Mai Linh', 'Marketing · Thiết kế đồ hoạ'],
  'bui-quoc-huy': ['Bùi Quốc Huy', 'Sản xuất · Tổ trưởng'],
  'trinh-van-long': ['Trịnh Văn Long', 'Sản xuất · Công nhân vận hành'],
  'ly-thanh-tam': ['Lý Thanh Tâm', 'Sản xuất · Công nhân vận hành'],
  'ngo-gia-bao': ['Ngô Gia Bảo', 'Sản xuất · Công nhân vận hành'],
  'hoang-minh-duc': ['Hoàng Minh Đức', 'Kinh doanh · Trưởng nhóm'],
  'mai-phuong-thao': ['Mai Phương Thảo', 'Tài chính · Kế toán thanh toán'],
  'truong-quoc-viet': ['Trương Quốc Việt', 'Kỹ thuật · Kỹ sư hệ thống']
};

const quote = (text: string) => `“${text}”`;

// Đơn nghỉ: "Hình thức" và "Lý do" luôn dựng từ `leave`, các dòng khác chen trước hoặc sau lý do.
function leaveFacts(
  leave: NonNullable<InboxItem['leave']>,
  before: [string, string][],
  after: [string, string][]
): [string, string][] {
  return [['Hình thức', leave.type], ...before, ['Lý do', quote(leave.reason)], ...after];
}

type Seed = Omit<InboxItem, 'groupLabel' | 'name' | 'initials' | 'role'>;

const L1 = { type: 'Phép năm', reason: 'Về quê có việc gia đình.' } as const;
const L2 = { type: 'Nghỉ ốm', reason: 'Sốt cao, đã đi khám.' } as const;
const L3 = { type: 'Phép năm', reason: 'Việc cá nhân.' } as const;

const SEED: Seed[] = [
  {
    id: 'ib-c1',
    group: 'att',
    action: 'remind',
    personId: 'trinh-van-long',
    what: 'Quên Check-out',
    when: '27/10',
    age: '1 ngày',
    head: 'Quên Check-out',
    sub: 'Thứ Ba 27/10',
    facts: [
      ['Giờ vào', '07:58'],
      ['Giờ ra', 'Chưa có'],
      ['Giải trình', 'Chưa gửi']
    ],
    days: ['2026-10-27'],
    missing: 'out'
  },
  {
    id: 'ib-c2',
    group: 'att',
    action: 'remind',
    personId: 'ly-thanh-tam',
    what: 'Quên Check-in',
    when: '26/10',
    age: '2 ngày',
    head: 'Quên Check-in',
    sub: 'Thứ Hai 26/10',
    facts: [
      ['Giờ vào', 'Chưa có'],
      ['Giờ ra', '17:06'],
      ['Giải trình', 'Chưa gửi']
    ],
    days: ['2026-10-26'],
    missing: 'in'
  },
  {
    id: 'ib-l1',
    group: 'leave',
    action: 'decide',
    personId: 'nguyen-thu-ha',
    what: L1.type,
    when: '29–30/10',
    age: '3 giờ',
    head: 'Phép năm · 2 ngày',
    sub: 'Thứ Năm 29/10 – Thứ Sáu 30/10',
    facts: leaveFacts(L1, [['Phép năm còn', '6 ngày']], [['Gửi lúc', '27/10 16:20']]),
    days: ['2026-10-29', '2026-10-30'],
    cellLabel: 'Phép năm',
    leave: { ...L1 }
  },
  {
    id: 'ib-l2',
    group: 'leave',
    action: 'decide',
    personId: 'bui-quoc-huy',
    what: L2.type,
    when: '28/10',
    age: '2 giờ',
    head: 'Nghỉ ốm · 1 ngày',
    sub: 'Thứ Tư 28/10',
    facts: leaveFacts(L2, [], [
      ['Đính kèm', 'Giấy khám bệnh · 1 tệp'],
      ['Gửi lúc', '28/10 07:10']
    ]),
    days: ['2026-10-28'],
    cellLabel: 'Nghỉ ốm',
    leave: { ...L2 }
  },
  {
    id: 'ib-l3',
    group: 'leave',
    action: 'decide',
    personId: 'pham-ngoc-anh',
    what: L3.type,
    when: '03/11',
    age: 'hôm qua',
    head: 'Phép năm · 1 ngày',
    sub: 'Thứ Ba 03/11',
    facts: leaveFacts(L3, [['Phép năm còn', '9 ngày']], [['Gửi lúc', '27/10 11:05']]),
    days: ['2026-11-03'],
    cellLabel: 'Phép năm',
    leave: { ...L3 }
  },
  {
    id: 'ib-o1',
    group: 'ot',
    action: 'decide',
    personId: 'vo-duc-thinh',
    what: 'Làm thêm 3 giờ',
    when: '23/10',
    age: '5 ngày',
    head: 'Làm thêm 3 giờ',
    sub: 'Thứ Sáu 23/10 · 17:00–20:00',
    facts: [
      ['Ca', 'HC 08:00–17:00'],
      ['Đã làm thêm tháng 10', '9 giờ'],
      ['Lý do', quote('Chạy kiểm thử bản phát hành.')]
    ],
    days: ['2026-10-23']
  },
  {
    id: 'ib-o2',
    group: 'ot',
    action: 'decide',
    personId: 'ngo-gia-bao',
    what: 'Làm bù',
    when: 'CN 01/11',
    age: 'hôm qua',
    head: 'Làm bù 1 ngày',
    sub: 'Chủ nhật 01/11 · 08:00–17:00',
    facts: [
      ['Bù cho', 'Thứ Hai 19/10'],
      ['Lý do', quote('Nghỉ 19/10 vì việc gia đình.')]
    ],
    days: ['2026-11-01'],
    cellLabel: 'Làm bù'
  },
  {
    id: 'ib-e1',
    group: 'exp',
    action: 'decide',
    personId: 'le-hoang-nam',
    what: 'Thiếu giờ ra',
    when: '27/10',
    age: '14 giờ',
    head: 'Thiếu giờ ra',
    sub: 'Thứ Ba 27/10',
    facts: [
      ['Giờ vào', '08:12 · trễ 12 phút'],
      ['Giờ ra khai', '17:30'],
      ['Giải trình', quote('Quên bấm ra, về lúc 17:30.')],
      ['Gửi lúc', '27/10 20:14']
    ],
    days: ['2026-10-27'],
    declared: { from: '08:12', to: '17:30' }
  },
  {
    id: 'ib-e2',
    group: 'exp',
    action: 'decide',
    personId: 'do-mai-linh',
    what: 'Đi muộn 27 phút',
    when: '26/10',
    age: '2 ngày',
    head: 'Đi muộn 27 phút',
    sub: 'Thứ Hai 26/10',
    facts: [
      ['Giờ vào', '08:27'],
      ['Giải trình', quote('Kẹt xe trên cầu Sài Gòn.')],
      ['Gửi lúc', '26/10 09:02']
    ],
    days: ['2026-10-26']
  },
  {
    id: 'ib-e3',
    group: 'exp',
    action: 'decide',
    personId: 'tran-minh-quan',
    what: 'Đi muộn 9 phút',
    when: '15/10',
    age: '13 ngày',
    head: 'Đi muộn 9 phút',
    sub: 'Thứ Năm 15/10',
    facts: [
      ['Giờ vào', '08:09'],
      ['Giải trình', quote('Đưa con đi khám.')],
      ['Gửi lúc', '15/10 08:40']
    ],
    days: ['2026-10-15']
  },
  {
    id: 'ib-e4',
    group: 'exp',
    action: 'decide',
    personId: 'hoang-minh-duc',
    what: 'Về sớm 30 phút',
    when: '22/10',
    age: '6 ngày',
    head: 'Về sớm 30 phút',
    sub: 'Thứ Năm 22/10',
    facts: [
      ['Giờ ra', '16:30'],
      ['Giải trình', quote('Có việc gia đình đột xuất.')],
      ['Gửi lúc', '22/10 16:25']
    ],
    days: ['2026-10-22']
  },
  {
    id: 'ib-a1',
    group: 'adv',
    action: 'decide',
    personId: 'mai-phuong-thao',
    what: '3.000.000 ₫',
    when: '',
    age: 'hôm qua',
    head: 'Tạm ứng 3.000.000 ₫',
    sub: 'Trừ vào lương tháng 10',
    facts: [
      ['Lý do', quote('Đóng học phí cho con.')],
      ['Gửi lúc', '27/10 09:30']
    ],
    days: []
  },
  {
    id: 'ib-a2',
    group: 'adv',
    action: 'decide',
    personId: 'truong-quoc-viet',
    what: '2.000.000 ₫',
    when: '',
    age: '3 ngày',
    head: 'Tạm ứng 2.000.000 ₫',
    sub: 'Trừ vào lương tháng 10',
    facts: [
      ['Lý do', quote('Sửa xe.')],
      ['Gửi lúc', '25/10 18:12']
    ],
    days: []
  }
];

const LABELS = Object.fromEntries(INBOX_GROUPS.map(g => [g.key, g.label])) as Record<InboxGroup, string>;

let list: InboxItem[] = SEED.map(seed => {
  const [name, role] = PEOPLE[seed.personId];
  return { ...seed, groupLabel: LABELS[seed.group], name, initials: initials(name), role };
});

/** Bản sao các việc còn chờ, giữ thứ tự gốc ib-c1 … ib-a2. */
export function pendingInbox(): InboxItem[] {
  return structuredClone(list);
}

/** Bỏ một việc khỏi danh sách chờ; trả việc vừa bỏ, hoặc null khi không còn id đó. */
export function resolveInboxItem(id: string): InboxItem | null {
  const hit = list.find(item => item.id === id);
  if (!hit) return null;
  list = list.filter(item => item.id !== id);
  return structuredClone(hit);
}
