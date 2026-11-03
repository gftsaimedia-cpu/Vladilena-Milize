'use strict';
// Giải trình ngày (Admin yêu cầu / AI đề nghị) về ngày quên Check-in hoặc Check-out: duyệt thì ngày là 1 ngày công, giờ vào / ra = giờ ca
// (lượt Admin mang origin + explanationId, lượt thật thành superseded); không duyệt hoặc đổi ý thì bỏ lượt đó. Ngày không dựng được lượt
// (ngày lễ không khai giờ, ngoài lịch, chưa gán ca, chồng giờ) chỉ cảnh báo. Kỳ đã chốt công: lượt vẫn ghi, kèm cảnh báo PERIOD_LOCKED.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
require('../helpers/require-isolated-database');
const F = require('../helpers/api-fixture');
const P = require('../helpers/period-api');
const X = require('../helpers/explanation-flow');
const { ADMIN_ORIGIN } = require('../../src/domain/attendance/attendance-sessions');

const { MONTH, iso } = X;
const adminRows = async (username?, date?) =>
  (await X.sessionsOn(username, date)).filter(s => s.entry.origin === ADMIN_ORIGIN);
const warningCodes = (res?) => (res.data.warnings || []).map(w => w.code);

before(async () => {
  await F.start();
  await F.at('2026-10-29T12:00:00');
  for (const name of ['chi', 'dung', 'em', 'ngay', 'trung', 'doi', 'khoa']) await F.person(name);
  await F.person('dem', 'staff', { shiftCode: 'g1' });
  await F.person('khong', 'staff', { shiftCode: null });
  await F.person('admin', 'admin');
  await F.store.setSetting('holidays', ['2026-10-23']);
});
after(() => F.stop());

test('Quên Check-out duyệt: lượt Admin có giờ vào / ra bằng giờ ca (cả giờ vào thật trễ), lượt thật superseded, 1 ngày công, tiền bằng ngày Admin khai thay', async () => {
  const sessionId = await X.forgotOut('chi', '2026-10-20', '08:40', 'fp-chi-in'); // vào thật trễ 40 phút rồi quên Check-out
  assert.equal((await F.store.getSession(sessionId)).entry.reason, 'forgot-out');
  const held = await X.askAndAnswer('chi', '2026-10-20');
  assert.equal((await X.payOf('chi')).payDays['2026-10-20'].kind, 'unpaid'); // chờ duyệt: giữ ngày, 0 đồng

  const ok = await X.decide(held.id, true);
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(ok.data.recorded, true);
  const [mine] = await adminRows('chi', '2026-10-20');
  assert.equal((await adminRows('chi', '2026-10-20')).length, 1);
  assert.equal(mine.state, 'closed');
  assert.equal(mine.entry.presIn, iso('2026-10-20T08:00:00'));
  assert.equal(mine.entry.presOut, iso('2026-10-20T17:00:00'));
  assert.equal(mine.entry.explanationId, held.id);
  assert.equal(mine.entry.declaredBy, 'admin');
  assert.equal(mine.entry.plannedShift.date, '2026-10-20');
  const log = await F.store.db
    .prepare("SELECT reason FROM audit_log WHERE action = 'attendance.admin.set' AND entity_id = ?")
    .all(String(mine.id));
  assert.deepEqual(
    log.map(r => r.reason),
    [`Giải trình ${held.id}`]
  );

  // nhãn: lượt Admin là "Đã chấm công", lượt thật bị thay (superseded) và vẫn nguyên vẹn làm bằng chứng
  const rows = (await F.call('GET', `/attendance?month=${MONTH}`, { who: 'admin' })).data.rows.filter(
    s => s.username === 'chi' && s.date === '2026-10-20'
  );
  assert.equal(rows.find(s => s.id === mine.id).status, 'admin');
  const real = rows.find(s => s.id === sessionId);
  assert.equal(real.superseded, true);
  assert.equal(real.entry.reason, 'forgot-out');
  assert.equal(real.entry.presIn, iso('2026-10-20T08:40:00'));

  // một ngày công, tiền bằng ngày Admin khai thay thường
  await X.declareOnBehalf('dung', '2026-10-20');
  const paid = await X.payOf('chi'),
    reference = await X.payOf('dung');
  assert.equal(paid.payDays['2026-10-20'].kind, 'work');
  const cells = (day?) => [day.kind, day.in, day.out, day.cutStartMin, day.cutEndMin];
  assert.deepEqual(cells(paid.payDays['2026-10-20']), cells(reference.payDays['2026-10-20']));
  assert.equal(paid.m.count, 1);
  assert.equal(paid.m.count, reference.m.count);
  assert.equal(paid.m.trace.tienNgayCong, reference.m.trace.tienNgayCong);
  assert.equal(paid.m.cut, 0); // giờ vào thật trễ 40 phút không còn bị trừ: giờ vào là giờ ca
});

