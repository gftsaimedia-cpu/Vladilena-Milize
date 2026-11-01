'use strict';
// Admin khai lịch thay nhân viên:
//   - PUT /api/sheet nhận thêm `user`. Trùng người gọi hoặc vắng: lưu cho chính người gọi. Khác người gọi: cần request.decide.* ở phạm vi người đó, nếu không 403;
//     người đích không có hoặc không vào bảng lương thì 404/400. Mọi kiểm tra (OT, phép, ca cố định, giờ) chạy trên HỒ SƠ NGƯỜI ĐÍCH và chỉ cảnh báo. Kỳ đã khoá vẫn lưu, kèm cảnh báo PERIOD_LOCKED.
//   - Khoản cần duyệt do người khác khai thay được duyệt NGAY bởi người khai (ghi chú "Admin khai thay"), phát approvals.changed và request.decided.
//   - Một dòng nhật ký `sheet.onBehalf` cho mỗi lần lưu (người khai, người được khai, tháng, số ngày đổi; không ghi nội dung từng ngày). Phản hồi có onBehalf: true.
//   - Số ước tính của người đích (GET /api/periods/:month/estimates/:username) có số của các khoản đã duyệt.
// Số tiền tính tay: NV bậc 1 (lương ngày 230.769,23 ₫, giờ 28.846,15 ₫), ba ngày Thứ Hai 05, 12, 19/10/2026: đi làm kèm OT 17:00–19:00, nghỉ phép, đi làm.
// Chỉ người bịa (qa_*) và DB trong bộ nhớ; đồng hồ giả.
const P = require('../helpers/period-api');
const SSE = require('../helpers/sse-client');
const { test, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const { F, store } = P;
const { events } = SSE;
const monthOf = P.monthPool();

before(F.start);
after(F.stop);
afterEach(() => {
  events.configure({});
  events.closeAll();
});

const W = { kind: 'work', in: '08:00', out: '17:00' };
const OT = { ...W, extraKind: 'ot', extraOut: '19:00' };
const LEAVE = { kind: 'leave' };
// Người bịa: Admin (hồ sơ TTS, không có ca: nếu luật chạy theo hồ sơ NGƯỜI GỌI thì OT/phép/ca cố định đều sai), qa_nv1 và qa_nv3 (NV bậc 1, ca n1, đủ phép),
// qa_tts1 (TTS: không OT, không phép năm), qa_nv2 (NV bậc 3, được gán vai trò C&B khi test cần), qa_acc (Kế toán: không có quyền duyệt)
async function setup() {
  await F.reset();
  await P.revokeAllRoles();
  await F.at('2026-11-02T09:00:00');
  await store.setSetting('holidays', []);
  await F.person('admin', 'admin', { type: 'tts', level: 0, shiftCode: null, startDate: null });
  for (const username of ['qa_nv1', 'qa_nv3'])
    await F.person(username, 'staff', {
      type: 'nv',
      level: 1,
      shiftCode: 'n1',
      startDate: '2026-01-05',
      leaveAdjust: 30
    });
  await F.person('qa_tts1', 'staff', { type: 'tts', level: 3, shiftCode: 'n1', startDate: '2026-01-05' });
  await F.person('qa_nv2', 'staff', {
    type: 'nv',
    level: 3,
    shiftCode: 'n1',
    startDate: '2026-01-05',
    leaveAdjust: 30
  });
  await F.person('qa_acc', 'staff', { type: 'nv', level: 1, shiftCode: 'n1', startDate: '2026-01-05' });
  await P.grant('qa_acc', 'accounting');
}
const put = async (who?, body?) => await F.call('PUT', '/sheet', { who, body });
const mondays = (month?) => P.dowDates(month, 1);
const daysOf = async (user?, month?) => (await store.getSheet(user, month)).days;
const kindsOf = (days?) => Object.fromEntries(Object.entries<any>(days).map(([d, x]: any) => [d, x.kind]));
const auditRows = async (month?) =>
  await store.db
    .prepare("SELECT * FROM audit_log WHERE action = 'sheet.onBehalf' AND month = ? ORDER BY id")
    .all(month);
const estimateOf = async (month?, user?) => await F.call('GET', `/periods/${month}/estimates/${user}`);

test('K: Admin lưu lịch tháng cho qa_nv1 → 200, onBehalf true; lịch của qa_nv1 đổi, lịch của Admin không đổi', async () => {
  await setup();
  const M = monthOf();
  const [d0, d1, d2] = mondays(M);
  const body = { month: M, user: 'qa_nv1', days: { [d0]: OT, [d1]: LEAVE, [d2]: W } };

  const res = await put('admin', body);
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.equal(res.data.ok, true);
  assert.equal(res.data.onBehalf, true);
  assert.deepEqual(kindsOf(await daysOf('qa_nv1', M)), { [d0]: 'work', [d1]: 'leave', [d2]: 'work' });
  assert.equal((await daysOf('qa_nv1', M))[d0].extraKind, 'ot');
  assert.deepEqual(await daysOf('admin', M), {}, 'lịch của chính Admin không bị ghi');
  // Admin đọc lại lịch của người đó qua GET /api/sheet?user=
  const read = await F.call('GET', `/sheet?month=${M}&user=qa_nv1`);
  assert.equal(read.status, 200);
  assert.deepEqual(kindsOf(read.data.days), { [d0]: 'work', [d1]: 'leave', [d2]: 'work' });
  // lưu cho chính mình (không có user, hoặc user trùng người gọi): không có onBehalf
  const own = await put('qa_nv3', { month: M, days: { [d2]: W } });
  assert.equal(own.status, 200, JSON.stringify(own.data));
  assert.ok(!own.data.onBehalf, 'tự lưu của mình không phải khai thay');
  const same = await put('qa_nv3', { month: M, user: 'qa_nv3', days: { [d2]: W } });
  assert.equal(same.status, 200, JSON.stringify(same.data));
  assert.ok(!same.data.onBehalf);
});

test('K: khoản OT và phép năm do Admin khai thay được duyệt ngay bởi Admin (ghi chú "Admin khai thay"), không còn khoản chờ', async () => {
  await setup();
  const M = monthOf();
  const [d0, d1, d2] = mondays(M);
  const res = await put('admin', { month: M, user: 'qa_nv1', days: { [d0]: OT, [d1]: LEAVE, [d2]: W } });
  assert.equal(res.status, 200, JSON.stringify(res.data));

  const rows = await store.approvals.list({ status: 'all', username: 'qa_nv1', month: M });
  assert.deepEqual(rows.map(r => `${r.date}:${r.item}:${r.status}`).sort(), [
    `${d0}:ot:approved`,
    `${d1}:leave:approved`
  ]);
  for (const row of rows) {
    assert.equal(row.decidedBy, 'admin', row.date);
    assert.match(row.note, /Admin khai thay/, row.date);
    assert.ok(row.decidedAt);
  }
  assert.equal((await store.approvals.list({ status: 'pending' })).length, 0);
  // phản hồi báo đúng trạng thái đã duyệt cho từng ngày
  assert.equal(res.data.approvals[d0].status, 'approved');
  assert.equal(res.data.approvals[d1].status, 'approved');

  // đối chứng: nhân sự tự khai cùng lịch thì chờ duyệt
  const mine = await put('qa_nv3', { month: M, days: { [d0]: OT, [d1]: LEAVE } });
  assert.equal(mine.status, 200, JSON.stringify(mine.data));
  assert.deepEqual((await store.approvals.list({ status: 'pending', username: 'qa_nv3' })).map(r => r.item).sort(), [
    'leave',
    'ot'
  ]);
});

test('K: mỗi lần lưu khai thay ghi đúng một dòng nhật ký sheet.onBehalf (người khai, người được khai, tháng, số ngày đổi), không ghi nội dung từng ngày', async () => {
  await setup();
  const M = monthOf();
  const [d0, d1, d2] = mondays(M);
  assert.equal((await auditRows(M)).length, 0);

  assert.equal(
    (await put('admin', { month: M, user: 'qa_nv1', days: { [d0]: OT, [d1]: LEAVE, [d2]: W } })).status,
    200
  );
  let rows = await auditRows(M);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].actor, 'admin');
  assert.equal(rows[0].subject, 'qa_nv1');
  assert.equal(rows[0].month, M);
  const text = `${rows[0].before_json || ''} ${rows[0].after_json || ''}`;
  assert.match(text, /\b3\b/, `số ngày đổi (3) có trong nhật ký: ${text}`);
  assert.doesNotMatch(text, /extraOut|"kind"|08:00|19:00|\d{4}-\d{2}-\d{2}/, 'không ghi nội dung từng ngày');

  // lưu lần hai (bỏ một ngày) thêm đúng một dòng
  assert.equal((await put('admin', { month: M, user: 'qa_nv1', days: { [d0]: OT, [d1]: LEAVE } })).status, 200);
  assert.equal((await auditRows(M)).length, 2);
  // nhân sự tự lưu lịch của mình không tạo dòng khai thay
  assert.equal((await put('qa_nv1', { month: M, days: { [d2]: W } })).status, 200);
  assert.equal((await auditRows(M)).length, 2);
});

