// OT ngày lễ của tính năng chờ duyệt (ApprovalView): làm ngày lễ là OT, khoản mang mục 'ot' (holiday: true) và dấu vân tay
// `holiday_work|…`; nhận diện, dấu vân tay, trạng thái hiệu lực, POLICY, tiền (bộ máy đang chạy).
// Chưa duyệt thì bỏ cả ngày theo hàng chính sách holiday_work; chức vụ không có quyền lợi OT (TTS) không có khoản này.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const ApprovalView = require('../../src/engine/approval-view');
const Engine = require('../../src/engine/payroll-engine');
const { DEFAULTS } = require('../../src/engine/payroll-params');

const calcMonth = (...args) => Engine.create(DEFAULTS).calcMonth(...args);
const { itemOf, fingerprint, effectiveStatus, payView, POLICY, ITEMS } = ApprovalView;

const close = (actual?, expected?) => assert.ok(Math.abs(actual - expected) < 1.5, `${actual} != ${expected}`); // tổng là cộng các dòng nguyên đồng
// Tháng 10/2026: 1/10 là Thứ 5. 20/10 Thứ 3, 17/10 Thứ 7, 18/10 Chủ nhật.
const TUE = '2026-10-20',
  SAT = '2026-10-17',
  SUN = '2026-10-18';
const WORK = { kind: 'work', in: '08:00', out: '17:00' };
const ctxOf = (date?, staffType = 'nv', holidays = [TUE, SAT, SUN]) => ({ date, holidays, staffType });
const NV_L1 = { type: 'nv', level: 1, nightPct: 40 };
const TTS_L1 = { type: 'tts', level: 1 };
const rowOf = (day?, ctx?, status?, more: any = {}) => ({
  fingerprint: itemOf(day, ctx).fingerprint,
  status,
  ...more
});

