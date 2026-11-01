// KHỐI CÔNG THỨC LƯƠNG ĐÃ ĐÓNG BĂNG (S0 của kế hoạch backend v4, docs/architecture/2026-10-15-backend-v4.md mục 5.4).
// Nguồn: src/engine/index.html từ khai báo TYPES đến mốc Lịch, chép tại commit 9cf7f6a (lần sửa cuối của index.html: b63d623), ngày 15/10/2026.
// Chỉ bỏ 6 ký tự thụt đầu dòng và để Prettier định dạng lại; không đổi chữ nào của mã. KHÔNG SỬA FILE NÀY.
// File này không được require: test/helpers/payroll-vm.js chạy nó trong vm sau payroll-calendar.js và kpi-score.js. Từ 16/10/2026 src/engine/index.html
// đã bị xoá, nên đây là bản duy nhất còn lại của khối công thức cũ: bộ máy đang chạy (src/engine/payroll-engine.ts) được so với nó bởi
// payroll-engine-differential.test.js và payroll-golden.test.js. Giữ file này; test/fixtures/payroll-golden-v0.json ở lại cùng nó.
const TYPES = {
  tts: {
    label: 'Thực tập sinh',
    short: 'TTS',
    workdays: 22,
    dows: [1, 2, 3, 4, 5],
    extraDows: [6],
    makeup: true,
    kpi: false,
    paidHoliday: false,
    paidLeave: false,
    levels: {
      1: { name: 'Explorer', base: 1000000 },
      2: { name: 'Learner', base: 1500000 },
      3: { name: 'Trainee', base: 2000000 },
      4: { name: 'Advanced Trainee', base: 3000000 },
      5: { name: 'Senior Trainee', base: 4000000 },
      6: { name: 'Practitioner in Training', base: 5000000 }
    }
  },
  ctv: {
    label: 'Chuyên trách viên',
    short: 'CTV',
    workdays: 26,
    dows: [1, 2, 3, 4, 5, 6],
    extraDows: [],
    makeup: true,
    ot: true,
    kpi: true,
    kpiPass: 75,
    paidHoliday: true,
    paidLeave: true,
    levels: {
      1: { name: 'Fresher', base: 6000000, kpi: 1500000 },
      2: { name: 'Practitioner', base: 6000000, kpi: 3000000 },
      3: { name: 'Advanced Practitioner', base: 6000000, kpi: 4500000 },
      4: { name: 'Senior Practitioner', base: 6000000, kpi: 6000000 }
    }
  },
  nv: {
    label: 'Nhân viên',
    short: 'NV',
    workdays: 26,
    dows: [1, 2, 3, 4, 5, 6],
    extraDows: [],
    ot: true,
    kpi: true,
    kpiPass: 75,
    paidHoliday: true,
    paidLeave: true,
    flexBonus: 0.2,
    nightOptions: [40, 60],
    travel: 0.15,
    attendance: 0.25,
    maxAbsent: 3,
    makeup: true,
    isat: true,
    levels: {
      1: { name: 'Nhân viên', base: 6000000, kpi: 6000000 },
      2: { name: 'Chuyên viên', base: 6500000, kpi: 6500000 },
      3: { name: 'Lead', base: 7000000, kpi: 7000000 },
      4: { name: 'HDO (Human Development Officer)', base: 7500000, kpi: 7500000 }
    }
  }
};
/* Phụ cấp ca theo loại nhân sự (Night của Nhân viên do Admin chọn 40% hoặc 60% theo profession) */
function bonusOf(staff, shift) {
  const T = typeOf(staff);
  if (shift === 'flex') return T.flexBonus ?? SHIFTS.flex.bonus;
  if (shift === 'night')
    return T.nightOptions ? (Number(staff.nightPct) || T.nightOptions[0]) / 100 : SHIFTS.night.bonus;
  return 0;
}
const HOURS = 8;
const NIGHT_BREAK = 0.3; // giờ nghỉ bắt buộc rơi trong khung 22h–6h: lương giờ + 30% (cố định cho mọi nhóm)
const MAX_SPAN = 9; // giờ vào – giờ ra tối đa 9 tiếng (8 làm + 1 nghỉ); giờ làm thêm tính từ giờ ra
const OVER_LIMIT = 24; // số giờ vượt ngưỡng: từ 24 giờ là mất chuyên cần (NV); trên 24 giờ thì lương KPI nhân tỷ lệ ngày đilàm
/* Bảo hiểm bắt buộc & thuế TNCN (ước tính) cho tháng lương năm 2026. Mọi tham số luật gom ở đây; căn cứ và hiệu lực
   xem docs/THUE-BH-2026.md. Khi luật đổi chỉ cần sửa số trong bảng này. */
