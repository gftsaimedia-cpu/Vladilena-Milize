// Dịch vụ của nhóm admin-main: Tổng quan, Yêu cầu và các lớp nổi của vỏ Admin.
// Máy chủ thật: Yêu cầu, chuông và việc chờ đọc GET /api/v2/requests, duyệt qua PATCH /requests/:id/review;
// Tổng quan ghép từ các API đó. Dữ liệu giả: mock/ (Yêu cầu không có dữ liệu giả, api() báo mock_missing).
import { toast } from '@/components/shell/toast';
import {
  OLDER_PAGE,
  REQUEST_KINDS,
  buildCounts,
  buildRequestRow,
  matchRow,
  sortRaw
} from '@/builders/admin-requests/requests';
import { inboxFromRequests, type PersonInfo } from '@/builders/api/inbox';
import { overviewFrom, recentWorkdays } from '@/builders/api/overview';
import { approvalRowsFromRequests, type FullRequestDTO } from '@/builders/api/requests';
import type { EmployeeDTO } from '@/builders/api/staff';
import { SYSTEM_NOTES, pendingInbox, resolveInboxItem, type InboxItem, type SystemNote } from '@/mock/inbox';
import { overviewView, type OverviewView } from '@/mock/overview';
import { respond } from '@/mock/respond';
import { usePeriodStore } from '@/stores/period';
import { getPayroll } from './admin-payroll';
import { notConnected } from './data-mode';
import { ApiError, api, qs } from './http';
import { changePassword as sessionChangePassword, logout as sessionLogout } from './session';

// ---------- Yêu cầu (GET /requests, PATCH /requests/:id/review) ----------
// Mỗi dòng là một đơn; id = id của đơn. Đọc một lần mọi đơn (BE chưa lọc theo tháng), đếm và lọc tại đây.
const ALL_LIMIT = 1000;

const monthOfView = () => usePeriodStore().month;

/** Mọi đơn (mới nhất trước) của máy chủ. */
export async function listAllRequests(): Promise<FullRequestDTO[]> {
  const res = await api('GET', `/requests${qs({ limit: ALL_LIMIT })}`);
  return Array.isArray(res.items) ? res.items : [];
}

const fetchEmployees = (): Promise<EmployeeDTO[]> =>
  api('GET', '/employees').then(
    r => r.employees || [],
    () => []
  );

// Hồ sơ cho cột loại · bậc của bảng (builders/admin-requests/requests đọc type và levelName).
const staffByOf = (employees: EmployeeDTO[]) =>
  new Map<any, any>(
    employees.map(e => [e.account.username, { type: e.contract.position.type, levelName: `Bậc ${e.contract.position.level}` }])
  );

/** Họ tên và chức danh theo tên đăng nhập và uuid (đơn iSAT lưu theo uuid). */
export function peopleOf(employees: EmployeeDTO[]): Map<string, PersonInfo> {
  const map = new Map<string, PersonInfo>();
  for (const e of employees) {
    const info = { name: e.profile.fullName || e.account.username, title: e.contract.position.jobTitle || '—' };
    map.set(e.account.username, info);
    if (e.profile.uuid) map.set(e.profile.uuid, info);
  }
  return map;
}

async function loadRows() {
  const [requests, employees] = await Promise.all([listAllRequests(), fetchEmployees()]);
  return { raws: approvalRowsFromRequests(requests, peopleOf(employees)), staffBy: staffByOf(employees) };
}

const countOf = (raws: any[]) => ({
  pending: raws.filter(r => r.status === 'pending').length,
  approved: raws.filter(r => r.status === 'approved').length,
  rejected: raws.filter(r => r.status === 'rejected').length
});

const toRow = (raw: any, staffBy: Map<any, any>) => ({ ...buildRequestRow(raw, staffBy), id: raw.requestId });

