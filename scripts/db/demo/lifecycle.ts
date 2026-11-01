'use strict';
// Lớp "vận hành" của bộ dữ liệu demo: sau khi generate.js dựng nhân sự, lịch, chấm công, khoản chờ duyệt và KPI, file này đi tiếp bằng ĐÚNG
// các route của máy chủ thật (trong cùng tiến trình, đồng hồ giả) để các bảng còn lại và mọi trạng thái vòng đời có dữ liệu thật:
// vai trò (có vai trò tuỳ chỉnh và vai trò bị thu hồi), tham số theo tháng áp dụng, khoản điền thêm (chờ / duyệt / huỷ / cờ chờ Kế toán),
// giải trình (yêu cầu của Admin, trả lời, duyệt, từ chối), tạm ứng (xin / rút / duyệt / từ chối / huỷ duyệt), sổ phép, kỳ lương ở MỌI trạng thái
// (mở, đã chốt công, đã tính, đã AI kiểm, đã duyệt, đã chi trả, mở lại rồi tính lần hai), số sửa phiếu, bỏ qua phát hiện của AI, bảng nhớ lượt bấm.
// Mỗi bước độc lập: lỗi một bước chỉ ghi vào báo cáo (HTTP, mã lỗi), không dừng cả lần dựng; test/db/demo-coverage.test.ts đòi báo cáo sạch.
const crypto = require('node:crypto');

const short = (data?) => JSON.stringify(data).slice(0, 240);

class Lifecycle {
  [key: string]: any;

  declare report: any;
  declare base: any;
  declare customRole: any;
  declare accountant: any;

  /**
   * @param {{ store: any, auth: any, server: any, admin: string, personas: any[], today: string }} deps
   */
  constructor({ store, auth, server, admin, personas, today }: any) {
    Object.assign(this, { store, auth, server, admin, personas, today, clock: '12:00:00' });
    this.report = [];
    this.base = '';
  }

