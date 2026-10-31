/* Cài đặt › ⑧ Thuế TNCN: ô sửa bảng "Biểu thuế lũy tiến từng phần" (tax.brackets, giá trị là danh sách [trần, thuế suất], hàng cuối trần = null).
   Kế toán thêm hoặc bớt bậc, sửa mức trần và thuế suất; lưu qua "Xem trước và lưu" (ô Căn cứ bắt buộc vì khoá do Kế toán sửa).
   Giá trị đang sửa nằm trong kho chung PS.vals dưới khoá tax.brackets dạng chuỗi JSON [{ upTo, rate }] (chữ như người dùng gõ);
   khi lưu đổi lại thành [[trần, thuế suất]] (thuế suất gõ theo %, gửi dạng tỷ lệ). Kiểm tại chỗ chỉ để báo sớm: máy chủ kiểm lại.
   Mọi chữ qua A.esc(). Không có phép tính thuế ở đây. */
(function (A) {
  'use strict';
  const { esc, ic } = A;
  const kt = () => A.PxKit;

  /* Chữ hiển thị trong ô: 10000000 → "10.000.000", 0,05 → "5" */
  const moneyTxt = v => (typeof v === 'number' ? v.toLocaleString('vi-VN') : '');
  const pctTxt = v => (typeof v === 'number' ? String(Math.round(v * 1e4) / 1e2).replace('.', ',') : '');
  const toRows = pairs => (Array.isArray(pairs) ? pairs : []).map(p => ({ upTo: moneyTxt(p[0]), rate: pctTxt(p[1]) }));
  const rowsOf = raw => {
    try {
      const r = JSON.parse(raw);
      return Array.isArray(r) ? r : [];
    } catch {
      return [];
    }
  };
  /* Dùng cho kho giá trị chung: chuỗi gốc, giá trị gửi máy chủ, kiểm, nhãn tóm tắt */
  const toRaw = pairs => JSON.stringify(toRows(pairs));
  function num(s) {
    const t = String(s ?? '')
      .replace(/\s/g, '')
      .replace(/%$/, '');
    if (!t) return null;
    if (!(/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t) || /^\d+(,\d+)?$/.test(t))) return NaN;
    return Number(t.replace(/\./g, '').replace(',', '.'));
  }
  function typed(raw) {
    return rowsOf(raw).map((r, i, all) => [
      i === all.length - 1 ? null : num(r.upTo),
      Number((num(r.rate) / 100).toPrecision(12))
    ]);
  }
  function check(raw) {
    const rows = rowsOf(raw);
    const out = [];
    const err = t => out.push({ lv: 'err', t });
    if (rows.length < 2) err('Biểu thuế cần ít nhất hai bậc.');
    let prev = 0;
    rows.forEach((r, i) => {
      const last = i === rows.length - 1;
      const rate = num(r.rate);
      if (rate === null || Number.isNaN(rate) || rate < 0 || rate > 100)
        err(`Bậc ${i + 1}: thuế suất là số từ 0 đến 100 (%).`);
      if (last) return;
      const up = num(r.upTo);
      if (up === null || Number.isNaN(up) || !Number.isInteger(up))
        err(`Bậc ${i + 1}: nhập mức trần là số tiền nguyên (₫).`);
      else {
        if (up <= prev) err(`Bậc ${i + 1}: mức trần phải lớn hơn mức trần của bậc trước.`);
        prev = up;
      }
    });
    return out;
  }
  const summary = raw =>
    rowsOf(raw)
      .map((r, i, all) => `${i === all.length - 1 ? 'trên mức đó' : `đến ${r.upTo} ₫`}: ${r.rate} %`)
      .join('; ');

  const set = (key, rows) => {
    kt().PS.vals[key] = JSON.stringify(rows);
    A.render();
  };
  const current = key => {
    const cell = kt().PS.meta.get(key);
    return rowsOf(cell ? kt().cellRaw(cell) : '[]');
  };
  A.inputs.bktin = el => {
    const rows = current(el.dataset.key);
    const row = rows[Number(el.dataset.i)];
    if (!row) return;
    row[el.dataset.f] = el.value;
    kt().PS.vals[el.dataset.key] = JSON.stringify(rows);
    // vẽ lại để thông báo và nút lưu cập nhật; ô đang gõ giữ nguyên vị trí con trỏ (A.render khôi phục theo id)
    A.render();
  };
  A.actions.bktadd = el => {
    const rows = current(el.dataset.key);
    rows.splice(Math.max(0, rows.length - 1), 0, { upTo: '', rate: '' }); // thêm trước bậc cuối (bậc không trần)
    set(el.dataset.key, rows);
  };
  A.actions.bktdel = el => {
    const rows = current(el.dataset.key);
    if (rows.length <= 2) return;
    rows.splice(Number(el.dataset.i), 1);
    set(el.dataset.key, rows);
  };

  /* Thân của mục: bảng sửa được (editable) hoặc chỉ xem */
  function body(e, editable) {
    const cell = kt().fieldCell({
      key: e.id,
      eid: e.id,
      gid: e.group,
      value: Array.isArray(e.value) ? e.value : [],
      rules: e.rules || {},
      comp: 'brackets',
      label: e.label,
      title: e.label
    });
    cell.readonly = !editable;
    const rows = rowsOf(kt().cellRaw(cell));
    const key = esc(e.id);
    const tr = rows
      .map((r, i) => {
        const last = i === rows.length - 1;
        const f = (field, label, cls) =>
          editable
            ? `<input id="bkt-${i}-${field}" class="input sm num ${cls}" inputmode="decimal" autocomplete="off" value="${esc(r[field])}" data-input="bktin" data-key="${key}" data-i="${i}" data-f="${field}" aria-label="${esc(`Bậc ${i + 1}, ${label}`)}">`
            : `<span class="num">${esc(r[field])}</span>`;
        const upTo = last
          ? '<span class="cap">Không có trần</span>'
          : `<div class="px-unit">${f('upTo', 'thu nhập tính thuế đến (₫)', '')}${editable ? '<span class="px-suffix" aria-hidden="true">₫</span>' : ''}</div>`;
        const del =
          editable && !last && rows.length > 2
            ? `<button type="button" class="btn sm ghost" data-act="bktdel" data-key="${key}" data-i="${i}" aria-label="${esc(`Bỏ bậc ${i + 1}`)}">Bỏ</button>`
            : '';
        return `<tr><td class="num">${i + 1}</td><td>${upTo}</td><td><div class="px-unit">${f('rate', 'thuế suất (%)', '')}${editable ? '<span class="px-suffix" aria-hidden="true">%</span>' : ''}</div></td><td class="r">${del}</td></tr>`;
      })
      .join('');
    const add = editable
      ? `<div class="row wrap" style="gap:8px"><button type="button" class="btn sm" data-act="bktadd" data-key="${key}">${ic('plus', 14)}Thêm bậc</button></div>`
      : '';
    const msgs = editable ? A.PxBrackets.check(kt().cellRaw(cell)) : [];
    const msgHtml = msgs.length
      ? `<ul class="px-msgs">${msgs.map(m => `<li class="warn" role="alert">${ic('alert', 16)}<span>${esc(m.t)}</span></li>`).join('')}</ul>`
      : '';
    return `${msgHtml}<div class="tblwrap px-tbl"><table><thead><tr><th>Bậc</th><th>Thu nhập tính thuế đến (₫)</th><th>Thuế suất (%)</th><th></th></tr></thead><tbody>${tr || '<tr><td colspan="4"><span class="cap">Bảng trống.</span></td></tr>'}</tbody></table></div>${add}`;
  }

  A.PxBrackets = { body, toRaw, typed, check, summary };
})(window.Admin);
