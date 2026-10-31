// Máy chủ giả của nhóm admin-main: giữ trạng thái trong bộ nhớ để duyệt yêu cầu, bỏ qua cảnh báo
// có tác dụng giữa các màn (Tổng quan, Yêu cầu, Trợ lý AI). Khi nối máy chủ thật thì xoá file này.
import { ANSWERS, QUESTIONS } from './assistant.js';
import { OVERVIEW } from './overview.js';
import { BELL } from './shell.js';
import {
  BASE_COUNTS,
  BULK_LIMIT,
  CURRENT,
  CURRENT_MONTH,
  DECIDED,
  OLDER,
  OLDER_PAGE,
  REQUEST_KINDS
} from './requests.js';
import { WARNINGS, WARNING_META } from './warnings.js';

const state = {
  requests: structuredClone([...CURRENT, ...OLDER, ...DECIDED]),
  warnings: structuredClone(WARNINGS),
  counts: { ...BASE_COUNTS }
};

const warningOf = id => state.warnings.find(w => w.id === id);
const openWarnings = r => r.warningIds.filter(id => warningOf(id)?.status !== 'skipped');
const isOlder = r => r.month !== CURRENT_MONTH;

function toItem(r) {
  const open = openWarnings(r);
  return {
    id: r.id,
    name: r.name,
    type: r.type,
    position: r.position,
    kind: r.kind,
    date: r.date,
    detail: r.detail,
    sentAt: r.sentAt,
    month: r.month,
    status: r.status,
    impact: r.impact,
    lateNote: r.lateNote,
    aiChecked: !isOlder(r),
    warningCount: open.length,
    aiSummary: open.length ? r.aiSummary : ''
  };
}

function counts() {
  const c = state.counts;
  const pending = c.pendingMonth + c.pendingOlder;
  return {
    currentMonth: CURRENT_MONTH,
    pending,
    pendingMonth: c.pendingMonth,
    pendingOlder: c.pendingOlder,
    approved: c.approved,
    rejected: c.rejected,
    all: pending + c.approved + c.rejected
  };
}

const matches = (r, kind, q) =>
  (!kind || r.kind === kind) && (!q || r.name.toLowerCase().includes(String(q).trim().toLowerCase()));

export function listRequests({ tab = 'cho', scope = 'thang', kind = '', q = '' } = {}) {
  const base = state.requests.filter(r => matches(r, kind, q));
  const result = { counts: counts(), kinds: REQUEST_KINDS };
  if (tab === 'cho') {
    const pending = base.filter(r => r.status === 'cho');
    result.items = pending.filter(r => !isOlder(r)).map(toItem);
    if (scope === 'moi-thang') {
      const older = pending.filter(isOlder);
      result.older = {
        items: older.slice(0, OLDER_PAGE).map(toItem),
        total: kind || q ? older.length : state.counts.pendingOlder
      };
    }
    return result;
  }
  const byTab = base.filter(r => (tab === 'tat-ca' ? true : r.status === tab));
  const byScope = scope === 'thang' ? byTab.filter(r => !isOlder(r)) : byTab;
  result.items = byScope.map(toItem);
  return result;
}

export function listOlder({ kind = '', q = '', offset = 0 } = {}) {
  const older = state.requests.filter(r => r.status === 'cho' && isOlder(r) && matches(r, kind, q));
  return { items: older.slice(offset, offset + OLDER_PAGE).map(toItem) };
}

export function requestReasons(id) {
  const r = state.requests.find(x => x.id === id);
  if (!r) return null;
  return {
    request: toItem(r),
    warnings: openWarnings(r).map(wid => fullWarning(warningOf(wid)))
  };
}

function decide(ids, status) {
  const rows = ids.map(id => state.requests.find(r => r.id === id));
  if (rows.some(r => !r || r.status !== 'cho')) return { ok: false, error: 'stale' };
  for (const r of rows) {
    r.status = status;
    state.counts[isOlder(r) ? 'pendingOlder' : 'pendingMonth'] -= 1;
    state.counts[status === 'dong-y' ? 'approved' : 'rejected'] += 1;
  }
  return { ok: true, counts: counts() };
}

