'use strict';
// Quyền của các route kỳ lương (src/platform/authz.ts → ROUTE_CAPS, ROLE_CAPS; server.js nhận route kỳ lương qua
// authz.routeKey nên bài quét tĩnh của permissions-matrix và period-lock-guards KHÔNG thấy chúng — file này phủ chúng tường minh):
//   - mọi khoá ROUTE_CAPS dạng /periods phải nằm trong bảng dưới (thêm route mới mà thiếu test thì test cuối đỏ);
//   - với MỌI vai trò × MỌI route: vai trò có năng lực của route thì qua cổng (không 401/403), không có thì 403 FORBIDDEN_CAP và không đổi gì;
//   - nhân sự chỉ xem phiếu của chính mình và chỉ khi kỳ đã chi trả (403 PAYSLIP_NOT_VISIBLE trước đó);
//   - chuỗi thật theo vai trò: C&B chốt công đến duyệt kỳ, Kế toán chi trả.
// Mỗi test dùng một tháng riêng (test/helpers/period-api.ts → monthPool).
const P = require('../helpers/period-api');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const authz = require('../../src/platform/authz');

const { F, store } = P;
const monthOf = P.monthPool();

before(F.start);
after(F.stop);

// Tài khoản theo vai trò (tất cả là nhân sự bịa của period-flow trừ qa_plain/admin); vai trò gán sau mỗi lần seed
const ACCOUNT = {
  staff: 'qa_plain',
  hr: 'qa_nv2',
  manager: 'qa_tts1',
  accounting: 'qa_ctv1',
  cb: 'qa_nv1',
  admin: 'admin'
};
async function seedWithRoles(month?, target = 'open') {
  await P.seed(month);
  await F.person('qa_plain', 'staff', { type: 'nv', level: 1, startDate: '2026-01-05' });
  // qa_plain phải có ngày công đủ để thực lĩnh không âm (phiếu thực lĩnh âm bị chặn duyệt: PAYSLIP_NEGATIVE_NET)
  const holidays = await store.getSetting('holidays', []);
  const days: Record<string, any> = {};
  for (const date of P.datesOf(month).filter(d => [1, 2, 3, 4, 5].includes(new Date(d + 'T00:00:00Z').getUTCDay()))) {
    if (!holidays.includes(date) && Object.keys(days).length < 15)
      days[date] = { kind: 'work', in: '08:00', out: '17:00' };
  }
  const sheet = await F.call('PUT', '/sheet', { who: 'qa_plain', body: { month, days } });
  assert.equal(sheet.status, 200, `dựng lịch qa_plain: ${JSON.stringify(sheet.data)}`);
  for (const role of ['hr', 'manager', 'accounting', 'cb']) await P.grant(ACCOUNT[role], role);
  await P.advance(month, target);
}

// Bảng route kỳ lương: khoá ROUTE_CAPS → cách gọi. {M} là tháng, {U} là người xem phiếu.
const ROUTES = [
  { key: 'GET /periods', call: (M?) => F.call('GET', '/periods?year=2026', { who: M.who }) },
  { key: 'GET /periods/:month', call: (M?) => F.call('GET', `/periods/${M.month}`, { who: M.who }) },
  { key: 'GET /periods/:month/payslips', call: (M?) => F.call('GET', `/periods/${M.month}/payslips`, { who: M.who }) },
  {
    key: 'GET /periods/:month/estimates',
    call: (M?) => F.call('GET', `/periods/${M.month}/estimates`, { who: M.who })
  },
  {
    key: 'GET /periods/:month/estimates/:username',
    call: (M?) => F.call('GET', `/periods/${M.month}/estimates/qa_ctv1`, { who: M.who })
  },
  { key: 'GET /periods/:month/verify', call: (M?) => F.call('GET', `/periods/${M.month}/verify`, { who: M.who }) },
  {
    key: 'POST /periods/:month/lock-attendance',
    call: (M?) => F.call('POST', `/periods/${M.month}/lock-attendance`, { who: M.who, body: { rev: 99 } })
  },
  {
    key: 'POST /periods/:month/calculate',
    call: (M?) => F.call('POST', `/periods/${M.month}/calculate`, { who: M.who, body: { rev: 99 } })
  },
  {
    key: 'POST /periods/:month/approve',
    call: (M?) => F.call('POST', `/periods/${M.month}/approve`, { who: M.who, body: { rev: 99 } })
  },
  {
    key: 'POST /periods/:month/mark-paid',
    call: (M?) =>
      F.call('POST', `/periods/${M.month}/mark-paid`, { who: M.who, body: { rev: 99, paidAt: '2026-11-05' } })
  },
  {
    key: 'POST /periods/:month/reopen',
    call: (M?) =>
      F.call('POST', `/periods/${M.month}/reopen`, {
        who: M.who,
        body: { rev: 99, to: 'calculated', reason: 'Mở lại để thử quyền' }
      })
  },
  {
    key: 'PUT /periods/:month/payslips/decide',
    call: (M?) =>
      F.call('PUT', `/periods/${M.month}/payslips/decide`, {
        who: M.who,
        body: { items: [{ username: 'qa_ctv1', rev: 1 }], action: 'approve' }
      })
  }
];
const SELF_ROUTE = 'GET /periods/:month/payslips/:username';

