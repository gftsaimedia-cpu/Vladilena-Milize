/* Màn Bảng lương (#luong): vòng đời kỳ lương trên các route thật (GET /api/periods, /api/periods/:month, các bước POST,
   phiếu, verify). Trạng thái: open → attendance_locked → calculated → reviewed → approved → paid. Mọi lần ghi gửi `rev`, có hộp xác nhận;
   lỗi 409 (PERIOD_STALE, PERIOD_STATE, PERIOD_NOT_READY, PAYSLIP_*) hiện rõ, gặp STALE thì tải lại.
   Mọi số tiền lấy từ máy chủ (bản chụp của lần tính), không có phép tính tiền ở đây: dải công thức là `totals` của máy chủ, các dòng là
   `tienNgayCong, phuCap, ot, kpi, khac, truTreSom` của từng phiếu. `truTreSom` ĐÃ nằm trong tienNgayCong: chỉ ghi chú dưới ô, không cộng.
   Số là ƯỚC TÍNH (màu nâu) cho tới khi phê duyệt kỳ. Trước lần tính đầu, bảng là ước tính của máy chủ (GET /api/periods/:month/estimates).
   Sáu bước của kỳ nằm ở thanh kỳ lương chung (ui.js); nút của bước kế tiếp ở góc phải tiêu đề.
   "Bỏ qua" một cảnh báo của AI: A.Dismiss (ai.js) → POST /api/ai/findings/dismiss.
   Không bước nào bị chặn hay khoá (kể cả mở lại kỳ đã trả lương), lý do không bắt buộc,
   không có ô "Bỏ qua" của danh sách kiểm; cảnh báo máy chủ trả sau mỗi bước hiện nguyên văn trong hộp (warnResult).
   Câu lỗi của máy chủ hiện nguyên văn (explain chỉ thêm việc màn đã làm và tên người liên quan).
   Mọi chuỗi từ API qua A.esc() trước khi vào innerHTML. */
