/* Giao diện Nhân viên: cập nhật trực tiếp (SSE GET /api/events).
   Chép cách làm của public/admin/core.js → A.live: bọc EventSource, tự nối lại; hello (máy chủ khởi động lại thì nạp lại), resync (nối lại sau
   khi mất kết nối: nạp lại hết), bye (phiên đóng: hỏi lại /api/me, hết đăng nhập thì về trang đăng nhập; superseded thì dừng hẳn).
   Tin chỉ là GỢI Ý NẠP LẠI (lib/events.js): không mang số để vẽ, có thể mất hoặc lặp. Các tin đến sát nhau được gộp thành MỘT lần nạp
   (mỗi phần chỉ nạp một lần), và chỉ nạp tháng đang xem; tháng khác chỉ đánh dấu cũ để nạp khi mở.
   Tin của chính nhân sự: punch.changed, punch.corrected { month, date } → thẻ chấm công hôm nay và lịch tháng; request.decided
   { month, date, decision } → lịch, yêu cầu, số ước tính; estimate.changed { month } → số ước tính (kèm lịch: máy chủ phát tin này cả khi
   Admin khai thay); payslip.available { month }, period.changed { month, stage } → thu nhập, phiếu; params.changed → hết;
   roles.changed → đọc lại /api/me. Khai thay (Admin xem lịch người khác): approvals.changed, attendance.changed { month } → lịch và số
   ước tính của tháng đang khai.
   Đang mở khay, hộp thoại hoặc đang gõ trong biểu mẫu: vẫn nạp số mới nhưng hoãn vẽ, vẽ khi đóng khay hoặc rời ô nhập. */
