// Tạm ứng phía Admin.
//   GET  /advance-approvals?month=                 { month, rev, provisional, window, pending, items: [{ username, name, eligible, reason?, amount, status, rev, requestedAt, decidedAt, decidedBy, note }] }
//   POST /advance-approvals/{approve,reject,cancel} { month, username, expectedRev?, reason? }
//   POST /advance-approvals/approve-all            { month, expectedRev? }  → { month, rev, approved: [username], skipped: [{ username, code }] }
import { buildAdvanceRows } from '@/builders/admin-requests/advance';
import { api, qs } from './http';

/** Yêu cầu tạm ứng đã gửi của tháng month ('YYYY-MM'). */
export async function listAdvances({ month }: any = {}) {
  return buildAdvanceRows(await api('GET', `/advance-approvals${qs({ month })}`));
}

/** Duyệt, từ chối hoặc huỷ duyệt yêu cầu của một người (action 'approve' | 'reject' | 'cancel'); rev = rev của người đó. */
export const decideAdvance = ({ month, username, action, rev, note }: any) =>
  api('POST', `/advance-approvals/${action}`, {
    month,
    username,
    ...(rev !== undefined ? { expectedRev: rev } : {}),
    ...(action !== 'approve' && note ? { reason: note } : {})
  });

/** Duyệt mọi yêu cầu đang chờ của tháng; rev = rev của tháng. */
export const approveAllAdvances = ({ month, rev }: any) =>
  api('POST', '/advance-approvals/approve-all', { month, ...(rev !== undefined ? { expectedRev: rev } : {}) });
