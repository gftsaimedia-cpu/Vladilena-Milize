'use strict';
// Đối soát ghi: mọi lượt Check-in mà khách đã nhận 200 PHẢI có đúng một dòng trong DB,
// gửi lại cùng requestId không được sinh thêm lượt, và không có lượt thừa không ai gửi. "0 mất, 0 trùng" là điều kiện đạt.
// db: kết nối của ứng dụng (store.db hoặc PostgresDatabase) với prepare().get/all bất đồng bộ. confirmed: [{ username, requestId, sessionId }]
// (sessionId = open.id máy chủ trả về, có thể bỏ).
async function reconcile(db?, confirmed?, { prefix = 'lt_' }: any = {}) {
  const byRequest = db.prepare('SELECT session_id FROM punch_requests WHERE username = ? AND request_id = ?');
  const sessionOf = db.prepare('SELECT 1 AS present FROM attendance_sessions WHERE id = ? AND username = ?');
  const result: Record<string, any> = {
    confirmed: confirmed.length,
    missing: 0,
    orphan: 0,
    mismatch: 0,
    duplicateSessions: 0,
    extraSessions: 0
  };
  const expectedUsers = new Set<any>();
  for (const item of confirmed) {
    expectedUsers.add(item.username);
    const row = await byRequest.get(item.username, item.requestId);
    if (!row) {
      result.missing++; // khách được xác nhận mà DB không có: MẤT
      continue;
    }
    if (!(await sessionOf.get(row.session_id, item.username))) result.orphan++;
    if (item.sessionId !== undefined && item.sessionId !== row.session_id) result.mismatch++;
  }
  // Mỗi người chỉ được một lượt mở trong kịch bản Check-in một lần: nhiều hơn là TRÙNG (gửi lại requestId sinh thêm lượt)
  const perUser = await db
    .prepare('SELECT username, COUNT(*) AS n FROM attendance_sessions WHERE username LIKE ? GROUP BY username')
    .all(`${prefix}%`);
  for (const { username, n } of perUser) {
    if (n > 1) result.duplicateSessions += n - 1;
    if (!expectedUsers.has(username)) result.extraSessions += n;
  }
  result.pass =
    !result.missing && !result.orphan && !result.mismatch && !result.duplicateSessions && !result.extraSessions;
  return result;
}

module.exports = { reconcile };
