/* Màn Nhân sự (route #ho-so): danh sách nhân sự (GET /api/staff),
   thêm (hộp giữa màn) và sửa hồ sơ (ngăn kéo bên phải) qua PUT /api/staff/:username, khoá và mở khoá ({ locked }, không bao giờ xoá),
   gán ca cho nhiều người (PUT /api/staff/shift-bulk, tất cả hoặc không). Chỉ hiện các trường app đang có.
   PUT /api/staff/:username THAY CẢ hồ sơ: sửa thì gửi đủ mọi trường đã nạp; thêm mới thì KHÔNG gửi hợp đồng, bảo hiểm, thuế (máy chủ dùng
   mặc định theo loại nhân sự) và kiểm tên đăng nhập chưa có để không ghi đè tài khoản khác. Lỗi 400 của máy chủ hiện nguyên văn.
   Sửa và khoá gửi kèm expectedRev (rev lúc mở hồ sơ); 409 STAFF_STALE: hiện câu máy chủ, giữ các ô đã gõ, nút "Tải lại hồ sơ" (xem FORM_FIELDS).
   Hàng nào có chỗ cần sửa (loại hoặc bậc không hợp lệ, chưa có ca, thiếu ngày bắt đầu, cảnh báo AI về hồ sơ) mới mang nhãn "Cần sửa".
   Mã nhân viên, phòng ban, hợp đồng dạng tệp, ngày hết hạn hợp đồng: chưa có. CSS riêng: man-nhan-su.css (tiền tố ns-).
   Lý do gán ca hàng loạt không bắt buộc;
   thiếu ngày bắt đầu làm, tự sửa hồ sơ, lịch của chính mình chỉ là cảnh báo của máy chủ (tự hiện qua A.api, không bị câu "đã lưu" che).
   Lỗi của máy chủ hiện nguyên văn. */
