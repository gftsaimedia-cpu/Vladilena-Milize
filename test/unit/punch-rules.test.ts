// Unit tests: chỉ nạp các hàm thuần, không khởi động HTTP server hoặc mở SQLite.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const P = require('../../src/engine/punch');

const iso = (local?) => new Date(`${local}+07:00`).toISOString();
const staff = (code?) => ({ shiftCode: code, sched: [1, 2, 3, 4, 5, 6] });
const date = '2026-10-07';
const shifts = [
  {
    code: 'n1',
    in: '08:00',
    out: '17:00',
    start: '2026-10-07T08:00:00',
    end: '2026-10-07T17:00:00',
    late: '2026-10-07T08:15:00',
    early: '2026-10-07T16:45:00'
  },
  {
    code: 'n2',
    in: '10:00',
    out: '19:00',
    start: '2026-10-07T10:00:00',
    end: '2026-10-07T19:00:00',
    late: '2026-10-07T10:15:00',
    early: '2026-10-07T18:45:00'
  },
  {
    code: 'f1',
    in: '06:00',
    out: '15:00',
    start: '2026-10-07T06:00:00',
    end: '2026-10-07T15:00:00',
    late: '2026-10-07T06:15:00',
    early: '2026-10-07T14:45:00'
  },
  {
    code: 'f2',
    in: '13:00',
    out: '22:00',
    start: '2026-10-07T13:00:00',
    end: '2026-10-07T22:00:00',
    late: '2026-10-07T13:15:00',
    early: '2026-10-07T21:45:00'
  },
  {
    code: 'g1',
    in: '21:00',
    out: '06:00',
    start: '2026-10-07T21:00:00',
    end: '2026-10-08T06:00:00',
    late: '2026-10-07T21:15:00',
    early: '2026-10-08T05:45:00'
  },
  {
    code: 'g2',
    in: '22:00',
    out: '07:00',
    start: '2026-10-07T22:00:00',
    end: '2026-10-08T07:00:00',
    late: '2026-10-07T22:15:00',
    early: '2026-10-08T06:45:00'
  }
];

for (const s of shifts) {
  test(`${s.code}: đủ ca xác nhận đúng toàn bộ giờ cố định`, async () => {
    const r = P.buildDay(await staff(s.code), iso(s.start), iso(s.end), 'punch');
    assert.equal(r.date, date);
    assert.equal(r.entry.kind, 'work');
    assert.equal(r.entry.in, s.in);
    assert.equal(r.entry.out, s.out);
    assert.equal(r.entry.attendanceConfirmed, true);
    assert.equal(r.entry.attendanceApproved, undefined);
    assert.deepEqual(r.entry.plannedShift, {
      code: s.code,
      date,
      in: s.in,
      out: s.out,
      startIso: iso(s.start),
      endIso: iso(s.end),
      kind: 'work'
    });
    assert.equal(r.entry.breakMin, 0);
    assert.equal(r.entry.extraKind, '');
    assert.equal(r.entry.extraIn, '');
    assert.equal(r.entry.extraOut, '');
  });

  for (const [label, tin, tout] of [
    ['vào trễ', s.late, s.end],
    ['về sớm', s.start, s.early]
  ]) {
    test(`${s.code}: ${label} chờ duyệt và Admin xác nhận đủ ca`, async () => {
      const r = P.buildDay(await staff(s.code), iso(tin), iso(tout), 'punch');
      assert.equal(r.date, date);
      assert.equal(r.entry.kind, 'pending');
      assert.equal(r.entry.reason, 'incomplete-shift');
      assert.equal(r.entry.in, undefined);
      assert.equal(r.entry.out, undefined);
      assert.equal(r.entry.attendanceConfirmed, undefined);
      assert.equal(r.entry.presIn, iso(tin));
      assert.equal(r.entry.presOut, iso(tout));
      const approved = P.buildDay(await staff(s.code), r.entry.presIn, r.entry.presOut, 'admin', {
        plannedShift: r.entry.plannedShift,
        approveIncomplete: true
      });
      assert.equal(approved.date, date);
      assert.equal(approved.entry.kind, 'work');
      assert.equal(approved.entry.in, s.in);
      assert.equal(approved.entry.out, s.out);
      assert.equal(approved.entry.attendanceConfirmed, true);
      assert.equal(approved.entry.attendanceApproved, true);
      assert.equal(approved.entry.presIn, iso(tin));
      assert.equal(approved.entry.presOut, iso(tout));
    });
  }
}

