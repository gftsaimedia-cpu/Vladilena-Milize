// Dịch vụ phiếu lương (ngăn kéo, sửa số trên phiếu, hộp bản in, trang in A4): đọc và ghi qua api(); riêng bỏ qua cảnh báo AI vẫn dữ liệu giả.
import { buildDrawer } from '@/builders/payslip/drawer';
import { buildSheet } from '@/builders/payslip/sheet';
import { api } from './http';

const enc = encodeURIComponent;
const slipRev = new Map<any, any>();

/**
 * Phiếu lương một người cho ngăn kéo: loại phiếu, huy hiệu, số tóm tắt, dòng chi tiết, cảnh báo AI, nút được phép.
 * opts: { name (tên hiển thị), scenario (?kb của Bảng lương, chỉ dùng cho dữ liệu giả) }
 */
// GET /api/periods/:month/payslips/:username (đã có lần tính) hoặc /estimates/:username (chưa tính)
// Đọc phiếu, số Admin đã sửa và khoản thêm của một người; dùng chung cho ngăn kéo và bản in
async function loadSlip(month?, username?) {
  const period = await api('GET', `/periods/${enc(month)}`);
  const source = period.run ? 'payslips' : 'estimates';
  const data = await api('GET', `/periods/${enc(month)}/${source}/${enc(username)}`);
  slipRev.set(`${month}|${username}`, data.payslip.rev);
  // Số Admin đã sửa (GET /slip-override) và khoản thêm đã duyệt (GET /pay-entries): chỉ đọc khi phiếu có
  const net = (data.payslip.snapshot && data.payslip.snapshot.net) || {};
  const [override, entries] = await Promise.all([
    data.payslip.overridden ? api('GET', `/slip-override?user=${enc(username)}&month=${enc(month)}`) : null,
    net.entriesAdd || net.entriesDeduct
      ? api('GET', `/pay-entries?month=${enc(month)}&username=${enc(username)}&status=approved`)
      : null
  ]);
  const extra = { override: override && override.values, entries: entries && entries.entries };
  return { period, data, drawer: buildDrawer(month, username, period, data, extra) };
}

export async function getPayslip(month?, username?) {
  return (await loadSlip(month, username)).drawer;
}

// GET /api/slip-override?user=&month= → { values, rev, reason, updatedBy, updatedAt }
export const getSlipOverride = (month?, username?) =>
  api('GET', `/slip-override?user=${enc(username)}&month=${enc(month)}`);

// PUT /api/slip-override  { month, user, values: { <ô>: số }, reason, expectedRev }  (ô tiền: số nguyên không âm; ô số lượng: tối đa 2 số lẻ)
export function saveSlipOverride(month, username, { values, reason = '', expectedRev }: any) {
  const body: Record<string, any> = { month, user: username, values };
  if (reason.trim()) body.reason = reason.trim();
  if (expectedRev !== undefined) body.expectedRev = expectedRev;
  return api('PUT', '/slip-override', body);
}

/** Bản in A4 (2 trang) của một người: đầu phiếu, chấm công từng ngày, bảng tổng hợp. */
// GET /api/periods/:month/payslips/:username (hoặc /estimates/:username), dựng bản in từ phiếu
export async function getPayslipSheet(month?, username?) {
  const { data, drawer } = await loadSlip(month, username);
  return buildSheet(drawer, data);
}

// Các phiếu đã phê duyệt của kỳ: GET /api/periods/:month/payslips?status=approved (tối đa 200 phiếu mỗi trang)
async function approvedRows(month?) {
  const rows: any[] = [];
  for (let page = 1; ; page += 1) {
    const out = await api('GET', `/periods/${enc(month)}/payslips?status=approved&pageSize=200&page=${page}`);
    rows.push(...out.rows);
    if (!out.rows.length || rows.length >= out.total) return rows;
  }
}

/** Tóm tắt lô in tất cả: số phiếu đã phê duyệt, ngày trả lương, danh sách tên đầu, phiếu đầu tiên để xem trước. */
export async function getPrintBatch(month?) {
  const [period, rows] = await Promise.all([api('GET', `/periods/${enc(month)}`), approvedRows(month)]);
  return {
    month,
    count: rows.length,
    paidOn: (period.stages && period.stages.paid && period.stages.paid.at) || null,
    names: rows.slice(0, 20).map(r => r.name || r.username),
    first: rows.length ? await getPayslipSheet(month, rows[0].username) : null
  };
}

/** Toàn bộ bản in A4 của các phiếu đã phê duyệt trong kỳ (trang in tất cả). */
export async function getApprovedSheets(month?) {
  const rows = await approvedRows(month);
  const sheets: any[] = [];
  for (let i = 0; i < rows.length; i += 8)
    sheets.push(...(await Promise.all(rows.slice(i, i + 8).map(r => getPayslipSheet(month, r.username)))));
  return sheets;
}

// PUT /api/periods/:month/payslips/decide  { action, items: [{ username, rev }] }
// rev mới của phiếu (items[].rev trong phản hồi) thay rev cũ để lần quyết định kế tiếp trên cùng phiếu không bị coi là cũ
async function decide(month?, username?, action?) {
  const out = await api('PUT', `/periods/${enc(month)}/payslips/decide`, {
    action,
    items: [{ username, rev: slipRev.get(`${month}|${username}`) }]
  });
  const item = out && Array.isArray(out.items) ? out.items.find(i => i.username === username) : null;
  if (item && item.rev !== undefined) slipRev.set(`${month}|${username}`, item.rev);
  return out;
}

/** Phê duyệt riêng một phiếu: trả phần đổi để cập nhật phiếu trên màn. */
export async function approvePayslip(month?, username?) {
  await decide(month, username, 'approve');
  return {
    ok: true,
    month,
    username,
    patch: { kind: 'approved', pills: [{ cls: 'p-done', label: 'Đã phê duyệt' }], canApprove: false }
  };
}

/** Trả lại phiếu để tính lại. */
export async function returnPayslip(month?, username?) {
  await decide(month, username, 'return');
  return { ok: true, month, username };
}
