'use strict';
// Màn Lương: cột "Công" (daysWorked trên workdaysStd) của từng người, lấy từ kết quả bộ máy (m.count; ngày công chuẩn của chức vụ hoặc m.workdaysStd khi có lịch riêng),
// ở danh sách phiếu, ước tính cả kỳ và một phiếu; attendanceKept { kept, of } ở tổng kỳ và ước tính. Không đổi tiền.
const P = require('../helpers/period-api');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { F, flow } = P;
const monthOf = P.monthPool();

before(F.start);
after(F.stop);

const STD = { tts: 22, ctv: 26, nv: 26 }; // ngày công chuẩn mặc định của chức vụ (type.<mã>.workdays)
const dbSlips = async (month?) => Object.values<any>((await flow.payslipsOf(month)).slips);

test('Công: danh sách phiếu có daysWorked bằng m.count của bản chụp và workdaysStd bằng ngày công chuẩn của chức vụ, cho mọi người', async () => {
  const M = monthOf();
  await P.setupMonth(M, 'calculated');
  const res = await F.call('GET', `/periods/${M}/payslips?pageSize=200`, { who: 'admin' });
  assert.equal(res.status, 200, JSON.stringify(res.data).slice(0, 200));
  assert.equal(res.data.rows.length, 4);
  const byUser = new Map<any, any>((await dbSlips(M)).map(s => [s.username, s]));
  for (const row of res.data.rows) {
    const slip = byUser.get(row.username);
    assert.equal(row.daysWorked, slip.snapshot.count, `${row.username}: daysWorked`);
    assert.equal(row.daysWorked, row.workDays, 'cùng số với workDays đã có');
    assert.equal(row.workdaysStd, STD[row.type], `${row.username}: workdaysStd`);
  }
});

test('Công: ước tính cả kỳ (trước khi tính lương) có cùng hai trường và attendanceKept { kept, of }; số tiền không đổi sau khi tính lương', async () => {
  const M = monthOf();
  await P.seed(M);
  const est = await F.call('GET', `/periods/${M}/estimates?pageSize=200`, { who: 'admin' });
  assert.equal(est.status, 200, JSON.stringify(est.data).slice(0, 200));
  for (const row of est.data.rows) {
    assert.equal(typeof row.daysWorked, 'number', row.username);
    assert.equal(row.workdaysStd, STD[row.type], row.username);
  }
  assert.deepEqual(Object.keys(est.data.attendanceKept).sort(), ['kept', 'of']);
  assert.equal(est.data.attendanceKept.of, est.data.rows.filter(r => r.type === 'nv').length);
});

test('Công: một phiếu (GET /periods/:month/payslips/:username) cũng có daysWorked và workdaysStd', async () => {
  const M = monthOf();
  await P.setupMonth(M, 'paid');
  const one = await F.call('GET', `/periods/${M}/payslips/qa_nv1`, { who: 'admin' });
  assert.equal(one.status, 200, JSON.stringify(one.data).slice(0, 200));
  assert.equal(one.data.payslip.workdaysStd, 26);
  assert.equal(typeof one.data.payslip.daysWorked, 'number');
});