test('K: nhân sự gửi user của người khác → 403 và không lưu gì (kể cả lịch của chính họ); Kế toán (không có quyền duyệt) cũng 403', async () => {
  await setup();
  const M = monthOf();
  const [d0] = mondays(M);
  const before = await F.snapshot();

  for (const who of ['qa_nv2', 'qa_acc']) {
    const res = await put(who, { month: M, user: 'qa_nv1', days: { [d0]: W } });
    assert.equal(res.status, 403, `${who}: ${JSON.stringify(res.data)}`);
    assert.ok(res.data.error, `${who}: có lời báo lỗi tiếng Việt`);
  }
  assert.deepEqual(F.changedTables(before, await F.snapshot()), [], 'không bảng nào đổi');
  assert.deepEqual(await daysOf('qa_nv1', M), {});
  assert.deepEqual(await daysOf('qa_nv2', M), {});
  assert.deepEqual(await daysOf('qa_acc', M), {});
});

test('K: người đích không có hoặc không vào bảng lương (tài khoản Admin) → 404/400, không lưu gì', async () => {
  await setup();
  const M = monthOf();
  const [d0] = mondays(M);
  await P.grant('qa_nv2', 'cb'); // C&B có quyền duyệt: lỗi chỉ có thể do người đích
  const before = await F.snapshot();
  for (const [who, user] of [
    ['admin', 'qa_khong_co'],
    ['qa_nv2', 'qa_khong_co'],
    ['qa_nv2', 'admin']
  ]) {
    const res = await put(who, { month: M, user, days: { [d0]: W } });
    assert.ok([400, 404].includes(res.status), `${who} → ${user}: ${res.status} ${JSON.stringify(res.data)}`);
  }
  assert.deepEqual(F.changedTables(before, await F.snapshot()), []);
  assert.deepEqual(await daysOf('qa_nv2', M), {}, 'lịch của người gọi không bị ghi thay');
});

