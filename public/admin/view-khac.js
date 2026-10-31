/* Tổng quan, Phúc lợi, Báo cáo. Bảng lương nằm ở view-ky-luong.js.
   Tổng quan đọc trạng thái kỳ và danh sách kiểm của máy chủ qua A.Ky (GET /api/periods/:month), số tiền là tổng của máy chủ
   (A.Ky.totals / A.Ky.kept), yêu cầu chờ xử lý qua GET /api/approvals và A.Duyet, cảnh báo qua A.ai (GET /api/ai/review).
   Giao diện không cộng tiền. Mọi chuỗi từ API qua A.esc(). Lớp CSS tiền tố tq- và bc- nằm ở man-tong-quan.css. */
(function (A) {
  'use strict';
  const { esc, nf, ic, S } = A;
  const O = { loading: false, pending: null, error: null };
  const AP_ROWS = 5; // số yêu cầu hiện ở thẻ "Yêu cầu chờ xử lý"
  const AI_ROWS = 4; // số cảnh báo hiện ở thẻ "Cảnh báo AI"
  const HOLIDAY_ROWS = 2; // số ngày lễ sắp tới hiện ở thẻ "Mốc sắp tới"

  /* ---------- Tổng quan ---------- */
  async function loadOverview() {
    O.loading = true;
    O.error = null;
    A.loadStaff();
    A.loadAi();
    /* force: sau khi đồng ý một yêu cầu, danh sách kiểm của kỳ ("Trước khi chốt công") phải lấy lại từ máy chủ.
       loadPreview: trước lần tính đầu thì lấy ước tính cả kỳ cho dải số (quỹ lương, thực nhận, chuyên cần). */
    A.Ky.load(true)
      .then(() => A.Ky.loadPreview())
      .then(() => A.render());
    try {
      O.pending = await A.api('GET', '/approvals' + A.qs({ status: 'pending', month: S.month, limit: 50 }));
    } catch (e) {
      O.error = A.errText(e);
    } finally {
      O.loading = false;
    }
  }

  const monthNo = () => String(Number(S.month.slice(5))); // "11"
  const amt = n => Number(n).toLocaleString('vi-VN', { maximumFractionDigits: 0 });
  const isNum = n => n !== null && n !== undefined && Number.isFinite(Number(n));
  const aiOk = () => A.ai.state === 'ok' && A.ai.month === S.month && !!A.ai.data;
  const btnGo = (label, attrs) =>
    `<button class="btn sm" type="button" data-act="tqgo" ${attrs}>${esc(label)}${ic('arrow', 14)}</button>`;

  /* Danh sách kiểm của máy chủ (code, count, severity, acknowledgeable, message?) → chữ và màn xử lý.
     go: [chữ nút, màn, tab Chấm công | mục Cài đặt, bộ lọc Nhân sự]. Mục "tự xong" (AUTO) không tính vào số việc phải làm.
     Máy chủ trả mọi mục là severity 'warn' kèm message nói hệ quả cho tiền lương;
     không mục nào chặn chốt công hay phê duyệt kỳ. Dòng dưới tên việc là message của máy chủ, hiện nguyên văn. */
  const AUTO = new Set(['MONTH_NOT_ENDED', 'OPEN_SESSIONS']);
  const flaggedPending = () => {
    if (!aiOk()) return null;
    const c = (A.ai.data.checklist || []).find(i => i.id === 'flagged-items');
    return c && isNum(c.count) ? Number(c.count) : null;
  };
  const CHECK = {
    PENDING_APPROVALS: {
      t: () => `Yêu cầu chờ xử lý của tháng ${monthNo()}`, // máy chủ đếm yêu cầu của tháng đang xem (lib/periods.js → checklist)
      s: () => {
        const n = flaggedPending();
        if (n === null) return 'Đồng ý hoặc từ chối từng yêu cầu';
        return n ? `${nf(n)} yêu cầu có cảnh báo AI, cần xem từng cái` : 'Không yêu cầu nào có cảnh báo AI';
      },
      go: ['Xử lý yêu cầu', 'duyet', '', '', 'month']
    },
    EXPLANATION_PENDING: {
      t: 'Ngày có giải trình chưa duyệt',
      s: () => 'Chưa tính công cho tới khi duyệt',
      go: ['Xử lý giải trình', 'duyet', '', '', 'month']
    },
    FORGOT_PUNCH: {
      t: 'Ngày quên Check-in/out chờ xử lý',
      s: () => 'Sửa giờ',
      go: ['Sửa giờ', 'cham-cong', 'bang']
    },
    PUNCH_REVIEW: {
      t: 'Ngày chấm công chờ đối soát',
      s: () => 'Xem lại giờ lệch ca',
      go: ['Đối soát', 'cham-cong', 'bang']
    },
    MISSING_START_DATE: {
      t: 'Nhân sự thiếu ngày bắt đầu làm',
      s: () => 'Chưa xác định được ngày công chuẩn',
      go: ['Mở hồ sơ', 'ho-so', '', 'hsnostart']
    },
    OPEN_SESSIONS: {
      t: 'Lượt Check-in còn đang mở',
      s: () => 'Tự đóng khi nhân sự Check-out, bạn không cần làm gì',
      go: ['Xem hôm nay', 'cham-cong', 'hom-nay']
    },
    ISAT_INVALID: {
      t: 'Ngày iSAT sai thứ hoặc chức vụ không có quyền lợi iSAT',
      s: () => 'Ngày này không được trả lương',
      go: ['Xem lịch khai', 'cham-cong', 'bang']
    },
    MISSING_SHIFT: {
      t: 'Nhân sự chưa có ca cố định',
      s: () => 'Chưa tính được giờ làm',
      go: ['Gán ca', 'ho-so', '', 'hsnoshift']
    },
    AI_NOT_RUN: {
      t: 'AI chưa kiểm tra sau lần tính gần nhất',
      s: () => 'Chạy AI kiểm tra ở Bảng lương trước khi phê duyệt kỳ',
      go: ['Mở Bảng lương', 'luong']
    },
    PENDING_PAY_ENTRIES: {
      t: 'Khoản cộng/trừ thêm chờ phê duyệt',
      s: () => 'Khoản chưa phê duyệt không vào lương',
      go: ['Xem khoản', 'luong']
    },
    RUN_STALE: {
      t: 'Lần tính đã cũ',
      s: () => 'Dữ liệu đổi sau khi tính: nên tính lại trước khi phê duyệt',
      go: ['Mở Bảng lương', 'luong']
    }
  };
  const checkOf = i => CHECK[i.code] || { t: 'Việc cần kiểm tra', s: () => '', go: ['Mở Bảng lương', 'luong'] };
  // Dòng dưới tên việc: câu của máy chủ (nguyên văn); thiếu câu thì chữ của màn
  const subOf = (c, i) => (i.message ? String(i.message) : c.s(i));
  /* 0: việc nên xử lý, 1: tự xong */
  const rankOf = i => (AUTO.has(i.code) ? 1 : 0);
  /* Cùng mức thì theo thứ tự: yêu cầu trước, rồi giờ công, hồ sơ; mã lạ đứng sau, giữ thứ tự máy chủ */
  const ORDER = Object.keys(CHECK);
  const orderOf = i => (ORDER.includes(i.code) ? ORDER.indexOf(i.code) : ORDER.length);
  /* go: [chữ nút, màn, tab Chấm công, bộ lọc Nhân sự, phạm vi tháng của màn Yêu cầu ('month' | 'all')] */
  const goAttrs = ([, t, v, f, sc]) =>
    `data-t="${esc(t)}"${v ? ` data-v="${esc(v)}"` : ''}${f ? ` data-f="${esc(f)}"` : ''}${sc ? ` data-sc="${esc(sc)}"` : ''}`;
  const blkRow = (count, title, sub, button) =>
    `<div class="tq-r tq-blk"><span class="tq-cnt">${count}</span><div class="tq-tx"><div class="tq-t">${title}</div>${sub ? `<div class="tq-s">${sub}</div>` : ''}</div>${button}</div>`;

  /* Các việc của kỳ: trước khi chốt công là danh sách kiểm; đã tính lương thì thêm số phiếu chờ phê duyệt và chưa tính được */
  function tasksOf(kv) {
    const items = (kv.checklist || []).filter(i => i.code !== 'MONTH_NOT_ENDED');
    const sorted = items
      .map((i, k) => [i, k])
      .sort((a, b) => rankOf(a[0]) - rankOf(b[0]) || orderOf(a[0]) - orderOf(b[0]) || a[1] - b[1]);
    const rows = sorted.map(([i]) => {
      const c = checkOf(i);
      return {
        must: rankOf(i) === 0,
        html: blkRow(
          esc(nf(i.count)),
          esc(typeof c.t === 'function' ? c.t() : c.t),
          esc(subOf(c, i)),
          btnGo(c.go[0], goAttrs(c.go))
        )
      };
    });
    const kc = kv.counts;
    if (kv.run && kc && (kv.status === 'calculated' || kv.status === 'reviewed')) {
      const waiting = (kc.pending || 0) + (kc.draft || 0);
      // phê duyệt kỳ tự duyệt phiếu còn chờ và tự loại phiếu chưa tính được (người đó 0 ₫ kỳ này)
      if (waiting)
        rows.push({
          must: true,
          html: blkRow(
            esc(nf(waiting)),
            'Phiếu lương chờ phê duyệt',
            'Phê duyệt từng phiếu hoặc cả loạt ở Bảng lương; phê duyệt kỳ sẽ duyệt luôn các phiếu còn chờ',
            btnGo('Phê duyệt phiếu', 'data-t="luong"')
          )
        });
      if (kc.error)
        rows.push({
          must: true,
          html: blkRow(
            esc(nf(kc.error)),
            'Phiếu chưa tính được',
            'Sửa hồ sơ hoặc cách tính, rồi tính lại; phê duyệt kỳ khi còn phiếu này thì người đó không có lương kỳ này (0 ₫)',
            btnGo('Xem phiếu', 'data-t="luong"')
          )
        });
    }
    return rows;
  }
  const PHASE = { open: 'chốt công', calculated: 'phê duyệt kỳ', reviewed: 'phê duyệt kỳ' };

  /* Câu dưới tiêu đề: số việc phải xong. Không ghi hạn chốt công, không ghi ngày trả lương */
  function headSub(kv, must) {
    const m = esc(monthNo());
    if (!kv)
      return A.Ky.state() === 'fail' ? `Kỳ lương tháng ${m} · chưa tải được trạng thái kỳ` : `Kỳ lương tháng ${m}`;
    if (!PHASE[kv.status]) return `Kỳ lương tháng ${m} · ${esc(A.Ky.STATUS_TXT[kv.status] || kv.status)}`;
    // các việc không chặn, chỉ nên xử lý trước để tiền tính đúng
    return must
      ? `Còn <b>${nf(must)} việc</b> nên xử lý trước khi ${PHASE[kv.status]} tháng ${m}`
      : `Không còn việc nào cần xử lý trước khi ${PHASE[kv.status]} tháng ${m}`;
  }

  /* Thẻ "Trước khi chốt công" (hoặc "Trước khi phê duyệt kỳ", "Việc tiếp theo" ở các bước khác) */
  function tasksCard(kv, rows) {
    const m = esc(monthNo());
    const last = `${S.month}-${A.pad(A.daysInMonth(S.month))}`;
    const cap = `<span class="cap">Tháng công ${esc(A.fmtDM(S.month + '-01'))} – ${esc(A.fmtDM(last))}</span>`;
    const card = (title, body, foot) =>
      `<section class="card flush tq-card" aria-labelledby="tq-ky"><div class="card-h"><h2 id="tq-ky">${title}</h2>${cap}</div>${body}${foot ? `<div class="card-f">${foot}</div>` : ''}</section>`;
    if (!kv) {
      if (A.Ky.state() === 'fail')
        return card(
          'Trước khi chốt công',
          `<div class="tq-pad">${A.errorBox('Chưa tải được trạng thái kỳ lương.')}</div>`
        );
      return card(
        'Trước khi chốt công',
        '<div class="tq-pad" aria-busy="true"><div class="skel" style="width:70%"></div><div class="skel" style="width:55%"></div><div class="skel" style="width:62%"></div></div>'
      );
    }
    if (PHASE[kv.status]) {
      const title = kv.status === 'open' ? 'Trước khi chốt công' : 'Trước khi phê duyệt kỳ';
      const body = rows.length
        ? rows.map(r => r.html).join('')
        : `<div class="tq-pad tq-none">${ic('check', 16, 2)}<span>Không còn việc nào trước khi ${PHASE[kv.status]}.</span></div>`;
      const notEndedItem = (kv.checklist || []).find(i => i.code === 'MONTH_NOT_ENDED');
      const notEnded = !!notEndedItem;
      const must = rows.filter(r => r.must).length;
      const toLuong = '<button class="link" type="button" data-act="nav" data-t="luong">Bảng lương</button>';
      // chốt công, phê duyệt kỳ luôn làm được; tháng chưa hết thì hiện câu hệ quả của máy chủ (nguyên văn)
      const foot = notEnded
        ? `<span>${esc(notEndedItem.message || `Tháng ${monthNo()} hết ngày ${A.fmtDM(last)}`)}</span>`
        : `<span>Có thể ${PHASE[kv.status]} ngay ở</span>${toLuong}${must ? '<span>· nên xử lý các việc trên trước</span>' : ''}`;
      return card(title, body, foot);
    }
    /* Đã chốt công, đã phê duyệt, đã trả lương: chỉ còn bước tiếp theo của kỳ (nút ở màn Bảng lương) */
    const done = kv.status === 'paid';
    const next = A.Ky.nextAction(kv);
    const kc = kv.counts;
    const total = kc ? (kc.total ?? Object.values(kc).reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0)) : 0;
    const body = `<div class="tq-r tq-blk"><span class="tq-cnt tq-ico">${ic(done ? 'check' : 'arrow', 20, 2)}</span><div class="tq-tx"><div class="tq-t">${done ? `Kỳ lương tháng ${m} đã trả lương` : `Bước tiếp theo: ${esc(next)}`}</div><div class="tq-s">${esc(A.Ky.STATUS_TXT[kv.status] || kv.status)}${kv.run && total ? ` · ${nf(total)} phiếu` : ''}</div></div>${btnGo(done ? 'Xem bảng lương' : 'Mở Bảng lương', 'data-t="luong"')}</div>`;
    return card(done ? 'Kỳ lương' : 'Việc tiếp theo', body);
  }

  /* Thẻ "Yêu cầu chờ xử lý": danh sách là yêu cầu của THÁNG ĐANG XEM (GET /api/approvals?month=); số ghi rõ phạm vi:
     "48 mọi tháng · 8 của tháng 11" (mọi tháng = GET /api/approvals/count, cùng số với huy hiệu ở thanh bên).
     Yêu cầu có cảnh báo AI lên trước; có cảnh báo thì mở lý do, không có thì Đồng ý / Từ chối ngay (khoá nút trong lúc gửi: A.Duyet.busy) */
  function approvalsCard() {
    const ai = A.ai;
    const items = O.pending ? O.pending.items : [];
    const inMonth = O.pending && O.pending.counts ? O.pending.counts.pending : null;
    const all = S.pendingCount;
    const capTxt = [
      all == null ? '' : `${nf(all)} mọi tháng`,
      inMonth == null ? '' : `${nf(inMonth)} của tháng ${esc(monthNo())}`
    ]
      .filter(Boolean)
      .join(' · ');
    const rows = items
      .map(r => ({ r, j: A.aiJoin(r, ai.month === S.month ? ai : null) }))
      .sort((a, b) => (b.j.state === 'flagged') - (a.j.state === 'flagged'))
      .slice(0, AP_ROWS)
      .map(({ r, j }) => {
        const k = esc(A.Duyet.keyOf(r));
        const name = r.name || r.username;
        const n = j.findings.length;
        const busy = A.Duyet.busy && A.Duyet.busy(r) ? 'disabled aria-busy="true"' : '';
        const approve = `<button class="tq-act" type="button" data-act="tqapprove" data-k="${k}" ${busy}>Đồng ý</button>`;
        const why = `<button class="ai tq-aib" type="button" data-act="tqwhy" data-k="${k}" ${busy} aria-label="Xem lý do: ${nf(n)} cảnh báo AI">${ic('spark', 13, 2)}${nf(n)} cảnh báo</button>`;
        // yêu cầu có cảnh báo AI vẫn có nút Đồng ý như thường (từ chối nằm trong ngăn kéo lý do)
        const acts =
          j.state === 'flagged'
            ? why + approve
            : `<button class="tq-act mute" type="button" data-act="tqreject" data-k="${k}" ${busy}>Từ chối</button>${approve}`;
        return `<div class="tq-r tq-ap"><div class="tq-who">${A.avatar(name)}<div class="tq-tx"><div class="tq-t">${esc(name)}</div><div class="tq-s">${esc(A.itemLabel(r.item))} · ${esc(A.fmtDM(r.date))}</div></div></div><div class="tq-acts">${acts}</div></div>`;
      })
      .join('');
    const body = O.error
      ? `<div class="tq-pad">${A.errorBox(O.error)}</div>`
      : O.loading && !O.pending
        ? '<div class="tq-pad" aria-busy="true"><div class="skel" style="width:80%"></div><div class="skel" style="width:60%"></div></div>'
        : rows || `<div class="tq-pad">${A.empty(`Tháng ${monthNo()} không còn yêu cầu chờ xử lý`)}</div>`;
    /* Chân thẻ: mở màn Yêu cầu đúng phạm vi của số ghi trên nút */
    const goDuyet = (sc, label) =>
      `<button class="link" type="button" data-act="tqgo" data-t="duyet" data-sc="${sc}">${label}</button>`;
    const foot =
      all && inMonth != null && all > inMonth
        ? `${goDuyet('month', `Mở yêu cầu của tháng ${esc(monthNo())}`)}${goDuyet('all', `Xem cả ${nf(all)} yêu cầu mọi tháng`)}`
        : all
          ? goDuyet('all', `Xem cả ${nf(all)} yêu cầu mọi tháng`)
          : goDuyet('month', 'Xem các yêu cầu');
    return `<section class="card flush tq-card" aria-labelledby="tq-yc"><div class="card-h"><h2 id="tq-yc">Yêu cầu chờ xử lý</h2>${capTxt ? `<span class="cap">${capTxt}</span>` : ''}</div>${body}
<div class="card-f">${foot}</div></section>`;
  }

  /* Dải 4 số: tổng của máy chủ. Số tiền màu nâu, gạch nét đứt cho tới khi phê duyệt kỳ */
  function kpiStrip(kv) {
    const m = esc(monthNo());
    const T = A.Ky.totals();
    const kept = A.Ky.kept();
    const final = !!kv && (kv.status === 'approved' || kv.status === 'paid');
    /* Trước lần tính đầu, tổng lấy từ bảng ước tính của máy chủ (A.Ky.loadPreview): còn đang tải thì ghi "Đang tải…" */
    const est = A.Ky.kit && A.Ky.kit.K ? A.Ky.kit.K.est.state : '';
    const loading = kv ? !kv.totals && (est === 'idle' || est === 'loading') : A.Ky.state() !== 'fail';
    const none = loading ? 'Đang tải…' : 'Chưa có số từ máy chủ';
    const money = n =>
      isNum(n)
        ? `<span class="num${final ? '' : ' est'}"${final ? '' : ' title="Chưa phê duyệt kỳ"'}>${esc(amt(n))}<span class="unit">₫</span></span>`
        : '—';
    const people = A.people().filter(s => !s.locked);
    const codes = A.typeCodes();
    const other = people.filter(s => !codes.includes(s.type)).length;
    const byType = codes
      .map(t => `${esc(A.TYPE_SHORT[t] || t)} ${nf(people.filter(s => s.type === t).length)}`) // nhãn chức vụ do người dùng đặt: esc()
      .concat(other ? [`${nf(other)} chưa xếp loại`] : [])
      .join(' · ');
    return `<section class="kpis" aria-label="Số liệu chính">
${A.kpiCard(`Quỹ lương tháng ${m}`, T ? money(T.gross) : '—', T ? `${nf(T.people)} phiếu${T.error ? ` · ${nf(T.error)} phiếu chưa tính được` : ''}` : none)}
${A.kpiCard(`Thực nhận tháng ${m}`, T ? money(T.net) : '—', T ? (Number(T.advance) > 0 ? `Đã trừ tạm ứng ${esc(amt(T.advance))} ₫` : 'Không có tạm ứng') : none)}
${A.kpiCard('Nhân sự đang làm việc', A.staff.state === 'ok' ? `<span class="num">${nf(people.length)}</span>` : '—', A.staff.state === 'ok' ? byType : A.staff.state === 'fail' ? 'Chưa tải được danh sách' : 'Đang tải…')}
${A.kpiCard('Còn giữ phụ cấp chuyên cần', kept ? `<span class="num">${nf(kept.kept)}<span class="tq-of"> / ${nf(kept.of)}</span></span>` : '—', kept ? `Trên ${nf(kept.of)} người có phụ cấp chuyên cần` : none)}</section>`;
  }

  /* Thẻ "Cảnh báo AI": vài cảnh báo chưa xử lý đầu tiên, xếp theo mức độ (giống Trợ lý AI) */
  const SEV_RANK = { high: 0, medium: 1, low: 2 };
  const openFindings = () => {
    const d = A.ai.data;
    return [...(d.systemFindings || []).filter(f => !f.dismissed), ...A.aiSplit(d).open].sort(
      (a, b) => (SEV_RANK[a.severity] ?? 9) - (SEV_RANK[b.severity] ?? 9)
    );
  };
  const thKind = f => {
    const t = (f.evidence && f.evidence.threshold) || {};
    const hasNum = Object.keys(t).some(k => !['basis', 'proposal', 'sources'].includes(k));
    return hasNum ? (t.proposal ? 'ngưỡng đề xuất' : 'ngưỡng đã chốt') : 'không có ngưỡng';
  };
  function aiCard() {
    const ai = A.ai;
    const head = cap =>
      `<div class="card-h"><h2 id="tq-ai">Cảnh báo AI</h2>${cap}<button class="link end" type="button" data-act="nav" data-t="tro-ly">Xem tất cả ở Trợ lý AI</button></div>`;
    const wrap = (cap, body) =>
      `<section class="card flush tq-card" aria-labelledby="tq-ai">${head(cap)}${body}</section>`;
    if (!aiOk())
      return wrap(
        '',
        ai.state === 'fail' && ai.month === S.month
          ? `<div class="tq-pad">${A.errorBox(ai.error, false)}<div><button class="btn sm" type="button" data-act="tqairetry">Thử lại</button></div></div>`
          : '<div class="tq-pad" aria-busy="true"><div class="skel" style="width:70%"></div><div class="skel" style="width:50%"></div></div>'
      );
    const open = openFindings();
    const names = ai.data.names || {};
    const rows = open
      .slice(0, AI_ROWS)
      .map(f => {
        const who = f.username ? esc(names[f.username] || f.username) : 'Cả hệ thống';
        return `<div class="tq-r tq-ai"><div class="tq-tx"><div class="tq-rule">${A.pill(f.severity, A.SEVERITY[f.severity] || f.severity)}<span>${esc(A.ruleLabel(f.rule))} · ${thKind(f)}</span></div><div class="tq-t">${who} · ${f.date ? `${esc(A.fmtDM(f.date))} · ` : ''}${esc(A.aiMessage(f))}</div></div><div class="tq-acts"><button class="tq-act" type="button" data-act="tqaiwhy" data-f="${esc(f.id)}">Xem lý do</button><button class="tq-act" type="button" data-act="tqaigo" data-f="${esc(f.id)}" title="${esc(A.fixTarget(f.rule)[1])}">Sửa</button></div></div>`;
      })
      .join('');
    return wrap(
      `<span class="cap">${nf(open.length)} chưa xử lý</span>`,
      rows || `<div class="tq-pad tq-none">${ic('check', 16, 2)}<span>Không còn cảnh báo nào chưa xử lý.</span></div>`
    );
  }

  /* Thẻ "Mốc sắp tới": hết tháng công và ngày lễ, từ hôm nay trở đi. Không có hạn chốt công, không có ngày trả lương */
  function upcomingCard() {
    const today = A.vnToday();
    const m = monthNo();
    const last = `${S.month}-${A.pad(A.daysInMonth(S.month))}`;
    const list = [[last, `Hết tháng công ${m}`, '']];
    [...A.holidaySet()]
      .filter(d => d >= today)
      .sort()
      .slice(0, HOLIDAY_ROWS)
      .forEach(d => list.push([d, 'Ngày lễ', '']));
    const rows = list
      .filter(([d]) => /^\d{4}-\d{2}-\d{2}$/.test(d || '') && d >= today)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(
        ([d, t, s]) =>
          `<div class="tq-r tq-up"><span class="tq-dt">${esc(A.fmtDM(d))}</span><div class="tq-tx"><div class="tq-t">${esc(t)}</div>${s ? `<div class="tq-s">${esc(s)}</div>` : ''}</div></div>`
      )
      .join('');
    return `<section class="card flush tq-card" aria-labelledby="tq-up"><div class="card-h"><h2 id="tq-up">Mốc sắp tới</h2></div>${rows || `<div class="tq-pad">${A.empty('Không có mốc nào sắp tới')}</div>`}
<div class="card-f"><button class="link" type="button" data-act="nav" data-t="cai-dat" data-s="cham-cong">Đổi lịch trong Cài đặt</button></div></section>`;
  }

  function overview() {
    const kv = A.Ky.data();
    const rows = kv && PHASE[kv.status] ? tasksOf(kv) : [];
    const must = rows.filter(r => r.must).length;
    return `${A.header('Tổng quan', headSub(kv, must))}
<div class="tq-grid">${tasksCard(kv, rows)}${approvalsCard()}</div>
${kpiStrip(kv)}
<div class="tq-grid">${aiCard()}${upcomingCard()}</div>`;
  }

  /* Đồng ý và Từ chối ngay trên thẻ: cùng logic với màn Yêu cầu (A.Duyet, view-duyet.js) */
  const pendingRow = k => (O.pending ? O.pending.items : []).find(r => A.Duyet.keyOf(r) === k);
  A.actions.tqapprove = el => A.Duyet.approve(pendingRow(el.dataset.k));
  A.actions.tqreject = el => A.Duyet.reject(pendingRow(el.dataset.k));
  A.actions.tqwhy = el => A.Duyet.why(pendingRow(el.dataset.k));
  /* Nút của danh sách việc: mở đúng màn, tab Chấm công hoặc bộ lọc Nhân sự (chỉ điều hướng, không ghi gì) */
  A.actions.tqgo = el => {
    const t = el.dataset.t;
    if (t === 'cham-cong' && el.dataset.v) S.sub.cc = el.dataset.v;
    if (t === 'duyet') {
      S.f.dst = 'pending';
      S.f.dscope = el.dataset.sc === 'all' ? 'all' : 'month'; // cùng phạm vi với số vừa bấm
    }
    if (el.dataset.f) {
      S.f[el.dataset.f] = true;
      S.page.hoso = 1;
    }
    A.go(t);
  };
  /* Cảnh báo AI: ngăn kéo lý do (A.openWhy) và chỗ sửa (A.gotoFinding). Bỏ qua cảnh báo chỉ được khi kỳ đã qua AI kiểm tra (như Trợ lý AI) */
  const findFinding = id =>
    [...((A.ai.data && A.ai.data.findings) || []), ...((A.ai.data && A.ai.data.systemFindings) || [])].find(
      x => x.id === id
    );
  // Kỳ đã phê duyệt hay đã trả lương vẫn bỏ qua được (máy chủ chỉ ghi nhận, kèm cảnh báo), như Trợ lý AI (view-tro-ly.js)
  const canDismiss = () => {
    const kv = A.Ky.data();
    const st = (aiOk() && A.ai.data.period && A.ai.data.period.status) || (kv && kv.status) || null;
    return st === 'reviewed' || !st || st === 'approved' || st === 'paid';
  };
  A.actions.tqaiwhy = el => {
    const f = findFinding(el.dataset.f);
    if (f) A.openWhy([f], { dismiss: canDismiss() });
  };
  A.actions.tqaigo = el => {
    const f = findFinding(el.dataset.f);
    if (f) A.gotoFinding(f);
  };
  A.actions.tqairetry = () => A.loadAi(true);
  A.register('tong-quan', { load: loadOverview, render: overview });

  /* Bảng lương: view-ky-luong.js */

  /* ---------- Phúc lợi, Báo cáo ---------- */
  A.register('phuc-loi', {
    render() {
      return `${A.header('Phúc lợi', 'Sẽ có ở đợt sau')}<section class="card flush bc-card"><div class="card-h"><h2>Phúc lợi</h2>${A.soonTag()}</div><div class="tq-pad">${A.empty('Phúc lợi sẽ có ở đợt sau')}</div></section>`;
    }
  });
  /* Báo cáo: thẻ "Nhật ký thay đổi" đọc 5 dòng mới nhất của GET /api/audit (cần năng lực audit.read) và dẫn tới Cài đặt › Nhật ký hệ thống */
  const AUDIT_PREVIEW = 5; // số dòng nhật ký hiện ở thẻ
  const BC = { state: 'idle', rows: [], total: 0, error: '' };
  const canAudit = () => !A.meInfo || !Array.isArray(A.meInfo.caps) || A.meInfo.caps.includes('audit.read');
  async function loadBaoCao() {
    if (!canAudit()) return;
    BC.state = 'loading';
    try {
      const res = await A.api('GET', '/audit' + A.qs({ limit: AUDIT_PREVIEW }));
      Object.assign(BC, { state: 'ok', rows: res.rows || [], total: res.total || 0, error: '' });
    } catch (e) {
      Object.assign(BC, { state: 'fail', rows: [], error: A.errText(e) });
    }
  }
  /* Việc bằng chữ (nhãn của Cài đặt › Nhật ký, A.NhatKy.actionText); mã chưa có nhãn mới hiện nguyên mã */
  const actionCell = code => {
    const t = A.NhatKy && A.NhatKy.actionText ? A.NhatKy.actionText(code) : code;
    return t && t !== code ? esc(t) : `<span class="mono">${esc(code)}</span>`;
  };
  function auditCard() {
    const wrap = (cap, body, foot) =>
      `<section class="card flush bc-card" aria-labelledby="bc-nk"><div class="card-h"><h2 id="bc-nk">Nhật ký thay đổi</h2>${cap}<button class="btn sm end" type="button" data-act="nav" data-t="cai-dat" data-s="nhat-ky">Xem toàn bộ</button></div>${body}${foot ? `<div class="card-f">${foot}</div>` : ''}</section>`;
    if (!canAudit()) return wrap('', `<div class="tq-pad">${A.empty('Bạn chưa có quyền xem nhật ký')}</div>`);
    if (BC.state === 'loading' || BC.state === 'idle')
      return wrap(
        '',
        '<div class="tq-pad" aria-busy="true"><div class="skel" style="width:70%"></div><div class="skel" style="width:50%"></div></div>'
      );
    if (BC.state === 'fail') return wrap('', `<div class="tq-pad">${A.errorBox(BC.error)}</div>`);
    const rows = BC.rows
      .map(
        r =>
          `<div class="tq-r bc-log"><span class="num bc-at">${esc(A.fmtStamp(r.at))}</span><div class="tq-tx"><div class="tq-t">${esc(r.actor)} · ${actionCell(r.action)}${r.subject ? ' · ' + esc(r.subject) : ''}${A.NhatKy && A.NhatKy.isSelf && A.NhatKy.isSelf(r) ? ' · tự thực hiện' : ''}</div>${r.reason ? `<div class="tq-s">Lý do: ${esc(r.reason)}</div>` : ''}</div></div>`
      )
      .join('');
    return rows
      ? wrap(
          `<span class="cap">${nf(BC.rows.length)} thay đổi mới nhất</span>`,
          rows,
          `<span>${nf(BC.total)} dòng tất cả</span>`
        )
      : wrap('', `<div class="tq-pad">${A.empty('Chưa có thay đổi nào')}</div>`);
  }
  A.register('bao-cao', {
    load: loadBaoCao,
    render() {
      const ml = A.monthLabel(S.month);
      return `${A.header('Báo cáo', esc(ml.charAt(0).toUpperCase() + ml.slice(1)))}
<div class="tq-grid">${auditCard()}<div class="bc-side">
<section class="card flush bc-card" aria-labelledby="bc-ql"><div class="card-h"><h2 id="bc-ql">Quỹ lương theo tháng</h2><span class="end">${A.soonTag('Đang xây')}</span></div><div class="tq-pad">${A.empty('Biểu đồ quỹ lương các tháng chưa có')}</div></section>
<section class="card flush bc-card" aria-labelledby="bc-ks"><div class="card-h"><h2 id="bc-ks">Kiểm soát dữ liệu</h2><span class="end">${A.pill('done', 'Đã có')}</span></div><div class="tq-pad"><span class="tq-s">Cảnh báo AI và câu hỏi dựng sẵn nằm ở Trợ lý AI.</span><div><button class="btn sm" type="button" data-act="nav" data-t="tro-ly">Mở Trợ lý AI</button></div></div></section>
</div></div>`;
    }
  });
})(window.Admin);