  async call(method?, route?, body?, who = this.admin) {
    const response = await fetch(this.base + '/api' + route, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Cookie: this.auth.cookieHeader(await this.auth.createSession(who), 86400)
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    return { status: response.status, data: (await response.json().catch(() => ({}))) as any };
  }

  /** Chạy một bước; lỗi (ném hoặc HTTP khác 2xx ở bước ghi nhận là bắt buộc) vào báo cáo. */
  async step(name?, run?) {
    try {
      const result = await run();
      this.report.push({ name, ok: true, detail: result === undefined ? '' : String(result) });
    } catch (error) {
      this.report.push({ name, ok: false, detail: error.message });
    }
  }
  ok(res?, what?) {
    if (res.status < 200 || res.status >= 300) throw new Error(`${what}: HTTP ${res.status} ${short(res.data)}`);
    return res.data;
  }

  person(predicate?) {
    return this.personas.find(predicate);
  }

  /** Chạy fn với đồng hồ giả đặt ở `iso` (giờ Việt Nam); trả lại đồng hồ cũ khi xong. */
  async at(iso?, fn?) {
    const before = Date.now;
    Date.now = () => Date.parse(`${iso}+07:00`);
    try {
      return await fn();
    } finally {
      Date.now = before;
    }
  }

  async open() {
    await new Promise(resolve => this.server.listen(0, '127.0.0.1', resolve));
    this.base = `http://127.0.0.1:${this.server.address().port}`;
    // Dựng dữ liệu là một người (Admin) ghi hàng trăm lệnh liên tiếp: bỏ giới hạn tốc độ ghi theo người của máy chủ này (chỉ trong tiến trình dựng)
    const limiter = this.server.limits && this.server.limits.writeLimiter;
    if (limiter) {
      limiter.capacity = 1e9;
      limiter.refillPerMs = 1e9;
      limiter.buckets.clear();
    }
  }

  async close() {
    this.server.closeAllConnections();
    await new Promise(resolve => this.server.close(resolve));
  }

  /** Phần chạy trước lớp vận hành chính: cấu hình mà các kỳ vọng của persona dựa vào. */
  async prepare() {
    await this.step('tham số theo tháng áp dụng', () => this.at(`${this.today}T${this.clock}`, () => this.params()));
    return this.report;
  }

  /** Phần chạy SAU tự kiểm. */
  async run() {
    try {
      await this.step('vai trò', () => this.at(`${this.today}T${this.clock}`, () => this.roles()));
      await this.step('khoản điền thêm', () => this.at(`${this.today}T${this.clock}`, () => this.payEntries()));
      await this.step('khoản chờ duyệt bị từ chối', () =>
        this.at(`${this.today}T${this.clock}`, () => this.rejections())
      );
      await this.step('giải trình', () => this.at(`${this.today}T${this.clock}`, () => this.explanations()));
      await this.step('Check-out muộn kèm giải trình (POST /punch)', () =>
        this.at(`${this.today}T19:30:00`, () => this.lateCheckouts())
      );
      await this.step('lịch sử yêu cầu ứng lương cũ', () => this.legacyAdvanceHistory());
      // cửa sổ xin tạm ứng chỉ mở ngày 16 và 17 hằng tháng (src/domain/advance/advance-request-window.ts)
      await this.step('tạm ứng', () => this.at(`${this.today.slice(0, 7)}-16T${this.clock}`, () => this.advances()));
      await this.step('sổ phép', () => this.at(`${this.today}T${this.clock}`, () => this.leave()));
      await this.step('kỳ lương ở mọi trạng thái', () => this.at(`${this.today}T${this.clock}`, () => this.periods()));
      await this.step('số sửa phiếu', () => this.at(`${this.today}T${this.clock}`, () => this.overridesAndFindings()));
      await this.step('bảng nhớ lượt bấm', () => this.punchRequests());
    } catch (error) {
      this.report.push({ name: 'lớp vận hành', ok: false, detail: error.message });
    }
    return this.report;
  }

  /* ---------- vai trò ---------- */
  async roles() {
    const staff = this.personas.filter(p => !p.unreasonable && p.type === 'nv').slice(0, 6);
    const grants = [
      [staff[0], ['staff', 'hr']],
      [staff[1], ['staff', 'cb']],
      [staff[2], ['staff', 'accounting']],
      [staff[3], ['staff', 'manager']]
    ];
    for (const [p, roles] of grants)
      this.ok(
        await this.call('PUT', `/staff/${p.username}/roles`, { roles, reason: 'Demo: gán vai trò' }),
        `gán vai trò ${p.username}`
      );
    // thu hồi: staff[3] không còn manager (dòng staff_roles có revoked_at)
    this.ok(
      await this.call('PUT', `/staff/${staff[3].username}/roles`, {
        roles: ['staff'],
        reason: 'Demo: thu hồi vai trò'
      }),
      'thu hồi vai trò'
    );
    const custom = this.ok(
      await this.call('POST', '/roles', {
        label: 'Điều phối ca (demo)',
        caps: ['attendance.read', 'attendance.correct'],
        reason: 'Demo: vai trò tuỳ chỉnh'
      }),
      'tạo vai trò tuỳ chỉnh'
    );
    const retired = this.ok(
      await this.call('POST', '/roles', {
        label: 'Vai trò ngưng dùng (demo)',
        caps: ['report.read'],
        reason: 'Demo: vai trò sẽ ngưng dùng'
      }),
      'tạo vai trò thứ hai'
    );
    const code = (x?) => (x.role && x.role.code) || x.code;
    this.ok(
      await this.call('POST', `/roles/${encodeURIComponent(code(retired))}/deprecate`, {
        rev: (retired.role && retired.role.rev) || retired.rev || 0,
        reason: 'Demo: ngưng dùng'
      }),
      'ngưng dùng vai trò'
    );
    this.customRole = code(custom);
    this.accountant = staff[1].username; // vai trò C&B (cb): duyệt khoản điền thêm (payroll.approve) khác người lập
    return `${grants.length} người được gán, 1 thu hồi, 2 vai trò tuỳ chỉnh (1 ngưng dùng)`;
  }

  /* ---------- tham số ---------- */
  async params() {
    const view = this.ok(await this.call('GET', '/settings/version'), 'đọc số phiên bản cấu hình');
    const rev = view.configRev !== undefined ? view.configRev : view.rev;
    const saved = this.ok(
      await this.call('PUT', '/settings/params', {
        changes: [{ key: 'period.payDay', value: 11 }],
        effectiveMonth: '2026-10',
        reason: 'Demo: đổi ngày trả lương dự kiến để bộ dữ liệu có dòng param_versions',
        expectedRev: rev
      }),
      'lưu tham số'
    );
    return `period.payDay = 11 từ 2026-10 (rev ${saved.configRev !== undefined ? saved.configRev : '?'})`;
  }

  /* ---------- khoản điền thêm ---------- */
  async payEntries() {
    const [a, b, c, d] = this.personas.filter(p => !p.unreasonable && p.type === 'nv').slice(6, 10);
    const month = '2026-10';
    const mk = (p?, extra: any = {}) => ({
      username: p.username,
      month,
      direction: 'add',
      amount: 500000,
      label: 'Thưởng đột xuất (demo)',
      reason: 'Demo: khoản điền thêm',
      ...extra
    });
    const entries: Record<string, any> = {};
    entries.pending = this.ok(await this.call('POST', '/pay-entries', mk(a)), 'lập khoản').entry;
    entries.approved = this.ok(
      await this.call('POST', '/pay-entries', mk(b, { label: 'Phụ cấp đặc biệt (demo)' })),
      'lập khoản 2'
    ).entry;
    entries.deduct = this.ok(
      await this.call(
        'POST',
        '/pay-entries',
        mk(c, { direction: 'deduct', amount: 200000, label: 'Khấu trừ khác (demo)' })
      ),
      'lập khoản trừ'
    ).entry;
    entries.void = this.ok(
      await this.call('POST', '/pay-entries', mk(d, { label: 'Khoản sẽ huỷ (demo)' })),
      'lập khoản huỷ'
    ).entry;
    const bulk = this.ok(
      await this.call('POST', '/pay-entries/bulk', {
        entries: [mk(a, { amount: 100000, label: 'Lô 1 (demo)' }), mk(b, { amount: 150000, label: 'Lô 2 (demo)' })]
      }),
      'lập lô'
    );
    // Khoản trừ lớn cho người làm ít (demo_net_neg): thực nhận không dương → luật AI "net-nonpositive" bắn ở lần AI kiểm của kỳ
    const netNeg = this.person(p => p.key === 'net_neg' || p.username === 'demo_net_neg');
    if (netNeg) {
      const big = this.ok(
        await this.call(
          'POST',
          '/pay-entries',
          mk(netNeg, {
            direction: 'deduct',
            amount: 6000000,
            label: 'Khoản trừ lớn (demo)',
            reason: 'Demo: để thực nhận âm'
          })
        ),
        'lập khoản trừ lớn'
      ).entry;
      entries.bigDeduct = big;
    }
    // duyệt bởi người khác (Kế toán): cần vai trò payroll.approve
    const decider = this.accountant || this.admin;
    this.ok(
      await this.call(
        'PUT',
        `/pay-entries/${entries.approved.id}/decide`,
        { decision: 'approved', note: 'Demo: duyệt', rev: entries.approved.rev },
        decider
      ),
      'duyệt khoản'
    );
    this.ok(
      await this.call('PUT', `/pay-entries/${entries.deduct.id}/decide`, {
        decision: 'rejected',
        note: 'Demo: không duyệt',
        rev: entries.deduct.rev
      }),
      'từ chối khoản'
    );
    if (entries.bigDeduct)
      this.ok(
        await this.call(
          'PUT',
          `/pay-entries/${entries.bigDeduct.id}/decide`,
          { decision: 'approved', note: 'Demo: duyệt khoản trừ lớn', rev: entries.bigDeduct.rev },
          decider
        ),
        'duyệt khoản trừ lớn'
      );
    this.ok(
      await this.call('POST', `/pay-entries/${entries.void.id}/void`, {
        rev: entries.void.rev,
        reason: 'Demo: lập nhầm'
      }),
      'huỷ khoản'
    );
    return `${Object.keys(entries).length} khoản + lô ${bulk.count}: chờ duyệt, duyệt, từ chối, huỷ`;
  }

  /* ---------- giải trình ---------- */
  async explanations() {
    const [a, b, c] = this.personas.filter(p => !p.unreasonable && p.type === 'nv').slice(10, 13);
    const day = '2026-10-06';
    const made: any[] = [];
    for (const p of [a, b, c]) {
      const res = await this.call('POST', '/explanations', {
        username: p.username,
        date: day,
        prompt: 'Demo: xin giải trình ngày này'
      });
      made.push(this.ok(res, `yêu cầu giải trình ${p.username}`).item);
    }
    const answered = this.ok(
      await this.call(
        'POST',
        `/explanations/${made[0].id}/answer`,
        { text: 'Demo: em quên Check-out do họp muộn' },
        a.username
      ),
      'trả lời giải trình'
    );
    this.ok(
      await this.call('POST', `/explanations/${made[0].id}/decide`, {
        approve: true,
        note: 'Demo: chấp nhận',
        expectedRev: answered.item.rev
      }),
      'duyệt giải trình'
    );
    const answered2 = this.ok(
      await this.call(
        'POST',
        `/explanations/${made[1].id}/answer`,
        { text: 'Demo: lý do chưa thuyết phục' },
        b.username
      ),
      'trả lời giải trình 2'
    );
    this.ok(
      await this.call('POST', `/explanations/${made[1].id}/decide`, {
        approve: false,
        note: 'Demo: không chấp nhận',
        expectedRev: answered2.item.rev
      }),
      'từ chối giải trình'
    );
    // made[2] để ở trạng thái "đã hỏi, chưa trả lời"
    return 'giải trình: đã duyệt, bị từ chối, đang chờ trả lời';
  }

  /* ---------- khoản chờ duyệt bị từ chối ---------- */
  // Mỗi loại khoản còn sống (isat, approved, ot, makeup_hours, leave, willmakeup) có ít nhất một khoản ở trạng thái "rejected"
  async rejections() {
    const have = new Set<any>(
      (await this.store.db.prepare("SELECT item FROM sheet_approvals WHERE status = 'rejected'").all()).map(r => r.item)
    );
    const queue = this.ok(
      await this.call('GET', '/approvals?month=2026-10&status=pending&pageSize=500'),
      'đọc hàng chờ duyệt'
    );
    const rejected: any[] = [];
    for (const item of ['isat', 'approved', 'ot', 'makeup_hours', 'leave', 'willmakeup']) {
      if (have.has(item)) continue;
      const row = (queue.items || []).find(x => x.item === item);
      if (!row) continue;
      this.ok(
        await this.call('PUT', '/approvals/decide', {
          action: 'reject',
          items: [{ username: row.username, date: row.date, rev: row.rev, fingerprint: row.fingerprint }],
          note: 'Demo: không hợp lệ'
        }),
        'từ chối khoản ' + item
      );
      rejected.push(item);
    }
    return 'từ chối thêm khoản: ' + (rejected.join(', ') || '(đã đủ)');
  }

  /* ---------- Check-out muộn: đúng luồng POST /punch ---------- */
  // 19:30 là quá giờ ra ca (17:00) lẫn thời gian chờ: lượt ra phải kèm giải trình → bản ghi "late-checkout" và dòng bảng nhớ requestId
  async lateCheckouts() {
    const open = await this.store.db
      .prepare("SELECT id, username FROM attendance_sessions WHERE state = 'open' AND date = ? ORDER BY id")
      .all(this.today);
    const picks = open.filter(r => !/broken|bad|a_gaps/.test(r.username)).slice(0, 6);
    if (picks.length < 4) throw new Error('không đủ phiên mở trong ngày để thử Check-out muộn');
    const made: any[] = [];
    for (const [i, row] of picks.entries()) {
      const out = await this.call(
        'POST',
        '/punch',
        {
          type: 'out',
          sessionId: row.id,
          requestId: 'demo-late-' + (i + 1),
          explanation: 'Demo: chờ khách ký biên bản'
        },
        row.username
      );
      this.ok(out, 'Check-out muộn ' + row.username);
      made.push(row.username);
    }
    const list = this.ok(
      await this.call('GET', '/explanations?status=answered'),
      'đọc giải trình đã trả lời'
    ).items.filter(x => x.kind === 'late-checkout');
    if (list.length < 3)
      throw new Error(
        'chỉ có ' + list.length + ' giải trình Check-out muộn (cần 3): ' + short(list.map(x => [x.username, x.status]))
      );
    this.ok(
      await this.call('POST', `/explanations/${list[0].id}/decide`, {
        approve: true,
        note: 'Demo: chấp nhận Check-out muộn',
        expectedRev: list[0].rev
      }),
      'duyệt Check-out muộn'
    );
    this.ok(
      await this.call('POST', `/explanations/${list[1].id}/decide`, {
        approve: false,
        note: 'Demo: không chấp nhận',
        expectedRev: list[1].rev
      }),
      'từ chối Check-out muộn'
    );
    // giải trình do AI yêu cầu (kind "ai") và ngày vắng tự giải trình
    const ai = this.personas.find(p => !p.unreasonable && p.type === 'nv');
    this.ok(
      await this.call('POST', '/explanations', {
        username: ai.username,
        date: '2026-10-07',
        prompt: 'Demo: AI thấy ngày này lệch dữ liệu',
        source: 'ai',
        ruleId: 'ot-checkin-mismatch'
      }),
      'giải trình do AI yêu cầu'
    );
    return `Check-out muộn của ${made.length} người (duyệt, từ chối, chờ); 1 giải trình do AI yêu cầu`;
  }

  /* ---------- lịch sử yêu cầu ứng lương cũ ---------- */
  // Bảng advance_requests chỉ còn đọc (gửi và duyệt trả 410 ADVANCE_REQUEST_RETIRED): dòng lịch sử cũ nạp thẳng, đủ 4 trạng thái
  async legacyAdvanceHistory() {
    const people = this.personas.filter(p => !p.unreasonable && p.type === 'nv').slice(18, 22);
    const states = [
      ['pending', null, null],
      ['approved', 1500000, 'granted'],
      ['rejected', null, null],
      ['cancelled', null, null]
    ];
    const insert = this.store.db.prepare(
      'INSERT INTO advance_requests (username, month, amount, cap, note, status, granted, rev, created_at, decided_by, decided_at, decision_note, cancelled_by, cancelled_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)'
    );
    for (const [i, [status, granted]] of states.entries()) {
      const decided = status === 'approved' || status === 'rejected';
      const cancelled = status === 'cancelled';
      await insert.run(
        people[i].username,
        '2026-09',
        2000000,
        3000000,
        'Demo: yêu cầu cũ',
        status,
        granted,
        '2026-09-16T05:00:00.000Z',
        decided ? this.admin : null,
        decided ? '2026-09-17T05:00:00.000Z' : null,
        decided ? 'Demo' : null,
        cancelled ? people[i].username : null,
        cancelled ? '2026-09-16T08:00:00.000Z' : null
      );
    }
    return '4 dòng lịch sử (chờ, duyệt, từ chối, huỷ)';
  }

  /* ---------- tạm ứng ---------- */
  async advances() {
    const people = this.personas.filter(p => !p.unreasonable && p.type === 'nv' && p.advanceOn !== false).slice(13, 18);
    const month = '2026-11';
    const results: any[] = [];
    for (const p of people) {
      const r = await this.call('POST', '/advance-approvals/request', { month }, p.username);
      results.push([p.username, r.status, r.data && r.data.code]);
    }
    const good = results.filter(r => r[1] === 200).map(r => r[0]);
    if (good.length < 3) throw new Error('chỉ ' + good.length + ' người xin được tạm ứng: ' + short(results));
    const decide = (route?, who?) =>
      this.call('POST', `/advance-approvals/${route}`, { month, username: who, reason: 'Demo' });
    this.ok(await decide('approve', good[0]), 'duyệt tạm ứng');
    this.ok(await decide('reject', good[1]), 'từ chối tạm ứng');
    this.ok(await decide('approve', good[2]), 'duyệt tạm ứng 2');
    this.ok(await decide('cancel', good[2]), 'huỷ duyệt tạm ứng');
    if (good[3]) this.ok(await this.call('POST', '/advance-approvals/withdraw', { month }, good[3]), 'rút tạm ứng');
    return `tạm ứng: duyệt, từ chối, huỷ duyệt${good[3] ? ', rút' : ''}`;
  }

  /* ---------- sổ phép ---------- */
  async leave() {
    const r = this.ok(await this.call('POST', '/leave/refresh', {}), 'tính lại sổ phép mọi người');
    return `sổ phép: ${short(r)}`;
  }

  /* ---------- kỳ lương ---------- */
  async revOf(month?) {
    return (await this.call('GET', `/periods/${month}`)).data.rev;
  }
  async lockAndCalculate(month?) {
    const view = (await this.call('GET', `/periods/${month}`)).data;
    let step = await this.call('POST', `/periods/${month}/lock-attendance`, { rev: view.rev });
    if (step.status === 409 && step.data.checklist) {
      const acknowledge = step.data.checklist.filter(i => i.acknowledgeable).map(i => i.code);
      step = await this.call('POST', `/periods/${month}/lock-attendance`, {
        rev: view.rev,
        acknowledge,
        reason: 'Demo: bỏ qua danh sách kiểm để dựng dữ liệu'
      });
    }
    this.ok(step, `chốt công ${month}`);
    this.ok(
      await this.call('POST', `/periods/${month}/calculate`, { rev: await this.revOf(month) }),
      `tính lương ${month}`
    );
  }
  async slipList(month?) {
    const rows: any[] = [];
    for (let page = 1; ; page++) {
      const got = (await this.call('GET', `/periods/${month}/payslips?pageSize=200&page=${page}`)).data;
      rows.push(...(got.rows || []));
      if (!got.rows || !got.rows.length || rows.length >= got.total) return rows;
    }
  }
  async approveAll(month?) {
    const decide = (items?, note?) =>
      this.call('PUT', `/periods/${month}/payslips/decide`, { items, action: 'approve', ...(note ? { note } : {}) });
    const slips = await this.slipList(month);
    const clean = slips.filter(p => p.status === 'draft').map(p => ({ username: p.username, rev: p.rev }));
    for (let i = 0; i < clean.length; i += 200)
      this.ok(await decide(clean.slice(i, i + 200)), `duyệt lô phiếu sạch ${month}`);
    const errors = slips
      .filter(p => p.status === 'error')
      .map(p => ({ username: p.username, reason: 'Demo: hồ sơ sai, loại khỏi kỳ này' }));
    this.ok(
      await this.call('POST', `/periods/${month}/approve`, { rev: await this.revOf(month), excludeErrors: errors }),
      `duyệt kỳ ${month}`
    );
  }
  async periods() {
    const states: Record<string, any> = {};
    const mark = async (month?) => {
      states[month] = (await this.call('GET', `/periods/${month}`)).data.status;
    };
    // 07 và 09: lịch sử đã chi trả; 08: đã duyệt, chưa chi trả
    for (const month of ['2026-07', '2026-08', '2026-09']) {
      await this.lockAndCalculate(month);
      await this.approveAll(month);
      if (month !== '2026-08')
        this.ok(
          await this.call('POST', `/periods/${month}/mark-paid`, { rev: await this.revOf(month), paidAt: this.today }),
          `chi trả ${month}`
        );
      await mark(month);
    }
    // ba kỳ đầu năm cho đủ trạng thái: 04 mới chốt công, 05 đã tính (chưa AI kiểm), 06 chốt rồi mở lại (dòng ở trạng thái 'open')
    for (const month of ['2026-04', '2026-06']) {
      const view = (await this.call('GET', `/periods/${month}`)).data;
      let lock = await this.call('POST', `/periods/${month}/lock-attendance`, { rev: view.rev });
      if (lock.status === 409 && lock.data.checklist)
        lock = await this.call('POST', `/periods/${month}/lock-attendance`, {
          rev: view.rev,
          acknowledge: lock.data.checklist.filter(i => i.acknowledgeable).map(i => i.code),
          reason: 'Demo: bỏ qua danh sách kiểm'
        });
      this.ok(lock, `chốt công ${month}`);
    }
    await mark('2026-04');
    await this.lockAndCalculate('2026-05');
    await mark('2026-05');
    // 09: mở lại rồi tính lần hai (lần chạy thứ hai của kỳ, phiếu lần một thành lịch sử)
    this.ok(
      await this.call('POST', '/periods/2026-09/reopen', {
        rev: await this.revOf('2026-09'),
        to: 'open',
        reason: 'Demo: mở lại để sửa dữ liệu rồi tính lại'
      }),
      'mở lại kỳ 2026-09'
    );
    await mark('2026-09-reopened');
    states['2026-09-reopened'] = (await this.call('GET', '/periods/2026-09')).data.status;
    await this.lockAndCalculate('2026-09');
    // 10: tới "đã AI kiểm", chưa duyệt (kỳ đang xử lý); 11 vẫn mở
    // kỳ 06 đã chốt công nhưng được mở lại ngay: dòng payroll_periods ở trạng thái 'open' (kỳ chưa từng có dòng cũng là open nhưng không có bản ghi)
    this.ok(
      await this.call('POST', '/periods/2026-06/reopen', {
        rev: await this.revOf('2026-06'),
        to: 'open',
        reason: 'Demo: mở lại kỳ 06 vì chốt nhầm'
      }),
      'mở lại kỳ 2026-06'
    );
    await this.lockAndCalculate('2026-10');
    await mark('2026-10');
    await mark('2026-11');
    return 'trạng thái kỳ: ' + JSON.stringify(states);
  }

  /* ---------- số sửa phiếu, bỏ qua phát hiện ---------- */
  async overridesAndFindings() {
    const month = '2026-10';
    const slips = await this.slipList(month);
    const plain = slips.find(p => p.status === 'draft');
    if (plain) {
      const got = await this.call('GET', `/slip-override?month=${month}&user=${plain.username}`);
      if (got.status === 200) {
        const saved = await this.call('PUT', '/slip-override', {
          month,
          user: plain.username,
          values: { attendance: 123000 },
          reason: 'Demo: Admin điều chỉnh ô chuyên cần'
        });
        this.ok(saved, 'sửa số phiếu');
      }
    }
    return 'thử sửa số phiếu';
  }

  /* ---------- bảng nhớ lượt bấm ---------- */
  // Bảng nhớ requestId của Check-in/out (chống bấm đúp khi mạng chập chờn): hai dòng cho hai thao tác trên các lượt có thật
  async punchRequests() {
    const have = (await this.store.db.prepare('SELECT COUNT(*) AS n FROM punch_requests').get()).n;
    if (have > 0) return `${have} dòng do luồng POST /punch thật tạo`;
    const sessions = await this.store.db
      .prepare('SELECT id, username FROM attendance_sessions ORDER BY id LIMIT 2')
      .all();
    if (sessions.length < 2) throw new Error('chưa có lượt chấm công nào để gắn requestId');
    const at = this.today + 'T05:00:00.000Z';
    const insert = this.store.db.prepare(
      'INSERT INTO punch_requests (username, request_id, operation, session_id, response_json, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    );
    await insert.run(
      sessions[0].username,
      'demo-lenh-001',
      'in',
      sessions[0].id,
      JSON.stringify({ ok: true, replay: true }),
      at
    );
    await insert.run(
      sessions[1].username,
      'demo-lenh-002',
      'out',
      sessions[1].id,
      JSON.stringify({ ok: true, replay: true }),
      at
    );
    return '2 dòng bảng nhớ requestId (vào, ra)';
  }
}

module.exports = { Lifecycle, uid: () => crypto.randomUUID() };