test('Ngày không chấm gì: chưa có giải trình được duyệt vẫn là nghỉ không phép; Admin yêu cầu giải trình rồi duyệt thì 1 ngày công theo giờ ca', async () => {
  const before = await X.payOf('em');
  assert.equal(before.payDays['2026-10-21'].kind, 'noshow');
  assert.equal(before.m.count, 0);
  const asked = await F.call('POST', '/explanations', {
    who: 'admin',
    body: {
      username: 'em',
      date: '2026-10-21',
      prompt: 'Ngày 21/10 không có chấm công?',
      source: 'ai',
      ruleId: 'no-punch'
    }
  });
  assert.equal(asked.status, 200, JSON.stringify(asked.data));
  assert.equal((await X.payOf('em')).payDays['2026-10-21'].kind, 'unpaid'); // chờ trả lời: giữ ngày
  const answered = await F.call('POST', `/explanations/${asked.data.item.id}/answer`, {
    who: 'em',
    body: { text: 'Đi công tác, quên chấm' }
  });
  assert.equal(answered.status, 200, JSON.stringify(answered.data));
  const ok = await X.decide(asked.data.item.id, true);
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(ok.data.recorded, true);
  const [mine] = await adminRows('em', '2026-10-21');
  assert.equal(mine.entry.presIn, iso('2026-10-21T08:00:00'));
  assert.equal(mine.entry.presOut, iso('2026-10-21T17:00:00'));
  assert.equal(mine.entry.explanationId, asked.data.item.id);
  const paid = await X.payOf('em');
  assert.equal(paid.payDays['2026-10-21'].kind, 'work');
  assert.equal(paid.m.count, 1);
  assert.equal(paid.m.cut, 0);
});

test('Ca đêm: giờ vào / ra là giờ ca đêm, ngày công là ngày bắt đầu ca', async () => {
  const item = await X.askAndAnswer('dem', '2026-10-20');
  assert.equal((await X.decide(item.id, true)).data.recorded, true);
  const [mine] = await adminRows('dem', '2026-10-20');
  assert.equal(mine.entry.presIn, iso('2026-10-20T21:00:00'));
  assert.equal(mine.entry.presOut, iso('2026-10-21T06:00:00'));
  assert.equal(mine.entry.plannedShift.date, '2026-10-20');
  const paid = await X.payOf('dem');
  assert.equal(paid.payDays['2026-10-20'].kind, 'work');
  assert.equal(paid.m.count, 1);
});

test('Ngày lễ không khai giờ, ngày ngoài lịch, người chưa gán ca: duyệt vẫn lưu nhưng không ghi lượt, có cảnh báo', async () => {
  const cases = [
    ['ngay', '2026-10-23', 'ngày lễ không khai giờ đi làm'], // 23/10 là ngày lễ (thứ Sáu)
    ['ngay', '2026-10-25', 'ngày ngoài lịch làm việc'], // Chủ nhật: ngoài lịch của nhân viên
    ['khong', '2026-10-22', 'người này chưa được gán ca']
  ];
  for (const [who, date, why] of cases) {
    const item = await X.askAndAnswer(who, date);
    const res = await X.decide(item.id, true);
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.equal(res.data.item.status, 'approved');
    assert.equal(res.data.recorded, false, `${who} ${date}`);
    assert.deepEqual(warningCodes(res), ['EXPLANATION_NOT_RECORDED']);
    assert.match(res.data.warnings[0].message, new RegExp(why));
    assert.equal((await adminRows(who, date)).length, 0, `${who} ${date}`);
    assert.equal((await X.sessionsOn(who, date)).length, 0);
  }
});

