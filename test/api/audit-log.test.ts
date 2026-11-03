'use strict';
// Nhật ký kiểm toán: chỉ thêm dòng, nối băm, ghi cùng giao dịch với thay đổi, không chứa bí mật, chỉ người có quyền đọc.
// Chia hai nhóm:
//   - tầng kho dữ liệu (src/platform/db.ts: store.audit, trigger của bảng audit_log);
//   - tầng nối vào API (src/platform/audit.ts và các route): chạy như `todo` khi chưa có src/platform/audit.ts, RED=1 để chạy như test thường.
// Tên test: audit-append-only, audit-hash-chain, audit-atomic, audit-no-secrets, audit-permissions.
const F = require('../helpers/api-fixture'); // xác nhận database test tạm trước khi require src/platform/db
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { pending } = require('../helpers/red');

const { store } = F;
const wired = pending('V1-A bước 3: src/platform/audit.ts và các route ghi nhật ký chưa có', 'src/platform/audit.ts');

before(F.start);
after(F.stop);
beforeEach(async () => {
  await F.reset();
  await F.at('2026-11-02T09:00:00');
  await F.person('admin', 'admin', { type: 'tts', level: 0, shiftCode: null, startDate: null });
  await F.person('worker');
});

const count = async () => (await store.db.prepare('SELECT COUNT(*) AS n FROM audit_log').get()).n;
const rowsAfter = async (id?) => await store.db.prepare('SELECT * FROM audit_log WHERE id > ? ORDER BY id').all(id);
const lastId = async () => (await store.db.prepare('SELECT COALESCE(MAX(id), 0) AS id FROM audit_log').get()).id;
const entry = (extra: any = {}) => ({
  actor: 'admin',
  actorRoles: ['admin'],
  action: 'test.write',
  entityKind: 'test',
  entityId: 'x',
  reason: 'Dòng thử của test nhật ký',
  ...extra
});
/* ================= tầng kho dữ liệu ================= */
test('audit-append-only: UPDATE và DELETE trên audit_log bị chặn ở tầng cơ sở dữ liệu', async () => {
  const { id } = await store.audit.write(entry());
  const before = await store.db.prepare('SELECT * FROM audit_log WHERE id = ?').get(id);
  await assert.rejects(
    async () => await store.db.prepare('UPDATE audit_log SET reason = ? WHERE id = ?').run('sửa lén', id),
    /chỉ được thêm dòng/
  );
  await assert.rejects(
    async () => await store.db.prepare('UPDATE audit_log SET actor = ? WHERE id = ?').run('ke-gian', id),
    /chỉ được thêm dòng/
  );
  await assert.rejects(
    async () => await store.db.prepare('DELETE FROM audit_log WHERE id = ?').run(id),
    /chỉ được thêm dòng/
  );
  await assert.rejects(async () => await store.db.prepare('DELETE FROM audit_log').run(), /chỉ được thêm dòng/);
  assert.deepEqual(await store.db.prepare('SELECT * FROM audit_log WHERE id = ?').get(id), before);
});

