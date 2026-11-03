'use strict';
// Bản chụp phiếu lương bất biến và kiểm lại được:
//   - `calculate` tạo lần chạy kèm params_hash, params_rev, engine_version và một phiếu cho từng người; số tiền của phiếu bằng đúng
//     khối công thức đã đóng băng trên cùng dữ liệu, từng đồng;
//   - sau đó đổi tham số, đổi lịch (bị khoá), đổi hồ sơ: bản chụp không đổi; `verify` tính lại từ đầu vào đã lưu và không báo lệch;
//   - sửa dữ liệu ngoài đường API thì `verify` chỉ đúng người bị lệch;
//   - sửa trực tiếp bảng phiếu hay lần chạy bằng node:sqlite bị trigger chặn.
const F = require('../helpers/api-fixture'); // xác nhận database test tạm trước khi require src/platform/db
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const flow = require('../helpers/period-flow');
const { digest } = require('../helpers/payroll-differential');

const { store } = F;
const MONTH = '2026-10';
// options rỗng: các test HTTP luôn chạy
const ready: Record<string, any> = {};

before(F.start);
after(F.stop);

/* ================= trigger của cơ sở dữ liệu ================= */
// Dựng tay một lần chạy và một phiếu để thử trigger mà không cần API
async function insertRun(status = 'draft') {
  const run = await store.db
    .prepare(
      `INSERT INTO payroll_runs (month, run_no, status, engine_version, params_hash, params_rev, params_json, switches_json, created_by, created_at)
       VALUES ('2026-12', (SELECT COALESCE(MAX(run_no), 0) + 1 FROM payroll_runs WHERE month = '2026-12'), 'draft', 'test-1', ?, 0, '{}', '{}', 'admin', '2026-12-31T00:00:00.000Z')`
    )
    .run('a'.repeat(64));
  const runId = Number(run.lastInsertRowid);
  await store.db
    .prepare(
      `INSERT INTO payslips (run_id, username, status, gross, insurance, tax, advance, net, staff_terms_json, snapshot_gz)
       VALUES (?, 'qa_trigger', 'draft', 7000000, 630000, 0, 0, 6370000, '{}', ?)`
    )
    .run(runId, zlib.gzipSync(JSON.stringify({ total: 7000000 })));
  if (status !== 'draft') await store.db.prepare('UPDATE payroll_runs SET status = ? WHERE id = ?').run(status, runId);
  return runId;
}
const slip = async (runId?) => await store.db.prepare('SELECT * FROM payslips WHERE run_id = ?').get(runId);
const run = async (runId?) => await store.db.prepare('SELECT * FROM payroll_runs WHERE id = ?').get(runId);

test('payslip-snapshot: số tiền, nội dung chụp và điều khoản của phiếu không sửa được trực tiếp trong DB, kể cả khi lần chạy còn nháp', async () => {
  const runId = await insertRun('draft');
  const before = await slip(runId);
  for (const [column, value] of [
    ['net', 1],
    ['gross', 1],
    ['insurance', 1],
    ['tax', 1],
    ['advance', 1],
    ['staff_terms_json', '{"level":9}'],
    ['snapshot_gz', zlib.gzipSync('{}')]
  ])
    await assert.rejects(
      async () => await store.db.prepare(`UPDATE payslips SET ${column} = ? WHERE run_id = ?`).run(value, runId),
      /không được sửa|không được đổi/,
      column
    );
  await assert.rejects(
    async () => await store.db.prepare('DELETE FROM payslips WHERE run_id = ?').run(runId),
    /không được xoá/
  );
  assert.deepEqual(await slip(runId), before);
});

test('payslip-snapshot: lần chạy đã chốt (final) không đổi tham số, phiên bản bộ máy hay phiếu; chỉ được thành superseded', async () => {
  const runId = await insertRun('final');
  const before = { run: await run(runId), slip: await slip(runId) };
  for (const [column, value] of [
    ['params_json', '{"x":1}'],
    ['params_hash', 'b'.repeat(64)],
    ['engine_version', 'test-2'],
    ['switches_json', '{"x":1}'],
    ['inputs_digest', 'c']
  ])
    await assert.rejects(
      async () => await store.db.prepare(`UPDATE payroll_runs SET ${column} = ? WHERE id = ?`).run(value, runId),
      /không được sửa|lùi trạng thái/,
      column
    );
  await assert.rejects(
    async () => await store.db.prepare('UPDATE payslips SET status = ? WHERE run_id = ?').run('approved', runId),
    /không được đổi/
  );
  await assert.rejects(
    async () => await store.db.prepare('UPDATE payslips SET net = 1 WHERE run_id = ?').run(runId),
    /không được/
  );
  await assert.rejects(
    async () => await store.db.prepare('DELETE FROM payslips WHERE run_id = ?').run(runId),
    /không được xoá/
  );
  await assert.rejects(
    async () => await store.db.prepare('DELETE FROM payroll_runs WHERE id = ?').run(runId),
    /không được xoá/
  );
  await assert.rejects(
    async () => await store.db.prepare("UPDATE payroll_runs SET status = 'draft' WHERE id = ?").run(runId),
    /lùi trạng thái|không được sửa/
  );
  assert.deepEqual({ run: await run(runId), slip: await slip(runId) }, before);
  await store.db.prepare("UPDATE payroll_runs SET status = 'superseded' WHERE id = ?").run(runId); // mở lại kỳ: lần chạy cũ thành superseded, không xoá
  assert.equal((await run(runId)).status, 'superseded');
});

