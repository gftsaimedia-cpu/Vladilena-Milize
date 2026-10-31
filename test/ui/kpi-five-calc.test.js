// KPI 5 thành phần trong calcMonth (khối công thức đóng băng chạy trong vm, không DOM, không DB).
// Giả định về giao diện mô-đun:
//   - public/kpi-score.js gán window.KpiScore (như PayrollCalendar); khối công thức dùng KpiScore.evaluate / KpiScore.pay.
//   - calcMonth(staff, days, kin, ...) nhận kin = { method: 'five'|'legacy', parts: {wework,user,peer,manager,self}|null,
//     amt, admAmt, pct, admPct }. Thiếu method nghĩa là 'legacy'.
//   - kết quả nhánh five: kpiMethod 'five', kpiParts, kpiPct (= tổng % hoặc null khi chưa đủ điểm), kpiGate (= weworkOk),
//     kpiPass (đạt: true/false, null khi chưa đủ điểm), kpiApproved (= đủ điểm), kpiAmt, kpiPay, kpiRatio.
//   - mức KPI nhánh five = admAmt (đã duyệt) nếu có, ngược lại amt (đề xuất), ngược lại KPI tối đa; luôn kẹp 0 … tối đa của level.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadPayroll } = require('../helpers/payroll-vm');

// Nạp kpi-score.js cùng khối công thức. Chưa có mô-đun thì mỗi test của nhánh five thất bại ở phép kiểm kết quả, và test "nạp được" nêu rõ lý do.
let loadError = null,
  sandbox = null,
  calcMonth = null;
try {
  ({
    context: sandbox,
    api: { calcMonth }
  } = loadPayroll({ libs: ['payroll-calendar', 'kpi-score'], exports: ['calcMonth'], timeout: 1000 }));
} catch (error) {
  loadError = error;
}

const nv1 = { type: 'nv', level: 1, nightPct: 40 };
const nv2 = { type: 'nv', level: 2, nightPct: 40 };
const workDay = { '2026-10-06': { kind: 'work', in: '08:00', out: '17:00' } };
const parts = (wework, user, peer, manager, self) => ({ wework, user, peer, manager, self });
const five = (p, extra = {}) => ({ method: 'five', parts: p, ...extra });
const kpiOf = (staff, kin, days = workDay) => calcMonth(staff, days, kin, [], '2026-10', null);
const LEGACY_FIELDS = ['kpiPay', 'kpiPct', 'kpiAmt', 'kpiPass', 'kpiApproved', 'kpiRatio', 'total', 'net'];
const pick = (r, fields) => Object.fromEntries(fields.map(f => [f, r[f]]));

// Mọi ngày Thứ 2 – Thứ 7 của tháng 10/2026 (NV làm Mon–Sat)
const monSat = [];
for (let d = 1; d <= 31; d++) {
  const dow = new Date(2026, 9, d).getDay();
  if (dow !== 0) monSat.push(`2026-10-${String(d).padStart(2, '0')}`);
}

test('public/kpi-score.js nạp được vào vm và gán window.KpiScore (không DOM, không require)', () => {
  if (loadError) throw loadError;
  assert.equal(typeof sandbox.KpiScore, 'object');
  assert.equal(typeof sandbox.KpiScore.evaluate, 'function');
});

// ================= công tắc chưa đặt: kết quả theo cách legacy =================

test('công tắc chưa đặt: cách cũ không đổi (tự chấm 75% × 6.000.000 = 4.500.000; 100% = 6.000.000; dưới 75% = 0)', async () => {
  assert.equal((await kpiOf(nv1, { pct: 75, amt: 6000000 })).kpiPay, 4500000);
  assert.equal((await kpiOf(nv1, { pct: 100, amt: 6000000 })).kpiPay, 6000000);
  assert.equal((await kpiOf(nv1, { pct: 74.99, amt: 6000000 })).kpiPay, 0);
  assert.equal((await kpiOf(nv1, { pct: null, amt: 6000000 })).kpiPay, 0);
});

test('công tắc chưa đặt: Admin duyệt 80% × 4.000.000 vẫn ra 3.200.000 ₫ (ví dụ LUAT-DU-AN 8.3)', async () => {
  const r = await kpiOf(nv1, { pct: 100, amt: 6000000, admPct: 80, admAmt: 4000000 });
  assert.equal(r.kpiApproved, true);
  assert.equal(r.kpiPct, 80);
  assert.equal(r.kpiPay, 3200000);
  assert.notEqual(r.kpiMethod, 'five');
});

test('công tắc chưa đặt: có hay không có method:"legacy", có hay không có parts, kết quả KPI giống hệt nhau', async () => {
  const base = { pct: 90, amt: 5000000, admPct: 85, admAmt: 4000000 };
  const expected = pick(await kpiOf(nv1, base), LEGACY_FIELDS);
  assert.equal(expected.kpiPay, 3400000);
  for (const kin of [
    { ...base, method: 'legacy' },
    { ...base, method: 'legacy', parts: parts(100, 100, 100, 100, 100) },
    { ...base, parts: parts(100, 100, 100, 100, 100) } // thiếu method: coi là legacy, parts bị bỏ qua
  ])
    assert.deepEqual(pick(await kpiOf(nv1, kin), LEGACY_FIELDS), expected);
});

