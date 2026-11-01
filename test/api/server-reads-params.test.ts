'use strict';
// Mọi kiểm đầu vào của máy chủ đọc bộ tham số của THÁNG qua monthParams(month), không dùng hằng số riêng (KPI_MAX, KPI_PASS,
// SCHED_OF, SCHED). Test hành vi:
//   - GET /api/kpi/scores báo kpiMax bằng DEFAULTS['level.<loại>.<bậc>.kpi'] cho mọi bậc ctv/nv; PUT /api/kpi/scores có amt vượt mức đó vẫn lưu, kèm cảnh báo KPI_OVER_CAP;
//   - mốc đạt KPI bằng type.<loại>.kpiPass (75);
//   - lịch PUT /api/sheet theo type.<loại>.dows (Thứ 7 của TTS kèm cảnh báo SHEET_OFF_SCHEDULE, của CTV/NV không cảnh báo).
// Mỗi test dùng một tháng riêng (test/helpers/period-api.ts → monthPool); dòng param_versions chỉ-thêm-dòng nên chỉ có hiệu lực từ tháng của nó trở đi.
const S = require('../helpers/settings-api');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const PunchRules = require('../../src/engine/punch');

const { F, store, DEFAULTS } = S;
const monthOf = S.monthPool();

before(F.start);
after(F.stop);