(function (NV) {
  'use strict';
  const { S, L } = NV;
  const LIVE = {
    path: '/api/events',
    retryMs: 4000, // chờ giữa hai lần nối lại khi máy chủ từ chối hẳn (nhân theo số lần hỏng liên tiếp)
    maxFails: 3, // số lần nối lại liên tiếp thất bại thì bỏ cuộc (trang vẫn nạp lại khi quay về tab)
    coalesceMs: 400, // gộp các tin đến sát nhau thành một lần nạp; tính từ tin đầu tiên, không dời theo tin sau
    busyRetryMs: 600, // đang bấm Check-in/out: chờ xong rồi mới nạp, để không đè trạng thái vừa nhận
    deferPollMs: 1000, // đang gõ: hỏi lại sau mỗi khoảng này xem đã rời ô nhập chưa
    stopReasons: ['superseded'] // tab khác của cùng người đã nhận luồng: nối lại chỉ gây giành nhau
  };

  /* ---------- vẽ: hoãn khi đang mở khay hoặc đang gõ ---------- */
  let pendingRender = false,
    pollTimer = null;
  const typing = () => {
    const root = document.getElementById('nv-root');
    const ae = document.activeElement;
    if (!root || !ae || !root.contains(ae)) return false;
    return /^(INPUT|SELECT|TEXTAREA)$/.test(ae.tagName) || !!ae.closest('form');
  };
  const busyUi = () => NV.sheetOpen || typing();
  function flushRender() {
    if (!pendingRender || busyUi()) return;
    pendingRender = false;
    clearInterval(pollTimer);
    pollTimer = null;
    NV.render();
  }
  NV.liveRender = () => {
    if (!busyUi()) {
      pendingRender = false;
      return NV.render();
    }
    pendingRender = true;
    if (!pollTimer) pollTimer = setInterval(flushRender, LIVE.deferPollMs);
  };
  // Đóng khay: vẽ ngay phần đã hoãn
  const closeSheet = NV.closeSheet;
  NV.closeSheet = quiet => {
    closeSheet(quiet);
    flushRender();
  };

  /* ---------- gộp tin thành một lần nạp ---------- */
  const plan = () => ({
    all: false,
    me: false,
    punch: false,
    sheets: new Set(),
    estimates: new Set(),
    advance: new Set(),
    toast: ''
  });
  let want = plan(),
    timer = null;
  // Tháng đang hiện: tháng của lịch (S.month); nhân sự còn có tháng hiện tại (thẻ Hôm nay, Check-in/out)
  const viewed = month => month === S.month || (!NV.thay && month === NV.curMonth());
  const monthOf = p => (p && typeof p.month === 'string' && /^\d{4}-\d{2}$/.test(p.month) ? p.month : null);
  function mark(p, { sheet = false, estimate = false, advance = false } = {}) {
    const month = monthOf(p);
    const targets = month ? [month] : [S.month];
    for (const m of targets) {
      if (!viewed(m)) {
        NV.markStale(m);
        continue;
      }
      if (sheet) want.sheets.add(m);
      if (estimate) want.estimates.add(m);
      if (advance) want.advance.add(m);
    }
  }
  function schedule() {
    if (!timer) timer = setTimeout(flush, LIVE.coalesceMs);
  }
  async function flush() {
    timer = null;
    if (S.busy) {
      timer = setTimeout(flush, LIVE.busyRetryMs);
      return;
    }
    const w = want;
    want = plan();
    if (w.all) await NV.reloadData();
    else {
      const jobs = [];
      if (w.me) jobs.push(NV.loadMe());
      if (w.punch) jobs.push(NV.loadPunch());
      for (const m of w.sheets) jobs.push(NV.loadMonth(m, true));
      for (const m of w.estimates) jobs.push(NV.loadEstimate(m, true));
      for (const m of w.advance) jobs.push(NV.loadAdvance(m, true));
      await Promise.all(jobs);
      if (!jobs.length) {
        if (w.toast) NV.toast(w.toast); // tin của tháng không đang xem: chỉ báo, nạp khi mở tháng đó
        return;
      }
    }
    NV.liveRender();
    if (w.toast) NV.toast(w.toast);
  }
  const handlers = new Map(); // tên sự kiện → hàm ghi phần cần nạp vào `want`
  const on = (name, fn) => handlers.set(name, fn);

  /* ---------- tin của chính nhân sự ---------- */
  const punchLike = p => {
    want.punch = true; // trạng thái Check-in/out là của hiện tại, không theo tháng
    mark(p, { sheet: true });
  };
  on('punch.changed', punchLike);
  on('punch.corrected', punchLike);
  on('request.decided', p => {
    // Duyệt / huỷ duyệt tạm ứng (không có ngày) cũng đi qua tin này: nạp lại thẻ tạm ứng, số ước tính đổi theo
    mark(p, { sheet: true, estimate: true, advance: true });
    const date = p && L.isDate(p.date) ? L.dm(p.date) : '';
    if (NV.thay) return;
    const isAdvance =
      !!p &&
      (p.kind === 'advance' || p.type === 'advance' || p.item === 'advance' || (!date && p.amount !== undefined));
    if (isAdvance)
      want.toast =
        p.decision === 'approved' || p.decision === 'approve'
          ? 'Admin đã duyệt tạm ứng tháng này của bạn.'
          : p.decision === 'cancelled'
            ? 'Admin đã huỷ duyệt tạm ứng của bạn.'
            : 'Admin đã cập nhật tạm ứng của bạn.';
    else
      want.toast =
        p && p.decision === 'approved'
          ? `Admin đã đồng ý yêu cầu${date ? ` ngày ${date}` : ''}.`
          : p && p.decision === 'rejected'
            ? `Admin đã từ chối yêu cầu${date ? ` ngày ${date}` : ''}.`
            : 'Admin đã xử lý yêu cầu của bạn.';
  });
  on('estimate.changed', p => mark(p, { sheet: true, estimate: true, advance: true }));
  on('payslip.available', p => mark(p, { estimate: true }));
  on('period.changed', p => mark(p, { estimate: true }));
  on('params.changed', () => (want.all = true));
  on('roles.changed', () => (want.me = true));
  /* ---------- khai thay: Admin nhận tin hàng đợi, không nhận tin của người được khai ---------- */
  const queueLike = p => {
    if (NV.thay) mark(p, { sheet: true, estimate: true });
  };
  on('approvals.changed', queueLike);
  on('attendance.changed', queueLike);
  on('resync', () => (want.all = true));

  function dispatch(name, payload) {
    const fn = handlers.get(name);
    if (!fn) return;
    try {
      fn(payload);
    } catch (e) {
      console.error('live', name, e);
      return;
    }
    schedule();
  }

  /* ---------- kết nối ---------- */
  NV.live = (() => {
    let es = null,
      fails = 0,
      started = false,
      gaveUp = false,
      retryTimer = null,
      epoch = null;
    const parse = ev => {
      try {
        return ev && ev.data ? JSON.parse(ev.data) : null;
      } catch {
        return null; // dữ liệu không phải JSON: vẫn coi là có tin
      }
    };
    const scheduleReconnect = () => {
      if (++fails >= LIVE.maxFails) {
        gaveUp = true;
        return;
      }
      clearTimeout(retryTimer);
      retryTimer = setTimeout(connect, LIVE.retryMs * fails);
    };
    /* bye { reason: session | password | logout | locked ... }: phiên cũ bị đóng. Trình duyệt vừa đổi mật khẩu có cookie mới nên vẫn đăng nhập:
       hỏi /api/me trước, còn đăng nhập thì nối lại (loadMe tự chuyển trang nếu vai trò đã đổi), hết thì về trang đăng nhập. */
    async function recheckSession() {
      let data = null;
      try {
        const res = await fetch('/api/me', { credentials: 'same-origin' });
        data = await res.json();
      } catch {
        scheduleReconnect(); // lỗi mạng: thử nối lại, chưa kết luận gì về phiên
        return;
      }
      if (!data || !data.user) return location.replace(window.HomeRoute.LOGIN_PAGE);
      want.me = true;
      schedule();
      fails = 0;
      clearTimeout(retryTimer);
      retryTimer = setTimeout(connect, LIVE.retryMs);
    }
    function connect() {
      if (!started || gaveUp || es || typeof EventSource === 'undefined') return;
      try {
        es = new EventSource(LIVE.path, { withCredentials: true });
      } catch {
        gaveUp = true;
        return;
      }
      for (const name of handlers.keys())
        if (name !== 'resync') es.addEventListener(name, ev => dispatch(name, parse(ev)));
      es.addEventListener('open', () => (fails = 0));
      // hello: máy chủ khởi động lại (epoch khác) thì nạp lại, vì có thể đã lỡ tin
      es.addEventListener('hello', ev => {
        const d = parse(ev) || {};
        if (epoch !== null && d.epoch !== undefined && d.epoch !== epoch) dispatch('resync', null);
        if (d.epoch !== undefined) epoch = d.epoch;
      });
      // resync: nối lại sau khi mất kết nối; máy chủ không phát lại tin lỡ nên nạp lại hết
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
      start() {
        started = true;
        connect();
      },
      get active() {
        return !!es && es.readyState === 1;
      }
    };
  })();
})(window.NV);
