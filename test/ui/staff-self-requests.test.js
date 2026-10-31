'use strict';
// Màn nhân viên tự dùng: không có nút "Khai ngày này" (ngày làm việc theo lịch được gán), biểu mẫu Yêu cầu không có mục "Đi làm" thường
// nhưng vẫn có các loại nghỉ và OT / làm bù theo giờ (ngày lễ: test/ui/staff-holiday-ot-request.test.js). Chế độ khai thay của Admin giữ đủ.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const L = require('../../public/nhan-vien/logic.js');

const WED = '2026-11-04'; // trong lịch nv (T2–T7)
const SUN = '2026-11-08';
const HOL = '2026-11-11'; // ngày lễ giả định trong lịch
const HOLIDAYS = [HOL];
const me = { type: 'nv', shiftCode: 'n1' };
const labels = plan => plan.kinds.map(k => k.label);
const values = plan => plan.kinds.map(k => k.value);

function loadKhai(thay) {
  const NV = {
    esc: s => String(s),
    ic: () => '',
    S: { me, holidays: HOLIDAYS, actualFrom: '2026-11-01', month: '2026-11' },
    L,
    actions: {},
    thay,
    planCtx: () => ({ forName: thay ? thay.name : '', requestOnly: !thay })
  };
  const document = { addEventListener() {}, getElementById: () => null };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../public/nhan-vien/khai.js'), 'utf8'), {
    window: { NV },
    document,
    console
  });
  return NV;
}

test('staff self mode renders no "Khai ngày" button; Admin on-behalf mode still does', () => {
  const self = loadKhai(null);
  for (const variant of ['is-pri', 'is-outline', 'sm'])
    assert.equal(self.khaiAction('2026-11', WED, null, variant), '');
  const thay = loadKhai({ name: 'Người A' });
  assert.match(thay.khaiAction('2026-11', WED, null, 'is-pri'), /Khai ngày này/);
  assert.match(thay.khaiAction('2026-11', WED, { kind: 'leave' }, 'sm'), /Sửa khai báo ngày này/);
});

test('day sheet, day box and Hôm nay card all go through NV.khaiAction (one switch for the button)', () => {
  const parts = fs.readFileSync(path.join(__dirname, '../../public/nhan-vien/parts.js'), 'utf8');
  assert.equal((parts.match(/NV\.khaiAction\(/g) || []).length, 3);
  assert.ok(!/data-act="khai"/.test(parts), 'parts.js không tự dựng nút khai');
});

test('self request form has no plain "Đi làm" but still offers leave kinds and OT / make-up hours', () => {
  const plan = L.dayPlan({ me, date: WED, holidays: HOLIDAYS, actualFrom: '2026-11-01', requestOnly: true });
  assert.ok(!labels(plan).includes('Đi làm'), labels(plan).join());
  for (const kind of ['leave', 'unpaid', 'willmakeup']) assert.ok(values(plan).includes(kind), kind);
  const extra = plan.kinds.find(k => k.value === 'work');
  assert.ok(extra, 'mục OT / làm bù theo giờ vẫn có');
  assert.match(extra.label, /OT/);
  assert.equal(plan.extraOnly, true);
});

test('self OT request still builds a work day with extra hours that needs approval', () => {
  const plan = L.dayPlan({ me, date: WED, holidays: HOLIDAYS, actualFrom: '2026-11-01', requestOnly: true });
  const form = L.formFromDay({ me, date: WED, day: null, plan, want: 'extra' });
  assert.equal(form.kind, 'work');
  assert.equal(form.extraKind, 'ot');
  form.extraOut = '19:00';
  assert.equal(L.checkDayForm(form, HOLIDAYS), '');
  const day = L.dayFromForm(form);
  assert.equal(day.kind, 'work');
  assert.equal(day.extraKind, 'ot');
  assert.equal(day.extraOut, '19:00');
  assert.equal(L.approvalOfForm(form, { me, holidays: HOLIDAYS }).item, 'ot');
  // Mở chung (nút "Yêu cầu khác"): chọn sẵn một loại nghỉ, không chọn sẵn mục làm thêm
  assert.notEqual(L.formFromDay({ me, date: WED, day: null, plan, want: '' }).kind, 'work');
  // Ngày đi làm đã khai từ trước không kèm làm thêm: mở lại thì mục làm thêm có loại sẵn, không gửi lại ngày đi làm thường
  assert.equal(
    L.formFromDay({ me, date: WED, day: { kind: 'work', in: '08:00', out: '17:00' }, plan }).extraKind,
    'ot'
  );
});

test('punchView carries the server reason when Check-in is not allowed, and drops it while a session is open', () => {
  const reason = 'Hôm nay bạn không có lịch làm việc hay giờ OT/làm bù được duyệt nên không Check-in được.';
  const nowIso = '2026-11-08T01:00:00.000Z';
  const pv = L.punchView({ me, punch: { canCheckIn: false, checkInBlock: reason }, nowIso });
  assert.equal(pv.blocked, reason);
  assert.equal(L.punchView({ me, punch: { canCheckIn: true }, nowIso }).blocked, undefined);
  const open = { id: 1, date: SUN, entry: { presIn: nowIso } };
  assert.equal(L.punchView({ me, punch: { openSession: open, checkInBlock: reason }, nowIso }).blocked, undefined);
});
