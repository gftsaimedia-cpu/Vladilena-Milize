'use strict';
// Đọc và ghi bảng explanations (schema.js). Không giữ bản sao giữa các lần gọi.
const { ExplanationsRepository } = require('../../data');
const { Repository } = require('../shared/repository');
const { Explanation } = require('./explanation');
const { SQL_IN_CHUNK } = require('../../platform/config');

const LIST_MAX = 500;
const LIST_DEFAULT = 200;
const MONTH_LAST_DAY = 31; // ngày cuối tháng lớn nhất, chỉ để so chuỗi 'YYYY-MM-DD'
const HOLD_RANK = { requested: 1, answered: 2, rejected: 3 }; // trạng thái giữ lương của một ngày: từ chối hơn đã trả lời hơn chờ trả lời

class ExplanationRepository extends Repository {
  declare table: any;

  constructor(deps?) {
    super(deps);
    this.table = new ExplanationsRepository(this.queryBuilder);
  }

  async byId(id?) {
    const row = await this.table.find(id);
    return row ? Explanation.fromRow(row) : null;
  }

  // Giải trình loại kind của một lượt (mỗi lượt có tối đa một giải trình mỗi loại)
  async forSession(sessionId?, kind?) {
    const { kind: stored, ruleId } = Explanation.stored({ kind });
    const row = await this.table.forSession(sessionId, stored, ruleId);
    return row ? Explanation.fromRow(row) : null;
  }

  async lateFor(sessionId?) {
    return await this.forSession(sessionId, 'late-checkout');
  }

  // Mọi giải trình gắn với các lượt ids (một truy vấn; nơi gọi chia lô theo giới hạn biến của SQLite), theo id tăng
  async forSessions(ids?) {
    if (!ids.length) return [];
    return (await this.table.ofSessions(ids)).map(Explanation.fromRow);
  }

  async hasSessionAnswer(sessionId?) {
    return await this.table.hasLateAnswer(sessionId);
  }

  async insert(e?) {
    const { kind, ruleId } = Explanation.stored(e);
    const id = await this.table.insert({
      username: e.username,
      date: e.date,
      kind,
      session_id: e.sessionId,
      prompt: e.prompt,
      rule_id: ruleId,
      requested_by: e.requestedBy,
      requested_at: e.requestedAt,
      status: e.status,
      answer: e.answer,
      answered_at: e.answeredAt
    });
    return await this.byId(id);
  }

  // Ghi các trường đổi được của một giải trình đã nạp; rev lệch (người khác vừa ghi) thì 409 EXPLANATION_STALE
  async save(e?) {
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
  async heldByUser(month?) {
    const out = new Map<any, any>();
    const rows = await this.table.notApprovedBetween(`${month}-01`, `${month}-${MONTH_LAST_DAY}`);
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
  async explainedByUser(month?) {
    const out = new Map<any, any>();
    const rows = await this.table.daysBetween(`${month}-01`, `${month}-${MONTH_LAST_DAY}`);
    for (const r of rows) {
      if (!out.has(r.username)) out.set(r.username, new Set());
      out.get(r.username).add(r.date);
    }
    return out;
  }

  // Có giải trình nào của người username về ngày date không (mọi trạng thái, mọi loại)
  async hasOnDay(username?, date?) {
    return await this.table.existsOnDay(username, date);
  }

  // Giải trình gắn ngày (không có session_id: Admin yêu cầu hoặc AI đề nghị) của các người usernames trong khoảng ngày from..to
  async forDays(usernames?, from?, to?) {
    const out: any[] = [];
    for (let i = 0; i < usernames.length; i += SQL_IN_CHUNK) {
      const names = usernames.slice(i, i + SQL_IN_CHUNK);
      out.push(...(await this.table.forDays(names, from, to)).map(Explanation.fromRow));
    }
    return out;
  }

  async list({ username, status, limit = LIST_DEFAULT }: any = {}) {
    const rows = await this.table.list(
      { username, status },
      Math.min(LIST_MAX, Math.max(1, Number(limit) || LIST_DEFAULT))
    );
    return rows.map(Explanation.fromRow);
  }

  // Có username: số yêu cầu đang chờ người đó trả lời; không có: số giải trình đã trả lời, chờ Admin duyệt
  async countOpen(username?) {
    return await this.table.countByStatus(username ? 'requested' : 'answered', username);
  }
}

export = { ExplanationRepository };
