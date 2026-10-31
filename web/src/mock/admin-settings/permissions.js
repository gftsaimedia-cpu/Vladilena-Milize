// Dữ liệu giả: Cài đặt › Phân quyền (vai trò, tài khoản, cách xử lý yêu cầu chưa được đồng ý).

// Khu vực và các mức quyền có thể chọn. levels: ['none','edit'] = chỉ Không / Sửa. scoped: có cột Phạm vi.
export const PERM_AREAS = [
  {
    group: 'Màn làm việc',
    items: [
      { key: 'nhan-su', name: 'Nhân sự', levels: ['none', 'view', 'edit'], scoped: true },
      { key: 'cham-cong', name: 'Chấm công & phép', levels: ['none', 'view', 'edit'], scoped: false },
      { key: 'bang-luong', name: 'Bảng lương', levels: ['none', 'view', 'edit'], scoped: true },
      { key: 'kpi', name: 'Đánh giá KPI', levels: ['none', 'edit'], scoped: false },
      { key: 'bao-cao', name: 'Báo cáo', levels: ['none', 'view', 'edit'], scoped: false }
    ]
  },
  {
    group: 'Cài đặt',
    items: [
      { key: 'cach-tinh', name: 'Cách tính lương & chế độ', levels: ['none', 'view', 'edit'], scoped: false },
      { key: 'bao-hiem-thue', name: 'Bảo hiểm & thuế', levels: ['none', 'view', 'edit'], scoped: false },
      { key: 'lich-ca', name: 'Lịch, ca & chấm công', levels: ['none', 'view', 'edit'], scoped: false },
      { key: 'phan-quyen', name: 'Phân quyền & tài khoản', levels: ['none', 'edit'], scoped: false }
    ]
  }
];
export const PERM_LEVEL_LABEL = { none: 'Không', view: 'Xem', edit: 'Sửa' };
export const PERM_SCOPES = ['Tất cả', 'Nhóm mình quản lý', 'Chỉ bản thân'];

export const PERM_REQUESTS = [
  { key: 'phep-nam', label: 'Nghỉ phép năm' },
  { key: 'isat', label: 'iSAT' },
  { key: 'nghi-duoc-duyet', label: 'Nghỉ được duyệt' },
  { key: 'ot', label: 'OT' },
  { key: 'lam-bu-gio', label: 'Làm bù theo giờ' },
  { key: 'lam-bu-ngay', label: 'Làm bù cả ngày' },
  { key: 'ngay-le', label: 'Đi làm ngày lễ' }
];
export const PERM_OTHER = [
  { key: 'chot-cong', label: 'Chốt công' },
  { key: 'khoa-ky', label: 'Khoá kỳ lương' },
  { key: 'ngan-hang', label: 'Xem số tài khoản ngân hàng, CCCD' }
];

// areas: khoá khu vực → [mức quyền, phạm vi]; requests/other: khoá → được hay không
const flags = (list, on) => Object.fromEntries(list.map(i => [i.key, on === true || on.includes(i.key)]));
const areas = map =>
  Object.fromEntries(Object.entries(map).map(([k, [value, scope]]) => [k, { value, scope: scope || 'Tất cả' }]));
const ALL_REQ = PERM_REQUESTS.map(r => r.key);

export const ROLES = [
  {
    key: 'admin',
    name: 'Admin',
    note: '2 tài khoản',
    locked: true,
    areas: areas({
      'nhan-su': ['edit'],
      'cham-cong': ['edit'],
      'bang-luong': ['edit'],
      kpi: ['edit'],
      'bao-cao': ['edit'],
      'cach-tinh': ['edit'],
      'bao-hiem-thue': ['edit'],
      'lich-ca': ['edit'],
      'phan-quyen': ['edit']
    }),
    requests: flags(PERM_REQUESTS, true),
    other: flags(PERM_OTHER, true)
  },
  {
    key: 'cb',
    name: 'C&B',
    note: '',
    locked: false,
    areas: areas({
      'nhan-su': ['edit'],
      'cham-cong': ['edit'],
      'bang-luong': ['edit'],
      kpi: ['edit'],
      'bao-cao': ['view'],
      'cach-tinh': ['edit'],
      'bao-hiem-thue': ['view'],
      'lich-ca': ['edit'],
      'phan-quyen': ['none']
    }),
    requests: flags(PERM_REQUESTS, true),
    other: flags(PERM_OTHER, ['chot-cong'])
  },
  {
    key: 'ke-toan',
    name: 'Kế toán',
    note: '',
    locked: false,
    areas: areas({
      'nhan-su': ['view'],
      'cham-cong': ['view'],
      'bang-luong': ['edit'],
      kpi: ['none'],
      'bao-cao': ['view'],
      'cach-tinh': ['view'],
      'bao-hiem-thue': ['edit'],
      'lich-ca': ['none'],
      'phan-quyen': ['none']
    }),
    requests: flags(PERM_REQUESTS, []),
    other: flags(PERM_OTHER, ['khoa-ky', 'ngan-hang'])
  },
  {
    key: 'nhan-su',
    name: 'Nhân sự',
    note: '',
    locked: false,
    areas: areas({
      'nhan-su': ['edit'],
      'cham-cong': ['edit'],
      'bang-luong': ['none'],
      kpi: ['none'],
      'bao-cao': ['view'],
      'cach-tinh': ['none'],
      'bao-hiem-thue': ['none'],
      'lich-ca': ['view'],
      'phan-quyen': ['none']
    }),
    requests: flags(PERM_REQUESTS, ALL_REQ),
    other: flags(PERM_OTHER, [])
  },
  {
    key: 'quan-ly',
    name: 'Quản lý',
    note: '',
    locked: false,
    areas: areas({
      'nhan-su': ['view', 'Nhóm mình quản lý'],
      'cham-cong': ['view'],
      'bang-luong': ['none', 'Nhóm mình quản lý'],
      kpi: ['edit'],
      'bao-cao': ['view'],
      'cach-tinh': ['none'],
      'bao-hiem-thue': ['none'],
      'lich-ca': ['none'],
      'phan-quyen': ['none']
    }),
    requests: flags(PERM_REQUESTS, ALL_REQ),
    other: flags(PERM_OTHER, [])
  },
  {
    key: 'nhan-vien',
    name: 'Nhân viên',
    note: 'mặc định',
    locked: false,
    areas: areas({
      'nhan-su': ['none', 'Chỉ bản thân'],
      'cham-cong': ['none'],
      'bang-luong': ['none', 'Chỉ bản thân'],
      kpi: ['none'],
      'bao-cao': ['none'],
      'cach-tinh': ['none'],
      'bao-hiem-thue': ['none'],
      'lich-ca': ['none'],
      'phan-quyen': ['none']
    }),
    requests: flags(PERM_REQUESTS, []),
    other: flags(PERM_OTHER, [])
  }
];

