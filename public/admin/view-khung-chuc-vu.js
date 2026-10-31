/* Cài đặt › hộp "Thêm chức vụ" (POST /api/positions): sao chép chế độ từ một chức vụ có sẵn.
   Tên chức vụ do người dùng đặt qua A.esc(). */
(function (A) {
  'use strict';
  const { esc, ic, S } = A;
  const kit = () => A.PxKit;
  const REASON_MAX = 300;
  const LABEL_MAX = 40; // theo máy chủ: tên chức vụ từ 1 đến 40 ký tự
  const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

  /* ---------- thêm chức vụ (POST /api/positions) ---------- */
  const openAddPos = () => {
    const list = A.positions.list().filter(p => !p.deprecated);
    const month = S.month;
    const body = `<div class="formrow"><label class="lbl" for="np-label">Tên chức vụ</label><input id="np-label" class="input" maxlength="${LABEL_MAX}" autocomplete="off" placeholder="Ví dụ: Trưởng nhóm"></div>
<div class="formrow"><label class="lbl" for="np-copy">Sao chép chế độ từ</label><select id="np-copy" class="input">${list.map(p => `<option value="${esc(p.code)}">${esc(p.label)}</option>`).join('')}</select><span class="cap">Chức vụ mới có cùng bậc, lương và chế độ với chức vụ này; sửa sau trong bảng Chế độ theo loại nhân sự.</span></div>
<div class="formgrid"><div class="formrow"><label class="lbl" for="np-month">Áp dụng từ tháng</label><input id="np-month" class="input" type="month" value="${esc(month)}"></div></div>
<div class="formrow"><label class="lbl" for="np-reason">Lý do <small>(không bắt buộc)</small></label><textarea id="np-reason" class="input" maxlength="${REASON_MAX}" placeholder="Ghi rõ lý do để lưu vào nhật ký"></textarea></div>`;
    let touched = false;
    A.openDialog({
      title: 'Thêm chức vụ',
      sub: 'Sao chép từ một chức vụ có sẵn rồi sửa chế độ',
      body,
      foot: [
        { label: 'Huỷ' },
        {
          label: 'Thêm chức vụ',
          cls: 'pri cdx-plus',
          onClick: async api => {
            const v = id => (document.getElementById(id) || {}).value || '';
            const label = v('np-label').trim().replace(/\s+/g, ' ');
            const copyFrom = v('np-copy');
            const eff = v('np-month');
            const reason = v('np-reason').trim();
            if (!label) throw new Error('Nhập tên chức vụ.');
            if (label.length > LABEL_MAX) throw new Error(`Tên chức vụ tối đa ${LABEL_MAX} ký tự.`);
            if (/[<>]/.test(label)) throw new Error('Tên chức vụ không được chứa dấu < hoặc >.');
            if (A.positions.list().some(p => A.fold(p.label) === A.fold(label)))
              throw new Error('Đã có chức vụ trùng tên này. Đặt tên khác.');
            if (!copyFrom) throw new Error('Chọn chức vụ để sao chép chế độ.');
            if (!MONTH_RE.test(eff)) throw new Error('Chọn tháng áp dụng.');
            // lý do không bắt buộc, chỉ giữ trần độ dài
            if (reason.length > REASON_MAX) throw new Error(`Lý do tối đa ${REASON_MAX} ký tự (hiện có ${reason.length}).`);
            try {
              await A.api('POST', '/positions', { label, copyFrom, effectiveMonth: eff, reason });
            } catch (e) {
              if (
                e.status === 404 ||
                e.status === 405 ||
                (e.status === 403 && e.data && e.data.code === 'NO_ROUTE_POLICY')
              )
                throw new Error('Máy chủ chưa có chức năng thêm chức vụ.');
              const code = (e.data && e.data.code) || '';
              if (code === 'POSITION_CODE_CLASH') throw new Error('Tên này trùng với một chức vụ đã có. Đặt tên khác.');
              if (code === 'POSITION_LIMIT') throw new Error(A.errText(e)); // câu của máy chủ: đã đủ số chức vụ tối đa
              if (code === 'POSITION_UNKNOWN')
                throw new Error('Chức vụ nguồn không còn. Chọn lại chức vụ để sao chép.');
              if (code === 'PERIOD_LOCKED') {
                const min = e.data && e.data.minEffectiveMonth;
                const el = document.getElementById('np-month');
                if (MONTH_RE.test(min || '') && el) el.value = min;
                throw new Error(
                  MONTH_RE.test(min || '')
                    ? `Tháng này đã chốt. Đã đổi tháng áp dụng sang ${A.monthLabel(min)}, bấm Thêm chức vụ lần nữa để xác nhận.`
                    : 'Tháng này đã chốt, chọn tháng áp dụng khác.'
                );
              }
              throw e;
            }
            api.close();
            A.toast(`Đã thêm chức vụ "${label}", áp dụng từ ${A.monthLabel(eff)}`);
            A.positions.refresh();
            A.Params.reset();
            await A.Params.load();
            A.render();
          }
        }
      ]
    });
    const inp = document.getElementById('np-month');
    if (inp) inp.addEventListener('input', () => (touched = true));
    kit()
      .earliestOpenMonth()
      .then(m => {
        const el = document.getElementById('np-month');
        if (el && !touched && MONTH_RE.test(m)) el.value = m;
      });
  };
  /* Thêm chức vụ nạp lại cả kho tham số: ô đang sửa dở (chưa lưu) sẽ mất, nên hỏi trước */
  A.actions.khaddpos = () =>
    A.drafts.guard(openAddPos, { scope: 'params', sub: 'Thêm chức vụ sẽ nạp lại các cài đặt' });
})(window.Admin);
