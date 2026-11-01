'use strict';
// Cốt truyện cả năm 01/2026 → 01/03/2027: tài khoản, ngày lễ, các nhân vật chính (P01–P44), việc toàn hệ thống (G..), kỳ lương.
// Mỗi trường hợp ghi đầu vào và kết quả mong đợi (số đọc từ danh mục kịch bản). Thẻ: P1…P8 = phụ thuộc quy tắc đang chờ,
// CHECK = cần người xem, DEFECT? = kết quả code có vẻ sai so với quy tắc, DATA = ghi thẳng kho, API = chỉ qua API.
const cal = require('./calendar');
const { T } = require('./builder');
const { http, period, observe } = require('./story-steps');
const { protagonistsP01toP18 } = require('./story-p01-p18');
const { protagonistsP19toP33 } = require('./story-p19-p33');
const { protagonistsP34toP44 } = require('./story-p34-p44');

// Lịch các bước kỳ lương theo tháng. Phương án B thêm chu trình đủ cho 01–09/2026.
function periods(S?) {
  const step = (at?, month?, name?, body: any = {}, meta: any = {}) =>
    S.at(at, 'period', { month, step: name, body }, meta);
  if (S.variant === 'B')
    for (const m of cal.monthsBetween('2026-01', '2026-09')) {
      const next = cal.nextMonth(m);
      const lockDay = cal.nthWorkday(next, 2);
      step(T(lockDay, '09:00'), m, 'lock-attendance', {}, { ref: `lock-${m}` });
      step(T(lockDay, '09:10'), m, 'calculate', {}, { ref: `calc-${m}` });
      step(T(cal.nthWorkday(next, 3), '10:00'), m, 'approve', {}, { ref: `approve-${m}` });
      let paid = `${next}-10`;
      while (!cal.isWorkday('nv', paid)) paid = cal.addDays(paid, 1);
      step(T(paid, '10:00'), m, 'mark-paid', { paidAt: paid }, { ref: `paid-${m}` });
    }
  // G10: khoá công tháng 9 lần nữa (phương án A: tháng chưa quản lý)
  step('2026-10-05T10:00', '2026-09', 'lock-attendance', {}, { ref: 'G10', caseId: 'G10' });
  // Tháng 10
  step('2026-11-02T09:00', '2026-10', 'lock-attendance', {}, { ref: 'lock-2026-10', caseId: 'G04' });
  step('2026-11-02T09:10', '2026-10', 'calculate', {}, { ref: 'calc-2026-10', caseId: 'G04' });
  step('2026-11-05T10:00', '2026-10', 'approve', {}, { ref: 'approve-2026-10', caseId: 'G04' });
  step('2026-11-10T10:00', '2026-10', 'mark-paid', { paidAt: '2026-11-10' }, { ref: 'paid-2026-10', caseId: 'G04' });
  // Tháng 11: tính lại sau khi duyệt giải trình P16-04 và phép P33-04; duyệt bằng rev cũ (G09)
  step('2026-12-01T09:00', '2026-11', 'lock-attendance', {}, { ref: 'lock-2026-11', caseId: 'G05' });
  step('2026-12-01T09:10', '2026-11', 'calculate', {}, { ref: 'calc-2026-11', caseId: 'G05' });
  step('2026-12-03T10:00', '2026-11', 'calculate', {}, { ref: 'calc2-2026-11', caseId: 'G05' });
  step('2026-12-05T10:00', '2026-11', 'approve', { revDelta: -1 }, { ref: 'G09', caseId: 'G09' });
  step('2026-12-05T10:05', '2026-11', 'approve', {}, { ref: 'approve-2026-11', caseId: 'G05' });
  step('2026-12-10T10:00', '2026-11', 'mark-paid', { paidAt: '2026-12-10' }, { ref: 'paid-2026-11', caseId: 'G05' });
  // Tháng 12: mở lại kỳ đã chi trả bị từ chối
  step('2027-01-04T09:00', '2026-12', 'lock-attendance', {}, { ref: 'lock-2026-12', caseId: 'G06' });
  step('2027-01-04T09:10', '2026-12', 'calculate', {}, { ref: 'calc-2026-12', caseId: 'G06' });
  step('2027-01-06T10:00', '2026-12', 'approve', {}, { ref: 'approve-2026-12', caseId: 'G06' });
  step('2027-01-10T10:00', '2026-12', 'mark-paid', { paidAt: '2027-01-10' }, { ref: 'paid-2026-12', caseId: 'G06' });
  step(
    '2027-01-11T10:00',
    '2026-12',
    'reopen',
    { to: 'calculated', reason: 'Kiểm tra lại phiếu tháng 12' },
    { ref: 'G06-reopen', caseId: 'G06', as: 'admin2' }
  );
  // Tháng 1/2027: thực lĩnh âm (P35-05) chặn duyệt; huỷ khoản; mở lại về đã tính; tạm ứng huỷ rồi duyệt lại (P30-04)
  step('2027-02-01T09:00', '2027-01', 'lock-attendance', {}, { ref: 'lock-2027-01', caseId: 'G07' });
  step('2027-02-01T09:10', '2027-01', 'calculate', {}, { ref: 'calc-2027-01', caseId: 'G07' });
  step('2027-02-02T09:30', '2027-01', 'calculate', {}, { ref: 'calc2-2027-01', caseId: 'P30-04' });
  step('2027-02-03T09:30', '2027-01', 'calculate', {}, { ref: 'calc3-2027-01', caseId: 'P30-04' });
  step('2027-02-05T10:00', '2027-01', 'approve', {}, { ref: 'G07-negative', caseId: 'G07' });
  step('2027-02-05T10:30', '2027-01', 'calculate', {}, { ref: 'calc4-2027-01', caseId: 'G07' });
  step('2027-02-05T10:40', '2027-01', 'approve', {}, { ref: 'approve-2027-01', caseId: 'G07' });
  step(
    '2027-02-08T10:00',
    '2027-01',
    'reopen',
    { to: 'calculated', reason: 'Mở lại để soát phiếu tháng 1' },
    { ref: 'G07-reopen', caseId: 'G07', as: 'admin2' }
  );
  step('2027-02-08T10:10', '2027-01', 'calculate', {}, { ref: 'calc5-2027-01', caseId: 'G07' });
  step('2027-02-08T10:20', '2027-01', 'approve', {}, { ref: 'approve2-2027-01', caseId: 'G07' });
  // Tháng 2/2027: tính hai lần quanh việc từ chối phép chờ của P03 (G08); dừng ở "đã tính" để chủ dự án duyệt
  step('2027-03-01T08:00', '2027-02', 'lock-attendance', {}, { ref: 'lock-2027-02', caseId: 'G08' });
  step('2027-03-01T08:10', '2027-02', 'calculate', {}, { ref: 'calc-2027-02', caseId: 'G08' });
  step('2027-03-01T09:00', '2027-02', 'calculate', {}, { ref: 'calc2-2027-02', caseId: 'G08' });
}

