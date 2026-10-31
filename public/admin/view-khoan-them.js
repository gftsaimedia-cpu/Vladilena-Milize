/* Bảng lương › Khoản cộng/trừ thêm.
   Khoản một lần cho MỘT người trong MỘT tháng, cộng hoặc trừ, do C&B lập và người khác phê duyệt. Khác "số sửa trên phiếu": khoản này là
   đầu vào của phép tính (đi qua thuế, bảo hiểm), còn số sửa trên phiếu là sửa kết quả. Thẻ nằm cuối màn Bảng lương của tháng đang xem.
   Đường dẫn: GET /api/pay-entries?month=, POST /api/pay-entries, POST /api/pay-entries/bulk, PUT /api/pay-entries/:id (sửa khi chờ duyệt,
   gửi rev), PUT /api/pay-entries/:id/decide { decision, note, rev }, POST /api/pay-entries/:id/void. Máy chủ chưa có đường dẫn thì thẻ
   báo "chưa có". Tên trường đọc cả camelCase lẫn snake_case. Số tiền do người dùng gõ gửi nguyên; giao diện không tính lương.
   Mọi chuỗi từ API và từ người dùng qua A.esc(). Lỗi của máy chủ hiện nguyên văn.
   Lý do, ghi chú, căn cứ không bắt buộc; người lập
   tự phê duyệt được và người khác sửa được khoản chờ duyệt (máy chủ cảnh báo SELF_DECISION_FORBIDDEN, EDIT_CREATOR_ONLY); kỳ đã duyệt vẫn
   lập khoản được (máy chủ cảnh báo). */
