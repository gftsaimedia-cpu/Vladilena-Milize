/* Giao diện Nhân viên: chế độ "khai lịch thay" cho Admin.
   Địa chỉ: nhan-vien.html?thay=<tên đăng nhập>&month=YYYY-MM. Chỉ mở khi người đăng nhập có năng lực request.decide.* hoặc request.decide.<loại>
   (GET /api/me → caps); không có thì Admin về admin.html, nhân sự thường mở trang của chính mình (boot.js).
   Trong chế độ này S.me là hồ sơ NGƯỜI ĐƯỢC KHAI (lịch, ca, quyền lợi theo người đó); người đăng nhập nằm ở NV.thay.caller.
   Đọc: GET /api/sheet?user= (data.js; phản hồi có owner: tên, loại, nhãn chức vụ, bậc, ca, ngày bắt đầu, payrollSubject của người được khai,
   dùng làm S.me, không tải /api/staff), GET /api/positions (cờ quyền lợi của chức vụ),
   GET /api/periods/<tháng>/estimates/<tên> (số ước tính, đổi về cùng dạng GET /api/me/estimate để thu-nhap.js vẽ được).
   Ghi: PUT /api/sheet kèm user, không gửi KPI tự đánh giá (data.js → putSheet). Mọi kiểm tra do máy chủ làm trên hồ sơ người được khai.
   Ẩn Check-in/out, đổi mật khẩu, đăng xuất, tab Hôm nay và Tôi (views.js). Mọi chuỗi từ dữ liệu qua esc(). Không có phép tính tiền ở đây. */
