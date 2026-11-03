'use strict';
// Luồng giải trình lúc bấm từ lúc nhân viên bấm tới lúc Admin quyết, đúng như hai giao diện dùng:
//   bấm Check-in trễ không kèm lý do: 409 CHECKIN_NEEDS_EXPLANATION (nhân viên thấy ô nhập lý do), không ghi lượt;
//   bấm lại kèm lý do: ghi đúng một lượt "Chờ xử lý" và một giải trình trạng thái answered;
//   Admin thấy giải trình ở Yêu cầu → Giải trình (GET /explanations dựng thành dòng "Chờ xử lý", có nút Duyệt / Từ chối) và trong số chờ xử lý;
//   duyệt: ngày được tính, Check-in trễ cắt theo bậc hiện tại; từ chối: ngày không tính công.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
require('../helpers/require-isolated-database');
const F = require('../helpers/api-fixture');
const X = require('../helpers/explanation-flow');
const AS = require('../../src/engine/attendance-status');

const { MONTH } = X;
const web = (file?) => import(`../../web/src/${file}`);
let seq = 0;
const rid = () => `pf-${String(++seq).padStart(4, '0')}-req`;
const pressIn = async (who?, at?, extra: any = {}) => {
  await F.at(at);
  return await X.punch(who, { type: 'in', requestId: rid(), ...extra });
};
const pressOut = async (who?, sessionId?, at?, extra: any = {}) => {
  await F.at(at);
  return await X.punch(who, { type: 'out', sessionId, requestId: rid(), ...extra });
};
const adminList = async () => {
  await F.at('2026-10-29T12:00:00');
  return (await F.call('GET', '/explanations?status=answered', { who: 'admin' })).data;
};

before(async () => {
  await F.start();
  await F.at('2026-10-29T12:00:00');
  for (const name of ['tre', 'huy', 'som', 'dung']) await F.person(name);
  await F.person('admin', 'admin');
});
after(() => F.stop());

test('Check-in trễ không kèm lý do: 409 có mã, trường hợp, số phút, câu "Cần giải trình: …" và không ghi lượt nào', async () => {
  const none = await pressIn('tre', '2026-10-19T08:40:00');
  assert.equal(none.status, 409);
  assert.equal(none.data.code, 'CHECKIN_NEEDS_EXPLANATION');
  assert.equal(none.data.case, 'forgotIn');
  assert.equal(none.data.minutes, 40);
  assert.equal(none.data.error, 'Cần giải trình: Quên Check-in');
  assert.equal(none.data.cases.length, 1);
  assert.equal((await F.store.listSessions({ username: 'tre' })).length, 0);

  // Giao diện nhận ra lỗi này là lỗi cần giải trình và hiện nguyên câu của máy chủ
  const { ApiError } = await web('services/http.js');
  const { explanationDemand } = await web('builders/staff-requests/punch-explanation.js');
  const demand = explanationDemand(new ApiError(none.status, none.data.error, none.data));
  assert.equal(demand.side, 'in');
  assert.equal(demand.message, 'Cần giải trình: Quên Check-in');
  assert.equal(demand.note, 'Quên Check-in');
  assert.equal(explanationDemand(new ApiError(409, 'Bạn đang có lượt mở — Check-out trước', {})), null);
  assert.equal(explanationDemand(new Error('mạng lỗi')), null);
});

test('Bấm lại kèm lý do: một lượt Chờ xử lý, một giải trình answered; Admin thấy dòng "Chờ xử lý" có nút Duyệt và Từ chối trong danh sách Giải trình', async () => {
  const ok = await pressIn('tre', '2026-10-19T08:40:00', { explanation: 'Kẹt xe' });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal((await F.store.listSessions({ username: 'tre' })).length, 1);
  assert.equal(AS.labelOf(ok.data.openSession), 'Chờ xử lý');
  const out = await pressOut('tre', ok.data.open.id, '2026-10-19T17:00:00');
  assert.equal(out.status, 200, JSON.stringify(out.data));

  const list = await adminList();
  const mine = list.items.filter(x => x.username === 'tre');
  assert.equal(mine.length, 1);
  assert.equal(mine[0].kind, 'punch-in');
  assert.equal(mine[0].status, 'answered');
  assert.equal(mine[0].answer, 'Kẹt xe');
  assert.ok(list.toRead >= 1);

  const { buildExplanationRows, countWaiting } = await web('builders/admin-requests/explanations.js');
  const rows = buildExplanationRows(list, MONTH);
  const row = rows.items.find(r => r.type === 'tre');
  assert.equal(row.kind, 'Check-in');
  assert.equal(row.statusLabel, 'Chờ xử lý');
  assert.equal(row.detail, 'Kẹt xe');
  assert.equal(row.canApprove, true);
  assert.equal(row.canReject, true);
  assert.equal(rows.waiting, countWaiting(list.items));
  // Giải trình chờ của tháng khác vẫn hiện để Admin không bỏ sót, nhưng không tính vào số của tháng đang xem
  const older = { items: [{ ...mine[0], id: 999, date: '2026-09-15' }] };
  assert.equal(buildExplanationRows(older, MONTH).items.length, 1);
  assert.equal(countWaiting(older.items, MONTH), 0);
  assert.equal(countWaiting(older.items), 1);
});

