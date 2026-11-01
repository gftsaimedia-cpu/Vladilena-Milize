'use strict';
// Câu máy chủ gửi cho người dùng phải là tiếng Việt thường, không lộ chữ kỹ thuật:
// không tên file, tên hàm hay khoá cài đặt, mã lỗi nội bộ, tên bảng, mã việc dạng "B3: ".
const assert = require('node:assert/strict');

const TECHNICAL =
  /\.js\b|POLICY|\(C\d\)|settings\.|param_versions|locked_at|requireApproval|kpiFrom|\bpayroll\b|\b(?:A|B|N|U)\d{1,2}\b: /;
function assertPlain(text?, label = 'câu hiển thị') {
  assert.equal(typeof text, 'string', `${label}: phải là chuỗi`);
  assert.ok(text.trim().length > 0, `${label}: không rỗng`);
  assert.doesNotMatch(text, TECHNICAL, `${label} còn chữ kỹ thuật: "${text}"`);
}

module.exports = { TECHNICAL, assertPlain };
