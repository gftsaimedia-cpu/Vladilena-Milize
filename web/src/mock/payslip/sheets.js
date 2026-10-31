// Dữ liệu giả của bản in A4 (2 trang mỗi phiếu): trang 1 = đầu phiếu + chấm công từng ngày, trang 2 = tổng hợp.
// Mọi số là số máy chủ trả (đồng nguyên); giao diện chỉ định dạng, không tính.
// Dòng của bảng tổng hợp viết gọn [nhãn, theo quy chế, thực tế, in đậm?]; ô là số, chữ hoặc null (để trống).
import { DAYS_MY_NOV, DAYS_MY_OCT, DAYS_SAMPLE_OCT } from './days.js';

const section = (title, rows) => ({
  title,
  rows: rows.map(r => (Array.isArray(r) ? { label: r[0], std: r[1], act: r[2], b: !!r[3] } : r))
});
const total = (label, value, k = false) => ({ label, value, k });

// ---- Lương Minh My, tháng 10/2026 (phiếu chính thức) ----
const MY_OCT = {
  from: '2026-10-01',
  to: '2026-10-31',
  stdDays: 26,
  days: DAYS_MY_OCT,
  stats: { count: 27, flex: 0, night: 0, leave: 0, isat: 0, unpaid: 0, otHours: 0, short: 0 },
  sections: [
    section('Ngày công và lương cơ bản', [
      ['Ngày công tháng 10', 26, 27],
      ['Lương cơ bản', 6000000, 6230769, true],
      ['Nghỉ không lương (ngày)', null, 0]
    ]),
    section('Nghỉ phép và ngày lễ', [
      ['Nghỉ phép có lương (ngày)', 0, 0],
      ['Quyết toán phép dư (ngày)', 0, 0],
      ['Nghỉ thứ 7 hưởng lương · iSAT (ngày)', 0, 0],
      ['Nghỉ lễ hưởng lương (ngày)', 0, 0]
    ]),
    section('Làm thêm giờ', [
      ['OT ×1,5 · ×2 · ×3 (giờ)', '0 · 0 · 0', null],
      ['Tiền OT', null, 0]
    ]),
    section('Phụ cấp', [
      ['Chuyên cần (0% lương cơ bản)', 0, 0],
      ['Đi lại (0% lương cơ bản)', 0, 0],
      ['Linh hoạt (10% lương cơ bản)', 600000, 0],
      ['Off Paid (ca đêm)', 975000, 0],
      ['Thưởng ca đêm (30% lương cơ bản)', 1800000, 0],
      ['Tổng phụ cấp', null, 0]
    ]),
    section('Lương KPI', [
      ['Điểm 5 thành phần', '—', null],
      ['Tổng điểm KPI', '83%', null],
      ['Lương KPI (tối đa → thực tế)', 1500000, 1245000, true]
    ]),
    section('Đi muộn, về sớm, ra ngoài', [['Giờ và tiền bị trừ', 0, 0]])
  ],
  totals: [
    total('Tổng thu nhập', 7475769, true),
    total('Các khoản miễn thuế', 0),
    total('Thu nhập chịu thuế', 7475769),
    total('Bảo hiểm bắt buộc 10,5% · BHXH 8%, BHTN 1%, BHYT 1,5%', 630000),
    total('Thu nhập sau bảo hiểm', 6845769, true),
    total('Thuế TNCN', 0),
    total('Tạm ứng', 2400000)
  ],
  net: 4445769,
  leaveLeft: 17
};

