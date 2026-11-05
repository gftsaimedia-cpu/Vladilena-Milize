import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DayConflictError,
  planClaims,
  type ActiveStatus,
  type ClaimStatus,
  type DayClaim,
  type DayView,
  type NewRequestKind,
  type WindowSource
} from '../../src/modules/requests/domain';

const SAT = '2026-11-14';
const WED = '2026-11-11';

interface Fixture {
  claims?: DayClaim[];
  windows?: Record<string, WindowSource[]>;
  holidays?: string[];
}

const claim = (date: string, status: ClaimStatus, requestStatus: ActiveStatus, requestId = `${status}-${date}`): DayClaim => ({
  employeeId: 'nv',
  date,
  status,
  requestId,
  baseRequestId: null,
  requestStatus,
  baseRequestStatus: null
});

const view = ({ claims = [], windows = {}, holidays = [] }: Fixture = {}): DayView => {
  const byDate = new Map(claims.map(c => [c.date, c]));
  return {
    claimOn: date => byDate.get(date) ?? null,
    windowSourcesOn: date => windows[date] ?? [],
    isHoliday: date => holidays.includes(date)
  };
};

const plan = (kind: NewRequestKind, dates: string[], fixture: Fixture = {}, ownRequestId?: string) =>
  planClaims({ kind, dates, days: view(fixture), ownRequestId });

const conflict = (run: () => unknown): DayConflictError => {
  try {
    run();
  } catch (error) {
    assert.ok(error instanceof DayConflictError, `expected DayConflictError, got ${String(error)}`);
    return error;
  }
  assert.fail('expected a DayConflictError');
};

const C1 = 'Thứ Bảy 14/11 đã có iSAT được duyệt, không chọn được ngày này.';
const C2 = 'Thứ Bảy 14/11 đã có iSAT được duyệt, không tính vào đơn.';
const C3 = 'Thứ Bảy 14/11 đang có đơn iSAT chờ duyệt. Huỷ đơn iSAT hoặc chọn ngày khác.';
const C4 = 'Ngày 11/11 đang nghỉ, giữ nguyên ngày nghỉ, không đổi ca.';
const C5 = 'Thứ Bảy 14/11 là ngày lễ, không chọn được cho iSAT.';
const C6 = 'Thứ Bảy 14/11 đã nghỉ theo đơn đã duyệt, không chọn được cho iSAT.';
const C7 = 'Thứ Bảy 14/11 đang có đơn nghỉ chờ duyệt. Huỷ đơn nghỉ hoặc chọn Thứ Bảy khác.';
const C8 = 'Thứ Bảy 14/11 đã có khung OT hoặc làm bù được duyệt, không chọn được cho iSAT.';
const C9_OT = 'Thứ Bảy 14/11 đang có đơn OT chờ duyệt. Huỷ đơn đó hoặc chọn Thứ Bảy khác.';
const C9_LWM = 'Thứ Bảy 14/11 đang có đơn nghỉ có làm bù chờ duyệt. Huỷ đơn đó hoặc chọn Thứ Bảy khác.';
const DUPLICATE_ISAT = 'Đã có đơn iSAT cho Thứ Bảy 14/11/2026';

// ---- Hàng "ngày trống" ----

for (const kind of ['LEAVE', 'LEAVE_WITH_MAKEUP', 'SHIFT_CHANGE', 'ISAT'] as const) {
  test(`${kind} on a free day takes it`, () => {
    assert.deepEqual(plan(kind, [SAT]), { take: [{ date: SAT, replaces: null }], skipped: [], warnings: [] });
  });
}

for (const kind of ['OVERTIME', 'MAKEUP_SLOT', 'EXPLANATION'] as const) {
  test(`${kind} on a free day is allowed and takes no day`, () => {
    assert.deepEqual(plan(kind, [SAT]), { take: [], skipped: [], warnings: [] });
  });
}

// ---- Hàng dòng SHIFT_CHANGE ----

