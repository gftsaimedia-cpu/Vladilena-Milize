'use strict';
const { AsyncList } = require('../../src/shared/async-list');
// Sáu việc máy chủ làm cho giao diện:
//   1. Tắt luật AI: lựa chọn "Tắt" của ai.rule.<id>.enabled lưu được qua PUT /settings/params (tháng hiệu lực, nhật ký); GET /ai/review liệt kê vào
//      checked.skipped { rule, reason: 'Admin tắt' } và bỏ khỏi checked.ruleIds; tháng trước tháng hiệu lực vẫn chạy luật đó.
//   2. Câu máy chủ tự sinh viết bằng tiếng Việt thường (kiểm ở test/helpers/plain-text.ts và các bài sửa kèm).
//   3. allowanceTotal = thành phần ③ từ bản chụp (phụ cấp ca + giờ nghỉ đêm + đi lại + chuyên cần + mọi khối C&B), số tự tính (số Admin sửa không áp),
//      null khi bản chụp thiếu một dòng; có ở chi tiết phiếu, danh sách phiếu, ước tính một người và GET /me/estimate. Không đổi tiền.
//   4. GET /sheet của chính mình khi là tài khoản ngoài bảng lương không có quyền chấm công: 200, lịch rỗng, payrollSubject false.
//   5. GET /sheet?user=<người khác> kèm owner { username, name, type, typeLabel, level, levelName, shiftCode, shiftLabel, startDate, payrollSubject };
//      nhân sự xin lịch người khác vẫn 403.
//   6. Chỉ mục punches_session, corrections_session và gộp lịch sử lượt (sessionsWithHistory): phản hồi /attendance, /team, /today GIỐNG HỆT đường chậm
//      (mỗi phiên hai truy vấn qua sessionHistory).
// Chỉ người bịa (qa_*) và DB trong bộ nhớ.
const P = require('../helpers/period-api');
const S = require('../helpers/settings-api');
const { assertPlain } = require('../helpers/plain-text');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { allowanceTotalOf } = require('../../src/domain/period/period-allowance');
const { sessionHistory, sessionsWithHistory } = require('../../src/domain/attendance');

const { F, store, flow } = P;
// tháng 2026-10 dành riêng cho bài tiền có số cố định; các bài khác lấy tháng riêng từ đây
const monthOf = (() => {
  const next = P.monthPool();
  next();
  return next;
})();
const FIXED = '2026-10';

before(F.start);
after(F.stop);

/* ================= 1. tắt luật AI ================= */
const RULE = { id: 'isat-frequency', key: 'ai.rule.isatFrequency.enabled' };
const review = async (month?) => await F.call('GET', `/ai/review?month=${month}`);

/* ================= 3. allowanceTotal ================= */
const SNAP_KEYS = ['phuCapCa', 'gioNghiDem', 'phuCapDiLai', 'phuCapChuyenCan'];
// Tổng tính độc lập từ bản chụp: bốn dòng của vết tính + mọi khối phụ cấp C&B
const sumOfSnapshot = (snapshot?) =>
  SNAP_KEYS.reduce((sum, key) => sum + (snapshot.trace[key] || 0), 0) +
  (snapshot.blocks || []).reduce((sum, block) => sum + (block.amount || 0), 0);

test('allowanceTotalOf: tổng bốn dòng phụ cấp của vết tính cộng mọi khối C&B; null khi bản chụp thiếu một dòng; số lạ tính 0', () => {
  const trace = { phuCapCa: 1000, gioNghiDem: 200, phuCapDiLai: 300, phuCapChuyenCan: 400 };
  assert.equal(allowanceTotalOf({ trace }), 1900);
  assert.equal(allowanceTotalOf({ trace, blocks: [{ amount: 50 }, { amount: 26 }] }), 1976);
  assert.equal(
    allowanceTotalOf({ trace: { ...trace, phuCapCa: 1000.5 }, blocks: [{ amount: 25.5 }] }),
    1927,
    'bản chụp cũ có số thực: làm tròn từng dòng rồi cộng'
  );
  assert.equal(
    allowanceTotalOf({ trace: { ...trace, phuCapCa: NaN }, blocks: [{ amount: 'x' }] }),
    900,
    'số không hợp lệ tính 0'
  );
  for (const key of SNAP_KEYS) {
    const missing = { ...trace };
    delete missing[key];
    assert.equal(allowanceTotalOf({ trace: missing }), null, `thiếu ${key}`);
  }
  for (const empty of [null, undefined, {}, { trace: null }]) assert.equal(allowanceTotalOf(empty), null);
});

