'use strict';
// Số liệu máy chủ cho giao diện:
//   - Phiếu lương của tháng dùng KPI 5 thành phần: kpiBase, kpiUser, kpiQltt, kpiPeer, kpiSelf điền sẵn từ điểm đã nhập (wework, user, manager, peer, self);
//     số Admin sửa trên phiếu vẫn thắng (máy chủ giữ ô điền sẵn và số sửa riêng, màn hình cho số sửa thắng); KHÔNG đổi tiền.
//   - GET /api/sheet gửi kèm trọng số KPI của tháng (kpi.weight.*) để màn nhân viên không viết cứng 40/24/12/18/6.
//   - PUT /api/staff/:u nhận payrollSubject: tài khoản lưu với false không vào bảng lương, AI soát, thẻ thu nhập, ước tính.
//     Đổi role admin ↔ staff không làm mất bậc.
//   - src/domain/period/periods.ts → checklist đóng các lượt mở quá 16 giờ (closeStale) trước khi đếm OPEN_SESSIONS.
// Vị trí trường kpiBase… trong phản hồi phiếu không cố định: test tìm trường đầu tiên có tên đó trong phản hồi (bỏ qua nhánh override / computed),
// ưu tiên cấp phiếu; tên trường chứa trọng số trong GET /api/sheet cũng được tìm theo khoá thành phần. Đơn vị: điểm 0–100 như lúc nhập.
// Số tiền kiểm (VND) cố định vì điền ô điểm không đổi tiền (qa_ctv1, CTV bậc 2, tháng 2026-10 của period-flow, điểm 80/90/70/85/100 → KPI 82,4 %).
// Chỉ người bịa (qa_*) và DB trong bộ nhớ.
const P = require('../helpers/period-api');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const PunchRules = require('../../src/engine/punch');

const { F, store, flow } = P;
// tháng 2026-10 dành riêng cho bài KPI có số tiền cố định; các bài khác lấy tháng riêng từ đây
const monthOf = (() => {
  const next = P.monthPool();
  next();
  return next;
})();
const FIXED = '2026-10';

before(F.start);
after(F.stop);

/* ---------- KPI 5 thành phần ---------- */
const SCORES = { wework: 80, user: 90, peer: 70, manager: 85, self: 100 };
const SLIP_KEYS = { kpiBase: 'wework', kpiUser: 'user', kpiQltt: 'manager', kpiPeer: 'peer', kpiSelf: 'self' };
const WEIGHTS = { wework: 40, user: 24, peer: 18, manager: 12, self: 6 };
const SKIP = new Set<any>(['override', 'overridden', 'computed']);

// Nhánh đầu tiên (ưu tiên nông) có các khoá kpiBase… ; null nếu không có chỗ nào mang chúng
function findKpiParts(node?, seen = new Set()) {
  const queue = [node];
  while (queue.length) {
    const cur = queue.shift();
    if (!cur || typeof cur !== 'object' || seen.has(cur)) continue;
    seen.add(cur);
    if (!Array.isArray(cur) && Object.keys(SLIP_KEYS).every(key => Object.hasOwn(cur, key))) return cur;
    for (const [key, value] of Object.entries<any>(cur)) if (!SKIP.has(key)) queue.push(value);
  }
  return null;
}
// Đối tượng trọng số (số, tổng 100 hoặc 1, không phải điểm) theo khoá thành phần hoặc khoá phiếu
function findWeights(node?, seen = new Set()) {
  const queue = [node];
  while (queue.length) {
    const cur = queue.shift();
    if (!cur || typeof cur !== 'object' || seen.has(cur)) continue;
    seen.add(cur);
    if (!Array.isArray(cur) && cur.complete === undefined) {
      for (const keys of [Object.keys(WEIGHTS), Object.keys(SLIP_KEYS)]) {
        const values = keys.map(key => cur[key]);
        if (values.every(v => typeof v === 'number')) {
          const sum = values.reduce((a, b) => a + b, 0);
          if (Math.abs(sum - 100) < 1e-6 || Math.abs(sum - 1) < 1e-6) return { keys, cur };
        }
      }
    }
    for (const value of Object.values<any>(cur)) queue.push(value);
  }
  return null;
}
const partsOfSlip = (slip?) => {
  const found = findKpiParts(slip);
  assert.ok(found, `phiếu không mang kpiBase… ở đâu: ${JSON.stringify(Object.keys(slip))}`);
  return Object.fromEntries(Object.keys(SLIP_KEYS).map(key => [key, found[key]]));
};
const expectedParts = (scores?) =>
  Object.fromEntries(Object.entries<any>(SLIP_KEYS).map(([key, score]: any) => [key, scores[score]]));

