'use strict';
// Đồ dùng chung cho test giải trình ngày: dựng lượt quên Check-out, Admin yêu cầu / nhân sự trả lời / Admin quyết định qua API thật,
// và đọc kết quả tính lương của một người (cùng đường loadInputs → computeFor như bảng lương).
// Nạp SAU test/helpers/api-fixture.ts (đã xác nhận database test tạm).
const assert = require('node:assert/strict');
const F = require('./api-fixture');

const MONTH = '2026-10';
const NOW = '2026-10-29T12:00:00'; // đồng hồ giả cố định của các test giải trình: sau mọi ngày công được kiểm
const iso = (vn?) => new Date(`${vn}+07:00`).toISOString();
const punch = async (who?, body?) => await F.call('POST', '/punch', { who, body });

// Bấm như nhân sự đã giải trình lúc bấm và Admin đã duyệt giải trình đó: lần bấm hợp lệ không ghi giải trình (câu giải trình bị bỏ qua),
// lần bấm không hợp lệ (trễ, về sớm …) ghi giải trình gắn với lượt rồi Admin duyệt ngay, để ngày không bị giữ vì giải trình lúc bấm.
// Dùng khi test chỉ cần có một lượt trễ / sớm làm đầu vào; test của chính giải trình lúc bấm gọi punch() trần.
async function press(who?, body?) {
  const res = await punch(who, { explanation: 'Giải trình lúc bấm', ...body });
  if (res.status !== 200) return res;
  const { container } = require('../../src/domain/container');
  const sessionIds = new Set<any>([res.data.openSession, res.data.lastSession].filter(Boolean).map(s => s.id));
  for (const item of await require('../../src/domain/explanation/explanations').list({
    username: who,
    status: 'answered'
  }))
    if (sessionIds.has(item.sessionId) && /^punch-/.test(item.kind)) {
      await container.explanations.decide({ id: item.id, by: 'admin', approve: true, note: '', isSelf: false });
    }
  return res;
}

// Check-in lúc at (giờ VN) rồi không Check-out; sang ngày sau 12:00 thì lượt tự đóng là Quên Check-out. Trả id lượt.
async function forgotOut(who?, date?, at?, requestId?) {
  await F.at(`${date}T${at}:00`);
  const res = await press(who, { type: 'in', requestId });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  const next = new Date(Date.parse(`${date}T12:00:00+07:00`) + 24 * 3600 * 1000);
  await F.at(next.toISOString().replace('Z', '').slice(0, 19));
  const { closeStaleIn } = require('../../src/domain/attendance');
  await closeStaleIn(MONTH, new Set<any>([who]));
  return res.data.open.id;
}

// Check-in và Check-out đủ giờ trong ngày date (giờ VN hh:mm)
async function fullDay(who?, date?, inAt?, outAt?, requestId?) {
  await F.at(`${date}T${inAt}:00`);
  const opened = await press(who, { type: 'in', requestId: `${requestId}-in` });
  assert.equal(opened.status, 200, JSON.stringify(opened.data));
  await F.at(`${date}T${outAt}:00`);
  const closed = await press(who, { type: 'out', sessionId: opened.data.open.id, requestId: `${requestId}-out` });
  assert.equal(closed.status, 200, JSON.stringify(closed.data));
  return opened.data.open.id;
}

// Admin yêu cầu giải trình, nhân sự trả lời; trả giải trình ở trạng thái "đã trả lời"
async function askAndAnswer(username?, date?, source = 'admin') {
  await F.at(NOW);
  const asked = await F.call('POST', '/explanations', {
    who: 'admin',
    body: { username, date, prompt: 'Vì sao ngày này thiếu giờ?', source }
  });
  assert.equal(asked.status, 200, JSON.stringify(asked.data));
  const answered = await F.call('POST', `/explanations/${asked.data.item.id}/answer`, {
    who: username,
    body: { text: 'Em quên bấm' }
  });
  assert.equal(answered.status, 200, JSON.stringify(answered.data));
  return answered.data.item;
}

async function decide(id?, approve?, who = 'admin') {
  await F.at(NOW);
  return await F.call('POST', `/explanations/${id}/decide`, { who, body: { approve } });
}

// Kết quả tính lương tháng MONTH của một người: { m, payDays, actualReport }
async function payOf(username?, month = MONTH) {
  await F.at(NOW);
  const service = require('../../src/domain/payroll/payroll-service');
  const inputs = await service.loadInputs(month, { usernames: [username] });
  return service.computeFor(month, inputs.people.get(username).staff, inputs, (await service.paramsFor(month)).params);
}

// Các lượt của một người trong ngày công date (kể cả lượt Admin)
const sessionsOn = async (username?, date?) =>
  (await F.store.listSessions({ username, includeScheduled: true })).filter(
    s => ((s.entry.plannedShift || {}).date || s.date) === date
  );

// Admin khai thay các ngày dates (một ngày hoặc danh sách) là đi làm đủ ca (đường PUT /sheet kèm confirmDays). Mỗi lần lưu thay cả lịch
// của tháng, nên ngày nào cần giữ phải có trong cùng một lần gọi.
async function declareOnBehalf(username?, dates?, day = { kind: 'work', in: '08:00', out: '17:00' }) {
  const list = [].concat(dates);
  const res = await F.call('PUT', '/sheet', {
    who: 'admin',
    body: {
      month: list[0].slice(0, 7),
      user: username,
      days: Object.fromEntries(list.map(date => [date, day])),
      confirmDays: list
    }
  });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  return res;
}

module.exports = {
  MONTH,
  iso,
  punch,
  press,
  forgotOut,
  fullDay,
  askAndAnswer,
  decide,
  payOf,
  sessionsOn,
  declareOnBehalf
};
