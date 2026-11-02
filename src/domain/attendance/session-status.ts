'use strict';
// Trạng thái hiển thị của MỘT lượt chấm công (màn Chấm công của Admin và app nhân viên chỉ đọc trường này):
//   'admin'       lượt Admin tự ghi: lượt khai thay hoặc lượt ghi theo giờ ca khi duyệt giải trình quên chấm (entry.origin = ADMIN_ORIGIN),
//                 hoặc giờ Admin ghi thẳng (src 'admin') không đến từ việc duyệt một yêu cầu điều chỉnh của nhân viên; không xét giờ.
//                 Ngày có giải trình ngày (Admin yêu cầu / AI đề nghị) mới nhất bị từ chối thì lượt Admin không thắng nữa: nhãn là 'rejected'.
//   'rejected'    quyết định mới nhất về lượt (giải trình gắn session_id, giải trình của ngày công, yêu cầu điều chỉnh) là không duyệt.
//   'approved'    quyết định mới nhất là duyệt; không có quyết định nào mà lượt mang entry.attendanceApproved (Admin xác nhận thiếu giờ).
//   'pending'     giờ vào / ra chưa hợp lệ và chưa có quyết định, hoặc đang có giải trình chờ xử lý (xem #issues). Yêu cầu điều
//                 chỉnh còn 'pending' không tính: không còn chỗ nào duyệt được nó, lượt theo giờ vào / ra.
//   'checked-in'  lượt đang mở, giờ vào hợp lệ.
//   'checked-out' lượt đã đóng, giờ vào / ra hợp lệ.
// Thứ tự ưu tiên: admin > quyết định mới nhất (rejected / approved / chờ xử lý) > giờ không hợp lệ > checked-in / checked-out.
// Duyệt OT, giờ làm thêm, đi làm ngày lễ không phải trạng thái: lượt có giờ vào / ra hợp lệ vẫn là 'checked-out'.
// Thuần: không đọc DB; giải trình của lượt và ngày khai trong lịch do nơi gọi đưa vào.

const MS_PER_MIN = 60000;
const DECIDED = ['approved', 'rejected'];
const OPEN_EXPLANATION = ['requested', 'answered'];
const IN_CASES = ['offShift', 'late', 'forgotIn', 'outsideZone']; // trường hợp Check-in không hợp lệ
const OUT_CASES = ['early', 'lateOut']; // trường hợp Check-out không hợp lệ
// Trường hợp mà giải trình lúc bấm của mỗi đầu giải quyết (Check-in còn gồm lượt thứ hai trong ca, ghi lúc bấm Check-in)
const COVERS = { 'punch-in': [...IN_CASES, 'multiple'], 'punch-out': OUT_CASES };
const REVIEW_REASONS = ['needs-review', 'legacy-review'];

// Câu ngắn giải thích trạng thái (chữ nhỏ dưới nhãn, không phải nhãn)
const NOTE = Object.freeze({
  late: (min?) => `Vào trễ ${min} phút`,
  early: (min?) => `Về sớm ${min} phút`,
  lateOut: (min?) => (min > 0 ? `Check-out muộn ${min} phút` : 'Check-out muộn'),
  forgotOut: 'Quên Check-out',
  forgotIn: 'Quên Check-in',
  offShift: 'Ngoài ca',
  outsideZone: 'Ngoài vùng GPS',
  multiple: 'Nhiều lượt trong một ca',
  review: 'Cần đối soát giờ chấm',
  other: 'Cần Admin xem lại',
  answered: 'Đã gửi giải trình, chờ Admin',
  requested: 'Chờ nhân viên giải trình',
  explanation: 'Giải trình Check-out muộn',
  pressExplanation: 'Giải trình lúc bấm',
  dayExplanation: 'Giải trình',
  correction: 'Yêu cầu điều chỉnh giờ',
  shortHours: 'Thiếu giờ'
});

const time = (iso?) => {
  const ms = typeof iso === 'string' ? Date.parse(iso) : NaN;
  return Number.isFinite(ms) ? ms : NaN;
};

class SessionStatus {
  declare rules: any;
  declare checkoutGraceMin: any;
  declare lateCheckoutMin: any;
  declare adminOrigin: any;

  static NOTE = NOTE;

  // rules(month) → { graceMin, lateMinutes(plannedShift, presIn) }: ngưỡng trễ attendance.graceMin và cách đo phút trễ của
  //   ActualHours (rulesFor(tháng).actualHours) của tháng chứa ngày công;
  // checkoutGraceMin: config.CHECKOUT_GRACE_MIN; lateCheckoutMin(session, atIso, sheetDay): số phút Check-out muộn
  //   (src/domain/explanation/late-checkout.ts, cùng cách đo với lúc bấm Check-out); adminOrigin: dấu lượt Admin khai thay.
  constructor({ rules, checkoutGraceMin, lateCheckoutMin, adminOrigin }: any) {
    this.rules = rules;
    this.checkoutGraceMin = checkoutGraceMin;
    this.lateCheckoutMin = lateCheckoutMin;
    this.adminOrigin = adminOrigin;
  }