test('K: kiểm tra luật chạy trên hồ sơ NGƯỜI ĐÍCH — Admin (hồ sơ TTS, không ca) khai OT và phép cho NV được; ca cố định của người đích áp dụng', async () => {
  await setup();
  const M = monthOf();
  const [d0, d1] = mondays(M);
  // Admin tự khai OT cho chính mình có cảnh báo BENEFIT_NOT_ALLOWED vì hồ sơ TTS: chứng minh luật OT có chạy
  const own = await put('admin', { month: M, days: { [d0]: OT } });
  assert.equal(own.status, 200, JSON.stringify(own.data));
  assert.ok(
    own.data.warnings.some(w => w.code === 'BENEFIT_NOT_ALLOWED'),
    'đối chứng: hồ sơ TTS của Admin không có OT'
  );

  const onBehalf = await put('admin', { month: M, user: 'qa_nv1', days: { [d0]: OT, [d1]: LEAVE } });
  assert.equal(onBehalf.status, 200, `OT/phép theo hồ sơ NV của người đích: ${JSON.stringify(onBehalf.data)}`);
  assert.ok(!(onBehalf.data.warnings || []).some(w => w.code === 'BENEFIT_NOT_ALLOWED'), 'NV có OT và phép năm');

  // ca cố định n1 (08:00–17:00) của người đích: nhân sự tự khai 09:00–18:00 có cảnh báo SHEET_SHIFT_MISMATCH; Admin khai thay thì chọn được ca khác trong danh mục, không cảnh báo
  const self = await put('qa_nv3', { month: M, days: { [d0]: { kind: 'work', in: '09:00', out: '18:00' } } });
  assert.equal(self.status, 200, JSON.stringify(self.data));
  const mismatch = self.data.warnings.find(w => w.code === 'SHEET_SHIFT_MISMATCH');
  assert.ok(mismatch, JSON.stringify(self.data.warnings));
  assert.match(mismatch.message, /ca cố định/);
  const byAdmin = await put('admin', {
    month: M,
    user: 'qa_nv3',
    days: { [d0]: { kind: 'work', in: '10:00', out: '19:00' } }
  });
  assert.equal(byAdmin.status, 200, JSON.stringify(byAdmin.data));
  assert.equal(
    (await daysOf('qa_nv3', M))[d0].preset,
    'Normal2',
    'giờ khớp ca Normal2 (n2) trong danh mục nên ngày mang ca đó'
  );
  assert.ok(!(byAdmin.data.warnings || []).some(w => w.code === 'SHEET_SHIFT_MISMATCH'));
});

