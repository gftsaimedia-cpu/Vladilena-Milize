/* Giao diện Nhân viên: thẻ Thu nhập. CHỈ hiện số máy chủ tính (GET /api/me/estimate: net, trace, m, allowanceStatus,
   toDate, pendingItems); không có phép tính tiền nào ở đây. Dòng nào máy chủ không gửi thì không hiện.
   Các phần máy chủ chưa trả (tỷ lệ bảo hiểm, ngày ứng lương, ngày gửi phiếu, tổng các khoản trừ) không hiện.
   Mỗi khoản thu nhập là MỘT số tiền của máy chủ (trace): ô tiền không kèm câu giải thích cách tính hay số giờ. */
(function (NV) {
  'use strict';
  const { esc, ic, S, L } = NV;

  const isNum = n => typeof n === 'number' && Number.isFinite(n);
  const fmt = n => Number(n).toLocaleString('vi-VN', { maximumFractionDigits: 0 });
  const vnd = n => `${fmt(n)} ₫`;
  const minus = n => `−${fmt(n)}`;
  NV.vnd = vnd;
  NV.fmtMoney = fmt;
  // Số lớn: "4.808.654 ₫" với đơn vị nhỏ; gạch chân nét đứt khi là số ước tính
  const big = (n, est) =>
    `<span class="nv-hero-v nv-num${est ? ' nv-est-u' : ''}">${esc(fmt(n))}<span class="nv-unit"> ₫</span></span>`;

  /* ---------- trạng thái của tháng ---------- */
  const STATE_TEXT = {
    open: 'Chưa tính lương',
    attendance_locked: 'Đã chốt công',
    calculated: 'Đã tính lương',
    reviewed: 'Đã tính lương',
    approved: 'Đã phê duyệt',
    paid: 'Đã trả lương'
  };
  NV.monthState = month => {
    const es = S.estimates[month];
    const d = es && es.data;
    if (d && d.official)
      return `<span class="nv-mstate is-off">${d.period && d.period.status === 'paid' && S.desktop ? 'Chính thức · đã trả lương' : 'Chính thức'}</span>`;
    const st = d && d.period && d.period.status;
    return `<span class="nv-mstate">${esc(STATE_TEXT[st] || 'Chưa tính lương')}</span>`;
  };

  /* ---------- các dòng của phiếu: lấy nguyên từ máy chủ ---------- */
  // Ngày của dòng "OT ngày lễ": theo các ca có giờ lễ máy chủ đã tính (holidayShifts), gồm cả ca bắt đầu ngày thường rồi sang ngày lễ.
  // Máy chủ không gửi (phiếu có số Admin sửa đã bỏ dòng ngày) thì lấy các ngày lễ có lượt Check-in hoặc đã duyệt đi làm.
  function holidayDates(d, month) {
    if (Array.isArray(d.holidayShifts))
      return d.holidayShifts.map(s => (s.onHoliday ? L.dm(s.date) : `ca ${L.dm(s.date)} sang ngày lễ`)).join(', ');
    const model = NV.model(month);
    if (!model) return '';
    return model.list
      .filter(c => c.holiday && (c.sessions.length || c.approvedItem === 'ot'))
      .map(c => L.dm(c.date))
      .join(', ');
  }
  /* Dòng "Tiền ngày công": số ngày công và ngày công chuẩn (máy chủ gửi ở GET /api/sheet → workSchedule). Số tiền của dòng (trace.tienNgayCong)
     còn gồm lương ngày nghỉ hưởng lương (lễ, phép, iSAT), nên ghi kèm số ngày đó để dòng nhỏ không chỉ nói "N ngày công". Số ngày lấy từ
     máy chủ: paidDays (đếm theo dòng ngày, lib/slip-paid.js → staffDayNotesOf); không có thì số đếm của tháng (m.holiday, m.leave, m.isat)
     khi máy chủ báo có tiền ngày nghỉ (m.off). */
  function daysSub(d, month) {
    const t = d.trace || {},
      m = d.m || {};
    const n = isNum(t.ngayDiLam) ? t.ngayDiLam : isNum(m.count) ? m.count : null;
    if (n === null) return '';
    const std = L.workdaysStdOf(month);
    const head =
      isNum(std) && std > 0 ? `${NV.fmtNum(n)} trên ${NV.fmtNum(std)} ngày công chuẩn` : `${NV.fmtNum(n)} ngày công`;
    const paid = d.paidDays && typeof d.paidDays === 'object' ? d.paidDays : isNum(m.off) && m.off > 0 ? m : {};
    const extra = [
      [paid.holiday, 'ngày lễ'],
      [paid.leave, 'ngày phép'],
      [paid.isat, 'ngày iSAT']
    ]
      .filter(([k]) => isNum(k) && k > 0)
      .map(([k, label]) => `${NV.fmtNum(k)} ${label}`);
    return extra.length ? `${head} · kể cả lương ${extra.join(', ')}` : head;
  }
  const shiftAllowLabel = m =>
    (m.night || 0) > 0 && !(m.flex || 0)
      ? 'Phụ cấp ca đêm'
      : (m.flex || 0) > 0 && !(m.night || 0)
        ? 'Phụ cấp ca Flex'
        : 'Phụ cấp ca';
  // kpi: dòng Lương KPI (null nếu chức vụ không có KPI); inc: các khoản thu nhập; cuts: các khoản trừ
  function linesOf(d, month) {
    const m = d.m || {},
      n = d.net || {},
      t = d.trace || {};
    const inc = [];
    const add = (label, short, v, sub = '') => inc.push({ label, short, v, sub });
    // Phiếu có khoản Admin đã điều chỉnh: máy chủ bỏ dòng không ánh xạ được (vắng hoặc null), không hiện 0 ₫ giả
    if (isNum(t.tienNgayCong)) add('Tiền ngày công', 'Tiền ngày công', t.tienNgayCong, daysSub(d, month));
    const sa = shiftAllowLabel(m);
    // OT ngày thường và OT cuối tuần là hai số của máy chủ (m.otWeekdayPay, m.otWeekendPay); bản chụp cũ chưa chia thì một dòng Tiền OT từ vết
    const otSplit = isNum(m.otWeekdayPay) && isNum(m.otWeekendPay);
    for (const [k, label, short, sub, amount = t[k]] of [
      ['phuCapCa', sa, sa.replace('Phụ cấp ', '')],
      ['gioNghiDem', 'Giờ nghỉ đêm', 'giờ nghỉ đêm'],
      ['lamBu', 'Làm bù', 'làm bù'], // giờ làm bù đã duyệt trả đủ giờ × lương giờ; mỗi dòng chỉ hiện số tiền của máy chủ, không ghi số giờ
      ['tienOt', otSplit ? 'OT ngày thường' : 'Tiền OT', 'OT', '', otSplit ? m.otWeekdayPay : t.tienOt],
      ...(otSplit ? [['otCuoiTuan', 'OT cuối tuần', 'OT cuối tuần', '', m.otWeekendPay]] : []),
      ['tienLamLe', 'OT ngày lễ', 'OT lễ', holidayDates(d, month)] // OT ngày lễ: giờ OT được duyệt rơi vào ngày lễ
    ])
      if (isNum(amount) && amount !== 0) add(label, short, amount, sub);
    // đi lại, chuyên cần: hiện khi máy chủ báo loại này có phụ cấp chuyên cần (allowanceStatus.hasAttendance), hoặc khi số khác 0
    const showAllow =
      (d.allowanceStatus && d.allowanceStatus.hasAttendance === true) ||
      (t.phuCapDiLai || 0) !== 0 ||
      (t.phuCapChuyenCan || 0) !== 0;
    if (showAllow) {
      add('Phụ cấp đi lại', 'đi lại', t.phuCapDiLai ?? m.travel ?? 0);
      add('Phụ cấp chuyên cần', 'chuyên cần', t.phuCapChuyenCan ?? m.attendance ?? 0);
    }
    // Khối phụ cấp do C&B thêm (m.blocks) và khoản điền thêm đã duyệt (m.entries): mỗi khoản một dòng, số của máy chủ
    for (const b of Array.isArray(m.blocks) ? m.blocks : [])
      if (b && isNum(Number(b.amount)) && Number(b.amount) !== 0)
        add(String(b.label || 'Khoản thêm'), String(b.label || 'khoản thêm'), Number(b.amount));
    const extras = (Array.isArray(m.entries) ? m.entries : []).filter(e => e && isNum(Number(e.amount)));
    const extraLabel = e => String(e.slipLine || e.slip_line || e.label || 'Khoản điền thêm');
    for (const e of extras) if (e.direction !== 'deduct') add(extraLabel(e), extraLabel(e), Math.abs(Number(e.amount)));
    const kpi = m.kpiAmt !== undefined && m.kpiAmt !== null ? kpiLine(d) : null;
    const cuts = [];
    const cut = (label, short, v, sub = '') => cuts.push({ label, short, v, sub });
    const split = ['bhxh', 'bhyt', 'bhtn'].some(k => isNum(n[k]));
    if (split)
      for (const [k, label] of [
        ['bhxh', 'Bảo hiểm xã hội'],
        ['bhyt', 'Bảo hiểm y tế'],
        ['bhtn', 'Bảo hiểm thất nghiệp']
      ])
        if (isNum(n[k]) && n[k] !== 0) cut(label, 'bảo hiểm', n[k]);
    // Bảo hiểm đã được điều chỉnh: máy chủ bỏ ba dòng chia nhỏ, chỉ còn tổng bảo hiểm
    if (!split && isNum(n.insurance) && n.insurance !== 0) cut('Bảo hiểm', 'bảo hiểm', n.insurance);
    if (isNum(n.tax) && n.tax !== 0) cut('Thuế TNCN', 'thuế TNCN', n.tax);
    if (isNum(n.advance) && n.advance !== 0) cut('Tạm ứng', 'tạm ứng', n.advance, 'Admin đã duyệt tạm ứng tháng này');
    for (const e of extras)
      if (e.direction === 'deduct') cut(extraLabel(e), extraLabel(e).toLowerCase(), Math.abs(Number(e.amount)));
    return { inc, kpi, cuts };
  }
  // Dòng tóm tắt các khoản trừ cho máy tính: bảo hiểm gộp là tổng bảo hiểm do máy chủ gửi (net.insurance), không cộng ở giao diện
  function cutsBrief(d) {
    const n = d.net || {};
    const bits = [];
    if (isNum(n.insurance) && n.insurance !== 0) bits.push(`Bảo hiểm ${fmt(n.insurance)}`);
    if (isNum(n.tax) && n.tax !== 0) bits.push(`thuế TNCN ${fmt(n.tax)}`);
    if (isNum(n.advance) && n.advance !== 0) bits.push(`tạm ứng ${fmt(n.advance)}`);
    for (const e of Array.isArray((d.m || {}).entries) ? d.m.entries : [])
      if (e && e.direction === 'deduct' && isNum(Number(e.amount)))
        bits.push(`${String(e.slipLine || e.label || 'khoản trừ').toLowerCase()} ${fmt(Math.abs(Number(e.amount)))}`);
    if (n.insured === false && bits.length) bits.push('không đóng bảo hiểm');
    return bits.map((b, i) => (i ? b : b[0].toUpperCase() + b.slice(1))).join(' · ');
  }
  function kpiLine(d) {
    const m = d.m || {};
    const pct = x => `${NV.fmtNum(x)}%`;
    let sub;
    if (m.kpiMethod === 'five') {
      const incomplete = m.kpiReason === 'incomplete' || (Array.isArray(m.kpiMissing) && m.kpiMissing.length > 0);
      sub = incomplete
        ? 'Chờ chấm đủ điểm'
        : isNum(m.kpiPct)
          ? `Tổng điểm ${pct(m.kpiPct)} · ${m.kpiPass === false ? 'chưa đạt' : 'đạt'}`
          : 'Chờ chấm điểm';
    } else sub = ''; // tháng trước tháng quản lý đầu tiên: chỉ hiện số của máy chủ, không có tự đánh giá %
    const t = d.trace || {};
    return { label: 'Lương KPI', v: t.luongKpi ?? m.kpiPay ?? 0, sub };
  }
  const kvRow = (label, sub, value, cls = '') =>
    `<div class="nv-kv ${cls}"><span class="nv-k">${esc(label)}${sub ? `<small>${esc(sub)}</small>` : ''}</span><span class="nv-v nv-num${value === '0' ? ' is-z' : ''}">${esc(value)}</span></div>`;

  /* ---------- ghi chú dưới số ---------- */
  function pendingNote(d) {
    const list = Array.isArray(d.pendingItems) ? d.pendingItems : null;
    if (!list) return '';
    const pend = list.filter(x => x && x.status === 'pending');
    const rej = list.filter(x => x && x.status === 'rejected').length;
    const out = [];
    if (pend.length) {
      const one = pend.length === 1 ? ` (${L.ITEM_LABEL[pend[0].item] || pend[0].item} ${L.dm(pend[0].date)})` : '';
      out.push(
        NV.noteBox(
          'warn',
          `<b>${esc(pend.length)} yêu cầu chờ xử lý</b>${esc(one)} chưa tính vào thu nhập. Khi Admin đồng ý, thu nhập sẽ thay đổi.`,
          true
        )
      );
    }
    if (rej) out.push(NV.noteBox('info', `${rej} yêu cầu bị từ chối, không tính vào thu nhập.`));
    return out.join('');
  }
  function missingNote(d, month) {
    if (d.official) return '';
    const model = NV.model(month);
    const n = model ? model.missing.filter(c => c.affects).length : 0;
    return n
      ? NV.noteBox(
          'warn',
          `${n} ngày cần để ý (chờ xử lý, bị từ chối hoặc không có chấm công): công các ngày này có thể chưa đủ. Số này có thể đổi khi Admin xử lý.`
        )
      : '';
  }
  function overriddenNote(d) {
    if (!d.overridden) return '';
    return d.official
      ? NV.noteBox(
          'info',
          'Phiếu có khoản Admin đã điều chỉnh; số hiển thị là số trả lương. Một số dòng chi tiết không hiện vì đã được điều chỉnh.'
        )
      : NV.noteBox(
          'info',
          'Phiếu có số Admin đã sửa: thực nhận là số chi trả, các dòng chi tiết là số tự tính trước khi sửa.'
        );
  }
  const emptyNote = d => {
    const n = d.net || {};
    return !d.official && isNum(n.gross) && n.gross === 0
      ? NV.noteBox('info', 'Lịch tháng này chưa khai nên chưa có số thu nhập có ý nghĩa.')
      : '';
  };
  /* Dòng nhỏ dưới số lớn. Máy chủ tính số lớn (m, net) với ngày công theo Check-in/out hợp lệ (attendance.missingAllRule
     'absent': ngày khai đi làm mà không chấm công là vắng, ngày chưa tới chưa có công). Khối toDate (tháng hiện tại) có ngày cắt toDate.upTo, số ngày công và tổng thu nhập trước khoản trừ, không có thực nhận. */
  // short: màn Thu nhập (điện thoại) đã có câu "Tính theo Check-in/out, chưa phải lương chính thức" ở đầu trang
  function figNote(d, short = false) {
    // Máy tính có thêm dòng khoá "Không còn thay đổi" nên câu này nói đã trả lương; điện thoại gộp vào một câu
    if (d.official)
      return d.period && d.period.status === 'paid'
        ? `Phiếu lương chính thức · ${S.desktop ? 'đã trả lương' : 'không còn thay đổi'}`
        : 'Phiếu lương chính thức';
    const m = d.m || {};
    if (short) return isNum(m.count) ? `Tính trên ${NV.fmtNum(m.count)} ngày công có Check-in/out` : '';
    return isNum(m.count)
      ? `Tính theo Check-in/out (${NV.fmtNum(m.count)} ngày công), chưa phải lương chính thức`
      : 'Tính theo Check-in/out, chưa phải lương chính thức';
  }
  function toDateNote(d) {
    const td = d.toDate;
    if (d.official || !td || !/^\d{4}-\d{2}-\d{2}$/.test(td.upTo || '')) return '';
    const bits = [];
    if (isNum(td.count)) bits.push(`${NV.fmtNum(td.count)} ngày công`);
    if (isNum(td.gross)) bits.push(`thu nhập ${fmt(td.gross)} ₫ trước khoản trừ`);
    return bits.length ? `Đến ${L.dm(td.upTo)}: ${bits.join(', ')}` : '';
  }
  const toDateLine = (d, cls) => {
    const t = toDateNote(d);
    return t ? `<div class="${cls} nv-todate">${esc(t)}${cls === 'nv-pay-n' ? '.' : ''}</div>` : '';
  };
  // Tài khoản không thuộc bảng lương (GET /api/me → payrollSubject false): một câu thay cho thẻ thu nhập
  NV.noPayCard = desktop => {
    const text = 'Tài khoản này không thuộc bảng lương nên không có thu nhập.';
    return desktop
      ? `<section class="nv-card nv-dcard" aria-label="Thu nhập"><div class="nv-card-h"><h2>Thu nhập</h2></div><div class="nv-pad nv-muted">${esc(text)}</div></section>`
      : `<section class="nv-card nv-sec" aria-label="Thu nhập"><div class="nv-pad nv-muted">${esc(text)}</div></section>`;
  };
  // Số thành phần KPI của tháng: theo trọng số máy chủ gửi (GET /api/sheet → kpiWeights)
  const kpiCount = month => {
    const sh = S.sheets[month];
    return L.kpiParts(sh && sh.data ? sh.data.kpiWeights : null).length;
  };

  /* ---------- các trạng thái chưa có số ---------- */
  function notReady(month) {
    const es = S.estimates[month];
    if (!es || (es.status === 'loading' && !es.data)) return NV.skeleton(3);
    if (es.status === 'error') return NV.errorBox(es.error, 'reload-estimate');
    if (es.status === 'na') {
      const d = es.data || {};
      const why =
        d.payrollSubject === false
          ? 'Tài khoản này không thuộc bảng lương nên không có số thu nhập.'
          : d.reason === 'NOT_STARTED'
            ? 'Tháng này chưa có số thu nhập cho bạn (có thể bạn chưa bắt đầu làm việc trong tháng này).'
            : d.message
              ? String(d.message)
              : 'Tháng này chưa có số thu nhập.';
      return `<div class="nv-wait">${ic('info', 20)}<div><b>Chưa có số cho tháng này</b><span>${esc(why)}</span></div></div>`;
    }
    return '';
  }
  const staleNote = es =>
    es && es.error ? NV.noteBox('warn', `Chưa cập nhật được: ${es.error}. Đang hiện số lần tải trước.`) : '';

  /* ---------- Hôm nay (điện thoại): số ước tính và vài dòng chấm công ---------- */
  NV.homePayCard = () => {
    const month = NV.curMonth();
    const es = S.estimates[month];
    const d = (es && es.status === 'ok' && es.data) || null;
    const label = `Thu nhập ${L.monthLabel(month)
      .replace('Tháng', 'tháng')
      .replace(/\/\d{4}$/, '')} · ${d && d.official ? 'chính thức' : 'chưa chính thức'}`;
    const n = d && d.net;
    const head = d
      ? `<div class="nv-pay"><div class="nv-pay-l nv-hero-l">${esc(label)}</div>${isNum(n && n.net) ? big(n.net, !d.official) : '<span class="nv-hero-v">—</span>'}<div class="nv-pay-n">${esc(figNote(d))}.</div>${toDateLine(d, 'nv-pay-n')}</div>${staleNote(es)}${emptyNote(d)}`
      : `<div class="nv-pay"><div class="nv-pay-l">${esc(label)}</div>${notReady(month)}</div>`;
    const model = NV.model(month);
    let rows = '';
    if (model) {
      const s = model.summary;
      const grace = model.cutRule && isNum(model.cutRule.graceMin) ? model.cutRule.graceMin : null;
      const lateSub = !s.lateMin
        ? ''
        : s.cutMin
          ? `Bị trừ ${L.fmtMin(s.cutMin)} công`
          : grace !== null
            ? s.lateMin <= grace
              ? `Đến ${grace} phút nên không bị trừ lương`
              : `Mỗi lần đến ${grace} phút nên không bị trừ lương`
            : 'Chưa bị trừ lương';
      const list = [kvRow('Ngày tính công', '', String(s.ok)), kvRow('Đi muộn', lateSub, `${s.lateMin} phút`)];
      const missPay = model.missing.filter(c => c.affects).length;
      let extra = 0;
      if (s.missing) {
        list.push(
          `<div class="nv-kv"><span class="nv-k">Ngày cần để ý</span><span class="nv-v ${missPay ? 'nv-bad' : ''}">${esc(s.missing)} ngày</span></div>`
        );
        extra++;
      } else {
        const a = d && d.allowanceStatus;
        if (a && a.hasAttendance && isNum(a.absentDays)) {
          const rule = isNum(a.maxAbsent)
            ? `Nghỉ ${a.absentCompare === 'gt' ? 'quá' : 'từ'} ${NV.fmtNum(a.maxAbsent)} ngày sẽ mất phụ cấp chuyên cần`
            : '';
          list.push(
            a.kept === false
              ? `<div class="nv-kv"><span class="nv-k">Chuyên cần<small>${esc(rule)}</small></span><span class="nv-v nv-bad">Đã mất</span></div>`
              : kvRow('Chuyên cần', rule, `Đã nghỉ ${NV.fmtNum(a.absentDays)} ngày`)
          );
          extra++;
        }
        const lv = L.hasLeaveAccount(S.me) && NV.leave();
        if (lv) {
          list.push(kvRow('Phép năm còn', '', `${NV.fmtNum(lv.balance)} ngày`));
          extra++;
        }
        if (!extra)
          list.push(
            `<div class="nv-kv"><span class="nv-k">Ngày cần để ý</span><span class="nv-v is-m">0 ngày</span></div>`
          );
      }
      rows = list.join('');
    } else rows = `<div class="nv-pad">${NV.skeleton(2)}</div>`;
    return `<section class="nv-card nv-sec nv-paycard" data-t="luong" aria-label="Thu nhập" ${es && es.status === 'loading' ? 'aria-busy="true"' : ''}>${head}${rows}<button type="button" class="nv-more" data-act="tab" data-t="luong"><span>Xem cách tính</span>${ic('chevr', 18)}</button></section>`;
  };

  /* ---------- Thu nhập (điện thoại): phiếu đọc từ trên xuống ---------- */
  function slip(d, month) {
    const n = d.net || {};
    const { inc, kpi, cuts } = linesOf(d, month);
    const row = (x, neg) => kvRow(x.label, x.sub, neg ? minus(x.v) : fmt(x.v));
    const incRows = inc.map(x => row(x)).join('') + (kpi ? kvRow(kpi.label, kpi.sub, fmt(kpi.v)) : '');
    const cutRows = cuts.length
      ? cuts.map(x => row(x, true)).join('')
      : '<div class="nv-kv"><span class="nv-k nv-muted">Không có khoản trừ</span></div>';
    const netLabel = 'Thực nhận';
    return `<div class="nv-frame" role="group" aria-label="Cách ra thực nhận">
<div class="nv-grp"><span>Thu nhập</span><span class="nv-num">${isNum(n.gross) ? esc(vnd(n.gross)) : '—'}</span></div>${incRows}
<div class="nv-grp"><span>Các khoản trừ</span></div>${cutRows}
<div class="nv-tot"><span>${netLabel}</span><span class="nv-num${d.official ? '' : ' nv-est'}">${isNum(n.net) ? esc(vnd(n.net)) : '—'}</span></div></div>`;
  }
  NV.incomeSlipCard = month => {
    const es = S.estimates[month];
    const d = es && es.status === 'ok' ? es.data || {} : null;
    if (!d)
      return `<section class="nv-card nv-sec" aria-label="Thu nhập" aria-busy="${!es || es.status === 'loading'}"><div class="nv-pad">${notReady(month)}</div></section>`;
    const n = d.net || {};
    const label = 'Thực nhận';
    return `<section class="nv-card nv-sec nv-slip" aria-label="${d.official ? 'Thu nhập chính thức' : 'Thu nhập'}"><div class="nv-fig"><div class="nv-hero-l">${label}</div>${isNum(n.net) ? big(n.net, !d.official) : '<span class="nv-hero-v">—</span>'}${figNote(d, true) ? `<div class="nv-fig-n">${esc(figNote(d, true))}</div>` : ''}${toDateLine(d, 'nv-fig-n')}</div>${staleNote(es)}${emptyNote(d) ? `<div class="nv-pad0">${emptyNote(d)}</div>` : ''}${slip(d, month)}</section>`;
  };
  // Ghi chú, chuyên cần, KPI dưới phiếu
  NV.incomeNotes = month => {
    const es = S.estimates[month];
    const d = es && es.status === 'ok' ? es.data || {} : null;
    if (!d) return '';
    const notes = `${missingNote(d, month)}${pendingNote(d)}${overriddenNote(d)}`;
    return notes ? `<div class="nv-sec nv-notes">${notes}</div>` : '';
  };
  NV.allowanceCard = month => {
    const es = S.estimates[month];
    const d = es && es.status === 'ok' ? es.data || {} : null;
    const a = d && d.allowanceStatus;
    if (!a || !a.hasAttendance) return '';
    const state = a.kept === false ? (d.official ? 'Đã mất' : 'Đã mất') : d.official ? 'Đã giữ' : 'Đang giữ';
    const rows = [];
    if (isNum(a.absentDays) && isNum(a.maxAbsent))
      rows.push(
        kvRow(
          'Ngày đã nghỉ',
          `Nghỉ ${a.absentCompare === 'gt' ? 'quá' : 'từ'} ${NV.fmtNum(a.maxAbsent)} ngày sẽ mất phụ cấp`,
          `${NV.fmtNum(a.absentDays)} / ${NV.fmtNum(a.maxAbsent)}`
        )
      );
    if (isNum(a.overLimitHours) && isNum(a.overLimitThreshold))
      rows.push(
        kvRow(
          'Giờ vượt ngưỡng',
          `${a.hoursLossStrict ? 'Quá' : 'Từ'} ${NV.fmtNum(a.overLimitThreshold)} giờ sẽ mất phụ cấp`,
          `${NV.fmtNum(a.overLimitHours)} / ${NV.fmtNum(a.overLimitThreshold)}`
        )
      );
    if (!rows.length) return '';
    return `<section class="nv-sec" aria-label="Phụ cấp chuyên cần"><h2 class="nv-h2">Phụ cấp chuyên cần <small class="${a.kept === false ? 'nv-bad' : ''}">${esc(state)}</small></h2><div class="nv-card">${rows.join('')}</div></section>`;
  };
  // Chức vụ không có lương KPI hoặc không đóng bảo hiểm (máy chủ báo): thẻ giải thích thay cho phần KPI
  NV.noBenefitCard = month => {
    const es = S.estimates[month];
    const d = es && es.status === 'ok' ? es.data || {} : null;
    if (!d) return '';
    const m = d.m || {},
      n = d.net || {};
    const noKpi = m.kpiAmt === undefined || m.kpiAmt === null;
    const noIns = n.insured === false;
    if (!noKpi && !noIns) return '';
    const pos = L.roleLine(S.me).split(' · ')[0] || 'Chức vụ của bạn';
    const what = [noKpi ? 'lương KPI' : '', noIns ? 'bảo hiểm' : ''].filter(Boolean).join(' và ');
    const why = `Theo chế độ của ${pos}${noIns && S.me.contract === 'short' ? ', hợp đồng dưới 3 tháng không đóng bảo hiểm' : ''}.`;
    return `<section class="nv-card nv-sec"><div class="nv-wait">${ic('info', 20)}<div><b>${esc(pos)} không có ${esc(what)}</b><span>${esc(why)}</span></div></div></section>`;
  };

  /* ---------- máy tính: thẻ Thu nhập (gọn, mở "Xem cách tính" ra đủ dòng) ---------- */
  NV.incomeCardDesktop = month => {
    const es = S.estimates[month];
    const d = es && es.status === 'ok' ? es.data || {} : null;
    const title = `Thu nhập ${L.monthLabel(month)
      .replace('Tháng', 'tháng')
      .replace(/\/\d{4}$/, '')}`;
    if (!d)
      return `<section class="nv-card nv-dcard" aria-label="Thu nhập"><div class="nv-card-h"><h2>${esc(title)}</h2></div><div class="nv-pad">${notReady(month)}</div></section>`;
    const n = d.net || {};
    const { inc, kpi, cuts } = linesOf(d, month);
    const fig = `<div class="nv-fig"><div class="nv-hero-l">Thực nhận</div>${isNum(n.net) ? big(n.net, !d.official) : '<span class="nv-hero-v">—</span>'}<div class="nv-fig-n">${esc(figNote(d))}</div>${toDateLine(d, 'nv-fig-n')}${d.official && d.period && d.period.status === 'paid' ? `<div class="nv-lockr">${ic('lock', 13)}Không còn thay đổi</div>` : ''}</div>`;
    const notes = `${staleNote(es)}${emptyNote(d)}${missingNote(d, month)}${pendingNote(d)}${overriddenNote(d)}`;
    const a = d.allowanceStatus;
    const allowSub =
      a && a.hasAttendance && isNum(a.absentDays) && isNum(a.maxAbsent)
        ? `Đã nghỉ ${NV.fmtNum(a.absentDays)}/${NV.fmtNum(a.maxAbsent)} ngày${isNum(a.overLimitHours) && isNum(a.overLimitThreshold) ? ` · vượt ${NV.fmtNum(a.overLimitHours)}/${NV.fmtNum(a.overLimitThreshold)} giờ` : ''}`
        : '';
    const allowState = a && a.hasAttendance ? (a.kept === false ? 'Đã mất' : d.official ? 'Đã giữ' : 'Đang giữ') : '';
    let rows;
    if (S.incomeOpen) {
      const sub = (x, neg) => kvRow(x.label, x.sub, neg ? minus(x.v) : fmt(x.v), 'is-sub');
      rows = `<div class="nv-kv is-grp"><span class="nv-k">Thu nhập</span><span class="nv-v nv-num">${isNum(n.gross) ? esc(fmt(n.gross)) : '—'}</span></div>${inc
        .map(x =>
          sub(
            x.label === 'Phụ cấp chuyên cần' && allowState
              ? { ...x, sub: [allowState, allowSub.replace('Đã nghỉ', 'nghỉ')].filter(Boolean).join(' · ') }
              : x
          )
        )
        .join(
          ''
        )}${kpi ? sub(kpi) : ''}<div class="nv-kv is-grp"><span class="nv-k">Các khoản trừ</span></div>${cuts.length ? cuts.map(x => sub(x, true)).join('') : kvRow('Không có khoản trừ', '', '', 'is-sub')}<div class="nv-kv is-net"><span class="nv-k">Thực nhận</span><span class="nv-v nv-num${d.official ? '' : ' nv-est'}">${isNum(n.net) ? esc(fmt(n.net)) : '—'}</span></div>`;
    } else {
      const incSub =
        inc.length === 1
          ? `${inc[0].label}${inc[0].sub ? ` · ${inc[0].sub}` : ''}`
          : inc.map((x, i) => `${i ? x.short : x.label} ${fmt(x.v)}`).join(' · ');
      const cutVal = cuts.length === 1 ? minus(cuts[0].v) : '';
      rows = `${kvRow('Thu nhập', incSub, isNum(n.gross) ? fmt(n.gross) : '—')}${kvRow('Các khoản trừ', cutsBrief(d) || 'Không có khoản trừ', cutVal)}${allowState ? `<div class="nv-kv"><span class="nv-k">Phụ cấp chuyên cần<small>${esc(allowSub)}</small></span><span class="nv-v is-w5 ${a.kept === false ? 'nv-bad' : ''}">${esc(allowState)}</span></div>` : ''}${kpi ? kvRow(kpi.label, kpi.sub === 'Chờ chấm đủ điểm' && kpiCount(month) ? `Chờ chấm đủ ${kpiCount(month)} điểm` : kpi.sub, fmt(kpi.v)) : `<div class="nv-kv"><span class="nv-k">Lương KPI<small>${esc(L.roleLine(S.me).split(' · ')[0])} không có lương KPI</small></span><span class="nv-v is-m">Không có</span></div>`}`;
    }
    const foot = `<div class="nv-card-f"><button type="button" class="nv-link" data-act="income-toggle" aria-expanded="${S.incomeOpen}">${S.incomeOpen ? 'Thu gọn' : 'Xem cách tính'}</button></div>`;
    return `<section class="nv-card nv-dcard" aria-label="${d.official ? 'Thu nhập chính thức' : 'Thu nhập'}"><div class="nv-card-h"><h2>${esc(title)}</h2></div>${fig}${notes ? `<div class="nv-pad0">${notes}</div>` : ''}${rows}${foot}</section>`;
  };
  NV.actions['income-toggle'] = () => {
    S.incomeOpen = !S.incomeOpen;
    NV.render();
  };
})(window.NV);