const LEVELS = ['ctv', 'nv'].flatMap(type =>
  Object.keys(DEFAULTS)
    .filter(key => new RegExp(`^level\\.${type}\\.\\d+\\.kpi$`).test(key))
    .map(key => ({ type, level: Number(key.split('.')[2]), max: DEFAULTS[key] }))
);
const sheetPut = async (who?, month?, days?) => await F.call('PUT', '/sheet', { who, body: { month, days } });
const insertParam = async (key?, month?, valueJson?) =>
  await store.db
    .prepare(
      'INSERT INTO param_versions (key, effective_month, value_json, reason, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(key, month, valueJson, 'Thử tham số cho test S5(a)', 'admin', new Date(Date.now()).toISOString());

/* ================= KPI tối đa và mốc đạt ================= */
test('KPI tối đa: GET /api/kpi/scores báo kpiMax bằng DEFAULTS level.<loại>.<bậc>.kpi cho MỌI bậc ctv và nv; TTS không có KPI', async () => {
  assert.ok(LEVELS.length >= 8, `phải có đủ bậc ctv và nv trong DEFAULTS (có ${LEVELS.length})`);
  const M = monthOf();
  await S.seed(M);
  for (const { type, level } of LEVELS)
    await F.person(`qa_k_${type}${level}`, 'staff', { type, level, startDate: '2026-01-05' });
  const res = await F.call('GET', `/kpi/scores?month=${M}`);
  assert.equal(res.status, 200, JSON.stringify(res.data).slice(0, 200));
  const items = res.data.items || res.data.rows || res.data.people || res.data;
  for (const { type, level, max } of LEVELS) {
    const item = items.find(x => x.username === `qa_k_${type}${level}`);
    assert.ok(item, `thiếu ${type} bậc ${level}`);
    assert.equal(item.kpiMax, max, `${type} bậc ${level}`);
  }
  const tts = items.find(x => x.username === 'qa_tts1');
  assert.ok(!tts || tts.kpiMax === null, 'TTS không có KPI tối đa');
});

test('KPI tối đa: PUT /api/kpi/scores với lương KPI vượt mức của bậc vẫn lưu kèm cảnh báo KPI_OVER_CAP (nêu mức tối đa), bằng mức thì lưu không cảnh báo; trên mọi bậc ctv/nv', async () => {
  const M = monthOf();
  await S.seed(M);
  for (const { type, level, max } of LEVELS) {
    const username = `qa_k_${type}${level}`;
    await F.person(username, 'staff', { type, level, startDate: '2026-01-05' });
    const over = await F.call('PUT', '/kpi/scores', { body: { user: username, month: M, amt: max + 1 } });
    assert.equal(over.status, 200, `${type} bậc ${level}: ${JSON.stringify(over.data)}`);
    const capWarning = over.data.warnings.find(w => w.code === 'KPI_OVER_CAP');
    assert.ok(capWarning, JSON.stringify(over.data.warnings));
    assert.match(capWarning.message, /vượt mức tối đa/);
    const ok = await F.call('PUT', '/kpi/scores', { body: { user: username, month: M, amt: max } });
    assert.equal(ok.status, 200, `${type} bậc ${level}: ${JSON.stringify(ok.data)}`);
    assert.ok(!(ok.data.warnings || []).some(w => w.code === 'KPI_OVER_CAP'));
    assert.equal((await store.getSheet(username, M)).kpiAdmAmt, max);
  }
});

test('Mốc đạt KPI bằng type.<loại>.kpiPass (75): điểm tổng đúng 75 là đạt, dưới 75 thì không (PUT /api/kpi/scores)', async () => {
  const M = monthOf();
  await S.seed(M);
  for (const type of ['ctv', 'nv']) assert.equal(DEFAULTS[`type.${type}.kpiPass`], 75);
  const put = async (username?, scores?) =>
    await F.call('PUT', '/kpi/scores', { body: { user: username, month: M, scores } });
  for (const type of ['ctv', 'nv']) {
    const username = `qa_p_${type}`;
    await F.person(username, 'staff', { type, level: 1, startDate: '2026-01-05' });
    const at = await put(username, { wework: 75, user: 75, peer: 75, manager: 75, self: 75 });
    assert.equal(at.status, 200, JSON.stringify(at.data));
    const item = at.data.item || at.data;
    assert.equal(item.total, 75, type);
    assert.equal(item.pass, true, `${type}: đúng mốc là đạt`);
    const below = await put(username, { wework: 75, user: 75, peer: 75, manager: 75, self: 74 });
    const low = below.data.item || below.data;
    assert.ok(low.total < 75, `${type}: tổng ${low.total}`);
    assert.equal(low.pass, false, `${type}: dưới mốc`);
  }
});

/* ================= lịch theo loại nhân sự ================= */
test('PUT /api/sheet theo lịch type.<loại>.dows: Thứ 7 của TTS kèm cảnh báo SHEET_OFF_SCHEDULE (ngoài lịch), của CTV và NV không cảnh báo; Chủ nhật kèm cảnh báo SHEET_SUNDAY', async () => {
  const M = monthOf();
  await S.seed(M);
  const sat = S.dowDates(M, 6)[0];
  const sun = S.dowDates(M, 0)[0];
  const [tin, tout] = PunchRules.SHIFT.n1;
  const work = { kind: 'work', in: tin, out: tout, preset: 'n1' };
  await F.person('qa_s_tts', 'staff', { type: 'tts', level: 1, shiftCode: 'n1', startDate: '2026-01-05' });
  await F.person('qa_s_ctv', 'staff', { type: 'ctv', level: 1, shiftCode: 'n1', startDate: '2026-01-05' });
  await F.person('qa_s_nv', 'staff', { type: 'nv', level: 1, shiftCode: 'n1', startDate: '2026-01-05' });
  const tts = await sheetPut('qa_s_tts', M, { [sat]: work });
  assert.equal(tts.status, 200, JSON.stringify(tts.data));
  const off = tts.data.warnings.find(w => w.code === 'SHEET_OFF_SCHEDULE');
  assert.ok(off, JSON.stringify(tts.data.warnings));
  assert.match(off.message, /ngoài lịch làm việc/);
  for (const who of ['qa_s_ctv', 'qa_s_nv']) {
    const res = await sheetPut(who, M, { [sat]: work });
    assert.equal(res.status, 200, who);
    assert.ok(!(res.data.warnings || []).some(w => w.code === 'SHEET_OFF_SCHEDULE'), `${who}: Thứ 7 trong lịch`);
  }
  for (const who of ['qa_s_tts', 'qa_s_ctv', 'qa_s_nv']) {
    const res = await sheetPut(who, M, { [sun]: work });
    assert.equal(res.status, 200, `${who}: Chủ nhật`);
    const sunday = res.data.warnings.find(w => w.code === 'SHEET_SUNDAY');
    assert.ok(sunday, `${who}: ${JSON.stringify(res.data.warnings)}`);
    assert.match(sunday.message, /Chủ nhật/);
  }
  for (const [type, dows] of Object.entries<any>({
    tts: [1, 2, 3, 4, 5],
    ctv: [1, 2, 3, 4, 5, 6],
    nv: [1, 2, 3, 4, 5, 6]
  }))
    assert.deepEqual(DEFAULTS[`type.${type}.dows`], dows, `DEFAULTS type.${type}.dows`);
});
