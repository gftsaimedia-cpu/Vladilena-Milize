'use strict';
// position-copy, position-hardcoded-flags, entitlement-matrix-api:
//   POST /api/positions { label, copyFrom, effectiveMonth, reason }: máy chủ sinh mã (chữ thường và số, 2 đến 16 ký tự), dựng MỘT lô gồm
//     position.def.<mã> + mọi khoá type.<nguồn>.* và level.<nguồn>.* rồi gọi cùng save() (một giao dịch, tháng áp dụng, lý do, nhật ký).
//   Trùng mã: 409 POSITION_CODE_CLASH; nguồn lạ: 400 POSITION_UNKNOWN; mã loại lạ khi tạo nhân sự là 400 (không rơi về tts).
//   GET /api/positions?month= và GET /api/entitlements?month= ({ positions, blocks, cells, paramsRev }, quyền config.read).
// Tên trường chưa cố định nên test chấp nhận vài tên và kiểm số tiền (helpers/position-api.js → pick, findKey).
const P = require('../helpers/position-api');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { Engine, clone } = require('../helpers/pay-oracle');
const { LEGACY_OVERRIDE } = require('../helpers/legacy-params');
const { caseOf } = require('../helpers/pay-oracle');
const { attendDeclaredDays } = require('../helpers/payroll-cases');

const { F, store } = P;
const NV1 = 'known-kpi-five-100-90-80-85-100';
const NV3 = 's20261015-00018';

before(F.start);
after(F.stop);

const listPositions = async (month?, who = 'admin') => await F.call('GET', `/positions?month=${month}`, { who });
const codesIn = (data?) => {
  const rows = Array.isArray(data) ? data : P.pick(data, ['positions', 'rows', 'items']) || [];
  return rows.map(row => (typeof row === 'string' ? row : row.code));
};
const computeAs = (params?, id?, type?) => {
  const input = clone(caseOf(id).input);
  input.staff.type = type;
  input.advanceApproved = true;
  attendDeclaredDays(input); // đi làm đủ mọi ngày đã khai
  // ca vàng có ít ngày có lương: ngưỡng không đóng bảo hiểm rất lớn (xem test/helpers/legacy-params.ts)
  return Engine.create({ ...params, ...LEGACY_OVERRIDE }).computeMonth(input).m;
};

test('position-copy: POST /api/positions sao chép nv thành chức vụ mới có mã sinh từ nhãn, hiện ở GET /api/positions và cho đúng số tiền của nv (5.040.461 (tạm ứng đã duyệt) và 966.201 ở bậc 3 với OT ngày có lịch ×1,5)', async () => {
  const M = await P.setupMonth();
  const code = await P.mustCopy(M, { label: 'Chuyên viên thử một', copyFrom: 'nv' });
  assert.ok(!['tts', 'ctv', 'nv'].includes(code));
  const listed = await listPositions(M);
  assert.equal(listed.status, 200);
  assert.ok(
    ['tts', 'ctv', 'nv', code].every(c => codesIn(listed.data).includes(c)),
    JSON.stringify(listed.data).slice(0, 300)
  );
  // tham số hiệu lực của tháng mang bản sao của nv, cùng bậc và lương
  const params = await P.paramsOf(M);
  for (const key of ['travel', 'attendance', 'kpiPass', 'maxAbsent'])
    assert.deepEqual(params[`type.${code}.${key}`], params[`type.nv.${key}`], key);
  for (const level of [1, 2, 3, 4])
    assert.equal(params[`level.${code}.${level}.base`], params[`level.nv.${level}.base`], `bậc ${level}`);
  // cùng số tiền: ca known-kpi (bậc 1) và ca s20261015-00018 (bậc 3) tính bằng bộ tham số của máy chủ
  const nv = computeAs(params, NV1, 'nv');
  const copy = computeAs(params, NV1, code);
  for (const field of ['gross', 'insurance', 'tax', 'advance', 'net', 'employer'])
    assert.equal(copy.net[field], nv.net[field], field);
  assert.equal(copy.net.net, 5040461);
  assert.equal(computeAs(params, NV3, code).net.net, 966201);
});

