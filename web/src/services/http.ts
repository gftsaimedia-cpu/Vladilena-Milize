// Mockup chạy không có máy chủ: api() không gọi mạng, luôn từ chối bằng ApiError mã mock_missing.
// Màn nào có dữ liệu giả thì service của màn đó trả dữ liệu từ src/mock, không đi qua api().
export class ApiError extends Error {
  status: any;
  code: any;
  data: any;

  constructor(status?, message?, data?) {
    super(message);
    this.status = status;
    this.code = data && data.code;
    this.data = data;
  }
}

let unauthorizedHandler: any = null;
let warningsHandler: any = null;

// fn() chạy khi máy chủ trả 401 (trừ POST /login, nơi 401 là sai mật khẩu).
export function onUnauthorized(fn?) {
  unauthorizedHandler = typeof fn === 'function' ? fn : null;
}

// fn(warnings) chạy khi phản hồi 2xx có mảng `warnings` không rỗng.
export function onWarnings(fn?) {
  warningsHandler = typeof fn === 'function' ? fn : null;
}

// Dựng chuỗi query từ object, bỏ giá trị undefined/null/chuỗi rỗng; mảng thành nhiều cặp cùng khoá.
export function qs(obj?) {
  if (!obj) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) {
      for (const x of v) if (x !== undefined && x !== null) p.append(k, String(x));
    } else {
      p.append(k, String(v));
    }
  }
  const s = p.toString();
  return s ? '?' + s : '';
}

// Mã định danh yêu cầu (khớp /^[A-Za-z0-9._:-]{8,120}$/) để máy chủ nhận ra lần gửi lặp.
export function newRequestId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'rq-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
}

export function api(method?, path?, _body?, _opts: any = {}): Promise<any> {
  return Promise.reject(
    new ApiError(501, `Màn này chưa có dữ liệu giả (${method} ${path}).`, { code: 'mock_missing' })
  );
}

api.get = (path?) => api('GET', path);
api.post = (path?, body?) => api('POST', path, body === undefined ? {} : body);
api.put = (path?, body?) => api('PUT', path, body === undefined ? {} : body);
api.del = (path?, body?) => api('DELETE', path, body);