// params: { tab: 'cho' | 'dong-y' | 'tu-choi' | 'tat-ca', scope: 'thang' | 'moi-thang', kind, q }
export async function getRequests({ tab = 'cho', scope = 'thang', kind = '', q = '' }: any = {}) {
  const month = monthOfView();
  const status = { cho: 'pending', 'dong-y': 'approved', 'tu-choi': 'rejected' }[tab] || 'all';
  const { raws, staffBy } = await loadRows();
  const inMonthRaws = raws.filter(r => r.date.slice(0, 7) === month);
  const listed = raws.filter(r => status === 'all' || r.status === status);
  const shown = sortRaw(listed, tab === 'cho')
    .map(raw => toRow(raw, staffBy))
    .filter(r => matchRow(r, kind, q));
  const result: Record<string, any> = {
    counts: buildCounts({ all: countOf(raws), inMonth: countOf(inMonthRaws), scope, month }),
    kinds: REQUEST_KINDS
  };
  if (tab === 'cho') {
    result.items = shown.filter(r => r.month === month);
    if (scope === 'moi-thang') {
      const older = shown.filter(r => r.month !== month);
      result.older = { items: older.slice(0, OLDER_PAGE), total: older.length };
    }
    return result;
  }
  result.items = shown.filter(r => scope === 'moi-thang' || r.month === month);
  return result;
}

// Trang kế tiếp của các yêu cầu tháng trước đang chờ.
export async function getOlderRequests({ kind = '', q = '', offset = 0 }: any = {}) {
  const month = monthOfView();
  const { raws, staffBy } = await loadRows();
  const older = sortRaw(
    raws.filter(r => r.status === 'pending'),
    true
  )
    .map(raw => toRow(raw, staffBy))
    .filter(r => r.month !== month && matchRow(r, kind, q));
  return { items: older.slice(offset, offset + OLDER_PAGE) };
}

// Duyệt / từ chối nhiều đơn: mỗi đơn một PATCH; đơn đã được người khác xử lý thì dừng và báo "stale".
// Lỗi của máy chủ trả về nguyên văn trong message; showError = true thì hiện thêm thành toast.
async function decide(action?, ids?, note?, showError?) {
  let decided = 0;
  try {
    for (const id of ids) {
      await api('PATCH', `/requests/${encodeURIComponent(id)}/review`, {
        action: action === 'approve' ? 'APPROVE' : 'REJECT',
        ...(note ? { note } : {})
      });
      decided += 1;
    }
    return { ok: true, decided };
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    if (showError) toast.error(e.message);
    const stale = e.status === 404 || e.status === 400;
    return { ok: false, error: stale ? 'stale' : e.code || 'error', message: e.message, decided };
  }
}

export type DecisionVerb = 'approve' | 'reject' | 'remind' | 'declare';

// Việc chờ của lần đọc chuông gần nhất (máy chủ thật), để trả lại việc vừa xử lý cho câu báo.
const lastInbox = new Map<string, InboxItem>();