test('position-copy: nhật ký và lô tham số: một lần sao chép là MỘT lô cùng tháng áp dụng và lý do, ghi nhật ký; ba chức vụ mặc định không có dòng position.def', async () => {
  const M = await P.setupMonth();
  const rows0 = await P.rowCount();
  const audit0 = (await P.auditRows('param.set')).length;
  await P.mustCopy(M, { label: 'Chuyên viên thử hai', copyFrom: 'ctv', reason: 'Thêm chức vụ thử nhật ký' });
  const rows = (await P.paramRows()).slice(rows0);
  assert.ok(rows.length > 10, 'bản sao mang cả họ type.* và level.*');
  assert.ok(
    rows.some(r => /^position\.def\./.test(r.key)),
    'có position.def.<mã>'
  );
  assert.equal(new Set<any>(rows.map(r => r.effective_month ?? r.effectiveMonth)).size, 1);
  assert.equal(new Set<any>(rows.map(r => r.reason)).size, 1);
  assert.equal(rows[0].reason, 'Thêm chức vụ thử nhật ký');
  assert.ok((await P.auditRows('param.set')).length > audit0, 'có dòng nhật ký');
  assert.ok(
    !(await P.paramRows()).some(r => ['position.def.tts', 'position.def.ctv', 'position.def.nv'].includes(r.key))
  );
});

test('position-copy: đầu vào sai là 400 và không lưu gì: thiếu nhãn, nhãn rỗng, nguồn lạ (POSITION_UNKNOWN), tháng sai; nhân sự và người chưa đăng nhập không sao chép được (403, 401); thiếu lý do vẫn sao chép được', async () => {
  const M = await P.setupMonth();
  const before = await F.snapshot();
  const cases = [
    [{ copyFrom: 'nv', effectiveMonth: M, reason: 'Lý do đủ mười ký tự' }, 'thiếu nhãn'],
    [{ label: '   ', copyFrom: 'nv', effectiveMonth: M, reason: 'Lý do đủ mười ký tự' }, 'nhãn rỗng'],
    [{ label: 'Chức vụ lạ nguồn', copyFrom: 'khongco', effectiveMonth: M, reason: 'Lý do đủ mười ký tự' }, 'nguồn lạ'],
    [
      { label: 'Chức vụ sai tháng', copyFrom: 'nv', effectiveMonth: '2026-13', reason: 'Lý do đủ mười ký tự' },
      'tháng sai'
    ]
  ];
  for (const [body, what] of cases) {
    const res = await F.call('POST', '/positions', { body });
    assert.equal(res.status, 400, `${what}: ${res.status} ${JSON.stringify(res.data)}`);
    if (what === 'nguồn lạ') assert.equal(res.data.code, 'POSITION_UNKNOWN');
  }
  assert.deepEqual(F.changedTables(before, await F.snapshot()), [], '400 không được ghi gì');
  const body = { label: 'Chức vụ không quyền', copyFrom: 'nv', effectiveMonth: M, reason: 'Lý do đủ mười ký tự' };
  assert.equal((await F.call('POST', '/positions', { who: 'qa_nv1', body })).status, 403);
  assert.equal((await F.call('POST', '/positions', { who: null, body })).status, 401);
  assert.deepEqual(F.changedTables(before, await F.snapshot()), []);
  const noReason = await P.copyPosition(M, { label: 'Chức vụ thiếu lý do', copyFrom: 'nv', reason: '' });
  assert.equal(noReason.status, 200, JSON.stringify(noReason.data).slice(0, 300));
});

test('position-copy: hai chức vụ cùng nhãn là 409 POSITION_CODE_CLASH và lần hai không ghi dòng nào', async () => {
  const M = await P.setupMonth();
  await P.mustCopy(M, { label: 'Chức vụ trùng mã', copyFrom: 'nv' });
  const before = await F.snapshot();
  const second = await P.copyPosition(M, { label: 'Chức vụ trùng mã', copyFrom: 'ctv' });
  assert.equal(second.status, 409, JSON.stringify(second.data));
  assert.equal(second.data.code, 'POSITION_CODE_CLASH');
  assert.deepEqual(F.changedTables(before, await F.snapshot()), []);
});

test('position-copy: người có chức vụ mới tạo được qua PUT /api/staff (bậc theo chức vụ); mã loại lạ vẫn là 400, không rơi về tts', async () => {
  const M = await P.setupMonth();
  const code = await P.mustCopy(M, { label: 'Chuyên viên thử ba', copyFrom: 'nv' });
  const profile = {
    name: 'Người thử chức vụ',
    role: 'staff',
    type: code,
    level: 2,
    nightPct: 40,
    shiftCode: 'n1',
    startDate: '2026-01-05',
    password: 'mat-khau-thu'
  };
  const ok = await F.call('PUT', '/staff/qa_pos_new', { body: profile });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal((await store.getStaff('qa_pos_new')).type, code);
  const before = await F.snapshot();
  for (const type of ['khongco', 'NV', '', 'tts ']) {
    const bad = await F.call('PUT', '/staff/qa_pos_bad', { body: { ...profile, type } });
    assert.equal(bad.status, 400, JSON.stringify(type));
  }
  assert.deepEqual(F.changedTables(before, await F.snapshot()), []);
  assert.equal(await store.getStaff('qa_pos_bad'), undefined);
});

