/* Phiếu lương trên giao diện Admin. Ba việc của phiếu lương:
   (1) hộp phiếu (ngăn kéo bên phải): tóm tắt Tổng thu nhập − Bảo hiểm − Thuế TNCN − Tạm ứng = Thực nhận, rồi phần Chi tiết chỉ hiện
       dòng có số (dòng 0 hoặc trống ẩn sau nút "Hiện N dòng"), dựng từ BẢN CHỤP của lần tính (GET /api/periods/:month/payslips/:username);
   (2) "Sửa số trên phiếu" của Admin (GET/PUT /api/slip-override: lý do, expectedRev, 409 SLIP_STALE; sửa được cả kỳ đã duyệt hoặc đã trả lương,
       máy chủ trả cảnh báo PERIOD_FROZEN: phiếu đã chốt giữ số cũ tới khi tính lại);
   (3) in A4 một phiếu hoặc cả loạt phiếu đã phê duyệt: phieu-a4.js (nạp ngay sau file này) dựng trang in mới từ modelOf().
   pageOf() dựng mẫu cũ "BẢNG CHI TIẾT LƯƠNG NHÂN VIÊN" (test khoá chữ của mẫu đó); giao diện không dùng.

   Số tiền: mọi số tự tính lấy từ bản chụp của máy chủ; hàm figures() chỉ gom các số của bản chụp vào đúng dòng của mẫu. Các dòng TỔNG
   (Tổng thu nhập, Bảo hiểm, Thuế TNCN, Tạm ứng, Thực nhận) là SỐ CHI TRẢ do máy chủ trả trên phiếu (payslip.gross, insurance, tax, advance, net:
   số Admin đã sửa đã áp lên, payslip.computed là số tự tính): trình duyệt KHÔNG tính lại tổng, thuế hay thực nhận. "Tổng phụ cấp" là
   payslip.allowanceTotal của máy chủ; ô phụ cấp Admin đã sửa thì effective() cộng chênh lệch của đúng ô đó; máy chủ trả null thì không hiện dòng
   này. Sau khi lưu số sửa, phiếu được tải lại từ máy chủ rồi mới hiện số mới. Nhãn có tỷ lệ (chuyên cần, đi lại, KPI...) lấy từ tham số máy chủ
   (GET /settings/params); không có thì nhãn không kèm số. Nhân sự luôn thấy số tự tính. Dưới nhãn mỗi dòng Chi tiết in công thức
   payslip.formulas của máy chủ (chỉ in chuỗi). Mọi chuỗi từ API qua esc() trước khi vào innerHTML. */