(function (A) {
  'use strict';
  const { esc, nf, ic, S } = A;

  /* ---------- nhãn hiển thị ---------- */
  const STATUS_ORDER = ['open', 'attendance_locked', 'calculated', 'reviewed', 'approved', 'paid'];
  const rank = s => STATUS_ORDER.indexOf(s);
  const STATUS_TXT = {
    open: 'Chưa tính lương',
    attendance_locked: 'Đã chốt công',
    calculated: 'Đã tính lương (bản nháp)',
    reviewed: 'Đã qua AI kiểm tra, đang phê duyệt',
    approved: 'Đã phê duyệt kỳ',
    paid: 'Đã trả lương'
  };
  const STATUS_PILL = {
    open: 'line',
    attendance_locked: 'draft',
    calculated: 'pending',
    reviewed: 'pending',
    approved: 'done',
    paid: 'done'
  };
  const NEXT_ACTION = {
    open: 'Chốt công',
    attendance_locked: 'Tính lương',
    calculated: 'Chạy AI kiểm tra',
    reviewed: 'Phê duyệt phiếu và phê duyệt kỳ',
    approved: 'Đánh dấu đã trả lương',
    paid: 'Hoàn tất'
  };
  const nextAction = v => (v.status === 'calculated' && !v.run ? 'Tính lương' : NEXT_ACTION[v.status]);
  const SLIP_PILL = {
    draft: ['draft', 'Bản nháp'],
    pending: ['pending', 'Chờ phê duyệt'],
    error: ['rejected', 'Chưa tính được'],
    approved: ['done', 'Đã phê duyệt']
  };
  const CHECK_TXT = {
    MONTH_NOT_ENDED: () => `Tháng ${mNum()} chưa kết thúc · hết ngày ${A.daysInMonth(K.month)}/${K.month.slice(5)}`,
    OPEN_SESSIONS: 'Lượt Check-in còn đang mở',
    FORGOT_PUNCH: 'Ngày quên Check-in/out chờ xử lý',
    PUNCH_REVIEW: 'Ngày chấm công chờ đối soát (lệch ca, cần xem lại)',
    EXPLANATION_PENDING: 'Ngày có giải trình chưa duyệt',
    PENDING_APPROVALS: 'Yêu cầu chờ xử lý',
    ISAT_INVALID: 'Ngày iSAT sai thứ hoặc chức vụ không có quyền lợi iSAT',
    MISSING_SHIFT: 'Nhân sự chưa có ca cố định',
    MISSING_START_DATE: 'Nhân sự thiếu ngày bắt đầu làm',
    AI_NOT_RUN: 'AI chưa kiểm tra sau lần tính gần nhất',
    // hai cảnh báo không chặn: khoản cộng/trừ thêm chưa phê duyệt không vào lương; lần tính đã cũ so với dữ liệu
    PENDING_PAY_ENTRIES: () => 'Khoản cộng/trừ thêm chờ phê duyệt (khoản chưa phê duyệt không vào lương)',
    RUN_STALE: () => 'Lần tính đã cũ, dữ liệu đổi sau khi tính: nên tính lại trước khi phê duyệt'
  };
  const checkText = i => {
    const t = CHECK_TXT[i.code];
    return typeof t === 'function' ? t(i) : t || 'Việc cần kiểm tra';
  };
  // Mục của danh sách kiểm → màn xử lý
  const CHECK_LINK = {
    attendance: 'cham-cong',
    approvals: 'duyet',
    staff: 'ho-so',
    'pay-entries': 'luong',
    periods: 'luong'
  };
  // Phiếu chưa tính được: mã lỗi → chỗ sửa (hồ sơ nhân sự hay cách tính lương); mã khác không có liên kết
  const ERR_FIX = { PAYROLL_BAD_LEVEL: 'profile', PAYROLL_BAD_TYPE: 'profile', PAYROLL_BAD_FORMULA: 'formula' };
  const SEARCH_DEBOUNCE_MS = 300;
  const PREVIEW_ROWS = 5; // số phiếu hiện ở thẻ Kỳ lương của Tổng quan
  const ERR_LIST_SHOW = 8; // số người nêu tên trong một thông báo lỗi
  const SLIP_PAGE_MAX = 200; // trang tối đa của GET /periods/:month/payslips (lib/config.js PAYSLIP_PAGE_MAX)

  /* ---------- trạng thái ---------- */
  const K = {
    month: null,
    view: { state: 'idle', data: null, error: '' },
    year: { key: null, rows: [] },
    q: { status: '', flag: '', q: '', type: '', page: 1 },
    full: false, // "Xem đủ cột": tiền ngày công, phụ cấp, OT, lương KPI, khác (và khoản cộng/trừ thêm nếu có)
    typeOk: true, // máy chủ nhận bộ lọc type (hết đúng khi gặp 400)
    slips: { state: 'idle', data: null, error: '' },
    est: { state: 'idle', data: null, error: '' }, // ước tính trước lần tính đầu: idle | loading | ok | na (máy chủ chưa có) | fail
    flagN: { all: null, pending: null }, // số phiếu có cảnh báo AI (cả kỳ, và đang chờ phê duyệt): `total` của máy chủ
    verify: { state: 'idle', data: null, error: '' },
    sel: new Set(),
    revs: new Map(), // rev của phiếu đã chọn ở trang khác (để gửi kèm lúc phê duyệt); phiếu trong trang đang xem thì lấy rev mới nhất của trang
    selBusy: false, // đang gom các phiếu sạch của cả kỳ
    preview: null,
    timer: null
  };
  const caps = () => (A.meInfo && Array.isArray(A.meInfo.caps) ? A.meInfo.caps : null);
  const can = c => (caps() ? caps().includes(c) : true); // máy chủ vẫn kiểm; thiếu năng lực chỉ làm nút mờ
  const fmtAt = v => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? A.fmtDate(v) : v ? A.fmtStamp(v) : '—');
  const dmOf = v => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? A.fmtDM(v) : v ? A.fmtStamp(v).slice(6, 11) : '—');
  const shortAt = iso => (iso ? A.fmtStamp(iso).slice(0, 11) : ''); // "12:01 26/11"
  const amt = n => (Number.isFinite(Number(n)) ? Number(n).toLocaleString('vi-VN', { maximumFractionDigits: 0 }) : '—');
  const vnd = n => (Number.isFinite(Number(n)) ? `${amt(n)} ₫` : '—');
  const mNum = () => String(Number((K.month || S.month).slice(5))); // "10"
  const mFull = () => A.monthLabel(K.month || S.month).replace('tháng ', ''); // "10/2026"
  const clearSel = () => {
    K.sel.clear();
    K.revs.clear();
  };
  const nameOf = u => {
    const s = A.staff && A.staff.byUser && A.staff.byUser.get(u);
    return s ? s.name : u;
  };

  /* ---------- tải ---------- */
  // Bộ lọc của bảng: phiếu (payslips) lọc được trạng thái và cảnh báo AI; bảng ước tính (estimates) chỉ lọc tên và loại
  const query = (est, extra) =>
    A.qs({
      page: K.q.page,
      ...(est ? {} : { status: K.q.status, flag: K.q.flag }),
      q: K.q.q.trim(),
      type: K.typeOk ? K.q.type : '',
      ...extra
    });
  const missingRoute = e =>
    !!e && (e.status === 404 || e.status === 405 || (e.status === 403 && e.data && e.data.code === 'NO_ROUTE_POLICY'));
  /* Máy chủ chưa lọc theo loại mà vẫn trả 200: có hàng khác loại đã chọn thì coi như chưa hỗ trợ (không hiện kết quả sai) */
  const typeIgnored = d => !!(K.q.type && d && (d.rows || []).some(r => r.type && r.type !== K.q.type));
  const badType = e => !!e && e.status === 400 && /type/i.test(((e.data && e.data.code) || '') + (e.message || ''));
  /* Đọc một trang; máy chủ chưa lọc theo loại (400, hoặc 200 mà trả hàng khác loại) thì bỏ bộ lọc loại, khoá ô chọn rồi đọc lại */
  async function fetchRows(month, est, extra) {
    const url = () => `/periods/${month}/${est ? 'estimates' : 'payslips'}${query(est, extra)}`;
    const drop = () => {
      K.typeOk = false;
      K.q.type = '';
    };
    let data;
    try {
      data = await A.api('GET', url());
    } catch (e) {
      if (!(K.q.type && K.typeOk && badType(e))) throw e;
      drop();
      data = await A.api('GET', url());
    }
    if (!typeIgnored(data)) return data;
    drop();
    return A.api('GET', url());
  }
  async function loadSlips() {
    const v = K.view.data;
    if (!v) return;
    const month = K.month;
    if (!v.run) {
      K.slips = { state: 'idle', data: null, error: '' };
      return loadEstimates(month);
    }
    K.est = { state: 'idle', data: null, error: '' };
    K.slips.state = 'loading';
    try {
      const data = await fetchRows(month, false);
      if (month !== K.month) return;
      K.slips = { state: 'ok', data, error: '' };
      for (const r of data.rows || []) if (K.sel.has(r.username)) K.revs.set(r.username, r.rev);
    } catch (e) {
      K.slips = { state: 'fail', data: null, error: A.errText(e) };
    }
  }
  /* Máy chủ chưa lọc bảng ước tính theo trạng thái: chip "Chưa tính được" đọc mọi trang (200 phiếu một trang) rồi giữ phiếu chưa tính được */
  async function estErrors(month) {
    const rows = [];
    for (let page = 1; ; page += 1) {
      const res = await fetchRows(month, true, { page, pageSize: SLIP_PAGE_MAX });
      rows.push(...(res.rows || []).filter(r => r.status === 'error'));
      if (!(res.rows || []).length || page * res.pageSize >= res.total)
        return { ...res, rows, total: rows.length, page: 1, pageSize: Math.max(rows.length, 1) };
    }
  }
  /* Trước lần tính đầu: ước tính cả kỳ do máy chủ tính (không ghi gì). Máy chủ chưa có đường dẫn thì báo "chưa có". */
  async function loadEstimates(month, all) {
    K.est.state = 'loading';
    try {
      const data = K.q.status === 'error' && !all ? await estErrors(month) : await fetchRows(month, true);
      if (month !== K.month) return;
      K.est = { state: 'ok', data, error: '' };
    } catch (e) {
      if (month !== K.month) return;
      K.est = missingRoute(e)
        ? { state: 'na', data: null, error: '' }
        : { state: 'fail', data: null, error: A.errText(e) };
    }
  }
  /* Số phiếu có cảnh báo AI: `total` của danh sách phiếu lọc flag=1 (và đang chờ phê duyệt), không đếm ở giao diện */
  async function loadFlagCounts(month) {
    try {
      const [all, pending] = await Promise.all([
        A.api('GET', `/periods/${month}/payslips${A.qs({ flag: '1', pageSize: 1 })}`),
        A.api('GET', `/periods/${month}/payslips${A.qs({ flag: '1', status: 'pending', pageSize: 1 })}`)
      ]);
      if (month === K.month) K.flagN = { all: all.total, pending: pending.total };
    } catch {
      if (month === K.month) K.flagN = { all: null, pending: null };
    }
  }
  async function load(force) {
    A.loadStaff();
    A.loadAi();
    A.Dismiss.probe(true).then(() => {
      if (S.view === 'luong') A.render();
    });
    const month = S.month;
    if (A.Entries) A.Entries.load(month).then(() => S.view === 'luong' && A.render()); // khoản cộng/trừ thêm của tháng
    if (!force && K.month === month && K.view.state === 'ok') return;
    if (K.month !== month) {
      K.month = month;
      K.q = { status: '', flag: '', q: '', type: K.q.type, page: 1 };
      K.est = { state: 'idle', data: null, error: '' };
      K.flagN = { all: null, pending: null };
      clearSel();
      K.verify = { state: 'idle', data: null, error: '' };
    }
    K.view.state = 'loading';
    K.view.error = '';
    const year = month.slice(0, 4);
    const jobs = [
      A.api('GET', `/periods/${month}`),
      K.year.key === year && !force ? Promise.resolve(null) : A.api('GET', `/periods?year=${year}`)
    ];
    try {
      const [view, list] = await Promise.all(jobs);
      if (month !== K.month) return;
      K.view = { state: 'ok', data: view, error: '' };
      if (list) K.year = { key: year, rows: list.periods || [] };
    } catch (e) {
      K.view = { state: 'fail', data: null, error: A.errText(e) };
      return;
    }
    const v = K.view.data;
    if (!(v.run && v.ai)) K.flagN = { all: null, pending: null };
    await Promise.all([loadSlips(), v.run && v.ai ? loadFlagCounts(month) : null]);
  }
  const reload = async () => {
    await load(true);
    A.render();
    A.refreshShell();
  };
  const payday = () => {
    const row = K.year.rows.find(r => r.month === K.month);
    return row ? row.paydayExpected : null;
  };

  /* ---------- lỗi: câu của máy chủ NGUYÊN VĂN (đã là chữ cho người dùng), kèm việc màn này đã làm và tên người liên quan ---------- */
  const dot = t => (/[.!?…:]$/.test(t) ? t : `${t}.`);
  function explain(e) {
    const d = (e && e.data) || {};
    const code = d.code || '';
    const names = list => {
      const items = (list || []).map(i => nameOf(i.username));
      return items.length
        ? ` Người liên quan: ${items.slice(0, ERR_LIST_SHOW).join(', ')}${items.length > ERR_LIST_SHOW ? ` và ${items.length - ERR_LIST_SHOW} người khác` : ''}.`
        : '';
    };
    const base = dot(A.errText(e));
    switch (code) {
      case 'PERIOD_STALE':
        return `${base} Màn hình đã tải lại: kiểm tra rồi làm lại.`;
      case 'PERIOD_STATE':
        return `${base}${STATUS_TXT[d.status] ? ` Kỳ đang ở bước: ${STATUS_TXT[d.status]}.` : ''}`;
      case 'PERIOD_NOT_READY':
        return `${base}${d.checklist ? ' Xem danh sách việc trong hộp.' : ''}${d.items ? names(d.items) : ''}`;
      case 'PAYSLIP_STALE':
        return `${base} Đã tải lại bảng: chọn lại rồi làm lại.`;
      case 'PAYSLIP_FLAGGED':
      case 'PAYSLIP_ERROR':
      case 'PAYSLIP_STATE':
        return `${base}${names(d.items)}`;
      case 'PAYSLIP_NEGATIVE_NET': {
        /* 409: câu máy chủ nêu tài khoản; thêm tên và số thực nhận của từng người */
        const items = Array.isArray(d.items) ? d.items : [];
        const shown = items.slice(0, ERR_LIST_SHOW).map(i => `${nameOf(i.username)} (${vnd(i.net)})`);
        const more = items.length > ERR_LIST_SHOW ? ` và ${items.length - ERR_LIST_SHOW} người khác` : '';
        return `${base}${shown.length ? ` Thực nhận: ${shown.join(', ')}${more}.` : ''}`;
      }
      default:
        return A.errText(e);
    }
  }
  /* Chạy một lần ghi: lỗi hiện trong hộp; gặp phiên bản cũ thì tải lại màn trước khi báo. opts như A.api (warnings: 'manual'...) */
  async function write(method, path, body, opts) {
    try {
      return await A.api(method, path, body, opts);
    } catch (e) {
      const code = e && e.data && e.data.code;
      if (code === 'PERIOD_STALE' || code === 'PAYSLIP_STALE') await reload();
      else if (code === 'PERIOD_NOT_READY' && e.data && e.data.checklist && K.view.data)
        K.view.data.checklist = e.data.checklist;
      throw Object.assign(new Error(explain(e)), { cause: e });
    }
  }

  /* ---------- vẽ ---------- */
  const view = () => K.view.data;
  const sumCounts = c => Object.values(c || {}).reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
  const totalOf = c => c.total ?? sumCounts(c);
  const noteBox = (kind, icon, html, cls = '') =>
    `<div class="note ${kind} ${cls}">${ic(icon, 16)}<span>${html}</span></div>`;
  /* Kiểu bảng: est = ước tính (chưa có lần tính), calc = bản nháp chờ AI, review = đang phê duyệt phiếu, final = số chính thức.
     Bước AI không là cửa: phiếu bản nháp phê duyệt được ngay khi có lần tính (máy chủ cảnh báo) */
  const approving = v => v.status === 'reviewed' || (v.status === 'calculated' && !!v.run);
  const modeOf = v => (!v.run ? 'est' : approving(v) ? 'review' : v.run.status === 'final' ? 'final' : 'calc');
  const lockedAction = (cap, act, label, icon, cls = 'pri', small = '') =>
    `<button class="btn ${cls}" type="button" ${can(cap) ? `data-act="${act}"` : `aria-disabled="true" title="Cần quyền ${esc(cap)}"`}>${ic(icon, 16)}${esc(label)}${small ? ` <small>${small}</small>` : ''}</button>`;
  /* In cả loạt: chỉ các phiếu đã phê duyệt của lần tính hiện hành (view-phieu.js → printApproved) */
  const printAllBtn = (v, cls) => {
    const n = (v.run && v.counts && v.counts.approved) || 0;
    return n
      ? `<button type="button" class="btn ${cls}" data-act="plprintall" data-m="${esc(K.month)}">${ic('printer', cls ? 14 : 16)}In ${nf(n)} phiếu</button>`
      : '';
  };
  /* Nút ở góc phải tiêu đề: "Cách tính lương", mở lại (nếu được) và bước kế tiếp của kỳ */
  function headerActs(v) {
    const cfg = `<button class="btn" type="button" data-act="nav" data-t="cai-dat" data-s="so-do">${ic('sliders', 16)}Cách tính lương</button>`;
    const st = v.status;
    const reopen = label =>
      reopenTargets(v).length
        ? `<button class="btn" type="button" data-act="kyreopen">${ic('unlock', 16)}${esc(label)}</button>`
        : '';
    if (st === 'open') return cfg + lockedAction('attendance.lock', 'kylock', 'Chốt công', 'lock', 'pri', '');
    // [nhãn nút mở lại, năng lực, hành động, nhãn bước kế tiếp, icon]; đã trả lương thì còn nút mở lại kỳ và nút in
    const calc = ['Mở lại công', 'payroll.calculate', 'kycalc', 'Tính lương', 'play'];
    const next = {
      attendance_locked: calc,
      calculated: v.run
        ? A.agentsEnabled()
          ? ['Mở lại công', 'payroll.calculate', 'kyai', 'Chạy AI kiểm tra', 'spark']
          : ['Mở lại công', 'payroll.approve', 'kyapprove', 'Phê duyệt kỳ lương', 'lock']
        : calc,
      reviewed: ['Mở lại', 'payroll.approve', 'kyapprove', 'Phê duyệt kỳ lương', 'lock'],
      approved: ['Mở lại kỳ', 'payroll.pay', 'kypay', 'Đánh dấu đã trả lương', 'check']
    }[st];
    // Phê duyệt kỳ được ngay khi có lần tính, chưa cần AI kiểm tra (máy chủ cảnh báo AI_NOT_RUN)
    const early =
      st === 'calculated' && v.run && A.agentsEnabled()
        ? lockedAction('payroll.approve', 'kyapprove', 'Phê duyệt kỳ lương', 'lock', '')
        : '';
    if (!next) return cfg + (st === 'paid' ? reopen('Mở lại kỳ') : '') + printAllBtn(v, '');
    return cfg + reopen(next[0]) + early + lockedAction(...next.slice(1));
  }
  /* Đầu trang Chấm công: "Chốt công", hoặc "Đã chốt công" kèm "Mở lại" (cùng bước với màn Bảng lương) */
  function congActs() {
    const v = K.month === S.month && K.view.state === 'ok' ? K.view.data : null;
    if (!v) return '';
    if (v.status === 'open') return lockedAction('attendance.lock', 'kylock', 'Chốt công', 'lock');
    const reopen = reopenTargets(v).length
      ? `<button class="btn" type="button" data-act="kyreopen">${ic('unlock', 18)}Mở lại</button>`
      : '';
    return `<span class="lockpill">${ic('lock', 11, 2.2)}Đã chốt công</span>${reopen}`;
  }

  function reopenTargets(v) {
    const all = [
      ['calculated', 'Đã tính lương (tính lại, phê duyệt lại)', 'period.reopen'],
      ['attendance_locked', 'Đã chốt công (tính lại từ đầu)', 'period.reopen.inputs'],
      ['open', 'Chưa tính lương (mở khoá dữ liệu đầu vào)', 'period.reopen.inputs']
    ];
    const r = rank(v.status);
    return all.filter(([to, , cap]) => rank(to) < r && can('period.reopen') && can(cap));
  }

  /* Tổng của cả kỳ do MÁY CHỦ cộng (totals); trước lần tính đầu là tổng của bảng ước tính. Giao diện không cộng gì. */
  const periodTotals = v => (v && v.totals) || (K.est.state === 'ok' && K.est.data && K.est.data.totals) || null;
  const periodKept = v =>
    (v && v.attendanceKept) || (K.est.state === 'ok' && K.est.data && K.est.data.attendanceKept) || null;

  /* Câu tóm tắt dưới tiêu đề: số phiếu theo trạng thái, đều là số đếm của máy chủ */
  function subLine(v) {
    const m = esc(mNum());
    const c = v.counts || {};
    const T = periodTotals(v);
    const b = n => `<b>${nf(n)} phiếu</b>`;
    const at = (k, pre, fmt = shortAt) =>
      v.stages && v.stages[k] && v.stages[k].at ? `${pre}${esc(fmt(v.stages[k].at))}` : '';
    const fp = K.flagN.pending;
    const pend = c.pending || 0;
    const opt = (on, text) => (on ? ` · ${text}` : '');
    const line = {
      open: () =>
        `Tháng ${m} chưa tính lương${T ? ` · ${b(T.people - (T.error || 0))} đã có số${T.error ? `, ${b(T.error)} chưa tính được` : ''}` : ''}`,
      attendance_locked: () =>
        `Đã chốt công tháng ${m}${at('attendanceLocked', ' lúc ')} · bước tiếp theo: tính lương ra bản nháp`,
      calculated: () =>
        v.run
          ? `Bản nháp lần tính ${esc(v.run.runNo)} · ${b(totalOf(c) - (c.error || 0))} có số${c.error ? `, ${b(c.error)} chưa tính được` : ''}${A.agentsEnabled() ? ' · chưa AI kiểm tra' : ''}${opt(c.approved, `${nf(c.approved)} phiếu đã phê duyệt`)}`
          : `Kỳ vừa mở lại · cần tính lương lại${A.agentsEnabled() ? ' trước khi chạy AI kiểm tra' : ''}`,
      reviewed: () =>
        `${c.approved ? `<b>${nf(c.approved)}/${nf(totalOf(c))} phiếu</b> đã phê duyệt${pend && fp === pend ? ` · còn ${nf(fp)} phiếu có cảnh báo AI chờ phê duyệt` : opt(pend, `${nf(pend)} phiếu chờ phê duyệt`)}` : `${b(pend)} chờ phê duyệt${opt(fp, `${nf(fp)} phiếu có cảnh báo AI`)}`}${opt(c.draft, `${nf(c.draft)} phiếu bản nháp (đã trả lại)`)}${opt(c.error && !(c.approved && pend && fp === pend), `${nf(c.error)} phiếu chưa tính được`)}`,
      approved: () =>
        `Đã phê duyệt kỳ lương${at('approved', ' lúc ')} · ${b(c.approved || 0)} chính thức${c.error ? `, ${nf(c.error)} phiếu loại khỏi kỳ` : ''}`,
      paid: () => `Đã trả lương${at('paid', ' ngày ', fmtAt)}`
    }[v.status];
    return `${line ? line() : ''}${opt(v.reopenCount, `đã mở lại ${nf(v.reopenCount)} lần`)}`;
  }

  /* Ghi chú dưới tiêu đề: tháng ngoài kỳ quản lý, cần tính lại, đã khoá công, đã khoá số, đã trả lương */
  function topNotes(v) {
    const st = v.stages || {};
    const at = k => (st[k] && st[k].at ? esc(A.fmtStamp(st[k].at)) : '');
    const top = (kind, icon, html) => noteBox(kind, icon, html, 'bl-top');
    const runNo = v.run ? ` ${v.run.runNo}` : '';
    const reasons = (v.stale === true && A.Khung ? A.Khung.staleNote(v.staleReasons) : []).map(
      r => r.charAt(0).toLowerCase() + r.slice(1) + (/lần tính$/.test(r) ? runNo : '')
    );
    return `${v.needsRecalculate ? top('warn', 'alert', `Kỳ vừa được mở lại về "Đã tính lương": lần tính cũ đã bị thay thế. Phải <b>Tính lương</b> lại trước khi ${A.agentsEnabled() ? 'chạy AI kiểm tra hay ' : ''}phê duyệt phiếu.`) : ''}
${v.stale === true ? top('warn', 'alert', `<b>Cần tính lại:</b> ${reasons.length ? reasons.map(esc).join('; ') : 'dữ liệu đã đổi sau lần tính lương gần nhất'}, số trên bảng có thể chưa khớp.`) : ''}
${v.status === 'attendance_locked' ? top('ok', 'lock', `Bảng công tháng ${esc(mNum())} đã chốt${at('attendanceLocked') ? ` lúc ${at('attendanceLocked')}` : ''}. Số dưới đây còn đổi cho tới khi bấm <b>Tính lương</b>.`) : ''}
${v.status === 'approved' ? top('ok', 'lock', `Đây là số chính thức của lần tính${esc(runNo)}${at('approved') ? `, đã chốt lúc ${at('approved')}` : ''}. Vẫn sửa được dữ liệu và số phiếu, nhưng số đã chốt chỉ đổi khi mở lại kỳ và tính lại.`) : ''}
${v.status === 'paid' ? top('', 'lock', 'Kỳ đã trả lương. Vẫn mở lại được, nhưng tiền đã chuyển không rút lại; điều chỉnh thường làm ở kỳ sau (truy thu hoặc truy lĩnh).') : ''}`;
  }

  /* Dải công thức một hàng: Quỹ lương − Bảo hiểm − Thuế TNCN − Tạm ứng = Thực nhận, đều là `totals` của máy chủ (không cộng trừ ở đây) */
  function formulaStrip(v) {
    const T = periodTotals(v);
    const c = v.counts || {};
    const final = !!(v.run && v.run.status === 'final');
    const big = final ? '' : 'est'; // số ước tính: màu nâu, gạch chân nét đứt
    const sm = final ? '' : 'bl-e';
    const people = !T
      ? null
      : !v.run
        ? T.people - (T.error || 0)
        : final
          ? c.approved || 0
          : totalOf(c) - (c.error || 0);
    const paidAt = v.stages && v.stages.paid && v.stages.paid.at;
    const lock = final ? `<span class="bl-lockp">${ic('lock', 11, 2.2)}Đã chốt số</span>` : '';
    const cell = (label, x, cls, note, lead) =>
      `<div${lead ? ' class="lead"' : ''}><div class="l">${label}</div><div class="v ${T ? cls : ''}">${T ? `${esc(amt(x))}<span class="unit">₫</span>` : '—'}</div><div class="n">${note}</div></div>`;
    const op = s => `<div class="op" aria-hidden="true">${s}</div>`;
    return `<section class="bl-formula" aria-label="Thực nhận bằng quỹ lương trừ bảo hiểm, thuế TNCN và tạm ứng">
${cell(`Quỹ lương${lock}`, T && T.gross, big, T ? `Tổng thu nhập của ${nf(people)} phiếu ${final ? 'chính thức' : 'có số'}` : 'Chưa có số từ máy chủ')}${op('−')}
${cell('Bảo hiểm', T && T.insurance, sm, 'Phần nhân viên đóng')}${op('−')}
${cell('Thuế TNCN', T && T.tax, sm, 'Thuế thu nhập cá nhân')}${op('−')}
${cell('Tạm ứng', T && T.advance, sm, 'Khoản đã ứng trước')}${op('=')}
${cell('Thực nhận', T && T.net, big, paidAt ? `Đã chuyển ngày ${esc(dmOf(paidAt))}` : '', true)}</section>`;
  }

  /* Cột của "Xem đủ cột": [khoá của phiếu, nhãn, kiểu]. truTreSom (đi muộn, về sớm) ĐÃ nằm trong tiền ngày công: chỉ ghi chú dưới ô. */
  const LINE_COLS = [
    ['tienNgayCong', 'Tiền ngày công', 'money'],
    ['phuCap', 'Phụ cấp', 'money'],
    ['ot', 'OT', 'money'],
    ['kpi', 'Lương KPI', 'money'],
    ['khac', 'Khác', 'money']
  ];
  /* Khoản cộng/trừ thêm đã phê duyệt: hai cột chỉ hiện khi có phiếu mang khoản (khoanThem đã nằm trong tổng thu nhập, khoanTru trừ sau thuế) */
  const ENTRY_COLS = [
    ['khoanThem', 'Khoản cộng thêm', 'money'],
    ['khoanTru', 'Khoản trừ thêm', 'tru']
  ];
  const lineCols = () => {
    const rows = ((K.slips.data || K.est.data || {}).rows || []).filter(Boolean);
    return rows.some(r => r.khoanThem !== undefined) ? [...LINE_COLS, ...ENTRY_COLS] : LINE_COLS;
  };
  const daysTxt = x =>
    Number.isFinite(Number(x)) ? Number(x).toLocaleString('vi-VN', { maximumFractionDigits: 2 }) : '—';
  /* Ô tiền: 0 màu xám, số ước tính màu nâu (cls), thiếu số thì "—" */
  const moneyTd = (x, label, cls, extra = '') => {
    const n = Number(x);
    if (x === null || x === undefined || !Number.isFinite(n))
      return `<td data-label="${esc(label)}" class="n">—${extra}</td>`;
    return `<td data-label="${esc(label)}" class="n ${n === 0 ? 'bl-z' : cls}">${n === 0 ? '0' : esc(amt(n))}${extra}</td>`;
  };
  function lineCell(r, [key, label, kind], cls) {
    const x = r[key];
    const sub = (t, tip) => `<div class="bl-sub"${tip ? ` title="${esc(`${t} ₫ ${tip}`)}"` : ''}>${esc(t)}</div>`;
    let extra = '';
    if (key === 'tienNgayCong' && Number(r.truTreSom) > 0) extra = sub(`đã trừ ${amt(r.truTreSom)}`, 'đi muộn, về sớm');
    if (key === 'phuCap' && typeof r.attendOk === 'boolean')
      extra = sub(r.attendOk ? 'Giữ chuyên cần' : 'Mất chuyên cần');
    if (kind === 'tru' && Number(x) > 0) return `<td data-label="${esc(label)}" class="n ${cls}">−${esc(amt(x))}</td>`;
    return moneyTd(x, label, cls, extra);
  }
  /* Cột "Ngày công" (đã làm / chuẩn): chỉ hiện khi máy chủ gửi daysWorked cho ít nhất một dòng; thiếu thì ẩn cả cột */
  const hasDays = d => !!d && d.rows.some(r => r.daysWorked != null && Number.isFinite(Number(r.daysWorked)));
  const rowOf = u => ((K.slips.data && K.slips.data.rows) || []).find(r => r.username === u) || null;
  const subOf = r =>
    [A.TYPE_SHORT[r.type] || r.type, r.level != null && r.type ? A.levelText(r.type, r.level, K.month) : '']
      .filter(Boolean)
      .map(esc)
      .join(' · ');
  /* Phiếu Admin đã sửa số: dòng hiện số ĐÃ TRẢ của máy chủ; số máy tính gốc (computed) chỉ nằm trong chú thích, không cộng lại */
  const overTag = r => {
    return '';
  };
  function headCells(mode, d) {
    const cols = K.full ? lineCols() : [];
    return [
      mode === 'review' ? '<th class="bl-cbc"><span class="sr">Chọn</span></th>' : '',
      '<th>Nhân sự</th>',
      hasDays(d) ? '<th class="n">Ngày công</th>' : '',
      ...cols.map(([, label]) => `<th class="n">${esc(label)}</th>`),
      '<th class="n">Tổng thu nhập</th><th class="n">Bảo hiểm</th><th class="n">Thuế TNCN</th><th class="n">Tạm ứng</th><th class="n">Thực nhận</th>',
      mode === 'review' || mode === 'final' ? '<th>Cảnh báo AI</th>' : '',
      mode === 'review' ? '<th>Trạng thái</th>' : '',
      mode === 'est' && !K.full ? '<th class="bl-chev"><span class="sr">Mở phiếu</span></th>' : ''
    ].filter(Boolean);
  }
  function slipRows(v, d, mode) {
    const review = mode === 'review';
    const final = mode === 'final';
    const approveCap = review && can('payroll.approve');
    const days = hasDays(d);
    const cols = K.full ? lineCols() : [];
    const span = (days ? 1 : 0) + cols.length + 5;
    const ec = final ? '' : 'bl-e';
    const chev = mode === 'est' && !K.full ? `<td class="bl-chev" aria-hidden="true">${ic('chevr', 16)}</td>` : '';
    return d.rows
      .map(r => {
        const who = r.name || nameOf(r.username);
        const u = esc(r.username);
        const flagged = (r.flags || []).length > 0;
        const whoTd = `<td class="who"><div class="bl-who">${A.avatar(who)}<div class="col" style="min-width:0"><span class="t">${esc(who)}</span><span class="s">${subOf(r)}${overTag(r)}</span></div></div><button type="button" class="sr" data-act="kyslip" data-u="${u}">Mở phiếu của ${esc(who)}</button></td>`;
        // Ô chọn: mọi phiếu chưa phê duyệt (chờ phê duyệt hoặc bản nháp, có cảnh báo AI hay không) đều chọn được vào lô
        let cb = '';
        if (review) {
          if (['pending', 'draft'].includes(r.status) && approveCap)
            cb = `<input type="checkbox" data-act="kysel" data-u="${u}" ${K.sel.has(r.username) ? 'checked' : ''} aria-label="Chọn phiếu của ${esc(who)}">`;
          cb = `<td class="bl-cbc">${cb}</td>`;
        }
        if (r.status === 'error') {
          const fix = ERR_FIX[r.errorCode];
          const link = final
            ? `<button type="button" class="link" data-act="nav" data-t="cai-dat" data-s="nhat-ky"${r.note ? ` title="${esc(`Lý do: ${r.note}`)}"` : ''}>Lý do trong nhật ký</button>`
            : fix === 'profile'
              ? `<button type="button" class="link" data-act="hsopen" data-u="${u}">Sửa hồ sơ</button>`
              : fix === 'formula'
                ? '<button type="button" class="link" data-act="nav" data-t="cai-dat" data-s="so-do">Mở Cách tính lương</button>'
                : '';
          const pill = final ? A.pill('draft', 'Loại khỏi kỳ') : review ? '' : A.pill('rejected', 'Chưa tính được');
          return `<tr class="click bl-err" data-act="kyslip" data-u="${u}">${cb}${whoTd}<td colspan="${span}" data-label="${final ? 'Loại khỏi kỳ' : 'Chưa tính được'}"><div class="bl-errmsg">${pill}<span class="m">${esc(r.errorDetail || 'Bộ máy không tính được phiếu này.')}</span>${link}</div></td>${review || final ? '<td></td>' : ''}${review ? `<td data-label="Trạng thái">${A.pill('rejected', 'Chưa tính được')}</td>` : ''}${chev}</tr>`;
        }
        const daysTd = days
          ? `<td data-label="Ngày công" class="n">${r.daysWorked == null ? '—' : `${esc(daysTxt(r.daysWorked))}${r.workdaysStd != null && Number.isFinite(Number(r.workdaysStd)) ? '/' + esc(daysTxt(r.workdaysStd)) : ''}`}</td>`
          : '';
        const ai =
          review || final
            ? `<td data-label="Cảnh báo AI">${flagged ? `<button type="button" class="bl-aic" data-act="kyslip" data-u="${u}" aria-label="Xem lý do AI cảnh báo phiếu của ${esc(who)}">${ic('spark', 13, 2)}${nf(r.flags.length)} cảnh báo</button>` : ''}</td>`
            : '';
        const [tone, txt] = SLIP_PILL[r.status] || ['draft', r.status];
        const warn = review && flagged && r.status !== 'approved';
        return `<tr class="click${warn ? ' bl-warn' : ''}" data-act="kyslip" data-u="${u}">${cb}${whoTd}${daysTd}${cols.map(c => lineCell(r, c, ec)).join('')}
${moneyTd(r.gross, 'Tổng thu nhập', ec + (K.full ? ' bl-b' : ''))}${moneyTd(r.insurance, 'Bảo hiểm', ec)}${moneyTd(r.tax, 'Thuế TNCN', ec)}${moneyTd(r.advance, 'Tạm ứng', ec)}${moneyTd(r.net, 'Thực nhận', ec + ' bl-b')}
${ai}${review ? `<td data-label="Trạng thái">${A.pill(tone, txt)}</td>` : ''}${chev}</tr>`;
      })
      .join('');
  }
  /* Chip lọc theo kiểu bảng; số đếm là `counts`/`totals` của máy chủ. Ước tính: thêm chip theo chức vụ (danh sách chức vụ của tháng). */
  function chipsHtml(v, mode) {
    const q = K.q;
    const chip = (on, val, label, n) => A.chip(on, 'kyfilter', `data-v="${esc(val)}"`, label, n);
    const st = k => !q.flag && q.status === k;
    if (mode === 'est') {
      const T = periodTotals(v);
      const types = A.positions.list(K.month).filter(p => !p.deprecated);
      const off = K.typeOk ? '' : 'aria-disabled="true" title="Máy chủ chưa lọc theo loại nhân sự"';
      return [
        chip(!q.status && !q.type, '', 'Tất cả', T ? T.people : null),
        (T && T.error) || q.status === 'error'
          ? chip(q.status === 'error', 'error', 'Chưa tính được', T ? T.error : null)
          : '',
        ...types.map(
          p =>
            `<button type="button" class="chip ${q.type === p.code ? 'on' : ''}" data-act="kytypef" data-v="${esc(p.code)}" aria-pressed="${q.type === p.code}" ${off}>${esc(p.label)}</button>`
        )
      ].join('');
    }
    const c = v.counts || {};
    const flagChip = n =>
      `<button type="button" class="chip ${q.flag === '1' ? 'on' : ''}" data-act="kyfilter" data-v="flag" aria-pressed="${q.flag === '1'}">Có cảnh báo AI${n != null ? ` <span class="n">${nf(n)}</span>` : ''}</button>`;
    const errChip = label => (c.error || q.status === 'error' ? chip(st('error'), 'error', label, c.error || 0) : '');
    const list = [chip(st(''), '', 'Tất cả', totalOf(c))];
    if (mode === 'calc') list.push(chip(st('draft'), 'draft', 'Bản nháp', c.draft || 0), errChip('Chưa tính được'));
    else if (mode === 'review') {
      list.push(chip(st('pending'), 'pending', 'Chờ phê duyệt', c.pending || 0));
      if (v.ai) list.push(flagChip(K.flagN.all));
      if (c.draft || q.status === 'draft') list.push(chip(st('draft'), 'draft', 'Bản nháp', c.draft || 0));
      list.push(errChip('Chưa tính được'), chip(st('approved'), 'approved', 'Đã phê duyệt', c.approved || 0));
    } else {
      list.push(chip(st('approved'), 'approved', 'Đã phê duyệt', c.approved || 0), errChip('Loại khỏi kỳ'));
      if (v.ai) list.push(flagChip(null));
    }
    return list.join('');
  }
  /* Khung AI trong thẻ bảng: kết quả lần chạy AI của lần tính hiện hành (số đếm của máy chủ) và các việc đi kèm */
  function aiBanner(v, mode) {
    if (mode === 'est' || !A.agentsEnabled()) return '';
    const a = v.ai;
    const sev = a && a.summary && a.summary.bySeverity;
    const head = a
      ? `<b>AI kiểm tra lần tính ${esc(v.run.runNo)}: ${nf(a.findingsTotal ?? 0)} cảnh báo</b>${sev ? ` · ${nf(sev.high || 0)} cao, ${nf(sev.medium || 0)} trung bình, ${nf(sev.low || 0)} thấp.` : '.'}`
      : '';
    const b = (act, label) => `<button class="btn sm" type="button" data-act="${act}">${label}</button>`;
    const see = '<button class="btn sm" type="button" data-act="nav" data-t="tro-ly">Xem các cảnh báo</button>';
    const dismiss =
      A.Dismiss.status() === 'no'
        ? `<button class="btn sm" type="button" aria-disabled="true" title="Máy chủ chưa có chức năng bỏ qua">Bỏ qua có lý do ${A.soonTag()}</button>`
        : b('kyflags', 'Bỏ qua có lý do');
    const calc = can('payroll.calculate');
    // cảnh báo AI chỉ để xem lại, không chặn phê duyệt
    let text;
    let btns;
    if (mode === 'final') {
      if (!a) return '';
      text = head;
      btns = [see];
    } else if (!a) {
      text = 'AI chưa kiểm tra lần tính này. Vẫn phê duyệt được; chạy AI kiểm tra để soát bất thường trước.';
      btns = [calc ? b('kycalc', 'Tính lại lương') : '', dismiss];
    } else {
      text = `${head} Phiếu có cảnh báo vẫn phê duyệt được, kể cả cả lô; cảnh báo chỉ để xem lại.`;
      btns = [
        see,
        calc && v.status === 'reviewed' ? b('kyai', 'Chạy lại AI') : '',
        calc ? b('kycalc', 'Tính lại lương') : '',
        dismiss
      ];
    }
    return `<div class="bl-bnr bl-ai"><span class="bl-tag">${ic('spark', 11, 2)}AI</span><span class="t">${text}</span><span class="bs">${btns.join('')}</span></div>`;
  }
  /* Thanh chọn phiếu (đang phê duyệt): phiếu có cảnh báo AI và bản nháp cũng vào lô */
  function selBar(mode) {
    if (mode !== 'review' || !can('payroll.approve')) return '';
    const d = K.slips.data;
    const n = K.sel.size;
    const gather = (act, label) =>
      `<button class="btn sm" type="button" data-act="${act}" ${K.selBusy ? 'disabled' : ''}>${K.selBusy ? 'Đang gom phiếu…' : label}</button>`;
    if (!n)
      return `<div class="bl-bnr bl-selb"><span class="t">Chọn phiếu để phê duyệt hoặc trả lại. Phiếu có cảnh báo AI vẫn chọn được; cảnh báo chỉ để xem lại.</span><span class="bs">${gather('kyselall', 'Chọn mọi phiếu chưa phê duyệt')}${gather('kyselclean', 'Chọn mọi phiếu không có cảnh báo')}<button class="btn sm off" type="button" disabled>Trả lại</button><button class="btn sm off" type="button" disabled>Phê duyệt phiếu</button></span></div>`;
    const onPage = d ? d.rows.filter(r => K.sel.has(r.username)).length : 0;
    return `<div class="bl-bnr bl-selb"><span class="t"><b>Đã chọn ${nf(n)} phiếu</b>${n > onPage ? ` · ${nf(onPage)} phiếu ở trang này, ${nf(n - onPage)} ở các trang khác` : ''}</span><span class="bs"><button class="btn sm ghost" type="button" data-act="kyselnone">Bỏ chọn</button><button class="btn sm" type="button" data-act="kybatch" data-a="return">Trả lại</button><button class="btn sm pri" type="button" data-act="kybatch" data-a="approve">${ic('check', 14)}Phê duyệt ${nf(n)} phiếu</button></span></div>`;
  }
  function capOf(v, mode) {
    const est = '<span class="bl-cap-est">Số màu nâu</span> là số chưa phê duyệt kỳ';
    const runNo = v.run ? esc(v.run.runNo) : '';
    const base =
      mode === 'est'
        ? v.status === 'open' && !K.full
          ? `${est}, thành số chính thức sau khi phê duyệt kỳ lương`
          : est
        : mode === 'calc'
          ? `Bản nháp lần tính ${runNo}${K.full ? '' : ' · số chưa phải lương chính thức cho tới khi phê duyệt kỳ lương'}`
          : mode === 'review'
            ? `Bản nháp lần tính ${runNo}`
            : v.status === 'paid'
              ? 'Số chính thức · đã trả lương'
              : 'Số chính thức';
    return K.full ? `${base} · Tiền ngày công đã gồm nghỉ lễ hưởng lương và đã trừ đi muộn, về sớm` : base;
  }
  function slipsCard(v) {
    const mode = modeOf(v);
    const est = mode === 'est';
    const st = est ? K.est : K.slips;
    const d = st.data;
    const title = `<h2>Bảng lương tháng ${esc(mNum())}${K.full ? ' · đủ cột' : ''}</h2>`;
    if (est && st.state === 'na')
      return `<section class="card flush bl-card" aria-label="Bảng lương"><div class="card-h">${title}</div>${A.empty('Chưa có bảng lương của kỳ này', 'Bảng lương có sau khi chốt công và tính lương.')}</section>`;
    const types = A.positions.list(K.month).filter(p => !p.deprecated);
    const typeSel = est
      ? ''
      : `<span class="end"><label class="sr" for="ky-type">Loại nhân sự</label><select id="ky-type" class="input bl-sel" data-input="kytype" ${K.typeOk ? '' : 'disabled title="Máy chủ chưa lọc theo loại nhân sự"'}><option value="">Mọi loại nhân sự</option>${types
          .map(p => `<option value="${esc(p.code)}" ${K.q.type === p.code ? 'selected' : ''}>${esc(p.label)}</option>`)
          .join('')}</select></span>`;
    const tools = `<div class="bl-tools"><div class="chips" role="group" aria-label="Lọc phiếu">${chipsHtml(v, mode)}</div><div class="bl-tools-r"><div class="field bl-search"><label class="sr" for="ky-q">Tìm nhân sự</label>${ic('search', 14)}<input id="ky-q" class="input" type="search" placeholder="Tìm nhân sự" value="${esc(K.q.q)}" data-input="kyq"></div>
<button type="button" class="btn sm ${K.full ? 'bl-on' : ''}" data-act="kyfull" aria-pressed="${K.full}">${K.full ? 'Thu gọn cột' : 'Xem đủ cột'}</button>${v.status === 'paid' ? '' : printAllBtn(v, 'sm')}</div></div>`;
    const heads = headCells(mode, d);
    let body;
    if (st.state === 'loading' && !d) body = A.skelRows(heads.length, 6);
    else if (st.state === 'fail') body = `<tr><td colspan="${heads.length}">${A.errorBox(st.error)}</td></tr>`;
    else if (!d || !d.rows.length)
      body = `<tr><td colspan="${heads.length}">${A.empty('Không có phiếu nào khớp bộ lọc', 'Đổi trạng thái, loại nhân sự hoặc từ khoá tìm kiếm.')}</td></tr>`;
    else body = slipRows(v, d, mode);
    const pages = d ? Math.max(1, Math.ceil(d.total / d.pageSize)) : 1;
    const from = d && d.total ? (d.page - 1) * d.pageSize + 1 : 0;
    const pg = d
      ? `<div class="card-f"><span>${d.total ? `${nf(from)}–${nf(Math.min(d.total, d.page * d.pageSize))} trên ${nf(d.total)} phiếu` : '0 phiếu'}${st.state === 'loading' ? ' · đang tải…' : ''}</span><div class="bl-pg"><span>Trang ${nf(d.page)}/${nf(pages)}</span><button type="button" class="btn sm icon" data-act="kypage" data-p="${d.page - 1}" ${d.page <= 1 ? 'disabled' : ''} aria-label="Trang trước">${ic('chevl', 16)}</button><button type="button" class="btn sm icon" data-act="kypage" data-p="${d.page + 1}" ${d.page >= pages ? 'disabled' : ''} aria-label="Trang sau">${ic('chevr', 16)}</button></div></div>`
      : '';
    return `<section class="card flush bl-card" aria-label="Bảng lương"><div class="card-h">${title}<span class="cap">${capOf(v, mode)}</span>${typeSel}</div>
${tools}${aiBanner(v, mode)}${selBar(mode)}
<div class="tblwrap"><table class="rtable bl-tbl${K.full ? ' bl-wide' : ''}"><thead><tr>${heads.join('')}</tr></thead><tbody>${body}</tbody></table></div>${pg}</section>`;
  }

  function verifyCard(v) {
    if (!v.run || !can('audit.read')) return '';
    const r = K.verify;
    let body = '';
    if (r.state === 'loading') body = '<div class="skel" style="width:50%"></div>';
    else if (r.state === 'fail') body = A.errorBox(r.error, false);
    else if (r.state === 'ok') {
      const d = r.data;
      body = d.mismatched.length
        ? `<div class="warn" role="alert">${ic('alert', 16)}<span>Đã kiểm <b>${nf(d.checked)}</b> phiếu, <b>${nf(d.mismatched.length)}</b> phiếu lệch bản chụp: ${esc(d.mismatched.slice(0, ERR_LIST_SHOW).map(nameOf).join(', '))}${d.mismatched.length > ERR_LIST_SHOW ? ` và ${d.mismatched.length - ERR_LIST_SHOW} người khác` : ''}.</span></div>`
        : `<div class="ok" role="status">${ic('check', 16)}<span>Đã kiểm <b>${nf(d.checked)}</b> phiếu, không phiếu nào lệch bản chụp.${d.engineChanged ? ' Lưu ý: cách tính lương của ứng dụng đã được cập nhật sau lần tính này.' : ''}</span></div>`;
    }
    return `<section class="card flush bl-verify"><div class="card-h"><h2>Kiểm lại bản chụp</h2><span class="cap">Tính lại từng phiếu từ dữ liệu hiện có theo đúng hồ sơ và cài đặt lúc tính; phiếu lệch nghĩa là dữ liệu đã bị sửa ngoài ứng dụng hoặc cách tính đã đổi.</span><span class="end"><button class="btn sm" type="button" data-act="kyverify" ${r.state === 'loading' ? 'disabled' : ''}>Kiểm lại bản chụp</button></span></div>${body ? `<div class="bl-pad">${body}</div>` : ''}</section>`;
  }

  function render() {
    const sub = `Kỳ lương tháng ${esc(mFull())}`;
    if (K.view.state === 'idle' || (K.view.state === 'loading' && !K.view.data))
      return `${A.header('Bảng lương', sub)}<section class="card"><div class="skel" style="width:60%"></div><div class="skel" style="width:80%"></div></section>`;
    if (K.view.state === 'fail')
      return `${A.header('Bảng lương', sub)}<section class="card">${A.errorBox(K.view.error)}</section>`;
    const v = view();
    return `${A.header('Bảng lương', subLine(v), headerActs(v)).replace('class="hdr"', 'class="hdr bl-hdr"')}${topNotes(v)}${K.full ? '' : formulaStrip(v)}${slipsCard(v)}${A.Entries ? A.Entries.card() : ''}${verifyCard(v)}`;
  }

  /* ---------- hộp xác nhận cho từng bước ghi ---------- */
  const rev = () => view().rev;
  // Cảnh báo của bước (chế độ 'warn') do hộp tự hiện (warnResult), không hiện thêm thông báo góc
  const post = (step, body) =>
    write('POST', `/periods/${K.month}/${step}`, { rev: rev(), ...(body || {}) }, { warnings: 'manual' });
  const btnIcon = (api, name) => {
    const b = api.root.querySelector('[data-dlg-btn="1"]');
    if (b && name) b.insertAdjacentHTML('afterbegin', ic(name, 16));
  };
  /* Phản hồi thành công có cảnh báo: câu máy chủ NGUYÊN VĂN ngay trong hộp, nút chân hộp thành "Đóng"; mục 'danger'
     (thực lĩnh âm, phiếu lỗi bị loại) còn lên băng cố định của trang (A.showWarnings) để không mất khi đóng hộp. Không có cảnh báo: false. */
  function warnResult(dlg, res, lead = 'Đã lưu') {
    const seen = new Set();
    const list = (res && Array.isArray(res.warnings) ? res.warnings : []).filter(
      w => w && w.message && !seen.has(`${w.code}|${w.message}`) && seen.add(`${w.code}|${w.message}`)
    );
    if (!list.length) return false;
    const danger = list.filter(w => w.severity === 'danger');
    if (danger.length) A.showWarnings(danger);
    const body = dlg.root.querySelector('#dlg-body');
    const foot = dlg.root.querySelector('.mf');
    if (!body || !dlg.root.isConnected) return true;
    body.innerHTML = `<p class="bl-p">${esc(lead)}, kèm ${nf(list.length)} cảnh báo:</p><div class="col bl-wres">${list.map(w => noteBox(w.severity === 'danger' ? 'err' : 'warn', 'alert', esc(w.message))).join('')}</div>`;
    if (foot) foot.innerHTML = '<button type="button" class="btn pri" data-dlg-close>Đóng</button>';
    return true;
  }
  /* Hộp một bước: nút chính có icon; onClick chạy bước (trả phản hồi, false = dừng), tải lại kỳ rồi đóng, hoặc hiện cảnh báo trong hộp */
  const stepDialog = ({ title, sub, body, label, icon, cls = 'pri', disabled, run, lead }) => {
    const api = A.openDialog({
      title,
      sub,
      body,
      foot: [
        { label: 'Huỷ' },
        {
          label,
          cls,
          disabled,
          onClick: async dlg => {
            const res = await run(dlg);
            if (res !== false) await done(dlg, res, lead);
          }
        }
      ]
    });
    btnIcon(api, icon);
    return api;
  };
  const done = async (dlg, res, lead) => {
    await reload();
    if (!warnResult(dlg, res, lead)) dlg.close();
  };
  /* Một dòng của danh sách việc trong hộp: số (nhãn màu theo mức), việc, phần bên phải */
  const chkRow = (kind, n, label, right = '') =>
    `<div class="bl-chk"><span class="pill p-${kind}">${n == null ? ic('alert', 12, 2) : esc(nf(n))}</span><span>${label}</span><span class="bl-chk-r">${right}</span></div>`;
  const areaField = (id, label, small, ph = 'Ghi rõ lý do để lưu vào nhật ký') =>
    `<div class="formrow bl-fld"><label class="lbl" for="${id}">${esc(label)}${small ? ` <small>${esc(small)}</small>` : ''}</label><textarea id="${id}" class="input" maxlength="300" placeholder="${esc(ph)}"></textarea></div>`;
  /* Ô lý do ghi "(không bắt buộc)" (A.reasonLabel) bằng chữ nhỏ */
  const reasonArea = (id, label, ph) => {
    const full = A.reasonLabel(label);
    const at = full.lastIndexOf(' (');
    return areaField(id, full.slice(0, at), full.slice(at + 1), ph);
  };
  // Nhãn một mục danh sách kiểm: câu của máy chủ hoặc nhãn ngắn theo mã
  const itemText = i => esc(i.message || checkText(i));

  A.actions.kygo = el => {
    A.closeDialog();
    A.go(el.dataset.t);
    if (el.dataset.s === 'pay-entries')
      setTimeout(() => {
        const c = document.getElementById('en-card');
        if (c) c.scrollIntoView({ block: 'start' });
      }, 0);
  };
  /* Chốt công: mọi mục của danh sách kiểm chỉ để biết, nút Chốt công luôn bật; máy chủ chốt rồi trả cảnh báo từng mục. */
  A.actions.kylock = () => {
    const warns = view().checklist || [];
    const go = i =>
      CHECK_LINK[i.link]
        ? `<button class="link" type="button" data-act="kygo" data-t="${esc(CHECK_LINK[i.link])}" data-s="${esc(i.link)}" aria-label="Xem: ${esc(checkText(i))}">Xem</button>`
        : '';
    const rows = warns.map(i => chkRow('pending', i.count, itemText(i), go(i))).join('');
    const status = warns.length
      ? noteBox('warn', 'alert', 'Các mục trên chỉ để biết: chốt công vẫn được, hệ quả cho tiền lương ghi ở từng dòng.')
      : noteBox('ok', 'check', 'Không còn việc nào chặn. Có thể chốt công.');
    stepDialog({
      title: `Chốt công tháng ${mFull()}`,
      sub: warns.length ? `Còn ${nf(warns.length)} việc chưa xử lý` : 'Không còn việc nào chưa xử lý',
      body: `<p class="bl-p">Chốt công đánh dấu bảng công tháng ${esc(mNum())} để tính lương. Sau khi chốt vẫn sửa được dữ liệu (có cảnh báo); muốn số mới thì tính lại lương.</p>${rows ? `<div class="bl-chks">${rows}</div>` : ''}${status}`,
      label: 'Chốt công',
      icon: 'lock',
      lead: 'Đã chốt công',
      run: () => post('lock-attendance', {})
    });
  };
  A.actions.kycalc = () => {
    const v = view();
    const first = v.status === 'attendance_locked' || !v.run;
    const at = v.stages && v.stages.attendanceLocked && v.stages.attendanceLocked.at;
    stepDialog({
      title: `${first ? 'Tính lương' : 'Tính lại lương'} tháng ${mFull()}`,
      sub: first
        ? `Từ bảng công đã chốt${at ? ` lúc ${shortAt(at)}` : ''}`
        : `Bản nháp lần tính ${v.run.runNo} sẽ chuyển sang "Đã thay thế"`,
      body: `${noteBox('warn', 'alert', `Mỗi lần tính tạo một bản mới; bản trước được giữ lại với trạng thái <b>Đã thay thế</b>, không bị xoá. Số trên bảng là <b>bản nháp</b> cho tới khi phê duyệt kỳ. Tính lại sẽ xoá kết quả AI kiểm tra của lần tính cũ.`)}`,
      label: 'Tính lương',
      icon: 'play',
      lead: 'Đã tính lương',
      run: () => post('calculate')
    });
  };
  A.actions.kyai = () => {
    const v = view();
    const ai = A.ai && A.ai.state === 'ok' && A.ai.month === K.month ? A.ai.data : null;
    const rules = ai && ai.checked && Number.isFinite(ai.checked.rules) ? ai.checked.rules : null; // số quy tắc AI của máy chủ
    stepDialog({
      title: v.status === 'reviewed' ? 'Chạy lại AI kiểm tra' : 'Chạy AI kiểm tra',
      sub: `Bản nháp lần tính ${v.run ? v.run.runNo : ''} · ${nf(totalOf(v.counts || {}))} phiếu`,
      body: `${noteBox('gold', 'spark', `AI kiểm tra${rules != null ? ` theo ${nf(rules)} quy tắc` : ''} trên dữ liệu của kỳ và gắn cảnh báo vào từng phiếu. AI chỉ gợi ý, không sửa số. Xong bước này phiếu chuyển sang <b>Chờ phê duyệt</b>.`)}`,
      label: 'Chạy AI kiểm tra',
      icon: 'spark',
      lead: 'AI kiểm tra xong',
      run: async () => {
        const res = await post('ai-review');
        A.toast(`AI kiểm tra xong: ${nf(res.findings)} cảnh báo`);
        return res;
      }
    });
  };
  A.actions.kypay = () => {
    const v = view();
    const T = periodTotals(v);
    stepDialog({
      title: 'Đánh dấu đã trả lương',
      sub: `Kỳ lương tháng ${mFull()} · ${nf((v.counts && v.counts.approved) || 0)} phiếu${T ? ` · thực nhận ${vnd(T.net)}` : ''}`,
      body: `${noteBox('warn', 'alert', 'Sau khi đánh dấu đã trả lương, kỳ vẫn mở lại được (có cảnh báo) nhưng tiền đã chuyển không rút lại. Điều chỉnh về sau thường đi theo kỳ tiếp theo.')}<div class="formgrid"><div class="formrow bl-fld"><label class="lbl" for="ky-paid-at">Ngày trả lương</label><input id="ky-paid-at" class="input" type="date" value="${esc(A.vnToday())}"></div><div class="formrow bl-fld"><label class="lbl" for="ky-paid-ref">Mã tham chiếu <small>(tuỳ chọn)</small></label><input id="ky-paid-ref" class="input" maxlength="100" placeholder="Số lệnh chi hoặc ghi chú ngắn"></div></div>`,
      label: 'Đánh dấu đã trả lương',
      icon: 'check',
      lead: 'Đã đánh dấu đã trả lương',
      run: async api => {
        const paidAt = api.root.querySelector('#ky-paid-at').value;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(paidAt)) throw new Error('Chọn ngày trả lương hợp lệ.');
        const reference = api.root.querySelector('#ky-paid-ref').value.trim();
        return post('mark-paid', { paidAt, reference: reference || undefined });
      }
    });
  };
  A.actions.kyreopen = () => {
    const v = view();
    const targets = reopenTargets(v);
    if (!targets.length) return;
    const paid = v.status === 'paid';
    stepDialog({
      title: 'Mở lại kỳ lương',
      sub: `Kỳ lương tháng ${mFull()} · đang ${STATUS_TXT[v.status]}`,
      body: `${noteBox('warn', 'alert', `${paid ? 'Kỳ đã trả lương: mở lại không rút được tiền đã chuyển, phần chênh khi trả lại cần bù trừ với kế toán. ' : ''}Mở lại không xoá gì: lần tính hiện tại thành "Đã thay thế", phiếu giữ nguyên, lần tính kế tiếp là lần mới. Phải tính lại và phê duyệt lại.`)}<div class="formrow bl-fld"><label class="lbl" for="ky-reopen-to">Mở lại về</label><select id="ky-reopen-to" class="input">${targets.map(([to, label]) => `<option value="${esc(to)}">${esc(label)}</option>`).join('')}</select><span class="cap">${can('period.reopen.inputs') ? 'Admin mở lại được về mọi bước trước.' : 'Vai trò của bạn chỉ mở lại về bước "Đã tính lương".'}</span></div>${reasonArea('ky-reopen-reason', 'Lý do mở lại')}`,
      label: 'Mở lại kỳ',
      cls: 'danger',
      icon: 'unlock',
      lead: 'Đã mở lại kỳ',
      run: async api => {
        return post('reopen', {
          to: api.root.querySelector('#ky-reopen-to').value,
          reason: A.readReason('ky-reopen-reason')
        });
      }
    });
  };
  /* Phê duyệt kỳ: không chặn gì; phiếu chưa phê duyệt được phê duyệt luôn, phiếu chưa tính được tự loại (lý do không bắt buộc), máy chủ cảnh báo */
  A.actions.kyapprove = async () => {
    let errors = [];
    try {
      errors = (await A.api('GET', `/periods/${K.month}/payslips?status=error&pageSize=${SLIP_PAGE_MAX}`)).rows || [];
    } catch {
      /* nếu không tải được thì để máy chủ báo */
    }
    const v = view();
    const c = v.counts || {};
    const open = (c.pending || 0) + (c.draft || 0);
    const warns = v.checklist || [];
    const rows = errors
      .map((r, n) => {
        const who = `Lý do loại phiếu của ${r.name || nameOf(r.username)}`;
        return `<div class="formrow bl-fld"><label class="lbl" for="ky-ex-${n}">${esc(A.reasonLabel(who))}${r.errorDetail ? ` <small>· ${esc(r.errorDetail)}</small>` : ''}</label><textarea id="ky-ex-${n}" class="input" maxlength="300" data-u="${esc(r.username)}" placeholder="Ghi lý do loại phiếu này khỏi kỳ"></textarea></div>`;
      })
      .join('');
    const list = `${open ? chkRow('pending', open, 'Phiếu chưa phê duyệt · được phê duyệt luôn khi phê duyệt kỳ', '<button class="link" type="button" data-dlg-close data-act="kyfilter" data-v="">Phê duyệt trên bảng lương</button>') : ''}${errors.length ? chkRow('rejected', errors.length, 'Phiếu chưa tính được · bị loại khỏi kỳ (người đó chưa có lương kỳ này), hoặc sửa hồ sơ rồi tính lại') : ''}${warns.map(i => chkRow('pending', i.code === 'RUN_STALE' ? null : i.count, itemText(i))).join('')}`;
    const status =
      open || errors.length
        ? noteBox('warn', 'alert', 'Các mục trên chỉ để biết: phê duyệt kỳ vẫn được.')
        : noteBox('ok', 'check', 'Mọi phiếu đã phê duyệt.');
    stepDialog({
      title: `Phê duyệt kỳ lương tháng ${mFull()}`,
      sub: 'Những việc còn lại trước khi chốt số',
      body: `<p class="bl-p">Phê duyệt kỳ chốt số của lần tính hiện hành thành số chính thức của tháng ${esc(mNum())}. Sau đó vẫn sửa được số phiếu (có cảnh báo), nhưng số đã chốt chỉ đổi khi mở lại kỳ và tính lại.</p>${list ? `<div class="bl-chks">${list}</div>` : ''}${rows ? `<div class="col" style="gap:14px">${rows}</div>` : ''}${status}`,
      label: 'Phê duyệt kỳ lương',
      icon: 'lock',
      lead: 'Đã phê duyệt kỳ lương',
      run: async api => {
        const excludeErrors = [...api.root.querySelectorAll('textarea[data-u]')]
          .map(t => ({ username: t.dataset.u, reason: t.value.trim() }))
          .filter(x => x.reason); // phiếu lỗi không ghi lý do do máy chủ tự loại
        return post('approve', excludeErrors.length ? { excludeErrors } : {});
      }
    });
  };

  /* ---------- lọc, tìm, trang ---------- */
  const refetch = () => {
    loadSlips().then(() => A.render());
    A.render();
  };
  A.actions.kyfilter = el => {
    const v = el.dataset.v;
    const flag = v === 'flag' ? (K.q.flag === '1' ? '' : '1') : '';
    // ước tính: chip trạng thái và chip chức vụ chọn một (bỏ loại đang chọn)
    K.q = { ...K.q, page: 1, status: v === 'flag' ? '' : v, flag, type: view() && view().run ? K.q.type : '' };
    clearSel();
    refetch();
  };
  A.actions.kytypef = el => {
    K.q = { ...K.q, page: 1, status: '', flag: '', type: K.q.type === el.dataset.v ? '' : el.dataset.v };
    refetch();
  };
  A.actions.kypage = el => {
    K.q.page = Math.max(1, Number(el.dataset.p));
    refetch();
  };
  A.inputs.kytype = el => {
    K.q.type = el.value;
    K.q.page = 1;
    clearSel();
    refetch();
  };
  A.actions.kyfull = () => {
    // Xem đủ cột: dải công thức ẩn để bảng đủ 12 cột trong một màn
    K.full = !K.full;
    A.render();
  };
  A.inputs.kyq = el => {
    K.q.q = el.value;
    K.q.page = 1;
    clearTimeout(K.timer);
    K.timer = setTimeout(() => loadSlips().then(() => A.render()), SEARCH_DEBOUNCE_MS);
  };

  /* ---------- dùng chung với Tổng quan ---------- */
  A.Ky = {
    /* Dùng chung với view-ky-luong-phieu.js (hộp một phiếu, chọn và phê duyệt phiếu, kiểm toàn vẹn): cùng trạng thái K của màn Bảng lương */
    kit: {
      K,
      view,
      nameOf,
      missingRoute,
      SLIP_PILL,
      can,
      reload,
      rank,
      rowOf,
      clearSel,
      write,
      noteBox,
      reasonArea,
      btnIcon,
      warnResult,
      approving,
      vnd,
      mFull,
      SLIP_PAGE_MAX,
      ERR_LIST_SHOW
    },
    STATUS_TXT,
    STATUS_PILL,
    NEXT_ACTION,
    nextAction,
    data: () => (K.month === S.month && K.view.state === 'ok' ? K.view.data : null),
    state: () => (K.month === S.month ? K.view.state : 'idle'),
    load,
    congActs,
    payday,
    totals: () => (K.month === S.month ? periodTotals(K.view.data) : null),
    kept: () => (K.month === S.month ? periodKept(K.view.data) : null),
    preview: () => (K.month === S.month ? K.preview : null),
    /* Năm phiếu đầu của lần tính hiện hành cho thẻ Kỳ lương ở Tổng quan */
    async loadPreview() {
      const month = S.month;
      if (K.view.state !== 'ok' || !K.view.data) return;
      if (!K.view.data.run) {
        /* chưa có lần tính: lấy ước tính cả kỳ (cho thẻ quỹ lương và chuyên cần của Tổng quan) */
        await loadEstimates(month, true);
        K.preview =
          K.est.state === 'ok' ? { ...K.est.data, rows: (K.est.data.rows || []).slice(0, PREVIEW_ROWS) } : null;
        return;
      }
      try {
        const res = await A.api('GET', `/periods/${month}/payslips?pageSize=${PREVIEW_ROWS}`);
        if (month === S.month) K.preview = res;
      } catch {
        K.preview = null;
      }
    }
  };

  A.register('luong', {
    load: () => load(true),
    render,
    fail: e => (K.view = { state: 'fail', data: null, error: A.errText(e) }),
    onMonth: () => {
      K.view = { state: 'idle', data: null, error: '' };
      K.sel.clear();
    }
  });
})(window.Admin);
