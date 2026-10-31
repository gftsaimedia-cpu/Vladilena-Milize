/* Cài đặt › Cách tính lương: bảng tám khoản đọc từ trên xuống như một phiếu lương (khoản, cách tính hiện hành),
   "Sửa" mở ngăn kéo bên phải của khoản đó. Mọi con số hiện ra (hệ số, phút, tỷ lệ, lương bậc…) đọc từ danh mục tham số
   của máy chủ (registry) qua view-tham-so.js / view-khung-luong.js.
   Không có số nghiệp vụ, không có phép tính lương ở đây. Lưu đi qua đúng nút "Xem trước và lưu" (PUT /api/settings/params).
   Ngăn kéo vẽ cùng màn (không dùng A.openDialog) để hộp "Xem trước và lưu" mở chồng lên được và ô đang gõ không mất khi vẽ lại.
   Mọi chuỗi từ API và từ người dùng qua A.esc(). */
(function (A) {
  'use strict';
  const { esc, ic, S } = A;
  const kt = () => A.PxKit;
  const kh = () => A.Khung;

  /* ---------- hằng của giao diện (nhãn hiển thị) ---------- */
  const TILES = [
    ['1', 'Lương cơ bản', '+'],
    ['2', 'Tiền làm thêm giờ', '+'],
    ['3', 'Phụ cấp', '+'],
    ['4', 'Lương KPI', '+'],
    ['5', 'Khấu trừ đi muộn, về sớm', '−'],
    ['6', 'Tạm ứng', '−'],
    ['7', 'Bảo hiểm', '−'],
    ['8', 'Thuế TNCN', '−']
  ];
  const isLaw = id => id === '7' || id === '8';
  const DRAWER_IDS = new Set(['1', '2', '3', '4', '5', '6']);
  /* Chỉ người có năng lực config.legal (Kế toán) sửa được ⑦ ⑧; người khác chỉ xem. Chưa biết năng lực thì coi như có (máy chủ vẫn chặn khi lưu). */
  const canLegal = () => !A.meInfo || !Array.isArray(A.meInfo.caps) || A.meInfo.caps.includes('config.legal');
  const SCHEDS = [
    [1, 2, 3, 4, 5],
    [1, 2, 3, 4, 5, 6]
  ]; // hai lịch mẫu: T2 – T6, T2 – T7

  /* ---------- định dạng ---------- */
  const nf = n => Number(n).toLocaleString('vi-VN', { maximumFractionDigits: 2 });
  const money = n => Number(n).toLocaleString('vi-VN', { maximumFractionDigits: 0 });
  const pct = v => (typeof v === 'number' ? `${nf(Math.round(v * 1e4) / 1e2)}%` : '…');
  const times = v => (typeof v === 'number' ? `×${nf(v)}` : '…');
  const val = key => kh().valueOf(key);
  const plain = v => (v === undefined || v === null ? '…' : nf(v));
  const hh = v => (typeof v === 'number' ? `${String(v).padStart(2, '0')}:00` : '…');

  /* ---------- mô tả từng khoản, dựng từ tham số thật ---------- */
  function describe(id) {
    switch (id) {
      case '1':
        return 'Lương tháng ÷ ngày công chuẩn × ngày được trả lương';
      case '2':
        return `Lương giờ × hệ số: ngày thường ${times(val('ot.rate'))}, cuối tuần ${times(val('ot.weekendRate'))}, ngày lễ ${times(val('ot.holidayRate'))}`;
      case '3': {
        const extra = (A.Khung.matrix().rows || []).filter(r => r.meta && r.meta.added).map(r => r.label);
        return ['Đi lại', 'Chuyên cần', 'Flex', 'Ca đêm', ...extra].join(' + ');
      }
      case '4':
        return 'Lương KPI tối đa theo bậc × tổng điểm KPI';
      case '5':
        return `Trừ theo phút khi muộn quá ${plain(val('attendance.graceMin'))} phút, mỗi nấc ${plain(val('attendance.stepMin'))} phút`;
      case '6':
        return `${pct(val('advance.rate'))} lương ngày công, tính đến ngày ${plain(val('advance.untilDay'))}`;
      case '7':
        return `BHXH ${pct(val('tax.insurance.employee.bhxh'))} · BHYT ${pct(val('tax.insurance.employee.bhyt'))} · BHTN ${pct(val('tax.insurance.employee.bhtn'))}`;
      default:
        return `Lũy tiến, hoặc khấu trừ ${pct(val('tax.casual.rate'))} theo hợp đồng`;
    }
  }
  const pageEntries = id =>
    kh()
      .allEntries()
      .filter(e => kh().pageOfEntry(e) === id && e.class !== 'removed');
  /* Bảng bậc lương (level.<loại>.<bậc>.name|base|kpi) nằm ở trang 'position' của registry nhưng sửa trong ngăn kéo ① (tên bậc, lương cơ bản)
     và ④ (lương KPI tối đa): cột nào thì khoản đó */
  const LEVEL_COL_CARD = { name: '1', base: '1', kpi: '4' };
  const isLevelTable = e => !!e && (e.keys || []).some(k => /^level\./.test(k));
  /* Bảng bậc lương: máy chủ chỉ trả trạng thái của cả bảng và 5 dòng lịch sử gần nhất (có khoá). Bảng đã chỉnh thì khoản được đánh dấu
     "Đã điều chỉnh" nếu lịch sử có khoá cột của khoản đó; lịch sử đầy (có thể bị cắt) thì không loại khoản nào để không báo thiếu */
  const HISTORY_FULL = 5;
  const levelTableEdited = (e, id) => {
    if (e.status !== 'custom') return false;
    const hist = e.history || [];
    const cols = hist.map(h =>
      String(h.key || '')
        .split('.')
        .pop()
    );
    return cols.some(c => LEVEL_COL_CARD[c] === id) || hist.length >= HISTORY_FULL || !hist.length;
  };
  const isEdited = id => {
    // Mục switch.* là mốc máy chủ tự đặt (ngày tính giờ theo Check-in/out, tháng KPI 5 thành phần), không phải Admin điều chỉnh
    if (pageEntries(id).some(e => e.status === 'custom' && !String(e.id).startsWith('switch.'))) return true;
    if (id !== '1' && id !== '4') return false;
    return kh()
      .allEntries()
      .some(e => isLevelTable(e) && e.class !== 'removed' && levelTableEdited(e, id));
  };

  /* ---------- ô nhập dùng chung (cũng dùng ở Chế độ theo loại và Cảnh báo AI) ---------- */
  /* Ô của một khoá: đọc quy tắc từ registry (hoặc mẫu cùng đuôi cho chức vụ mới); null khi khoá chưa có hoặc đang khoá */
  function fieldFor(key, label, title) {
    const d = kh().descOf(key);
    if (!d || !d.editable) return d ? { d, cell: null } : null;
    return { d, cell: kh().cellOf(d, label || d.label, title || label || d.label) };
  }
  const dom = key => 'dr-' + String(key).replace(/[^A-Za-z0-9_-]/g, '_');
  /* Số liệu đang gõ có sai quy tắc không (đỏ, viền đỏ) hay chỉ cảnh báo */
  const inputCls = (cell, raw) =>
    `${kt().isDirty(cell) ? ' ed' : ''}${kt().stateCls(cell, raw)}`.replace('px-bad', 'bad').replace('px-wc', 'warnin');
  /* suffix: true = đơn vị của registry, false = không có, chữ = đơn vị hiện thay (ví dụ "ngày công") */
  function numInput(cell, { width = '', suffix = true } = {}) {
    const raw = kt().cellRaw(cell);
    const was = kt().isDirty(cell) ? `<span class="was">${esc(kt().showRaw(cell, cell.orig))}</span>` : '';
    const unit = typeof suffix === 'string' ? suffix : suffix ? kt().unitTxt(cell.unit) : '';
    return `${was}<span class="z-pin"><input id="${dom(cell.key)}" class="z-ni ${width}${inputCls(cell, raw)}" inputmode="decimal" autocomplete="off" value="${esc(raw)}" data-input="drin" data-key="${esc(cell.key)}" aria-label="${esc(cell.label || 'Giá trị')}">${unit ? `<span class="pf">${esc(unit)}</span>` : ''}</span>`;
  }
  function textInput(cell) {
    const raw = kt().cellRaw(cell);
    return `<input id="${dom(cell.key)}" class="z-lvn${kt().isDirty(cell) ? ' ed' : ''}" value="${esc(raw)}" data-input="drin" data-key="${esc(cell.key)}" aria-label="${esc(cell.label || 'Giá trị')}">`;
  }
  function checkbox(cell, label) {
    const on = kt().cellRaw(cell) === '1';
    return `<label class="z-cb${kt().isDirty(cell) ? ' ed' : ''}"><input type="checkbox" id="${dom(cell.key)}" ${on ? 'checked' : ''} data-input="drck" data-key="${esc(cell.key)}" aria-label="${esc(label || cell.label)}"><span class="bx">${ic('check', 12, 3)}</span></label>`;
  }
  const lockedTag = txt => `<span class="z-soon">${esc(txt || 'Sắp có')}</span>`;
  const msgs = cell => {
    const m = cell && kt().isDirty(cell) ? kt().check(cell, kt().cellRaw(cell)) : []; // chỉ báo ô đang sửa
    return m
      .map(
        x =>
          `<div class="smsg ${x.lv === 'err' ? 'err' : 'wrn'}" role="${x.lv === 'err' ? 'alert' : 'status'}">${ic('alert', 14)}<span>${esc(x.t)}</span></div>`
      )
      .join('');
  };

  /* Vẽ lại màn nhưng GIỮ NGUYÊN ô đang gõ (không thay nút DOM đang có con trỏ): vẽ màn mới vào một mẫu rời, rồi thay mọi nút
     nằm cạnh đường đi từ gốc tới ô đó bằng nút mới; riêng các nút trên đường đi chỉ đồng bộ thuộc tính (lớp ed, bad, on…).
     Thay cả ô đang gõ bằng innerHTML làm trình duyệt ném NotFoundError và mất ký tự; không tìm thấy ô thì vẽ lại cả màn. */
  const KEEP_ATTR = new Set(['value', 'checked', 'selected']);
  function syncAttrs(live, fresh) {
    for (const a of [...live.attributes])
      if (!KEEP_ATTR.has(a.name) && !fresh.hasAttribute(a.name)) live.removeAttribute(a.name);
    for (const a of [...fresh.attributes])
      if (!KEEP_ATTR.has(a.name) && live.getAttribute(a.name) !== a.value) live.setAttribute(a.name, a.value);
  }
  function keepPath(live, fresh, el, id, root) {
    if (!root) syncAttrs(live, fresh);
    if (live === el) return true;
    const lk = [...live.childNodes];
    const fk = [...fresh.childNodes];
    const a = lk.findIndex(n => n.nodeType === 1 && (n === el || n.contains(el)));
    const b = fk.findIndex(n => n.nodeType === 1 && (n.id === id || n.querySelector(`#${CSS.escape(id)}`)));
    if (a < 0 || b < 0) return false;
    lk.forEach((n, i) => {
      if (i !== a) n.remove();
    });
    const keep = lk[a];
    fk.slice(0, b).forEach(n => live.insertBefore(n, keep));
    fk.slice(b + 1).forEach(n => live.appendChild(n));
    return keepPath(keep, fk[b], el, id, false);
  }
  const view = () => document.getElementById('view');
  function soft(el) {
    const v = A.views[S.view];
    const root = view();
    if (!v || !root || !el || !el.id || !root.contains(el)) return A.render();
    try {
      A.positions.ensure(S.month);
      const tpl = document.createElement('template');
      tpl.innerHTML = v.render();
      if (!keepPath(root, tpl.content, el, el.id, true)) return A.render();
      A.renderChrome();
      if (v.after) v.after();
    } catch {
      A.render();
    }
  }

  /* Gõ hoặc tích: lưu vào kho giá trị chung rồi vẽ lại màn, giữ nguyên ô đang gõ (con trỏ không nhảy, không mất ký tự) */
  A.inputs.drin = el => {
    const cell = kt().PS.meta.get(el.dataset.key);
    if (!cell) return;
    kt().PS.vals[cell.key] = el.value;
    soft(el);
  };
  A.inputs.drck = el => {
    const cell = kt().PS.meta.get(el.dataset.key);
    if (!cell) return;
    kt().PS.vals[cell.key] = el.checked ? '1' : '0';
    soft(el);
  };
  /* Chọn thứ làm việc: ghép các ô tích thành "1,2,3" */
  A.inputs.drday = el => {
    const key = el.dataset.key;
    const picked = [...document.querySelectorAll(`input[data-input="drday"][data-key="${CSS.escape(key)}"]`)]
      .filter(x => x.checked)
      .map(x => Number(x.dataset.d));
    kt().PS.vals[key] = picked.join(',');
    A.render();
  };
  A.inputs.drsel = el => {
    kt().PS.vals[el.dataset.key] = el.value;
    soft(el);
  };

  /* ---------- hàng của ngăn kéo ---------- */
  const sdrawer = () => S.f.sdrawer || null;
  const dg = (title, right = '') =>
    `<div class="cdx-dg"><b>${esc(title)}</b>${right ? `<span class="r">${right}</span>` : ''}</div>`;
  /* Một hàng: nhãn (kèm dòng phụ nhỏ) bên trái, ô nhập hoặc ô chọn bên phải. label, sub đã qua esc() */
  const drow = (label, sub, ctl) =>
    `<div class="cdx-dr"><span class="l">${label}${sub ? `<small>${sub}</small>` : ''}</span><span class="c">${ctl}</span></div>`;
  const sel = (inner, attrs, ed) =>
    `<span class="z-sel${ed ? ' ed' : ''}"><select ${attrs}>${inner}</select>${ic('chev', 14)}</span>`;
  /* Ô chọn phương án (kiểu choice) của một khoá; null khi khoá chưa có, đang khoá hoặc không phải ô chọn */
  function selectOf(key, label) {
    const f = fieldFor(key, label);
    if (!f || !f.cell) return null;
    const opts = (f.d.rules && f.d.rules.options) || [];
    if (!opts.length) return null;
    const raw = kt().cellRaw(f.cell);
    return sel(
      opts
        .map(
          o =>
            `<option value="${esc(String(o.value))}" ${String(o.value) === raw ? 'selected' : ''} ${o.available === false ? 'disabled' : ''}>${esc(o.label)}</option>`
        )
        .join(''),
      `id="${dom(f.cell.key)}" data-input="drsel" data-key="${esc(f.cell.key)}" aria-label="${esc(label)}"`,
      kt().isDirty(f.cell)
    );
  }
  /* Ô chọn Có/Không của một khoá bật/tắt (bảng loại nhân sự được tạm ứng…) */
  function boolSelect(cell, label) {
    const raw = kt().cellRaw(cell);
    return sel(
      `<option value="1" ${raw === '1' ? 'selected' : ''}>Có</option><option value="0" ${raw === '0' ? 'selected' : ''}>Không</option>`,
      `id="${dom(cell.key)}" data-input="drsel" data-key="${esc(cell.key)}" aria-label="${esc(label)}"`,
      kt().isDirty(cell)
    );
  }
  const offSelect = label =>
    sel('<option>Chưa áp dụng</option>', `disabled aria-label="${esc(label)}: chưa áp dụng"`, false);
  const floorOf = cell => {
    const r = (cell && cell.rules) || {};
    return r.floor && typeof r.floor.value === 'number' ? r.floor.value : null;
  };
  const joinSub = (...parts) => {
    const t = parts.filter(Boolean).join(' · ');
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
  };
  /* Hàng của một khoá registry: ô chọn nếu có phương án, không thì ô số; mức tối thiểu theo luật ghi ở dòng phụ */
  function orow(key, label, { sub = '', unit } = {}) {
    const f = fieldFor(key, label);
    if (!f || !f.cell) return '';
    const s = selectOf(key, label);
    const floor = floorOf(f.cell);
    const fl = !s && floor !== null ? `tối thiểu ${kt().fmtVal(f.cell.unit, floor).replace(' %', '%')}` : '';
    const ctl = s || numInput(f.cell, { width: 'w', suffix: unit === undefined ? true : unit });
    return drow(esc(label), esc(joinSub(sub, fl)), ctl) + msgs(f.cell);
  }

  /* Hệ số nhân hiện dạng "×2": ô chỉ đổi cách gõ và cách hiện; giá trị lưu vẫn là phần trăm như kho chung (2 ↔ 200). */
  const MUL_TXT = {};
  const mulNum = txt => kt().parseNum(txt);
  const mulFmt = n => nf(Math.round(n * 1e6) / 1e6);
  A.inputs.drmul = el => {
    const key = el.dataset.key;
    MUL_TXT[key] = el.value;
    const n = mulNum(el.value);
    kt().PS.vals[key] = n === null || Number.isNaN(n) ? el.value : String(Number((n * 100).toPrecision(12)));
    soft(el);
  };
  function mulRow(key, label, sub = '') {
    const f = fieldFor(key, label);
    if (!f || !f.cell || f.cell.unit !== 'ratio') return orow(key, label, { sub });
    const cell = f.cell;
    const raw = kt().cellRaw(cell);
    const rn = mulNum(raw);
    const typed = MUL_TXT[key];
    const tn = typed === undefined ? NaN : mulNum(typed);
    const shown =
      typed !== undefined && (typed === raw || (!Number.isNaN(tn) && tn !== null && Math.abs(tn * 100 - rn) < 1e-6))
        ? typed
        : rn === null || Number.isNaN(rn)
          ? raw
          : mulFmt(rn / 100);
    const floor = floorOf(cell);
    const was =
      kt().isDirty(cell) && !Number.isNaN(mulNum(cell.orig))
        ? `<span class="was">${esc(`×${mulFmt(mulNum(cell.orig) / 100)}`)}</span>`
        : '';
    const ctl = `${was}<span class="z-pin mul"><span class="pf">×</span><input id="${dom(key)}" class="z-ni w${inputCls(cell, raw)}" inputmode="decimal" autocomplete="off" value="${esc(shown)}" data-input="drmul" data-key="${esc(key)}" aria-label="${esc(label)}"></span>`;
    return drow(esc(label), esc(joinSub(sub, floor !== null ? `tối thiểu ×${mulFmt(floor)}` : '')), ctl) + msgs(cell);
  }
  /* Hệ số × lưu nguyên giá trị (holiday.makeupRate: 3 ↔ ×3), khác mulRow ở trên là phần trăm (2 ↔ 200) */
  A.inputs.drmulraw = el => {
    MUL_TXT[el.dataset.key] = el.value;
    kt().PS.vals[el.dataset.key] = el.value;
    soft(el);
  };
  function mulRawRow(key, label, sub = '') {
    const f = fieldFor(key, label);
    if (!f || !f.cell) return '';
    const cell = f.cell;
    const raw = kt().cellRaw(cell);
    const typed = MUL_TXT[key];
    const shown = typed !== undefined && typed === raw ? typed : raw;
    const floor = floorOf(cell);
    const was =
      kt().isDirty(cell) && !Number.isNaN(mulNum(cell.orig))
        ? `<span class="was">${esc(`×${mulFmt(mulNum(cell.orig))}`)}</span>`
        : '';
    const ctl = `${was}<span class="z-pin mul"><span class="pf">×</span><input id="${dom(key)}" class="z-ni w${inputCls(cell, raw)}" inputmode="decimal" autocomplete="off" value="${esc(shown)}" data-input="drmulraw" data-key="${esc(key)}" aria-label="${esc(label)}"></span>`;
    return drow(esc(label), esc(joinSub(sub, floor !== null ? `tối thiểu ×${mulFmt(floor)}` : '')), ctl) + msgs(cell);
  }

  /* ---------- ① Lương cơ bản: theo từng chức vụ, thứ làm việc, ngày công, tên bậc và lương cơ bản ---------- */
  function schedOf(p) {
    const row = (kh().matrix().rows || []).find(r => r.id === 'workday');
    const cm = row && row.cells[p.code];
    const f = cm && (cm.fields || []).find(x => x.cell && x.cell.key === `type.${p.code}.dows`);
    const c = f && f.cell;
    if (!c) return `<span class="cap">${esc(A.dowsText((A.positions.get(p.code) || {}).dows || []))}</span>`;
    const canon = raw =>
      String(raw)
        .split(',')
        .filter(x => x !== '')
        .map(Number)
        .sort((a, b) => a - b);
    const cur = canon(kt().cellRaw(c));
    const opts = SCHEDS.map(d => d.join(','));
    const curKey = cur.join(',');
    if (!opts.includes(curKey)) opts.push(curKey); // lịch của chức vụ không khớp hai lựa chọn mẫu: giữ đúng giá trị của app
    return sel(
      opts
        .map(
          o =>
            `<option value="${esc(o)}" ${o === curKey ? 'selected' : ''}>${esc(A.dowsText(o === '' ? [] : o.split(',').map(Number)))}</option>`
        )
        .join(''),
      `id="${dom(c.key)}" data-input="drsel" data-key="${esc(c.key)}" aria-label="${esc(`Thứ làm việc của ${p.label}`)}"`,
      kt().isDirty(c)
    );
  }
  /* "Giới hạn ngày được trả lương ở 100% ngày công chuẩn": Có = cách tính lương B, Không = cách A (khoá pay.method); C, D chỉ hiện chữ */
  const CAP_LABEL = 'Giới hạn ngày được trả lương ở 100% ngày công chuẩn';
  function cap100() {
    const f = fieldFor('pay.method', CAP_LABEL);
    if (!f || !f.cell) return '';
    const opts = (f.d.rules && f.d.rules.options) || [];
    const ok = v => opts.some(o => o.value === v && o.available !== false);
    const raw = kt().cellRaw(f.cell);
    if (raw !== 'A' && raw !== 'B')
      return drow(esc(CAP_LABEL), '', `<span class="cfgval">${esc(kt().showRaw(f.cell, raw))}</span>`);
    const ctl = sel(
      `<option value="A" ${raw === 'A' ? 'selected' : ''} ${ok('A') ? '' : 'disabled'}>Không</option><option value="B" ${raw === 'B' ? 'selected' : ''} ${ok('B') ? '' : 'disabled'}>Có${ok('B') ? '' : ' (chưa dùng được)'}</option>`,
      `id="${dom('pay.method')}" data-input="drcap" aria-label="${esc(CAP_LABEL)}"`,
      kt().isDirty(f.cell)
    );
    return drow(esc(CAP_LABEL), '', ctl) + msgs(f.cell);
  }
  A.inputs.drcap = el => {
    const f = fieldFor('pay.method');
    if (!f || !f.cell) return;
    kt().PS.vals[f.cell.key] = el.value === 'B' ? 'B' : 'A';
    soft(el);
  };
  function drawer1() {
    const pos = A.positions.list().filter(p => !p.deprecated);
    const block = p => {
      const wd = fieldFor(`type.${p.code}.workdays`, 'Ngày công chuẩn', `${p.label}: ngày công chuẩn`);
      const levels = (A.positions.get(p.code) || {}).levels || [];
      const lv = levels
        .map(l => {
          const base = fieldFor(`level.${p.code}.${l.level}.base`, `${p.label}, bậc ${l.level}: lương cơ bản`);
          const nm = fieldFor(`level.${p.code}.${l.level}.name`, `${p.label}, bậc ${l.level}: tên bậc`);
          const name = nm && nm.cell ? textInput(nm.cell) : esc(l.name || `Bậc ${l.level}`);
          const ctl =
            base && base.cell
              ? numInput(base.cell, { width: 'w', suffix: false })
              : `<span class="cfgval">${esc(money(l.base))}</span>`;
          return drow(name, '', ctl) + (base && base.cell ? msgs(base.cell) : '');
        })
        .join('');
      const right = `${schedOf(p)}${wd && wd.cell ? numInput(wd.cell, { width: 'w', suffix: 'ngày công' }) : ''}`;
      return `${dg(p.label, right)}${wd && wd.cell ? msgs(wd.cell) : ''}${lv}<button type="button" class="cdx-add" data-act="sdaddlevel" data-p="${esc(p.code)}">${ic('plus', 14)}Thêm bậc</button>`;
    };
    return `${pos.map(block).join('')}${dg('Khác')}${cap100()}<button type="button" class="cdx-add" data-act="khaddpos">${ic('plus', 14)}Thêm chức vụ</button>`;
  }

  /* Thêm bậc cho một chức vụ (POST /api/positions/:mã/levels): tên, lương cơ bản, lương KPI tối đa (nếu chức vụ có lương KPI), tháng áp dụng, lý do */
  const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
  const missingRoute = e =>
    !!e && (e.status === 404 || e.status === 405 || (e.status === 403 && e.data && e.data.code === 'NO_ROUTE_POLICY'));
  A.actions.sdaddlevel = el => {
    const code = el.dataset.p;
    const p = A.positions.get(code);
    if (!p) return;
    if (kt().dirtyCount() > 0) return A.toast('Lưu hoặc huỷ các thay đổi đang sửa trước khi thêm bậc.', 'err');
    const hasKpi = A.positions.flag(code, 'kpi', false);
    const next = ((p.levels || []).length || p.maxLevel || 0) + 1;
    let touched = false;
    A.openDialog({
      title: `Thêm bậc cho ${p.label}`,
      sub: `Bậc mới là bậc ${next}, dùng chế độ theo chức vụ; sửa riêng ở Chế độ theo loại`,
      body: `<div class="formrow"><label class="lbl" for="nl-name">Tên bậc</label><input id="nl-name" class="input" maxlength="40" autocomplete="off" placeholder="Ví dụ: Chuyên viên cao cấp"></div>
<div class="formgrid"><div class="formrow"><label class="lbl" for="nl-base">Lương cơ bản (₫/tháng)</label><input id="nl-base" class="input" inputmode="numeric" autocomplete="off"></div>
${hasKpi ? '<div class="formrow"><label class="lbl" for="nl-kpi">Lương KPI tối đa (₫/tháng, không bắt buộc)</label><input id="nl-kpi" class="input" inputmode="numeric" autocomplete="off"></div>' : '<div></div>'}
<div class="formrow"><label class="lbl" for="nl-month">Áp dụng từ tháng</label><input id="nl-month" class="input" type="month" value="${esc(S.month)}"></div></div>
<div class="formrow"><label class="lbl" for="nl-reason">Lý do (không bắt buộc)</label><textarea id="nl-reason" class="input" maxlength="300" placeholder="Ghi rõ lý do để lưu vào nhật ký"></textarea></div>`,
      foot: [
        { label: 'Huỷ' },
        {
          label: 'Thêm bậc',
          cls: 'pri',
          onClick: async api => {
            const v = id => ((document.getElementById(id) || {}).value || '').trim();
            const name = v('nl-name').replace(/\s+/g, ' ');
            const eff = v('nl-month');
            const reason = v('nl-reason');
            if (!name) throw new Error('Nhập tên bậc.');
            if (/[<>]/.test(name)) throw new Error('Tên bậc không được chứa dấu < hoặc >.');
            const base = kt().parseNum(v('nl-base'));
            if (base === null || Number.isNaN(base) || base <= 0) throw new Error('Lương cơ bản phải là số lớn hơn 0.');
            let kpi;
            if (hasKpi && v('nl-kpi') !== '') {
              kpi = kt().parseNum(v('nl-kpi'));
              if (Number.isNaN(kpi) || kpi < 0) throw new Error('Lương KPI tối đa phải là số không âm.');
            }
            if (!MONTH_RE.test(eff)) throw new Error('Chọn tháng áp dụng.');
            // lý do không bắt buộc, chỉ giữ trần độ dài
            if (reason.length > 300) throw new Error(`Lý do tối đa 300 ký tự (hiện có ${reason.length}).`);
            try {
              await A.api('POST', `/positions/${encodeURIComponent(code)}/levels`, {
                name,
                base,
                ...(kpi !== undefined ? { kpi } : {}),
                effectiveMonth: eff,
                reason
              });
            } catch (e) {
              if (missingRoute(e)) throw new Error('Máy chủ chưa có chức năng thêm bậc.');
              if (e.data && e.data.code === 'PERIOD_LOCKED') {
                const min = e.data.minEffectiveMonth;
                const inp = document.getElementById('nl-month');
                if (MONTH_RE.test(min || '') && inp) inp.value = min;
                throw new Error(
                  MONTH_RE.test(min || '')
                    ? `Tháng này đã chốt. Đã đổi tháng áp dụng sang ${A.monthLabel(min)}, bấm Thêm bậc lần nữa để xác nhận.`
                    : 'Tháng này đã chốt, chọn tháng áp dụng khác.'
                );
              }
              throw e; // LEVEL_NAME_CLASH, POSITION_UNKNOWN, POSITION_DEPRECATED, đầu vào sai: máy chủ đã viết câu rõ ràng
            }
            api.close();
            A.toast(`Đã thêm bậc "${name}" cho ${p.label}, áp dụng từ ${A.monthLabel(eff)}`);
            A.positions.refresh();
            A.levelNames.refresh();
            A.Params.reset();
            await A.Params.load();
            A.render();
          }
        }
      ]
    });
    const inp = document.getElementById('nl-month');
    if (inp) inp.addEventListener('input', () => (touched = true));
    kt()
      .earliestOpenMonth()
      .then(m => {
        const e2 = document.getElementById('nl-month');
        if (e2 && !touched && MONTH_RE.test(m)) e2.value = m;
      });
    const first = document.getElementById('nl-name');
    if (first) first.focus();
  };

  /* ---------- ② Tiền làm thêm giờ ---------- */
  function drawer2() {
    const night = `Từ ${hh(val('time.nightStartHour'))} đến ${hh(val('time.nightEndHour'))}, cộng vào lương giờ`;
    return `${dg('Hệ số nhân')}${mulRow('ot.rate', 'Ngày thường')}${mulRow('ot.weekendRate', 'Thứ Bảy, Chủ nhật ngoài lịch')}${mulRow('ot.holidayRate', 'Ngày lễ, Tết')}${mulRawRow('holiday.makeupRate', 'Làm bù rơi vào ngày lễ', 'chờ pháp chế xác nhận')}${dg('Cộng thêm ban đêm')}${orow('night.breakPremium', 'Giờ làm đêm', { sub: night })}${orow('night.otAddRate', 'Làm ngày lễ ban đêm', { sub: 'Tính trên hệ số ngày lễ' })}`;
  }

  /* ---------- ③ Phụ cấp ---------- */
  const posList = () => A.positions.list().filter(p => !p.deprecated);
  /* Các mức ca đêm riêng của một chức vụ (khoá type.<mã>.nightOptions, dạng danh sách): mỗi mức một hàng */
  function nightRows(e) {
    const code = (/^type\.([a-z][a-z0-9]*)\.nightOptions$/.exec(e.id) || [])[1];
    const pl = (A.positions.get(code) || {}).label || code;
    const col = ((e.ui && e.ui.table && e.ui.table.columns) || [])[0] || {};
    const editable = kt().K.isEditable(e);
    const rows = (e.rows || []).map(r => {
      const label = `Phụ cấp ca đêm · ${pl}, mức ${r.index}`;
      if (!editable) return drow(esc(label), '', `<span class="cfgval">${esc(`${r.value}%`)}</span>`);
      const cell = kt().fieldCell({
        key: `${e.keys[0]}#${r.index}`,
        value: r.value,
        rules: e.rules,
        comp: col.component || 'percent',
        unit: col.unit || 'percentPoints',
        label,
        title: label,
        eid: e.id,
        gid: e.group
      });
      return drow(esc(label), '', numInput(cell, { width: 'w' })) + msgs(cell);
    });
    const fl = e.rules && e.rules.floor;
    const legal = fl
      ? `<div class="cdx-legal"><span class="pill ${fl.severity === 'hard' ? 'p-rejected' : 'p-pending'}">${fl.severity !== 'hard' ? 'Sàn, cảnh báo' : 'Sàn luật'}</span><span>Không thấp hơn ${esc(nf(fl.value))}%${e.basis ? ` · căn cứ ${esc(e.basis)}` : ''}${e.defaultNote ? ` · mặc định của app: ${esc(e.defaultNote)}` : ''}</span></div>`
      : '';
    return rows.join('') + legal;
  }
  function drawer3(used) {
    const ps = posList();
    const per = (tail, word) =>
      ps
        .map(p => {
          const k = `type.${p.code}.${tail}`;
          used.add(`type.<type>.${tail}`);
          return orow(k, `${p.label} · ${word}`);
        })
        .join('');
    const byPos = re => pageEntries('3').filter(e => re.test(e.id));
    const nightLabel = (() => {
      const e = kt().PS.byId.get('shift.night.bonus');
      const m = e ? /^(.*?)\s*\((.*)\)\s*$/.exec(A.nameCodes(e.label)) : null;
      const long = x => (ps.find(p => p.short === x || p.code === x) || {}).label || x; // "TTS, CTV" → tên chức vụ
      return m ? `${m[1]} · ${m[2].split(/,\s*/).map(long).join(', ')}` : 'Phụ cấp ca đêm';
    })();
    const nights = byPos(/^type\.[a-z][a-z0-9]*\.nightOptions$/);
    nights.forEach(e => used.add(e.id));
    const absent = byPos(/^type\.(?:<type>|[a-z][a-z0-9]*)\.maxAbsent$/).flatMap(e => {
      used.add(e.id);
      return e.id.includes('<type>')
        ? ps.map(p => [`type.${p.code}.maxAbsent`, `Khi nghỉ từ · ${p.label}`])
        : [[e.id, 'Khi nghỉ từ']];
    });
    [
      'shift.flex.bonus',
      'shift.night.bonus',
      'attendance.overLimitHours',
      'attendance.lossMode',
      'attendance.overLimitTolerance',
      'attendance.shortHoursRounding',
      'attendance.tiers'
    ].forEach(k => used.add(k));
    return `${dg('Đi lại và chuyên cần')}${per('travel', 'đi lại')}${per('attendance', 'chuyên cần')}${dg('Theo ca')}${orow('shift.flex.bonus', 'Phụ cấp ca Flex')}${orow('shift.night.bonus', nightLabel)}${nights.map(nightRows).join('')}${dg('Mất phụ cấp chuyên cần')}${absent.map(([k, l]) => orow(k, l)).join('')}${orow('attendance.overLimitHours', 'Khi tổng giờ vượt ngưỡng trong tháng từ')}${orow('attendance.lossMode', 'Cách mất')}${orow('attendance.overLimitTolerance', 'Biên độ giờ vượt ngưỡng')}${orow('attendance.shortHoursRounding', 'Làm tròn giờ thiếu chưa bù')}`;
  }

  /* ---------- ④ Lương KPI ---------- */
  function drawer4() {
    const pos = posList();
    const blocks = pos
      .filter(p => A.positions.flag(p.code, 'kpi', false))
      .map(p => {
        const pass = fieldFor(`type.${p.code}.kpiPass`, 'Đạt khi tổng từ', `${p.label}: mốc KPI đạt`);
        const lv = ((A.positions.get(p.code) || {}).levels || [])
          .map(l => {
            const f = fieldFor(`level.${p.code}.${l.level}.kpi`, `${p.label}, bậc ${l.level}: lương KPI tối đa`);
            const ctl =
              f && f.cell
                ? numInput(f.cell, { width: 'w', suffix: false })
                : `<span class="cfgval">${l.kpi == null ? '—' : esc(money(l.kpi))}</span>`;
            return drow(esc(l.name || `Bậc ${l.level}`), '', ctl) + (f && f.cell ? msgs(f.cell) : '');
          })
          .join('');
        const right =
          pass && pass.cell ? `<span>Đạt khi tổng từ</span>${numInput(pass.cell, { width: 'sm', suffix: '%' })}` : '';
        return `${dg(p.label, right)}${pass && pass.cell ? msgs(pass.cell) : ''}${lv}`;
      })
      .join('');
    const none = pos.filter(p => !A.positions.flag(p.code, 'kpi', false)).map(p => p.label);
    /* kpi.weight, kpi.belowPassRule, kpi.weworkGateRule, kpi.incompleteRule, kpi.overLimitHours không hiện ở ngăn kéo này:
       các khoá vẫn chạy bằng giá trị đang lưu và xem/sửa được ở Tất cả cài đặt */
    return `${blocks}${none.length ? `<p class="cdx-dnote">${esc(none.join(', '))} không có lương KPI · đổi ở Chế độ theo loại nhân sự.</p>` : ''}`;
  }

  /* ---------- ⑤ Khấu trừ đi muộn, về sớm ---------- */
  function drawer5(used) {
    /* graceScope/graceMonthlyMin/graceMonthlyCount (miễn trừ theo tháng) chưa nối máy tính (wired:false): ẩn khỏi ngăn kéo
       nhưng vẫn đánh dấu đã dùng để simpleRows không thả chúng vào nhóm "Khác" */
    [
      'attendance.graceMin',
      'attendance.stepMin',
      'attendance.cutRounding',
      'attendance.lateEarlyRule',
      'attendance.graceScope',
      'attendance.graceMonthlyMin',
      'attendance.graceMonthlyCount'
    ].forEach(k => used.add(k));
    return `${dg('Mức trừ')}${orow('attendance.graceMin', 'Đi muộn, về sớm tới … phút không trừ')}${orow('attendance.stepMin', 'Nấc trừ khi vượt mức')}${orow('attendance.cutRounding', 'Cách làm tròn số phút bị trừ')}${orow('attendance.lateEarlyRule', 'Đi muộn và về sớm cùng ngày')}`;
  }

  /* ---------- ⑥ Tạm ứng ---------- */
  function drawer6(used) {
    /* rate/untilDay/basis ẩn khỏi ngăn kéo nhưng vẫn chạy đúng giá trị đang lưu;
       vẫn đánh dấu đã dùng để simpleRows không thả chúng vào nhóm "Khác" */
    const e = kt().PS.byId.get('advance.eligibleTypes');
    ['advance.rate', 'advance.untilDay', 'advance.basis', 'advance.eligibleTypes'].forEach(k => used.add(k));
    let types = '';
    if (e && Array.isArray(e.value)) {
      const rk = ((e.ui && e.ui.table && e.ui.table.rowKeys) || [])[0] || {};
      types = e.value
        .map(r => {
          const key = r.keys && r.keys.eligible;
          const label =
            (A.positions.get(r.type) || {}).label ||
            ((rk.values || []).find(x => x.value === r.type) || {}).label ||
            r.type;
          const f = key ? fieldFor(key, label, `Được tạm ứng: ${label}`) : null;
          return f && f.cell
            ? drow(esc(label), '', boolSelect(f.cell, `Được tạm ứng: ${label}`)) + msgs(f.cell)
            : drow(esc(label), '', `<span class="cfgval">${r.eligible ? 'Có' : 'Không'}</span>`);
        })
        .join('');
      /* chữ của máy chủ ghép nguyên văn (không viết lại chữ máy chủ) */
      const note = [
        e.ui && e.ui.help ? e.ui.help : '',
        e.defaultNote ? `Mặc định của app: ${e.defaultNote}` : '',
        e.basis ? `căn cứ: ${e.basis}` : ''
      ]
        .filter(Boolean)
        .join(' · ');
      types = `${dg(e.label || 'Loại nhân sự được tạm ứng')}${types}${note ? `<p class="cdx-dnote">${esc(note)}</p>` : ''}`;
    }
    return types;
  }

  /* Nhãn một giá trị của mục nhiều giá trị: nhãn riêng của máy chủ nếu có; trùng nhãn mục thì thêm phần phân biệt
     (tham số của khoá, đổi qua nhãn phương án của mục cùng tên nếu có, ví dụ vùng 1 → "Vùng I"; không thì đuôi khoá: bhxh → BHXH) */
  function instName(e, i) {
    if (i.label && i.label !== e.label) return A.nameCodes(i.label);
    const ps = Object.entries(i.params || {});
    const tag = ps.length
      ? ps
          .map(([p, v]) => {
            const src = kt().PS.byId.get(`law.${p}`) || kt().PS.byId.get(p);
            const o = src && src.rules && (src.rules.options || []).find(x => String(x.value) === String(v));
            return o ? o.label : String(v);
          })
          .join(', ')
      : String(i.key).split('.').pop().toUpperCase();
    return `${e.label} · ${tag}`;
  }
  /* ③ ⑤ ⑥ ⑦ ⑧: các mục sửa được của khoản (⑦ ⑧ toàn bộ; ③ ⑤ ⑥ những mục registry mới chưa có chỗ riêng ở trên) */
  function simpleRows(id, skip) {
    const out = [];
    for (const e of pageEntries(id)) {
      if (skip && skip.has(e.id)) continue;
      if (!kt().K.isEditable(e)) {
        /* Mục chưa nối vào bộ máy tính lương (wired: false): hiện để xem, không sửa */
        if (e.wired === false && e.class !== 'fixed' && e.class !== 'removed' && e.class !== 'table')
          out.push(drow(esc(e.label), '', offSelect(e.label)));
        continue;
      }
      /* Bảng (biểu thuế, nền bảo hiểm…): dùng đúng khối nhập của Tất cả cài đặt, bản gọn */
      if (e.class === 'table') {
        out.push(kt().entryHtml(e, true));
        continue;
      }
      const keys = String(e.id).includes('<type>')
        ? posList().map(p => [String(e.id).replace('<type>', p.code), `${p.label} · ${e.label}`])
        : (e.instances || []).length > 1
          ? e.instances.map(i => [i.key, instName(e, i)])
          : [[e.id, e.label]];
      for (const [k, l] of keys) {
        const f = fieldFor(k, l);
        if (!f || !f.cell) continue;
        if (selectOf(k, l)) out.push(orow(k, l));
        else if (f.d.comp === 'toggle') out.push(drow(esc(l), '', boolSelect(f.cell, l)) + msgs(f.cell));
        else if (['percent', 'money', 'quantity', 'number', 'count'].includes(f.d.comp)) out.push(orow(k, l));
      }
    }
    return out.join('');
  }
  /* Chân ngăn kéo: số thay đổi, Huỷ hoặc Đóng, Xem trước và lưu */
  function drawerFoot() {
    const n = kt().dirtyCount();
    const bad = n ? kt().blockerCount() : 0;
    const can = A.Params.saveApi === 'yes' && n > 0 && !bad;
    const left = bad
      ? `<b class="errt">Còn ${nf(bad)} chỗ chưa hợp lệ</b>`
      : n
        ? `<b>${nf(n)} thay đổi chưa lưu</b>`
        : 'Chưa có thay đổi';
    return `<div class="cdx-drw-f"><span class="t" role="status">${left}</span><span class="sp"></span>${n ? '<button type="button" class="btn" data-act="pxresetall">Huỷ thay đổi</button>' : '<button type="button" class="btn" data-act="sdclose">Đóng</button>'}<button type="button" class="btn pri" data-act="pxsave" ${can ? '' : 'disabled aria-disabled="true"'}>Xem trước và lưu</button></div>`;
  }
  const DRAWER_SUB = {
    1: () => 'Lương cơ bản theo bậc ÷ ngày công chuẩn × ngày được trả lương · đơn vị ₫/tháng',
    2: () =>
      `Tiền làm thêm = lương giờ × hệ số × số giờ · lương giờ = lương ngày ÷ ${plain(val('time.workHoursPerDay'))}`,
    3: () => `% tính trên lương cơ bản theo bậc · ${describe('3')}`,
    4: () => 'Lương KPI = lương KPI tối đa theo bậc × tổng điểm KPI · lương luôn tính kèm KPI',
    5: () => 'Trừ theo phút khi vượt mức miễn, làm tròn theo nấc',
    6: () => 'Tạm ứng theo yêu cầu đã được đồng ý, trừ vào thực nhận cuối kỳ'
  };
  function drawerHtml(id) {
    const tile = TILES.find(t => t[0] === id);
    if (!tile) return '';
    const used = new Set();
    const legalOk = !isLaw(id) || canLegal();
    let body = { 1: drawer1, 2: drawer2, 3: drawer3, 4: drawer4, 5: drawer5, 6: drawer6 }[id]?.(used) ?? simpleRows(id);
    if (['3', '5', '6'].includes(id)) {
      const rest = simpleRows(id, used);
      if (rest) body += dg('Khác') + rest;
    }
    const sub = DRAWER_SUB[id]
      ? DRAWER_SUB[id]()
      : legalOk
        ? 'Do kế toán cài · lưu cần ghi căn cứ (số văn bản, điều khoản)'
        : 'Chỉ Kế toán sửa được mục này.';
    const keep = kt().dirtyCount() ? 'Đóng, giữ thay đổi chưa lưu' : 'Đóng';
    return `<div class="cdx-scrim" data-act="sdclose" aria-hidden="true"></div><aside class="cdx-drw" role="dialog" aria-modal="true" aria-labelledby="cdx-drw-t"><div class="cdx-drw-h"><div><h2 id="cdx-drw-t">${esc(tile[1])}</h2><div class="s">${esc(sub)}</div></div><button type="button" class="cdx-x" data-act="sdclose" aria-label="${keep}" title="${keep}">${ic('x', 16)}</button></div><div class="cdx-drw-b"><div ${legalOk ? '' : 'inert'}>${body}</div></div>${legalOk ? drawerFoot() : '<div class="cdx-drw-f"><span class="sp"></span><button type="button" class="btn" data-act="sdclose">Đóng</button></div>'}</aside>`;
  }
  A.actions.sdopen = el => {
    S.f.sdrawer = el.dataset.id;
    A.render();
  };
  /* Từ màn khác: mở thẳng Cài đặt › Cách tính lương với ngăn kéo của một khoản */
  A.actions.sdgo = el => {
    S.f.sdrawer = el.dataset.id;
    A.go('cai-dat', 'so-do');
  };
  A.actions.sdclose = () => {
    S.f.sdrawer = null;
    A.render();
  };
  /* Esc đóng ngăn kéo (bắt ở pha capture: hộp thoại đang mở thì để core đóng hộp thoại trước, ngăn kéo giữ nguyên) */
  document.addEventListener(
    'keydown',
    ev => {
      if (ev.key !== 'Escape' || A.dialogOpen || !S.f.sdrawer || S.view !== 'cai-dat') return;
      if ((S.sub['cai-dat'] || 'so-do') !== 'so-do') return;
      S.f.sdrawer = null;
      A.render();
    },
    true
  );

  /* ---------- bảng Cách tính lương ---------- */
  function formulaCard() {
    const act = sdrawer();
    const rows = TILES.map(([id, name, sign]) => {
      const btn = DRAWER_IDS.has(id)
        ? `<button type="button" class="tact" data-act="sdopen" data-id="${id}" aria-label="${esc(`Sửa cách tính ${name}`)}">Sửa</button>`
        : '';
      return `<tr${act === id ? ' class="sel"' : ''}><td class="op" aria-hidden="true">${sign}</td><td class="nm">${esc(name)}</td><td class="ds">${esc(describe(id))}</td><td class="r">${btn}</td></tr>`;
    }).join('');
    return `<section class="card flush cdx-fx"><div class="card-h"><h2>Cách tính lương</h2><span class="cap">Bấm Sửa để đổi cách tính từng khoản · áp dụng cho mọi phiếu lương</span></div><div class="tblwrap"><table class="cdx-ftbl"><colgroup><col style="width:56px"><col style="width:220px"><col><col style="width:128px"></colgroup><thead><tr><th></th><th>Khoản</th><th>Cách tính</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>${recentFoot()}</section>`;
  }
  /* Chân thẻ: lần sửa gần nhất của một mục thuộc tám khoản (lịch sử do máy chủ trả trong danh mục) */
  function recentFoot() {
    const rows = [];
    for (const e of kh().allEntries())
      if (/^[1-8]$/.test(kh().pageOfEntry(e))) for (const h of e.history || []) rows.push({ e, h });
    rows.sort((a, b) => String(b.h.createdAt || '').localeCompare(String(a.h.createdAt || '')));
    const top = rows[0];
    const txt = top
      ? `Thay đổi gần đây: <b>${esc(top.e.label)}</b> · ${esc(top.h.createdAt ? A.fmtStamp(top.h.createdAt) : '—')}${top.h.createdBy ? ` · ${esc(top.h.createdBy)}` : ''}${rows.length > 1 ? ` · và ${nf(rows.length - 1)} lần sửa khác` : ''}`
      : 'Thay đổi gần đây: chưa có. Mỗi lần sửa cách tính sẽ được ghi vào Nhật ký thay đổi.';
    return `<div class="card-f">${ic('history', 16)}<span>${txt}</span><span class="sp"></span><button type="button" class="link" data-act="cdsec" data-v="nhat-ky">Mở nhật ký</button></div>`;
  }
  const ready = () => !!kt() && kt().PS.index.length && kt().PS.index.every(g => kt().PS.cache.has(g.id));
  function render() {
    if (!kt()) return '<section class="card"><div class="skel" style="width:60%"></div></section>';
    kt().resetCells();
    if (!ready())
      return '<section class="card" aria-busy="true"><div class="skel" style="width:60%"></div><div class="skel" style="width:80%"></div></section>';
    return formulaCard();
  }
  /* Ngăn kéo của khoản đang mở (khung Cài đặt vẽ ngoài lưới để phủ cả màn) */
  const drawer = () => (sdrawer() && ready() ? drawerHtml(sdrawer()) : '');
  /* Dòng phụ dưới tiêu đề: số khoản đã điều chỉnh */
  function sub() {
    if (!ready()) return 'Áp dụng cho mọi phiếu lương';
    const n = TILES.filter(([id]) => !isLaw(id) && isEdited(id)).length;
    return `Áp dụng cho mọi phiếu lương · <b>${nf(n)} khoản</b> đã điều chỉnh`;
  }

  A.CaiDatUi = { fieldFor, numInput, textInput, checkbox, lockedTag, msgs, dom, nf, inputCls };
  /* Ô của mục registry trong ngăn kéo (kiểu pxin) chỉ vẽ lại thanh dưới, không vẽ lại cả màn */
  const refreshFoot = () => {
    const f = document.querySelector('.cdx-drw .cdx-drw-f');
    if (f && (!isLaw(sdrawer()) || canLegal())) f.outerHTML = drawerFoot();
  };
  A.SoDo = { render, drawer, sub, open: () => !!sdrawer(), refreshFoot };
})(window.Admin);
