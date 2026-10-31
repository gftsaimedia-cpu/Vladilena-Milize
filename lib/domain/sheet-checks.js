'use strict';
// Kiểm tra nghiệp vụ khi lưu Lịch ước tính (PUT /api/sheet). Chạy trên hồ sơ của người sở hữu lịch (khai thay: người được khai).
// Lịch VẪN được lưu, mỗi vi phạm là một
// cảnh báo nói chuyện gì, ngày nào và hệ quả cho tiền lương. Hệ quả tiền đã đối chiếu với bộ máy (public/payroll-engine.js, public/work-schedule.js):
//   - ngày ngoài lịch làm việc (kể cả Chủ nhật): ca chính không có tiền; chỉ đoạn OT đã duyệt và có chấm công liền mạch được trả (extraOnly, OT cuối tuần theo ot.weekendRate);
//   - giờ vào – ra khác ca cố định: nhân sự tự khai vẫn tính theo ca được gán; Admin khai thay tính theo ca Admin chọn;
//   - OT chỉ ra tiền khi chức vụ có quyền lợi OT (T.ot) và Admin đã duyệt khoản; hai trần giờ (DAY_HOURS_CAP, MONTH_OT_CAP) chặn khi lưu chứ không do bộ máy cắt;
//   - iSAT chỉ trả khi chức vụ có quyền lợi iSAT và đúng thứ trong tuần (kind 'isat': paidOff); khai iSAT sai thứ hoặc sai quyền lợi bị chặn (isatRefusal); nghỉ được duyệt không lương;
//   - ngày phép năm trả lương ngày theo chức vụ (T.paidLeave), bộ máy không xét số dư phép;
//   - lương ngày công tính theo ngày, không theo giờ: hai ngày chồng giờ chỉ ảnh hưởng giờ làm thêm.
// Kiểm định dạng (ngày không thuộc tháng, loại ngày lạ, loại ngày 'makeup' cũ khai mới hoặc sửa...) vẫn chặn.
const store = require('../db');
const { HttpError } = require('../http');
const { rulesFor } = require('../request-rules');
const { toMin, overlapsNight, spanH } = require('./work-hours');
const { DAY_HOURS_CAP, extraSpanH, checkDayHours } = require('./limits');
const { leaveDates, neighborDays, schedule } = require('./sheet');
const { sheetFlagsOf, checkRequestFlags } = require('./positions');
const { isatRefusal } = require('./isat-rule');
const { warnIf, warn } = require('../warnings');

const money = n => n.toLocaleString('vi-VN');
const dm = d => `${d.slice(8)}/${d.slice(5, 7)}`; // ngày hiện cho người dùng dạng dd/mm
// Phút từ a tới b theo chiều kim đồng hồ (qua nửa đêm được); trùng nhau = 0
const gap = (a, b) => (((toMin(b) - toMin(a)) % 1440) + 1440) % 1440;
// Phút của khoảng khai [d.in, d.out) nằm ngoài khung ca [shiftIn, shiftOut) (đếm từng phút, qua nửa đêm được), để nhận ra giờ đi làm
// rộng hơn ca được gán. wraps: khoảng khai chứa trọn ca.
function outsideShift(d, shiftIn, shiftOut) {
  const len = gap(d.in, d.out) || 1440,
    shiftLen = gap(shiftIn, shiftOut) || 1440,
    start = toMin(d.in),
    from = toMin(shiftIn);
  let min = 0;
  for (let t = 0; t < len; t++) if ((((start + t - from) % 1440) + 1440) % 1440 >= shiftLen) min++;
  return { min, wraps: min > 0 && len - min === shiftLen };
}
// Mã ca của ngày Admin khai thay: mã ca Admin chọn (có trong danh mục), không chọn thì ca có đúng giờ vào – ra đã khai (ưu tiên ca được
// gán, rồi mã mới của ca trong danh mục); không ca nào khớp thì '' và PUT /sheet đòi Admin chọn ca (SHEET_ADMIN_SHIFT_REQUIRED).
function adminShiftOf(punch, day, assignedCode) {
  if (day.preset && Object.hasOwn(punch.SHIFT, day.preset)) return day.preset;
  const fits = code =>
    Object.hasOwn(punch.SHIFT, code) && punch.SHIFT[code][0] === day.in && punch.SHIFT[code][1] === day.out;
  if (assignedCode && fits(assignedCode)) return assignedCode;
  const match = Object.keys(punch.SHIFT).find(fits);
  return match ? punch.canonicalOf(match) : '';
}

