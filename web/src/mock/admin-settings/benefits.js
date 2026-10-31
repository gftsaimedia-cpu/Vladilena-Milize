// Dữ liệu giả: Cài đặt › Chế độ theo loại nhân sự (phụ cấp, lương KPI, iDorm và loại yêu cầu được gửi theo bậc).
// columns: cột của bảng "Phụ cấp và lương KPI" · kind 'pct' (ô %) | 'check' (ô tick) · money: số tiền cố định (₫)
// requests: cột của bảng "Được gửi yêu cầu". Mỗi bậc: values theo khoá cột, req theo khoá loại yêu cầu.

const level = (name, values, req) => ({ name, values, req });
const allow = (travel, diligence, flex, night, kpi, dorm) => ({
  'di-lai': travel,
  'chuyen-can': diligence,
  flex,
  'ca-dem': night,
  kpi,
  idorm: dorm
});
const req = (leave, isat, approved, ot, makeUpHour, makeUpDay, holiday) => ({
  'phep-nam': leave,
  isat,
  'nghi-duoc-duyet': approved,
  ot,
  'lam-bu-gio': makeUpHour,
  'lam-bu-ngay': makeUpDay,
  'ngay-le': holiday
});

export const BENEFITS = {
  columns: [
    { key: 'di-lai', label: 'Phụ cấp đi lại', kind: 'pct' },
    { key: 'chuyen-can', label: 'Phụ cấp chuyên cần', kind: 'pct' },
    { key: 'flex', label: 'Phụ cấp Flex', kind: 'pct' },
    { key: 'ca-dem', label: 'Phụ cấp ca đêm', kind: 'pct' },
    { key: 'kpi', label: 'Lương KPI', kind: 'check' },
    { key: 'idorm', label: 'iDorm', kind: 'check' }
  ],
  requests: [
    { key: 'phep-nam', label: 'Nghỉ phép năm' },
    { key: 'isat', label: 'iSAT' },
    { key: 'nghi-duoc-duyet', label: 'Nghỉ được duyệt' },
    { key: 'ot', label: 'OT' },
    { key: 'lam-bu-gio', label: 'Làm bù theo giờ' },
    { key: 'lam-bu-ngay', label: 'Làm bù cả ngày' },
    { key: 'ngay-le', label: 'Đi làm ngày lễ' }
  ],
  types: [
    {
      key: 'thuc-tap-sinh',
      name: 'Thực tập sinh',
      count: 9,
      levels: ['Bậc 1', 'Bậc 2', 'Bậc 3', 'Bậc 4', 'Bậc 5', 'Bậc 6'].map(n =>
        level(n, allow(0, 0, 10, 30, false, false), req(false, false, false, false, true, true, true))
      )
    },
    {
      key: 'chuyen-trach',
      name: 'Chuyên trách viên',
      count: 23,
      levels: ['Fresher', 'Practitioner', 'Advanced Practitioner', 'Senior Practitioner'].map(n =>
        level(n, allow(0, 0, 10, 30, true, false), req(true, false, false, true, true, true, true))
      )
    },
    {
      key: 'nhan-vien',
      name: 'Nhân viên',
      count: 38,
      levels: ['Nhân viên', 'Chuyên viên', 'Lead', 'HDO (Human Development Officer)'].map(n =>
        level(n, allow(15, 25, 20, 40, true, true), req(true, true, true, true, true, true, true))
      )
    }
  ]
};
