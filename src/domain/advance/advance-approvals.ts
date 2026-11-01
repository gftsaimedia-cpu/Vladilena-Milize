'use strict';
// Yêu cầu tạm ứng theo người theo tháng: số tạm ứng luôn là số theo quy tắc (công thức tamUng của bộ máy lương),
// nhân sự không nhập số nào. CHỈ người cần mới bấm "Xin tạm ứng"; Admin duyệt hoặc từ chối. Số chỉ trừ vào phiếu khi yêu cầu ở trạng thái 'approved';
// không xin, đang chờ hay bị từ chối đều là 0 (không có ai "tự động" có yêu cầu).
// Lưu ở bảng settings (không đổi lược đồ DB), một khoá cho mỗi tháng: `advance_approvals_<YYYY-MM>` =
//   { rev, users: { <tên đăng nhập>: { status, rev, requestedAt, requestedBy, decidedAt, decidedBy, reason } } }
// status: 'pending' | 'approved' | 'rejected'; null = không có yêu cầu (đã rút, giữ dòng để rev của người đó không quay về 0).
// rev của tháng tăng ở mỗi lần ghi (duyệt tất cả kiểm rev này); rev của một người tăng ở mỗi lần đổi trạng thái của người đó (gửi, rút, duyệt,
// từ chối, huỷ duyệt kiểm rev này). Lịch sử đầy đủ nằm ở nhật ký (advance.request / withdraw / approve / reject / cancel).
// Lớp này chỉ đọc, ghi, kiểm rev và kiểm bước chuyển trạng thái; quyền, khoá kỳ, điều kiện được ứng, nhật ký và sự kiện do route lo (./routes.js).
const { DomainError } = require('../shared/domain-error');

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const KEY_PREFIX = 'advance_approvals_';
const STATUSES = Object.freeze(['pending', 'approved', 'rejected']);

// Bước chuyển hợp lệ: from = trạng thái phải có trước; code / text = lỗi 409 khi trạng thái không khớp
const MOVES = Object.freeze({
  request: {
    from: [null],
    to: 'pending',
    code: 'ADVANCE_ALREADY_REQUESTED',
    text: 'Tháng này đã có yêu cầu tạm ứng (mỗi tháng một yêu cầu)'
  },
  withdraw: {
    from: ['pending'],
    to: null,
    code: 'ADVANCE_NOT_PENDING',
    text: 'Chỉ rút được yêu cầu tạm ứng đang chờ duyệt'
  },
  approve: {
    from: ['pending'],
    to: 'approved',
    code: 'ADVANCE_NOT_PENDING',
    text: 'Chỉ duyệt được yêu cầu tạm ứng đang chờ duyệt'
  },
  reject: {
    from: ['pending'],
    to: 'rejected',
    code: 'ADVANCE_NOT_PENDING',
    text: 'Chỉ từ chối được yêu cầu tạm ứng đang chờ duyệt'
  },
  // Huỷ duyệt trả yêu cầu về chờ duyệt: yêu cầu của nhân sự vẫn còn, chỉ quyết định của Admin được gỡ
  cancel: {
    from: ['approved'],
    to: 'pending',
    code: 'ADVANCE_NOT_APPROVED',
    text: 'Tạm ứng của người này chưa được duyệt nên không huỷ được'
  }
});

// Một dòng đã lưu → dạng chuẩn. Dòng dạng { approved, by, at } (không qua bước xin) đọc như yêu cầu đã duyệt
function normalize(e?) {
  if (!e || typeof e !== 'object') return null;
  const rev = Number.isSafeInteger(e.rev) ? e.rev : 0;
  const status = STATUSES.includes(e.status) ? e.status : e.approved === true ? 'approved' : null;
  return {
    status,
    rev,
    requestedAt: e.requestedAt ?? null,
    requestedBy: e.requestedBy ?? null,
    decidedAt: e.decidedAt ?? e.at ?? null,
    decidedBy: e.decidedBy ?? e.by ?? null,
    reason: e.reason ?? null
  };
}
const EMPTY = Object.freeze({
  status: null,
  rev: 0,
  requestedAt: null,
  requestedBy: null,
  decidedAt: null,
  decidedBy: null,
  reason: null
});

class AdvanceApprovals {
  declare getSetting: any;
  declare setSetting: any;
  declare clock: any;

  // getSetting(key, fallback) / setSetting(key, value): kho settings (src/platform/db.ts); clock() → ISO
  constructor({ getSetting, setSetting, clock }: any) {
    this.getSetting = getSetting;
    this.setSetting = setSetting;
    this.clock = clock;
  }

