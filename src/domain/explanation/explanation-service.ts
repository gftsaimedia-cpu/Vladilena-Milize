'use strict';
// Nghiệp vụ giải trình: gửi, yêu cầu, trả lời, duyệt. Mọi hàm trả dạng xem (Explanation.view()) kèm rev.
// Giao dịch, nhật ký và sự kiện do route lo (src/domain/explanation/routes.js).
const { DomainError } = require('../shared/domain-error');
const { Explanation } = require('./explanation');
const { validDate } = require('../input');

const TEXT_MAX = 500;
const RULE_ID_MAX = 80;
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

class ExplanationService {
  declare repository: any;
  declare staffExists: any;
  declare clock: any;
  declare onSelf: any;
  declare periodClosed: any;

  // repository: ExplanationRepository; staffExists(username) → bool; clock() → ISO; onSelf: chính sách tự duyệt (src/platform/warnings.ts → selfDecision);
  // periodClosed(month) → bool: kỳ đã chốt công (từ attendance_locked trở đi)
  constructor({ repository, staffExists, clock, onSelf, periodClosed }: any) {
    this.repository = repository;
    this.staffExists = staffExists;
    this.clock = clock;
    this.onSelf = onSelf;
    this.periodClosed = periodClosed;
  }

  static DAY_REFUSAL = Object.freeze({
    future: [400, 'EXPLANATION_DAY_FUTURE', 'Chưa tới ngày này nên chưa giải trình được'],
    punched: [409, 'EXPLANATION_DAY_PUNCHED', 'Ngày này đã có lượt Check-in/out: giải trình đi theo lượt chấm công'],
    'off-schedule': [400, 'EXPLANATION_DAY_OFF_SCHEDULE', 'Ngày này không có trong lịch làm việc của bạn'],
    other: [
      409,
      'EXPLANATION_DAY_NOT_ABSENT',
      'Ngày này không phải ngày vắng không phép (đã khai nghỉ hoặc ca chưa kết thúc)'
    ]
  });
  static ABSENT_PROMPT = 'Không có Check-in/Check-out trong ngày';

  static cleanText(value?, label?, { required = true }: any = {}) {
    const text = typeof value === 'string' ? value.trim() : '';
    if (required && !text) throw DomainError.invalid('EXPLANATION_TEXT_REQUIRED', `${label} không được để trống`);
    if (text.length > TEXT_MAX)
      throw DomainError.invalid('EXPLANATION_TEXT_TOO_LONG', `${label} tối đa ${TEXT_MAX} ký tự`);
    return text;
  }

  // Nhân sự giải trình lần bấm không hợp lệ của chính lượt của mình (kind: late-checkout | punch-in | punch-out; prompt: dòng nêu trường hợp);
  // gửi lại cho cùng lượt cùng loại thì cập nhật câu trả lời
  async submitForSession({ username, session, text, kind, prompt }: any) {
    if (!session || session.username !== username)
      throw DomainError.notFound('SESSION_NOT_FOUND', 'Không có lượt chấm công này');
    if (!Explanation.PRESS_KINDS.includes(kind))
      throw DomainError.invalid('BAD_KIND', 'Loại yêu cầu giải trình không hợp lệ');
    const answer = ExplanationService.cleanText(text, 'Giải trình');
    const at = this.clock();
    const existing = await this.repository.forSession(session.id, kind);
    if (existing) return (await this.repository.save(existing.resubmit(answer, at))).view();
    return (
      await this.repository.insert(
        new Explanation({
          username,
          date: session.date,
          kind,
          sessionId: session.id,
          prompt,
          requestedBy: username,
          requestedAt: at,
          status: 'answered',
          answer,
          answeredAt: at
        })
      )
    ).view();
  }

  // Nhân sự giải trình Check-out muộn của chính lượt đang mở
  async submitLate({ username, session, text }: any) {
    return await this.submitForSession({
      username,
      session,
      text,
      kind: 'late-checkout',
      prompt: 'Check-out muộn hơn giờ kết thúc ca'
    });
  }

  // Nhân sự giải trình lượt đã đóng thiếu một đầu giờ. Không sửa giờ chấm và không đi qua LateCheckout.
  async submitMissingPunch({ username, session, text }: any) {
    if (!session || session.username !== username || session.state !== 'closed')
      throw DomainError.notFound('SESSION_NOT_FOUND', 'Không có lượt chấm công này');
    const e = session.entry || {};
    const kind = e.presIn && !e.presOut && e.reason === 'forgot-out' && !e.requestedOut
      ? 'punch-out'
      : (e.forgotIn || (!e.presIn && e.presOut)) ? 'punch-in' : null;
    if (!kind)
      throw DomainError.conflict('SESSION_NOT_MISSING_PUNCH', 'Lượt này không còn thiếu Check-in/out');
    if (await this.repository.forSession(session.id, kind))
      throw DomainError.conflict('EXPLANATION_EXISTS', 'Lượt này đã có giải trình');
    return await this.submitForSession({
      username,
      session,
      text,
      kind,
      prompt: kind === 'punch-in' ? 'Giải trình quên Check-in' : 'Giải trình quên Check-out'
    });
  }

