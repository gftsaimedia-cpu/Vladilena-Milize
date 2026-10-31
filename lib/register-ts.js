'use strict';
// Nạp trình biên dịch TypeScript lúc chạy (tsx/esbuild) để mã JS gọi được src/**/*.ts. Gọi nhiều lần cũng chỉ đăng ký một lần.
// Kiểu dữ liệu được kiểm riêng bằng `npm run typecheck`; lúc chạy chỉ gỡ kiểu, không có bước build.
if (!global.__tsRegistered) {
  global.__tsRegistered = true;
  require('tsx/cjs/api').register();
}
