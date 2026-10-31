/* Phiếu lương in A4 và hộp xem trước bản in (trang in, hộp bản in một phiếu, hộp in cả loạt phiếu đã phê duyệt).
   Nạp ngay SAU view-phieu.js.

   Số trên trang in lấy từ mô hình phiếu của view-phieu.js (A.Phieu.modelOf / hộp phiếu đang mở): số của bản chụp, số chi trả của
   máy chủ qua Phieu.effective. Ở đây không tính lương, thuế hay tổng; "Tổng phụ cấp" là số của máy chủ (payslip.allowanceTotal, cộng
   chênh lệch ô phụ cấp Admin sửa: eff.allowance), không có số thì bỏ dòng; tổng tỷ lệ bảo hiểm dùng hàm của mẫu cũ (kit.sumRates).
   Mỗi phiếu HAI trang A4. Trang 1 là bảng chấm công từng ngày
   (phieu-a4-days.js → Phieu.daysSheet, nạp sau file này), trang 2 là "Tổng hợp lương" (sheetOf ở dưới, đầu trang gọn).
   Giữ nhận diện GFT: logo, hình chìm và khẩu hiệu trong public/slip/.
   Mọi chuỗi từ API qua esc() trước khi vào innerHTML. */
(function (A) {
  'use strict';
  const { esc, ic } = A;
  const Phieu = A.Phieu;
  const {
    hasNum,
    vn,
    blank,
    kindOf,
    entryLines,
    blockLines,
    sumRates,
    kpiLabel,
    makeupLabel,
    KPI_PARTS,
    valuesOf,
    paramsFor,
    hashOf
  } = Phieu.kit;
  const PAGE_W = 794; // khổ A4 ở 96 dpi (210 mm)
  const PAGE_H = 1123;
  const PRINT_SLACK = 4; // trang in cao 296,5 mm (phieu-in.css) ≈ 1.120,6 px, thấp hơn trang xem trước 1.123 px: chừa thêm khi đo trang tràn
  const PREVIEW_W = 500; // bề rộng trang xem trước trong hộp
  const FETCH_PARALLEL = 4; // số phiếu tải cùng lúc khi in cả loạt
  const PAGE_SIZE_MAX = 200; // trần pageSize của GET /payslips (config.PAYSLIP_PAGE_MAX)
  const NAMES_SHOWN = 20; // số tên hiện trong hộp in cả loạt, còn lại ghi "và N phiếu khác"
  const WATERMARK = { draft: 'BẢN NHÁP', estimate: 'CHƯA TÍNH LƯƠNG' };
  // khoá → [khoá, nhãn, kiểu, đơn vị] của các dòng phiếu (view-phieu.js)
  const DEF = new Map(Phieu.GROUPS.flatMap(([, defs]) => defs.map(d => [d[0], d])));
  const pad = n => String(n).padStart(2, '0');
  const dm = iso => {
    const s = A.fmtStamp(iso); // "HH:MM dd/mm/yyyy"
    return s === '—' ? '' : s.slice(6, 11);
  };
  const dmy = iso => {
    const s = A.fmtStamp(iso);
    return s === '—' ? '' : s.slice(6);
  };

  /* ---------- một trang A4 ---------- */
  // Ô số: "z" = số 0 hoặc trống (chữ xám), "b" = đậm; ô Admin đã sửa tô vàng trên màn hình (không in màu)
  const td = (text, o = {}) =>
    `<td class="${[o.z && 'z', o.b && 'b', o.ovr && 'ovr'].filter(Boolean).join(' ')}"${o.ovr ? ` title="${esc(o.ovr)}"` : ''}>${esc(text)}</td>`;
  const row = (label, mid, right) => `<tr><td>${esc(label)}</td>${mid}${right}</tr>`;
  const group = title => `<tr class="g"><td colspan="3">${esc(title)}</td></tr>`;
  const pctOf = x => `${vn(x * 100, 2)}%`; // tham số tỷ lệ lưu dạng 0,25
  const ofBase = x => (hasNum(x) ? ` (${pctOf(x)} lương cơ bản)` : '');

  /* model: { fig, eff, kind, month }; meta: { asOf (ISO, phiếu ước tính), payday (dd/mm/yyyy) } */
  function sheetOf(model, meta = {}) {
    const { fig, eff, kind } = model;
    const { f, refs, T, terms, m, P, auto } = fig;
    // Chữ của một ô theo kiểu dòng trong Phieu.GROUPS: số ngày/giờ, %, tiền (tiền trừ đi muộn có dấu −)
    const num = (k, unit) => {
      const v = eff.V(k);
      const type = (DEF.get(k) || [])[2];
      if (!hasNum(v)) return '—';
      if (type === 'pct') return `${vn(v, 2)}%`;
      if (type === 'qty') return unit ? `${vn(v, 2)} ${unit}` : vn(v, 2);
      if (k === 'lateCut') return blank(v) ? '0' : `−${vn(v)}`;
      return vn(v);
    };
    const cell = (k, o = {}) =>
      td(num(k, o.unit), {
        z: blank(eff.V(k)),
        b: o.b && !blank(eff.V(k)),
        ovr: eff.has(k) ? `Admin sửa · số tự tính: ${hasNum(auto[k]) ? vn(auto[k], 2) : '—'}` : ''
      });
    const ref = (v, o = {}) => (v === '' ? td('', { z: true }) : td(hasNum(v) ? vn(v) : '—', { z: blank(v), b: o.b }));
    const empty = td('', { z: true });
    const body = [];
    // Ngày công và lương cơ bản
    body.push(
      group('Ngày công và lương cơ bản'),
      row(`Ngày công tháng ${f.mo}`, ref(refs.workdays), cell('workDays')),
      row('Lương cơ bản', ref(refs.base, { b: true }), cell('workBase', { b: true })),
      // ngày vắng (khai đi làm mà không có Check-in/out hợp lệ, attendance.missingAllRule 'absent') nằm trong số này:
      // ghi rõ để không lẫn với ngày nghỉ có đơn
      row(
        `Nghỉ không lương${hasNum(m.noshow) && m.noshow > 0 && !eff.has('unpaidDays') ? ` (gồm ${vn(m.noshow)} ngày vắng không chấm công)` : ''}`,
        empty,
        cell('unpaidDays', { unit: 'ngày' })
      )
    );
    /* Nghỉ phép và ngày lễ: cột giữa là số ngày, cột phải là tiền. Đơn vị đi theo số ("1 ngày"), không để "(ngày)" ở nhãn vì cột phải của
       cùng dòng là tiền */
    const hol = f.holidayDates.length;
    const days = { unit: 'ngày' };
    body.push(
      group('Nghỉ phép và ngày lễ'),
      row('Nghỉ phép có lương', cell('leaveDays', days), cell('leavePay')),
      row('Quyết toán phép dư', cell('settleDays', days), cell('settlePay')),
      row('Nghỉ thứ 7 hưởng lương · iSAT', cell('isatDays', days), cell('isatPay')),
      row(
        hol ? `Nghỉ lễ hưởng lương · ${f.holidayDates.join(', ')}` : 'Nghỉ lễ hưởng lương',
        cell('holidayDays', days),
        cell('holidayPay')
      )
    );
    // Làm thêm giờ
    // Mỗi loại OT một dòng: số giờ ở cột giữa, tiền của máy chủ ở cột phải (bản chụp chưa chia tiền theo loại, hoặc Admin đã sửa giờ OT / tiền OT
    // thì cột tiền để trống; tổng ở dòng "Tiền làm thêm giờ" bên dưới)
    const R = f.rates || {};
    const [rOt, rWe, rHol] = R.otRates || [];
    const [wd, we, holPay, oldHol] = f.otMoney || []; // tiền OT từng nhóm của máy chủ; ngày lễ của bản chụp cũ còn otHolPay
    const otMoney = hasNum(wd) && !['ot15H', 'ot20H', 'ot30H', 'otPay'].some(k => eff.has(k));
    const otRow = (label, k, rate, pay) =>
      row(
        hasNum(rate) ? `${label} ×${vn(rate, 2)}` : label,
        td(`${num(k)} giờ`, { z: blank(eff.V(k)), ovr: eff.has(k) ? 'Admin sửa số giờ OT' : '' }),
        otMoney ? td(vn(pay), { z: blank(pay) }) : empty
      );
    body.push(
      group('Làm thêm giờ'),
      otRow('OT ngày thường', 'ot15H', rOt, wd),
      otRow('OT cuối tuần', 'ot20H', rWe, we || 0),
      otRow('OT ngày lễ', 'ot30H', rHol, (holPay || 0) + (oldHol || 0)),
      // giờ làm bù: tiền làm thêm giờ hệ số 1 (trả đủ giờ × lương giờ), đã nằm trong dòng tiền bên dưới; nhãn ghi kèm tiền, cột giữa là số giờ
      ...(f.makeupHours > 0 ? [row(makeupLabel(f, vn), td(`${vn(f.makeupHours, 2)} giờ`), empty)] : []),
      row('Tiền làm thêm giờ (OT, OT ngày lễ, làm bù)', empty, cell('otPay'))
    );
    // Phụ cấp: cột giữa là mức tham khảo cả tháng theo nhóm và bậc
    const night = Array.isArray(R.night)
      ? ` (${R.night.map(x => vn(x, 2) + '%').join(' hoặc ')} lương cơ bản)`
      : ofBase(R.nightOne);
    body.push(
      group('Phụ cấp'),
      row(`Chuyên cần${ofBase(R.attendance)}`, ref(refs.attendance), cell('attendance')),
      row(`Đi lại${ofBase(R.travel)}`, ref(refs.travel), cell('travel')),
      row(`Linh hoạt${ofBase(R.flex)}`, ref(refs.flex), cell('flexPay')),
      row('Off Paid (ca đêm)', ref(refs.off), cell('breakPay')),
      row(`Thưởng ca đêm${night}`, ref(refs.night), cell('nightPay')),
      ...blockLines(fig).map(b => row(b.label, empty, td(vn(b.amount)))),
      // số của máy chủ, kể cả khối C&B thêm; ô phụ cấp Admin sửa đã cộng chênh lệch (view-phieu.js → effective)
      ...(hasNum(eff.allowance)
        ? [
            row(
              'Tổng phụ cấp',
              empty,
              td(vn(eff.allowance), {
                z: blank(eff.allowance),
                ovr: eff.allowanceEdited ? `Gồm số Admin sửa · số tự tính: ${vn(fig.allowanceTotal)}` : ''
              })
            )
          ]
        : [])
    );
    // Lương KPI (người không hưởng KPI thì bỏ nhóm, trừ khi Admin đã sửa ô KPI)
    const kpiKeys = [...KPI_PARTS.map(([k]) => k), 'kpiPct', 'kpiAmt', 'kpiPay'];
    if (T.kpi || kpiKeys.some(k => eff.has(k))) {
      const waiting = m.kpiMethod === 'five' && m.kpiPct == null && !eff.has('kpiPct');
      /* Điểm 5 thành phần trên MỘT dòng (giữ phiếu trong một trang A4): mỗi điểm kèm tên, trọng số như màn Đánh giá KPI.
         Điểm máy chủ điền sẵn (payslip.kpiSlip), ô Admin sửa thắng và tô vàng; dòng Bonus chỉ khi Admin đã sửa. */
      const score = ([k, label]) => {
        const ovr = eff.has(k) ? `Admin sửa · số tự tính: ${hasNum(auto[k]) ? vn(auto[k], 2) : '—'}` : '';
        const cls = [!hasNum(eff.V(k)) && 'z', ovr && 'ovr'].filter(Boolean).join(' ');
        return `<span class="${cls}"${ovr ? ` title="${esc(ovr)}"` : ''}><i>${esc(kpiLabel(k, label, P))}</i><b>${esc(num(k))}</b></span>`;
      };
      body.push(
        group('Lương KPI'),
        `<tr class="kps"><td colspan="3"><div>${KPI_PARTS.filter(p => p[2])
          .map(score)
          .join('')}</div></td></tr>`,
        ...KPI_PARTS.filter(([k, , code]) => !code && eff.has(k)).map(([k, label]) => row(label, cell(k), empty)),
        row(
          'Tổng điểm KPI',
          waiting ? td('chưa chấm đủ', { z: true }) : td(num('kpiPct'), { ovr: eff.has('kpiPct') ? 'Admin sửa' : '' }),
          empty
        ),
        row('Lương KPI (tối đa → thực tế)', cell('kpiAmt', { b: true }), cell('kpiPay', { b: true }))
      );
    }
    body.push(
      group('Đi muộn, về sớm, ra ngoài'),
      row('Giờ và tiền bị trừ', cell('debtH', { unit: 'giờ' }), cell('lateCut'))
    );
    const entries = entryLines(fig);
    const adds = entries.filter(e => !e.deduct);
    if (adds.length) body.push(group('Khoản cộng thêm'), ...adds.map(e => row(e.text, empty, td(vn(e.amount)))));

    // Phần tổng: số chi trả của máy chủ
    const t = (label, v, o = {}) =>
      `<tr class="${o.cls || ''}"><td>${esc(label)}</td>${td(o.text != null ? o.text : hasNum(v) ? vn(v) : '—', { ovr: o.ovr })}</tr>`;
    const rate = k => (P && hasNum(P[`tax.insurance.employee.${k}`]) ? pctOf(P[`tax.insurance.employee.${k}`]) : '');
    const insLabel = rate('bhxh')
      ? `Bảo hiểm bắt buộc ${pctOf(sumRates(P, 'employee'))} · BHXH ${rate('bhxh')}, BHTN ${rate('bhtn')}, BHYT ${rate('bhyt')}`
      : 'Bảo hiểm bắt buộc (BHXH, BHYT, BHTN)';
    const ed = k => (eff.has(k) ? 'Admin sửa' : '');
    const leaveLeft = eff.V('leaveLeft');
    /* Số phép còn lại là số dư TỚI HÔM NAY của danh sách nhân sự (GET /staff → leave.balance), không phải số cuối tháng của phiếu:
       ghi rõ ngày để phiếu tháng cũ in lại không bị đọc nhầm (ô Admin đã sửa thì là số Admin nhập, không ghi ngày) */
    const today = A.vnToday ? A.vnToday() : '';
    const leaveAsOf =
      !eff.has('leaveLeft') && /^\d{4}-\d{2}-\d{2}$/.test(today) ? ` (tới ${today.slice(8)}/${today.slice(5, 7)})` : '';
    const tots = [
      t('Tổng thu nhập', eff.total, { cls: 'k' }),
      t('Các khoản miễn thuế', eff.exempt, { ovr: ed('exempt') }),
      t('Thu nhập chịu thuế', eff.taxable),
      t(insLabel, eff.insurance, { ovr: ed('insurance') }),
      t('Thu nhập sau bảo hiểm', eff.afterIns, { cls: 'k' }),
      t('Thuế TNCN', eff.tax, { ovr: ed('tax') }),
      t('Tạm ứng', eff.advance, { ovr: ed('advance') }),
      ...entries.filter(e => e.deduct).map(e => t(e.text, -e.amount)),
      t('Thực nhận', eff.net, { cls: 'net', text: hasNum(eff.net) ? `${vn(eff.net)} ₫` : '—' }),
      t(`Ngày phép năm còn lại${leaveAsOf}`, leaveLeft, {
        text: hasNum(leaveLeft) ? `${vn(leaveLeft, 2)} ngày` : '—',
        ovr: ed('leaveLeft')
      })
    ];
    // Trang 2/2: đầu trang gọn "tên · loại · bậc"; khoảng ngày, cách tính ngày công và ô thông tin ở trang 1
    return shell(kind, {
      title: titleOf(model),
      sub: [terms.name, typeTextOf(model)].filter(Boolean).join(' · '),
      compact: true,
      page: [2, 2],
      body: body.join(''),
      tots: tots.join(''),
      payday: meta.payday
    });
  }

  /* ---------- phần đầu và chân trang dùng chung cho trang 1 (phieu-a4-days.js) và trang 2 ---------- */
  const titleOf = model => `Phiếu lương tháng ${pad(model.fig.f.mo)}/${model.fig.f.year}`;
  const typeTextOf = ({ fig, month }) =>
    `${A.TYPE_SHORT[fig.terms.type] || String(fig.terms.type || '').toUpperCase()} · ${A.levelText(fig.terms.type, fig.terms.level, month)}`;
  // Phương án tính ngày công của tháng: chỉ 'declared' mới ước tính cả tháng theo lịch đã khai (attendance.missingAllRule)
  const declaredOf = model => !!(model.fig.P && model.fig.P['attendance.missingAllRule'] === 'declared');
  /* Dòng phụ dưới tiêu đề. Ngày công theo Check-in/out hợp lệ (attendance.missingAllRule mặc định 'absent'): ngày chưa
     tới chưa có công, ngày khai đi làm mà không chấm công là vắng. Chỉ phương án 'declared' mới ước tính cả tháng theo lịch đã khai. */
  function subOf(model, meta = {}) {
    const { f, refs } = model.fig;
    const asOf = model.kind === 'estimate' && meta.asOf ? dm(meta.asOf) : '';
    const basis = declaredOf(model)
      ? `tính cả tháng theo lịch đã khai, số liệu tới ${asOf}`
      : `ngày công theo Check-in/out tới ${asOf}`;
    return [
      `Từ ${pad(f.from)}/${pad(f.mo)} đến ${pad(f.to)}/${pad(f.mo)}/${f.year}`,
      asOf ? basis : '',
      hasNum(Number(refs.workdays)) ? `công chuẩn theo quy chế: ${refs.workdays} ngày` : ''
    ]
      .filter(Boolean)
      .join(' · ');
  }
  // Ô thông tin người nhận: Họ tên (kèm chức danh) | Loại · bậc | Tình trạng | Kỳ lương
  function whoOf(model) {
    const { terms, f } = model.fig;
    return [
      ['Họ tên', terms.name, String(terms.jobTitle || '').trim()],
      ['Loại · bậc', typeTextOf(model)],
      ['Tình trạng', f.status],
      ['Kỳ lương', `Tháng ${pad(f.mo)}/${f.year}`]
    ];
  }
  const whoHtml = who =>
    `<div class="who">${who
      .map(
        ([l, v, extra]) =>
          `<div><span>${esc(l)}</span><b>${esc(v || '—')}</b>${extra ? `<i>${esc(extra)}</i>` : ''}</div>`
      )
      .join('')}</div>`;
  // Chân trang: khẩu hiệu ở giữa, số trang bên phải (page: [trang, số trang])
  const footHtml = page =>
    `<div class="ft"><img class="slogan" src="slip/gft-slogan.png" alt="Trao trọn niềm tin, gửi trọn giải pháp.">${page ? `<span class="pg">Trang ${page[0]}/${page[1]}</span>` : ''}</div>`;

  /* Khung chung của trang: đầu trang (logo), tiêu đề, ô thông tin người nhận (hoặc đầu trang gọn của trang 2), bảng, tổng, chỗ ký, chân trang */
  function shell(kind, s) {
    const head = s.compact
      ? `<div class="hd2"><img src="slip/gft-logo.png" alt="GFT"><div><h1>${esc(s.title)}</h1><div class="sub">${esc(s.sub)}</div></div></div>
<div class="sec"><h2>Tổng hợp lương</h2><span>Số tiền tính bằng đồng</span></div>`
      : `<div class="hd"><img src="slip/gft-logo.png" alt="GFT"></div>
<h1>${esc(s.title)}</h1><div class="sub">${esc(s.sub)}</div>
${whoHtml(s.who)}`;
    return `<section class="pl-a4 pl-sheet${s.compact ? ' p2' : ''}">
<img class="wm" src="slip/gft-watermark.png" alt="">
${head}
<table class="lines"><colgroup><col><col style="width:130px"><col style="width:130px"></colgroup><thead><tr><th>Khoản</th><th>Theo quy chế</th><th>Thực tế</th></tr></thead><tbody>${s.body}</tbody></table>
<table class="tot"><colgroup><col><col style="width:200px"></colgroup><tbody>${s.tots}</tbody></table>
<div class="sign"><div><b>Người nhận</b><span>Ký, ghi rõ họ tên</span></div></div>
${footHtml(s.page)}
</section>`;
  }

  /* Bản rút gọn khi máy chủ chưa trả chi tiết ước tính từng người: chỉ các số gộp của bảng lương */
  function condensedSheet(r, month, meta = {}) {
    const year = Number(month.slice(0, 4)),
      mo = Number(month.slice(5));
    const last = new Date(Date.UTC(year, mo, 0)).getUTCDate();
    const money = (label, v) => row(label, td('', { z: true }), td(hasNum(v) ? vn(v) : '—', { z: blank(v) }));
    const body = [
      group('Thu nhập'),
      row(
        'Ngày công',
        td(hasNum(r.workdaysStd) ? vn(r.workdaysStd) : ''),
        td(hasNum(r.workDays) ? vn(r.workDays, 2) : '—')
      ),
      money('Tiền ngày công', r.tienNgayCong),
      money('Phụ cấp', r.phuCap),
      money('OT', r.ot),
      money('Lương KPI', r.kpi),
      money('Khác (ca, đêm, bù, lễ)', r.khac),
      group('Đi muộn, về sớm, ra ngoài'),
      row(
        'Tiền bị trừ',
        td('', { z: true }),
        td(blank(r.truTreSom) ? '0' : `−${vn(r.truTreSom)}`, { z: blank(r.truTreSom) })
      )
    ];
    const t = (label, v, cls = '') =>
      `<tr class="${cls}"><td>${esc(label)}</td>${td(hasNum(v) ? vn(v) + (cls === 'net' ? ' ₫' : '') : '—')}</tr>`;
    return shell('estimate', {
      title: `Phiếu lương tháng ${pad(mo)}/${year}`,
      sub: `Từ 01/${pad(mo)} đến ${pad(last)}/${pad(mo)}/${year}${meta.asOf && dm(meta.asOf) ? ` · số liệu tới ${dm(meta.asOf)}` : ''} · số gộp của bảng lương`,
      who: [
        ['Họ tên', r.name || r.username],
        ['Loại · bậc', r.type ? `${A.TYPE_SHORT[r.type] || r.type} · ${A.levelText(r.type, r.level, month)}` : ''],
        ['Tình trạng', A.TYPE_LONG[r.type] || ''],
        ['Kỳ lương', `Tháng ${pad(mo)}/${year}`]
      ],
      body: body.join(''),
      tots: [
        t('Tổng thu nhập', r.gross, 'k'),
        t('Bảo hiểm bắt buộc (BHXH, BHYT, BHTN)', r.insurance),
        t('Thuế TNCN', r.tax),
        t('Tạm ứng', r.advance),
        t('Thực nhận', r.net, 'net')
      ].join(''),
      payday: meta.payday
    });
  }

  // Ngày trả lương ở chân trang: ngày đã trả lương nếu kỳ đã trả, không thì ngày trả dự kiến của kỳ (thanh kỳ lương)
  function metaOf(month, res) {
    const per = A.S.period && A.S.period.month === month ? A.S.period : null;
    const data = (A.Ky && A.Ky.data && A.Ky.data()) || (per && per.data) || null;
    const paid =
      data && data.month === month ? data.paidAt || (data.stages && data.stages.paid && data.stages.paid.at) : null;
    return {
      asOf: res && !res.run ? res.asOf : null,
      payday: paid
        ? /^\d{4}-\d{2}-\d{2}$/.test(paid)
          ? A.fmtDate(paid)
          : dmy(paid)
        : per && per.payday
          ? A.fmtDate(per.payday)
          : ''
    };
  }

  /* ---------- hộp xem trước và in ---------- */
  let observer = null;
  let onResize = null;
  function cleanupPrint() {
    const root = document.getElementById('pl-print');
    if (root) root.remove();
    const style = document.getElementById('pl-page-style');
    if (style) style.remove();
    document.body.classList.remove('pl-printing');
    if (onResize) {
      window.removeEventListener('resize', onResize);
      onResize = null;
    }
  }
  function watchDialog() {
    if (observer) return;
    // Hộp xem trước đóng (đóng, Esc, hay hộp khác thế chỗ) thì dọn khung in
    observer = new MutationObserver(() => {
      if (!document.querySelector('#ovl [data-pl-preview]')) cleanupPrint();
    });
    observer.observe(document.getElementById('ovl'), { childList: true });
  }
  /* Phiếu dài (nhiều khối phụ cấp, khoản cộng/trừ thêm) có thể vượt một trang A4 và bị cắt mất phần tổng, chỗ ký: đo từng trang ngoài
     màn hình, trang nào tràn thì dùng kiểu "dense" (dòng thấp hơn, man-phieu-luong.css). Chỉ đổi cách trình bày, không đổi số. */
  function fitPages(pages) {
    const probe = document.createElement('div');
    probe.className = 'pl-probe';
    probe.setAttribute('aria-hidden', 'true');
    probe.innerHTML = pages.join('');
    document.body.appendChild(probe);
    // trong khung đo trang cao theo nội dung (height: auto): cao hơn trang in là tràn
    const over = [...probe.children].map(el => el.offsetHeight > PAGE_H - PRINT_SLACK);
    probe.remove();
    return pages.map((html, i) =>
      // khớp mọi kiểu trang ("pl-a4 pl-sheet", "pl-a4 pl-days"): chuỗi tìm không có dấu nháy đóng
      over[i] ? html.replace('<section class="pl-a4 ', '<section class="pl-a4 dense ') : html
    );
  }
  /* slips: mỗi phiếu là một chuỗi html (một trang) hoặc mảng trang ([trang 1, trang 2]);
     spec: { title, sub, pills: [html], names: [string], note (html), many } */
  const PAGE_GAP = 24; // khoảng cách giữa hai trang của một phiếu trong khung xem trước (px của trang chưa thu nhỏ, khớp phieu-a4-days.css)
  function openPreview(slips, spec) {
    const sizes = slips.map(x => [].concat(x).length);
    const pages = fitPages(slips.flatMap(x => [].concat(x)));
    const first = pages.slice(0, sizes[0]); // khung xem trước hiện các trang của phiếu đầu
    cleanupPrint();
    watchDialog();
    const root = document.createElement('div');
    root.id = 'pl-print';
    root.setAttribute('aria-hidden', 'true');
    root.innerHTML = pages.join('');
    document.body.appendChild(root);
    document.body.classList.add('pl-printing');
    const style = document.createElement('style');
    style.id = 'pl-page-style';
    style.textContent = '@page { size: A4 portrait; margin: 0; }';
    document.head.appendChild(style);
    const list = spec.names || [];
    const names = list.length
      ? `<p class="pl-names"><b>${esc(list.slice(0, NAMES_SHOWN).join(', '))}</b>${list.length > NAMES_SHOWN ? ` và ${list.length - NAMES_SHOWN} phiếu khác` : ''}</p>`
      : '';
    const dlg = A.openDialog({
      title: spec.title,
      sub: spec.sub,
      wide: true,
      body: `<div data-pl-preview class="col pl-pv">${(spec.pills || []).length ? `<div class="row wrap pl-pills">${spec.pills.join('')}</div>` : ''}${spec.note || ''}${names}<div class="pl-well" id="pl-well"><div class="pl-prevwrap${first.length > 1 ? ' multi' : ''}" id="pl-prevwrap"><div class="pl-prev" id="pl-prev">${first.join('')}</div></div></div></div>`,
      foot: [
        { label: 'Đóng' },
        {
          label: slips.length > 1 ? `In ${slips.length} phiếu / Lưu PDF` : 'In / Lưu PDF',
          cls: 'pri',
          onClick: () => {
            window.print();
          }
        }
      ]
    });
    dlg.root.classList.add('pl-pvdlg', spec.many ? 'many' : 'one');
    const fit = () => {
      const well = document.getElementById('pl-well');
      const wrap = document.getElementById('pl-prevwrap');
      if (!well || !wrap) return;
      const cs = getComputedStyle(well);
      const room = well.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight); // trừ lề trong của khung xám
      const scale = Math.max(0.2, Math.min(PREVIEW_W, room) / PAGE_W);
      wrap.style.width = `${Math.floor(PAGE_W * scale)}px`;
      wrap.style.height = `${Math.ceil((PAGE_H * first.length + PAGE_GAP * (first.length - 1)) * scale)}px`;
      wrap.querySelector('.pl-prev').style.setProperty('--pl-scale', String(scale));
    };
    onResize = fit;
    window.addEventListener('resize', fit);
    fit();
    const printBtn = dlg.root.querySelector('[data-dlg-btn="1"]');
    if (printBtn) printBtn.insertAdjacentHTML('afterbegin', ic('printer', 16));
    return dlg;
  }
  const PILL = {
    final: ['done', 'Phiếu lương chính thức'],
    draft: ['pending', 'Bản nháp · chưa phê duyệt kỳ']
  };
  // nhãn lấy theo loại phiếu trong PILL (final, draft); loại không có trong PILL cho chuỗi rỗng
  const pillOf = kind => (PILL[kind] ? A.pill(...PILL[kind]) : '');

  /* Bản in A4 hai trang: trang 1 chấm công từng ngày (Phieu.daysSheet, phieu-a4-days.js), trang 2 tổng hợp (sheetOf).
     classicSheet (phieu-co-dien.js) không dùng cho in; test đơn vị vẫn kiểm chữ của mẫu đó. */
  const slipPages = (model, meta) => [
    ...(Phieu.daysSheet ? [Phieu.daysSheet(model, meta || {})] : []),
    sheetOf(model, meta || {})
  ];

  /* In một phiếu đang mở trong hộp phiếu (số hiện tại của hộp, kể cả số Admin đã sửa đã lưu) */
  function printCurrent() {
    const cur = Phieu.kit.active();
    if (!cur || !cur.ctx) return;
    const { st, ctx } = cur;
    if (!st.ready) return;
    const kind = kindOf(ctx.res);
    const meta = metaOf(ctx.month, ctx.res);
    let page;
    if (st.fig) page = slipPages({ fig: st.fig, eff: st.eff, kind, month: ctx.month }, meta);
    else if (ctx.row) page = condensedSheet(ctx.row, ctx.month, meta);
    else return;
    const who = ctx.res.payslip.name || ctx.res.payslip.username;
    openPreview([page], {
      title: `Bản in A4 · ${who}`,
      sub: `Kỳ lương ${A.monthLabel(ctx.month)}`,
      pills: [
        st.fig ? pillOf(kind) : '',
        ...(st.eff && st.eff.touched ? [A.pill('draft', 'Có số Admin đã sửa')] : [])
      ].filter(Boolean)
    });
  }

  /* In cả loạt phiếu đã phê duyệt của kỳ: tải từng phiếu đầy đủ (bản chụp) kèm số Admin đã sửa, mỗi phiếu một trang */
  async function printApproved(month, can) {
    const dlg = A.openDialog({
      title: 'In tất cả phiếu đã phê duyệt',
      sub: `Kỳ lương ${A.monthLabel(month)}`,
      wide: true,
      body: '<div id="pl-prog" class="col" style="gap:8px"><span class="cap">Đang lấy danh sách phiếu đã phê duyệt…</span><div class="skel" style="width:60%"></div></div>',
      foot: [{ label: 'Đóng' }]
    });
    const alive = () => dlg.root.isConnected;
    const progress = text => {
      const el = dlg.root.querySelector('#pl-prog');
      if (el) el.firstElementChild.textContent = text;
    };
    try {
      const rows = [];
      for (let page = 1; ; page += 1) {
        const got = await A.api(
          'GET',
          `/periods/${month}/payslips${A.qs({ status: 'approved', page, pageSize: PAGE_SIZE_MAX })}`
        );
        rows.push(...got.rows);
        if (!got.rows.length || rows.length >= got.total) break;
      }
      if (!alive()) return;
      if (!rows.length) {
        dlg.root.querySelector('#dlg-body').innerHTML = A.empty(
          'Chưa có phiếu nào đã phê duyệt',
          'Phê duyệt phiếu trên bảng lương rồi in lại.'
        );
        return;
      }
      await A.loadStaff();
      const view = A.Ky && A.Ky.data();
      const holidays = (view && view.run && view.run.switches && view.run.switches.holidays) || null; // ngày lễ của lần tính
      let paramsReq = null; // tham số của tháng chỉ tải một lần cho cả loạt
      let loaded = 0;
      const out = new Array(rows.length);
      const failed = [];
      let next = 0;
      const one = async () => {
        while (next < rows.length && alive()) {
          const i = next++;
          const r = rows[i];
          try {
            const res = await A.api('GET', `/periods/${month}/payslips/${encodeURIComponent(r.username)}`);
            let values = {};
            if (res.run && res.run.status === 'final') values = valuesOf(res.payslip.override);
            else if (can('payroll.override'))
              values = valuesOf(await A.api('GET', `/slip-override${A.qs({ month, user: r.username })}`));
            paramsReq = paramsReq || paramsFor(month, hashOf(res));
            const model = Phieu.modelOf(res, month, await paramsReq, values, holidays);
            if (!model) throw new Error('Phiếu chưa có đủ số liệu để dựng các dòng');
            out[i] = { model, name: r.name || r.username, res };
          } catch (e) {
            failed.push(`${r.name || r.username}: ${A.errText(e)}`);
          }
          loaded += 1;
          progress(`Đang tải phiếu ${loaded}/${rows.length}…`);
        }
      };
      await Promise.all(Array.from({ length: Math.min(FETCH_PARALLEL, rows.length) }, one));
      if (!alive()) return;
      const ready = out.filter(Boolean);
      if (!ready.length) {
        dlg.root.querySelector('#dlg-body').innerHTML =
          `<div class="warn" role="alert">${ic('alert', 16)}<span>Không dựng được phiếu nào. ${esc(failed.slice(0, 3).join('; '))}</span></div>`;
        return;
      }
      const final = ready.every(x => x.model.kind === 'final');
      const meta = metaOf(month, ready[0].res);
      const paid = view && view.status === 'paid' && meta.payday ? ` · đã trả lương ${meta.payday.slice(0, 5)}` : '';
      openPreview(
        ready.map(x => slipPages(x.model, meta)),
        {
          title: `In ${ready.length} phiếu đã phê duyệt`,
          sub: `Kỳ lương ${A.monthLabel(month)}${paid}`,
          pills: [pillOf(final ? 'final' : 'draft'), A.pill('draft', `${ready.length} phiếu`)],
          names: ready.map(x => x.name),
          many: true,
          note: failed.length
            ? `<div class="warn" role="alert">${ic('alert', 16)}<span>${failed.length} phiếu không tải được nên không có trong bản in: ${esc(failed.slice(0, 3).join('; '))}${failed.length > 3 ? '…' : ''}</span></div>`
            : ''
        }
      );
    } catch (e) {
      if (alive()) dlg.error(A.errText(e));
    }
  }

  A.actions.plprint1 = () => printCurrent();
  A.actions.plprintall = el =>
    printApproved(el.dataset.m, c => (A.meInfo && Array.isArray(A.meInfo.caps) ? A.meInfo.caps.includes(c) : true));

  Object.assign(Phieu, { sheetOf, condensedSheet, openPreview, printApproved });
  // cho trang 1 (phieu-a4-days.js): đầu trang, ô thông tin và chân trang giống trang 2
  Phieu.a4 = { pad, titleOf, subOf, whoOf, whoHtml, footHtml, declaredOf };
})(window.Admin);
