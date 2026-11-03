// Dịch vụ Bảng lương và các bước của kỳ lương (chốt công → tính lương → AI kiểm tra → phê duyệt → trả lương).
// Kỳ, bảng lương, các bước kỳ, phát hiện của AI, duyệt phiếu và khoản điền thêm gọi máy chủ qua api().
import { buildCloseChecks, buildPeriodView } from '../builders/admin-payroll/payroll';
import { api } from './http';

const err = (message?) => Promise.reject(new Error(message));
const enc = encodeURIComponent;
const qs = (obj?) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) if (v !== '' && v !== undefined && v !== null) q.set(k, String(v));
  const text = q.toString();
  return text ? '?' + text : '';
};

// Khoá đi kèm mỗi thao tác: rev của kỳ và rev từng phiếu lấy từ lần tải gần nhất.
const periodRev = new Map<any, any>();
const slipRev = new Map<any, any>();
const freshRev = async (month?) => {
  const period = await api('GET', `/periods/${enc(month)}`);
  periodRev.set(month, period.rev);
  return period;
};
const PAGE = 14;
const PAGE_WIDE = 9;
const CHIP_STATUS = { pending: 'draft', approved: 'approved', draft: 'draft', err: 'error', excluded: 'error' };
const CHIP_TYPE = { tts: 'tts', ctv: 'ctv', nv: 'nv' };

// ---- Bảng lương ----

/**
 * Bảng lương một kỳ: thanh kỳ lương, số tổng, dải công thức, ô lọc, dòng bảng, phân trang.
 * opts: { wide, filter, q, page }
 */
// GET /api/periods/:month, rồi /payslips (đã có lần tính) hoặc /estimates (chưa tính)
export async function getPayroll(month?, opts: any = {}) {
  const period = await api('GET', `/periods/${enc(month)}`);
  periodRev.set(month, period.rev);
  const source = period.run ? 'payslips' : 'estimates';
  const pageSize = opts.wide ? PAGE_WIDE : PAGE;
  const filter = opts.filter || 'all';
  const list = await api(
    'GET',
    `/periods/${enc(month)}/${source}` +
      qs({
        q: (opts.q || '').trim(),
        status: source === 'payslips' ? CHIP_STATUS[filter] : '',
        type: CHIP_TYPE[filter],
        page: opts.page || 1,
        pageSize
      })
  );
  for (const row of list.rows) slipRev.set(`${month}|${row.username}`, row.rev);
  return buildPeriodView(month, period, list, { filter, pageSize });
}

// ---- Chốt công ----

// GET /api/periods/:month → checklist của kỳ
export async function getCloseChecks(month?) {
  const period = await freshRev(month);
  return buildCloseChecks(period);
}

// POST /api/periods/:month/lock-attendance  { rev, acknowledge: [mã mục], reason }
export async function closeHours(month?, { skipped = [], reason = '' }: any = {}) {
  const rev = periodRev.has(month) ? periodRev.get(month) : (await freshRev(month)).rev;
  const body: Record<string, any> = { rev };
  if (skipped.length) body.acknowledge = skipped;
  if (reason.trim()) body.reason = reason.trim();
  return step(month, 'lock-attendance', body);
}

const step = async (month?, name?, body?) => {
  const out = await api('POST', `/periods/${enc(month)}/${name}`, body);
  periodRev.delete(month);
  return { ok: true, ...(out && typeof out === 'object' ? out : {}) };
};
const currentRev = async (month?) => (periodRev.has(month) ? periodRev.get(month) : (await freshRev(month)).rev);

// POST /api/periods/:month/reopen  { rev, to, reason }
// step: 'hours' → open · 'draft' → calculated (đang chờ phê duyệt) · 'approval' → calculated
export async function reopenStep(month?, stepKey?, reason = '') {
  const period = await freshRev(month);
  const to = stepKey === 'hours' ? 'open' : period.status === 'calculated' ? 'attendance_locked' : 'calculated';
  return step(month, 'reopen', { rev: period.rev, to, reason });
}

// ---- Tính lương ----

// POST /api/periods/:month/calculate  { rev }  (mỗi lần tạo một bản nháp mới)
export async function calculate(month?) {
  return step(month, 'calculate', { rev: await currentRev(month) });
}

// GET /api/periods/:month/verify → { checked, mismatched: [tài khoản], engineChanged, runNo } (cần audit.read)
export function verifyPeriod(month?) {
  return api('GET', `/periods/${enc(month)}/verify`);
}