test('Bảng route của file này phủ đúng mọi khoá /periods trong ROUTE_CAPS (thêm route kỳ lương mới thì phải thêm test)', () => {
  const declared = Object.keys(authz.ROUTE_CAPS)
    .filter(k => k.includes('/periods'))
    .sort();
  const covered = [...ROUTES.map(r => r.key), SELF_ROUTE].sort();
  assert.deepEqual(covered, declared);
  // route ghi của vòng đời không theo tháng nên không khai periodScope; route đọc không phải route ghi
  for (const key of declared) {
    const policy = authz.ROUTE_CAPS[key];
    if (key.startsWith('GET')) assert.equal(Object.hasOwn(policy, 'periodScope'), false, key);
  }
});

test('Cổng quyền theo ROLE_CAPS: mọi vai trò × mọi route kỳ lương: có năng lực thì qua cổng, không có thì 403 FORBIDDEN_CAP và KHÔNG đổi gì; chưa đăng nhập 401', async () => {
  const month = monthOf();
  await seedWithRoles(month);
  const wrong: any[] = [];
  for (const route of ROUTES) {
    const cap = authz.ROUTE_CAPS[route.key].cap;
    assert.ok(cap, `${route.key} phải khai năng lực`);
    // chưa đăng nhập
    const anon = await route.call({ month, who: null });
    if (anon.status !== 401) wrong.push(`${route.key} ẩn danh: ${anon.status}`);
    for (const [role, who] of Object.entries<any>(ACCOUNT)) {
      // cổng đòi phạm vi toàn bộ (all): vai trò 'staff' có payroll.view nhưng chỉ phạm vi tự mình nên vẫn bị chặn
      const allowed = authz.ROLE_CAPS[role].includes(cap) && authz.ROLE_SCOPE[role] === 'all';
      const before = await F.snapshot();
      const res = await route.call({ month, who });
      const gateOpen = res.status !== 401 && !(res.status === 403 && res.data.code === 'FORBIDDEN_CAP');
      if (allowed && !gateOpen) wrong.push(`${route.key} ${role}: lẽ ra qua cổng, nhận ${res.status} ${res.data.code}`);
      if (!allowed) {
        if (res.status !== 403 || res.data.code !== 'FORBIDDEN_CAP')
          wrong.push(`${route.key} ${role}: lẽ ra 403 FORBIDDEN_CAP, nhận ${res.status} ${res.data.code}`);
        const changed = F.changedTables(before, await F.snapshot());
        if (changed.length) wrong.push(`${route.key} ${role}: bị từ chối mà vẫn đổi ${changed}`);
      }
    }
  }
  assert.deepEqual(wrong, []);
});

test('Hai ô riêng của ROLE_CAPS mà TK 10.2 nhấn mạnh: kế toán chi trả nhưng không duyệt; C&B duyệt nhưng không chi trả và không mở lại về open', () => {
  assert.ok(authz.ROLE_CAPS.accounting.includes('payroll.pay'));
  for (const cap of ['payroll.approve', 'payroll.calculate', 'attendance.lock', 'period.reopen', 'ai.review.read'])
    assert.equal(authz.ROLE_CAPS.accounting.includes(cap), false, `kế toán không có ${cap}`);
  assert.equal(authz.ROLE_CAPS.cb.includes('payroll.pay'), false);
  assert.equal(authz.ROLE_CAPS.cb.includes('period.reopen.inputs'), false);
  for (const cap of [
    'payroll.view',
    'audit.read',
    'payroll.approve',
    'payroll.pay',
    'period.reopen',
    'period.reopen.inputs'
  ])
    assert.ok(authz.ROLE_CAPS.admin.includes(cap), `admin có ${cap}`);
  for (const role of ['hr', 'manager', 'staff'])
    for (const cap of ['payroll.calculate', 'payroll.approve', 'payroll.pay', 'attendance.lock', 'period.reopen'])
      assert.equal(authz.ROLE_CAPS[role].includes(cap), false, `${role} không có ${cap}`);
});

