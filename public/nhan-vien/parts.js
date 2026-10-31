/* Giao diện Nhân viên: các khối dùng chung cho điện thoại và máy tính (chuỗi HTML).
   Mọi dữ liệu từ máy chủ hoặc người dùng đi qua esc() trước khi vào chuỗi. Không có số tiền, không có công thức ở đây
   (thẻ Thu nhập ở thu-nhap.js, yêu cầu ở yeu-cau.js). */
(function (NV) {
  'use strict';
  const { esc, ic, S, L } = NV;
  const AS = window.AttendanceStatus; // nhãn trạng thái của lượt (public/attendance-status.js)

  const initials = name => {
    const parts = String(name || '?')
      .trim()
      .split(/\s+/);
    return (
      parts.length > 1 ? parts[parts.length - 2][0] + parts[parts.length - 1][0] : parts[0].slice(0, 2)
    ).toUpperCase();
  };
  NV.initials = initials;
  const nowHm = () => L.vnTime(NV.nowIso());
  const lcFirst = s => (s ? s[0].toLowerCase() + s.slice(1) : '');
  const fmtNum = n => Number(n).toLocaleString('vi-VN', { maximumFractionDigits: 2 });
  // Nhãn trạng thái: on (vàng nhạt, đang trong ca), dark (trên nền tối), done, pending, rejected, draft, holiday
  const PILL = {
    on: 'is-on',
    dark: 'is-dark',
    done: 'is-done',
    pending: 'is-pend',
    rejected: 'is-err',
    draft: 'is-draft',
    holiday: 'is-hol',
    kind: 'is-draft'
  };
  const pill = (tone, text) => `<span class="nv-pill ${PILL[tone] || 'is-draft'}">${esc(text)}</span>`;
  const soon = (text = 'Sắp có') => `<span class="nv-soon">${esc(text)}</span>`;
  const disabledBtn = (label, extra = '') =>
    `<button type="button" class="nv-btn" aria-disabled="true" title="Sắp có">${esc(label)}${soon()}${extra}</button>`;
  const NOTE_IC = { bad: 'alert', warn: 'alert', info: 'info', ok: 'check', gold: 'info' };
  const noteBox = (tone, text, html = false) =>
    `<div class="nv-note is-${esc(tone)}">${ic(NOTE_IC[tone] || 'info', 16)}<span>${html ? text : esc(text)}</span></div>`;
  const skeleton = lines =>
    `<div class="nv-skel-card" aria-busy="true" aria-label="Đang tải">${Array.from({ length: lines }, (_, i) => `<div class="skel" style="height:${i ? 14 : 20}px;width:${i ? 60 + ((i * 23) % 35) : 45}%"></div>`).join('')}</div>`;
  const errorBox = (message, act = 'reload') =>
    `<div class="errbox" role="alert">${ic('alert', 18)}<div class="col"><b>Không tải được dữ liệu</b><span>${esc(message)}</span><div><button class="btn sm" type="button" data-act="${act}">Thử lại</button></div></div></div>`;
  // Ca kèm "hôm sau" khi giờ ra nhỏ hơn giờ vào (ca đêm)
  const shiftText = info => (info ? `${info.label}${info.out < info.in ? ' hôm sau' : ''}` : '');
  // Tên bậc gọn cho dòng phụ: bỏ phần giải thích trong ngoặc ("HDO (Human Development Officer)" → "HDO")
  const roleShort = me => L.roleLine(me).replace(/\s*\([^)]*\)\s*$/, '');
  Object.assign(NV, { pill, soon, disabledBtn, noteBox, skeleton, errorBox, shiftText, roleShort, fmtNum, lcFirst });

  /* ---------- khối tối "Hôm nay": lời chào, ca, Check-in ---------- */
  function todaySessions() {
    const model = NV.model(NV.curMonth());
    const cell = model && model.cells.get(NV.today());
    return cell ? cell.sessions : [];
  }
  function shiftCardBody(pv) {
    const msg = S.punchMsg ? `<div class="nv-pmsg is-${esc(S.punchMsg.tone)}">${esc(S.punchMsg.text)}</div>` : '';
    const live = `<div id="nv-pmsg" role="status" aria-live="polite">${msg}</div>`;
    // Tài khoản không thuộc bảng lương (GET /api/me → payrollSubject false): máy chủ không cho chấm công, nên không có nút
    // (vừa bấm mà máy chủ trả 403 thì hiện nguyên câu của máy chủ)
    if (!S.payroll)
      return `<div class="nv-shift-h"><span>Chấm công</span></div><div class="nv-geo" role="status">${ic('info', 16)}<span>${esc((S.punchMsg && S.punchMsg.text) || 'Tài khoản này không thuộc bảng lương nên không Check-in/out.')}</span></div>`;
    if (S.punchStatus === 'error')
      return `<div class="errbox" role="alert">${ic('alert', 18)}<div class="col"><b>Chưa tải được trạng thái chấm công</b><span>${esc(S.punchError)}</span><div><button class="btn sm" type="button" data-act="reload-punch">Thử lại</button></div></div></div>`;
    if (pv.mode === 'loading')
      return `<div class="nv-skel-card" aria-busy="true" aria-label="Đang tải"><div class="skel is-dark" style="height:16px;width:40%"></div><div class="skel is-dark" style="height:24px;width:70%"></div><div class="skel is-dark" style="height:52px"></div></div>`;

    const shiftInfo = pv.mode === 'open' && pv.shiftNow ? pv.shiftNow : pv.shift;
    const name = shiftInfo ? shiftText(shiftInfo) : 'Chưa gán ca cố định';
    const rows = todaySessions();
    const done = rows.filter(s => !s.open && s.outHm);
    const line = (icon, html) => `<div class="nv-geo">${ic(icon, 16)}<span>${html}</span></div>`;
    let state,
      meta = '',
      notes = '',
      btn = '';
    const busy = S.busy ? 'disabled aria-busy="true"' : '';
    const spin = S.busy ? '<span class="nv-spin"></span>' : '';
    if (pv.mode === 'open') {
      // nhãn của lượt đang mở do máy chủ tính (Đã Check-in, hoặc Chờ xử lý khi vào trễ quá số phút cho phép, ngoài ca...),
      // đọc từ lượt đang mở của GET /api/punch: lượt ca đêm qua nửa đêm không nằm trong ô hôm nay của lịch tháng
      state = pill(AS.TONE[pv.status], AS.LABEL[pv.status]);
      if (pv.statusNote) notes += line('info', esc(pv.statusNote));
      // sớm, muộn so với giờ vào ca: chỉ lượt đầu của ngày (lượt sau trong ngày không so với giờ vào ca)
      const first = !done.length;
      const vs = !first
        ? ''
        : pv.earlyMin
          ? ` · sớm ${pv.earlyMin} phút`
          : pv.lateMin
            ? ` · muộn ${pv.lateMin} phút`
            : '';
      meta = `<div class="nv-meta nv-todaypunch">Vào <span class="nv-num">${esc(pv.sinceHm)}</span><span class="nv-dim">${esc(vs)}${pv.acrossMidnight ? ` · ca của ngày ${esc(L.dm(pv.workDate))}` : ''}</span><br>Đã làm <span class="nv-num" data-live-worked="${esc(pv.since)}">${esc(L.fmtMin(pv.workedMin))}</span></div>`;
      if (pv.outsideShift)
        notes += line(
          'info',
          'Lượt này ngoài ca hoặc ngoài lịch làm việc: chờ Admin xử lý, không tính tiền nếu chưa được Admin đồng ý.'
        );
      if (pv.outsideZone) notes += line('pin', `<b>${esc(L.OUTSIDE_ZONE)}</b>: Admin sẽ xem lại lượt này.`);
      if (pv.forgotOut)
        notes += `<div class="nv-pmsg is-warn" role="status">Lượt này đã mở quá giờ cho phép. Hệ thống đang chuyển lượt sang "Chờ xử lý" để Admin xử lý.</div>`;
      btn = `<button type="button" class="nv-punch is-out" id="nv-punch" data-act="punch" data-type="out" ${busy}>${spin || ic('login', 20, 2)}<span>Check-out</span><span class="nv-at nv-num" data-live-time>· ${esc(nowHm())}</span></button>`;
    } else {
      // Ngoài khung ca hay chưa gán ca vẫn bấm được (máy chủ ghi lượt chờ Admin xử lý).
      // Máy chủ báo không có lịch hay khoản OT / làm bù được duyệt (pv.blocked): nút tắt kèm câu của máy chủ
      const warnIn = !pv.blocked && (pv.mode === 'window' || pv.mode === 'noshift');
      const canIn = !pv.blocked && (pv.mode === 'ready' || pv.mode === 'window' || warnIn);
      // Hôm nay đã có lượt: nhãn của ngày do máy chủ tính; chưa có lượt: chưa vào ca hoặc chưa tới giờ Check-in
      const code = AS.dayStatus(rows);
      state = code ? pill(AS.TONE[code], AS.LABEL[code]) : pill('dark', canIn ? 'Chưa vào ca' : 'Chưa mở');
      if (done.length)
        meta = `<div class="nv-meta nv-todaypunch">Hôm nay: vào <span class="nv-num">${esc(done[0].inHm)}</span> · ra <span class="nv-num">${esc(done[done.length - 1].outHm)}</span></div>`;
      for (const n of AS.dayNotes(rows)) notes += line('info', esc(n));
      // Check-out muộn: giờ bấm chỉ được ghi nhận, lượt Chờ xử lý cho tới khi Admin duyệt giải trình
      for (const r of rows.filter(x => x.requestedOutHm))
        notes += line(
          'clock',
          `Check-out lúc <b class="nv-num">${esc(r.requestedOutHm)}</b> chỉ được ghi nhận: lượt này <b>Chờ xử lý</b> cho tới khi Admin duyệt giải trình.`
        );
      if (canIn)
        notes += S.geofenceRequired
          ? line(
              'pin',
              `<b>Bật vị trí khi Check-in.</b> Vùng chấm công${S.geofence ? ` bán kính ${esc(S.geofence.radiusM)} m` : ''} do Admin đặt; Check-in ngoài vùng vẫn được ghi nhận và Admin sẽ xem lại. Vị trí chỉ dùng để kiểm tra lúc bấm, không được lưu.`
            )
          : line('pin', 'Chưa bật vùng chấm công: Check-in không cần vị trí.');
      const inBtn = () =>
        `<button type="button" class="nv-punch is-in" id="nv-punch" data-act="punch" data-type="in" ${busy}>${spin || ic('login', 20, 2)}<span>${done.length ? 'Check-in lượt mới' : 'Check-in'}</span><span class="nv-at nv-num" data-live-time>· ${esc(nowHm())}</span></button>`;
      if (pv.blocked) {
        notes += line('info', esc(pv.blocked));
        btn = `<button type="button" class="nv-punch is-off" id="nv-punch" disabled>${ic('login', 20, 2)}<span>Check-in</span></button>`;
      } else if (pv.mode === 'ready') {
        if (pv.offScheduleToday)
          notes += line(
            'info',
            `Hôm nay ngoài lịch làm việc của bạn (${esc(L.scheduleText(S.me))}). Lượt chấm công sẽ chờ Admin xử lý và không tính tiền nếu chưa được Admin đồng ý.`
          );
        btn = inBtn();
      } else if (warnIn) {
        notes += line(
          'info',
          `${
            pv.mode === 'noshift'
              ? 'Chưa được gán ca cố định.'
              : pv.windowFrom
                ? `Ngoài giờ ca (Check-in trong ca từ ${esc(pv.windowFrom)} đến trước ${esc(pv.windowTo)}).`
                : 'Ngoài giờ ca.'
          } Lượt Check-in bây giờ chờ Admin xử lý, không tính tiền nếu chưa được Admin đồng ý.`
        );
        btn = inBtn();
      } else if (pv.mode === 'window') {
        notes += line(
          'info',
          pv.windowFrom
            ? `Ngoài giờ ca: Check-in mở từ ${esc(pv.windowFrom)} đến trước ${esc(pv.windowTo)}. Đi làm ngoài giờ ca thì nhờ Admin ghi giờ.`
            : esc(pv.message)
        );
        btn = `<button type="button" class="nv-punch is-off" id="nv-punch" disabled>${ic('login', 20, 2)}<span>Check-in</span>${pv.opensLater ? `<span class="nv-at nv-num">· mở lúc ${esc(pv.windowFrom)}</span>` : ''}</button>`;
      } else notes += line('info', esc(pv.message || ''));
    }
    return `<div class="nv-shift-h"><span>Ca hôm nay</span>${state}</div><div class="nv-shift-n">${esc(name)}</div>${meta}${notes}${btn}${live}`;
  }

  // Máy tính: dải tuần này (T2 → CN) và ba lượt gần đây
  function weekStrip() {
    const today = NV.today();
    const model = NV.model(NV.curMonth());
    const mon = L.mondayOf(today);
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = L.addDays(mon, i);
      const cell = model && model.cells.get(d);
      const hol = S.holidays.includes(d) && L.isScheduled(S.me, d);
      const on = L.isScheduled(S.me, d);
      const cls = [
        d === today ? 'is-cur' : '',
        hol ? 'is-hol' : '',
        on ? '' : 'is-off',
        cell && cell.tone === 'miss' ? 'is-miss' : '',
        cell && cell.tone === 'pend' ? 'is-pend' : ''
      ].join(' ');
      const lab = hol ? 'Lễ' : L.DOW_SHORT[L.dowOf(d)];
      return `<button type="button" class="nv-wd ${cls}" data-act="day" data-d="${esc(d)}" aria-label="${esc(`${L.weekdayLong(d)} ${L.dm(d)}`)}"><b>${esc(d.slice(8))}</b>${esc(lab)}</button>`;
    }).join('');
    return `<div class="nv-week" role="group" aria-label="Tuần này">${days}</div>`;
  }
  function recentDesktop() {
    const model = NV.model(NV.curMonth());
    if (!model) return '';
    const today = NV.today();
    const recent = model.list
      .filter(c => c.date < today)
      .flatMap(c => c.sessions.filter(r => r.outHm && r.inHm).map(r => ({ date: c.date, r })))
      .sort((a, b) => b.date.localeCompare(a.date) || b.r.inHm.localeCompare(a.r.inHm))
      .slice(0, 3);
    if (!recent.length) return '';
    return `<div class="nv-rec"><div class="nv-rec-l">Gần đây</div>${recent.map(x => `<div><span>${esc(L.weekdayLong(x.date))}, ${esc(L.dm(x.date))}</span><span class="nv-num">${esc(x.r.inHm)} – ${esc(x.r.outHm)}</span></div>`).join('')}</div>`;
  }

  NV.todayCard = () => {
    const me = S.me;
    const pv = NV.punchView();
    const extras = S.desktop && S.payroll ? `${weekStrip()}${recentDesktop()}` : ''; // không thuộc bảng lương: không có lịch
    return `<section class="nv-hero" aria-label="Hôm nay">
<div class="nv-hero-top nv-mobile-only"><img src="admin/gft-logo-light.png" alt="GFT"><button type="button" class="nv-avatar" data-act="tab" data-t="toi" aria-label="Hồ sơ của tôi">${esc(initials(me.name))}</button></div>
<h1 class="nv-greet">${esc(L.greeting(NV.nowIso()))}, ${esc(L.givenName(me.name))}</h1>
<p class="nv-greet-sub">${esc(L.weekdayLong(NV.today()))}, ${esc(L.dmy(NV.today()))} · ${esc(roleShort(me))}</p>
<div class="nv-shiftcard">${shiftCardBody(pv)}</div>${extras}</section>`;
  };

  /* ---------- cảnh báo thiếu chấm công (Hôm nay, điện thoại) ---------- */
  NV.alertCard = () => {
    const model = NV.model(NV.curMonth());
    if (!model || !model.missing.length) return '';
    const list = model.missing;
    const c = list[0];
    const more = list.length > 1 ? `, và ${list.length - 1} ngày khác` : '';
    const title = `Ngày ${L.dm(c.date)}: ${L.attentionText(c)}${more}`;
    const text =
      c.dayStatus === 'pending'
        ? `Ngày công đó đang chờ Admin xử lý. ${L.ADMIN_FIX}`
        : c.dayStatus === 'rejected'
          ? `Admin đã từ chối giải trình hoặc yêu cầu của ngày này. ${L.ADMIN_FIX}`
          : `Không có chấm công nào nên ngày này tính là ngày nghỉ. ${L.ADMIN_FIX}`;
    return `<div class="nv-alert" role="status"><div class="nv-alert-h">${ic('alert', 18)}<b>${esc(title)}</b></div><p>${esc(text)}</p><div class="nv-alert-b"><button type="button" class="nv-link" data-act="day" data-d="${esc(c.date)}" data-go="1">Xem ngày</button></div></div>`;
  };

  /* ---------- "Việc cần làm" (Hôm nay, điện thoại) ---------- */
  NV.todoCard = () => {
    const month = NV.curMonth();
    const model = NV.model(month);
    if (!model) return '';
    const item = (tone, icon, title, sub, go) =>
      `<${go ? `button type="button" data-act="tab" data-t="${go}"` : 'div'} class="nv-todo"><span class="nv-todo-i is-${tone}">${ic(icon, 14, 2.5)}</span><span class="nv-grow"><span class="nv-todo-t">${esc(title)}</span><small>${esc(sub)}</small></span>${go ? ic('chevr', 16) : ''}</${go ? 'button' : 'div'}>`;
    const mLabel = L.monthLabel(month)
      .replace('Tháng ', 'tháng ')
      .replace(/\/\d{4}$/, '');
    const miss = model.missing;
    const items = [];
    if (!miss.length) items.push(item('ok', 'check', `Chấm công ${mLabel} đã đủ`, 'Không ngày nào chờ xử lý'));
    else {
      items.push(
        item(
          'pend',
          'clock',
          `${miss.length} ngày cần để ý`,
          `${L.dm(miss[0].date)}${miss.length > 1 ? ` và ${miss.length - 1} ngày khác` : ''} · xem trong Chấm công`,
          'cham-cong'
        )
      );
    }
    const sh = S.sheets[month];
    const list = sh && sh.data ? L.approvalList(sh.data.approvals) : [];
    const pend = list.filter(a => a.status === 'pending').length;
    const rej = list.filter(a => a.status === 'rejected').length;
    if (pend)
      items.push(
        item(
          'pend',
          'clock',
          `${pend} yêu cầu đang chờ Admin xử lý`,
          'Chưa tính vào thu nhập · xem trong Yêu cầu',
          'yeu-cau'
        )
      );
    if (rej) items.push(item('err', 'x', `${rej} yêu cầu bị từ chối`, 'Xem lý do trong Yêu cầu', 'yeu-cau'));
    if (!pend && !rej)
      items.push(
        item('ok', 'check', 'Không có yêu cầu nào đang chờ xử lý', 'Muốn xin nghỉ hoặc khai OT, vào mục Yêu cầu')
      );
    return `<section class="nv-sec" aria-label="Việc cần làm"><h2 class="nv-h2">Việc cần làm</h2><div class="nv-card">${items.join('')}</div></section>`;
  };

  /* ---------- số liệu tháng ---------- */
  // Điện thoại: ba ô + một dòng tóm tắt; máy tính: ba ô trong thẻ Chấm công
  NV.statsBlock = (model, desktop) => {
    const s = model.summary;
    const lateCap = s.lateMin && desktop ? (s.cutMin ? ` · bị trừ ${L.fmtMin(s.cutMin)}` : ' · không bị trừ') : '';
    const missBad = s.missing;
    const tiles = desktop
      ? [
          [s.ok, 'Ngày tính công', ''],
          [s.lateMin, `Phút đi muộn${lateCap}`, ''],
          [s.pending, AS.LABEL.pending, missBad && s.pending ? 'is-bad' : '']
        ]
      : [
          [s.ok, 'Ngày tính công', ''],
          [s.lateMin, 'Phút đi muộn', ''],
          [s.cutMin, 'Phút bị trừ', '']
        ];
    return `<div class="nv-stats">${tiles.map(([n, l, c]) => `<div class="${c}"><b class="nv-num">${esc(n)}</b><span>${esc(l)}</span></div>`).join('')}</div>`;
  };
  NV.summaryLine = model => {
    const s = model.summary;
    const b = L.benefitsOf(S.me.type);
    const leave = L.hasLeaveAccount(S.me);
    const bits = [];
    if (s.pending) bits.push(`${s.pending} ngày chờ xử lý`);
    if (s.rejected) bits.push(`${s.rejected} ngày bị từ chối`);
    if (s.absent) bits.push(`${s.absent} ngày không có chấm công`);
    if (s.isat) bits.push(`${s.isat} ngày iSAT`);
    if (s.leave) bits.push(`${s.leave} ngày nghỉ phép`);
    const text = bits.length
      ? bits.join(' · ')
      : ['Không ngày nào chờ xử lý', b.isat ? 'không iSAT' : '', leave ? 'chưa nghỉ phép' : '']
          .filter(Boolean)
          .join(', ');
    const tone = s.missing ? 'is-warn' : bits.length ? '' : 'is-ok';
    return `<div class="nv-sumline ${tone}">${ic(s.missing ? 'alert' : bits.length ? 'info' : 'check', 16)}<span>${esc(text)}</span></div>`;
  };

  /* ---------- lịch tháng ---------- */
  const LEGEND = [
    ['ok', AS.LABEL['checked-out']],
    ['hol', 'Ngày lễ'],
    ['today', 'Hôm nay'],
    ['pend', 'Chờ xử lý'],
    ['err', 'Bị từ chối'],
    ['miss', 'Không có chấm công'],
    ['gold', 'iSAT, nghỉ phép năm'],
    ['soft', 'Nghỉ được duyệt, nghỉ sẽ bù'],
    ['grey', 'Nghỉ không lương'],
    ['off', 'Ngày nghỉ theo lịch'],
    ['fut', 'Chưa tới']
  ];
  const SPECIAL = new Set(['pend', 'err', 'miss', 'hol', 'gold', 'soft', 'grey']);
  // Ô hôm nay: nền tối, nhãn nhỏ "Hôm nay" (máy tính) hoặc chấm vàng (điện thoại); ô có trạng thái riêng giữ màu và thêm viền
  function todayLabel(c) {
    if (c.sessions.some(s => s.open)) return 'Hôm nay';
    if (c.scheduled && !c.holiday && !c.sessions.length) return 'Chưa vào';
    return 'Hôm nay';
  }
  const cellTone = c => (c.today && !SPECIAL.has(c.tone) ? 'today' : c.tone);
  NV.calendarGrid = (month, model, sel) => {
    const first = `${month}-01`;
    const lead = (L.dowOf(first) + 6) % 7;
    const dowRow = [1, 2, 3, 4, 5, 6, 0]
      .map(d => `<span class="nv-dow" aria-hidden="true">${L.DOW_SHORT[d]}</span>`)
      .join('');
    const blanks = '<span class="nv-day is-blank" aria-hidden="true"></span>'.repeat(lead);
    const cells = model.list
      .map(c => {
        const desc = L.describeDay(c, { me: S.me, cutRule: model.cutRule });
        const label = [
          `${L.weekdayLong(c.date)} ${L.dm(c.date)}`,
          desc.pill ? desc.pill.text : '',
          ...desc.badges.map(b => b.text),
          c.today ? 'hôm nay' : ''
        ]
          .filter(Boolean)
          .join(', ');
        const tone = cellTone(c);
        const isSel = sel === c.date;
        let small = '';
        if (tone === 'today')
          small = S.desktop ? `<small>${esc(todayLabel(c))}</small>` : '<i class="nv-dot" aria-hidden="true"></i>';
        else if (c.label) small = `<small>${esc(c.label)}</small>`;
        else if (c.tag) small = `<small class="nv-tag">${esc(c.tag)}</small>`;
        return `<button type="button" class="nv-day t-${esc(tone)}${c.today ? ' is-today' : ''}${isSel ? ' is-sel' : ''}" data-act="day" data-d="${esc(c.date)}" aria-label="${esc(label)}" aria-pressed="${isSel}">${esc(c.day)}${small}</button>`;
      })
      .join('');
    return `<div class="nv-cal" role="group" aria-label="Lịch ${esc(L.monthLabel(month).toLowerCase())}">${dowRow}${blanks}${cells}</div>`;
  };
  NV.legendBlock = (model, desktop) => {
    const used = new Set(model.list.map(cellTone));
    const items = LEGEND.filter(([t]) => used.has(t)).map(
      ([t, l]) => `<li><i class="nv-sw t-${t}"></i>${esc(t === 'off' ? `${l} (${L.scheduleText(S.me)})` : l)}</li>`
    );
    const hint = 'Bấm vào một ngày để xem giờ vào, ra';
    return `<ul class="nv-legend" aria-label="Chú thích màu">${items.join('')}${desktop ? `<li class="nv-legend-hint">${hint}</li>` : ''}</ul>${desktop ? '' : `<p class="nv-legend-hint">${hint}.</p>`}`;
  };
  // Thanh tháng: ‹ Tháng 11/2026 · Chưa tính lương › (điện thoại); nút tròn ở thẻ máy tính dùng NV.monthNavSmall
  NV.monthNav = month =>
    `<div class="nv-mon"><button type="button" class="nv-mb" id="nv-prev" data-act="month" data-d="-1" aria-label="Tháng trước">${ic('chevl', 20)}</button><div class="nv-mt"><h2>${esc(L.monthLabel(month))}</h2>${NV.monthState(month)}</div><button type="button" class="nv-mb" id="nv-next" data-act="month" data-d="1" aria-label="Tháng sau">${ic('chevr', 20)}</button></div>`;
  NV.monthNavSmall = month =>
    `<span class="nv-mnav">${month === NV.curMonth() ? '' : '<button type="button" class="nv-link" data-act="month-now">Về tháng này</button>'}<button type="button" class="nv-sq" id="nv-prev2" data-act="month" data-d="-1" aria-label="Tháng trước">${ic('chevl', 16)}</button><button type="button" class="nv-sq" id="nv-next" data-act="month" data-d="1" aria-label="Tháng sau">${ic('chevr', 16)}</button></span>`;

  /* ---------- chi tiết một ngày ---------- */
  function dayData(month, date) {
    const model = NV.model(month);
    const cell = model && model.cells.get(date);
    if (!cell) return null;
    return { cell, desc: L.describeDay(cell, { me: S.me, cutRule: model.cutRule }) };
  }
  const NOTE_TONE = t => (t === 'bad' ? 'bad' : t === 'warn' ? 'warn' : 'info');
  const sessText = r => {
    const out = r.outHm ? `${r.outHm}${r.outNextDay ? ' (hôm sau)' : ''}` : r.open ? 'đang làm' : 'không có';
    return `${r.inHm || 'không có'} → ${out}`;
  };
  // Dòng phụ của một lượt: nhãn và lý do ngắn do máy chủ tính, thời gian có mặt, điều chỉnh của Admin, giờ bấm Check-out chờ duyệt
  const sessSub = r => {
    const bits = [[AS.LABEL[r.status], r.statusNote].filter(Boolean).join(': ')];
    if (r.durMin != null) bits.push(`${L.fmtMin(r.durMin)} ${r.open ? 'tới giờ này' : 'có mặt'}`);
    if (r.corrections.length) bits.push(`Admin điều chỉnh: ${r.corrections[0].reason || ''}`);
    else if (!r.open && r.inHm) bits.push('giờ bấm gốc, luôn được giữ nguyên');
    if (r.requestedOutHm) bits.push(`bấm Check-out ${r.requestedOutHm}, chờ Admin duyệt giải trình`);
    return bits.filter(Boolean).join(' · ');
  };
  // Khay (điện thoại) và hộp (máy tính) chi tiết ngày
  NV.dayDetail = (month, date) => {
    const dd = dayData(month, date);
    if (!dd) return '';
    const { cell, desc } = dd;
    const extraBadges = desc.badges.filter(b => !desc.pill || b.text !== desc.pill.text);
    const badges = extraBadges.length
      ? `<div class="nv-tags">${extraBadges.map(b => pill(b.tone, b.text)).join('')}</div>`
      : '';
    const sess = desc.sessions.length
      ? desc.sessions
          .map(
            (r, i) =>
              `<div class="nv-lu"><b class="nv-num">Lượt ${i + 1} · ${esc(sessText(r))}</b><span>${esc(sessSub(r))}</span></div>`
          )
          .join('')
      : `<div class="nv-kvx"><span>Check-in</span><b class="${cell.scheduled && !cell.future && !cell.holiday ? 'nv-bad' : 'nv-muted'}">${cell.future ? 'Chưa tới ngày' : 'Không có dữ liệu'}</b></div>`;
    const kv = desc.rows
      .map(
        r =>
          `<div class="nv-kvx"><span>${esc(r.k)}</span><b class="${r.tone === 'bad' ? 'nv-bad' : r.tone === 'warn' ? 'nv-warn' : r.tone === 'muted' ? 'nv-muted' : ''}">${esc(r.v)}</b></div>`
      )
      .join('');
    const notes = desc.notes.map(n => noteBox(NOTE_TONE(n.tone), n.text)).join('');
    const khai = NV.khaiAction(month, date, cell, 'is-pri');
    return `<div class="nv-dh"><h2>${esc(desc.title)}</h2>${desc.pill ? pill(desc.pill.tone, desc.pill.text) : ''}</div><p class="nv-dsub">${esc(desc.shift)}</p>
${badges}${sess}<div class="nv-kvs">${kv}</div>${notes}<div class="nv-bt${khai ? '' : ' is-one'}"><button type="button" class="nv-btn" data-act="close-sheet" data-autofocus>Đóng</button>${khai}</div>`;
  };
  // Máy tính: ô tóm tắt ngày đang chọn dưới lịch
  NV.dayPanel = (month, date) => {
    const dd = dayData(month, date);
    if (!dd) return '';
    const { cell, desc } = dd;
    const rs = desc.sessions;
    let head;
    const forgotOut = cell.report && cell.report.state === 'forgot-out';
    const waitHm = (rs.find(r => r.requestedOutHm) || {}).requestedOutHm; // Check-out muộn chưa được Admin duyệt
    if (rs.length && forgotOut && rs[0].inHm)
      head = `Check-in ${rs[0].inHm}, không có Check-out${waitHm ? ` (bấm ${waitHm}, chờ Admin duyệt giải trình)` : ''}`;
    else if (rs.length) {
      const last = rs[rs.length - 1];
      head = `${rs[0].inHm || 'không có'} → ${last.open ? 'đang làm' : last.outHm || 'không có'}`;
    } else if (cell.today && cell.scheduled && !cell.holiday && S.me.shiftCode && L.shiftInfo(S.me.shiftCode)) {
      const sh = L.shiftInfo(S.me.shiftCode);
      head = `ca ${sh.name} bắt đầu ${sh.in}`;
    } else head = desc.pill ? desc.pill.text : '';
    const subBits = [];
    // Ngày thiếu chấm ảnh hưởng lương: dòng "Công ngày này: Chờ Admin xử lý" và câu nhờ Admin (ADMIN_FIX) đã có sẵn trong desc.rows / desc.notes,
    // nhân sự không có nút sửa giờ
    if (rs.length)
      subBits.push(
        rs.length === 1
          ? `Lượt 1 · ${L.fmtMin(rs[0].durMin || 0)} ${rs[0].open ? 'tới giờ này' : 'có mặt'}`
          : `${rs.length} lượt`
      );
    if (!rs.length && cell.today && cell.scheduled && !cell.holiday) subBits.push('Chưa có lượt Check-in hôm nay');
    subBits.push(...AS.dayNotes(rs));
    for (const r of desc.rows) subBits.push(`${lcFirst(r.k)} ${r.v}`);
    const note = desc.notes.find(n => n.tone !== 'info') || (!rs.length && desc.notes[0]) || null;
    const showPill = !!desc.pill;
    const tone = desc.pill && desc.pill.tone;
    return `<div class="nv-daybox" aria-live="polite"><div class="nv-grow"><div class="nv-db-t">${esc(`${L.weekdayLong(date)}, ${L.dm(date)}`)}${head ? ` · ${esc(head)}` : ''}</div><div class="nv-db-s">${esc(subBits.join(' · '))}</div>${note ? `<div class="nv-db-n ${note.tone === 'bad' ? 'nv-bad' : note.tone === 'warn' ? 'nv-warn' : ''}">${esc(note.text)}</div>` : ''}</div>${showPill ? pill(tone, desc.pill.text) : ''}${NV.khaiAction(month, date, cell, 'sm')}</div>`;
  };

  /* ---------- Chấm công (điện thoại): hôm nay và gần đây ---------- */
  NV.todayPunchCard = () => {
    const month = NV.curMonth();
    const dd = dayData(month, NV.today());
    if (!dd) return '';
    const { cell, desc } = dd;
    const pv = NV.punchView();
    const rs = desc.sessions;
    let tm, sub;
    if (rs.length) {
      const last = rs[rs.length - 1];
      tm = `${rs[0].inHm || '—'} → ${last.open ? 'đang làm' : last.outHm || 'không có'}`;
      const vs =
        rs.length > 1
          ? ''
          : pv.mode === 'open' && pv.earlyMin
            ? `Vào sớm ${pv.earlyMin} phút`
            : pv.mode === 'open' && pv.lateMin
              ? `Vào muộn ${pv.lateMin} phút`
              : '';
      sub = [
        vs,
        last.open
          ? `đã làm ${L.fmtMin(last.durMin || 0)}`
          : rs.length > 1
            ? `${rs.length} lượt`
            : `${L.fmtMin(rs[0].durMin || 0)} có mặt`,
        ...AS.dayNotes(rs)
      ]
        .filter(Boolean)
        .join(' · ');
    } else {
      tm = cell.scheduled && !cell.holiday ? 'Chưa Check-in' : desc.pill ? desc.pill.text : 'Không có ca';
      sub = desc.shift;
    }
    const p = desc.pill ? pill(desc.pill.tone, desc.pill.text) : '';
    const act = NV.khaiAction(month, cell.date, cell, 'is-outline');
    return `<section class="nv-sec" aria-label="Hôm nay"><h2 class="nv-h2">Hôm nay <small>${esc(L.weekdayLong(cell.date))}, ${esc(L.dm(cell.date))}</small></h2><div class="nv-card"><button type="button" class="nv-punchrow" data-act="day" data-d="${esc(cell.date)}"><span class="nv-grow"><span class="nv-tm nv-num">${esc(tm)}</span><span class="nv-s">${esc(sub)}</span></span>${p}</button>${act ? `<div class="nv-cardact">${act}</div>` : ''}</div></section>`;
  };
  NV.recentCard = () => {
    const model = NV.model(NV.curMonth());
    if (!model) return '';
    const today = NV.today();
    const days = model.list
      .filter(c => c.date < today && (c.scheduled || c.sessions.length))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 4);
    if (!days.length) return '';
    const rows = days
      .map(c => {
        const rs = c.sessions;
        const r = c.report;
        let ksub = '',
          v = '—',
          vsub = '',
          vcls = 'is-m';
        if (rs.length) {
          const last = rs[rs.length - 1];
          v = `${rs[0].inHm || '?'} – ${last.outHm || '?'}`;
          vcls = '';
        }
        if (c.holiday && !rs.length) ksub = 'Ngày lễ, nghỉ';
        else if (c.kind && c.kind !== 'work' && L.KIND_LABEL[c.kind]) ksub = L.KIND_LABEL[c.kind];
        // Ngày có lượt: nhãn của ngày (trừ Đã Check-out) kèm lý do ngắn; ngày không có chấm công ảnh hưởng lương: ghi rõ
        if (c.dayStatus && c.dayStatus !== 'checked-out')
          vsub = [AS.LABEL[c.dayStatus], AS.dayNotes(rs).join('; ')].filter(Boolean).join(': ');
        else if (!rs.length && r && r.state === 'absent') vsub = L.attentionText(c);
        else if (r && r.late)
          vsub = `Muộn ${r.late} phút, ${r.cutStartMin ? `trừ ${L.fmtMin(r.cutStartMin)}` : 'không bị trừ'}`;
        else if (r && r.early)
          vsub = `Về sớm ${r.early} phút, ${r.cutEndMin ? `trừ ${L.fmtMin(r.cutEndMin)}` : 'không bị trừ'}`;
        return `<button type="button" class="nv-kv" data-act="day" data-d="${esc(c.date)}"><span class="nv-k">${esc(L.weekdayLong(c.date))}, ${esc(L.dm(c.date))}${ksub ? `<small>${esc(ksub)}</small>` : ''}</span><span class="nv-v ${vcls}">${esc(v)}${vsub ? `<small class="is-pend">${esc(vsub)}</small>` : ''}</span></button>`;
      })
      .join('');
    return `<section class="nv-sec" aria-label="Gần đây"><h2 class="nv-h2">Gần đây</h2><div class="nv-card">${rows}</div></section>`;
  };

  /* ---------- hồ sơ và đổi mật khẩu ---------- */
  const fact = (k, v) =>
    `<div class="nv-kv"><span class="nv-k">${esc(k)}</span><span class="nv-v">${esc(v)}</span></div>`;
  function leaveText() {
    const lv = NV.leave();
    return lv ? `${fmtNum(lv.balance)} ngày` : '';
  }
  NV.profileCard = () => {
    const me = S.me;
    const sh = me.shiftCode ? L.shiftInfo(me.shiftCode) : null;
    const lv = L.hasLeaveAccount(me) ? leaveText() : '';
    return `<section class="nv-card nv-sec" aria-label="Hồ sơ của tôi"><div class="nv-me"><span class="nv-avatar is-lg">${esc(initials(me.name))}</span><div><b>${esc(me.name)}</b><span>${esc(L.roleLine(me))}</span></div></div>
${fact('Tên đăng nhập', me.username)}${fact('Ca cố định', sh ? shiftText(sh) : 'Chưa gán')}${fact('Lịch làm việc', L.scheduleText(me))}${me.startDate ? fact('Ngày bắt đầu làm', L.dmy(me.startDate)) : ''}${me.jobTitle ? fact('Chức danh', me.jobTitle) : ''}${lv ? fact('Phép năm còn', lv) : ''}</section>`;
  };
  // Hộp "Hồ sơ của tôi" trên máy tính: lưới hai cột
  NV.profileFacts = () => {
    const me = S.me;
    const sh = me.shiftCode ? L.shiftInfo(me.shiftCode) : null;
    const lv = L.hasLeaveAccount(me) ? leaveText() : '';
    const cells = [
      ['Họ tên', me.name],
      ['Tên đăng nhập', me.username],
      ['Loại · bậc', roleShort(me)],
      ['Ca cố định', sh ? shiftText(sh) : 'Chưa gán'],
      ['Lịch làm việc', L.scheduleText(me)],
      ['Ngày bắt đầu làm', me.startDate ? L.dmy(me.startDate) : 'Chưa có'],
      ...(me.jobTitle ? [['Chức danh', me.jobTitle]] : []),
      ...(lv ? [['Phép năm còn', lv]] : []),
      ['Tài khoản', me.locked ? 'Đã khoá' : 'Đang dùng']
    ];
    return `<div class="nv-pf2">${cells.map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div>`;
  };
  const pwField = (id, label, auto, hint = '') =>
    `<div class="nv-field"><label class="nv-lbl" for="${id}">${esc(label)}${hint ? ` <small>${esc(hint)}</small>` : ''}</label><div class="nv-pw"><input id="${id}" class="nv-input" type="password" autocomplete="${auto}"><button type="button" class="nv-pwshow" data-act="pw-show" aria-label="Hiện mật khẩu" aria-pressed="false">Hiện</button></div></div>`;
  // Biểu mẫu đổi mật khẩu: id giữ nguyên (#nv-pwd, #pw-cur, #pw-new, #pw-new2, #pw-msg, #pw-go)
  NV.passwordForm = ({ desktop } = {}) => {
    const fields = desktop
      ? `${pwField('pw-cur', 'Mật khẩu hiện tại', 'current-password')}<div class="nv-grid2">${pwField('pw-new', 'Mật khẩu mới', 'new-password')}${pwField('pw-new2', 'Nhập lại mật khẩu mới', 'new-password')}</div>`
      : `${pwField('pw-cur', 'Mật khẩu hiện tại', 'current-password')}${pwField('pw-new', 'Mật khẩu mới', 'new-password')}${pwField('pw-new2', 'Nhập lại mật khẩu mới', 'new-password')}`;
    const foot = desktop
      ? `<div class="nv-dlg-f"><button type="button" class="nv-btn" data-act="close-sheet">Đóng</button><button type="submit" class="nv-btn is-pri" id="pw-go">${ic('key', 16)}Đổi mật khẩu</button></div>`
      : `<div class="nv-bt"><button type="button" class="nv-btn" data-act="close-sheet">Huỷ</button><button type="submit" class="nv-btn is-pri" id="pw-go">Đổi mật khẩu</button></div>`;
    return `<form class="nv-form" id="nv-pwd" novalidate>${desktop ? '<h3 class="nv-h3">Đổi mật khẩu</h3>' : ''}${fields}<div id="pw-msg" role="status" aria-live="polite"></div>${foot}</form>`;
  };
  NV.actions['pw-show'] = el => {
    const input = el.previousElementSibling;
    if (!input) return;
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    el.textContent = show ? 'Ẩn' : 'Hiện';
    el.setAttribute('aria-pressed', String(show));
    el.setAttribute('aria-label', show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu');
  };
})(window.NV);
