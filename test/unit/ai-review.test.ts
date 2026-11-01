'use strict';
// Soát dữ liệu trước khi chốt lương (lib/ai/review.ts): mỗi luật có ca phải bắn và ca sát ngưỡng không được bắn.
// Toàn người giả, tháng 10/2026. 04/11/2026 là sau hạn mùng 3; 10/2026 có Thứ Bảy 3, 10, 17, 24, 31.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { assertPlain } = require('../helpers/plain-text');
const fs = require('node:fs');
const path = require('node:path');
const { review, RULES, EVIDENCE_FIELDS } = require('../../lib/ai/review.ts');
const { THRESHOLDS } = require('../../lib/ai/thresholds.ts');
const W = require('./ai-review-world.js');
const { declaredPunches } = require('../helpers/declared-punches');

const { person, world, find, workDay, otDay, makeupHoursDay, closedSession, openSessionFor, payroll } = W;
const run = async (options?) => review(await world(options));
const ids = (result?, rule?) => find(result, rule).map(f => `${f.username}|${f.date || f.month}`);

test('đầu vào sai bị từ chối, không đoán', async () => {
  assert.throws(() => review({ month: '2026-10', asOf: 'không phải giờ' }), /asOf/);
  assert.throws(() => review({ month: '2026-13', asOf: W.ASOF }), /month/);
  await assert.rejects(async () => review(await world({ thresholds: { khongCo: 1 } })), /Ngưỡng không có trong bảng/);
  await assert.rejects(async () => review(await world({ thresholds: { isatPerMonth: '4' } })), /sai kiểu/);
});

