/* Màn Cài đặt › Tất cả cài đặt: dựng HOÀN TOÀN từ registry tham số của máy chủ (GET /api/settings/params và
   /api/settings/first-run). Mỗi mục registry khai báo một thành phần giao diện (ui.component: money, percent, quantity, choice,
   toggle, table, tierTable, formula, fixed, conditions) và màn hình chỉ có MỘT bộ vẽ cho mỗi thành phần; không có mã riêng cho
   từng tham số. Nhãn, đơn vị, khoảng, sàn trần luật, phương án và thông báo lỗi đều lấy từ registry (rules.messages hiện nguyên văn).
   Lưu: "Xem trước và lưu" mở hộp thoại chọn tháng áp dụng, xem tác động từng người (POST /api/settings/params/preview), xác nhận
   cảnh báo sàn luật, ghi lý do rồi PUT /api/settings/params. Số tiền hiện đúng như máy chủ trả, không tính ở đây. Khi máy chủ chưa có
   hai đường dẫn đó (404, hoặc 403 NO_ROUTE_POLICY) nút Lưu bị khoá và ô nhập chỉ để thử trong trang. Không bao giờ giả vờ đã lưu.
   Hộp lưu dùng chung: A.Params.openSave(items, { onSaved }) (màn Công thức dùng cho khoá formula.<tên>).
   Mọi chuỗi từ API qua A.esc() trước khi vào innerHTML. Không có số nghiệp vụ ở đây: chỉ định dạng hiển thị. */
