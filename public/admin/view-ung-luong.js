/* Yêu cầu tạm ứng của tháng trên màn Yêu cầu của Admin.
   Tạm ứng là số theo quy tắc do máy chủ tính (theo tham số advance.*); nhân sự không nhập số. CHỈ người cần mới bấm "Xin tạm ứng", nên thẻ chỉ
   có dòng của người đã xin (chờ duyệt, đã duyệt, từ chối); không liệt kê người được ứng mà chưa xin (trông như yêu cầu tự gửi).
   Số chỉ trừ vào phiếu khi Admin duyệt. Nút: Duyệt / Từ chối cho yêu cầu chờ, Huỷ duyệt cho yêu cầu đã duyệt, Duyệt tất cả khi còn yêu cầu chờ.
   Gọi máy chủ: GET /api/advance-approvals?month=, POST /api/advance-approvals/approve | reject | cancel { month, username, expectedRev, reason? },
   POST /api/advance-approvals/approve-all { month, expectedRev }. Màn Yêu cầu (view-duyet.js) gọi A.UngLuong.load() cùng lúc với danh sách
   yêu cầu và A.UngLuong.render() để chèn thẻ này; tin approvals.changed làm màn nạp lại cả hai. Giao diện không tính số tiền nào: số và
   trạng thái ước tính đều do máy chủ trả. Mọi chuỗi từ API qua esc() trước khi vào innerHTML. */
