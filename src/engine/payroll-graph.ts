(function (root: any, factory: any) {
  // PayrollEngine và KpiScore chỉ cần khi dựng ctx (contextFor) nên nạp LƯỜI: bộ máy tính lương sẽ nạp mô-đun này, không được vòng tròn
  const isNode = typeof module === 'object' && module.exports;
  const deps = isNode
    ? {
        Formula: require('./formula'),
        Vocab: require('./formula-vocab'),
        get PayrollParams() {
          return require('./payroll-params');
        },
        get PayrollEngine() {
          return require('./payroll-engine');
        },
        get KpiScore() {
          return require('./kpi-score');
        }
      }
    : {
        Formula: root.Formula,
        Vocab: root.FormulaVocab,
        get PayrollParams() {
          return root.PayrollParams;
        },
        get PayrollEngine() {
          return root.PayrollEngine;
        },
        get KpiScore() {
          return root.KpiScore;
        }
      };
  const api = factory(deps);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PayrollGraph = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (DEPS) {
  'use strict';
  // Đồ thị công thức tháng MẶC ĐỊNH: mỗi công thức tháng của
  // DEPS.PayrollEngine.FORMULAS viết một lần bằng CHỮ tiếng Việt chuẩn, phân tích thành cây bằng Formula.parse, và cây tính ra ĐÚNG từng bit
  // số của bản tham chiếu viết bằng mã (test/fixtures/legacy-payroll-block.ts).
  // Chữ dưới đây chỉ là nguồn viết; cái được tính là cây (bộ máy nạp cây qua params['formula.<tên>'], xem resolveFormulaTrees).
  //
  // Xuất:
  //   DEFAULT_GRAPH  { <khoá>: { key, label, text, tree } }   text = Formula.describe(tree): chữ đọc lại được, parse ra đúng cây này
  //   TEXTS          chữ nguồn đã viết tay (trước khi qua parse)
  //   contextFor(m, staff, params)   ctx đủ cho Formula.evaluate: ctx của bộ máy + biến/cờ mà bộ máy chưa công bố + ctx.scope.type
  //   evalNamed(key, ctx)            tính một công thức tháng có tên; ctx.formulas (nếu có) ghi đè cây mặc định theo từng khoá
  //   treesWith(saved)               { <khoá>: cây } = cây mặc định, thay bằng cây đã lưu `formula.<tên>` (đã deserialize) nếu có
  //   validateDefaults()             kiểm cả đồ thị mặc định (đơn vị, miền, vòng, khoản bắt buộc); trả danh sách lỗi (rỗng = sạch)
  const { Formula, Vocab } = DEPS;

  // Chữ chuẩn của từng công thức. Nhãn trong chữ là nhãn của từ vựng (src/engine/formula-vocab.ts, sinh từ bộ máy).
  // Ghi chú đối chiếu với công thức viết bằng mã:
  //   - 'tỷ lệ phụ cấp đi lại theo loại' = p('type.<type>.travel'): một cây cho mọi loại, ctx.scope.type chọn loại.
  //   - 'vượt ngưỡng giờ KPI (a ; b)' = so(p('kpi.overLimitCompare'), a, b): phép so sánh là tham số registry, không viết sẵn dấu.
  //   - Bộ máy viết `(p('...') || 0)` cho đi lại và chuyên cần; ở đây khoá luôn có với loại có phụ cấp (cờ 'loại có phụ cấp'), nên
  //     không cần `|| 0`; thiếu khoá của một loại là lỗi FORMULA_MISSING_INPUT, không âm thầm bằng 0.
  //   - 'tạm ứng' dưới đây chỉ còn là MỨC TỐI ĐA được xin (m.trace.tamUngToiDa); số trừ vào lương = tổng yêu cầu ứng lương Admin đã
  //     duyệt của tháng, 0 nếu chưa có. Giữ nguyên chữ vì nó phải parse ra đúng cây đã lưu formula.tamUng.
  const TEXTS = Object.freeze({
    tyLeNgayDiLam: 'tỷ lệ ngày đi làm = số ngày đi làm ÷ ngày công chuẩn',
    phuCapDiLai:
      'đi lại = nếu loại có phụ cấp thì (nếu ở iDorm thì 0 ngược lại lương cơ bản của level × tỷ lệ phụ cấp đi lại theo loại × tỷ lệ ngày đi làm) ngược lại 0',
    phuCapChuyenCan:
      'chuyên cần = nếu loại có phụ cấp thì (nếu giữ được chuyên cần (ngày nghỉ xét chuyên cần ; giờ vượt ngưỡng ; ngưỡng ngày nghỉ chuyên cần theo loại) thì lương cơ bản của level × tỷ lệ chuyên cần theo loại × tỷ lệ ngày đi làm ngược lại 0) ngược lại 0',
    heSoNgayKpi:
      'hệ số ngày KPI = nếu vượt ngưỡng giờ KPI (giờ vượt ngưỡng ; ngưỡng giờ vượt KPI) thì tỷ lệ ngày đi làm ngược lại 1',
    luongKpi:
      'lương KPI = nếu loại có KPI thì (nếu KPI đạt thì (nếu KPI năm thành phần thì tiền KPI theo điểm năm thành phần (mức KPI ; điểm KPI ; hệ số ngày KPI) ngược lại tiền KPI theo phần trăm (mức KPI ; điểm KPI ; hệ số ngày KPI)) ngược lại 0) ngược lại 0',
    tongThuNhap: 'tổng thu nhập = tổng sáu thành phần ngày + (đi lại + chuyên cần) + lương KPI',
    tamUng: 'tạm ứng = nếu bật tạm ứng thì làm tròn đồng (tỷ lệ tạm ứng × cơ sở tạm ứng) ngược lại 0'
  });
  const ORDER = Object.freeze([
    'tyLeNgayDiLam',
    'phuCapDiLai',
    'phuCapChuyenCan',
    'heSoNgayKpi',
    'luongKpi',
    'tongThuNhap',
    'tamUng'
  ]);

  const labelOf = (key?) => {
    const e = Vocab.byKey(key);
    return e ? e.label : key;
  };

  const DEFAULT_GRAPH: Record<string, any> = {};
  const TREES: Record<string, any> = {};
  for (const key of ORDER) {
    const res = Formula.parse(TEXTS[key], { vocabulary: Vocab });
    if (!res.ok || !res.tree || res.target.key !== key)
      throw new Error(
        `payroll-graph: không phân tích được công thức ${key}: ${JSON.stringify(res.errors.concat(res.questions))}`
      );
    TREES[key] = res.tree;
    DEFAULT_GRAPH[key] = { key, label: labelOf(key), text: Formula.describe(res.tree, Vocab), tree: res.tree };
  }
  Object.freeze(DEFAULT_GRAPH);

  function validateDefaults() {
    const errors: any[] = [];
    for (const key of ORDER) {
      const v = Formula.validate(TREES[key], { vocabulary: Vocab, formulas: TREES });
      for (const e of v.errors) errors.push({ key, ...e });
    }
    return errors;
  }

  // Từ vựng để kiểm cây công thức: từ vựng gốc (formula-vocab.js). Thuộc tính của bậc không phải biến công thức nên `params` không đổi gì;
  // tham số giữ để lời gọi vocabularyFor(params) vẫn chạy.
  function vocabularyFor(_params?: any) {
    return Vocab;
  }

  // Kiểm MỘT cây công thức `name` đúng như bộ máy sẽ nạp nó: đồ thị gồm cây mặc định cộng các cây của bộ tham số (`saved`: { <tên>: cây }) để bắt vòng
  // qua cây mặc định, và giá trị tham số của tháng (cạnh bảng bậc là tham số). src/params/validate.ts → checkFormula gọi hàm này thay cho Formula.validate trần.
  function validateTree(name?, tree?, params?, saved?) {
    return Formula.validate(tree, {
      vocabulary: vocabularyFor(params),
      target: name,
      formulas: treesWith({ ...(saved || {}), [name]: tree }),
      parameters: params
    });
  }

  const treesWith = (saved?) => {
    const out: Record<string, any> = { ...TREES };
    if (saved && typeof saved === 'object') for (const k of Object.keys(saved)) if (saved[k]) out[k] = saved[k];
    return out;
  };

  // Biến và cờ mà bộ máy tháng dùng nội bộ (v trong calcMonth) nhưng DEPS.PayrollEngine.VARIABLES chưa công bố: dựng lại từ kết quả tháng m,
  // hồ sơ và loại nhân sự.
  function extraVariables(m?, staff?, params?) {
    const k = DEPS.PayrollEngine.kernelFor(params);
    const T = k.typeOf(staff);
    const five = m.kpiMethod === 'five';
    const out: Record<string, any> = {
      gioOt: m.otHours,
      gioLamBu: m.makeupHours,
      gioLamLe: m.holWorkHours,
      gioDem: m.nightHours,
      loaiCoPhuCap: Number(!!(T.travel || T.attendance)),
      coKpi: Number(!!T.kpi),
      batTamUng: Number(staff.advanceOn !== false),
      kpiNamThanhPhan: Number(five),
      kpiDat: 0
    };
    if (T.kpi) {
      if (five) {
        // KPI năm thành phần: điểm đưa vào tính tiền là số nguyên điểm × 100 (units), không phải m.kpiPct
        const e = DEPS.KpiScore.evaluate(m.kpiParts || undefined, { pass: T.kpiPass });
        out.kpiDat = Number(!!e.pass);
        out.diemKpi = e.units;
      } else {
        out.kpiDat = Number(!!m.kpiPass);
        out.diemKpi = m.kpiPct;
      }
    }
    return out;
  }

  // ctx cho Formula.evaluate của MỘT người trong MỘT tháng đã tính (m = kết quả calcMonth / computeMonth)
  function contextFor(m?, staff?, params?, saved?) {
    const base = DEPS.PayrollEngine.contextFor(m, staff, params);
    const k = DEPS.PayrollEngine.kernelFor(params);
    const typeId = k.typeKey(staff); // cùng cách chọn loại với bộ máy (loại lạ là PAYROLL_BAD_TYPE, không rơi về loại nào)
    const compare = DEPS.PayrollEngine.BUILTINS.so.fn;
    return {
      ...base,
      variables: {
        ...base.variables,
        ...extraVariables(m, staff, params),
        ...DEPS.PayrollEngine.dayVariablesOf(m, params)
      },
      builtins: {
        ...base.builtins,
        // phép so sánh có tên: phép (gt, gte…) là tham số registry kpi.overLimitCompare
        vuotNguongKpi: ([a, b]: any, p?) => compare([(p || params)['kpi.overLimitCompare'], a, b])
      },
      scope: { type: typeId },
      formulas: treesWith(saved)
    };
  }

  function evalNamed(key?, ctx?) {
    const formulas = { ...TREES, ...((ctx && ctx.formulas) || {}) };
    const tree = formulas[key];
    if (!tree) throw new Error(`payroll-graph: không có công thức có tên ‘${key}’`);
    return Formula.evaluate(tree, { ...ctx, formulas });
  }

  return {
    DEFAULT_GRAPH,
    TEXTS,
    ORDER,
    treesWith,
    vocabularyFor,
    validateTree,
    contextFor,
    extraVariables,
    evalNamed,
    validateDefaults
  };
});
