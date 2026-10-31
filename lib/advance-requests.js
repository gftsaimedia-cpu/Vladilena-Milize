'use strict';
// Lịch sử yêu cầu ứng lương (bảng `advance_requests`, lib/db.js; route đọc ở lib/domain/advance-requests.js).
// Số đã duyệt ở các yêu cầu này không trừ vào phiếu: tạm ứng của tháng là số theo quy tắc, chỉ trừ khi Admin duyệt tạm ứng (lib/domain/advance).
// Chỉ đọc: danh sách theo tháng, tổng đã duyệt theo người, số yêu cầu đang chờ.
const store = require('./db');
const authz = require('./authz');
const PayrollCalendar = require('../public/payroll-calendar.js');

const { db } = store;
const STATUSES = ['pending', 'approved', 'rejected', 'cancelled'];
const DECIDE_CAP = 'request.decide.advance'; // nhóm duyệt riêng của tạm ứng; vai trò có request.decide.* (Admin, C&B) đều có

const bad = (code, message) => Object.assign(new Error(message), { code, httpStatus: 400 });

const rowTo = r =>
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

function list({ month, username, status } = {}) {
  if (!PayrollCalendar.isValidMonth(month)) throw bad('BAD_MONTH', 'month phải có dạng YYYY-MM');
  if (status != null && !STATUSES.includes(status)) throw bad('BAD_STATUS', 'status không hợp lệ');
  const where = ['month = ?'],
    args = [month];
  if (username) {
    where.push('username = ?');
    args.push(String(username).toLowerCase());
  }
  if (status) {
    where.push('status = ?');
    args.push(status);
  }
  return db
    .prepare(`SELECT * FROM advance_requests WHERE ${where.join(' AND ')} ORDER BY id`)
    .all(...args)
    .map(rowTo);
}
// Tổng số đã duyệt của một người trong một tháng (đồng)
const grantedOf = (username, month) =>
  db
    .prepare(
      "SELECT COALESCE(SUM(granted), 0) AS total FROM advance_requests WHERE month = ? AND username = ? AND status = 'approved'"
    )
    .get(month, username).total;
// Số yêu cầu đang chờ (mọi tháng) mà người này duyệt được: cho huy hiệu "Yêu cầu" của Admin
const pendingFor = me =>
  db
    .prepare("SELECT username FROM advance_requests WHERE status = 'pending'")
    .all()
    .filter(r => authz.can(me, DECIDE_CAP, { username: r.username })).length;
const pendingCount = month =>
  db.prepare("SELECT COUNT(*) AS n FROM advance_requests WHERE month = ? AND status = 'pending'").get(month).n;

module.exports = { STATUSES, DECIDE_CAP, list, grantedOf, pendingCount, pendingFor };
