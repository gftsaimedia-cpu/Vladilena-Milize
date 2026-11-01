'use strict';
// Khai làm bù: chặn làm bù ngày lễ, câu lỗi rõ khi giờ làm bù trùng giờ ca hoặc nhập nhầm phía,
// cảnh báo giờ khai rộng hơn ca, câu cảnh báo khung đêm khi Admin khai thay.
// Chỉ người bịa (qa_*) và DB trong bộ nhớ; đồng hồ giả.
const P = require('../helpers/period-api');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { F, store } = P;
const M = '2026-11';
const [MON1, MON2, MON3] = P.dowDates(M, 1);
const dm = (d?) => `${d.slice(8)}/${d.slice(5, 7)}`;

before(F.start);
after(F.stop);

async function setup() {
  await F.reset();
  await P.revokeAllRoles();
  await F.at('2026-11-02T09:00:00');
  await store.setSetting('holidays', [MON2]);
  await F.person('admin', 'admin', { type: 'tts', level: 0, shiftCode: null, startDate: null });
  await F.person('qa_night', 'staff', {
    type: 'nv',
    level: 1,
    shiftCode: 'g2',
    startDate: '2026-01-05',
    leaveAdjust: 30
  });
  await F.person('qa_day', 'staff', {
    type: 'nv',
    level: 1,
    shiftCode: 'n1',
    startDate: '2026-01-05',
    leaveAdjust: 30
  });
}
const put = async (who?, days?, extra: any = {}) =>
  await F.call('PUT', '/sheet', { who, body: { month: M, days, ...extra } });
const codes = (res?) => (res.data.warnings || []).map(w => w.code);
const night = { kind: 'work', in: '22:00', out: '07:00' };

test(`D3: làm bù vào ngày lễ bị chặn 400 ở mọi dạng, câu nêu dd/mm, không lưu gì`, async () => {
  await setup();
  const want = `Ngày ${dm(MON2)} là ngày lễ: không khai làm bù vào ngày lễ.`;
  const cases = [
    { [MON2]: { kind: 'work', in: '08:00', out: '17:00', extraKind: 'makeup', extraOut: '19:00' } },
    { [MON1]: { kind: 'willmakeup', makeupPlans: [{ date: MON2, from: '08:00', to: '12:00' }] } }
  ];
  for (const days of cases) {
    const res = await put('qa_day', days);
    assert.equal(res.status, 400, JSON.stringify(res.data));
    assert.equal(res.data.error, want);
    assert.equal(res.data.code, 'SHEET_MAKEUP_ON_HOLIDAY');
  }
  assert.deepEqual((await store.getSheet('qa_day', M)).days, {});
  // ngày làm bù dự kiến không phải ngày lễ vẫn lưu được
  const ok = await put('qa_day', {
    [MON1]: { kind: 'willmakeup', makeupPlans: [{ date: MON3, from: '08:00', to: '12:00' }] }
  });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
});

test('giờ làm bù trùng giờ vào / ra của ca đang chọn (giữ "Giờ đã lưu" 20:00–09:00): câu lỗi nói đúng chuyện trùng, ngày dd/mm', async () => {
  await setup();
  const res = await put('qa_night', {
    [MON1]: { kind: 'work', in: '20:00', out: '09:00', extraKind: 'makeup', extraIn: '20:00', extraOut: '09:00' }
  });
  assert.equal(res.status, 400);
  assert.equal(
    res.data.error,
    `Ngày ${dm(MON1)}: giờ làm bù trùng giờ ca đang chọn. Chọn ca được gán rồi nhập giờ trước/sau ca.`
  );
  // theo ca được gán 22:00–07:00 thì 20:00 trước ca và 09:00 sau ca lưu được
  const ok = await put('qa_night', { [MON1]: { ...night, extraKind: 'makeup', extraIn: '20:00', extraOut: '09:00' } });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.ok(!(await codes(ok)).includes('SHEET_EXTRA_NIGHT'), JSON.stringify(ok.data.warnings));
});

test('nhập giờ bắt đầu / kết thúc của MỘT đoạn (07:00, 09:00 sau ca 22:00–07:00): lỗi EXTRA_WRONG_SIDE, không phải trần 12 giờ', async () => {
  await setup();
  for (const [extraIn, extraOut] of [
    ['07:00', '09:00'], // đoạn sau ca nhập vào cả hai ô
    ['23:00', ''], // giờ bắt đầu nằm trong ca
    ['20:00', '21:00'], // đoạn trước ca nhập vào cả hai ô
    ['', '03:00'] // giờ kết thúc nằm trong ca
  ]) {
    const res = await put('qa_night', { [MON1]: { ...night, extraKind: 'makeup', extraIn, extraOut } });
    assert.equal(res.status, 400, `${extraIn}/${extraOut}: ${JSON.stringify(res.data)}`);
    assert.equal(res.data.code, 'EXTRA_WRONG_SIDE', `${extraIn}/${extraOut}`);
    assert.match(res.data.error, new RegExp(`^Ngày ${dm(MON1)}: giờ làm bù không khớp ca 22:00–07:00`));
  }
  // chỉ đoạn sau ca: để trống giờ bắt đầu
  const ok = await put('qa_night', { [MON1]: { ...night, extraKind: 'makeup', extraOut: '09:00' } });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
});

test('Đi làm với giờ rộng hơn ca được gán, không khai làm thêm: cảnh báo giờ ngoài ca không được trả', async () => {
  await setup();
  const res = await put('qa_night', { [MON1]: { kind: 'work', in: '20:00', out: '09:00' } });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  const w = res.data.warnings.find(x => x.code === 'SHEET_SHIFT_MISMATCH');
  assert.ok(w, JSON.stringify(res.data.warnings));
  assert.match(w.message, /rộng hơn ca cố định 22:00–07:00/);
  assert.match(w.message, /giờ ngoài ca không được trả nếu không khai là OT hoặc làm bù theo giờ/);
});

test('Admin khai thay giờ làm thêm trong khung đêm: cảnh báo nói khoản được duyệt luôn, không nói "chờ Admin duyệt"', async () => {
  await setup();
  const res = await put(
    'admin',
    { [MON1]: { kind: 'work', in: '08:00', out: '17:00', extraKind: 'makeup', extraIn: '04:00' } },
    { user: 'qa_day' }
  );
  assert.equal(res.status, 200, JSON.stringify(res.data));
  const w = res.data.warnings.find(x => x.code === 'SHEET_EXTRA_NIGHT');
  assert.ok(w, JSON.stringify(res.data.warnings));
  assert.match(w.message, /Admin khai thay nên khoản được duyệt luôn/);
  assert.doesNotMatch(w.message, /chờ Admin duyệt/);
  // nhân sự tự khai: vẫn là câu chờ duyệt
  const self = await put('qa_night', { [MON3]: { ...night, extraKind: 'makeup', extraIn: '20:00', extraOut: '' } });
  assert.equal(self.status, 200, JSON.stringify(self.data));
  const own = await put('qa_day', {
    [MON1]: { kind: 'work', in: '08:00', out: '17:00', extraKind: 'makeup', extraIn: '04:00' },
    [MON3]: { kind: 'work', in: '08:00', out: '17:00', extraKind: 'makeup', extraIn: '04:00' }
  });
  const ownWarn = own.data.warnings.find(x => x.code === 'SHEET_EXTRA_NIGHT');
  assert.ok(ownWarn && /khoản chờ Admin duyệt/.test(ownWarn.message), JSON.stringify(own.data.warnings));
});