(function (A) {
  'use strict';
  const { esc, ic } = A;

  /* ---------- khoá và nhãn ---------- */
  // Hai danh sách khớp SLIP_MONEY / SLIP_QTY của server.js (máy chủ vẫn kiểm lại: khoá lạ bị 400)
  const MONEY = new Set([
    'workBase',
    'leavePay',
    'settlePay',
    'isatPay',
    'holidayPay',
    'otPay',
    'attendance',
    'travel',
    'flexPay',
    'breakPay',
    'nightPay',
    'kpiPay',
    'kpiAmt',
    'lateCut',
    'exempt',
    'insurance',
    'tax',
    'advance'
  ]);
  const PCT = new Set(['kpiPct', 'kpiBase', 'kpiUser', 'kpiQltt', 'kpiPeer', 'kpiSelf', 'kpiBonus']);
  // Các ô tiền cộng vào TỔNG LƯƠNG (lateCut trừ đi); tiền giờ làm bù nằm trong otPay
  const INCOME = [
    'workBase',
    'leavePay',
    'settlePay',
    'isatPay',
    'holidayPay',
    'otPay',
    'attendance',
    'travel',
    'flexPay',
    'breakPay',
    'nightPay',
    'kpiPay'
  ];
  // Các ô phụ cấp Admin sửa được, cùng nằm trong payslip.allowanceTotal của máy chủ (phụ cấp ca, giờ nghỉ đêm, đi lại, chuyên cần)
  const ALLOW = ['attendance', 'travel', 'flexPay', 'breakPay', 'nightPay'];
  // Ô điểm KPI của phiếu (khoá SLIP_QTY của máy chủ) theo mã thành phần của public/kpi-score.js → COMPONENTS
  const KPI_CELL = { wework: 'kpiBase', user: 'kpiUser', peer: 'kpiPeer', manager: 'kpiQltt', self: 'kpiSelf' };
  /* Tên và thứ tự 5 thành phần: MỘT bộ với màn Đánh giá KPI (view-kpi.js → A.KPI_PARTS, nạp trước file này). Bản chép dưới chỉ dùng khi
     file này chạy một mình (test đơn vị trong vm), phải giống hệt bộ của view-kpi.js. */
  const KPI_NAMES = A.KPI_PARTS || [
    ['wework', 'Base Wework'],
    ['user', 'Người dùng'],
    ['peer', 'Đồng nghiệp'],
    ['manager', 'Quản lý trực tiếp'],
    ['self', 'Tự đánh giá']
  ];
  // [ô của phiếu, nhãn, mã thành phần]; dòng Bonus không phải thành phần nên không có mã, không có trọng số
  const KPI_PARTS = [
    ...KPI_NAMES.filter(([code]) => KPI_CELL[code]).map(([code, name]) => [KPI_CELL[code], name, code]),
    ['kpiBonus', 'KPI - Bonus (%)']
  ];
  // Ô điểm KPI -> khoá trọng số kpi.weight.<mã> trong tham số (hiện "(40%)" sau nhãn khi có tham số)
  const KPI_WEIGHT_KEY = Object.fromEntries(
    KPI_PARTS.filter(p => p[2]).map(([k, , code]) => [k, `kpi.weight.${code}`])
  );
  /* Các nhóm dòng của hộp phiếu: [khoá, nhãn, kiểu, đơn vị]. Kiểu: qty (ngày, giờ), money, minus (tiền trừ, hiện dấu −), pct.
     Chế độ xem chỉ hiện dòng có số; chế độ sửa hiện mọi dòng Admin sửa được (khoá trùng SLIP_MONEY / SLIP_QTY của máy chủ). */
  const GROUPS = [
    [
      'Ngày công và lương cơ bản',
      [
        ['workDays', 'Ngày công', 'qty', 'ngày'],
        ['unpaidDays', 'Nghỉ không lương', 'qty', 'ngày'],
        ['workBase', 'Lương cơ bản theo ngày công', 'money']
      ]
    ],
    [
      'Nghỉ phép và ngày lễ',
      [
        ['leaveDays', 'Nghỉ phép có lương', 'qty', 'ngày'],
        ['leavePay', 'Tiền nghỉ phép có lương', 'money'],
        ['settleDays', 'Quyết toán phép dư', 'qty', 'ngày'],
        ['settlePay', 'Tiền quyết toán phép dư', 'money'],
        ['isatDays', 'Nghỉ thứ 7 hưởng lương · iSAT', 'qty', 'ngày'],
        ['isatPay', 'Tiền iSAT', 'money'],
        ['holidayDays', 'Nghỉ lễ hưởng lương', 'qty', 'ngày'],
        ['holidayPay', 'Tiền nghỉ lễ', 'money']
      ]
    ],
    [
      'Làm thêm giờ',
      [
        ['ot15H', 'OT ngày thường', 'qty', 'giờ'],
        ['ot20H', 'OT cuối tuần', 'qty', 'giờ'],
        ['ot30H', 'OT ngày lễ', 'qty', 'giờ'],
        ['otPay', 'Tiền làm thêm giờ (OT, OT ngày lễ, làm bù)', 'money']
      ]
    ],
    [
      'Phụ cấp',
      [
        ['attendance', 'Phụ cấp chuyên cần', 'money'],
        ['travel', 'Phụ cấp đi lại', 'money'],
        ['flexPay', 'Phụ cấp linh hoạt', 'money'],
        ['breakPay', 'Phụ cấp Off Paid (ca đêm)', 'money'],
        ['nightPay', 'Thưởng ca đêm', 'money']
      ]
    ],
    [
      'Lương KPI',
      [
        ...KPI_PARTS.map(([k, l]) => [k, l, 'pct']),
        ['kpiPct', 'Tổng điểm KPI', 'pct'],
        ['kpiAmt', 'Lương KPI tối đa', 'money'],
        ['kpiPay', 'Lương KPI', 'money']
      ]
    ],
    [
      'Khấu trừ',
      [
        ['debtH', 'Giờ đi muộn, về sớm, ra ngoài', 'qty', 'giờ'],
        ['lateCut', 'Tiền trừ đi muộn, về sớm, ra ngoài', 'minus'],
        ['insurance', 'Bảo hiểm bắt buộc (BHXH, BHYT, BHTN)', 'minus'],
        ['tax', 'Thuế TNCN', 'minus'],
        ['advance', 'Tạm ứng', 'minus']
      ]
    ],
    [
      'Khác',
      [
        ['exempt', 'Các khoản miễn thuế', 'money'],
        ['leaveLeft', 'Ngày phép năm còn lại', 'qty', 'ngày']
      ]
    ]
  ];
  const LABEL = Object.fromEntries(GROUPS.flatMap(([, defs]) => defs.map(([k, l]) => [k, l])));
  // Đuôi khoá có mức riêng theo bậc (public/pay-options-calc.js → LEVEL_OVERRIDE_RE)
  const LEVEL_TAIL = /^(travel|attendance|flexBonus|nightOptions|benefit\.[A-Za-z0-9]+)$/;
  // Loại hợp đồng như màn Nhân sự (view-ho-so.js → CONTRACT_SHORT). GFT không có thử việc: không ghi "Thử việc"
  const CONTRACT = { long: 'HĐLĐ từ 3 tháng', short: 'Dưới 3 tháng' };
  const REASON_MAX = 300; // khớp config.REASON_MAX của máy chủ (lib/config.js)
  // Dấu loại phiếu trên bản in (góc trên bên phải) và nhãn của hộp bản in
  const TAGS = {
    final: ['', 'Phiếu lương chính thức'],
    draft: ['est', 'Bản nháp · chưa phê duyệt kỳ'],
    estimate: ['est', 'Chưa phải lương chính thức']
  };

  /* ---------- định dạng ---------- */
  const N = v => Math.round(v || 0).toLocaleString('en-US'); // số kiểu mẫu phiếu của công ty: 6,000,000
  const Hr = v => (Math.round((v || 0) * 100) / 100).toLocaleString('en-US');
  const Pc = v => (Math.round(v * 1000) / 10).toLocaleString('en-US') + '%';
  const vn = (v, d = 0) => Number(v).toLocaleString('vi-VN', { maximumFractionDigits: d });
  const hasNum = v => typeof v === 'number' && Number.isFinite(v);
  const numOr0 = v => (hasNum(v) ? v : 0); // dòng Quyết toán phép dư: số của bản chụp, không có thì 0
  // Nhãn dòng giờ làm bù (hệ số 1, trả đủ giờ × lương giờ), kèm tiền giờ làm bù và phần trả thêm ngày lễ (bản chụp cũ): đã nằm trong otPay
  const makeupLabel = (f, fmt) =>
    `Làm bù ×1${f.makeupPay > 0.5 ? ` (${fmt(f.makeupPay)}${f.makeupHolPremium > 0.5 ? `, gồm trả thêm ngày lễ ${fmt(f.makeupHolPremium)}` : ''})` : ''}`;
  const ref = v => (hasNum(v) ? N(v) : '—'); // cũng dùng cho các dòng tổng khi máy chủ chưa gửi số (hiện —, không đoán)
  // Giá trị trong hộp thoại: tiền kiểu 1.234.567 ₫, giờ/ngày kiểu 1,5, % có dấu %
  function show(k, v) {
    if (!hasNum(v)) return '—';
    if (MONEY.has(k)) return `${vn(v)} ₫`;
    if (PCT.has(k)) return `${vn(v, 2)}%`;
    return vn(v, 2);
  }
  const rawOf = (k, v) => (!hasNum(v) ? '' : MONEY.has(k) ? String(Math.round(v)) : String(Math.round(v * 100) / 100));
  const blank = v => !hasNum(v) || Math.abs(v) < 0.005; // dòng "bằng 0 hoặc để trống" của hộp phiếu
  const money = v => (hasNum(v) ? `${vn(v)} ₫` : '—');
  // Chữ một dòng của hộp phiếu: ngày, giờ kèm đơn vị; %; tiền trừ có dấu −
  function lineText(kind, unit, v) {
    if (!hasNum(v)) return '—';
    if (kind === 'qty') return unit ? `${vn(v, 2)} ${unit}` : vn(v, 2);
    if (kind === 'pct') return `${vn(v, 2)}%`;
    if (kind === 'minus') return blank(v) ? '0' : `−${vn(v)}`;
    return vn(v);
  }
  const kindOf = res => (!res.run ? 'estimate' : res.run.status === 'final' ? 'final' : 'draft');

  /* ---------- tham số của tháng ----------
     Cột "Số liệu" của mẫu (lương cơ bản của level, tỷ lệ phụ cấp, tỷ lệ bảo hiểm) và các nhãn có tỷ lệ lấy từ GET /settings/params?month=
     (cần quyền xem cấu hình; không có quyền hay lỗi thì nhãn không kèm số, cột "Số liệu" hiện —). Phiếu đã tính chỉ dùng khi băm tham số
     của tháng còn trùng băm của lần tính; ước tính dùng tham số hiện hành của tháng. Trình duyệt không tính thuế hay tổng từ các tham số này. */
  function flatParams(view) {
    const out = {};
    for (const g of (view && view.groups) || []) {
      for (const e of g.entries || []) {
        for (const i of e.instances || []) if (i && typeof i.key === 'string') out[i.key] = i.value;
        // mục dạng bảng (level, trọng số KPI, quyền lợi...): mỗi hàng có keys { cột: khoá } và giá trị cùng tên cột
        if (Array.isArray(e.value))
          for (const row of e.value)
            if (row && row.keys && typeof row.keys === 'object')
              for (const [col, key] of Object.entries(row.keys)) if (Object.hasOwn(row, col)) out[key] = row[col];
      }
    }
    return out;
  }
  /* Mức riêng của từng bậc (level.<loại>.<bậc>.attendance|travel|flexBonus|nightOptions|benefit.*) không có trong sổ tham số: lấy ở
     GET /entitlements → levelCells, chỉ ô bậc tự đặt (source 'level'), cùng số phiên bản tham số với sổ. Không đọc được thì phiếu dùng mức chức vụ. */
  function levelKeysOf(ent, rev) {
    const out = {};
    if (!ent || !Array.isArray(ent.levelCells) || (rev != null && ent.paramsRev != null && ent.paramsRev !== rev))
      return out;
    for (const row of ent.levelCells)
      for (const c of Object.values((row && row.cells) || {}))
        if (c && c.source === 'level' && typeof c.key === 'string' && c.value !== null) out[c.key] = c.value;
    return out;
  }
  // Không nhớ kết quả giữa các lần mở: tham số của tháng có thể đổi (tham số mới áp dụng từ tháng chưa khoá sớm nhất)
  const paramsFor = (month, hash) => {
    const q = `?month=${encodeURIComponent(month)}`;
    const get = path => A.api('GET', path + q).catch(() => null);
    return Promise.all([get('/settings/params'), get('/entitlements')]).then(([v, ent]) =>
      v && Array.isArray(v.groups) && (!hash || v.paramsHash === hash)
        ? { ...flatParams(v), ...levelKeysOf(ent, v.paramsRev) }
        : null
    );
  };
  const kpiLabel = (k, text, P) => {
    const w = P && KPI_WEIGHT_KEY[k] ? P[KPI_WEIGHT_KEY[k]] : undefined;
    return hasNum(w) ? `${text} (${vn(w, 2)}%)` : text;
  };

  /* ---------- gom số của bản chụp vào đúng dòng của mẫu ---------- */
  /* Ngày lễ của tháng hiện trên dòng "Nghỉ lễ hưởng lương": ngày lễ rơi vào thứ làm việc của nhóm. Có danh sách ngày lễ
     của lần tính thì dùng nó; không có (ước tính) thì lấy các ngày bản chụp đã đánh dấu lễ. */
  function holidayDatesOf(rows, month, holidays) {
    if (Array.isArray(holidays)) {
      // ngày lễ có dòng lễ trong bản chụp (ngày lễ trong lịch); ngày lễ khai đi làm mà vắng là dòng 'noshow', không hưởng lương lễ
      const dated = new Set(rows.filter(r => r.kind === 'holiday').map(r => r.date));
      return holidays.filter(h => h.slice(0, 7) === month && dated.has(h)).sort();
    }
    return rows.flatMap(r => (r.kind === 'holiday' ? [r.date] : [])).sort(); // chỉ dòng ngày lễ; ca ngày thường sang lễ (holWork) không phải ngày lễ
  }
  function figures(p, month, P, leave, holidays) {
    const m = p && p.snapshot,
      terms = p && p.staffTerms;
    if (!m || !terms || !m.net || !Array.isArray(m.rows)) return null;
    const n = m.net;
    // Quyền lợi theo bậc trước chức vụ, như public/pay-options-calc.js → levelView: level.<loại>.<bậc>.<đuôi> (khác null) thay type.<loại>.<đuôi>
    const tk = suffix => {
      if (!P) return undefined;
      const own = LEVEL_TAIL.test(suffix) ? P[`level.${terms.type}.${terms.level}.${suffix}`] : undefined;
      return own !== undefined && own !== null ? own : P[`type.${terms.type}.${suffix}`];
    };
    const T = {
      workdays: tk('workdays'),
      attendance: Number(tk('attendance')) || 0,
      travel: Number(tk('travel')) || 0,
      flexBonus: tk('flexBonus'),
      nightOptions: tk('nightOptions'),
      kpi: P ? !!tk('benefit.kpi') : m.kpiAmt != null,
      short: A.TYPE_SHORT[terms.type] || ''
    };
    const base = P ? P[`level.${terms.type}.${terms.level}.base`] : undefined;
    const levelName = P ? P[`level.${terms.type}.${terms.level}.name`] : undefined;
    const dayRow = m.rows.find(r => hasNum(r.daily) && hasNum(r.hourly));
    const hourly = dayRow ? dayRow.hourly : 0;
    const sum = fn => m.rows.reduce((s, r) => s + (fn(r) || 0), 0);
    const year = Number(month.slice(0, 4)),
      mo = Number(month.slice(5));
    const last = new Date(Date.UTC(year, mo, 0)).getUTCDate();
    const start =
      typeof terms.startDate === 'string' && terms.startDate.slice(0, 7) === month
        ? Number(terms.startDate.slice(8))
        : 1;
    const flexPct = T.flexBonus ?? (P ? P['shift.flex.bonus'] : undefined);
    // mức ca đêm: phần tử đầu của bảng mức hiệu lực (bậc nếu bậc có mức riêng, không thì chức vụ: tk); chức vụ không đặt bảng thì mức chung
    const nightOpts = T.nightOptions;
    const nightPct =
      Array.isArray(nightOpts) && nightOpts.length
        ? Number(nightOpts[0]) / 100
        : P
          ? P['shift.night.bonus']
          : undefined;
    // nhãn phụ cấp kèm tỷ lệ LCB lấy từ tham số; thiếu tham số thì nhãn không kèm số
    const pctLcb = x => (hasNum(x) ? ` (${Pc(x)} LCB)` : '');
    const nightText =
      Array.isArray(nightOpts) && nightOpts.length
        ? `BONUS - ${nightOpts.map(x => vn(Number(x), 2)).join('% or ')}% LCB (Đêm)`
        : hasNum(nightPct)
          ? `BONUS - ${Pc(nightPct)} LCB (Đêm)`
          : 'BONUS - LCB (Đêm)';
    const f = {
      labels: {
        attendance: `Phụ cấp - Chuyên cần${pctLcb(tk('attendance'))}`,
        travel: `Phụ cấp – Đi lại${pctLcb(tk('travel'))}`,
        flex: `Phụ cấp - Linh hoạt${pctLcb(flexPct)}`,
        night: nightText
      },
      year,
      mo,
      from: start,
      to: last,
      workDays: m.count, // theo Check-in/out: ngày nghỉ sẽ làm bù không cộng (như lib/slip-paid.js)
      workBase: m.basePay - m.off + m.cut, // lương cơ bản của ngày đi làm, trước khi trừ giờ thiếu
      lateCut: Math.max(0, m.cut), // chỉ tiền giờ thiếu: giờ làm bù là tiền làm thêm giờ, trả ở otPay
      makeupHours: numOr0(m.makeupHours),
      makeupPay: numOr0(m.makeupPay), // tiền giờ làm bù và phần trả thêm ngày lễ (bản chụp cũ): đã nằm trong otPay, chỉ để ghi chú
      makeupHolPremium: numOr0(m.makeupHolPremium),
      leavePay: sum(r => (r.kind === 'leave' ? r.total : 0)),
      isatPay: sum(r => (r.kind === 'isat' ? r.total : 0)),
      holidayPay: sum(r => (r.kind === 'holiday' ? r.holBase : 0)),
      holidayDays: m.rows.filter(r => r.kind === 'holiday' && r.holBase > 0).length,
      holidayDates: holidayDatesOf(m.rows, month, holidays).map(d => `${Number(d.slice(8))}/${mo}`),
      unpaidDays: m.unpaid + m.approved + m.noshow,
      flexPay: sum(r => (r.shift === 'flex' ? r.bonus : 0)),
      nightPay: sum(r => (r.shift === 'night' ? r.bonus : 0)),
      ot15H: m.otHours - numOr0(m.otWeekendHours) - (m.otHolHours || 0), // giờ OT theo loại (như lib/slip-paid.js → cellsOf): ngày thường / cuối tuần ngoài lịch / ngày lễ; bản chụp cũ có otHolHours trong otHours
      ot20H: numOr0(m.otWeekendHours),
      ot30H: m.holWorkHours + (m.otHolHours || 0), // OT ngày lễ: mọi giờ OT được duyệt rơi vào ngày lễ
      otMoney: [m.otWeekdayPay, m.otWeekendPay, m.holWorkPay, m.otHolPay] // tiền OT từng nhóm do bộ máy tính; phieu-a4.js hiện nguyên số
    };
    // tỷ lệ phụ cấp theo tham số, cho nhãn của bản in mới (phieu-a4.js); thiếu tham số thì không có
    f.rates = {
      attendance: tk('attendance'),
      travel: tk('travel'),
      flex: flexPct,
      night: Array.isArray(nightOpts) && nightOpts.length ? nightOpts.map(Number) : null,
      nightOne: nightPct,
      breakPremium: P ? P['night.breakPremium'] : undefined,
      otRates: P ? [P['ot.rate'], P['ot.weekendRate'], P['ot.holidayRate']] : []
    };
    // cờ của chức vụ do máy chủ gửi; chưa biết thì coi là có tài khoản phép khi máy chủ đã gửi số phép của người này
    const fallbackLeave = leave !== null && leave !== undefined;
    const hasLeaveAccount = A.positions ? A.positions.flag(terms.type, 'leaveAccount', fallbackLeave) : fallbackLeave;
    f.status = !hasLeaveAccount ? A.TYPE_LONG[terms.type] || '' : CONTRACT[n.contract || terms.contract] || '';
    f.position =
      String(terms.jobTitle || '').trim() ||
      (T.nightOptions
        ? levelName || A.levelNames.name(terms.type, terms.level, month)
        : `${T.short} · ${levelName || A.levelText(terms.type, terms.level, month)}`);
    f.leaveLeft = !hasLeaveAccount ? 0 : leave && hasNum(leave.balance) ? leave.balance : null;
    const kp = m.kpiPct == null ? 0 : m.kpiPct;
    /* 5 ô điểm KPI: điểm máy chủ điền sẵn trên phiếu (payslip.kpiSlip, từ điểm đã nhập ở màn Đánh giá KPI; null khi tháng chưa tính theo
       5 thành phần). Máy chủ không gửi ô điền sẵn thì lấy điểm trong bản chụp của lần tính (m.kpiParts, chỉ có ở tháng tính 5 thành phần).
       Ô chưa nhập là null; số Admin sửa vẫn thắng (effective). */
    const slipKpi = p.kpiSlip && typeof p.kpiSlip === 'object' ? p.kpiSlip : null;
    const snapKpi = m.kpiParts && typeof m.kpiParts === 'object' ? m.kpiParts : {};
    const kpiScore = (k, code) => {
      const v = slipKpi ? slipKpi[k] : code ? snapKpi[code] : null;
      return hasNum(v) ? v : null;
    };
    // Số tự tính của từng ô Admin sửa được (khoá trùng SLIP_MONEY / SLIP_QTY)
    const auto = {
      workDays: f.workDays,
      workBase: f.workBase,
      unpaidDays: f.unpaidDays,
      leaveDays: m.leave,
      leavePay: f.leavePay,
      settleDays: numOr0(m.settleDays),
      settlePay: numOr0(m.settlePay),
      isatDays: m.isat,
      isatPay: f.isatPay,
      holidayDays: f.holidayDays,
      holidayPay: f.holidayPay,
      ot15H: f.ot15H,
      ot20H: f.ot20H,
      ot30H: f.ot30H,
      otPay: m.otPay + m.holWorkPay + numOr0(m.makeupPay), // OT ngày thường, OT ngày lễ và giờ làm bù
      attendance: m.attendance,
      travel: m.travel,
      flexPay: f.flexPay,
      breakPay: m.breakPay,
      nightPay: f.nightPay,
      kpiPay: m.kpiPay,
      kpiPct: T.kpi && m.kpiPct != null ? kp : 0,
      kpiAmt: T.kpi ? m.kpiAmt || 0 : 0,
      debtH: m.debt,
      lateCut: f.lateCut,
      exempt: n.exempt,
      insurance: n.insurance,
      tax: n.tax,
      advance: n.advance,
      leaveLeft: f.leaveLeft,
      ...Object.fromEntries(KPI_PARTS.map(([k, , code]) => [k, kpiScore(k, code)]))
    };
    // Số tự tính từng ô của máy chủ (payslip.cells, gồm phần do ô số lượng ghim đổi) thắng số gom ở trên; điểm KPI giữ cách đọc trên
    const cells = p.cells && typeof p.cells === 'object' ? p.cells : {};
    for (const [k, v] of Object.entries(cells)) if (!PCT.has(k) && Object.hasOwn(auto, k) && hasNum(v)) auto[k] = v;
    // Cột "Số liệu" của mẫu: mức tham khảo cả tháng theo nhóm và level của người này (— khi chưa có bộ tham số khớp)
    const refs = {
      workdays: m.workdaysStd ?? T.workdays ?? '—', // ngày công chuẩn của người này khi máy chủ gửi (tự đếm theo lịch)
      base: base,
      attendance: base != null ? base * T.attendance : undefined,
      travel: base != null ? base * T.travel : undefined,
      flex: base != null && flexPct != null ? base * flexPct : undefined,
      // Off Paid: cờ type.<mã>.benefit.breakPay = false (TTS) thì không hưởng, không hiện mức tham khảo (đọc như bộ máy)
      off:
        (m.workdaysStd ?? T.workdays) != null && P && P[`type.${terms.type}.benefit.breakPay`] !== false
          ? hourly * (1 + P['night.breakPremium']) * (m.workdaysStd ?? T.workdays)
          : undefined,
      night: base != null && nightPct != null ? base * nightPct : undefined
    };
    // Tổng phụ cấp do máy chủ cộng (số tự tính, chưa áp số Admin sửa); null khi máy chủ không có số
    const allowanceTotal = hasNum(p.allowanceTotal) ? p.allowanceTotal : null;
    return { m, n, terms, T, P, f, auto, refs, month, allowanceTotal };
  }

  /* Số trên phiếu. Các dòng TỔNG là SỐ CHI TRẢ của máy chủ (paid = payslip: gross, insurance, tax, advance, net; kèm exempt, taxable,
     afterInsurance khi máy chủ gửi); ô đơn lẻ Admin đã sửa lấy từ số đã lưu (values). Không cộng trừ, không tính thuế ở trình duyệt.
     Phiếu chưa sửa số nào thì số chi trả = số tự tính của bản chụp. Phiếu có số sửa mà máy chủ chưa gửi một số (thu nhập chịu thuế...)
     thì số đó là null và hiện "—", không đoán. */
  function effective(fig, values, paid) {
    const { n, auto } = fig;
    const has = k => Object.hasOwn(values, k);
    const touched = Object.keys(values).length > 0;
    const server = paid && hasNum(paid.gross) && hasNum(paid.net) ? paid : null;
    const overridden = server ? !!server.overridden : touched;
    const pick = (key, snap) => (server && hasNum(server[key]) ? server[key] : overridden ? null : snap);
    const total = pick('gross', n.gross);
    const insurance = pick('insurance', n.insurance);
    const tax = pick('tax', n.tax);
    const advance = pick('advance', n.advance);
    // miễn thuế: ô Admin sửa tay, hoặc số máy chủ gửi, hoặc số tự tính của bản chụp (ô này không do tổng lương đổi theo trên phiếu)
    const exempt = has('exempt') ? values.exempt : server && hasNum(server.exempt) ? server.exempt : n.exempt;
    // Tổng phụ cấp: số của máy chủ cộng chênh lệch (số sửa − số tự tính) của đúng các ô phụ cấp Admin đã sửa; máy chủ không có số thì null
    const allowEd = ALLOW.filter(k => has(k) && hasNum(values[k]));
    const allowance = hasNum(fig.allowanceTotal)
      ? allowEd.reduce((s, k) => s + values[k] - (hasNum(auto[k]) ? auto[k] : 0), fig.allowanceTotal)
      : null;
    return {
      has,
      V: k =>
        k === 'exempt'
          ? exempt
          : k === 'tax'
            ? tax
            : k === 'insurance'
              ? insurance
              : k === 'advance'
                ? advance
                : has(k)
                  ? values[k]
                  : auto[k],
      total,
      exempt,
      taxable: pick('taxable', n.taxable),
      insurance,
      tax,
      advance,
      afterIns: pick('afterInsurance', hasNum(n.gross) && hasNum(n.insurance) ? n.gross - n.insurance : null),
      net: pick('net', n.net),
      allowance,
      allowanceEdited: allowEd.length > 0,
      touched,
      overridden
    };
  }

  /* ---------- HTML của phiếu A4 ---------- */
  const td = (v, cls = '', extra = '') => `<td class="${cls}"${extra}>${v}</td>`;
  const tr = (cls, cells) => `<tr class="${cls}">${cells}</tr>`;
  const lab = (t, cls = '') => td(t, cls);
  function fmtCell(fig, k, v) {
    if (v == null) return k.startsWith('kpi') ? (fig.T.kpi ? '-' : '0') : '—';
    if (k === 'kpiPct') return v ? Hr(v) + '%' : '0';
    if (k === 'lateCut') return v > 0.5 ? '-' + N(v) : '0';
    return MONEY.has(k) ? N(v) : Hr(v);
  }
  /* Khoản điền thêm đã duyệt (m.entries do máy chủ gửi, chỉ có khi tháng này có khoản): mỗi khoản một dòng riêng, nhãn theo
     dòng trên phiếu (slipLine) hoặc nhãn khoản. Chỉ hiện số của máy chủ; khoản cộng đã nằm trong TỔNG LƯƠNG, khoản trừ trừ sau thuế. */
  function entryLines(fig) {
    const list = Array.isArray(fig.m.entries) ? fig.m.entries : [];
    const pick = (e, a, b) => (e[a] !== undefined ? e[a] : e[b]);
    const line = e => ({
      text: String(pick(e, 'slipLine', 'slip_line') || e.label || 'Khoản điền thêm'),
      amount: Math.abs(Number(e.amount) || 0),
      deduct: e.direction === 'deduct'
    });
    return list.filter(e => e && hasNum(Number(e.amount))).map(line);
  }
  function entryRows(fig) {
    const rows = entryLines(fig);
    const add = rows
      .filter(r => !r.deduct)
      .map(r => tr('', lab(esc(r.text)) + td('', 'r n') + td(N(r.amount), 'r blue')));
    const less = rows
      .filter(r => r.deduct)
      .map(r => tr('', lab(esc(r.text)) + td('-' + N(r.amount), 'c blue n', ' colspan="2"')));
    return { add, less };
  }
  /* Khối phụ cấp do C&B thêm (m.blocks do máy chủ gửi, chỉ có khi người này có khối): mỗi khối một dòng phụ cấp riêng, số của máy chủ.
     Đã nằm trong TỔNG LƯƠNG; khối bị mất theo điều kiện có số 0 nên không hiện. */
  function blockLines(fig) {
    // phiếu chụp: khoiThemChiTiet [{ code, label, amount }] (ưu tiên); chưa có thì m.blocks của bộ máy
    const list = Array.isArray(fig.m.khoiThemChiTiet)
      ? fig.m.khoiThemChiTiet
      : Array.isArray(fig.m.blocks)
        ? fig.m.blocks
        : [];
    return list
      .filter(b => b && hasNum(Number(b.amount)) && Number(b.amount) !== 0)
      .map(b => ({ code: b.code, label: String(b.label || 'Khoản thêm'), amount: Number(b.amount) }));
  }
  const blockRows = fig =>
    blockLines(fig).map(b => tr('al', lab(`Phụ cấp - ${esc(b.label)}`) + td('', 'r n') + td(N(b.amount), 'r n')));
  function slipRows(fig, eff) {
    const { f, P, refs, terms, auto } = fig;
    const otRows = f.makeupHours > 0 ? 4 : 3; // dòng giờ làm bù: tiền nằm trong ô tiền làm thêm giờ, chỉ hiện số giờ
    const extra = entryRows(fig);
    const blocks = blockRows(fig);
    const cell = (k, cls = '', span = '') =>
      td(
        fmtCell(fig, k, eff.V(k)),
        cls + (eff.has(k) ? ' ovr' : ''),
        span + (eff.has(k) ? ` title="Admin sửa · số tự tính: ${esc(fmtCell(fig, k, auto[k]))}"` : '')
      );
    const rate = key => (P && hasNum(P[key]) ? Pc(P[key]) : '');
    const bh = (name, k) =>
      rate(`tax.insurance.employee.${k}`)
        ? `${name} (${rate(`tax.insurance.employee.${k}`)} LĐ, ${rate(`tax.insurance.employer.${k}`)} SDLĐ)`
        : name;
    return [
      tr('hd', td(esc(terms.name)) + td(esc(f.status)) + td(esc(f.position))),
      tr('gray', td('Thông tin', 'c i n') + td('Số liệu', 'c i n') + td('Thực tế', 'c i n')),
      tr('gray', td(`Công chuẩn tính lương theo quy chế: ${refs.workdays}`, 'c i', ' colspan="3"')),
      tr('tall', lab(`Ngày công tháng ${f.mo}`) + td(refs.workdays, 'c') + cell('workDays', 'r red')),
      tr('tall', lab('Lương cơ bản') + td(ref(refs.base), 'r n') + cell('workBase', 'r blue')),
      tr('tall', lab('Nghỉ không lương') + cell('unpaidDays', 'r blue', ' colspan="2"')),
      tr('tall', lab('Nghỉ phép có lương') + cell('leaveDays', 'r blue') + cell('leavePay', 'r blue')),
      tr('tall', lab('Quyết toán phép dư') + cell('settleDays', 'r blue') + cell('settlePay', 'r blue')),
      tr('', lab('Ngày nghỉ thứ 7 hưởng LCB (iSAT)') + cell('isatDays', 'r blue') + cell('isatPay', 'r blue')),
      tr(
        '',
        lab(`Nghỉ lễ hưởng lương${f.holidayDates.length ? ` (${f.holidayDates.join(', ')})` : ''}`) +
          cell('holidayDays', 'r blue') +
          cell('holidayPay', 'r blue')
      ),
      tr('ot', lab('OT 1.5') + cell('ot15H', 'r n') + cell('otPay', 'r blue', ` rowspan="${otRows}"`)),
      tr('ot', lab('OT 2.0') + cell('ot20H', 'r n')),
      tr('ot', lab('OT 3.0') + cell('ot30H', 'r n')),
      ...(f.makeupHours > 0 ? [tr('ot', lab(makeupLabel(f, N)) + td(Hr(f.makeupHours), 'r n'))] : []),
      // nhãn giữ đúng mẫu công ty; cột "Số liệu" là mức tham khảo cả tháng theo nhóm / level
      tr('al', lab(esc(f.labels.attendance)) + td(ref(refs.attendance), 'r n') + cell('attendance', 'r n')),
      tr('al', lab(esc(f.labels.travel)) + td(ref(refs.travel), 'r n') + cell('travel', 'r n')),
      tr('al', lab(esc(f.labels.flex)) + td(ref(refs.flex), 'r n') + cell('flexPay', 'r n')),
      tr('al', lab('Phụ cấp - Off Paid (Đêm)') + td(ref(refs.off), 'r n') + cell('breakPay', 'r n')),
      tr('al', lab(esc(f.labels.night)) + td(ref(refs.night), 'r n') + cell('nightPay', 'r n')),
      ...blocks,
      // Tổng phụ cấp: số của máy chủ (effective); máy chủ không có số thì bỏ dòng
      ...(hasNum(eff.allowance)
        ? [tr('al', lab('Tổng phụ cấp', 'blue') + td(N(eff.allowance), 'r blue', ' colspan="2"'))]
        : []),
      ...KPI_PARTS.map(([k, t], i) =>
        tr(
          'kp',
          lab(esc(kpiLabel(k, t, P))) + cell(k, 'r n') + (i === 0 ? cell('kpiPay', 'r blue', ' rowspan="8"') : '')
        )
      ),
      tr('kp', lab('Tổng KPI', 'blue') + cell('kpiPct', 'r blue')),
      tr('kp', lab('Đề xuất KPI', 'blue') + cell('kpiAmt', 'r blue')),
      tr('', lab('Đi trễ/Về sớm/Ra ngoài', 'blue') + cell('debtH', 'r blue') + cell('lateCut', 'r blue')),
      ...extra.add,
      tr('sum', lab('TỔNG LƯƠNG', 'navy n') + td(ref(eff.total), 'c blue', ' colspan="2"')),
      tr('big', lab('TỔNG CÁC KHOẢN MIỄN THUẾ') + cell('exempt', 'c blue', ' colspan="2"')),
      tr('big', lab('THU NHẬP CHỊU THUẾ') + td(ref(eff.taxable), 'c blue', ' colspan="2"')),
      tr(
        '',
        lab(bh('BHXH', 'bhxh')) +
          td(rate('tax.insurance.employee.bhxh') ? Pc(sumRates(P, 'employee')) : '', 'c blue n', ' rowspan="3"') +
          cell('insurance', 'r blue', ' rowspan="3"')
      ),
      tr('', lab(bh('BHTN', 'bhtn'))),
      tr('', lab(bh('BHYT', 'bhyt'))),
      tr('big', lab('THU NHẬP SAU BH BẮT BUỘC', 'blue') + td(ref(eff.afterIns), 'c blue', ' colspan="2"')),
      tr('', lab('THUẾ TNCN') + cell('tax', 'c blue n', ' colspan="2"')),
      tr('', lab('TẠM ỨNG') + cell('advance', 'c blue n', ' colspan="2"')),
      ...extra.less,
      tr('net', lab('THỰC LĨNH') + td(ref(eff.net), 'c', ' colspan="2"')),
      tr('last', lab('Ngày nghỉ phép còn lại', 'blue') + cell('leaveLeft', 'r blue', ' colspan="2"'))
    ];
  }
  // Tổng tỷ lệ BH của người lao động (ô gộp ba dòng BH của mẫu): 8% + 1,5% + 1% = 10,5%
  const sumRates = (P, who) => ['bhxh', 'bhyt', 'bhtn'].reduce((s, k) => s + (P[`tax.insurance.${who}.${k}`] || 0), 0);

  // Mẫu phiếu cũ không in dấu loại phiếu
  const slipShell = (inner, f) => {
    return `<section class="pl-page"><article class="pl-slip">
<img class="wm" src="slip/gft-watermark.png" alt="">
<img class="logo" src="slip/gft-logo.png" alt="GFT">
<div class="ttl"><h1>BẢNG CHI TIẾT LƯƠNG NHÂN VIÊN</h1><p>Tháng ${f.mo}.${f.year} (từ ngày ${f.from}/${f.mo} đến ngày ${f.to}/${f.mo})</p></div>
<div class="body"><table><colgroup><col style="width:170pt"><col style="width:103.1pt"><col style="width:139.7pt"></colgroup><tbody>${inner}</tbody></table>
<div class="sign"><b>Người Nhận</b><i>(Ký, ghi rõ họ tên)</i></div></div>
<div class="foot"></div>
<img class="slogan" src="slip/gft-slogan.png" alt="Trao trọn niềm tin, gửi trọn giải pháp.">
</article></section>`;
  };
  // Mẫu cũ "BẢNG CHI TIẾT LƯƠNG NHÂN VIÊN" (test đơn vị khoá chữ của mẫu); bản in của giao diện dùng A.Phieu.sheetOf (phieu-a4.js)
  const pageOf = model => slipShell(slipRows(model.fig, model.eff).join(''), model.fig.f);

  /* ---------- dựng mô hình từ một phản hồi phiếu ---------- */
  const leaveOf = u => {
    const s = A.staff && A.staff.byUser && A.staff.byUser.get(u);
    return s ? s.leave : null;
  };
  const hashOf = res => (res && ((res.run && res.run.paramsHash) || res.paramsHash)) || '';
  function modelOf(res, month, P, values, holidays) {
    const p = res.payslip;
    const fig = figures(p, month, P, leaveOf(p.username), holidays);
    if (!fig) return null;
    const kind = kindOf(res);
    return {
      fig,
      eff: effective(fig, values || {}, p), // số chi trả do máy chủ trả trên phiếu
      kind,
      month,
      username: p.username,
      name: p.name || fig.terms.name
    };
  }
  const valuesOf = ov => (ov && ov.values && typeof ov.values === 'object' ? ov.values : {});

  /* ---------- hộp phiếu (ngăn kéo): tóm tắt, các dòng có số, sửa số (so số tự tính với số trên phiếu) ---------- */
  let active = null; // phiếu đang mở trong hộp thoại (để nút "In phiếu" ở chân hộp dùng đúng số hiện tại)
  const stamp = ov => (ov && ov.updatedAt ? A.fmtStamp(ov.updatedAt) : '');

  async function mount(box, dlg, ctx) {
    const st = {
      mode: 'view', // view | edit
      fig: null,
      eff: null,
      P: null,
      ov: { values: {}, rev: 0, reason: null, updatedBy: null, updatedAt: null },
      ovState: 'loading', // loading | ok | na (không đủ quyền đọc) | fail
      ovError: '',
      draft: {},
      stale: null,
      clearing: false,
      ready: false,
      paidOk: true, // false: đã lưu nhưng chưa tải lại được phiếu, nên chưa có số chi trả mới từ máy chủ
      reason: '',
      warns: [], // cảnh báo của lần lưu gần nhất (chế độ 'warn'): hiện nguyên văn ở đầu hộp
      zeros: false, // hiện cả các dòng bằng 0 hoặc để trống
      derived: new Set() // ô KHÔNG sửa tay nhưng số đổi sau lần lưu gần nhất (máy chủ tính lại theo ô số lượng đã sửa): tag "đã tính lại"
    };
    active = { st, ctx, dlg };
    let p = ctx.res.payslip; // đổi khi phiếu được tải lại từ máy chủ (sau khi lưu số sửa)
    box.innerHTML = '<div class="skel" style="width:60%"></div><div class="skel" style="width:80%"></div>';

    const loadOverride = async () => {
      if (ctx.locked) {
        st.ov = { values: {}, rev: 0, ...(p.override || {}) };
        st.ovState = 'ok';
        return;
      }
      if (!ctx.canRead) {
        st.ovState = 'na';
        return;
      }
      try {
        st.ov = await A.api('GET', `/slip-override${A.qs({ month: ctx.month, user: p.username })}`);
        st.ovState = 'ok';
      } catch (e) {
        st.ovState = e && e.status === 403 ? 'na' : 'fail';
        st.ovError = A.errText(e);
      }
    };
    await Promise.all([loadOverride(), A.loadStaff(), paramsFor(ctx.month, hashOf(ctx.res)).then(v => (st.P = v))]);
    if (!box.isConnected) return;
    /* Chế độ 'warn', kỳ đã duyệt hoặc đã trả lương (ctx.locked sai, lần tính đã chốt): phiếu giữ số sửa ĐÃ ĐÓNG BĂNG lúc duyệt kỳ (payslip.override),
       số tổng của máy chủ khớp với số đó. Số sửa lưu sau đó (st.ov) chỉ vào phiếu khi mở lại kỳ và tính lại: hộp hiện số đóng băng, ghi chú phần chờ. */
    const frozen = () => !ctx.locked && kindOf(ctx.res) === 'final';
    const shownOv = () => (frozen() ? { values: {}, rev: 0, ...(p.override || {}) } : st.ov);
    const rebuild = () => {
      st.fig = st.fig || figures(p, ctx.month, st.P, leaveOf(p.username), ctx.holidays);
      // số chi trả của máy chủ; chưa tải lại được sau khi lưu thì không đưa số cũ ra (hiện —)
      st.eff = st.fig ? effective(st.fig, valuesOf(shownOv()), st.paidOk ? p : null) : null;
    };
    // Tải lại phiếu từ máy chủ để lấy số chi trả mới (tổng lương, thuế, thực lĩnh) sau khi lưu / bỏ số đã sửa.
    const refreshPaid = async () => {
      if (!ctx.res.run && !st.fig) return true; // phiếu ước tính không có bản chụp (máy chủ chưa có chi tiết từng người): không có gì để tải lại
      try {
        // Phiếu đã tính lương đọc ở payslips; phiếu ước tính (chưa có lần tính) đọc ở estimates: số sửa áp cả hai
        const fresh = await A.api(
          'GET',
          `/periods/${ctx.month}/${ctx.res.run ? 'payslips' : 'estimates'}/${encodeURIComponent(p.username)}`
        );
        ctx.res = fresh;
        p = fresh.payslip;
        st.fig = null; // dựng lại từ bản chụp mới
        st.paidOk = true;
        return true;
      } catch (e) {
        st.paidOk = false;
        dlg.error(
          `Đã lưu, nhưng chưa tải lại được số tổng từ máy chủ: ${A.errText(e)}. Đóng rồi mở lại phiếu để xem số mới.`
        );
        return false;
      }
    };
    rebuild();
    st.ready = true;
    const canEdit = () => ctx.canWrite && !ctx.locked && st.ovState === 'ok' && !!st.fig;

    /* nút In ở chân hộp: khoá khi đang sửa (số chưa lưu không được in) */
    const syncFooter = () => {
      const b = dlg.root.querySelector('[data-act="plprint1"]');
      if (b) b.disabled = st.mode === 'edit' || (!st.fig && !ctx.row);
    };

    function lockBanner() {
      const status = A.Ky && A.Ky.STATUS_TXT ? A.Ky.STATUS_TXT[ctx.status] || ctx.status : ctx.status;
      return A.note(`Kỳ lương đang ở trạng thái <b>${esc(status)}</b>, số trên phiếu không sửa được.`, 'lock');
    }
    // Kỳ đã chốt (chế độ 'warn'): số sửa đã lưu khác số đóng băng trên phiếu thì nói rõ khi nào có hiệu lực
    function frozenNote() {
      if (!frozen() || st.ovState !== 'ok') return '';
      const a = valuesOf(st.ov),
        b = valuesOf(p.override);
      const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(k => a[k] !== b[k]);
      if (!keys.length) return '';
      return A.note(
        `Số sửa lưu sau khi phê duyệt kỳ chưa vào phiếu đã chốt (ô: ${esc(keys.map(k => LABEL[k] || k).join(', '))}). Số trên phiếu chỉ đổi khi mở lại kỳ và tính lại lương.`,
        'alert'
      );
    }
    // Cảnh báo của lần lưu gần nhất, nguyên văn của máy chủ ('danger' còn nằm ở băng cố định của trang)
    const warnNotes = () =>
      st.warns
        .map(
          w =>
            `<div class="note ${w.severity === 'danger' ? 'err' : 'warn'}" role="status">${ic('alert', 16)}<span>${esc(w.message)}</span></div>`
        )
        .join('');
    function clearPanel() {
      if (!st.clearing) return '';
      return `<div class="pl-ovinfo" style="flex-direction:column;align-items:stretch">${A.reasonField('pl-clear-reason', 'Lý do bỏ hết số đã sửa (bắt buộc)', '')}<div class="row" style="gap:8px;justify-content:flex-end"><button type="button" class="btn sm" data-pl="clear-no">Không bỏ</button><button type="button" class="btn sm danger" data-pl="clear-ok">Bỏ hết số đã sửa</button></div></div>`;
    }
    function staleNote() {
      if (!st.stale) return '';
      const s = st.stale;
      return A.note(
        `Người khác vừa lưu số sửa của phiếu này${s.who ? ` (${esc(s.who)}${s.at ? ' lúc ' + esc(s.at) : ''})` : ''}${s.reason ? `, lý do: ${esc(s.reason)}` : ''}. Phiên bản đã được tải lại; <b>các số bạn đang gõ vẫn giữ nguyên</b>${s.keys.length ? `. Ô người khác đã đổi: ${esc(s.keys.map(k => LABEL[k] || k).join(', '))}` : ''}. Kiểm tra rồi bấm Lưu lại.`,
        'alert'
      );
    }

    /* ----- chế độ xem: số chưa chính thức tô nâu, Thực nhận gạch chân nét đứt ----- */
    const est = () => kindOf(ctx.res) !== 'final';
    const val = (text, cls) => `<span class="v"><span class="${cls}">${esc(text)}</span></span>`;
    const fmOf = text => (text ? `<small class="pl-fm">${esc(text)}</small>` : '');
    const ln = (label, text, o = {}) =>
      `<div class="pl-ln${o.ed ? ' ed' : ''}${o.dv ? ' dv' : ''}${o.cls ? ` ${o.cls}` : ''}"><span>${esc(label)}${o.dv ? '<small class="pl-dvtag">đã tính lại theo số bạn sửa</small>' : ''}${fmOf(o.fm)}</span>${val(text, o.muted ? 'mut' : o.money && est() ? 'pl-g' : '')}</div>`;
    // Tóm tắt: Tổng thu nhập − Bảo hiểm − Thuế TNCN − Tạm ứng (− khoản trừ khác của máy chủ) = Thực nhận
    function sum5(s) {
      const g = est() ? 'pl-g' : '';
      const cell = (l, v, cls = g, lead = '') =>
        `<div class="pl-s5c${lead}"><span class="l">${l}</span><span class="v ${cls}">${esc(hasNum(v) ? vn(v) : '—')}${lead ? ' ₫' : ''}</span></div>`;
      const op = c => `<span class="op" aria-hidden="true">${c}</span>`;
      const other = hasNum(s.other) && s.other > 0 ? op('−') + cell('Khoản trừ khác', s.other) : '';
      return `<div class="pl-s5" role="group" aria-label="Tóm tắt phiếu">${cell('Tổng thu nhập', s.total)}${op('−')}${cell('Bảo hiểm', s.insurance)}${op('−')}${cell('Thuế TNCN', s.tax)}${op('−')}${cell('Tạm ứng', s.advance)}${other}${op('=')}${cell('Thực nhận', s.net, est() ? 'est' : '', ' lead')}</div>`;
    }
    const fm = k => (p.formulas || {})[k];
    const phuCap = l => (/^phụ cấp/i.test(l) ? l : `Phụ cấp ${l}`);
    // Dòng của máy chủ không sửa được: giờ làm bù, khối phụ cấp do C&B thêm, khoản điền thêm đã duyệt
    function extras(fig) {
      const entries = entryLines(fig);
      const h = fig.f.makeupHours;
      return {
        'Làm thêm giờ': h > 0 ? [[makeupLabel(fig.f, vn), `${vn(h, 2)} giờ`, false, fm('makeupHours')]] : [],
        'Phụ cấp': blockLines(fig).map(b => [phuCap(b.label), vn(b.amount), true, fm(`block:${b.code}`)]),
        add: entries.filter(e => !e.deduct).map(e => [e.text, vn(e.amount)]),
        'Khấu trừ': entries.filter(e => e.deduct).map(e => [e.text, `−${vn(e.amount)}`])
      };
    }
    function viewLines() {
      const { fig, eff } = st;
      const { T, m, f, auto } = fig;
      const always = new Set(['insurance', 'tax', 'advance', ...(T.kpi ? ['kpiPct', 'kpiAmt', 'kpiPay'] : [])]);
      const waiting = T.kpi && m.kpiPct == null && !eff.has('kpiPct'); // KPI chưa chấm đủ: máy chủ chưa có tổng điểm
      const more = extras(fig);
      const out = [];
      let hidden = 0;
      const group = (title, rows) => rows.length && out.push(`<div class="pl-lg">${esc(title)}</div>`, ...rows);
      for (const [title, defs] of GROUPS) {
        if (title === 'Lương KPI' && !T.kpi && !defs.some(([k]) => eff.has(k))) continue;
        if (title === 'Khấu trừ')
          group(
            'Khoản cộng thêm',
            more.add.map(([l, t]) => ln(l, t, { money: true }))
          );
        const rows = [];
        for (const [k, raw, kind, unit] of defs) {
          const v = eff.V(k),
            ed = eff.has(k);
          const label = k === 'holidayDays' && f.holidayDates.length ? `${raw} · ${f.holidayDates.join(', ')}` : raw;
          if (k === 'kpiPct' && waiting) {
            rows.push(ln(kpiLabel(k, label, fig.P), 'chưa chấm đủ', { muted: true }));
            continue;
          }
          if (!ed && !always.has(k) && blank(v)) {
            hidden += 1;
            if (!st.zeros) continue;
          }
          const isMoney = kind === 'money' || kind === 'minus';
          rows.push(
            ln(kpiLabel(k, label, fig.P), lineText(kind, unit, v), {
              money: isMoney,
              ed,
              dv: !ed && st.derived.has(k),
              fm: fm(k)
            })
          );
        }
        for (const [l, t, money = true, fm] of more[title] || []) rows.push(ln(l, t, { money, fm }));
        // Tổng phụ cấp của máy chủ (cộng chênh lệch ô Admin sửa: effective); chỉ khi nhóm có dòng hiện và máy chủ có số
        if (title === 'Phụ cấp' && rows.length && hasNum(eff.allowance))
          rows.push(
            ln('Tổng phụ cấp', vn(eff.allowance), {
              money: true,
              cls: 'pl-sub',
              ed: eff.allowanceEdited,
              fm: fm('allowanceTotal')
            })
          );
        group(title, rows);
      }
      return { html: out.join(''), hidden };
    }
    // Các dòng tổng là số chi trả của máy chủ
    function viewTotals() {
      const rows = [
        ['Tổng thu nhập', 'gross', st.eff.total],
        ['Thu nhập chịu thuế', 'taxable', st.eff.taxable],
        ['Thu nhập sau bảo hiểm', 'afterInsurance', st.eff.afterIns],
        ['Thực nhận', 'net', st.eff.net]
      ];
      return rows
        .map(([label, key, cur], i) => {
          const net = i === rows.length - 1;
          return `<div class="pl-tot${net ? ' net' : ''}"><span>${label}${fmOf(fm(key))}</span>${val(money(cur), net ? (est() ? 'est' : '') : est() ? 'pl-g' : '')}</div>`;
        })
        .join('');
    }
    function groupRows() {
      const { fig, eff } = st;
      const out = [];
      for (const [title, defs] of GROUPS) {
        if (title === 'Lương KPI' && !fig.T.kpi && !defs.some(([k]) => eff.has(k))) continue;
        out.push(`<tr class="grp"><th colspan="3" scope="colgroup">${esc(title)}</th></tr>`);
        for (const [k, raw, , unit] of defs) {
          const label = kpiLabel(k, unit ? `${raw} (${unit})` : raw, fig.P);
          const a = fig.auto[k],
            edited = eff.has(k);
          const changedByOther = st.stale && st.stale.keys.includes(k);
          out.push(
            `<tr class="${edited ? 'ed' : ''}${!edited && st.derived.has(k) ? ' dv' : ''}"><td>${esc(label)}${!edited && st.derived.has(k) ? '<span class="cap why">Đã tính lại theo số bạn sửa</span>' : ''}</td><td class="v ${hasNum(a) && a === 0 ? 'zero' : ''}">${esc(show(k, a))}</td><td class="v"><label class="sr" for="pl-in-${esc(k)}">${esc(label)}</label><input id="pl-in-${esc(k)}" class="input sm" data-pl-k="${esc(k)}" inputmode="decimal" autocomplete="off" value="${esc(st.draft[k] ?? '')}" placeholder="${esc(show(k, a))}">${changedByOther ? '<span class="cap why">Người khác đã đổi ô này</span>' : ''}</td></tr>`
          );
        }
      }
      const { n } = fig;
      // cột "Số trên phiếu" của các dòng tổng là số chi trả đã lưu của máy chủ; số tự tính lấy từ bản chụp
      const res = [
        ...(hasNum(fig.allowanceTotal) ? [['Tổng phụ cấp', fig.allowanceTotal, eff.allowance, 'sum']] : []),
        ['Tổng thu nhập', n.gross, eff.total, 'sum'],
        ['Thu nhập chịu thuế', n.taxable, eff.taxable, 'sum'],
        [
          'Thu nhập sau bảo hiểm',
          hasNum(n.gross) && hasNum(n.insurance) ? n.gross - n.insurance : null,
          eff.afterIns,
          'sum'
        ],
        ['Thực nhận', n.net, eff.net, 'net']
      ];
      for (const [label, a, cur, cls] of res)
        out.push(
          `<tr class="${cls}"><td>${esc(label)}</td><td class="v">${esc(money(a))}</td><td class="v cur">${esc(money(cur))}</td></tr>`
        );
      return out.join('');
    }

    /* Vẽ lại (đổi phiên bản, đổi chế độ) không được làm mất số và lý do đang gõ */
    const keepTyped = () => {
      if (st.mode !== 'edit') return;
      for (const inp of box.querySelectorAll('input[data-pl-k]')) st.draft[inp.dataset.plK] = inp.value;
      const why = box.querySelector('#pl-reason');
      if (why) st.reason = why.value;
    };
    function draw() {
      keepTyped();
      if (!st.fig) {
        box.innerHTML = condensed();
        syncFooter();
        return;
      }
      const edit = st.mode === 'edit';
      const top = [warnNotes()];
      if (ctx.locked && kindOf(ctx.res) !== 'final') top.push(lockBanner());
      if (st.ovState === 'fail')
        top.push(
          `<div class="warn" role="alert">${ic('alert', 16)}<span>Không tải được số đã sửa của phiếu: ${esc(st.ovError)}. Các số dưới đây là số tự tính.</span></div>`
        );
      if (!st.paidOk)
        top.push(
          `<div class="warn" role="alert">${ic('alert', 16)}<span>Chưa tải lại được số tổng sau khi lưu, nên các dòng tổng hiện —.</span></div>`
        );
      const { eff, fig } = st;
      top.push(
        sum5({
          total: eff.total,
          insurance: eff.insurance,
          tax: eff.tax,
          advance: eff.advance,
          other: fig.n.entriesDeduct,
          net: eff.net
        })
      );
      const notes = [frozenNote(), clearPanel(), staleNote()];
      if (edit)
        notes.push(
          A.note(
            'Sửa ô <b>số lượng</b> (ngày công, giờ OT, điểm KPI…) thì sau khi Lưu máy chủ tính lại các ô tiền phụ thuộc, bảo hiểm, thuế TNCN và thực nhận. Sửa thẳng <b>ô tiền</b> thì giữ đúng số bạn nhập. Các dòng tổng bên dưới là <b>số đã lưu</b>, chưa phản ánh số bạn đang gõ.',
            'info'
          )
        );
      else if (st.derived.size)
        notes.push(
          A.note(
            `Máy chủ đã tính lại ${st.derived.size} ô theo số bạn vừa sửa (đánh dấu "đã tính lại"), cùng bảo hiểm, thuế TNCN và thực nhận.`,
            'info'
          )
        );
      let lines;
      if (edit)
        lines = `<div class="pl-lh"><b>Sửa số trên phiếu</b><span class="cap">ô để trống giữ số tự tính</span></div>${notes.join('')}<div class="tblwrap pl-edit"><table class="pl-tbl"><thead><tr><th>Dòng</th><th>Số tự tính</th><th>Số trên phiếu</th></tr></thead><tbody>${groupRows()}</tbody></table></div><div class="col pl-editf">${A.reasonField('pl-reason', 'Lý do sửa số (bắt buộc)', '')}<div class="row" style="gap:8px;justify-content:flex-end"><button type="button" class="btn" data-pl="cancel">Huỷ</button><button type="button" class="btn pri" data-pl="save">Lưu số đã sửa</button></div></div>`;
      else {
        const L = viewLines();
        const editBtn = canEdit()
          ? `<button type="button" class="btn sm" data-pl="edit">${ic('edit', 14)}Sửa số trên phiếu</button>`
          : '';
        const zeros = L.hidden
          ? `<button type="button" class="pl-more${st.zeros ? ' open' : ''}" data-pl="zeros" aria-expanded="${st.zeros}">${ic('chev', 16)}<span>${st.zeros ? 'Ẩn' : 'Hiện'} ${L.hidden} dòng bằng 0 hoặc để trống</span></button>`
          : '';
        lines = `<div class="pl-lh"><b>Chi tiết</b><span class="cap">chỉ hiện dòng có số</span>${editBtn}</div>${notes.join('')}<div class="pl-list">${L.html}${viewTotals()}</div>${zeros}`;
      }
      box.innerHTML = `<div class="col pl-box">${top.join('')}<div class="pl-lines">${lines}</div></div>`;
      const why = box.querySelector('#pl-reason');
      if (why && st.reason) why.value = st.reason;
      syncFooter();
    }
    // Máy chủ chưa trả chi tiết ước tính từng người: chỉ các số gộp của bảng lương
    function condensed() {
      const r = ctx.row;
      if (!r) return A.note('Phiếu này chưa có đủ số liệu để dựng các dòng chi tiết.', 'alert');
      const rows = [
        ['Tiền ngày công', r.tienNgayCong],
        ['Phụ cấp', r.phuCap],
        ['OT', r.ot],
        ['Lương KPI', r.kpi],
        ['Khác (ca, đêm, bù, lễ)', r.khac]
      ];
      const minus = blank(r.truTreSom) ? [] : [ln('Trừ đi muộn, về sớm', `−${vn(r.truTreSom)}`, { money: true })];
      return `<div class="col pl-box">${sum5({ total: r.gross, insurance: r.insurance, tax: r.tax, advance: r.advance, net: r.net })}<div class="pl-lines"><div class="pl-lh"><b>Chi tiết</b><span class="cap">số gộp của bảng lương</span></div><div class="pl-list"><div class="pl-lg">Thu nhập</div>${rows.map(([l, v]) => ln(l, vn(v), { money: true })).join('')}${minus.length ? `<div class="pl-lg">Khấu trừ</div>${minus.join('')}` : ''}<div class="pl-tot net"><span>Thực nhận</span>${val(money(r.net), 'est')}</div></div></div></div>`;
    }

    /* ----- ghi ----- */
    function collect() {
      const values = {};
      let bad = null;
      let msg = '';
      for (const inp of box.querySelectorAll('input[data-pl-k]')) {
        const k = inp.dataset.plK,
          s = inp.value.trim();
        st.draft[k] = inp.value;
        inp.classList.remove('bad');
        if (s === '') continue;
        const money = MONEY.has(k);
        /* Tiền là số nguyên đồng: "1.500.000,50" không được lặng lẽ thành 150000050. Dấu . hoặc , theo sau 1–2 chữ số ở cuối là phần lẻ. */
        if (money && /[.,]\d{1,2}$/.test(s)) {
          inp.classList.add('bad');
          bad = bad || inp;
          msg = msg || 'Số tiền phải là số nguyên đồng, không có phần lẻ (ví dụ 1.500.000).';
          continue;
        }
        const v = money ? (s.includes('-') ? NaN : Number(s.replace(/[^\d]/g, ''))) : Number(s.replace(',', '.'));
        if (!/\d/.test(s) || !Number.isFinite(v)) {
          inp.classList.add('bad');
          bad = bad || inp;
          continue;
        }
        if (st.fig.auto[k] != null && Math.abs(v - st.fig.auto[k]) < (money ? 0.5 : 0.005)) continue; // trùng số tự tính: không cần lưu
        values[k] = v;
      }
      return { values, bad, msg };
    }
    // Cảnh báo của máy chủ (PERIOD_FROZEN, SELF_DECISION_FORBIDDEN...) do hộp tự hiện ở đầu (st.warns), không hiện thêm thông báo góc
    const put = (values, reason) =>
      A.api(
        'PUT',
        '/slip-override',
        {
          user: p.username,
          month: ctx.month,
          values,
          reason,
          expectedRev: st.ov.rev
        },
        { warnings: 'manual' }
      );
    const failText = e => A.errText(e); // câu của máy chủ, nguyên văn
    async function afterWriteError(e) {
      const code = e && e.data && e.data.code;
      if (code === 'PERIOD_LOCKED') {
        // Kỳ đã khoá giữa chừng: chuyển sang chỉ xem, nêu lý do
        ctx.locked = true;
        ctx.status = (e.data && e.data.status) || ctx.status;
        st.mode = 'view';
        st.clearing = false;
        st.draft = {};
        dlg.error('');
        try {
          const fresh = await A.api('GET', `/periods/${ctx.month}/payslips/${encodeURIComponent(p.username)}`);
          st.ov = { values: {}, rev: 0, ...(fresh.payslip.override || {}) };
          ctx.res = fresh;
          p = fresh.payslip;
          st.fig = null;
        } catch {
          /* giữ số đang có */
        }
        rebuild();
        draw();
        if (A.Ky && A.Ky.load) A.Ky.load(true).then(() => A.render());
        return;
      }
      if (code === 'SLIP_STALE') {
        // Tải lại phiên bản mới, GIỮ các số đang gõ
        const before = valuesOf(st.ov);
        try {
          const fresh = await A.api('GET', `/slip-override${A.qs({ month: ctx.month, user: p.username })}`);
          const now = valuesOf(fresh);
          const keys = [...new Set([...Object.keys(before), ...Object.keys(now)])].filter(k => before[k] !== now[k]);
          st.stale = { who: fresh.updatedBy, at: stamp(fresh), reason: fresh.reason, keys };
          st.ov = fresh;
          rebuild();
          draw();
          dlg.error('');
        } catch (e2) {
          dlg.error(failText(e2));
        }
        return;
      }
      dlg.error(failText(e));
    }
    const done = async (res, text) => {
      const { warnings, ...out } = res || {};
      st.ov = out;
      st.warns = (Array.isArray(warnings) ? warnings : []).filter(w => w && w.message);
      const danger = st.warns.filter(w => w.severity === 'danger');
      if (danger.length) A.showWarnings(danger); // mục đỏ còn ở băng cố định của trang
      st.mode = 'view';
      st.clearing = false;
      st.stale = null;
      st.draft = {};
      st.reason = '';
      // Số trước khi lưu, để đánh dấu ô nào máy chủ đã tính lại (ô số lượng sửa thì các ô tiền phụ thuộc đổi theo): chỉ so sánh số máy chủ trả
      const before = st.eff
        ? Object.fromEntries(GROUPS.flatMap(([, defs]) => defs.map(([k]) => [k, st.eff.V(k)])))
        : null;
      await refreshPaid();
      rebuild();
      st.derived = new Set();
      if (before && st.eff)
        for (const k of Object.keys(before))
          if (!st.eff.has(k) && hasNum(before[k]) && hasNum(st.eff.V(k)) && Math.abs(before[k] - st.eff.V(k)) >= 0.005)
            st.derived.add(k);
      draw();
      A.toast(text);
      if (ctx.onSaved) ctx.onSaved(out);
    };
    /* Lý do không bắt buộc (có thể rỗng), chỉ không quá REASON_MAX. Trả null khi phải dừng. */
    const reasonOk = id => {
      const reason = A.readReason(id);
      if (reason.length > REASON_MAX) {
        dlg.error(`Lý do tối đa ${REASON_MAX} ký tự.`);
        return null;
      }
      return reason;
    };
    const busy = on => box.querySelectorAll('button[data-pl]').forEach(b => (b.disabled = on));
    const actions = {
      zeros() {
        st.zeros = !st.zeros;
        draw();
        const b = box.querySelector('[data-pl="zeros"]');
        if (b) b.focus();
      },
      edit() {
        st.mode = 'edit';
        st.draft = Object.fromEntries(Object.entries(valuesOf(st.ov)).map(([k, v]) => [k, rawOf(k, v)]));
        st.stale = null;
        st.warns = [];
        dlg.error('');
        draw();
        const first = box.querySelector('input[data-pl-k]');
        if (first) first.focus();
      },
      cancel() {
        st.mode = 'view';
        st.draft = {};
        st.reason = '';
        st.stale = null;
        dlg.error('');
        draw();
      },
      async save() {
        dlg.error('');
        const { values, bad, msg } = collect();
        if (bad) {
          bad.focus();
          return dlg.error(msg || 'Ô viền đỏ không phải số hợp lệ.');
        }
        if (JSON.stringify(values) === JSON.stringify(valuesOf(st.ov)))
          return dlg.error('Chưa có số nào thay đổi so với lần lưu trước.');
        const reason = reasonOk('pl-reason');
        if (reason === null) return;
        busy(true);
        try {
          await done(await put(values, reason), 'Đã lưu số sửa trên phiếu');
        } catch (e) {
          await afterWriteError(e);
        } finally {
          busy(false);
        }
      },
      clear() {
        st.clearing = true;
        st.warns = [];
        draw();
        const f = box.querySelector('#pl-clear-reason');
        if (f) f.focus();
      },
      'clear-no'() {
        st.clearing = false;
        dlg.error('');
        draw();
      },
      async 'clear-ok'() {
        dlg.error('');
        const reason = reasonOk('pl-clear-reason');
        if (reason === null) return;
        busy(true);
        try {
          await done(await put({}, reason), 'Đã bỏ hết số đã sửa');
        } catch (e) {
          await afterWriteError(e);
        } finally {
          busy(false);
        }
      }
    };
    box.addEventListener('click', ev => {
      const b = ev.target.closest('[data-pl]');
      if (!b || b.disabled || !actions[b.dataset.pl]) return;
      actions[b.dataset.pl](b);
    });
    draw();
  }

  /* Cho phieu-a4.js (bản in A4, hộp xem trước, in cả loạt): các hàm định dạng, dòng của bản chụp và hộp phiếu đang mở */
  const kit = {
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
    hashOf,
    active: () => active
  };
  A.Phieu = { mount, figures, effective, modelOf, pageOf, TAGS, GROUPS, kit };
})(window.Admin);
