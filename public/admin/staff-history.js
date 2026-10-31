/* Lịch sử thay đổi của một nhân sự, đặt trong ngăn kéo Sửa hồ sơ của màn Nhân sự (view-ho-so.js gọi A.StaffHistory.mount).
   Đọc GET /api/employees/:uuid/trace?beforeId=&limit= (mới nhất trước, gộp cả dòng cũ ghi theo tài khoản), nút "Xem thêm" đi tiếp
   bằng beforeId = id dòng cuối đã hiện. Máy chủ không trả con trỏ hay tổng số, nên mỗi lần xin thừa một dòng: có dòng thừa
   mới hiện "Xem thêm" (dòng thừa không hiện, lần sau tải lại), tránh bấm "Xem thêm" mà không ra gì.
   Tên việc và tên trường dùng chung A.NhatKy.describe (view-nhat-ky.js) để hồ sơ và Nhật ký thay đổi nói cùng một chữ.
   Chỉ hiện khi người xem có năng lực audit.read; 403/404 thì ẩn cả khung, không báo lỗi (máy chủ là nơi quyết định quyền).
   Chỉ đọc, không tính gì. Mọi chuỗi từ API qua A.esc() trước khi vào innerHTML. */
(function (A) {
  'use strict';
  const { esc } = A;
  const PAGE_SIZE = 20; // số dòng hiện mỗi lần tải (xin PAGE_SIZE + 1); máy chủ tự cắt theo AUDIT_PAGE_MAX
  const UUID_RE = /^[0-9a-f-]{32,36}$/i; // chỉ để không gọi máy chủ với uuid trống hay hỏng; máy chủ vẫn kiểm

  const can = () => !!(A.meInfo && Array.isArray(A.meInfo.caps) && A.meInfo.caps.includes('audit.read'));
  const quiet = e => !!e && (e.status === 403 || e.status === 404);
  const nameOf = username => {
    const s = A.staff && A.staff.byUser && A.staff.byUser.get(username);
    return s ? s.name : '';
  };
  // view-nhat-ky.js chưa nạp (không nên xảy ra): vẫn hiện mã việc, không hiện trường để khỏi in dữ liệu thô
  const describe = row =>
    A.NhatKy && typeof A.NhatKy.describe === 'function'
      ? A.NhatKy.describe(row)
      : { action: String(row.action || ''), changes: '—', self: false, warnings: 0 };

  function itemHtml(r) {
    const d = describe(r);
    const nm = nameOf(r.actor);
    const who = r.actor ? esc(nm || r.actor) : '—';
    const marks =
      (d.self ? A.pill('pending', 'Tự thực hiện') : '') + (d.warnings ? A.pill('line', 'Lưu kèm cảnh báo') : '');
    // d.changes là HTML do A.NhatKy dựng, mọi giá trị trong đó đã qua esc()
    return `<li class="ns-hi"><div class="ns-hi-h"><b>${esc(d.action)}</b>${marks}<span class="ns-hi-m"><span class="num">${esc(A.fmtStamp(r.at))}</span> · ${who}</span></div>
<div class="ns-hi-c">${d.changes}</div>${r.reason ? `<div class="ns-hi-r">Lý do: ${esc(r.reason)}</div>` : ''}</li>`;
  }

  /* Gắn khung lịch sử vào box (phần tử có sẵn trong ngăn kéo). Mỗi lần mở ngăn kéo là một trạng thái riêng; ngăn kéo đã đóng thì
     kết quả về muộn bị bỏ qua. */
  function mount(box, uuid) {
    if (!box) return;
    if (!can() || !UUID_RE.test(String(uuid || ''))) {
      box.hidden = true;
      return;
    }
    const st = { items: [], next: null, busy: false, error: '', done: false };
    const paint = () => {
      if (!document.contains(box)) return;
      const body = box.querySelector('[data-hist-body]');
      const list = st.items.length ? `<ul class="ns-hl">${st.items.map(itemHtml).join('')}</ul>` : '';
      const empty = !st.items.length && st.done && !st.error ? '<span class="cap">Chưa có thay đổi nào.</span>' : '';
      const loading = st.busy
        ? '<div class="skel" style="width:60%"></div><div class="skel" style="width:80%"></div>'
        : '';
      const err = st.error
        ? `<div class="errbox" role="alert">${A.ic('alert', 16)}<span>${esc(st.error)}</span></div>`
        : '';
      // Lỗi thì nút "Thử lại" tải lại đúng trang hỏng (con trỏ next chưa đổi); còn dòng thì "Xem thêm"
      const more =
        !st.busy && (st.error || st.next !== null)
          ? `<div><button type="button" class="btn sm" data-hist-more>${st.error ? 'Thử lại' : 'Xem thêm'}</button></div>`
          : '';
      body.innerHTML = list + empty + (st.busy && st.items.length ? '' : loading) + err + more;
      body.setAttribute('aria-busy', st.busy ? 'true' : 'false');
    };
    const load = async () => {
      if (st.busy) return;
      st.busy = true;
      st.error = '';
      paint();
      try {
        const q = A.qs({ limit: PAGE_SIZE + 1, beforeId: st.next ?? undefined });
        const res = await A.api('GET', `/employees/${encodeURIComponent(uuid)}/trace${q}`);
        const got = Array.isArray(res && res.items) ? res.items : [];
        const items = got.slice(0, PAGE_SIZE);
        st.items.push(...items);
        const last = items[items.length - 1];
        st.next = got.length > PAGE_SIZE && last && last.id != null ? last.id : null;
        st.done = true;
      } catch (e) {
        if (quiet(e)) {
          box.hidden = true;
          return;
        }
        st.error = A.errText(e);
        st.done = true;
      } finally {
        st.busy = false;
      }
      paint();
    };
    box.hidden = false;
    box.innerHTML =
      '<div class="ns-grp-t" id="hs-hist-t">Lịch sử thay đổi</div><div class="ns-hb" data-hist-body aria-labelledby="hs-hist-t" aria-live="polite"></div>';
    box.addEventListener('click', ev => {
      if (ev.target.closest('[data-hist-more]')) load();
    });
    load();
  }

  A.StaffHistory = { mount };
})(window.Admin);
