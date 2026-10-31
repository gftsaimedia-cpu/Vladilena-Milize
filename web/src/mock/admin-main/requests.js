// Dữ liệu giả: yêu cầu của nhân sự (OT, nghỉ phép, làm ngày lễ, iSAT…).
// status: 'cho' (chờ xử lý) | 'dong-y' | 'tu-choi'.  date: ngày của yêu cầu; sentAt: 'YYYY-MM-DDTHH:mm'.
// warningIds: cảnh báo AI gắn với yêu cầu (chỉ yêu cầu của tháng hiện tại đã được AI kiểm tra).
// Số đếm gốc (counts) là số máy chủ trả; danh sách dưới đây chỉ là các dòng mẫu.

export const CURRENT_MONTH = '2026-11';
export const BASE_COUNTS = { pendingMonth: 8, pendingOlder: 40, approved: 75, rejected: 4 };

const OT_SHIFT = '17:00–19:00 · ca 08:00–17:00';
const ALL_DAY = 'Cả ngày';

// [id, tên, loại, chức danh, loại yêu cầu, ngày, chi tiết, gửi lúc, thêm]
const rows = list =>
  list.map(([id, name, type, position, kind, date, detail, sentAt, more = {}]) => ({
    id,
    name,
    type,
    position,
    kind,
    date,
    detail,
    sentAt,
    month: date.slice(0, 7),
    status: 'cho',
    impact: '',
    lateNote: '',
    aiSummary: '',
    warningIds: [],
    ...more
  }));

// Tháng 11: 3 yêu cầu có cảnh báo AI, 5 yêu cầu không có cảnh báo
export const CURRENT = rows([
  [
    'r1',
    'Ngô Khánh Đạt',
    'CTV',
    'Advanced Practitioner',
    'Làm ngày lễ',
    '2026-11-24',
    '08:00–17:00',
    '2026-11-10T09:00',
    { warningIds: ['w3', 'w7', 'w8'], aiSummary: 'Sát trần OT và làm ngày lễ: 16/16 giờ' }
  ],
  [
    'r2',
    'Võ Anh Uyên',
    'CTV',
    'Practitioner',
    'Làm ngày lễ',
    '2026-11-24',
    '08:00–17:00',
    '2026-11-10T09:00',
    { warningIds: ['w4', 'w9', 'w10'], aiSummary: 'Sát trần OT và làm ngày lễ: 14/16 giờ' }
  ],
  [
    'r3',
    'Trương Bảo Mai',
    'NV',
    'Chuyên viên',
    'OT',
    '2026-11-06',
    '17:00–20:00 · ca 08:00–17:00',
    '2026-11-06T20:10',
    { warningIds: ['w11'], aiSummary: 'Giờ OT khai dài hơn giờ Check-out thực tế' }
  ],
  [
    'r4',
    'Phan Mỹ Uyên',
    'CTV',
    'Advanced Practitioner',
    'Nghỉ phép năm',
    '2026-11-17',
    ALL_DAY,
    '2026-11-10T09:00',
    { impact: 'Trừ 1 ngày phép năm' }
  ],
  [
    'r5',
    'Lê Thu Bình',
    'NV',
    'Nhân viên',
    'iSAT',
    '2026-11-14',
    ALL_DAY,
    '2026-11-13T18:20',
    { impact: 'Nghỉ thứ 7, vẫn có lương' }
  ],
  [
    'r6',
    'Đặng Ngọc Hà',
    'NV',
    'Chuyên viên',
    'Làm bù theo giờ',
    '2026-11-12',
    '17:00–19:00 · ca 08:00–17:00',
    '2026-11-12T19:05',
    { impact: 'Bù 2 giờ còn thiếu' }
  ],
  [
    'r7',
    'Hoàng Hồng Bình',
    'NV',
    'Chuyên viên',
    'Nghỉ phép năm',
    '2026-11-21',
    ALL_DAY,
    '2026-11-18T08:40',
    { impact: 'Trừ 1 ngày phép năm' }
  ],
  [
    'r8',
    'Chu Đức Nga',
    'CTV',
    'Senior Practitioner',
    'OT',
    '2026-11-19',
    '22:00–23:00 · ca 13:00–22:00',
    '2026-11-19T23:10',
    { impact: 'Thêm 1 giờ OT' }
  ]
]);

const LATE = { lateNote: 'Gửi sau hạn 03/11' };