test('xác nhận dùng giây thực tế, không làm tròn một giây thiếu thành đủ ca', async () => {
  const cases = [
    ['2026-10-07T08:00:01', '2026-10-07T17:00:00'],
    ['2026-10-07T08:00:00', '2026-10-07T16:59:59']
  ];
  for (const [tin, tout] of cases) {
    const { entry } = P.buildDay(await staff('n1'), iso(tin), iso(tout), 'punch');
    assert.equal(entry.reason, 'incomplete-shift');
    assert.equal(entry.presIn, iso(tin));
    assert.equal(entry.presOut, iso(tout));
  }
  const full = P.buildDay(await staff('n1'), iso('2026-10-07T07:59:59'), iso('2026-10-07T17:00:01'), 'punch').entry;
  assert.equal(full.attendanceConfirmed, true);
  assert.equal(P.lateMin('n1', iso('2026-10-07T08:00:01')), 1);
  assert.equal(P.lateMin('n1', iso('2026-10-07T07:59:59')), 0);
});

test('giờ có mặt dư trước/sau ca chỉ là bằng chứng, không tự tạo làm thêm', async () => {
  const { entry } = P.buildDay(await staff('n1'), iso('2026-10-07T07:00:00'), iso('2026-10-07T19:00:00'), 'punch');
  assert.equal(entry.in, '08:00');
  assert.equal(entry.out, '17:00');
  assert.equal(entry.presIn, iso('2026-10-07T07:00:00'));
  assert.equal(entry.presOut, iso('2026-10-07T19:00:00'));
  assert.equal(entry.extraKind, '');
  assert.equal(entry.extraIn, '');
  assert.equal(entry.extraOut, '');
  assert.equal(entry.otReview, undefined);
});

test('snapshot giữ ca, ngày và loại công khi hồ sơ chuyển ca giữa phiên', async () => {
  const plannedShift = P.planShift(await staff('n1'), date);
  const before = structuredClone(plannedShift);
  const changed = { shiftCode: 'g2', sched: [] as any[] };
  const { entry, date: workDate } = P.buildDay(
    changed,
    iso('2026-10-07T08:00:00'),
    iso('2026-10-07T17:00:00'),
    'punch',
    { plannedShift }
  );
  assert.equal(workDate, date);
  assert.equal(entry.kind, 'work');
  assert.equal(entry.preset, 'n1');
  assert.equal(entry.in, '08:00');
  assert.equal(entry.out, '17:00');
  assert.deepEqual(plannedShift, before);
});

test('TTS ngoài lịch T2–T6 giữ loại làm bù thay vì tự xác nhận ngày đi làm', () => {
  const tts = { shiftCode: 'n1', sched: [1, 2, 3, 4, 5] };
  const r = P.buildDay(tts, iso('2026-10-10T08:00:00'), iso('2026-10-10T17:00:00'), 'punch');
  assert.equal(r.entry.kind, 'makeup');
  assert.equal(r.entry.plannedShift.kind, 'makeup');
  assert.equal(r.entry.attendanceConfirmed, true);
});

test('ca đêm cuối tháng giữ ngày bắt đầu; vào trễ sau 0h duyệt về đúng ca đó', async () => {
  const presence = P.presenceFor('g2', '2026-09-30', '00:30', '07:00');
  assert.deepEqual(presence, { inIso: iso('2026-10-01T00:30:00'), outIso: iso('2026-10-01T07:00:00') });
  assert.equal(P.workDate('g2', presence.inIso), '2026-09-30');
  const pending = P.buildDay(await staff('g2'), presence.inIso, presence.outIso, 'punch');
  assert.equal(pending.date, '2026-09-30');
  assert.equal(pending.entry.reason, 'incomplete-shift');
  const full = P.buildDay(await staff('n1'), presence.inIso, presence.outIso, 'admin', {
    plannedShift: pending.entry.plannedShift,
    approveIncomplete: true
  });
  assert.equal(full.date, '2026-09-30');
  assert.equal(full.entry.in, '22:00');
  assert.equal(full.entry.out, '07:00');
  assert.equal(full.entry.plannedShift.startIso, iso('2026-09-30T22:00:00'));
  assert.equal(full.entry.plannedShift.endIso, iso('2026-10-01T07:00:00'));
});

test('không giao với ca, kể cả chỉ chạm đầu/cuối ca, vẫn chờ xử lý khi Admin duyệt', async () => {
  const plannedShift = P.planShift(await staff('n1'), date);
  for (const [tin, tout] of [
    ['06:00:00', '08:00:00'],
    ['17:00:00', '18:00:00'],
    ['18:00:00', '21:00:00']
  ]) {
    const { entry } = P.buildDay(await staff('n1'), iso(`${date}T${tin}`), iso(`${date}T${tout}`), 'admin', {
      plannedShift,
      approveIncomplete: true
    });
    assert.equal(entry.kind, 'pending');
    assert.equal(entry.reason, 'off-shift');
    assert.equal(entry.attendanceConfirmed, undefined);
  }
  assert.equal(
    P.buildDay(
      { shiftCode: null, sched: [1, 2, 3, 4, 5, 6] },
      iso(`${date}T08:00:00`),
      iso(`${date}T17:00:00`),
      'admin',
      { approveIncomplete: true }
    ).entry.reason,
    'off-shift'
  );
});

