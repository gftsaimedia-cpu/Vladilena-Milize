/* Giao diện Admin: lõi dùng chung (trạng thái, gọi API, định tuyến, vẽ lại, hộp thoại).
   Không có logic lương ở đây: mọi số tiền lấy từ máy chủ hoặc bộ máy tính lương dùng chung.
   Mọi chuỗi từ dữ liệu phải qua A.esc() trước khi vào innerHTML. */
(function (A) {
  'use strict';

  /* ---------- chữ, số, ngày ---------- */
  const esc = value =>
    String(value ?? '').replace(
      /[&<>"']/g,
      c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
  const nf = n => (Number.isFinite(Number(n)) ? Number(n).toLocaleString('vi-VN') : '—');
  const pad = (n, len = 2) => String(n).padStart(len, '0');
  const VN_OFFSET_MS = 7 * 3600 * 1000;
  /* Đồng hồ của Admin = đồng hồ trình duyệt + độ lệch với giờ máy chủ (serverNow của GET /api/me, giống NV.syncClock của app nhân viên).
     Bản demo và sandbox chạy máy chủ với đồng hồ giả, nên "hôm nay" và tháng mặc định phải theo máy chủ, không theo trình duyệt.
     Chạy thật độ lệch gần 0. Không có serverNow (lỗi mạng) thì giữ độ lệch đang có (ban đầu 0 = giờ trình duyệt). */
  let skewMs = 0;
  const syncClock = data => {
    const t = data && typeof data.serverNow === 'string' ? Date.parse(data.serverNow) : NaN;
    if (Number.isFinite(t)) skewMs = t - Date.now();
  };
  const nowMs = () => Date.now() + skewMs;
  const vnToday = () => new Date(nowMs() + VN_OFFSET_MS).toISOString().slice(0, 10);
  const fmtDate = ymd =>
    /^\d{4}-\d{2}-\d{2}$/.test(ymd || '') ? `${ymd.slice(8)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}` : '—';
  const fmtDM = ymd => (/^\d{4}-\d{2}-\d{2}$/.test(ymd || '') ? `${ymd.slice(8)}/${ymd.slice(5, 7)}` : '—');
  const monthLabel = ym => (/^\d{4}-\d{2}$/.test(ym || '') ? `tháng ${ym.slice(5)}/${ym.slice(0, 4)}` : '—');
  const hm = iso => {
    const t = Date.parse(iso);
    return Number.isFinite(t) ? new Date(t + VN_OFFSET_MS).toISOString().slice(11, 16) : '—';
  };
  const fmtStamp = iso => {
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return '—';
    const d = new Date(t + VN_OFFSET_MS).toISOString();
    return `${d.slice(11, 16)} ${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
  };
  const addMonths = (ym, k) => {
    const y = Number(ym.slice(0, 4)),
      m = Number(ym.slice(5)) - 1 + k;
    return `${y + Math.floor(m / 12)}-${pad((((m % 12) + 12) % 12) + 1)}`;
  };
  const daysInMonth = ym => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5)), 0)).getUTCDate();
  const dowOf = ymd => new Date(ymd + 'T00:00:00Z').getUTCDay(); // 0 = Chủ nhật
  /* Nhãn thứ trong tuần (0 = Chủ nhật) và nhãn lịch: các thứ liền nhau ghi khoảng ("T2 – T7"), không thì liệt kê ("T2, T4, T6") */
  const DOW_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  const dowsText = list => {
    const d = [...new Set(Array.isArray(list) ? list : [])].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
    if (!d.length) return 'Không có';
    const run = d.every((x, i) => (x + 6) % 7 === ((d[0] + 6) % 7) + i);
    return d.length > 2 && run
      ? `${DOW_SHORT[d[0]]} – ${DOW_SHORT[d[d.length - 1]]}`
      : d.map(x => DOW_SHORT[x]).join(', ');
  };
  const fold = v =>
    String(v ?? '')
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/đ/g, 'd')
      .replace(/\s+/g, ' ')
      .trim();

  /* Nhãn tham số của chức vụ do máy chủ gửi có thể mang MÃ chức vụ trong ngoặc ("Phụ cấp đi lại (truongnhom)"): đổi thành tên chức vụ */
  const nameCodes = t =>
    String(t ?? '').replace(/\(([a-z][a-z0-9]*)\)/g, (m, c) => (A.TYPE_LONG[c] ? `(${A.TYPE_LONG[c]})` : m));
  Object.assign(A, {
    nameCodes,
    DOW_SHORT,
    dowsText,
    esc,
    nf,
    pad,
    syncClock,
    nowMs,
    vnToday,
    fmtDate,
    fmtDM,
    monthLabel,
    hm,
    fmtStamp,
    addMonths,
    daysInMonth,
    dowOf,
    fold
  });

  /* ---------- nhãn loại nhân sự (HDO chỉ là level 4 của Nhân viên) ---------- */
  A.TYPE_LONG = { tts: 'Thực tập sinh', ctv: 'Chuyên trách viên', nv: 'Nhân viên' };
  A.TYPE_SHORT = { tts: 'TTS', ctv: 'CTV', nv: 'NV' };
  A.typeLong = s => A.TYPE_LONG[s && s.type] || '—';
  A.typeShort = s => A.TYPE_SHORT[s && s.type] || '—';

  /* ---------- chức vụ là dữ liệu: GET /api/positions?month= ----------
     Danh sách, nhãn, nhãn ngắn, số bậc và cờ quyền lợi của từng chức vụ đến từ máy chủ (chức vụ do C&B thêm cũng có mặt). Ba nhãn
     cứng ở trên là DỰ PHÒNG: dùng khi máy chủ chưa trả danh sách (chưa có đường dẫn, lỗi mạng) và khi chưa tải xong.
     A.TYPE_LONG và A.TYPE_SHORT được bổ sung tại chỗ (không bao giờ bớt đi) nên mọi màn đang tra nhãn theo mã vẫn đúng. */
  A.positions = (() => {
    const FALLBACK = Object.keys(A.TYPE_LONG); // ba mã mặc định, lấy từ ba nhãn dự phòng ở trên (trước khi máy chủ bổ sung)
    const FALLBACK_MAX_LEVEL = { tts: 6, ctv: 4, nv: 4 }; // chỉ khi máy chủ chưa gửi số bậc
    const byMonth = new Map(); // tháng → [{ code, label, short, maxLevel, benefits, deprecated }]; mảng rỗng khi không đọc được
    const pending = new Set();
    const listOf = res => (Array.isArray(res) ? res : (res && (res.positions || res.items || res.types)) || []);
    const parse = res =>
      listOf(res)
        .map(p => {
          const code = String((p && (p.code || p.id || p.type)) || '').trim();
          if (!code) return null;
          const label = String(p.label || p.name || A.TYPE_LONG[code] || code);
          const levels = Array.isArray(p.levels) ? p.levels.length : Number(p.maxLevel || p.levelCount || 0) || 0;
          return {
            code,
            label,
            short: String(p.short || p.shortLabel || A.TYPE_SHORT[code] || label),
            maxLevel: levels || FALLBACK_MAX_LEVEL[code] || 0,
            // startDateRequired nằm ngoài benefits trong phản hồi: gộp vào để một chỗ tra cờ
            benefits: {
              ...(p.benefits && typeof p.benefits === 'object' ? p.benefits : {}),
              ...(typeof p.startDateRequired === 'boolean' ? { startDateRequired: p.startDateRequired } : {})
            },
            levels: Array.isArray(p.levels) ? p.levels : [],
            nightOptions: Array.isArray(p.nightOptions) ? p.nightOptions : [],
            travel: Number(p.travel) || 0,
            deprecated: !!p.deprecated
          };
        })
        .filter(Boolean);
    function apply(list) {
      for (const p of list) {
        A.TYPE_LONG[p.code] = p.label;
        A.TYPE_SHORT[p.code] = p.short;
      }
    }
    function ensure(month, force) {
      if (!/^\d{4}-\d{2}$/.test(month || '') || pending.has(month) || (byMonth.has(month) && !force)) return;
      pending.add(month);
      A.api('GET', '/positions' + A.qs({ month }))
        .then(
          res => {
            const list = parse(res);
            const before = codes(month).join();
            byMonth.set(month, list);
            apply(list);
            return codes(month).join() !== before || list.length > 0;
          },
          () => {
            byMonth.set(month, []);
            return false;
          }
        )
        .then(changed => {
          pending.delete(month);
          if (changed && A.S.view) A.render();
        });
    }
    const current = month => byMonth.get(month || A.S.month) || [];
    /* Mã chức vụ của tháng đang xem, theo thứ tự máy chủ trả; chưa có thì ba mã mặc định */
    function codes(month) {
      const l = current(month);
      return l.length ? l.map(p => p.code) : FALLBACK;
    }
    const get = (code, month) => current(month).find(p => p.code === code) || null;
    return {
      ensure,
      refresh: () => {
        byMonth.clear();
        ensure(A.S.month, true);
      },
      codes,
      get,
      list: month => {
        const l = current(month);
        return l.length
          ? l
          : FALLBACK.map(code => ({
              code,
              label: A.TYPE_LONG[code],
              short: A.TYPE_SHORT[code],
              maxLevel: FALLBACK_MAX_LEVEL[code],
              benefits: {},
              deprecated: false
            }));
      },
      maxLevel: (code, month) => (get(code, month) || {}).maxLevel || FALLBACK_MAX_LEVEL[code] || 0,
      /* Cờ quyền lợi của chức vụ (máy chủ gửi positions[].benefits.<cờ>); chưa có thì dùng giá trị dự phòng của chỗ gọi */
      flag(code, name, fallback, month) {
        const p = get(code, month);
        return p && p.benefits && typeof p.benefits[name] === 'boolean' ? p.benefits[name] : fallback;
      }
    };
  })();
  A.typeCodes = month => A.positions.codes(month);
  /* Tên bậc (level.<loại>.<bậc>.name) do Admin đặt trong Cài đặt, nên đọc giá trị đang hiệu lực của THÁNG đang xem từ
     GET /api/settings/params?group=2 (bảng "Loại nhân sự và bậc lương"), không có danh sách cứng. Nạp một lần mỗi tháng rồi nhớ;
     chưa nạp xong thì hiện "Bậc N" và vẽ lại màn đang xem khi có tên. Không đọc được (thiếu quyền, lỗi mạng) thì giữ "Bậc N". */
  A.levelNames = (() => {
    const GROUP = 2,
      ENTRY = 'level.<type>.<level>';
    const byMonth = new Map(); // tháng → Map('loại.bậc' → tên); Map rỗng khi không đọc được (không thử lại liên tục)
    const pending = new Set();
    const parse = res => {
      const names = new Map();
      for (const g of (res && res.groups) || [])
        for (const e of g.entries || [])
          if (e.id === ENTRY && Array.isArray(e.value))
            for (const r of e.value)
              if (r && typeof r.name === 'string' && r.name.trim()) names.set(`${r.type}.${r.level}`, r.name.trim());
      return names;
    };
    function ensure(month) {
      if (!/^\d{4}-\d{2}$/.test(month || '') || byMonth.has(month) || pending.has(month)) return;
      pending.add(month);
      A.api('GET', '/settings/params' + A.qs({ month, group: GROUP }))
        .then(
          res => {
            const names = parse(res);
            byMonth.set(month, names);
            return names.size > 0;
          },
          () => {
            byMonth.set(month, new Map());
            return false;
          }
        )
        .then(loaded => {
          pending.delete(month);
          if (loaded && A.S.view) A.render();
        });
    }
    return {
      ensure,
      name(type, level, month) {
        const m = byMonth.get(month || A.S.month);
        if (!m) {
          ensure(month || A.S.month);
          return '';
        }
        return m.get(`${type}.${level}`) || '';
      },
      /* Tham số đổi (người khác lưu, nối lại luồng): bỏ nhớ và nạp lại tháng đang xem */
      refresh() {
        byMonth.clear();
        ensure(A.S.month);
      }
    };
  })();
  /* "Fresher" khi bậc có tên; "Bậc 1" khi tên trống hoặc chưa đọc được */
  A.levelText = (type, level, month) => {
    const name = A.levelNames.name(type, level, month);
    if (name) return name;
    return Number.isInteger(Number(level)) && Number(level) >= 1 ? `Bậc ${Number(level)}` : '—';
  };
  A.levelLabel = (s, month) => (s.role === 'admin' ? 'Admin' : A.levelText(s.type, s.level, month));
  /* Giờ 6 ca cố định [mã, tên, giờ vào, giờ ra, mã cũ, loại ca normal | flex | night]. Mã theo danh mục ca (Normal1…); mã cũ (n1…) còn trong ngày công
     đã lưu trước đó nên vẫn tra được. Bảng dưới là dự phòng; giờ thật nạp từ GET /api/settings/shifts?month= (A.shiftsLoad)
     và nạp lại khi đổi tháng hoặc có params.changed. Mảng giữ nguyên một đối tượng, chỉ thay nội dung, nên nơi nào đọc A.SHIFTS cũng thấy giờ mới. */
  A.SHIFTS = [
    ['Normal1', 'Normal 1', '08:00', '17:00', 'n1', 'normal'],
    ['Normal2', 'Normal 2', '10:00', '19:00', 'n2', 'normal'],
    ['Flex1', 'Flex 1', '06:00', '15:00', 'f1', 'flex'],
    ['Flex2', 'Flex 2', '13:00', '22:00', 'f2', 'flex'],
    ['Night1', 'Night 1', '21:00', '06:00', 'g1', 'night'],
    ['Night2', 'Night 2', '22:00', '07:00', 'g2', 'night']
  ];
  const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
  A.shiftsLoad = async month => {
    try {
      const res = await A.api('GET', '/settings/shifts' + A.qs({ month }));
      const list = (res && Array.isArray(res.shifts) ? res.shifts : []).filter(
        x => x && x.code && x.name && TIME_RE.test(x.in || '') && TIME_RE.test(x.out || '')
      );
      if (!list.length) return false; // không đọc được thì giữ bảng đang có
      const next = list.map(x => [
        String(x.code),
        String(x.name),
        x.in,
        x.out,
        String(x.preset || x.code),
        String(x.kind || '')
      ]);
      const same = JSON.stringify(next) === JSON.stringify(A.SHIFTS);
      A.SHIFTS.splice(0, A.SHIFTS.length, ...next);
      return !same;
    } catch {
      return false; // thiếu quyền hoặc lỗi mạng: giữ bảng dự phòng
    }
  };
  // Một ca theo mã mới hoặc mã cũ; A.shiftCode: mã mới của một mã (lạ thì trả nguyên)
  A.shiftOf = code => (code ? A.SHIFTS.find(x => x[0] === code || x[4] === code) || null : null);
  A.shiftCode = code => (A.shiftOf(code) || [code])[0];
  A.shiftName = code => {
    const s = A.shiftOf(code);
    return s ? `${s[1]} ${s[2]}–${s[3]}` : '';
  };
  A.ITEM_LABEL = {
    isat: 'iSAT',
    approved: 'Nghỉ được duyệt',
    makeup_day: 'Làm bù cả ngày (loại cũ)',
    ot: 'OT',
    makeup_hours: 'Làm bù theo giờ',
    leave: 'Nghỉ phép năm',
    willmakeup: 'Nghỉ, sẽ làm bù'
  };
  A.itemLabel = item => A.ITEM_LABEL[item] || String(item || '—');

  /* ---------- trạng thái chung ---------- */
  const S = (A.S = {
    me: null,
    month: null,
    view: null,
    sub: {}, // mục con từng màn (ví dụ cai-dat → so-do)
    page: {},
    q: {},
    f: {},
    alerts: null,
    pendingCount: null,
    period: null, // thanh kỳ lương: { month, data (GET /periods/:month), payday }
    menuOpen: false,
    bellOpen: false
  });
  A.views = {};
  A.register = (key, view) => (A.views[key] = view);

  const store = {
    get(key) {
      try {
        return localStorage.getItem('aicb-admin-' + key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem('aicb-admin-' + key, value);
      } catch {
        /* trình duyệt chặn bộ nhớ: bỏ qua, trang vẫn chạy */
      }
    }
  };
  A.store = store;

  /* ---------- gọi API ---------- */
  class ApiError extends Error {
    constructor(status, message, data) {
      super(message);
      this.status = status;
      this.data = data || {};
    }
  }
  A.ApiError = ApiError;
  /* Công tắc Agents (GET /api/me → agentsEnabled): tắt thì ẩn Trợ lý AI và không gọi /api/ai/*. */
  A.agentsEnabled = () => !!(A.meInfo && A.meInfo.agentsEnabled);
  /* opts.warnings: 'auto' (mặc định) thì cảnh báo trong phản hồi thành công (data.warnings) hiện qua A.showWarnings;
     'manual' thì nơi gọi tự hiện (vẫn nhận data.warnings). */
  A.api = async (method, path, body, opts = {}) => {
    let res;
    try {
      res = await fetch('/api' + path, {
        method,
        credentials: 'same-origin',
        headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
        body: body !== undefined ? JSON.stringify(body) : undefined
      });
    } catch {
      throw new ApiError(0, 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.');
    }
    let data = null;
    try {
      data = await res.json();
    } catch {
      /* phản hồi không phải JSON */
    }
    if (res.status === 401) {
      location.replace('/dang-nhap.html');
      throw new ApiError(401, 'Phiên đăng nhập đã hết', data);
    }
    if (!res.ok) throw new ApiError(res.status, (data && data.error) || `Lỗi ${res.status}`, data);
    if (opts.warnings !== 'manual' && data && Array.isArray(data.warnings) && data.warnings.length)
      A.showWarnings(data.warnings);
    return data;
  };
  const q = params => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(params || {})) if (v !== undefined && v !== null && v !== '') p.set(k, v);
    const s = p.toString();
    return s ? '?' + s : '';
  };
  A.qs = q;
  A.errText = e => (e && e.message) || 'Có lỗi xảy ra';

  /* ---------- cập nhật trực tiếp (SSE): GET /api/events ----------
     A.live.on(tên, fn): fn(payload, tên) nhận dữ liệu JSON của sự kiện (hoặc null). Sự kiện nghiệp vụ: params.changed { configRev, fromMonth, kind, groups, by }
     (hoặc bản ngắn { configRev, fromMonth }), period.changed { month, status, rev }, approvals.changed { month, pending },
     attendance.changed { kind, month, pending }. Khung hệ thống: hello { epoch, serverTime, configRev, build }, resync {} (nối lại: nạp lại màn đang xem),
     bye { reason } (session, superseded: dừng hẳn, không nối lại). Tin chỉ là GỢI Ý NẠP LẠI: có thể mất hoặc lặp, không mang dữ liệu để vẽ.
     Bọc EventSource, tự nối lại; máy chủ chưa có đường dẫn (403, 404) thì sau vài lần thử sẽ bỏ cuộc và không làm gì thêm. */
  const LIVE = {
    path: '/api/events',
    retryMs: 4000, // chờ giữa hai lần nối lại khi kết nối bị đóng hẳn
    maxFails: 3, // số lần nối lại liên tiếp thất bại thì bỏ cuộc
    coalesceMs: 400, // gộp nhiều sự kiện cùng tên đến sát nhau
    /* Tin đến dồn dập cả ngày (mọi lượt bấm Check-in/out của công ty): không đợi "yên lặng" mới chạy (có thể không bao giờ chạy)
       mà chạy tối đa một lần cho mỗi khoảng gộp, tính từ tin đầu tiên của khoảng. Các tin trong khoảng được gộp thành một:
       trường nào khác nhau giữa các tin (ví dụ hai tháng khác nhau) thì bỏ, để nơi nghe coi là "không rõ" và không bỏ sót. */
    steadyEvents: ['attendance.changed'],
    stopReasons: ['superseded'] // lý do bye khiến ngừng hẳn: tab khác của cùng người đã nhận luồng, nối lại chỉ gây giành nhau
  };
  A.live = (() => {
    const handlers = new Map(); // tên sự kiện → Set(fn)
    const timers = new Map();
    let es = null,
      fails = 0,
      started = false, // chỉ nối sau khi đã đăng nhập (A.live.start)
      gaveUp = false,
      retryTimer = null,
      epoch = null;
    const run = (name, payload) => {
      for (const fn of handlers.get(name) || [])
        try {
          fn(payload, name);
        } catch (e) {
          console.error('live', name, e);
        }
    };
    const parse = ev => {
      try {
        return ev && ev.data ? JSON.parse(ev.data) : null;
      } catch {
        return null; // dữ liệu không phải JSON: vẫn báo có sự kiện
      }
    };
    const latest = new Map(); // tên sự kiện → dữ liệu của tin trong khoảng gộp (tin mới nhất; tin dồn dập: các tin đã gộp)
    /* Gộp hai tin cùng tên: giữ trường giống nhau, bỏ trường khác nhau. Tin không có dữ liệu thì kết quả cũng không có (không rõ). */
    const mergePayload = (a, b) => {
      if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return null;
      const out = {};
      for (const k of Object.keys(b)) if (JSON.stringify(a[k]) === JSON.stringify(b[k])) out[k] = b[k];
      return out;
    };
    const dispatch = (name, ev) => {
      const payload = parse(ev);
      if (LIVE.steadyEvents.includes(name) && timers.has(name)) {
        latest.set(name, mergePayload(latest.get(name), payload)); // đã có hẹn: gộp tin, không dời giờ chạy
        return;
      }
      latest.set(name, payload);
      clearTimeout(timers.get(name));
      timers.set(
        name,
        setTimeout(() => {
          timers.delete(name);
          run(name, latest.get(name));
        }, LIVE.coalesceMs)
      );
    };
    const listen = name => es && es.addEventListener(name, ev => dispatch(name, ev));
    const scheduleReconnect = () => {
      if (++fails >= LIVE.maxFails) {
        gaveUp = true;
        return;
      }
      clearTimeout(retryTimer);
      retryTimer = setTimeout(connect, LIVE.retryMs * fails);
    };
    /* bye { reason: session | password | logout | locked ... }: phiên cũ bị đóng. Trình duyệt vừa đổi mật khẩu có cookie mới nên vẫn đăng nhập:
       hỏi /api/me trước, còn đăng nhập (và là Admin) thì nối lại, hết thì về trang đăng nhập. */
    async function recheckSession() {
      let user = null;
      try {
        const res = await fetch('/api/me', { credentials: 'same-origin' });
        user = await res.json();
      } catch {
        scheduleReconnect(); // lỗi mạng: thử nối lại, chưa kết luận gì về phiên
        return;
      }
      if (user && window.HomeRoute.adminCapable(user)) {
        fails = 0;
        clearTimeout(retryTimer);
        retryTimer = setTimeout(connect, LIVE.retryMs);
      } else location.replace('/dang-nhap.html');
    }
    function connect() {
      if (!started || gaveUp || es || typeof EventSource === 'undefined' || !handlers.size) return;
      try {
        es = new EventSource(LIVE.path, { withCredentials: true });
      } catch {
        gaveUp = true;
        return;
      }
      for (const name of handlers.keys()) listen(name);
      es.addEventListener('open', () => (fails = 0));
      /* hello: máy chủ khởi động lại (epoch khác) thì các màn nạp lại, vì có thể đã lỡ tin */
      es.addEventListener('hello', ev => {
        const d = parse(ev) || {};
        if (epoch !== null && d.epoch !== undefined && d.epoch !== epoch) dispatch('resync', null);
        if (d.epoch !== undefined) epoch = d.epoch;
      });
      /* resync: nối lại sau khi mất kết nối; không phát lại tin lỡ nên phải nạp lại màn đang xem */
      es.addEventListener('resync', () => dispatch('resync', null));
      es.addEventListener('bye', ev => {
        const reason = (parse(ev) || {}).reason;
        if (es) es.close();
        es = null;
        if (LIVE.stopReasons.includes(reason)) gaveUp = true;
        else recheckSession();
      });
      es.addEventListener('error', () => {
        if (!es || es.readyState !== 2) return; // 0: trình duyệt tự nối lại; 2: máy chủ từ chối hẳn
        es.close();
        es = null;
        scheduleReconnect();
      });
    }
    return {
      on(name, fn) {
        if (!handlers.has(name)) {
          handlers.set(name, new Set());
          listen(name);
        }
        handlers.get(name).add(fn);
        connect();
      },
      start() {
        started = true;
        connect();
      },
      get active() {
        return !!es && es.readyState === 1;
      }
    };
  })();

  /* Tham số đổi (kể cả tên bậc): nạp lại tên bậc của tháng đang xem */
  A.live.on('params.changed', () => {
    A.levelNames.refresh();
    A.positions.refresh();
  });

  /* ---------- điều hướng ---------- */
  /* Nhóm theo việc của kỳ lương; nhóm đầu không có tiêu đề */
  A.NAV_GROUPS = [
    [
      '',
      [
        ['tong-quan', 'grid', 'Tổng quan'],
        ['duyet', 'inbox', 'Yêu cầu']
      ]
    ],
    [
      'Kỳ lương',
      [
        ['cham-cong', 'clock', 'Chấm công & phép'],
        ['kpi', 'target', 'Đánh giá KPI'],
        ['luong', 'cash', 'Bảng lương']
      ]
    ],
    ['Đội ngũ', [['ho-so', 'file', 'Nhân sự']]],
    ['Phân tích', [['tro-ly', 'spark', 'Trợ lý AI']]]
  ];
  A.NAVS = A.NAV_GROUPS.flatMap(g => g[1]);
  A.NAVS2 = [['cai-dat', 'sliders', 'Cài đặt']];
  A.SOON_NAV = new Set();

  A.go = (key, sub) => {
    if (!A.views[key] || (key === 'tro-ly' && !A.agentsEnabled())) key = 'tong-quan';
    if (sub !== undefined) S.sub[key] = sub;
    const target = '#' + key + (S.sub[key] && key === 'cai-dat' ? '/' + S.sub[key] : '');
    if (location.hash !== target) {
      history.replaceState(null, '', target);
    }
    S.view = key;
    S.menuOpen = false;
    A.render();
    A.loadView(key);
    const view = document.getElementById('view');
    if (view) view.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  };
  A.loadView = key => {
    const v = A.views[key];
    if (!v || !v.load) return Promise.resolve();
    const run = v.load(); // phần đồng bộ của load đặt cờ "đang tải"
    if (S.view === key) A.render();
    return Promise.resolve(run)
      .catch(e => {
        if (v.fail) v.fail(e);
      })
      .then(() => {
        if (S.view === key) A.render();
      });
  };
  A.setMonth = (ym, confirmed) => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(ym) || ym === S.month) return;
    const lost = confirmed ? 0 : A.drafts.total('month'); // nơi gọi không hỏi trước thì báo rõ đã bỏ bao nhiêu thay đổi
    if (lost) A.toast(`Đã bỏ ${lost} thay đổi chưa lưu vì đổi tháng.`, 'err');
    S.month = ym;
    store.set('month', ym);
    A.refreshShell();
    for (const v of Object.values(A.views)) if (v.onMonth) v.onMonth();
    A.render();
    A.loadView(S.view);
    A.shiftsLoad(ym).then(changed => changed && ym === S.month && A.render());
  };

  /* ---------- đếm việc cần làm (chuông, huy hiệu) ---------- */
  A.refreshShell = async () => {
    const m = S.month;
    loadPeriodStrip(m); // không chờ: xong thì chỉ vẽ lại khung
    const [alerts, count] = await Promise.allSettled([
      A.api('GET', '/alerts' + q({ month: m })),
      A.api('GET', '/approvals/count')
    ]);
    if (m !== S.month) return;
    S.alerts = alerts.status === 'fulfilled' ? alerts.value : null;
    S.pendingCount = count.status === 'fulfilled' ? count.value.pending : S.alerts ? S.alerts.pendingApprovals : null;
    A.render();
  };
  /* Thanh kỳ lương: trạng thái kỳ, ngày trả lương dự kiến và hạn chốt công (ngưỡng của AI kiểm tra).
     Lỗi (tháng ngoài kỳ quản lý, thiếu quyền) thì ẩn các bước. Chỉ vẽ lại khung để không thay ô đang gõ trong màn. */
  async function loadPeriodStrip(m) {
    const [period, list] = await Promise.allSettled([
      A.api('GET', `/periods/${m}`),
      A.api('GET', `/periods?year=${m.slice(0, 4)}`)
    ]);
    if (m !== S.month) return;
    const row = list.status === 'fulfilled' ? (list.value.periods || []).find(r => r.month === m) : null;
    S.period = {
      month: m,
      data: period.status === 'fulfilled' ? period.value : null,
      payday: row ? row.paydayExpected : null
    };
    A.renderChrome();
    if (!A.ai || A.ai.month !== m) A.loadAi(false, { quiet: true });
  }

  /* ---------- vẽ lại ---------- */
  const view = () => document.getElementById('view');
  function snapshotFocus() {
    const ae = document.activeElement;
    if (!ae || !ae.id || !view().contains(ae)) return null;
    let sel = null;
    try {
      if (ae.selectionStart != null) sel = [ae.selectionStart, ae.selectionEnd];
    } catch {
      /* ô không có vùng chọn */
    }
    /* ô chữ đang gõ dở (giá trị khác giá trị gốc lúc vẽ): giữ chữ đã gõ qua lần vẽ lại do dữ liệu nền tải xong */
    const typed =
      (ae.tagName === 'TEXTAREA' ||
        (ae.tagName === 'INPUT' && !/^(checkbox|radio|file|button|submit)$/.test(ae.type))) &&
      ae.value !== ae.defaultValue
        ? { value: ae.value, def: ae.defaultValue }
        : null;
    return { id: ae.id, sel, typed };
  }
  function restoreFocus(f) {
    if (!f) return;
    const el = document.getElementById(f.id);
    if (!el) return;
    /* chỉ trả lại chữ đang gõ khi ô mới vẽ vẫn mang đúng giá trị gốc cũ (dữ liệu của ô đó không đổi) */
    if (f.typed && el.defaultValue === f.typed.def && el.value === f.typed.def) el.value = f.typed.value;
    if (el === document.activeElement) return;
    el.focus({ preventScroll: true });
    if (f.sel && el.setSelectionRange) {
      try {
        el.setSelectionRange(...f.sel);
      } catch {
        /* ô không hỗ trợ */
      }
    }
  }
  A.render = () => {
    A.positions.ensure(S.month);
    A.renderChrome();
    const v = A.views[S.view];
    const focus = snapshotFocus();
    const scrollers = [...view().querySelectorAll('.tblwrap')].map(el => el.scrollLeft);
    view().innerHTML = v ? v.render() : '';
    view()
      .querySelectorAll('.tblwrap')
      .forEach((el, i) => {
        if (scrollers[i]) el.scrollLeft = scrollers[i];
      });
    restoreFocus(focus);
    if (v && v.after) v.after();
  };
  A.renderChrome = () => {
    const ae = document.activeElement;
    const keepId = ae && ae.id && (ae.closest('#topbar') || ae.closest('#side')) ? ae.id : null;
    const side = document.getElementById('side');
    /* chỉ vẽ lại khi nội dung đổi: tránh logo và menu nháy lại mỗi lần một màn tải xong */
    if (side) {
      const html = A.sidebarHTML();
      if (side._html !== html) side.innerHTML = side._html = html;
      side.classList.toggle('open', S.menuOpen);
    }
    const bar = document.getElementById('topbar');
    if (bar) {
      const html = A.topbarHTML();
      if (bar._html !== html) bar.innerHTML = bar._html = html;
    }
    if (A.renderPop) A.renderPop();
    if (keepId) {
      const el = document.getElementById(keepId);
      if (el && el !== document.activeElement) el.focus({ preventScroll: true });
    }
  };

  /* ---------- hộp thoại ---------- */
  let lastFocus = null;
  A.closeDialog = () => {
    const ovl = document.getElementById('ovl');
    ovl.hidden = true;
    ovl.innerHTML = '';
    A.dialogOpen = false;
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
    lastFocus = null;
  };
  /* opts: { title, sub, body (html), wide, drawer (ngăn kéo bên phải), footNote (chữ nhỏ bên trái chân hộp),
     width (px, hộp giữa màn), cls (lớp riêng của hộp), foot: [{ label, cls, icon, onClick(api), keepOpen }] }
     onClick nhận api = { close, busy(on), error(msg), root }; trả về Promise thì nút bị khoá trong lúc chờ. */
  A.openDialog = opts => {
    const ovl = document.getElementById('ovl');
    lastFocus = document.activeElement;
    ovl.classList.toggle('drw-ovl', !!opts.drawer);
    const width = Number(opts.width) > 0 ? ` style="width:min(${Number(opts.width)}px,100%)"` : '';
    ovl.innerHTML = `<div class="modal ${opts.wide ? 'wide' : ''} ${opts.drawer ? 'drawer' : ''} ${esc(opts.cls || '')}"${width} role="dialog" aria-modal="true" aria-labelledby="dlg-title" tabindex="-1">
<div class="mh"><div class="col" style="gap:4px"><h2 id="dlg-title">${esc(opts.title)}</h2>${opts.sub ? `<span class="cap">${esc(opts.sub)}</span>` : ''}</div>
<button class="btn icon sm ghost" type="button" data-dlg-close aria-label="Đóng">${A.ic('x', 18)}</button></div>
<div id="dlg-body" class="col" style="gap:16px">${opts.body || ''}</div>
<div id="dlg-err" hidden></div>
<div class="mf">${opts.footNote ? `<span class="cap mfnote">${esc(opts.footNote)}</span>` : ''}${(opts.foot || [])
      .map(
        (b, i) =>
          `<button type="button" class="btn ${esc(b.cls || '')}" data-dlg-btn="${i}" ${b.disabled ? 'disabled' : ''}>${b.icon ? A.ic(b.icon, 16) : ''}${esc(b.label)}</button>`
      )
      .join('')}</div></div>`;
    ovl.hidden = false;
    A.dialogOpen = true;
    const root = ovl.firstElementChild;
    const api = {
      root,
      close: A.closeDialog,
      error(msg) {
        const el = root.querySelector('#dlg-err');
        el.hidden = !msg;
        el.innerHTML = msg ? `<div class="errbox" role="alert">${A.ic('alert', 16)}<span>${esc(msg)}</span></div>` : '';
      },
      busy(on) {
        root.querySelectorAll('[data-dlg-btn]').forEach(b => (b.disabled = on));
      }
    };
    root.addEventListener('click', ev => {
      if (ev.target.closest('[data-dlg-close]')) return A.closeDialog();
      const btn = ev.target.closest('[data-dlg-btn]');
      if (!btn || btn.disabled) return;
      const def = opts.foot[Number(btn.dataset.dlgBtn)];
      if (!def.onClick) return A.closeDialog();
      api.error('');
      let out;
      try {
        out = def.onClick(api);
      } catch (e) {
        api.error(A.errText(e));
        return;
      }
      if (out && typeof out.then === 'function') {
        api.busy(true);
        out.then(
          () => api.busy(false),
          e => {
            api.busy(false);
            api.error(A.errText(e));
          }
        );
      }
    });
    /* đặt con trỏ vào ô nhập đầu tiên (kể cả ô do onMount chèn thêm); hộp không có ô nhập thì đặt vào chính hộp, không vào nút đóng */
    setTimeout(() => {
      if (!document.contains(root)) return;
      const first = root.querySelector(
        'textarea:not([disabled]),input:not([disabled]):not([type="hidden"]):not([type="checkbox"]):not([type="radio"]),select:not([disabled])'
      );
      (first || root).focus({ preventScroll: !first });
    }, 0);
    if (opts.onMount) opts.onMount(api);
    return api;
  };
  /* Hộp xác nhận một bước; confirm là async, lỗi hiện trong hộp. */
  A.confirmDialog = ({ title, sub, body, label, cls, onConfirm, wide }) =>
    A.openDialog({
      title,
      sub,
      body,
      wide,
      foot: [
        { label: 'Huỷ' },
        {
          label,
          cls: cls || 'pri',
          onClick: api => Promise.resolve(onConfirm(api)).then(() => api.close())
        }
      ]
    });
  /* Kho bản nháp chưa lưu: mỗi màn có bản nháp đăng ký một hàm đếm (A.drafts.register); không có gì bị bỏ âm thầm.
     scopes: 'month' = bị bỏ khi đổi tháng, 'params' = bị bỏ khi nạp lại kho tham số (thêm chức vụ, khoản, xác nhận cờ), 'roles' = bị bỏ khi đổi vai trò.
     Mọi bản nháp đều được tính cho cảnh báo rời trang. */
  const draftReg = new Map();
  A.drafts = {
    register(name, count, scopes) {
      draftReg.set(name, { count, scopes: scopes || [] });
    },
    total(scope) {
      let n = 0;
      for (const d of draftReg.values()) {
        if (scope && !d.scopes.includes(scope)) continue;
        try {
          n += Math.max(0, Number(d.count()) || 0);
        } catch {
          /* màn chưa sẵn sàng thì coi như chưa có bản nháp */
        }
      }
      return n;
    },
    /* Chạy go() ngay nếu không có bản nháp; có thì hỏi "Bỏ các thay đổi này?" trước. Trả về true khi chạy ngay. */
    guard(go, opts = {}) {
      const n = A.drafts.total(opts.scope);
      if (!n) {
        go();
        return true;
      }
      A.openDialog({
        title: 'Bỏ thay đổi chưa lưu?',
        sub: opts.sub || '',
        body: `<p>Có ${esc(String(n))} thay đổi chưa lưu. Bỏ các thay đổi này?</p>`,
        foot: [
          { label: 'Quay lại sửa', onClick: () => A.closeDialog() },
          {
            label: 'Bỏ thay đổi',
            cls: 'danger',
            onClick: api => {
              api.close();
              go();
            }
          }
        ]
      });
      return false;
    }
  };
  window.addEventListener('beforeunload', ev => {
    if (A.drafts.total() > 0) {
      ev.preventDefault();
      ev.returnValue = '';
    }
  });
  /* Nhãn ô lý do: lý do không bắt buộc (máy chủ nhận lý do trống). Nhãn truyền vào có thể đã ghi "(bắt buộc)": đổi thành "(không bắt buộc)";
     chưa ghi thì thêm. */
  A.reasonLabel = (label = 'Lý do') => {
    const text = String(label).trim();
    if (/\(không bắt buộc[^)]*\)\s*$/.test(text)) return text;
    const m = text.match(/^(.*?)\s*\(bắt buộc[^)]*\)\s*$/); // "(bắt buộc)" hoặc "(bắt buộc, 10 đến 300 ký tự)"
    return `${m ? m[1] : text} (không bắt buộc)`;
  };
  A.reasonField = (id = 'dlg-reason', label = 'Lý do', ph = 'Ghi rõ lý do để lưu vào nhật ký') =>
    `<div class="formrow"><label class="lbl" for="${id}">${esc(A.reasonLabel(label))}</label><textarea id="${id}" class="input" maxlength="300" placeholder="${esc(ph)}"></textarea></div>`;
  /* Đọc ô lý do: chuỗi đã cắt khoảng trắng (có thể rỗng, lý do không bắt buộc). */
  A.readReason = (id = 'dlg-reason') => {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  };

  /* ---------- cảnh báo của máy chủ: phản hồi thành công có warnings: [{ code, message, severity, count?, link?, details? }] ----------
     message đã là câu tiếng Việt cho người dùng: hiện nguyên văn. 'warn' hiện ở thông báo góc (lâu hơn thường); 'danger' (thực lĩnh âm, phiếu lỗi bị loại...)
     hiện ở băng cố định dưới thanh kỳ lương (#warnbar), ở lại tới khi người dùng đóng, không mất khi đổi màn. */
  const WARN_LINK = {
    periods: 'luong',
    'pay-entries': 'luong',
    'ai-review': 'tro-ly',
    attendance: 'cham-cong',
    approvals: 'duyet',
    kpi: 'kpi',
    staff: 'ho-so'
  };
  A.warnLinkOf = link => (link && WARN_LINK[link] ? WARN_LINK[link] : null);
  const danger = []; // { key, message, view }
  function paintWarnbar() {
    const bar = document.getElementById('warnbar');
    if (!bar) return;
    bar.hidden = !danger.length;
    bar.innerHTML = danger
      .map(
        (w, i) =>
          `<div class="wb-row">${A.ic('alert', 18, 2)}<p class="wb-t">${esc(w.message)}</p>${w.view ? `<button type="button" class="btn sm" data-act="wbgo" data-v="${esc(w.view)}">Mở</button>` : ''}<button type="button" class="btn sm icon ghost" data-act="wbclose" data-i="${i}" aria-label="Đóng cảnh báo">${A.ic('x', 16)}</button></div>`
      )
      .join('');
  }
  A.showWarnings = list => {
    const items = (Array.isArray(list) ? list : []).filter(w => w && w.message);
    if (!items.length) return;
    for (const w of items.filter(x => x.severity === 'danger')) {
      const key = `${w.code}|${w.message}`;
      if (!danger.some(d => d.key === key))
        danger.push({ key, message: String(w.message), view: A.warnLinkOf(w.link) });
    }
    paintWarnbar();
    const soft = items.filter(x => x.severity !== 'danger');
    if (soft.length)
      A.toast(soft.length > 1 ? `${soft[0].message} (và ${soft.length - 1} cảnh báo khác)` : soft[0].message, 'warn');
  };
  A.clearWarnings = () => {
    danger.length = 0;
    paintWarnbar();
  };
  A.closeWarning = i => {
    danger.splice(i, 1);
    paintWarnbar();
  };

  let toastTimer;
  let warnUntil = 0; // thông báo cảnh báo đang hiện tới lúc này: câu thường ("Đã lưu...") không đè lên
  A.toast = (message, kind) => {
    const t = document.getElementById('toast');
    if (!kind && !t.hidden && Date.now() < warnUntil) return;
    warnUntil = kind === 'warn' ? Date.now() + 8000 : 0;
    t.hidden = false;
    t.innerHTML = `${A.ic(kind === 'err' || kind === 'warn' ? 'alert' : 'check', 18, 2)}<span>${esc(message)}</span>`;
    t.classList.toggle('is-warn', kind === 'warn');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), kind === 'err' || kind === 'warn' ? 8000 : 3500);
  };

  /* ---------- bắt sự kiện: data-act (bấm), data-input (gõ, chọn) ---------- */
  A.actions = {};
  /* băng cảnh báo cố định (A.showWarnings) */
  A.actions.wbclose = el => A.closeWarning(Number(el.dataset.i));
  A.actions.wbgo = el => A.drafts.guard(() => A.go(el.dataset.v));
  A.inputs = {};

  /* Khai lịch thay nhân viên (Admin khai thay): mở trang nhân viên ở chế độ khai thay
     (nhan-vien.html?thay=<tài khoản>&month=<tháng đang chọn>). Chỉ hiện nút khi tài khoản có một năng lực xử lý yêu cầu
     (request.decide.*); máy chủ vẫn kiểm quyền theo từng người (PUT /api/sheet với user). */
  A.canActFor = () =>
    !!(A.meInfo && Array.isArray(A.meInfo.caps) && A.meInfo.caps.some(c => String(c).startsWith('request.decide.')));
  A.actForUrl = username => `/nhan-vien.html?thay=${encodeURIComponent(username)}&month=${encodeURIComponent(S.month)}`;
  /* Nút "Khai lịch thay". iconOnly: nút nhỏ chỉ có biểu tượng lịch (chữ đầy đủ ở title, aria-label kèm tên người) */
  A.actForButton = (username, label = 'Khai lịch thay', cls = 'btn sm', iconOnly = false, name = '') =>
    A.canActFor()
      ? `<button type="button" class="${esc(cls)}" data-act="khaithay" data-u="${esc(username)}" ${iconOnly ? `title="${esc(label)} ${esc(A.monthLabel(S.month))}" aria-label="${esc(label)} cho ${esc(name || username)}, ${esc(A.monthLabel(S.month))}"` : ''}>${A.ic('cal', 16)}${iconOnly ? '' : esc(label)}</button>`
      : '';
  /* Rời trang Admin: bản nháp chưa lưu (A.drafts) thì hỏi trước */
  A.actions.khaithay = el =>
    A.drafts.guard(() => location.assign(A.actForUrl(el.dataset.u)), { sub: 'Sang trang khai lịch thay' });
  document.addEventListener('click', ev => {
    if (S.bellOpen && !ev.target.closest('.bellwrap')) {
      S.bellOpen = false;
      A.renderChrome();
    }
    const el = ev.target.closest('[data-act]');
    if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return;
    const fn = A.actions[el.dataset.act];
    if (!fn) return;
    if (el.tagName === 'A' && !el.getAttribute('href')) ev.preventDefault();
    fn(el, ev);
  });
  const onInput = ev => {
    const el = ev.target.closest('[data-input]');
    if (!el) return;
    if (ev.type === 'input' && el.tagName === 'SELECT') return;
    const fn = A.inputs[el.dataset.input];
    if (fn) fn(el, ev);
  };
  document.addEventListener('input', onInput);
  document.addEventListener('change', onInput);
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape') {
      if (A.dialogOpen) A.closeDialog();
      else if (S.bellOpen) {
        S.bellOpen = false;
        A.renderChrome();
      }
    }
  });
  window.addEventListener('hashchange', () => {
    const [key, sub] = location.hash.replace(/^#/, '').split('/');
    if (key !== S.view || (key === 'cai-dat' && sub && sub !== S.sub[key])) A.go(key, sub);
  });

  /* lọc, tìm, phân trang dùng chung: data-k là khoá, data-pg là khoá trang cần về trang 1 */
  A.actions.f = el => {
    S.f[el.dataset.k] = el.dataset.v;
    if (el.dataset.pg) S.page[el.dataset.pg] = 1;
    A.render();
  };
  A.actions.ftog = el => {
    S.f[el.dataset.k] = !S.f[el.dataset.k];
    if (el.dataset.pg) S.page[el.dataset.pg] = 1;
    A.render();
  };
  A.inputs.f = el => {
    S.f[el.dataset.k] = el.value;
    if (el.dataset.pg) S.page[el.dataset.pg] = 1;
    A.render();
  };
  A.inputs.q = el => {
    S.q[el.dataset.k] = el.value;
    S.page[el.dataset.k] = 1;
    A.render();
  };
  A.actions.page = el => {
    S.page[el.dataset.k] = Number(el.dataset.p);
    A.render();
    const v = document.getElementById('view');
    if (v) v.scrollIntoView({ block: 'start' });
  };
  A.actions.nav = el => {
    if (el.dataset.g) S.f.cfgGroup = Number(el.dataset.g); // mở Cài đặt › Kỳ lương & công thức đúng nhóm
    if (el.dataset.fk) S.f.formulaKey = el.dataset.fk; // mở Cài đặt › Công thức với công thức có tên này nạp sẵn
    A.go(el.dataset.t, el.dataset.s);
  };
  A.actions.menu = () => {
    S.menuOpen = !S.menuOpen;
    A.renderChrome();
  };
  A.actions.bell = () => {
    S.bellOpen = !S.bellOpen;
    A.renderChrome();
  };
  /* Đổi tháng từ thanh trên: có bản nháp chưa lưu thì hỏi trước; không đồng ý thì giữ tháng cũ và trả ô chọn tháng về tháng cũ */
  const askMonth = ym => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(ym) || ym === S.month) return A.renderChrome();
    if (!A.drafts.total('month')) return A.setMonth(ym, true);
    A.renderChrome();
    A.drafts.guard(() => A.setMonth(ym, true), { scope: 'month', sub: `Đổi sang ${A.monthLabel(ym)}` });
  };
  A.actions.month = el => askMonth(A.addMonths(S.month, Number(el.dataset.d)));
  A.inputs.month = el => askMonth(el.value);
  A.actions.logout = async () => {
    try {
      await A.api('POST', '/logout', {});
    } catch {
      /* đã hết phiên thì cũng về trang đăng nhập */
    }
    location.replace('/dang-nhap.html');
  };
  A.actions.reload = () => {
    A.refreshShell();
    A.loadView(S.view);
  };
})((window.Admin = window.Admin || {}));
