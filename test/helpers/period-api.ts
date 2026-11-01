'use strict';
// Đồ dùng chung cho test vòng đời kỳ lương: dựng một tháng bằng người bịa qua API thật, đưa kỳ tới một
// trạng thái rồi trả tháng đó cho test. Mỗi test lấy MỘT THÁNG RIÊNG (monthPool) vì payroll_runs, payslips, param_versions và audit_log là
// bảng chỉ-thêm-dòng (reset không xoá được): tháng riêng nghĩa là không dòng nào của test trước lọt vào test sau. Mỗi file test chạy trong một
// tiến trình riêng với DB riêng trong bộ nhớ.
// Bộ hàm này KHÔNG khẳng định hành vi lỗi: các bước dựng chỉ chấp nhận 200 (ném lỗi nếu khác); test tự gọi API để kiểm lỗi.
const assert = require('node:assert/strict');
const F = require('./api-fixture');
const flow = require('./period-flow');

const { store } = F;
const ORDER = ['open', 'attendance_locked', 'calculated', 'reviewed', 'approved', 'paid'];

// Tháng quản lý đầu tiên là 2026-10; mỗi test lấy tháng kế tiếp. Dãy đủ dài cho một file; hết thì ném (không dùng lại tháng).
function monthPool() {
  const months: any[] = [];
  for (let y = 2026; y <= 2028; y++)
    for (let m = 1; m <= 12; m++) if (y > 2026 || m >= 10) months.push(`${y}-${String(m).padStart(2, '0')}`);
  let next = 0;
  return () => {
    if (next >= months.length) throw new Error('Hết tháng riêng cho test: dùng lại tháng sẽ làm rò dòng giữa các test');
    return months[next++];
  };
}

const revOf = async (month?) => (await F.call('GET', `/periods/${month}`)).data.rev;
// POST một bước của kỳ; rev lấy từ kỳ hiện tại (admin đọc) trừ khi body ghi đè
async function step(month?, name?, body: any = {}, who = 'admin') {
  return await F.call('POST', `/periods/${month}/${name}`, { who, body: { rev: await revOf(month), ...body } });
}
const slipRows = async (month?) =>
  (await F.call('GET', `/periods/${month}/payslips?pageSize=200`)).data.rows.sort((a: any, b: any) =>
    a.username.localeCompare(b.username)
  );
const decide = async (month?, items?, action = 'approve', note?, who = 'admin') =>
  await F.call('PUT', `/periods/${month}/payslips/decide`, { who, body: { items, action, ...(note ? { note } : {}) } });
const itemsOf = (rows?) => rows.map(r => ({ username: r.username, rev: r.rev }));
async function approveAllPending(month?) {
  const rows = (await slipRows(month)).filter(r => r.status === 'pending' || r.status === 'draft');
  return await decide(month, itemsOf(rows));
}
const must = (res?, what?) => {
  assert.equal(res.status, 200, `${what}: ${res.status} ${JSON.stringify(res.data)}`);
  return res;
};

// Đưa kỳ tới trạng thái `target` bằng admin. Tháng đã được seed (flow.seedMonth) và đồng hồ giả ở sau tháng đó.
async function advance(month?, target?) {
  const goal = ORDER.indexOf(target);
  assert.ok(goal >= 0, `trạng thái lạ: ${target}`);
  if (goal >= 1) must(await step(month, 'lock-attendance'), 'chốt công');
  if (goal >= 2) must(await step(month, 'calculate'), 'tính lương');
  if (goal >= 4) {
    must(await approveAllPending(month), 'duyệt phiếu');
    must(await step(month, 'approve'), 'duyệt kỳ');
  }
  if (goal >= 5) must(await step(month, 'mark-paid', { paidAt: '2026-11-05' }), 'chi trả');
}
// staff_roles chỉ-thêm-dòng nên reset() không xoá được vai trò: thu hồi hết (đặt revoked_at) để vai trò của test trước không rò sang test sau
const revokeAllRoles = async () =>
  await store.db
    .prepare('UPDATE staff_roles SET revoked_at = ? WHERE revoked_at IS NULL')
    .run(new Date(Date.now()).toISOString());
// Seed một tháng (bốn người bịa của period-flow) và thu hồi mọi vai trò còn lại của test trước
async function seed(month?, opts?) {
  const out = await flow.seedMonth(month, opts);
  await revokeAllRoles();
  return out;
}
// Seed một tháng rồi đưa tới trạng thái; trả về tháng
async function setupMonth(month?, target = 'open', opts?) {
  await seed(month, opts);
  await advance(month, target);
  return month;
}

const periodRow = async (month?) => await store.db.prepare('SELECT * FROM payroll_periods WHERE month = ?').get(month);
const runsOf = async (month?) =>
  await store.db
    .prepare('SELECT id, run_no, status, engine_version, params_hash FROM payroll_runs WHERE month = ? ORDER BY run_no')
    .all(month);
// Dòng nhật ký của một kỳ hoặc của phiếu trong kỳ (action theo thứ tự ghi)
const auditOf = async (month?) =>
  (
    await store.db
      .prepare(
        'SELECT id, action, actor, entity_kind, entity_id, subject, month, before_json, after_json, reason, sensitivity FROM audit_log WHERE month = ? ORDER BY id'
      )
      .all(month)
  ).map(row => ({
    ...row,
    before: row.before_json && JSON.parse(row.before_json),
    after: row.after_json && JSON.parse(row.after_json)
  }));

// Ngày đầu tiên / cuối cùng của tháng rơi vào thứ `dow` (0 = Chủ nhật ... 6 = Thứ Bảy)
const datesOf = (month?) =>
  Array.from(
    { length: new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)).getUTCDate() },
    (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`
  );
const dowDates = (month?, dow?) => datesOf(month).filter(d => new Date(d + 'T00:00:00Z').getUTCDay() === dow);
const firstDow = (month?, dow?) => dowDates(month, dow)[0];
const lastDow = (month?, dow?) => dowDates(month, dow).at(-1);

// Gán vai trò (ngoài vai trò gốc) cho một tài khoản đã có; reset() xoá vai trò nên gán lại sau mỗi lần seed
const grant = async (username?, role?) => await store.roles.grant(username, role, 'admin');

// Chuỗi dài n ký tự (để thử ranh giới 10–300 của lý do)
const text = (n?) => 'x'.repeat(n);

module.exports = {
  ORDER,
  monthPool,
  revOf,
  step,
  slipRows,
  decide,
  itemsOf,
  approveAllPending,
  must,
  advance,
  seed,
  revokeAllRoles,
  setupMonth,
  periodRow,
  runsOf,
  auditOf,
  grant,
  firstDow,
  dowDates,
  datesOf,
  lastDow,
  text,
  pendingUnless: require('./red').pendingUnless,
  mentions: require('./red').mentions,
  flow,
  F,
  store
};
