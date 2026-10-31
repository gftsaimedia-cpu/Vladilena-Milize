/* Màn Chấm công & phép › Bảng công: khai lịch thay ngay trong hộp một ngày.
   Đọc: lịch đã khai và trạng thái duyệt của mọi người trong tháng từ GET /api/team (view-cham-cong.js nạp rồi đưa vào A.CcKhai.index),
   lịch mới nhất của một người GET /api/sheet?month=&user= (days, approvals, owner, scheduledDates, leaveBalance), yêu cầu đang chờ của
   ngày đó GET /api/approvals?status=pending&month=&user= (dòng có rev, fingerprint để A.Duyet xử lý).
   Ghi: PUT /api/sheet { month, user, days } như trang khai thay (public/nhan-vien/data.js → NV.putSheet): đọc lịch mới nhất ngay trước khi
   ghi, thay đúng một ngày, không gửi kpiPct / kpiAmt (máy chủ giữ KPI tự đánh giá của người được khai). Phản hồi có onBehalf, autoApproved.
   Trường của một ngày, loại ngày chọn được và câu gợi ý giống màn nhân viên (public/nhan-vien/logic.js → dayPlan, formFromDay, dayFromForm,
   checkDayForm, approvalOfForm), không đặt quy tắc mới. Chọn được mọi loại ngày, máy chủ tự cảnh báo. Mọi kiểm tra nghiệp vụ do máy chủ làm; câu báo lỗi của máy chủ hiện nguyên văn.
   Không có phép tính tiền ở đây. Mọi chuỗi từ dữ liệu qua esc(). */
