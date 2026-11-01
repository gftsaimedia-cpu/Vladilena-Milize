'use strict';
// insurance-options đến tận phiếu lương.
// Người CHƯA ghi riêng "đóng bảo hiểm" (cột NULL trong hồ sơ) đóng theo lựa chọn của Kế toán cho hợp đồng của họ (insurance.coverage.<hợp đồng>) ở tháng tính:
// mặc định (hợp đồng ngắn không đóng) tiền không đổi; Kế toán chọn "có đóng" cho hợp đồng ngắn thì phiếu của người đó có bảo hiểm, còn người đã ghi riêng giữ nguyên.
// Người bịa của period-flow (qa_*), DB tạm trong bộ nhớ; không dùng dữ liệu thật.
const P = require('../helpers/position-api');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { PayrollPolicy } = require('../../src/domain/payroll/policy');

const { F, flow, store } = P;

before(F.start);
after(F.stop);

const BASIS = 'Luật Bảo hiểm xã hội số 41/2024/QH15 (căn cứ thử)';
const unsetInsured = async () =>
  (await store.db.prepare('SELECT username FROM staff WHERE insured IS NULL').all()).map(r => r.username);
// Hợp đồng suy từ thâm niên (đủ 3 tháng từ ngày vào làm tới hết tháng lương là dài): TTS vào làm đầu tháng là hợp đồng ngắn, ba người còn lại vào làm từ 05/01/2026 là hợp đồng dài
const makeTtsShort = async (month?) =>
  await store.db.prepare('UPDATE staff SET start_date = ? WHERE username = ?').run(`${month}-01`, 'qa_tts1');
async function slipsOf(month?) {
  await P.advance(month, 'calculated');
  return (await flow.payslipsOf(month)).slips;
}

test('GĐ3: coverage: hợp đồng ngắn chưa ghi riêng không đóng bảo hiểm theo mặc định; Kế toán chọn "có đóng" thì phiếu có bảo hiểm đúng 10,5 % lương cơ bản, người đã ghi riêng giữ nguyên', async () => {
  const M = await P.setupMonth();
  await makeTtsShort(M);
  const before = await slipsOf(M);
  // người bịa hợp đồng ngắn, chưa ghi riêng bảo hiểm (có phiếu trong kỳ)
  const unset = await unsetInsured();
  const who: any[] = [];
  for (const u of Object.keys(before))
    if (
      unset.includes(u) &&
      PayrollPolicy.tenureContract(
        (await store.getStaff(u)).startDate,
        M,
        (await P.paramsOf(M))['tax.longTermMonths']
      ) === 'short'
    )
      who.push(u);
  assert.ok(who.length > 0, 'cần ít nhất một người hợp đồng ngắn chưa ghi riêng bảo hiểm');
  for (const u of who) assert.equal(before[u].insurance, 0, `${u}: mặc định không đóng`);
  const other = Object.keys(before).filter(u => !who.includes(u));
  const insuredBefore = Object.fromEntries(other.map(u => [u, before[u].insurance]));

  // Kế toán đổi lựa chọn rồi tính lại ở tháng riêng khác (tham số có hiệu lực từ tháng áp dụng, kỳ này đã tính)
  const M2 = await P.setupMonth();
  await makeTtsShort(M2);
  await P.grant('qa_ctv1', 'accounting'); // dựng lại tháng thì vai trò dựng lại
  const save = await P.saveChanges([{ key: 'insurance.coverage.short', value: true }], {
    month: M2,
    who: 'qa_ctv1',
    extra: { basis: BASIS }
  });
  assert.equal(save.status, 200, JSON.stringify(save.data).slice(0, 300));
  const after = await slipsOf(M2);
  const params = await P.paramsOf(M2);
  for (const u of who) {
    const staff = await store.getStaff(u);
    const base = params[`level.${staff.type}.${staff.level}.base`];
    const expected = ['bhxh', 'bhyt', 'bhtn'].reduce(
      (sum, k) => sum + Math.round(base * params[`tax.insurance.employee.${k}`]),
      0
    );
    assert.ok(expected > 0, `${u}: lương cơ bản của bậc phải có`);
    assert.equal(after[u].insurance, expected, `${u}: đóng bảo hiểm theo lương cơ bản sau khi Kế toán chọn`);
  }
  // người khác (hợp đồng dài hoặc đã ghi riêng) không đổi bảo hiểm so với kỳ trước (cùng lương cơ bản)
  for (const u of other) assert.equal(after[u].insurance, insuredBefore[u], `${u}: không đổi`);
});
