'use strict';
// Bản mô tả TOÀN BỘ dữ liệu demo AiCB: mỗi persona là một người giả kèm các ca (case) nó phủ, ghi chú kỳ vọng và cờ `unreasonable`.
// Tất cả là người giả: tên đăng nhập bắt đầu bằng `demo_`, họ tên ghép từ danh sách tên giả (không có người thật, không dùng tên seed).
// File này chỉ là dữ liệu + hàm dựng ngày; việc ghi vào DB nằm ở generate.js.
//
// "Hôm nay" mà dữ liệu giả định: TODAY (26/11/2026, 12:00 giờ Việt Nam). Tháng 07–09 là lịch sử (khoản coi như đã duyệt theo mốc 10/2026),
// tháng 10 là tháng chính (khoản chờ duyệt), tháng 11 là tháng tính giờ theo Check-in/out và KPI 5 thành phần (còn 4 ngày chưa tới).
// Trên đồng hồ thật (15/10/2026) các dòng tháng 11 là "tương lai"; dùng --today=YYYY-MM-DD để cắt bớt (xem seed-demo.js).
//
// Lịch tham chiếu 2026: 01/10 Thứ 5 · 03/10 Thứ 7 · 31/10 Thứ 7 · 01/11 Chủ nhật · 24/11 Thứ 3 (lễ) · 26/11 Thứ 5 · 01–02/09 Thứ 3–4 (lễ).
const { E } = require('./helpers');

const TODAY = '2026-11-26';
const NOW_TIME = '12:00';
const NOW_LOCAL = `${TODAY}T${NOW_TIME}`;
const MONTHS = ['2026-07', '2026-08', '2026-09', '2026-10', '2026-11'];

// Lễ 2026 theo mã và seed hiện có. Tết Bính Ngọ 14–21/02 (Thứ 7 14/02 và 21/02 là hai ngày lễ rơi Thứ 7), Giỗ Tổ 10/3 âm lịch rơi Chủ nhật 26/04
// nên nghỉ bù Thứ 2 27/04, 30/04, 01/05, hai ngày Quốc khánh 01–02/09 và Ngày Văn hoá Việt Nam 24/11 (seed: NQ 28/2026/QH16).
const HOLIDAYS = [
  '2026-01-01',
  '2026-02-14',
  '2026-02-16',
  '2026-02-17',
  '2026-02-18',
  '2026-02-19',
  '2026-02-20',
  '2026-02-21',
  '2026-04-27',
  '2026-04-30',
  '2026-05-01',
  '2026-09-01',
  '2026-09-02',
  '2026-11-24'
];
const SETTINGS = {
  holidays: HOLIDAYS,
  punchStart: '2026-10-01',
  // Toạ độ giả ở giữa Hà Nội; chỉ để màn Thiết lập và Check-in có vùng công ty mà thử. Máy chủ không bao giờ lưu toạ độ của nhân sự.
  geofence: { lat: 21.0285, lng: 105.8542, radiusM: 150, maxAccuracyM: 100 }
};
const KPI_MAX = { ctv: [1500000, 3000000, 4500000, 6000000], nv: [6000000, 6500000, 7000000, 7500000] };

/* ---------- danh mục ca ---------- */
const CASES = [
  // Hồ sơ nhân sự
  ['S01', 'Mọi level TTS (L1–L6)'],
  ['S02', 'Mọi level CTV (L1–L4)'],
  ['S03', 'Mọi level NV (L1–L4, L4 = HDO)'],
  ['S04', 'Đủ 6 ca cố định n1 n2 f1 f2 g1 g2'],
  ['S05', 'Chưa gán ca cố định'],
  ['S06', 'iDorm có và không'],
  ['S07', 'Night 40% và 60%'],
  ['S08', 'HĐLĐ từ 3 tháng'],
  ['S09', 'Hợp đồng dưới 3 tháng'],
  ['S10', 'Thử việc'],
  ['S11', 'Có đóng BH và không đóng BH'],
  ['S12', 'Người phụ thuộc 0 đến 3'],
  ['S13', 'Tài khoản khoá, có lịch sử'],
  ['S14', 'Tài khoản khoá còn khoản chờ duyệt'],
  ['S15', 'Mới vào giữa tháng 10'],
  ['S16', 'Ngày vào làm và ngày sinh trống (bất thường)'],
  ['S17', 'Ngày vào làm sau dữ liệu đã có (bất thường)'],
  ['S18', 'Đổi loại NV sang TTS giữa tháng (bất thường)'],
  ['S19', 'Đổi level giữa tháng (bất thường)'],
  ['S20', 'Phép năm âm (bất thường)'],
  ['S21', 'Điều chỉnh phép rất lớn (bất thường)'],
  ['S22', 'Hồ sơ vô lý: level ngoài bảng, ca lạ, ngày sinh sai, cờ thừa'],
  ['S23', 'Hai tài khoản Admin'],
  ['S24', 'Admin tắt giảm trừ gia cảnh và tạm ứng'],
  ['S25', 'Đổi loại TTS sang NV, có mã nhân viên cũ và mã mới'],
  ['S26', 'Loại nhân sự ngoài bảng tham số (bất thường): phiếu lỗi PAYROLL_BAD_TYPE'],
  ['S26', 'Mã nhân viên dạng [loại][đơn vị][2 số]; hai người cùng đơn vị số liền nhau'],
  ['S27', 'Thâm niên đủ bước 5 năm: sổ phép có dòng "thâm niên" (leave.seniority.stepYears)'],
  // Lịch ước tính, duyệt, tiền
  ['C01', 'Ngày trống là ngày đi làm (tháng 11)'],
  ['C02', 'Nghỉ phép năm đủ phép'],
  ['C03', 'Nghỉ phép năm dùng hết phép, sau đó nghỉ không lương ngày thường'],
  ['C04', 'Nghỉ không lương T2–T6 khi còn phép (luật cấm, bất thường)'],
  ['C05', 'Nghỉ không lương Thứ 7 (được phép)'],
  ['C06', 'Nghỉ sẽ làm bù, bù đủ'],
  ['C07', 'Nghỉ sẽ làm bù, bù một phần'],
  ['C08', 'Nghỉ sẽ làm bù, không bù'],
  ['C09', 'Nghỉ được duyệt (kind approved)'],
  ['C10', 'iSAT 1 lần trong tháng'],
  ['C11', 'iSAT 3 lần trong tháng'],
  ['C12', 'iSAT 4 lần trong tháng (ngưỡng AI)'],
  ['C13', 'iSAT 5 lần trong tháng'],
  ['C15', 'Giờ làm bù trước và sau ngày thiếu'],
  ['C16', 'OT trong trần'],
  ['C17', 'OT đúng 4 giờ trong một ngày'],
  ['C20', 'OT sau một khoản làm bù đang chờ duyệt'],
  ['C21', 'Đi làm ngày lễ đã duyệt'],
  ['C22', 'Đi làm ngày lễ chờ duyệt'],
  ['C23', 'Ca đêm qua nửa đêm sang ngày lễ (×3)'],
  ['C24', 'Ca đêm qua ranh giới tháng (31/10 sang 01/11)'],
  ['C25', 'Khoản đang chờ duyệt'],
  ['C26', 'Khoản đã duyệt'],
  ['C27', 'Khoản bị từ chối kèm lý do'],
  ['C28', 'Đổi quyết định kèm lý do (duyệt rồi từ chối)'],
  ['C29', 'Khoản sửa sau khi duyệt, quay về chờ duyệt'],
  ['C30', 'Khoản tháng 09 hệ thống tự coi là đã duyệt'],
  ['C31', 'Khoản tháng 10 mặc định chờ duyệt'],
  ['C32', 'Chuyên cần mất đúng 3 ngày nghỉ'],
  ['C33', 'Chuyên cần còn khi nghỉ 2 ngày'],
  ['C34', 'Giờ vượt ngưỡng 23,75 (còn chuyên cần), T6-5'],
  ['C35', 'Giờ vượt ngưỡng 24,25 (mất chuyên cần), T6-5'],
  ['C36', 'Khai sau hạn mùng 3 tháng sau (và sát hạn)'],
  ['C37', 'Khoản bị đổi 2 lần (rev 3) và khoản đổi 1 lần'],
  ['C38', 'Phiếu lương Admin sửa số nhỏ'],
  ['C39', 'Phiếu lương Admin sửa số lớn (từ 500.000 ₫ và 20%)'],
  // KPI
  ['K01', 'KPI tự đánh giá 100% ba tháng liền, chưa có % Admin'],
  ['K02', 'KPI dưới 75%'],
  ['K03', 'KPI đúng 75%'],
  ['K04', 'KPI Admin duyệt % và mức tiền'],
  ['K05', 'Mức KPI vượt trần level (dữ liệu cũ, bất thường)'],
  ['K06', 'TTS không có KPI'],
  ['K07', 'KPI 5 thành phần đủ và đạt (NV L1 6.000.000 → 5.532.000)'],
  ['K08', 'KPI 5 thành phần chưa đủ điểm (→ 0)'],
  ['K09', 'KPI 5 thành phần Base Wework 74 (→ 0)'],
  ['K10', 'KPI 5 thành phần đúng 75 cả năm điểm (→ 4.500.000)'],
  ['K11', 'KPI 5 thành phần dưới mốc đạt (→ 0)'],
  ['K12', 'Tháng 10 tính KPI cũ, tháng 11 tính KPI 5 thành phần'],
  // Thuế và bảo hiểm
  ['T01', 'Nghỉ không lương từ 14 ngày làm việc: tháng đó không đóng BH'],
  ['T02', 'Thu nhập cao, thuế TNCN lên bậc 10% (tham số luật 2026 không cho lên bậc cao hơn)'],
  ['T03', 'Hợp đồng dưới 3 tháng, thu nhập từ 5.000.000 (khấu trừ 10%)'],
  ['T04', 'Hợp đồng dưới 3 tháng, thu nhập dưới 5.000.000 (không khấu trừ)'],
  ['T05', 'Tạm ứng làm thực lĩnh âm (có thể xảy ra nhưng vô lý)'],
  // Check-in/out
  ['A01', 'Check-in/out đúng giờ'],
  ['A02', 'Trễ 10 phút (không trừ)'],
  ['A03', 'Trễ 20 phút (trừ 30)'],
  ['A04', 'Trễ 50 phút (trừ 60)'],
  ['A05', 'Về sớm'],
  ['A06', 'Trễ và về sớm cùng một ngày'],
  ['A07', 'Quên Check-out quá 16 giờ'],
  ['A08', 'Chỉ có lượt ra, không có lượt vào (bất thường)'],
  ['A09', 'Nhiều lượt trong một ngày'],
  ['A10', 'Lượt qua đêm'],
  ['A11', 'Check-in ngày ngoài lịch (Chủ nhật, Thứ 7 của TTS)'],
  ['A12', 'Ngày có lịch mà không chấm công (tháng 11 là nghỉ)'],
  ['A13', 'Admin điều chỉnh giờ kèm lý do'],
  ['A14', 'Chấm công vào ngày đã khai nghỉ'],
  ['A15', 'OT khai nhưng Check-in không phủ (thiếu từ 30 phút, hoặc không có Check-in)'],
  ['A16', 'OT khai, Check-in thiếu 20 phút (sát ngưỡng)'],
  ['A17', 'Lượt đang mở (đang trong ca hôm nay)'],
  // Dữ liệu hỏng, dữ liệu cũ
  ['B01', 'Làm bù liền 28 giờ qua nhiều ngày (C2)'],
  ['B02', 'Bản ghi cũ có extraOut nhưng không có extraKind (B2)'],
  ['B03', 'Làm bù chạm khung 22h–6h (bản ghi cũ)'],
  ['B04', 'Ngày làm việc vào Chủ nhật'],
  ['B05', 'Loại ngày lạ trong bản ghi cũ'],
  ['B06', 'Hai lượt chấm công trùng và chồng giờ'],
  ['B07', 'Ngày có dấu vết chấm công nằm trong lịch ước tính (C4)'],
  ['B08', 'Bản ghi không có kind (rất cũ), khoá ngày ngoài tháng, khoá ngày không tồn tại'],
  ['B09', 'Dòng duyệt tự duyệt, và dòng đã duyệt nhưng lịch đã đổi'],
  // Kỳ lương tháng 10: chốt công → tính lương → AI kiểm tra (xem PAYSLIP và PERIOD_EXPECT cuối file; chạy thử: period-check.js)
  ['P01', 'Kỳ lương: phiếu bị AI gắn cờ (mỗi luật có ít nhất một phiếu)'],
  ['P02', 'Kỳ lương: phiếu lỗi PAYROLL_BAD_LEVEL (bậc ngoài bảng)'],
  ['P03', 'Kỳ lương: phiếu lỗi PAYROLL_BAD_TYPE (loại ngoài bảng)'],
  ['B10', 'Lượt chấm công thô cũ (không có phiên) và attendance_days cũ']
];
const CASE_TITLE = Object.fromEntries(CASES);

