'use strict';
// Khoá kỳ lương: khi kỳ đã chốt công, mọi route ghi đổi dữ liệu của tháng đó
// vẫn lưu (200) và trả cảnh báo PERIOD_LOCKED { month, status, scope } trong warnings[].
// Hai mức khoá: lịch ước tính, duyệt, chấm công, điều chỉnh giờ, OT, ngày lễ khoá từ `attendance_locked`;
// điểm KPI và số sửa phiếu còn mở tới hết `reviewed`, khoá từ `approved`.
// Danh sách route lấy từ mã máy chủ (test tĩnh bên dưới đỏ nếu thêm route ghi mới mà chưa khai báo); test cuối buộc mọi route ghi
// trong ROUTE_CAPS của src/platform/authz.ts phải khai báo periodScope và nằm trong bảng này.
const F = require('../helpers/api-fixture'); // xác nhận database test tạm trước khi require src/platform/db
F.explainPunches = true; // lượt bấm trễ / ngoài ca ở đây chỉ là đầu vào: kèm giải trình lúc bấm
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const PunchRules = require('../../src/engine/punch');
const { pending, need, exists, ROOT } = require('../helpers/red');
const { serverSource, routeKeysInSource } = require('../helpers/server-source');

const { store } = F;
const MONTH = '2026-10';
const STATUSES = ['attendance_locked', 'calculated', 'reviewed', 'approved', 'paid'];
const rank = (status?) => ['open', ...STATUSES].indexOf(status);
// options rỗng: các test khoá kỳ luôn chạy
const guardsReady: Record<string, any> = {};

before(F.start);
after(F.stop);

/* ---------- dữ liệu mẫu: người bịa, tháng 10/2026 đã kết thúc (đồng hồ giả 02/11/2026) ---------- */
const T = (date?, time?) => new Date(`${date}T${time}:00+07:00`).toISOString();
async function seed(workerExtra: any = {}) {
  await F.reset();
  await F.at('2026-11-02T09:00:00');
  await F.person('admin', 'admin', { type: 'tts', level: 0, shiftCode: null, startDate: null });
  await F.person('worker', 'staff', workerExtra);
}
// Lượt chấm công đã đóng 08:00 đến 21:00 (cùng mẫu test/api/holiday-ot-guard.test.ts)
async function closedSession(date?, { out = '21:00' }: any = {}) {
  const plan = PunchRules.planShift({ shiftCode: 'n1', sched: [1, 2, 3, 4, 5, 6] }, date);
  const entry = PunchRules.buildDay({ shiftCode: 'n1' }, T(date, '08:00'), T(date, out), 'punch', {
    plannedShift: plan,
    approveIncomplete: true
  }).entry;
  return await store.createSession('worker', date, 'closed', entry);
}
const ok = (res?, what?) => assert.equal(res.status, 200, `${what}: ${res.status} ${JSON.stringify(res.data)}`);

