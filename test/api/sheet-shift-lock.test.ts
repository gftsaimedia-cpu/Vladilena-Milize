// Giờ ngày đi làm khác ca cố định Admin gán (ca do Admin gán, nhân sự không tự chọn): vẫn lưu, kèm cảnh báo SHEET_SHIFT_MISMATCH, và ngày tính theo ca được gán.
// Lý do: phụ cấp Flex / Night suy ra từ giờ vào – ra, nên NV ca n1 tự gõ 22:00–07:00 sẽ được thêm 129.808 đ/ngày
// (NV L1: Night 40% = 92.308 + giờ nghỉ đêm 37.500).
require('../helpers/require-isolated-database');
process.env.SESSION_SECRET = 'sheet-shift-lock-tests';
const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const store = require('../../src/platform/db');
const auth = require('../../src/platform/auth');
const server = require('../helpers/server');

let base;
const realNow = Date.now;
const CLOCK = Date.parse('2026-10-14T12:00:00+07:00');

async function person(username?, overrides: any = {}) {
  await store.upsertStaff({
    username,
    name: username,
    role: 'staff',
    type: 'nv',
    level: 1,
    shiftCode: 'n1',
    startDate: '2026-01-01',
    passHash: auth.hashPassword('test-pass'),
    ...overrides
  });
}
async function save(who?, days?, month = '2026-10') {
  const response = await fetch(base + '/api/sheet', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: auth.cookieHeader(await auth.createSession(who), 86400) },
    body: JSON.stringify({ month, days })
  });
  return { status: response.status, data: (await response.json().catch(() => ({}))) as any };
}
const stored = async (who?, month = '2026-10') => (await store.getSheet(who, month)).days;
const warned = (r?) => (r.data.warnings || []).map(w => w.code);
// Thứ 3 20/10 và Thứ 4 21/10, Thứ 7 10/10 và 17/10 (xem lịch tháng 10/2026: 1/10 là Thứ 5)
const N1 = { kind: 'work', in: '08:00', out: '17:00' };
const NIGHT = { kind: 'work', in: '22:00', out: '07:00' };