/* ---------- tên giả ---------- */
const HO = [
  'Nguyễn',
  'Trần',
  'Lê',
  'Phạm',
  'Hoàng',
  'Huỳnh',
  'Phan',
  'Vũ',
  'Võ',
  'Đặng',
  'Bùi',
  'Đỗ',
  'Hồ',
  'Ngô',
  'Dương',
  'Lý',
  'Đinh',
  'Trương',
  'Lương',
  'Mai',
  'Tạ',
  'Chu',
  'La',
  'Kiều'
];
const DEM = [
  'Minh',
  'Thu',
  'Quang',
  'Ngọc',
  'Bảo',
  'Hải',
  'Thanh',
  'Anh',
  'Khánh',
  'Đức',
  'Phương',
  'Hồng',
  'Tuấn',
  'Mỹ',
  'Nhật',
  'Gia'
];
const TEN = [
  'An',
  'Bình',
  'Châu',
  'Dũng',
  'Giang',
  'Hà',
  'Hạnh',
  'Khoa',
  'Lam',
  'Linh',
  'Mai',
  'Nam',
  'Oanh',
  'Phúc',
  'Quân',
  'Sơn',
  'Tâm',
  'Thảo',
  'Trang',
  'Uyên',
  'Vy',
  'Yến',
  'Đạt',
  'Hiếu',
  'Khôi',
  'Lan',
  'My',
  'Nga',
  'Quỳnh',
  'Trí'
];
// Ghép theo hệ đếm hỗn hợp nên mỗi chỉ số cho một tên khác nhau (tối đa 11.520 tên)
function nameAt(i?) {
  const d0 = i % 24,
    d1 = Math.floor(i / 24) % 16,
    d2 = Math.floor(i / 384) % 30;
  return `${HO[(d0 * 5) % 24]} ${DEM[(d1 * 7 + d0) % 16]} ${TEN[(d2 * 7 + d0 * 3 + d1) % 30]}`;
}
const BIRTHDAY = (i?) =>
  `${1985 + (i % 18)}-${String(1 + ((i * 5) % 12)).padStart(2, '0')}-${String(1 + ((i * 7) % 27)).padStart(2, '0')}`;

/* ---------- viết tắt khi dựng persona ---------- */
const m = (month?, n?) => `${month}-${String(n).padStart(2, '0')}`;
const jul = (n?) => m('2026-07', n),
  aug = (n?) => m('2026-08', n),
  sep = (n?) => m('2026-09', n),
  oct = (n?) => m('2026-10', n),
  nov = (n?) => m('2026-11', n);
const entries = (fn?, days?, make?) => Object.fromEntries(days.map(n => [fn(n), make]));
// Quyết định của Admin cho một loạt ngày
const decide = (date?, status?, atTime?, note?) => ({ at: atTime, date, status, ...(note ? { note } : {}) });
const approveAll = (dates?, atTime?) => dates.map(date => decide(date, 'approved', atTime));
const FIRST_PASS = '2026-11-05T09:00'; // Admin soát khoản tháng 10 đợt đầu
const SECOND_PASS = '2026-11-09T14:00';

// Mã nhân viên GIẢ dạng [loại TTS/CTV/NV][mã đơn vị 3 chữ][số thứ tự 2 chữ số theo loại và đơn vị], ví dụ TTSKTA05. Mã đơn vị là mã bịa, không phải mã thật của GFT.
// Chỉ nằm trong file này và các CSV (cột employee_code); bảng staff chưa có cột mã nên DB không lưu.
const UNITS = ['KTA', 'KDB', 'VHC', 'NSD', 'TCE'];
const unitAt = (i?) => UNITS[Math.floor(i / 3) % UNITS.length]; // ba người liền nhau cùng đơn vị nên có số liền nhau
const codeCounters = new Map<any, any>();
function nextCode(type?, unit?) {
  const key = `${type}|${unit}`;
  const n = (codeCounters.get(key) || 0) + 1;
  codeCounters.set(key, n);
  return `${type.toUpperCase()}${unit}${String(n).padStart(2, '0')}`; // quá 99 thì thành 3 chữ số (chỉ xảy ra với --scale lớn)
}
// Loại hợp đồng giả (mọi người đều có hợp đồng, kể cả TTS), khớp trường contract long/short: short → thực tập (TTS) hoặc thử việc; long → xác định hoặc không xác định thời hạn
function contractTypeOf(p?) {
  if (p.contractType) return p.contractType;
  const short = p.contract ? p.contract === 'short' : p.type === 'tts';
  if (short) return p.type === 'tts' ? 'hợp đồng thực tập' : 'thử việc';
  return p.startDate && p.startDate >= '2025-12-01' ? 'xác định thời hạn' : 'không xác định thời hạn';
}

const PERSONAS: any[] = [];
let seq = 0;
function add(group?, tag?, fields?) {
  const i = seq++;
  const p: Record<string, any> = {
    group,
    username: `demo_${tag}`,
    name: nameAt(i),
    role: 'staff',
    type: 'nv',
    level: 1,
    shiftCode: 'n1',
    startDate: '2025-08-04',
    birthday: BIRTHDAY(i),
    covers: [],
    expect: '',
    unreasonable: false,
    ai: { fire: [], miss: [] },
    ...fields
  };
  const unit = unitAt(i);
  const oldType = p.oldCodeType || p.initialType;
  if (oldType) p.oldEmployeeCode = nextCode(oldType, unit);
  p.employeeCode = nextCode(p.codeType || p.type, unit);
  p.contractType = contractTypeOf(p);
  PERSONAS.push(p);
  return p;
}

const ADMINS = [
  {
    username: 'demo_admin',
    name: 'Quản trị demo',
    role: 'admin',
    type: 'tts',
    level: 0,
    covers: ['S23'],
    employeeCode: 'NVADM01',
    contractType: 'không xác định thời hạn'
  },
  {
    username: 'demo_admin2',
    name: 'Quản trị demo 2',
    role: 'admin',
    type: 'tts',
    level: 0,
    covers: ['S23'],
    employeeCode: 'NVADM02',
    contractType: 'không xác định thời hạn'
  }
];