test('cách cũ: số thay vì đối tượng, TTS không có KPI, trần level vẫn kẹp', async () => {
  assert.equal((await kpiOf(nv1, 100)).kpiPay, 6000000);
  assert.equal((await kpiOf({ type: 'tts', level: 1 }, { pct: 100, amt: 6000000 })).kpiPay, 0);
  assert.equal((await kpiOf({ type: 'ctv', level: 1 }, { pct: 100, amt: 6000000 })).kpiPay, 1500000);
  assert.equal((await kpiOf(nv1, { pct: 100, amt: 9000000 })).kpiPay, 6000000);
});

// ================= từ tháng chuyển đổi: nhánh five, 12 trường hợp =================

const CASES = [
  { n: 1, staff: nv1, p: parts(100, 100, 100, 100, 100), kin: { amt: 6000000 }, pay: 6000000, pct: 100, pass: true },
  { n: 2, staff: nv1, p: parts(100, 90, 80, 85, 100), kin: { amt: 6000000 }, pay: 5532000, pct: 92.2, pass: true },
  { n: 3, staff: nv1, p: parts(80, 70, 70, 70, 70), kin: { amt: 6000000 }, pay: 0, pct: 74, pass: false },
  {
    n: 4,
    staff: nv1,
    p: parts(74, 100, 100, 100, 100),
    kin: { amt: 6000000 },
    pay: 0,
    pct: 89.6,
    pass: false,
    gate: false
  },
  { n: 5, staff: nv1, p: parts(75, 75, 75, 75, 75), kin: { amt: 6000000 }, pay: 4500000, pct: 75, pass: true },
  {
    n: 6,
    staff: nv1,
    p: parts(80, 80, 80, 80, 80),
    kin: { amt: 6000000, admAmt: 4000000 },
    pay: 3200000,
    pct: 80,
    pass: true
  },
  { n: 7, staff: nv1, p: parts(100, 100, 100, 100, 0), kin: { amt: 6000000 }, pay: 5640000, pct: 94, pass: true },
  { n: 8, staff: nv1, p: parts(87.5, 92.25, 80, 90, 100), kin: { amt: 6000000 }, pay: 5300400, pct: 88.34, pass: true },
  { n: 11, staff: nv1, p: parts(75, 100, 100, 100, 100), kin: { amt: 6000000 }, pay: 5400000, pct: 90, pass: true },
  { n: 12, staff: nv2, p: parts(90, 90, 90, 90, 90), kin: { amt: 6500000 }, pay: 5850000, pct: 90, pass: true }
];
for (const c of CASES) {
  test(`ca ${c.n}: nhánh five, điểm ${Object.values(c.p).join('/')} cho lương KPI ${c.pay} ₫`, async () => {
    const r = await kpiOf(c.staff, five(c.p, c.kin));
    assert.equal(r.kpiMethod, 'five');
    assert.deepEqual(r.kpiParts, c.p);
    assert.equal(r.kpiPct, c.pct);
    assert.equal(r.kpiPass, c.pass);
    assert.equal(r.kpiGate, c.gate ?? true);
    assert.equal(r.kpiApproved, true, 'đủ điểm = đã chốt');
    assert.equal(r.kpiRatio, 1);
    assert.equal(r.kpiPay, c.pay);
    assert.equal(r.total, r.work + r.allow + c.pay, 'tổng thu nhập = lương + phụ cấp + KPI');
  });
}

test('ca 9: giờ vượt ngưỡng > 24 (22 ngày đi làm, 4 ngày nghỉ không lương), điểm 100 cả 5: KPI = 6.000.000 × 22/26 = 5.076.923 ₫', async () => {
  const days = {};
  monSat.slice(0, 22).forEach(d => (days[d] = { kind: 'work', in: '08:00', out: '17:00' }));
  monSat.slice(22, 26).forEach(d => (days[d] = { kind: 'unpaid' }));
  const r = await kpiOf(nv1, five(parts(100, 100, 100, 100, 100), { amt: 6000000 }), days);
  assert.equal(r.count, 22, 'điều kiện đầu vào của ca: 22 ngày đi làm');
  assert.ok(r.overHours > 24, `giờ vượt ngưỡng phải > 24, được ${r.overHours}`);
  assert.ok(Math.abs(r.kpiRatio - 22 / 26) < 1e-12);
  assert.ok(Math.abs(r.kpiPay - 5076923.076923) < 1e-3, `được ${r.kpiPay}`);
  assert.equal(Math.round(r.kpiPay), 5076923);
});

