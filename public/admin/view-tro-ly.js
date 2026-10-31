/* Màn Trợ lý AI: cột lớn "Cảnh báo AI" (GET /api/ai/review) và cột "Hỏi nhanh" với câu hỏi dựng sẵn.
   AI chạy theo quy tắc, không có ô hỏi tự do. Câu trả lời chỉ dựng từ dữ liệu máy chủ đã trả (kết quả AI kiểm tra, danh sách kiểm của kỳ lương
   GET /api/periods/:month, bảng ước tính, hồ sơ nhân sự); không gửi dữ liệu đi đâu, không tự tính số. Không nút nào ở đây ghi dữ liệu:
   "Sửa" chỉ mở màn khác; "Bỏ qua cảnh báo này" nằm trong hộp lý do (ai.js). */
(function (A) {
  'use strict';
  const { esc, nf, ic, S } = A;
  const T = {
    report: 'thieu',
    period: { month: null, state: 'idle', data: null },
    slips: { month: null, state: 'idle', errors: null }
  };
  const REPORTS = [
    ['thieu', 'Còn thiếu gì trước khi chốt công?', true],
    ['phep', 'Ai còn nhiều phép?', true]
  ];
  const PAGE_SIZE = 8;

  /* ---------- tải ---------- */
  /* Kỳ lương của tháng: trạng thái, ngày các bước, danh sách kiểm chốt công / phê duyệt (checklist), số phiếu */
  async function loadPeriod() {
    const month = S.month;
    T.period = { month, state: 'loading', data: null };
    try {
      const data = await A.api('GET', '/periods/' + encodeURIComponent(month));
      if (T.period.month === month) T.period = { month, state: 'ok', data };
    } catch {
      if (T.period.month === month) T.period = { month, state: 'na', data: null };
    }
  }
  /* Phiếu chưa tính được: kỳ đã có lần tính thì lấy số phiếu lỗi của kỳ; chưa có thì lấy tổng của bảng ước tính (một dòng, chỉ cần totals.error) */
  async function loadSlipErrors() {
    const month = S.month;
    const pd = T.period.month === month ? T.period.data : null;
    if (pd && pd.run) {
      T.slips = { month, state: 'ok', errors: pd.counts && pd.counts.error != null ? pd.counts.error : null };
      return;
    }
    T.slips = { month, state: 'loading', errors: null };
    try {
      const res = await A.api('GET', `/periods/${encodeURIComponent(month)}/estimates?pageSize=1`);
      if (T.slips.month === month)
        T.slips = { month, state: 'ok', errors: res.totals && res.totals.error != null ? res.totals.error : null };
    } catch {
      if (T.slips.month === month) T.slips = { month, state: 'na', errors: null };
    }
  }
  async function load() {
    A.loadStaff();
    A.Dismiss.probe(true);
    const ai = A.loadAi(true);
    await loadPeriod();
    if (S.view === 'tro-ly') A.render();
    await Promise.all([ai, loadSlipErrors()]);
  }

  /* ---------- trạng thái kỳ ---------- */
  const aiOk = () => A.ai.state === 'ok' && A.ai.month === S.month && !!A.ai.data;
  const periodData = () => (T.period.state === 'ok' && T.period.month === S.month ? T.period.data : null);
  /* Trạng thái kỳ: lấy từ phản hồi của AI (period.status), không có thì từ GET /api/periods/:month; chưa biết thì null */
  const periodStatus = () => {
    if (aiOk() && A.ai.data.period && A.ai.data.period.status) return A.ai.data.period.status;
    const pd = periodData();
    return pd ? pd.status : null;
  };
  /* Máy chủ chỉ nhận "bỏ qua có lý do" khi lần tính còn là bản nháp và AI đã gắn cờ lên phiếu (trạng thái "reviewed"); trước và sau đó nút chỉ gây lỗi.
     Kỳ đã phê duyệt hay đã trả lương vẫn bỏ qua được (máy chủ chỉ ghi nhận, kèm cảnh báo, không đổi tiền).
     Chưa biết trạng thái kỳ (máy chủ cũ, lỗi mạng) thì vẫn mời, để máy chủ trả lời. */
  const canDismiss = () => {
    const st = periodStatus();
    return st === 'reviewed' || !st || st === 'approved' || st === 'paid';
  };
  const PERIOD_TXT = {
    attendance_locked: 'đã chốt công, chưa tính lương',
    calculated: 'đã tính lương, chờ AI kiểm tra',
    reviewed: 'đã qua AI kiểm tra, đang phê duyệt phiếu',
    approved: 'đã phê duyệt',
    paid: 'đã trả lương'
  };
  const stampTxt = v => (v && v.at ? (/^\d{4}-\d{2}-\d{2}$/.test(v.at) ? A.fmtDate(v.at) : A.fmtStamp(v.at)) : '');

  /* ---------- hành động ---------- */
  A.actions.trreport = el => {
    T.report = el.dataset.v;
    A.render();
  };
  /* Cảnh báo theo người (findings) và cảnh báo của cả hệ thống (systemFindings, id dạng quy tắc:system:<khoá>, không có username) */
  const findFinding = id =>
    [...((A.ai.data && A.ai.data.findings) || []), ...((A.ai.data && A.ai.data.systemFindings) || [])].find(
      x => x.id === id
    );
  A.actions.trwhy = el => {
    const f = findFinding(el.dataset.f);
    if (f) A.openWhy([f], { dismiss: canDismiss(), drawer: false });
  };
  A.actions.trgo = el => {
    const f = findFinding(el.dataset.f);
    if (f) A.gotoFinding(f);
  };
  A.actions.trretry = () => A.loadAi(true);
  /* Liên kết trong câu trả lời: mở màn có sẵn bộ lọc phù hợp (chỉ điều hướng, không ghi gì) */
  const LINKS = {
    yc: () => {
      S.f.dst = 'pending';
      A.go('duyet');
    },
    'sua-gio': () => {
      S.sub.cc = 'bang';
      S.f.cconly = true;
      A.go('cham-cong');
    },
    'bang-cong': () => {
      S.sub.cc = 'bang';
      A.go('cham-cong');
    },
    'so-du-phep': () => {
      S.sub.cc = 'phep';
      A.go('cham-cong');
    },
    'ho-so-start': () => {
      S.f.hsnostart = true;
      S.page.hoso = 1;
      A.go('ho-so');
    },
    'gan-ca': () => {
      S.f.hsnoshift = true;
      S.page.hoso = 1;
      A.go('ho-so');
    },
    kpi: () => A.go('kpi'),
    luong: () => A.go('luong'),
    'ngay-le': () => A.go('cai-dat', 'cham-cong')
  };
  A.actions.trlink = el => {
    const fn = LINKS[el.dataset.l];
    if (fn) fn();
  };

  /* ---------- câu trả lời: Còn thiếu gì trước khi chốt công? ---------- */
  /* Mục của danh sách kiểm kỳ lương (lib/periods.js → checklist): chữ, liên kết. flag = mục có/không (số 1 không có nghĩa đếm). */
  const CHECK_ROW = {
    PENDING_APPROVALS: { l: 'yc', go: 'Xử lý' },
    EXPLANATION_PENDING: { txt: 'Ngày có giải trình chưa duyệt', l: 'yc', go: 'Xử lý' },
    FORGOT_PUNCH: { txt: 'Ngày quên Check-in/out', l: 'sua-gio', go: 'Sửa giờ' },
    PUNCH_REVIEW: { txt: 'Ngày chấm công cần đối soát (lệch ca, cần xem lại)', l: 'bang-cong', go: 'Bảng công' },
    MISSING_START_DATE: { txt: 'Nhân sự thiếu ngày bắt đầu làm', l: 'ho-so-start', go: 'Mở hồ sơ' },
    ISAT_INVALID: { txt: 'Ngày iSAT sai thứ hoặc chức vụ không có quyền lợi iSAT', l: 'bang-cong', go: 'Bảng công' },
    MISSING_SHIFT: { txt: 'Nhân sự chưa có ca cố định', l: 'gan-ca', go: 'Gán ca' },
    AI_NOT_RUN: { txt: 'Lần tính chưa qua AI kiểm tra', l: 'luong', go: 'Bảng lương', flag: true },
    PENDING_PAY_ENTRIES: { txt: 'Khoản điền thêm chờ xử lý, chưa vào lương', l: 'luong', go: 'Bảng lương' },
    RUN_STALE: {
      txt: 'Lần tính đã cũ: dữ liệu đổi sau khi tính, nên tính lại',
      l: 'luong',
      go: 'Bảng lương',
      flag: true
    },
    OPEN_SESSIONS: { txt: 'Lượt Check-in còn đang mở · tự đóng khi nhân sự Check-out', auto: true }
  };
  const ORDER = Object.keys(CHECK_ROW);
  const byOrder = (a, b) => (ORDER.indexOf(a.code) + 1 || 99) - (ORDER.indexOf(b.code) + 1 || 99);
  const ansRow = (count, text, link, cls = '') =>
    `<div class="tl-ar ${cls}"><span class="c num">${count}</span><span>${text}</span>${link ? `<button type="button" class="link" data-act="trlink" data-l="${esc(link[0])}">${esc(link[1])}</button>` : '<span></span>'}</div>`;
  const aiCheck = id => (aiOk() ? (A.ai.data.checklist || []).find(i => i.id === id) : null);
  function checkRow(i) {
    const def = CHECK_ROW[i.code] || {};
    const known = !!CHECK_ROW[i.code];
    const flagged = aiCheck('flagged-items');
    /* Mục giao diện chưa có nhãn ngắn (ví dụ MONTH_NOT_ENDED): câu của máy chủ nguyên văn, không hiện mã */
    const text =
      i.code === 'PENDING_APPROVALS'
        ? `Yêu cầu chờ xử lý${flagged && flagged.count ? `, ${nf(flagged.count)} có cảnh báo` : ''}`
        : esc(def.txt || i.message || i.label || '');
    const count = def.flag || !known ? ic('alert', 18) : nf(i.count);
    return ansRow(count, text, def.l ? [def.l, def.go] : null, def.auto ? 'info' : '');
  }
  /* Nhóm "Không chặn chốt công": số liệu đi kèm của AI kiểm tra và bảng phiếu */
  function infoRows() {
    const rows = [];
    if (T.slips.month === S.month && T.slips.state === 'ok' && T.slips.errors != null)
      rows.push(
        ansRow(
          nf(T.slips.errors),
          'Phiếu lương chưa tính được',
          T.slips.errors ? ['luong', 'Bảng lương'] : null,
          'info'
        )
      );
    const kpi = aiCheck('kpi-unapproved');
    if (kpi)
      rows.push(
        ansRow(
          nf(kpi.count),
          /5 điểm/.test(kpi.label || '') ? 'Người chưa chấm đủ điểm KPI' : 'Người chưa có % KPI được duyệt',
          kpi.count ? ['kpi', 'Đánh giá KPI'] : null,
          'info'
        )
      );
    const hol = aiCheck('holidays');
    if (hol) {
      const days = [...A.holidaySet()].filter(d => d.startsWith(S.month + '-')).sort();
      const txt = hol.count
        ? `Ngày lễ trong tháng${days.length ? ': ' + days.map(d => esc(A.fmtDM(d))).join(', ') : ''}`
        : 'Chưa đặt ngày lễ nào cho tháng này';
      rows.push(ansRow(nf(hol.count), txt, ['ngay-le', 'Ngày lễ'], 'info'));
    }
    const ov = aiCheck('slip-overrides');
    if (ov)
      rows.push(
        ansRow(nf(ov.count), 'Phiếu lương có số Admin đã sửa', ov.count ? ['luong', 'Bảng lương'] : null, 'info')
      );
    return rows.join('');
  }
  const skel = () =>
    `<div class="tl-pad"><div class="skel" style="width:60%"></div><div class="skel" style="width:80%;margin-top:8px"></div><div class="skel" style="width:50%;margin-top:8px"></div></div>`;
  function reportThieu() {
    const ai = A.ai;
    if (ai.state === 'loading' || ai.state === 'idle' || T.period.state === 'loading' || T.period.state === 'idle')
      return skel();
    if (ai.state === 'fail')
      return `<div class="tl-pad col" style="gap:8px">${A.errorBox(ai.error, false)}<div><button class="btn sm" type="button" data-act="trretry">Thử lại</button></div></div>`;
    const st = periodStatus();
    const pd = periodData();
    const list = (pd && pd.checklist) || [];
    let title;
    let sub;
    let groups = '';
    let infoLabel = 'Số liệu để đối chiếu';
    if (!st || st === 'open' || st === 'calculated' || st === 'reviewed') {
      const before = st === 'open' || !st;
      const block = list.filter(i => i.severity === 'block' && i.code !== 'MONTH_NOT_ENDED').sort(byOrder);
      const todo = block.filter(i => !(CHECK_ROW[i.code] || {}).auto);
      const warn = list.filter(i => i.severity !== 'block').sort(byOrder);
      const goal = before ? 'chốt công' : 'phê duyệt kỳ lương';
      infoLabel = `Không chặn ${goal}`;
      title = todo.length ? `Còn ${nf(todo.length)} việc trước khi ${goal}` : `Không còn việc nào chặn ${goal}`;
      sub = st && !before ? `Kỳ lương ${esc(PERIOD_TXT[st] || st)}` : '';
      /* Lượt Check-in/out chờ Admin xử lý theo AI kiểm tra (gồm cả quên Check-in/out, chờ đối soát, lệch ca): không chặn chốt công nhưng nên xem */
      const pw = before ? aiCheck('punch-waiting') : null;
      const pwRow =
        pw && pw.count
          ? ansRow(nf(pw.count), 'Lượt Check-in/out chờ xử lý hoặc đối soát', ['bang-cong', 'Bảng công'])
          : '';
      const warnRows = warn.map(checkRow).join('') + pwRow;
      groups =
        `<div class="tl-rows">${[...todo, ...block.filter(i => (CHECK_ROW[i.code] || {}).auto)].map(checkRow).join('')}</div>` +
        (warnRows ? `<div class="tl-sec">Nên xem trước khi ${goal}</div>${warnRows}` : '');
      if (!pd) groups = A.note('Chưa tải được danh sách kiểm của kỳ lương. Số dưới đây chỉ từ AI kiểm tra.', 'alert');
    } else {
      /* Kỳ đã chốt công, đã phê duyệt hay đã trả lương: câu hỏi "trước khi chốt công" không còn đúng, nói đúng giai đoạn */
      const stages = (pd && pd.stages) || {};
      const at = stampTxt(st === 'paid' ? stages.paid : st === 'approved' ? stages.approved : stages.attendanceLocked);
      title = `Kỳ lương ${esc(PERIOD_TXT[st] || st || '')}`;
      sub = `${at ? `Từ ${esc(at)} · ` : ''}không còn việc nào trước khi chốt công. Số dưới đây chỉ để đối chiếu.`;
    }
    const info = infoRows();
    const c = ai.data.checked || {};
    return `<div class="tl-ah"><h3>${title}</h3>${sub ? `<div class="tl-sub">${sub}</div>` : ''}</div>
${groups}${info ? `<div class="tl-sec">${infoLabel}</div>${info}` : ''}
<div class="tl-src">Nguồn: AI kiểm tra dữ liệu · ${nf(c.rules)} quy tắc · ${nf(c.staff)} nhân sự · ${nf(c.days)} ngày dữ liệu${pd ? ' · danh sách kiểm của kỳ lương' : ''}<br>Tính lúc ${esc(A.fmtStamp(ai.data.asOf))}</div>`;
  }

  /* ---------- câu trả lời: Ai còn nhiều phép? (số dư phép tính đến hôm nay do máy chủ trả trong hồ sơ) ---------- */
  function reportPhep() {
    if (A.staff.state === 'loading' || A.staff.state === 'idle') return skel();
    if (A.staff.state === 'fail') return `<div class="tl-pad">${A.errorBox(A.staff.error, false)}</div>`;
    const list = A.people()
      .filter(s => s.leave)
      .sort((a, b) => b.leave.balance - a.leave.balance);
    const neg = list.filter(s => s.leave.balance < 0).reverse(); // âm nhiều nhất trước
    const top = list.slice(0, 10);
    const n = (v, cls = '') => `<td class="num r ${Number(v) === 0 ? 'z' : ''} ${cls}">${nf(v)}</td>`;
    const rows =
      top
        .map(
          s =>
            `<tr><td><span class="nm">${esc(s.name)}</span><span class="ty">${esc(A.typeShort(s))}</span></td>${n(s.leave.total)}${n(s.leave.used)}${n(s.leave.balance, 'b')}</tr>`
        )
        .join('') || `<tr><td colspan="4">${A.empty('Chưa có dữ liệu phép')}</td></tr>`;
    return `<div class="tl-ah"><h3>${nf(top.length)} người còn nhiều phép nhất</h3><div class="tl-sub">${nf(list.length)} nhân sự có phép năm · ${nf(neg.length)} người đang âm phép</div></div>
<table class="tl-ph"><thead><tr><th>Nhân sự</th><th class="r">Cộng</th><th class="r">Dùng</th><th class="r">Còn</th></tr></thead><tbody>${rows}</tbody></table>
${neg.length ? ansRow(nf(neg.length), `Người âm phép: ${neg.map(s => esc(s.name)).join(', ')}`, ['so-du-phep', 'Xem'], 'info') : ''}
<div class="tl-src">Nguồn: hồ sơ nhân sự · phép năm tính đến ${esc(A.fmtDate(A.vnToday()))}</div>`;
  }

  /* ---------- cột Hỏi nhanh ---------- */
  function askCard() {
    const qs = REPORTS.map(([id, label, ready]) =>
      ready
        ? `<button type="button" class="tl-q${T.report === id ? ' on' : ''}" data-act="trreport" data-v="${id}" aria-pressed="${T.report === id}">${esc(label)}</button>`
        : `<button type="button" class="tl-q off" aria-disabled="true" title="Máy chủ chưa có dữ liệu để trả lời câu này">${esc(label)}<span class="tl-soon">Sắp có</span></button>`
    ).join('');
    const answer = T.report === 'phep' ? reportPhep() : reportThieu();
    return `<section class="card flush tl-askc" aria-label="Hỏi nhanh"><div class="card-h"><h2>Hỏi nhanh</h2><span class="cap">Câu hỏi dựng sẵn</span></div>
<div class="tl-qs" role="group" aria-label="Chọn câu hỏi">${qs}</div>
<div class="tl-ans">${answer}</div>
<div class="tl-free"><label class="sr" for="ask">Hỏi tự do</label><input id="ask" disabled placeholder="Hỏi tự do · Sắp có"><button class="tl-send" type="button" disabled aria-label="Gửi">${ic('send', 16)}</button></div></section>`;
  }

  /* ---------- cột Cảnh báo AI ---------- */
  const SEV_RANK = { high: 0, medium: 1, low: 2 };
  const bySev = (a, b) => (SEV_RANK[a.severity] ?? 9) - (SEV_RANK[b.severity] ?? 9);
  /* Chưa xử lý = cảnh báo của cả hệ thống (không bỏ qua được) + cảnh báo theo người chưa bỏ qua; xếp theo mức độ, cùng mức giữ thứ tự máy chủ */
  function lists() {
    const d = A.ai.data;
    const sp = A.aiSplit(d);
    const open = [...(d.systemFindings || []).filter(f => !f.dismissed), ...sp.open].sort(bySev);
    const done = sp.done.slice().sort(bySev);
    return { open, done, all: [...open, ...done] };
  }
  const thKind = f => {
    const t = (f.evidence && f.evidence.threshold) || {};
    const hasNum = Object.keys(t).some(k => !['basis', 'proposal', 'sources'].includes(k));
    return hasNum ? (t.proposal ? 'ngưỡng đề xuất' : 'ngưỡng đã chốt') : 'không có ngưỡng';
  };
  function rowHtml(f, names) {
    const done = !!f.dismissed;
    const who = f.username ? esc(names[f.username] || f.username) : 'Cả hệ thống';
    return `<li class="tl-row${done ? ' done' : ''}"><span class="pill p-${esc(f.severity)}">${esc(A.SEVERITY[f.severity] || f.severity)}</span>
<div class="tl-main"><div class="tl-rule">${esc(A.ruleLabel(f.rule))} · ${thKind(f)}</div><div class="tl-t"><b>${who}</b>${f.date ? ` · ${esc(A.fmtDM(f.date))}:` : ' ·'} ${esc(A.aiMessage(f))}</div>${done ? `<div class="fd-line">${A.pill('draft', 'Đã bỏ qua')}<span>${A.dismissedLine(f, names)}</span></div>` : ''}</div>
<div class="tl-acts"><button type="button" class="tl-act" data-act="trwhy" data-f="${esc(f.id)}">Xem lý do</button><button type="button" class="tl-act" data-act="trgo" data-f="${esc(f.id)}" title="${esc(A.fixTarget(f.rule)[1])}">Sửa</button></div></li>`;
  }
  /* Quy tắc chưa chạy tháng này (checked.skipped): mỗi quy tắc một dòng, tên theo nhãn của giao diện, lý do NGUYÊN VĂN của máy chủ.
     Quy tắc Admin tắt (lý do "Admin tắt") đứng riêng ở đầu, kèm liên kết sang Cài đặt › Cảnh báo AI để bật lại. */
  function skippedNote(skipped) {
    return '';
  }
  function warnCard() {
    const ai = A.ai;
    const head = `<div class="card-h"><h2>Cảnh báo AI</h2><span class="cap">Xếp theo mức độ</span></div>`;
    if (!aiOk())
      return `<section class="card flush tl-warnc" aria-label="Cảnh báo AI">${head}<div class="tl-pad">${
        ai.state === 'fail'
          ? `${A.errorBox(ai.error, false)}<div style="margin-top:8px"><button class="btn sm" type="button" data-act="trretry">Thử lại</button></div>`
          : '<div class="skel" style="width:70%;margin:14px 0"></div><div class="skel" style="width:50%"></div>'
      }</div></section>`;
    const L = lists();
    const st = ['open', 'done', 'all'].includes(S.f.aistate) ? S.f.aistate : 'open';
    const all = L[st];
    const rules = [...new Set(all.map(f => f.rule))].sort((a, b) => A.ruleLabel(a).localeCompare(A.ruleLabel(b), 'vi'));
    const rf = rules.includes(S.f.airule) ? S.f.airule : '';
    const seg = (v, label, n) =>
      `<button type="button" class="${st === v ? 'on' : ''}" data-act="f" data-k="aistate" data-v="${v}" data-pg="find" aria-pressed="${st === v}">${label} · ${nf(n)}</button>`;
    const ctl = `<div class="tl-ctl"><div class="seg" role="group" aria-label="Lọc theo tình trạng xử lý">${seg('open', 'Chưa xử lý', L.open.length)}${seg('done', 'Đã bỏ qua', L.done.length)}${seg('all', 'Tất cả', L.all.length)}</div>
<label class="sr" for="airule">Lọc theo quy tắc</label><select id="airule" class="input sm" data-input="f" data-k="airule" data-pg="find"><option value="">Mọi quy tắc</option>${rules.map(r => `<option value="${esc(r)}" ${rf === r ? 'selected' : ''}>${esc(A.ruleLabel(r))} (${nf(all.filter(f => f.rule === r).length)})</option>`).join('')}</select></div>`;
    const list = all.filter(f => !rf || f.rule === rf);
    const pg = A.pager('find', list.length, PAGE_SIZE);
    const p = S.page.find;
    const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    const names = ai.data.names || {};
    const body =
      pg
        .slice(list)
        .map(f => rowHtml(f, names))
        .join('') ||
      `<li class="tl-empty">${
        st === 'done'
          ? A.empty('Chưa có cảnh báo nào được bỏ qua')
          : st === 'open' && L.done.length
            ? A.empty('Không còn cảnh báo nào chưa xử lý')
            : A.empty('Không có cảnh báo nào')
      }</li>`;
    const foot = `<div class="card-f tl-foot"><span>${list.length ? `${nf(pg.start + 1)}–${nf(pg.end)} trên ${nf(list.length)} cảnh báo` : '0 cảnh báo'}</span><span class="tl-pager"><span class="num">Trang ${p}/${pages}</span><button type="button" class="btn sm icon" data-act="page" data-k="find" data-p="${p - 1}" ${p <= 1 ? 'disabled' : ''} aria-label="Trang trước">${ic('chevl', 16)}</button><button type="button" class="btn sm icon" data-act="page" data-k="find" data-p="${p + 1}" ${p >= pages ? 'disabled' : ''} aria-label="Trang sau">${ic('chevr', 16)}</button></span></div>`;
    const checked = ai.data.checked || {};
    return `<section class="card flush tl-warnc" aria-label="Cảnh báo AI">${head}${skippedNote(checked.skipped || [])}${ctl}<ul class="tl-list">${body}</ul>${foot}</section>`;
  }

  /* ---------- tiêu đề ---------- */
  function headSub() {
    const ai = A.ai;
    if (!aiOk()) return ai.state === 'fail' ? 'Chưa tải được kết quả AI kiểm tra' : 'Đang tải kết quả AI kiểm tra…';
    const c = ai.data.checked || {};
    const s = A.fmtStamp(ai.data.asOf);
    const when = s === '—' ? s : s.slice(6) === A.fmtDate(A.vnToday()) ? `${s.slice(0, 5)} hôm nay` : s;
    return `<b>${nf(lists().open.length)} cảnh báo</b> chưa xử lý · AI kiểm tra ${nf(c.rules)} quy tắc trên ${nf(c.staff)} nhân sự lúc ${esc(when)}`;
  }

  function render() {
    return `${A.header('Trợ lý AI', headSub())}<div class="tl-grid">${warnCard()}${askCard()}</div>`;
  }
  A.register('tro-ly', {
    load,
    render,
    onMonth: () => {
      T.period = { month: null, state: 'idle', data: null };
      T.slips = { month: null, state: 'idle', errors: null };
    }
  });
})(window.Admin);