test('allowanceTotal: bằng tổng các dòng phụ cấp của bản chụp (đúng từng đồng) ở chi tiết phiếu, danh sách phiếu, ước tính một người và GET /me/estimate; tiền không đổi', async () => {
  await P.seed(FIXED);
  await P.advance(FIXED, 'calculated');
  // Số mong đợi: bộ máy chạy trên đầu vào đọc thẳng từ bảng DB (không qua loadInputs, bản chụp hay API) cho bốn người; riêng qa_tts1 có số tính tay.
  // qa_tts1 (2026-10, ngày 07/10 là lễ): lịch T2–T6 trừ ngày lễ có 21 ngày, hai ngày không đi làm (09/10, 26/10) còn 19 ngày công; lương ngày 2.000.000 / 22 = 90.909,09
  // nên 19 ngày = 1.727.272,73. Chấm công: trễ 20 phút ở ngày công thứ 5, 10, 15 và về sớm 40 phút ở ngày thứ 7, 14, mỗi lần quá 15 phút trừ làm tròn lên bậc 30 phút
  // nên trừ 5 × 30 = 150 phút = 2,5 giờ × (90.909,09 / 8 = 11.363,64) = 28.409,09. Tổng thu nhập 1.727.272,73 − 28.409,09 = 1.698.863,64 → 1.698.864, không phụ cấp.
  // Bảo hiểm 10,5 % × 2.000.000 = 210.000 (đủ 3 tháng từ 05/01/2026 là hợp đồng dài), thuế 0, tạm ứng 0 (chưa xin): thực lĩnh 1.698.864 − 210.000 = 1.488.864.
  const direct = await flow.expectedFor(FIXED);
  const EXPECT = Object.fromEntries(
    flow.PEOPLE.map(({ username }: any) => {
      const { m } = direct[username];
      return [
        username,
        {
          allowance: SNAP_KEYS.reduce((sum, key) => sum + Math.round(m.trace[key] || 0), 0),
          net: m.net.net,
          gross: m.net.gross
        }
      ];
    })
  );
  assert.deepEqual(EXPECT.qa_tts1, { allowance: 0, net: 1488864, gross: 1698864 }, 'qa_tts1 theo số tính tay');
  assert.ok(EXPECT.qa_nv1.allowance > 0 && EXPECT.qa_nv2.allowance > 0, 'điều kiện: hai NV có phụ cấp để so');
  const stored = (await flow.payslipsOf(FIXED)).slips;
  const list = (await F.call('GET', `/periods/${FIXED}/payslips?pageSize=50`)).data.rows;
  for (const [user, want] of Object.entries<any>(EXPECT)) {
    const detail = (await F.call('GET', `/periods/${FIXED}/payslips/${user}`)).data.payslip;
    assert.equal(detail.allowanceTotal, sumOfSnapshot(detail.snapshot), `${user}: bằng tổng các dòng trong bản chụp`);
    assert.equal(detail.allowanceTotal, want.allowance, `${user}: số VND`);
    assert.equal(detail.allowanceTotal, sumOfSnapshot(stored[user].snapshot), `${user}: bằng bản chụp lưu trong DB`);
    // tiền không đổi
    assert.deepEqual([detail.gross, detail.net], [want.gross, want.net], `${user}: gross và thực lĩnh không đổi`);
    assert.equal(stored[user].net, want.net, `${user}: số đã lưu trong bảng phiếu`);
    const row = list.find(r => r.username === user);
    assert.equal(row.allowanceTotal, detail.allowanceTotal, `${user}: danh sách phiếu`);
    assert.equal(row.net, want.net);
  }
  // phụ cấp nằm trong tổng thu nhập: ③ không vượt gross
  for (const row of list) assert.ok(row.allowanceTotal <= row.gross);

  // ước tính một người của Admin và thẻ thu nhập của chính nhân sự (kỳ chưa chi trả: cùng số)
  const one = (await F.call('GET', `/periods/${FIXED}/estimates/qa_nv2`)).data.payslip;
  assert.equal(Math.round(one.allowanceTotal), EXPECT.qa_nv2.allowance);
  const me = (await F.call('GET', `/me/estimate?month=${FIXED}`, { who: 'qa_nv2' })).data;
  assert.equal(Math.round(me.allowanceTotal), EXPECT.qa_nv2.allowance);

  // số Admin sửa trên phiếu KHÔNG áp vào allowanceTotal; thực lĩnh thì đổi theo số sửa
  const before = (await F.call('GET', `/periods/${FIXED}/payslips/qa_nv2`)).data.payslip;
  const put = await F.call('PUT', '/slip-override', {
    body: { user: 'qa_nv2', month: FIXED, values: { attendance: 500000 }, reason: 'Trả chuyên cần theo biên bản' }
  });
  assert.equal(put.status, 200, JSON.stringify(put.data));
  const after = (await F.call('GET', `/periods/${FIXED}/payslips/qa_nv2`)).data.payslip;
  assert.equal(after.allowanceTotal, before.allowanceTotal, 'số Admin sửa không áp vào allowanceTotal');
  assert.notEqual(after.net, before.net, 'điều kiện: số sửa có đổi thực lĩnh');
  assert.equal(
    (await F.call('GET', `/periods/${FIXED}/payslips?pageSize=50`)).data.rows.find(r => r.username === 'qa_nv2')
      .allowanceTotal,
    before.allowanceTotal
  );
});