const TAX_RULES = {
  insurance: { bhxh: 0.08, bhyt: 0.015, bhtn: 0.01 }, // người lao động đóng trên lương cơ bản (tổng 10,5%) — Luật BHXH 2024, NĐ 188/2025, Luật Việc làm 2025
  employer: { bhxh: 0.175, bhyt: 0.03, bhtn: 0.01 }, // công ty đóng thêm 21,5%, chỉ để tham khảo (không trừ vào lương)
  insuranceCap: { bhxh: 50600000, bhyt: 50600000, bhtn: 106200000 }, // trần lương đóng: BHXH/BHYT 20 × lương cơ sở 2.530.000 (NĐ 161/2026, từ 01/7/2026); BHTN 20 × lương tối thiểu vùng I 5.310.000 (NĐ 293/2025)
  insuranceSkipDays: 14, // nghỉ không lương từ 14 ngày làm việc trở lên trong tháng thì tháng đó không đóng BH
  personal: 15500000, // giảm trừ bản thân / tháng — NQ 110/2025/UBTVQH15, từ kỳ tính thuế 2026
  dependant: 6200000, // giảm trừ mỗi người phụ thuộc / tháng — NQ 110/2025/UBTVQH15 (mức cũ 4,4 triệu hết áp dụng từ 2026)
  brackets: [
    [10e6, 0.05],
    [30e6, 0.1],
    [60e6, 0.2],
    [100e6, 0.3],
    [Infinity, 0.35]
  ], // biểu lũy tiến 5 bậc theo thu nhập tính thuế / tháng — Luật 109/2025/QH15 Điều 9
  casualRate: 0.1,
  casualThreshold: 5000000, // HĐ dưới 3 tháng / không HĐ: khoản chi từ 5 triệu trở lên khấu trừ 10% trên toàn bộ — NĐ 253/2026 Điều 50 khoản 2
  // Miễn thuế tiền lương làm đêm, làm thêm giờ (Luật 109/2025 Điều 4 khoản 8, NĐ 253/2026 Điều 26): miễn toàn bộ tiền lương của giờ làm đêm / OT
  // nhưng chỉ đến mức tối thiểu luật lao động; phần trả cao hơn mức này chịu thuế.
  nightPremium: 0.3, // làm đêm: lương giờ × (1 + 30%) cho mỗi giờ làm thực tế trong 22h–6h
  otNormalRate: 1.5, // OT ngày thường: tối đa 150% lương giờ được miễn (app trả 200%, phần 50% chịu thuế)
  holidayRate: 3.0,
  holidayNightAdd: 0.9, // làm ngày lễ: 300% lương giờ; giờ đêm ngày lễ thêm 30% + 20% × 300% (= 390%)
  advanceRate: 0.8,
  advanceUntil: 15 // tạm ứng (quy chế công ty): 80% lương cơ bản thực nhận từ ngày 1 đến ngày 15
};
/* Ca cố định do Admin gán cho từng nhân sự; khi chấm công chọn ca sẽ điền sẵn giờ vào/ra, vẫn sửa được theo ngày */
const PRESETS = {
  n1: { label: 'Normal shift 1', in: '08:00', out: '17:00' },
  n2: { label: 'Normal shift 2', in: '10:00', out: '19:00' },
  f1: { label: 'Flex shift 1', in: '06:00', out: '15:00' },
  f2: { label: 'Flex shift 2', in: '13:00', out: '22:00' },
  g1: { label: 'Night shift 1', in: '21:00', out: '06:00' },
  g2: { label: 'Night shift 2', in: '22:00', out: '07:00' }
};
const SHIFTS = {
  normal: { label: 'Normal', bonus: 0, hint: 'Trong giờ hành chính' },
  flex: { label: 'Flex', bonus: 0.1, hint: 'Bắt đầu lúc 6h sáng hoặc kết thúc lúc 22h' },
  night: {
    label: 'Night',
    bonus: 0.3,
    hint: 'Có giờ làm trong khung 22h–6h · giờ nghỉ giữa ca trong 22h–6h được trả lương giờ + 30%'
  }
};
const DOWN = ['CN', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
const NOTE_TTS =
  'Tổng thu nhập là số trước khấu trừ; mục Khấu trừ & thực lĩnh ước tính bảo hiểm bắt buộc, thuế thu nhập cá nhân và tạm ứng.';
const NOTE_CTV =
  'Lương KPI còn phụ thuộc vào các yếu tố đánh giá chất lượng từ người dùng, từ cấp trên… nên con số ở đây là tạm tính theo tự đánh giá. Tổng thu nhập là số trước khấu trừ; mục Khấu trừ & thực lĩnh ước tính BHXH, BHYT, BHTN, thuế thu nhập cá nhân và tạm ứng.';
const VND = n => (Math.round(n) || 0).toLocaleString('vi-VN') + ' ₫'; // ||0: không hiện "-0 ₫"
const VNDs = n => (n < -0.5 ? '−' + VND(-n) : VND(n)); // số có thể âm (thực lĩnh): dấu trừ chuẩn
const H = n => n.toLocaleString('vi-VN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const esc = s =>
  String(s ?? '').replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
const typeOf = s => TYPES[s.type] || TYPES.tts;
const levelOf = s => typeOf(s).levels[s.level] || { name: '?', base: 0 };

/* ===================== Công thức lương ===================== */
function toMin(t) {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
/* Ca làm việc xác định bắt buộc theo giờ: chạm khung 22h–6h → Night; vào 6h00–6h59 hoặc ra lúc 22h → Flex; còn lại Normal */
function overlapsNight(a, b) {
  if (a == null || b == null) return false;
  let e = b;
  if (e <= a) e += 1440;
  for (let t = a; t < e; t += 1) {
    const x = t % 1440;
    if (x >= 1320 || x < 360) return true;
  }
  return false;
}
function shiftFor(tin, tout) {
  const a = toMin(tin),
    b = toMin(tout);
  if (a == null || b == null) return 'normal';
  if (overlapsNight(a, b)) return 'night';
  if (a < 420 || b >= 1320) return 'flex';
  return 'normal';
}
function spanHours(d) {
  const a = toMin(d.in),
    b = toMin(d.out);
  if (a == null || b == null) return 0;
  let diff = b - a;
  if (diff <= 0) diff += 24 * 60;
  return diff / 60;
} // ca đêm qua ngày hôm sau
/* Mỗi 4 tiếng làm bắt buộc nghỉ 1 tiếng: từ tổng thời gian có mặt tính ra giờ làm thực (khối 4 làm + 1 nghỉ); ca đêm giữ quy tắc 1 giờ nghỉ có lương riêng */
function breakHours(span) {
  return Math.max(0, span - (4 * Math.floor(span / 5) + Math.min(4, span % 5)));
} // số giờ nghỉ bắt buộc trong thời gian có mặt (1 giờ sau mỗi 4 giờ làm)
/* Các khoảng nghỉ bắt buộc: sau mỗi 4 giờ làm nghỉ 1 giờ. Phần nghỉ rơi trong khung 22h–6h được trả lương giờ + 30%; phần còn lại không lương. */
const fmtMin = t => {
  t = ((t % 1440) + 1440) % 1440;
  return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
};
/* Ca chính (giờ vào → giờ ra) và từng đoạn làm thêm (trước ca: giờ vào làm thêm → giờ vào; sau ca: giờ ra → giờ ra làm thêm) tính giờ nghỉ RIÊNG:
   trong mỗi đoạn, cứ đủ 4 giờ làm liên tục thì nghỉ 1 giờ. Giờ nghỉ rơi trong khung 22h–6h được trả lương giờ + 30%, ngoài khung không lương. */
function totalEnd(d) {
  return d.extraKind && d.extraOut ? d.extraOut : d.out;
}
const MAX_EXTRA = 12; // mỗi đoạn làm thêm tối đa 12 tiếng
function preSpan(d) {
  return d.extraKind && d.extraIn && d.in && d.extraIn !== d.in ? spanHours({ in: d.extraIn, out: d.in }) : 0;
} // giờ làm thêm trước ca (có mặt)
function postSpan(d) {
  return d.extraKind && d.extraOut && d.out && d.extraOut !== d.out ? spanHours({ in: d.out, out: d.extraOut }) : 0;
} // giờ làm thêm sau ca (có mặt)
function breakSlots(d) {
  const a = toMin(d.in);
  if (a == null || !spanHours(d)) return [];
  const mainEnd = a + spanHours(d) * 60,
    slots = [];
  const seg = (s, end, main) => {
    for (let t = s + 240; t < end; t += 300) {
      const e = Math.min(t + 60, end);
      let paid = 0; // khối 4 làm + 1 nghỉ, đếm từ đầu đoạn
      for (let x = t; x < e; x++) {
        const h = ((x % 1440) + 1440) % 1440;
        if (h >= 1320 || h < 360) paid++;
      }
      slots.push({
        start: t,
        end: e,
        label: fmtMin(t) + '–' + fmtMin(e),
        hours: (e - t) / 60,
        paidH: paid / 60,
        inMain: main ? (e - t) / 60 : 0,
        inExtra: main ? 0 : (e - t) / 60,
        n: slots.length + 1
      });
    }
  };
  seg(a - preSpan(d) * 60, a, false);
  seg(a, mainEnd, true);
  seg(mainEnd, mainEnd + postSpan(d) * 60, false);
  return slots;
}
const xSegs = d =>
  [preSpan(d) ? `${d.extraIn}–${d.in}` : '', postSpan(d) ? `${d.out}–${d.extraOut}` : ''].filter(Boolean).join(' và '); // mô tả các đoạn làm thêm
function workedHours(d) {
  const span = spanHours(d);
  if (!span) return 0;
  const brk = breakSlots(d).reduce((s, x) => s + x.inMain, 0);
  // cutStartMin / cutEndMin: phút làm việc bị cắt do vào trễ / ra sớm khi giờ tính từ Check-in/out (ActualHours.apply).
  // Kẹp giống splitMainWork: không âm, không quá số phút làm việc của ca, hai đầu không cắt chồng nhau.
  const workMin = Math.round((span - brk) * 60);
  const cutStart = Math.min(workMin, Math.max(0, Math.floor(Number(d.cutStartMin) || 0)));
  const cutEnd = Math.min(workMin - cutStart, Math.max(0, Math.floor(Number(d.cutEndMin) || 0)));
  return Math.max(0, span - brk - Number(d.breakMin || 0) / 60 - (cutStart + cutEnd) / 60); // ca ngày và ca đêm tính giờ làm giống nhau
}
/* Giờ ra (làm thêm) muộn nhất: thời điểm mà số giờ làm thêm thực vừa bằng giới hạn avail (OT); làm bù không giới hạn số giờ, chỉ dừng trước khung 22h–6h */
function maxMakeupOut(d, avail) {
  const o = toMin(d.out);
  if (o == null || !(avail > 0)) return d.out;
  let best = d.out;
  let bestH = extraWorkHours({ ...d, extraKind: 'makeup', extraOut: d.out });
  for (let m = o + 1; m <= o + MAX_EXTRA * 60; m++) {
    if (isNightMin(m - 1)) break;
    const t = fmtMin(m),
      h = extraWorkHours({ ...d, extraKind: 'makeup', extraOut: t });
    if (h > avail + 1e-6) break;
    if (h > bestH + 1e-6) {
      best = t;
      bestH = h;
    }
  }
  return best;
} // mốc sớm nhất đạt số giờ tối đa (không kết thúc bằng giờ nghỉ)
/* Giới hạn OT: tối đa 4 giờ/ngày; giờ đi làm ngày lễ + giờ OT trong tháng tối đa 16 giờ (làm bù không tính) */
const OT_DAY = 4,
  HOL_OT_MONTH = 16;
function holOtRoom(date) {
  const others = { ...S.days };
  delete others[date];
  const m = calcMonth(S.me, others, null, S.holidays, monthKey(S.year, S.month), null);
  return Math.max(0, HOL_OT_MONTH - m.holWorkHours - m.otHours - m.otHoldHours);
} // phần còn lại của 16 giờ khi bỏ ngày đang sửa (OT chưa tính vẫn chiếm chỗ, như máy chủ đếm)
function limitMsg(d) {
  const c = calcDay(S.me, d, isHolFor(S.me, S.sel), 0, { date: S.sel, holidays: S.holidays }); // giới hạn giờ OT xét theo giờ khai, kể cả khi OT chưa được tính
  if ((c.otH || 0) > OT_DAY + 1e-6) return `OT tối đa ${OT_DAY} giờ/ngày (đang khai ${H(c.otH)} giờ).`;
  const room = holOtRoom(S.sel),
    used = (c.otH || 0) + (c.holWorkH || 0);
  if (used > room + 1e-6)
    return `Giờ đi làm ngày lễ + giờ OT trong tháng tối đa ${HOL_OT_MONTH} giờ: các ngày khác đã dùng ${H(HOL_OT_MONTH - room)} giờ, ngày này khai ${H(used)} giờ (còn ${H(room)} giờ).`;
  return '';
}
/* Làm bù / OT không được rơi vào khung 22h–6h */
const isNightMin = x => {
  const h = ((x % 1440) + 1440) % 1440;
  return h >= 1320 || h < 360;
};
function extraNightMsg(d) {
  const a = toMin(d.in),
    o = toMin(d.out);
  if (d.kind === 'makeup' && a != null && o != null && overlapsNight(a, o))
    return 'Giờ làm bù không được nằm trong khung 22h–6h.';
  if (preSpan(d) && overlapsNight(toMin(d.extraIn), a))
    return `Làm thêm trước ca (${d.extraIn}–${d.in}) không được rơi vào khung 22h–6h.`;
  if (postSpan(d) && overlapsNight(o, toMin(d.extraOut)))
    return `Làm thêm sau ca (${d.out}–${d.extraOut}) không được rơi vào khung 22h–6h.`;
  return '';
}
/* Giờ vào (làm thêm) sớm nhất khi làm bù trước ca: tương tự, tính cả phần làm thêm sau ca nếu có */
function minMakeupIn(d, avail) {
  const a = toMin(d.in);
  if (a == null || !(avail > 0)) return d.in;
  let best = d.in;
  let bestH = extraWorkHours({ ...d, extraKind: 'makeup', extraIn: d.in });
  for (let m = a - 1; m >= a - MAX_EXTRA * 60; m--) {
    if (isNightMin(m)) break;
    const t = fmtMin(m),
      h = extraWorkHours({ ...d, extraKind: 'makeup', extraIn: t });
    if (h > avail + 1e-6) break;
    if (h > bestH + 1e-6) {
      best = t;
      bestH = h;
    }
  }
  return best;
} // mốc muộn nhất đạt số giờ tối đa (không bắt đầu bằng giờ nghỉ)
/* Kiểm tra thời gian liền kề theo ngày công, kể cả ca qua nửa đêm. */
function nextDateISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(y, m - 1, d + 1);
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
}
function prevDateISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(y, m - 1, d - 1);
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
}
function overlapMsg(days, iso, d) {
  const isWork = x => x && (x.kind === 'work' || x.kind === 'makeup' || !x.kind) && x.in && x.out;
  if (!isWork(d)) return '';
  // Bản ghi cũ giữ được khi chỉ cập nhật trường khác; đổi giờ thì kiểm tra lại.
  if (
    days[iso] &&
    ['kind', 'in', 'out', 'extraKind', 'extraIn', 'extraOut'].every(k => (days[iso][k] || '') === (d[k] || ''))
  )
    return '';
  const nb = (typeof S !== 'undefined' && S.neighbors) || {}; // ngày cuối tháng trước / ngày 1 tháng sau (do máy chủ gửi kèm)
  const nx = days[nextDateISO(iso)] || nb[nextDateISO(iso)];
  const bounds = PunchRules.workBounds(d, iso);
  if (isWork(nx) && bounds.end > PunchRules.workBounds(nx, nextDateISO(iso)).start)
    return `Giờ ra${d.extraKind ? ' (làm thêm)' : ''} ${totalEnd(d)} không được sau giờ vào ngày hôm sau (${preSpan(nx) ? nx.extraIn : nx.in}).`;
  const pv = days[prevDateISO(iso)] || nb[prevDateISO(iso)];
  if (isWork(pv)) {
    const prevBounds = PunchRules.workBounds(pv, prevDateISO(iso));
    if (prevBounds.end > bounds.start)
      return `Giờ vào${preSpan(d) ? ' (làm thêm)' : ''} ${preSpan(d) ? d.extraIn : d.in} không được trước giờ ra ngày hôm trước (${totalEnd(pv)}).`;
  }
  return '';
}
function extraWorkHours(d) {
  const span = preSpan(d) + postSpan(d);
  if (!span) return 0;
  const brk = breakSlots(d).reduce((s, x) => s + x.inExtra, 0);
  return Math.max(0, span - brk);
}
/* Loại ngày: work (đi làm) · leave (nghỉ phép năm, chỉ CTV, có lương) · unpaid (nghỉ không lương) · holiday (nghỉ lễ do Admin đặt: CTV có lương, TTS không) */
const KINDS = {
  work: { label: 'Đi làm' },
  makeup: { label: 'Làm bù' },
  holiday: { label: 'Nghỉ lễ' },
  leave: { label: 'Nghỉ phép năm' },
  unpaid: { label: 'Nghỉ không lương' },
  willmakeup: { label: 'Nghỉ, sẽ làm bù' },
  approved: { label: 'Nghỉ được duyệt' },
  isat: { label: 'iSAT' },
  noshow: { label: 'Vắng – chưa khai' },
  pending: { label: 'Chờ xử lý' }
};
const PENDING = {
  open: 'Đang trong ca',
  'forgot-out': 'Quên check-out',
  'off-shift': 'Ngoài ca cố định',
  'incomplete-shift': 'Vào muộn / ra sớm',
  'forgot-in': 'Quên check-in',
  review: 'Chờ đối soát',
  'not-yet': 'Chưa tới'
};
const presenceTime = iso => {
  const hm = PunchRules.vnTime(iso),
    sec = new Date(iso).getUTCSeconds();
  return sec ? `${hm}:${pad(sec)}` : hm;
};
// trạng thái duyệt OT của ngày khoá (giờ từ check-in / Admin duyệt); ngày tự khai không cần duyệt → ''
const otNote = d =>
  !d.src || d.extraKind !== 'ot'
    ? ''
    : !d.otReview
      ? 'chờ Admin duyệt mới tính tiền'
      : d.otReview.ok
        ? 'Admin đã duyệt'
        : `Admin từ chối${d.otReview.note ? ': ' + esc(d.otReview.note) : ''} — không tính tiền`;
function calcDay(staff, d, isHoliday, avail, context) {
  // context: ngày bắt đầu và toàn bộ lịch lễ, kể cả tháng kế tiếp
  // Ngày đã xác nhận lấy ca được gán làm căn cứ trả lương; giờ có mặt chỉ dùng đối chiếu.
  if (d.attendanceConfirmed)
    d = { ...d, in: d.plannedShift?.in || d.in, out: d.plannedShift?.out || d.out, breakMin: 0 };
  const T = typeOf(staff),
    base = levelOf(staff).base,
    daily = base / T.workdays,
    hourly = daily / HOURS;
  const z = { daily, hourly, hours: 0, short: 0, cut: 0, bonus: 0 };
  if (context && !PayrollCalendar.isValidDate(context.date)) return { ...z, kind: 'invalid', total: 0, paidOff: false };
  const split = PayrollCalendar.splitMainWork(
    d,
    context?.date || '2000-01-03',
    context ? context.holidays : isHoliday ? ['2000-01-03', '2000-01-04'] : []
  );
  const normalWorkH = split.normalH,
    holWorkH = split.holidayH,
    holNightH = split.holidayNightH;
  const holNightPay = holNightH * hourly * 0.6,
    holWorkPay = holWorkH * hourly * 3 + holNightPay;
  const holidayWork = {
    normalWorkH,
    holWorkH,
    holNightH,
    holNightPay,
    holWorkPay,
    holWork: holWorkH > 0,
    nightH: split.nightH
  }; // nightH: giờ làm ca chính trong 22h–6h (dùng cho miễn thuế)
  if (isHoliday) {
    const paidHoliday =
      T.paidHoliday &&
      (!context?.date || !PayrollCalendar.isValidDate(staff.startDate) || context.date >= staff.startDate);
    const holBase = paidHoliday ? daily : 0; // lương ngày lễ từ ngày bắt đầu làm (TTS không có)
    if (!(d.kind === 'work' && d.in && d.out))
      return { ...z, kind: 'holiday', total: holBase, paidOff: paidHoliday, holBase };
    // Giờ làm chia theo ngày dân sự: phần lễ ×3, phần đêm lễ cộng 20% ×3; giữ phụ cấp ca và nghỉ đêm riêng.
    const w = { ...d, shift: shiftFor(d.in, d.out), extraKind: '', extraIn: '', extraOut: '' };
    const hours = workedHours(w);
    const slots = breakSlots(w),
      breakH = slots.reduce((s, x) => s + (d.breakPayOff && x.inMain ? 0 : x.paidH), 0), // breakPayOff: không có mặt trọn giờ nghỉ đêm
      breakPay = breakH * hourly * (1 + NIGHT_BREAK);
    const bonus =
      w.shift === 'flex'
        ? bonusOf(staff, 'flex') * hourly * (normalWorkH + holWorkH)
        : Math.max(daily * bonusOf(staff, w.shift), split.nightH * hourly * NIGHT_BREAK);
    return {
      ...z,
      ...holidayWork,
      kind: 'holiday',
      shift: w.shift,
      hours,
      slots,
      breakH,
      breakPay,
      bonus,
      holBase,
      paidOff: paidHoliday,
      total: holBase + normalWorkH * hourly + holWorkPay + bonus + breakPay
    };
  }
  const kind = d.kind || 'work';
  if (kind === 'noshow') return { ...z, kind, total: 0, paidOff: false }; // vắng không phép (không check-in, không chọn nghỉ): như nghỉ không lương
  if (kind === 'pending') return { ...z, kind, total: 0, paidOff: false }; // chờ xử lý (đang trong ca / quên check-out / ngoài ca): chưa tính, không vào giờ vượt ngưỡng
  if (kind === 'leave') return { ...z, kind, total: T.paidLeave ? daily : 0, paidOff: T.paidLeave };
  if (kind === 'unpaid') return { ...z, kind, total: 0, paidOff: false };
  if (kind === 'willmakeup') return { ...z, kind, total: 0, paidOff: false }; // nghỉ có làm bù: tính như nghỉ không lương, cần 8 giờ làm bù trong tháng (bù trước hoặc sau)
  if (kind === 'approved') return { ...z, kind, total: 0, paidOff: false }; // nghỉ được duyệt: không lương, không tính là ngày nghỉ khi xét chuyên cần
  if (kind === 'isat') {
    const paidOff =
      !!T.isat && PayrollCalendar.isValidDate(context?.date) && new Date(context.date + 'T00:00:00Z').getUTCDay() === 6;
    return { ...z, kind, total: paidOff ? daily : 0, paidOff }; // phúc lợi iSAT: chỉ nghỉ thứ Bảy, lương cơ bản ngày, không phụ cấp
  }
  d = { ...d, shift: shiftFor(d.in, d.out) };
  const hours = workedHours(d);
  if (kind === 'makeup') {
    // ngày làm bù (ngoài lịch, vd. thứ Bảy của TTS): tính theo giờ làm bù × lương giờ, tối đa 8 giờ
    const cap = avail == null ? HOURS : Math.min(HOURS, avail);
    const makeupH = Math.min(hours, cap),
      makeupPay = makeupH * hourly;
    return {
      daily,
      hourly,
      hours,
      short: 0,
      cut: 0,
      bonus: 0,
      breakH: 0,
      breakPay: 0,
      excess: 0,
      makeupCap: cap,
      makeupH,
      makeupPay,
      otH: 0,
      otPay: 0,
      shift: d.shift,
      kind: 'makeup',
      total: makeupPay
    };
  }
  // ngày thường: tối đa 9 tiếng gồm 1 tiếng nghỉ giữa ca; phần vượt 9 tiếng có thể khai làm bù (không áp dụng ca đêm)
  // Giờ làm thêm: bắt đầu từ giờ ra đến "làm thêm đến" (extraOut); bản ghi cũ không có extraOut thì lấy phần vượt 8 giờ làm
  // Làm thêm: extraKind = '' (không) | 'makeup' (làm bù) | 'ot' (overtime); giờ vào làm thêm = giờ ra, giờ ra làm thêm = extraOut
  const extraKind = d.extraKind || (d.extraOut ? 'makeup' : '');
  const extra = extraWorkHours({ ...d, extraKind }); // giờ làm thêm thực (đã trừ giờ nghỉ bắt buộc rơi trong giai đoạn làm thêm)
  const excess = extraKind ? extra : d.extraOut === undefined && d.makeupH ? Math.max(0, hours - HOURS) : 0;
  const makeupCap = avail == null ? excess : Math.min(excess, Math.max(0, avail)); // avail = số giờ làm bù còn được trả lương (calcMonth chia theo cả tháng)
  // Đoạn làm thêm tách theo ngày dân sự của từng phút: phần rơi vào ngày lễ trả theo mức ngày lễ (T1-3, BLLĐ 2019 Điều 98, chờ advisor xác nhận)
  const extraSplit = PayrollCalendar.splitExtraWork(
    { ...d, extraKind },
    context?.date || '2000-01-03',
    context ? context.holidays : []
  );
  const makeupH =
      extraKind === 'makeup' ? makeupCap : extraKind ? 0 : Math.min(Math.max(0, Number(d.makeupH) || 0), makeupCap),
    // Làm bù rơi vào ngày lễ: phần giờ ngày lễ trả thêm theo hệ số makeupHolRate (ActualHours.POLICY.makeupHolidayRate, chờ Admin); không có hệ số thì ×1
    makeupRate = Number(d.makeupHolRate) > 1 ? Number(d.makeupHolRate) : 1,
    makeupHolH =
      makeupRate > 1 && extraKind === 'makeup' && extra > 0 && makeupH > 0
        ? Math.min(makeupH, (makeupH * extraSplit.holidayH) / extra)
        : 0,
    makeupHolPremium = makeupHolH * hourly * (makeupRate - 1), // phần trả thêm của giờ làm bù ngày lễ, nằm trong makeupPay; tách riêng để phiếu lương cộng đủ
    makeupPay = makeupH * hourly + makeupHolPremium; // làm bù: toàn bộ giờ làm thêm, tối đa bằng giờ thiếu tích luỹ
  // OT chỉ khi giờ bù trước ngày này đã cân (TTS không có OT; ca đêm có OT ngoài khung 22h–6h). calcMonth truyền context.otBlocked theo các ngày trước; gọi lẻ thì xét avail (giờ còn phải bù).
  const owes = context && context.otBlocked !== undefined ? !!context.otBlocked : avail > 0.001;
  const otRejected = !!(d.src && d.otReview && d.otReview.ok === false);
  const otEligible = extraKind === 'ot' && T.ot,
    otCan = otEligible && !owes,
    otHold = otEligible && owes && !otRejected ? extra : 0; // otHold = giờ OT chưa tính vì trước ngày này giờ bù chưa cân
  const otOk = !d.src || !!(d.otReview && d.otReview.ok); // ngày khoá (giờ từ check-in / Admin duyệt): OT phải được Admin duyệt mới tính
  const otH = otCan && otOk ? extra : 0,
    otHolH = otH > 0 ? Math.min(extraSplit.holidayH, otH) : 0, // giờ OT rơi vào ngày lễ: ×3, phần đêm lễ cộng thêm 0,6
    otHolNightH = otH > 0 ? Math.min(extraSplit.holidayNightH, otHolH) : 0,
    otHolPay = otHolH * hourly * 3 + otHolNightH * hourly * 0.6,
    otPay = (otH - otHolH) * hourly * 2 + otHolPay,
    otWait = otCan && !otOk ? extra : 0; // overtime: toàn bộ giờ làm thêm × lương giờ × 2; otWait = giờ OT chưa duyệt / bị từ chối
  const paidHours = Math.min(hours, HOURS); // không OT
  const slots = breakSlots(d);
  const breakH = slots.reduce((s, x) => s + (d.breakPayOff && x.inMain ? 0 : x.paidH), 0); // chỉ phần nghỉ nằm trong khung 22h–6h được quy đổi thành tiền; breakPayOff: không có mặt trọn giờ nghỉ của ca
  const breakPay = breakH * hourly * (1 + NIGHT_BREAK); // = lương giờ + 30% cho mỗi giờ nghỉ trong 22h–6h
  const short = Math.max(0, HOURS - paidHours),
    cut = short * hourly;
  const bonus =
    d.shift === 'flex'
      ? bonusOf(staff, 'flex') * hourly * paidHours
      : Math.max(daily * bonusOf(staff, d.shift), holWorkH > 0 ? split.nightH * hourly * NIGHT_BREAK : 0); // Phụ cấp ca chỉ cộng một lần, giữ mức theo ngày có lợi hơn.
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
    makeupCap,
    makeupH,
    makeupPay,
    makeupHolPremium,
    otH,
    otPay,
    otHolH,
    otHolNightH,
    otHolPay,
    otWait,
    otHold,
    ...holidayWork,
    holBase: 0,
    shift: d.shift,
    kind: 'work',
    total: daily - cut - holWorkH * hourly + holWorkPay + bonus + breakPay + makeupPay + otPay
  };
}
let CHECKIN_FROM = null; // ngày bắt đầu dùng check-in (máy chủ gửi về); null = đang tắt
/* Bảng ước tính chỉ dùng lịch tự nhập; thiếu Check-in/out không tự suy ra ngày vắng. */
function noShowDates(staff, days, mk, holSet) {
  return new Set();
}
/* Ngày công ty bắt đầu bảng lương: phiếu tháng 9/2026 ghi "từ ngày 7/9". Chỉ dùng cho dòng tiêu đề phiếu, không đổi cách tính. */
const PAYROLL_FROM = '2026-09-07';
function calcMonth(staff, days, kpiPct, holidays, mk, upTo) {
  // upTo: chỉ tính đến ngày này; mặc định = hôm nay (null = cả tháng)
  if (upTo === undefined) upTo = PunchRules.vnDate(new Date().toISOString());
  const T = typeOf(staff),
    L = levelOf(staff);
  const r = {
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
    otHolHours: 0,
    otHolNightHours: 0,
    otHolPay: 0,
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
    preStartDays: 0,
    net: null
  };
  const inMonth = date =>
    PayrollCalendar.isValidDate(date) && (!mk || (PayrollCalendar.isValidMonth(mk) && date.slice(0, 7) === mk));
  // Tiền ca và bộ đếm ngày công vẫn thuộc ngày/tháng bắt đầu; chỉ hệ số lễ theo ngày thực tế của từng phút.
  // Lương nghỉ lễ theo ngày hưởng quyền, cộng một lần trong tháng của chính ngày lễ đó.
  const allHolidays = (holidays || []).filter(PayrollCalendar.isValidDate);
  const hol = new Set(
    allHolidays.filter(inMonth).filter(h => {
      const [y, m, dd] = h.split('-').map(Number);
      return T.dows.includes(new Date(y, m - 1, dd).getDay());
    })
  );
  const eligibleHolidays = [...hol].filter(
    date => !PayrollCalendar.isValidDate(staff.startDate) || date >= staff.startDate
  );
  const okDow = [...T.dows, ...(T.extraDows || [])]; // chỉ tính các thứ trong lịch làm việc của loại nhân sự (TTS: T2–T6)
  const noshow = noShowDates(staff, days, mk, hol); // vắng không phép (giai đoạn check-in), tính lúc chạy, không lưu DB
  const monthDates = [...new Set([...Object.keys(days), ...eligibleHolidays, ...noshow])]
    .filter(inMonth)
    .filter(date => {
      const [y, m, dd] = date.split('-').map(Number);
      return okDow.includes(new Date(y, m - 1, dd).getDay());
    })
    .sort();
  const dates = monthDates.filter(date => !upTo || date <= upTo);
  const dayOf = date => days[date] || (noshow.has(date) ? { kind: 'noshow' } : {});
  // Làm bù tính gộp theo tháng: giờ làm bù khai ở bất kỳ ngày nào (trước hay sau ngày thiếu giờ / ngày "Nghỉ, sẽ làm bù") đều bù được.
  // Giờ cần bù = giờ thiếu ngày đi làm + 8 giờ mỗi ngày "Nghỉ, sẽ làm bù"; giờ làm bù được trả lương = min(giờ đã khai bù, giờ cần bù), phần dư không tính.
  // Sổ giờ bù tính bằng phút nguyên: giờ thiếu (8 − giờ làm) và giờ làm bù tính theo hai cách khác nhau, cộng số thực sẽ lệch vài 1e-15 giờ.
  const toM = h => Math.round((h || 0) * 60);
  const ledger = new Map(),
    total = { need: 0, made: 0 };
  dates.forEach(date => {
    const c = calcDay(staff, dayOf(date), hol.has(date), null, { date, holidays: allHolidays });
    const x = {
      need: toM((c.kind === 'work' ? c.short : 0) + (c.kind === 'willmakeup' ? HOURS : 0)),
      made: toM(c.makeupH)
    };
    ledger.set(date, x);
    total.need += x.need;
    total.made += x.made;
  });
  // OT ngày D chỉ tính khi các ngày TRƯỚC D trong tháng đã cân giờ bù (không còn giờ thiếu chưa bù, không còn giờ bù trước chưa dùng).
  // Thay đổi ở các ngày sau D không ảnh hưởng OT ngày D; thiếu giờ phát sinh sau đó bị trừ riêng.
  let budget = Math.min(total.need, total.made),
    bal = 0; // budget (phút): giờ làm bù còn được trả lương, chia lần lượt theo ngày
  dates.forEach(date => {
    const d = dayOf(date),
      x = ledger.get(date),
      c = calcDay(staff, d, hol.has(date), budget / 60, { date, holidays: allHolidays, otBlocked: bal !== 0 });
    budget = Math.max(0, budget - toM(c.makeupH));
    c.makeupDeclared = x.made / 60;
    c.debtBefore = bal / 60;
    bal += x.need - x.made;
    c.debtAfter = bal / 60; // số dư giờ bù luỹ kế: dương = còn phải bù, âm = đã bù trước
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
      r.otHolHours += c.otHolH || 0; // OT rơi ngày lễ: đã nằm trong otHours / otPay, tách riêng để tính miễn thuế và phiếu
      r.otHolNightHours += c.otHolNightH || 0;
      r.otHolPay += c.otHolPay || 0;
    } // làm bù: mục riêng, không gộp vào ngày công thực tế
    r.bonus += c.bonus || 0; // Mỗi khoản đã trả trong ngày phải có trong tổng hợp, kể cả khi giờ làm lễ bằng 0.
    r.nightHours += Math.max(0, (c.nightH || 0) - (c.holNightH || 0)); // giờ làm đêm ngoài ngày lễ (giờ đêm ngày lễ đã nằm trong tiền làm lễ)
    if (c.kind === 'work') {
      r.count++;
      r.base += c.daily;
      r.cut += c.cut;
      r.short += c.short;
      if (c.shift === 'flex') r.flex++;
      if (c.shift === 'night') r.night++;
      if (Number(date.slice(8)) <= TAX_RULES.advanceUntil) r.advanceBase += c.daily - c.cut;
    } // tạm ứng: lương cơ bản thực nhận của ngày đi làm từ ngày 1 đến ngày 15
    else if (c.kind !== 'makeup') {
      if (c.kind !== 'isat' || c.paidOff) r[c.kind]++;
      r.off += c.kind === 'holiday' ? c.holBase || 0 : c.total;
    }
    if (c.holWork) {
      r.holWorkDays++;
      r.holWorkHours += c.holWorkH;
      r.holWorkPay += c.holWorkPay;
      r.holNightHours += c.holNightH || 0;
      if (c.kind !== 'work') {
        if (c.shift === 'flex') r.flex++;
        if (c.shift === 'night') r.night++;
      }
    } // Ca qua lễ có cả phần thường: phụ cấp chỉ cộng một lần.
    r.work += c.total;
    if (c.kind !== 'makeup') {
      r.basePay += c.total - c.bonus - (c.breakPay || 0) - (c.makeupPay || 0) - (c.otPay || 0) - (c.holWorkPay || 0);
      if (c.breakPay) {
        r.breakPay += c.breakPay;
        r.breakDays++;
        r.breakHours += c.breakH;
      }
    }
    r.rows.push({ date, ...d, ...c });
  });
  // ngày làm việc trong tháng trước ngày bắt đầu làm: không làm, không lương (dùng cho quy tắc 14 ngày của BH)
  if (PayrollCalendar.isValidDate(staff.startDate) && mk && staff.startDate.slice(0, 7) === mk) {
    const [y, mo] = mk.split('-').map(Number);
    for (let d = 1; d < Number(staff.startDate.slice(8)); d++)
      if (T.dows.includes(new Date(y, mo - 1, d).getDay())) r.preStartDays++;
  }
  r.makeupNeed = total.need / 60;
  r.makeupDeclared = total.made / 60;
  r.debt = Math.max(0, total.need - total.made) / 60; // giờ thiếu chưa bù
  r.makeupCredit = Math.max(0, total.made - total.need) / 60; // giờ bù trước / bù dư chưa dùng: không tính lương
  // Số giờ vượt ngưỡng (dùng chung cho chuyên cần và KPI) = ngày nghỉ không lương × 8 + giờ thiếu chưa bù + ngày phép năm × 8.
  // Ngày "Nghỉ, sẽ làm bù" chỉ tính qua giờ thiếu chưa bù (r.debt): chưa bù = 8 giờ, bù dần thì giảm, bù đủ = 0 — không cộng thêm 8 giờ cố định.
  if (T.travel || T.attendance || T.kpi) r.overHours = (r.unpaid + r.noshow) * HOURS + r.debt + r.leave * HOURS; // vắng không phép tính như nghỉ không lương
  if (T.travel || T.attendance) {
    // phụ cấp đi lại / chuyên cần: theo ngày đi làm thực tế (không tính nghỉ, làm bù)
    const ratio = r.count / T.workdays;
    r.absent = Math.max(0, r.leave + r.unpaid + r.noshow + r.willmakeup);
    r.attendOk = r.absent < T.maxAbsent && r.overHours < OVER_LIMIT; // chuyên cần = 0 khi nghỉ từ maxAbsent ngày hoặc giờ vượt ngưỡng từ OVER_LIMIT giờ (= 3 ngày × 8)
    r.travel = staff.idorm ? 0 : L.base * (T.travel || 0) * ratio;
    r.attendance = r.attendOk ? L.base * (T.attendance || 0) * ratio : 0;
    r.allow = r.travel + r.attendance;
  }
  if (T.kpi) {
    // kpiPct có thể là số (% hoàn thành) hoặc {pct, amt} với amt = mức đề xuất lương KPI (0 … KPI tối đa)
    const kin = kpiPct && typeof kpiPct === 'object' ? kpiPct : { pct: kpiPct, amt: null };
    const cp = x => (x == null || x === '' ? null : Math.max(0, Math.min(100, Number(x))));
    const ca = x => (x == null || x === '' ? null : Math.max(0, Math.min(L.kpi || 0, Number(x) || 0)));
    const selfP = cp(kin.pct),
      selfAmt = ca(kin.amt) == null ? L.kpi || 0 : ca(kin.amt);
    // số giờ vượt ngưỡng > OVER_LIMIT giờ thì KPI nhân tỷ lệ ngày đi làm thực tế / ngày công
    r.kpiRatio = r.overHours > OVER_LIMIT ? r.count / T.workdays : 1;
    if (kin.method === 'five') {
      // KPI 5 thành phần (docs/architecture/2026-10-15-kpi-5-thanh-phan.md): nơi gọi chọn method bằng KpiScore.methodOf(tháng, kpiFrom)
      // và đưa vào kin.parts = { wework, user, peer, manager, self } do Admin nhập. Tự đánh giá cũ (pct) và % Admin duyệt cũ (admPct)
      // không ảnh hưởng tiền. Mức KPI = Admin duyệt (admAmt) → đề xuất (amt) → KPI tối đa của level, kẹp 0 … trần.
      const evaluated = KpiScore.evaluate(kin.parts, { pass: T.kpiPass });
      const pass = evaluated.weworkOk === true && evaluated.units >= T.kpiPass * 10000;
      const e = {
        ...evaluated,
        pass,
        reason: !evaluated.complete ? 'incomplete' : !evaluated.weworkOk ? 'wework' : pass ? 'ok' : 'below-pass'
      };
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
      r.kpiPay = e.pass ? KpiScore.pay(amt, e.units, r.kpiRatio) : 0;
    } else {
      // Admin duyệt / chỉnh KPI: admPct, admAmt (nếu có) thay cho tự đánh giá; chưa duyệt → tạm tính theo tự đánh giá
      const approved = cp(kin.admPct) != null;
      const p = approved ? cp(kin.admPct) : selfP;
      const amt = approved ? (ca(kin.admAmt) == null ? selfAmt : ca(kin.admAmt)) : selfAmt;
      r.kpiApproved = approved;
      r.kpiSelfPct = selfP;
      r.kpiSelfAmt = selfAmt;
      r.kpiAmt = amt;
      r.kpiPct = p;
      r.kpiPass = p == null ? null : p >= T.kpiPass;
      r.kpiPay = r.kpiPass ? ((amt * p) / 100) * r.kpiRatio : 0;
    }
  }
  r.total = r.work + r.allow + r.kpiPay;
  r.net = calcNet(staff, r);
  return r;
}
/* Thuế lũy tiến từng phần trên thu nhập tính thuế của tháng */
function progressiveTax(income) {
  let tax = 0,
    lower = 0;
  for (const [upper, rate] of TAX_RULES.brackets) {
    if (income <= lower) break;
    tax += (Math.min(income, upper) - lower) * rate;
    lower = upper;
  }
  return tax;
}
/* Thuế TNCN từ tổng thu nhập / thu nhập chịu thuế / BH (dùng chung cho calcNet và phiếu lương Admin đã sửa số).
   HĐLĐ từ 3 tháng: bắt buộc, phát sinh khi chịu thuế − BH > giảm trừ bản thân; tính lũy tiến trên chịu thuế − BH − giảm trừ gia cảnh.
   HĐ dưới 3 tháng: khấu trừ 10% trên tổng thu nhập từ 5 triệu (Admin tắt được). */