// ---- Phê duyệt ----

// PUT /api/periods/:month/payslips/decide  { action, items: [{ username, rev }] }  (tối đa 200 phiếu mỗi lần)
async function decide(month?, action?, usernames?, extra: any = {}) {
  const items = usernames.map(username => ({ username, rev: slipRev.get(`${month}|${username}`) }));
  const out = await api('PUT', `/periods/${enc(month)}/payslips/decide`, { action, ...extra, items });
  periodRev.delete(month);
  for (const it of out && Array.isArray(out.items) ? out.items : []) slipRev.set(`${month}|${it.username}`, it.rev);
  return { ok: true, ...(out && typeof out === 'object' ? out : {}), count: items.length };
}

// others: số phiếu đã chọn ở trang khác → lấy thêm các phiếu chờ phê duyệt không có cờ AI
export async function approveBatch(month?, usernames?, others = 0) {
  if (!usernames.length && !others) return err('Chưa chọn phiếu nào');
  const names = new Set<any>(usernames);
  if (others) {
    const more = await api(
      'GET',
      `/periods/${enc(month)}/payslips` + qs({ status: 'pending', flag: '0', pageSize: 200 })
    );
    for (const row of more.rows) {
      slipRev.set(`${month}|${row.username}`, row.rev);
      names.add(row.username);
    }
  }
  return decide(month, 'approve', [...names]);
}

export function returnPayslips(month?, usernames?) {
  return decide(month, 'return', usernames);
}

// PUT /api/periods/:month/payslips/decide  { action: 'approve', note, items: [{ username, rev }] }
// (note từ 10 ký tự; máy chủ đòi bỏ qua hết cảnh báo AI của phiếu)
export function approveOne(month?, username?, note?) {
  if ((note || '').trim().length < 10) return err('Ghi chú phê duyệt cần từ 10 ký tự');
  return decide(month, 'approve', [username], { note: note.trim() });
}

// GET /api/periods/:month, lặp /payslips?status=error lấy toàn bộ phiếu lỗi để người dùng điền lý do loại khỏi kỳ
export async function getPeriodApprovalSummary(month: string): Promise<{
  rev: number;
  draft: number;
  legacyPending: number;
  approved: number;
  errors: Array<{ username: string; name: string; shortProblem: string }>;
}> {
  const period = await api('GET', `/periods/${enc(month)}`);
  periodRev.set(month, period.rev);
  const t = period.totals || {};
  const errors: Array<{ username: string; name: string; shortProblem: string }> = [];
  let page = 1;
  while (true) {
    const list = await api(
      'GET',
      `/periods/${enc(month)}/payslips` + qs({ status: 'error', pageSize: 200, page })
    );
    const rows = list.rows || [];
    for (const r of rows) {
      errors.push({
        username: r.username,
        name: r.name || r.username,
        shortProblem: r.errorMessage || r.problem || 'Hồ sơ hoặc công chưa hợp lệ'
      });
    }
    if (!rows.length || errors.length >= (list.total ?? rows.length) || rows.length < 200) {
      break;
    }
    page++;
  }
  return {
    rev: period.rev,
    draft: t.draft || 0,
    legacyPending: t.pending || 0,
    approved: t.approved || 0,
    errors
  };
}

// POST /api/periods/:month/approve  { rev, excludeErrors }
export async function approvePeriod(
  month: string,
  opts?: { rev?: number; excludeErrors?: Array<{ username: string; reason: string }> }
) {
  const rev = opts?.rev ?? (await currentRev(month));
  const excludeErrors = opts?.excludeErrors || [];
  return step(month, 'approve', {
    rev,
    ...(excludeErrors.length ? { excludeErrors } : {})
  });
}

// POST /api/periods/:month/mark-paid  { rev, paidAt: 'YYYY-MM-DD', reference }
export async function markPaid(month?, { date, ref = '' }: any = {}) {
  if (!date) return err('Chưa chọn ngày trả lương');
  return step(month, 'mark-paid', { rev: await currentRev(month), paidAt: date, reference: ref });
}

// ---- Khoản cộng/trừ thêm ----

const EXTRA_STATUS = { void: 'cancelled' };
// Người thuộc bảng lương từ GET /api/staff (khoản thêm của máy chủ chỉ có username)
const staffList = async () => ((await api('GET', '/staff')).staff || []).filter(p => p.payrollSubject);

