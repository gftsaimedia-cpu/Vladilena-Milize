'use strict';
// Đánh giá độ chính xác của "Soát dữ liệu trước khi chốt lương" trên một tháng giả giống sandbox (tháng 10/2026, hơn 70 người giả).
// Nhãn đúng được dựng sẵn trong lúc tạo dữ liệu (không lấy từ kết quả của review()): mỗi ca phải bắn có nhãn, mỗi ca sát ngưỡng
// là ca bình thường không được bắn. Mục tiêu thiết kế: precision và recall của từng luật đều từ 0,95.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { review } = require('../../lib/ai/review.ts');
const W = require('./ai-review-world.js');

const { person, world, workDay, otDay, makeupHoursDay, closedSession } = W;
const TARGET = 0.95;
const EVALUATED = [
  'isat-frequency',
  'leave-with-checkin',
  'late-declaration',
  'previously-rejected',
  'ot-checkin-mismatch',
  'ot-after-pending-makeup',
  'locked-with-pending',
  'missing-fixed-shift',
  'negative-leave'
];
const SAT = ['2026-10-03', '2026-10-10', '2026-10-17', '2026-10-24', '2026-10-31'];
const WEEKDAYS = ['05', '06', '07', '08', '09', '12', '13', '14', '15', '16', '19', '20', '21', '22', '23'].map(
  d => `2026-10-${d}`
);
const LATE = '2026-11-04T03:00:00.000Z'; // 10:00 04/11 giờ VN
const JUST_IN_TIME = '2026-11-03T16:30:00.000Z'; // 23:30 03/11 giờ VN

