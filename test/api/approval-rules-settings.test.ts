'use strict';
// Quy tắc duyệt (Cài đặt › Phân quyền › Quy tắc duyệt): "chưa duyệt hoặc bị từ chối thì ..." của từng loại yêu cầu là khoá registry
// request.type.<loại>.pendingRule / rejectedRule (mặc định đúng ApprovalView.POLICY), Admin sửa qua PUT /api/settings/params
// với tháng áp dụng và lý do; ApprovalView.payView đọc từ tham số. Chỉ người bịa (qa_*).
const F = require('../helpers/api-fixture');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const ApprovalView = require('../../src/engine/approval-view');
const Params = require('../../src/engine/payroll-params');

const REASON = 'Đổi cách xử lý khoản chưa duyệt theo quyết định tháng này';
before(F.start);
after(F.stop);

const save = async (changes?, month = '2026-12') => {
  const rev = (await F.call('GET', `/settings/params?month=${month}`)).data.paramsRev;
  return await F.call('PUT', '/settings/params', {
    body: { changes, effectiveMonth: month, reason: REASON, expectedRev: rev }
  });
};
const ITEMS = ['leave', 'isat', 'approved', 'ot', 'makeup_hours', 'makeup_day', 'holiday_work', 'willmakeup'];

test('quy tắc duyệt: mặc định của registry bằng đúng ApprovalView.POLICY hôm nay cho cả tám loại', () => {
  const today = { pending: {} as Record<string, any>, rejected: {} as Record<string, any> };
  for (const item of ITEMS) {
    today.pending[item] = Params.DEFAULTS[`request.type.${item}.pendingRule`];
    today.rejected[item] = Params.DEFAULTS[`request.type.${item}.rejectedRule`];
  }
  assert.deepEqual(today.pending, {
    leave: 'unpaid',
    isat: 'unpaid',
    approved: 'unpaid',
    ot: 'strip',
    makeup_hours: 'strip',
    makeup_day: 'drop',
    holiday_work: 'drop',
    willmakeup: 'unpaid'
  });
  assert.deepEqual(today.rejected, today.pending, 'bị từ chối tính tiền y hệt chờ duyệt');
  assert.deepEqual(JSON.parse(JSON.stringify(ApprovalView.POLICY)), today);
});

test('quy tắc duyệt: Admin đổi "nghỉ phép năm chưa duyệt" từ nghỉ không lương sang bỏ cả ngày, có tháng áp dụng; payView đọc theo tham số', async () => {
  await F.person('admin', 'admin', { type: 'tts', level: 0, shiftCode: null, startDate: null });
  await F.at('2026-11-02T09:00:00');
  const res = await save([{ key: 'request.type.leave.pendingRule', value: 'drop' }]);
  assert.equal(res.status, 200, JSON.stringify(res.data).slice(0, 300));
  assert.equal(res.data.saved[0].effectiveMonth, '2026-12');
  const days = { '2026-12-07': { kind: 'leave' } };
  const pendingRow = { '2026-12-07': { item: 'leave', status: 'pending', fingerprint: 'leave' } };
  const after = ApprovalView.create({ ...Params.DEFAULTS, 'request.type.leave.pendingRule': 'drop' });
  assert.deepEqual(after.payView(days, pendingRow, { pending: { leave: 'drop' }, rejected: {} }).payDays, {});
  assert.deepEqual(
    ApprovalView.payView(days, pendingRow).payDays,
    { '2026-12-07': { kind: 'unpaid' } },
    'mặc định không đổi'
  );
});

test('quy tắc duyệt: phương án ngoài tập cho phép của loại bị 400, không lưu (OT chỉ bỏ đoạn làm thêm)', async () => {
  const res = await save([{ key: 'request.type.ot.pendingRule', value: 'drop' }], '2027-01');
  assert.ok([400, 422].includes(res.status), JSON.stringify(res.data).slice(0, 300));
  const unknown = await save([{ key: 'request.type.ot.pendingRule', value: 'bay_mau' }], '2027-01');
  assert.ok([400, 422].includes(unknown.status));
});

test('quy tắc duyệt: "tính là ngày nghỉ khi xét chuyên cần" tắt được ở nghỉ phép năm, iSAT, nghỉ được duyệt; loại khác luôn có', async () => {
  const ok = await save([{ key: 'request.type.approved.countsAbsent', value: false }], '2027-02');
  assert.equal(ok.status, 200, JSON.stringify(ok.data).slice(0, 300));
  const bad = await save([{ key: 'request.type.ot.countsAbsent', value: false }], '2027-02');
  assert.ok([400, 422].includes(bad.status), JSON.stringify(bad.data).slice(0, 300));
  assert.match(JSON.stringify(bad.data), /không bao giờ thành ngày nghỉ không lương/);
  const text = await save([{ key: 'request.type.leave.countsAbsent', value: 'khong' }], '2027-02');
  assert.ok([400, 422].includes(text.status));
});
