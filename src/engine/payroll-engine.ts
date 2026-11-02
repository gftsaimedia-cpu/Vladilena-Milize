(function (root: any, factory: any) {
  const isNode = typeof module === 'object' && module.exports;
  const deps = isNode
    ? {
        PayrollParams: require('./payroll-params'),
        PayrollCalendar: require('./payroll-calendar'),
        KpiScore: require('./kpi-score'),
        ApprovalView: require('./approval-view'),
        ActualHours: require('./actual-hours'),
        PunchRules: require('./punch'),
        Formula: require('./formula'),
        FormulaVocab: require('./formula-vocab'),
        PayrollGraph: require('./payroll-graph'),
        PayEntriesCalc: require('./pay-entries-calc'),
        PayBlocksCalc: require('./pay-blocks-calc'),
        WorkSchedule: require('./work-schedule'),
        PayOptions: require('./pay-options-calc'),
        PayTailCalc: require('./pay-tail-calc'),
        PayrollPins: require('./payroll-pins'),
        PayrollDayParts: require('./payroll-day-parts')
      }
    : {
        PayrollParams: root.PayrollParams,
        PayrollCalendar: root.PayrollCalendar,
        KpiScore: root.KpiScore,
        ApprovalView: root.ApprovalView,
        ActualHours: root.ActualHours,
        PunchRules: root.PunchRules,
        Formula: root.Formula,
        FormulaVocab: root.FormulaVocab,
        PayrollGraph: root.PayrollGraph,
        PayEntriesCalc: root.PayEntriesCalc,
        PayBlocksCalc: root.PayBlocksCalc,
        WorkSchedule: root.WorkSchedule,
        PayOptions: root.PayOptions,
        PayTailCalc: root.PayTailCalc,
        PayrollPins: root.PayrollPins,
        PayrollDayParts: root.PayrollDayParts
      };
  const api = factory(deps);
  if (isNode) module.exports = api;
  else root.PayrollEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (DEPS) {
  'use strict';
  // Bộ máy tính lương dùng chung.
  // Thuần: không I/O, không đồng hồ (trừ deps.today khi người gọi không truyền upTo), không DOM. MỌI con số đến từ `params` (bộ tham số phẳng: PayrollParams.DEFAULTS hoặc store.resolve(tháng).params); mã này chỉ dùng 0 và 1. Công thức, tỷ lệ và chỗ làm tròn giữ NGUYÊN như khối công thức trong src/engine/index.html (bản đóng băng test/fixtures/legacy-payroll-block.ts):
  // bài so sánh kép (test/unit/payroll-engine-differential.test.ts) chứng minh bằng nhau đến từng trường, kể cả rows và m.net. Ba lớp: lớp ngày (thanhPhanNgay: calcDay và các thành phần có tên) · lớp tháng (mỗi công thức có tên là MỘT biểu thức: FORMULAS) · lớp thực lĩnh (khung khoá bảy bước, calcNet) BUILTINS và VARIABLES là DỮ LIỆU (mã, nhãn, từ đồng nghĩa, đơn vị, miền, chữ ký); m.trace ghi giá trị từng công thức có tên.
  const ENGINE_VERSION = 'payroll-engine-14'; // tăng tay khi đổi công thức (verify báo engineChanged)
  // Ngày giả (một thứ Hai) khi gọi calcDay lẻ không có ngữ cảnh, như khối công thức của index.html: chỉ để chia giờ theo ngày dân sự, không ảnh hưởng tiền theo ngày thật
  const SENTINEL_DATE = '2000-01-03';
  const SENTINEL_HOLIDAYS = ['2000-01-03', '2000-01-04'];
  // Lương cơ bản thực nhận của một dòng ngày để tính tạm ứng: ngày đi làm = lương ngày − tiền thiếu giờ; ngày lễ có đi làm thật = lương ngày lễ (holBase);
  // mọi ngày khác 0 (OT, OT ngày lễ, phụ cấp ca, giờ nghỉ đêm và tiền làm bù không vào)
  const advancePayOfDay = (c?) =>
    c.kind === 'work' ? c.daily - c.cut : c.kind === 'holiday' && c.hours > 0 ? c.holBase : 0;

  /* ========================= phép so sánh có tên (khoá …Compare của registry) ========================= */
  const COMPARE = {
    gt: (a?, b?) => a > b,
    gte: (a?, b?) => a >= b,
    lt: (a?, b?) => a < b,
    lte: (a?, b?) => a <= b
  };
  // Đảo phép so sánh: "mất khi ≥ ngưỡng" (gte) thì "còn giữ khi < ngưỡng" (lt)
  const INVERSE = { gt: 'lte', gte: 'lt', lt: 'gte', lte: 'gt' };
  function so(op?, a?, b?) {
    if (!Object.hasOwn(COMPARE, op)) throw paramError(`Phép so sánh không hợp lệ: ${op}`, 'PARAM_INVALID_VALUE');
    return COMPARE[op](a, b);
  }
  function paramError(message?, code?, key?) {
    return Object.assign(new Error(message), { code, key });
  }

  /* ========================= cây công thức tháng của một bộ tham số ========================= */
  // Mỗi công thức tháng có tên (PayrollGraph.ORDER) chạy bằng CÂY: cây mặc định của src/engine/payroll-graph.ts, hoặc cây ở
  // params['formula.<tên>'] = { text, tree } (tree đã serialize; bộ mặc định DEFAULTS mang bảy cây này). Admin không lưu công thức
  // (khoá formula.* là locked, store.resolve bỏ dòng người dùng). Cây được nạp lại và kiểm lại (deserialize + validate theo từ vựng,
  // đơn vị, vòng lặp, thành phần bắt buộc theo luật) mỗi khi dựng nhân cho bộ tham số đó; hỏng thì ném PAYROLL_BAD_FORMULA, KHÔNG quay về
  // công thức mặc định âm thầm. Kết quả nằm trong nhân nên được nhớ theo từng đối tượng params.
  function formulaError(name?, message?, errors?) {
    return Object.assign(new Error(`Công thức đã lưu ‘${name}’ không dùng được: ${message}`), {
      code: 'PAYROLL_BAD_FORMULA',
      key: `formula.${name}`,
      errors: errors || []
    });
  }
  function resolveFormulaTrees(P?) {
    const { Formula, FormulaVocab, PayrollGraph } = DEPS;
    const trees = PayrollGraph.treesWith(null);
    const saved: any[] = [];
    for (const name of PayrollGraph.ORDER) {
      const value = P[`formula.${name}`];
      if (value === undefined || value === null) continue; // chưa lưu: dùng công thức có sẵn trong mã
      if (typeof value !== 'object' || !value.tree) throw formulaError(name, 'giá trị phải có dạng { text, tree }');
      let tree;
      try {
        tree = Formula.deserialize(value.tree);
      } catch (e) {
        throw formulaError(name, e.message, [{ code: e.code, message: e.message }]);
      }
      trees[name] = tree;
      saved.push(name);
    }
    if (saved.length) {
      const vocabulary = DEPS.FormulaVocab;
      for (const name of saved) {
        const result = Formula.validate(trees[name], { vocabulary, target: name, formulas: trees, parameters: P }); // parameters: cạnh bảng bậc là tham số của THÁNG này
        if (!result.ok) throw formulaError(name, result.errors[0].message, result.errors);
      }
    }
    return trees;
  }

  // Thành phần có tên và bốn cột tiền của một dòng ngày: src/engine/payroll-day-parts.ts
  const { partsOfDay, columnsOfDay, linesOf, dayPayOf, payRows } = DEPS.PayrollDayParts;

  /* ========================= nhân: dựng mọi hàm từ MỘT bộ tham số ========================= */
  const kernels = new WeakMap<any, any>();
  const kernelFor = (params?) => {
    if (!kernels.has(params)) kernels.set(params, makeKernel(DEPS.PayrollParams.fillLate(params))); // bản chụp thiếu khoá: đọc mặc định
    return kernels.get(params);
  };

  function makeKernel(P?) {
    const { PayrollParams } = DEPS;
    const PayrollCalendar = DEPS.PayrollCalendar.create(P); // giờ làm, giờ nghỉ, khung đêm của đúng bộ tham số này
    const PunchRules = DEPS.PunchRules.create(P); // ca cố định, múi giờ và giới hạn Check-in/out của đúng bộ tham số này
    const WS = DEPS.WorkSchedule.create(P); // lịch làm việc của chức vụ và của người (một nguồn)
    const KpiScore = DEPS.KpiScore.create(P); // trọng số, mốc Base Wework và ô chính sách của đúng bộ tham số này
    const need = (key?) => {
      if (!Object.hasOwn(P, key)) throw paramError(`Thiếu tham số ${key}`, 'PARAM_MISSING', key);
      return P[key];
    };
    const derived = PayrollParams.derive(P);
    const classes = PayrollParams.buildParamClasses(P);

    /* ---- hằng số lấy từ tham số (không số viết thẳng) ---- */
    const HOURS = need('time.workHoursPerDay');
    const NIGHT_BREAK = need('night.breakPremium');
    const MIN_H = need('unit.minutesPerHour'); // phút trong một giờ
    const MIN_D = need('unit.minutesPerDay');
    const PERCENT = need('unit.percent');
    need('ot.rate'); // hệ số OT ngày thường và hệ số OT cuối tuần đọc theo chức vụ ở calcDay (entitlementOf); thiếu khoá toàn cục là lỗi
    need('ot.weekendRate');
    const HOL_RATE = need('ot.holidayRate');
    const HOL_NIGHT_RATE = derived.holidayNightRate; // night.otAddRate × ot.holidayRate
    const NIGHT_FROM = need('time.nightStartHour') * MIN_H;
    const NIGHT_TO = need('time.nightEndHour') * MIN_H;
    const FLEX_BEFORE = need('time.flexStartBeforeHour') * MIN_H;
    const BREAK_EVERY = need('time.breakAfterWorkHours') * MIN_H; // làm bao nhiêu phút thì nghỉ
    const BREAK_LEN = need('time.breakHours') * MIN_H;
    const EPS_OWED = need('unit.owedHoursEpsilon');
    const ISAT_DOW = need('isat.weekday');
    const PAD = String(MIN_H - 1).length; // độ rộng hai chữ số của phút ("59" → 2), dùng cho nhãn giờ HH:MM
    const SHOWN_MAX = need('control.reasonMaxLength'); // giá trị lạ của hồ sơ được cắt tới độ dài này khi đưa vào thông báo lỗi
    const MATCH_FLEX = need('shift.flex.bonus');
    const MATCH_NIGHT = need('shift.night.bonus');
    // shift.allowance.basis = 'assigned': phụ cấp ca theo ca được xếp, phụ cấp đêm theo bậc.
    // Bộ tham số chụp khi chưa có khoá này: đoán loại ca theo giờ có mặt, phụ cấp đêm chọn theo người.
    const BY_ASSIGNED = P['shift.allowance.basis'] === 'assigned';
    const SHIFT_KINDS = ['normal', 'flex', 'night'];
    const roundTo = need('money.roundTo');
    const ROUND_MODE = { halfUp: Math.round };
    if (!Object.hasOwn(ROUND_MODE, need('money.roundMode')))
      throw paramError('money.roundMode không hợp lệ', 'PARAM_INVALID_VALUE', 'money.roundMode');
    // roundDong: CHỈ đặt ở các điểm calcNet đang làm tròn (đích đọc từ money.roundTo)
    const roundDong = (x?) => ROUND_MODE[P['money.roundMode']](x / roundTo) * roundTo;
    DEPS.PayTailCalc.assertParams(P); // phương án bảo hiểm và thuế do Kế toán chọn: giá trị lạ hoặc chưa dùng được là lỗi

    /* ---- loại nhân sự và bậc lương dựng từ khoá phẳng (cùng hình với TYPES của index.html) ---- */
    const TYPES: Record<string, any> = {};
    const ensure = (t?) => (TYPES[t] = TYPES[t] || { levels: {} });
    for (const [key, value] of Object.entries(P)) {
      let m = /^type\.(?<type>[a-z0-9_]+)\.benefit\.(?<field>[A-Za-z0-9]+)$/.exec(key);
      if (m) {
        ensure(m.groups!.type)[m.groups!.field] = value;
        continue;
      }
      m = /^type\.(?<type>[a-z0-9_]+)\.(?<field>[A-Za-z0-9]+)$/.exec(key);
      if (m) {
        ensure(m.groups!.type)[m.groups!.field] = value;
        continue;
      }
      m = /^level\.(?<type>[a-z0-9_]+)\.(?<level>[0-9]+)\.(?<field>[A-Za-z0-9]+)$/.exec(key);
      if (m) {
        const levels = ensure(m.groups!.type).levels;
        levels[m.groups!.level] = levels[m.groups!.level] || {};
        levels[m.groups!.level][m.groups!.field] = value;
      }
    }
    const typeKey = (s?) => PayrollParams.typeKeyOf(TYPES, s, shown); // mã chức vụ lạ: PAYROLL_BAD_TYPE, không rơi về chức vụ nào
    const typeOf = (s?) => TYPES[typeKey(s)];
    const entitlementOf = (staff?, tail?) => PayrollParams.entitlement(P, typeKey(staff), tail); // ghi đè theo chức vụ → toàn cục → mặc định
    const levelOf = (s?) => typeOf(s).levels[s.level] || { name: '?', base: 0 };
    // Kiểm hồ sơ trước khi tính: bậc không có trong bảng bậc không được thành lương 0 âm thầm. typeOf và levelOf không kiểm; chỉ cổng vào đầy đủ gọi hàm này.
    const shown = (v?) =>
      v === null || v === undefined
        ? 'trống'
        : typeof v === 'object'
          ? 'sai kiểu dữ liệu'
          : `"${String(v).slice(0, SHOWN_MAX)}"`;
    function assertStaff(staff?) {
      const who =
        staff && typeof staff.username === 'string' ? ` của tài khoản ${staff.username.slice(0, SHOWN_MAX)}` : '';
      if (
        !staff ||
        typeof staff.type !== 'string' ||
        !Object.hasOwn(TYPES, staff.type) ||
        !Object.hasOwn(TYPES[staff.type], 'workdays')
      )
        throw Object.assign(
          new Error(
            `Loại nhân sự ${shown(staff && staff.type)}${who} không có trong bảng tham số; sửa loại trong hồ sơ nhân sự`
          ),
          { code: 'PAYROLL_BAD_TYPE', field: 'type' }
        );
      const level = staff.level;
      if ((typeof level !== 'number' && typeof level !== 'string') || !Object.hasOwn(TYPES[staff.type].levels, level))
        throw Object.assign(
          new Error(
            `Bậc lương ${shown(level)}${who} (loại ${staff.type}) không có trong bảng bậc của tháng; sửa bậc trong hồ sơ nhân sự`
          ),
          { code: 'PAYROLL_BAD_LEVEL', field: 'level' }
        );
    }
    const bonusOf = (staff?, shift?) => {
      const T = typeOf(staff);
      if (shift === 'flex') return T.flexBonus ?? MATCH_FLEX;
      if (shift === 'night' && BY_ASSIGNED) {
        // phần trăm của bậc (Admin đặt, ví dụ 60), bậc không đặt thì của chức vụ (mặc định 40); chức vụ thêm sau (chưa vào danh mục) lấy
        // mức đầu của bảng nightOptions như người chưa chọn mức
        const level = T.levels[staff.level];
        const ofType = Number.isFinite(T.nightPct)
          ? T.nightPct
          : Array.isArray(T.nightOptions)
            ? T.nightOptions[0]
            : null;
        const pct = level && Number.isFinite(level.nightPct) ? level.nightPct : ofType;
        return Number.isFinite(pct) ? pct / PERCENT : MATCH_NIGHT;
      }
      if (shift === 'night')
        return T.nightOptions ? (Number(staff.nightPct) || T.nightOptions[0]) / PERCENT : MATCH_NIGHT;
      return 0;
    };
    // Giờ nghỉ đêm có lương (Off Paid) theo cờ type.<mã>.benefit.breakPay, TTS không có. Chỉ false mới tắt: bản chụp
    // và chức vụ thiếu khoá thì vẫn trả, kỳ đã chốt tính lại vẫn đúng số lúc chụp (không cần LATE_KEYS).
    const paidBreakH = (T?, slots?, off?) =>
      T.breakPay === false ? 0 : slots.reduce((s, x) => s + (x.inMain && !off ? x.paidH : 0), 0);

    /* ---- thuế và bảo hiểm ---- */
    const R = {
      insurance: {
        bhxh: need('tax.insurance.employee.bhxh'),
        bhyt: need('tax.insurance.employee.bhyt'),
        bhtn: need('tax.insurance.employee.bhtn')
      },
      employer: {
        bhxh: need('tax.insurance.employer.bhxh'),
        bhyt: need('tax.insurance.employer.bhyt'),
        bhtn: need('tax.insurance.employer.bhtn')
      },
      insuranceCap: derived.insuranceCap,
      insuranceSkipDays: need('tax.insurance.skipDays'),
      personal: need('tax.deduction.personal'),
      dependant: need('tax.deduction.dependant'),
      brackets: classes.TaxParams.tax.brackets, // trần bậc cuối đã đổi lại thành Infinity
      casualRate: need('tax.casual.rate'),
      casualThreshold: need('tax.casual.threshold'),
      nightPremium: need('tax.exempt.nightPremium'),
      otNormalRate: need('tax.exempt.otRate'),
      weekendRate: need('tax.exempt.weekendRate'),
      holidayRate: need('tax.exempt.holidayRate'),
      holidayNightAdd: derived.holidayNightAdd,
      advanceRate: need('advance.rate'),
      advanceUntil: need('advance.untilDay')
    };
    if (R.insuranceCap.bhtn === null)
      throw paramError(
        'Chưa có lương tối thiểu vùng đã chọn (law.regionMinWage)',
        'PARAM_MISSING',
        'law.regionMinWage'
      );
    const OVER_ATTEND = need('attendance.overLimitHours') + need('attendance.overLimitTolerance'); // ngưỡng giờ vượt của chuyên cần + biên độ (mặc định 0)

    /* ---- giờ và ca ---- */
    function toMin(t?) {
      if (!t) return null;
      const [h, m] = t.split(':').map(Number);
      return h * MIN_H + m;
    }
    const isNightMin = (x?) => {
      const h = ((x % MIN_D) + MIN_D) % MIN_D;
      return h >= NIGHT_FROM || h < NIGHT_TO;
    };
    function overlapsNight(a?, b?) {
      if (a == null || b == null) return false;
      let e = b;
      if (e <= a) e += MIN_D;
      for (let t = a; t < e; t += 1) if (isNightMin(t)) return true;
      return false;
    }
    function shiftFor(tin?, tout?) {
      const a = toMin(tin),
        b = toMin(tout);
      if (a == null || b == null) return 'normal';
      if (overlapsNight(a, b)) return 'night';
      if (a < FLEX_BEFORE || b >= NIGHT_FROM) return 'flex';
      return 'normal';
    }
    // Loại ca dùng cho phụ cấp của một ngày. Theo ca được xếp: mã ca của ngày (d.preset), không có thì ca cố định trong hồ sơ; loại ca đọc từ
    // danh mục ca (shift.kind.<mã>), mã lạ hoặc chưa xếp ca là ca thường (không phụ cấp). Giờ làm, giờ nghỉ đêm vẫn tính theo giờ thật.
    function shiftOfDay(staff?, d?) {
      if (!BY_ASSIGNED) return shiftFor(d.in, d.out);
      const code = (typeof d.preset === 'string' && d.preset) || (staff && staff.shiftCode);
      const kind = typeof code === 'string' && code ? P['shift.kind.' + code] : null;
      return SHIFT_KINDS.includes(kind) ? kind : 'normal';
    }
    // Ngày trong thời gian làm việc: từ ngày bắt đầu đến hết ngày nghỉ việc (staff.resignedOn vẫn là ngày làm việc); không có ngày thì đúng
    const inService = (staff?, date?) =>
      !date ||
      ((!PayrollCalendar.isValidDate(staff.startDate) || date >= staff.startDate) &&
        (!PayrollCalendar.isValidDate(staff.resignedOn) || date <= staff.resignedOn));
    // Ngày có lương của một dòng ngày: ngày công (kể cả ngày lễ có giờ làm) hoặc ngày nghỉ được trả (phép năm, nghỉ lễ hưởng lương, iSAT hưởng lương);
    // ngoài thời gian làm việc, nghỉ không lương, nghỉ được duyệt, vắng, chờ xử lý và ngày chỉ có giờ làm thêm không phải ngày có lương
    const isPaidDay = (staff?, row?) =>
      inService(staff, row.date) &&
      (row.kind === 'work' ? !row.extraOnly : (row.kind === 'holiday' && row.hours > 0) || row.paidOff === true);
    function spanHours(d?) {
      const a = toMin(d.in),
        b = toMin(d.out);
      if (a == null || b == null) return 0;
      let diff = b - a;
      if (diff <= 0) diff += MIN_D;
      return diff / MIN_H;
    } // ca đêm qua ngày hôm sau
    const fmtMin = (t?) => {
      t = ((t % MIN_D) + MIN_D) % MIN_D;
      return String(Math.floor(t / MIN_H)).padStart(PAD, '0') + ':' + String(t % MIN_H).padStart(PAD, '0');
    };
    function preSpan(d?) {
      return d.extraKind && d.extraIn && d.in && d.extraIn !== d.in ? spanHours({ in: d.extraIn, out: d.in }) : 0;
    } // giờ làm thêm trước ca (có mặt)
    function postSpan(d?) {
      return d.extraKind && d.extraOut && d.out && d.extraOut !== d.out ? spanHours({ in: d.out, out: d.extraOut }) : 0;
    } // giờ làm thêm sau ca (có mặt)
    function breakSlots(d?) {
      const a = toMin(d.in);
      if (a == null || !spanHours(d)) return [];
      const mainEnd = a + spanHours(d) * MIN_H,
        slots: any[] = [];
      const seg = (s?, end?, main?) => {
        // Một đoạn làm liền chỉ nghỉ MỘT lần (1 ca làm nghỉ 1 tiếng); breakSlots, splitMainWork và actual-hours phải trùng nhau
        const t = s + BREAK_EVERY; // nghỉ sau BREAK_EVERY phút làm đầu tiên, đếm từ đầu đoạn
        if (t >= end) return;
        const e = Math.min(t + BREAK_LEN, end);
        let paid = 0; // phút nghỉ rơi trong khung đêm (Off Paid)
        for (let x = t; x < e; x++) if (isNightMin(x)) paid++;
        slots.push({
          start: t,
          end: e,
          label: fmtMin(t) + '–' + fmtMin(e),
          hours: (e - t) / MIN_H,
          paidH: paid / MIN_H,
          inMain: main ? (e - t) / MIN_H : 0,
          inExtra: main ? 0 : (e - t) / MIN_H,
          n: slots.length + 1
        });
      };
      // Đoạn làm thêm chỉ nghỉ khi là làm bù; đoạn OT làm liền, không giờ nghỉ
      const extraBreak = d.extraKind !== 'ot';
      if (extraBreak) seg(a - preSpan(d) * MIN_H, a, false);
      seg(a, mainEnd, true);
      if (extraBreak) seg(mainEnd, mainEnd + postSpan(d) * MIN_H, false);
      return slots;
    }
    function workedHours(d?) {
      const span = spanHours(d);
      if (!span) return 0;
      const brk = breakSlots(d).reduce((s, x) => s + x.inMain, 0);
      // cutStartMin / cutEndMin: phút làm việc bị cắt do vào trễ / ra sớm khi giờ tính từ Check-in/out (ActualHours.apply)
      const workMin = Math.round((span - brk) * MIN_H);
      const cutStart = Math.min(workMin, Math.max(0, Math.floor(Number(d.cutStartMin) || 0)));
      const cutEnd = Math.min(workMin - cutStart, Math.max(0, Math.floor(Number(d.cutEndMin) || 0)));
      return Math.max(0, span - brk - Number(d.breakMin || 0) / MIN_H - (cutStart + cutEnd) / MIN_H);
    }
    function extraWorkHours(d?) {
      const span = preSpan(d) + postSpan(d);
      if (!span) return 0;
      const brk = breakSlots(d).reduce((s, x) => s + x.inExtra, 0);
      return Math.max(0, span - brk);
    }

    /* ========================= LỚP NGÀY: calcDay (giữ nguyên) và thanhPhanNgay ========================= */
    function calcDay(staff?, d?, isHoliday?, avail?, context?) {
      // context: ngày bắt đầu và toàn bộ lịch lễ, kể cả tháng kế tiếp
      // Ngày đã xác nhận lấy ca được gán làm căn cứ trả lương; giờ có mặt chỉ dùng đối chiếu.
      if (d.attendanceConfirmed)
        d = { ...d, in: d.plannedShift?.in || d.in, out: d.plannedShift?.out || d.out, breakMin: 0 };
      const T = typeOf(staff),
        base = levelOf(staff).base,
        daily = base / T.workdays,
        hourly = daily / HOURS;
      const z = { daily, hourly, hours: 0, short: 0, cut: 0, bonus: 0 };
      if (context && !PayrollCalendar.isValidDate(context.date))
        return { ...z, kind: 'invalid', total: 0, paidOff: false };
      // Làm ngày lễ là OT: chức vụ không có quyền lợi OT (T.ot) không có giờ làm ngày lễ. Ngày lễ của họ chỉ có lương lễ như người nghỉ
      // (dù ngày có khai giờ làm), và ca qua nửa đêm sang ngày lễ tính như ngày thường.
      if (isHoliday && !T.ot) d = { kind: 'holiday' };
      const split = PayrollCalendar.splitMainWork(
        d,
        context?.date || SENTINEL_DATE,
        !T.ot ? [] : context ? context.holidays : isHoliday ? SENTINEL_HOLIDAYS : []
      );
      // Giờ ca chính tách theo ngày dân sự của từng phút: holMainH = phần rơi vào ngày lễ (thay phần lương ngày của chính các giờ đó)
      // holMainBreakH: phần của holMainH là giờ nghỉ của ca (ngày lễ không có giờ nghỉ), không nằm trong 8 giờ của lương ngày
      const normalWorkH = split.normalH,
        holMainH = split.holidayH,
        holMainBreakH = split.holidayBreakH;
      // Ngày lễ khai "Đi làm" mà hết ca không có Check-in/out (ActualHours.apply → noshow) là vắng, mất lương lễ
      const paidHoliday = isHoliday && d.kind !== 'noshow' && T.paidHoliday && inService(staff, context?.date),
        holBase = paidHoliday ? daily : 0; // lương ngày lễ trong thời gian làm việc (từ ngày bắt đầu tới ngày nghỉ việc; TTS không có)
      if (isHoliday && d.kind !== 'noshow' && !(d.kind === 'work' && d.in && d.out))
        return { ...z, kind: 'holiday', total: holBase, paidOff: paidHoliday, holBase };
      // Ngày lễ đi làm đi cùng đường ngày đi làm bên dưới (mọi giờ rơi vào ngày lễ là OT ngày lễ); chỉ giữ đoạn OT: làm bù ngày lễ bị chặn
      if (isHoliday && d.extraKind !== 'ot') d = { ...d, extraKind: '', extraIn: '', extraOut: '' };
      const kind = d.kind || 'work';
      if (kind === 'noshow') return { ...z, kind, total: 0, paidOff: false }; // vắng không phép: như nghỉ không lương
      if (kind === 'pending') return { ...z, kind, total: 0, paidOff: false }; // chờ xử lý: chưa tính, không vào giờ vượt ngưỡng
      if (kind === 'leave') return { ...z, kind, total: T.paidLeave ? daily : 0, paidOff: T.paidLeave };
      if (kind === 'unpaid') return { ...z, kind, total: 0, paidOff: false };
      if (kind === 'willmakeup') return { ...z, kind, total: 0, paidOff: false }; // nghỉ có làm bù: như nghỉ không lương, cần giờ bù trong tháng
      if (kind === 'makeup') return { ...z, kind, total: 0, paidOff: false }; // loại cũ: không tiền, không ngày công, không giờ làm bù
      if (kind === 'approved') return { ...z, kind, total: 0, paidOff: false }; // nghỉ được duyệt: không lương; tính là ngày nghỉ khi xét chuyên cần và giờ vượt ngưỡng như nghỉ không lương
      if (kind === 'isat') {
        const paidOff =
          !!T.isat &&
          PayrollCalendar.isValidDate(context?.date) &&
          new Date(context.date + 'T00:00:00Z').getUTCDay() === ISAT_DOW;
        return { ...z, kind, total: paidOff ? daily : 0, paidOff }; // phúc lợi iSAT: chỉ nghỉ ngày iSAT.weekday, lương cơ bản ngày, không phụ cấp
      }
      d = { ...d, shift: shiftOfDay(staff, d) };
      const hours = workedHours(d);
      // Giờ làm thêm: extraKind = '' (không) | 'makeup' (làm bù) | 'ot' (overtime); bản ghi cũ có extraOut mà thiếu extraKind là làm bù
      const extraKind = d.extraKind || (d.extraOut ? 'makeup' : '');
      const extra = extraWorkHours({ ...d, extraKind }); // giờ làm thêm thực (làm bù đã trừ giờ nghỉ rơi trong đoạn; OT không trừ nghỉ)
      const excess = extraKind ? extra : d.extraOut === undefined && d.makeupH ? Math.max(0, hours - HOURS) : 0;
      // Đoạn làm thêm tách theo ngày dân sự của từng phút: phần rơi vào ngày lễ trả theo mức ngày lễ
      const extraSplit = PayrollCalendar.splitExtraWork(
        { ...d, extraKind },
        context?.date || SENTINEL_DATE,
        !T.ot ? [] : context ? context.holidays : isHoliday ? [SENTINEL_DATE] : [], // OT ngày lễ: chỉ phút của chính ngày lễ theo hệ số lễ
        context && context.isRest // ngày nghỉ cuối tuần của người (calcMonth truyền từ lịch của người); gọi lẻ không có thì mọi OT ngày thường
      );
      // Làm bù: trả đủ toàn bộ giờ làm thêm đã duyệt × lương giờ, không cắt theo giờ còn thiếu
      const makeupH =
          extraKind === 'makeup' ? excess : extraKind ? 0 : Math.min(Math.max(0, Number(d.makeupH) || 0), excess),
        // Làm bù rơi vào ngày lễ: phần giờ ngày lễ trả thêm theo hệ số makeupHolRate (ActualHours.POLICY.makeupHolidayRate); không có hệ số thì ×1
        makeupRate = Number(d.makeupHolRate) > 1 ? Number(d.makeupHolRate) : 1,
        makeupHolH =
          makeupRate > 1 && extraKind === 'makeup' && extra > 0 && makeupH > 0
            ? Math.min(makeupH, (makeupH * extraSplit.holidayH) / extra)
            : 0,
        makeupHolPremium = makeupHolH * hourly * (makeupRate - 1), // phần trả thêm của giờ làm bù ngày lễ, nằm trong makeupPay
        makeupPay = makeupH * hourly + makeupHolPremium;
      // Giờ OT rơi vào ngày lễ (theo ngày dân sự của từng phút) là OT ngày lễ: trả như giờ ca chính ngày lễ, không cần duyệt OT riêng
      // và không bị chặn bởi giờ bù. Chức vụ không có quyền lợi OT không có OT nào, kể cả ngày lễ (extraSplit đã bỏ ngày lễ cho họ).
      // Phần OT rơi vào ngày thường theo luật OT thường bên dưới.
      const holSplitH = extraKind === 'ot' ? extraSplit.holidayH : 0,
        holExtraH = holSplitH,
        holExtraNightH = extraKind === 'ot' ? extraSplit.holidayNightH : 0,
        otNormalH = extraKind === 'ot' ? Math.max(0, extra - holSplitH) : 0;
      // OT ngày thường chỉ khi trước ngày này không còn giờ phải bù (calcMonth truyền context.otBlocked theo các ngày trước; gọi lẻ thì
      // xét avail = số giờ còn phải bù)
      const owes = context && context.otBlocked !== undefined ? !!context.otBlocked : avail > EPS_OWED;
      const otRejected = !!(d.src && d.otReview && d.otReview.ok === false);
      const otEligible = extraKind === 'ot' && T.ot,
        otCan = otEligible && !owes,
        otHold = otEligible && owes && !otRejected ? otNormalH : 0; // otHold = giờ OT chưa tính vì trước ngày này còn giờ phải bù
      const otOk = !d.src || !!(d.otReview && d.otReview.ok); // ngày khoá (giờ từ check-in / Admin duyệt): OT phải được Admin duyệt mới tính
      // OT ngày thường tách theo ngày dân sự của từng phút: phần rơi vào Thứ Bảy, Chủ nhật không nằm trong lịch của người trả theo ot.weekendRate,
      // phần còn lại (kể cả Thứ Bảy trong lịch) theo ot.rate; cả hai đọc theo chức vụ
      const otH = otCan && otOk ? otNormalH : 0,
        otWeekendH = otH > 0 ? Math.min(otH, extraSplit.weekendH || 0) : 0,
        otWeekendPay = otWeekendH * hourly * entitlementOf(staff, 'ot.weekendRate'),
        otWeekdayPay = (otH - otWeekendH) * hourly * entitlementOf(staff, 'ot.rate'),
        otPay = otWeekdayPay + otWeekendPay,
        otWait = otCan && !otOk ? otNormalH : 0; // otWait = giờ OT chưa duyệt / bị từ chối
      // OT ngày lễ = mọi giờ được duyệt rơi vào ngày lễ (khung giờ ngày lễ đã khai và đoạn OT kèm theo): giờ × lương giờ × hệ số lễ, phần trong khung đêm
      // cộng thêm hệ số đêm lễ. Phần ca chính rơi vào ngày lễ không còn trong lương ngày (dòng đi làm trừ holMainH × hourly).
      const holWorkH = holMainH + holExtraH,
        holMainNightH = split.holidayNightH,
        holNightH = holMainNightH + holExtraNightH,
        holNightPay = holNightH * hourly * HOL_NIGHT_RATE,
        holWorkPay = holWorkH * hourly * HOL_RATE + holNightPay;
      const paidHours = Math.min(hours, HOURS); // không OT
      const slots = breakSlots(d);
      // Phụ cấp ca (night, Flex) và Off Paid thuộc ca chính, tính như ngày thường kể cả khi có OT hoặc giờ làm bù: khoản làm thêm cộng thêm,
      // không thay phụ cấp. Đoạn làm bù chỉ nhận lương giờ và không tạo Off Paid riêng. extraOnly: ngày ngoài lịch chỉ trả đoạn làm thêm
      // đã duyệt (ActualHours.apply): không phụ cấp, không giờ thiếu,
      // không ngày công, không lương ngày.
      const noShiftAllowance = !!d.extraOnly;
      // Phút nghỉ của ca chính rơi vào ngày lễ đã trả như giờ làm ngày lễ (holMainBreakH), nên không trả thêm Off Paid cho các phút đó
      const breakH = noShiftAllowance ? 0 : Math.max(0, paidBreakH(T, slots, d.breakPayOff) - split.holidayBreakNightH); // chỉ phần nghỉ trong khung đêm ngoài ngày lễ quy đổi thành tiền
      const breakPay = breakH * hourly * (1 + NIGHT_BREAK); // = lương giờ + phụ trội cho mỗi giờ nghỉ trong khung đêm
      const short = d.extraOnly || isHoliday ? 0 : Math.max(0, HOURS - paidHours), // ngày lễ: lương lễ thay lương ngày, không giờ thiếu
        cut = d.extraOnly ? daily : short * hourly;
      // Ngày không hưởng phụ cấp ca (noShiftAllowance): phần sàn phụ trội đêm theo giờ (ca qua ngày lễ) vẫn giữ vì là tiền làm đêm tối
      // thiểu, không phải phụ cấp ca.
      const bonus =
        d.shift === 'flex'
          ? noShiftAllowance
            ? 0
            : bonusOf(staff, 'flex') * hourly * (isHoliday ? normalWorkH + holMainH : paidHours)
          : Math.max(
              noShiftAllowance ? 0 : daily * bonusOf(staff, d.shift),
              holMainH > 0 || isHoliday ? split.nightH * hourly * NIGHT_BREAK : 0
            ); // Phụ cấp ca chỉ cộng một lần
      return {
        daily,
        hourly,
        hours,
        short,
        cut,
        bonus,
        breakH,
        breakPay,
        slots,
        extra,
        excess,
        extraKind,
        makeupH,
        makeupPay,
        makeupHolPremium,
        otH,
        otPay,
        otWeekendH, // phần của otH rơi vào ngày nghỉ cuối tuần (trả theo ot.weekendRate)
        otWeekendPay, // phần của otPay trả theo ot.weekendRate
        otWeekdayPay, // phần của otPay trả theo ot.rate
        otWait,
        otHold,
        normalWorkH,
        holMainH, // giờ ca chính rơi vào ngày lễ
        holMainNightH, // phần trong khung đêm của holMainH
        holMainBreakH, // phần của holMainH nằm trong giờ nghỉ của ca (tính như giờ làm, ngoài lương ngày)
        holWorkH, // giờ OT ngày lễ = holMainH + giờ làm thêm rơi vào ngày lễ
        holNightH, // phần trong khung đêm của holWorkH
        holNightPay,
        holWorkPay, // tiền OT ngày lễ
        holWork: holWorkH > 0,
        nightH: split.nightH, // giờ làm ca chính trong khung đêm (dùng cho miễn thuế)
        holBase,
        ...(isHoliday ? { paidOff: paidHoliday } : {}),
        shift: d.shift,
        kind: isHoliday ? 'holiday' : 'work',
        total:
          (isHoliday ? holBase + normalWorkH * hourly : daily - cut - (holMainH - holMainBreakH) * hourly) +
          holWorkPay +
          bonus +
          breakPay +
          makeupPay +
          otPay
      };
    }
    function thanhPhanNgay(staff?, d?, isHoliday?, avail?, context?): { c: any; parts: any } {
      const c = calcDay(staff, d, isHoliday, avail, context);
      return { c, parts: d.extraOnly ? { ...partsOfDay(c), ngayDiLam: 0 } : partsOfDay(c) };
    }

    /* ========================= lớp nặng của tháng: giờ vượt ngưỡng, tiền ứng ========================= */
    const dateParts = (date?) => date.split('-');
    const dayOfMonth = (date?) => {
      const [, , dd] = dateParts(date);
      return Number(dd);
    };
    const monthOfDate = (date?) => {
      const [y, m] = dateParts(date);
      return `${y}-${m}`;
    };
    // Giờ vượt ngưỡng (chuyên cần và KPI dùng chung) = (ngày nghỉ không lương + ngày "Nghỉ được duyệt" + vắng) × giờ mỗi công
    // + giờ thiếu chưa bù + ngày phép năm × giờ mỗi công
    // counted: số ngày "Nghỉ được duyệt" tính vào (tắt
    // request.type.approved.countsAbsent thì counted = 0)
    // exempt: số ngày nghỉ không lương KHÔNG tính vào giờ vượt ngưỡng (khoản chưa duyệt mà quy tắc duyệt đặt "không tính là ngày nghỉ", mặc định 0)
    const gioVuotNguong = (r?, T?, exempt = 0, counted = 0) =>
      T.travel || T.attendance || T.kpi
        ? (r.unpaid + counted - exempt + r.noshow) * HOURS + r.debt + r.leave * HOURS
        : null;
    const tienUngCong = (date?, c?) => (dayOfMonth(date) <= R.advanceUntil ? advancePayOfDay(c) : 0); // lương cơ bản thực nhận của ngày đi làm (kể cả ngày lễ đi làm) từ ngày 1 đến ngày advance.untilDay

    /* ========================= LỚP THÁNG: mỗi công thức có tên là MỘT biểu thức ========================= */
    // Hàm có sẵn đã gắn tham số (BUILTINS chỉ là bản dữ liệu của các hàm này)
    const builtinFns = {
      so,
      roundDong,
      giuChuyenCan: (ngayNghi?, gioVuot?, maxAbsent?, overLimit = OVER_ATTEND) =>
        so(INVERSE[P['attendance.absentCompare']], ngayNghi, maxAbsent) &&
        so(INVERSE[P['attendance.overLimitCompare']], gioVuot, overLimit),
      tienKpi: (amt?, units?, heSo?) => KpiScore.pay(amt, units, heSo), // KPI 5 thành phần: điểm × 100 là số nguyên (KpiScore)
      tienKpiCu: (amt?, pct?, heSo?) => ((amt * pct) / PERCENT) * heSo // KPI cũ: % tự đánh giá hoặc % Admin duyệt
    };
    // Cây của các công thức tháng (mặc định hoặc đã lưu) và hàm có sẵn gọi theo (args, params) cho Formula.evaluate
    const FORMULA_TREES = resolveFormulaTrees(P);
    const FORMULA_BUILTINS: Record<string, any> = {};
    for (const [key, entry] of Object.entries(BUILTINS)) FORMULA_BUILTINS[key] = (args?, p?) => entry.fn(args, p || P);
    // phép so sánh có tên của tham số registry kpi.overLimitCompare (cây viết "vượt ngưỡng giờ KPI (a ; b)")
    FORMULA_BUILTINS.vuotNguongKpi = ([a, b]: any) => so(P['kpi.overLimitCompare'], a, b);
    // Bảy cây mặc định không dùng biến theo ngày (DAY_VARIABLES) hay thuộc tính của bậc (level.attr.<mã>) nên ctx chỉ mang biến tháng v.
    const formulaCtx = (variables?, staff?) => ({
      variables,
      parameters: PayrollParams.overlay(P, typeKey(staff)), // ghi đè theo chức vụ (advance.rate, attendance.overLimitHours…); không có thì chính P
      builtins: FORMULA_BUILTINS,
      scope: { type: typeKey(staff) }, // khoá type.<type>.* của tham số theo loại nhân sự của người đang tính
      formulas: FORMULA_TREES
    });
    // Tập công thức tháng của một người: đánh giá lười, nhớ kết quả, chạy cây trên biến v (v được cập nhật dần trong calcMonth)
    function monthFormulas(v?, staff?) {
      const ctx = formulaCtx(v, staff);
      const cache = new Map<any, any>();
      const f: Record<string, any> = {};
      for (const name of DEPS.PayrollGraph.ORDER)
        Object.defineProperty(f, name, {
          enumerable: true,
          get: () => {
            if (!cache.has(name)) cache.set(name, DEPS.Formula.evaluate(FORMULA_TREES[name], ctx));
            return cache.get(name);
          }
        });
      return f;
    }

    /* ========================= calcMonth ========================= */
    function noShowDates(_staff?, _days?, _mk?, _hol?): Set<any> {
      return new Set<any>(); // bảng ước tính chỉ dùng lịch tự nhập; thiếu Check-in/out không tự suy ra ngày vắng
    }
    function calcMonth(staff?, days?, kpiPct?, holidays?, mk?, upTo?, entries?, asOf?, extra: any = {}) {
      const { advance, settleDays } = extra;
      // upTo: chỉ tính đến ngày này; mặc định = hôm nay (null = cả tháng)
      // asOf: thời điểm tính (ISO); không ảnh hưởng số tiền
      // extra.advance: true khi Admin đã duyệt tạm ứng của người này trong tháng; thiếu hoặc khác true thì tạm ứng 0
      // extra.settleDays: số ngày phép dư hết hạn quy tiền vào tháng này; thiếu hoặc 0 thì tháng không có dòng quyết toán
      if (upTo === undefined) upTo = PunchRules.vnDate(new Date(Date.now()).toISOString()); // mặc định đọc đồng hồ; computeMonth luôn truyền upTo
      const T = typeOf(staff),
        L = levelOf(staff);
      const r: Record<string, any> = {
        count: 0,
        makeup: 0,
        base: 0,
        bonus: 0,
        cut: 0,
        work: 0,
        basePay: 0,
        breakPay: 0,
        breakDays: 0,
        breakHours: 0,
        makeupPay: 0,
        makeupHolPremium: 0,
        makeupHours: 0,
        otPay: 0,
        otHours: 0,
        otWeekendPay: 0,
        otWeekendHours: 0,
        otWeekdayPay: 0,
        otDays: 0,
        holWorkDays: 0,
        holWorkHours: 0,
        holWorkPay: 0,
        short: 0,
        flex: 0,
        night: 0,
        holiday: 0,
        leave: 0,
        unpaid: 0,
        willmakeup: 0,
        approved: 0,
        isat: 0,
        noshow: 0,
        pending: 0,
        off: 0,
        rows: [],
        kpiPct: null,
        kpiPay: 0,
        kpiPass: null,
        travel: 0,
        attendance: 0,
        attendOk: null,
        absent: 0,
        allow: 0,
        total: 0,
        debt: 0,
        overHours: null,
        makeupNeed: 0,
        makeupDeclared: 0,
        makeupCredit: 0,
        otHoldHours: 0,
        nightHours: 0,
        holNightHours: 0,
        advanceBase: 0,
        paidDays: 0,
        net: null
      };
      const parts = { tienNgayCong: 0, phuCapCa: 0, gioNghiDem: 0, lamBu: 0, tienOt: 0, tienLamLe: 0, ngayDiLam: 0 }; // trace, không vào m
      const inMonth = (date?) =>
        PayrollCalendar.isValidDate(date) && (!mk || (PayrollCalendar.isValidMonth(mk) && monthOfDate(date) === mk));
      // Tiền ca và bộ đếm ngày công vẫn thuộc ngày/tháng bắt đầu; chỉ hệ số lễ theo ngày thực tế của từng phút.
      // Lương nghỉ lễ theo ngày hưởng quyền, cộng một lần trong tháng của chính ngày lễ đó.
      const allHolidays = (holidays || []).filter(PayrollCalendar.isValidDate);
      const S = WS.scheduleOf(staff); // lịch của người: theo loại nhân sự, hoặc mảng thứ staff.sched của đầu vào
      const hol = new Set<any>(allHolidays.filter(inMonth).filter(h => WS.isWorkDay(S, h)));
      const eligibleHolidays = [...hol].filter(date => inService(staff, date));
      const noshow = noShowDates(staff, days, mk, hol); // vắng không phép (giai đoạn check-in), tính lúc chạy, không lưu DB
      const monthDates = [...new Set<any>([...Object.keys(days), ...eligibleHolidays, ...noshow])]
        .filter(inMonth)
        .filter(date => !PayrollCalendar.isValidDate(staff.resignedOn) || date <= staff.resignedOn) // sau ngày nghỉ việc: không còn ngày nào
        .filter(date => WS.isWorkDay(S, date) || days[date]?.extraOnly === true) // ngày trong lịch làm việc, và ngày ngoài lịch chỉ có đoạn OT đã duyệt (extraOnly)
        .sort();
      const dates = monthDates.filter(date => !upTo || date <= upTo);
      const dayOf = (date?) => days[date] || (noshow.has(date) ? { kind: 'noshow' } : {});
      const restDate = (date?) => WS.isRestDay(S, date); // Thứ Bảy, Chủ nhật không nằm trong lịch của người: OT trả theo ot.weekendRate
      // Sổ giờ bù của tháng (phút nguyên): giờ cần bù = giờ thiếu ngày đi làm + một công mỗi ngày "Nghỉ, sẽ làm bù"; giờ làm bù = giờ làm bù
      // đã trả của từng ngày (trả đủ, không cắt theo giờ cần bù). Số dư chỉ dùng để chặn OT và báo giờ còn thiếu.
      const toM = (h?) => Math.round((h || 0) * MIN_H);
      const total = { need: 0, made: 0 };
      let unpaidExempt = 0; // ngày nghỉ không lương do khoản chưa duyệt đổi thành và quy tắc duyệt đặt "không tính là ngày nghỉ" (ApprovalView absentExempt)
      // OT ngày D chỉ bị chặn khi tới trước D còn giờ phải bù (bal > 0); làm bù nhiều hơn giờ thiếu không chặn OT.
      let bal = 0;
      dates.forEach(date => {
        const d = dayOf(date),
          { c, parts: dayParts } = thanhPhanNgay(staff, d, hol.has(date), null, {
            date,
            holidays: allHolidays,
            otBlocked: P['ot.afterMakeup'] !== 'independent' && bal > 0,
            isRest: restDate
          });
        for (const name of Object.keys(parts)) parts[name] += dayParts[name];
        const x = {
          need: toM((c.kind === 'work' ? c.short : 0) + (c.kind === 'willmakeup' ? HOURS : 0)),
          made: toM(c.makeupH)
        };
        total.need += x.need;
        total.made += x.made;
        c.makeupDeclared = x.made / MIN_H;
        c.debtBefore = bal / MIN_H;
        bal += x.need - x.made;
        c.debtAfter = bal / MIN_H; // số dư giờ bù luỹ kế: dương = còn phải bù, âm = đã bù nhiều hơn giờ thiếu
        if (c.otHold > 0) r.otHoldHours += c.otHold;
        if (c.makeupH > 0) {
          r.makeup++;
          r.makeupPay += c.makeupPay;
          r.makeupHolPremium += c.makeupHolPremium || 0;
          r.makeupHours += c.makeupH;
        }
        if (c.otH > 0) {
          r.otDays++;
          r.otPay += c.otPay;
          r.otHours += c.otH;
          r.otWeekendPay += c.otWeekendPay;
          r.otWeekdayPay += c.otWeekdayPay;
          r.otWeekendHours += c.otWeekendH;
        } // làm bù: mục riêng, không gộp vào ngày công thực tế
        r.bonus += c.bonus || 0; // Mỗi khoản đã trả trong ngày phải có trong tổng hợp, kể cả khi giờ làm lễ bằng 0.
        r.nightHours += Math.max(0, (c.nightH || 0) - (c.holMainNightH || 0)); // giờ làm đêm của ca chính ngoài ngày lễ
        // Ngày công: ngày đi làm, và ngày lễ có đi làm thật (không đổi tiền của ngày); ca đêm qua lễ thuộc ngày bắt đầu
        if (c.kind === 'work' ? !d.extraOnly : c.kind === 'holiday' && c.hours > 0) {
          r.count++;
          if (c.shift === 'flex') r.flex++;
          if (c.shift === 'night') r.night++; // đếm cả ca lễ mà phần giờ lễ bị cắt hết (vd. vào 00:30 hôm sau)
        }
        r.advanceBase += tienUngCong(date, c);
        if (c.kind === 'work' && !d.extraOnly) {
          r.base += c.daily;
          r.cut += c.cut;
          r.short += c.short;
        } else if (c.kind !== 'makeup' && c.kind !== 'work') {
          // loại 'makeup' cũ không vào bộ đếm nào: r.makeup là số ngày có giờ làm bù được trả
          if (c.kind !== 'isat' || c.paidOff) r[c.kind]++;
          if (c.kind === 'unpaid' && d.absentExempt === true) unpaidExempt++;
          r.off += c.kind === 'holiday' ? c.holBase || 0 : c.total;
        }
        if (c.holWork) {
          r.holWorkDays++;
          r.holWorkHours += c.holWorkH;
          r.holWorkPay += c.holWorkPay;
          r.holNightHours += c.holNightH || 0;
        } // Ca qua lễ có cả phần thường: phụ cấp chỉ cộng một lần.
        r.work += c.total;
        r.basePay += c.total - c.bonus - (c.breakPay || 0) - (c.makeupPay || 0) - (c.otPay || 0) - (c.holWorkPay || 0);
        if (c.breakPay) {
          r.breakPay += c.breakPay;
          r.breakDays++;
          r.breakHours += c.breakH;
        }
        r.rows.push({ date, ...d, ...c });
        if (isPaidDay(staff, { date, ...d, ...c })) r.paidDays++;
      });
      DEPS.PayOptions.adjustBase(r, P, L.base, L.base / T.workdays); // pay.method B, D (A: không đổi gì)
      r.makeupNeed = total.need / MIN_H;
      r.makeupDeclared = total.made / MIN_H;
      r.debt = Math.max(0, total.need - total.made) / MIN_H; // giờ thiếu chưa bù
      r.makeupCredit = Math.max(0, total.made - total.need) / MIN_H; // giờ làm bù nhiều hơn giờ cần bù (đã trả trong makeupPay)
      return finishMonth(staff, r, { parts, unpaidExempt, kpiPct, entries, advance, settleDays });
    }

    // Phần của tháng SAU vòng các ngày: giờ vượt ngưỡng, công thức tháng, phụ cấp, KPI, khối, khoản điền thêm, quyết toán phép, thực lĩnh, vết.
    // Chạy lại được từ một bản chụp đã đổi một vài số tổng hợp (repin: ô số lượng Admin ghim trên phiếu), nên chỉ ghi đè các trường nó tính ra.
    function finishMonth(staff?, r?, c?) {
      const T = typeOf(staff),
        L = levelOf(staff);
      const { parts, unpaidExempt, kpiPct, entries, advance, settleDays } = c;
      // "Nghỉ được duyệt" đã duyệt cũng là ngày nghỉ (như mọi loại nghỉ, kể cả phép năm):
      // tính vào ngày nghỉ xét chuyên cần và giờ vượt ngưỡng như nghỉ không lương.
      // request.type.approved.countsAbsent = Không thì được miễn — test so với khối công thức của index.html tắt cờ này.
      const approvedCounted = need('request.type.approved.countsAbsent') ? r.approved || 0 : 0;
      // Giờ vượt ngưỡng (dùng chung cho chuyên cần và KPI): vắng không phép tính như nghỉ không lương; "Nghỉ, sẽ làm bù" chỉ tính qua giờ thiếu chưa bù
      r.overHours = DEPS.PayOptions.roundShort(gioVuotNguong(r, T, unpaidExempt, approvedCounted), P);
      // Biến của người trong tháng cho các công thức có tên
      const v = {
        luongCoBan: L.base,
        ngayCongChuan: T.workdays,
        ngayDiLam: r.count,
        gioVuotNguong: r.overHours ?? 0, // loại không có phụ cấp/KPI: m.overHours null, nhưng công thức Admin có thể đọc biến này
        ngayNghiXetChuyenCan: 0,
        iDorm: !!staff.idorm,
        loaiCoPhuCap: !!(T.travel || T.attendance),
        coKpi: !!T.kpi,
        kpiDat: false,
        kpiNamThanhPhan: false,
        mucKpi: 0,
        diemKpi: 0,
        batTamUng: staff.advanceOn !== false && DEPS.PayOptions.advanceEligible(P, typeKey(staff)),
        tienUng: DEPS.PayOptions.advanceBase(P, r.advanceBase, L.base),
        tongThanhPhanNgay: r.work
      };
      const F = monthFormulas(v, staff);
      // Ngày nghỉ xét chuyên cần và ngưỡng giờ vượt của chuyên cần: tính MỘT lần cho cờ r.attendOk và cho khối phụ cấp do C&B thêm (PayBlocksCalc.attach).
      // Ngưỡng = ghi đè của chức vụ (type.<mã>.overLimitHours, khác null) hoặc attendance.overLimitHours, CỘNG biên độ attendance.overLimitTolerance:
      // đúng ngưỡng của đường tiền (kernelFor(overlay) → OVER_ATTEND)
      // Ngày nghỉ xét chuyên cần = nghỉ phép + nghỉ không lương + nghỉ được duyệt (nếu tính) − khoản miễn + vắng; ngày iSAT không làm tăng số ngày nghỉ xét chuyên cần.
      // + ngày "Nghỉ, sẽ làm bù" theo giờ bù còn thiếu: min(số ngày willmakeup, làm tròn lên (giờ bù thiếu cuối kỳ tính ÷ giờ mỗi công));
      // giờ bù đã đủ thì các ngày đó không tính, giờ còn thiếu (kể cả giờ thiếu của ngày đi làm trễ) xếp vào ngày willmakeup trước
      const willmakeupCounted = Math.min(r.willmakeup, Math.ceil((r.debt || 0) / HOURS));
      const isatTaken = r.rows.filter(x => x.kind === 'isat').length;
      const absent = Math.max(
        0,
        r.leave + r.unpaid + approvedCounted - unpaidExempt + r.noshow + willmakeupCounted
      );
      const overLimitAttend =
        (T.overLimitHours ?? need('attendance.overLimitHours')) + need('attendance.overLimitTolerance');
      if (T.travel || T.attendance) {
        // phụ cấp đi lại / chuyên cần: theo ngày đi làm thực tế (không tính nghỉ, làm bù)
        r.absent = absent;
        v.ngayNghiXetChuyenCan = r.absent;
        r.attendOk = builtinFns.giuChuyenCan(r.absent, r.overHours, T.maxAbsent, overLimitAttend);
      }
      // THỨ TỰ: mọi biến công thức có thể đọc (kể cả điểm, mức KPI) được đặt xong TRƯỚC khi đọc công thức nào (F.*)
      if (T.kpi) {
        // kpiPct có thể là số (% hoàn thành) hoặc {pct, amt} với amt = mức đề xuất lương KPI (0 … KPI tối đa)
        const kin = kpiPct && typeof kpiPct === 'object' ? kpiPct : { pct: kpiPct, amt: null };
        const cp = (x?) => (x == null || x === '' ? null : Math.max(0, Math.min(PERCENT, Number(x))));
        const ca = (x?) => (x == null || x === '' ? null : Math.max(0, Math.min(L.kpi || 0, Number(x) || 0)));
        const selfP = cp(kin.pct),
          selfAmt = ca(kin.amt) == null ? L.kpi || 0 : ca(kin.amt);
        if (kin.method === 'five') {
          // KPI 5 thành phần: điểm đưa vào kin.parts = { wework, user, peer, manager, self } do Admin nhập. Mức KPI = Admin duyệt (admAmt) → đề xuất (amt) → KPI tối đa của level, kẹp 0 … trần.
          let e = KpiScore.evaluate(kin.parts, { pass: T.kpiPass });
          if (kin.totalPct != null) {
            // Admin ghim tổng KPI % trên phiếu: coi như đủ điểm với tổng đó; đạt khi cổng Wework không rớt và tổng chạm mốc đạt
            const weights = KpiScore.COMPONENTS.reduce((sum, c) => sum + c.weight, 0);
            const units = KpiScore.toUnits(kin.totalPct) * weights;
            const pass = e.weworkOk !== false && units >= T.kpiPass * KpiScore.toUnits(1) * weights;
            e = {
              ...e,
              complete: true,
              missing: [],
              units,
              total: kin.totalPct,
              pass,
              reason: pass ? 'ok' : e.weworkOk === false ? 'wework' : 'below-pass'
            };
          }
          const amt = ca(kin.admAmt) == null ? selfAmt : ca(kin.admAmt);
          r.kpiMethod = 'five';
          r.kpiParts = kin.parts || null;
          r.kpiApproved = e.complete; // đủ 5 điểm = đã chốt
          r.kpiSelfPct = selfP;
          r.kpiSelfAmt = selfAmt;
          r.kpiAmt = amt;
          r.kpiPct = e.complete ? e.total : null; // null = chờ điểm
          r.kpiGate = e.weworkOk;
          r.kpiPass = e.complete ? e.pass : null;
          r.kpiReason = e.reason;
          r.kpiMissing = e.missing;
          Object.assign(v, { kpiDat: !!e.pass, kpiNamThanhPhan: true, mucKpi: amt, diemKpi: e.units });
        } else {
          // Admin duyệt / chỉnh KPI: admPct, admAmt (nếu có) thay cho tự đánh giá; chưa duyệt → tính theo tự đánh giá
          const approved = cp(kin.admPct) != null;
          const p = approved ? cp(kin.admPct) : selfP;
          const amt = approved ? (ca(kin.admAmt) == null ? selfAmt : ca(kin.admAmt)) : selfAmt;
          r.kpiApproved = approved;
          r.kpiSelfPct = selfP;
          r.kpiSelfAmt = selfAmt;
          r.kpiAmt = amt;
          r.kpiPct = p;
          r.kpiPass = p == null ? null : so(P['kpi.passCompare'], p, T.kpiPass);
          Object.assign(v, { kpiDat: !!r.kpiPass, kpiNamThanhPhan: false, mucKpi: amt, diemKpi: p });
        }
      }
      // Các dòng phiếu LUÔN đọc từ công thức (không rào theo loại): công thức mặc định ra 0 cho loại không có khoản đó, còn công thức Admin đã lưu
      // có thể trả khác 0, và số trên các dòng phải khớp với tổng thu nhập (cũng đọc cùng công thức)
      // Mỗi dòng tiền làm tròn đồng MỘT lần; tổng thu nhập và các tổng sau đó là tổng đúng của các dòng nguyên (lines, travel, attendance, kpiPay, khối, khoản, quyết toán)
      // iSAT không làm giảm tỷ lệ ngày làm riêng của phụ cấp chuyên cần; công thức đi lại và các công thức khác vẫn dùng ngày làm thực tế.
      const attendanceF = isatTaken ? monthFormulas({ ...v, ngayDiLam: r.count + isatTaken }, staff) : F;
      const attendanceExact = DEPS.PayOptions.tiered('phuCapChuyenCan', attendanceF.phuCapChuyenCan, v, P); // lossMode = tiers: nhân tỷ lệ giữ (mặc định: đúng F.phuCapChuyenCan)
      r.travel = roundDong(F.phuCapDiLai);
      r.attendance = roundDong(attendanceExact);
      r.allow = r.travel + r.attendance;
      if (T.kpi) r.kpiRatio = F.heSoNgayKpi;
      r.kpiPay = roundDong(F.luongKpi);
      r.total = F.tongThuNhap + (attendanceExact - F.phuCapChuyenCan); // số thực theo cây công thức (phần chênh của phụ cấp chuyên cần giảm theo bậc, mặc định 0); chỉ để đối chiếu với tổng các dòng nguyên
      DEPS.PayBlocksCalc.attach(r, P, staff, {
        round: roundDong,
        typeKey,
        levelOf,
        so,
        ratio: F.tyLeNgayDiLam,
        absent,
        overLimit: overLimitAttend
      }); // khối phụ cấp do C&B thêm, sau cây tongThuNhap
      DEPS.PayEntriesCalc.attach(r, entries); // khoản điền thêm đã duyệt: chỉ khi có khoản mới có m.entries, cộng vào tổng thu nhập
      // Quyết toán phép dư: số ngày hết hạn × lương cơ bản ÷ ngày công chuẩn của tháng, làm tròn đồng; chỉ tháng có ngày quy tiền mới có m.settleDays, m.settlePay
      if (settleDays > 0) {
        r.settleDays = settleDays;
        r.settlePay = roundDong((settleDays * L.base) / T.workdays);
        r.total += r.settlePay;
      }
      // Tổng thu nhập = tổng các dòng nguyên đồng. Công thức tongThuNhap do Admin sửa làm tổng lệch quá một nửa đồng mỗi dòng so với các dòng thì tổng theo công thức (làm tròn đồng) thắng
      const lines = linesOf(r, roundDong);
      const dayPay = dayPayOf(lines);
      const blockSum = (r.blocks || []).reduce((sum, b) => sum + b.amount, 0);
      const entryAdd = r.entries ? DEPS.PayEntriesCalc.sums(r.entries).add : 0;
      const other = r.travel + r.attendance + r.kpiPay + (r.settlePay || 0) + blockSum + entryAdd;
      const reconciled = Math.abs(r.total - (dayPay + other)) <= (Object.keys(lines).length + 4) / 2;
      r.lines = lines;
      r.total = reconciled ? dayPay + other : roundDong(r.total);
      r.work = reconciled ? dayPay : roundDong(r.work);
      // ngày: pay nguyên đồng của từng dòng ngày cộng lại đúng tiền ngày của tháng (phần ô số lượng ghim đổi mà dòng ngày không đổi theo trừ ra)
      const adj = r.pinAdjust || {};
      payRows(r.rows, dayPay - roundDong((adj.leavePay || 0) + (adj.isatPay || 0) + (adj.holidayPay || 0)));
      r.net = netFrame(staff, r, F, advance);
      // vết: giá trị của từng công thức có tên (không nằm trong m khi duyệt so sánh: không đếm được, không serialize)
      // vết tiền ngày: các thành phần nguyên đồng cộng đúng tiền ngày của tháng (tiền OT là phần còn lại của dòng làm thêm sau giờ làm bù và làm lễ)
      const lamBu = Math.round(Math.min(parts.lamBu, lines.otPay)),
        tienLamLe = Math.round(Math.min(parts.tienLamLe, lines.otPay - lamBu));
      const tienOt = lines.otPay - lamBu - tienLamLe;
      const dayTrace = {
        tienNgayCong: r.work - lines.flexPay - lines.nightPay - lines.breakPay - lines.otPay,
        phuCapCa: lines.flexPay + lines.nightPay,
        gioNghiDem: lines.breakPay,
        lamBu,
        tienOt,
        tienLamLe,
        ngayDiLam: parts.ngayDiLam
      };
      const trace = {
        ...(reconciled
          ? dayTrace
          : {
              ...parts,
              tienNgayCong: roundDong(parts.tienNgayCong),
              phuCapCa: roundDong(parts.phuCapCa),
              gioNghiDem: roundDong(parts.gioNghiDem),
              lamBu: roundDong(parts.lamBu),
              tienOt: roundDong(parts.tienOt),
              tienLamLe: roundDong(parts.tienLamLe)
            }),
        tongThanhPhanNgay: r.work,
        tyLeNgayDiLam: F.tyLeNgayDiLam,
        phuCapDiLai: r.travel,
        phuCapChuyenCan: r.attendance,
        heSoNgayKpi: T.kpi ? r.kpiRatio : null,
        luongKpi: r.kpiPay,
        tongThuNhap: r.total,
        gioVuotNguong: r.overHours,
        tamUng: r.net.advance,
        ...(r.settlePay ? { quyetToanPhepDu: r.settlePay } : {}),
        tamUngToiDa: F.tamUng, // số tạm ứng theo quy tắc (công thức tamUng), có hay chưa có duyệt; chỉ trừ vào lương (tamUng) khi Admin đã duyệt; 0 khi không được tạm ứng
        thueTncn: r.net.tax,
        baoHiem: r.net.insurance,
        mienThue: r.net.exempt,
        thuNhapChiuThue: r.net.taxable,
        thucLinh: r.net.net
      };
      Object.defineProperty(r, 'trace', { value: trace, enumerable: false });
      return r;
    }

    /* ========================= LỚP THỰC LĨNH: khung khoá bảy bước ========================= */
    const entrySums = (m?) => DEPS.PayBlocksCalc.mergeSums(DEPS.PayEntriesCalc.sumsOf(m, P), m, P); // khoản điền thêm của m (toàn 0 khi không có khoản)
    /* Thuế lũy tiến từng phần trên thu nhập tính thuế của tháng */
    function progressiveTax(income?) {
      let tax = 0,
        lower = 0;
      for (const [upper, rate] of R.brackets) {
        if (income <= lower) break;
        tax += (Math.min(income, upper) - lower) * rate;
        lower = upper;
      }
      return tax;
    }
    /* Thuế TNCN từ tổng thu nhập / thu nhập chịu thuế / BH (dùng chung cho calcNet và phiếu lương Admin đã sửa số). Phương pháp theo hợp đồng (tax.method.<hợp đồng>):
       progressive (HĐLĐ từ 3 tháng): phát sinh khi chịu thuế − BH lớn hơn ngưỡng (mặc định: giảm trừ bản thân, tax.arise.mode), thu nhập tính thuế =
       chịu thuế − BH − giảm trừ gia cảnh (bản thân + người phụ thuộc), phần dương áp biểu lũy tiến;
       flat (HĐ dưới 3 tháng): khấu trừ trên tổng thu nhập từ ngưỡng (Admin tắt được); none: không khấu trừ. */
    // Giảm trừ gia cảnh đưa vào qua tham số thứ 5 hoặc contractInfo.deduction (số đã chụp trên phiếu); thiếu cả hai thì 0
    function taxFrom(
      { contract, taxOn, deduction: carried }: any,
      gross?,
      taxable?,
      insurance?,
      deduction = carried || 0
    ) {
      const method = DEPS.PayTailCalc.taxMethodOf(P, contract);
      if (method === 'progressive') {
        const income = taxable - insurance;
        const taxDue = so(P['tax.personalCompare'], income, DEPS.PayTailCalc.ariseThreshold(P, R.personal));
        const assessable = Math.max(0, income - deduction);
        return { taxDue, assessable, tax: taxDue ? roundDong(progressiveTax(assessable)) : 0 };
      }
      const flat = method === 'flat' && taxOn && so(P['tax.casual.thresholdCompare'], gross, R.casualThreshold);
      return { taxDue: false, assessable: 0, tax: flat ? roundDong(gross * R.casualRate) : 0 };
    }
    // Bảy bước: (1) tổng thu nhập → gross; (2) miễn thuế và chịu thuế; (3) bảo hiểm bắt buộc; (4) thuế TNCN; (5) tạm ứng; (6) khoản trừ khác;
    // (7) khoản cộng ngoài lương. Bước 6 và 7 chưa có danh mục (mặc định 0): không thêm trường vào kết quả để thực lĩnh khớp calcNet từng đồng.
    // Hợp đồng và cờ đóng BH của người (mặc định theo loại nhân sự)
    function contractOf(staff?) {
      const contract =
        staff.contract === 'long' || staff.contract === 'short'
          ? staff.contract
          : entitlementOf(staff, 'defaultContract') === 'short'
            ? 'short'
            : 'long';
      return { contract, insured: staff.insured == null ? DEPS.PayTailCalc.insuredOf(P, contract) : !!staff.insured };
    }
    // Hàm có sẵn mienThue: chỉ phần trả cao hơn lương giờ thường của cùng số giờ được miễn thuế. Giờ đêm: phụ trội đêm (tax.exempt.nightPremium × lương giờ × giờ),
    // mỗi ngày không quá phụ cấp ca đã trả của ngày đó (ngày không có phụ cấp ca thì giờ đêm không được miễn). OT / làm lễ: mỗi nhóm giờ miễn
    // phần tiền trả (đến mức luật của nhóm) trừ lương giờ thường × số giờ của nhóm
    function mienThueOf(staff?, m?, gross?) {
      const T = typeOf(staff),
        L = levelOf(staff),
        hourly = L.base / T.workdays / HOURS;
      // Bản chụp không có dòng ngày thì tính theo tổng giờ đêm
      const exemptNight = roundDong(
        Array.isArray(m.rows)
          ? m.rows.reduce(
              (sum, c) =>
                sum +
                Math.min(
                  Math.max(0, (c.nightH || 0) - (c.holMainNightH || 0)) * (c.hourly ?? hourly) * R.nightPremium,
                  c.bonus || 0
                ),
              0
            )
          : hourly * m.nightHours * R.nightPremium
      );
      const above = (pay?, cap?, hours?) => Math.max(0, Math.min(pay, cap) - hourly * hours);
      // otHol*: OT rơi vào ngày lễ tách riêng chỉ có trong bản chụp của bộ máy cũ; bộ máy này gộp mọi giờ ngày lễ vào holWork* (0 ở đây)
      const otHolHours = m.otHolHours || 0,
        otHolPay = m.otHolPay || 0;
      // OT ngày thường và OT cuối tuần mỗi loại miễn tới mức luật của loại đó (hệ số miễn thuế × lương giờ × giờ), phần trả cao hơn chịu thuế
      const otWeekendHours = m.otWeekendHours || 0,
        otWeekendPay = m.otWeekendPay || 0,
        otWeekdayHours = m.otHours - otHolHours - otWeekendHours;
      const exemptOt = roundDong(
        above(m.otPay - otHolPay - otWeekendPay, R.otNormalRate * hourly * otWeekdayHours, otWeekdayHours) +
          above(otWeekendPay, R.weekendRate * hourly * otWeekendHours, otWeekendHours) +
          above(
            otHolPay,
            hourly * (R.holidayRate * otHolHours + R.holidayNightAdd * (m.otHolNightHours || 0)),
            otHolHours
          ) +
          above(
            m.holWorkPay,
            hourly * (R.holidayRate * m.holWorkHours + R.holidayNightAdd * (m.holNightHours || 0)),
            m.holWorkHours
          )
      );
      return { exemptNight, exemptOt, exempt: Math.min(gross, exemptNight + exemptOt + entrySums(m).exempt) };
    }
    // Hàm có sẵn baoHiem: BH bắt buộc của người lao động và phần công ty. Số ngày không lương = ngày công chuẩn của người (m.workdaysStd, không có thì
    // type.<mã>.workdays) trừ số ngày có lương tính đến mốc tính (m.paidDays: ngày công, phép năm, nghỉ lễ hưởng lương, iSAT hưởng lương; bản chụp không có
    // m.paidDays thì đếm lại từ m.rows), không âm; từ tax.insurance.skipDays ngày trở lên (so theo tax.insurance.skipCompare) thì tháng đó không đóng.
    // Mức đóng không chia theo ngày.
    function baoHiemOf(staff?, m?) {
      const L = levelOf(staff);
      const { insured } = contractOf(staff);
      // nền đóng (insurance.base, sàn insurance.floorMode)
      const flagged = entrySums(m).insuranceBase; // phần khối và khoản có cờ bảo hiểm đã xác nhận (0 khi insurance.base không cho phép)
      const base = DEPS.PayTailCalc.insuranceBase(
        P,
        { levelBase: L.base, flagged, type: typeKey(staff), level: staff.level },
        PayrollParams
      );
      const paidDays =
        typeof m.paidDays === 'number' ? m.paidDays : (m.rows || []).filter(x => isPaidDay(staff, x)).length;
      const noPayDays = Math.max(
        0,
        (typeof m.workdaysStd === 'number' ? m.workdaysStd : typeOf(staff).workdays) - paidDays
      );
      const insuredMonth = insured && !so(P['tax.insurance.skipCompare'], noPayDays, R.insuranceSkipDays);
      const ins = (k?) => (insuredMonth ? roundDong(Math.min(base, R.insuranceCap[k]) * R.insurance[k]) : 0);
      const bhxh = ins('bhxh'),
        bhyt = ins('bhyt'),
        bhtn = ins('bhtn');
      const employer = insuredMonth
        ? roundDong(['bhxh', 'bhyt', 'bhtn'].reduce((s, k) => s + Math.min(base, R.insuranceCap[k]) * R.employer[k], 0))
        : 0;
      return { insured, insuredMonth, noPayDays, bhxh, bhyt, bhtn, insurance: bhxh + bhyt + bhtn, employer };
    }
    function netFrame(staff?, m?, F?, approved?) {
      const T = typeOf(staff),
        L = levelOf(staff),
        daily = L.base / T.workdays;
      const { contract } = contractOf(staff);
      const dependants = Math.max(0, Math.trunc(Number(staff.dependants) || 0));
      // (1) tổng thu nhập → gross (các khoản tiền làm tròn đồng trước khi cộng trừ, để các dòng hiển thị cộng lại đúng bằng thực lĩnh)
      const gross = roundDong(m.total);
      // (2) miễn thuế và chịu thuế
      const { exemptNight, exemptOt, exempt } = mienThueOf(staff, m, gross);
      const taxable = Math.max(0, gross - exempt); // thu nhập chịu thuế
      // (3) bảo hiểm bắt buộc
      const { insured, insuredMonth, noPayDays, bhxh, bhyt, bhtn, insurance, employer } = baoHiemOf(staff, m);
      // Admin bật/tắt cho từng người (mặc định có): giảm trừ gia cảnh, tạm ứng; khấu trừ thuế TNCN chỉ tắt được với HĐ dưới 3 tháng
      const deductOn = staff.deductOn !== false,
        advanceOn = staff.advanceOn !== false;
      const taxOn = contract === 'long' || staff.taxOn !== false;
      const deduction =
        DEPS.PayTailCalc.taxMethodOf(P, contract) === 'progressive' && deductOn
          ? R.personal + dependants * R.dependant
          : 0; // giảm trừ gia cảnh
      // (4) thuế TNCN
      const { taxDue, assessable, tax } = taxFrom({ contract, taxOn }, gross, taxable, insurance, deduction);
      // (5) tạm ứng: số theo quy tắc (công thức tamUng, 0 khi không được ứng), CHỈ trừ khi Admin đã duyệt tạm ứng của tháng
      // (approved === true), chưa duyệt thì 0; nhân sự không tự nhập số. calcNet (không có F) giữ số tạm ứng đã tính của m
      const advance = approved !== true ? 0 : F ? F.tamUng : m.net.advance;
      // (6) khoản trừ khác và (7) khoản cộng ngoài lương: chưa có danh mục (0), không thêm trường để thực lĩnh khớp calcNet từng đồng
      return {
        contract,
        insured,
        insuredMonth,
        noPayDays,
        dependants,
        taxOn,
        taxDue,
        deductOn,
        advanceOn,
        gross,
        exemptNight,
        exemptOt,
        exempt,
        taxable,
        bhxh,
        bhyt,
        bhtn,
        insurance,
        employer,
        deduction,
        assessable,
        tax,
        advance,
        ...(approved === true ? { advanceApproved: true } : {}), // chỉ người được duyệt mới có trường này: bản chụp của người khác không đổi dạng
        advanceDays: m.advanceBase / daily,
        nightHours: m.nightHours,
        net: gross - insurance - tax - advance - entrySums(m).deduct, // khoản trừ điền thêm trừ SAU thuế
        ...DEPS.PayEntriesCalc.netOf(m, P)
      };
    }
    const calcNet = (staff?, m?) => netFrame(staff, m, undefined, !!(m.net && m.net.advanceApproved === true));

    // Tính lại một tháng từ BẢN CHỤP đã có khi Admin ghim ô số lượng trên phiếu: đổi các số tổng hợp theo ghim (src/engine/payroll-pins.ts),
    // rồi chạy lại phần tháng (finishMonth) để phụ cấp, KPI, khối, miễn thuế, bảo hiểm, thuế, thực lĩnh tính theo. Bản chụp gốc không đổi; không có ghim nào làm đổi tiền
    // thì trả null. Không dùng đầu vào ban đầu (lịch, Check-in/out) nên số luôn khớp bản chụp dù dữ liệu đã đổi sau đó.
    function repinMonth(staff?, m?, pins?) {
      const Pins = DEPS.PayrollPins;
      if (!Pins.hasEffect(pins) || !m || !m.net || !Array.isArray(m.rows) || !m.trace) return null;
      const T = typeOf(staff),
        L = levelOf(staff),
        daily = L.base / T.workdays;
      const r = JSON.parse(JSON.stringify(m));
      const parts: Record<string, any> = {};
      for (const name of ['tienNgayCong', 'phuCapCa', 'gioNghiDem', 'lamBu', 'tienOt', 'tienLamLe', 'ngayDiLam'])
        parts[name] = m.trace[name] || 0;
      const entries = r.entries;
      const settleDays = Object.hasOwn(pins, 'settleDays') ? pins.settleDays : r.settleDays;
      // Giữ duyệt tạm ứng, số tính lại theo quy tắc (bản chụp không có cờ: có tạm ứng là đã duyệt); ô "tạm ứng" sửa tay đi đường số chi trả
      const advance = r.net.advanceApproved === true || (r.net.advanceApproved === undefined && r.net.advance > 0);
      for (const key of ['blocks', 'entries', 'settleDays', 'settlePay', 'trace', 'pinAdjust', 'lines']) delete r[key];
      const adj = Pins.apply(r, parts, pins, {
        daily,
        hourly: daily / HOURS,
        otRate: need('ot.rate'),
        weekendRate: need('ot.weekendRate'),
        holidayRate: HOL_RATE,
        paidLeave: !!T.paidLeave,
        paidHoliday: !!T.paidHoliday,
        isat: !!T.isat,
        holidayDaysNow: r.rows.filter(x => x.kind === 'holiday' && x.holBase > 0).length
      });
      const unpaidExempt = r.rows.filter(x => x.kind === 'unpaid' && x.absentExempt === true).length;
      if (Object.keys(adj).length) r.pinAdjust = adj; // tiền/ngày ghim đổi mà các dòng ngày (rows) không đổi theo: các dòng tiền (linesOf) cộng vào
      finishMonth(staff, r, { parts, unpaidExempt, kpiPct: Pins.kpiInput(r, pins), entries, advance, settleDays });
      r.pinned = Object.fromEntries(Object.entries(pins).filter(([key]: any) => !Pins.IGNORED_KEYS.includes(key)));
      return r;
    }

    return {
      P,
      derived,
      TYPES,
      typeKey,
      typeOf,
      entitlementOf,
      levelOf,
      assertStaff,
      toMin,
      overlapsNight,
      shiftFor,
      spanHours,
      breakSlots,
      workedHours,
      extraWorkHours,
      calcDay,
      thanhPhanNgay,
      partsOfDay,
      calcMonth,
      repinMonth,
      calcNet,
      taxFrom,
      progressiveTax,
      baoHiemOf,
      mienThueOf,
      builtinFns
    };
  }

  /* ========================= BUILTINS, VARIABLES, FORMULAS: dữ liệu ========================= */
  // Cùng hình với từ vựng của src/engine/formula-vocab.ts (key, label, synonyms, kind, unit, domain, locked, args).
  // Đơn vị: VND, day, hour, minute, ratio (không đơn vị), point (điểm), count (đúng sai hoặc số đếm), text. Miền: day, month, person.
  // BUILTINS: hàm có sẵn bị khoá, gọi được theo `fn(args, params)` thuần, đúng chữ ký của ctx.builtins trong Formula.evaluate
  //   (params = bộ tham số phẳng PayrollParams.DEFAULTS hoặc store.resolve(tháng).params).
  // VARIABLES: `from` là đường dẫn vào ngữ cảnh của một tháng đã tính: gốc `m` (kết quả calcMonth), `trace` (m.trace), `staff`, `level` (bậc
  //   lương của người), `type` (loại nhân sự); variablesOf(m, staff, params) dựng ctx.variables từ đó.
  // FORMULAS: công thức tháng có tên; giá trị đã tính nằm ở m.trace[khoá] (`from: 'trace.<khoá>'`).
  const arg = (name?, unit?, domain?) => ({ name, unit, domain });
  const builtin = (key?, label?, synonyms?, unit?, domain?, args?, fn?, extra?) => ({
    key,
    label,
    synonyms,
    kind: 'builtin',
    unit,
    domain,
    locked: true,
    args,
    fn,
    ...extra
  });
  const BUILTINS = Object.freeze({
    thanhPhanNgay: builtin(
      'thanhPhanNgay',
      'Thành phần của một ngày công',
      ['thành phần ngày', 'chi tiết ngày công'],
      'VND',
      'day',
      [
        arg('nguoi', 'text', 'person'),
        arg('ngay', 'text', 'day'),
        arg('laNgayLe', 'count', 'day'),
        arg('gioBuConDuoc', 'hour', 'month'),
        arg('boiCanh', 'text', 'day')
      ],
      ([staff, day, isHoliday, avail, context]: any, params) =>
        kernelFor(params).thanhPhanNgay(staff, day, isHoliday, avail, context),
      { returns: ['tienNgayCong', 'phuCapCa', 'gioNghiDem', 'lamBu', 'tienOt', 'tienLamLe', 'ngayDiLam'] }
    ),
    tinhGioVuotNguong: builtin(
      'tinhGioVuotNguong',
      'Giờ vượt ngưỡng',
      ['số giờ vượt ngưỡng'],
      'hour',
      'month',
      [
        arg('ngayKhongLuong', 'day', 'month'),
        arg('ngayVang', 'day', 'month'),
        arg('gioThieuChuaBu', 'hour', 'month'),
        arg('ngayPhepNam', 'day', 'month')
      ],
      ([khongLuong, vang, thieu, phep]: any, params) =>
        (khongLuong + vang) * params['time.workHoursPerDay'] + thieu + phep * params['time.workHoursPerDay']
    ),
    giuChuyenCan: builtin(
      'giuChuyenCan',
      'Còn giữ phụ cấp chuyên cần',
      ['giữ chuyên cần', 'đủ điều kiện chuyên cần'],
      'count',
      'month',
      [arg('ngayNghi', 'day', 'month'), arg('gioVuotNguong', 'hour', 'month'), arg('nguongNgayNghi', 'day', 'person')],
      ([ngayNghi, gioVuot, maxAbsent]: any, params) =>
        kernelFor(params).builtinFns.giuChuyenCan(ngayNghi, gioVuot, maxAbsent)
    ),
    tienKpi: builtin(
      'tienKpi',
      'Tiền KPI theo điểm 5 thành phần',
      ['tiền KPI', 'tiền thưởng KPI'],
      'VND',
      'month',
      [arg('mucKpi', 'VND', 'month'), arg('diemDonVi', 'point', 'month'), arg('heSo', 'ratio', 'month')],
      ([amt, units, heSo]: any, params) => kernelFor(params).builtinFns.tienKpi(amt, units, heSo)
    ),
    tienKpiCu: builtin(
      'tienKpiCu',
      'Tiền KPI theo % tự đánh giá (cách cũ, trước tháng bật KPI 5 thành phần)',
      ['tiền KPI theo phần trăm'],
      'VND',
      'month',
      [arg('mucKpi', 'VND', 'month'), arg('diemPhanTram', 'point', 'month'), arg('heSo', 'ratio', 'month')],
      ([amt, pct, heSo]: any, params) => kernelFor(params).builtinFns.tienKpiCu(amt, pct, heSo)
    ),
    so: builtin(
      'so',
      'So sánh theo phép có tên (gt, gte, lt, lte)',
      ['so sánh'],
      'count',
      'month',
      [arg('phep', 'text', 'person'), arg('a', 'ratio', 'month'), arg('b', 'ratio', 'month')],
      ([op, a, b]: any) => so(op, a, b)
    ),
    roundDong: builtin(
      'roundDong',
      'Làm tròn đồng',
      ['làm tròn'],
      'VND',
      'month',
      [arg('x', 'VND', 'month')],
      ([x]: any, params) => kernelFor(params).builtinFns.roundDong(x)
    ),
    baoHiem: builtin(
      'baoHiem',
      'Bảo hiểm bắt buộc',
      ['bảo hiểm', 'BHXH BHYT BHTN'],
      'VND',
      'month',
      [arg('nguoi', 'text', 'person'), arg('thang', 'text', 'month')],
      ([staff, m]: any, params) => kernelFor(params).baoHiemOf(staff, m).insurance
    ),
    mienThue: builtin(
      'mienThue',
      'Khoản miễn thuế của giờ đêm và OT',
      ['miễn thuế'],
      'VND',
      'month',
      [arg('nguoi', 'text', 'person'), arg('thang', 'text', 'month'), arg('tongThuNhap', 'VND', 'month')],
      ([staff, m, gross]: any, params) => kernelFor(params).mienThueOf(staff, m, gross).exempt
    ),
    tienUng: builtin(
      'tienUng',
      'Lương cơ bản thực nhận của ngày để tính tạm ứng',
      ['nền tạm ứng'],
      'VND',
      'day',
      [arg('ngay', 'text', 'day'), arg('ngayCong', 'text', 'day')],
      ([date, c]: any, params) => {
        const [, , dd] = date.split('-');
        return Number(dd) <= params['advance.untilDay'] ? advancePayOfDay(c) : 0;
      }
    )
  });
  const variable = (key?, label?, synonyms?, unit?, domain?, from?, extra?) => ({
    key,
    label,
    synonyms,
    kind: 'variable',
    unit,
    domain,
    from,
    ...extra
  });
  const VARIABLES = Object.freeze({
    // sáu thành phần ngày, cộng theo tháng (từ thanhPhanNgay); ngayDiLam kèm theo
    tienNgayCong: variable(
      'tienNgayCong',
      'Tiền ngày công',
      ['lương theo ngày công', 'lương ngày công'],
      'VND',
      'month',
      'trace.tienNgayCong'
    ),
    phuCapCa: variable(
      'phuCapCa',
      'Phụ cấp ca',
      ['phụ cấp ca flex', 'phụ cấp ca đêm'],
      'VND',
      'month',
      'trace.phuCapCa'
    ),
    gioNghiDem: variable('gioNghiDem', 'Tiền giờ nghỉ đêm', ['giờ nghỉ đêm'], 'VND', 'month', 'trace.gioNghiDem'),
    lamBu: variable('lamBu', 'Tiền làm bù', ['làm bù'], 'VND', 'month', 'trace.lamBu'),
    tienOt: variable('tienOt', 'Tiền OT', ['OT', 'làm thêm giờ'], 'VND', 'month', 'trace.tienOt'),
    tienLamLe: variable(
      'tienLamLe',
      'Tiền làm ngày lễ',
      ['làm lễ', 'đi làm ngày lễ'],
      'VND',
      'month',
      'trace.tienLamLe'
    ),
    ngayDiLam: variable('ngayDiLam', 'Số ngày đi làm', ['ngày đi làm', 'ngày công thực tế'], 'day', 'month', 'm.count'),
    // đầu vào của người
    luongCoBan: variable(
      'luongCoBan',
      'Lương cơ bản của level',
      ['lương cơ bản', 'LCB'],
      'VND',
      'person',
      'level.base'
    ),
    ngayCongChuan: variable(
      'ngayCongChuan',
      'Ngày công chuẩn',
      ['công chuẩn', 'ngày công tiêu chuẩn'],
      'day',
      'person',
      'type.workdays',
      { nonZero: true }
    ),
    gioVuotNguong: variable(
      'gioVuotNguong',
      'Giờ vượt ngưỡng',
      ['số giờ vượt ngưỡng'],
      'hour',
      'month',
      'm.overHours',
      { builtin: 'tinhGioVuotNguong' }
    ),
    // biến phụ mà các công thức tháng cần
    tongThanhPhanNgay: variable(
      'tongThanhPhanNgay',
      'Tổng sáu thành phần ngày',
      ['tổng tiền công trong ngày', 'tiền ngày công đã gồm phụ cấp ca, nghỉ đêm, làm bù, OT, làm lễ'],
      'VND',
      'month',
      'm.work',
      {
        note: 'cộng dồn theo từng ngày (c.total), đúng thứ tự phép cộng của calcMonth; khác tổng sáu biến thành phần chỉ ở sai số thực'
      }
    ),
    ngayNghiXetChuyenCan: variable(
      'ngayNghiXetChuyenCan',
      'Ngày nghỉ xét chuyên cần',
      ['ngày nghỉ chuyên cần'],
      'day',
      'month',
      'm.absent'
    ),
    iDorm: variable('iDorm', 'Ở ký túc xá iDorm', ['iDorm'], 'count', 'person', 'staff.idorm'),
    mucKpi: variable('mucKpi', 'Mức KPI đã duyệt', ['mức KPI'], 'VND', 'month', 'm.kpiAmt'),
    diemKpi: variable('diemKpi', 'Điểm KPI', ['tổng điểm KPI'], 'point', 'month', 'm.kpiPct'),
    tienUng: variable('tienUng', 'Cơ sở tạm ứng', ['nền tạm ứng'], 'VND', 'month', 'm.advanceBase')
  });
  // Biến theo ngày của công thức "tổng theo ngày (…)": src/engine/payroll-day-parts.ts
  const { DAY_VARIABLES, dayArraysOf } = DEPS.PayrollDayParts;
  const dayVariablesOf = (m?) => dayArraysOf(m.rows, m.trace);

  const formula = (key?, label?, synonyms?, unit?, dependsOn?, extra?) => ({
    key,
    label,
    synonyms,
    kind: 'formula',
    unit,
    domain: 'month',
    from: `trace.${key}`,
    dependsOn,
    ...extra
  });
  const FORMULAS = Object.freeze({
    tongThuNhap: formula(
      'tongThuNhap',
      'Tổng thu nhập',
      ['tổng lương', 'thu nhập gộp'],
      'VND',
      ['tongThanhPhanNgay', 'phuCapDiLai', 'phuCapChuyenCan', 'luongKpi'],
      {
        requiredDayParts: ['tienNgayCong', 'phuCapCa', 'gioNghiDem', 'lamBu', 'tienOt', 'tienLamLe']
      }
    ),
    phuCapDiLai: formula('phuCapDiLai', 'Phụ cấp đi lại', ['đi lại'], 'VND', [
      'luongCoBan',
      'tyLeNgayDiLam',
      'type.<type>.travel',
      'iDorm'
    ]),
    phuCapChuyenCan: formula('phuCapChuyenCan', 'Phụ cấp chuyên cần', ['chuyên cần'], 'VND', [
      'luongCoBan',
      'tyLeNgayDiLam',
      'giuChuyenCan',
      'type.<type>.attendance'
    ]),
    luongKpi: formula('luongKpi', 'Lương KPI', ['tiền KPI', 'thưởng KPI'], 'VND', [
      'mucKpi',
      'diemKpi',
      'heSoNgayKpi',
      'tienKpi',
      'tienKpiCu'
    ]),
    heSoNgayKpi: formula('heSoNgayKpi', 'Hệ số ngày đi làm của KPI', ['hệ số KPI'], 'ratio', [
      'gioVuotNguong',
      'tyLeNgayDiLam',
      'kpi.overLimitHours',
      'kpi.overLimitCompare'
    ]),
    tyLeNgayDiLam: formula('tyLeNgayDiLam', 'Tỷ lệ ngày đi làm', ['tỷ lệ ngày công'], 'ratio', [
      'ngayDiLam',
      'ngayCongChuan'
    ]),
    tamUng: formula('tamUng', 'Tạm ứng', ['ứng lương'], 'VND', ['advance.rate', 'tienUng', 'roundDong']),
    // khung thực lĩnh (khoá): chỉ ghi vết, không sửa được
    thuNhapChiuThue: formula(
      'thuNhapChiuThue',
      'Thu nhập chịu thuế',
      ['chịu thuế'],
      'VND',
      ['tongThuNhap', 'mienThue'],
      { locked: true }
    ),
    thucLinh: formula('thucLinh', 'Thực lĩnh', ['lương thực nhận'], 'VND', ['tongThuNhap', 'baoHiem', 'tamUng'], {
      locked: true
    })
  });
  // Mọi mã trong từ vựng (ba bảng này cộng registry)
  const VOCABULARY_KEYS = Object.freeze([
    'tienNgayCong',
    'phuCapCa',
    'gioNghiDem',
    'lamBu',
    'tienOt',
    'tienLamLe',
    'tongThuNhap',
    'phuCapDiLai',
    'phuCapChuyenCan',
    'luongKpi',
    'heSoNgayKpi',
    'tyLeNgayDiLam',
    'tamUng',
    'luongCoBan',
    'ngayDiLam',
    'ngayCongChuan',
    'gioVuotNguong'
  ]);

  // Dựng ctx.variables cho Formula.evaluate từ một tháng đã tính: giá trị của mỗi biến lấy theo `from` (không eval, chỉ đi theo khoá)
  function variablesOf(m?, staff?, params?) {
    const k = kernelFor(params);
    const roots = { m, trace: m.trace, staff, level: k.levelOf(staff), type: k.typeOf(staff) };
    const out: Record<string, any> = {};
    for (const [key, entry] of Object.entries(VARIABLES)) {
      const [rootName, ...rest] = entry.from.split('.');
      let value = roots[rootName];
      for (const part of rest) value = value == null ? value : value[part];
      out[key] =
        entry.unit === 'count' && typeof value === 'boolean'
          ? Number(value)
          : (value ?? (entry.unit === 'count' ? 0 : null));
    }
    if (m.workdaysStd !== undefined) out.ngayCongChuan = m.workdaysStd; // ngày công chuẩn của người (mảng thứ của đầu vào hoặc tự đếm theo lịch)
    return out;
  }
  // ctx đủ cho Formula.evaluate(tree, ctx): biến của tháng, tham số phẳng, hàm có sẵn gọi theo (args, params)
  function contextFor(m?, staff?, params?) {
    const builtins: Record<string, any> = {};
    for (const [key, entry] of Object.entries(BUILTINS)) builtins[key] = (args?, p?) => entry.fn(args, p || params);
    return { variables: variablesOf(m, staff, params), parameters: params, builtins, formulas: {} };
  }

  /* ========================= API ========================= */
  // Chính sách duyệt khoản chưa duyệt, dựng từ tham số request.type.<mã>.pendingRule / rejectedRule (cùng hình ApprovalView.POLICY)
  function approvalPolicy(params?) {
    const policy = { pending: {} as Record<string, any>, rejected: {} as Record<string, any> };
    for (const [key, value] of Object.entries(params)) {
      const m = /^request\.type\.(?<item>[a-z_]+)\.(?<rule>pendingRule|rejectedRule)$/.exec(key);
      if (m) policy[m.groups!.rule === 'pendingRule' ? 'pending' : 'rejected'][m.groups!.item] = value;
    }
    return policy;
  }
  // Chuỗi đầy đủ: lịch → payView → ActualHours.apply → calcMonth. input như test/helpers/payroll-cases.ts
  // Các góc nhìn bộ tham số của MỘT người trong MỘT tháng, dùng chung cho computeMonth và repin để hai đường tính cùng một bộ tham số
  function prepare(params?, staff?, month?) {
    params = DEPS.WorkSchedule.create(DEPS.PayrollParams.fillLate(params)).monthView(month); // pay.method C: ngày công chuẩn theo lịch của tháng (một nguồn lịch)
    const person = DEPS.WorkSchedule.create(params).forPerson(staff, month); // lịch của người, mẫu số lương ngày của người
    params = DEPS.PayOptions.levelView(person.params, staff); // quyền lợi theo bậc (không ghi đè nào thì giữ nguyên bộ tham số)
    return { params, person, k: kernelFor(params) };
  }
  function computeMonth(input?, params?) {
    const { params: viewed0, person, k } = prepare(params, input.staff, input.month);
    params = viewed0;
    const { staff, days, approvals, sessions, kpi, holidays, month, upTo, asOf } = input;
    k.assertStaff(staff); // loại lạ hoặc bậc không có trong bảng: ném PAYROLL_BAD_TYPE hoặc PAYROLL_BAD_LEVEL, không tính ra 0 âm thầm
    let { payDays, pendingItems } = DEPS.ApprovalView.create(params).payView(days, approvals, approvalPolicy(params), {
      holidays,
      staffType: staff.type,
      schedule: person.schedule // lịch của người trong tháng
    });
    const applied = DEPS.ActualHours.create(params).apply(payDays, sessions, { asOf, staff, holidays, month });
    payDays = applied.days;
    const actualReport = { report: applied.report, missing: applied.missing, absent: applied.absent };
    if (input.explanationHold && input.explanationHold.length) {
      // Giải trình chưa được Admin duyệt (hoặc bị từ chối): ngày đó không tính lương, như nghỉ không lương, kể cả khi có Check-in/out.
      // Dòng ngày giữ giờ bấm thật của ngày (punchIn, punchOut) và ghi held = 'rejected' (bị từ chối) hoặc 'pending' (chưa duyệt) để phiếu in nhãn
      payDays = { ...payDays };
      const rejected = new Set<any>(input.explanationRejected || []);
      for (const date of input.explanationHold) {
        const { punchIn, punchOut } = payDays[date] || {};
        payDays[date] = {
          kind: 'unpaid',
          ...(punchIn !== undefined ? { punchIn } : {}),
          ...(punchOut !== undefined ? { punchOut } : {}),
          held: rejected.has(date) ? 'rejected' : 'pending'
        };
      }
    }
    const m = k.calcMonth(staff, payDays, kpi, holidays, month, upTo, input.entries, asOf, {
      advance: input.advanceApproved === true, // Admin đã duyệt tạm ứng của tháng; số tiền do công thức tamUng tính
      settleDays: input.leaveSettleDays
    });
    if (person.workdaysStd !== undefined) m.workdaysStd = person.workdaysStd; // chỉ khi lịch là mảng thứ của đầu vào hoặc ngày công chuẩn tự đếm theo lịch
    return { m, payDays, pendingItems, actualReport, trace: m.trace };
  }
  function create(params?, overrides?) {
    if (!params || typeof params !== 'object')
      throw new TypeError('create(params): cần bộ tham số phẳng (PayrollParams.DEFAULTS)');
    const k = kernelFor(params);
    const bound = {
      ENGINE_VERSION,
      params,
      calcDay: k.calcDay,
      thanhPhanNgay: k.thanhPhanNgay,
      calcMonth: (staff, ...rest) => {
        const kk = kernelFor(DEPS.PayOptions.levelView(params, staff)); // quyền lợi theo bậc của người này
        kk.assertStaff(staff); // cổng vào đầy đủ: cùng kiểm với computeMonth (AI soát dữ liệu gọi calcMonth trực tiếp)
        return kk.calcMonth(staff, ...rest);
      },
      calcNet: k.calcNet,
      payslip: k.calcNet,
      taxFrom: k.taxFrom,
      progressiveTax: k.progressiveTax,
      computeMonth: (input?) => computeMonth(input, params),
      // Tính lại tháng từ bản chụp m với ô số lượng Admin ghim (pins: { workDays, ot20H, kpiAmt, ... }); null khi không ghim nào làm đổi tiền
      repin: (m?, staff?, pins?, month?) => {
        const { k } = prepare(params, staff, month);
        k.assertStaff(staff);
        return k.repinMonth(staff, m, pins);
      },
      BUILTINS,
      VARIABLES,
      FORMULAS
    };
    return overrides ? { ...bound, ...overrides } : bound;
  }

  return {
    ENGINE_VERSION,
    create,
    computeMonth,
    BUILTINS,
    VARIABLES,
    DAY_VARIABLES,
    FORMULAS,
    VOCABULARY_KEYS,
    dayVariablesOf,
    variablesOf,
    contextFor,
    COMPARE,
    kernelFor,
    columnsOfDay
  };
});