test('Giờ ca chồng với lượt của ngày công khác: không ghi, cảnh báo, duyệt vẫn lưu', async () => {
  // lượt thật đã đóng của ngày công 21/10 kéo sang sáng 22/10 (07:00–09:00), chồng với ca 08:00–17:00 ngày 22/10
  const shift = {
    code: 'n1',
    date: '2026-10-21',
    in: '08:00',
    out: '17:00',
    startIso: iso('2026-10-21T08:00:00'),
    endIso: iso('2026-10-21T17:00:00'),
    kind: 'work'
  };
  await F.store.createSession('trung', '2026-10-21', 'closed', {
    kind: 'work',
    in: '08:00',
    out: '17:00',
    preset: 'n1',
    presIn: iso('2026-10-22T07:00:00'),
    presOut: iso('2026-10-22T09:00:00'),
    plannedShift: shift
  });
  const item = await X.askAndAnswer('trung', '2026-10-22');
  const res = await X.decide(item.id, true);
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.equal(res.data.recorded, false);
  assert.deepEqual(warningCodes(res), ['EXPLANATION_NOT_RECORDED']);
  assert.match(res.data.warnings[0].message, /chồng với lượt ngày/);
  assert.equal((await adminRows('trung', '2026-10-22')).length, 0);
});

test('Ngày đã có lượt Admin khai tay: duyệt không ghi thêm; ngày có Check-in/out đủ giờ: duyệt chỉ hết giữ', async () => {
  await X.declareOnBehalf('dung', '2026-10-20');
  const hand = await X.askAndAnswer('dung', '2026-10-20');
  const ok = await X.decide(hand.id, true);
  assert.equal(ok.data.recorded, false);
  const rows = await adminRows('dung', '2026-10-20');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].entry.explanationId, undefined); // lượt tay giữ nguyên, không mang dấu giải trình
  assert.equal((await X.payOf('dung')).payDays['2026-10-20'].kind, 'work');

  await X.fullDay('khoa', '2026-10-19', '08:00', '17:00', 'fp-khoa-full');
  const full = await X.askAndAnswer('khoa', '2026-10-19');
  assert.equal((await X.payOf('khoa')).payDays['2026-10-19'].kind, 'unpaid'); // chờ duyệt: giữ
  const done = await X.decide(full.id, true);
  assert.equal(done.data.recorded, false);
  assert.equal((await adminRows('khoa', '2026-10-19')).length, 0);
  assert.equal((await X.payOf('khoa')).payDays['2026-10-19'].kind, 'work');
});

test('Đổi ý từ duyệt sang từ chối xoá đúng lượt có dấu giải trình; duyệt lại ghi lại; Admin khai thay lại ngày thì lượt thành lượt tay', async () => {
  const item = await X.askAndAnswer('doi', '2026-10-20');
  assert.equal((await X.decide(item.id, true)).data.recorded, true);
  const firstId = (await adminRows('doi', '2026-10-20'))[0].id;
  assert.equal((await X.payOf('doi')).payDays['2026-10-20'].kind, 'work');

  const no = await X.decide(item.id, false);
  assert.equal(no.status, 200, JSON.stringify(no.data));
  assert.equal(no.data.recorded, false);
  assert.equal((await adminRows('doi', '2026-10-20')).length, 0);
  assert.equal(await F.store.getSession(firstId), null);
  assert.equal((await X.payOf('doi')).payDays['2026-10-20'].kind, 'unpaid'); // bị từ chối: không tính công
  const removed = await F.store.db
    .prepare("SELECT reason FROM audit_log WHERE action = 'attendance.admin.remove' AND entity_id = ?")
    .all(String(firstId));
  assert.deepEqual(
    removed.map(r => r.reason),
    [`Giải trình ${item.id}`]
  );

  assert.equal((await X.decide(item.id, true)).data.recorded, true); // duyệt lại: ghi lại
  assert.equal((await adminRows('doi', '2026-10-20')).length, 1);
  await X.declareOnBehalf('doi', '2026-10-20'); // Admin khai thay lại cùng ngày qua lịch: thành lượt tay
  assert.equal((await adminRows('doi', '2026-10-20'))[0].entry.explanationId, undefined);
  assert.equal((await X.decide(item.id, false)).data.recorded, false);
  assert.equal((await adminRows('doi', '2026-10-20')).length, 1, 'lượt tay không bị xoá khi giải trình đổi ý');
});

test('Kỳ đã chốt công: duyệt giải trình vẫn ghi lượt Admin và trả cảnh báo PERIOD_LOCKED', async () => {
  const item = await X.askAndAnswer('khoa', '2026-10-21');
  P.must(await P.step(MONTH, 'lock-attendance'), 'chốt công');
  const locked = await X.decide(item.id, true);
  assert.equal(locked.status, 200, JSON.stringify(locked.data));
  assert.equal(locked.data.recorded, true);
  assert.ok(warningCodes(locked).includes('PERIOD_LOCKED'), JSON.stringify(locked.data.warnings));
  assert.equal((await adminRows('khoa', '2026-10-21')).length, 1);
});
