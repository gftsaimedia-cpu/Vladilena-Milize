'use strict';
// Trần giờ làm thêm ở mọi đường tạo hoặc đổi OT, làm thêm, làm bù (chặn 400):
//   - ngày: giờ ca + OT + làm thêm + làm bù, không tính giờ nghỉ giữa ca, tối đa 12 giờ (DAY_HOURS_CAP);
//   - tháng: OT cộng giờ ca chính làm ngày lễ, tối đa 40 giờ (OT_MONTH_CAP).
// Đường kiểm: PUT /sheet (nhân sự tự khai OT, làm bù; Admin khai thay), POST /ot (khai OT ở Check-in/out), PUT /ot (duyệt OT).
// Chỉ người bịa (qa_*), DB trong bộ nhớ, đồng hồ giả.
const F = require('../helpers/api-fixture');
const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const punch = require('../../src/engine/punch');

const { store } = F;
const M = '2026-10';
const WEEKDAYS = ['01', '02', '05', '06', '07', '08', '09', '12', '13', '14'].map(d => `${M}-${d}`); // Thứ Hai–Sáu
const T = (date?, time?) => new Date(`${date}T${time}:00+07:00`).toISOString();
const SHIFT = { kind: 'work', in: '08:00', out: '17:00' };
const otTo = (extraOut?) => ({ ...SHIFT, extraKind: 'ot', extraOut });
const makeupTo = (extraOut?) => ({ ...SHIFT, extraKind: 'makeup', extraOut });

before(async () => {
  await F.start();
  await F.at('2026-10-12T09:00:00');
});
after(() => F.stop());
beforeEach(async () => {
  await F.reset();
  await store.setSetting('holidays', []);
  await F.person('admin', 'admin', { type: 'tts', level: 0, shiftCode: null, startDate: null });
  await F.person('qa_a');
  await F.person('qa_b');
});

const putSheet = async (who?, days?, extra: any = {}) =>
  await F.call('PUT', '/sheet', { who, body: { month: M, days, ...extra } });
const expectCap = (res?, code?) => {
  assert.equal(res.status, 400, JSON.stringify(res.data));
  assert.equal(res.data.code, code, JSON.stringify(res.data));
};

// Lượt Check-in/out đã đóng của ca n1 (08:00–17:00), có mặt đến `out`
async function session(username?, date?, out = '22:00') {
  const plan = punch.planShift({ shiftCode: 'n1', sched: [1, 2, 3, 4, 5, 6] }, date);
  const entry = punch.buildDay({ shiftCode: 'n1' }, T(date, '08:00'), T(date, out), 'punch', {
    plannedShift: plan,
    approveIncomplete: true
  }).entry;
  return await store.createSession(username, date, 'closed', entry);
}
const declare = async (s?, extraOut?) =>
  await F.call('POST', '/ot', { body: { sessionId: s.id, version: s.version, extraOut, reason: 'Làm thêm' } });

