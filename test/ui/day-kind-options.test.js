'use strict';
// Danh sách loại ngày của màn nhân viên (logic.js → dayPlan) và hộp khai thay của Admin (cham-cong-khai.js → planOf) không có loại
// "Làm bù cả ngày" (kind 'makeup'); ngày đã lưu loại này chỉ còn hiện để xem và gửi lại đúng giờ cũ.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const L = require('../../public/nhan-vien/logic.js');

const MONTH = '2026-10';
const WED = '2026-10-07'; // ngày trong lịch của mọi chức vụ
const SAT = '2026-10-10'; // ngoài lịch của TTS (T2–T6)
const HOL = '2026-10-14'; // ngày lễ giả định trong lịch
const HOLIDAYS = [HOL];
const kindsOf = plan => plan.kinds.map(k => k.value);

test('Màn nhân viên: dayPlan không đưa loại makeup ở ngày trong lịch, ngoài lịch, ngày lễ', () => {
  for (const type of ['tts', 'ctv', 'nv'])
    for (const date of [WED, SAT, HOL]) {
      const plan = L.dayPlan({ me: { type }, date, holidays: HOLIDAYS, actualFrom: `${MONTH}-01` });
      assert.ok(!kindsOf(plan).includes('makeup'), `${type} ${date}: ${kindsOf(plan)}`);
    }
});
test('Màn nhân viên: giờ làm bù chọn được ở ngày đi làm, không có ở ngày lễ', () => {
  const work = L.dayPlan({ me: { type: 'tts' }, date: WED, holidays: HOLIDAYS });
  assert.ok(work.extraKinds.includes('makeup'), 'giờ làm bù trước / sau ca vẫn có');
  assert.ok(!L.dayPlan({ me: { type: 'nv' }, date: HOL, holidays: HOLIDAYS }).extraKinds.includes('makeup'));
});
test('Màn nhân viên: ngày đã lưu loại makeup vẫn hiện với nhãn loại cũ, gửi lại đúng giờ đã lưu và không bị kiểm như ngày đi làm', () => {
  const plan = L.dayPlan({ me: { type: 'tts' }, date: SAT, holidays: HOLIDAYS, existingKind: 'makeup' });
  const legacy = plan.kinds.find(k => k.value === 'makeup');
  assert.ok(legacy, 'loại đã lưu vẫn có trong danh sách');
  assert.match(legacy.label, /loại cũ/);
  assert.match(legacy.hint, /không tính lương/);
  const day = { kind: 'makeup', in: '08:00', out: '17:00' };
  const form = L.formFromDay({ me: { type: 'tts' }, date: SAT, day, plan, want: '' });
  const sent = L.dayFromForm(form);
  assert.equal(sent.kind, 'makeup');
  assert.equal(sent.in, '08:00');
  assert.equal(sent.out, '17:00');
  assert.ok(!sent.extraKind && !sent.extraIn && !sent.extraOut);
  assert.equal(L.checkDayForm(form, HOLIDAYS), '');
  assert.match(L.KIND_LABEL.makeup, /loại cũ/);
});

function loadAdmin() {
  const A = {
    esc: s => String(s),
    S: { month: MONTH, me: { username: 'qa_admin' } },
    actions: {},
    meInfo: { holidays: HOLIDAYS },
    fmtDM: ymd => `${ymd.slice(8)}/${ymd.slice(5, 7)}`,
    dowOf: ymd => new Date(`${ymd}T00:00:00Z`).getUTCDay(),
    holidaySet: () => new Set(HOLIDAYS),
    positions: { flag: (type, name, fallback) => fallback }
  };
  const window = { Admin: A, ApprovalView: {}, PayrollParams: { DEFAULTS: {} } };
  const file = path.join(__dirname, '..', '..', 'public', 'admin', 'cham-cong-khai.js');
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { window, document: {}, console });
  return A.CcKhai;
}
const sheetFor = dates => ({ scheduledDates: dates });

test('Khai thay của Admin: planOf không đưa loại makeup', () => {
  const khai = loadAdmin();
  for (const date of [WED, SAT, HOL]) {
    const plan = khai.planOf({
      type: 'tts',
      name: 'Người A',
      date,
      month: MONTH,
      sheet: sheetFor([WED, HOL]),
      holidays: new Set(HOLIDAYS),
      actualFrom: `${MONTH}-01`,
      existingKind: ''
    });
    assert.ok(!kindsOf(plan).includes('makeup'), `${date}: ${kindsOf(plan)}`);
  }
});
test('Khai thay của Admin: ngày đã lưu loại makeup hiện nhãn loại cũ, ký hiệu "cũ", gửi lại đúng giờ đã lưu', () => {
  const khai = loadAdmin();
  const plan = khai.planOf({
    type: 'tts',
    name: 'Người A',
    date: SAT,
    month: MONTH,
    sheet: sheetFor([WED]),
    holidays: new Set(HOLIDAYS),
    actualFrom: `${MONTH}-01`,
    existingKind: 'makeup'
  });
  const legacy = plan.kinds.find(k => k.value === 'makeup');
  assert.ok(legacy);
  assert.match(legacy.label, /loại cũ/);
  const form = { date: SAT, kind: 'makeup', in: '08:00', out: '17:00', breakMin: 0, extraKind: '' };
  assert.deepEqual(JSON.parse(JSON.stringify(khai.dayFromForm(form))), {
    kind: 'makeup',
    in: '08:00',
    out: '17:00',
    breakMin: 0
  });
  assert.equal(khai.checkDayForm(form), '');
  khai.index({
    month: MONTH,
    rows: [{ username: 'u1', days: { [SAT]: { kind: 'makeup', in: '08:00', out: '17:00' } } }]
  });
  const mark = khai.mark('u1', SAT);
  assert.equal(mark.key, 'makeup');
  assert.match(mark.text, /loại cũ, không tính/);
  assert.match(mark.html, />cũ</);
});