// ---------- nhận diện ----------
test('ITEMS có tám loại, willmakeup là loại thứ tám', () => {
  assert.deepEqual(
    [...ITEMS],
    ['isat', 'approved', 'makeup_day', 'ot', 'makeup_hours', 'holiday_work', 'leave', 'willmakeup']
  );
});
test('itemOf không có ctx: ngày đi làm vào ngày lễ vẫn không phải khoản cần duyệt (hành vi cũ)', () => {
  assert.equal(itemOf(WORK), null);
  assert.equal(itemOf(WORK, undefined), null);
  assert.equal(itemOf(WORK, {}), null);
  assert.equal(itemOf(WORK, { holidays: [TUE], staffType: 'nv' }), null, 'thiếu date');
  assert.equal(itemOf(WORK, { date: TUE, staffType: 'nv' }), null, 'thiếu holidays');
});
test('itemOf có ctx: đi làm đúng ngày lễ trong lịch là OT ngày lễ, dấu vân tay holiday_work|<vào>-<ra>', () => {
  assert.deepEqual(itemOf(WORK, ctxOf(TUE)), {
    item: 'ot',
    fingerprint: 'holiday_work|08:00-17:00',
    holiday: true
  });
  assert.equal(fingerprint(WORK, ctxOf(TUE)), 'holiday_work|08:00-17:00');
  assert.equal(fingerprint({ ...WORK, in: '09:00', out: '18:00' }, ctxOf(TUE)), 'holiday_work|09:00-18:00');
});
test('itemOf: ngày thường không nằm trong danh sách lễ thì không phải khoản cần duyệt', () => {
  assert.equal(itemOf(WORK, ctxOf('2026-10-21')), null);
  assert.equal(fingerprint(WORK, ctxOf('2026-10-21')), '');
  assert.equal(itemOf(WORK, ctxOf(TUE, 'nv', [])), null);
  assert.equal(itemOf(WORK, { date: TUE, holidays: new Set<any>(['2026-10-21']), staffType: 'nv' }), null);
});
test('itemOf: holidays nhận cả Set lẫn mảng', () => {
  assert.equal(itemOf(WORK, { date: TUE, holidays: new Set<any>([TUE]), staffType: 'nv' }).item, 'ot');
});
test('itemOf: ngày lễ rơi Chủ nhật không ai phải duyệt; Thứ 7 chỉ tính với CTV, NV; TTS không có khoản', () => {
  for (const type of ['tts', 'ctv', 'nv']) assert.equal(itemOf(WORK, ctxOf(SUN, type)), null, `${type} Chủ nhật`);
  assert.equal(itemOf(WORK, ctxOf(SAT, 'tts')), null);
  assert.equal(itemOf(WORK, ctxOf(SAT, 'ctv')).item, 'ot');
  assert.equal(itemOf(WORK, ctxOf(SAT, 'nv')).item, 'ot');
  assert.equal(itemOf(WORK, ctxOf(TUE, 'tts')), null, 'TTS không có quyền lợi OT nên không có khoản OT ngày lễ');
});
test('itemOf: loại nhân sự lạ hiểu như TTS (giống SCHED của máy chủ)', () => {
  assert.equal(itemOf(WORK, ctxOf(SAT, 'khac')), null);
  assert.equal(itemOf(WORK, ctxOf(TUE, undefined)).item, 'ot');
});
test('itemOf: ngày lễ mà không có giờ vào hoặc ra, hoặc không phải "đi làm", không phải khoản cần duyệt', () => {
  assert.equal(itemOf({ kind: 'work' }, ctxOf(TUE)), null);
  assert.equal(itemOf({ kind: 'work', in: '08:00' }, ctxOf(TUE)), null);
  assert.equal(itemOf({ kind: 'work', out: '17:00' }, ctxOf(TUE)), null);
  assert.equal(itemOf({ kind: 'unpaid' }, ctxOf(TUE)), null);
  assert.equal(
    itemOf({ kind: 'willmakeup', makeupPlans: [{ date: '2026-10-14', from: '08:00', to: '10:00' }] }, ctxOf(TUE)).item,
    'willmakeup'
  );
});
test('itemOf: iSAT, "Nghỉ được duyệt" và "Nghỉ phép năm" vào ngày lễ vẫn là khoản của chính chúng', () => {
  assert.equal(itemOf({ kind: 'isat' }, ctxOf(TUE)).item, 'isat');
  assert.equal(itemOf({ kind: 'approved' }, ctxOf(TUE)).item, 'approved');
  assert.equal(itemOf({ kind: 'leave' }, ctxOf(TUE)).item, 'leave');
});
test('itemOf: ngày khoá của Check-in/out (có src, attendanceConfirmed) không thuộc luồng này dù là ngày lễ', () => {
  assert.equal(itemOf({ ...WORK, src: 'admin' }, ctxOf(TUE)), null);
  assert.equal(itemOf({ ...WORK, attendanceConfirmed: true }, ctxOf(TUE)), null);
});
// Đoạn OT kèm trên ngày lễ vào dấu vân tay của khoản (một dòng duyệt mỗi ngày); làm bù thì không
test('itemOf: ngày lễ có kèm đoạn OT vẫn là một khoản OT ngày lễ, dấu vân tay mang đoạn OT; đoạn làm bù không vào', () => {
  const day = { ...WORK, extraKind: 'ot', extraOut: '19:00' };
  assert.deepEqual(itemOf(day, ctxOf(TUE)), {
    item: 'ot',
    fingerprint: 'holiday_work|08:00-17:00|ot||17:00-19:00',
    holiday: true
  });
  const makeup = { ...WORK, extraKind: 'makeup', extraOut: '19:00' };
  assert.deepEqual(itemOf(makeup, ctxOf(TUE)), {
    item: 'ot',
    fingerprint: 'holiday_work|08:00-17:00',
    holiday: true
  });
});
test('itemOf: ngày lễ thì đổi ca hay giờ nghỉ không đổi dấu vân tay, đổi giờ vào thì đổi', () => {
  const base = fingerprint(WORK, ctxOf(TUE));
  assert.equal(fingerprint({ ...WORK, shift: 'normal', preset: 'n1', breakMin: 15 }, ctxOf(TUE)), base);
  assert.notEqual(fingerprint({ ...WORK, in: '08:30' }, ctxOf(TUE)), base);
});