/* =============== Nhóm NỀN: 14 người đủ loại, level, ca; sạch, dùng làm "gần ngưỡng nhưng không vi phạm" =============== */
add('Nền', 'tts1', {
  type: 'tts',
  level: 1,
  shiftCode: 'n1',
  covers: ['S01', 'S04', 'K06', 'A01'],
  expect: 'TTS L1, ca n1, đi làm T2–T6 đủ, Check-in/out đúng giờ cả tháng 10 và 11. Không KPI, không phép năm.',
  ai: { fire: [], miss: ['net-nonpositive'] }
});
add('Nền', 'tts2', {
  type: 'tts',
  level: 2,
  shiftCode: 'n2',
  covers: ['S01', 'S04', 'K06'],
  expect: 'TTS L2, ca n2 (10:00–19:00), sạch.'
});
add('Nền', 'tts3', {
  type: 'tts',
  level: 3,
  shiftCode: 'f1',
  covers: ['S01', 'S04', 'K06', 'T04'],
  expect:
    'TTS L3, ca Flex f1 (06:00–15:00). Hợp đồng dưới 3 tháng mặc định, thu nhập dưới 5.000.000: không khấu trừ 10%.'
});
add('Nền', 'tts4', {
  type: 'tts',
  level: 4,
  shiftCode: 'f2',
  covers: ['S01', 'S04', 'K06', 'T04'],
  expect: 'TTS L4, ca Flex f2 (13:00–22:00). Thu nhập dưới 5.000.000: không khấu trừ 10%.'
});
add('Nền', 'tts5', {
  type: 'tts',
  level: 5,
  shiftCode: 'g1',
  covers: ['S01', 'S04', 'K06', 'T03'],
  expect:
    'TTS L5, ca đêm g1 (21:00–06:00); có phụ cấp đêm nên thu nhập vượt 5.000.000: khấu trừ 10% (hợp đồng dưới 3 tháng).'
});
add('Nền', 'tts6', {
  type: 'tts',
  level: 6,
  shiftCode: 'g2',
  covers: ['S01', 'S04', 'K06', 'T03'],
  expect: 'TTS L6, ca đêm g2 (22:00–07:00); thu nhập từ 5.000.000: khấu trừ 10%.'
});
add('Nền', 'ctv1', {
  type: 'ctv',
  level: 1,
  shiftCode: 'n1',
  covers: ['S02', 'S04', 'S08'],
  expect: 'CTV L1 (Fresher), ca n1, HĐLĐ mặc định, KPI cũ tự đánh giá 80–94%.'
});
add('Nền', 'ctv2', {
  type: 'ctv',
  level: 2,
  shiftCode: 'n2',
  covers: ['S02', 'S04'],
  expect: 'CTV L2, ca n2.'
});
add('Nền', 'ctv3', {
  type: 'ctv',
  level: 3,
  shiftCode: 'f1',
  covers: ['S02', 'S04'],
  expect: 'CTV L3, ca Flex f1.'
});
add('Nền', 'ctv4', {
  type: 'ctv',
  level: 4,
  shiftCode: 'f2',
  covers: ['S02', 'S04'],
  expect: 'CTV L4 (Senior Practitioner), ca Flex f2.'
});
add('Nền', 'nv1', {
  type: 'nv',
  level: 1,
  shiftCode: 'g2',
  nightPct: 40,
  idorm: false,
  covers: ['S03', 'S04', 'S07', 'C24', 'A10'],
  expect:
    'NV L1, ca đêm g2, Night 40%. Có ca đêm Thứ 7 31/10 22:00 sang 01/11 07:00 (qua ranh giới tháng): lượt Check-in/out thuộc ngày 31/10.'
});
add('Nền', 'nv2', {
  type: 'nv',
  level: 2,
  shiftCode: 'g1',
  nightPct: 60,
  covers: ['S03', 'S04', 'S07', 'A10'],
  expect: 'NV L2 (Chuyên viên), ca đêm g1, Night 60%: so Night 40% ở nv1.'
});
add('Nền', 'nv3', {
  type: 'nv',
  level: 3,
  shiftCode: 'f2',
  idorm: true,
  covers: ['S03', 'S04', 'S06'],
  expect: 'NV L3 (Lead), ca Flex f2, ở iDorm: không có phụ cấp đi lại.'
});
add('Nền', 'nv4', {
  type: 'nv',
  level: 4,
  shiftCode: 'n1',
  idorm: false,
  covers: ['S03', 'S06', 'T02'],
  expect: 'NV L4 = HDO (7.500.000), không iDorm, KPI tự đánh giá 95%: thu nhập khoảng 17 triệu, thuế TNCN ở bậc 5%.'
});

/* =============== Nhóm HỒ SƠ: hợp đồng, BH, phụ thuộc, khoá, mới vào =============== */
add('Hồ sơ', 'hd_long', {
  type: 'ctv',
  level: 2,
  shiftCode: 'n1',
  contract: 'long',
  insured: true,
  dependants: 2,
  jobTitle: 'Chuyên trách viên nội dung',
  covers: ['S08', 'S11', 'S12'],
  expect: 'HĐLĐ từ 3 tháng, có đóng BH, 2 người phụ thuộc (giảm trừ 15.500.000 + 2 × 6.200.000).'
});
add('Hồ sơ', 'hd_short', {
  type: 'ctv',
  level: 2,
  shiftCode: 'n2',
  startDate: '2026-08-17',
  contract: 'short',
  insured: false,
  dependants: 0,
  covers: ['S09', 'S11', 'S12', 'T03'],
  expect:
    'Hợp đồng dưới 3 tháng, không đóng BH, không phụ thuộc; thu nhập từ 5.000.000 nên bị khấu trừ 10% trên toàn bộ.'
});
add('Hồ sơ', 'veteran', {
  type: 'nv',
  level: 2,
  shiftCode: 'n1',
  startDate: '2021-03-04',
  covers: ['S27'],
  expect:
    'Nhân viên vào làm từ 04/03/2021: tròn 5 năm vào 04/03/2026 nên sổ phép có dòng thâm niên (+1 ngày mỗi 5 năm tròn), hợp đồng không xác định thời hạn.'
});
add('Hồ sơ', 'probation', {
  type: 'nv',
  level: 1,
  shiftCode: 'n1',
  startDate: '2026-09-01',
  contract: 'short',
  insured: false,
  dependants: 1,
  jobTitle: 'Nhân viên thử việc',
  covers: ['S10', 'S11', 'S12', 'T03'],
  expect:
    'Thử việc 60 ngày (hợp đồng dưới 3 tháng), không đóng BH, 1 người phụ thuộc (không được giảm trừ vì không phải HĐLĐ).'
});
add('Hồ sơ', 'long_unins', {
  type: 'ctv',
  level: 3,
  shiftCode: 'f1',
  contract: 'long',
  insured: false,
  dependants: 3,
  covers: ['S08', 'S11', 'S12'],
  expect: 'HĐLĐ nhưng Admin tắt đóng BH (insured = 0), 3 người phụ thuộc: tháng này không có dòng BH.'
});
add('Hồ sơ', 'locked_clean', {
  type: 'ctv',
  level: 2,
  shiftCode: null,
  freeHours: ['08:30', '17:30'],
  locked: { at: '2026-11-02T10:00', by: 'demo_admin' },
  att: false,
  cal: { '2026-10': { edits: entries(oct, [6, 20], E.leave) }, '2026-11': false },
  decisions: approveAll([oct(6), oct(20)], FIRST_PASS),
  covers: ['S13', 'S05'],
  expect:
    'Tài khoản khoá 02/11 (nghỉ việc), có đủ lịch sử, mọi khoản tháng 10 đã duyệt, không có ca cố định. Cặp gần ngưỡng của locked-with-pending và missing-fixed-shift (người khoá không bị tính).',
  ai: { fire: [], miss: ['locked-with-pending', 'missing-fixed-shift'] }
});
add('Hồ sơ', 'locked_pending', {
  type: 'nv',
  level: 1,
  shiftCode: 'n1',
  locked: { at: '2026-11-12T10:00', by: 'demo_admin' },
  att: { to: '2026-11-12' },
  cal: {
    '2026-10': { edits: { [oct(3)]: E.isat, [oct(6)]: E.ot('19:00') } },
    '2026-11': [{ at: '2026-11-10T09:00', edits: {} }]
  },
  covers: ['S14', 'C25'],
  expect: 'Khoá 12/11 khi còn iSAT 03/10 và OT 06/10 chờ duyệt: AI nhắc "tài khoản đã khoá nhưng khoản vẫn chờ duyệt".',
  ai: { fire: ['locked-with-pending'], miss: [] }
});
add('Hồ sơ', 'newhire', {
  type: 'ctv',
  level: 1,
  shiftCode: 'n1',
  startDate: '2026-10-15',
  birthday: '2003-12-04',
  covers: ['S15'],
  expect:
    'Vào làm 15/10: lịch tháng 10 chỉ từ 15/10, không có lịch tháng 07–09, Check-in/out từ 15/10. 12 ngày làm việc trước ngày vào không tính vào BH.'
});

