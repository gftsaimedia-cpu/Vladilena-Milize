'use strict';
// Hai chỗ cảnh báo không được ném TypeError (500): phải ra kết quả bình thường hoặc 4xx có lời báo.
//   1. src/domain/kpi.js → cleanKpiAmt: người không có mức KPI (TTS, bậc không có khoá level.<loại>.<bậc>.kpi) không làm câu cảnh báo KPI_OVER_CAP gọi max.toLocaleString trên giá trị rỗng.
//   2. src/domain/ot.ts → validateOtDeclaration: lượt không có ca đối chiếu (plannedShift rỗng, ví dụ lượt ngoài ca) không đọc plan.in.
// Chỉ người bịa (qa_*) và DB trong bộ nhớ.
const K = require('../helpers/warning-cases');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { S } = K;
const { F, store } = S;
const monthOf = S.monthPool();

before(F.start);
after(F.stop);

{
  test(`cleanKpiAmt: TTS khai kpiAmt trong lịch ước tính — người không có mức KPI nên không bị kiểm trần; 200, không phải 500`, async () => {
    const M = monthOf();
    await S.seed(M);
    const date = S.firstDow(M, 1);
    const res = await F.call('PUT', '/sheet', {
      who: 'qa_tts1',
      body: { month: M, days: { [date]: { kind: 'work', in: '08:00', out: '17:00' } }, kpiAmt: 5000000 }
    });
    assert.equal(res.status, 200, `${JSON.stringify(res.data)}`);
    assert.equal((await store.getSheet('qa_tts1', M)).days[date].kind, 'work');
  });

  test(`validateOtDeclaration: khai OT cho lượt đã đóng nhưng không có ca đối chiếu — 400 có lời báo, không phải 500; không lưu gì`, async () => {
    const M = monthOf();
    await S.seed(M);
    const date = S.firstDow(M, 2);
    const session = await store.createSession('qa_tts1', date, 'closed', {
      kind: 'pending',
      reason: 'off-shift',
      outsideShift: true,
      presIn: new Date(`${date}T20:00:00+07:00`).toISOString(),
      presOut: new Date(`${date}T22:00:00+07:00`).toISOString()
    });
    const before = await F.snapshot();
    const res = await F.call('POST', '/ot', {
      body: { sessionId: session.id, version: session.version, extraOut: '18:00', reason: 'Khai OT cho lượt ngoài ca' }
    });
    assert.ok(
      res.status >= 400 && res.status < 500,
      `phải là lỗi 4xx có lời báo, nhận ${res.status} ${JSON.stringify(res.data)}`
    );
    assert.ok(res.data.error, `có lời báo lỗi`);
    assert.deepEqual(F.changedTables(before, await F.snapshot()), [], `không lưu gì`);
  });
}
