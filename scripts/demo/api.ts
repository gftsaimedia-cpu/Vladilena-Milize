// Gọi HTTP API của BE v2 khi seed: đăng nhập theo tên người, gọi route, báo lỗi kèm route, mã và thân trả về.
// Đường dẫn truyền vào tính từ /api/v2, ví dụ session.post('/employees', body).

export class DemoApiError extends Error {
  constructor(
    readonly method: string,
    readonly path: string,
    readonly status: number,
    readonly body: unknown
  ) {
    super(`${method} /api/v2${path} → ${status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`);
    this.name = 'DemoApiError';
  }
}

export interface RawResponse<T = any> {
  status: number;
  body: T;
}

export class DemoSession {
  constructor(
    readonly base: string,
    readonly username: string,
    private readonly cookie: string
  ) {}

  /** Gọi route, không ném lỗi theo mã HTTP: dùng khi seed cần xem BE từ chối thế nào. */
  async raw<T = any>(method: string, path: string, body?: unknown): Promise<RawResponse<T>> {
    const headers: Record<string, string> = { cookie: this.cookie };
    if (body !== undefined) headers['content-type'] = 'application/json';
    const res = await fetch(`${this.base}/api/v2${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      // giữ nguyên chữ
    }
    return { status: res.status, body: parsed as T };
  }

  /** Gọi route; mã ≥ 400 thì ném DemoApiError. */
  async call<T = any>(method: string, path: string, body?: unknown): Promise<T> {
    const r = await this.raw<T>(method, path, body);
    if (r.status >= 400) throw new DemoApiError(method, path, r.status, r.body);
    return r.body;
  }

  get<T = any>(path: string) {
    return this.call<T>('GET', path);
  }
  post<T = any>(path: string, body: unknown = {}) {
    return this.call<T>('POST', path, body);
  }
  put<T = any>(path: string, body: unknown = {}) {
    return this.call<T>('PUT', path, body);
  }
  patch<T = any>(path: string, body: unknown = {}) {
    return this.call<T>('PATCH', path, body);
  }
  /** DELETE gửi thân `{}` như api.del của FE: BE từ chối DELETE không có Content-Type JSON (415). */
  del<T = any>(path: string, body: unknown = {}) {
    return this.call<T>('DELETE', path, body);
  }
}

export class DemoApi {
  constructor(
    readonly base: string,
    private readonly passwordOf: (username: string) => string
  ) {}

  /** Đăng nhập như `username` (admin hoặc một người trong scripts/demo/people). */
  async as(username: string): Promise<DemoSession> {
    const res = await fetch(`${this.base}/api/v2/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password: this.passwordOf(username) })
    });
    if (!res.ok) throw new DemoApiError('POST', '/auth/login', res.status, `${username}: ${await res.text()}`);
    const cookie = res.headers
      .getSetCookie()
      .map(c => c.split(';')[0])
      .join('; ');
    if (!cookie) throw new Error(`Đăng nhập ${username} không nhận được cookie phiên`);
    return new DemoSession(this.base, username, cookie);
  }
}
