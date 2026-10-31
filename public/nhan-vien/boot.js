/* Giao diện Nhân viên: khởi động. Chưa đăng nhập về trang chính; Admin sang admin.html.
   Ngoại lệ: nhan-vien.html?thay=<tên>&month=YYYY-MM của người có quyền duyệt (request.decide.*) mở chế độ khai lịch thay (thay.js),
   không chuyển sang admin.html. Sau lần vẽ đầu mở luồng cập nhật trực tiếp (live.js). */
(function (NV) {
  'use strict';
  const { S } = NV;
  const root = () => document.getElementById('nv-root');

  async function boot() {
    let data;
    try {
      const res = await fetch('/api/me', { credentials: 'same-origin' });
      data = await res.json();
    } catch {
      root().innerHTML = `<div class="nv-page">${NV.errorBox('Không kết nối được máy chủ.', 'reload-page')}</div>`;
      return;
    }
    if (!data || !data.user) return location.replace(window.HomeRoute.LOGIN_PAGE);
    NV.syncClock(data);
    const req = NV.thayRequest(data);
    const thay = !!req && NV.canThay(data);
    if (req && !thay && !window.HomeRoute.adminCapable(data)) NV.dropThayParams(); // không có quyền: trang của chính mình
    if (!thay && window.HomeRoute.adminCapable(data)) return location.replace('/admin.html');
    if (thay) {
      if (!(await NV.prepareThay(data, req))) return; // không có người này: đã hiện lỗi kèm nút về Admin
    } else {
      S.me = data.user;
      NV.applyMe(data);
    }

    const mq = window.matchMedia('(min-width: 1024px)');
    S.desktop = mq.matches;
    mq.addEventListener('change', e => {
      S.desktop = e.matches;
      NV.closeSheet(true);
      NV.render();
    });

    if (!thay) S.month = NV.curMonth(); // luôn mở ở tháng hiện tại, không nhớ tháng đã xem; khai thay mở đúng tháng trong địa chỉ
    S.sel = NV.defaultSel(S.month);
    S.selAuto = true; // máy tính: chưa bấm ngày nào thì ô dưới lịch tự chọn hôm nay (hoặc ngày thiếu chấm gần nhất)
    const hash = NV.viewOf(location.hash.replace(/^#/, ''));
    S.view = NV.allowedViews().includes(hash) ? hash : NV.allowedViews()[0];
    NV.initTick();
    NV.render();

    let jobs;
    if (thay) jobs = [NV.loadMonth(S.month).then(NV.render), NV.loadEstimate(S.month).then(NV.render)];
    else {
      // Nạp song song: trạng thái chấm công, tháng hiện tại, và tháng đang xem nếu khác
      jobs = [NV.loadPunch().then(NV.render), NV.loadMonth(NV.curMonth()).then(NV.render)];
      if (S.month !== NV.curMonth()) jobs.push(NV.loadMonth(S.month).then(NV.render));
      jobs.push(NV.loadEstimate(NV.curMonth()).then(NV.render));
      jobs.push(NV.loadAdvance(S.month).then(NV.render));
      if (S.month !== NV.curMonth()) jobs.push(NV.loadEstimate(S.month).then(NV.render));
    }
    await Promise.all(jobs);
    NV.render();
    NV.live.start();
  }
  NV.actions['reload-page'] = () => location.reload();
  boot();
})(window.NV);
