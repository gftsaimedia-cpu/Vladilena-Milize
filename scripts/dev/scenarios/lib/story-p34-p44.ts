'use strict';
// Cốt truyện cả năm: nhân vật P34–P44 (xem story.cjs). Mỗi trường hợp ghi đầu vào và kết quả mong đợi.
const { slip, row, lv, http, label, observe, settle } = require('./story-steps');

function protagonistsP34toP44(S?) {
  const B = S.variant === 'B';
  /* P34 ctv1_sang: cổng Check-in */
  S.work('ctv1_sang', '2026-11-08', '08:00', '12:00', { refIn: 'P34-01', caseId: 'P34-01' });
  S.work('ctv1_sang', '2026-11-10', '03:30', '17:03', { refIn: 'P34-02', caseId: 'P34-02' });
  S.at('2026-11-11T07:56:10', 'geofence', { enabled: true }, { caseId: 'P34-03', ref: 'P34-03-on' });
  S.skip('ctv1_sang', '2026-11-11');
  S.at(
    '2026-11-11T07:56:20',
    'punch',
    { u: 'ctv1_sang', type: 'in', location: { lat: 21.5, lng: 106.5, accuracy: 20 } },
    { caseId: 'P34-03', ref: 'P34-03' }
  );
  S.at('2026-11-11T07:56:30', 'geofence', { enabled: false }, { caseId: 'P34-03' });
  S.at('2026-11-11T17:03', 'punch', { u: 'ctv1_sang', type: 'out' }, { caseId: 'P34-03' });
  S.skip('ctv1_sang', '2026-11-12');
  S.at('2026-11-12T07:55', 'punch', { u: 'ctv1_sang', type: 'in' }, { caseId: 'P34-04' });
  S.at('2026-11-12T07:57', 'punch', { u: 'ctv1_sang', type: 'in' }, { caseId: 'P34-04', ref: 'P34-04' });
  S.at('2026-11-12T17:03', 'punch', { u: 'ctv1_sang', type: 'out' }, { caseId: 'P34-04' });
  S.skip('ctv1_sang', '2026-11-13');
  S.at('2026-11-13T07:55', 'punch', { u: 'ctv1_sang', type: 'in' }, { caseId: 'P34-05' });
  S.at(
    '2026-11-13T17:02',
    'punch',
    { u: 'ctv1_sang', type: 'out', sessionId: 999999 },
    { caseId: 'P34-05', ref: 'P34-05a' }
  );
  S.at('2026-11-13T17:03', 'punch', { u: 'ctv1_sang', type: 'out' }, { caseId: 'P34-05' });
  S.at(
    '2026-11-13T17:04',
    'punch',
    { u: 'ctv1_sang', type: 'out', sessionId: 'last' },
    { caseId: 'P34-05', ref: 'P34-05b' }
  );
  S.skip('ctv1_sang', '2026-11-14');
  S.at(
    '2026-11-14T07:55',
    'punch',
    { u: 'ctv1_sang', type: 'in', requestId: 'sc-ctv1_sang-replay-1' },
    { caseId: 'P34-06' }
  );
  S.at(
    '2026-11-14T07:56',
    'punch',
    { u: 'ctv1_sang', type: 'in', requestId: 'sc-ctv1_sang-replay-1' },
    { caseId: 'P34-06', ref: 'P34-06a' }
  );
  S.at(
    '2026-11-14T17:03',
    'punch',
    { u: 'ctv1_sang', type: 'out', requestId: 'sc-ctv1_sang-replay-1' },
    { caseId: 'P34-06', ref: 'P34-06b' }
  );
  S.at('2026-11-14T17:04', 'punch', { u: 'ctv1_sang', type: 'out' }, { caseId: 'P34-06' });
  S.sessions(
    'ctv1_sang',
    '2026-11-16',
    [
      ['07:55', '11:00'],
      ['13:00', '17:02']
    ],
    { caseId: 'P34-07' }
  );
  S.check('P34-01', {
    u: 'ctv1_sang',
    title: 'Check-in Chủ nhật',
    tags: ['P4'],
    checks: [http('P34-01', { status: 409 }, { status: 200 })]
  });
  S.check('P34-02', {
    u: 'ctv1_sang',
    title: 'Check-in 03:30 trước khung ca',
    tags: ['P4', 'CHECK'],
    checks: [observe({ http: 'P34-02' }), observe({ row: ['ctv1_sang', '2026-11-10'] })]
  });
  S.check('P34-03', {
    u: 'ctv1_sang',
    title: 'Check-in ngoài vùng định vị',
    tags: ['CHECK'],
    checks: [observe({ http: 'P34-03' }), observe({ http: 'P34-03-on' })]
  });
  S.check('P34-04', {
    u: 'ctv1_sang',
    title: 'Check-in lần hai khi đang mở',
    checks: [http('P34-04', { status: 409 })]
  });
  S.check('P34-05', {
    u: 'ctv1_sang',
    title: 'Check-out sai lượt / hai lần',
    checks: [http('P34-05a', { status: 404 }), http('P34-05b', { status: 409 })]
  });
  S.check('P34-06', {
    u: 'ctv1_sang',
    title: 'Lặp requestId',
    checks: [http('P34-06a', { status: 200 }), http('P34-06b', { status: 409 })]
  });
  S.check('P34-07', {
    u: 'ctv1_sang',
    title: 'Hai lượt trong ngày, khoảng trống chứa giờ nghỉ',
    tags: ['CHECK'],
    checks: [observe({ row: ['ctv1_sang', '2026-11-16'] })]
  });

  /* P35 nv4_tam: khoản điền thêm */
  const entry = (at?, as?, body?, meta?) => S.at(at, 'payentry.create', { as, body }, meta);
  entry(
    '2026-12-10T10:00',
    'cb1',
    {
      username: 'nv4_tam',
      month: '2026-12',
      direction: 'add',
      amount: 20000000,
      label: 'Thưởng dự án',
      reason: 'Thưởng hoàn thành dự án quý 4',
      taxMode: 'full'
    },
    { caseId: 'P35-01', ref: 'P35-01', var: 'bonus' }
  );
  S.at(
    '2026-12-10T10:05',
    'payentry.decide',
    { as: 'cb1', var: 'bonus', decision: 'approved' },
    { caseId: 'P35-01', ref: 'P35-01b' }
  );
  S.at(
    '2026-12-11T09:00',
    'payentry.decide',
    { as: 'admin1', var: 'bonus', decision: 'approved' },
    { caseId: 'P35-02', ref: 'P35-02' }
  );
  entry(
    '2026-12-12T10:00',
    'cb1',
    {
      username: 'nv4_tam',
      month: '2026-12',
      direction: 'deduct',
      amount: 100000,
      label: 'Phạt đi muộn',
      reason: 'Đi muộn nhiều lần trong tháng'
    },
    { caseId: 'P35-03', ref: 'P35-03' }
  );
  entry(
    '2026-12-12T10:10',
    'cb1',
    {
      username: 'nv4_tam',
      month: '2026-12',
      direction: 'deduct',
      amount: 500000,
      label: 'Thu hồi tạm ứng cũ',
      reason: 'Thu hồi khoản tạm ứng tháng 6'
    },
    { caseId: 'P35-04', var: 'recover' }
  );
  S.at(
    '2026-12-12T11:00',
    'payentry.decide',
    { as: 'admin2', var: 'recover', decision: 'approved' },
    { caseId: 'P35-04', ref: 'P35-04' }
  );
  entry(
    '2027-01-20T10:00',
    'cb1',
    {
      username: 'nv4_tam',
      month: '2027-01',
      direction: 'deduct',
      amount: 15000000,
      label: 'Bồi thường thiết bị',
      reason: 'Bồi thường máy tính bị hỏng'
    },
    { caseId: 'P35-05', var: 'damage' }
  );
  S.at(
    '2027-01-20T11:00',
    'payentry.decide',
    { as: 'admin1', var: 'damage', decision: 'approved' },
    { caseId: 'P35-05' }
  );
  S.at(
    '2027-02-05T10:20',
    'payentry.void',
    { as: 'admin2', var: 'damage', reason: 'Huỷ để kỳ duyệt được, thu lại theo đợt' },
    { caseId: 'P35-05', ref: 'P35-05' }
  );
  entry(
    '2027-02-06T10:00',
    'cb1',
    {
      username: 'nv4_tam',
      month: '2027-01',
      direction: 'add',
      amount: 300000,
      label: 'Phụ cấp bổ sung',
      reason: 'Bổ sung phụ cấp tháng 1'
    },
    { caseId: 'P35-06', ref: 'P35-06' }
  );
  S.check('P35-01', {
    u: 'nv4_tam',
    title: 'C&B tự duyệt khoản mình lập',
    checks: [http('P35-01', { status: 200 }), http('P35-01b', { status: 403 })]
  });
  S.check('P35-02', {
    u: 'nv4_tam',
    title: 'Thưởng 20 triệu, thuế luỹ tiến',
    tags: ['CHECK'],
    checks: [
      http('P35-02', { status: 200 }),
      slip('nv4_tam', '2026-12', { gross: 30903846, insurance: 787500, tax: 110817 })
    ]
  });
  S.check('P35-03', {
    u: 'nv4_tam',
    title: 'Nhãn khoản trừ có chữ "phạt"',
    tags: ['CHECK'],
    checks: [observe({ http: 'P35-03' })]
  });
  S.check('P35-04', { u: 'nv4_tam', title: 'Khoản trừ sau thuế', checks: [http('P35-04', { status: 200 })] });
  S.check('P35-05', {
    u: 'nv4_tam',
    title: 'Thực lĩnh âm, huỷ khoản',
    checks: [http('G07-negative', { status: 409, code: 'PAYSLIP_NEGATIVE_NET' }), http('P35-05', { status: 200 })]
  });
  S.check('P35-06', {
    u: 'nv4_tam',
    title: 'Khoản cho kỳ đã duyệt',
    checks: [http('P35-06', { status: 409, code: 'PERIOD_LOCKED' })]
  });

  /* P36 nv1_uy */
  S.check('P36-01', {
    u: 'nv1_uy',
    title: 'Tháng 10 iDorm, không BH, hợp đồng ngắn',
    tags: ['CHECK'],
    checks: [slip('nv1_uy', '2026-10', { gross: 7788462, insurance: 0, tax: 778846, net: 7009616 })]
  });
  S.check('P36-02', {
    u: 'nv1_uy',
    title: 'Tháng 11 theo thâm niên, vẫn không BH',
    checks: [slip('nv1_uy', '2026-11', { gross: 7211538, insurance: 0, net: 7211538 })]
  });
  S.check('P36-03', {
    u: 'nv1_uy',
    title: 'Bỏ iDorm sau khi duyệt kỳ 11',
    tags: ['CHECK'],
    checks: [observe({ slip: ['nv1_uy', '2026-12'] })]
  });

  /* P37 nv2_van */
  S.work('nv2_van', '2026-12-31', '07:55', null, { noOut: true, caseId: 'P37-01' });
  S.req('nv2_van', { '2026-12-30': { kind: 'leave' } }, { filed: '2027-01-05T18:00', caseId: 'P37-02', ref: 'P37-02' });
  S.work('nv2_van', '2027-01-30', '07:55', null, { noOut: true, caseId: 'P37-03' });
  S.work('nv2_van', '2027-02-01', '09:30', '17:03', { caseId: 'P37-03' });
  S.check('P37-01', {
    u: 'nv2_van',
    title: 'Quên Check-out 31/12',
    checks: [http('lock-2026-12', { status: 200, warn: 'FORGOT_PUNCH' }), row('nv2_van', '2026-12-31', { total: 0 })]
  });
  S.check('P37-02', {
    u: 'nv2_van',
    title: 'Xin phép cho tháng đã khoá',
    tags: ['CHECK'],
    checks: [observe({ http: 'P37-02' })]
  });
  S.check('P37-03', {
    u: 'nv2_van',
    title: 'Lượt mở lúc khoá công tháng 1',
    tags: ['CHECK'],
    checks: [observe({ http: 'lock-2027-01' })]
  });

  /* P38, P39 TTS */
  S.check('P38-01', {
    u: 'tts5_xa',
    title: 'TTS ca đêm',
    checks: [row('tts5_xa', '2026-11-02', { total: 236363.64 })]
  });
  S.check('P39-01', {
    u: 'tts6_yen',
    title: 'TTS ca linh hoạt',
    checks: [row('tts6_yen', '2026-11-02', { total: 250000 })]
  });

  /* P40 nv2_an */
  S.probeLeave('nv2_an', '2027-01-25', 'LV-29');
  S.leave('nv2_an', ['2027-01-28', '2027-01-29', '2027-01-30'], { filed: '2027-01-20T18:00', caseId: 'P40-02' });
  S.probeLeave('nv2_an', '2027-01-30', 'P40-0130');
  S.probeLeave('nv2_an', '2027-02-01', 'P40-0201');
  S.check('P40-01', {
    u: 'nv2_an',
    title: 'Sinh nhật tháng 1 vào phần mới',
    checks: [lv('LV-29', { total: 9, balance: 9, expiring: 7 })]
  });
  S.check('P40-02', {
    u: 'nv2_an',
    title: 'Nghỉ cuối tháng 1, quyết toán 4',
    checks: [
      lv('P40-0130', { balance: 6, expiring: 4 }),
      lv('P40-0201', { expired: 4, balance: 2 }),
      settle('nv2_an', 4, 1000000),
      slip('nv2_an', '2027-01', { attendOk: false })
    ]
  });

  /* P41 nv1_be */
  const p41 = ['07', '08', '09', '10', '11', '12', '14', '15', '16', '17'].map(d => `2026-12-${d}`);
  S.leave('nv1_be', p41, { filed: '2026-11-30T18:00', caseId: 'P41-01' });
  S.work('nv1_be', '2026-12-07', '07:55', '17:03', { caseId: 'P41-01' });
  S.probeLeave('nv1_be', '2026-12-17', 'P41-1217');
  S.probeLeave('nv1_be', '2027-02-01', 'P41-0201');
  S.leave('nv1_be', ['2027-02-11', '2027-02-12', '2027-02-13'], {
    filed: '2027-02-01T18:00',
    decideAt: '2027-02-02T09:00',
    caseId: 'P41-03',
    ref: 'P41-03'
  });
  S.probeLeave('nv1_be', '2027-02-13', 'LV-30');
  S.check('P41-01', {
    u: 'nv1_be',
    title: 'Nghỉ 10 ngày, vẫn bấm ngày đầu',
    checks: [
      lv('P41-1217', { balance: 5 }),
      row('nv1_be', '2026-12-07', { kind: 'leave', total: 230769.23 }),
      slip('nv1_be', '2026-12', { attendOk: false })
    ]
  });
  S.check('P41-02', {
    u: 'nv1_be',
    title: 'Quyết toán 5',
    checks: [lv('P41-0201', { expired: 5, balance: 1 }), settle('nv1_be', 5, 1153846)]
  });
  S.check('P41-03', {
    u: 'nv1_be',
    title: 'Phép âm sau hết hạn (A2)',
    checks: [http('P41-03', { status: 200 }), lv('LV-30', { total: 17, used: 13, expired: 5, balance: -1 })]
  });

  /* P42 nv2_chau */
  S.leave('nv2_chau', ['2026-08-10'], { filed: '2026-08-06T18:00', caseId: 'P42-01' });
  S.probeLeave('nv2_chau', '2027-02-01', 'LV-34');
  S.check('P42-01', {
    u: 'nv2_chau',
    title: 'Nghỉ việc 12/02/2027, vẫn quyết toán',
    checks: [
      lv('LV-34', { total: 25, used: 1, expired: 22, balance: 2 }),
      slip('nv2_chau', '2027-02', {
        quyetToanNgay: 22,
        quyetToanPhep: 5500000,
        gross: 8850000,
        insurance: 682500,
        net: 8167500
      })
    ]
  });

  /* P43 nv2_duc */
  S.check('P43-01', {
    u: 'nv2_duc',
    title: '% đêm hồ sơ 60 chỉ tới tháng 10',
    checks: [row('nv2_duc', '2026-10-05', { total: 440625 }), row('nv2_duc', '2026-11-02', { total: 390625 })]
  });
  S.check('P43-02', {
    u: 'nv2_duc',
    title: 'Ca G2 04/02 vào Tết',
    tags: ['CHECK'],
    checks: [observe({ row: ['nv2_duc', '2027-02-04'] })]
  });

  /* P44 nv1_kha */
  S.work('nv1_kha', '2026-12-01', '07:55', '17:03', { refIn: 'P44-02', caseId: 'P44-02' });
  S.adminEntry(
    '2026-12-01T18:00',
    'nv1_kha',
    { '2026-12-01': { kind: 'work', in: '08:00', out: '17:00', preset: 'Normal1' } },
    { caseId: 'P44-03', ref: 'P44-03' }
  );
  S.adminEntry(
    '2026-12-02T18:00',
    'nv1_kha',
    { '2026-12-01': { kind: 'work', in: '08:00', out: '17:00', preset: 'Normal1' } },
    { caseId: 'P44-04', ref: 'P44-04' }
  );
  S.check('P44-01', {
    u: 'nv1_kha',
    title: 'Tạo tài khoản không có ca',
    checks: [http('create-nv1_kha', { status: 200 })]
  });
  S.check('P44-02', {
    u: 'nv1_kha',
    title: 'Check-in khi chưa có ca',
    tags: ['P4', 'CHECK'],
    checks: [http('P44-02', { status: 409 }, { status: 200 })]
  });
  S.check('P44-03', {
    u: 'nv1_kha',
    title: 'Admin khai khi chưa có ca',
    tags: ['CHECK'],
    checks: [http('P44-03', { status: 200, warn: 'ADMIN_PRESENCE_NO_SHIFT' })]
  });
  S.check('P44-04', {
    u: 'nv1_kha',
    title: 'Gán ca rồi khai lại',
    checks: [label('nv1_kha', '2026-12-01', 'L6'), row('nv1_kha', '2026-12-01', { total: 230769.23 })]
  });

  /* Dữ liệu chỉ ghi được bằng kho (không có đường giao diện / API) */
  S.at(
    '2026-12-09T18:00',
    'data.session',
    {
      u: 'bg_nv1_e',
      date: '2026-12-09',
      entry: {
        kind: 'pending',
        reason: 'needs-review',
        src: 'punch',
        presIn: '2026-12-08T22:55:00.000Z',
        presOut: '2026-12-09T08:03:00.000Z'
      }
    },
    { caseId: 'D5', tags: ['DATA'] }
  );
  S.skip('bg_nv1_e', '2026-12-09');
  S.at(
    '2026-12-20T18:00',
    'data.session',
    {
      u: 'bg_ctv1_g',
      date: '2026-12-20',
      entry: {
        kind: 'pending',
        reason: 'open',
        src: 'punch',
        presIn: '2026-12-20T01:00:00.000Z',
        presOut: '2026-12-20T05:00:00.000Z',
        outsideShift: true
      }
    },
    { caseId: 'D8', tags: ['DATA'] }
  );
  S.at('2027-01-25T10:00', 'data.badLevel', { u: 'x_badlevel' }, { caseId: 'D7', tags: ['DATA'] });
  S.check('D5', {
    u: 'bg_nv1_e',
    title: 'Lượt chờ đối soát',
    tags: ['DATA'],
    checks: [label('bg_nv1_e', '2026-12-09', 'L3'), row('bg_nv1_e', '2026-12-09', { total: 0 })]
  });
  S.check('D7', {
    u: 'x_badlevel',
    title: 'Bậc không hợp lệ',
    tags: ['DATA', 'CHECK'],
    checks: [observe({ slip: ['x_badlevel', '2027-02'] })]
  });
  S.check('D8', {
    u: 'bg_ctv1_g',
    title: 'Bấm Chủ nhật không khai',
    tags: ['DATA', 'CHECK'],
    checks: [observe({ row: ['bg_ctv1_g', '2026-12-20'] })]
  });
  // D3: dòng duyệt kiểu cũ mục 'holiday_work' (dấu vân tay holiday_work|08:00-12:00, đã duyệt) cho ngày đi làm lễ 01/01/2027 08–12,
  // lịch và dòng duyệt ghi thẳng kho; nhân viên vẫn Check-in/out bằng route thật. Hệ thống đọc dòng này như OT ngày lễ đã duyệt.
  S.at(
    '2026-12-28T18:00',
    'data.legacyHolidayApproval',
    { u: 'bg_nv3_d', date: '2027-01-01', in: '08:00', out: '12:00' },
    { caseId: 'D3', tags: ['DATA'] }
  );
  S.work('bg_nv3_d', '2027-01-01', '07:58', '12:02', { caseId: 'D3', refIn: 'D3-in' });
  S.check('D3', {
    u: 'bg_nv3_d',
    title: 'Dòng duyệt đi làm lễ kiểu cũ (holiday_work)',
    tags: ['DATA', 'P1', 'P4', 'CHECK'],
    checks: [http('D3-in', { status: 200 }), observe({ row: ['bg_nv3_d', '2027-01-01'] })]
  });
}

module.exports = { protagonistsP34toP44 };
