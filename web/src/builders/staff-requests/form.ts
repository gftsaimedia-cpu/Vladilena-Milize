// Biểu mẫu gửi yêu cầu theo ngày: ngữ cảnh (ca được gán, phép còn lại, ngày lễ), đổi biểu mẫu thành ngày gửi PUT /sheet.

/** Ngữ cảnh biểu mẫu từ GET /me, GET /punch (shiftConfig) và GET /sheet của tháng hiện tại. */
export function buildFormContext({ me, today, punch, sheet }: any) {
  const shifts = (punch && punch.shiftConfig && punch.shiftConfig.shifts) || {};
  const shift = shifts[me.user && me.user.shiftCode] || null;
  const left =
    sheet && sheet.leaveBalance && Number.isFinite(sheet.leaveBalance.remaining) ? sheet.leaveBalance.remaining : null;
  return {
    today,
    shiftName: shift ? `${shift.name} · ${shift.start}–${shift.end}${shift.end <= shift.start ? ' hôm sau' : ''}` : '',
    shiftStart: shift ? shift.start : '',
    shiftEnd: shift ? shift.end : '',
    leaveLeft: left,
    holidays: Array.isArray(me.holidays) ? me.holidays : []
  };
}

/** Ngày lễ: giờ khai là khung giờ đi làm; ngày thường: giờ khai là đoạn làm thêm trước/sau ca. */
export const isHolidayDate = (ctx?, date?) => !!date && ctx.holidays.includes(date);

/** Câu báo thiếu ô (chỉ kiểm thiếu ô; đúng sai nghiệp vụ do máy chủ báo). Chuỗi rỗng khi đủ. */
export function checkForm(form?, ctx?) {
  if (!form.date) return 'Chọn ngày cần khai.';
  if (form.type !== 'di-lam') return '';
  if (isHolidayDate(ctx, form.date)) return !form.start || !form.end ? 'Điền giờ bắt đầu và giờ kết thúc.' : '';
  if (!ctx.shiftStart || !ctx.shiftEnd) return 'Bạn chưa được gán ca.';
  if (!form.start && !form.end) return 'Điền giờ bắt đầu hoặc giờ kết thúc.';
  if (!(Number(form.outMinutes) >= 0)) return 'Số phút ra khỏi văn phòng phải từ 0 trở lên.';
  return '';
}

/** Biểu mẫu → ngày gửi lên máy chủ; ô trống thì bỏ khoá. */
export function dayFromRequest(form?, ctx?) {
  switch (form.type) {
    case 'phep-nam':
      return { kind: 'leave' };
    case 'khong-luong':
      return { kind: 'unpaid' };
    case 'duyet':
      return { kind: 'approved' };
    case 'lam-bu':
      return { kind: 'willmakeup' };
    default: {
      const breakMin = Math.round(Number(form.outMinutes) || 0);
      if (isHolidayDate(ctx, form.date)) return { kind: 'work', in: form.start, out: form.end, breakMin };
      const day: Record<string, any> = {
        kind: 'work',
        in: ctx.shiftStart,
        out: ctx.shiftEnd,
        breakMin,
        extraKind: form.kind === 'lam-bu' ? 'makeup' : 'ot'
      };
      if (form.start) day.extraIn = form.start;
      if (form.end) day.extraOut = form.end;
      return day;
    }
  }
}
