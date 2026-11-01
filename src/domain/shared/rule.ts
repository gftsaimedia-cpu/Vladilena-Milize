'use strict';
// Luật nghiệp vụ dạng class. Mỗi luật là một class nhỏ, có MỘT lý do để đổi, trả về các Violation (không ném, không ghi gì).
// RuleSet duyệt các luật theo thứ tự đăng ký: Violation chặn (block) ném HttpError ngay, Violation cảnh báo (warn) đi qua warnIf.
// Thêm luật mới = thêm một class Rule và một dòng đăng ký vào RuleSet; service dùng RuleSet không phải sửa.
const { HttpError } = require('../../platform/http');
const { warnIf } = require('../../platform/warnings');

const SEVERITY = Object.freeze({ block: 'block', warn: 'warn' });

class Violation {
  declare code: any;
  declare severity: any;
  declare message: any;
  declare details: any;
  declare status: any;
  declare consequence: any;

  // message/consequence: câu tiếng Việt cho người dùng; details: trường thêm trả cho giao diện (ví dụ { date }); status: mã HTTP khi chặn
  constructor({ code, severity, message, details = {}, status = 400, consequence }: any) {
    this.code = code;
    this.severity = severity;
    this.message = message;
    this.details = details;
    this.status = status;
    this.consequence = consequence;
  }

  static block(code?, message?, details: any = {}, status = 400) {
    return new Violation({ code, severity: SEVERITY.block, message, details, status });
  }

  // details: trường thêm đi kèm cảnh báo (ví dụ { date }); bỏ trống thì cảnh báo không có trường details
  static warn(code?, message?, consequence?, details?) {
    return new Violation({ code, severity: SEVERITY.warn, message, consequence, ...(details ? { details } : {}) });
  }

  get blocks() {
    return this.severity === SEVERITY.block;
  }

  // Chặn: ném HttpError(status, message, { code, ...details }); cảnh báo: ghi qua warnIf rồi trả về
  raise() {
    if (this.blocks) throw new HttpError(this.status, this.message, { code: this.code, ...this.details });
    const hasDetails = Object.keys(this.details).length > 0;
    warnIf(this.code, true, {
      message: this.message,
      consequence: this.consequence,
      ...(hasDetails ? { details: this.details } : {})
    });
  }
}

class Rule {
  // Trả mảng hoặc iterable (generator, kể cả async generator) các Violation; không có vi phạm thì rỗng. Iterable lười giúp RuleSet dừng ở vi phạm chặn đầu tiên.
  // eslint-disable-next-line no-unused-vars
  evaluate(context?) {
    throw new Error(`${this.constructor.name} chưa cài evaluate()`);
  }
}

class RuleSet {
  #rules: any = [];

  constructor(rules: any[] = []) {
    for (const rule of rules) this.add(rule);
  }

  add(rule?) {
    if (!(rule instanceof Rule)) throw new TypeError('RuleSet chỉ nhận đối tượng Rule');
    this.#rules.push(rule);
    return this;
  }

  get size() {
    return this.#rules.length;
  }

  // Mọi Violation theo thứ tự đăng ký, không ném, không ghi cảnh báo (dùng cho test và báo cáo). Luật có thể là generator thường
  // hoặc async (luật cần đọc DB): duyệt bằng for await.
  async *violations(context?) {
    for (const rule of this.#rules) yield* rule.evaluate(context);
  }

  // Duyệt lười: chặn thì ném HttpError(status, message, { code, ...details }); cảnh báo thì ghi qua warnIf rồi chạy tiếp
  async check(context?) {
    for await (const violation of await this.violations(context)) violation.raise();
  }
}

export = { Violation, Rule, RuleSet, SEVERITY };