// ---------- trạng thái hiệu lực ----------
test('effectiveStatus có ctx: không có dòng hoặc lệch dấu vân tay là pending, đã duyệt đúng dấu vân tay mới approved', async () => {
  const ctx = ctxOf(TUE);
  assert.equal(effectiveStatus(WORK, null, ctx), 'pending');
  assert.equal(effectiveStatus(WORK, await rowOf(WORK, ctx, 'approved'), ctx), 'approved');
  assert.equal(effectiveStatus(WORK, await rowOf(WORK, ctx, 'rejected'), ctx), 'rejected');
  assert.equal(effectiveStatus({ ...WORK, out: '18:00' }, await rowOf(WORK, ctx, 'approved'), ctx), 'pending');
});
test('effectiveStatus không có ctx: ngày đi làm vào ngày lễ vẫn là null (hành vi cũ)', () => {
  assert.equal(effectiveStatus(WORK, { fingerprint: 'holiday_work|08:00-17:00', status: 'approved' }), null);
});

// ---------- POLICY ----------
test('POLICY: holiday_work chưa duyệt hoặc bị từ chối là drop (bỏ ngày khai); bị từ chối giống chờ duyệt', () => {
  for (const status of ['pending', 'rejected']) assert.equal(POLICY[status].holiday_work, 'drop', status);
  assert.deepEqual({ ...POLICY.rejected }, { ...POLICY.pending });
  assert.deepEqual([...ApprovalView.ALLOWED_ACTIONS.holiday_work], ['drop']);
});