test('K: người đích là TTS khai thay OT hay phép năm vẫn lưu, kèm cảnh báo BENEFIT_NOT_ALLOWED theo hồ sơ người đích; ngày đi làm thường không cảnh báo', async () => {
  await setup();
  const M = monthOf();
  const [d0, d1, d2] = mondays(M);
  await P.grant('qa_nv2', 'cb');

  const ot = await put('qa_nv2', { month: M, user: 'qa_tts1', days: { [d0]: OT } });
  assert.equal(ot.status, 200, JSON.stringify(ot.data));
  assert.ok(
    ot.data.warnings.some(w => w.code === 'BENEFIT_NOT_ALLOWED'),
    JSON.stringify(ot.data.warnings)
  );
  const leave = await put('qa_nv2', {
    month: M,
    user: 'qa_tts1',
    days: { ...(await daysOf('qa_tts1', M)), [d1]: LEAVE }
  });
  assert.equal(leave.status, 200, JSON.stringify(leave.data));
  assert.ok(
    leave.data.warnings.some(w => w.code === 'BENEFIT_NOT_ALLOWED'),
    JSON.stringify(leave.data.warnings)
  );
  assert.deepEqual(await daysOf('qa_nv2', M), {}, 'lịch của người gọi không bị ghi thay');
  const plain = await put('qa_nv2', { month: M, user: 'qa_tts1', days: { ...(await daysOf('qa_tts1', M)), [d2]: W } });
  assert.equal(plain.status, 200, JSON.stringify(plain.data));
  assert.equal(plain.data.onBehalf, true);
  assert.deepEqual(kindsOf(await daysOf('qa_tts1', M)), { [d0]: 'work', [d1]: 'leave', [d2]: 'work' });
});

test('K: kỳ đã khoá công vẫn cho khai thay, kèm cảnh báo PERIOD_LOCKED', async () => {
  const M = monthOf();
  await P.seed(M);
  P.must(await P.step(M, 'lock-attendance'), 'chốt công');
  const days = await daysOf('qa_nv1', M);
  const date = await P.lastDow(M, 4);
  const res = await put('admin', { month: M, user: 'qa_nv1', days: { ...days, [date]: W } });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.ok(
    res.data.warnings.some(w => w.code === 'PERIOD_LOCKED'),
    JSON.stringify(res.data.warnings)
  );
  assert.deepEqual(kindsOf(await daysOf('qa_nv1', M))[date], 'work');
});