/* ---------- các route ghi đổi dữ liệu của một tháng ---------- */
// scopes: giá trị `scope` chấp nhận được trong 409; lockedFrom: trạng thái đầu tiên bị khoá; prepare() dựng dữ liệu và trả yêu cầu mẫu
const ROUTES = [
  {
    id: 'PUT /sheet',
    scopes: ['attendance'],
    lockedFrom: 'attendance_locked',
    prepare: async () => {
      await seed();
      return {
        who: 'worker',
        body: { month: MONTH, days: { '2026-10-08': { kind: 'work', in: '08:00', out: '17:00' } } }
      };
    }
  },
  {
    id: 'PUT /sheet/bulk',
    scopes: ['attendance'],
    lockedFrom: 'attendance_locked',
    prepare: async () => {
      await seed();
      return {
        who: 'admin',
        body: { month: MONTH, usernames: ['worker'], days: { '2026-10-08': { kind: 'work', preset: 'n2' } } }
      };
    }
  },
  {
    id: 'PUT /approvals/decide',
    scopes: ['attendance'],
    lockedFrom: 'attendance_locked',
    prepare: async () => {
      await seed();
      ok(
        await F.call('PUT', '/sheet', {
          who: 'worker',
          body: { month: MONTH, days: { '2026-10-10': { kind: 'isat' } } }
        }),
        'dựng khoản iSAT chờ duyệt'
      );
      const row = (await store.approvals.list({ status: 'pending' })).find(
        r => r.username === 'worker' && r.date === '2026-10-10'
      );
      assert.ok(row, 'phải có khoản iSAT chờ duyệt');
      return {
        who: 'admin',
        body: {
          action: 'approve',
          items: [{ username: 'worker', date: '2026-10-10', rev: row.rev, fingerprint: row.fingerprint }]
        }
      };
    }
  },
  {
    id: 'POST /ot',
    scopes: ['attendance'],
    lockedFrom: 'attendance_locked',
    prepare: async () => {
      await seed();
      const session = await closedSession('2026-10-07');
      return {
        who: 'admin',
        body: {
          sessionId: session.id,
          version: session.version,
          extraOut: '21:00',
          reason: 'Làm thêm theo yêu cầu quản lý'
        }
      };
    }
  },
  {
    id: 'PUT /ot',
    scopes: ['attendance'],
    lockedFrom: 'attendance_locked',
    prepare: async () => {
      await seed();
      const session = await closedSession('2026-10-07');
      ok(
        await F.call('POST', '/ot', {
          body: {
            sessionId: session.id,
            version: session.version,
            extraOut: '21:00',
            reason: 'Làm thêm theo yêu cầu quản lý'
          }
        }),
        'dựng khai OT chờ duyệt'
      );
      return {
        who: 'admin',
        body: { sessionId: session.id, version: (await store.getSession(session.id)).version, action: 'approve' }
      };
    }
  },
  {
    // Ca đêm g2 (22:00 đến 07:00) Check-in lúc 02:00 ngày 01/11 thuộc ngày công 31/10, tức tháng 10 (ca qua đêm)
    id: 'POST /punch',
    scopes: ['attendance'],
    lockedFrom: 'attendance_locked',
    prepare: async () => {
      await seed({ shiftCode: 'g2' });
      await F.at('2026-11-01T02:00:00');
      return { who: 'worker', body: { type: 'in', requestId: 'qa-lock-punch-0001' } };
    },
    // ngày công của lượt vừa mở phải thuộc tháng 10, nếu không thì khoá tháng 10 chẳng liên quan
    afterOk: async () => assert.equal((await store.listSessions({ username: 'worker' }))[0].date, '2026-10-31')
  },
  {
    id: 'PUT /holidays',
    scopes: ['attendance', 'params'],
    lockedFrom: 'attendance_locked',
    prepare: async () => {
      await seed();
      return { who: 'admin', body: { dates: ['2026-10-07'] } };
    }
  },
  {
    id: 'PUT /kpi/scores',
    scopes: ['kpi'],
    lockedFrom: 'approved',
    prepare: async () => {
      await seed();
      return {
        who: 'admin',
        body: { user: 'worker', month: MONTH, scores: { wework: 80 }, reason: 'Nhập điểm Base Wework tháng 10' }
      };
    }
  },
  {
    id: 'PUT /slip-override',
    scopes: ['slip'],
    lockedFrom: 'approved',
    prepare: async () => {
      await seed();
      return {
        who: 'admin',
        body: {
          user: 'worker',
          month: MONTH,
          values: { workBase: 6000000 },
          reason: 'Điều chỉnh theo bảng lương đã đối chiếu'
        }
      };
    }
  }
];

// Route ghi của server.js KHÔNG đổi dữ liệu theo tháng, hoặc chưa rõ tháng nào
const EXEMPT = {
  'POST /login': 'đăng nhập, không đổi dữ liệu lương',
  'POST /logout': 'đăng xuất',
  'PUT /password': 'mật khẩu của chính mình',
  'PUT /settings/geofence': 'vùng GPS, không theo tháng',
  'POST /periods/:month/lock-attendance':
    'chính là vòng đời kỳ: src/domain/period/periods.ts tự kiểm trạng thái kỳ (PERIOD_STATE) trong giao dịch',
  'POST /periods/:month/calculate':
    'chính là vòng đời kỳ: src/domain/period/periods.ts tự kiểm trạng thái kỳ (PERIOD_STATE) trong giao dịch',
  'POST /periods/:month/approve':
    'chính là vòng đời kỳ: src/domain/period/periods.ts tự kiểm trạng thái kỳ (PERIOD_STATE) trong giao dịch',
  'POST /periods/:month/mark-paid':
    'chính là vòng đời kỳ: src/domain/period/periods.ts tự kiểm trạng thái kỳ (PERIOD_STATE) trong giao dịch',
  'POST /periods/:month/reopen':
    'chính là vòng đời kỳ: src/domain/period/periods.ts tự kiểm trạng thái kỳ (PERIOD_STATE) trong giao dịch',
  'PUT /periods/:month/payslips/decide':
    'duyệt phiếu của lần chạy: src/domain/period/periods.ts tự kiểm trạng thái kỳ (PERIOD_STATE)',
  'PUT /settings/params': 'bộ tham số có hiệu lực theo tháng; kỳ đã chốt giữ bản chụp phiếu nên không bị đổi',
  'POST /settings/params/preview': 'chỉ xem trước tác động, không ghi',
  'POST /settings/params/revert': 'hoàn tác bộ tham số có hiệu lực theo tháng; kỳ đã chốt giữ bản chụp phiếu',
  'PUT /staff/shift-bulk': 'gán ca theo hồ sơ (profile.write), không ghi ngày công của một kỳ cụ thể',
  'PUT /staff/:u/roles': 'gán vai trò cho tài khoản, không theo tháng',
  'POST /staff/:u/password': 'đặt lại mật khẩu của tài khoản khác, không đổi dữ liệu lương',
  'PUT /staff/:u': 'hồ sơ ảnh hưởng lương: TK 6.2 nói "các trường ảnh hưởng lương, xem 8.6" nhưng chưa nói tháng nào'
};

