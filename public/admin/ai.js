/* Giao diện Admin: dữ liệu của AI kiểm tra (GET /api/ai/review), ngăn kéo "Lý do AI cảnh báo" (A.openWhy)
   và khung "Bỏ qua cảnh báo" (A.Dismiss). AI chỉ gợi ý theo quy tắc: mỗi cảnh báo nêu quy tắc, số liệu vào và ngưỡng; không nút nào
   ở đây sửa lương, công hay hồ sơ. Mọi chữ từ máy chủ qua A.esc(). Lớp CSS tiền tố tl- nằm ở man-tro-ly.css. */
(function (A) {
  'use strict';
  const { esc, nf, ic, S } = A;

  /* Tên quy tắc hiển thị: khớp RULES trong lib/ai/review.js (máy chủ chỉ trả mã quy tắc) */
  A.RULE_LABEL = {
    'isat-frequency': 'iSAT nhiều lần trong tháng',
    'approved-leave-frequency': '"Nghỉ được duyệt" nhiều lần trong tháng',
    'leave-with-checkin': 'Có Check-in vào ngày xin nghỉ',
    'late-declaration': 'Gửi sau hạn',
    'previously-rejected': 'Yêu cầu cùng loại vừa bị từ chối',
    'repeated-edits': 'Yêu cầu bị sửa nhiều lần',
    'ot-checkin-mismatch': 'Giờ khai OT không khớp Check-in/out',
    'ot-after-pending-makeup': 'OT chờ xử lý khi còn làm bù chờ xử lý trước đó',
    'holiday-work-review': 'Cần kiểm tra OT ngày lễ',
    'attendance-allowance-risk': 'Yêu cầu làm đổi phụ cấp chuyên cần',
    'large-pay-impact': 'Khoản duyệt ảnh hưởng đáng kể đến thu nhập',
    'ot-above-team': 'OT cao hơn nhiều so với nhóm',
    'missing-start-date': 'Thiếu ngày vào làm',
    'negative-leave': 'Phép năm âm',
    'missing-fixed-shift': 'Chưa có ca cố định',
    'slip-override-gap': 'Số sửa trên phiếu lệch nhiều so với số máy tính',
    'locked-with-pending': 'Tài khoản đã khoá còn yêu cầu chờ xử lý',
    'kpi-self-100-streak': 'Tự đánh giá KPI 100% nhiều tháng liền',
    'net-nonpositive': 'Thực nhận ≤ 0',
    'formula-changed-recently': 'Cài đặt lương đổi có hiệu lực từ tháng này',
    'block-flags-unconfirmed': 'Khối phụ cấp miễn thuế hoặc vào nền bảo hiểm chưa có xác nhận của Kế toán',
    'override-looks-like-entry': 'Số sửa trên phiếu giống một khoản cộng thêm',
    /* hai quy tắc gợi ý của bước xem trước khi lưu cài đặt (lib/ai/preview-suggestions.js → PREVIEW_RULES) */
    'formula-large-change': 'Thay đổi làm đổi thực nhận của nhiều người hoặc tổng chênh lớn',
    'position-scope-leak': 'Thay đổi dành cho một chức vụ nhưng chạm người ngoài chức vụ'
  };
  A.ruleLabel = id => A.RULE_LABEL[id] || String(id);
  /* Công tắc từng quy tắc là khoá ai.rule.<mã camelCase>.enabled (registry aiRules: isatFrequency ↔ isat-frequency).
     Trả mã quy tắc (isat-frequency) của một khoá, hoặc null khi khoá không phải công tắc quy tắc. */
  A.ruleIdOfKey = key => {
    const m = /^ai\.rule\.([A-Za-z0-9]+)\.enabled$/.exec(String(key || ''));
    return m
      ? m[1]
          .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
          .replace(/([a-zA-Z])(\d)/g, '$1-$2')
          .toLowerCase()
      : null;
  };
  /* Quy tắc Admin đã tắt trong tháng của kết quả AI: GET /api/ai/review → checked.skipped [{ rule, reason: 'Admin tắt' }] (lý do nguyên văn của máy chủ) */
  const OFF_REASON = 'Admin tắt';
  A.aiOffRules = data =>
    ((data && data.checked && data.checked.skipped) || []).filter(s => s && s.reason === OFF_REASON);
  A.SEVERITY = { high: 'Cao', medium: 'Trung bình', low: 'Thấp' };

  /* Ngưỡng: [nhãn, đơn vị]. Nhãn không kèm đơn vị (màn Cài đặt hiện đơn vị riêng từ danh mục tham số); ngăn kéo lý do ghép "nhãn: số đơn vị". */
  const TH = {
    isatPerMonth: ['iSAT từ lần thứ (trong tháng)', 'lần'],
    approvedLeavePerMonth: ['"Nghỉ được duyệt" từ lần thứ (trong tháng)', 'lần'],
    reportDeadlineDay: ['Hạn báo công (ngày của tháng sau)', ''],
    rejectedLookbackDays: ['Xét yêu cầu bị từ chối trong', 'ngày'],
    repeatedEditsRev: ['Số phiên bản (rev) từ', ''],
    presenceGapMin: ['Thiếu Check-in/out từ', 'phút'],
    otMedianFactor: ['OT cao hơn trung vị nhóm', 'lần'],
    otMedianMinHours: ['và OT ít nhất', 'giờ'],
    otMedianMinPeers: ['Chỉ so khi nhóm có ít nhất', 'người có OT'],
    attendMaxAbsentDays: ['Mất chuyên cần khi nghỉ từ', 'ngày'],
    overLimitHours: ['Mất chuyên cần khi giờ vượt ngưỡng từ', 'giờ'],
    impactVnd: ['Cảnh báo khi mức chênh lệch từ', '₫'],
    slipDiffVnd: ['Số sửa trên phiếu lệch từ', '₫'],
    slipDiffRatio: ['và lệch từ', '%'],
    kpiFullMonths: ['KPI tự chấm 100% liên tiếp từ', 'tháng'],
    kpiFullPct: ['Mức tự chấm tối đa', '%'],
    paramChangePeoplePct: ['Thay đổi làm đổi thực nhận từ', '% số người'],
    formulaChangeTotalVnd: ['Thay đổi làm tổng thực nhận đổi từ', '₫'],
    scopeLeakMinPeople: ['Thay đổi chạm người ngoài chức vụ từ', 'người'],
    overrideEntryRoundVnd: ['Số sửa tròn theo bội của', '₫']
  };
  const THRESHOLD_LABEL = Object.fromEntries(Object.entries(TH).map(([k, [label]]) => [k, label]));
  A.THRESHOLD_LABEL = THRESHOLD_LABEL;
  A.THRESHOLD_UNIT = Object.fromEntries(Object.entries(TH).map(([k, [, unit]]) => [k, unit]));
  const RATIO = new Set(['slipDiffRatio', 'paramChangePeoplePct']); // máy chủ gửi tỉ lệ 0..1, hiện theo %
  const WHY_LABEL = { impactVnd: 'Báo khi tác động tiền từ' }; // chữ riêng của ngăn kéo lý do
  const INPUT_LABEL = {
    ordinal: 'Lần thứ',
    count: 'Số lần trong tháng',
    kind: 'Loại ngày',
    sessions: 'Số lượt Check-in/out',
    firstIn: 'Check-in đầu',
    lastOut: 'Check-out cuối',
    submittedDate: 'Ngày gửi',
    deadlineDate: 'Hạn báo công',
    daysLate: 'Số ngày gửi muộn',
    rejectedDate: 'Ngày của yêu cầu bị từ chối',
    rejectedOn: 'Ngày bị từ chối',
    rejectedCount: 'Số yêu cầu bị từ chối',
    rev: 'Số phiên bản',
    item: 'Loại yêu cầu',
    declared: 'Giờ khai',
    presence: 'Giờ có mặt (Check-in/out)',
    declaredMin: 'Phút khai',
    coveredMin: 'Phút có mặt phủ giờ khai',
    shortfallMin: 'Phút thiếu',
    makeupDates: 'Ngày làm bù còn chờ xử lý',
    makeupCount: 'Số ngày làm bù chờ xử lý',
    hours: 'Số giờ',
    pivotal: 'Yêu cầu quyết định chuyên cần',
    tipping: 'Yêu cầu làm đổi kết quả',
    absentDaysIfApproved: 'Số ngày nghỉ nếu đồng ý',
    overHoursIfApproved: 'Giờ vượt ngưỡng nếu đồng ý',
    attendOkIfApproved: 'Giữ chuyên cần nếu đồng ý',
    absentDaysIfRejected: 'Số ngày nghỉ nếu từ chối',
    overHoursIfRejected: 'Giờ vượt ngưỡng nếu từ chối',
    attendOkIfRejected: 'Giữ chuyên cần nếu từ chối',
    impactVnd: 'Mức chênh lệch tổng thu nhập',
    otHours: 'Giờ OT của người này',
    teamMedianHours: 'Trung vị của nhóm (giờ)',
    peers: 'Số người so sánh',
    type: 'Loại nhân sự',
    used: 'Phép đã dùng',
    accrued: 'Phép được cộng',
    balance: 'Số dư',
    switchDate: 'Ngày chuyển tính theo Check-in/out',
    daysToSwitch: 'Còn (ngày)',
    fields: 'Mục lệch',
    lockedSince: 'Khoá từ',
    streakMonths: 'Số tháng liên tiếp',
    months: 'Các tháng',
    selfPct: 'Tự chấm (%)'
  };
  const fmtValue = (key, v) => {
    if (v === null || v === undefined || v === '') return '—';
    if (typeof v === 'boolean') return v ? 'Có' : 'Không';
    if (key === 'type') return esc(A.TYPE_LONG[v] || v);
    if (key === 'item' || key === 'kind') return esc(A.ITEM_LABEL[v] || v);
    if (typeof v === 'number') return /Vnd$/.test(key) ? `${nf(v)} ₫` : nf(v);
    if (Array.isArray(v))
      return v.length ? v.map(x => (typeof x === 'object' ? esc(JSON.stringify(x)) : esc(x))).join(', ') : '—';
    if (typeof v === 'object') return esc(JSON.stringify(v));
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return esc(A.fmtDate(v));
    return esc(v);
  };
  A.fmtEvidenceValue = fmtValue;
  /* Số của ngưỡng kèm đơn vị: "16 giờ", "500.000 ₫", "20%" (đã qua esc) */
  const thValue = (k, v) => {
    if (typeof v !== 'number') return fmtValue(k, v);
    const unit = A.THRESHOLD_UNIT[k] || '';
    const n = RATIO.has(k) ? nf(v * 100) : nf(v);
    if (!unit) return n;
    return unit.startsWith('%') ? `${n}${esc(unit)}` : `${n} ${esc(unit)}`;
  };
  const upFirst = s => (s ? s[0].toUpperCase() + s.slice(1) : s);
  /* Câu cảnh báo của máy chủ: hiện nguyên văn (giao diện không cắt hay viết lại) */
  A.aiMessage = f => String((f && f.message) || '');

  /* ---------- tải và nhớ kết quả kiểm tra theo tháng ---------- */
  A.ai = { month: null, state: 'idle', data: null, error: null, promise: null };
  /* opts.quiet: chỉ cần số liệu cho khung (thanh kỳ lương), xong thì chỉ vẽ lại khung, không vẽ lại màn đang gõ dở.
     Màn nào gọi không quiet trong lúc đang tải thì vẫn được vẽ lại khi xong. */
  A.loadAi = (force = false, opts = {}) => {
    const month = S.month;
    if (!A.agentsEnabled()) {
      A.ai = { month, state: 'idle', data: null, error: null, promise: Promise.resolve() };
      return A.ai.promise;
    }
    if (!force && A.ai.month === month && (A.ai.state === 'ok' || A.ai.state === 'loading')) {
      if (!opts.quiet) A.ai.loud = true;
      return A.ai.promise;
    }
    const mine = { month, state: 'loading', data: null, error: null, promise: null, loud: !opts.quiet };
    A.ai = mine;
    mine.promise = A.api('GET', '/ai/review' + A.qs({ month }))
      .then(data => {
        mine.state = 'ok';
        mine.data = data;
      })
      .catch(e => {
        mine.state = 'fail';
        mine.error = A.errText(e);
      })
      .then(() => {
        if (A.ai !== mine) return;
        if (mine.loud) A.render();
        else A.renderChrome();
      });
    return mine.promise;
  };
  /* Cảnh báo gắn vào một yêu cầu: chỉ nhận khi rev và fingerprint khớp đúng dòng đang hiện. Trả về:
     { state: 'flagged' | 'clean' | 'unreviewed', findings: [...] }
     Quy tắc Admin tắt (checked.skipped, lý do "Admin tắt") không chạy: AI vẫn đã soát tháng đó, nên dòng không có cảnh báo của quy tắc
     khác là 'clean', không phải 'unreviewed'; cảnh báo cũ còn sót của quy tắc đã tắt (nếu có) không làm dòng thành "chưa soát". */
  A.aiJoin = (row, review) => {
    if (!review || review.state !== 'ok') return { state: 'unreviewed', findings: [] };
    if (row.date.slice(0, 7) !== review.month) return { state: 'unreviewed', findings: [] };
    if (!review.idx) {
      review.idx = new Map();
      const off = new Set(A.aiOffRules(review.data).map(s => s.rule));
      for (const f of review.data.findings || []) {
        if (!f.date || off.has(f.rule)) continue;
        const k = f.username + '|' + f.date;
        if (!review.idx.has(k)) review.idx.set(k, []);
        review.idx.get(k).push(f);
      }
    }
    const all = review.idx.get(row.username + '|' + row.date) || [];
    const match = all.filter(
      f => f.approval && f.approval.rev === row.rev && f.approval.fingerprint === row.fingerprint
    );
    // Có cảnh báo nhưng lệch phiên bản: dữ liệu vừa đổi giữa hai lần tải, coi như chưa kiểm tra
    if (all.length && !match.length) return { state: 'unreviewed', findings: [] };
    return match.length ? { state: 'flagged', findings: match } : { state: 'clean', findings: [] };
  };
  A.aiThresholds = () => (A.ai.data && A.ai.data.thresholds) || {};

  /* Cảnh báo chưa xử lý và đã bỏ qua (máy chủ gắn dismissed = { by, at, note } hoặc null cho từng cảnh báo). Thiếu trường này:
     coi như chưa ai bỏ qua. Đếm Tổng / Cao / Trung bình / Thấp chỉ tính cảnh báo chưa xử lý; số đã bỏ qua đứng riêng. */
  A.aiSplit = data => {
    const all = (data && data.findings) || [];
    const open = all.filter(f => !f.dismissed);
    const done = all.filter(f => f.dismissed);
    const bySeverity = { high: 0, medium: 0, low: 0 };
    for (const f of open) if (f.severity in bySeverity) bySeverity[f.severity] += 1;
    return { all, open, done, total: open.length, bySeverity };
  };
  /* dd/mm/yyyy HH:mm giờ Việt Nam từ chuỗi ISO UTC (A.fmtStamp trả HH:mm dd/mm/yyyy) */
  A.fmtStampDMY = iso => {
    const s = A.fmtStamp(iso);
    return s === '—' ? s : `${s.slice(6)} ${s.slice(0, 5)}`;
  };
  /* Dòng "bởi <người> lúc <giờ>: <lý do>" của cảnh báo đã bỏ qua (đã qua esc) */
  A.dismissedLine = (f, names) => {
    const d = f.dismissed;
    if (!d) return '';
    const who = (names && names[d.by]) || d.by || '—';
    return `bởi ${esc(who)} lúc ${esc(A.fmtStampDMY(d.at))}${d.note ? ': ' + esc(d.note) : ''}`;
  };

  /* ---------- chỗ sửa: [màn, chữ liên kết, mục con của Cài đặt] ---------- */
  const FIX = {
    'ot-checkin-mismatch': ['cham-cong', 'Mở Chấm công'],
    'leave-with-checkin': ['cham-cong', 'Mở Chấm công'],
    'ot-above-team': ['cham-cong', 'Mở Chấm công'],
    'ot-after-pending-makeup': ['cham-cong', 'Mở Chấm công'],
    'holiday-work-review': ['cham-cong', 'Mở Chấm công'],
    'attendance-allowance-risk': ['cham-cong', 'Mở Chấm công'],
    'missing-start-date': ['ho-so', 'Mở hồ sơ'],
    'negative-leave': ['ho-so', 'Mở hồ sơ'],
    'missing-fixed-shift': ['ho-so', 'Mở hồ sơ để gán ca'],
    'locked-with-pending': ['ho-so', 'Mở hồ sơ'],
    'slip-override-gap': ['luong', 'Mở Bảng lương'],
    'override-looks-like-entry': ['luong', 'Mở Bảng lương'],
    'block-flags-unconfirmed': ['cai-dat', 'Mở Chế độ theo loại', 'quyen-loi'],
    'large-pay-impact': ['duyet', 'Mở yêu cầu'],
    'kpi-self-100-streak': ['kpi', 'Mở Đánh giá KPI'],
    'isat-frequency': ['duyet', 'Mở yêu cầu'],
    'approved-leave-frequency': ['duyet', 'Mở yêu cầu'],
    'late-declaration': ['duyet', 'Mở yêu cầu'],
    'previously-rejected': ['duyet', 'Mở yêu cầu'],
    'repeated-edits': ['duyet', 'Mở yêu cầu'],
    'net-nonpositive': ['luong', 'Mở Bảng lương'],
    'formula-changed-recently': ['cai-dat', 'Mở Cách tính lương', 'so-do']
  };
  A.fixTarget = rule => FIX[rule] || ['duyet', 'Mở yêu cầu'];
  A.gotoFinding = f => {
    const [view, , sub] = A.fixTarget(f.rule);
    const name = (A.ai.data && A.ai.data.names && A.ai.data.names[f.username]) || f.username;
    const key = { duyet: 'duyet', 'cham-cong': 'cc', 'ho-so': 'hoso', kpi: 'kpi' }[view];
    if (key && name) {
      S.q[key] = name;
      S.page[key] = 1;
    }
    if (view === 'duyet') S.f.dst = 'pending';
    A.closeDialog();
    if (f.month && f.month !== S.month) A.setMonth(f.month);
    A.go(view, sub);
  };

  /* ---------- thẻ một cảnh báo (ngăn kéo "Lý do AI cảnh báo") ----------
     opts.meta (mặc định true): thẻ tự ghi Nhân sự và Kỳ/Ngày; false khi ngăn kéo đã có khung tóm tắt chung ở đầu. */
  const typeTxtOf = f => {
    const s = f.username && A.staff && A.staff.byUser ? A.staff.byUser.get(f.username) : null;
    const t = (s && s.type) || (f.evidence && f.evidence.inputs && f.evidence.inputs.type);
    return t ? A.TYPE_LONG[t] || '' : '';
  };
  A.findingHtml = (f, names, opts = {}) => {
    const meta = opts.meta !== false;
    const th = A.aiThresholds();
    const ev = f.evidence || {};
    const t = ev.threshold || {};
    const proposalAny = !!t.proposal;
    const rows = Object.keys(t)
      .filter(k => !['basis', 'proposal', 'sources'].includes(k))
      .map(k => {
        const entry = th[k];
        const proposal = entry ? !!entry.proposal : proposalAny;
        return `<div class="tl-r"><span>${esc(WHY_LABEL[k] || THRESHOLD_LABEL[k] || k)}: <b class="num">${thValue(k, t[k])}</b></span>${proposal ? A.pill('gold', 'Ngưỡng đề xuất') : A.pill('done', 'Ngưỡng đã chốt')}</div>`;
      })
      .join('');
    const rules = rows;
    const typeTxt = meta && f.username ? typeTxtOf(f) : '';
    const person = (names && names[f.username]) || f.username;
    const metaHtml = meta
      ? `<div class="tl-m2">${f.username ? `<div><span>Nhân sự</span><b>${esc(person)}${typeTxt ? ' · ' + esc(typeTxt) : ''}</b></div>` : '<div><span>Phạm vi</span><b>Cả hệ thống, không gắn với một người</b></div>'}<div><span>${f.date ? 'Ngày' : 'Kỳ'}</span><b class="num">${f.date ? esc(A.fmtDate(f.date)) : esc(upFirst(A.monthLabel(f.month)))}</b></div></div>`
      : '';
    const inputs = Object.entries(ev.inputs || {})
      .filter(([k]) => !(k === 'type' && typeTxt))
      .map(
        ([k, v]) =>
          `<div><span>${esc(INPUT_LABEL[k] || k)}</span><b class="${typeof v === 'number' ? 'num' : 'tx'}">${fmtValue(k, v)}</b></div>`
      )
      .join('');
    const label = A.ruleLabel(f.rule);
    const sev = (A.SEVERITY[f.severity] || f.severity || '').toLowerCase();
    return `<article class="tl-wc${f.dismissed ? ' done' : ''}" aria-label="${esc(label)}">
<div class="tl-wh"><span class="tl-tag">${ic('spark', 11, 2)}AI</span><b>${esc(label)}</b><span class="pill p-${esc(f.severity)}">Mức ${esc(sev)}</span></div>
${metaHtml}<p class="tl-fact">${esc(A.aiMessage(f))}</p>${inputs ? `<div class="tl-in">${inputs}</div>` : ''}
${rules ? `<div class="tl-rl">${rules}</div>` : ''}
<div class="tl-ft"><button class="link" type="button" data-fix="${esc(f.id)}">${esc(A.fixTarget(f.rule)[1])}</button>${
      f.dismissed
        ? `<div class="fd-line">${A.pill('draft', 'Đã bỏ qua')}<span>${A.dismissedLine(f, names)}</span></div>`
        : `<div class="tl-dsm" data-dsm-find="${esc(f.id)}"></div>`
    }</div></article>`;
  };

  /* Khung tóm tắt ở đầu ngăn kéo khi mọi cảnh báo cùng một người: Nhân sự, Yêu cầu (loại · ngày) hoặc Ngày / Kỳ, cộng các ô màn gọi đưa thêm */
  const headHtml = (findings, names, facts) => {
    const f0 = findings[0];
    const date = new Set(findings.map(f => f.date || '')).size === 1 ? f0.date : '';
    const withItem = date ? findings.find(f => f.item) : null;
    const cell = (label, value, num) =>
      `<div><span>${esc(label)}</span><b${num ? ' class="num"' : ''}>${value}</b></div>`;
    const second = withItem
      ? cell('Yêu cầu', `${esc(A.itemLabel(withItem.item))} · ${esc(A.fmtDate(date))}`)
      : date
        ? cell('Ngày', esc(A.fmtDate(date)), true)
        : cell('Kỳ', esc(upFirst(A.monthLabel(f0.month))), true);
    const more = (facts || []).map(([l, v]) => cell(l, esc(v), true)).join('');
    return `<div class="tl-req">${cell('Nhân sự', esc((names && names[f0.username]) || f0.username))}${second}${more}</div>`;
  };

  /* Mở ngăn kéo lý do cho một hay nhiều cảnh báo. extra do màn gọi đưa thêm (đều không bắt buộc):
       body      HTML thêm sau các thẻ
       footHtml  HTML đặt ở chân ngăn kéo, trên hàng nút (ghi chú và ô lý do khi đồng ý / từ chối một yêu cầu)
       facts     [[nhãn, chữ]] thêm vào khung tóm tắt (ví dụ ['Giờ', '08:00–17:00'], ['Gửi', '09:00 10/11']); chữ được esc
       head      HTML thay khung tóm tắt tự dựng ('' để bỏ)
       foot      nút chân như A.openDialog; mặc định một nút Đóng
       dismiss   false: chưa bỏ qua được ở giai đoạn này (nút "Bỏ qua cảnh báo này" bị khoá, có chú thích)
       drawer    false: hộp giữa màn (Trợ lý AI) thay cho ngăn kéo bên phải
     Cảnh báo đã bỏ qua không có nút Bỏ qua, chỉ hiện ai bỏ qua, lúc nào, lý do gì. */
  A.openWhy = (findings, extra = {}) => {
    const names = (A.ai.data && A.ai.data.names) || {};
    const byId = Object.fromEntries(findings.map(f => [f.id, f]));
    const drawer = extra.drawer !== false;
    const users = new Set(findings.map(f => f.username || ''));
    const onePerson = users.size === 1 && !!findings[0].username;
    const useHead =
      extra.head !== undefined
        ? !!extra.head
        : onePerson && (findings.length > 1 || findings.some(f => f.item) || !!(extra.facts && extra.facts.length));
    const head = extra.head !== undefined ? extra.head : useHead ? headHtml(findings, names, extra.facts) : '';
    return A.openDialog({
      title: 'Lý do AI cảnh báo',
      sub: 'Quy tắc nào, số liệu nào, ngưỡng nào · AI chỉ gợi ý, bạn quyết định',
      drawer,
      wide: drawer,
      body: `${head}<div class="tl-cards">${findings.map(f => A.findingHtml(f, names, { meta: !useHead })).join('')}</div>${extra.body || ''}`,
      foot: extra.foot || [{ label: 'Đóng' }],
      onMount: api => {
        api.root.classList.add('tl-why');
        if (extra.footHtml)
          api.root.querySelector('.mf').insertAdjacentHTML('afterbegin', `<div class="tl-mfx">${extra.footHtml}</div>`);
        api.root.addEventListener('click', ev => {
          const b = ev.target.closest('[data-fix]');
          if (b && byId[b.dataset.fix]) A.gotoFinding(byId[b.dataset.fix]);
        });
        /* Bỏ qua có lý do ngay trong thẻ: mỗi cảnh báo một nút (cùng bộ vẽ với Bảng lương) */
        for (const f of findings) {
          const box = api.root.querySelector(`[data-dsm-find="${CSS.escape(f.id)}"]`);
          if (!box || !f.username || !f.month) continue;
          if (extra.dismiss === false) {
            box.innerHTML = `<button type="button" class="btn sm" aria-disabled="true" title="${esc(NOT_YET)}">Bỏ qua cảnh báo này</button><span class="sr">${esc(NOT_YET)}</span>`;
            continue;
          }
          A.Dismiss.mount(box, {
            month: f.month,
            username: f.username,
            flags: [f.rule],
            compact: true,
            onChange: () => A.loadAi(true).then(() => A.render())
          });
        }
      }
    });
  };
  const NOT_YET = 'Chỉ bỏ qua được sau khi tính lương và AI kiểm tra, trước khi phê duyệt';

  /* ---------- Bỏ qua một cảnh báo của AI: POST /api/ai/findings/dismiss { month, username, rule, reason 10-300 } ----------
     Trả { dismissed, already, remaining:[quy tắc] }. Lỗi: 400 REASON_REQUIRED, 404 PAYSLIP_NOT_FOUND / FINDING_NOT_FOUND, 409 PERIOD_NOT_READY / PERIOD_STATE
     (hiện nguyên văn). Máy chủ chưa có đường dẫn thì nút hiện "Sắp có". Dùng ở hộp bỏ qua và phiếu của Bảng lương, hộp phê duyệt riêng, ngăn kéo lý do. */
  const DS = { status: 'unknown', promise: null, listeners: new Set() };
  const REASON_MAX = 300;
  const KNOWN_CODES = [
    'PAYSLIP_NOT_FOUND',
    'FINDING_NOT_FOUND',
    'REASON_REQUIRED',
    'PERIOD_NOT_READY',
    'PERIOD_STATE',
    'FORBIDDEN_CAP'
  ];
  const noRoute = e =>
    !!e &&
    ((e.status === 404 && !KNOWN_CODES.includes(e.data && e.data.code)) ||
      e.status === 405 ||
      (e.status === 403 && e.data && e.data.code === 'NO_ROUTE_POLICY'));
  /* Không gửi yêu cầu ghi nào để dò: đường dẫn bỏ qua đã có ở máy chủ, nên coi là dùng được. Nếu một lần bỏ qua thật gặp
     "không có đường dẫn" (noRoute) thì mới đổi sang 'no' (xem mount). `again`: mở lại màn thì thử lại. */
  function setStatus(v) {
    if (DS.status === v) return;
    DS.status = v;
    for (const fn of DS.listeners) fn(v);
  }
  function probe(again = false) {
    if (again || DS.status === 'unknown') setStatus('yes');
    return Promise.resolve(DS.status);
  }
  const dsmError = e => A.errText(e);
  /* Vẽ các cảnh báo của một phiếu vào el; mỗi cảnh báo có nút "Bỏ qua" mở ô lý do ngay tại chỗ.
     opts: { month, username, flags: [quy tắc], onChange(conLai), compact }. compact: một cảnh báo trong thẻ của ngăn kéo lý do,
     chỉ vẽ nút "Bỏ qua cảnh báo này" (không lặp tên quy tắc). Trả { update(flags) }. */
  function mount(el, opts) {
    if (!el) return { update() {} };
    const compact = !!opts.compact;
    let flags = [...(opts.flags || [])];
    let open = null; // quy tắc đang mở ô lý do
    let busy = false;
    let msg = '';
    /* Lý do không bắt buộc: máy chủ nhận lý do trống, chỉ giữ trần độ dài */
    const form = (f, id) =>
      `<div id="${esc(id)}" class="tl-dsmf"><label class="lbl" for="${esc(id)}-t">Lý do bỏ qua (không bắt buộc)</label><textarea id="${esc(id)}-t" class="input" maxlength="${REASON_MAX}" placeholder="Ghi rõ vì sao cảnh báo này không cần xử lý"></textarea><div class="row wrap" style="gap:8px"><button type="button" class="btn sm pri" data-dsm="go" data-rule="${esc(f)}" ${busy ? 'disabled' : ''}>Xác nhận bỏ qua</button><button type="button" class="btn sm ghost" data-dsm="cancel">Huỷ</button></div></div>`;
    const button = (f, id, label) =>
      DS.status === 'yes'
        ? `<button type="button" class="btn sm" data-dsm="open" data-rule="${esc(f)}" aria-expanded="${open === f}" aria-controls="${esc(id)}">${label}</button>`
        : `<button type="button" class="btn sm" aria-disabled="true" title="${DS.status === 'no' ? 'Máy chủ chưa có chức năng bỏ qua' : 'Đang kiểm tra máy chủ'}">${label}${DS.status === 'no' ? ' ' + A.soonTag() : ''}</button>`;
    const paint = () => {
      const list = flags
        .map(f => {
          const id = `dsm-${opts.username}-${f}`.replace(/[^A-Za-z0-9_-]/g, '_');
          const extraForm = open === f ? form(f, id) : '';
          return compact
            ? `${button(f, id, 'Bỏ qua cảnh báo này')}${extraForm}`
            : `<div class="tl-aifw"><div class="tl-aif"><span class="tl-tag">${ic('spark', 11, 2)}AI</span><span class="grow">${esc(A.ruleLabel(f))}</span>${button(f, id, 'Bỏ qua')}</div>${extraForm}</div>`;
        })
        .join('');
      const empty = compact
        ? `<span class="tl-dsm-ok">${A.pill('draft', 'Đã bỏ qua')}<span class="cap">Lý do đã ghi vào nhật ký</span></span>`
        : '<span class="cap">Không còn cảnh báo nào chưa bỏ qua.</span>';
      el.innerHTML =
        (flags.length ? list : empty) +
        (msg ? `<div class="warn" role="alert">${ic('alert', 16)}<span>${esc(msg)}</span></div>` : '');
    };
    paint();
    DS.listeners.add(paint);
    probe();
    el.addEventListener('click', async ev => {
      const b = ev.target.closest('[data-dsm]');
      if (!b || b.disabled) return;
      const act = b.dataset.dsm;
      if (act === 'open') {
        open = open === b.dataset.rule ? null : b.dataset.rule;
        msg = '';
        paint();
        const t = el.querySelector('textarea');
        if (t) t.focus();
      } else if (act === 'cancel') {
        open = null;
        msg = '';
        paint();
      } else if (act === 'go') {
        const rule = b.dataset.rule;
        const t = el.querySelector('textarea');
        const reason = t ? t.value.trim() : '';
        if (reason.length > REASON_MAX) {
          msg = `Lý do tối đa ${REASON_MAX} ký tự (hiện có ${reason.length}).`;
          paint();
          const t2 = el.querySelector('textarea');
          if (t2) {
            t2.value = reason;
            t2.focus();
          }
          return;
        }
        busy = true;
        msg = '';
        paint();
        try {
          const res = await A.api('POST', '/ai/findings/dismiss', {
            month: opts.month,
            username: opts.username,
            rule,
            reason
          });
          // compact chỉ giữ đúng cảnh báo của thẻ; danh sách giữ mọi cảnh báo còn lại của phiếu như máy chủ trả
          flags = !compact && Array.isArray(res.remaining) ? res.remaining : flags.filter(x => x !== rule);
          open = null;
          busy = false;
          paint();
          A.toast(
            res.already ? 'Cảnh báo này đã được bỏ qua trước đó' : 'Đã bỏ qua cảnh báo, lý do được ghi vào nhật ký'
          );
          if (opts.onChange) opts.onChange(flags, res);
        } catch (e) {
          busy = false;
          if (noRoute(e)) setStatus('no'); // máy chủ chưa có chức năng: nút chuyển sang "Sắp có"
          msg = dsmError(e);
          paint();
          const t3 = el.querySelector('textarea');
          if (t3) {
            t3.value = reason;
            t3.focus();
          }
        }
      }
    });
    return {
      update(next) {
        flags = [...(next || [])];
        paint();
      }
    };
  }
  A.Dismiss = { status: () => DS.status, probe, mount, onStatus: fn => DS.listeners.add(fn) };
})(window.Admin);
