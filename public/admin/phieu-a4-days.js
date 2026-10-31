/* Trang 1/2 của phiếu lương in A4: "Chấm công tháng MM/YYYY" từng ngày.
   Trang 2 (Tổng hợp lương) là Phieu.sheetOf của phieu-a4.js; file này nạp ngay SAU phieu-a4.js và dùng chung đầu trang, ô thông tin,
   chân trang của nó (Phieu.a4).

   Số tiền từng ngày là số của máy chủ trong bản chụp phiếu (payslip.snapshot.rows): mỗi dòng ngày đi làm mang cot = { luongNgay, phuCapCa,
   lamThem, truGio } (lib/slip-paid.js → dayFiguresOf, public/payroll-engine.js → columnsOfDay) và total. Mỗi ô tiền là MỘT số, không dòng
   phụ, không chữ giải thích: Lương ngày = cot.luongNgay (mọi phần lương ngày, kể cả lương ngày lễ), Phụ cấp ca = cot.phuCapCa (phụ cấp ca
   và Off Paid), Làm thêm = cot.lamThem (OT, làm bù, OT ngày lễ), Trừ giờ = −cot.truGio, Thành tiền = pay (số nguyên đồng của ngày; dòng cũ không có pay thì total); bốn ô đầu cộng trừ đúng Thành
   tiền. Ô trống là gạch ngang; ngày chỉ có giờ OT chưa được tính thì ô Làm thêm ghi "N giờ OT chưa tính". Ở đây chỉ chọn ô và định dạng,
   KHÔNG cộng trừ tiền. Các ô ở chân bảng là số lượng của phiếu (eff.V: số Admin đã sửa thắng số tự tính) và số đếm của bản chụp (m.flex,
   m.night). Ô Vào – ra là giờ Check-in / Check-out thật của dòng ngày (punchIn, punchOut), bên nào không có thì --:--.
   Ngày công theo Check-in/out (attendance.missingAllRule 'absent'): ngày khai đi làm mà không chấm công là "Vắng",
   ngày chưa tới là "Chưa tới" (chưa có số). Mọi chuỗi từ API qua esc() trước khi vào innerHTML. */
