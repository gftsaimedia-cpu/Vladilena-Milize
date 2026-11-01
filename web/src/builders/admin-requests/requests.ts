// Dựng danh sách yêu cầu của màn Duyệt từ GET /approvals (hàm thuần: không đọc đồng hồ máy, không gọi mạng).
import { fold } from '@/builders/admin-attendance/common';

export const OLDER_PAGE = 17;

// Mã khoản của máy chủ → loại hiện trên màn. OT ngày lễ là khoản 'ot' có cờ holiday.
const KIND_OF = {
  ot: 'OT',
  leave: 'Nghỉ phép năm',
  approved: 'Nghỉ được duyệt',
  makeup_hours: 'Làm bù theo giờ',
  makeup_day: 'Làm bù cả ngày',
  willmakeup: 'Nghỉ, sẽ làm bù',
  holiday_work: 'Làm ngày lễ',
  isat: 'iSAT'
};
export const REQUEST_KINDS = [
  'OT',
  'Nghỉ phép năm',
  'Nghỉ được duyệt',
  'Làm ngày lễ',
  'Làm bù theo giờ',
  'Nghỉ, sẽ làm bù',
  'iSAT'
];
const STATUS_OF = { pending: 'cho', approved: 'dong-y', rejected: 'tu-choi' };

export const kindOf = (row?) =>
  row.holiday && row.item === 'ot' ? KIND_OF.holiday_work : KIND_OF[row.item] || row.item;

const minutes = (hhmm?) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
// Các khoảng giờ ngoài ca: trước ca (extraIn → in) và sau ca (out → extraOut).
function extraRanges(d?) {
  const ranges: any[] = [];
  if (d.extraIn && d.in && d.extraIn !== d.in) ranges.push([d.extraIn, d.in]);
  if (d.extraOut && d.out && d.extraOut !== d.out) ranges.push([d.out, d.extraOut]);
  return ranges;
}

/** Giờ khai: khoảng ngoài ca (OT, làm bù theo giờ) kèm ca; cả ngày cho các khoản còn lại; ngày lễ và làm bù cả ngày hiện giờ ca. */
export function detailOf(row?) {
  const d = row.declared || {};
  const timed = row.item === 'ot' && !row.holiday ? true : row.item === 'makeup_hours';
  if (timed) {
    const parts = [
      extraRanges(d)
        .map(([a, b]: any) => `${a}–${b}`)
        .join(' và ') || 'Chưa có giờ'
    ];
    if (d.in && d.out) parts.push(`ca ${d.in}–${d.out}`);
    return parts.join(' · ');
  }
  if (row.item === 'ot' || row.item === 'makeup_day') return d.in && d.out ? `${d.in}–${d.out}` : 'Cả ngày';
  return 'Cả ngày';
}

// Tổng độ dài các khoảng khai, tính bằng giờ (2 chữ số thập phân tối đa), dấu phẩy thập phân: 2 hoặc 1,5.
const hoursText = (ranges?) => {
  const total = ranges.reduce((s, [a, b]: any) => s + Math.max(0, (minutes(b) ?? 0) - (minutes(a) ?? 0)), 0);
  return String(Math.round((total / 60) * 100) / 100).replace('.', ',');
};

/** Ảnh hưởng của khoản đối với người khai, tính từ giờ khai. */
export function impactOf(row?) {
  const d = row.declared || {};
  if (row.item === 'leave') return 'Trừ 1 ngày phép năm';
  if (row.item === 'isat') return 'Nghỉ thứ 7, vẫn có lương';
  if (row.item === 'ot' && !row.holiday) {
    const r = extraRanges(d);
    return r.length ? `Thêm ${hoursText(r)} giờ OT` : '';
  }
  if (row.item === 'willmakeup') {
    const plans = (d.makeupPlans || []).map(p => [p.from, p.to]);
    return plans.length ? `Bù ${hoursText(plans)} giờ` : '';
  }
  if (row.item === 'makeup_hours') {
    const r = extraRanges(d);
    return r.length ? `Bù ${hoursText(r)} giờ` : '';
  }
  return '';
}

/** ISO UTC → 'YYYY-MM-DDTHH:mm' giờ Việt Nam (UTC+7). */
export const vnLocal = (iso?) => (iso ? new Date(Date.parse(iso) + 7 * 3600000).toISOString().slice(0, 16) : '');

export const idOf = (row?) => `${row.username}|${row.date}`;

/** Một dòng của màn Duyệt. staffBy: Map username → hồ sơ từ GET /staff. */
export function buildRequestRow(row?, staffBy?) {
  const staff = staffBy.get(row.username) || {};
  return {
    id: idOf(row),
    name: row.name || row.username,
    type: String(staff.type || '').toUpperCase(),
    position: staff.levelName || '',
    kind: kindOf(row),
    date: row.date,
    detail: detailOf(row),
    sentAt: vnLocal(row.submittedAt),
    month: row.date.slice(0, 7),
    status: STATUS_OF[row.status] || 'cho',
    impact: impactOf(row),
    lateNote: '',
    warningCount: 0
  };
}

export const staffIndex = (list?) => new Map<any, any>((list || []).map(s => [s.username, s]));

/** Lọc theo loại và theo tên (không phân biệt dấu, hoa thường). */
export const matchRow = (r?, kind?, q?) =>
  (!kind || r.kind === kind) && (!q || fold(r.name).includes(fold(String(q).trim())));

const byDate = (a?, b?) => a.date.localeCompare(b.date) || String(a.name).localeCompare(String(b.name));
/** Dòng thô của GET /approvals: tab Chờ xử lý ngày cũ trước; các tab còn lại mới quyết định trước. */
export const sortRaw = (items?, pending?) =>
  [...items].sort(
    pending ? byDate : (a, b) => String(b.decidedAt || '').localeCompare(String(a.decidedAt || '')) || byDate(a, b)
  );

/** Số đếm của màn Duyệt. all/inMonth: counts của GET /approvals (mọi tháng / riêng tháng đang xem). */
export function buildCounts({ all, inMonth, scope, month }: any) {
  const own = scope === 'moi-thang' ? all : inMonth;
  return {
    currentMonth: month,
    pending: all.pending,
    pendingMonth: inMonth.pending,
    pendingOlder: all.pending - inMonth.pending,
    approved: own.approved,
    rejected: own.rejected,
    all: own.pending + own.approved + own.rejected
  };
}
