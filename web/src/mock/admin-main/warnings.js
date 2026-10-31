// Dữ liệu giả: cảnh báo của Trợ lý AI (12 cảnh báo, xếp theo mức độ).
// level: 'Cao' | 'Trung bình'.  thresholdLabel: loại ngưỡng của quy tắc.
// text: câu mô tả sau tên nhân sự; {money} được thay bằng số tiền `money` (đồng nguyên).
// brief: cách viết gọn ở thẻ "Cảnh báo AI" của Tổng quan (rule viết lại, text gọn hơn).
// detail: nội dung "Lý do AI cảnh báo" (hộp thoại ở Trợ lý AI, ngăn kéo ở Yêu cầu).
//   metrics/criteria: { label|text, value | money }; criteria.kind: 'da-chot' | 'de-xuat' | null (không có ngưỡng số).

const NO_THRESHOLD = [{ text: 'Quy tắc này không có ngưỡng số' }];
const NO_SHIFT = {
  fact: 'Có Check-in/out nhưng không gán được ca nên chưa tính được giờ công.',
  metrics: [],
  criteria: [
    {
      text: 'Ngày bắt đầu tính giờ theo Check-in/out',
      value: '01/11/2026',
      kind: 'da-chot',
      basis: 'Căn cứ: quyết định 14/10/2026, giờ công tính theo Check-in/out từ 01/11/2026'
    }
  ],
  link: { label: 'Mở hồ sơ để gán ca', to: '/admin/nhan-su' }
};
const OT_CAP = [
  {
    text: 'Trần giờ làm lễ + OT mỗi tháng',
    value: '16 giờ',
    kind: 'da-chot',
    basis: 'Căn cứ: LUAT-DU-AN 5.3; THAO-LUAN D9 (15/10/2026)'
  },
  {
    text: 'Báo khi sát trần từ',
    value: '14 giờ',
    kind: 'de-xuat',
    basis: 'Căn cứ: đề xuất báo từ 87,5% của trần 16 giờ'
  },
  {
    text: 'Trần OT mỗi ngày',
    value: '4 giờ',
    kind: 'da-chot',
    basis: 'Căn cứ: LUAT-DU-AN 5.3; THAO-LUAN D9 (15/10/2026)'
  }
];
const HOLIDAY = {
  fact: 'Đi làm ngày lễ là khoản tiền lớn, quy tắc ×3 ngày lễ đang chờ công ty xác nhận.',
  metrics: [{ label: 'Số giờ', value: 9 }],
  criteria: [
    {
      text: 'Quy tắc này không có ngưỡng số',
      basis: 'Căn cứ: IA v3: mọi yêu cầu Đi làm ngày lễ đều cần xem (tiền lớn, ×3 đang chờ xác nhận)'
    }
  ],
  link: { label: 'Mở Chấm công', to: '/admin/cham-cong' }
};
const bigMoney = money => ({
  fact: 'Nếu đồng ý, tổng thu nhập tăng',
  factMoney: money,
  metrics: [{ label: 'Chênh tổng thu nhập', money }],
  criteria: [
    {
      text: 'Báo khi tác động tiền từ',
      money: 500000,
      kind: 'de-xuat',
      basis: 'Căn cứ: IA v3 gợi ý 500.000 ₫ · chênh giữa đồng ý và từ chối, giả định các yêu cầu khác được đồng ý'
    }
  ],
  link: { label: 'Mở yêu cầu', to: '/admin/yeu-cau' }
});
const NEGATIVE_LEAVE = (used, added) => ({
  fact: `Đã dùng ${used} ngày, được cộng ${added} ngày, phép năm đang âm.`,
  metrics: [
    { label: 'Đã dùng', value: `${used} ngày` },
    { label: 'Được cộng', value: `${added} ngày` }
  ],
  criteria: NO_THRESHOLD,
  link: { label: 'Mở hồ sơ', to: '/admin/nhan-su' }
});

