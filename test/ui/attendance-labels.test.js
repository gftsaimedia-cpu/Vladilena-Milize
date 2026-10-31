'use strict';
// Nhãn chấm công trên màn nhân viên và màn Admin: ngày có lượt chỉ hiện một trong sáu nhãn do máy chủ tính (session.status), lý do
// ngắn (statusNote) là chữ nhỏ; OT / làm bù / đi làm ngày lễ đã khai là dữ liệu trong khung ngày, không phải nhãn.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const AS = require('../../public/attendance-status.js');
const L = require('../../public/nhan-vien/logic.js');

const ROOT = path.join(__dirname, '..', '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const ses = (id, date, status, statusNote = '', open = false) => ({
  id,
  date,
  state: open ? 'open' : 'closed',
  status,
  statusNote,
  entry: {
    kind: open ? 'pending' : 'work',
    reason: open ? 'open' : undefined,
    presIn: `${date}T01:00:00.000Z`,
    presOut: open ? undefined : `${date}T10:00:00.000Z`,
    plannedShift: { code: 'Normal1', date }
  }
});
const me = { shiftCode: 'Normal1', type: 'nv' };
function month() {
  return L.buildMonth({
    month: '2026-11',
    me,
    days: { '2026-11-04': { kind: 'work', in: '08:00', out: '17:00', extraKind: 'ot', extraOut: '19:00' } },
    approvals: { '2026-11-04': { item: 'ot', status: 'pending' } },
    sessions: [
      ses(1, '2026-11-03', 'pending', 'Vào trễ 22 phút'),
      ses(2, '2026-11-04', 'checked-out'),
      ses(3, '2026-11-05', 'approved', 'Giải trình Check-out muộn'),
      ses(4, '2026-11-06', 'admin'),
      ses(5, '2026-11-09', 'rejected', 'Giải trình Check-out muộn'),
      ses(6, '2026-11-09', 'checked-out'),
      ses(7, '2026-11-20', 'checked-in', '', true)
    ],
    holidays: [],
    actualReport: null,
    actualFrom: '2026-11-01',
    nowIso: '2026-11-20T03:00:00.000Z'
  });
}

test('màn nhân viên: ô lịch và khung ngày dùng nhãn của ngày do máy chủ tính', () => {
  const m = month();
  const expect = {
    '2026-11-03': ['pending', 'pend', 'Chờ xử lý'],
    '2026-11-04': ['checked-out', 'ok', 'Đã Check-out'],
    '2026-11-05': ['approved', 'ok', 'Được phê duyệt'],
    '2026-11-06': ['admin', 'ok', 'Đã chấm công'],
    '2026-11-09': ['rejected', 'err', 'Bị từ chối'],
    '2026-11-20': ['checked-in', 'ok', 'Đã Check-in']
  };
  for (const [date, [code, tone, text]] of Object.entries(expect)) {
    const cell = m.cells.get(date);
    assert.equal(cell.dayStatus, code, date);
    assert.equal(cell.tone, tone, date);
    const desc = L.describeDay(cell, { me, actualFrom: '2026-11-01' });
    assert.equal(desc.pill.text, text, date);
    assert.equal(desc.pill.tone, AS.TONE[code], date);
  }
  // Đã Check-in, Đã Check-out không ghi chữ trong ô (màu thường); các nhãn còn lại ghi đúng chữ của bảng nhãn
  assert.equal(m.cells.get('2026-11-04').label, '');
  assert.equal(m.cells.get('2026-11-20').label, '');
  assert.equal(m.cells.get('2026-11-03').label, 'Chờ xử lý');
  assert.equal(m.cells.get('2026-11-09').label, 'Bị từ chối');
});

test('màn nhân viên: lý do ngắn đi theo lượt, OT đã khai là dữ liệu chứ không phải nhãn', () => {
  const m = month();
  const late = m.cells.get('2026-11-03');
  assert.equal(late.sessions[0].status, 'pending');
  assert.equal(late.sessions[0].statusNote, 'Vào trễ 22 phút');
  const ot = m.cells.get('2026-11-04');
  const desc = L.describeDay(ot, { me, actualFrom: '2026-11-01' });
  assert.equal(desc.pill.text, 'Đã Check-out');
  assert.deepEqual(desc.badges, []);
  assert.deepEqual(desc.rows[0], { k: 'Đã khai', v: 'OT: chờ xử lý', tone: '' });
  assert.equal(ot.tag, '', 'ô có lượt không gắn thẻ OT');
});

test('màn nhân viên: ngày cần để ý là ngày Chờ xử lý hoặc Bị từ chối, kèm lý do', () => {
  const m = month();
  assert.equal(m.summary.pending, 1);
  assert.equal(m.summary.rejected, 1);
  assert.deepEqual(
    m.missing.map(c => c.date),
    ['2026-11-09', '2026-11-03']
  );
  assert.equal(L.attentionText(m.missing[0]), 'Bị từ chối: Giải trình Check-out muộn');
  assert.equal(L.attentionText(m.missing[1]), 'Chờ xử lý: Vào trễ 22 phút');
});