  // Nhân sự tự giải trình ngày vắng không phép của CHÍNH MÌNH: ngày trong lịch, đã qua, không có lượt Check-in/out nào, kỳ chưa chốt công,
  // chưa có giải trình nào về ngày đó (mọi trạng thái). Tạo giải trình loại admin do chính nhân sự gửi (requestedBy = username), chờ Admin duyệt:
  // duyệt thì ngày tính một công theo giờ ca, từ chối thì ngày vắng.
  // stateOf(username, date) → tình trạng của ngày (AbsentDay.stateOf)
  async submitAbsentDay({ username, date, text, stateOf }: any) {
    if (typeof date !== 'string' || !validDate(date))
      throw DomainError.invalid('BAD_DATE', 'Ngày phải là ngày hợp lệ dạng YYYY-MM-DD');
    const answer = ExplanationService.cleanText(text, 'Giải trình');
    const state = await stateOf(username, date);
    if (state !== 'absent') throw new DomainError(...ExplanationService.DAY_REFUSAL[state]);
    if (await this.periodClosed(date.slice(0, 7)))
      throw DomainError.conflict(
        'EXPLANATION_PERIOD_LOCKED',
        'Kỳ lương của ngày này đã chốt công, không giải trình được nữa'
      );
    if (await this.repository.hasOnDay(username, date))
      throw DomainError.conflict('EXPLANATION_EXISTS', 'Ngày này đã có giải trình');
    const at = this.clock();
    return (
      await this.repository.insert(
        new Explanation({
          username,
          date,
          kind: 'admin',
          prompt: ExplanationService.ABSENT_PROMPT,
          requestedBy: username,
          requestedAt: at,
          status: 'answered',
          answer,
          answeredAt: at
        })
      )
    ).view();
  }

  // Admin (hoặc AI, do Admin bấm từ một phát hiện) yêu cầu một người giải trình về một ngày
  async request({ username, date, prompt, kind, requestedBy, ruleId }: any) {
    if (!Explanation.KINDS.includes(kind) || Explanation.PRESS_KINDS.includes(kind))
      throw DomainError.invalid('BAD_KIND', 'Loại yêu cầu giải trình không hợp lệ');
    if (!(await this.staffExists(username))) throw DomainError.notFound('NO_SUCH_USER', 'Không có nhân sự này');
    if (!DATE_RE.test(String(date))) throw DomainError.invalid('BAD_DATE', 'Ngày phải là ngày hợp lệ dạng YYYY-MM-DD');
    return (
      await this.repository.insert(
        new Explanation({
          username,
          date,
          kind,
          prompt: ExplanationService.cleanText(prompt, 'Nội dung cần giải trình'),
          ruleId: ruleId ? String(ruleId).slice(0, RULE_ID_MAX) : null,
          requestedBy,
          requestedAt: this.clock(),
          status: 'requested'
        })
      )
    ).view();
  }

  async answer({ id, username, text }: any) {
    const e = await this.#load(id);
    if (e.username !== username) throw DomainError.forbidden('FORBIDDEN', 'Chỉ trả lời được yêu cầu của chính mình');
    return (
      await this.repository.save(e.answerWith(ExplanationService.cleanText(text, 'Giải trình'), this.clock()))
    ).view();
  }

  // Admin duyệt hoặc không duyệt. expectedRev (tuỳ chọn): số phiên bản Admin đã thấy; isSelf: người duyệt là người giải trình
  async decide({ id, by, approve, note, expectedRev, isSelf }: any) {
    const e = await this.#load(id);
    e.assertRev(expectedRev);
    e.decide({
      by,
      approve,
      note: ExplanationService.cleanText(note, 'Ghi chú', { required: false }),
      at: this.clock(),
      isSelf,
      onSelf: this.onSelf
    });
    return (await this.repository.save(e)).view();
  }

  async #load(id?) {
    const e = await this.repository.byId(id);
    if (!e) throw DomainError.notFound('NOT_FOUND', 'Không có yêu cầu giải trình này');
    return e;
  }

  async byId(id?) {
    const e = await this.repository.byId(id);
    return e ? e.view() : null;
  }

  async heldByUser(month?) {
    return await this.repository.heldByUser(month);
  }

  // Ngày của tháng có giải trình ở bất kỳ trạng thái nào: Map username → Set ngày
  async explainedByUser(month?) {
    return await this.repository.explainedByUser(month);
  }

  async list(filter?) {
    return (await this.repository.list(filter)).map(e => e.view());
  }

  async countOpen(username?) {
    return await this.repository.countOpen(username);
  }

  async forSession(sessionId?, kind?) {
    const e = await this.repository.forSession(sessionId, kind);
    return e ? e.view() : null;
  }

  hasSessionAnswer(sessionId?) {
    return this.repository.hasSessionAnswer(sessionId);
  }
}

export = { ExplanationService, TEXT_MAX };