  // session: lượt kèm corrections (./session-view.js → sessionsWithHistory); explanations: giải trình có session_id của lượt
  // (Explanation hoặc dạng view()) cộng giải trình đã quyết định của ngày công (không có session_id); sheetDay: ngày khai của lượt
  // trong Lịch ước tính (phần làm thêm sau ca nới giờ Check-out được phép).
  // Trả { status, statusNote }.
  async classify(session?, { explanations = [], sheetDay = null }: any = {}) {
    const e = (session && session.entry) || {};
    const corrections = (session && session.corrections) || [];
    const correctionApproved = corrections.some(c => c.status === 'approved');
    const latest = latestDecision(explanations, corrections);
    const byAdmin = e.origin === this.adminOrigin || (e.src === 'admin' && !correctionApproved);
    if (byAdmin && !(latest && latest.dayRejected)) return result('admin', '');
    const found = await this.#findings(session, sheetDay);
    const issues = found.map(f => f.note);
    if (latest && latest.status !== 'pending') {
      // Giải trình lúc bấm đã duyệt chỉ che các trường hợp của đầu mình (Check-in hoặc Check-out); lý do khác (quên Check-out …) vẫn chờ xử lý
      const rest =
        latest.status === 'approved' && latest.covers ? found.filter(f => !latest.covers.includes(f.code)) : [];
      if (rest.length) return result('pending', rest.map(f => f.note).join(' · '));
      return result(latest.status, decidedNote(latest, issues[0]));
    }
    if (latest) return result('pending', latest.note);
    if (e.attendanceApproved) return result('approved', issues[0] || NOTE.shortHours);
    if (issues.length) return result('pending', issues.join(' · '));
    return result(session.state === 'open' ? 'checked-in' : 'checked-out', '');
  }

  // Các trường hợp lần bấm chưa hợp lệ, tính trên lượt đang dựng lúc bấm (chưa lưu): cùng luật với nhãn của lượt.
  //   side 'in'  (lượt vừa mở): { code: 'offShift' | 'late' | 'outsideZone', minutes, note };
  //   side 'out' (lượt vừa đóng): { code: 'early' | 'lateOut', minutes, note }.
  // minutes là số phút trễ / về sớm / Check-out muộn (0 với trường hợp không đo bằng phút).
  async pressCases(session?, side?, sheetDay: any = null) {
    const codes = side === 'in' ? IN_CASES : OUT_CASES;
    return (await this.#findings(session, sheetDay)).filter(f => codes.includes(f.code));
  }

  // Các lý do giờ vào / ra chưa hợp lệ (rỗng = hợp lệ), mỗi lý do { code, minutes, note }
  async #findings(session?, sheetDay?) {
    const e = session.entry || {};
    const out: any[] = [];
    const add = (code?, note?, minutes = 0) => {
      if (note && !out.some(f => f.note === note)) out.push({ code, minutes, note });
    };
    // Lượt ngoài ca / chờ đối soát không so với ca (khoảng có mặt không nằm trong ca thì phút trễ / về sớm vô nghĩa)
    const offShift = e.outsideShift || (e.kind === 'pending' && e.reason === 'off-shift');
    const comparable = !offShift && !REVIEW_REASONS.includes(e.reason);
    const planned =
      comparable && e.plannedShift && e.plannedShift.startIso && e.plannedShift.endIso ? e.plannedShift : null;
    const hasIn = Number.isFinite(time(e.presIn)),
      hasOut = Number.isFinite(time(e.presOut));
    if (session.state !== 'open' && !hasIn && hasOut) add('forgotIn', NOTE.forgotIn);
    if (session.state !== 'open' && e.kind === 'pending') {
      if (e.reason === 'forgot-out') {
        if (!e.requestedOut) add('forgotOut', NOTE.forgotOut);
        else {
          const min = this.#lateOut(session, e.requestedOut, sheetDay);
          add('lateOut', NOTE.lateOut(min), min);
        }
      } else if (e.reason === 'off-shift') add('offShift', NOTE.offShift);
      else if (e.reason === 'multiple-sessions') add('multiple', NOTE.multiple);
      else if (REVIEW_REASONS.includes(e.reason)) add('review', NOTE.review);
      else if (e.reason !== 'incomplete-shift' && e.reason !== 'open' && !out.length) add('other', NOTE.other);
    }
    if (session.state !== 'open' && hasIn && !hasOut && e.kind !== 'pending') add('forgotOut', NOTE.forgotOut);
    if (offShift || (comparable && !planned)) add('offShift', NOTE.offShift);
    if (e.forgotIn) add('forgotIn', NOTE.forgotIn);
    if (planned && hasIn) {
      const { graceMin, lateMinutes } = await this.rules((planned.date || session.date || '').slice(0, 7));
      const late = lateMinutes(planned, e.presIn) || 0;
      if (late > 30) add('forgotIn', NOTE.forgotIn, late);
      else if (late > graceMin) add('late', NOTE.late(late), late);
    }
    if (planned && hasIn && hasOut && session.state !== 'open') {
      const early = Math.ceil((time(planned.endIso) - time(e.presOut)) / MS_PER_MIN);
      if (early > 0) add('early', NOTE.early(early), early);
      const lateOut = this.#lateOut(session, e.presOut, sheetDay);
      if (lateOut >= this.checkoutGraceMin) add('lateOut', NOTE.lateOut(lateOut), lateOut);
    }
    if (e.outsideZone) add('outsideZone', NOTE.outsideZone);
    return out;
  }