for (const status of ['PENDING', 'APPROVED'] as const) {
  const shiftRow = claim(SAT, 'SHIFT_CHANGE', status, 'sc-1');

  for (const kind of ['LEAVE', 'LEAVE_WITH_MAKEUP'] as const) {
    test(`${kind} on ${status} SHIFT_CHANGE replaces it`, () => {
      assert.deepEqual(plan(kind, [SAT], { claims: [shiftRow] }), {
        take: [{ date: SAT, replaces: shiftRow }],
        skipped: [],
        warnings: []
      });
    });
  }

  test(`SHIFT_CHANGE on ${status} SHIFT_CHANGE throws the old duplicate message`, () => {
    const error = conflict(() => plan('SHIFT_CHANGE', [SAT], { claims: [shiftRow] }));
    assert.equal(error.message, 'Ngày 14/11 đã có đơn đổi ca khác');
    assert.deepEqual(error.info, { date: SAT, requestId: 'sc-1', requestType: 'SHIFT_CHANGE', requestStatus: status });
  });

  test(`ISAT on ${status} SHIFT_CHANGE replaces it`, () => {
    assert.deepEqual(plan('ISAT', [SAT], { claims: [shiftRow] }), {
      take: [{ date: SAT, replaces: shiftRow }],
      skipped: [],
      warnings: []
    });
  });

  for (const kind of ['OVERTIME', 'MAKEUP_SLOT', 'EXPLANATION'] as const) {
    test(`${kind} on ${status} SHIFT_CHANGE is allowed`, () => {
      assert.deepEqual(plan(kind, [SAT], { claims: [shiftRow] }), { take: [], skipped: [], warnings: [] });
    });
  }
}

// ---- Hàng dòng LEAVE / LEAVE_WITH_MAKEUP ----

for (const rowStatus of ['LEAVE', 'LEAVE_WITH_MAKEUP'] as const) {
  for (const status of ['PENDING', 'APPROVED'] as const) {
    const leaveRow = claim(WED, rowStatus, status, 'lv-1');

    for (const kind of ['LEAVE', 'LEAVE_WITH_MAKEUP'] as const) {
      test(`${kind} on ${status} ${rowStatus} throws the defensive duplicate-leave message`, () => {
        const error = conflict(() => plan(kind, [WED], { claims: [leaveRow] }));
        assert.equal(error.message, 'Ngày 11/11 đã có đơn nghỉ');
        assert.deepEqual(error.info, { date: WED, requestId: 'lv-1', requestType: rowStatus, requestStatus: status });
      });
    }

    test(`SHIFT_CHANGE on ${status} ${rowStatus} skips the day with C4`, () => {
      assert.deepEqual(
        // Thêm một ngày thường để đơn còn ngày được tính.
        plan('SHIFT_CHANGE', [WED, '2026-11-12'], { claims: [leaveRow] }),
        {
          take: [{ date: '2026-11-12', replaces: null }],
          skipped: [WED],
          warnings: [C4]
        }
      );
    });

    test(`ISAT on ${status} ${rowStatus} throws ${status === 'APPROVED' ? 'C6' : 'C7'}`, () => {
      const satLeave = claim(SAT, rowStatus, status, 'lv-2');
      const error = conflict(() => plan('ISAT', [SAT], { claims: [satLeave] }));
      assert.equal(error.message, status === 'APPROVED' ? C6 : C7);
      assert.deepEqual(error.info, { date: SAT, requestId: 'lv-2', requestType: rowStatus, requestStatus: status });
    });

    for (const kind of ['OVERTIME', 'MAKEUP_SLOT', 'EXPLANATION'] as const) {
      test(`${kind} on ${status} ${rowStatus} is allowed`, () => {
        assert.deepEqual(plan(kind, [WED], { claims: [leaveRow] }), { take: [], skipped: [], warnings: [] });
      });
    }
  }
}

// ---- Hàng iSAT đã duyệt ----

const approvedIsat = claim(SAT, 'ISAT', 'APPROVED', 'isat-1');
const pendingIsat = claim(SAT, 'ISAT', 'PENDING', 'isat-2');

