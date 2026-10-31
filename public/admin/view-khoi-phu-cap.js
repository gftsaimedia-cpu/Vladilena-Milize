/* Cài đặt › Chế độ theo loại: nút "+ Thêm chế độ", cũng là hàng "+ Thêm khoản" của bảng chế độ.
   Hộp thêm một khối phụ cấp mới: tên, cách tính (số tiền cố định / % lương cơ bản / theo bậc), co giãn theo ngày đi làm, điều kiện mất
   hoặc giảm, loại thuế, tính vào bảo hiểm, chức vụ nào được hưởng và mức của từng chức vụ, tháng áp dụng, lý do → POST /api/blocks.
   Cờ thuế và bảo hiểm do C&B đề nghị chỉ có hiệu lực khi Kế toán (config.legal) xác nhận: chưa xác nhận thì khoản tính như chịu thuế và
   không vào nền bảo hiểm. Nút "Xác nhận" gửi PUT /api/blocks/:mã/confirm kèm căn cứ bắt buộc.
   Mọi chữ do người dùng nhập qua A.esc(). Không có phép tính lương ở đây. */
(function (A) {
  'use strict';
  const { esc, ic, S } = A;

  const REASON_MAX = 300;
  const LABEL_MAX = 40; // theo máy chủ: tên khối từ 1 đến 40 ký tự
  const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
  const METHODS = [
    ['fixed', 'Số tiền cố định (₫)'],
    ['pctBase', '% lương cơ bản'],
    ['byLevel', 'Theo bậc (số tiền từng bậc)']
  ];
  const LOSS = [
    ['none', 'Không mất, không giảm'],
    ['absentDays', 'Mất khi nghỉ từ số ngày sau'],
    ['overLimitHours', 'Mất khi vượt giờ ngưỡng chuyên cần']
  ];
  const TAX = [
    ['none', 'Chịu thuế'],
    ['full', 'Miễn thuế toàn bộ'],
    ['cap', 'Miễn thuế đến hạn mức']
  ];
  const caps = () => (A.meInfo && Array.isArray(A.meInfo.caps) ? A.meInfo.caps : null);
  const can = c => (caps() ? caps().includes(c) : true);
  const missingRoute = e =>
    !!e && (e.status === 404 || e.status === 405 || (e.status === 403 && e.data && e.data.code === 'NO_ROUTE_POLICY'));

  /* "1.500.000" hoặc "7,5" → số; không hợp lệ → NaN; để trống → null */
  function parseNum(raw) {
    const s = String(raw ?? '')
      .replace(/\s/g, '')
      .replace(/%$/, '');
    if (!s) return null;
    if (!(/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s) || /^-?\d+(,\d+)?$/.test(s))) return NaN;
    return Number(s.replace(/\./g, '').replace(',', '.'));
  }
  const val = id => {
    const el = document.getElementById(id);
    return el ? el.value : '';
  };
  const opts = (list, sel) =>
    list.map(([v, l]) => `<option value="${esc(v)}" ${v === sel ? 'selected' : ''}>${esc(l)}</option>`).join('');

  let CUR = []; // chức vụ đang hiện trong hộp
  /* Ô mức của một chức vụ: một ô (số tiền hoặc %) hoặc một ô cho mỗi bậc khi tính theo bậc */
  function valHtml(i, p, method) {
    if (method === 'byLevel') {
      const levels = (A.positions.get(p.code) || {}).levels || [];
      if (!levels.length) return '<span class="cap">Chức vụ này chưa có bậc.</span>';
      return `<div class="col" style="gap:6px">${levels
        .map(
          l =>
            `<div class="row" style="gap:8px;align-items:center"><span class="cap" style="flex:0 0 120px">Bậc ${esc(l.level)}${l.name ? ` · ${esc(l.name)}` : ''}</span><div class="px-unit" style="flex:1"><input class="input sm num" id="bk-l-${i}-${esc(l.level)}" inputmode="decimal" autocomplete="off" aria-label="${esc(`Mức bậc ${l.level} của ${p.label}`)}"><span class="px-suffix" aria-hidden="true">₫</span></div></div>`
        )
        .join('')}</div>`;
    }
    return `<div class="px-unit"><input class="input num" id="bk-v-${i}" inputmode="decimal" autocomplete="off" aria-label="${esc(`Mức của ${p.label}`)}"><span class="px-suffix" aria-hidden="true">${method === 'pctBase' ? '%' : '₫'}</span></div>`;
  }
  function bodyHtml(positions) {
    CUR = positions;
    const rows = positions
      .map(
        (p, i) =>
          `<div class="cdx-lvr"><label><input type="checkbox" id="bk-on-${i}" data-input="bkon" data-i="${i}" checked><span>${esc(p.label)}</span></label><div id="bk-cell-${i}">${valHtml(i, p, 'fixed')}</div></div>`
      )
      .join('');
    return `<div class="formrow"><label class="lbl" for="bk-label">Tên khoản</label><input id="bk-label" class="input" maxlength="${LABEL_MAX}" autocomplete="off" placeholder="Ví dụ: Phụ cấp ăn trưa"></div>
<div class="formgrid"><div class="formrow"><label class="lbl" for="bk-method">Cách tính</label><select id="bk-method" class="input" data-input="bkmethod">${opts(METHODS, 'fixed')}</select></div>
<div class="formrow"><label class="lbl" for="bk-scale">Co giãn theo ngày đi làm</label><select id="bk-scale" class="input"><option value="0">Không</option><option value="1">Có</option></select></div>
<div class="formrow"><label class="lbl" for="bk-loss">Điều kiện mất hoặc giảm</label><select id="bk-loss" class="input" data-input="bkloss">${opts(LOSS, 'none')}</select></div>
<div><div class="formrow" id="bk-days-row" hidden><label class="lbl" for="bk-days">Số ngày nghỉ</label><input id="bk-days" class="input num" inputmode="numeric" autocomplete="off"></div></div>
<div class="formrow"><label class="lbl" for="bk-tax">Thuế</label><select id="bk-tax" class="input" data-input="bktax">${opts(TAX, 'none')}</select></div>
<div class="formrow"><label class="lbl" for="bk-ins">Tính vào bảo hiểm</label><select id="bk-ins" class="input"><option value="0">Không</option><option value="1">Có</option></select></div>
<div class="formrow" id="bk-cap-row" hidden><label class="lbl" for="bk-cap">Hạn mức miễn thuế (₫)</label><input id="bk-cap" class="input num" inputmode="numeric" autocomplete="off"></div></div>
<div class="note" role="status">${ic('info', 16)}<span>Cách tính thuế và bảo hiểm chỉ có hiệu lực sau khi Kế toán xác nhận; trước đó khoản được tính là chịu thuế và không vào bảo hiểm.</span></div>
<div class="formrow"><span class="lbl">Loại nhân sự được hưởng và mức</span><div class="cdx-lv">${rows}</div><span class="cap" id="bk-vnote"></span></div>
<div class="formgrid"><div class="formrow"><label class="lbl" for="bk-month">Áp dụng từ tháng</label><input id="bk-month" class="input" type="month" value="${esc(S.month)}"></div></div>
<div class="formrow"><label class="lbl" for="bk-reason">Lý do <small>(không bắt buộc)</small></label><textarea id="bk-reason" class="input" maxlength="${REASON_MAX}" placeholder="Ghi rõ lý do để lưu vào nhật ký"></textarea></div>`;
  }

  /* Đổi cách tính: vẽ lại ô mức của từng chức vụ (₫, % hoặc từng bậc); chức vụ bỏ chọn thì ô bị khoá */
  function syncMethod() {
    const m = val('bk-method');
    CUR.forEach((p, i) => {
      const cell = document.getElementById('bk-cell-' + i);
      if (!cell) return;
      cell.innerHTML = valHtml(i, p, m);
      const on = !!(document.getElementById('bk-on-' + i) || {}).checked;
      cell.querySelectorAll('input').forEach(x => (x.disabled = !on));
    });
  }
  A.inputs.bkmethod = syncMethod;
  A.inputs.bkloss = () => {
    const r = document.getElementById('bk-days-row');
    if (r) r.hidden = val('bk-loss') !== 'absentDays';
  };
  A.inputs.bktax = () => {
    const r = document.getElementById('bk-cap-row');
    if (r) r.hidden = val('bk-tax') !== 'cap';
  };
  A.inputs.bkon = el => {
    const cell = document.getElementById('bk-cell-' + el.dataset.i);
    if (cell) cell.querySelectorAll('input').forEach(x => (x.disabled = !el.checked));
  };

  function read(positions) {
    const label = val('bk-label').trim().replace(/\s+/g, ' ');
    if (!label) throw new Error('Nhập tên khoản.');
    if (label.length > LABEL_MAX) throw new Error(`Tên khoản tối đa ${LABEL_MAX} ký tự.`);
    if (/[<>]/.test(label)) throw new Error('Tên khoản không được chứa dấu < hoặc >.');
    const method = val('bk-method');
    const tax = val('bk-tax');
    const loss = val('bk-loss');
    const body = {
      label,
      component: 3,
      mode: 'form',
      method,
      scalesWithDays: val('bk-scale') === '1',
      loss: null,
      tax,
      insuranceBase: val('bk-ins') === '1'
    };
    if (loss !== 'none') {
      body.loss = { kind: loss };
      if (loss === 'absentDays') {
        const d = parseNum(val('bk-days'));
        if (d === null || Number.isNaN(d) || !Number.isInteger(d) || d < 1)
          throw new Error('Nhập số ngày nghỉ (số nguyên từ 1).');
        body.loss.days = d;
      }
    }
    if (tax === 'cap') {
      const c = parseNum(val('bk-cap'));
      if (c === null || Number.isNaN(c) || !Number.isInteger(c) || c < 0)
        throw new Error('Nhập hạn mức miễn thuế (số tiền nguyên, ₫).');
      body.taxCap = c;
    }
    body.positions = positions.map((p, i) => {
      const on = !!(document.getElementById('bk-on-' + i) || {}).checked;
      const out = { position: p.code, on };
      if (on && method === 'byLevel') {
        const levels = (A.positions.get(p.code) || {}).levels || [];
        if (!levels.length) throw new Error(`Chức vụ "${p.label}" chưa có bậc để nhập mức.`);
        out.byLevel = {};
        for (const l of levels) {
          const n = parseNum(val(`bk-l-${i}-${l.level}`));
          if (n === null || Number.isNaN(n) || n < 0 || !Number.isInteger(n))
            throw new Error(`Nhập số tiền bậc ${l.level} của "${p.label}" (số nguyên đồng) hoặc bỏ chọn chức vụ này.`);
          out.byLevel[l.level] = n;
        }
      } else if (on) {
        const n = parseNum(val('bk-v-' + i));
        if (n === null || Number.isNaN(n) || n < 0)
          throw new Error(`Nhập mức cho chức vụ "${p.label}" hoặc bỏ chọn chức vụ này.`);
        if (method === 'fixed') {
          if (!Number.isInteger(n)) throw new Error(`Mức của "${p.label}": tiền phải là số nguyên đồng.`);
          out.amount = n;
        } else out.pct = Number((n / 100).toPrecision(12));
      }
      return out;
    });
    if (!body.positions.some(p => p.on)) throw new Error('Chọn ít nhất một chức vụ được hưởng khoản này.');
    const month = val('bk-month');
    if (!MONTH_RE.test(month)) throw new Error('Chọn tháng áp dụng.');
    const reason = val('bk-reason').trim();
    // lý do không bắt buộc, chỉ giữ trần độ dài
    if (reason.length > REASON_MAX) throw new Error(`Lý do tối đa ${REASON_MAX} ký tự (hiện có ${reason.length}).`);
    body.effectiveMonth = month;
    body.reason = reason;
    return body;
  }

  const openAddBlock = () => {
    const positions = A.positions.list().filter(p => !p.deprecated);
    let touched = false;
    A.openDialog({
      title: 'Thêm chế độ phụ cấp',
      sub: 'Khoản mới nằm trong Phụ cấp và thành một cột của bảng Chế độ theo loại nhân sự',
      wide: true,
      body: bodyHtml(positions),
      foot: [
        { label: 'Huỷ' },
        {
          label: 'Thêm chế độ',
          cls: 'pri cdx-plus',
          onClick: async api => {
            const body = read(positions);
            try {
              await A.api('POST', '/blocks', body);
            } catch (e) {
              if (missingRoute(e)) throw new Error('Máy chủ chưa có chức năng thêm khoản phụ cấp.');
              throw e;
            }
            api.close();
            A.toast(`Đã thêm chế độ "${body.label}", áp dụng từ ${A.monthLabel(body.effectiveMonth)}`);
            A.Params.reset();
            await A.Params.load();
            A.render();
          }
        }
      ]
    });
    syncMethod();
    const m = document.getElementById('bk-month');
    if (m) m.addEventListener('input', () => (touched = true));
    A.PxKit.earliestOpenMonth().then(mo => {
      const el = document.getElementById('bk-month');
      if (el && !touched && MONTH_RE.test(mo)) el.value = mo;
    });
  };
  /* Thêm khoản và xác nhận cờ nạp lại cả kho tham số: ô đang sửa dở (chưa lưu) sẽ mất, nên hỏi trước */
  A.actions.khaddblock = () =>
    A.drafts.guard(openAddBlock, { scope: 'params', sub: 'Thêm chế độ sẽ nạp lại các cài đặt' });

  /* Xác nhận cờ thuế và bảo hiểm của một khối (Kế toán, config.legal): PUT /api/blocks/:mã/confirm { basis, effectiveMonth }.
     Căn cứ là bắt buộc (số văn bản, điều khoản); máy chủ tự ghi người xác nhận. */
  const openConfirm = el => {
    const row = A.Khung.rowOf(el.dataset.r);
    const b = row && row.meta;
    if (!b) return;
    const code = b.id || b.code || row.id;
    const taxTxt = (TAX.find(t => t[0] === b.tax) || [])[1] || '—';
    A.openDialog({
      title: `Xác nhận cờ của "${row.label}"`,
      sub: `${taxTxt}; ${b.insuranceBase ? 'tính vào bảo hiểm' : 'không tính vào bảo hiểm'}`,
      body: `<div class="formrow"><label class="lbl" for="bc-basis">Căn cứ (không bắt buộc: số văn bản, điều khoản)</label><textarea id="bc-basis" class="input" maxlength="${REASON_MAX}" placeholder="Ví dụ: văn bản, điều, khoản làm căn cứ"></textarea></div>
<div class="formrow"><label class="lbl" for="bc-month">Áp dụng từ tháng</label><input id="bc-month" class="input" type="month" value="${esc(S.month)}" style="max-width:220px"></div>`,
      foot: [
        { label: 'Huỷ' },
        {
          label: 'Xác nhận',
          cls: 'pri',
          onClick: async api => {
            const basis = val('bc-basis').trim();
            const eff = val('bc-month');
            if (!MONTH_RE.test(eff)) throw new Error('Chọn tháng áp dụng.');
            try {
              // gửi đúng cờ Kế toán đang thấy: lệch (C&B vừa đổi) thì máy chủ từ chối
              await A.api('PUT', `/blocks/${encodeURIComponent(code)}/confirm`, {
                basis,
                effectiveMonth: eff,
                expectedFlags: {
                  tax: b.tax || 'none',
                  taxCap: b.taxCap ?? null,
                  insuranceBase: b.insuranceBase === true
                }
              });
            } catch (e) {
              if (missingRoute(e)) throw new Error('Máy chủ chưa có chức năng xác nhận cờ.');
              if (e.data && e.data.code === 'BLOCK_FLAGS_CHANGED') {
                api.close();
                A.toast('Cờ vừa bị đổi, xem lại trước khi xác nhận', 'err');
                A.Params.reset();
                await A.Params.load();
                A.render();
                return;
              }
              throw e;
            }
            api.close();
            A.toast('Đã xác nhận cờ thuế và bảo hiểm');
            A.Params.reset();
            await A.Params.load();
            A.render();
          }
        }
      ]
    });
  };
  A.actions.khconfirm = el => {
    const row = A.Khung.rowOf(el.dataset.r);
    if (!row || !row.meta) return;
    A.drafts.guard(() => openConfirm(el), { scope: 'params', sub: 'Xác nhận cờ sẽ nạp lại các cài đặt' });
  };

  /* Nhãn trạng thái xác nhận cờ ở đầu hàng của bảng quyền lợi (rỗng với khối có sẵn của hệ thống) */
  function flagsHtml(row) {
    const b = row.meta;
    // chỉ khối có cờ thuế hoặc bảo hiểm khác mặc định mới cần Kế toán xác nhận
    if (!b || !((b.tax && b.tax !== 'none') || b.insuranceBase === true)) return '';
    if (b.flagsConfirmedBy) return `<span class="cap">Kế toán đã xác nhận cờ thuế và bảo hiểm</span>`;
    const btn = can('config.legal')
      ? ` <button type="button" class="btn sm" data-act="khconfirm" data-r="${esc(row.id)}">Xác nhận</button>`
      : '';
    return `<span class="kh-flags">${A.pill('pending', 'Chờ Kế toán xác nhận')}${btn}</span>`;
  }

  A.KhoiPhuCap = { flagsHtml };
})(window.Admin);