// Route ghi của các module Nest (src/modules/*) khai periodScope = null trong ROUTE_CAPS: khoá kỳ (nếu có) do tầng dịch vụ của module tự kiểm
// (vd. tạm ứng luôn 409 PERIOD_LOCKED khi kỳ đã duyệt/chi trả, danh mục kiểm khoá kỳ trong applyCatalogChange); mỗi nhóm có test riêng.
for (const key of [
  'POST /advance-approvals/request',
  'POST /advance-approvals/withdraw',
  'POST /advance-approvals/approve',
  'POST /advance-approvals/reject',
  'POST /advance-approvals/cancel',
  'POST /advance-approvals/approve-all',
  'POST /blocks',
  'PUT /blocks/:code/confirm',
  'PUT /catalog/positions/:code',
  'PUT /catalog/levels',
  'PUT /catalog/shifts',
  'POST /explanations',
  'POST /explanations/:id/answer',
  'POST /explanations/:id/decide',
  'POST /leave/refresh',
  'POST /pay-entries',
  'POST /pay-entries/bulk',
  'PUT /pay-entries/:id',
  'PUT /pay-entries/:id/decide',
  'POST /pay-entries/:id/void',
  'POST /pay-entries/:id/confirm-flags',
  'POST /positions',
  'POST /positions/:code/levels',
  'POST /roles',
  'PUT /roles/:code',
  'POST /roles/:code/deprecate',
  'PUT /settings/shifts'
])
  EXEMPT[key] =
    'route của module Nest, periodScope = null trong ROUTE_CAPS: khoá kỳ (nếu có) do tầng dịch vụ của module kiểm';

// Route có periodScope mà server.js không khai trực tiếp (nằm ở mô-đun src/domain/*) và được test khác phủ khoá kỳ
const COVERED_ELSEWHERE: Record<string, any> = {};

async function lock(status?) {
  await store.db
    .prepare(
      'INSERT INTO payroll_periods (month, status, rev) VALUES (?, ?, 1) ON CONFLICT(month) DO UPDATE SET status = excluded.status'
    )
    .run(MONTH, status);
}
async function attempt(route?, status?) {
  const request = await route.prepare();
  const method = request.method || route.id.split(' ')[0];
  const url = request.path || route.id.split(' ')[1];
  if (status) await lock(status);
  const before = await F.snapshot(['payroll_periods']);
  const res = await F.call(method, url, request);
  const after = await F.snapshot(['payroll_periods']);
  return { res, changed: F.changedTables(before, after) };
}

/* ---------- 1. payload mẫu hợp lệ khi kỳ còn mở ---------- */
for (const route of ROUTES)
  test(`period-lock-guards: payload mẫu của ${route.id} được chấp nhận (200) khi kỳ còn mở`, async () => {
    const { res } = await attempt(route, null);
    assert.equal(res.status, 200, `${route.id}: ${res.status} ${JSON.stringify(res.data)}`);
    if (route.afterOk) await route.afterOk();
  });