test('audit-hash-chain: dòng sau nối băm với dòng trước, verify đi lại chuỗi và báo id đầu tiên bị đứt khi sửa giữa chuỗi', async () => {
  const ids: any[] = [];
  for (const n of [1, 2, 3])
    ids.push((await store.audit.write(entry({ entityId: 'chain-' + n, reason: 'Dòng nối chuỗi số ' + n }))).id);
  const rows = await Promise.all(ids.map(id => store.db.prepare('SELECT * FROM audit_log WHERE id = ?').get(id)));
  assert.equal(rows[1].prev_hash, rows[0].hash);
  assert.equal(rows[2].prev_hash, rows[1].hash);
  const first = await store.db.prepare('SELECT * FROM audit_log ORDER BY id LIMIT 1').get();
  assert.equal(first.prev_hash, '', 'dòng đầu tiên của chuỗi có prev_hash rỗng');
  const intact = await store.audit.verify();
  assert.equal(intact.ok, true, JSON.stringify(intact));
  assert.ok(intact.checked >= 3);
  // Người có quyền ghi DB sửa một dòng giữa chuỗi (phải gỡ trigger mới sửa được); verify phải chỉ ra dòng đó
  await store.db.exec('ALTER TABLE audit_log DISABLE TRIGGER audit_log_no_update');
  try {
    await store.db.prepare('UPDATE audit_log SET reason = ? WHERE id = ?').run('Nội dung bị sửa lén', ids[1]);
    const broken = await store.audit.verify();
    assert.equal(broken.ok, false);
    assert.equal(broken.firstBadId, ids[1]);
    await store.db.prepare('UPDATE audit_log SET reason = ? WHERE id = ?').run(rows[1].reason, ids[1]);
  } finally {
    await store.db.exec('ALTER TABLE audit_log ENABLE TRIGGER audit_log_no_update');
  }
  assert.equal((await store.audit.verify()).ok, true);
});

test('audit-atomic: lỗi giữa giao dịch thì cả thay đổi lẫn dòng nhật ký đều không xảy ra', async () => {
  const before = await count();
  await assert.rejects(
    async () =>
      store.transaction(async () => {
        await store.setSetting('qa_atomic_probe', { n: 1 });
        await store.audit.write(entry({ action: 'test.atomic' }));
        throw new Error('hỏng giữa chừng');
      }),
    /hỏng giữa chừng/
  );
  assert.equal(await count(), before, 'không được còn dòng nhật ký của thao tác đã hoàn tác');
  assert.equal(await store.getSetting('qa_atomic_probe', null), null, 'thay đổi cũng phải hoàn tác');
});

test('audit-log: không có API sửa hay xoá nhật ký (PUT, PATCH, DELETE, POST đều không thành công, dữ liệu giữ nguyên)', async () => {
  const { id } = await store.audit.write(entry());
  const before = await F.snapshot();
  for (const [method, route] of [
    ['PUT', '/audit'],
    ['PATCH', '/audit'],
    ['DELETE', '/audit'],
    ['POST', '/audit'],
    ['PUT', `/audit/${id}`],
    ['DELETE', `/audit/${id}`]
  ]) {
    const res = await F.call(method, route, { body: { reason: 'xoá dấu vết' } });
    assert.ok(res.status >= 400, `${method} /api${route} không được thành công: ${res.status}`);
  }
  assert.deepEqual(await F.snapshot(), before);
});

