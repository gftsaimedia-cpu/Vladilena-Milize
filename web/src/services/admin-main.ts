// Dịch vụ của nhóm admin-main: Tổng quan, Yêu cầu và các lớp nổi của vỏ Admin.
// Tổng quan, chuông và xử lý việc chờ chạy trên dữ liệu giả (mock/); danh sách Yêu cầu còn gọi api() (chưa có dữ liệu giả).
import { toast } from '@/components/shell/toast';
import {
  OLDER_PAGE,
  REQUEST_KINDS,
  buildCounts,
  buildRequestRow,
  idOf,
  matchRow,
  sortRaw,
  staffIndex
} from '@/builders/admin-requests/requests';
import { SYSTEM_NOTES, pendingInbox, resolveInboxItem, type InboxItem, type SystemNote } from '@/mock/inbox';
import { overviewView, type OverviewView } from '@/mock/overview';
import { respond } from '@/mock/respond';
import { usePeriodStore } from '@/stores/period';
import { ApiError, api, qs } from './http';
import { changePassword as sessionChangePassword, logout as sessionLogout } from './session';

// ---------- Yêu cầu chờ duyệt (GET /approvals, PUT /approvals/decide) ----------
// Mỗi dòng là một khoản tự khai (nhân sự, ngày); id = 'username|date'. rev và fingerprint của lần tải gần nhất giữ ở
// versions để gửi kèm khi duyệt (khoá đồng thời): khoản vừa bị đổi thì máy chủ trả 409 và danh sách tải lại.
const PAGE = 500;
const MAX_PAGES = 40;
const versions = new Map<any, any>();

const monthOfView = () => usePeriodStore().month;

// Đọc hết các trang của GET /approvals. month rỗng = mọi tháng. Trả { items, counts } (counts theo tháng, không theo status).
async function fetchApprovals({ status, month }: any) {
  const items: any[] = [];
  let counts = { pending: 0, approved: 0, rejected: 0 };
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const data = await api('GET', '/approvals' + qs({ status, month, limit: PAGE, offset: page * PAGE }));
    const batch = Array.isArray(data.items) ? data.items : [];
    items.push(...batch);
    counts = data.counts || counts;
    if (batch.length < PAGE) break;
  }
  return { items, counts };
}
const fetchCounts = async (month?) =>
  (await api('GET', '/approvals' + qs({ status: 'all', month, limit: 1, offset: 0 }))).counts;
const fetchStaff = () =>
  api('GET', '/staff').then(
    r => r.staff || [],
    () => []
  );

function remember(items?) {
  for (const row of items) versions.set(idOf(row), { rev: row.rev, fingerprint: row.fingerprint });
}

// params: { tab: 'cho' | 'dong-y' | 'tu-choi' | 'tat-ca', scope: 'thang' | 'moi-thang', kind, q }
export async function getRequests({ tab = 'cho', scope = 'thang', kind = '', q = '' }: any = {}) {
  const month = monthOfView();
  const status = { cho: 'pending', 'dong-y': 'approved', 'tu-choi': 'rejected' }[tab] || 'all';
  const wholeList = tab === 'cho' || scope === 'moi-thang';
  const [list, all, inMonth, staff] = await Promise.all([
    fetchApprovals({ status, month: wholeList ? '' : month }),
    fetchCounts(''),
    fetchCounts(month),
    fetchStaff()
  ]);
  remember(list.items);
  const by = staffIndex(staff);
  const shown = sortRaw(list.items, tab === 'cho')
    .map(raw => buildRequestRow(raw, by))
    .filter(r => matchRow(r, kind, q));
  const result: Record<string, any> = { counts: buildCounts({ all, inMonth, scope, month }), kinds: REQUEST_KINDS };
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
  const [list, staff] = await Promise.all([fetchApprovals({ status: 'pending', month: '' }), fetchStaff()]);
  remember(list.items);
  const by = staffIndex(staff);
  const older = sortRaw(list.items, true)
    .map(raw => buildRequestRow(raw, by))
    .filter(r => r.month !== month && matchRow(r, kind, q));
  return { items: older.slice(offset, offset + OLDER_PAGE) };
}

// Phiên bản (rev, fingerprint) của một yêu cầu: lần tải gần nhất, thiếu thì hỏi lại máy chủ.
async function versionOf(id?) {
  if (versions.has(id)) return versions.get(id);
  const [username, date] = id.split('|');
  const data = await api(
    'GET',
    '/approvals' + qs({ status: 'all', month: date.slice(0, 7), user: username, limit: PAGE })
  );
  remember(data.items || []);
  return versions.get(id) || null;
}

const ERROR_KEY = { APPROVAL_STALE: 'stale', APPROVAL_NOOP: 'stale', APPROVAL_NOT_FOUND: 'stale' };

// Gửi một quyết định cho nhiều yêu cầu trong một lần PUT (máy chủ lưu cả loạt hoặc không lưu gì).
// Lỗi của máy chủ trả về nguyên văn trong message; showError = true thì hiện thêm thành toast.
async function decide(action?, ids?, note?, showError?) {
  try {
    const items: any[] = [];
    for (const id of ids) {
      const v = await versionOf(id);
      if (!v) throw new ApiError(404, 'Có khoản không còn trong danh sách chờ duyệt', { code: 'APPROVAL_NOT_FOUND' });
      const [username, date] = id.split('|');
      items.push({ username, date, rev: v.rev, fingerprint: v.fingerprint });
    }
    const res = await api('PUT', '/approvals/decide', { action, ...(note ? { note } : {}), items });
    for (const id of ids) versions.delete(id);
    return { ok: true, decided: res.decided };
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    if (showError) toast.error(e.message);
    return { ok: false, error: ERROR_KEY[e.code] || e.code || 'error', message: e.message };
  }
}

// Xử lý một việc chờ trên dữ liệu giả (mock/inbox): bỏ việc khỏi danh sách, trả việc vừa bỏ hoặc null nếu đã bị xử lý.
// Duyệt, từ chối, nhắc và khai thay giống nhau ở đây; mọi nơi gọi qua useShellStore().decide.
export const resolveRequest = (id: string): Promise<InboxItem | null> => respond(resolveInboxItem(id));
// Tên cũ giữ nguyên để các màn gọi tới (Yêu cầu, Chấm công) vẫn chạy; tham số thứ hai bị bỏ qua.
export const approveRequest = (id: string, _opts?: unknown): Promise<InboxItem | null> => resolveRequest(id);
export const rejectRequest = (id: string, _opts?: unknown): Promise<InboxItem | null> => resolveRequest(id);

export type DecisionVerb = 'approve' | 'reject' | 'remind' | 'declare';
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
export const getOverview = (month: string): Promise<OverviewView> => respond(overviewView(month));

// ---------- Lớp nổi của vỏ Admin ----------
// Chuông: mọi việc còn chờ cùng 3 tin hệ thống tĩnh (mock/inbox).
export const getInbox = (): Promise<{ items: InboxItem[]; notes: SystemNote[] }> =>
  respond({ items: pendingInbox(), notes: SYSTEM_NOTES });

export const changePassword = ({ current, next }: any) => sessionChangePassword(current, next);

export const logout = () => sessionLogout();