test('K: ước tính của người đích có số của khoản khai thay — tháng 10/2026, NV bậc 1: trước 0 ₫, sau 848.076 ₫ (tự khai không chấm công và khoản chờ duyệt chưa có số nào)', async () => {
  await setup();
  const M = '2026-10';
  const [d0, d1, d2] = mondays(M);
  assert.deepEqual([d0, d1, d2], ['2026-10-05', '2026-10-12', '2026-10-19']);
  const days = { [d0]: OT, [d1]: LEAVE, [d2]: W };
  const figures = (slip?) => ({
    workDays: slip.workDays,
    gross: slip.gross,
    advance: slip.advance,
    net: slip.net,
    ot: Math.round(slip.ot)
  });

  const before = await estimateOf(M, 'qa_nv1');
  assert.equal(before.status, 200, JSON.stringify(before.data));
  assert.deepEqual(figures(before.data.payslip), { workDays: 0, gross: 0, advance: 0, net: 0, ot: 0 });

  // đối chứng: cùng lịch do nhân sự tự khai → không có lượt Check-in/out nên hai ngày đi làm tính vắng, OT và phép chờ duyệt: chưa có số nào vào ước tính
  assert.equal((await put('qa_nv3', { month: M, days })).status, 200);
  assert.deepEqual(figures((await estimateOf(M, 'qa_nv3')).data.payslip), {
    workDays: 0,
    gross: 0,
    advance: 0,
    net: 0,
    ot: 0
  });

  // Admin khai thay: hai ngày đi làm có giờ vào ra Admin ghi (2 × 230.769,23 = 461.538,46 và đi lại 15 % × 2 ÷ 26 × 6.000.000 = 69.230,77; chuyên cần mất vì các ngày công chuẩn không đi làm vượt 24 giờ),
  // OT 2 giờ ngày có lịch (2 × 1,5 × 28.846,15 = 86.538,46) và 1 ngày phép (230.769,23) được duyệt ngay → vào số ước tính: 461.538 + 230.769 + 86.538 + 69.231 = 848.076; ngày công chưa tới ngưỡng nên không bảo hiểm
  assert.equal((await put('admin', { month: M, user: 'qa_nv1', days })).status, 200);
  const after = await estimateOf(M, 'qa_nv1');
  assert.equal(after.status, 200, JSON.stringify(after.data));
  assert.deepEqual(figures(after.data.payslip), {
    workDays: 2,
    gross: 848076,
    advance: 0,
    net: 848076,
    ot: 86538
  });
});

test('K: khai thay phát request.decided cho đúng người được khai (ngày sớm nhất, approved) và approvals.changed cho người duyệt; nhân sự khác không nhận gì', async () => {
  await setup();
  const M = monthOf();
  const [d0, d1] = mondays(M);
  const [admin, target, other] = await SSE.openMany('admin', 'qa_nv1', 'qa_tts1');
  const all = [admin, target, other];
  await SSE.settle(all);

  const res = await put('admin', { month: M, user: 'qa_nv1', days: { [d0]: OT, [d1]: LEAVE } });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  const [fAdmin, fTarget, fOther] = await SSE.settle(all);

  assert.deepEqual(
    SSE.only(fTarget, 'request.decided').map(f => f.data),
    [{ month: M, date: d0, decision: 'approved' }]
  );
  const queue = SSE.only(fAdmin, 'approvals.changed');
  assert.ok(queue.length >= 1, 'người duyệt nhận approvals.changed');
  assert.deepEqual(Object.keys(queue[0].data).sort(), ['month', 'pending']);
  assert.deepEqual(fOther, [], 'nhân sự khác không nhận gì');
  assert.deepEqual(SSE.only(fTarget, 'approvals.changed'), [], 'nhân sự không bao giờ nhận approvals.changed');
});
