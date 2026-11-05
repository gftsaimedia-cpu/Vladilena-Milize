// Middleware Express đứng trước NestJS cho /api.

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Yêu cầu ghi phải gửi JSON. Cùng với cookie SameSite=Lax, form HTML từ trang lạ không gửi được yêu cầu ghi
 * (form chỉ gửi được urlencoded/multipart/text, và fetch khác nguồn mang JSON phải qua preflight CORS).
 */
export function requireJsonBody(req: any, res: any, next: (err?: unknown) => void): void {
  if (!WRITE_METHODS.has(String(req.method).toUpperCase())) return next();
  const type = String(req.headers?.['content-type'] || '').toLowerCase();
  if (type.startsWith('application/json')) return next();
  res.status(415).json({ error: 'Yêu cầu phải gửi dữ liệu dạng JSON', code: 'UNSUPPORTED_MEDIA_TYPE' });
}

/** Lỗi đọc thân của express.json: quá lớn → 413, JSON hỏng → 400; lỗi khác đi tiếp. */
export function jsonBodyErrors(err: any, _req: any, res: any, next: (err?: unknown) => void): void {
  if (err?.type === 'entity.too.large') {
    res.status(413).json({ error: 'Dữ liệu gửi lên quá lớn', code: 'PAYLOAD_TOO_LARGE' });
    return;
  }
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Dữ liệu JSON không hợp lệ', code: 'INVALID_JSON' });
    return;
  }
  next(err);
}