async function buildMonth() {
  const people = [];
  const days = {};
  const rows = {};
  const sessions = [];
  const extraRows = [];
  const expected = new Set();
  const add = (rule, username, date) => expected.add(`${rule}|${username}|${date || W.MONTH}`);
  const make = async (username, extra) => {
    const p = await person(username, extra);
    people.push(p);
    days[username] = days[username] || {};
    return p;
  };
  const rejectedRow = (username, date, item, decidedAt) => ({
    username,
    date,
    item,
    fingerprint: item,
    status: 'rejected',
    rev: 2,
    submittedAt: '2026-10-01T02:00:00.000Z',
    decidedBy: 'admin',
    decidedAt,
    note: 'ghi chú giả'
  });

  // 1. iSAT nhiều lần: người có 4–5 lần phải bị gắn từ lần thứ 4; người có 3 lần thì không
  for (let i = 0; i < 4; i++) {
    const username = `qa_isat_${i}`;
    await make(username);
    const count = i % 2 ? 5 : 4;
    SAT.slice(0, count).forEach((date, index) => {
      days[username][date] = { kind: 'isat' };
      if (index + 1 >= 4) add('isat-frequency', username, date);
    });
  }
  for (let i = 0; i < 6; i++) {
    const username = `qa_isat3_${i}`;
    await make(username);
    SAT.slice(0, 3).forEach(date => (days[username][date] = { kind: 'isat' }));
  }

  // 2. Có Check-in ngày khai nghỉ; ngày liền kề có Check-in thì bình thường
  const kinds = ['leave', 'approved', 'isat'];
  for (let i = 0; i < 6; i++) {
    const username = `qa_checkin_${i}`;
    await make(username);
    const kind = kinds[i % 3];
    const date = kind === 'isat' ? SAT[i % 4] : WEEKDAYS[i];
    days[username][date] = { kind };
    sessions.push(await closedSession(username, 'n1', date, '08:10', '17:05'));
    add('leave-with-checkin', username, date);
  }
  for (let i = 0; i < 6; i++) {
    const username = `qa_nocheckin_${i}`;
    await make(username);
    days[username][WEEKDAYS[i]] = { kind: kinds[i % 2] };
    sessions.push(await closedSession(username, 'n1', WEEKDAYS[i + 1], '08:00', '17:00')); // ngày hôm sau, không phải ngày khai
  }

  // 3. Khai sau hạn mùng 3; khai lúc 23:30 ngày mùng 3 thì kịp hạn
  for (let i = 0; i < 6; i++) {
    const username = `qa_late_${i}`;
    await make(username);
    const date = WEEKDAYS[i + 2];
    days[username][date] = { kind: 'approved' };
    rows[`${username}|${date}`] = { submittedAt: LATE };
    add('late-declaration', username, date);
  }
  for (let i = 0; i < 6; i++) {
    const username = `qa_intime_${i}`;
    await make(username);
    const date = WEEKDAYS[i + 2];
    days[username][date] = { kind: 'approved' };
    rows[`${username}|${date}`] = { submittedAt: i % 2 ? JUST_IN_TIME : W.ON_TIME };
  }

  // 4. Khoản cùng loại vừa bị từ chối; bị từ chối từ lâu, hoặc khác loại, thì bình thường
  for (let i = 0; i < 4; i++) {
    const username = `qa_rej_${i}`;
    await make(username);
    days[username]['2026-10-14'] = { kind: 'approved' };
    extraRows.push(rejectedRow(username, '2026-10-08', 'approved', '2026-10-10T03:00:00.000Z'));
    add('previously-rejected', username, '2026-10-14');
  }
  for (let i = 0; i < 4; i++) {
    const username = `qa_rejold_${i}`;
    await make(username);
    days[username]['2026-10-14'] = { kind: 'approved' };
    extraRows.push(
      i % 2
        ? rejectedRow(username, '2026-10-08', 'isat', '2026-10-10T03:00:00.000Z')
        : rejectedRow(username, '2026-07-08', 'approved', '2026-07-10T03:00:00.000Z')
    );
  }

  // 5. OT không khớp Check-in: thiếu từ 30 phút hoặc không có Check-in là phải bắn; thiếu 20 phút hoặc đủ thì bình thường
  for (let i = 0; i < 9; i++) {
    const username = `qa_ot_${i}`;
    await make(username);
    const date = WEEKDAYS[i];
    days[username][date] = otDay('19:00');
    if (i < 3)
      add('ot-checkin-mismatch', username, date); // không có Check-in
    else if (i < 6) {
      sessions.push(await closedSession(username, 'n1', date, '08:00', '17:40')); // phủ 40 / 120 phút
      add('ot-checkin-mismatch', username, date);
    } else if (i < 8)
      sessions.push(await closedSession(username, 'n1', date, '08:00', '18:40')); // thiếu 20 phút: dưới ngưỡng
    else sessions.push(await closedSession(username, 'n1', date, '08:00', '19:15')); // đủ
  }

  // 6. OT chờ duyệt khi còn làm bù chờ duyệt trước đó; làm bù sau OT hoặc đã duyệt thì bình thường
  for (let i = 0; i < 4; i++) {
    const username = `qa_mk_${i}`;
    await make(username);
    days[username]['2026-10-06'] = makeupHoursDay();
    days[username]['2026-10-08'] = otDay('18:00');
    sessions.push(
      await closedSession(username, 'n1', '2026-10-06', '08:00', '18:00'),
      await closedSession(username, 'n1', '2026-10-08', '08:00', '18:00')
    );
    add('ot-after-pending-makeup', username, '2026-10-08');
  }
  for (let i = 0; i < 4; i++) {
    const username = `qa_mkok_${i}`;
    await make(username);
    days[username]['2026-10-06'] = i % 2 ? makeupHoursDay() : otDay('18:00');
    days[username]['2026-10-08'] = i % 2 ? otDay('18:00') : makeupHoursDay();
    sessions.push(
      await closedSession(username, 'n1', '2026-10-06', '08:00', '18:00'),
      await closedSession(username, 'n1', '2026-10-08', '08:00', '18:00')
    );
    if (i % 2) rows[`${username}|2026-10-06`] = { status: 'approved' };
  }

  // 7. Tài khoản khoá còn khoản chờ duyệt; tài khoản khoá không còn khoản thì bình thường
  for (let i = 0; i < 2; i++) {
    const username = `qa_lock_${i}`;
    await make(username, { locked: true, lockedAt: '2026-10-09T05:00:00.000Z' });
    days[username]['2026-10-14'] = { kind: 'approved' };
    add('locked-with-pending', username, '2026-10-14');
  }
  await make('qa_lock_clean', { locked: true, lockedAt: '2026-10-09T05:00:00.000Z' });

  // 8. Thiếu ca cố định (tính theo người, không theo ngày)
  for (let i = 0; i < 3; i++) {
    await make(`qa_noshift_${i}`, { shiftCode: null });
    add('missing-fixed-shift', `qa_noshift_${i}`);
  }

  // 9. Phép âm: dùng 3 ngày phép khi mới được cộng 2 ngày; dùng 2 ngày thì bình thường
  for (let i = 0; i < 2; i++) {
    const username = `qa_neg_${i}`;
    await make(username, { startDate: '2026-09-01', leaveAdjust: 0 });
    for (const d of ['05', '06', '07']) days[username][`2026-10-${d}`] = { kind: 'leave' };
    add('negative-leave', username);
    sessions.push(await closedSession(username, 'n1', '2026-10-08', '08:00', '17:00'));
  }
  // Phép bị từ chối đã trả lại phép:3 ngày phép nhưng 1 ngày bị từ chối thì KHÔNG phải lỗi (ca không-phải-lỗi sát ngưỡng)
  for (let i = 0; i < 2; i++) {
    const username = `qa_rejleave_${i}`;
    await make(username, { startDate: '2026-09-01', leaveAdjust: 0 });
    for (const d of ['05', '06', '07']) days[username][`2026-10-${d}`] = { kind: 'leave' };
    rows[`${username}|2026-10-07`] = { status: 'rejected' };
    // hai ngày phép còn chờ duyệt sau một ngày phép bị từ chối là ca của luật previously-rejected (không phải negative-leave)
    for (const d of ['05', '06']) add('previously-rejected', username, `2026-10-${d}`);
  }
  for (let i = 0; i < 2; i++) {
    const username = `qa_pos_${i}`;
    await make(username, { startDate: '2026-09-01', leaveAdjust: 0 });
    for (const d of ['05', '06']) days[username][`2026-10-${d}`] = { kind: 'leave' };
  }

  // 10. Nhân sự bình thường, đi làm đủ, không khai gì lạ
  for (let i = 0; i < 30; i++) {
    const username = `qa_normal_${i}`;
    await make(username, { type: i % 5 === 0 ? 'ctv' : i % 7 === 0 ? 'tts' : 'nv' });
    const date = WEEKDAYS[i % WEEKDAYS.length];
    days[username][date] = i % 3 === 0 ? workDay() : { kind: 'work', in: '08:00', out: '17:00' };
    sessions.push(await closedSession(username, 'n1', date, '08:00', '17:00'));
  }
  return { people, days, rows, sessions, extraRows, expected };
}

