'use strict';
// Bật bộ máy cài đặt không đổi một đồng nào:
// khi KHÔNG có dòng tham số nào (param_versions rỗng), mọi kết quả lương bằng đúng kết quả của bộ tham số mặc định (DEFAULTS), từng đồng,
// ở CẢ HAI giá trị params_mode ('defaults-only' và 'active').
//   - nhóm 1: migration để param_versions rỗng và params_mode = defaults-only;
//   - nhóm 2 (src/engine/payroll-params.ts): ParamSet của mọi tháng bằng DEFAULTS, và 'defaults-only' bỏ qua mọi dòng phiên bản;
//   - nhóm 3 (thêm src/engine/payroll-engine.ts): bộ máy chạy ParamSet của tháng trả đúng từng đồng và đúng dấu vân tay như bộ máy chạy DEFAULTS cộng dòng danh mục trên đầu vào của 300 ca vàng;
//   - nhóm 4 (route kỳ lương): qua cả DB, API và bản chụp phiếu, bốn người bịa, hai tháng (có và không có giờ thực tế).
// Nhóm thiếu file chạy như `todo` và đỏ bằng "module missing", không bằng lỗi nạp. RED=1 để xem.
const F = require('../helpers/api-fixture'); // xác nhận database test tạm trước khi require src/platform/db
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const flow = require('../helpers/period-flow');
const { digest } = require('../helpers/payroll-differential');
const { summarize, readGolden } = require('../helpers/golden');
const { pending, pendingUnless, need, exists } = require('../helpers/red');

const { store } = F;
const PARAMS = 'src/engine/payroll-params.ts';
const ENGINE = 'src/engine/payroll-engine.ts';
const PARAMS_STORE = 'src/params/store.ts';
const MODES = ['defaults-only', 'active'];
const MONTHS = ['2026-09', '2026-10', '2026-11', '2026-12'];

before(F.start);
after(F.stop);

/* ================= nhóm 1: migration ================= */
test('settings-engine-zero-drift: migration để param_versions rỗng và params_mode = defaults-only (công tắc lùi nhanh)', async () => {
  assert.equal(await store.params.count(), 0, 'chưa ai đặt tham số nào');
  assert.equal(await store.getSetting('params_mode', null), 'defaults-only');
  assert.equal(await store.params.getMode(), 'defaults-only');
});

/* ================= nhóm 2: src/engine/payroll-params.ts ================= */
test(
  'settings-engine-zero-drift: src/engine/payroll-params.ts xuất DEFAULTS và resolveParamSet(rows, month)',
  pending('S2: src/engine/payroll-params.ts chưa có', PARAMS),
  () => {
    const Params = need(PARAMS);
    assert.ok(Params.DEFAULTS && typeof Params.DEFAULTS === 'object', 'DEFAULTS');
    assert.equal(typeof Params.resolveParamSet, 'function', 'resolveParamSet(rows, month)');
  }
);

test(
  'settings-engine-zero-drift: không có dòng tham số nào thì ParamSet của mọi tháng bằng DEFAULTS (so từng giá trị)',
  pending('S2: src/engine/payroll-params.ts chưa có', PARAMS),
  () => {
    const { DEFAULTS, resolveParamSet } = need(PARAMS);
    for (const month of MONTHS) assert.equal(digest(resolveParamSet([], month)), digest(DEFAULTS), month);
  }
);

test(
  'settings-engine-zero-drift: params_mode quyết định có dùng dòng phiên bản hay không (defaults-only bỏ qua, active áp dụng), không dòng nào thì như nhau',
  pending('S2: src/params/store.ts (đọc tham số) chưa có', PARAMS, PARAMS_STORE),
  async () => {
    const { resolveParamSet } = need(PARAMS);
    const params = need(PARAMS_STORE);
    const unwrap = (value?) => (value && (value.params || value.paramSet)) || value; // resolve có thể trả thẳng ParamSet hoặc bọc trong params/paramSet
    // Danh mục chức vụ/bậc/ca nằm trong DB và luôn được chồng lên bộ tham số (src/domain/catalog-params.ts), ở cả hai chế độ.
    // Danh mục nạp sẵn giữ nguyên mọi số tiền của DEFAULTS, chỉ thêm tên bậc và khoá mới (phụ cấp đêm theo bậc, loại ca, mã ca),
    // nên "không có dòng nào" nghĩa là DEFAULTS + dòng danh mục (test/unit/domain-classes.test.ts kiểm danh mục khớp DEFAULTS).
    const { catalogParams } = require('../../src/domain/catalog-params');
    const baseline = async (month?) => digest(resolveParamSet(await catalogParams.rows(), month));
    // param_versions chỉ được thêm dòng (trigger chặn DELETE), nên dòng thử nằm trong SAVEPOINT và được ROLLBACK: các test khác thấy bảng rỗng.
    // Giao dịch thật (SAVEPOINT chỉ dùng được trong giao dịch, và PostgreSQL nhiều kết nối không có 'một kết nối chung'): ném ROLLBACK ở cuối để hoàn tác.
    const ROLLBACK = new Error('hoàn tác dòng thử');
    let failure: any = null;
    try {
      await store.transaction(async () => {
        try {
          for (const mode of MODES) {
            await store.setSetting('params_mode', mode);
            for (const month of MONTHS)
              assert.equal(
                digest(unwrap(await params.resolve(month))),
                await baseline(month),
                `${mode} ${month} khi chưa có dòng nào`
              );
          }
          await store.db
            .prepare(
              'INSERT INTO param_versions (key, effective_month, value_json, reason, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)'
            )
            .run(
              'attendance.overLimitHours',
              '2026-10',
              '20',
              'Thử đổi ngưỡng giờ vượt',
              'admin',
              new Date(Date.now()).toISOString()
            );
          await store.setSetting('params_mode', 'defaults-only');
          assert.equal(
            digest(unwrap(await params.resolve('2026-10'))),
            await baseline('2026-10'),
            'defaults-only phải bỏ qua mọi dòng phiên bản'
          );
          await store.setSetting('params_mode', 'active');
          assert.notEqual(
            digest(unwrap(await params.resolve('2026-10'))),
            await baseline('2026-10'),
            'active phải áp dụng dòng phiên bản'
          );
          assert.equal(
            digest(unwrap(await params.resolve('2026-09'))),
            await baseline('2026-09'),
            'dòng có hiệu lực từ 2026-10 không ảnh hưởng tháng 2026-09'
          );
        } catch (error) {
          failure = error;
        }
        throw ROLLBACK;
      });
    } catch (error) {
      if (error !== ROLLBACK) throw error;
    }
    await store.setSetting('params_mode', 'defaults-only');
    if (failure) throw failure;
  }
);