test('K5: hệ số ngày nghỉ (kpiRatio) giữ nguyên như cách cũ (đề xuất, chờ lead): cùng ngày công, hai nhánh cùng một hệ số', async () => {
  const days = {};
  monSat.slice(0, 22).forEach(d => (days[d] = { kind: 'work', in: '08:00', out: '17:00' }));
  monSat.slice(22, 26).forEach(d => (days[d] = { kind: 'unpaid' }));
  const legacy = await kpiOf(nv1, { pct: 100, amt: 6000000 }, days);
  const next = await kpiOf(nv1, five(parts(100, 100, 100, 100, 100), { amt: 6000000 }), days);
  assert.equal(next.kpiRatio, legacy.kpiRatio);
  assert.equal(next.kpiPay, legacy.kpiPay, 'cùng 100% thì cùng tiền');
});

test('ca 10 / K4: thiếu điểm tự đánh giá thì "chờ điểm": kpiPay 0, kpiPct null, kpiPass null, không cộng vào tổng (đề xuất, chờ lead)', async () => {
  const r = await kpiOf(nv1, five(parts(90, 90, 90, 90, null), { amt: 6000000 }));
  assert.equal(r.kpiMethod, 'five');
  assert.equal(r.kpiPay, 0);
  assert.equal(r.kpiPct, null);
  assert.equal(r.kpiPass, null);
  assert.equal(r.kpiApproved, false);
  assert.equal(r.total, r.work + r.allow, 'KPI không cộng vào tổng');
  const blank = await kpiOf(nv1, five(null, { amt: 6000000 }));
  assert.equal(blank.kpiPay, 0);
  assert.equal(blank.kpiPct, null);
});

test('nhánh five: tự đánh giá cũ (pct) và Admin duyệt % cũ (admPct) không ảnh hưởng tiền', async () => {
  const p = parts(80, 80, 80, 80, 80);
  const clean = await kpiOf(nv1, five(p, { amt: 6000000 }));
  const noisy = await kpiOf(nv1, five(p, { amt: 6000000, pct: 100, admPct: 100 }));
  assert.equal(clean.kpiPay, 4800000);
  assert.equal(noisy.kpiPay, 4800000, 'admPct 100 của cách cũ phải bị bỏ qua');
  assert.equal(noisy.kpiPct, 80);
  // và ngược lại: admPct thấp cũng không kéo tiền xuống
  assert.equal((await kpiOf(nv1, five(p, { amt: 6000000, pct: 10, admPct: 10 }))).kpiPay, 4800000);
});

// ================= trần level và mức KPI =================

test('nhánh five: trần level vẫn áp dụng (NV L1 đề xuất 9.000.000 chỉ được 6.000.000; CTV L1 tối đa 1.500.000)', async () => {
  const full = parts(100, 100, 100, 100, 100);
  const a = await kpiOf(nv1, five(full, { amt: 9000000 }));
  assert.equal(a.kpiAmt, 6000000);
  assert.equal(a.kpiPay, 6000000);
  const b = await kpiOf({ type: 'ctv', level: 1 }, five(full, { amt: 6000000 }));
  assert.equal(b.kpiAmt, 1500000);
  assert.equal(b.kpiPay, 1500000);
  const c = await kpiOf(nv1, five(full, { amt: 6000000, admAmt: 9000000 }));
  assert.equal(c.kpiAmt, 6000000, 'mức đã duyệt cũng bị kẹp ở trần');
  assert.equal(c.kpiPay, 6000000);
});

test('nhánh five: mức KPI = đã duyệt (admAmt), nếu chưa có thì đề xuất (amt), nếu chưa có thì KPI tối đa của level', async () => {
  const p = parts(90, 90, 90, 90, 90); // 90%
  assert.equal(
    (await kpiOf(nv1, five(p, { amt: 5000000, admAmt: 4000000 }))).kpiPay,
    3600000,
    'đã duyệt thắng đề xuất'
  );
  assert.equal((await kpiOf(nv1, five(p, { amt: 5000000 }))).kpiPay, 4500000, 'chưa duyệt: dùng đề xuất');
  const bare = await kpiOf(nv1, five(p, {}));
  assert.equal(bare.kpiAmt, 6000000, 'không có gì: KPI tối đa');
  assert.equal(bare.kpiPay, 5400000);
});

test('TTS không có KPI trong nhánh five', async () => {
  const r = await kpiOf({ type: 'tts', level: 1 }, five(parts(100, 100, 100, 100, 100), { amt: 6000000 }));
  assert.equal(r.kpiPay, 0);
  assert.notEqual(r.kpiMethod, 'five');
});

// ================= tháng trước mốc chuyển đổi =================

test('tháng trước mốc không có điểm vẫn tính bằng cách cũ; thiếu điểm của tháng cũ không tạo "chờ điểm"', () => {
  const r = calcMonth(nv1, workDay, { method: 'legacy', pct: 90, amt: 6000000, parts: null }, [], '2026-10', null);
  assert.equal(r.kpiPay, 5400000);
  assert.notEqual(r.kpiPct, null);
});
