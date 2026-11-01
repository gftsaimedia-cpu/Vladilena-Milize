'use strict';
// Dàn nhân vật của kịch bản (một nguồn duy nhất): hồ sơ đầy đủ gửi qua PUT /api/staff/:u, các lần đổi hồ sơ, ngày phép nền.
// shift: mã ca danh mục (null = chưa gán ca). changes: đổi hồ sơ lúc `at` (giờ Việt Nam), luôn gửi lại cả hồ sơ đã gộp.

const ADMINS = [
  { u: 'admin1', name: 'Trần Quản Trị', role: 'admin', theme: 'Admin chính: duyệt, khai thay, chốt kỳ' },
  { u: 'admin2', name: 'Lê Phó Quản Trị', role: 'admin', theme: 'Admin thứ hai: duyệt khoản do C&B lập, mở lại kỳ' },
  { u: 'cb1', name: 'Phạm Thị C&B', role: 'cb', theme: 'C&B: lập khoản điền thêm, không chấm công' }
];

// id, username, họ tên, loại, bậc, ca, ngày vào, ngày sinh, chủ đề, phần riêng
const P = (id?, u?, name?, type?, level?, shift?, start?, birthday?, theme?, extra: any = {}) => ({
  id,
  u,
  name,
  type,
  level,
  shift,
  start,
  birthday,
  theme,
  ...extra
});

