'use strict';
// nightOptions theo bậc: PUT /staff/:u kiểm và mặc định phụ cấp đêm (nightPct) theo bảng của BẬC (level.<mã>.<bậc>.nightOptions) trước bảng của chức vụ.
// Giá trị đã lưu không còn trong bảng mới được giữ nguyên (không đổi tiền ngầm); chỉ kiểm khi giá trị gửi lên khác giá trị đã lưu.
const P = require('../helpers/position-api');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { F } = P;

before(F.start);
after(F.stop);

const send = async (username?, patch?) => {
  const staff = await F.store.getStaff(username);
  return await F.call('PUT', `/staff/${username}`, {
    who: 'admin',
    body: {
      name: staff.name,
      role: staff.role,
      type: staff.type,
      level: staff.level,
      shiftCode: staff.shiftCode,
      startDate: staff.startDate,
      nightPct: staff.nightPct,
      ...patch
    }
  });
};

test('nightOptions theo bậc: bậc có bảng riêng [30, 50] thì chỉ nhận 30 hoặc 50, bậc khác vẫn theo bảng chức vụ [40, 60]', async () => {
  const M = await P.setupMonth();
  const save = await P.saveChanges([{ key: 'level.nv.3.nightOptions', value: [30, 50] }], { month: M });
  assert.equal(save.status, 200, JSON.stringify(save.data));
  // qa_nv2 là NV bậc 3 (đang 40, không còn trong bảng mới): gửi 70 bị 400, gửi 30 được
  const bad = await send('qa_nv2', { nightPct: 70 });
  assert.equal(bad.status, 400, JSON.stringify(bad.data));
  assert.match(bad.data.error, /30, 50/);
  assert.equal((await send('qa_nv2', { nightPct: 30 })).status, 200);
  assert.equal((await F.store.getStaff('qa_nv2')).nightPct, 30);
  // qa_nv1 là NV bậc 1: bảng chức vụ [40, 60]
  assert.equal((await send('qa_nv1', { nightPct: 30 })).status, 400);
  assert.equal((await send('qa_nv1', { nightPct: 40 })).status, 200);
});

test('nightOptions theo bậc: giá trị đã lưu không còn trong bảng mới được giữ khi gửi lại y nguyên (không bị đổi ngầm); bỏ trống thì lấy phần tử đầu của bảng mới, còn trong bảng thì giữ nguyên tỉ lệ cũ', async () => {
  const M = await P.setupMonth();
  await F.store.db.prepare("UPDATE staff SET night_pct = 40 WHERE username = 'qa_nv2'").run();
  assert.equal((await P.saveChanges([{ key: 'level.nv.3.nightOptions', value: [30, 50] }], { month: M })).status, 200);
  const same = await send('qa_nv2', { nightPct: 40 }); // gửi lại giá trị đã lưu: không kiểm lại
  assert.equal(same.status, 200, JSON.stringify(same.data));
  assert.equal((await F.store.getStaff('qa_nv2')).nightPct, 40);
  // bỏ trống: giá trị đang lưu 40 không còn trong bảng mới [30, 50] nên lấy phần tử đầu
  const blank = await send('qa_nv2', { nightPct: null });
  assert.equal(blank.status, 200, JSON.stringify(blank.data));
  assert.equal((await F.store.getStaff('qa_nv2')).nightPct, 30, 'ngoài bảng mới: lấy phần tử đầu');
  // tỉ lệ cũ còn trong bảng thì bỏ trống giữ nguyên, không nhảy về phần tử đầu
  await F.store.db.prepare("UPDATE staff SET night_pct = 50 WHERE username = 'qa_nv2'").run();
  const kept = await send('qa_nv2', { nightPct: null });
  assert.equal(kept.status, 200, JSON.stringify(kept.data));
  assert.equal((await F.store.getStaff('qa_nv2')).nightPct, 50, 'còn trong bảng: giữ tỉ lệ cũ');
  // body không có trường nightPct (form Hồ sơ không có ô này) cũng giữ tỉ lệ cũ
  const body = { ...(await F.store.getStaff('qa_nv2')) };
  const absent = await F.call('PUT', '/staff/qa_nv2', {
    who: 'admin',
    body: {
      name: body.name,
      role: body.role,
      type: body.type,
      level: body.level,
      shiftCode: body.shiftCode,
      startDate: body.startDate
    }
  });
  assert.equal(absent.status, 200, JSON.stringify(absent.data));
  assert.equal((await F.store.getStaff('qa_nv2')).nightPct, 50);
});

test('nightOptions theo bậc: không ghi đè thì y như trước: bảng chức vụ [40, 60], bỏ trống lấy lựa chọn đầu', async () => {
  await P.setupMonth();
  assert.equal((await send('qa_nv1', { nightPct: 50 })).status, 400);
  assert.equal((await send('qa_nv1', { nightPct: 60 })).status, 200);
  await F.store.db.prepare("UPDATE staff SET night_pct = NULL WHERE username = 'qa_nv1'").run();
  assert.equal((await send('qa_nv1', { nightPct: null })).status, 200);
  assert.equal((await F.store.getStaff('qa_nv1')).nightPct, 40);
});

/* ---------- bảng phụ cấp đêm cho TTS và CTV, chức vụ thêm ---------- */
const preview = async (changes?, month?) =>
  await F.call('POST', '/settings/params/preview', { who: 'admin', body: { changes, effectiveMonth: month } });