/* ================= 4 và 5. GET /sheet ================= */
test('GET /sheet của tài khoản ngoài bảng lương không có quyền chấm công: 200, lịch rỗng, payrollSubject false; xin lịch người khác vẫn 403', async () => {
  const M = monthOf();
  await P.seed(M, { withActual: true });
  await F.person('qa_np', 'staff', {
    type: 'nv',
    level: 1,
    shiftCode: 'n1',
    startDate: '2026-01-05',
    payrollSubject: false
  });
  assert.equal((await store.getStaff('qa_np')).payrollSubject, false);
  const own = await F.call('GET', `/sheet?month=${M}`, { who: 'qa_np' });
  assert.equal(own.status, 200, JSON.stringify(own.data));
  assert.equal(own.data.payrollSubject, false);
  assert.deepEqual(own.data.days, {});
  assert.deepEqual(own.data.attendanceSessions, []);
  assert.deepEqual(own.data.corrections, []);
  assert.equal(own.data.owner, undefined, 'xem của chính mình không có owner');
  // không lộ lịch của người khác, kể cả khi gửi user
  const other = await F.call('GET', `/sheet?month=${M}&user=qa_nv2`, { who: 'qa_np' });
  assert.equal(other.status, 403, JSON.stringify(other.data));
  assert.ok(!JSON.stringify(other.data).includes('2026-10-0'));
  // nhân sự trong bảng lương vẫn có lịch của mình
  const mine = await F.call('GET', `/sheet?month=${M}`, { who: 'qa_nv2' });
  assert.equal(mine.status, 200);
  assert.notEqual(mine.data.payrollSubject, false, 'nhân sự trong bảng lương không bị gắn cờ ngoài bảng lương');
  assert.ok(Object.keys(mine.data.days).length > 0);
});

test('GET /sheet?user=<người khác> kèm owner { username, name, type, typeLabel, level, levelName, shiftCode, shiftLabel, startDate, payrollSubject }; xem của mình không có owner; nhân sự xin của người khác 403', async () => {
  const M = monthOf();
  await P.seed(M);
  const res = await F.call('GET', `/sheet?month=${M}&user=qa_nv2`);
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.deepEqual(Object.keys(res.data.owner).sort(), [
    'level',
    'levelName',
    'name',
    'payrollSubject',
    'shiftCode',
    'shiftLabel',
    'startDate',
    'type',
    'typeLabel',
    'username'
  ]);
  assert.deepEqual(res.data.owner, {
    username: 'qa_nv2',
    name: 'Người thử qa_nv2',
    type: 'nv',
    typeLabel: 'Nhân viên',
    level: 3,
    levelName: 'Lead',
    shiftCode: 'Flex2', // hồ sơ lưu mã ca dạng Normal1, Flex2 …
    shiftLabel: 'Flex 2 13:00–22:00',
    startDate: '2026-01-05',
    payrollSubject: true
  });
  // dữ liệu lương nhạy cảm không đi kèm owner
  assert.doesNotMatch(JSON.stringify(res.data.owner), /salary|base|leaveAdjust|birthday|pass/i);
  const cb = await F.call('GET', `/sheet?month=${M}&user=qa_nv1`);
  assert.equal(cb.data.owner.shiftCode, 'Night2');
  assert.equal(cb.data.owner.type, 'nv');
  // của chính mình: không có owner (cả khi gửi user trùng tên mình)
  assert.equal((await F.call('GET', `/sheet?month=${M}`, { who: 'qa_nv2' })).data.owner, undefined);
  assert.equal((await F.call('GET', `/sheet?month=${M}&user=qa_nv2`, { who: 'qa_nv2' })).data.owner, undefined);
  // nhân sự xin lịch người khác vẫn bị từ chối, không có owner nào lọt ra
  const denied = await F.call('GET', `/sheet?month=${M}&user=qa_nv2`, { who: 'qa_nv1' });
  assert.equal(denied.status, 403);
  assert.equal(denied.data.owner, undefined);
  assert.equal(
    (await F.call('GET', `/sheet?month=${M}&user=khong_co`)).data.owner,
    undefined,
    'người không có thì không có owner'
  );
});