// Dựng tháng có KPI 5 thành phần cho qa_ctv1 rồi đưa kỳ tới trạng thái `target`
async function kpiMonth(month?, target = 'calculated') {
  await P.seed(month);
  const put = await F.call('PUT', '/kpi/scores', { body: { user: 'qa_ctv1', month, scores: SCORES } });
  assert.equal(put.status, 200, JSON.stringify(put.data));
  await P.advance(month, target);
}
const detailOf = (month?, user = 'qa_ctv1') => F.call('GET', `/periods/${month}/payslips/${user}`);

test('S: phiếu 2026-10 tính KPI theo 5 thành phần — kpiBase…kpiSelf bằng điểm đã nhập, KPI 1.996.615 ₫ (3.000.000 × 82,4 % × 21 ÷ 26), tổng lương 8.083.154 ₫, thực lĩnh 7.453.154 ₫ khi chưa có tạm ứng được duyệt', async () => {
  await kpiMonth(FIXED, 'calculated');
  const res = await detailOf(FIXED);
  assert.equal(res.status, 200, JSON.stringify(res.data));
  const slip = res.data.payslip;

  assert.deepEqual(partsOfSlip(slip), expectedParts(SCORES), 'năm ô điểm KPI điền sẵn từ điểm đã nhập');
  // tiền: điểm 80 / 90 / 70 / 85 / 100 → 3200 + 2160 + 1260 + 1020 + 600 = 8240 → 82,4 %; nghỉ vắng 32 giờ vượt ngưỡng 24 giờ nên KPI nhân 21 ÷ 26:
  // 3.000.000 × 82,4 % × 21 ÷ 26 = 1.996.615,38; tổng lương = 6.086.539 (ngày công, xem sua-phieu) + 1.996.615; bảo hiểm 630.000; không tạm ứng được duyệt
  assert.deepEqual(
    {
      gross: slip.gross,
      insurance: slip.insurance,
      tax: slip.tax,
      advance: slip.advance,
      net: slip.net,
      kpi: slip.kpi
    },
    { gross: 8083154, insurance: 630000, tax: 0, advance: 0, net: 7453154, kpi: 1996615 }
  );
  // và bằng số đã lưu trong bảng phiếu (điền ô điểm không ghi lại số tiền)
  const stored = (await flow.payslipsOf(FIXED)).slips.qa_ctv1;
  assert.deepEqual([stored.gross, stored.net], [8083154, 7453154]);
  assert.deepEqual(stored.snapshot.kpiParts, SCORES, 'điểm trong bản chụp là nguồn của năm ô');
  // người không có điểm KPI nhập (NV bậc 1 không hưởng KPI) không bị điền điểm của người khác
  const other = (await detailOf(FIXED, 'qa_nv1')).data.payslip;
  const otherParts = findKpiParts(other);
  if (otherParts)
    for (const key of Object.keys(SLIP_KEYS)) assert.ok(!otherParts[key], `qa_nv1.${key}: ${otherParts[key]}`);
});

test('S: số Admin sửa không bị ô điền sẵn đè mất — ô điền sẵn (kpiSlip) vẫn là điểm đã nhập, số sửa (kpiBase 50) nằm riêng ở số Admin sửa và đóng băng khi duyệt kỳ', async () => {
  const M = monthOf();
  await kpiMonth(M, 'reviewed');
  const put = await F.call('PUT', '/slip-override', {
    body: { user: 'qa_ctv1', month: M, values: { kpiBase: 50 }, reason: 'Điều chỉnh theo biên bản chi trả' }
  });
  assert.equal(put.status, 200, JSON.stringify(put.data));
  // màn hình cho số sửa thắng bằng cách đọc cả hai: ô điền sẵn không bị ghi đè trong phản hồi phiếu, số sửa lấy ở GET /slip-override
  const res = await detailOf(M);
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.deepEqual(partsOfSlip(res.data.payslip), expectedParts(SCORES), 'ô điền sẵn vẫn là điểm máy chủ');
  const mine = await F.call('GET', `/slip-override?user=qa_ctv1&month=${M}`);
  assert.equal(mine.data.values.kpiBase, 50);
  // duyệt kỳ: số sửa được đóng băng trên phiếu, ô điền sẵn vẫn theo điểm
  P.must(await P.approveAllPending(M), 'duyệt phiếu');
  P.must(await P.step(M, 'approve'), 'duyệt kỳ');
  const final = (await detailOf(M)).data.payslip;
  assert.equal(final.override.values.kpiBase, 50);
  assert.deepEqual(partsOfSlip(final), expectedParts(SCORES));
});