for (const kind of ['LEAVE', 'LEAVE_WITH_MAKEUP', 'SHIFT_CHANGE'] as const) {
  test(`${kind} on approved ISAT skips the day with C2`, () => {
    assert.deepEqual(plan(kind, [SAT, '2026-11-16'], { claims: [approvedIsat] }), {
      take: [{ date: '2026-11-16', replaces: null }],
      skipped: [SAT],
      warnings: [C2]
    });
  });

  test(`${kind} on pending ISAT throws C3`, () => {
    const error = conflict(() => plan(kind, [SAT], { claims: [pendingIsat] }));
    assert.equal(error.message, C3);
    assert.deepEqual(error.info, { date: SAT, requestId: 'isat-2', requestType: 'ISAT', requestStatus: 'PENDING' });
  });
}

for (const kind of ['OVERTIME', 'MAKEUP_SLOT', 'EXPLANATION'] as const) {
  test(`${kind} on approved ISAT throws C1`, () => {
    const error = conflict(() => plan(kind, [SAT], { claims: [approvedIsat] }));
    assert.equal(error.message, C1);
    assert.deepEqual(error.info, { date: SAT, requestId: 'isat-1', requestType: 'ISAT', requestStatus: 'APPROVED' });
  });

  test(`${kind} on pending ISAT throws C3`, () => {
    const error = conflict(() => plan(kind, [SAT], { claims: [pendingIsat] }));
    assert.equal(error.message, C3);
    assert.deepEqual(error.info, { date: SAT, requestId: 'isat-2', requestType: 'ISAT', requestStatus: 'PENDING' });
  });
}

test('ISAT on approved ISAT throws the old duplicate-iSAT message', () => {
  const error = conflict(() => plan('ISAT', [SAT], { claims: [approvedIsat] }));
  assert.equal(error.message, DUPLICATE_ISAT);
  assert.deepEqual(error.info, { date: SAT, requestId: 'isat-1', requestType: 'ISAT', requestStatus: 'APPROVED' });
});

test('ISAT on pending ISAT throws the old duplicate-iSAT message', () => {
  const error = conflict(() => plan('ISAT', [SAT], { claims: [pendingIsat] }));
  assert.equal(error.message, DUPLICATE_ISAT);
  assert.deepEqual(error.info, { date: SAT, requestId: 'isat-2', requestType: 'ISAT', requestStatus: 'PENDING' });
});

// ---- Riêng ISAT: ngày lễ và khung OT/bù ----

test('ISAT on a holiday throws C5 with null request info', () => {
  const error = conflict(() => plan('ISAT', [SAT], { holidays: [SAT] }));
  assert.equal(error.message, C5);
  assert.deepEqual(error.info, { date: SAT, requestId: null, requestType: null, requestStatus: null });
});

test('ISAT checks the holiday before the day row', () => {
  const error = conflict(() => plan('ISAT', [SAT], { holidays: [SAT], claims: [approvedIsat] }));
  assert.equal(error.message, C5);
});

test('ISAT with an approved OT window throws C8', () => {
  const windows = { [SAT]: [{ kind: 'OT', requestId: 'ot-1', requestStatus: 'APPROVED' } as const] };
  const error = conflict(() => plan('ISAT', [SAT], { windows }));
  assert.equal(error.message, C8);
  assert.deepEqual(error.info, { date: SAT, requestId: 'ot-1', requestType: 'OVERTIME', requestStatus: 'APPROVED' });
});

test('ISAT with a pending OT window throws C9 naming the OT request', () => {
  const windows = { [SAT]: [{ kind: 'OT', requestId: 'ot-2', requestStatus: 'PENDING' } as const] };
  const error = conflict(() => plan('ISAT', [SAT], { windows }));
  assert.equal(error.message, C9_OT);
  assert.deepEqual(error.info, { date: SAT, requestId: 'ot-2', requestType: 'OVERTIME', requestStatus: 'PENDING' });
});