  #lateOut(session?, atIso?, sheetDay?) {
    return this.lateCheckoutMin(session, atIso, sheetDay) || 0;
  }
}

const result = (status?, statusNote?) => ({ status, statusNote: statusNote || '' });

// Lý do của lượt đã có quyết định: lý do giờ đầu tiên; quyết định về yêu cầu điều chỉnh ghi thêm đối tượng ở trước
// ("Yêu cầu điều chỉnh giờ · Vào trễ 20 phút"); không còn lý do giờ thì chỉ ghi đối tượng của quyết định.
const explanationNote = (x?) =>
  !x.sessionId ? NOTE.dayExplanation : /^punch-/.test(x.kind || '') ? NOTE.pressExplanation : NOTE.explanation;

function decidedNote(latest?, issue?) {
  if (!issue) return latest.note;
  return latest.source === 'correction' ? `${latest.note} · ${issue}` : issue;
}

// Lượt có nhiều giải trình gắn với lượt (Check-in và Check-out cùng không hợp lệ): bị từ chối thắng, rồi còn chờ, rồi đã duyệt (cùng mức thì
// lấy cái mới hơn), để một đầu đã duyệt không che đầu kia còn chờ hoặc bị từ chối. Giải trình của ngày công (không gắn lượt) giữ nguyên.
const OUTCOME_RANK = { rejected: 3, answered: 2, requested: 2, approved: 1 };
function onePerSession(explanations?) {
  const linked = (explanations || []).filter(x => x.sessionId && OUTCOME_RANK[x.status]);
  if (linked.length < 2) return explanations || [];
  const key = (x?) => [OUTCOME_RANK[x.status], time(x.decidedAt || x.answeredAt || x.requestedAt) || 0];
  const best = linked.reduce((a, b) => {
    const [ra, ta] = key(a),
      [rb, tb] = key(b);
    return rb > ra || (rb === ra && tb >= ta) ? b : a;
  });
  return [...explanations.filter(x => !linked.includes(x)), best];
}

// Việc mới nhất về lượt: quyết định duyệt / không duyệt (lúc quyết định), hoặc giải trình còn chờ (lúc gửi). null = chưa có gì.
// Yêu cầu điều chỉnh chỉ tính khi đã duyệt / không duyệt; 'pending' và 'replaced' bỏ qua.
function latestDecision(explanations?, corrections?) {
  const items: any[] = [];
  const linkedKinds = (explanations || []).filter(x => x.sessionId).map(x => x.kind);
  // Mọi giải trình gắn lượt đều là loại lúc bấm thì quyết định che đúng các trường hợp của các đầu đó; có Check-out muộn thì che cả lượt
  const covers =
    linkedKinds.length && linkedKinds.every(k => COVERS[k]) ? linkedKinds.flatMap(k => COVERS[k]) : undefined;
  for (const x of onePerSession(explanations)) {
    if (DECIDED.includes(x.status))
      items.push({
        at: x.decidedAt || x.answeredAt || x.requestedAt,
        status: x.status,
        note: explanationNote(x),
        source: 'explanation',
        ...(x.sessionId && covers ? { covers } : {}),
        dayRejected: !x.sessionId && x.status === 'rejected'
      });
    else if (OPEN_EXPLANATION.includes(x.status))
      items.push({
        at: x.answeredAt || x.requestedAt,
        status: 'pending',
        note: x.status === 'answered' ? NOTE.answered : NOTE.requested,
        source: 'explanation'
      });
  }
  for (const c of corrections || []) {
    if (DECIDED.includes(c.status))
      items.push({ at: c.decided_at || c.created_at, status: c.status, note: NOTE.correction, source: 'correction' });
  }
  let best: any = null;
  for (const item of items) {
    const at = time(item.at);
    if (!best || (Number.isFinite(at) && !(at < best.ms))) best = { ...item, ms: Number.isFinite(at) ? at : -Infinity };
  }
  return best;
}

export = { SessionStatus, latestDecision };