  static keyOf(month?) {
    if (!MONTH_RE.test(String(month))) throw DomainError.invalid('BAD_MONTH', 'month phải có dạng YYYY-MM');
    return KEY_PREFIX + month;
  }

  // Bản ghi của tháng; tháng chưa có ai xin: { rev: 0, users: {} }
  async read(month?) {
    const doc = await this.getSetting(AdvanceApprovals.keyOf(month), null);
    const users = doc && doc.users && typeof doc.users === 'object' ? doc.users : {};
    return { rev: doc && Number.isSafeInteger(doc.rev) ? doc.rev : 0, users };
  }

  // Trạng thái của một người trong tháng (chưa từng xin: status null, rev 0)
  async entryOf(month?, username?) {
    return normalize((await this.read(month)).users[username]) || { ...EMPTY };
  }

  // Mọi người có yêu cầu (chờ, đã duyệt, từ chối) của tháng: Map tên đăng nhập → entry. Người đã rút không có
  async requests(month?) {
    const users = (await this.read(month)).users;
    const out = new Map<any, any>();
    for (const u of Object.keys(users)) {
      const e = normalize(users[u]);
      if (e && e.status) out.set(u, e);
    }
    return out;
  }

  // Tập tên đăng nhập có yêu cầu đã được duyệt của tháng (bộ máy lương chỉ trừ tạm ứng cho những người này)
  async approvedSet(month?) {
    return new Set<any>(
      [...(await this.requests(month))].filter(([, e]: any) => e.status === 'approved').map(([u]: any) => u)
    );
  }

  static checkRev(expected?, current?, code?) {
    if (expected === undefined || expected === null) return;
    if (!Number.isSafeInteger(expected) || expected < 0)
      throw DomainError.invalid('BAD_REV', 'expectedRev phải là số nguyên không âm');
    if (expected !== current)
      throw DomainError.conflict(code, 'Yêu cầu tạm ứng đã được người khác đổi, tải lại rồi làm lại', {
        rev: current
      });
  }

  // Bước chuyển của một dòng (không ghi): trả entry mới. Trạng thái không khớp bước thì 409 (code của MOVES)
  static step(before, move, { by, at, reason }: any) {
    const m = MOVES[move];
    if (!m.from.includes(before.status))
      throw DomainError.conflict(m.code, m.text, { rev: before.rev, status: before.status });
    const after = { ...before, status: m.to, rev: before.rev + 1 };
    if (move === 'request')
      return { ...after, requestedAt: at, requestedBy: by, decidedAt: null, decidedBy: null, reason: null };
    if (move === 'withdraw') return { ...after, decidedAt: null, decidedBy: null, reason: null };
    return { ...after, decidedAt: at, decidedBy: by, reason: reason || null };
  }

  // Đổi trạng thái một người. move: 'request' | 'withdraw' | 'approve' | 'reject' | 'cancel'. expectedRev: rev của NGƯỜI đó.
  // Trả { before, after } (dạng entryOf); trạng thái không khớp bước thì 409 và không ghi gì.
  async move(month, username, move, { expectedRev, by, reason }: any) {
    const doc = await this.read(month);
    const before = await this.entryOf(month, username);
    AdvanceApprovals.checkRev(expectedRev, before.rev, 'ADVANCE_REQUEST_STALE');
    const after = AdvanceApprovals.step(before, move, { by, at: this.clock(), reason });
    await this.setSetting(AdvanceApprovals.keyOf(month), {
      rev: doc.rev + 1,
      users: { ...doc.users, [username]: after }
    });
    return { before, after };
  }

  // Duyệt nhiều yêu cầu đang chờ một lần. expectedRev: rev của THÁNG. Người không còn chờ bị bỏ qua.
  // Trả danh sách { username, before, after } của người vừa duyệt.
  async approveMany(month, usernames, { expectedRev, by }: any) {
    const doc = await this.read(month);
    AdvanceApprovals.checkRev(expectedRev, doc.rev, 'ADVANCE_REQUESTS_STALE');
    const at = this.clock();
    const users = { ...doc.users };
    const done: any[] = [];
    for (const username of usernames) {
      const before = await this.entryOf(month, username);
      if (before.status !== 'pending') continue;
      const after = AdvanceApprovals.step(before, 'approve', { by, at });
      users[username] = after;
      done.push({ username, before, after });
    }
    if (done.length) await this.setSetting(AdvanceApprovals.keyOf(month), { rev: doc.rev + 1, users });
    return done;
  }
}

export = { AdvanceApprovals, STATUSES };
