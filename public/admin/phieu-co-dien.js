/* Bản in A4 "PHIẾU LƯƠNG THÁNG MM/YYYY" theo mẫu của app cũ: đầu phiếu, thông tin nhân sự, bảng chấm công từng ngày, tổng hợp,
   chỗ ký. Góc phải đầu phiếu không có tên và tên đăng nhập (họ tên ở chỗ ký "Người nhận lương").
   Bảng từng ngày lấy các dòng của bản chụp (fig.m.rows, số máy tính). Phần Tổng hợp lấy số trên phiếu (eff: số Admin đã sửa thắng số tự
   tính; các dòng TỔNG là số chi trả của máy chủ), như mẫu "BẢNG CHI TIẾT LƯƠNG NHÂN VIÊN". Trình duyệt không tính lương.
   Mọi chuỗi từ API qua esc() trước khi vào innerHTML. */
(function (A) {
  'use strict';
  const { esc } = A;
  const Phieu = A.Phieu;
  const { hasNum, vn, entryLines, blockLines, makeupLabel } = Phieu.kit;

  const KIND_LABEL = {
    leave: 'Nghỉ phép năm',
    unpaid: 'Nghỉ không lương',
    willmakeup: 'Nghỉ, sẽ làm bù',
    approved: 'Nghỉ được duyệt',
    isat: 'iSAT',
    holiday: 'Nghỉ lễ',
    noshow: 'Vắng không phép',
    pending: 'Chờ xử lý',
    makeup: 'Làm bù cả ngày (loại cũ)'
  };
  const SHIFT_LABEL = { normal: 'Normal', flex: 'Flex', night: 'Night' };
  const WEEKDAY = ['CN', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

  const VND = v => `${vn(Math.round(v || 0))} ₫`;
  const H = v => vn(v || 0, 2);
  const pct = x => (hasNum(x) ? `${vn(x * 100, 2)}%` : '');
  const pad = n => String(n).padStart(2, '0');
  const dayText = iso => {
    const d = new Date(`${iso}T00:00:00Z`);
    return `${WEEKDAY[d.getUTCDay()]}, ${iso.slice(8)}/${iso.slice(5, 7)}`;
  };
  const today = () => {
    const t = A.vnToday ? A.vnToday() : new Date().toISOString().slice(0, 10);
    return `${t.slice(8)}/${t.slice(5, 7)}/${t.slice(0, 4)}`;
  };

  // Mức phụ cấp ca của người này: Flex theo tham số; Night theo mức đã chọn của người (Night 40/60) hoặc mức chung
  function rates(fig) {
    const r = fig.f.rates || {};
    const own = Number(fig.terms.nightPct);
    const night = Array.isArray(r.night) && r.night.length ? (own || r.night[0]) / 100 : r.nightOne;
    return { flex: r.flex, night, breakPremium: r.breakPremium };
  }

  // Ô Vào – ra: giờ Check-in / Check-out thật của dòng ngày (punchIn, punchOut do máy chủ ghi), bên nào không có thì --:--
  const clockOf = v => (typeof v === 'string' && v ? v : '--:--');
  function dayRows(fig) {
    const { m } = fig;
    const rt = rates(fig);
    const rows = (m.rows || []).filter(r => r && typeof r.date === 'string' && r.date.slice(0, 7) === fig.month);
    if (!rows.length) return '<tr><td colspan="8" class="cd-sub">Chưa có ngày nào trong tháng này.</td></tr>';
    return rows
      .map(r => {
        const date = `<td class="cd-nw">${esc(dayText(r.date))}</td>`;
        if (r.kind !== 'work') {
          // Ngày giữ vì giải trình (r.held): 'rejected' = Bị từ chối, còn lại = Chờ xử lý; ngày vắng, chờ xử lý (trừ chưa tới ngày) và ngày giữ in giờ bấm thật
          const held = r.kind === 'unpaid' && r.held ? r.held : '';
          const showPunch = held || r.kind === 'noshow' || (r.kind === 'pending' && r.reason !== 'not-yet');
          const label = held ? (held === 'rejected' ? 'Bị từ chối' : 'Chờ xử lý') : KIND_LABEL[r.kind] || r.kind;
          const note = showPunch
            ? `${esc(clockOf(r.punchIn))} – ${esc(clockOf(r.punchOut))}`
            : r.kind === 'holiday'
              ? r.paidOff
                ? 'Tính nguyên lương ngày'
                : 'Không tính lương'
              : r.kind === 'isat'
                ? 'Phúc lợi iSAT · lương cơ bản ngày'
                : r.kind === 'makeup'
                  ? 'Loại không còn dùng'
                  : r.paidOff
                    ? 'Tính nguyên lương ngày'
                    : 'Không tính lương';
          return `<tr>${date}<td><span class="cd-pill off">${esc(label)}</span></td><td class="cd-sub" colspan="2">${note}</td><td class="r">${r.paidOff ? VND(r.daily) : '0'}</td><td class="r">—</td><td class="r">—</td><td class="r b">${VND(r.pay ?? r.total)}</td></tr>`;
        }
        const shift = r.shift || 'normal';
        const add = shift === 'flex' ? rt.flex : shift === 'night' ? rt.night : 0;
        const pill = `<span class="cd-pill ${esc(shift)}">${esc(SHIFT_LABEL[shift] || shift)}${hasNum(add) && add > 0 ? ` +${esc(pct(add))}` : ''}</span>`;
        const brk = Number(r.breakMin) > 0 ? ` (−${esc(r.breakMin)}p)` : '';
        const bonus = `${r.bonus ? `+${VND(r.bonus)}` : '0'}${r.breakPay ? `<div class="cd-sub">+${VND(r.breakPay)} nghỉ ca đêm</div>` : ''}`;
        return `<tr>${date}<td>${pill}</td><td class="cd-nw">${esc(clockOf(r.punchIn))} – ${esc(clockOf(r.punchOut))}${brk}</td><td class="r">${H(r.hours)}</td><td class="r">${VND(r.daily)}</td><td class="r">${bonus}</td><td class="r">${r.cut ? `-${VND(r.cut)}` : '0'}</td><td class="r b">${VND(r.pay ?? r.total)}</td></tr>`;
      })
      .join('');
  }

  // Dòng tổng nền xám ở cuối bảng chấm công (như mẫu cũ): lương cơ bản sau trừ giờ thiếu, phụ cấp ca, nghỉ giữa ca đêm có lương
  function tableTotals(fig, eff) {
    const { m } = fig;
    const V = k => (hasNum(eff.V(k)) ? eff.V(k) : 0);
    const rt = rates(fig);
    const row = (label, value) =>
      `<tr class="cd-tot"><td colspan="7">${esc(label)}</td><td class="r">${VND(value)}</td></tr>`;
    const out = [
      row(
        `Lương cơ bản (${vn(V('workDays'), 2)} ngày công thực tế${V('lateCut') > 0.5 && hasNum(m.short) ? `, đã trừ ${H(m.short)} giờ thiếu` : ''})`,
        V('workBase') - V('lateCut')
      ),
      row(
        `Phụ cấp ca (${m.flex || 0} Flex +${pct(rt.flex) || '0%'} · ${m.night || 0} Night +${pct(rt.night) || '0%'})`,
        V('flexPay') + V('nightPay')
      )
    ];
    if (V('breakPay') > 0.5)
      out.push(
        row(
          `Nghỉ giữa ca đêm có lương (${m.breakDays || 0} ca đủ 8 tiếng × 1 giờ${hasNum(rt.breakPremium) ? ` + ${pct(rt.breakPremium)} phụ trội` : ''})`,
          V('breakPay')
        )
      );
    return out.join('');
  }

  // Các dòng tiền của Tổng hợp theo số trên phiếu (eff.V); dòng bằng 0 không in, trừ lương cơ bản
  function summary(fig, eff) {
    const { m, T, f } = fig;
    const V = k => (hasNum(eff.V(k)) ? eff.V(k) : 0);
    const rt = rates(fig);
    const out = [];
    const line = (label, value, sign = '+', always = false) => {
      if (!always && !(Math.abs(value) > 0.5)) return;
      out.push(
        `<div class="cd-sum"><span>${esc(label)}</span><span>${sign === '-' ? '-' : out.length ? '+' : ''}${VND(value)}</span></div>`
      );
    };
    line(`Lương cơ bản (${vn(V('workDays'), 2)} ngày công thực tế)`, V('workBase'), '+', true);
    line(`Nghỉ phép có lương (${vn(V('leaveDays'), 2)} ngày)`, V('leavePay'));
    line(`Quyết toán phép dư (${vn(V('settleDays'), 2)} ngày)`, V('settlePay'));
    line(`Nghỉ thứ 7 hưởng lương cơ bản (iSAT, ${vn(V('isatDays'), 2)} ngày)`, V('isatPay'));
    line(
      `Nghỉ lễ hưởng lương (${vn(V('holidayDays'), 2)} ngày${f.holidayDates.length ? `: ${f.holidayDates.join(', ')}` : ''})`,
      V('holidayPay')
    );
    line(`Phụ cấp ca (${m.flex || 0} Flex, ${m.night || 0} Night)`, V('flexPay') + V('nightPay'));
    line(
      `Nghỉ giữa ca đêm có lương (${m.breakDays || 0} ca × 1 giờ${hasNum(rt.breakPremium) ? ` + ${pct(rt.breakPremium)} phụ trội` : ''})`,
      V('breakPay')
    );
    // Một dòng tiền làm thêm giờ (số trên phiếu): ghi số giờ OT ngày thường (ot15H + ot20H), OT ngày lễ (ot30H: mọi giờ OT được duyệt rơi vào
    // ngày lễ) và giờ làm bù (trả đủ giờ × lương giờ, nhãn kèm tiền của máy chủ)
    const mkH = f.makeupHours || 0;
    line(
      `Làm thêm giờ: OT ${H(V('ot15H') + V('ot20H'))} giờ, OT ngày lễ ${H(V('ot30H'))} giờ${mkH > 0 ? `, ${makeupLabel(f, vn).toLowerCase()} ${H(mkH)} giờ` : ''}`,
      V('otPay')
    );
    if (T.travel) line('Phụ cấp đi lại', V('travel'));
    if (T.attendance) line(`Phụ cấp chuyên cần${m.attendOk === false ? ' (không đạt)' : ''}`, V('attendance'));
    for (const b of blockLines(fig)) line(`Phụ cấp ${b.label}`, b.amount);
    if (T.kpi) line('Lương KPI', V('kpiPay'));
    const entries = entryLines(fig);
    for (const e of entries.filter(x => !x.deduct)) line(e.text, e.amount);
    line(`Trừ đi trễ, về sớm${hasNum(m.short) && m.short > 0 ? ` (${H(m.short)} giờ thiếu)` : ''}`, V('lateCut'), '-');
    out.push(
      `<div class="cd-sum total"><span>TỔNG THU NHẬP (chưa khấu trừ)</span><span>${hasNum(eff.total) ? VND(eff.total) : '—'}</span></div>`
    );
    const less = (label, value) => {
      if (!(Math.abs(value || 0) > 0.5)) return;
      out.push(`<div class="cd-sum"><span>${esc(label)}</span><span>-${VND(value)}</span></div>`);
    };
    less('Bảo hiểm bắt buộc (BHXH, BHYT, BHTN)', eff.insurance);
    less('Thuế thu nhập cá nhân', eff.tax);
    less('Tạm ứng', eff.advance);
    for (const e of entries.filter(x => x.deduct)) less(e.text, e.amount);
    out.push(
      `<div class="cd-sum total"><span>THỰC LĨNH</span><span>${hasNum(eff.net) ? VND(eff.net) : '—'}</span></div>`
    );
    return out.join('');
  }

  function classicSheet(model) {
    const { fig, eff } = model;
    const { terms, T, P, f, refs, m } = fig;
    const rt = rates(fig);
    const dayRow = (m.rows || []).find(r => hasNum(r.daily) && hasNum(r.hourly));
    const kpiMax = P ? P[`level.${terms.type}.${terms.level}.kpi`] : undefined;
    const meta = [
      ['Loại nhân sự', A.TYPE_LONG[terms.type] || terms.type],
      [T.nightOptions ? 'Vị trí' : 'Level', f.position],
      [
        'Lương cơ bản',
        hasNum(refs.base) ? `${VND(refs.base)} / ${refs.workdays} ngày công` : `— / ${refs.workdays} ngày công`
      ],
      ...(dayRow ? [['Lương ngày', `${VND(dayRow.daily)} · lương giờ ${VND(dayRow.hourly)}`]] : []),
      ...(T.kpi && hasNum(kpiMax) ? [['Lương KPI tối đa', VND(kpiMax)]] : []),
      ['Phụ cấp ca', `Flex +${pct(rt.flex) || '0%'} · Night +${pct(rt.night) || '0%'}`],
      ...(T.travel ? [['Nơi ở', terms.idorm ? 'iDorm (không phụ cấp đi lại)' : 'Ngoài iDorm']] : [])
    ]
      .map(([l, v]) => `<div><span class="cd-sub">${esc(l)}:</span> ${esc(v)}</div>`)
      .join('');
    return `<section class="pl-a4 pl-classic">
<div class="cd-head"><h1>PHIẾU LƯƠNG THÁNG ${pad(f.mo)}/${f.year}</h1><div class="cd-sub">Lương Nhân Sự · in ngày ${today()}</div></div>
<div class="cd-meta">${meta}</div>
<h2>Chấm công</h2>
<table class="cd-tbl"><thead><tr><th>Ngày</th><th>Ca</th><th>Vào – ra</th><th class="r">Giờ làm</th><th class="r">Lương ngày</th><th class="r">Phụ cấp</th><th class="r">Trừ giờ</th><th class="r">Thành tiền</th></tr></thead><tbody>${dayRows(fig)}${tableTotals(fig, eff)}</tbody></table>
<h2>Tổng hợp</h2>
<div class="cd-sums">${summary(fig, eff)}</div>
<div class="cd-sign"><div>Người lập / Admin</div><div>Người nhận lương<br><span class="cd-sub">${esc(terms.name || '')}</span></div></div>
</section>`;
  }

  Phieu.classicSheet = classicSheet;
})(window.Admin);