/* ================= tầng nối vào API ================= */
// Mỗi mục: thao tác ghi hợp lệ và số dòng nhật ký tối thiểu / chính xác nó phải để lại
const WRITES = [
  {
    name: 'ngày lễ (PUT /api/holidays)',
    exact: 1,
    run: async () => F.call('PUT', '/holidays', { body: { dates: ['2026-10-07'] } })
  },
  {
    name: 'vùng GPS (PUT /api/settings/geofence)',
    exact: 1,
    run: async () => F.call('PUT', '/settings/geofence', { body: { lat: 10.7769, lng: 106.7009, radiusM: 150 } })
  },
  {
    name: 'khoá tài khoản (PUT /api/staff/worker với locked:true)',
    exact: 1,
    run: async () => F.call('PUT', '/staff/worker', { body: { locked: true } })
  },
  {
    name: 'sửa số phiếu lương kèm lý do (PUT /api/slip-override), một dòng cho mỗi ô đổi, mức nhạy cảm pay',
    min: 1,
    sensitivity: 'pay',
    reason: 'Điều chỉnh theo bảng lương đã đối chiếu',
    run: async () =>
      F.call('PUT', '/slip-override', {
        body: {
          user: 'worker',
          month: '2026-10',
          values: { workBase: 6000000 },
          reason: 'Điều chỉnh theo bảng lương đã đối chiếu'
        }
      })
  },
  {
    name: 'quyết định duyệt một khoản (PUT /api/approvals/decide)',
    exact: 1,
    setup: async () => {
      const res = await F.call('PUT', '/sheet', {
        who: 'worker',
        body: { month: '2026-10', days: { '2026-10-10': { kind: 'isat' } } }
      });
      assert.equal(res.status, 200, JSON.stringify(res.data));
      const row = (await store.approvals.list({ status: 'pending' }))[0];
      assert.ok(row, 'phải có khoản chờ duyệt');
      return {
        action: 'approve',
        items: [{ username: 'worker', date: '2026-10-10', rev: row.rev, fingerprint: row.fingerprint }]
      };
    },
    run: async (body?) => F.call('PUT', '/approvals/decide', { body })
  }
];
for (const write of WRITES)
  test(
    `audit-log: ${write.name} thêm đúng ${write.exact ? 'một' : 'ít nhất một'} dòng nhật ký có người làm, giờ và chuỗi băm còn hợp lệ`,
    wired,
    async () => {
      const body = write.setup ? await write.setup() : undefined;
      const startId = await lastId();
      const res = await write.run(body);
      assert.equal(res.status, 200, `${write.name}: ${res.status} ${JSON.stringify(res.data)}`);
      const rows = await rowsAfter(startId);
      if (write.exact)
        assert.equal(rows.length, write.exact, `số dòng nhật ký: ${JSON.stringify(rows.map(r => r.action))}`);
      else assert.ok(rows.length >= write.min, 'thiếu dòng nhật ký');
      for (const row of rows) {
        assert.equal(row.actor, 'admin');
        assert.match(row.at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/, 'at là ISO UTC');
        assert.ok(row.action && row.entity_kind && row.entity_id);
        if (write.sensitivity) assert.equal(row.sensitivity, write.sensitivity);
        if (write.reason) assert.equal(row.reason, write.reason);
      }
      assert.equal((await store.audit.verify()).ok, true, 'chuỗi băm phải còn nguyên sau khi ghi');
    }
  );

test(
  'audit-log: thao tác bị từ chối (400 hoặc 409) không để lại dòng nhật ký và không đổi dữ liệu',
  wired,
  async () => {
    // đối chứng: một thao tác hợp lệ PHẢI để lại dòng, nếu không thì "không có dòng" bên dưới chẳng chứng minh gì
    const control = await lastId();
    assert.equal((await F.call('PUT', '/holidays', { body: { dates: ['2026-10-07'] } })).status, 200);
    assert.ok((await rowsAfter(control)).length >= 1, 'thao tác hợp lệ không để lại dòng nhật ký nào');
    const before = await F.snapshot();
    const startId = await lastId();
    for (const [method, route, body] of [
      ['PUT', '/holidays', { dates: 'không phải danh sách' }],
      ['PUT', '/approvals/decide', { action: 'approve', items: [] }],
      ['PUT', '/slip-override', { user: 'worker', month: '2026-13', values: {} }]
    ]) {
      const res = await F.call(method, route, { body });
      assert.ok(res.status >= 400 && res.status < 500, `${method} ${route}: ${res.status}`);
    }
    assert.equal((await rowsAfter(startId)).length, 0);
    assert.deepEqual(await F.snapshot(), before);
  }
);