test('review thuần: không sửa đầu vào, không đọc đồng hồ, không I/O', async () => {
  const a = await person('qa_a');
  const input = await world({
    people: [a],
    days: { qa_a: { '2026-10-03': { kind: 'isat' }, '2026-10-10': { kind: 'isat' } } }
  });
  const before = JSON.stringify(input);
  const realNow = Date.now;
  Date.now = () => {
    throw new Error('review() không được đọc đồng hồ');
  };
  try {
    await review(input);
  } finally {
    Date.now = realNow;
  }
  assert.equal(JSON.stringify(input), before);
  for (const file of ['review.ts', 'thresholds.ts']) {
    const source = fs.readFileSync(path.join(__dirname, '../../lib/ai', file), 'utf8');
    assert.ok(!/Date\.now\(|new Date\(\)|require\(['"]node:(fs|http|https|net|child_process)/.test(source), file);
    assert.ok(!/fetch\(|XMLHttpRequest|https?:\/\/(?!docs)/.test(source.replace(/\/\/.*$/gm, '')), file);
  }
});

/* ---------- tần suất khai ---------- */
test('isat-frequency: iSAT lần thứ 4 trở đi bị gắn, 3 lần thì không', async () => {
  const a = await person('qa_a');
  const four = { '2026-10-03': { kind: 'isat' }, '2026-10-10': { kind: 'isat' }, '2026-10-17': { kind: 'isat' } };
  const near = await run({ people: [a], days: { qa_a: four } });
  assert.deepEqual(ids(near, 'isat-frequency'), []);
  const hit = await run({
    people: [a],
    days: { qa_a: { ...four, '2026-10-24': { kind: 'isat' }, '2026-10-31': { kind: 'isat' } } }
  });
  assert.deepEqual(ids(hit, 'isat-frequency'), ['qa_a|2026-10-24', 'qa_a|2026-10-31']);
  const fifth = find(hit, 'isat-frequency', 'qa_a', '2026-10-31')[0];
  assert.equal(fifth.message, 'iSAT lần thứ 5 trong tháng');
  assert.deepEqual(fifth.evidence.inputs, { ordinal: 5, count: 5 });
  assert.equal(fifth.evidence.threshold.isatPerMonth, 4);
  assert.equal(fifth.evidence.threshold.proposal, true);
  assert.equal(fifth.item, 'isat');
});

test('isat-frequency: đếm theo từng người, không cộng chung', async () => {
  const people = [await person('qa_a'), await person('qa_b')];
  const sat = (d?) => ({ [d]: { kind: 'isat' } });
  const result = await run({
    people,
    days: { qa_a: { ...sat('2026-10-03'), ...sat('2026-10-10') }, qa_b: { ...sat('2026-10-17'), ...sat('2026-10-24') } }
  });
  assert.deepEqual(ids(result, 'isat-frequency'), []);
});

test('approved-leave-frequency: Nghỉ được duyệt lần thứ 3 bị gắn, 2 lần thì không', async () => {
  const a = await person('qa_a');
  const two = { '2026-10-05': { kind: 'approved' }, '2026-10-06': { kind: 'approved' } };
  assert.deepEqual(ids(await run({ people: [a], days: { qa_a: two } }), 'approved-leave-frequency'), []);
  const three = { ...two, '2026-10-07': { kind: 'approved' } };
  const hit = await run({ people: [a], days: { qa_a: three } });
  assert.deepEqual(ids(hit, 'approved-leave-frequency'), ['qa_a|2026-10-07']);
  assert.equal(find(hit, 'approved-leave-frequency')[0].message, 'Nghỉ được duyệt lần thứ 3 trong tháng');
});

test('ngưỡng đổi được ở một chỗ: thresholds ghi đè và được đánh dấu proposal', async () => {
  const a = await person('qa_a');
  const days = { qa_a: { '2026-10-03': { kind: 'isat' }, '2026-10-10': { kind: 'isat' } } };
  const hit = await run({ people: [a], days, thresholds: { isatPerMonth: 2 } });
  assert.deepEqual(ids(hit, 'isat-frequency'), ['qa_a|2026-10-10']);
  assert.equal(hit.findings.find(f => f.rule === 'isat-frequency').evidence.threshold.isatPerMonth, 2);
});

/* ---------- Check-in cùng ngày khai nghỉ ---------- */
test('leave-with-checkin: ngày khai nghỉ có Check-in bị gắn, kèm giờ vào – ra', async () => {
  const a = await person('qa_a');
  const days = { qa_a: { '2026-10-07': { kind: 'leave' } } };
  const hit = await run({
    people: [a],
    days,
    sessions: [await closedSession('qa_a', 'n1', '2026-10-07', '08:12', '17:05')]
  });
  const f = find(hit, 'leave-with-checkin', 'qa_a', '2026-10-07')[0];
  assert.ok(f);
  assert.equal(f.message, 'Có Check-in ngày này (08:12 đến 17:05)');
  assert.deepEqual(f.evidence.inputs, { kind: 'leave', sessions: 1, firstIn: '08:12', lastOut: '17:05' });
  assert.equal(f.severity, 'high');
});

test('leave-with-checkin: Check-in ngày liền kề, ca đêm sang ngày khai nghỉ, hoặc ngày đi làm thì không gắn', async () => {
  const a = await person('qa_a', { shiftCode: 'g2' });
  const days = { qa_a: { '2026-10-08': { kind: 'approved' }, '2026-10-06': { kind: 'isat' } } };
  const sessions = [
    await closedSession('qa_a', 'g2', '2026-10-07', '22:00', '07:00', 1), // ca đêm bắt đầu 07/10, ra sáng 08/10: thuộc ngày công 07/10
    await closedSession('qa_a', 'g2', '2026-10-05', '22:00', '07:00', 1)
  ];
  assert.deepEqual(ids(await run({ people: [a], days, sessions }), 'leave-with-checkin'), []);
  // ngày công của ca đêm bắt đầu đúng ngày khai nghỉ thì gắn
  const hit = await run({ people: [a], days: { qa_a: { '2026-10-07': { kind: 'leave' } } }, sessions });
  assert.deepEqual(ids(hit, 'leave-with-checkin'), ['qa_a|2026-10-07']);
});

test('leave-with-checkin: lượt đang mở cũng tính là có mặt', async () => {
  const a = await person('qa_a');
  const hit = await run({
    people: [a],
    days: { qa_a: { '2026-10-07': { kind: 'approved' } } },
    sessions: [await openSessionFor('qa_a', 'n1', '2026-10-07', '08:30')]
  });
  const f = find(hit, 'leave-with-checkin')[0];
  assert.ok(f);
  assert.equal(f.evidence.inputs.lastOut, null);
  assert.match(f.message, /chưa Check-out/);
});

/* ---------- hạn khai và lịch sử ---------- */
test('late-declaration TẮT mặc định (23/10/2026): không phát hiện nào, ghi checked.skipped { rule, reason: "Admin tắt" }; bật ai.rule.lateDeclaration.enabled thì chạy', async () => {
  const a = await person('qa_a');
  const input = {
    people: [a],
    days: { qa_a: { '2026-10-10': { kind: 'isat' } } },
    rows: { 'qa_a|2026-10-10': { submittedAt: '2026-11-03T17:30:00.000Z' } } // 00:30 04/11 giờ VN: sau hạn
  };
  const off = await run(input);
  assert.deepEqual(ids(off, 'late-declaration'), []);
  assert.deepEqual(
    off.checked.skipped.filter(s => s.rule === 'late-declaration'),
    [{ rule: 'late-declaration', reason: 'Admin tắt' }]
  );
  assert.ok(!off.checked.ruleIds.includes('late-declaration'));
  const on = await run({ ...input, lateOn: true });
  assert.deepEqual(ids(on, 'late-declaration'), ['qa_a|2026-10-10']);
  assert.ok(on.checked.ruleIds.includes('late-declaration'));
});

test('late-declaration (bật): khai sau 23:59 ngày mùng 3 bị gắn, đúng hạn thì không', async () => {
  const a = await person('qa_a');
  const days = {
    qa_a: { '2026-10-03': { kind: 'isat' }, '2026-10-10': { kind: 'isat' }, '2026-10-17': { kind: 'isat' } }
  };
  const result = await run({
    lateOn: true,
    people: [a],
    days,
    rows: {
      'qa_a|2026-10-03': { submittedAt: '2026-11-03T16:30:00.000Z' }, // 23:30 03/11 giờ VN: kịp hạn
      'qa_a|2026-10-10': { submittedAt: '2026-11-03T17:30:00.000Z' }, // 00:30 04/11 giờ VN: trễ
      'qa_a|2026-10-17': { submittedAt: '2026-10-20T03:00:00.000Z' }
    }
  });
  assert.deepEqual(ids(result, 'late-declaration'), ['qa_a|2026-10-10']);
  const f = find(result, 'late-declaration')[0];
  assert.equal(f.message, 'Khai ngày 04/11, sau hạn mùng 3');
  assert.deepEqual(f.evidence.inputs, { submittedDate: '2026-11-04', deadlineDate: '2026-11-03', daysLate: 1 });
  assert.equal(f.evidence.threshold.reportDeadlineDay, 3);
  assert.equal(f.evidence.threshold.proposal, false);
});

test('late-declaration (bật): hạn tính theo tháng của ngày khai, kể cả tháng 12 sang năm sau', async () => {
  const a = await person('qa_a');
  const input = await world({
    lateOn: true,
    people: [a],
    month: '2026-12',
    asOf: '2027-01-10T09:00:00+07:00',
    days: { qa_a: { '2026-12-05': { kind: 'approved' } } },
    rows: { 'qa_a|2026-12-05': { submittedAt: '2027-01-04T02:00:00.000Z' } }
  });
  const f = find(await review(input), 'late-declaration')[0];
  assert.equal(f.evidence.inputs.deadlineDate, '2027-01-03');
});

test('previously-rejected: khoản cùng loại bị từ chối gần đây thì gắn, loại khác hoặc quá cũ hoặc người khác thì không', async () => {
  const a = await person('qa_a');
  const days = { qa_a: { '2026-10-14': { kind: 'approved' } } };
  const rejected = (extra: any = {}) => ({
    username: 'qa_a',
    date: '2026-10-08',
    item: 'approved',
    fingerprint: 'approved',
    status: 'rejected',
    rev: 2,
    submittedAt: '2026-10-08T02:00:00.000Z',
    decidedBy: 'admin',
    decidedAt: '2026-10-10T03:00:00.000Z',
    note: 'GHI CHÚ RIÊNG KHÔNG ĐƯỢC LỘ',
    ...extra
  });
  const hit = await run({ people: [a], days, extraRows: [rejected()] });
  const f = find(hit, 'previously-rejected')[0];
  assert.equal(f.message, 'Lần trước bị từ chối (08/10)');
  assert.deepEqual(f.evidence.inputs, { rejectedDate: '2026-10-08', rejectedOn: '2026-10-10', rejectedCount: 1 });
  assert.ok(!JSON.stringify(f).includes('GHI CHÚ RIÊNG'));
  const otherItem = await run({ people: [a], days, extraRows: [rejected({ item: 'isat' })] });
  assert.deepEqual(ids(otherItem, 'previously-rejected'), []);
  const old = await run({
    people: [a],
    days,
    extraRows: [rejected({ date: '2026-06-08', decidedAt: '2026-06-10T03:00:00.000Z' })]
  });
  assert.deepEqual(ids(old, 'previously-rejected'), []);
  const otherPerson = await run({
    people: [a, await person('qa_b')],
    days,
    extraRows: [rejected({ username: 'qa_b' })]
  });
  assert.deepEqual(ids(otherPerson, 'previously-rejected'), []);
});

test('repeated-edits: khai báo đổi từ 2 lần (rev 3) bị gắn, rev 2 thì không', async () => {
  const a = await person('qa_a');
  const days = { qa_a: { '2026-10-14': { kind: 'approved' }, '2026-10-15': { kind: 'approved' } } };
  const result = await run({
    people: [a],
    days,
    rows: { 'qa_a|2026-10-14': { rev: 3 }, 'qa_a|2026-10-15': { rev: 2 } }
  });
  assert.deepEqual(ids(result, 'repeated-edits'), ['qa_a|2026-10-14']);
});

/* ---------- OT, làm bù, Check-in ---------- */
test('ot-checkin-mismatch: OT khai 17:00-19:00 mà Check-out 17:40 bị gắn, lệch dưới 30 phút thì không', async () => {
  const a = await person('qa_a');
  const days = { qa_a: { '2026-10-06': otDay('19:00') } };
  const hit = await run({
    people: [a],
    days,
    sessions: [await closedSession('qa_a', 'n1', '2026-10-06', '08:00', '17:40')]
  });
  const f = find(hit, 'ot-checkin-mismatch')[0];
  assert.ok(f);
  assert.equal(f.message, 'Khai 17:00-19:00, Check-in/out chỉ phủ 40 phút (thiếu 80 phút)');
  assert.deepEqual(f.evidence.inputs, {
    item: 'ot',
    declared: ['17:00-19:00'],
    presence: ['08:00-17:40'],
    declaredMin: 120,
    coveredMin: 40,
    shortfallMin: 80
  });
  const near = await run({
    people: [a],
    days,
    sessions: [await closedSession('qa_a', 'n1', '2026-10-06', '08:00', '18:50')]
  });
  assert.deepEqual(ids(near, 'ot-checkin-mismatch'), []);
  const edge = await run({
    people: [a],
    days,
    sessions: [await closedSession('qa_a', 'n1', '2026-10-06', '08:00', '18:30')]
  });
  assert.deepEqual(ids(edge, 'ot-checkin-mismatch'), ['qa_a|2026-10-06']); // thiếu đúng 30 phút: bằng ngưỡng thì gắn
});

test('ot-checkin-mismatch: khai OT mà không có Check-in nào bị gắn, kể cả OT ngắn', async () => {
  const a = await person('qa_a');
  const hit = await run({ people: [a], days: { qa_a: { '2026-10-06': otDay('17:20') } }, sessions: [] });
  const f = find(hit, 'ot-checkin-mismatch')[0];
  assert.ok(f);
  assert.match(f.message, /không có Check-in ngày này/);
  assert.equal(f.evidence.inputs.coveredMin, 0);
});

test('ot-checkin-mismatch: lượt còn mở hoặc ngày chưa tới thì không kết luận', async () => {
  const a = await person('qa_a');
  const days = { qa_a: { '2026-10-06': otDay('19:00') } };
  const open = await run({ people: [a], days, sessions: [await openSessionFor('qa_a', 'n1', '2026-10-06', '08:00')] });
  assert.deepEqual(ids(open, 'ot-checkin-mismatch'), []);
  const future = await run({ people: [a], days, asOf: '2026-10-06T10:00:00+07:00' });
  assert.deepEqual(ids(future, 'ot-checkin-mismatch'), []);
});

test('ot-checkin-mismatch: làm bù theo giờ đối chiếu như OT; ngày loại cũ makeup không có khoản để đối chiếu', async () => {
  const tts = await person('qa_t', { type: 'tts', shiftCode: 'n1' });
  const a = await person('qa_a');
  const days = {
    qa_a: { '2026-10-06': makeupHoursDay('18:00') },
    qa_t: { '2026-10-10': { kind: 'makeup', in: '08:00', out: '16:00' } } // Thứ Bảy, loại ngày cũ
  };
  const sessions = [
    await closedSession('qa_a', 'n1', '2026-10-06', '08:00', '17:00'),
    await closedSession('qa_t', 'n1', '2026-10-10', '08:00', '12:00')
  ];
  const result = await run({ people: [a, tts], days, sessions });
  assert.deepEqual(ids(result, 'ot-checkin-mismatch'), ['qa_a|2026-10-06']);
  assert.equal(find(result, 'ot-checkin-mismatch', 'qa_a')[0].evidence.inputs.item, 'makeup_hours');
});

test('ot-after-pending-makeup: OT chờ duyệt sau một khoản làm bù đang chờ thì gắn, làm bù sau OT hoặc đã duyệt thì không', async () => {
  const a = await person('qa_a');
  const days = { qa_a: { '2026-10-06': makeupHoursDay(), '2026-10-08': otDay() } };
  const hit = await run({ people: [a], days });
  const f = find(hit, 'ot-after-pending-makeup')[0];
  assert.equal(f.date, '2026-10-08');
  assert.equal(f.message, 'Chờ duyệt làm bù 06/10 trước OT này');
  assert.deepEqual(f.evidence.inputs, { makeupDates: ['2026-10-06'], makeupCount: 1 });
  const later = await run({ people: [a], days: { qa_a: { '2026-10-08': otDay(), '2026-10-09': makeupHoursDay() } } });
  assert.deepEqual(ids(later, 'ot-after-pending-makeup'), []);
  const approved = await run({ people: [a], days, rows: { 'qa_a|2026-10-06': { status: 'approved' } } });
  assert.deepEqual(ids(approved, 'ot-after-pending-makeup'), []);
  const otherPerson = await run({
    people: [a, await person('qa_b')],
    days: { qa_a: { '2026-10-08': otDay() }, qa_b: { '2026-10-06': makeupHoursDay() } }
  });
  assert.deepEqual(ids(otherPerson, 'ot-after-pending-makeup'), []);
});

test('holiday-work-review: mọi khoản Đi làm ngày lễ được gắn, ngày thường thì không', async () => {
  const a = await person('qa_a');
  const days = { qa_a: { '2026-10-12': workDay(), '2026-10-13': workDay() } };
  const result = await run({ people: [a], days, holidays: ['2026-10-12'] });
  assert.deepEqual(ids(result, 'holiday-work-review'), ['qa_a|2026-10-12']);
  const f = find(result, 'holiday-work-review')[0];
  assert.equal(f.evidence.inputs.hours, 9);
  assert.equal(
    f.message,
    'Có 9 giờ OT vào ngày lễ. Cần kiểm tra khoản này vì giờ OT được duyệt trong ngày lễ tính OT ngày lễ (tiền lớn).'
  );
});

test('ot-above-team: OT từ 2 lần trung vị và từ 8 giờ bị gắn; ít người, ít giờ thì không', async () => {
  const team = ['qa_1', 'qa_2', 'qa_3', 'qa_4', 'qa_5'].map(u => person(u));
  const heavy = await person('qa_heavy');
  const light = ['qa_1', 'qa_2', 'qa_3', 'qa_4', 'qa_5'].map(u => [u, { '2026-10-05': otDay('20:00') }]);
  const heavyDays = Object.fromEntries(
    ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'].map(d => [d, otDay('20:00')])
  );
  const hit = await run({ people: [...team, heavy], days: { ...Object.fromEntries(light), qa_heavy: heavyDays } });
  assert.deepEqual(ids(hit, 'ot-above-team'), ['qa_heavy|2026-10']);
  assert.deepEqual(find(hit, 'ot-above-team')[0].evidence.inputs, { otHours: 12, teamMedianHours: 3, peers: 6 });
  // 7 giờ: cao hơn 2 lần trung vị nhưng dưới 8 giờ
  const mid = { '2026-10-05': otDay('20:00'), '2026-10-06': otDay('20:00'), '2026-10-07': otDay('18:00') };
  const near = await run({ people: [...team, heavy], days: { ...Object.fromEntries(light), qa_heavy: mid } });
  assert.deepEqual(ids(near, 'ot-above-team'), []);
  // chỉ 3 người có OT: không đủ để lấy trung vị
  const few = await run({
    people: [team[0], team[1], heavy],
    days: { qa_1: light[0][1], qa_2: light[1][1], qa_heavy: heavyDays }
  });
  assert.deepEqual(ids(few, 'ot-above-team'), []);
});

/* ---------- chuyên cần và tiền ---------- */
test('attendance-allowance-risk: iSAT duyệt hay từ chối đều là một ngày nghỉ, nên chỉ còn báo ngày làm đủ ngưỡng', async () => {
  const a = await person('qa_a');
  // hai ngày nghỉ không lương (không phải khoản cần duyệt) + một iSAT Thứ Bảy chờ duyệt: duyệt hay từ chối đều 3 ngày nghỉ (iSAT tính một ngày; từ chối thành nghỉ không lương)
  const days = {
    qa_a: { '2026-10-01': { kind: 'unpaid' }, '2026-10-02': { kind: 'unpaid' }, '2026-10-03': { kind: 'isat' } }
  };
  const hit = await run({ people: [a], days });
  const f = find(hit, 'attendance-allowance-risk', 'qa_a', '2026-10-03')[0];
  assert.ok(f);
  assert.equal(f.severity, 'high');
  assert.equal(f.message, 'Ngày nghỉ thứ 3, mất chuyên cần');
  assert.deepEqual(f.evidence.inputs, {
    pivotal: false,
    tipping: true,
    absentDaysIfApproved: 3,
    overHoursIfApproved: 16,
    attendOkIfApproved: false,
    absentDaysIfRejected: 3,
    overHoursIfRejected: 24,
    attendOkIfRejected: false
  });
  assert.equal(f.evidence.threshold.attendMaxAbsentDays, 3);
  assert.equal(f.evidence.threshold.proposal, false);
  // chỉ 1 ngày nghỉ không lương: duyệt hay không đều giữ chuyên cần
  const near = await run({
    people: [a],
    days: { qa_a: { '2026-10-02': { kind: 'unpaid' }, '2026-10-03': { kind: 'isat' } } }
  });
  assert.deepEqual(ids(near, 'attendance-allowance-risk'), []);
  // đã mất chuyên cần từ trước (3 ngày nghỉ không lương 01, 02, 05 và 06), khoản này không còn quyết định gì
  const lost = await run({
    people: [a],
    days: {
      qa_a: {
        '2026-10-01': { kind: 'unpaid' },
        '2026-10-02': { kind: 'unpaid' },
        '2026-10-05': { kind: 'unpaid' },
        '2026-10-06': { kind: 'unpaid' },
        '2026-10-10': { kind: 'isat' }
      }
    }
  });
  assert.deepEqual(ids(lost, 'attendance-allowance-risk'), []);
});

test('attendance-allowance-risk: "Nghỉ được duyệt" đã duyệt cũng là ngày nghỉ (Đ43) nên duyệt hay từ chối không còn đổi chuyên cần, chỉ còn báo ngày làm đủ ngưỡng', async () => {
  const a = await person('qa_a');
  // 2 ngày nghỉ không lương + 1 "Nghỉ được duyệt" chờ duyệt: duyệt thì 3 ngày nghỉ (24 giờ), từ chối thì cũng 3 (thành nghỉ không lương)
  const days = {
    qa_a: {
      '2026-10-05': { kind: 'unpaid' },
      '2026-10-06': { kind: 'unpaid' },
      '2026-10-07': { kind: 'approved' }
    }
  };
  const f = find(await run({ people: [a], days }), 'attendance-allowance-risk', 'qa_a', '2026-10-07')[0];
  assert.ok(f);
  assert.equal(f.message, 'Ngày nghỉ thứ 3, mất chuyên cần');
  assert.deepEqual(f.evidence.inputs, {
    pivotal: false,
    tipping: true,
    absentDaysIfApproved: 3,
    overHoursIfApproved: 24,
    attendOkIfApproved: false,
    absentDaysIfRejected: 3,
    overHoursIfRejected: 24,
    attendOkIfRejected: false
  });
  // chưa đủ ngưỡng thì không báo gì: 1 ngày nghỉ không lương + 1 "Nghỉ được duyệt"
  const near = await run({
    people: [a],
    days: { qa_a: { '2026-10-05': { kind: 'unpaid' }, '2026-10-07': { kind: 'approved' } } }
  });
  assert.deepEqual(ids(near, 'attendance-allowance-risk'), []);
});

test('attendance-allowance-risk: ngày phép là ngày nghỉ thứ 3 (không đổi theo duyệt) vẫn được gắn là ngày làm mất chuyên cần', async () => {
  const a = await person('qa_a');
  const days = {
    qa_a: { '2026-10-05': { kind: 'unpaid' }, '2026-10-06': { kind: 'unpaid' }, '2026-10-07': { kind: 'leave' } }
  };
  const result = await run({ people: [a], days });
  const f = find(result, 'attendance-allowance-risk', 'qa_a', '2026-10-07')[0];
  assert.ok(f);
  assert.equal(f.message, 'Ngày nghỉ thứ 3, mất chuyên cần');
  assert.equal(f.evidence.inputs.pivotal, false);
  assert.equal(f.evidence.inputs.tipping, true);
  // ngày phép thứ 2 chưa làm mất
  const second = await run({
    people: [a],
    days: { qa_a: { '2026-10-05': { kind: 'unpaid' }, '2026-10-07': { kind: 'leave' } } }
  });
  assert.deepEqual(ids(second, 'attendance-allowance-risk'), []);
});

test('attendance-allowance-risk: chỉ NV có chuyên cần; CTV và TTS không bị gắn', async () => {
  const ctv = await person('qa_c', { type: 'ctv' });
  const days = {
    qa_c: { '2026-10-05': { kind: 'unpaid' }, '2026-10-06': { kind: 'unpaid' }, '2026-10-07': { kind: 'leave' } }
  };
  assert.deepEqual(ids(await run({ people: [ctv], days }), 'attendance-allowance-risk'), []);
});

test('large-pay-impact: khoản làm đổi tiền từ 500.000 ₫ bị gắn, iSAT 230.769 ₫ thì không', async () => {
  const a = await person('qa_a');
  const days = { qa_a: { '2026-10-10': { kind: 'isat' }, '2026-10-12': workDay() } };
  const result = await run({ people: [a], days, holidays: ['2026-10-12'] });
  assert.deepEqual(ids(result, 'large-pay-impact'), ['qa_a|2026-10-12']);
  const f = find(result, 'large-pay-impact')[0];
  assert.ok(f.evidence.inputs.impactVnd >= 500000);
  assert.deepEqual(Object.keys(f.evidence.inputs), ['impactVnd']);
  assert.match(f.message, /^Nếu duyệt khoản này, tổng thu nhập sẽ tăng \d{1,3}(\.\d{3})* ₫\.$/);
  const lower = await run({ people: [a], days, holidays: ['2026-10-12'], thresholds: { impactVnd: 200000 } });
  assert.deepEqual(ids(lower, 'large-pay-impact'), ['qa_a|2026-10-10', 'qa_a|2026-10-12']);
  const isat = find(lower, 'large-pay-impact', 'qa_a', '2026-10-10')[0];
  assert.equal(isat.evidence.inputs.impactVnd, 230769);
});

test('pay: ngày đã duyệt không còn được rà bằng luật khoản chờ duyệt', async () => {
  const a = await person('qa_a');
  const days = { qa_a: { '2026-10-03': { kind: 'isat' }, '2026-10-12': workDay() } };
  const result = await run({
    people: [a],
    days,
    holidays: ['2026-10-12'],
    rows: { 'qa_a|2026-10-12': { status: 'approved' }, 'qa_a|2026-10-03': { status: 'rejected' } }
  });
  assert.deepEqual(
    result.findings.filter(f => f.item),
    []
  );
  const withApproved = await run({
    people: [a],
    days,
    holidays: ['2026-10-12'],
    rows: { 'qa_a|2026-10-12': { status: 'approved' } },
    thresholds: { impactVnd: 1 }
  });
  assert.deepEqual(ids(withApproved, 'large-pay-impact'), ['qa_a|2026-10-03']); // chỉ iSAT còn chờ
});

/* ---------- hồ sơ ---------- */
test('missing-start-date và negative-leave: dùng lại lib/data-quality, chỉ CTV/NV, không tính tài khoản khoá', async () => {
  const people = [
    await person('qa_a', { startDate: null }),
    await person('qa_t', { type: 'tts', startDate: null }),
    await person('qa_l', { startDate: null, locked: true, lockedAt: '2026-10-01T00:00:00Z' }),
    await person('qa_n', { startDate: '2026-09-01', leaveAdjust: 0 }),
    await person('qa_ok', { startDate: '2026-09-01', leaveAdjust: 0 })
  ];
  const days = {
    qa_n: { '2026-10-05': { kind: 'leave' }, '2026-10-06': { kind: 'leave' }, '2026-10-07': { kind: 'leave' } },
    qa_ok: { '2026-10-05': { kind: 'leave' }, '2026-10-06': { kind: 'leave' } }
  };
  const result = await run({ people, days });
  assert.deepEqual(ids(result, 'missing-start-date'), ['qa_a|2026-10']);
  assert.deepEqual(find(result, 'missing-start-date')[0].evidence.inputs, { type: 'nv' });
  assert.deepEqual(ids(result, 'negative-leave'), ['qa_n|2026-10']);
  assert.deepEqual(find(result, 'negative-leave')[0].evidence.inputs, { used: 3, accrued: 2, balance: -1 });
});

/* negative-leave và phép bị từ chối: ngày phép năm bị Admin từ chối đã trả lại phép nên không đếm; chờ duyệt và đã duyệt vẫn đếm */
const leaveMonth = async (dates?, rows: any = {}, extraPeople: any[] = []) => {
  const days = { qa_n: Object.fromEntries(dates.map(d => [`2026-10-${d}`, { kind: 'leave' }])) };
  // người vào làm 01/09/2026, không cộng tay: tới 04/11 đã tròn 2 tháng = 2 ngày phép
  return run({
    people: [await person('qa_n', { startDate: '2026-09-01', leaveAdjust: 0 }), ...extraPeople],
    days,
    rows
  });
};
const rejectedRow = (user?, date?, item = 'leave') => ({ [`${user}|2026-10-${date}`]: { status: 'rejected', item } });

test('negative-leave: 3 ngày phép chờ duyệt (người có 2 ngày phép) thì báo { used: 3, accrued: 2, balance: -1 }', async () => {
  const result = await leaveMonth(['05', '06', '07']);
  assert.deepEqual(ids(result, 'negative-leave'), ['qa_n|2026-10']);
  assert.deepEqual(find(result, 'negative-leave')[0].evidence.inputs, { used: 3, accrued: 2, balance: -1 });
});

test('negative-leave: 3 ngày phép, 1 hoặc 2 ngày bị từ chối thì phép đã trả lại: không báo', async () => {
  assert.deepEqual(ids(await leaveMonth(['05', '06', '07'], rejectedRow('qa_n', '07')), 'negative-leave'), []);
  const two = { ...rejectedRow('qa_n', '06'), ...rejectedRow('qa_n', '07') };
  assert.deepEqual(ids(await leaveMonth(['05', '06', '07'], two), 'negative-leave'), []);
});

test('negative-leave: 4 ngày phép, 1 bị từ chối, 3 chờ duyệt thì vẫn báo với used = 3', async () => {
  const result = await leaveMonth(['05', '06', '07', '08'], rejectedRow('qa_n', '08'));
  assert.deepEqual(ids(result, 'negative-leave'), ['qa_n|2026-10']);
  assert.deepEqual(find(result, 'negative-leave')[0].evidence.inputs, { used: 3, accrued: 2, balance: -1 });
});

test('negative-leave: dòng bị từ chối của khoản khác (isat) hoặc của người khác thì ngày phép vẫn đếm và vẫn báo', async () => {
  const sameDayOtherItem = await leaveMonth(['05', '06', '07'], rejectedRow('qa_n', '07', 'isat'));
  assert.deepEqual(ids(sameDayOtherItem, 'negative-leave'), ['qa_n|2026-10']);
  assert.equal(find(sameDayOtherItem, 'negative-leave')[0].evidence.inputs.used, 3);
  // dòng bị từ chối của người khác trên đúng ngày đó (qa_o cũng khai phép ngày 07) không trả phép cho qa_n
  const other = await run({
    people: [
      await person('qa_n', { startDate: '2026-09-01', leaveAdjust: 0 }),
      await person('qa_o', { startDate: '2026-10-01', leaveAdjust: 30 })
    ],
    days: {
      qa_n: { '2026-10-05': { kind: 'leave' }, '2026-10-06': { kind: 'leave' }, '2026-10-07': { kind: 'leave' } },
      qa_o: { '2026-10-07': { kind: 'leave' } }
    },
    rows: rejectedRow('qa_o', '07')
  });
  assert.deepEqual(ids(other, 'negative-leave'), ['qa_n|2026-10']);
});

test('negative-leave: ngày phép đã duyệt vẫn đếm (3 ngày đã duyệt thì báo)', async () => {
  const rows = {
    'qa_n|2026-10-05': { status: 'approved' },
    'qa_n|2026-10-06': { status: 'approved' },
    'qa_n|2026-10-07': { status: 'approved' }
  };
  const result = await leaveMonth(['05', '06', '07'], rows);
  assert.equal(find(result, 'negative-leave')[0].evidence.inputs.used, 3);
});

test('missing-fixed-shift: nhân sự chưa có ca hoặc mã ca không có trong bảng ca bị gắn mức cao, tài khoản khoá và Admin thì không', async () => {
  const people = [
    await person('qa_a', { shiftCode: null }),
    await person('qa_b', { shiftCode: 'khong-co' }),
    await person('qa_ok', { shiftCode: 'g1' }),
    await person('qa_lock', { shiftCode: null, locked: true }),
    { ...(await person('qa_admin', { shiftCode: null })), role: 'admin' }
  ];
  for (const asOf of ['2026-10-20T09:00:00+07:00', '2026-11-04T09:00:00+07:00']) {
    const result = await run({ people, asOf });
    assert.deepEqual(ids(result, 'missing-fixed-shift'), ['qa_a|2026-10', 'qa_b|2026-10'], asOf);
    const f = find(result, 'missing-fixed-shift', 'qa_a')[0];
    assert.equal(f.severity, 'high', asOf);
    assert.equal(f.message, 'Chưa có ca cố định: Check-in/out không gán được ca để tính giờ công');
    assert.deepEqual(f.evidence.inputs, { type: 'nv' });
  }
});

test('slip-override-gap: ô tiền Admin sửa lệch từ 500.000 ₫ và 20% bị gắn; lệch nhỏ thì không', async () => {
  const a = await person('qa_a');
  const workDays = Object.fromEntries(
    ['05', '06', '07', '08', '09', '12', '13', '14', '15', '16'].map(d => [`2026-10-${d}`, workDay()])
  );
  const slip = (values?) => [{ username: 'qa_a', month: '2026-10', values }];
  const opts = { people: [a], days: { qa_a: workDays } };
  // số tự tính của ô chuyên cần lấy từ chính phát hiện của bộ soát (ô lệch rất lớn nên chắc chắn bị gắn)
  const probe = find(
    await run({ ...opts, slipOverrides: await slip({ attendance: 100000000 }) }),
    'slip-override-gap'
  )[0];
  const attendance = probe.evidence.inputs.fields[0].computed;
  assert.ok(attendance > 0);
  const big = await run({ ...opts, slipOverrides: await slip({ attendance: attendance + 700000 }) });
  const f = find(big, 'slip-override-gap')[0];
  assert.ok(f);
  assert.deepEqual(f.evidence.inputs.fields, [
    { key: 'attendance', computed: attendance, override: attendance + 700000, diff: 700000 }
  ]);
  const small = await run({ ...opts, slipOverrides: await slip({ attendance: attendance + 400000 }) });
  assert.deepEqual(ids(small, 'slip-override-gap'), []);
  const ratio = await run({
    ...opts,
    slipOverrides: await slip({ attendance: attendance + 700000 }),
    thresholds: { slipDiffRatio: 5 }
  });
  assert.deepEqual(ids(ratio, 'slip-override-gap'), []);
  const wrongMonth = await run({
    ...opts,
    slipOverrides: [{ username: 'qa_a', month: '2026-09', values: { attendance: attendance + 700000 } }]
  });
  assert.deepEqual(ids(wrongMonth, 'slip-override-gap'), []);
  // ô số lượng (workDays...) không so được với số tự tính nên không bị gắn
  const quantity = await run({ ...opts, slipOverrides: await slip({ workDays: 99 }) });
  assert.deepEqual(ids(quantity, 'slip-override-gap'), []);
});

test('locked-with-pending: khoản chờ duyệt của tài khoản đã khoá bị gắn, tài khoản đang hoạt động thì không', async () => {
  const people = [
    await person('qa_lock', { locked: true, lockedAt: '2026-10-09T05:00:00.000Z' }),
    await person('qa_a')
  ];
  const days = { qa_lock: { '2026-10-14': { kind: 'approved' } }, qa_a: { '2026-10-14': { kind: 'approved' } } };
  const result = await run({ people, days });
  assert.deepEqual(ids(result, 'locked-with-pending'), ['qa_lock|2026-10-14']);
  assert.deepEqual(find(result, 'locked-with-pending')[0].evidence.inputs, { lockedSince: '2026-10-09' });
});

/* ---------- toàn bộ ---------- */
test('thiếu payroll: các luật cần công thức được bỏ qua và ghi lại, luật khác vẫn chạy', async () => {
  const a = await person('qa_a');
  const days = { qa_a: { '2026-10-14': { kind: 'approved' } } };
  const result = await review(
    await world({ people: [a], days, withPayroll: false, lateOn: true, rows: { 'qa_a|2026-10-14': { rev: 3 } } })
  );
  const skipped = result.checked.skipped.map(s => s.rule).sort();
  assert.deepEqual(skipped, [
    'attendance-allowance-risk',
    'kpi-self-100-streak',
    'large-pay-impact',
    'net-nonpositive',
    'ot-above-team',
    'slip-override-gap'
  ]);
  assert.deepEqual(ids(result, 'repeated-edits'), ['qa_a|2026-10-14']);
  assert.equal(result.checked.rules + skipped.length, RULES.length);
});

test('mỗi phát hiện tự giải thích: luật, đầu vào, ngưỡng, nguồn; bảng ngưỡng khớp luật', async () => {
  const a = await person('qa_a');
  const days = {
    qa_a: {
      '2026-10-10': { kind: 'isat' },
      '2026-10-17': { kind: 'isat' },
      '2026-10-24': { kind: 'isat' },
      '2026-10-31': { kind: 'isat' }
    }
  };
  const result = await run({ people: [a], days });
  assert.ok(result.findings.length > 0);
  for (const finding of result.findings) {
    assert.ok(finding.rule && finding.severity && finding.username && finding.message, finding.id);
    assert.ok(finding.evidence.inputs && finding.evidence.threshold, finding.id);
    assert.equal(typeof finding.evidence.threshold.proposal, 'boolean');
    assert.ok(finding.id.startsWith(`${finding.rule}:${finding.username}:`));
    assert.match(finding.digest, /^[0-9a-f]{8}$/);
  }
  for (const rule of RULES) {
    for (const name of rule.thresholds) assert.ok(Object.hasOwn(THRESHOLDS, name), `${rule.id}: ${name}`);
    assert.ok(rule.thresholds.length || rule.note, `${rule.id} cần ngưỡng số hoặc lời giải thích`);
  }
  for (const [name, item] of Object.entries<any>(THRESHOLDS)) {
    assert.equal(typeof item.proposal, 'boolean', name);
    assert.ok(item.source.length > 10, name);
  }
  assert.deepEqual(result.checked.ruleIds.length, result.checked.rules);
  assert.equal(result.checked.staff, 1);
  assert.equal(result.checked.days, 4);
});

test('evidence chỉ chứa trường luật cần: không tên, lương, ghi chú, mã duyệt; số tiền chỉ ở luật cần số tiền', async () => {
  const people = [
    await person('qa_a', { name: 'TÊN THẬT GIẢ ĐỊNH', level: 4, startDate: null }),
    await person('qa_lock', { locked: true, lockedAt: '2026-10-09T05:00:00.000Z' }),
    await person('qa_n', { startDate: '2026-09-01', leaveAdjust: 0, shiftCode: null })
  ];
  const days = {
    qa_a: {
      '2026-10-03': { kind: 'isat' },
      '2026-10-10': { kind: 'isat' },
      '2026-10-17': { kind: 'isat' },
      '2026-10-24': { kind: 'isat' },
      '2026-10-05': otDay('19:00'),
      '2026-10-07': { kind: 'leave' },
      '2026-10-12': workDay()
    },
    qa_lock: { '2026-10-14': { kind: 'approved' } },
    qa_n: { '2026-10-05': { kind: 'leave' }, '2026-10-06': { kind: 'leave' }, '2026-10-08': { kind: 'leave' } }
  };
  const result = await run({
    lateOn: true, // late-declaration tắt mặc định; bật để kiểm evidence của luật này
    people,
    days,
    holidays: ['2026-10-12'],
    sessions: [await closedSession('qa_a', 'n1', '2026-10-07', '08:12', '17:05')],
    rows: {
      'qa_a|2026-10-10': { rev: 4, note: ' GHI CHÚ RIÊNG', submittedAt: '2026-11-04T03:00:00.000Z' },
      'qa_a|2026-10-05': { note: 'GHI CHÚ RIÊNG' }
    },
    extraRows: [
      {
        username: 'qa_a',
        date: '2026-10-01',
        item: 'isat',
        fingerprint: 'isat',
        status: 'rejected',
        rev: 2,
        submittedAt: '2026-10-01T02:00:00.000Z',
        decidedBy: 'admin',
        decidedAt: '2026-10-02T03:00:00.000Z',
        note: 'GHI CHÚ RIÊNG'
      }
    ],
    slipOverrides: [{ username: 'qa_a', month: '2026-10', values: { attendance: 9000000 } }]
  });
  const rulesSeen = new Set<any>(result.findings.map(f => f.rule));
  for (const rule of [
    'isat-frequency',
    'leave-with-checkin',
    'late-declaration',
    'previously-rejected',
    'repeated-edits',
    'locked-with-pending'
  ])
    assert.ok(rulesSeen.has(rule), rule);
  const moneyRules = new Set<any>(['large-pay-impact', 'slip-override-gap']);
  for (const finding of result.findings) {
    const text = JSON.stringify(finding);
    assert.ok(!text.includes('TÊN THẬT'), finding.id);
    assert.ok(!text.includes('GHI CHÚ RIÊNG'), finding.id);
    assert.ok(!text.includes('decidedBy') && !text.includes('"name"') && !text.includes('"note"'), finding.id);
    const allowed = EVIDENCE_FIELDS[finding.rule];
    for (const key of Object.keys(finding.evidence.inputs)) assert.ok(allowed.includes(key), `${finding.rule}.${key}`);
    if (!moneyRules.has(finding.rule))
      for (const key of Object.keys(finding.evidence.inputs))
        assert.ok(!/vnd|salary|pay|base|amount|total|level/i.test(key), `${finding.rule}.${key} giống số tiền / lương`);
    assert.deepEqual(
      Object.keys(finding).filter(
        k =>
          ![
            'rule',
            'severity',
            'username',
            'month',
            'date',
            'item',
            'approval',
            'message',
            'evidence',
            'id',
            'digest'
          ].includes(k)
      ),
      []
    );
    if (finding.approval) assert.deepEqual(Object.keys(finding.approval), ['rev', 'fingerprint']);
  }
  // trường ngoài danh sách bị chặn ngay trong toFinding
  assert.ok(!EVIDENCE_FIELDS['isat-frequency'].includes('name'));
});

test('findings xếp mức cao trước, rồi theo người và ngày; checklist đủ mục kiểm tháng', async () => {
  const people = [await person('qa_a'), await person('qa_b', { startDate: null })];
  const days = { qa_a: { '2026-10-07': { kind: 'leave' } }, qa_b: { '2026-10-10': { kind: 'isat' } } };
  const result = await run({
    people,
    days,
    sessions: [await closedSession('qa_a', 'n1', '2026-10-07', '08:00', '17:00')],
    holidays: ['2026-10-12', '2026-11-02']
  });
  const ranks = result.findings.map(f => ({ high: 0, medium: 1, low: 2 })[f.severity]);
  assert.deepEqual(
    ranks,
    [...ranks].sort((x: any, y: any) => x - y)
  );
  const byId = Object.fromEntries(result.checklist.map(item => [item.id, item]));
  for (const id of [
    'pending-items',
    'flagged-items',
    'punch-waiting',
    'profile-gaps',
    'kpi-unapproved',
    'slip-overrides',
    'holidays'
  ])
    assert.ok(byId[id], id);
  assert.equal(byId['pending-items'].count, 2);
  assert.equal(byId['pending-items'].status, 'attention');
  assert.equal(byId['flagged-items'].count, 1); // chỉ ngày nghỉ có Check-in; iSAT của qa_b không có lý do
  assert.equal(byId.holidays.count, 1);
  assert.equal(byId['profile-gaps'].count, 1);
  // không có mục "Hạn nhân sự báo công" và không câu nào đếm ngược tới hạn báo công
  assert.equal(byId['report-deadline'], undefined);
  assert.doesNotMatch(JSON.stringify(result.checklist), /Hạn nhân sự báo công|đã qua \d+ ngày|còn \d+ ngày/);
  assert.equal(result.summary.total, result.findings.length);
});

test('attendance-allowance-risk: 3 iSAT chờ duyệt mà không có ngày nghỉ khác thì chỉ khoản làm đủ ngưỡng (ngày nghỉ thứ 3) bị gắn', async () => {
  const a = await person('qa_a');
  const days = {
    qa_a: { '2026-10-03': { kind: 'isat' }, '2026-10-10': { kind: 'isat' }, '2026-10-17': { kind: 'isat' } }
  };
  assert.deepEqual(ids(await run({ people: [a], days }), 'attendance-allowance-risk'), ['qa_a|2026-10-17']);
  // thêm 2 ngày nghỉ không lương thật: ngày nghỉ thứ 3 rơi vào ngày nghỉ không lương (không phải khoản iSAT), nên không iSAT nào bị gắn
  const withUnpaid = { qa_a: { ...days.qa_a, '2026-10-05': { kind: 'unpaid' }, '2026-10-06': { kind: 'unpaid' } } };
  const hit = await run({ people: [a], days: withUnpaid });
  assert.deepEqual(ids(hit, 'attendance-allowance-risk'), []);
});

test('chuyên cần theo Check-in/out: cùng kết luận khi chấm công đủ, mất chuyên cần khi không chấm ngày nào', async () => {
  const a = await person('qa_a');
  const days = {
    qa_a: { '2026-10-05': { kind: 'unpaid' }, '2026-10-06': { kind: 'unpaid' }, '2026-10-07': { kind: 'approved' } }
  };
  const worked: any[] = [];
  for (let day = 1; day <= 31; day++) {
    const date = `2026-10-${String(day).padStart(2, '0')}`;
    const dow = new Date(date + 'T00:00:00Z').getUTCDay();
    if (dow === 0 || ['2026-10-05', '2026-10-06', '2026-10-07'].includes(date)) continue;
    worked.push(await closedSession('qa_a', 'n1', date, '08:00', '17:00'));
  }
  const hit = await review(await world({ people: [a], days, sessions: worked }));
  assert.equal(hit.checked.payrollErrors, 0);
  const f = find(hit, 'attendance-allowance-risk', 'qa_a', '2026-10-07')[0];
  assert.ok(f);
  assert.equal(f.evidence.inputs.absentDaysIfRejected, 3);
  assert.equal(f.evidence.inputs.attendOkIfApproved, false); // ngày nghỉ thứ 3 mất chuyên cần dù duyệt hay từ chối
  // không có chấm công nào: mọi ngày khai đi làm mặc định là vắng, nên chuyên cần mất dù Admin quyết định thế nào
  const none = await review(await world({ people: [a], days, sessions: [] }));
  assert.equal(none.checked.payrollErrors, 0);
  assert.deepEqual(ids(none, 'attendance-allowance-risk'), []);
});

test('includeImpacts: có thì trả tiền tác động của mọi khoản chờ duyệt, không có thì kết quả không mang số tiền nào ngoài luật cần', async () => {
  const a = await person('qa_a');
  const days = { qa_a: { '2026-10-03': { kind: 'isat' }, '2026-10-10': { kind: 'approved' } } };
  const plain = await review(await world({ people: [a], days }));
  assert.equal(Object.hasOwn(plain, 'impacts'), false);
  const withImpacts = await review({ ...(await world({ people: [a], days })), includeImpacts: true });
  assert.deepEqual(withImpacts.impacts, [
    { username: 'qa_a', date: '2026-10-03', item: 'isat', impactVnd: 230769 },
    { username: 'qa_a', date: '2026-10-10', item: 'approved', impactVnd: 0 }
  ]);
  assert.deepEqual(withImpacts.findings, plain.findings);
});

/* ---------- KPI 5 thành phần (input.kpiScores) ---------- */
const FIVE = { wework: 100, user: 90, peer: 80, manager: 85, self: 100 }; // 100/90/80/85/100 → 92,2% → 5.532.000 ₫ trên mức 6.000.000
const fiveWorld = async (options: any = {}) => ({
  ...(await world({
    kpi: { qa_a: { kpiAmt: 6000000 } },
    ...options
  })),
  kpiScores: options.kpiScores || [{ username: 'qa_a', month: '2026-10', parts: { complete: true, ...FIVE } }]
});
const workDays = (dates?) => Object.fromEntries(dates.map(d => [d, workDay()]));
const TEN_DAYS = ['05', '06', '07', '08', '09', '12', '13', '14', '15', '16'].map(d => `2026-10-${d}`);

test('KPI 5 thành phần: slip-override-gap so với lương KPI năm điểm 5.532.000 ₫ (điểm 100/90/80/85/100, mức 6.000.000)', async () => {
  const a = await person('qa_a');
  const slip = (value?) => [{ username: 'qa_a', month: '2026-10', values: { kpiPay: value } }];
  const base = { people: [a], days: { qa_a: workDays(TEN_DAYS) } };
  const hit = await review(await fiveWorld({ ...base, slipOverrides: await slip(3000000) }));
  assert.equal(hit.checked.payrollErrors, 0);
  const f = find(hit, 'slip-override-gap')[0];
  assert.ok(f);
  assert.deepEqual(f.evidence.inputs.fields, [{ key: 'kpiPay', computed: 5532000, override: 3000000, diff: -2532000 }]);
  // đúng bằng số tự tính thì không lệch
  assert.deepEqual(
    ids(await review(await fiveWorld({ ...base, slipOverrides: await slip(5532000) })), 'slip-override-gap'),
    []
  );
});

test('KPI 5 thành phần: impacts dùng lương KPI năm điểm (ngày nghỉ làm vượt 24 giờ thì KPI nhân tỷ lệ ngày đi làm)', async () => {
  const a = await person('qa_a');
  // 3 ngày nghỉ không lương (24 giờ, chưa vượt) + 1 iSAT Thứ Bảy chờ duyệt: duyệt thì vẫn 3 ngày, từ chối thì thành ngày nghỉ thứ 4 (32 giờ > 24)
  const days = {
    ...workDays(TEN_DAYS),
    '2026-10-19': { kind: 'unpaid' },
    '2026-10-20': { kind: 'unpaid' },
    '2026-10-21': { kind: 'unpaid' },
    '2026-10-24': { kind: 'isat' }
  };
  const input = { ...(await fiveWorld({ people: [a], days: { qa_a: days } })), includeImpacts: true };
  const five = await review(input);
  assert.equal(five.checked.payrollErrors, 0);
  const impact = five.impacts.find(x => x.date === '2026-10-24').impactVnd;
  // KPI đủ 5.532.000 nếu duyệt, nhân 23/26 (23 ngày đi làm) nếu từ chối; cộng một ngày lương iSAT 230.769 vì duyệt thì ngày đó có lương
  const expected = Math.round(5532000 - (5532000 * 23) / 26) + 230769;
  assert.ok(Math.abs(impact - expected) <= 1, `impact ${impact} khác ${expected}`);
  // "Nghỉ được duyệt": duyệt hay từ chối đều là 1 ngày nghỉ, 0 đồng, nên tác động tiền bằng 0, không đổi chuyên cần/KPI
  const approved = {
    ...workDays(TEN_DAYS),
    '2026-10-19': { kind: 'unpaid' },
    '2026-10-20': { kind: 'unpaid' },
    '2026-10-21': { kind: 'unpaid' },
    '2026-10-22': { kind: 'approved' }
  };
  const duyet = await review({
    ...(await fiveWorld({ people: [a], days: { qa_a: approved } })),
    includeImpacts: true
  });
  assert.equal(duyet.impacts.find(x => x.date === '2026-10-22').impactVnd, 0);
  // chưa đủ điểm (parts null): chưa có tiền KPI nên cũng không có phần KPI trong tác động
  const noScores = await review({ ...input, kpiScores: [] });
  assert.equal(noScores.impacts.find(x => x.date === '2026-10-24').impactVnd, 230769);
});

test('KPI 5 thành phần: kpi-self-100-streak ở tháng nào cũng bị bỏ qua và ghi vào checked.skipped', async () => {
  const a = await person('qa_a');
  const sheetOf = (month?) => ({
    username: 'qa_a',
    month,
    days: {},
    kpiPct: 100,
    kpiAmt: null,
    kpiAdmPct: null,
    kpiAdmAmt: null
  });
  const kpi = { qa_a: { kpiPct: 100 } };
  const otherSheets = [await sheetOf('2026-09'), await sheetOf('2026-08')];
  const five = await review({ ...(await fiveWorld({ people: [a], kpi, otherSheets })) });
  assert.deepEqual(ids(five, 'kpi-self-100-streak'), []);
  const skip = five.checked.skipped.find(s => s.rule === 'kpi-self-100-streak');
  assert.ok(skip);
  // lý do bỏ qua viết bằng tiếng Việt thường, không có tên cài đặt
  assert.match(skip.reason, /KPI theo 5 thành phần/);
  assertPlain(skip.reason, 'lý do bỏ qua kpi-self-100-streak');
  assert.ok(!five.checked.ruleIds.includes('kpi-self-100-streak'));
});

test('KPI 5 thành phần: checklist đếm người chưa đủ 5 điểm thay cho % Admin duyệt', async () => {
  const people = [await person('qa_a'), await person('qa_b')];
  const result = await review(
    await fiveWorld({ people, kpiScores: [{ username: 'qa_a', month: '2026-10', parts: { complete: true, ...FIVE } }] })
  );
  const item = result.checklist.find(c => c.id === 'kpi-unapproved');
  assert.equal(item.count, 1);
  assert.match(item.label, /5 điểm/);
  assert.equal((await review(await world({ people }))).checklist.find(c => c.id === 'kpi-unapproved').count, 2); // không có kpiFrom: cả hai chưa duyệt
});
