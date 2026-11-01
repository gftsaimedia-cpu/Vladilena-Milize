'use strict';
// Dữ liệu khởi tạo của danh mục chức vụ và ca. Đây là DỮ LIỆU nạp một lần; sau đó Admin sửa trong DB.
// Số tiền, ngày công, phụ cấp, lịch, quyền lợi KHÔNG chép ở đây: schema.js lấy từ DEFAULTS của bộ tham số để tiền không đổi khi chuyển nguồn.
// Ở đây chỉ còn phần DEFAULTS không có: tên chức vụ, tên bậc mới và danh mục ca.

const TYPE_NAMES = Object.freeze({ tts: 'Thực tập sinh', ctv: 'Chuyên trách viên', nv: 'Nhân viên' });

// Tên bậc (thay "Bậc 1…6" của TTS và "HDO" của NV trong DEFAULTS)
const LEVEL_NAMES = Object.freeze({
  tts: {
    1: 'Explorer',
    2: 'Learner',
    3: 'Trainee',
    4: 'Advanced Trainee',
    5: 'Senior Trainee',
    6: 'Practitioner in Training'
  },
  ctv: { 1: 'Fresher', 2: 'Practitioner', 3: 'Advanced Practitioner', 4: 'Senior Practitioner' },
  nv: { 1: 'Nhân viên', 2: 'Chuyên viên', 3: 'Lead', 4: 'Advisor' }
});

// Ca làm: mã mới Normal1…Night2 thay n1 n2 f1 f2 g1 g2. preset = khoá giờ ca cũ trong bộ tham số (shift.preset.<preset>.*),
// giữ nguyên để giờ ca, lịch sử chấm công và các lượt đã chụp ca cũ vẫn đọc được.
// Mã mới → khoá giờ ca cũ lấy từ src/engine/punch.ts (SHIFT_CODES), một nguồn với màn chấm công
const { SHIFT_CODES } = require('../../engine/punch');
const SHIFTS = Object.freeze(
  [
    ['Normal1', 'Normal 1', 'normal'],
    ['Normal2', 'Normal 2', 'normal'],
    ['Flex1', 'Flex 1', 'flex'],
    ['Flex2', 'Flex 2', 'flex'],
    ['Night1', 'Night 1', 'night'],
    ['Night2', 'Night 2', 'night']
  ].map(([code, name, kind]: any) => Object.freeze({ code, preset: SHIFT_CODES[code], name, kind }))
);

export = { TYPE_NAMES, LEVEL_NAMES, SHIFTS };