function globalCases(S?) {
  S.check('G01', {
    u: 'admin1',
    title: 'Admin nhập lịch lễ 2026–2027',
    inputs: 'PUT /api/holidays',
    checks: [http('G01', { status: 200 })]
  });
  S.at(
    '2026-10-20T10:00',
    'catalog.level',
    { type: 'nv', level: 3, changes: { nightPct: 60 }, effectiveMonth: '2026-11', reason: 'Bậc NV3 ca đêm 60 %' },
    { ref: 'G02', caseId: 'G02' }
  );
  S.check('G02', {
    u: 'admin1',
    title: 'Danh mục bậc NV3 % đêm 60 từ 11/2026',
    checks: [http('G02', { status: 200 })]
  });
  // G03: thêm 2027-01-02 vào lịch lễ khi B03 đã có phép ngày đó, rồi bỏ ra
  S.at('2026-12-15T10:00', 'holidays.put', { add: ['2027-01-02'] }, { ref: 'G03-add', caseId: 'G03' });
  S.probeLeave('bg_nv2_c', '2026-12-15', 'G03-during', '10:05');
  S.at('2026-12-16T10:00', 'holidays.put', {}, { ref: 'G03-remove', caseId: 'G03' });
  S.probeLeave('bg_nv2_c', '2026-12-16', 'G03-after', '10:05');
  S.check('G03', {
    u: 'bg_nv2_c',
    title: 'Thêm rồi bỏ một ngày lễ trùng ngày phép',
    tags: ['CHECK'],
    checks: [http('G03-add', { status: 200 }), http('G03-remove', { status: 200 }), observe({ leave: 'G03-during' })]
  });
  S.check('G04', {
    u: 'admin1',
    title: 'Kỳ 10/2026: khoá, tính, AI, duyệt, chi trả',
    checks: [http('lock-2026-10', { status: 200 }), period('2026-10', 'paid')]
  });
  S.check('G05', {
    u: 'admin1',
    title: 'Kỳ 11/2026 tính hai lần',
    checks: [http('lock-2026-11', { status: 200, warn: 'FORGOT_PUNCH' }), period('2026-11', 'paid')],
    tags: ['CHECK']
  });
  S.check('G06', {
    u: 'admin1',
    title: 'Kỳ 12/2026; mở lại kỳ đã chi trả bị từ chối',
    checks: [http('lock-2026-12', { status: 200 }), http('G06-reopen', { status: 409 }), period('2026-12', 'paid')]
  });
  S.check('G07', {
    u: 'admin1',
    title: 'Kỳ 1/2027: thực lĩnh âm chặn duyệt, mở lại, duyệt',
    checks: [
      http('G07-negative', { status: 409, code: 'PAYSLIP_NEGATIVE_NET' }),
      http('G07-reopen', { status: 200 }),
      period('2027-01', 'approved')
    ]
  });
  S.check('G08', {
    u: 'admin1',
    title: 'Kỳ 2/2027 tính hai lần, dừng ở đã tính',
    checks: [http('calc2-2027-02', { status: 200 }), period('2027-02', 'calculated')]
  });
  S.check('G09', {
    u: 'admin1',
    title: 'Duyệt kỳ 11 bằng số phiên bản cũ',
    checks: [http('G09', { status: 409, code: 'PERIOD_STALE' })]
  });
  S.check('G10', {
    u: 'admin1',
    title: 'Khoá công tháng 9/2026 vào 05/10',
    tags: ['VAR'],
    checks: [http('G10', { status: 409, code: 'PERIOD_STATE' })]
  });
  S.at(
    '2026-11-06T09:30',
    'advance',
    { action: 'approve', u: 'nv1_mai', month: '2026-10' },
    { ref: 'G11', caseId: 'G11' }
  );
  S.check('G11', {
    u: 'nv1_mai',
    title: 'Duyệt tạm ứng tháng đã duyệt',
    checks: [http('G11', { status: 409, code: 'PERIOD_LOCKED' })]
  });
  S.at('2026-11-02T08:30', 'punch', { u: 'admin1', type: 'in' }, { ref: 'G12-admin', caseId: 'G12' });
  S.at('2026-11-02T08:31', 'punch', { u: 'cb1', type: 'in' }, { ref: 'G12-cb', caseId: 'G12' });
  S.check('G12', {
    u: 'admin1',
    title: 'Admin và C&B không chấm công',
    checks: [http('G12-admin', { status: 403 }), http('G12-cb', { status: 403 })]
  });
}

function protagonists(S?) {
  protagonistsP01toP18(S);
  protagonistsP19toP33(S);
  protagonistsP34toP44(S);
}

// Mục của danh mục không dựng trong DB (kèm lý do) hoặc chỉ kiểm lúc đối chiếu trên bản sao
const NOT_IN_DB = [
  {
    id: 'D10',
    where: 'verify',
    reason: 'Thử UPDATE payroll_runs trên bản sao lúc đối chiếu (trigger phải chặn); không bao giờ ghi vào DB giao'
  },
  {
    id: 'D11',
    where: 'none',
    reason:
      'Biến thể tham số (C05 ot.afterMakeup, F09/F10 pay.method, G06 countsAbsent false, J07 KPI cũ, M08 taxOn false): params_mode là defaults-only nên sửa tham số không có tác dụng; đã có kiểm thử đơn vị'
  }
];

module.exports = { periods, globalCases, protagonists, NOT_IN_DB };