// Các tháng trước (AI chưa kiểm tra): 17 dòng đầu trên tổng 40
export const OLDER = rows([
  ['o1', 'Hoàng Quang Châu', 'NV', 'Chuyên viên', 'OT', '2026-10-06', OT_SHIFT, '2026-10-31T19:00'],
  ['o2', 'Hoàng Quang Châu', 'NV', 'Chuyên viên', 'OT', '2026-10-07', OT_SHIFT, '2026-10-31T19:00'],
  ['o3', 'Hoàng Quang Châu', 'NV', 'Chuyên viên', 'OT', '2026-10-08', OT_SHIFT, '2026-10-31T19:00'],
  ['o4', 'Hoàng Quang Châu', 'NV', 'Chuyên viên', 'Nghỉ phép năm', '2026-10-14', ALL_DAY, '2026-10-31T19:00'],
  [
    'o5',
    'Mai Nhật Mai',
    'NV',
    'Chuyên viên',
    'OT',
    '2026-10-06',
    '17:00–20:00 · ca 08:00–17:00',
    '2026-11-06T10:00',
    LATE
  ],
  ['o6', 'Dương Mỹ Khoa', 'NV', 'Chuyên viên', 'OT', '2026-10-20', OT_SHIFT, '2026-10-31T19:00'],
  [
    'o7',
    'Nguyễn Nhật Châu',
    'NV',
    'Chuyên viên',
    'OT',
    '2026-10-06',
    '17:00–20:00 · ca 08:00–17:00',
    '2026-11-03T23:30'
  ],
  ['o8', 'Chu Minh Quỳnh', 'NV', 'Nhân viên', 'Nghỉ được duyệt', '2026-10-06', ALL_DAY, '2026-10-31T19:00'],
  ['o9', 'Chu Minh Quỳnh', 'NV', 'Nhân viên', 'Nghỉ được duyệt', '2026-10-07', ALL_DAY, '2026-10-31T19:00'],
  ['o10', 'Chu Minh Quỳnh', 'NV', 'Nhân viên', 'Nghỉ được duyệt', '2026-10-08', ALL_DAY, '2026-10-31T19:00'],
  ['o11', 'Hoàng Hồng Bình', 'NV', 'Chuyên viên', 'Nghỉ phép năm', '2026-10-08', ALL_DAY, '2026-10-31T19:00'],
  ['o12', 'Đặng Ngọc Hà', 'NV', 'Chuyên viên', 'Làm bù theo giờ', '2026-10-08', OT_SHIFT, '2026-10-31T19:00'],
  ['o13', 'Lê Thu Bình', 'NV', 'Nhân viên', 'iSAT', '2026-10-17', ALL_DAY, '2026-10-31T19:00'],
  ['o14', 'Lê Thu Bình', 'NV', 'Nhân viên', 'iSAT', '2026-10-24', ALL_DAY, '2026-10-31T19:00'],
  ['o15', 'Lê Thu Bình', 'NV', 'Nhân viên', 'iSAT', '2026-10-31', ALL_DAY, '2026-10-31T19:00'],
  ['o16', 'Bùi Minh Lam', 'NV', 'Chuyên viên', 'OT', '2026-10-13', OT_SHIFT, '2026-11-04T00:30', LATE],
  ['o17', 'Trần Tuấn Tâm', 'NV', 'Chuyên viên', 'Nghỉ được duyệt', '2026-10-13', ALL_DAY, '2026-10-31T19:00']
]);

// Một vài yêu cầu đã xử lý (cho các tab "Đã đồng ý", "Đã từ chối", "Tất cả")
export const DECIDED = rows([
  ['d1', 'Lê Thu Bình', 'NV', 'Nhân viên', 'iSAT', '2026-11-07', ALL_DAY, '2026-11-06T17:45', { status: 'dong-y' }],
  ['d2', 'Đặng Ngọc Hà', 'NV', 'Chuyên viên', 'OT', '2026-11-05', OT_SHIFT, '2026-11-05T19:10', { status: 'dong-y' }],
  [
    'd3',
    'Chu Đức Nga',
    'CTV',
    'Senior Practitioner',
    'Nghỉ phép năm',
    '2026-11-04',
    ALL_DAY,
    '2026-11-02T09:15',
    { status: 'dong-y' }
  ],
  [
    'd4',
    'Trần Tuấn Tâm',
    'NV',
    'Chuyên viên',
    'Làm bù theo giờ',
    '2026-10-28',
    '17:00–18:00 · ca 08:00–17:00',
    '2026-10-28T18:05',
    { status: 'dong-y' }
  ],
  [
    'd5',
    'Mai Nhật Mai',
    'NV',
    'Chuyên viên',
    'OT',
    '2026-11-02',
    '17:00–22:00 · ca 08:00–17:00',
    '2026-11-03T08:00',
    { status: 'tu-choi' }
  ],
  [
    'd6',
    'Dương Mỹ Khoa',
    'NV',
    'Chuyên viên',
    'Nghỉ phép năm',
    '2026-10-30',
    ALL_DAY,
    '2026-10-29T10:00',
    { status: 'tu-choi' }
  ]
]);

export const REQUEST_KINDS = ['OT', 'Nghỉ phép năm', 'Nghỉ được duyệt', 'Làm ngày lễ', 'Làm bù theo giờ', 'iSAT'];
export const OLDER_PAGE = 17;
export const BULK_LIMIT = 200;
