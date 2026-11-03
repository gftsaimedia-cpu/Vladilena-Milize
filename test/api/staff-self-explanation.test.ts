'use strict';
// Nhân viên tự giải trình ngày vắng của chính mình (POST /explanations { date, text }) và cảnh báo ngày vắng chưa có giải trình cho Admin
// (GET /alerts → absentNoExplanation, danh sách kiểm kỳ → ABSENT_NO_EXPLANATION):
//   ngày trong lịch, đã qua, không có lượt Check-in/out nào, kỳ chưa chốt công, chưa có giải trình về ngày đó → tạo giải trình loại admin
//   (requestedBy = người gửi) ở trạng thái answered; Admin duyệt = 1 công theo giờ ca như người Check-in/out đủ ca, từ chối = vắng.
// Người bịa vào làm 26/10 (3 ngày công đã qua: 26, 27, 28); đồng hồ giả 29/10 12:00 (ca 08:00–17:00 của hôm nay chưa kết thúc).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
require('../helpers/require-isolated-database');
const F = require('../helpers/api-fixture');
const X = require('../helpers/explanation-flow');
const P = require('../helpers/period-api');

const { MONTH } = X;
const NOW = '2026-10-29T12:00:00'; // đồng hồ của helper giải trình: sau mọi ngày công được kiểm
const DAY = '2026-10-27';
const OTHER_DAYS = ['2026-10-26', '2026-10-28'];
const ALL_DAYS = ['2026-10-26', DAY, '2026-10-28'];
const DAILY = 230769; // lương ngày NV bậc 1: 6.000.000 / 26
const REASON = 'Em quên bấm Check-in và Check-out cả ngày';

before(async () => {
  await F.start();
  await F.at(NOW);
  for (const name of ['ref', 'tu', 'tc', 'vang', 'khac', 'dup', 'le', 'fix', 'leave-active'])
    await F.person(name, 'staff', { startDate: '2026-10-26' });
  await F.person('cu', 'staff'); // vào làm từ 05/01: ngày Chủ nhật 25/10 ngoài lịch
  await F.person('moi', 'staff', { startDate: '2026-10-28' }); // 27/10 là trước ngày vào làm
  await F.person('admin', 'admin');
  await F.store.setSetting('holidays', []);
});
after(() => F.stop());

const send = async (who?, body?) => {
  await F.at(NOW);
  return await F.call('POST', '/explanations', { who, body });
};
const submit = async (who?, date = DAY, text = REASON) => await send(who, { date, text });
const alertsOf = async (username?) => {
  await F.at(NOW);
  const res = await F.call('GET', `/alerts?month=${MONTH}`, { who: 'admin' });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  return res.data.absentNoExplanation.filter(r => r.username === username).map(r => r.date);
};
const checklist = async () => {
  await F.at(NOW);
  const res = await F.call('GET', `/periods/${MONTH}`, { who: 'admin' });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  const count = (code?) => (res.data.checklist.find(i => i.code === code) || { count: 0 }).count;
  return { item: res.data.checklist.find(i => i.code === 'ABSENT_NO_EXPLANATION'), count };
};
const toRead = async () => {
  await F.at(NOW);
  return (await F.call('GET', '/explanations', { who: 'admin' })).data.toRead;
};
const estimate = async (who?) => {
  await F.at(NOW);
  const res = await F.call('GET', `/me/estimate?month=${MONTH}&rows=1`, { who });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  const e = res.data;
  return { e, row: e.m.rows.find(r => r.date === DAY), count: e.m.count, dayPay: e.trace.tienNgayCong };
};
const refuses = (res?, status?, code?) => {
  assert.equal(res.status, status, JSON.stringify(res.data));
  assert.equal(res.data.code, code, JSON.stringify(res.data));
  assert.ok(res.data.error, 'câu của máy chủ');
};