/**
 * { counts: { all, pending, approved, rejected, cancelled },
 *   items: [{ id, username, name, label, kind, amount, status }] }
 */
// GET /api/pay-entries?month=
export async function getExtras(month?) {
  const [out, people] = await Promise.all([api('GET', '/pay-entries' + qs({ month })), staffList().catch(() => [])]);
  const names = new Map<any, any>(people.map(p => [p.username, p.name]));
  const items = (out.entries || []).map(e => ({
    id: e.id,
    username: e.username,
    name: names.get(e.username) || e.username,
    label: e.slipLine || e.label,
    rawLabel: e.label,
    reason: e.reason,
    rev: e.rev,
    unconfirmedFlags: e.direction === 'add' && (e.taxMode != null || e.insuranceBase != null) && !e.flagsConfirmedBy,
    kind: e.direction === 'deduct' ? 'minus' : 'plus',
    amount: e.amount,
    status: EXTRA_STATUS[e.status] || e.status
  }));
  const count = (s?) => items.filter(i => i.status === s).length;
  return {
    counts: {
      all: items.length,
      pending: count('pending'),
      approved: count('approved'),
      rejected: count('rejected'),
      cancelled: count('cancelled')
    },
    items
  };
}

// GET /api/staff, lọc theo tên hoặc tên đăng nhập trong số người thuộc bảng lương
export async function searchExtraPeople(q?) {
  const k = (q || '').trim().toLowerCase();
  const list = (await staffList()).filter(p => !k || p.name.toLowerCase().includes(k) || p.username.includes(k));
  return list.slice(0, 6).map(p => ({ username: p.username, name: p.name }));
}

/**
 * Thêm một khoản. payload: { username, name, kind: 'plus' | 'minus', amount, label, line, taxable, insured, reason }
 */
// POST /api/pay-entries  { month, username, direction, amount, label, slipLine, reason, taxMode, insuranceBase }
// (khoản trừ không có cờ thuế và bảo hiểm; khoản cộng không chịu thuế gửi taxMode 'full', tính vào bảo hiểm gửi insuranceBase = số tiền)
export async function addExtra(month?, payload?) {
  const reason = (payload.reason || '').trim();
  if (!payload.username) return err('Chưa chọn người nhận');
  if (!(Number(payload.amount) > 0)) return err('Chưa nhập số tiền');
  if (!payload.label.trim()) return err('Chưa nhập tên khoản');
  if (reason.length < 10 || reason.length > 300) return err('Lý do cần từ 10 đến 300 ký tự');
  const plus = payload.kind !== 'minus';
  const body: Record<string, any> = {
    month,
    username: payload.username,
    direction: plus ? 'add' : 'deduct',
    amount: Number(payload.amount),
    label: payload.label.trim(),
    slipLine: (payload.line || '').trim() || null,
    reason
  };
  if (plus && payload.taxable === false) body.taxMode = 'full';
  if (plus && payload.insured) body.insuranceBase = body.amount;
  const out = await api('POST', '/pay-entries', body);
  return { ok: true, item: out.entry };
}

// PUT /api/pay-entries/:id  { rev, label, amount, reason }  (chỉ khoản chờ duyệt; trường vắng giữ nguyên giá trị đã lưu)
export function editPayEntry(id, { rev, label, amount, reason }: any) {
  if (!(Number(amount) > 0)) return err('Chưa nhập số tiền');
  if (!(label || '').trim()) return err('Chưa nhập tên khoản');
  return api('PUT', `/pay-entries/${enc(id)}`, {
    rev,
    label: label.trim(),
    amount: Number(amount),
    reason: (reason || '').trim()
  });
}

// PUT /api/pay-entries/:id/decide  { rev, decision: 'approved' | 'rejected', note }
export function decidePayEntry(id, { rev, decision, note = '' }: any) {
  return api('PUT', `/pay-entries/${enc(id)}/decide`, { rev, decision, note: note.trim() || undefined });
}

// POST /api/pay-entries/:id/void  { rev, reason }
export function voidPayEntry(id, { rev, reason = '' }: any) {
  return api('POST', `/pay-entries/${enc(id)}/void`, { rev, reason: reason.trim() || undefined });
}

// POST /api/pay-entries/:id/confirm-flags  { rev, basis }
export function confirmPayEntryFlags(id, { rev, basis = '' }: any) {
  return api('POST', `/pay-entries/${enc(id)}/confirm-flags`, { rev, basis: basis.trim() || undefined });
}