/* ================= phiếu của chính mình ================= */
test('Nhân sự chỉ xem phiếu của chính mình và chỉ từ khi kỳ đã chi trả: trước đó 403 PAYSLIP_NOT_VISIBLE; phiếu người khác luôn 403 FORBIDDEN_CAP; sau khi chi trả xem được, không thấy trường override', async () => {
  const M = monthOf();
  await seedWithRoles(M, 'approved');
  // qa_nv2 (vai trò hr, không có payroll.view) là "chính mình": chỉ xem được phiếu của mình
  const own = 'qa_nv2';
  for (const state of ['approved']) {
    const res = await F.call('GET', `/periods/${M}/payslips/${own}`, { who: own });
    assert.equal(res.status, 403, state);
    assert.equal(res.data.code, 'PAYSLIP_NOT_VISIBLE');
    assert.equal(JSON.stringify(res.data).includes('net'), false, 'không lộ số tiền khi chưa được xem');
  }
  const other = await F.call('GET', `/periods/${M}/payslips/qa_ctv1`, { who: own });
  assert.equal(other.status, 403);
  assert.equal(other.data.code, 'FORBIDDEN_CAP');
  assert.equal((await F.call('GET', `/periods/${M}/payslips/${own}`, { who: null })).status, 401);
  P.must(await P.step(M, 'mark-paid', { paidAt: '2026-11-05' }), 'chi trả');
  const paid = await F.call('GET', `/periods/${M}/payslips/${own}`, { who: own });
  assert.equal(paid.status, 200, JSON.stringify(paid.data));
  assert.equal(paid.data.source, 'snapshot');
  assert.equal(paid.data.payslip.username, own);
  assert.equal(Object.hasOwn(paid.data.payslip, 'override'), false);
  assert.equal(paid.data.payslip.net, (await P.flow.payslipsOf(M)).slips[own].net);
  // vẫn không xem được phiếu người khác sau khi chi trả, kể cả tên viết hoa lẫn thường
  assert.equal((await F.call('GET', `/periods/${M}/payslips/qa_ctv1`, { who: own })).status, 403);
  assert.equal((await F.call('GET', `/periods/${M}/payslips/QA_CTV1`, { who: own })).status, 403);
  // người xem được mọi phiếu (kế toán, C&B, Admin) xem phiếu của người khác, kể cả trước chi trả
  for (const who of ['qa_ctv1', 'qa_nv1', 'admin']) {
    const res = await F.call('GET', `/periods/${M}/payslips/qa_nv2`, { who });
    assert.equal(res.status, 200, who);
    assert.ok(Object.hasOwn(res.data.payslip, 'override'), `${who} thấy trường số sửa`);
  }
  // phiếu không tồn tại
  assert.equal((await F.call('GET', `/periods/${M}/payslips/qa_khong_co`)).status, 404);
});

test('Nhân sự chỉ có phạm vi tự mình: danh sách kỳ, phiếu cả kỳ, verify và mọi bước ghi đều 403, không lộ lương người khác', async () => {
  const M = monthOf();
  await seedWithRoles(M, 'calculated');
  for (const who of ['qa_plain', 'qa_nv2', 'qa_tts1']) {
    for (const route of ROUTES) {
      const res = await route.call({ month: M, who });
      assert.equal(res.status, 403, `${who} ${route.key}`);
      assert.equal(res.data.code, 'FORBIDDEN_CAP');
      assert.equal(JSON.stringify(res.data).includes('qa_ctv1'), false, `${who} ${route.key}: không lộ người khác`);
    }
  }
});