// ---- Tài khoản: 10 dòng đầu như thiết kế, phần còn lại sinh theo quy tắc để đủ 73 ----
// status: 'active' | 'locked'
const acc = (name, sub, username, role, status = 'active', me = false) => ({ name, sub, username, role, status, me });

const HEAD = [
  acc('Quản trị demo', 'Admin', 'demo_admin', 'Admin', 'active', true),
  acc('Quản trị demo 2', 'Admin', 'demo_admin2', 'Admin'),
  acc('Bùi Đức Khoa', 'CTV · Advanced Practitioner', 'demo_level_change', 'Nhân viên'),
  acc('Chu Đức Nga', 'CTV · Senior Practitioner', 'demo_ctv4', 'Nhân viên'),
  acc('Hoàng Bảo An', 'CTV · Fresher', 'demo_newhire', 'Nhân viên'),
  acc('Hồ Phương Lam', 'CTV · Practitioner', 'demo_k5_below', 'Nhân viên'),
  acc('La Nhật Oanh', 'CTV · Chuyên trách viên nội dung', 'demo_hd_long', 'Nhân viên'),
  acc('Lý Phương Mai', 'CTV · Practitioner', 'demo_leave_big', 'Nhân viên'),
  acc('Lương Minh My', 'CTV · Fresher', 'demo_a_broken', 'Nhân viên'),
  acc('Lương Quang Khôi', 'CTV · Practitioner', 'demo_locked_clean', 'Nhân viên', 'locked')
];

const SURNAMES = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Võ', 'Đặng', 'Bùi', 'Đỗ', 'Hồ', 'Ngô', 'Dương', 'Lý'];
const MIDDLES = ['Văn', 'Thị', 'Minh', 'Hoàng', 'Ngọc', 'Thanh', 'Quốc', 'Khánh'];
const GIVENS = [
  'An',
  'Bình',
  'Chi',
  'Dũng',
  'Giang',
  'Hà',
  'Khoa',
  'Lan',
  'Nam',
  'Oanh',
  'Phúc',
  'Quân',
  'Sơn',
  'Trang',
  'Uyên',
  'Vy'
];
const TITLES = [
  'CTV · Fresher',
  'CTV · Practitioner',
  'NV · Nhân viên',
  'NV · Chuyên viên',
  'TTS · Bậc 2',
  'NV · Lead'
];
const SPECIAL_ROLE = {
  5: 'Quản lý',
  12: 'Quản lý',
  20: 'Quản lý',
  7: 'Nhân sự',
  30: 'Nhân sự',
  15: 'C&B',
  40: 'Kế toán'
};

const REST = Array.from({ length: 63 }, (_, i) =>
  acc(
    `${SURNAMES[i % 12]} ${MIDDLES[(i * 3 + Math.floor(i / 12)) % 8]} ${GIVENS[(i * 7 + Math.floor(i / 16)) % 16]}`,
    TITLES[i % TITLES.length],
    `nv_${String(i + 11).padStart(2, '0')}`,
    SPECIAL_ROLE[i] || 'Nhân viên',
    i === 50 ? 'locked' : 'active'
  )
);

export const ACCOUNTS = [...HEAD, ...REST];
export const ACCOUNT_PAGE_SIZE = 10;

// ---- Xử lý yêu cầu chưa được đồng ý hoặc bị từ chối ----
export const REQUEST_RULES = {
  leave: [
    { key: 'phep-nam', label: 'Nghỉ phép năm', value: 'Nghỉ không lương', countsAbsent: true },
    { key: 'isat', label: 'iSAT', value: 'Nghỉ không lương', countsAbsent: true },
    { key: 'nghi-duoc-duyet', label: 'Nghỉ được duyệt', value: 'Nghỉ không lương', countsAbsent: true }
  ],
  leaveOptions: ['Nghỉ không lương', 'Không tính là nghỉ'],
  extra: [
    { key: 'ot', label: 'OT', value: 'Bỏ đoạn làm thêm' },
    { key: 'lam-bu-gio', label: 'Làm bù theo giờ', value: 'Bỏ đoạn làm thêm' },
    { key: 'lam-bu-ngay', label: 'Làm bù cả ngày', value: 'Bỏ cả ngày' },
    { key: 'ngay-le', label: 'Đi làm ngày lễ', value: 'Bỏ cả ngày' }
  ],
  extraOptions: ['Bỏ đoạn làm thêm', 'Bỏ cả ngày']
};
