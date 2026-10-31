/* Giao diện Nhân viên: ghép màn. Điện thoại: một màn mỗi tab (Hôm nay, Chấm công, Yêu cầu, Thu nhập, Tôi).
   Máy tính (từ 1024 px): một trang ba cột dưới thanh tối (hôm nay · chấm công tháng · thu nhập và yêu cầu); hồ sơ mở từ ô tên góc phải. */
(function (NV) {
  'use strict';
  const { esc, ic, S, L } = NV;

  // Khoá trong địa chỉ: #hom-nay, #thu-nhap là tên khác của #trang-chu, #luong, dẫn về cùng màn
  const TABS = [
    ['trang-chu', 'home', 'Hôm nay'],
    ['cham-cong', 'clock', 'Chấm công'],
    ['yeu-cau', 'inbox', 'Yêu cầu'],
    ['luong', 'cash', 'Thu nhập'],
    ['toi', 'user', 'Tôi']
  ];
  const ALIAS = { 'hom-nay': 'trang-chu', 'thu-nhap': 'luong' };
  NV.viewOf = hash => ALIAS[hash] || hash;
  // Khai thay: chỉ Chấm công, Yêu cầu, Thu nhập (Hôm nay có Check-in/out, Tôi có đổi mật khẩu và đăng xuất của chính mình)
  NV.allowedViews = () => (NV.thay ? NV.THAY_VIEWS : TABS.map(t => t[0]));

  /* ---------- tiện ích ---------- */
  function monthState(month) {
    const sh = S.sheets[month];
    if (!sh || (sh.status === 'loading' && !sh.data)) return { kind: 'loading' };
    if (sh.status === 'error' && !sh.data) return { kind: 'error', error: sh.error };
    return { kind: 'ok' };
  }
  const loadingCard = () =>
    `<section class="nv-card nv-sec" aria-busy="true"><div class="nv-pad">${NV.skeleton(3)}</div></section>`;
  const errorCard = (msg, act) =>
    `<section class="nv-card nv-sec"><div class="nv-pad">${NV.errorBox(msg, act)}</div></section>`;
  function defaultSel(month) {
    const today = NV.today();
    if (today.startsWith(month)) return today;
    return null;
  }
  const pageHead = (title, sub) =>
    `<header class="nv-ph"><h1>${esc(title)}</h1>${sub ? `<p>${esc(sub)}</p>` : ''}</header>`;
  // Tài khoản không thuộc bảng lương (GET /api/me → payrollSubject false): một câu thay cho bảng công, yêu cầu
  const NO_PAY = {
    cham: 'Tài khoản này không thuộc bảng lương nên không có bảng công.',
    yeu: 'Tài khoản này không thuộc bảng lương nên không khai nghỉ, OT hay làm bù.'
  };
  const noPayNote = text => `<section class="nv-card nv-sec"><div class="nv-pad nv-muted">${esc(text)}</div></section>`;

  /* ---------- điện thoại ---------- */
  function homeView() {
    if (!S.payroll) return `${NV.todayCard()}<div class="nv-below">${NV.noPayCard()}</div>`;
    const st = monthState(NV.curMonth());
    const body =
      st.kind === 'error'
        ? errorCard(st.error, 'reload-month')
        : `${st.kind === 'ok' ? NV.alertCard() : ''}${NV.homePayCard()}${st.kind === 'ok' ? NV.todoCard() : ''}`;
    return `${NV.todayCard()}<div class="nv-below">${body}</div>`;
  }
  function chamCongView() {
    const sh = S.me.shiftCode ? L.shiftInfo(S.me.shiftCode) : null;
    const sub = `${sh ? NV.shiftText(sh) : 'Chưa gán ca cố định'} · làm ${L.scheduleText(S.me)}`;
    if (!S.payroll) return `<div class="nv-page">${pageHead('Chấm công')}${noPayNote(NO_PAY.cham)}</div>`;
    const month = S.month;
    const st = monthState(month);
    let body;
    if (st.kind === 'loading') body = loadingCard();
    else if (st.kind === 'error') body = errorCard(st.error, 'reload-month');
    else {
      const model = NV.model(month);
      const shErr = S.sheets[month].error
        ? `<div class="nv-sec">${NV.noteBox('warn', S.sheets[month].error)}</div>`
        : '';
      const cur = month === NV.curMonth();
      body = `${shErr}<section class="nv-card nv-sec" aria-label="Tóm tắt tháng">${NV.statsBlock(model, false)}${NV.summaryLine(model)}</section>
<section class="nv-card nv-sec nv-calcard" aria-label="Bảng công">${NV.calendarGrid(month, model, S.selAuto ? null : S.sel)}${NV.legendBlock(model, false)}</section>${cur ? `${NV.todayPunchCard()}${NV.recentCard()}` : ''}`;
    }
    return `<div class="nv-page">${pageHead('Chấm công', sub)}${NV.monthNav(month)}${body}</div>`;
  }
  function yeuCauView() {
    if (!S.payroll) return `<div class="nv-page">${pageHead('Yêu cầu')}${noPayNote(NO_PAY.yeu)}</div>`;
    const sub = NV.thay
      ? 'Khai nghỉ, OT hoặc làm bù thay cho người này.'
      : 'Xin nghỉ, khai OT, làm bù hoặc xin ứng lương. Admin đồng ý rồi mới tính vào lương.';
    return `<div class="nv-page">${pageHead('Yêu cầu', sub)}${NV.requestActions()}${NV.requestsSection(S.month)}${NV.explainSection()}${NV.advanceSection(S.month)}${NV.leaveCard()}</div>`;
  }
  // Máy chủ tính số lớn (GET /api/me/estimate → m, net) với ngày công theo Check-in/out hợp lệ;
  // phần tới hôm nay là khối toDate (thu-nhap.js)
  function luongSub(month) {
    const es = S.estimates[month];
    const d = es && es.data;
    if (d && d.official)
      return d.period && d.period.status === 'paid'
        ? 'Phiếu lương đã phê duyệt và đã trả lương.'
        : 'Phiếu lương đã phê duyệt.';
    return 'Tính theo Check-in/out, chưa phải lương chính thức.';
  }
  function luongView() {
    const m = S.month;
    if (!S.payroll) return `<div class="nv-page">${pageHead('Thu nhập')}${NV.noPayCard()}</div>`;
    return `<div class="nv-page">${pageHead('Thu nhập', luongSub(m))}${NV.monthNav(m)}${NV.incomeSlipCard(m)}${NV.incomeNotes(m)}${NV.noBenefitCard(m)}${NV.allowanceCard(m)}${NV.kpiCard(m)}</div>`;
  }
  function toiView() {
    return `<div class="nv-page">${pageHead('Tôi')}${NV.profileCard()}<p class="nv-src">Thông tin do Admin quản lý. Thấy sai thì báo Admin để sửa.</p>
<section class="nv-card nv-sec" aria-label="Tài khoản"><button type="button" class="nv-act" data-act="pwd"><span class="nv-act-i">${ic('lock', 18)}</span><span class="nv-grow"><b>Đổi mật khẩu</b></span>${ic('chevr', 18)}</button><button type="button" class="nv-act is-out" data-act="logout"><span class="nv-act-i">${ic('logout', 18)}</span><span class="nv-grow"><b>Đăng xuất</b></span></button></section></div>`;
  }
  const VIEWS = {
    'trang-chu': homeView,
    'cham-cong': chamCongView,
    'yeu-cau': yeuCauView,
    luong: luongView,
    toi: toiView
  };

  function mobileHtml() {
    const allowed = NV.allowedViews();
    const view = VIEWS[S.view] && allowed.includes(S.view) ? S.view : allowed[0];
    const tabs = TABS.filter(([k]) => allowed.includes(k))
      .map(
        ([k, i, t]) =>
          `<button type="button" class="nv-tab ${view === k ? 'is-on' : ''}" data-act="tab" data-t="${k}" ${view === k ? 'aria-current="page"' : ''}><span class="nv-tab-i">${ic(i, 20)}</span><span>${esc(t)}</span></button>`
      )
      .join('');
    return `${NV.thayBanner()}${NV.warnbar()}<main class="nv-main" id="nv-main" tabindex="-1">${VIEWS[view]()}</main><nav class="nv-tabbar${NV.thay ? ' is-thay' : ''}" aria-label="Menu chính">${tabs}</nav>`;
  }

  /* ---------- máy tính ---------- */
  // Ngày đang xem dưới lịch: ngày đã bấm; chưa bấm thì hôm nay, hoặc ngày thiếu chấm gần nhất khi hôm nay chưa có lượt nào
  function deskSel(month, model) {
    if (S.sel && S.sel.startsWith(month) && !S.selAuto) return S.sel;
    if (month !== NV.curMonth()) return S.sel && S.sel.startsWith(month) ? S.sel : null;
    const today = model.cells.get(NV.today());
    if (today && !today.sessions.length && model.missing.length) return model.missing[0].date;
    return NV.today();
  }
  function monthCardDesktop(month) {
    const st = monthState(month);
    const head = `<div class="nv-card-h"><h2>Chấm công ${esc(
      L.monthLabel(month)
        .replace('Tháng', 'tháng')
        .replace(/\/\d{4}$/, '')
    )}</h2>${NV.monthState(month)}${NV.monthNavSmall(month)}</div>`;
    let body;
    if (st.kind === 'loading')
      body = `<div class="nv-pad">${NV.skeleton(2)}<div class="skel" style="height:260px;border-radius:16px"></div></div>`;
    else if (st.kind === 'error') body = `<div class="nv-pad">${NV.errorBox(st.error, 'reload-month')}</div>`;
    else {
      const model = NV.model(month);
      const sel = deskSel(month, model);
      body = `${NV.statsBlock(model, true)}<div class="nv-calwrap">${NV.calendarGrid(month, model, S.selAuto ? null : sel)}</div>${NV.legendBlock(model, true)}${sel ? `<div class="nv-dayp">${NV.dayPanel(month, sel)}</div>` : ''}`;
    }
    return `<section class="nv-card nv-dcard" aria-label="Bảng công">${head}${body}</section>`;
  }
  function desktopHtml() {
    const me = S.me;
    const month = S.month;
    if (NV.thay)
      return `<header class="nv-top"><img src="admin/gft-logo-light.png" alt="GFT"><b>AiCB</b></header>${NV.thayBanner()}${NV.warnbar()}
<main class="nv-dash" id="nv-main" tabindex="-1"><div class="nv-col c1">${NV.thayCard()}</div><div class="nv-col c2">${monthCardDesktop(month)}</div><div class="nv-col c3">${NV.incomeCardDesktop(month)}${NV.kpiCard(month, { desktop: true, skipWait: true })}${NV.requestsCardDesktop(month)}</div></main>`;
    const menu = S.menuOpen
      ? `<div class="nv-menu" role="menu"><div class="nv-menu-h"><span class="nv-avatar">${esc(NV.initials(me.name))}</span><div><b>${esc(me.name)}</b><span>${esc(me.username)} · ${esc(NV.roleShort(me))}</span></div></div><button type="button" role="menuitem" data-act="profile">${ic('user', 16)}Hồ sơ của tôi</button><button type="button" role="menuitem" data-act="pwd">${ic('key', 16)}Đổi mật khẩu</button><button type="button" role="menuitem" class="is-out" data-act="logout">${ic('logout', 16)}Đăng xuất</button></div>`
      : '';
    const right = S.payroll
      ? `${NV.incomeCardDesktop(month)}${NV.kpiCard(month, { desktop: true, skipWait: true })}${NV.requestsCardDesktop(month)}${NV.leaveCardDesktop()}`
      : NV.noPayCard(true);
    const center = S.payroll
      ? monthCardDesktop(month)
      : `<section class="nv-card nv-dcard" aria-label="Bảng công"><div class="nv-card-h"><h2>Chấm công</h2></div><div class="nv-pad nv-muted">${esc(NO_PAY.cham)}</div></section>`;
    return `<header class="nv-top"><img src="admin/gft-logo-light.png" alt="GFT"><b>AiCB</b><div class="nv-topu" data-menu-zone><button type="button" class="nv-userchip" data-act="menu" aria-haspopup="menu" aria-expanded="${S.menuOpen}"><span class="nv-avatar">${esc(NV.initials(me.name))}</span><span><b>${esc(me.name)}</b><small>${esc(NV.roleShort(me))}</small></span>${ic('chev', 16)}</button>${menu}</div></header>${NV.warnbar()}
<main class="nv-dash" id="nv-main" tabindex="-1"><div class="nv-col c1">${NV.todayCard()}</div><div class="nv-col c2">${center}</div><div class="nv-col c3">${right}</div></main>`;
  }

  /* ---------- vẽ lại ---------- */
  NV.render = () => {
    const root = document.getElementById('nv-root');
    if (!root || !S.me) return;
    const ae = document.activeElement;
    const focusId = ae && ae.id && root.contains(ae) ? ae.id : '';
    const keepSel = ae && root.contains(ae) && ae.dataset ? ae.dataset.d : '';
    const y = window.scrollY;
    root.innerHTML = S.desktop ? desktopHtml() : mobileHtml();
    window.scrollTo(0, y);
    let target = focusId ? document.getElementById(focusId) : null;
    if (!target && keepSel) target = root.querySelector(`[data-act="day"][data-d="${keepSel}"]`);
    if (target) target.focus({ preventScroll: true });
    NV.bindPassword(root);
  };

  NV.bindPassword = root => {
    const form = root.querySelector('#nv-pwd');
    if (!form) return;
    form.onsubmit = async ev => {
      ev.preventDefault();
      const cur = form.querySelector('#pw-cur').value,
        next = form.querySelector('#pw-new').value,
        again = form.querySelector('#pw-new2').value;
      const msg = form.querySelector('#pw-msg');
      const show = (tone, text) =>
        (msg.innerHTML = `<div role="${tone === 'ok' ? 'status' : 'alert'}">${NV.noteBox(tone === 'ok' ? 'ok' : 'bad', text)}</div>`);
      if (!cur || !next) return show('err', 'Nhập mật khẩu hiện tại và mật khẩu mới.');
      if (next !== again) return show('err', 'Hai lần nhập mật khẩu mới chưa giống nhau.');
      const btn = form.querySelector('#pw-go');
      btn.disabled = true;
      try {
        await NV.api('PUT', '/password', { current: cur, next });
        form.reset();
        show('ok', 'Đã đổi mật khẩu. Các thiết bị khác phải đăng nhập lại.');
      } catch (e) {
        show('err', NV.errText(e));
      } finally {
        btn.disabled = false;
      }
    };
  };

  /* ---------- điều hướng và hành động ---------- */
  const setView = (view, push) => {
    view = NV.viewOf(view);
    if (!VIEWS[view] || !NV.allowedViews().includes(view)) view = NV.allowedViews()[0];
    S.view = view;
    if (push !== false && location.hash !== '#' + view) history.replaceState(null, '', '#' + view);
    NV.render();
    window.scrollTo(0, 0);
    const main = document.getElementById('nv-main');
    if (main) main.focus({ preventScroll: true });
    if (view === 'cham-cong' || view === 'yeu-cau' || view === 'luong') NV.loadMonth(S.month).then(NV.render);
    if (view === 'yeu-cau') NV.loadAdvance(S.month).then(NV.render);
    if (view === 'luong') NV.loadEstimate(S.month).then(NV.render);
    if (view === 'trang-chu') NV.loadEstimate(NV.curMonth()).then(NV.render);
  };
  NV.setView = setView;
  NV.actions.tab = el => setView(el.dataset.t);
  window.addEventListener('hashchange', () => {
    const v = NV.viewOf(location.hash.replace(/^#/, ''));
    if (VIEWS[v] && NV.allowedViews().includes(v) && v !== S.view) setView(v, false);
  });

  NV.setMonth = month => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month === S.month) return;
    S.month = month;
    S.sel = defaultSel(month);
    S.selAuto = true;
    NV.thaySyncUrl(); // khai thay: tháng đang khai nằm trong địa chỉ
    NV.render();
    NV.loadMonth(month).then(NV.render);
    NV.loadEstimate(month).then(NV.render);
    NV.loadAdvance(month).then(NV.render);
  };
  NV.actions.month = el => NV.setMonth(L.addMonths(S.month, Number(el.dataset.d)));
  NV.actions['month-now'] = () => NV.setMonth(NV.curMonth());

  NV.actions.day = async el => {
    const date = el.dataset.d;
    if (!L.isDate(date)) return;
    const month = date.slice(0, 7);
    if (S.desktop) {
      if (month !== S.month) NV.setMonth(month);
      S.sel = date;
      S.selAuto = false;
      return NV.render();
    }
    if (month === S.month) {
      S.sel = date;
      S.selAuto = false;
      NV.render();
    }
    if (!NV.model(month)) await NV.loadMonth(month);
    const html = NV.dayDetail(month, date);
    if (!html) return;
    NV.openSheet({ label: `Chi tiết ngày ${L.dmy(date)}`, html });
  };

  NV.actions.reload = () => NV.reloadAll();
  NV.actions['reload-punch'] = async () => {
    S.punchStatus = 'loading';
    NV.render();
    await NV.loadPunch();
    NV.render();
  };
  NV.actions['reload-month'] = async () => {
    await NV.loadMonth(S.month, true);
    NV.render();
  };
  NV.actions['reload-estimate'] = async () => {
    await NV.loadEstimate(S.month, true);
    NV.render();
  };
  // Nạp lại mọi thứ đang hiện (không vẽ). Khai thay: chỉ tháng đang khai; không có Check-in/out
  NV.reloadData = () =>
    NV.thay
      ? Promise.all([NV.loadMe(), NV.loadMonth(S.month, true), NV.loadEstimate(S.month, true)])
      : Promise.all([
          NV.loadMe(), // ca, ngày lễ, vùng chấm công có thể đã đổi
          NV.loadPunch(),
          NV.loadMonth(NV.curMonth(), true),
          S.month !== NV.curMonth() ? NV.loadMonth(S.month, true) : null,
          NV.loadEstimate(NV.curMonth(), true),
          S.month !== NV.curMonth() ? NV.loadEstimate(S.month, true) : null,
          NV.loadAdvance(S.month, true)
        ]);
  NV.reloadAll = async () => {
    await NV.reloadData();
    NV.render();
  };
  NV.actions.menu = () => {
    S.menuOpen = !S.menuOpen;
    NV.render();
  };
  // Máy tính: hộp "Hồ sơ của tôi" có phần đổi mật khẩu; điện thoại: khay "Đổi mật khẩu"
  function openProfile(focusPwd) {
    S.menuOpen = false;
    NV.render();
    NV.openSheet({
      label: 'Hồ sơ của tôi',
      wide: true,
      html: `<div class="nv-dlg-h"><div><h2>Hồ sơ của tôi</h2><p>Thông tin do Admin quản lý · thấy sai thì báo Admin để sửa</p></div><button type="button" class="nv-x" data-act="close-sheet" aria-label="Đóng">${ic('x', 18)}</button></div>${NV.profileFacts()}${NV.passwordForm({ desktop: true })}`,
      onMount: sheet => {
        NV.bindPassword(sheet);
        if (focusPwd) setTimeout(() => sheet.querySelector('#pw-cur').focus({ preventScroll: true }), 0);
      }
    });
  }
  NV.actions.profile = () => openProfile(false);
  NV.actions.pwd = () => {
    if (S.desktop) return openProfile(true);
    NV.openSheet({
      label: 'Đổi mật khẩu',
      html: `<div class="nv-dh"><h2>Đổi mật khẩu</h2></div><p class="nv-dsub">Tài khoản ${esc(S.me.username)}</p>${NV.passwordForm()}`,
      onMount: sheet => NV.bindPassword(sheet)
    });
  };
  NV.actions.logout = async () => {
    try {
      await NV.api('POST', '/logout', {});
    } catch {
      /* đã hết phiên thì cũng về trang đăng nhập */
    }
    location.replace('/dang-nhap.html');
  };

  /* ---------- đồng hồ sống: chỉ cập nhật chữ, không vẽ lại cả trang ---------- */
  let lastDay = null;
  NV.tick = () => {
    if (!S.me) return;
    const today = NV.today();
    if (lastDay && lastDay !== today) {
      lastDay = today;
      S.sel = defaultSel(S.month);
      S.selAuto = true;
      NV.reloadAll();
      return;
    }
    lastDay = today;
    const hm = L.vnTime(NV.nowIso());
    document.querySelectorAll('[data-live-time]').forEach(el => (el.textContent = '· ' + hm));
    const now = Date.parse(NV.nowIso());
    document.querySelectorAll('[data-live-worked]').forEach(el => {
      const since = Date.parse(el.dataset.liveWorked);
      if (Number.isFinite(since)) el.textContent = L.fmtMin(Math.max(0, Math.round((now - since) / 60000)));
    });
    // Lượt mở quá giờ cho phép: hỏi máy chủ một lần để nó đóng lượt, lượt chuyển sang "Chờ xử lý"
    const pv = S.punch && S.punch.openSession ? NV.punchView() : null;
    if (pv && pv.forgotOut && !S.forgotAsked) {
      S.forgotAsked = true;
      NV.reloadAll();
    }
    if (!pv) S.forgotAsked = false;
  };
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && S.me && !S.busy) NV.reloadAll();
  });
  window.setInterval(NV.tick, 15000);
  NV.initTick = () => (lastDay = NV.today());
  NV.defaultSel = defaultSel;
})(window.NV);