test('Chờ xử lý thì ngày bị giữ; Admin duyệt thì ngày được tính và Check-in trễ 40 phút cắt 30 phút theo bậc hiện tại', async () => {
  assert.equal((await X.payOf('tre')).payDays['2026-10-19'].kind, 'unpaid');
  const [item] = (await adminList()).items.filter(x => x.username === 'tre');
  const done = await X.decide(item.id, true);
  assert.equal(done.status, 200, JSON.stringify(done.data));
  const paid = await X.payOf('tre');
  const day = paid.payDays['2026-10-19'];
  assert.equal(day.kind, 'work');
  assert.equal((day.cutStartMin || 0) + (day.cutEndMin || 0), 30);
  assert.equal(paid.m.count, 1);
  assert.equal((await adminList()).items.filter(x => x.username === 'tre').length, 0); // hết chờ
});

test('Admin từ chối giải trình lúc bấm: ngày đó không tính công và vào nghỉ không lương', async () => {
  const ok = await pressIn('huy', '2026-10-19T08:40:00', { explanation: 'Ngủ quên' });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal((await pressOut('huy', ok.data.open.id, '2026-10-19T17:00:00')).status, 200);
  const [item] = (await adminList()).items.filter(x => x.username === 'huy');
  const no = await X.decide(item.id, false);
  assert.equal(no.status, 200, JSON.stringify(no.data));
  assert.equal(no.data.item.status, 'rejected');
  const rejected = await X.payOf('huy');
  assert.equal(rejected.payDays['2026-10-19'].kind, 'unpaid');
  assert.equal(rejected.m.count, 0);
  assert.equal(rejected.m.unpaid, 1);
  assert.equal(rejected.m.trace.tienNgayCong, 0);
});

test('Check-out sớm không kèm lý do: 409 CHECKOUT_NEEDS_EXPLANATION, lượt vẫn đang mở; Huỷ hộp thì không chấm gì thêm', async () => {
  const opened = await pressIn('som', '2026-10-20T08:00:00');
  assert.equal(opened.status, 200, JSON.stringify(opened.data));
  const none = await pressOut('som', opened.data.open.id, '2026-10-20T16:25:00');
  assert.equal(none.status, 409);
  assert.equal(none.data.code, 'CHECKOUT_NEEDS_EXPLANATION');
  assert.equal(none.data.error, 'Cần giải trình: Về sớm 35 phút');
  assert.equal((await F.store.getSession(opened.data.open.id)).state, 'open');
  const { ApiError } = await web('services/http.js');
  const { explanationDemand, punchExplanationItem } = await web('builders/staff-requests/punch-explanation.js');
  const err = new ApiError(none.status, none.data.error, none.data);
  assert.equal(explanationDemand(err).side, 'out');
  const sent: any[] = [];
  const item = punchExplanationItem(err, text => sent.push(text), '2026-10-20');
  assert.equal(item.prompt, 'Cần giải trình: Về sớm 35 phút');
  assert.equal(item.date, '2026-10-20');
  assert.equal(sent.length, 0); // chưa gửi gì tới khi nhân viên bấm Gửi
  assert.equal(
    punchExplanationItem(new ApiError(409, 'x', { code: 'OTHER' }), () => {}),
    null
  );

  const ok = await pressOut('som', opened.data.open.id, '2026-10-20T16:25:00', { explanation: 'Đi khám bệnh' });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal((await F.store.getSession(opened.data.open.id)).state, 'closed');
  const mine = (await adminList()).items.filter(x => x.username === 'som');
  assert.deepEqual(
    mine.map(x => x.kind),
    ['punch-out']
  );
});

test('Lý do chỉ có khoảng trắng hoặc quá dài bị chặn ở giao diện đúng theo giới hạn máy chủ nhận; máy chủ cũng không nhận lý do rỗng', async () => {
  const { checkExplanationText, EXPLANATION_MAX } = await web('builders/staff-requests/punch-explanation.js');
  const { TEXT_MAX } = require('../../src/domain/explanation/explanation-service');
  assert.equal(EXPLANATION_MAX, TEXT_MAX);
  assert.ok(checkExplanationText('   ').error);
  assert.ok(checkExplanationText(undefined).error);
  assert.ok(checkExplanationText('a'.repeat(EXPLANATION_MAX + 1)).error);
  assert.deepEqual(checkExplanationText('  Kẹt xe  '), { text: 'Kẹt xe' });
  assert.deepEqual(checkExplanationText('a'.repeat(EXPLANATION_MAX)), { text: 'a'.repeat(EXPLANATION_MAX) });

  const blank = await pressIn('dung', '2026-10-21T08:40:00', { explanation: '   ' });
  assert.equal(blank.status, 409);
  const long = await pressIn('dung', '2026-10-21T08:40:00', { explanation: 'a'.repeat(TEXT_MAX + 1) });
  assert.ok(long.status >= 400);
  assert.equal((await F.store.listSessions({ username: 'dung' })).length, 0);
});

test('Số giải trình chờ Admin có mặt ở chuông và Tổng quan (dòng riêng, không chặn chốt công)', async () => {
  const { buildBell, buildOverview } = await web('builders/admin-main/overview.js');
  const bell = buildBell({ month: MONTH, alerts: { pendingApprovals: 2, missingPunches: [] }, explanations: 3 });
  assert.equal(bell.explanations, 3);
  assert.equal(bell.total, 5);
  const view = buildOverview({
    month: MONTH,
    serverNow: '2026-10-29T05:00:00.000Z',
    requests: [],
    explanations: 4,
    alerts: null,
    staff: [],
    holidays: []
  });
  const row = view.blockers.rows.find(r => r.key === 'explanations');
  assert.equal(row.count, 4);
  assert.equal(row.blocking, false);
  assert.equal(row.action.to, '/admin/yeu-cau?nhom=giai-trinh');
  assert.equal(view.blocking, 0);
});
