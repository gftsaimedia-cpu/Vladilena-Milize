// Gọi máy chủ BE v2: mọi đường dẫn tính từ /api/v2 (ví dụ api.get('/auth/me') → GET /api/v2/auth/me).
// Cookie phiên HttpOnly đi kèm tự động (cùng nguồn; khi chạy dev, Vite chuyển /api sang BE — xem vite.config.ts).
// Lỗi luôn là ApiError: câu báo của máy chủ đi nguyên văn qua message, mã lỗi ở code.
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

export const API_BASE = '/api/v2';

let unauthorizedHandler: any = null;
let warningsHandler: any = null;

// fn() chạy khi máy chủ trả 401 (trừ POST /auth/login, nơi 401 là sai mật khẩu).
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

// Đọc thân JSON; thân rỗng → {}; không phải JSON → undefined (để báo lỗi bad_response thay vì lỗi parse thô).
async function readJson(res: Response): Promise<any> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export async function api(method?, path?, body?, opts: any = {}): Promise<any> {
  // Chế độ dữ liệu giả không có máy chủ: màn nào chưa có dữ liệu giả nhận lỗi mock_missing, không gọi mạng.
  if (__MOCK__) {
    throw new ApiError(501, `Màn này chưa có dữ liệu giả (${method} ${path}).`, { code: 'mock_missing' });
  }
  const upper = String(method || 'GET').toUpperCase();
  const write = upper !== 'GET' && upper !== 'HEAD';
  let res: Response;
  try {
    res = await fetch(API_BASE + path, {
      method: upper,
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        // BE từ chối ghi không phải JSON (415), kể cả khi thân rỗng.
        ...(write ? { 'Content-Type': 'application/json' } : {}),
        ...(opts.headers || {})
      },
      body: write ? JSON.stringify(body === undefined ? {} : body) : undefined,
      signal: opts.signal
    });
  } catch (e) {
    if (e && (e as any).name === 'AbortError') throw e;
    throw new ApiError(0, 'Không kết nối được máy chủ.', { code: 'network' });
  }

  const data = await readJson(res);
  if (data === undefined) {
    throw new ApiError(res.status, `Máy chủ đang lỗi (mã ${res.status}).`, { code: 'bad_response' });
  }
  if (!res.ok) {
    if (res.status === 401 && path !== '/auth/login' && unauthorizedHandler) unauthorizedHandler();
    throw new ApiError(res.status, data.error || `Máy chủ đang lỗi (mã ${res.status}).`, data);
  }
  if (Array.isArray(data.warnings) && data.warnings.length && warningsHandler) warningsHandler(data.warnings);
  return data;
}

api.get = (path?) => api('GET', path);
api.post = (path?, body?) => api('POST', path, body === undefined ? {} : body);
api.put = (path?, body?) => api('PUT', path, body === undefined ? {} : body);
api.patch = (path?, body?) => api('PATCH', path, body === undefined ? {} : body);
api.del = (path?, body?) => api('DELETE', path, body);
