/* Giao diện Admin: khởi động. Chưa đăng nhập hoặc không phải Admin thì về trang chính. */
(function (A) {
  'use strict';
  const S = A.S;

  A.refreshMe = async () => {
    const res = await fetch('/api/me', { credentials: 'same-origin' });
    const data = await res.json();
    A.meInfo = data;
    A.syncClock(data); // ngày "hôm nay" và tháng mặc định theo giờ máy chủ (trước khi boot() chọn tháng)
    return data;
  };

  async function boot() {
    let data;
    try {
      data = await A.refreshMe();
    } catch {
      document.getElementById('view').innerHTML = A.errorBox('Không kết nối được máy chủ.', false);
      return;
    }
    if (!data || !data.user) {
      location.replace(window.HomeRoute.LOGIN_PAGE);
      return;
    }
    if (!window.HomeRoute.adminCapable(data)) {
      location.replace('/nhan-vien.html'); // tài khoản nhân viên: sang giao diện nhân viên
      return;
    }
    S.me = data.user;
    const saved = A.store.get('month');
    S.month = saved && /^\d{4}-(0[1-9]|1[0-2])$/.test(saved) ? saved : A.vnToday().slice(0, 7);
    const [key, sub] = location.hash.replace(/^#/, '').split('/');
    A.go(key || 'tong-quan', sub);
    A.shiftsLoad(S.month).then(changed => changed && A.render());
    A.refreshShell();
    startLive();
  }

  /* Cập nhật trực tiếp (A.live, GET /api/events). Máy chủ chưa có đường dẫn thì không có gì xảy ra.
     Đang mở hộp thoại thì chỉ cập nhật số đếm, không tải lại màn dưới chân người dùng. */
  function startLive() {
    /* Hộp thoại đang mở thì không tải lại màn dưới chân người dùng: nhớ lại và nạp khi hộp đóng */
    let deferred = false;
    const closeDialog = A.closeDialog;
    A.closeDialog = () => {
      closeDialog();
      if (deferred) {
        deferred = false;
        A.loadView(S.view);
      }
    };
    const reload = (keys, payload) => {
      A.refreshShell();
      if (payload && payload.month && payload.month !== S.month) return; // đổi ở tháng khác: màn này không đổi
      if (!keys.includes(S.view)) return;
      if (A.dialogOpen) deferred = true;
      else A.loadView(S.view);
    };
    A.live.on('approvals.changed', p => reload(['duyet', 'tong-quan'], p));
    A.live.on('period.changed', p => reload(['luong', 'tong-quan', 'cham-cong'], p));
    /* attendance.changed (kind: punch | forgot | ot | explanation; lib/events.js): MỖI lượt bấm Check-in/out của cả công ty gửi một tin,
       sáng sớm có thể hàng trăm tin. Màn đang mở là Chấm công (tab Bảng công, Hôm nay, Giờ OT) hoặc Tổng quan thì nạp lại,
       nhưng gộp tin: tối đa một lần nạp cho mỗi khoảng ATTENDANCE_RELOAD_MS, và không bao giờ hai lần nạp chồng nhau.
       - Màn khác đang mở: chỉ cập nhật số đếm (chuông). Không cần cờ "cần nạp": mở màn (A.go) và đổi tab luôn nạp lại từ máy chủ.
       - Hộp thoại đang mở: hoãn tới khi đóng (deferred ở trên).
       - Trình duyệt đang ẩn (tab khác, máy khoá): chờ đến khi người dùng quay lại rồi mới nạp. */
    /* Khoảng gộp, tính từ lúc lần nạp trước XONG (máy chủ một luồng: trong lúc nạp, Check-in của nhân viên phải đợi).
       Đo trên DB demo 70 người, dữ liệu 07–11/2026: GET /api/attendance 0,67 s và 2,3 MB, GET /api/team 0,71 s, GET /api/periods/:tháng 0,56 s;
       ở 1.071 người /api/attendance mất 137 s và chặn cả máy chủ.
       Với khoảng này, một Admin để mở Bảng công lúc cao điểm giữ máy chủ bận chưa tới một phần mười thời gian (demo 70 người,
       nạp do tin không gọi lại /api/team). Là lựa chọn giao diện, không phải tham số nghiệp vụ; muốn nhanh hơn thì phải làm nhẹ
       /api/attendance trước. */
    const ATTENDANCE_RELOAD_MS = 10000;
    const ATT_VIEWS = ['cham-cong', 'tong-quan'];
    const LIVE_TABS = ['bang', 'hom-nay', 'ot']; // tab Chấm công có số đổi theo lượt bấm (Ca làm, Phép còn lại thì không)
    let attTimer = null,
      attLast = 0, // lúc lần nạp gần nhất của màn chấm công / tổng quan xong
      attWaiting = false, // có tin chưa được lần nạp nào phủ
      attBusy = 0; // số lần nạp màn chấm công / tổng quan đang chạy
    const ccTab = () => S.sub.cc || 'bang';
    const attendanceVisible = () => S.view === 'tong-quan' || (S.view === 'cham-cong' && LIVE_TABS.includes(ccTab()));
    /* Mọi lần nạp màn Chấm công / Tổng quan (mở màn, đổi tab, đổi tháng, sau khi lưu, nạp do tin) đều phủ các tin đã đến trước đó:
       ghi lại để không nạp thêm lần nữa ngay sau, và để không có hai lần nạp chồng nhau */
    const loadViewBase = A.loadView;
    A.loadView = key => {
      const run = loadViewBase(key);
      if (!ATT_VIEWS.includes(key)) return run;
      attWaiting = false;
      attBusy++;
      return run.finally(() => {
        attBusy--;
        attLast = Date.now();
        if (attWaiting) attendanceSchedule();
      });
    };
    function attendanceFlush() {
      attTimer = null;
      if (!attWaiting || attBusy) return; // đã có lần nạp phủ, hoặc lần nạp đang chạy sẽ hẹn lại khi xong
      if (document.hidden) return; // visibilitychange hẹn lại khi người dùng quay về
      A.refreshShell(); // chuông: quên Check-in/out của tháng
      if (!attendanceVisible()) {
        attWaiting = false;
        attLast = Date.now();
        return;
      }
      if (A.dialogOpen) {
        attWaiting = false;
        deferred = true;
        return;
      }
      // Chấm công có cách nạp nhẹ hơn cho tin (view.live, vẫn đi qua A.loadView); màn khác nạp như khi mở
      const v = A.views[S.view];
      if (v && v.live) v.live();
      else A.loadView(S.view);
    }
    function attendanceSchedule() {
      if (attTimer || attBusy) return;
      attTimer = setTimeout(attendanceFlush, Math.max(0, attLast + ATTENDANCE_RELOAD_MS - Date.now()));
    }
    A.live.on('attendance.changed', p => {
      // Lượt của tháng khác không đổi màn đang xem; riêng tab Hôm nay luôn theo ngày hôm nay, tháng nào cũng nhận
      const todayTab = S.view === 'cham-cong' && ccTab() === 'hom-nay';
      if (p && p.month && p.month !== S.month && !todayTab) return;
      attWaiting = true;
      attendanceSchedule();
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && attWaiting) attendanceSchedule();
    });
    /* Lưu bất kỳ cài đặt nào (tham số, giờ ca, ngày lễ, công tắc): máy chủ phát params.changed cho mọi người, kể cả người vừa lưu.
       Nạp lại thông tin chung (ngày lễ, ngày bật Check-in), tên bậc và chức vụ, kỳ lương (ép nạp lại, vì số ước tính đã đổi),
       kết quả AI, rồi màn đang xem nếu là màn có dùng các số này. Màn Cài đặt tự xử lý ô đang sửa dở (A.Params.remoteChanged). */
    A.live.on('params.changed', () => {
      A.refreshMe().catch(() => {});
      A.shiftsLoad(S.month).then(changed => changed && A.render());
      A.loadAi(true);
      const period = A.Ky && A.Ky.load ? Promise.resolve(A.Ky.load(true)).catch(() => {}) : Promise.resolve();
      period.then(() => reload(['tong-quan', 'luong', 'cham-cong', 'ho-so', 'kpi', 'tro-ly', 'duyet'], null));
    });
    /* resync: mất kết nối rồi nối lại, tin có thể đã lỡ: nạp lại số đếm, màn đang xem và tham số */
    A.live.on('resync', () => {
      A.refreshShell();
      A.refreshMe().catch(() => {});
      A.levelNames.refresh();
      A.shiftsLoad(S.month).then(changed => changed && A.render());
      if (A.dialogOpen) deferred = true;
      else A.loadView(S.view);
      if (A.Params && A.Params.remoteChanged) A.Params.remoteChanged(null);
    });
    A.live.start();
  }
  boot();
})(window.Admin);