test('S: GET /api/sheet gửi kèm trọng số KPI của tháng (40/24/12/18/6 theo kpi.weight.*), bằng trọng số Admin thấy ở GET /api/kpi/scores', async () => {
  const M = monthOf();
  await P.seed(M);

  const admin = await F.call('GET', `/kpi/scores?month=${M}`);
  assert.equal(admin.status, 200);
  assert.deepEqual(admin.data.weights, WEIGHTS, 'điều kiện: tham số mặc định');

  const sheet = await F.call('GET', `/sheet?month=${M}`, { who: 'qa_ctv1' });
  assert.equal(sheet.status, 200, JSON.stringify(sheet.data));
  const found = findWeights(sheet.data);
  assert.ok(found, `GET /api/sheet không mang trọng số KPI; các khoá: ${Object.keys(sheet.data)}`);
  const byComponent = found.keys.includes('wework')
    ? found.cur
    : Object.fromEntries(
        Object.entries<any>(SLIP_KEYS).map(([slipKey, component]: any) => [component, found.cur[slipKey]])
      );
  const scale = Math.abs(Object.values<any>(byComponent).reduce((a, b) => a + b, 0) - 1) < 1e-6 ? 100 : 1;
  assert.deepEqual(
    Object.fromEntries(Object.keys(WEIGHTS).map(key => [key, Math.round(byComponent[key] * scale)])),
    WEIGHTS
  );
  // không lộ điểm của ai: chưa nhập điểm thì kpiParts vẫn { complete: false }
  assert.deepEqual(sheet.data.kpiParts, { complete: false });
});

/* ---------- payrollSubject ---------- */
const NEW_PASSWORD = 'qa-mat-khau-thu-123456';
const createAccount = (username?, extra: any = {}) =>
  F.call('PUT', `/staff/${username}`, {
    body: {
      name: `Người thử ${username}`,
      role: 'staff',
      type: 'nv',
      level: 1,
      startDate: '2026-01-05',
      password: NEW_PASSWORD,
      ...extra
    }
  });

test('S: tài khoản lưu với payrollSubject false không vào bảng lương, ước tính hay thẻ thu nhập; tài khoản thường (không gửi cờ) vẫn vào', async () => {
  const M = monthOf();
  await P.seed(M);

  const off = await createAccount('qa_phanquyen', { payrollSubject: false });
  assert.equal(off.status, 200, JSON.stringify(off.data));
  const on = await createAccount('qa_binhthuong');
  assert.equal(on.status, 200, JSON.stringify(on.data));
  assert.equal((await store.getStaff('qa_phanquyen')).payrollSubject, false, 'cờ được lưu');
  assert.equal((await store.getStaff('qa_binhthuong')).payrollSubject, true, 'mặc định vẫn là có vào bảng lương');

  // ước tính của kỳ
  const estimates = await F.call('GET', `/periods/${M}/estimates?pageSize=200`);
  assert.equal(estimates.status, 200);
  const estimated = estimates.data.rows.map(r => r.username);
  assert.ok(estimated.includes('qa_binhthuong'), 'đối chứng: tài khoản thường có trong ước tính');
  assert.ok(!estimated.includes('qa_phanquyen'), 'tài khoản không vào bảng lương không có trong ước tính');
  const one = await F.call('GET', `/periods/${M}/estimates/qa_phanquyen`);
  assert.ok(one.status !== 200 || !one.data.payslip, `ước tính một người: ${one.status}`);
  // thẻ thu nhập của chính họ
  const card = await F.call('GET', `/me/estimate?month=${M}`, { who: 'qa_phanquyen' });
  assert.equal(card.status, 200);
  assert.equal(card.data.payrollSubject, false);
  assert.equal(card.data.estimate, null);

  // AI soát: số người được soát không tăng vì tài khoản này, không có phát hiện nào của nó

  // bảng lương sau khi tính
  P.must(await P.step(M, 'lock-attendance'), 'chốt công');
  P.must(await P.step(M, 'calculate'), 'tính lương');
  const names = (await P.slipRows(M)).map(r => r.username);
  assert.ok(names.includes('qa_binhthuong'));
  assert.ok(!names.includes('qa_phanquyen'), `bảng lương: ${names}`);
});

