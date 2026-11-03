const net = require('node:net');
const { pipeline } = require('node:stream');
const fs = require('node:fs');
const zlib = require('node:zlib');
const path = require('node:path');
let _auth: any;
const getAuth = () => (_auth ??= require('./auth'));
const warnings = require('./warnings');
const config = require('./config');

const WEB_DIST = path.resolve(process.env.WEB_DIST || path.join(__dirname, '..', '..', 'web', 'dist'));
const ASSET_CACHE = 'public, max-age=31536000, immutable';
const MAX_BODY_BYTES = 1e6; // giới hạn thân yêu cầu, tính theo byte

/* ---------- tiêu đề bảo mật ---------- */
// Gắn cho mọi phản hồi (trang, file tĩnh, API, lỗi). CSP khớp với trang hiện tại, đừng siết thêm khi chưa thử lại trang chính:
// - script-src / style-src cần 'unsafe-inline' vì index.html dùng script, style nội tuyến và thuộc tính style="..." (chưa tách ra file);
// - style-src + font-src cho Google Fonts (font Be Vietnam Pro, <link> trong index.html); không nguồn ngoài nào khác;
// - img-src data: cho biểu tượng tab (favicon data:); logo phiếu lương nằm trong /slip/ cùng nguồn;
// - connect-src 'self': fetch chỉ gọi API cùng nguồn; frame-ancestors 'none' (cùng X-Frame-Options) chặn nhúng trang vào khung.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'"
].join('; ');
function securityHeaders(res?) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'geolocation=(self), camera=(), microphone=()');
  res.setHeader('Content-Security-Policy', CSP);
  // HSTS chỉ khi chạy sau HTTPS (COOKIE_SECURE=1): bật trên HTTP thường sẽ khoá trình duyệt khỏi bản thử cục bộ.
  if (process.env.COOKIE_SECURE === '1') res.setHeader('Strict-Transport-Security', 'max-age=31536000');
}

/* ---------- tiện ích HTTP ---------- */
class HttpError extends Error {
  declare status: any;
  declare details: any;