/* ================= 6. lịch sử lượt chấm công gộp ================= */
// Phiên có đủ loại: nhiều lượt bấm, có yêu cầu điều chỉnh, của nhiều người, một người có yêu cầu khác phiên
async function attendanceWorld(month?) {
  await P.seed(month, { withActual: true });
  const sessions = await store.listSessions({ month });
  assert.ok(sessions.length >= 20, `điều kiện: có nhiều phiên (${sessions.length})`);
  // lượt bấm cho một nửa số phiên (mỗi phiên 1 đến 2 lượt)
  await AsyncList.forEach(sessions, async (s, i) => {
    if (i % 2) return;
    await store.addPunch(
      s.username,
      s.entry.presIn || `${s.date}T01:00:00.000Z`,
      'in',
      '127.0.0.1',
      false,
      { plannedShift: null },
      s.id
    );
    if (i % 4 === 0)
      await store.addPunch(
        s.username,
        s.entry.presOut || `${s.date}T10:00:00.000Z`,
        'out',
        '127.0.0.1',
        false,
        null,
        s.id
      );
  });
  // yêu cầu điều chỉnh (lịch sử chỉ đọc) gắn vào lượt mới của vài người; không có route tạo
  // nên dựng thẳng lượt và dòng điều chỉnh trong store
  const made: any[] = [];
  for (const [i, user] of ['qa_tts1', 'qa_ctv1', 'qa_nv1'].entries()) {
    const date =
      P.firstDow(month, 0).slice(0, 8) + String(Number(P.firstDow(month, 0).slice(8)) + 7 * i).padStart(2, '0'); // các Chủ nhật: không có phiên nào để chồng giờ
    const reqIn = new Date(`${date}T08:00:00+07:00`).toISOString(),
      reqOut = new Date(`${date}T17:00:00+07:00`).toISOString();
    const session = await store.createSession(user, date, 'closed', {
      kind: 'pending',
      reason: 'needs-review',
      src: 'admin',
      presIn: reqIn,
      presOut: reqOut
    });
    const id = await store.addCorrection({
      username: user,
      date,
      reqIn,
      reqOut,
      reason: `Điều chỉnh thử số ${i}`,
      sessionId: session.id,
      sessionVersion: session.version
    });
    made.push({ id, sessionId: session.id, sessionVersion: session.version });
  }
  return made;
}
// Mọi đối tượng có dạng phiên (id, username, punches, corrections) trong một phản hồi
function sessionObjects(node?, out: any[] = []) {
  if (Array.isArray(node)) for (const x of node) sessionObjects(x, out);
  else if (node && typeof node === 'object') {
    if (
      Array.isArray(node.punches) &&
      Array.isArray(node.corrections) &&
      typeof node.id === 'number' &&
      typeof node.username === 'string'
    )
      out.push(node);
    else for (const value of Object.values<any>(node)) sessionObjects(value, out);
  }
  return out;
}
const asJson = (value?) => JSON.parse(JSON.stringify(value));

