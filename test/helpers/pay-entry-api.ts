'use strict';
// Đồ dùng chung cho test khoản điền thêm: hợp đồng của backend (src/domain/pay-entries.ts, src/domain/payroll/pay-entries.ts):
//   GET  /api/pay-entries?month=&username=&status=      { month, periodStatus, requireApproval, entries }
//   POST /api/pay-entries                               { entry }           body: { username, month, direction, amount, label, reason, slipLine?, taxMode?, taxCap?, insuranceBase? }
//   POST /api/pay-entries/bulk                          { count, entries }  body { month, entries:[…] } hoặc { usernames, month, … }; tất cả hoặc không
//   PUT  /api/pay-entries/:id                           { entry }           sửa khi chờ duyệt, cần rev
//   PUT  /api/pay-entries/:id/decide { decision:'approved'|'rejected', rev, note? }   note 10–300 bắt buộc khi từ chối
//   POST /api/pay-entries/:id/void { rev?, reason? }    reason bắt buộc khi khoản đã duyệt
//   POST /api/pay-entries/:id/confirm-flags { rev }     (config.legal)
// Quy tắc: không ai lập, sửa, huỷ, duyệt khoản về CHÍNH MÌNH (người nhận là nhân sự được trả lương); người duyệt khác người lập khi requireApproval.
// Nên người lập mặc định là `admin` (không thuộc diện trả lương) và người duyệt là `qa_admin2` (Admin thứ hai, cũng không nhận lương).
const assert = require('node:assert/strict');
const P = require('./position-api');
const { oracle } = require('./pay-oracle');

const { F, flow } = P;
const MAKER = 'admin';
const CHECKER = 'qa_admin2';

// Dựng một tháng riêng (người bịa của period-flow) và tài khoản Admin thứ hai để duyệt
async function setup() {
  const month = await P.setupMonth();
  await F.person(CHECKER, 'admin', { type: 'tts', level: 0, shiftCode: null, startDate: null });
  return month;
}
const entry = (month?, over: any = {}) => ({
  username: 'qa_nv2',
  month,
  direction: 'add',
  amount: 500000,
  label: 'Thưởng một lần',
  reason: 'Thưởng hoàn thành dự án thử nghiệm',
  ...over
});
const create = async (month?, over: any = {}, who = MAKER) =>
  await F.call('POST', '/pay-entries', { who, body: entry(month, over) });
const mustCreate = async (month?, over: any = {}, who = MAKER) => {
  const res = await create(month, over, who);
  assert.equal(res.status, 200, `POST /api/pay-entries: ${res.status} ${JSON.stringify(res.data)}`);
  assert.ok(res.data.entry && res.data.entry.id, 'có { entry: { id } }');
  return res.data.entry;
};
async function decide(id?, decision?, { who = CHECKER, rev = 1, note }: any = {}) {
  const body: Record<string, any> = { decision, rev };
  if (note !== undefined) body.note = note;
  return await F.call('PUT', `/pay-entries/${id}/decide`, { who, body });
}
const mustApprove = async (e?, who = CHECKER) => {
  const res = await decide(e.id, 'approved', { who, rev: e.rev });
  assert.equal(res.status, 200, `duyệt: ${res.status} ${JSON.stringify(res.data)}`);
  return res.data.entry;
};
const list = async (month?, query = '', who = MAKER) =>
  await F.call('GET', `/pay-entries?month=${month}${query}`, { who });
const statusOf = async (id?, month?) => (await list(month)).data.entries.find(r => r.id === id)?.status;
async function slipsOf(month?) {
  await P.advance(month, 'calculated');
  return (await flow.payslipsOf(month)).slips;
}
// Phiếu = khối cũ (chưa có khoản) cộng khoản qua phần đuôi luật tái tính độc lập (helpers/pay-oracle.js)
function expectSlip(slip?, legacyM?, adds?, label?) {
  const o = oracle.netAfter(legacyM, adds);
  assert.equal(slip.gross, Math.round(o.total), `${label}: tổng thu nhập`);
  assert.equal(slip.insurance, o.insurance, `${label}: bảo hiểm`);
  assert.equal(slip.tax, o.tax, `${label}: thuế`);
  assert.equal(slip.net, o.net, `${label}: thực lĩnh`);
}

module.exports = {
  ...P,
  MAKER,
  CHECKER,
  setup,
  entry,
  create,
  mustCreate,
  decide,
  mustApprove,
  list,
  statusOf,
  slipsOf,
  expectSlip
};