(function (NV) {
  'use strict';
  const { esc, ic, S, L } = NV;
  const DECIDE_PREFIX = 'request.decide.';
  const USERNAME = /^[a-z0-9._-]{2,40}$/; // cùng dạng với máy chủ (lib/domain/input.js → USERNAME_RE)
  const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
  const ADMIN_BACK = '/admin.html#cham-cong';
  NV.THAY_VIEWS = ['cham-cong', 'yeu-cau', 'luong'];

  NV.thay = null; // { username, name, caller } khi đang khai thay

  /* ---------- vào chế độ ---------- */
  // Yêu cầu khai thay trong địa chỉ: { username, month, valid } hoặc null (không có ?thay=, hoặc là chính người đăng nhập)
  NV.thayRequest = meData => {
    const q = new URLSearchParams(location.search);
    const username = String(q.get('thay') || '')
      .trim()
      .toLowerCase();
    if (!username || (meData && meData.user && meData.user.username === username)) return null;
    const month = String(q.get('month') || '');
    return { username, month: MONTH.test(month) ? month : NV.curMonth(), valid: USERNAME.test(username) };
  };
  NV.canThay = meData =>
    !!meData && Array.isArray(meData.caps) && meData.caps.some(c => String(c).startsWith(DECIDE_PREFIX));
  // Nhân sự thường mở nhầm địa chỉ khai thay: bỏ tham số, ở lại trang của chính mình
  NV.dropThayParams = () => history.replaceState(null, '', location.pathname + location.hash);
  // Mất quyền duyệt giữa chừng (vai trò vừa đổi): Admin về admin.html, còn lại mở trang của chính mình
  NV.leaveThay = meData => location.replace(window.HomeRoute.adminCapable(meData) ? '/admin.html' : location.pathname);
  // Người đăng nhập có quyền duyệt loại khoản này không (khoản đó được duyệt luôn khi lưu khai thay)
  NV.thayCanDecide = item =>
    (S.caps || []).includes(DECIDE_PREFIX + '*') || (S.caps || []).includes(DECIDE_PREFIX + item);

  function fatal(message) {
    document.getElementById('nv-root').innerHTML =
      `${NV.thayBanner()}<div class="nv-page"><section class="nv-card nv-sec"><div class="nv-pad">${NV.noteBox('bad', message)}</div></section></div>`;
    return false;
  }
  /* Hồ sơ người được khai từ owner của GET /api/sheet?user= (data.js → loadMonth gọi mỗi lần nạp lịch, nên Admin đổi ca hay bậc của người đó
     thì trang thấy ở lần nạp sau). Chỉ thay S.me khi có trường đổi, để mô hình tháng (NV.model) không phải dựng lại vô cớ. */
  const OWNER_KEYS = ['username', 'name', 'type', 'level', 'levelName', 'shiftCode', 'startDate', 'payrollSubject'];
  NV.thayOwner = owner => {
    if (!NV.thay || !owner || typeof owner !== 'object') return;
    const next = { role: 'staff', positionLabel: owner.typeLabel || '' };
    for (const k of OWNER_KEYS) next[k] = owner[k] ?? null;
    next.name = next.name || NV.thay.username;
    const cur = S.me || {};
    if (OWNER_KEYS.some(k => cur[k] !== next[k]) || cur.positionLabel !== next.positionLabel) S.me = next;
    NV.thay.name = S.me.name;
  };
  // Nạp hồ sơ người được khai trước lần vẽ đầu. Trả false (đã vẽ lỗi) nếu không có người này hoặc người đó không thuộc bảng lương.
  NV.prepareThay = async (meData, req) => {
    NV.thay = { username: req.username, name: req.username, caller: meData.user };
    S.month = req.month;
    NV.applyMe(meData);
    document.title = 'GFT AiCB Khai lịch thay';
    if (!req.valid) return fatal('Tên đăng nhập trong đường dẫn không hợp lệ.');
    S.me = { username: req.username, name: req.username, role: 'staff' };
    // Lịch tháng đang khai (kèm owner) nạp luôn ở đây; boot.js gọi lại loadMonth thì dùng bản đã có
    const [, pos] = await Promise.allSettled([
      NV.loadMonth(req.month),
      NV.api('GET', '/positions?month=' + encodeURIComponent(req.month))
    ]);
    const sh = S.sheets[req.month];
    if (!sh || !sh.data) return fatal((sh && sh.error) || 'Chưa tải được lịch của người này.'); // câu của máy chủ, nguyên văn
    const owner = sh.data.owner;
    if (!owner) return fatal('Không có nhân sự này.');
    if (owner.payrollSubject === false) return fatal('Tài khoản này không thuộc bảng lương nên không có lịch để khai.');
    const list =
      pos.status === 'fulfilled' && pos.value && Array.isArray(pos.value.positions) ? pos.value.positions : [];
    const def = list.find(p => p && p.code === owner.type) || null;
    L.setBenefits(def && def.benefits ? def.benefits : null, (def && def.label) || owner.typeLabel || '');
    return true;
  };
  // Đổi tháng: ghi lại vào địa chỉ để tải lại trang vẫn đúng tháng đang khai
  NV.thaySyncUrl = () => {
    if (!NV.thay) return;
    const q = new URLSearchParams(location.search);
    q.set('thay', NV.thay.username);
    q.set('month', S.month);
    history.replaceState(null, '', `${location.pathname}?${q}${location.hash}`);
  };

  /* ---------- số ước tính của người được khai ---------- */
  // Phiếu ước tính một người (GET /api/periods/<tháng>/estimates/<tên>: payslip.snapshot là m kèm net, trace) đổi về dạng GET /api/me/estimate
  function asEstimate(res) {
    const p = (res && res.payslip) || {};
    const base = { month: res && res.month, period: (res && res.period) || null, staffTerms: p.staffTerms || null };
    if (p.status === 'error')
      return {
        status: 'na',
        data: { ...base, estimate: null, message: p.errorDetail || 'Chưa tính được thu nhập của người này.' }
      };
    const { rows, trace, ...m } = p.snapshot || {};
    const net = { ...(m.net || {}) };
    // Phiếu có số Admin đã sửa: gross…net ở gốc phiếu là số chi trả
    if (p.overridden)
      for (const k of ['gross', 'insurance', 'tax', 'advance', 'net']) if (Number.isFinite(p[k])) net[k] = p[k];
    return {
      status: 'ok',
      data: {
        ...base,
        estimate: true,
        source: 'estimate',
        official: false,
        upTo: null,
        toDate: null,
        m,
        net,
        trace: trace || {},
        pendingItems: null,
        allowanceStatus: null,
        ...(p.overridden ? { overridden: true } : {})
      },
      error: ''
    };
  }
  NV.thayEstimate = async (month, cur) => {
    try {
      const res = await NV.api(
        'GET',
        `/periods/${encodeURIComponent(month)}/estimates/${encodeURIComponent(NV.thay.username)}`
      );
      return asEstimate(res);
    } catch (e) {
      // Người này không có trong bảng lương của tháng: câu của máy chủ, nguyên văn
      if (e && e.status === 404 && e.data && e.data.code === 'PAYSLIP_NOT_FOUND')
        return { status: 'na', data: { estimate: null, message: NV.errText(e) }, error: '' };
      return { status: cur && cur.data ? cur.status : 'error', data: cur && cur.data, error: NV.errText(e) };
    }
  };

  /* ---------- băng trên cùng, thẻ người được khai ---------- */
  NV.thayBanner = () => {
    if (!NV.thay) return '';
    const mm = MONTH.test(S.month || '') ? `${S.month.slice(5)}/${S.month.slice(0, 4)}` : '';
    return `<div class="nv-thay" role="region" aria-label="Khai lịch thay"><span class="nv-thay-i">${ic('edit', 18)}</span><p class="nv-grow"><b>Đang khai lịch thay cho ${esc(NV.thay.name)}${mm ? ` · tháng ${esc(mm)}` : ''}</b><small>Khoản bạn có quyền duyệt được duyệt luôn khi lưu.</small></p><a class="nv-btn is-sm" href="${ADMIN_BACK}" data-act="thay-back">${ic('chevl', 16)}Về trang Admin</a></div>`;
  };
  // Máy tính: cột trái thay cho khối "Hôm nay" (không có Check-in/out khi khai thay)
  NV.thayCard = () => {
    const me = S.me;
    const sh = me.shiftCode ? L.shiftInfo(me.shiftCode) : null;
    const lv = L.hasLeaveAccount(me) ? NV.leave() : null;
    const kv = (k, v) =>
      `<div class="nv-kv"><span class="nv-k">${esc(k)}</span><span class="nv-v">${esc(v)}</span></div>`;
    return `<section class="nv-card nv-dcard nv-thaycard" aria-label="Người được khai"><div class="nv-me"><span class="nv-avatar is-lg">${esc(NV.initials(me.name))}</span><div><b>${esc(me.name)}</b><span>${esc(L.roleLine(me))}</span></div></div>${kv('Tên đăng nhập', me.username)}${kv('Ca cố định', sh ? NV.shiftText(sh) : 'Chưa gán')}${kv('Lịch làm việc', L.scheduleText(me))}${lv ? kv('Phép năm còn', `${NV.fmtNum(lv.balance)} ngày`) : ''}<p class="nv-cardnote">Bấm một ngày trên lịch để khai.</p></section>`;
  };

  // Về trang Admin: mở từ Admin thì quay lại đúng màn trước (giữ bộ lọc), không thì về Chấm công
  NV.actions['thay-back'] = (el, ev) => {
    if (ev) ev.preventDefault();
    let fromAdmin = false;
    try {
      const ref = new URL(document.referrer);
      fromAdmin = ref.origin === location.origin && ref.pathname === '/admin.html';
    } catch {
      /* không có trang trước */
    }
    if (fromAdmin && history.length > 1) history.back();
    else location.assign(ADMIN_BACK);
  };
})(window.NV);