/* =============== Nhóm HỒ SƠ BẤT THƯỜNG =============== */
add('Hồ sơ', 'promoted', {
  type: 'nv',
  initialType: 'tts',
  level: 1,
  initialLevel: 3,
  shiftCode: 'n1',
  startDate: '2025-09-01',
  typeByMonth: { '2026-07': 'tts', '2026-08': 'tts', '2026-09': 'tts' },
  changes: [{ at: '2026-10-01T08:30', patch: { type: 'nv', level: 1 } }],
  covers: ['S25', 'S26'],
  expect:
    'Thực tập sinh L3 đến hết tháng 09, từ 01/10 lên Nhân viên L1 (mã cũ TTS…, mã mới NV…): lịch tháng 07–09 theo TTS (T2–T6, không KPI), từ tháng 10 theo NV (T2–T7, có KPI, có phụ cấp).'
});
add('Hồ sơ bất thường', 'no_dates', {
  type: 'nv',
  level: 2,
  shiftCode: 'n1',
  startDate: null,
  birthday: null,
  sheetsBeforeStart: true,
  covers: ['S16'],
  unreasonable: true,
  expect: 'Thiếu cả ngày vào làm và ngày sinh: phép năm không tính được, AI báo "thiếu ngày vào làm hợp lệ".',
  ai: { fire: ['missing-start-date'], miss: [] }
});
add('Hồ sơ bất thường', 'tts_odd', {
  type: 'tts',
  level: 3,
  shiftCode: 'n1',
  startDate: null,
  nightPct: 40,
  idorm: true,
  contract: 'long',
  insured: true,
  dependants: 3,
  sheetsBeforeStart: true,
  covers: ['S16', 'S22'],
  unreasonable: true,
  expect:
    'TTS thiếu ngày vào làm nhưng AI không báo (TTS không có phép năm), kèm các cờ vô nghĩa với TTS: Night 40%, iDorm, HĐLĐ có BH.',
  ai: { fire: [], miss: ['missing-start-date'] }
});
add('Hồ sơ bất thường', 'start_late', {
  type: 'ctv',
  level: 2,
  shiftCode: 'n1',
  startDate: '2026-11-15',
  birthday: '1996-03-09',
  sheetsBeforeStart: true,
  cal: { '2026-10': { edits: { [oct(8)]: E.leave, [oct(9)]: E.leave } } },
  decisions: approveAll([oct(8), oct(9)], FIRST_PASS),
  covers: ['S17', 'S20'],
  unreasonable: true,
  expect:
    'Ngày vào làm ghi 15/11/2026 nhưng đã có lịch và 2 ngày phép từ tháng 07–10, Check-in/out chỉ từ 15/11. Phép được cộng 1, đã dùng 2: âm 1 ngày.',
  ai: { fire: ['negative-leave'], miss: [] }
});
add('Hồ sơ bất thường', 'type_change', {
  type: 'nv',
  codeType: 'tts',
  oldCodeType: 'nv',
  level: 2,
  shiftCode: 'n1',
  cal: { '2026-10': { edits: { [oct(3)]: E.isat, [oct(8)]: E.leave, [oct(6)]: E.ot('19:00') } } },
  changes: [{ at: '2026-10-20T10:00', patch: { type: 'tts' } }],
  covers: ['S18'],
  unreasonable: true,
  expect:
    'Đang là TTS (đổi từ NV ngày 20/10), nhưng tháng 10 còn iSAT Thứ 7, 1 ngày phép năm và OT khai lúc còn là NV: dòng duyệt vẫn chờ, TTS không có các khoản này.'
});
add('Hồ sơ bất thường', 'level_change', {
  type: 'ctv',
  level: 1,
  shiftCode: 'n1',
  cal: { '2026-10': { edits: {} } },
  kpi: {
    '2026-07': { pct: 90, amt: 1500000, admPct: 90, admAmt: 1500000 },
    '2026-08': { pct: 90, amt: 1500000, admPct: 90, admAmt: 1500000 },
    '2026-09': { pct: 90, amt: 1500000, admPct: 90, admAmt: 1500000 },
    '2026-10': { pct: 90, amt: 4500000 }
  },
  changes: [{ at: '2026-10-16T10:00', patch: { level: 3 } }],
  covers: ['S19'],
  unreasonable: true,
  expect:
    'Level đổi từ 1 lên 3 ngày 16/10 mà không có lịch sử level: KPI tháng 07–09 theo mức L1 (1.500.000), tháng 10 đề xuất theo mức L3 (4.500.000); cả tháng 10 tính lương theo level mới.'
});
add('Hồ sơ bất thường', 'leave_big', {
  type: 'ctv',
  level: 2,
  shiftCode: 'n1',
  leaveAdjust: 60,
  cal: {
    '2026-09': { edits: entries(sep, [14, 15, 16], E.leave) },
    '2026-10': { edits: entries(oct, [5, 6, 7, 8, 9], E.leave) }
  },
  decisions: approveAll([5, 6, 7, 8, 9].map(oct), FIRST_PASS),
  covers: ['S21', 'C02'],
  unreasonable: true,
  expect: 'Admin cộng tay 60 ngày phép (điều chỉnh rất lớn), nghỉ phép 5 ngày liền tháng 10: số dư hơn 60 ngày.'
});
add('Hồ sơ bất thường', 'bad_profile', {
  type: 'nv',
  level: 9,
  shiftCode: 'x9',
  nightPct: null,
  leaveAdjust: -30,
  att: false,
  birthday: '1990-02-30',
  covers: ['S20', 'S22', 'P02'],
  unreasonable: true,
  expect:
    'Level 9 không có trong bảng (lương cơ bản 0), mã ca "x9" không tồn tại, ngày sinh 30/02 sai, điều chỉnh phép −30: phép âm và không có ca cố định hợp lệ.',
  ai: { fire: ['negative-leave', 'missing-fixed-shift'], miss: [] }
});

