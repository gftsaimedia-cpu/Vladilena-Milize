/* Cài đặt › Chức vụ & bậc: danh mục chức vụ và bậc lương trong DB, có phiên bản theo tháng áp dụng.
   Đọc GET /api/catalog/positions?month= (số liệu đang hiệu lực của tháng ở thanh trên); sửa chức vụ PUT /api/catalog/positions/:code,
   sửa hoặc thêm bậc PUT /api/catalog/levels. Mỗi lần ghi gửi số phiên bản (rev) của dòng đang hiện để không ghi đè việc người khác vừa
   sửa: máy chủ trả 409 (*_STALE) thì báo nguyên văn và nạp lại. Mọi con số (lương, %, ngày công) là số máy chủ trả, chỉ định dạng,
   không tính ở đây. Mọi chuỗi từ API hay người dùng qua A.esc() trước khi vào innerHTML. */
(function (A) {
  'use strict';
  const { esc, nf, ic, S } = A;

  const CP = { month: null, state: 'idle', err: '', data: null, token: 0 };
  /* Nhãn cờ quyền lợi (máy chủ chỉ gửi mã); mã chưa có nhãn thì hiện nguyên mã. makeupDay không còn dùng: chỉ còn nhãn cho Nhật ký */
  const BENEFIT_LABEL = {
    ot: 'OT',
    makeup: 'Làm bù',
    kpi: 'Lương KPI',
    paidHoliday: 'Lễ hưởng lương',
    paidLeave: 'Nghỉ phép năm',
    isat: 'iSAT',
    absenceDeclarable: 'Khai nghỉ',
    approvedLeave: 'Nghỉ được duyệt',
    leaveAccount: 'Quỹ phép',
    makeupHours: 'Làm bù theo giờ',
    makeupDay: 'Làm bù cả ngày (không còn dùng)',
    idorm: 'iDorm',
    breakPay: 'Off Paid (ca đêm)'
  };
  const PCT_FIELDS = [
    ['flexPct', 'Phụ cấp Flex'],
    ['nightPct', 'Phụ cấp Night'],
    ['travelPct', 'Phụ cấp đi lại'],
    ['attendancePct', 'Phụ cấp chuyên cần']
  ];
  const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

  /* Quyền như các trang Cài đặt khác: chưa biết danh sách quyền thì không ẩn nút, máy chủ vẫn kiểm */
  const caps = () => (A.meInfo && Array.isArray(A.meInfo.caps) ? A.meInfo.caps : null);
  const can = c => !caps() || caps().includes(c);
  const onScreen = () => S.view === 'cai-dat' && S.sub['cai-dat'] === 'chuc-vu';
  const pct = v => (v === null || v === undefined ? '—' : `${nf(v)} %`);
  const money = v => (v === null || v === undefined ? '—' : `${nf(v)} ₫`);

  /* ---------- tải ---------- */
  function load() {
    const month = S.month;
    const token = ++CP.token;
    if (CP.month !== month || CP.state !== 'ok') CP.state = 'loading'; // tháng khác: không hiện số của tháng cũ
    CP.month = month;
    CP.err = '';
    return A.api('GET', '/catalog/positions' + A.qs({ month })).then(
      res => {
        if (token !== CP.token) return;
        CP.data = {
          benefits: Array.isArray(res.benefits) ? res.benefits : [],
          positions: res.positions || [],
          baseMonth: res.baseMonth || null // tháng của dòng nền chưa ai sửa: không hiện "Từ …" cho dòng đó
        };
        CP.state = 'ok';
      },
      e => {
        if (token !== CP.token) return;
        CP.state = 'fail';
        CP.err = A.errText(e);
      }
    );
  }
  const reload = () =>
    load().then(() => {
      if (onScreen()) A.render();
    });
  /* Danh mục đổi thì nhãn chức vụ, số bậc và tên bậc ở các màn khác cũng đổi: bỏ nhớ của chúng */
  function refreshShared() {
    A.positions.refresh();
    A.levelNames.refresh();
  }
  /* Có người đổi tham số hay danh mục (kể cả chính mình): nạp lại nhưng giữ thẻ cũ trên màn tới khi số mới về (không nháy khung chờ).
     Không đứng ở màn này thì bỏ nhớ để lần mở sau nạp lại */
  A.live.on('params.changed', () => {
    if (onScreen()) reload();
    else CP.state = 'idle';
  });
  const findPos = code => ((CP.data && CP.data.positions) || []).find(p => p.code === code) || null;
  const fetchPos = (month, code) =>
    A.api('GET', '/catalog/positions' + A.qs({ month })).then(
      res => (res.positions || []).find(p => p.code === code) || null
    );
  /* Ảnh chụp chức vụ (kèm bậc) theo tháng, giữ suốt một hộp thoại: máy chủ so rev với dòng của ĐÚNG tháng áp dụng, nên rev phải là số
     lúc Admin bắt đầu sửa (mở hộp, hoặc lần đầu chọn tháng đó ở ô "Áp dụng từ"). Hỏi lại lúc bấm Lưu thì rev luôn mới và lần sửa của
     người khác bị ghi đè lặng lẽ. Chỉ sau 409 mới chụp lại (Admin đã được báo và xem số mới) */
  function snapshots(code, month, row) {
    const map = new Map([[month, Promise.resolve(row)]]);
    let onRow = () => {}; // điền lại hộp khi có số của tháng áp dụng (watch đặt)
    const take = m => {
      const pr = fetchPos(m, code);
      map.set(m, pr);
      pr.catch(() => map.get(m) === pr && map.delete(m)); // lỗi mạng: lần sau hỏi lại
      return pr;
    };
    const at = m => map.get(m) || take(m);
    return {
      at,
      retake: m => {
        map.clear();
        const pr = take(m);
        pr.then(
          r => onRow(m, r),
          () => {}
        ); // sau 409: ô Admin chưa gõ hiện số mới để kiểm tra
        return pr;
      },
      // chụp ngay khi Admin đổi tháng áp dụng, không đợi bấm Lưu, và điền số của tháng đó vào các ô chưa gõ
      watch: (api, fill) => {
        const el = api.root.querySelector('#cp-month');
        // số về muộn của tháng đã bị đổi tiếp, hay hộp đã đóng, thì bỏ
        onRow = (m, r) => r && el.value === m && api.root.isConnected && fill(r);
        el.addEventListener('change', () => {
          const m = el.value;
          if (MONTH_RE.test(m))
            at(m).then(
              r => onRow(m, r),
              () => {}
            );
        });
      }
    };
  }
  /* Ô trong hộp đã được Admin gõ thì giữ nguyên; ô chưa gõ mang số đang hiệu lực ở tháng áp dụng. Nhờ vậy so với dòng của tháng áp dụng
     là đủ: ô chưa gõ không bao giờ khác dòng đó nên không bị gửi, còn ô đã gõ khác dòng đó là thay đổi thật (kể cả đặt lại đúng số
     của tháng đang xem). fields: [[id ô, khoá trong dòng]] */
  function fieldFiller(api, fields) {
    const touched = new Set();
    api.root.addEventListener('input', ev => touched.add(ev.target.id));
    return src => {
      for (const [id, key] of fields) {
        const el = api.root.querySelector('#' + id);
        if (el && !touched.has(id)) el.value = src[key] === null || src[key] === undefined ? '' : String(src[key]);
      }
    };
  }

  /* ---------- hộp thoại ---------- */
  const fld = (id, label, control, small) =>
    `<div class="formrow"><label class="lbl" for="${id}">${esc(label)}${small ? ` <small>${esc(small)}</small>` : ''}</label>${control}</div>`;
  const inp = (id, value, attrs = '') =>
    `<input id="${id}" class="input" value="${esc(value === null || value === undefined ? '' : value)}" autocomplete="off" ${attrs}>`;
  const monthField = () =>
    fld(
      'cp-month',
      'Áp dụng từ tháng',
      `<input id="cp-month" class="input" type="month" value="${esc(S.month)}" style="max-width:220px">`
    );
  const reasonField = () => A.reasonField('cp-reason', 'Lý do (không bắt buộc)');
  const val = (api, id) => api.root.querySelector('#' + id).value.trim();
  /* Đọc số từ ô: trống trả null; dấu phẩy thập phân kiểu Việt được nhận. Không hợp lệ thì báo, giới hạn do máy chủ kiểm */
  function readNum(api, id, label) {
    const raw = val(api, id).replace(',', '.');
    if (raw === '') return null;
    const n = Number(raw);
    if (!Number.isFinite(n)) throw new Error(`${label} phải là số.`);
    return n;
  }
  /* Tiền gõ có thể kèm dấu chấm, phẩy, cách ngăn nghìn ("5.000.000") và chữ ₫; trống trả null. Dấu ngăn phải đứng đúng chỗ nghìn,
     để gõ nhầm "5.5" hay "1234,5" bị báo thay vì lặng lẽ thành 55 hay 12.345 đồng */
  const MONEY_RE = /^\d+$|^\d{1,3}([.,\s]\d{3})+$/;
  function readMoney(api, id, label) {
    const raw = val(api, id).replace(/\s*₫$/, '').trim();
    if (raw === '') return null;
    if (!MONEY_RE.test(raw)) throw new Error(`${label} phải là số đồng nguyên.`);
    return Number(raw.replace(/[.,\s]/g, ''));
  }
  function readCommon(api) {
    const effectiveMonth = val(api, 'cp-month');
    if (!MONTH_RE.test(effectiveMonth)) throw new Error('Chọn tháng áp dụng.');
    return { effectiveMonth, reason: val(api, 'cp-reason') || undefined };
  }
  /* Gửi một lần sửa. 409 (dòng vừa bị người khác sửa): giữ hộp thoại và các ô đã gõ, nạp lại số mới rồi báo nguyên văn; bấm Lưu lần nữa
     sẽ so với số mới. Nhãn chức vụ, tên bậc ở màn khác do core.js làm mới khi có sự kiện params.changed (máy chủ phát sau mỗi lần ghi) */
  async function submit(api, path, body, done, snaps, stale) {
    try {
      await A.api('PUT', path, body);
    } catch (e) {
      // chỉ *_STALE là "người khác vừa sửa"; 409 khác báo nguyên văn, nạp lại không giúp gì
      if (e && e.status === 409 && /_STALE$/.test(String((e.data && e.data.code) || ''))) {
        await Promise.all([reload(), snaps.retake(body.effectiveMonth).catch(() => {})]);
        // câu máy chủ có thể không có dấu chấm cuối: thêm vào để hai câu không dính nhau
        const said = A.errText(e).replace(/[.!?]*\s*$/, '.');
        throw new Error(`${said} Số mới đã được nạp lại, kiểm tra rồi bấm lưu lần nữa.`);
      }
      // thêm bậc mà người khác vừa thêm đúng bậc đó: máy chủ đòi rev (bậc đã có). Coi như sửa trùng, nạp lại số mới
      if (stale && e && e.data && e.data.code === 'CATALOG_REV_REQUIRED') {
        await Promise.all([reload(), snaps.retake(body.effectiveMonth).catch(() => {})]);
        throw new Error(`${stale} Số mới đã được nạp lại, kiểm tra rồi bấm lưu lần nữa.`);
      }
      throw e; // câu của máy chủ hiện nguyên văn trong hộp thoại
    }
    api.close();
    A.toast(`${done}, áp dụng từ ${A.monthLabel(body.effectiveMonth)}`);
    if (!A.live.active) refreshShared(); // mất kết nối sự kiện thì tự làm mới
    await reload();
  }

  function editPosition(code) {
    const p = findPos(code);
    if (!p) return;
    const snaps = snapshots(code, CP.month, p);
    const fields = [['cp-name', 'name'], ['cp-workdays', 'workdays'], ...PCT_FIELDS.map(([k]) => ['cp-' + k, k])];
    let fill = null;
    const body = `${fld('cp-name', 'Tên chức vụ', inp('cp-name', p.name))}
<div class="cdv-g2">${fld('cp-workdays', 'Ngày công chuẩn', inp('cp-workdays', p.workdays, 'inputmode="numeric"'))}${PCT_FIELDS.map(([k, l]) => fld('cp-' + k, l, inp('cp-' + k, p[k], 'inputmode="decimal"'), '(%)')).join('')}</div>
${monthField()}${reasonField()}`;
    A.openDialog({
      title: 'Sửa chức vụ',
      sub: p.name,
      width: 560,
      cls: 'cdv-dlg',
      body,
      onMount: api => {
        fill = fieldFiller(api, fields);
        snaps.watch(api, fill);
      },
      foot: [
        { label: 'Huỷ' },
        {
          label: 'Lưu',
          cls: 'pri',
          icon: 'check',
          onClick: async api => {
            const common = readCommon(api);
            // so với số đang hiệu lực ở tháng áp dụng (rev cũng của tháng đó). Bấm Lưu trước khi số của tháng vừa chọn kịp về thì điền
            // ngay bây giờ: ô chưa gõ còn mang số của tháng đang xem, gửi đi sẽ ghi đè lặng lẽ số riêng của tháng áp dụng
            const cur = await snaps.at(common.effectiveMonth);
            if (!cur) throw new Error(`Chức vụ này chưa có ở ${A.monthLabel(common.effectiveMonth)}.`);
            fill(cur);
            const name = val(api, 'cp-name');
            if (!name) throw new Error('Nhập tên chức vụ.');
            const wd = readNum(api, 'cp-workdays', 'Ngày công chuẩn');
            if (wd === null) throw new Error('Nhập ngày công chuẩn.');
            const typed = { name, workdays: wd };
            for (const [k, l] of PCT_FIELDS) {
              typed[k] = readNum(api, 'cp-' + k, l);
              if (typed[k] === null) throw new Error(`Nhập ${l.toLowerCase()}.`);
            }
            const changes = {};
            for (const [k, v] of Object.entries(typed)) if (v !== cur[k]) changes[k] = v;
            if (!Object.keys(changes).length) throw new Error('Chưa có thay đổi.');
            return submit(
              api,
              '/catalog/positions/' + encodeURIComponent(code),
              { changes, ...common, expectedRev: cur.rev },
              `Đã lưu chức vụ ${name}`,
              snaps
            );
          }
        }
      ]
    });
  }

  /* Sửa một bậc đã có (level là số bậc) hoặc thêm bậc kế tiếp (level không có): bậc mới không gửi expectedRev */
  function editLevel(code, levelNo) {
    const p = findPos(code);
    if (!p) return;
    const l = levelNo ? (p.levels || []).find(x => x.level === levelNo) : null;
    if (levelNo && !l) return;
    const adding = !l;
    const next = adding ? 0 : l.level; // bậc mới: số bậc tính theo tháng áp dụng lúc lưu, tiêu đề không ghi số
    const snaps = snapshots(code, CP.month, p);
    const fields = [
      ['cp-lname', 'name'],
      ['cp-base', 'baseSalary'],
      ['cp-kpi', 'kpiMax'],
      ['cp-night', 'nightPct']
    ];
    // điền số của tháng áp dụng: bậc đang sửa lấy dòng bậc đó; bậc mới chỉ đổi gợi ý phụ cấp đêm theo chức vụ của tháng đó
    let fillLevel = null;
    const makeFill = (api, filler) => cur => {
      api.root.querySelector('#cp-night').placeholder = `Theo chức vụ (${pct(cur.nightPct)})`;
      const row = adding ? null : (cur.levels || []).find(x => x.level === next);
      if (row) filler(row);
    };
    const body = `${fld('cp-lname', 'Tên bậc', inp('cp-lname', l ? l.name : ''))}
<div class="cdv-g2">${fld('cp-base', 'Lương cơ bản', inp('cp-base', l ? l.baseSalary : '', 'inputmode="numeric"'), '(₫)')}${fld('cp-kpi', 'Lương KPI tối đa', inp('cp-kpi', l ? l.kpiMax : '', 'inputmode="numeric" placeholder="Không có"'), '(₫)')}${fld('cp-night', 'Phụ cấp đêm', inp('cp-night', l ? l.nightPct : '', `inputmode="decimal" placeholder="Theo chức vụ (${esc(pct(p.nightPct))})"`), '(%)')}</div>
${monthField()}${reasonField()}`;
    A.openDialog({
      title: adding ? 'Thêm bậc' : `Sửa bậc ${next}`,
      sub: p.name,
      width: 560,
      cls: 'cdv-dlg',
      body,
      onMount: api => {
        fillLevel = makeFill(api, fieldFiller(api, fields));
        snaps.watch(api, fillLevel);
      },
      foot: [
        { label: 'Huỷ' },
        {
          label: adding ? 'Thêm bậc' : 'Lưu',
          cls: 'pri',
          icon: adding ? 'plus' : 'check',
          onClick: async api => {
            const common = readCommon(api);
            // số bậc và rev lấy theo tháng áp dụng: máy chủ đếm bậc và so rev ở đúng tháng đó
            const cur = await snaps.at(common.effectiveMonth);
            if (!cur) throw new Error(`Chức vụ này chưa có ở ${A.monthLabel(common.effectiveMonth)}.`);
            const levels = cur.levels || [];
            const level = adding ? levels.length + 1 : next;
            const row = adding ? null : levels.find(x => x.level === next);
            if (!adding && !row) throw new Error(`Bậc ${next} chưa có ở ${A.monthLabel(common.effectiveMonth)}.`);
            fillLevel(cur); // như chức vụ: ô chưa gõ mang số của tháng áp dụng trước khi đọc
            const name = val(api, 'cp-lname');
            if (!name) throw new Error('Nhập tên bậc.');
            const baseSalary = readMoney(api, 'cp-base', 'Lương cơ bản');
            if (baseSalary === null) throw new Error('Nhập lương cơ bản.');
            const kpiMax = readMoney(api, 'cp-kpi', 'Lương KPI tối đa'); // trống = bậc không có lương KPI
            const nightPct = readNum(api, 'cp-night', 'Phụ cấp đêm'); // trống = theo chức vụ
            const all = { name, baseSalary, kpiMax, nightPct };
            const changes = {};
            // sửa bậc: gửi đúng các ô khác dòng bậc của tháng áp dụng; thêm bậc: gửi hết
            for (const [k, v] of Object.entries(all)) if (adding || v !== row[k]) changes[k] = v;
            if (!Object.keys(changes).length) throw new Error('Chưa có thay đổi.');
            return submit(
              api,
              '/catalog/levels',
              { type: code, level, changes, ...common, ...(adding ? {} : { expectedRev: row.rev }) },
              adding ? `Đã thêm bậc ${level} của ${p.name}` : `Đã lưu bậc ${level} của ${p.name}`,
              snaps,
              adding ? `Bậc ${level} vừa được người khác thêm.` : ''
            );
          }
        }
      ]
    });
  }
  A.actions.cpreload = () => reload();
  A.actions.cppos = el => editPosition(el.dataset.code);
  A.actions.cplevel = el => editLevel(el.dataset.code, Number(el.dataset.l));
  A.actions.cpaddlevel = el => editLevel(el.dataset.code, 0);

  /* ---------- vẽ ---------- */
  const fact = (label, value) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`;
  function levelTable(p, edit) {
    const rows = (p.levels || [])
      .map(
        l => `<tr><td class="k num">${esc(nf(l.level))}</td><td>${esc(l.name)}</td><td class="num">${esc(money(l.baseSalary))}</td><td class="num">${l.kpiMax === null || l.kpiMax === undefined ? '<span class="cap">Không có</span>' : esc(money(l.kpiMax))}</td>
<td class="num">${l.nightPct === null || l.nightPct === undefined ? '<span class="cap">Theo chức vụ</span>' : esc(pct(l.nightPct))}</td>${edit ? `<td class="act"><button type="button" class="btn sm" data-act="cplevel" data-code="${esc(p.code)}" data-l="${esc(l.level)}" aria-label="Sửa bậc ${esc(l.level)} của ${esc(p.name)}">Sửa</button></td>` : ''}</tr>`
      )
      .join('');
    const cols = edit ? 6 : 5;
    return `<div class="tblwrap"><table class="z-mx cdx-qt cdx-cpt"><thead><tr><th>Bậc</th><th>Tên</th><th>Lương cơ bản</th><th>Lương KPI tối đa</th><th>Phụ cấp đêm</th>${edit ? '<th><span class="sr">Thao tác</span></th>' : ''}</tr></thead>
<tbody>${rows || `<tr><td colspan="${cols}" class="cap">Chưa có bậc.</td></tr>`}</tbody></table></div>`;
  }
  function card(p, benefitCodes, edit) {
    const on = benefitCodes
      .filter(b => b !== 'makeupDay' && p.benefits && p.benefits[b] === true)
      .map(b => BENEFIT_LABEL[b] || b);
    const facts = [
      fact('Ngày công chuẩn', nf(p.workdays)),
      ...PCT_FIELDS.map(([k, l]) => fact(l, pct(p[k]))),
      fact('Ngày làm việc', A.dowsText(p.regularDows))
    ].join('');
    const acts = edit
      ? `<span class="end"><button type="button" class="btn sm" data-act="cppos" data-code="${esc(p.code)}" aria-label="Sửa chức vụ ${esc(p.name)}">${ic('edit', 14)}Sửa</button></span>`
      : '';
    const since =
      p.effectiveMonth && p.effectiveMonth !== CP.data.baseMonth
        ? `<span class="cap">Từ ${esc(A.monthLabel(p.effectiveMonth))}</span>`
        : '';
    return `<section class="card flush cdx-cp"><div class="card-h"><h2>${esc(p.name)}</h2>${since}${acts}</div>
<dl class="cdx-cpf">${facts}</dl>
<div class="cdx-cpb"><span class="lbl">Quyền lợi đang bật</span><span>${on.length ? on.map(x => `<span class="pill p-done">${esc(x)}</span>`).join('') : '<span class="cap">Không có</span>'}</span></div>
<div class="cdx-qsec"><h3>Bậc</h3><span class="cap">${esc(nf((p.levels || []).length))} bậc</span>${edit ? `<span class="end"><button type="button" class="btn sm" data-act="cpaddlevel" data-code="${esc(p.code)}">${ic('plus', 14)}Thêm bậc</button></span>` : ''}</div>
${levelTable(p, edit)}</section>`;
  }
  function render() {
    if (CP.month !== S.month || CP.state === 'idle') reload(); // load() đặt tháng ngay, nên không gọi lặp; lượt cũ về muộn bị bỏ
    if (CP.state === 'fail')
      return `<section class="card">${A.errorBox(CP.err, false)}<div><button type="button" class="btn sm" data-act="cpreload">Thử lại</button></div></section>`;
    if (CP.state !== 'ok' || CP.month !== S.month)
      return '<section class="card" aria-busy="true"><div class="skel" style="width:40%"></div><div class="skel" style="width:90%"></div><div class="skel" style="width:70%"></div></section>';
    const list = CP.data.positions;
    if (!list.length) return `<section class="card">${A.empty('Chưa có chức vụ trong danh mục')}</section>`;
    const edit = can('config.payroll');
    return `<div class="col cdx-cps">${list.map(p => card(p, CP.data.benefits, edit)).join('')}</div>`;
  }
  /* Dòng phụ dưới tiêu đề "Cài đặt" */
  function sub() {
    if (CP.state !== 'ok' || CP.month !== S.month) return 'Danh mục chức vụ và bậc lương';
    const list = CP.data.positions;
    const levels = list.reduce((n, p) => n + (p.levels || []).length, 0); // đếm số dòng để hiện, không phải số nghiệp vụ
    return `${esc(nf(list.length))} chức vụ, ${esc(nf(levels))} bậc · ${esc(A.monthLabel(CP.month))}`;
  }

  /* Nhãn một cờ quyền lợi (màn Nhật ký dùng chung) */
  const benefitLabel = code => BENEFIT_LABEL[code] || code;

  A.CatalogPositions = { render, sub, reload, benefitLabel };
})(window.Admin);