  constructor(status?, message?, details?) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
warnings.bindHttpError(HttpError); // warnings.js không require src/platform/http (tránh vòng): nhận lớp lỗi ở đây
// Phản hồi 2xx dạng đối tượng mang kèm cảnh báo của yêu cầu (src/platform/warnings.ts); yêu cầu lỗi thì bỏ (giao dịch đã hoàn tác thì cảnh báo cũng bỏ).
// Nếu thân đã có mảng warnings (PUT /settings/params) thì gộp, không trùng mã và câu.
function withWarnings(status?, body?) {
  if (status < 200 || status >= 300 || !body || typeof body !== 'object' || Array.isArray(body)) return body;
  const found = warnings.take();
  if (!found.length) return body;
  const have = Array.isArray(body.warnings) ? body.warnings : [];
  const fresh = found.filter(w => !have.some(x => x && x.code === w.code && x.message === w.message));
  return fresh.length || !have.length ? { ...body, warnings: [...have, ...fresh] } : body;
}
const acceptsGzip = (req?) => !!req && /\bgzip\b/i.test(String(req.headers['accept-encoding'] || ''));
// Phản hồi đang chờ nén (nén chạy ở luồng nền): lời gọi send thứ hai trong lúc chờ cũng phải bị bỏ, như khi đã ghi xong
const compressing = new WeakSet<any>();
const send = (res?, status?, body?, headers: any = {}) => {
  // Chỉ trả lời MỘT lần. Có lỗi xảy ra SAU khi route đã trả lời (báo tin SSE, announce*) thì khối catch của server.js
  // gọi lại send; gọi writeHead lần hai ném ERR_HTTP_HEADERS_SENT, ném tiếp trong catch làm promise bị reject mà không
  // ai bắt → Node thoát tiến trình, tức mất CẢ hệ thống vì một lỗi phụ. Bỏ qua lặng lẽ ở đây.
  if (res.headersSent || res.writableEnded || compressing.has(res)) return;
  const data = JSON.stringify(withWarnings(status, body));
  const base = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers };
  // Nén gzip phản hồi lớn bằng luồng nền của libuv (không chặn vòng lặp); mức 1 vì tốc độ quan trọng hơn vài phần trăm dung lượng
  if (data.length >= config.HTTP_GZIP_MIN_BYTES && acceptsGzip(res.req)) {
    compressing.add(res);
    return zlib.gzip(data, { level: 1 }, (error, packed) => {
      compressing.delete(res);
      if (res.headersSent || res.writableEnded || res.destroyed) return;
      if (error) {
        res.writeHead(status, base);
        return res.end(data);
      }
      res.writeHead(status, {
        ...base,
        'Content-Encoding': 'gzip',
        Vary: 'Accept-Encoding',
        'Content-Length': packed.length
      });
      res.end(packed);
    });
  }
  res.writeHead(status, base);
  res.end(data);
};
// Đọc thân yêu cầu JSON, đếm theo byte. Quá giới hạn thì vẫn đọc bỏ phần còn lại rồi trả 413 khi đọc xong
// (trả lời rồi cắt kết nối giữa chừng làm trình duyệt báo lỗi mạng thay vì thấy 413).
// allowNull: cho phép thân yêu cầu là đúng chữ null (trả về null), dùng cho các cài đặt "tắt bằng null".
function readJson(req?, allowNull = false) {
  return new Promise((resolve, reject) => {
    // Chống CSRF: thân yêu cầu phải khai application/json. text/plain và form là "yêu cầu đơn giản" mà trình duyệt gửi chéo trang
    // không cần hỏi trước, cookie SameSite=Lax vẫn đi kèm; application/json thì bị chặn nếu không có CORS. Yêu cầu không thân thì không kiểm.
    const mediaType = String(req.headers['content-type'] || '')
      .split(';')[0]
      .trim()
      .toLowerCase();
    const hasBody = req.headers['transfer-encoding'] !== undefined || Number(req.headers['content-length'] || 0) > 0;
    if (hasBody && mediaType !== 'application/json') {
      req.resume();
      return reject(
        new HttpError(415, 'Nội dung gửi lên phải có Content-Type: application/json', {
          code: 'UNSUPPORTED_MEDIA_TYPE'
        })
      );
    }
    const chunks: any[] = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size <= MAX_BODY_BYTES) chunks.push(chunk);
      else chunks.length = 0;
    });
    req.on('end', () => {
      if (size > MAX_BODY_BYTES) return reject(new HttpError(413, 'Dữ liệu quá lớn (tối đa 1 MB)'));
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        const body = text ? JSON.parse(text) : {};
        if (allowNull && body === null) return resolve(null);
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
        resolve(body);
      } catch {
        reject(new HttpError(400, 'JSON phải là object hợp lệ'));
      }
    });
    req.on('error', reject);
  });
}
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8'
};
const isFile = (file?) => {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
};
// Giao diện Vue đã build (web/dist; Dockerfile build sẵn). Có index.html trong đó thì nó là giao diện chính: "/" và các đường dẫn của
// router Vue (không có đuôi file, ví dụ /admin/staff) trả index.html; chưa build thì "/" trả 503 kèm cách build.
// Tệp trong /assets/ có băm trong tên nên giữ lâu được; mọi tệp khác luôn hỏi lại.
// File tĩnh: ETag từ cỡ + thời điểm sửa (trình duyệt hỏi lại nhận 304, không tải lại); file chữ nhỏ được đọc và nén gzip MỘT lần rồi giữ trong bộ nhớ
// (đổi ETag thì nạp lại), nên 300 người mở trang không nén lại 300 lần.
const COMPRESSIBLE = new Set<any>(['.html', '.js', '.css', '.svg', '.json', '.txt']);
const staticCache = new Map<any, any>(); // file → { etag, raw, gz }
const sendFile = (req?, res?, file?, cacheControl?) => {
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    res.writeHead(404);
    return res.end('Not found');
  }
  const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
  const ext = path.extname(file);
  const headers = {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': cacheControl,
    ETag: etag
  };
  const sent = String(req.headers['if-none-match'] || '');
  if (sent && sent.split(',').some(tag => tag.trim() === etag)) {
    res.writeHead(304, { 'Cache-Control': cacheControl, ETag: etag });
    return res.end();
  }
  if (COMPRESSIBLE.has(ext) && stat.size <= config.STATIC_CACHE_MAX_BYTES) {
    let hit = staticCache.get(file);
    if (!hit || hit.etag !== etag) {
      const raw = fs.readFileSync(file);
      hit = { etag, raw, gz: zlib.gzipSync(raw, { level: 9 }) };
      staticCache.set(file, hit);
    }
    const useGzip = acceptsGzip(req) && hit.gz.length < hit.raw.length;
    const body = useGzip ? hit.gz : hit.raw;
    res.writeHead(200, {
      ...headers,
      Vary: 'Accept-Encoding',
      ...(useGzip ? { 'Content-Encoding': 'gzip' } : {}),
      'Content-Length': body.length
    });
    return res.end(req.method === 'HEAD' ? undefined : body);
  }
  res.writeHead(200, headers);
  // pipeline đóng luồng đọc khi khách ngắt kết nối giữa chừng và khi đọc lỗi (file bị xoá, đĩa lỗi): không giữ file mở,
  // không làm sập máy chủ
  pipeline(fs.createReadStream(file), res, () => {});
};
function serveStatic(req?, res?, url?) {
  const notFound = () => {
    res.writeHead(404);
    res.end('Not found');
  };
  const webIndex = path.join(WEB_DIST, 'index.html');
  const hasWeb = isFile(webIndex);
  // Giao diện duy nhất là bản Vue đã build (web/dist). Chưa build thì "/" nói rõ cách build thay vì trả trang rỗng; /api vẫn chạy bình thường.
  if (url.pathname === '/') {
    if (hasWeb) return sendFile(req, res, webIndex, 'no-cache');
    res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' });
    return res.end('Chưa có giao diện web. Chạy: cd web && npm ci && npm run build (máy chủ phục vụ web/dist).');
  }
  let p;
  try {
    p = decodeURIComponent(url.pathname);
  } catch {
    return notFound();
  }
  if (p.includes('\0')) return notFound();
  // Ghép với thư mục web/dist rồi kiểm lại bằng path.relative: không có đường nào đi ra ngoài thư mục đó.
  if (!hasWeb) return notFound();
  const relative = p.replace(/^[/\\]+/, '');
  const file = path.resolve(WEB_DIST, relative);
  const rel = path.relative(WEB_DIST, file);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return notFound();
  if (isFile(file)) return sendFile(req, res, file, p.startsWith('/assets/') ? ASSET_CACHE : 'no-cache');
  if (!path.extname(p)) return sendFile(req, res, webIndex, 'no-cache'); // đường dẫn của router Vue
  return notFound();
}

// Địa chỉ máy khách cho giới hạn đăng nhập và nhật ký chấm công. Mặc định chỉ tin địa chỉ kết nối. TRUST_PROXY=n (số proxy
// tin cậy phía trước, "1" là một proxy) thì lấy mục thứ n tính từ bên phải của X-Forwarded-For: đó là mục do proxy của
// mình thêm; các mục bên trái do máy khách tự gửi nên có thể giả. Mục không phải địa chỉ IP thì bỏ, quay về địa chỉ kết nối.
function clientIp(req?) {
  const socketAddress = req.socket.remoteAddress || '',
    hops = getAuth().trustedHops();
  if (!hops) return socketAddress;
  const chain = String(req.headers['x-forwarded-for'] || '')
    .split(',')
    .map(part => part.trim());
  const entry = chain.length >= hops ? chain[chain.length - hops] : '';
  return net.isIP(entry) ? entry : socketAddress;
}
export = { MAX_BODY_BYTES, securityHeaders, HttpError, send, withWarnings, readJson, serveStatic, clientIp };
