/* Cài đặt › Tất cả cài đặt: chia mục của một nhóm thành sửa được / chỉ đọc / sắp có (view-tham-so.js dùng).
   Ba loại mục:
   - sắp có (isSoon): registry báo wired:false, phần tính lương chưa đọc mục này nên lưu bị từ chối (PARAM_NOT_WIRED); gom vào mục gập
     "Sắp có" ở cuối nhóm, chỉ có tên và giá trị hiện tại, không có ô nhập;
   - sửa ở màn khác (isBacked): máy chủ nói mục thật nằm ở màn khác (Chấm công, Ngày lễ, KPI), lưu ở đây bị từ chối (PARAM_BACKED_BY_SETTINGS);
   - chỉ đọc: máy chủ đặt readOnly (mục cố định, hệ thống).
   Còn lại là mục sửa được (isEditable). Mục không có wired thì coi như sửa được. Mọi chữ từ máy chủ qua A.esc(). */
(function (A) {
  'use strict';
  const { esc } = A;
  const isSoon = e => e.wired === false;
  const isBacked = e => !!(e.backing && e.backingSection);
  /* Mục switch.* (mốc đổi cách tính lương): giao diện chỉ hiện đúng giá trị máy chủ đang trả, không có chỗ sửa (Check-in
     luôn bật, KPI luôn 5 thành phần), nên không dẫn sang trang khác; mục máy chủ không gửi nữa thì không hiện */
  const isPaySwitch = e => /^switch\./.test(String(e.id || ''));
  const isLocked = e => !!e.readOnly || isSoon(e) || isBacked(e);
  const isEditable = e => !isLocked(e) && e.class !== 'fixed' && e.class !== 'removed';

  /* Giá trị hiện tại của mục chưa dùng được, một dòng. fmt: { optLabel, fmtVal, fmtAny, instLabel, max } của view-tham-so.js */
  function soonValue(e, fmt) {
    const insts = e.instances || [];
    let t;
    if (e.ui && e.ui.component === 'table') t = Array.isArray(e.value) ? `Bảng ${e.value.length} dòng` : 'Bảng';
    else if (insts.length)
      t = insts
        .map(i => {
          const v = fmt.optLabel(i.rules || e.rules, i.value) ?? fmt.fmtVal(e.ui && e.ui.unit, i.value);
          return insts.length > 1 ? `${fmt.instLabel(e, i)}: ${v}` : v;
        })
        .join('; ');
    else t = e.value !== undefined ? fmt.fmtAny(e.value) : 'Chưa có';
    return t.length > fmt.max ? t.slice(0, fmt.max) + '…' : t;
  }

  /* Một mục chỉ đọc: tên, một dòng giải thích, giá trị hoặc "Khoá" bên phải; mục có bảng thì bảng gập trong "Xem bảng";
     mục sửa ở màn khác có liên kết tới màn đó. Tên dạng "X: y" tách thành tên "X" và giải thích "y". */
  function roRow(e, o) {
    const m = /^([^:]{3,}):\s*(.+)$/.exec(e.label || '');
    const name = m ? m[1] : e.label;
    const help = e.ui && e.ui.help ? String(e.ui.help).replace(/`/g, '') : '';
    const up = t => t.charAt(0).toUpperCase() + t.slice(1);
    const desc = up([m ? m[2] : '', help].filter(Boolean).join(' · '));
    const insts = e.instances || [];
    const single = insts.length === 1 && !(e.ui && /table/i.test(e.ui.component || ''));
    const v = single
      ? (o.fmt.optLabel(insts[0].rules || e.rules, insts[0].value) ?? o.fmt.fmtVal(e.ui && e.ui.unit, insts[0].value))
      : 'Khoá';
    const body = !single && o.bodyFor ? o.bodyFor(e) : '';
    const flat = insts.length > 1 && !insts.some(i => Array.isArray(i.value)); // nhiều giá trị đơn (theo chức vụ): hiện ngay
    const table = /<table/.test(body)
      ? `<details class="cdx-rot"><summary class="cap">Xem bảng</summary>${body}</details>`
      : flat
        ? `<div class="cdx-roi">${body}</div>`
        : '';
    const back =
      isBacked(e) && !isPaySwitch(e)
        ? `<button type="button" class="link" data-act="cdsec" data-v="${esc(e.backingSection)}">Sửa ở ${esc((A.CaiDatSecLabel && A.CaiDatSecLabel(e.backingSection)) || e.backingSectionLabel || e.backingSection)}</button>`
        : `<span class="v">${esc(v)}</span>`;
    return `<div class="px-entry cdx-ro" id="px-e-${esc(o.domId(e.id))}" data-eid="${esc(e.id)}"><div class="t"><b>${esc(name)}</b>${desc ? `<span>${esc(desc)}</span>` : ''}${table}</div>${back}</div>`;
  }
  /* Phần thân của thẻ một nhóm. o: { shown, gid, soonOpen, entryHtml(e, compact), bodyFor(e), fmt, domId }
     Trả { html }. */
  function sections(o) {
    const editable = o.shown.filter(isEditable);
    const soon = o.shown.filter(isSoon);
    const readonly = o.shown.filter(e => !isEditable(e) && !isSoon(e));
    const row = e =>
      `<li class="px-soonrow" id="px-e-${esc(o.domId(e.id))}" data-eid="${esc(e.id)}"><span class="px-soonlabel">${esc(e.label)}</span><span class="px-soonval">${esc(soonValue(e, o.fmt))}</span></li>`;
    const ro = readonly.length
      ? `<div class="cdx-sech">Chỉ đọc · ${readonly.length} mục · đặt theo quy chế hoặc hệ thống, không sửa ở đây</div>${readonly.map(e => roRow(e, o)).join('')}`
      : '';
    const soonHtml = soon.length
      ? `<details class="px-soon cdx-soon2" ${o.soonOpen ? 'open' : ''}><summary class="px-soonsum" data-act="pxsoon" data-g="${esc(o.gid)}"><b>Sắp có · ${soon.length} mục</b> · đã có trong danh mục nhưng phần tính lương chưa dùng tới nên chưa sửa được</summary><ul class="px-soonlist">${soon.map(row).join('')}</ul></details>`
      : '';
    const empty = !editable.length && !readonly.length && !soon.length;
    const none = empty
      ? A.empty('Nhóm này chưa có mục nào')
      : editable.length
        ? ''
        : A.empty('Nhóm này chưa có mục nào sửa được', 'Các mục còn lại ở bên dưới: chỉ đọc hoặc sắp có.');
    return {
      html: `${editable.map(e => o.entryHtml(e)).join('')}${none ? `<div class="cdx-pad">${none}</div>` : ''}${ro}${soonHtml ? `<div class="cdx-tail">${soonHtml}</div>` : ''}`
    };
  }
  const soonOpen = new Set(); // nhóm có mục "Sắp có" đang mở
  A.actions.pxsoon = el => {
    const id = String(el.dataset.g);
    if (el.parentElement.open)
      soonOpen.delete(id); // sự kiện đến trước khi hộp đổi trạng thái
    else soonOpen.add(id);
  };
  /* Số trên thẻ nhóm: chỉ đếm mục sửa được. Nhóm chưa tải (hoặc nhóm chỉ đọc ở Nâng cao) giữ số mục của máy chủ */
  const groupCount = (gr, x, advanced) =>
    !gr || advanced.includes(x.id) ? x.count : gr.entries.filter(isEditable).length;
  /* Tên mục trong thẻ cài đặt lần đầu: mục chưa nối vào bộ máy vẫn hiện (đang chờ xác nhận) nhưng không dẫn tới ô nhập, vì chưa có ô nhập nào lưu được */
  const frName = (it, e) =>
    e && isSoon(e)
      ? `<span class="px-frname">${esc(it.label)}</span> ${A.pill('draft', 'chưa dùng được')}`
      : `<button type="button" class="link" data-act="pxopen" data-id="${esc(it.id)}" data-g="${esc(it.group)}">${esc(it.label)}</button>`;
  A.PxKind = { isSoon, isBacked, isLocked, isEditable, sections, soonOpen, groupCount, frName };
})(window.Admin);