// Giờ làm thêm của một ngày đi làm khi làm sạch lịch (server.js → cleanDays), chặn vì là lỗi nhập.
// d: ngày gửi lên; extraIn / extraOut đã bỏ giờ trùng giờ vào / ra của ca. "Giờ bắt đầu (trước ca)" là lúc bắt đầu đoạn trước giờ vào,
// "Giờ kết thúc (sau ca)" là lúc kết thúc đoạn sau giờ ra: người dùng hay nhập giờ bắt đầu, kết thúc của một đoạn sau ca (07:00, 09:00
// sau ca 22:00–07:00), khi đó báo đúng chuyện nhập nhầm ô thay vì câu trần 12 tiếng.
function checkExtraTimes(date, d, { extraKind, extraIn, extraOut }) {
  const label = extraKind === 'ot' ? 'OT' : 'làm bù';
  if (extraKind && !extraIn && !extraOut)
    throw new HttpError(
      400,
      (d.extraIn && d.extraIn === d.in) || (d.extraOut && d.extraOut === d.out)
        ? `Ngày ${dm(date)}: giờ ${label} trùng giờ ca đang chọn. Chọn ca được gán rồi nhập giờ trước/sau ca.`
        : `Ngày ${dm(date)}: đã chọn ${label} nhưng chưa nhập giờ làm thêm`
    );
  const shiftMin = gap(d.in, d.out) || 1440;
  // Chỉ một ô có giờ, vượt trần và giờ nằm gần phía bên kia của ca (vd. chỉ "trước ca" 08:00 sau ca 22:00–07:00): nhập nhầm ô. Có cả
  // hai đoạn thì là khai thật (vd. 23:00 hôm trước tới 23:00 với ca 08:00–17:00), để checkDayHours báo trần ngày
  const overCap = extraSpanH({ in: d.in, out: d.out, extraIn, extraOut }) > DAY_HOURS_CAP + 1e-6;
  const nearOtherSide =
    (extraIn && !extraOut && gap(d.out, extraIn) < gap(extraIn, d.in)) ||
    (extraOut && !extraIn && gap(extraOut, d.in) < gap(d.out, extraOut));
  const wrongSide =
    (extraIn && (gap(d.in, extraIn) <= shiftMin || (extraOut && gap(d.out, extraIn) < gap(d.out, extraOut)))) ||
    (extraOut && gap(d.in, extraOut) < shiftMin) ||
    (overCap && nearOtherSide);
  if (wrongSide)
    throw new HttpError(
      400,
      `Ngày ${dm(date)}: giờ ${label} không khớp ca ${d.in}–${d.out}. "Giờ bắt đầu (trước ca)" là lúc bắt đầu làm trước ${d.in}, "Giờ kết thúc (sau ca)" là lúc kết thúc làm sau ${d.out}; chỉ làm một phía thì để trống ô kia.`,
      { code: 'EXTRA_WRONG_SIDE' }
    );
}