export const WARNINGS = [
  {
    id: 'w1',
    level: 'Cao',
    rule: 'Chưa có ca cố định',
    thresholdLabel: 'ngưỡng đã chốt',
    person: 'Tạ Hồng Phúc',
    text: 'có Check-in/out nhưng không có ca để tính giờ công',
    fixTo: '/admin/nhan-su',
    brief: { text: 'Tạ Hồng Phúc · có Check-in/out nhưng không có ca để tính giờ' },
    detail: { role: 'Nhân viên', month: '2026-11', ...NO_SHIFT }
  },
  {
    id: 'w2',
    level: 'Cao',
    rule: 'Phép năm âm',
    thresholdLabel: 'không có ngưỡng',
    person: 'Tạ Hồng Phúc',
    text: 'đã dùng 0 ngày, được cộng −14 ngày, còn âm 14 ngày',
    fixTo: '/admin/nhan-su',
    brief: { text: 'Tạ Hồng Phúc · phép năm được cộng là −14 ngày' },
    detail: { role: 'Nhân viên', month: '2026-11', ...NEGATIVE_LEAVE(0, '−14') }
  },
  {
    id: 'w3',
    level: 'Cao',
    rule: 'Sát trần OT và làm ngày lễ',
    thresholdLabel: 'ngưỡng đề xuất',
    person: 'Ngô Khánh Đạt',
    text: '· 24/11: 16/16 giờ làm lễ và OT trong tháng; riêng ngày này 8 giờ, OT tối đa 4 giờ/ngày',
    fixTo: '/admin/cham-cong',
    brief: { rule: 'Gần chạm trần OT và làm ngày lễ', text: 'Ngô Khánh Đạt · 16/16 giờ trong tháng' },
    detail: {
      role: 'Advanced Practitioner',
      month: '2026-11',
      fact: 'Đã 16 giờ làm lễ + OT trong tháng (tối đa 16 giờ). Riêng ngày này 8 giờ, OT tối đa 4 giờ/ngày.',
      metrics: [
        { label: 'Giờ làm lễ + OT cộng dồn', value: 16 },
        { label: 'Giờ trong ngày', value: 8 }
      ],
      criteria: OT_CAP,
      link: { label: 'Mở Chấm công', to: '/admin/cham-cong' }
    }
  },
  {
    id: 'w4',
    level: 'Cao',
    rule: 'Sát trần OT và làm ngày lễ',
    thresholdLabel: 'ngưỡng đề xuất',
    person: 'Võ Anh Uyên',
    text: '· 24/11: 14/16 giờ làm lễ và OT trong tháng; riêng ngày này 8 giờ',
    fixTo: '/admin/cham-cong',
    brief: { rule: 'Gần chạm trần OT và làm ngày lễ', text: 'Võ Anh Uyên · 14/16 giờ trong tháng' },
    detail: {
      role: 'Practitioner',
      month: '2026-11',
      fact: 'Đã 14 giờ làm lễ + OT trong tháng (tối đa 16 giờ). Riêng ngày này 8 giờ, OT tối đa 4 giờ/ngày.',
      metrics: [
        { label: 'Giờ làm lễ + OT cộng dồn', value: 14 },
        { label: 'Giờ trong ngày', value: 8 }
      ],
      criteria: OT_CAP,
      link: { label: 'Mở Chấm công', to: '/admin/cham-cong' }
    }
  },
  {
    id: 'w5',
    level: 'Cao',
    rule: 'Chưa có ca cố định',
    thresholdLabel: 'ngưỡng đã chốt',
    person: 'Đặng Tuấn Giang',
    text: 'có Check-in/out nhưng không có ca để tính giờ công',
    fixTo: '/admin/nhan-su',
    detail: { role: '', month: '2026-11', ...NO_SHIFT }
  },
  {
    id: 'w6',
    level: 'Cao',
    rule: 'Phép năm âm',
    thresholdLabel: 'không có ngưỡng',
    person: 'Nguyễn Anh Bình',
    text: 'đã dùng 2 ngày, được cộng 1 ngày, còn âm 1 ngày',
    fixTo: '/admin/nhan-su',
    detail: { role: '', month: '2026-11', ...NEGATIVE_LEAVE(2, 1) }
  },
  {
    id: 'w7',
    level: 'Trung bình',
    rule: 'Đi làm ngày lễ',
    thresholdLabel: 'không có ngưỡng',
    person: 'Ngô Khánh Đạt',
    text: '· 24/11: số tiền lớn, quy tắc ×3 ngày lễ chưa được xác nhận',
    fixTo: '/admin/cham-cong',
    detail: { role: 'Advanced Practitioner', month: '2026-11', ...HOLIDAY }
  },
  {
    id: 'w8',
    level: 'Trung bình',
    rule: 'Tác động tiền lớn',
    thresholdLabel: 'ngưỡng đề xuất',
    person: 'Ngô Khánh Đạt',
    text: '· 24/11: thực nhận tăng {money} nếu đồng ý',
    money: 692308,
    fixTo: '/admin/yeu-cau',
    detail: { role: 'Advanced Practitioner', month: '2026-11', ...bigMoney(692308) }
  },
  {
    id: 'w9',
    level: 'Trung bình',
    rule: 'Đi làm ngày lễ',
    thresholdLabel: 'không có ngưỡng',
    person: 'Võ Anh Uyên',
    text: '· 24/11: số tiền lớn, quy tắc ×3 ngày lễ chưa được xác nhận',
    fixTo: '/admin/cham-cong',
    detail: { role: 'Practitioner', month: '2026-11', ...HOLIDAY }
  },
  {
    id: 'w10',
    level: 'Trung bình',
    rule: 'Tác động tiền lớn',
    thresholdLabel: 'ngưỡng đề xuất',
    person: 'Võ Anh Uyên',
    text: '· 24/11: thực nhận tăng {money} nếu đồng ý',
    money: 553846,
    fixTo: '/admin/yeu-cau',
    detail: { role: 'Practitioner', month: '2026-11', ...bigMoney(553846) }
  },
  {
    id: 'w11',
    level: 'Trung bình',
    rule: 'Giờ OT khai dài hơn Check-out',
    thresholdLabel: 'không có ngưỡng',
    person: 'Trương Bảo Mai',
    text: '· 06/11: giờ OT khai dài hơn giờ Check-out thực tế',
    fixTo: '/admin/cham-cong',
    detail: {
      role: 'Chuyên viên',
      month: '2026-11',
      fact: 'Giờ OT khai dài hơn giờ Check-out thực tế.',
      metrics: [],
      criteria: NO_THRESHOLD,
      link: { label: 'Mở Chấm công', to: '/admin/cham-cong' }
    }
  },
  {
    id: 'w12',
    level: 'Trung bình',
    rule: 'Thiếu ngày bắt đầu làm',
    thresholdLabel: 'không có ngưỡng',
    person: 'Lê Hoàng Nam',
    text: 'chưa có ngày bắt đầu làm nên chưa xác định được ngày công chuẩn',
    fixTo: '/admin/nhan-su',
    detail: {
      role: '',
      month: '2026-11',
      fact: 'Chưa có ngày bắt đầu làm nên chưa xác định được ngày công chuẩn.',
      metrics: [],
      criteria: NO_THRESHOLD,
      link: { label: 'Mở hồ sơ', to: '/admin/nhan-su' }
    }
  }
];

export const WARNING_META = {
  rulesChecked: 22,
  people: 71,
  computedAt: '2026-11-26T12:06',
  pageSize: 8,
  notice: {
    text: '1 quy tắc chưa chạy: cài đặt Đánh giá KPI chưa có % Tự đánh giá',
    link: { label: 'Mở cài đặt KPI', to: '/admin/cai-dat/kpi' }
  }
};