/* ---------- 2. từng route × từng trạng thái ---------- */
for (const route of ROUTES)
  test(
    `period-lock-guards: ${route.id} vẫn lưu ở mọi trạng thái; từ "${route.lockedFrom}" trả cảnh báo PERIOD_LOCKED { month, status, scope }, trước đó không cảnh báo`,
    guardsReady,
    async () => {
      const problems: any[] = [];
      for (const status of STATUSES) {
        const { res } = await attempt(route, status);
        const locked = (res.data.warnings || []).filter(w => w.code === 'PERIOD_LOCKED' && w.details?.month === MONTH);
        if (res.status !== 200) {
          problems.push(`${status}: lẽ ra 200 nhưng được ${res.status} ${JSON.stringify(res.data).slice(0, 120)}`);
          continue;
        }
        if (rank(status) < rank(route.lockedFrom)) {
          if (locked.length) problems.push(`${status}: kỳ chưa khoá mà có cảnh báo ${JSON.stringify(locked)}`);
          continue;
        }
        if (!locked.length)
          problems.push(`${status}: thiếu cảnh báo PERIOD_LOCKED ${JSON.stringify(res.data).slice(0, 160)}`);
        else if (locked[0].details.status !== status || !route.scopes.includes(locked[0].details.scope))
          problems.push(
            `${status}: chi tiết cảnh báo sai ${JSON.stringify(locked[0].details)} (cần status ${status}, scope ${route.scopes})`
          );
      }
      assert.deepEqual(problems, []);
    }
  );

/* ---------- 3. thêm route ghi mới mà chưa khai báo thì đỏ ---------- */
test('period-lock-guards: mọi route ghi trong server.js được khai báo là có khoá kỳ hoặc miễn (kèm lý do)', () => {
  const source = serverSource(); // mã máy chủ: server.js, lib/routes và src/domain
  // khoá ghi khai báo bằng `route === '…'` hoặc mục bảng `'PUT /x': async …`
  const found = new Set<any>([...routeKeysInSource(source)].filter(key => /^(POST|PUT|DELETE|PATCH) /.test(key)));
  // route có tham số trong đường dẫn không đi qua `route ===` (server.js dùng seg[1] === ...)
  if (/seg\[1\] === 'staff' && seg\[2\] && req\.method === 'PUT'/.test(source)) {
    found.add('PUT /staff/:u');
  }
  // ít nhất 16 route ghi (không có POST /corrections, PUT /corrections/:id)
  assert.ok(found.size >= 16, `chỉ tìm thấy ${found.size} route ghi trong server.js: mẫu nhận dạng đã lỗi thời`);
  const declared = new Set<any>([...ROUTES.map(r => r.id), ...Object.keys(EXEMPT)]);
  const missing = [...found].filter(id => !declared.has(id));
  assert.deepEqual(
    missing,
    [],
    'route ghi mới chưa nói có khoá kỳ hay không: thêm vào ROUTES (có khoá) hoặc EXEMPT (kèm lý do)'
  );
  const stale = [...declared].filter(id => !found.has(id));
  assert.deepEqual(stale, [], 'khai báo trong test không còn route tương ứng trong server.js');
});

test(
  'period-lock-guards: ROUTE_CAPS khai báo periodScope cho mọi route ghi và bảng test này phủ đủ các route có periodScope',
  pending('V1-A bước 3: src/platform/authz.ts (ROUTE_CAPS) chưa có', 'src/platform/authz.ts'),
  () => {
    assert.ok(exists('src/platform/authz.ts'));
    const { ROUTE_CAPS } = need('src/platform/authz.ts');
    assert.ok(ROUTE_CAPS && typeof ROUTE_CAPS === 'object', 'src/platform/authz.ts phải xuất ROUTE_CAPS');
    const writes = Object.entries<any>(ROUTE_CAPS).filter(([key]: any) => !key.startsWith('GET '));
    assert.ok(writes.length > 0);
    const undeclared = writes
      .filter(([, entry]: any) => !Object.hasOwn(entry || {}, 'periodScope'))
      .map(([key]: any) => key);
    assert.deepEqual(undeclared, [], 'route ghi thiếu khai báo periodScope (dùng null nếu không theo tháng)');
    const covered = new Set<any>([...ROUTES.map(r => r.id), ...Object.keys(EXEMPT), ...Object.keys(COVERED_ELSEWHERE)]);
    const uncovered = writes
      .filter(([key, entry]: any) => entry.periodScope && !covered.has(key))
      .map(([key]: any) => key);
    assert.deepEqual(uncovered, [], 'route có periodScope mà test period-lock-guards chưa phủ: thêm vào ROUTES');
  }
);
