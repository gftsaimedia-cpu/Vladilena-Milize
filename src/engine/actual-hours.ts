(function (root: any, factory: any) {
  // payroll-params.js phải nạp trước trang (trình duyệt) để mô-đun lấy mặc định từ DEFAULTS; vắng thì dùng FALLBACK.
  const params = typeof module === 'object' && module.exports ? require('./payroll-params') : root.PayrollParams;
  const schedule = typeof module === 'object' && module.exports ? require('./work-schedule') : root.WorkSchedule; // lịch làm việc: một nguồn
  // Bảng đổi mã ca mới (Normal1…) ↔ khoá giờ ca cũ (n1…): một nguồn ở src/engine/punch.ts (trình duyệt nạp punch.js trước tệp này)
  const punch = typeof module === 'object' && module.exports ? require('./punch') : root.PunchRules;
  const api = factory(params, schedule, punch);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ActualHours = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (PayrollParams, WorkSchedule, PunchRules) {
  'use strict';
  // Giờ công của ngày đi làm tính từ Check-in/out thực tế. Module thuần: không I/O, không đồng hồ ("bây giờ" truyền vào qua ctx.asOf).
  // apply() nhận lịch đã khai (sau ApprovalView.payView: khoản chưa duyệt đã bị bỏ) và các lượt Check-in/out, trả bản sao lịch
  // đã thay giờ ca chính bằng ca đã gán cùng số phút cắt; calcDay/calcMonth chạy tiếp trên bản sao đó. Không bao giờ ghi ngược vào lịch.

  // Mọi con số và mọi ô chính sách đến từ bộ tham số phẳng `params` (khoá registry), qua create(params): bộ máy dùng chung
  // (src/engine/payroll-engine.ts) truyền tham số của tháng đang tính. Gọi hàm trần của mô-đun = create(mặc định), mặc định là
  // PayrollParams.DEFAULTS. Ba hằng số: 1 công = 8 giờ làm việc; đến 15 phút không trừ; quá 15 phút trừ theo bậc 30 phút.
  // Bảng POLICY nằm ở registry: attendance.<ô>Rule và holiday.makeupRate; muốn đổi cách tính chỉ
  // đổi giá trị khoá đó (và ALLOWED bên dưới).
  //
  // FALLBACK: bản chép của đúng các khoá mô-đun này đọc, để trang chưa nạp payroll-params.js (và các test nạp mô-đun
  // trong `vm` không có `require`) vẫn chạy. Phải bằng PayrollParams.DEFAULTS (scripts/params/check-fallbacks.ts kiểm).
  const FALLBACK = Object.freeze({
    'attendance.graceMin': 15,
    'attendance.stepMin': 30,
    'time.workHoursPerDay': 8,
    'time.breakAfterWorkHours': 4,
    'time.breakHours': 1,
    'unit.minutesPerHour': 60,
    'unit.minutesPerDay': 1440,
    'unit.msPerDay': 86400000,
    'unit.vnUtcOffsetMin': 420,
    'control.reasonMaxLength': 300,
    'holiday.makeupRate': 3,
    'attendance.lateEarlyRule': 'separate',
    'attendance.gapRule': 'step',
    'attendance.beyondShiftRule': 'cap8',
    'attendance.extraWindowRule': 'continuous',
    'attendance.extraSourceRule': 'calendar',
    'attendance.futureDaysRule': 'none',
    'attendance.declaredLeaveRule': 'declared',
    'attendance.missingOneSideRule': 'pending',
    'attendance.missingAllRule': 'absent',
    'attendance.offScheduleRule': 'unpaid',
    'attendance.undeclaredPunchRule': 'report',
    'attendance.cutRounding': 'halfUpStep',
    'shift.preset.n1.in': '08:00',
    'shift.preset.n1.out': '17:00',
    'shift.preset.n2.in': '10:00',
    'shift.preset.n2.out': '19:00',
    'shift.preset.f1.in': '06:00',
    'shift.preset.f1.out': '15:00',
    'shift.preset.f2.in': '13:00',
    'shift.preset.f2.out': '22:00',
    'shift.preset.g1.in': '21:00',
    'shift.preset.g1.out': '06:00',
    'shift.preset.g2.in': '22:00',
    'shift.preset.g2.out': '07:00'
  });
  // Tên ô chính sách của mã → khoá registry (ô nào cũng là chữ, riêng makeupHolidayRate là số)
  const POLICY_KEYS = Object.freeze({
    lateEarly: 'attendance.lateEarlyRule', // trễ và về sớm cùng ngày xét riêng từng lần ('combined' = cộng phút rồi mới làm tròn)
    gap: 'attendance.gapRule', // khoảng trống giữa hai lượt trong ca dùng cùng luật 15/30 phút ('exact' = trừ đúng phút, 'ignore' = bỏ qua)
    beyondShift: 'attendance.beyondShiftRule', // có mặt quá ca mà không có đề xuất được duyệt vẫn chỉ trả 8 giờ
    extraWindow: 'attendance.extraWindowRule', // OT / làm bù đã duyệt chỉ trả phần có mặt liền mạch với biên ca
    extraSource: 'attendance.extraSourceRule', // chỉ OT của ngày trên lịch và đã duyệt mới ra tiền; "Duyệt OT" của Check-in/out ghi khung OT vào ngày đó rồi duyệt khoản
    futureDays: 'attendance.futureDaysRule', // không dự đoán tiền cho ngày chưa tới
    declaredLeave: 'attendance.declaredLeaveRule', // khai nghỉ mà vẫn chấm công thì giữ loại ngày đã khai và báo Admin
    missingOneSide: 'attendance.missingOneSideRule', // thiếu một đầu (Quên check-in / Quên check-out) chờ Admin xử lý, báo Admin, KHÔNG tính là ngày nghỉ
    missingAll: 'attendance.missingAllRule', // ngày công đếm theo ngày có Check-in/Check-out hợp lệ; ngày khai "Đi làm" mà không có chấm công nào là nghỉ không phép ('absent')
    offSchedule: 'attendance.offScheduleRule', // chấm công ngoài lịch (CN, Thứ 7 của TTS, ngày lễ) mà không có đề xuất OT / làm bù được duyệt thì 0 giờ, 0 đồng ('declared' = coi như ngày khai)
    undeclaredPunch: 'attendance.undeclaredPunchRule', // ngày không khai loại ngày mà có chấm công: chưa tính tiền, chỉ báo
    makeupHolidayRate: 'holiday.makeupRate', // làm bù rơi vào ngày lễ trả ×3; nhập số từ 1 đến 10, dưới ×3 sàn luật chặn khi lưu
    cutRounding: 'attendance.cutRounding' // trừ trễ, sớm: 'halfUpStep' (nửa lên theo bậc, mặc định), 'ceilStep' (lên theo bậc), 'exact' (đúng số phút)
  });
  // Giá trị hợp lệ của từng ô (test kiểm mọi ô của POLICY nằm trong tập này); ô số thì là hàm kiểm (makeupHolidayRate: 1–10, bước 0,5 do registry chặn khi lưu)
  const ALLOWED = Object.freeze({
    lateEarly: Object.freeze(['separate', 'combined']),
    gap: Object.freeze(['step', 'exact', 'ignore']),
    beyondShift: Object.freeze(['cap8']),
    extraWindow: Object.freeze(['continuous']),
    extraSource: Object.freeze(['calendar']),
    futureDays: Object.freeze(['none']),
    declaredLeave: Object.freeze(['declared']),
    missingOneSide: Object.freeze(['pending']),
    missingAll: Object.freeze(['declared', 'absent', 'pending']),
    offSchedule: Object.freeze(['unpaid', 'declared']),
    undeclaredPunch: Object.freeze(['report']),
    makeupHolidayRate: (v?) => Number.isFinite(v) && v >= 1 && v <= 10,
    cutRounding: Object.freeze(['halfUpStep', 'ceilStep', 'exact'])
  });

  const NOTE = Object.freeze({
    offSchedule: 'Đi làm ngoài lịch, chưa có đề xuất được duyệt: không tính tiền',
    forgotIn: 'Quên check-in: chờ Admin xử lý',
    forgotOut: 'Quên check-out: chờ Admin xử lý',
    absent: 'Không có Check-in/out: tính là ngày nghỉ. Có Check-in/out hoặc Admin khai thay giờ vào/ra thì tính công',
    declaredNoPunch: 'Không có chấm công: tính theo lịch đã khai',
    review: 'Lượt chấm công chờ Admin đối soát',
    offShift: 'Chấm công không khớp ca đã gán: chờ Admin xử lý',
    declaredWins: 'Có chấm công nhưng đã khai nghỉ: giữ loại ngày đã khai',
    undeclared: 'Có chấm công nhưng chưa khai loại ngày: chưa tính tiền'
  });
  // Dấu của lượt do Admin khai thay giờ vào / ra (phải khớp ORIGIN của src/domain/attendance/admin-presence.ts)
  const ADMIN_ORIGIN = 'sheet.onBehalf';

  // Bộ tham số phẳng → mọi con số và ô chính sách của mô-đun. Khoá vắng là lỗi (không đoán giá trị).
  function build(P?) {
    const need = (key?) => {
      if (!Object.hasOwn(P, key))
        throw Object.assign(new Error(`Thiếu tham số ${key}`), { code: 'PARAM_MISSING', key });
      return P[key];
    };
    const MIN_H = need('unit.minutesPerHour');
    const MIN_D = need('unit.minutesPerDay');
    const MS_MIN = need('unit.msPerDay') / MIN_D; // mili giây trong một phút
    const SHOWN_MAX = need('control.reasonMaxLength'); // giá trị lạ được cắt tới độ dài này khi đưa vào thông báo lỗi
    const VN_OFFSET_MIN = need('unit.vnUtcOffsetMin'); // UTC+7, phải trùng src/engine/punch.ts (Việt Nam không có giờ mùa hè)
    const BREAK_EVERY = need('time.breakAfterWorkHours') * MIN_H; // làm liền bấy nhiêu phút thì nghỉ
    const CYCLE = BREAK_EVERY + need('time.breakHours') * MIN_H; // một vòng: giờ làm + giờ nghỉ
    // Ba hằng số (SHIFT_WORK_MIN dẫn xuất = giờ mỗi công × phút mỗi giờ)
    const RULE = Object.freeze({
      SHIFT_WORK_MIN: need('time.workHoursPerDay') * MIN_H,
      GRACE_MIN: need('attendance.graceMin'),
      STEP_MIN: need('attendance.stepMin')
    });
    const POLICY: Record<string, any> = {};
    for (const [name, key] of Object.entries(POLICY_KEYS)) {
      POLICY[name] = need(key);
      const ok =
        typeof ALLOWED[name] === 'function' ? ALLOWED[name](POLICY[name]) : ALLOWED[name].includes(POLICY[name]);
      if (!ok)
        throw Object.assign(
          new Error(`Tham số ${key} có giá trị không hợp lệ: ${String(POLICY[name]).slice(0, SHOWN_MAX)}`),
          {
            code: 'PARAM_INVALID_VALUE',
            key
          }
        );
    }
    Object.freeze(POLICY);
    // Ca cố định: phải trùng SHIFT trong src/engine/punch.ts (cả hai đọc shift.preset.<mã>.in / .out). Dùng cho ngày chưa khai để biết ca đã kết thúc chưa.
    const presets: Record<string, any> = {};
    for (const key of Object.keys(P)) {
      const m = /^shift\.preset\.(?<code>[a-z0-9]+)\.in$/.exec(key);
      if (m) presets[m.groups!.code] = Object.freeze([need(key), need(`shift.preset.${m.groups!.code}.out`)]);
    }
    if (PunchRules) PunchRules.addAliases(presets, PunchRules.shiftAliases(P));
    const SHIFT_TIMES = Object.freeze(presets);

    // ---------- phút và ngày ----------
    const toMin = (t?) => {
      if (typeof t !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) return null;
      return Number(t.slice(0, 2)) * MIN_H + Number(t.slice(3));
    };
    const spanOf = (a?, b?) => (((b - a) % MIN_D) + MIN_D) % MIN_D || MIN_D; // a → b qua nửa đêm; trùng nhau = 24 giờ
    const epochMin = (iso?, up?) => {
      const ms = typeof iso === 'string' ? Date.parse(iso) : NaN;
      return Number.isFinite(ms) ? (up ? Math.ceil : Math.floor)(ms / MS_MIN) : NaN;
    };
    const vnDateOf = (epoch?) => new Date((epoch + VN_OFFSET_MIN) * MS_MIN).toISOString().slice(0, 10);
    const vnClock = (epoch?) => new Date((epoch + VN_OFFSET_MIN) * MS_MIN).toISOString().slice(11, 16);
    const dayStart = (date?) => Date.parse(date + 'T00:00:00Z') / MS_MIN - VN_OFFSET_MIN; // 00:00 giờ VN của ngày date, phút epoch
    const dowOf = (date?) => new Date(date + 'T00:00:00Z').getUTCDay(); // 0 = Chủ nhật
    const validDate = (d?) => {
      if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
      const t = Date.parse(d + 'T00:00:00Z');
      return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === d;
    };
    const isWorkOffset = (o?) => o < BREAK_EVERY || o >= CYCLE; // 4 giờ làm, 1 giờ nghỉ MỘT lần mỗi ca, rồi làm tiếp; phải trùng breakSlots và splitMainWork

    function cutMin(missed?) {
      const m = Math.floor(Number(missed));
      if (!(m > RULE.GRACE_MIN)) return 0; // chỉ trừ khi số phút thiếu lớn hơn ngưỡng miễn
      if (POLICY.cutRounding === 'exact') return Math.min(RULE.SHIFT_WORK_MIN, m); // đúng số phút đã trễ (cả phần miễn)
      if (POLICY.cutRounding === 'ceilStep')
        return Math.min(RULE.SHIFT_WORK_MIN, RULE.STEP_MIN * Math.ceil(m / RULE.STEP_MIN)); // 16–30 → 30, 31–60 → 60
      // làm tròn nửa lên theo bậc: 16–44 → 30, 45–74 → 60, 75–104 → 90 ...; tối đa 8 giờ một ngày
      return Math.min(RULE.SHIFT_WORK_MIN, RULE.STEP_MIN * Math.floor((2 * m + RULE.STEP_MIN) / (2 * RULE.STEP_MIN)));
    }

    function clone(value?) {
      if (Array.isArray(value)) return value.map(clone);
      if (value && typeof value === 'object') {
        const out: Record<string, any> = {};
        for (const key of Object.keys(value)) out[key] = clone(value[key]);
        return out;
      }
      return value;
    }

    // Khoảng có mặt [a, b) theo phút nguyên. Cho ca chính: vào lấy sàn, ra lấy trần (nghiêng về nhân sự khi trừ);
    // cho đoạn làm thêm ngược lại (không trả quá phút có mặt). Gộp khoảng chồng hoặc sát nhau.
    function presenceRuns(list?, forExtra?) {
      const runs: any[] = [];
      for (const s of list) {
        const a = epochMin(s.entry.presIn, forExtra),
          b = epochMin(s.entry.presOut, !forExtra);
        if (Number.isFinite(a) && Number.isFinite(b) && b > a) runs.push([a, b]);
      }
      runs.sort((x: any, y: any) => x[0] - y[0]);
      const merged: any[] = [];
      for (const run of runs) {
        const last = merged[merged.length - 1];
        if (last && run[0] <= last[1]) last[1] = Math.max(last[1], run[1]);
        else merged.push([run[0], run[1]]);
      }
      return merged;
    }
    const coversMinute = (runs?, t?) => runs.some(r => r[0] <= t && t < r[1]);

    // Phân tích một ca theo các khoảng có mặt: chỉ đếm "phút làm việc" (giờ nghỉ không bao giờ là trễ, sớm hay khoảng trống)
    function analyseShift(plan?, runs?) {
      const start = epochMin(plan.startIso),
        end = epochMin(plan.endIso);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > MIN_D) return null;
      const len = end - start;
      let first = -1,
        last = -1,
        workTotal = 0,
        coveredWork = 0;
      for (let o = 0; o < len; o++) {
        if (!isWorkOffset(o)) continue;
        workTotal++;
        if (coversMinute(runs, start + o)) {
          coveredWork++;
          if (first < 0) first = o;
          last = o;
        }
      }
      if (first < 0) return { start, end, len, workTotal, coveredWork: 0 };
      let missedStart = 0,
        missedEnd = 0,
        gapMin = 0;
      for (let o = 0; o < len; o++) {
        if (!isWorkOffset(o)) continue;
        if (o < first) missedStart++;
        else if (o > last) missedEnd++;
        else if (!coversMinute(runs, start + o)) gapMin++;
      }
      const breakCovered = len < CYCLE || runs.some(r => r[0] <= start + BREAK_EVERY && r[1] >= start + CYCLE);
      return { start, end, len, workTotal, coveredWork, missedStart, missedEnd, gapMin, breakCovered };
    }

    // Số phút trừ của trễ, sớm và khoảng trống theo POLICY
    function cutsOf(shift?) {
      const { missedStart, missedEnd, gapMin } = shift;
      let cutStartMin, cutEndMin;
      if (POLICY.lateEarly === 'combined') {
        const total = cutMin(missedStart + missedEnd);
        cutStartMin = Math.min(total, missedStart);
        cutEndMin = total - cutStartMin;
      } else {
        cutStartMin = cutMin(missedStart);
        cutEndMin = cutMin(missedEnd);
      }
      const gapCutMin = POLICY.gap === 'exact' ? gapMin : POLICY.gap === 'ignore' ? 0 : cutMin(gapMin);
      return { cutStartMin, cutEndMin, gapCutMin };
    }

    // Cắt đoạn OT / làm bù đã duyệt theo khoảng có mặt liền mạch với biên ca. Trả { extraKind, extraIn, extraOut }.
    function clipExtra(declared?, plan?, shift?, extraRuns?) {
      const none = { extraKind: '', extraIn: '', extraOut: '' };
      const kind = declared.extraKind || (declared.extraOut ? 'makeup' : '');
      if (kind !== 'ot' && kind !== 'makeup') return none;
      let post: any = null,
        pre: any = null;
      const eo = toMin(declared.extraOut),
        ei = toMin(declared.extraIn),
        po = toMin(plan.out);
      // Số giờ được duyệt tính theo ca nhân sự đã khai (khoản duyệt gắn với đoạn khai), không theo ca đã gán: ca gán lệch ca khai
      // thì không được trả nhiều hơn số giờ đã duyệt.
      const declaredOut = toMin(declared.out),
        declaredIn = toMin(declared.in);
      const postCap =
        declaredOut !== null && eo !== null && declared.extraOut !== declared.out ? spanOf(declaredOut, eo) : Infinity;
      const preCap =
        declaredIn !== null && ei !== null && declared.extraIn !== declared.in ? spanOf(ei, declaredIn) : Infinity;
      if (eo !== null && po !== null && declared.extraOut !== plan.out && postCap !== Infinity) {
        const wanted = shift.end + Math.min(spanOf(po, eo), postCap);
        const run = extraRuns.find(r => r[0] <= shift.end - 1 && r[1] > shift.end);
        const until = run ? Math.min(wanted, run[1]) : 0;
        if (until > shift.end) post = until;
      }
      const pi = toMin(plan.in);
      if (ei !== null && pi !== null && declared.extraIn !== plan.in && preCap !== Infinity) {
        const wanted = shift.start - Math.min(spanOf(ei, pi), preCap);
        const run = extraRuns.find(r => r[0] <= shift.start - 1 && r[1] > shift.start);
        const from = run ? Math.max(wanted, run[0]) : Infinity;
        if (from < shift.start) pre = from;
      }
      if (post === null && pre === null) return none;
      return {
        extraKind: kind,
        extraIn: pre === null ? '' : vnClock(pre),
        extraOut: post === null ? '' : vnClock(post)
      };
    }

    // OT ngày lễ: khung giờ trả là khung giờ đã khai (giờ vào – ra của ngày), không phải ca được gán. Trả bản sao của ca với giờ và mốc ISO
    // của khung đã khai (mã ca giữ nguyên để tính phụ cấp ca); phút có mặt ngoài khung không được trả, như OT thường.
    function holidayWindow(plan?, date?, declared?) {
      const a = toMin(declared.in),
        b = toMin(declared.out);
      if (a === null || b === null) return plan;
      const start = dayStart(date) + a;
      const iso = (t?) => new Date(t * MS_MIN).toISOString();
      return { ...plan, in: declared.in, out: declared.out, startIso: iso(start), endIso: iso(start + spanOf(a, b)) };
    }

    const LOCKED_FIELDS = [
      'src',
      'attendanceConfirmed',
      'attendanceApproved',
      'presIn',
      'presOut',
      'plannedShift',
      'otReview',
      'reason',
      'cutStartMin',
      'cutEndMin',
      'breakPayOff',
      'makeupHolRate',
      'extraOnly'
    ];
    function declaredKindOf(day?) {
      if (!day || typeof day !== 'object') return '';
      return day.kind || (day.in && day.out ? 'work' : '');
    }
    // Ngày còn mang khoản OT / làm bù theo giờ: sau ApprovalView.payView nghĩa là khoản đã được duyệt
    function hasApprovedItem(day?) {
      const kind = day.extraKind || (day.extraOut ? 'makeup' : '');
      if (kind !== 'ot' && kind !== 'makeup') return false;
      return !!((day.extraOut && day.extraOut !== day.out) || (day.extraIn && day.extraIn !== day.in));
    }

    // Gom lượt theo ngày công (ngày bắt đầu ca); lượt không có ca đã gán xếp theo ngày lưu
    function groupByDate(sessions?) {
      const byDate = new Map<any, any>();
      for (const s of Array.isArray(sessions) ? sessions : []) {
        if (!s || !s.entry || typeof s.entry !== 'object') continue;
        const date = (s.entry.plannedShift && s.entry.plannedShift.date) || s.date;
        if (!validDate(date)) continue;
        if (!byDate.has(date)) byDate.set(date, []);
        byDate.get(date).push(s);
      }
      return byDate;
    }
    // Đọc các lượt của một ngày: lượt dùng được, và các tình trạng chặn tính tiền
    function inspectDay(list?) {
      const info = {
        punched: false,
        open: false,
        forgotIn: false,
        forgotOut: false,
        review: false,
        usable: [] as any[]
      };
      for (const s of list) {
        const e = s.entry,
          a = epochMin(e.presIn),
          b = epochMin(e.presOut),
          hasPunch = Number.isFinite(a) || Number.isFinite(b);
        if (!hasPunch) continue; // session metadata without either punch is not attendance
        info.punched = true;
        if (s.state === 'open') {
          info.open = true;
          continue;
        }
        if (e.reason === 'needs-review' || e.reason === 'legacy-review') {
          info.review = true;
          continue;
        }
        if (Number.isFinite(a) && !Number.isFinite(b)) info.forgotOut = true;
        else if (!Number.isFinite(a) && Number.isFinite(b)) info.forgotIn = true;
        else if (Number.isFinite(a) && Number.isFinite(b) && b > a && e.plannedShift && e.plannedShift.startIso)
          info.usable.push(s);
      }
      // Lượt Admin khai thay giờ vào / ra (src/domain/attendance/admin-presence.ts): lượt chấm thật dùng được thắng nó (ngày tính một lần
      // theo giờ thật); không có lượt thật dùng được thì nó thắng các lượt bấm bị chặn cùng ngày (quên Check-in/out, chờ đối soát, Check-out
      // muộn chờ duyệt). Lượt đang mở (đang trong ca) giữ nguyên.
      const real = info.usable.filter(s => s.entry.origin !== ADMIN_ORIGIN);
      if (real.length) info.usable = real;
      else if (info.usable.length) info.forgotIn = info.forgotOut = info.review = false;
      return info;
    }
    // Nhiều lượt cùng ngày nhưng khác ca đã gán (đổi ca giữa chừng): lấy ca có nhiều phút làm việc được phủ nhất
    function bestShift(usable?) {
      const groups = new Map<any, any>();
      for (const s of usable) {
        const key = s.entry.plannedShift.code + '|' + s.entry.plannedShift.startIso;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(s);
      }
      let best: any = null;
      for (const list of groups.values()) {
        const plan = list[0].entry.plannedShift;
        const shift = analyseShift(plan, presenceRuns(list, false));
        if (!shift) continue;
        if (!best || shift.coveredWork > best.shift.coveredWork) best = { plan, shift, list };
      }
      return best;
    }
    // Giờ bấm thật của một nhóm lượt (giờ Việt Nam HH:MM): giờ vào sớm nhất và giờ ra muộn nhất trong các lượt; vắng bên nào thì bên đó null
    function punchTimes(list?) {
      const clock = (field?, pick?) => {
        const at = list.map(s => epochMin(s.entry[field])).filter(Number.isFinite);
        return at.length ? vnClock(pick(...at)) : null;
      };
      return { punchIn: clock('presIn', Math.min), punchOut: clock('presOut', Math.max) };
    }
    // Các lượt đã dùng để tính ngày: nhóm lượt của ca được chọn (bestShift); ngày chưa có lượt dùng được thì mọi lượt của ngày
    const usedOf = (list?) => {
      const best = bestShift(inspectDay(list).usable);
      return best ? best.list : list;
    };
    // Giờ bấm thật từng ngày công của danh sách lượt chấm công: { 'YYYY-MM-DD': { punchIn, punchOut } }
    function punchTimesOf(sessions?) {
      const out: Record<string, any> = {};
      for (const [date, list] of groupByDate(sessions)) out[date] = punchTimes(usedOf(list));
      return out;
    }

    // days: lịch đã khai (sau payView). sessions: [{ state: 'closed' | 'open', entry }] như attendanceSessions.
    // ctx: { asOf: ISO, staff, holidays, month: 'YYYY-MM' (tuỳ chọn) }.
    //   staff: { type, sched?, shiftCode?, startDate? }. Có ctx.month thì ngày trong lịch mà chưa có bản ghi được coi là ngày đi làm.
    // Trả { days, report, missing, absent }:
    //   days: bản sao lịch, ngày đi làm đã thay bằng ngày hiệu lực
    //   report[ngày]: { state, note, ... } với state là 'ok' | 'open' | 'not-yet' | 'forgot-in' | 'forgot-out' | 'review' |
    //     'off-shift' | 'absent' | 'off-schedule' | 'declared-wins' | 'undeclared-punch' | 'no-checkin'
    //   missing: ngày chờ Admin xử lý (quên check-in / check-out, chờ đối soát, không khớp ca); Admin cần được báo
    //   absent: ngày khai đi làm mà không có chấm công nào, đã tính là nghỉ
    function apply(days?, sessions?, ctx?) {
      const input = days && typeof days === 'object' ? days : {};
      const context = ctx || {};
      const out: Record<string, any> = {};
      const report: Record<string, any> = {};
      const missing: any[] = [];
      const absent: any[] = [];
      // Ngày không được thay bằng ngày hiệu lực bên dưới giữ lịch đã khai
      for (const [date, day] of Object.entries(input)) out[date] = clone(day);

      const asOf = epochMin(context.asOf);
      const today = Number.isFinite(asOf) ? vnDateOf(asOf) : '';
      const holidays = new Set<any>(Array.from(context.holidays || []));
      const ws = WorkSchedule.create(P); // lịch giải THEO TỪNG NGÀY của người (phiên của nhiều tháng đi qua đây)
      const inSchedule = (date?) => ws.isWorkDay(ws.scheduleFor(context.staff, date), date);
      // Lượt Admin khai trước chưa tới giờ ra chỉ là lịch (máy chủ đã giấu, lọc lại ở đây cho chắc khi asOf khác lúc đọc)
      const scheduled = (s?) => s && s.entry && s.entry.origin === ADMIN_ORIGIN && epochMin(s.entry.presOut) > asOf;
      const byDate = groupByDate(Array.isArray(sessions) ? sessions.filter(s => !scheduled(s)) : []);

      const setPending = (date?, reason?, state?, note?, waitsAdmin?) => {
        out[date] = { kind: 'pending', reason };
        report[date] = { state, note, notifyAdmin: !!waitsAdmin && (state === 'forgot-in' || state === 'forgot-out') };
        if (waitsAdmin) missing.push(date);
      };
      // Tình trạng chặn tính tiền chung cho ngày đi làm: trả true nếu đã xử lý xong ngày
      const blocked = (date?, info?) => {
        if (info.open) {
          setPending(date, 'open', 'open', 'Đang trong ca', false);
          return true;
        }
        if (info.review) {
          setPending(date, 'review', 'review', NOTE.review, true);
          return true;
        }
        if (info.forgotIn) {
          setPending(date, 'forgot-in', 'forgot-in', NOTE.forgotIn, true);
          return true;
        }
        if (info.forgotOut) {
          setPending(date, 'forgot-out', 'forgot-out', NOTE.forgotOut, true);
          return true;
        }
        return false;
      };

      // Ngày trong lịch làm việc (ca cố định) của tháng ctx.month mà chưa có bản ghi nào: mặc định là ngày đi làm,
      // từ ngày bắt đầu làm việc, đến hôm nay, không phải ngày lễ (nhân sự không phải khai "Đi làm").
      const month =
        typeof context.month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(context.month) ? context.month : '';
      const startDate = context.staff && validDate(context.staff.startDate) ? context.staff.startDate : '';
      // Sau ngày nghỉ việc (staff.resignedOn) như trước ngày bắt đầu: không mặc định đi làm, không vắng; chính ngày nghỉ việc vẫn là ngày làm việc
      const resignedOn = context.staff && validDate(context.staff.resignedOn) ? context.staff.resignedOn : '';
      const defaulted = new Map<any, any>();
      if (month && today) {
        for (let day = 1; day <= 31; day++) {
          const date = `${month}-${String(day).padStart(2, '0')}`;
          if (!validDate(date) || date > today || (startDate && date < startDate)) continue;
          if (resignedOn && date > resignedOn) continue;
          if (!inSchedule(date) || holidays.has(date) || declaredKindOf(input[date])) continue;
          if (input[date] && typeof input[date] === 'object' && Object.keys(input[date]).length) continue;
          const times = SHIFT_TIMES[context.staff && context.staff.shiftCode];
          defaulted.set(date, times ? { kind: 'work', in: times[0], out: times[1] } : { kind: 'work' });
        }
      }

      const dates = new Set<any>([...Object.keys(input), ...byDate.keys(), ...defaulted.keys()]);
      for (const date of [...dates].sort()) {
        if (resignedOn && date > resignedOn) continue; // sau ngày nghỉ việc: bộ máy bỏ, không báo vắng
        const declared = defaulted.has(date) ? defaulted.get(date) : input[date];
        const kind = declaredKindOf(declared);
        // Ngày lễ chỉ là OT ngày lễ khi khai có giờ vào – ra (như calcDay); "Đi làm" không giờ trên ngày lễ là nghỉ lễ, không bao giờ vắng
        const isWork = kind === 'work' && !(holidays.has(date) && !(declared.in && declared.out));
        // Ngày khai đi làm vẫn còn trong lịch sau ApprovalView.payView = đã được duyệt (hoặc dữ liệu cũ): ngày lễ khai đi làm trả theo giờ
        // thực ×3, không coi là ngoài lịch. Ngày lễ không khai mà có chấm công vẫn là ngoài lịch.
        const offDay = !inSchedule(date);
        const offSchedule = isWork ? offDay : offDay || holidays.has(date);
        const info = inspectDay(byDate.get(date) || []);

        if (!declared || typeof declared !== 'object' || !kind) {
          // Ngày không khai loại ngày
          if (!info.punched) continue;
          if (offSchedule && POLICY.offSchedule === 'unpaid') {
            report[date] = { state: 'off-schedule', note: NOTE.offSchedule, paid: false };
          } else if ((info.forgotIn || info.forgotOut) && !info.usable.length && !info.open) {
            blocked(date, info);
          } else {
            report[date] = { state: 'undeclared-punch', note: NOTE.undeclared };
          }
          continue;
        }
        if (!isWork) {
          // Khai nghỉ (phép, không lương, iSAT, nghỉ lễ, loại 'makeup' cũ ...) mà vẫn chấm công: loại ngày đã khai thắng
          if (info.punched) report[date] = { state: 'declared-wins', note: NOTE.declaredWins, declared: kind };
          continue;
        }

        const approvedItem = hasApprovedItem(declared);
        if (offSchedule && POLICY.offSchedule === 'unpaid' && !approvedItem) {
          // Ngoài lịch mà không có đề xuất được duyệt: 0 giờ, 0 đồng, không tạo công bù, không là lỗi
          delete out[date];
          report[date] = { state: 'off-schedule', note: NOTE.offSchedule, paid: false, punched: info.punched };
          continue;
        }
        if (today && date > today) {
          // ngày chưa tới đã khai trên lịch, chưa có chấm công: tính theo lịch đã khai (ước tính cả tháng)
          if (POLICY.missingAll === 'declared' && !info.punched) {
            report[date] = { state: 'declared-wins', note: NOTE.declaredNoPunch, paid: true };
            continue;
          }
          setPending(date, 'not-yet', 'not-yet', 'Chưa tới ngày', false);
          continue;
        }
        if (blocked(date, info)) continue;
        if (!info.usable.length) {
          if (info.punched) {
            setPending(date, 'off-shift', 'off-shift', NOTE.offShift, true);
            continue;
          }
          // Không có chấm công nào. Phương án 'declared': ngày đã khai thì tính theo lịch đã khai; ngày chỉ có
          // trong lịch làm việc thì không tính. Mặc định là 'absent' (nhánh dưới): nghỉ không phép.
          if (POLICY.missingAll === 'declared') {
            if (defaulted.has(date)) delete out[date];
            else report[date] = { state: 'declared-wins', note: NOTE.declaredNoPunch, paid: true };
            continue;
          }
          // Ca chưa kết thúc thì chưa kết luận (hết ca và đoạn làm thêm sau ca đã khai)
          const a = toMin(declared.in),
            b = toMin(declared.extraOut || declared.out);
          const shiftEnd = dayStart(date) + ((a !== null && b !== null ? a + spanOf(a, b) : 0) || MIN_D);
          if (Number.isFinite(asOf) && asOf < shiftEnd) {
            setPending(date, 'not-yet', 'not-yet', 'Ca chưa kết thúc', false);
          } else if (offSchedule) {
            // Ngày ngoài lịch có đoạn làm thêm đã duyệt mà không đến: không có công, không phải vắng
            delete out[date];
            report[date] = {
              state: 'no-checkin',
              note: 'Đã duyệt làm bù nhưng không có chấm công: không tính tiền',
              paid: false
            };
          } else if (POLICY.missingAll === 'absent') {
            out[date] = { kind: 'noshow' };
            report[date] = { state: 'absent', note: NOTE.absent };
            absent.push(date);
          } else {
            setPending(date, 'forgot-in', 'forgot-in', NOTE.forgotIn, true);
          }
          continue;
        }

        const best = bestShift(info.usable);
        if (!best || !best.shift.coveredWork || toMin(best.plan.in) === null || toMin(best.plan.out) === null) {
          setPending(date, 'off-shift', 'off-shift', NOTE.offShift, true);
          continue;
        }
        // Ngày lễ khai đi làm có giờ là OT ngày lễ: trả đúng khung giờ đã khai ∩ giờ có mặt liền mạch; ngày thường trả theo ca được gán
        const holidayOt = holidays.has(date) && !!declared.in && !!declared.out;
        const plan = holidayOt ? holidayWindow(best.plan, date, declared) : best.plan;
        const shift = holidayOt ? analyseShift(plan, presenceRuns(best.list, false)) : best.shift;
        if (!shift || !shift.coveredWork) {
          setPending(date, 'off-shift', 'off-shift', NOTE.offShift, true);
          continue;
        }
        const workCap = Math.min(RULE.SHIFT_WORK_MIN, shift.workTotal);
        const { cutStartMin, cutEndMin, gapCutMin } = cutsOf(shift);
        if (workCap - cutStartMin - cutEndMin - gapCutMin <= 0) {
          setPending(date, 'off-shift', 'off-shift', NOTE.offShift, true);
          continue;
        }
        const extraRuns = presenceRuns(best.list, true);
        const extra = clipExtra(declared, plan, shift, extraRuns);
        const effective = clone(declared);
        for (const key of LOCKED_FIELDS) delete effective[key];
        Object.assign(effective, extra, {
          kind: declared.kind,
          in: plan.in,
          out: plan.out,
          preset: plan.code,
          breakMin: gapCutMin,
          cutStartMin,
          cutEndMin
        });
        if (!shift.breakCovered) effective.breakPayOff = true;
        if (extra.extraKind === 'makeup' && POLICY.makeupHolidayRate > 1)
          effective.makeupHolRate = POLICY.makeupHolidayRate;
        let state = 'ok';
        if (offSchedule && POLICY.offSchedule === 'unpaid') {
          // Ngoài lịch có khoản OT / làm bù được duyệt: ca chính không tính, chỉ trả đoạn làm thêm đã duyệt trong phạm vi có mặt
          if (!extra.extraKind) {
            delete out[date];
            report[date] = { state: 'off-schedule', note: NOTE.offSchedule, paid: false, punched: true };
            continue;
          }
          effective.cutStartMin = RULE.SHIFT_WORK_MIN;
          effective.cutEndMin = 0;
          effective.breakMin = 0;
          // Bộ máy: không ngày công, không giờ thiếu, không trừ tiền ngày cho ca chính không tính (src/engine/payroll-engine.ts → calcDay, calcMonth)
          effective.extraOnly = true;
          state = 'ok';
        }
        out[date] = effective;
        report[date] = {
          state,
          shiftCode: plan.code,
          late: shift.missedStart,
          early: shift.missedEnd,
          gapMin: shift.gapMin,
          cutStartMin: effective.cutStartMin,
          cutEndMin: effective.cutEndMin,
          gapCutMin,
          paidMin: Math.max(0, workCap - effective.cutStartMin - effective.cutEndMin - effective.breakMin),
          breakPayOff: !!effective.breakPayOff,
          extra: {
            declaredKind: declared.extraKind || '',
            declaredOut: declared.extraOut || '',
            keptOut: extra.extraOut,
            keptIn: extra.extraIn
          }
        };
      }
      // Ngày mặc định chưa tới giờ kết luận (hôm nay, ca chưa kết thúc): không đưa vào kết quả
      for (const date of defaulted.keys()) {
        if (report[date] && report[date].state === 'not-yet') {
          delete out[date];
          delete report[date];
        }
      }
      // Giờ bấm thật (punchIn / punchOut) đi theo ngày vào dòng ngày của phiếu: ngày đi làm, vắng, chờ xử lý (trừ chưa tới ngày)
      for (const date of dates) {
        const day = out[date];
        if ((resignedOn && date > resignedOn) || !day || typeof day !== 'object') continue;
        const shown =
          day.kind === 'work' || day.kind === 'noshow' || (day.kind === 'pending' && day.reason !== 'not-yet');
        if (shown) Object.assign(day, punchTimes(usedOf(byDate.get(date) || [])));
      }
      // Annotation for alerts/checklists only; preserve report state, hours, and payroll inputs.
      for (const list of byDate.values())
        for (const session of list)
          if (session.entry && session.entry.forgotIn) {
            const date = (session.entry.plannedShift && session.entry.plannedShift.date) || session.date;
            if (report[date]) report[date].flags = [...new Set([...(report[date].flags || []), 'forgot-in'])];
          }
      const waiting = [...new Set<any>(missing)].sort();
      return { days: out, report, missing: waiting, absent: absent.sort() };
    }

    // Số phút làm việc đã trễ lúc vào (đã bỏ giờ nghỉ), lấy sàn theo phút; chỉ để hiển thị ở màn "Hôm nay"
    function lateMinutes(plannedShift?, presIn?) {
      const shift = plannedShift && analyseShift(plannedShift, [[epochMin(presIn), epochMin(plannedShift.endIso)]]);
      return shift && shift.coveredWork ? shift.missedStart : 0;
    }

    return { RULE, POLICY, ALLOWED, SHIFT_TIMES, cutMin, apply, lateMinutes, punchTimesOf };
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