(function (A) {
  'use strict';
  const { esc, ic, S } = A;

  /* ---------- hằng của giao diện (nhãn hiển thị, không phải số nghiệp vụ) ---------- */
  const UNIT_TXT = {
    vnd: '₫',
    ratio: '%',
    percentPoints: '%',
    minute: 'phút',
    hour: 'giờ',
    day: 'ngày',
    month: 'tháng',
    yearMonth: '',
    date: '',
    times: 'lần',
    meter: 'm',
    degree: '°',
    bytes: 'byte',
    count: ''
  };
  /* Nhãn trạng thái của mục: đã sửa thì ghi ai sửa, chưa xác nhận thì nhãn cam; mặc định của app không gắn nhãn */
  const WHO_TXT = { admin: 'Admin', accounting: 'Kế toán' };
  const HELP_INLINE_MAX = 200; // chú thích dài hơn thế thì gập lại
  const MSG_LABELS_MAX = 3; // số ô kể tên trong một thông báo gộp
  /* Hai nhóm chỉ đọc "Hệ thống" và "Luật cố định và đơn vị" nằm ở mục "Nâng cao", gập sẵn, ngoài danh sách nhóm chính.
     Registry chưa có cờ "nâng cao" trên nhóm nên mã nhóm khai ở đây. */
  const ADVANCED_GROUPS = [14, 15];
  const SEARCH_MAX = 20; // số kết quả tìm tối đa hiện ra
  const DATE_LIST_SHOW = 24; // số ngày hiện tối đa trong danh sách ngày
  const FIRST_RUN_VALUE_MAX = 80; // cắt giá trị dài trong bảng cài đặt lần đầu
  const REASON_MAX = 300; // độ dài lý do tối đa theo hợp đồng với máy chủ
  const ERR_SHOW_MAX = 5; // số lỗi liệt kê tối đa trong hộp lưu (còn lại gộp một dòng)
  const SAVE_LIST_MAX = 30; // số thay đổi liệt kê tối đa trong hộp lưu
  const SELF_EVENT_MS = 3000; // sự kiện params.changed đến sát sau lần lưu của chính mình thì bỏ qua

  const LEVEL_TABLE_ID = 'level.<type>.<level>';
  const ATTR_DEF_KEY = 'class.level.attr.'; // định nghĩa thuộc tính mới: tham-so-thuoc-tinh.js

  /* Mục sửa được, chỉ đọc, sắp có (wired:false): tham-so-sap-co.js */
  const K = A.PxKind;
  const { isSoon, isLocked } = K;

  const PS = {
    attrDrafts: [], // cột thuộc tính mới đang soạn, chưa lưu: [{ code, label, component, unit, min, max, default }]
    meta: new Map(), // mọi ô đã vẽ, theo khoá tham số (giữ khi đổi nhóm để biết ô nào đang sửa)
    saveApi: 'unknown', // unknown | yes | no: máy chủ đã có đường dẫn lưu chưa
    stale: false, // có thay đổi mới từ người khác
    staleLoaded: false, // đã tải lại giá trị mới (giữ nguyên ô đang sửa)
    selfRev: null,
    selfConfigRev: null,
    selfAt: 0,
    loading: null,
    month: null,
    state: 'idle', // idle | loading | ok | fail
    error: '',
    env: null,
    index: [], // [{ id, label, count }] từ groupIndex, có trong mọi phản hồi
    cache: new Map(), // nhóm đã tải: id → { id, label, entries }
    loadingGroups: new Set(),
    gen: 0, // đời của kho: tăng mỗi lần xoá kho; một nhóm tải dở từ đời trước về muộn thì bị bỏ, không ghi đè số mới
    allRequested: false, // đã bắt đầu tải các nhóm còn lại để tìm kiếm
    byId: new Map(), // mục của các nhóm đã tải
    fr: { state: 'idle', items: [], total: 0, error: '' },
    vals: {}, // ô đang thử: { khoá ô: chữ đang gõ } (chỉ trong trang, không gửi đi)
    cells: [], // danh sách ô của lần vẽ gần nhất
    extraRows: {}, // hàng thử thêm cho bảng bậc: { id mục: số hàng }
    focusId: null,
    advOpen: false
  };

  /* ---------- định dạng hiển thị ---------- */
  const fmtNum = n => Number(n).toLocaleString('vi-VN', { maximumFractionDigits: 6 });
  const ratioPct = v => Math.round(v * 1e4) / 1e2; // 0,075 → 7,5 (làm tròn hiển thị)
  /* Nhãn ngắn của một instance: bỏ phần nhãn của mục lặp lại ở đầu ("Phụ cấp đi lại (Nhân viên)" → "(Nhân viên)") */
  const instLabel = (e, inst) => {
    const t = inst.params && inst.params.type; // chức vụ của dòng này: hiện tên chức vụ, không hiện mã
    if (t && A.TYPE_LONG[t]) return `(${A.TYPE_LONG[t]})`;
    const rule = A.ruleIdOfKey && A.ruleIdOfKey(inst.key); // công tắc quy tắc AI: tên quy tắc như màn Trợ lý AI
    if (rule) return A.ruleLabel(rule);
    const l = A.nameCodes(inst.label);
    if (l === e.label) {
      /* nhãn trùng nhãn mục: phân biệt bằng tham số của khoá (qua nhãn phương án của mục cùng tên, ví dụ vùng 1 → "Vùng I") hoặc đuôi khoá */
      const ps = Object.entries(inst.params || {});
      if (!ps.length) return String(inst.key).split('.').pop().toUpperCase();
      return ps
        .map(([k, v]) => {
          const r = (PS.byId.get(`law.${k}`) || PS.byId.get(k) || {}).rules;
          return optLabel(r, Number(v)) || optLabel(r, v) || String(v);
        })
        .join(', ');
    }
    return l.startsWith(e.label) && l.length > e.label.length ? l.slice(e.label.length).trim() : l;
  };
  const domId = id => String(id).replace(/[^A-Za-z0-9_-]/g, '_');
  const clean = t => String(t ?? '').replace(/`/g, '');
  /* Công tắc của quy tắc AI mà giao diện không biết tên (khoá cũ, không còn quy tắc nào dùng): không hiện ô bật, tắt vô tác dụng */
  const orphanRule = inst => {
    const id = A.ruleIdOfKey && A.ruleIdOfKey(inst.key);
    return !!id && !A.RULE_LABEL[id];
  };
  const dispNum = (unit, v) => fmtNum(unit === 'ratio' ? ratioPct(v) : v);
  function fmtVal(unit, v) {
    if (v === null || v === undefined) return 'Chưa đặt';
    if (typeof v === 'boolean') return v ? 'Có' : 'Không';
    if (typeof v === 'number') return `${dispNum(unit, v)}${UNIT_TXT[unit] ? ' ' + UNIT_TXT[unit] : ''}`;
    if (unit === 'date') return A.fmtDate(v);
    if (unit === 'yearMonth') return /^\d{4}-\d{2}$/.test(v) ? A.monthLabel(v).replace('tháng ', '') : String(v);
    return String(v);
  }
  function fmtAny(v) {
    if (v === null || v === undefined) return '—';
    if (Array.isArray(v))
      return v.map(x => (Array.isArray(x) ? x.map(fmtAny).join(' → ') : fmtAny(x))).join('; ') || 'Rỗng';
    if (typeof v === 'object') return 'key' in v && 'value' in v ? `${v.key}: ${fmtAny(v.value)}` : JSON.stringify(v);
    if (typeof v === 'boolean') return v ? 'Có' : 'Không';
    if (typeof v === 'number') return fmtNum(v);
    return String(v);
  }
  const optLabel = (rules, v) => {
    const o = rules && rules.options && rules.options.find(x => x.value === v);
    return o ? o.label : null;
  };
  const kindOfRules = (rules, comp) => {
    const t = rules && rules.type;
    if (t === 'bool') return 'bool';
    if (t === 'enum') return 'enum';
    if (t === 'date') return 'date';
    if (t === 'month') return 'month';
    if (t === 'text' || comp === 'text') return 'text';
    return 'num';
  };

  /* ---------- tải dữ liệu ---------- */
  function ingest(res) {
    PS.env = {
      mode: res.mode,
      rev: res.paramsRev,
      skipped: res.skipped || [],
      notEnabled: res.notEnabledComponents || []
    };
    if (Array.isArray(res.groupIndex)) PS.index = res.groupIndex;
    for (const g of res.groups || []) {
      PS.cache.set(g.id, g);
      for (const e of g.entries) PS.byId.set(e.id, e);
    }
  }
  /* Xoá sạch kho nhóm tham số (sau khi lưu, thêm chức vụ, đổi tháng): từ đây mọi nhóm đang tải dở của đời cũ bị bỏ khi về */
  function clearStore() {
    PS.gen++;
    PS.cache.clear();
    PS.byId = new Map();
    PS.loadingGroups.clear(); // nhóm tải dở của đời cũ sẽ bị bỏ: để lần tải mới của nhóm đó không bị coi là "đang tải"
  }
  /* Tải đúng một nhóm (GET ?group=N); các nhóm khác chỉ tải khi người dùng mở hoặc tìm kiếm */
  async function fetchGroup(id) {
    if (PS.cache.has(id) || PS.loadingGroups.has(id)) return;
    const month = S.month;
    const gen = PS.gen;
    PS.loadingGroups.add(id);
    try {
      const res = await A.api('GET', '/settings/params' + A.qs({ month, group: id }));
      if (month === S.month && gen === PS.gen) ingest(res);
    } catch (e) {
      if (gen === PS.gen) PS.error = A.errText(e);
    } finally {
      if (gen === PS.gen) PS.loadingGroups.delete(id);
    }
  }
  function load() {
    const month = S.month;
    if (PS.state === 'loading') return PS.loading || Promise.resolve();
    if (PS.state === 'ok' && PS.month === month) return Promise.resolve();
    if (PS.saveApi === 'no') PS.saveApi = 'unknown'; // thử lại: có thể máy chủ đã có đường dẫn lưu
    PS.state = 'loading';
    PS.error = '';
    PS.fr.state = 'loading';
    const want = Number(S.f.cfgGroup) || 1;
    const main = A.api('GET', '/settings/params' + A.qs({ month, group: want }))
      .then(async res => {
        clearStore();
        ingest(res);
        PS.month = month;
        if (PS.index.length && !PS.index.some(g => g.id === want)) {
          S.f.cfgGroup = PS.index[0].id;
          await fetchGroup(PS.index[0].id);
        }
        PS.state = 'ok';
      })
      .catch(e => {
        PS.state = 'fail';
        PS.error = A.errText(e);
      });
    const fr = A.api('GET', '/settings/first-run' + A.qs({ month }))
      .then(res => {
        PS.fr = { state: 'ok', items: res.items || [], total: res.total || 0, error: '' };
      })
      .catch(e => {
        PS.fr = { state: 'fail', items: [], total: 0, error: A.errText(e) };
      });
    PS.loading = Promise.all([main, fr]).then(() => {
      probeSave();
      if (A.Khung) A.Khung.loadModel(month).then(() => A.render()); // bảng quyền lợi theo chức vụ: GET /api/entitlements (chưa có thì dựng từ registry)
      /* Tải nốt các nhóm còn lại (mỗi nhóm một yêu cầu): số mục sửa được trên thẻ nhóm và nhãn "chưa dùng được" ở thẻ cài đặt lần đầu cần biết cờ wired của mọi mục */
      if (PS.state === 'ok' && PS.month === month)
        Promise.all(PS.index.map(x => fetchGroup(x.id))).then(() => A.render());
    });
    return PS.loading;
  }
  const reset = () => {
    clearStore();
    PS.meta = new Map();
    PS.allRequested = false;
    PS.state = 'idle';
    PS.vals = {};
    PS.extraRows = {};
    PS.attrDrafts = [];
    PS.stale = false;
    PS.staleLoaded = false;
    if (A.Khung) A.Khung.reset();
  };

  /* ---------- máy chủ đã có đường dẫn lưu chưa? Thử một yêu cầu xem trước rỗng (không ghi gì) ---------- */
  const missingRoute = e =>
    !!e && (e.status === 404 || e.status === 405 || (e.status === 403 && e.data && e.data.code === 'NO_ROUTE_POLICY'));
  let probing = null;
  function probeSave() {
    if (PS.saveApi !== 'unknown') return Promise.resolve(PS.saveApi);
    if (probing) return probing;
    probing = A.api('POST', '/settings/params/preview', { changes: [], effectiveMonth: S.month })
      .then(() => 'yes')
      .catch(e => (missingRoute(e) ? 'no' : e && e.status === 0 ? 'unknown' : 'yes'))
      .then(v => {
        PS.saveApi = v;
        probing = null;
        const bar = document.getElementById('px-bar');
        if (bar) bar.innerHTML = barHtml();
        for (const fn of saveListeners) fn(v);
        return v;
      });
    return probing;
  }
  const saveListeners = new Set();

  /* ---------- kiểm tra tại chỗ theo `rules` của registry ---------- */
  function parseNum(raw) {
    const s = String(raw ?? '')
      .replace(/\s/g, '')
      .replace(/%$/, '');
    if (!s) return null;
    if (!(/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s) || /^-?\d+(,\d+)?$/.test(s))) return NaN;
    return Number(s.replace(/\./g, '').replace(',', '.'));
  }
  const listNums = s => s.split(/[,;\s]+/).filter(Boolean); // danh sách số gõ trong ô: "40, 60"
  const toRaw = (cell, v) => {
    if (v === null || v === undefined) return '';
    if (cell.kind === 'bool') return v ? '1' : '0';
    if (cell.kind === 'enum') return String(v);
    if (cell.kind === 'brackets') return A.PxBrackets.toRaw(v);
    if (cell.kind === 'days') return Array.isArray(v) ? [...v].sort((a, b) => a - b).join(',') : String(v);
    if (cell.kind === 'list') return Array.isArray(v) ? v.join(', ') : String(v); // danh sách số (mức phụ cấp ca đêm): "40, 60"
    if (cell.kind === 'num') return dispNum(cell.unit, v);
    return String(v);
  };
  /* Trả danh sách { lv: 'err' | 'warn', t: chữ } cho một ô; chữ lấy nguyên văn từ rules.messages */
  function check(cell, raw) {
    const r = cell.rules || {};
    const m = r.messages || {};
    const s = String(raw ?? '').trim();
    const out = [];
    if (cell.kind === 'brackets') return A.PxBrackets.check(raw);
    if (s === '') return r.nullable ? out : [{ lv: 'err', t: m.required || m.type || 'Không được để trống' }];
    if (cell.kind === 'list' && r.single)
      // ô một số (ca đêm theo bậc): đúng một số nguyên; mức tối thiểu theo luật do máy chủ báo ở bước xem trước
      return /^\d{1,3}$/.test(s) ? out : [{ lv: 'err', t: 'Nhập một số nguyên' }];
    if (cell.kind === 'list')
      // chỉ kiểm dạng nhập; mức tối thiểu theo luật do máy chủ báo ở bước xem trước
      return listNums(s).every(t => /^\d{1,3}$/.test(t))
        ? out
        : [{ lv: 'err', t: 'Nhập các mức là số nguyên, cách nhau bằng dấu phẩy, ví dụ 40, 60' }];
    if (cell.kind === 'num') {
      const p = parseNum(s);
      const v = p === null || Number.isNaN(p) ? NaN : cell.unit === 'ratio' ? Number((p / 100).toPrecision(12)) : p;
      if (!Number.isFinite(v) || ((r.type === 'int' || r.type === 'vnd') && !Number.isInteger(v)))
        return [{ lv: 'err', t: m.type || 'Giá trị không hợp lệ' }];
      if (r.min !== undefined && v < r.min) out.push({ lv: 'err', t: m.min });
      if (r.max !== undefined && v > r.max) out.push({ lv: 'err', t: m.max });
      for (const [side, below] of [
        ['floor', true],
        ['ceiling', false]
      ]) {
        const l = r[side];
        if (l && (below ? v < l.value : v > l.value)) out.push({ lv: 'warn', t: m[side], note: l.note || '' });
      }
      const ackTxt = 'vẫn lưu được, có cảnh báo';
      if (r.warnBelow && v < r.warnBelow.value)
        out.push({ lv: 'warn', t: `Thấp hơn ${fmtVal(cell.unit, r.warnBelow.value)}: ${ackTxt}` });
      if (r.warnAbove && v > r.warnAbove.value)
        out.push({ lv: 'warn', t: `Cao hơn ${fmtVal(cell.unit, r.warnAbove.value)}: ${ackTxt}` });
    } else if (cell.kind === 'date') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) out.push({ lv: 'err', t: m.type });
    } else if (cell.kind === 'month') {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(s)) out.push({ lv: 'err', t: m.type });
    }
    return out.filter(x => x.t).map(x => ({ ...x, t: A.nameCodes(x.t) }));
  }
  const stateCls = (cell, raw) => {
    const r = check(cell, raw);
    return r.some(x => x.lv === 'err') ? ' px-bad' : r.length ? ' px-wc' : '';
  };
  const cellRaw = cell => (Object.prototype.hasOwnProperty.call(PS.vals, cell.key) ? PS.vals[cell.key] : cell.orig);
  const isDirty = cell => cellRaw(cell) !== cell.orig;

  /* ---------- ô nhập: một bộ vẽ chung cho mọi thành phần ---------- */
  function newCell(entry, key, rules, def, orig, label) {
    const comp = def.component;
    const cell = {
      id: PS.cells.length,
      eid: entry.id,
      key,
      rules,
      label: label || '',
      unit: def.unit || (rules && rules.unit) || null,
      comp,
      kind: kindOfRules(rules, comp),
      def,
      orig: ''
    };
    cell.orig = toRaw(cell, orig);
    cell.gid = entry.group;
    PS.cells.push(cell);
    PS.meta.set(key, cell);
    return cell;
  }
  /* Ô đang sửa ở MỌI nhóm đã vẽ (không chỉ nhóm đang mở) */
  const dirtyCells = () =>
    [...PS.meta.values()].filter(c =>
      c.readonly
        ? false
        : c.isNew
          ? PS.attrDrafts.some(d => c.key.endsWith('.attr.' + d.code))
          : Object.hasOwn(PS.vals, c.key) && PS.vals[c.key] !== c.orig
    );
  const optionsOf = cell =>
    ((cell.def && cell.def.options) || (cell.rules && cell.rules.options) || []).map(o =>
      typeof o === 'string' ? { value: o, label: o } : o
    );
  /* Đổi chữ trong ô về giá trị có kiểu để gửi máy chủ; chỉ đổi định dạng, không tính toán */
  function typedValue(cell, rawText) {
    const s = String(rawText ?? '').trim();
    if (cell.kind === 'bool') return s === '1';
    if (cell.kind === 'enum' || cell.kind === 'choice') {
      const o = optionsOf(cell).find(x => String(x.value) === s);
      return o ? o.value : s;
    }
    if (cell.kind === 'brackets') return A.PxBrackets.typed(s);
    if (cell.kind === 'days') return s === '' ? [] : s.split(',').map(Number); // danh sách thứ trong tuần (0 = Chủ nhật)
    if (s === '') return null;
    if (cell.kind === 'list') return listNums(s).map(Number);
    if (cell.kind === 'num') {
      const p = parseNum(s);
      return cell.unit === 'ratio' ? Number((p / 100).toPrecision(12)) : p;
    }
    return s;
  }
  /* Chữ hiển thị của một giá trị trong ô (nhãn phương án, Có/Không, kèm đơn vị) */
  function showRaw(cell, rawText) {
    const s = String(rawText ?? '');
    if (cell.kind === 'bool') return s === '1' ? 'Có' : 'Không';
    if (cell.kind === 'enum' || cell.kind === 'choice') {
      const o = optionsOf(cell).find(x => String(x.value) === s);
      return o ? o.label || String(o.value) : s || '—';
    }
    if (cell.kind === 'brackets') return A.PxBrackets.summary(s);
    if (cell.kind === 'days') return A.dowsText(s === '' ? [] : s.split(',').map(Number));
    if (cell.kind === 'list')
      return s === ''
        ? 'Theo chức vụ'
        : listNums(s)
            .map(x => x + ' %')
            .join(', ');
    if (s === '') return 'Chưa đặt';
    return cell.kind === 'num' && UNIT_TXT[cell.unit] ? `${s} ${UNIT_TXT[cell.unit]}` : s;
  }
  const cellTitle = c => {
    if (c.title) return c.title; // ô của bảng quyền lợi theo chức vụ
    const e = PS.byId.get(c.eid);
    return [e ? e.label : c.eid, c.label].filter(Boolean).join(' · ');
  };
  function inputHtml(cell, { disabled, optionsDef } = {}) {
    const raw = cellRaw(cell);
    const common = `data-input="pxin" data-cell="${cell.id}" ${disabled ? 'disabled' : ''}`;
    const lab = `aria-label="${esc(cell.label || 'Giá trị')}"`;
    const bad = stateCls(cell, raw);
    if (cell.kind === 'bool')
      return `<select class="input sm${bad}" ${common} ${lab}><option value="1" ${raw === '1' ? 'selected' : ''}>Có</option><option value="0" ${raw === '0' ? 'selected' : ''}>Không</option></select>`;
    if (cell.kind === 'enum') {
      const opts = (optionsDef || cell.def.options || []).map(o =>
        typeof o === 'string' ? { value: o, label: o } : o
      );
      return `<select class="input sm${bad}" ${common} ${lab}>${opts.map(o => `<option value="${esc(o.value)}" ${String(o.value) === raw ? 'selected' : ''} ${o.available === false ? 'disabled' : ''}>${esc(o.label || o.value)}${o.available === false ? ' (chưa dùng được)' : ''}</option>`).join('')}</select>`;
    }
    if (cell.kind === 'date' || cell.kind === 'month')
      return `<input class="input sm${bad}" type="${cell.kind}" value="${esc(raw)}" ${common} ${lab}>`;
    if (cell.kind === 'text') return `<input class="input sm${bad}" type="text" value="${esc(raw)}" ${common} ${lab}>`;
    const suffix = UNIT_TXT[cell.unit] || '';
    return `<div class="px-unit"><input class="input sm num${bad}" inputmode="decimal" autocomplete="off" value="${esc(raw)}" ${common} ${lab}>${suffix ? `<span class="px-suffix" aria-hidden="true">${esc(suffix)}</span>` : ''}</div>`;
  }
  /* Thông báo của một mục: gom từ mọi ô của mục (cả giá trị hiện có, vì có mục mặc định đang dưới sàn luật) */
  /* Kiểm chéo (tổng các khoá phải bằng giá trị máy chủ) và thứ tự hàng; chữ thông báo là của máy chủ */
  function entryChecks(e, eid) {
    const out = [];
    const rules = e && e.rules;
    if (!rules) return out;
    const val = key => {
      const c = PS.cells.find(x => x.eid === eid && x.key === key);
      if (!c) return null;
      const p = parseNum(cellRaw(c));
      return p === null || Number.isNaN(p) ? null : p;
    };
    for (const cc of rules.crossChecks || []) {
      if (cc.kind !== 'sum' || !Array.isArray(cc.keys)) continue;
      const vals = cc.keys.map(val);
      if (vals.some(v => v === null)) continue;
      const total = vals.reduce((a, b) => a + b, 0);
      if (total !== cc.equals) out.push({ lv: 'warn', t: `${cc.message} (hiện đang là ${fmtNum(total)})` });
    }
    const rw = rules.rows;
    if (rw && rw.orderBy) {
      const seq = PS.cells
        .filter(c => c.eid === eid && c.key.endsWith(`.${rw.orderBy}`) && c.key.includes('#'))
        .map(c => parseNum(cellRaw(c)))
        .filter(v => v !== null && !Number.isNaN(v));
      const bad = seq.some((v, i) => i > 0 && (rw.order === 'increasing' ? v <= seq[i - 1] : v >= seq[i - 1]));
      if (bad) out.push({ lv: 'err', t: rw.message });
    }
    return out;
  }
  function msgsHtml(eid) {
    const groups = new Map();
    for (const c of PS.cells) {
      if (c.eid !== eid || c.readonly) continue;
      for (const x of check(c, cellRaw(c))) {
        const k = `${x.lv}|${x.t}|${x.note || ''}`;
        if (!groups.has(k)) groups.set(k, { ...x, labels: [] });
        if (c.label && !c.noPrefix) groups.get(k).labels.push(c.label);
      }
    }
    const ent = PS.byId.get(eid);
    for (const x of entryChecks(ent, eid)) {
      const k = `${x.lv}|${x.t}|`;
      if (!groups.has(k)) groups.set(k, { ...x, labels: [] });
    }
    if (!groups.size) return '';
    const who = ls =>
      ls.length > MSG_LABELS_MAX
        ? `${ls.slice(0, MSG_LABELS_MAX).join('; ')} và ${ls.length - MSG_LABELS_MAX} ô khác`
        : ls.join('; ');
    return `<ul class="px-msgs">${[...groups.values()]
      .map(
        x =>
          `<li class="${x.lv === 'err' ? 'warn' : 'px-warn'}" role="${x.lv === 'err' ? 'alert' : 'status'}">${ic(x.lv === 'err' ? 'alert' : 'info', 16)}<span>${x.labels.length ? `<b>${esc(who(x.labels))}:</b> ` : ''}${esc(x.t)}${x.note ? ` <span class="cap">(${esc(x.note)})</span>` : ''}${x.lv === 'warn' ? ' <span class="cap">Cảnh báo, vẫn lưu được.</span>' : ''}</span></li>`
      )
      .join('')}</ul>`;
  }
  const dirtyCount = () => dirtyCells().length + PS.attrDrafts.length;
  /* Số ô đang sửa mà còn lỗi cứng theo `rules` (cảnh báo mềm không chặn: cần xác nhận khi lưu) */
  function blockerCount() {
    let n = dirtyCells().filter(c => check(c, cellRaw(c)).some(x => x.lv === 'err')).length;
    for (const eid of new Set(PS.cells.filter(c => !c.readonly && isDirty(c)).map(c => c.eid)))
      n += entryChecks(PS.byId.get(eid), eid).filter(x => x.lv === 'err').length;
    return n;
  }

  /* ---------- bộ vẽ theo thành phần ---------- */

  /* Một giá trị đơn: mỗi instance một hàng (nhãn khi có nhiều instance) */
  function scalarBody(e) {
    const insts = (e.instances || []).filter(i => !orphanRule(i));
    if (!insts.length) return `<span class="cap">Chưa có giá trị trong registry.</span>`;
    const comp = e.ui.component;
    const multi = insts.length > 1;
    const editable = !isLocked(e);
    return `<div class="px-insts">${insts
      .map(inst => {
        const rules = inst.rules || e.rules || {}; // rules đầy đủ của đúng khoá này, thông báo đã mang nhãn instance
        const def = { ...e.ui, component: comp };
        const cell = newCell(e, inst.key, rules, def, inst.value, multi ? instLabel(e, inst) : '');
        cell.noPrefix = !!inst.rules;
        cell.readonly = !editable;
        if (comp === 'choice' || comp === 'toggle') {
          cell.kind = 'choice';
          cell.orig = String(inst.value ?? '');
        }
        const label = multi
          ? `<span class="px-ilabel">${esc(instLabel(e, inst).replace(/^\((.*)\)$/, '$1'))}</span>`
          : '';
        let control;
        if (!editable)
          control = `<span class="cfgval">${esc(comp === 'choice' || comp === 'toggle' ? (optLabel(rules, inst.value) ?? fmtVal(def.unit, inst.value)) : fmtVal(def.unit, inst.value))}</span>`;
        else if (comp === 'choice' || comp === 'toggle') control = optionsHtml(e, cell, inst, comp === 'toggle');
        else control = inputHtml(cell);
        const meta = [
          inst.status !== 'app' && inst.default !== undefined
            ? `<span class="cap">Mặc định: ${esc(optLabel(rules, inst.default) ?? fmtVal(def.unit, inst.default))}</span>`
            : '',
          inst.effectiveMonth
            ? `<span class="cap">Áp dụng từ tháng ${esc(A.monthLabel(inst.effectiveMonth).replace('tháng ', ''))}${inst.createdBy || inst.changedBy ? `, bởi ${esc(inst.createdBy || inst.changedBy)}` : ''}${inst.reason ? `. Lý do: ${esc(inst.reason)}` : ''}</span>`
            : ''
        ].join('');
        return `<div class="px-inst">${label}<div class="px-ctl">${control}</div>${meta ? `<div class="col" style="gap:2px">${meta}</div>` : ''}</div>`;
      })
      .join('')}</div>`;
  }
  /* choice, toggle: hiện mọi phương án; phương án available !== true bị làm mờ, ghi giai đoạn hoặc ghi chú */
  function optionsHtml(e, cell, inst, toggle) {
    const opts = (cell.rules && cell.rules.options) || [];
    const seg = toggle || (opts.length === 2 && opts.every(o => o.available === true)); // hai phương án dùng được: nút bấm đôi
    const raw = cellRaw(cell);
    const name = `px-r-${cell.id}`;
    const items = opts
      .map((o, n) => {
        const ok = o.available === true;
        const id = `${name}-${n}`;
        const note = ok ? '' : `${o.note || 'Chưa dùng được'}${o.phase ? ` · dự kiến ${o.phase}` : ''}`;
        const tip = ok ? '' : (cell.rules.messages && cell.rules.messages.optionUnavailable) || '';
        return `<label class="px-opt ${ok ? '' : 'off'} ${String(o.value) === raw ? 'on' : ''}" for="${id}" ${tip ? `title="${esc(tip)}"` : ''}><input id="${id}" type="radio" name="${name}" value="${esc(String(o.value))}" data-input="pxin" data-cell="${cell.id}" ${String(o.value) === raw ? 'checked' : ''} ${ok ? '' : 'disabled'}><span class="px-optt"><span>${esc(o.label)}</span>${note ? `<span class="cap">${esc(note)}</span>` : ''}</span></label>`;
      })
      .join('');
    return `<div class="px-opts ${seg ? 'seg' : ''}" role="radiogroup" aria-label="${esc(cell.label || e.label)}">${items}</div>`;
  }

  /* Bảng: matrix (loại × bậc…), list (có khoá hàng), intList, tierTable; cột có thành phần riêng */
  function cellInput(e, col, key, value, rules, label, readOnly) {
    const def = { ...col };
    const cell = newCell(e, key, rules, def, value, label);
    cell.kind =
      col.component === 'toggle'
        ? 'bool'
        : col.component === 'choice'
          ? 'enum'
          : col.component === 'text'
            ? 'text'
            : kindOfRules(rules, col.component);
    cell.orig = toRaw(cell, value);
    cell.readonly = readOnly;
    if (readOnly)
      return `<span class="num">${esc(col.component === 'toggle' ? fmtVal(null, value) : value === null || value === undefined ? '—' : fmtVal(cell.unit, value))}</span>`;
    return inputHtml(cell, { optionsDef: col.options });
  }
  const rowLabel = (tbl, row) =>
    (tbl.rowKeys || [])
      .map(rk => {
        const v = row[rk.key];
        const f = rk.values && rk.values.find(x => x.value === v);
        return f ? f.label : `${rk.label} ${v}`;
      })
      .join(' · ');
  function tableBody(e) {
    const tbl = e.ui.table || e.ui.display;
    const ro = isLocked(e) || e.class === 'fixed';
    if (e.valueType === 'dateList') return dateListBody(e);
    if (e.valueType === 'brackets') return A.PxBrackets.body(e, !ro); // biểu thuế lũy tiến: bảng bậc sửa được
    if (e.ui.planned && !(tbl && tbl.columns && tbl.columns.length))
      return `<div class="row wrap" style="gap:8px">${A.soonTag('Danh mục đang thiết kế')}<span class="cap">Mục này chưa có cột và ô nhập; sẽ có khi danh mục được chốt.</span></div>`;
    if (!tbl) return '';
    const cols = tbl.columns || [];
    /* Bảng dạng danh sách số (nightOptions): mỗi phần tử một ô */
    if (e.valueType === 'intList' && !ro) {
      const col = cols[0];
      const cells = (e.rows || []).map(
        r =>
          `<div class="px-lcell"><span class="lbl">${esc(col.label)} ${esc(r.index)}</span>${cellInput(e, col, `${e.keys[0]}#${r.index}`, r.value, e.rules, `${col.label} ${r.index}`, false)}</div>`
      );
      return `<div class="px-lgrid">${cells.join('')}</div>`;
    }
    if (e.ui.component === 'tierTable') {
      const base = (e.rows || []).map(r => r);
      const extra = PS.extraRows[e.id] || 0;
      const rows = base.concat(Array.from({ length: extra }, () => ({})));
      const rulesOf = c =>
        (e.rules && e.rules.columns && e.rules.columns[c.key]) || {
          type: 'number',
          unit: c.unit,
          nullable: false,
          messages: {}
        };
      const body = rows
        .map(
          (r, i) =>
            `<tr><td class="num">${i + 1}</td>${cols.map(c => `<td>${cellInput(e, c, `${e.id}#${i}.${c.key}`, r[c.key], rulesOf(c), `Bậc ${i + 1}, ${c.label}`, ro)}</td>`).join('')}</tr>`
        )
        .join('');
      return `<div class="tblwrap px-tbl"><table><thead><tr><th>Bậc</th>${cols.map(c => `<th>${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${body || `<tr><td colspan="${cols.length + 1}"><span class="cap">Bảng trống (mặc định của app: không giảm theo bậc).</span></td></tr>`}</tbody></table></div>${ro ? '' : `<div class="row wrap" style="gap:8px"><button type="button" class="btn sm" data-act="pxaddrow" data-id="${esc(e.id)}">${ic('plus', 14)}Thêm bậc để thử</button>${extra ? `<button type="button" class="btn sm ghost" data-act="pxdelrow" data-id="${esc(e.id)}">Bỏ bậc thử cuối</button>` : ''}</div>`}`;
    }
    /* Bảng khoá hàng (matrix, list): dựng từ e.value (hàng) hoặc e.rows và rules.columns */
    const rows =
      Array.isArray(e.value) && e.value.length && typeof e.value[0] === 'object' && !Array.isArray(e.value[0])
        ? e.value
        : e.rows || [];
    if (!rows.length || !cols.length) {
      if (e.valueType === 'dateList') return dateListBody(e);
      return `<span class="cap">Chưa có hàng nào.</span>`;
    }
    const drafts = e.id === LEVEL_TABLE_ID && !ro ? PS.attrDrafts : [];
    const head = `<tr><th>${esc((tbl.rowKeys || []).map(r => r.label).join(' · ') || '#')}</th>${cols.map(c => `<th>${esc(c.label)}${c.unit && UNIT_TXT[c.unit] ? ` <span class="cap">(${esc(UNIT_TXT[c.unit])})</span>` : ''}</th>`).join('')}${drafts.map(d => `<th>${esc(d.label)} ${A.pill('pending', 'Mới, chưa lưu')}</th>`).join('')}</tr>`;
    const attrNotes = cols
      .filter(c => c.attribute)
      .map(
        c =>
          `<span class="cap"><b>${esc(c.label)}</b> (mã <span class="mono">${esc(c.attribute.code)}</span>)${c.attribute.deprecated ? '. Đã ngừng dùng' : ''}.</span>`
      )
      .join('');
    const body = rows
      .map(r => {
        const label = rowLabel(tbl, r) || '';
        return `<tr><th scope="row" class="px-rh">${esc(label)}</th>${cols
          .map(c => {
            const key = r.keys && r.keys[c.key];
            const v = r[c.key];
            if (!key) return `<td><span class="cap">—</span></td>`;
            const rules = (e.rules && e.rules.columns && e.rules.columns[c.key]) || {
              type: c.component === 'money' ? 'vnd' : 'int',
              unit: c.unit,
              nullable: !!c.nullable,
              messages: {}
            };
            return `<td>${cellInput(e, c, key, v, rules, `${label}, ${c.label}`, ro)}</td>`;
          })
          .join('')}${drafts.map(d => `<td>${draftCell(e, d, r, label)}</td>`).join('')}</tr>`;
      })
      .join('');
    return `<div class="tblwrap px-tbl"><table><thead>${head}</thead><tbody>${body}</tbody></table></div>${attrNotes}${e.id === LEVEL_TABLE_ID && !ro ? attrBar() : ''}${tbl.rowRules ? `<span class="cap">${esc(tbl.rowRules)}</span>` : ''}${tbl.crossCheck ? `<span class="cap">Kiểm chéo (máy chủ quyết định): ${esc(tbl.crossCheck)}</span>` : ''}`;
  }
  /* Một ô của cột thuộc tính mới: khoá level.<loại>.<bậc>.attr.<mã>, điền sẵn giá trị mặc định */
  function draftCell(e, d, row, rowLabelText) {
    const key = `level.${row.type}.${row.level}.attr.${d.code}`;
    const col = { key: `attr.${d.code}`, label: d.label, component: d.component, unit: d.unit };
    const word = v => (v === undefined || v === null ? '' : fmtVal(d.unit, v));
    const rules = {
      key,
      type:
        d.component === 'money'
          ? 'vnd'
          : d.component === 'text'
            ? 'text'
            : d.component === 'toggle'
              ? 'bool'
              : 'number',
      unit: d.unit,
      nullable: true,
      ...(d.min !== undefined ? { min: d.min } : {}),
      ...(d.max !== undefined ? { max: d.max } : {}),
      messages: {
        type: `${d.label}: giá trị không hợp lệ`,
        min: `${d.label} không được nhỏ hơn ${word(d.min)}`,
        max: `${d.label} không được lớn hơn ${word(d.max)}`
      }
    };
    const html = cellInput(
      e,
      col,
      key,
      d.default === undefined ? (d.component === 'toggle' ? false : null) : d.default,
      rules,
      `${rowLabelText}, ${d.label}`,
      false
    );
    const cell = PS.meta.get(key);
    if (cell) cell.isNew = true;
    return html;
  }
  function attrBar() {
    const chips = PS.attrDrafts
      .map(
        d =>
          `<span class="pill p-pending">${esc(d.label)} <button type="button" class="link" data-act="pxattrdel" data-code="${esc(d.code)}" aria-label="Bỏ cột ${esc(d.label)}">Bỏ</button></span>`
      )
      .join('');
    return `<div class="row wrap" style="gap:8px;align-items:center"><button type="button" class="btn sm" data-act="pxattr">${ic('plus', 14)}Thêm thuộc tính</button>${chips}<span class="cap">Thêm một cột (ví dụ "Lương đóng BH") cho mọi bậc; điền giá trị từng bậc rồi lưu chung một lô.</span></div>`;
  }

  function dateListBody(e) {
    const v = Array.isArray(e.value) ? e.value : [];
    if (!v.length) return `<span class="cap">Chưa có ngày nào.</span>`;
    return `<div class="chips">${v
      .slice(0, DATE_LIST_SHOW)
      .map(d => `<span class="pill p-line">${esc(A.fmtDate(d))}</span>`)
      .join(
        ''
      )}${v.length > DATE_LIST_SHOW ? `<span class="cap">và ${esc(v.length - DATE_LIST_SHOW)} ngày khác</span>` : ''}</div>`;
  }

  /* fixed: chỉ đọc kèm lý do khoá; giá trị tuỳ kiểu (số, danh sách, bảng hiển thị) */
  function fixedBody(e) {
    const insts = e.instances || [];
    const disp = e.ui.display;
    if (disp && (e.rows || (Array.isArray(e.value) && e.value.length))) {
      const cols = disp.columns || [];
      const rows =
        Array.isArray(e.value) && e.value[0] && typeof e.value[0] === 'object' && !Array.isArray(e.value[0])
          ? e.value
          : e.rows || [];
      const head = `<tr><th>${esc((disp.rowKeys || []).map(r => r.label).join(' · '))}</th>${cols.map(c => `<th>${esc(c.label)}</th>`).join('')}</tr>`;
      const body = rows
        .map(
          r =>
            `<tr><th scope="row" class="px-rh">${esc(rowLabel(disp, r))}</th>${cols.map(c => `<td class="num">${esc(r[c.key] === null || r[c.key] === undefined ? '—' : fmtVal(c.unit, r[c.key]))}</td>`).join('')}</tr>`
        )
        .join('');
      return `<div class="tblwrap px-tbl"><table><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
    }
    if (!insts.length) return '';
    return `<div class="px-insts">${insts
      .map(
        i =>
          `<div class="px-inst">${insts.length > 1 ? `<span class="px-ilabel">${esc(instLabel(e, i))}</span>` : ''}<div class="px-ctl"><span class="cfgval">${esc(fmtAny(i.value))}</span></div></div>`
      )
      .join('')}</div>`;
  }

  function bodyFor(e) {
    if (e.class === 'removed') return `<span class="cap">Đã bỏ khỏi bản thiết kế.</span>`;
    const c = e.ui && e.ui.component;
    if (c === 'formula')
      return `<div class="row wrap" style="gap:8px"><span class="cap">Cách tính của khoản này nằm ở Cách tính lương.</span><button type="button" class="btn sm" data-act="cdsec" data-v="so-do">Mở Cách tính lương</button></div>`;
    if (c === 'conditions')
      return `<div class="row wrap" style="gap:8px">${A.soonTag('Chưa bật')}<span class="cap">Thành phần "điều kiện áp dụng" chưa bật.</span></div>`;
    if (c === 'fixed') return fixedBody(e);
    if (c === 'table' || c === 'tierTable') return tableBody(e);
    if (['money', 'percent', 'quantity', 'choice', 'toggle'].includes(c)) return scalarBody(e);
    return `<span class="cap">Thành phần "${esc(c)}" chưa có bộ vẽ.</span>`;
  }

  /* Một mục: bên trái tên, nhãn trạng thái (đã sửa / chưa xác nhận / đang thử), Hoàn tác, giải thích; bên phải ô nhập.
     Mục là bảng thì ô nhập nằm dưới, đủ bề ngang. compact = bản gọn dùng trong ngăn kéo Cách tính lương. */
  function entryHtml(e, compact = false) {
    const st = e.status && e.class !== 'fixed' && e.class !== 'removed' ? e.status : null;
    const backing =
      e.backing && e.backingSection
        ? [
            e.backingSection,
            (A.CaiDatSecLabel && A.CaiDatSecLabel(e.backingSection)) || e.backingSectionLabel || e.backingSection
          ]
        : null; // máy chủ chỉ mục nào sửa được thật
    const body = bodyFor(e);
    const wide = /^(table|tierTable|fixed)$/.test((e.ui && e.ui.component) || '') || !!backing;
    const helpText = e.ui && e.ui.help ? clean(e.ui.help) : '';
    const help = !helpText
      ? ''
      : helpText.length > HELP_INLINE_MAX
        ? `<details class="px-help"><summary class="cap">Giải thích chi tiết</summary><p class="cap">${esc(helpText)}</p></details>`
        : `<div class="ds">${esc(helpText)}</div>`;
    const noteBits = [
      e.wired === false && !e.readOnly
        ? `<span>${ic('lock', 12)} Đang khoá: mục này chưa nối vào bộ máy tính lương nên lưu ở đây chưa có tác dụng.</span>`
        : '',
      e.lockReason ? `<span>${ic('lock', 12)} Khoá vì: ${esc(clean(e.lockReason))}</span>` : '',
      e.phase && !isLocked(e) ? `<span>Ghi được từ: ${esc(e.phase)}</span>` : ''
    ].join('');
    const pills = [
      st === 'custom'
        ? `<span class="pill p-gold">${esc(WHO_TXT[e.editableBy] || 'Admin')} đã sửa</span>`
        : st === 'unset'
          ? A.pill('pending', 'Chưa xác nhận')
          : '',
      `<span class="pill p-draft px-dirty" id="px-d-${esc(domId(e.id))}" hidden>Đang thử giá trị khác</span>`
    ].join('');
    const undo =
      isLocked(e) || !PS.cells.some(c => c.eid === e.id && !c.readonly)
        ? ''
        : `<button type="button" class="link undo" data-act="pxreset" data-id="${esc(e.id)}">Hoàn tác</button>`;
    const left = `<div class="nm"><h3>${esc(e.label)}</h3>${pills}${undo}</div>${help}${noteBits ? `<div class="bs col" style="gap:2px">${noteBits}</div>` : ''}`;
    const right = `<div class="px-body">${body}</div><div id="px-m-${esc(domId(e.id))}" class="px-m">${msgsHtml(e.id)}</div>${backing ? `<div class="bs">Mục này sửa ở <b>${esc(backing[1])}</b>, không sửa ở đây. <button type="button" class="link" data-act="cdsec" data-v="${esc(backing[0])}">Mở ${esc(backing[1])}</button></div>` : ''}`;
    return `<article class="cfgitem px-entry cdx-it${wide ? ' wide' : ''}${compact ? ' px-compact' : ''}" id="px-e-${esc(domId(e.id))}" data-eid="${esc(e.id)}"><div class="l">${left}</div><div class="c">${right}</div></article>`;
  }

  /* ---------- danh sách cài đặt lần đầu (mở bằng nút "Xem N mục") ---------- */
  function firstRunHtml() {
    const fr = PS.fr;
    if (fr.state === 'fail') return `<section class="card">${A.errorBox(fr.error, false)}</section>`;
    if (fr.state !== 'ok' || !fr.items.length || !S.f.pxFrOpen) return '';
    const rows = fr.items
      .map(it => {
        const e = PS.byId.get(it.id);
        let cur;
        /* Máy chủ trả currentLabel bằng tiếng Việt thường ("Chỉ ngày lễ", "Chưa đặt"); không có thì tự dựng từ giá trị */
        if (typeof it.currentLabel === 'string' && it.currentLabel) cur = it.currentLabel;
        else if (e && e.instances && e.instances.length === 1) {
          const inst = e.instances[0];
          cur = optLabel(e.rules, inst.value) ?? fmtVal(e.ui && e.ui.unit, inst.value);
        } else cur = fmtAny(it.current);
        if (cur.length > FIRST_RUN_VALUE_MAX) cur = cur.slice(0, FIRST_RUN_VALUE_MAX) + '…';
        const name = K.frName(it, e);
        return `<tr><td data-label="Mục" class="wrapcell">${name}<div class="cap">${esc(it.groupLabel)}</div></td><td data-label="Đang dùng" class="wrapcell">${esc(cur)}</td><td data-label="Đề xuất" class="wrapcell">${esc(clean(it.recommended))}</td></tr>`;
      })
      .join('');
    return `<section class="card flush"><div class="card-h"><h2>Cài đặt lần đầu</h2><span class="cap">${esc(fr.total)} mục chờ bạn xác nhận · bấm tên mục để tới ô nhập</span></div><div class="tblwrap"><table class="rtable px-frtab"><thead><tr><th>Mục</th><th>Đang dùng</th><th>Đề xuất</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
  }
  A.actions.pxfr = () => {
    S.f.pxFrOpen = !S.f.pxFrOpen;
    A.render();
  };

  /* ---------- màn ---------- */
  function render() {
    return staleHtml() + renderMain();
  }
  function renderMain() {
    PS.cells = [];
    if (PS.state === 'idle' || PS.state === 'loading')
      return `<section class="card"><div class="skel" style="width:60%"></div><div class="skel" style="width:80%"></div><div class="skel" style="width:70%"></div></section>`;
    if (PS.state === 'fail') return `<section class="card">${A.errorBox(PS.error)}</section>`;
    const fr = PS.fr;
    /* Băng vàng "N mục cài đặt lần đầu" và nút mở danh sách */
    const first =
      fr.state === 'ok' && fr.total
        ? `<div class="cdx-first"><div class="note gold">${ic('spark', 16)}<span><b>${esc(fr.total)} mục cài đặt lần đầu</b> đang dùng giá trị mặc định của app, chưa ai xác nhận.</span></div><button type="button" class="btn sm" data-act="pxfr" aria-expanded="${!!S.f.pxFrOpen}">${S.f.pxFrOpen ? 'Ẩn danh sách' : `Xem ${esc(fr.total)} mục`}</button></div>`
        : PS.saveApi === 'yes'
          ? ''
          : A.note(saveIntro());
    const page = A.Khung.page();
    if (!page)
      return `${first}<section class="card">${A.empty('Danh mục tham số trống', 'Máy chủ không trả nhóm nào.')}</section>`;
    const query = (S.q.pxsearch || '').trim();
    const found = query ? searchEntries(query) : [];
    const loadingAll = query && PS.index.some(x => !PS.cache.has(x.id));
    const results = query
      ? found.length
        ? `<ul class="px-found">${found
            .slice(0, SEARCH_MAX)
            .map(
              e =>
                `<li><button type="button" class="link" data-act="pxopen" data-id="${esc(e.id)}" data-g="${esc(e.group)}">${esc(e.label)}</button> <span class="cap">${esc(A.Khung.pageTitleOf(e))}</span>${isSoon(e) ? ` ${A.pill('draft', 'sắp có')}` : ''}</li>`
            )
            .join(
              ''
            )}${found.length > SEARCH_MAX ? `<li class="cap">và ${esc(found.length - SEARCH_MAX)} mục khác, hãy gõ cụ thể hơn</li>` : ''}</ul>`
        : '<span class="cap">Không có cài đặt nào khớp.</span>'
      : '';
    const nav = `<section class="card flush" id="px-pages"><div class="card-h"><h2>Tất cả cài đặt</h2></div><div class="cdx-gl"><div class="field cdx-psrch"><label class="sr" for="px-search">Tìm theo tên cài đặt, ở mọi nhóm</label>${ic('search', 16)}<input id="px-search" class="input" type="search" placeholder="Tìm theo tên cài đặt, ở mọi nhóm" value="${esc(S.q.pxsearch || '')}" data-input="pxsearch"></div>${loadingAll ? '<span class="cap">Đang tải các nhóm còn lại để tìm cho đủ…</span>' : ''}${results}${page.strip}</div></section>`;
    const bar = `<div class="card-f cdx-save" id="px-bar">${barHtml()}</div>`;
    const top = A.Khung.top(page.id);
    if (!page.entries)
      return `${first}${firstRunHtml()}${nav}${top}<section class="card flush" aria-busy="true"><div class="card-h"><h2>${esc(page.title)}</h2></div><div class="cdx-pad"><div class="skel" style="width:60%"></div><div class="skel" style="width:80%"></div></div>${bar}</section>`;
    const live = page.entries.filter(e => e.class !== 'removed'); // mục class 'removed' không hiển thị
    const soonOpen =
      K.soonOpen.has(String(page.id)) || (!!query && found.some(e => A.Khung.pageOf(e) === page.id && isSoon(e)));
    const sec = A.PxKind.sections({
      shown: live,
      gid: page.id,
      soonOpen,
      entryHtml,
      bodyFor,
      domId,
      fmt: { optLabel, fmtVal, fmtAny, instLabel, max: FIRST_RUN_VALUE_MAX }
    });
    const main = `<section class="card flush cdx-page" id="px-main"><div class="card-h"><h2>${esc(page.title)}</h2></div>${sec.html}${bar}</section>`;
    return `${first}${firstRunHtml()}${nav}${top}${A.Khung.queue(page.id)}${main}`;
  }
  function barHtml() {
    const n = dirtyCount();
    const bad = n ? blockerCount() : 0;
    const api = PS.saveApi;
    const mine = new Set(dirtyCells());
    const here =
      PS.cells.filter(c => mine.has(c)).length +
      PS.attrDrafts.length +
      [...mine].filter(c => c.eid === 'khung' && !PS.cells.includes(c)).length; // ô của bảng quyền lợi luôn hiện trên trang
    const title = n
      ? `${api === 'yes' ? 'Đang sửa' : 'Đang thử'} ${n} giá trị${n > here ? ` (${n - here} ở trang khác)` : ''}`
      : 'Chưa có thay đổi';
    const note =
      api === 'no'
        ? 'Chưa lưu được: máy chủ chưa có chức năng lưu tham số. Không có gì được gửi về máy chủ.'
        : api === 'unknown'
          ? 'Đang kiểm tra máy chủ đã cho lưu chưa…'
          : bad
            ? `Còn ${bad} chỗ chưa hợp lệ, sửa trước khi lưu.`
            : '';
    const can = api === 'yes' && n > 0 && !bad;
    return `<span class="t">${n ? `<b>${esc(title)}</b>` : esc(title)}${note ? ` <span class="cap${bad ? ' errt' : ''}" aria-live="polite">${esc(note)}</span>` : ''}</span><span class="sp"></span><button type="button" class="btn sm" data-act="pxresetall" ${n ? '' : 'disabled'}>Huỷ</button><button type="button" class="btn sm pri" data-act="pxsave" ${can ? '' : 'disabled aria-disabled="true"'}>Xem trước và lưu</button>`;
  }
  function saveIntro() {
    if (PS.saveApi === 'yes')
      return 'Sửa từng mục bên dưới rồi bấm Xem trước và lưu: chọn tháng áp dụng, xem tác động lên từng người và ghi lý do.';
    if (PS.saveApi === 'no')
      return '<b>Chưa lưu được</b>: máy chủ chưa có chức năng lưu tham số. Ô nhập chỉ để thử, kiểm tra tại chỗ và không gửi gì về máy chủ.';
    return 'Đang kiểm tra máy chủ đã cho lưu chưa…';
  }
  /* Băng báo có thay đổi mới từ người khác (máy chủ báo qua sự kiện, hoặc lần lưu bị từ chối vì bản cũ) */
  function staleHtml() {
    if (!PS.stale) return '';
    const mine = dirtyCount();
    return `<section class="card"><div class="warn" role="alert">${ic('alert', 16)}<span><b>Có thay đổi mới từ người khác.</b> ${
      PS.staleLoaded
        ? `Đã tải lại giá trị mới.${mine ? ` ${mine} ô bạn đang sửa vẫn giữ nguyên: kiểm tra lại rồi lưu.` : ''}`
        : mine
          ? `Bạn đang sửa ${mine} ô nên màn chưa tự đổi. Bấm Tải giá trị mới để xem; ô bạn đang sửa vẫn giữ nguyên.`
          : 'Bấm Tải giá trị mới để xem.'
    }</span></div><div class="row wrap" style="gap:8px">${PS.staleLoaded ? '' : '<button type="button" class="btn sm pri" data-act="pxrefresh">Tải giá trị mới</button>'}<button type="button" class="btn sm" data-act="pxstaleok">${PS.staleLoaded ? 'Đã hiểu' : 'Bỏ qua'}</button></div></section>`;
  }

  /* Sau khi vẽ: cuộn tới mục được mở từ danh sách cài đặt lần đầu */
  function after() {
    if (!PS.focusId) return;
    const el = document.getElementById('px-e-' + domId(PS.focusId));
    PS.focusId = null;
    if (el) {
      el.scrollIntoView({ block: 'start' });
      el.classList.add('px-hit');
      setTimeout(() => el.classList.remove('px-hit'), 2500);
    }
  }

  /* ---------- thao tác ---------- */
  /* Tìm theo tên hoặc khoá, bỏ dấu và hoa thường, ở mọi nhóm (kể cả Nâng cao) */
  function searchEntries(q) {
    const want = A.fold(q);
    const out = [];
    for (const gr of PS.cache.values())
      for (const e of gr.entries) {
        if (e.ui && e.ui.component === 'formula') continue; // mục công thức gõ tay không tìm được
        const hay = A.fold(`${e.label} ${e.id} ${(e.keys || []).join(' ')}`);
        if (hay.includes(want)) out.push(e);
      }
    return out;
  }
  A.inputs.pxsearch = el => {
    S.q.pxsearch = el.value;
    A.render();
    /* Tìm ở mọi nhóm: lần gõ đầu mới tải các nhóm còn lại, từng nhóm một yêu cầu */
    if (el.value.trim() && !PS.allRequested) {
      PS.allRequested = true;
      Promise.all(PS.index.map(g => fetchGroup(g.id))).then(() => A.render());
    }
  };
  A.actions.pxopen = el => {
    const gid = Number(el.dataset.g);
    S.f.cfgGroup = gid;
    fetchGroup(gid).then(() => {
      const e = PS.byId.get(el.dataset.id) || {};
      A.Khung.setPage(A.Khung.pageOf(e));
      if (isSoon(e)) K.soonOpen.add(String(A.Khung.pageOf(e))); // mục trong "Sắp có": mở hộp
      PS.focusId = el.dataset.id;
      A.render();
    });
  };
  const entryCells = id => PS.cells.filter(c => c.eid === id);
  A.actions.pxreset = el => {
    for (const c of entryCells(el.dataset.id)) delete PS.vals[c.key];
    A.render();
  };
  A.actions.pxresetall = () => {
    PS.vals = {};
    PS.attrDrafts = [];
    A.render();
  };
  A.actions.pxaddrow = el => {
    PS.extraRows[el.dataset.id] = (PS.extraRows[el.dataset.id] || 0) + 1;
    A.render();
  };
  A.actions.pxdelrow = el => {
    const n = (PS.extraRows[el.dataset.id] || 0) - 1;
    for (const c of PS.cells)
      if (c.eid === el.dataset.id && c.key.startsWith(`${el.dataset.id}#${n}.`)) delete PS.vals[c.key];
    PS.extraRows[el.dataset.id] = Math.max(0, n);
    A.render();
  };
  /* Gõ hoặc chọn: lưu tại chỗ, kiểm lại và chỉ vẽ lại phần thông báo (không vẽ lại ô đang gõ) */
  A.inputs.pxin = el => {
    const cell = PS.cells[Number(el.dataset.cell)];
    if (!cell) return;
    PS.vals[cell.key] = el.value;
    if (el.type !== 'radio') {
      el.classList.remove('px-bad', 'px-wc');
      const s = stateCls(cell, el.value).trim();
      if (s) el.classList.add(s);
    }
    const safe = domId(cell.eid);
    const m = document.getElementById('px-m-' + safe);
    if (m) m.innerHTML = msgsHtml(cell.eid);
    const d = document.getElementById('px-d-' + safe);
    if (d) d.hidden = !entryCells(cell.eid).some(c => !c.readonly && isDirty(c));
    const bar = document.getElementById('px-bar');
    if (bar) bar.innerHTML = barHtml();
    if (A.SoDo && A.SoDo.refreshFoot) A.SoDo.refreshFoot(); // thanh dưới của ngăn kéo Cách tính lương
    if (cell.comp === 'choice' || cell.comp === 'toggle')
      document
        .querySelectorAll(`input[name="px-r-${cell.id}"]`)
        .forEach(r => r.closest('label').classList.toggle('on', r.checked));
  };

  /* ---------- lưu: xem trước, xác nhận cảnh báo, lý do, PUT ---------- */
  const SV = {
    items: [],
    month: '',
    touched: false,
    pv: { state: 'idle' },
    token: 0,
    onSaved: null,
    needBasis: false, // có khoá do Kế toán sửa (editableBy: accounting): bắt buộc ghi căn cứ
    rev: undefined
  };
  const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
  /* Tháng mặc định áp dụng: tháng mở sớm nhất chưa khoá của năm đang xem; không đọc được thì dùng tháng đang xem (máy chủ vẫn kiểm) */
  async function earliestOpenMonth() {
    try {
      const res = await A.api('GET', '/periods' + A.qs({ year: S.month.slice(0, 4) }));
      return (
        (res.periods || [])
          .filter(p => p.managed && p.status === 'open')
          .map(p => p.month)
          .sort()[0] || S.month
      );
    } catch {
      return S.month;
    }
  }
  const labelOfKey = key => {
    const it = SV.items.find(i => i.key === key);
    return it ? it.label : key;
  };
  /* Số tiền do máy chủ gửi (impact.people[].before = { gross, net }): chỉ định dạng, không tính */
  const moneyTxt = v => (typeof v === 'number' ? `${A.nf(v)} ₫` : v === null || v === undefined ? '—' : String(v));
  const diffTxt = v => (typeof v === 'number' && v > 0 ? `+${A.nf(v)} ₫` : moneyTxt(v));
  /* Câu báo lỗi của khoá: nguyên văn của máy chủ */
  const errMsg = x => A.nameCodes((x && x.message) || '');
  const part = (v, field) => (v && typeof v === 'object' ? v[field] : v);
  const blocking = () => {
    const d = SV.pv.data;
    return !!d && (d.ok === false || (d.errors || []).length > 0);
  };
  function syncConfirm() {
    const btn = document.querySelector('#ovl [data-dlg-btn="1"]');
    if (btn) btn.disabled = !(SV.pv.state === 'ok' && !blocking());
  }
  function impactHtml(impact, skipped) {
    if (!impact)
      return (skipped || []).length
        ? `<span class="cap">Giá trị bạn nhập trùng giá trị hiện hành nên không có gì để đổi.</span>`
        : '';
    const people = impact.people || [];
    const t = impact.totals || {};
    const head = `<h3>Tác động${impact.month ? ` cho ${esc(A.monthLabel(impact.month))}` : ''}</h3>`;
    const count =
      t.affected !== undefined
        ? `<span class="cap">${esc(A.nf(t.affected))} trong ${esc(A.nf(t.people))} người có số đổi.</span>`
        : '';
    const fails = (impact.errors || []).length
      ? `<div class="warn" role="alert">${ic('alert', 16)}<span>Không tính được cho ${esc(A.nf(impact.errors.length))} lượt: số bên dưới chưa đủ.</span></div>`
      : '';
    if (!people.length)
      return `<div class="col" style="gap:6px">${head}${count}${fails}<span class="cap">Thay đổi này không làm đổi số của ai.</span></div>`;
    const pair = (p, field) => `${esc(moneyTxt(part(p.before, field)))} → ${esc(moneyTxt(part(p.after, field)))}`;
    const rows = people
      .map(
        p =>
          `<tr><td class="wrapcell">${esc(p.name || p.username)}<div class="cap mono">${esc(p.username)}</div></td><td class="num r">${pair(p, 'gross')}</td><td class="num r">${pair(p, 'net')}</td><td class="num r">${esc(diffTxt(part(p.diff, 'net')))}</td></tr>`
      )
      .join('');
    const foot =
      t.before !== undefined && t.after !== undefined
        ? `<tfoot><tr><th>Tổng</th><th class="num r">${pair(t, 'gross')}</th><th class="num r">${pair(t, 'net')}</th><th class="num r">${esc(diffTxt(part(t.delta, 'net')))}</th></tr></tfoot>`
        : '';
    return `<div class="col" style="gap:8px">${head}${count}${fails}<div class="tblwrap sv-impact" style="margin:0 -24px"><table><thead><tr><th>Nhân sự</th><th class="r">Tổng thu nhập (trước → sau)</th><th class="r">Thực nhận (trước → sau)</th><th class="r">Chênh lệch thực nhận</th></tr></thead><tbody>${rows}</tbody>${foot}</table></div><span class="cap">Số theo dữ liệu hiện có, không phải lương chốt.</span></div>`;
  }
  function paintPreview() {
    const el = document.getElementById('sv-pv');
    if (!el) return;
    const pv = SV.pv;
    if (pv.state === 'loading') {
      el.innerHTML = `<div class="note" role="status" aria-busy="true">${ic('refresh', 16)}<span>Đang tính tác động…</span></div>`;
    } else if (pv.state === 'fail') {
      el.innerHTML = `<div class="warn" role="alert">${ic('alert', 16)}<span>${esc(pv.error)}</span></div>`;
    } else if (pv.state === 'ok') {
      const d = pv.data || {};
      const all = d.errors || [];
      const errs =
        all
          .slice(0, ERR_SHOW_MAX)
          .map(
            x =>
              `<li class="warn" role="alert">${ic('alert', 16)}<span><b>${esc(labelOfKey(x.key))}:</b> ${esc(errMsg(x))}</span></li>`
          )
          .join('') +
        (all.length > ERR_SHOW_MAX
          ? `<li class="cap">và ${esc(all.length - ERR_SHOW_MAX)} lỗi tương tự khác</li>`
          : '');
      /* Cảnh báo (sàn luật, kiểm chéo, tháng đã chốt…) hiện đủ ở đây, không bắt tích xác nhận */
      const warns = (d.warnings || [])
        .map(
          x =>
            `<li class="px-warn" role="status">${ic('info', 16)}<span><b>${esc(labelOfKey(x.key))}:</b> ${esc(x.message)}</span></li>`
        )
        .join('');
      const nW = (d.warnings || []).length;
      const wHead = nW
        ? `<span class="lbl">${A.nf(nW)} cảnh báo · đọc kỹ trước khi lưu (không chặn việc lưu)</span>`
        : '';
      el.innerHTML = `${wHead}${errs || warns ? `<ul class="px-msgs">${errs}${warns}</ul>` : ''}${d.ok === false && !errs ? `<div class="warn" role="alert">${ic('alert', 16)}<span>Máy chủ chưa chấp nhận các thay đổi này.</span></div>` : ''}${(d.info || []).map(x => `<div class="note" role="status">${ic('info', 16)}<span>${esc(x.message)}</span></div>`).join('')}${A.Khung.previewExtras(d, { moneyTxt, diffTxt })}${impactHtml(d.impact, d.skipped)}`;
    }
    syncConfirm();
  }
  /* paramsRev của ĐÚNG tháng hiệu lực (máy chủ so expectedRev theo tháng đó). Màn Tham số đang xem cùng tháng thì dùng số người dùng đã thấy;
     màn khác (ví dụ Công thức) hoặc tháng khác thì đọc ngay lúc xem trước. */
  async function revFor(month) {
    if (PS.env && PS.month === month && PS.state === 'ok') return PS.env.rev;
    try {
      return (await A.api('GET', '/settings/params' + A.qs({ month, group: 1 }))).paramsRev;
    } catch {
      return undefined; // máy chủ sẽ báo thiếu expectedRev
    }
  }
  async function runPreview() {
    const token = ++SV.token;
    SV.rev = undefined;
    revFor(SV.month).then(v => {
      if (token === SV.token) SV.rev = v;
    });
    SV.pv = { state: 'loading' };
    paintPreview();
    try {
      const scope = A.Khung.scopeOf(SV.items.map(i => i.key)); // một chức vụ duy nhất thì báo máy chủ để tách người trong và ngoài chức vụ
      const data = await A.api(
        'POST',
        '/settings/params/preview',
        {
          changes: SV.items.map(({ key, value }) => ({ key, value })),
          effectiveMonth: SV.month,
          ...(scope ? { scope } : {})
        },
        { warnings: 'manual' } // cảnh báo của bước xem trước hiện trong hộp này (paintPreview), không lặp ở thông báo góc
      );
      if (token !== SV.token) return;
      SV.pv = { state: 'ok', data };
    } catch (e) {
      if (token !== SV.token) return;
      /* 400 có danh sách lỗi theo khoá: hiện từng lỗi nguyên văn thay vì một câu chung */
      SV.pv =
        e.data && Array.isArray(e.data.errors) && e.data.errors.length
          ? { state: 'ok', data: { ok: false, errors: e.data.errors, warnings: e.data.warnings || [], impact: null } }
          : { state: 'fail', error: A.errText(e) };
    }
    paintPreview();
  }
  async function confirmSave(api) {
    const box = document.getElementById('sv-reason');
    const reason = (box ? box.value : '').trim();
    // lý do, căn cứ không bắt buộc, không bắt tích xác nhận cảnh báo
    if (!MONTH_RE.test(SV.month)) throw new Error('Chọn tháng áp dụng.');
    if (reason.length > REASON_MAX) {
      if (box) box.focus();
      throw new Error(`Lý do tối đa ${REASON_MAX} ký tự (hiện có ${reason.length}).`);
    }
    const warnings = (SV.pv.data && SV.pv.data.warnings) || [];
    const basisBox = document.getElementById('sv-basis');
    const basis = (basisBox ? basisBox.value : '').trim();
    if (SV.needBasis && basis.length > REASON_MAX) {
      if (basisBox) basisBox.focus();
      throw new Error(`Căn cứ (số văn bản, điều khoản) tối đa ${REASON_MAX} ký tự (hiện có ${basis.length}).`);
    }
    if (SV.rev === undefined) SV.rev = await revFor(SV.month);
    const sent = SV.items.length;
    try {
      const res = await A.api('PUT', '/settings/params', {
        changes: SV.items.map(({ key, value }) => ({ key, value })),
        effectiveMonth: SV.month,
        reason,
        ...(SV.needBasis ? { basis } : {}),
        expectedRev: SV.rev
      });
      PS.selfRev = res.paramsRev;
      PS.selfConfigRev = res.configRev;
      PS.selfAt = Date.now();
      A.levelNames.refresh(); // tên bậc có thể vừa đổi: các màn khác đọc lại
      const month = SV.month,
        done = SV.onSaved;
      api.close();
      /* PARAM_LATER_VERSION_EXISTS: khoá này còn một giá trị đặt từ tháng sau, giá trị đó vẫn ghi đè từ tháng đó */
      const later = (res.warnings || []).filter(w => w && w.code === 'PARAM_LATER_VERSION_EXISTS');
      A.toast(
        `Đã lưu ${(res.applied || res.saved || []).length || sent} thay đổi, áp dụng từ ${A.monthLabel(month)}${later.length ? `. Lưu ý: ${later.map(w => `${labelOfKey(w.key)} còn giá trị đặt từ ${A.monthLabel(w.laterEffectiveMonth)} sẽ ghi đè`).join('; ')}` : ''}`,
        later.length ? 'err' : undefined
      );
      if (done) await done(res);
      else {
        reset();
        await load();
        A.render();
      }
    } catch (e) {
      setTimeout(syncConfirm, 0); // nút bị mở lại khi hộp hết bận: khoá lại nếu còn lỗi
      if (e.status === 409 && e.data && e.data.code === 'PARAMS_STALE') {
        api.close();
        PS.stale = true;
        PS.staleLoaded = true;
        await refreshKeep();
        A.toast('Có thay đổi mới từ người khác', 'err');
        return;
      }
      if (e.data && Array.isArray(e.data.errors) && e.data.errors.length) {
        SV.pv = { state: 'ok', data: { ok: false, errors: e.data.errors, warnings: warnings, impact: null } };
        paintPreview();
        throw new Error(e.data.errors.map(errMsg).join(' · '));
      }
      if (e.data && Array.isArray(e.data.warnings) && e.data.warnings.length && SV.pv.data) {
        SV.pv.data.warnings = e.data.warnings;
        paintPreview();
      }
      throw e;
    }
  }
  /* items: [{ key, value, label, before, after }] (before, after là chữ hiển thị). Dùng chung cho tham số và công thức. */
  async function openSave(items, opts = {}) {
    if (!items || !items.length) return;
    Object.assign(SV, {
      items,
      month: S.month,
      touched: false,
      pv: { state: 'loading' },
      onSaved: opts.onSaved || null,
      needBasis: items.some(i => {
        const c = PS.meta.get(i.key);
        const e = c && PS.byId.get(c.eid);
        return !!e && e.editableBy === 'accounting';
      })
    });
    const token = ++SV.token;
    const list =
      items
        .slice(0, SAVE_LIST_MAX)
        .map(it => `<li><b>${esc(it.label)}</b>: ${esc(it.before)} → ${esc(it.after)}</li>`)
        .join('') +
      (items.length > SAVE_LIST_MAX ? `<li class="cap">và ${items.length - SAVE_LIST_MAX} thay đổi khác</li>` : '');
    A.openDialog({
      title: 'Xem trước và lưu',
      sub: `${items.length} thay đổi`,
      wide: true,
      body: `<div class="formrow"><label class="lbl" for="sv-month">Áp dụng từ tháng</label><input id="sv-month" class="input" type="month" value="${esc(SV.month)}" data-input="svmonth" style="max-width:220px"><span class="cap">Mặc định là tháng mở sớm nhất chưa khoá. Chọn tháng đã chốt công vẫn lưu được, kèm cảnh báo cần tính lại.</span></div>
<div class="col" style="gap:6px"><span class="lbl">Thay đổi</span><ul class="sv-list">${list}</ul></div>
<div id="sv-pv" aria-live="polite"></div>
${SV.needBasis ? `<div class="formrow"><label class="lbl" for="sv-basis">Căn cứ (không bắt buộc: số văn bản, điều khoản)</label><textarea id="sv-basis" class="input" maxlength="${REASON_MAX}" placeholder="Ví dụ: văn bản, điều, khoản làm căn cứ"></textarea></div>` : ''}<div class="formrow"><label class="lbl" for="sv-reason">Lý do (không bắt buộc)</label><textarea id="sv-reason" class="input" maxlength="${REASON_MAX}" data-input="svreason" placeholder="Ghi rõ lý do để lưu vào nhật ký"></textarea><span class="cap" id="sv-reason-cap">0/${REASON_MAX}</span></div>`,
      foot: [{ label: 'Huỷ' }, { label: 'Lưu thay đổi', cls: 'pri', disabled: true, onClick: confirmSave }]
    });
    paintPreview();
    const m = await earliestOpenMonth();
    if (token !== SV.token || !document.getElementById('sv-pv')) return;
    if (!SV.touched) {
      SV.month = m;
      const inp = document.getElementById('sv-month');
      if (inp) inp.value = m;
    }
    runPreview();
  }
  A.inputs.svmonth = el => {
    if (!MONTH_RE.test(el.value)) return;
    SV.month = el.value;
    SV.touched = true;
    runPreview();
  };
  A.inputs.svreason = el => {
    const cap = document.getElementById('sv-reason-cap');
    if (cap) cap.textContent = `${el.value.trim().length}/${REASON_MAX}`;
  };
  A.actions.pxsave = () => {
    if (PS.saveApi !== 'yes') return;
    const defs = PS.attrDrafts.map(d => ({
      key: ATTR_DEF_KEY + d.code,
      value: A.PxAttr.defValue(d),
      label: `Thuộc tính mới "${d.label}" của level`,
      before: 'Chưa có',
      after: A.PxAttr.summary(d)
    }));
    const vals = dirtyCells()
      .map(c => ({ c, value: typedValue(c, cellRaw(c)) }))
      .filter(x => !(x.c.isNew && x.value === null)) // ô mới để trống thì không ghi giá trị
      .map(({ c, value }) => ({
        key: c.key,
        value,
        label: cellTitle(c),
        before: c.isNew ? 'Chưa có' : showRaw(c, c.orig),
        after: showRaw(c, cellRaw(c))
      }));
    openSave([...defs, ...vals]);
  };

  /* ---------- thay đổi mới từ người khác ---------- */
  /* Tải lại mọi nhóm đang có ô sửa dở, giữ nguyên giá trị người dùng đang gõ; ô nào trùng giá trị mới thì tự hết "đang sửa" */
  async function refreshKeep() {
    const gids = new Set(dirtyCells().map(c => c.gid));
    gids.add(Number(S.f.cfgGroup) || 1);
    const keepVals = PS.vals,
      keepRows = PS.extraRows;
    clearStore();
    PS.meta = new Map();
    PS.allRequested = false;
    PS.state = 'idle';
    await load();
    await Promise.all([...gids].map(fetchGroup));
    PS.vals = keepVals;
    PS.extraRows = keepRows;
    for (const gid of gids) {
      const g = PS.cache.get(gid);
      if (g) {
        PS.cells = [];
        g.entries.forEach(entryHtml); // chỉ để dựng lại bảng ô; kết quả HTML bỏ đi
      }
    }
    A.render();
  }
  A.actions.pxrefresh = async () => {
    PS.stale = true;
    PS.staleLoaded = true;
    await refreshKeep();
  };
  A.actions.pxstaleok = () => {
    PS.stale = false;
    PS.staleLoaded = false;
    A.render();
  };
  /* Sự kiện params.changed từ máy chủ */
  function remoteChanged(payload) {
    if (PS.state === 'idle' && !PS.cache.size) return; // chưa mở màn này lần nào: lần mở sau sẽ tải mới
    if (
      Date.now() - PS.selfAt < SELF_EVENT_MS ||
      (payload && payload.paramsRev !== undefined && payload.paramsRev === PS.selfRev) ||
      (payload && payload.configRev !== undefined && payload.configRev === PS.selfConfigRev)
    )
      return; // chính mình vừa lưu
    const onScreen = S.view === 'cai-dat' && ['so-do', 'quyen-loi'].includes(S.sub['cai-dat'] || 'so-do');
    if (dirtyCount()) {
      PS.stale = true;
      PS.staleLoaded = false;
      if (onScreen) A.render();
      return;
    }
    reset();
    if (onScreen) A.loadView('cai-dat');
  }
  /* Mở đúng mục (từ liên kết ở màn khác): cần đã load() */
  function open(id, gid) {
    S.f.cfgGroup = gid;
    fetchGroup(gid).then(() => {
      const e = PS.byId.get(id);
      if (e) A.Khung.setPage(A.Khung.pageOf(e));
      PS.focusId = id;
      A.render();
    });
  }

  /* Dùng chung với view-khung-luong.js (sơ đồ khung, bảng quyền lợi): cùng kho giá trị đang sửa (PS.vals) và cùng nút Xem trước và lưu */
  function fieldCell(spec) {
    const hit = PS.meta.get(spec.key);
    if (hit) return hit;
    const comp = spec.comp;
    const cell = {
      id: 'mx:' + spec.key,
      eid: spec.eid || 'khung',
      key: spec.key,
      rules: spec.rules || {},
      label: spec.label || '',
      title: spec.title || spec.label || '',
      unit: spec.unit || (spec.rules && spec.rules.unit) || null,
      comp,
      gid: spec.gid || 0,
      def: { component: comp, unit: spec.unit, options: spec.options },
      orig: ''
    };
    cell.kind =
      comp === 'brackets'
        ? 'brackets'
        : comp === 'toggle'
          ? 'bool'
          : comp === 'choice'
            ? 'enum'
            : comp === 'days'
              ? 'days'
              : comp === 'list'
                ? 'list'
                : comp === 'text'
                  ? 'text'
                  : kindOfRules(cell.rules, comp);
    cell.orig = toRaw(cell, spec.value);
    PS.meta.set(spec.key, cell);
    return cell;
  }
  const refreshBar = () => {
    const bar = document.getElementById('px-bar');
    if (bar) bar.innerHTML = barHtml();
  };
  const allEntries = () => {
    const out = [];
    for (const g of PS.cache.values()) out.push(...g.entries);
    return out;
  };
  A.PxKit = {
    PS,
    entryHtml,
    bodyFor,
    barHtml,
    dirtyCount,
    blockerCount,
    resetCells: () => {
      PS.cells = [];
    },
    allEntries,
    searchEntries,
    typedValue,
    K,
    fieldCell,
    cellRaw,
    isDirty,
    check,
    stateCls,
    showRaw,
    fmtVal,
    refreshBar,
    earliestOpenMonth,
    parseNum,
    missingRoute,
    LEVEL_TABLE_ID,
    ATTR_DEF_KEY,
    isAdvancedGroup: gid => ADVANCED_GROUPS.includes(gid),
    unitTxt: u => UNIT_TXT[u] || '',
    load: () => load(),
    fetchGroup
  };

  A.drafts.register('params', dirtyCount, ['month', 'params']);

  A.Params = {
    render,
    load,
    reset,
    after,
    open,
    openSave,
    remoteChanged,
    probe: probeSave,
    onSaveApi: fn => saveListeners.add(fn),
    get saveApi() {
      return PS.saveApi;
    }
  };
})(window.Admin);
