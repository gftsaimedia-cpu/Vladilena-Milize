/* Giao diện Nhân viên: lõi (trạng thái, gọi API, khay dưới, thông báo, sự kiện).
   Không có logic lương ở đây. Mọi chuỗi từ dữ liệu phải qua NV.esc() trước khi vào innerHTML.
   Không bao giờ lưu hay ghi log toạ độ GPS (xem punch.js). */
(function (NV) {
  'use strict';

  /* ---------- chữ ---------- */
  const esc = value =>
    String(value ?? '').replace(
      /[&<>"']/g,
      c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
  NV.esc = esc;
  NV.L = window.NhanVienLogic;

  /* ---------- đồng hồ: lấy qua Date.now() để thử nghiệm giả được; skew do máy chủ báo (nếu có) ---------- */
  NV.skewMs = 0;
  NV.nowIso = () => new Date(Date.now() + NV.skewMs).toISOString();
  NV.today = () => NV.L.vnDate(NV.nowIso());

  /* ---------- trạng thái ---------- */
  const S = (NV.S = {
    me: null,
    holidays: [],
    danger: [], // cảnh báo mức 'danger' của máy chủ: { key, message }, hiện ở băng đầu trang tới khi người dùng đóng
    geofenceRequired: false,
    geofence: null, // chỉ có khi máy chủ gửi cho nhân sự (hiện chỉ Admin được thấy)
    view: 'trang-chu',
    month: null, // tháng đang xem ở lịch
    sel: null, // ngày đang chọn
    sheets: {}, // { 'YYYY-MM': { status: 'loading'|'ok'|'error', data, error } }
    estimates: {}, // { 'YYYY-MM': { status: 'loading'|'ok'|'na'|'missing'|'error', data, error } }: GET /api/me/estimate
    punch: null,
    punchStatus: 'loading', // loading | ok | error
    punchError: '',
    busy: false,
    punchMsg: null, // { tone, text }
    menuOpen: false,
    incomeOpen: false, // máy tính: thẻ Thu nhập đang mở "Xem cách tính"
    desktop: false
  });

  /* ---------- bộ nhớ trình duyệt: chỉ tiện ích nhỏ, trang vẫn chạy khi bị chặn ---------- */
  NV.store = {
    get(key) {
      try {
        return localStorage.getItem('aicb-nv-' + key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem('aicb-nv-' + key, value);
      } catch {
        /* bị chặn: bỏ qua */
      }
    },
    remove(key) {
      try {
        localStorage.removeItem('aicb-nv-' + key);
      } catch {
        /* bị chặn: bỏ qua */
      }
    }
  };

  /* ---------- icon ---------- */
  const IC = {
    home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
    pin: '<path d="M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    login: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 8l4 4-4 4"/><path d="M14 12H4"/>',
    logout: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/>',
    building:
      '<rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M9 7h2"/><path d="M13 7h2"/><path d="M9 11h2"/><path d="M13 11h2"/><path d="M10 21v-4h4v4"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9"/><path d="M16 7l3 3"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    inbox: '<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5 5h14l2 8v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6z"/>',
    cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01"/><path d="M18 12h.01"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    check: '<path d="M5 12l5 5 9-10"/>',
    x: '<path d="M6 6l12 12"/><path d="M18 6L6 18"/>',
    alert: '<path d="M12 3l9 16H3z"/><path d="M12 10v4"/><path d="M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
    chevl: '<path d="M15 6l-6 6 6 6"/>',
    chevr: '<path d="M9 6l6 6-6 6"/>',
    chev: '<path d="M6 9l6 6 6-6"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
    send: '<path d="M4 12l16-8-6 16-2.5-6.5z"/>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M8 3v4"/><path d="M16 3v4"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v4h4"/><path d="M12 8v4l3 2"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    arrow: '<path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>'
  };
  NV.ic = (name, size = 20, width = 1.75) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[name] || ''}</svg>`;

  /* ---------- gọi API ---------- */
  // Hạn chờ một yêu cầu (mili giây). Không có hạn thì một yêu cầu treo (mất mạng giữa đường, máy chủ không trả lời)
  // làm nút Check-in quay mãi; quá hạn thì bỏ cuộc và báo lỗi mạng để người dùng bấm lại.
  const TIMEOUT_MS = 20000;
  class ApiError extends Error {
    constructor(status, message, data) {
      super(message);
      this.status = status;
      this.data = data || {};
    }
  }
  NV.ApiError = ApiError;
  /* opts.warnings: 'auto' (mặc định) thì cảnh báo trong phản hồi thành công (data.warnings) hiện qua NV.showWarnings;
     'manual' thì nơi gọi tự hiện (vẫn nhận data.warnings). Yêu cầu GET chỉ hiện cảnh báo chưa hiện lần nào (trang nạp lại định kỳ). */
  NV.api = async (method, path, body, opts = {}) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res,
      data = null;
    try {
      res = await fetch('/api' + path, {
        method,
        credentials: 'same-origin',
        headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal
      });
      try {
        data = await res.json();
      } catch {
        /* phản hồi không phải JSON */
      }
    } catch {
      throw new ApiError(0, 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.');
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 401) {
      location.replace('/dang-nhap.html');
      throw new ApiError(401, 'Phiên đăng nhập đã hết', data);
    }
    if (!res.ok) throw new ApiError(res.status, (data && data.error) || `Lỗi ${res.status}`, data);
    if (opts.warnings !== 'manual' && data && Array.isArray(data.warnings) && data.warnings.length)
      NV.showWarnings(method === 'GET' ? data.warnings.filter(w => w && !seenGet.has(warnKey(w))) : data.warnings);
    return data;
  };
  NV.errText = e => (e && e.message) || 'Có lỗi xảy ra';

  /* ---------- cảnh báo của máy chủ: warnings: [{ code, message, severity: 'warn' | 'danger', count?, link?, details? }] ----------
     message đã là câu tiếng Việt cho người dùng: hiện nguyên văn. 'warn': thông báo ngắn màu cam, lâu hơn thông báo thường;
     'danger': băng đỏ ở đầu trang (NV.warnbar, vẽ trong NV.render), ở lại khi đổi màn, tới khi người dùng đóng. */
  const warnKey = w => `${w.code}|${w.message}`;
  const seenGet = new Set();
  NV.warnList = list => (Array.isArray(list) ? list : []).filter(w => w && typeof w.message === 'string' && w.message);
  NV.showWarnings = list => {
    const items = NV.warnList(list);
    if (!items.length) return;
    for (const w of items) seenGet.add(warnKey(w));
    let added = false;
    for (const w of items.filter(x => x.severity === 'danger'))
      if (!S.danger.some(d => d.key === warnKey(w))) {
        S.danger.push({ key: warnKey(w), message: w.message });
        added = true;
      }
    if (added && NV.render) NV.render();
    const soft = items.filter(x => x.severity !== 'danger');
    if (soft.length)
      NV.toast(
        soft.length > 3
          ? [...soft.slice(0, 3).map(x => x.message), `(và ${soft.length - 3} cảnh báo khác)`]
          : soft.map(x => x.message),
        'warn'
      );
  };
  NV.warnbar = () =>
    S.danger.length
      ? `<div class="nv-warnbar" role="region" aria-label="Cảnh báo cần xem">${S.danger.map((w, i) => `<div class="nv-wb-row">${NV.ic('alert', 18, 2)}<p>${esc(w.message)}</p><button type="button" class="nv-wb-x" data-act="wb-close" data-i="${i}" aria-label="Đóng cảnh báo">${NV.ic('x', 16)}</button></div>`).join('')}</div>`
      : '';
  NV.actions = {};
  NV.actions['wb-close'] = el => {
    S.danger.splice(Number(el.dataset.i), 1);
    NV.render();
  };

  // Mã định danh cho mỗi lần bấm Check-in/out. randomUUID cần kết nối an toàn; không có thì tự dựng từ getRandomValues.
  NV.uuid = () => {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    const b = new Uint8Array(16);
    crypto.getRandomValues(b);
    return Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
  };

  /* ---------- khay dưới (điện thoại) và hộp thoại giữa (máy tính) ---------- */
  let lastFocus = null;
  NV.sheetOpen = false;
  // wide: hộp rộng trên máy tính (Hồ sơ của tôi); trên điện thoại vẫn là khay dưới
  NV.openSheet = ({ html, label, onMount, wide }) => {
    NV.closeSheet(true);
    const ovl = document.getElementById('nv-ovl');
    lastFocus = document.activeElement;
    ovl.innerHTML = `<div class="nv-sheet${wide ? ' is-wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(label || 'Chi tiết')}" tabindex="-1"><div class="nv-grab" aria-hidden="true"></div>${html}</div>`;
    ovl.hidden = false;
    NV.sheetOpen = true;
    document.body.style.overflow = 'hidden';
    const sheet = ovl.firstElementChild;
    const focusable = () =>
      Array.from(
        sheet.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select,textarea,[tabindex="0"]')
      ).filter(el => el.offsetParent !== null);
    setTimeout(() => {
      const f = sheet.querySelector('[data-autofocus]') || focusable()[0] || sheet;
      f.focus({ preventScroll: true });
    }, 0);
    ovl.onkeydown = ev => {
      if (ev.key !== 'Tab') return;
      const list = focusable();
      if (!list.length) return ev.preventDefault();
      const first = list[0],
        last = list[list.length - 1];
      if (ev.shiftKey && document.activeElement === first) {
        ev.preventDefault();
        last.focus();
      } else if (!ev.shiftKey && document.activeElement === last) {
        ev.preventDefault();
        first.focus();
      }
    };
    ovl.onclick = ev => {
      if (ev.target === ovl) NV.closeSheet();
    };
    if (onMount) onMount(sheet);
    return sheet;
  };
  NV.closeSheet = quiet => {
    const ovl = document.getElementById('nv-ovl');
    if (!ovl || ovl.hidden) return;
    ovl.hidden = true;
    ovl.innerHTML = '';
    NV.sheetOpen = false;
    document.body.style.overflow = '';
    if (!quiet && lastFocus && lastFocus.isConnected && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    lastFocus = null;
  };

  /* ---------- thông báo ngắn ---------- */
  // kind: 'err' (6 giây), 'warn' (cảnh báo của máy chủ, 8 giây), mặc định 3,5 giây. message: chuỗi hoặc mảng chuỗi (mỗi chuỗi một dòng)
  let toastTimer;
  NV.toast = (message, kind) => {
    const t = document.getElementById('nv-toast');
    if (!t) return;
    t.hidden = false;
    const lines = Array.isArray(message) ? message : [message];
    t.classList.toggle('is-warn', kind === 'warn');
    t.innerHTML = `${NV.ic(kind === 'err' || kind === 'warn' ? 'alert' : 'check', 18, 2)}<span>${lines.map(esc).join('<br>')}</span>`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), kind === 'warn' ? 8000 : kind === 'err' ? 6000 : 3500);
  };

  /* ---------- sự kiện: data-act (bấm), data-input (nhập); NV.actions tạo ở phần cảnh báo phía trên ---------- */
  document.addEventListener('click', ev => {
    if (S.menuOpen && !ev.target.closest('[data-menu-zone]')) {
      S.menuOpen = false;
      NV.render();
    }
    const el = ev.target.closest('[data-act]');
    if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return;
    const fn = NV.actions[el.dataset.act];
    if (!fn) return;
    if (el.tagName === 'A' && !el.getAttribute('href')) ev.preventDefault();
    fn(el, ev);
  });
  document.addEventListener('keydown', ev => {
    if (ev.key !== 'Escape') return;
    if (NV.sheetOpen) NV.closeSheet();
    else if (S.menuOpen) {
      S.menuOpen = false;
      NV.render();
    }
  });
})((window.NV = window.NV || {}));