/* =============== Nhóm LỊCH ƯỚC TÍNH, DUYỆT, TIỀN =============== */
add('Lịch và duyệt', 'leave_ok', {
  type: 'nv',
  level: 2,
  shiftCode: 'n1',
  startDate: '2025-03-03',
  cal: { '2026-10': { edits: { [oct(8)]: E.leave, [oct(13)]: E.approved, [oct(14)]: E.approved } } },
  decisions: [decide(oct(8), 'approved', FIRST_PASS)],
  slip: [
    { month: '2026-10', at: '2026-11-08T10:00', values: (mo?) => ({ attendance: Math.round(mo.attendance) + 10000 }) }
  ],
  covers: ['C02', 'C09', 'C38'],
  expect:
    'Nghỉ phép năm 08/10 (còn nhiều phép, đã duyệt), Nghỉ được duyệt 2 lần (13, 14/10, chờ duyệt, dưới ngưỡng AI 3 lần) và phiếu lương sửa chuyên cần +10.000 ₫ (nhỏ).',
  ai: { fire: [], miss: ['approved-leave-frequency', 'slip-override-gap'] }
});
add('Lịch và duyệt', 'leave_exhaust', {
  type: 'ctv',
  level: 3,
  shiftCode: 'n1',
  // vào làm 15/05/2026 để đủ 6 ngày phép tới 17/11: từ 23/10/2026 (THAO-LUAN Đ35) không còn +1 ngày đầu đi làm,
  // nên mốc 01/06/2026 chỉ cộng 5 ngày và ngày phép thứ 6 sẽ vượt số dư (máy chủ từ chối)
  startDate: '2026-05-15',
  birthday: '1998-12-20',
  cal: {
    '2026-07': { edits: { [jul(14)]: E.leave } },
    '2026-08': { edits: { [aug(12)]: E.leave } },
    '2026-09': { edits: { [sep(15)]: E.leave } },
    '2026-10': { edits: { [oct(6)]: E.leave, [oct(20)]: E.leave } },
    '2026-11': [{ at: '2026-11-10T09:00', edits: { [nov(17)]: E.leave, [nov(19)]: E.unpaid } }]
  },
  decisions: approveAll([oct(6), oct(20)], FIRST_PASS),
  covers: ['C03', 'C05'],
  expect:
    'Dùng đúng hết phép: 6 ngày phép (07/14, 08/12, 09/15, 10/06, 10/20, 11/17) bằng số phép được cộng đến 17/11. Sau đó nghỉ không lương Thứ 5 19/11 (hết phép nên được phép). Số dư phép = 0, không âm.',
  ai: { fire: [], miss: ['negative-leave'] }
});
add('Lịch và duyệt', 'unpaid_days', {
  type: 'ctv',
  level: 1,
  shiftCode: 'n1',
  startDate: '2025-03-03',
  cal: { '2026-10': { edits: { [oct(14)]: E.unpaid, [oct(17)]: E.unpaid } } },
  covers: ['C04', 'C05'],
  unreasonable: true,
  expect:
    'Nghỉ không lương Thứ 7 17/10 (được phép) và Thứ 4 14/10 khi còn nhiều phép năm (luật cấm: ngày thường phải dùng phép trước). Máy chủ hôm nay sẽ từ chối ngày 14/10.'
});
add('Lịch và duyệt', 'wmu_months', {
  type: 'nv',
  level: 2,
  shiftCode: 'n1',
  cal: {
    '2026-07': {
      edits: { [jul(7)]: E.willmakeup, [jul(8)]: E.makeupHours('22:00'), [jul(9)]: E.makeupHours('22:00') }
    },
    '2026-08': { edits: { [aug(11)]: E.willmakeup, [aug(12)]: E.makeupHours('22:00') } },
    '2026-09': { edits: { [sep(8)]: E.willmakeup } },
    '2026-10': {
      edits: {
        [oct(12)]: E.willmakeup,
        [oct(8)]: E.makeupHours('22:00', '06:00'),
        [oct(15)]: E.makeupHours('19:00')
      }
    }
  },
  decisions: approveAll([oct(8), oct(15)], '2026-11-06T09:00'),
  covers: ['C06', 'C07', 'C08', 'C15'],
  expect:
    'Mỗi tháng một kiểu nghỉ sẽ làm bù: tháng 07 bù đủ 8 giờ, tháng 08 bù 4 giờ (một phần), tháng 09 không bù, tháng 10 bù đủ 8 giờ gồm giờ bù trước ca (06:00–08:00) và sau ca, trước và sau ngày thiếu 12/10.'
});
add('Lịch và duyệt', 'approved3', {
  type: 'nv',
  level: 1,
  shiftCode: 'n1',
  cal: { '2026-10': { edits: entries(oct, [6, 7, 8], E.approved) } },
  covers: ['C09', 'C25'],
  expect: 'Nghỉ được duyệt 3 lần trong tháng 10 (06, 07, 08/10), đều chờ duyệt: lần thứ 3 chạm ngưỡng nhắc của AI.',
  ai: {
    fire: [{ rule: 'approved-leave-frequency', date: oct(8) }],
    miss: [{ rule: 'approved-leave-frequency', date: oct(7) }]
  }
});
add('Lịch và duyệt', 'isat_months', {
  type: 'nv',
  level: 1,
  shiftCode: 'n1',
  cal: {
    '2026-07': { edits: entries(jul, [4], E.isat) },
    '2026-08': { edits: entries(aug, [1, 8, 15], E.isat) },
    '2026-09': { edits: entries(sep, [5, 12, 19, 26], E.isat) },
    '2026-10': { edits: entries(oct, [3, 10, 17, 24, 31], E.isat) }
  },
  decisions: approveAll([oct(3), oct(10)], FIRST_PASS),
  covers: ['C10', 'C11', 'C12', 'C13', 'C26', 'C30'],
  expect:
    'iSAT mỗi Thứ 7: tháng 07 một lần, tháng 08 ba lần, tháng 09 bốn lần, tháng 10 năm lần. Tháng 10: 03 và 10 đã duyệt; 17 (lần 3, dưới ngưỡng), 24 (lần 4) và 31 (lần 5) chờ duyệt: AI nhắc từ lần thứ 4.',
  ai: {
    fire: [
      { rule: 'isat-frequency', date: oct(24) },
      { rule: 'isat-frequency', date: oct(31) }
    ],
    miss: [
      { rule: 'isat-frequency', date: oct(17) },
      { rule: 'large-pay-impact', date: oct(17) }
    ]
  }
});
add('Lịch và duyệt', 'tts_sat', {
  type: 'tts',
  level: 2,
  shiftCode: 'n1',
  att: { extra: { [oct(10)]: ['08:00', '17:00'], [nov(8)]: ['08:00', '12:00'] } },
  covers: ['A11'],
  expect:
    'TTS Check-in Thứ 7 10/10 và Chủ nhật 08/11: đều là ngày ngoài lịch (không có yêu cầu OT hay làm bù được duyệt), lượt chấm công thành "Ngoài ca cố định", chờ Admin.'
});
add('Lịch và duyệt', 'ot_ok', {
  type: 'nv',
  level: 2,
  shiftCode: 'n1',
  cal: {
    '2026-10': {
      edits: {
        [oct(6)]: E.ot('19:00'),
        [oct(7)]: E.ot('22:00'),
        [oct(13)]: E.makeupHours('19:00'),
        [oct(20)]: E.ot('18:00')
      }
    }
  },
  decisions: [decide(oct(13), 'approved', FIRST_PASS)],
  covers: ['C16', 'C17', 'A01'],
  expect:
    'OT trong trần: 06/10 hai giờ, 07/10 đúng 4 giờ (17:00–22:00), 20/10 một giờ; tổng 7 giờ. Làm bù 13/10 đã duyệt trước OT 20/10 (không còn khoản bù chờ duyệt). Chấm công phủ đủ giờ khai. Cặp gần ngưỡng của 4 luật OT.',
  ai: {
    fire: [],
    miss: [
      'ot-above-team',
      { rule: 'ot-after-pending-makeup', date: oct(20) },
      { rule: 'ot-checkin-mismatch', date: oct(6) },
      { rule: 'ot-checkin-mismatch', date: oct(7) }
    ]
  }
});
add('Lịch và duyệt', 'ot_months', {
  type: 'nv',
  level: 3,
  shiftCode: 'n1',
  cal: {
    '2026-10': {
      edits: { [oct(6)]: E.ot('22:00'), [oct(7)]: E.ot('22:00'), [oct(8)]: E.ot('22:00'), [oct(9)]: E.ot('19:00') }
    },
    '2026-11': [
      {
        at: '2026-11-10T09:00',
        edits: { [nov(3)]: E.ot('22:00'), [nov(4)]: E.ot('22:00'), [nov(5)]: E.ot('22:00'), [nov(6)]: E.ot('22:00') }
      }
    ]
  },
  covers: ['C17'],
  expect: 'Tháng 10: OT 4 + 4 + 4 + 2 = 14 giờ. Tháng 11: 4 ngày × 4 giờ = 16 giờ. OT cao hơn nhiều so với nhóm.',
  ai: {
    fire: ['ot-above-team'],
    miss: []
  }
});
add('Lịch và duyệt', 'ot_over20', {
  type: 'nv',
  level: 2,
  shiftCode: 'n1',
  cal: {
    '2026-10': {
      edits: { ...entries(oct, [6, 7, 8, 9, 10], E.ot('22:00')), [oct(12)]: E.ot('23:00') }
    }
  },
  covers: ['C16'],
  unreasonable: true,
  expect:
    'OT nhiều: 5 ngày × 4 giờ = 20 giờ và 12/10 OT kéo tới 23:00 (5 giờ, chạm khung đêm). AI báo OT cao hơn nhóm.',
  ai: { fire: ['ot-above-team'], miss: [] }
});
add('Lịch và duyệt', 'ot_after_makeup', {
  type: 'nv',
  level: 2,
  shiftCode: 'n1',
  cal: { '2026-10': { edits: { [oct(13)]: E.makeupHours('19:00'), [oct(20)]: E.ot('19:00') } } },
  covers: ['C20', 'C25'],
  expect: 'Làm bù 13/10 và OT 20/10 cùng chờ duyệt: OT chỉ được tính khi giờ bù các ngày trước đã cân.',
  ai: { fire: [{ rule: 'ot-after-pending-makeup', date: oct(20) }], miss: [] }
});
add('Lịch và duyệt', 'hw_pending', {
  type: 'ctv',
  level: 2,
  shiftCode: 'n1',
  cal: {
    '2026-11': [
      {
        at: '2026-11-10T09:00',
        edits: { [nov(3)]: E.ot('22:00'), [nov(5)]: E.ot('19:00'), [nov(24)]: E.work() }
      }
    ]
  },
  decisions: [decide(nov(3), 'approved', '2026-11-18T09:00'), decide(nov(5), 'approved', '2026-11-18T09:00')],
  covers: ['C22'],
  expect:
    'Đi làm ngày lễ 24/11 (8 giờ ×3 = 692.308 ₫ cho CTV L2) đang chờ duyệt, cộng 6 giờ OT đã duyệt. AI nhắc "đi làm ngày lễ" và "tác động lớn".',
  ai: {
    fire: [
      { rule: 'holiday-work-review', date: nov(24) },
      { rule: 'large-pay-impact', date: nov(24) }
    ],
    miss: []
  }
});
add('Lịch và duyệt', 'night_hol', {
  type: 'nv',
  level: 2,
  shiftCode: 'g2',
  nightPct: 60,
  cal: {
    '2026-09': { edits: { [sep(1)]: E.work(), [sep(2)]: E.work() } },
    '2026-11': [{ at: '2026-11-10T09:00', edits: { [nov(23)]: E.work(), [nov(24)]: E.work() } }]
  },
  decisions: [decide(nov(24), 'approved', '2026-11-25T09:00')],
  covers: ['C21', 'C23', 'A10', 'S07'],
  expect:
    'Ca đêm g2 qua nửa đêm sang ngày lễ: 31/08 22:00 sang 01/09 (lễ, qua ranh giới tháng 08/09), 01/09 và 02/09 làm ngày lễ (hệ thống duyệt), 23/11 sang 24/11 (lễ ×3). Làm lễ 24/11 đã duyệt nên AI không nhắc.',
  ai: { fire: [], miss: ['holiday-work-review'] }
});
add('Lịch và duyệt', 'att_months', {
  type: 'nv',
  level: 2,
  shiftCode: 'n1',
  cal: {
    '2026-07': { edits: entries(jul, [6, 7, 8], E.leave) },
    '2026-08': { edits: entries(aug, [10, 11], E.leave) },
    '2026-10': { edits: entries(oct, [6, 7], E.leave) }
  },
  decisions: approveAll([oct(6), oct(7)], FIRST_PASS),
  covers: ['C32', 'C33', 'C02'],
  expect:
    'Chuyên cần theo tháng: tháng 07 nghỉ đúng 3 ngày phép (mất chuyên cần), tháng 08 và 10 nghỉ 2 ngày (còn chuyên cần). Tháng 10 đã duyệt hết: cặp gần ngưỡng của luật chuyên cần.',
  ai: { fire: [], miss: ['attendance-allowance-risk'] }
});
add('Lịch và duyệt', 'att_tip', {
  type: 'nv',
  level: 2,
  shiftCode: 'n1',
  cal: { '2026-10': { edits: entries(oct, [6, 7, 8], E.leave) } },
  decisions: approveAll([oct(6), oct(7)], FIRST_PASS),
  covers: ['C32', 'C25'],
  expect:
    'Hai ngày phép 06 và 07/10 đã duyệt, ngày phép thứ 3 (08/10) còn chờ: ngày này là ngày nghỉ thứ 3 làm mất chuyên cần. Không có Check-in ngày 08/10.',
  ai: {
    fire: [{ rule: 'attendance-allowance-risk', date: oct(8) }],
    miss: [{ rule: 'leave-with-checkin', date: oct(8) }]
  }
});
add('Lịch và duyệt', 'over_hours', {
  type: 'nv',
  level: 1,
  shiftCode: null,
  freeHours: ['08:30', '17:30'],
  att: false,
  cal: {
    '2026-09': {
      edits: {
        ...entries(sep, [5, 19], E.unpaid),
        ...entries(sep, [7, 8, 9, 10, 11, 14, 15], E.hours('08:00', '16:00')),
        [sep(16)]: E.hours('08:00', '16:15')
      }
    },
    '2026-10': {
      edits: {
        ...entries(oct, [3, 17], E.unpaid),
        ...entries(oct, [5, 6, 7, 8, 9, 12, 13], E.hours('08:00', '16:00')),
        [oct(14)]: E.hours('08:00', '15:45')
      }
    }
  },
  covers: ['C34', 'C35', 'S05'],
  expect:
    'Chưa có ca cố định nên khai giờ tự do. Tháng 09: 2 ngày nghỉ không lương + giờ thiếu 7,75 = giờ vượt ngưỡng 23,75 (còn chuyên cần). Tháng 10: giờ thiếu 8,25 = giờ vượt ngưỡng 24,25 (mất chuyên cần), cùng số ngày nghỉ. Không Check-in được vì chưa có ca: tháng 11 tính nghỉ cả tháng (đây là lý do AI báo thiếu ca cố định mức cao).',
  ai: { fire: ['missing-fixed-shift'], miss: [] }
});