/* ================= position-hardcoded-flags ================= */
const dayIn = (month?, dow?) => P.firstDow(month, dow);
const saveSheet = async (user?, month?, days?) => await F.call('PUT', '/sheet', { who: user, body: { month, days } });
const flag = (code?, name?) => `type.${code}.benefit.${name}`;

test('position-hardcoded-flags: TTS khai OT hay nghỉ phép vẫn lưu, kèm cảnh báo BENEFIT_NOT_ALLOWED (không đúng quyền lợi chức vụ); CTV khai OT không cảnh báo', async () => {
  const M = await P.setupMonth();
  const date = dayIn(M, 2);
  const ot = await saveSheet('qa_tts1', M, {
    [date]: { kind: 'work', in: '08:00', out: '17:00', extraKind: 'ot', extraOut: '19:00' }
  });
  assert.equal(ot.status, 200, JSON.stringify(ot.data));
  assert.ok(
    ot.data.warnings.some(w => w.code === 'BENEFIT_NOT_ALLOWED'),
    JSON.stringify(ot.data.warnings)
  );
  const leave = await saveSheet('qa_tts1', M, { [date]: { kind: 'leave' } });
  assert.equal(leave.status, 200, JSON.stringify(leave.data));
  assert.ok(
    leave.data.warnings.some(w => w.code === 'BENEFIT_NOT_ALLOWED'),
    JSON.stringify(leave.data.warnings)
  );
  // CTV (ca n2 10:00–19:00): cùng yêu cầu OT được nhận
  const day = { kind: 'work', in: '10:00', out: '19:00', extraKind: 'ot', extraOut: '21:00' };
  const ctv = await saveSheet('qa_ctv1', M, { [date]: day });
  assert.equal(ctv.status, 200, JSON.stringify(ctv.data));
  assert.ok(!(ctv.data.warnings || []).some(w => w.code === 'BENEFIT_NOT_ALLOWED'), JSON.stringify(ctv.data.warnings));
});

test('position-hardcoded-flags: chức vụ sao từ tts với benefit.ot = true khai OT không cảnh báo, còn chức vụ sao từ tts giữ nguyên thì khai OT kèm cảnh báo BENEFIT_NOT_ALLOWED', async () => {
  const M = await P.setupMonth();
  const withOt = await P.mustCopy(M, { label: 'Thực tập có OT', copyFrom: 'tts' });
  const plain = await P.mustCopy(M, { label: 'Thực tập thường', copyFrom: 'tts' });
  const save = await P.saveChanges([{ key: flag(withOt, 'ot'), value: true }], { month: M });
  assert.equal(save.status, 200, JSON.stringify(save.data));
  await F.person('qa_pos_ot', 'staff', { type: withOt, level: 1, shiftCode: 'n1' });
  await F.person('qa_pos_plain', 'staff', { type: plain, level: 1, shiftCode: 'n1' });
  const date = dayIn(M, 2);
  const day = { kind: 'work', in: '08:00', out: '17:00', extraKind: 'ot', extraOut: '19:00' };
  const allowed = await saveSheet('qa_pos_ot', M, { [date]: day });
  assert.equal(allowed.status, 200, JSON.stringify(allowed.data));
  assert.ok(
    !(allowed.data.warnings || []).some(w => w.code === 'BENEFIT_NOT_ALLOWED'),
    JSON.stringify(allowed.data.warnings)
  );
  const warned = await saveSheet('qa_pos_plain', M, { [date]: day });
  assert.equal(warned.status, 200, JSON.stringify(warned.data));
  assert.ok(
    warned.data.warnings.some(w => w.code === 'BENEFIT_NOT_ALLOWED'),
    JSON.stringify(warned.data.warnings)
  );
});

test('position-hardcoded-flags: cờ absenceDeclarable theo chức vụ: bản sao của nv bỏ cờ thì khai nghỉ không lương trong lịch kèm cảnh báo BENEFIT_NOT_ALLOWED, bản sao của tts bật cờ thì khai không cảnh báo', async () => {
  const M = await P.setupMonth();
  const closed = await P.mustCopy(M, { label: 'Nhân viên không khai nghỉ', copyFrom: 'nv' });
  const open = await P.mustCopy(M, { label: 'Thực tập khai nghỉ', copyFrom: 'tts' });
  const save = await P.saveChanges(
    [
      { key: flag(closed, 'absenceDeclarable'), value: false },
      { key: flag(open, 'absenceDeclarable'), value: true }
    ],
    { month: M }
  );
  assert.equal(save.status, 200, JSON.stringify(save.data));
  await F.person('qa_pos_closed', 'staff', { type: closed, level: 1, shiftCode: 'n1' });
  await F.person('qa_pos_open', 'staff', { type: open, level: 1, shiftCode: 'n1' });
  const date = dayIn(M, 3);
  const warned = await saveSheet('qa_pos_closed', M, { [date]: { kind: 'unpaid' } });
  assert.equal(warned.status, 200, JSON.stringify(warned.data));
  assert.ok(
    warned.data.warnings.some(w => w.code === 'BENEFIT_NOT_ALLOWED'),
    JSON.stringify(warned.data.warnings)
  );
  const accepted = await saveSheet('qa_pos_open', M, { [date]: { kind: 'unpaid' } });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.data));
  assert.ok(
    !(accepted.data.warnings || []).some(w => w.code === 'BENEFIT_NOT_ALLOWED'),
    JSON.stringify(accepted.data.warnings)
  );
});