/* ================= luồng HTTP: tính lương, bản chụp, kiểm lại ================= */
let calculated: any = null;
async function ensureCalculated() {
  if (!calculated) {
    const seeded = await flow.seedMonth(MONTH);
    const expected = await flow.expectedFor(MONTH);
    const steps = await flow.lockAndCalculate(MONTH);
    calculated = { ...seeded, expected, steps };
  }
  const { steps } = calculated;
  assert.equal(steps.lock.status, 200, `chốt công: ${steps.lock.status} ${JSON.stringify(steps.lock.data)}`);
  assert.equal(steps.calc.status, 200, `tính lương: ${steps.calc.status} ${JSON.stringify(steps.calc.data)}`);
  return calculated;
}
const slipsFingerprint = async () => {
  const { run: current, slips } = await flow.payslipsOf(MONTH);
  return digest({
    run: current && [
      current.engine_version,
      current.params_hash,
      current.params_rev,
      current.params_json,
      current.switches_json,
      current.inputs_digest
    ],
    slips: Object.fromEntries(
      Object.entries<any>(slips).map(([u, s]: any) => [
        u,
        [s.gross, s.insurance, s.tax, s.advance, s.net, s.staff_terms_json, Buffer.from(s.snapshot_gz).toString('hex')]
      ])
    )
  });
};

test(
  'payslip-snapshot: calculate tạo lần chạy có engine_version, params_hash, params_rev, công tắc và một phiếu cho mỗi người',
  ready,
  async () => {
    const { holiday } = await ensureCalculated();
    const { run: current, slips } = await flow.payslipsOf(MONTH);
    assert.ok(current, 'phải có lần chạy trong payroll_runs');
    assert.match(current.engine_version, /\S/, 'engine_version không được rỗng');
    assert.match(current.params_hash, /^(sha256:)?[0-9a-f]{64}$/, 'params_hash là SHA-256');
    assert.equal(current.params_rev, 0, 'chưa có dòng tham số nào nên params_rev = 0');
    assert.equal(typeof JSON.parse(current.params_json), 'object');
    assert.ok(
      JSON.stringify(JSON.parse(current.switches_json)).includes(holiday),
      'switches_json phải gồm ngày lễ của tháng'
    );
    assert.deepEqual(Object.keys(slips).sort(), flow.PEOPLE.map(p => p.username).sort());
    for (const p of flow.PEOPLE) {
      const s = slips[p.username];
      assert.ok(['draft', 'pending'].includes(s.status), `${p.username}: trạng thái ${s.status}`);
      assert.ok(
        s.snapshot && Array.isArray(s.snapshot.rows),
        `${p.username}: snapshot_gz phải giải nén ra JSON có rows`
      );
      const terms = JSON.stringify(s.terms);
      assert.ok(
        terms.includes(`"${p.type}"`) && terms.includes(String(p.level)),
        `${p.username}: staff_terms_json thiếu loại hoặc level`
      );
    }
  }
);

test(
  'payslip-snapshot: số tiền của phiếu bằng đúng khối công thức cũ trên cùng dữ liệu, từng đồng (gross, bảo hiểm, thuế, tạm ứng, thực lĩnh, tổng)',
  ready,
  async () => {
    const { expected } = await ensureCalculated();
    const { slips } = await flow.payslipsOf(MONTH);
    for (const p of flow.PEOPLE) {
      const want = expected[p.username],
        got = slips[p.username];
      assert.deepEqual(
        { gross: got.gross, insurance: got.insurance, tax: got.tax, advance: got.advance, net: got.net },
        {
          gross: want.net.gross,
          insurance: want.net.insurance,
          tax: want.net.tax,
          advance: want.net.advance,
          net: want.net.net
        },
        p.username
      );
      assert.equal(got.snapshot.total, want.total, `${p.username}: total trong bản chụp`);
      assert.equal(got.snapshot.net.net, want.net.net, `${p.username}: net trong bản chụp`);
    }
  }
);

