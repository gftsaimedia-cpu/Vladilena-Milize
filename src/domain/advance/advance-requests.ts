'use strict';
// Lịch sử yêu cầu ứng lương (bảng `advance_requests`, src/platform/db.ts; route đọc ở src/domain/advance-requests.js).
// Số đã duyệt ở các yêu cầu này không trừ vào phiếu: tạm ứng của tháng là số theo quy tắc, chỉ trừ khi Admin duyệt tạm ứng (src/domain/advance).
// Chỉ đọc: danh sách theo tháng, tổng đã duyệt theo người, số yêu cầu đang chờ.
const { AsyncList } = require('../../shared/async-list');
const store = require('../../platform/db');
const authz = require('../../platform/authz');
const PayrollCalendar = require('../../engine/payroll-calendar');

const { AdvanceRequestsRepository } = require('../../data');
const requestsRepo = new AdvanceRequestsRepository(store.queryBuilder);
const STATUSES = ['pending', 'approved', 'rejected', 'cancelled'];
const DECIDE_CAP = 'request.decide.advance'; // nhóm duyệt riêng của tạm ứng; vai trò có request.decide.* (Admin, C&B) đều có

const bad = (code?, message?) => Object.assign(new Error(message), { code, httpStatus: 400 });

const rowTo = (r?) =>
  r && {
    id: r.id,
    username: r.username,
    month: r.month,
    amount: r.amount,
    cap: r.cap,
    note: r.note ?? null,
    status: r.status,
    granted: r.granted ?? null,
    approvedAmount: r.granted ?? null, // cùng giá trị với granted (tên giao diện dùng)
    rev: r.rev,
    createdAt: r.created_at,
    decidedBy: r.decided_by ?? null,
    decidedAt: r.decided_at ?? null,
    decisionNote: r.decision_note ?? null,
    cancelledBy: r.cancelled_by ?? null,
    cancelledAt: r.cancelled_at ?? null
  };

async function list({ month, username, status }: any = {}) {
  if (!PayrollCalendar.isValidMonth(month)) throw bad('BAD_MONTH', 'month phải có dạng YYYY-MM');
  if (status != null && !STATUSES.includes(status)) throw bad('BAD_STATUS', 'status không hợp lệ');
  return (
    await requestsRepo.list({
      month,
      username: username ? String(username).toLowerCase() : undefined,
      status: status || undefined
    })
  ).map(rowTo);
}
// Tổng số đã duyệt của một người trong một tháng (đồng)
const grantedOf = async (username?, month?) => await requestsRepo.grantedOf(username, month);
// Số yêu cầu đang chờ (mọi tháng) mà người này duyệt được: cho huy hiệu "Yêu cầu" của Admin
const pendingFor = async (me?) =>
  (
    await AsyncList.filter(
      await requestsRepo.pendingUsers(),
      async r => await authz.can(me, DECIDE_CAP, { username: r.username })
    )
  ).length;
const pendingCount = async (month?) => await requestsRepo.pendingCount(month);

export = { STATUSES, DECIDE_CAP, list, grantedOf, pendingCount, pendingFor };