test(
  'audit-no-secrets: sau các luồng ghi, không dòng nhật ký nào chứa mật khẩu, hàm băm mật khẩu, cookie, khoá phiên hay toạ độ GPS',
  wired,
  async () => {
    const PASSWORD = 'Matkhau-Thu-Nghiem-9';
    const startId = await lastId();
    const responses = [
      await F.call('PUT', '/staff/qa_moi', {
        body: {
          name: 'Người mới bịa',
          type: 'nv',
          level: 1,
          startDate: '2026-10-01',
          shiftCode: 'n1',
          password: PASSWORD
        }
      }),
      await F.call('PUT', '/staff/worker', {
        body: {
          name: 'Người thử worker',
          type: 'nv',
          level: 1,
          startDate: '2026-01-05',
          shiftCode: 'n1',
          jobTitle: 'Nhân viên thử'
        }
      }),
      // tài khoản đã có đặt lại mật khẩu bằng route riêng (có lý do); mật khẩu không bao giờ vào nhật ký
      await F.call('POST', '/staff/worker/password', {
        body: { password: PASSWORD + '-doi', reason: 'Đặt lại mật khẩu theo yêu cầu của người dùng' }
      }),
      await F.call('PUT', '/settings/geofence', { body: { lat: 10.7769, lng: 106.7009, radiusM: 150 } }),
      await F.call('PUT', '/holidays', { body: { dates: ['2026-10-07'] } })
    ];
    for (const res of responses) assert.equal(res.status, 200, JSON.stringify(res.data));
    const rows = await rowsAfter(startId);
    assert.ok(
      rows.length >= 3,
      `phải có nhật ký của các thao tác ghi (chỉ có ${rows.length}), nếu không việc quét này chẳng chứng minh gì`
    );
    const hashes: any[] = [];
    for (const u of ['qa_moi', 'worker']) hashes.push((await store.getStaffRow(u)).pass_hash.slice(0, 24));
    const forbidden = [
      'scrypt$',
      'luong_sid',
      PASSWORD,
      process.env.SESSION_SECRET,
      '10.7769',
      '106.7009',
      '"lat"',
      '"lng"',
      'pass_hash',
      'passHash',
      ...hashes
    ];
    const text = rows
      .map(r =>
        [
          r.actor_roles,
          r.action,
          r.entity_kind,
          r.entity_id,
          r.subject,
          r.before_json,
          r.after_json,
          r.reason,
          r.request_id
        ].join('\u0001')
      )
      .join('\n');
    for (const needle of forbidden) assert.ok(!text.includes(needle), `nhật ký chứa "${needle.slice(0, 12)}..."`);
  }
);

test(
  'audit-permissions: chỉ người có quyền đọc nhật ký (GET /api/audit, /api/audit/verify); nhân sự bị 403, chưa đăng nhập bị 401',
  wired,
  async () => {
    await store.audit.write(entry());
    for (const route of ['/audit', '/audit/verify']) {
      const got = {
        admin: (await F.call('GET', route, { who: 'admin' })).status,
        nhanSu: (await F.call('GET', route, { who: 'worker' })).status,
        chuaDangNhap: (await F.call('GET', route, { who: null })).status
      };
      assert.deepEqual(got, { admin: 200, nhanSu: 403, chuaDangNhap: 401 }, `GET /api${route}`);
    }
    const verify = await F.call('GET', '/audit/verify', { who: 'admin' });
    assert.equal(verify.data.ok, true, JSON.stringify(verify.data));
  }
);

test(
  'audit-permissions: phản hồi danh sách nhật ký không chứa bí mật và giới hạn tối đa 200 dòng một trang',
  wired,
  async () => {
    for (let i = 0; i < 205; i++)
      await store.audit.write(entry({ entityId: 'bulk-' + i, reason: 'Dòng số ' + i + ' để thử phân trang' }));
    const res = await F.call('GET', '/audit?limit=1000', { who: 'admin' });
    assert.equal(res.status, 200);
    const rows = res.data.rows || res.data.items || res.data.audit || res.data.entries;
    assert.ok(Array.isArray(rows), 'phản hồi phải có mảng dòng nhật ký (rows, items, audit hoặc entries)');
    assert.ok(rows.length <= 200, `được ${rows.length} dòng, tối đa 200`);
    for (const secret of ['scrypt$', 'luong_sid', process.env.SESSION_SECRET])
      assert.ok(!JSON.stringify(res.data).includes(secret), `phản hồi chứa ${secret}`);
  }
);
