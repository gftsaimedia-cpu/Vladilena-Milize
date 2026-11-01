// "Nghỉ được duyệt" ĐÃ DUYỆT cũng là ngày nghỉ: tính vào ngày nghỉ xét chuyên cần và giờ vượt ngưỡng y như
// "Nghỉ không lương" (chuyên cần: cứ nghỉ là tính, kể cả phép năm).
// Khoá request.type.approved.countsAbsent (mặc định Có) bật quy tắc này; Không = loại nghỉ này không tính là ngày nghỉ.
// NV bậc 1 (6.000.000 ₫), tháng 10/2026, 26 ngày công chuẩn: lương ngày 230.769,23; chuyên cần 25% và đi lại 15% nhân
// (số ngày đi làm / 26). Người giả, tháng bịa.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Params = require('../helpers/defaults-old-basis.js');
const PayrollEngine = require('../../src/engine/payroll-engine');
const { declaredPunches } = require('../helpers/declared-punches');

const D = Params.DEFAULTS;
const MONTH = '2026-10';
const STAFF = { username: 'qa_duyet', type: 'nv', level: 1, nightPct: 40, startDate: '2025-01-06' };
const workday = {
  kind: 'work',
  shift: 'normal',
  in: '08:00',
  out: '17:00',
  extraKind: '',
  extraIn: '',
  extraOut: '',
  preset: '',
  breakMin: 0
};
const dateOf = (day?) => `${MONTH}-${String(day).padStart(2, '0')}`;

// Tháng 10/2026: Thứ 2 – Thứ 7 đi làm (27 ngày); các ngày trong `dates` đổi sang `kind`.
// kind 'approved' thì có thêm dòng duyệt đã đồng ý (dấu vân tay 'approved' khớp ngày nghỉ được duyệt).
function month(params?, kind?, dates?) {
  const days: Record<string, any> = {};
  for (let d = 1; d <= 31; d++) {
    if (new Date(Date.UTC(2026, 9, d)).getUTCDay() === 0) continue;
    days[dateOf(d)] = { ...workday };
  }
  const approvals: Record<string, any> = {};
  for (const d of dates) {
    days[dateOf(d)] = { kind };
    if (kind === 'approved')
      approvals[dateOf(d)] = { item: 'approved', status: 'approved', fingerprint: 'approved', rev: 1 };
  }
  return PayrollEngine.create(params).computeMonth({
    staff: STAFF,
    days,
    approvals,
    sessions: declaredPunches(STAFF, days),
    kpi: { pct: null, amt: null, admPct: null, admAmt: null },
    holidays: [],
    month: MONTH,
    upTo: null,
    asOf: `${MONTH}-31T09:00:00+07:00`
  }).m;
}
const vnd = (value?) => Math.round(value || 0);

test('Đ43: 3 ngày "Nghỉ được duyệt" đã duyệt mất chuyên cần, ra đúng số của 3 ngày nghỉ không lương: 6.369.231', async () => {
  const duyet = await month(D, 'approved', [5, 6, 7]);
  const khongLuong = await month(D, 'unpaid', [5, 6, 7]);
  assert.equal(duyet.approved, 3, 'vẫn ghi nhận đúng 3 ngày nghỉ được duyệt');
  assert.equal(duyet.unpaid, 0, 'không bị đổi thành nghỉ không lương');
  assert.equal(vnd(duyet.absent), 3, 'nghỉ được duyệt tính là ngày nghỉ xét chuyên cần');
  assert.equal(vnd(duyet.overHours), 24, '8 giờ mỗi công: 3 ngày = 24 giờ vượt ngưỡng');
  assert.equal(duyet.attendOk, false);
  assert.equal(vnd(duyet.attendance), 0, 'mất phụ cấp chuyên cần');
  assert.equal(vnd(duyet.total), 6369231);
  // 24 ngày x 230.769,23 = 5.538.461 + đi lại 900.000 x 24/26 = 830.769
  assert.equal(vnd(duyet.total), vnd(khongLuong.total), 'giống hệt nghỉ không lương');
});

test('Đ43: 2 ngày "Nghỉ được duyệt" đã duyệt chưa mất chuyên cần (2 < 3 ngày, 16 < 24 giờ): 8.076.924', async () => {
  const m = await month(D, 'approved', [5, 6]);
  assert.equal(vnd(m.absent), 2);
  assert.equal(vnd(m.overHours), 16);
  assert.equal(m.attendOk, true);
  assert.equal(vnd(m.attendance), 1442308, 'chuyên cần 1.500.000 x 25/26');
  assert.equal(vnd(m.total), 8076924);
});

test('Đ43: tắt request.type.approved.countsAbsent thì trở lại cách cũ (miễn chuyên cần): 7.753.846', async () => {
  const off = await month({ ...D, 'request.type.approved.countsAbsent': false }, 'approved', [5, 6, 7]);
  assert.equal(off.approved, 3);
  assert.equal(vnd(off.absent), 0, 'miễn: không tính là ngày nghỉ');
  assert.equal(vnd(off.overHours), 0);
  assert.equal(off.attendOk, true);
  assert.equal(vnd(off.attendance), 1384615, 'chuyên cần 1.500.000 x 24/26');
  assert.equal(vnd(off.total), 7753846);
});

test('Đ43: tháng đủ công 8.723.076 — mốc so sánh', async () => {
  const m = await month(D, 'work', []);
  assert.equal(vnd(m.absent), 0);
  assert.equal(vnd(m.attendance), 1557692);
  assert.equal(vnd(m.total), 8723076);
});
