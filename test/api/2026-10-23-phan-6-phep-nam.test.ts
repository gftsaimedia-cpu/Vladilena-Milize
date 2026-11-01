'use strict';
// Phép năm qua API (hợp đồng máy chủ ↔ giao diện):
//   - GET /api/sheet → leaveBalance: không cộng ngày vào làm; 1 ngày mỗi tháng tròn; +1 mỗi 5 năm; cấp Nhân viên +1 mỗi 12 tháng tròn; sinh nhật +1.
//     Thêm expiring: { days, on }: số ngày tích luỹ tới 31/12 năm N chưa dùng (dùng phép cũ trước) sẽ hết hạn vào 31/01 năm N+1.
//   - Hết 31/01 năm N+1: số ngày đó quy tiền vào phiếu tháng 02/N+1 (dòng "Quyết toán phép dư": ngày × lương cơ bản ÷ ngày công chuẩn của tháng 02)
//     rồi trừ khỏi số dư. Phiếu các tháng khác không có khoản này.
// Tiền kiểm bằng cách ghim ô settlePay = 0 qua PUT /api/slip-override (số sửa áp cả phiếu ước tính): tổng lương giảm đúng bằng số quyết toán.
// Lương cơ bản CTV bậc 2 và NV bậc 1: 6.000.000 ₫, ngày công chuẩn 26 (src/engine/payroll-params.ts); tính tay: số ngày × 6.000.000 ÷ 26.
// Người bịa qa_phep*, đồng hồ giả (F.at), DB trong bộ nhớ.
const P = require('../helpers/period-api');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { F, store } = P;
const REASON = 'Đối chiếu quyết toán phép năm';
const BASE = 6000000;
const STD = 26;
const payFor = (days?) => Math.round((days * BASE) / STD);

before(async () => {
  await F.start();
  await F.reset();
  await P.revokeAllRoles();
  await F.at('2027-02-02T09:00:00');
  await F.person('admin', 'admin', { type: 'tts', level: 0, shiftCode: null, startDate: null });
  const staff = { type: 'ctv', level: 2, shiftCode: 'n2', leaveAdjust: 0 };
  await F.person('qa_phep1', 'staff', { ...staff, startDate: '2025-01-05' }); // dùng 4 ngày phép
  await F.person('qa_phep2', 'staff', { ...staff, startDate: '2026-10-05' }); // dùng 2 ngày phép, đều trong tháng 01/2027
  await F.person('qa_phep3', 'staff', { ...staff, startDate: '2025-01-05' }); // không dùng ngày nào
  await F.person('qa_phep4', 'staff', { ...staff, type: 'nv', level: 1, startDate: '2025-11-05' }); // Nhân viên
  await F.person('qa_phep5', 'staff', { ...staff, startDate: '2025-11-05' }); // CTV, cùng ngày vào làm với qa_phep4
  await F.person('qa_phep6', 'staff', { ...staff, startDate: '2026-11-02' }); // vào làm đúng ngày 02/11/2026
  // 2026-12-02 và 03 là Thứ 3, Thứ 4; 2027-01-06 và 07 là Thứ 4, Thứ 5
  const leave = async (user?, month?, dates?) =>
    await F.call('PUT', '/sheet', {
      who: user,
      body: { month, days: Object.fromEntries(dates.map(date => [date, { kind: 'leave' }])) }
    });
  for (const [user, month, dates] of [
    ['qa_phep1', '2026-12', ['2026-12-02', '2026-12-03']],
    ['qa_phep1', '2027-01', ['2027-01-06', '2027-01-07']],
    ['qa_phep2', '2027-01', ['2027-01-06', '2027-01-07']]
  ]) {
    const res = await leave(user, month, dates);
    assert.equal(res.status, 200, `dựng phép ${user} ${month}: ${JSON.stringify(res.data)}`);
  }
  const pending = await store.approvals.list({ status: 'pending' });
  await store.approvals.decide(
    pending.map(r => ({ username: r.username, date: r.date, rev: r.rev, fingerprint: r.fingerprint })),
    'approved',
    'admin',
    'Duyệt để dựng dữ liệu thử'
  );
});
after(F.stop);

// Số dư phép của người đó vào ngày `vnTime` (giờ Việt Nam), đọc đúng như app nhân viên: GET /api/sheet của tháng chứa ngày đó
async function balanceAt(user?, vnTime?) {
  await F.at(vnTime);
  const res = await F.call('GET', `/sheet?month=${vnTime.slice(0, 7)}`, { who: user });
  assert.equal(res.status, 200, JSON.stringify(res.data).slice(0, 200));
  return res.data.leaveBalance;
}
const estimateOf = async (user?, month?) => {
  await F.at('2027-03-02T09:00:00'); // sau cuối tháng 02: đọc số ước tính của 02/2027 cùng một đồng hồ cho mọi test
  const res = await F.call('GET', `/periods/${month}/estimates/${user}`);
  assert.equal(res.status, 200, JSON.stringify(res.data).slice(0, 300));
  return res.data.payslip;
};
const pin = async (user?, month?, values?) => {
  const res = await F.call('PUT', '/slip-override', { body: { user, month, values, reason: REASON } });
  assert.equal(res.status, 200, JSON.stringify(res.data));
};
// Tiền "Quyết toán phép dư" trong tổng lương = hiệu giữa tổng lương tự tính và tổng lương khi ghim settlePay = 0
async function settlementPay(user?, month?) {
  await pin(user, month, {});
  const auto = (await estimateOf(user, month)).gross;
  await pin(user, month, { settlePay: 0 });
  const without = (await estimateOf(user, month)).gross;
  await pin(user, month, {});
  return auto - without;
}