// ---------- payView + calcMonth: tiền ----------
const hol = [TUE];
const payOf = (staff?, days?, approvals?, ctx?) => {
  const view = payView(days, approvals, undefined, ctx);
  return { view, month: calcMonth(staff, view.payDays, null, hol, '2026-10', null) };
};
test('NV L1 khai 08:00–17:00 ngày lễ: chờ duyệt trả 230.769 (lương nghỉ lễ), đã duyệt trả 1.101.923 (9 giờ OT ngày lễ không trừ nghỉ)', async () => {
  const days = { [TUE]: { ...WORK } };
  const ctx = { holidays: hol, staffType: 'nv' };
  const pending = await payOf(NV_L1, days, {}, ctx);
  assert.deepEqual(pending.view.pendingItems, [{ date: TUE, item: 'ot', status: 'pending' }]);
  assert.equal(pending.view.payDays[TUE], undefined, 'ngày khai bị bỏ');
  close(pending.month.total, 230769.23);
  const approved = await payOf(NV_L1, days, { [TUE]: await rowOf(days[TUE], ctxOf(TUE), 'approved') }, ctx);
  assert.deepEqual(approved.view.pendingItems, []);
  close(approved.month.total, 1101923.08);
  close(approved.month.holWorkPay, 778846.15);
  close(approved.month.holWorkHours, 9);
  assert.deepEqual(days[TUE], WORK, 'payView không sửa lịch đầu vào');
});
test('NV L1: bị từ chối tính tiền y hệt chờ duyệt (230.769), chỉ khác trạng thái trong pendingItems', async () => {
  const days = { [TUE]: { ...WORK } };
  const rejected = await payOf(
    NV_L1,
    days,
    { [TUE]: await rowOf(days[TUE], ctxOf(TUE), 'rejected', { note: 'Không có lệnh làm lễ' }) },
    { holidays: hol, staffType: 'nv' }
  );
  assert.deepEqual(rejected.view.pendingItems, [{ date: TUE, item: 'ot', status: 'rejected' }]);
  close(rejected.month.total, 230769.23);
});
test('CTV L1 giống NV: 230.769 khi chưa duyệt, 1.009.615 khi đã duyệt', async () => {
  const staff = { type: 'ctv', level: 1 };
  const days = { [TUE]: { ...WORK } };
  const ctx = { holidays: hol, staffType: 'ctv' };
  close((await payOf(staff, days, {}, ctx)).month.total, 230769.23);
  close(
    (await payOf(staff, days, { [TUE]: await rowOf(days[TUE], ctxOf(TUE, 'ctv'), 'approved') }, ctx)).month.total,
    1009615.38
  );
});
test('TTS L1: không có quyền lợi OT nên không có khoản chờ duyệt, ngày lễ không trả đồng nào dù khai hay đã duyệt', async () => {
  const days = { [TUE]: { ...WORK } };
  const ctx = { holidays: hol, staffType: 'tts' };
  const none = await payOf(TTS_L1, days, {}, ctx);
  assert.deepEqual(none.view.pendingItems, []);
  close(none.month.total, 0);
  close(none.month.holWorkPay, 0);
  close((await payOf(TTS_L1, days, { [TUE]: { item: 'ot', status: 'approved' } }, ctx)).month.total, 0);
});
test('duyệt xong rồi sửa giờ thì dòng cũ lệch dấu vân tay: về chờ duyệt, tiền về 230.769', async () => {
  const approvedDay = { ...WORK };
  const row = await rowOf(approvedDay, ctxOf(TUE), 'approved');
  const edited = { [TUE]: { ...WORK, out: '18:00' } };
  const result = await payOf(NV_L1, edited, { [TUE]: row }, { holidays: hol, staffType: 'nv' });
  assert.deepEqual(result.view.pendingItems, [{ date: TUE, item: 'ot', status: 'pending' }]);
  close(result.month.total, 230769.23);
});
test('payView không có ctx: ngày lễ đi làm vẫn trả 1.101.923, không có khoản chờ duyệt', () => {
  const view = payView({ [TUE]: { ...WORK } }, {});
  assert.deepEqual(view.pendingItems, []);
  close(calcMonth(NV_L1, view.payDays, null, hol, '2026-10', null).total, 1101923.08);
});
test('payView có ctx: ngày thường, các khoản khác trong tháng giữ nguyên cách xử lý', () => {
  const days = {
    '2026-10-21': { ...WORK },
    '2026-10-22': { ...WORK, extraKind: 'ot', extraOut: '19:00' },
    [TUE]: { ...WORK },
    '2026-10-23': { kind: 'isat' }
  };
  const view = payView(days, {}, undefined, { holidays: hol, staffType: 'nv' });
  assert.deepEqual(
    view.pendingItems.map(x => `${x.date}:${x.item}`),
    [`${TUE}:ot`, '2026-10-22:ot', '2026-10-23:isat']
  );
  assert.deepEqual(view.payDays['2026-10-21'], WORK);
  assert.equal(view.payDays['2026-10-22'].extraKind, undefined);
  assert.deepEqual(view.payDays['2026-10-23'], { kind: 'unpaid' });
});

