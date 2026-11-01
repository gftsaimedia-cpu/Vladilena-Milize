'use strict';
// Một giải trình của nhân viên về MỘT ngày. Nguồn: nhân viên tự gửi cùng lần bấm Check-in / Check-out không hợp lệ (gắn với lượt:
// late-checkout, punch-in, punch-out), Admin yêu cầu hoặc nhân viên tự giải trình ngày vắng của mình (admin; requestedBy cho biết ai),
// AI phát hiện rồi Admin bấm yêu cầu (ai).
// Trạng thái: requested (chờ nhân viên trả lời) → answered (chờ Admin duyệt) → approved | rejected.
// Chưa được duyệt (kể cả bị từ chối) thì ngày đó KHÔNG được tính lương (holdsPay); duyệt lại được (đổi ý đổi quyết định).
const { Request } = require('../shared/request');
const { DomainError } = require('../shared/domain-error');

class Explanation extends Request {
  declare date: any;
  declare sessionId: any;
  declare prompt: any;
  declare ruleId: any;
  declare requestedBy: any;
  declare requestedAt: any;
  declare answer: any;
  declare answeredAt: any;
  declare status: any;
  declare decidedBy: any;
  declare decidedAt: any;
  declare decisionNote: any;

  static PENDING = ['requested', 'answered'];
  static DECIDABLE = ['answered', 'approved', 'rejected'];
  static LABEL = 'Giải trình';
  static STALE_CODE = 'EXPLANATION_STALE';
  static PRESS_KINDS = Object.freeze(['late-checkout', 'punch-in', 'punch-out']); // gắn với một lượt, nhân viên gửi cùng lần bấm
  static KINDS = Object.freeze([...Explanation.PRESS_KINDS, 'admin', 'ai']);
  // Bảng explanations chỉ nhận kind 'late-checkout' | 'admin' | 'ai'. Giải trình lúc bấm Check-in / Check-out không hợp lệ lưu kind
  // 'late-checkout' kèm rule_id = 'punch-in' | 'punch-out'; ngoài bảng (fromRow, view) chúng mang kind punch-in / punch-out.
  static #SIDES = ['punch-in', 'punch-out'];

  // Cặp { kind, ruleId } ghi vào bảng
  static stored({ kind, ruleId }: any) {
    return Explanation.#SIDES.includes(kind)
      ? { kind: 'late-checkout', ruleId: kind }
      : { kind, ruleId: ruleId ?? null };
  }

  static fromRow(r?) {
    const sided = r.kind === 'late-checkout' && Explanation.#SIDES.includes(r.rule_id);
    return new Explanation({
      id: r.id,
      username: r.username,
      date: r.date,
      kind: sided ? r.rule_id : r.kind,
      sessionId: r.session_id ?? null,
      prompt: r.prompt,
      ruleId: sided ? null : (r.rule_id ?? null),
      requestedBy: r.requested_by,
      requestedAt: r.requested_at,
      status: r.status,
      answer: r.answer ?? null,
      answeredAt: r.answered_at ?? null,
      decidedBy: r.decided_by ?? null,
      decidedAt: r.decided_at ?? null,
      decisionNote: r.decision_note ?? null,
      rev: r.rev ?? 0
    });
  }

  constructor(data?) {
    super({ ...data, month: data.date ? data.date.slice(0, 7) : null, createdAt: data.requestedAt });
    this.date = data.date; // ngày cần giải trình 'YYYY-MM-DD'
    this.sessionId = data.sessionId ?? null; // lượt chấm công (giải trình gửi cùng lần bấm)
    this.prompt = data.prompt ?? ''; // câu hỏi / nội dung cần giải trình
    this.ruleId = data.ruleId ?? null; // luật AI đã phát hiện (nguồn ai)
    this.requestedBy = data.requestedBy; // người yêu cầu
    this.requestedAt = data.requestedAt; // lúc yêu cầu
    this.answer = data.answer ?? null; // câu trả lời của nhân viên
    this.answeredAt = data.answeredAt ?? null;
  }

  // Còn chờ nhân viên trả lời
  isWaiting() {
    return this.status === 'requested';
  }

  // Ngày của giải trình này đang bị giữ lương (chưa duyệt hoặc bị từ chối)
  holdsPay() {
    return !this.isApproved();
  }

  // Nhân viên trả lời yêu cầu của Admin/AI
  answerWith(text?, at?) {
    if (this.status !== 'requested') throw DomainError.conflict('NOT_REQUESTED', 'Yêu cầu này đã được trả lời');
    this.status = 'answered';
    this.answer = text;
    this.answeredAt = at;
    return this;
  }

  // Nhân viên gửi lại giải trình gửi cùng lần bấm của cùng lượt. Đã được duyệt thì không gửi lại được (gửi lại sẽ xoá quyết định duyệt
  // và ngày đó quay về không tính lương); bị từ chối thì gửi lại thành chờ duyệt.
  resubmit(text?, at?) {
    if (this.isApproved())
      throw DomainError.conflict('EXPLANATION_ALREADY_APPROVED', 'Giải trình này đã được duyệt, không cần gửi lại');
    this.status = 'answered';
    this.answer = text;
    this.answeredAt = at;
    this.decidedBy = null;
    this.decidedAt = null;
    this.decisionNote = null;
    return this;
  }

  notDecidable() {
    return DomainError.conflict('NOT_ANSWERED', 'Nhân sự chưa trả lời giải trình này');
  }

  // Dạng gửi ra API (các trường của giải trình, kèm rev)
  view() {
    return {
      id: this.id,
      username: this.username,
      date: this.date,
      kind: this.kind,
      sessionId: this.sessionId,
      prompt: this.prompt,
      ruleId: this.ruleId,
      requestedBy: this.requestedBy,
      requestedAt: this.requestedAt,
      status: this.status,
      answer: this.answer,
      answeredAt: this.answeredAt,
      decidedBy: this.decidedBy,
      decidedAt: this.decidedAt,
      decisionNote: this.decisionNote,
      rev: this.rev
    };
  }
}

export = { Explanation };
