// Dữ liệu giả của ngăn kéo phiếu lương một người (phieu-*.html). Tiền là số đồng nguyên, số do máy chủ trả.
// Dòng: { label, kind: 'money' | 'days' | 'hours' | 'pct' | 'text', v } (money âm hiện có dấu trừ).
const L = (label, kind, v) => ({ label, kind, v });
const G = (title, lines) => ({ title, lines });

// Các dòng bằng 0 hoặc để trống (ẩn mặc định, bấm "Hiện … dòng bằng 0 hoặc để trống" để xem).
// key: để loại dòng đã có số trên phiếu khỏi danh sách này.
const ZERO_POOL = [
  ['nghi-khong-luong', 'Nghỉ không lương', 'days'],
  ['cong-bu', 'Công bù', 'hours'],
  ['tien-cong-bu', 'Tiền công bù', 'money'],
  ['nghi-phep', 'Nghỉ phép có lương', 'days'],
  ['tien-nghi-phep', 'Tiền nghỉ phép', 'money'],
  ['phep-du', 'Quyết toán phép dư', 'days'],
  ['tien-phep-du', 'Tiền quyết toán phép dư', 'money'],
  ['nghi-isat', 'Nghỉ thứ 7 hưởng lương · iSAT', 'days'],
  ['tien-isat', 'Tiền nghỉ thứ 7 · iSAT', 'money'],
  ['nghi-le', 'Nghỉ lễ hưởng lương', 'days'],
  ['tien-nghi-le', 'Tiền nghỉ lễ', 'money'],
  ['ot-15', 'OT ×1,5', 'hours'],
  ['ot-2', 'OT ×2', 'hours'],
  ['ot-3', 'OT ×3', 'hours'],
  ['tien-ot', 'Tiền OT', 'money'],
  ['lam-le', 'Làm việc ngày lễ', 'hours'],
  ['tien-lam-le', 'Tiền làm việc ngày lễ', 'money'],
  ['chuyen-can', 'Phụ cấp chuyên cần', 'money'],
  ['di-lai', 'Phụ cấp đi lại', 'money'],
  ['linh-hoat', 'Phụ cấp linh hoạt', 'money'],
  ['off-paid', 'Off Paid (ca đêm)', 'money'],
  ['thuong-ca-dem', 'Thưởng ca đêm', 'money'],
  ['phu-cap-khac', 'Phụ cấp khác', 'money'],
  ['di-muon', 'Đi muộn, về sớm', 'hours'],
  ['tien-tru-gio', 'Tiền trừ đi muộn, về sớm', 'money'],
  ['mien-thue', 'Các khoản miễn thuế', 'money'],
  ['giam-tru', 'Giảm trừ gia cảnh', 'money']
];

/** shown: các key đã có số trên phiếu → phần còn lại là dòng bằng 0. */
const zeroLines = shown =>
  ZERO_POOL.filter(([key]) => !shown.includes(key)).map(([, label, kind]) => ({ label, kind, v: 0 }));

const BH = 'Bảo hiểm bắt buộc (BHXH, BHYT, BHTN)';

// Lương Minh My, tháng 10/2026
const MY_OCT = {
  role: 'CTV · Fresher',
  sum: { gross: 7475769, insurance: 630000, tax: 0, advance: 2400000, net: 4445769 },
  groups: [
    G('Ngày công và lương cơ bản', [L('Ngày công', 'days', 27), L('Lương cơ bản theo ngày công', 'money', 6230769)]),
    G('Lương KPI', [
      L('Tổng điểm KPI', 'pct', 83),
      L('Lương KPI tối đa', 'money', 1500000),
      L('Lương KPI', 'money', 1245000)
    ]),
    G('Khấu trừ', [L(BH, 'money', -630000), L('Thuế TNCN', 'money', 0), L('Tạm ứng', 'money', -2400000)]),
    G('Khác', [L('Ngày phép năm còn lại', 'days', 17)])
  ],
  totals: [
    { label: 'Tổng thu nhập', v: 7475769 },
    { label: 'Thu nhập chịu thuế', v: 7475769 },
    { label: 'Thu nhập sau bảo hiểm', v: 6845769 },
    { label: 'Thực nhận', v: 4445769, hl: true }
  ],
  zero: zeroLines([])
};

// Hoàng Quang Châu, tháng 10/2026 (phiếu có cảnh báo AI)
const CHAU_OCT = {
  role: 'NV · Chuyên viên',
  sum: { gross: 15210000, insurance: 682500, tax: 0, advance: 2400000, net: 12127500 },
  groups: [
    G('Ngày công và lương cơ bản', [
      L('Ngày công', 'days', 26),
      L('Nghỉ không lương', 'days', 1),
      L('Lương cơ bản theo ngày công', 'money', 6500000)
    ]),
    G('Phụ cấp', [L('Phụ cấp chuyên cần', 'money', 1625000), L('Phụ cấp đi lại', 'money', 975000)]),
    G('Lương KPI', [
      L('Tổng điểm KPI', 'pct', 94),
      L('Lương KPI tối đa', 'money', 6500000),
      L('Lương KPI', 'money', 6110000)
    ]),
    G('Khấu trừ', [L(BH, 'money', -682500), L('Thuế TNCN', 'money', 0), L('Tạm ứng', 'money', -2400000)]),
    G('Khác', [L('Ngày phép năm còn lại', 'days', 16)])
  ],
  totals: [
    { label: 'Tổng thu nhập', v: 15210000 },
    { label: 'Thu nhập chịu thuế', v: 15210000 },
    { label: 'Thu nhập sau bảo hiểm', v: 14527500 },
    { label: 'Thực nhận', v: 12127500, hl: true }
  ],
  zero: zeroLines(['nghi-khong-luong', 'chuyen-can', 'di-lai'])
};

