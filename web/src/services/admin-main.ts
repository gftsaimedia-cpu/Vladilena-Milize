// Dịch vụ của nhóm admin-main: Tổng quan, Yêu cầu và các lớp nổi của vỏ Admin.
// Yêu cầu chờ duyệt, Tổng quan và chuông gọi máy chủ qua api().
import { toast } from '@/components/shell/toast';
import { buildBell, buildOverview } from '@/builders/admin-main/overview';
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
import { usePeriodStore } from '@/stores/period';
import { useSessionStore } from '@/stores/session';
import { countWaiting } from '@/builders/admin-requests/explanations';
import { listWaitingExplanations } from './admin-explanations';
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

export const approveRequest = (id?, { reason = '' }: any = {}) => decide('approve', [id], reason, true);
export const rejectRequest = (id?, { reason = '' }: any = {}) => decide('reject', [id], reason, true);

// Đồng ý cả loạt: một lần PUT; quá số khoản tối đa hoặc có khoản vừa đổi thì máy chủ từ chối cả loạt.
export const approveRequests = (ids?, { note = '' }: any = {}) => decide('approve', ids, note, false);

// ---------- Tổng quan ----------
export async function getOverview(month?) {
  const session = useSessionStore();
  const soft = (p?) => p.catch(() => null);
  const [pending, waiting, alerts, staff, today, period, periods, estimates, holidays] = await Promise.all([
    fetchApprovals({ status: 'pending', month: '' }),
    listWaitingExplanations(),
    soft(api('GET', '/alerts' + qs({ month }))),
    soft(api('GET', '/staff')),
    soft(api('GET', '/today')),
    soft(api('GET', `/periods/${month}`)),
    soft(api('GET', '/periods')),
    soft(api('GET', `/periods/${month}/estimates` + qs({ page: 1, pageSize: 1 }))),
    soft(api('GET', '/holidays'))
  ]);
  remember(pending.items);
  const by = staffIndex(staff && staff.staff);
  return buildOverview({
    month,
    serverNow: session.serverNow,
    requests: sortRaw(pending.items, true).map(raw => buildRequestRow(raw, by)),
    explanations: countWaiting(waiting, month),
    alerts,
    staff: staff && staff.staff,
    today,
    period,
    paydayExpected: periods && (periods.periods || []).find(p => p.month === month)?.paydayExpected,
    estimates,
    holidays: holidays && holidays.dates
  });
}

// ---------- Lớp nổi của vỏ Admin ----------
// Việc cần xử lý trên chuông: yêu cầu chờ duyệt (mọi tháng), giải trình chờ xử lý (mọi tháng) và ngày quên Check-in/out của tháng đang xem (GET /alerts).
export async function getBell() {
  const month = monthOfView();
  const [alerts, waiting] = await Promise.all([api('GET', '/alerts' + qs({ month })), listWaitingExplanations()]);
  return buildBell({ month, alerts, explanations: countWaiting(waiting) });
}

export const changePassword = ({ current, next }: any) => sessionChangePassword(current, next);

export const logout = () => sessionLogout();
