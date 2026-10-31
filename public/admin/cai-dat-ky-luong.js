/* Cài đặt › Lịch, ca & chấm công. Khung gọi A.CaiDat.renderKyLuong(el)
   và A.CaiDat.sub() (dòng phụ dưới tiêu đề "Cài đặt").
   Dữ liệu: ngày lễ GET/PUT /api/holidays; ngày trả lương là khoá registry period.payDay (lưu qua hộp "Xem trước và lưu" của A.Params.openSave);
   "kỳ công" (fixed.period.cutoff) chỉ đọc vì kỳ lương không theo tháng dương lịch đổi toàn hệ thống; ca làm GET/PUT /api/settings/shifts
   (đọc phòng thủ: chưa có route thì dùng danh sách ca có sẵn, chỉ xem); Check-in luôn bật; vùng chấm công PUT /api/settings/geofence.
   Lý do lưu giờ ca không bắt buộc; đổi ngày lễ hay giờ ca mà máy chủ trả warnings[] (lệch lịch đã khai,
   ca lệch quy tắc, kỳ đã chốt) thì vẫn lưu, cảnh báo hiện nguyên văn trong thẻ tới khi người dùng đóng.
   Không có bản đồ ngoài: sơ đồ tròn vẽ bằng SVG. Giờ ca đang sửa gắn với tháng đang chọn: đổi tháng thì hỏi trước (A.drafts, phạm vi
   'month') rồi nạp lại dữ liệu của tháng mới. Mọi chuỗi từ API qua A.esc() trước khi vào innerHTML. Không tính lương ở đây. */
