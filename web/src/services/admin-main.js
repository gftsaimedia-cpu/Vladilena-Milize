// Dịch vụ của nhóm admin-main: Tổng quan, Yêu cầu, Trợ lý AI và các lớp nổi của vỏ Admin.
// Yêu cầu chờ duyệt, Tổng quan, chuông, Trợ lý AI và cảnh báo AI của yêu cầu gọi máy chủ qua api().
import { toast } from '@/components/shell/toast.js';
import { buildBell, buildOverview } from '@/builders/admin-main/overview.js';
import {
  OLDER_PAGE,
  REQUEST_KINDS,
  buildCounts,
  buildRequestRow,
  idOf,
  matchRow,
  sortRaw,
  staffIndex
} from '@/builders/admin-requests/requests.js';
import { usePeriodStore } from '@/stores/period.js';
import { useSessionStore } from '@/stores/session.js';
import { countWaiting } from '@/builders/admin-requests/explanations.js';
import { listWaitingExplanations } from './admin-explanations.js';
import { ApiError, api, qs } from './http.js';
import { mockSave } from './mock.js';

// ---------- Yêu cầu chờ duyệt (GET /approvals, PUT /approvals/decide) ----------
// Mỗi dòng là một khoản tự khai (nhân sự, ngày); id = 'username|date'. rev và fingerprint của lần tải gần nhất giữ ở
// versions để gửi kèm khi duyệt (khoá đồng thời): khoản vừa bị đổi thì máy chủ trả 409 và danh sách tải lại.
const PAGE = 500;
const MAX_PAGES = 40;
const versions = new Map();

const monthOfView = () => usePeriodStore().month;

