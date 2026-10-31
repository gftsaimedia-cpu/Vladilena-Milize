/* Giao diện Nhân viên: khai lịch (ngày nghỉ, OT, làm bù, iSAT) và thẻ KPI 5 thành phần (chỉ xem).
   Gửi lên máy chủ: PUT /api/sheet { month, days, kpiPct, kpiAmt } (cả tháng một yêu cầu, xem NV.putSheet).
   Giao diện chỉ dựng biểu mẫu và gợi ý; mọi kiểm tra nghiệp vụ (OT tối đa, số dư phép, ca cố định, kỳ đã khoá) do máy chủ làm và
   câu báo lỗi của máy chủ hiện nguyên văn tại chỗ. Lưu xong mà máy chủ gửi kèm
   warnings (SHEET_*, PERIOD_FROZEN...) thì khay khai hiện nguyên văn từng câu cho người khai, không đóng ngay.
   Không có phép tính tiền ở đây (số tiền do máy chủ tính, chỉ hiện lại). Mọi chuỗi từ dữ liệu đi qua esc() trước khi vào innerHTML. */
(function (NV) {
  'use strict';
  const { esc, ic, S, L } = NV;
  const K = (NV.khai = { form: null, plan: null, date: '', want: '', busy: false, token: 0 });

  const isNum = n => typeof n === 'number' && Number.isFinite(n);
  const fmtNum = n => Number(n).toLocaleString('vi-VN', { maximumFractionDigits: 2 });
  const planOf = (date, existingKind) =>
    L.dayPlan({ me: S.me, date, holidays: S.holidays, existingKind, ...NV.planCtx() });

  /* ---------- nút mở biểu mẫu ---------- */
  // Trong chi tiết một ngày. variant: is-pri (khay điện thoại), is-outline (thẻ Hôm nay), sm (ô ngày trên máy tính).
  // Chỉ có ở chế độ khai thay của Admin: nhân viên không tự khai ngày làm việc (ngày làm việc theo lịch được gán), yêu cầu nghỉ, OT,
  // làm bù gửi từ mục Yêu cầu
  NV.khaiAction = (month, date, cell, variant = 'is-outline') => {
    if (!NV.thay) return '';
    const label = cell && cell.kind ? 'Sửa khai báo ngày này' : 'Khai ngày này';
    const cls = variant === 'sm' ? 'nv-btn is-sm' : `nv-btn ${variant}`;
    return `<button type="button" class="${cls}" data-act="khai" data-d="${esc(date)}">${ic('cal', variant === 'sm' ? 15 : 18)}${label}</button>`;
  };

  /* ---------- mở biểu mẫu ---------- */
  function pickDate() {
    return S.sel && L.isDate(S.sel) && S.sel.startsWith(S.month)
      ? S.sel
      : NV.today().startsWith(S.month)
        ? NV.today()
        : `${S.month}-01`;
  }
  NV.openKhai = async ({ date, want } = {}) => {
    const day = L.isDate(date) ? date : pickDate();
    K.token++;
    K.want = want || '';
    K.busy = false;
    NV.openSheet({
      label: NV.thay ? 'Khai ngày' : 'Tạo yêu cầu',
      html: `<div id="nv-khai" aria-busy="true">${NV.skeleton(3)}</div>`,
      onMount: bindSheet
    });
    await load(day, K.token);
  };
  async function load(date, token) {
    const month = date.slice(0, 7);
    await Promise.all([NV.loadMonth(month), NV.loadEstimate(month)]);
    if (token !== K.token || !document.getElementById('nv-khai')) return; // đã đóng hoặc đã đổi ngày
    const st = S.sheets[month];
    if (!st || !st.data) {
      document.getElementById('nv-khai').innerHTML =
        `${NV.errorBox((st && st.error) || 'Chưa tải được lịch tháng này.', 'khai-retry')}<button type="button" class="nv-btn is-ghost" data-act="close-sheet">Đóng</button>`;
      return;
    }
    const day = st.data.days ? st.data.days[date] : null;
    K.date = date;
    K.plan = planOf(date, day ? day.kind || 'work' : '');
    K.form = L.formFromDay({ me: S.me, date, day, plan: K.plan, want: K.want });
    paint();
  }
  NV.actions['khai-retry'] = () => load(K.date || pickDate(), ++K.token);
  NV.actions.khai = el => NV.openKhai({ date: el.dataset.d, want: el.dataset.want });
  NV.actions['khai-close'] = () => NV.closeSheet();

  /* ---------- vẽ biểu mẫu ---------- */
  // Số phép còn lại tính đến hôm nay (số của máy chủ, qua NV.leave) nối vào gợi ý của mục Nghỉ phép năm; máy chủ vẫn kiểm số dư tại ngày chọn
  const withBalance = k => {
    const lv = k.value === 'leave' ? NV.leave() : null;
    return lv ? { ...k, hint: `${k.hint} Còn ${fmtNum(lv.balance)} ngày phép tính đến hôm nay.` } : k;
  };
  const optRow = (k, on) =>
    `<label class="nv-opt ${on ? 'is-on' : ''}"><input type="radio" id="kh-k-${esc(k.value)}" name="kh-kind" value="${esc(k.value)}" ${on ? 'checked' : ''}><span class="nv-rd" aria-hidden="true"></span><span><b>${esc(k.label)}</b><small>${esc(k.hint)}</small></span></label>`;

  function dayState(cell) {
    if (!cell) return '';
    if (cell.kind === 'makeup')
      return NV.noteBox(
        'warn',
        'Ngày này khai loại Làm bù cả ngày, loại này không còn dùng và không tính lương. Hãy khai lại: đi làm (giờ làm bù khai trước hoặc sau ca) hoặc một loại nghỉ.'
      );
    const a = cell.approval;
    if (a && a.status === 'rejected')
      return NV.noteBox(
        'bad',
        `${a.label}: Admin đã từ chối${a.note ? `. Lý do: ${a.note}` : ' và chưa ghi lý do'}. Yêu cầu này không tính vào thu nhập.`
      );
    if (a)
      return NV.noteBox(
        'warn',
        NV.thay
          ? `${a.label}: đang chờ xử lý. Đổi loại hoặc giờ thì khoản này được xử lý lại từ đầu.`
          : `${a.label}: đang chờ Admin xử lý. Nếu bạn đổi loại hoặc giờ, Admin sẽ xử lý lại từ đầu.`
      );
    if (cell.approvedItem)
      return NV.noteBox(
        'info',
        NV.thay
          ? `${L.ITEM_LABEL[cell.approvedItem] || cell.approvedItem}: đã được đồng ý. Đổi loại hoặc giờ thì khoản này được xử lý lại.`
          : `${L.ITEM_LABEL[cell.approvedItem] || cell.approvedItem}: Admin đã đồng ý. Đổi loại hoặc giờ thì Admin phải xử lý lại.`
      );
    return '';
  }

  const field = (label, inner, hint = '', forId = '') =>
    `<div class="nv-field">${forId ? `<label class="nv-lbl" for="${forId}">${label}</label>` : `<span class="nv-lbl">${label}</span>`}${inner}${hint ? `<span class="nv-hint">${esc(hint)}</span>` : ''}</div>`;
  function workFields(f, plan) {
    if (f.kind !== 'work') return '';
    // Ngày lễ: khai là OT, giờ từ – đến là khung giờ OT (không phải ca); giờ kết thúc nhỏ hơn giờ bắt đầu là sang ngày hôm sau
    if (plan.hol)
      return `<div class="nv-grid2">${field('Giờ OT từ', `<input id="kh-in" class="nv-input nv-num" type="time" value="${esc(f.in)}">`, '', 'kh-in')}${field('Đến', `<input id="kh-out" class="nv-input nv-num" type="time" value="${esc(f.out)}">`, '', 'kh-out')}</div><p class="nv-hint">Giờ nằm trong ngày lễ tính OT ngày lễ, giờ sang ngày thường kế bên tính như OT thường. Không trừ giờ nghỉ. Chỉ phần có Check-in/out liền mạch trong khung đã khai mới được tính.</p>${field('Ra khỏi văn phòng giữa giờ (phút)', `<input id="kh-brk" class="nv-input nv-num" type="number" inputmode="numeric" min="0" value="${esc(f.breakMin || 0)}">`, '', 'kh-brk')}`;
    const assigned = S.me.shiftCode ? L.shiftInfo(S.me.shiftCode) : null;
    const fixed = !!assigned;
    let shift;
    if (fixed) {
      const legacy = f.existed && (f.in !== assigned.in || f.out !== assigned.out);
      shift = field(
        'Ca làm',
        `<div class="nv-fixed">${esc(legacy ? `Giờ đã lưu ${f.in} – ${f.out}` : NV.shiftText(assigned))}</div>`,
        `${NV.thay ? `Ca cố định của ${NV.thay.name}. Muốn đổi ca thì sửa ở màn Nhân sự.` : 'Ca do Admin gán. Muốn đổi ca thì báo Admin.'}${legacy ? ` Giờ đã lưu khác ca được gán (${assigned.label}), giữ nguyên.` : ''}`
      );
    } else {
      const opts = Object.keys(L.SHIFT_NAME)
        .map(code => {
          const sh = L.shiftInfo(code);
          return sh
            ? `<option value="${esc(code)}" ${f.preset === code ? 'selected' : ''}>${esc(sh.label)}</option>`
            : '';
        })
        .join('');
      const ro = f.preset ? 'readonly' : '';
      shift = `${field('Ca', `<select id="kh-preset" class="nv-input"><option value="">Tự nhập giờ</option>${opts}</select>`, '', 'kh-preset')}
<div class="nv-grid2">${field('Giờ vào', `<input id="kh-in" class="nv-input nv-num" type="time" value="${esc(f.in)}" ${ro}>`, '', 'kh-in')}${field('Giờ ra', `<input id="kh-out" class="nv-input nv-num" type="time" value="${esc(f.out)}" ${ro}>`, '', 'kh-out')}</div>`;
    }
    let extra = '';
    // Loại làm thêm theo plan.extraKinds (logic.js → dayPlan): ngày lễ chỉ có OT (làm bù ngày lễ bị chặn); ngày thường có đủ hai loại
    if (plan.extraKinds && plan.extraKinds.length) {
      const NO = ' (chức vụ chưa có quyền lợi này)';
      // Mục OT / làm bù của nhân viên (plan.extraOnly): ngày này chỉ để gửi giờ làm thêm, không có "Không làm thêm"
      const kinds = plan.extraOnly ? [] : [['', 'Không làm thêm']];
      if (plan.extraKinds.includes('ot'))
        kinds.push(['ot', plan.benefits.ot ? 'OT · làm thêm có tính tiền' : `OT${NO}`]);
      if (plan.extraKinds.includes('makeup'))
        kinds.push(['makeup', `Làm bù theo giờ${plan.benefits.makeup ? '' : NO}`]);
      // Loại đã lưu từ trước nay không còn trong danh sách (vd. làm bù trên ngày lễ thêm sau): vẫn hiện đúng, không âm thầm đổi thành "Không làm thêm"
      if (f.extraKind === 'makeup' && !kinds.some(([v]) => v === 'makeup')) kinds.push(['makeup', 'Làm bù theo giờ']);
      extra = field(
        'Làm thêm',
        `<select id="kh-xkind" class="nv-input">${kinds.map(([v, t]) => `<option value="${esc(v)}" ${f.extraKind === v ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`,
        '',
        'kh-xkind'
      );
      if (f.extraKind)
        extra += `<div class="nv-grid2">${field('Giờ bắt đầu <small>(trước ca)</small>', `<input id="kh-xin" class="nv-input nv-num" type="time" value="${esc(f.extraIn)}">`, '', 'kh-xin')}${field('Giờ kết thúc <small>(sau ca)</small>', `<input id="kh-xout" class="nv-input nv-num" type="time" value="${esc(f.extraOut)}">`, '', 'kh-xout')}</div><p class="nv-hint">Điền một hoặc cả hai ô. Giờ không hợp lệ sẽ báo ngay khi gửi.${f.extraKind === 'makeup' ? ' Giờ làm bù đã duyệt được trả đủ (giờ × lương giờ); ngày có giờ làm bù không có phụ cấp ca và giờ nghỉ đêm có lương.' : ''}</p>`;
    }
    const brk = field(
      'Ra khỏi văn phòng giữa giờ (phút)',
      `<input id="kh-brk" class="nv-input nv-num" type="number" inputmode="numeric" min="0" value="${esc(f.breakMin || 0)}">`,
      '',
      'kh-brk'
    );
    return `${shift}${extra}${brk}`;
  }

  // "Nghỉ, sẽ làm bù": các ngày/khung giờ dự kiến (mỗi ô một field, hai ô giờ cạnh nhau).
  // Giờ kết thúc nhỏ hơn giờ bắt đầu là ca qua đêm (kết thúc ngày hôm sau).
  function makeupPlansField(f, month, last) {
    if (f.kind !== 'willmakeup') return '';
    const plans = f.makeupPlans.length ? f.makeupPlans : [{ date: '', from: '', to: '' }];
    const timeInput = (id, i, key, value) =>
      `<input id="${id}-${i}" class="nv-input nv-num" data-mp-index="${i}" data-mp-key="${key}" type="time" value="${esc(value)}">`;
    const blocks = plans
      .map((plan, i) => {
        const n = plans.length > 1 ? ` ${i + 1}` : '';
        return `${plans.length > 1 ? `<span class="nv-lbl">Lần làm bù${n}</span>` : ''}
${field(`Ngày làm bù${n}`, `<input id="kh-mdate-${i}" class="nv-input nv-num" data-mp-index="${i}" data-mp-key="date" type="date" value="${esc(plan.date)}" min="${esc(month)}-01" max="${esc(last)}">`, '', `kh-mdate-${i}`)}
<div class="nv-grid2">${field('Giờ bắt đầu', timeInput('kh-mfrom', i, 'from', plan.from), '', `kh-mfrom-${i}`)}${field('Giờ kết thúc', timeInput('kh-mto', i, 'to', plan.to), '', `kh-mto-${i}`)}</div>
${plans.length > 1 ? `<div class="nv-field"><button type="button" class="nv-btn is-ghost" data-act="kh-makeup-remove" data-i="${i}">Bỏ ngày này</button></div>` : ''}`;
      })
      .join('');
    return `${blocks}
<p class="nv-hint">Có thể thêm nhiều ngày làm bù. Ca đêm: giờ kết thúc nhỏ hơn giờ bắt đầu thì tính sang ngày hôm sau. Giờ làm bù thực tế vẫn khai riêng để tính lương.</p>
<div class="nv-field"><button type="button" class="nv-btn is-ghost" data-act="kh-makeup-add">Thêm ngày làm bù</button></div>`;
  }

  // Ghi chú dưới các lựa chọn: khoản cần Admin đồng ý, hoặc cách tính của "Nghỉ, sẽ làm bù"
  function apprHtml() {
    if (!K.form || !K.plan) return '';
    const a = L.approvalOfForm(K.form, { me: S.me, holidays: S.holidays });
    // Khai thay: máy chủ duyệt luôn khoản mới hoặc vừa đổi mà người khai có quyền duyệt (lib/domain/sheet-on-behalf.js → approveOnBehalf)
    if (a && NV.thay)
      return NV.thayCanDecide(a.item)
        ? NV.noteBox('info', `${a.label} cần duyệt: lưu khai thay thì được duyệt luôn và tính vào thu nhập.`)
        : NV.noteBox('warn', `${a.label} cần duyệt; bạn không có quyền duyệt loại này nên khoản này vẫn chờ xử lý.`);
    if (a)
      return NV.noteBox(
        'warn',
        a.item === 'willmakeup'
          ? 'Nghỉ, sẽ làm bù cần Admin đồng ý. Lịch dự kiến chỉ để duyệt; giờ làm bù thực tế vẫn phải khai riêng để tính lương.'
          : `${a.label} cần Admin đồng ý. Trước đó, ngày này chưa tính vào thu nhập.`
      );
    return '';
  }

  function paint(focusId) {
    const box = document.getElementById('nv-khai');
    if (!box) return;
    const date = K.date,
      month = date.slice(0, 7),
      f = K.form,
      plan = K.plan;
    const model = NV.model(month);
    const cell = model && model.cells.get(date);
    const last = `${month}-${L.pad(L.daysInMonth(month))}`;
    const sub = NV.thay ? `Khai thay cho ${NV.thay.name}.` : 'Yêu cầu cần Admin đồng ý mới tính vào thu nhập.';
    const head = `<div class="nv-dh"><h2 tabindex="-1" data-autofocus>${NV.thay ? 'Khai ngày' : 'Tạo yêu cầu'}</h2></div><p class="nv-dsub">${esc(sub)}</p>
<div class="nv-field"><label class="nv-lbl" for="kh-date">Ngày</label><div class="nv-datebox"><span>${esc(L.weekdayLong(date))}, ${esc(L.dmy(date))}</span>${ic('cal', 18)}<input id="kh-date" type="date" value="${esc(date)}" min="${esc(month)}-01" max="${esc(last)}"></div></div>`;
    const body = `${dayState(cell)}<form class="nv-form" id="nv-khai-form" novalidate>
<fieldset class="nv-opts"><legend class="nv-lbl">Loại ngày</legend>${plan.kinds.map(k => optRow(withBalance(k), k.value === f.kind)).join('')}</fieldset>
${workFields(f, plan)}${makeupPlansField(f, month, last)}
<div id="kh-appr" aria-live="polite">${apprHtml()}</div>
<div id="kh-err" role="alert" aria-live="assertive"></div>
<div class="nv-bt"><button type="button" class="nv-btn" data-act="khai-close">Huỷ</button><button type="submit" class="nv-btn is-pri" id="kh-save">${saveLabel(false)}</button></div>
${f.existed ? `<button type="button" class="nv-btn is-danger" data-act="khai-del" id="kh-del">Bỏ khai báo ngày này</button>` : ''}</form>`;
    box.innerHTML = `${head}${body}`;
    box.removeAttribute('aria-busy');
    if (focusId) {
      const el = box.querySelector('#' + focusId);
      if (el) el.focus({ preventScroll: true });
    }
  }

  const showErr = text => {
    const el = document.getElementById('kh-err');
    if (!el) return;
    el.innerHTML = text ? NV.noteBox('bad', text) : '';
    if (text) el.scrollIntoView({ block: 'nearest' });
  };
  const setBusy = on => {
    K.busy = on;
    for (const id of ['kh-save', 'kh-del']) {
      const b = document.getElementById(id);
      if (b) {
        b.disabled = on;
        b.setAttribute('aria-busy', String(on));
      }
    }
    const save = document.getElementById('kh-save');
    if (save) save.textContent = saveLabel(on);
  };
  // Khai thay là Admin lưu lịch (không phải gửi yêu cầu chờ duyệt)
  function saveLabel(busy) {
    if (NV.thay) return busy ? 'Đang lưu…' : 'Lưu';
    return busy ? 'Đang gửi…' : 'Gửi yêu cầu';
  }

  /* ---------- sự kiện của biểu mẫu ---------- */
  const FIELD = {
    'kh-in': 'in',
    'kh-out': 'out',
    'kh-xin': 'extraIn',
    'kh-xout': 'extraOut',
    'kh-brk': 'breakMin'
  };
  function bindSheet(sheet) {
    // Ô ngày: chữ "Thứ Tư, 25/11/2026" phủ lên ô chọn ngày thật (#kh-date, trong suốt); bấm vào đâu cũng mở bảng chọn ngày
    sheet.addEventListener('click', ev => {
      const t = ev.target;
      const addPlan = t.closest('[data-act="kh-makeup-add"]');
      if (addPlan && K.form) {
        K.form.makeupPlans.push({ date: '', from: '', to: '' });
        paint(`kh-mdate-${K.form.makeupPlans.length - 1}`);
        return;
      }
      const removePlan = t.closest('[data-act="kh-makeup-remove"]');
      if (removePlan && K.form) {
        K.form.makeupPlans.splice(Number(removePlan.dataset.i), 1);
        paint();
        return;
      }
      if (t.id !== 'kh-date' || typeof t.showPicker !== 'function') return;
      try {
        t.showPicker();
      } catch {
        /* trình duyệt không cho mở: vẫn gõ được bằng bàn phím */
      }
    });
    sheet.addEventListener('change', ev => {
      const t = ev.target,
        f = K.form;
      if (t.id === 'kh-date') {
        if (L.isDate(t.value)) load(t.value, ++K.token);
        return;
      }
      if (!f) return;
      if (t.dataset.mpIndex !== undefined) {
        f.makeupPlans[Number(t.dataset.mpIndex)][t.dataset.mpKey] = t.value;
        return;
      }
      if (t.name === 'kh-kind') {
        f.kind = t.value;
        if (f.kind === 'work') L.toAssignedShift(f, S.me); // giờ của ngày loại cũ đã lưu không thành ca của ngày đi làm
        if (f.kind === 'work' && K.plan.extraOnly && !f.extraKind) f.extraKind = (K.plan.extraKinds || [])[0] || '';
        if (f.kind === 'willmakeup' && !f.makeupPlans.length) f.makeupPlans = [{ date: '', from: '', to: '' }];
        paint(`kh-k-${t.value}`);
      } else if (t.id === 'kh-preset') {
        f.preset = t.value;
        const s = f.preset ? L.shiftInfo(f.preset) : null;
        if (s) {
          f.in = s.in;
          f.out = s.out;
        }
        paint('kh-preset');
      } else if (t.id === 'kh-xkind') {
        f.extraKind = t.value;
        if (f.extraKind && !f.preset) L.toAssignedShift(f, S.me); // ca cố định: giờ trước / sau ca tính theo ca được gán, không theo "Giờ đã lưu"
        if (!f.extraKind) {
          f.extraIn = '';
          f.extraOut = '';
        }
        paint('kh-xkind');
      }
    });
    sheet.addEventListener('input', ev => {
      const key = FIELD[ev.target.id];
      if (!K.form) return;
      if (ev.target.dataset.mpIndex !== undefined) {
        K.form.makeupPlans[Number(ev.target.dataset.mpIndex)][ev.target.dataset.mpKey] = ev.target.value;
        return;
      }
      if (!key) return;
      K.form[key] = ev.target.value;
      const a = document.getElementById('kh-appr');
      if (a) a.innerHTML = apprHtml();
    });
    sheet.addEventListener('submit', ev => {
      ev.preventDefault();
      save();
    });
  }

  /* ---------- lưu, bỏ khai báo ---------- */
  async function commit(change, okText) {
    if (K.busy || !K.form || !K.plan) return;
    const date = K.date,
      month = date.slice(0, 7);
    showErr('');
    setBusy(true);
    let res;
    try {
      res = await NV.putSheet(month, change, { warnings: 'manual' });
    } catch (e) {
      setBusy(false);
      showErr(NV.errText(e)); // câu báo lỗi của máy chủ, nguyên văn
      return;
    }
    K.busy = false;
    const sheet = S.sheets[month];
    const ap = sheet && sheet.data && sheet.data.approvals && sheet.data.approvals[date];
    // Khai thay: phản hồi có onBehalf, autoApproved (số khoản cần duyệt được duyệt luôn)
    let done = okText;
    if (res && res.onBehalf) {
      const n = Number(res.autoApproved) || 0;
      if (n) done = `${okText} ${n} khoản cần duyệt được duyệt luôn vì Admin khai thay.`;
    } else if (ap && ap.status === 'pending' && okText === 'Đã lưu.') done = 'Đã gửi yêu cầu. Chờ Admin xử lý.';
    if (month === S.month) S.sel = date;
    // Lịch đã lưu nhưng máy chủ gửi kèm cảnh báo (SHEET_*, PERIOD_FROZEN...): giữ khay mở, hiện nguyên văn từng câu
    const warns = NV.warnList(res && res.warnings);
    if (warns.length && document.getElementById('nv-khai')) {
      NV.showWarnings(warns.filter(w => w.severity === 'danger')); // mức 'danger' còn lên băng đầu trang
      NV.render();
      return savedWithWarnings(done, warns);
    }
    NV.closeSheet();
    NV.render();
    if (warns.length)
      NV.showWarnings(warns); // khay đã bị đóng giữa chừng: hiện bằng thông báo, băng đầu trang
    else NV.toast(done);
  }
  // Khay sau khi lưu có cảnh báo: dòng "đã lưu", từng cảnh báo của máy chủ (nguyên văn), nút Đóng và Sửa lại ngày này
  function savedWithWarnings(done, warns) {
    const box = document.getElementById('nv-khai');
    box.innerHTML = `<div class="nv-dh"><h2 tabindex="-1" data-autofocus id="kh-saved">Đã lưu, có cảnh báo</h2></div><p class="nv-dsub">${esc(`${L.weekdayLong(K.date)}, ${L.dmy(K.date)}`)}</p>
${NV.noteBox('ok', done)}<div class="nv-warns" id="kh-warns" role="alert">${warns.map(w => NV.noteBox(w.severity === 'danger' ? 'bad' : 'warn', w.message)).join('')}</div>
<div class="nv-bt"><button type="button" class="nv-btn" data-act="khai-again">Sửa lại ngày này</button><button type="button" class="nv-btn is-pri" data-act="khai-close">Đóng</button></div>`;
    const h = box.querySelector('#kh-saved');
    if (h) h.focus({ preventScroll: true });
  }
  NV.actions['khai-again'] = () => load(K.date || pickDate(), ++K.token);
  function save() {
    const f = K.form;
    if (!f) return;
    const bad = L.checkDayForm(f, S.holidays);
    if (bad) return showErr(bad);
    // Mục OT / làm bù của nhân viên phải kèm loại làm thêm (không gửi ngày đi làm thường)
    if (K.plan.extraOnly && f.kind === 'work' && !f.extraKind && (K.plan.extraKinds || []).length)
      return showErr('Chọn OT hoặc làm bù theo giờ.');
    const date = K.date;
    // Ngày lễ: khung OT từ – đến thay mọi đoạn làm thêm
    if (K.plan && K.plan.hol) Object.assign(f, { extraKind: '', extraIn: '', extraOut: '' });
    return commit(days => {
      const d = L.dayFromForm(f);
      if (d) days[date] = d;
      else delete days[date];
    }, 'Đã lưu.');
  }
  NV.actions['khai-del'] = () => {
    const date = K.date;
    return commit(days => {
      delete days[date];
    }, 'Đã bỏ khai báo ngày này.');
  };

  /* ---------- KPI: 5 thành phần do Admin chấm, nhân sự chỉ xem ---------- */
  const kv = (k, v, sub = '') =>
    `<div class="nv-kv"><span class="nv-k">${esc(k)}${sub ? `<small>${esc(sub)}</small>` : ''}</span><span class="nv-v nv-num">${esc(v)}</span></div>`;
  /* Điểm Tự đánh giá: nhân sự tự nhập điểm 0–100 của chính mình cho tháng (PUT /api/kpi/scores { month, username, scores: { self } });
     bốn điểm còn lại Admin chấm. Máy chủ gửi kpiParts.self cho chính người đó (kể cả khi chưa đủ năm điểm) và các điểm Admin đã nhập;
     điểm nào chưa có thì hiện —. Khai thay: chỉ xem. */
  const selfDraft = {}; // { 'YYYY-MM': chữ đang gõ }, giữ qua các lần vẽ lại
  const selfOf = d => (d.kpiParts && isNum(d.kpiParts.self) ? d.kpiParts.self : null);
  function selfForm(month, d, weight) {
    const cur = selfOf(d);
    const draft = selfDraft[month] !== undefined ? selfDraft[month] : cur === null ? '' : String(cur).replace('.', ',');
    if (NV.thay)
      return kv('Tự đánh giá', cur === null ? 'Chưa nhập' : fmtNum(cur), weight === null ? '' : `Trọng số ${fmtNum(weight)}%`);
    return `<div class="nv-selfkpi"><form class="nv-form" id="nv-self-form" data-month="${esc(month)}" novalidate><div class="nv-field"><label class="nv-lbl" for="kpi-self">Tự đánh giá của bạn <small>(0 đến 100${weight === null ? '' : `, trọng số ${fmtNum(weight)}%`})</small></label><div class="nv-selfrow"><input id="kpi-self" class="nv-input nv-num" type="text" inputmode="decimal" autocomplete="off" value="${esc(draft)}" placeholder="Ví dụ 85"><button type="submit" class="nv-btn is-pri" id="kpi-self-go">${cur === null ? 'Lưu điểm' : 'Cập nhật'}</button></div><span class="nv-hint">Bạn chỉ tự chấm thành phần này; bốn điểm còn lại do Admin chấm.</span></div><div id="kpi-self-err" role="alert" aria-live="assertive"></div></form></div>`;
  }
  function kpiFive(d, m, month) {
    const parts = d.kpiParts && d.kpiParts.complete ? d.kpiParts : null;
    const list = L.kpiParts(d.kpiWeights); // trọng số của tháng do máy chủ gửi, không viết cứng
    const count = list.length;
    const known = d.kpiParts || {};
    if (!parts) {
      // Chưa đủ điểm: hiện điểm đã có (Admin đã nhập) và ô nhập Tự đánh giá của chính mình
      const rows = list
        .filter(c => c.key !== 'self')
        .map(c =>
          kv(
            L.KPI_PART_LABEL[c.key] || c.key,
            isNum(known[c.key]) ? fmtNum(known[c.key]) : 'Chờ Admin chấm',
            c.weight === null ? '' : `Trọng số ${fmtNum(c.weight)}%`
          )
        )
        .join('');
      const w = list.find(c => c.key === 'self');
      return `<div class="nv-wait">${ic('target', 20)}<div><b>Chờ chấm đủ ${esc(count)} điểm</b><span>Tính theo ${esc(count)} thành phần của Quy chế lương 3P. Bạn tự chấm thành phần Tự đánh giá, các điểm còn lại do Admin chấm. Khi đủ điểm, lương KPI sẽ hiện ở đây.</span></div></div>${rows}${selfForm(month, d, w ? w.weight : null)}`;
    }
    const rows = list
      .map(c =>
        c.key === 'self' && !NV.thay
          ? ''
          : kv(
              L.KPI_PART_LABEL[c.key] || c.key,
              isNum(parts[c.key]) ? fmtNum(parts[c.key]) : '—',
              c.weight === null ? '' : `Trọng số ${fmtNum(c.weight)}%`
            )
      )
      .join('');
    const total =
      m && isNum(m.kpiPct)
        ? kv(
            'Tổng điểm',
            `${fmtNum(m.kpiPct)}%${m.kpiPass === true ? ' · Đạt' : m.kpiPass === false ? ' · Chưa đạt' : ''}`
          )
        : '';
    const pay = m && isNum(m.kpiPay) ? kv('Lương KPI', NV.fmtMoney(m.kpiPay)) : '';
    const selfPart = list.find(c => c.key === 'self');
    const selfBlock = !NV.thay ? selfForm(month, d, selfPart ? selfPart.weight : null) : '';
    return `${rows}${total}${pay}${selfBlock}`;
  }
  // desktop: thẻ có đầu thẻ; điện thoại: tiêu đề ngoài thẻ. skipWait: máy tính bỏ thẻ "chờ chấm đủ điểm" (đã có dòng Lương KPI ở thẻ Thu nhập)
  NV.kpiCard = (month, { desktop = false, skipWait = false } = {}) => {
    if (!S.payroll || !L.benefitsOf(S.me.type).kpi) return '';
    const sh = S.sheets[month];
    const title = `KPI ${L.monthLabel(month)
      .replace('Tháng', 'tháng')
      .replace(/\/\d{4}$/, '')}`;
    const wrap = (inner, label, cap = '') =>
      desktop
        ? `<section class="nv-card nv-dcard" aria-label="${label}"><div class="nv-card-h"><h2>${esc(title)}</h2>${cap ? `<span class="nv-cap">${esc(cap)}</span>` : ''}</div>${inner}</section>`
        : `<section class="nv-sec" aria-label="${label}"><h2 class="nv-h2">${esc(title)}${cap ? ` <small>${esc(cap)}</small>` : ''}</h2><div class="nv-card">${inner}</div></section>`;
    if (!sh || (sh.status === 'loading' && !sh.data)) return wrap(`<div class="nv-pad">${NV.skeleton(3)}</div>`, 'KPI');
    if (!sh.data) return wrap(`<div class="nv-pad">${NV.errorBox(sh.error, 'reload-month')}</div>`, 'KPI');
    const es = S.estimates[month];
    const d = es && es.data ? es.data : null;
    const m = d && d.m ? d.m : null;
    const done = sh.data.kpiParts && sh.data.kpiParts.complete;
    // Máy tính bỏ thẻ "chờ chấm đủ điểm" (đã có dòng Lương KPI ở thẻ Thu nhập), trừ khi nhân sự còn tự nhập được điểm Tự đánh giá của mình
    if (!done && skipWait && NV.thay) return '';
    return wrap(kpiFive(sh.data, m, month), 'KPI', d && d.official ? 'Đã chốt cùng phiếu lương' : '');
  };

  // Gõ vào ô Tự đánh giá: nhớ chữ đang gõ để vẽ lại (nạp số mới, đồng hồ) không làm mất
  document.addEventListener('input', ev => {
    const t = ev.target;
    if (t && t.id === 'kpi-self' && t.form) selfDraft[t.form.dataset.month] = t.value;
  });
  document.addEventListener('submit', async ev => {
    const form = ev.target;
    if (!form || form.id !== 'nv-self-form') return;
    ev.preventDefault();
    const month = form.dataset.month;
    const input = form.querySelector('#kpi-self');
    const err = form.querySelector('#kpi-self-err');
    const show = text => (err.innerHTML = text ? NV.noteBox('bad', text) : '');
    const raw = input.value.trim().replace(',', '.');
    show('');
    const v = raw === '' ? NaN : Number(raw);
    if (!Number.isFinite(v) || v < 0 || v > 100 || !/^\d+(\.\d{1,2})?$/.test(raw)) {
      show('Nhập điểm từ 0 đến 100, tối đa 2 chữ số thập phân (ví dụ 85 hoặc 92,5).');
      return input.focus();
    }
    const btn = form.querySelector('#kpi-self-go');
    btn.disabled = true;
    try {
      // Máy chủ chỉ cho nhân sự lưu điểm self của chính mình (user = tài khoản đăng nhập)
      await NV.api('PUT', '/kpi/scores', { month, username: S.me.username, user: S.me.username, scores: { self: v } });
    } catch (e) {
      btn.disabled = false;
      return show(NV.errText(e)); // câu của máy chủ, nguyên văn
    }
    delete selfDraft[month];
    await Promise.all([NV.loadMonth(month, true), NV.loadEstimate(month, true)]);
    NV.render();
    NV.toast('Đã lưu điểm tự đánh giá.');
  });
})(window.NV);
