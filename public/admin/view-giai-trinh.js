/* Giải trình trên màn Yêu cầu của Admin (máy chủ: lib/explanations.js, lib/domain/explanations.js).
   Hai nguồn: nhân sự giải trình lần bấm Check-in / Check-out không hợp lệ (trễ, về sớm, Check-out muộn, ngoài ca, ngoài vùng GPS, lượt thứ hai trong ca;
   vào thẳng "Đã trả lời") và Admin hoặc AI yêu cầu một người giải trình về một ngày.
   GET /api/explanations?status=, POST /api/explanations { username, date, prompt, source?, ruleId? }, POST /api/explanations/:id/decide { approve, note? }.
   Giải trình chưa được duyệt hoặc không duyệt thì máy chủ không tính công ngày đó.
   Check-out muộn: lượt là "Chờ xử lý", máy chủ chỉ ghi nhận giờ bấm (requestedOut); Phê duyệt thì giờ đó thành giờ Check-out
   của lượt, Từ chối thì lượt là "Bị từ chối" và cả ngày không tính công.
   Check-in / Check-out không hợp lệ: giờ bấm giữ nguyên, lượt là "Chờ xử lý"; Phê duyệt thì lượt "Được phê duyệt", Từ chối thì lượt là "Bị từ chối"
   và cả ngày không tính công.
   Giải trình ngày (Admin yêu cầu / AI đề nghị) quên Check-in/out: Phê duyệt thì máy chủ ghi công theo giờ ca (phản hồi recorded), Từ chối thì
   ngày không tính công.
   Trạng thái của giải trình dùng đúng ba chữ của chấm công (AttendanceStatus.LABEL): Chờ xử lý, Được phê duyệt, Bị từ chối.
   Màn Yêu cầu (view-duyet.js) gọi A.GiaiTrinh.load() cùng lúc với danh sách yêu cầu, A.GiaiTrinh.render() ở tab "Giải trình" và đọc A.GiaiTrinh.toRead()
   cho số đếm. A.GiaiTrinh.ask({ username, date, prompt, source, ruleId }) mở hộp "Yêu cầu giải trình" (Trợ lý AI gọi với source 'ai').
   Mọi chuỗi từ API qua esc() trước khi vào innerHTML. */
