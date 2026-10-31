'use strict';
// OT ngày lễ khi khai lịch: OT trên ngày "Đi làm ngày lễ" lưu được, không có câu "không được tính tiền (0 ₫)";
// đoạn OT tràn qua 0 giờ sang ngày thường chỉ được báo (không chặn) rằng phần đó tính như OT thường. Làm bù ngày lễ chặn 400.
// Chỉ người bịa (qa_*) và DB trong bộ nhớ; đồng hồ giả.
const P = require('../helpers/period-api');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { F, store } = P;
const M = '2026-10';
const HOL = '2026-10-20'; // Thứ Ba
const dm = d => `${d.slice(8)}/${d.slice(5, 7)}`;

before(F.start);
after(F.stop);

function setup() {
  F.reset();
  P.revokeAllRoles();
  F.at('2026-10-02T09:00:00');
  store.setSetting('holidays', [HOL]);
  F.person('admin', 'admin', { type: 'tts', level: 0, shiftCode: null, startDate: null });
  F.person('qa_day', 'staff', { type: 'nv', level: 1, shiftCode: 'n1', startDate: '2026-01-05', leaveAdjust: 30 });
  F.person('qa_night', 'staff', { type: 'nv', level: 1, shiftCode: 'g2', startDate: '2026-01-05', leaveAdjust: 30 });
}
const put = (who, days) => F.call('PUT', '/sheet', { who, body: { month: M, days } });
const warnings = res => res.data.warnings || [];
const holidayOt = { kind: 'work', in: '08:00', out: '17:00', extraKind: 'ot', extraOut: '20:00' };

test(`OT 17:00–20:00 trên ngày đi làm ngày lễ ${dm(HOL)}: lưu 200, không có câu "0 ₫" hay cảnh báo OT ngày lễ`, async () => {
  setup();
  const res = await put('qa_day', { [HOL]: holidayOt });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  const ws = warnings(res);
  assert.ok(!ws.some(w => /0 ₫/.test(w.message)), JSON.stringify(ws));
  assert.ok(!ws.some(w => w.code === 'SHEET_EXTRA_ON_HOLIDAY'), JSON.stringify(ws));
  const saved = store.getSheet('qa_day', M).days[HOL];
  assert.equal(saved.extraKind, 'ot');
  assert.equal(saved.extraOut, '20:00');
});

test(`ca đêm ngày lễ có OT sau 0 giờ: lưu 200, chỉ báo phần sang ngày thường tính như OT thường`, async () => {
  setup();
  const res = await put('qa_night', {
    [HOL]: { kind: 'work', in: '22:00', out: '07:00', extraKind: 'ot', extraOut: '09:00' }
  });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  const w = warnings(res).find(x => x.code === 'SHEET_EXTRA_ON_HOLIDAY');
  assert.ok(w, JSON.stringify(warnings(res)));
  assert.equal(
    w.message,
    `Ngày ${dm(HOL)} là ngày lễ: giờ OT nằm trong ngày ${dm(HOL)} tính giá OT ngày lễ, giờ OT sang ngày 21/10 (ngày thường) tính như OT thường, sau khi Admin duyệt.`
  );
  assert.ok(!/0 ₫/.test(w.message));
});

test(`làm bù vào ngày lễ vẫn bị chặn 400 SHEET_MAKEUP_ON_HOLIDAY, không lưu gì`, async () => {
  setup();
  const want = `Ngày ${dm(HOL)} là ngày lễ: không khai làm bù vào ngày lễ.`;
  for (const days of [
    { [HOL]: { kind: 'work', in: '08:00', out: '17:00', extraKind: 'makeup', extraOut: '19:00' } },
    { '2026-10-19': { kind: 'willmakeup', makeupPlans: [{ date: HOL, from: '08:00', to: '12:00' }] } }
  ]) {
    const res = await put('qa_day', days);
    assert.equal(res.status, 400, JSON.stringify(res.data));
    assert.equal(res.data.code, 'SHEET_MAKEUP_ON_HOLIDAY');
    assert.equal(res.data.error, want);
  }
  assert.deepEqual(store.getSheet('qa_day', M).days, {});
});

// Màn nhân viên (public/nhan-vien/logic.js → dayPlan): ngày lễ trong lịch có mục OT (khung giờ từ – đến), không có làm bù và các loại nghỉ (gợi ý của chúng nói trừ phép,
// không lương, nợ giờ trong khi bộ máy trả lương ngày lễ); câu gợi ý "Đi làm ngày lễ" nói đúng luật vắng
test('dayPlan ngày lễ trong lịch: chỉ Nghỉ lễ / OT (giờ từ – đến của ngày), không có ô làm thêm riêng ; ngày thường không đổi', () => {
  const L = require('../../public/nhan-vien/logic.js');
  const me = { username: 'qa_day', type: 'nv', level: 1 };
  for (const warn of [true, false]) {
    const plan = L.dayPlan({ me, date: HOL, holidays: [HOL], warn });
    const values = plan.kinds.map(k => k.value);
    for (const kind of ['makeup', 'leave', 'unpaid', 'willmakeup'])
      assert.ok(!values.includes(kind), `${warn} ${kind}`);
    assert.deepEqual(plan.extraKinds, [], 'giờ OT ngày lễ là khung từ – đến của chính ngày');
    const work = plan.kinds.find(k => k.value === 'work');
    assert.equal(work.label, 'OT');
    assert.match(work.hint, /Không Check-in\/out hôm đó sẽ tính vắng, mất lương ngày lễ\./);
  }
  // Ngày đã khai từ trước vẫn hiện để xem và sửa
  const kept = L.dayPlan({ me, date: HOL, holidays: [HOL], warn: true, existingKind: 'leave' });
  assert.ok(kept.kinds.some(k => k.value === 'leave'));
  const normal = L.dayPlan({ me, date: '2026-10-21', holidays: [HOL], warn: true });
  for (const kind of ['work', 'leave', 'unpaid', 'willmakeup'])
    assert.ok(
      normal.kinds.some(k => k.value === kind),
      kind
    );
  assert.ok(!normal.kinds.some(k => k.value === 'makeup'), 'không còn loại ngày Làm bù cả ngày');
  assert.deepEqual(normal.extraKinds, ['ot', 'makeup']);
});