// Trả { sheetParams, sched, holidays } cho phần còn lại của PUT /sheet. clean: ngày đã làm sạch (cleanDays); có thể gán clean[d].preset.
// onBehalf: Admin khai thay (khoản Admin có quyền duyệt được duyệt luôn trong cùng lần lưu, lib/domain/sheet-on-behalf.js): câu cảnh báo không nói "chờ duyệt"
function checkSheet({ u, month, clean, prevDays, onBehalf = false }) {
  const { punch, params: sheetParams, workSchedule: ws } = rulesFor(month);
  const sched = schedule.scheduleOf(u, month); // lịch làm việc của người trong tháng (một nguồn: public/work-schedule.js)
  const flags = sheetFlagsOf(sheetParams, u.type, u.level);
  const { canOt, canApproved, canDeclareAbsence, hasLeaveAccount } = flags;
  const holidays = new Set(store.getSetting('holidays', []));
  // "Nghỉ, sẽ làm bù" chọn được mọi ngày làm việc, kể cả ngày cuối tháng: giờ làm bù khai ở bất kỳ ngày nào trong tháng (bù trước hoặc sau)
  const [my, mm] = month.split('-').map(Number);
  const bad = (message, details) => () => new HttpError(400, message, details);
  const pendingText = onBehalf
    ? 'Admin khai thay nên khoản được duyệt luôn (khi có quyền duyệt loại này) và được tính tiền'
    : 'khoản chờ Admin duyệt và, nếu được duyệt, vẫn được tính tiền';
  // Không chặn lại cặp giờ đã lưu chưa sửa: dữ liệu đã lưu có thể gắn ca sau 0h với ngày bắt đầu
  // ca đêm. Khi người dùng đổi giờ, kiểm theo ngày trên lịch ước tính như bình thường.
  const sameHours = (a, b) =>
    !!a &&
    !!b &&
    ['kind', 'in', 'out', 'extraKind', 'extraIn', 'extraOut'].every(key => (a[key] || '') === (b[key] || ''));
  const overlapNote =
    'Lương ngày công tính theo ngày nên không bị tính hai lần, nhưng giờ làm thêm ở phần chồng có thể bị tính hai lần.';
  // Không được chồng giờ sang ngày hôm sau: kết thúc (giờ ra / giờ ra làm thêm) phải <= lúc bắt đầu (giờ vào làm thêm / giờ vào) ngày kế tiếp
  const sorted = Object.keys(clean).sort();
  for (let i = 0; i + 1 < sorted.length; i++) {
    const a = clean[sorted[i]],
      b = clean[sorted[i + 1]];
    const [y, m, dd] = sorted[i].split('-').map(Number);
    const nx = new Date(y, m - 1, dd + 1);
    const nxIso = `${nx.getFullYear()}-${String(nx.getMonth() + 1).padStart(2, '0')}-${String(nx.getDate()).padStart(2, '0')}`;
    if (nxIso !== sorted[i + 1] || !a.in || !b.in) continue;
    if (sameHours(a, prevDays[sorted[i]]) && sameHours(b, prevDays[sorted[i + 1]])) continue;
    const old = `Ngày ${sorted[i]}: giờ ra không được sau giờ vào ngày hôm sau (${b.extraIn || b.in})`;
    warnIf('SHEET_DAYS_OVERLAP', punch.workBounds(a, sorted[i]).end > punch.workBounds(b, sorted[i + 1]).start, {
      message: `${old}. ${overlapNote}`,
      details: { date: sorted[i] }
    });
  }
  // Chồng giờ qua ranh giới tháng: ngày cuối tháng trước ↔ ngày 1 tháng này, ngày cuối tháng này ↔ ngày 1 tháng sau (chỉ kiểm khi ngày giáp ranh của tháng này vừa đổi)
  {
    const nb = neighborDays(u.username, month),
      isW = x => x && x.kind === 'work' && x.in && x.out;
    const changed = d => !sameHours(clean[d], prevDays[d]);
    const first = `${month}-01`,
      last = `${month}-${String(new Date(my, mm, 0).getDate()).padStart(2, '0')}`;
    for (const [d, x] of Object.entries(nb)) {
      if (d < first && changed(first) && isW(x) && isW(clean[first])) {
        const old = `Ngày ${first}: giờ vào ${clean[first].extraIn || clean[first].in} không được trước giờ ra ngày ${d} (${x.extraOut || x.out})`;
        warnIf('SHEET_DAYS_OVERLAP', punch.workBounds(x, d).end > punch.workBounds(clean[first], first).start, {
          message: `${old}. ${overlapNote}`,
          details: { date: first }
        });
      }
      if (d > last && changed(last) && isW(clean[last]) && isW(x)) {
        const old = `Ngày ${last}: giờ ra ${clean[last].extraOut || clean[last].out} không được sau giờ vào ngày ${d} (${x.extraIn || x.in})`;
        warnIf('SHEET_DAYS_OVERLAP', punch.workBounds(clean[last], last).end > punch.workBounds(x, d).start, {
          message: `${old}. ${overlapNote}`,
          details: { date: last }
        });
      }
    }
  }
  for (const d of Object.keys(clean)) {
    if (!d.startsWith(month)) throw new HttpError(400, `Ngày ${d} không thuộc tháng ${month}`);
    const [y, m, dd] = d.split('-').map(Number);
    const dow = new Date(y, m - 1, dd).getDay(),
      inSched = ws.isWorkDay(sched, d);
    // ngày đã lưu và không đổi giữ nguyên dù nay nằm ngoài lịch (lịch đổi sau khi khai: "ngày mồ côi"): không chặn cả lần lưu, nhân sự vẫn xoá hoặc sửa được ngày khác
    const c = clean[d],
      p = prevDays[d];
    const unchanged =
      p &&
      p.kind === c.kind &&
      p.in === c.in &&
      p.out === c.out &&
      (p.extraKind || '') === c.extraKind &&
      (p.extraIn || '') === c.extraIn &&
      (p.extraOut || '') === c.extraOut;
    // Loại ngày 'makeup' (làm bù cả ngày) không còn: khai mới hoặc sửa thì chặn; ngày đã lưu gửi lại không đổi thì giữ
    // nguyên (bộ máy tính 0) để lưu được các ngày khác
    if (c.kind === 'makeup' && !unchanged)
      throw new HttpError(
        400,
        'Không còn loại ngày Làm bù cả ngày. Giờ làm bù khai ở ngày đi làm, trước hoặc sau ca.',
        { code: 'SHEET_MAKEUP_DAY_REMOVED', date: d }
      );
    if (c.kind === 'makeup')
      warn(
        'SHEET_MAKEUP_DAY_LEGACY',
        `Ngày ${dm(d)}: loại Làm bù cả ngày không còn dùng, không tính lương. Hãy khai lại.`,
        {
          details: { date: d }
        }
      );
    // Chủ nhật hoặc ngày ngoài lịch. Ca chính của ngày ngoài lịch không có tiền; chỉ đoạn OT đã duyệt và có chấm công liền mạch được trả (extraOnly)
    warnIf('SHEET_SUNDAY', dow === 0, {
      message: `Ngày ${d} là Chủ nhật, không chấm công hay làm bù`,
      consequence: 'Ca chính không có tiền (0 ₫); chỉ đoạn OT đã được duyệt và có chấm công mới được trả.',
      details: { date: d }
    });
    // iSAT chặn cứng: chỉ vào thứ isat.weekday và chỉ chức vụ có quyền lợi iSAT; ngày iSAT đã lưu và không đổi loại giữ nguyên
    if (clean[d].kind === 'isat' && prevDays[d]?.kind !== 'isat') {
      const refusal = isatRefusal({ params: sheetParams, staff: u, date: d });
      if (refusal) throw new HttpError(400, refusal.message, { code: refusal.code, date: d });
    }
    if (dow !== 0)
      warnIf('SHEET_OFF_SCHEDULE', !inSched && !unchanged && c.kind !== 'unpaid', {
        message: `Ngày ${d} nằm ngoài lịch làm việc, chỉ được khai nghỉ không lương`,
        consequence: 'Ca chính không có tiền (0 ₫); chỉ đoạn OT đã được duyệt và có chấm công mới được trả.',
        details: { date: d }
      });
    // Không khai làm bù vào ngày lễ, chặn: giờ làm bù kèm ngày đi làm, ngày làm bù dự kiến của "Nghỉ, sẽ làm bù". Bộ máy không trả giờ làm bù ngày lễ. Ngày đã lưu và không đổi (lễ thêm sau khi khai) giữ nguyên.
    const planDates = x =>
      x && x.kind === 'willmakeup' ? [...(x.makeupPlans || []).map(plan => plan.date), x.makeupDate] : [];
    const holidayMakeup = [
      ...(c.extraKind === 'makeup' && !unchanged ? [d] : []),
      ...planDates(c).filter(x => x && !planDates(p).includes(x))
    ].find(x => holidays.has(x));
    if (holidayMakeup)
      throw new HttpError(400, `Ngày ${dm(holidayMakeup)} là ngày lễ: không khai làm bù vào ngày lễ.`, {
        code: 'SHEET_MAKEUP_ON_HOLIDAY'
      });
    // Nhân sự tự khai: giờ ngày đi làm theo ca cố định Admin gán (nhân sự không tự chọn ca), mã ca của ngày luôn là ca được gán.
    // Chỉ so loại ngày, giờ vào và giờ ra với ngày đã lưu (giao diện cho thêm OT / làm bù vào ngày cũ lệch ca nên phần làm thêm
    // không tính ở đây). Các đoạn làm thêm tự do vì được duyệt riêng; chưa gán ca thì khai tự do.
    // Admin khai thay: ca của ngày là ca Admin chọn (mọi ca trong danh mục), không phải ca được gán; ngày đó tính phụ cấp ca, giờ nghỉ,
    // giờ thiếu theo ca này (lib/domain/attendance/admin-presence.js dựng lượt theo ca này, bộ máy đọc mã ca của ngày).
    const assigned = punch.SHIFT[u.shiftCode];
    if (c.kind === 'work' && onBehalf) {
      c.preset = adminShiftOf(punch, c, u.shiftCode);
      // Giờ khai không khớp ca nào trong danh mục và Admin không chọn ca: không âm thầm tính theo ca được gán. Ngày lưu từ trước không đổi giữ nguyên
      warnIf('SHEET_ADMIN_SHIFT_REQUIRED', !c.preset && !unchanged, {
        message: `Ngày ${dm(d)}: giờ ${c.in}–${c.out} không khớp ca nào trong danh mục. Hãy chọn ca cho ngày này.`,
        consequence: `Chưa chọn ca thì ngày này tính theo ca được gán${assigned ? ` (${assigned[0]}–${assigned[1]})` : ', mà người này chưa được gán ca nên chưa ghi được giờ có mặt và ngày không có tiền'}.`,
        details: { date: d }
      });
    } else if (c.kind === 'work' && assigned) {
      if (c.in === assigned[0] && c.out === assigned[1]) c.preset = u.shiftCode;
      else {
        // Ngày đã lưu không đổi giờ (ví dụ ngày Admin khai thay theo ca khác) giữ mã ca đã lưu; ngày khai mới lệch ca thì bỏ mã ca do
        // nhân sự gửi: ngày vẫn tính theo ca được gán
        const kept = !!p && p.kind === 'work' && p.in === c.in && p.out === c.out;
        c.preset = kept && p.preset && Object.hasOwn(punch.SHIFT, p.preset) ? p.preset : '';
        // Giờ khai rộng hơn ca được gán mà không khai làm thêm: ngày có Check-in/out tính theo ca được gán (ActualHours.apply), phần ngoài ca không có tiền
        const wider = outsideShift(c, assigned[0], assigned[1]).wraps && !c.extraKind;
        // Ngày lễ: giờ vào – ra là khung giờ OT ngày lễ, không phải ca, nên không so với ca được gán
        warnIf('SHEET_SHIFT_MISMATCH', !kept && !holidays.has(d), {
          message: wider
            ? `Ngày ${dm(d)}: giờ khai ${c.in}–${c.out} rộng hơn ca cố định ${assigned[0]}–${assigned[1]} do Admin gán. Ngày có Check-in/out tính theo ca được gán: giờ ngoài ca không được trả nếu không khai là OT hoặc làm bù theo giờ (chọn ca được gán rồi nhập giờ trước/sau ca).`
            : `Ngày ${dm(d)}: giờ khai khác ca cố định ${assigned[0]}–${assigned[1]} do Admin gán: ngày vẫn tính phụ cấp ca theo ca được gán; Admin sẽ xem lại.`,
          details: { date: d }
        });
      }
    }
    // Làm bù / OT không được rơi vào khung 22h–6h (ngày đã lưu từ trước và không đổi giờ thì giữ nguyên): chỉ xét đoạn trước ca và sau ca
    warnIf(
      'SHEET_EXTRA_NIGHT',
      !unchanged &&
        ((c.extraIn && overlapsNight(toMin(c.extraIn), toMin(c.in))) ||
          (c.extraOut && overlapsNight(toMin(c.out), toMin(c.extraOut)))),
      {
        message: `Ngày ${dm(d)}: giờ làm thêm rơi vào khung 22h–6h: ${pendingText}.`,
        details: { date: d }
      }
    );
    // OT ngày lễ được khai và được trả, làm bao nhiêu giờ tính bấy nhiêu; chỉ phút nằm trong ngày lễ
    // hưởng giá OT ngày lễ, phút sang ngày thường (sau 0 giờ) tính như OT thường. Làm bù ngày lễ chặn ở trên. Chỉ báo (không chặn)
    // khi đoạn OT tràn sang ngày thường kề bên, để người khai biết phần đó không hưởng giá ngày lễ.
    if (!unchanged && holidays.has(d) && c.extraKind === 'ot' && c.in && c.out) {
      const start = toMin(c.in),
        end = start + (gap(c.in, c.out) || 1440);
      const near = shift => {
        const x = new Date(y, m - 1, dd + shift);
        return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
      };
      const other =
        c.extraOut && end + gap(c.out, c.extraOut) > 1440 && !holidays.has(near(1))
          ? near(1)
          : c.extraIn && start - gap(c.extraIn, c.in) < 0 && !holidays.has(near(-1))
            ? near(-1)
            : '';
      if (other)
        warn(
          'SHEET_EXTRA_ON_HOLIDAY',
          `Ngày ${dm(d)} là ngày lễ: giờ OT nằm trong ngày ${dm(d)} tính giá OT ngày lễ, giờ OT sang ngày ${dm(other)} (ngày thường) tính như OT thường${onBehalf ? '.' : ', sau khi Admin duyệt.'}`,
          { details: { date: d } }
        );
    }
    // Quyền lợi của chức vụ / bậc (làm bù theo giờ). Bộ máy không kiểm cờ này: khoản vẫn chờ duyệt và nếu được duyệt thì có tiền
    if (!unchanged) checkRequestFlags(flags, c, d, { onBehalf });
    warnIf('BENEFIT_NOT_ALLOWED', clean[d].extraKind === 'ot' && !canOt, {
      message: 'Chức vụ của bạn không có overtime',
      consequence: `Ngày ${d}: OT khai không được trả tiền (0 ₫) dù Admin duyệt.`
    });
    // Làm ngày lễ là OT: ngày lễ trong lịch khai đi làm (giờ vào – ra là khung giờ OT) cũng cần quyền lợi OT, cùng cách từ chối / cảnh báo như OT ngày thường
    warnIf(
      'BENEFIT_NOT_ALLOWED',
      !unchanged && inSched && holidays.has(d) && c.kind === 'work' && !!c.in && !!c.out && !canOt,
      {
        message: 'Chức vụ của bạn không có overtime',
        consequence: `Ngày ${d}: OT ngày lễ không được trả tiền (0 ₫) dù Admin duyệt; ngày lễ chỉ nhận lương ngày lễ (nếu chức vụ có).`
      }
    );
    // Giữ ngày cũ chưa đổi loại để có thể sửa/xóa từng ngày sau khi chuyển nhóm.
    // Không cho nhóm mới thêm, chuyển loại hoặc khôi phục ngày nghỉ được duyệt.
    warnIf('BENEFIT_NOT_ALLOWED', clean[d].kind === 'approved' && !canApproved && prevDays[d]?.kind !== 'approved', {
      message: `Ngày ${d}: chức vụ của bạn không có quyền lợi nghỉ được duyệt: ngày này chờ Admin duyệt, không lương.`
    });
    warnIf(
      'BENEFIT_NOT_ALLOWED',
      !canDeclareAbsence && (clean[d].kind === 'leave' || (clean[d].kind === 'unpaid' && inSched)),
      {
        message: `Ngày ${d}: chức vụ của bạn không khai nghỉ được ở ngày trong lịch: khoản chờ Admin xem lại; ngày nghỉ không lương không được trả tiền.`
      }
    );
  }
  // phép năm: ngày phép chờ duyệt hoặc đã duyệt tính là đã dùng (chờ duyệt giữ chỗ); ngày bị từ chối trả lại phép (leaveDates)
  {
    const all = leaveDates(u, { month, days: clean });
    // T2–T6 còn phép năm thì phải dùng phép năm, không được chọn "Nghỉ không lương" (thứ 7 chọn tự do; ngày đã lưu từ trước giữ nguyên)
    if (hasLeaveAccount)
      for (const [d, x] of Object.entries(clean)) {
        if (x.kind !== 'unpaid' || prevDays[d]?.kind === 'unpaid') continue;
        const [y, m, dd] = d.split('-').map(Number),
          dow = new Date(y, m - 1, dd).getDay();
        const dayBefore = rulesFor(d.slice(0, 7)).leave.ledger(
          u,
          all.filter(x2 => x2 < d),
          d
        );
        const left = dayBefore.total - dayBefore.expired - dayBefore.used;
        // chỉ ngày thường nằm trong lịch của người
        warnIf('SHEET_UNPAID_WITH_LEAVE', dow >= 1 && dow <= 5 && ws.isWorkDay(sched, d) && left >= 1 - 1e-6, {
          message: `Ngày ${d}: còn ${left} ngày phép năm — ngày thường phải dùng phép năm trước, hết phép mới được nghỉ không lương`,
          consequence: 'Chọn nghỉ không lương thì ngày này không được trả lương và không trừ vào số phép còn lại.',
          details: { date: d }
        });
      }
  }
  checkDayHours({ params: sheetParams, clean, prevDays, holidays });
  return { sheetParams, sched, holidays };
}

// Khoá lạc quan của lịch khai: expectedRev là rev trong GET /api/sheet mà người gọi đã thấy; lệch thì 409 SHEET_STALE và không ghi gì.
// Thiếu expectedRev thì ghi đè, không so rev. Mỗi lần store.setSheet tăng rev; Admin duyệt KPI không tăng. Gọi trong cùng transaction với setSheet.
function assertSheetRev(username, month, expectedRev) {
  if (expectedRev === undefined) return;
  if (!Number.isInteger(expectedRev) || expectedRev < 0)
    throw new HttpError(400, 'expectedRev phải là số nguyên không âm');
  const { rev } = store.getSheet(username, month);
  if (rev !== expectedRev)
    throw new HttpError(409, 'Lịch tháng này vừa được người khác sửa, tải lại rồi làm lại', {
      code: 'SHEET_STALE',
      rev
    });
}

module.exports = { checkSheet, assertSheetRev, checkExtraTimes, dm };
