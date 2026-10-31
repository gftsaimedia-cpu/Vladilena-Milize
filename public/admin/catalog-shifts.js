/* Cài đặt › Lịch, ca & chấm công: đổi tên và loại phụ cấp (Normal, Flex, Night) của một ca trong danh mục ca.
   Giờ vào, giờ ra vẫn sửa trong bảng Ca làm (cai-dat-ky-luong.js, PUT /api/settings/shifts); ở đây chỉ GET/PUT /api/catalog/shifts.
   Mỗi lần mở hộp đọc lại danh mục để có số phiên bản (rev) mới nhất của ca; 409 (SHIFT_STALE) thì báo nguyên văn và nạp lại.
   Mọi chuỗi từ API hay người dùng qua A.esc() trước khi vào innerHTML. */
(function (A) {
  'use strict';
  const { esc, S } = A;

  /* Nhãn ba loại ca máy chủ nhận (kind) */
  const KINDS = [
    ['normal', 'Normal'],
    ['flex', 'Flex'],
    ['night', 'Night']
  ];
  const fld = (id, label, control, small) =>
    `<div class="formrow"><label class="lbl" for="${id}">${esc(label)}${small ? ` <small>${esc(small)}</small>` : ''}</label>${control}</div>`;

  /* Giờ ca dùng chung (A.SHIFTS) và bảng Ca làm nạp lại ngay, không chờ sự kiện máy chủ */
  async function refresh() {
    await A.shiftsLoad(S.month).catch(() => {});
    if (A.CaiDat && typeof A.CaiDat.reloadKyLuong === 'function') await A.CaiDat.reloadKyLuong();
    A.render();
  }

  const fetchShift = code =>
    A.api('GET', '/catalog/shifts').then(
      res => ((res && res.shifts) || []).find(s => s.code === code || s.preset === code) || null
    );

  async function open(code) {
    let shift;
    try {
      shift = await fetchShift(code);
    } catch (e) {
      return A.toast(A.errText(e), 'err');
    }
    if (!shift) return A.toast('Không có ca này trong danh mục.', 'err');
    const known = KINDS.some(([k]) => k === shift.kind);
    const opts = (known ? KINDS : [[shift.kind, String(shift.kind || '—')], ...KINDS])
      .map(([k, l]) => `<option value="${esc(k)}" ${k === shift.kind ? 'selected' : ''}>${esc(l)}</option>`)
      .join('');
    const touched = new Set();
    A.openDialog({
      title: 'Đổi tên, loại ca',
      sub: shift.name,
      width: 560,
      cls: 'cdv-dlg',
      body: `<div class="cdv-g2">${fld('cs-name', 'Tên ca', `<input id="cs-name" class="input" value="${esc(shift.name)}" autocomplete="off">`)}${fld('cs-kind', 'Loại', `<select id="cs-kind" class="input">${opts}</select>`)}</div>
${A.reasonField('cs-reason', 'Lý do (không bắt buộc)')}`,
      // ô Admin đã gõ hay chọn: giữ nguyên khi nạp lại số mới sau 409
      onMount: api => {
        const mark = ev => touched.add(ev.target.id);
        api.root.addEventListener('input', mark);
        api.root.addEventListener('change', mark);
      },
      foot: [
        { label: 'Huỷ' },
        {
          label: 'Lưu',
          cls: 'pri',
          icon: 'check',
          onClick: async api => {
            const name = api.root.querySelector('#cs-name').value.trim();
            const kind = api.root.querySelector('#cs-kind').value;
            const reason = api.root.querySelector('#cs-reason').value.trim();
            if (!name) throw new Error('Nhập tên ca.');
            const changes = {};
            if (name !== shift.name) changes.name = name;
            if (kind !== shift.kind) changes.kind = kind;
            if (!Object.keys(changes).length) throw new Error('Chưa có thay đổi.');
            try {
              await A.api('PUT', '/catalog/shifts', {
                code: shift.code,
                changes,
                expectedRev: shift.rev,
                ...(reason ? { reason } : {})
              });
            } catch (e) {
              // SHIFT_STALE (người khác vừa sửa ca): giữ hộp và các ô đã gõ, lấy số và rev mới, ô chưa gõ hiện số mới để Admin kiểm tra
              // rồi bấm lưu lần nữa (giống hộp Chức vụ & bậc). 409 khác báo nguyên văn, nạp lại không giúp gì
              if (e && e.status === 409 && e.data && e.data.code === 'SHIFT_STALE') {
                // bảng Ca làm phía sau cũng hiện số mới
                const [fresh] = await Promise.all([
                  fetchShift(shift.code).catch(() => null),
                  refresh().catch(() => {})
                ]);
                if (!fresh) throw e; // không đọc lại được ca: báo nguyên văn, rev cũ giữ nguyên nên lần lưu sau vẫn bị chặn
                shift = fresh;
                const nameEl = api.root.querySelector('#cs-name');
                const kindEl = api.root.querySelector('#cs-kind');
                if (!touched.has('cs-name')) nameEl.value = shift.name;
                if (!touched.has('cs-kind') && [...kindEl.options].some(o => o.value === shift.kind))
                  kindEl.value = shift.kind;
                const said = A.errText(e).replace(/[.!?]*\s*$/, '.');
                throw new Error(`${said} Số mới đã được nạp lại, kiểm tra rồi bấm lưu lần nữa.`);
              }
              throw e; // câu của máy chủ hiện nguyên văn trong hộp thoại
            }
            api.close();
            A.toast(`Đã lưu ca ${name}`);
            await refresh();
          }
        }
      ]
    });
  }

  A.CatalogShifts = { open };
})(window.Admin);