test('open/forgot giữ snapshot và thời điểm gốc sau đổi ca, không sinh giờ được trả', async () => {
  const tin = iso('2026-09-30T22:00:12');
  const open = P.openDay(await staff('g2'), tin);
  assert.equal(open.date, '2026-09-30');
  assert.equal(open.entry.reason, 'open');
  assert.equal(open.entry.presIn, tin);
  const forgotten = P.forgotDay(await staff('n1'), tin, open.entry.plannedShift);
  assert.equal(forgotten.date, '2026-09-30');
  assert.equal(forgotten.entry.reason, 'forgot-out');
  assert.equal(forgotten.entry.presIn, tin);
  assert.deepEqual(forgotten.entry.plannedShift, open.entry.plannedShift);
  assert.equal(forgotten.entry.in, undefined);
  assert.equal(forgotten.entry.out, undefined);
  assert.equal(P.forgotOut(iso('2026-10-07T08:00:00'), iso('2026-10-08T00:00:00')), false);
  assert.equal(P.forgotOut(iso('2026-10-07T08:00:00'), iso('2026-10-08T00:01:00')), true);
});

test('checkoutWarning cảnh báo về sớm theo snapshot và không sửa ca đang mở', async () => {
  const open = { at: iso(`${date}T07:55:00`), plannedShift: P.planShift(await staff('n1'), date), shiftCode: 'g2' };
  const before = structuredClone(open);
  assert.deepEqual(P.checkoutWarning(open, iso(`${date}T16:00:00`)), {
    endIso: iso(`${date}T17:00:00`),
    remainingMinutes: 60
  });
  assert.deepEqual(open, before);
});

test('checkoutWarning còn một giây vẫn cảnh báo; đúng giờ kết thúc hoặc sau đó thì không', async () => {
  const open = { plannedShift: P.planShift(await staff('n1'), date) };
  assert.deepEqual(P.checkoutWarning(open, iso(`${date}T16:58:59`)), {
    endIso: iso(`${date}T17:00:00`),
    remainingMinutes: 2
  });
  assert.deepEqual(P.checkoutWarning(open, iso(`${date}T16:59:59`)), {
    endIso: iso(`${date}T17:00:00`),
    remainingMinutes: 1
  });
  assert.equal(P.checkoutWarning(open, iso(`${date}T17:00:00`)), null);
  assert.equal(P.checkoutWarning(open, iso(`${date}T17:00:01`)), null);
});

test('checkoutWarning tính đúng ca đêm qua nửa đêm và ranh giới tháng', async () => {
  const open = { at: iso('2026-09-30T21:55:00'), plannedShift: P.planShift(await staff('g2'), '2026-09-30') };
  const endIso = iso('2026-10-01T07:00:00');
  assert.deepEqual(P.checkoutWarning(open, iso('2026-09-30T23:30:00')), { endIso, remainingMinutes: 450 });
  assert.deepEqual(P.checkoutWarning(open, iso('2026-10-01T06:30:00')), { endIso, remainingMinutes: 30 });
  assert.equal(P.checkoutWarning(open, endIso), null);
});

test('checkoutWarning bỏ qua ca chưa có snapshot hoặc thời điểm không hợp lệ', async () => {
  const now = iso(`${date}T16:00:00`);
  for (const open of [
    null,
    undefined,
    {},
    { at: iso(`${date}T08:00:00`) },
    { plannedShift: {} },
    { plannedShift: { endIso: 'bad-time' } }
  ]) {
    assert.equal(P.checkoutWarning(open, now), null);
  }
  assert.equal(P.checkoutWarning({ plannedShift: P.planShift(await staff('n1'), date) }, 'bad-time'), null);
});

test('khung check-in chấp nhận đầu khung và chặn tại cuối ca', () => {
  assert.equal(P.checkInMsg('n1', iso('2026-10-07T04:00:00')), '');
  assert.notEqual(P.checkInMsg('n1', iso('2026-10-07T03:59:00')), '');
  assert.notEqual(P.checkInMsg('n1', iso('2026-10-07T17:00:00')), '');
  assert.equal(P.checkInMsg('g2', iso('2026-10-08T00:30:00')), '');
  assert.notEqual(P.checkInMsg('g2', iso('2026-10-08T07:00:00')), '');
  assert.notEqual(P.checkInMsg(null, iso('2026-10-07T08:00:00')), '');
});

