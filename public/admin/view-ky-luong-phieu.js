/* Màn Bảng lương: hộp phiếu lương (ngăn kéo bên phải), chọn và phê duyệt
   hoặc trả lại phiếu, kiểm toàn vẹn kỳ; dùng chung trạng thái màn Bảng lương qua A.Ky.kit.
   Phê duyệt phiếu không chặn vì cờ AI hay chưa chạy AI, ghi chú không bắt buộc, kỳ đã duyệt
   hoặc đã trả lương vẫn sửa số phiếu được (máy chủ cảnh báo PERIOD_FROZEN). Mọi chuỗi từ API qua A.esc(). */
(function (A) {
  'use strict';
  const { esc, ic, nf, S } = A;
  const {
    K,
    view,
    nameOf,
    missingRoute,
    SLIP_PILL,
    can,
    reload,
    rowOf,
    clearSel,
    write,
    noteBox,
    reasonArea,
    btnIcon,
    warnResult,
    approving,
    vnd,
    mFull,
    SLIP_PAGE_MAX,
    ERR_LIST_SHOW
  } = A.Ky.kit;
  // Trạng thái phiếu trên hộp phiếu; trạng thái khác dùng bảng của màn Bảng lương
  const STATUS = {
    draft: ['draft', 'Nháp'],
    pending: ['pending', 'Chờ phê duyệt'],
    approved: ['done', 'Đã phê duyệt'],
    error: ['rejected', 'Chưa tính được']
  };
  const short = iso => {
    const s = iso ? A.fmtStamp(iso) : '—'; // "HH:MM dd/mm/yyyy"
    return s === '—' ? '' : s.slice(6, 11);
  };

  /* ---------- một phiếu từ bản chụp ----------
     Tóm tắt, các dòng có số, sửa số và in A4: view-phieu.js (A.Phieu.mount) và phieu-a4.js. Ở đây chỉ dựng phần đầu hộp (trạng thái,
     lần tính, cảnh báo AI, ghi chú phê duyệt), nút In phiếu / Trả lại / Phê duyệt ở chân hộp, rồi giao phần số cho A.Phieu.mount. */
  A.actions.kyslip = async el => {
    const u = el.dataset.u;
    const est = !view().run; // chưa có lần tính: phiếu ước tính
    const row = est ? ((K.est.data && K.est.data.rows) || []).find(r => r.username === u) || null : null;
    const dlg = A.openDialog({
      title: `Phiếu lương · ${nameOf(u)}`,
      sub: `Kỳ lương ${A.monthLabel(S.month)}`,
      wide: true,
      drawer: true,
      body: '<div class="skel" style="width:60%"></div><div class="skel" style="width:80%"></div>',
      foot: [{ label: 'Đóng' }]
    });
    dlg.root.classList.add('pl-drw');
    try {
      let res;
      if (est) {
        // Chi tiết ước tính từng người; máy chủ chưa có đường dẫn thì dùng các dòng gộp của bảng
        try {
          res = await A.api('GET', `/periods/${K.month}/estimates/${encodeURIComponent(u)}`);
        } catch (e) {
          if (!missingRoute(e)) throw e;
          res = {
            month: K.month,
            run: null,
            source: 'estimate',
            payslip: { username: u, name: row && row.name, status: 'draft', flags: [] }
          };
        }
      } else res = await A.api('GET', `/periods/${K.month}/payslips/${encodeURIComponent(u)}`);
      const p = res.payslip;
      // dòng phụ dưới tên: loại · bậc · kỳ lương
      const terms = p.staffTerms || {};
      const type = p.type || terms.type || (row && row.type);
      const level = p.level != null ? p.level : terms.level != null ? terms.level : row && row.level;
      const subEl = dlg.root.querySelector('.mh .cap');
      if (subEl && type)
        subEl.textContent = `${A.TYPE_SHORT[type] || String(type).toUpperCase()} · ${A.levelText(type, level, K.month)} · kỳ lương ${A.monthLabel(K.month)}`;
      /* MỘT nhãn trạng thái ở đầu hộp, không lặp ý (như "Nháp" + "Bản nháp");
         phần còn lại là chữ thường bên cạnh. Không hiện mã phiên bản bộ máy hay mã băm tham số. */
      const final = !est && res.run && res.run.status === 'final';
      const runNo = res.run && res.run.runNo ? `lần tính ${res.run.runNo}` : '';
      const tag =
        p.status === 'error'
          ? A.pill(...STATUS.error)
          : final
            ? `<span class="pill pl-lockp">${ic('lock', 12)}Chính thức</span>`
            : p.status === 'draft'
              ? A.pill('draft', `Bản nháp${runNo ? ` · ${runNo}` : ''}`)
              : A.pill(...(STATUS[p.status] || SLIP_PILL[p.status] || ['draft', 'Bản nháp']));
      const v = view();
      const lockedAt = final && v && v.stages && v.stages.approved ? v.stages.approved.at : null;
      const meta = est
        ? ''
        : final
          ? `Đã phê duyệt${lockedAt ? `, chốt cùng kỳ lúc ${A.fmtStamp(lockedAt)}` : ''} · phiên bản ${p.rev}`
          : p.status === 'draft'
            ? `Phiên bản ${p.rev}`
            : `Bản nháp${runNo ? ` ${runNo}` : ''} · phiên bản ${p.rev}`;
      const nFlags = (p.flags || []).length;
      const flags = nFlags
        ? `<div class="pl-aibox"><h4 id="ky-dsm-h">Cảnh báo AI · ${nFlags}</h4><div id="ky-dsm" class="col"></div></div>`
        : '';
      const error = p.status === 'error';
      const flaggedAtLoad = nFlags > 0; // phiếu có cờ AI lúc mở: hộp phê duyệt hiện cảnh báo và ô ghi chú
      const body = error
        ? `<div class="warn" role="alert">${ic('alert', 16)}<span>Phiếu chưa tính được. ${esc(p.errorDetail || 'Bộ máy không tính được phiếu này.')}</span></div>`
        : '<div id="pl-mount"></div>';
      dlg.root.querySelector('#dlg-body').innerHTML =
        `<div class="pl-head">${tag}<span class="cap">${esc(meta)}</span></div>
${flags}${p.note ? `<div class="note">${ic('info', 16)}<span>Ghi chú: ${esc(p.note)}${p.decidedBy ? ` (${esc(p.decidedBy)})` : ''}</span></div>` : ''}${body}`;
      const approveCap = !est && can('payroll.approve') && approving(view()); // cả khi đã tính lương, chưa AI kiểm tra
      const foot = dlg.root.querySelector('.mf');
      const dsm = dlg.root.querySelector('#ky-dsm');
      if (dsm)
        A.Dismiss.mount(dsm, {
          month: K.month,
          username: u,
          flags: p.flags,
          onChange: left => {
            p.flags = left;
            const h = dlg.root.querySelector('#ky-dsm-h');
            if (h) h.textContent = left.length ? `Cảnh báo AI · ${left.length}` : 'Cảnh báo AI · đã bỏ qua hết';
            reload();
          }
        });
      // Chân hộp: In phiếu bên trái; Trả lại, Phê duyệt (hoặc Đóng) bên phải
      const extra = [];
      if (!error)
        extra.push(
          `<button type="button" class="btn pl-print1" data-act="plprint1" data-u="${esc(u)}" disabled>${ic('printer', 16)}In phiếu</button>`
        );
      const canApprove = approveCap && (p.status === 'pending' || p.status === 'draft');
      if (approveCap && (p.status === 'pending' || p.status === 'approved'))
        extra.push(`<button type="button" class="btn" data-ky-decide="return">Trả lại</button>`);
      if (canApprove)
        extra.push(
          `<button type="button" class="btn pri" data-ky-decide="approve">${ic('check', 16)}Phê duyệt phiếu này</button>`
        );
      foot.insertAdjacentHTML('afterbegin', extra.join(''));
      if (canApprove) foot.querySelector('[data-dlg-btn]')?.remove(); // có nút Phê duyệt thì đóng bằng dấu ×
      foot.querySelectorAll('[data-ky-decide]').forEach(b =>
        b.addEventListener('click', () => {
          A.closeDialog();
          K.sel.clear();
          decideDialog([u], b.dataset.kyDecide, { flagged: flaggedAtLoad, flags: p.flags });
        })
      );
      if (!error)
        await A.Phieu.mount(dlg.root.querySelector('#pl-mount'), dlg, {
          res,
          row,
          month: K.month,
          holidays: (view().run && view().run.switches && view().run.switches.holidays) || res.holidays || null, // ngày lễ của lần tính (ước tính: máy chủ trả res.holidays)
          status: view().status,
          canRead: can('payroll.override'),
          canWrite: can('payroll.override'),
          // Sau khi lưu / bỏ số đã sửa: đọc lại kỳ từ máy chủ để bảng, tổng kỳ và thẻ "Đã sửa số" phía sau hộp khớp số chi trả mới
          onSaved: () => reload()
        });
    } catch (e) {
      dlg.error(A.errText(e));
    }
  };

  /* ---------- phiếu: chọn, phê duyệt, trả lại ---------- */
  const DECIDE_CHUNK = 200; // số phiếu tối đa mỗi lượt PUT .../payslips/decide (mặc định system.approval.maxDecideItems)
  A.actions.kysel = el => {
    const u = el.dataset.u;
    if (el.checked) {
      K.sel.add(u);
      const row = rowOf(u);
      if (row) K.revs.set(u, row.rev);
    } else {
      K.sel.delete(u);
      K.revs.delete(u);
    }
    A.render();
  };
  A.actions.kyselnone = () => (clearSel(), A.render());
  /* Gom phiếu của cả kỳ theo bộ lọc đang bật (tìm tên, loại nhân sự), qua mọi trang: bảng chỉ hiện một trang nên phải lấy lại từ máy chủ từng trang
     200 phiếu. all = false: phiếu chờ phê duyệt KHÔNG có cảnh báo AI (bộ lọc trạng thái khác "Chờ phê duyệt" hoặc "Có cảnh báo AI" thì không có phiếu nào).
     all = true: mọi phiếu chưa phê duyệt (chờ phê duyệt hoặc bản nháp), có cảnh báo AI hay không. */
  async function pickSlips(all) {
    const f = K.q;
    const ok = all ? ['pending', 'draft'] : ['pending'];
    if ((f.status && !ok.includes(f.status)) || (!all && f.flag === '1')) return [];
    const out = [];
    const month = K.month;
    for (let page = 1; ; page += 1) {
      const o = {
        status: all ? f.status : 'pending',
        flag: all ? f.flag : '',
        page,
        pageSize: SLIP_PAGE_MAX,
        q: f.q.trim(),
        type: K.typeOk ? f.type : ''
      };
      const res = await A.api('GET', `/periods/${month}/payslips${A.qs(o)}`);
      if (month !== K.month) return null; // đổi tháng giữa chừng
      const rows = res.rows || [];
      for (const r of rows) if (ok.includes(r.status) && (all || !(r.flags || []).length)) out.push(r);
      if (!rows.length || page * res.pageSize >= res.total) return out;
    }
  }
  async function gather(all) {
    if (!K.slips.data || K.selBusy) return;
    K.selBusy = true;
    A.render();
    try {
      const rows = await pickSlips(all);
      if (!rows) return;
      clearSel();
      for (const r of rows) {
        K.sel.add(r.username);
        K.revs.set(r.username, r.rev);
      }
      const what = all ? 'chưa phê duyệt' : 'không có cảnh báo AI';
      if (!rows.length)
        A.toast(all ? 'Không có phiếu nào chưa phê duyệt' : 'Không có phiếu chờ phê duyệt nào không kèm cảnh báo AI');
      else A.toast(`Đã chọn ${nf(rows.length)} phiếu ${what}`);
    } catch (e) {
      A.toast(`Không gom được phiếu: ${A.errText(e)}`);
    } finally {
      K.selBusy = false;
      A.render();
    }
  }
  A.actions.kyselclean = () => gather(false);
  A.actions.kyselall = () => gather(true);
  const itemsFor = names => {
    const byUser = new Map(((K.slips.data && K.slips.data.rows) || []).map(r => [r.username, r]));
    return names.map(u => ({
      username: u,
      rev: byUser.get(u) ? byUser.get(u).rev : K.revs.has(u) ? K.revs.get(u) : -1
    }));
  };
  /* Phê duyệt hoặc trả lại phiếu: ghi chú không bắt buộc, lô gồm cả phiếu có cảnh báo AI và bản nháp; cảnh báo của máy chủ hiện nguyên văn trong hộp */
  function decideDialog(names, action, { flagged, flags } = {}) {
    const isReturn = action === 'return';
    const askNote = isReturn || flagged;
    const single = !isReturn && flagged && names.length === 1;
    const n = names.length;
    const chunks = Math.ceil(n / DECIDE_CHUNK);
    const runNo = view().run ? view().run.runNo : '';
    const row = single ? rowOf(names[0]) : null;
    const listed = `<div class="col bl-fld" style="gap:6px"><span class="lbl">Phiếu</span><span class="bl-names">${esc(names.slice(0, ERR_LIST_SHOW).map(nameOf).join(', '))}${n > ERR_LIST_SHOW ? ` <span class="cap">và ${nf(n - ERR_LIST_SHOW)} phiếu khác</span>` : ''}</span></div>`;
    const lot = `Phê duyệt cả loạt hoặc không phiếu nào: nếu một phiếu sai, cả loạt bị từ chối và báo rõ phiếu nào.${chunks > 1 ? ` Máy chủ nhận tối đa ${nf(DECIDE_CHUNK)} phiếu mỗi lượt nên ${nf(n)} phiếu được gửi thành ${nf(chunks)} lượt liên tiếp; lượt nào lỗi thì dừng, các lượt trước đó vẫn có hiệu lực.` : ''}`;
    const body = isReturn
      ? `${noteBox('warn', 'alert', 'Phiếu trả lại về "Bản nháp" kèm ghi chú.')}${listed}${reasonArea('ky-note', 'Ghi chú trả lại')}`
      : flagged
        ? `${noteBox('', 'info', 'Phiếu còn cảnh báo AI: xem lại từng cảnh báo, bỏ qua kèm lý do nếu cần. Phê duyệt vẫn được, cảnh báo không chặn.')}${single ? '<div id="ky-dsm" class="col" style="gap:8px"></div>' : listed}${reasonArea('ky-note', 'Ghi chú phê duyệt')}`
        : `${noteBox('warn', 'alert', `${lot} Phiếu có cảnh báo AI và phiếu chưa qua AI kiểm tra vẫn được phê duyệt.`)}${listed}`;
    const dlg = A.openDialog({
      title: `${isReturn ? `Trả lại ${nf(n)} phiếu` : flagged ? 'Phê duyệt phiếu có cảnh báo AI' : `Phê duyệt ${nf(n)} phiếu`}`,
      sub: single
        ? `${row && row.name ? row.name : nameOf(names[0])}${row && row.type ? ` · ${A.TYPE_SHORT[row.type] || row.type}${row.level != null ? ` · ${A.levelText(row.type, row.level, K.month)}` : ''}` : ''}${row && row.net != null ? ` · thực nhận ${vnd(row.net)}` : ''}`
        : `Bản nháp lần tính ${runNo}`,
      body,
      foot: [
        { label: 'Huỷ' },
        {
          label: isReturn ? 'Trả lại' : flagged ? 'Phê duyệt' : `Phê duyệt ${nf(n)} phiếu`,
          cls: isReturn ? 'danger' : 'pri',
          onClick: async api => {
            const note = askNote ? A.readReason('ky-note') : undefined; // có thể rỗng
            const items = itemsFor(names);
            const warnings = [];
            let done = 0;
            try {
              // Mỗi lượt tối đa DECIDE_CHUNK phiếu; mỗi lượt là "cả loạt hoặc không phiếu nào"
              for (let i = 0; i < items.length; i += DECIDE_CHUNK) {
                const part = items.slice(i, i + DECIDE_CHUNK);
                const res = await write(
                  'PUT',
                  `/periods/${K.month}/payslips/decide`,
                  { items: part, action, ...(note ? { note } : {}) },
                  { warnings: 'manual' }
                );
                if (res && Array.isArray(res.warnings)) warnings.push(...res.warnings);
                done += part.length;
                for (const x of part) {
                  K.sel.delete(x.username);
                  K.revs.delete(x.username);
                  names.splice(names.indexOf(x.username), 1); // bấm lại sau lỗi chỉ gửi phần còn lại
                }
              }
            } catch (e) {
              const code = e && e.cause && e.cause.data && e.cause.data.code;
              if (code === 'PAYSLIP_STALE') clearSel(); // rev đã giữ của phiếu ở trang khác không còn đúng: chọn lại từ bảng vừa tải
              if (warnings.length) A.showWarnings(warnings); // cảnh báo của các lượt đã lưu
              if (done) {
                await reload();
                A.toast(
                  `${`Đã ${isReturn ? 'trả lại' : 'phê duyệt'} ${nf(done)} phiếu`}; còn ${nf(items.length - done)} phiếu chưa xử lý`
                );
              }
              throw e;
            }
            const text = `${isReturn ? 'Đã trả lại' : 'Đã phê duyệt'} ${nf(done)} phiếu`;
            await reload();
            if (!warnResult(api, { warnings }, text)) {
              A.toast(text);
              api.close();
            }
          }
        }
      ]
    });
    if (!isReturn) btnIcon(dlg, 'check');
    if (single) {
      const box = dlg.root.querySelector('#ky-dsm');
      A.Dismiss.mount(box, {
        month: K.month,
        username: names[0],
        flags: flags || [],
        onChange: () => {
          dlg.error('');
          reload();
        }
      });
    }
  }
  /* Hộp "Bỏ qua có lý do" của khung AI: mọi phiếu còn cảnh báo, mỗi cảnh báo một nút Bỏ qua kèm ô lý do */
  A.actions.kyflags = async () => {
    const dlg = A.openDialog({
      title: 'Bỏ qua cảnh báo của AI',
      sub: `Kỳ lương tháng ${mFull()}`,
      wide: true,
      body: '<div class="skel" style="width:60%"></div><div class="skel" style="width:80%"></div>',
      foot: [{ label: 'Đóng' }]
    });
    try {
      const res = await A.api('GET', `/periods/${K.month}/payslips?flag=1&pageSize=${SLIP_PAGE_MAX}`);
      const rows = (res.rows || []).filter(r => (r.flags || []).length);
      const body = dlg.root.querySelector('#dlg-body');
      const person = (r, i) =>
        `<div class="col" style="gap:8px;padding-top:12px;${i ? 'border-top:1px solid var(--rule)' : ''}"><b>${esc(r.name || nameOf(r.username))} <span class="cap mono">${esc(r.username)}</span></b><div data-dsm-user="${esc(r.username)}" class="col" style="gap:8px"></div></div>`;
      body.innerHTML = `${noteBox('', 'info', 'Bỏ qua một cảnh báo được ghi vào nhật ký. AI chỉ gợi ý: bỏ qua không đổi số tiền nào.')}${rows.length ? rows.map(person).join('') : A.empty('Không còn phiếu nào có cảnh báo', 'Mọi cảnh báo đã được bỏ qua hoặc không có.')}`;
      for (const r of rows)
        A.Dismiss.mount(body.querySelector(`[data-dsm-user="${CSS.escape(r.username)}"]`), {
          month: K.month,
          username: r.username,
          flags: r.flags,
          onChange: () => reload()
        });
    } catch (e) {
      dlg.error(A.errText(e));
    }
  };
  A.actions.kybatch = el => {
    const names = [...K.sel];
    if (!names.length) return;
    decideDialog(names, el.dataset.a);
  };

  A.actions.kyverify = async () => {
    K.verify = { state: 'loading', data: null, error: '' };
    A.render();
    try {
      K.verify = { state: 'ok', data: await A.api('GET', `/periods/${K.month}/verify`), error: '' };
    } catch (e) {
      K.verify = { state: 'fail', data: null, error: A.errText(e) };
    }
    A.render();
  };
})(window.Admin);
