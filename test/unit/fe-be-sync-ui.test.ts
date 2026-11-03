'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildPeriodView, buildRow } = require('../../web/src/builders/admin-payroll/payroll');
const { buildDrawer } = require('../../web/src/builders/payslip/drawer');
const { describeScenario } = require('../../web/src/views/admin/payroll/scenarios');
const { getPeriodApprovalSummary, approvePeriod } = require('../../web/src/services/admin-payroll');
const { buildSheetBody, buildOvertime, buildTimesheet, buildDayDetail } = require('../../web/src/builders/admin-attendance/timesheet');
const { buildOverview } = require('../../web/src/builders/admin-main/overview');
const { buildPunchBodyForDesktop } = require('../../web/src/services/staff-desktop');
const { buildHome: buildPhoneHome } = require('../../web/src/builders/staff-phone/home');
const { buildAttendance: buildPhoneAttendance } = require('../../web/src/builders/staff-phone/attendance');

test('buildPeriodView: phiếu draft không tính vào facts.pending gây chặn duyệt kỳ', () => {
  const period = {
    status: 'calculated',
    rev: 7,
    run: { runNo: 1 },
    totals: { people: 10, gross: 100, insurance: 10, tax: 5, advance: 0, net: 85, approved: 0, pending: 0, draft: 9, error: 1 },
    stages: { attendanceLocked: { at: null }, approved: { at: null }, paid: { at: null } }
  };
  const list = { total: 10, page: 1, rows: [{ username: 'u1', name: 'A', type: 'nv', level: 1, status: 'draft' }] };
  const view = buildPeriodView('2026-11', period, list, { filter: 'all', pageSize: 14 });
  assert.equal(view.facts.pending, 0);
  assert.equal(view.facts.draft, 9);
  assert.equal(view.facts.unapproved, 9);
});

test('buildRow: gán shortProblem từ errorMessage, problem hoặc câu mặc định', () => {
  const r1 = buildRow({ username: 'u1', name: 'A', type: 'nv', level: 1, status: 'error', errorMessage: 'Thiếu CCCD' });
  assert.equal(r1.shortProblem, 'Thiếu CCCD');

  const r2 = buildRow({ username: 'u2', name: 'B', type: 'nv', level: 1, status: 'error', problem: 'Chưa chấm công' });
  assert.equal(r2.shortProblem, 'Chưa chấm công');

  const r3 = buildRow({ username: 'u3', name: 'C', type: 'nv', level: 1, status: 'error' });
  assert.equal(r3.shortProblem, 'Hồ sơ hoặc công chưa hợp lệ');
});

test('buildDrawer: phiếu draft bật canApprove và không lặp 2 pill Bản nháp', () => {
  const drawer = buildDrawer(
    '2026-11',
    'linh',
    { status: 'calculated' },
    {
      source: 'payslip',
      run: { runNo: 2 },
      payslip: { username: 'linh', name: 'Linh', type: 'nv', level: 1, status: 'draft', rev: 1, gross: 100, net: 90, cells: {} }
    }
  );
  assert.equal(drawer.canApprove, true);
  assert.equal(drawer.pills.length, 1);
  assert.equal(drawer.pills[0].label, 'Bản nháp · lần tính 2');
});

test('describeScenario: tháng 2026-11 dùng cùng kịch bản theo trạng thái kỳ, không khoá cứng nút Chốt công', () => {
  const ui = describeScenario('2026-11', 'tam-tinh', { calculated: 10, failed: 0, deadline: '' });
  const closeBtn = ui.actions.find((a: any) => a.key === 'close');
  assert.ok(closeBtn && !closeBtn.off);
  assert.equal(ui.extras, true);
});

