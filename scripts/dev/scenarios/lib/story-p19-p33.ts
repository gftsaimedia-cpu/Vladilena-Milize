'use strict';
// Cốt truyện cả năm: nhân vật P19–P33 (xem story.cjs). Mỗi trường hợp ghi đầu vào và kết quả mong đợi.
const { slip, row, lv, http, label, rowAt, observe, settle } = require('./story-steps');

function protagonistsP19toP33(S?) {
  const B = S.variant === 'B';
  /* P19 nv2_uyen: F2, làm bù */
  const p19 = (d?, kind?, opts?) => S.extraDay('nv2_uyen', d, kind, opts);
  S.req(
    'nv2_uyen',
    { '2026-11-02': { kind: 'willmakeup', makeupPlans: [{ date: '2026-11-04', from: '11:00', to: '13:00' }] } },
    {
      filed: '2026-10-29T18:00',
      decide: 'approve',
      decideAt: '2026-10-30T09:00',
      caseId: 'P19-02'
    }
  );
  S.req(
    'nv2_uyen',
    { '2026-11-04': p19('2026-11-04', 'makeup', { before: '11:00' }) },
    { filed: '2026-10-30T18:00', decide: 'approve', caseId: 'P19-03' }
  );
  S.work('nv2_uyen', '2026-11-04', '10:58', '22:03', { caseId: 'P19-03' });
  S.req(
    'nv2_uyen',
    { '2026-11-05': p19('2026-11-05', 'makeup', { before: '08:00' }) },
    { filed: '2026-10-30T18:05', decide: 'approve', caseId: 'P19-04' }
  );
  S.work('nv2_uyen', '2026-11-05', '07:58', '22:03', { caseId: 'P19-04' });
  S.req(
    'nv2_uyen',
    { '2026-11-06': p19('2026-11-06', 'makeup', { before: '11:00' }) },
    { filed: '2026-11-02T18:00', caseId: 'P19-05' }
  );
  S.work('nv2_uyen', '2026-11-06', '10:58', '22:03', { caseId: 'P19-05' });
  S.req(
    'nv2_uyen',
    { '2026-11-09': p19('2026-11-09', 'makeup', { before: '11:00' }) },
    {
      filed: '2026-11-04T18:00',
      decide: 'reject',
      decideAt: '2026-11-05T09:10',
      caseId: 'P19-06'
    }
  );
  S.work('nv2_uyen', '2026-11-09', '10:58', '22:03', { caseId: 'P19-06' });
  S.req(
    'nv2_uyen',
    { '2026-11-12': p19('2026-11-12', 'ot', { before: '11:00' }) },
    { filed: '2026-11-09T18:00', decide: 'approve', caseId: 'P19-07' }
  );
  S.work('nv2_uyen', '2026-11-12', '10:58', '22:03', { caseId: 'P19-07' });
  S.req(
    'nv2_uyen',
    { '2026-11-13': p19('2026-11-13', 'makeup', { before: '11:00' }) },
    { filed: '2026-11-10T18:00', decide: 'approve', caseId: 'P19-08' }
  );
  S.work('nv2_uyen', '2026-11-13', '10:58', '22:03', { caseId: 'P19-08' });
  S.req(
    'nv2_uyen',
    { '2026-11-16': p19('2026-11-16', 'ot', { before: '11:00' }) },
    { filed: '2026-11-11T18:00', decide: 'approve', caseId: 'P19-08' }
  );
  S.work('nv2_uyen', '2026-11-16', '10:58', '22:03', { caseId: 'P19-08' });
  S.req(
    'nv2_uyen',
    { '2026-11-17': p19('2026-11-17', 'makeup', { before: '11:00' }) },
    { filed: '2026-11-12T18:00', decide: 'approve', caseId: 'P19-09' }
  );
  S.work('nv2_uyen', '2026-11-17', '10:58', '22:03', { caseId: 'P19-09' });
  S.req(
    'nv2_uyen',
    { '2026-12-03': p19('2026-12-03', 'makeup', { after: '23:30' }) },
    { filed: '2026-11-30T18:00', decide: 'approve', caseId: 'P19-10', ref: 'P19-10' }
  );
  S.work('nv2_uyen', '2026-12-03', '12:55', '23:33', { caseId: 'P19-10' });
  S.req(
    'nv2_uyen',
    { '2027-02-08': p19('2027-02-08', 'makeup', { after: '23:00' }) },
    { filed: '2027-01-29T18:00', caseId: 'P19-11', ref: 'P19-11a' }
  );
  S.req(
    'nv2_uyen',
    { '2027-02-01': { kind: 'willmakeup', makeupPlans: [{ date: '2027-02-09', from: '11:00', to: '13:00' }] } },
    {
      filed: '2027-01-29T18:05',
      caseId: 'P19-11',
      ref: 'P19-11b'
    }
  );
  S.at(
    '2026-11-20T08:00',
    'data.legacyMakeup',
    { u: 'nv2_uyen', date: '2026-11-20' },
    { caseId: 'P19-12', tags: ['DATA'] }
  );
  S.skip('nv2_uyen', '2026-11-20');
  S.at(
    '2026-11-20T18:00',
    'sheet',
    { u: 'nv2_uyen', by: 'nv2_uyen', month: '2026-11', days: {} },
    { caseId: 'P19-12', ref: 'P19-12a' }
  );
  S.at(
    '2026-11-20T18:05',
    'sheet',
    {
      u: 'nv2_uyen',
      by: 'nv2_uyen',
      month: '2026-11',
      days: { '2026-11-20': { kind: 'makeup', in: '09:00', out: '17:00' } }
    },
    { caseId: 'P19-12', ref: 'P19-12b' }
  );
  S.check('P19-01', {
    u: 'nv2_uyen',
    title: 'Ngày thường F2',
    checks: [row('nv2_uyen', '2026-11-03', { total: 300000 })]
  });
  S.check('P19-02', { u: 'nv2_uyen', title: 'Nghỉ sẽ làm bù', checks: [row('nv2_uyen', '2026-11-02', { total: 0 })] });
  S.check('P19-03', {
    u: 'nv2_uyen',
    title: 'Làm bù 11–13',
    tags: ['P3'],
    checks: [row('nv2_uyen', '2026-11-04', { total: 312500 })]
  });
  S.check('P19-04', {
    u: 'nv2_uyen',
    title: 'Làm bù 08–13 qua giờ nghỉ',
    checks: [row('nv2_uyen', '2026-11-05', { total: 375000, makeupPay: 125000 })]
  });
  S.check('P19-05', {
    u: 'nv2_uyen',
    title: 'Làm bù chờ duyệt bị bỏ',
    checks: [row('nv2_uyen', '2026-11-06', { total: 300000 })]
  });
  S.check('P19-06', {
    u: 'nv2_uyen',
    title: 'Làm bù bị từ chối',
    checks: [row('nv2_uyen', '2026-11-09', { total: 300000 })]
  });
  S.check('P19-07', {
    u: 'nv2_uyen',
    title: 'OT bị giữ khi còn nợ giờ',
    checks: [row('nv2_uyen', '2026-11-12', { otPay: 0, otHold: 2 })]
  });
  S.check('P19-08', {
    u: 'nv2_uyen',
    title: 'Hết nợ giờ, OT được trả',
    checks: [row('nv2_uyen', '2026-11-16', { total: 425000 })]
  });
  S.check('P19-09', {
    u: 'nv2_uyen',
    title: 'Làm bù khi không nợ',
    tags: ['P3'],
    checks: [row('nv2_uyen', '2026-11-17', { makeupPay: 62500 })]
  });
  S.check('P19-10', {
    u: 'nv2_uyen',
    title: 'Làm bù đêm 22:00–23:30',
    checks: [
      http('P19-10', { status: 200, warn: 'SHEET_EXTRA_NIGHT' }),
      row('nv2_uyen', '2026-12-03', { makeupPay: 46875 })
    ]
  });
  S.check('P19-11', {
    u: 'nv2_uyen',
    title: 'Cấm làm bù ngày lễ',
    checks: [
      http('P19-11a', { status: 400, code: 'SHEET_MAKEUP_ON_HOLIDAY' }),
      http('P19-11b', { status: 400, code: 'SHEET_MAKEUP_ON_HOLIDAY' })
    ]
  });
  S.check('P19-12', {
    u: 'nv2_uyen',
    title: 'Ngày làm bù cả ngày kiểu cũ',
    aliases: ['D2'],
    tags: ['DATA'],
    checks: [
      http('P19-12a', { status: 200, warn: 'SHEET_MAKEUP_DAY_LEGACY' }),
      http('P19-12b', { status: 400, code: 'SHEET_MAKEUP_DAY_REMOVED' })
    ]
  });

  /* P20 tts3_vy */
  S.work('tts3_vy', '2026-11-07', '07:55', '17:03', { refIn: 'P20-02', caseId: 'P20-02' });
  S.req(
    'tts3_vy',
    { '2026-11-14': { kind: 'work', in: '08:00', out: '12:00' } },
    { filed: '2026-11-11T18:00', decide: 'approve', caseId: 'P20-03', ref: 'P20-03-req' }
  );
  S.work('tts3_vy', '2026-11-14', '07:58', '12:02', { refIn: 'P20-03', caseId: 'P20-03' });
  S.req(
    'tts3_vy',
    { '2026-11-17': S.extraDay('tts3_vy', '2026-11-17', 'ot', { after: '19:00' }) },
    { decide: 'approve', caseId: 'P20-04', ref: 'P20-04' }
  );
  S.work('tts3_vy', '2026-11-17', '07:55', '19:03', { caseId: 'P20-04' });
  S.req(
    'tts3_vy',
    { '2027-01-01': { kind: 'work', in: '08:00', out: '17:00' } },
    { filed: '2026-12-28T18:00', decide: 'approve', caseId: 'P20-05', ref: 'P20-05' }
  );
  S.leave('tts3_vy', ['2026-12-14'], { filed: '2026-12-10T18:00', caseId: 'P20-06', ref: 'P20-06' });
  S.probeLeave('tts3_vy', '2026-12-14', 'LV-37');
  S.req(
    'tts3_vy',
    { '2026-12-15': S.extraDay('tts3_vy', '2026-12-15', 'makeup', { after: '19:00' }) },
    { filed: '2026-12-11T18:00', decide: 'approve', caseId: 'P20-07' }
  );
  S.work('tts3_vy', '2026-12-15', '07:55', '19:03', { caseId: 'P20-07' });
  S.at('2026-12-10T18:30', 'advance', { action: 'request', u: 'tts3_vy', month: '2026-12' }, { caseId: 'P20-08' });
  S.at('2026-12-11T09:00', 'advance', { action: 'approve', u: 'tts3_vy', month: '2026-12' }, { caseId: 'P20-08' });
  S.check('P20-01', {
    u: 'tts3_vy',
    title: 'Ngày thường TTS',
    checks: [row('tts3_vy', '2026-11-02', { total: 90909.09 })]
  });
  S.check('P20-02', {
    u: 'tts3_vy',
    title: 'Check-in thứ Bảy không có yêu cầu',
    aliases: ['D6'],
    tags: ['P4'],
    checks: [http('P20-02', { status: 409 }, { status: 200 })]
  });
  S.check('P20-03', {
    u: 'tts3_vy',
    title: 'Làm bù thứ Bảy ngoài lịch',
    tags: ['P4', 'CHECK'],
    checks: [row('tts3_vy', '2026-11-14', { total: 45454.55 })]
  });
  S.check('P20-04', {
    u: 'tts3_vy',
    title: 'OT của TTS không có tiền',
    checks: [http('P20-04', { status: 200, warn: 'BENEFIT_NOT_ALLOWED' }), row('tts3_vy', '2026-11-17', { otPay: 0 })]
  });
  S.check('P20-05', {
    u: 'tts3_vy',
    title: 'TTS ngày lễ',
    tags: ['P1'],
    checks: [http('P20-05', { status: 200, warn: 'BENEFIT_NOT_ALLOWED' }), observe({ row: ['tts3_vy', '2027-01-01'] })]
  });
  S.check('P20-06', {
    u: 'tts3_vy',
    title: 'TTS xin phép qua API',
    tags: ['API'],
    checks: [
      http('P20-06', { status: 200, warn: 'BENEFIT_NOT_ALLOWED' }),
      row('tts3_vy', '2026-12-14', { total: 0 }),
      lv('LV-37', { none: true })
    ]
  });
  S.check('P20-07', {
    u: 'tts3_vy',
    title: 'Làm bù TTS',
    checks: [row('tts3_vy', '2026-12-15', { makeupPay: 22727.27 })]
  });
  S.check('P20-08', {
    u: 'tts3_vy',
    title: 'Tạm ứng TTS',
    tags: ['P7'],
    checks: [slip('tts3_vy', '2026-12', { advance: 800000 })]
  });
  S.check('P20-09', {
    u: 'tts3_vy',
    title: 'Phiếu 12/2026 TTS',
    checks: [slip('tts3_vy', '2026-12', { gross: 2113636, insurance: 0, tax: 0, net: 1313636 })]
  });

  /* P21 tts1_xuan */
  S.probeLeave('tts1_xuan', '2026-07-01', 'LV-31', '10:00');
  S.leave('tts1_xuan', ['2026-12-14'], { filed: '2026-12-10T18:00', caseId: 'P21-03' });
  S.probeLeave('tts1_xuan', '2026-12-31', 'P21-1231');
  S.check('P21-01', { u: 'tts1_xuan', title: 'TTS1 → TTS2', checks: [http('P21-01', { status: 200 })] });
  S.check('P21-02', {
    u: 'tts1_xuan',
    title: 'TTS → NV: phép tính lùi về ngày vào',
    checks: [lv('LV-31', { total: 11, balance: 11 })]
  });
  S.check('P21-03', {
    u: 'tts1_xuan',
    title: 'Phép 14/12 và quyết toán 17',
    checks: [lv('P21-1231', { balance: 17 }), settle('tts1_xuan', 17, 3923077)]
  });
  S.check('P21-04', {
    u: 'tts1_xuan',
    title: 'Tháng 11 có BH',
    checks: [slip('tts1_xuan', '2026-11', { insurance: 630000 })]
  });

  /* P22 ctv1_yen */
  S.check('P22-01', { u: 'ctv1_yen', title: 'CTV1 → CTV3', checks: [http('P22-01', { status: 200 })] });
  S.check('P22-02', {
    u: 'ctv1_yen',
    title: 'Đổi sang ca đêm từ 12/2026',
    checks: [
      row('ctv1_yen', '2026-12-02', { total: 337500 }),
      slip('ctv1_yen', '2026-12', { gross: 9112500, net: 8482500 })
    ]
  });

  /* P23 nv1_bao: nghỉ việc 10/11 */
  S.work('nv1_bao', '2026-11-11', '07:55', '17:03', { refIn: 'P23-02', caseId: 'P23-02' });
  S.probeLeave('nv1_bao', '2026-11-11', 'P23-1111', '20:00');
  S.check('P23-01', { u: 'nv1_bao', title: 'Đặt ngày nghỉ việc', checks: [http('P23-01', { status: 200 })] });
  S.check('P23-02', {
    u: 'nv1_bao',
    title: 'Check-in sau ngày nghỉ việc',
    tags: ['P4'],
    checks: [http('P23-02', { status: 409 }, { status: 200 })]
  });
  S.check('P23-03', { u: 'nv1_bao', title: 'Khoá tài khoản', checks: [http('P23-03', { status: 200 })] });
  S.check('P23-04', {
    u: 'nv1_bao',
    title: 'Phiếu 11/2026 người nghỉ việc',
    tags: ['CHECK'],
    checks: [slip('nv1_bao', '2026-11', { gross: 2584615, insurance: 0, net: 2584615 })]
  });
  S.check('P23-05', {
    u: 'nv1_bao',
    title: 'Sổ phép dừng ở ngày nghỉ, màn lịch thì không (A3)',
    tags: ['DEFECT?', 'CHECK'],
    checks: [observe({ leave: 'P23-1111' }), observe({ leaveNow: 'nv1_bao' })]
  });

  /* P24 ctv1_cuong */
  S.leave('ctv1_cuong', ['2026-03-16'], { filed: '2026-03-12T18:00', caseId: 'P24-01' });
  S.probeLeave('ctv1_cuong', '2026-06-30', 'P24-0630');
  S.check('P24-01', { u: 'ctv1_cuong', title: 'Phép 16/03', checks: [lv('P24-0630', { balance: 15 })] });
  S.check('P24-02', { u: 'ctv1_cuong', title: 'Nghỉ việc và khoá', checks: [http('P24-02', { status: 200 })] });
  S.check('P24-03', {
    u: 'ctv1_cuong',
    title: 'Số phép ở 01/03/2027',
    tags: ['DEFECT?', 'CHECK'],
    checks: [observe({ leaveNow: 'ctv1_cuong' })]
  });

  /* P25 nv2_dat: vào 16/11 */
  S.adminEntry(
    '2026-11-14T10:00',
    'nv2_dat',
    { '2026-11-14': { kind: 'work', in: '08:00', out: '17:00', preset: 'Normal1' } },
    { caseId: 'P25-02', ref: 'P25-02' }
  );
  S.check('P25-01', { u: 'nv2_dat', title: 'Tạo tài khoản', checks: [http('create-nv2_dat', { status: 200 })] });
  S.check('P25-02', {
    u: 'nv2_dat',
    title: 'Admin khai ngày trước ngày vào',
    tags: ['DEFECT?'],
    checks: [row('nv2_dat', '2026-11-14', { total: 250000 })]
  });
  S.check('P25-03', {
    u: 'nv2_dat',
    title: 'Phiếu 11/2026',
    checks: [slip('nv2_dat', '2026-11', { gross: 4900000, insurance: 0, net: 4900000 })]
  });
  S.check('P25-04', {
    u: 'nv2_dat',
    title: 'Phiếu 12/2026 hợp đồng ngắn',
    tags: ['CHECK'],
    checks: [slip('nv2_dat', '2026-12', { gross: 9450000, tax: 945000, net: 8505000 })]
  });
  S.check('P25-05', {
    u: 'nv2_dat',
    title: 'Phiếu 1/2027',
    tags: ['CHECK'],
    checks: [slip('nv2_dat', '2027-01', { gross: 9000000, tax: 900000, net: 8100000 })]
  });
  S.check('P25-06', {
    u: 'nv2_dat',
    title: 'Phiếu 2/2027 đủ 3 tháng',
    tags: ['CHECK'],
    checks: [slip('nv2_dat', '2027-02', { gross: 8150000, insurance: 682500, net: 7467500, quyetToanNgay: 1 })]
  });

  /* P26 nv2_giao: vắng */
  for (const d of ['2026-09-30', '2026-10-01', '2026-11-03', '2026-11-04', '2026-11-05', '2027-01-02'])
    S.skip('nv2_giao', d);
  const p26u = ['01', '02', '03', '04', '05', '07', '08', '09', '10', '11', '12', '14', '15', '16', '17'].map(
    d => `2026-12-${d}`
  );
  S.req('nv2_giao', Object.fromEntries(p26u.map(d => [d, { kind: 'unpaid' }])), {
    filed: '2026-11-25T18:00',
    caseId: 'P26-04',
    ref: 'P26-04'
  });
  S.leave('nv2_giao', ['2027-01-12'], { kind: 'approved', filed: '2027-01-08T18:00', caseId: 'P26-05' });
  S.check('P26-01', {
    u: 'nv2_giao',
    title: 'Không bấm 30/09/2026',
    tags: ['VAR'],
    checks: [
      B ? row('nv2_giao', '2026-09-30', { kind: 'noshow', total: 0 }) : observe({ row: ['nv2_giao', '2026-09-30'] })
    ]
  });
  S.check('P26-02', {
    u: 'nv2_giao',
    title: 'Không bấm 01/10/2026',
    checks: [row('nv2_giao', '2026-10-01', { kind: 'noshow', total: 0 })]
  });
  S.check('P26-03', {
    u: 'nv2_giao',
    title: '3 ngày vắng tháng 11',
    checks: [slip('nv2_giao', '2026-11', { gross: 6325000, attendOk: false, net: 5642500 })]
  });
  S.check('P26-04', {
    u: 'nv2_giao',
    title: '15 ngày nghỉ không lương',
    checks: [
      http('P26-04', { status: 200 }),
      slip('nv2_giao', '2026-12', { gross: 3450000, insurance: 0, net: 3450000 })
    ]
  });
  S.check('P26-05', {
    u: 'nv2_giao',
    title: 'Nghỉ được duyệt (không lương)',
    checks: [row('nv2_giao', '2027-01-12', { total: 0 })]
  });
  S.check('P26-06', {
    u: 'nv2_giao',
    title: 'Vắng thứ Bảy 02/01/2027',
    checks: [row('nv2_giao', '2027-01-02', { kind: 'noshow' })]
  });

  /* P27 nv2_hoa: iSAT */
  S.leave('nv2_hoa', ['2026-11-07'], { kind: 'isat', caseId: 'P27-01' });
  S.leave('nv2_hoa', ['2026-11-13'], { kind: 'isat', caseId: 'P27-02', ref: 'P27-02' });
  S.req('nv2_hoa', { '2026-11-21': { kind: 'isat' } }, { caseId: 'P27-03' });
  S.leave('nv2_hoa', ['2026-12-05'], { kind: 'isat', decide: 'reject', caseId: 'P27-04' });
  S.check('P27-01', { u: 'nv2_hoa', title: 'iSAT thứ Bảy', checks: [row('nv2_hoa', '2026-11-07', { total: 250000 })] });
  S.check('P27-02', {
    u: 'nv2_hoa',
    title: 'iSAT ngày thường',
    tags: ['CHECK'],
    checks: [http('P27-02', { status: 200, warn: 'SHEET_ISAT_WEEKDAY' }), row('nv2_hoa', '2026-11-13', { total: 0 })]
  });
  S.check('P27-03', { u: 'nv2_hoa', title: 'iSAT chờ duyệt', checks: [row('nv2_hoa', '2026-11-21', { total: 0 })] });
  S.check('P27-04', { u: 'nv2_hoa', title: 'iSAT bị từ chối', checks: [row('nv2_hoa', '2026-12-05', { total: 0 })] });
  S.check('P27-05', {
    u: 'nv2_hoa',
    title: 'Phiếu 11/2026',
    checks: [slip('nv2_hoa', '2026-11', { gross: 7950000, net: 7267500 })]
  });

  /* P28 nv2_kim: đi làm ngày lễ = OT */
  const hol = (d?, a?, b?, opts?) =>
    S.req('nv2_kim', { [d]: { kind: 'work', in: a, out: b } }, { decide: 'approve', ...opts });
  hol('2027-01-01', '08:00', '17:00', {
    filed: '2026-12-28T18:00',
    decideAt: '2026-12-29T09:00',
    caseId: 'P28-01',
    ref: 'P28-01-req'
  });
  S.work('nv2_kim', '2027-01-01', '07:58', '17:05', { caseId: 'P28-01' });
  hol('2027-02-05', '08:00', '12:00', { filed: '2027-02-01T18:00', decideAt: '2027-02-02T09:00', caseId: 'P28-02' });
  hol('2027-02-08', '08:00', '12:00', { filed: '2027-02-01T18:05', decideAt: '2027-02-02T09:05', caseId: 'P28-04' });
  S.work('nv2_kim', '2027-02-08', '08:20', '12:00', { caseId: 'P28-04' });
  hol('2027-02-09', '13:00', '17:00', { filed: '2027-02-01T18:10', decide: false, caseId: 'P28-05' });
  S.work('nv2_kim', '2027-02-09', '12:58', '17:02', { refIn: 'P28-05', caseId: 'P28-05' });
  hol('2027-02-10', '08:00', '10:00', {
    filed: '2027-02-01T18:15',
    decide: 'reject',
    decideAt: '2027-02-09T09:00',
    caseId: 'P28-06'
  });
  S.work('nv2_kim', '2027-02-10', '07:58', '10:02', { refIn: 'P28-06', caseId: 'P28-06' });
  hol('2026-04-30', '08:00', '17:00', { filed: '2026-04-24T18:00', decideAt: '2026-04-25T09:00', caseId: 'P28-07' });
  S.work('nv2_kim', '2026-04-30', '07:58', '17:05', { caseId: 'P28-07' });
  S.check('P28-01', {
    u: 'nv2_kim',
    title: 'OT ngày lễ 01/01 08–17',
    tags: ['P1', 'CHECK'],
    checks: [
      http('P28-01-req', { status: 200 }),
      row('nv2_kim', '2027-01-01', { total: 1093750 }),
      label('nv2_kim', '2027-01-01', 'L2')
    ]
  });
  S.check('P28-02', {
    u: 'nv2_kim',
    title: 'OT lễ được duyệt nhưng không đến',
    tags: ['P1'],
    checks: [row('nv2_kim', '2027-02-05', { total: 0 })]
  });
  S.check('P28-03', {
    u: 'nv2_kim',
    title: 'Ngày lễ không yêu cầu',
    checks: [row('nv2_kim', '2027-02-06', { kind: 'holiday', total: 250000 })]
  });
  S.check('P28-04', {
    u: 'nv2_kim',
    title: 'OT lễ vào trễ',
    tags: ['P1', 'CHECK'],
    checks: [row('nv2_kim', '2027-02-08', { total: 578125 })]
  });
  S.check('P28-05', {
    u: 'nv2_kim',
    title: 'OT lễ còn chờ lúc tính',
    tags: ['P1', 'P4'],
    checks: [row('nv2_kim', '2027-02-09', { total: 250000 }), http('P28-05', { status: 409 }, { status: 200 })]
  });
  S.check('P28-06', {
    u: 'nv2_kim',
    title: 'OT lễ bị từ chối',
    tags: ['P1', 'P4'],
    checks: [row('nv2_kim', '2027-02-10', { total: 250000 }), http('P28-06', { status: 409 }, { status: 200 })]
  });
  S.check('P28-07', {
    u: 'nv2_kim',
    title: 'OT lễ 30/04/2026',
    tags: ['VAR', 'P1', 'CHECK'],
    checks: [B ? row('nv2_kim', '2026-04-30', { total: 1093750 }) : observe({ row: ['nv2_kim', '2026-04-30'] })]
  });
  S.check('P28-08', { u: 'nv2_kim', title: 'Quyết toán 49 ngày', checks: [settle('nv2_kim', 49, 12250000)] });

  /* P29 ctv2_lam */
  S.req(
    'ctv2_lam',
    { '2027-02-08': { kind: 'work', in: '08:00', out: '17:00', extraKind: 'ot', extraOut: '19:00' } },
    {
      filed: '2027-02-01T18:00',
      decide: 'approve',
      decideAt: '2027-02-02T09:00',
      caseId: 'P29-01'
    }
  );
  S.work('ctv2_lam', '2027-02-08', '07:30', '19:10', { caseId: 'P29-01' });
  S.req(
    'ctv2_lam',
    { '2027-02-09': { kind: 'work', in: '08:00', out: '17:00' } },
    {
      filed: '2027-02-01T18:05',
      decide: 'approve',
      decideAt: '2027-02-02T09:05',
      caseId: 'P29-02',
      ref: 'P29-02'
    }
  );
  S.work('ctv2_lam', '2027-02-09', '07:58', '17:02', { caseId: 'P29-02' });
  S.req(
    'ctv2_lam',
    { '2027-02-10': { kind: 'work', in: '18:00', out: '02:00' } },
    {
      filed: '2027-02-01T18:10',
      decide: 'approve',
      decideAt: '2027-02-02T09:10',
      caseId: 'P29-03'
    }
  );
  S.work('ctv2_lam', '2027-02-10', '17:58', '02:03', { caseId: 'P29-03' });
  S.req(
    'ctv2_lam',
    { '2026-09-02': { kind: 'work', in: '08:00', out: '12:00' } },
    { filed: '2026-08-28T18:00', decide: 'approve', caseId: 'P29-04' }
  );
  S.work('ctv2_lam', '2026-09-02', '07:58', '12:02', { caseId: 'P29-04' });
  S.check('P29-01', {
    u: 'ctv2_lam',
    title: 'OT lễ có kéo dài',
    tags: ['P1', 'CHECK'],
    checks: [row('ctv2_lam', '2027-02-08', { total: 1182692.31 })]
  });
  S.check('P29-02', {
    u: 'ctv2_lam',
    title: 'OT lễ vượt 16 giờ tháng (không còn trần riêng, chỉ trần 40 giờ)',
    tags: ['CHECK'],
    checks: [http('P29-02', { status: 200 })]
  });
  S.check('P29-03', {
    u: 'ctv2_lam',
    title: 'OT lễ qua nửa đêm',
    tags: ['P1', 'CHECK'],
    checks: [observe({ row: ['ctv2_lam', '2027-02-10'] })]
  });
  S.check('P29-04', {
    u: 'ctv2_lam',
    title: 'OT lễ 02/09/2026',
    tags: ['VAR', 'CHECK'],
    checks: [observe({ row: ['ctv2_lam', '2026-09-02'] })]
  });

  /* P30 nv1_mai: tạm ứng */
  const adv = (at?, action?, month?, by?, opts: any = {}) =>
    S.at(at, 'advance', { action, u: 'nv1_mai', month, by, ...opts }, { caseId: opts.caseId, ref: opts.ref });
  adv('2026-10-16T18:00', 'request', '2026-10', null, { caseId: 'P30-01' });
  adv('2026-10-17T09:00', 'approve', '2026-10', null, { caseId: 'P30-01' });
  S.skip('nv1_mai', '2026-11-05');
  adv('2026-11-16T18:00', 'request', '2026-11', null, { caseId: 'P30-02' });
  adv('2026-11-17T09:00', 'reject', '2026-11', null, { caseId: 'P30-02', reason: 'Còn nợ công' });
  adv('2026-12-14T18:00', 'request', '2026-12', null, { caseId: 'P30-03' });
  adv('2026-12-15T09:00', 'withdraw', '2026-12', null, { caseId: 'P30-03' });
  adv('2027-01-15T18:00', 'request', '2027-01', null, { caseId: 'P30-04' });
  adv('2027-01-16T09:00', 'approve', '2027-01', null, { caseId: 'P30-04' });
  adv('2027-02-02T09:00', 'cancel', '2027-01', null, { caseId: 'P30-04', reason: 'Kiểm tra lại số' });
  adv('2027-02-03T09:00', 'approve', '2027-01', null, { caseId: 'P30-04' });
  adv('2027-02-15T18:00', 'request', '2027-02', null, { caseId: 'P30-05' });
  adv('2027-02-16T09:00', 'approve-all', '2027-02', null, { caseId: 'P30-05' });
  S.check('P30-01', {
    u: 'nv1_mai',
    title: 'Tạm ứng tháng 10',
    tags: ['P7'],
    checks: [slip('nv1_mai', '2026-10', { advance: 2400000 })]
  });
  S.check('P30-02', {
    u: 'nv1_mai',
    title: 'Tạm ứng bị từ chối',
    checks: [slip('nv1_mai', '2026-11', { advance: 0 })]
  });
  S.check('P30-03', { u: 'nv1_mai', title: 'Rút yêu cầu', checks: [slip('nv1_mai', '2026-12', { advance: 0 })] });
  S.check('P30-04', {
    u: 'nv1_mai',
    title: 'Huỷ duyệt rồi duyệt lại',
    tags: ['P7'],
    checks: [slip('nv1_mai', '2027-01', { advance: 2215385 })]
  });
  S.check('P30-05', {
    u: 'nv1_mai',
    title: 'Duyệt tất cả',
    tags: ['P7'],
    checks: [slip('nv1_mai', '2027-02', { advance: 1476923 })]
  });
  S.check('P30-06', {
    u: 'nv1_mai',
    title: 'Duyệt lại tháng đã duyệt',
    checks: [http('G11', { status: 409, code: 'PERIOD_LOCKED' })]
  });

  /* P31 nv3_nam: KPI */
  const kpi = (at?, month?, scores?, extra: any = {}, meta: any = {}) =>
    S.at(at, 'kpi', { u: 'nv3_nam', month, scores, ...extra }, meta);
  const all = (v?) => ({ wework: v, user: v, peer: v, manager: v, self: v });
  kpi('2026-10-28T10:00', '2026-10', all(100), { amt: 9000000 }, { caseId: 'P31-01', ref: 'P31-01' });
  kpi(
    '2026-11-28T10:00',
    '2026-11',
    { wework: 80, user: 70, peer: 70, manager: 70, self: 70 },
    {},
    { caseId: 'P31-02' }
  );
  kpi(
    '2026-12-28T10:00',
    '2026-12',
    { wework: 70, user: 100, peer: 100, manager: 100, self: 100 },
    {},
    { caseId: 'P31-03' }
  );
  kpi('2027-01-28T10:00', '2027-01', { wework: 100, user: 100, manager: 100, self: 100 }, {}, { caseId: 'P31-04' });
  kpi('2027-02-26T10:00', '2027-02', all(100), {}, { caseId: 'P31-05' });
  S.req('nv3_nam', Object.fromEntries(['15', '16', '17', '18'].map(d => [`2027-02-${d}`, { kind: 'unpaid' }])), {
    filed: '2027-02-11T18:00',
    caseId: 'P31-05'
  });
  S.at(
    '2026-11-20T20:00',
    'kpi',
    { u: 'nv3_nam', month: '2026-11', scores: { self: 90 }, as: 'nv3_nam' },
    { caseId: 'P31-06', ref: 'P31-06a' }
  );
  S.at(
    '2026-11-20T20:01',
    'kpi',
    { u: 'nv3_nam', month: '2026-11', scores: { manager: 100 }, as: 'nv3_nam' },
    { caseId: 'P31-06', ref: 'P31-06b' }
  );
  S.check('P31-01', {
    u: 'nv3_nam',
    title: 'KPI vượt mức bậc',
    tags: ['CHECK'],
    checks: [observe({ http: 'P31-01' }), slip('nv3_nam', '2026-10', { kpi: 7000000 })]
  });
  S.check('P31-02', { u: 'nv3_nam', title: 'KPI dưới ngưỡng đạt', checks: [slip('nv3_nam', '2026-11', { kpi: 0 })] });
  S.check('P31-03', { u: 'nv3_nam', title: 'Cổng wework', checks: [slip('nv3_nam', '2026-12', { kpi: 0 })] });
  S.check('P31-04', { u: 'nv3_nam', title: 'Thiếu điểm peer', checks: [slip('nv3_nam', '2027-01', { kpi: 0 })] });
  S.check('P31-05', {
    u: 'nv3_nam',
    title: 'KPI theo tỉ lệ ngày công',
    tags: ['CHECK'],
    checks: [observe({ slip: ['nv3_nam', '2027-02'] })]
  });
  S.check('P31-06', {
    u: 'nv3_nam',
    title: 'Tự chấm điểm self; không chấm manager',
    tags: ['CHECK'],
    checks: [http('P31-06a', { status: 200 }), observe({ http: 'P31-06b' })]
  });

  /* P32 nv2_phat: Admin khai thay */
  for (const d of ['2026-11-18', '2026-11-19', '2026-11-23', '2026-11-25', '2026-11-26']) S.skip('nv2_phat', d);
  S.adminEntry(
    '2026-11-18T23:00',
    'nv2_phat',
    { '2026-11-18': { kind: 'work', in: '13:00', out: '22:00', preset: 'Flex2' } },
    { caseId: 'P32-02' }
  );
  S.adminEntry(
    '2026-11-19T19:00',
    'nv2_phat',
    { '2026-11-19': { kind: 'work', in: '09:00', out: '18:00' } },
    { caseId: 'P32-03', ref: 'P32-03' }
  );
  S.work('nv2_phat', '2026-11-20', '07:55', '17:05', { caseId: 'P32-04' });
  S.adminEntry(
    '2026-11-20T18:00',
    'nv2_phat',
    { '2026-11-20': { kind: 'work', in: '08:00', out: '17:00', preset: 'Normal1' } },
    { caseId: 'P32-04' }
  );
  S.adminEntry(
    '2026-11-24T07:00',
    'nv2_phat',
    { '2026-11-23': { kind: 'work', in: '21:00', out: '06:00', preset: 'Night1' } },
    { caseId: 'P32-05' }
  );
  S.work('nv2_phat', '2026-11-24', '07:55', '12:00', { caseId: 'P32-06' });
  S.adminEntry(
    '2026-11-24T18:00',
    'nv2_phat',
    { '2026-11-24': { kind: 'work', in: '08:00', out: '17:00', preset: 'Normal1' } },
    { caseId: 'P32-06', ref: 'P32-06' }
  );
  S.adminEntry(
    '2026-11-25T18:00',
    'nv2_phat',
    { '2026-11-25': { kind: 'work', in: '08:00', out: '17:00', preset: 'Normal1' } },
    { caseId: 'P32-07' }
  );
  S.adminEntry('2026-11-25T19:00', 'nv2_phat', { '2026-11-25': { kind: 'leave' } }, { caseId: 'P32-07' });
  S.adminEntry(
    '2026-11-26T18:00',
    'nv2_phat',
    { '2026-11-26': { kind: 'work', in: '08:20', out: '17:00', preset: 'Normal1' } },
    { caseId: 'P32-08' }
  );
  S.work('nv2_phat', '2026-11-27', '07:55', '17:45', { explain: 'Ở lại họp', caseId: 'P32-09' });
  S.adminEntry(
    '2026-11-28T10:00',
    'nv2_phat',
    { '2026-11-27': { kind: 'work', in: '08:00', out: '17:00', preset: 'Normal1' } },
    { caseId: 'P32-09' }
  );
  S.check('P32-01', {
    u: 'nv2_phat',
    title: 'Tháng 10 Admin khai thay',
    checks: [label('nv2_phat', '2026-10-05', 'L6'), row('nv2_phat', '2026-10-05', { total: 250000 })]
  });
  S.check('P32-02', {
    u: 'nv2_phat',
    title: 'Admin chọn ca Flex2',
    tags: ['P5'],
    checks: [row('nv2_phat', '2026-11-18', { total: 300000 }), label('nv2_phat', '2026-11-18', 'L6')]
  });
  S.check('P32-03', {
    u: 'nv2_phat',
    title: 'Admin khai không chọn ca',
    tags: ['P5', 'CHECK'],
    checks: [
      http('P32-03', { status: 200, warn: 'SHEET_ADMIN_SHIFT_REQUIRED' }),
      row('nv2_phat', '2026-11-19', { total: 218750 })
    ]
  });
  S.check('P32-04', {
    u: 'nv2_phat',
    title: 'Lượt thật thắng lượt Admin',
    checks: [label('nv2_phat', '2026-11-20', 'L2')]
  });
  S.check('P32-05', {
    u: 'nv2_phat',
    title: 'Admin chọn ca đêm',
    tags: ['P5'],
    checks: [row('nv2_phat', '2026-11-23', { total: 390625 })]
  });
  S.check('P32-06', {
    u: 'nv2_phat',
    title: 'Admin khai trùng lượt thật',
    tags: ['CHECK'],
    checks: [
      http('P32-06', { status: 200, warn: 'ADMIN_PRESENCE_OVERLAP' }),
      observe({ row: ['nv2_phat', '2026-11-24'] })
    ]
  });
  S.check('P32-07', {
    u: 'nv2_phat',
    title: 'Đổi ngày Admin khai thành phép',
    checks: [row('nv2_phat', '2026-11-25', { kind: 'leave', total: 250000 })]
  });
  S.check('P32-08', {
    u: 'nv2_phat',
    title: 'Admin khai giờ vào trễ',
    checks: [row('nv2_phat', '2026-11-26', { total: 234375 }), label('nv2_phat', '2026-11-26', 'L6')]
  });
  S.check('P32-09', {
    u: 'nv2_phat',
    title: 'Giải trình chưa trả lời + Admin khai',
    checks: [row('nv2_phat', '2026-11-27', { total: 250000 })]
  });

  /* P33 nv2_quynh: đường trạng thái phép */
  S.leave('nv2_quynh', ['2026-03-09'], { filed: '2026-03-05T18:00', caseId: 'P33-01' });
  S.leave('nv2_quynh', ['2026-03-10'], { filed: '2026-03-05T18:05', decide: 'reject', caseId: 'P33-02' });
  S.probeLeave('nv2_quynh', '2026-03-09', 'P33-0309');
  S.probeLeave('nv2_quynh', '2026-03-10', 'P33-0310');
  S.leave('nv2_quynh', ['2026-04-30'], { filed: '2026-04-24T18:00', caseId: 'P33-03', ref: 'P33-03' });
  S.probeLeave('nv2_quynh', '2026-04-30', 'P33-0430');
  S.req('nv2_quynh', { '2026-11-23': { kind: 'leave' } }, { filed: '2026-11-20T18:00', caseId: 'P33-04' });
  S.probeSlip('nv2_quynh', '2026-11', 'P33-run1', '2026-12-01T09:15');
  S.at(
    '2026-12-02T09:00',
    'decide',
    { u: 'nv2_quynh', dates: ['2026-11-23'], action: 'approve' },
    { caseId: 'P33-04', ref: 'P33-04' }
  );
  S.leave('nv2_quynh', ['2026-12-27'], { filed: '2026-12-22T18:00', caseId: 'P33-05', ref: 'P33-05' });
  S.probeLeave('nv2_quynh', '2026-12-31', 'LV-35');
  S.check('P33-01', { u: 'nv2_quynh', title: 'Phép được duyệt', checks: [lv('P33-0309', { balance: 23 })] });
  S.check('P33-02', { u: 'nv2_quynh', title: 'Phép bị từ chối trả lại', checks: [lv('P33-0310', { balance: 23 })] });
  S.check('P33-03', {
    u: 'nv2_quynh',
    title: 'Phép trùng ngày lễ',
    aliases: ['D4'],
    tags: ['API'],
    checks: [lv('P33-0430', { used: 1 }), row('nv2_quynh', '2026-04-30', { total: 250000 })]
  });
  S.check('P33-04', {
    u: 'nv2_quynh',
    title: 'Phép chờ lúc khoá công, duyệt sau',
    checks: [
      rowAt('P33-run1', '2026-11-23', { total: 0 }),
      row('nv2_quynh', '2026-11-23', { kind: 'leave', total: 250000 })
    ]
  });
  S.check('P33-05', {
    u: 'nv2_quynh',
    title: 'Phép Chủ nhật bị trừ mà không lương',
    tags: ['DEFECT?'],
    checks: [http('P33-05', { status: 200, warn: 'SHEET_SUNDAY' }), lv('LV-35', { total: 35, used: 3, balance: 32 })]
  });
  S.check('P33-06', { u: 'nv2_quynh', title: 'Quyết toán 32 ngày', checks: [settle('nv2_quynh', 32, 8000000)] });
}

module.exports = { protagonistsP19toP33 };
