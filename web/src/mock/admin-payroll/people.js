// Nhân sự trong Bảng lương giả (trang 1 của mỗi tháng) và các phát hiện của AI.
// Tiền là số đồng nguyên, đúng số máy chủ sẽ trả; giao diện không tính lại.
// kind: 'tts' thực tập sinh | 'ctv' chuyên trách viên | 'nv' nhân viên.
// detail: bốn khoản thu nhập chia nhỏ cho chế độ "Xem đủ cột" { base, allowance, allowanceNote, ot, kpi, other }.

const detail = (base, allowance = 0, allowanceNote = '') => ({
  base,
  allowance,
  allowanceNote,
  ot: 0,
  kpi: 0,
  other: 0
});

// username, tên, nhãn "loại · bậc", loại, ngày công, tổng thu nhập, bảo hiểm, thuế, tạm ứng, thực nhận, chi tiết, số cảnh báo AI
// prettier-ignore
const person = (username, name, sub, kind, workdays, income, insurance, tax, advance, net, det, ai = 0) => ({
  username,
  name,
  sub,
  kind,
  workdays,
  income,
  insurance,
  tax,
  advance,
  net,
  detail: det,
  ai,
  status: 'calculated'
});

const FAIL_HP = { username: 'demo_a_hong_phuc', name: 'Tạ Hồng Phúc', sub: 'NV · Bậc 9', kind: 'nv', status: 'failed' };
const FAIL_BL = {
  username: 'demo_a_bao_lam',
  name: 'Dương Bảo Lam',
  sub: 'intern · Bậc 1',
  kind: 'tts',
  status: 'failed'
};

/** 2 phiếu chưa tính được: câu báo lỗi theo tháng. */
export function failedPeople(monthNo) {
  return [
    {
      ...FAIL_HP,
      problem: `Bậc "9" không có trong bảng bậc lương tháng ${monthNo}`,
      shortProblem: 'bậc lương "9" không hợp lệ'
    },
    {
      ...FAIL_BL,
      problem: 'Loại "intern" không có trong cài đặt loại nhân sự',
      shortProblem: 'loại nhân sự "intern" không hợp lệ'
    }
  ];
}

// prettier-ignore
export const PEOPLE_T10 = [
  person('demo_a_broken', 'Lương Minh My', 'CTV · Fresher', 'ctv', '27/26', 7475769, 630000, 0, 2400000, 4445769, detail(7475769)),
  person('demo_a_nhat_vy', 'Võ Nhật Vy', 'CTV · Practitioner', 'ctv', '27/26', 9050769, 630000, 0, 2400000, 6020769, detail(9050769)),
  person('demo_a_gia_hieu', 'Ngô Gia Hiếu', 'NV · Chuyên viên', 'nv', '27/26', 14650000, 682500, 0, 2600000, 11367500, detail(12650000, 2000000, 'Giữ chuyên cần')),
  person('demo_a_thu_tri', 'Kiều Thu Trí', 'NV · Chuyên viên', 'nv', '27/26', 14975000, 682500, 0, 2600000, 11692500, detail(12975000, 2000000, 'Giữ chuyên cần')),
  person('demo_a_ot_check', 'Hoàng Quang Châu', 'NV · Chuyên viên', 'nv', '26/26', 15210000, 682500, 0, 2400000, 12127500, detail(13210000, 2000000, 'Giữ chuyên cần'), 2),
  person('demo_a_nhat_mai', 'Mai Nhật Mai', 'NV · Chuyên viên', 'nv', '27/26', 15560000, 682500, 0, 2600000, 12277500, detail(13560000, 2000000, 'Giữ chuyên cần'), 2),
  person('demo_a_my_khoa', 'Dương Mỹ Khoa', 'NV · Chuyên viên', 'nv', '24/26', 14240000, 682500, 0, 2200000, 11357500, detail(12240000, 2000000, 'Giữ chuyên cần')),
  person('demo_a_nhat_chau', 'Nguyễn Nhật Châu', 'NV · Chuyên viên', 'nv', '27/26', 15495000, 682500, 0, 2600000, 12212500, detail(13495000, 2000000, 'Giữ chuyên cần')),
  person('demo_a_minh_quynh', 'Chu Minh Quỳnh', 'NV · Nhân viên', 'nv', '24/26', 11169231, 630000, 0, 1846154, 8693077, detail(9323077, 1846154, 'Giữ chuyên cần'), 1),
  person('demo_a_phuong_quynh', 'Kiều Phương Quỳnh', 'NV · Chuyên viên', 'nv', '25/26', 14905000, 682500, 0, 2200000, 12022500, detail(12905000, 2000000, 'Giữ chuyên cần')),
  person('demo_a_hong_binh', 'Hoàng Hồng Bình', 'NV · Chuyên viên', 'nv', '24/26', 13055000, 682500, 0, 2000000, 10372500, detail(11055000, 2000000, 'Giữ chuyên cần'), 1),
  person('demo_a_ngoc_ha', 'Đặng Ngọc Hà', 'NV · Chuyên viên', 'nv', '26/26', 14990625, 682500, 0, 2000000, 12308125, detail(12990625, 2000000, 'Giữ chuyên cần'), 1)
];