test('sessionsWithHistory (gộp theo nhóm id) giống hệt đường cũ sessionHistory (hai truy vấn mỗi phiên): punches theo id tăng, corrections theo id giảm, chỉ yêu cầu của đúng người', async () => {
  const M = monthOf();
  await attendanceWorld(M);
  const sessions = await store.listSessions({});
  assert.ok(
    await AsyncList.some(sessions, async s => (await store.sessionPunches(s.id)).length > 1),
    'điều kiện: có phiên nhiều lượt bấm'
  );
  assert.ok(
    await AsyncList.some(
      sessions,
      async s => (await store.listCorrections({ username: s.username, sessionId: s.id })).length > 0
    ),
    'điều kiện: có phiên có yêu cầu điều chỉnh'
  );
  assert.deepEqual(
    asJson(await sessionsWithHistory(sessions)),
    asJson(await Promise.all(sessions.map(sessionHistory)))
  );
  assert.deepEqual(await sessionsWithHistory([]), []);
  // chia nhóm id: hơn hai nhóm (SQL_IN_CHUNK) phiên khác nhau vẫn giống sessionHistory
  const config = require('../../src/platform/config');
  const total = config.SQL_IN_CHUNK * 2 + 37;
  await store.transaction(async () => {
    for (let i = 0; i < total; i++) {
      const made = await store.createSession('qa_tts1', `2027-06-${String((i % 28) + 1).padStart(2, '0')}`, 'closed', {
        kind: 'work',
        src: 'punch'
      });
      if (i % 3 === 0)
        await store.addPunch(
          'qa_tts1',
          `2027-06-${String((i % 28) + 1).padStart(2, '0')}T01:00:00.000Z`,
          'in',
          '127.0.0.1',
          false,
          null,
          made.id
        );
    }
  });
  const big = await store.listSessions({ username: 'qa_tts1' });
  assert.ok(big.length > config.SQL_IN_CHUNK * 2, `điều kiện: vượt hai nhóm (${big.length})`);
  assert.deepEqual(asJson(await sessionsWithHistory(big)), asJson(await Promise.all(big.map(sessionHistory))));
});

test('GET /attendance, /team, /today: mọi phiên trong phản hồi bằng đúng kết quả đường cũ sessionHistory của chính phiên đó; thứ tự và số phiên không đổi', async () => {
  const M = monthOf();
  await attendanceWorld(M);
  for (const route of [`/attendance?month=${M}`, `/team?month=${M}`, '/today']) {
    const res = await F.call('GET', route);
    assert.equal(res.status, 200, `${route}: ${JSON.stringify(res.data).slice(0, 200)}`);
    const found = sessionObjects(res.data);
    for (const session of found) {
      const reference = await sessionHistory(await store.getSession(session.id));
      // phản hồi thêm name và type của người (trang trí của route); mọi khoá của sessionHistory phải giống hệt, kể cả punches và corrections
      const got = asJson(session);
      for (const [key, value] of Object.entries<any>(asJson(reference)))
        assert.deepEqual(got[key], value, `${route}: phiên ${session.id}, khoá ${key} lệch đường cũ`);
    }
    if (route !== '/today') assert.ok(found.length > 0, `${route}: có phiên trong phản hồi`);
  }
  // /attendance: số phiên của tháng bằng đúng số phiên trong DB (không thừa, không thiếu)
  const attendance = (await F.call('GET', `/attendance?month=${M}`)).data;
  const ids = sessionObjects(attendance).map(s => s.id);
  assert.deepEqual(
    [...new Set<any>(ids)].sort((a: any, b: any) => a - b),
    (await store.listSessions({ month: M })).map(s => s.id).sort((a: any, b: any) => a - b)
  );
  assert.equal(ids.length, new Set<any>(ids).size, 'mỗi phiên một lần');
  // nhân sự thường vẫn 403
  assert.equal((await F.call('GET', `/attendance?month=${M}`, { who: 'qa_tts1' })).status, 403);
  assert.equal((await F.call('GET', `/team?month=${M}`, { who: 'qa_tts1' })).status, 403);
});

test('chữ máy chủ tự sinh cho người dùng là tiếng Việt thường: lỗi thường gặp và ghi chú tự động không lộ tên file, khoá cài đặt, mã lỗi đợt rà soát', async () => {
  const M = monthOf();
  await P.seed(M);
  const messages: any[] = [];
  const grab = (res?) => messages.push(res.data.error, res.data.message);
  grab(await F.call('PUT', '/settings/params', { body: { changes: [], effectiveMonth: M } })); // thiếu số phiên bản cấu hình
  grab(await F.call('PUT', '/settings/geofence', { body: { lat: 10, lng: 106, radiusM: 100, maxAccuracyM: 5 } }));
  grab(await F.call('POST', '/ot', { body: { sessionId: 99999 } }));
  grab(
    await F.call('PUT', '/sheet', { who: 'qa_tts1', body: { month: M, days: { [`${M}-05`]: { kind: 'khong_co' } } } })
  );
  for (const text of messages.filter(Boolean)) assertPlain(text, 'câu lỗi máy chủ');
  assert.ok(messages.filter(Boolean).length >= 3, 'có câu để kiểm');
});