// ---------- payView không có ctx: lưới an toàn theo dòng duyệt của máy chủ ----------
test('payView không có ctx nhưng có dòng holiday_work chờ duyệt: bỏ ngày khai, calcMonth trả 230.769', () => {
  const days = { [TUE]: { ...WORK } };
  const view = payView(days, { [TUE]: { item: 'holiday_work', status: 'pending' } });
  assert.deepEqual(view.pendingItems, [{ date: TUE, item: 'ot', status: 'pending' }]);
  assert.equal(view.payDays[TUE], undefined, 'ngày khai bị bỏ');
  close(calcMonth(NV_L1, view.payDays, null, hol, '2026-10', null).total, 230769.23);
  assert.deepEqual(days[TUE], WORK, 'payView không sửa lịch đầu vào');
});
test('payView không có ctx, dòng holiday_work đã duyệt: trả đủ 1.101.923, không có khoản chờ', () => {
  const view = payView({ [TUE]: { ...WORK } }, { [TUE]: { item: 'holiday_work', status: 'approved' } });
  assert.deepEqual(view.pendingItems, []);
  close(calcMonth(NV_L1, view.payDays, null, hol, '2026-10', null).total, 1101923.08);
});
test('payView không có ctx: dòng bị từ chối tính như chờ duyệt (230.769), pendingItems ghi rejected', () => {
  const view = payView({ [TUE]: { ...WORK } }, { [TUE]: { item: 'holiday_work', status: 'rejected' } });
  assert.deepEqual(view.pendingItems, [{ date: TUE, item: 'ot', status: 'rejected' }]);
  close(calcMonth(NV_L1, view.payDays, null, hol, '2026-10', null).total, 230769.23);
});
test('payView không có ctx: trạng thái lạ, thiếu status hay dòng hỏng đều không tạo tiền (coi là chờ duyệt)', () => {
  for (const row of [
    { item: 'holiday_work' },
    { item: 'holiday_work', status: 'APPROVED' },
    { item: 'holiday_work', status: true },
    { item: 'holiday_work', status: 'approved', fingerprint: 'holiday_work|09:00-18:00' }, // lệch giờ khai hiện tại
    { item: 'holiday_work', status: 'approved', fingerprint: 'ot|-|08:00-19:00' }
  ]) {
    const view = payView({ [TUE]: { ...WORK } }, { [TUE]: row });
    assert.equal(view.payDays[TUE], undefined, JSON.stringify(row));
    assert.equal(view.pendingItems.length, 1, JSON.stringify(row));
  }
});
test('payView không có ctx: dòng đã duyệt kèm dấu vân tay khớp giờ khai thì được trả; giờ khai đổi sau khi duyệt thì không', () => {
  const row = { item: 'holiday_work', status: 'approved', fingerprint: 'holiday_work|08:00-17:00' };
  assert.ok(payView({ [TUE]: { ...WORK } }, { [TUE]: row }).payDays[TUE]);
  assert.equal(payView({ [TUE]: { ...WORK, out: '18:00' } }, { [TUE]: row }).payDays[TUE], undefined);
});
test('payView không có ctx: dòng duyệt không áp lên ngày không phải đi làm, lên ngày của người khác hay loại khoản lạ', () => {
  // ngày đã đổi thành nghỉ không lương hoặc thiếu giờ ra: không còn là ngày lễ đi làm, giữ nguyên
  for (const day of [{ kind: 'unpaid' }, { kind: 'work', in: '08:00' }, { ...WORK, src: 'admin' }]) {
    const view = payView({ [TUE]: day }, { [TUE]: { item: 'holiday_work', status: 'pending' } });
    assert.deepEqual(view.payDays[TUE], day);
    assert.deepEqual(view.pendingItems, []);
  }
  // loại khoản không có trong ITEMS: bỏ qua
  const odd = payView({ [TUE]: { ...WORK } }, { [TUE]: { item: 'bonus', status: 'pending' } });
  assert.deepEqual(odd.payDays[TUE], WORK);
});
test('payView có ctx đầy đủ: ctx quyết định, dòng cũ của ngày không còn là ngày lễ không làm mất lương ngày thường', () => {
  // ngày lễ đã bị Admin bỏ khỏi danh sách: dòng holiday_work cũ không được cắt ngày làm bình thường
  const view = payView(
    { [TUE]: { ...WORK } },
    { [TUE]: { item: 'holiday_work', status: 'pending', fingerprint: 'holiday_work|08:00-17:00' } },
    undefined,
    { holidays: [], staffType: 'nv' }
  );
  assert.deepEqual(view.payDays[TUE], WORK);
  assert.deepEqual(view.pendingItems, []);
});
test('payView: ctx thiếu holidays thì như không có ctx, vẫn theo dòng duyệt', () => {
  const view = payView({ [TUE]: { ...WORK } }, { [TUE]: { item: 'holiday_work', status: 'pending' } }, undefined, {
    staffType: 'nv'
  });
  assert.equal(view.payDays[TUE], undefined);
});