test('đánh giá trên tháng giả: precision và recall từng luật từ 0,95 (bật luật late-declaration vốn tắt mặc định)', async t => {
  const month = await buildMonth();
  const result = await review(await world({ ...month, lateOn: true }));
  const flagged = new Map(EVALUATED.map(rule => [rule, new Set()]));
  for (const f of result.findings)
    if (flagged.has(f.rule)) flagged.get(f.rule).add(`${f.rule}|${f.username}|${f.date || f.month}`);
  const lines = [];
  for (const rule of EVALUATED) {
    const want = [...month.expected].filter(key => key.startsWith(rule + '|'));
    const got = [...flagged.get(rule)];
    const hit = got.filter(key => month.expected.has(key)).length;
    const precision = got.length ? hit / got.length : 1;
    const recall = want.length ? hit / want.length : 1;
    lines.push(
      `${rule}: ${want.length} nhãn, ${got.length} bắn, precision ${precision.toFixed(2)}, recall ${recall.toFixed(2)}`
    );
    assert.ok(want.length > 0, `${rule} cần có ca phải bắn trong dữ liệu đánh giá`);
    assert.ok(
      precision >= TARGET,
      `${rule}: precision ${precision} dưới mục tiêu; bắn thừa: ${got.filter(k => !month.expected.has(k))}`
    );
    assert.ok(
      recall >= TARGET,
      `${rule}: recall ${recall} dưới mục tiêu; bỏ sót: ${want.filter(k => !flagged.get(rule).has(k))}`
    );
  }
  t.diagnostic(
    `Tháng giả: ${result.checked.staff} người, ${result.checked.days} ngày khai, ${month.expected.size} nhãn, ${result.findings.length} phát hiện.\n${lines.join('\n')}`
  );
  assert.equal(result.checked.payrollErrors, 0);
});

test('đánh giá: người bình thường không dính phát hiện nào của các luật đã đánh giá', async () => {
  const result = await review(await world({ ...(await buildMonth()), lateOn: true }));
  const normal = result.findings.filter(f => f.username.startsWith('qa_normal_') && EVALUATED.includes(f.rule));
  assert.deepEqual(normal, []);
});

module.exports = { buildMonth };