// Test hồ sơ TTS đứng TRƯỚC các test ghi bảng của TTS: tháng riêng của test giảm dần và dòng tham số tháng muộn hơn thắng ở "hôm nay"
test('đêm TTS/CTV: PUT /staff/:u của TTS khi chức vụ vừa có bảng: hồ sơ cũ không gửi nightPct vẫn lưu được (lấy phần tử đầu), giá trị ngoài bảng bị 400', async () => {
  const M = await P.setupMonth();
  assert.equal((await P.saveChanges([{ key: 'type.tts.nightOptions', value: [35, 50] }], { month: M })).status, 200);
  await F.store.db.prepare("UPDATE staff SET night_pct = NULL WHERE username = 'qa_tts1'").run(); // TTS thật chưa có bảng nên không có nightPct
  assert.equal((await F.store.getStaff('qa_tts1')).nightPct, null);
  const none = await send('qa_tts1', { nightPct: undefined });
  assert.equal(none.status, 200, JSON.stringify(none.data));
  assert.equal((await F.store.getStaff('qa_tts1')).nightPct, 35, 'bỏ trống: lấy phần tử đầu, không bắt chọn');
  assert.equal((await send('qa_tts1', { nightPct: 50 })).status, 200);
  assert.equal((await F.store.getStaff('qa_tts1')).nightPct, 50);
  assert.equal((await send('qa_tts1', { nightPct: 40 })).status, 400);
  assert.equal((await send('qa_tts1', { nightPct: 50 })).status, 200, 'gửi lại giá trị đã lưu vẫn được');
  // người khác (CTV chưa có bảng) không đổi: vẫn lưu được và nightPct vẫn null
  assert.equal((await send('qa_ctv1', { nightPct: undefined })).status, 200);
  assert.equal((await F.store.getStaff('qa_ctv1')).nightPct, null);
});

test('đêm TTS/CTV: PUT và preview nhận type.<tts|ctv>.nightOptions và level.<mã>.<bậc>.nightOptions, đọc lại ở bộ tham số hiệu lực', async () => {
  const M = await P.setupMonth();
  const changes = [
    { key: 'type.tts.nightOptions', value: [35] },
    { key: 'type.ctv.nightOptions', value: [40, 50] },
    { key: 'level.tts.2.nightOptions', value: [45] }
  ];
  const pv = await preview(changes, M);
  assert.equal(pv.status, 200, JSON.stringify(pv.data).slice(0, 300));
  const save = await P.saveChanges(changes, { month: M });
  assert.equal(save.status, 200, JSON.stringify(save.data));
  const set = await P.paramsOf(M);
  assert.deepEqual(set['type.tts.nightOptions'], [35]);
  assert.deepEqual(set['type.ctv.nightOptions'], [40, 50]);
  assert.deepEqual(set['level.tts.2.nightOptions'], [45]);
  const back = await P.saveChanges([{ key: 'type.tts.nightOptions', value: null }], { month: M });
  assert.equal(back.status, 200, JSON.stringify(back.data));
  assert.equal((await P.paramsOf(M))['type.tts.nightOptions'], null, 'null = bỏ bảng, tính theo mức chung như trước');
});

test('đêm TTS/CTV: chức vụ thêm bằng sao chép cũng đặt được bảng riêng (kiểm như bảng của NV)', async () => {
  const M = await P.setupMonth();
  const code = await P.mustCopy(M, { label: 'Đêm riêng', copyFrom: 'ctv' });
  const save = await P.saveChanges([{ key: `type.${code}.nightOptions`, value: [33] }], { month: M });
  assert.equal(save.status, 200, JSON.stringify(save.data));
  assert.deepEqual((await P.paramsOf(M))[`type.${code}.nightOptions`], [33]);
});

test('đêm TTS/CTV: mảng rỗng, trùng, không nguyên hoặc sai kiểu bị 400 (cả lưu lẫn xem trước) và không ghi gì', async () => {
  const M = await P.setupMonth();
  const before = await F.snapshot();
  for (const value of [[], [35, 35], [35.5], ['35'], 35, [101]]) {
    const changes = [{ key: 'type.tts.nightOptions', value }];
    const save = await P.saveChanges(changes, { month: M });
    assert.equal(save.status, 400, JSON.stringify([value, save.data]));
    const pv = await preview(changes, M); // xem trước trả 200 kèm ok: false và danh sách lỗi (hợp đồng của preview)
    assert.equal(pv.data.ok, false, JSON.stringify([value, pv.data]));
    assert.ok(pv.data.errors.length > 0);
  }
  assert.deepEqual(F.changedTables(before, await F.snapshot()), []);
});

test('đêm TTS/CTV: dưới sàn luật 30 % vẫn lưu (cả lưu lẫn xem trước), kèm cảnh báo PARAM_BELOW_LEGAL_FLOOR', async () => {
  const M = await P.setupMonth();
  const changes = [{ key: 'type.tts.nightOptions', value: [29] }];
  const pv = await preview(changes, M);
  assert.equal(pv.data.ok, true, JSON.stringify(pv.data));
  assert.ok(
    pv.data.warnings.some(w => w.code === 'PARAM_BELOW_LEGAL_FLOOR'),
    JSON.stringify(pv.data.warnings)
  );
  const save = await P.saveChanges(changes, { month: M });
  assert.equal(save.status, 200, JSON.stringify(save.data));
  assert.ok(
    save.data.warnings.some(w => w.code === 'PARAM_BELOW_LEGAL_FLOOR'),
    JSON.stringify(save.data.warnings)
  );
  assert.deepEqual((await P.paramsOf(M))['type.tts.nightOptions'], [29]);
  const level = await P.saveChanges([{ key: 'level.ctv.1.nightOptions', value: [20] }], { month: M });
  assert.equal(level.status, 200, JSON.stringify(level.data));
  assert.ok(
    level.data.warnings.some(w => w.code === 'PARAM_BELOW_LEGAL_FLOOR'),
    JSON.stringify(level.data.warnings)
  );
});
