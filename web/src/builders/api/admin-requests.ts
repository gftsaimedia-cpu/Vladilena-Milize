// Tab Yêu cầu (board Q1–Q4, 06/11): mỗi đơn một dòng ReqRow, cả đơn chờ lẫn đơn đã xử lý.
// Máy chủ thật: GET /requests?limit=200 (mọi trạng thái) + danh sách nhân viên để lấy tên; loại và trạng thái theo DTO.
// Máy chủ chưa trả phòng ban / trạng thái nhân sự cho đơn nên dept rỗng (ô phòng ban khoá) và ps để trống (coi là chính thức).
import type { PersonStatus } from '../../components/staff-scope/staffScope';
import type { Fact, InboxItem } from '../../mock/inbox';
import { dm, initials } from '../../utils/format';
import { inboxFromRequests, type PersonInfo, type RequestDTO } from './inbox';

export type ReqKind = 'leave' | 'makeup' | 'shift' | 'ot' | 'adv' | 'exp';
export type ReqStatus = 'pend' | 'ok' | 'rej' | 'cancel';

export type ReqRow = {
  id: string;
  kind: ReqKind;
  status: ReqStatus;
  personId: string;
  name: string;
  initials: string;
  dept: string;
  title: string;
  ps?: PersonStatus;
  /** Ngày của đơn (cột Ngày), vd. "29–30/10". */
  date: string;
  /** Nội dung một dòng (cột Nội dung). */
  what: string;
  /** Lúc gửi, ISO (UTC). */
  sentAt: string;
  /** Lúc duyệt / từ chối / huỷ, ISO (UTC); đơn chờ không có. */
  reviewedAt?: string;
  /** Ghi chú của Admin cho nhân viên (lý do từ chối…). */
  reviewNote?: string;
  head: string;
  sub: string;
  facts: Fact[];
};

export const KIND_ORDER: ReqKind[] = ['leave', 'makeup', 'shift', 'ot', 'adv', 'exp'];
export const KIND_LABEL: Record<ReqKind, string> = {
  leave: 'Đơn nghỉ',
  makeup: 'Nghỉ có làm bù',
  shift: 'Đổi ca',
  ot: 'Làm thêm giờ',
  adv: 'Tạm ứng',
  exp: 'Giải trình'
};
export const STATUS_LABEL: Record<ReqStatus, string> = { pend: 'Chờ duyệt', ok: 'Đã duyệt', rej: 'Từ chối', cancel: 'Đã huỷ' };
export const STATUS_DOT: Record<ReqStatus, string> = {
  pend: 'var(--status-pending)',
  ok: 'var(--status-done)',
  rej: 'var(--status-rejected)',
  cancel: '#9e9e9e'
};

/** Giờ Việt Nam (UTC+7) của một mốc ISO, dạng "15/10 08:40". */
export function vnStamp(iso?: string): string {
  if (!iso) return '';
  const vn = new Date(Date.parse(iso) + 7 * 3600000).toISOString();
  return `${vn.slice(8, 10)}/${vn.slice(5, 7)} ${vn.slice(11, 16)}`;
}

/** Đơn chờ trước (cũ nhất trước), rồi đơn đã xử lý (mới xử lý nhất trước). */
export function sortRequests(rows: ReqRow[]): ReqRow[] {
  const pend = rows.filter(r => r.status === 'pend').sort((a, b) => a.sentAt.localeCompare(b.sentAt));
  const done = rows
    .filter(r => r.status !== 'pend')
    .sort((a, b) => (b.reviewedAt ?? b.sentAt).localeCompare(a.reviewedAt ?? a.sentAt));
  return [...pend, ...done];
}

/** "Phòng ban · Chức danh" của chuông → [phòng ban, chức danh]. */
export function splitRole(role: string): [string, string] {
  const at = role.indexOf(' · ');
  return at < 0 ? ['', role] : [role.slice(0, at), role.slice(at + 3)];
}

/** Một việc "duyệt" của chuông thành dòng đơn. Loại đơn suy từ nhóm; việc "Làm bù" thuộc loại Nghỉ có làm bù. */
export function rowFromInbox(item: InboxItem, kind: ReqKind, sentAt: string, status: ReqStatus = 'pend'): ReqRow {
  const [dept, title] = splitRole(item.role);
  return {
    id: item.id,
    kind,
    status,
    personId: item.personId,
    name: item.name,
    initials: item.initials || initials(item.name),
    dept,
    title,
    date: item.when || dm(new Date(Date.parse(sentAt) + 7 * 3600000).toISOString()),
    what: item.head,
    sentAt,
    head: item.head,
    sub: item.sub,
    // Giờ gửi đã có ở dòng người gửi của ngăn chi tiết: bỏ dòng "Gửi lúc" của chuông cho khỏi lặp.
    facts: item.facts.filter(([label]) => label !== 'Gửi lúc')
  };
}

export function kindOfInbox(item: InboxItem): ReqKind {
  if (item.group === 'ot') return /bù/i.test(item.what) ? 'makeup' : 'ot';
  if (item.group === 'exp' || item.group === 'att') return 'exp';
  return item.group;
}

const KIND_OF: Record<RequestDTO['type'], ReqKind> = {
  LEAVE: 'leave',
  ISAT: 'leave',
  LEAVE_WITH_MAKEUP: 'makeup',
  SHIFT_CHANGE: 'shift',
  OVERTIME: 'ot',
  ADVANCE: 'adv',
  EXPLANATION: 'exp'
};
const STATUS_OF: Record<RequestDTO['status'], ReqStatus> = { PENDING: 'pend', APPROVED: 'ok', REJECTED: 'rej', CANCELLED: 'cancel' };

/** Danh sách đơn của máy chủ thật. Chữ đầu / phụ / dòng chi tiết dựng như chuông (inboxFromRequests), cho mọi trạng thái. */
export function requestRowsFromDto(
  requests: (RequestDTO & { reviewedAt?: string | null; reviewNote?: string | null })[],
  people: Map<string, PersonInfo>,
  now: number
): ReqRow[] {
  const asPending = requests.map(r => ({ ...r, status: 'PENDING' as const }));
  const items = new Map(inboxFromRequests(asPending, people, now).map(i => [i.id, i]));
  return requests.flatMap(r => {
    const item = items.get(r.id);
    if (!item) return [];
    const row = rowFromInbox(item, KIND_OF[r.type] ?? 'leave', r.createdAt, STATUS_OF[r.status] ?? 'pend');
    return [{ ...row, reviewedAt: r.reviewedAt ?? undefined, reviewNote: r.reviewNote ?? undefined }];
  });
}
