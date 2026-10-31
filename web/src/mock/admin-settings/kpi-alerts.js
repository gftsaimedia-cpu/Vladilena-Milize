// Dữ liệu giả: Cài đặt › Đánh giá KPI (cách tính tổng điểm) và Cảnh báo AI (ngưỡng).

export const KPI_RULES = {
  // note: chữ nhỏ dưới tỉ lệ
  weights: [
    { label: 'Base Wework', percent: 40, note: 'Phải từ 75 điểm' },
    { label: 'Người dùng', percent: 24, note: '' },
    { label: 'Đồng nghiệp', percent: 18, note: '' },
    { label: 'Quản lý trực tiếp', percent: 12, note: '' },
    { label: 'Tự đánh giá', percent: 6, note: 'Admin nhập' }
  ],
  total: 100,
  related: [
    {
      key: 'Điều kiện nhận lương KPI',
      desc: 'Base Wework từ 75 điểm và tổng điểm đạt mốc',
      link: 'Đánh giá KPI',
      to: '/admin/kpi'
    },
    {
      key: 'Lương KPI',
      desc: 'Lương KPI tối đa theo bậc × tổng điểm KPI · đã điều chỉnh',
      link: 'Cách tính lương',
      to: '/admin/cai-dat'
    },
    {
      key: 'Chính sách chưa chốt',
      desc: 'Tổng điểm dưới mức đạt · Base Wework dưới mức đạt',
      link: 'Cách tính lương',
      to: '/admin/cai-dat'
    },
    {
      key: 'Cảnh báo AI',
      desc: 'KPI tự chấm 100% liên tiếp từ 3 tháng · mức tự chấm tối đa 100%',
      link: 'Cảnh báo AI',
      to: '/admin/cai-dat/canh-bao'
    }
  ]
};

// Ngưỡng cảnh báo. kind: 'num' | 'money' | 'date' · status: 'proposed' (đề xuất) | 'locked' (đã chốt) · col: cột bên trái/phải
const t = (key, label, value, unit, status, kind = 'num') => ({ key, label, value, unit, status, kind });

export const ALERTS = {
  counts: { all: 24, proposed: 17, locked: 7 },
  groups: [
    {
      key: 'yeu-cau',
      name: 'Yêu cầu và báo công',
      col: 0,
      items: [
        t('isat-lan', 'iSAT từ lần thứ (trong tháng)', 4, 'lần', 'proposed'),
        t('nghi-duoc-duyet-lan', '"Nghỉ được duyệt" từ lần thứ (trong tháng)', 3, 'lần', 'proposed'),
        t('han-bao-cong', 'Hạn báo công (ngày của tháng sau)', 3, '', 'locked'),
        t('yeu-cau-tu-choi', 'Xét yêu cầu bị từ chối trong', 60, 'ngày', 'proposed'),
        t('so-rev', 'Số phiên bản (rev) từ', 3, '', 'proposed')
      ]
    },
    {
      key: 'cham-cong',
      name: 'Chấm công',
      col: 0,
      items: [
        t('thieu-checkin', 'Thiếu Check-in/out từ', 30, 'phút', 'proposed'),
        t('ngay-tinh-gio', 'Ngày bắt đầu tính giờ theo Check-in/out', '2026-11-01', '', 'locked', 'date')
      ]
    },
    {
      key: 'chuyen-can',
      name: 'Chuyên cần',
      col: 0,
      items: [
        t('mat-cc-nghi', 'Mất chuyên cần khi nghỉ từ', 3, 'ngày', 'locked'),
        t('mat-cc-gio', 'Mất chuyên cần khi giờ vượt ngưỡng từ', 24, 'giờ', 'locked')
      ]
    },
    {
      key: 'kpi',
      name: 'KPI',
      col: 0,
      items: [
        t('kpi-tu-cham-thang', 'KPI tự chấm 100% liên tiếp từ', 3, 'tháng', 'proposed'),
        t('kpi-tu-cham-max', 'Mức tự chấm tối đa', 100, '%', 'locked')
      ]
    },
    {
      key: 'ot',
      name: 'OT và ngày lễ',
      col: 1,
      items: [
        t('tran-le-ot', 'Trần giờ làm lễ + OT mỗi tháng', 16, 'giờ', 'locked'),
        t('tran-ot-ngay', 'Trần OT mỗi ngày', 4, 'giờ', 'locked'),
        t('sat-tran', 'Báo khi sát trần từ', 14, 'giờ', 'proposed'),
        t('ot-trung-vi', 'OT cao hơn trung vị nhóm', 2, 'lần', 'proposed'),
        t('ot-it-nhat', 'và OT ít nhất', 8, 'giờ', 'proposed'),
        t('nhom-it-nhat', 'Chỉ so khi nhóm có ít nhất', 5, 'người có OT', 'proposed')
      ]
    },
    {
      key: 'tien',
      name: 'Tiền',
      col: 1,
      items: [
        t('tac-dong-lon', 'Tác động tiền lớn từ', 500000, '₫', 'proposed', 'money'),
        t('sua-lech-tien', 'Số sửa trên phiếu lệch từ', 500000, '₫', 'proposed', 'money'),
        t('sua-lech-pct', 'và lệch từ', 20, '%', 'proposed'),
        t('doi-thuc-nhan-nguoi', 'Thay đổi làm đổi thực nhận từ', 20, '% số người', 'proposed'),
        t('doi-thuc-nhan-tong', 'Thay đổi làm tổng thực nhận đổi từ', 5000000, '₫', 'proposed', 'money'),
        t('cham-ngoai-chuc-vu', 'Thay đổi chạm người ngoài chức vụ từ', 1, 'người', 'proposed'),
        t('sua-tron-boi', 'Số sửa tròn theo bội của', 100000, '₫', 'proposed', 'money')
      ]
    }
  ]
};