/* =============== Nhóm DUYỆT: trạng thái, sửa sau duyệt, khai sau hạn =============== */
add('Duyệt', 'ap_mix', {
  type: 'nv',
  level: 2,
  shiftCode: 'n1',
  cal: { '2026-10': { edits: { ...entries(oct, [3, 10, 17], E.isat), [oct(20)]: E.ot('19:00') } } },
  decisions: [
    decide(oct(3), 'approved', FIRST_PASS),
    decide(oct(10), 'rejected', '2026-11-05T09:05', 'Thứ 7 này trùng đợt hỗ trợ cao điểm, cần làm việc'),
    decide(oct(17), 'approved', '2026-11-05T09:10'),
    decide(oct(17), 'rejected', SECOND_PASS, 'Đổi quyết định: bộ phận báo cần người trực ngày này')
  ],
  covers: ['C25', 'C26', 'C27', 'C28', 'C11'],
  expect:
    'Đủ bốn trạng thái: iSAT 03/10 đã duyệt, 10/10 từ chối có lý do, 17/10 duyệt rồi đổi thành từ chối (có lý do), OT 20/10 còn chờ. Có iSAT bị từ chối nhưng khoản chờ là loại khác (OT): không "lần trước bị từ chối".',
  ai: { fire: [], miss: [{ rule: 'previously-rejected', date: oct(20) }] }
});
add('Duyệt', 'ap_edit', {
  type: 'nv',
  level: 2,
  shiftCode: 'n1',
  cal: {
    '2026-10': [
      { at: '2026-10-31T19:00', edits: { [oct(6)]: E.ot('19:00') } },
      { at: '2026-11-06T10:00', edits: { [oct(6)]: E.ot('20:00') } }
    ]
  },
  decisions: [decide(oct(6), 'approved', FIRST_PASS)],
  covers: ['C29', 'C37', 'C36'],
  expect:
    'OT 06/10 đã được duyệt (rev 2), nhân sự sửa lại giờ OT ngày 06/11 nên về chờ duyệt (rev 3) và bị tính khai sau hạn mùng 3.',
  ai: {
    fire: [
      { rule: 'repeated-edits', date: oct(6) },
      { rule: 'late-declaration', date: oct(6) }
    ],
    miss: []
  }
});
add('Duyệt', 'ap_rev2', {
  type: 'nv',
  level: 2,
  shiftCode: 'n1',
  cal: {
    '2026-10': [
      { at: '2026-10-31T19:00', edits: { [oct(6)]: E.ot('19:00') } },
      { at: '2026-11-03T23:30', edits: { [oct(6)]: E.ot('20:00') } }
    ]
  },
  covers: ['C37', 'C36'],
  expect:
    'OT 06/10 sửa một lần (rev 2) lúc 23:30 ngày 03/11: còn trong hạn (hết ngày mùng 3), dưới ngưỡng "đổi nhiều lần".',
  ai: {
    fire: [],
    miss: [
      { rule: 'repeated-edits', date: oct(6) },
      { rule: 'late-declaration', date: oct(6) }
    ]
  }
});
add('Duyệt', 'sep_sys', {
  type: 'nv',
  level: 2,
  shiftCode: 'n1',
  cal: {
    '2026-09': [
      {
        at: '2026-09-04T18:00',
        edits: { [sep(5)]: E.isat, [sep(8)]: E.ot('19:00'), [sep(11)]: E.leave, [sep(2)]: E.work() }
      }
    ],
    '2026-10': { edits: { [oct(3)]: E.isat } }
  },
  decisions: [decide(sep(5), 'rejected', '2026-09-12T10:00', 'Đổi quyết định: ngày này thiếu người trực')],
  covers: ['C30', 'C31', 'C25', 'C27'],
  expect:
    'Khoản tháng 09 (iSAT, OT, nghỉ phép, làm lễ 02/09) hệ thống coi như đã duyệt; Admin đổi iSAT 05/09 thành từ chối ngày 12/09 (quá 60 ngày so với hôm nay). iSAT 03/10 mặc định chờ duyệt: lần từ chối cũ quá hạn tra cứu nên AI không nhắc.',
  ai: { fire: [], miss: [{ rule: 'previously-rejected', date: oct(3) }] }
});
add('Duyệt', 'late_decl', {
  type: 'nv',
  level: 2,
  shiftCode: 'n1',
  cal: {
    '2026-10': [
      { at: '2026-10-31T19:00', edits: {} },
      { at: '2026-11-04T00:30', edits: { [oct(13)]: E.ot('19:00') } }
    ]
  },
  covers: ['C36', 'C25'],
  expect: 'OT 13/10 khai lúc 00:30 ngày 04/11: sau hạn mùng 3 (hạn tính hết 23:59 ngày 03/11).',
  ai: { fire: [{ rule: 'late-declaration', date: oct(13) }], miss: [] }
});
add('Duyệt', 'rej_prev', {
  type: 'nv',
  level: 2,
  shiftCode: 'n1',
  cal: { '2026-10': { edits: entries(oct, [3, 17], E.isat) } },
  decisions: [decide(oct(3), 'rejected', FIRST_PASS, 'Thứ 7 này phải trực kiểm kê cuối quý')],
  covers: ['C27', 'C25'],
  expect: 'iSAT 03/10 bị từ chối ngày 05/11, iSAT 17/10 cùng loại còn chờ: AI nhắc "lần trước bị từ chối".',
  ai: { fire: [{ rule: 'previously-rejected', date: oct(17) }], miss: [] }
});

/* =============== Nhóm KPI =============== */
add('KPI', 'kpi100', {
  type: 'ctv',
  level: 2,
  shiftCode: 'n1',
  kpi: {
    '2026-07': { pct: 90, amt: 3000000, admPct: 90, admAmt: 3000000 },
    '2026-08': { pct: 100, amt: 3000000 },
    '2026-09': { pct: 100, amt: 3000000 },
    '2026-10': { pct: 100, amt: 3000000 }
  },
  covers: ['K01', 'K12'],
  expect:
    'Tự đánh giá KPI 100% tháng 08, 09, 10 liền nhau, chưa có % Admin duyệt (tháng 07 đã duyệt 90%). Tháng 11 tính KPI 5 thành phần: chờ điểm.',
  ai: { fire: [], miss: [] } // kpi-self-100-streak luôn bị bỏ qua theo thiết kế (DISABLED_BY_DESIGN)
});
add('KPI', 'kpi100_near', {
  type: 'ctv',
  level: 1,
  shiftCode: 'n2',
  kpi: {
    '2026-07': { pct: 90, amt: 1500000, admPct: 90, admAmt: 1500000 },
    '2026-08': { pct: 99, amt: 1500000 },
    '2026-09': { pct: 100, amt: 1500000 },
    '2026-10': { pct: 100, amt: 1500000 }
  },
  covers: ['K01'],
  expect: 'Tự đánh giá 99% tháng 08 rồi 100% hai tháng 09, 10: chuỗi 100% chỉ có 2 tháng, chưa tới ngưỡng 3 tháng.',
  ai: { fire: [], miss: ['kpi-self-100-streak'] }
});
add('KPI', 'kpi_months', {
  type: 'nv',
  level: 3,
  shiftCode: 'n1',
  kpi: {
    '2026-07': { pct: 60, amt: 7000000 },
    '2026-08': { pct: 75, amt: 7000000, admPct: 75, admAmt: 7000000 },
    '2026-09': { pct: 90, amt: 7000000, admPct: 85, admAmt: 6000000 },
    '2026-10': { pct: 100, amt: 7000000, admPct: 95, admAmt: 7000000 }
  },
  slip: [{ month: '2026-10', at: '2026-11-08T10:00', values: (mo?) => ({ kpiPay: Math.round(mo.kpiPay) + 4123000 }) }],
  covers: ['K02', 'K03', 'K04', 'C39'],
  expect:
    'KPI cũ mỗi tháng một kiểu: 07 tự đánh giá 60% (dưới 75, không có tiền KPI), 08 đúng 75% (Admin duyệt 75%), 09 Admin duyệt 85% và mức 6.000.000, 10 Admin duyệt 95%. Phiếu tháng 10 bị Admin sửa tiền KPI còn 60% (lệch lớn).',
  ai: { fire: ['slip-override-gap'], miss: ['kpi-self-100-streak', 'override-looks-like-entry'] }
});
add('KPI', 'kpi_cap', {
  type: 'ctv',
  level: 2,
  shiftCode: 'n1',
  kpi: {
    '2026-08': { pct: 90, amt: 3000000, admPct: 90, admAmt: 3000000 },
    '2026-09': { pct: 90, amt: 3000000, admPct: 90, admAmt: 12000000 },
    '2026-10': { pct: 90, amt: 8000000, admPct: 90, admAmt: 9000000 }
  },
  covers: ['K05'],
  unreasonable: true,
  expect:
    'Mức KPI đề xuất và mức Admin duyệt vượt trần level 2 (3.000.000), ví dụ 9.000.000 và 12.000.000 (dữ liệu cũ; máy chủ nay chặn). Công thức kẹp về trần khi tính tiền.'
});
const FIVE_AT = '2026-11-20T10:00';
add('KPI', 'k5_pass', {
  type: 'nv',
  level: 1,
  shiftCode: 'n1',
  kpi: {
    '2026-07': { pct: 85, amt: 6000000, admPct: 85, admAmt: 6000000 },
    '2026-08': { pct: 85, amt: 6000000, admPct: 85, admAmt: 6000000 },
    '2026-09': { pct: 90, amt: 6000000, admPct: 90, admAmt: 6000000 },
    '2026-10': { pct: 90, amt: 6000000 }
  },
  scores: [
    {
      month: '2026-11',
      at: FIVE_AT,
      scores: { wework: 100, user: 90, peer: 80, manager: 85, self: 100 },
      amt: 6000000,
      reason: 'Nhập điểm tháng 11'
    }
  ],
  covers: ['K07', 'K12'],
  expect:
    'KPI 5 thành phần đủ điểm 100/90/80/85/100: tổng 92,2%, NV L1 mức 6.000.000 ₫ → 5.532.000 ₫. Tháng 10 vẫn tính KPI cũ (self 90%).'
});
add('KPI', 'k5_incomplete', {
  type: 'nv',
  level: 1,
  shiftCode: 'n2',
  scores: [
    { month: '2026-11', at: FIVE_AT, scores: { wework: 90, user: 80, peer: 85 }, reason: 'Mới nhập 3 trên 5 điểm' }
  ],
  covers: ['K08'],
  expect: 'Mới có 3 trong 5 điểm KPI: "chờ điểm", tiền KPI tháng 11 = 0 ₫.'
});
add('KPI', 'k5_wework74', {
  type: 'nv',
  level: 1,
  shiftCode: 'f1',
  scores: [
    {
      month: '2026-11',
      at: FIVE_AT,
      scores: { wework: 74, user: 100, peer: 100, manager: 100, self: 100 },
      reason: 'Base Wework thấp'
    }
  ],
  covers: ['K09'],
  expect: 'Base Wework 74 (dưới cổng 75) dù bốn điểm khác 100: tiền KPI tháng 11 = 0 ₫.'
});
add('KPI', 'k5_all75', {
  type: 'nv',
  level: 1,
  shiftCode: 'n1',
  scores: [
    {
      month: '2026-10',
      at: '2026-10-20T10:00',
      scores: { wework: 100, user: 100, peer: 100, manager: 100, self: 100 },
      reason: 'Điểm nhập trước ngày bật KPI 5 thành phần (chưa có hiệu lực)'
    },
    {
      month: '2026-11',
      at: FIVE_AT,
      scores: { wework: 75, user: 75, peer: 75, manager: 75, self: 75 },
      amt: 6000000,
      reason: 'Nhập điểm tháng 11'
    }
  ],
  covers: ['K10', 'K12'],
  expect:
    'Cả năm điểm đúng 75 (đúng mốc đạt): NV L1 mức 6.000.000 ₫ → 4.500.000 ₫. Điểm 100 của tháng 10 nhập trước ngày bật nên không có hiệu lực (tháng 10 vẫn KPI cũ).'
});
add('KPI', 'k5_below', {
  type: 'ctv',
  level: 2,
  shiftCode: 'n2',
  scores: [
    {
      month: '2026-11',
      at: FIVE_AT,
      scores: { wework: 80, user: 70, peer: 70, manager: 70, self: 70 },
      reason: 'Tổng 74%'
    }
  ],
  covers: ['K11'],
  expect: 'Wework 80 qua cổng nhưng tổng 74% (dưới mốc đạt 75%): tiền KPI tháng 11 = 0 ₫.'
});