test('getPeriodApprovalSummary: gom đủ danh sách phiếu lỗi qua các trang và trả rev + số lượng', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    calls.push({ url, method: init.method });
    if (url === '/api/periods/2026-11') {
      return new Response(JSON.stringify({
        rev: 12,
        totals: { people: 205, draft: 190, pending: 5, approved: 8, error: 2 }
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.includes('/api/periods/2026-11/payslips') && url.includes('page=1')) {
      return new Response(JSON.stringify({
        total: 2,
        page: 1,
        rows: [
          { username: 'err1', name: 'Error 1', errorMessage: 'Lỗi hồ sơ' },
          { username: 'err2', name: 'Error 2', problem: 'Lỗi chấm công' }
        ]
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({ total: 0, rows: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  try {
    const summary = await getPeriodApprovalSummary('2026-11');
    assert.equal(summary.rev, 12);
    assert.equal(summary.draft, 190);
    assert.equal(summary.legacyPending, 5);
    assert.equal(summary.approved, 8);
    assert.equal(summary.errors.length, 2);
    assert.deepEqual(summary.errors[0], { username: 'err1', name: 'Error 1', shortProblem: 'Lỗi hồ sơ' });
    assert.deepEqual(summary.errors[1], { username: 'err2', name: 'Error 2', shortProblem: 'Lỗi chấm công' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('approvePeriod: gửi rev và excludeErrors tới POST /periods/:month/approve', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, method: init.method, body });
    return new Response(JSON.stringify({ ok: true, status: 'approved' }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };

  try {
    const res = await approvePeriod('2026-11', {
      rev: 15,
      excludeErrors: [{ username: 'err1', reason: 'Nghỉ không lương cả tháng' }]
    });
    assert.equal(res.ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, '/api/periods/2026-11/approve');
    assert.equal(calls[0].method, 'POST');
    assert.deepEqual(calls[0].body, {
      rev: 15,
      excludeErrors: [{ username: 'err1', reason: 'Nghỉ không lương cả tháng' }]
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('buildSheetBody: truyền reason khi Admin sửa giờ', () => {
  const detail = { personId: 'linh', rev: 3, days: {} };
  const body = buildSheetBody(detail, {
    date: '2026-10-05',
    checkIn: '08:00',
    checkOut: '17:30',
    shift: 'n1',
    reason: 'Quên bấm ra'
  });
  assert.equal(body.reason, 'Quên bấm ra');
  assert.equal(body.days['2026-10-05'].note, 'Quên bấm ra');
});

test('buildOvertime: giữ sessionId và version để duyệt/từ chối OT', () => {
  const res = buildOvertime({
    ot: { ot: [{ sessionId: 42, version: 2, username: 'linh', name: 'Linh', date: '2026-10-05', shiftCode: 'n1', otHours: '2h' }] },
    month: '2026-10',
    status: 'pending'
  });
  assert.equal(res.rows[0].sessionId, 42);
  assert.equal(res.rows[0].version, 2);
});

test('buildOverview: link quên Check-in/out trỏ về ?filter=pending và không đếm TTS thiếu ngày bắt đầu', () => {
  const ov = buildOverview({
    month: '2026-10',
    serverNow: '2026-10-15T03:00:00Z',
    requests: [],
    alerts: { missingPunches: [{ username: 'linh', date: '2026-10-02', kind: 'forgot-out' }], absentNoExplanation: [] },
    staff: [
      { username: 'tts1', payrollSubject: true, locked: false, type: 'tts', startDate: null, shiftCode: 'n1' },
      { username: 'nv1', payrollSubject: true, locked: false, type: 'nv', startDate: null, shiftCode: 'n1' }
    ],
    today: { rows: [] },
    period: null,
    estimates: null,
    holidays: []
  });
  const forgotRow = ov.blockers.rows.find((r: any) => r.key === 'forgot');
  const startRow = ov.blockers.rows.find((r: any) => r.key === 'start');
  assert.equal(forgotRow.action.to, '/admin/cham-cong?filter=pending');
  assert.equal(startRow.count, 1);
});

test('buildPunchBodyForDesktop: gửi location khi geofenceRequired bật và lấy sessionId từ state.open', async () => {
  const inBody = await buildPunchBodyForDesktop({
    type: 'in',
    requestId: 'rq-12345678',
    me: { geofenceRequired: true },
    getPos: async () => ({ lat: 21.0, lng: 105.8, accuracy: 12 })
  });
  assert.deepEqual(inBody.location, { lat: 21.0, lng: 105.8, accuracy: 12 });

  const outBody = await buildPunchBodyForDesktop({
    type: 'out',
    requestId: 'rq-87654321',
    punchState: { open: { id: 99 } }
  });
  assert.equal(outBody.sessionId, 99);
});

test('staff-phone buildHome & buildAttendance: đọc đúng r.late và tính Phút bị trừ từ giờ thiếu (không lấy tiền m.cut)', () => {
  const sheet = {
    days: { '2026-10-02': { kind: 'work' } },
    attendanceSessions: [{ date: '2026-10-02', entry: { presIn: '2026-10-02T01:20:00Z', presOut: '2026-10-02T10:30:00Z' } }],
    actualReport: {
      missing: [],
      report: { '2026-10-02': { state: 'ok', late: 20, cutStartMin: 30, cutEndMin: 0, gapCutMin: 0 } }
    }
  };
  const home = buildPhoneHome({
    me: { serverNow: '2026-10-02T11:00:00Z', user: { name: 'Linh', username: 'linh' } },
    punch: { serverNow: '2026-10-02T11:00:00Z', canCheckIn: true },
    sheet,
    estimate: { toDate: { count: 1, upTo: '2026-10-02' }, net: { net: 500000 } }
  });
  const lateFact = home.facts.find((f: any) => f.label === 'Đi trễ');
  assert.ok(lateFact);
  assert.equal(lateFact.value, '20 phút');

  const att = buildPhoneAttendance({
    month: '2026-10',
    sheet,
    estimate: { m: { count: 1, cut: 125000, short: 0.5 } },
    me: { holidays: [] },
    today: '2026-10-02',
    nav: {},
    shiftLine: 'Ca 1',
    nowIso: '2026-10-02T11:00:00Z'
  });
  assert.equal(att.stats.length, 3);
  assert.deepEqual(att.stats[1], { value: '20', label: 'Phút đi trễ' });
  assert.deepEqual(att.stats[2], { value: '30', label: 'Phút bị trừ' });
});

test('buildTimesheet: dòng nhân sự chỉ hiện loại và tên ca ngắn, tách giờ ca sang shiftTooltip', () => {
  const out = buildTimesheet({
    team: {
      month: '2026-10',
      rows: [{ staff: { username: 'linh', name: 'Linh', type: 'nv', shiftCode: 'n1' }, attendanceSessions: [] }]
    },
    shifts: { shifts: [{ code: 'n1', name: 'Ca 1', in: '08:00', out: '17:30' }] },
    today: '2026-10-15',
    holidays: []
  });
  assert.equal(out.rows[0].sub, 'NV · Ca 1');
  assert.equal(out.rows[0].shiftTooltip, 'Ca 1 08:00–17:30');
});

test('KpiShell, GroupClean, HomeView: đã xoá các nhãn Sắp có / Không có cảnh báo thừa và nối nút duyệt lẻ', () => {
  const kpi = fs.readFileSync(path.join(__dirname, '../../web/src/views/admin/kpi/KpiShell.vue'), 'utf8');
  assert.ok(!kpi.includes('OKR <small>Sắp có</small>'));

  const clean = fs.readFileSync(path.join(__dirname, '../../web/src/views/admin/requests/GroupClean.vue'), 'utf8');
  assert.ok(!clean.includes('<h2>Không có cảnh báo</h2>'));
  assert.ok(clean.includes("emit('approve', r)"));

  const phoneHome = fs.readFileSync(path.join(__dirname, '../../web/src/views/staff-phone/HomeView.vue'), 'utf8');
  assert.ok(!phoneHome.includes('Sửa giờ <small>Sắp có</small>'));
});

test('GFT Shell & Dark Gold Theme: ui store mặc định side dark và density gon; AdminSidebar không còn role switcher thừa', () => {
  const uiSrc = fs.readFileSync(path.join(__dirname, '../../web/src/stores/ui.ts'), 'utf8');
  assert.ok(uiSrc.includes("side: 'dark'"));
  assert.ok(uiSrc.includes("density: 'gon'"));

  const sidebar = fs.readFileSync(path.join(__dirname, '../../web/src/components/shell/AdminSidebar.vue'), 'utf8');
  assert.ok(!sidebar.includes('Lương, chấm công, phúc lợi · GFT'));
  assert.ok(!sidebar.includes('class="mode-switch"'), 'AdminSidebar không còn mode-switch');
  assert.ok(!sidebar.includes('/nhan-vien/hom-nay'), 'AdminSidebar không còn link chết /nhan-vien/hom-nay');
});

test('OverviewView & overview.ts: buildOverview trả periodCard đầy đủ và OverviewView bố cục Dark & Gold hero + seg-bar + duyệt/từ chối', () => {
  const ov = buildOverview({
    month: '2026-10',
    serverNow: '2026-10-15T08:00:00Z',
    requests: [],
    staff: [{ username: 'u1', type: 'nv', payrollSubject: true, locked: false, startDate: '2026-01-01', shiftCode: 's1' }],
    period: {
      status: 'calculated',
      totals: { people: 15, approved: 10, pending: 3, draft: 1, error: 1, gross: 150000000, net: 130000000, advance: 5000000 }
    },
    paydayExpected: '2026-11-05',
    holidays: []
  });
  assert.ok(ov.periodCard);
  assert.equal(ov.periodCard.status, 'calculated');
  assert.equal(ov.periodCard.statusLabel, 'Chờ duyệt');
  assert.equal(ov.periodCard.statusCls, 'p-pend');
  assert.equal(ov.periodCard.people, 15);
  assert.equal(ov.periodCard.approved, 10);
  assert.equal(ov.periodCard.pending, 3);
  assert.equal(ov.periodCard.draft, 1);
  assert.equal(ov.periodCard.error, 1);
  assert.equal(ov.periodCard.paydayExpected, '2026-11-05');

  const viewSrc = fs.readFileSync(path.join(__dirname, '../../web/src/views/admin/overview/OverviewView.vue'), 'utf8');
  const kpisIdx = viewSrc.indexOf('class="kpis"');
  const gridIdx = viewSrc.indexOf('class="ov-grid"');
  assert.ok(kpisIdx !== -1 && gridIdx !== -1 && kpisIdx < gridIdx, '.kpis phải nằm TRƯỚC .ov-grid');
  assert.ok(viewSrc.includes('kpi-hero'), 'phải có class kpi-hero cho thẻ KPI đầu tiên');
  assert.ok(viewSrc.includes('class="seg-bar"'), 'phải có thanh tiến độ segmented bar');
  assert.ok(viewSrc.includes('reject(r)') && viewSrc.includes('approve(r)'), 'phải có cả nút duyệt và từ chối ở thẻ việc cần duyệt');
});

test('Bỏ màn Phép còn lại, đổi tiêu đề thành Chấm công, xoá thanh legend và làm gọn tag ô ngày trên Bảng công', () => {
  const sidebar = fs.readFileSync(path.join(__dirname, '../../web/src/components/shell/AdminSidebar.vue'), 'utf8');
  assert.ok(sidebar.includes("'Chấm công'"));
  assert.ok(!sidebar.includes("'Chấm công & phép'"));

  const shell = fs.readFileSync(path.join(__dirname, '../../web/src/views/admin/attendance/AttendanceShell.vue'), 'utf8');
  assert.ok(shell.includes('<h1>Chấm công</h1>'));
  assert.ok(!shell.includes('Chấm công &amp; phép') && !shell.includes('Chấm công & phép'));
  assert.ok(!shell.includes('phep-con-lai'));

  const tsView = fs.readFileSync(path.join(__dirname, '../../web/src/views/admin/attendance/TimesheetView.vue'), 'utf8');
  assert.ok(!tsView.includes('<div class="legend">'));
  assert.ok(!tsView.includes('LEGEND'));

  const out = buildTimesheet({
    team: {
      month: '2026-10',
      rows: [{
        staff: { username: 'linh', name: 'Linh', type: 'nv', shiftCode: 'n1' },
        days: {
          '2026-10-01': { kind: 'work' },
          '2026-10-02': { kind: 'leave' },
          '2026-10-03': { kind: 'unpaid' },
          '2026-10-04': { kind: 'approved' },
          '2026-10-05': { kind: 'willmakeup' },
          '2026-10-06': { kind: 'makeup' },
          '2026-10-07': { kind: 'isat' }
        },
        attendanceSessions: []
      }]
    },
    shifts: { shifts: [{ code: 'n1', name: 'Ca 1', in: '08:00', out: '17:30' }] },
    today: '2026-10-15',
    holidays: []
  });

  const cells = out.rows[0].cells;
  assert.equal(cells['2026-10-01']?.declared, undefined, 'ngày làm việc bình thường không gắn tag declared');
  assert.deepEqual(cells['2026-10-02']?.declared, { text: 'Nghỉ', label: 'Nghỉ phép năm', code: 'leave' });
  assert.deepEqual(cells['2026-10-03']?.declared, { text: 'Nghỉ', label: 'Nghỉ không lương', code: 'leave' });
  assert.deepEqual(cells['2026-10-04']?.declared, { text: 'Nghỉ', label: 'Nghỉ được duyệt', code: 'leave' });
  assert.deepEqual(cells['2026-10-05']?.declared, { text: 'Làm thêm', label: 'Nghỉ, sẽ làm bù', code: 'extra' });
  assert.deepEqual(cells['2026-10-06']?.declared, { text: 'Làm thêm', label: 'Làm bù', code: 'extra' });
  assert.deepEqual(cells['2026-10-07']?.declared, { text: 'Nghỉ', label: 'Ngày iSAT', code: 'leave' });
});

test('TimesheetView tô màu các ô ngày và tag theo đề xuất: có chú thích màu color-note, không dùng chữ declared, có dot m.leave/m.extra/m.w/m.q và tinting', () => {
  const tsView = fs.readFileSync(path.join(__dirname, '../../web/src/views/admin/attendance/TimesheetView.vue'), 'utf8');
  assert.ok(tsView.includes('cellCls'), 'phải có helper cellCls');
  assert.ok(tsView.includes('class="color-note"'), 'phải có chú thích màu color-note ở thanh trên');
  assert.ok(!tsView.includes('class="declared"'), 'không còn dùng chữ thẻ tag declared trong ô ngày');
  assert.ok(tsView.includes('d-leave') && tsView.includes('m.leave'), 'phải có màu dot cho nghỉ phép');
  assert.ok(tsView.includes('d-extra') && tsView.includes('m.extra'), 'phải có màu dot cho làm thêm');
  assert.ok(tsView.includes('c-leave'), 'phải có CSS c-leave');
  assert.ok(tsView.includes('c-extra'), 'phải có CSS c-extra');
  assert.ok(tsView.includes('c-pending'), 'phải có CSS c-pending');
  assert.ok(tsView.includes('c-rejected'), 'phải có CSS c-rejected');
  assert.ok(tsView.includes('c-ok'), 'phải có CSS c-ok');

  const out = buildTimesheet({
    team: {
      month: '2026-10',
      rows: [{
        staff: { username: 'linh', name: 'Linh', type: 'nv', shiftCode: 'n1' },
        days: {
          '2026-10-02': { kind: 'leave' },
          '2026-10-03': { kind: 'unpaid' },
          '2026-10-05': { kind: 'willmakeup' }
        },
        attendanceSessions: []
      }]
    },
    shifts: { shifts: [{ code: 'n1', name: 'Ca 1', in: '08:00', out: '17:30' }] },
    today: '2026-10-15',
    holidays: []
  });
  assert.equal(out.rows[0].cells['2026-10-02']?.declared?.code, 'leave');
  assert.equal(out.rows[0].cells['2026-10-03']?.declared?.code, 'leave');
  assert.equal(out.rows[0].cells['2026-10-05']?.declared?.code, 'extra');
});

test('Tinh gọn Chấm công: không còn thanh tab con, mở Hôm nay dạng modal và Duyệt OT qua BellPopover', () => {
  const shell = fs.readFileSync(path.join(__dirname, '../../web/src/views/admin/attendance/AttendanceShell.vue'), 'utf8');
  assert.ok(!shell.includes('<div class="tabs">'), 'AttendanceShell không còn thanh tab con');
  assert.ok(!shell.includes('const TABS'), 'AttendanceShell không còn khai báo mảng TABS');
  assert.ok(shell.includes('TodayDialog'), 'AttendanceShell có nạp TodayDialog');
  assert.ok(shell.includes('OvertimeDialog'), 'AttendanceShell có nạp OvertimeDialog');
  assert.ok(shell.includes("hop === 'hom-nay'"), 'AttendanceShell bắt hop=hom-nay');
  assert.ok(shell.includes("hop === 'duyet-ot'"), 'AttendanceShell bắt hop=duyet-ot');
  assert.ok(shell.includes('<Icon name="cal" />Hôm nay'), 'AttendanceShell dùng icon cal cho nút Hôm nay');
  assert.ok(!shell.includes('btn-sub'), 'AttendanceShell không dùng class btn-sub');

  const tsView = fs.readFileSync(path.join(__dirname, '../../web/src/views/admin/attendance/TimesheetView.vue'), 'utf8');
  assert.ok(tsView.includes('TodayDialog'), 'TimesheetView có nạp TodayDialog');
  assert.ok(tsView.includes('todayOpen'), 'TimesheetView có cờ mở popup Hôm nay');
  assert.ok(tsView.includes('<Icon name="cal" />Hôm nay'), 'TimesheetView dùng icon cal cho nút Hôm nay');
  assert.ok(!tsView.includes('btn-sub'), 'TimesheetView không dùng class btn-sub');

  const bell = fs.readFileSync(path.join(__dirname, '../../web/src/components/shell/BellPopover.vue'), 'utf8');
  assert.ok(bell.includes("query: { hop: 'duyet-ot' }"), 'BellPopover có link tới duyet-ot');

  const todayDialogPath = path.join(__dirname, '../../web/src/views/admin/attendance/TodayDialog.vue');
  const otDialogPath = path.join(__dirname, '../../web/src/views/admin/attendance/OvertimeDialog.vue');
  assert.ok(fs.existsSync(todayDialogPath), 'TodayDialog.vue tồn tại');
  assert.ok(fs.existsSync(otDialogPath), 'OvertimeDialog.vue tồn tại');

  const icons = fs.readFileSync(path.join(__dirname, '../../web/src/components/ui/icons.ts'), 'utf8');
  assert.ok(icons.includes('calendar:'), 'icons.ts có alias calendar');
});

test('DayDetailDialog & buildDayDetail: trích xuất approval và hỗ trợ duyệt / từ chối trực tiếp', () => {
  const detailWithApproval = buildDayDetail({
    sheet: {
      owner: { name: 'Lê Thu Hà', type: 'nv', shiftCode: 'n1' },
      rev: 4,
      days: {
        '2026-10-05': { note: 'Bận việc gia đình' }
      },
      approvals: {
        '2026-10-05': {
          item: 'leave',
          status: 'pending',
          rev: 4,
          fingerprint: 'fp-123',
          note: 'Con ốm cần nghỉ',
          submittedAt: '2026-10-04T10:00:00Z'
        }
      },
      attendanceSessions: [
        {
          id: 101,
          date: '2026-10-05',
          version: 2,
          status: 'pending',
          entry: { kind: 'ot', date: '2026-10-05' },
          punches: [{ type: 'in', at: '2026-10-05T08:00:00Z' }]
        }
      ]
    },
    shifts: { shifts: [{ code: 'n1', name: 'Ca 1', in: '08:00', out: '17:30' }] }
  }, 'ha.le', '2026-10-05');

  assert.ok(detailWithApproval.approval, 'phải có đối tượng approval');
  assert.equal(detailWithApproval.approval.title, 'Nghỉ phép năm');
  assert.equal(detailWithApproval.approval.status, 'pending');
  assert.equal(detailWithApproval.approval.note, 'Con ốm cần nghỉ');
  assert.equal(detailWithApproval.punches[0].canDecideOt, true);
  assert.equal(detailWithApproval.punches[0].sessionId, 101);

  const dialogSrc = fs.readFileSync(path.join(__dirname, '../../web/src/views/admin/attendance/DayDetailDialog.vue'), 'utf8');
  assert.ok(dialogSrc.includes('approval-card'), 'phải có class approval-card');
  assert.ok(dialogSrc.includes('onApproveRequest'), 'phải có hàm onApproveRequest');
  assert.ok(dialogSrc.includes('onRejectRequest'), 'phải có hàm onRejectRequest');
  assert.ok(dialogSrc.includes('approveDayRequest'), 'phải dùng approveDayRequest');
  assert.ok(dialogSrc.includes('rejectDayRequest'), 'phải dùng rejectDayRequest');
  assert.ok(dialogSrc.includes('onApproveOt'), 'phải có hàm duyệt OT lẻ trong hộp ngày');
});