(function (A) {
  'use strict';
  const { esc, nf, ic, S } = A;

  const KL = {
    host: null,
    state: 'idle',
    err: '',
    year: null,
    saved: [],
    draft: [],
    savedNames: {},
    nameDraft: {},
    namesApi: false,
    payDay: null,
    cutoff: null,
    shifts: null,
    shiftApi: 'unknown',
    shiftDraft: {},
    pick: null,
    geo: null,
    geoDirty: false,
    month: null, // tháng của dữ liệu đang hiện (giờ ca, ngày trả lương theo tháng)
    token: 0,
    holWarn: [], // cảnh báo của lần lưu ngày lễ gần nhất (máy chủ, nguyên văn)
    shiftWarn: [] // cảnh báo của lần lưu giờ ca gần nhất
  };
  /* Cảnh báo máy chủ trả kèm một lần lưu: mục 'danger' còn lên băng đỏ cố định (A.showWarnings); mọi mục hiện trong thẻ tới khi đóng */
  const takeWarnings = res => {
    const list = ((res && res.warnings) || []).filter(w => w && w.message);
    A.showWarnings(list.filter(w => w.severity === 'danger'));
    return list;
  };
  const warnNote = (list, act) =>
    list.length
      ? `<div class="kl-wn" role="status">${ic('alert', 16)}<ul>${list.map(w => `<li>${esc(w.message)}</li>`).join('')}</ul><button type="button" class="btn sm icon ghost" data-act="${act}" aria-label="Đóng cảnh báo">${ic('x', 16)}</button></div>`
      : '';
  A.actions.klholwarnx = () => {
    KL.holWarn = [];
    paint();
  };
  A.actions.klshiftwarnx = () => {
    KL.shiftWarn = [];
    paint();
  };
  /* Khoảng hợp lệ của vùng chấm công (đúng nhãn máy chủ đang kiểm; máy chủ vẫn là nơi quyết định) */
  const GEO = { rMin: 20, rMax: 5000 };
  /* Sơ đồ vùng (chỉ là hình minh hoạ, không phải bản đồ thật): khung 316 × 150, tâm lệch phải */
  const MAP = { w: 316, h: 150, cx: 176, cy: 80, rMinPx: 32, rMaxPx: 72 };
  const WD = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
  const WD_FULL = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
  /* Loại ca theo danh mục ca (kind của máy chủ); KIND_OLD đoán loại từ mã n1…g2 khi máy chủ không gửi kind */
  const KIND = { normal: ['Normal', 'normal'], flex: ['Flex', 'flex'], night: ['Night', 'night'] };
  const KIND_OLD = { n: 'normal', f: 'flex', g: 'night' };

  const pad = n => String(n).padStart(2, '0');
  const caps = () => (A.meInfo && Array.isArray(A.meInfo.caps) ? A.meInfo.caps : null);
  const can = c => !caps() || caps().includes(c);
  const missing = e =>
    !!e && (e.status === 404 || e.status === 405 || (e.status === 403 && e.data && e.data.code === 'NO_ROUTE_POLICY'));
  const yearOf = () => KL.year || S.month.slice(0, 4);
  const entriesOf = res => ((res && res.groups) || []).flatMap(g => g.entries || []);
  const numFrom = (text, re) => {
    const m = re.exec(String(text || ''));
    return m ? Number(m[1]) : null;
  };
  /* Ô của hộp thoại: nhãn đậm 13, phần trong ngoặc chữ nhỏ xám */
  const fld = (id, label, control, small) =>
    `<div class="formrow"><label class="lbl" for="${id}">${esc(label)}${small ? ` <small>${esc(small)}</small>` : ''}</label>${control}</div>`;

  /* ---------- tải ---------- */
  function parseShifts(res) {
    const raw = (res && (res.shifts || res.items || res.presets)) || [];
    const list = Array.isArray(raw) ? raw : Object.entries(raw).map(([code, v]) => ({ code, ...v }));
    return list
      .map(s => ({
        code: String(s.code ?? s.id ?? ''),
        name: s.name || s.label || null,
        kind: s.kind ? String(s.kind) : null,
        in: String(s.in ?? s.from ?? s.start ?? ''),
        out: String(s.out ?? s.to ?? s.end ?? '')
      }))
      .filter(s => s.code && /^\d{2}:\d{2}$/.test(s.in) && /^\d{2}:\d{2}$/.test(s.out));
  }
  /* Đọc ca của một tháng; trả kết quả, không ghi thẳng vào KL (lượt nạp của tháng cũ về muộn không đè tháng mới) */
  async function probeShifts(month) {
    try {
      const res = await A.api('GET', '/settings/shifts' + A.qs({ month }));
      const shifts = parseShifts(res);
      return {
        shifts,
        shiftMeta: {
          editable: res.editable !== false,
          hours: Number.isFinite(Number(res.hours)) ? Number(res.hours) : null,
          rev: res.paramsRev ?? null
        },
        shiftApi: shifts.length ? 'yes' : 'no'
      };
    } catch (e) {
      return { shifts: null, shiftMeta: null, shiftApi: missing(e) ? 'no' : 'fail' };
    }
  }
  const fallbackShifts = () =>
    A.SHIFTS.map(([code, name, a, b, , kind]) => ({ code, name, in: a, out: b, kind: kind || null }));
  const shiftList = () => (KL.shifts && KL.shifts.length ? KL.shifts : fallbackShifts());

  async function load() {
    const month = S.month;
    if (KL.busy === month) return; // đang nạp đúng tháng này; đang nạp tháng khác thì nạp lại, lượt cũ bị bỏ khi về
    KL.busy = month;
    const token = ++KL.token;
    if (KL.state !== 'ok' || KL.month !== month) KL.state = 'loading';
    KL.err = '';
    try {
      const [hol, params, , sh] = await Promise.all([
        A.api('GET', '/holidays'),
        A.api('GET', '/settings/params' + A.qs({ month, group: 1 })).catch(() => null),
        A.refreshMe().catch(() => {}),
        probeShifts(month)
      ]);
      if (token !== KL.token) return;
      if (KL.month !== month) KL.shiftDraft = {}; // giờ ca đang sửa thuộc tháng cũ: đã hỏi trước khi đổi tháng (A.drafts, phạm vi 'month')
      KL.month = month;
      Object.assign(KL, sh);
      const keep = holDirty() ? KL.draft : null; // bản nháp ngày lễ chưa lưu không bị nạp lại đè
      KL.saved = hol.dates || [];
      KL.namesApi = !!hol.names && typeof hol.names === 'object';
      KL.savedNames = KL.namesApi ? { ...hol.names } : {};
      KL.draft = keep || [...KL.saved];
      if (!keep) KL.nameDraft = { ...KL.savedNames };
      const entries = entriesOf(params);
      KL.payDay = entries.find(e => e.id === 'period.payDay') || null;
      KL.cutoff = entries.find(e => e.id === 'fixed.period.cutoff') || null;
      initGeo();
      KL.state = 'ok';
      KL.at = Date.now();
    } catch (e) {
      if (token !== KL.token) return;
      KL.state = 'fail';
      KL.err = A.errText(e);
    } finally {
      if (token === KL.token) KL.busy = false;
    }
  }
  function initGeo() {
    if (KL.geoDirty) return;
    const g = A.meInfo && A.meInfo.geofence;
    KL.geo = {
      lat: g ? g.lat : '',
      lng: g ? g.lng : '',
      r: g ? g.radiusM : '',
      acc: g ? g.maxAccuracyM : 100
    };
  }
  function repaint() {
    if (KL.host && KL.host.isConnected) paint();
  }
  const reload = () =>
    load().then(() => {
      repaint();
    });

  /* ---------- dòng phụ dưới tiêu đề "Cài đặt" ---------- */
  function sub() {
    if (KL.state !== 'ok') return '';
    const y = yearOf();
    const n = KL.draft.filter(d => d.startsWith(y + '-')).length;
    const pay = payDayNo();
    const parts = [`Năm ${esc(y)}`, `<b>${nf(n)} ngày lễ</b>`];
    if (pay) parts.push(`trả lương ngày ${nf(pay)} tháng sau`);
    return parts.join(' · ');
  }
  /* Khung chỉ vẽ dòng phụ khi vẽ cả màn; dữ liệu của trang này về sau đó nên tự cập nhật dòng phụ */
  function syncSub() {
    if (!KL.host || !KL.host.isConnected) return;
    const html = sub();
    const cdx = KL.host.closest('.cdx');
    const p = cdx && cdx.querySelector(':scope > .hdr .sub');
    if (p && html && p.innerHTML !== html) p.innerHTML = html;
  }

  /* ---------- ngày lễ ---------- */
  const payDayNo = () => (KL.payDay && Number.isInteger(Number(KL.payDay.value)) ? Number(KL.payDay.value) : null);
  const startDayNo = () => (KL.cutoff ? numFrom(KL.cutoff.label, /ngày (\d+)/) : null);
  /* Tên chỉ tính cho ngày còn trong bản nháp; chuỗi rỗng là không có tên */
  const namesOf = (names, dates) => Object.fromEntries(dates.filter(d => names[d]).map(d => [d, names[d]]));
  const draftNames = () => namesOf(KL.nameDraft, KL.draft);
  const holDirty = () =>
    JSON.stringify(KL.draft) !== JSON.stringify(KL.saved) ||
    (KL.namesApi && JSON.stringify(draftNames()) !== JSON.stringify(namesOf(KL.savedNames, KL.saved)));
  const NAME_MAX = 60;
  const checkName = v => {
    if (v.length > NAME_MAX) throw new Error(`Tên ngày lễ tối đa ${NAME_MAX} ký tự (hiện có ${v.length}).`);
    if (/[<>]/.test(v)) throw new Error('Tên ngày lễ không được chứa dấu < hoặc >.');
    return v;
  };
  const nextDay = iso => new Date(Date.parse(iso + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);
  /* Gom ngày liền nhau CÙNG TÊN thành một thẻ; ngày liền nhau khác tên thì tách thẻ */
  function ranges(dates, names = {}) {
    const out = [];
    for (const d of [...dates].sort()) {
      const last = out[out.length - 1];
      if (last && nextDay(last.to) === d && (names[last.to] || '') === (names[d] || '')) last.to = d;
      else out.push({ from: d, to: d, name: names[d] || '' });
    }
    return out;
  }
  const dm = iso => `${iso.slice(8)}/${iso.slice(5, 7)}`;

  function monthHtml(y, m, hol) {
    const first = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
    const nd = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const pay = payDayNo(),
      start = startDayNo();
    let cells = WD.map(x => `<span class="kl-wd">${x}</span>`).join('') + '<span></span>'.repeat(first);
    for (let d = 1; d <= nd; d++) {
      const iso = `${y}-${pad(m)}-${pad(d)}`;
      const wd = (first + d - 1) % 7;
      const c = ['kl-d'];
      if (wd === 6) c.push('cn');
      if (hol.has(iso)) {
        c.push('le');
        const prevIn = d > 1 && hol.has(`${y}-${pad(m)}-${pad(d - 1)}`) && wd !== 0;
        const nextIn = d < nd && hol.has(`${y}-${pad(m)}-${pad(d + 1)}`) && wd !== 6;
        if (!prevIn && nextIn) c.push('l1');
        else if (prevIn && nextIn) c.push('lm');
        else if (prevIn && !nextIn) c.push('l2');
      } else if (d === pay) c.push('tra');
      else if (d === start) c.push('bd');
      if (KL.pick && KL.pick.iso === iso) c.push('pick');
      cells += `<button type="button" class="${c.join(' ')}" data-act="klpick" data-iso="${iso}" aria-label="${pad(d)}/${pad(m)}/${y}${hol.has(iso) ? ', ngày lễ' : ''}"><i>${d}</i></button>`;
    }
    return `<div class="kl-mm"><h4>Tháng ${m}</h4><div class="kl-g">${cells}</div></div>`;
  }

  function popHtml() {
    const p = KL.pick;
    if (!p) return '';
    const d = Number(p.iso.slice(8));
    const wd = A.dowOf(p.iso);
    const isHol = KL.draft.includes(p.iso);
    const editHol = can('config.payroll');
    const pd = KL.payDay;
    const payOk = !!pd && pd.wired === true && !pd.readOnly && can(pd.writeCapability || 'config.payroll');
    const same = payDayNo() === d;
    const style = `left:${Math.round(p.x)}px;top:${Math.round(p.y)}px`;
    const holName = KL.nameDraft[p.iso] ? ' ' + KL.nameDraft[p.iso] : '';
    return `<div class="kl-pop" role="menu" style="${style}"><span class="kl-pt">${esc(WD_FULL[wd])}, ${esc(A.fmtDate(p.iso))}</span>
<button type="button" class="o" role="menuitem" data-act="klhol" data-iso="${esc(p.iso)}" ${editHol ? '' : 'disabled'}><span class="kl-mk le"></span><span>${isHol ? esc('Bỏ ngày lễ' + holName) : 'Đặt làm ngày lễ'}</span></button>
<button type="button" class="o" role="menuitem" data-act="klpay" data-d="${d}" ${payOk && d <= 28 && !same ? '' : 'disabled'}><span class="kl-mk tra">${d}</span><span>${d <= 28 ? `Trả lương ngày ${d} hằng tháng` : 'Ngày trả lương chỉ từ 1 đến 28'}</span></button>
<button type="button" class="o" role="menuitem" disabled><span class="kl-mk bd">${d}</span><span>${d <= 28 ? `Bắt đầu tính công từ ngày ${d}` : 'Ngày bắt đầu chỉ từ 1 đến 28'}</span></button></div>`;
  }

  A.actions.klpick = (el, ev) => {
    const iso = el.dataset.iso;
    if (KL.pick && KL.pick.iso === iso) KL.pick = null;
    else {
      const r = el.getBoundingClientRect();
      const w = 300;
      const x = Math.min(Math.max(8, r.left), window.innerWidth - w - 8);
      const below = window.innerHeight - r.bottom > 200;
      KL.pick = { iso, x, y: below ? r.bottom + 6 : Math.max(8, r.top - 190) };
    }
    if (ev) ev.stopPropagation();
    paint();
    const o = KL.host && KL.host.querySelector('.kl-pop .o:not([disabled])');
    if (o && ev && ev.detail === 0) o.focus(); // mở bằng bàn phím thì đưa tiêu điểm vào menu
  };
  document.addEventListener('click', ev => {
    if (KL.pick && !ev.target.closest('.kl-pop') && !ev.target.closest('.kl-d')) {
      KL.pick = null;
      repaint();
    }
  });
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape' && KL.pick) {
      KL.pick = null;
      repaint();
    }
  });
  window.addEventListener(
    'scroll',
    () => {
      if (KL.pick) {
        KL.pick = null;
        repaint();
      }
    },
    true
  );

  const nameField = (id, value = '') =>
    KL.namesApi
      ? fld(
          id,
          'Tên ngày lễ',
          `<input id="${id}" class="input" maxlength="${NAME_MAX}" value="${esc(value)}" autocomplete="off" placeholder="Ví dụ: Giỗ Tổ Hùng Vương">`
        )
      : '';
  const readName = api => (KL.namesApi ? checkName(api.root.querySelector('#kl-hn').value.trim()) : '');
  /* Câu phụ của hộp ngày lễ: hệ số làm ngày lễ đọc từ registry (ot.holidayRate) khi kho tham số đã nạp; chưa có thì không ghi số */
  const holSub = y => {
    let rate;
    try {
      rate = A.Khung && A.Khung.valueOf ? A.Khung.valueOf('ot.holidayRate') : undefined;
    } catch {
      rate = undefined; // kho tham số chưa nạp
    }
    return `Năm ${y} · ngày lễ được trả lương${typeof rate === 'number' ? ` và làm việc ngày này tính hệ số ×${nf(rate)}` : ''}`;
  };
  /* Mỗi thay đổi ngày lễ lưu ngay khi xác nhận hộp thoại của nó. Bản nháp chỉ đổi sau khi máy chủ nhận
     (lỗi 409/423... ném ra để hộp thoại hiện nguyên văn), nên màn hình không bao giờ hiện ngày lễ chưa lưu như đã lưu. */
  async function saveHolidays(dates, names) {
    const list = [...new Set(dates)].sort();
    const sentNames = namesOf(names, list);
    const res = await A.api(
      'PUT',
      '/holidays',
      { dates: list, ...(KL.namesApi ? { names: sentNames } : {}) },
      { warnings: 'manual' }
    );
    KL.saved = res.dates;
    KL.draft = [...res.dates];
    KL.savedNames = KL.namesApi ? { ...(res.names || sentNames) } : {};
    KL.nameDraft = { ...KL.savedNames };
    KL.holWarn = takeWarnings(res); // đổi ngày lễ đè lên lịch đã khai vẫn lưu, cảnh báo ở lại trong thẻ Lịch năm
    await A.refreshMe().catch(() => {});
    A.toast(
      KL.holWarn.length ? `Đã lưu ngày lễ, kèm ${KL.holWarn.length} cảnh báo trong thẻ Lịch năm` : 'Đã lưu ngày lễ',
      KL.holWarn.length ? 'warn' : undefined
    );
    paint();
  }
  const dropHolidays = (from, to) => {
    const names = { ...KL.nameDraft };
    for (const d of Object.keys(names)) if (d >= from && d <= to) delete names[d];
    return saveHolidays(
      KL.draft.filter(d => d < from || d > to),
      names
    );
  };
  const confirmDrop = (from, to) =>
    A.confirmDialog({
      title: 'Bỏ ngày lễ',
      sub: from === to ? A.fmtDate(from) : `${A.fmtDate(from)} đến ${A.fmtDate(to)}`,
      body: A.note(
        'Ngày bỏ khỏi danh sách lễ sẽ được lưu ngay và tính như ngày thường từ bây giờ. Kỳ lương đã chốt vẫn đổi được, kèm cảnh báo.',
        'alert'
      ),
      label: 'Bỏ ngày lễ',
      cls: 'danger',
      onConfirm: () => dropHolidays(from, to)
    });
  A.actions.klhol = el => {
    const iso = el.dataset.iso;
    KL.pick = null;
    if (KL.draft.includes(iso)) {
      paint();
      confirmDrop(iso, iso);
      return;
    }
    paint();
    A.openDialog({
      title: 'Đặt làm ngày lễ',
      sub: `${A.fmtDate(iso)} · ngày lễ được trả lương`,
      width: 560,
      cls: 'cdv-dlg',
      body: nameField('kl-hn'),
      foot: [
        { label: 'Huỷ' },
        {
          label: 'Đặt làm ngày lễ',
          cls: 'pri',
          icon: 'check',
          onClick: api => {
            const name = readName(api);
            return saveHolidays([...KL.draft, iso], name ? { ...KL.nameDraft, [iso]: name } : KL.nameDraft).then(() =>
              api.close()
            );
          }
        }
      ]
    });
  };
  /* Đặt hay đổi tên cho cả một thẻ ngày lễ */
  A.actions.klholname = el => {
    const from = el.dataset.from,
      to = el.dataset.to;
    A.openDialog({
      title: 'Tên ngày lễ',
      sub: from === to ? A.fmtDate(from) : `${A.fmtDate(from)} đến ${A.fmtDate(to)}`,
      width: 560,
      cls: 'cdv-dlg',
      body: nameField('kl-hn', KL.nameDraft[from] || ''),
      foot: [
        { label: 'Huỷ' },
        {
          label: 'Lưu tên',
          cls: 'pri',
          icon: 'check',
          onClick: api => {
            const name = readName(api);
            const names = { ...KL.nameDraft };
            for (const d of KL.draft) {
              if (d < from || d > to) continue;
              if (name) names[d] = name;
              else delete names[d];
            }
            return saveHolidays(KL.draft, names).then(() => api.close());
          }
        }
      ]
    });
  };
  A.actions.klpay = el => {
    const n = Number(el.dataset.d);
    KL.pick = null;
    paint();
    if (!A.Params || !A.Params.openSave) return A.toast('Đang cập nhật: hộp lưu tham số chưa sẵn sàng.', 'err');
    A.Params.openSave(
      [
        {
          key: 'period.payDay',
          value: n,
          label: KL.payDay.label,
          before: `ngày ${KL.payDay.value}`,
          after: `ngày ${n}`
        }
      ],
      { onSaved: () => reload() }
    );
  };
  A.actions.kladv = () => {
    KL.adv = !KL.adv;
    paint();
  };
  A.actions.klyear = el => {
    KL.year = String(Number(yearOf()) + Number(el.dataset.d));
    KL.pick = null;
    paint();
  };
  A.actions.klholdel = el => {
    confirmDrop(el.dataset.from, el.dataset.to);
  };
  A.actions.klholundo = () => {
    KL.draft = [...KL.saved];
    KL.nameDraft = { ...KL.savedNames };
    paint();
  };
  A.actions.kladdhol = () => {
    const y = yearOf();
    A.openDialog({
      title: 'Thêm ngày lễ',
      sub: holSub(y),
      width: 560,
      cls: 'cdv-dlg',
      body: `<div class="cdv-g2">${fld('kl-hf', 'Từ ngày', '<input id="kl-hf" class="input" type="date">')}${fld('kl-ht', 'Đến ngày', '<input id="kl-ht" class="input" type="date">', '(nếu nghỉ nhiều ngày)')}</div>
${nameField('kl-hn')}`,
      foot: [
        { label: 'Huỷ' },
        {
          label: 'Thêm ngày lễ',
          cls: 'pri',
          icon: 'plus',
          onClick: api => {
            const a = api.root.querySelector('#kl-hf').value,
              b = api.root.querySelector('#kl-ht').value || a;
            if (!/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(b)) throw new Error('Chọn ngày hợp lệ.');
            if (b < a) throw new Error('Ngày kết thúc không được trước ngày bắt đầu.');
            const add = [];
            for (let d = a, n = 0; d <= b && n < 31; d = nextDay(d), n++) add.push(d);
            if (b > add[add.length - 1]) throw new Error('Một lần thêm tối đa 31 ngày liên tiếp.');
            const name = readName(api);
            const names = { ...KL.nameDraft };
            if (name) for (const d of add) names[d] = name;
            return saveHolidays([...KL.draft, ...add], names).then(() => {
              KL.year = a.slice(0, 4);
              api.close();
              paint();
            });
          }
        }
      ]
    });
  };
  function calendarCard() {
    const y = Number(yearOf());
    const hol = new Set(KL.draft);
    const inYear = KL.draft.filter(d => d.startsWith(y + '-'));
    const editHol = can('config.payroll');
    const pay = payDayNo(),
      start = startDayNo();
    const chips = ranges(inYear, KL.nameDraft)
      .map(r => {
        const label = r.from === r.to ? dm(r.from) : `${dm(r.from)} – ${dm(r.to)}`;
        const inner = `<b>${esc(label)}</b>${r.name ? `<span class="nm">${esc(r.name)}</span>` : ''}`;
        const body =
          editHol && KL.namesApi
            ? `<button type="button" class="kl-hn" data-act="klholname" data-from="${esc(r.from)}" data-to="${esc(r.to)}" aria-label="Đặt tên cho ngày lễ ${esc(label)}">${inner}</button>`
            : inner;
        return `<span class="kl-hi">${body}${editHol ? `<button type="button" class="kl-hx" data-act="klholdel" data-from="${esc(r.from)}" data-to="${esc(r.to)}" aria-label="Bỏ ngày lễ ${esc(label)}">${ic('x', 12, 2)}</button>` : ''}</span>`;
      })
      .join('');
    /* Chú thích: chỉ ghi số đọc được từ máy chủ (kỳ công, ngày trả lương); chưa đọc được thì bỏ mục đó */
    const legend = `<div class="kl-lgd">${start ? `<span><span class="kl-mk bd">${nf(start)}</span>Bắt đầu tính công: <b>ngày ${nf(start)}</b> hằng tháng</span>` : ''}${pay ? `<span><span class="kl-mk tra">${nf(pay)}</span>Trả lương: <b>ngày ${nf(pay)}</b> tháng sau</span>` : ''}<span><span class="kl-mk le"></span>Ngày lễ: <b>${nf(inYear.length)} ngày</b></span></div>`;
    return `<section class="card flush kl-yc"><div class="card-h kl-top"><h2>Lịch năm</h2><span class="kl-ysw"><button type="button" data-act="klyear" data-d="-1" aria-label="Năm trước">${ic('chevl', 14)}</button><b>${y}</b><button type="button" data-act="klyear" data-d="1" aria-label="Năm sau">${ic('chevr', 14)}</button></span>${legend}</div>
<p class="kl-hint">Bấm vào một ngày để đặt ngày lễ, ngày trả lương hoặc ngày bắt đầu tính công</p>
<div class="kl-yg">${Array.from({ length: 12 }, (_, i) => monthHtml(y, i + 1, hol)).join('')}</div>
<div class="kl-hl">${chips || `<span class="cap">Chưa có ngày lễ năm ${y}. Bấm vào một ngày trên lịch để thêm.</span>`}${editHol ? `<button type="button" class="kl-add" data-act="kladdhol">${ic('plus', 14)}Thêm ngày lễ</button>` : ''}</div>
${warnNote(KL.holWarn, 'klholwarnx')}${KL.pick ? popHtml() : ''}</section>`;
  }

  /* ---------- ca làm ---------- */
  const shiftKind = s => {
    const row = A.shiftOf(s.code);
    const kind = s.kind || (row && row[5]) || KIND_OLD[String(s.code)[0]];
    return KIND[kind] || [kind ? String(kind) : '—', 'normal'];
  };
  /* Đổi tên, loại ca: hộp ở catalog-shifts.js (danh mục ca), giờ ca vẫn sửa trong bảng này */
  A.actions.klshiftcat = el => A.CatalogShifts && A.CatalogShifts.open(el.dataset.c);
  A.inputs.klshift = el => {
    const code = el.dataset.c,
      f = el.dataset.f;
    const base = shiftList().find(s => s.code === code);
    KL.shiftDraft[code] = { in: base.in, out: base.out, ...KL.shiftDraft[code], [f]: el.value };
    const row = el.closest('tr');
    const hrs = KL.shiftMeta && KL.shiftMeta.hours;
    if (f === 'in' && hrs && /^\d{2}:\d{2}$/.test(el.value)) {
      /* Máy chủ khai độ dài ca (hours): giờ ra tự theo giờ vào, vẫn sửa tay được */
      const m = (Number(el.value.slice(0, 2)) * 60 + Number(el.value.slice(3)) + hrs * 60) % 1440;
      KL.shiftDraft[code].out = String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
      const outEl = row && row.querySelector('[data-f="out"]');
      if (outEl) outEl.value = KL.shiftDraft[code].out;
    }
    const d = KL.shiftDraft[code];
    if (d.in === base.in && d.out === base.out) delete KL.shiftDraft[code];
    const nx = row && row.querySelector('.kl-nx');
    if (nx) nx.hidden = !(d.out && d.in && d.out < d.in);
    const bar = KL.host && KL.host.querySelector('#kl-shiftbar');
    /* Chỉ vẽ lại khi nội dung đổi: ô giờ mất tiêu điểm khi bấm Lưu mà thay nút giữa lúc bấm thì cú bấm bị mất */
    const html = shiftBar();
    if (bar && bar.innerHTML !== html) bar.innerHTML = html;
    if (bar) bar.hidden = !html;
  };
  const shiftBar = () => {
    const n = Object.keys(KL.shiftDraft).length;
    return n
      ? `${A.pill('pending', `Chưa lưu · ${n} ca`)}<span class="sp"></span><button type="button" class="btn sm" data-act="klshiftundo">Bỏ thay đổi</button><button type="button" class="btn pri sm" data-act="klshiftsave">Lưu giờ ca</button>`
      : '';
  };
  A.actions.klshiftundo = () => {
    KL.shiftDraft = {};
    paint();
  };
  A.actions.klshiftsave = () => {
    const changes = Object.entries(KL.shiftDraft).map(([code, v]) => ({ code, in: v.in, out: v.out }));
    if (!changes.length) return;
    if (changes.some(c => !/^\d{2}:\d{2}$/.test(c.in) || !/^\d{2}:\d{2}$/.test(c.out)))
      return A.toast('Nhập đủ giờ vào và giờ ra của ca.', 'err');
    const list = changes
      .map(c => {
        const b = shiftList().find(s => s.code === c.code);
        return `<li><b>${esc(b.name || c.code)}</b>: ${esc(b.in)}–${esc(b.out)} → ${esc(c.in)}–${esc(c.out)}</li>`;
      })
      .join('');
    A.openDialog({
      title: 'Lưu giờ ca làm',
      sub: `${changes.length} ca · Lịch, ca & chấm công`,
      width: 560,
      cls: 'cdv-dlg',
      body: `<ul class="sv-list">${list}</ul>
${fld('kl-sm', 'Áp dụng từ tháng', `<input id="kl-sm" class="input" type="month" value="${esc(S.month)}" style="max-width:220px">`)}
${fld('kl-sr', 'Lý do', '<textarea id="kl-sr" class="input" maxlength="300" placeholder="Ghi rõ lý do để lưu vào nhật ký"></textarea>', '(không bắt buộc)')}`,
      foot: [
        { label: 'Huỷ' },
        {
          label: 'Lưu giờ ca',
          cls: 'pri',
          icon: 'check',
          onClick: async api => {
            const month = api.root.querySelector('#kl-sm').value;
            const reason = api.root.querySelector('#kl-sr').value.trim();
            if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('Chọn tháng áp dụng.');
            // lý do không bắt buộc, chỉ giữ trần độ dài
            if (reason.length > 300) throw new Error(`Lý do tối đa 300 ký tự (hiện có ${reason.length}).`);
            let res;
            try {
              res = await A.api(
                'PUT',
                '/settings/shifts',
                {
                  shifts: changes,
                  effectiveMonth: month,
                  reason,
                  ...(KL.shiftMeta && KL.shiftMeta.rev !== null ? { expectedRev: KL.shiftMeta.rev } : {})
                },
                { warnings: 'manual' }
              );
            } catch (e) {
              if (missing(e)) throw new Error('Đang cập nhật: máy chủ chưa nhận việc lưu giờ ca.');
              if (e && e.status === 409 && !(e.data && e.data.code === 'SHIFT_EDIT_NOT_ALLOWED')) reload(); // số phiên bản cũ: nạp lại sau hộp thoại
              throw e; // câu của máy chủ hiện nguyên văn
            }
            api.close();
            KL.shiftDraft = {};
            KL.shiftWarn = takeWarnings(res); // ca lệch quy tắc (độ dài, loại ca) vẫn lưu: cảnh báo ở lại trong thẻ Ca làm
            A.toast(
              `Đã lưu giờ ca, áp dụng từ ${A.monthLabel(month)}${KL.shiftWarn.length ? `, kèm ${KL.shiftWarn.length} cảnh báo trong thẻ Ca làm` : ''}`,
              KL.shiftWarn.length ? 'warn' : undefined
            );
            await A.shiftsLoad(S.month).catch(() => {}); // bảng giờ ca dùng chung (A.SHIFTS) nạp lại ngay, không chờ sự kiện máy chủ
            await reload();
          }
        }
      ]
    });
  };
  function shiftCard() {
    const locked = KL.shiftApi === 'yes' && KL.shiftMeta && KL.shiftMeta.editable === false;
    const editable = KL.shiftApi === 'yes' && !locked && can('config.payroll');
    const list = shiftList();
    const catEdit = can('config.payroll') && !!A.CatalogShifts; // danh mục ca có đường riêng, không phụ thuộc quyền sửa giờ ca
    const rows = list
      .map(s => {
        const d = KL.shiftDraft[s.code] || s;
        const [kn, kc] = shiftKind(s);
        const dis = editable ? '' : 'disabled';
        const nm = s.name || s.code;
        return `<tr><td data-label="Tên ca"><input class="input kl-nm" type="text" value="${esc(nm)}" aria-label="Tên ca" readonly tabindex="-1"></td>
<td data-label="Giờ vào"><input class="input kl-t" type="text" inputmode="numeric" maxlength="5" value="${esc(d.in)}" data-input="klshift" data-c="${esc(s.code)}" data-f="in" aria-label="Giờ vào ${esc(nm)}" ${dis}></td>
<td data-label="Giờ ra"><span class="kl-out"><input class="input kl-t" type="text" inputmode="numeric" maxlength="5" value="${esc(d.out)}" data-input="klshift" data-c="${esc(s.code)}" data-f="out" aria-label="Giờ ra ${esc(nm)}" ${dis}><span class="kl-nx" ${d.out < d.in ? '' : 'hidden'}>hôm sau</span></span></td>
<td data-label="Loại"><span class="kl-kd"><i class="k-${esc(kc)}"></i>${esc(kn)}</span></td>${catEdit ? `<td class="kl-act"><button type="button" class="btn sm icon ghost" data-act="klshiftcat" data-c="${esc(s.code)}" title="Đổi tên, loại" aria-label="Đổi tên, loại ca ${esc(nm)}">${ic('edit', 16)}</button></td>` : ''}</tr>`;
      })
      .join('');
    const note = locked
      ? ' · chỉ sửa được ở môi trường thử'
      : KL.shiftApi === 'yes'
        ? ''
        : ' · chỉ xem (máy chủ chưa cho sửa giờ ca)';
    const bar = shiftBar();
    return `<section class="card flush kl-ca"><div class="card-h"><h2>Ca làm</h2><span class="cap">${nf(list.length)} ca${esc(note)}</span><span class="end"><button type="button" class="btn sm" disabled title="Máy chủ chưa hỗ trợ thêm ca">${ic('plus', 16)}Thêm ca</button></span></div>
<div class="kl-tw"><table class="rtable kl-st"><colgroup><col><col class="c-in"><col class="c-out"><col class="c-kd">${catEdit ? '<col class="c-act">' : ''}</colgroup><thead><tr><th>Tên ca</th><th>Giờ vào</th><th>Giờ ra</th><th>Loại</th>${catEdit ? '<th><span class="sr">Thao tác</span></th>' : ''}</tr></thead><tbody>${rows}</tbody></table></div>
${warnNote(KL.shiftWarn, 'klshiftwarnx')}<div class="card-f kl-sbar" id="kl-shiftbar" ${bar ? '' : 'hidden'}>${bar}</div></section>`;
  }

  /* ---------- chấm công ---------- */
  const rpx = r => {
    const t = Math.sqrt(Math.max(0, Math.min(1, (Number(r) - GEO.rMin) / (GEO.rMax - GEO.rMin))));
    return MAP.rMinPx + (MAP.rMaxPx - MAP.rMinPx) * t;
  };
  const rOfPx = px => {
    const t = Math.max(0, Math.min(1, (px - MAP.rMinPx) / (MAP.rMaxPx - MAP.rMinPx)));
    return Math.round(GEO.rMin + (GEO.rMax - GEO.rMin) * t * t);
  };
  function mapSvg() {
    const g = KL.geo || {};
    const has = Number.isFinite(Number(g.r)) && g.r !== '';
    const { cx, cy } = MAP;
    const px = has ? rpx(g.r) : 0;
    return `<svg class="kl-svg" viewBox="0 0 ${MAP.w} ${MAP.h}" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Sơ đồ vùng chấm công${has ? `, bán kính ${esc(g.r)} mét` : ', chưa đặt'}"><rect width="${MAP.w}" height="${MAP.h}" class="kl-gr"/><path class="kl-rd1" d="M0 40H316M0 104H316M58 0V150M150 0V150M244 0V150"/><path class="kl-rd2" d="M0 72H316M104 0V150M198 0V150"/>
${has ? `<circle cx="${cx}" cy="${cy}" r="${px.toFixed(1)}" class="kl-circ"/><circle cx="${cx}" cy="${cy}" r="8" class="kl-ctr"/><circle cx="${cx}" cy="${cy}" r="3" class="kl-ctr2"/><circle cx="${(cx + px).toFixed(1)}" cy="${cy}" r="6" class="kl-hnd" data-kl-handle="1" tabindex="0" role="slider" aria-label="Bán kính" aria-valuenow="${esc(g.r)}" aria-valuemin="${GEO.rMin}" aria-valuemax="${GEO.rMax}"/>` : ''}</svg>`;
  }
  const geoNow = () => KL.geo || { lat: '', lng: '', r: '', acc: '' };
  A.inputs.klgeo = el => {
    const was = KL.geoDirty;
    KL.geo = { ...geoNow(), [el.dataset.f]: el.value };
    KL.geoDirty = true;
    const m = KL.host && KL.host.querySelector('#kl-map');
    if (m) m.innerHTML = mapSvg();
    if (!was) repaint(); // hiện nút Lưu vùng
  };
  let drag = null;
  /* Toạ độ con trỏ trong hệ toạ độ của sơ đồ (đúng cả khi khung co giãn) */
  const svgX = (svg, ev) => {
    const ctm = svg.getScreenCTM();
    if (!ctm) return MAP.cx;
    const pt = svg.createSVGPoint();
    pt.x = ev.clientX;
    pt.y = ev.clientY;
    return pt.matrixTransform(ctm.inverse()).x;
  };
  document.addEventListener('pointerdown', ev => {
    const h = ev.target.closest && ev.target.closest('[data-kl-handle]');
    if (!h || !can('config.payroll')) return;
    drag = { svg: h.ownerSVGElement };
    ev.preventDefault();
  });
  document.addEventListener('pointermove', ev => {
    if (!drag || !KL.host) return;
    KL.geo = { ...geoNow(), r: rOfPx(Math.abs(svgX(drag.svg, ev) - MAP.cx)) };
    KL.geoDirty = true;
    const box = KL.host.querySelector('#kl-map');
    if (!box) return;
    box.innerHTML = mapSvg();
    drag.svg = box.querySelector('svg');
    const inp = KL.host.querySelector('#kl-rad');
    if (inp) inp.value = KL.geo.r;
  });
  document.addEventListener('pointerup', () => {
    if (drag) {
      drag = null;
      repaint();
    }
  });
  A.actions.klhere = el => {
    if (!navigator.geolocation) return A.toast('Trình duyệt này không cho lấy vị trí.', 'err');
    el.disabled = true;
    navigator.geolocation.getCurrentPosition(
      pos => {
        el.disabled = false;
        KL.geo = {
          ...geoNow(),
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6))
        };
        KL.geoDirty = true;
        A.toast('Đã lấy vị trí hiện tại làm tâm vùng. Bấm "Lưu vùng" để ghi.');
        repaint();
      },
      () => {
        el.disabled = false;
        A.toast('Không lấy được vị trí. Kiểm tra quyền vị trí của trình duyệt hoặc nhập toạ độ tay.', 'err');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };
  A.actions.klgeoundo = () => {
    KL.geoDirty = false;
    initGeo();
    paint();
  };
  A.actions.klgeosave = el => {
    const off = el.dataset.off === '1';
    const g = geoNow();
    const body = off
      ? null
      : { lat: Number(g.lat), lng: Number(g.lng), radiusM: Number(g.r), maxAccuracyM: Number(g.acc) };
    if (
      !off &&
      (g.lat === '' || g.lng === '' || g.r === '' || g.acc === '' || Object.values(body).some(n => !Number.isFinite(n)))
    )
      return A.toast('Nhập đủ vĩ độ, kinh độ, bán kính và độ chính xác tối đa.', 'err');
    A.confirmDialog({
      title: off ? 'Tắt kiểm vị trí GPS' : 'Lưu vùng chấm công',
      sub: off ? 'Check-in không cần định vị' : 'Đánh dấu Check-in ngoài vùng công ty',
      body: A.note(
        off
          ? 'Nhân viên Check-in được ở mọi nơi. Vị trí không bao giờ được lưu, chỉ so với vùng này.'
          : // Check-in ngoài vùng vẫn nhận, lượt đó mang cờ ngoài vùng (outsideZone)
            'Nhân viên ngoài bán kính này vẫn Check-in được, lượt đó được đánh dấu ngoài vùng. Máy chủ chỉ kiểm vị trí, không lưu toạ độ của nhân viên.',
        'alert'
      ),
      label: off ? 'Tắt kiểm GPS' : 'Lưu vùng',
      cls: off ? 'danger' : 'pri',
      onConfirm: async () => {
        await A.api('PUT', '/settings/geofence', body);
        KL.geoDirty = false;
        await A.refreshMe().catch(() => {});
        initGeo();
        A.refreshShell();
        A.toast(off ? 'Đã tắt kiểm GPS' : 'Đã lưu vùng chấm công');
        paint();
      }
    });
  };
  function attendCard() {
    const me = A.meInfo || {};
    const g = geoNow();
    const editCfg = can('config.payroll');
    const dis = editCfg ? '' : 'disabled';
    const ck = '';
    const geoOn = !!(me.geofence || me.geofenceRequired); // máy chủ đang kiểm vị trí khi Check-in
    const adv = KL.adv
      ? `<div class="kl-rad"><label for="kl-acc">Độ chính xác GPS tối đa</label><span class="kl-fi"><input id="kl-acc" inputmode="numeric" value="${esc(g.acc)}" data-input="klgeo" data-f="acc" ${dis}><i>m</i></span></div>`
      : '';
    const save =
      editCfg && KL.geoDirty
        ? `<div class="kl-gsave">${A.pill('pending', 'Chưa lưu')}<span class="sp"></span><button class="btn sm" type="button" data-act="klgeoundo">Bỏ thay đổi</button><button class="btn pri sm" type="button" data-act="klgeosave" data-off="0">Lưu vùng</button></div>`
        : '';
    /* Ghim tâm vùng không kéo được: tâm đặt bằng ô vĩ độ, kinh độ hoặc "Dùng vị trí hiện tại"; chỉ chấm trên vòng tròn kéo được (bán kính) */
    const off =
      editCfg && geoOn
        ? '<div class="kl-gsave"><span class="sp"></span><button class="btn sm" type="button" data-act="klgeosave" data-off="1">Tắt kiểm GPS</button></div>'
        : '';
    return `<section class="card flush kl-cc"><div class="card-h"><h2>Chấm công</h2></div><div class="kl-ccb">${ck}
<h3 class="kl-h3">Vùng chấm công</h3><p class="kl-note kl-gst" role="status">${geoOn ? '<b>Đang kiểm vị trí:</b> nhân viên ngoài vùng vẫn Check-in được, lượt đó được đánh dấu ngoài vùng.' : '<b>Đang tắt kiểm vị trí:</b> nhân viên Check-in được ở mọi nơi.'}</p>
<div id="kl-map" class="kl-map">${mapSvg()}</div>
<div class="kl-ll"><div class="kl-rad"><label for="kl-lat">Vĩ độ</label><span class="kl-fi w"><input id="kl-lat" inputmode="decimal" value="${esc(g.lat)}" data-input="klgeo" data-f="lat" ${dis}></span></div><div class="kl-rad"><label for="kl-lng">Kinh độ</label><span class="kl-fi w"><input id="kl-lng" inputmode="decimal" value="${esc(g.lng)}" data-input="klgeo" data-f="lng" ${dis}></span></div></div>
<div class="kl-rad"><label for="kl-rad">Bán kính</label><span class="kl-fi"><input id="kl-rad" inputmode="numeric" value="${esc(g.r)}" data-input="klgeo" data-f="r" ${dis}><i>m</i></span>${editCfg ? `<button class="btn sm" type="button" data-act="klhere">${ic('pin', 16)}Dùng vị trí hiện tại</button>` : ''}</div>
<p class="kl-note">Nhập toạ độ tâm vùng hoặc bấm “Dùng vị trí hiện tại”, kéo chấm trên vòng tròn để đổi bán kính · <button type="button" class="link" data-act="kladv" aria-expanded="${KL.adv ? 'true' : 'false'}">Độ chính xác GPS tối đa</button></p>
${adv}${save}${off}</div></section>`;
  }

  function paint() {
    if (!KL.host) return;
    const a = document.activeElement;
    const keep = a && KL.host.contains(a) && a.id ? a.id : null;
    const sel = keep && a.selectionStart != null ? [a.selectionStart, a.selectionEnd] : null;
    if (KL.state === 'idle' || KL.state === 'loading') {
      KL.host.innerHTML = `<section class="card" aria-busy="true"><div class="skel" style="width:40%"></div><div class="skel" style="width:90%;height:160px"></div></section>`;
      return;
    }
    if (KL.state === 'fail') {
      KL.host.innerHTML = `<section class="card">${A.errorBox(KL.err)}</section>`;
      return;
    }
    KL.host.innerHTML = `<div class="kl-root">${calendarCard()}<div class="kl-b2">${shiftCard()}${attendCard()}</div></div>`;
    syncSub();
    if (keep) {
      const n = document.getElementById(keep);
      if (n) {
        n.focus({ preventScroll: true });
        if (sel && n.setSelectionRange) {
          try {
            n.setSelectionRange(sel[0], sel[1]);
          } catch {
            /* ô không hỗ trợ chọn */
          }
        }
      }
    }
  }

  /* Khung gọi với phần tử nội dung; gọi không có phần tử thì trả chỗ giữ chỗ và tự vẽ vào đó ngay sau. */
  function renderKyLuong(el) {
    if (!(el instanceof Element)) {
      setTimeout(() => {
        const h = document.getElementById('kl-host');
        if (h) renderKyLuong(h);
      }, 0);
      return '<div id="kl-host"></div>';
    }
    KL.host = el;
    if (KL.state === 'idle' || KL.state === 'fail' || (KL.state === 'ok' && KL.month !== S.month)) {
      if (KL.state === 'ok') KL.state = 'loading'; // tháng ở thanh trên đã đổi: không hiện số của tháng cũ
      paint();
      load().then(repaint);
    } else if (KL.state === 'loading') {
      paint();
      if (KL.busy !== S.month) load().then(repaint); // đang nạp tháng cũ: nạp tháng mới, lượt cũ bị bỏ
    } else {
      paint();
      /* Vào lại màn sau một lúc: nạp ngầm để không hiện số cũ (không đè bản nháp đang sửa) */
      if (Date.now() - (KL.at || 0) > 20000 && !holDirty() && !Object.keys(KL.shiftDraft).length) {
        KL.at = Date.now();
        reload();
      }
    }
  }
  /* Đổi tháng ở thanh trên (khung gọi qua onMonth, sau khi đã hỏi về bản nháp): bỏ giờ ca đang sửa của tháng cũ, nạp lại */
  const resetKyLuong = () => {
    KL.state = 'idle';
    KL.shiftDraft = {};
    KL.shiftWarn = [];
    KL.pick = null;
  };

  /* Giờ ca đang sửa gắn với tháng: đổi tháng thì hỏi trước (phạm vi 'month'). Vùng chấm công không theo tháng: chỉ tính cho cảnh báo rời trang. */
  A.drafts.register('ky-luong', () => Object.keys(KL.shiftDraft).length, ['month']);
  A.drafts.register('ky-luong-vung', () => (KL.geoDirty ? 1 : 0));

  A.CaiDat = Object.assign(A.CaiDat || {}, { renderKyLuong, resetKyLuong, reloadKyLuong: reload, sub });
})(window.Admin);