/* =============== Nhóm THUẾ, BẢO HIỂM, THỰC LĨNH =============== */
add('Thuế và BH', 'noins14', {
  type: 'nv',
  level: 3,
  shiftCode: 'n1',
  cal: { '2026-10': { edits: entries(oct, [1, 2, 5, 6, 7, 8, 9, 12, 13, 14, 15, 16, 19, 20], E.approved) } },
  decisions: approveAll([1, 2, 5, 6, 7, 8, 9, 12, 13, 14, 15, 16, 19, 20].map(oct), FIRST_PASS),
  covers: ['T01', 'C09'],
  expect:
    'Nghỉ được duyệt (không lương) 14 ngày làm việc trong tháng 10, Admin đã duyệt hết: tháng này không đóng BH và không bị tính là ngày nghỉ khi xét chuyên cần.',
  ai: { fire: [], miss: ['approved-leave-frequency'] }
});
add('Thuế và BH', 'high_earner', {
  type: 'nv',
  level: 4,
  shiftCode: 'n1',
  idorm: false,
  deductOn: false,
  advanceOn: false,
  kpi: {
    '2026-08': { pct: 95, amt: 7500000, admPct: 95, admAmt: 7500000 },
    '2026-09': { pct: 95, amt: 7500000, admPct: 95, admAmt: 7500000 },
    '2026-10': { pct: 100, amt: 7500000, admPct: 100, admAmt: 7500000 }
  },
  cal: { '2026-10': { edits: entries(oct, [6, 7, 8, 9], E.ot('22:00')) } },
  decisions: approveAll([6, 7, 8, 9].map(oct), FIRST_PASS),
  slip: [{ month: '2026-10', at: '2026-11-08T10:00', values: (mo?) => ({ kpiPay: Math.round(mo.kpiPay) + 300000 }) }],
  covers: ['T02', 'S24', 'S06'],
  expect:
    'HDO (L4) KPI 100% + 16 giờ OT, Admin tắt giảm trừ gia cảnh và tạm ứng: thu nhập khoảng 19 triệu, thuế TNCN lên bậc 10% (tham số luật 2026 không cho lên bậc cao hơn). Phiếu sửa tiền KPI +600.000 ₫ nhưng chỉ lệch khoảng 8% (dưới 20%): sát ngưỡng của slip-override-gap. Số tăng đúng một số tròn nên override-looks-like-entry cũng bắn.',
  ai: { fire: ['ot-above-team', 'override-looks-like-entry'], miss: ['slip-override-gap'] }
});
add('Thuế và BH', 'net_neg', {
  type: 'ctv',
  level: 1,
  shiftCode: 'n1',
  kpi: false,
  cal: {
    '2026-10': {
      edits: {
        ...entries(oct, [12, 13, 14, 15, 16, 17, 19, 20, 21, 22, 23, 24, 26, 27, 28, 29, 30, 31], E.willmakeup)
      }
    }
  },
  covers: ['T05'],
  unreasonable: true,
  expect:
    'Làm 9 ngày đầu tháng 10 rồi "Nghỉ, sẽ làm bù" 18 ngày không bù: thu nhập chỉ khoảng 2,1 triệu, tạm ứng 80% lương 15 ngày đầu + BH lớn hơn: thực lĩnh âm.',
  ai: { fire: [], miss: [] } // net-nonpositive: bắn sau khi lớp vận hành lập khoản trừ lớn (scripts/db/demo/lifecycle.ts → payEntries)
});

/* =============== Nhóm CHECK-IN/OUT =============== */
add('Check-in/out', 'a_cuts', {
  type: 'ctv',
  level: 2,
  shiftCode: 'n1',
  att: {
    extra: {
      [oct(6)]: ['08:12', '17:03'],
      [nov(3)]: ['08:10', '17:02'],
      [nov(4)]: ['08:20', '17:05'],
      [nov(5)]: ['08:50', '17:00'],
      [nov(6)]: ['07:58', '16:35'],
      [nov(9)]: ['08:20', '16:40'],
      [nov(10)]: ['07:55', '16:50'],
      [nov(11)]: ['09:30', '17:00']
    }
  },
  corrections: [
    {
      at: '2026-11-12T09:00',
      date: nov(11),
      in: '08:05',
      out: '17:00',
      reason: 'Kẹt xe sáng, trưởng nhóm xác nhận có mặt từ 08:05'
    }
  ],
  covers: ['A02', 'A03', 'A04', 'A05', 'A06', 'A13'],
  expect:
    'Tháng 11 (tính theo giờ thực tế): 03/11 trễ 10 phút (không trừ), 04/11 trễ 20 (trừ 30), 05/11 trễ 50 (trừ 60), 06/11 về sớm 25 (trừ 30), 09/11 trễ 20 và về sớm 20 (trừ 30 + 30), 10/11 về sớm 10 (không trừ), 11/11 vào 09:30 rồi Admin điều chỉnh 08:05–17:00 kèm lý do (lượt gốc được giữ).'
});
add('Check-in/out', 'a_forgot', {
  type: 'nv',
  level: 2,
  shiftCode: 'n1',
  att: {
    extra: { [nov(9)]: ['08:01', null], [nov(10)]: ['07:58', '17:03'], [nov(25)]: ['08:00', null], [nov(26)]: null }
  },
  covers: ['A07', 'A17'],
  expect:
    '09/11 Check-in rồi quên Check-out: sang 10/11 máy chủ đóng lượt sau 16 giờ ("Quên check-out", chờ Admin). 25/11 Check-in và không Check-out: lượt vẫn mở dù quá 16 giờ vì chưa ai chạm vào.'
});
add('Check-in/out', 'a_broken', {
  type: 'ctv',
  level: 1,
  shiftCode: 'n1',
  att: { extra: { [nov(12)]: null, [nov(13)]: null } },
  raw: ['onlyOut', 'overlap', 'rawPunches'],
  covers: ['A08', 'B06', 'B10'],
  unreasonable: true,
  expect:
    '12/11 chỉ có lượt ra (không có lượt vào); 13/11 hai lượt chồng giờ (08:00–12:00 và 11:00–17:00); thêm lượt chấm công thô không có phiên và dòng attendance_days cũ. Máy chủ hiện nay không tạo ra các dòng này.'
});
add('Check-in/out', 'a_gaps', {
  type: 'nv',
  level: 2,
  shiftCode: 'n1',
  att: {
    extra: {
      [nov(11)]: [
        ['08:00', '12:00'],
        ['13:00', '17:05']
      ],
      [nov(16)]: null,
      [nov(17)]: null
    }
  },
  covers: ['A09', 'A12', 'C01'],
  expect:
    '11/11 hai lượt trong ngày (nghỉ trưa ra ngoài); 16 và 17/11 có lịch (ngày trống = đi làm) nhưng không chấm công: tháng 11 tính là nghỉ không phép, ảnh hưởng chuyên cần.'
});
add('Check-in/out', 'a_ot_check', {
  type: 'nv',
  level: 2,
  shiftCode: 'n1',
  cal: {
    '2026-10': {
      edits: { [oct(6)]: E.ot('19:00'), [oct(7)]: E.ot('19:00'), [oct(8)]: E.ot('19:00'), [oct(14)]: E.leave }
    }
  },
  att: {
    extra: {
      [oct(6)]: ['07:58', '17:40'],
      [oct(7)]: ['07:57', '18:40'],
      [oct(8)]: null,
      [oct(14)]: ['08:05', '17:10']
    }
  },
  covers: ['A14', 'A15', 'A16'],
  expect:
    'OT khai 17:00–19:00 ba ngày: 06/10 Check-out 17:40 (phủ 40 phút, thiếu 80), 07/10 Check-out 18:40 (thiếu 20 phút, sát ngưỡng 30), 08/10 không có Check-in nào. Thêm: có Check-in ngày 14/10 đã khai nghỉ phép.',
  ai: {
    fire: [
      { rule: 'ot-checkin-mismatch', date: oct(6) },
      { rule: 'ot-checkin-mismatch', date: oct(8) },
      { rule: 'leave-with-checkin', date: oct(14) }
    ],
    miss: [{ rule: 'ot-checkin-mismatch', date: oct(7) }]
  }
});

