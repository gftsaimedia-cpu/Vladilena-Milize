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
const dm = (d?) => `${d.slice(8)}/${d.slice(5, 7)}`;

before(F.start);
after(F.stop);

async function setup() {
  await F.reset();
  await P.revokeAllRoles();
  await F.at('2026-10-02T09:00:00');
  await store.setSetting('holidays', [HOL]);
  await F.person('admin', 'admin', { type: 'tts', level: 0, shiftCode: null, startDate: null });
  await F.person('qa_day', 'staff', {
    type: 'nv',
    level: 1,
    shiftCode: 'n1',
    startDate: '2026-01-05',
    leaveAdjust: 30
  });
  await F.person('qa_night', 'staff', {
    type: 'nv',
    level: 1,
    shiftCode: 'g2',
    startDate: '2026-01-05',
    leaveAdjust: 30
  });
}
const put = (who?, days?) => F.call('PUT', '/sheet', { who, body: { month: M, days } });
const warnings = (res?) => res.data.warnings || [];
const holidayOt = { kind: 'work', in: '08:00', out: '17:00', extraKind: 'ot', extraOut: '20:00' };

test(`OT 17:00–20:00 trên ngày đi làm ngày lễ ${dm(HOL)}: lưu 200, không có câu "0 ₫" hay cảnh báo OT ngày lễ`, async () => {
  await setup();
  const res = await put('qa_day', { [HOL]: holidayOt });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  const ws = warnings(res);
  assert.ok(!ws.some(w => /0 ₫/.test(w.message)), JSON.stringify(ws));
  assert.ok(!ws.some(w => w.code === 'SHEET_EXTRA_ON_HOLIDAY'), JSON.stringify(ws));
  const saved = (await store.getSheet('qa_day', M)).days[HOL];
  assert.equal(saved.extraKind, 'ot');
  assert.equal(saved.extraOut, '20:00');
});

test(`ca đêm ngày lễ có OT sau 0 giờ: lưu 200, chỉ báo phần sang ngày thường tính như OT thường`, async () => {
  await setup();
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
  await setup();
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
  assert.deepEqual((await store.getSheet('qa_day', M)).days, {});
});
