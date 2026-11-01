'use strict';
const paramsStore = require('../params/store');
const paramsSave = require('../params/save');
const { rulesFor } = require('../platform/request-rules');
const { container } = require('./container');

// Ca làm (Cài đặt › Kỳ lương & chấm công › Ca làm): bao quanh các khoá shift.preset.<mã>.in | out của registry. Quyền: config.read để xem; năng lực sửa,
// tháng áp dụng, lý do, khoá kỳ, nhật ký và kiểm giờ ca đi qua src/params/save.ts như mọi tham số (PUT /api/settings/params làm được y hệt).
// GET /api/settings/shifts?month=      { month, paramsRev, editable, hours, shifts: [{ code, preset, name, kind, in, out }] }
// PUT /api/settings/shifts             { shifts: [{ code, in, out }], effectiveMonth?, reason, expectedRev? } → như PUT /api/settings/params
// Mã ca là mã của danh mục ca (Normal1…Night2, bảng work_shifts); giờ vẫn nằm ở khoá cũ shift.preset.<preset>.in | out.
// Đầu vào nhận cả mã mới lẫn mã cũ.

// Các ca đang dùng của tháng: ca trong danh mục (theo thứ tự danh mục) có giờ trong bộ tham số, rồi giờ ca không có trong danh mục (nếu có) theo mã
async function shiftsOf(month?) {
  const hours = (await rulesFor(month)).punch.SHIFT;
  const listed = (await container.shifts.list({ includeDeprecated: false })).filter(sh =>
    Object.hasOwn(hours, sh.preset)
  );
  const covered = new Set<any>(listed.map(sh => sh.preset));
  const extra = Object.keys(hours)
    .filter(preset => !covered.has(preset))
    .sort()
    .map(preset => ({ code: preset, preset, name: preset.toUpperCase(), kind: null }));
  return [...listed.map(sh => ({ code: sh.code, preset: sh.preset, name: sh.name, kind: sh.kind })), ...extra].map(
    sh => ({
      ...sh,
      in: hours[sh.preset][0],
      out: hours[sh.preset][1]
    })
  );
}
// Tên đọc được của một ca (mã mới hoặc cũ): "Normal 1 08:00–17:00" (cùng dạng với bảng ca của màn Admin)
async function labelOf(code?, month?) {
  const hours = (await rulesFor(month)).punch.SHIFT[code];
  if (!hours) return null;
  const shift = await container.shifts.find(code);
  return `${shift ? shift.name : String(code).toUpperCase()} ${hours[0]}–${hours[1]}`;
}

async function view(month?) {
  const resolved = await paramsStore.resolve(month);
  return {
    month,
    paramsRev: resolved.rev,
    editable: paramsSave.shiftEditAllowed(),
    // ca dài đúng (giờ làm mỗi công + giờ nghỉ), giữ loại ca, không trùng cặp giờ: máy chủ kiểm khi lưu
    hours: resolved.params['time.workHoursPerDay'] + resolved.params['time.breakHours'],
    shifts: await shiftsOf(month)
  };
}

// Cấu hình ca cho NHÂN VIÊN (đi kèm GET / POST /api/punch, vì họ không có config.read nên không đọc được /api/settings/shifts):
// giờ từng ca, được Check-in sớm bao nhiêu giờ, lượt mở quá bao nhiêu giờ là quên Check-out. Mọi số lấy từ tham số của tháng, chỉ để hiển thị.
async function employeeView(month?) {
  const { params } = await paramsStore.resolve(month);
  return {
    shifts: Object.fromEntries(
      (await shiftsOf(month)).map(sh => [sh.code, { name: sh.name, start: sh.in, end: sh.out }])
    ),
    earlyCheckinHours: params['attendance.earlyCheckinMaxHours'],
    openSessionMaxHours: params['attendance.openSessionMaxHours']
  };
}

export = { view, labelOf, employeeView, shiftsOf };
