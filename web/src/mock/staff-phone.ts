// Dữ liệu giả của app nhân viên trên điện thoại (spec staff-phone-app mục 1–2): luôn là Lê Hoàng Nam, tháng 10/2026.
// Mỗi hàm *View() dựng sẵn chuỗi hiển thị cho một màn. Dữ liệu nằm trong bộ nhớ: chỉ checkOutNow() sửa được, tải lại trang thì về như cũ.
import { MOCK_NOW, MOCK_TODAY } from './clock';

export type DayKind = 'work' | 'late' | 'leave' | 'absent' | 'todo';
export type CellKind = DayKind | 'future' | 'off';
export type RequestStatus = 'pend' | 'done' | 'rej';
export type PhoneIconName =
  | 'home' | 'cal' | 'doc' | 'wallet' | 'user' | 'left' | 'right' | 'plus' | 'pin'
  | 'out' | 'clock' | 'leave' | 'coin' | 'lock' | 'target' | 'shield' | 'gift' | 'x';

export type CalendarCell = {
  date: string; // 'YYYY-MM-DD'
  day: string; // '26', '01' (J1) hoặc '1'…'31' (J2, không số 0 đầu)
  dow: string; // 'T2' … 'CN'
  kind: CellKind;
  today: boolean;
  label: string; // tên truy cập, vd. 'Thứ Hai 26/10: đi làm', 'Hôm nay, thứ Tư 28/10: đang làm'
  open: boolean; // true khi có dữ liệu ngày (mở J3)
};

export type RequestRowData = {
  id: string; // 'giai-trinh-2710' | 'phep-1210' | 'tam-ung-09' | 'gio-vao-0909'
  icon: 'clock' | 'leave' | 'coin';
  title: string; // 'Thiếu giờ ra 27/10'
  status: RequestStatus;
  statusText: string; // 'Chờ duyệt' | 'Đã duyệt' | 'Từ chối'
  month: string; // '2026-10'
};
export type RequestStep = { label: string; at: string | null; state: RequestStatus };
export type RequestDetail = RequestRowData & {
  kindLabel: string; // 'Giải trình' | 'Đơn nghỉ' | 'Tạm ứng lương'
  facts: [string, string][]; // [khoá, giá trị] theo spec 2.2, lý do đã có ngoặc kép cong
  steps: RequestStep[];
};

export type HomeView = {
  greeting: string; // 'Chào buổi sáng'
  name: string; initials: string; weekday: string; date: string; // 'Lê Hoàng Nam', 'HN', 'Thứ Tư', '28/10/2026'
  shiftLabel: string; // 'Ca HC · 08:00–17:00'
  shiftStart: string; shiftEnd: string; // '08:00', '17:00'
  now: string; // '09:40'
  checkIn: string; // '07:59'
  checkOut: string | null; // null, hoặc '09:40' sau checkOut()
  workedMin: number; shiftMin: number; // 101, 540
  worked: string; // '1g 41p'
  location: string; // 'Đúng vị trí văn phòng GFT'
  week: { range: string; cells: CalendarCell[] }; // '26/10 – 01/11', 7 ô
  alert: { date: string; text: string } | null; // '2026-10-27', '27/10 thiếu giờ ra · chờ duyệt giải trình'
  income: { label: string; net: string }; // 'Thu nhập tháng 10 · tạm tính', '14.278.183'
  requests: RequestRowData[]; // 2 dòng mới nhất
};

export type AttendanceView = {
  label: string; state: string; // 'Tháng 10/2026', 'Kỳ công đang mở'
  shiftLine: string; // 'Ca HC 08:00–17:00 · thứ Hai – thứ Bảy'
  tiles: { value: string; of: string | null; label: string }[]; // 21 / 26 Ngày công; 1 Lần đi muộn; 2 Ngày nghỉ có lương
  // of là số sau dấu gạch chéo ('26'); màn tự viết ' / ' trước nó
  cells: (CalendarCell | null)[]; // 3 null rồi 31 ô
  recent: { date: string; kind: CellKind; day: string; times: string; statusText: string }[];
  // 5 dòng: { day: 'Thứ Tư 28/10', times: '07:59 – …' }, …
};