(function (A) {
  'use strict';
  const { esc, nf, ic } = A;
  const G = { loading: false, error: null, items: [], toRead: 0, token: 0, busy: new Set() };
  const KIND = {
    'late-checkout': 'Check-out muộn',
    'punch-in': 'Check-in không hợp lệ',
    'punch-out': 'Check-out không hợp lệ',
    admin: 'Admin yêu cầu',
    ai: 'AI đề nghị'
  };
  const LABEL = window.AttendanceStatus.LABEL;
  const STATE = {
    requested: LABEL.pending,
    answered: LABEL.pending,
    approved: LABEL.approved,
    rejected: LABEL.rejected
  };
  // Chữ nhỏ dưới nhãn: giải trình chờ ai làm tiếp
  const WAIT = { requested: 'nhân sự chưa trả lời', answered: 'nhân sự đã trả lời, chờ Admin' };
  const PILL = { requested: 'pending', answered: 'pending', approved: 'done', rejected: 'rejected' };

  function load() {
    const token = ++G.token;
    G.loading = true;
    return A.api('GET', '/explanations')
      .then(res => {
        if (token !== G.token) return;
        G.items = (res && res.items) || [];
        G.toRead = (res && res.toRead) || 0;
        G.error = null;
      })
      .catch(e => {
        if (token !== G.token) return;
        G.items = [];
        G.toRead = 0;
        G.error = e && (e.status === 403 || e.status === 404) ? null : A.errText(e);
      })
      .finally(() => {
        if (token === G.token) G.loading = false;
      });
  }
  const reload = async () => {
    await load();
    A.refreshShell();
    A.render();
  };

  // Giờ bấm Check-out muộn và việc nút Duyệt sẽ làm (số giờ là của máy chủ, giao diện không tính)
  const lateOutHtml = x =>
    x.requestedOut
      ? `<div class="cap">Giờ bấm Check-out: <b class="num">${esc(A.hm(x.requestedOut))}</b> · ${x.status === 'approved' ? 'đã áp dụng làm giờ Check-out' : 'lượt đang Chờ xử lý; Phê duyệt thì giờ này thành giờ Check-out'}</div>`
      : '';
  const rowHtml = x => {
    const busy = G.busy.has(x.id);
    const dis = busy ? 'disabled' : '';
    // Đã trả lời: phê duyệt hoặc từ chối; đã quyết định rồi vẫn đổi ý được (nút còn lại)
    const act =
      x.status === 'answered' || x.status === 'rejected'
        ? `<button class="btn sm pri" type="button" data-act="gtdecide" data-ok="1" data-id="${esc(x.id)}" ${dis}>Phê duyệt</button>`
        : '';
    const act2 =
      x.status === 'answered' || x.status === 'approved'
        ? `<button class="btn sm" type="button" data-act="gtdecide" data-ok="0" data-id="${esc(x.id)}" ${dis}>Từ chối</button>`
        : '';
    return `<tr><td data-label="Nhân sự"><b>${esc(x.name || x.username)}</b><div class="cap">${esc(x.username)}</div></td><td data-label="Ngày / nguồn">${esc(A.fmtDate(x.date))}<div class="cap">${esc(KIND[x.kind] || '')}</div></td><td data-label="Nội dung"><div class="yc-cell">${x.prompt ? `<div class="cap">${esc(x.prompt)}</div>` : ''}${x.answer ? esc(x.answer) : '<span class="cap">Chưa có câu trả lời</span>'}${lateOutHtml(x)}</div></td><td data-label="Trạng thái">${A.pill(PILL[x.status] || 'pending', STATE[x.status] || x.status)}${WAIT[x.status] ? `<div class="cap">${esc(WAIT[x.status])}</div>` : ''}</td><td class="act">${act}${act2}</td></tr>`;
  };

  function render() {
    const head = `<div class="yc-ctl"><button type="button" class="btn sm pri" data-act="gtask">${ic('plus', 16)}Yêu cầu giải trình</button>${G.loading ? '<span class="cap">Đang tải…</span>' : ''}${G.toRead ? `<span class="cap">${nf(G.toRead)} giải trình chưa đọc</span>` : ''}</div>`;
    const inner = G.items.length
      ? `<div class="tblwrap"><table class="rtable yc-t yc-explanations"><colgroup><col class="c-who"><col class="c-item"><col class="c-detail"><col class="c-res"><col class="c-act2"></colgroup><thead><tr><th>Nhân sự</th><th>Ngày / nguồn</th><th>Nội dung</th><th>Trạng thái</th><th><span class="sr">Thao tác</span></th></tr></thead><tbody>${G.items.map(rowHtml).join('')}</tbody></table></div>`
      : A.empty(
          'Chưa có giải trình',
          'Giải trình nhân sự gửi khi bấm Check-in / Check-out không hợp lệ, và các yêu cầu giải trình bạn gửi, sẽ hiện ở đây.'
        );
    return `${head}${G.error ? A.errorBox(G.error) : ''}<section class="card flush yc-card" aria-label="Giải trình">${inner}</section>`;
  }

  // Hộp "Yêu cầu giải trình": Admin nhập người, ngày, câu hỏi; từ phát hiện của AI thì source = 'ai' và điền sẵn
  function ask(pre = {}) {
    const val = k => esc(pre[k] || '');
    A.openDialog({
      title: pre.source === 'ai' ? 'Yêu cầu giải trình (AI đề nghị)' : 'Yêu cầu giải trình',
      sub: 'Nhân sự sẽ thấy yêu cầu trong mục Yêu cầu của app nhân viên.',
      body: `<div class="formrow"><label class="lbl" for="gt-user">Tên đăng nhập nhân sự</label><input id="gt-user" class="input" type="text" autocomplete="off" value="${val('username')}"></div>
<div class="formrow"><label class="lbl" for="gt-date">Ngày cần giải trình</label><input id="gt-date" class="input" type="date" value="${val('date')}"></div>
<div class="formrow"><label class="lbl" for="gt-prompt">Nội dung cần giải trình</label><textarea id="gt-prompt" class="input" rows="3" maxlength="500">${val('prompt')}</textarea></div>`,
      foot: [
        { label: 'Huỷ' },
        {
          label: 'Gửi yêu cầu',
          cls: 'pri',
          onClick: async api => {
            const get = id => (document.getElementById(id) || {}).value || '';
            const body = {
              username: get('gt-user').trim().toLowerCase(),
              date: get('gt-date'),
              prompt: get('gt-prompt').trim()
            };
            if (!body.username || !body.date || !body.prompt)
              throw new Error('Nhập đủ nhân sự, ngày và nội dung cần giải trình.');
            if (pre.source === 'ai') body.source = 'ai';
            if (pre.ruleId) body.ruleId = pre.ruleId;
            await A.api('POST', '/explanations', body);
            api.close();
            A.toast('Đã gửi yêu cầu giải trình.');
            await reload();
          }
        }
      ]
    });
  }

  A.actions.gtask = () => ask();
  async function decide(id, approve, note) {
    if (G.busy.has(id)) return;
    G.busy.add(id);
    A.render();
    try {
      const res = await A.api('POST', `/explanations/${encodeURIComponent(id)}/decide`, { approve, note: note || '' });
      const at = res && res.item && res.item.requestedOut;
      A.toast(
        approve
          ? at
            ? `Đã phê duyệt: giờ Check-out ${A.hm(at)} được tính.`
            : res && res.recorded
              ? 'Đã ghi công theo giờ ca.'
              : 'Đã phê duyệt giải trình.'
          : 'Đã từ chối: ngày không tính công.'
      );
    } catch (e) {
      A.toast(A.errText(e), 'err');
    } finally {
      G.busy.delete(id);
      await reload();
    }
  }
  A.actions.gtdecide = el => {
    const id = el.dataset.id;
    if (el.dataset.ok === '1') return decide(id, true);
    const x = G.items.find(r => String(r.id) === String(id));
    A.confirmDialog({
      title: 'Từ chối giải trình',
      sub: x ? `${x.name || x.username} · ${A.fmtDate(x.date)}` : '',
      body: `${A.note(`Từ chối thì <b>ngày không tính công</b>.${x && x.requestedOut ? ' Lượt là Bị từ chối, giờ bấm không được tính.' : ''}`)}${A.reasonField('gt-note', 'Lý do (không bắt buộc)')}`,
      label: 'Từ chối',
      cls: 'danger',
      onConfirm: async () => {
        const note = (document.getElementById('gt-note') || {}).value || '';
        await decide(id, false, note.trim());
      }
    });
  };

  A.GiaiTrinh = { load, render, ask, toRead: () => G.toRead, count: () => G.items.length };
})(window.Admin);