(function (A) {
  'use strict';
  const { esc, S } = A;
  const AV = window.ApprovalView;
  const DEF = (window.PayrollParams && window.PayrollParams.DEFAULTS) || {};
  const DECIDE = 'request.decide.';
  const DAY_FIELDS = ['kind', 'in', 'out', 'extraKind', 'extraIn', 'extraOut']; // trường quyết định một ngày có đổi không (như máy chủ)
  // Loại ngày cũ 'makeup' không còn chọn được, bộ máy tính 0; chỉ còn nhãn để hiện ngày đã lưu
  const LEGACY_MAKEUP = 'makeup';
  const LEGACY_MAKEUP_HINT = 'Loại cũ, không còn dùng và không tính lương. Hãy chọn loại khác.';
  const KIND_LABEL = {
    work: 'Đi làm',
    makeup: 'Làm bù cả ngày (loại cũ, không tính)',
    leave: 'Nghỉ phép năm',
    unpaid: 'Nghỉ không lương',
    willmakeup: 'Nghỉ, sẽ làm bù',
    approved: 'Nghỉ được duyệt',
    isat: 'iSAT',
    noshow: 'Vắng không phép'
  };
  // Kỳ lương: từ "chốt công" trở đi (bản sao của logic.js → periodLock) vẫn lưu được, kèm cảnh báo
  const PERIOD_ORDER = ['open', 'attendance_locked', 'calculated', 'reviewed', 'approved', 'paid'];
  const PERIOD_WHY = {
    attendance_locked: 'Admin đã chốt công tháng này.',
    calculated: 'Lương tháng này đã được tính.',
    reviewed: 'Bảng lương tháng này đã được AI kiểm tra.',
    approved: 'Bảng lương tháng này đã được phê duyệt.',
    paid: 'Tháng này đã trả lương.'
  };
  const box = (kind, html) =>
    `<div class="note${kind ? ' ' + kind : ''}">${A.ic(kind === 'err' || kind === 'warn' ? 'alert' : 'info', 16)}<span>${html}</span></div>`;
  const clone = v => JSON.parse(JSON.stringify(v || {}));
  const timeOf = v => (typeof v === 'string' && /^\d{2}:\d{2}$/.test(v) ? v : '');
  const canDecide = item => {
    const caps = (A.meInfo && A.meInfo.caps) || [];
    return caps.includes(DECIDE + '*') || caps.includes(DECIDE + item);
  };
  const isSelf = username => !!(S.me && S.me.username === username);
  // Tên khoản cần duyệt: OT khai trên ngày lễ (found.holiday / dòng duyệt mang holiday) là OT ngày lễ
  const itemText = x => (x.holiday ? 'OT ngày lễ' : A.itemLabel(x.item));

  /* ---------- lịch đã khai của mọi người trong tháng (GET /api/team) ---------- */
  const T = { month: '', days: new Map(), approvals: new Map() };
  function index(team) {
    T.month = (team && team.month) || '';
    T.days = new Map();
    T.approvals = new Map();
    for (const row of (team && team.rows) || []) {
      const u = row && (row.username || (row.staff && row.staff.username));
      if (!u) continue;
      if (row.days && typeof row.days === 'object') T.days.set(u, row.days);
      if (row.approvals && typeof row.approvals === 'object') T.approvals.set(u, row.approvals);
    }
  }
  // Sau khi lưu: thay lịch và trạng thái duyệt của một người để ô vẽ lại ngay (GET /api/team nạp lại ngay sau đó)
  function patch(username, month, days, approvals) {
    if (month !== T.month) return;
    T.days.set(username, days);
    if (approvals && typeof approvals === 'object') T.approvals.set(username, approvals);
  }
  const ready = () => T.month === S.month;
  const dayIn = (map, username, date) => {
    const m = date.slice(0, 7) === T.month ? map.get(username) : null;
    return (m && m[date]) || null;
  };
  const kindOf = day => (day ? day.kind || (day.in && day.out ? 'work' : '') : '');
  // Loại làm thêm của ngày đi làm khi có đoạn làm thêm thật (trùng giờ ca coi như không có, như máy chủ)
  const extraOf = day =>
    day &&
    kindOf(day) === 'work' &&
    ((day.extraIn && day.extraIn !== day.in) || (day.extraOut && day.extraOut !== day.out))
      ? day.extraKind || (day.extraOut ? 'makeup' : '')
      : '';

  /* ---------- ký hiệu ô của ngày đã khai mà chưa có lượt Check-in ---------- */
  // [lớp, chữ]: kw vòng nhỏ (đi làm), kg vàng (phép năm, iSAT), ks xanh nhạt (nghỉ được duyệt, sẽ bù), kn xám (không lương, loại cũ), x chữ (OT, bù)
  const KMARK = {
    work: ['kw', ''],
    makeup: ['kn', 'cũ'],
    leave: ['kg', 'P'],
    isat: ['kg', 'iS'],
    approved: ['ks', 'ND'],
    willmakeup: ['ks', 'SB'],
    unpaid: ['kn', 'K']
  };
  const markHtml = (cls, txt, st) =>
    `<span class="cc-m ${cls}${st === 'pending' ? ' pd' : st === 'rejected' ? ' rj' : ''}">${esc(txt)}</span>`;
  // Lịch làm bù dự kiến của một ngày "Nghỉ, sẽ làm bù": [{ date, from, to }] (dữ liệu cũ chỉ có makeupDate thì chưa có giờ)
  const plansOf = day =>
    Array.isArray(day.makeupPlans)
      ? day.makeupPlans
      : day.makeupDate
        ? [{ date: day.makeupDate, from: '', to: '' }]
        : [];
  const planText = p => `${A.fmtDM(p.date)}${p.from && p.to ? ` ${p.from}–${p.to}` : ''}`;
  // Các ngày nghỉ của người này đã hẹn bù vào `date`: [{ leaveDate, plan }]
  function plannedOn(username, date) {
    const days = T.days.get(username) || {};
    return Object.entries(days).flatMap(([leaveDate, day]) =>
      day && day.kind === 'willmakeup' && leaveDate !== date
        ? plansOf(day)
            .filter(plan => plan.date === date)
            .map(plan => ({ leaveDate, plan }))
        : []
    );
  }
  // Trả { code, key, st, text, html } hoặc null (chưa khai, hoặc chưa có lịch của tháng này)
  function mark(username, date) {
    const day = dayIn(T.days, username, date);
    if (!day) {
      // Ngày chưa khai gì nhưng là ngày đã hẹn làm bù cho một ngày nghỉ: hiện ký hiệu "bù" để Admin thấy nghỉ ngày nào, bù ngày này
      const planned = plannedOn(username, date);
      if (!planned.length) return null;
      const status =
        planned.map(p => dayIn(T.approvals, username, p.leaveDate)?.status).find(s => s && s !== 'approved') || '';
      const tail = status === 'pending' ? ', chờ xử lý' : status === 'rejected' ? ', bị từ chối' : '';
      return {
        code: 'K',
        key: 'planned',
        st: status,
        text: `Dự kiến làm bù ${planned.map(p => `${p.plan.from && p.plan.to ? `${p.plan.from}–${p.plan.to} ` : ''}cho ngày nghỉ ${A.fmtDM(p.leaveDate)}`).join('; ')}${tail}`,
        html: markHtml('x', 'bù', status)
      };
    }
    const kind = kindOf(day);
    const ex = extraOf(day);
    const a = dayIn(T.approvals, username, date);
    const st = a && (a.status === 'pending' || a.status === 'rejected') ? a.status : '';
    const odd = !ex && !KMARK[kind]; // loại ngày lạ trong dữ liệu cũ: không đưa mã lên màn, mở hộp ngày để xem và sửa
    const [cls, txt] = ex === 'ot' ? ['x', 'OT'] : ex ? ['x', 'bù'] : KMARK[kind] || ['kn', '?'];
    const label = ex
      ? `Đi làm, có ${ex === 'ot' ? 'OT' : 'làm bù theo giờ'}`
      : KIND_LABEL[kind] || 'loại ngày không rõ';
    const tail = st === 'pending' ? ', chờ xử lý' : st === 'rejected' ? ', bị từ chối' : '';
    // Nghỉ sẽ làm bù: ghi rõ nghỉ ngày này và sẽ bù vào những ngày nào, giờ nào
    const plans = kind === 'willmakeup' ? plansOf(day) : [];
    const planned =
      kind === 'willmakeup'
        ? ` — nghỉ ${A.fmtDM(date)}, bù: ${plans.length ? plans.map(planText).join('; ') : 'chưa khai ngày bù'}`
        : '';
    return {
      code: 'K',
      key: ex === 'ot' ? 'O' : ex ? 'B' : odd ? '?' : kind,
      st,
      text: `Đã khai: ${label}${tail}${planned}`,
      html: markHtml(cls, txt, st)
    };
  }
  // Mục chú giải cho các ký hiệu đã gặp ở trang đang xem (seen.k: tập loại, seen.kpd, seen.krj); OT, bù dùng mục "Có OT khai", "Có làm bù khai"
  function legend(seen) {
    const out = [];
    const k = seen.k || new Set();
    if (k.has('work')) out.push(['<span class="cc-m kw"></span>', 'Đã khai đi làm, chưa có Check-in']);
    for (const kind of ['leave', 'unpaid', 'willmakeup', 'approved', 'isat', LEGACY_MAKEUP])
      if (k.has(kind)) out.push([markHtml(...KMARK[kind]), KIND_LABEL[kind]]);
    if (k.has('planned'))
      out.push([markHtml('x', 'bù'), 'Ngày dự kiến làm bù cho một ngày nghỉ (rê chuột để xem ngày nghỉ)']);
    if (k.has('?')) out.push([markHtml('kn', '?'), 'Loại ngày không rõ: mở ô để xem và sửa']);
    if (seen.kpd) out.push([markHtml('kg', 'P', 'pending'), 'Viền nét đứt: khoản khai chờ xử lý']);
    if (seen.krj) out.push([markHtml('kg', 'P', 'rejected'), 'Gạch ngang: khoản khai bị từ chối']);
    return out;
  }

  /* ---------- loại ngày chọn được (giống logic.js → dayPlan) ---------- */
  // Cờ quyền lợi của chức vụ do máy chủ gửi (GET /api/positions); thiếu cờ thì suy từ PayrollParams.DEFAULTS như màn nhân viên
  const benefitsOf = (type, month) => {
    const f = (name, fallback) => A.positions.flag(type, name, fallback, month);
    return {
      ot: f('ot', !!DEF[`type.${type}.benefit.ot`]),
      makeup: f('makeup', !!DEF[`type.${type}.benefit.makeup`]),
      paidLeave: f('paidLeave', !!DEF[`type.${type}.benefit.paidLeave`]),
      isat: f('isat', !!DEF[`type.${type}.benefit.isat`]),
      approved: f('approvedLeave', Number(DEF[`type.${type}.attendance`]) > 0)
    };
  };
  // Ngày làm theo lịch máy chủ gửi (scheduledDates của GET /api/sheet, một nguồn); thiếu thì không đoán, coi là ngày làm như Bảng công
  const isScheduled = (sheet, date) =>
    sheet && Array.isArray(sheet.scheduledDates) ? sheet.scheduledDates.includes(date) : true;
  // Khai thay: người khai là Admin nên "cần Admin đồng ý" thành "cần duyệt", lời gợi ý nói về người được khai (như logic.js → dayPlan, forName)
  const forAdmin = text =>
    text
      .replace(/Cần Admin đồng ý/g, 'Cần duyệt')
      .replace(/cần Admin đồng ý/g, 'cần duyệt')
      .replace(/Chưa được đồng ý/g, 'Chưa được duyệt');
  // Làm ngày lễ là OT: khai giờ OT từ – đến trong ngày lễ; chức vụ không có quyền lợi OT không có mục này trong danh sách thường
  const HOLIDAY_OT_HINT =
    'Khai giờ OT từ – đến trong ngày lễ, cần Admin đồng ý. Chỉ giờ có Check-in/out (hay lượt Admin khai thay) trong khung đã khai được tính, theo hệ số ngày lễ. Không có Check-in/out hôm đó sẽ tính vắng, mất lương ngày lễ.';
  // Câu gợi ý của loại đã lưu từ trước nay không còn trong danh sách (vẫn hiện để xem; gửi lại không đổi thì máy chủ giữ nguyên)
  const existingHint = kind => (kind === LEGACY_MAKEUP ? LEGACY_MAKEUP_HINT : 'Đã khai từ trước.');
  // ctx: { type, name, date, month, sheet, holidays (Set), existingKind }. Danh sách thường: lọc theo lịch và quyền lợi như màn nhân viên
  function planUsual({ type, name, date, sheet, holidays, existingKind, month }) {
    const dow = A.dowOf(date);
    if (dow === 0) return { editable: false, why: 'Chủ nhật không có lịch làm việc nên không khai được.' };
    const benefits = benefitsOf(type, month);
    const inSched = isScheduled(sheet, date);
    const hol = inSched && holidays.has(date);
    const kinds = [];
    const add = (value, label, hint) => kinds.push({ value, label, hint: forAdmin(hint) });
    if (hol) {
      add('holiday', 'Nghỉ lễ', 'Ngày lễ do Admin đặt, không cần khai. Chọn mục này để bỏ khai báo đã có.');
      if (benefits.ot) add('work', 'OT', HOLIDAY_OT_HINT);
    } else if (!inSched) {
      add('unpaid', 'Nghỉ không lương', 'Không tính lương ngày này.');
    } else {
      add(
        'work',
        'Đi làm',
        'Ngày không khai vẫn tính đi làm theo Check-in/out. Chọn mục này khi cần khai OT hoặc làm bù theo giờ.'
      );
      if (benefits.paidLeave) {
        add('leave', 'Nghỉ phép năm', 'Trừ vào phép còn lại, cần Admin đồng ý.');
        add(
          'unpaid',
          'Nghỉ không lương',
          'Không tính lương ngày này. Còn phép năm thì ngày thường phải dùng phép năm trước.'
        );
      }
      add('willmakeup', 'Nghỉ, sẽ làm bù', 'Tính như nghỉ không lương; bù lại bằng giờ làm bù trong tháng.');
      if (benefits.approved)
        add(
          'approved',
          'Nghỉ được duyệt',
          'Không lương, tính như nghỉ không lương khi xét chuyên cần. Cần Admin đồng ý.'
        );
      if (benefits.isat && dow === 6) add('isat', 'iSAT, nghỉ thứ Bảy có lương', 'Phúc lợi iSAT. Cần Admin đồng ý.');
    }
    if (existingKind && !kinds.some(x => x.value === existingKind))
      add(existingKind, KIND_LABEL[existingKind] || existingKind, existingHint(existingKind));
    return { editable: true, dow, hol, inSched, kinds, benefits };
  }
  /* Mọi loại ngày ở mọi ngày kể cả Chủ nhật, câu gợi ý như logic.js → dayPlan: "Ngày ngoài lịch, chờ Admin xem lại.",
     "Chức vụ chưa có quyền lợi này."; máy chủ cảnh báo khi lưu. normal: false = loại không có trong danh sách thường (ô viền nét đứt) */
  function planOf(ctx) {
    const usual = planUsual(ctx);
    const normal = new Set(usual.editable ? usual.kinds.map(k => k.value) : []);
    const benefits = benefitsOf(ctx.type, ctx.month);
    const inSched = isScheduled(ctx.sheet, ctx.date);
    const hol = inSched && ctx.holidays.has(ctx.date);
    const OFF = !inSched ? 'Ngày ngoài lịch, chờ Admin xem lại.' : '';
    const no = flag => (flag ? '' : 'Chức vụ chưa có quyền lợi này.');
    const hint = (...bits) => bits.filter(Boolean).join(' ');
    const kinds = [];
    const add = (value, label, text) => kinds.push({ value, label, hint: forAdmin(text), normal: normal.has(value) });
    if (hol) {
      add('holiday', 'Nghỉ lễ', 'Ngày lễ do Admin đặt, không cần khai. Chọn mục này để bỏ khai báo đã có.');
      add('work', 'OT', hint(HOLIDAY_OT_HINT, no(benefits.ot)));
    } else
      add(
        'work',
        'Đi làm',
        hint(
          inSched
            ? 'Ngày không khai vẫn tính đi làm theo Check-in/out. Chọn mục này khi cần khai OT hoặc làm bù theo giờ.'
            : `Tính theo ca của ${ctx.name}. Có thể kèm OT hoặc làm bù theo giờ.`,
          OFF
        )
      );
    // Ngày lễ trong lịch vẫn được trả lương ngày lễ, không trừ phép, không nợ giờ: không đưa các loại nghỉ (câu gợi ý của chúng nói trừ phép / không lương)
    if (!hol) {
      add('leave', 'Nghỉ phép năm', hint('Trừ vào phép còn lại, cần Admin đồng ý.', OFF, no(benefits.paidLeave)));
      add('unpaid', 'Nghỉ không lương', 'Không tính lương ngày này.');
      add('willmakeup', 'Nghỉ, sẽ làm bù', hint('Tính như nghỉ không lương; bù lại bằng giờ làm bù trong tháng.', OFF));
      add(
        'approved',
        'Nghỉ được duyệt',
        hint('Không lương, không tính vào chuyên cần. Cần Admin đồng ý.', OFF, no(benefits.approved))
      );
    }
    // iSAT chỉ hiện ở thứ Bảy và với chức vụ có quyền lợi iSAT
    if (benefits.isat && A.dowOf(ctx.date) === 6)
      add('isat', 'iSAT, nghỉ thứ Bảy có lương', hint('Phúc lợi iSAT. Cần Admin đồng ý.', OFF));
    if (ctx.existingKind && !kinds.some(x => x.value === ctx.existingKind))
      add(ctx.existingKind, KIND_LABEL[ctx.existingKind] || ctx.existingKind, existingHint(ctx.existingKind));
    return { editable: true, usual, dow: A.dowOf(ctx.date), hol, inSched, kinds, benefits };
  }

  /* ---------- biểu mẫu một ngày (giống logic.js → formFromDay, dayFromForm, checkDayForm) ---------- */
  // Ca: bảng ca đang dùng (A.SHIFTS, nạp từ GET /api/settings/shifts)
  const shiftInfo = code => {
    const s = A.shiftOf(code);
    return s ? { code: s[0], name: s[1], in: s[2], out: s[3], label: `${s[1]} · ${s[2]}–${s[3]}` } : null;
  };
  // Ca mặc định khi điền giờ: ca Admin gán, chưa gán thì ca đầu của bảng ca (như màn nhân viên: Normal 1)
  const defaultShift = owner => shiftInfo(owner && owner.shiftCode) || shiftInfo((A.SHIFTS[0] || [])[0]);
  function formFromDay(owner, date, day, plan) {
    const ex = day && typeof day === 'object' ? day : null;
    const kind = ex ? ex.kind || 'work' : plan.kinds[0].value;
    const shift = defaultShift(owner) || { in: '', out: '' };
    return {
      date,
      kind,
      existed: !!ex,
      preset: ex && ex.preset ? A.shiftCode(ex.preset) : '', // ngày đã lưu có thể mang mã cũ (n1…)
      in: timeOf(ex && ex.in) || shift.in,
      out: timeOf(ex && ex.out) || shift.out,
      extraKind: ex ? ex.extraKind || (ex.extraOut ? 'makeup' : '') : '',
      extraIn: ex ? timeOf(ex.extraIn) : '',
      extraOut: ex ? timeOf(ex.extraOut) : '',
      breakMin: ex && Number.isFinite(ex.breakMin) ? ex.breakMin : 0,
      // "Nghỉ, sẽ làm bù": lịch làm bù dự kiến đã lưu (như logic.js → formFromDay); chưa có thì một dòng trống để nhập
      makeupPlans:
        ex && ex.kind === 'willmakeup'
          ? plansOf(ex).length
            ? plansOf(ex).map(p => ({ date: p.date || '', from: p.from || '', to: p.to || '' }))
            : [blankPlan()]
          : []
    };
  }
  const blankPlan = () => ({ date: '', from: '', to: '' });
  // Biểu mẫu → ngày gửi lên máy chủ; null = bỏ khai báo (Nghỉ lễ là không có bản ghi)
  function dayFromForm(form) {
    const kind = form.kind;
    if (!kind || kind === 'holiday') return null;
    // Lịch làm bù dự kiến gửi nguyên các dòng (máy chủ bỏ dòng trống, ô sai dạng), như logic.js → dayFromForm
    if (kind === 'willmakeup') return { kind, makeupPlans: (form.makeupPlans || []).map(p => ({ ...p })) };
    if (kind !== 'work' && kind !== LEGACY_MAKEUP) return { kind };
    // Ngày loại cũ 'makeup' gửi lại đúng giờ đã lưu (không có ô sửa) để máy chủ coi là không đổi
    const day = { kind, in: form.in, out: form.out, breakMin: Math.round(Number(form.breakMin) || 0) };
    if (form.preset) day.preset = form.preset;
    if (kind === 'work' && form.extraKind) {
      day.extraKind = form.extraKind;
      if (form.extraIn) day.extraIn = form.extraIn;
      if (form.extraOut) day.extraOut = form.extraOut;
    }
    return day;
  }
  // Kiểm cấu trúc (thiếu ô) và luật chặn của máy chủ (giờ làm bù ngày lễ, cùng câu với lib/domain/sheet-checks.js); còn lại máy chủ báo
  function checkDayForm(form) {
    if (!form.kind) return 'Chọn loại ngày.';
    const hol = A.holidaySet();
    const planned = form.kind === 'willmakeup' ? (form.makeupPlans || []).map(p => p.date) : [];
    const makeupOn = [...(form.kind === 'work' && form.extraKind === 'makeup' ? [form.date] : []), ...planned].find(
      d => d && hol.has(d)
    );
    if (makeupOn) return `Ngày ${A.fmtDM(makeupOn)} là ngày lễ: không khai làm bù vào ngày lễ.`;
    if (form.kind !== 'work') return '';
    if (!form.in || !form.out) return 'Nhập đủ giờ vào và giờ ra.';
    if (form.extraKind && !form.extraIn && !form.extraOut)
      return 'Chọn giờ vào làm thêm (trước ca) hoặc giờ ra làm thêm (sau ca).';
    return '';
  }
  // Lịch làm bù dự kiến đổi cũng là đổi khoản cần duyệt (dấu vân tay của willmakeup có các dòng này, xem approval-view.js → itemOf)
  const planKey = day =>
    kindOf(day) === 'willmakeup'
      ? JSON.stringify(
          plansOf(day)
            .map(p => [p.date || '', p.from || '', p.to || ''])
            .filter(r => r.some(Boolean))
        )
      : '';
  const sameDay = (a, b) =>
    DAY_FIELDS.every(k => String((a && a[k]) || '') === String((b && b[k]) || '')) && planKey(a) === planKey(b);
  // Khoản cần duyệt của bản nháp (null nếu không): đúng luật của ApprovalView
  function approvalOfForm(form, type, holidays) {
    const day = dayFromForm(form);
    const found = day && AV ? AV.itemOf(day, { date: form.date, holidays: [...holidays], staffType: type }) : null;
    return found ? { item: found.item, label: itemText(found) } : null;
  }
  // "Đi làm 08:00–17:00 · OT 07:00–08:00 và 17:00–19:00"
  function dayText(day) {
    const kind = kindOf(day);
    if (!kind) return 'Chưa khai';
    if (kind === 'willmakeup') {
      const plans = plansOf(day).filter(p => p.date);
      return `${KIND_LABEL.willmakeup}${plans.length ? ` · bù ${plans.map(planText).join('; ')}` : ''}`;
    }
    if (kind !== 'work') return KIND_LABEL[kind] || kind;
    const base = `Đi làm${day.in && day.out ? ` ${day.in}–${day.out}` : ''}`;
    const ex = extraOf(day);
    if (!ex) return base;
    const seg = [
      day.extraIn && day.extraIn !== day.in ? `${day.extraIn}–${day.in}` : '',
      day.extraOut && day.extraOut !== day.out ? `${day.out}–${day.extraOut}` : ''
    ]
      .filter(Boolean)
      .join(' và ');
    return `${base} · ${ex === 'ot' ? 'OT' : 'làm bù'} ${seg}`;
  }

  /* ---------- phần "Lịch đã khai" trong hộp một ngày ---------- */
  const K = { token: 0, u: '', date: '', month: '', staff: null, sheet: null, owner: null, plan: null, form: null };
  K.busy = false;
  K.req = null; // dòng yêu cầu đang chờ của ngày này (GET /api/approvals), để A.Duyet xử lý
  K.first = false; // phần khai đứng đầu hộp: đặt con trỏ vào loại ngày khi vẽ xong

  // Chỗ của phần khai; nội dung vẽ sau khi tải lịch (mount). Chỉ khi tài khoản có năng lực xử lý yêu cầu (request.decide.*)
  const section = () =>
    A.canActFor()
      ? `<section class="cc-sec" id="cc-khai" aria-labelledby="ck-h"><div class="cc-sec-h"><h3 id="ck-h">Lịch đã khai</h3><span class="cap" id="ck-cur"></span></div><div id="ck-body" aria-busy="true"><div class="skel" style="width:70%"></div><div class="skel" style="width:45%;margin-top:10px"></div></div></section>`
      : '';
  function mount(api, { username, date, staff, first }) {
    if (!document.getElementById('cc-khai')) return;
    K.token += 1;
    Object.assign(K, {
      u: username,
      date,
      month: date.slice(0, 7),
      staff,
      first: !!first,
      sheet: null,
      owner: null,
      plan: null,
      form: null,
      busy: false,
      req: null
    });
    bind(api.root);
    load(K.token);
  }
  async function load(token) {
    const body = document.getElementById('ck-body');
    if (body) body.setAttribute('aria-busy', 'true');
    let data;
    try {
      data = (await A.api('GET', '/sheet' + A.qs({ month: K.month, user: K.u }))) || {};
    } catch (e) {
      if (token !== K.token || !document.getElementById('ck-body')) return;
      document.getElementById('ck-body').innerHTML =
        `${box('err', esc(A.errText(e)))}<div class="cc-sec-f"><button type="button" class="btn sm" data-act="ckretry">Thử lại</button></div>`;
      return;
    }
    // Ngày có yêu cầu đang chờ: lấy đúng dòng của màn Yêu cầu (rev, fingerprint) để Đồng ý / Từ chối; không lấy được thì chỉ hiện yêu cầu
    const pend = data.approvals && data.approvals[K.date] && data.approvals[K.date].status === 'pending';
    let req = null;
    if (pend)
      try {
        const res = await A.api('GET', '/approvals' + A.qs({ status: 'pending', month: K.month, user: K.u }));
        req = ((res && res.items) || []).find(r => r.date === K.date && r.status === 'pending') || null;
      } catch {
        req = null;
      }
    if (token !== K.token || !document.getElementById('ck-body')) return; // hộp đã đóng hoặc đã mở ngày khác
    K.sheet = data;
    K.owner = data.owner || K.staff || { username: K.u, name: K.u };
    K.req = req;
    const day = (data.days || {})[K.date] || null;
    K.plan = planOf({
      type: K.owner.type,
      name: K.owner.name || K.u,
      date: K.date,
      month: K.month,
      sheet: data,
      holidays: A.holidaySet(),
      existingKind: day ? kindOf(day) || 'work' : ''
    });
    K.form = formFromDay(K.owner, K.date, day, K.plan);
    paint(K.first ? `ck-k-${K.form ? K.form.kind : ''}` : '');
  }
  A.actions.ckretry = () => load(++K.token);

  const savedDay = () => (K.sheet && K.sheet.days && K.sheet.days[K.date]) || null;
  const changed = () => !!K.form && !sameDay(dayFromForm(K.form) || {}, savedDay() || {});
  // Lý do kỳ đã chốt công, như màn nhân viên
  function periodLock() {
    const v = A.Ky && A.Ky.data ? A.Ky.data() : null;
    const i = v && v.managed ? PERIOD_ORDER.indexOf(v.status) : -1;
    return i > 0 ? PERIOD_WHY[v.status] : '';
  }

  // Trạng thái duyệt của ngày đã lưu: yêu cầu đang chờ (kèm Đồng ý / Từ chối), bị từ chối, được phê duyệt
  // ro: phần khai chỉ xem (tài khoản khoá, tài khoản không thuộc bảng lương...): bỏ câu nói về việc sửa ngày
  function stateHtml(ro) {
    const a = K.sheet && K.sheet.approvals && K.sheet.approvals[K.date];
    if (!a) return '';
    const label = itemText(a);
    if (a.status === 'pending') {
      const r = K.req;
      const when = r && r.submittedAt ? ` · gửi ${esc(A.fmtStamp(r.submittedAt))}` : '';
      const acts = r
        ? `<div class="ck-req-a"><button type="button" class="btn sm" data-act="ckreq" data-a="reject" id="ck-reject">Từ chối</button><button type="button" class="btn sm pri" data-act="ckreq" data-a="approve" id="ck-approve">Đồng ý</button></div>`
        : '';
      const replace = canDecide(a.item)
        ? 'Nếu sửa loại ngày hoặc giờ rồi lưu, yêu cầu này được thay bằng khai báo của Admin và duyệt luôn. Muốn giữ đúng yêu cầu thì bấm Đồng ý hoặc Từ chối.'
        : 'Nếu sửa loại ngày hoặc giờ rồi lưu, yêu cầu này được thay bằng khai báo của Admin; bạn không có quyền duyệt loại này nên khoản vẫn chờ xử lý.';
      return `<div class="note warn ck-req" id="ck-req">${A.ic('alert', 16)}<div class="col"><b>Yêu cầu ${esc(label)} đang chờ xử lý</b><span>${esc(dayText(savedDay()))}${when}</span>${ro ? '' : `<span>${esc(replace)}</span>`}${r ? '' : '<span>Yêu cầu này xử lý ở màn Yêu cầu.</span>'}${acts}</div></div>`;
    }
    if (a.status === 'rejected')
      return box(
        'err',
        `${esc(label)}: bị từ chối${a.note ? `. Lý do: ${esc(a.note)}` : ''}. Khoản này không tính vào thu nhập.`
      );
    if (a.status === 'approved')
      return box(
        '',
        `${esc(label)}: được phê duyệt${a.decidedBy && a.decidedBy !== 'system' ? ` (${esc(a.decidedBy)})` : ''}.${ro ? '' : canDecide(a.item) ? ' Đổi loại ngày hoặc giờ rồi lưu thì khoản mới được duyệt luôn.' : ' Đổi loại ngày hoặc giờ rồi lưu thì khoản về chờ xử lý.'}`
      );
    return '';
  }
  // Ghi chú dưới các lựa chọn: khoản cần duyệt của bản nháp, loại ngoài quy định thường, "Nghỉ, sẽ làm bù"
  function apprHtml() {
    const f = K.form;
    if (!f || !K.plan) return '';
    const out = [];
    const p = K.plan;
    if (f.kind === LEGACY_MAKEUP)
      out.push(
        box(
          'warn',
          `Ngày ${esc(A.fmtDM(f.date))}: loại Làm bù cả ngày không còn dùng, không tính lương. Hãy khai lại: đi làm (giờ làm bù khai trước hoặc sau ca) hoặc một loại nghỉ.`
        )
      );
    const k = p.kinds.find(x => x.value === f.kind);
    if (!p.usual.editable)
      out.push(
        box(
          'warn',
          `${esc(p.usual.why.replace(/ nên không khai được\.$/, '.'))} Vẫn lưu được; máy chủ sẽ cảnh báo khi lưu.`
        )
      );
    // loại ngày ngoài quy định thường: câu gợi ý dưới các ô chọn đã nói lý do (ngoài lịch, chức vụ chưa có quyền lợi)
    else if (k && k.normal && f.kind === 'work' && f.extraKind && !extraAllowedUsual().includes(f.extraKind))
      out.push(
        box(
          'warn',
          'Làm thêm loại này nằm ngoài quy định thường (chức vụ chưa có quyền lợi). Vẫn lưu được; máy chủ sẽ cảnh báo khi lưu.'
        )
      );
    const a = approvalOfForm(f, K.owner.type, A.holidaySet());
    // "Nghỉ, sẽ làm bù" có một ghi chú riêng ở cuối (gộp cả chuyện duyệt), không lặp câu "cần duyệt" chung
    if (a && changed() && f.kind !== 'willmakeup') {
      if (isSelf(K.u)) out.push(box('warn', `${esc(a.label)} cần duyệt: khoản của chính bạn chờ xử lý ở màn Yêu cầu.`));
      else if (canDecide(a.item))
        out.push(box('', `${esc(a.label)} cần duyệt: lưu khai thay thì được duyệt luôn và tính vào thu nhập.`));
      else
        out.push(
          box('warn', `${esc(a.label)} cần duyệt; bạn không có quyền duyệt loại này nên khoản này vẫn chờ xử lý.`)
        );
    }
    // Ca khác ca được gán: Admin khai thay thì ngày đó tính lương theo ca Admin chọn (máy chủ không cảnh báo lệch ca); lịch của chính
    // Admin là tự khai nên máy chủ vẫn so với ca được gán
    const given = K.owner && K.owner.shiftCode ? shiftInfo(K.owner.shiftCode) : null;
    const picked = f.kind === 'work' && given && f.preset ? shiftInfo(f.preset) : null;
    if (picked && (f.in !== given.in || f.out !== given.out))
      out.push(
        isSelf(K.u)
          ? box(
              'warn',
              `Ngày này đi ca khác ca được gán (${esc(given.label)}). Vẫn lưu được; máy chủ sẽ cảnh báo khi lưu.`
            )
          : box(
              '',
              `Ngày Admin khai thay tính lương theo ca Admin chọn (${esc(picked.label)}): phụ cấp ca, giờ nghỉ, giờ thiếu theo ca này, không theo ca được gán (${esc(given.label)}).`
            )
      );
    // Khai thay: giờ khai không khớp ca nào trong danh mục và chưa chọn ca thì máy chủ không đoán ca (SHEET_ADMIN_SHIFT_REQUIRED)
    if (f.kind === 'work' && !isSelf(K.u) && !f.preset && !K.plan.hol && !shiftByTimes(f))
      out.push(
        box(
          'warn',
          `Giờ ${esc(f.in)}–${esc(f.out)} không khớp ca nào trong danh mục. Hãy chọn một ca ở ô Ca để ngày này tính lương theo ca đó.`
        )
      );
    if (f.kind === 'willmakeup') out.push(willMakeupNote(f));
    return out.join('');
  }
  // Khai thay "Nghỉ, sẽ làm bù": máy chủ duyệt luôn khi người khai có quyền duyệt loại này (lib/domain/sheet-on-behalf.js → approveOnBehalf);
  // lịch của chính mình hoặc không có quyền duyệt thì vẫn chờ. Ngày nghỉ luôn tính như nghỉ không lương (payroll-engine.js), giờ bù khai riêng.
  function willMakeupNote(f) {
    const plans =
      (f.makeupPlans || [])
        .filter(p => p.date)
        .map(p => esc(planText(p)))
        .join('; ') || 'chưa khai';
    const self = isSelf(K.u),
      can = canDecide('willmakeup');
    const how = !changed()
      ? ''
      : self
        ? ' Khoản của chính bạn chờ xử lý ở màn Yêu cầu.'
        : can
          ? ' Lưu khai thay thì được duyệt luôn.'
          : ' Bạn không có quyền duyệt loại này nên khoản này vẫn chờ xử lý.';
    return box(
      changed() && (self || !can) ? 'warn' : '',
      `Nghỉ, sẽ làm bù: ngày này tính như nghỉ không lương.${how} Dự kiến làm bù: ${plans}. Giờ làm bù thực tế vẫn khai riêng trong tháng ${Number(K.month.slice(5))} để được tính lại.`
    );
  }
  // Lịch làm bù dự kiến của "Nghỉ, sẽ làm bù": cùng ô với màn nhân viên (nhan-vien/khai.js → makeupPlansField), ngày trong tháng đang khai
  function makeupFields(f) {
    if (f.kind !== 'willmakeup') return '';
    const [y, m] = K.month.split('-').map(Number);
    const last = `${K.month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
    const plans = f.makeupPlans.length ? f.makeupPlans : [blankPlan()];
    const input = (i, key, type, value, extra = '') =>
      `<input id="ck-m${key}-${i}" class="input num" type="${type}" data-mp-index="${i}" data-mp-key="${key}" value="${esc(value)}"${extra}>`;
    const rows = plans
      .map((p, i) => {
        const n = plans.length > 1 ? ` ${i + 1}` : '';
        return `<div class="ck-row">${field(`Ngày làm bù${n}`, input(i, 'date', 'date', p.date, ` min="${esc(K.month)}-01" max="${esc(last)}"`), `ck-mdate-${i}`)}${field('Giờ bắt đầu', input(i, 'from', 'time', p.from, ' step="60"'), `ck-mfrom-${i}`, 'ck-t')}${field('Giờ kết thúc', input(i, 'to', 'time', p.to, ' step="60"'), `ck-mto-${i}`, 'ck-t')}${plans.length > 1 ? `<button type="button" class="btn sm ghost" data-act="ckmpdel" data-i="${i}">Bỏ ngày này</button>` : ''}</div>`;
      })
      .join('');
    return `${rows}<div><button type="button" class="btn sm ghost" data-act="ckmpadd">Thêm ngày làm bù</button></div>`;
  }
  // Loại làm thêm theo danh sách thường (như màn nhân viên): quyền lợi OT, làm bù theo giờ. OT ngày lễ được khai và trả;
  // giờ làm bù ngày lễ không đưa ra
  function extraAllowedUsual() {
    const p = K.plan.usual;
    if (!p || !p.editable) return [];
    const holiday = A.holidaySet().has(K.date);
    return [...(p.benefits.ot ? ['ot'] : []), ...(p.benefits.makeup && !holiday ? ['makeup'] : [])];
  }

  const field = (label, inner, forId, cls = '') =>
    `<div class="formrow${cls ? ' ' + cls : ''}"><label class="lbl" for="${forId}">${label}</label>${inner}</div>`;
  const timeInput = (id, value, ro = '') =>
    `<input id="${id}" class="input num" type="time" step="60" value="${esc(value)}" ${ro}>`;
  const breakField = f =>
    field(
      'Ra ngoài giữa giờ <small>(phút)</small>',
      `<input id="ck-brk" class="input num" type="number" inputmode="numeric" min="0" step="1" value="${esc(f.breakMin || 0)}">`,
      'ck-brk',
      'ck-n'
    );
  function workFields(f) {
    if (f.kind !== 'work') return '';
    // Ngày lễ: khai là OT, giờ từ – đến là khung giờ OT; ca chọn rõ ràng (tính phụ cấp ca, giờ nghỉ đêm theo ca này)
    if (K.plan.hol) {
      const opts = A.SHIFTS.map(
        ([c, n, x, y]) =>
          `<option value="${esc(c)}" ${f.preset === c ? 'selected' : ''}>${esc(n)} · ${esc(x)}–${esc(y)}</option>`
      ).join('');
      const pick = f.preset ? '' : '<option value="" selected>Chọn ca</option>';
      return `<div class="ck-row">${field('Ca', `<select id="ck-preset" class="input ck-sel">${pick}${opts}</select>`, 'ck-preset')}${field('Giờ OT từ', timeInput('ck-in', f.in), 'ck-in', 'ck-t')}${field('Đến', timeInput('ck-out', f.out), 'ck-out', 'ck-t')}${breakField(f)}</div><p class="cap">Chọn ca trước (giờ OT lấy sẵn giờ của ca), rồi sửa khung giờ OT. Giờ trong ngày lễ tính OT ngày lễ, giờ sang ngày thường kế bên tính như OT thường; không trừ giờ nghỉ. Chỉ phần có Check-in/out (hay lượt Admin khai thay) liền mạch trong khung đã khai được tính.</p>`;
    }
    const assigned = K.owner.shiftCode ? shiftInfo(K.owner.shiftCode) : null;
    let shift;
    if (assigned) {
      // Ca cố định của người này: mặc định ca được gán; Admin khai thay chọn được mọi ca trong danh mục cho riêng ngày này và ngày đó
      // tính lương theo ca đã chọn (lib/domain/sheet-checks.js → adminShiftOf). Giờ trước / sau ca tính từ ca đã chọn.
      // Giờ đã lưu khác ca được gán mà không có mã ca thì giữ nguyên bằng mục "Giờ đã lưu"
      const legacy = !f.preset && f.existed && (f.in !== assigned.in || f.out !== assigned.out);
      const cur = f.preset || (legacy ? '' : assigned.code);
      const opts = A.SHIFTS.map(
        ([c, n, x, y]) =>
          `<option value="${esc(c)}" ${cur === c ? 'selected' : ''}>${esc(n)} · ${esc(x)}–${esc(y)}${c === assigned.code ? ' (ca được gán)' : ''}</option>`
      ).join('');
      const keep = legacy ? `<option value="" selected>Giờ đã lưu ${esc(f.in)}–${esc(f.out)}</option>` : '';
      shift = field('Ca làm', `<select id="ck-preset" class="input ck-sel">${keep}${opts}</select>`, 'ck-preset');
      if (legacy)
        shift += `<p class="cap ck-wide">Giờ đã lưu khác ca được gán (${esc(assigned.label)}), giữ nguyên nếu không chọn ca.</p>`;
    } else {
      const opts = A.SHIFTS.map(
        ([c, n, a, b]) =>
          `<option value="${esc(c)}" ${f.preset === c ? 'selected' : ''}>${esc(n)} · ${esc(a)}–${esc(b)}</option>`
      ).join('');
      const ro = f.preset ? 'readonly' : '';
      shift =
        field(
          'Ca',
          `<select id="ck-preset" class="input ck-sel"><option value="">Tự nhập giờ</option>${opts}</select>`,
          'ck-preset'
        ) +
        field('Giờ vào', timeInput('ck-in', f.in, ro), 'ck-in', 'ck-t') +
        field('Giờ ra', timeInput('ck-out', f.out, ro), 'ck-out', 'ck-t');
    }
    let extra = '';
    const allowed = A.holidaySet().has(f.date) ? ['ot'] : ['ot', 'makeup'];
    if (allowed.length) {
      const kinds = [['', 'Không làm thêm']];
      if (allowed.includes('ot')) kinds.push(['ot', 'OT · làm thêm có tính tiền']);
      if (allowed.includes('makeup')) kinds.push(['makeup', 'Làm bù theo giờ']);
      if (f.extraKind && !kinds.some(([v]) => v === f.extraKind)) kinds.push([f.extraKind, f.extraKind]);
      extra = field(
        'Làm thêm',
        `<select id="ck-xkind" class="input ck-sel">${kinds.map(([v, t]) => `<option value="${esc(v)}" ${f.extraKind === v ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`,
        'ck-xkind'
      );
      if (f.extraKind)
        extra +=
          field('Giờ bắt đầu <small>(trước ca)</small>', timeInput('ck-xin', f.extraIn), 'ck-xin', 'ck-t') +
          field('Giờ kết thúc <small>(sau ca)</small>', timeInput('ck-xout', f.extraOut), 'ck-xout', 'ck-t');
    }
    // một hàng, tự xuống dòng: ca (hoặc giờ vào, ra), làm thêm và giờ làm thêm, phút ra ngoài giữa giờ
    return `<div class="ck-row">${shift}${extra}${breakField(f)}</div>${f.extraKind ? `<p class="cap">Điền một hoặc cả hai giờ làm thêm. Giờ không hợp lệ sẽ báo khi lưu.${f.extraKind === 'makeup' ? ' Giờ làm bù đã duyệt được trả đủ (giờ × lương giờ); ngày có giờ làm bù không có phụ cấp ca và giờ nghỉ đêm có lương.' : ''}</p>` : ''}`;
  }
  const saveLabel = busy => (busy ? 'Đang lưu…' : K.req && changed() ? 'Lưu, thay yêu cầu đang chờ' : 'Lưu khai báo');
  function paint(focusId) {
    const body = document.getElementById('ck-body');
    if (!body || !K.sheet) return;
    const cur = document.getElementById('ck-cur');
    if (cur) cur.textContent = `Đang lưu: ${dayText(savedDay())}`;
    const f = K.form;
    const readOnly =
      K.staff && K.staff.locked
        ? 'Tài khoản đã khoá: chỉ xem lịch đã khai.'
        : K.owner.payrollSubject === false
          ? 'Tài khoản này không thuộc bảng lương nên không có lịch để khai.'
          : '';
    if (readOnly) {
      body.innerHTML = `${stateHtml(true)}${box('', esc(readOnly))}`;
      body.removeAttribute('aria-busy');
      return;
    }
    const softLock = periodLock();
    const leave = K.sheet.leaveBalance && Number.isFinite(K.sheet.leaveBalance.balance) ? K.sheet.leaveBalance : null;
    const opt = k => {
      const on = k.value === f.kind;
      const hint =
        k.value === 'leave' && leave ? `${k.hint} Còn ${A.nf(leave.balance)} ngày phép tính đến hôm nay.` : k.hint;
      return `<label class="ck-opt${on ? ' on' : ''}${k.normal === false ? ' out' : ''}" title="${esc(hint)}"><input type="radio" name="ck-kind" id="ck-k-${esc(k.value)}" value="${esc(k.value)}" ${on ? 'checked' : ''}><span>${esc(k.label)}</span></label>`;
    };
    const sel = K.plan.kinds.find(k => k.value === f.kind);
    const outs = K.plan.kinds.some(k => k.normal === false)
      ? ' Ô viền nét đứt: ngoài lịch làm việc hoặc quyền lợi của chức vụ, vẫn lưu được và máy chủ sẽ cảnh báo.'
      : '';
    const hint =
      (sel
        ? sel.value === 'leave' && leave
          ? `${sel.hint} Còn ${A.nf(leave.balance)} ngày phép tính đến hôm nay.`
          : sel.hint
        : '') + outs;
    body.innerHTML = `${stateHtml()}${softLock ? box('warn', `${esc(softLock)} Vẫn lưu được; có thể cần tính lại lương tháng này.`) : ''}<form class="ck-form" id="ck-form" novalidate>
<fieldset class="ck-kinds"><legend class="lbl">Loại ngày</legend><div class="ck-opts">${K.plan.kinds.map(opt).join('')}</div></fieldset>
${hint ? `<p class="cap" id="ck-hint">${esc(hint)}</p>` : ''}
${workFields(f)}${makeupFields(f)}
<div id="ck-appr" class="col" style="gap:8px" aria-live="polite">${apprHtml()}</div>
<div class="cc-sec-f"><span id="ck-err" class="cc-ferr" role="alert"></span>${f.existed ? '<button type="button" class="btn ghost ck-del" data-act="ckdel" id="ck-del">Bỏ khai báo ngày này</button>' : ''}<button type="submit" class="btn pri" id="ck-save">${A.ic('check', 16)}<span>${esc(saveLabel(false))}</span></button></div></form>`;
    body.removeAttribute('aria-busy');
    if (focusId) {
      const el = document.getElementById(focusId);
      if (el) el.focus({ preventScroll: !K.first });
    }
    K.first = false;
  }
  const showErr = text => {
    const el = document.getElementById('ck-err');
    if (el) el.textContent = text || '';
  };
  const setBusy = on => {
    K.busy = on;
    for (const id of ['ck-save', 'ck-del', 'ck-approve', 'ck-reject']) {
      const b = document.getElementById(id);
      if (b) b.disabled = on;
    }
    const s = document.querySelector('#ck-save span');
    if (s) s.textContent = saveLabel(on);
  };
  // Cập nhật phần ghi chú và chữ nút lưu khi gõ (không vẽ lại ô đang gõ)
  const refreshNotes = () => {
    const a = document.getElementById('ck-appr');
    if (a) a.innerHTML = apprHtml();
    const s = document.querySelector('#ck-save span');
    if (s && !K.busy) s.textContent = saveLabel(false);
  };

  /* ---------- sự kiện của biểu mẫu (gắn vào hộp thoại một lần mỗi lần mở) ---------- */
  const FIELD = { 'ck-in': 'in', 'ck-out': 'out', 'ck-xin': 'extraIn', 'ck-xout': 'extraOut', 'ck-brk': 'breakMin' };
  // Ô của lịch làm bù dự kiến (data-mp-index, data-mp-key): ghi vào dòng tương ứng, cập nhật ghi chú; true nếu đúng là ô đó
  function setPlan(t) {
    const plan = t.dataset && t.dataset.mpIndex !== undefined ? K.form.makeupPlans[Number(t.dataset.mpIndex)] : null;
    if (!plan || !['date', 'from', 'to'].includes(t.dataset.mpKey)) return false;
    plan[t.dataset.mpKey] = t.value;
    refreshNotes();
    return true;
  }
  A.actions.ckmpadd = () => {
    if (!K.form || K.busy) return;
    K.form.makeupPlans.push(blankPlan());
    paint(`ck-mdate-${K.form.makeupPlans.length - 1}`);
  };
  A.actions.ckmpdel = el => {
    if (!K.form || K.busy) return;
    K.form.makeupPlans.splice(Number(el.dataset.i), 1);
    if (!K.form.makeupPlans.length) K.form.makeupPlans.push(blankPlan());
    paint();
  };
  // Ca được gán của người được khai vào biểu mẫu (chưa gán ca thì giữ giờ đang có); máy chủ so giờ làm thêm với giờ vào / ra này
  function toAssigned(f) {
    const given = K.owner && K.owner.shiftCode ? shiftInfo(K.owner.shiftCode) : null;
    if (given) Object.assign(f, { in: given.in, out: given.out, preset: given.code });
  }
  // Mã ca trong danh mục có đúng giờ vào – ra của biểu mẫu, ưu tiên ca được gán (như máy chủ, lib/domain/sheet-checks.js → adminShiftOf);
  // không ca nào khớp thì ''
  function shiftByTimes(f) {
    const fits = code => {
      const s = code ? shiftInfo(code) : null;
      return s && s.in === f.in && s.out === f.out ? s.code : '';
    };
    return fits(K.owner && K.owner.shiftCode) || A.SHIFTS.map(r => fits(r[0])).find(Boolean) || '';
  }
  function bind(root) {
    root.addEventListener('change', ev => {
      const t = ev.target,
        f = K.form;
      if (!f || !t.closest('#cc-khai')) return;
      if (setPlan(t)) return;
      if (t.name === 'ck-kind') {
        f.kind = t.value;
        if (f.kind === 'work') toAssigned(f); // giờ của ngày loại cũ đã lưu (vd. 20:00–09:00) không thành ca của ngày đi làm
        if (f.kind === 'willmakeup' && !f.makeupPlans.length) f.makeupPlans = [blankPlan()];
        paint(`ck-k-${t.value}`);
      } else if (t.id === 'ck-preset') {
        f.preset = t.value;
        const s = f.preset ? shiftInfo(f.preset) : null;
        if (s) {
          f.in = s.in;
          f.out = s.out;
        }
        paint('ck-preset');
      } else if (t.id === 'ck-xkind') {
        f.extraKind = t.value;
        // "Giờ đã lưu" chưa có mã ca: Admin khai thay lấy ca trong danh mục có đúng giờ đó, không có thì ca được gán (giờ trước / sau ca
        // tính theo ca này); lịch của chính Admin luôn theo ca được gán
        if (f.extraKind && !f.preset) {
          const code = isSelf(K.u) ? '' : shiftByTimes(f);
          if (code) f.preset = code;
          else toAssigned(f);
        }
        if (!f.extraKind) {
          f.extraIn = '';
          f.extraOut = '';
        }
        paint('ck-xkind');
      }
    });
    root.addEventListener('input', ev => {
      if (K.form && setPlan(ev.target)) return;
      const key = FIELD[ev.target.id];
      if (!key || !K.form) return;
      K.form[key] = ev.target.value;
      refreshNotes();
    });
    root.addEventListener('submit', ev => {
      if (ev.target.id !== 'ck-form') return;
      ev.preventDefault();
      save();
    });
  }

  /* ---------- lưu, bỏ khai báo ---------- */
  // Đọc lịch mới nhất ngay trước khi ghi, thay đúng một ngày (change(days)), ghi cả tháng của người đó
  async function commit(change, okText) {
    if (K.busy || !K.plan) return;
    const { u, month, date } = K;
    const token = K.token;
    const before = kindOf(savedDay());
    showErr('');
    setBusy(true);
    let res, days;
    try {
      const fresh = await A.api('GET', '/sheet' + A.qs({ month, user: u }));
      days = clone(fresh && fresh.days);
      change(days);
      // expectedRev: lịch vừa đọc; ai đó lưu xen giữa thì máy chủ trả 409 (SHEET_STALE), không ghi đè
      const body = {
        month,
        user: u,
        days,
        confirmDays: [date], // ngày Admin vừa lưu: máy chủ ghi chấm công Admin cho ngày này dù giờ không đổi (lib/domain/attendance/admin-presence.js)
        ...(Number.isInteger(fresh && fresh.rev) ? { expectedRev: fresh.rev } : {})
      };
      // Lịch của chính mình: máy chủ coi là tự khai, thiếu kpiPct / kpiAmt là xoá KPI tự đánh giá, nên gửi lại số đang có (như NV.putSheet)
      if (isSelf(u)) Object.assign(body, { kpiPct: fresh.kpiPct ?? null, kpiAmt: fresh.kpiAmt ?? null });
      res = await A.api('PUT', '/sheet', body, { warnings: 'manual' });
    } catch (e) {
      if (token === K.token) {
        setBusy(false);
        showErr(A.errText(e)); // câu báo lỗi của máy chủ, nguyên văn
      }
      return;
    }
    K.busy = false;
    const n = res && res.onBehalf ? Number(res.autoApproved) || 0 : 0;
    patch(u, month, days, res && res.approvals);
    if (token === K.token && document.getElementById('cc-khai')) A.closeDialog();
    notify(n ? `${okText} ${n} khoản cần duyệt được duyệt luôn vì Admin khai thay.` : okText, res && res.warnings);
    if (S.view === 'cham-cong') A.render();
    if (before === 'leave' || kindOf(days[date]) === 'leave') A.loadStaff(true); // phép còn lại đổi
    A.refreshShell();
    A.loadView('cham-cong');
  }
  function save() {
    const f = K.form;
    if (!f) return;
    const bad = checkDayForm(f);
    if (bad) return showErr(bad);
    const date = K.date;
    return commit(days => {
      const d = dayFromForm(f);
      // giải trình Check-in/out của nhân sự (punchNote) không có trên hộp này: giữ nguyên của ngày đã lưu, như logic.js → dayFromForm
      const note = days[date] && days[date].punchNote;
      if (d) days[date] = note ? { ...d, punchNote: note } : d;
      else delete days[date];
    }, 'Đã lưu.');
  }
  A.actions.ckdel = () => {
    const date = K.date;
    return commit(days => {
      delete days[date];
    }, 'Đã bỏ khai báo ngày này.');
  };
  // Yêu cầu đang chờ của ngày này: Đồng ý / Từ chối qua đúng đường của màn Yêu cầu (A.Duyet: cùng rev, fingerprint, điều kiện AI, hộp lý do)
  A.actions.ckreq = async el => {
    const r = K.req;
    if (!r || !A.Duyet || K.busy) return;
    if (el.dataset.a === 'reject') return A.Duyet.reject(r); // mở hộp lý do của màn Yêu cầu thay cho hộp này
    setBusy(true);
    if (r.date.slice(0, 7) === S.month) await A.loadAi();
    if (!document.getElementById('cc-khai')) return;
    if (A.Duyet.state(r) === 'flagged') return A.Duyet.why(r); // có cảnh báo AI: mở "Lý do AI cảnh báo" (ghi lý do rồi xử lý)
    A.closeDialog();
    A.Duyet.approve(r); // xong thì màn Yêu cầu tự báo và nạp lại màn đang xem
  };

  // Báo sau khi lưu: câu thành công cùng cảnh báo của máy chủ (nếu có) trong một thông báo; mục nghiêm trọng lên băng cố định (A.showWarnings)
  function notify(ok, warnings) {
    const list = (Array.isArray(warnings) ? warnings : []).filter(w => w && w.message);
    const danger = list.filter(w => w.severity === 'danger');
    if (danger.length) A.showWarnings(danger);
    const soft = list.filter(w => w.severity !== 'danger');
    if (!soft.length) return A.toast(ok);
    A.toast(`${ok} ${soft[0].message}${soft.length > 1 ? ` (và ${soft.length - 1} cảnh báo khác)` : ''}`, 'warn');
  }

  // planOf, dayFromForm, checkDayForm: để test kiểm danh sách loại ngày và ngày loại cũ
  A.CcKhai = { index, ready, mark, legend, section, mount, notify, planOf, dayFromForm, checkDayForm };
})(window.Admin);
