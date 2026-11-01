'use strict';
// "Lưu là áp dụng toàn hệ thống": sau khi Admin Lưu MỘT khoá tiền đã nối với tháng hiệu lực M,
// từ lúc COMMIT mọi nơi đọc của tháng M thấy giá trị mới, còn tháng trước M và tháng đã khoá thì không đổi một đồng:
//   - GET /api/me/estimate?month=M: số tiền ước tính của nhân viên (đúng từng đồng theo bộ máy chạy bộ tham số mới);
//   - POST /api/periods/M/calculate: bản chụp phiếu mang params_hash, params_rev và giá trị mới;
//   - GET /api/settings/params?month=M: màn Cài đặt thấy giá trị mới, kèm dòng lịch sử (lý do, tháng áp dụng);
//   - tháng M-1 (đã chốt công và tính lương) giữ nguyên ước tính, bản chụp, băm tham số và verify; đặt hiệu lực ở đó vẫn lưu được và chỉ cảnh báo PERIOD_LOCKED.
// Khoá được chọn lúc chạy: ưu tiên lương cơ bản bậc 1 của NV nếu đã nối (wired), nếu chưa thì khoá tiền đã nối khác (test/helpers/settings-api.ts → wiredMoneyKey).
const S = require('../helpers/settings-api');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../../src/engine/payroll-engine');
const paramsStore = require('../../src/params/store');
const PunchRules = require('../../src/engine/punch');

const { F, store, flow } = S;
const monthOf = S.monthPool();

before(F.start);
after(F.stop);

const nextMonthOf = (month?) => {
  const [y, m] = month.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
};
const estimate = (month?, who = 'qa_nv1') => F.call('GET', `/me/estimate?month=${month}`, { who });
const netOf = async (username?, month?, params?) =>
  Engine.computeMonth(await flow.legacyInput(username, month), params).m.net;
const viaJson = (value?) => JSON.parse(JSON.stringify(value));
// Dữ liệu tháng M cho bốn người của period-flow: ngày công theo ca (không OT, mỗi ngày một lượt Check-in/out), thêm một ngày làm lễ chờ duyệt của qa_nv1 (khoản chờ duyệt đổi tiền theo lương)
async function addMonthData(month?, holiday?) {
  for (const p of flow.PEOPLE) {
    const [tin, tout] = PunchRules.SHIFT[p.shiftCode];
    const allowed = p.type === 'tts' ? [1, 2, 3, 4, 5] : [1, 2, 3, 4, 5, 6];
    const dates = S.datesOf(month)
      .filter(d => allowed.includes(new Date(d + 'T00:00:00Z').getUTCDay()) && d !== holiday)
      .slice(0, 20);
    const days = Object.fromEntries(dates.map(d => [d, { kind: 'work', in: tin, out: tout, preset: p.shiftCode }]));
    if (p.username === 'qa_nv1') days[holiday] = { kind: 'work', in: tin, out: tout, preset: p.shiftCode };
    const res = await F.call('PUT', '/sheet', { who: p.username, body: { month, days } });
    assert.equal(res.status, 200, `${p.username}: ${JSON.stringify(res.data)}`);
    // ngày công là ngày có lượt Check-in/out: mỗi ngày đi làm đã khai có một lượt đúng giờ ca (ngày lễ khai không chấm là vắng)
    for (const date of Object.keys(days)) {
      const plan = PunchRules.planShift({ shiftCode: p.shiftCode, sched: allowed }, date);
      const entry = PunchRules.buildDay({ shiftCode: p.shiftCode }, plan.startIso, plan.endIso, 'punch', {
        plannedShift: plan,
        approveIncomplete: true
      }).entry;
      await store.createSession(p.username, plan.date, 'closed', entry);
    }
  }
}
const fingerprint = async (month?) => {
  const { run, slips } = await flow.payslipsOf(month);
  return JSON.stringify({
    run: run && [run.run_no, run.status, run.params_hash, run.params_rev, run.params_json, run.inputs_digest],
    slips: Object.fromEntries(
      Object.entries<any>(slips).map(([u, x]: any) => [
        u,
        [x.gross, x.insurance, x.tax, x.advance, x.net, Buffer.from(x.snapshot_gz).toString('hex')]
      ])
    )
  });
};