/* ================= chuỗi thật theo vai trò ================= */
test('Chuỗi thật theo vai trò: C&B chốt công, tính lương, AI, duyệt phiếu, duyệt kỳ; kế toán không duyệt được nhưng chi trả được; C&B không chi trả được', async () => {
  const M = monthOf();
  await seedWithRoles(M);
  const cb = ACCOUNT.cb;
  const acc = ACCOUNT.accounting;
  const snapshotOf = () => F.snapshot();
  // kế toán chưa được chốt công; C&B được
  let before = await snapshotOf();
  assert.equal((await P.step(M, 'lock-attendance', {}, acc)).status, 403);
  assert.deepEqual(F.changedTables(before, await snapshotOf()), []);
  P.must(await P.step(M, 'lock-attendance', {}, cb), 'C&B chốt công');
  assert.equal((await P.step(M, 'calculate', {}, acc)).status, 403);
  P.must(await P.step(M, 'calculate', {}, cb), 'C&B tính lương');
  const rows = await P.slipRows(M);
  assert.equal(
    (await P.decide(M, P.itemsOf(rows), 'approve', undefined, acc)).status,
    403,
    'kế toán không duyệt phiếu'
  );
  // C&B là nhân sự qa_nv1: duyệt phiếu của chính mình vẫn được, kèm cảnh báo SELF_DECISION_FORBIDDEN và nhật ký đánh dấu tự thực hiện
  const mine = rows.find(r => r.username === cb);
  const self = P.must(
    await P.decide(M, [{ username: cb, rev: mine.rev }], 'approve', undefined, cb),
    'C&B duyệt phiếu của mình'
  );
  assert.deepEqual(
    (self.data.warnings || []).map(w => w.code).filter(code => code === 'SELF_DECISION_FORBIDDEN'),
    ['SELF_DECISION_FORBIDDEN']
  );
  const selfAudit = (await P.auditOf(M)).filter(r => r.subject === cb && r.after && r.after.self === true);
  assert.ok(selfAudit.length >= 1, 'nhật ký đánh dấu after.self = true cho dòng tự duyệt');
  const others = P.must(
    await P.decide(M, P.itemsOf(rows.filter(r => r.username !== cb)), 'approve', undefined, cb),
    'C&B duyệt phiếu người khác'
  );
  assert.deepEqual(
    (others.data.warnings || []).filter(w => w.code === 'SELF_DECISION_FORBIDDEN'),
    [],
    'duyệt phiếu người khác không có cảnh báo tự duyệt'
  );
  assert.equal((await P.step(M, 'approve', {}, acc)).status, 403, 'kế toán không duyệt kỳ');
  P.must(await P.step(M, 'approve', {}, cb), 'C&B duyệt kỳ');
  // C&B không chi trả; kế toán chi trả
  before = await snapshotOf();
  assert.equal((await P.step(M, 'mark-paid', { paidAt: '2026-11-05' }, cb)).status, 403);
  assert.deepEqual(F.changedTables(before, await snapshotOf()), []);
  P.must(await P.step(M, 'mark-paid', { paidAt: '2026-11-05' }, acc), 'kế toán chi trả');
  const audit = await P.auditOf(M);
  const actorOf = (action?) => audit.filter(r => r.action === action).map(r => r.actor);
  assert.deepEqual(actorOf('period.lock-attendance'), [cb]);
  assert.deepEqual(actorOf('period.approve'), [cb]);
  assert.deepEqual(actorOf('period.mark-paid'), [acc]);
  assert.deepEqual(actorOf('period.calculate'), [cb]);
  // kế toán và C&B đọc được verify (audit.read), kế toán xem được phiếu mọi người
  assert.equal((await F.call('GET', `/periods/${M}/verify`, { who: acc })).status, 200);
  assert.equal((await F.call('GET', `/periods/${M}/payslips/qa_nv2`, { who: acc })).status, 200);
  // sau khi chi trả C&B vẫn mở lại được về calculated, kèm cảnh báo PERIOD_STATE (tiền đã chi không rút lại)
  const reopened = P.must(
    await P.step(M, 'reopen', { to: 'calculated', reason: 'Mở lại sau khi chi trả' }, cb),
    'C&B mở lại kỳ đã chi trả'
  );
  assert.deepEqual(
    (reopened.data.warnings || []).map(w => w.code).filter(code => code === 'PERIOD_STATE'),
    ['PERIOD_STATE']
  );
  assert.equal((await store.roles.effectiveRoles(acc)).includes('accounting'), true);
});