// Ca đêm g2 (22:00 → 07:00 hôm sau) của ngày `date`, có mặt từ `from` (giờ của `date`) đến `to` (giờ của ngày kế)
const NIGHT = { kind: 'work', in: '22:00', out: '07:00' };
const nextDate = (date?) => new Date(Date.parse(`${date}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
async function nightSession(username?, date?, from?, to?) {
  const plan = punch.planShift({ shiftCode: 'g2', sched: [1, 2, 3, 4, 5, 6] }, date);
  const entry = punch.buildDay({ shiftCode: 'g2' }, T(date, from), T(nextDate(date), to), 'punch', {
    plannedShift: plan,
    approveIncomplete: true
  }).entry;
  return await store.createSession(username, date, 'closed', entry);
}
const declareBoth = async (s?, extraIn?, extraOut?) =>
  await F.call('POST', '/ot', { body: { sessionId: s.id, version: s.version, extraIn, extraOut, reason: 'Làm thêm' } });
const nightOt = (extraIn?, extraOut?) => ({ ...NIGHT, extraKind: 'ot', extraIn, extraOut });

test('PUT /sheet nhân sự tự khai OT: ca 8 giờ + OT 4 giờ đúng 12 giờ nhận; OT 4,25 giờ bị chặn DAY_HOURS_CAP', async () => {
  const day = WEEKDAYS[2];
  expectCap(await putSheet('qa_a', { [day]: otTo('21:15') }), 'DAY_HOURS_CAP');
  assert.deepEqual((await store.getSheet('qa_a', M)).days, {}, 'không lưu gì');
  const ok = await putSheet('qa_a', { [day]: otTo('21:00') });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal((await store.getSheet('qa_a', M)).days[day].extraOut, '21:00');
});

test('PUT /sheet: OT cả trước ca và sau ca cộng chung một ngày; quá 12 giờ ròng bị chặn', async () => {
  const day = WEEKDAYS[2];
  expectCap(
    await putSheet('qa_a', { [day]: { ...SHIFT, extraKind: 'ot', extraIn: '07:00', extraOut: '21:00' } }),
    'DAY_HOURS_CAP'
  );
  const ok = await putSheet('qa_a', { [day]: { ...SHIFT, extraKind: 'ot', extraIn: '07:00', extraOut: '20:00' } });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
});

test('PUT /sheet làm bù theo giờ: cùng trần ngày, giờ làm bù tính vào giờ ròng', async () => {
  const day = WEEKDAYS[2];
  expectCap(await putSheet('qa_a', { [day]: makeupTo('21:15') }), 'DAY_HOURS_CAP');
  const ok = await putSheet('qa_a', { [day]: makeupTo('21:00') });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
});

test('PUT /sheet làm bù: đoạn làm bù từ 5 giờ trừ giờ nghỉ của đoạn (ca 06:00–15:00 + làm bù tới 20:00 là 12 giờ ròng)', async () => {
  const day = WEEKDAYS[2];
  const early = (extraOut?) => ({ kind: 'work', in: '06:00', out: '15:00', extraKind: 'makeup', extraOut });
  const ok = await putSheet('qa_a', { [day]: early('20:00') });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  expectCap(await putSheet('qa_a', { [day]: early('20:15') }), 'DAY_HOURS_CAP');
});

test('PUT /sheet: trần ngày chỉ kiểm ngày vừa đổi; dữ liệu cũ vượt trần không chặn việc lưu ngày khác', async () => {
  const old = WEEKDAYS[2],
    other = WEEKDAYS[3];
  await store.setSheet(
    'qa_a',
    M,
    { [old]: { ...SHIFT, shift: 'normal', extraKind: 'ot', extraOut: '23:00' } },
    null,
    null
  );
  const res = await putSheet('qa_a', { [old]: otTo('23:00'), [other]: SHIFT });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  expectCap(await putSheet('qa_a', { [old]: otTo('23:30'), [other]: SHIFT }), 'DAY_HOURS_CAP');
});

test('PUT /sheet Admin khai thay: cùng trần ngày trên hồ sơ người được khai', async () => {
  const day = WEEKDAYS[2];
  expectCap(await putSheet('admin', { [day]: otTo('21:15') }, { user: 'qa_a' }), 'DAY_HOURS_CAP');
  assert.deepEqual((await store.getSheet('qa_a', M)).days, {});
  const ok = await putSheet('admin', { [day]: otTo('21:00') }, { user: 'qa_a' });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal((await store.getSheet('qa_a', M)).days[day].extraOut, '21:00');
});

test('PUT /sheet: OT cả tháng đúng 40 giờ nhận, vượt 40 giờ bị chặn OT_MONTH_CAP; bớt OT thì lưu lại được', async () => {
  const days: Record<string, any> = Object.fromEntries(WEEKDAYS.map(d => [d, otTo('21:00')])); // 10 ngày × 4 giờ
  assert.equal((await putSheet('qa_a', days)).status, 200);
  expectCap(await putSheet('qa_a', { ...days, [`${M}-15`]: otTo('18:00') }), 'OT_MONTH_CAP'); // 41 giờ
  expectCap(await putSheet('qa_a', { ...days, [`${M}-15`]: otTo('17:15') }), 'OT_MONTH_CAP'); // 40,25 giờ
  assert.equal((await putSheet('qa_a', { ...days, [`${M}-15`]: SHIFT })).status, 200);
  assert.equal((await putSheet('qa_a', { ...days, [WEEKDAYS[0]]: SHIFT })).status, 200);
});

test('PUT /sheet Admin khai thay: cùng trần OT tháng', async () => {
  const days: Record<string, any> = Object.fromEntries(WEEKDAYS.map(d => [d, otTo('21:00')]));
  assert.equal((await putSheet('admin', days, { user: 'qa_a' })).status, 200);
  expectCap(await putSheet('admin', { ...days, [`${M}-15`]: otTo('17:30') }, { user: 'qa_a' }), 'OT_MONTH_CAP');
});

test('PUT /sheet: giờ làm ngày lễ tính vào 40 giờ OT, làm bù thì không', async () => {
  const holiday = `${M}-15`;
  await store.setSetting('holidays', [holiday]);
  const days: Record<string, any> = Object.fromEntries(WEEKDAYS.slice(0, 7).map(d => [d, otTo('21:00')])); // 7 ngày × 4 giờ = 28
  days[holiday] = { kind: 'work', in: '08:00', out: '20:00' }; // 12 giờ ngày lễ, không có đoạn làm thêm: tổng 40
  assert.equal((await putSheet('qa_a', days)).status, 200);
  days[`${M}-16`] = makeupTo('21:00');
  assert.equal((await putSheet('qa_a', days)).status, 200, 'làm bù không vào 40 giờ');
  const over = await putSheet('qa_a', { ...days, [WEEKDAYS[7]]: otTo('18:00') }); // thêm 1 giờ OT: 41
  expectCap(over, 'OT_MONTH_CAP');
  assert.match(over.data.error, /kể cả giờ làm ngày lễ/);
  assert.match(over.data.error, /41 giờ/);
});

test('PUT /sheet Admin khai thay: giờ làm ngày lễ cũng tính vào 40 giờ OT', async () => {
  const holiday = `${M}-15`;
  await store.setSetting('holidays', [holiday]);
  const days: Record<string, any> = Object.fromEntries(WEEKDAYS.map(d => [d, otTo('21:00')])); // 40 giờ OT
  days[holiday] = { kind: 'work', in: '08:00', out: '09:00' };
  expectCap(await putSheet('admin', days, { user: 'qa_a' }), 'OT_MONTH_CAP');
  delete days[holiday];
  assert.equal((await putSheet('admin', days, { user: 'qa_a' })).status, 200);
});

test('POST /ot khai OT ở Check-in/out: cùng trần ngày; 4 giờ nhận, 4,25 giờ bị chặn DAY_HOURS_CAP', async () => {
  const date = WEEKDAYS[2];
  const s = await session('qa_a', date);
  expectCap(await declare(s, '21:15'), 'DAY_HOURS_CAP');
  assert.equal((await store.getSession(s.id)).entry.otDeclaration, undefined, 'không ghi khai OT');
  const ok = await declare(s, '21:00');
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
});

test('POST /ot: trần ngày tính cả OT của lượt khác cùng ngày', async () => {
  const date = WEEKDAYS[2];
  const first = await session('qa_a', date);
  assert.equal((await declare(first, '20:00')).status, 200); // 3 giờ OT
  const second = await session('qa_a', date, '22:00');
  expectCap(await declare(second, '19:00'), 'DAY_HOURS_CAP'); // ca 8 giờ + 2 giờ OT + 3 giờ của lượt trước = 13 giờ
});

test('POST /ot: cùng trần OT tháng so với OT đang có trên lịch', async () => {
  const nine = Object.fromEntries(WEEKDAYS.slice(0, 9).map(d => [d, otTo('21:00')])); // 36 giờ
  assert.equal((await putSheet('qa_a', nine)).status, 200);
  const s = await session('qa_a', WEEKDAYS[9]);
  assert.equal((await declare(s, '21:00')).status, 200); // 36 + 4 = 40
  // lịch đã có 40 giờ thì khai thêm 1 giờ ở ngày khác bị chặn
  assert.equal((await putSheet('qa_a', { ...nine, [WEEKDAYS[9]]: otTo('21:00') })).status, 200);
  const extra = await session('qa_a', `${M}-15`);
  expectCap(await declare(extra, '18:00'), 'OT_MONTH_CAP');
  expectCap(await declare(extra, '17:15'), 'OT_MONTH_CAP');
});

test('PUT /ot duyệt OT: ghi vào lịch qua cùng trần; OT lượt không qua khai OT mà vượt trần ngày bị chặn khi duyệt', async () => {
  const date = WEEKDAYS[2];
  const s = await session('qa_b', date, '22:00');
  const over = { ...s.entry, extraKind: 'ot', extraIn: '', extraOut: '21:15' };
  await store.updateSession(s.id, s.version, { date, state: 'closed', entry: over });
  const fresh = await store.getSession(s.id);
  const res = await F.call('PUT', '/ot', { body: { sessionId: s.id, version: fresh.version, action: 'approve' } });
  expectCap(res, 'DAY_HOURS_CAP');
  assert.equal((await store.getSession(s.id)).entry.otReview, undefined, 'giao dịch hoàn lại, lượt chưa duyệt');
  assert.deepEqual((await store.getSheet('qa_b', M)).days, {});
  const fit = { ...s.entry, extraKind: 'ot', extraIn: '', extraOut: '21:00' };
  await store.updateSession(s.id, fresh.version, { date, state: 'closed', entry: fit });
  const again = await store.getSession(s.id);
  const ok = await F.call('PUT', '/ot', { body: { sessionId: s.id, version: again.version, action: 'approve' } });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal((await store.getSheet('qa_b', M)).days[date].extraOut, '21:00');
});

test('PUT /ot duyệt OT: OT cả tháng vượt 40 giờ bị chặn OT_MONTH_CAP', async () => {
  const full = Object.fromEntries(WEEKDAYS.map(d => [d, otTo('21:00')])); // 40 giờ
  assert.equal((await putSheet('qa_b', full)).status, 200);
  const date = `${M}-15`;
  const s = await session('qa_b', date, '22:00');
  const entry = { ...s.entry, extraKind: 'ot', extraIn: '', extraOut: '18:00' };
  await store.updateSession(s.id, s.version, { date, state: 'closed', entry });
  const res = await F.call('PUT', '/ot', {
    body: { sessionId: s.id, version: (await store.getSession(s.id)).version, action: 'approve' }
  });
  expectCap(res, 'OT_MONTH_CAP');
});

test('PUT /approvals/decide không đổi giờ: duyệt khoản OT đã lưu trong trần vẫn được', async () => {
  const date = WEEKDAYS[2];
  assert.equal((await putSheet('qa_a', { [date]: otTo('21:00') })).status, 200);
  const item = (await F.call('GET', '/approvals?user=qa_a')).data.items.find(x => x.date === date);
  const res = await F.call('PUT', '/approvals/decide', {
    body: { action: 'approve', items: [{ username: 'qa_a', date, rev: item.rev, fingerprint: item.fingerprint }] }
  });
  assert.equal(res.status, 200, JSON.stringify(res.data));
});

// Ca đêm 22:00–07:00 (9 giờ có mặt, 8 giờ ròng) + OT 2 giờ trước ca (20:00–22:00) + OT 2 giờ sau ca (07:00–09:00):
// 13 giờ có mặt, 12 giờ ròng, nhận; 20:00–09:15 là 12,25 giờ ròng, bị chặn.
test('PUT /sheet ca đêm + OT 20:00–22:00 và 07:00–09:00 (12 giờ ròng) nhận; tới 09:15 (12,25 giờ) bị chặn DAY_HOURS_CAP', async () => {
  await F.person('qa_night', 'staff', { shiftCode: 'g2' });
  const day = WEEKDAYS[2];
  expectCap(await putSheet('qa_night', { [day]: nightOt('20:00', '09:15') }), 'DAY_HOURS_CAP');
  expectCap(await putSheet('qa_night', { [day]: nightOt('19:45', '09:00') }), 'DAY_HOURS_CAP');
  assert.deepEqual((await store.getSheet('qa_night', M)).days, {}, 'không lưu gì');
  const ok = await putSheet('qa_night', { [day]: nightOt('20:00', '09:00') });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal((await store.getSheet('qa_night', M)).days[day].extraOut, '09:00');
});

test('PUT /sheet Admin khai thay: ca đêm + OT 20:00–22:00 và 07:00–09:00 nhận; tới 09:15 bị chặn', async () => {
  await F.person('qa_night', 'staff', { shiftCode: 'g2' });
  const day = WEEKDAYS[2];
  expectCap(await putSheet('admin', { [day]: nightOt('20:00', '09:15') }, { user: 'qa_night' }), 'DAY_HOURS_CAP');
  const ok = await putSheet('admin', { [day]: nightOt('20:00', '09:00') }, { user: 'qa_night' });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
});

test('PUT /sheet: ca ngày 08:00–17:00 + OT 4 giờ nhận, 4,25 giờ bị chặn; cả trước và sau ca cộng chung', async () => {
  const day = WEEKDAYS[2];
  assert.equal(
    (await putSheet('qa_a', { [day]: { ...SHIFT, extraKind: 'ot', extraIn: '07:00', extraOut: '20:00' } })).status,
    200
  ); // 8 + 1 + 3
  expectCap(
    await putSheet('qa_a', { [day]: { ...SHIFT, extraKind: 'ot', extraIn: '06:45', extraOut: '20:00' } }),
    'DAY_HOURS_CAP'
  );
});

test('POST /ot ca đêm: OT 20:00–22:00 và 07:00–09:00 (12 giờ ròng) nhận; tới 09:15 bị chặn DAY_HOURS_CAP', async () => {
  await F.person('qa_night', 'staff', { shiftCode: 'g2' });
  const date = WEEKDAYS[2];
  const over = await nightSession('qa_night', date, '20:00', '09:15');
  expectCap(await declareBoth(over, '20:00', '09:15'), 'DAY_HOURS_CAP');
  assert.equal((await store.getSession(over.id)).entry.otDeclaration, undefined, 'không ghi khai OT');
  const fit = await nightSession('qa_night', WEEKDAYS[3], '20:00', '09:00');
  const ok = await declareBoth(fit, '20:00', '09:00');
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
});

test('PUT /ot duyệt OT ca đêm: OT 20:00–22:00 và 07:00–09:00 (12 giờ ròng) ghi vào lịch; vượt 12,25 giờ bị chặn khi duyệt', async () => {
  await F.person('qa_night', 'staff', { shiftCode: 'g2' });
  const date = WEEKDAYS[2];
  const s = await nightSession('qa_night', date, '20:00', '09:15');
  const set = async (extraOut?, version?) =>
    await store.updateSession(s.id, version, {
      date,
      state: 'closed',
      entry: { ...s.entry, extraKind: 'ot', extraIn: '20:00', extraOut }
    });
  const approve = async () =>
    await F.call('PUT', '/ot', {
      body: { sessionId: s.id, version: (await store.getSession(s.id)).version, action: 'approve' }
    });
  await set('09:15', s.version);
  expectCap(await approve(), 'DAY_HOURS_CAP');
  assert.deepEqual((await store.getSheet('qa_night', M)).days, {});
  await set('09:00', (await store.getSession(s.id)).version);
  const ok = await approve();
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  const saved = (await store.getSheet('qa_night', M)).days[date];
  assert.deepEqual([saved.in, saved.out, saved.extraIn, saved.extraOut], ['22:00', '07:00', '20:00', '09:00']);
});

test('POST /ot: giờ làm ngày lễ trên lịch tính vào 40 giờ OT', async () => {
  const holiday = `${M}-15`;
  await store.setSetting('holidays', [holiday]);
  const days: Record<string, any> = Object.fromEntries(WEEKDAYS.slice(0, 7).map(d => [d, otTo('21:00')])); // 28 giờ
  days[holiday] = { kind: 'work', in: '08:00', out: '20:00' }; // 12 giờ ngày lễ: tổng 40
  assert.equal((await putSheet('qa_a', days)).status, 200);
  const s = await session('qa_a', WEEKDAYS[7]);
  expectCap(await declare(s, '18:00'), 'OT_MONTH_CAP');
});

// Chỉ còn hai trần giờ (12 giờ ròng một ngày, 40 giờ OT một tháng): không có trần OT riêng theo ngày, theo tháng cộng giờ lễ, theo năm
// hay theo đoạn, và các kiểm tra còn lại không sinh cảnh báo về giờ.
test('PUT /sheet OT 5 giờ trong một ngày (ca 4 giờ + OT 5 giờ = 9 giờ ròng) nhận, không cảnh báo trần giờ', async () => {
  await F.person('qa_free', 'staff', { shiftCode: null });
  const day = WEEKDAYS[2];
  const res = await putSheet('qa_free', {
    [day]: { kind: 'work', in: '08:00', out: '12:00', extraKind: 'ot', extraOut: '17:00' }
  });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.equal((await store.getSheet('qa_free', M)).days[day].extraOut, '17:00');
  assert.ok(!JSON.stringify(res.data.warnings || []).match(/tối đa/), JSON.stringify(res.data.warnings));
});

test('PUT /sheet OT 20 giờ trong tháng (5 ngày × 4 giờ) cộng giờ ngày lễ 9 giờ nhận; trần là 40 giờ', async () => {
  const holiday = `${M}-15`;
  await store.setSetting('holidays', [holiday]);
  const days: Record<string, any> = Object.fromEntries(WEEKDAYS.slice(0, 5).map(d => [d, otTo('21:00')]));
  days[holiday] = { kind: 'work', in: '08:00', out: '17:00' };
  const res = await putSheet('qa_a', days);
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.ok(!JSON.stringify(res.data.warnings || []).match(/tối đa/), JSON.stringify(res.data.warnings));
});

test('PUT /sheet OT tháng này nhận dù OT các tháng trước trong năm đã rất nhiều: không có trần OT năm', async () => {
  for (let month = 1; month <= 9; month++) {
    const m = `2026-${String(month).padStart(2, '0')}`;
    const days: Record<string, any> = Object.fromEntries(
      Array.from({ length: 10 }, (_, i) => [`${m}-${String(i + 1).padStart(2, '0')}`, otTo('21:00')])
    );
    await store.setSheet('qa_a', m, days, null, null); // 9 tháng × 40 giờ = 360 giờ
  }
  const days = Object.fromEntries(WEEKDAYS.map(d => [d, otTo('21:00')]));
  const res = await putSheet('qa_a', days);
  assert.equal(res.status, 200, JSON.stringify(res.data));
});