test('màn nhân viên: lượt chưa có status (dữ liệu cũ) vẫn có nhãn tối thiểu', () => {
  const old = ses(9, '2026-11-10', undefined);
  delete old.status;
  old.entry.kind = 'pending';
  old.entry.reason = 'forgot-out';
  assert.equal(L.sessionRow(old, '2026-11-20T03:00:00.000Z').status, 'pending');
  const ok = ses(10, '2026-11-11', undefined);
  delete ok.status;
  assert.equal(L.sessionRow(ok, '2026-11-20T03:00:00.000Z').status, 'checked-out');
});

test('trang Admin và trang nhân viên nạp attendance-status.js trước các màn dùng nó', () => {
  for (const [page, user] of [
    ['public/admin.html', 'admin/view-cham-cong.js'],
    ['public/nhan-vien.html', 'nhan-vien/logic.js']
  ]) {
    const html = read(page);
    const at = html.indexOf('src="attendance-status.js"');
    assert.ok(at > 0, page);
    assert.ok(at < html.indexOf(`src="${user}"`), page);
  }
});

test('không còn nhãn trạng thái cũ trong các màn chấm công', () => {
  const OLD = [
    'Đủ công',
    'Đang trong ca',
    'Đã ra ca',
    'Bị trừ giờ',
    'Chờ đối soát',
    'nên đối soát',
    'Đã đóng, đã tự tính',
    'Thiếu Check-in/out',
    'Admin đã sửa giờ',
    'Admin không duyệt',
    'Chờ Admin duyệt',
    'Đã xác nhận',
    'Chờ xác nhận'
  ];
  const files = [
    'public/admin/view-cham-cong.js',
    'public/admin/view-giai-trinh.js',
    'public/nhan-vien/logic.js',
    'public/nhan-vien/parts.js',
    'public/nhan-vien/punch.js',
    'public/nhan-vien/giai-trinh.js',
    'public/nhan-vien/thu-nhap.js'
  ];
  for (const file of files) {
    const src = read(file);
    for (const word of OLD) assert.ok(!src.includes(word), `${file} còn "${word}"`);
  }
});

test('Admin: giải trình dùng đúng ba chữ quyết định của chấm công', () => {
  const window = { AttendanceStatus: AS, Admin: { esc: s => String(s), nf: String, ic: () => '', actions: {} } };
  vm.runInNewContext(read('public/admin/view-giai-trinh.js'), { window, console });
  const src = read('public/admin/view-giai-trinh.js');
  assert.match(src, /requested: LABEL\.pending/);
  assert.match(src, /approved: LABEL\.approved/);
  assert.match(src, /rejected: LABEL\.rejected/);
  assert.equal(typeof window.Admin.GiaiTrinh.render, 'function');
});

test('màn nhân viên: nhãn lượt đang mở lấy từ openSession của /api/punch (ca đêm qua nửa đêm vẫn đúng)', () => {
  const night = {
    id: 21,
    date: '2026-10-29',
    state: 'open',
    status: 'pending',
    statusNote: 'Vào trễ 20 phút',
    entry: { kind: 'pending', reason: 'open', presIn: '2026-10-29T15:20:00.000Z' }
  };
  const pv = L.punchView({ me, punch: { openSession: night }, nowIso: '2026-10-29T17:30:00.000Z' });
  assert.equal(pv.mode, 'open');
  assert.equal(pv.status, 'pending');
  assert.equal(pv.statusNote, 'Vào trễ 20 phút');
  const old = L.punchView({
    me,
    punch: { openSession: { ...night, status: undefined, statusNote: undefined } },
    nowIso: '2026-10-29T17:30:00.000Z'
  });
  assert.equal(old.status, 'checked-in');
  assert.equal(old.statusNote, '');
});

test('màn nhân viên: ngày chưa có lượt, khoản đã khai chờ xử lý / bị từ chối là dòng dữ liệu, không phải nhãn ô', () => {
  const m = L.buildMonth({
    month: '2026-11',
    me,
    days: {
      '2026-11-24': { kind: 'work', in: '08:00', out: '17:00', extraKind: 'ot', extraOut: '19:00' },
      '2026-11-25': { kind: 'work', in: '08:00', out: '17:00', extraKind: 'ot', extraOut: '19:00' }
    },
    approvals: {
      '2026-11-24': { item: 'ot', status: 'pending' },
      '2026-11-25': { item: 'ot', status: 'rejected', note: 'Không cần OT' }
    },
    sessions: [],
    holidays: [],
    actualReport: null,
    actualFrom: '2026-11-01',
    nowIso: '2026-11-20T03:00:00.000Z'
  });
  for (const [date, text] of [
    ['2026-11-24', 'OT: chờ xử lý'],
    ['2026-11-25', 'OT: bị từ chối']
  ]) {
    const cell = m.cells.get(date);
    assert.ok(!['Chờ', 'Từ chối'].includes(cell.label), date);
    assert.equal(cell.tone, 'ok', date);
    assert.equal(cell.tag, 'OT', date);
    const desc = L.describeDay(cell, { me, actualFrom: '2026-11-01' });
    assert.deepEqual(desc.badges, [], date);
    assert.deepEqual(desc.rows[0], { k: 'Đã khai', v: text, tone: '' }, date);
  }
  assert.equal(m.summary.pending, 0);
});

