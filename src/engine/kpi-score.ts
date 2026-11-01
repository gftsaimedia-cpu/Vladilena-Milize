(function (root: any, factory: any) {
  // payroll-params.js phải nạp trước trang (trình duyệt) để mô-đun lấy mặc định từ DEFAULTS; vắng thì dùng FALLBACK.
  const params = typeof module === 'object' && module.exports ? require('./payroll-params') : root.PayrollParams;
  const api = factory(params);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KpiScore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (PayrollParams) {
  'use strict';
  // KPI theo 5 thành phần của Quy chế lương 3P.
  // Module thuần, dùng chung trình duyệt (window.KpiScore) và máy chủ (require): không DOM, không DB, không đồng hồ.
  // Điểm nhập 0 đến 100, tối đa 2 chữ số thập phân. Mọi phép so sánh và cộng dồn làm trên SỐ NGUYÊN (điểm × 100) để không
  // dính sai số số thực (1,15 × 100 = 114,99999999999999). Điều kiện KPI: Base Wework ≥ ngưỡng VÀ tổng điểm ≥ mốc đạt. Mốc đạt của tổng KHÔNG nằm ở đây: nơi gọi truyền vào (opts.pass = TYPES[type].kpiPass).

  // Năm thành phần (thứ tự này là thứ tự hiển thị và thứ tự khóa trong API); trọng số (tổng 100) và các mốc đọc từ bộ tham số.
  const COMPONENT_KEYS = Object.freeze(['wework', 'user', 'peer', 'manager', 'self']);
  // Mọi trọng số, mốc Base Wework và ô chính sách đến từ bộ tham số phẳng `params` qua create(params); hàm trần của mô-đun =
  // create(mặc định), mặc định là PayrollParams.DEFAULTS. FALLBACK là bản chép của đúng các khoá mô-đun này đọc,
  // để trang chưa nạp payroll-params.js (và test nạp mô-đun trong `vm`) vẫn chạy. Phải bằng PayrollParams.DEFAULTS
  // (scripts/params/check-fallbacks.ts kiểm).
  const FALLBACK = Object.freeze({
    'kpi.weight.wework': 40, // Base Wework
    'kpi.weight.user': 24, // người dùng
    'kpi.weight.peer': 18, // đồng nghiệp
    'kpi.weight.manager': 12, // quản lý trực tiếp
    'kpi.weight.self': 6, // tự đánh giá
    'kpi.weworkMin': 75, // điểm Base Wework từ mốc này trở lên mới được xét KPI tháng (bằng mốc là qua)
    'kpi.belowPassRule': 'zero',
    'kpi.weworkGateRule': 'zero',
    'kpi.incompleteRule': 'waiting'
  });
  // Tên ô chính sách của mã → khoá registry. Mỗi ô chọn một cách xử lý;
  // muốn đổi cách tính thì đổi giá trị khoá (và đoạn mã dùng nó trong evaluate) cùng với test. Xem ALLOWED cho giá trị mã hiểu.
  const POLICY_KEYS = Object.freeze({
    belowPass: 'kpi.belowPassRule', // tổng dưới mốc đạt thì KPI tháng bằng 0 ('proportional' = vẫn trả theo %, chưa xây)
    weworkGate: 'kpi.weworkGateRule', // Base Wework dưới mốc thì KPI tháng bằng 0 ('warn' = chỉ cảnh báo, chưa xây)
    incomplete: 'kpi.incompleteRule' // chưa đủ 5 điểm thì "chờ điểm": KPI 0, chưa cộng vào tổng ('lastMonth', 'self' chưa xây)
  });
  const ALLOWED = Object.freeze({
    belowPass: Object.freeze(['zero']),
    weworkGate: Object.freeze(['zero']),
    incomplete: Object.freeze(['waiting'])
  });

  const SCORE_ERROR = 'Điểm phải là số từ 0 đến 100, tối đa 2 chữ số thập phân';

  // Điểm → số nguyên (điểm × 100). Chỉ dùng cho điểm đã qua checkScore.
  const toUnits = (score?) => Math.round(score * 100);
  const isFiniteNumber = (v?) => typeof v === 'number' && Number.isFinite(v);

  // Kiểm một điểm. Từ chối (không kẹp) mọi giá trị ngoài 0..100, kiểu khác số, hoặc quá 2 chữ số thập phân. null = xóa điểm.
  function checkScore(v?) {
    if (v === null) return { ok: true, value: null };
    if (!isFiniteNumber(v) || v < 0 || v > 100) return { ok: false, error: SCORE_ERROR };
    // Đúng tối đa 2 chữ số thập phân: làm tròn về phần trăm phải cho lại chính giá trị đó (74,999999999 bị từ chối, 87,5 và 1,15 qua)
    if (Math.round(v * 100) / 100 !== v) return { ok: false, error: SCORE_ERROR };
    return { ok: true, value: v === 0 ? 0 : v }; // -0 thành 0
  }

  // Một điểm có tính là "đã nhập" không: số hợp lệ 0..100 (điểm 0 là đã nhập). Giá trị hỏng coi như chưa nhập để không trả tiền nhầm.
  const present = (v?) => v !== null && v !== undefined && checkScore(v).ok;

  // Lương KPI = mức KPI × units / 1.000.000 × hệ số ngày nghỉ. Không làm tròn giữa chừng (VND() làm tròn khi hiển thị).
  // Nơi gọi đã kẹp mức KPI ở trần level và chỉ gọi khi evaluate(...).pass là true.
  function pay(amt?, units?, ratio?) {
    return ((amt * units) / 1000000) * ratio;
  }

  // Bộ tham số phẳng → trọng số, mốc Base Wework, ô chính sách và evaluate. Khoá vắng là lỗi (không đoán giá trị).
  function build(P?) {
    const need = (key?) => {
      if (!Object.hasOwn(P, key))
        throw Object.assign(new Error(`Thiếu tham số ${key}`), { code: 'PARAM_MISSING', key });
      return P[key];
    };
    const COMPONENTS = Object.freeze(
      COMPONENT_KEYS.map(key => Object.freeze({ key, weight: need(`kpi.weight.${key}`) }))
    );
    const WEWORK_MIN = need('kpi.weworkMin');
    const POLICY: Record<string, any> = {};
    for (const [name, key] of Object.entries(POLICY_KEYS)) {
      POLICY[name] = need(key);
      if (!ALLOWED[name].includes(POLICY[name]))
        throw Object.assign(new Error(`Tham số ${key} có giá trị không hợp lệ`), { code: 'PARAM_INVALID_VALUE', key });
    }
    Object.freeze(POLICY);

    // Đánh giá năm điểm. parts = { wework, user, peer, manager, self } (khóa vắng, null, undefined = chưa nhập), opts.pass = mốc tổng đạt (%).
    // Trả { complete, missing[], units, total, weworkOk, pass, reason }:
    //   units = Σ (điểm × 100) × trọng số (số nguyên; 1.000.000 = 100%), total = units / 10000 (để hiển thị),
    //   weworkOk = Base Wework ≥ 75 (null khi chưa có điểm Wework), pass = đạt và được trả tiền,
    //   reason = 'incomplete' | 'wework' | 'below-pass' | 'ok' (xét theo thứ tự này). Đạt khi Base Wework ≥ ngưỡng VÀ tổng ≥ opts.pass (bằng mốc là đạt).
    function evaluate(parts?, opts?) {
      const pass = opts && opts.pass;
      if (!isFiniteNumber(pass)) throw new TypeError('KpiScore.evaluate cần mốc đạt (opts.pass)');
      const source = parts && typeof parts === 'object' ? parts : {};
      const missing = COMPONENTS.filter(c => !present(source[c.key])).map(c => c.key);
      const weworkOk = present(source.wework) ? toUnits(source.wework) >= WEWORK_MIN * 100 : null;
      const complete = missing.length === 0;
      const units = complete ? COMPONENTS.reduce((sum, c) => sum + toUnits(source[c.key]) * c.weight, 0) : 0;
      let reason;
      if (!complete) reason = 'incomplete';
      else if (!weworkOk) reason = 'wework';
      else if (units < pass * 10000) reason = 'below-pass';
      else reason = 'ok';
      return {
        complete,
        missing,
        units,
        total: complete ? units / 10000 : null,
        weworkOk,
        pass: reason === 'ok',
        reason
      };
    }

    return { COMPONENTS, WEWORK_MIN, POLICY, evaluate };
  }

  // Một bộ tham số → một bản mô-đun (nhớ theo đối tượng: bộ tham số của tháng được đóng băng và dùng lại cho cả bảng lương)
  const built = new WeakMap<any, any>();
  function create(params?) {
    if (!params || typeof params !== 'object')
      throw new TypeError('create(params): cần bộ tham số phẳng (PayrollParams.DEFAULTS)');
    if (!built.has(params)) {
      const own = build(params);
      built.set(params, Object.freeze({ ...own, ALLOWED, checkScore, toUnits, pay, FALLBACK, create }));
    }
    return built.get(params);
  }
  // Mặc định: PayrollParams.DEFAULTS (hàm trần của mô-đun = create(mặc định)); vắng payroll-params.js thì FALLBACK
  return create(PayrollParams && PayrollParams.DEFAULTS ? PayrollParams.DEFAULTS : FALLBACK);
});

/* Tự kiểm tra: node src/engine/kpi-score.ts */
if (typeof require !== 'undefined' && require.main === module) {
  const assert = require('node:assert');
  const K = module.exports;
  const p = (a?, b?, c?, d?, e?) => ({ wework: a, user: b, peer: c, manager: d, self: e });
  assert.deepEqual(
    K.COMPONENTS.map(c => c.weight),
    [40, 24, 18, 12, 6]
  );
  assert.equal(
    K.COMPONENTS.reduce((s, c) => s + c.weight, 0),
    100
  );
  for (const key of Object.keys(K.POLICY)) assert.ok(K.ALLOWED[key].includes(K.POLICY[key]), `POLICY.${key}`);
  assert.equal(K.checkScore(87.5).ok, true);
  assert.equal(K.checkScore(null).value, null);
  for (const bad of [101, -1, 87.125, NaN, '90', true]) assert.equal(K.checkScore(bad).ok, false);
  const e = K.evaluate(p(100, 90, 80, 85, 100), { pass: 75 });
  assert.equal(e.units, 922000);
  assert.equal(e.total, 92.2);
  assert.equal(K.pay(6000000, e.units, 1), 5532000);
  assert.equal(K.evaluate(p(80, 70, 70, 70, 70), { pass: 75 }).reason, 'below-pass'); // wework đạt nhưng tổng 74%
  assert.equal(K.evaluate(p(74, 100, 100, 100, 100), { pass: 75 }).reason, 'wework');
  assert.equal(K.evaluate(p(75, 75, 75, 75, 75), { pass: 75 }).pass, true); // đúng mốc là đạt
  assert.equal(K.evaluate(p(90, 90, 90, 90, null), { pass: 75 }).reason, 'incomplete');
  console.log('kpi-score.js: OK');
}
