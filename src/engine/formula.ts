(function (root: any, factory: any) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Formula = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // Công thức gõ bằng tiếng Việt, phân tích theo QUY TẮC CỐ ĐỊNH (không phải mô hình ngôn ngữ), dựng thành CÂY.
  //
  // Mô-đun thuần dùng chung trình duyệt (window.Formula) và máy chủ (require): không DOM, không DB, không đồng hồ, không mạng.
  // Chữ của Admin chỉ đi vào bộ tách từ và bộ phân tích có văn phạm đóng; chữ bị bỏ sau khi dựng cây. Bộ tính chỉ đi qua các nút
  // trong danh sách đóng (8 lớp). Mô-đun này KHÔNG chạy chữ như mã, KHÔNG dựng biểu thức chính quy từ từ vựng, KHÔNG tải mã động.
  //
  // Cái được lưu là CÂY (serialize), không phải chữ; chữ đọc lại được sinh ra từ cây (describe) và đọc lại ra đúng cây đó.
  // Mô-đun này không lưu gì và không ghi vào bảng lương: nó chỉ phân tích, kiểm, đọc lại và tính cây.
  //
  // Trả lời chỗ mơ hồ: parse(text, { vocabulary, choices }) với choices là { '<đầu>:<cuối>': khoá } (vị trí trong chữ gốc, đúng
  // như `at` của câu hỏi), hoặc { '@<đầu>': khoá }, hoặc { '<chữ đã bỏ dấu của câu hỏi (phrase)>': khoá } để trả lời mọi chỗ cùng chữ.
  // Với số mơ hồ như '1.5' khoá là chữ đã chọn ('1,5' hoặc '1.500') hoặc một con số.
  //
  // Số Admin gõ khác 0 và 1 (kể cả '15%', '500.000 đồng') không nằm trong cây dưới dạng số viết thẳng: chúng thành nút `param`
  // với khoá tự sinh `formula.<tên>.const.<n>` mang `value` (và `unit`: 'percent' | 'VND' | 'hour' | 'day' | 'minute') đề xuất,
  // được liệt kê trong kết quả phân tích ở `newParameters` (cũng là `constants`) để màn hình báo cho Admin. Khi tính, ctx.parameters
  // (nếu có khoá đó) thắng giá trị mang theo trong nút. Số 0 và 1 trần là nút `lit`.
  // Nút gán vế trái nằm ở `tree.target` (khoá công thức, hoặc tên mới) và ở trường `name` của bản lưu.
  //
  // PARSE_UNKNOWN_WORD: `at` là chữ lạ; `suggestions` (nhãn), `suggestionKeys` (khoá) và `suggestionReplace` (khoảng chữ mỗi gợi ý thay
  // vào, cùng thứ tự; có thể rộng hơn `at` khi gợi ý ăn khớp cả nhãn quen liền kề, ví dụ 'thưởng chuyên cần' → thay cả cụm) cùng độ dài;
  // `replace` là khoảng của gợi ý đầu tiên (hoặc `at` nếu không có gợi ý).
  // Đơn vị 'flag' trong từ vựng = cờ đúng/sai: chỉ dùng làm điều kiện (nếu, và, hoặc, không), không cộng trừ được. 'count' là số đếm thật
  // (một count cũng dùng được làm điều kiện).
  // validate trả thêm `units`: { <path của nút>: nhãn đơn vị } với path cùng dạng như `path` của lỗi ('cây', 'cây.a', 'cây.a.b', 'cây.args[0]', 'cây.if', 'cây.then', 'cây.else', 'cây.arg'); nhãn là
  // 'VND' | 'hour' | 'day' | 'VND/day' … | 'ratio' | 'count' | 'any' (0, 1, hằng chưa gắn đơn vị) | 'flag'; nút chưa xác định bị bỏ qua.
  //
  // API:
  //   parse(text, { vocabulary, formulas?, choices?, limits? }) → { ok, tree?, target, errors, questions, constants }
  //   validate(tree, { vocabulary, formulas?, target?, limits? }) → { ok, errors, unit }
  //   describe(tree, vocabulary) → câu tiếng Việt (đọc lại được)
  //   evaluate(tree, ctx) → số        ctx: { vars|variables, params|parameters, builtins|functions, formulas }
  //   serialize(tree) → đối tượng JSON {v, name?, root, nodes}; deserialize(json|chuỗi) → cây (ném FormulaError nếu hỏng)
  //   dependencies(tree) → [khoá] theo thứ tự xuất hiện

  // ---------------------------------------------------------------------------------------------------------------------
  // Hằng số KỸ THUẬT (không phải số nghiệp vụ). Nơi gọi có thể ghi đè bằng opts.limits.
  // ---------------------------------------------------------------------------------------------------------------------
  const LIMITS = Object.freeze({
    maxNodes: 200, // số nút tối đa của một cây
    maxDepth: 12, // số tầng tối đa của một cây; chuỗi cùng cấp (+ −, × ÷) tính một tầng, ngoặc không tính
    maxTextChars: 2000, // độ dài chữ tối đa
    maxTierRows: 10, // số hàng tối đa của bảng bậc
    maxTokens: 800, // số từ tố tối đa (chặn chữ cố tình làm chậm)
    maxNesting: 48, // độ lồng tối đa khi phân tích (ngoặc, dấu trừ một ngôi, không)
    maxNameChars: 80, // độ dài tên công thức, khoá, tên tham chiếu
    maxIdChars: 16, // độ dài mã nút khi lưu
    maxLiteral: 1e15, // số lớn nhất gõ vào được
    maxDayLoop: 366, // số ngày tối đa của một lần "tổng theo ngày"
    maxEvalDepth: 256, // độ sâu đệ quy tối đa của bộ tính (kể cả đi qua công thức có tên)
    maxJsonChars: 200000, // độ dài tối đa của bản lưu dạng chuỗi
    maxErrors: 20, // số lỗi tối đa trả về khi phân tích
    maxPhraseWords: 8, // số từ tối đa của một nhãn
    maxSuggestions: 3, // số gợi ý tối đa cho chữ lạ
    maxSuggestRuns: 10, // chỉ tính gợi ý cho từng đó chỗ chữ lạ đầu tiên
    suggestMaxRatio: 0.6, // khoảng cách chỉnh sửa tương đối tối đa để còn gợi ý
    suggestOverlapWeight: 0.3, // trọng số của từ trùng khi xếp hạng gợi ý
    suggestWordMinLen: 3, // từ ngắn hơn thế phải khớp đúng mới tính là trùng
    maxEditChars: 64 // cắt chữ khi tính khoảng cách chỉnh sửa
  });

  // Thành phần bắt buộc mặc định, theo khoá của công thức vế trái (tổng thu nhập phải gồm đủ sáu thành phần
  // ngày). Từ vựng có thể ghi đè bằng trường `required` (danh sách khoá) của mục công thức. Khoá không có trong từ vựng thì bỏ qua.
  const DEFAULT_REQUIRED = Object.freeze({
    tongThuNhap: Object.freeze(['tienNgayCong', 'phuCapCa', 'gioNghiDem', 'lamBu', 'tienOt', 'tienLamLe'])
  });

  const FORMAT_VERSION = 1;
  const KINDS = Object.freeze(['variable', 'parameter', 'formula', 'builtin']);
  const DOMAINS = Object.freeze(['month', 'day', 'person']);

  // ---------------------------------------------------------------------------------------------------------------------
  // Tiện ích chung
  // ---------------------------------------------------------------------------------------------------------------------
  const hasOwn = (o?, k?) => Object.prototype.hasOwnProperty.call(o, k);
  const isObj = (v?) => typeof v === 'object' && v !== null && !Array.isArray(v);
  const isNum = (v?) => typeof v === 'number' && Number.isFinite(v);

  class FormulaError extends Error {
    name: any;
    code: any;

    constructor(code?, message?, extra?) {
      super(message);
      this.name = 'FormulaError';
      this.code = code;
      if (extra) for (const k of Object.keys(extra)) if (k !== 'name' && k !== 'message') this[k] = extra[k];
    }
  }

  function limitsOf(opts?) {
    const given = opts && isObj(opts.limits) ? opts.limits : null;
    if (!given) return LIMITS;
    const out: Record<string, any> = { ...LIMITS };
    for (const k of Object.keys(LIMITS)) if (hasOwn(given, k) && isNum(given[k]) && given[k] > 0) out[k] = given[k];
    return out;
  }

  // Bỏ dấu và hoa thường: "Lương Cơ Bản" và "luong co ban" cùng một chuỗi. Chỉ dùng để SO KHỚP, không đổi chữ gốc.
  const fold = (s?) =>
    String(s)
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}+/gu, '')
      .replace(/đ/g, 'd');

  const RE_LETTER = /\p{L}/u;
  const RE_WORD_CH = /[\p{L}\p{M}\p{N}_]/u;
  const RE_SPACE = /\s/;
  const RE_WORDS = /[\p{L}\p{M}\p{N}_]+/gu;
  const isDigit = (ch?) => ch !== undefined && ch >= '0' && ch <= '9';
  const isLetter = (ch?) => ch !== undefined && RE_LETTER.test(ch);
  const isWordCh = (ch?) => ch !== undefined && RE_WORD_CH.test(ch);
  const isSpace = (ch?) => ch !== undefined && RE_SPACE.test(ch);

  function wordsOf(text?) {
    const out: any[] = [];
    RE_WORDS.lastIndex = 0;
    let m = RE_WORDS.exec(text);
    while (m) {
      out.push({ s: m.index, e: m.index + m[0].length, f: fold(m[0]) });
      m = RE_WORDS.exec(text);
    }
    return out;
  }

  function levenshtein(a?, b?, cap?) {
    a = a.slice(0, cap);
    b = b.slice(0, cap);
    const m = a.length,
      n = b.length;
    if (!m) return n;
    if (!n) return m;
    let prev = new Array(n + 1);
    for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      }
      prev = cur;
    }
    return prev[n];
  }

  // Số kiểu Việt Nam: 1.234,5 (chấm ngăn nghìn, phẩy thập phân)
  function fmtNum(v?) {
    let s = String(Number(v.toPrecision(15)));
    if (/e/i.test(s)) s = v.toFixed(12).replace(/0+$/, '').replace(/\.$/, '');
    const parts = s.split('.');
    const grouped = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return parts[1] ? `${grouped},${parts[1]}` : grouped;
  }

  // Khoá viết liền từ tên: "khoản mới" → "khoanMoi" (dùng cho khoá tham số tự sinh)
  function slugKey(text?) {
    const ws = wordsOf(String(text)).map(w => w.f.replace(/[^a-z0-9_]/g, ''));
    const parts = ws.filter(Boolean);
    if (!parts.length) return 'x';
    return parts.map((w, i) => (i ? w[0].toUpperCase() + w.slice(1) : w)).join('');
  }

  const RE_KEY = /^[A-Za-z0-9_.<>-]+$/;
  const RE_PLACEHOLDER = /<([A-Za-z0-9_]+)>/g;
  const RE_NAME = /^[^\u0000-\u001f\u007f]+$/;
  const RE_CONST_KEY = /^formula\.[A-Za-z0-9_]+\.const\.[0-9]+$/;
  const isKey = (s?, lim?) => typeof s === 'string' && s.length > 0 && s.length <= lim.maxNameChars && RE_KEY.test(s);
  const isName = (s?, lim?) => typeof s === 'string' && s.length > 0 && s.length <= lim.maxNameChars && RE_NAME.test(s);
  const isConstKey = (s?) => typeof s === 'string' && RE_CONST_KEY.test(s);

  // ---------------------------------------------------------------------------------------------------------------------
  // Đơn vị: vector số mũ trên các đơn vị gốc. tỷ lệ, phần trăm và "số đếm" không có chiều (dims rỗng).
  // ---------------------------------------------------------------------------------------------------------------------
  const BASE_UNITS = Object.freeze(['VND', 'hour', 'day', 'minute', 'point']);
  const UNIT_VN = Object.freeze({ VND: 'tiền (₫)', hour: 'giờ', day: 'ngày', minute: 'phút', point: 'điểm' });
  // Đơn vị đi kèm số gõ vào ("500.000 đồng", "8 giờ"), theo chữ đã bỏ dấu
  const NUMBER_SUFFIX = Object.freeze({ dong: 'VND', vnd: 'VND', gio: 'hour', h: 'hour', ngay: 'day', phut: 'minute' });
  const CONST_UNITS = Object.freeze(['VND', 'hour', 'day', 'minute', 'percent']);
  const UNIT_WORD = Object.freeze({ VND: 'đồng', hour: 'giờ', day: 'ngày', minute: 'phút' });

  function unitInfo(unit?) {
    if (unit === 'flag') return { dims: {}, bool: true, cnt: true };
    if (typeof unit !== 'string' || !unit) return null;
    if (unit === 'percent' || unit === 'ratio') return { dims: {} };
    if (unit === 'count') return { dims: {}, cnt: true };
    const parts = unit.split('/');
    if (parts.length > 2) return null;
    const dims: Record<string, any> = {};
    for (let i = 0; i < parts.length; i++) {
      for (const name of parts[i].split('*')) {
        if (!BASE_UNITS.includes(name)) return null;
        dims[name] = (dims[name] || 0) + (i === 0 ? 1 : -1);
      }
    }
    for (const k of Object.keys(dims)) if (dims[k] === 0) delete dims[k];
    return { dims };
  }

  function dimsEq(a?, b?) {
    const ka = Object.keys(a),
      kb = Object.keys(b);
    return ka.length === kb.length && ka.every(k => b[k] === a[k]);
  }
  function dimsOp(a?, b?, sign?) {
    const out: Record<string, any> = { ...a };
    for (const k of Object.keys(b)) {
      out[k] = (out[k] || 0) + sign * b[k];
      if (out[k] === 0) delete out[k];
    }
    return out;
  }
  function unitText(dims?) {
    const keys = Object.keys(dims).sort();
    if (!keys.length) return 'số không đơn vị';
    const num = keys.filter(k => dims[k] > 0).map(k => (dims[k] > 1 ? `${UNIT_VN[k]}^${dims[k]}` : UNIT_VN[k]));
    const den = keys.filter(k => dims[k] < 0).map(k => (dims[k] < -1 ? `${UNIT_VN[k]}^${-dims[k]}` : UNIT_VN[k]));
    return (num.length ? num.join('×') : '1') + (den.length ? `/${den.join('×')}` : '');
  }
  function unitName(dims?) {
    const keys = Object.keys(dims).sort();
    if (!keys.length) return 'ratio';
    const num = keys.filter(k => dims[k] > 0).map(k => (dims[k] > 1 ? `${k}^${dims[k]}` : k));
    const den = keys.filter(k => dims[k] < 0).map(k => (dims[k] < -1 ? `${k}^${-dims[k]}` : k));
    return (num.length ? num.join('*') : '1') + (den.length ? `/${den.join('*')}` : '');
  }

  // Kiểu của một nút khi kiểm: số có đơn vị, số "đa năng" (0, 1 và hằng chưa gắn đơn vị: nhận đơn vị của bên kia),
  // điều kiện đúng/sai, hoặc chưa biết (đã báo lỗi nên không báo dây chuyền).
  const T_ANY = Object.freeze({ any: true, dims: {} });
  const T_BOOL = Object.freeze({ bool: true, dims: {} });
  const T_UNKNOWN = Object.freeze({ unknown: true, dims: {} });
  const tNum = (dims?, cnt?) => ({ dims, cnt: Boolean(cnt) });

  // ---------------------------------------------------------------------------------------------------------------------
  // Từ vựng
  // ---------------------------------------------------------------------------------------------------------------------
  // Từ khoá cấu trúc (đã bỏ dấu). Khớp dài nhất trước; khi bằng nhau thì từ khoá thắng nhãn.
  const KEYWORDS = new Map<any, any>();
  let KW_MAX_WORDS = 1;
  [
    ['nếu', { k: 'if' }],
    ['thì', { k: 'then' }],
    ['ngược lại', { k: 'else' }],
    ['và', { k: 'and' }],
    ['hoặc', { k: 'or' }],
    ['không', { k: 'not' }],
    ['cộng', { k: 'op', v: 'add' }],
    ['trừ', { k: 'op', v: 'sub' }],
    ['nhân', { k: 'op', v: 'mul' }],
    ['nhân với', { k: 'op', v: 'mul' }],
    ['chia', { k: 'op', v: 'div' }],
    ['chia cho', { k: 'op', v: 'div' }],
    ['x', { k: 'op', v: 'mul', x: true }],
    ['lớn hơn hoặc bằng', { k: 'cmp', v: 'gte' }],
    ['lớn hơn', { k: 'cmp', v: 'gt' }],
    ['nhỏ hơn hoặc bằng', { k: 'cmp', v: 'lte' }],
    ['nhỏ hơn', { k: 'cmp', v: 'lt' }],
    ['dưới', { k: 'cmp', v: 'lt' }],
    ['không quá', { k: 'cmp', v: 'lte' }],
    ['bằng', { k: 'cmp', v: 'eq' }],
    ['từ', { k: 'from' }],
    ['trở lên', { k: 'upto' }],
    ['nhỏ nhất của', { k: 'fn', v: 'min' }],
    ['min', { k: 'fn', v: 'min' }],
    ['lớn nhất của', { k: 'fn', v: 'max' }],
    ['max', { k: 'fn', v: 'max' }],
    ['tổng theo ngày', { k: 'fn', v: 'sumDays' }],
    ['đến dưới', { k: 'tierto' }],
    ['bảng bậc theo', { k: 'tier' }],
    ['bảng bậc', { k: 'tier' }]
  ].forEach(([phrase, spec]: any) => {
    const f = fold(phrase);
    KEYWORDS.set(f, Object.freeze(spec));
    KW_MAX_WORDS = Math.max(KW_MAX_WORDS, f.split(' ').length);
  });
  // Chữ đầu của từ khoá mà một vế trái "gần giống tên" không được chứa (để phân biệt "Tên = ..." với "nếu a = b ...")
  const RESERVED_LHS = new Set<any>([
    'neu',
    'thi',
    'nguoc',
    'va',
    'hoac',
    'khong',
    'cong',
    'tru',
    'nhan',
    'chia',
    'bang',
    'duoi',
    'tu',
    'min',
    'max',
    'x'
  ]);

  function buildIndex(vocab?, lim?, extraFormulas?) {
    const byKey = new Map<any, any>();
    const phrases = new Map<any, any>();
    const entryPhrases = new Map<any, any>();
    let maxWords = 1;
    const list = Array.isArray(vocab) ? vocab.slice() : [];
    // Công thức có tên truyền riêng (formulas) mà từ vựng chưa khai: nhận bằng chính khoá của nó
    if (extraFormulas && isObj(extraFormulas)) {
      for (const k of Object.keys(extraFormulas)) {
        if (!list.some(e => isObj(e) && e.key === k) && isName(k, lim))
          list.push({ key: k, label: k, synonyms: [], kind: 'formula', synthetic: true });
      }
    }
    for (const e of list) {
      if (!isObj(e) || typeof e.key !== 'string' || !e.key) continue;
      if (!byKey.has(e.key)) byKey.set(e.key, e);
      const texts = [e.label, ...(Array.isArray(e.synonyms) ? e.synonyms : [])];
      for (const t of texts) {
        if (typeof t !== 'string') continue;
        const ws = wordsOf(t).map(w => w.f);
        if (!ws.length || ws.length > lim.maxPhraseWords) continue;
        const k = ws.join(' ');
        const arr = phrases.get(k) || [];
        if (!arr.some(x => x.key === e.key)) arr.push(e);
        phrases.set(k, arr);
        const own = entryPhrases.get(e.key) || [];
        if (!own.includes(k)) own.push(k);
        entryPhrases.set(e.key, own);
        maxWords = Math.max(maxWords, ws.length);
      }
    }
    return { byKey, phrases, entryPhrases, maxWords: Math.max(maxWords, KW_MAX_WORDS) };
  }

  const labelOf = (idx?, key?) => {
    const e = idx.byKey.get(key);
    return e && typeof e.label === 'string' && e.label ? e.label : key;
  };

  // Kiểm một từ vựng: trả lỗi (không dùng được) và cảnh báo (dùng được nhưng nên xem lại)
  function checkVocabulary(vocab?) {
    const errors: any[] = [];
    const warnings: any[] = [];
    const add = (list?, code?, message?, key?) => list.push({ code, message, key });
    if (!Array.isArray(vocab)) {
      add(errors, 'FORMULA_VOCAB_BAD', 'Từ vựng phải là một danh sách.');
      return { ok: false, errors, warnings };
    }
    const keys = new Set<any>();
    const labels = new Map<any, any>();
    const synonyms = new Map<any, any>();
    for (const e of vocab) {
      if (!isObj(e) || typeof e.key !== 'string' || !e.key) {
        add(errors, 'FORMULA_VOCAB_BAD', 'Mục từ vựng thiếu khoá.');
        continue;
      }
      if (keys.has(e.key)) add(errors, 'FORMULA_VOCAB_DUP_KEY', `Khoá ‘${e.key}’ bị khai hai lần.`, e.key);
      keys.add(e.key);
      if (!KINDS.includes(e.kind))
        add(errors, 'FORMULA_VOCAB_BAD', `‘${e.key}’: kind phải là một trong ${KINDS.join(', ')}.`, e.key);
      if (!unitInfo(e.unit)) add(errors, 'FORMULA_VOCAB_BAD', `‘${e.key}’: đơn vị ‘${e.unit}’ không hợp lệ.`, e.key);
      if (e.domain !== undefined && !DOMAINS.includes(e.domain))
        add(errors, 'FORMULA_VOCAB_BAD', `‘${e.key}’: miền ‘${e.domain}’ không hợp lệ.`, e.key);
      if (typeof e.label !== 'string' || !e.label.trim()) {
        add(errors, 'FORMULA_VOCAB_BAD', `‘${e.key}’ thiếu nhãn.`, e.key);
        continue;
      }
      const texts = [
        { t: e.label, isLabel: true },
        ...(Array.isArray(e.synonyms) ? e.synonyms : []).map(t => ({ t, isLabel: false }))
      ];
      for (const { t, isLabel } of texts) {
        if (typeof t !== 'string') {
          add(errors, 'FORMULA_VOCAB_BAD', `‘${e.key}’: từ đồng nghĩa phải là chữ.`, e.key);
          continue;
        }
        const ws = wordsOf(t);
        const rebuilt = ws.map(w => t.slice(w.s, w.e)).join(' ');
        if (!ws.length || t.trim().replace(/\s+/g, ' ') !== rebuilt || ws.some(w => !isLetter(t[w.s])))
          add(
            errors,
            'FORMULA_VOCAB_BAD',
            `‘${t}’: nhãn chỉ gồm chữ, số, dấu cách (ngoặc và dấu câu không đọc lại được).`,
            e.key
          );
        const f = ws.map(w => w.f).join(' ');
        if (KEYWORDS.has(f))
          add(errors, 'FORMULA_VOCAB_RESERVED', `‘${t}’ trùng từ khoá cấu trúc của công thức.`, e.key);
        const store = isLabel ? labels : synonyms;
        const arr = store.get(f) || [];
        if (!arr.includes(e.key)) arr.push(e.key);
        store.set(f, arr);
      }
      if (e.required !== undefined && !Array.isArray(e.required))
        add(errors, 'FORMULA_VOCAB_BAD', `‘${e.key}’: required phải là danh sách khoá.`, e.key);
    }
    for (const [f, ks] of labels)
      if (ks.length > 1) add(errors, 'FORMULA_VOCAB_CLASH', `Nhãn ‘${f}’ dùng chung cho ${ks.join(', ')}.`, ks[0]);
    for (const [f, ks] of synonyms) {
      const own = labels.get(f) || [];
      const all = [...new Set<any>([...ks, ...own])];
      if (all.length > 1)
        add(
          warnings,
          'FORMULA_VOCAB_AMBIGUOUS',
          `Chữ ‘${f}’ có nhiều nghĩa (${all.join(', ')}): bộ phân tích sẽ hỏi lại.`,
          all[0]
        );
    }
    for (const e of vocab) {
      if (!isObj(e) || !Array.isArray(e.required)) continue;
      for (const k of e.required)
        if (!keys.has(k))
          add(errors, 'FORMULA_VOCAB_BAD', `‘${e.key}’: thành phần bắt buộc ‘${k}’ không có trong từ vựng.`, e.key);
    }
    return { ok: errors.length === 0, errors, warnings };
  }

  // Gợi ý: nhãn gần nhất theo khoảng cách chỉnh sửa, cộng điểm cho từ trùng hoặc lệch một chữ
  function suggest(queries?, idx?, lim?) {
    const scored = new Map<any, any>();
    const closeWord = (a?, b?) =>
      a === b ||
      (a.length >= lim.suggestWordMinLen &&
        b.length >= lim.suggestWordMinLen &&
        levenshtein(a, b, lim.maxEditChars) <= 1);
    for (let qi = 0; qi < queries.length; qi++) {
      const q = queries[qi];
      const qf = fold(q).replace(/\s+/g, ' ').trim();
      if (!qf) continue;
      const qw = qf.split(' ');
      for (const [key, phraseList] of idx.entryPhrases) {
        let best = Infinity;
        for (const p of phraseList) {
          const ratio =
            levenshtein(qf, p, lim.maxEditChars) /
            Math.max(Math.min(qf.length, lim.maxEditChars), Math.min(p.length, lim.maxEditChars), 1);
          const pw = p.split(' ');
          let hit = 0;
          for (const w of pw) if (qw.some(x => closeWord(x, w))) hit++;
          const overlap = hit / pw.length;
          if (ratio > lim.suggestMaxRatio && overlap === 0) continue;
          const score = ratio - lim.suggestOverlapWeight * overlap;
          if (score < best) best = score;
        }
        if (best < Infinity) {
          const prev = scored.get(key);
          if (!prev || best < prev.score) scored.set(key, { score: best, qi });
        }
      }
    }
    const ranked = [...scored.entries()]
      .map(([key, v]: any) => ({ key, score: v.score, qi: v.qi, label: labelOf(idx, key) }))
      .sort((a: any, b: any) => a.score - b.score || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0))
      .slice(0, lim.maxSuggestions);
    return { labels: ranked.map(r => r.label), keys: ranked.map(r => r.key), queryIdx: ranked.map(r => r.qi) };
  }

  // ---------------------------------------------------------------------------------------------------------------------
  // Vị trí trong chữ gốc của từng nút (không nằm trong cây, nên cây so sánh được và lưu được)
  // ---------------------------------------------------------------------------------------------------------------------
  const SPAN = new WeakMap<any, any>();
  const TARGET_SPAN = new WeakMap<any, any>();
  const spanOf = (node?) => (isObj(node) ? SPAN.get(node) || null : null);

  // ---------------------------------------------------------------------------------------------------------------------
  // Các lớp nút (danh sách đóng). Mỗi lớp có: children, shapeError, evaluate, describe, validate, dependencies (qua walk),
  // serialize và deserialize. Cây trong bộ nhớ là đối tượng thường dạng lồng nhau; bản lưu là dạng phẳng có mã nút.
  // ---------------------------------------------------------------------------------------------------------------------
  const PREC = Object.freeze({ cond: 0, or: 1, and: 2, not: 3, cmp: 4, sum: 5, prod: 6, neg: 7, atom: 8 });
  const ARITH_OPS = Object.freeze(['add', 'sub', 'mul', 'div']);
  const CMP_OPS = Object.freeze(['gt', 'gte', 'lt', 'lte', 'eq']);
  const FN_NAMES = Object.freeze(['min', 'max', 'sumDays']);
  const OP_SYMBOL = Object.freeze({ add: '+', sub: '−', mul: '×', div: '÷' });

  const T2C = Object.freeze({
    lit: 'Literal',
    var: 'Variable',
    param: 'Parameter',
    op: 'Operator',
    and: 'Operator',
    or: 'Operator',
    not: 'Operator',
    fn: 'Function',
    cond: 'Condition',
    tier: 'Tier',
    ref: 'FormulaRef',
    builtin: 'BuiltinCall'
  });
  const clsOf = (node?) => {
    if (!isObj(node) || typeof node.t !== 'string' || !hasOwn(T2C, node.t)) return null;
    return CLASSES[T2C[node.t]];
  };

  function precOf(node?) {
    switch (node.t) {
      case 'cond':
      case 'tier':
        return PREC.cond;
      case 'or':
        return PREC.or;
      case 'and':
        return PREC.and;
      case 'not':
        return PREC.not;
      case 'op':
        if (node.op === 'add' || node.op === 'sub') return PREC.sum;
        if (node.op === 'mul' || node.op === 'div') return PREC.prod;
        if (node.op === 'neg') return PREC.neg;
        return PREC.cmp;
      default:
        return PREC.atom;
    }
  }

  const dnode = (node?, dc?, minPrec?) => clsOf(node).describe(node, dc, minPrec);
  const wrap = (s?, node?, minPrec?) => (precOf(node) < minPrec ? `(${s})` : s);

  function numFromInput(src?, key?) {
    if (typeof src === 'boolean') return src ? 1 : 0;
    if (typeof src !== 'number' || !Number.isFinite(src))
      throw new FormulaError('FORMULA_MISSING_INPUT', `Thiếu hoặc sai giá trị đầu vào ‘${key}’.`, { key });
    return src;
  }
  // Khoá có chỗ giữ chỗ, ví dụ 'type.<type>.travel' (cùng dạng khoá registry): thay <type> bằng ctx.scope.type (loại nhân sự của người đang tính)
  function resolveKey(st?, key?) {
    if (!key.includes('<')) return key;
    return key.replace(RE_PLACEHOLDER, (all, name) => {
      const v = st.scope && hasOwn(st.scope, name) ? st.scope[name] : undefined;
      if (typeof v !== 'string' && !isNum(v))
        throw new FormulaError('FORMULA_MISSING_INPUT', `Thiếu ctx.scope.${name} để giải khoá ‘${key}’.`, { key });
      return String(v);
    });
  }
  function inputOf(st?, rawKey?, prefer?) {
    const key = resolveKey(st, rawKey);
    const first = prefer === 'params' ? st.params : st.vars;
    const second = prefer === 'params' ? st.vars : st.params;
    let src;
    let found = false;
    if (first && hasOwn(first, key)) {
      src = first[key];
      found = true;
    } else if (second && hasOwn(second, key)) {
      src = second[key];
      found = true;
    }
    return { found, src };
  }
  function readInput(st?, key?, prefer?) {
    const { found, src } = inputOf(st, key, prefer);
    if (!found) throw new FormulaError('FORMULA_MISSING_INPUT', `Thiếu giá trị đầu vào ‘${key}’.`, { key });
    if (Array.isArray(src)) {
      if (st.day === null)
        throw new FormulaError(
          'FORMULA_DOMAIN_MIXED',
          `‘${key}’ là theo ngày; chỉ dùng được trong ‘tổng theo ngày (…)’.`,
          { key }
        );
      st.dayReads++;
      return numFromInput(src[st.day], key);
    }
    return numFromInput(src, key);
  }
  function fin(x?, node?) {
    if (!Number.isFinite(x))
      throw new FormulaError('FORMULA_NOT_FINITE', 'Kết quả không phải số hữu hạn.', { at: spanOf(node) });
    return x === 0 ? 0 : x;
  }
  const evalNode = (node?, st?, depth?) => {
    if (depth > st.lim.maxEvalDepth) throw new FormulaError('FORMULA_TOO_LARGE', 'Công thức lồng quá sâu để tính.');
    const c = clsOf(node);
    if (!c) throw new FormulaError('FORMULA_UNKNOWN_NODE', 'Nút lạ trong cây công thức.');
    return c.evaluate(node, st, depth);
  };

  // Các khoá đầu vào (biến, tham số) mà một cây dùng, kể cả đi qua công thức có tên: để biết "tổng theo ngày" lặp bao nhiêu ngày
  function inputKeysDeep(node?, st?) {
    const keys = new Set<any>();
    const seenRefs = new Set<any>();
    const stack = [node];
    let guard = 0;
    while (stack.length && guard++ < st.lim.maxNodes * 10) {
      const n = stack.pop();
      const c = clsOf(n);
      if (!c) continue;
      if (n.t === 'var' || n.t === 'param') keys.add(n.t === 'var' ? n.id : n.key);
      if (n.t === 'ref' && !seenRefs.has(n.name)) {
        seenRefs.add(n.name);
        const f = st.formulas && hasOwn(st.formulas, n.name) ? asTree(st.formulas[n.name]) : null;
        if (f) stack.push(f);
      }
      for (const k of c.children(n)) stack.push(k);
    }
    return keys;
  }

  const unitSuffixText = (unit?, value?) => {
    if (unit === 'percent') return `${fmtNum(Number((value * 100).toPrecision(12)))}%`;
    if (unit && hasOwn(UNIT_WORD, unit)) return `${fmtNum(value)} ${UNIT_WORD[unit]}`;
    return fmtNum(value);
  };

  function onlyKeys(raw?, allowed?) {
    for (const k of Object.keys(raw))
      if (!allowed.includes(k))
        throw new FormulaError('FORMULA_BAD_NODE', `Nút có trường lạ ‘${String(k).slice(0, 30)}’.`);
  }
  function needChild(dz?, id?, field?) {
    if (typeof id !== 'string') throw new FormulaError('FORMULA_BAD_NODE', `Thiếu nút con ‘${field}’.`);
    return dz.child(id);
  }
  function needArgs(dz?, raw?, min?) {
    if (!Array.isArray(raw.args) || raw.args.length < min)
      throw new FormulaError('FORMULA_BAD_NODE', `Nút ‘${raw.t}’ cần danh sách args có ít nhất ${min} phần tử.`);
    return raw.args.map(id => needChild(dz, id, 'args'));
  }

  // Báo lỗi kiểm: có mã, câu tiếng Việt, vị trí trong chữ (nếu cây vừa được phân tích) và đường đi trong cây
  function report(vs?, node?, path?, code?, message?, extra?) {
    if (vs.errors.length >= vs.lim.maxNodes) return;
    const err = { code, message, at: spanOf(node), path };
    if (extra) for (const k of Object.keys(extra)) err[k] = extra[k];
    vs.errors.push(err);
  }
  // Nhãn đơn vị của một kiểu để hiện trên từng nút: 'VND', 'hour', 'VND/day', 'ratio', 'count', 'any' (0, 1 và hằng chưa gắn đơn vị), 'flag' (đúng/sai)
  const typeLabel = (t?) => (t.unknown ? null : t.bool ? 'flag' : t.any ? 'any' : t.cnt ? 'count' : unitName(t.dims));
  const checkNode = (node?, vs?, path?) => {
    const t = clsOf(node).validate(node, vs, path);
    const label = typeLabel(t);
    if (label && vs.units) vs.units[path] = label;
    return t;
  };
  const descr = (node?, vs?) => {
    try {
      return dnode(node, vs.dc, 0);
    } catch {
      return '…';
    }
  };

  function needNumeric(t?, vs?, node?, path?) {
    if (t.unknown) return T_UNKNOWN;
    if (t.bool) {
      report(
        vs,
        node,
        path,
        'FORMULA_NOT_NUMERIC',
        `‘${descr(node, vs)}’ là điều kiện đúng/sai, không phải số để tính.`
      );
      return T_UNKNOWN;
    }
    return t;
  }
  function needProp(t?, vs?, node?, path?) {
    if (t.unknown || t.bool || t.cnt) return true;
    report(
      vs,
      node,
      path,
      'FORMULA_NOT_BOOLEAN',
      `‘${descr(node, vs)}’ không phải điều kiện đúng/sai (hãy dùng phép so sánh).`
    );
    return false;
  }
  function unify(A?, B?, vs?, node?, path?, verb?) {
    if (A.unknown || B.unknown) return T_UNKNOWN;
    if (A.bool || B.bool) {
      needNumeric(A, vs, node.t === 'op' ? node.a : node, path);
      needNumeric(B, vs, node.t === 'op' ? node.b : node, path);
      return T_UNKNOWN;
    }
    if (A.any) return B;
    if (B.any) return A;
    if (dimsEq(A.dims, B.dims)) return tNum(A.dims, A.cnt && B.cnt);
    const timeVsMoney =
      (dimsEq(A.dims, { VND: 1 }) && (B.dims.hour || B.dims.day || B.dims.minute)) ||
      (dimsEq(B.dims, { VND: 1 }) && (A.dims.hour || A.dims.day || A.dims.minute));
    const where = `‘${descr(node, vs)}’`;
    const message =
      verb === 'chọn nhánh'
        ? `Hai nhánh của ‘nếu … thì … ngược lại …’ phải cùng đơn vị, nhưng là ${unitText(A.dims)} và ${unitText(B.dims)}.`
        : verb === 'chọn bậc'
          ? `Các hàng của bảng bậc phải cùng đơn vị, nhưng có ${unitText(A.dims)} và ${unitText(B.dims)}.`
          : `Không thể ${verb} ${unitText(A.dims)} với ${unitText(B.dims)} ở ${where}.`;
    report(
      vs,
      node,
      path,
      'FORMULA_UNIT_MISMATCH',
      message,
      timeVsMoney
        ? { hint: 'Nhân số giờ (hoặc ngày) với một khoản tiền theo giờ (hoặc theo ngày) trước khi cộng.' }
        : undefined
    );
    return T_UNKNOWN;
  }

  // Có "tổng theo ngày" nằm trong cây này không (không đi vào công thức có tên)?
  function hasSumDays(tree?, lim?) {
    let found = false;
    walk(
      tree,
      n => {
        if (isObj(n) && n.t === 'fn' && n.name === 'sumDays') found = true;
      },
      lim
    );
    return found;
  }
  // Nhánh này có dùng biến/tham số/hàm có sẵn THEO NGÀY không (không đi vào công thức có tên)?
  function usesDay(node?, vs?) {
    let found = false;
    walk(
      node,
      n => {
        if (!isObj(n)) return;
        const e = entryOfNode(n, vs);
        if (e && e.domain === 'day' && n.t !== 'ref') found = true;
      },
      vs.lim
    );
    return found;
  }
  // Trong "tổng theo ngày", các số hạng CỘNG/TRỪ/CHỌN (cộng, trừ, nhỏ nhất, lớn nhất, hai nhánh, giá trị các hàng) mà một số hạng theo ngày
  // còn số hạng kia là số cấp tháng (không phải 0, 1 hay tỷ lệ) sẽ bị cộng lại MỖI NGÀY: từ chối. Nhân/chia với số cấp tháng thì hợp lệ.
  function monthTermInDaySum(vs?, parts?) {
    if (!vs.insideSum) return;
    const dayFlags = parts.map(x => usesDay(x.node, vs));
    if (!dayFlags.some(Boolean)) return;
    parts.forEach((x, i) => {
      if (dayFlags[i] || x.type.unknown || x.type.any || x.type.bool || Object.keys(x.type.dims).length === 0) return;
      report(
        vs,
        x.node,
        x.path,
        'FORMULA_DOMAIN_MIXED',
        `‘${descr(x.node, vs)}’ là số theo tháng; đặt trong ‘tổng theo ngày’ nó bị cộng lại mỗi ngày. Hãy nhân nó với một biến theo ngày, hoặc đưa ra ngoài ‘tổng theo ngày’.`
      );
    });
  }
  // Giá trị số của một cạnh nếu nó là hằng (số 0/1 hoặc hằng tự sinh); không thì undefined
  // Cạnh là hằng (số 0/1, hằng tự sinh, dấu trừ của hằng) hoặc tham số registry đã biết giá trị (opts.parameters, khoá không có <chỗ giữ chỗ>):
  // trả số; không thì undefined
  function boundValue(node?, vs?) {
    if (!isObj(node)) return undefined;
    if (node.t === 'lit') return node.v;
    if (node.t === 'param') {
      if (isConstKey(node.key)) return node.value;
      const values = vs && vs.opts && vs.opts.parameters;
      return values && !node.key.includes('<') && hasOwn(values, node.key) && isNum(values[node.key])
        ? values[node.key]
        : undefined;
    }
    if (node.t === 'op' && node.op === 'neg') {
      const a = boundValue(node.a, vs);
      return a === undefined ? undefined : 0 - a;
    }
    return undefined;
  }
  // Hai cạnh "bằng nhau": cùng giá trị khi biết giá trị, không thì cùng cây
  function boundKey(node?, vs?) {
    const v = boundValue(node, vs);
    return v !== undefined ? `n:${v === 0 ? 0 : v}` : JSON.stringify(serialize(node));
  }

  // Chia cho 0: số hằng bằng 0 (gấp được thành số) hoặc đầu vào có khoảng giá trị chứa 0
  function constFold(node?) {
    if (!isObj(node)) return undefined;
    if (node.t === 'lit') return node.v;
    if (node.t === 'op' && node.op === 'neg') {
      const a = constFold(node.a);
      return a === undefined ? undefined : -a;
    }
    if (node.t === 'op' && ARITH_OPS.includes(node.op)) {
      const a = constFold(node.a),
        b = constFold(node.b);
      if (a === undefined || b === undefined) return undefined;
      if (node.op === 'add') return a + b;
      if (node.op === 'sub') return a - b;
      if (node.op === 'mul') return a * b;
      return b === 0 ? NaN : a / b;
    }
    return undefined;
  }
  function rangeHasZero(e?) {
    if (!isObj(e) || e.nonZero === true) return false;
    const lo = isNum(e.min) ? e.min : null;
    const hi = isNum(e.max) ? e.max : null;
    if (lo === null && hi === null) return false;
    return (lo === null ? -Infinity : lo) <= 0 && (hi === null ? Infinity : hi) >= 0;
  }
  function entryOfNode(node?, vs?) {
    if (node.t === 'var') return vs.idx.byKey.get(node.id);
    if (node.t === 'param') return vs.idx.byKey.get(node.key);
    if (node.t === 'ref') return vs.idx.byKey.get(node.name);
    if (node.t === 'builtin') return vs.idx.byKey.get(node.name);
    return undefined;
  }

  // Biến, tham số, hàm có sẵn theo ngày: chỉ dùng trong "tổng theo ngày (…)"
  function dayCheck(e?, node?, vs?, path?) {
    if (!isObj(e) || e.domain !== 'day') return;
    if (vs.insideSum) {
      vs.sawDay = true;
      return;
    }
    const label = typeof e.label === 'string' ? e.label : e.key;
    report(vs, node, path, 'FORMULA_DOMAIN_MIXED', `‘${label}’ là theo ngày; dùng ‘tổng theo ngày (${label})’.`, {
      key: e.key
    });
  }
  function typeOfEntry(e?, vs?, node?, path?) {
    const info = unitInfo(e.unit);
    if (!info) {
      report(vs, node, path, 'FORMULA_BAD_VOCAB', `‘${e.key}’ trong từ vựng có đơn vị không hợp lệ.`, { key: e.key });
      return T_UNKNOWN;
    }
    return info.bool ? T_BOOL : tNum(info.dims, info.cnt);
  }

  const CLASSES = {
    // ----- Literal: chỉ 0 và 1; mọi số khác gõ vào đã thành tham số tự sinh -----
    Literal: {
      children: () => [],
      shapeError: (node?) =>
        node.v === 0 || node.v === 1 ? null : 'Số viết thẳng chỉ được là 0 hoặc 1 (số khác là tham số).',
      evaluate: (node?) => node.v,
      describe: (node?) => fmtNum(node.v),
      validate: () => T_ANY,
      serialize: (node?) => ({ t: 'lit', v: node.v }),
      deserialize: (raw?) => {
        onlyKeys(raw, ['t', 'v']);
        if (!(raw.v === 0 || raw.v === 1))
          throw new FormulaError('FORMULA_BAD_NODE', 'Số viết thẳng chỉ được là 0 hoặc 1.');
        return { t: 'lit', v: raw.v === 1 ? 1 : 0 };
      }
    },

    // ----- Variable: đầu vào của bộ máy, có đơn vị và miền (tra trong từ vựng) -----
    Variable: {
      children: () => [],
      shapeError: (node?, lim?) => (isKey(node.id, lim) ? null : 'Biến thiếu mã hợp lệ (id).'),
      evaluate: (node?, st?) => readInput(st, node.id, 'vars'),
      describe: (node?, dc?) => labelOf(dc, node.id),
      validate: (node?, vs?, path?) => {
        const e = vs.idx.byKey.get(node.id);
        if (!e || e.kind !== 'variable') {
          report(vs, node, path, 'FORMULA_UNKNOWN_VARIABLE', `‘${node.id}’ không phải biến trong từ vựng.`, {
            key: node.id
          });
          return T_UNKNOWN;
        }
        dayCheck(e, node, vs, path);
        return typeOfEntry(e, vs, node, path);
      },
      serialize: (node?) => ({ t: 'var', id: node.id }),
      deserialize: (raw?, dz?) => {
        onlyKeys(raw, ['t', 'id']);
        if (!isKey(raw.id, dz.lim)) throw new FormulaError('FORMULA_BAD_NODE', 'Nút ‘var’ thiếu id hợp lệ.');
        return { t: 'var', id: raw.id };
      }
    },

    // ----- Parameter: khoá registry. Số Admin gõ (khác 0 và 1) là tham số tự sinh `formula.<tên>.const.<n>` kèm giá trị đề xuất -----
    Parameter: {
      children: () => [],
      shapeError: (node?, lim?) => {
        if (!isKey(node.key, lim)) return 'Tham số thiếu khoá hợp lệ (key).';
        if (isConstKey(node.key)) {
          if (!isNum(node.value) || node.value < 0 || node.value > lim.maxLiteral)
            return 'Hằng tự sinh thiếu giá trị hợp lệ.';
          if (node.unit !== undefined && !CONST_UNITS.includes(node.unit)) return 'Hằng tự sinh có đơn vị lạ.';
        } else if (node.value !== undefined || node.unit !== undefined)
          return 'Chỉ hằng tự sinh mới mang value và unit.';
        return null;
      },
      evaluate: (node?, st?) => {
        const { found } = inputOf(st, node.key, 'params');
        if (!found && isConstKey(node.key)) return node.value;
        return readInput(st, node.key, 'params');
      },
      describe: (node?, dc?) => (isConstKey(node.key) ? unitSuffixText(node.unit, node.value) : labelOf(dc, node.key)),
      validate: (node?, vs?, path?) => {
        if (isConstKey(node.key)) {
          if (node.unit === undefined) return T_ANY;
          const info = unitInfo(node.unit);
          return tNum(info!.dims, false);
        }
        const e = vs.idx.byKey.get(node.key);
        if (!e || e.kind !== 'parameter') {
          report(vs, node, path, 'FORMULA_UNKNOWN_PARAMETER', `‘${node.key}’ không phải tham số trong từ vựng.`, {
            key: node.key
          });
          return T_UNKNOWN;
        }
        dayCheck(e, node, vs, path);
        return typeOfEntry(e, vs, node, path);
      },
      serialize: (node?) => {
        const out: Record<string, any> = { t: 'param', key: node.key };
        if (isConstKey(node.key)) {
          out.value = node.value;
          if (node.unit !== undefined) out.unit = node.unit;
        }
        return out;
      },
      deserialize: (raw?, dz?) => {
        onlyKeys(raw, ['t', 'key', 'value', 'unit']);
        const node: Record<string, any> = { t: 'param', key: raw.key };
        if (hasOwn(raw, 'value')) node.value = raw.value;
        if (hasOwn(raw, 'unit')) node.unit = raw.unit;
        const bad = CLASSES.Parameter.shapeError(node, dz.lim);
        if (bad) throw new FormulaError('FORMULA_BAD_NODE', bad);
        return node;
      }
    },

    // ----- Operator: + − × ÷, dấu trừ một ngôi, so sánh, và, hoặc, không -----
    Operator: {
      children: (node?) => {
        if (node.t === 'and' || node.t === 'or') return node.args;
        if (node.t === 'not') return [node.arg];
        return node.op === 'neg' ? [node.a] : [node.a, node.b];
      },
      shapeError: (node?) => {
        if (node.t === 'and' || node.t === 'or')
          return Array.isArray(node.args) && node.args.length >= 2 && node.args.every(isObj)
            ? null
            : `Nút ‘${node.t}’ cần args có ít nhất 2 nút.`;
        if (node.t === 'not') return isObj(node.arg) ? null : 'Nút ‘not’ thiếu arg.';
        if (node.op === 'neg') return isObj(node.a) ? null : 'Dấu trừ một ngôi thiếu toán hạng.';
        if (!ARITH_OPS.includes(node.op) && !CMP_OPS.includes(node.op)) return 'Toán tử lạ.';
        return isObj(node.a) && isObj(node.b) ? null : 'Toán tử thiếu toán hạng.';
      },
      evaluate: (node?, st?, d?) => {
        if (node.t === 'and') {
          for (const a of node.args) if (evalNode(a, st, d + 1) === 0) return 0;
          return 1;
        }
        if (node.t === 'or') {
          for (const a of node.args) if (evalNode(a, st, d + 1) !== 0) return 1;
          return 0;
        }
        if (node.t === 'not') return evalNode(node.arg, st, d + 1) === 0 ? 1 : 0;
        const a = evalNode(node.a, st, d + 1);
        if (node.op === 'neg') return fin(0 - a, node);
        const b = evalNode(node.b, st, d + 1);
        switch (node.op) {
          case 'add':
            return fin(a + b, node);
          case 'sub':
            return fin(a - b, node);
          case 'mul':
            return fin(a * b, node);
          case 'div':
            if (b === 0)
              throw new FormulaError('FORMULA_DIV_ZERO', 'Chia cho 0 khi tính công thức.', { at: spanOf(node) });
            return fin(a / b, node);
          case 'gt':
            return a > b ? 1 : 0;
          case 'gte':
            return a >= b ? 1 : 0;
          case 'lt':
            return a < b ? 1 : 0;
          case 'lte':
            return a <= b ? 1 : 0;
          default:
            return a === b ? 1 : 0;
        }
      },
      describe: (node?, dc?, minPrec?) => {
        let s;
        if (node.t === 'and') s = node.args.map(a => dnode(a, dc, PREC.not)).join(' và ');
        else if (node.t === 'or') s = node.args.map(a => dnode(a, dc, PREC.and)).join(' hoặc ');
        else if (node.t === 'not') s = `không ${dnode(node.arg, dc, PREC.atom)}`;
        else if (node.op === 'neg') s = `−${dnode(node.a, dc, PREC.atom)}`;
        else if (ARITH_OPS.includes(node.op)) {
          const p = precOf(node);
          s = `${dnode(node.a, dc, p)} ${OP_SYMBOL[node.op]} ${dnode(node.b, dc, p + 1)}`;
        } else {
          const A = dnode(node.a, dc, PREC.sum),
            B = dnode(node.b, dc, PREC.sum);
          if (node.op === 'gte') s = `${A} từ ${B} trở lên`;
          else if (node.op === 'gt') s = `${A} lớn hơn ${B}`;
          else if (node.op === 'lt') s = `${A} dưới ${B}`;
          else if (node.op === 'lte') s = `${A} không quá ${B}`;
          else s = `${A} bằng ${B}`;
        }
        return wrap(s, node, minPrec);
      },
      validate: (node?, vs?, path?) => {
        if (node.t === 'and' || node.t === 'or') {
          node.args.forEach((a, i) => needProp(checkNode(a, vs, `${path}.args[${i}]`), vs, a, `${path}.args[${i}]`));
          return T_BOOL;
        }
        if (node.t === 'not') {
          needProp(checkNode(node.arg, vs, `${path}.arg`), vs, node.arg, `${path}.arg`);
          return T_BOOL;
        }
        const A = checkNode(node.a, vs, `${path}.a`);
        if (node.op === 'neg') return needNumeric(A, vs, node.a, `${path}.a`);
        const B = checkNode(node.b, vs, `${path}.b`);
        switch (node.op) {
          case 'add':
          case 'sub': {
            monthTermInDaySum(vs, [
              { node: node.a, type: A, path: `${path}.a` },
              { node: node.b, type: B, path: `${path}.b` }
            ]);
            return unify(A, B, vs, node, path, node.op === 'add' ? 'cộng' : 'trừ');
          }
          case 'mul':
          case 'div': {
            const sign = node.op === 'mul' ? 1 : -1;
            if (node.op === 'div') {
              const folded = constFold(node.b);
              if (folded === 0 || Number.isNaN(folded)) {
                report(vs, node.b, `${path}.b`, 'FORMULA_DIV_ZERO', `Chia cho 0 ở ‘${descr(node, vs)}’.`);
              } else if (rangeHasZero(entryOfNode(node.b, vs))) {
                report(
                  vs,
                  node.b,
                  `${path}.b`,
                  'FORMULA_DIV_ZERO_POSSIBLE',
                  `Mẫu số ‘${descr(node.b, vs)}’ có thể bằng 0 ở ‘${descr(node, vs)}’.`
                );
              }
            }
            const a = needNumeric(A, vs, node.a, `${path}.a`),
              b = needNumeric(B, vs, node.b, `${path}.b`);
            if (a.unknown || b.unknown) return T_UNKNOWN;
            if (a.any && b.any) return T_ANY;
            return tNum(dimsOp(a.dims, b.dims, sign), false);
          }
          default: {
            unify(A, B, vs, node, path, 'so sánh');
            return T_BOOL;
          }
        }
      },
      serialize: (node?, ser?) => {
        if (node.t === 'and' || node.t === 'or') return { t: node.t, args: node.args.map(a => ser(a)) };
        if (node.t === 'not') return { t: 'not', arg: ser(node.arg) };
        if (node.op === 'neg') return { t: 'op', op: 'neg', a: ser(node.a) };
        return { t: 'op', op: node.op, a: ser(node.a), b: ser(node.b) };
      },
      deserialize: (raw?, dz?) => {
        if (raw.t === 'and' || raw.t === 'or') {
          onlyKeys(raw, ['t', 'args']);
          return { t: raw.t, args: needArgs(dz, raw, 2) };
        }
        if (raw.t === 'not') {
          onlyKeys(raw, ['t', 'arg']);
          return { t: 'not', arg: needChild(dz, raw.arg, 'arg') };
        }
        if (typeof raw.op !== 'string' || !(raw.op === 'neg' || ARITH_OPS.includes(raw.op) || CMP_OPS.includes(raw.op)))
          throw new FormulaError('FORMULA_BAD_NODE', 'Toán tử lạ trong nút ‘op’.');
        if (raw.op === 'neg') {
          onlyKeys(raw, ['t', 'op', 'a']);
          return { t: 'op', op: 'neg', a: needChild(dz, raw.a, 'a') };
        }
        onlyKeys(raw, ['t', 'op', 'a', 'b']);
        return { t: 'op', op: raw.op, a: needChild(dz, raw.a, 'a'), b: needChild(dz, raw.b, 'b') };
      }
    },

    // ----- Function: nhỏ nhất, lớn nhất, tổng theo ngày -----
    Function: {
      children: (node?) => node.args,
      shapeError: (node?) =>
        FN_NAMES.includes(node.name) && Array.isArray(node.args) && node.args.every(isObj)
          ? null
          : 'Hàm lạ hoặc thiếu đối số.',
      evaluate: (node?, st?, d?) => {
        if (node.name === 'sumDays') {
          if (st.day !== null) throw new FormulaError('FORMULA_DOMAIN_MIXED', '‘tổng theo ngày’ không lồng nhau được.');
          if (node.args.length !== 1)
            throw new FormulaError('FORMULA_ARG_COUNT', '‘tổng theo ngày’ nhận đúng một đối số.');
          let n: any = null;
          for (const key of inputKeysDeep(node.args[0], st)) {
            const { found, src } = inputOf(st, key, 'vars');
            if (!found || !Array.isArray(src)) continue;
            if (n === null) n = src.length;
            else if (n !== src.length)
              throw new FormulaError('FORMULA_MISSING_INPUT', `Các đầu vào theo ngày có độ dài khác nhau (‘${key}’).`, {
                key
              });
          }
          if (n === null)
            throw new FormulaError('FORMULA_MISSING_INPUT', '‘tổng theo ngày’ không có đầu vào theo ngày nào.');
          if (n > st.lim.maxDayLoop)
            throw new FormulaError('FORMULA_TOO_LARGE', `Quá ${st.lim.maxDayLoop} ngày trong một lần cộng.`);
          let sum = 0;
          try {
            for (let i = 0; i < n; i++) {
              st.day = i;
              sum += evalNode(node.args[0], st, d + 1);
            }
          } finally {
            st.day = null;
          }
          return fin(sum, node);
        }
        if (node.args.length < 2) throw new FormulaError('FORMULA_ARG_COUNT', `‘${node.name}’ cần ít nhất hai đối số.`);
        let best = evalNode(node.args[0], st, d + 1);
        for (let i = 1; i < node.args.length; i++) {
          const v = evalNode(node.args[i], st, d + 1);
          if (node.name === 'min' ? v < best : v > best) best = v;
        }
        return best;
      },
      describe: (node?, dc?) => {
        const name = node.name === 'min' ? 'nhỏ nhất của' : node.name === 'max' ? 'lớn nhất của' : 'tổng theo ngày';
        return `${name} (${node.args.map(a => dnode(a, dc, PREC.cond)).join(' ; ')})`;
      },
      validate: (node?, vs?, path?) => {
        if (node.name === 'sumDays') {
          if (node.args.length !== 1) {
            report(vs, node, path, 'FORMULA_ARG_COUNT', '‘tổng theo ngày’ nhận đúng một đối số.');
            return T_UNKNOWN;
          }
          if (vs.insideSum) {
            report(vs, node, path, 'FORMULA_NESTED_SUMDAYS', '‘tổng theo ngày’ không lồng vào nhau được.');
            return T_UNKNOWN;
          }
          const prevSaw = vs.sawDay;
          vs.insideSum = true;
          vs.sawDay = false;
          const t = checkNode(node.args[0], vs, `${path}.args[0]`);
          const saw = vs.sawDay;
          vs.insideSum = false;
          vs.sawDay = prevSaw;
          if (!saw)
            report(
              vs,
              node,
              path,
              'FORMULA_SUMDAYS_NO_DAY',
              '‘tổng theo ngày’ cần ít nhất một biến theo ngày bên trong.'
            );
          return needNumeric(t, vs, node.args[0], `${path}.args[0]`);
        }
        if (node.args.length < 2) {
          report(
            vs,
            node,
            path,
            'FORMULA_ARG_COUNT',
            `‘${node.name === 'min' ? 'nhỏ nhất của' : 'lớn nhất của'}’ cần ít nhất hai đối số.`
          );
          return T_UNKNOWN;
        }
        const argTypes = node.args.map((a, i) => checkNode(a, vs, `${path}.args[${i}]`));
        monthTermInDaySum(
          vs,
          node.args.map((a, i) => ({ node: a, type: argTypes[i], path: `${path}.args[${i}]` }))
        );
        let acc = argTypes[0];
        for (let i = 1; i < argTypes.length; i++) acc = unify(acc, argTypes[i], vs, node, path, 'so sánh');
        return acc;
      },
      serialize: (node?, ser?) => ({ t: 'fn', name: node.name, args: node.args.map(a => ser(a)) }),
      deserialize: (raw?, dz?) => {
        onlyKeys(raw, ['t', 'name', 'args']);
        if (!FN_NAMES.includes(raw.name)) throw new FormulaError('FORMULA_BAD_NODE', 'Hàm lạ trong nút ‘fn’.');
        return { t: 'fn', name: raw.name, args: needArgs(dz, raw, 1) };
      }
    },

    // ----- Condition: nếu … thì … ngược lại … (ngược lại bắt buộc) -----
    Condition: {
      children: (node?) => [node.if, node.then, node.else],
      shapeError: (node?) =>
        isObj(node.if) && isObj(node.then) && isObj(node.else) ? null : 'Điều kiện thiếu if, then hoặc else.',
      evaluate: (node?, st?, d?) =>
        evalNode(node.if, st, d + 1) !== 0 ? evalNode(node.then, st, d + 1) : evalNode(node.else, st, d + 1),
      describe: (node?, dc?, minPrec?) =>
        wrap(
          `nếu ${dnode(node.if, dc, PREC.cond)} thì ${dnode(node.then, dc, PREC.or)} ngược lại ${dnode(node.else, dc, PREC.cond)}`,
          node,
          minPrec
        ),
      validate: (node?, vs?, path?) => {
        needProp(checkNode(node.if, vs, `${path}.if`), vs, node.if, `${path}.if`);
        const A = checkNode(node.then, vs, `${path}.then`),
          B = checkNode(node.else, vs, `${path}.else`);
        monthTermInDaySum(vs, [
          { node: node.then, type: A, path: `${path}.then` },
          { node: node.else, type: B, path: `${path}.else` }
        ]);
        return unify(A, B, vs, node, path, 'chọn nhánh');
      },
      serialize: (node?, ser?) => ({ t: 'cond', if: ser(node.if), then: ser(node.then), else: ser(node.else) }),
      deserialize: (raw?, dz?) => {
        onlyKeys(raw, ['t', 'if', 'then', 'else']);
        return {
          t: 'cond',
          if: needChild(dz, raw.if, 'if'),
          then: needChild(dz, raw.then, 'then'),
          else: needChild(dz, raw.else, 'else')
        };
      }
    },

    // ----- FormulaRef: tham chiếu một công thức có tên khác (đồ thị không được có vòng) -----
    FormulaRef: {
      children: () => [],
      shapeError: (node?, lim?) => (isName(node.name, lim) ? null : 'Tham chiếu công thức thiếu tên hợp lệ.'),
      evaluate: (node?, st?, d?) => {
        const f = st.formulas && hasOwn(st.formulas, node.name) ? asTree(st.formulas[node.name]) : null;
        if (f) {
          // kết quả đã nhớ luôn là của công thức theo tháng (không đọc biến ngày), nên dùng lại được cả trong vòng "tổng theo ngày"
          if (st.memo.has(node.name)) return st.memo.get(node.name);
          if (st.stack.includes(node.name))
            throw new FormulaError('FORMULA_CYCLE', `Công thức ‘${node.name}’ tham chiếu vòng.`, { name: node.name });
          st.stack.push(node.name);
          const readsBefore = st.dayReads;
          let v;
          try {
            v = evalNode(f, st, d + 1);
          } finally {
            st.stack.pop();
          }
          if (st.day === null || st.dayReads === readsBefore) st.memo.set(node.name, v);
          return v;
        }
        const { found, src } = inputOf(st, node.name, 'vars');
        if (found) return numFromInput(Array.isArray(src) ? src[st.day === null ? -1 : st.day] : src, node.name);
        throw new FormulaError('FORMULA_MISSING_INPUT', `Thiếu công thức hoặc giá trị ‘${node.name}’.`, {
          key: node.name
        });
      },
      describe: (node?, dc?) => labelOf(dc, node.name),
      validate: (node?, vs?, path?) => {
        const e = vs.idx.byKey.get(node.name);
        if (e && e.kind !== 'formula') {
          report(vs, node, path, 'FORMULA_UNKNOWN_REF', `‘${node.name}’ không phải công thức có tên.`, {
            key: node.name
          });
          return T_UNKNOWN;
        }
        if (e) dayCheck(e, node, vs, path);
        const f = vs.formulas.get(node.name);
        if (f && vs.insideSum && hasSumDays(f, vs.lim))
          report(
            vs,
            node,
            path,
            'FORMULA_DOMAIN_MIXED',
            `‘${labelOf(vs.idx, node.name)}’ là công thức theo tháng có ‘tổng theo ngày’; không đặt nó trong một ‘tổng theo ngày’ khác (sẽ tính lồng nhau).`,
            { key: node.name }
          );
        const info = e ? unitInfo(e.unit) : null;
        if (info) return info.bool ? T_BOOL : tNum(info.dims, info.cnt);
        if (!f) {
          if (!e)
            report(vs, node, path, 'FORMULA_UNKNOWN_REF', `Không có công thức tên ‘${node.name}’.`, { key: node.name });
          return T_UNKNOWN;
        }
        if (vs.refStack.includes(node.name)) return T_UNKNOWN;
        vs.refStack.push(node.name);
        const sink = { ...vs, errors: [] as any[], units: {} as Record<string, any>, insideSum: false, sawDay: false };
        const t = checkNode(f, sink, 'tham chiếu');
        vs.refStack.pop();
        return t;
      },
      serialize: (node?) => ({ t: 'ref', name: node.name }),
      deserialize: (raw?, dz?) => {
        onlyKeys(raw, ['t', 'name']);
        if (!isName(raw.name, dz.lim)) throw new FormulaError('FORMULA_BAD_NODE', 'Nút ‘ref’ thiếu tên hợp lệ.');
        return { t: 'ref', name: raw.name };
      }
    },

    // ----- BuiltinCall: hàm có sẵn bị khoá (gọi được, không sửa được); nhận (args, params) và trả số hoặc đúng/sai -----
    // ----- Tier: bảng bậc "bảng bậc theo <chỉ số>: từ a trở lên → x; từ a đến dưới b → y; dưới b → z". "từ a" gồm a, "đến dưới b" không gồm b -----
    Tier: {
      children: (node?) => {
        const out = [node.by];
        for (const r of node.rows) {
          if (r.from) out.push(r.from);
          if (r.to) out.push(r.to);
          out.push(r.value);
        }
        return out;
      },
      shapeError: (node?, lim?) => {
        if (!isObj(node.by) || !Array.isArray(node.rows)) return 'Bảng bậc thiếu chỉ số hoặc danh sách hàng.';
        if (node.rows.length < 2 || node.rows.length > lim.maxTierRows)
          return `Bảng bậc cần từ 2 đến ${lim.maxTierRows} hàng.`;
        for (const r of node.rows) {
          if (!isObj(r) || !isObj(r.value)) return 'Mỗi hàng của bảng bậc cần giá trị.';
          if ((r.from !== undefined && !isObj(r.from)) || (r.to !== undefined && !isObj(r.to)))
            return 'Cạnh của hàng bảng bậc phải là một biểu thức.';
          if (r.from === undefined && r.to === undefined) return 'Mỗi hàng của bảng bậc cần ít nhất một cạnh.';
        }
        return null;
      },
      evaluate: (node?, st?, d?) => {
        const x = evalNode(node.by, st, d + 1);
        let hit: any = null;
        let matches = 0;
        for (const r of node.rows) {
          const lo = r.from ? evalNode(r.from, st, d + 1) : null;
          const hi = r.to ? evalNode(r.to, st, d + 1) : null;
          if (lo !== null && hi !== null && !(lo < hi))
            throw new FormulaError(
              'FORMULA_TIER_BAD_BOUNDS',
              'Cạnh dưới của một hàng bảng bậc phải nhỏ hơn cạnh trên.',
              {
                at: spanOf(node)
              }
            );
          if ((lo === null || x >= lo) && (hi === null || x < hi)) {
            matches++;
            hit = r;
          }
        }
        if (matches === 0)
          throw new FormulaError(
            'FORMULA_TIER_NO_ROW',
            'Không hàng nào của bảng bậc chứa giá trị chỉ số (bảng bị hở).',
            {
              at: spanOf(node)
            }
          );
        if (matches > 1)
          throw new FormulaError(
            'FORMULA_TIER_OVERLAP',
            'Nhiều hàng của bảng bậc cùng chứa giá trị chỉ số (bảng bị chồng).',
            {
              at: spanOf(node)
            }
          );
        return evalNode(hit.value, st, d + 1);
      },
      describe: (node?, dc?, minPrec?) => {
        const rows = node.rows.map(r => {
          const head =
            r.from && r.to
              ? `từ ${dnode(r.from, dc, PREC.sum)} đến dưới ${dnode(r.to, dc, PREC.sum)}`
              : r.from
                ? `từ ${dnode(r.from, dc, PREC.sum)} trở lên`
                : `dưới ${dnode(r.to, dc, PREC.sum)}`;
          return `${head} → ${dnode(r.value, dc, PREC.or)}`;
        });
        return wrap(`bảng bậc theo ${dnode(node.by, dc, PREC.sum)}: ${rows.join('; ')}`, node, minPrec);
      },
      validate: (node?, vs?, path?) => {
        const X = needNumeric(checkNode(node.by, vs, `${path}.by`), vs, node.by, `${path}.by`);
        const rows = node.rows;
        let acc: any = null;
        const valueParts: any[] = [];
        rows.forEach((r, i) => {
          const rp = `${path}.rows[${i}]`;
          for (const side of ['from', 'to']) {
            if (!r[side]) continue;
            const B = needNumeric(checkNode(r[side], vs, `${rp}.${side}`), vs, r[side], `${rp}.${side}`);
            unify(X, B, vs, r[side], `${rp}.${side}`, 'so sánh');
          }
          const V = checkNode(r.value, vs, `${rp}.value`);
          valueParts.push({ node: r.value, type: V, path: `${rp}.value` });
          acc = acc === null ? V : unify(acc, V, vs, node, path, 'chọn bậc');
        });
        monthTermInDaySum(vs, valueParts);
        // hình dạng: đúng một hàng thấp nhất (dưới b), đúng một hàng cao nhất (từ a trở lên), các hàng nối đầu-đuôi không hở, không chồng
        const lowers = rows.filter(r => !r.from),
          uppers = rows.filter(r => !r.to);
        if (lowers.length !== 1 || uppers.length !== 1) {
          report(
            vs,
            node,
            path,
            'FORMULA_TIER_BOUNDS',
            'Bảng bậc phải có đúng một hàng thấp nhất (‘dưới …’) và đúng một hàng cao nhất (‘từ … trở lên’), để mọi giá trị đều rơi vào một hàng.'
          );
        } else {
          const seen = new Set<any>();
          let cur = lowers[0];
          seen.add(cur);
          while (cur.to) {
            const key = boundKey(cur.to, vs);
            const next = rows.find(r => !seen.has(r) && r.from && boundKey(r.from, vs) === key);
            if (!next) {
              report(
                vs,
                cur.to,
                path,
                'FORMULA_TIER_GAP',
                'Bảng bậc bị hở hoặc chồng: cạnh trên ‘' +
                  descr(cur.to, vs) +
                  '’ của một hàng phải đúng bằng cạnh dưới của hàng kế tiếp (‘từ a’ gồm a, ‘đến dưới b’ không gồm b).'
              );
              break;
            }
            seen.add(next);
            cur = next;
          }
          // mỗi hàng có hai cạnh hằng thì cạnh dưới phải nhỏ hơn cạnh trên
          for (const r of rows) {
            const lo = boundValue(r.from, vs),
              hi = boundValue(r.to, vs);
            if (lo !== undefined && hi !== undefined && !(lo < hi))
              report(
                vs,
                r.from,
                path,
                'FORMULA_TIER_ORDER',
                'Các cạnh của bảng bậc phải tăng dần: ‘từ a đến dưới b’ cần a nhỏ hơn b.'
              );
          }
          if (!cur.to && seen.size < rows.length)
            report(
              vs,
              node,
              path,
              'FORMULA_TIER_OVERLAP',
              'Có hàng của bảng bậc không nối vào dãy các hàng (bị chồng hoặc thừa).'
            );
        }
        return acc === null ? T_UNKNOWN : acc;
      },
      serialize: (node?, ser?) => ({
        t: 'tier',
        by: ser(node.by),
        rows: node.rows.map(r => {
          const out: Record<string, any> = {};
          if (r.from) out.from = ser(r.from);
          if (r.to) out.to = ser(r.to);
          out.value = ser(r.value);
          return out;
        })
      }),
      deserialize: (raw?, dz?) => {
        onlyKeys(raw, ['t', 'by', 'rows']);
        if (!Array.isArray(raw.rows) || raw.rows.length < 2 || raw.rows.length > dz.lim.maxTierRows)
          throw new FormulaError(
            raw.rows && raw.rows.length > dz.lim.maxTierRows ? 'FORMULA_TOO_LARGE' : 'FORMULA_BAD_NODE',
            `Bảng bậc cần từ 2 đến ${dz.lim.maxTierRows} hàng.`
          );
        const by = needChild(dz, raw.by, 'by');
        const rows = raw.rows.map(r => {
          if (!isObj(r)) throw new FormulaError('FORMULA_BAD_NODE', 'Hàng của bảng bậc phải là đối tượng.');
          onlyKeys(r, ['from', 'to', 'value']);
          const out: Record<string, any> = {};
          if (hasOwn(r, 'from')) out.from = needChild(dz, r.from, 'from');
          if (hasOwn(r, 'to')) out.to = needChild(dz, r.to, 'to');
          out.value = needChild(dz, r.value, 'value');
          return out;
        });
        return { t: 'tier', by, rows };
      }
    },

    BuiltinCall: {
      children: (node?) => node.args,
      shapeError: (node?, lim?) =>
        isKey(node.name, lim) && Array.isArray(node.args) && node.args.every(isObj)
          ? null
          : 'Lời gọi hàm có sẵn thiếu tên hoặc đối số.',
      evaluate: (node?, st?, d?) => {
        const fn = st.builtins && hasOwn(st.builtins, node.name) ? st.builtins[node.name] : null;
        if (typeof fn !== 'function')
          throw new FormulaError('FORMULA_MISSING_BUILTIN', `Thiếu cài đặt hàm có sẵn ‘${node.name}’.`, {
            key: node.name
          });
        const args = node.args.map(a => evalNode(a, st, d + 1));
        const out = fn(args, st.params || {});
        if (typeof out === 'boolean') return out ? 1 : 0;
        if (!isNum(out))
          throw new FormulaError('FORMULA_BAD_BUILTIN_RESULT', `Hàm có sẵn ‘${node.name}’ không trả về số hữu hạn.`, {
            key: node.name
          });
        return out;
      },
      describe: (node?, dc?) => {
        const label = labelOf(dc, node.name);
        return node.args.length ? `${label} (${node.args.map(a => dnode(a, dc, PREC.cond)).join(' ; ')})` : label;
      },
      validate: (node?, vs?, path?) => {
        const e = vs.idx.byKey.get(node.name);
        const types = node.args.map((a, i) => checkNode(a, vs, `${path}.args[${i}]`));
        if (!e || e.kind !== 'builtin') {
          report(vs, node, path, 'FORMULA_UNKNOWN_BUILTIN', `‘${node.name}’ không phải hàm có sẵn trong từ vựng.`, {
            key: node.name
          });
          return T_UNKNOWN;
        }
        dayCheck(e, node, vs, path);
        if (Array.isArray(e.args)) {
          if (e.args.length !== node.args.length) {
            report(
              vs,
              node,
              path,
              'FORMULA_ARG_COUNT',
              `‘${labelOf(vs.idx, e.key)}’ nhận ${e.args.length} đối số, đang có ${node.args.length}.`,
              { key: e.key }
            );
          } else {
            e.args.forEach((spec, i) => {
              const want = unitInfo(spec && spec.unit);
              const got = types[i];
              if (!want || got.unknown || got.any) return;
              if (got.bool || !dimsEq(got.dims, want.dims))
                report(
                  vs,
                  node.args[i],
                  `${path}.args[${i}]`,
                  'FORMULA_UNIT_MISMATCH',
                  `‘${labelOf(vs.idx, e.key)}’: đối số thứ ${i + 1} phải là ${unitText(want.dims)}, đang là ${got.bool ? 'điều kiện đúng/sai' : unitText(got.dims)}.`
                );
            });
          }
        }
        return typeOfEntry(e, vs, node, path);
      },
      serialize: (node?, ser?) => ({ t: 'builtin', name: node.name, args: node.args.map(a => ser(a)) }),
      deserialize: (raw?, dz?) => {
        onlyKeys(raw, ['t', 'name', 'args']);
        if (!isKey(raw.name, dz.lim)) throw new FormulaError('FORMULA_BAD_NODE', 'Nút ‘builtin’ thiếu tên hợp lệ.');
        return { t: 'builtin', name: raw.name, args: needArgs(dz, raw, 0) };
      }
    }
  };

  // ---------------------------------------------------------------------------------------------------------------------
  // Duyệt cây bằng ngăn xếp tường minh (không đệ quy: cây từ nguồn ngoài có thể rất sâu)
  // ---------------------------------------------------------------------------------------------------------------------
  function walk(root?, visit?, lim?) {
    const stack = [root];
    let n = 0;
    const cap = lim.maxNodes * 10;
    while (stack.length) {
      const node = stack.pop();
      if (++n > cap) return false;
      visit(node);
      const c = clsOf(node);
      if (!c) continue;
      const kids = c.children(node);
      for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i]);
    }
    return true;
  }

  // Quét cây trước khi tin nó: đủ nhỏ, đủ nông, mọi nút thuộc danh sách đóng và đúng hình dạng
  function scan(tree?, lim?) {
    const errors: any[] = [];
    const bad = (code?, message?, path?, node?) => errors.push({ code, message, at: spanOf(node), path });
    if (!isObj(tree)) {
      bad('FORMULA_BAD_NODE', 'Cây công thức rỗng hoặc sai kiểu.', 'cây', null);
      return { errors, count: 0, depth: 0 };
    }
    const stack = [[tree, 1, 'cây']];
    let count = 0,
      depth = 0;
    while (stack.length) {
      const [node, d, path] = stack.pop()!;
      count++;
      if (count > lim.maxNodes) {
        bad('FORMULA_TOO_LARGE', `Công thức có quá ${lim.maxNodes} nút.`, path, node);
        break;
      }
      if (d > depth) depth = d;
      if (d > lim.maxDepth) {
        bad(
          'FORMULA_TOO_LARGE',
          `Công thức lồng quá ${lim.maxDepth} tầng; hãy tách thành công thức có tên.`,
          path,
          node
        );
        break;
      }
      const c = clsOf(node);
      if (!c) {
        const t = isObj(node) ? String(node.t).slice(0, 30) : typeof node;
        bad('FORMULA_UNKNOWN_NODE', `Loại nút lạ ‘${t}’ (danh sách nút là đóng).`, path, node);
        break;
      }
      if (node.t === 'tier' && Array.isArray(node.rows) && node.rows.length > lim.maxTierRows) {
        bad('FORMULA_TOO_LARGE', `Bảng bậc có ${node.rows.length} hàng, tối đa ${lim.maxTierRows}.`, path, node);
        break;
      }
      const shape = c.shapeError(node, lim);
      if (shape) {
        bad('FORMULA_BAD_NODE', shape, path, node);
        break;
      }
      const kids = c.children(node);
      // Một chuỗi cùng cấp (a + b − c + …, a × b ÷ c × …) là MỘT tầng: nhánh trái cùng cấp, hoặc con cùng phép + / × ở bên nào, không tính thêm tầng
      const level = node.t === 'op' && ARITH_OPS.includes(node.op) ? precOf(node) : -1;
      for (let i = kids.length - 1; i >= 0; i--) {
        const k = kids[i];
        const isArith = isObj(k) && k.t === 'op' && ARITH_OPS.includes(k.op);
        // nhánh trái cùng cấp (a + b − c), hoặc nhánh nào cũng được khi CÙNG phép kết hợp (+ dưới +, × dưới ×)
        const sameChain =
          level >= 0 &&
          isArith &&
          ((i === 0 && precOf(k) === level) || (k.op === node.op && (node.op === 'add' || node.op === 'mul')));
        stack.push([k, sameChain ? d : d + 1, `${path}.${node.t}[${i}]`]);
      }
    }
    return { errors, count, depth };
  }

  // ---------------------------------------------------------------------------------------------------------------------
  // serialize / deserialize: dạng lưu phẳng ({ v, root, nodes }), kiểm lại toàn bộ khi nạp
  // ---------------------------------------------------------------------------------------------------------------------
  function serialize(tree?) {
    const sc = scan(tree, LIMITS);
    if (sc.errors.length) throw new FormulaError(sc.errors[0].code, sc.errors[0].message);
    const nodes: Record<string, any> = {};
    let n = 0;
    const ser = (node?) => {
      const id = `n${++n}`;
      nodes[id] = null;
      nodes[id] = clsOf(node).serialize(node, ser);
      return id;
    };
    const root = ser(tree);
    const out: Record<string, any> = { v: FORMAT_VERSION };
    if (typeof tree.target === 'string' && tree.target) out.name = tree.target;
    out.root = root;
    out.nodes = nodes;
    return out;
  }

  const RE_ID = /^[A-Za-z0-9_]+$/;
  function deserialize(input?, opts?) {
    const lim = limitsOf(opts);
    let raw = input;
    if (typeof raw === 'string') {
      if (raw.length > lim.maxJsonChars) throw new FormulaError('FORMULA_TOO_LARGE', 'Bản lưu quá dài.');
      try {
        raw = JSON.parse(raw);
      } catch {
        throw new FormulaError('FORMULA_BAD_JSON', 'Bản lưu không phải JSON hợp lệ.');
      }
    }
    if (!isObj(raw)) throw new FormulaError('FORMULA_BAD_NODE', 'Bản lưu phải là một đối tượng.');
    if (raw.v !== FORMAT_VERSION)
      throw new FormulaError(
        'FORMULA_BAD_VERSION',
        `Phiên bản định dạng ‘${String(raw.v).slice(0, 20)}’ chưa được hỗ trợ (chỉ có ${FORMAT_VERSION}).`
      );
    onlyKeys(raw, ['v', 'name', 'root', 'nodes']);
    if (hasOwn(raw, 'name') && !isName(raw.name, lim))
      throw new FormulaError('FORMULA_BAD_NODE', 'Tên công thức không hợp lệ.');
    if (!isObj(raw.nodes)) throw new FormulaError('FORMULA_BAD_NODE', 'Thiếu danh sách nodes.');
    const ids = Object.keys(raw.nodes);
    if (!ids.length) throw new FormulaError('FORMULA_BAD_NODE', 'Danh sách nodes rỗng.');
    if (ids.length > lim.maxNodes) throw new FormulaError('FORMULA_TOO_LARGE', `Bản lưu có quá ${lim.maxNodes} nút.`);
    const nodes = new Map<any, any>();
    for (const id of ids) {
      if (id === '__proto__' || id.length > lim.maxIdChars || !RE_ID.test(id))
        throw new FormulaError('FORMULA_BAD_NODE', `Mã nút ‘${id.slice(0, 20)}’ không hợp lệ.`);
      nodes.set(id, raw.nodes[id]);
    }
    if (typeof raw.root !== 'string' || !nodes.has(raw.root))
      throw new FormulaError('FORMULA_BAD_NODE', 'root không trỏ vào nút nào.');
    const visiting = new Set<any>();
    const used = new Set<any>();
    let built = 0;
    const dz = {
      lim,
      child: (id?) => {
        if (typeof id !== 'string' || !nodes.has(id))
          throw new FormulaError('FORMULA_BAD_NODE', 'Có nút con trỏ vào mã không tồn tại.');
        if (visiting.has(id)) throw new FormulaError('FORMULA_CYCLE', 'Cây có vòng giữa các nút.');
        if (++built > lim.maxNodes)
          throw new FormulaError('FORMULA_TOO_LARGE', `Cây mở ra có quá ${lim.maxNodes} nút.`);
        const r = nodes.get(id);
        if (!isObj(r) || typeof r.t !== 'string' || !hasOwn(T2C, r.t)) {
          throw new FormulaError(
            'FORMULA_UNKNOWN_NODE',
            `Loại nút lạ ‘${isObj(r) ? String(r.t).slice(0, 30) : typeof r}’.`
          );
        }
        used.add(id);
        visiting.add(id);
        try {
          return CLASSES[T2C[r.t]].deserialize(r, dz);
        } finally {
          visiting.delete(id);
        }
      }
    };
    const tree = dz.child(raw.root);
    if (used.size !== nodes.size)
      throw new FormulaError('FORMULA_BAD_NODE', 'Có nút không thuộc cây (không nối với root).');
    const sc = scan(tree, lim);
    if (sc.errors.length) throw new FormulaError(sc.errors[0].code, sc.errors[0].message);
    if (hasOwn(raw, 'name')) tree.target = raw.name;
    return tree;
  }

  // Công thức có tên có thể đến dưới dạng cây hoặc bản lưu
  function asTree(x?) {
    if (clsOf(x)) return x;
    if (isObj(x) && isObj(x.nodes) && typeof x.root === 'string') {
      try {
        return deserialize(x);
      } catch {
        return null;
      }
    }
    return null;
  }
  function normalizeFormulas(f?) {
    const out = new Map<any, any>();
    if (!isObj(f)) return out;
    for (const k of Object.keys(f)) {
      const t = asTree(f[k]);
      if (t) out.set(k, t);
    }
    return out;
  }

  // ---------------------------------------------------------------------------------------------------------------------
  // dependencies, describe, evaluate
  // ---------------------------------------------------------------------------------------------------------------------
  function dependencies(tree?) {
    const out: any[] = [];
    const seen = new Set<any>();
    const add = (k?) => {
      if (!seen.has(k)) {
        seen.add(k);
        out.push(k);
      }
    };
    walk(
      tree,
      node => {
        if (!isObj(node)) return;
        if (node.t === 'var' && typeof node.id === 'string') add(node.id);
        else if (node.t === 'param' && typeof node.key === 'string') add(node.key);
        else if ((node.t === 'ref' || node.t === 'builtin') && typeof node.name === 'string') add(node.name);
      },
      LIMITS
    );
    return out;
  }

  function describe(tree?, vocabulary?) {
    const sc = scan(tree, LIMITS);
    if (sc.errors.length) throw new FormulaError(sc.errors[0].code, sc.errors[0].message);
    const vocab = isObj(vocabulary) && Array.isArray(vocabulary.vocabulary) ? vocabulary.vocabulary : vocabulary;
    const dc = buildIndex(vocab, LIMITS, null);
    const body = dnode(tree, dc, 0);
    return typeof tree.target === 'string' && tree.target ? `${labelOf(dc, tree.target)} = ${body}` : body;
  }

  function pick(ctx?, names?) {
    for (const n of names) if (isObj(ctx[n])) return ctx[n];
    return null;
  }
  function evaluate(tree?, ctx?) {
    const lim = LIMITS;
    const sc = scan(tree, lim);
    if (sc.errors.length) throw new FormulaError(sc.errors[0].code, sc.errors[0].message);
    if (!isObj(ctx)) throw new FormulaError('FORMULA_BAD_CONTEXT', 'Thiếu ctx để tính công thức.');
    const st: Record<string, any> = {
      lim,
      vars: pick(ctx, ['vars', 'variables', 'values']) || {},
      params: pick(ctx, ['params', 'parameters']) || {},
      builtins: pick(ctx, ['builtins', 'functions']) || {},
      formulas: isObj(ctx.formulas) ? ctx.formulas : {},
      scope: isObj(ctx.scope) ? ctx.scope : {},
      day: null,
      dayReads: 0,
      memo: new Map(),
      stack: []
    };
    return evalNode(tree, st, 0);
  }

  // ---------------------------------------------------------------------------------------------------------------------
  // validate: đơn vị, miền ngày/tháng, chia cho 0, vòng, khoá, thành phần bắt buộc, giới hạn kích thước
  // ---------------------------------------------------------------------------------------------------------------------
  function refNames(tree?, lim?) {
    const out = new Set<any>();
    walk(
      tree,
      n => {
        if (isObj(n) && n.t === 'ref' && typeof n.name === 'string') out.add(n.name);
      },
      lim
    );
    return [...out];
  }

  function findCycle(tree?, target?, formulas?, lim?) {
    const root = target || '(công thức này)';
    const treeOf = (name?) => (name === root ? tree : formulas.get(name) || null);
    const state = new Map<any, any>();
    const stack: any[] = [];
    const dfs = (name?) => {
      state.set(name, 1);
      stack.push(name);
      const t = treeOf(name);
      for (const d of t ? refNames(t, lim) : []) {
        if (state.get(d) === 1) return [...stack.slice(stack.indexOf(d)), d];
        if (!state.has(d)) {
          const c = dfs(d);
          if (c) return c;
        }
      }
      stack.pop();
      state.set(name, 2);
      return null;
    };
    return dfs(root);
  }

  // Khoản bắt buộc theo luật phải được cộng NGUYÊN VẸN vào tổng ở tầng ngoài cùng của công thức: hệ số 1, cộng (không trừ),
  // không nằm trong nếu/thì/ngược lại, không nhân, chia hay đi qua hàm. Đi qua công thức có tên (FormulaRef) thì chính tham chiếu
  // phải là một số hạng nguyên vẹn, và bên trong nó khoản đó lại là một số hạng nguyên vẹn của tổng ngoài cùng của nó.
  // Trả { whole: số lần xuất hiện nguyên vẹn, bad: [nút xuất hiện không nguyên vẹn, thuộc cây này] }.
  function requiredState(tree?, key?, formulas?, stack?, lim?, idx?) {
    // Một mục từ vựng khai `covers: [khoá…]` là MỘT khoản đã gồm nguyên vẹn các khoản đó (ví dụ tổng sáu thành phần ngày):
    // cộng nguyên vẹn mục đó vào tổng thì mỗi khoản được phủ cũng coi là đã cộng nguyên vẹn.
    const covered = (k?) => {
      const e = idx && idx.byKey.get(k);
      return Boolean(e) && Array.isArray(e.covers) && e.covers.includes(key);
    };
    const isKeyNode = (n?) =>
      (n.t === 'var' && (n.id === key || covered(n.id))) ||
      (n.t === 'param' && (n.key === key || covered(n.key))) ||
      ((n.t === 'builtin' || n.t === 'ref') && (n.name === key || covered(n.name)));
    const terms: any[] = [];
    const collect = (n?, positive?) => {
      if (isObj(n) && n.t === 'op' && n.op === 'add') {
        collect(n.a, positive);
        collect(n.b, positive);
      } else if (isObj(n) && n.t === 'op' && n.op === 'sub') {
        collect(n.a, positive);
        collect(n.b, !positive);
      } else terms.push({ n, positive });
    };
    collect(tree, true);
    // có khoản này ở đâu đó trong nhánh (kể cả sau một tham chiếu công thức có tên)?
    const occurrences = (n?) => {
      const found: any[] = [];
      walk(
        n,
        x => {
          if (!isObj(x)) return;
          if (isKeyNode(x)) found.push(x);
          else if (x.t === 'ref' && formulas.has(x.name) && !stack.includes(x.name)) {
            const sub = requiredState(formulas.get(x.name), key, formulas, [...stack, x.name], lim, idx);
            if (sub.whole + sub.bad.length > 0) found.push(x);
          }
        },
        lim
      );
      return found;
    };
    const wholeNodes: any[] = [];
    const bad: any[] = [];
    for (const { n, positive } of terms) {
      if (positive && isKeyNode(n)) {
        wholeNodes.push(n);
        continue;
      }
      if (positive && n.t === 'ref' && formulas.has(n.name) && !stack.includes(n.name)) {
        const sub = requiredState(formulas.get(n.name), key, formulas, [...stack, n.name], lim, idx);
        if (sub.whole + sub.bad.length === 0) continue;
        if (sub.bad.length === 0) for (let i = 0; i < sub.whole; i++) wholeNodes.push(n);
        else bad.push(n);
        continue;
      }
      for (const o of occurrences(n)) bad.push(o);
    }
    return { whole: wholeNodes.length, wholeNodes, bad };
  }

  function validate(tree?, opts?) {
    opts = isObj(opts) ? opts : {};
    const lim = limitsOf(opts);
    const sc = scan(tree, lim);
    if (sc.errors.length) return { ok: false, errors: sc.errors, unit: null, units: {} };
    const errors: any[] = [];
    const formulas = normalizeFormulas(opts.formulas);
    const idx = buildIndex(opts.vocabulary, lim, null);
    const target =
      typeof opts.target === 'string' && opts.target
        ? opts.target
        : typeof tree.target === 'string' && tree.target
          ? tree.target
          : null;
    const vs = {
      opts,
      lim,
      idx,
      dc: idx,
      errors,
      formulas,
      units: {} as Record<string, any>,
      insideSum: false,
      sawDay: false,
      refStack: target ? [target] : []
    };
    const rootSpan = TARGET_SPAN.get(tree) || spanOf(tree);
    const rootErr = (code?, message?, extra?) => {
      const e = { code, message, at: rootSpan, path: 'cây' };
      if (extra) for (const k of Object.keys(extra)) e[k] = extra[k];
      errors.push(e);
    };

    // 1. vế trái: không gán được vào hàm có sẵn, công thức bị khoá, biến hay tham số
    const targetEntry = target ? idx.byKey.get(target) : undefined;
    if (targetEntry) {
      const label = labelOf(idx, target);
      if (targetEntry.kind === 'builtin' || (targetEntry.kind === 'formula' && targetEntry.locked))
        rootErr(
          'FORMULA_LOCKED_TARGET',
          `‘${label}’ là ${targetEntry.kind === 'builtin' ? 'hàm có sẵn bị khoá (luật hoặc tính toán cố định)' : 'công thức bị khoá'}: công thức chỉ gọi được, không sửa được.`,
          { key: target }
        );
      else if (targetEntry.kind !== 'formula')
        rootErr(
          'FORMULA_BAD_TARGET',
          `‘${label}’ là ${targetEntry.kind === 'variable' ? 'biến' : 'tham số'}, không phải công thức để gán.`,
          { key: target }
        );
    }

    // 2. vòng tham chiếu
    const cycle = findCycle(tree, target, formulas, lim);
    if (cycle) {
      rootErr('FORMULA_CYCLE', `Công thức tham chiếu vòng: ${cycle.map(k => labelOf(idx, k)).join(' → ')}.`, { cycle });
    }

    // 3. đơn vị, miền, chia cho 0, khoá lạ
    const t = checkNode(tree, vs, 'cây');
    let unit: any = null;
    if (!t.unknown) unit = t.bool ? 'bool' : t.any ? 'any' : unitName(t.dims);
    if (!t.unknown && t.bool)
      errors.push({
        code: 'FORMULA_NOT_NUMERIC',
        message: 'Công thức phải ra một số, không phải điều kiện đúng/sai.',
        at: spanOf(tree),
        path: 'cây'
      });
    if (targetEntry && targetEntry.kind === 'formula' && !t.unknown && !t.bool && !t.any) {
      const want = unitInfo(targetEntry.unit);
      if (want && !dimsEq(want.dims, t.dims))
        errors.push({
          code: 'FORMULA_TARGET_UNIT_MISMATCH',
          message: `Công thức ‘${labelOf(idx, target)}’ phải ra ${unitText(want.dims)}, nhưng kết quả là ${unitText(t.dims)}.`,
          at: spanOf(tree),
          path: 'cây'
        });
    }

    // 4. thành phần bắt buộc (đi qua cả công thức có tên)
    if (target && !cycle) {
      const need =
        targetEntry && Array.isArray(targetEntry.required) ? targetEntry.required : DEFAULT_REQUIRED[target] || [];
      const must = need.filter(k => idx.byKey.has(k));
      if (must.length) {
        const states = must.map(k => ({ k, st: requiredState(tree, k, formulas, [target], lim, idx) }));
        const missing = states.filter(x => x.st.whole + x.st.bad.length === 0).map(x => x.k);
        if (missing.length)
          rootErr(
            'FORMULA_MISSING_REQUIRED',
            `Công thức ‘${labelOf(idx, target)}’ bỏ: ${missing.map(k => labelOf(idx, k)).join(', ')}. Không thể lưu.`,
            { missing }
          );
        // khoản bắt buộc theo luật phải được cộng nguyên vẹn
        for (const { k, st } of states) {
          // cộng đúng MỘT lần: lần thứ hai (trực tiếp hoặc qua công thức có tên) là trả hai lần
          for (const node of st.wholeNodes.slice(1))
            errors.push({
              code: 'FORMULA_REQUIRED_DUPLICATE',
              message: `‘${labelOf(idx, k)}’ đã được cộng một lần; cộng thêm lần nữa là trả hai lần.`,
              at: spanOf(node) || rootSpan,
              path: 'cây',
              component: k
            });
          for (const node of st.bad)
            errors.push({
              code: 'FORMULA_REQUIRED_NOT_WHOLE',
              message: `‘${labelOf(idx, k)}’ là khoản bắt buộc theo luật, phải được cộng nguyên vẹn vào ‘${labelOf(idx, target)}’ (không nhân, chia, trừ hay đặt trong điều kiện).`,
              at: spanOf(node) || rootSpan,
              path: 'cây',
              component: k
            });
        }
      }
    }
    return { ok: errors.length === 0, errors, unit, units: vs.units };
  }

  // ---------------------------------------------------------------------------------------------------------------------
  // Bộ tách từ
  // ---------------------------------------------------------------------------------------------------------------------
  function gatherWords(text?, i?, max?) {
    const out: any[] = [];
    let p = i;
    while (out.length < max && isLetter(text[p])) {
      let e = p;
      while (isWordCh(text[e])) e++;
      out.push({ s: p, e, f: fold(text.slice(p, e)) });
      let q = e;
      while (isSpace(text[q])) q++;
      if (q === e) break;
      p = q;
    }
    return out;
  }
  // Khớp dài nhất bắt đầu tại vị trí i: từ khoá hoặc nhãn trong từ vựng (từ khoá thắng khi bằng nhau)
  function findMatch(text?, i?, idx?) {
    const run = gatherWords(text, i, idx.maxWords);
    for (let len = run.length; len >= 1; len--) {
      const key = run
        .slice(0, len)
        .map(w => w.f)
        .join(' ');
      const kw = KEYWORDS.get(key);
      if (kw) return { len, run, kw, key };
      const ents = idx.phrases.get(key);
      if (ents) return { len, run, ents, key };
    }
    return { len: 0, run };
  }

  function scanNumber(text?, i?) {
    let j = i;
    while (isDigit(text[j])) j++;
    while ((text[j] === '.' || text[j] === ',') && isDigit(text[j + 1])) {
      j++;
      while (isDigit(text[j])) j++;
    }
    return j;
  }
  // Số kiểu vi-VN: 1.234.567 · 1.234,5 · 1,5 · 0,15. "1.5" mơ hồ (1.500 hay 1,5): hỏi lại.
  function interpretNumber(lex?) {
    if (/^\d+$/.test(lex)) return { value: Number(lex) };
    const hasDot = lex.includes('.'),
      hasComma = lex.includes(',');
    if (hasDot && hasComma) {
      if (/^[1-9]\d{0,2}(\.\d{3})+,\d+$/.test(lex) || /^0,\d+$/.test(lex))
        return { value: Number(lex.replace(/\./g, '').replace(',', '.')) };
      return { invalid: true };
    }
    if (hasComma) return /^\d+,\d+$/.test(lex) ? { value: Number(lex.replace(',', '.')) } : { invalid: true };
    if (/^[1-9]\d{0,2}(\.\d{3})+$/.test(lex)) return { value: Number(lex.replace(/\./g, '')) };
    if (/^\d+\.\d+$/.test(lex)) {
      const [a, b] = lex.split('.');
      const options = [`${a},${b}`];
      if (a.length <= 3 && b.length < 3) options.push(`${a}.${b.padEnd(3, '0')}`);
      return { ambiguous: true, options };
    }
    return { invalid: true };
  }

  // Câu trả lời của người dùng cho một chỗ mơ hồ: theo "đầu:cuối" (vị trí trong chữ), "@đầu", hoặc theo chữ đã bỏ dấu
  function choiceOf(choices?, phrase?, start?, end?) {
    for (const k of [`${start}:${end}`, `@${start}`, phrase]) if (hasOwn(choices, k)) return choices[k];
    return undefined;
  }

  function tokenize(text?, from?, idx?, opts?, lim?) {
    const toks: any[] = [];
    const errors: any[] = [];
    const questions: any[] = [];
    const choices = isObj(opts.choices) ? opts.choices : {};
    const n = text.length;
    let i = from;
    const err = (code?, message?, s?, e?, extra?) => {
      if (errors.length >= lim.maxErrors) return;
      const o = { code, message, at: { start: s, end: e } };
      if (extra) for (const k of Object.keys(extra)) o[k] = extra[k];
      errors.push(o);
    };
    const prevEndsOperand = () => {
      const p = toks[toks.length - 1];
      return Boolean(p) && (p.k === 'num' || p.k === 'ref' || p.k === 'amb' || p.k === ')');
    };
    const push = (k?, v?, s?, e?) => toks.push({ k, v, start: s, end: e });

    while (i < n) {
      if (toks.length >= lim.maxTokens) {
        err('FORMULA_TOO_LARGE', 'Công thức có quá nhiều thành phần.', i, n);
        break;
      }
      const ch = text[i];
      if (isSpace(ch)) {
        i++;
        continue;
      }

      // ----- số -----
      if (isDigit(ch)) {
        const j = scanNumber(text, i);
        const lex = text.slice(i, j);
        const r = interpretNumber(lex.length > 64 ? lex.slice(0, 64) + '…' : lex);
        let value;
        if (lex.length > 64 || r.invalid) {
          err(
            'PARSE_NUMBER_INVALID',
            `Số ‘${lex.slice(0, 20)}’ không đúng dạng. Dùng 1.234.567, 1.234,5 hoặc 0,15.`,
            i,
            j
          );
          i = j;
          continue;
        }
        if (r.ambiguous) {
          const chosen = choiceOf(choices, lex, i, j);
          if (chosen === undefined) {
            questions.push({
              code: 'PARSE_NUMBER_AMBIGUOUS',
              message: `‘${lex}’ là ${r.options.map(o => `‘${o}’`).join(' hay ')}? Hãy gõ rõ một trong hai cách.`,
              at: { start: i, end: j },
              phrase: lex,
              options: r.options
            });
            i = j;
            continue;
          }
          const cv: any =
            typeof chosen === 'number' ? { value: chosen } : typeof chosen === 'string' ? interpretNumber(chosen) : {};
          if (!isNum(cv.value)) {
            err('PARSE_BAD_CHOICE', `Lựa chọn cho ‘${lex}’ không hợp lệ.`, i, j);
            i = j;
            continue;
          }
          value = cv.value;
        } else value = r.value;
        if (!isNum(value) || value > lim.maxLiteral) {
          err('PARSE_NUMBER_INVALID', `Số ‘${lex.slice(0, 20)}’ quá lớn.`, i, j);
          i = j;
          continue;
        }
        // hậu tố: phần trăm hoặc đơn vị (đồng, giờ, ngày, phút)
        let end = j;
        let unit;
        let k = j;
        while (isSpace(text[k])) k++;
        if (text[k] === '%') {
          unit = 'percent';
          value = value / 100;
          end = k + 1;
        } else if (text[j] === '₫' || ((text[j] === 'đ' || text[j] === 'Đ') && !isWordCh(text[j + 1]))) {
          unit = 'VND';
          end = j + 1;
        } else if (isLetter(text[k])) {
          const m = findMatch(text, k, idx);
          if (m.len === 0) {
            const w = m.run[0];
            if (hasOwn(NUMBER_SUFFIX, w.f)) {
              unit = NUMBER_SUFFIX[w.f];
              end = w.e;
            }
          }
        }
        toks.push({ k: 'num', value, unit, start: i, end });
        i = end;
        continue;
      }

      // ----- chữ: từ khoá hoặc nhãn trong từ vựng, khớp dài nhất trước -----
      if (isLetter(ch)) {
        const m = findMatch(text, i, idx);
        if (m.len > 0) {
          const s = m.run[0].s,
            e = m.run[m.len - 1].e;
          if (m.kw) {
            const kw = m.kw;
            if (kw.x && !prevEndsOperand()) toks.push({ k: 'unk', start: s, end: e });
            else push(kw.k, kw.v, s, e);
          } else if (m.ents.length === 1) toks.push({ k: 'ref', entry: m.ents[0], start: s, end: e });
          else toks.push({ k: 'amb', entries: m.ents, phrase: m.key, start: s, end: e });
          i = e;
        } else {
          const w = m.run[0];
          toks.push({ k: 'unk', start: w.s, end: w.e });
          i = w.e;
        }
        continue;
      }

      // ----- ký hiệu -----
      switch (ch) {
        case '+':
          push('op', 'add', i, i + 1);
          i++;
          break;
        case '-':
        case '−':
        case '–':
          if (ch === '-' && text[i + 1] === '>') {
            push('arrow', null, i, i + 2);
            i += 2;
            break;
          }
          push('op', 'sub', i, i + 1);
          i++;
          break;
        case '×':
        case '*':
          push('op', 'mul', i, i + 1);
          i++;
          break;
        case '÷':
        case '/':
          push('op', 'div', i, i + 1);
          i++;
          break;
        case '→':
          push('arrow', null, i, i + 1);
          i++;
          break;
        case ':':
          push('colon', null, i, i + 1);
          i++;
          break;
        case '(':
          push('(', null, i, i + 1);
          i++;
          break;
        case ')':
          push(')', null, i, i + 1);
          i++;
          break;
        case ';':
          push(';', null, i, i + 1);
          i++;
          break;
        case '=': {
          const w = text[i + 1] === '=' ? 2 : 1;
          push('cmp', 'eq', i, i + w);
          i += w;
          break;
        }
        case '>':
        case '<': {
          const eq = text[i + 1] === '=';
          push('cmp', ch === '>' ? (eq ? 'gte' : 'gt') : eq ? 'lte' : 'lt', i, i + (eq ? 2 : 1));
          i += eq ? 2 : 1;
          break;
        }
        case '≥':
          push('cmp', 'gte', i, i + 1);
          i++;
          break;
        case '≤':
          push('cmp', 'lte', i, i + 1);
          i++;
          break;
        default:
          err('PARSE_UNKNOWN_CHAR', `Ký tự ‘${ch}’ không dùng được trong công thức.`, i, i + 1);
          i++;
      }
    }

    // ----- chữ lạ (gộp chữ lạ liền nhau) và chữ mơ hồ -----
    const out: any[] = [];
    let runs = 0;
    for (let a = 0; a < toks.length; a++) {
      const tk = toks[a];
      if (tk.k === 'unk') {
        let b = a;
        while (toks[b + 1] && toks[b + 1].k === 'unk' && /^\s*$/.test(text.slice(toks[b].end, toks[b + 1].start))) b++;
        const s = tk.start,
          e = toks[b].end;
        const raw = text.slice(s, e);
        let sug = { labels: [] as any[], keys: [] as any[], queryIdx: [] as any[] };
        // khoảng chữ mà mỗi truy vấn đại diện: chỉ chữ lạ, hoặc chữ lạ + nhãn quen liền kề (trước hoặc sau)
        const spans = [{ start: s, end: e }];
        if (runs++ < lim.maxSuggestRuns) {
          const queries = [raw];
          const next = toks[b + 1];
          const prevTk = toks[a - 1];
          if (next && (next.k === 'ref' || next.k === 'amb') && /^\s*$/.test(text.slice(e, next.start))) {
            queries.push(`${raw} ${text.slice(next.start, next.end)}`);
            spans.push({ start: s, end: next.end });
          }
          if (prevTk && (prevTk.k === 'ref' || prevTk.k === 'amb') && /^\s*$/.test(text.slice(prevTk.end, s))) {
            queries.push(`${text.slice(prevTk.start, prevTk.end)} ${raw}`);
            spans.push({ start: prevTk.start, end: e });
          }
          sug = suggest(queries, idx, lim);
        }
        const suggestionReplace = sug.queryIdx.map(qi => ({ ...spans[qi] }));
        err(
          'PARSE_UNKNOWN_WORD',
          `Tôi không biết ‘${raw.slice(0, 40)}’.${sug.labels.length ? ` Ý bạn là: ${sug.labels.map(l => `‘${l}’`).join(', ')}?` : ''}`,
          s,
          e,
          {
            suggestions: sug.labels,
            suggestionKeys: sug.keys,
            suggestionReplace,
            replace: suggestionReplace.length ? { ...suggestionReplace[0] } : { start: s, end: e }
          }
        );
        a = b;
        continue;
      }
      if (tk.k === 'amb') {
        const keys = tk.entries.map(e => e.key);
        const pick1 = choiceOf(choices, tk.phrase, tk.start, tk.end);
        if (pick1 === undefined) {
          questions.push({
            code: 'PARSE_AMBIGUOUS_LABEL',
            message: `‘${text.slice(tk.start, tk.end)}’ có thể là: ${tk.entries.map((e, n) => `(${n + 1}) ${e.label}`).join(', ')}. Chọn một.`,
            at: { start: tk.start, end: tk.end },
            phrase: tk.phrase,
            options: keys,
            optionLabels: tk.entries.map(e => e.label)
          });
        } else {
          const e = tk.entries.find(x => x.key === pick1);
          if (!e)
            err(
              'PARSE_BAD_CHOICE',
              `Lựa chọn ‘${String(pick1).slice(0, 30)}’ không nằm trong các nghĩa của ‘${text.slice(tk.start, tk.end)}’.`,
              tk.start,
              tk.end
            );
          else out.push({ k: 'ref', entry: e, start: tk.start, end: tk.end });
        }
        continue;
      }
      out.push(tk);
    }
    return { toks: out, errors, questions };
  }

  // ---------------------------------------------------------------------------------------------------------------------
  // Bộ phân tích: đệ quy xuống, văn phạm đóng (so sánh chỉ nằm trong điều kiện của "nếu")
  // ---------------------------------------------------------------------------------------------------------------------
  class ParseFail extends Error {
    code: any;
    at: any;

    constructor(code?, message?, at?) {
      super(message);
      this.code = code;
      this.at = at;
    }
  }

  function buildTree(toks?, text?, lim?, constBase?, constLabel?, constants?, idx?) {
    let p = 0;
    let nest = 0;
    let constSeq = 0;
    const eof = { start: text.length, end: text.length };
    const peek = () => toks[p];
    const atOf = (tk?) => (tk ? { start: tk.start, end: tk.end } : eof);
    const fail = (code?, message?, tk?) => {
      throw new ParseFail(code, message, atOf(tk));
    };
    const mk = (node?, s?, e?) => {
      SPAN.set(node, { start: s, end: e });
      return node;
    };
    const sStart = (node?) => SPAN.get(node).start;
    const sEnd = (node?) => SPAN.get(node).end;
    const enter = (tk?) => {
      if (++nest > lim.maxNesting) fail('FORMULA_TOO_LARGE', 'Công thức lồng quá sâu.', tk);
    };
    const leave = () => {
      nest--;
    };
    const slice = (tk?) => text.slice(tk.start, tk.end);

    // Có toán tử mệnh đề (so sánh, và, hoặc, không) ngay tầng ngoặc này? Dùng để phân biệt "(a > b)" với "(a + b) > c"
    const groupHasProp = (open?) => {
      let depth = 0;
      for (let q = open; q < toks.length; q++) {
        const k = toks[q].k;
        if (k === '(') depth++;
        else if (k === ')') {
          depth--;
          if (depth === 0) return false;
        } else if (depth === 1 && (k === 'cmp' || k === 'from' || k === 'and' || k === 'or' || k === 'not'))
          return true;
      }
      return false;
    };

    function expr() {
      const t = peek();
      if (t && t.k === 'if') return cond();
      if (t && t.k === 'tier') return tierExpr();
      return sum();
    }
    // bảng bậc theo <chỉ số>: hàng ; hàng …   hàng := từ a trở lên → x | từ a đến dưới b → y | dưới b → z
    function tierExpr() {
      const kw = toks[p++];
      enter(kw);
      try {
        const by = sum();
        const colon = peek();
        if (!colon || colon.k !== 'colon')
          fail(
            'PARSE_TIER_COLON',
            'Thiếu dấu ‘:’ sau chỉ số của bảng bậc, ví dụ: bảng bậc theo điểm KPI: dưới 75 → 0; từ 75 trở lên → 1.',
            colon
          );
        p++;
        const rows: any[] = [];
        for (;;) {
          const t = peek();
          let from, to;
          if (t && t.k === 'from') {
            p++;
            from = sum();
            const u = peek();
            if (u && u.k === 'upto') p++;
            else if (u && u.k === 'tierto') {
              p++;
              to = sum();
            } else fail('PARSE_TIER_ROW', 'Sau ‘từ …’ cần ‘trở lên’ hoặc ‘đến dưới …’.', u);
          } else if (t && t.k === 'cmp' && t.v === 'lt') {
            p++;
            to = sum();
          } else fail('PARSE_TIER_ROW', 'Mỗi hàng của bảng bậc bắt đầu bằng ‘từ …’ hoặc ‘dưới …’.', t);
          const arrow = peek();
          if (!arrow || arrow.k !== 'arrow') fail('PARSE_TIER_ARROW', 'Thiếu ‘→’ trước giá trị của hàng.', arrow);
          p++;
          const value = expr();
          const row: Record<string, any> = {};
          if (from) row.from = from;
          if (to) row.to = to;
          row.value = value;
          rows.push(row);
          if (rows.length > lim.maxTierRows)
            fail('FORMULA_TOO_LARGE', `Bảng bậc có quá ${lim.maxTierRows} hàng.`, toks[p - 1]);
          const sep = peek(),
            nx = toks[p + 1];
          if (sep && sep.k === ';' && nx && (nx.k === 'from' || (nx.k === 'cmp' && nx.v === 'lt'))) {
            p++;
            continue;
          }
          break;
        }
        return mk({ t: 'tier', by, rows }, kw.start, sEnd(rows[rows.length - 1].value));
      } finally {
        leave();
      }
    }
    function cond() {
      enter(peek());
      try {
        const kw = toks[p++];
        const c = prop();
        const th = peek();
        if (!th || th.k !== 'then') fail('PARSE_EXPECTED_THEN', 'Thiếu ‘thì’ sau điều kiện của ‘nếu’.', th);
        p++;
        const a = expr();
        const el = peek();
        if (!el || el.k !== 'else')
          fail('PARSE_MISSING_ELSE', 'Thiếu ‘ngược lại’. Khoản này bằng bao nhiêu khi điều kiện sai?', el);
        p++;
        const b = expr();
        return mk({ t: 'cond', if: c, then: a, else: b }, kw.start, sEnd(b));
      } finally {
        leave();
      }
    }
    function prop() {
      const first = andP();
      if (!peek() || peek().k !== 'or') return first;
      const args = [first];
      while (peek() && peek().k === 'or') {
        p++;
        args.push(andP());
      }
      return mk({ t: 'or', args }, sStart(first), sEnd(args[args.length - 1]));
    }
    function andP() {
      const first = notP();
      if (!peek() || peek().k !== 'and') return first;
      const args = [first];
      while (peek() && peek().k === 'and') {
        p++;
        args.push(notP());
      }
      return mk({ t: 'and', args }, sStart(first), sEnd(args[args.length - 1]));
    }
    function notP() {
      const t = peek();
      if (t && t.k === 'not') {
        enter(t);
        try {
          p++;
          const a = notP();
          return mk({ t: 'not', arg: a }, t.start, sEnd(a));
        } finally {
          leave();
        }
      }
      return atomP();
    }
    function atomP() {
      const t = peek();
      if (t && t.k === '(' && groupHasProp(p)) {
        enter(t);
        try {
          p++;
          const inner = prop();
          const c = peek();
          if (!c || c.k !== ')')
            fail('PARSE_UNBALANCED', `Thiếu dấu ngoặc đóng ‘)’ cho ngoặc mở ở vị trí ${t.start + 1}.`, t);
          p++;
          return inner;
        } finally {
          leave();
        }
      }
      const left = sum();
      const o = peek();
      if (o && o.k === 'cmp') {
        p++;
        const right = sum();
        const nx = peek();
        if (nx && (nx.k === 'cmp' || nx.k === 'from'))
          fail('PARSE_CHAINED_COMPARE', 'Không so sánh nối tiếp được; dùng ‘và’ để nối hai điều kiện.', nx);
        return mk({ t: 'op', op: o.v, a: left, b: right }, sStart(left), sEnd(right));
      }
      if (o && o.k === 'from') {
        p++;
        const right = sum();
        const u = peek();
        if (!u || u.k !== 'upto') fail('PARSE_EXPECTED_TROLEN', 'Thiếu ‘trở lên’ sau ‘từ …’.', u);
        p++;
        return mk({ t: 'op', op: 'gte', a: left, b: right }, sStart(left), u.end);
      }
      return left;
    }
    function sum() {
      let left = prod();
      for (;;) {
        const t = peek();
        if (!t || t.k !== 'op' || (t.v !== 'add' && t.v !== 'sub')) break;
        p++;
        const right = prod();
        left = mk({ t: 'op', op: t.v, a: left, b: right }, sStart(left), sEnd(right));
      }
      return left;
    }
    function prod() {
      let left = unary();
      for (;;) {
        const t = peek();
        if (!t || t.k !== 'op' || (t.v !== 'mul' && t.v !== 'div')) break;
        p++;
        const right = unary();
        left = mk({ t: 'op', op: t.v, a: left, b: right }, sStart(left), sEnd(right));
      }
      return left;
    }
    function unary() {
      const t = peek();
      if (t && t.k === 'op' && t.v === 'sub') {
        enter(t);
        try {
          p++;
          const a = unary();
          return mk({ t: 'op', op: 'neg', a }, t.start, sEnd(a));
        } finally {
          leave();
        }
      }
      return primary();
    }
    function args(open?, label?) {
      const first = peek();
      if (!first || first.k !== '(')
        fail('PARSE_EXPECTED_PAREN', `Sau ‘${label}’ cần dấu ngoặc, ví dụ: ${label} (a ; b).`, first || open);
      p++;
      const list: any[] = [];
      if (peek() && peek().k === ')') {
        p++;
        return { list, end: toks[p - 1].end };
      }
      for (;;) {
        list.push(expr());
        const t = peek();
        if (t && t.k === ';') {
          p++;
          continue;
        }
        if (!t || t.k !== ')')
          fail('PARSE_UNBALANCED', `Thiếu dấu ngoặc đóng ‘)’ cho ngoặc mở ở vị trí ${first.start + 1}.`, first);
        p++;
        return { list, end: t.end };
      }
    }
    function primary() {
      const t = peek();
      if (!t) fail('PARSE_DANGLING_OPERATOR', 'Công thức kết thúc đột ngột: thiếu một giá trị sau phép toán.', null);
      switch (t.k) {
        case 'num': {
          p++;
          const bare = t.unit === undefined;
          if (bare && (t.value === 0 || t.value === 1)) return mk({ t: 'lit', v: t.value }, t.start, t.end);
          // Mọi số khác 0 và 1 tự thành một tham số của công thức: cây không chứa số viết thẳng
          const key = `formula.${constBase}.const.${++constSeq}`;
          const node: Record<string, any> = { t: 'param', key, value: t.value };
          if (t.unit !== undefined) node.unit = t.unit;
          constants.push({
            key,
            value: t.value,
            unit: t.unit,
            at: { start: t.start, end: t.end },
            label: `Hằng số ${constSeq} của công thức ‘${constLabel}’`
          });
          return mk(node, t.start, t.end);
        }
        case 'ref': {
          p++;
          const e = t.entry;
          if (e.kind === 'variable') return mk({ t: 'var', id: e.key }, t.start, t.end);
          if (e.kind === 'parameter') return mk({ t: 'param', key: e.key }, t.start, t.end);
          if (e.kind === 'formula') return mk({ t: 'ref', name: e.key }, t.start, t.end);
          // hàm có sẵn: có thể không đối số ("tiền OT") hoặc có đối số ("làm tròn đồng (a)")
          const nx = peek();
          if (nx && nx.k === '(') {
            enter(t);
            try {
              const a = args(t, text.slice(t.start, t.end));
              return mk({ t: 'builtin', name: e.key, args: a.list }, t.start, a.end);
            } finally {
              leave();
            }
          }
          return mk({ t: 'builtin', name: e.key, args: [] }, t.start, t.end);
        }
        case 'fn': {
          p++;
          enter(t);
          try {
            const a = args(t, slice(t));
            return mk({ t: 'fn', name: t.v, args: a.list }, t.start, a.end);
          } finally {
            leave();
          }
        }
        case '(': {
          enter(t);
          try {
            p++;
            const inner = expr();
            const c = peek();
            if (!c || c.k !== ')') {
              if (c && c.k !== ';')
                fail('PARSE_UNEXPECTED_TOKEN', `Không hiểu ‘${slice(c)}’ ở đây (so sánh chỉ dùng trong ‘nếu …’).`, c);
              fail('PARSE_UNBALANCED', `Thiếu dấu ngoặc đóng ‘)’ cho ngoặc mở ở vị trí ${t.start + 1}.`, t);
            }
            p++;
            return inner;
          } finally {
            leave();
          }
        }
        case ')':
          fail('PARSE_EMPTY_EXPRESSION', 'Ngoặc rỗng hoặc thừa dấu ngoặc đóng ‘)’: thiếu biểu thức bên trong.', t);
          break;
        case 'op':
          fail('PARSE_DANGLING_OPERATOR', `Thiếu một giá trị trước ‘${slice(t)}’.`, t);
          break;
        default:
          fail('PARSE_EXPECTED_OPERAND', `Cần một giá trị ở đây, nhưng gặp ‘${slice(t)}’.`, t);
      }
      return null;
    }

    const tree = expr();
    const rest = peek();
    if (rest) {
      if (rest.k === ')') fail('PARSE_UNBALANCED', 'Thừa dấu ngoặc đóng ‘)’.', rest);
      if (rest.k === 'then' || rest.k === 'else')
        fail('PARSE_UNEXPECTED_TOKEN', `‘${slice(rest)}’ chỉ đi sau ‘nếu …’.`, rest);
      const prev = toks[p - 1];
      const startsOperand = rest.k === 'num' || rest.k === 'ref' || rest.k === 'fn' || rest.k === '(';
      if (prev && startsOperand)
        fail('PARSE_MISSING_OPERATOR', `Thiếu phép toán giữa ‘${slice(prev)}’ và ‘${slice(rest)}’.`, rest);
      if (rest.k === 'cmp' && rest.v === 'eq')
        fail(
          'PARSE_MULTIPLE_EQUALS',
          'Chỉ có một dấu ‘=’ (gán) trong công thức; so sánh chỉ dùng trong ‘nếu …’.',
          rest
        );
      fail('PARSE_UNEXPECTED_TOKEN', `Không hiểu ‘${slice(rest)}’ ở đây.`, rest);
    }
    return { tree, idx };
  }

  // Vế trái "Tên =": phân biệt với dấu = của phép so sánh trong "nếu …"
  function splitTarget(text?) {
    for (let i = 0; i < text.length; i++) {
      if (text[i] !== '=') continue;
      const before = text[i - 1],
        after = text[i + 1];
      if (before === '<' || before === '>' || before === '=' || before === '!' || after === '=') {
        if (after === '=') i++;
        continue;
      }
      return i;
    }
    return -1;
  }

  function parse(text?, opts?) {
    opts = isObj(opts) ? opts : {};
    const lim = limitsOf(opts);
    const out: Record<string, any> = { ok: false, errors: [], questions: [], constants: [] };
    const fail = (code?, message?, s?, e?) => {
      out.errors.push({ code, message, at: { start: s, end: e } });
      return out;
    };
    if (typeof text !== 'string') return fail('PARSE_EMPTY', 'Công thức phải là chữ.', 0, 0);
    if (text.length > lim.maxTextChars)
      return fail(
        'FORMULA_TOO_LARGE',
        `Công thức dài ${text.length} ký tự, tối đa ${lim.maxTextChars}.`,
        lim.maxTextChars,
        text.length
      );
    if (!/\S/.test(text)) return fail('PARSE_EMPTY', 'Chưa nhập công thức.', 0, text.length);

    const idx = buildIndex(opts.vocabulary, lim, opts.formulas);
    const eq = splitTarget(text);
    const lhs = eq < 0 ? '' : text.slice(0, eq);
    const lws = wordsOf(lhs);
    const lhsFolded = lws.map(w => w.f).join(' ');
    const lhsPlain = lws.length > 0 && /^[\p{L}\p{M}\p{N}_\s]+$/u.test(lhs);
    const lhsEntries = idx.phrases.get(lhsFolded) || [];
    const lhsReserved = lws.some(w => RESERVED_LHS.has(w.f));
    if (eq < 0 || !lws.length || (lhsReserved && !lhsEntries.length))
      return fail(
        'PARSE_MISSING_TARGET',
        'Thiếu vế trái và dấu ‘=’. Viết dạng ‘Tên công thức = biểu thức’, ví dụ ‘Tổng thu nhập = lương cơ bản + đi lại’.',
        0,
        text.length
      );
    if (!lhsPlain)
      return fail('PARSE_BAD_TARGET', 'Vế trái của ‘=’ phải là tên công thức, không có phép toán hay dấu câu.', 0, eq);
    const tStart = lws[0].s,
      tEnd = lws[lws.length - 1].e;

    // vế trái: một công thức có sẵn trong từ vựng, hoặc một tên mới
    let target;
    if (lhsEntries.length) {
      let cands = lhsEntries;
      const formulasOnly = cands.filter(e => e.kind === 'formula');
      if (formulasOnly.length) cands = formulasOnly;
      else {
        const assignable = cands.filter(e => e.kind === 'builtin');
        if (assignable.length) cands = assignable;
      }
      if (cands.length > 1) {
        const choices = isObj(opts.choices) ? opts.choices : {};
        const pickKey = choiceOf(choices, lhsFolded, tStart, tEnd);
        const chosen = pickKey === undefined ? null : cands.find(e => e.key === pickKey);
        if (chosen) cands = [chosen];
        else
          out.questions.push({
            code: 'PARSE_AMBIGUOUS_LABEL',
            message: `Tên ‘${text.slice(tStart, tEnd)}’ có thể là: ${cands.map((e, n) => `(${n + 1}) ${e.label}`).join(', ')}. Chọn một.`,
            at: { start: tStart, end: tEnd },
            phrase: lhsFolded,
            options: cands.map(e => e.key),
            optionLabels: cands.map(e => e.label)
          });
      }
      if (cands.length === 1) target = { key: cands[0].key, label: cands[0].label, known: true };
    } else {
      const name = text.slice(tStart, tEnd).replace(/\s+/g, ' ');
      if (name.length > lim.maxNameChars)
        return fail('FORMULA_TOO_LARGE', `Tên công thức dài quá ${lim.maxNameChars} ký tự.`, tStart, tEnd);
      target = { key: name, label: name, known: false };
    }

    const tk = tokenize(text, eq + 1, idx, opts, lim);
    out.errors.push(...tk.errors);
    out.questions.push(...tk.questions);
    if (out.errors.length || out.questions.length) return out;
    if (!tk.toks.length) return fail('PARSE_EMPTY_EXPRESSION', 'Thiếu biểu thức sau dấu ‘=’.', eq, eq + 1);

    try {
      const built = buildTree(
        tk.toks,
        text,
        lim,
        target ? (target.known ? target.key.replace(/[^A-Za-z0-9_]/g, '') || 'x' : slugKey(target.key)) : 'x',
        target ? target.label : 'x',
        out.constants,
        idx
      );
      out.tree = built.tree;
    } catch (e) {
      if (e instanceof ParseFail) {
        out.constants = [];
        return fail(e.code, e.message, e.at.start, e.at.end);
      }
      throw e;
    }
    if (target) {
      out.tree.target = target.key;
      TARGET_SPAN.set(out.tree, { start: tStart, end: tEnd });
      out.target = target;
    }
    out.newParameters = out.constants;
    out.ok = true;
    return out;
  }

  return Object.freeze({
    version: 1,
    LIMITS,
    FormulaError,
    parse,
    validate,
    describe,
    evaluate,
    serialize,
    deserialize,
    dependencies,
    checkVocabulary,
    fold
  });
});