test(
  'payslip-snapshot: đổi tham số sau khi tính (thêm dòng param_versions) không làm đổi bản chụp; verify không báo lệch',
  ready,
  async () => {
    await ensureCalculated();
    const before = await slipsFingerprint();
    await store.db
      .prepare(
        'INSERT INTO param_versions (key, effective_month, value_json, reason, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(
        'attendance.overLimitHours',
        MONTH,
        '12',
        'Thử đổi ngưỡng sau khi đã tính lương',
        'admin',
        new Date(Date.now()).toISOString()
      );
    assert.equal(await slipsFingerprint(), before, 'bản chụp phải giữ nguyên');
    const verify = await flow.api('GET', `/periods/${MONTH}/verify`);
    assert.equal(verify.status, 200, JSON.stringify(verify.data));
    assert.deepEqual(verify.data.mismatched, []);
    assert.equal(verify.data.checked, flow.PEOPLE.length);
  }
);

test(
  'payslip-snapshot: đổi lịch sau khi chốt công vẫn lưu, kèm cảnh báo PERIOD_LOCKED, và không đổi bản chụp',
  ready,
  async () => {
    await ensureCalculated();
    const before = await slipsFingerprint();
    const original = await store.getSheet('qa_nv2', MONTH);
    try {
      const res = await F.call('PUT', '/sheet', {
        who: 'qa_nv2',
        body: { month: MONTH, days: { ...original.days, '2026-10-30': { kind: 'unpaid' } } }
      });
      assert.equal(res.status, 200, JSON.stringify(res.data));
      assert.ok(
        res.data.warnings.some(w => w.code === 'PERIOD_LOCKED'),
        JSON.stringify(res.data.warnings)
      );
      assert.equal(await slipsFingerprint(), before);
    } finally {
      await store.setSheet('qa_nv2', MONTH, original.days); // trả lịch như cũ để các bài sau kiểm verify trên dữ liệu gốc
    }
  }
);

test(
  'payslip-snapshot: đổi hồ sơ nhân sự (level) sau khi tính không làm đổi bản chụp; verify dùng điều khoản đã chụp nên không báo lệch',
  ready,
  async () => {
    await ensureCalculated();
    const before = await slipsFingerprint();
    const res = await F.call('PUT', '/staff/qa_nv1', {
      body: {
        name: 'Người thử qa_nv1',
        role: 'staff',
        type: 'nv',
        level: 2,
        nightPct: 60,
        shiftCode: 'g2',
        startDate: '2026-01-05'
      }
    });
    assert.ok([200, 409].includes(res.status), `đổi hồ sơ: ${res.status} ${JSON.stringify(res.data)}`);
    assert.equal(await slipsFingerprint(), before);
    const verify = await flow.api('GET', `/periods/${MONTH}/verify`);
    assert.deepEqual(verify.data.mismatched, [], JSON.stringify(verify.data));
  }
);

test(
  'payslip-snapshot: verify chỉ đúng người có dữ liệu bị sửa ngoài đường API, và hết báo khi dữ liệu trở lại như cũ',
  ready,
  async () => {
    await ensureCalculated();
    const original = await store.getSheet('qa_nv2', MONTH);
    const days = JSON.parse(JSON.stringify(original.days));
    const date = Object.keys(days).find(d => days[d].kind === 'work');
    days[date] = { kind: 'unpaid' }; // sửa thẳng DB, không qua API (API đã khoá)
    await store.setSheet('qa_nv2', MONTH, days);
    try {
      const verify = await flow.api('GET', `/periods/${MONTH}/verify`);
      assert.equal(verify.status, 200);
      assert.deepEqual(verify.data.mismatched, ['qa_nv2']);
    } finally {
      await store.setSheet('qa_nv2', MONTH, original.days);
    }
    assert.deepEqual((await flow.api('GET', `/periods/${MONTH}/verify`)).data.mismatched, []);
  }
);

test('payslip-snapshot: chỉ người có quyền kiểm lại (audit.read); nhân sự không xem được verify', ready, async () => {
  await ensureCalculated();
  const staff = await F.call('GET', `/periods/${MONTH}/verify`, { who: 'qa_nv1' });
  assert.equal(staff.status, 403);
  assert.equal((await F.call('GET', `/periods/${MONTH}/verify`, { who: null })).status, 401);
});