test('position-hardcoded-flags: GET /api/me của nhân sự trả cờ quyền lợi của chính chức vụ mình (leaveAccount, isat): TTS không có tài khoản phép và iSAT, NV có', async () => {
  await P.setupMonth();
  const tts = (await F.call('GET', '/me', { who: 'qa_tts1' })).data;
  const nv = (await F.call('GET', '/me', { who: 'qa_nv1' })).data;
  assert.equal(P.findKey(tts, 'leaveAccount'), false, 'TTS không có tài khoản phép');
  assert.equal(P.findKey(nv, 'leaveAccount'), true);
  assert.equal(P.findKey(tts, 'isat'), false);
  assert.equal(P.findKey(nv, 'isat'), true);
});

/* ================= entitlement-matrix-api ================= */
test('entitlement-matrix-api: GET /api/entitlements?month= trả { positions, blocks, cells, paramsRev }: đủ ba chức vụ mặc định, đủ tám thành phần, paramsRev khớp GET /api/settings/params', async () => {
  const M = await P.setupMonth();
  const res = await F.call('GET', `/entitlements?month=${M}`);
  assert.equal(res.status, 200, JSON.stringify(res.data).slice(0, 300));
  for (const name of ['positions', 'blocks', 'cells', 'paramsRev']) assert.ok(Object.hasOwn(res.data, name), name);
  const codes = codesIn({ positions: res.data.positions });
  for (const code of ['tts', 'ctv', 'nv']) assert.ok(codes.includes(code), `thiếu chức vụ ${code}`);
  assert.ok(Array.isArray(res.data.blocks) && res.data.blocks.length >= 8);
  const components = new Set<any>(res.data.blocks.map(b => String(b.component)));
  for (const n of ['1', '2', '3', '4', '5', '6', '7', '8']) assert.ok(components.has(n), `thiếu thành phần ${n}`);
  for (const block of res.data.blocks) assert.equal(typeof block.label, 'string', 'mỗi khối có nhãn');
  assert.ok(JSON.stringify(res.data.cells).length > 50, 'có ô của bảng');
  // ô của đi lại 15 % và chuyên cần 25 % (NV, CTV) nằm trong bảng
  assert.ok(JSON.stringify(res.data.cells).includes('0.15'), 'đi lại 15 %');
  assert.ok(JSON.stringify(res.data.cells).includes('0.25'), 'chuyên cần 25 %');
  assert.equal(res.data.paramsRev, await P.paramsRevOf(M));
});

test('entitlement-matrix-api: chức vụ vừa sao chép hiện thành cột mới của bảng; chỉ người có config.read đọc được (nhân sự 403, chưa đăng nhập 401); đọc không ghi gì', async () => {
  const M = await P.setupMonth();
  const code = await P.mustCopy(M, { label: 'Cột mới của bảng', copyFrom: 'nv' });
  const before = await F.snapshot();
  const res = await F.call('GET', `/entitlements?month=${M}`);
  assert.equal(res.status, 200);
  assert.ok(codesIn({ positions: res.data.positions }).includes(code), 'cột của chức vụ mới');
  assert.equal((await F.call('GET', `/entitlements?month=${M}`, { who: 'qa_nv1' })).status, 403);
  assert.equal((await F.call('GET', `/entitlements?month=${M}`, { who: null })).status, 401);
  assert.deepEqual(F.changedTables(before, await F.snapshot()), [], 'GET không ghi gì');
});

test('position-copy: tháng áp dụng đã chốt công vẫn thêm được chức vụ, kèm cảnh báo PERIOD_LOCKED', async () => {
  const M = await P.setupMonth();
  await P.advance(M, 'attendance_locked');
  const res = await P.copyPosition(M, { label: 'Chức vụ vào tháng đã khoá', copyFrom: 'nv' });
  assert.equal(res.status, 200, JSON.stringify(res.data).slice(0, 300));
  assert.ok(
    res.data.warnings.some(w => w.code === 'PERIOD_LOCKED'),
    JSON.stringify(res.data.warnings)
  );
  assert.ok((await P.paramRows()).some(r => /^position\.def\./.test(r.key) && r.effective_month === M));
});