test('màn nhân viên: xin nghỉ chờ / bị từ chối hiện trên ô lịch (không phải nhãn chấm công), không trông như nghỉ được duyệt', () => {
  const m = L.buildMonth({
    month: '2026-11',
    me,
    days: {
      '2026-11-24': { kind: 'leave' },
      '2026-11-25': { kind: 'willmakeup' },
      '2026-11-26': { kind: 'unpaid' }
    },
    approvals: {
      '2026-11-24': { item: 'leave', status: 'pending' },
      '2026-11-25': { item: 'willmakeup', status: 'rejected', note: 'Trùng lịch trực' },
      '2026-11-26': { item: 'approved', status: 'pending' }
    },
    sessions: [],
    holidays: [],
    actualReport: null,
    actualFrom: '2026-11-01',
    nowIso: '2026-11-20T03:00:00.000Z'
  });
  for (const [date, status, label, tone, text] of [
    ['2026-11-24', 'leave-pending', 'Chờ', 'pend', 'Nghỉ phép năm: chờ xử lý'],
    ['2026-11-25', 'leave-rejected', 'Từ chối', 'err', 'Nghỉ, sẽ làm bù: bị từ chối'],
    ['2026-11-26', 'leave-pending', 'Chờ', 'pend', 'Nghỉ được duyệt: chờ xử lý']
  ]) {
    const cell = m.cells.get(date);
    assert.deepEqual([cell.status, cell.label, cell.tone], [status, label, tone], date);
    const desc = L.describeDay(cell, { me, actualFrom: '2026-11-01' });
    assert.ok(
      desc.rows.some(r => r.k === 'Đã khai' && r.v === text),
      date
    );
  }
  // không phải Chờ xử lý của chấm công: không vào danh sách ngày cần để ý
  assert.equal(m.summary.pending, 0);
  assert.equal(m.summary.rejected, 0);
  assert.deepEqual(m.missing, []);
});

test('màn nhân viên: ngày quên Check-out đã được Admin khai thay là Đã chấm công, không còn Chờ xử lý', () => {
  const forgot = { ...ses(1, '2026-11-11', 'pending', 'Quên Check-out'), superseded: true };
  forgot.entry = { ...forgot.entry, kind: 'pending', reason: 'forgot-out', presOut: undefined };
  const m = L.buildMonth({
    month: '2026-11',
    me,
    days: { '2026-11-11': { kind: 'work', in: '08:00', out: '17:00' } },
    approvals: {},
    sessions: [forgot, ses(2, '2026-11-11', 'admin')],
    holidays: [],
    actualReport: null,
    actualFrom: '2026-11-01',
    nowIso: '2026-11-20T03:00:00.000Z'
  });
  const cell = m.cells.get('2026-11-11');
  assert.equal(cell.dayStatus, 'admin');
  assert.deepEqual([cell.status, cell.label, cell.tone], ['admin', 'Đã chấm công', 'ok']);
  assert.deepEqual(L.describeDay(cell, { me, actualFrom: '2026-11-01' }).pill, {
    tone: AS.TONE.admin,
    text: 'Đã chấm công'
  });
  // nhãn riêng của lượt bấm vẫn còn trong danh sách lượt của ngày
  assert.equal(cell.sessions.find(s => s.id === 1).status, 'pending');
  assert.equal(m.summary.pending, 0);
  assert.deepEqual(m.missing, []);
});

test('màn nhân viên: ngày chưa có lượt mà báo cáo giờ công cần Admin xử lý là ô Chờ xử lý, cùng màu với khung ngày', () => {
  const m = L.buildMonth({
    month: '2026-11',
    me,
    days: { '2026-11-12': { kind: 'work', in: '08:00', out: '17:00' } },
    approvals: {},
    sessions: [],
    holidays: [],
    actualReport: { from: '2026-11-01', report: { '2026-11-12': { state: 'forgot-out' } } },
    actualFrom: '2026-11-01',
    nowIso: '2026-11-20T03:00:00.000Z'
  });
  const cell = m.cells.get('2026-11-12');
  assert.equal(cell.status, 'pending');
  assert.equal(cell.label, 'Chờ xử lý');
  assert.equal(cell.tone, 'pend');
  const desc = L.describeDay(cell, { me, actualFrom: '2026-11-01' });
  assert.deepEqual(desc.pill, { tone: 'pending', text: 'Chờ xử lý' });
  assert.equal(m.summary.pending, 1);
  assert.deepEqual(
    m.missing.map(c => c.date),
    ['2026-11-12']
  );
  assert.equal(L.attentionText(m.missing[0]), 'Chờ xử lý');
});
