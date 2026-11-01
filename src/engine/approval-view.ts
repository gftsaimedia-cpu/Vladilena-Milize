(function (root: any, factory: any) {
  // payroll-params.js phải nạp trước trang (trình duyệt) để mô-đun lấy mặc định từ DEFAULTS; vắng thì dùng FALLBACK.
  const params = typeof module === 'object' && module.exports ? require('./payroll-params') : root.PayrollParams;
  const schedule = typeof module === 'object' && module.exports ? require('./work-schedule') : root.WorkSchedule; // lịch làm việc: một nguồn
  const api = factory(params, schedule);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ApprovalView = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (PayrollParams, WorkSchedule) {
  'use strict';
  // Khoản tự khai trong Lịch ước tính cần Admin duyệt; willmakeup có một hoặc nhiều khung giờ làm bù dự kiến.
  // Module này chỉ quyết định khoản nào cần duyệt, phần nào được trả tiền và khoản chưa duyệt bị xử lý ra sao.
  // Không đổi calcDay / calcMonth: payView trả lịch đã bỏ hoặc đổi khoản chưa duyệt, người gọi chạy calcMonth trên đó.
  //
  // Ngữ cảnh (ctx) cho khoản "đi làm ngày lễ": chỉ biết ngày hôm nay là lễ khi có danh sách lễ, nên các hàm nhận thêm ctx tuỳ chọn.
  //   itemOf / fingerprint / effectiveStatus: ctx = { date: 'YYYY-MM-DD', holidays: mảng hoặc Set ngày lễ, staffType: mã chức vụ }
  //   payView: ctx = { holidays, staffType } (ngày lấy từ khoá của lịch). Thiếu ctx hoặc thiếu date / holidays: không nhận ra khoản này.
  // makeup_day không còn dùng: itemOf không trả loại này; giữ trong danh sách vì bộ tham số vẫn có khoá request.type.makeup_day.*
  // holiday_work không còn là loại khoản riêng: làm ngày lễ là OT nên khoản này mang mục 'ot' (found.holiday = true) và duyệt như mọi OT;
  // 'holiday_work' chỉ còn là tên hàng chính sách "chưa duyệt thì bỏ cả ngày" (request.type.holiday_work.*) và là dấu vân tay `holiday_work|…`
  // của dòng duyệt OT ngày lễ.
  const ITEMS = ['isat', 'approved', 'makeup_day', 'ot', 'makeup_hours', 'holiday_work', 'leave', 'willmakeup'];

  // Cách xử lý khoản CHƯA DUYỆT, theo trạng thái rồi theo loại khoản:
  //   unpaid: thành ngày nghỉ không lương (mất lương ngày, tính là ngày nghỉ khi xét chuyên cần và giờ vượt ngưỡng KPI)
  //   drop:   bỏ cả ngày khỏi lịch
  //   strip:  giữ ngày đi làm, bỏ đoạn làm thêm (OT hoặc làm bù theo giờ không được trả, không bù giờ thiếu)
  // Bị từ chối tính tiền y hệt chờ duyệt; hai hàng chỉ khác nhãn hiển thị. Muốn khác thì sửa đúng một ô.
  // holiday_work (OT khai trên ngày lễ): chưa duyệt thì bỏ ngày khai, calcMonth trả lương nghỉ lễ như ngày không đi làm (CTV, NV: lương ngày; TTS: 0)
  // leave ("Nghỉ phép năm"): chưa duyệt hoặc bị từ chối là nghỉ không lương như iSAT và "Nghỉ được duyệt"; vẫn đếm là ngày nghỉ
  //   khi xét chuyên cần và giờ vượt ngưỡng. Số dư phép KHÔNG đổi theo trạng thái duyệt: ngày phép chờ duyệt đã giữ chỗ (xem server.js).
  // Bảng này nằm ở registry: request.type.<khoản>.pendingRule và .rejectedRule (create(params) dựng POLICY từ đó).
  //
  // Mọi giá trị đến từ bộ tham số phẳng `params` qua create(params); hàm trần của mô-đun = create(mặc định), mặc định là
  // PayrollParams.DEFAULTS. FALLBACK là bản chép của đúng các khoá mô-đun này đọc, để trang chưa nạp
  // payroll-params.js (và test nạp mô-đun trong `vm`) vẫn chạy. Phải bằng PayrollParams.DEFAULTS (scripts/params/check-fallbacks.ts
  // kiểm). Lịch làm việc theo loại nhân sự (Thứ 0 = Chủ nhật) khớp TYPES.dows và SCHED của server.js.
  const FALLBACK = Object.freeze({
    'type.tts.dows': Object.freeze([1, 2, 3, 4, 5]),
    'type.ctv.dows': Object.freeze([1, 2, 3, 4, 5, 6]),
    'type.nv.dows': Object.freeze([1, 2, 3, 4, 5, 6]),
    'request.type.isat.pendingRule': 'unpaid',
    'request.type.isat.rejectedRule': 'unpaid',
    'request.type.approved.pendingRule': 'unpaid',
    'request.type.approved.rejectedRule': 'unpaid',
    'request.type.makeup_day.pendingRule': 'drop',
    'request.type.makeup_day.rejectedRule': 'drop',
    'request.type.ot.pendingRule': 'strip',
    'request.type.ot.rejectedRule': 'strip',
    'request.type.makeup_hours.pendingRule': 'strip',
    'request.type.makeup_hours.rejectedRule': 'strip',
    'request.type.holiday_work.pendingRule': 'drop',
    'request.type.holiday_work.rejectedRule': 'drop',
    'request.type.leave.pendingRule': 'unpaid',
    'request.type.leave.rejectedRule': 'unpaid',
    'request.type.willmakeup.pendingRule': 'unpaid',
    'request.type.willmakeup.rejectedRule': 'unpaid',
    'request.type.isat.countsAbsent': true,
    'request.type.approved.countsAbsent': true,
    'request.type.makeup_day.countsAbsent': true,
    'request.type.ot.countsAbsent': true,
    'request.type.makeup_hours.countsAbsent': true,
    'request.type.holiday_work.countsAbsent': true,
    'request.type.leave.countsAbsent': true,
    'request.type.willmakeup.countsAbsent': true
  });
  // Giá trị hợp lệ của từng loại khoản (test kiểm mọi ô của POLICY nằm trong tập này)
  const ALLOWED_ACTIONS = Object.freeze({
    isat: Object.freeze(['drop', 'unpaid']),
    approved: Object.freeze(['drop', 'unpaid']),
    makeup_day: Object.freeze(['drop']),
    ot: Object.freeze(['strip']),
    makeup_hours: Object.freeze(['strip']),
    holiday_work: Object.freeze(['drop']),
    leave: Object.freeze(['drop', 'unpaid']),
    willmakeup: Object.freeze(['unpaid'])
  });

  // Bộ tham số phẳng → lịch làm việc và chính sách khoản chưa duyệt. Khoá vắng là lỗi (không đoán giá trị).
  function build(P?) {
    const need = (key?) => {
      if (!Object.hasOwn(P, key))
        throw Object.assign(new Error(`Thiếu tham số ${key}`), { code: 'PARAM_MISSING', key });
      return P[key];
    };
    const schedule: Record<string, any> = {};
    for (const key of Object.keys(P)) {
      const m = /^type\.(?<type>[a-z0-9]+)\.dows$/.exec(key);
      if (m) schedule[m.groups!.type] = Object.freeze([...need(key)]);
    }
    const SCHEDULE = Object.freeze(schedule);
    const pending: Record<string, any> = {},
      rejected: Record<string, any> = {};
    for (const item of ITEMS) {
      pending[item] = need(`request.type.${item}.pendingRule`);
      rejected[item] = need(`request.type.${item}.rejectedRule`);
    }
    const POLICY = Object.freeze({ pending: Object.freeze(pending), rejected: Object.freeze(rejected) });
    // Khoản chưa duyệt bị tính là nghỉ không lương có được tính là ngày nghỉ khi xét chuyên cần và giờ vượt ngưỡng không (mặc định có).
    // Chỉ có nghĩa với loại có cách xử lý "unpaid"; loại khác không bao giờ tạo ngày nghỉ không lương nên luôn true.
    const countsAbsent: Record<string, any> = {};
    for (const item of ITEMS) countsAbsent[item] = need(`request.type.${item}.countsAbsent`);
    const COUNTS_ABSENT = Object.freeze(countsAbsent);

    // Loại làm thêm hiệu lực: giống calcDay, bản ghi cũ có extraOut mà không có extraKind được hiểu là làm bù
    function extraKindOf(day?) {
      return day.extraKind || (day.extraOut ? 'makeup' : '');
    }
    // Đoạn làm thêm trước ca (extraIn → in) và sau ca (out → extraOut); trùng giờ ca coi như không có (giống preSpan, postSpan)
    function segmentsOf(day?) {
      const before = day.extraIn && day.in && day.extraIn !== day.in ? `${day.extraIn}-${day.in}` : '',
        after = day.extraOut && day.out && day.extraOut !== day.out ? `${day.out}-${day.extraOut}` : '';
      return { before, after };
    }

    // Ngày ctx.date có phải ngày lễ nằm trong lịch làm việc của người (và người có quyền lợi OT) không: ctx.schedule (lịch đã giải, của người) nếu có, không thì lịch của chức vụ ctx.staffType.
    function isScheduledHoliday(ctx?) {
      if (!ctx || typeof ctx.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(ctx.date)) return false;
      const list = ctx.holidays;
      const listed =
        list && typeof list.has === 'function' ? list.has(ctx.date) : Array.isArray(list) && list.includes(ctx.date);
      if (!listed) return false;
      // Làm ngày lễ là OT: chức vụ không có quyền lợi OT (type.<mã>.benefit.ot) không có khoản đi làm ngày lễ, duyệt cũng không ra tiền
      if (typeof ctx.staffType === 'string' && !P[`type.${ctx.staffType}.benefit.ot`]) return false;
      // Loại lạ ('constructor', '__proto__' ...) không có lịch nên không có ngày lễ trong lịch, không ném lỗi
      const ws = WorkSchedule.create(P);
      return ws.isWorkDay(ctx.schedule || ws.scheduleOf({ type: ctx.staffType }, ctx.date.slice(0, 7)), ctx.date);
    }
    // ctx của một ngày cụ thể từ ctx của cả lịch (payView, declaredItems)
    const dayCtx = (ctx?, date?) =>
      ctx ? { date, holidays: ctx.holidays, staffType: ctx.staffType, schedule: ctx.schedule } : undefined;

    // Trả null nếu ngày không có khoản cần duyệt, ngược lại { item, fingerprint } (thêm holiday: true cho OT ngày lễ).
    // Ngày khoá của Check-in/out (có src hoặc attendanceConfirmed) thuộc luồng khác (Duyệt OT thực tế), không phải khoản tự khai.
    // ctx (tuỳ chọn, xem đầu file): ngày đi làm (có giờ vào và ra) đúng ngày lễ trong lịch của người có quyền lợi OT là OT ngày lễ, giờ vào –
    // giờ ra là khung giờ OT được duyệt. Mục là 'ot' như mọi OT; chưa duyệt thì bỏ cả ngày (hàng chính sách holiday_work). Đoạn OT kèm theo
    // trên ngày lễ (ngày đã lưu từ trước) vào dấu vân tay của khoản: mỗi ngày chỉ có MỘT dòng duyệt, duyệt ngày lễ là duyệt cả đoạn OT, đổi
    // đoạn OT thì phải duyệt lại. Ngày lễ không có OT kèm chỉ có giờ vào, ra trong dấu vân tay. Làm bù trên ngày lễ bị chặn và calcDay bỏ
    // nó, nên không vào dấu vân tay.
    function holidayFingerprint(day?) {
      const { before, after } = extraKindOf(day) === 'ot' ? segmentsOf(day) : {};
      return `holiday_work|${day.in}-${day.out}` + (before || after ? `|ot|${before}|${after}` : '');
    }
    function itemOf(day?, ctx?) {
      if (!day || typeof day !== 'object' || day.src || day.attendanceConfirmed) return null;
      const kind = day.kind || 'work';
      if (kind === 'isat') return { item: 'isat', fingerprint: 'isat' };
      if (kind === 'approved') return { item: 'approved', fingerprint: 'approved' };
      if (kind === 'leave') return { item: 'leave', fingerprint: 'leave' };
      if (kind === 'willmakeup') {
        const plans = Array.isArray(day.makeupPlans)
          ? day.makeupPlans
          : day.makeupDate
            ? [{ date: day.makeupDate, from: '', to: '' }]
            : [];
        const canonical = plans
          .map(plan => [plan.date || '', plan.from || '', plan.to || ''])
          .sort((a: any, b: any) => a.join('|').localeCompare(b.join('|')));
        return { item: 'willmakeup', fingerprint: `willmakeup|${JSON.stringify(canonical)}` };
      }
      // Mọi loại khác (kể cả ngày loại cũ 'makeup', bộ máy tính 0) không có khoản cần duyệt
      if (kind !== 'work') return null;
      if (day.in && day.out && isScheduledHoliday(ctx))
        return { item: 'ot', fingerprint: holidayFingerprint(day), holiday: true };
      const extraKind = extraKindOf(day);
      if (extraKind !== 'ot' && extraKind !== 'makeup') return null;
      const { before, after } = segmentsOf(day);
      if (!before && !after) return null;
      const item = extraKind === 'ot' ? 'ot' : 'makeup_hours';
      return { item, fingerprint: `${item}|${before}|${after}` };
    }

    // Chuỗi mô tả phần được trả tiền của ngày ('' nếu ngày không có khoản cần duyệt).
    // Đổi ca, preset, giờ nghỉ không đổi chuỗi; đổi loại, đoạn làm thêm hoặc giờ ca liền kề đoạn đó thì đổi.
    function fingerprint(day?, ctx?) {
      const found = itemOf(day, ctx);
      return found ? found.fingerprint : '';
    }

    // Quy tắc duy nhất cho trạng thái hiệu lực. 'approved' chỉ khi dòng tồn tại, status 'approved' và dấu vân tay khớp ngày hiện tại.
    // Không có dòng, dấu vân tay lệch (hoặc dòng không mang fingerprint) đều là 'pending': thiếu dữ liệu không bao giờ tạo ra tiền.
    // Ngày không có khoản cần duyệt trả null.
    function effectiveStatus(day?, row?, ctx?) {
      const found = itemOf(day, ctx);
      if (!found) return null;
      if (!row || typeof row !== 'object' || row.fingerprint !== found.fingerprint) return 'pending';
      return row.status === 'approved' || row.status === 'rejected' ? row.status : 'pending';
    }

    // Áp một cách xử lý lên bản sao của ngày; trả null nghĩa là bỏ cả ngày
    function applyAction(action?, day?, countsAbsentDay = true) {
      if (action === 'drop') return null;
      // absentExempt: ngày nghỉ không lương này không tính vào ngày nghỉ xét chuyên cần và giờ vượt ngưỡng (bộ máy đọc cờ này)
      if (action === 'unpaid') return countsAbsentDay ? { kind: 'unpaid' } : { kind: 'unpaid', absentExempt: true };
      if (action === 'strip') {
        const stripped = { ...day };
        delete stripped.extraKind;
        delete stripped.extraIn;
        delete stripped.extraOut;
        return stripped;
      }
      throw new Error(`POLICY có cách xử lý không hợp lệ: ${action}`);
    }

    // Khoản chỉ nhận ra được khi có danh sách lễ (OT ngày lễ); các khoản khác itemOf tự nhận ra không cần ctx. Dòng duyệt của OT ngày lễ
    // mang dấu vân tay `holiday_work|…` (dòng lưu từ trước còn mục 'holiday_work', dòng mới mục 'ot').
    const isHolidayRow = (row?) =>
      !!row && (row.item === 'holiday_work' || (row.item === 'ot' && /^holiday_work\|/.test(String(row.fingerprint))));
    // ctx có danh sách lễ dùng được (mảng hoặc Set) thì ctx là nguồn quyết định ngày nào là khoản cần duyệt
    const hasHolidayList = (ctx?) =>
      !!ctx && (Array.isArray(ctx.holidays) || (!!ctx.holidays && typeof ctx.holidays.has === 'function'));
    // Lưới an toàn khi người gọi không đưa được ctx: itemOf không nhận ra OT ngày lễ, nhưng dòng duyệt của máy chủ
    // đã nói ngày đó là khoản này. Tin dòng (chỉ với OT ngày lễ và ngày đúng dạng đi làm có giờ vào, ra);
    // 'approved' chỉ khi status 'approved' và dấu vân tay (nếu dòng có mang) khớp giờ khai hiện tại, còn lại chờ duyệt / bị từ chối.
    // Thiếu dữ liệu không bao giờ tạo ra tiền. Trả null nếu dòng không áp được lên ngày này.
    function itemFromRow(day?, row?) {
      if (!row || typeof row !== 'object' || !isHolidayRow(row)) return null;
      if (!day || typeof day !== 'object' || day.src || day.attendanceConfirmed) return null;
      if ((day.kind || 'work') !== 'work' || !day.in || !day.out) return null;
      const expected = holidayFingerprint(day);
      const same = row.fingerprint === undefined || row.fingerprint === null || row.fingerprint === expected;
      const status = !same
        ? 'pending'
        : row.status === 'approved' || row.status === 'rejected'
          ? row.status
          : 'pending';
      return { found: { item: 'ot', fingerprint: expected, holiday: true }, status };
    }

    // days: lịch đã khai { 'YYYY-MM-DD': ngày }; approvals: { 'YYYY-MM-DD': dòng duyệt } (dòng cần có fingerprint).
    // Trả { payDays, pendingItems }: payDays là bản sao lịch đã xử lý khoản chưa duyệt theo POLICY (không sửa đầu vào),
    // pendingItems liệt kê { date, item, status } của khoản chờ duyệt hoặc bị từ chối, theo ngày tăng dần.
    // ctx (tuỳ chọn): { holidays, staffType } để nhận ra khoản "đi làm ngày lễ". Không có ctx (hoặc ctx thiếu danh sách lễ) thì
    // payView vẫn theo dòng duyệt của máy chủ cho OT ngày lễ (xem itemFromRow); có ctx thì ctx quyết định.
    function payView(days?, approvals?, policy?, ctx?) {
      const rules = policy || POLICY,
        rows = approvals || {},
        payDays: Record<string, any> = {},
        pendingItems: any[] = [];
      for (const date of Object.keys(days || {}).sort()) {
        const day = days[date],
          row = Object.hasOwn(rows, date) ? rows[date] : null;
        let found = itemOf(day, dayCtx(ctx, date)),
          status;
        if (found) status = effectiveStatus(day, row, dayCtx(ctx, date));
        else if (!hasHolidayList(ctx)) {
          const fromRow = itemFromRow(day, row);
          if (fromRow) ({ found, status } = fromRow);
        }
        if (!found) {
          payDays[date] = day && typeof day === 'object' ? { ...day } : day;
          continue;
        }
        if (status === 'approved') {
          payDays[date] = { ...day };
          continue;
        }
        pendingItems.push({ date, item: found.item, status });
        // OT ngày lễ chưa duyệt theo hàng chính sách holiday_work (bỏ cả ngày), không theo hàng ot (chỉ bỏ đoạn làm thêm)
        const ruleItem = found.holiday ? 'holiday_work' : found.item;
        const action = rules[status] && rules[status][ruleItem];
        const counts = (policy && policy.countsAbsent ? policy.countsAbsent : COUNTS_ABSENT)[ruleItem];
        const changed = applyAction(action, day, counts !== false);
        if (changed) payDays[date] = changed;
      }
      return { payDays, pendingItems };
    }

    return {
      ITEMS,
      SCHEDULE,
      POLICY,
      COUNTS_ABSENT,
      ALLOWED_ACTIONS,
      itemOf,
      fingerprint,
      effectiveStatus,
      payView,
      dayCtx
    };
  }

  // Một bộ tham số → một bản mô-đun (nhớ theo đối tượng: bộ tham số của tháng được đóng băng và dùng lại cho cả bảng lương)
  const built = new WeakMap<any, any>();
  function create(params?) {
    if (!params || typeof params !== 'object')
      throw new TypeError('create(params): cần bộ tham số phẳng (PayrollParams.DEFAULTS)');
    if (!built.has(params)) built.set(params, Object.freeze({ ...build(params), FALLBACK, create }));
    return built.get(params);
  }
  // Mặc định: PayrollParams.DEFAULTS (hàm trần của mô-đun = create(mặc định)); vắng payroll-params.js thì FALLBACK
  return create(PayrollParams && PayrollParams.DEFAULTS ? PayrollParams.DEFAULTS : FALLBACK);
});