function taxFrom({ contract, taxOn, deduction }, gross, taxable, insurance) {
  const R = TAX_RULES;
  if (contract === 'long') {
    const taxDue = taxable - insurance > R.personal,
      assessable = Math.max(0, taxable - insurance - deduction);
    return { taxDue, assessable, tax: taxDue ? Math.round(progressiveTax(assessable)) : 0 };
  }
  return {
    taxDue: false,
    assessable: 0,
    tax: taxOn && gross >= R.casualThreshold ? Math.round(gross * R.casualRate) : 0
  };
}
/* Khấu trừ & thực lĩnh ước tính từ kết quả calcMonth (m), theo bảng lương công ty:
   miễn thuế → thu nhập chịu thuế → BH bắt buộc → giảm trừ gia cảnh → thuế TNCN → tạm ứng → thực lĩnh. */
function calcNet(staff, m) {
  const R = TAX_RULES,
    T = typeOf(staff),
    L = levelOf(staff),
    daily = L.base / T.workdays,
    hourly = daily / HOURS;
  const contract =
    staff.contract === 'long' || staff.contract === 'short' ? staff.contract : staff.type === 'tts' ? 'short' : 'long';
  const insured = staff.insured == null ? contract === 'long' : !!staff.insured;
  const dependants = Math.max(0, Math.trunc(Number(staff.dependants) || 0));
  const D = Math.round; // các khoản tiền làm tròn đồng trước khi cộng trừ, để các dòng hiển thị cộng lại đúng bằng thực lĩnh
  const gross = D(m.total);
  // Khoản miễn thuế: tiền lương giờ làm đêm (giờ làm thực tế trong 22h–6h, đến mức +30%) + OT / làm lễ (đến mức luật định)
  const exemptNight = D(hourly * m.nightHours * (1 + R.nightPremium));
  const otHolHours = m.otHolHours || 0,
    otHolPay = m.otHolPay || 0;
  const exemptOt = D(
    Math.min(m.otPay - otHolPay, R.otNormalRate * hourly * (m.otHours - otHolHours)) +
      Math.min(otHolPay, hourly * (R.holidayRate * otHolHours + R.holidayNightAdd * (m.otHolNightHours || 0))) +
      Math.min(m.holWorkPay, hourly * (R.holidayRate * m.holWorkHours + R.holidayNightAdd * (m.holNightHours || 0)))
  );
  const exempt = Math.min(gross, exemptNight + exemptOt);
  const taxable = Math.max(0, gross - exempt); // thu nhập chịu thuế
  // BH: nghỉ không lương (gồm cả ngày trước ngày bắt đầu làm) từ insuranceSkipDays ngày làm việc trở lên thì tháng đó không đóng
  const noPayDays = (m.unpaid || 0) + (m.approved || 0) + (m.noshow || 0) + (m.preStartDays || 0);
  const insuredMonth = insured && noPayDays < R.insuranceSkipDays;
  const ins = k => (insuredMonth ? D(Math.min(L.base, R.insuranceCap[k]) * R.insurance[k]) : 0);
  const bhxh = ins('bhxh'),
    bhyt = ins('bhyt'),
    bhtn = ins('bhtn'),
    insurance = bhxh + bhyt + bhtn;
  const employer = insuredMonth
    ? D(['bhxh', 'bhyt', 'bhtn'].reduce((s, k) => s + Math.min(L.base, R.insuranceCap[k]) * R.employer[k], 0))
    : 0;
  // Admin bật/tắt cho từng người (mặc định có): giảm trừ gia cảnh, tạm ứng; khấu trừ thuế TNCN chỉ tắt được với HĐ dưới 3 tháng
  const deductOn = staff.deductOn !== false,
    advanceOn = staff.advanceOn !== false;
  const taxOn = contract === 'long' || staff.taxOn !== false;
  const deduction = contract === 'long' && deductOn ? R.personal + dependants * R.dependant : 0; // giảm trừ gia cảnh
  const { taxDue, assessable, tax } = taxFrom({ contract, taxOn, deduction }, gross, taxable, insurance);
  const advance = advanceOn ? D(R.advanceRate * m.advanceBase) : 0;
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
    advanceDays: m.advanceBase / daily,
    nightHours: m.nightHours,
    net: gross - insurance - tax - advance
  };
}