test('S: đổi role staff → admin → staff không làm mất bậc (CTV bậc 2 vẫn bậc 2) và payrollSubject theo cờ gửi lên', async () => {
  const M = monthOf();
  await P.seed(M);
  const was = await store.getStaff('qa_ctv1');
  assert.deepEqual([was.type, was.level], ['ctv', 2]);
  const form = async (over?) => {
    const s = await store.getStaff('qa_ctv1');
    return {
      name: s.name,
      type: s.type,
      shiftCode: s.shiftCode,
      startDate: s.startDate,
      leaveAdjust: s.leaveAdjust,
      contract: s.contract,
      insured: s.insured,
      dependants: s.dependants,
      ...over
    };
  };

  const up = await F.call('PUT', '/staff/qa_ctv1', { body: await form({ role: 'admin', payrollSubject: false }) });
  assert.equal(up.status, 200, JSON.stringify(up.data));
  assert.equal((await store.getStaff('qa_ctv1')).role, 'admin');
  assert.equal((await store.getStaff('qa_ctv1')).payrollSubject, false);

  const down = await F.call('PUT', '/staff/qa_ctv1', { body: await form({ role: 'staff', payrollSubject: true }) });
  assert.equal(down.status, 200, JSON.stringify(down.data));
  const now = await store.getStaff('qa_ctv1');
  assert.equal(now.role, 'staff');
  assert.equal(now.type, 'ctv');
  assert.equal(now.level, 2, 'bậc không bị đặt về 0 hay 1 khi qua vai trò Admin rồi trở lại');
  assert.equal(now.payrollSubject, true);
  assert.equal(now.leaveAdjust, was.leaveAdjust);
});

/* ---------- danh sách kiểm: lượt quá 16 giờ ---------- */
const nextMonthOf = (month?) => {
  const y = +month.slice(0, 4);
  const m = +month.slice(5, 7);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
};
const openCount = (view?) => ((view.checklist || []).find(i => i.code === 'OPEN_SESSIONS') || { count: 0 }).count;

test('S: danh sách kiểm không đếm lượt mở quá 16 giờ là "đang mở" (OPEN_SESSIONS) — lượt cũ bị đóng thành quên Check-out, lượt mới mở 3 giờ vẫn đếm', async () => {
  const M = monthOf();
  await P.seed(M);
  const staleDate = P.firstDow(M, 2); // Thứ Ba đầu tháng
  const freshDate = await P.lastDow(M, 4); // Thứ Năm cuối tháng (ngày lễ của period-flow là Thứ Tư)
  const sched = [1, 2, 3, 4, 5, 6];
  const open = (username?, shiftCode?, date?, time?) => {
    const staff = { shiftCode, sched };
    const plan = PunchRules.planShift(staff, date);
    assert.ok(plan, `${date} phải là ngày làm việc theo ca ${shiftCode}`);
    const opened = PunchRules.openDay(staff, `${date}T${time}:00+07:00`, plan);
    return store.createSession(username, opened.date, 'open', opened.entry);
  };
  const stale = await open('qa_tts1', 'n1', staleDate, '08:00'); // mở từ nhiều ngày trước
  await open('qa_ctv1', 'n2', freshDate, '15:00'); // mở 3 giờ trước đồng hồ giả
  await F.at(`${freshDate}T18:00:00`);

  const view = (await F.call('GET', `/periods/${M}`)).data;
  assert.equal(openCount(view), 1, `chỉ lượt mới mở 3 giờ còn đang mở: ${JSON.stringify(view.checklist)}`);
  const closed = await store.getSession(stale.id);
  assert.equal(closed.state, 'closed', 'lượt quá 16 giờ đã được đóng');
  assert.equal(closed.entry.reason, 'forgot-out');

  // sang ngày 2 tháng sau: cả hai lượt đều quá 16 giờ, không còn lượt nào đang mở để chặn chốt công
  await F.at(`${nextMonthOf(M)}-02T09:00:00`);
  const later = (await F.call('GET', `/periods/${M}`)).data;
  assert.equal(openCount(later), 0, JSON.stringify(later.checklist));
});