(function (A) {
  'use strict';
  const { esc, nf, ic, S } = A;
  const PAGE = 'hoso';
  const PAGE_SIZE = 20;
  const maxLevel = type => A.positions.maxLevel(type); // số bậc của chức vụ do máy chủ gửi; máy chủ vẫn kiểm lại
  const CONTRACT = { long: 'HĐLĐ từ 3 tháng', short: 'Dưới 3 tháng / vãng lai' };
  const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{1,39}$/; // khớp USERNAME_RE của máy chủ (2 đến 40 ký tự); máy chủ vẫn kiểm
  const PASSWORD_MIN = 6;
  const REASON_MAX = 300;
  const H = { loading: false, sel: new Set(), dorm: new Map(), pageSel: [] }; // sel: người được tích ở bảng để gán ca hàng loạt
  // Lưu xong: câu "đã lưu" chỉ hiện khi máy chủ không có cảnh báo (A.api đã hiện cảnh báo; không che nó đi)
  const okToast = (res, text) => {
    const soft =
      res && Array.isArray(res.warnings) && res.warnings.some(w => w && w.message && w.severity !== 'danger');
    if (!soft) A.toast(text);
  };
  // Nhãn và kiểm ô lý do: không bắt buộc, chỉ kiểm độ dài tối đa
  const reasonLbl = () => 'Lý do (không bắt buộc)';
  const checkReason = r => {
    if (r.length > REASON_MAX) throw new Error(`Lý do tối đa ${REASON_MAX} ký tự (hiện có ${r.length}).`);
    return r;
  };
  const blankStaff = () => ({
    username: '',
    name: '',
    familyName: '',
    givenName: '',
    contractStatus: null,
    resignedOn: null,
    type: A.typeCodes()[0],
    level: 1,
    shiftCode: '',
    startDate: '',
    birthday: '',
    leaveAdjust: 0,
    jobTitle: '',
    contract: null,
    dependants: 0,
    insured: null,
    taxOn: null,
    deductOn: null,
    advanceOn: null,
    idorm: false
  });

  /* Cờ iDorm theo bậc (GET /api/entitlements → levelCells): bậc nào có mức riêng thì theo bậc, chưa biết thì theo cờ của chức vụ */
  async function loadDorm() {
    try {
      const res = await A.api('GET', '/entitlements' + A.qs({ month: S.month }));
      H.dorm = new Map(
        ((res && res.levelCells) || [])
          .filter(l => l.cells && l.cells['benefit.idorm'])
          .map(l => [`${l.position}.${l.level}`, l.cells['benefit.idorm'].value === true])
      );
    } catch {
      H.dorm = new Map(); // chưa đọc được: dùng cờ của chức vụ
    }
  }
  async function load() {
    H.loading = true;
    loadDorm();
    A.loadAi();
    try {
      await A.loadStaff(true);
    } finally {
      H.loading = false;
    }
  }

  const profileRules = new Set(['missing-start-date', 'negative-leave', 'missing-fixed-shift', 'locked-with-pending']);
  const personFindings = username => {
    const ai = A.ai;
    if (!ai || ai.state !== 'ok' || ai.month !== S.month) return [];
    return (ai.data.findings || []).filter(f => f.username === username && profileRules.has(f.rule));
  };
  const openFindings = username => personFindings(username).filter(f => !f.dismissed); // cảnh báo đã bỏ qua không tính là "Cần sửa"
  const CONTRACT_SHORT = { long: 'HĐLĐ từ 3 tháng', short: 'Dưới 3 tháng' };
  const contractOf = s => CONTRACT_SHORT[s.contract] || '—';
  const CONTRACT_STATUS = { probation: 'Thử việc', official: 'Chính thức' }; // chỉ hiển thị, không đổi tiền
  const contractStatusOf = s => CONTRACT_STATUS[s.contractStatus] || '';
  const startRequired = s => A.positions.flag(s.type, 'startDateRequired', false); // cờ của chức vụ; chưa biết thì không báo thiếu
  const startMissing = s => s.role !== 'admin' && startRequired(s) && !s.startDate;
  const shiftOf = A.shiftOf; // nhận cả mã ca cũ (n1 …)
  const lowerFirst = t => (/^\p{Lu}\p{Ll}/u.test(t) ? t[0].toLowerCase() + t.slice(1) : t);

  /* Giá trị đang lưu không nằm trong các lựa chọn (dữ liệu cũ hoặc nhập sai): không để ô chọn tự rơi về lựa chọn đầu
     (sẽ lặng lẽ đổi loại và lương khi bấm Lưu) mà hiện một dòng chặn, chọn lại mới lưu được. */
  const typeKeys = () => A.typeCodes();
  const levelOk = (type, level) => {
    const n = Number(level);
    return (
      typeof level !== 'boolean' &&
      level !== null &&
      level !== '' &&
      Number.isInteger(n) &&
      n >= 1 &&
      n <= (maxLevel(type) || 0)
    );
  };
  /* Chỗ cần sửa của một hồ sơ: [mã, chữ liên kết]; mã cũng là ô được đặt con trỏ khi mở hồ sơ từ liên kết */
  const FIX_FIELD = { type: 'hs-type', level: 'hs-level', shift: 'hs-shift', start: 'hs-start' };
  const issuesOf = s => {
    const out = [];
    if (!typeKeys().includes(s.type)) out.push(['type', 'Sửa loại nhân sự']);
    else if (!levelOk(s.type, s.level)) out.push(['level', 'Sửa bậc']);
    if (!s.shiftCode) out.push(['shift', 'Gán ca']);
    if (startMissing(s)) out.push(['start', 'Thêm ngày bắt đầu']);
    return out;
  };

  /* ---------- hành động ---------- */
  A.actions.hsopen = el => openProfile(el.dataset.u);
  A.actions.hsnew = () => openProfile('', true);
  A.actions.hsfix = el => openProfile(el.dataset.u, false, null, el.dataset.f);
  A.actions.hssel = el => {
    if (H.sel.has(el.dataset.u)) H.sel.delete(el.dataset.u);
    else H.sel.add(el.dataset.u);
    A.render();
  };
  /* Ô chọn ở đầu bảng: chọn hoặc bỏ chọn mọi người chưa khoá đang hiện ở trang này */
  A.actions.hsselall = () => {
    const all = H.pageSel.length && H.pageSel.every(u => H.sel.has(u));
    for (const u of H.pageSel) {
      if (all) H.sel.delete(u);
      else H.sel.add(u);
    }
    A.render();
  };
  /* "Tất cả": bỏ mọi bộ lọc (loại và các lọc chỗ cần sửa) */
  A.actions.hsall = () => {
    S.f.hstype = '';
    S.f.hsnoshift = false;
    S.f.hsnostart = false;
    S.f.hslocked = false;
    S.page[PAGE] = 1;
    A.render();
  };

  /* ---------- gán ca cho nhiều người: chọn người, chọn một trong 6 ca cố định, ghi lý do, tất cả hoặc không ---------- */
  A.actions.hsbulk = () => {
    const sel = new Set([...H.sel].filter(u => A.people().some(x => x.username === u && !x.locked)));
    let query = '';
    let typeF = '';
    const eligible = () => A.people().filter(x => !x.locked);
    const visible = () =>
      eligible().filter(
        x => (!typeF || x.type === typeF) && (!query || A.fold(`${x.name} ${x.username}`).includes(query))
      );
    const listHtml = () =>
      visible()
        .map(
          x =>
            `<label class="row" style="gap:10px;padding:6px 0;border-top:1px solid var(--rule)"><input type="checkbox" class="ns-check" data-bs-u="${esc(x.username)}" ${sel.has(x.username) ? 'checked' : ''}><span class="col" style="min-width:0"><span>${esc(x.name)} <span class="cap">${esc(x.username)}</span></span><span class="cap">Ca hiện tại: ${x.shiftCode ? esc(A.shiftName(x.shiftCode)) : 'chưa có ca'}</span></span></label>`
        )
        .join('') || A.empty('Không có ai khớp', 'Đổi từ khoá tìm kiếm.');
    const api = A.openDialog({
      title: 'Gán ca cho nhiều người',
      wide: true,
      cls: 'ns-bulk',
      body: `<div class="row wrap" style="gap:12px;align-items:flex-end"><div class="formrow" style="flex:1 1 240px"><label class="lbl" for="bs-q">Tìm nhân sự</label><input id="bs-q" class="input" type="search" autocomplete="off" placeholder="Tên hoặc tên đăng nhập"></div>
<div class="formrow" style="flex:1 1 160px"><label class="lbl" for="bs-type">Loại nhân sự</label><select id="bs-type" class="input"><option value="">Tất cả</option>${A.typeCodes()
        .map(t => `<option value="${esc(t)}">${esc(A.TYPE_LONG[t] || t)}</option>`)
        .join('')}</select></div>
<div class="formrow" style="flex:1 1 240px"><label class="lbl" for="bs-shift">Ca cố định</label><select id="bs-shift" class="input">${A.SHIFTS.map(([c, n, a, b]) => `<option value="${esc(c)}">${esc(n)} ${esc(a)}–${esc(b)}</option>`).join('')}</select></div></div>
<div class="row between wrap"><span class="cap" id="bs-count" aria-live="polite">${sel.size ? `Đã chọn ${nf(sel.size)} người` : 'Chưa chọn ai'}</span><span class="row" style="gap:8px"><button type="button" class="btn sm" id="bs-all">Chọn mọi người đang hiện</button><button type="button" class="btn sm ghost" id="bs-none">Bỏ chọn hết</button></span></div>
<div id="bs-list" style="max-height:300px;overflow:auto">${listHtml()}</div>
<div class="formrow"><label class="lbl" for="bs-reason">${esc(reasonLbl())}</label><textarea id="bs-reason" class="input" maxlength="${REASON_MAX}" placeholder="Ví dụ: đổi lịch ca theo thông báo tháng 11"></textarea></div>`,
      foot: [
        { label: 'Huỷ' },
        {
          label: 'Gán ca',
          cls: 'pri',
          icon: 'check',
          onClick: async dlg => {
            const usernames = [...sel];
            const reason = (dlg.root.querySelector('#bs-reason').value || '').trim();
            if (!usernames.length) throw new Error('Chọn ít nhất một người.');
            checkReason(reason);
            const preset = dlg.root.querySelector('#bs-shift').value;
            const res = await A.api('PUT', '/staff/shift-bulk', { usernames, preset, reason });
            const n = Array.isArray(res && res.updated)
              ? res.updated.length
              : Array.isArray(res && res.staff)
                ? res.staff.length
                : usernames.length;
            dlg.close();
            H.sel.clear();
            await A.loadStaff(true);
            A.loadAi(true);
            A.render();
            okToast(res, `Đã gán ${A.shiftName(preset)} cho ${nf(n)} người`);
          }
        }
      ],
      onMount: dlg => {
        const root = dlg.root;
        const paint = () => {
          root.querySelector('#bs-list').innerHTML = listHtml();
          const c = root.querySelector('#bs-count');
          c.textContent = sel.size ? `Đã chọn ${nf(sel.size)} người` : 'Chưa chọn ai';
        };
        root.addEventListener('change', ev => {
          const b = ev.target.closest('[data-bs-u]');
          if (!b) return;
          if (b.checked) sel.add(b.dataset.bsU);
          else sel.delete(b.dataset.bsU);
          paint();
        });
        root.querySelector('#bs-type').addEventListener('change', ev => {
          typeF = ev.target.value;
          paint();
        });
        root.querySelector('#bs-q').addEventListener('input', ev => {
          query = A.fold(ev.target.value);
          paint();
        });
        root.querySelector('#bs-all').addEventListener('click', () => {
          for (const x of visible()) sel.add(x.username);
          paint();
        });
        root.querySelector('#bs-none').addEventListener('click', () => {
          sel.clear();
          paint();
        });
      }
    });
    return api;
  };
  A.actions.hswhy = el => {
    const fs = personFindings(el.dataset.u);
    if (fs.length) A.openWhy(fs);
  };

  /* Ô iDorm theo chức vụ: hiện khi cờ iDorm của chức vụ hoặc bậc bật */
  const hasDorm = (type, level) =>
    H.dorm.has(`${type}.${level}`) ? H.dorm.get(`${type}.${level}`) : A.positions.flag(type, 'idorm', false);
  const dormBox = (s, type = s.type, level = s.level) =>
    hasDorm(type, level) ? flag('hs-idorm', 'Ở iDorm', s.idorm) : '';
  const badValueOption = (stored, empty = 'trống') =>
    `<option value="" selected disabled>— Giá trị đang lưu không hợp lệ: ${esc(stored === null || stored === undefined || stored === '' ? empty : String(stored))}, chọn lại —</option>`;
  const typeOptions = selected =>
    (typeKeys().includes(selected) ? '' : badValueOption(selected)) +
    typeKeys()
      .map(t => `<option value="${esc(t)}" ${selected === t ? 'selected' : ''}>${esc(A.TYPE_LONG[t] || t)}</option>`)
      .join('');
  // "Bậc 1 · Fresher" khi bậc có tên, "Bậc 1" khi tên trống
  const levelOptionText = (type, n) => {
    const name = A.levelNames.name(type, n);
    return name ? `Bậc ${n} · ${name}` : `Bậc ${n}`;
  };
  function levelOptions(type, selected) {
    if (!maxLevel(type)) return `<option value="" selected disabled>— Chọn loại nhân sự trước —</option>`;
    return (
      (levelOk(type, selected) ? '' : badValueOption(selected)) +
      Array.from({ length: maxLevel(type) }, (_, i) => i + 1)
        .map(
          n =>
            `<option value="${n}" ${Number(selected) === n ? 'selected' : ''}>${esc(levelOptionText(type, n))}</option>`
        )
        .join('')
    );
  }
  /* Đóng bảo hiểm: "Theo mặc định của hợp đồng" (gửi null, Kế toán đặt mặc định theo loại hợp đồng) hoặc Có/Không chọn rõ cho riêng người này.
     Máy chủ chỉ trả giá trị hiệu lực, nên ô hiện "mặc định" khi giá trị đang dùng trùng với mặc định của hợp đồng. */
  const insuredDefault = (s, contract) =>
    typeof s.insuredDefault === 'boolean'
      ? s.insuredDefault
      : contract === 'long'
        ? true
        : contract === 'short'
          ? false
          : null;
  const insuredLabel = d => `Theo mặc định của hợp đồng${d === null ? '' : ` (${d ? 'Có' : 'Không'})`}`;
  function insuredField(s) {
    const d = insuredDefault(s, s.contract);
    // insuredExplicit (máy chủ báo cột có đặt rõ hay để NULL theo mặc định) thắng; thiếu thì đoán theo giá trị hiệu lực
    const sel =
      typeof s.insuredExplicit === 'boolean'
        ? s.insuredExplicit
          ? s.insured
            ? '1'
            : '0'
          : ''
        : d !== null && !!s.insured === d
          ? ''
          : s.insured
            ? '1'
            : '0';
    return `<div class="formrow"><label class="lbl" for="hs-ins">Đóng bảo hiểm bắt buộc</label><select id="hs-ins" class="input"><option value="" ${sel === '' ? 'selected' : ''}>${esc(insuredLabel(d))}</option><option value="1" ${sel === '1' ? 'selected' : ''}>Có</option><option value="0" ${sel === '0' ? 'selected' : ''}>Không</option></select></div>`;
  }
  const flag = (id, label, checked) =>
    `<label class="ns-cbl"><input type="checkbox" class="ns-check" id="${id}" ${checked ? 'checked' : ''}><span>${esc(label)}</span></label>`;

  /* ---------- hồ sơ bị người khác sửa trước (409 STAFF_STALE) ----------
     Sửa hồ sơ và khoá, mở khoá gửi kèm expectedRev = rev của hồ sơ lúc mở hộp thoại; lệch thì máy chủ không ghi gì.
     Hộp thoại giữ nguyên những gì Admin đã gõ, hiện câu của máy chủ và nút "Tải lại hồ sơ": nạp bản mới, mở lại hộp thoại
     và đặt lại đúng những ô Admin đã sửa (kèm dòng nhắc liệt kê), các ô còn lại là dữ liệu mới nhất. */
  const FORM_FIELDS = [
    ['hs-type', 'Loại nhân sự'],
    ['hs-level', 'Bậc'],
    ['hs-fam', 'Họ và tên đệm'],
    ['hs-given', 'Tên'],
    ['hs-cst', 'Tình trạng hợp đồng'],
    ['hs-resign', 'Ngày nghỉ việc'],
    ['hs-job', 'Chức danh'],
    ['hs-shift', 'Ca cố định'],
    ['hs-start', 'Ngày bắt đầu làm'],
    ['hs-birth', 'Ngày sinh'],
    ['hs-adj', 'Điều chỉnh phép'],
    ['hs-idorm', 'Ở iDorm'],
    ['hs-contract', 'Hợp đồng'],
    ['hs-dep', 'Số người phụ thuộc'],
    ['hs-ins', 'Đóng bảo hiểm bắt buộc'],
    ['hs-tax', 'Khấu trừ thuế TNCN'],
    ['hs-ded', 'Giảm trừ gia cảnh'],
    ['hs-adv', 'Được tạm ứng']
  ];
  const fieldValue = el => (el.type === 'checkbox' ? el.checked : el.value);
  const readForm = root => {
    const out = {};
    for (const [id] of FORM_FIELDS) {
      const el = root.querySelector('#' + id);
      if (el) out[id] = fieldValue(el);
    }
    return out;
  };
  /* Các ô khác với ảnh chụp lúc mở hộp thoại (hoặc lúc đặt lại): đúng những gì Admin đã tự sửa */
  const dirtyFields = (root, snap) => {
    const now = readForm(root),
      out = {};
    for (const id of Object.keys(now)) if (!(id in snap) || now[id] !== snap[id]) out[id] = now[id];
    return out;
  };
  const applyCarry = (root, carry) => {
    for (const [id] of FORM_FIELDS) {
      const el = root.querySelector('#' + id);
      if (!el || !(id in carry)) continue;
      if (el.type === 'checkbox') el.checked = !!carry[id];
      else el.value = carry[id];
      if (id === 'hs-type' || id === 'hs-level') el.dispatchEvent(new Event('change')); // dựng lại danh sách bậc và ô iDorm
    }
  };
  const isStale = e => !!e && e.status === 409 && !!e.data && e.data.code === 'STAFF_STALE';
  /* Ngăn kéo hồ sơ cuộn được và chân nút dính đáy: trên điện thoại câu báo lỗi nằm ngoài khung nhìn, Admin bấm Lưu mà không thấy gì.
     Cuộn câu báo vào giữa khung (không sát đáy, để chân nút dính không che mất). */
  const revealErr = dlg => {
    const box = dlg.root.querySelector('#dlg-err');
    if (box && !box.hidden && typeof box.scrollIntoView === 'function') box.scrollIntoView({ block: 'center' });
  };
  /* Mọi lỗi khi lưu (kiểm tra ở trình duyệt hay máy chủ trả về) hiện trong hộp rồi cuộn tới; không ném lại để hộp thoại không ghi đè */
  const showErr = (dlg, e) => {
    dlg.error(A.errText(e));
    revealErr(dlg);
  };
  const withReveal = (dlg, run) => {
    let out;
    try {
      out = run();
    } catch (e) {
      showErr(dlg, e);
      return;
    }
    return out && typeof out.then === 'function' ? out.catch(e => showErr(dlg, e)) : out;
  };
  /* Hiện câu của máy chủ trong hộp thoại cùng nút "Tải lại hồ sơ"; getCarry() trả các ô Admin đã sửa (null nếu không có) */
  function showStale(dlg, e, username, getCarry) {
    // Tải lại danh sách ngay: Admin đóng hộp (không bấm "Tải lại hồ sơ") rồi mở lại thì hồ sơ có rev mới và giá trị người kia vừa lưu;
    // không thì danh sách cũ giữ rev cũ và mọi lần lưu sau đều 409. openProfile chờ lần tải này xong mới mở.
    A.loadStaff(true);
    dlg.error(A.errText(e));
    const box = dlg.root.querySelector('#dlg-err');
    if (!box) return;
    box.insertAdjacentHTML(
      'beforeend',
      '<div class="row" style="gap:8px;margin-top:8px"><button type="button" class="btn sm" data-hs-reload>Tải lại hồ sơ</button></div>'
    );
    revealErr(dlg);
    const btn = box.querySelector('[data-hs-reload]');
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      await (A.staff.state === 'loading' ? A.staff.promise : A.loadStaff(true)); // lần tải lúc báo 409 chưa xong thì dùng luôn
      if (A.staff.state !== 'ok' || !A.staff.byUser.has(username)) {
        btn.disabled = false;
        dlg.error(
          A.staff.state !== 'ok'
            ? A.staff.error || 'Không tải lại được hồ sơ.'
            : 'Không còn thấy hồ sơ này trong danh sách.'
        );
        return;
      }
      const carry = getCarry ? getCarry() : null; // các ô sửa lấy lúc bấm (trước khi đóng hộp), không phải lúc báo lỗi
      A.closeDialog();
      A.render();
      openProfile(username, false, carry);
    });
  }

  /* ---------- ngăn kéo Sửa hồ sơ và hộp Thêm nhân sự ---------- */
  /* Khung bốn ô đầu ngăn kéo: tên đăng nhập, tài khoản, tạo lúc, phép năm */
  function factsHtml(s) {
    const leave = s.leave;
    const cell = (label, value) => `<div><span>${esc(label)}</span><b>${value}</b></div>`;
    return `<div class="ns-facts">${cell('Tên đăng nhập', `<code class="mono">${esc(s.username)}</code>`)}${cell(
      'Tài khoản',
      s.locked ? `Đã khoá · <span class="num">${esc(A.fmtStamp(s.lockedAt))}</span>` : 'Đang dùng'
    )}${cell('Tạo lúc', `<span class="num">${esc(A.fmtStamp(s.createdAt))}</span>`)}${cell(
      'Phép năm',
      leave
        ? `<span class="num">cộng ${nf(leave.total)} · dùng ${nf(leave.used)} · còn ${nf(leave.balance)}</span>`
        : 'Không áp dụng'
    )}</div>`;
  }
  /* Cảnh báo AI về hồ sơ ở đầu ngăn kéo: tên quy tắc, mức, câu của máy chủ, liên kết "Xem lý do" */
  const NOTE_KIND = { high: 'err', medium: 'warn' };
  const aiNotes = fs =>
    fs
      .map(
        f =>
          `<div class="note ns-ai ${NOTE_KIND[f.severity] || ''}" role="status">${ic('alert', 16)}<span><b>${esc(A.ruleLabel(f.rule))}</b> · AI cảnh báo mức ${esc((A.SEVERITY[f.severity] || f.severity || '').toLowerCase())}: ${esc(lowerFirst(A.aiMessage(f)))} <button type="button" class="link" data-ns-why>Xem lý do</button></span></div>`
      )
      .join('');
  /* Dòng lịch làm việc trong ngăn kéo: lấy từ lịch theo loại nhân sự máy chủ trả (GET /api/staff/:u/schedule?month=) */
  async function fillSched(root, username) {
    const el = root.querySelector('#hs-sched');
    if (!el) return;
    let text;
    try {
      const d = await A.api('GET', `/staff/${encodeURIComponent(username)}/schedule${A.qs({ month: S.month })}`);
      const sch = (d && d.schedule) || {};
      text = `Lịch làm việc: theo loại nhân sự, ${A.dowsText((sch.pattern && sch.pattern.dows) || [])}`;
    } catch {
      text = 'Lịch làm việc: chưa đọc được';
    }
    if (document.contains(el)) el.textContent = text;
  }

  function openProfile(username, isNew = false, carry = null, focus = '') {
    // Danh sách đang tải lại (sau 409 STAFF_STALE hay sau khi lưu): chờ xong để mở bằng hồ sơ và rev mới nhất, không bằng bản cũ
    if (!isNew && A.staff.state === 'loading')
      return A.staff.promise.then(() => openProfile(username, isNew, carry, focus));
    const s = isNew ? blankStaff() : A.staff.byUser.get(username);
    if (!s) return;
    let snap = {}; // giá trị các ô lúc mới mở, để biết Admin đã sửa ô nào
    const admin = s.role === 'admin';
    const self = A.S.me && A.S.me.username === s.username;
    if (admin) {
      A.openDialog({
        title: s.name,
        sub: 'Tài khoản Admin',
        drawer: true,
        wide: true,
        cls: 'ns-drw',
        body: factsHtml(s),
        foot: [{ label: 'Đóng' }]
      });
      return;
    }
    const fs = isNew ? [] : openFindings(s.username);
    const warnShift = !isNew && !s.shiftCode;
    const warnStart = !isNew && startMissing(s);
    const lbl = (id, text, small = '') =>
      `<label class="lbl" for="${id}">${esc(text)}${small ? ` <small>${esc(small)}</small>` : ''}</label>`;
    const identity = isNew
      ? `<div class="formrow">${lbl('hs-user', 'Tên đăng nhập')}<input id="hs-user" class="input" maxlength="40" autocomplete="off" placeholder="chữ thường, số, dấu . _ -"></div>
<div class="formrow">${lbl('hs-pass', 'Mật khẩu đầu tiên', `(ít nhất ${PASSWORD_MIN} ký tự)`)}<input id="hs-pass" class="input" type="password" autocomplete="new-password"></div>`
      : '';
    const shiftOptions =
      `<option value="">${isNew ? 'Chưa có ca' : 'Chưa có ca · chọn ca'}</option>` +
      A.SHIFTS.map(
        ([c, n, a, b]) =>
          `<option value="${esc(c)}" ${s.shiftCode === c ? 'selected' : ''}>${esc(n)} ${esc(a)}–${esc(b)}</option>`
      ).join('');
    const main = `<div class="ns-g2">${identity}
<div class="formrow">${lbl('hs-fam', 'Họ và tên đệm')}<input id="hs-fam" class="input" maxlength="80" autocomplete="off" value="${esc(s.familyName || '')}"></div>
<div class="formrow">${lbl('hs-given', 'Tên')}<input id="hs-given" class="input" maxlength="40" autocomplete="off" value="${esc(s.givenName || '')}"></div>
<div class="formrow">${lbl('hs-job', 'Chức danh', '(in trên phiếu lương)')}<input id="hs-job" class="input" maxlength="80" value="${esc(s.jobTitle)}" placeholder="Chưa có"></div>
<div class="formrow">${lbl('hs-cst', 'Tình trạng hợp đồng')}<select id="hs-cst" class="input"><option value="">—</option>${Object.entries(
      CONTRACT_STATUS
    )
      .map(([k, t]) => `<option value="${k}" ${s.contractStatus === k ? 'selected' : ''}>${esc(t)}</option>`)
      .join('')}</select></div>
<div class="formrow">${lbl('hs-type', 'Loại nhân sự')}<select id="hs-type" class="input">${typeOptions(s.type)}</select></div>
<div class="formrow">${lbl('hs-level', 'Bậc')}<select id="hs-level" class="input">${levelOptions(s.type, s.level)}</select></div>
<div class="formrow${warnShift ? ' ns-warnf' : ''}" data-ns-warn="${warnShift ? 'shift' : ''}">${lbl('hs-shift', 'Ca cố định')}<select id="hs-shift" class="input">${shiftOptions}</select></div>
<div class="formrow${warnStart ? ' ns-warnf' : ''}" data-ns-warn="${warnStart ? 'start' : ''}">${lbl('hs-start', 'Ngày bắt đầu làm')}<input id="hs-start" class="input" type="date" value="${esc(s.startDate || '')}"></div>
${isNew ? '' : `<div class="formrow">${lbl('hs-resign', 'Ngày nghỉ việc')}<input id="hs-resign" class="input" type="date" value="${esc(s.resignedOn || '')}"></div>`}
<div class="formrow">${lbl('hs-birth', 'Ngày sinh')}<input id="hs-birth" class="input" type="date" value="${esc(s.birthday || '')}"></div>
<div class="formrow">${lbl('hs-adj', 'Điều chỉnh phép', '(+/− ngày, bước 0,5)')}<input id="hs-adj" class="input" type="number" step="0.5" min="-365" max="365" value="${esc(s.leaveAdjust)}"></div></div>
<div id="hs-warn" hidden></div>`;
    const contract = `<div class="ns-grp-t">Hợp đồng, bảo hiểm, thuế</div>
<div class="ns-g2"><div class="formrow">${lbl('hs-contract', 'Hợp đồng')}<select id="hs-contract" class="input">${Object.entries(
      CONTRACT
    )
      .map(([k, v]) => `<option value="${k}" ${s.contract === k ? 'selected' : ''}>${esc(v)}</option>`)
      .join('')}</select></div>
<div class="formrow">${lbl('hs-dep', 'Số người phụ thuộc')}<input id="hs-dep" class="input" type="number" min="0" max="20" step="1" value="${esc(s.dependants)}"></div></div>
<div class="ns-full">${insuredField(s)}</div>
<div class="ns-ck">${flag('hs-tax', 'Khấu trừ thuế TNCN', s.taxOn)}${flag('hs-ded', 'Giảm trừ gia cảnh', s.deductOn)}${flag('hs-adv', 'Được tạm ứng', s.advanceOn)}</div>`;
    const form = isNew
      ? `<form id="hs-form" class="ns-form" novalidate>${main}<div id="hs-nv" class="ns-ck ns-nv">${dormBox(s)}</div></form>
${A.note('Hợp đồng, bảo hiểm và thuế lấy theo mặc định của loại nhân sự; sửa sau trong hồ sơ.')}`
      : `<form id="hs-form" class="ns-form" novalidate>${main}
<div class="ns-ck"><span id="hs-nv" class="ns-nv">${dormBox(s)}</span><span class="ns-sched" id="hs-sched">Lịch làm việc: đang tải…</span></div>
${contract}</form>
<div class="ns-hist" id="hs-hist" hidden></div>`;
    const lockBtn = s.locked
      ? { label: 'Mở khoá tài khoản', icon: 'unlock', onClick: api => lockFlow(s, false, api) }
      : {
          label: 'Khoá tài khoản',
          cls: 'danger ns-dz',
          icon: 'lock',
          onClick: api => lockFlow(s, true, api),
          disabled: self
        };
    const saveBtn = {
      label: isNew ? 'Tạo nhân sự' : 'Lưu hồ sơ',
      cls: 'pri',
      icon: isNew ? 'plus' : 'check',
      onClick: api => withReveal(api, () => save(s, api, isNew, () => dirtyFields(api.root, snap)))
    };
    A.openDialog({
      title: isNew ? 'Thêm nhân sự' : s.name,
      sub: isNew
        ? 'Tạo hồ sơ và tài khoản đăng nhập vai trò Nhân viên'
        : `${A.typeLong(s)} · ${levelOk(s.type, s.level) ? levelOptionText(s.type, Number(s.level)) : A.levelLabel(s)}`,
      ...(isNew ? { width: 820, cls: 'ns-dlg' } : { drawer: true, wide: true, cls: 'ns-drw' }),
      body: isNew ? form : `${aiNotes(fs)}${factsHtml(s)}${form}`,
      foot: isNew
        ? [{ label: 'Huỷ' }, saveBtn]
        : [
            { label: 'Đóng' },
            lockBtn,
            /* Khai lịch thay: mở lịch ước tính của người này ở trang nhân viên, cho tháng đang chọn (A.actForUrl). Chỉ khi tài khoản
               đang dùng có năng lực xử lý yêu cầu; tài khoản khoá hoặc không vào bảng lương thì không có lịch để khai.
               Ô hồ sơ đang sửa dở thì không rời trang (sẽ mất): báo lưu hoặc bỏ trước */
            ...(s.locked || s.payrollSubject === false || !A.canActFor()
              ? []
              : [
                  {
                    label: 'Khai lịch thay',
                    icon: 'cal',
                    onClick: api => {
                      const n = Object.keys(dirtyFields(api.root, snap)).length;
                      if (n)
                        return api.error(
                          `Hồ sơ đang có ${n} ô sửa chưa lưu. Bấm Lưu hồ sơ (hoặc Đóng để bỏ thay đổi) rồi mới khai lịch thay.`
                        );
                      A.actions.khaithay({ dataset: { u: s.username } });
                    }
                  }
                ]),
            saveBtn
          ],
      onMount: api => {
        const type = api.root.querySelector('#hs-type'),
          level = api.root.querySelector('#hs-level');
        const w = api.root.querySelector('#hs-warn');
        // Hai dòng nhắc: loại bị đổi (đổi lịch và yêu cầu chờ xử lý), và loại / bậc đang lưu không hợp lệ cần chọn lại
        const showWarn = () => {
          api.error('');
          const changed = !isNew && typeKeys().includes(type.value) && type.value !== s.type; // tạo mới: chưa có lịch hay yêu cầu chờ xử lý nào để cảnh báo
          const bad = [];
          if (!typeKeys().includes(type.value)) bad.push('Loại nhân sự');
          if (typeKeys().includes(type.value) && !levelOk(type.value, level.value)) bad.push('Bậc');
          const html =
            (bad.length
              ? A.note(`${bad.join(' và ')} đang lưu không hợp lệ. Chọn lại rồi mới lưu được hồ sơ.`, 'alert')
              : '') +
            (changed
              ? A.note('Đổi loại nhân sự sẽ đổi lịch làm việc và các yêu cầu chờ xử lý của người này.', 'alert')
              : '');
          w.hidden = !html;
          w.innerHTML = html;
        };
        // Loại đang lưu không hợp lệ: giữ bậc đang lưu nếu hợp với loại mới chọn, không lặng lẽ đặt về bậc 1
        const keepLevel = typeKeys().includes(s.type) ? 1 : s.level;
        type.addEventListener('change', () => {
          level.innerHTML = levelOptions(type.value, keepLevel);
          api.root.querySelector('#hs-nv').innerHTML = dormBox(s, type.value, Number(level.value));
          showWarn();
        });
        level.addEventListener('change', () => {
          api.root.querySelector('#hs-nv').innerHTML = dormBox(s, type.value, Number(level.value));
          showWarn();
        });
        // Viền đỏ của ô chưa có ca / thiếu ngày bắt đầu: tắt khi đã điền
        api.root.querySelectorAll('[data-ns-warn]:not([data-ns-warn=""])').forEach(row => {
          const input = row.querySelector('.input');
          input.addEventListener('change', () => row.classList.toggle('ns-warnf', !input.value));
        });
        const con = api.root.querySelector('#hs-contract');
        const ins = api.root.querySelector('#hs-ins');
        if (con && ins)
          con.addEventListener('change', () => {
            ins.options[0].textContent = insuredLabel(insuredDefault(s, con.value)); // nhãn "mặc định" theo hợp đồng đang chọn
          });
        api.root.querySelectorAll('[data-ns-why]').forEach(b => b.addEventListener('click', () => A.openWhy(fs)));
        if (!isNew) {
          showWarn();
          fillSched(api.root, s.username);
          if (A.StaffHistory) A.StaffHistory.mount(api.root.querySelector('#hs-hist'), s.uuid); // tự ẩn khi không có audit.read
        }
        snap = readForm(api.root);
        // Mở lại sau khi tải hồ sơ mới: đặt lại các ô Admin đã sửa và nói rõ đã giữ những ô nào
        const kept = carry ? FORM_FIELDS.filter(([id]) => id in carry) : [];
        if (kept.length) {
          applyCarry(api.root, carry);
          showWarn();
          api.root
            .querySelector('#dlg-body')
            .insertAdjacentHTML(
              'afterbegin',
              A.note(
                `Đã tải lại hồ sơ mới nhất. Chỗ bạn vừa sửa được giữ lại: ${esc(kept.map(([, label]) => label).join(', '))}. Các ô còn lại là dữ liệu mới. Kiểm tra rồi bấm Lưu hồ sơ.`,
                'alert'
              )
            );
        }
        // Mở từ liên kết "Gán ca", "Sửa loại nhân sự"...: đặt con trỏ vào đúng ô (sau lần đặt con trỏ mặc định của hộp thoại)
        const target = FIX_FIELD[focus] && api.root.querySelector('#' + FIX_FIELD[focus]);
        if (target)
          setTimeout(() => {
            if (document.contains(target)) target.focus();
          }, 0);
      }
    });
  }

  function lockFlow(s, lock, dlg) {
    dlg.close();
    A.openDialog({
      title: lock ? 'Khoá tài khoản' : 'Mở khoá tài khoản',
      sub: s.name,
      foot: [
        { label: 'Huỷ' },
        {
          label: lock ? 'Khoá tài khoản' : 'Mở khoá',
          cls: lock ? 'danger' : 'pri',
          icon: lock ? 'lock' : 'unlock',
          onClick: async api => {
            let res;
            try {
              res = await A.api('PUT', '/staff/' + encodeURIComponent(s.username), {
                locked: lock,
                ...(s.rev === undefined ? {} : { expectedRev: s.rev })
              });
              if (res && res.staff && res.staff.rev !== undefined) s.rev = res.staff.rev;
            } catch (e) {
              if (!isStale(e)) throw e;
              showStale(api, e, s.username, null); // không gõ gì trong hộp này nên không có ô nào để giữ lại
              return;
            }
            okToast(res, lock ? 'Đã khoá tài khoản' : 'Đã mở khoá tài khoản');
            api.close();
            await A.loadStaff(true);
            A.render();
          }
        }
      ]
    });
  }

  function save(s, dlg, isNew = false, getDirty = () => ({})) {
    const v = id => dlg.root.querySelector('#' + id);
    const type = v('hs-type').value;
    // Họ và tên đệm + tên: máy chủ viết hoa chữ đầu và ghép thành họ tên; name gửi kèm cho khớp.
    // Chỉ gửi hai phần khi tạo mới hoặc Admin sửa một trong hai ô: gửi lại nguyên giá trị cũ thì máy chủ viết hoa lại họ tên đang lưu
    // ("NV thử" thành "Nv Thử"), ghi nhật ký đổi họ tên và tăng số phiên bản dù không ai sửa tên
    const familyName = v('hs-fam').value.trim().replace(/\s+/g, ' ');
    const givenName = v('hs-given').value.trim();
    const nameChanged =
      isNew || familyName !== String(s.familyName || '').trim() || givenName !== String(s.givenName || '').trim();
    if (nameChanged) {
      if (!familyName && !givenName) throw new Error('Cần nhập họ tên.');
      if (!givenName) throw new Error('Cần nhập tên.');
      if (/\s/.test(givenName)) throw new Error('Tên chỉ gồm một chữ; phần còn lại nhập ở ô Họ và tên đệm.');
    }
    const name = nameChanged ? [familyName, givenName].filter(Boolean).join(' ') : s.name;
    if (!typeKeys().includes(type)) throw new Error('Loại nhân sự đang lưu không hợp lệ. Chọn lại một loại rồi lưu.');
    if (!levelOk(type, v('hs-level').value)) throw new Error('Bậc đang lưu không hợp lệ. Chọn lại một bậc rồi lưu.');
    let username = s.username;
    let password;
    if (isNew) {
      username = v('hs-user').value.trim().toLowerCase();
      password = v('hs-pass').value;
      if (!USERNAME_RE.test(username))
        throw new Error('Tên đăng nhập: chữ thường, số, dấu . _ - (2 đến 40 ký tự), bắt đầu bằng chữ hoặc số.');
      if (A.staff.byUser.has(username))
        throw new Error(`Tên đăng nhập "${username}" đã có. Mở hồ sơ người đó để sửa, không tạo lại.`);
      if (password.length < PASSWORD_MIN) throw new Error(`Mật khẩu cần ít nhất ${PASSWORD_MIN} ký tự.`);
    }
    const body = {
      name,
      ...(nameChanged ? { familyName, givenName } : {}),
      contractStatus: v('hs-cst').value || null,
      role: 'staff',
      type,
      level: Number(v('hs-level').value),
      shiftCode: v('hs-shift').value || null,
      startDate: v('hs-start').value || null,
      birthday: v('hs-birth').value || null,
      leaveAdjust: Number(v('hs-adj').value) || 0,
      jobTitle: v('hs-job').value.trim(),
      ...(isNew
        ? { password }
        : {
            resignedOn: v('hs-resign').value || null, // để trống = xoá ngày nghỉ việc
            contract: v('hs-contract').value,
            dependants: Number(v('hs-dep').value) || 0,
            insured: v('hs-ins').value === '' ? null : v('hs-ins').value === '1', // null = theo mặc định của hợp đồng; chỉ ghim khi Admin chọn rõ
            taxOn: v('hs-tax').checked,
            deductOn: v('hs-ded').checked,
            advanceOn: v('hs-adv').checked
          })
    };
    if (hasDorm(type, Number(v('hs-level').value))) body.idorm = v('hs-idorm').checked;
    if (!isNew && s.rev !== undefined) body.expectedRev = s.rev; // tạo mới không gửi: chưa có hồ sơ nào để so
    return A.api('PUT', '/staff/' + encodeURIComponent(username), body).then(
      async res => {
        if (res && res.staff && res.staff.rev !== undefined) s.rev = res.staff.rev;
        // Thiếu ngày bắt đầu làm, tự sửa hồ sơ của mình...: máy chủ lưu kèm cảnh báo (chế độ 'warn'), cảnh báo hiện thay câu "đã lưu"
        okToast(res, isNew ? `Đã tạo nhân sự ${(res && res.staff && res.staff.name) || name}` : 'Đã lưu hồ sơ');
        dlg.close();
        await A.loadStaff(true);
        A.loadAi(true);
        A.render();
      },
      e => {
        if (!isStale(e)) throw e;
        showStale(dlg, e, username, getDirty); // giữ nguyên các ô đã gõ; không ném lại để hộp thoại không ghi đè câu báo
      }
    );
  }

  /* ---------- vẽ ---------- */
  // dấu cách giữa hai dòng: chữ của ô đọc liền thành "Normal 1 08:00–17:00" (trình đọc màn hình, tìm theo chữ)
  const two = (a, b, cls = '') =>
    `<div class="ns-two"><div class="a${cls ? ' ' + cls : ''}">${a}</div> <div class="b">${b}</div></div>`;
  function rowHtml(s) {
    const fs = openFindings(s.username);
    const issues = issuesOf(s);
    const typeBad = !typeKeys().includes(s.type);
    const levelBad = !typeBad && !levelOk(s.type, s.level);
    const sh = s.shiftCode ? shiftOf(s.shiftCode) : null;
    const shiftCell = !s.shiftCode
      ? two('Chưa có ca', '—', 'ns-bad')
      : sh
        ? two(esc(sh[1]), `<span class="num">${esc(sh[2])}–${esc(sh[3])}</span>`)
        : two(esc(s.shiftCode), '—');
    const levelTxt = `${levelBad ? `<span class="ns-bad">Bậc "${esc(String(s.level ?? ''))}" không hợp lệ</span>` : esc(A.levelLabel(s))}${s.jobTitle ? ' · ' + esc(s.jobTitle) : ''}`;
    const start = s.startDate
      ? `<span class="num">${esc(A.fmtDate(s.startDate))}</span>`
      : !startRequired(s)
        ? '<span class="ns-soft">Không cần</span>'
        : '<span class="ns-bad">Chưa có</span>';
    const fix = issues.length
      ? `<button type="button" class="link" data-act="hsfix" data-u="${esc(s.username)}" data-f="${issues[0][0]}">${esc(issues[0][1])}</button>`
      : fs.length
        ? `<button type="button" class="link" data-act="hswhy" data-u="${esc(s.username)}" aria-label="Xem lý do AI cảnh báo về ${esc(s.name)}">Xem lý do</button>`
        : '';
    const act =
      (s.locked ? A.pill('draft', 'Đã khoá') : '') +
      (issues.length || fs.length ? A.pill('rejected', 'Cần sửa') + fix : '');
    const box = s.locked
      ? `<input type="checkbox" class="ns-check" disabled aria-label="${esc(s.name)}: tài khoản đã khoá, không gán ca hàng loạt" title="Tài khoản đã khoá, không gán ca hàng loạt">`
      : `<input type="checkbox" class="ns-check" id="hs-${esc(s.username)}" data-act="hssel" data-u="${esc(s.username)}" ${H.sel.has(s.username) ? 'checked' : ''} aria-label="Chọn ${esc(s.name)}">`;
    return `<tr class="click${H.sel.has(s.username) ? ' sel' : ''}" data-act="hsopen" data-u="${esc(s.username)}">
<td class="ns-cb">${box}</td>
<td class="who"><div class="ns-who">${A.avatar(s.name)}<div class="ns-who-t"><div class="t">${esc(s.name)}</div> <div class="s">${esc(s.username)}${s.resignedOn ? ` · <span class="ns-rsg">Nghỉ từ <span class="num">${esc(A.fmtDate(s.resignedOn))}</span></span>` : ''}</div></div></div></td>
<td data-label="Loại · bậc">${two(typeBad ? `Loại "${esc(s.type)}" không hợp lệ` : esc(A.typeLong(s)), levelTxt, typeBad ? 'ns-bad' : '')}</td>
<td data-label="Ca cố định">${shiftCell}</td>
<td data-label="Bắt đầu làm">${start}</td>
<td data-label="Hợp đồng · bảo hiểm">${two(esc(contractOf(s)) + (contractStatusOf(s) ? ' · ' + esc(contractStatusOf(s)) : ''), `${s.insured ? 'Đóng bảo hiểm' : 'Không đóng bảo hiểm'}${s.dependants ? ` · ${nf(s.dependants)} người phụ thuộc` : ''}`)}</td>
<td class="act ns-act">${act ? `<span class="ns-act-in">${act}</span>` : ''}</td></tr>`;
  }
  function render() {
    const type = S.f.hstype || '',
      qtext = A.fold(S.q[PAGE] || '');
    const people = A.people();
    const flags = { shift: !!S.f.hsnoshift, locked: !!S.f.hslocked, start: !!S.f.hsnostart };
    const anyFlag = flags.shift || flags.locked || flags.start;
    const list = people
      .filter(
        s =>
          (!type || s.type === type) &&
          (!flags.shift || !s.shiftCode) &&
          (!flags.locked || s.locked) &&
          (!flags.start || startMissing(s)) &&
          (!qtext || A.fold(`${s.name} ${s.username} ${s.jobTitle}`).includes(qtext))
      )
      .sort(
        (a, b) => A.typeCodes().indexOf(a.type) - A.typeCodes().indexOf(b.type) || a.name.localeCompare(b.name, 'vi')
      );
    const pg = A.pager(PAGE, list.length, PAGE_SIZE);
    const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    const p = S.page[PAGE] || 1;
    const shown = pg.slice(list);
    H.pageSel = shown.filter(s => !s.locked).map(s => s.username);
    const allOn = H.pageSel.length > 0 && H.pageSel.every(u => H.sel.has(u));
    const nSel = [...H.sel].filter(u => people.some(x => x.username === u)).length;
    const count = t => people.filter(s => s.type === t).length;
    const loading = A.staff.state === 'loading' && !A.staff.list.length;
    const nLocked = people.filter(s => s.locked).length;
    const nNoShift = people.filter(s => !s.shiftCode).length;
    const nNoStart = people.filter(startMissing).length;
    const issues = [
      nNoShift ? `<b>${nf(nNoShift)} người</b> chưa có ca` : '',
      nNoStart ? `<b>${nf(nNoStart)} người</b> thiếu ngày bắt đầu làm` : ''
    ]
      .filter(Boolean)
      .join(', ');
    const sub = `${nf(people.length)} nhân sự · ${nf(people.length - nLocked)} đang làm việc${issues ? ' · ' + issues : ''}`;
    // chân thẻ: khoảng đang xem, bộ lọc chỗ cần sửa, người đã khoá trong danh sách lọc
    const desc = [flags.shift && 'chưa có ca', flags.start && 'thiếu ngày bắt đầu', flags.locked && 'đã khoá']
      .filter(Boolean)
      .join(', ');
    const range =
      list.length > PAGE_SIZE
        ? `${nf(pg.start + 1)}–${nf(pg.end)} trên ${nf(list.length)} nhân sự`
        : `${nf(list.length)} nhân sự`;
    const lockedHere = anyFlag && !flags.locked ? list.filter(s => s.locked) : [];
    const tail = lockedHere.length
      ? lockedHere.length === 1
        ? `${esc(lockedHere[0].name)} đã khoá tài khoản`
        : `${nf(lockedHere.length)} người đã khoá tài khoản`
      : 'xếp theo loại rồi theo tên';
    const foot = `<div class="card-f ns-f"><span>${range}${desc ? ' ' + desc : ''} · ${tail}</span><div class="ns-pager"><span class="num">Trang ${nf(p)}/${nf(pages)}</span>
<button type="button" class="btn sm icon" data-act="page" data-k="${PAGE}" data-p="${p - 1}" ${p <= 1 ? 'disabled' : ''} aria-label="Trang trước">${ic('chevl', 16)}</button>
<button type="button" class="btn sm icon" data-act="page" data-k="${PAGE}" data-p="${p + 1}" ${p >= pages ? 'disabled' : ''} aria-label="Trang sau">${ic('chevr', 16)}</button></div></div>`;
    const chips =
      A.chip(!type && !anyFlag, 'hsall', '', 'Tất cả', people.length) +
      A.typeCodes()
        .map(t =>
          A.chip(type === t, 'f', `data-k="hstype" data-v="${esc(t)}" data-pg="hoso"`, A.TYPE_LONG[t] || t, count(t))
        )
        .join('') +
      '<span class="ns-vr" aria-hidden="true"></span>' +
      A.chip(flags.shift, 'ftog', 'data-k="hsnoshift" data-pg="hoso"', 'Chưa có ca', nNoShift) +
      A.chip(flags.start, 'ftog', 'data-k="hsnostart" data-pg="hoso"', 'Thiếu ngày bắt đầu', nNoStart) +
      A.chip(flags.locked, 'ftog', 'data-k="hslocked" data-pg="hoso"', 'Đã khoá', nLocked);
    const rows = shown.map(rowHtml).join('');
    return `${A.header(
      'Nhân sự',
      sub,
      `<button class="btn" type="button" data-act="hsbulk">${ic('clock', 16)}Gán ca cho ${nSel ? nf(nSel) + ' người' : 'nhiều người'}</button>` +
        `<button class="btn pri" type="button" data-act="hsnew">${ic('plus', 16)}Thêm nhân sự</button>`,
      'ns-hdr'
    )}
<section class="card flush ns-card"><div class="ns-tools">${chips}<div class="ns-search">${A.searchBox(PAGE, 'Tìm nhân sự', 200)}</div></div>
${A.staff.state === 'fail' ? A.errorBox(A.staff.error) : ''}
<div class="tblwrap"><table class="rtable ns-t"><colgroup><col class="c-cb"><col class="c-who"><col class="c-type"><col class="c-shift"><col class="c-start"><col class="c-con"><col></colgroup>
<thead><tr><th class="ns-cb"><input type="checkbox" class="ns-check" data-act="hsselall" ${allOn ? 'checked' : ''} ${H.pageSel.length ? '' : 'disabled'} aria-label="Chọn mọi người chưa khoá ở trang này"></th><th>Nhân sự</th><th>Loại · bậc</th><th>Ca cố định</th><th>Bắt đầu làm</th><th>Hợp đồng · bảo hiểm</th><th><span class="sr">Tình trạng</span></th></tr></thead>
<tbody>${loading ? A.skelRows(7) : rows || `<tr><td colspan="7">${A.empty('Không tìm thấy nhân sự', 'Kiểm tra lại tên hoặc bỏ bớt bộ lọc.')}</td></tr>`}</tbody></table></div>
${flags.shift && list.length ? A.note('Chọn nhiều người rồi bấm <b>Gán ca cho nhiều người</b> để gán cùng một ca.') : ''}
${foot}</section>`;
  }

  A.register('ho-so', { load, render });
})(window.Admin);