// Người mẫu chung, tháng 10/2026
const SAMPLE_OCT = {
  role: 'NV · Bậc 1',
  sum: { gross: 14150904, insurance: 630000, tax: 0, advance: 2025000, net: 11495904 },
  groups: [
    G('Ngày công và lương cơ bản', [
      L('Ngày công', 'days', 24),
      L('Nghỉ không lương', 'days', 1),
      L('Lương cơ bản theo ngày công', 'money', 5538462)
    ]),
    G('Nghỉ phép và ngày lễ', [
      L('Nghỉ phép có lương', 'days', 1),
      L('Tiền nghỉ phép', 'money', 230769),
      L('Nghỉ thứ 7 hưởng lương · iSAT', 'days', 1),
      L('Tiền nghỉ thứ 7 · iSAT', 'money', 230769)
    ]),
    G('Làm thêm giờ', [L('OT ×2', 'hours', 5), L('Tiền OT', 'money', 288462)]),
    G('Phụ cấp', [
      L('Phụ cấp chuyên cần', 'money', 1384615),
      L('Phụ cấp đi lại', 'money', 830769),
      L('Phụ cấp linh hoạt', 'money', 138462),
      L('Off Paid (ca đêm)', 'money', 112500),
      L('Thưởng ca đêm', 'money', 276923)
    ]),
    G('Lương KPI', [
      L('Tổng điểm KPI', 'pct', 85.6),
      L('Lương KPI tối đa', 'money', 6000000),
      L('Lương KPI', 'money', 5136000)
    ]),
    G('Đi muộn, về sớm, ra ngoài', [
      L('Đi muộn, về sớm', 'hours', 0.58),
      L('Tiền trừ đi muộn, về sớm', 'money', -16827)
    ]),
    G('Khấu trừ', [L(BH, 'money', -630000), L('Thuế TNCN', 'money', 0), L('Tạm ứng', 'money', -2025000)]),
    G('Khác', [L('Ngày phép năm còn lại', 'days', 22)])
  ],
  totals: [
    { label: 'Tổng thu nhập', v: 14150904 },
    { label: 'Thu nhập chịu thuế', v: 13147058 },
    { label: 'Thu nhập sau bảo hiểm', v: 13520904 },
    { label: 'Thực nhận', v: 11495904, hl: true }
  ],
  zero: zeroLines([
    'nghi-khong-luong',
    'nghi-phep',
    'tien-nghi-phep',
    'nghi-isat',
    'tien-isat',
    'ot-2',
    'tien-ot',
    'chuyen-can',
    'di-lai',
    'linh-hoat',
    'off-paid',
    'thuong-ca-dem',
    'di-muon',
    'tien-tru-gio'
  ])
};

// Lương Minh My, tháng 11/2026 (tính đến 26/11)
const MY_NOV = {
  role: 'CTV · Fresher',
  sum: { gross: 4615385, insurance: 630000, tax: 0, advance: 2030769, net: 1954616 },
  groups: [
    G('Ngày công và lương cơ bản', [L('Ngày công', 'days', 19), L('Lương cơ bản theo ngày công', 'money', 4384615)]),
    G('Nghỉ phép và ngày lễ', [L('Nghỉ lễ hưởng lương · 24/11', 'days', 1), L('Tiền nghỉ lễ', 'money', 230769)]),
    G('Lương KPI', [
      L('Tổng điểm KPI', 'text', 'chưa chấm đủ'),
      L('Lương KPI tối đa', 'money', 1500000),
      L('Lương KPI', 'money', 0)
    ]),
    G('Khấu trừ', [L(BH, 'money', -630000), L('Thuế TNCN', 'money', 0), L('Tạm ứng', 'money', -2030769)]),
    G('Khác', [L('Ngày phép năm còn lại', 'days', 17)])
  ],
  totals: [
    { label: 'Tổng thu nhập', v: 4615385 },
    { label: 'Thu nhập chịu thuế', v: 4615385 },
    { label: 'Thu nhập sau bảo hiểm', v: 3985385 },
    { label: 'Thực nhận', v: 1954616, hl: true }
  ],
  zero: zeroLines(['nghi-le', 'tien-nghi-le'])
};

const AI_WARNINGS = [
  { id: 'w1', text: 'Có Check-in vào ngày xin nghỉ' },
  { id: 'w2', text: 'Giờ khai OT không khớp Check-in/out' }
];

/** Bộ số của phiếu theo tháng và người. */
export const drawerBody = (month, username) => {
  if (month === '2026-11') return MY_NOV;
  if (username === 'demo_a_broken') return MY_OCT;
  if (username === 'demo_a_ot_check') return CHAU_OCT;
  return SAMPLE_OCT;
};

export { AI_WARNINGS };