// ---- Lương Minh My, tháng 11/2026 (tính đến 26/11) ----
const MY_NOV = {
  from: '2026-11-01',
  to: '2026-11-30',
  stdDays: 26,
  days: DAYS_MY_NOV,
  stats: { count: 19, flex: 0, night: 0, leave: 0, isat: 0, unpaid: 0, otHours: 0, short: 0 },
  sections: [
    section('Ngày công và lương cơ bản', [
      ['Ngày công tháng 11', 26, 19],
      ['Lương cơ bản', 6000000, 4384615, true],
      ['Nghỉ không lương (ngày)', null, 0]
    ]),
    section('Nghỉ phép và ngày lễ', [
      ['Nghỉ phép có lương (ngày)', 0, 0],
      ['Quyết toán phép dư (ngày)', 0, 0],
      ['Nghỉ thứ 7 hưởng lương · iSAT (ngày)', 0, 0],
      ['Nghỉ lễ hưởng lương · 24/11', '1 ngày', 230769]
    ]),
    section('Làm thêm giờ', [
      ['OT ×1,5 · ×2 · ×3 (giờ)', '0 · 0 · 0', null],
      ['Tiền OT', null, 0]
    ]),
    section('Phụ cấp', [
      ['Chuyên cần (0% lương cơ bản)', 0, 0],
      ['Đi lại (0% lương cơ bản)', 0, 0],
      ['Linh hoạt (10% lương cơ bản)', 600000, 0],
      ['Off Paid (ca đêm)', 975000, 0],
      ['Thưởng ca đêm (30% lương cơ bản)', 1800000, 0],
      ['Tổng phụ cấp', null, 0]
    ]),
    section('Lương KPI', [
      ['Điểm 5 thành phần', 'chưa chấm đủ', null],
      ['Tổng điểm KPI', '0%', null],
      ['Lương KPI (tối đa → thực tế)', 1500000, 0, true]
    ]),
    section('Đi muộn, về sớm, ra ngoài', [['Giờ và tiền bị trừ', 0, 0]])
  ],
  totals: [
    total('Tổng thu nhập', 4615385, true),
    total('Các khoản miễn thuế', 0),
    total('Thu nhập chịu thuế', 4615385),
    total('Bảo hiểm bắt buộc 10,5% · BHXH 8%, BHTN 1%, BHYT 1,5%', 630000),
    total('Thu nhập sau bảo hiểm', 3985385, true),
    total('Thuế TNCN', 0),
    total('Tạm ứng', 2030769)
  ],
  net: 1954616,
  leaveLeft: 17
};

// ---- Người mẫu chung, tháng 10/2026 (đủ ca Flex, Night, nghỉ phép, iSAT, OT, trừ giờ) ----
const SAMPLE_OCT = {
  from: '2026-10-01',
  to: '2026-10-31',
  stdDays: 26,
  days: DAYS_SAMPLE_OCT,
  stats: { count: 24, flex: 3, night: 3, leave: 1, isat: 1, unpaid: 1, otHours: 5, short: 0.58 },
  sections: [
    section('Ngày công và lương cơ bản', [
      ['Ngày công tháng 10', 26, 24],
      ['Lương cơ bản', 6000000, 5538462, true],
      ['Nghỉ không lương (ngày)', null, 1]
    ]),
    section('Nghỉ phép và ngày lễ', [
      ['Nghỉ phép có lương (ngày)', 1, 230769],
      ['Quyết toán phép dư (ngày)', 0, 0],
      ['Nghỉ thứ 7 hưởng lương · iSAT (ngày)', 1, 230769],
      ['Nghỉ lễ hưởng lương (ngày)', 0, 0]
    ]),
    section('Làm thêm giờ', [
      ['OT ×1,5 · ×2 · ×3 (giờ)', '0 · 5 · 0', null],
      ['Tiền OT', null, 288462]
    ]),
    section('Phụ cấp', [
      ['Chuyên cần (25% lương cơ bản)', 1500000, 1384615],
      ['Đi lại (15% lương cơ bản)', 900000, 830769],
      ['Linh hoạt (20% lương cơ bản)', 1200000, 138462],
      ['Off Paid (ca đêm)', 975000, 112500],
      ['Thưởng ca đêm (40% hoặc 60% lương cơ bản)', 2400000, 276923],
      ['Tổng phụ cấp', null, 2743269]
    ]),
    section('Lương KPI', [
      {
        parts: [
          ['Base Wework (40%)', '85%'],
          ['Người dùng (24%)', '90%'],
          ['Đồng nghiệp (18%)', '80%'],
          ['Quản lý trực tiếp (12%)', '85%'],
          ['Tự đánh giá (6%)', '90%']
        ]
      },
      ['Tổng điểm KPI', '85,6%', null],
      ['Lương KPI (tối đa → thực tế)', 6000000, 5136000, true]
    ]),
    section('Đi muộn, về sớm, ra ngoài', [['Giờ và tiền bị trừ', 0.58, -16827]])
  ],
  totals: [
    total('Tổng thu nhập', 14150904, true),
    total('Các khoản miễn thuế', 1003846),
    total('Thu nhập chịu thuế', 13147058),
    total('Bảo hiểm bắt buộc 10,5% · BHXH 8%, BHTN 1%, BHYT 1,5%', 630000),
    total('Thu nhập sau bảo hiểm', 13520904, true),
    total('Thuế TNCN', 0),
    total('Tạm ứng', 2025000)
  ],
  net: 11495904,
  leaveLeft: 22
};

/** Bộ dữ liệu bản in theo tháng và người (người trong thiết kế dùng số của thiết kế, người khác dùng bản mẫu chung). */
export const sheetBody = (month, username) => {
  if (month === '2026-11') return MY_NOV;
  return username === 'demo_a_broken' ? MY_OCT : SAMPLE_OCT;
};