(function (A) {
  'use strict';
  const { esc, nf, ic, S } = A;

  const REASON_MAX = 300;
  const LABEL_MAX = 80;
  const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
  const STATUS = {
    pending: ['pending', 'Chờ phê duyệt'],
    approved: ['done', 'Đã phê duyệt'],
    rejected: ['rejected', 'Từ chối'],
    void: ['draft', 'Đã huỷ']
  };
  const FILTERS = [
    ['', 'Tất cả'],
    ['pending', 'Chờ phê duyệt'],
    ['approved', 'Đã phê duyệt'],
    ['rejected', 'Từ chối'],
    ['void', 'Đã huỷ']
  ];
  const TAX = [
    ['none', 'Chịu thuế'],
    ['full', 'Miễn thuế toàn bộ'],
    ['cap', 'Miễn thuế đến hạn mức']
  ];
  const PEOPLE_SHOW = 200; // số người hiện tối đa trong danh sách chọn nhiều người

  const EN = {
    month: null,
    state: 'idle',
    rows: [],
    error: '',
    filter: '',
    sel: new Set(),
    draft: null,
    requireApproval: true,
    periodStatus: ''
  };

  // Lưu xong: câu "đã lưu" chỉ hiện khi máy chủ không có cảnh báo (A.api đã hiện cảnh báo; không che nó đi)
  const okToast = (res, text) => {
    const soft =
      res && Array.isArray(res.warnings) && res.warnings.some(w => w && w.message && w.severity !== 'danger');
    if (!soft) A.toast(text);
  };
  // Ô lý do, ghi chú: nhãn viết đủ (A.reasonField tự thêm "(không bắt buộc)" nên không dùng cho nhãn có điều kiện độ dài)
  const noteField = (id, label, ph) =>
    `<div class="formrow"><label class="lbl" for="${id}">${esc(label)}</label><textarea id="${id}" class="input" maxlength="${REASON_MAX}" placeholder="${esc(ph)}"></textarea></div>`;
  const caps = () => (A.meInfo && Array.isArray(A.meInfo.caps) ? A.meInfo.caps : null);
  const can = c => (caps() ? caps().includes(c) : true); // máy chủ vẫn kiểm; thiếu quyền chỉ ẩn nút
  const missingRoute = e =>
    !!e && (e.status === 404 || e.status === 405 || (e.status === 403 && e.data && e.data.code === 'NO_ROUTE_POLICY'));
  const vnd = n =>
    Number.isFinite(Number(n)) ? `${Number(n).toLocaleString('vi-VN', { maximumFractionDigits: 0 })} ₫` : '—';
  const nameOf = u => {
    const s = A.staff && A.staff.byUser && A.staff.byUser.get(u);
    return s ? s.name : u || '';
  };
  const pick = (r, a, b) => (r[a] !== undefined ? r[a] : r[b]);

  function norm(r) {
    return {
      id: r.id,
      username: r.username || '',
      month: r.month,
      direction: r.direction === 'deduct' ? 'deduct' : 'add',
      amount: Number(r.amount),
      label: r.label || '',
      slipLine: pick(r, 'slipLine', 'slip_line') || '',
      reason: r.reason || '',
      taxMode: pick(r, 'taxMode', 'tax_mode') || null,
      taxCap: pick(r, 'taxCap', 'tax_cap'),
      insuranceBase: Number(pick(r, 'insuranceBase', 'insurance_base')) || 0, // phần tiền của khoản tính vào nền bảo hiểm (₫)
      status: r.status || 'pending',
      rev: r.rev,
      createdBy: pick(r, 'createdBy', 'created_by') || '',
      createdAt: pick(r, 'createdAt', 'created_at') || '',
      decidedBy: pick(r, 'decidedBy', 'decided_by') || '',
      decidedAt: pick(r, 'decidedAt', 'decided_at') || '',
      decisionNote: pick(r, 'decisionNote', 'decision_note') || '',
      flagsConfirmedBy: pick(r, 'flagsConfirmedBy', 'flags_confirmed_by') || ''
    };
  }
  const listOf = res => (Array.isArray(res) ? res : (res && (res.entries || res.items || res.rows)) || []);

  /* ---------- tải ---------- */
  async function load(month) {
    if (EN.month !== month || EN.state !== 'ok') {
      EN.state = 'loading';
      if (EN.month !== month) EN.rows = [];
    }
    EN.month = month;
    try {
      const res = await A.api('GET', '/pay-entries' + A.qs({ month }));
      if (EN.month !== month) return;
      EN.rows = listOf(res).map(norm);
      EN.requireApproval = !(res && res.requireApproval === false); // tắt thì khoản có hiệu lực ngay
      EN.periodStatus = (res && res.periodStatus) || '';
      EN.state = 'ok';
      EN.error = '';
    } catch (e) {
      if (EN.month !== month) return;
      EN.rows = [];
      EN.state = missingRoute(e) ? 'na' : 'fail';
      EN.error = A.errText(e);
    }
  }
  const reload = async () => {
    // Khoản mới / duyệt / huỷ đổi tổng kỳ và cờ "cần tính lại": đọc lại cả dữ liệu kỳ từ máy chủ, không chỉ danh sách khoản
    await Promise.all([load(S.month), A.Ky && A.Ky.load ? A.Ky.load(true) : null]);
    A.render(); // màn Lương và hàng đợi Kế toán (Cài đặt) cùng đọc danh sách này
    if (A.refreshShell) A.refreshShell();
  };

  /* ---------- thẻ ---------- */
  const needsFlagConfirm = r =>
    r.direction === 'add' &&
    (r.status === 'pending' || r.status === 'approved') &&
    !r.flagsConfirmedBy &&
    ((r.taxMode && r.taxMode !== 'none') || r.insuranceBase);
  function taxText(r) {
    if (r.direction === 'deduct') return 'Trừ sau thuế';
    const t = r.taxMode || 'none';
    const base = t === 'full' ? 'Miễn thuế toàn bộ' : t === 'cap' ? `Miễn thuế đến ${vnd(r.taxCap)}` : 'Chịu thuế';
    return `${base}${r.insuranceBase ? ` · ${vnd(r.insuranceBase)} vào nền bảo hiểm` : ''}`;
  }
  function rowHtml(r) {
    const [tone, txt] = STATUS[r.status] || ['line', r.status];
    const acts = [];
    if (r.status === 'pending' && can('payroll.approve')) {
      // người lập vẫn có nút, máy chủ cảnh báo và nhật ký ghi "tự thực hiện"
      acts.push(
        `<button type="button" class="btn sm pri" data-act="endecide" data-id="${esc(r.id)}" data-d="approved">Phê duyệt</button><button type="button" class="btn sm" data-act="endecide" data-id="${esc(r.id)}" data-d="rejected">Từ chối</button>`
      );
    }
    if (r.status === 'pending' && can('salary.write'))
      // người khác sửa được khoản chờ phê duyệt (máy chủ cảnh báo EDIT_CREATOR_ONLY)
      acts.push(`<button type="button" class="btn sm ghost" data-act="enedit" data-id="${esc(r.id)}">Sửa</button>`);
    if ((r.status === 'pending' || r.status === 'approved') && can('salary.write'))
      acts.push(
        `<button type="button" class="btn sm ghost" data-act="envoid" data-id="${esc(r.id)}">Huỷ khoản</button>`
      );
    const who = [
      r.createdBy ? `Lập: ${esc(nameOf(r.createdBy))}` : '',
      r.decidedBy ? `${r.status === 'rejected' ? 'Từ chối' : 'Phê duyệt'}: ${esc(nameOf(r.decidedBy))}` : ''
    ]
      .filter(Boolean)
      .join('<br>');
    const amount = `${r.direction === 'deduct' ? '−' : '+'} ${vnd(r.amount)}`;
    return `<tr><td data-label="Nhân sự" class="wrapcell">${esc(nameOf(r.username))}<div class="cap mono">${esc(r.username)}</div></td>
<td data-label="Khoản" class="wrapcell">${esc(r.label)}${r.slipLine && r.slipLine !== r.label ? `<div class="cap">Trên phiếu: ${esc(r.slipLine)}</div>` : ''}<div class="cap">${esc(r.reason)}</div></td>
<td data-label="Số tiền" class="num r">${esc(amount)}</td>
<td data-label="Thuế, bảo hiểm" class="wrapcell cap">${esc(taxText(r))}${needsFlagConfirm(r) ? `<div>${A.pill('pending', 'Chờ Kế toán xác nhận')}${can('config.legal') ? ` <button type="button" class="btn sm" data-act="enflags" data-id="${esc(r.id)}">Xác nhận cờ</button>` : ''}</div>` : ''}</td>
<td data-label="Trạng thái">${A.pill(tone, txt)}${r.decisionNote ? `<div class="cap wrapcell">${esc(r.decisionNote)}</div>` : ''}</td>
<td data-label="Người lập, phê duyệt" class="wrapcell cap">${who}</td>
<td data-label="" class="r"><div class="row" style="gap:6px;justify-content:flex-end;flex-wrap:wrap">${acts.join('')}</div></td></tr>`;
  }
  function card() {
    const m = String(Number(S.month.slice(5)));
    const head = (extra = '') =>
      `<div class="card-h"><h2>Khoản cộng/trừ thêm</h2><span class="cap">Khoản một lần cho một người trong tháng ${esc(m)} · khoản đã phê duyệt thành một dòng riêng trên phiếu</span>${extra}</div>`;
    const wrap = inner =>
      `<section class="card flush bl-en" id="en-card" aria-label="Khoản cộng/trừ thêm">${inner}</section>`;
    if (EN.state === 'idle' || (EN.state === 'loading' && !EN.rows.length))
      return wrap(`${head()}<div class="bl-pad"><div class="skel" style="width:60%"></div></div>`);
    if (EN.state === 'na') return wrap(head(`<span class="end">${A.soonTag('Chưa có trên máy chủ')}</span>`));
    if (EN.state === 'fail') return wrap(`${head()}<div class="bl-pad">${A.errorBox(EN.error, false)}</div>`);
    const locked = EN.periodStatus === 'approved' || EN.periodStatus === 'paid';
    // Khoản vẫn lập vào tháng này, nhưng phiếu đã chốt không đổi cho tới khi kỳ được tính lại (câu cảnh báo của máy chủ)
    const lockNote = locked
      ? `<div class="note warn">${ic('alert', 16)}<span>Kỳ lương tháng này đã phê duyệt hoặc đã trả lương: khoản lập thêm vẫn lưu được nhưng không vào phiếu đã chốt, trừ khi kỳ được tính lại.</span></div>`
      : '';
    const btns = can('salary.write')
      ? `<span class="end"><button type="button" class="btn sm" data-act="enadd" data-bulk="1">Thêm cho nhiều người</button><button type="button" class="btn sm pri" data-act="enadd" data-bulk="0">${ic('plus', 16)}Thêm khoản</button></span>`
      : '';
    const count = s => EN.rows.filter(r => !s || r.status === s).length;
    const chips = FILTERS.map(([k, l]) => A.chip(EN.filter === k, 'enfilter', `data-v="${esc(k)}"`, l, count(k))).join(
      ''
    );
    const shown = EN.rows.filter(r => !EN.filter || r.status === EN.filter);
    const table = shown.length
      ? `<div class="tblwrap"><table class="rtable"><thead><tr><th>Nhân sự</th><th>Khoản</th><th class="r">Số tiền</th><th>Thuế, bảo hiểm</th><th>Trạng thái</th><th>Người lập, phê duyệt</th><th></th></tr></thead><tbody>${shown.map(rowHtml).join('')}</tbody></table></div>`
      : A.empty(
          EN.rows.length ? 'Không có khoản nào khớp bộ lọc' : `Chưa có khoản nào trong tháng ${m}`,
          EN.rows.length ? 'Đổi bộ lọc để xem các khoản khác.' : 'Bấm Thêm khoản để lập khoản đầu tiên của tháng.'
        );
    return wrap(
      `${head(btns)}${lockNote}<div class="bl-tools"><div class="chips" role="group" aria-label="Lọc khoản cộng/trừ thêm">${chips}</div></div>${table}`
    );
  }
  A.actions.enfilter = el => {
    EN.filter = el.dataset.v;
    A.render();
  };

  /* ---------- hộp lập, sửa khoản ---------- */
  function parseVnd(raw) {
    const s = String(raw ?? '').replace(/\s/g, '');
    if (!s) return null;
    if (!(/^\d{1,3}(\.\d{3})+$/.test(s) || /^\d+$/.test(s))) return NaN;
    return Number(s.replace(/\./g, ''));
  }
  const val = id => {
    const el = document.getElementById(id);
    return el ? el.value : '';
  };
  const people = () => A.people().filter(p => !p.locked);
  const personText = p => `${p.name} · ${p.username}`;

  function formBody({ bulk, d }) {
    const who = bulk
      ? `<div class="col" style="gap:6px"><span class="lbl">Người nhận</span><div class="field"><label class="sr" for="en-q">Tìm nhân sự</label>${ic('search', 18)}<input id="en-q" class="input" type="search" autocomplete="off" placeholder="Tên hoặc tên đăng nhập" data-input="enq" style="width:100%"></div><div class="row between wrap"><span class="cap" id="en-count" aria-live="polite">Chưa chọn ai</span><span class="row" style="gap:8px"><button type="button" class="btn sm" data-act="enall">Chọn mọi người đang hiện</button><button type="button" class="btn sm ghost" data-act="ennone">Bỏ chọn hết</button></span></div><div id="en-list" style="max-height:240px;overflow:auto"></div></div>`
      : `<div class="formrow"><label class="lbl" for="en-user">Người nhận</label><div class="bl-inp"><input id="en-user" class="input" list="en-people" autocomplete="off" placeholder="Gõ tên hoặc tên đăng nhập" value="${esc(d.userText || '')}"><span class="end" aria-hidden="true">${ic('search', 16)}</span></div><datalist id="en-people">${people()
          .map(p => `<option value="${esc(personText(p))}"></option>`)
          .join('')}</datalist></div>`;
    return `${who}
<div class="formgrid"><div class="formrow"><label class="lbl" for="en-dir">Loại khoản</label><select id="en-dir" class="input" data-input="endir"><option value="add" ${d.direction !== 'deduct' ? 'selected' : ''}>Cộng thêm</option><option value="deduct" ${d.direction === 'deduct' ? 'selected' : ''}>Trừ</option></select></div>
<div class="formrow"><label class="lbl" for="en-amount">Số tiền</label><div class="bl-inp"><input id="en-amount" class="input num" inputmode="numeric" autocomplete="off" value="${esc(d.amount || '')}"><span class="end" aria-hidden="true">₫</span></div></div></div>
<div class="formgrid"><div class="formrow"><label class="lbl" for="en-label">Tên khoản</label><input id="en-label" class="input" maxlength="${LABEL_MAX}" autocomplete="off" value="${esc(d.label || '')}"></div>
<div class="formrow"><label class="lbl" for="en-slip">Dòng trên phiếu <small>(để trống thì dùng tên khoản)</small></label><input id="en-slip" class="input" maxlength="${LABEL_MAX}" autocomplete="off" value="${esc(d.slipLine || '')}"></div></div>
<div id="en-taxbox"><div class="formgrid"><div class="formrow"><label class="lbl" for="en-tax">Thuế</label><select id="en-tax" class="input" data-input="entax">${TAX.map(([v, l]) => `<option value="${v}" ${(d.taxMode || 'none') === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
<div class="formrow" id="en-cap-row" ${d.taxMode === 'cap' ? '' : 'hidden'}><label class="lbl" for="en-cap">Hạn mức miễn thuế (₫)</label><input id="en-cap" class="input num" inputmode="numeric" autocomplete="off" value="${esc(d.taxCap || '')}"></div>
<div class="formrow"><label class="lbl" for="en-ins">Tính vào bảo hiểm</label><select id="en-ins" class="input" data-input="enins"><option value="0" ${d.insMode === 'part' || d.insMode === 'all' ? '' : 'selected'}>Không</option><option value="all" ${d.insMode === 'all' ? 'selected' : ''}>Toàn bộ khoản</option><option value="part" ${d.insMode === 'part' ? 'selected' : ''}>Một phần</option></select></div>
<div class="formrow" id="en-insamt-row" ${d.insMode === 'part' ? '' : 'hidden'}><label class="lbl" for="en-insamt">Phần tính vào nền bảo hiểm (₫)</label><input id="en-insamt" class="input num" inputmode="numeric" autocomplete="off" value="${esc(d.insAmount || '')}"></div></div>
<div class="note" role="status">${ic('info', 16)}<span>Cách tính thuế và bảo hiểm của khoản chỉ có hiệu lực sau khi Kế toán xác nhận; trước đó khoản được tính là chịu thuế và không vào bảo hiểm.</span></div></div>
<div id="en-dednote" class="note" role="status" hidden>${ic('info', 16)}<span>Khoản trừ luôn trừ sau thuế, không làm giảm thu nhập chịu thuế.</span></div>
<div class="formrow"><label class="lbl" for="en-reason">Lý do <small>(không bắt buộc, tối đa ${REASON_MAX} ký tự)</small></label><textarea id="en-reason" class="input" maxlength="${REASON_MAX}" placeholder="Ghi rõ lý do để lưu vào nhật ký">${esc(d.reason || '')}</textarea></div>`;
  }
  const syncDirection = () => {
    const ded = val('en-dir') === 'deduct';
    const t = document.getElementById('en-taxbox');
    const n = document.getElementById('en-dednote');
    if (t) t.hidden = ded;
    if (n) n.hidden = !ded;
  };
  A.inputs.endir = syncDirection;
  A.inputs.enins = () => {
    const r = document.getElementById('en-insamt-row');
    if (r) r.hidden = val('en-ins') !== 'part';
  };
  A.inputs.entax = () => {
    const r = document.getElementById('en-cap-row');
    if (r) r.hidden = val('en-tax') !== 'cap';
  };
  /* Danh sách chọn nhiều người */
  function paintList() {
    const box = document.getElementById('en-list');
    if (!box) return;
    const q = A.fold(val('en-q'));
    const list = people().filter(p => !q || A.fold(`${p.name} ${p.username}`).includes(q));
    box.innerHTML =
      list
        .slice(0, PEOPLE_SHOW)
        .map(
          p =>
            `<label class="row" style="gap:10px;padding:6px 0;border-top:1px solid var(--line)"><input type="checkbox" data-input="enpick" data-u="${esc(p.username)}" ${EN.sel.has(p.username) ? 'checked' : ''}><span>${esc(p.name)} <span class="cap mono">${esc(p.username)}</span></span></label>`
        )
        .join('') +
        (list.length > PEOPLE_SHOW
          ? `<div class="cap">và ${nf(list.length - PEOPLE_SHOW)} người khác, hãy gõ cụ thể hơn</div>`
          : '') || A.empty('Không có ai khớp', 'Đổi từ khoá tìm kiếm.');
    const c = document.getElementById('en-count');
    if (c) c.textContent = EN.sel.size ? `Đã chọn ${nf(EN.sel.size)} người` : 'Chưa chọn ai';
  }
  A.inputs.enq = paintList;
  A.inputs.enpick = el => {
    if (el.checked) EN.sel.add(el.dataset.u);
    else EN.sel.delete(el.dataset.u);
    paintList();
  };
  A.actions.enall = () => {
    const q = A.fold(val('en-q'));
    for (const p of people()) if (!q || A.fold(`${p.name} ${p.username}`).includes(q)) EN.sel.add(p.username);
    paintList();
  };
  A.actions.ennone = () => {
    EN.sel.clear();
    paintList();
  };

  /* Giá trị đang gõ trong hộp, giữ lại khi phải chuyển sang tháng khác */
  const collectDraft = () => ({
    userText: val('en-user'),
    direction: val('en-dir'),
    amount: val('en-amount'),
    label: val('en-label'),
    slipLine: val('en-slip'),
    taxMode: val('en-tax') || 'none',
    taxCap: val('en-cap'),
    insMode: val('en-ins'),
    insAmount: val('en-insamt'),
    reason: val('en-reason')
  });
  function readForm(bulk, userOf) {
    const dir = val('en-dir') === 'deduct' ? 'deduct' : 'add';
    const amount = parseVnd(val('en-amount'));
    if (amount === null || Number.isNaN(amount) || amount < 1)
      throw new Error('Nhập số tiền là số nguyên đồng, từ 1 trở lên.');
    const label = val('en-label').trim().replace(/\s+/g, ' ');
    if (!label) throw new Error('Nhập tên khoản.');
    if (label.length > LABEL_MAX) throw new Error(`Tên khoản tối đa ${LABEL_MAX} ký tự.`);
    if (/[<>]/.test(label) || /[<>]/.test(val('en-slip')))
      throw new Error('Tên khoản và dòng trên phiếu không được chứa dấu < hoặc >.');
    const reason = val('en-reason').trim();
    // lý do không bắt buộc (máy chủ nhận lý do trống); quá dài vẫn là lỗi dữ liệu
    if (reason.length > REASON_MAX) throw new Error(`Lý do tối đa ${REASON_MAX} ký tự (hiện có ${reason.length}).`);
    // Gửi tường minh null cho phần không dùng (sửa khoản cộng thành khoản trừ phải xoá cờ cũ; xoá dòng trên phiếu = slipLine null)
    const slip = val('en-slip').trim();
    const base = {
      month: S.month,
      direction: dir,
      amount,
      label,
      reason,
      slipLine: slip || null,
      taxMode: null,
      taxCap: null,
      insuranceBase: null
    };
    if (dir === 'add') {
      const tax = val('en-tax') || 'none';
      base.taxMode = tax;
      if (tax === 'cap') {
        const c = parseVnd(val('en-cap'));
        if (c === null || Number.isNaN(c)) throw new Error('Nhập hạn mức miễn thuế (số tiền nguyên, ₫).');
        base.taxCap = c;
      }
      const ins = val('en-ins');
      if (ins === 'all') base.insuranceBase = amount;
      else if (ins === 'part') {
        const part = parseVnd(val('en-insamt'));
        if (part === null || Number.isNaN(part) || part > amount)
          throw new Error('Phần tính vào nền bảo hiểm phải là số nguyên đồng, không vượt số tiền của khoản.');
        base.insuranceBase = part;
      } else base.insuranceBase = 0;
    }
    if (bulk) {
      if (!EN.sel.size) throw new Error('Chọn ít nhất một người nhận.');
      return { month: S.month, entries: [...EN.sel].map(username => ({ username, ...base })) };
    }
    const u = userOf();
    if (!u) throw new Error('Chọn người nhận trong danh sách gợi ý.');
    return { username: u, ...base };
  }
  /* Tên gõ trong ô → tên đăng nhập (khớp "Tên · username", hoặc đúng tên đăng nhập) */
  function userOfText() {
    const t = val('en-user').trim();
    const hit = people().find(p => personText(p) === t || p.username === t);
    return hit ? hit.username : '';
  }
  /* Máy chủ báo lỗi: hiện nguyên văn câu của máy chủ (không hiện mã lỗi). Giao diện chỉ nói thêm việc nó đã làm (tải lại danh sách),
     và thay câu kỹ thuật khi máy chủ chưa có đường dẫn */
  function explain(e) {
    const c = (e && e.data && e.data.code) || '';
    if (missingRoute(e)) return 'Máy chủ chưa có chức năng này.';
    const text = A.errText(e);
    if (c === 'REV_STALE' || (e && e.status === 409 && /REV/.test(c)))
      return `${/[.!?…]$/.test(text) ? text : text + '.'} Danh sách đã được tải lại.`;
    return text;
  }
  function openForm({ bulk, existing, draft }) {
    const d = draft || (existing ? fromExisting(existing) : {});
    if (bulk) EN.sel = new Set();
    const dlg = A.openDialog({
      title: existing ? 'Sửa khoản cộng/trừ' : bulk ? 'Thêm khoản cho nhiều người' : 'Thêm khoản cộng/trừ',
      sub: `Khoản một lần cho ${bulk ? 'mỗi người' : 'một người'} trong ${A.monthLabel(S.month)} · ${EN.requireApproval ? 'khoản chờ phê duyệt chưa vào lương' : 'khoản có hiệu lực ngay khi lập'}`,
      wide: true,
      body: `<div class="col bl-form" style="gap:16px">${formBody({ bulk, d })}</div>`,
      foot: [
        { label: 'Huỷ' },
        {
          label: existing ? 'Lưu thay đổi' : EN.requireApproval ? 'Gửi phê duyệt' : 'Lập khoản',
          cls: 'pri',
          onClick: async api => {
            const body = readForm(bulk, existing ? () => existing.username : userOfText);
            let res;
            try {
              if (existing)
                res = await A.api('PUT', `/pay-entries/${encodeURIComponent(existing.id)}`, {
                  ...body,
                  rev: existing.rev
                });
              else res = await A.api('POST', bulk ? '/pay-entries/bulk' : '/pay-entries', body);
            } catch (e) {
              // Máy chủ từ chối kèm tháng mở kế tiếp; câu của máy chủ hiện nguyên văn
              if (e.status === 409 && e.data && e.data.code === 'PERIOD_LOCKED') {
                const m = e.data.suggestMonth;
                const box = api.root.querySelector('#dlg-err');
                box.hidden = false;
                box.innerHTML = `<div class="errbox" role="alert">${ic('alert', 16)}<div class="col"><span>${esc(A.errText(e))}</span>${MONTH_RE.test(m || '') ? `<div><button type="button" class="btn sm pri" data-act="enswitch" data-m="${esc(m)}" data-bulk="${bulk ? 1 : 0}">Chuyển sang tháng ${esc(A.monthLabel(m).replace('tháng ', ''))}</button></div>` : ''}</div></div>`;
                return;
              }
              if (e.status === 409) await reload();
              throw new Error(explain(e));
            }
            api.close();
            const n = bulk ? body.entries.length : 1;
            okToast(
              res,
              existing
                ? 'Đã lưu khoản'
                : EN.requireApproval
                  ? `Đã gửi ${n} khoản chờ phê duyệt`
                  : `Đã lập ${n} khoản, có hiệu lực ngay`
            );
            await reload();
          }
        }
      ]
    });
    dlg.root.classList.add('bl-dlg-860');
    const send = dlg.root.querySelector('[data-dlg-btn="1"]');
    if (send) send.insertAdjacentHTML('afterbegin', ic(existing ? 'check' : EN.requireApproval ? 'send' : 'plus', 16));
    if (bulk) paintList();
    syncDirection();
  }
  const fromExisting = r => ({
    userText: personText({ name: nameOf(r.username), username: r.username }),
    direction: r.direction,
    amount: r.amount ? nf(r.amount) : '',
    label: r.label,
    slipLine: r.slipLine,
    taxMode: r.taxMode || 'none',
    taxCap: r.taxCap ? nf(r.taxCap) : '',
    insMode: r.insuranceBase ? (r.insuranceBase >= r.amount ? 'all' : 'part') : '0',
    insAmount: r.insuranceBase && r.insuranceBase < r.amount ? nf(r.insuranceBase) : '',
    reason: r.reason
  });
  A.actions.enadd = el => {
    EN.draft = null;
    openForm({ bulk: el.dataset.bulk === '1' });
  };
  A.actions.enedit = el => {
    const r = EN.rows.find(x => String(x.id) === el.dataset.id);
    if (r) openForm({ bulk: false, existing: r });
  };
  /* Tháng đã chốt: chuyển sang tháng mở kế tiếp rồi mở lại hộp với những gì đã gõ */
  A.actions.enswitch = async el => {
    const draft = collectDraft();
    const bulk = el.dataset.bulk === '1';
    const month = el.dataset.m;
    A.closeDialog();
    A.setMonth(month);
    await load(month);
    openForm({ bulk, draft });
  };

  /* ---------- duyệt, từ chối, huỷ ---------- */
  /* Hộp ghi chú của phê duyệt, từ chối, huỷ, xác nhận cờ: ghi chú không bắt buộc, chỉ kiểm độ dài tối đa */
  function noteDialog({ title, sub, label, cta, cls, run }) {
    A.openDialog({
      title,
      sub,
      body: noteField('en-note', label, 'Ghi chú lưu vào nhật ký'),
      foot: [
        { label: 'Đóng' },
        {
          label: cta,
          cls: cls || 'pri',
          onClick: async api => {
            const note = val('en-note').trim();
            if (note.length > REASON_MAX)
              throw new Error(`Ghi chú tối đa ${REASON_MAX} ký tự (hiện có ${note.length}).`);
            try {
              await run(note);
            } catch (e) {
              if (e.status === 409) await reload();
              throw new Error(explain(e));
            }
            api.close();
            await reload();
          }
        }
      ]
    });
  }
  A.actions.endecide = el => {
    const r = EN.rows.find(x => String(x.id) === el.dataset.id);
    if (!r) return;
    const ok = el.dataset.d === 'approved';
    noteDialog({
      title: ok ? 'Phê duyệt khoản cộng/trừ' : 'Từ chối khoản cộng/trừ',
      sub: `${nameOf(r.username)} · ${r.label} · ${r.direction === 'deduct' ? '−' : '+'} ${vnd(r.amount)}`,
      label: ok ? 'Ghi chú (không bắt buộc)' : 'Lý do từ chối (không bắt buộc)',
      cta: ok ? 'Phê duyệt' : 'Từ chối',
      cls: ok ? 'pri' : 'danger',
      run: note =>
        A.api('PUT', `/pay-entries/${encodeURIComponent(r.id)}/decide`, {
          decision: el.dataset.d,
          note,
          rev: r.rev
        })
    });
  };
  /* Kế toán xác nhận cờ thuế và bảo hiểm của khoản: cần căn cứ (số văn bản, điều khoản) */
  A.actions.enflags = el => {
    const r = EN.rows.find(x => String(x.id) === el.dataset.id);
    if (!r) return;
    noteDialog({
      title: 'Xác nhận cờ thuế và bảo hiểm',
      sub: `${nameOf(r.username)} · ${r.label} · ${vnd(r.amount)}`,
      label: 'Căn cứ (không bắt buộc: số văn bản, điều khoản)',
      cta: 'Xác nhận',
      run: async basis => {
        const res = await A.api('POST', `/pay-entries/${encodeURIComponent(r.id)}/confirm-flags`, {
          rev: r.rev,
          basis
        });
        okToast(res, 'Đã xác nhận cờ thuế và bảo hiểm');
      }
    });
  };
  A.actions.envoid = el => {
    const r = EN.rows.find(x => String(x.id) === el.dataset.id);
    if (!r) return;
    noteDialog({
      title: 'Huỷ khoản cộng/trừ',
      sub: `${nameOf(r.username)} · ${r.label} · ${r.direction === 'deduct' ? '−' : '+'} ${vnd(r.amount)}`,
      label: 'Lý do huỷ (không bắt buộc)',
      cta: 'Huỷ khoản',
      cls: 'danger',
      run: note => A.api('POST', `/pay-entries/${encodeURIComponent(r.id)}/void`, { reason: note, note, rev: r.rev })
    });
  };

  /* Hàng đợi Kế toán (Cài đặt › ⑦ ⑧): khoản của tháng đang xem có cờ thuế hoặc bảo hiểm chưa xác nhận */
  A.Entries = {
    load,
    card,
    reset: () => (EN.state = 'idle'),
    ensure: month => {
      if (EN.month === month && (EN.state === 'ok' || EN.state === 'loading' || EN.state === 'na')) return;
      load(month).then(() => A.render());
    },
    state: () => (EN.month === S.month ? EN.state : 'loading'),
    flagRows: () => (EN.month === S.month ? EN.rows.filter(needsFlagConfirm) : []),
    flagText: taxText
  };
})(window.Admin);
