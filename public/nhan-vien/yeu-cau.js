/* Giao diện Nhân viên: Yêu cầu. Nút tạo yêu cầu (mở biểu mẫu khai ngày ở khai.js), danh sách yêu cầu của tháng
   (sheet.approvals do máy chủ trả: Chờ xử lý, Đã đồng ý, Đã từ chối) và phép năm (sheet.leaveBalance, kèm sổ phép GET /api/leave/ledger). Không có số tiền ở đây. */
(function (NV) {
  'use strict';
  const { esc, ic, S, L } = NV;

  const STATUS = {
    pending: ['pending', 'Chờ xử lý'],
    approved: ['done', 'Đã đồng ý'],
    rejected: ['rejected', 'Đã từ chối']
  };
  const monthShort = month => L.monthLabel(month).replace(/\/\d{4}$/, '');

  /* ---------- nút tạo yêu cầu: đủ các nút (biểu mẫu cho chọn mọi loại ngày, ghi chú "chức vụ chưa có quyền lợi này"; máy chủ cảnh báo khi lưu) ---------- */
  function actionList() {
    const b = { ...L.benefitsOf(S.me.type), paidLeave: true, ot: true, makeup: true, approved: true };
    const lv = L.hasLeaveAccount(S.me) ? NV.leave() : null;
    const out = [];
    if (b.paidLeave)
      out.push({
        want: 'leave',
        icon: 'cal',
        label: 'Xin nghỉ phép năm',
        sub: lv ? `Còn ${NV.fmtNum(lv.balance)} ngày phép` : '',
        side: lv ? `còn ${NV.fmtNum(lv.balance)} ngày` : ''
      });
    if (b.ot || b.makeup)
      out.push({
        want: 'extra',
        icon: 'clock',
        label: b.ot ? 'Khai OT hoặc làm bù' : 'Khai làm bù theo giờ',
        sub: 'Theo giờ, ngoài giờ ca'
      });
    // Các loại nghỉ chọn được ở một ngày làm việc (cùng điều kiện với L.dayPlan)
    const other = [b.paidLeave ? 'nghỉ không lương' : '', 'nghỉ sẽ làm bù', b.approved ? 'nghỉ được duyệt' : '']
      .filter(Boolean)
      .join(', ');
    out.push({
      want: '',
      icon: 'edit',
      label: NV.thay ? 'Khai một ngày khác' : 'Yêu cầu khác',
      sub: NV.lcFirst(other).replace(/^./, c => c.toUpperCase())
    });
    // Xin tạm ứng (ung-luong.js): null thì không hiện nút
    const adv = NV.advanceAction ? NV.advanceAction(S.month) : null;
    if (adv) out.push(adv);
    return out;
  }
  // Điện thoại: danh sách dòng có ô biểu tượng
  NV.requestActions = () => {
    const row = a =>
      a.want === 'advance'
        ? `<button type="button" class="nv-act" data-act="adv-open" data-month="${esc(S.month)}"><span class="nv-act-i">${ic(a.icon, 18)}</span><span class="nv-grow"><b>${esc(a.label)}</b>${a.sub ? `<small>${esc(a.sub)}</small>` : ''}</span>${ic('chevr', 18)}</button>`
        : `<button type="button" class="nv-act" data-act="khai" data-want="${esc(a.want)}"><span class="nv-act-i">${ic(a.icon, 18)}</span><span class="nv-grow"><b>${esc(a.label)}</b>${a.sub ? `<small>${esc(a.sub)}</small>` : ''}</span>${ic('chevr', 18)}</button>`;
    const soonRow = (icon, label) =>
      `<div class="nv-act is-off" aria-disabled="true"><span class="nv-act-i">${ic(icon, 18)}</span><span class="nv-grow"><b>${esc(label)}</b></span>${NV.soon()}</div>`;
    // Khai thay: bỏ mục "Sắp có" của chính nhân sự (công tác). Nhân sự không có mục sửa giờ chấm công
    const soon = NV.thay ? '' : soonRow('pin', 'Đi công tác');
    return `<section class="nv-card nv-sec" aria-label="Tạo yêu cầu">${actionList().map(row).join('')}${soon}</section>`;
  };
  // Máy tính: nút viền trái chữ
  function actionButtons() {
    const btn = a =>
      a.want === 'advance'
        ? `<button type="button" class="nv-abtn" data-act="adv-open" data-month="${esc(S.month)}">${ic(a.icon, 16)}<span>${esc(a.label)}</span>${a.side || a.sub ? `<small>${esc(a.side || a.sub)}</small>` : ''}</button>`
        : `<button type="button" class="nv-abtn" data-act="khai" data-want="${esc(a.want)}">${ic(a.icon, 16)}<span>${esc(a.label)}</span>${a.side ? `<small>${esc(a.side)}</small>` : ''}</button>`;
    return `<div class="nv-abtns">${actionList().map(btn).join('')}</div>`;
  }

  /* ---------- danh sách yêu cầu của tháng ---------- */
  function listOf(month) {
    const sh = S.sheets[month];
    return sh && sh.data ? L.approvalList(sh.data.approvals) : [];
  }
  // Giờ của yêu cầu OT ngày lễ, lấy từ ngày đã khai (days[date])
  function timesOf(month, a) {
    const sh = S.sheets[month];
    const day = sh && sh.data && sh.data.days ? sh.data.days[a.date] : null;
    if (!day) return '';
    if (a.item === 'willmakeup') {
      const plans = Array.isArray(day.makeupPlans)
        ? day.makeupPlans
        : day.makeupDate
          ? [{ date: day.makeupDate, from: '', to: '' }]
          : [];
      return plans.map(p => `${L.dm(p.date)}${p.from && p.to ? ` ${p.from}–${p.to}` : ''}`).join(', ');
    }
    if (a.item === 'ot' && a.holiday && day.in && day.out) return `${day.in}–${day.out}`;
    return '';
  }
  const reqRow = (month, a, compact) => {
    const [tone, text] = STATUS[a.status] || STATUS.pending;
    const t = timesOf(month, a);
    const when = compact ? `${L.weekdayLong(a.date)}, ${L.dm(a.date)}` : `${L.weekdayLong(a.date)}, ${L.dmy(a.date)}`;
    const reason =
      a.status === 'rejected'
        ? `<div class="nv-rq-r">${a.note ? `Lý do: ${esc(a.note)}` : 'Admin chưa ghi lý do'}</div>`
        : '';
    return `<div class="nv-reqrow"><span class="nv-dt"><b>${esc(a.date.slice(8))}</b>T${esc(String(Number(a.date.slice(5, 7))))}</span><div class="nv-grow"><div class="nv-rq-t">${esc(a.label)}</div><div class="nv-rq-s">${esc(when)}${t ? ` · ${esc(t)}` : ''}</div>${reason}</div>${NV.pill(tone, text)}</div>`;
  };
  // Điện thoại: ghi chú yêu cầu chờ, danh sách, ô trống
  NV.requestsSection = month => {
    const sh = S.sheets[month];
    if (sh && sh.status === 'error')
      return `<section class="nv-card nv-sec">${NV.errorBox(sh.error, 'reload-month')}</section>`;
    const list = listOf(month);
    const pend = list.filter(a => a.status === 'pending').length;
    const mine = NV.thay ? 'Yêu cầu' : 'Yêu cầu của tôi';
    const note = pend
      ? `<div class="nv-sec">${NV.noteBox('warn', `<b>${esc(pend)} yêu cầu chờ xử lý</b> chưa tính vào thu nhập. Khi Admin đồng ý, thu nhập sẽ thay đổi.`, true)}</div>`
      : '';
    const body =
      !sh || (sh.status === 'loading' && !sh.data)
        ? `<div class="nv-pad">${NV.skeleton(3)}</div>`
        : list.length
          ? list.map(a => reqRow(month, a)).join('')
          : `<div class="nv-wait">${ic('inbox', 20)}<div><b>${NV.thay ? 'Chưa có yêu cầu nào' : 'Bạn chưa gửi yêu cầu nào'} trong ${esc(monthShort(month).toLowerCase())}</b><span>Đơn nghỉ, OT, làm bù ${NV.thay ? 'đã khai' : 'bạn gửi'} sẽ hiện ở đây cùng trạng thái: Chờ xử lý, Đã đồng ý hoặc Đã từ chối.</span></div></div>`;
    return `${note}<section class="nv-sec" aria-label="${mine}"><h2 class="nv-h2">${mine} <small>${esc(monthShort(month))}${pend ? ` · ${pend} chờ xử lý` : ''}</small></h2><div class="nv-card">${body}</div></section>`;
  };
  // Máy tính: thẻ Yêu cầu (nút tạo và danh sách)
  NV.requestsCardDesktop = month => {
    const sh = S.sheets[month];
    const list = listOf(month);
    const pend = list.filter(a => a.status === 'pending').length;
    const body =
      sh && sh.status === 'error'
        ? `<div class="nv-pad">${NV.errorBox(sh.error, 'reload-month')}</div>`
        : !sh || (sh.status === 'loading' && !sh.data)
          ? `<div class="nv-pad">${NV.skeleton(2)}</div>`
          : list.length
            ? `<div class="nv-reqs">${list.map(a => reqRow(month, a, true)).join('')}</div>`
            : `<div class="nv-empty"><b>Chưa có yêu cầu nào trong ${esc(monthShort(month).toLowerCase())}</b>${NV.thay ? 'Khoản khai thay' : 'Yêu cầu bạn gửi'} sẽ hiện ở đây cùng trạng thái xử lý.</div>`;
    return `<section class="nv-card nv-dcard" aria-label="Yêu cầu của tôi"><div class="nv-card-h"><h2>Yêu cầu</h2><span class="nv-cap">${esc(monthShort(month))}${pend ? ` · ${pend} chờ xử lý` : ''}</span></div>${actionButtons()}${body}${NV.explainBlock ? NV.explainBlock() : ''}${NV.advanceBlock ? NV.advanceBlock(month) : ''}</section>`;
  };

  /* ---------- phép năm (tab Yêu cầu trên điện thoại; thẻ riêng trên máy tính) ----------
     Số của máy chủ (GET /api/sheet → leaveBalance): được cộng, đã dùng, còn lại, chi tiết cộng (tháng làm việc, thâm niên,
     sinh nhật) và expiring { days, on }: số ngày chưa dùng đến hạn on (31/01) sẽ được quy ra tiền vào lương tháng sau. Chi tiết nào
     máy chủ không gửi hoặc bằng 0 thì bỏ dòng. Giao diện không tính ngày phép nào. */
  const num = (src, ...keys) => {
    for (const k of keys) if (src && typeof src[k] === 'number' && Number.isFinite(src[k])) return src[k];
    return null;
  };
  const BREAKDOWN = [
    ['Theo tháng làm việc', ['months', 'monthDays']],
    ['Thâm niên', ['seniority', 'seniorityDays']],
    ['Sinh nhật', ['birthdays', 'birthdayDays']],
    ['Điều chỉnh', ['adjust']]
  ];
  function leaveBreakdown(lv) {
    const obj = x => (x && typeof x === 'object' ? x : null);
    const src = obj(lv.breakdown) || obj(lv.detail) || lv;
    return BREAKDOWN.map(([label, keys]) => [label, num(src, ...keys) ?? num(lv, ...keys)])
      .filter(([, v]) => v !== null && v !== 0)
      .map(
        ([label, v]) =>
          `<div class="nv-kv"><span class="nv-k">${esc(label)}</span><span class="nv-v nv-num">${v > 0 ? '+' : ''}${esc(NV.fmtNum(v))} ngày</span></div>`
      )
      .join('');
  }
  // Số ngày sắp hết hạn: ngày hết hạn (on) do máy chủ gửi, tháng trả tiền là tháng sau đó
  function leaveExpiring(lv) {
    const ex = lv.expiring && typeof lv.expiring === 'object' ? lv.expiring : null;
    if (!ex || !(ex.days > 0)) return '';
    const on = L.isDate(ex.on) ? ex.on : '';
    const payMonth = on ? Number(L.addMonths(on.slice(0, 7), 1).slice(5)) : 2;
    return NV.noteBox(
      'warn',
      `<b>${esc(NV.fmtNum(ex.days))} ngày</b> sẽ được quy ra tiền vào lương tháng ${esc(payMonth)} nếu chưa dùng trước ${esc(on ? L.dm(on) : '31/01')}.`,
      true
    );
  }
  /* Sổ phép (GET /api/leave/ledger, nạp ở data.js): các lần cộng / hết hạn mới nhất trước, số ngày đúng như máy chủ trả (có dấu).
     Chỉ dùng lại dòng nv-kv của thẻ, không thêm bố cục. Không có sổ thì không có phần này. */
  const LEDGER_SHOWN = 12; // số dòng sổ hiện trong thẻ (giới hạn hiển thị, không phải tham số nghiệp vụ)
  const LEDGER_LABEL = {
    start: 'Cộng khi vào làm',
    month: 'Tròn tháng làm việc',
    year: 'Tròn năm làm việc',
    seniority: 'Thâm niên',
    birthday: 'Sinh nhật',
    expire: 'Hết hạn'
  };
  function leaveLedger() {
    const book = NV.ledger();
    if (!book || !book.events.length) return '';
    const list = book.events.slice().reverse();
    const rows = list
      .slice(0, LEDGER_SHOWN)
      .map(
        e =>
          `<div class="nv-kv"><span class="nv-k">${esc(LEDGER_LABEL[e.kind] || String(e.kind || '—'))} · ${esc(L.dmy(e.onDate))}</span><span class="nv-v nv-num">${Number(e.days) > 0 ? '+' : ''}${esc(NV.fmtNum(e.days))} ngày</span></div>`
      )
      .join('');
    const more =
      list.length > LEDGER_SHOWN
        ? `<div class="nv-kv"><span class="nv-k nv-muted">và ${esc(NV.fmtNum(list.length - LEDGER_SHOWN))} dòng cũ hơn</span></div>`
        : '';
    return `<div class="nv-kv"><span class="nv-k nv-muted">Sổ phép</span></div><div class="nv-leavebd">${rows}${more}</div>`;
  }
  function leaveBody() {
    const lv = NV.leave();
    const sh = S.sheets[NV.curMonth()];
    const loaded = !!(sh && sh.data);
    const kv = (k, v) =>
      `<div class="nv-kv"><span class="nv-k">${esc(k)}</span><span class="nv-v">${esc(v)}</span></div>`;
    if (!lv)
      return `<div class="nv-wait">${ic('info', 20)}<div><b>${loaded ? 'Chưa có số phép năm' : 'Đang tải số phép'}</b><span>Số phép do máy chủ tính theo hồ sơ của bạn.</span></div></div>`;
    const bd = leaveBreakdown(lv);
    const exp = leaveExpiring(lv);
    return `<div class="nv-bal"><b class="nv-num">${esc(NV.fmtNum(lv.balance))}</b><span>ngày còn lại</span></div>${kv('Được cộng', `${NV.fmtNum(lv.accrued)} ngày`)}${bd ? `<div class="nv-leavebd">${bd}</div>` : ''}${kv('Đã dùng', `${NV.fmtNum(lv.used)} ngày`)}${L.isDate(lv.asOf) ? `<div class="nv-kv"><span class="nv-k nv-muted">Tính đến ${esc(L.dmy(lv.asOf))}</span></div>` : ''}${leaveLedger()}${exp ? `<div class="nv-pad0 nv-gap">${exp}</div>` : ''}`;
  }
  NV.leaveCard = () => {
    if (!L.hasLeaveAccount(S.me)) return '';
    return `<section class="nv-sec" aria-label="Nghỉ phép"><h2 class="nv-h2">Phép năm</h2><div class="nv-card">${leaveBody()}</div></section>`;
  };
  // Máy tính: thẻ riêng ở cột phải, dưới thẻ Yêu cầu
  NV.leaveCardDesktop = () => {
    if (!L.hasLeaveAccount(S.me) || NV.thay) return '';
    return `<section class="nv-card nv-dcard" aria-label="Phép năm"><div class="nv-card-h"><h2>Phép năm</h2></div>${leaveBody()}</section>`;
  };
})(window.NV);
