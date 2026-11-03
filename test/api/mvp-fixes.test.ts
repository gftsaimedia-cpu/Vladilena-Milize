// Kiểm tra làm bù thiếu extraKind, làm bù cả ngày trong lịch, KPI vượt mức, giới hạn 1 MB theo byte,
// kiểm tra đầu vào từng ngày và không đọc được file ngoài public/.
require('../helpers/require-isolated-database');
process.env.SESSION_SECRET = 'mvp-fixes-tests';
// Kiểm đường dẫn trên trang trong public/: không để web/dist có sẵn trên máy dev (npm run build) đổi kết quả
process.env.WEB_DIST = require('node:path').join(require('node:os').tmpdir(), 'luong-no-web-dist');
const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const store = require('../../src/platform/db');
const auth = require('../../src/platform/auth');
const server = require('../helpers/server');
let base;

async function person(username?, role = 'staff', type = 'nv', shiftCode = 'n1') {
  await store.upsertStaff({
    username,
    name: username,
    role,
    type,
    level: 1,
    shiftCode,
    startDate: '2026-01-01',
    passHash: auth.hashPassword('test-pass')
  });
}
async function snapshot() {
  return Object.fromEntries(
    await Promise.all(
      [
        'staff',
        'timesheets',
        'settings',
        'attendance_days',
        'attendance_sessions',
        'punches',
        'corrections',
        'punch_requests'
      ].map(async table => [table, await store.db.prepare('SELECT * FROM ' + table + ' ORDER BY ctid').all()])
    )
  );
}
async function call(method?, route?, { who = 'admin', body }: any = {}) {
  const response = await fetch(base + '/api' + route, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: auth.cookieHeader(await auth.createSession(who), 86400) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  return { status: response.status, data: (await response.json()) as any };
}
// gọi qua node:http để giữ nguyên đường dẫn thô (fetch tự chuẩn hoá "..")
function raw(path?) {
  return new Promise<any>((resolve, reject) => {
    const req = http.request(base + path, res => {
      let text = '';
      res.on('data', chunk => (text += chunk));
      res.on('end', () => resolve({ status: res.statusCode, text, headers: res.headers }));
    });
    req.on('error', reject);
    req.end();
  });
}
const sheet = (who?, month = '2026-10') => store.getSheet(who, month);
const putSheet = (who?, days?, extra: any = {}) =>
  call('PUT', '/sheet', { who, body: { month: '2026-10', days, ...extra } });

before(async () => {
  await new Promise<any>(resolve => server.listen(0, '127.0.0.1', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
});
beforeEach(async () => {
  for (const table of [
    'punch_requests',
    'corrections',
    'punches',
    'attendance_sessions',
    'attendance_days',
    'timesheets',
    'slip_overrides',
    'staff',
    'settings'
  ])
    await store.db.exec('DELETE FROM ' + table);
  await person('admin', 'admin', 'tts');
  await person('worker'); // NV L1, lịch T2–T7, KPI tối đa 6.000.000
  await person('collab', 'staff', 'ctv'); // CTV L1, lịch T2–T7, KPI tối đa 1.500.000
  await person('intern', 'staff', 'tts'); // TTS, lịch T2–T6
});
after(async () => {
  server.closeAllConnections();
  await new Promise<any>(resolve => server.close(resolve));
  store.db.close();
});

/* ---------- bản ghi làm bù thiếu extraKind ---------- */
test('B2: ngày có giờ làm thêm mà thiếu extraKind được lưu là làm bù và giữ nguyên giờ ra làm thêm', async () => {
  const r = await putSheet('worker', { '2026-10-07': { kind: 'work', in: '08:00', out: '17:00', extraOut: '19:00' } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const saved = (await sheet('worker')).days['2026-10-07'];
  assert.equal(saved.extraKind, 'makeup', 'bản ghi cũ phải hiểu là làm bù');
  assert.equal(saved.extraOut, '19:00', 'không được xoá giờ làm thêm (mất 4 giờ làm bù = 115.385 đ)');
  assert.equal(saved.in, '08:00');
  assert.equal(saved.out, '17:00');
});
test('B2: bản ghi cũ chỉ có giờ vào làm thêm (trước ca): giữ extraIn, extraKind để rỗng như calcDay, không tạo khoản chờ duyệt', async () => {
  const r = await putSheet('worker', { '2026-10-07': { kind: 'work', in: '08:00', out: '17:00', extraIn: '06:30' } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const saved = (await sheet('worker')).days['2026-10-07'];
  assert.equal(saved.extraKind, '', 'không đoán thành làm bù: calcDay chỉ hiểu extraOut');
  assert.equal(saved.extraIn, '06:30');
});
test('B2: đọc bản ghi cũ từ máy chủ rồi lưu lại nguyên vẹn thì không mất giờ làm bù', async () => {
  // bản ghi cũ nằm sẵn trong DB, không có khoá extraKind
  await store.setSheet('worker', '2026-10', {
    '2026-10-07': { kind: 'work', shift: 'day', in: '08:00', out: '17:00', extraOut: '19:00' }
  });
  const got = await call('GET', '/sheet?month=2026-10', { who: 'worker' });
  assert.equal(got.status, 200);
  const r = await putSheet('worker', got.data.days);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal((await sheet('worker')).days['2026-10-07'].extraOut, '19:00');
  assert.equal((await sheet('worker')).days['2026-10-07'].extraKind, 'makeup');
});
test('B2 (giữ nguyên): extraKind ghi rõ là ot vẫn lưu là ot, không bị đổi thành làm bù', async () => {
  const r = await putSheet('worker', {
    '2026-10-07': { kind: 'work', in: '08:00', out: '17:00', extraKind: 'ot', extraOut: '19:00' }
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal((await sheet('worker')).days['2026-10-07'].extraKind, 'ot');
});
test('B2 (giữ nguyên): ngày đi làm không có giờ làm thêm thì không có extraKind', async () => {
  const r = await putSheet('worker', { '2026-10-07': { kind: 'work', in: '08:00', out: '17:00' } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal((await sheet('worker')).days['2026-10-07'].extraKind, '');
});

/* ---------- làm bù cả ngày trên ngày nằm trong lịch ---------- */
for (const [who, label, date] of [
  ['worker', 'NV, thứ Hai', '2026-10-05'],
  ['worker', 'NV, thứ Bảy (nằm trong lịch T2–T7)', '2026-10-03'],
  ['collab', 'CTV, thứ Bảy (nằm trong lịch T2–T7)', '2026-10-03'],
  ['intern', 'TTS, thứ Hai', '2026-10-05']
]) {
  test(`B3/U3: làm bù cả ngày trên ngày trong lịch bị từ chối 400 và không lưu gì (${label})`, async () => {
    const previous = await snapshot();
    const r = await putSheet(who, { [date]: { kind: 'makeup', in: '08:00', out: '17:00' } });
    assert.equal(r.status, 400, JSON.stringify(r.data));
    assert.ok(r.data.error);
    assert.deepEqual(await snapshot(), previous);
  });
}
test('B3/U3: bị từ chối làm bù cả ngày thì ngày khác trong cùng yêu cầu cũng không được lưu', async () => {
  const previous = await snapshot();
  const r = await putSheet('worker', {
    '2026-10-06': { kind: 'work', in: '08:00', out: '17:00' },
    '2026-10-05': { kind: 'makeup', in: '08:00', out: '17:00' }
  });
  assert.equal(r.status, 400, JSON.stringify(r.data));
  assert.deepEqual(await snapshot(), previous);
});

/* ---------- KPI vượt mức tối đa của level ---------- */
for (const [who, label, max] of <any[]>[
  ['worker', 'NV L1', 6000000],
  ['collab', 'CTV L1', 1500000]
]) {
  test(`U4: PUT /sheet với kpiAmt vượt KPI tối đa của ${label} vẫn lưu, kèm cảnh báo KPI_OVER_CAP`, async () => {
    const r = await putSheet(who, {}, { kpiPct: 80, kpiAmt: max + 1 });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.ok(
      r.data.warnings.some(w => w.code === 'KPI_OVER_CAP'),
      JSON.stringify(r.data.warnings)
    );
    assert.equal((await sheet(who)).kpiAmt, max + 1);
  });
  test(`U4: PUT /sheet nhận kpiAmt đúng bằng KPI tối đa, không cảnh báo của ${label}`, async () => {
    const r = await putSheet(who, {}, { kpiPct: 80, kpiAmt: max });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.ok(!(r.data.warnings || []).some(w => w.code === 'KPI_OVER_CAP'), JSON.stringify(r.data.warnings));
    assert.equal((await sheet(who)).kpiAmt, max);
  });
}
// Phía Admin: trần KPI và quyền của PUT /api/kpi/scores nằm ở kpi-scores-api.test.ts

/* ---------- extraKind mà không có đoạn làm thêm ---------- */
for (const extraKind of ['makeup', 'ot']) {
  test(`U5: extraKind "${extraKind}" không kèm giờ làm thêm nào bị từ chối 400 và không lưu`, async () => {
    const previous = await snapshot();
    const r = await putSheet('worker', { '2026-10-07': { kind: 'work', in: '08:00', out: '17:00', extraKind } });
    assert.equal(r.status, 400, JSON.stringify(r.data));
    assert.ok(r.data.error);
    assert.deepEqual(await snapshot(), previous);
  });
  test(`U5: extraKind "${extraKind}" với extraIn / extraOut rỗng cũng bị từ chối 400`, async () => {
    const previous = await snapshot();
    const r = await putSheet('worker', {
      '2026-10-07': { kind: 'work', in: '08:00', out: '17:00', extraKind, extraIn: '', extraOut: '' }
    });
    assert.equal(r.status, 400, JSON.stringify(r.data));
    assert.deepEqual(await snapshot(), previous);
  });
}
test('U5 (giữ nguyên): extraKind có đủ đoạn làm thêm thì được lưu', async () => {
  const r = await putSheet('worker', {
    '2026-10-07': { kind: 'work', in: '08:00', out: '17:00', extraKind: 'makeup', extraOut: '19:00' }
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal((await sheet('worker')).days['2026-10-07'].extraOut, '19:00');
});

/* ---------- giới hạn 1 MB tính theo byte ---------- */
async function bigBody(text?) {
  // gửi trực tiếp, bắt lỗi kết nối bị cắt để báo rõ nguyên nhân
  try {
    const response = await fetch(base + '/api/staff/worker', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: auth.cookieHeader(await auth.createSession('admin'), 86400)
      },
      body: JSON.stringify({
        name: 'Big body',
        role: 'staff',
        type: 'nv',
        level: 1,
        shiftCode: 'n1',
        startDate: '2026-01-01',
        pad: text
      })
    });
    return { status: response.status, data: (await response.json().catch(() => ({}))) as any };
  } catch (error) {
    return { status: null, dropped: String(error.cause?.code || error.message) };
  }
}
test('B6: body ASCII vượt 1 MB trả 413 chứ không cắt kết nối', async () => {
  const previous = await snapshot();
  const r = await bigBody('x'.repeat(1_100_000));
  assert.equal(r.status, 413, 'kết nối bị cắt: ' + r.dropped);
  assert.ok(r.data.error);
  assert.deepEqual(await snapshot(), previous);
});
test('B6: body có chữ nhiều byte vượt 1 MB (đếm theo byte, dưới 1 triệu ký tự) trả 413', async () => {
  // 600.000 ký tự "é" = 1,2 MB nhưng chỉ 600.000 đơn vị chuỗi
  const previous = await snapshot();
  const r = await bigBody('é'.repeat(600_000));
  assert.equal(r.status, 413, 'kết nối bị cắt: ' + r.dropped);
  assert.ok(r.data.error);
  assert.deepEqual(await snapshot(), previous);
});
test('B6: body ba byte mỗi ký tự vượt 1 MB (400.000 ký tự) trả 413', async () => {
  const previous = await snapshot();
  const r = await bigBody('ễ'.repeat(400_000));
  assert.equal(r.status, 413, 'kết nối bị cắt: ' + r.dropped);
  assert.deepEqual(await snapshot(), previous);
});
test('B6 (giữ nguyên): body nhiều byte nhưng dưới 1 MB (800.000 byte) vẫn được nhận', async () => {
  const r = await bigBody('é'.repeat(400_000));
  assert.equal(r.status, 200, JSON.stringify(r.data));
});
test('B6 (giữ nguyên): body lớn hơn một đoạn mạng (90 KB tiếng Việt) được đọc nguyên vẹn, không hỏng ký tự', async () => {
  // đọc theo từng đoạn Buffer rồi nối chuỗi sẽ cắt đôi ký tự ba byte ở ranh giới đoạn và sinh ký tự thay thế
  const name = 'ễ'.repeat(30_000);
  const r = await call('PUT', '/staff/worker', {
    body: { name, role: 'staff', type: 'nv', level: 1, shiftCode: 'n1', startDate: '2026-01-01' }
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal((await store.getStaff('worker')).name, name);
});

/* ---------- kiểm tra đầu vào của từng ngày ---------- */
for (const [label, kind] of [
  ['chuỗi lạ', 'bogus'],
  ['sai chữ hoa', 'WORK'],
  ['không phải chuỗi', 5],
  ['mảng', ['work']]
]) {
  test(`B7: kind không hợp lệ (${label}) bị từ chối 400 chứ không âm thầm thành "work"`, async () => {
    const previous = await snapshot();
    const r = await putSheet('worker', { '2026-10-07': { kind, in: '08:00', out: '17:00' } });
    assert.equal(r.status, 400, JSON.stringify(r.data));
    assert.ok(r.data.error);
    assert.deepEqual(await snapshot(), previous);
  });
}
test('B7 (giữ nguyên): kind hợp lệ "willmakeup" vẫn được lưu', async () => {
  const r = await putSheet('worker', {
    '2026-10-07': {
      kind: 'willmakeup',
      makeupPlans: [{ date: '2026-10-08', from: '08:00', to: '17:00' }]
    }
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal((await sheet('worker')).days['2026-10-07'].kind, 'willmakeup');
});
for (const [label, preset] of [
  ['mã lạ', 'zz'],
  ['chữ hoa', 'N1'],
  ['số', 5],
  ['mảng chứa mã hợp lệ', ['n1']],
  ['object', {}]
]) {
  test(`B7: preset không hợp lệ (${label}) bị từ chối 400 chứ không âm thầm xoá`, async () => {
    const previous = await snapshot();
    const r = await putSheet('worker', { '2026-10-07': { kind: 'work', in: '08:00', out: '17:00', preset } });
    assert.equal(r.status, 400, JSON.stringify(r.data));
    assert.deepEqual(await snapshot(), previous);
  });
}
for (const preset of ['n1', 'n2', 'f1', 'f2', 'g1', 'g2']) {
  test(`B7 (giữ nguyên): preset "${preset}" hợp lệ được lưu nguyên`, async () => {
    // giờ trong ca đêm không chặn ở đây: chỉ kiểm preset nên dùng giờ ban ngày; người đã được gán ca thì preset luôn là ca đó
    await person('free-preset', 'staff', 'nv', null);
    const r = await putSheet('free-preset', { '2026-10-07': { kind: 'work', in: '08:00', out: '17:00', preset } });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal((await sheet('free-preset')).days['2026-10-07'].preset, preset);
  });
}
test('B7 (giữ nguyên): preset rỗng hoặc bỏ trống (chọn "Tự nhập giờ") vẫn được lưu', async () => {
  await person('free-preset', 'staff', 'nv', null); // chưa gán ca cố định
  for (const preset of ['', undefined]) {
    const r = await putSheet('free-preset', { '2026-10-07': { kind: 'work', in: '08:00', out: '17:00', preset } });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal((await sheet('free-preset')).days['2026-10-07'].preset, '');
  }
});
for (const [label, breakMin] of [
  ['âm', -1],
  ['lớn hơn 1440', 1441],
  ['số thập phân', 1.5],
  ['chữ', 'abc'],
  ['mảng', [30]]
]) {
  test(`B7: breakMin không hợp lệ (${label}) bị từ chối 400 chứ không bị kẹp hay đổi thành 0`, async () => {
    const previous = await snapshot();
    const r = await putSheet('worker', { '2026-10-07': { kind: 'work', in: '08:00', out: '17:00', breakMin } });
    assert.equal(r.status, 400, JSON.stringify(r.data));
    assert.deepEqual(await snapshot(), previous);
  });
}
for (const breakMin of [0, 30, 1440]) {
  test(`B7 (giữ nguyên): breakMin ${breakMin} nằm trong 0–1440 được lưu nguyên`, async () => {
    const r = await putSheet('worker', { '2026-10-07': { kind: 'work', in: '08:00', out: '17:00', breakMin } });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal((await sheet('worker')).days['2026-10-07'].breakMin, breakMin);
  });
}

/* ---------- không đọc được file ngoài public/ ---------- */
for (const path of [
  '/../server.js',
  '/../src/platform/db.ts',
  '/../package.json',
  '/..%2fserver.js',
  '/%2e%2e/server.js',
  '/..%5cserver.js',
  '/..\\server.js',
  '/../data/luong.sqlite',
  '/css/../../server.js',
  '/%00',
  '/admin.html%00.png',
  '/....//server.js',
  '/../../../../../../../etc/passwd',
  '/..%c0%afserver.js'
]) {
  test(`N3: đường dẫn "${path}" không đọc được file ngoài public/ (404, không lộ mã nguồn)`, async () => {
    const r = await raw(path);
    assert.ok([400, 404].includes(r.status), 'trả ' + r.status);
    assert.doesNotMatch(r.text, /require\(|DatabaseSync|SESSION_SECRET|SQLite format/);
  });
}
test('N3: đường dẫn bắt đầu bằng // (URL tương đối giao thức) không lộ file ngoài public/', async () => {
  for (const path of ['//..//server.js', '//x/../server.js', '///server.js']) {
    const r = await raw(path);
    assert.doesNotMatch(r.text, /require\(|DatabaseSync|SESSION_SECRET/, path);
  }
});

test('N3 (giữ nguyên): file không có trả 404', async () => {
  assert.equal((await raw('/khong-co-file-nay.js')).status, 404);
});

test('N3: giao diện cũ trong public/ đã bỏ; chưa build web/dist thì trang chủ trả 503 (không chuyển hướng) và mô-đun tính lương không bị phục vụ ra ngoài', async () => {
  const home = await raw('/');
  assert.ok([200, 503].includes(home.status), 'trang chủ: 200 (đã build) hoặc 503 (chưa build)');
  for (const gone of [
    '/dang-nhap.html',
    '/admin.html',
    '/nhan-vien.html',
    '/home-route.js',
    '/index.html',
    '/payroll-engine.js'
  ])
    assert.equal((await raw(gone)).status, 404, gone);
});
