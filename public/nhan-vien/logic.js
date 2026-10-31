/* Giao diện Nhân viên v4: luật hiển thị chấm công. Module thuần, không DOM, không I/O: "bây giờ" truyền vào qua nowIso.
   Số phút muộn, về sớm, bị trừ, trạng thái từng ngày và số phép còn lại do MÁY CHỦ tính (GET /api/sheet: actualReport, cutRule, leaveBalance;
   GET/POST /api/punch: cutRule, checkoutPreview); ở đây chỉ nhận về và hiện. Khung check-in, lịch T2–T7, ca cố định lấy từ các module dùng chung:
   PunchRules (public/punch.js), ApprovalView (public/approval-view.js). Nhãn trạng thái của lượt và của ngày có lượt do máy chủ tính
   (session.status, session.statusNote); AttendanceStatus (public/attendance-status.js) đổi mã ra chữ và chọn nhãn của ngày.
   Ở đây chỉ phân loại ngày để vẽ và viết câu chữ; không tính tiền, không tự đặt công thức.
   Chạy được cả trong trình duyệt (window.NhanVienLogic) lẫn Node (require) để kiểm thử. */
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const deps = isNode
    ? {
        PR: require('../punch.js'),
        AV: require('../approval-view.js'),
        AS: require('../attendance-status.js'),
        PP: require('../payroll-params.js'),
        KS: require('../kpi-score.js')
      }
    : {
        PR: root.PunchRules,
        AV: root.ApprovalView,
        AS: root.AttendanceStatus,
        PP: root.PayrollParams,
        KS: root.KpiScore
      };
  const api = factory(deps);
  if (isNode) module.exports = api;
  else root.NhanVienLogic = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (deps) {
  'use strict';
  const { PR, AV, AS, PP, KS } = deps;

  /* ---------- tên gọi ---------- */
  // Tên sáu ca theo mã hiện hành; ngày đã lưu có thể mang mã cũ (n1…), PR.canonicalOf đổi sang mã hiện hành
  const SHIFT_NAME = {
    Normal1: 'Normal 1',
    Normal2: 'Normal 2',
    Flex1: 'Flex 1',
    Flex2: 'Flex 2',
    Night1: 'Night 1',
    Night2: 'Night 2'
  };
  const canonShift = code => (code && PR.canonicalOf ? PR.canonicalOf(code) : code);
  const DOW_LONG = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  const DOW_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  const TYPE_LONG = { tts: 'Thực tập sinh', ctv: 'Chuyên trách viên', nv: 'Nhân viên' };
  const ITEM_LABEL = {
    isat: 'iSAT',
    approved: 'Nghỉ được duyệt',
    makeup_day: 'Làm bù cả ngày (loại cũ)',
    ot: 'OT',
    makeup_hours: 'Làm bù theo giờ',
    leave: 'Nghỉ phép năm',
    willmakeup: 'Nghỉ, sẽ làm bù'
  };
  // Câu duy nhất cho ngày sai hoặc thiếu giờ chấm: nhân sự không sửa giờ, chỉ Admin sửa được giờ
  const ADMIN_FIX = 'Sai giờ thì nhờ Admin sửa giờ.';
  // Nhãn của lượt Check-in ngoài vùng GPS (attendance_sessions.entry.outsideZone === true)
  const OUTSIDE_ZONE = 'Ngoài vùng GPS';
  // Loại ngày cũ 'makeup' không còn chọn được, bộ máy tính 0; chỉ còn nhãn để hiện ngày đã lưu
  const LEGACY_MAKEUP = 'makeup';
  const LEGACY_MAKEUP_HINT = 'Loại cũ, không còn dùng và không tính lương. Hãy chọn loại khác.';
  const KIND_LABEL = {
    work: 'Đi làm',
    makeup: 'Làm bù cả ngày (loại cũ, không tính)',
    leave: 'Nghỉ phép năm',
    unpaid: 'Nghỉ không lương',
    willmakeup: 'Nghỉ, sẽ làm bù',
    approved: 'Nghỉ được duyệt',
    isat: 'iSAT',
    noshow: 'Vắng không phép'
  };

  /* ---------- ngày, giờ ---------- */
  const pad = n => String(n).padStart(2, '0');
  const isDate = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
  const dowOf = ymd => new Date(ymd + 'T00:00:00Z').getUTCDay(); // 0 = Chủ nhật
  const dmy = ymd => (isDate(ymd) ? `${ymd.slice(8)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}` : '—');
  const dm = ymd => (isDate(ymd) ? `${ymd.slice(8)}/${ymd.slice(5, 7)}` : '—');
  const vnDate = iso => PR.vnDate(iso);
  const vnTime = iso => PR.vnTime(iso);
  const daysInMonth = ym => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5)), 0)).getUTCDate();
  const addDays = (ymd, k) => new Date(Date.parse(ymd + 'T00:00:00Z') + k * 86400000).toISOString().slice(0, 10);
  const addMonths = (ym, k) => {
    const y = Number(ym.slice(0, 4)),
      m = Number(ym.slice(5)) - 1 + k;
    return `${y + Math.floor(m / 12)}-${pad((((m % 12) + 12) % 12) + 1)}`;
  };
  const monthLabel = ym => `Tháng ${ym.slice(5)}/${ym.slice(0, 4)}`;
  const weekdayLong = ymd => DOW_LONG[dowOf(ymd)];
  // Thứ Hai của tuần chứa ymd
  const mondayOf = ymd => addDays(ymd, -((dowOf(ymd) + 6) % 7));
  // "7 giờ 30 phút", "45 phút", "2 giờ"
  const fmtMin = min => {
    const m = Math.max(0, Math.round(Number(min) || 0)),
      h = Math.floor(m / 60),
      r = m % 60;
    if (!h) return `${r} phút`;
    return r ? `${h} giờ ${r} phút` : `${h} giờ`;
  };
  // Khoảng cách hiển thị: dưới 1000 m ghi mét, từ đó ghi km một chữ số thập phân
  const fmtDistance = m => {
    if (!Number.isFinite(m)) return '';
    if (m < 1000) return `${Math.max(1, Math.round(m))} m`;
    return `~${(m / 1000).toFixed(1).replace('.', ',')} km`;
  };

  /* ---------- ca ---------- */
  function shiftInfo(code) {
    const t = PR.SHIFT[code];
    if (!t) return null;
    const canonical = canonShift(code);
    const name = SHIFT_NAME[canonical] || canonical;
    return { code: canonical, name, in: t[0], out: t[1], label: `${name} · ${t[0]}–${t[1]}` };
  }
  // chức vụ lạ chưa có lịch từ máy chủ: không đoán thành lịch của loại khác (lịch thật đến từ GET /api/sheet)
  const scheduleOf = me => AV.SCHEDULE[me && me.type] || [];
  /* Lịch làm việc do máy chủ gửi (GET /api/sheet → workSchedule, scheduledDates). Có thì thắng: ngày làm của một ngày là
     "ngày đó nằm trong scheduledDates của tháng"; chưa có dữ liệu của tháng đó thì suy theo thứ trong tuần của loại nhân sự. */
  const serverSched = new Map(); // 'YYYY-MM' → { dates: Set, schedule }
  let schedMonth = ''; // tháng gần nhất đã nhận lịch (để ghi nhãn "T2 – T7")
  const setScheduleInfo = (month, data) => {
    if (!data || !Array.isArray(data.scheduledDates)) return;
    serverSched.set(month, {
      dates: new Set(data.scheduledDates),
      schedule: data.workSchedule || null,
      workdaysStd: data.workdaysStd ?? (data.workSchedule && data.workSchedule.workdaysStd) ?? null
    });
    schedMonth = month;
  };
  const isScheduled = (me, date) => {
    const info = serverSched.get(String(date).slice(0, 7));
    return info ? info.dates.has(date) : scheduleOf(me).includes(dowOf(date));
  };
  // Ngày công chuẩn của tháng nếu máy chủ gửi (chỉ khi khác mặc định của chức vụ)
  const workdaysStdOf = month => (serverSched.get(month) || {}).workdaysStd ?? null;
  // "T2 – T7"; lịch liền nhau thì ghi khoảng, không thì liệt kê
  function scheduleText(me) {
    // nhãn do máy chủ dựng sẵn (workSchedule.describe.label) khi có; thiếu thì dựng từ lịch theo loại của bảng dự phòng
    const info = serverSched.get(schedMonth);
    const label = info && info.schedule && info.schedule.describe && info.schedule.describe.label;
    if (typeof label === 'string' && label) return label;
    const days = scheduleOf(me)
      .slice()
      .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
    if (!days.length) return '—'; // chưa có lịch từ máy chủ
    const first = days[0],
      last = days[days.length - 1];
    const run = days.every((d, i) => (d + 6) % 7 === ((first + 6) % 7) + i);
    return run ? `${DOW_SHORT[first]} – ${DOW_SHORT[last]}` : days.map(d => DOW_SHORT[d]).join(', ');
  }
  function greeting(nowIso) {
    const h = Number(vnTime(nowIso).slice(0, 2));
    return h < 5
      ? 'Chào buổi tối'
      : h < 11
        ? 'Chào buổi sáng'
        : h < 13
          ? 'Chào buổi trưa'
          : h < 18
            ? 'Chào buổi chiều'
            : 'Chào buổi tối';
  }
  // Tên gọi: từ cuối của họ tên ("Phan Hoài Ly" → "Ly")
  const givenName = name =>
    String(name || '')
      .trim()
      .split(/\s+/)
      .pop() || '';
  /* Tên bậc để hiện thay "Level N". Ưu tiên tên máy chủ gửi kèm hồ sơ (me.levelName, giá trị đang hiệu lực của tháng, Admin đổi được
     trong Cài đặt); chưa có thì lấy tên mặc định trong PayrollParams.DEFAULTS; tên trống thì "Bậc N". Nhân viên không đọc được
     /settings/params nên không tự tra tên đã đổi (cần máy chủ gửi me.levelName). */
  function levelName(me) {
    if (!me) return '';
    const fallback = Number.isInteger(me.level) && me.level >= 1 ? `Bậc ${me.level}` : '';
    // Máy chủ đã gửi tên (kể cả tên trống do Admin xoá): tin máy chủ, không quay về tên mặc định
    if (typeof me.levelName === 'string') return me.levelName.trim() || fallback;
    const def = PP && PP.DEFAULTS ? PP.DEFAULTS[`level.${me.type}.${me.level}.name`] : '';
    return (typeof def === 'string' && def.trim()) || fallback;
  }
  // Nhãn chức vụ do máy chủ gửi (nếu có), ba nhãn cứng là dự phòng. Tên bậc trùng tên chức vụ ("Nhân viên · Nhân viên") chỉ hiện một lần.
  const sameText = (a, b) => String(a).trim().toLocaleLowerCase('vi') === String(b).trim().toLocaleLowerCase('vi');
  function roleLine(me) {
    if (!me) return '';
    const pos = serverLabel || me.positionLabel || TYPE_LONG[me.type] || '';
    const lv = levelName(me);
    return [pos, pos && lv && sameText(pos, lv) ? '' : lv].filter(Boolean).join(' · ');
  }

  /* ---------- số phút trừ: tra bảng cutRule của máy chủ, không tự làm tròn ---------- */
  // cutRule = { graceMin, stepMin, shiftWorkMin, rounding, table[số phút] → phút bị trừ } (GET /api/sheet, GET/POST /api/punch).
  // Số phút `minutes` vượt cuối bảng thì lấy phần tử cuối. Chưa có bảng (máy chủ chưa gửi) → null: không hiện con số nào.
  function cutFromRule(cutRule, minutes) {
    const table = cutRule && Array.isArray(cutRule.table) ? cutRule.table : null;
    if (!table || !table.length) return null;
    const m = Math.max(0, Math.floor(Number(minutes) || 0));
    const v = table[Math.min(m, table.length - 1)];
    return Number.isFinite(v) ? v : null;
  }
  const graceOf = cutRule => (cutRule && Number.isFinite(cutRule.graceMin) ? cutRule.graceMin : null);
  // Gợi ý "sẽ bị trừ / chưa bị trừ" cho `minutes` phút muộn hoặc về sớm; cut === null khi không có bảng của máy chủ
  function lateNote(late, cutRule) {
    return slackNote(late, cutRule, 'Muộn', 'late');
  }
  function earlyNote(early, cutRule) {
    return slackNote(early, cutRule, 'Về sớm', 'early');
  }
  function slackNote(value, cutRule, label, key) {
    const m = Math.floor(Number(value) || 0);
    if (m <= 0) return null;
    const cut = cutFromRule(cutRule, m);
    const grace = graceOf(cutRule);
    const text =
      cut === null
        ? `${label} ${m} phút`
        : cut
          ? `${label} ${m} phút: sẽ bị trừ ${cut} phút`
          : `${label} ${m} phút: chưa bị trừ${grace === null ? '' : ` (đến ${grace} phút không trừ)`}`;
    return { [key]: m, cut, text };
  }
  const totalCut = r => (r ? (r.cutStartMin || 0) + (r.cutEndMin || 0) + (r.gapCutMin || 0) : 0);

  /* ---------- lỗi vị trí GPS ---------- */
  // Lỗi máy chủ trả về riêng: ưu tiên mã (err.data.code) nếu máy chủ có; không thì đọc câu báo lỗi của /api/punch.
  // Trả '' nếu không phải lỗi vị trí.
  function geoServerError(status, message, code) {
    const c = String(code || '');
    if (c === 'GEO_NO_LOCATION') return 'no-location';
    if (c === 'GEO_LOW_ACCURACY') return 'low-accuracy';
    if (c === 'GEO_OUTSIDE') return 'outside';
    const text = String(message || '');
    if (status === 403 && /ngoài phạm vi/i.test(text)) return 'outside';
    if (status === 400 && /định vị/i.test(text)) return 'no-location';
    if (status === 400 && /chính xác/i.test(text)) return 'low-accuracy';
    return '';
  }
  const GEO_TEXT = {
    'no-permission': {
      title: 'Chưa cấp quyền vị trí',
      body: 'Trình duyệt chưa cho phép AiCB dùng vị trí. Mở cài đặt của trình duyệt cho trang này, chọn "Cho phép vị trí", rồi bấm Thử lại.',
      steps: [
        'Bấm biểu tượng ổ khoá cạnh địa chỉ trang.',
        'Chọn Vị trí (Location) rồi chọn Cho phép.',
        'Quay lại đây và bấm Thử lại.'
      ]
    },
    unavailable: {
      title: 'Chưa lấy được vị trí',
      body: 'Điện thoại chưa trả về vị trí. Hãy bật GPS (Dịch vụ vị trí) rồi thử lại.',
      steps: ['Mở cài đặt điện thoại và bật Vị trí (GPS).', 'Quay lại đây và bấm Thử lại.']
    },
    timeout: {
      title: 'Lấy vị trí quá lâu',
      body: 'Chưa nhận được vị trí trong thời gian chờ. Ra chỗ thoáng, bật GPS rồi thử lại.',
      steps: ['Ra gần cửa sổ hoặc ngoài trời một chút.', 'Bật GPS và bấm Thử lại.']
    },
    'no-location': {
      title: 'Cần bật định vị để Check-in',
      body: 'Máy chủ chưa nhận được vị trí của bạn. Bật GPS và cho phép trang dùng vị trí, rồi thử lại.',
      steps: ['Bật Vị trí (GPS) trên điện thoại.', 'Cho phép trang này dùng vị trí.', 'Bấm Thử lại.']
    },
    'low-accuracy': {
      title: 'Vị trí chưa đủ chính xác',
      body: 'Vị trí điện thoại đang quá lệch. Bật GPS ở chế độ chính xác cao, ra chỗ thoáng rồi thử lại.',
      steps: ['Bật GPS ở chế độ chính xác cao.', 'Ra chỗ thoáng, chờ vài giây.', 'Bấm Thử lại.']
    },
    outside: {
      title: 'Chưa check-in được',
      body: 'Bạn đang ngoài vùng chấm công. Cần ở trong vùng quanh nơi làm việc do Admin cấu hình.',
      steps: []
    }
  };

  /* ---------- gom lượt theo ngày công ---------- */
  const workDateOf = s => (s && s.entry && s.entry.plannedShift && s.entry.plannedShift.date) || (s && s.date) || '';
  function groupSessions(sessions) {
    const map = new Map();
    for (const s of Array.isArray(sessions) ? sessions : []) {
      const d = workDateOf(s);
      if (!isDate(d)) continue;
      if (!map.has(d)) map.set(d, []);
      map.get(d).push(s);
    }
    for (const list of map.values())
      list.sort((a, b) => String(a.entry.presIn || '').localeCompare(String(b.entry.presIn || '')));
    return map;
  }
  // Một lượt → dòng hiển thị; status, statusNote: nhãn và lý do ngắn do máy chủ tính cho lượt (AttendanceStatus.statusOf, noteOf)
  function sessionRow(s, nowIso) {
    const e = s.entry || {};
    const open = s.state === 'open';
    const forgot = e.reason === 'forgot-out' || (!open && e.presIn && !e.presOut);
    const inIso = e.presIn || '',
      outIso = e.presOut || '';
    const durMin =
      inIso && outIso
        ? Math.max(0, Math.round((Date.parse(outIso) - Date.parse(inIso)) / 60000))
        : open && inIso && nowIso
          ? Math.max(0, Math.round((Date.parse(nowIso) - Date.parse(inIso)) / 60000))
          : null;
    // Check-out muộn chờ Admin duyệt giải trình: máy chủ chỉ ghi nhận giờ bấm (entry.requestedOut), lượt chưa có giờ ra
    const waitHm = forgot && e.requestedOut ? vnTime(e.requestedOut) : '';
    return {
      id: s.id,
      shiftCode: (e.plannedShift && e.plannedShift.code) || '',
      open,
      forgot,
      status: AS.statusOf(s),
      statusNote: AS.noteOf(s),
      superseded: s.superseded === true, // lượt bị lượt Admin khai thay cùng ngày thay: không quyết định nhãn của ngày
      inHm: inIso ? vnTime(inIso) : '',
      outHm: outIso ? vnTime(outIso) : '',
      requestedOutHm: waitHm, // giờ bấm Check-out muộn chưa được Admin duyệt ('' nếu không có)
      // Giờ qua nửa đêm: lượt kết thúc sang ngày hôm sau của ngày công
      outNextDay: !!(inIso && outIso && vnDate(outIso) !== vnDate(inIso)),
      inDate: inIso ? vnDate(inIso) : '',
      durMin,
      reason: e.reason || '',
      corrections: Array.isArray(s.corrections) ? s.corrections : []
    };
  }

  /* ---------- phân loại một tháng ---------- */
  const MISSING_STATES = new Set(['forgot-in', 'forgot-out', 'review', 'off-shift']);
  // Ô lịch của ngày có lượt: chữ nhỏ và lớp màu theo nhãn của ngày; Đã Check-in, Đã Check-out không ghi chữ (màu thường, có chú thích)
  const DAY_CELL_TONE = { pending: 'pend', rejected: 'err' };
  // Khoản khai là xin nghỉ cả ngày (không có giờ vào / ra): trạng thái duyệt của chúng hiện trên ô lịch ngày chưa có lượt
  const LEAVE_ITEMS = new Set(['isat', 'approved', 'leave', 'willmakeup']);
  const dayCellLabel = code => (code === 'checked-in' || code === 'checked-out' ? '' : AS.LABEL[code] || '');
  /* Chữ cho ngày cần để ý (model.missing): ngày có lượt Chờ xử lý / Bị từ chối kèm các lý do ngắn, ngày chưa có lượt mà báo cáo
     giờ công cần Admin xử lý (ô Chờ xử lý), hoặc ngày không có chấm công nào */
  const attentionText = c => {
    if (c && (c.dayStatus === 'pending' || c.dayStatus === 'rejected'))
      return [AS.LABEL[c.dayStatus], AS.dayNotes(c.sessions).join('; ')].filter(Boolean).join(': ');
    return c && c.status === 'pending' ? AS.LABEL.pending : 'Không có chấm công';
  };

  /* input: { month, me, days, approvals, sessions, holidays, actualReport, cutRule, nowIso }
     Trả { month, today, cutRule, cells: Map, list, summary, missing }.
     - Báo cáo từng ngày (actualReport.report) do MÁY CHỦ tính cho cả tháng; actualReport null thì không có báo cáo nào.
       Không ghi ngược vào lịch. */
  function buildMonth(input) {
    const { month, me, nowIso } = input;
    const days = input.days || {},
      approvals = input.approvals || {};
    const holidays = new Set(input.holidays || []);
    const today = vnDate(nowIso);
    const ar = input.actualReport && typeof input.actualReport === 'object' ? input.actualReport : null;
    const cutRule = input.cutRule && typeof input.cutRule === 'object' ? input.cutRule : null;
    const sessions = Array.isArray(input.sessions) ? input.sessions : [];
    const report = (ar && ar.report && typeof ar.report === 'object' ? ar.report : null) || {};
    const grouped = groupSessions(sessions);
    const cells = new Map();
    const list = [];
    const n = daysInMonth(month);
    for (let d = 1; d <= n; d++) {
      const date = `${month}-${pad(d)}`;
      const dow = dowOf(date);
      const day = days[date] && typeof days[date] === 'object' ? days[date] : null;
      const kind = day ? day.kind || (day.in && day.out ? 'work' : '') : '';
      // Có đoạn làm thêm thật (trước hoặc sau ca; trùng giờ ca coi như không có), cùng điều kiện với Admin (cham-cong-khai.js → extraOf)
      const extraKind =
        day && ((day.extraIn && day.extraIn !== day.in) || (day.extraOut && day.extraOut !== day.out))
          ? day.extraKind || (day.extraOut ? 'makeup' : '')
          : '';
      const ap = approvals[date] || null;
      const approval =
        ap && ap.status && ap.status !== 'approved'
          ? {
              item: ap.item,
              label: ITEM_LABEL[ap.item] || String(ap.item || ''),
              status: ap.status,
              note: ap.note || ''
            }
          : null;
      const r = report[date] || null;
      const cell = {
        date,
        dow,
        day: d,
        scheduled: isScheduled(me, date),
        holiday: holidays.has(date),
        today: date === today,
        future: date > today,
        kind,
        extraKind,
        approval,
        approvedItem: ap && ap.status === 'approved' ? ap.item : '',
        report: r,
        sessions: (grouped.get(date) || []).map(s => sessionRow(s, nowIso))
      };
      cell.dayStatus = AS.dayStatus(cell.sessions);
      Object.assign(cell, primaryOf(cell));
      cells.set(date, cell);
      list.push(cell);
    }
    // Tổng kết tháng (số ngày, số phút): chỉ đếm, không có số tiền
    const summary = {
      ok: 0,
      pending: 0,
      cutDays: 0,
      lateMin: 0,
      cutMin: 0,
      missing: 0,
      rejected: 0,
      absent: 0,
      isat: 0,
      leave: 0
    };
    const missing = []; // ngày cần để ý: ô Chờ xử lý (primaryOf) hoặc Bị từ chối, hoặc không chấm công nào
    for (const c of list) {
      const r = c.report;
      if (r && r.state === 'ok') {
        summary.ok++;
        summary.lateMin += r.late || 0;
        summary.cutMin += totalCut(r);
        if (totalCut(r)) summary.cutDays++;
      }
      if (c.kind === 'isat') summary.isat++;
      if (c.kind === 'leave') summary.leave++;
      if (c.status === 'pending') {
        summary.pending++;
        summary.missing++;
        missing.push(c);
      }
      if (c.dayStatus === 'rejected') {
        summary.rejected++;
        summary.missing++;
        missing.push(c);
      }
      if (r && r.state === 'absent' && !c.sessions.length) {
        summary.absent++;
        summary.missing++;
        missing.push(c);
      }
    }
    missing.sort((a, b) => b.date.localeCompare(a.date));
    return { month, today, cutRule, cells, list, summary, missing };
  }

  /* Trạng thái chính của ô: { status, label, tone, tag, marks }. Ngày có lượt: status là nhãn của ngày (cell.dayStatus), tone pend
     (Chờ xử lý), err (Bị từ chối), ok (còn lại). Ngày chưa có lượt mà báo cáo giờ công cần Admin xử lý (MISSING_STATES) cũng là
     Chờ xử lý. Còn lại tone là lớp màu của ô lịch: ok (nền xám), hol (lễ), miss (không có chấm công),
     gold (iSAT, phép năm), soft (nghỉ được duyệt, sẽ bù), grey (nghỉ không lương), off (ngày nghỉ theo lịch), sun (Chủ nhật),
     fut (chưa tới). tag là nhãn nhỏ in hoa (OT, BÙ) của ngày đã khai chưa có lượt. Ngày chưa có lượt mà yêu cầu nghỉ (LEAVE_ITEMS)
     đang chờ hoặc bị từ chối: ô ghi Chờ (pend) hoặc Từ chối (err), mã leave-pending / leave-rejected (không phải nhãn chấm công).
     Yêu cầu OT, làm bù, đi làm ngày lễ chưa duyệt chỉ là dấu (marks) và dòng "Đã khai" trong ô ngày (describeDay). */
  function primaryOf(c) {
    const r = c.report;
    const marks = [];
    if (c.approval) marks.push(c.approval.status === 'rejected' ? 'rejected' : 'pending');
    if (c.extraKind === 'ot') marks.push('ot');
    if (c.extraKind === 'makeup') marks.push('makeup');
    const out = (status, label, tone, tag = '') => ({ status, label, tone, tag, marks });
    if (c.dayStatus) return out(c.dayStatus, dayCellLabel(c.dayStatus), DAY_CELL_TONE[c.dayStatus] || 'ok');
    if (r && r.state === 'absent') return out('absent', 'Vắng', 'miss');
    if (c.approval && LEAVE_ITEMS.has(c.approval.item) && c.approval.status === 'rejected')
      return out('leave-rejected', 'Từ chối', 'err');
    if (c.approval && LEAVE_ITEMS.has(c.approval.item) && c.approval.status === 'pending')
      return out('leave-pending', 'Chờ', 'pend');
    if (r && MISSING_STATES.has(r.state)) return out('pending', dayCellLabel('pending'), DAY_CELL_TONE.pending);
    if (c.holiday && c.scheduled) return out('holiday', 'Lễ', 'hol');
    if (c.kind === 'isat') return out('isat', 'iSAT', 'gold');
    if (c.kind === 'leave') return out('leave', 'Phép', 'gold');
    if (c.kind === 'approved') return out('approved', 'Nghỉ', 'soft');
    if (c.kind === 'unpaid' || c.kind === 'noshow') return out('unpaid', 'Nghỉ', 'grey');
    if (c.kind === 'willmakeup') return out('willmakeup', 'Sẽ bù', 'soft');
    if (c.kind === LEGACY_MAKEUP) return out('legacy', 'Không tính', 'grey');
    // Ngày khai mà không có chấm công: không tính tiền (ActualHours.apply); ô không được trông như ngày đủ công
    if (r && r.state === 'no-checkin') return out('nocheckin', 'Không công', 'miss');
    if (c.extraKind === 'ot') return out('ot', '', 'ok', 'OT');
    if (r && r.state === 'ok') return out('ok', '', 'ok', c.extraKind === 'makeup' ? 'BÙ' : '');
    if (r && r.state === 'declared-wins') return out('declared-wins', '', 'ok');
    if (!c.scheduled) return c.dow === 0 ? out('rest', '', 'sun') : out('rest', 'Nghỉ', 'off');
    if (c.future) return out('future', '', 'fut');
    return out('plain', '', 'ok');
  }

  /* ---------- mô tả một ngày cho khung chi tiết ---------- */
  // Trả { title, pill:{tone,text}, shift, rows:[{k,v,tone}], sessions, notes:[{tone,text}], badges }
  function describeDay(cell, ctx) {
    const { me, cutRule } = ctx;
    const r = cell.report;
    const first = cell.sessions.find(x => x.shiftCode);
    const shift = shiftInfo((r && r.shiftCode) || (first && first.shiftCode) || me.shiftCode || '');
    const out = {
      date: cell.date,
      title: `${weekdayLong(cell.date)}, ${dmy(cell.date)}`,
      pill: null,
      shift: shift ? shift.label : cell.scheduled ? 'Chưa gán ca cố định' : 'Ngoài lịch làm việc',
      rows: [],
      sessions: cell.sessions,
      notes: [],
      badges: []
    };

    // Loại ngày đã khai; trạng thái xử lý của Admin với khoản đã khai là dòng dữ liệu "Đã khai", không phải nhãn
    if (cell.holiday) out.badges.push({ tone: 'holiday', text: 'Ngày lễ' });
    const declared = text => out.rows.push({ k: 'Đã khai', v: text, tone: '' });
    if (cell.approval) {
      if (cell.approval.status === 'rejected') {
        declared(`${cell.approval.label}: bị từ chối`);
        out.notes.push({
          tone: 'bad',
          text: cell.approval.note
            ? `Lý do từ chối: ${cell.approval.note}`
            : 'Admin từ chối yêu cầu này và chưa ghi lý do. Hỏi Admin để biết thêm.'
        });
      } else {
        declared(`${cell.approval.label}: chờ xử lý`);
        out.notes.push({
          tone: 'warn',
          text: 'Yêu cầu này chưa được Admin đồng ý nên chưa tính vào thu nhập.'
        });
      }
    } else if (cell.approvedItem) {
      declared(`${ITEM_LABEL[cell.approvedItem] || cell.approvedItem}: được phê duyệt`);
    } else {
      if (cell.kind && KIND_LABEL[cell.kind] && cell.kind !== 'work')
        out.badges.push({ tone: 'kind', text: KIND_LABEL[cell.kind] });
      if (cell.extraKind)
        out.badges.push({ tone: 'kind', text: cell.extraKind === 'ot' ? 'Có OT' : 'Có làm bù theo giờ' });
    }

    // Trạng thái chấm công
    const st = r && r.state;
    const missingNote = () => {
      out.rows.push({ k: 'Công ngày này', v: 'Chờ Admin xử lý', tone: 'warn' });
      out.notes.push({
        tone: 'warn',
        text: ADMIN_FIX
      });
    };
    if (st && MISSING_STATES.has(st)) {
      out.pill = { tone: 'pending', text: AS.LABEL.pending };
      if (st === 'forgot-in') out.rows.push({ k: 'Check-in', v: 'Không có dữ liệu', tone: 'bad' });
      if (st === 'forgot-out') out.rows.push({ k: 'Check-out', v: 'Không có dữ liệu', tone: 'bad' });
      missingNote();
    } else if (st === 'absent') {
      out.pill = { tone: 'rejected', text: 'Chưa có chấm công' };
      out.rows.push({ k: 'Công ngày này', v: 'Tính là ngày nghỉ', tone: 'warn' });
      out.notes.push({
        tone: 'warn',
        text: `Không có lượt chấm công nào. ${ADMIN_FIX}`
      });
    } else if (st === 'ok') {
      const cut = totalCut(r);
      out.rows.push({
        k: 'Công ngày này',
        v: cut ? `${fmtMin(r.paidMin)} (đã trừ ${fmtMin(cut)})` : r.paidMin ? fmtMin(r.paidMin) : '1 ngày',
        tone: ''
      });
      if (!r.late && !r.early) out.rows.push({ k: 'Vào muộn, về sớm', v: '0 phút', tone: '' });
      if (r.late) {
        const n = lateNote(r.late, cutRule);
        out.rows.push({
          k: 'Vào muộn',
          v: r.cutStartMin ? `${r.late} phút · trừ ${fmtMin(r.cutStartMin)}` : `${r.late} phút · không trừ`,
          tone: r.cutStartMin ? 'warn' : ''
        });
        if (n && !r.cutStartMin) out.notes.push({ tone: 'info', text: n.text });
      }
      if (r.early)
        out.rows.push({
          k: 'Về sớm',
          v: r.cutEndMin ? `${r.early} phút · trừ ${fmtMin(r.cutEndMin)}` : `${r.early} phút · không trừ`,
          tone: r.cutEndMin ? 'warn' : ''
        });
      if (r.gapMin)
        out.rows.push({
          k: 'Khoảng trống giữa các lượt',
          v: r.gapCutMin ? `${r.gapMin} phút · trừ ${fmtMin(r.gapCutMin)}` : `${r.gapMin} phút · không trừ`,
          tone: r.gapCutMin ? 'warn' : ''
        });
    } else if (st === 'off-schedule') {
      out.rows.push({ k: 'Công ngày này', v: 'Không tính tiền', tone: 'muted' });
      out.notes.push({
        tone: 'warn',
        text: 'Bạn chấm công ngoài lịch làm việc. Không tính tiền nếu chưa có OT hoặc làm bù được Admin đồng ý.'
      });
    } else if (st === 'no-checkin') {
      out.pill = { tone: 'draft', text: 'Không chấm công' };
      out.notes.push({ tone: 'warn', text: r.note });
    } else if (st === 'declared-wins' || st === 'undeclared-punch') {
      out.pill = { tone: 'draft', text: 'Có chấm công' };
      out.notes.push({ tone: 'info', text: r.note });
    } else if (cell.holiday) {
      out.pill = { tone: 'holiday', text: 'Ngày lễ' };
    } else if (!cell.scheduled) {
      out.pill = { tone: 'draft', text: 'Ngày nghỉ' };
    } else if (cell.future) {
      out.pill = { tone: 'draft', text: 'Chưa tới ngày' };
    } else if (!cell.sessions.length) {
      out.pill = { tone: 'draft', text: 'Chưa có chấm công' };
    }
    // Ngày có lượt Check-in/out: nhãn là nhãn của ngày do máy chủ tính; khoản đã khai (OT, làm bù, đi làm ngày lễ, nghỉ) và trạng thái
    // duyệt của nó là dữ liệu trong khung, không phải nhãn
    if (cell.dayStatus) {
      out.pill = { tone: AS.TONE[cell.dayStatus], text: AS.LABEL[cell.dayStatus] };
      const kinds = out.badges.filter(b => b.tone !== 'holiday');
      out.rows.unshift(...kinds.map(b => ({ k: 'Đã khai', v: b.text, tone: '' })));
      out.badges = out.badges.filter(b => b.tone === 'holiday');
    }
    if (!out.pill && out.badges.length) out.pill = { tone: 'draft', text: out.badges[0].text };
    return out;
  }

  /* ---------- trạng thái chấm công hôm nay ---------- */
  // punch: kết quả GET /api/punch. Trả { mode, shift, message, ... }
  //   mode: loading | noshift | window | open | ready. Check-in luôn bật;
  //   noshift, window: vẫn cho bấm (parts.js), lượt đó chờ Admin xử lý.
  //   blocked: câu của máy chủ (punch.checkInBlock) khi ngày công lúc này không có lịch hay khoản OT / làm bù được duyệt: nút Check-in tắt.
  function punchView({ me, punch, nowIso, geofenceRequired }) {
    const shift = shiftInfo(me && me.shiftCode);
    const today = vnDate(nowIso);
    const base = { shift, today, geofenceRequired: !!geofenceRequired, offScheduleToday: false, forgotOut: false };
    if (!punch) return { ...base, mode: 'loading' };
    const open = punch.openSession || null;
    if (!open && typeof punch.checkInBlock === 'string') base.blocked = punch.checkInBlock;
    if (open) {
      const e = open.entry || {};
      const since = e.presIn || '';
      const planned = e.plannedShift || null;
      const forgot = !!since && PR.forgotOut(since, nowIso);
      const warn = planned ? PR.checkoutWarning({ plannedShift: planned }, nowIso) : null;
      // Vào sớm hay muộn so với giờ vào ca: chỉ để hiện chữ ("sớm 2 phút"), theo phút đồng hồ đang hiện; phút muộn lấy từ luật dùng chung PunchRules
      const startMs = planned && Date.parse(planned.startIso);
      const inMinute = since ? Math.floor(Date.parse(since) / 60000) : NaN;
      const early = Number.isFinite(startMs) && Number.isFinite(inMinute) ? startMs / 60000 - inMinute : 0;
      return {
        ...base,
        mode: 'open',
        earlyMin: early > 0 ? Math.round(early) : 0,
        lateMin: early > 0 || !planned || !since ? 0 : PR.lateMin(planned.code, since),
        sessionId: open.id,
        version: open.version,
        since,
        sinceHm: since ? vnTime(since) : '',
        sinceDate: since ? vnDate(since) : '',
        workDate: open.date,
        // nhãn và lý do ngắn của lượt đang mở, do máy chủ tính (GET /api/punch openSession)
        status: AS.statusOf(open),
        statusNote: AS.noteOf(open),
        // ca đêm qua nửa đêm: ca thuộc ngày bắt đầu, khác ngày hôm nay
        acrossMidnight: !!open.date && open.date !== today,
        outsideShift: !!e.outsideShift,
        outsideZone: e.outsideZone === true,
        shiftNow: planned ? shiftInfo(planned.code) : null,
        workedMin: since ? Math.max(0, Math.round((Date.parse(nowIso) - Date.parse(since)) / 60000)) : 0,
        forgotOut: forgot,
        earlyWarning: warn
      };
    }
    if (!shift) return { ...base, mode: 'noshift', message: PR.checkInMsg(me && me.shiftCode, nowIso) };
    const msg = PR.checkInMsg(me.shiftCode, nowIso);
    const workDate = PR.workDate(me.shiftCode, nowIso);
    // máy chủ báo ngày công này có nằm trong lịch không (punchState.scheduled); chưa có thì tra lịch đã nạp
    const offSchedule = typeof punch.scheduled === 'boolean' ? !punch.scheduled : !isScheduled(me, workDate);
    if (msg) {
      // Khung Check-in "từ HH:MM đến trước HH:MM" đọc từ câu của PunchRules; opensLater: khung của lần ca gần nhất chưa mở (chưa tới giờ)
      const m = /từ (\d{2}:\d{2}) đến trước (\d{2}:\d{2})/.exec(msg);
      const plan = PR.planShift({ shiftCode: me.shiftCode, isWorkDay: () => true }, workDate);
      const opensLater = !!(m && plan && Date.parse(nowIso) < Date.parse(plan.startIso));
      return {
        ...base,
        mode: 'window',
        message: msg,
        windowFrom: m ? m[1] : '',
        windowTo: m ? m[2] : '',
        opensLater,
        offScheduleToday: offSchedule
      };
    }
    return { ...base, mode: 'ready', offScheduleToday: offSchedule, workDate };
  }

  /* ---------- danh sách yêu cầu (khoản tự khai chờ duyệt) ---------- */
  function approvalList(approvals) {
    const out = [];
    for (const [date, a] of Object.entries(approvals || {})) {
      if (!a) continue;
      out.push({
        date,
        item: a.item,
        holiday: !!a.holiday,
        label: a.holiday ? 'OT ngày lễ' : ITEM_LABEL[a.item] || String(a.item || ''),
        status: a.status,
        note: a.note || '',
        decidedBy: a.decidedBy || ''
      });
    }
    const rank = { pending: 0, rejected: 1, approved: 2 };
    out.sort((x, y) => (rank[x.status] ?? 3) - (rank[y.status] ?? 3) || y.date.localeCompare(x.date));
    return out;
  }

  /* ---------- khai lịch ước tính (PUT /api/sheet) và KPI tự đánh giá ----------
     Chỉ dựng dữ liệu, nhãn và gợi ý. Mọi kiểm tra nghiệp vụ (giới hạn OT, số dư phép, ca cố định, kỳ đã khoá) do máy chủ làm;
     câu báo lỗi của máy chủ được hiện nguyên văn. Quyền lợi theo loại nhân sự đọc từ PayrollParams.DEFAULTS (type.<loại>.benefit.*),
     cùng nguồn với approval-view.js; không có con số nghiệp vụ nào ở đây. */
  const DEF = (PP && PP.DEFAULTS) || {};
  /* Cờ quyền lợi của chính mình do máy chủ gửi (GET /api/me → benefits). Có thì thắng; thiếu cờ nào (hoặc máy chủ chưa gửi)
     thì suy từ loại nhân sự. Chức vụ do C&B thêm không có trong PayrollParams.DEFAULTS nên chỉ đúng khi có cờ này. */
  let serverBenefits = null;
  let serverLabel = ''; // nhãn chức vụ của chính mình (GET /api/me → positionLabel)
  const setBenefits = (b, label) => {
    serverBenefits = b && typeof b === 'object' ? b : null;
    serverLabel = typeof label === 'string' ? label : '';
  };
  const flagOf = (name, fallback) =>
    serverBenefits && typeof serverBenefits[name] === 'boolean' ? serverBenefits[name] : fallback;
  const benefitsOf = type => ({
    ot: flagOf('ot', !!DEF[`type.${type}.benefit.ot`]),
    makeup: flagOf('makeup', !!DEF[`type.${type}.benefit.makeup`]),
    paidLeave: flagOf('paidLeave', !!DEF[`type.${type}.benefit.paidLeave`]),
    isat: flagOf('isat', !!DEF[`type.${type}.benefit.isat`]),
    kpi: flagOf('kpi', !!DEF[`type.${type}.benefit.kpi`]),
    // "Nghỉ được duyệt" gắn với phụ cấp chuyên cần khi chưa có cờ
    approved: flagOf('approvedLeave', Number(DEF[`type.${type}.attendance`]) > 0)
  });
  // Có tài khoản phép năm (ô phép, thẻ Nghỉ phép): cờ leaveAccount của chức vụ do máy chủ gửi; chưa có cờ thì coi là có
  const hasLeaveAccount = me => flagOf('leaveAccount', !!me);

  /* Các loại ngày chọn được cho một ngày. existingKind: loại đã khai từ trước (giữ lại để xem và sửa dù không còn trong danh sách).
     Chọn được mọi loại ngày ở mọi ngày kể cả Chủ nhật, kèm ghi chú "ngoài lịch" hay "chức vụ chưa có quyền lợi này"; máy chủ cảnh báo khi lưu.
     forName: tên người được khai khi Admin khai thay (lời gợi ý nói về người đó, không nói "bạn").
     requestOnly: nhân viên tự gửi yêu cầu: không có mục "Đi làm" thường (ngày làm việc do lịch được gán quyết định); thay vào đó là mục
     OT / làm bù theo giờ (ngày đi làm kèm làm thêm, extraOnly: bắt buộc chọn loại làm thêm). Ngày lễ khai OT từ – đến; các loại nghỉ giữ nguyên.
     Trả thêm extraKinds: các loại làm thêm chọn được trong ngày đi làm ('ot', 'makeup'), cùng luật lọc. */
  function dayPlan({ me, date, holidays, existingKind, forName = '', requestOnly = false }) {
    const dow = dowOf(date);
    const benefits = benefitsOf(me && me.type);
    const inSched = isScheduled(me, date);
    const hol = inSched && (holidays || []).includes(date);
    const anyHoliday = (holidays || []).includes(date); // ngày lễ (trong hay ngoài lịch): không khai giờ làm bù
    const kinds = [];
    // Khai thay: người đang khai là Admin, nên "cần Admin đồng ý" thành "cần duyệt" (khoản người khai có quyền duyệt được duyệt luôn khi lưu)
    const forAdmin = text =>
      forName
        ? text
            .replace(/Cần Admin đồng ý/g, 'Cần duyệt')
            .replace(/cần Admin đồng ý/g, 'cần duyệt')
            .replace(/Chưa được đồng ý/g, 'Chưa được duyệt')
        : text;
    const add = (value, label, hint) => kinds.push({ value, label, hint: forAdmin(hint) });
    // Loại đã lưu từ trước nay không còn trong danh sách: vẫn hiện để xem, gửi lại không đổi thì máy chủ giữ nguyên
    const keepExisting = () => {
      if (existingKind && !kinds.some(x => x.value === existingKind))
        add(
          existingKind,
          KIND_LABEL[existingKind] || existingKind,
          existingKind === LEGACY_MAKEUP ? LEGACY_MAKEUP_HINT : 'Đã khai từ trước.'
        );
    };
    // Ngày ngoài lịch: ngày không khai không phải ngày đi làm, nên không dùng câu "vẫn tính đi làm"
    const workHint = inSched
      ? 'Ngày không khai vẫn tính đi làm theo Check-in/out. Chọn mục này khi cần khai OT hoặc làm bù theo giờ.'
      : `Tính theo ca của ${forName || 'bạn'}. Có thể kèm OT hoặc làm bù theo giờ.`;
    const no = flag => (flag ? '' : 'Chức vụ chưa có quyền lợi này.');
    const hint = (...bits) => bits.filter(Boolean).join(' ');
    // Ngày đi làm thường, hoặc (requestOnly) chỉ là chỗ chứa giờ OT / làm bù: nhãn theo các loại làm thêm chọn được
    const extraLabel = kinds =>
      kinds.includes('ot') && kinds.includes('makeup')
        ? 'OT hoặc làm bù theo giờ'
        : kinds.includes('ot')
          ? 'OT'
          : 'Làm bù theo giờ';
    const addWork = (text, extras, off = '') => {
      if (!requestOnly) return add('work', 'Đi làm', text);
      if (extras.length)
        add('work', extraLabel(extras), hint('Giờ làm thêm trước hoặc sau ca được gán. Cần Admin đồng ý.', off));
    };
    // Làm ngày lễ là OT: khai giờ OT từ – đến trong ngày lễ. Chức vụ không có quyền lợi OT không có mục này (vẫn hiện, kèm ghi chú)
    const holidayKinds = () => {
      add('holiday', 'Nghỉ lễ', 'Ngày lễ do Admin đặt, không cần khai. Chọn mục này để bỏ khai báo đã có.');
      add(
        'work',
        'OT',
        hint(
          'Khai giờ OT từ – đến trong ngày lễ, cần Admin đồng ý. Chỉ giờ có Check-in/out trong khung đã khai được tính, theo hệ số ngày lễ. Không Check-in/out hôm đó sẽ tính vắng, mất lương ngày lễ.',
          no(benefits.ot)
        )
      );
    };
    const OFF = !inSched ? 'Ngày ngoài lịch, chờ Admin xem lại.' : '';
    if (hol) holidayKinds();
    else addWork(hint(workHint, OFF), anyHoliday ? ['ot'] : ['ot', 'makeup'], OFF);
    // Ngày lễ trong lịch vẫn được trả lương ngày lễ, không trừ phép, không nợ giờ: không đưa các loại nghỉ (câu gợi ý nói trừ phép / không lương)
    if (!hol) {
      add('leave', 'Nghỉ phép năm', hint('Trừ vào phép còn lại, cần Admin đồng ý.', OFF, no(benefits.paidLeave)));
      add('unpaid', 'Nghỉ không lương', 'Không tính lương ngày này.');
      add('willmakeup', 'Nghỉ, sẽ làm bù', hint('Tính như nghỉ không lương; bù lại bằng giờ làm bù trong tháng.', OFF));
      add(
        'approved',
        'Nghỉ được duyệt',
        hint('Không lương, không tính vào chuyên cần. Cần Admin đồng ý.', OFF, no(benefits.approved))
      );
    }
    // iSAT chỉ hiện ở thứ Bảy và với chức vụ có quyền lợi iSAT
    if (benefits.isat && dow === 6)
      add('isat', 'iSAT, nghỉ thứ Bảy có lương', hint('Phúc lợi iSAT. Cần Admin đồng ý.', OFF));
    keepExisting();
    // Ngày lễ trong lịch: giờ OT là khung từ – đến của chính ngày (không có ô làm thêm riêng); giờ làm bù ngày lễ không khai được
    const extraKinds = hol ? [] : anyHoliday ? ['ot'] : ['ot', 'makeup'];
    return { editable: true, dow, hol, inSched, kinds, benefits, extraKinds, extraOnly: requestOnly && !hol };
  }

  const timeOf = v => (typeof v === 'string' && /^\d{2}:\d{2}$/.test(v) ? v : '');
  // Ca mặc định khi điền giờ: ca Admin gán, chưa gán thì ca Normal 1 của bảng ca dùng chung
  const defaultShift = me => shiftInfo(me && me.shiftCode) || shiftInfo(Object.keys(SHIFT_NAME)[0]);

  // Dựng biểu mẫu từ ngày đã khai (day) hoặc ngày trống. want: 'leave' | 'extra' | '' chọn sẵn khi mở từ nút "Gửi đơn nghỉ" / "Khai làm thêm".
  function formFromDay({ me, date, day, plan, want }) {
    const ex = day && typeof day === 'object' ? day : null;
    const has = v => plan.kinds.some(x => x.value === v);
    let kind = ex ? ex.kind || 'work' : '';
    if (!kind) {
      if (want === 'leave') kind = has('leave') ? 'leave' : has('unpaid') ? 'unpaid' : '';
      else if (want === 'extra') kind = has('work') ? 'work' : '';
      // Mục OT / làm bù của nhân viên chỉ chọn sẵn khi mở từ nút làm thêm; mở chung thì chọn sẵn loại đầu tiên khác
      if (!kind) kind = ((plan.extraOnly && plan.kinds.find(x => x.value !== 'work')) || plan.kinds[0]).value;
    }
    const shift = defaultShift(me);
    const form = {
      date,
      kind,
      existed: !!ex,
      preset: ex && ex.preset ? canonShift(ex.preset) : '',
      in: timeOf(ex && ex.in) || shift.in,
      out: timeOf(ex && ex.out) || shift.out,
      extraKind: ex ? ex.extraKind || (ex.extraOut ? 'makeup' : '') : '',
      extraIn: ex ? timeOf(ex.extraIn) : '',
      extraOut: ex ? timeOf(ex.extraOut) : '',
      breakMin: ex && Number.isFinite(ex.breakMin) ? ex.breakMin : 0,
      makeupPlans:
        ex && ex.kind === 'willmakeup'
          ? Array.isArray(ex.makeupPlans)
            ? ex.makeupPlans.map(plan => ({ date: plan.date || '', from: plan.from || '', to: plan.to || '' }))
            : ex.makeupDate
              ? [{ date: ex.makeupDate, from: '', to: '' }]
              : [{ date: '', from: '', to: '' }]
          : [],
      punchNote: ex && typeof ex.punchNote === 'string' ? ex.punchNote : ''
    };
    // Mục OT / làm bù của nhân viên (plan.extraOnly) luôn có loại làm thêm, kể cả ngày đi làm đã khai từ trước không kèm làm thêm
    if (kind === 'work' && !form.extraKind && ((!ex && want === 'extra') || plan.extraOnly))
      form.extraKind = (plan.extraKinds || [])[0] || '';
    return form;
  }
  // Biểu mẫu → ngày gửi lên máy chủ; null = bỏ khai báo (Nghỉ lễ là không có bản ghi)
  function dayFromForm(form) {
    const kind = form.kind;
    if (!kind || kind === 'holiday') return null;
    // Giải trình Check-in/out (tuỳ chọn) đi kèm mọi loại ngày.
    const punchNote = typeof form.punchNote === 'string' ? form.punchNote.trim() : '';
    if (kind !== 'work' && kind !== LEGACY_MAKEUP) {
      const other = { kind };
      if (kind === 'willmakeup') other.makeupPlans = (form.makeupPlans || []).map(plan => ({ ...plan }));
      if (punchNote) other.punchNote = punchNote;
      return other;
    }
    // Ngày loại cũ 'makeup' gửi lại đúng giờ đã lưu (không có ô sửa) để máy chủ coi là không đổi
    const day = { kind, in: form.in, out: form.out, breakMin: Math.round(Number(form.breakMin) || 0) };
    if (punchNote) day.punchNote = punchNote;
    if (form.preset) day.preset = form.preset;
    if (kind === 'work' && form.extraKind) {
      day.extraKind = form.extraKind;
      if (form.extraIn) day.extraIn = form.extraIn;
      if (form.extraOut) day.extraOut = form.extraOut;
    }
    return day;
  }
  // Kiểm cấu trúc (thiếu ô) và luật máy chủ chặn: giờ làm bù vào ngày lễ (cùng câu với lib/domain/sheet-checks.js). Còn lại máy chủ báo.
  // holidays: ngày lễ của tháng (GET /api/sheet → holidays)
  function checkDayForm(form, holidays) {
    if (!form.kind) return 'Chọn loại ngày.';
    const hol = new Set(holidays || []);
    const planned = form.kind === 'willmakeup' ? (form.makeupPlans || []).map(plan => plan.date) : [];
    const makeupOn = [...(form.kind === 'work' && form.extraKind === 'makeup' ? [form.date] : []), ...planned].find(
      d => d && hol.has(d)
    );
    if (makeupOn) return `Ngày ${dm(makeupOn)} là ngày lễ: không khai làm bù vào ngày lễ.`;
    if (form.kind !== 'work') return '';
    if (!form.in || !form.out) return 'Nhập đủ giờ vào và giờ ra.';
    if (form.extraKind && !form.extraIn && !form.extraOut)
      return 'Chọn giờ vào làm thêm (trước ca) hoặc giờ ra làm thêm (sau ca).';
    return '';
  }
  // Đưa ca được gán vào biểu mẫu (đổi sang Đi làm, hoặc chọn làm thêm trên "Giờ đã lưu" khác ca): máy chủ so giờ làm thêm với giờ vào / ra
  // của ngày, nên giờ của ngày loại cũ đã lưu (vd. 20:00–09:00) không được giữ làm ca. Chưa gán ca thì giữ giờ đang có.
  function toAssignedShift(form, me) {
    const given = me && me.shiftCode ? shiftInfo(me.shiftCode) : null;
    if (given) Object.assign(form, { in: given.in, out: given.out, preset: given.code });
  }
  // Khoản cần Admin duyệt của bản nháp (null nếu không): dùng đúng luật của ApprovalView
  function approvalOfForm(form, { me, holidays }) {
    const day = dayFromForm(form);
    const found = day ? AV.itemOf(day, { date: form.date, holidays: holidays || [], staffType: me && me.type }) : null;
    return found
      ? {
          item: found.item,
          holiday: !!found.holiday,
          label: found.holiday ? 'OT ngày lễ' : ITEM_LABEL[found.item] || found.item
        }
      : null;
  }

  /* KPI: nhãn năm thành phần (Admin nhập 5 điểm). */
  const KPI_PART_LABEL = {
    wework: 'Base Wework',
    user: 'Người dùng',
    peer: 'Đồng nghiệp',
    manager: 'Quản lý trực tiếp',
    self: 'Tự đánh giá'
  };
  /* Năm thành phần và trọng số: trọng số là số của máy chủ (GET /api/sheet → kpiWeights { khoá: % }, theo tham số kpi.weight.* của tháng),
     không lấy từ bảng tĩnh. Chưa có số của máy chủ thì chỉ biết tên thành phần (weight null: không hiện trọng số). */
  const kpiParts = weights =>
    weights && typeof weights === 'object' && Object.keys(weights).length
      ? Object.entries(weights).map(([key, w]) => ({ key, weight: Number.isFinite(w) ? w : null }))
      : KS && KS.COMPONENTS
        ? KS.COMPONENTS.map(c => ({ key: c.key, weight: null }))
        : [];

  return {
    benefitsOf,
    setBenefits,
    hasLeaveAccount,
    dayPlan,
    formFromDay,
    dayFromForm,
    checkDayForm,
    toAssignedShift,
    approvalOfForm,
    defaultShift,
    kpiParts,
    KPI_PART_LABEL,
    SHIFT_NAME,
    DOW_SHORT,
    DOW_LONG,
    ITEM_LABEL,
    KIND_LABEL,
    attentionText,
    ADMIN_FIX,
    OUTSIDE_ZONE,
    pad,
    isDate,
    dowOf,
    dmy,
    dm,
    vnDate,
    vnTime,
    daysInMonth,
    addDays,
    addMonths,
    mondayOf,
    monthLabel,
    weekdayLong,
    fmtMin,
    fmtDistance,
    shiftInfo,
    scheduleOf,
    isScheduled,
    setScheduleInfo,
    workdaysStdOf,
    scheduleText,
    greeting,
    givenName,
    roleLine,
    levelName,
    lateNote,
    earlyNote,
    totalCut,
    geoServerError,
    GEO_TEXT,
    groupSessions,
    groupSessionsKey: workDateOf,
    sessionRow,
    buildMonth,
    describeDay,
    punchView,
    approvalList
  };
});