// Xử lý một việc chờ; mọi nơi gọi qua useShellStore().decide. Trả việc vừa xử lý, hoặc null nếu việc đã được xử lý.
// Dữ liệu giả: bỏ việc khỏi mock/inbox (bốn động từ như nhau). Máy chủ thật: duyệt / từ chối qua
// PATCH /requests/:id/review; "nhắc" và "khai thay" chưa có API.
export async function resolveRequest(id: string, verb: DecisionVerb = 'approve'): Promise<InboxItem | null> {
  if (__MOCK__) return respond(resolveInboxItem(id));
  if (verb !== 'approve' && verb !== 'reject') return notConnected();
  try {
    await api.patch(`/requests/${encodeURIComponent(id)}/review`, { action: verb === 'approve' ? 'APPROVE' : 'REJECT' });
  } catch (e) {
    // 404 hoặc 400 "không còn chờ duyệt": người khác vừa xử lý
    if (e instanceof ApiError && (e.status === 404 || e.status === 400)) return null;
    throw e;
  }
  const hit = lastInbox.get(id) ?? null;
  lastInbox.delete(id);
  return hit ?? ({ id, name: 'nhân viên' } as InboxItem);
}
// Tên cũ giữ nguyên để các màn gọi tới (Yêu cầu, Chấm công) vẫn chạy.
export const approveRequest = (id: string, _opts?: unknown): Promise<InboxItem | null> => resolveRequest(id, 'approve');
export const rejectRequest = (id: string, _opts?: unknown): Promise<InboxItem | null> => resolveRequest(id, 'reject');
export const ALREADY_HANDLED = 'Yêu cầu này đã được xử lý.';
const DECISION_TEXT: Record<DecisionVerb, (name: string) => string> = {
  approve: name => `Đã duyệt yêu cầu của ${name}.`,
  reject: name => `Đã từ chối yêu cầu của ${name}.`,
  remind: name => `Đã nhắc ${name} giải trình.`,
  declare: name => `Đã ghi nhận khai thay cho ${name}.`
};
/** Câu báo sau khi xử lý một việc (spec mục 1.3). */
export const decisionText = (verb: DecisionVerb, name: string) => DECISION_TEXT[verb](name);

// Đồng ý cả loạt: một lần PUT; quá số khoản tối đa hoặc có khoản vừa đổi thì máy chủ từ chối cả loạt.
export const approveRequests = (ids?, { note = '' }: any = {}) => decide('approve', ids, note, false);

// ---------- Tổng quan ----------
// Máy chủ thật: ghép từ bảng lương tháng, nhân sự, bảng công 6 ngày làm việc gần nhất, đơn đang chờ và trạng thái kỳ.
export async function getOverview(month: string): Promise<OverviewView> {
  if (__MOCK__) return respond(overviewView(month));
  const vn = new Date(Date.now() + 7 * 3600000).toISOString();
  const today = vn.slice(0, 10);
  const days = recentWorkdays(today);
  const [payroll, employees, ts, inbox] = await Promise.all([
    getPayroll(month),
    fetchEmployees(),
    api('GET', `/attendance/timesheets${qs({ startDate: days[0], endDate: today })}`),
    getInbox()
  ]);
  return overviewFrom({
    month,
    today,
    now: vn.slice(11, 16),
    payroll,
    employees,
    timesheets: ts.timesheets || [],
    approvals: inbox.items,
    periodState: usePeriodStore().strip.state
  });
}

// ---------- Lớp nổi của vỏ Admin ----------
// Chuông: mọi việc còn chờ. Dữ liệu giả kèm 3 tin hệ thống tĩnh; máy chủ thật chưa có tin hệ thống.
const INBOX_LIMIT = 200;
export async function getInbox(): Promise<{ items: InboxItem[]; notes: SystemNote[] }> {
  if (__MOCK__) return respond({ items: pendingInbox(), notes: SYSTEM_NOTES });
  const [res, people] = await Promise.all([
    api.get(`/requests${qs({ status: 'PENDING', limit: INBOX_LIMIT })}`),
    peopleIndex()
  ]);
  const items = inboxFromRequests(res.items || [], people, Date.now());
  lastInbox.clear();
  for (const item of items) lastInbox.set(item.id, item);
  return { items, notes: [] };
}

/** Số việc đang chờ (số trên chuông). */
export async function countPending(): Promise<number> {
  const res = await api.get(`/requests${qs({ status: 'PENDING', limit: 1 })}`);
  return Number(res.total) || 0;
}

// Họ tên và chức danh theo tên đăng nhập và uuid (đơn iSAT lưu theo uuid).
async function peopleIndex(): Promise<Map<string, PersonInfo>> {
  return peopleOf(await fetchEmployees());
}

export const changePassword = ({ current, next }: any) => sessionChangePassword(current, next);

export const logout = () => sessionLogout();
