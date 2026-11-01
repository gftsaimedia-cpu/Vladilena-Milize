'use strict';
// Test cho lỗi ĐÃ XÁC NHẬN nhưng chưa sửa: chạy như `todo` (vẫn chạy, in lỗi, không làm npm test đỏ).
// Sửa xong thì xoá đối số `openBug(...)` khỏi test (hoặc xoá lời gọi) để test thành bắt buộc.
//   RED=1 npm test     ép chạy như test thường để thấy từng test đỏ vì lý do gì
// Khác `pending()` của red.js: pending chờ một file/mô-đun chưa có; openBug chờ một lỗi trong mã đã có.
//   test('…', openBug('mã lỗi', 'người sửa', 'lưu công thức vòng không bị từ chối'), async () => { … });
const openBug = (id?, owner?, summary?) =>
  process.env.RED === '1' ? {} : { todo: `${id} (chủ: ${owner}): ${summary}` };

module.exports = { openBug };
