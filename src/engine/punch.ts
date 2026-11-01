/* Quy tắc check-in / check-out — dùng chung cho trình duyệt (window.PunchRules) và máy chủ (require('./src/engine/punch')).
   Mọi phép tính dùng "phút giờ Việt Nam kể từ 1970" (UTC+7, Việt Nam không có giờ mùa hè) để ca qua 0 giờ và qua tháng không sai. */
(function (root: any) {
  // payroll-params.js phải nạp trước trang (trình duyệt) để mô-đun lấy mặc định từ DEFAULTS; vắng thì dùng FALLBACK chuyển tiếp.
  const PayrollParams =
    typeof module !== 'undefined' && module.exports ? require('./payroll-params') : root.PayrollParams;
  // Mọi con số đến từ bộ tham số phẳng `params` qua create(params); hàm trần của mô-đun = create(mặc định), mặc định là
  // PayrollParams.DEFAULTS. FALLBACK là bản chép CHUYỂN TIẾP của đúng các khoá mô-đun này đọc, để trang chưa nạp
  // payroll-params.js (và test nạp mô-đun trong `vm`) vẫn chạy. Phải bằng PayrollParams.DEFAULTS (scripts/params/check-fallbacks.ts
  // kiểm). Ca cố định dùng khoá shift.preset.<mã>.in / .out.
  const FALLBACK = Object.freeze({
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
    'shift.preset.g2.out': '07:00',
    'unit.minutesPerHour': 60,
    'unit.minutesPerDay': 1440,
    'unit.msPerDay': 86400000,
    'unit.vnUtcOffsetMin': 420,
    'attendance.openSessionMaxHours': 16,
    'attendance.earlyCheckinMaxHours': 4
  });
  // Mã ca mới của sáu ca mặc định → khoá giờ ca cũ trong bộ tham số (shift.preset.<khoá>.*). Danh mục ca trong DB
  // (bảng work_shifts) nạp đúng bảng này (src/domain/position/seed-data.ts); ca Admin thêm hoặc đổi mã về sau đi vào bộ tham số
  // dưới dạng shift.alias.<mã mới> = <khoá>. SHIFT tra được bằng cả mã mới lẫn mã cũ; Object.keys(SHIFT) vẫn là các khoá cũ.
  const SHIFT_CODES = Object.freeze({
    Normal1: 'n1',
    Normal2: 'n2',
    Flex1: 'f1',
    Flex2: 'f2',
    Night1: 'g1',
    Night2: 'g2'
  });
  // Bảng đổi mã của bộ tham số P: mặc định + shift.alias.<mã mới> = <khoá cũ>
  function shiftAliases(P?) {
    const map = { ...SHIFT_CODES };
    for (const key of Object.keys(P || {})) {
      const m = /^shift\.alias\.(?<code>[A-Za-z0-9]+)$/.exec(key);
      if (m && typeof P[key] === 'string') map[m.groups!.code] = P[key];
    }
    return map;
  }
  // Gắn mã mới vào bảng giờ ca theo khoá cũ (table), không ghi đè khoá đã có; dùng chung với src/engine/actual-hours.ts
  function addAliases(table?, aliases?) {
    for (const [code, preset] of Object.entries<any>(aliases))
      if (!Object.hasOwn(table, code) && Object.hasOwn(table, preset))
        Object.defineProperty(table, code, { value: table[preset], enumerable: false });
    return table;
  }

  // Bộ tham số phẳng → toàn bộ quy tắc. Khoá vắng là lỗi (không đoán giá trị).
  function build(P?) {
    const need = (key?) => {
      if (!Object.hasOwn(P, key))
        throw Object.assign(new Error(`Thiếu tham số ${key}`), { code: 'PARAM_MISSING', key });
      return P[key];
    };
    const SHIFT: Record<string, any> = {};
    for (const key of Object.keys(P)) {
      const m = /^shift\.preset\.(?<code>[a-z0-9]+)\.in$/.exec(key);
      if (m) SHIFT[m.groups!.code] = [need(key), need(`shift.preset.${m.groups!.code}.out`)];
    }
    // Mã mới là thuộc tính ẩn (không đếm khi liệt kê) trỏ cùng giờ ca với khoá cũ
    const ALIASES = shiftAliases(P);
    addAliases(SHIFT, ALIASES);
    // Khoá giờ ca của một mã (mới hoặc cũ); mã lạ trả chính nó. Mã mới của một khoá cũ; không có thì trả chính nó
    const presetOf = (code?) => (Object.hasOwn(ALIASES, code) ? ALIASES[code] : code);
    const canonicalOf = (code?) => Object.keys(ALIASES).find(c => ALIASES[c] === code) || code;
    const MIN_H = need('unit.minutesPerHour');
    const DAY = need('unit.minutesPerDay');
    const MS_MIN = need('unit.msPerDay') / DAY; // mili giây trong một phút
    const VN = need('unit.vnUtcOffsetMin'); // UTC+7
    const MAX_OPEN = need('attendance.openSessionMaxHours') * MIN_H; // ca mở quá bấy nhiêu phút là quên check-out
    const EARLY = need('attendance.earlyCheckinMaxHours') * MIN_H; // check-in sớm nhất trước giờ vào ca bấy nhiêu phút
    const toMin = (t?) => {
      const [h, m] = t.split(':').map(Number);
      return h * MIN_H + m;
    };
    const vmin = (iso?, up?) => (up ? Math.ceil : Math.floor)(Date.parse(iso) / MS_MIN) + VN; // thời điểm → phút giờ VN (làm tròn xuống; up = làm tròn lên)
    const isoOf = (v?) => new Date((v - VN) * MS_MIN).toISOString();
    const dateOf = (v?) => new Date(v * MS_MIN).toISOString().slice(0, 10);
    const timeOf = (v?) => new Date(v * MS_MIN).toISOString().slice(11, 16);
    const dayMin = (date?) => Date.parse(date + 'T00:00:00Z') / MS_MIN; // 00:00 của ngày date (giờ VN)
    const dow = (date?) => new Date(date + 'T00:00:00Z').getUTCDay(); // 0 = Chủ nhật
    // Ngày công có trong lịch làm việc của người không: staff.isWorkDay(ngày) (lịch giải theo từng ngày, src/engine/work-schedule.ts) hoặc staff.sched (mảng thứ, tương thích)
    const inSchedule = (staff?, date?) =>
      staff.isWorkDay ? !!staff.isWorkDay(date) : (staff.sched || []).includes(dow(date));
    const mod = (x?) => ((x % DAY) + DAY) % DAY;
    const span = (a?, b?) => mod(toMin(b) - toMin(a)) || DAY; // độ dài a → b (qua 0 giờ được); trùng nhau = 24 giờ

    // Lần ca cố định gần thời điểm v nhất: { date, start, end } (phút VN). Không có ca cố định → null.
    function occurrence(code?, v?) {
      const s = SHIFT[code];
      if (!s) return null;
      const d0 = dayMin(dateOf(v));
      let best: any = null;
      for (const k of [-1, 0, 1]) {
        const start = d0 + k * DAY + toMin(s[0]);
        if (!best || Math.abs(start - v) < Math.abs(best.start - v))
          best = { start, end: start + span(s[0], s[1]), date: dateOf(start) };
      }
      return best;
    }
    // Ngày công của lần check-in lúc inIso: ngày bắt đầu của lần ca gần nhất; không có ca cố định → ngày check-in
    function workDate(code?, inIso?) {
      const v = vmin(inIso),
        o = occurrence(code, v);
      return o ? o.date : dateOf(v);
    }

    // Giữ ca/ngày công tại lúc check-in; đổi ca trong hồ sơ không đổi ca đang mở.
    // Ca dự kiến luôn là ca đã gán; ngày ngoài lịch mang kind 'makeup' (lượt chấm ngoài lịch: chỉ đoạn làm thêm đã duyệt được trả).
    function planShift(staff?, date?) {
      const s = SHIFT[staff.shiftCode];
      if (!s) return null;
      const scheduled = inSchedule(staff, date);
      const start = dayMin(date) + toMin(s[0]);
      return {
        code: staff.shiftCode,
        date,
        in: s[0],
        out: s[1],
        startIso: isoOf(start),
        endIso: isoOf(start + span(s[0], s[1])),
        kind: scheduled ? 'work' : 'makeup'
      };
    }

    // Dựng ngày công từ khoảng có mặt [inIso, outIso]. staff: { shiftCode, sched } (sched: các thứ trong lịch làm việc)
    function buildDay(staff?, inIso?, outIso?, src?, options: any = {}) {
      const a = Date.parse(inIso) / MS_MIN + VN,
        b = Date.parse(outIso) / MS_MIN + VN;
      const plannedShift = options.plannedShift || planShift(staff, workDate(staff.shiftCode, inIso));
      const date = plannedShift ? plannedShift.date : dateOf(a);
      const pres = { presIn: new Date(inIso).toISOString(), presOut: new Date(outIso).toISOString() };
      const pending = (reason?) => ({
        date,
        entry: { kind: 'pending', reason, src, ...pres, ...(plannedShift ? { plannedShift } : {}) }
      });
      if (!plannedShift) return pending('off-shift');
      const start = vmin(plannedShift.startIso),
        end = vmin(plannedShift.endIso);
      if (Math.min(b, end) <= Math.max(a, start)) return pending('off-shift');
      const incomplete = a > start || b < end;
      if (incomplete && !options.approveIncomplete) return pending('incomplete-shift');
      return {
        date,
        entry: {
          kind: plannedShift.kind,
          in: plannedShift.in,
          out: plannedShift.out,
          extraKind: '',
          extraIn: '',
          extraOut: '',
          preset: plannedShift.code,
          breakMin: 0,
          src,
          ...pres,
          plannedShift,
          attendanceConfirmed: true,
          ...(incomplete ? { attendanceApproved: true } : {})
        }
      };
    }
    // Ca mở từ inIso đã quá 16 tiếng tính tới nowIso chưa
    const forgotOut = (inIso?, nowIso?) => vmin(nowIso) - vmin(inIso) > MAX_OPEN;
    // Mốc ISO của đúng ranh giới quên Check-out tại nowIso: lượt mở có presIn TRƯỚC mốc này là quá hạn (cùng mốc phút với forgotOut,
    // không chép lại hệ số 16 giờ ở chỗ khác). src/domain/attendance/index.ts → closeStaleFor lọc bằng SQL theo mốc này để đường ĐỌC
    // (GET /api/attendance, /alerts, /today, /team) không mở giao dịch cho người chưa quá hạn.
    const staleBefore = (nowIso?) => isoOf(vmin(nowIso) - MAX_OPEN);
    // Ngày bắt đầu quá hạn theo cùng mốc phút; không phụ thuộc lúc trang được mở.
    const forgotOutDate = (inIso?) => dateOf(vmin(inIso) + MAX_OPEN + 1);
    const pendingDay = (reason?) => (staff, inIso, snapshot) => {
      const plannedShift = snapshot || planShift(staff, workDate(staff.shiftCode, inIso));
      return {
        date: plannedShift ? plannedShift.date : workDate(staff.shiftCode, inIso),
        entry: {
          kind: 'pending',
          reason,
          src: 'punch',
          presIn: new Date(inIso).toISOString(),
          ...(plannedShift ? { plannedShift } : {})
        }
      };
    };
    const openDay: any = pendingDay('open'); // lúc check-in: "đang trong ca"
    const forgotDay = pendingDay('forgot-out'); // sau 16 tiếng chưa check-out

    // Trong khung check-in của ca đã gán thì lượt nhận ca đó (ngày ngoài lịch mang kind 'makeup' qua planShift: chỉ đoạn OT/làm bù đã duyệt được trả);
    // ngoài khung đó giữ giờ có mặt thật, không đoán ca.
    function openSessionDay(staff?, inIso?) {
      const date = workDate(staff.shiftCode, inIso),
        inside = !checkInMsg(staff.shiftCode, inIso);
      if (inside) return openDay(staff, inIso);
      const actualDate = dateOf(vmin(inIso));
      return {
        date: actualDate,
        entry: {
          kind: 'pending',
          reason: 'open',
          src: 'punch',
          presIn: new Date(inIso).toISOString(),
          outsideShift: true,
          assignedShift: planShift(staff, actualDate)
        }
      };
    }

    // Cảnh báo trước khi check-out sớm theo ca đã chốt lúc check-in; không sửa dữ liệu ca.
    function checkoutWarning(open?, nowIso?) {
      const endIso = open?.plannedShift?.endIso;
      const end = Date.parse(endIso),
        now = Date.parse(nowIso);
      if (!Number.isFinite(end) || !Number.isFinite(now) || now >= end) return null;
      return { endIso, remainingMinutes: Math.ceil((end - now) / MS_MIN) };
    }

    // Khoảng có mặt cho yêu cầu điều chỉnh: giờ HH:MM của ngày công date — giờ vào lấy lần gần giờ bắt đầu ca của ngày đó nhất; giờ ra ≤ giờ vào → hôm sau
    function presenceFor(code?, date?, tin?, tout?) {
      const s = SHIFT[code],
        anchor = dayMin(date) + toMin(s ? s[0] : tin);
      let a = dayMin(date) + toMin(tin);
      for (const k of [-1, 1]) {
        const c = dayMin(date) + k * DAY + toMin(tin);
        if (Math.abs(c - anchor) < Math.abs(a - anchor)) a = c;
      }
      return { inIso: isoOf(a), outIso: isoOf(a + span(tin, tout)) };
    }
    // Check-in lúc iso có nằm trong khung [bắt đầu ca − 4 tiếng, kết thúc ca) của lần ca gần nhất không: '' = được, ngược lại là câu báo lỗi.
    // Chặn việc bấm khi ca đã kết thúc (bị gán nhầm vào ca vừa xong) hoặc quá sớm (bị gán sang ca hôm sau).
    // Chưa gán ca cố định → không check-in được: không có khung ca để cắt giờ, ra muộn sẽ thành thêm giờ làm / ca đêm.
    function checkInMsg(code?, iso?) {
      const v = vmin(iso),
        o = occurrence(code, v);
      if (!o) return 'Chưa được gán ca cố định — nhờ Admin gán ca rồi mới check-in được.';
      if (v < o.start - EARLY || v >= o.end)
        return `Ngoài giờ ca cố định (${SHIFT[code][0]}–${SHIFT[code][1]}): chỉ check-in được từ ${timeOf(o.start - EARLY)} đến trước ${timeOf(o.end)}. Đi làm ngoài ca thì nhờ Admin ghi giờ.`;
      return '';
    }
    // Số phút trễ so với lần ca cố định của lần check-in (0 nếu đúng giờ / sớm / không có ca)
    const lateMin = (code?, inIso?) => {
      const v = Date.parse(inIso) / MS_MIN + VN,
        o = occurrence(code, v);
      return o ? Math.max(0, Math.ceil(v - o.start)) : 0;
    };

    // Phần khai làm thêm của ngày khoá phải nằm trong khoảng có mặt: '' = hợp lệ, ngược lại là câu báo lỗi
    function extraFits(e?) {
      if (!e || !e.src || !e.presIn || !e.presOut || !e.extraKind) return '';
      const a = Date.parse(e.presIn) / MS_MIN + VN,
        b = Date.parse(e.presOut) / MS_MIN + VN,
        mainIn = e.plannedShift
          ? vmin(e.plannedShift.startIso)
          : vmin(e.presIn) + mod(toMin(e.in) - mod(vmin(e.presIn))),
        mainOut = mainIn + span(e.in, e.out);
      if (e.extraIn && e.extraIn !== e.in && mainIn - mod(toMin(e.in) - toMin(e.extraIn)) < a)
        return `Làm thêm trước ca chỉ được từ lúc check-in (${timeOf(a)})`;
      if (e.extraOut && e.extraOut !== e.out && mainOut + mod(toMin(e.extraOut) - toMin(e.out)) > b)
        return `Làm thêm sau ca chỉ được đến lúc check-out (${timeOf(b)})`;
      return '';
    }

    // Thời điểm có đủ ngày để kiểm chồng giờ, kể cả bản ghi cũ vào sau 0h.
    function workBounds(e?, date?) {
      let start = e.plannedShift
        ? vmin(e.plannedShift.startIso)
        : e.presIn
          ? vmin(e.presIn) + mod(toMin(e.in) - mod(vmin(e.presIn)))
          : dayMin(date) + toMin(e.in);
      const end =
        start + span(e.in, e.out) + (e.extraOut && e.extraOut !== e.out ? mod(toMin(e.extraOut) - toMin(e.out)) : 0);
      if (e.extraIn && e.extraIn !== e.in) start -= mod(toMin(e.in) - toMin(e.extraIn));
      return { start, end };
    }

    // Khoảng cách (mét) giữa hai toạ độ theo công thức haversine, Trái Đất là hình cầu bán kính 6.371 km.
    // Máy chủ dùng để kiểm "đang ở trong khu vực công ty" khi Check-in; không bao giờ lưu toạ độ hay khoảng cách.
    function distanceM(lat1?, lng1?, lat2?, lng2?) {
      const rad = Math.PI / 180,
        dLat = (lat2 - lat1) * rad,
        dLng = (lng2 - lng1) * rad;
      const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
      return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)));
    }

    return {
      SHIFT,
      SHIFT_CODES,
      presetOf,
      canonicalOf,
      workDate,
      planShift,
      buildDay,
      forgotOut,
      staleBefore,
      forgotOutDate,
      openDay,
      openSessionDay,
      forgotDay,
      checkoutWarning,
      presenceFor,
      checkInMsg,
      lateMin,
      extraFits,
      workBounds,
      dow,
      distanceM,
      vnDate: (iso?) => dateOf(vmin(iso)),
      vnTime: (iso?) => timeOf(vmin(iso))
    };
  }

  // Một bộ tham số → một bản mô-đun (nhớ theo đối tượng: bộ tham số của tháng được đóng băng và dùng lại cho cả bảng lương)
  const built = new WeakMap<any, any>();
  function create(params?) {
    if (!params || typeof params !== 'object')
      throw new TypeError('create(params): cần bộ tham số phẳng (PayrollParams.DEFAULTS)');
    if (!built.has(params))
      built.set(params, Object.freeze({ ...build(params), FALLBACK, create, shiftAliases, addAliases }));
    return built.get(params);
  }
  // Mặc định chuyển tiếp: PayrollParams.DEFAULTS (hàm trần của mô-đun = create(mặc định)); vắng payroll-params.js thì FALLBACK
  const api = create(PayrollParams && PayrollParams.DEFAULTS ? PayrollParams.DEFAULTS : FALLBACK);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PunchRules = api;
})(this);