const PROTAGONISTS = [
  P(
    'P01',
    'nv2_lan',
    'Nguyễn Thị Lan',
    'nv',
    2,
    'Normal1',
    '2025-03-15',
    '1995-07-20',
    'Tháng mẫu; phép A; tạm ứng; quyết toán phép'
  ),
  P(
    'P02',
    'ctv1_binh',
    'Trần Văn Bình',
    'ctv',
    1,
    'Normal2',
    '2025-01-05',
    null,
    'Phép B: dùng tháng 12 và 1, hết hạn 19'
  ),
  P(
    'P03',
    'ctv2_chi',
    'Lê Thị Chi',
    'ctv',
    2,
    'Normal1',
    '2025-01-05',
    null,
    'Phép C: không dùng, phép chờ duyệt lúc hết hạn'
  ),
  P(
    'P04',
    'nv1_dung',
    'Phạm Văn Dũng',
    'nv',
    1,
    'Normal1',
    '2026-08-20',
    '1990-09-01',
    'Vào giữa năm, thử việc, phép D',
    {
      contract: 'short',
      contractStatus: 'probation',
      createAt: '2026-08-17T09:00',
      changes: [{ at: '2026-10-20T09:30', set: { contractStatus: 'official' }, caseId: 'P04-03' }]
    }
  ),
  P(
    'P05',
    'nv1_em',
    'Hoàng Thị Em',
    'nv',
    1,
    'Normal1',
    '2026-01-15',
    '1999-07-20',
    'Nghỉ phép trước khi có phép (âm)'
  ),
  P('P06', 'nv1_phuong', 'Vũ Thị Phương', 'nv', 1, 'Normal2', '2026-01-15', '1999-04-02', 'Điều chỉnh phép −1,5', {
    changes: [{ at: '2026-02-01T09:00', set: { leaveAdjust: -1.5 }, caseId: 'P06-01' }]
  }),
  P('P07', 'ctv3_giang', 'Đỗ Văn Giang', 'ctv', 3, 'Normal1', '2024-01-10', null, 'Phép tích từ 2024 hết hạn (A1)'),
  P(
    'P08',
    'nv4_hai',
    'Bùi Văn Hải',
    'nv',
    4,
    'Normal1',
    '2021-06-10',
    '1990-01-01',
    'Thâm niên, nghỉ 10 ngày tháng 1, quyết toán lớn, thuế'
  ),
  P(
    'P09',
    'nv1_khanh',
    'Ngô Thị Khánh',
    'nv',
    1,
    'Normal1',
    '2026-01-31',
    '1999-07-20',
    'Vào ngày 31: kẹp cuối tháng khi cộng phép'
  ),
  P(
    'P10',
    'ctv1_linh',
    'Đặng Thị Linh',
    'ctv',
    1,
    'Normal1',
    '2025-01-05',
    null,
    'Phép J: dùng tháng 1 rút từ phần cũ'
  ),
  P(
    'P11',
    'nv2_minh',
    'Phan Văn Minh',
    'nv',
    2,
    'Night1',
    '2024-09-01',
    '1991-05-05',
    'Ca đêm 60→40, ca qua nửa đêm vào lễ',
    {
      nightPct: 60
    }
  ),
  P(
    'P12',
    'nv3_ngoc',
    'Trương Thị Ngọc',
    'nv',
    3,
    'Night2',
    '2023-03-01',
    '1990-10-10',
    '% đêm theo bậc 60 từ danh mục'
  ),
  P(
    'P13',
    'nv2_oanh',
    'Lý Thị Oanh',
    'nv',
    2,
    'Flex1',
    '2024-02-01',
    '1994-04-04',
    'Phụ cấp linh hoạt; OT giữ, làm bù mất'
  ),
  P('P14', 'ctv2_phu', 'Huỳnh Văn Phú', 'ctv', 2, 'Flex2', '2025-05-05', null, 'Giải trình Check-out muộn'),
  P(
    'P15',
    'nv2_quang',
    'Mai Văn Quang',
    'nv',
    2,
    'Normal1',
    '2024-04-01',
    '1993-02-02',
    'Trừ trễ / về sớm và giải trình [P6]'
  ),
  P(
    'P16',
    'nv2_rang',
    'Tô Thị Rạng',
    'nv',
    2,
    'Normal2',
    '2024-04-01',
    '1992-06-06',
    'Ân hạn Check-out 30 phút, kết quả giải trình'
  ),
  P('P17', 'nv1_son', 'Cao Văn Sơn', 'nv', 1, 'Normal1', '2025-07-01', '1996-08-08', 'Quên Check-in/out'),
  P('P18', 'nv2_thao', 'Lâm Thị Thảo', 'nv', 2, 'Normal1', '2024-01-08', '1990-12-12', 'Làm thêm OT'),
  P(
    'P19',
    'nv2_uyen',
    'Kiều Thị Uyên',
    'nv',
    2,
    'Flex2',
    '2024-05-20',
    '1995-05-15',
    'Giờ bù, nghỉ sẽ làm bù, OT bị giữ'
  ),
  P('P20', 'tts3_vy', 'Quách Thị Vy', 'tts', 3, 'Normal1', '2026-03-02', null, 'Giới hạn của TTS', {
    createAt: '2026-02-26T09:00'
  }),
  P(
    'P21',
    'tts1_xuan',
    'Thái Văn Xuân',
    'tts',
    1,
    'Normal1',
    '2025-09-01',
    '2003-10-05',
    'Đổi bậc, đổi loại TTS → NV',
    {
      changes: [
        { at: '2026-03-02T09:00', set: { level: 2 }, caseId: 'P21-01' },
        { at: '2026-07-01T09:00', set: { type: 'nv', level: 1, nightPct: 40 }, caseId: 'P21-02' }
      ]
    }
  ),
  P('P22', 'ctv1_yen', 'Đinh Thị Yến', 'ctv', 1, 'Normal1', '2025-08-04', null, 'Đổi bậc và đổi ca, % đêm CTV', {
    changes: [
      { at: '2026-09-01T09:00', set: { level: 3 }, caseId: 'P22-01' },
      { at: '2026-11-30T18:00', set: { shift: 'Night1' }, caseId: 'P22-02' }
    ]
  }),
  P('P23', 'nv1_bao', 'Hà Văn Bảo', 'nv', 1, 'Normal1', '2025-06-01', '1997-11-25', 'Nghỉ việc 10/11/2026', {
    changes: [
      { at: '2026-11-10T18:00', set: { resignedOn: '2026-11-10' }, caseId: 'P23-01' },
      { at: '2026-11-12T09:00', set: { locked: true }, caseId: 'P23-03' }
    ]
  }),
  P('P24', 'ctv1_cuong', 'Châu Văn Cường', 'ctv', 1, 'Normal1', '2025-02-10', null, 'Nghỉ việc 30/06/2026, đã khoá', {
    changes: [
      { at: '2026-06-30T18:00', set: { resignedOn: '2026-06-30' }, caseId: 'P24-02' },
      { at: '2026-07-01T09:00', set: { locked: true }, caseId: 'P24-02' }
    ]
  }),
  P(
    'P25',
    'nv2_dat',
    'Lương Văn Đạt',
    'nv',
    2,
    'Normal1',
    '2026-11-16',
    '1998-06-30',
    'Vào giữa tháng, hợp đồng ngắn theo thâm niên',
    {
      createAt: '2026-11-13T09:00'
    }
  ),
  P(
    'P26',
    'nv2_giao',
    'Ninh Thị Giao',
    'nv',
    2,
    'Normal1',
    '2024-10-07',
    '1993-09-09',
    'Vắng, nghỉ không lương, bỏ BH'
  ),
  P('P27', 'nv2_hoa', 'Văn Thị Hoa', 'nv', 2, 'Normal1', '2024-08-12', '1994-11-11', 'iSAT'),
  P('P28', 'nv2_kim', 'Âu Thị Kim', 'nv', 2, 'Normal1', '2023-05-15', '1992-03-03', 'Đi làm ngày lễ = OT [P1]'),
  P('P29', 'ctv2_lam', 'Khúc Văn Lâm', 'ctv', 2, 'Normal1', '2025-03-03', null, 'OT lễ có kéo dài, qua nửa đêm'),
  P('P30', 'nv1_mai', 'Triệu Thị Mai', 'nv', 1, 'Normal1', '2025-01-13', '1997-01-30', 'Tạm ứng [P7]'),
  P('P31', 'nv3_nam', 'Doãn Văn Nam', 'nv', 3, 'Normal1', '2023-09-04', '1989-07-07', 'KPI 5 thành phần'),
  P(
    'P32',
    'nv2_phat',
    'Ông Văn Phát',
    'nv',
    2,
    'Normal1',
    '2024-03-11',
    '1995-03-03',
    'Admin chấm công và ca do Admin chọn [P5]'
  ),
  P(
    'P33',
    'nv2_quynh',
    'Mạc Thị Quỳnh',
    'nv',
    2,
    'Normal1',
    '2024-06-03',
    '1994-12-10',
    'Các đường trạng thái của phép'
  ),
  P(
    'P34',
    'ctv1_sang',
    'Thân Văn Sáng',
    'ctv',
    1,
    'Normal1',
    '2025-06-16',
    null,
    'Cổng Check-in [P4], vùng định vị, lặp requestId'
  ),
  P(
    'P35',
    'nv4_tam',
    'Hứa Văn Tâm',
    'nv',
    4,
    'Normal1',
    '2022-01-10',
    '1988-08-18',
    'Khoản điền thêm, thuế luỹ tiến, thực lĩnh âm',
    {
      dependants: 2
    }
  ),
  P('P36', 'nv1_uy', 'Giang Văn Uy', 'nv', 1, 'Normal1', '2025-02-17', '1999-09-19', 'iDorm, không BH, hợp đồng ngắn', {
    idorm: true,
    insured: false,
    contract: 'short',
    changes: [{ at: '2026-12-06T09:00', set: { idorm: false }, caseId: 'P36-03' }]
  }),
  P('P37', 'nv2_van', 'Tạ Thị Vân', 'nv', 2, 'Normal1', '2024-07-01', '1996-07-17', 'Mép kỳ, lượt mở cuối tháng'),
  P('P38', 'tts5_xa', 'Bế Văn Xá', 'tts', 5, 'Night1', '2025-10-06', null, 'TTS ca đêm (30 %, không trả giờ nghỉ)'),
  P('P39', 'tts6_yen', 'Nông Thị Yên', 'tts', 6, 'Flex2', '2025-04-07', null, 'TTS ca linh hoạt'),
  P(
    'P40',
    'nv2_an',
    'Lục Văn An',
    'nv',
    2,
    'Normal2',
    '2026-05-10',
    '1996-01-25',
    'Sinh nhật tháng 1, nghỉ cuối tháng 1/2027',
    {
      createAt: '2026-05-07T09:00'
    }
  ),
  P('P41', 'nv1_be', 'Sầm Thị Bé', 'nv', 1, 'Normal1', '2025-11-03', '1998-03-14', 'Dùng hết phép, âm tháng 2/2027'),
  P(
    'P42',
    'nv2_chau',
    'Vi Thị Châu',
    'nv',
    2,
    'Normal1',
    '2025-04-01',
    '1993-08-08',
    'Nghỉ việc 12/02/2027, vẫn quyết toán',
    {
      changes: [{ at: '2027-02-12T18:00', set: { resignedOn: '2027-02-12' }, caseId: 'P42-01' }]
    }
  ),
  P(
    'P43',
    'nv2_duc',
    'La Văn Đức',
    'nv',
    2,
    'Night2',
    '2024-11-04',
    '1997-02-27',
    '% đêm của hồ sơ 60 bị bỏ từ tháng 11; ca đêm vào Tết',
    {
      nightPct: 60
    }
  ),
  P('P44', 'nv1_kha', 'Lò Văn Kha', 'nv', 1, null, '2026-12-01', '2000-01-15', 'Chưa được gán ca', {
    createAt: '2026-11-28T09:00',
    changes: [{ at: '2026-12-02T08:00', set: { shift: 'Normal1' }, caseId: 'P44-04' }]
  })
];

