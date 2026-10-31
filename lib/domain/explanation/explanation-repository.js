'use strict';
// Đọc và ghi bảng explanations (schema.js). Không giữ bản sao giữa các lần gọi.
const { Repository } = require('../shared/repository');
const { Explanation } = require('./explanation');
const { SQL_IN_CHUNK } = require('../../config');

const LIST_MAX = 500;
const LIST_DEFAULT = 200;
const MONTH_LAST_DAY = 31; // ngày cuối tháng lớn nhất, chỉ để so chuỗi 'YYYY-MM-DD'
const HOLD_RANK = { requested: 1, answered: 2, rejected: 3 }; // trạng thái giữ lương của một ngày: từ chối hơn đã trả lời hơn chờ trả lời

class ExplanationRepository extends Repository {
  async byId(id) {
    const row = await this.one('SELECT * FROM explanations WHERE id = ?', id);
    return row ? Explanation.fromRow(row) : null;
  }

  // Giải trình loại kind của một lượt (mỗi lượt có tối đa một giải trình mỗi loại)
  async forSession(sessionId, kind) {
    const { kind: stored, ruleId } = Explanation.stored({ kind });
    const row = ruleId
      ? await this.one(
          'SELECT * FROM explanations WHERE session_id = ? AND kind = ? AND rule_id = ?',
          sessionId,
          stored,
          ruleId
        )
      : await this.one('SELECT * FROM explanations WHERE session_id = ? AND kind = ? AND rule_id IS NULL', sessionId, stored);
    return row ? Explanation.fromRow(row) : null;
  }

  async lateFor(sessionId) {
    return await this.forSession(sessionId, 'late-checkout');
  }

  // Mọi giải trình gắn với các lượt ids (một truy vấn; nơi gọi chia lô theo giới hạn biến của SQLite), theo id tăng
  async forSessions(ids) {
    if (!ids.length) return [];
    const marks = ids.map(() => '?').join(',');
    return (await this.all(`SELECT * FROM explanations WHERE session_id IN (${marks}) ORDER BY id`, ...ids)).map(
      Explanation.fromRow
    );
  }

  async hasSessionAnswer(sessionId) {
    return !!await this.one(
      "SELECT 1 FROM explanations WHERE session_id = ? AND kind = 'late-checkout' AND status != 'requested'",
      sessionId
    );
  }

  async insert(e) {
    const { kind, ruleId } = Explanation.stored(e);
    const done = await this.run(
      `INSERT INTO explanations (username, date, kind, session_id, prompt, rule_id, requested_by, requested_at, status, answer, answered_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      e.username,
      e.date,
      kind,
      e.sessionId,
      e.prompt,
      ruleId,
      e.requestedBy,
      e.requestedAt,
      e.status,
      e.answer,
      e.answeredAt
    );
    return await this.byId(Number(done.lastInsertRowid));
  }

  // Ghi các trường đổi được của một giải trình đã nạp; rev lệch (người khác vừa ghi) thì 409 EXPLANATION_STALE
  async save(e) {
    await this.updateWithRev({
      table: 'explanations',
      key: 'id',
      id: e.id,
      expectedRev: e.rev,
      sets: {
        status: e.status,
        answer: e.answer,
        answered_at: e.answeredAt,
        decided_by: e.decidedBy,
        decided_at: e.decidedAt,
        decision_note: e.decisionNote
      },
      stale: Explanation.STALE_CODE,
      notFound: 'NOT_FOUND',
      label: Explanation.LABEL
    });
    return await this.byId(e.id);
  }

  // Ngày của tháng có giải trình CHƯA được duyệt: Map username → [{ date, status }] theo ngày tăng. Một ngày có nhiều giải trình lấy
  // trạng thái của giải trình bị từ chối trước, rồi đã trả lời, rồi chờ trả lời.
  async heldByUser(month) {
    const out = new Map();
    const rows = await this.all(
      "SELECT username, date, status FROM explanations WHERE status != 'approved' AND date >= ? AND date <= ? ORDER BY date",
      `${month}-01`,
      `${month}-${MONTH_LAST_DAY}`
    );
    for (const r of rows) {
      if (!out.has(r.username)) out.set(r.username, []);
      const days = out.get(r.username);
      const same = days.find(d => d.date === r.date);
      if (!same) days.push({ date: r.date, status: r.status });
      else if (HOLD_RANK[r.status] > HOLD_RANK[same.status]) same.status = r.status;
    }
    return out;
  }

  // Ngày của tháng có giải trình ở BẤT KỲ trạng thái nào: Map username → Set ngày
  async explainedByUser(month) {
    const out = new Map();
    const rows = await this.all(
      'SELECT DISTINCT username, date FROM explanations WHERE date >= ? AND date <= ?',
      `${month}-01`,
      `${month}-${MONTH_LAST_DAY}`
    );
    for (const r of rows) {
      if (!out.has(r.username)) out.set(r.username, new Set());
      out.get(r.username).add(r.date);
    }
    return out;
  }

  // Có giải trình nào của người username về ngày date không (mọi trạng thái, mọi loại)
  async hasOnDay(username, date) {
    return !!await this.one('SELECT 1 FROM explanations WHERE username = ? AND date = ?', username, date);
  }

  // Giải trình gắn ngày (không có session_id: Admin yêu cầu hoặc AI đề nghị) của các người usernames trong khoảng ngày from..to
  async forDays(usernames, from, to) {
    const out = [];
    for (let i = 0; i < usernames.length; i += SQL_IN_CHUNK) {
      const names = usernames.slice(i, i + SQL_IN_CHUNK);
      out.push(
        ...(await this.all(
          `SELECT * FROM explanations WHERE session_id IS NULL AND date >= ? AND date <= ? AND username IN (${names.map(() => '?').join(',')}) ORDER BY id`,
          from,
          to,
          ...names
        )).map(Explanation.fromRow)
      );
    }
    return out;
  }

  async list({ username, status, limit = LIST_DEFAULT } = {}) {
    const where = [],
      args = [];
    if (username) (where.push('username = ?'), args.push(username));
    if (status) (where.push('status = ?'), args.push(status));
    return (await this.all(
      `SELECT * FROM explanations ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT ?`,
      ...args,
      Math.min(LIST_MAX, Math.max(1, Number(limit) || LIST_DEFAULT))
    )).map(Explanation.fromRow);
  }

  // Có username: số yêu cầu đang chờ người đó trả lời; không có: số giải trình đã trả lời, chờ Admin duyệt
  async countOpen(username) {
    return (await this.one(
      `SELECT COUNT(*) AS n FROM explanations WHERE status = ? ${username ? 'AND username = ?' : ''}`,
      ...(username ? ['requested', username] : ['answered'])
    )).n;
  }
}

module.exports = { ExplanationRepository };
