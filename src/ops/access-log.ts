'use strict';
// Nhật ký truy cập dạng JSON, mỗi yêu cầu một dòng: mã yêu cầu, phương thức, đường dẫn, mã trạng thái, thời gian xử lý,
// độ trễ vòng lặp. KHÔNG ghi chuỗi truy vấn, cookie hay nội dung (có thể chứa tên đăng nhập, dữ liệu cá nhân).
// Mã yêu cầu cũng trả về ở tiêu đề X-Request-Id để đối chiếu giữa trình duyệt, proxy và nhật ký. Tắt bằng ACCESS_LOG=off.
const crypto = require('node:crypto');

const REQUEST_ID_RE = /^[\w.-]{1,64}$/;
const NS_PER_MS = 1e6;

// Gắn vào server trước trình xử lý chính (prependListener) để đặt tiêu đề trước khi route ghi phản hồi.
function attachAccessLog(server?, monitor?, write = line => process.stdout.write(`${line}\n`)) {
  if (String(process.env.ACCESS_LOG || '').toLowerCase() === 'off') return;
  server.prependListener('request', (req, res) => {
    const incoming = req.headers['x-request-id'];
    const id =
      typeof incoming === 'string' && REQUEST_ID_RE.test(incoming) ? incoming : crypto.randomBytes(6).toString('hex');
    res.setHeader('X-Request-Id', id);
    const started = process.hrtime.bigint();
    let pathname = '';
    try {
      pathname = new URL(req.url, 'http://localhost').pathname;
    } catch {
      pathname = '(không hợp lệ)';
    }
    // 'close' xảy ra cả khi khách ngắt giữa chừng (aborted) lẫn khi luồng SSE kết thúc
    res.once('close', () => {
      write(
        JSON.stringify({
          t: new Date().toISOString(),
          id,
          m: req.method,
          p: pathname,
          s: res.statusCode,
          ms: Math.round(Number(process.hrtime.bigint() - started) / NS_PER_MS),
          lag99: monitor ? monitor.recent().p99 : undefined,
          ...(res.writableFinished ? {} : { aborted: true })
        })
      );
    });
  });
}

export = { attachAccessLog };