export type DayDetail = {
  date: string;
  title: string; // 'Thứ Ba 27/10/2026'
  shiftLine: string; // 'Ca HC 08:00–17:00'
  kind: DayKind; today: boolean;
  statusText: string; // 'Cần xử lý' | 'Đi làm' | 'Đang làm' | 'Nghỉ có lương' | 'Đi muộn' | 'Vắng'
  shiftStart: string; shiftEnd: string; now: string;
  in: string | null; out: string | null; lateMin: number;
  leave: { type: string; span: string } | null; // { type: 'Phép năm', span: 'Cả ngày' }
  claim: { sentAt: string; outClaim: string } | null; // { sentAt: '20:14', outClaim: '17:30' }
};

export type RequestsView = {
  counts: { all: number; pend: number; done: number; rej: number };
  groups: { month: string; label: string; rows: RequestRowData[] }[]; // 'Tháng 10', 'Tháng 9'
};

export type IncomeView = {
  title: string; note: string; label: string; state: string; // 'Thu nhập', 'Phiếu chính thức có khi Admin duyệt', 'Tháng 10/2026', 'Tạm tính'
  net: string; review: string; gross: string; deduction: string;
  kpi: {
    title: string; parts: string; percent: string; ratio: number; // 'KPI tháng 10', '5 phần', '66,14%', 0.6614
    pay: string; proposed: string;
    scores: { value: string; label: string }[];
  };
  lines: { icon: PhoneIconName; label: string; value: string; zero: boolean }[];
  total: string; // '14.278.183 ₫'
};

export type ProfileView = {
  name: string; initials: string; email: string; contract: string;
  facts: [string, string][]; // 6 cặp theo spec 8.2
  note: string;
};

// ---------- Người, ca, đồng hồ (spec mục 1) ----------
const NAM = { name: 'Lê Hoàng Nam', initials: 'HN', email: 'nam.le@gft.vn' };
const SHIFT = { code: 'HC', start: '08:00', end: '17:00', days: 'thứ Hai – thứ Bảy' };
const LEAVE_LEFT = '11 ngày';
const MONTH_NO = Number(MOCK_TODAY.slice(5, 7)); // 10
const MONTH_LABEL = `Tháng ${MONTH_NO}/${MOCK_TODAY.slice(0, 4)}`; // 'Tháng 10/2026'

