'use strict';
// Giải trình ngày quên chấm được duyệt trên ngày đã khai nghỉ cả ngày (iSAT, nghỉ phép năm, nghỉ không lương): cùng ngày mà Check-in đã bị chặn,
// nên duyệt chỉ lưu quyết định, không ghi lượt Admin theo giờ ca, ngày vẫn là ngày nghỉ đã khai; kèm cảnh báo EXPLANATION_NOT_RECORDED.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
require('../helpers/require-isolated-database');
const F = require('../helpers/api-fixture');
const X = require('../helpers/explanation-flow');
const { ADMIN_ORIGIN } = require('../../src/domain/attendance/attendance-sessions');

const adminRows = async (username?, date?) =>
  (await X.sessionsOn(username, date)).filter(s => s.entry.origin === ADMIN_ORIGIN);

before(async () => {
  await F.start();
  await F.at('2026-10-29T12:00:00');
  for (const name of ['isat', 'phep', 'khongluong']) await F.person(name);
  await F.person('admin', 'admin');
});
after(() => F.stop());

const CASES: any[] = [
  ['isat', '2026-10-24', { kind: 'isat' }], // thứ Bảy: isat.weekday
  ['phep', '2026-10-21', { kind: 'leave' }],
  ['khongluong', '2026-10-22', { kind: 'unpaid' }]
];
for (const [who, date, day] of CASES)
  test(`Ngày đã khai ${day.kind}: duyệt giải trình không ghi lượt Admin, có cảnh báo, ngày không thành ngày công`, async () => {
    await F.store.setSheet(who, '2026-10', { [date]: day });
    const item = await X.askAndAnswer(who, date);
    const res = await X.decide(item.id, true);
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.equal(res.data.item.status, 'approved');
    assert.equal(res.data.recorded, false);
    assert.deepEqual(
      (res.data.warnings || []).map(w => w.code),
      ['EXPLANATION_NOT_RECORDED']
    );
    assert.match(res.data.warnings[0].message, /ngày đã khai là ngày nghỉ/);
    assert.equal((await adminRows(who, date)).length, 0);
    assert.notEqual((await X.payOf(who)).payDays[date].kind, 'work');
  });