export const approve = id => decide([id], 'dong-y');
export const reject = id => decide([id], 'tu-choi');
export function approveMany(ids) {
  if (!ids.length || ids.length > BULK_LIMIT) return { ok: false, error: 'limit' };
  // Yêu cầu có cảnh báo AI không đồng ý cả loạt được
  const warned = ids.some(id => {
    const r = state.requests.find(x => x.id === id);
    return r && openWarnings(r).length;
  });
  return warned ? { ok: false, error: 'stale' } : decide(ids, 'dong-y');
}

// ---------- Cảnh báo AI ----------
const listItem = w => ({
  id: w.id,
  level: w.level,
  rule: w.rule,
  thresholdLabel: w.thresholdLabel,
  person: w.person,
  text: w.text,
  money: w.money ?? null,
  fixTo: w.fixTo,
  status: w.status || 'open'
});

function fullWarning(w) {
  return { ...listItem(w), detail: w.detail };
}

export function listWarnings({ status = 'open', rule = '', page = 1 } = {}) {
  const open = state.warnings.filter(w => w.status !== 'skipped').length;
  const all = state.warnings.length;
  const rules = [...new Set(state.warnings.map(w => w.rule))];
  const filtered = state.warnings.filter(
    w => (status === 'all' || (status === 'skipped') === (w.status === 'skipped')) && (!rule || w.rule === rule)
  );
  const size = WARNING_META.pageSize;
  const pages = Math.max(1, Math.ceil(filtered.length / size));
  const p = Math.min(Math.max(1, page), pages);
  return {
    items: filtered.slice((p - 1) * size, p * size).map(listItem),
    total: filtered.length,
    page: p,
    pages,
    pageSize: size,
    counts: { open, skipped: all - open, all },
    rules,
    meta: WARNING_META
  };
}

export const getWarning = id => (warningOf(id) ? fullWarning(warningOf(id)) : null);

export function skipWarning(id) {
  const w = warningOf(id);
  if (!w) return { ok: false };
  w.status = 'skipped';
  return { ok: true };
}

export function assistantAnswer(key) {
  const known = ANSWERS[key] ? key : 'thieu-gi';
  return { questions: QUESTIONS, key: known, answer: ANSWERS[known] };
}

// ---------- Tổng quan ----------
export function overview() {
  const c = counts();
  const pendingMonth = state.requests.filter(r => r.status === 'cho' && !isOlder(r)).map(toItem);
  const warned = pendingMonth.filter(r => r.warningCount).length;
  const rows = OVERVIEW.blockers.rows.map(r =>
    r.key === 'requests'
      ? {
          ...r,
          count: c.pendingMonth,
          sub: warned ? `${warned} yêu cầu có cảnh báo AI, cần xem từng cái` : 'Không có yêu cầu nào có cảnh báo AI'
        }
      : { ...r }
  );
  const alerts = state.warnings.filter(w => w.status !== 'skipped' && w.level === 'Cao').slice(0, 4);
  return {
    month: OVERVIEW.month,
    closeOn: OVERVIEW.closeOn,
    daysLeft: OVERVIEW.daysLeft,
    blocking: rows.filter(r => r.blocking && r.count > 0).length,
    blockers: { ...OVERVIEW.blockers, rows },
    approvals: { total: c.pending, month: c.pendingMonth, items: pendingMonth.slice(0, 5) },
    kpis: OVERVIEW.kpis,
    alerts: {
      open: state.warnings.filter(w => w.status !== 'skipped').length,
      items: alerts.map(w => ({
        id: w.id,
        level: w.level,
        rule: `${w.brief?.rule || w.rule} · ${w.thresholdLabel}`,
        text: w.brief?.text || `${w.person} · ${w.text}`,
        fixTo: w.fixTo
      }))
    },
    upcoming: OVERVIEW.upcoming
  };
}

export const bell = () => structuredClone(BELL);