(function (A) {
  'use strict';
  const { esc, nf, ic, S } = A;
  const PAGE = 'duyet';
  const U = {
    loading: false,
    error: null,
    rows: [],
    month: null,
    rev: 0,
    provisional: false,
    token: 0,
    busy: new Set(),
    unavailable: false
  };
  // Trạng thái của máy chủ → thẻ kết quả; khoá trùng với tab trạng thái của màn Yêu cầu (pending / approved / rejected)
  const RESULT = Object.freeze({
    pending: ['pending', 'Chờ duyệt'],
    approved: ['done', 'Đã duyệt'],
    rejected: ['rejected', 'Từ chối']
  });

  const isNum = n => typeof n === 'number' && Number.isFinite(n);
  const money = n => (isNum(n) ? `${nf(n)} ₫` : '—');
  const status = () => S.f.dst || 'pending';
  const sentence = t => (/[.!?…]$/.test(t) ? t : t + '.');
  const str = v => (typeof v === 'string' ? v : '');

  const norm = r => ({
    username: String(r.username || ''),
    name: typeof r.name === 'string' && r.name.trim() ? r.name.trim() : String(r.username || ''),
    amount: isNum(r.amount) ? r.amount : null,
    status: Object.hasOwn(RESULT, r.status) ? r.status : 'pending',
    rev: Number.isInteger(r.rev) ? r.rev : 0,
    requestedAt: str(r.requestedAt),
    decidedBy: str(r.decidedBy),
    decidedAt: str(r.decidedAt),
    note: str(r.note)
  });

  function load() {
    const token = ++U.token;
    const month = S.month;
    U.loading = true;
    return A.api('GET', '/advance-approvals' + A.qs({ month }))
      .then(res => {
        if (token !== U.token) return;
        U.rows = (res && Array.isArray(res.items) ? res.items : []).filter(r => r && typeof r === 'object').map(norm);
        U.rev = res && Number.isInteger(res.rev) ? res.rev : 0;
        U.provisional = !!(res && res.provisional);
        U.month = month;
        U.error = null;
        U.unavailable = false;
      })
      .catch(e => {
        if (token !== U.token) return;
        U.rows = [];
        U.month = month;
        // Máy chủ chưa có đường dẫn hoặc tài khoản không có quyền duyệt: không hiện thẻ, không báo lỗi giữa màn
        U.unavailable = !!e && (e.status === 404 || e.status === 403);
        U.error = U.unavailable ? null : A.errText(e);
      })
      .finally(() => {
        if (token === U.token) U.loading = false;
      });
  }

  /* ---------- gửi ---------- */
  async function run(key, fn) {
    if (U.busy.has(key)) return;
    U.busy.add(key);
    A.render();
    try {
      await fn();
    } catch (e) {
      A.toast(A.errText(e), 'err');
    } finally {
      U.busy.delete(key);
      await load();
      A.refreshShell();
      A.render();
    }
  }
  const find = username => U.rows.find(r => r.username === username);

  A.actions.ulapprove = el => {
    const r = find(el.dataset.u);
    if (!r) return;
    return run(r.username, async () => {
      await A.api('POST', '/advance-approvals/approve', { month: U.month, username: r.username, expectedRev: r.rev });
      A.toast(`Đã duyệt tạm ứng cho ${r.name}`);
    });
  };
  // Từ chối và huỷ duyệt: hộp xác nhận có ô lý do không bắt buộc
  function decideWithReason(el, { step, title, label, done }) {
    const r = find(el.dataset.u);
    if (!r || U.busy.has(r.username)) return;
    A.confirmDialog({
      title,
      sub: `${r.name} · ${money(r.amount)} · ${A.monthLabel(U.month)}`,
      body: A.reasonField('ul-note', 'Lý do (không bắt buộc)'),
      label,
      cls: 'danger',
      onConfirm: async () => {
        const noteEl = document.getElementById('ul-note');
        const reason = noteEl ? noteEl.value.trim() : '';
        await run(r.username, async () => {
          await A.api('POST', `/advance-approvals/${step}`, {
            month: U.month,
            username: r.username,
            expectedRev: r.rev,
            ...(reason ? { reason } : {})
          });
          A.toast(`${done} ${r.name}`);
        });
      }
    });
  }
  A.actions.ulreject = el =>
    decideWithReason(el, {
      step: 'reject',
      title: 'Từ chối tạm ứng',
      label: 'Từ chối',
      done: 'Đã từ chối tạm ứng của'
    });
  A.actions.ulcancel = el =>
    decideWithReason(el, {
      step: 'cancel',
      title: 'Huỷ duyệt tạm ứng',
      label: 'Huỷ duyệt',
      done: 'Đã huỷ duyệt tạm ứng của'
    });
  A.actions.ulapproveall = () =>
    run('*', async () => {
      const res = await A.api('POST', '/advance-approvals/approve-all', { month: U.month, expectedRev: U.rev });
      const n = res && Array.isArray(res.approved) ? res.approved.length : 0;
      A.toast(n ? `Đã duyệt tạm ứng cho ${nf(n)} người` : 'Không còn yêu cầu tạm ứng nào chờ duyệt');
    });

  /* ---------- vẽ ---------- */
  function staffSub(r) {
    const s = A.staff && A.staff.byUser && A.staff.byUser.get(r.username);
    const parts = s ? [A.typeShort(s), A.levelLabel(s, U.month || S.month)] : [r.username];
    return parts.filter(x => x && x !== '—').join(' · ');
  }
  const stamp = iso => (iso ? ` lúc <span class="yc-nw">${esc(A.fmtStamp(iso))}</span>` : '');
  function detailHtml(r) {
    const sent = r.requestedAt ? `<div class="ks">Gửi${stamp(r.requestedAt)}</div>` : '';
    if (r.status === 'pending') return sent;
    const verb = r.status === 'approved' ? 'Duyệt' : 'Từ chối';
    const note = r.note ? `<div class="ks">Lý do: ${esc(r.note)}</div>` : '';
    return `${sent}<div class="ks">${verb} bởi ${esc(r.decidedBy || '—')}${stamp(r.decidedAt)}</div>${note}`;
  }
  // Kỳ đã duyệt / đã chi trả (theo thanh kỳ lương đã nạp): phiếu đã chốt, không hiện nút; máy chủ vẫn tự chặn (409 PERIOD_LOCKED)
  const LOCKED = Object.freeze(['approved', 'paid']);
  const locked = () => {
    const p = S.period;
    return !!(p && p.month === U.month && p.data && LOCKED.includes(p.data.status));
  };
  function actHtml(r, busy) {
    if (locked()) return '';
    const u = esc(r.username);
    if (r.status === 'pending')
      return `<div class="row" style="gap:8px"><button class="btn sm" type="button" data-act="ulapprove" data-u="${u}" ${busy}>Duyệt</button><button type="button" class="yc-tact" data-act="ulreject" data-u="${u}" ${busy}>Từ chối</button></div>`;
    if (r.status === 'approved')
      return `<button type="button" class="yc-tact" data-act="ulcancel" data-u="${u}" ${busy}>Huỷ duyệt</button>`;
    return '';
  }
  function rowHtml(r) {
    const busy = U.busy.has(r.username) || U.busy.has('*') ? 'disabled aria-busy="true"' : '';
    const [tone, text] = RESULT[r.status];
    const detail = detailHtml(r);
    return `<tr>
<td class="who"><div class="yc-who">${A.avatar(r.name)}<div class="yc-who-t"><div class="t" title="${esc(r.username)}">${esc(r.name)}</div><div class="s">${esc(staffSub(r))}</div></div></div></td>
<td data-label="Loại yêu cầu"><div class="yc-cell"><div class="k">Tạm ứng</div><div class="ks">${esc(A.monthLabel(U.month))}</div></div></td>
<td data-label="Số tiền"><div class="yc-cell"><div class="k num">${esc(money(r.amount))}</div></div></td>
<td data-label="Chi tiết"><div class="yc-cell">${detail || '<span class="cap">—</span>'}</div></td>
<td class="yc-res" data-label="Kết quả"><div class="row" style="gap:8px">${A.pill(tone, text)}</div></td>
<td class="act">${actHtml(r, busy)}</td></tr>`;
  }

  // Thẻ "Tạm ứng" của màn Yêu cầu: theo tab trạng thái và ô tìm tên đang chọn. Chưa ai xin trong tháng: một dòng báo trống ở tab Chờ xử lý / Tất cả
  function render() {
    if (U.unavailable || U.month !== S.month) return '';
    if (U.error)
      return `<div class="errbox" role="alert">${ic('alert', 16)}<div class="col"><span>Chưa tải được tạm ứng: ${esc(sentence(U.error))}</span></div></div>`;
    // Bộ lọc loại yêu cầu và cảnh báo AI chỉ có nghĩa với yêu cầu khai lịch
    if (S.f.dtype || S.f.dflag) return '';
    const st = status();
    const q = A.fold(S.q[PAGE] || '');
    const rows = U.rows.filter(
      r => (st === 'all' || r.status === st) && (!q || A.fold(`${r.name} ${r.username}`).includes(q))
    );
    const waiting = U.rows.filter(r => r.status === 'pending').length;
    const cap = `${A.monthLabel(S.month)} · ${nf(waiting)} chờ duyệt`;
    const head = all => `<div class="card-h"><h2>Tạm ứng</h2><span class="cap">${esc(cap)}</span>${all}</div>`;
    if (!U.rows.length) {
      if (q || (st !== 'pending' && st !== 'all')) return '';
      return `<section class="card flush yc-card ul-card" aria-label="Tạm ứng">${head('')}${A.empty('Chưa có ai xin tạm ứng tháng này')}</section>`;
    }
    if (!rows.length) return '';
    const all =
      waiting && !locked()
        ? `<button class="btn sm end" type="button" data-act="ulapproveall" ${U.busy.size ? 'disabled aria-busy="true"' : ''}>Duyệt tất cả</button>`
        : '';
    const table = `<div class="tblwrap"><table class="rtable yc-t ul-t"><colgroup><col class="c-who"><col class="c-item"><col class="c-amt"><col class="c-detail"><col class="c-res"><col class="c-act-ul"></colgroup><thead><tr><th>Nhân sự</th><th>Loại yêu cầu</th><th>Số tiền</th><th>Chi tiết</th><th>Kết quả</th><th><span class="sr">Thao tác</span></th></tr></thead><tbody>${rows.map(rowHtml).join('')}</tbody></table></div>`;
    return `<section class="card flush yc-card ul-card" aria-label="Tạm ứng">${head(all)}${table}</section>`;
  }

  A.UngLuong = { load, render, rows: () => U.rows };
})(window.Admin);
