/* Cài đặt › Tất cả cài đặt: trang của từng mục registry, bảng chế độ theo chức vụ (dưới view-tham-so.js).
   Gồm bốn phần:
   1. Tám thành phần (thực nhận = ① + ② + ③ + ④ − ⑤ − ⑥ − ⑦ − ⑧); ⑦ ⑧ luôn là hai khoản trừ cuối, do luật tính. Bảng tám khoản vẽ ở
      cai-dat-so-do.js; ở đây là tên, trang và nhóm chip của Tất cả cài đặt.
   2. Bảng chế độ theo chức vụ (nhóm "Chức vụ và bậc lương"): hàng là khoản, cột là chức vụ (GET /api/positions, GET /api/entitlements). Bấm một ô mở chi tiết
      của chức vụ đó; ô sửa dở đổi màu và đi qua đúng nút "Xem trước và lưu" của view-tham-so.js (PUT /api/settings/params).
      "+ Thêm chức vụ" gửi POST /api/positions (sao chép quyền lợi từ chức vụ có sẵn).
   3. Các trang thành phần: mục registry gom theo trường `component` ('1'…'8' | 'process' | 'position' | 'template'). Registry chưa gửi
      trường này thì suy từ nhóm và khoá (bảng FALLBACK_COMPONENT), để màn vẫn chạy với máy chủ cũ.
   4. Phần phụ cho hộp xem trước: ripple, companyCost, decreased, belowMinWage, scope; trường nào máy chủ chưa gửi thì không hiện.
   Màn không tính lương: mọi số đến từ máy chủ hoặc từ registry. Mọi nhãn do người dùng đặt (tên chức vụ…) qua A.esc(). */