// Đọc hết các trang của GET /approvals. month rỗng = mọi tháng. Trả { items, counts } (counts theo tháng, không theo status).
async function fetchApprovals({ status, month }) {
  const items = [];
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
const fetchCounts = async month =>
  (await api('GET', '/approvals' + qs({ status: 'all', month, limit: 1, offset: 0 }))).counts;
const fetchStaff = () =>
  api('GET', '/staff').then(
    r => r.staff || [],
    () => []
  );

function remember(items) {
  for (const row of items) versions.set(idOf(row), { rev: row.rev, fingerprint: row.fingerprint });
}

// params: { tab: 'cho' | 'dong-y' | 'tu-choi' | 'tat-ca', scope: 'thang' | 'moi-thang', kind, q }
export async function getRequests({ tab = 'cho', scope = 'thang', kind = '', q = '' } = {}) {
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
  const result = { counts: buildCounts({ all, inMonth, scope, month }), kinds: REQUEST_KINDS };
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
export async function getOlderRequests({ kind = '', q = '', offset = 0 } = {}) {
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
async function versionOf(id) {
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
async function decide(action, ids, note, showError) {
  try {
    const items = [];
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

export const approveRequest = (id, { reason = '' } = {}) => decide('approve', [id], reason, true);
export const rejectRequest = (id, { reason = '' } = {}) => decide('reject', [id], reason, true);

// Đồng ý cả loạt: một lần PUT; quá số khoản tối đa hoặc có khoản vừa đổi thì máy chủ từ chối cả loạt.
export const approveRequests = (ids, { note = '' } = {}) => decide('approve', ids, note, false);

// ---------- Tổng quan ----------
export async function getOverview(month) {
  const session = useSessionStore();
  const soft = p => p.catch(() => null);
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

// ---------- Cảnh báo AI (GET /ai/review, POST /ai/findings/dismiss) ----------
// Mỗi phát hiện của máy chủ thành một cảnh báo: mức = severity, người = names[username], nội dung = message,
// chỉ số = evidence.inputs, ngưỡng = evidence.threshold (đề xuất hay đã chốt theo cờ proposal), đã bỏ qua = dismissed.
const WARNING_PAGE = 10;
const LEVEL = { high: 'Cao', medium: 'Trung bình', low: 'Thấp' };
const RANK = { high: 0, medium: 1, low: 2 };
const THRESHOLD_SKIP = new Set(['basis', 'proposal', 'sources']);

const agentsOn = () => useSessionStore().agentsEnabled;
const reviewOf = month => api('GET', '/ai/review' + qs({ month }));
const text = v => (Array.isArray(v) ? v.join(', ') : v != null && typeof v === 'object' ? JSON.stringify(v) : v);

function warningOf(f, review) {
  const t = f.evidence?.threshold || {};
  const criteria = Object.entries(t)
    .filter(([k]) => !THRESHOLD_SKIP.has(k))
    .map(([k, v]) => ({ text: k, value: text(v), kind: t.proposal ? 'de-xuat' : 'da-chot' }));
  if (t.basis) criteria.push({ text: t.basis });
  const to = f.username ? '/admin/nhan-su' : '/admin/bang-luong';
  return {
    id: f.id,
    severity: f.severity,
    level: LEVEL[f.severity] || LEVEL.medium,
    rule: f.rule,
    thresholdLabel: t.proposal ? 'Ngưỡng đề xuất' : 'Ngưỡng đã chốt',
    person: f.username ? review.names?.[f.username] || f.username : 'Cả hệ thống',
    text: f.message,
    money: null,
    fixTo: to,
    status: f.dismissed ? 'skipped' : 'open',
    username: f.username,
    date: f.date,
    item: f.item,
    detail: {
      month: f.month,
      fact: f.message,
      factMoney: null,
      metrics: Object.entries(f.evidence?.inputs || {}).map(([k, v]) => ({ label: k, value: text(v) })),
      criteria,
      link: { label: f.username ? 'Mở hồ sơ' : 'Mở bảng lương', to }
    }
  };
}

async function warningsOf(month) {
  const review = await reviewOf(month);
  const list = (review.findings || []).concat(review.systemFindings || []).map(f => warningOf(f, review));
  list.sort((a, b) => (RANK[a.severity] ?? 1) - (RANK[b.severity] ?? 1));
  return { review, list };
}

// Cảnh báo AI của một yêu cầu (ngăn kéo "Lý do AI cảnh báo"): các phát hiện cùng người, cùng ngày của yêu cầu id = 'username|date'.
export async function getRequestReasons(id) {
  if (!agentsOn()) return null;
  const [username, date] = String(id).split('|');
  const { list } = await warningsOf(String(date).slice(0, 7));
  const mine = list.filter(w => w.username === username && w.date === date && w.status !== 'skipped');
  return {
    request: { name: mine[0]?.person || username, kind: mine[0]?.item || '', date, detail: mine[0]?.text || '', sentAt: '' },
    warnings: mine
  };
}

// ---------- Trợ lý AI ----------
// params: { status: 'open' | 'skipped' | 'all', rule, page }; lọc và chia trang ở máy khách trên kết quả của kỳ đang xem.
export async function getWarnings({ status = 'open', rule = '', page = 1 } = {}) {
  const { review, list } = await warningsOf(monthOfView());
  const open = list.filter(w => w.status !== 'skipped').length;
  const filtered = list.filter(
    w => (status === 'all' || (status === 'skipped') === (w.status === 'skipped')) && (!rule || w.rule === rule)
  );
  const pages = Math.max(1, Math.ceil(filtered.length / WARNING_PAGE));
  const p = Math.min(Math.max(1, page), pages);
  const skipped = review.checked?.skipped || [];
  return {
    items: filtered.slice((p - 1) * WARNING_PAGE, p * WARNING_PAGE),
    total: filtered.length,
    page: p,
    pages,
    pageSize: WARNING_PAGE,
    counts: { open, skipped: list.length - open, all: list.length },
    rules: [...new Set(list.map(w => w.rule))],
    meta: {
      rulesChecked: review.checked?.rules ?? 0,
      people: review.checked?.staff ?? 0,
      computedAt: review.asOf || '',
      pageSize: WARNING_PAGE,
      notice: skipped.length ? { text: `${skipped.length} quy tắc chưa chạy: ${skipped[0].reason}` } : null
    }
  };
}

export async function getWarning(id) {
  const { list } = await warningsOf(monthOfView());
  return list.find(w => w.id === id) || null;
}

// Bỏ qua một cảnh báo: POST /ai/findings/dismiss { month, username, rule }
export async function skipWarning(id) {
  const { list } = await warningsOf(monthOfView());
  const w = list.find(x => x.id === id);
  if (!w) return { ok: false };
  await api('POST', '/ai/findings/dismiss', { month: monthOfView(), username: w.username, rule: w.rule });
  return { ok: true };
}

// "Còn thiếu gì trước khi chốt công?" lấy từ checklist của GET /ai/review; máy chủ chưa có câu hỏi dựng sẵn nào khác.
export async function getAssistantAnswer() {
  const review = await reviewOf(monthOfView());
  const rows = (review.checklist || []).map(it => ({ count: it.count, text: it.label, attention: it.status === 'attention' }));
  const todo = rows.filter(r => r.attention).length;
  return {
    questions: [{ key: 'thieu-gi', label: 'Còn thiếu gì trước khi chốt công?', soon: false }],
    key: 'thieu-gi',
    answer: {
      title: todo ? `Còn ${todo} việc trước khi chốt công` : 'Không còn việc nào trước khi chốt công',
      sub: '',
      groups: [{ label: '', rows }],
      source: '',
      computedAt: review.asOf || ''
    }
  };
}

// ---------- Lớp nổi của vỏ Admin ----------
// Việc cần xử lý trên chuông: yêu cầu chờ duyệt (mọi tháng), giải trình chờ xử lý (mọi tháng) và ngày quên Check-in/out của tháng đang xem (GET /alerts).
export async function getBell() {
  const month = monthOfView();
  const [alerts, waiting] = await Promise.all([api('GET', '/alerts' + qs({ month })), listWaitingExplanations()]);
  return buildBell({ month, alerts, explanations: countWaiting(waiting) });
}

// Nối máy chủ: POST /api/me/password  { current, next }
// eslint-disable-next-line no-unused-vars
export const changePassword = ({ current, next }) => mockSave({}, 300);

// Nối máy chủ: POST /api/auth/logout
export const logout = () => mockSave();
