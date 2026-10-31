/* Màn Đánh giá KPI (route #kpi): lưới điểm 5 thành phần (GET/PUT /api/kpi/scores).
   Nhập bằng bàn phím: Tab sang ô bên phải, Enter xuống dòng dưới; ô tự lưu khi rời ô.
   KPI luôn tính theo 5 thành phần.
   Tháng trước mốc đó (method "legacy") chỉ có một ghi chú: điểm nhập ở đây không dùng để tính lương.
   Màn không tự chặn gì ngoài định dạng điểm (0 đến 100, tối đa 2 chữ số thập phân, như máy chủ); tháng chưa bắt đầu,
   tự nhập điểm của mình, kỳ đã chốt là cảnh báo của máy chủ (tự hiện qua A.api, không bị câu "Đã lưu điểm" che).
   Không tính tiền ở đây: lương KPI của từng người lấy từ máy chủ (phiếu lương của lần tính hiện hành,
   hoặc ước tính cả kỳ khi chưa có lần tính: GET /api/periods/:month/payslips | estimates, trường kpi). */
(function (A) {
  'use strict';
  const { esc, nf, ic, S } = A;
  const PAGE = 'kpi';
  const LOG_PAGE = 'kpilog';
  const PAGE_SIZE = 20;
  /* [mã thành phần, tên]: MỘT bộ tên và thứ tự cho màn này và phiếu lương (view-phieu.js đọc A.KPI_PARTS), cùng thứ tự với
     public/kpi-score.js → COMPONENTS (wework, user, peer, manager, self). Trọng số không viết ở đây: lấy `weights` của GET /api/kpi/scores. */
  const PARTS = Object.freeze([
    ['wework', 'Base Wework'],
    ['user', 'Người dùng'],
    ['peer', 'Đồng nghiệp'],
    ['manager', 'Quản lý trực tiếp'],
    ['self', 'Tự đánh giá']
  ]);
  A.KPI_PARTS = PARTS;
  const K = {
    loading: false,
    error: null,
    data: null,
    month: null,
    saving: new Set(),
    drafts: new Map(),
    seq: new Map(),
    stale: false
  };
  // Mốc điểm Base Wework do máy chủ trả (tham số kpi.weworkMin của tháng); chưa có thì nhãn không ghi số
  const W = { month: null, min: null };
  const WEWORK_KEY = 'kpi.weworkMin',
    PARAM_GROUP = 8; // nhóm KPI trong sổ tham số
  const SLIP_PAGE_MAX = 200; // trang tối đa của GET /periods/:month/payslips và /estimates (lib/config.js PAYSLIP_PAGE_MAX)
  // Lương KPI do máy chủ tính: kpi = Map tên đăng nhập → số đồng; source 'payslip' (đã có lần tính) hoặc 'estimate' (chưa tính)
  const P = { state: 'idle', month: null, source: null, kpi: null };
  const sub = () => S.sub.kpi || 'diem';
  const monthNo = () => Number(String(S.month).slice(5));

  async function load() {
    const month = S.month;
    K.loading = true;
    K.error = null;
    A.loadAi();
    if (sub() === 'log') loadNames();
    try {
      const data = await A.api('GET', '/kpi/scores' + A.qs({ month }));
      if (month !== S.month) return;
      K.data = data;
      K.month = month;
      loadWeworkMin(month);
      refreshPay();
    } catch (e) {
      K.error = A.errText(e);
    } finally {
      K.loading = false;
    }
  }
  // Tên người sửa ở tab Lịch sử sửa điểm: danh sách nhân sự dùng chung (GET /api/staff)
  const loadNames = () =>
    A.loadStaff().then(() => {
      if (S.view === PAGE && sub() === 'log') A.render();
    });

  async function loadWeworkMin(month) {
    if (W.month === month) return;
    let min = null;
    try {
      const res = await A.api('GET', '/settings/params' + A.qs({ month, group: PARAM_GROUP }));
      for (const g of (res && res.groups) || [])
        for (const e of g.entries || []) if (e.id === WEWORK_KEY && Number.isFinite(e.value)) min = e.value;
    } catch {
      min = null; // thiếu quyền hay lỗi mạng: nhãn không ghi số
    }
    if (month !== S.month) return;
    W.month = month;
    W.min = min;
    if (min != null) paintLive();
  }

  /* Lương KPI từng người: phiếu lương của lần tính hiện hành; chưa có lần tính thì ước tính cả kỳ. Giao diện không tính gì. */
  async function fetchAll(path) {
    const rows = [];
    for (let page = 1; ; page += 1) {
      const res = await A.api('GET', path + A.qs({ page, pageSize: SLIP_PAGE_MAX }));
      rows.push(...(res.rows || []));
      if (!res.rows || !res.rows.length || rows.length >= res.total) return { res, rows };
    }
  }
  async function loadPay() {
    const month = S.month;
    P.state = 'loading';
    try {
      let got = await fetchAll(`/periods/${month}/payslips`);
      let source = 'payslip';
      if (!got.res.run) {
        got = await fetchAll(`/periods/${month}/estimates`);
        source = 'estimate';
      }
      if (month !== S.month) return;
      P.kpi = new Map(got.rows.filter(r => Number.isFinite(r.kpi)).map(r => [r.username, r.kpi]));
      P.source = source;
      P.month = month;
      P.state = 'ok';
    } catch {
      if (month !== S.month) return;
      P.kpi = null;
      P.state = 'fail';
    }
  }
  // Nạp lương KPI rồi cập nhật: ô tiền và dải số sửa tại chỗ; vẽ lại cả màn chỉ khi không có ô điểm nào đang giữ con trỏ
  const refreshPay = () => loadPay().then(() => (S.view === PAGE ? paintLive() : 0));

  /* ---------- nhập điểm ---------- */
  const parseScore = text => {
    const t = String(text).trim().replace(',', '.');
    if (t === '') return { ok: true, value: null };
    if (!/^\d{1,3}(\.\d{1,2})?$/.test(t)) return { ok: false };
    const n = Number(t);
    return n >= 0 && n <= 100 ? { ok: true, value: n } : { ok: false };
  };
  const scoreText = v => (v == null ? '' : String(v).replace('.', ','));
  const cellId = (user, key) => `${user}|${key}`;
  const inGrid = () => {
    const ae = document.activeElement;
    return !!(ae && ae.matches && ae.matches('input[data-kpi]'));
  };
  // Không vẽ lại cả lưới khi có ô điểm đang giữ con trỏ hoặc đang chờ máy chủ lưu (vẽ lại sẽ thay ô và mất chữ đang nhập)
  const busy = () => inGrid() || K.saving.size > 0;
  // Chữ trong ô khớp điểm đã lưu? (so theo số, "90" và "90,0" là một)
  const sameScore = (text, stored) => {
    const p = parseScore(text);
    return p.ok && p.value === (stored == null ? null : stored);
  };
  const itemOf = user => (K.data && K.data.items.find(i => i.username === user)) || null;
  const rowOf = user => document.querySelector(`tr[data-ku="${CSS.escape(user)}"]`);
  const setDraft = (user, key, text, msg) => K.drafts.set(cellId(user, key), { text, msg });
  // Đánh dấu ô sai tại chỗ: giữ nguyên chữ đã gõ, hiện lý do dưới ô để người dùng sửa rồi rời ô để lưu lại
  function markCell(el, msg) {
    el.setAttribute('aria-invalid', 'true');
    el.style.borderColor = 'var(--rejected)';
    const td = el.closest('td');
    if (!td) return;
    let note = td.querySelector('[data-kerr]');
    if (!note) {
      note = document.createElement('span');
      note.dataset.kerr = '';
      note.className = 'cap kp-err';
      note.setAttribute('role', 'alert');
      td.appendChild(note);
    }
    note.id = `kerr-${el.id}`;
    note.textContent = msg;
    el.setAttribute('aria-describedby', note.id);
  }
  function clearCell(el) {
    el.removeAttribute('aria-invalid');
    el.removeAttribute('aria-describedby');
    el.style.borderColor = '';
    const note = el.closest('td') && el.closest('td').querySelector('[data-kerr]');
    if (note) note.remove();
  }
  // Ô tổng điểm, kết quả và lương KPI của một dòng (dùng khi vẽ cả bảng và khi sửa tại chỗ sau một lần lưu)
  const totalText = item => (item.total != null ? nf(item.total) + '%' : '—');
  function setTotal(td, item) {
    td.textContent = totalText(item);
    td.classList.toggle('z', item.total == null);
  }
  function setPay(td, item) {
    const c = payCell(item);
    td.textContent = c.text;
    td.classList.toggle('z', c.z);
    if (c.title) td.title = c.title;
    else td.removeAttribute('title');
  }
  // Cập nhật đúng một dòng sau khi lưu: các ô điểm, tổng, kết quả, lương KPI. Không đụng ô đang gõ, đang lưu hay đang báo lỗi.
  function patchRow(item) {
    const tr = rowOf(item.username);
    if (!tr) return;
    for (const inp of tr.querySelectorAll('input[data-kpi]')) {
      const key = inp.dataset.p,
        id = cellId(item.username, key);
      if (K.saving.has(id) || K.drafts.has(id)) continue;
      if (inp === document.activeElement && !sameScore(inp.value, item.scores[key])) continue;
      const text = scoreText(item.scores[key]);
      if (inp !== document.activeElement && inp.value !== text) inp.value = text;
      clearCell(inp);
    }
    const total = tr.querySelector('[data-kt]'),
      status = tr.querySelector('[data-ks]'),
      pay = tr.querySelector('[data-kp]');
    if (total) setTotal(total, item);
    if (status) status.innerHTML = statusHtml(item);
    if (pay) setPay(pay, item);
  }
  /* Sau khi dữ liệu đổi: sửa tại chỗ các ô tiền và dải số; chỉ vẽ lại cả màn khi không có ô điểm nào đang giữ con trỏ
     (vẽ lại sẽ thay ô đang gõ). Nếu còn ô đang giữ, ghi nhớ và vẽ bù khi người dùng rời lưới. */
  function paintLive() {
    if (S.view !== PAGE || !K.data) return;
    if (sub() === 'diem' && busy()) {
      for (const cell of document.querySelectorAll('[data-kp]')) {
        const tr = cell.closest('tr');
        const item = tr && itemOf(tr.dataset.ku);
        if (item) setPay(cell, item);
      }
      const box = document.getElementById('kpi-sum');
      if (box) box.outerHTML = summaryHtml();
      K.stale = true;
      return;
    }
    K.stale = false;
    A.render();
  }
  async function saveScore(el) {
    const user = el.dataset.u,
      key = el.dataset.p,
      id = cellId(user, key);
    const item = itemOf(user);
    if (!item) return;
    const parsed = parseScore(el.value);
    if (!parsed.ok) {
      const msg = 'Điểm phải là số từ 0 đến 100, tối đa 2 chữ số thập phân.';
      setDraft(user, key, el.value, msg);
      markCell(el, msg);
      A.toast(msg, 'err');
      return;
    }
    if (parsed.value === item.scores[key]) {
      // gõ lại đúng điểm đã lưu: bỏ trạng thái lỗi
      K.drafts.delete(id);
      clearCell(el);
      return;
    }
    clearCell(el);
    K.drafts.delete(id);
    const seq = (K.seq.get(user) || 0) + 1;
    K.seq.set(user, seq);
    K.saving.add(id);
    try {
      const res = await A.api('PUT', '/kpi/scores', { user, month: K.month, scores: { [key]: parsed.value } });
      // Có lần lưu mới hơn của người này đang chạy: kết quả của nó đã gồm cả ô này, chỉ ghi nhớ điểm vừa lưu
      const cur = itemOf(user);
      if (cur) {
        if (K.seq.get(user) === seq) Object.assign(cur, res.item);
        else cur.scores[key] = parsed.value;
      }
      // Máy chủ lưu kèm cảnh báo (tháng chưa bắt đầu, tự nhập điểm của mình...): A.api đã hiện cảnh báo, không che bằng câu "đã lưu"
      const soft =
        Array.isArray(res && res.warnings) && res.warnings.some(w => w && w.message && w.severity !== 'danger');
      if (!soft) A.toast('Đã lưu điểm');
    } catch (e) {
      // Lưu hỏng: giữ nguyên chữ đã gõ trong ô, báo lý do, người dùng rời ô lần nữa để thử lại
      const msg = A.errText(e);
      setDraft(user, key, el.value, msg);
      const live = document.getElementById(el.id) || el;
      markCell(live, msg);
      A.toast(msg, 'err');
    } finally {
      K.saving.delete(id);
      const cur = itemOf(user); // dữ liệu có thể đã nạp lại trong lúc chờ
      if (cur) patchRow(cur);
      refreshPay(); // điểm đổi thì lương KPI do máy chủ tính lại
    }
  }
  document.addEventListener('focusout', ev => {
    const el = ev.target;
    if (el && el.matches && el.matches('input[data-kpi]') && S.view === PAGE && K.data) {
      // chỉ lưu khi giá trị đổi so với điểm đang có
      saveScore(el);
      // Rời lưới (không sang ô điểm khác): vẽ bù phần đã hoãn khi đang gõ
      setTimeout(() => {
        if (K.stale) paintLive();
      }, 0);
    }
  });
  document.addEventListener('keydown', ev => {
    const el = ev.target;
    if (ev.key !== 'Enter' || !el.matches || !el.matches('input[data-kpi]')) return;
    ev.preventDefault();
    const col = el.dataset.p;
    const all = [...document.querySelectorAll(`input[data-kpi][data-p="${col}"]`)];
    const next = all[all.indexOf(el) + 1];
    if (next) next.focus();
    else el.blur();
  });

  /* ---------- trạng thái, nhãn ---------- */
  const statusOf = i =>
    !i.complete ? 'cho' : i.reason === 'wework' ? 'cong' : i.reason === 'below-pass' ? 'duoi' : 'dat';
  // Mốc Base Wework: số lấy từ máy chủ; chưa có thì nhãn không ghi số
  const minKnown = () => W.month === S.month && W.min != null;
  const weworkBelow = () => (minKnown() ? `Base Wework dưới ${nf(W.min)}` : 'Base Wework chưa đạt mốc');
  function statusHtml(i) {
    const st = statusOf(i);
    if (st === 'cho') {
      const filled = PARTS.filter(([k]) => i.scores && i.scores[k] != null).length;
      return `<span class="kp-miss">${filled ? 'Chưa chấm đủ' : 'Chưa chấm'}</span>`;
    }
    if (st === 'dat') return A.pill('done', 'Đạt');
    const why =
      st !== 'cong'
        ? 'Tổng điểm chưa đạt mốc'
        : minKnown()
          ? `Base Wework dưới ${nf(W.min)} điểm`
          : 'Base Wework chưa đạt mốc';
    return `<span title="${esc(why)}">${A.pillHtml('rejected', `Chưa đạt<span class="sr">: ${esc(why)}</span>`)}</span>`;
  }
  A.actions.kpitab = el => {
    S.sub.kpi = el.dataset.v;
    if (el.dataset.v === 'log') loadNames();
    A.render();
  };
  // Đi tới Cài đặt › Nhật ký thay đổi (chi tiết từng lần sửa điểm)
  A.actions.kpinhatky = () => A.go('cai-dat', 'nhat-ky');

  /* ---------- lương KPI do máy chủ tính (không tính ở đây) ---------- */
  const payOk = () => P.state === 'ok' || (P.state === 'loading' && P.kpi && P.month === S.month);
  // '—' khi người đó chưa có số (chưa tải được, hồ sơ lỗi) hoặc chưa chấm đủ ở tháng tính 5 thành phần (máy chủ trả 0 = chưa tính)
  function payCell(item) {
    if (!payOk()) return { text: P.state === 'loading' ? '…' : '—', z: true };
    if (!P.kpi.has(item.username)) return { text: '—', z: true };
    const v = P.kpi.get(item.username);
    if (v === 0 && !item.complete && K.data && K.data.method === 'five')
      return { text: '—', z: true, title: 'Chưa chấm đủ 5 điểm: chưa tính lương KPI' };
    return { text: nf(v), z: v === 0 };
  }
  const cntOf = k => ((K.data && K.data.items) || []).filter(i => statusOf(i) === k).length;
  function summaryHtml() {
    const five = K.data && K.data.method === 'five';
    const items = (K.data && K.data.items) || [];
    const ok = payOk();
    // cộng các số máy chủ đã trả, không tính lại
    const total = ok ? items.reduce((sum, i) => sum + (P.kpi.has(i.username) ? P.kpi.get(i.username) : 0), 0) : null;
    const value =
      total == null
        ? '—'
        : `<span class="${P.source === 'estimate' ? 'est' : ''}">${nf(total)}<span class="unit">₫</span></span>`;
    const cap = !ok
      ? P.state === 'loading'
        ? 'Đang lấy số từ máy chủ'
        : 'Chưa lấy được số từ máy chủ'
      : P.source === 'payslip'
        ? 'Theo phiếu lương đã tính'
        : 'Chưa chốt';
    const min = minKnown() ? ` từ ${nf(W.min)}` : '';
    const cong = cntOf('cong'),
      duoi = cntOf('duoi');
    return `<section class="kpis" id="kpi-sum" aria-label="Kết quả đánh giá KPI">${A.kpiCard('Đạt', nf(cntOf('dat')), `Base Wework${min} và tổng điểm đạt mốc`)}${A.kpiCard('Chưa chấm đủ', nf(cntOf('cho')), five ? 'Chưa tính được lương KPI' : 'Còn thiếu điểm thành phần')}${A.kpiCard('Chưa đạt', nf(cong + duoi), `${nf(cong)} có ${esc(weworkBelow())} · ${nf(duoi)} có tổng điểm chưa đạt`)}${A.kpiCard(`Lương KPI tháng ${monthNo()}`, value, cap)}</section>`;
  }
  // Dải trọng số: 5 thành phần nhân tỉ lệ cộng thành Tổng điểm; ví dụ là người đầu tiên đã đủ 5 điểm (số của máy chủ)
  function weightsHtml(d) {
    const wOf = k => (d.weights && Number.isFinite(d.weights[k]) ? d.weights[k] : null);
    const ex = d.items.find(i => i.complete && i.total != null);
    const exScores = ex ? PARTS.map(([k]) => ex.scores[k]) : [];
    const sep = exScores.some(v => !Number.isInteger(v)) ? ' · ' : ', ';
    const cell = (label, value, note, cls = '') =>
      `<div class="${cls}"><div class="l">${label}</div><div class="v">${value}</div><div class="n">${note || '&nbsp;'}</div></div>`;
    const parts = PARTS.map(([k, label]) =>
      cell(
        esc(label),
        wOf(k) == null ? '—' : nf(wOf(k)) + '%',
        k === 'wework' && minKnown() ? `Phải từ ${nf(W.min)} điểm mới xét` : ''
      )
    ).join('<div class="op" aria-hidden="true">+</div>');
    const lead = cell(
      'Tổng điểm',
      ex ? totalText(ex) : '—',
      ex
        ? `Ví dụ ${esc(ex.name)}: ${exScores.map(v => esc(scoreText(v))).join(sep)}`
        : 'Chưa có ai được chấm đủ 5 điểm',
      'lead'
    );
    return `<section class="kp-wts" aria-label="Tổng điểm bằng 5 thành phần nhân tỉ lệ">${parts}<div class="op" aria-hidden="true">=</div>${lead}</section>`;
  }
  // Chân thẻ: dòng mô tả bên trái, "Trang x/y" và hai nút chuyển trang bên phải (data-act="page" dùng chung)
  function footHtml(text, key, total, always) {
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const p = S.page[key] || 1;
    const nav =
      always || pages > 1
        ? `<span class="kp-pg"><span class="num">Trang ${p}/${pages}</span><button type="button" class="btn sm icon" data-act="page" data-k="${key}" data-p="${p - 1}" ${p <= 1 ? 'disabled' : ''} aria-label="Trang trước">${ic('chevl', 16)}</button><button type="button" class="btn sm icon" data-act="page" data-k="${key}" data-p="${p + 1}" ${p >= pages ? 'disabled' : ''} aria-label="Trang sau">${ic('chevr', 16)}</button></span>`
        : '';
    return `<div class="card-f kp-foot"><span>${text}</span>${nav}</div>`;
  }
  const who = (name, subText) =>
    `<div class="kp-who">${A.avatar(name)}<div class="col"><span class="t">${esc(name)}</span><span class="s">${subText}</span></div></div>`;
  const posText = i =>
    `${esc(A.TYPE_SHORT[i.type] || i.type || '')} · ${esc(A.levelText(i.type, i.level, K.month || S.month))}`;

  /* ---------- tab Nhập điểm ---------- */
  function gridCard(d) {
    const f = S.f.kst || 'all',
      qtext = A.fold(S.q[PAGE] || '');
    const all = d.items;
    const list = all.filter(
      i => (f === 'all' || statusOf(i) === f) && (!qtext || A.fold(`${i.name} ${i.username}`).includes(qtext))
    );
    const pg = A.pager(PAGE, list.length, PAGE_SIZE);
    const wOf = k => (d.weights && Number.isFinite(d.weights[k]) ? d.weights[k] : null);
    const rows = pg
      .slice(list)
      .map(i => {
        const cells = PARTS.map(([k, l]) => {
          const dr = K.drafts.get(cellId(i.username, k)); // chữ đã gõ nhưng chưa lưu được: giữ nguyên, kèm lý do
          const eid = `k-${esc(i.username)}-${k}`;
          const bad = dr
            ? ` aria-invalid="true" aria-describedby="kerr-${eid}" style="border-color:var(--rejected)"`
            : '';
          return `<td class="c"><label class="sr" for="${eid}">${esc(l)} của ${esc(i.name)}</label><input id="${eid}" class="input sm num kp-in" inputmode="decimal" autocomplete="off" data-kpi data-u="${esc(i.username)}" data-p="${k}" value="${esc(dr ? dr.text : scoreText(i.scores[k]))}" placeholder="—"${bad} ${i.locked ? 'disabled title="Tài khoản đã khoá"' : ''}>${dr ? `<span class="cap kp-err" data-kerr id="kerr-${eid}" role="alert">${esc(dr.msg)}</span>` : ''}</td>`;
        }).join('');
        const pay = payCell(i);
        return `<tr data-ku="${esc(i.username)}"><td>${who(i.name, posText(i))}</td>${cells}<td class="r num kp-tot${i.total == null ? ' z' : ''}" data-kt>${totalText(i)}</td><td data-ks>${statusHtml(i)}</td><td class="r num">${i.kpiMax != null ? nf(i.kpiMax) : '—'}</td><td class="r num${pay.z ? ' z' : ''}" data-kp${pay.title ? ` title="${esc(pay.title)}"` : ''}>${esc(pay.text)}</td></tr>`;
      })
      .join('');
    const chip = (v, label, n) => A.chip(f === v, 'f', `data-k="kst" data-v="${v}" data-pg="${PAGE}"`, label, n);
    const tools = `<div class="kp-tools"><div class="chips">${chip('all', 'Tất cả', all.length)}${chip('cho', 'Chưa chấm đủ', cntOf('cho'))}${chip('cong', weworkBelow(), cntOf('cong'))}${chip('duoi', 'Tổng điểm chưa đạt', cntOf('duoi'))}${chip('dat', 'Đạt', cntOf('dat'))}</div><div class="kp-search">${A.searchBox(PAGE, 'Tìm nhân sự', 240)}</div></div>`;
    const head = `<thead><tr><th>Nhân sự</th>${PARTS.map(([k, l]) => `<th class="c">${esc(l)}${wOf(k) == null ? '' : `<span class="w">${esc(nf(wOf(k)))}%</span>`}</th>`).join('')}<th class="r">Tổng điểm</th><th>Kết quả</th><th class="r">Lương KPI tối đa</th><th class="r">Lương KPI</th></tr></thead>`;
    const cols = `<colgroup><col class="c-who"><col class="c-sc"><col class="c-sc"><col class="c-sc"><col class="c-sc"><col class="c-sc"><col class="c-tot"><col><col class="c-max"><col class="c-pay"></colgroup>`;
    const empty = all.length
      ? A.empty('Không có nhân sự nào khớp bộ lọc', 'Bỏ bớt bộ lọc hoặc xoá chữ trong ô tìm.')
      : A.empty('Chưa có nhân sự nào có đánh giá KPI', 'Chỉ chức vụ có lương KPI mới có trong danh sách.');
    const filtered = f !== 'all' || !!qtext;
    const footText = list.length
      ? `${nf(pg.start + 1)}–${nf(pg.end)} trên ${nf(list.length)} nhân sự ${filtered ? 'khớp bộ lọc' : 'có đánh giá KPI'} · xếp theo chức vụ, tên`
      : '0 nhân sự';
    return `<section class="card flush kp-card"><div class="card-h"><h2>Điểm tháng ${monthNo()}</h2><span class="cap">Nhập điểm từ 0 đến 100 · Tab sang ô bên phải, Enter xuống dòng dưới · tự lưu khi rời ô</span></div>${tools}
<div class="tblwrap"><table class="kp-t">${cols}${head}<tbody>${rows || `<tr><td colspan="10">${empty}</td></tr>`}</tbody></table></div>${footHtml(footText, PAGE, list.length, true)}</section>`;
  }

  /* ---------- tab Lịch sử sửa điểm: lần sửa gần nhất của từng người (GET /kpi/scores → updatedBy, updatedAt) ---------- */
  const logsOf = d =>
    d.items.filter(i => i.updatedAt).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  function logCard(d) {
    const logs = logsOf(d);
    const pg = A.pager(LOG_PAGE, logs.length, PAGE_SIZE);
    const nameOf = u => {
      const s = A.staff && A.staff.byUser && A.staff.byUser.get(u);
      return s ? s.name : '';
    };
    const editor = u =>
      !u
        ? '—'
        : nameOf(u)
          ? `<div class="kp-ed">${esc(nameOf(u))}</div><div class="kp-s2">${esc(u)}</div>`
          : `<div class="kp-ed">${esc(u)}</div>`;
    const body = logs.length
      ? `<div class="tblwrap"><table class="kp-log"><colgroup><col class="c-at"><col><col class="c-ed"></colgroup><thead><tr><th>Lúc</th><th>Nhân sự</th><th>Người sửa</th></tr></thead><tbody>${pg
          .slice(logs)
          .map(
            i =>
              `<tr><td class="num kp-at">${esc(A.fmtStamp(i.updatedAt))}</td><td>${who(i.name, posText(i))}</td><td>${editor(i.updatedBy)}</td></tr>`
          )
          .join(
            ''
          )}</tbody></table></div>${footHtml(`${nf(logs.length)} người đã được sửa điểm trong tháng ${monthNo()}`, LOG_PAGE, logs.length, false)}`
      : `<div class="kp-none">${A.empty('Chưa có lần sửa điểm nào trong tháng này', 'Nhập điểm ở tab Nhập điểm.')}</div>`;
    return `<section class="card flush kp-card"><div class="card-h"><h2>Lịch sử sửa điểm tháng ${monthNo()}</h2><span class="cap">Mỗi dòng là lần sửa gần nhất của một người · chi tiết từng lần có trong <button type="button" class="link" data-act="kpinhatky">Nhật ký thay đổi</button></span></div>${body}</section>`;
  }

  function render() {
    const d = K.data && K.month === S.month ? K.data : null;
    const t = sub();
    const head = A.header(
      'Đánh giá KPI',
      d
        ? `Tháng ${monthNo()} · <b>${nf(cntOf('dat'))} người</b> đạt, <b>${nf(cntOf('cho'))} người</b> chưa chấm đủ`
        : `Tháng ${monthNo()} · đang tải`,
      `<button class="btn" type="button" data-act="sdgo" data-id="4">${ic('sliders', 16)}Điều kiện nhận lương KPI</button>`
    );
    const logN = d ? logsOf(d).length : null;
    const tabs = `<nav class="tabs kp-tabs" aria-label="Mục đánh giá KPI">${[
      ['diem', 'Nhập điểm', d ? nf(d.items.length) : ''],
      ['log', 'Lịch sử sửa điểm', t === 'log' && logN != null ? nf(logN) : ''],
      ['okr', 'OKR', 'Sắp có']
    ]
      .map(
        ([k, l, n]) =>
          `<button type="button" class="${t === k ? 'on' : ''}" data-act="kpitab" data-v="${k}" ${t === k ? 'aria-current="page"' : ''}>${l}${n ? `<small class="num">${n}</small>` : ''}</button>`
      )
      .join('')}</nav>`;
    if (K.error) return head + tabs + `<section class="card">${A.errorBox(K.error)}</section>`;
    if (!d)
      return (
        head +
        tabs +
        `<section class="card flush kp-card"><div class="tblwrap"><table class="kp-t"><tbody>${A.skelRows(8, 6)}</tbody></table></div></section>`
      );
    const top = weightsHtml(d) + summaryHtml() + tabs;
    if (t === 'okr')
      return (
        head +
        top +
        `<section class="card">${A.empty('OKR sẽ có ở đợt sau', 'Đợt này chỉ làm KPI hằng tháng theo 5 thành phần.')}</section>`
      );
    if (t === 'log') return head + top + logCard(d);
    return head + top + gridCard(d);
  }
  A.register('kpi', {
    load,
    render,
    fail: e => (K.error = A.errText(e)),
    onMonth: () => {
      K.data = null;
      K.drafts.clear();
      K.stale = false;
      P.kpi = null;
      P.state = 'idle';
    }
  });
})(window.Admin);
