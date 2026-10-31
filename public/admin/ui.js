/* Giao diện Admin: thành phần giao diện dùng chung (khung, thanh bên, thanh trên, bảng, trang, thẻ số liệu). */
(function (A) {
  'use strict';
  const { esc, nf, ic, S } = A;

  A.pill = (kind, text) => `<span class="pill p-${esc(kind)}">${esc(text)}</span>`;
  A.pillHtml = (kind, html) => `<span class="pill p-${esc(kind)}">${html}</span>`;
  A.soonTag = (text = 'Sắp có') => `<span class="soon">${esc(text)}</span>`;
  A.avatar = name => {
    const parts = String(name || '?')
      .trim()
      .split(/\s+/);
    const ini = (
      parts.length > 1 ? parts[parts.length - 2][0] + parts[parts.length - 1][0] : parts[0].slice(0, 2)
    ).toUpperCase();
    return `<span class="av" aria-hidden="true">${esc(ini)}</span>`;
  };
  A.person = (name, sub) =>
    `<div class="row" style="gap:10px">${A.avatar(name)}<div class="col" style="min-width:0"><span style="font-weight:600">${esc(name)}</span>${sub ? `<span class="cap">${sub}</span>` : ''}</div></div>`;
  A.header = (title, sub, acts = '', cls = '') =>
    `<header class="hdr${cls ? ' ' + esc(cls) : ''}"><div><h1>${esc(title)}</h1>${sub ? `<p class="sub">${sub}</p>` : ''}</div><div class="acts">${acts}</div></header>`;
  A.kpiCard = (label, value, cap, cls = '') =>
    `<div class="card sm kpi ${cls}"><span class="lbl">${label}</span><span class="v">${value}</span><span class="cap">${cap || ''}</span></div>`;
  A.empty = (title, sub = '') =>
    `<div class="empty"><div style="font-weight:600;color:var(--ink)">${esc(title)}</div>${sub ? `<div class="cap" style="margin-top:4px">${esc(sub)}</div>` : ''}</div>`;
  A.skelRows = (cols, n = 6) =>
    Array.from(
      { length: n },
      () =>
        `<tr>${Array.from({ length: cols }, (_, i) => `<td><div class="skel" style="width:${i ? 60 + ((i * 17) % 40) : 140}px"></div></td>`).join('')}</tr>`
    ).join('');
  A.errorBox = (message, retry = true) =>
    `<div class="errbox" role="alert">${ic('alert', 18)}<div class="col"><b>Không tải được dữ liệu</b><span>${esc(message)}</span>${retry ? `<div><button class="btn sm" type="button" data-act="reload">Thử lại</button></div>` : ''}</div></div>`;
  A.note = (html, icon = 'info') => `<div class="note">${ic(icon, 16)}<span>${html}</span></div>`;
  A.chip = (on, act, attrs, label, n) =>
    `<button type="button" class="chip ${on ? 'on' : ''}" data-act="${act}" ${attrs} aria-pressed="${!!on}">${esc(label)}${n != null ? ` <span class="n">${nf(n)}</span>` : ''}</button>`;
  A.searchBox = (key, placeholder, width = 220) =>
    `<div class="field"><label class="sr" for="q-${key}">${esc(placeholder)}</label>${ic('search', 18)}<input id="q-${key}" class="input" type="search" placeholder="${esc(placeholder)}" value="${esc(S.q[key] || '')}" data-input="q" data-k="${key}" style="width:${width}px"></div>`;
  /* Nút chưa làm: vô hiệu, có chú thích khi rê chuột */
  A.disabledBtn = (label, tip = 'Sắp có', cls = '') =>
    `<button type="button" class="btn ${cls}" aria-disabled="true" title="${esc(tip)}">${esc(label)}</button>`;

  /* Phân trang phía trình duyệt: trả { start, end, html, pageRows(list) } */
  A.pager = (key, total, size = 20) => {
    const pages = Math.max(1, Math.ceil(total / size));
    const p = Math.min(Math.max(1, S.page[key] || 1), pages);
    S.page[key] = p;
    const start = (p - 1) * size,
      end = Math.min(total, start + size);
    const html = `<div class="pager"><span class="cap">Hiển thị ${total ? nf(start + 1) + '–' + nf(end) : 0} trong ${nf(total)}</span><div class="row" style="gap:8px">
<button type="button" class="btn sm icon" data-act="page" data-k="${key}" data-p="${p - 1}" ${p <= 1 ? 'disabled' : ''} aria-label="Trang trước">${ic('chevl', 16)}</button>
<span class="cap num">Trang ${p}/${pages}</span>
<button type="button" class="btn sm icon" data-act="page" data-k="${key}" data-p="${p + 1}" ${p >= pages ? 'disabled' : ''} aria-label="Trang sau">${ic('chevr', 16)}</button></div></div>`;
    return { start, end, html, slice: list => list.slice(start, end) };
  };

  /* ---------- thanh bên ---------- */
  /* Chữ cái đầu của hai từ cuối trong tên */
  A.myInitials = () =>
    ((S.me && S.me.name) || 'A')
      .trim()
      .split(/\s+/)
      .slice(-2)
      .map(x => x[0])
      .join('')
      .toUpperCase();
  /* Thanh bên sáng: nhóm theo việc của kỳ lương; Cài đặt và tài khoản nằm ở chân thanh bên */
  A.sidebarHTML = () => {
    const np = S.pendingCount;
    const item = ([k, i, t]) =>
      `<a href="#${k}" data-act="nav" data-t="${k}" class="${S.view === k ? 'on' : ''}" ${S.view === k ? 'aria-current="page"' : ''}>${ic(i, 16, 1.6)}<span class="lb">${esc(t)}</span>${k === 'duyet' && np ? `<span class="badge" aria-label="${np} yêu cầu chờ xử lý (mọi tháng)" title="${np} yêu cầu chờ xử lý (mọi tháng)">${np > 999 ? '999+' : np}</span>` : ''}${A.SOON_NAV.has(k) ? '<span class="soon">Sắp có</span>' : ''}</a>`;
    const me = S.me || {};
    const groups = A.NAV_GROUPS.map(([g, list]) => [g, list.filter(([k]) => k !== 'tro-ly' || A.agentsEnabled())])
      .filter(([, list]) => list.length)
      .map(([g, list]) => `${g ? `<div class="grp"><span>${esc(g)}</span></div>` : ''}${list.map(item).join('')}`)
      .join('');
    return `<div class="side-in"><div class="brand-row"><div class="brand"><img src="slip/gft-logo.png" alt="GFT"><b>AiCB</b></div>
<button type="button" class="btn icon ghost menu-btn" data-act="menu" aria-expanded="${S.menuOpen}" aria-label="Mở menu">${ic('menu')}</button></div>
<p class="scope">Lương, chấm công, phúc lợi · GFT</p>
<nav class="nav" aria-label="Menu chính">${groups}</nav>
<div class="side-foot"><nav class="nav" aria-label="Hệ thống">${A.NAVS2.map(item).join('')}</nav>
<button type="button" class="me" data-act="acct" aria-expanded="${!!S.acct}" aria-label="Tài khoản: màu nền, mật độ bảng, đổi mật khẩu"><span class="av">${esc(A.myInitials())}</span><span class="col"><b>${esc(me.name || '')}</b><span>Admin</span></span></button></div></div>`;
  };

  /* ---------- menu tài khoản (popover): màu nền, mật độ bảng, đổi mật khẩu, đăng xuất ---------- */
  const popEl = document.createElement('div');
  popEl.className = 'acctpop';
  popEl.hidden = true;
  popEl.setAttribute('role', 'dialog');
  popEl.setAttribute('aria-label', 'Tài khoản');
  document.body.appendChild(popEl);
  A.renderPop = () => {
    if (!S.acct) {
      popEl.hidden = true;
      popEl.innerHTML = '';
      return;
    }
    const sideEl = document.getElementById('side');
    const nen = A.store.get('nen') === 'kem' ? 'kem' : 'xam';
    const den = A.store.get('density') === 'gon' ? 'gon' : 'thoai-mai';
    const seg = (act, cur, opts) =>
      `<div class="seg" role="group">${opts.map(([v, l]) => `<button type="button" class="${cur === v ? 'on' : ''}" aria-pressed="${cur === v}" data-act="${act}" data-v="${v}">${l}</button>`).join('')}</div>`;
    const me = S.me || {};
    popEl.innerHTML = `<div class="ap-me"><span class="av">${esc(A.myInitials())}</span><div class="col"><b>${esc(me.name || '')}</b><span class="cap">Admin${me.username ? ' · ' + esc(me.username) : ''}</span></div></div>
<div class="prow"><span>Màu nền</span>${seg('nen', nen, [
      ['xam', 'Xám'],
      ['kem', 'Kem']
    ])}</div>
<div class="prow"><span>Mật độ bảng</span>${seg('density', den, [
      ['thoai-mai', 'Thoải mái'],
      ['gon', 'Gọn']
    ])}</div>
<button type="button" class="pmi" data-act="pwopen">${ic('key', 16)}Đổi mật khẩu</button>
<button type="button" class="pmi out" data-act="logout">${ic('logout', 16)}Đăng xuất</button>`;
    popEl.hidden = false;
    /* menu mở ngay trên khối tài khoản ở chân thanh bên */
    const meBtn = sideEl.querySelector('.me');
    if (window.innerWidth <= 900 || !meBtn) {
      popEl.style.left = '16px';
      popEl.style.right = '16px';
      popEl.style.top = '72px';
      popEl.style.bottom = 'auto';
    } else {
      const r = meBtn.getBoundingClientRect();
      popEl.style.left = Math.round(r.left) + 'px';
      popEl.style.right = 'auto';
      popEl.style.top = 'auto';
      popEl.style.bottom = Math.round(window.innerHeight - r.top + 6) + 'px';
    }
  };
  A.actions.acct = () => {
    S.acct = !S.acct;
    A.renderChrome();
  };
  document.addEventListener('click', ev => {
    if (S.acct && !ev.target.closest('.acctpop, [data-act="acct"]')) {
      S.acct = false;
      A.renderChrome();
    }
  });
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape' && S.acct && !A.dialogOpen) {
      S.acct = false;
      A.renderChrome();
    }
  });

  /* ---------- thanh kỳ lương (đầu mọi màn): chọn tháng, trạng thái kỳ, sáu bước, chuông ---------- */
  /* Sáu bước theo trạng thái kỳ của máy chủ (GET /api/periods/:month); chưa tải được kỳ thì chỉ còn chọn tháng và chuông */
  A.PERIOD_STEPS = [
    ['Chưa tính lương', 'open'],
    ['Chốt công', 'attendance_locked'],
    ['Tính lương', 'calculated'],
    ['AI kiểm tra', 'reviewed'],
    ['Phê duyệt', 'approved'],
    ['Trả lương', 'paid']
  ];
  A.PERIOD_STATE = {
    open: ['Chưa tính lương', 'p-est'],
    attendance_locked: ['Đã chốt công', 'p-wait'],
    calculated: ['Bản nháp', 'p-wait'],
    reviewed: ['Chờ phê duyệt', 'p-wait'],
    approved: ['Đã phê duyệt', 'p-ok'],
    paid: ['Đã trả lương', 'p-ok']
  };
  const RANK = A.PERIOD_STEPS.map(x => x[1]);
  const stripSteps = () => {
    const P = S.period;
    if (!P || P.month !== S.month || !P.data) return '';
    const v = P.data;
    const r = RANK.indexOf(v.status);
    if (r < 0) return '';
    const c = v.counts || {};
    const total = c.total ?? Object.values(c).reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
    /* chữ nhỏ cạnh bước: chỉ số phiếu đã phê duyệt khi đang phê duyệt. Không ghi hạn chốt công, không ghi ngày trả lương */
    const note = ['', '', '', '', r >= 2 && r < 4 && v.run && total ? `${nf(c.approved || 0)}/${nf(total)}` : '', ''];
    const [stTxt, stCls] = A.PERIOD_STATE[v.status] || [v.status, ''];
    const steps = A.PERIOD_STEPS.map(([label], i) => {
      const done = i <= r;
      const cur = !done && i === r + 1;
      const cls = done ? 'done' : cur ? 'cur' : '';
      return `<li class="pstep ${cls}"><span class="d" aria-hidden="true">${done ? ic('check', 11, 3) : ''}</span>${esc(label)}${note[i] ? ` <small>${esc(note[i])}</small>` : ''}${done ? '<span class="sr"> (xong)</span>' : cur ? '<span class="sr"> (bước tiếp theo)</span>' : ''}</li>`;
    }).join('<li class="psep" aria-hidden="true"></li>');
    const stale =
      v.stale === true
        ? ' <span class="pstale" title="Dữ liệu đã đổi sau lần tính: nên tính lại">· cần tính lại</span>'
        : '';
    return `<span class="pstate ${stCls}">${esc(stTxt)}${stale}</span><ol class="psteps" aria-label="Các bước kỳ lương">${steps}</ol>`;
  };
  A.topbarHTML = () => {
    const al = S.alerts;
    const miss = al ? al.missingPunches.length : 0;
    const pend = al ? al.pendingApprovals : S.pendingCount || 0;
    const total = miss + pend;
    const pop = S.bellOpen
      ? `<div class="pop" id="bell-pop" role="dialog" aria-label="Việc cần xử lý">
<h3>Việc cần xử lý <span class="cap">${esc(A.monthLabel(S.month))}${al ? ` · ${nf(total)} việc` : ''}</span></h3>
${
  al
    ? `<button type="button" class="poprow" data-act="nav" data-t="duyet">${ic('inbox', 16)}<span class="grow">Yêu cầu chờ xử lý <span class="cap">mọi tháng</span></span><b class="num">${nf(pend)}</b></button>
<button type="button" class="poprow" data-act="nav" data-t="cham-cong">${ic('clock', 16)}<span class="grow">Lượt quên Check-in/out trong tháng</span><b class="num">${nf(miss)}</b></button>
${
  miss
    ? `<ul class="poplist">${al.missingPunches
        .slice(0, 5)
        .map(
          m =>
            `<li><span class="num">${esc(A.fmtDM(m.date))}</span><span>${esc(m.name)} · ${m.kind === 'forgot-in' ? 'quên Check-in' : 'quên Check-out'}</span></li>`
        )
        .join('')}${miss > 5 ? `<li><span></span><span>và ${nf(miss - 5)} lượt khác</span></li>` : ''}</ul>`
    : ''
}
<div class="popfoot"><button type="button" class="link" data-act="nav" data-t="duyet">Mở Yêu cầu</button> · <button type="button" class="link" data-act="nav" data-t="cham-cong">Mở Bảng công</button></div>`
    : `<span class="cap">Không tải được số việc cần xử lý.</span>`
}</div>`
      : '';
    const ml = A.monthLabel(S.month);
    return `<div class="mpick" role="group" aria-label="Chọn tháng">
<button type="button" id="m-prev" data-act="month" data-d="-1" aria-label="Tháng trước">${ic('chevl', 16)}</button>
<span class="mlabel"><span aria-hidden="true">${esc(ml.charAt(0).toUpperCase() + ml.slice(1))}</span><label class="sr" for="monthInput">Tháng</label><input id="monthInput" type="month" value="${esc(S.month)}" data-input="month"></span>
<button type="button" id="m-next" data-act="month" data-d="1" aria-label="Tháng sau">${ic('chevr', 16)}</button></div>
${stripSteps()}
<div class="bellwrap"><button type="button" id="bellBtn" class="bellbtn" data-act="bell" aria-haspopup="dialog" aria-expanded="${S.bellOpen}" aria-label="Việc cần xử lý${total ? ': ' + total : ''}">${ic('bell', 18)}${total ? `<span class="cnt">${total > 99 ? '99+' : total}</span>` : ''}</button>${pop}</div>`;
  };
})(window.Admin);