(function (A) {
  'use strict';
  const { esc } = A;
  const Phieu = A.Phieu;
  const { hasNum, vn } = Phieu.kit;
  const { pad, titleOf, subOf, whoOf, whoHtml, footHtml, declaredOf } = Phieu.a4;

  const WEEKDAY = ['CN', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
  const SHIFT = { normal: 'Normal', flex: 'Flex', night: 'Night' };
  // Ngày không đi làm: [nhãn chip, kiểu chip]. 'dash' = nghỉ hưởng lương (viền nét đứt), 'grey' = không lương, 'wait' = chưa có số
  const OFF = {
    leave: ['Nghỉ phép', 'dash'],
    isat: ['iSAT', 'dash'],
    holiday: ['Nghỉ lễ', 'dash'],
    unpaid: ['Không lương', 'grey'],
    approved: ['Nghỉ được duyệt', 'grey'],
    willmakeup: ['Nghỉ, sẽ làm bù', 'grey'],
    makeup: ['Làm bù cả ngày (loại cũ)', 'grey'],
    noshow: ['Vắng', 'grey'],
    pending: ['Chờ xử lý', 'wait']
  };
  const EPS = 0.5; // tiền dưới nửa đồng coi như không có (số thực của bộ máy, hiện làm tròn đồng)

  const dash = '<span class="nil">—</span>';
  const thanhTien = r => (hasNum(r.pay) ? r.pay : r.total); // pay: số nguyên đồng của ngày, cộng cả tháng đúng bằng tiền ngày của tháng
  const money = v => vn(v); // số đồng làm tròn khi hiện, không đổi số
  const has = v => hasNum(v) && Math.abs(v) >= EPS;
  const dayText = iso => {
    const d = new Date(`${iso}T00:00:00Z`);
    return `${WEEKDAY[d.getUTCDay()]}, ${iso.slice(8)}/${iso.slice(5, 7)}`;
  };
  /* Ô Vào – ra: giờ Check-in và Check-out thật của ngày, máy chủ ghi trong dòng (punchIn, punchOut, giờ Việt Nam HH:MM; ca qua nửa đêm thì
     giờ ra là giờ đồng hồ của sáng hôm sau). Bên nào không có giờ bấm thì in --:--. Chỉ in chuỗi của máy chủ, không tính giờ. */
  const NO_PUNCH = '--:--';
  const clockOf = v => (typeof v === 'string' && v ? v : NO_PUNCH);
  const spanOf = r => `${clockOf(r.punchIn)} – ${clockOf(r.punchOut)}`;
  // Ô hai dòng: số lớn ở trên, ghi chú nhỏ ở dưới (thêm ghi chú thì thêm dòng nhỏ)
  const two = (main, ...notes) => `<b>${main}</b>${notes.map(n => (n ? `<small>${esc(n)}</small>` : '')).join('')}`;
  /* Mức % trên chip ca chỉ đọc từ tham số của tháng (fig.P), KHÔNG chia tiền cho tiền ở giao diện.
     Night: cùng thứ tự với bonusOf của public/payroll-engine.js để chip khớp mức bộ máy đã áp. shift.allowance.basis 'assigned':
     mức của bậc → của chức vụ → mức đầu của nightOptions; basis khác: mức người đã chọn hoặc mức đầu
     của nightOptions; không có bảng mức thì mức chung shift.night.bonus. Flex: mức của tham số (f.rates.flex, theo bậc). */
  const PERCENT = 100; // tham số lưu phần trăm (40 = 40%), chip cần tỷ lệ (không phải số nghiệp vụ)
  const num = v => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
  function nightRateOf(fig) {
    const { P, terms } = fig;
    if (!P || !terms) return fig.f.rates ? fig.f.rates.nightOne : null;
    const opts = P[`type.${terms.type}.nightOptions`];
    const first = Array.isArray(opts) && opts.length ? num(opts[0]) : null;
    if (P['shift.allowance.basis'] === 'assigned') {
      const pct =
        num(P[`level.${terms.type}.${terms.level}.nightPct`]) ?? num(P[`type.${terms.type}.nightPct`]) ?? first;
      return pct !== null ? pct / PERCENT : num(P['shift.night.bonus']);
    }
    return first !== null ? (num(terms.nightPct) || first) / PERCENT : num(P['shift.night.bonus']);
  }
  function pctOf(fig, r) {
    if (r.shift === 'flex') return (fig.f.rates || {}).flex;
    return r.shift === 'night' ? nightRateOf(fig) : null;
  }
  function shiftChip(fig, r) {
    const shift = r.shift || 'normal';
    const p = pctOf(fig, r);
    const text = `${SHIFT[shift] || shift}${hasNum(p) && p > 0 ? ` +${vn(p * 100, 1)}%` : ''}`;
    const chip =
      shift === 'normal'
        ? `<span class="plain">${esc(text)}</span>`
        : `<span class="dchip ${esc(shift)}">${esc(text)}</span>`;
    const mark = r.kind === 'holiday' ? 'Lễ' : '';
    // Chip "Lễ" và chip ca xếp hai tầng: cột Ca hẹp, hai chip trên một dòng bị cắt thành "Lễ …"
    return mark ? `<span class="dchip dash">${mark}</span><span class="stk">${chip}</span>` : chip;
  }
  // Một ngày đi làm (cả ngày lễ có đi làm): mỗi ô tiền là một số của máy chủ (cot), ô không có số là gạch ngang
  function workRow(fig, r) {
    const cot = r.cot || {};
    const cell = v => (has(v) ? money(v) : dash);
    const waitH = (Number(r.otWait) || 0) + (Number(r.otHold) || 0);
    const extra = has(cot.lamThem)
      ? money(cot.lamThem)
      : waitH > 0
        ? two(dash, `${vn(waitH, 2)} giờ OT chưa tính`)
        : dash;
    return `<tr>
<td>${esc(dayText(r.date))}</td><td class="ca">${shiftChip(fig, r)}</td><td class="io">${esc(spanOf(r))}</td>
<td>${hasNum(r.hours) ? esc(vn(r.hours, 2)) : ''}</td><td>${cell(cot.luongNgay)}</td><td>${cell(cot.phuCapCa)}</td><td>${extra}</td>
<td>${has(cot.truGio) ? `−${money(cot.truGio)}` : dash}</td><td class="b">${money(thanhTien(r))}</td></tr>`;
  }

  // Một ngày không đi làm: nghỉ phép, iSAT, lễ, không lương, vắng, chưa tới / chờ xử lý, ngày loại cũ Làm bù cả ngày
  function offRow(r) {
    const notYet = r.kind === 'pending' && r.reason === 'not-yet';
    // Ngày giữ vì giải trình (r.held): 'rejected' = Bị từ chối, còn lại = Chờ xử lý; hai loại đều in giờ bấm thật ở ô Vào – ra
    const held = r.kind === 'unpaid' && r.held ? r.held : '';
    const [label, cls] = notYet
      ? ['Chưa tới', 'wait']
      : held
        ? held === 'rejected'
          ? ['Bị từ chối', 'grey']
          : ['Chờ xử lý', 'wait']
        : OFF[r.kind] || [r.kind, 'grey'];
    const wait = r.kind === 'pending';
    const note = wait
      ? notYet
        ? 'Chưa tới ngày'
        : 'Chờ xử lý chấm công'
      : r.kind === 'noshow'
        ? 'Không có Check-in/out'
        : r.kind === 'makeup'
          ? 'Loại không còn dùng'
          : r.paidOff
            ? 'Hưởng lương ngày'
            : 'Không tính lương';
    const amount = wait ? dash : money(thanhTien(r));
    // Ngày vắng, ngày giữ vì giải trình và ngày chờ xử lý (trừ chưa tới ngày): ô Vào – ra in giờ bấm thật (bên không có thì --:--) thay cho chữ ghi chú
    const io =
      r.kind === 'noshow' || (wait && !notYet) || held
        ? `<td class="io">${esc(spanOf(r))}</td><td></td>`
        : `<td class="io" colspan="2">${esc(note)}</td>`;
    return `<tr class="off">
<td>${esc(dayText(r.date))}</td><td class="ca"><span class="dchip ${esc(cls)}">${esc(label)}</span></td>
${io}<td${r.paidOff ? '' : ' class="z"'}>${amount}</td><td>${dash}</td><td>${dash}</td><td>${dash}</td>
<td class="b">${amount}</td></tr>`;
  }

  // Ngày có số trên bảng: mọi dòng ngày của bản chụp trong tháng (máy chủ chỉ ghi ngày theo lịch, ngày khai, ngày lễ, ngày vắng)
  function rowsOf(fig) {
    const rows = (fig.m.rows || []).filter(
      r => r && typeof r.date === 'string' && r.date.slice(0, 7) === fig.month && r.kind !== 'invalid'
    );
    if (!rows.length) return '<tr class="off"><td colspan="9">Chưa có ngày nào trong tháng này.</td></tr>';
    return rows
      .map(r => (r.kind === 'work' || (r.kind === 'holiday' && Number(r.hours) > 0) ? workRow(fig, r) : offRow(r)))
      .join('');
  }

  // Các ô chân bảng: số lượng trên phiếu (eff.V) và số đếm ca của bản chụp
  function tilesOf(fig, eff) {
    const { m, f } = fig;
    const q = k => (hasNum(eff.V(k)) ? eff.V(k) : 0);
    const n = v => vn(v, 2);
    const otH = q('ot15H') + q('ot20H') + q('ot30H'); // số giờ, không phải tiền
    const noshow = hasNum(m.noshow) && m.noshow > 0 && !eff.has('unpaidDays') ? m.noshow : 0;
    const tiles = [
      ['Ngày công', `${n(q('workDays'))} ngày`],
      ['Ca Flex · Night', `${m.flex || 0} · ${m.night || 0} ca`],
      ['Nghỉ phép · iSAT', `${n(q('leaveDays'))} · ${n(q('isatDays'))} ngày`],
      // số ngày vắng nằm trong số nghỉ không lương (như dòng "gồm N ngày vắng" ở trang 2): ghi ở dòng nhỏ để ô không bị cắt chữ
      ['Nghỉ không lương', `${n(q('unpaidDays'))} ngày`, noshow ? `gồm ${n(noshow)} ngày vắng` : ''],
      f.makeupHours > 0
        ? ['Làm thêm OT · làm bù', `${n(otH)} · ${n(f.makeupHours)} giờ`]
        : ['Làm thêm OT', `${n(otH)} giờ`],
      ['Đi muộn, về sớm', `${n(q('debtH'))} giờ`]
    ];
    return `<div class="tiles">${tiles
      .map(([l, v, sub]) => `<div><span>${esc(l)}</span><b>${esc(v)}</b>${sub ? `<i>${esc(sub)}</i>` : ''}</div>`)
      .join('')}</div>`;
  }

  /* model: { fig, eff, kind, month } (Phieu.modelOf); meta: { asOf, payday } như sheetOf */
  function daysSheet(model, meta = {}) {
    const { fig, eff } = model;
    const { f } = fig;
    const basis = declaredOf(model) ? 'Theo lịch đã khai' : 'Theo Check-in/out';
    return `<section class="pl-a4 pl-days">
<img class="wm" src="slip/gft-watermark.png" alt="">
<div class="hd"><img src="slip/gft-logo.png" alt="GFT"></div>
<h1>${esc(titleOf(model))}</h1><div class="sub">${esc(subOf(model, meta))}</div>
${whoHtml(whoOf(model))}
<div class="sec"><h2>Chấm công tháng ${pad(f.mo)}/${f.year}</h2><span>${basis} · tiền tính bằng đồng</span></div>
<table class="days"><colgroup><col style="width:78px"><col style="width:84px"><col style="width:92px"><col style="width:46px"><col style="width:88px"><col style="width:84px"><col style="width:88px"><col style="width:52px"><col></colgroup>
<thead><tr><th>Ngày</th><th>Ca</th><th>Vào – ra</th><th>Giờ làm</th><th>Lương ngày</th><th>Phụ cấp ca</th><th>Làm thêm</th><th>Trừ giờ</th><th>Thành tiền</th></tr></thead>
<tbody>${rowsOf(fig)}</tbody></table>
${tilesOf(fig, eff)}
${footHtml([1, 2])}
</section>`;
  }

  Phieu.daysSheet = daysSheet;
})(window.Admin);