test('B: không còn +1 ngày phép vào ngày đầu đi làm: người vào làm 02/11/2026 có 0 ngày phép đúng ngày đó, trước đây có 1', async () => {
  const got = await balanceAt('qa_phep6', '2026-11-02T09:00:00');
  assert.equal(got.accrued, 0);
  assert.equal(got.balance, 0);
  assert.equal(got.used, 0);
});

test('B: 1 ngày mỗi tháng tròn từ ngày vào làm nhưng chỉ tính từ 2026: vào làm 05/01/2025, đến 30/01/2027 đã tròn 24 tháng, 11 tháng của 2025 không tính nên còn 13 ngày (CTV)', async () => {
  const got = await balanceAt('qa_phep3', '2027-01-30T09:00:00');
  assert.equal(got.accrued, 13);
  assert.equal(got.months, 13);
  assert.equal(got.balance, 13);
});

test('B: tròn một năm không cộng thêm: (chỉ tính phép cộng từ 2026) NV vào làm 05/11/2025 có 10 ngày ngày 04/11/2026 và 11 ngày ngày 05/11/2026, bằng CTV cùng ngày vào làm', async () => {
  assert.equal((await balanceAt('qa_phep4', '2026-11-04T09:00:00')).accrued, 10);
  assert.equal((await balanceAt('qa_phep4', '2026-11-05T09:00:00')).accrued, 11);
  assert.equal((await balanceAt('qa_phep5', '2026-11-04T09:00:00')).accrued, 10);
  assert.equal((await balanceAt('qa_phep5', '2026-11-05T09:00:00')).accrued, 11);
});

test('B: leaveBalance.expiring: 30/01/2027 người dùng 4 ngày (2 ngày 12/2026, 2 ngày 01/2027) có 13 ngày tích luỹ tính từ 2026, còn 9, và 8 ngày sẽ hết hạn ngày 31/01/2027 (dùng phép cũ trước)', async () => {
  // quỹ 2026: 12 tháng tròn (05/01 tới 05/12/2026); đã dùng 4 ngày, dùng phép cũ trước nên còn 8 ngày cũ
  const got = await balanceAt('qa_phep1', '2027-01-30T09:00:00');
  assert.equal(got.accrued, 13);
  assert.equal(got.used, 4);
  assert.equal(got.balance, 9);
  assert.ok(got.expiring, `thiếu expiring: ${JSON.stringify(got)}`);
  assert.equal(got.expiring.days, 8);
  assert.equal(got.expiring.on, '2027-01-31');
});

test('B: người dùng hết phép cũ trước thì không còn ngày hết hạn: vào làm 05/10/2026 dùng 2 ngày, tích luỹ tới 31/12/2026 chỉ có 2 ngày, expiring.days = 0', async () => {
  const got = await balanceAt('qa_phep2', '2027-01-30T09:00:00');
  assert.equal(got.accrued, 3);
  assert.equal(got.used, 2);
  assert.equal(got.balance, 1);
  assert.ok(!got.expiring || got.expiring.days === 0, `expiring ${JSON.stringify(got.expiring)}`);
});

test('B: sau 31/01 số ngày hết hạn bị trừ khỏi số dư: ngày 02/02/2027 qa_phep1 còn 13 - 4 - 8 = 1, qa_phep3 còn 13 - 0 - 12 = 1, qa_phep2 còn 3 - 2 - 0 = 1; không còn ngày sắp hết hạn', async () => {
  for (const user of ['qa_phep1', 'qa_phep2', 'qa_phep3']) {
    const got = await balanceAt(user, '2027-02-02T09:00:00');
    assert.equal(got.balance, 1, user);
    assert.ok(!got.expiring || got.expiring.days === 0, `${user}: expiring ${JSON.stringify(got.expiring)}`);
  }
});

test('B: phiếu 02/2027 có "Quyết toán phép dư" = số ngày hết hạn × 6.000.000 ÷ 26: 8 ngày = 1.846.154 ₫, 12 ngày = 2.769.231 ₫, hết phép cũ thì 0 ₫', async () => {
  assert.equal(
    (await estimateOf('qa_phep1', '2027-02')).workdaysStd,
    STD,
    'điều kiện: ngày công chuẩn của tháng 02/2027'
  );
  assert.equal(await settlementPay('qa_phep1', '2027-02'), payFor(8));
  assert.equal(payFor(8), 1846154);
  assert.equal(await settlementPay('qa_phep3', '2027-02'), payFor(12));
  assert.equal(payFor(12), 2769231);
  assert.equal(await settlementPay('qa_phep2', '2027-02'), 0);
});

test('B: chỉ phiếu tháng 02 có khoản quyết toán: phiếu 01/2027 và 03/2027 của cùng người không có', async () => {
  assert.equal(await settlementPay('qa_phep1', '2027-01'), 0);
  assert.equal(await settlementPay('qa_phep1', '2027-03'), 0);
  assert.equal(await settlementPay('qa_phep3', '2027-03'), 0);
});

test('B: nhân sự không đọc được số dư phép của người khác (403)', async () => {
  await F.at('2027-02-02T09:00:00');
  const other = await F.call('GET', '/sheet?month=2027-02&user=qa_phep1', { who: 'qa_phep3' });
  assert.equal(other.status, 403, JSON.stringify(other.data).slice(0, 200));
  assert.equal(JSON.stringify(other.data).includes('leaveBalance'), false);
});