/* =============== Nhóm DỮ LIỆU CŨ HỎNG trong lịch ước tính =============== */
add('Dữ liệu hỏng', 'br_legacy', {
  type: 'nv',
  level: 2,
  shiftCode: 'n1',
  att: { from: '2026-11-01' },
  rawDays: {
    '2026-10': {
      [oct(7)]: {
        kind: 'work',
        shift: 'normal',
        in: '08:00',
        out: '17:00',
        extraKind: 'makeup',
        extraIn: '17:00',
        extraOut: '21:00',
        preset: 'n1',
        breakMin: 0
      },
      [oct(8)]: {
        kind: 'work',
        shift: 'normal',
        in: '08:00',
        out: '17:00',
        extraOut: '19:00',
        preset: 'n1',
        breakMin: 0
      },
      [oct(9)]: {
        kind: 'work',
        shift: 'normal',
        in: '08:00',
        out: '17:00',
        extraKind: 'makeup',
        extraIn: '',
        extraOut: '23:30',
        preset: 'n1',
        breakMin: 0
      },
      [oct(11)]: {
        kind: 'work',
        shift: 'normal',
        in: '08:00',
        out: '17:00',
        extraKind: '',
        extraIn: '',
        extraOut: '',
        preset: 'n1',
        breakMin: 0
      },
      [oct(13)]: { kind: 'wfh' },
      [oct(14)]: {
        kind: 'pending',
        reason: 'forgot-out',
        src: 'punch',
        presIn: '2026-10-14T01:00:00.000Z',
        plannedShift: { code: 'n1', date: oct(14), in: '08:00', out: '17:00' }
      },
      [oct(15)]: { in: '08:00', out: '17:00' },
      '2026-11-02': {
        kind: 'work',
        shift: 'normal',
        in: '08:00',
        out: '17:00',
        extraKind: '',
        extraIn: '',
        extraOut: '',
        preset: 'n1',
        breakMin: 0
      },
      '2026-10-32': { kind: 'work', shift: 'normal', in: '08:00', out: '17:00' }
    }
  },
  raw: ['selfApprove', 'staleFingerprint'],
  covers: ['B01', 'B02', 'B03', 'B04', 'B05', 'B07', 'B08', 'B09'],
  unreasonable: true,
  expect:
    'Lịch tháng 10 chứa bản ghi cũ: 07/10 làm bù liền 28 giờ (17:00 hôm trước tới 21:00), 08/10 có extraOut mà thiếu extraKind, 09/10 làm bù tới 23:30 (chạm khung đêm), 11/10 làm việc Chủ nhật, 13/10 loại ngày "wfh", 14/10 dấu vết chấm công trong lịch, 15/10 không có kind, khoá ngày 02/11 nằm trong lịch tháng 10, khoá ngày 32/10 không tồn tại; dòng duyệt 07/10 tự duyệt (người duyệt = chính người đó) và dòng 09/10 đã duyệt nhưng lịch đã đổi.'
});

// Loại nhân sự không có trong bảng tham số (dữ liệu cũ hoặc sửa tay): máy chủ không cho tạo ra từ giao diện, nhưng DB cũ có thể có.
// Phiếu của người này phải thành phiếu LỖI (PAYROLL_BAD_TYPE), không tính ra 0 đồng âm thầm, và không chặn các phiếu khác.
add('Hồ sơ bất thường', 'bad_type', {
  type: 'intern',
  level: 1,
  shiftCode: 'n1',
  att: false,
  covers: ['S26', 'P03'],
  unreasonable: true,
  expect:
    'Loại nhân sự "intern" không có trong bảng (chỉ có tts, ctv, nv): bước tính lương của kỳ 10/2026 ra phiếu lỗi PAYROLL_BAD_TYPE; phải sửa loại trong hồ sơ rồi tính lại thì mới có lương. Lịch và Check-in/out vẫn lưu bình thường.'
});

/* =============== Kỳ vọng của KỲ LƯƠNG THÁNG 10 (chốt công → tính lương → AI kiểm tra) ===============
 * Kiểm bằng hai đường, cùng một bảng:
 *   - selfcheck.js (chạy cuối `npm run seed:demo`): tính trong tiến trình bằng payroll-service + review(), không ghi gì vào DB;
 *   - period-check.js: chạy đúng các route của Admin (lock-attendance, calculate, ai-review...) trên MỘT BẢN SAO của DB.
 * PAYSLIP[tag] = kỳ vọng của phiếu tháng 10 của persona demo_<tag>:
 *   status     'error' hoặc 'pending' (phiếu thường đã qua AI kiểm tra thì ở 'pending')
 *   errorCode  mã phiếu lỗi (chỉ khi status = 'error')
 *   flags      các mã luật PHẢI có trên phiếu (có thể còn mã khác)
 *   noFlags    true = phiếu sạch, KHÔNG được có cờ nào (người "gần ngưỡng nhưng không vi phạm")
 * PERIOD_EXPECT = kỳ vọng gộp của cả kỳ (số tối thiểu hoặc chính xác), để thử bộ lọc, loại phiếu lỗi khi duyệt kỳ, bỏ qua phát hiện...
 */
const PAYSLIP_MONTH = '2026-10';
const PAYSLIP = {
  bad_profile: { status: 'error', errorCode: 'PAYROLL_BAD_LEVEL', flags: ['missing-fixed-shift', 'negative-leave'] },
  bad_type: { status: 'error', errorCode: 'PAYROLL_BAD_TYPE' },
  isat_months: { status: 'pending', flags: ['isat-frequency'] },
  approved3: { status: 'pending', flags: ['approved-leave-frequency'] },
  late_decl: { status: 'pending', flags: ['late-declaration'] },
  ap_edit: { status: 'pending', flags: ['late-declaration', 'repeated-edits'] },
  rej_prev: { status: 'pending', flags: ['previously-rejected'] },
  a_ot_check: { status: 'pending', flags: ['leave-with-checkin', 'ot-checkin-mismatch'] },
  ot_after_makeup: { status: 'pending', flags: ['ot-after-pending-makeup'] },
  att_tip: { status: 'pending', flags: ['attendance-allowance-risk'] },
  ot_months: { status: 'pending', flags: ['ot-above-team'] },
  ot_over20: { status: 'pending', flags: ['ot-above-team'] },
  high_earner: { status: 'pending', flags: ['ot-above-team'] },
  net_neg: { status: 'pending' },
  no_dates: { status: 'pending', flags: ['missing-start-date'] },
  over_hours: { status: 'pending', flags: ['missing-fixed-shift'] },
  kpi_months: { status: 'pending', flags: ['slip-override-gap'] },
  kpi100: { status: 'pending' },
  locked_pending: { status: 'pending', flags: ['locked-with-pending'] },
  // phiếu sạch: mỗi loại nhân sự ít nhất hai người, phiếu vào duyệt cả lô được
  tts1: { status: 'pending', noFlags: true },
  tts2: { status: 'pending', noFlags: true },
  ctv1: { status: 'pending', noFlags: true },
  ctv2: { status: 'pending', noFlags: true },
  nv1: { status: 'pending', noFlags: true },
  nv2: { status: 'pending', noFlags: true }
};
for (const [tag, want] of Object.entries<any>(PAYSLIP)) {
  const p = PERSONAS.find(x => x.username === `demo_${tag}`);
  if (!p) throw new Error(`PAYSLIP: không có persona demo_${tag}`);
  p.payslip = { month: PAYSLIP_MONTH, ...want };
  if (want.flags && want.flags.length && !p.covers.includes('P01')) p.covers.push('P01');
}
const PERIOD_EXPECT = {
  month: PAYSLIP_MONTH,
  errorCodes: { PAYROLL_BAD_LEVEL: 1, PAYROLL_BAD_TYPE: 1 }, // đúng hai phiếu lỗi, mỗi mã một
  minFlagged: 15, // ít nhất 15 phiếu có cờ AI
  minRules: 15, // và các cờ trải trên ít nhất 15 luật khác nhau
  types: ['tts', 'ctv', 'nv'], // đủ ba loại nhân sự trong kỳ
  attendanceKept: 1, // ít nhất một người còn phụ cấp chuyên cần (attendOk = true)
  attendanceLost: 1, // và ít nhất một người mất (attendOk = false)
  iDorm: 1, // ít nhất một người ở iDorm có phiếu thường
  advanceOff: 1 // ít nhất một người tắt tạm ứng có phiếu thường
};

module.exports = {
  UNITS,
  unitAt,
  nextCode,
  contractTypeOf,
  TODAY,
  NOW_TIME,
  NOW_LOCAL,
  MONTHS,
  HOLIDAYS,
  SETTINGS,
  KPI_MAX,
  CASES,
  CASE_TITLE,
  ADMINS,
  PERSONAS,
  PAYSLIP,
  PAYSLIP_MONTH,
  PERIOD_EXPECT,
  FIRST_PASS,
  nameAt,
  BIRTHDAY
};
