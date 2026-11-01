// Đọc một file .ts và trả về JavaScript thuần, để test và script nạp mã nguồn của src/engine vào `vm`
// (bộ máy chạy trong ngữ cảnh trống như trình duyệt: không có module, require hay window).
// esbuild đi kèm tsx; chỉ gỡ kiểu, không gói và không đổi cấu trúc UMD.
const fs = require('node:fs');
const { transformSync } = require('esbuild');

function transpile(code: string, filename = 'source.ts'): string {
  return transformSync(code, { loader: 'ts', target: 'es2022', sourcefile: filename }).code;
}
function readAsJs(file: string): string {
  return transpile(fs.readFileSync(file, 'utf8'), file);
}

export = { transpile, readAsJs };