// prettier-ignore
export const PEOPLE_T11 = [
  person('demo_a_broken', 'Lương Minh My', 'CTV · Fresher', 'ctv', '19/26', 4615385, 630000, 0, 2030769, 1954616, detail(4615385)),
  person('demo_a_nhat_vy', 'Võ Nhật Vy', 'CTV · Practitioner', 'ctv', '20/26', 4759615, 630000, 0, 2146154, 1983461, detail(4759615)),
  person('demo_a_gia_hieu', 'Ngô Gia Hiếu', 'NV · Chuyên viên', 'nv', '18/26', 6550000, 682500, 0, 2200000, 3667500, detail(4750000, 1800000, 'Giữ chuyên cần')),
  person('demo_a_thu_tri', 'Kiều Thu Trí', 'NV · Chuyên viên', 'nv', '18/26', 6550000, 682500, 0, 2400000, 3467500, detail(4750000, 1800000, 'Giữ chuyên cần')),
  person('demo_a_ot_check', 'Hoàng Quang Châu', 'NV · Chuyên viên', 'nv', '20/26', 7250000, 682500, 0, 2400000, 4167500, detail(5250000, 2000000, 'Giữ chuyên cần')),
  person('demo_a_nhat_mai', 'Mai Nhật Mai', 'NV · Chuyên viên', 'nv', '20/26', 7250000, 682500, 0, 2400000, 4167500, detail(5250000, 2000000, 'Giữ chuyên cần')),
  person('demo_a_minh_quynh', 'Chu Minh Quỳnh', 'NV · Nhân viên', 'nv', '20/26', 6692308, 630000, 0, 2215385, 3846923, detail(4846154, 1846154, 'Giữ chuyên cần')),
  person('demo_a_gia_son', 'Phạm Gia Sơn', 'CTV · Practitioner', 'ctv', '20/26', 4846154, 0, 0, 2215385, 2630769, detail(4846154)),
  person('demo_a_tuan_quan', 'La Tuấn Quân', 'NV · HDO', 'nv', '20/26', 8365385, 787500, 0, 0, 7577885, detail(8365385)),
  person('demo_a_khanh_dat', 'Ngô Khánh Đạt', 'CTV · Advanced Practitioner', 'ctv', '20/26', 5307692, 630000, 0, 2215385, 2462307, detail(5307692)),
  person('demo_a_anh_uyen', 'Võ Anh Uyên', 'CTV · Practitioner', 'ctv', '20/26', 5192308, 630000, 0, 2215385, 2346923, detail(5192308)),
  person('demo_a_duc_ha', 'Vũ Đức Hà', 'NV · Nhân viên', 'nv', '20/26', 11192308, 630000, 0, 2215385, 8346923, detail(11192308))
];

// Phát hiện của AI ở lần tính 1 (tháng 10): 19 nhân sự, 25 phát hiện chưa xử lý.
// Người ở trang 1 của Bảng lương mang đúng username của dòng đó.
const finding = (username, name, texts) => ({ username, name, items: texts });
// prettier-ignore
export const FINDINGS_T10 = [
  finding('demo_a_ot_check', 'Hoàng Quang Châu', ['Có Check-in vào ngày xin nghỉ', 'Giờ khai OT không khớp Check-in/out']),
  finding('demo_a_nhat_mai', 'Mai Nhật Mai', ['Gửi sau hạn', 'Yêu cầu bị sửa nhiều lần']),
  finding('demo_a_minh_quynh', 'Chu Minh Quỳnh', ['"Nghỉ được duyệt" nhiều lần trong tháng']),
  finding('demo_a_hong_binh', 'Hoàng Hồng Bình', ['Yêu cầu làm đổi phụ cấp chuyên cần']),
  finding('demo_a_hong_phuc', 'Tạ Hồng Phúc', ['Chưa có ca cố định', 'Phép năm âm']),
  finding('demo_a_ngoc_ha', 'Đặng Ngọc Hà', ['Giờ khai OT không khớp Check-in/out']),
  finding('demo_a_tuan_quan', 'La Tuấn Quân', ['OT cao hơn nhiều so với nhóm', 'Số sửa trên phiếu giống một khoản cộng thêm']),
  finding('demo_b_thu_binh', 'Lê Thu Bình', ['iSAT nhiều lần trong tháng']),
  finding('demo_b_quang_quan', 'Tạ Quang Quân', ['Tự đánh giá KPI 100% nhiều tháng liền']),
  finding('demo_b_bao_vy', 'Phan Bảo Vy', ['Số sửa trên phiếu lệch nhiều so với số máy tính']),
  finding('demo_b_minh_lam', 'Bùi Minh Lam', ['Gửi sau hạn']),
  finding('demo_b_ngoc_nga', 'Kiều Ngọc Nga', ['Tài khoản đã khoá còn yêu cầu chờ xử lý']),
  finding('demo_b_my_thao', 'Phạm Mỹ Thảo', ['Thực nhận ≤ 0']),
  finding('demo_b_thanh_hanh', 'Dương Thanh Hạnh', ['Thiếu ngày vào làm']),
  finding('demo_b_thanh_tam', 'Phạm Thanh Tâm', ['OT chờ xử lý khi còn làm bù chờ xử lý trước đó']),
  finding('demo_b_bao_mai', 'Trương Bảo Mai', ['OT cao hơn nhiều so với nhóm', 'Sát trần OT và làm ngày lễ']),
  finding('demo_b_hai_phuc', 'La Hải Phúc', ['OT cao hơn nhiều so với nhóm', 'Sát trần OT và làm ngày lễ']),
  finding('demo_b_tuan_giang', 'Đặng Tuấn Giang', ['Chưa có ca cố định']),
  finding('demo_b_thu_nam', 'Lý Thu Nam', ['Yêu cầu cùng loại vừa bị từ chối'])
];