/* Tự kiểm tra: node src/engine/punch.ts */
if (typeof require !== 'undefined' && require.main === module) {
  const assert = require('node:assert');
  const P = module.exports;
  const T = (date?, hm?) => new Date(Date.parse(`${date}T${hm}:00+07:00`)).toISOString(); // giờ VN → ISO UTC
  const nv = { shiftCode: 'n1', sched: [1, 2, 3, 4, 5, 6] },
    night = { shiftCode: 'g2', sched: [1, 2, 3, 4, 5, 6] };
  // Ca đủ điều kiện xác nhận đủ ngày; giờ có mặt vẫn được giữ để khai thêm giờ.
  let r = P.buildDay(nv, T('2026-10-07', '07:50'), T('2026-10-07', '17:40'), 'punch');
  assert.equal(r.date, '2026-10-07');
  assert.equal(r.entry.kind, 'work');
  assert.equal(r.entry.in, '08:00');
  assert.equal(r.entry.out, '17:00');
  assert.equal(r.entry.presIn, T('2026-10-07', '07:50'));
  assert.equal(r.entry.presOut, T('2026-10-07', '17:40'));
  r = P.buildDay(nv, T('2026-10-07', '08:07'), T('2026-10-07', '16:50'), 'punch');
  assert.equal(r.entry.kind, 'pending');
  assert.equal(r.entry.reason, 'incomplete-shift');
  r = P.buildDay(nv, T('2026-10-07', '08:07'), T('2026-10-07', '16:50'), 'admin', { approveIncomplete: true });
  assert.equal(r.entry.in, '08:00');
  assert.equal(r.entry.out, '17:00');
  assert.equal(r.entry.attendanceApproved, true);
  // Giữ thời điểm chính xác; không làm tròn đủ ca cho người vào trễ/về sớm vài giây.
  r = P.buildDay(
    nv,
    new Date(Date.parse('2026-10-07T08:07:40+07:00')).toISOString(),
    new Date(Date.parse('2026-10-07T16:50:10+07:00')).toISOString(),
    'punch'
  );
  assert.equal(r.entry.presIn, '2026-10-07T01:07:40.000Z');
  assert.equal(r.entry.presOut, '2026-10-07T09:50:10.000Z');
  // ca đêm 22:00–07:00
  r = P.buildDay(night, T('2026-10-07', '21:50'), T('2026-10-08', '07:05'), 'punch');
  assert.equal(r.date, '2026-10-07');
  assert.equal(r.entry.in, '22:00');
  assert.equal(r.entry.out, '07:00');
  r = P.buildDay(night, T('2026-10-08', '00:30'), T('2026-10-08', '07:05'), 'punch'); // đến muộn qua 0 giờ → vẫn ngày 07
  assert.equal(r.date, '2026-10-07');
  assert.equal(r.entry.reason, 'incomplete-shift');
  assert.equal(r.entry.plannedShift.in, '22:00');
  assert.equal(P.buildDay(night, T('2026-09-30', '22:00'), T('2026-10-01', '07:00'), 'punch').date, '2026-09-30'); // ca đêm cuối tháng
  // Không có ca cố định thì chưa có cơ sở xác nhận đủ ngày.
  r = P.buildDay(
    { shiftCode: null, sched: [1, 2, 3, 4, 5, 6] },
    T('2026-10-07', '09:00'),
    T('2026-10-07', '20:00'),
    'punch'
  );
  assert.equal(r.entry.reason, 'off-shift');
  // bấm ngoài ca cố định → chờ xử lý
  r = P.buildDay(nv, T('2026-10-07', '18:00'), T('2026-10-07', '21:00'), 'punch');
  assert.equal(r.entry.kind, 'pending');
  assert.equal(r.entry.reason, 'off-shift');
  // thực tập sinh thứ 7 (ngoài lịch T2–T6) → làm bù
  assert.equal(
    P.buildDay({ shiftCode: 'n1', sched: [1, 2, 3, 4, 5] }, T('2026-10-10', '08:00'), T('2026-10-10', '17:00'), 'punch')
      .entry.kind,
    'makeup'
  );
  // ngày công của lần check-in
  assert.equal(P.workDate('g2', T('2026-10-08', '00:30')), '2026-10-07');
  assert.equal(P.workDate(null, T('2026-10-08', '00:30')), '2026-10-08');
  // quên check-out: 15:59 chưa, 16:01 rồi
  assert.equal(P.forgotOut(T('2026-10-07', '08:00'), T('2026-10-07', '23:59')), false);
  assert.equal(P.forgotOut(T('2026-10-07', '08:00'), T('2026-10-08', '00:01')), true);
  // mốc dùng để lọc bằng SQL là đúng ranh giới của forgotOut: trước mốc là quá hạn, đúng mốc thì chưa
  assert.equal(P.forgotOut(P.staleBefore(T('2026-10-08', '00:01')), T('2026-10-08', '00:01')), false);
  assert.equal(
    P.forgotOut(
      new Date(Date.parse(P.staleBefore(T('2026-10-08', '00:01'))) - 60000).toISOString(),
      T('2026-10-08', '00:01')
    ),
    true
  );
  assert.equal(P.forgotDay(nv, T('2026-10-07', '08:00')).entry.reason, 'forgot-out');
  assert.equal(P.forgotDay(nv, T('2026-10-07', '08:00')).entry.plannedShift.in, '08:00');
  // yêu cầu điều chỉnh: ca đêm vào 00:30 của ngày công 07 → 00:30 ngày 08
  const p = P.presenceFor('g2', '2026-10-07', '00:30', '07:00');
  assert.equal(p.inIso, T('2026-10-08', '00:30'));
  assert.equal(p.outIso, T('2026-10-08', '07:00'));
  assert.equal(P.buildDay(night, p.inIso, p.outIso, 'admin').date, '2026-10-07');
  assert.deepEqual(P.presenceFor('n1', '2026-10-07', '08:02', '17:05'), {
    inIso: T('2026-10-07', '08:02'),
    outIso: T('2026-10-07', '17:05')
  });
  // làm thêm phải nằm trong khoảng có mặt 07:00–19:00
  const e = P.buildDay(nv, T('2026-10-07', '07:00'), T('2026-10-07', '19:00'), 'punch').entry;
  assert.equal(P.extraFits({ ...e, extraKind: 'makeup', extraIn: '07:00', extraOut: '19:00' }), '');
  assert.match(P.extraFits({ ...e, extraKind: 'makeup', extraOut: '19:30' }), /check-out/);
  assert.match(P.extraFits({ ...e, extraKind: 'ot', extraIn: '06:30' }), /check-in/);
  // khung check-in: ca đêm 22:00–07:00 → 09:30 sáng hôm sau (ca vừa kết thúc) và 17:00 (quá sớm) bị chặn, 18:30 / 00:30 được; ca ngày 08–17 → 18:00 bị chặn
  assert.match(P.checkInMsg('g2', T('2026-10-07', '09:30')), /Ngoài giờ ca/);
  assert.match(P.checkInMsg('g2', T('2026-10-07', '17:00')), /từ 18:00/);
  assert.equal(P.checkInMsg('g2', T('2026-10-07', '18:30')), '');
  assert.equal(P.checkInMsg('g2', T('2026-10-08', '00:30')), '');
  assert.match(P.checkInMsg('n1', T('2026-10-07', '18:00')), /đến trước 17:00/);
  assert.equal(P.checkInMsg('n1', T('2026-10-07', '07:58')), '');
  assert.match(P.checkInMsg(null, T('2026-10-07', '03:00')), /Chưa được gán ca/);
  // phút trễ so với ca; thứ trong tuần; giờ VN
  assert.equal(P.lateMin('n1', T('2026-10-07', '08:12')), 12);
  assert.equal(P.lateMin('n1', T('2026-10-07', '07:40')), 0);
  assert.equal(P.dow('2026-10-11'), 0);
  assert.equal(P.vnTime(T('2026-10-07', '07:58')), '07:58');
  assert.equal(P.vnDate(T('2026-10-08', '00:30')), '2026-10-08');
  console.log('punch.js: OK');
}