test('active leave suppresses absence; rejected or cancelled leave exposes both missing punch flags', async () => {
  await F.at(NOW);
  const saved = await F.call('PUT', '/sheet', {
    who: 'leave-active',
    body: { month: MONTH, days: { [DAY]: { kind: 'leave' } } }
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  const submit = await F.call('POST', '/explanations', {
    who: 'leave-active', body: { date: DAY, text: REASON }
  });
  refuses(submit, 409, 'EXPLANATION_DAY_NOT_ABSENT');
  let row = await F.store.approvals.get('leave-active', DAY);
  assert.equal(row.status, 'pending');
  const decide = (action, current) => F.call('PUT', '/approvals/decide', {
    who: 'admin', body: { action, items: [{ username: current.username, date: current.date, rev: current.rev, fingerprint: current.fingerprint }] }
  });
  assert.equal((await decide('approve', row)).status, 200);
  await F.at(NOW);
  let alerts = (await F.call('GET', `/alerts?month=${MONTH}`, { who: 'admin' })).data;
  assert.equal(alerts.absentNoExplanation.some(x => x.username === 'leave-active' && x.date === DAY), false);
  row = await F.store.approvals.get('leave-active', DAY);
  assert.equal((await decide('reject', row)).status, 200);
  await F.at(NOW);
  alerts = (await F.call('GET', `/alerts?month=${MONTH}`, { who: 'admin' })).data;
  const absent = alerts.absentNoExplanation.find(x => x.username === 'leave-active' && x.date === DAY);
  assert.deepEqual(absent.flags, ['forgot-in', 'forgot-out']);
  assert.deepEqual(
    alerts.missingPunches.filter(x => x.username === 'leave-active' && x.date === DAY),
    [],
    'absence flags stay on the absent-day row and do not duplicate missing-punch alerts'
  );
  assert.equal((await checklist()).item.count, alerts.absentNoExplanation.length);
  const cancelled = await F.call('PUT', '/sheet', {
    who: 'leave-active', body: { month: MONTH, days: {} }
  });
  assert.equal(cancelled.status, 200, JSON.stringify(cancelled.data));
  await F.at(NOW);
  alerts = (await F.call('GET', `/alerts?month=${MONTH}`, { who: 'admin' })).data;
  assert.deepEqual(
    alerts.absentNoExplanation.find(x => x.username === 'leave-active' && x.date === DAY).flags,
    ['forgot-in', 'forgot-out']
  );
});

test('Chuẩn so sánh: người Check-in/out đủ ca ngày 27/10; Admin chưa thấy gì ở ngày này của họ', async () => {
  await X.fullDay('ref', DAY, '08:00', '17:00', 'self-ref');
  assert.deepEqual(await alertsOf('ref'), OTHER_DAYS);
  assert.deepEqual(await alertsOf('vang'), ALL_DAYS);
});

test('Cảnh báo ngày vắng: có trong GET /alerts và danh sách kiểm kỳ (cảnh báo, không chặn), số khớp nhau', async () => {
  await F.at(NOW);
  const alerts = (await F.call('GET', `/alerts?month=${MONTH}`, { who: 'admin' })).data;
  assert.deepEqual(
    alerts.missingPunches.filter(r => r.username === 'vang').map(r => [r.date, r.kind]),
    []
  );
  const mine = alerts.absentNoExplanation.filter(r => r.username === 'vang');
  assert.deepEqual(
    mine.map(r => [r.username, r.name, r.date]),
    ALL_DAYS.map(d => ['vang', 'Người thử vang', d])
  );
  const list = await checklist();
  assert.ok(list.item, 'có mục ABSENT_NO_EXPLANATION');
  assert.equal(list.item.severity, 'warn');
  assert.equal(list.item.acknowledgeable, false);
  assert.equal(list.item.link, 'attendance');
  assert.equal(list.item.count, alerts.absentNoExplanation.length);
  assert.match(list.item.message, /chưa có giải trình/);
});

test('Nhân viên gửi → Admin duyệt: 1 công theo giờ ca, tiền khớp người Check-in/out đủ ca; ngày hết cảnh báo, vào số chờ duyệt', async () => {
  const pendingBefore = await (await checklist()).count('EXPLANATION_PENDING');
  const absentBefore = (await checklist()).item.count;
  const readBefore = await toRead();
  const before = await estimate('tu');
  assert.equal(before.count, 0);
  assert.equal(before.row.kind, 'noshow');

  const sent = await submit('tu');
  assert.equal(sent.status, 200, JSON.stringify(sent.data));
  const item = sent.data.item;
  assert.equal(item.username, 'tu');
  assert.equal(item.requestedBy, 'tu');
  assert.equal(item.kind, 'admin');
  assert.equal(item.date, DAY);
  assert.equal(item.status, 'answered');
  assert.equal(item.answer, REASON);
  assert.equal(item.sessionId, null);
  assert.ok(item.prompt && item.requestedAt && item.answeredAt);
  assert.equal(item.name, 'Người thử tu');

  const held = await estimate('tu'); // chờ duyệt: ngày giữ, 0 công
  assert.equal(held.row.kind, 'unpaid');
  assert.equal(held.row.held, 'pending');
  assert.equal(held.count, 0);
  assert.deepEqual(await alertsOf('tu'), OTHER_DAYS);
  const list = await checklist();
  assert.equal(list.item.count, absentBefore - 1);
  assert.equal(await list.count('EXPLANATION_PENDING'), pendingBefore + 1);
  assert.equal(await toRead(), readBefore + 1);
  const mine = (await F.call('GET', '/explanations', { who: 'tu' })).data;
  assert.deepEqual(
    mine.items.map(i => [i.id, i.status]),
    [[item.id, 'answered']]
  );

  const ok = await X.decide(item.id, true);
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(ok.data.item.status, 'approved');
  assert.equal(ok.data.recorded, true);
  const mineOk = await estimate('tu');
  const ref = await estimate('ref');
  assert.equal(mineOk.row.kind, 'work');
  assert.equal(mineOk.row.hours, 8);
  assert.equal(mineOk.row.punchIn, '08:00');
  assert.equal(mineOk.row.punchOut, '17:00');
  assert.equal(mineOk.count, 1);
  assert.equal(mineOk.dayPay, DAILY);
  assert.equal(mineOk.e.trace.tongThuNhap, ref.e.trace.tongThuNhap);
  assert.equal(mineOk.e.net.net, ref.e.net.net);
  assert.deepEqual(await alertsOf('tu'), OTHER_DAYS);
  assert.equal(await (await checklist()).count('EXPLANATION_PENDING'), pendingBefore);
});

test('Nhân viên gửi → Admin từ chối: ngày vắng, 0 công, 0 đồng như người không giải trình; không quay lại cảnh báo', async () => {
  const sent = await submit('tc', DAY, 'Em đi khám bệnh');
  assert.equal(sent.status, 200, JSON.stringify(sent.data));
  const no = await X.decide(sent.data.item.id, false);
  assert.equal(no.status, 200, JSON.stringify(no.data));
  assert.equal(no.data.item.status, 'rejected');
  assert.equal(no.data.recorded, false);
  const mine = await estimate('tc');
  const absent = await estimate('vang');
  assert.equal(mine.row.kind, 'unpaid');
  assert.equal(mine.row.held, 'rejected');
  assert.equal(mine.row.pay, 0);
  assert.equal(mine.count, 0);
  assert.equal(mine.dayPay, 0);
  assert.equal(mine.e.trace.tongThuNhap, absent.e.trace.tongThuNhap);
  assert.equal(mine.e.net.net, absent.e.net.net);
  assert.deepEqual(await alertsOf('tc'), OTHER_DAYS);
  // Giải trình bị từ chối đã là một giải trình: gửi lại ngày đó bị từ chối (Admin đổi quyết định trên chính giải trình đó)
  refuses(await submit('tc'), 409, 'EXPLANATION_EXISTS');
});

test('Lý do bắt buộc, tối đa 500 ký tự; ngày phải đúng dạng YYYY-MM-DD hợp lệ', async () => {
  refuses(await send('vang', { date: DAY }), 400, 'EXPLANATION_TEXT_REQUIRED');
  refuses(await submit('vang', DAY, '   '), 400, 'EXPLANATION_TEXT_REQUIRED');
  refuses(await submit('vang', DAY, 'x'.repeat(501)), 400, 'EXPLANATION_TEXT_TOO_LONG');
  for (const date of ['27/10/2026', '2026-02-31', '2026-13-01', 20261027, null])
    refuses(await send('vang', { date, text: REASON }), 400, 'BAD_DATE');
  assert.deepEqual(await alertsOf('vang'), ALL_DAYS, 'lần gửi lỗi không tạo giải trình');
  assert.equal((await F.call('GET', '/explanations', { who: 'vang' })).data.items.length, 0);
});

test('Ngày của người khác: chỉ Admin yêu cầu; nhân viên gửi {date, text} là giải trình của chính mình', async () => {
  refuses(await send('khac', { username: 'vang', date: DAY, prompt: 'Hỏi hộ' }), 403, 'FORBIDDEN_CAP');
  refuses(await send('khac', { username: 'vang', date: DAY, text: REASON }), 403, 'FORBIDDEN_CAP');
  assert.deepEqual(await alertsOf('vang'), ALL_DAYS);
  const own = await send('khac', { username: 'khac', date: DAY, text: REASON });
  assert.equal(own.status, 200, JSON.stringify(own.data));
  assert.equal(own.data.item.username, 'khac');
  const other = await send('khac', { username: 'vang', date: '2026-10-28', text: REASON });
  assert.equal(other.status, 403);
  const none = await send('vang', {});
  assert.equal(none.status, 404); // không có sessionId cũng không có date: đường giải trình theo lượt
  assert.equal(none.data.code, 'SESSION_NOT_FOUND');
});

test('Ngày tương lai, ngày trong ca chưa kết thúc, ngày ngoài lịch, trước ngày vào làm, ngày lễ bị từ chối', async () => {
  refuses(await submit('vang', '2026-10-30'), 400, 'EXPLANATION_DAY_FUTURE');
  refuses(await submit('vang', '2026-12-01'), 400, 'EXPLANATION_DAY_FUTURE');
  refuses(await submit('vang', '2026-10-29'), 409, 'EXPLANATION_DAY_NOT_ABSENT'); // hôm nay, ca 08:00–17:00 chưa kết thúc
  refuses(await submit('cu', '2026-10-25'), 400, 'EXPLANATION_DAY_OFF_SCHEDULE'); // Chủ nhật
  refuses(await submit('moi', DAY), 400, 'EXPLANATION_DAY_OFF_SCHEDULE'); // trước ngày vào làm 28/10
  await F.store.setSetting('holidays', [DAY]);
  try {
    refuses(await submit('vang', DAY), 400, 'EXPLANATION_DAY_OFF_SCHEDULE');
  } finally {
    await F.store.setSetting('holidays', []);
  }
  assert.deepEqual(await alertsOf('vang'), ALL_DAYS);
  assert.equal(await alertsOf('cu').then(d => d.includes('2026-10-25')), false);
});

test('Ngày đã có lượt Check-in/out: giải trình đi theo lượt chấm công, không nhận giải trình ngày', async () => {
  refuses(await submit('ref'), 409, 'EXPLANATION_DAY_PUNCHED');
  const sent = await submit('ref', OTHER_DAYS[0]); // ngày khác của chính người đó vẫn vắng
  assert.equal(sent.status, 200, JSON.stringify(sent.data));
});

test('Một ngày một giải trình: gửi trùng, hoặc ngày Admin đã yêu cầu, bị từ chối; ngày khác vẫn gửi được', async () => {
  const first = await submit('dup');
  assert.equal(first.status, 200, JSON.stringify(first.data));
  refuses(await submit('dup', DAY, 'Gửi lại lần hai'), 409, 'EXPLANATION_EXISTS');
  const next = await submit('dup', OTHER_DAYS[1]);
  assert.equal(next.status, 200, JSON.stringify(next.data));
  const list = (await F.call('GET', '/explanations', { who: 'dup' })).data.items;
  assert.equal(list.length, 2);

  await F.at(NOW);
  const asked = await F.call('POST', '/explanations', {
    who: 'admin',
    body: { username: 'le', date: DAY, prompt: 'Ngày này không có chấm công?' }
  });
  assert.equal(asked.status, 200, JSON.stringify(asked.data));
  refuses(await submit('le'), 409, 'EXPLANATION_EXISTS'); // trả lời yêu cầu của Admin bằng /answer
  assert.deepEqual(await alertsOf('le'), OTHER_DAYS, 'ngày Admin đã hỏi không còn là ngày chưa ai xử lý');
});

test('Giải trình ngày vắng ghi nhật ký explanation.self theo người và tháng', async () => {
  const sent = await submit('fix');
  assert.equal(sent.status, 200, JSON.stringify(sent.data));
  const row = await F.store.db
    .prepare("SELECT * FROM audit_log WHERE action = 'explanation.self' AND subject = 'fix'")
    .get();
  assert.ok(row, 'có dòng nhật ký explanation.self');
  assert.equal(row.entity_id, String(sent.data.item.id));
  assert.equal(row.month, MONTH);
});

test('Kỳ đã chốt công: không nhận giải trình ngày vắng nữa', async () => {
  await F.at('2026-11-02T09:00:00'); // tháng 10 đã hết
  P.must(await P.step(MONTH, 'lock-attendance'), 'chốt công');
  const res = await F.call('POST', '/explanations', { who: 'vang', body: { date: DAY, text: REASON } });
  refuses(res, 409, 'EXPLANATION_PERIOD_LOCKED');
  await F.at('2026-11-02T09:00:00');
  assert.equal((await F.call('GET', '/explanations', { who: 'vang' })).data.items.length, 0);
});