const DOW_LONG = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
const DOW_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const pad = (n: number) => String(n).padStart(2, '0');
const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const dateOf = (iso: string) => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)));
const isoOf = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => isoOf(new Date(dateOf(iso).getTime() + n * 86400000));
const dowOf = (iso: string) => dateOf(iso).getUTCDay(); // 0 = Chủ nhật
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`; // '27/10'
const ddmmyyyy = (iso: string) => `${ddmm(iso)}/${iso.slice(0, 4)}`; // '27/10/2026'
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1); // 'Thứ Tư' → 'thứ Tư'
// Giờ HH:MM của đồng hồ giả theo giờ Việt Nam (UTC+7): '09:40'.
const nowTime = () => new Date(Date.parse(MOCK_NOW) + 7 * 3600000).toISOString().slice(11, 16);

// ---------- Ngày công tháng 10/2026 (spec 2.1) ----------
type DayRecord = {
  kind: DayKind;
  in: string | null;
  out: string | null;
  leave: { type: string; span: string } | null;
  claim: { sentAt: string; outClaim: string } | null;
};
// [ngày, giờ vào, giờ ra]; null giờ ra = chưa có. Ngày không có trên board là số giả trong 07:45–08:00 / 17:00–17:15.
const WORKED: [number, string, string | null][] = [
  [1, '07:55', '17:05'], [2, '07:57', '17:03'], [3, '07:50', '17:08'],
  [5, '07:58', '17:02'], [6, '07:54', '17:06'], [7, '07:56', '17:04'], [8, '07:59', '17:01'],
  [9, '07:53', '17:07'], [10, '07:51', '17:05'],
  [13, '07:57', '17:03'], [14, '07:55', '17:09'], [15, '07:58', '17:02'], [16, '07:52', '17:06'],
  [19, '07:56', '17:04'], [20, '07:54', '17:05'], [21, '07:57', '17:03'], [22, '07:59', '17:08'],
  [23, '07:58', '17:02'], [24, '07:52', '17:04'],
  [26, '07:56', '17:10'], [27, '08:12', null], [28, '07:59', null]
];
const LEAVES: [number, string][] = [
  [12, 'Phép năm'],
  [17, 'iSAT']
];
const monthDate = (d: number) => `${MOCK_TODAY.slice(0, 8)}${pad(d)}`;
const DAYS = new Map<string, DayRecord>();
for (const [d, inAt, outAt] of WORKED)
  DAYS.set(monthDate(d), { kind: 'work', in: inAt, out: outAt, leave: null, claim: null });
for (const [d, type] of LEAVES)
  DAYS.set(monthDate(d), { kind: 'leave', in: null, out: null, leave: { type, span: 'Cả ngày' }, claim: null });
// 27/10: đi muộn 12 phút, thiếu giờ ra; giải trình gửi 20:14, giờ ra khai 17:30, chờ Admin duyệt.
Object.assign(DAYS.get(monthDate(27))!, { kind: 'todo', claim: { sentAt: '20:14', outClaim: '17:30' } });

const KIND_TEXT: Record<CellKind, string> = {
  work: 'đi làm',
  late: 'đi muộn',
  leave: 'nghỉ có lương',
  absent: 'vắng',
  todo: 'cần xử lý',
  future: 'chưa tới',
  off: 'không có ca'
};
// Hôm nay đã vào mà chưa ra thì là "đang làm"; ra rồi thì theo nhóm của ngày (nhóm không đổi, spec R7).
const working = (date: string, rec?: DayRecord) => date === MOCK_TODAY && !!rec && !!rec.in && !rec.out;

function cellOf(date: string, padDay: boolean): CalendarCell {
  const rec = DAYS.get(date);
  const dow = dowOf(date);
  const kind: CellKind = rec ? rec.kind : dow === 0 || date <= MOCK_TODAY ? 'off' : 'future';
  const today = date === MOCK_TODAY;
  const text = working(date, rec) ? 'đang làm' : KIND_TEXT[kind];
  const label = today ? `Hôm nay, ${lower(DOW_LONG[dow])} ${ddmm(date)}: ${text}` : `${DOW_LONG[dow]} ${ddmm(date)}: ${text}`;
  const day = padDay ? date.slice(8, 10) : String(Number(date.slice(8, 10)));
  return { date, day, dow: DOW_SHORT[dow], kind, today, label, open: !!rec };
}

const timesOf = (date: string, rec: DayRecord) => `${rec.in} – ${rec.out ?? (date === MOCK_TODAY ? '…' : '?')}`;
const workedText = (min: number) => `${Math.floor(min / 60)}g ${min % 60}p`;

// ---------- Bốn yêu cầu (spec 2.2), mới nhất trước ----------
const STATUS_TEXT: Record<RequestStatus, string> = { pend: 'Chờ duyệt', done: 'Đã duyệt', rej: 'Từ chối' };
const REQUESTS: RequestDetail[] = [
  {
    id: 'giai-trinh-2710', icon: 'clock', title: 'Thiếu giờ ra 27/10', status: 'pend', statusText: STATUS_TEXT.pend,
    month: '2026-10', kindLabel: 'Giải trình',
    facts: [['Ngày', 'Thứ Ba 27/10/2026'], ['Giờ vào', '08:12'], ['Giờ ra khai', '17:30'], ['Lý do', '“Quên bấm Check-out khi về.”']],
    steps: [
      { label: 'Đã gửi', at: '27/10 20:14', state: 'done' },
      { label: 'Chờ Admin duyệt', at: null, state: 'pend' }
    ]
  },
  {
    id: 'phep-1210', icon: 'leave', title: 'Phép năm 12/10', status: 'done', statusText: STATUS_TEXT.done,
    month: '2026-10', kindLabel: 'Đơn nghỉ',
    facts: [
      ['Ngày nghỉ', 'Thứ Hai 12/10/2026'], ['Thời gian', 'Cả ngày'], ['Hình thức', 'Phép năm'],
      ['Lý do', '“Việc gia đình.”'], ['Phép năm còn lại', LEAVE_LEFT]
    ],
    steps: [
      { label: 'Đã gửi', at: '08/10 09:12', state: 'done' },
      { label: 'Trưởng phòng Kinh doanh đã duyệt', at: '09/10 10:30', state: 'done' }
    ]
  },
  {
    id: 'tam-ung-09', icon: 'coin', title: 'Tạm ứng 1.500.000 ₫', status: 'done', statusText: STATUS_TEXT.done,
    month: '2026-09', kindLabel: 'Tạm ứng lương',
    facts: [['Số tiền', '1.500.000 ₫'], ['Trừ vào lương', 'Tháng 9/2026']],
    steps: [
      { label: 'Đã gửi', at: '15/09 16:20', state: 'done' },
      { label: 'Admin đã duyệt', at: '16/09 09:05', state: 'done' }
    ]
  },
  {
    id: 'gio-vao-0909', icon: 'clock', title: 'Khai giờ vào 09/09', status: 'rej', statusText: STATUS_TEXT.rej,
    month: '2026-09', kindLabel: 'Giải trình',
    facts: [['Ngày', 'Thứ Tư 09/09/2026'], ['Giờ vào khai', '08:00'], ['Lý do', '“Máy chấm công không nhận.”']],
    steps: [
      { label: 'Đã gửi', at: '09/09 17:45', state: 'done' },
      { label: 'Admin đã từ chối', at: '10/09 10:15', state: 'rej' }
    ]
  }
];
const rowOf = ({ id, icon, title, status, statusText, month }: RequestDetail): RequestRowData => ({
  id, icon, title, status, statusText, month
});

// ---------- Thu nhập tháng 10 (spec 2.3; hằng số của board, R8) ----------
const NET = '14.278.183';

// ---------- Hàm dựng cho từng màn ----------
export function homeView(): HomeView {
  const rec = DAYS.get(MOCK_TODAY)!;
  const now = nowTime();
  const workedMin = toMin(rec.out ?? now) - toMin(rec.in!);
  const monday = addDays(MOCK_TODAY, -((dowOf(MOCK_TODAY) + 6) % 7));
  const cells = Array.from({ length: 7 }, (_, i) => cellOf(addDays(monday, i), true));
  const todo = cells.find(c => c.kind === 'todo' && DAYS.get(c.date)?.claim && !DAYS.get(c.date)?.out);
  return {
    greeting: 'Chào buổi sáng',
    name: NAM.name,
    initials: NAM.initials,
    weekday: DOW_LONG[dowOf(MOCK_TODAY)],
    date: ddmmyyyy(MOCK_TODAY),
    shiftLabel: `Ca ${SHIFT.code} · ${SHIFT.start}–${SHIFT.end}`,
    shiftStart: SHIFT.start,
    shiftEnd: SHIFT.end,
    now,
    checkIn: rec.in!,
    checkOut: rec.out,
    workedMin,
    shiftMin: toMin(SHIFT.end) - toMin(SHIFT.start),
    worked: workedText(workedMin),
    location: 'Đúng vị trí văn phòng GFT',
    week: { range: `${ddmm(monday)} – ${ddmm(addDays(monday, 6))}`, cells },
    alert: todo ? { date: todo.date, text: `${ddmm(todo.date)} thiếu giờ ra · chờ duyệt giải trình` } : null,
    income: { label: `Thu nhập tháng ${MONTH_NO} · tạm tính`, net: NET },
    requests: REQUESTS.slice(0, 2).map(rowOf)
  };
}

export function attendanceView(): AttendanceView {
  const first = `${MOCK_TODAY.slice(0, 8)}01`;
  const length = new Date(Date.UTC(+first.slice(0, 4), +first.slice(5, 7), 0)).getUTCDate();
  const blanks: null[] = Array.from({ length: (dowOf(first) + 6) % 7 }, () => null);
  const days = Array.from({ length }, (_, i) => cellOf(addDays(first, i), false));
  const recent = [...DAYS.entries()]
    .filter(([, rec]) => rec.in)
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .slice(0, 5)
    .map(([date, rec]) => ({
      date,
      kind: rec.kind as CellKind,
      day: `${DOW_LONG[dowOf(date)]} ${ddmm(date)}`,
      times: timesOf(date, rec),
      statusText: statusOf(date, rec)
    }));
  return {
    label: MONTH_LABEL,
    state: 'Kỳ công đang mở',
    shiftLine: `Ca ${SHIFT.code} ${SHIFT.start}–${SHIFT.end} · ${SHIFT.days}`,
    tiles: [
      { value: '21', of: '26', label: 'Ngày công' },
      { value: '1', of: null, label: 'Lần đi muộn' },
      { value: '2', of: null, label: 'Ngày nghỉ có lương' }
    ],
    cells: [...blanks, ...days],
    recent
  };
}

const DAY_STATUS: Record<DayKind, string> = {
  work: 'Đi làm',
  late: 'Đi muộn',
  leave: 'Nghỉ có lương',
  absent: 'Vắng',
  todo: 'Cần xử lý'
};

// Chữ trạng thái của một ngày: nhãn ở đầu hộp J3 và tên truy cập của dòng "Gần đây" (J2) dùng chung.
const statusOf = (date: string, rec: DayRecord) => (working(date, rec) ? 'Đang làm' : DAY_STATUS[rec.kind]);

export function dayDetail(date: string): DayDetail | null {
  const rec = DAYS.get(date);
  if (!rec) return null;
  return {
    date,
    title: `${DOW_LONG[dowOf(date)]} ${ddmmyyyy(date)}`,
    shiftLine: `Ca ${SHIFT.code} ${SHIFT.start}–${SHIFT.end}`,
    kind: rec.kind,
    today: date === MOCK_TODAY,
    statusText: statusOf(date, rec),
    shiftStart: SHIFT.start,
    shiftEnd: SHIFT.end,
    now: nowTime(),
    in: rec.in,
    out: rec.out,
    lateMin: rec.in ? Math.max(0, toMin(rec.in) - toMin(SHIFT.start)) : 0,
    leave: rec.leave,
    claim: rec.claim
  };
}

export function requestsView(): RequestsView {
  const rows = REQUESTS.map(rowOf);
  const count = (s: RequestStatus) => rows.filter(r => r.status === s).length;
  const groups: RequestsView['groups'] = [];
  for (const row of rows) {
    let group = groups.find(g => g.month === row.month);
    if (!group) groups.push((group = { month: row.month, label: `Tháng ${Number(row.month.slice(5, 7))}`, rows: [] }));
    group.rows.push(row);
  }
  return { counts: { all: rows.length, pend: count('pend'), done: count('done'), rej: count('rej') }, groups };
}

export function requestDetail(id: string): RequestDetail | null {
  return REQUESTS.find(r => r.id === id) ?? null;
}

export function incomeView(): IncomeView {
  return {
    title: 'Thu nhập',
    note: 'Phiếu chính thức có khi Admin duyệt',
    label: MONTH_LABEL,
    state: 'Tạm tính',
    net: NET,
    review: 'Admin đang duyệt phiếu',
    gross: '15.538.183',
    deduction: '1.260.000',
    kpi: {
      title: `KPI tháng ${MONTH_NO}`,
      parts: '5 phần',
      percent: '66,14%',
      ratio: 0.6614,
      pay: '1.322.800',
      proposed: '2.000.000',
      scores: [
        { value: '62', label: 'Wework' },
        { value: '70', label: 'Người dùng' },
        { value: '68', label: 'Đồng nghiệp' },
        { value: '65', label: 'Quản lý' },
        { value: '75', label: 'Tự đánh giá' }
      ]
    },
    lines: [
      { icon: 'cal', label: 'Lương ngày công', value: '11.076.923', zero: false },
      { icon: 'leave', label: 'Nghỉ phép, iSAT', value: '923.076', zero: false },
      { icon: 'gift', label: 'Phụ cấp', value: '2.215.384', zero: false },
      { icon: 'target', label: 'Lương KPI', value: '1.322.800', zero: false },
      { icon: 'shield', label: 'Bảo hiểm bắt buộc', value: '−1.260.000', zero: false },
      { icon: 'coin', label: 'Thuế TNCN', value: '0', zero: true }
    ],
    total: `${NET} ₫`
  };
}

export function profileView(): ProfileView {
  return {
    name: NAM.name,
    initials: NAM.initials,
    email: NAM.email,
    contract: 'Chính thức',
    facts: [
      ['Mã nhân viên', 'GFT-0142'],
      ['Phòng ban', 'Kinh doanh'],
      ['Chức danh', 'Nhân viên kinh doanh'],
      ['Ca làm', `${SHIFT.code} ${SHIFT.start}–${SHIFT.end}`],
      ['Ngày vào làm', '04/03/2024'],
      ['Phép năm còn lại', LEAVE_LEFT]
    ],
    note: 'Thông tin do Admin quản lý. Thấy sai thì báo Admin để sửa.'
  };
}

// Ghi giờ ra = giờ của đồng hồ giả (09:40) cho hôm nay; chỉ khi đã vào mà chưa ra. Mọi hàm dựng sau đó đọc giá trị mới.
export function checkOutNow(): void {
  const rec = DAYS.get(MOCK_TODAY);
  if (rec && rec.in && !rec.out) rec.out = nowTime();
}
