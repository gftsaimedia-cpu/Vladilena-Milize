/* Sổ phép năm (Chấm công › Phép còn lại).
   Hộp "Sổ phép" của một người: GET /api/leave/ledger?user= → số dư tính đến ngày `on` và các lần cộng / hết hạn do máy chủ lưu
   (bảng leave_ledger). Nút "Cập nhật số phép": POST /api/leave/refresh {} tính lại cho mọi người rồi nạp lại danh sách nhân sự
   (số của tab Phép còn lại lấy từ GET /api/staff → leave). Giao diện không cộng trừ ngày phép nào: chỉ hiện đúng số máy chủ trả. */
(function (A) {
  'use strict';
  const { esc, nf, S } = A;

  // Nhãn từng loại dòng của sổ (lib/domain/leave/leave-events.js và leave-account-service.js)
  const KIND_LABEL = {
    start: 'Cộng khi vào làm',
    month: 'Tròn tháng làm việc',
    seniority: 'Thâm niên',
    birthday: 'Sinh nhật',
    expire: 'Hết hạn'
  };
  const kindLabel = kind => KIND_LABEL[kind] || String(kind || '—');
  // Số ngày đúng như máy chủ trả, kèm dấu: +1, −2 (nf đã có dấu trừ cho số âm)
  const signed = v => (Number(v) > 0 ? '+' : '') + nf(v);

  // Máy chủ vẫn kiểm năng lực; thiếu năng lực thì chỉ ẩn nút (cùng cách các màn khác đọc A.meInfo.caps)
  const caps = () => (A.meInfo && Array.isArray(A.meInfo.caps) ? A.meInfo.caps : null);
  const can = c => (caps() ? caps().includes(c) : true);

  function ledgerHtml(data) {
    if (!data.hasAccount) return A.empty('Người này không có tài khoản phép năm');
    // Máy chủ trả theo ngày tăng dần; hiện mới nhất trước (như thẻ Phép năm của nhân viên) để dòng gần đây không bị khuất dưới hộp cuộn
    const events = Array.isArray(data.events) ? data.events.slice().reverse() : [];
    const rows = events
      .map(
        e =>
          `<tr><td class="num" data-label="Ngày">${esc(A.fmtDate(e.onDate))}</td><td data-label="Nội dung">${esc(kindLabel(e.kind))}</td><td class="num r${Number(e.days) < 0 ? ' cc-neg' : ''}" data-label="Số ngày">${esc(signed(e.days))}</td></tr>`
      )
      .join('');
    const head = `<div class="cc-kv4"><div><span>Còn lại</span><b class="num">${esc(nf(data.balance))} ngày</b></div><div><span>Tính đến</span><b class="num">${esc(A.fmtDate(data.on))}</b></div></div>`;
    const table = rows
      ? `<div class="tblwrap cc-lgw"><table class="rtable cc-t cc-lg"><thead><tr><th scope="col">Ngày</th><th scope="col">Nội dung</th><th scope="col" class="r">Số ngày</th></tr></thead><tbody>${rows}</tbody></table></div>`
      : A.empty('Sổ phép chưa có dòng nào');
    return head + table;
  }

  // Mở hộp ngay với khung chờ, rồi điền khi máy chủ trả; lỗi hiện nguyên văn trong hộp
  function open(username) {
    const staff = A.staff.byUser.get(username);
    const name = (staff && staff.name) || username;
    const dlg = A.openDialog({
      title: `Sổ phép · ${name}`,
      cls: 'cc-lgdlg',
      body: `<div class="tblwrap cc-lgw"><table class="cc-t cc-lg"><tbody>${A.skelRows(3, 4)}</tbody></table></div>`,
      foot: [{ label: 'Đóng' }]
    });
    A.api('GET', '/leave/ledger' + A.qs({ user: username })).then(
      data => {
        if (!document.contains(dlg.root)) return; // hộp đã đóng hoặc đã mở hộp khác
        dlg.root.querySelector('#dlg-body').innerHTML = ledgerHtml(data || {});
      },
      e => {
        if (!document.contains(dlg.root)) return;
        dlg.root.querySelector('#dlg-body').innerHTML = '';
        dlg.error(A.errText(e));
      }
    );
    return dlg;
  }

  // Nút ở dòng của bảng Phép còn lại (view-cham-cong.js gọi khi vẽ)
  const rowButton = s =>
    `<button type="button" class="btn sm ghost cc-lbtn" data-act="ccledger" data-u="${esc(s.username)}" aria-label="Sổ phép của ${esc(s.name || s.username)}">Sổ phép</button>`;

  // Nút ở đầu thẻ Phép còn lại (cả khung .end của card-h): chỉ với năng lực profile.write (POST /api/leave/refresh)
  let refreshing = false;
  const refreshButton = () =>
    can('profile.write')
      ? `<span class="end"><button type="button" class="btn sm" data-act="ccleaverefresh" ${refreshing ? 'disabled' : ''}>${A.ic('refresh', 16)}${refreshing ? 'Đang cập nhật…' : 'Cập nhật số phép'}</button></span>`
      : '';
  const repaint = () => S.view === 'cham-cong' && A.render();

  async function refreshAll() {
    if (refreshing) return;
    refreshing = true;
    repaint();
    try {
      const res = (await A.api('POST', '/leave/refresh', {})) || {};
      const failed = Number(res.failed) || 0;
      // Báo số người có tài khoản phép (accounts), không phải mọi hồ sơ đã xét (checked)
      A.toast(
        `Đã cập nhật số phép: ${nf(res.accounts)} người${failed ? ` · ${nf(failed)} người không tính được` : ''}`,
        failed ? 'warn' : undefined
      );
      await A.loadStaff(true);
    } catch (e) {
      A.toast(A.errText(e), 'err');
      if (e && e.status === 409) await A.loadStaff(true); // dữ liệu đã đổi ở nơi khác: nạp lại số mới
    } finally {
      refreshing = false;
      repaint();
    }
  }

  A.actions.ccledger = el => open(el.dataset.u);
  A.actions.ccleaverefresh = () => refreshAll();
  A.LeaveLedger = { open, rowButton, refreshButton, refresh: refreshAll };
})(window.Admin);