test(
  'R1 lưu là áp dụng: một khoá tiền đã nối lưu với tháng M đổi ước tính, bản chụp tính lương và màn Cài đặt của M; tháng M-1 đã khoá giữ nguyên từng đồng',
  S.readyWith(S.wiredMoneyKey(), 'khoá tiền đã nối (wired) cho NV'),
  async t => {
    const A = monthOf(); // M-1: đã chốt công và tính lương trước khi Lưu
    const M = monthOf();
    const N = nextMonthOf(M); // sau M: thừa hưởng giá trị
    const key = await S.wiredMoneyKey();
    assert.equal(nextMonthOf(A), M);

    // ---- dựng hai tháng: A khoá (calculated), M mở với dữ liệu và một khoản chờ duyệt ----
    await S.setupMonth(A, 'calculated');
    const holiday = S.dowDates(M, 3)[1]; // thứ Tư thứ hai của M
    await store.setSetting('holidays', [...(await store.getSetting('holidays', [])), holiday]);
    await F.at(`${N}-02T09:00:00`); // M đã qua: ước tính cả tháng
    await addMonthData(M, holiday);
    await S.setMode('defaults-only');

    // ---- đường cơ sở trước khi Lưu ----
    const estBefore = (await estimate(M)).data;
    const estOtherBefore = (await estimate(M, 'qa_ctv1')).data;
    // "chưa lưu gì" nghĩa là DEFAULTS + dòng danh mục chức vụ, bậc, ca (src/domain/catalog-params.ts), như bộ tham số hiệu lực của tháng
    const baseParams = (await paramsStore.resolve(M)).params;
    const expectedBefore = await netOf('qa_nv1', M, baseParams);
    assert.deepEqual(
      estBefore.net,
      viaJson(expectedBefore),
      'trước khi Lưu: bằng bộ máy với mặc định cộng danh mục, từng đồng'
    );
    const estABefore = (await estimate(A)).data;
    const viewABefore = (await S.paramsView(A)).data;
    const fingerprintABefore = await fingerprint(A);
    const verifyABefore = (await F.call('GET', `/periods/${A}/verify`)).data;
    assert.deepEqual(verifyABefore.mismatched, []);
    const viewMBefore = (await S.paramsView(M)).data;
    assert.equal(S.valueOfKey(viewMBefore, key.key), key.was);

    // ---- Lưu ----
    const saved = await S.saveChanges([{ key: key.key, value: key.value }], {
      month: M,
      reason: 'Điều chỉnh theo quyết định tháng này'
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.data).slice(0, 400));
    assert.equal(saved.data.saved[0].effectiveMonth, M);
    assert.equal(await store.params.getMode(), 'active');
    const newParams = { ...baseParams, [key.key]: key.value };
    const expectedAfter = await netOf('qa_nv1', M, newParams);
    assert.notEqual(expectedAfter.net, expectedBefore.net, 'điều kiện của bài: đổi khoá làm đổi thực lĩnh của qa_nv1');

    // (1) ước tính của nhân viên: số mới đúng từng đồng; người không bị ảnh hưởng giữ nguyên
    const estAfter = (await estimate(M)).data;
    assert.deepEqual(
      estAfter.net,
      viaJson(expectedAfter),
      `ước tính sau khi Lưu: thực lĩnh ${expectedBefore.net} → ${expectedAfter.net}`
    );
    assert.notDeepEqual(estAfter.net, estBefore.net);
    assert.equal(estAfter.paramsHash, saved.data.paramsHash, 'ước tính ghi băm tham số vừa lưu');
    assert.notEqual(estAfter.paramsHash, estBefore.paramsHash);
    const estOtherAfter = (await estimate(M, 'qa_ctv1')).data;
    assert.deepEqual(estOtherAfter.net, estOtherBefore.net, 'CTV không bị khoá NV ảnh hưởng');

    // (3) màn Cài đặt: giá trị mới, phiên bản, dòng lịch sử có lý do và tháng áp dụng; tháng sau M thừa hưởng
    const viewM = (await S.paramsView(M)).data;
    assert.equal(S.valueOfKey(viewM, key.key), key.value);
    assert.equal(viewM.paramsRev, saved.data.paramsRev);
    assert.equal(viewM.paramsHash, saved.data.paramsHash);
    const history = S.findHistory(viewM, key.key).filter(h => h.value === key.value && h.effectiveMonth === M);
    assert.ok(history.length >= 1, 'GET /settings/params có dòng lịch sử của lần Lưu');
    assert.equal(history[0].reason, 'Điều chỉnh theo quyết định tháng này');
    assert.equal(S.valueOfKey((await S.paramsView(N)).data, key.key), key.value, 'tháng sau M dùng giá trị đã lưu');

    // (4) tính lương M: lần chạy mang đúng băm, số phiên bản, giá trị mới; phiếu bằng bộ máy với tham số mới
    await store.approvals.decide(
      (await store.approvals.list({ status: 'pending' }))
        .filter(r => r.date.startsWith(M))
        .map(r => ({ username: r.username, date: r.date, rev: r.rev, fingerprint: r.fingerprint })),
      'approved',
      'admin',
      'Duyệt để tính lương'
    );
    await F.at(`${N}-03T09:00:00`);
    S.must(await S.step(M, 'lock-attendance'), 'chốt công M');
    S.must(await S.step(M, 'calculate'), 'tính lương M');
    const { run, slips } = await flow.payslipsOf(M);
    assert.equal(run.params_hash, saved.data.paramsHash, 'bản chụp mang băm tham số vừa lưu');
    assert.equal(run.params_rev, saved.data.paramsRev);
    assert.equal(JSON.parse(run.params_json)[key.key], key.value);
    const expectedSlip = await netOf('qa_nv1', M, newParams);
    assert.equal(slips.qa_nv1.net, expectedSlip.net, 'thực lĩnh trên phiếu theo tham số mới');
    assert.equal(slips.qa_nv1.gross, expectedSlip.gross);
    assert.equal((await F.call('GET', `/periods/${M}/verify`)).data.mismatched.length, 0);

    // (5) tháng M-1 đã khoá: ước tính, màn Cài đặt, bản chụp, băm và verify không đổi một đồng
    const estAAfter = (await estimate(A)).data;
    assert.deepEqual(estAAfter.net, estABefore.net, 'ước tính tháng M-1 giữ nguyên');
    assert.equal(estAAfter.paramsHash, estABefore.paramsHash);
    const viewA = (await S.paramsView(A)).data;
    assert.equal(
      S.valueOfKey(viewA, key.key),
      S.valueOfKey(viewABefore, key.key),
      'màn Cài đặt tháng M-1 giữ giá trị cũ'
    );
    assert.equal(viewA.paramsHash, viewABefore.paramsHash);
    assert.equal(await fingerprint(A), fingerprintABefore, 'bản chụp phiếu tháng M-1 nguyên vẹn');
    assert.equal(
      (await flow.payslipsOf(A)).run.params_hash,
      viewA.paramsHash,
      'băm của bản chụp M-1 vẫn bằng băm tham số của tháng đó'
    );
    const verifyA = (await F.call('GET', `/periods/${A}/verify`)).data;
    assert.deepEqual(verifyA.mismatched, []);
    assert.equal(verifyA.checked, verifyABefore.checked);
    // đặt hiệu lực ở tháng đã khoá vẫn lưu được, kèm cảnh báo PERIOD_LOCKED; bản chụp phiếu và băm tham số của lần chạy cũ không đổi
    const other =
      (((await S.adminKeys()).find(k => k.key === key.key) || {}).values || []).find(v => v !== key.value) ??
      key.value + 1;
    const locked = await S.saveChanges([{ key: key.key, value: other }], {
      month: A,
      expectedRev: await S.paramsRevOf(A)
    });
    assert.equal(locked.status, 200, JSON.stringify(locked.data).slice(0, 300));
    assert.equal(locked.data.saved[0].effectiveMonth, A);
    const warned = (locked.data.warnings || []).filter(w => w.code === 'PERIOD_LOCKED');
    assert.ok(warned.length >= 1, JSON.stringify(locked.data.warnings)); // một cảnh báo cho tháng đã chốt công, một cho phạm vi tham số của kỳ đã tính
    assert.equal(S.valueOfKey((await S.paramsView(A)).data, key.key), other, 'giá trị mới đã được lưu cho tháng M-1');
    assert.equal(await fingerprint(A), fingerprintABefore, 'bản chụp phiếu tháng M-1 vẫn nguyên vẹn');
    assert.equal((await flow.payslipsOf(A)).run.params_hash, viewABefore.paramsHash, 'băm của bản chụp M-1 không đổi');
  }
);

