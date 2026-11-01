'use strict';
// Cốt truyện cả năm: nhân vật P01–P18 (xem story.cjs). Mỗi trường hợp ghi đầu vào và kết quả mong đợi.
const cal = require('./calendar');
const { slip, row, lv, http, label, labelAt, slipAt, rowAt, observe, settle } = require('./story-steps');

function protagonistsP01toP18(S?) {
  const B = S.variant === 'B';
  /* P01 nv2_lan */
  S.leave('nv2_lan', ['2026-02-02', '2026-02-03', '2026-02-04'], {
    filed: '2026-01-26T18:00',
    decideAt: '2026-01-27T09:00',
    caseId: 'P01-01'
  });
  for (const [k, d] of [
    ['LV-03', '2026-01-31'],
    ['LV-04', '2026-02-04'],
    ['LV-05', '2026-03-15'],
    ['LV-06', '2026-07-20'],
    ['LV-07', '2026-12-31'],
    ['LV-08', '2027-01-15'],
    ['LV-09', '2027-01-31'],
    ['LV-10', '2027-02-01'],
    ['LV-10b', '2027-02-22']
  ])
    S.probeLeave('nv2_lan', d, k);
  S.check('P01-01', {
    u: 'nv2_lan',
    title: 'Nghỉ phép 02–04/02/2026',
    checks: [
      row('nv2_lan', '2026-02-02', { kind: 'leave', total: 250000 }),
      lv('LV-04', { total: 11, used: 3, balance: 8 })
    ],
    tags: B ? [] : ['VAR']
  });
  S.check('P01-02', {
    u: 'nv2_lan',
    title: 'Tự chấm công mỗi ngày từ 01/10',
    checks: [
      label('nv2_lan', '2026-10-05', 'L2'),
      row('nv2_lan', '2026-10-05', { kind: 'work', total: 250000, hours: 8 })
    ]
  });
  S.check('P01-03', {
    u: 'nv2_lan',
    title: 'Phiếu 10/2026 mẫu',
    checks: [
      slip('nv2_lan', '2026-10', {
        workDays: 27,
        tienNgayCong: 6750000,
        gross: 9450000,
        insurance: 682500,
        tax: 0,
        net: 8767500
      })
    ]
  });
  S.at('2026-11-16T18:00', 'advance', { action: 'request', u: 'nv2_lan', month: '2026-11' }, { caseId: 'P01-04' });
  S.at('2026-11-17T09:00', 'advance', { action: 'approve', u: 'nv2_lan', month: '2026-11' }, { caseId: 'P01-04' });
  S.at(
    '2026-11-28T10:00',
    'kpi',
    { u: 'nv2_lan', month: '2026-11', scores: { wework: 100, user: 100, peer: 100, manager: 100, self: 100 } },
    { caseId: 'P01-04' }
  );
  S.check('P01-04', {
    u: 'nv2_lan',
    title: 'Tháng 11: tạm ứng và KPI',
    tags: ['P7', 'CHECK'],
    checks: [slip('nv2_lan', '2026-11', { tienNgayCong: 6250000, insurance: 682500, advance: 2400000 })]
  });
  S.check('P01-05', {
    u: 'nv2_lan',
    title: 'Phiếu 12/2026',
    checks: [slip('nv2_lan', '2026-12', { gross: 9450000, net: 8767500 })]
  });
  S.check('P01-06', {
    u: 'nv2_lan',
    title: 'Tết Dương lịch 2027 không đi làm',
    checks: [
      row('nv2_lan', '2027-01-01', { kind: 'holiday', total: 250000 }),
      slip('nv2_lan', '2027-01', { gross: 9000000, net: 8317500 })
    ]
  });
  S.leave('nv2_lan', ['2027-02-22'], { filed: '2027-02-15T18:00', decideAt: '2027-02-16T09:00', caseId: 'P01-07' });
  S.check('P01-07', {
    u: 'nv2_lan',
    title: 'Tháng 2/2027: Tết, phép, quyết toán phép 21 ngày',
    checks: [
      lv('LV-10b', { total: 26, used: 4, expired: 21, balance: 1 }),
      slip('nv2_lan', '2027-02', {
        quyetToanNgay: 21,
        quyetToanPhep: 5250000,
        gross: 13050000,
        insurance: 682500,
        tax: 0,
        net: 12367500
      })
    ]
  });

  /* P02 ctv1_binh */
  S.leave('ctv1_binh', ['2026-12-02', '2026-12-03'], { filed: '2026-11-25T18:00', caseId: 'P02-01' });
  S.leave('ctv1_binh', ['2027-01-06', '2027-01-07'], { filed: '2026-12-28T18:00', caseId: 'P02-03' });
  for (const [k, d] of [
    ['LV-11', '2026-12-31'],
    ['LV-12', '2027-01-06'],
    ['LV-13', '2027-01-30'],
    ['LV-14', '2027-02-01']
  ])
    S.probeLeave('ctv1_binh', d, k);
  S.check('P02-01', {
    u: 'ctv1_binh',
    title: 'Phép 02–03/12',
    checks: [lv('LV-11', { total: 23, used: 2, balance: 21 })]
  });
  S.check('P02-02', {
    u: 'ctv1_binh',
    title: 'Phiếu 12/2026 CTV',
    checks: [slip('ctv1_binh', '2026-12', { gross: 6230769, insurance: 630000, net: 5600769 })]
  });
  S.check('P02-03', {
    u: 'ctv1_binh',
    title: 'Phép tháng 1 dùng phần cũ trước',
    checks: [lv('LV-12', { balance: 21, expiring: 20 }), lv('LV-13', { balance: 20, expiring: 19 })]
  });
  S.check('P02-04', {
    u: 'ctv1_binh',
    title: 'Hết hạn 01/02/2027',
    checks: [lv('LV-14', { total: 24, used: 4, expired: 19, balance: 1 })]
  });
  S.check('P02-05', {
    u: 'ctv1_binh',
    title: 'Phiếu 2/2027 có quyết toán 19 ngày',
    checks: [slip('ctv1_binh', '2027-02', { quyetToanNgay: 19, quyetToanPhep: 4384615, gross: 9923077, net: 9293077 })]
  });

  /* P03 ctv2_chi: phép chờ duyệt lúc hết hạn, bị từ chối sau lần tính 1 */
  S.req('ctv2_chi', { '2027-01-29': { kind: 'leave' } }, { filed: '2027-01-27T18:00', caseId: 'P03-02' });
  S.probeLeave('ctv2_chi', '2026-12-31', 'LV-15');
  S.probeLeave('ctv2_chi', '2027-01-31', 'LV-16');
  S.probeSlip('ctv2_chi', '2027-02', 'P03-run1', '2027-03-01T08:15');
  S.at(
    '2027-03-01T08:30',
    'decide',
    { u: 'ctv2_chi', dates: ['2027-01-29'], action: 'reject', note: 'Không bố trí được người thay' },
    { caseId: 'P03-03', ref: 'P03-reject' }
  );
  S.probeLeave('ctv2_chi', '2027-03-01', 'LV-17', '08:35');
  S.check('P03-01', {
    u: 'ctv2_chi',
    title: 'Không nghỉ cả năm 2026',
    checks: [lv('LV-15', { total: 23, balance: 23 })]
  });
  S.check('P03-02', {
    u: 'ctv2_chi',
    title: 'Phép 29/01 chờ duyệt giữ chỗ',
    checks: [lv('LV-16', { balance: 23, expiring: 22 }), row('ctv2_chi', '2027-01-29', { total: 0 })]
  });
  S.check('P03-03', {
    u: 'ctv2_chi',
    title: 'Từ chối sau lần tính 1: quyết toán 22 → 23 (A4)',
    tags: ['CHECK'],
    checks: [
      http('P03-reject', { status: 200 }),
      slipAt('P03-run1', { quyetToanNgay: 22, quyetToanPhep: 5076923 }),
      slip('ctv2_chi', '2027-02', { quyetToanNgay: 23, quyetToanPhep: 5307692, gross: 10846154, net: 10216154 })
    ]
  });

  /* P04 nv1_dung */
  S.probeLeave('nv1_dung', '2026-09-01', 'LV-18a');
  S.probeLeave('nv1_dung', '2026-09-19', 'LV-18');
  S.probeLeave('nv1_dung', '2026-12-31', 'LV-19');
  S.leave('nv1_dung', ['2027-02-03'], { filed: '2027-02-01T18:00', decideAt: '2027-02-02T09:00', caseId: 'P04-06' });
  S.probeLeave('nv1_dung', '2027-02-01', 'LV-20a');
  S.probeLeave('nv1_dung', '2027-02-03', 'LV-20');
  S.check('P04-01', {
    u: 'nv1_dung',
    title: 'Tạo tài khoản giữa năm',
    checks: [http('create-nv1_dung', { status: 200 })]
  });
  S.check('P04-02', {
    u: 'nv1_dung',
    title: 'Sinh nhật sau ngày vào',
    checks: [lv('LV-18', { total: 1, balance: 1 })]
  });
  S.check('P04-03', { u: 'nv1_dung', title: 'Thử việc → chính thức', checks: [http('P04-03', { status: 200 })] });
  S.check('P04-04', {
    u: 'nv1_dung',
    title: 'Phiếu 10/2026 hợp đồng ngắn',
    tags: ['CHECK'],
    checks: [slip('nv1_dung', '2026-10', { gross: 8723077, insurance: 0, tax: 872308, net: 7850769 })]
  });
  S.check('P04-05', {
    u: 'nv1_dung',
    title: 'Phiếu 11/2026 theo thâm niên',
    tags: ['CHECK'],
    checks: [slip('nv1_dung', '2026-11', { gross: 8076923, insurance: 630000, tax: 0 })]
  });
  S.check('P04-06', {
    u: 'nv1_dung',
    title: 'Phép 03/02/2027 và quyết toán 5 ngày',
    checks: [
      lv('LV-19', { total: 5, balance: 5 }),
      lv('LV-20a', { total: 6, expired: 5, balance: 1 }),
      lv('LV-20', { balance: 0 }),
      settle('nv1_dung', 5, 1153846)
    ]
  });

  /* P05 nv1_em: nghỉ trước khi có phép */
  S.leave('nv1_em', ['2026-01-20', '2026-01-21'], { filed: '2026-01-16T18:00', ref: 'P05-01', caseId: 'P05-01' });
  S.probeLeave('nv1_em', '2026-01-21', 'LV-21');
  S.probeLeave('nv1_em', '2026-03-15', 'LV-22');
  S.check('P05-01', {
    u: 'nv1_em',
    title: 'Phép khi chưa có phép: số dư âm',
    checks: [http('P05-01', { status: 200 }), lv('LV-21', { total: 0, used: 2, balance: -2 })]
  });
  S.check('P05-02', { u: 'nv1_em', title: 'Hồi về 0', checks: [lv('LV-22', { total: 2, balance: 0 })] });
  S.check('P05-03', { u: 'nv1_em', title: 'Quyết toán 10 ngày', checks: [settle('nv1_em', 10, 2307692)] });

  /* P06 nv1_phuong: điều chỉnh âm */
  S.probeLeave('nv1_phuong', '2026-02-15', 'LV-23');
  S.probeLeave('nv1_phuong', '2026-12-31', 'P06-dec');
  S.probeLeave('nv1_phuong', '2027-02-01', 'LV-36');
  S.check('P06-01', {
    u: 'nv1_phuong',
    title: 'Điều chỉnh −1,5',
    checks: [lv('LV-23', { total: -0.5, balance: -0.5 })]
  });
  S.check('P06-02', {
    u: 'nv1_phuong',
    title: 'Hết hạn bỏ qua điều chỉnh',
    tags: ['DEFECT?'],
    checks: [
      lv('P06-dec', { balance: 10.5 }),
      lv('LV-36', { expired: 12, balance: 0.5 }),
      settle('nv1_phuong', 12, 2769231)
    ]
  });

  /* P07 ctv3_giang (A1) */
  S.probeLeave('ctv3_giang', '2026-12-31', 'LV-24');
  S.probeLeave('ctv3_giang', '2027-02-01', 'LV-25');
  S.check('P07-01', { u: 'ctv3_giang', title: 'Số dư cuối 2026', checks: [lv('LV-24', { total: 35, balance: 35 })] });
  S.check('P07-02', {
    u: 'ctv3_giang',
    title: 'Phép tích từ 2024 hết hạn (A1)',
    checks: [
      lv('LV-25', { total: 36, expired: 35, balance: 1 }),
      slip('ctv3_giang', '2027-02', { quyetToanNgay: 35, quyetToanPhep: 8076923, gross: 13615385, net: 12985385 })
    ]
  });

  /* P08 nv4_hai */
  S.probeLeave('nv4_hai', '2026-06-09', 'P08-0609');
  S.probeLeave('nv4_hai', '2026-06-10', 'LV-26');
  S.probeLeave('nv4_hai', '2026-12-31', 'LV-39a');
  S.probeLeave('nv4_hai', '2027-01-01', 'LV-39b');
  const p08 = ['04', '05', '06', '07', '08', '09', '11', '12', '13', '14'].map(d => `2027-01-${d}`);
  S.leave('nv4_hai', p08, { filed: '2026-12-21T18:00', caseId: 'P08-03' });
  S.probeLeave('nv4_hai', '2027-01-14', 'P08-0114');
  S.probeLeave('nv4_hai', '2027-02-01', 'LV-38');
  S.check('P08-01', { u: 'nv4_hai', title: 'Tròn 5 năm', checks: [lv('LV-26', { total: 71, balance: 71 })] });
  S.check('P08-02', {
    u: 'nv4_hai',
    title: 'Sinh nhật trùng Tết Dương lịch, không reset 01/01',
    checks: [lv('LV-39a', { balance: 77 }), lv('LV-39b', { balance: 78, expiring: 77 })]
  });
  S.check('P08-03', {
    u: 'nv4_hai',
    title: '10 ngày phép tháng 1 dùng phần cũ',
    checks: [lv('P08-0114', { used: 10, balance: 69, expiring: 67 })]
  });
  S.check('P08-04', {
    u: 'nv4_hai',
    title: 'Phiếu 1/2027: phép làm mất chuyên cần',
    checks: [slip('nv4_hai', '2027-01', { gross: 8149038, attendOk: false, insurance: 787500 })]
  });
  S.check('P08-05', {
    u: 'nv4_hai',
    title: 'Quyết toán 67 ngày, thuế luỹ tiến',
    tags: ['CHECK'],
    checks: [
      lv('LV-38', { total: 79, used: 10, expired: 67, balance: 2 }),
      slip('nv4_hai', '2027-02', {
        quyetToanNgay: 67,
        quyetToanPhep: 19326923,
        gross: 28442308,
        insurance: 787500,
        tax: 715481,
        net: 26939327
      })
    ]
  });

  /* P09 nv1_khanh: kẹp cuối tháng */
  for (const [k, d] of [
    ['P09-0227', '2026-02-27'],
    ['P09-0228', '2026-02-28'],
    ['P09-0330', '2026-03-30'],
    ['LV-28', '2026-03-31'],
    ['P09-0201', '2027-02-01']
  ])
    S.probeLeave('nv1_khanh', d, k);
  S.check('P09-01', {
    u: 'nv1_khanh',
    title: 'Vào ngày 31: tháng tròn vào 28/02',
    checks: [lv('P09-0227', { total: 0 }), lv('P09-0228', { total: 1 })]
  });
  S.check('P09-02', {
    u: 'nv1_khanh',
    title: 'Kẹp 31/03',
    checks: [lv('P09-0330', { total: 1 }), lv('LV-28', { total: 2 })]
  });
  S.check('P09-03', {
    u: 'nv1_khanh',
    title: 'Quyết toán 12 ngày',
    checks: [lv('P09-0201', { expired: 12, balance: 2 }), settle('nv1_khanh', 12, 2769231)]
  });

  /* P10 ctv1_linh */
  S.leave('ctv1_linh', ['2027-01-04'], {
    filed: '2026-12-30T18:00',
    decideAt: '2027-01-02T09:00',
    caseId: 'P10-01'
  });
  S.probeLeave('ctv1_linh', '2027-01-30', 'LV-27');
  S.probeLeave('ctv1_linh', '2027-02-01', 'P10-0201');
  S.check('P10-01', {
    u: 'ctv1_linh',
    title: 'Phép 04/01/2027 rút phần cũ',
    checks: [
      lv('LV-27', { total: 24, used: 1, balance: 23, expiring: 22 }),
      lv('P10-0201', { expired: 22, balance: 1 }),
      settle('ctv1_linh', 22, 5076923)
    ]
  });

  /* P11 nv2_minh: ca đêm G1 */
  S.check('P11-01', {
    u: 'nv2_minh',
    title: 'Tháng 10: % đêm theo hồ sơ 60',
    tags: ['CHECK'],
    checks: [
      row('nv2_minh', '2026-10-05', { total: 440625 }),
      slip('nv2_minh', '2026-10', { gross: 14596875, net: 13914375 })
    ]
  });
  S.check('P11-02', {
    u: 'nv2_minh',
    title: 'Tháng 11: % đêm theo bậc (40)',
    checks: [
      row('nv2_minh', '2026-11-02', { total: 390625 }),
      slip('nv2_minh', '2026-11', { gross: 12265625, net: 11583125 })
    ]
  });
  S.check('P11-03', {
    u: 'nv2_minh',
    title: 'Ca 31/12 qua nửa đêm vào lễ 01/01',
    tags: ['CHECK', 'P1'],
    checks: [observe({ row: ['nv2_minh', '2026-12-31'] })]
  });
  S.req(
    'nv2_minh',
    { '2027-01-01': { kind: 'work', in: '21:00', out: '06:00' } },
    {
      filed: '2026-12-28T18:00',
      decide: 'approve',
      decideAt: '2026-12-29T09:00',
      caseId: 'P11-04',
      ref: 'P11-04-req'
    }
  );
  S.work('nv2_minh', '2027-01-01', '20:55', '06:02', { caseId: 'P11-04' });
  S.check('P11-04', {
    u: 'nv2_minh',
    title: 'OT đêm ngày lễ 01/01',
    tags: ['P1', 'CHECK'],
    checks: [http('P11-04-req', { status: 200 }), row('nv2_minh', '2027-01-01', { total: 865625 })]
  });
  S.work('nv2_minh', '2027-02-05', '20:50', '06:03', { caseId: 'P11-05', refIn: 'P11-05' });
  S.check('P11-05', {
    u: 'nv2_minh',
    title: 'Check-in ngày lễ không có OT',
    tags: ['P4'],
    checks: [http('P11-05', { status: 409 }, { status: 200 })]
  });
  S.check('P11-06', {
    u: 'nv2_minh',
    title: 'Ca 04/02 qua nửa đêm vào lễ 05/02',
    tags: ['CHECK'],
    checks: [observe({ row: ['nv2_minh', '2027-02-04'] })]
  });

  /* P12 nv3_ngoc: G2 */
  S.check('P12-01', {
    u: 'nv3_ngoc',
    title: 'Tháng 10 % đêm 40',
    tags: ['CHECK'],
    checks: [observe({ row: ['nv3_ngoc', '2026-10-05'] })]
  });
  S.check('P12-02', {
    u: 'nv3_ngoc',
    title: 'Tháng 11: % đêm bậc 60 (G02)',
    checks: [row('nv3_ngoc', '2026-11-02', { total: 474519.23 })]
  });
  S.work('nv3_ngoc', '2026-11-17', '21:55', '07:31', {
    explain: 'Bàn giao ca',
    tryWithout: true,
    refOut: 'P12-03',
    caseId: 'P12-03'
  });
  S.at('2026-11-18T10:00', 'expl.decide', { u: 'nv3_ngoc', date: '2026-11-17', approve: true }, { caseId: 'P12-03' });
  S.check('P12-03', {
    u: 'nv3_ngoc',
    title: 'Check-out muộn 31 phút, giải trình được duyệt',
    checks: [
      http('P12-03#1', { status: 409, code: 'CHECKOUT_NEEDS_EXPLANATION' }),
      label('nv3_ngoc', '2026-11-17', 'L4')
    ]
  });
  S.work('nv3_ngoc', '2026-11-19', '22:20', '07:03', { caseId: 'P12-04' });
  S.check('P12-04', {
    u: 'nv3_ngoc',
    title: 'Vào trễ 20 phút',
    tags: ['P6'],
    checks: [row('nv3_ngoc', '2026-11-19', { cut: 16826.92 }), label('nv3_ngoc', '2026-11-19', 'L3', 'L2')]
  });

  /* P13 nv2_oanh: F1 */
  S.check('P13-01', {
    u: 'nv2_oanh',
    title: 'Ngày thường F1',
    checks: [row('nv2_oanh', '2026-11-02', { total: 300000 })]
  });
  S.req(
    'nv2_oanh',
    { '2026-11-10': S.extraDay('nv2_oanh', '2026-11-10', 'ot', { after: '17:00' }) },
    { decide: 'approve', caseId: 'P13-02' }
  );
  S.work('nv2_oanh', '2026-11-10', '05:55', '17:02', { caseId: 'P13-02' });
  S.req(
    'nv2_oanh',
    { '2026-11-11': S.extraDay('nv2_oanh', '2026-11-11', 'makeup', { after: '17:00' }) },
    { decide: 'approve', caseId: 'P13-03' }
  );
  S.work('nv2_oanh', '2026-11-11', '05:55', '17:02', { caseId: 'P13-03' });
  S.check('P13-02', {
    u: 'nv2_oanh',
    title: 'OT giữ phụ cấp linh hoạt',
    checks: [row('nv2_oanh', '2026-11-10', { total: 425000, otPay: 125000 })]
  });
  S.check('P13-03', {
    u: 'nv2_oanh',
    title: 'Làm bù mất phụ cấp linh hoạt',
    tags: ['P3'],
    checks: [row('nv2_oanh', '2026-11-11', { total: 312500 })]
  });
  S.check('P13-04', {
    u: 'nv2_oanh',
    title: 'Phiếu 11/2026',
    checks: [slip('nv2_oanh', '2026-11', { gross: 10137500, net: 9455000 })]
  });
  // G13 / P13-05: kỳ 12/2026 đã tính (chưa duyệt), Admin ghim ô số lượng "ngày công" trên phiếu P13 (PUT /api/slip-override): phiếu tính lại
  // từ bản chụp theo ghim, phiếu người khác giữ nguyên. Ghim lại lúc kỳ đã chi trả (10/01 15:00, trước lần mở lại G06 ngày 11/01):
  // lưu được, kèm cảnh báo PERIOD_LOCKED; phiếu cuối mang số ghim sau.
  S.probeSlip('nv2_oanh', '2026-12', 'G13-before', '2027-01-05T09:55');
  S.probeSlip('bg_nv1_a', '2026-12', 'G13-other-before', '2027-01-05T09:56');
  S.at(
    '2027-01-05T10:00',
    'slip.pin',
    {
      u: 'nv2_oanh',
      month: '2026-12',
      values: { workDays: 26 },
      reason: 'Ghim số ngày công theo bảng chấm công đã đối chiếu với bộ phận'
    },
    { ref: 'G13', caseId: 'G13' }
  );
  S.probeSlip('nv2_oanh', '2026-12', 'G13-after', '2027-01-05T10:05');
  S.probeSlip('bg_nv1_a', '2026-12', 'G13-other-after', '2027-01-05T10:06');
  S.at(
    '2027-01-10T15:00',
    'slip.pin',
    {
      u: 'nv2_oanh',
      month: '2026-12',
      values: { workDays: 25 },
      reason: 'Ghim lại số ngày công sau khi kỳ đã chi trả'
    },
    { ref: 'G13-late', caseId: 'G13' }
  );
  S.check('G13', {
    u: 'nv2_oanh',
    title: 'Admin ghim ô số lượng trên phiếu 12/2026',
    tags: ['CHECK'],
    checks: [
      http('G13', { status: 200 }),
      { type: 'probeCompare', before: 'G13-before', after: 'G13-after', field: 'gross', op: 'ne' },
      { type: 'probeCompare', before: 'G13-other-before', after: 'G13-other-after', field: 'gross', op: 'eq' },
      http('G13-late', { status: 200, warn: 'PERIOD_LOCKED' })
    ]
  });
  S.check('P13-05', {
    u: 'nv2_oanh',
    title: 'Phiếu 12/2026 theo ô ngày công ghim sau cùng',
    tags: ['CHECK'],
    checks: [slip('nv2_oanh', '2026-12', { workDays: 25 }), observe({ slip: ['nv2_oanh', '2026-12'] })]
  });

  /* P14 ctv2_phu: F2 */
  S.work('ctv2_phu', '2026-11-03', '12:55', '22:30', { caseId: 'P14-02' });
  S.work('ctv2_phu', '2026-11-04', '12:55', '22:31', { explain: 'Khách đến muộn', caseId: 'P14-03' });
  S.work('ctv2_phu', '2026-11-27', '12:55', '22:45', { explain: 'Kiểm kê cuối tháng', caseId: 'P14-04' });
  S.at('2026-12-07T10:00', 'expl.decide', { u: 'ctv2_phu', date: '2026-11-27', approve: true }, { caseId: 'P14-04' });
  S.check('P14-01', {
    u: 'ctv2_phu',
    title: 'Ngày thường F2 CTV',
    checks: [row('ctv2_phu', '2026-11-02', { total: 253846.15 })]
  });
  S.check('P14-02', { u: 'ctv2_phu', title: 'Ra đúng 30 phút', checks: [label('ctv2_phu', '2026-11-03', 'L2')] });
  S.check('P14-03', {
    u: 'ctv2_phu',
    title: 'Ra 31 phút có giải trình',
    checks: [label('ctv2_phu', '2026-11-04', 'L3'), row('ctv2_phu', '2026-11-04', { total: 0 })]
  });
  S.check('P14-04', {
    u: 'ctv2_phu',
    title: 'Duyệt giải trình sau khi kỳ 11 đã duyệt',
    tags: ['DEFECT?', 'CHECK'],
    checks: [row('ctv2_phu', '2026-11-27', { total: 0 }), label('ctv2_phu', '2026-11-27', 'L4')]
  });

  /* P15 nv2_quang: cắt trễ / sớm */
  const p15 = [
    ['P15-01', '2026-11-02', '08:14', '17:02', 250000],
    ['P15-02', '2026-11-03', '08:15', '17:02', 234375],
    ['P15-03', '2026-11-04', '08:44', '17:02', 234375],
    ['P15-04', '2026-11-05', '08:45', '17:02', 218750],
    ['P15-05', '2026-11-06', '09:15', '17:02', 203125],
    ['P15-06', '2026-11-07', '07:55', '16:50', 250000],
    ['P15-07', '2026-11-09', '07:55', '16:40', 234375],
    ['P15-08', '2026-11-10', '08:20', '16:40', 218750]
  ];
  for (const [id, d, a, b, money] of p15) {
    S.work('nv2_quang', d, a, b, { caseId: id });
    const p6 = id !== 'P15-01';
    S.check(id, {
      u: 'nv2_quang',
      title: `Vào ${a}, ra ${b}`,
      tags: [...(p6 ? ['P6'] : []), ...(['P15-05', 'P15-06'].includes(id as string) ? ['CHECK'] : [])],
      checks: [row('nv2_quang', d, { total: money }), ...(p6 ? [label('nv2_quang', d, 'L3', 'L2')] : [])]
    });
  }
  S.sessions(
    'nv2_quang',
    '2026-11-11',
    [
      ['07:55', '10:00'],
      ['10:40', '17:02']
    ],
    { caseId: 'P15-09' }
  );
  S.check('P15-09', {
    u: 'nv2_quang',
    title: 'Ra ngoài 40 phút',
    checks: [row('nv2_quang', '2026-11-11', { total: 234375 })]
  });
  S.at(
    '2026-11-12T10:00',
    'expl.decide',
    { u: 'nv2_quang', date: '2026-11-03', approve: true },
    { caseId: 'P15-10', ref: 'P15-10' }
  );
  S.at(
    '2026-11-13T10:00',
    'expl.decide',
    { u: 'nv2_quang', date: '2026-11-05', approve: false, note: 'Không có lý do' },
    {
      caseId: 'P15-11',
      ref: 'P15-11'
    }
  );
  S.check('P15-10', {
    u: 'nv2_quang',
    title: 'Duyệt giải trình trễ (P6)',
    tags: ['P6', 'CHECK'],
    checks: [http('P15-10', { status: 200 }, { status: 404 })]
  });
  S.check('P15-11', {
    u: 'nv2_quang',
    title: 'Từ chối giải trình trễ (P6)',
    tags: ['P6', 'CHECK'],
    checks: [http('P15-11', { status: 200 }, { status: 404 })]
  });

  /* P16 nv2_rang: ân hạn Check-out */
  S.work('nv2_rang', '2026-11-03', '09:55', '19:30', { caseId: 'P16-01' });
  S.work('nv2_rang', '2026-11-04', '09:55', '19:31', {
    explain: 'Họp khách',
    tryWithout: true,
    refOut: 'P16-02',
    caseId: 'P16-02'
  });
  S.at('2026-11-05T09:00', 'expl.decide', { u: 'nv2_rang', date: '2026-11-04', approve: true }, { caseId: 'P16-02' });
  S.work('nv2_rang', '2026-11-10', '09:55', '20:15', { explain: 'Làm báo cáo', caseId: 'P16-03' });
  S.at(
    '2026-11-11T09:00',
    'expl.decide',
    { u: 'nv2_rang', date: '2026-11-10', approve: false, note: 'Không có yêu cầu làm thêm' },
    { caseId: 'P16-03' }
  );
  S.work('nv2_rang', '2026-11-27', '09:55', '19:45', { explain: 'Chốt số liệu tháng', caseId: 'P16-04' });
  S.probeSlip('nv2_rang', '2026-11', 'P16-run1', '2026-12-01T09:15');
  S.at('2026-12-03T09:30', 'expl.decide', { u: 'nv2_rang', date: '2026-11-27', approve: true }, { caseId: 'P16-04' });
  S.req(
    'nv2_rang',
    { '2026-12-08': S.extraDay('nv2_rang', '2026-12-08', 'ot', { after: '21:00' }) },
    {
      filed: '2026-12-04T18:00',
      decide: 'approve',
      decideAt: '2026-12-07T09:00',
      caseId: 'P16-05'
    }
  );
  S.work('nv2_rang', '2026-12-08', '09:55', '21:25', { caseId: 'P16-05' });
  S.req(
    'nv2_rang',
    { '2026-12-09': S.extraDay('nv2_rang', '2026-12-09', 'ot', { after: '21:00' }) },
    {
      filed: '2026-12-04T18:05',
      decide: 'approve',
      decideAt: '2026-12-07T09:05',
      caseId: 'P16-06'
    }
  );
  S.work('nv2_rang', '2026-12-09', '09:55', '21:31', {
    explain: 'Hết việc OT',
    tryWithout: true,
    refOut: 'P16-06',
    caseId: 'P16-06'
  });
  S.req(
    'nv2_rang',
    { '2026-12-10': S.extraDay('nv2_rang', '2026-12-10', 'ot', { after: '21:00' }) },
    {
      filed: '2026-12-08T18:00',
      caseId: 'P16-07'
    }
  );
  S.work('nv2_rang', '2026-12-10', '09:55', '21:00', {
    explain: 'OT chờ duyệt',
    tryWithout: true,
    refOut: 'P16-07',
    caseId: 'P16-07'
  });
  S.check('P16-01', {
    u: 'nv2_rang',
    title: 'Ra 19:30 (đúng ân hạn)',
    checks: [label('nv2_rang', '2026-11-03', 'L2')]
  });
  S.check('P16-02', {
    u: 'nv2_rang',
    title: 'Ra 19:31: cần giải trình, được duyệt',
    checks: [
      http('P16-02#1', { status: 409, code: 'CHECKOUT_NEEDS_EXPLANATION' }),
      label('nv2_rang', '2026-11-04', 'L4'),
      row('nv2_rang', '2026-11-04', { total: 250000 })
    ]
  });
  S.check('P16-03', {
    u: 'nv2_rang',
    title: 'Giải trình bị từ chối',
    tags: ['CHECK'],
    checks: [label('nv2_rang', '2026-11-10', 'L5'), row('nv2_rang', '2026-11-10', { total: 0 })]
  });
  S.check('P16-04', {
    u: 'nv2_rang',
    title: 'Giải trình duyệt sau khoá công, tính lại',
    checks: [rowAt('P16-run1', '2026-11-27', { total: 0 }), row('nv2_rang', '2026-11-27', { total: 250000 })]
  });
  S.check('P16-05', {
    u: 'nv2_rang',
    title: 'Ân hạn tính từ giờ hết OT',
    checks: [label('nv2_rang', '2026-12-08', 'L2'), row('nv2_rang', '2026-12-08', { otPay: 125000 })]
  });
  S.check('P16-06', {
    u: 'nv2_rang',
    title: 'Ra 31 phút sau OT',
    checks: [http('P16-06#1', { status: 409, code: 'CHECKOUT_NEEDS_EXPLANATION' })]
  });
  S.check('P16-07', {
    u: 'nv2_rang',
    title: 'OT còn chờ lúc Check-out',
    tags: ['CHECK'],
    checks: [observe({ http: 'P16-07#1' }), row('nv2_rang', '2026-12-10', { total: 250000 })]
  });

  /* P17 nv1_son: quên bấm */
  S.work('nv1_son', '2026-11-05', '07:55', null, { noOut: true, caseId: 'P17-01' });
  S.probeDay('nv1_son', '2026-11-05', 'P17-01', '2026-11-06T12:00');
  S.adminEntry(
    '2026-11-09T10:00',
    'nv1_son',
    { '2026-11-05': { kind: 'work', in: '08:00', out: '17:00', preset: 'Normal1' } },
    { caseId: 'P17-02' }
  );
  S.work('nv1_son', '2026-11-24', '07:58', null, { noOut: true, caseId: 'P17-03' });
  S.at(
    '2026-12-15T10:05',
    'data.session',
    {
      u: 'nv1_son',
      date: '2026-12-15',
      entry: { kind: 'pending', reason: 'forgot-in', src: 'punch', presOut: '2026-12-15T10:03:00.000Z' }
    },
    { caseId: 'P17-04', tags: ['DATA'] }
  );
  S.skip('nv1_son', '2026-12-15');
  S.sessions(
    'nv1_son',
    '2026-12-21',
    [
      ['07:50', '11:00'],
      ['12:00', '17:02']
    ],
    { caseId: 'P17-05' }
  );
  S.check('P17-01', { u: 'nv1_son', title: 'Quên Check-out 05/11', checks: [labelAt('P17-01', 'L3')] });
  S.check('P17-02', {
    u: 'nv1_son',
    title: 'Admin khai thay ngày quên',
    checks: [label('nv1_son', '2026-11-05', 'L6'), row('nv1_son', '2026-11-05', { total: 230769.23, hours: 8 })]
  });
  S.check('P17-03', {
    u: 'nv1_son',
    title: 'Quên Check-out không sửa',
    checks: [row('nv1_son', '2026-11-24', { total: 0 })]
  });
  S.check('P17-04', {
    u: 'nv1_son',
    title: 'Quên Check-in (dữ liệu)',
    aliases: ['D1'],
    tags: ['DATA'],
    checks: [label('nv1_son', '2026-12-15', 'L3'), row('nv1_son', '2026-12-15', { total: 0 })]
  });
  S.check('P17-05', {
    u: 'nv1_son',
    title: 'Ra ngoài 11:00–12:00 rồi nghỉ trưa',
    tags: ['CHECK'],
    checks: [row('nv1_son', '2026-12-21', { total: 201923.08 })]
  });

  /* P18 nv2_thao: OT */
  const ot = (d?, after?, opts: any = {}) =>
    S.req('nv2_thao', { [d]: S.extraDay('nv2_thao', d, 'ot', { after }) }, { decide: 'approve', ...opts });
  ot('2026-11-03', '19:00', { filed: '2026-10-30T18:00', decideAt: '2026-11-02T09:00', caseId: 'P18-01' });
  S.work('nv2_thao', '2026-11-03', '07:55', '19:05', { caseId: 'P18-01' });
  S.req(
    'nv2_thao',
    { '2026-11-04': S.extraDay('nv2_thao', '2026-11-04', 'ot', { before: '06:00' }) },
    { decide: 'approve', caseId: 'P18-02' }
  );
  S.work('nv2_thao', '2026-11-04', '05:58', '17:03', { caseId: 'P18-02' });
  ot('2026-11-05', '22:00', { caseId: 'P18-03', ref: 'P18-03' });
  S.work('nv2_thao', '2026-11-05', '07:55', '22:03', { caseId: 'P18-03' });
  ot('2026-11-06', '23:00', { caseId: 'P18-04', ref: 'P18-04' });
  S.work('nv2_thao', '2026-11-06', '07:55', '23:03', { caseId: 'P18-04' });
  ot('2026-11-07', '19:00', { decide: false, caseId: 'P18-05' });
  S.work('nv2_thao', '2026-11-07', '07:55', '19:02', {
    explain: 'OT chờ duyệt',
    tryWithout: true,
    refOut: 'P18-05',
    caseId: 'P18-05'
  });
  S.at('2026-11-09T09:30', 'expl.decide', { u: 'nv2_thao', date: '2026-11-07', approve: true }, { caseId: 'P18-05' });
  ot('2026-11-10', '19:00', {
    decide: 'reject',
    decideAt: '2026-11-09T09:00',
    note: 'Không cần làm thêm',
    caseId: 'P18-06'
  });
  S.work('nv2_thao', '2026-11-10', '07:55', '17:05', { caseId: 'P18-06' });
  for (const d of ['11', '12', '13', '14', '16', '17', '18', '19', '20', '21'].map(x => `2026-11-${x}`)) {
    ot(d, '19:00', { filed: '2026-11-09T18:00', decideAt: '2026-11-10T09:30', caseId: 'P18-07' });
    S.work('nv2_thao', d, '07:55', '19:03', { caseId: 'P18-07' });
  }
  ot('2026-11-23', '21:00', { filed: '2026-11-20T18:00', decide: false, caseId: 'P18-08', ref: 'P18-08' });
  S.check('P18-01', {
    u: 'nv2_thao',
    title: 'OT 17–19',
    checks: [row('nv2_thao', '2026-11-03', { otPay: 125000, total: 375000 }), label('nv2_thao', '2026-11-03', 'L2')]
  });
  S.check('P18-02', {
    u: 'nv2_thao',
    title: 'OT trước ca',
    checks: [row('nv2_thao', '2026-11-04', { otPay: 125000 })]
  });
  S.check('P18-03', {
    u: 'nv2_thao',
    title: 'OT 5 giờ không nghỉ',
    tags: ['P2'],
    checks: [http('P18-03', { status: 200 }), row('nv2_thao', '2026-11-05', { otPay: 312500 })]
  });
  S.check('P18-04', {
    u: 'nv2_thao',
    title: 'OT tới 23:00',
    checks: [row('nv2_thao', '2026-11-06', { otPay: 375000 })]
  });
  S.check('P18-05', {
    u: 'nv2_thao',
    title: 'OT chờ duyệt bị bỏ khi tính',
    tags: ['CHECK'],
    checks: [row('nv2_thao', '2026-11-07', { total: 250000 })]
  });
  S.check('P18-06', {
    u: 'nv2_thao',
    title: 'OT bị từ chối',
    checks: [row('nv2_thao', '2026-11-10', { total: 250000 })]
  });
  S.check('P18-07', { u: 'nv2_thao', title: '10 ngày OT', checks: [slip('nv2_thao', '2026-11', {})], tags: ['CHECK'] });
  S.check('P18-08', { u: 'nv2_thao', title: 'Vượt trần OT tháng 40 giờ', checks: [http('P18-08', { status: 400 })] });
  S.req(
    'nv2_thao',
    { '2026-12-02': { kind: 'willmakeup', makeupPlans: [{ date: '2026-12-07', from: '17:00', to: '19:00' }] } },
    {
      filed: '2026-11-27T18:00',
      decide: 'approve',
      caseId: 'P18-09'
    }
  );
  ot('2026-12-04', '19:00', { filed: '2026-11-30T18:00', caseId: 'P18-09' });
  S.work('nv2_thao', '2026-12-04', '07:55', '19:03', { caseId: 'P18-09' });
  for (const d of ['2026-12-07', '2026-12-08', '2026-12-09', '2026-12-10']) {
    S.req(
      'nv2_thao',
      { [d]: S.extraDay('nv2_thao', d, 'makeup', { after: '19:00' }) },
      {
        filed: '2026-12-03T18:00',
        decide: 'approve',
        decideAt: '2026-12-04T09:30',
        caseId: 'P18-09'
      }
    );
    S.work('nv2_thao', d, '07:55', '19:03', { caseId: 'P18-09' });
  }
  ot('2026-12-11', '19:00', { filed: '2026-12-08T18:00', caseId: 'P18-09' });
  S.work('nv2_thao', '2026-12-11', '07:55', '19:03', { caseId: 'P18-09' });
  S.check('P18-09', {
    u: 'nv2_thao',
    title: 'Nghỉ sẽ làm bù, OT bị giữ khi còn nợ giờ',
    tags: ['CHECK'],
    checks: [
      row('nv2_thao', '2026-12-02', { total: 0 }),
      row('nv2_thao', '2026-12-04', { otPay: 0, otHold: 2 }),
      row('nv2_thao', '2026-12-07', { makeupPay: 62500 }),
      row('nv2_thao', '2026-12-11', { otPay: 125000 })
    ]
  });
  S.req(
    'nv2_thao',
    { '2026-12-13': { kind: 'work', in: '08:00', out: '12:00' } },
    { filed: '2026-12-10T18:00', decide: 'approve', caseId: 'P18-10', ref: 'P18-10-req' }
  );
  S.work('nv2_thao', '2026-12-13', '07:58', '12:02', { caseId: 'P18-10', refIn: 'P18-10' });
  S.check('P18-10', {
    u: 'nv2_thao',
    title: 'OT Chủ nhật được duyệt',
    tags: ['P4', 'CHECK'],
    checks: [http('P18-10', { status: 200 }), observe({ row: ['nv2_thao', '2026-12-13'] })]
  });
  S.at(
    '2026-12-15T18:00',
    'ot.note',
    { u: 'nv2_thao', date: '2026-12-15', reason: 'Ghi nhận làm thêm sau ca' },
    { caseId: 'P18-11', ref: 'P18-11' }
  );
  S.check('P18-11', {
    u: 'nv2_thao',
    title: 'Admin ghi OT trên lượt đã đóng',
    tags: ['CHECK'],
    checks: [observe({ http: 'P18-11' }), row('nv2_thao', '2026-12-15', { otPay: 0 })]
  });
  S.req(
    'nv2_thao',
    { '2026-12-16': S.extraDay('nv2_thao', '2026-12-16', 'ot', { after: '06:00' }) },
    { filed: '2026-12-14T18:00', caseId: 'D9', ref: 'D9' }
  );
  S.check('D9', {
    u: 'nv2_thao',
    title: 'OT quá 12 giờ một ngày',
    tags: ['API'],
    checks: [http('D9', { status: 400 })]
  });
  // P18-12: OT 17–19 được duyệt trên 12 ngày làm tháng 1 và 9 ngày làm tháng 2/2027 (mỗi tháng một lần khai), cộng tháng 11–12 khoảng 80 giờ;
  // không có trần OT năm nên không có cảnh báo hay chặn theo năm
  const freeDays = (from?, to?, n?) => {
    const out: any[] = [];
    for (const d of cal.daysBetween(from, to))
      if (out.length < n && cal.isWorkday('nv', d) && !S.skips.has(`nv2_thao|${d}`)) out.push(d);
    return out;
  };
  for (const [from, to, n, filed, ref] of [
    ['2027-01-11', '2027-01-30', 12, '2027-01-06T18:00', 'P18-12-jan'],
    ['2027-02-15', '2027-02-27', 9, '2027-02-11T18:00', 'P18-12-feb']
  ]) {
    const days = freeDays(from, to, n);
    S.req('nv2_thao', Object.fromEntries(days.map(d => [d, S.extraDay('nv2_thao', d, 'ot', { after: '19:00' })])), {
      filed,
      decide: 'approve',
      caseId: 'P18-12',
      ref
    });
    for (const d of days) S.work('nv2_thao', d, '07:55', '19:03', { caseId: 'P18-12' });
  }
  S.check('P18-12', {
    u: 'nv2_thao',
    title: 'OT cộng dồn 11/2026–02/2027 khoảng 80 giờ, không trần năm',
    checks: [
      http('P18-12-jan', { status: 200 }),
      http('P18-12-feb', { status: 200 }),
      { type: 'otSum', u: 'nv2_thao', months: ['2026-11', '2026-12', '2027-01', '2027-02'], min: 75 }
    ]
  });
}

module.exports = { protagonistsP01toP18 };
