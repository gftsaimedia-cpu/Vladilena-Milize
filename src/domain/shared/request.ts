'use strict';
// Lớp gốc của mọi "yêu cầu chờ duyệt" của nhân viên (ví dụ giải trình). Gom phần chung một chỗ:
// trạng thái, người và lúc quyết định, ghi chú, số phiên bản `rev` cho khoá lạc quan, và luật "không ai tự duyệt yêu cầu của chính mình".
// Lớp con chỉ khai báo các trạng thái của mình (PENDING, DECIDABLE) và hành vi riêng (ví dụ trả lời giải trình).
// Lớp chỉ đổi đối tượng trong bộ nhớ; ghi xuống DB là việc của repository.
const { DomainError } = require('./domain-error');

class Request {
  declare id: any;
  declare kind: any;
  declare username: any;
  declare month: any;
  declare status: any;
  declare note: any;
  declare createdAt: any;
  declare decidedBy: any;
  declare decidedAt: any;
  declare decisionNote: any;
  declare rev: any;

  // Trạng thái còn chờ (chưa có quyết định cuối) và trạng thái được phép ra quyết định; lớp con ghi đè
  static PENDING = ['pending'];
  static DECIDABLE = ['pending'];
  static APPROVED = 'approved';
  static REJECTED = 'rejected';
  // Tên dùng trong câu báo lỗi ("yêu cầu", "giải trình"...) và mã lỗi khi lệch phiên bản
  static LABEL = 'Yêu cầu';
  static STALE_CODE = 'REQUEST_STALE';

  constructor(data?) {
    this.id = data.id ?? null; // số thứ tự của yêu cầu, rỗng nếu chưa lưu
    this.kind = data.kind ?? null; // loại yêu cầu do lớp con quy định
    this.username = data.username ?? null; // người gửi (người được duyệt)
    this.month = data.month ?? null; // tháng của yêu cầu, dạng 'YYYY-MM'
    this.status = data.status; // trạng thái hiện tại
    this.note = data.note ?? null; // lời nhắn của nhân viên
    this.createdAt = data.createdAt ?? null; // thời điểm gửi
    this.decidedBy = data.decidedBy ?? null; // người duyệt hoặc từ chối
    this.decidedAt = data.decidedAt ?? null; // thời điểm duyệt hoặc từ chối
    this.decisionNote = data.decisionNote ?? null; // ghi chú của người duyệt
    this.rev = Number.isInteger(data.rev) ? data.rev : 0; // số lần đã ghi, tăng mỗi lần lưu
  }

  isPending() {
    return (this.constructor as any).PENDING.includes(this.status);
  }

  isApproved() {
    return this.status === (this.constructor as any).APPROVED;
  }

  // Kiểm số phiên bản người duyệt đã thấy. Thiếu expectedRev thì bỏ qua (màn cũ chưa gửi), lệch thì 409
  assertRev(expectedRev?) {
    if (expectedRev === undefined || expectedRev === null || expectedRev === '') return;
    if (Number(expectedRev) !== this.rev)
      throw DomainError.conflict(
        (this.constructor as any).STALE_CODE,
        `${(this.constructor as any).LABEL} vừa được người khác cập nhật, hãy tải lại rồi làm lại`,
        { current: this.rev }
      );
  }

  // Ra quyết định. by: người duyệt; isSelf: người duyệt chính là người gửi (nơi gọi hỏi src/platform/authz.ts → isSelfDecision).
  // onSelf: chính sách khi tự duyệt (src/platform/warnings.ts → selfDecision: chỉ cảnh báo); không truyền thì ném 403
  decide({ by, approve, note, at, isSelf, onSelf }: any) {
    if (isSelf) {
      const denied = DomainError.forbidden(
        'SELF_DECISION_FORBIDDEN',
        `Không được tự duyệt ${(this.constructor as any).LABEL.toLowerCase()} của chính mình`
      );
      if (!onSelf) throw denied;
      onSelf(denied);
    }
    if (!(this.constructor as any).DECIDABLE.includes(this.status)) throw this.notDecidable();
    this.status = approve ? (this.constructor as any).APPROVED : (this.constructor as any).REJECTED;
    this.decidedBy = by;
    this.decidedAt = at;
    this.decisionNote = note || null;
    return this;
  }

  // Lỗi khi trạng thái chưa cho quyết định; lớp con đổi câu cho rõ nghĩa
  notDecidable() {
    return DomainError.conflict('REQUEST_NOT_DECIDABLE', `${(this.constructor as any).LABEL} này chưa thể duyệt`);
  }
}

export = { Request };
