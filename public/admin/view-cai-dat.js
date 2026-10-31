/* Màn Cài đặt: khung chung (tiêu đề, ô tìm, menu con bên trái) và hai trang Đánh giá KPI, Cảnh báo AI.
   Check-in luôn bật và KPI luôn tính theo 5 thành phần. Công tắc duy nhất là bật, tắt từng quy tắc AI
   (ai.rule.<mã>.enabled, trang Cảnh báo AI và Tất cả cài đặt), lưu qua "Xem trước và lưu" như mọi cài đặt. Lỗi 400 của máy chủ hiện nguyên văn.
   Mọi con số hiện ra đọc từ registry tham số (view-tham-so.js) hoặc từ máy chủ; mọi chuỗi từ API qua A.esc(). */
(function (A) {
  'use strict';
  const { esc, nf, ic, S } = A;

  /* Menu con: Lương, Vận hành, Kiểm soát, Tra cứu. Khoá mục là địa chỉ #cai-dat/<khoá>. */
  const GROUPS = [
    [
      'Lương',
      [
        ['so-do', 'grid', 'Cách tính lương'],
        ['quyen-loi', 'gift', 'Chế độ theo loại'],
        ['chuc-vu', 'users', 'Chức vụ & bậc']
      ]
    ],
    [
      'Vận hành',
      [
        ['cham-cong', 'cal', 'Lịch, ca & chấm công'],
        ['kpi', 'target', 'Đánh giá KPI']
      ]
    ],
    [
      'Kiểm soát',
      [
        ['nguong-ai', 'spark', 'Cảnh báo AI'],
        ['phan-quyen', 'shield', 'Phân quyền'],
        ['nhat-ky', 'history', 'Nhật ký thay đổi']
      ]
    ]
  ];
  /* Từ khoá để ô tìm kiếm tìm ra các mục của menu (ngoài danh mục tham số của máy chủ) */
  const SEC_KEYS = {
    kpi: 'kpi 5 thành phần tháng bắt đầu điểm kpi quy chế lương 3p tự đánh giá trọng số',
    'so-do': 'sơ đồ công thức lương thực nhận',
    'quyen-loi': 'quyền lợi chế độ phụ cấp chức vụ bậc',
    'chuc-vu':
      'chức vụ bậc lương cơ bản lương kpi tối đa ngày công chuẩn phụ cấp flex night đêm đi lại chuyên cần danh mục',
    'cham-cong': 'kỳ lương chấm công lịch ca ngày lễ check-in',
    'nguong-ai': 'cảnh báo ai ngưỡng quy tắc luật bật tắt'
  };
  const NAV = GROUPS.flatMap(g => g[1]);
  /* Các mục dựng từ danh mục tham số của máy chủ: chờ A.Params tải xong mới vẽ (các mục khác tải nền, chỉ để có số trên menu) */
  const PARAM_SECS = ['so-do', 'quyen-loi', 'nguong-ai', 'kpi'];
  /* Giao diện: màu nền và mật độ bảng, nhớ trên trình duyệt này, không ảnh hưởng dữ liệu */
  const theme = () => ({
    nen: A.store.get('nen') === 'kem' ? 'kem' : 'xam',
    density: A.store.get('density') === 'gon' ? 'gon' : 'thoai-mai'
  });
  const applyTheme = () => {
    const t = theme();
    document.documentElement.dataset.nen = t.nen;
    document.documentElement.dataset.density = t.density;
  };
  applyTheme();
  A.actions.nen = el => {
    A.store.set('nen', el.dataset.v);
    applyTheme();
    A.render();
  };
  A.actions.density = el => {
    A.store.set('density', el.dataset.v);
    applyTheme();
    A.render();
  };
  /* Địa chỉ cũ chuyển về trang tương ứng: công thức → Cách tính lương; Ngày lễ → Lịch năm của Lịch, ca & chấm công;
     Loại yêu cầu → Phân quyền; Tất cả cài đặt → Cách tính lương */
  const MOVED = {
    'tai-khoan': 'so-do',
    'giao-dien': 'so-do',
    'cong-thuc': 'so-do',
    'ngay-le': 'cham-cong',
    'loai-yc': 'phan-quyen',
    'ky-luong': 'so-do'
  };
  const sec = () => MOVED[S.sub['cai-dat']] || S.sub['cai-dat'] || 'so-do';

  /* ---------- tải ---------- */
  async function load() {
    A.loadAi();
    try {
      await A.refreshMe();
    } catch {
      /* giữ giá trị cũ */
    }
    if (sec() === 'quyen-loi') A.loadStaff().then(() => A.render()); // số người của từng chức vụ trên tab
    if (PARAM_SECS.includes(sec())) await A.Params.load();
    else A.Params.load().then(() => A.render()); // kho tham số cho ô tìm cài đặt và ngăn kéo Cách tính lương
    if (sec() === 'nhat-ky') await A.NhatKy.load();
    if (sec() === 'phan-quyen') await A.PhanQuyen.load();
  }
  A.inputs.cdnav = el => A.actions.cdsec({ dataset: { v: el.value } });
  A.actions.cdsec = el => {
    S.sub['cai-dat'] = el.dataset.v;
    history.replaceState(null, '', '#cai-dat/' + el.dataset.v);
    A.render();
    window.scrollTo(0, 0);
    if (el.dataset.v === 'nguong-ai' || el.dataset.v === 'kpi') A.loadAi();
    if (el.dataset.v === 'quyen-loi') A.loadStaff().then(() => A.render());
    A.Params.load().then(() => A.render());
    if (el.dataset.v === 'nhat-ky') A.NhatKy.load().then(() => A.render());
    if (el.dataset.v === 'phan-quyen') A.PhanQuyen.load().then(() => A.render());
    A.refreshMe().then(() => A.render());
  };
  /* Máy chủ vừa trả lời có cho lưu tham số hay chưa: vẽ lại để nút "Xem trước và lưu" đúng trạng thái */
  A.Params.onSaveApi(() => {
    const typing = document.activeElement && document.activeElement.closest('#view input,#view select,#view textarea');
    if (S.view === 'cai-dat' && !typing) A.render();
  });

  /* ---------- hộp xác nhận của vùng GPS (trang dự phòng) ---------- */
  function switchDialog({ title, sub, body, label, cls, request, done }) {
    A.confirmDialog({
      title,
      sub,
      body: `${body}`,
      label,
      cls: cls || 'pri',
      onConfirm: async () => {
        await request();
        await A.refreshMe();
        A.toast(done);
        A.refreshShell();
        A.render();
      }
    });
  }
  const cur = () => A.meInfo || {};
  A.actions.cdgeo = el => {
    const off = el.dataset.off === '1';
    const val = id => document.getElementById(id).value;
    const body = off
      ? null
      : {
          lat: Number(val('cd-lat')),
          lng: Number(val('cd-lng')),
          radiusM: Number(val('cd-rad')),
          maxAccuracyM: Number(val('cd-acc'))
        };
    if (!off && [body.lat, body.lng, body.radiusM, body.maxAccuracyM].some(n => !Number.isFinite(n)))
      return A.toast('Nhập đủ vĩ độ, kinh độ, bán kính và độ chính xác tối đa.', 'err');
    switchDialog({
      title: off ? 'Tắt kiểm vị trí GPS' : 'Lưu vùng Check-in',
      sub: off ? 'Check-in không cần định vị' : 'Đánh dấu Check-in ngoài vùng công ty',
      body: A.note(
        off
          ? 'Nhân sự Check-in được ở mọi nơi. Vị trí không bao giờ được lưu, chỉ so với vùng này.'
          : // Check-in ngoài vùng vẫn nhận, lượt đó mang cờ ngoài vùng
            'Nhân sự ngoài bán kính này vẫn Check-in được, lượt đó được đánh dấu ngoài vùng. Máy chủ chỉ kiểm vị trí, không lưu toạ độ.',
        'alert'
      ),
      label: off ? 'Tắt kiểm GPS' : 'Lưu vùng GPS',
      cls: off ? 'danger' : 'pri',
      request: () => A.api('PUT', '/settings/geofence', body),
      done: off ? 'Đã tắt kiểm GPS' : 'Đã lưu vùng GPS'
    });
  };
  /* Đổi mật khẩu: hộp thoại mở từ menu tài khoản */
  A.actions.pwopen = () => {
    S.acct = false;
    A.renderChrome();
    A.openDialog({
      title: 'Đổi mật khẩu',
      sub: 'Tài khoản ' + ((S.me && S.me.name) || ''),
      body: `<form class="col" style="gap:12px" id="pw-form" onsubmit="return false"><div class="formrow"><label class="lbl" for="pw-cur">Mật khẩu hiện tại</label><input id="pw-cur" class="input" type="password" autocomplete="current-password"></div><div class="formrow"><label class="lbl" for="pw-new">Mật khẩu mới</label><input id="pw-new" class="input" type="password" autocomplete="new-password"></div><div class="formrow"><label class="lbl" for="pw-new2">Nhập lại mật khẩu mới</label><input id="pw-new2" class="input" type="password" autocomplete="new-password"></div></form>`,
      foot: [
        { label: 'Huỷ' },
        {
          label: 'Đổi mật khẩu',
          cls: 'pri',
          onClick: async api => {
            const v = id => document.getElementById(id).value;
            const cur_ = v('pw-cur'),
              n1 = v('pw-new'),
              n2 = v('pw-new2');
            if (!cur_ || !n1) return api.error('Nhập mật khẩu hiện tại và mật khẩu mới.');
            if (n1.length < 6) return api.error('Mật khẩu mới cần ít nhất 6 ký tự.');
            if (n1 !== n2) return api.error('Hai lần nhập mật khẩu mới chưa giống nhau.');
            await A.api('PUT', '/password', { current: cur_, next: n1 });
            api.close();
            A.toast('Đã đổi mật khẩu.');
          }
        }
      ]
    });
  };

  /* ---------- các mục ---------- */
  const SHIFT_KIND = { normal: 'Normal', flex: 'Flex', night: 'Night' }; // nhãn loại ca (kind của danh mục ca)
  const statusRow = (label, value, hint) =>
    `<div class="col" style="gap:4px"><span class="lbl">${esc(label)}</span><span class="cfgval">${value}</span>${hint ? `<span class="cap">${hint}</span>` : ''}</div>`;
  function secChamCong() {
    const me = cur();
    const g = me.geofence;
    const rule = window.ActualHours && window.ActualHours.RULE;
    const shifts = A.SHIFTS.map(
      ([, n, a, b, , k]) =>
        `<tr><td style="font-weight:600">${esc(n)}</td><td class="num">${esc(a)} – ${esc(b)}</td><td>${esc(SHIFT_KIND[k] || k || '—')}</td></tr>`
    ).join('');
    return `<section class="card" style="gap:16px"><div class="col"><h2>Check-in/out</h2><span class="cap">Nguồn chính của công thực tế.</span></div></section>
<section class="card" style="gap:16px"><div class="col"><h2>Vùng GPS Check-in</h2><span class="cap">Đánh dấu Check-in ngoài bán kính công ty (vẫn nhận). Máy chủ chỉ so vị trí, không lưu toạ độ nhân sự.</span></div>
<div>${me.geofenceRequired ? A.pill('done', 'Đang bật') : A.pill('draft', 'Đang tắt')}</div>
<div class="formgrid"><div class="formrow"><label class="lbl" for="cd-lat">Vĩ độ (−90 đến 90)</label><input id="cd-lat" class="input" inputmode="decimal" value="${g ? esc(g.lat) : ''}"></div>
<div class="formrow"><label class="lbl" for="cd-lng">Kinh độ (−180 đến 180)</label><input id="cd-lng" class="input" inputmode="decimal" value="${g ? esc(g.lng) : ''}"></div>
<div class="formrow"><label class="lbl" for="cd-rad">Bán kính (20 đến 5.000 m)</label><input id="cd-rad" class="input" inputmode="numeric" value="${g ? esc(g.radiusM) : ''}"></div>
<div class="formrow"><label class="lbl" for="cd-acc">Độ chính xác tối đa (10 đến 1.000 m)</label><input id="cd-acc" class="input" inputmode="numeric" value="${g ? esc(g.maxAccuracyM) : '100'}"></div></div>
<div class="row" style="gap:8px"><button class="btn pri" type="button" data-act="cdgeo" data-off="0">Lưu vùng GPS</button><button class="btn danger" type="button" data-act="cdgeo" data-off="1" ${me.geofenceRequired ? '' : 'disabled'}>Tắt kiểm GPS</button></div></section>
<section class="card" style="gap:12px"><div class="col"><h2>6 ca cố định và quy tắc muộn, sớm</h2><span class="cap">Chỉ xem. Ca do Admin gán ở Hồ sơ; loại ca suy ra từ giờ vào và giờ ra.</span></div>
<div class="tblwrap"><table><thead><tr><th>Ca</th><th>Giờ</th><th>Loại</th></tr></thead><tbody>${shifts}</tbody></table></div>
${rule ? A.note(`Đi muộn hoặc về sớm đến ${rule.GRACE_MIN} phút không bị trừ; quá ${rule.GRACE_MIN} phút trừ theo bậc ${rule.STEP_MIN} phút, muộn và sớm xét riêng.`) : ''}</section>`;
  }
  /* ---------- Đánh giá KPI: cách tính tổng điểm (trọng số từ registry kpi.weight) và các chỗ khác dùng điểm KPI ---------- */
  const kpiVal = key => (A.Khung ? A.Khung.valueOf(key) : undefined);
  /* Dự phòng khi kho tham số chưa có mục kpi.weight (nhóm KPI chưa tải xong hoặc tải lỗi): trọng số của tháng do máy chủ gửi ở
     GET /api/kpi/scores → weights. Chỉ đọc một lần mỗi tháng; tên thành phần là nhãn hiển thị, không có con số nào viết sẵn. */
  const KPI_PART = {
    wework: 'Base Wework',
    user: 'Người dùng',
    peer: 'Đồng nghiệp',
    manager: 'Quản lý trực tiếp',
    self: 'Tự đánh giá'
  };
  const KW = { month: null, state: 'idle', weights: null };
  function kpiWeightsApi() {
    if (KW.month !== S.month) {
      const month = S.month;
      Object.assign(KW, { month, state: 'loading', weights: null });
      A.api('GET', '/kpi/scores' + A.qs({ month }))
        .then(res => {
          if (KW.month !== month) return;
          const w = res && res.weights && typeof res.weights === 'object' ? res.weights : null;
          Object.assign(KW, { state: w ? 'ok' : 'fail', weights: w });
          if (w && S.view === 'cai-dat' && sec() === 'kpi') A.render();
        })
        .catch(() => {
          if (KW.month === month) KW.state = 'fail';
        });
    }
    if (KW.state !== 'ok') return null;
    const ids = Object.keys(KPI_PART).filter(k => typeof KW.weights[k] === 'number');
    return ids.length ? { rows: ids.map(id => ({ id, name: KPI_PART[id], w: KW.weights[id] })), total: null } : null;
  }
  function kpiWeights() {
    const e = A.PxKit && A.PxKit.PS.byId.get('kpi.weight');
    if (!e || !Array.isArray(e.value)) return kpiWeightsApi();
    const rk = ((e.ui && e.ui.table && e.ui.table.rowKeys) || [])[0] || {};
    const nameOf = v => ((rk.values || []).find(x => x.value === v) || {}).label || v;
    const sum = ((e.rules && e.rules.crossChecks) || []).find(c => c.kind === 'sum');
    return {
      rows: e.value.map(r => ({ id: r.component, name: nameOf(r.component), w: r.weight })),
      total: sum && typeof sum.equals === 'number' ? sum.equals : null
    };
  }
  function secKpi() {
    const me = cur();
    const kw = kpiWeights();
    const gate = kpiVal('kpi.weworkMin');
    const first = kw && kw.rows[0] ? kw.rows[0].id : null;
    const last = kw && kw.rows.length ? kw.rows[kw.rows.length - 1].id : null;
    const sub = id =>
      id === first && typeof gate === 'number'
        ? `Phải từ ${esc(nf(gate))} điểm`
        : id === last && kw.rows.length > 1
          ? 'Admin nhập'
          : '';
    const cells = kw
      ? kw.rows
          .map(
            (r, i) =>
              `${i ? '<span class="op" aria-hidden="true">+</span>' : ''}<div class="cdx-w"><span class="n">${esc(r.name)}</span><b>${esc(nf(r.w))}%</b><span class="s">${sub(r.id)}</span></div>`
          )
          .join('') +
        (kw.total !== null
          ? `<span class="op" aria-hidden="true">=</span><div class="cdx-w"><span class="n">Tổng điểm</span><b>${esc(nf(kw.total))}%</b><span class="s"></span></div>`
          : '')
      : KW.state === 'fail'
        ? '<span class="cap">Chưa đọc được trọng số KPI của tháng này. Tải lại trang để thử lại.</span>'
        : '<div class="skel" style="width:60%"></div>';
    const five = '<div class="card-f cdx-five" role="status"><span>Tính theo 5 thành phần</span></div>';
    const kh = A.Khung;
    const unset = kh
      ? kh
          .allEntries()
          .filter(e => e.status === 'unset' && e.class !== 'removed' && kh.pageOfEntry(e) === '4')
          .map(e => e.label)
      : [];
    const edited = kh && kh.allEntries().some(e => kh.pageOfEntry(e) === '4' && e.status === 'custom');
    const th = (A.ai && A.ai.data && A.ai.data.thresholds) || {};
    const tv = k => (th[k] && typeof th[k].value === 'number' ? nf(th[k].value) : null);
    const aiTxt =
      tv('kpiFullMonths') !== null
        ? `KPI tự chấm 100% liên tiếp từ ${tv('kpiFullMonths')} tháng${tv('kpiFullPct') !== null ? ` · mức tự chấm tối đa ${tv('kpiFullPct')}%` : ''}`
        : 'Các ngưỡng AI dùng khi kiểm tra điểm KPI';
    const row = (k, v, link) => `<div class="cdx-rel"><b>${esc(k)}</b><span>${esc(v)}</span>${link}</div>`;
    const go = (act, attrs, label) =>
      `<button type="button" class="link" data-act="${act}" ${attrs}>${esc(label)}</button>`;
    const rel = [
      row(
        'Điều kiện nhận lương KPI',
        typeof gate === 'number'
          ? `Base Wework từ ${nf(gate)} điểm và tổng điểm đạt mốc`
          : 'Tổng điểm đạt mốc của chức vụ',
        go('nav', 'data-t="kpi"', 'Đánh giá KPI')
      ),
      row(
        'Lương KPI',
        `Lương KPI tối đa theo bậc × tổng điểm đạt được · ${edited ? 'đã điều chỉnh' : 'mặc định'}`,
        go('sdgo', 'data-id="4"', 'Cách tính lương')
      ),
      unset.length ? row('Chính sách chưa chốt', unset.join(' · '), go('sdgo', 'data-id="4"', 'Cách tính lương')) : '',
      row('Cảnh báo AI', aiTxt, go('cdsec', 'data-v="nguong-ai"', 'Cảnh báo AI'))
    ].join('');
    return `<section class="card flush"><div class="card-h"><h2>Cách tính tổng điểm KPI</h2><span class="end">${go('nav', 'data-t="kpi"', 'Mở Đánh giá KPI')}</span></div><div class="cdx-wbox">${cells}</div>${five}</section>
<section class="card flush"><div class="card-h"><h2>Liên quan</h2><span class="cap">Những chỗ khác dùng điểm KPI</span></div>${rel}</section>`;
  }
  /* ---------- Cảnh báo AI: ngưỡng AI dùng khi kiểm tra dữ liệu, chia nhóm ----------
     Ô sửa được khi khoá ai.threshold.<tên> của registry cho sửa (dùng chung kho "đang sửa" và nút "Xem trước và lưu"); ngưỡng khác chỉ hiện số.
     Nhóm và nhãn ngắn dưới đây chỉ là cách trình bày; ngưỡng mới chưa có trong bảng nhóm hiện ở nhóm "Khác". */
  const AI_GROUPS = [
    [
      'Yêu cầu và báo công',
      ['isatPerMonth', 'approvedLeavePerMonth', 'reportDeadlineDay', 'rejectedLookbackDays', 'repeatedEditsRev'],
      0
    ],
    ['Chấm công', ['presenceGapMin'], 0],
    ['Chuyên cần', ['attendMaxAbsentDays', 'overLimitHours'], 0],
    ['KPI', ['kpiFullMonths', 'kpiFullPct'], 0],
    ['OT', ['otMedianFactor', 'otMedianMinHours', 'otMedianMinPeers'], 1],
    [
      'Tiền',
      [
        'impactVnd',
        'slipDiffVnd',
        'slipDiffRatio',
        'paramChangePeoplePct',
        'formulaChangeTotalVnd',
        'scopeLeakMinPeople',
        'overrideEntryRoundVnd'
      ],
      1
    ]
  ];
  const AI_LABEL = {
    rejectedLookbackDays: 'Xét yêu cầu bị từ chối trong',
    presenceGapMin: 'Thiếu Check-in/out từ',
    otMedianFactor: 'OT cao hơn trung vị nhóm',
    otMedianMinHours: 'và OT ít nhất',
    otMedianMinPeers: 'Chỉ so khi nhóm có ít nhất',
    attendMaxAbsentDays: 'Mất chuyên cần khi nghỉ từ',
    overLimitHours: 'Mất chuyên cần khi giờ vượt ngưỡng từ',
    impactVnd: 'Tác động tiền lớn từ',
    slipDiffVnd: 'Số sửa trên phiếu lệch từ',
    slipDiffRatio: 'và lệch từ',
    kpiFullMonths: 'KPI tự chấm 100% liên tiếp từ',
    kpiFullPct: 'Mức tự chấm tối đa',
    paramChangePeoplePct: 'Thay đổi làm đổi thực nhận từ',
    formulaChangeTotalVnd: 'Thay đổi làm tổng thực nhận đổi từ',
    scopeLeakMinPeople: 'Thay đổi chạm người ngoài chức vụ từ',
    overrideEntryRoundVnd: 'Số sửa tròn theo bội của'
  };
  /* Đơn vị hiện trong ô khi registry chưa có khoá của ngưỡng (hoặc cần chữ rõ hơn đơn vị chung) */
  const AI_UNIT = {
    isatPerMonth: 'lần',
    approvedLeavePerMonth: 'lần',
    rejectedLookbackDays: 'ngày',
    presenceGapMin: 'phút',
    otMedianFactor: 'lần',
    otMedianMinHours: 'giờ',
    otMedianMinPeers: 'người có OT',
    attendMaxAbsentDays: 'ngày',
    overLimitHours: 'giờ',
    impactVnd: '₫',
    slipDiffVnd: '₫',
    formulaChangeTotalVnd: '₫',
    overrideEntryRoundVnd: '₫',
    kpiFullMonths: 'tháng',
    kpiFullPct: '%',
    paramChangePeoplePct: '% số người',
    scopeLeakMinPeople: 'người'
  };
  const aiLabel = k => AI_LABEL[k] || (A.THRESHOLD_LABEL ? A.THRESHOLD_LABEL[k] || k : k);
  function secNguongAi() {
    const ai = A.ai;
    const head = '<div class="card-h"><h2>Ngưỡng cảnh báo</h2></div>';
    if (ai.state === 'loading' || ai.state === 'idle')
      return `<section class="card flush">${head}<div class="cdx-pad"><div class="skel" style="width:60%"></div><div class="skel" style="width:80%"></div></div></section>`;
    if (ai.state === 'fail')
      return `<section class="card flush">${head}<div class="cdx-pad">${A.errorBox(ai.error, false)}</div></section>`;
    const kt = A.PxKit,
      kh = A.Khung,
      ui = A.CaiDatUi;
    const ready = !!(kt && kh && ui && kt.PS.index.length && kt.PS.index.every(g => kt.PS.cache.has(g.id)));
    if (ready) kt.resetCells();
    const th = ai.data.thresholds || {};
    const keys = Object.keys(th);
    const row = k => {
      const v = th[k];
      const label = aiLabel(k);
      const d = ready ? kh.descOf(`ai.threshold.${k}`) : null;
      const cell =
        d && d.editable ? kh.cellOf(d, label, A.THRESHOLD_LABEL ? A.THRESHOLD_LABEL[k] || label : label) : null;
      const unit = AI_UNIT[k] || (d ? kt.unitTxt(d.unit) : '');
      const shown =
        typeof v.value === 'number'
          ? nf(v.value < 1 && /Ratio|Pct$/.test(k) && unit.startsWith('%') ? Math.round(v.value * 1e4) / 1e2 : v.value)
          : /^\d{4}-\d{2}-\d{2}$/.test(String(v.value))
            ? A.fmtDate(v.value)
            : v.value;
      const ctl = cell
        ? `${ui.numInput(cell, { width: 'w', suffix: unit })}`
        : `<span class="z-pin ro"><input class="z-ni w" readonly tabindex="-1" value="${esc(shown)}" aria-label="${esc(label)}">${unit && typeof v.value === 'number' ? `<span class="pf">${esc(unit)}</span>` : ''}</span>`;
      return `<div class="cdx-arow"><span class="k">${esc(label)}</span><span class="c">${ctl}</span></div>${cell ? ui.msgs(cell) : ''}`;
    };
    const known = new Set(AI_GROUPS.flatMap(g => g[1]));
    const groups = [...AI_GROUPS, ['Khác', keys.filter(k => !known.has(k)), 1]];
    const col = side =>
      groups
        .filter(g => g[2] === side)
        .map(([name, ks]) => {
          const shown = ks.filter(k => th[k]);
          if (!shown.length) return '';
          return `<div class="cdx-ag"><div class="gh"><b>${esc(name)}</b><span>${nf(shown.length)}</span></div>${shown.map(row).join('')}</div>`;
        })
        .join('');
    /* mọi ngưỡng luôn hiện đầy đủ, không có chip lọc */
    const bar = ready ? saveFoot('pxsave') : '';
    return `<section class="card flush">${head}<div class="cdx-acols"><div>${col(0)}</div><div>${col(1)}</div></div>${bar}</section>`;
  }
  /* ---------- Quy tắc cảnh báo: bật, tắt từng quy tắc AI (khoá ai.rule.<mã>.enabled) ----------
     Bấm Bật hoặc Tắt đổi ngay ô nháp trong kho dùng chung với Tất cả cài đặt (A.PxKit.PS.vals); lưu qua "Xem trước và lưu"
     (PUT /api/settings/params, chọn tháng áp dụng) như mọi cài đặt. Phương án nào máy chủ báo chưa dùng được (available: false) thì nút đó tắt.
     Khoá không ứng với quy tắc nào giao diện biết tên thì không hiện. */
  const RULE_ENTRY = 'ai.rule.<id>.enabled';
  function ruleRows() {
    const kt = A.PxKit;
    const e = kt && kt.PS.byId.get(RULE_ENTRY);
    if (!e || !Array.isArray(e.instances)) return null;
    const editable = kt.K.isEditable(e);
    return e.instances
      .map(inst => {
        const id = A.ruleIdOfKey(inst.key);
        if (!id || !A.RULE_LABEL[id]) return null;
        const name = A.ruleLabel(id);
        const rules = inst.rules || e.rules || {};
        const cell = editable
          ? kt.fieldCell({
              key: inst.key,
              value: inst.value,
              rules,
              comp: 'choice',
              eid: e.id,
              gid: e.group,
              label: name,
              title: `Quy tắc AI: ${name}`
            })
          : null;
        return { key: inst.key, name, value: inst.value, rules, cell };
      })
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  }
  A.actions.cdrule = el => {
    const kt = A.PxKit;
    const cell = kt && kt.PS.meta.get(el.dataset.key);
    if (!cell) return;
    if (el.dataset.v === cell.orig) delete kt.PS.vals[cell.key];
    else kt.PS.vals[cell.key] = el.dataset.v;
    A.render();
  };
  function secRules() {
    const kt = A.PxKit;
    if (!kt || kt.PS.state !== 'ok') return '';
    const rows = ruleRows();
    if (!rows || !rows.length) return '';
    const e = kt.PS.byId.get(RULE_ENTRY);
    const rawOf = r => (r.cell ? kt.cellRaw(r.cell) : String(r.value));
    const okOpt = (r, v) =>
      ((r.rules && r.rules.options) || []).some(o => String(o.value) === v && o.available !== false);
    const row = r => {
      const on = rawOf(r) !== 'false';
      const dirty = !!r.cell && kt.isDirty(r.cell);
      const btn = (v, label, pressed) =>
        `<button type="button" class="${pressed ? 'on' : ''}" aria-pressed="${pressed}" data-act="cdrule" data-key="${esc(r.key)}" data-v="${v}" ${okOpt(r, v) ? '' : 'disabled'}>${label}</button>`;
      const ctl = r.cell
        ? `<span class="seg cdx-rsw${dirty ? ' ed' : ''}" role="group" aria-label="${esc(r.name)}">${btn('true', 'Bật', on)}${btn('false', 'Tắt', !on)}</span>`
        : A.pill(on ? 'done' : 'draft', on ? 'Bật' : 'Tắt');
      return `<div class="cdx-rrow${on ? '' : ' off'}"><span class="k">${esc(r.name)}</span>${dirty ? '<span class="cdx-rch">Chưa lưu</span>' : ''}${ctl}</div>`;
    };
    const off = rows.filter(r => rawOf(r) === 'false').length;
    const half = Math.ceil(rows.length / 2);
    const help = e && e.ui && e.ui.help ? `<p class="cdx-rcap">${esc(e.ui.help)}</p>` : '';
    const anyCell = rows.some(r => r.cell);
    return `<section class="card flush" id="cd-ai-rules"><div class="card-h"><h2>Quy tắc cảnh báo</h2><span class="cap">${nf(rows.length - off)} đang bật · ${off ? `<b>${nf(off)} đang tắt</b>` : '0 đang tắt'} · ${esc(A.monthLabel(S.month))}</span></div>${help}<div class="cdx-acols"><div>${rows.slice(0, half).map(row).join('')}</div><div>${rows.slice(half).map(row).join('')}</div></div>${anyCell ? saveFoot('pxsave') : ''}</section>`;
  }
  /* Chân thẻ "Chưa có thay đổi · Huỷ · Xem trước và lưu" dùng chung cho các trang sửa tại chỗ */
  function saveFoot(act) {
    const kt = A.PxKit;
    const n = kt.dirtyCount();
    const bad = n ? kt.blockerCount() : 0;
    const can = A.Params.saveApi === 'yes' && n > 0 && !bad;
    const txt = bad
      ? `<b class="errt">Còn ${nf(bad)} chỗ chưa hợp lệ</b>`
      : n
        ? `<b>${nf(n)} thay đổi chưa lưu</b>`
        : A.Params.saveApi === 'no'
          ? 'Máy chủ chưa cho lưu tham số'
          : 'Chưa có thay đổi';
    return `<div class="card-f cdx-save" role="status"><span>${txt}</span><span class="sp"></span><button type="button" class="btn sm" data-act="pxresetall" ${n ? '' : 'disabled'}>Huỷ</button><button type="button" class="btn sm pri" data-act="${act}" ${can ? '' : 'disabled aria-disabled="true"'}>Xem trước và lưu</button></div>`;
  }
  A.CaiDatSaveFoot = saveFoot;
  function secSoon(label) {
    return `<section class="card">${A.empty(label + ' sẽ có ở đợt sau', 'Mục này chưa có trên máy chủ.')}</section>`;
  }

  /* Ô tìm cài đặt ở đầu trang: tìm trong danh mục tham số của máy chủ; chỉ giữ mục của khoản ①–⑧ — mở ngăn kéo tương ứng ở Cách tính lương */
  function searchBox() {
    const q = (S.q.cdsearch || '').trim();
    const found =
      q && A.PxKit
        ? A.PxKit.searchEntries(q)
            .filter(e => /^[1-8]$/.test(A.Khung ? A.Khung.pageOfEntry(e) : ''))
            .slice(0, 8)
        : [];
    const want = A.fold(q);
    const secs = q ? NAV.filter(([k, , l]) => A.fold(`${l} ${SEC_KEYS[k] || ''}`).includes(want)) : [];
    const secLi = secs
      .map(
        ([k, , l]) =>
          `<li><button type="button" data-act="cdfindsec" data-v="${esc(k)}"><b>${esc(l)}</b><span class="cap">Mục trong menu Cài đặt</span></button></li>`
      )
      .join('');
    const list = q
      ? `<ul role="listbox">${secLi}${found.length ? found.map(e => `<li><button type="button" data-act="cdfind" data-id="${esc(e.id)}" data-g="${esc(e.group)}"><b>${esc(e.label)}</b><span class="cap">${esc(A.Khung ? A.Khung.pageTitleOf(e) : '')}</span></button></li>`).join('') : secs.length ? '' : '<li class="cap" style="padding:8px 10px">Không có cài đặt nào khớp.</li>'}</ul>`
      : '';
    return `<div class="z-srch cdx-srch"><div class="field ssearch"><label class="sr" for="cd-search">Tìm cài đặt</label>${ic('search', 16)}<input id="cd-search" class="input" type="search" autocomplete="off" placeholder="Tìm cài đặt: tạm ứng, ca đêm, hệ số OT…" value="${esc(S.q.cdsearch || '')}" data-input="cdsearch"></div>${list}</div>`;
  }
  A.inputs.cdsearch = el => {
    S.q.cdsearch = el.value;
    A.render();
    const b = document.getElementById('cd-search');
    if (b) {
      b.focus();
      b.setSelectionRange(b.value.length, b.value.length);
    }
    if (el.value.trim() && A.Params) A.Params.load().then(() => A.render());
  };
  A.actions.cdfindsec = el => {
    S.q.cdsearch = '';
    A.actions.cdsec(el);
  };
  A.actions.cdfind = el => {
    const e = A.PxKit.PS.byId.get(el.dataset.id) || {};
    S.q.cdsearch = '';
    const page = A.Khung ? A.Khung.pageOfEntry(e) : '';
    if (/^[1-8]$/.test(page)) {
      S.sub['cai-dat'] = 'so-do';
      S.f.sdrawer = page;
      history.replaceState(null, '', '#cai-dat/so-do');
      A.render();
    }
  };

  /* Dòng phụ dưới tiêu đề "Cài đặt": mỗi mục một câu; trang của người khác tự trả câu của mình (sub()) nếu có */
  const peopleOf = code =>
    A.staff.state === 'ok' ? A.people().filter(s => s.type === code && !s.locked && !s.lockedAt).length : null;
  function subLine(s) {
    const kt = A.PxKit;
    const fr = kt && kt.PS.fr;
    const own = obj => (obj && typeof obj.sub === 'function' ? obj.sub() : '');
    switch (s) {
      case 'so-do':
        return A.SoDo && A.SoDo.sub ? A.SoDo.sub() : 'Áp dụng cho mọi phiếu lương';
      case 'quyen-loi': {
        const code = A.QuyenLoi && A.QuyenLoi.tab ? A.QuyenLoi.tab() : null;
        const p = code ? A.positions.get(code) : null;
        if (!p) return 'Tick hoặc gõ mức ngay trong ô, bấm Xem trước và lưu để áp dụng';
        const n = peopleOf(code);
        const lv = (p.levels || []).length || p.maxLevel || 0;
        return `${esc(p.label)} · ${n === null ? '' : `${nf(n)} người, `}${nf(lv)} bậc · tick hoặc gõ mức ngay trong ô, bấm Xem trước và lưu để áp dụng`;
      }
      case 'chuc-vu':
        return A.CatalogPositions && A.CatalogPositions.sub
          ? A.CatalogPositions.sub()
          : 'Danh mục chức vụ và bậc lương';
      case 'kpi':
        return 'Lương luôn tính kèm KPI · Admin nhập 5 điểm cho mỗi người mỗi tháng, nhân viên không tự chấm';
      case 'nguong-ai': {
        const th = A.ai && A.ai.state === 'ok' ? A.ai.data.thresholds || {} : null;
        if (!th) return 'Ngưỡng AI dùng khi kiểm tra dữ liệu';
        const ks = Object.keys(th);
        const p = ks.filter(k => th[k].proposal).length;
        return `<b>${nf(ks.length)} ngưỡng</b> AI dùng khi kiểm tra dữ liệu · <b>${nf(ks.length - p)}</b> đã chốt, <b>${nf(p)}</b> còn là đề xuất`;
      }
      case 'cham-cong':
        return own(A.CaiDat) || 'Lịch năm, ca làm và Check-in/out';
      case 'phan-quyen':
        return own(A.PhanQuyen) || 'Vai trò quyết định ai xem, ai sửa và ai được xử lý loại yêu cầu nào';
      case 'nhat-ky':
        return own(A.NhatKy) || 'Ghi lại ai làm gì, lúc nào, đổi từ gì sang gì';
      default:
        return '';
    }
  }

  function render() {
    const s = sec();
    const narrow = window.innerWidth <= 900;
    const navHtml = narrow
      ? `<div class="formrow snavsel"><label class="lbl" for="s-nav">Mục cài đặt</label><select id="s-nav" class="input" data-input="cdnav">${GROUPS.map(([gl, items]) => `<optgroup label="${esc(gl)}">${items.map(([k, , l]) => `<option value="${k}" ${s === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</optgroup>`).join('')}</select></div>`
      : `<nav class="card cdx-sub" aria-label="Mục cài đặt">${GROUPS.map(
          ([gl, items]) =>
            `<div class="g">${esc(gl)}</div>${items.map(([k, i, l]) => `<button type="button" class="it${s === k ? ' on' : ''}" data-act="cdsec" data-v="${k}" ${s === k ? 'aria-current="page"' : ''}>${ic(i, 16)}<span class="grow">${esc(l)}</span></button>`).join('')}`
        ).join('')}</nav>`;
    const label = (NAV.find(n => n[0] === s) || [])[2] || '';
    const kyLuong = () =>
      A.CaiDat && typeof A.CaiDat.renderKyLuong === 'function' ? '<div id="cd-kyluong"></div>' : secChamCong();
    const body = {
      'so-do': () => (A.SoDo ? A.SoDo.render() : secSoon(label)),
      'quyen-loi': () => (A.QuyenLoi ? A.QuyenLoi.render() : secSoon(label)),
      'chuc-vu': () => (A.CatalogPositions ? A.CatalogPositions.render() : secSoon(label)),
      'cham-cong': kyLuong,
      kpi: secKpi,
      'nhat-ky': () => A.NhatKy.render(),
      'phan-quyen': () => A.PhanQuyen.render(),
      'nguong-ai': () => secRules() + secNguongAi()
    }[s];
    const open = s === 'so-do' && A.SoDo && A.SoDo.open();
    return `<div class="cd4 cdx">${A.header('Cài đặt', subLine(s), searchBox())}
<div class="z-grid cdx-set">${navHtml}<div class="z-main cdx-main">${draftBar(s, open)}${body ? body() : secSoon(label)}</div></div>${open ? A.SoDo.drawer() : ''}</div>`;
  }
  /* Thanh "N thay đổi chưa lưu" trên mọi trang Cài đặt còn bản nháp của kho tham số mà trang đó không tự có thanh lưu
     (Chế độ theo loại, Cảnh báo AI và ngăn kéo Cách tính lương đã có thanh riêng). Ô đang sửa dở không bao giờ mất âm thầm. */
  function draftBar(s, drawerOpen) {
    const kt = A.PxKit;
    if (!kt || ['quyen-loi', 'nguong-ai'].includes(s) || (s === 'so-do' && drawerOpen)) return '';
    const n = kt.dirtyCount();
    if (!n) return '';
    const bad = kt.blockerCount();
    const can = A.Params.saveApi === 'yes' && !bad;
    return `<div class="note gold cdx-draft" id="px-draftbar" role="status">${ic('info', 16)}<span>${bad ? `<b class="errt">Còn ${nf(bad)} chỗ chưa hợp lệ</b>` : `<b>${nf(n)} thay đổi chưa lưu</b>`} ở các trang Cài đặt khác.</span><span class="sp"></span><button type="button" class="btn sm" data-act="cddiscard">Bỏ</button><button type="button" class="btn sm pri" data-act="pxsave" ${can ? '' : 'disabled aria-disabled="true"'}>Xem trước và lưu</button></div>`;
  }
  /* Tên mục trong menu (theo khoá, kể cả khoá cũ đã chuyển): trang khác dùng khi ghi "Sửa ở …" */
  A.CaiDatSecLabel = k => (NAV.find(n => n[0] === (MOVED[k] || k)) || [])[2] || '';
  A.actions.cddiscard = () => A.drafts.guard(() => A.actions.pxresetall(), { scope: 'params' });
  /* Cập nhật trực tiếp: có người đổi tham số. Ô đang sửa dở không bị ghi đè (xem A.Params.remoteChanged). */
  A.live.on('params.changed', payload => {
    A.Params.remoteChanged(payload);
  });
  A.register('cai-dat', {
    load,
    render,
    onMonth: () => {
      A.Params.reset();
      /* Lịch, ca & chấm công: nạp lại ngay dữ liệu của tháng mới (giờ ca theo tháng); bản nháp giờ ca đã được hỏi trước khi đổi tháng */
      if (A.CaiDat && typeof A.CaiDat.resetKyLuong === 'function') A.CaiDat.resetKyLuong();
    },
    after: () => {
      const el = document.getElementById('cd-kyluong');
      if (el && A.CaiDat && typeof A.CaiDat.renderKyLuong === 'function') A.CaiDat.renderKyLuong(el);
    }
  });
})(window.Admin);
