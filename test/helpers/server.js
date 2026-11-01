'use strict';
// Nạp máy chủ (src/server.ts) cho test: đăng ký trình nạp TypeScript rồi trả đúng đối tượng http.Server của ứng dụng.
require('../../lib/register-ts');
module.exports = require('../../src/server');