/* ================= nhóm 3: bộ máy + ParamSet trên ca vàng ================= */
test(
  'settings-engine-zero-drift: bộ máy chạy ParamSet của tháng (không dòng nào) trả đúng từng đồng của bộ máy chạy DEFAULTS cộng danh mục trên 300 ca vàng ở cả hai params_mode',
  pending('S3: src/engine/payroll-engine.ts hoặc src/engine/payroll-params.ts chưa có', PARAMS, ENGINE),
  async () => {
    const { DEFAULTS, resolveParamSet } = need(PARAMS);
    const Engine = need(ENGINE);
    const unwrap = (value?) => (value && (value.params || value.paramSet)) || value;
    const resolve = async (month?) =>
      exists(PARAMS_STORE) ? unwrap(await need(PARAMS_STORE).resolve(month)) : resolveParamSet([], month);
    assert.ok(DEFAULTS);
    assert.equal(
      await store.params.count(),
      0,
      'test vàng chạy với param_versions rỗng (không dòng nào rò từ test khác)'
    );
    const golden = readGolden().cases;
    // "Không dòng nào" nghĩa là DEFAULTS + dòng danh mục chức vụ, bậc, ca (src/domain/catalog-params.ts), như nhóm 2
    const { catalogParams } = require('../../src/domain/catalog-params');
    const reference = new Map<any, any>();
    const referenceEngine = async (month?) => {
      if (!reference.has(month))
        reference.set(month, Engine.create(resolveParamSet(await catalogParams.rows(), month)));
      return reference.get(month);
    };
    try {
      for (const mode of MODES) {
        await store.setSetting('params_mode', mode);
        const engines = new Map<any, any>();
        const wrong: any[] = [];
        for (const c of golden) {
          if (!engines.has(c.input.month)) engines.set(c.input.month, Engine.create(await resolve(c.input.month)));
          try {
            assert.deepStrictEqual(
              summarize(engines.get(c.input.month).computeMonth(JSON.parse(JSON.stringify(c.input)))),
              summarize((await referenceEngine(c.input.month)).computeMonth(JSON.parse(JSON.stringify(c.input))))
            );
          } catch {
            wrong.push(c.id);
          }
        }
        assert.deepEqual(wrong, [], `params_mode ${mode}: ca lệch so với bộ máy chạy DEFAULTS cộng danh mục`);
      }
    } finally {
      await store.setSetting('params_mode', 'defaults-only');
    }
  }
);

/* ================= nhóm 4: qua DB, API và bản chụp phiếu ================= */
// Nhóm 4 chạy khi có src/domain/payroll/payroll-service.ts
const routesReady = pendingUnless(
  'V1-A bước 3: src/domain/payroll/payroll-service.ts chưa có',
  exists('src/domain/payroll/payroll-service.ts')
);
// Bốn tổ hợp: (chế độ) × (tháng 2026-10, tháng 2026-11)
for (const mode of MODES)
  for (const month of ['2026-10', '2026-11'])
    test(
      `settings-engine-zero-drift: params_mode "${mode}", tháng ${month}: phiếu lương bằng đúng khối cũ, từng đồng`,
      routesReady,
      async () => {
        await flow.seedMonth(month);
        await store.setSetting('params_mode', mode);
        assert.equal(await store.params.count(), 0, 'không được có dòng tham số nào');
        const expected = await flow.expectedFor(month);
        const { lock, calc } = await flow.lockAndCalculate(month);
        assert.equal(lock.status, 200, `chốt công: ${lock.status} ${JSON.stringify(lock.data)}`);
        assert.equal(calc.status, 200, `tính lương: ${calc.status} ${JSON.stringify(calc.data)}`);
        const { run, slips } = await flow.payslipsOf(month);
        assert.ok(run, 'phải có lần chạy');
        const wrong: any[] = [];
        for (const p of flow.PEOPLE) {
          const want = expected[p.username],
            got = slips[p.username];
          if (!got) {
            wrong.push(`${p.username}: không có phiếu`);
            continue;
          }
          const actual = {
            gross: got.gross,
            insurance: got.insurance,
            tax: got.tax,
            advance: got.advance,
            net: got.net,
            total: got.snapshot && got.snapshot.total
          };
          const exact = {
            gross: want.net.gross,
            insurance: want.net.insurance,
            tax: want.net.tax,
            advance: want.net.advance,
            net: want.net.net,
            total: want.total
          };
          if (JSON.stringify(actual) !== JSON.stringify(exact))
            wrong.push(`${p.username}: ${JSON.stringify(actual)} khác ${JSON.stringify(exact)}`);
        }
        assert.deepEqual(wrong, []);
      }
    );
