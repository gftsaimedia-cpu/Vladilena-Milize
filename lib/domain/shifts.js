'use strict';
const paramsStore = require('../params/store');
const paramsSave = require('../params/save');
const events = require('../events');
const { HttpError, send, readJson } = require('../http');
const { validMonth } = require('./input');
const { rulesFor, vnToday } = require('../request-rules');
const { container } = require('./container');

// Ca làm (Cài đặt › Kỳ lương & chấm công › Ca làm): bao quanh các khoá shift.preset.<mã>.in | out của registry. Quyền: config.read để xem; năng lực sửa,
// tháng áp dụng, lý do, khoá kỳ, nhật ký và kiểm giờ ca đi qua lib/params/save.js như mọi tham số (PUT /api/settings/params làm được y hệt).
// GET /api/settings/shifts?month=      { month, paramsRev, editable, hours, shifts: [{ code, preset, name, kind, in, out }] }
// PUT /api/settings/shifts             { shifts: [{ code, in, out }], effectiveMonth?, reason, expectedRev? } → như PUT /api/settings/params
// Mã ca là mã của danh mục ca (Normal1…Night2, bảng work_shifts); giờ vẫn nằm ở khoá cũ shift.preset.<preset>.in | out.
// Đầu vào nhận cả mã mới lẫn mã cũ.
const bad = (message, code) => new HttpError(400, message, { code });

// Các ca đang dùng của tháng: ca trong danh mục (theo thứ tự danh mục) có giờ trong bộ tham số, rồi giờ ca không có trong danh mục (nếu có) theo mã
function shiftsOf(month) {
  const hours = rulesFor(month).punch.SHIFT;
  const listed = container.shifts.list({ includeDeprecated: false }).filter(sh => Object.hasOwn(hours, sh.preset));
  const covered = new Set(listed.map(sh => sh.preset));
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
function labelOf(code, month) {
  const hours = rulesFor(month).punch.SHIFT[code];
  if (!hours) return null;
  const shift = container.shifts.find(code);
  return `${shift ? shift.name : String(code).toUpperCase()} ${hours[0]}–${hours[1]}`;
}

function view(month) {
  const resolved = paramsStore.resolve(month);
  return {
    month,
    paramsRev: resolved.rev,
    editable: paramsSave.shiftEditAllowed(),
    // ca dài đúng (giờ làm mỗi công + giờ nghỉ), giữ loại ca, không trùng cặp giờ: máy chủ kiểm khi lưu
    hours: resolved.params['time.workHoursPerDay'] + resolved.params['time.breakHours'],
    shifts: shiftsOf(month)
  };
}

// Cấu hình ca cho NHÂN VIÊN (đi kèm GET / POST /api/punch, vì họ không có config.read nên không đọc được /api/settings/shifts):
// giờ từng ca, được Check-in sớm bao nhiêu giờ, lượt mở quá bao nhiêu giờ là quên Check-out. Mọi số lấy từ tham số của tháng, chỉ để hiển thị.
function employeeView(month) {
  const { params } = paramsStore.resolve(month);
  return {
    shifts: Object.fromEntries(shiftsOf(month).map(sh => [sh.code, { name: sh.name, start: sh.in, end: sh.out }])),
    earlyCheckinHours: params['attendance.earlyCheckinMaxHours'],
    openSessionMaxHours: params['attendance.openSessionMaxHours']
  };
}

async function handle({ req, res, url, me, actx }) {
  if (req.method === 'GET') {
    const month = url.searchParams.get('month') || vnToday().slice(0, 7);
    if (!validMonth(month)) throw bad('month phải dạng YYYY-MM', 'BAD_MONTH');
    return send(res, 200, view(month));
  }
  const b = await readJson(req);
  if (!b || typeof b !== 'object' || !Array.isArray(b.shifts) || !b.shifts.length)
    throw bad('shifts phải là mảng { code, in, out }', 'SHIFTS_REQUIRED');
  const known = Object.keys(rulesFor().punch.SHIFT);
  const changes = [];
  for (const item of b.shifts) {
    const preset = item && typeof item === 'object' ? container.shifts.presetOf(item.code) || item.code : null;
    if (!preset || !known.includes(preset))
      throw bad(
        `Mã ca phải là một trong: ${shiftsOf(vnToday().slice(0, 7))
          .map(sh => sh.code)
          .join(', ')}`,
        'SHIFT_UNKNOWN'
      );
    changes.push(
      { key: `shift.preset.${preset}.in`, value: item.in },
      { key: `shift.preset.${preset}.out`, value: item.out }
    );
  }
  // expectedRev bắt buộc (không tự điền): thiếu là 400 PARAM_REV_REQUIRED, lệch là 409 PARAMS_STALE (lib/params/save.js)
  const saved = paramsSave.save(me, actx, {
    changes,
    effectiveMonth: b.effectiveMonth,
    reason: b.reason,
    expectedRev: b.expectedRev,
    acknowledge: b.acknowledge
  });
  if (saved.notice) events.emit.paramsChanged(saved.notice);
  return send(res, 200, saved);
}

module.exports = { handle, view, labelOf, employeeView };