test('C9 names the leave-with-makeup request for a MAKEUP window', () => {
  const windows = { [SAT]: [{ kind: 'MAKEUP', requestId: 'lwm-1', requestStatus: 'PENDING' } as const] };
  const error = conflict(() => plan('ISAT', [SAT], { windows }));
  assert.equal(error.message, C9_LWM);
  assert.deepEqual(error.info, {
    date: SAT,
    requestId: 'lwm-1',
    requestType: 'LEAVE_WITH_MAKEUP',
    requestStatus: 'PENDING'
  });
});

test('C9 names the first pending window when several are pending', () => {
  const windows = {
    [SAT]: [
      { kind: 'MAKEUP', requestId: 'lwm-1', requestStatus: 'PENDING' } as const,
      { kind: 'OT', requestId: 'ot-2', requestStatus: 'PENDING' } as const
    ]
  };
  const error = conflict(() => plan('ISAT', [SAT], { windows }));
  assert.equal(error.message, C9_LWM);
  assert.equal(error.info.requestId, 'lwm-1');
});

test('ISAT prefers C8 when both approved and pending windows exist', () => {
  const windows = {
    [SAT]: [
      { kind: 'OT', requestId: 'ot-pending', requestStatus: 'PENDING' } as const,
      { kind: 'MAKEUP', requestId: 'lwm-approved', requestStatus: 'APPROVED' } as const
    ]
  };
  const error = conflict(() => plan('ISAT', [SAT], { windows }));
  assert.equal(error.message, C8);
  assert.equal(error.info.requestId, 'lwm-approved');
  assert.equal(error.info.requestType, 'LEAVE_WITH_MAKEUP');
});

test('ISAT checks the day row before the windows', () => {
  const windows = { [SAT]: [{ kind: 'OT', requestId: 'ot-1', requestStatus: 'APPROVED' } as const] };
  const error = conflict(() => plan('ISAT', [SAT], { windows, claims: [claim(SAT, 'LEAVE', 'APPROVED', 'lv-1')] }));
  assert.equal(error.message, C6);
});

test('OT does not look at windows (the service keeps checking them)', () => {
  const windows = { [SAT]: [{ kind: 'OT', requestId: 'ot-1', requestStatus: 'APPROVED' } as const] };
  assert.deepEqual(plan('OVERTIME', [SAT], { windows }), { take: [], skipped: [], warnings: [] });
});

// ---- Đơn theo khoảng ----

test('range 12–16/11 over approved ISAT 14/11 takes 12, 13, 16', () => {
  const result = plan('LEAVE', ['2026-11-12', '2026-11-13', SAT, '2026-11-16'], { claims: [approvedIsat] });
  assert.deepEqual(
    result.take.map(t => t.date),
    ['2026-11-12', '2026-11-13', '2026-11-16']
  );
  assert.deepEqual(result.skipped, [SAT]);
  assert.deepEqual(result.warnings, [C2]);
});

test('range made only of approved ISAT days throws C1 on the first', () => {
  const sat2 = '2026-11-21';
  const error = conflict(() =>
    plan('LEAVE', [SAT, sat2], { claims: [approvedIsat, claim(sat2, 'ISAT', 'APPROVED', 'isat-3')] })
  );
  assert.equal(error.message, C1);
  assert.deepEqual(error.info, { date: SAT, requestId: 'isat-1', requestType: 'ISAT', requestStatus: 'APPROVED' });
});

test('pending ISAT inside a range wins over an approved ISAT earlier in the range', () => {
  const sat2 = '2026-11-21';
  const error = conflict(() =>
    plan('LEAVE', [SAT, sat2], { claims: [approvedIsat, claim(sat2, 'ISAT', 'PENDING', 'isat-4')] })
  );
  assert.equal(error.message, 'Thứ Bảy 21/11 đang có đơn iSAT chờ duyệt. Huỷ đơn iSAT hoặc chọn ngày khác.');
  assert.equal(error.info.date, sat2);
  assert.equal(error.info.requestId, 'isat-4');
});

