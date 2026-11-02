// Gọi máy chủ AiCB qua /api (vite proxy tới máy chủ Node; cookie phiên cùng nguồn gốc).
// Lỗi 4xx/5xx ném ApiError với câu của máy chủ (hiện nguyên văn), mã lỗi ở .code.
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

export async function api(method?, path?, body?, { showWarnings = true }: any = {}) {
  const hasBody = body !== undefined;
  const res = await fetch('/api' + path, {
    method,
    credentials: 'same-origin',
    headers: hasBody
      ? { 'Content-Type': 'application/json', Accept: 'application/json' }
      : { Accept: 'application/json' },
    body: hasBody ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text };
  }
  if (!res.ok) {
    if (res.status === 401 && path !== '/login' && unauthorizedHandler) unauthorizedHandler();
    throw new ApiError(res.status, (data && data.error) || `Máy chủ trả lỗi ${res.status}`, data);
  }
  if (showWarnings && data && Array.isArray(data.warnings) && data.warnings.length && warningsHandler)
    warningsHandler(data.warnings);
  return data;
}

api.get = (path?) => api('GET', path);
api.post = (path?, body?) => api('POST', path, body === undefined ? {} : body);
api.put = (path?, body?) => api('PUT', path, body === undefined ? {} : body);
api.del = (path?, body?) => api('DELETE', path, body);
