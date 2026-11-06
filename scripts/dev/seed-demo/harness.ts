import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { Client } from 'pg';

// Khung chạy cho DB demo: dựng lại DB từ schema.sql, bật máy chủ HTTP thật của BE trong tiến trình này,
// đồng hồ giả (Date) để đơn từ và kỳ lương được nạp đúng thời điểm, và một client gọi API theo từng người.
const SCHEMA = join(__dirname, '..', '..', '..', 'migrations', 'postgres', 'schema.sql');
export const PASSWORD = 'Demo@123456';
export const ADMIN = 'boss';

export interface Res {
  status: number;
  body: any;
}
export interface Api {
  get(path: string): Promise<Res>;
  post(path: string, body?: unknown): Promise<Res>;
  put(path: string, body?: unknown): Promise<Res>;
  patch(path: string, body?: unknown): Promise<Res>;
  del(path: string): Promise<Res>;
}

const RealDate = Date;
let frozen: number | null = null;
let offset: number | null = null; // đồng hồ chạy: giờ thật + offset
const current = (): number | null => (frozen !== null ? frozen : offset !== null ? RealDate.now() + offset : null);
class FakeDate extends RealDate {
  constructor(...args: any[]) {
    const now = current();
    if (args.length === 0 && now !== null) super(now);
    else super(...(args as []));
  }
  static now(): number {
    return current() ?? RealDate.now();
  }
}

/** Đặt đồng hồ tiến trình ở thời điểm `iso` (có múi giờ). */
export function setClock(iso: string): void {
  const ms = new RealDate(iso).getTime();
  if (Number.isNaN(ms)) throw new Error(`Thời điểm không hợp lệ: ${iso}`);
  frozen = ms;
  offset = null;
  (globalThis as any).Date = FakeDate;
}
/** Đồng hồ giả vẫn chạy: từ thời điểm `iso` trở đi giờ trôi theo giờ thật. */
export function setRunningClock(iso: string): void {
  const ms = new RealDate(iso).getTime();
  if (Number.isNaN(ms)) throw new Error(`Thời điểm không hợp lệ: ${iso}`);
  frozen = null;
  offset = ms - RealDate.now();
  (globalThis as any).Date = FakeDate;
}
export function restoreClock(): void {
  frozen = null;
  offset = null;
  (globalThis as any).Date = RealDate;
}

export class Demo {
  base = '';
  db!: Client;
  uuids = new Map<string, string>();
  depts = new Map<string, number>();
  private server: any;
  private jar = new Map<string, string>();
  private apis = new Map<string, Api>();

  constructor(readonly url: string) {}

  /** Tạo DB (nếu chưa có), nạp lại lược đồ, bật máy chủ. */
  async start(): Promise<void> {
    const target = new URL(this.url);
    const dbName = target.pathname.slice(1);
    if (!/^[a-z0-9_]+$/.test(dbName)) throw new Error('Tên DB demo chỉ gồm a-z, 0-9, _');
    if (!/^(localhost|127\.0\.0\.1|host\.docker\.internal)$/.test(target.hostname)) throw new Error('DB demo chỉ được nằm trên máy này');
    const control = new URL(this.url);
    control.pathname = '/postgres';
    const admin = new Client({ connectionString: control.toString() });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${dbName}`);
    await admin.end();
    this.db = new Client({ connectionString: this.url });
    await this.db.connect();
    await this.db.query(readFileSync(SCHEMA, 'utf8'));
    process.env.DATABASE_URL = this.url;
    const { createServer } = require('../../../src/bootstrap');
    this.server = createServer();
    await new Promise<void>(resolve => this.server.listen(0, '127.0.0.1', resolve));
    this.base = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }

  async stop(): Promise<void> {
    restoreClock();
    if (this.server) {
      this.server.closeAllConnections?.();
      await new Promise(resolve => this.server.close(resolve));
    }
    await this.db?.end();
  }

  q<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
    return this.db.query(sql, params).then(r => r.rows);
  }

  private async rawLogin(username: string, password: string): Promise<Response> {
    return fetch(this.base + '/api/v2/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
  }

  /** Đăng nhập (lại nếu phiên cũ hết hạn theo đồng hồ giả) và trả client API của người đó. */
  as(username: string, password = PASSWORD): Api {
    const key = `${username}|${password}`;
    const cached = this.apis.get(key);
    if (cached) return cached;
    const call = async (method: string, path: string, body?: unknown, retried = false): Promise<Res> => {
      if (!this.jar.has(key)) {
        const res = await this.rawLogin(username, password);
        if (res.status !== 201) throw new Error(`Đăng nhập ${username} lỗi ${res.status}: ${await res.text()}`);
        this.jar.set(key, String(res.headers.get('set-cookie')).split(';')[0]);
      }
      const res = await fetch(this.base + path, {
        method,
        headers: { cookie: this.jar.get(key)!, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined
      });
      if (res.status === 401 && !retried) {
        this.jar.delete(key);
        return call(method, path, body, true);
      }
      const text = await res.text();
      let parsed: any = text;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        /* giữ nguyên văn bản */
      }
      return { status: res.status, body: parsed };
    };
    const api: Api = {
      get: p => call('GET', p),
      post: (p, b) => call('POST', p, b ?? {}),
      put: (p, b) => call('PUT', p, b ?? {}),
      patch: (p, b) => call('PATCH', p, b ?? {}),
      del: p => call('DELETE', p, {})
    };
    this.apis.set(key, api);
    return api;
  }

  get admin(): Api {
    return this.as(ADMIN);
  }
}

/** Phản hồi phải thuộc `ok` (mặc định 2xx), nếu không dừng script và in lỗi thật của BE. */
export function must(res: Res, what: string, ok: number[] = [200, 201]): any {
  if (!ok.includes(res.status)) throw new Error(`${what}: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}