test(
  'R1 lưu là áp dụng: Lưu hai lần liên tiếp cho cùng tháng — số mới nhất thắng ở mọi nơi đọc, không có bộ nhớ đệm cũ (ước tính, màn Cài đặt và băm luôn khớp lần Lưu cuối)',
  S.readyWith(S.wiredMoneyKey() && S.adminKeys().find(k => k.values.length >= 3), 'khoá tiền đã nối'),
  async () => {
    const A = monthOf();
    await S.seed(A);
    await F.person('qa_plain', 'staff', { type: 'nv', level: 1, startDate: '2026-01-05' });
    const key = (await S.adminKeys()).find(k => k.key === S.wiredMoneyKey().key) || (await S.adminKeys())[0];
    const [v1, v2] = await S.differing(key, A, 2);
    let last;
    for (const value of [v1, v2]) {
      const res = await S.saveChanges([{ key: key.key, value }], { month: A });
      assert.equal(res.status, 200, JSON.stringify(res.data).slice(0, 300));
      last = res.data;
      const view = (await S.paramsView(A)).data;
      assert.equal(S.valueOfKey(view, key.key), value);
      assert.equal(view.paramsHash, res.data.paramsHash);
      const est = (await estimate(A)).data;
      assert.equal(est.paramsHash, res.data.paramsHash, `ước tính phải theo bộ tham số của lần Lưu ${value}`);
      assert.deepEqual(
        est.net,
        viaJson(await netOf('qa_nv1', A, (await paramsStore.resolve(A)).params)),
        'bằng bộ máy chạy bộ tham số hiệu lực của tháng'
      );
      assert.equal((await paramsStore.resolve(A)).params[key.key], value);
    }
    assert.equal(last.saved[0].previous.value, v1, 'phiên bản trước của lần Lưu thứ hai là giá trị lần Lưu thứ nhất');
  }
);
