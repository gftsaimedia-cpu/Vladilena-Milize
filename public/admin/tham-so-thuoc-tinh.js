/* Cài đặt › Thêm thuộc tính cho Level (cột mới như "Lương đóng BH" của bảng bậc lương).
   Nhóm, ô và kho giá trị đang sửa dùng chung qua A.PxKit (view-tham-so.js). Mọi chữ do người dùng nhập qua A.esc(). */
(function (A) {
  'use strict';
  const { esc, ic, S } = A;
  const kt = () => A.PxKit;
  const PS = new Proxy({}, { get: (_, k) => kt().PS[k], set: (_, k, v) => ((kt().PS[k] = v), true) });
  const parseNum = v => kt().parseNum(v);
  const fmtVal = (u, v) => kt().fmtVal(u, v);
  const missingRoute = e => kt().missingRoute(e);
  const UNIT_TXT = new Proxy({}, { get: (_, k) => kt().unitTxt(k) });
  const LEVEL_TABLE_ID = 'level.<type>.<level>';
  const ATTR_DEF_KEY = 'class.level.attr.';
  /* Thuộc tính mới của Level (ví dụ "Lương đóng BH"): bảng loại nhân sự × bậc có nút "Thêm thuộc tính". Định nghĩa là khoá
     class.level.attr.<mã>, giá trị từng bậc là level.<loại>.<bậc>.attr.<mã>; cả hai đi chung MỘT lô lưu. */
  const ATTR_NAME_MAX = 60;
  const ATTR_CODE_RE = /^[a-z][A-Za-z0-9]{0,31}$/;
  const ATTR_KINDS = [
    ['money', 'Tiền (₫)', 'vnd'],
    ['percent', 'Phần trăm (%)', 'ratio'],
    ['quantity', 'Số', 'count'],
    ['toggle', 'Có / không', null],
    ['text', 'Chữ', null]
  ];
  const ATTR_UNITS = ['count', 'hour', 'day', 'minute', 'times', 'month']; // đơn vị chọn được cho kiểu "Số"

  /* ---------- Thêm thuộc tính của Level ---------- */
  const defValue = d => ({
    label: d.label,
    component: d.component,
    unit: d.unit,
    ...(d.min !== undefined ? { min: d.min } : {}),
    ...(d.max !== undefined ? { max: d.max } : {}),
    ...(d.default !== undefined ? { default: d.default } : {})
  });
  const attrSummary = d =>
    [
      (ATTR_KINDS.find(k => k[0] === d.component) || [])[1],
      d.min !== undefined ? `từ ${fmtVal(d.unit, d.min)}` : '',
      d.max !== undefined ? `đến ${fmtVal(d.unit, d.max)}` : '',
      d.default !== undefined
        ? `mặc định ${d.component === 'toggle' ? fmtVal(null, d.default) : fmtVal(d.unit, d.default)}`
        : ''
    ]
      .filter(Boolean)
      .join(', ');
  /* "Lương đóng BH" → luongDongBh (bỏ dấu, ghép kiểu camelCase) */
  const suggestCode = name => {
    const words = A.fold(name)
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(' ')
      .filter(Boolean);
    const code = words.map((w, i) => (i ? w[0].toUpperCase() + w.slice(1) : w)).join('');
    return /^[a-z]/.test(code) ? code.slice(0, 32) : '';
  };
  const AT = { support: 'unknown', codeTouched: false, token: 0 };
  const atVal = id => {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  };
  function atDyn(kind) {
    const k = ATTR_KINDS.find(x => x[0] === kind) || ATTR_KINDS[0];
    const unit =
      kind === 'quantity'
        ? `<div class="formrow"><label class="lbl" for="at-unit">Đơn vị</label><select id="at-unit" class="input">${ATTR_UNITS.map(u => `<option value="${u}">${esc(UNIT_TXT[u] || 'Không có đơn vị')}</option>`).join('')}</select></div>`
        : kind === 'money' || kind === 'percent'
          ? `<div class="formrow"><span class="lbl">Đơn vị</span><span class="cfgval">${esc(UNIT_TXT[k[2]])}</span></div>`
          : '';
    const num = ['money', 'percent', 'quantity'].includes(kind);
    const range = num
      ? `<div class="formrow"><label class="lbl" for="at-min">Nhỏ nhất (để trống nếu không giới hạn)</label><input id="at-min" class="input num" inputmode="decimal" autocomplete="off"></div><div class="formrow"><label class="lbl" for="at-max">Lớn nhất (để trống nếu không giới hạn)</label><input id="at-max" class="input num" inputmode="decimal" autocomplete="off"></div>`
      : '';
    const def =
      kind === 'toggle'
        ? `<div class="formrow"><label class="lbl" for="at-def">Mặc định cho mọi bậc</label><select id="at-def" class="input"><option value="">Không đặt</option><option value="1">Có</option><option value="0">Không</option></select></div>`
        : `<div class="formrow"><label class="lbl" for="at-def">Mặc định cho mọi bậc (để trống nếu điền sau)</label><input id="at-def" class="input ${num ? 'num' : ''}" ${num ? 'inputmode="decimal"' : ''} autocomplete="off"></div>`;
    return `<div class="formgrid">${unit}${range}${def}</div>`;
  }
  /* Đọc một ô số theo đơn vị hiển thị (phần trăm gõ là %, lưu là tỷ lệ); lỗi thì ném câu tiếng Việt */
  function atNumber(id, kind, label) {
    const raw = atVal(id);
    if (!raw) return undefined;
    const n = parseNum(raw);
    if (n === null || Number.isNaN(n)) throw new Error(`${label}: gõ một số hợp lệ (ví dụ 1.500.000 hoặc 7,5).`);
    if (kind === 'money' && !Number.isInteger(n)) throw new Error(`${label}: tiền phải là số nguyên đồng.`);
    return kind === 'percent' ? Number((n / 100).toPrecision(12)) : n;
  }
  function readAttr() {
    const label = atVal('at-name');
    const code = atVal('at-code');
    const kind = atVal('at-kind');
    if (!label) throw new Error('Nhập tên thuộc tính.');
    if (label.length > ATTR_NAME_MAX) throw new Error(`Tên thuộc tính tối đa ${ATTR_NAME_MAX} ký tự.`);
    if (!ATTR_CODE_RE.test(code))
      throw new Error('Mã chỉ gồm chữ không dấu và số, bắt đầu bằng chữ thường, viết liền (ví dụ luongDongBh).');
    const existing = new Set(
      [...PS.byId.values()]
        .filter(x => x.id === LEVEL_TABLE_ID)
        .flatMap(x => ((x.ui && x.ui.table && x.ui.table.columns) || []).map(c => c.key))
    );
    if (existing.has('attr.' + code) || PS.attrDrafts.some(d => d.code === code))
      throw new Error(`Mã "${code}" đã có ở một cột khác. Chọn mã khác.`);
    const k = ATTR_KINDS.find(x => x[0] === kind);
    if (!k) throw new Error('Chọn kiểu giá trị.');
    const out = { code, label, component: kind, unit: kind === 'quantity' ? atVal('at-unit') || 'count' : k[2] };
    const num = ['money', 'percent', 'quantity'].includes(kind);
    if (num) {
      const lo = atNumber('at-min', kind, 'Nhỏ nhất'),
        hi = atNumber('at-max', kind, 'Lớn nhất'),
        df = atNumber('at-def', kind, 'Mặc định');
      if (lo !== undefined) out.min = lo;
      if (hi !== undefined) out.max = hi;
      if (lo !== undefined && hi !== undefined && lo > hi) throw new Error('Nhỏ nhất không được lớn hơn lớn nhất.');
      if (df !== undefined) {
        if (lo !== undefined && df < lo) throw new Error('Mặc định nhỏ hơn mức nhỏ nhất.');
        if (hi !== undefined && df > hi) throw new Error('Mặc định lớn hơn mức lớn nhất.');
        out.default = df;
      }
    } else if (kind === 'toggle') {
      if (atVal('at-def') !== '') out.default = atVal('at-def') === '1';
    } else if (atVal('at-def')) out.default = atVal('at-def');
    return out;
  }
  /* Máy chủ đã hiểu khoá class.level.attr.* chưa? Hỏi bằng một lần xem trước (không ghi). PARAM_UNKNOWN_KEY hoặc đường dẫn chưa có là "chưa hỗ trợ". */
  async function probeAttr() {
    if (PS.saveApi !== 'yes') return 'no';
    try {
      const res = await A.api('POST', '/settings/params/preview', {
        changes: [{ key: ATTR_DEF_KEY + 'probe', value: { label: 'Thử', component: 'money', unit: 'vnd' } }],
        effectiveMonth: S.month
      });
      return (res.errors || []).some(x => x.code === 'PARAM_UNKNOWN_KEY') ? 'no' : 'yes';
    } catch (e) {
      const errs = (e.data && e.data.errors) || [];
      if (
        missingRoute(e) ||
        (e.data && e.data.code === 'PARAM_UNKNOWN_KEY') ||
        errs.some(x => x.code === 'PARAM_UNKNOWN_KEY')
      )
        return 'no';
      return e && e.status === 0 ? 'unknown' : 'yes';
    }
  }
  function atSupportPaint() {
    const note = document.getElementById('at-support');
    const btn = document.querySelector('#ovl [data-dlg-btn="1"]');
    if (!note || !btn) return;
    if (AT.support === 'yes') {
      note.innerHTML = '';
      btn.disabled = false;
      btn.textContent = 'Thêm cột để điền';
    } else if (AT.support === 'no') {
      note.innerHTML = `<div class="note" role="status">${ic('info', 16)}<span>${A.soonTag('Sắp có')} Máy chủ chưa lưu được thuộc tính mới của level. Bạn xem được hộp này, nhưng chưa thêm cột được.</span></div>`;
      btn.disabled = true;
      btn.textContent = 'Sắp có';
    } else {
      note.innerHTML = `<div class="note" role="status" aria-busy="true">${ic('refresh', 16)}<span>Đang kiểm tra máy chủ…</span></div>`;
      btn.disabled = true;
    }
  }
  A.actions.pxattr = () => {
    AT.support = 'unknown';
    AT.codeTouched = false;
    const token = ++AT.token;
    A.openDialog({
      title: 'Thêm thuộc tính cho Level',
      sub: 'Một cột mới cho mọi bậc của mọi loại nhân sự',
      wide: true,
      body: `<div id="at-support" aria-live="polite"></div>
<div class="formgrid"><div class="formrow"><label class="lbl" for="at-name">Tên thuộc tính</label><input id="at-name" class="input" maxlength="${ATTR_NAME_MAX}" autocomplete="off" placeholder="Ví dụ: Lương đóng BH" data-input="atname"></div>
<div class="formrow"><label class="lbl" for="at-code">Mã (viết liền, không dấu)</label><input id="at-code" class="input mono" autocomplete="off" placeholder="luongDongBh" data-input="atcode"><span class="cap">Tự gợi ý từ tên; sửa được. Dùng làm tên biến trong công thức.</span></div></div>
<div class="formrow"><label class="lbl" for="at-kind">Kiểu giá trị</label><select id="at-kind" class="input" data-input="atkind" style="max-width:260px">${ATTR_KINDS.map(k => `<option value="${k[0]}">${esc(k[1])}</option>`).join('')}</select></div>
<div id="at-dyn">${atDyn(ATTR_KINDS[0][0])}</div>
<span class="cap">Bấm "Thêm cột để điền": chưa lưu gì. Cột mới hiện ở bảng, bạn điền giá trị từng bậc rồi bấm Xem trước và lưu (một lô gồm cả định nghĩa và giá trị).</span>`,
      foot: [
        { label: 'Huỷ' },
        {
          label: 'Thêm cột để điền',
          cls: 'pri',
          disabled: true,
          onClick: api => {
            const d = readAttr();
            PS.attrDrafts.push(d);
            api.close();
            A.render();
            A.toast(`Đã thêm cột "${d.label}". Điền giá trị từng bậc rồi bấm Xem trước và lưu.`);
          }
        }
      ]
    });
    atSupportPaint();
    probeAttr().then(v => {
      if (token !== AT.token) return;
      AT.support = v;
      atSupportPaint();
    });
  };
  A.inputs.atname = el => {
    if (AT.codeTouched) return;
    const code = document.getElementById('at-code');
    if (code) code.value = suggestCode(el.value);
  };
  A.inputs.atcode = () => {
    AT.codeTouched = true;
  };
  A.inputs.atkind = el => {
    const dyn = document.getElementById('at-dyn');
    if (dyn) dyn.innerHTML = atDyn(el.value);
  };
  A.actions.pxattrdel = el => {
    const code = el.dataset.code;
    PS.attrDrafts = PS.attrDrafts.filter(d => d.code !== code);
    for (const k of [...PS.meta.keys()])
      if (k.endsWith('.attr.' + code)) {
        PS.meta.delete(k);
        delete PS.vals[k];
      }
    A.render();
  };

  A.PxAttr = { defValue, summary: attrSummary };
})(window.Admin);
