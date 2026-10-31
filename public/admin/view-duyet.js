/* Màn Yêu cầu (route #duyet): một chỗ xử lý các yêu cầu tự khai (GET /api/approvals, PUT /api/approvals/decide).
   Tab theo trạng thái, phạm vi "Tháng đang xem" / "Mọi tháng". Yêu cầu chờ xử lý của tháng đang xem chia theo việc cần làm:
   "Có cảnh báo AI" (mở "Xem lý do", ghi lý do, xử lý từng cái) và "Không có cảnh báo" (chọn rồi đồng ý cả loạt).
   Cảnh báo AI chỉ để xem, không chặn. Mọi yêu cầu chờ xử lý
   (có cảnh báo AI, AI chưa kiểm tra, tháng khác) có ô chọn, vào loạt "Đồng ý N yêu cầu" và có nút Đồng ý riêng; lý do không bắt buộc. */
(function (A) {
  'use strict';
  const { esc, nf, ic, S } = A;
  const PAGE = 'duyet';
  const MAX_BATCH = 200; // khớp MAX_DECIDE_ITEMS của máy chủ
  const STEP = 20; // số dòng thêm mỗi lần bấm "Xem thêm"
  const LIST_MAX = 8; // hộp đồng ý cả loạt: liệt kê tối đa ngần này yêu cầu, còn lại ghi "và N yêu cầu khác"
  const D = {
    loading: false,
    error: null,
    rows: [],
    section: 'requests',
    counts: { pending: 0, approved: 0, rejected: 0 }, // của phạm vi đang xem (máy chủ đếm trước khi lọc trạng thái)
    countsMonth: null, // của tháng đang xem
    countsAll: null, // của mọi tháng
    sel: new Set(),
    selAuto: true, // chưa chạm ô chọn nào: mặc định chọn sẵn mọi yêu cầu không có cảnh báo
    notice: null,
    token: 0
  };
  const keyOf = r => `${r.username}|${r.date}`;
  const status = () => S.f.dst || 'pending';
  const scope = () => S.f.dscope || 'month'; // mặc định tháng đang xem; "Mọi tháng" là hộp thư mà huy hiệu bên menu đếm
  const body = r => ({ username: r.username, date: r.date, rev: r.rev, fingerprint: r.fingerprint });
  const inMonth = r => r.date.slice(0, 7) === S.month;
  const monthNo = () => `tháng ${Number(S.month.slice(5))}`; // "tháng 11": thanh kỳ lương ở trên đã ghi năm
  const cap1 = s => s.charAt(0).toUpperCase() + s.slice(1);
  const countOf = (c, st) => (!c ? null : st === 'all' ? c.pending + c.approved + c.rejected : c[st]);

  async function load() {
    const token = ++D.token;
    D.loading = true;
    D.error = null;
    A.loadAi();
    const advance = A.UngLuong ? A.UngLuong.load() : Promise.resolve(); // yêu cầu ứng lương (view-ung-luong.js), tải song song
    const explain = A.GiaiTrinh ? A.GiaiTrinh.load() : Promise.resolve(); // giải trình (view-giai-trinh.js), tải song song
    if (A.staff.state !== 'ok') A.loadStaff().then(() => S.view === PAGE && A.render()); // chức vụ, bậc dưới tên
    try {
      const rows = [];
      let counts = D.counts;
      const month = scope() === 'month' ? S.month : '';
      for (let off = 0; ; off += 500) {
        const res = await A.api('GET', '/approvals' + A.qs({ status: status(), month, limit: 500, offset: off }));
        counts = res.counts;
        rows.push(...res.items);
        if (res.items.length < 500 || rows.length >= 20000) break;
      }
      // Số đếm của phạm vi còn lại (máy chủ đếm trước khi phân trang nên một dòng là đủ): tab, nút phạm vi và câu tóm tắt cần cả hai
      let other = null;
      try {
        other = (await A.api('GET', '/approvals' + A.qs({ status: 'pending', month: month ? '' : S.month, limit: 1 })))
          .counts;
      } catch (e) {
        other = null;
      }
      if (token !== D.token) return;
      D.rows = rows;
      D.counts = counts;
      D.countsMonth = month ? counts : other;
      D.countsAll = month ? other : counts;
      D.sel.clear();
      D.selAuto = true;
      await Promise.all([advance, explain]);
    } catch (e) {
      if (token === D.token) D.error = A.errText(e);
    } finally {
      if (token === D.token) D.loading = false;
    }
  }

  /* ---------- nội dung khai ---------- */
  const declText = r => {
    const d = r.declared || {};
    const parts = [];
    const before = d.extraIn && d.in && d.extraIn !== d.in ? `${d.extraIn}–${d.in}` : '';
    const after = d.extraOut && d.out && d.extraOut !== d.out ? `${d.out}–${d.extraOut}` : '';
    if (r.item === 'ot' && r.holiday) {
      parts.push(d.in && d.out ? `${d.in}–${d.out}` : 'Cả ngày');
    } else if (r.item === 'ot' || r.item === 'makeup_hours') {
      parts.push([before, after].filter(Boolean).join(' và ') || 'Chưa có giờ');
      if (d.in && d.out) parts.push(`ca ${d.in}–${d.out}`);
    } else if (r.item === 'willmakeup') {
      parts.push('Nghỉ, sẽ làm bù');
    } else {
      parts.push('Cả ngày');
    }
    return parts.join(' · ');
  };
  const statusPill = r =>
    ({
      pending: A.pill('pending', 'Chờ xử lý'),
      approved: A.pill('done', 'Đã đồng ý'),
      rejected: A.pill('rejected', 'Đã từ chối')
    })[r.status] || '';

  /* ---------- loạt: mọi yêu cầu chờ xử lý ---------- */
  const review = () => (A.ai.month === S.month ? A.ai : null);
  const aiOk = () => !!review() && review().state === 'ok';
  const joined = r => A.aiJoin(r, review());
  const batchable = r => r.status === 'pending';
  const sentence = t => (/[.!?…]$/.test(t) ? t : t + '.');

  function visibleRows() {
    const type = S.f.dtype || '',
      flag = S.f.dflag || '',
      qtext = A.fold(S.q[PAGE] || '');
    return D.rows.filter(r => {
      if (type && r.item !== type) return false;
      if (qtext && !A.fold(`${r.name || ''} ${r.username}`).includes(qtext)) return false;
      if (flag) {
        const st = joined(r).state;
        if (flag === 'flagged' && st !== 'flagged') return false;
        if (flag === 'clean' && st !== 'clean') return false;
      }
      return true;
    });
  }
  /* Yêu cầu đang hiện kèm ô chọn: tháng đang xem thì mọi yêu cầu chờ xử lý; "Mọi tháng" thì các dòng đang hiện của các tháng khác
     (tháng đang xem chỉ có thẻ tóm tắt) */
  function pickable(list = visibleRows()) {
    const rows = list.filter(batchable);
    if (status() !== 'pending') return [];
    return scope() === 'month' ? rows : rows.filter(r => !inMonth(r)).slice(0, shownCount());
  }
  /* Yêu cầu sẽ gửi khi bấm "Đồng ý N yêu cầu": chưa chạm ô chọn thì mọi yêu cầu có ô chọn đang hiện; đã chọn tay thì đúng các ô đã chọn */
  /* Chọn sẵn (chưa chạm ô nào): chỉ yêu cầu không có cảnh báo AI. Vẫn cho tick thêm yêu cầu có cảnh báo, nhưng không tick hộ */
  const autoPick = list => pickable(list).filter(r => joined(r).state !== 'flagged');
  const selectedRows = list => (D.selAuto ? autoPick(list) : D.rows.filter(r => D.sel.has(keyOf(r)) && batchable(r)));
  /* Một nhóm của bảng: 'all' mọi dòng có ô chọn, hoặc theo kết quả AI 'flagged' | 'clean' | 'unreviewed' */
  const groupOf = g => pickable().filter(r => g === 'all' || joined(r).state === g);

  /* ---------- gửi quyết định ---------- */
  /* Yêu cầu đang gửi (khoá username|ngày): bấm "Đồng ý" hai lần nhanh, hay bấm ở cả màn Yêu cầu lẫn thẻ của Tổng quan, không gửi hai lần.
     Nút của yêu cầu đang gửi bị khoá (A.Duyet.busy) và mở lại khi gửi xong hoặc lỗi. */
  const inflight = new Set();
  let sending = 0; // số lần gửi đang chạy: khoá nút "Đồng ý N yêu cầu"
  const isBusy = r => !!r && inflight.has(keyOf(r));
  async function decide(all, action, note) {
    const rows = all.filter(r => !isBusy(r));
    if (!rows.length) return 0; // các yêu cầu này đang được gửi: không gửi lặp
    const keys = rows.map(keyOf);
    keys.forEach(k => inflight.add(k));
    sending++;
    A.render(); // vẽ lại ngay để các nút của yêu cầu đang gửi bị khoá
    let ok = false;
    try {
      const n = await send(rows, action, note);
      ok = true;
      return n;
    } finally {
      keys.forEach(k => inflight.delete(k));
      sending--;
      if (!ok) A.render(); // lỗi: mở lại nút (gửi xong thì màn đang nạp lại và tự vẽ)
    }
  }
  async function send(rows, action, note) {
    let done = 0;
    // Cảnh báo của máy chủ (tự duyệt yêu cầu của chính mình, kỳ đã chốt...): gom lại, hiện SAU câu "Đã đồng ý" để không bị câu đó che mất
    const warns = [];
    for (let i = 0; i < rows.length; i += MAX_BATCH) {
      const chunk = rows.slice(i, i + MAX_BATCH);
      try {
        const res = await A.api(
          'PUT',
          '/approvals/decide',
          { action, note: note || '', items: chunk.map(body) },
          { warnings: 'manual' }
        );
        done += res.decided;
        if (res && Array.isArray(res.warnings)) warns.push(...res.warnings);
      } catch (e) {
        A.showWarnings(warns); // lần gửi trước đã lưu kèm cảnh báo: vẫn hiện
        if (e.status === 409) {
          const stale = e.data.code === 'APPROVAL_STALE';
          const n = (e.data.items || []).length;
          // Câu của máy chủ hiện nguyên văn; giao diện chỉ nói thêm việc nó đã làm (tải lại danh sách)
          const msg = stale
            ? `${sentence(A.errText(e))} Lần gửi này chưa lưu gì. ${n ? nf(n) + ' yêu cầu vừa được sửa. ' : ''}Danh sách đã được tải lại.`
            : `${sentence(A.errText(e))} Danh sách đã được tải lại.`;
          D.notice = { kind: 'err', text: (done ? `Đã lưu ${nf(done)} yêu cầu trước đó. ` : '') + msg };
          A.refreshShell();
          A.loadAi(true);
          A.loadView(S.view); // màn đang mở: Yêu cầu hoặc Tổng quan (dùng chung logic)
          const err = new Error(D.notice.text);
          err.status = 409;
          throw err;
        }
        if (done) e.message = `Đã lưu ${nf(done)} yêu cầu trước đó, lần gửi sau lỗi: ${e.message}`;
        throw e;
      }
    }
    D.notice = null;
    A.toast(`${action === 'approve' ? 'Đã đồng ý' : 'Đã từ chối'} ${nf(done)} yêu cầu`);
    A.showWarnings(warns);
    A.refreshShell();
    A.loadAi(true);
    A.loadView(S.view);
    return done;
  }
  const find = k => D.rows.find(r => keyOf(r) === k);
  const quick = async (rows, action) => {
    try {
      await decide(rows, action, '');
    } catch (e) {
      A.toast(A.errText(e), 'err');
      A.render();
    }
  };
  /* Thêm biểu tượng vào nút chính ở chân hộp thoại (A.openDialog chỉ nhận chữ cho nút) */
  const iconOnPrimary = (root, name) => {
    const b = root && root.querySelector('.mf .btn.pri');
    if (b && !b.querySelector('svg')) b.insertAdjacentHTML('afterbegin', ic(name, 16, 2));
  };

  /* ---------- hành động ---------- */
  A.actions.dstatus = el => {
    S.f.dst = el.dataset.v;
    S.page[PAGE] = 1;
    D.notice = null;
    A.loadView(PAGE);
  };
  A.actions.dsection = el => {
    D.section = el.dataset.v === 'explanations' ? 'explanations' : 'requests';
    S.page[PAGE] = 1;
    A.render();
  };
  A.actions.dopenrequest = () => {
    D.section = 'requests';
    A.render();
  };
  A.actions.dscope = el => {
    S.f.dscope = el.dataset.v;
    S.page[PAGE] = 1;
    A.loadView(PAGE);
    window.scrollTo(0, 0);
  };
  A.actions.dmore = () => {
    S.page[PAGE] = (S.page[PAGE] || 1) + 1;
    A.render();
  };
  A.actions.dairetry = () => A.loadAi(true).then(() => A.render());
  // Lần đầu chạm ô chọn: chép phần đang chọn sẵn thành chọn tay rồi mới đổi
  const materialize = () => {
    if (!D.selAuto) return;
    D.sel = new Set(autoPick().map(keyOf));
    D.selAuto = false;
  };
  A.inputs.selrow = el => {
    materialize();
    if (el.checked) D.sel.add(el.dataset.k);
    else D.sel.delete(el.dataset.k);
    A.render();
  };
  // Ô chọn ở đầu cột. Có data-g (nhiều nhóm): bật/tắt đúng nhóm đó. Không có data-g: chọn lại từ đầu
  A.inputs.dselhead = el => {
    if (el.dataset.g) {
      materialize();
      for (const r of groupOf(el.dataset.g)) {
        if (el.checked) D.sel.add(keyOf(r));
        else D.sel.delete(keyOf(r));
      }
      return A.render();
    }
    D.selAuto = false;
    D.sel.clear();
    if (el.checked) for (const r of visibleRows()) if (batchable(r)) D.sel.add(keyOf(r));
    A.render();
  };
  A.actions.dselall = () => {
    materialize();
    for (const r of pickable()) D.sel.add(keyOf(r));
    A.render();
  };
  // Tiện ích bỏ các yêu cầu có cảnh báo AI khỏi loạt đang chọn
  A.actions.dselnoflag = () => {
    materialize();
    for (const r of groupOf('flagged')) D.sel.delete(keyOf(r));
    A.render();
  };
  A.actions.dselnone = () => {
    D.selAuto = false;
    D.sel.clear();
    A.render();
  };
  /* Ba việc dưới đây nhận một dòng yêu cầu (từ GET /api/approvals) và dùng chung cho màn Yêu cầu và thẻ yêu cầu chờ xử lý của Tổng quan:
     cùng rev và fingerprint gửi lên máy chủ, cùng hộp xác nhận và lý do (không bắt buộc) khi từ chối.
     Đồng ý ngay cả yêu cầu có cảnh báo AI hay AI chưa kiểm tra (cảnh báo chỉ để xem). */
  const approveRow = r => {
    if (!r || r.status !== 'pending' || isBusy(r)) return;
    quick([r], 'approve');
  };
  const rejectRow = r => {
    if (!r || isBusy(r)) return;
    A.confirmDialog({
      title: 'Từ chối yêu cầu này',
      sub: `${r.name || r.username} · ${A.itemLabel(r.item)} · ${A.fmtDate(r.date)}`,
      body: A.reasonField(),
      label: 'Từ chối',
      cls: 'danger',
      onConfirm: async () => {
        await decide([r], 'reject', A.readReason());
      }
    });
  };
  A.actions.dapprove = el => approveRow(find(el.dataset.k));
  A.actions.dreject = el => rejectRow(find(el.dataset.k));
  A.actions.dredecide = el => {
    const r = find(el.dataset.k);
    if (!r || isBusy(r)) return;
    const action = r.status === 'approved' ? 'reject' : 'approve';
    A.confirmDialog({
      title: 'Đổi quyết định',
      sub: `${r.name || r.username} · ${A.itemLabel(r.item)} · ${A.fmtDate(r.date)}`,
      body: `${A.note(`Hiện là <b>${r.status === 'approved' ? 'Đã đồng ý' : 'Đã từ chối'}</b>${r.decidedBy ? ' bởi ' + esc(r.decidedBy) : ''}. Đổi thành <b>${action === 'approve' ? 'Đồng ý' : 'Từ chối'}</b>.`)}${A.reasonField()}`,
      label: action === 'approve' ? 'Đổi thành Đồng ý' : 'Đổi thành Từ chối',
      cls: action === 'approve' ? 'pri' : 'danger',
      onConfirm: async () => {
        await decide([r], action, A.readReason());
      }
    });
  };
  /* Ô tóm tắt yêu cầu ở đầu ngăn kéo "Lý do AI cảnh báo": Nhân sự, Yêu cầu, Giờ, Gửi.
     A.openWhy (ai.js) tự dựng khung này từ cảnh báo và nhận thêm hai ô qua facts; reqBox chỉ là dự phòng khi ngăn kéo không có khung. */
  const sentShort = r => {
    const s = A.fmtStamp(r.submittedAt);
    return s === '—' ? s : s.slice(0, 11); // "09:00 10/11"
  };
  const reqBox = r =>
    `<div class="yc-req">${[
      ['Nhân sự', r.name || r.username],
      ['Yêu cầu', `${A.itemLabel(r.item)} · ${A.fmtDate(r.date)}`],
      ['Giờ', declText(r)],
      ['Gửi', sentShort(r)]
    ]
      .map(([l, v]) => `<div><span>${esc(l)}</span><b>${esc(v)}</b></div>`)
      .join('')}</div>`;
  const whyRow = r => {
    if (!r) return;
    const fs = joined(r).findings;
    if (!fs.length) return;
    const pending = r.status === 'pending';
    // Ghi chú và ô lý do nằm ở chân ngăn kéo, trên hàng nút: lý do không bắt buộc, cảnh báo AI không chặn
    const whyNote =
      'Cảnh báo AI chỉ để xem lại, không chặn đồng ý. Lý do không bắt buộc; nếu ghi, lý do được lưu vào nhật ký.';
    const decideHtml = pending ? `<div class="col yc-why-f">${A.note(whyNote)}${A.reasonField()}</div>` : '';
    const api = A.openWhy(fs, {
      facts: [
        ['Giờ', declText(r)],
        ['Gửi', sentShort(r)]
      ],
      footHtml: decideHtml,
      foot: pending
        ? [
            { label: 'Đóng', cls: 'yc-push' },
            {
              label: 'Từ chối',
              onClick: api => decide([r], 'reject', A.readReason()).then(api.close)
            },
            {
              label: 'Vẫn đồng ý',
              cls: 'pri',
              onClick: api => decide([r], 'approve', A.readReason()).then(api.close)
            }
          ]
        : [{ label: 'Đóng' }]
    });
    // Dự phòng: ngăn kéo chưa có khung tóm tắt hoặc chưa đặt ô lý do thì chèn vào thân hộp (không có ô lý do thì không đồng ý/từ chối được)
    const root = (api && api.root) || document.querySelector('#ovl .modal');
    if (!root) return;
    const bodyEl = root.querySelector('#dlg-body');
    if (bodyEl && !root.querySelector('.tl-req, .yc-req')) bodyEl.insertAdjacentHTML('afterbegin', reqBox(r));
    if (pending && bodyEl && !root.querySelector('#dlg-reason')) bodyEl.insertAdjacentHTML('beforeend', decideHtml);
    if (pending) iconOnPrimary(root, 'check');
  };
  A.actions.dwhy = el => whyRow(find(el.dataset.k));
  A.Duyet = {
    approve: approveRow,
    reject: rejectRow,
    why: whyRow,
    keyOf,
    busy: isBusy, // yêu cầu đang được gửi: nút của nó cần khoá
    state: r => (r && r.status === 'pending' ? joined(r).state : 'done')
  };
  A.actions.dbulk = () => {
    const rows = selectedRows(visibleRows()).filter(r => !isBusy(r));
    if (!rows.length || sending) return;
    const n = rows.length;
    const label = `Đồng ý ${nf(n)} yêu cầu`;
    const flagged = r => joined(r).state === 'flagged';
    const nFlag = rows.filter(flagged).length;
    const nUnrev = rows.filter(r => joined(r).state === 'unreviewed').length;
    const names = rows
      .slice(0, LIST_MAX)
      .map(
        r =>
          `${esc(r.name || r.username)} · ${esc(A.itemLabel(r.item))} ${esc(A.fmtDM(r.date))}${flagged(r) ? ` <span class="yc-aic">${ic('spark', 12, 2)}có cảnh báo AI</span>` : ''}`
      )
      .join('<br>');
    // Loạt có thể gồm yêu cầu có cảnh báo AI hay AI chưa kiểm tra; nói rõ số lượng (đếm từ các dòng đang chọn), không chặn
    const sub = [
      rows.every(inMonth) ? cap1(monthNo()) : rows.some(inMonth) ? 'Nhiều tháng' : 'Các tháng khác',
      nFlag ? `${nf(nFlag)} có cảnh báo AI` : '',
      nUnrev ? `${nf(nUnrev)} AI chưa kiểm tra` : ''
    ]
      .filter(Boolean)
      .join(' · ');
    const caution =
      nFlag || nUnrev
        ? A.note(
            `Loạt này có ${[nFlag ? `${nf(nFlag)} yêu cầu có cảnh báo AI` : '', nUnrev ? `${nf(nUnrev)} yêu cầu AI chưa kiểm tra` : ''].filter(Boolean).join(' và ')}: vẫn đồng ý được${nFlag ? '; nên xem lý do cảnh báo trước nếu chưa xem' : ''}.`,
            'alert'
          )
        : '';
    const more = n > LIST_MAX ? `<br><span class="cap">và ${nf(n - LIST_MAX)} yêu cầu khác</span>` : '';
    const parts = Math.ceil(n / MAX_BATCH);
    const how =
      parts > 1
        ? `Gửi thành ${nf(parts)} lần, mỗi lần tối đa ${nf(MAX_BATCH)} yêu cầu. Nếu có yêu cầu vừa bị sửa, lần gửi đó không được lưu và danh sách sẽ tải lại.`
        : `Mỗi lần gửi tối đa ${nf(MAX_BATCH)} yêu cầu. Nếu có yêu cầu vừa bị sửa, cả loạt không được lưu và danh sách sẽ tải lại.`;
    // Ghi chú của loạt không bắt buộc: viết nhãn tay
    const noteField =
      '<div class="formrow"><label class="lbl" for="dlg-reason">Ghi chú (không bắt buộc)</label><textarea id="dlg-reason" class="input" maxlength="300" placeholder="Ví dụ: đã đối chiếu với lịch làm việc"></textarea></div>';
    A.openDialog({
      title: label,
      sub,
      body: `<div class="col yc-dlist"><span class="lbl">Yêu cầu</span><div>${names}${more}</div></div>${caution}${A.note(how)}${noteField}`,
      foot: [
        { label: 'Huỷ' },
        {
          label,
          cls: 'pri',
          onClick: api => {
            const el = document.getElementById('dlg-reason');
            return decide(rows, 'approve', el ? el.value.trim() : '').then(() => api.close());
          }
        }
      ],
      onMount: api => iconOnPrimary(api.root, 'check')
    });
  };

  /* ---------- ô của bảng ---------- */
  function staffSub(r, lock) {
    const s = A.staff.byUser.get(r.username);
    const parts = s ? [A.typeShort(s), A.levelLabel(s, S.month)] : [r.username];
    if (r.locked && lock) parts.push('tài khoản đã khoá');
    return parts.filter(x => x && x !== '—').join(' · ');
  }
  // lock: ghi "tài khoản đã khoá" dưới tên (bảng không có cột Ghi chú/Kết quả để đặt nhãn khoá)
  const whoCell = (r, lock = true) =>
    `<td class="who"><div class="yc-who">${A.avatar(r.name || r.username)}<div class="yc-who-t"><div class="t" title="${esc(r.username)}">${esc(r.name || r.username)}</div><div class="s">${esc(staffSub(r, lock))}</div></div></div></td>`;
  const itemCell = r =>
    `<td data-label="Loại yêu cầu"><div class="yc-cell"><div class="k">${esc(A.itemLabel(r.item))}</div><div class="ks num">${esc(A.fmtDate(r.date))}</div></div></td>`;
  const makeupPlanText = r => {
    const d = r.declared || {};
    const plans = Array.isArray(d.makeupPlans)
      ? d.makeupPlans
      : d.makeupDate
        ? [{ date: d.makeupDate, from: '', to: '' }]
        : [];
    return plans
      .map(p => `${A.fmtDate(p.date)}${p.from && p.to ? ` ${p.from}–${p.to}` : ' · chưa ghi giờ'}`)
      .join('; ');
  };
  const detailCell = r =>
    `<td data-label="Chi tiết"><div class="yc-cell"><div>${esc(declText(r))}</div>${r.item === 'willmakeup' ? `<div class="ks">Dự kiến làm bù: ${esc(makeupPlanText(r) || 'Chưa khai lịch')}</div>` : ''}<div class="ks">Gửi ${esc(A.fmtStamp(r.submittedAt))}</div></div></td>`;
  const SEV = { high: 0, medium: 1, low: 2 };
  const aiSummary = fs => {
    const sorted = [...fs].sort((a, b) => (SEV[a.severity] ?? 3) - (SEV[b.severity] ?? 3));
    return {
      labels: [...new Set(sorted.map(f => A.ruleLabel(f.rule)))].join(', '),
      title: sorted.map(f => `${A.ruleLabel(f.rule)}: ${f.message || ''}`).join('\n')
    };
  };
  const aiCell = fs => {
    const s = aiSummary(fs);
    return `<td class="yc-aicell" data-label="Cảnh báo AI"><div class="yc-cell"><div class="t">${ic('spark', 14, 2)}${nf(fs.length)} cảnh báo</div><div class="s" title="${esc(s.title)}">${esc(s.labels)}</div></div></td>`;
  };
  /* Nút của yêu cầu đang gửi: khoá cho tới khi gửi xong hoặc lỗi */
  const BUSY = 'disabled aria-busy="true"';
  const busyAttr = k => (inflight.has(k) ? BUSY : '');
  const rejectBtn = k =>
    `<button type="button" class="yc-tact" data-act="dreject" data-k="${esc(k)}" ${busyAttr(k)}>Từ chối</button>`;
  const approveBtn = r =>
    `<button class="btn sm" type="button" data-act="dapprove" data-k="${esc(keyOf(r))}" ${isBusy(r) ? BUSY : ''}>Đồng ý</button>`;
  const whyBtn = k =>
    `<button class="btn sm" type="button" data-act="dwhy" data-k="${esc(k)}" ${busyAttr(k)}>Xem lý do</button>`;
  const noteCell = r => (r.locked ? A.pill('line', 'Tài khoản đã khoá') : '');
  // Yêu cầu có cảnh báo AI: "Xem lý do" (từ chối nằm trong ngăn kéo) và nút Đồng ý như thường
  const pendingActs = r =>
    joined(r).state === 'flagged' ? whyBtn(keyOf(r)) + approveBtn(r) : rejectBtn(keyOf(r)) + approveBtn(r);
  /* Ô chọn của một dòng và ô chọn ở đầu cột. g: nhóm mà ô đầu cột bật/tắt; bỏ trống là cả bảng */
  const checkCell = (r, on) => {
    const k = keyOf(r);
    return `<td class="yc-cb"><input type="checkbox" class="yc-check" id="sel-${esc(k)}" data-input="selrow" data-k="${esc(k)}" ${on ? 'checked' : ''} aria-label="Chọn yêu cầu ${esc(A.itemLabel(r.item))} ngày ${esc(A.fmtDate(r.date))} của ${esc(r.name || r.username)}"></td>`;
  };
  const headCheck = (id, g, allOn, label) =>
    `<th class="yc-cb"><input type="checkbox" class="yc-check yc-selhead" id="${id}" data-input="dselhead"${g ? ` data-g="${g}"` : ''} ${allOn ? 'checked' : ''} aria-label="${esc(label)}"></th>`;
  /* Thanh "Đã chọn N · Bỏ chọn · Đồng ý N yêu cầu". Đếm cả yêu cầu có cảnh báo AI đang chọn (ở nhóm khác) và có nút bỏ chúng ra */
  function selBar(list) {
    const picked = selectedRows(list);
    const nSel = picked.length;
    const nFlag = picked.filter(r => joined(r).state === 'flagged').length;
    const flagTxt = nFlag
      ? `<span class="yc-aic">${ic('spark', 14, 2)}${nf(nFlag)} có cảnh báo AI</span><button type="button" class="yc-tact" data-act="dselnoflag">Bỏ các yêu cầu có cảnh báo</button>`
      : '';
    return `<div class="yc-selbar">${nSel ? `<b>Đã chọn ${nf(nSel)}</b>${flagTxt}<button type="button" class="yc-tact" data-act="dselnone">Bỏ chọn</button>` : '<span>Chưa chọn yêu cầu nào</span>'}<button class="btn pri" type="button" data-act="dbulk" ${!nSel ? 'disabled' : sending ? BUSY : ''}>${ic('check', 16, 2)}Đồng ý ${nSel ? nf(nSel) + ' ' : ''}yêu cầu</button></div>`;
  }

  /* Bảng: cols là danh sách lớp cột (độ rộng ở man-yeu-cau.css), head là các ô tiêu đề */
  const table = (cls, cols, head, rows) =>
    `<div class="tblwrap"><table class="rtable yc-t ${cls}"><colgroup>${cols.map(c => `<col class="${c}">`).join('')}</colgroup><thead><tr>${head.join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
  const card = (title, capText, end, inner, foot = '', label = title) =>
    `<section class="card flush yc-card" aria-label="${esc(label)}">${title ? `<div class="card-h"><h2>${esc(title)}</h2>${capText ? `<span class="cap">${capText}</span>` : ''}${end ? `<div class="end">${end}</div>` : ''}</div>` : ''}${inner}${foot}</section>`;
  const moreFoot = (shown, total, what) =>
    total > 0
      ? `<div class="card-f"><span>Đang hiện ${nf(shown)} trên ${nf(total)} ${what}</span>${shown < total ? `<button type="button" class="link yc-more" data-act="dmore">Xem thêm</button>` : ''}</div>`
      : '';
  const filtered = () => !!(S.f.dtype || S.f.dflag || (S.q[PAGE] || '').trim());
  const emptyBox = title =>
    A.empty(
      filtered() ? 'Không có yêu cầu nào khớp bộ lọc' : title,
      filtered() ? 'Thử đổi loại yêu cầu hoặc từ khoá tìm.' : ''
    );
  const shownCount = () => STEP * Math.max(1, S.page[PAGE] || 1);
  function explanationTable(list) {
    const noted = list.filter(r => r.declared && r.declared.punchNote);
    const rows = noted
      .slice(0, shownCount())
      .map(
        r =>
          `<tr>${whoCell(r, false)}${itemCell(r)}<td data-label="Giải trình"><div class="yc-cell">${esc(r.declared.punchNote)}</div></td><td data-label="Trạng thái">${statusPill(r)}</td><td class="act"><button class="btn sm" type="button" data-act="dopenrequest" data-k="${esc(keyOf(r))}">Mở yêu cầu</button></td></tr>`
      )
      .join('');
    const inner = noted.length
      ? table(
          'yc-explanations',
          ['c-who', 'c-item', 'c-detail', 'c-res', 'c-act2'],
          [
            '<th>Nhân sự</th>',
            '<th>Ngày / loại</th>',
            '<th>Giải trình</th>',
            '<th>Trạng thái</th>',
            '<th><span class="sr">Thao tác</span></th>'
          ],
          rows
        )
      : A.empty(
          'Chưa có giải trình',
          filtered() ? 'Thử đổi bộ lọc hoặc từ khoá tìm.' : 'Các giải trình nhân sự gửi sẽ hiện ở đây.'
        );
    return card(
      '',
      '',
      '',
      inner,
      moreFoot(Math.min(noted.length, shownCount()), noted.length, 'giải trình'),
      'Giải trình'
    );
  }

  /* ---------- Chờ xử lý · tháng đang xem: hai nhóm theo việc cần làm ---------- */
  function othersPending() {
    const m = D.countsMonth ? D.countsMonth.pending : null;
    const a = D.countsAll ? D.countsAll.pending : S.pendingCount;
    return m != null && a != null ? Math.max(0, a - m) : null;
  }
  // "các tháng trước" chỉ khi đã có đủ dòng để biết chắc; không thì "các tháng khác"
  const otherWord = rows => (rows && rows.length && rows.every(r => r.date.slice(0, 7) < S.month) ? 'trước' : 'khác');
  function failBox(rv) {
    const then = 'Chưa biết yêu cầu nào có cảnh báo; đồng ý và từ chối vẫn làm được.';
    return `<div class="warn yc-aifail" role="alert">${ic('alert', 16)}<div class="col" style="gap:6px"><b>Chưa tải được kết quả AI kiểm tra</b><span>${esc(sentence(rv.error || ''))} ${then}</span><div><button class="btn sm" type="button" data-act="dairetry">Thử lại</button></div></div></div>`;
  }
  /* Bảng có ô chọn: yêu cầu AI chưa kiểm tra, tháng khác... vẫn vào loạt được. g: nhóm của ô đầu cột (groupOf) */
  const pickTable = (rows, g) => {
    const on = new Set(selectedRows(visibleRows()).map(keyOf));
    const notes = rows.some(r => r.locked);
    const allOn = rows.length > 0 && rows.every(r => on.has(keyOf(r)));
    return table(
      'yc-plain yc-pick',
      ['c-cb', 'c-who', 'c-item', 'c-detail', ...(notes ? ['c-note'] : []), 'c-act2'],
      [
        headCheck(`yc-selall-${g}`, g, allOn, 'Chọn mọi yêu cầu đang hiện của bảng này'),
        '<th>Nhân sự</th>',
        '<th>Loại yêu cầu</th>',
        '<th>Chi tiết</th>',
        ...(notes ? ['<th>Ghi chú</th>'] : []),
        '<th><span class="sr">Thao tác</span></th>'
      ],
      rows
        .map(r => {
          const sel = on.has(keyOf(r));
          return `<tr class="${sel ? 'sel' : ''}">${checkCell(r, sel)}${whoCell(r, !notes)}${itemCell(r)}${detailCell(r)}${notes ? `<td data-label="Ghi chú">${noteCell(r)}</td>` : ''}<td class="act">${rejectBtn(keyOf(r))}${approveBtn(r)}</td></tr>`;
        })
        .join('')
    );
  };

  function monthPending(list) {
    const others = othersPending();
    const later = others
      ? `<div class="card-f yc-later">${ic('info', 16)}<span>${nf(others)} yêu cầu của các tháng khác AI chưa kiểm tra, xem ở <button type="button" class="link" data-act="dscope" data-v="all">Mọi tháng</button></span></div>`
      : '';
    const rv = review();
    if (!aiOk()) {
      // chưa có kết quả AI vẫn đồng ý được, từng cái hoặc cả loạt
      const loading = !rv || rv.state !== 'fail';
      const banner = loading
        ? A.note(
            `AI đang kiểm tra yêu cầu của ${esc(monthNo())}. Đồng ý và từ chối vẫn làm được; cảnh báo AI (nếu có) hiện khi kiểm tra xong.`,
            'spark'
          )
        : failBox(rv);
      const inner = list.length ? pickTable(list, 'all') : emptyBox(`Không còn yêu cầu nào của ${monthNo()} chờ xử lý`);
      const capText = `${nf(list.length)} yêu cầu · ${loading ? 'AI đang kiểm tra' : 'chưa có kết quả AI kiểm tra'}`;
      return banner + card('Yêu cầu chờ xử lý', capText, list.length ? selBar(list) : '', inner, later);
    }
    const flagged = list.filter(r => joined(r).state === 'flagged');
    const clean = list.filter(r => joined(r).state === 'clean');
    const unrev = list.filter(r => joined(r).state === 'unreviewed');
    const groups = [];
    // mọi nhóm có ô chọn; thanh "Đồng ý N yêu cầu" (đếm cả các nhóm) đặt ở nhóm "Không có cảnh báo", không có thì ở nhóm đầu
    const on = new Set(selectedRows(list).map(keyOf));
    const barAt = clean.length ? 'clean' : flagged.length ? 'flagged' : 'unreviewed';
    if (flagged.length) {
      const rows = flagged
        .map(r => {
          const k = keyOf(r);
          return `<tr class="${on.has(k) ? 'sel' : ''}">${checkCell(r, on.has(k))}${whoCell(r)}${itemCell(r)}${detailCell(r)}${aiCell(joined(r).findings)}<td class="act">${whyBtn(k)}${approveBtn(r)}</td></tr>`;
        })
        .join('');
      groups.push([
        'Có cảnh báo AI',
        `${nf(flagged.length)} yêu cầu · nên xem lý do trước khi đồng ý`,
        barAt === 'flagged' ? selBar(list) : '',
        table(
          'yc-flag',
          ['c-cb', 'c-who', 'c-item', 'c-detail', 'c-ai', 'c-act3'],
          [
            headCheck(
              'yc-selall-flagged',
              'flagged',
              flagged.every(r => on.has(keyOf(r))),
              'Chọn mọi yêu cầu có cảnh báo AI đang hiện'
            ),
            '<th>Nhân sự</th>',
            '<th>Loại yêu cầu</th>',
            '<th>Chi tiết</th>',
            '<th>Cảnh báo AI</th>',
            '<th><span class="sr">Thao tác</span></th>'
          ],
          rows
        )
      ]);
    }
    if (clean.length) {
      const allOn = clean.every(r => on.has(keyOf(r)));
      const rows = clean
        .map(r => {
          const k = keyOf(r);
          const sel = on.has(k);
          return `<tr class="${sel ? 'sel' : ''}">${checkCell(r, sel)}${whoCell(r)}${itemCell(r)}${detailCell(r)}<td class="act">${rejectBtn(k)}</td></tr>`;
        })
        .join('');
      groups.push([
        'Không có cảnh báo',
        `${nf(clean.length)} yêu cầu · có thể đồng ý cả loạt`,
        selBar(list),
        table(
          'yc-clean',
          ['c-cb', 'c-who', 'c-item', 'c-detail', 'c-act'],
          [
            headCheck('yc-selall', 'clean', allOn, 'Chọn mọi yêu cầu không có cảnh báo đang hiện'),
            '<th>Nhân sự</th>',
            '<th>Loại yêu cầu</th>',
            '<th>Chi tiết</th>',
            '<th><span class="sr">Thao tác</span></th>'
          ],
          rows
        )
      ]);
    }
    if (unrev.length)
      groups.push([
        'AI chưa kiểm tra',
        `${nf(unrev.length)} yêu cầu vừa được sửa sau lần AI kiểm tra`,
        barAt === 'unreviewed' ? selBar(list) : '',
        pickTable(unrev, 'unreviewed')
      ]);
    if (!groups.length)
      return card('', '', '', emptyBox(`Không còn yêu cầu nào của ${monthNo()} chờ xử lý`), later, 'Yêu cầu chờ xử lý');
    return groups.map((g, i) => card(g[0], g[1], g[2], g[3], i === groups.length - 1 ? later : '')).join('');
  }

  /* ---------- Chờ xử lý · mọi tháng: tóm tắt tháng đang xem, bảng các tháng khác ---------- */
  function allPending(list) {
    const mine = list.filter(inMonth),
      rest = list.filter(r => !inMonth(r));
    const rv = review();
    let capText = 'Không có yêu cầu nào chờ xử lý',
      extra = '';
    if (mine.length && aiOk()) {
      const nFlag = mine.filter(r => joined(r).state === 'flagged').length,
        nClean = mine.filter(r => joined(r).state === 'clean').length,
        nUnrev = mine.length - nFlag - nClean;
      capText = `${nf(mine.length)} yêu cầu · AI đã kiểm tra`;
      extra =
        (nFlag ? `<span class="yc-aic">${ic('spark', 14, 2)}${nf(nFlag)} có cảnh báo</span>` : '') +
        (nClean ? `<span class="cap">· ${nf(nClean)} có thể đồng ý cả loạt</span>` : '') +
        (nUnrev ? `<span class="cap">· ${nf(nUnrev)} vừa sửa, AI chưa kiểm tra</span>` : '');
    } else if (mine.length)
      capText = `${nf(mine.length)} yêu cầu · ${rv && rv.state === 'fail' ? 'chưa có kết quả AI kiểm tra' : 'AI đang kiểm tra'}`;
    const sum = `<section class="card yc-sum" aria-label="Yêu cầu chờ xử lý của ${esc(monthNo())}"><h2>${esc(cap1(monthNo()))}</h2><span class="cap">${capText}</span>${extra}${mine.length ? `<button class="btn sm" type="button" data-act="dscope" data-v="month">Xem ${esc(monthNo())}</button>` : ''}</section>`;
    const word = otherWord(rest);
    const shown = rest.slice(0, shownCount());
    // các tháng khác (AI chưa kiểm tra) vẫn chọn và đồng ý cả loạt được
    const inner = rest.length
      ? pickTable(shown, 'all')
      : emptyBox(`Không có yêu cầu nào của các tháng ${word} chờ xử lý`);
    return (
      sum +
      card(
        `Các tháng ${word}`,
        `${nf(rest.length)} yêu cầu · AI chưa kiểm tra các tháng này`,
        shown.length ? selBar(list) : '',
        inner,
        moreFoot(shown.length, rest.length, `yêu cầu của các tháng ${word}`)
      )
    );
  }

  /* ---------- Đã đồng ý / Đã từ chối / Tất cả: một bảng ---------- */
  function flatList(list) {
    const shown = list.slice(0, shownCount());
    const rows = shown
      .map(r => {
        const j = r.status === 'pending' ? joined(r) : null;
        const aiTag =
          j && j.state === 'flagged'
            ? `<span class="yc-aic">${ic('spark', 14, 2)}${nf(j.findings.length)} cảnh báo</span>`
            : '';
        const by =
          r.status !== 'pending'
            ? `<div class="ks">${r.status === 'approved' ? 'Đồng ý' : 'Từ chối'} bởi ${esc(r.decidedBy || '—')} lúc <span class="yc-nw">${esc(A.fmtStamp(r.decidedAt))}</span>${r.note ? ' · Lý do: ' + esc(r.note) : ''}</div>`
            : '';
        const acts =
          r.status === 'pending'
            ? pendingActs(r)
            : `<button class="btn sm" type="button" data-act="dredecide" data-k="${esc(keyOf(r))}" ${busyAttr(keyOf(r))}>Đổi quyết định</button>`;
        return `<tr>${whoCell(r, false)}${itemCell(r)}${detailCell(r)}<td class="yc-res" data-label="Kết quả"><div class="row" style="gap:8px">${statusPill(r)}${aiTag}${noteCell(r)}</div>${by}</td><td class="act">${acts}</td></tr>`;
      })
      .join('');
    const inner = list.length
      ? table(
          'yc-flat',
          ['c-who', 'c-item', 'c-detail', 'c-res', 'c-act2'],
          [
            '<th>Nhân sự</th>',
            '<th>Loại yêu cầu</th>',
            '<th>Chi tiết</th>',
            '<th>Kết quả</th>',
            '<th><span class="sr">Thao tác</span></th>'
          ],
          rows
        )
      : emptyBox('Chưa có yêu cầu nào ở mục này');
    return card('', '', '', inner, moreFoot(shown.length, list.length, 'yêu cầu'), 'Danh sách yêu cầu');
  }

  /* ---------- vẽ ---------- */
  function subLine(st, sc) {
    const cm = D.countsMonth,
      ca = D.countsAll;
    if (!cm && !ca) return D.loading ? 'Đang tải yêu cầu…' : '';
    if (st === 'pending') {
      const m = cm ? cm.pending : null;
      const a = ca ? ca.pending : S.pendingCount;
      const others = othersPending();
      if (sc === 'month') {
        const nFlag = aiOk()
          ? D.rows.filter(r => r.status === 'pending' && inMonth(r) && joined(r).state === 'flagged').length
          : 0;
        return (
          (m
            ? `<b>${nf(m)} yêu cầu</b> của ${esc(monthNo())} đang chờ bạn`
            : `Không còn yêu cầu nào của ${esc(monthNo())} chờ bạn`) +
          (nFlag ? ` · ${nf(nFlag)} có cảnh báo AI` : '') +
          (others ? ` · còn ${nf(others)} yêu cầu của các tháng khác` : '')
        );
      }
      if (!a) return 'Không còn yêu cầu nào chờ bạn';
      const word = otherWord(D.rows.filter(r => r.status === 'pending' && !inMonth(r)));
      return `<b>${nf(a)} yêu cầu</b> đang chờ bạn${m != null && others != null ? ` · ${nf(m)} của ${esc(monthNo())}, ${nf(others)} của các tháng ${word}` : ''}`;
    }
    const n = countOf(D.counts, st);
    const where = sc === 'month' ? `trong ${esc(monthNo())}` : 'ở mọi tháng';
    if (st === 'all') {
      const c = D.counts;
      return `<b>${nf(n)} yêu cầu</b> ${where}: ${nf(c.pending)} chờ xử lý, ${nf(c.approved)} đã đồng ý, ${nf(c.rejected)} đã từ chối`;
    }
    return `<b>${nf(n)} yêu cầu</b> ${st === 'approved' ? 'đã đồng ý' : 'đã từ chối'} ${where}.`;
  }

  function render() {
    const st = status(),
      sc = scope();
    const head = A.header('Yêu cầu', subLine(st, sc));
    const tc = D.countsAll || D.counts;
    const tabs = `<div class="tabs yc-tabs" role="group" aria-label="Trạng thái yêu cầu">${[
      ['pending', 'Chờ xử lý'],
      ['approved', 'Đã đồng ý'],
      ['rejected', 'Đã từ chối'],
      ['all', 'Tất cả']
    ]
      .map(
        ([v, l]) =>
          `<button type="button" class="${st === v ? 'on' : ''}" data-act="dstatus" data-v="${v}" aria-pressed="${st === v}">${l}<small class="num">${nf(countOf(tc, v))}</small></button>`
      )
      .join('')}</div>`;
    const sections = `<div class="tabs yc-tabs yc-subtabs" role="group" aria-label="Nội dung màn yêu cầu">${[
      ['requests', 'Yêu cầu'],
      ['explanations', 'Giải trình']
    ]
      .map(
        ([v, l]) =>
          `<button type="button" class="${D.section === v ? 'on' : ''}" data-act="dsection" data-v="${v}" aria-pressed="${D.section === v}">${l}${v === 'explanations' && A.GiaiTrinh ? `<small class="num">${nf(A.GiaiTrinh.toRead())}</small>` : ''}</button>`
      )
      .join('')}</div>`;
    const segBtn = (v, label, c) => {
      const n = countOf(c, st);
      return `<button type="button" class="${sc === v ? 'on' : ''}" data-act="dscope" data-v="${v}" aria-pressed="${sc === v}">${esc(label)}${n == null ? '' : ` · ${nf(n)}`}</button>`;
    };
    const seg = `<div class="seg" role="group" aria-label="Phạm vi tháng">${segBtn('month', cap1(monthNo()), D.countsMonth)}${segBtn('all', 'Mọi tháng', D.countsAll)}</div>`;
    const typeCounts = {};
    for (const r of D.rows) typeCounts[r.item] = (typeCounts[r.item] || 0) + 1;
    const typeSel = `<label class="sr" for="dtype">Loại yêu cầu</label><select id="dtype" class="input yc-select" data-input="f" data-k="dtype" data-pg="${PAGE}"><option value="">Mọi loại yêu cầu</option>${Object.keys(
      A.ITEM_LABEL
    )
      .map(
        k =>
          `<option value="${k}" ${S.f.dtype === k ? 'selected' : ''}>${esc(A.ITEM_LABEL[k])} (${nf(typeCounts[k] || 0)})</option>`
      )
      .join('')}</select>`;
    // Lọc theo cảnh báo AI (Trợ lý AI mở màn này với "chỉ yêu cầu có cảnh báo"): hiện thành một nhãn bấm để bỏ lọc
    const flag = S.f.dflag || '';
    const flagChip = flag
      ? `<button type="button" class="chip on yc-flagchip" data-act="f" data-k="dflag" data-v="" data-pg="${PAGE}" aria-label="Bỏ lọc theo cảnh báo AI">${flag === 'flagged' ? 'Chỉ yêu cầu có cảnh báo AI' : 'Chỉ yêu cầu không có cảnh báo'}${ic('x', 14, 2)}</button>`
      : '';
    const ctl = `<div class="yc-ctl">${seg}${typeSel}${flagChip}${D.loading ? '<span class="cap">Đang tải…</span>' : ''}<div class="yc-search">${A.searchBox(PAGE, 'Tìm tên nhân sự', 240)}</div></div>`;

    let content;
    if (D.loading && !D.rows.length && !D.error)
      content = card(
        '',
        '',
        '',
        `<div class="tblwrap"><table class="yc-t"><tbody>${A.skelRows(5)}</tbody></table></div>`
      );
    else if (D.error && !D.rows.length) content = '';
    else {
      const list = visibleRows();
      content =
        D.section === 'explanations'
          ? A.GiaiTrinh
            ? A.GiaiTrinh.render()
            : explanationTable(list)
          : st === 'pending'
            ? sc === 'month'
              ? monthPending(list)
              : allPending(list)
            : flatList(list);
    }
    const notice = D.notice
      ? `<div class="errbox" role="alert">${ic('alert', 16)}<div class="col"><span>${esc(D.notice.text)}</span></div></div>`
      : '';
    const advance = A.UngLuong ? A.UngLuong.render() : '';
    return `${head}<div class="yc-top">${tabs}${sections}${ctl}</div>${D.error ? A.errorBox(D.error) : ''}${notice}${advance}${content}`;
  }
  /* Ô chọn ở đầu cột (mỗi bảng một ô): chọn một phần thì hiện dấu gạch */
  function after() {
    for (const head of document.querySelectorAll('.yc-selhead')) {
      const tbl = head.closest('table');
      const boxes = tbl ? [...tbl.querySelectorAll('tbody .yc-check')] : [];
      const n = boxes.filter(b => b.checked).length;
      head.indeterminate = n > 0 && n < boxes.length;
    }
  }

  A.register('duyet', {
    load,
    render,
    after,
    fail: e => (D.error = A.errText(e)),
    onMonth: () => {
      D.sel.clear();
      D.selAuto = true;
    }
  });
})(window.Admin);
