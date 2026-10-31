/* Giao diện Nhân viên: Xin tạm ứng của tháng.
   Tạm ứng là số theo quy tắc do máy chủ tính (theo tham số advance.*); nhân sự không nhập số. CHỈ người cần mới bấm "Xin tạm ứng" (nút nằm ở danh sách
   nút tạo yêu cầu, yeu-cau.js gọi NV.advanceAction); Admin duyệt hoặc từ chối. Chỉ trừ vào thực nhận khi Admin đã duyệt; không xin thì không có tạm ứng.
   Yêu cầu đang chờ rút lại được. Máy chủ: GET /api/advance-approvals?month= (của mình: item { eligible, amount, status, note }, provisional),
   POST /api/advance-approvals/request | withdraw { month, expectedRev }. Giao diện không tính số nào: số và trạng thái ước tính do máy chủ trả.
   Không được ứng (hồ sơ tắt tạm ứng, chức vụ không được ứng) hoặc máy chủ chưa hỗ trợ: không hiện nút, không hiện thẻ.
   Mọi chuỗi từ dữ liệu đi qua esc() trước khi vào innerHTML. */
(function (NV) {
  'use strict';
  const { esc, S, L } = NV;
  const isNum = n => typeof n === 'number' && Number.isFinite(n);
  const vnd = n => (isNum(n) ? `${Number(n).toLocaleString('vi-VN', { maximumFractionDigits: 0 })} ₫` : '—');
  const monthName = month => L.monthLabel(month).replace('Tháng', 'tháng');
  const STATUSES = ['pending', 'approved', 'rejected'];

  /* ---------- dữ liệu ---------- */
  S.advance = {}; // { 'YYYY-MM': { status: 'loading' | 'ok' | 'error' | 'off', item, provisional, error } }
  NV.loadAdvance = async (month, force) => {
    if (NV.thay) return;
    const cur = S.advance[month];
    if (cur && cur.status === 'loading') return;
    if (cur && cur.status === 'ok' && !force && !cur.stale) return;
    S.advance[month] = { ...(cur || {}), status: cur && cur.item ? 'ok' : 'loading', error: '' };
    try {
      const data = await NV.api('GET', '/advance-approvals?month=' + encodeURIComponent(month));
      const it = data && data.item && typeof data.item === 'object' ? data.item : null;
      S.advance[month] = {
        status: 'ok',
        provisional: !!(data && data.provisional),
        item: it && {
          eligible: it.eligible !== false,
          amount: isNum(it.amount) ? it.amount : null,
          state: STATUSES.includes(it.status) ? it.status : null, // null = chưa xin
          rev: Number.isInteger(it.rev) ? it.rev : 0,
          note: typeof it.note === 'string' ? it.note : ''
        },
        error: ''
      };
    } catch (e) {
      // Máy chủ chưa có đường dẫn hoặc tài khoản không được xem: không hiện thẻ
      S.advance[month] =
        e && (e.status === 404 || e.status === 403)
          ? { status: 'off' }
          : { status: cur && cur.item ? 'ok' : 'error', ...(cur || {}), error: NV.errText(e) };
    }
  };
  const stateOf = month => S.advance[month] || null;
  const itemOf = month => {
    const a = stateOf(month);
    return a && a.status !== 'off' ? a.item : null;
  };

  /* ---------- nút "Xin tạm ứng" (cùng chỗ với các nút tạo yêu cầu) ---------- */
  // Chỉ khi được ứng và tháng này chưa có yêu cầu; số trên nút là số của máy chủ
  NV.advanceAction = month => {
    const it = itemOf(month);
    if (NV.thay || !S.payroll || !it || !it.eligible || it.state) return null;
    const a = stateOf(month);
    return {
      want: 'advance',
      icon: 'cash',
      label: 'Xin tạm ứng',
      sub: isNum(it.amount) ? `${vnd(it.amount)} cho ${monthName(month)}` : `Cho ${monthName(month)}`
    };
  };

  /* ---------- thẻ trạng thái ---------- */
  const RESULT = {
    pending: ['pending', 'Chờ Admin duyệt'],
    approved: ['done', 'Admin đã duyệt'],
    rejected: ['rejected', 'Admin từ chối']
  };
  // Nội dung chung của thẻ: số tạm ứng của máy chủ và trạng thái yêu cầu. Trả null khi không có gì để hiện (chưa xin thì nút ở danh sách nút là đủ).
  function inner(month) {
    const a = stateOf(month);
    if (!a || a.status === 'off') return null;
    if (a.status === 'loading' && !a.item) return `<div class="nv-pad">${NV.skeleton(2)}</div>`;
    if (a.status === 'error' && !a.item) return `<div class="nv-pad">${NV.errorBox(a.error, 'adv-reload')}</div>`;
    const it = a.item;
    if (!it || !it.state) return null;
    const [tone, text] = RESULT[it.state];
    const amountRow = `<div class="nv-kv"><span class="nv-k">Tạm ứng</span><span class="nv-v nv-num">${esc(vnd(it.amount))}</span></div>`;
    const statusRow = `<div class="nv-kv"><span class="nv-k">Trạng thái</span><span class="nv-v">${NV.pill(tone, text)}</span></div>`;
    const why =
      it.state === 'rejected'
        ? `<div class="nv-pad0 nv-gap"><div class="nv-rq-r">${it.note ? `Lý do: ${esc(it.note)}` : 'Admin chưa ghi lý do'}</div></div>`
        : '';
    const withdraw =
      it.state === 'pending'
        ? `<div class="nv-pad0 nv-gap"><button type="button" class="nv-btn is-sm is-outline" data-act="adv-withdraw" data-month="${esc(month)}">Rút yêu cầu</button></div>`
        : '';
    const note = NV.noteBox(
      'info',
      it.state === 'approved'
        ? 'Tạm ứng được trừ vào thực nhận của tháng này.'
        : 'Tạm ứng chỉ trừ vào thực nhận của tháng này khi Admin đã duyệt.'
    );
    return `${amountRow}${statusRow}${why}${withdraw}<div class="nv-pad0 nv-gap">${note}</div>`;
  }
  // Điện thoại (tab Yêu cầu)
  NV.advanceSection = month => {
    const body = inner(month);
    return body === null
      ? ''
      : `<section class="nv-sec" aria-label="Tạm ứng"><h2 class="nv-h2">Tạm ứng <small>${esc(monthName(month))}</small></h2><div class="nv-card">${body}</div></section>`;
  };
  // Máy tính: khối con trong thẻ Yêu cầu
  NV.advanceBlock = month => {
    const body = inner(month);
    return body === null
      ? ''
      : `<div class="nv-advblock" aria-label="Tạm ứng"><div class="nv-card-h"><h3>Tạm ứng</h3><span class="nv-cap">${esc(monthName(month))}</span></div>${body}</div>`;
  };

  /* ---------- biểu mẫu xác nhận (không có ô nhập số) ---------- */
  const F_ = { month: '', busy: false };
  function openForm(month) {
    const a = stateOf(month);
    const it = itemOf(month);
    if (!a || !it) return;
    F_.month = month;
    F_.busy = false;
    NV.openSheet({
      label: 'Xin tạm ứng',
      html: `<div class="nv-dh"><h2 tabindex="-1" data-autofocus>Xin tạm ứng</h2>${NV.pill('pending', 'Chờ Admin duyệt')}</div><p class="nv-dsub">${esc(`Cho ${monthName(month)}. Số tạm ứng theo quy định của công ty, chỉ trừ vào thực nhận của tháng này khi Admin duyệt.`)}</p>
<form class="nv-form" id="nv-adv-form" novalidate>
<div class="nv-kv"><span class="nv-k">Số tạm ứng</span><span class="nv-v nv-num">${esc(vnd(it.amount))}</span></div>
<div id="adv-err" role="alert" aria-live="assertive"></div>
<div class="nv-bt"><button type="button" class="nv-btn" data-act="adv-close">Huỷ</button><button type="submit" class="nv-btn is-pri" id="adv-send">Gửi yêu cầu</button></div></form>`,
      onMount: sheet => {
        sheet.querySelector('#nv-adv-form').addEventListener('submit', ev => {
          ev.preventDefault();
          send(sheet);
        });
      }
    });
  }
  async function send(sheet) {
    if (F_.busy) return;
    const it = itemOf(F_.month);
    const err = sheet.querySelector('#adv-err');
    const btn = sheet.querySelector('#adv-send');
    err.innerHTML = '';
    F_.busy = true;
    btn.disabled = true;
    btn.textContent = 'Đang gửi…';
    try {
      await NV.api('POST', '/advance-approvals/request', { month: F_.month, expectedRev: it ? it.rev : undefined });
    } catch (e) {
      F_.busy = false;
      btn.disabled = false;
      btn.textContent = 'Gửi yêu cầu';
      err.innerHTML = NV.noteBox('bad', NV.errText(e)); // câu của máy chủ, nguyên văn (noteBox tự esc)
      return;
    }
    F_.busy = false;
    await NV.loadAdvance(F_.month, true);
    NV.closeSheet();
    NV.render();
    NV.toast('Đã gửi yêu cầu tạm ứng. Chờ Admin duyệt.');
  }

  /* ---------- hành động ---------- */
  NV.actions['adv-open'] = el => openForm(el.dataset.month || S.month);
  NV.actions['adv-close'] = () => NV.closeSheet();
  NV.actions['adv-reload'] = async () => {
    await NV.loadAdvance(S.month, true);
    NV.render();
  };
  NV.actions['adv-withdraw'] = async el => {
    const month = el.dataset.month || S.month;
    const it = itemOf(month);
    el.disabled = true;
    try {
      await NV.api('POST', '/advance-approvals/withdraw', { month, expectedRev: it ? it.rev : undefined });
      NV.toast('Đã rút yêu cầu tạm ứng.');
    } catch (e) {
      NV.toast(NV.errText(e), 'err');
    }
    await NV.loadAdvance(month, true);
    NV.render();
  };
})(window.NV);