test('extraFits cho đúng biên có mặt và từ chối vượt trước/sau, không sửa bản ghi', async () => {
  const { entry } = P.buildDay(await staff('n1'), iso(`${date}T07:00:00`), iso(`${date}T19:00:00`), 'punch');
  const extra = { ...entry, extraKind: 'makeup', extraIn: '07:00', extraOut: '19:00' };
  const before = structuredClone(extra);
  assert.equal(P.extraFits(extra), '');
  assert.deepEqual(extra, before);
  assert.match(P.extraFits({ ...extra, extraIn: '06:59' }), /check-in/);
  assert.match(P.extraFits({ ...extra, extraOut: '19:01' }), /check-out/);
  assert.equal(P.extraFits({ ...entry, extraKind: 'ot', extraIn: '08:00', extraOut: '17:00' }), '');
});

test('extraFits không làm tròn giây để mở rộng thời gian có mặt', async () => {
  const { entry } = P.buildDay(await staff('n1'), iso(`${date}T07:00:01`), iso(`${date}T18:59:59`), 'punch');
  assert.match(P.extraFits({ ...entry, extraKind: 'makeup', extraIn: '07:00' }), /check-in/);
  assert.match(P.extraFits({ ...entry, extraKind: 'makeup', extraOut: '19:00' }), /check-out/);
  assert.equal(P.extraFits({ ...entry, extraKind: 'makeup', extraIn: '07:01', extraOut: '18:59' }), '');
});

test('extraFits định vị phần làm thêm ca đêm ở đúng ngày sau nửa đêm', async () => {
  const { entry } = P.buildDay(await staff('g2'), iso('2026-09-30T21:30:00'), iso('2026-10-01T08:00:00'), 'punch');
  // Hàm này chỉ kiểm có mặt; quyền/khung giờ được làm bù hoặc OT do validator riêng xử lý.
  assert.equal(P.extraFits({ ...entry, extraKind: 'makeup', extraIn: '21:30', extraOut: '08:00' }), '');
  assert.match(P.extraFits({ ...entry, extraKind: 'makeup', extraIn: '21:29' }), /check-in/);
  assert.match(P.extraFits({ ...entry, extraKind: 'makeup', extraOut: '08:01' }), /check-out/);
});

test('extraFits sau Admin duyệt ca thiếu vẫn neo vào ca dự kiến, không dịch sang hôm sau', async () => {
  const { entry } = P.buildDay(await staff('n1'), iso(`${date}T08:15:00`), iso(`${date}T18:00:00`), 'admin', {
    approveIncomplete: true
  });
  assert.equal(P.extraFits({ ...entry, extraKind: 'ot', extraOut: '18:00' }), '');
  assert.match(P.extraFits({ ...entry, extraKind: 'ot', extraOut: '18:01' }), /check-out/);
  assert.match(P.extraFits({ ...entry, extraKind: 'makeup', extraIn: '07:59' }), /check-in/);
});

test('workBounds không coi bản ghi đêm cũ vào sau 0h là chồng giờ với hôm trước', () => {
  const previous = {
    kind: 'work',
    in: '22:00',
    out: '07:00',
    src: 'punch',
    presIn: iso('2026-09-29T22:00:00'),
    presOut: iso('2026-09-30T07:00:00')
  };
  const next = {
    kind: 'work',
    in: '00:30',
    out: '07:00',
    src: 'punch',
    presIn: iso('2026-10-01T00:30:00'),
    presOut: iso('2026-10-01T07:00:00')
  };
  const a = P.workBounds(previous, '2026-09-29'),
    b = P.workBounds(next, '2026-09-30');
  assert.equal(a.end - a.start, 540);
  assert.equal(b.end - b.start, 390);
  assert.equal(b.start - a.end, 1050); // Hai ca cách nhau 17 giờ 30 phút.
  const actuallyOverlapping = {
    ...next,
    in: '06:30',
    presIn: iso('2026-09-30T06:30:00'),
    presOut: iso('2026-09-30T07:00:00')
  };
  assert.equal(P.workBounds(actuallyOverlapping, '2026-09-30').start - a.end, -30);
});

test('workBounds tính phần khai thêm hai đầu, không cộng toàn bộ thời gian có mặt', async () => {
  const { entry } = P.buildDay(await staff('n1'), iso(`${date}T07:00:00`), iso(`${date}T19:00:00`), 'punch');
  const ordinary = P.workBounds(entry, date);
  assert.equal(ordinary.end - ordinary.start, 540);
  const extra = P.workBounds({ ...entry, extraKind: 'makeup', extraIn: '07:30', extraOut: '18:00' }, date);
  assert.equal(extra.start - ordinary.start, -30);
  assert.equal(extra.end - ordinary.end, 60);
  assert.equal(extra.end - extra.start, 630);
  const manual = P.workBounds({ in: '22:00', out: '07:00' }, '2026-09-30');
  const morning = P.workBounds({ in: '08:00', out: '17:00' }, '2026-10-01');
  assert.equal(morning.start - manual.end, 60);
});