(function (A) {
  'use strict';
  const { esc, ic, S } = A;
  const kit = () => A.PxKit;

  /* ---------- hằng của giao diện (nhãn hiển thị, không phải số nghiệp vụ) ---------- */
  const FRAME = [
    { id: '1', name: 'Lương cơ bản', sign: '+' },
    { id: '2', name: 'Tiền làm thêm giờ', sign: '+' },
    { id: '3', name: 'Phụ cấp', sign: '+' },
    { id: '4', name: 'Lương KPI', sign: '+' },
    { id: '5', name: 'Khấu trừ đi muộn, về sớm', short: 'Khấu trừ đi muộn', sign: '−' },
    { id: '6', name: 'Tạm ứng', sign: '−' },
    { id: '7', name: 'Bảo hiểm', sign: '−' },
    { id: '8', name: 'Thuế TNCN', sign: '−' }
  ];
  const NAME_OF = Object.fromEntries(FRAME.map(c => [c.id, c.name]));
  const FIXED_PAGES = { position: 'Chức vụ và bậc lương', template: 'Phiếu lương', adv: 'Nâng cao' };
  const PROCESS_NAME = {
    1: 'Kỳ lương',
    6: 'Chấm công',
    7: 'Nghỉ và phép',
    9: 'Phê duyệt',
    11: 'Cảnh báo AI',
    13: 'Hồ sơ và hợp đồng'
  };
  /* Máy chủ chưa gửi `component` thì suy theo nhóm */
  const GROUP_PAGE = {
    1: 'q1',
    2: 'position',
    3: '3',
    4: '3',
    5: '2',
    6: 'q6',
    7: 'q7',
    8: '4',
    9: 'q9',
    10: '7',
    11: 'q11',
    12: 'template',
    13: 'q13',
    14: 'adv',
    15: 'adv'
  };
  const COMPONENT_VALUES = new Set(['1', '2', '3', '4', '5', '6', '7', '8', 'process', 'position', 'template']);
  const POS_KEY_RE = /^(?:type|level)\.([a-z][a-z0-9]*)\./;
  const STALE_NOTE = {
    inputs: 'Dữ liệu đầu vào (điểm KPI, số sửa trên phiếu, hồ sơ, ngày lễ) đã đổi sau lần tính',
    params: 'Cài đặt lương đã đổi sau lần tính'
  };

  const KH = { model: { month: null, src: 'registry', ent: null }, seenGroup: null, built: null };

  const pageOfGroup = gid => GROUP_PAGE[gid] || 'adv';

  /* ---------- trang thành phần ---------- */
  function fallbackComponent(e) {
    const id = String(e.id || '');
    switch (e.group) {
      case 1:
        return /^advance\./.test(id) ? '6' : 'process';
      case 2:
        if (/^level\.|^type\.<type>\.benefit|^fixed\.type\.catalog/.test(id)) return 'position';
        return /^pay\.otHourlyDivisor/.test(id) ? '2' : '1';
      case 3:
      case 4:
        return '3';
      case 5:
        return '2';
      case 6:
        return /^attendance\.(graceMin|stepMin|cutRounding|graceScope|graceMonthly|lateEarlyRule)/.test(id)
          ? '5'
          : 'process';
      case 8:
        return '4';
      case 10:
        return /^tax\.insurance|^law\.(luongCoSo|region)|^insurance\.|^fixed\.insurance|^fixed\.tax\.capMultiple/.test(
          id
        )
          ? '7'
          : '8';
      case 12:
        return 'template';
      default:
        return 'process';
    }
  }
  function componentOf(e) {
    const c = e && e.component !== undefined && e.component !== null ? String(e.component) : '';
    return COMPONENT_VALUES.has(c) ? c : fallbackComponent(e || {});
  }
  /* Trang chứa một mục: '1'…'8', 'position', 'template', 'q<nhóm>' (quy trình), 'adv' (nâng cao) */
  function pageOf(e) {
    if (e && kit().isAdvancedGroup(e.group)) return 'adv';
    const c = componentOf(e);
    return c === 'process' ? 'q' + (e ? e.group : '') : c;
  }
  const groupLabel = gid => {
    const g = kit().PS.index.find(x => x.id === gid);
    return PROCESS_NAME[gid] || (g ? g.label : `Nhóm ${gid}`);
  };
  function titleOfPage(id) {
    if (NAME_OF[id]) return NAME_OF[id];
    if (FIXED_PAGES[id]) return FIXED_PAGES[id];
    if (/^q\d+$/.test(id)) return groupLabel(Number(id.slice(1)));
    return id;
  }
  const pageTitleOf = e => {
    const id = pageOf(e);
    return /^\d$/.test(id) ? `${id}. ${titleOfPage(id)}` : titleOfPage(id);
  };
  const allEntries = () => {
    const out = [];
    // mục dạng công thức gõ tay: không liệt kê
    for (const g of kit().PS.cache.values())
      out.push(...g.entries.filter(e => !(e.ui && e.ui.component === 'formula')));
    return out;
  };
  function setPage(id) {
    S.f.pxPage = id;
    KH.seenGroup = S.f.cfgGroup; // đã theo nhóm này rồi: không bị kéo về trang mặc định của nhóm
  }
  /* Màn khác mở Cài đặt ở một nhóm (S.f.cfgGroup): đổi sang trang chứa nhóm đó, một lần */
  function syncFromGroup() {
    if (S.f.cfgGroup && S.f.cfgGroup !== KH.seenGroup) {
      KH.seenGroup = S.f.cfgGroup;
      S.f.pxPage = pageOfGroup(S.f.cfgGroup);
    }
  }
  const pageCounts = entries => {
    const m = new Map();
    for (const e of entries) {
      if (e.class === 'removed') continue;
      const id = pageOf(e);
      const c = m.get(id) || { total: 0, edit: 0 };
      c.total++;
      if (kit().K.isEditable(e)) c.edit++;
      m.set(id, c);
    }
    return m;
  };
  /* Trang đang xem: { id, title, badge, strip, entries } (entries = null khi các nhóm chưa tải xong) */
  function page() {
    const PS = kit().PS;
    if (!PS.index.length) return null;
    syncFromGroup();
    const all = allEntries();
    const loaded = PS.index.every(g => PS.cache.has(g.id));
    const counts = pageCounts(all);
    const processIds = PS.index
      .filter(g => !kit().isAdvancedGroup(g.id))
      .map(g => 'q' + g.id)
      .filter(id => counts.has(id));
    const known = new Set([...FRAME.map(c => c.id), 'position', ...processIds, 'template', 'adv']);
    const id = known.has(S.f.pxPage) ? S.f.pxPage : '1';
    S.f.pxPage = id;
    /* Chip nhóm rỗng (hết mục sửa được) ẩn đi; vẫn tới được qua tìm kiếm hoặc liên kết từ bảng */
    const chip = (pid, label, extra) => {
      const c = counts.get(pid);
      if (loaded && c && !c.edit) return '';
      return A.chip(
        pid === id,
        'khpage',
        `data-p="${esc(pid)}"`,
        label + (extra || ''),
        loaded && c ? c.edit : undefined
      );
    };
    const comps = FRAME.map(c => chip(c.id, `${c.id}. ${c.short || c.name}`)).join('');
    const rest = [
      chip('position', FIXED_PAGES.position),
      ...processIds.map(pid => chip(pid, titleOfPage(pid))),
      chip('template', FIXED_PAGES.template),
      counts.has('adv') ? chip('adv', FIXED_PAGES.adv) : ''
    ].join('');
    const strip = `<div class="kh-strip"><div class="lb">Thành phần lương</div><div class="chips kh-chips" role="group" aria-label="Thành phần lương">${comps}</div>
<div class="lb">Chức vụ, quy trình và phiếu lương</div><div class="chips kh-chips" role="group" aria-label="Chức vụ, quy trình và phiếu lương">${rest}</div></div>`;
    const title = /^\d$/.test(id) ? `${id}. ${titleOfPage(id)}` : titleOfPage(id);
    const entries = loaded
      ? all.filter(e => pageOf(e) === id).sort((a, b) => a.group - b.group || (a.order || 0) - (b.order || 0))
      : null;
    return { id, title, strip, entries };
  }

  /* ---------- bảng quyền lợi: dựng mô hình ----------
     Mô hình chung cho hai nguồn (máy chủ: GET /api/entitlements; dự phòng: dựng từ registry):
       { positions: [{ code, label, deprecated }], rows: [{ id, comp, label, legal, page, cells: { <mã chức vụ>: CM } }] }
     CM (một ô): { onCell | onPositive | onStatic, mainCell | mainText, shared, fields: [{ cell | text, label, shared, page }], link } */
  function indexKeys() {
    const kt = kit();
    const map = new Map();
    const rowTxt = (tbl, r) =>
      ((tbl && tbl.rowKeys) || [])
        .map(rk => {
          const f = rk.values && rk.values.find(x => x.value === r[rk.key]);
          return f ? f.label : '';
        })
        .filter(Boolean)
        .join(' · ');
    for (const e of kt.PS.byId.values()) {
      if (!e.ui || e.class === 'removed') continue;
      /* wired:false = bộ máy lương chưa đọc mục này, máy chủ từ chối lưu (400 PARAM_NOT_WIRED): chỉ hiện, không cho sửa */
      const editable = !kt.K.isLocked(e) && e.class !== 'fixed' && e.wired !== false;
      for (const inst of e.instances || [])
        map.set(inst.key, {
          key: inst.key,
          entry: e,
          value: inst.value,
          rules: inst.rules || e.rules || {},
          comp: e.ui.component,
          unit: e.ui.unit,
          label: A.nameCodes(inst.label || e.label),
          editable
        });
      if (e.ui.component === 'table' && Array.isArray(e.value)) {
        const cols = (e.ui.table && e.ui.table.columns) || [];
        for (const r of e.value)
          for (const c of cols) {
            const key = r.keys && r.keys[c.key];
            if (key)
              map.set(key, {
                key,
                entry: e,
                value: r[c.key],
                rules: (e.rules && e.rules.columns && e.rules.columns[c.key]) || {},
                comp: c.component,
                unit: c.unit,
                label: `${rowTxt(e.ui.table, r)}, ${c.label}`,
                editable
              });
          }
      }
    }
    return map;
  }
  const synthRules = (comp, unit) => ({
    type: comp === 'toggle' ? 'bool' : comp === 'money' ? 'vnd' : comp === 'text' ? 'text' : 'number',
    unit: unit || null,
    nullable: false,
    messages: {}
  });
  /* Ô nhập của một khoá: dùng chung kho giá trị đang sửa với các trang cài đặt */
  function cellOf(d, label, title) {
    return kit().fieldCell({
      key: d.key,
      value: d.value,
      rules: d.rules && Object.keys(d.rules).length ? d.rules : synthRules(d.comp, d.unit),
      comp: d.comp,
      unit: d.unit,
      label,
      title
    });
  }
  const sharedText = d => (d ? kit().fmtVal(d.unit, d.value) : '—');
  const NOT_WIRED_TXT = 'Chưa áp dụng';
  /* Đuôi khoá type.<mã>.<đuôi> mà registry báo wired:false (ví dụ probationPayPct: GFT không có thử việc) */
  const notWired = tail => {
    const e = kit().PS.byId.get(`type.<type>.${tail}`);
    return !!e && e.wired === false;
  };

  function registryModel() {
    const idx = indexKeys();
    const positions = A.positions.list().map(p => ({ code: p.code, label: p.label, deprecated: p.deprecated }));
    const get = (code, suffix) => idx.get(`type.${code}.${suffix}`);
    /* Mỗi hàng khai: on (cờ bật/tắt), onPositive (bật khi tỷ lệ > 0), main, fields; "G" là giá trị chung toàn công ty */
    const G = (key, label) => ({ global: key, label });
    const T = (suffix, label) => ({ suffix, label });
    const SPEC = [
      {
        id: 'luong',
        comp: '1',
        label: 'Lương cơ bản',
        main: T('workdays', 'Ngày công chuẩn'),
        fields: [
          T('workdays', 'Ngày công chuẩn'),
          T('benefit.paidHoliday', 'Lương nghỉ lễ'),
          T('benefit.paidLeave', 'Lương nghỉ phép năm'),
          T('benefit.isat', 'iSAT'),
          T('probationPayPct', 'Tỷ lệ lương thử việc')
        ]
      },
      {
        id: 'ot',
        comp: '2',
        label: 'Làm thêm giờ',
        on: T('benefit.ot'),
        main: G('ot.rate'),
        fields: [
          T('benefit.ot', 'OT'),
          T('benefit.makeup', 'Làm bù'),
          G('ot.rate', 'Hệ số OT'),
          G('ot.weekendRate', 'Hệ số OT cuối tuần'),
          G('ot.holidayRate', 'Hệ số OT ngày lễ')
        ]
      },
      {
        id: 'dilai',
        comp: '3',
        label: 'Phụ cấp đi lại',
        onPositive: T('travel'),
        main: T('travel'),
        fields: [T('travel', 'Tỷ lệ phụ cấp đi lại')]
      },
      {
        id: 'chuyencan',
        comp: '3',
        label: 'Phụ cấp chuyên cần',
        onPositive: T('attendance'),
        main: T('attendance'),
        fields: [
          T('attendance', 'Tỷ lệ phụ cấp chuyên cần'),
          T('maxAbsent', 'Số ngày nghỉ tối đa'),
          G('attendance.overLimitHours', 'Giờ vượt ngưỡng')
        ]
      },
      {
        id: 'flex',
        comp: '3',
        label: 'Phụ cấp ca Flex',
        main: G('shift.flex.bonus'),
        fields: [G('shift.flex.bonus', 'Phụ cấp ca Flex')]
      },
      {
        id: 'dem',
        comp: '3',
        label: 'Phụ cấp ca đêm',
        main: G('shift.night.bonus'),
        fields: [G('shift.night.bonus', 'Phụ cấp ca đêm')]
      },
      {
        id: 'kpi',
        comp: '4',
        label: 'Lương KPI',
        on: T('benefit.kpi'),
        main: T('kpiPass'),
        fields: [T('benefit.kpi', 'Có lương KPI'), T('kpiPass', 'Mốc KPI đạt')]
      },
      {
        id: 'tre',
        comp: '5',
        label: 'Khấu trừ đi muộn, về sớm',
        main: G('attendance.graceMin'),
        fields: [G('attendance.graceMin', 'Số phút được miễn'), G('attendance.stepMin', 'Bậc trừ')]
      },
      {
        id: 'ung',
        comp: '6',
        label: 'Tạm ứng',
        main: G('advance.rate'),
        fields: [G('advance.rate', 'Mức tạm ứng tối đa'), G('advance.untilDay', 'Tạm ứng đến ngày')]
      },
      { id: 'bh', comp: '7', label: 'Bảo hiểm', legal: true, text: 'Theo hợp đồng', page: '7' },
      { id: 'thue', comp: '8', label: 'Thuế TNCN', legal: true, text: 'Theo hợp đồng', page: '8' }
    ];
    const rows = SPEC.map(r => {
      const cells = {};
      for (const p of positions) {
        const title = suffix => `${r.label} · ${p.label}${suffix ? ': ' + suffix : ''}`;
        if (r.text) {
          cells[p.code] = { onStatic: null, mainText: r.text, fields: [], link: r.page };
          continue;
        }
        const field = (f, name) => {
          if (f.global) {
            const d = idx.get(f.global);
            return d ? { text: sharedText(d), label: f.label || name, shared: true, page: pageOf(d.entry) } : null;
          }
          const d = get(p.code, f.suffix);
          if (!d) return null;
          return {
            cell: d.editable ? cellOf(d, f.label || d.label, title(f.label)) : null,
            text: notWired(f.suffix) ? NOT_WIRED_TXT : sharedText(d),
            label: f.label || d.label,
            value: d.value
          };
        };
        const main = r.main && (r.main.global ? field(r.main, r.main.label) : field(r.main, r.main.label));
        const fields = (r.fields || []).map(f => field(f, f.label)).filter(Boolean);
        const on = r.on && field(r.on, r.on.label);
        const onPos = r.onPositive && field(r.onPositive, r.onPositive.label);
        const cm = {
          onCell: on && on.cell ? on.cell : null,
          onStatic: on && !on.cell && typeof on.value === 'boolean' ? on.value : null, // cờ khoá: chỉ hiện, không sửa
          onPositive: onPos && onPos.cell ? onPos.cell : null,
          mainCell: main && main.cell ? main.cell : null,
          mainText: main && !main.cell ? main.text : '',
          shared: !!(main && main.shared),
          fields
        };
        if (!main && !fields.length && !cm.onCell) {
          cells[p.code] = null; // chức vụ này chưa có dữ liệu cho khoản này
          continue;
        }
        cells[p.code] = cm;
      }
      return { id: r.id, comp: r.comp, label: r.label, legal: !!r.legal, page: r.page || r.comp, cells };
    });
    return { positions, rows };
  }

  /* Mô hình từ GET /api/entitlements:
       blocks: [{ id, component, label, alwaysOn, readOnly, value: { unit, label }, fields: [đuôi khoá] }]
       cells:  [{ position, block, on, value, source: 'position' | 'global' | null, valueKey, fields: { <đuôi>: giá trị | null } }]
     Giá trị của một chức vụ nằm ở khoá type.<mã>.<đuôi>; giá trị chung toàn công ty (source 'global') chỉ hiện, sửa ở trang cài đặt. */
  const TAIL_LABEL = {
    workdays: 'Ngày công chuẩn',
    dows: 'Ngày làm việc trong tuần',
    probationPayPct: 'Tỷ lệ lương thử việc',
    'benefit.paidHoliday': 'Lương nghỉ lễ',
    'benefit.paidLeave': 'Lương nghỉ phép năm',
    'benefit.isat': 'iSAT',
    'benefit.approvedLeave': 'Nghỉ được duyệt',
    'benefit.ot': 'OT',
    'benefit.makeup': 'Làm bù',
    'benefit.kpi': 'Có lương KPI',
    travel: 'Tỷ lệ phụ cấp đi lại',
    attendance: 'Tỷ lệ phụ cấp chuyên cần',
    maxAbsent: 'Số ngày nghỉ tối đa',
    flexBonus: 'Phụ cấp ca Flex',
    nightOptions: 'Các mức phụ cấp ca đêm',
    kpiPass: 'Mốc KPI đạt',
    advanceRate: 'Tỷ lệ tạm ứng',
    workdaysMode: 'Cách tính ngày công chuẩn',
    defaultContract: 'Hợp đồng mặc định'
  };
  const CONTRACT_TXT = { long: 'HĐLĐ từ 3 tháng', short: 'Dưới 3 tháng' };
  const SHARED_TXT = 'Dùng giá trị chung';
  const UNIT_ALIAS = { percent: 'percentPoints' }; // máy chủ gửi 'percent' cho số đã là phần trăm (ví dụ 75)
  /* Lịch làm việc của chức vụ (thứ làm việc, cách tính ngày công chuẩn): sửa được khi máy chủ mở khoá tương ứng
     (mục registry không còn ở dạng chỉ đọc); còn khoá (ba chức vụ mặc định trước khi mở) thì chỉ hiện chữ. */
  const SCHEDULE_TAILS = new Set(['dows', 'workdaysMode']);
  const MODE_OPTIONS = [
    { value: 'fixed', label: 'Cố định (số)' },
    { value: 'computed', label: 'Tính theo lịch của tháng' }
  ];
  function scheduleField(code, tail, v, name, title) {
    if (!SCHEDULE_TAILS.has(tail)) return null;
    const e = kit().PS.byId.get(`type.<type>.${tail}`) || kit().PS.byId.get(`type.${code}.${tail}`);
    // Thứ làm việc: máy chủ tự kiểm khi lưu (môi trường thật trả SCHEDULE_EDIT_NOT_ALLOWED), nên luôn cho sửa;
    // cách tính ngày công chuẩn là mục registry bình thường nên theo trạng thái khoá của mục đó
    const open = tail === 'workdaysMode' ? !!e && !kit().K.isLocked(e) && e.class !== 'fixed' : true;
    const text =
      tail === 'workdaysMode' ? (MODE_OPTIONS.find(o => o.value === v) || {}).label || '—' : tailText(tail, v);
    if (!open || v === null || v === undefined) return { text, label: name };
    const days = tail !== 'workdaysMode';
    const cell = kit().fieldCell({
      key: `type.${code}.${tail}`,
      value: v,
      comp: days ? 'days' : 'choice',
      rules: { type: days ? 'list' : 'enum', nullable: false, messages: {}, options: MODE_OPTIONS },
      options: MODE_OPTIONS,
      label: name,
      title: title(name)
    });
    return { cell, text, label: name };
  }
  function tailText(tail, v, unit) {
    if (v === null || v === undefined) return SHARED_TXT;
    if (typeof v === 'boolean') return v ? 'Có' : 'Không';
    if (tail === 'defaultContract') return CONTRACT_TXT[v] || String(v);
    if (tail === 'dows') return A.dowsText(v);
    if (tail === 'nightOptions') return Array.isArray(v) ? v.map(x => `${x} %`).join(', ') : String(v);
    if (typeof v === 'number') return kit().fmtVal(UNIT_ALIAS[unit] || unit, v);
    return String(v);
  }
  /* Ô của khối phụ cấp do C&B thêm: bật theo onKey, giá trị theo valueKey (số tiền hoặc tỷ lệ) hoặc theo từng bậc (fields.byLevel.<bậc>).
     Các khoá này không có trong registry nên tự dựng quy tắc kiểm; máy chủ vẫn kiểm lại khi xem trước. */
  function addedCell(b, p, sc, title) {
    const pct = b.method === 'pctBase';
    const moneyRules = { type: 'vnd', unit: 'vnd', nullable: false, messages: {} };
    const pctRules = { type: 'number', unit: 'ratio', nullable: false, messages: {} };
    const own = (key, value, comp, name, rules) =>
      cellOf(
        { key, value, comp, unit: comp === 'toggle' ? null : comp === 'percent' ? 'ratio' : 'vnd', rules },
        name,
        title(name)
      );
    const onCell = sc.onKey
      ? own(sc.onKey, sc.on === true, 'toggle', 'Bật cho chức vụ này', {
          type: 'bool',
          unit: null,
          nullable: false,
          messages: {}
        })
      : null;
    const valueName = (b.value && b.value.label) || (pct ? 'Tỷ lệ lương cơ bản' : 'Số tiền');
    const mainCell =
      sc.valueKey && typeof sc.value === 'number'
        ? own(sc.valueKey, sc.value, pct ? 'percent' : 'money', valueName, pct ? pctRules : moneyRules)
        : null;
    const levels = ((A.positions.get(p.code) || {}).levels || []).reduce((m, l) => ({ ...m, [l.level]: l.name }), {});
    const byLevel = Object.entries(sc.fields && typeof sc.fields === 'object' ? sc.fields : {})
      .filter(([tail, v]) => /^byLevel\.\d+$/.test(tail) && typeof v === 'number')
      .map(([tail, v]) => {
        const n = tail.split('.')[1];
        const name = `Bậc ${n}${levels[n] ? ` (${levels[n]})` : ''}`;
        return {
          cell: own(`${sc.onKey.replace(/on$/, '')}${tail}`, v, 'money', name, moneyRules),
          label: name,
          text: tailText('', v, 'vnd')
        };
      });
    const fields = [
      ...(onCell ? [{ cell: onCell, label: 'Bật cho chức vụ này', text: sc.on ? 'Có' : 'Không' }] : []),
      ...(mainCell ? [{ cell: mainCell, label: valueName, text: tailText('', sc.value, pct ? 'ratio' : 'vnd') }] : []),
      ...byLevel
    ];
    return {
      onCell,
      onStatic: onCell ? null : sc.on === true,
      mainCell,
      mainText: mainCell ? '' : byLevel.length ? 'Theo bậc' : '',
      shared: false,
      fields
    };
  }
  /* Chức vụ mới thêm chưa có khoá riêng trong danh sách tham số của máy chủ: dựng ô nhập theo mẫu của khoá cùng đuôi
     (type.<mã>.<đuôi> theo mục type.<type>.<đuôi> của registry). Máy chủ vẫn kiểm khoá khi xem trước. */
  function templateDesc(key, idx) {
    const m = /^type\.([a-z][a-z0-9]*)\.(.+)$/.exec(key);
    if (!m) return null;
    const entry = kit().PS.byId.get(`type.<type>.${m[2]}`);
    if (!entry || !entry.ui || kit().K.isLocked(entry) || entry.class === 'fixed' || entry.wired === false) return null;
    const flag = /^benefit\.(.+)$/.exec(m[2]);
    if (flag) {
      const col = ((entry.ui.table && entry.ui.table.columns) || []).find(c => c.key === flag[1]);
      const rules = entry.rules && entry.rules.columns && entry.rules.columns[flag[1]];
      return col
        ? { key, entry, rules: rules || {}, comp: col.component, unit: col.unit, label: col.label, editable: true }
        : null;
    }
    const inst = (entry.instances || [])[0];
    if (!inst) return null;
    return {
      key,
      entry,
      rules: inst.rules || entry.rules || {},
      comp: entry.ui.component,
      unit: entry.ui.unit,
      label: entry.label,
      editable: true
    };
  }
  function serverModel(res, idx) {
    const kt = kit();
    const positions = (res.positions || [])
      .map(p => ({ code: String(p.code || ''), label: String(p.label || p.code || ''), deprecated: !!p.deprecated }))
      .filter(p => p.code);
    const cellsOf = Array.isArray(res.cells) ? res.cells : [];
    const rows = (res.blocks || []).map(b => {
      const bid = String(b.id || '');
      const comp = String(b.component !== undefined && b.component !== null ? b.component : '3');
      const label = String(b.label || bid);
      const unit = b.value && b.value.unit;
      const cells = {};
      for (const p of positions) {
        const sc = cellsOf.find(x => x.position === p.code && x.block === bid);
        if (!sc) {
          cells[p.code] = null;
          continue;
        }
        const title = f => `${label} · ${p.label}${f ? ': ' + f : ''}`;
        if (b.added) {
          cells[p.code] = addedCell(b, p, sc, title);
          continue;
        }
        const vals = sc.fields && typeof sc.fields === 'object' ? sc.fields : {};
        const editableDesc = key => {
          const d = idx.get(key) || templateDesc(key, idx);
          return d && d.editable && !b.readOnly ? d : null;
        };
        const tails = [...(b.fields || [])];
        if (b.id === 'workday' && !tails.includes('workdaysMode')) tails.push('workdaysMode');
        if (vals.workdaysMode === undefined && tails.includes('workdaysMode')) {
          const d = idx.get(`type.${p.code}.workdaysMode`);
          if (d) vals.workdaysMode = d.value;
        }
        const fields = tails.map(tail => {
          const v = vals[tail];
          const name = TAIL_LABEL[tail] || (idx.get(`type.${p.code}.${tail}`) || {}).label || tail;
          const sch = scheduleField(p.code, tail, v, name, title);
          if (sch) return sch;
          const d = editableDesc(`type.${p.code}.${tail}`);
          if (d && (typeof v === 'number' || typeof v === 'boolean'))
            return {
              cell: cellOf({ ...d, value: v }, name, title(name)),
              label: name,
              text: tailText(tail, v, d.unit)
            };
          if (notWired(tail)) return { text: NOT_WIRED_TXT, label: name };
          return { text: tailText(tail, v, d && d.unit), label: name, shared: v === null || v === undefined };
        });
        // giá trị chính: của riêng chức vụ thì sửa được, chung toàn công ty thì chỉ hiện
        const mainDesc = sc.source === 'position' && sc.valueKey ? editableDesc(sc.valueKey) : null;
        const mainCell =
          mainDesc && typeof sc.value === 'number'
            ? cellOf({ ...mainDesc, value: sc.value }, (b.value && b.value.label) || label, title())
            : null;
        const shared = sc.source === 'global';
        if (shared && sc.valueKey) {
          const d = idx.get(sc.valueKey);
          fields.unshift({
            text: tailText('', sc.value, unit),
            label: (b.value && b.value.label) || label,
            shared: true,
            page: d ? pageOf(d.entry) : null
          });
        }
        const benefit = (b.fields || []).find(t => t.startsWith('benefit.'));
        const onField = benefit ? fields[(b.fields || []).indexOf(benefit) + (shared && sc.valueKey ? 1 : 0)] : null;
        cells[p.code] = {
          onCell: !b.alwaysOn && onField && onField.cell ? onField.cell : null,
          onPositive: !b.alwaysOn && !benefit && mainCell ? mainCell : null,
          onStatic:
            !b.alwaysOn &&
            !b.readOnly &&
            !(onField && onField.cell) &&
            !(!benefit && mainCell) &&
            typeof sc.on === 'boolean'
              ? sc.on
              : null,
          mainCell,
          mainText: mainCell ? '' : b.readOnly ? tailText('defaultContract', sc.value) : tailText('', sc.value, unit),
          shared,
          fields,
          link: b.readOnly ? comp : null
        };
      }
      return { id: bid, comp, label, legal: !!b.readOnly || comp === '7' || comp === '8', page: comp, cells, meta: b };
    });
    return { positions, rows };
  }

  function buildMatrix() {
    const m = KH.model;
    let built;
    if (m.src === 'server' && m.ent) {
      try {
        built = serverModel(m.ent, indexKeys());
      } catch {
        built = null; // dữ liệu máy chủ lạ: dùng bản dựng từ registry, không vỡ trang
      }
    }
    if (!built || !built.positions.length || !built.rows.length) built = registryModel();
    KH.built = built;
    return built;
  }

  /* ---------- bảng quyền lợi: vẽ ---------- */
  const rawNum = raw => {
    const n = Number(
      String(raw ?? '')
        .replace(/\./g, '')
        .replace(',', '.')
    );
    return Number.isFinite(n) ? n : null;
  };
  const cellsOfCm = cm => {
    const out = new Set();
    for (const c of [cm.onCell, cm.onPositive, cm.mainCell]) if (c) out.add(c);
    for (const f of cm.fields || []) if (f.cell) out.add(f.cell);
    return [...out];
  };
  /* Bảng chỉ cho bấm khi đủ mọi nhóm tham số và mô hình quyền lợi của tháng này đã về. Chưa đủ thì ô của chức vụ mới (khoá type.<mã>.*
     chưa có trong danh sách, phải dựng theo mẫu type.<type>.*) hiện thành chữ chỉ đọc, và hộp chi tiết dựng một lần nên không tự vẽ lại. */
  function matrixReady() {
    const PS = kit().PS;
    return (
      !!PS.index.length && PS.index.every(g => PS.cache.has(g.id)) && KH.model.loaded && KH.model.month === S.month
    );
  }
  /* Tải lỗi (không còn nhóm nào đang tải mà vẫn thiếu): cho tải lại, không để bảng khoá mãi */
  const matrixFailed = () => {
    const PS = kit().PS;
    return !matrixReady() && PS.state === 'ok' && !!PS.error && !PS.loadingGroups.size;
  };
  A.actions.khretry = async () => {
    const kt = kit();
    kt.PS.error = '';
    A.render();
    await Promise.all(kt.PS.index.map(g => kt.fetchGroup(g.id)));
    await loadModel(S.month);
    A.render();
  };
  function cellView(row, pos, cm) {
    const kt = kit();
    if (!cm) return `<span class="kh-na" title="Chưa có dữ liệu cho chức vụ này">—</span>`;
    const busy = !matrixReady();
    let on = null;
    if (cm.onCell) on = kt.cellRaw(cm.onCell) === '1';
    else if (cm.onPositive) {
      const n = rawNum(kt.cellRaw(cm.onPositive));
      on = n !== null ? n > 0 : null;
    } else if (typeof cm.onStatic === 'boolean') on = cm.onStatic;
    const dirty = cellsOfCm(cm).some(c => kt.isDirty(c));
    const main = cm.mainCell ? kt.showRaw(cm.mainCell, kt.cellRaw(cm.mainCell)) : cm.mainText || '';
    const shown = on === false ? '' : main;
    const sw = on === null ? '' : `<span class="kh-sw ${on ? 'on' : ''}">${on ? 'Bật' : 'Tắt'}</span>`;
    const label = `${row.label}, ${pos.label}: ${on === null ? '' : on ? 'bật' : 'tắt'} ${shown}${dirty ? ', đã sửa chưa lưu' : ''}`;
    return `<button type="button" class="kh-cell ${dirty ? 'is-dirty' : ''} ${on === false ? 'is-off' : ''}" data-act="khcell" data-r="${esc(row.id)}" data-p="${esc(pos.code)}" aria-label="${esc(label)}"${busy ? ' disabled aria-disabled="true"' : ''}>${sw}${shown ? `<span class="kh-val">${esc(shown)}</span>` : ''}${cm.shared && on !== false ? '<span class="kh-sub">chung</span>' : ''}${dirty ? '<span class="kh-dot" aria-hidden="true"></span>' : ''}</button>`;
  }
  function matrixHtml() {
    const m = buildMatrix();
    const head = m.positions
      .map(
        p =>
          `<th scope="col" class="kh-ph"><span>${esc(p.label)}</span>${p.deprecated ? `<span class="cap">ngưng dùng</span>` : ''}</th>`
      )
      .join('');
    const body = m.rows
      .map(row => {
        const tds = m.positions
          .map(p => `<td data-label="${esc(p.label)}">${cellView(row, p, row.cells[p.code])}</td>`)
          .join('');
        return `<tr><th scope="row" class="kh-rh"><button type="button" class="kh-rl" data-act="khpage" data-p="${esc(row.page)}" data-scroll="1"><span class="kh-no sm" aria-hidden="true">${esc(row.comp)}</span><span>${esc(row.label)}</span></button>${A.KhoiPhuCap ? A.KhoiPhuCap.flagsHtml(row) : ''}</th>${tds}<td class="kh-gap"></td></tr>`;
      })
      .join('');
    const add = `<tr><th scope="row" class="kh-rh"><button type="button" class="kh-rl kh-addrow" data-act="khaddblock">${ic('plus', 16)}<span>Thêm khoản</span></button></th>${m.positions.map(() => '<td></td>').join('')}<td class="kh-gap"></td></tr>`;
    const ready = matrixReady();
    const wait = ready
      ? ''
      : matrixFailed()
        ? `<span class="kh-err" role="alert">Chưa tải đủ cài đặt: ${esc(kit().PS.error)} <button type="button" class="link" data-act="khretry">Tải lại</button></span>`
        : '<span class="cap" role="status">Đang tải đủ cài đặt, bấm được ngay khi tải xong…</span>';
    return `<section class="card flush kh-matrix" id="kh-matrix"${ready ? '' : ' aria-busy="true"'}><div class="card-h"><h2>Bảng chế độ theo chức vụ</h2><span class="cap">Hàng là khoản, cột là chức vụ, giá trị hiệu lực ${esc(A.monthLabel(S.month))}. Bấm một ô để xem và sửa chi tiết; ô đổi màu là đã sửa chưa lưu.</span><span class="end"><button type="button" class="btn sm" data-act="khaddpos">${ic('plus', 14)}Thêm chức vụ</button></span>${wait ? `<div class="kh-wait">${wait}</div>` : ''}</div>
<div class="tblwrap"><table class="kh-tbl"><thead><tr><th scope="col" class="kh-rh">Khoản</th>${head}<th scope="col" class="kh-gap"></th></tr></thead><tbody>${body}${add}</tbody></table></div></section>`;
  }
  /* Bảng chế độ theo chức vụ (hàng là khoản, cột là chức vụ): hiện ở nhóm "Chức vụ và bậc lương" của Tất cả cài đặt */
  function top(pid) {
    return pid === 'position' ? matrixHtml() : '';
  }

  /* ---------- chi tiết một ô ---------- */
  function fieldInput(cell) {
    const kt = kit();
    const raw = kt.cellRaw(cell);
    const cls = kt.stateCls(cell, raw);
    const attrs = `data-input="mxin" data-key="${esc(cell.key)}" aria-label="${esc(cell.label || 'Giá trị')}"`;
    if (cell.kind === 'bool')
      return `<select class="input sm${cls}" ${attrs}><option value="1" ${raw === '1' ? 'selected' : ''}>Có</option><option value="0" ${raw === '0' ? 'selected' : ''}>Không</option></select>`;
    if (cell.kind === 'days') {
      const on = new Set(raw === '' ? [] : raw.split(',').map(Number));
      return `<span class="kh-days" role="group" aria-label="${esc(cell.label)}">${[1, 2, 3, 4, 5, 6].map(d => `<label class="kh-day"><input type="checkbox" data-input="mxday" data-key="${esc(cell.key)}" data-d="${d}" ${on.has(d) ? 'checked' : ''}><span>${esc(A.DOW_SHORT[d])}</span></label>`).join('')}</span>`;
    }
    if (cell.kind === 'enum')
      return `<select class="input sm${cls}" ${attrs}>${(cell.def.options || []).map(o => `<option value="${esc(o.value)}" ${String(o.value) === raw ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
    if (cell.kind === 'text') return `<input class="input sm${cls}" type="text" value="${esc(raw)}" ${attrs}>`;
    const suffix = kt.unitTxt(cell.unit);
    return `<div class="px-unit"><input class="input sm num${cls}" inputmode="decimal" autocomplete="off" value="${esc(raw)}" ${attrs}>${suffix ? `<span class="px-suffix" aria-hidden="true">${esc(suffix)}</span>` : ''}</div>`;
  }
  const msgBox = cell => {
    const kt = kit();
    const msgs = kt.check(cell, kt.cellRaw(cell));
    return msgs
      .map(
        x =>
          `<span class="${x.lv === 'err' ? 'kh-err' : 'kh-warn'}" role="${x.lv === 'err' ? 'alert' : 'status'}">${esc(x.t)}${x.lv === 'warn' ? ' Cảnh báo, vẫn lưu được.' : ''}</span>`
      )
      .join('');
  };
  const fieldId = key => 'kh-m-' + String(key).replace(/[^A-Za-z0-9_-]/g, '_');
  A.actions.khcell = el => {
    const m = KH.built;
    if (!m) return;
    if (!matrixReady()) return A.toast('Đang tải cài đặt, thử lại sau giây lát.'); // phòng khi bấm ở màn khác (Chế độ theo loại) trước khi đủ dữ liệu
    const row = m.rows.find(r => r.id === el.dataset.r);
    const pos = m.positions.find(p => p.code === el.dataset.p);
    const cm = row && pos && row.cells[pos.code];
    if (!cm) return;
    if (cm.link) {
      setPage(cm.link);
      A.render();
      scrollToPage();
      return;
    }
    const fields =
      cm.fields && cm.fields.length ? cm.fields : cm.mainCell ? [{ cell: cm.mainCell, label: cm.mainCell.label }] : [];
    const body = fields
      .map(f => {
        if (f.cell)
          return `<div class="formrow"><label class="lbl">${esc(f.label)}<span class="kh-fi">${fieldInput(f.cell)}</span></label><div id="${esc(fieldId(f.cell.key))}" class="kh-msgs">${msgBox(f.cell)}</div></div>`;
        return `<div class="formrow"><span class="lbl">${esc(f.label)}</span><span class="cfgval">${esc(f.text)}</span>${f.shared ? `<span class="cap">Chung cho mọi chức vụ. Sửa ở trang cài đặt của thành phần.${f.page ? ` <button type="button" class="link" data-act="khopen" data-p="${esc(f.page)}">Mở cài đặt</button>` : ''}</span>` : ''}</div>`;
      })
      .join('');
    A.openDialog({
      title: `${row.label} · ${pos.label}`,
      sub: `Chi tiết chế độ, áp dụng từ ${A.monthLabel(S.month)}. Sửa xong bấm "Giữ thay đổi", rồi bấm "Xem trước và lưu" ở cuối trang mới được ghi.`,
      body: body || '<span class="cap">Chưa có mục nào để sửa cho chức vụ này.</span>',
      foot: [
        {
          label: 'Giữ thay đổi (chưa lưu)',
          cls: 'pri',
          onClick: api => {
            api.close();
            A.render();
          }
        }
      ]
    });
  };
  A.actions.khopen = el => {
    A.closeDialog();
    setPage(el.dataset.p);
    A.render();
    scrollToPage();
  };
  /* Gõ trong hộp chi tiết: lưu vào kho giá trị đang sửa, vẽ lại đúng ô của bảng phía sau và thanh lưu */
  /* Chọn thứ làm việc: ghép các ô tích thành danh sách "1,2,3" rồi đi qua cùng đường lưu như mọi giá trị */
  A.inputs.mxday = el => {
    const picked = [
      ...document.querySelectorAll(`#ovl input[data-input="mxday"][data-key="${CSS.escape(el.dataset.key)}"]`)
    ]
      .filter(x => x.checked)
      .map(x => Number(x.dataset.d));
    A.inputs.mxin({ dataset: { key: el.dataset.key }, value: picked.join(','), classList: { remove() {}, add() {} } });
  };
  A.inputs.mxin = el => {
    const kt = kit();
    const cell = kt.PS.meta.get(el.dataset.key);
    if (!cell) return;
    kt.PS.vals[cell.key] = el.value;
    el.classList.remove('px-bad', 'px-wc');
    const s = kt.stateCls(cell, el.value).trim();
    if (s) el.classList.add(s);
    const box = document.getElementById(fieldId(cell.key));
    if (box) box.innerHTML = msgBox(cell);
    const m = KH.built;
    if (m)
      for (const row of m.rows)
        for (const pos of m.positions) {
          const cm = row.cells[pos.code];
          if (!cm || !cellsOfCm(cm).includes(cell)) continue;
          const btn = document.querySelector(
            `#kh-matrix [data-act="khcell"][data-r="${CSS.escape(row.id)}"][data-p="${CSS.escape(pos.code)}"]`
          );
          if (btn) {
            const tmp = document.createElement('div');
            tmp.innerHTML = cellView(row, pos, cm);
            if (tmp.firstElementChild) btn.replaceWith(tmp.firstElementChild);
          }
        }
    kt.refreshBar();
  };

  /* ---------- chọn trang ---------- */
  /* Mở trang từ bảng Chế độ theo loại / hộp chi tiết: sang Cách tính lương với ngăn kéo của khoản đó (trang ①–⑧) */
  function scrollToPage() {
    if (/^[1-8]$/.test(S.f.pxPage || '')) S.f.sdrawer = S.f.pxPage;
    A.go('cai-dat', 'so-do');
  }
  A.actions.khpage = el => {
    setPage(el.dataset.p);
    A.render();
    if (el.dataset.scroll) scrollToPage();
  };

  /* ---------- tải mô hình bảng quyền lợi ---------- */
  async function loadModel(month) {
    if (KH.model.month === month && KH.model.loaded) return;
    try {
      const res = await A.api('GET', '/entitlements' + A.qs({ month }));
      const ok =
        res &&
        Array.isArray(res.positions) &&
        res.positions.length &&
        Array.isArray(res.blocks) &&
        res.blocks.length &&
        res.cells != null;
      KH.model = { month, loaded: true, src: ok ? 'server' : 'registry', ent: ok ? res : null };
    } catch {
      KH.model = { month, loaded: true, src: 'registry', ent: null }; // chưa có đường dẫn hoặc lỗi: dựng từ registry
    }
  }
  const reset = () => {
    KH.model = { month: null, loaded: false, src: 'registry', ent: null };
    KH.built = null;
  };

  /* Chỉ một chức vụ trong mọi khoá thay đổi thì báo máy chủ phạm vi để tách người trong và ngoài chức vụ */
  function scopeOf(keys) {
    const codes = new Set();
    for (const k of keys) {
      const m = POS_KEY_RE.exec(k);
      if (!m) return null;
      codes.add(m[1]);
    }
    if (codes.size !== 1) return null;
    const code = [...codes][0];
    return A.typeCodes().includes(code) ? { position: code } : null;
  }

  /* Hàng đợi "Chờ Kế toán xác nhận" ở trang ⑦ và ⑧: khối phụ cấp và khoản điền thêm có cờ thuế hoặc bảo hiểm chưa xác nhận.
     Nút xác nhận chỉ hiện cho người có config.legal; mỗi nút gọi đúng route của loại dòng đó. */
  const TAXTXT = { none: 'Chịu thuế', full: 'Miễn thuế toàn bộ', cap: 'Miễn thuế đến hạn mức' };
  function queue(pageId) {
    if (pageId !== '7' && pageId !== '8') return '';
    if (A.Entries) A.Entries.ensure(S.month);
    const legal = !A.meInfo || !Array.isArray(A.meInfo.caps) || A.meInfo.caps.includes('config.legal');
    const ent = KH.model.src === 'server' && KH.model.ent ? KH.model.ent : null;
    const blocks = ((ent && ent.blocks) || []).filter(
      b => b.added && ((b.tax && b.tax !== 'none') || b.insuranceBase === true) && !b.flagsConfirmedBy
    );
    const entries = A.Entries ? A.Entries.flagRows() : [];
    const loading = A.Entries && A.Entries.state() === 'loading';
    const btn = (act, attrs) =>
      legal
        ? `<button type="button" class="btn sm pri" data-act="${act}" ${attrs}>Xác nhận</button>`
        : '<span class="cap">Chờ Kế toán</span>';
    const rows = [
      ...blocks.map(b => {
        const flags = [
          `${TAXTXT[b.tax] || TAXTXT.none}${b.tax === 'cap' && typeof b.taxCap === 'number' ? ` (${esc(kit().fmtVal('vnd', b.taxCap))})` : ''}`,
          b.insuranceBase === true ? 'tính vào bảo hiểm' : 'không tính vào bảo hiểm'
        ].join('; ');
        return `<tr><td data-label="Loại">Khối phụ cấp</td><td data-label="Nội dung" class="wrapcell">${esc(b.label)}</td><td data-label="Cờ đề nghị" class="wrapcell cap">${flags}</td><td data-label="" class="r">${btn('khconfirm', `data-r="${esc(b.id || b.code)}"`)}</td></tr>`;
      }),
      ...entries.map(
        r =>
          `<tr><td data-label="Loại">Khoản điền thêm</td><td data-label="Nội dung" class="wrapcell">${esc(r.label)}<div class="cap">${esc(A.staff && A.staff.byUser && A.staff.byUser.get(r.username) ? A.staff.byUser.get(r.username).name : r.username)} · ${esc(kit().fmtVal('vnd', r.amount))}</div></td><td data-label="Cờ đề nghị" class="wrapcell cap">${esc(A.Entries.flagText(r))}</td><td data-label="" class="r">${btn('enflags', `data-id="${esc(r.id)}"`)}</td></tr>`
      )
    ];
    const body = rows.length
      ? `<div class="tblwrap"><table class="rtable"><thead><tr><th>Loại</th><th>Nội dung</th><th>Cờ đề nghị</th><th></th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`
      : loading
        ? '<div class="skel" style="width:50%"></div>'
        : A.empty('Không có gì chờ xác nhận', 'Cờ thuế và bảo hiểm do C&B đề nghị sẽ hiện ở đây.');
    return `<section class="card" id="kt-queue"><div class="row wrap between" style="gap:8px"><div class="col" style="gap:4px"><h2>Chờ Kế toán xác nhận</h2><span class="cap">Cờ thuế và bảo hiểm do C&B đề nghị chỉ có hiệu lực sau khi xác nhận. Khoản điền thêm xét theo ${esc(A.monthLabel(S.month))}.</span></div></div>${body}</section>`;
  }

  /* Dùng cho màn Cài đặt kiểu mới (cai-dat-so-do.js, cai-dat-quyen-loi.js) */
  const descOf = key => {
    const idx = indexKeys();
    return idx.get(key) || templateDesc(key, idx);
  };
  const valueOf = key => {
    const d = indexKeys().get(key);
    return d ? d.value : undefined;
  };
  A.Khung = {
    descOf,
    valueOf,
    cellOf,
    matrix: buildMatrix,
    pageOfEntry: pageOf,
    allEntries,
    page,
    top,
    pageOf,
    pageTitleOf,
    setPage,
    loadModel,
    reset,
    scopeOf,
    NAME_OF,
    DEDUCT_IDS: new Set(FRAME.filter(c => c.sign === '−').map(c => c.id)),
    queue,
    rowOf: id => (KH.built ? KH.built.rows.find(r => r.id === id) : null),
    staleNote: reasons =>
      (Array.isArray(reasons) ? reasons : [])
        .map(
          r =>
            STALE_NOTE[typeof r === 'string' ? r : r && (r.kind || r.code || r.reason)] ||
            (r && typeof r === 'object' && r.message) ||
            ''
        )
        .filter(Boolean)
  };
})(window.Admin);