before(async () => {
  Date.now = () => CLOCK;
  await new Promise<any>(resolve => server.listen(0, '127.0.0.1', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
});
beforeEach(async () => {
  for (const table of [
    'sheet_approvals',
    'corrections',
    'punches',
    'attendance_sessions',
    'attendance_days',
    'timesheets',
    'staff',
    'settings'
  ]) {
    try {
      await store.db.exec('DELETE FROM ' + table);
    } catch (error) {
      if (!/no such table/.test(error.message)) throw error;
    }
  }
  await person('an'); // NV ca n1 08:00–17:00
  await person('tu', { shiftCode: null }); // chưa gán ca
  await person('intern', { type: 'tts', level: 1 });
});
after(async () => {
  Date.now = realNow;
  server.closeAllConnections();
  await new Promise<any>(resolve => server.close(resolve));
  store.db.close();
});

test('ca n1 khai 22:00–07:00: 200 kèm cảnh báo SHEET_SHIFT_MISMATCH nêu ngày và ca; mã ca của ngày để trống (tính theo ca được gán)', async () => {
  const r = await save('an', { '2026-10-20': NIGHT });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const w = r.data.warnings.find(x => x.code === 'SHEET_SHIFT_MISMATCH');
  assert.ok(w, JSON.stringify(r.data.warnings));
  assert.match(w.message, /Ngày 20\/10/);
  assert.match(w.message, /08:00–17:00/);
  assert.match(w.message, /Admin/);
  assert.equal((await stored('an'))['2026-10-20'].in, '22:00');
  assert.equal((await stored('an'))['2026-10-20'].preset, '');
});
test('ca n1 khai đúng 08:00–17:00: 200, preset được đặt thành mã ca', async () => {
  const r = await save('an', { '2026-10-20': { ...N1, preset: '' } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal((await stored('an'))['2026-10-20'].preset, 'Normal1'); // hồ sơ lưu mã ca của danh mục (Normal1 …)
  assert.equal((await stored('an'))['2026-10-20'].in, '08:00');
  assert.ok(!warned(r).includes('SHEET_SHIFT_MISMATCH'), 'đúng ca thì không cảnh báo');
});
test('chỉ lệch một đầu (08:00–16:00, 09:00–17:00) cũng cảnh báo SHEET_SHIFT_MISMATCH và vẫn lưu', async () => {
  for (const day of [
    { ...N1, out: '16:00' },
    { ...N1, in: '09:00' }
  ]) {
    const r = await save('an', { '2026-10-20': day });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.ok(warned(r).includes('SHEET_SHIFT_MISMATCH'), JSON.stringify(r.data.warnings));
    assert.equal((await stored('an'))['2026-10-20'].in, day.in);
  }
});
test('ngày lễ: giờ vào – ra là khung giờ OT ngày lễ, không so với ca cố định (không cảnh báo); ngày thường lệch ca thì cảnh báo', async () => {
  await store.setSetting('holidays', ['2026-10-20']);
  const night = await save('an', { '2026-10-20': { ...NIGHT } });
  assert.equal(night.status, 200);
  assert.ok(!warned(night).includes('SHEET_SHIFT_MISMATCH'), JSON.stringify(night.data.warnings));
  assert.equal((await save('an', { '2026-10-20': { ...N1 } })).status, 200);
  const normal = await save('an', { '2026-10-21': { ...NIGHT } });
  assert.equal(normal.status, 200);
  assert.ok(warned(normal).includes('SHEET_SHIFT_MISMATCH'));
});
test('mỗi ca có giờ riêng: ca g2 (Night) khai 22:00–07:00 không cảnh báo, khai 08:00–17:00 cảnh báo SHEET_SHIFT_MISMATCH', async () => {
  await person('dem', { shiftCode: 'g2' });
  const wrong = await save('dem', { '2026-10-20': { ...N1 } });
  assert.equal(wrong.status, 200, JSON.stringify(wrong.data));
  assert.ok(warned(wrong).includes('SHEET_SHIFT_MISMATCH'));
  const ok = await save('dem', { '2026-10-20': { ...NIGHT } });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.ok(!warned(ok).includes('SHEET_SHIFT_MISMATCH'));
  assert.equal((await stored('dem'))['2026-10-20'].preset, 'Night2'); // hồ sơ lưu mã ca của danh mục (Normal1 …)
});
test('ngày cũ đã lưu giờ khác ca (22:00–07:00) và không đổi giờ: giữ nguyên, thêm ngày đúng ca vẫn 200', async () => {
  await store.setSheet('an', '2026-10', { '2026-10-19': { ...NIGHT } }, null, null);
  const r = await save('an', { '2026-10-19': { ...NIGHT }, '2026-10-20': { ...N1 } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal((await stored('an'))['2026-10-19'].in, '22:00');
  assert.equal((await stored('an'))['2026-10-20'].in, '08:00');
});
test('ngày cũ lệch ca mà đổi giờ sang một giờ lệch khác: lưu giờ mới kèm cảnh báo SHEET_SHIFT_MISMATCH', async () => {
  await store.setSheet('an', '2026-10', { '2026-10-19': { ...NIGHT } }, null, null);
  const r = await save('an', { '2026-10-19': { kind: 'work', in: '21:00', out: '06:00' } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.ok(warned(r).includes('SHEET_SHIFT_MISMATCH'));
  assert.equal((await stored('an'))['2026-10-19'].in, '21:00');
});
test('ngày cũ 09:00–18:00 giữ giờ, thêm OT 20:00: bộ kiểm ca không chặn (chỉ so loại ngày và giờ vào – ra)', async () => {
  await store.setSheet('an', '2026-10', { '2026-10-21': { kind: 'work', in: '09:00', out: '18:00' } }, null, null);
  const r = await save('an', {
    '2026-10-21': { kind: 'work', in: '09:00', out: '18:00', extraKind: 'ot', extraOut: '20:00' }
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal((await stored('an'))['2026-10-21'].extraOut, '20:00');
  assert.equal((await stored('an'))['2026-10-21'].in, '09:00', 'giờ cũ không bị ghi đè');
});
test('ngày cũ 09:00–18:00 thêm OT vào khung 22h–6h vẫn lưu, kèm cảnh báo của quy tắc OT', async () => {
  await store.setSheet('an', '2026-10', { '2026-10-21': { kind: 'work', in: '09:00', out: '18:00' } }, null, null);
  const r = await save('an', {
    '2026-10-21': { kind: 'work', in: '09:00', out: '18:00', extraKind: 'ot', extraIn: '05:30' }
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.ok(
    r.data.warnings.some(w => /^SHEET_/.test(w.code)),
    JSON.stringify(r.data.warnings)
  );
  assert.equal((await stored('an'))['2026-10-21'].extraIn, '05:30');
});
test('OT sau ca vẫn khai được: 08:00–17:00 kèm OT đến 19:00 là 200', async () => {
  const r = await save('an', { '2026-10-20': { ...N1, extraKind: 'ot', extraOut: '19:00' } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal((await stored('an'))['2026-10-20'].extraOut, '19:00');
});
test('làm bù theo giờ sau ca vẫn khai được', async () => {
  const r = await save('an', { '2026-10-20': { ...N1, extraKind: 'makeup', extraOut: '19:00' } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
});
test('nhân sự chưa gán ca: khai giờ tự do như trước (22:00–07:00 và 10:00–19:00 đều 200)', async () => {
  assert.equal((await save('tu', { '2026-10-20': { ...NIGHT } })).status, 200);
  const r = await save('tu', { '2026-10-20': { kind: 'work', in: '10:00', out: '19:00' } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal((await stored('tu'))['2026-10-20'].preset, '', 'không có ca nên không đặt preset');
});
test('ngày nghỉ, iSAT, nghỉ không lương không có giờ nên không bị kiểm ca', async () => {
  assert.equal((await save('an', { '2026-10-17': { kind: 'unpaid' }, '2026-10-24': { kind: 'isat' } })).status, 200);
});