test('range with no taken day and no ISAT throws the old empty-range message', () => {
  assert.throws(() => plan('LEAVE', []), { message: 'Khoảng nghỉ không có ngày làm việc' });
  assert.throws(() => plan('LEAVE_WITH_MAKEUP', []), { message: 'Khoảng nghỉ không có ngày làm việc' });
  assert.throws(() => plan('SHIFT_CHANGE', []), { message: 'Khoảng đổi ca không có ngày làm việc' });
});

test('a shift-change range whose days are all on leave throws the old empty-range message', () => {
  assert.throws(() => plan('SHIFT_CHANGE', [WED], { claims: [claim(WED, 'LEAVE', 'APPROVED', 'lv-1')] }), {
    message: 'Khoảng đổi ca không có ngày làm việc'
  });
});

test('a range skipped for both leave and approved ISAT throws the old empty-range message', () => {
  assert.throws(
    () =>
      plan('SHIFT_CHANGE', [WED, SAT], {
        claims: [claim(WED, 'LEAVE', 'APPROVED', 'lv-1'), approvedIsat]
      }),
    { message: 'Khoảng đổi ca không có ngày làm việc' }
  );
});

test('the empty-range error is a plain Error, not a day conflict', () => {
  try {
    plan('LEAVE', []);
    assert.fail('expected an error');
  } catch (error) {
    assert.ok(!(error instanceof DayConflictError));
  }
});

test('range takes come back in day order without duplicates, with warnings in day order', () => {
  const result = plan('SHIFT_CHANGE', ['2026-11-16', WED, SAT, WED, '2026-11-12'], {
    claims: [claim(WED, 'LEAVE', 'PENDING', 'lv-1'), approvedIsat]
  });
  assert.deepEqual(
    result.take.map(t => t.date),
    ['2026-11-12', '2026-11-16']
  );
  assert.deepEqual(result.skipped, [WED, SAT]);
  assert.deepEqual(result.warnings, [C4, C2]);
});

test('the first blocked day of a range throws immediately', () => {
  const error = conflict(() =>
    plan('LEAVE', ['2026-11-12', SAT, '2026-11-16'], {
      claims: [pendingIsat, claim('2026-11-16', 'LEAVE', 'APPROVED', 'lv-9')]
    })
  );
  assert.equal(error.message, C3);
});

// ---- ownRequestId ----

test('ownRequestId rows count as free', () => {
  assert.deepEqual(plan('ISAT', [SAT], { claims: [approvedIsat] }, 'isat-1'), {
    take: [{ date: SAT, replaces: null }],
    skipped: [],
    warnings: []
  });
  assert.deepEqual(plan('SHIFT_CHANGE', [SAT], { claims: [claim(SAT, 'SHIFT_CHANGE', 'PENDING', 'sc-own')] }, 'sc-own'), {
    take: [{ date: SAT, replaces: null }],
    skipped: [],
    warnings: []
  });
  assert.deepEqual(plan('LEAVE', [SAT], { claims: [pendingIsat] }, 'isat-2').skipped, []);
});

test('ownRequestId does not hide the rows of other requests', () => {
  const error = conflict(() => plan('ISAT', [SAT], { claims: [approvedIsat] }, 'someone-else'));
  assert.equal(error.message, DUPLICATE_ISAT);
});

test('ownRequestId also ignores the windows of that request', () => {
  const windows = { [SAT]: [{ kind: 'MAKEUP', requestId: 'lwm-own', requestStatus: 'PENDING' } as const] };
  assert.deepEqual(plan('ISAT', [SAT], { windows }, 'lwm-own').take, [{ date: SAT, replaces: null }]);
});

// ---- DayConflictError ----

test('forReview appends the reviewer sentence and keeps info', () => {
  const error = conflict(() => plan('LEAVE', [SAT], { claims: [pendingIsat] }));
  const review = error.forReview();
  assert.ok(review instanceof DayConflictError);
  assert.equal(review.message, `${C3} Chỉ có thể từ chối đơn này.`);
  assert.deepEqual(review.info, error.info);
  assert.equal(error.message, C3);
});