// Nhân sự nền: đi làm đủ ngày, giờ bấm ngẫu nhiên có hạt giống, mỗi NV/CTV hai ngày phép được duyệt
const B = (id?, u?, name?, type?, level?, shift?, start?, birthday?, leave?, extra: any = {}) => ({
  id,
  u,
  name,
  type,
  level,
  shift,
  start,
  birthday,
  bgLeave: leave,
  background: true,
  theme: 'Nhân sự nền',
  ...extra
});
const BACKGROUND = [
  B('B01', 'bg_nv1_a', 'Nguyễn Văn An', 'nv', 1, 'Normal1', '2024-02-05', '1995-01-20', ['2026-03-20', '2026-08-14']),
  B('B02', 'bg_nv1_b', 'Trần Thị Bích', 'nv', 1, 'Normal2', '2024-06-10', '1996-06-21', ['2026-05-22', '2026-11-27']),
  B('B03', 'bg_nv2_c', 'Lê Văn Công', 'nv', 2, 'Normal1', '2023-11-01', '1990-10-30', ['2026-07-10', '2027-01-02']),
  B('B04', 'bg_nv3_d', 'Phạm Thị Duyên', 'nv', 3, 'Normal1', '2022-04-18', '1987-04-01', ['2026-04-10', '2026-12-24']),
  B('B05', 'bg_nv1_e', 'Hoàng Văn Én', 'nv', 1, 'Flex1', '2025-01-06', '1999-12-31', ['2026-06-19', '2026-10-30']),
  B('B06', 'bg_nv2_f', 'Vũ Văn Phong', 'nv', 2, 'Night1', '2024-09-16', '1992-02-29', ['2026-09-11', '2027-02-19'], {
    nightPct: 40
  }),
  B('B07', 'bg_ctv1_g', 'Đỗ Thị Gấm', 'ctv', 1, 'Normal1', '2025-03-10', null, ['2026-06-05', '2026-12-18']),
  B('B08', 'bg_ctv2_h', 'Bùi Văn Hùng', 'ctv', 2, 'Normal2', '2024-12-02', null, ['2026-02-27', '2026-10-09']),
  B('B09', 'bg_ctv4_i', 'Ngô Thị Ích', 'ctv', 4, 'Normal1', '2023-01-09', null, ['2026-05-08', '2027-01-22']),
  B('B10', 'bg_ctv1_k', 'Đặng Văn Khoa', 'ctv', 1, 'Flex2', '2025-07-07', null, ['2026-09-25', '2026-11-13']),
  B('B11', 'bg_tts2_l', 'Phan Thị Lụa', 'tts', 2, 'Normal1', '2026-02-02', null, [], { createAt: '2026-01-29T09:00' }),
  B('B12', 'bg_tts4_m', 'Trương Văn Mạnh', 'tts', 4, 'Normal1', '2025-08-11', null, []),
  B('B13', 'bg_tts1_n', 'Lý Thị Nga', 'tts', 1, 'Normal2', '2026-06-15', null, [], { createAt: '2026-06-11T09:00' }),
  B('B14', 'bg_nv1_o', 'Mai Văn Ơn', 'nv', 1, 'Normal1', '2024-03-04', '1994-05-05', ['2026-10-23', '2027-02-26'], {
    dependants: 1
  })
];

const PAYROLL = [...PROTAGONISTS, ...BACKGROUND];
const byUser = Object.fromEntries([...ADMINS, ...PAYROLL].map(p => [p.u, p]));

module.exports = { ADMINS, PROTAGONISTS, BACKGROUND, PAYROLL, byUser };
