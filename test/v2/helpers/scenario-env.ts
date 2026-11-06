import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { mock } from 'node:test';
import { Client } from 'pg';
import { createKysely, createPgPool } from '../../../src/database/kysely';
import { TransactionCoordinator } from '../../../src/database/transaction';
import { AttendanceDaysJob } from '../../../src/modules/attendance/attendance-days.job';
import { AttendanceDaysRepository } from '../../../src/modules/attendance/attendance-days.repository';
import { AttendanceDaysService } from '../../../src/modules/attendance/attendance-days.service';
import { SettingsAttendanceSettings } from '../../../src/modules/attendance/attendance-settings.port';
import { SettingsReader } from '../../../src/modules/settings/settings-reader';
import { SettingsRepository } from '../../../src/modules/settings/settings.repository';
import { hashPassword } from '../../../src/modules/employees/employees.service';

// Môi trường kịch bản: một DB tạm + máy chủ HTTP thật cho CẢ FILE (DATABASE_URL đọc lúc nạp bootstrap nên mỗi file một
// môi trường), `reset()` dựng lại lược đồ giữa các ca. Đồng hồ máy chủ điều khiển bằng `at()` (mock Date của node:test).
const CONTROL_URL = process.env.PG_TEST_URL;
const SCHEMA = join(__dirname, '..', '..', '..', 'migrations', 'postgres', 'schema.sql');
export const PASS = 'Matkhau@123';
export const ADMIN = 'boss';
export const ZONE = { lat: 10.8, lng: 106.7 };

export interface Res {
  status: number;
  body: any;
  headers: Headers;
}
export interface Api {
  get(path: string): Promise<Res>;
  post(path: string, body?: unknown): Promise<Res>;
  put(path: string, body?: unknown): Promise<Res>;
  patch(path: string, body?: unknown): Promise<Res>;
  del(path: string): Promise<Res>;
}
export interface StaffOpts {
  username: string;
  role?: 'staff' | 'admin';
  type?: string;
  level?: number;
  contract?: string;
  startDate?: string;
  shift?: { type: string; start: string; end: string };
  leaveTotal?: number;
  lockedAt?: string | null;
  resignedOn?: string | null;
}

export class ScenarioEnv {
  base = '';
  client!: Client;
  private control!: Client;
  private dbName = '';
  private server: any;
  private clockOn = false;
  uuids = new Map<string, string>();
  private jobDb: ReturnType<typeof createKysely> | undefined;

  static enabled(): boolean {
    return Boolean(CONTROL_URL);
  }

  async start(prefix: string): Promise<void> {
    const dbName = `${prefix}_${process.pid}_${Date.now()}`;
    this.dbName = dbName;
    const tempUrl = new URL(CONTROL_URL!);
    tempUrl.pathname = `/${dbName}`;
    this.control = new Client({ connectionString: CONTROL_URL });
    await this.control.connect();
    await this.control.query(`CREATE DATABASE ${dbName}`);
    this.client = new Client({ connectionString: tempUrl.toString() });
    await this.client.connect();
    await this.client.query(readFileSync(SCHEMA, 'utf8'));
    process.env.DATABASE_URL = tempUrl.toString();
    const { createServer } = require('../../../src/bootstrap');
    this.server = createServer();
    await new Promise<void>(resolve => this.server.listen(0, '127.0.0.1', resolve));
    this.base = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }

  /** Job ngày công dựng tay trên cùng DB (job thật chỉ chạy khi startJobs). Gọi `.runOnce(now)`. */
  job(): AttendanceDaysJob {
    this.jobDb ??= createKysely(createPgPool(process.env.DATABASE_URL!));
    const repo = new AttendanceDaysRepository(this.jobDb);
    const tx = new TransactionCoordinator(this.jobDb);
    const days = new AttendanceDaysService(repo, new SettingsAttendanceSettings(new SettingsReader(new SettingsRepository(this.jobDb))), tx);
    return new AttendanceDaysJob(repo, days, tx);
  }

  async stop(): Promise<void> {
    await this.jobDb?.destroy();
    if (this.clockOn) mock.timers.reset();
    if (this.server) {
      this.server.closeAllConnections?.();
      await new Promise(resolve => this.server.close(resolve));
    }
    await this.client?.end();
    if (this.control) {
      await this.control.query(`DROP DATABASE IF EXISTS ${this.dbName} WITH (FORCE)`);
      await this.control.end();
    }
  }

  /** Dựng lại lược đồ (xoá hết dữ liệu), đặt vùng chấm công và tạo admin `boss`. */
  async reset(): Promise<void> {
    await this.client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await this.client.query(readFileSync(SCHEMA, 'utf8'));
    await this.client.query(
      `INSERT INTO attendance_zone (id, lat, lng, radius_m, updated_by, updated_at) VALUES (1, $1, $2, 500, 'x', now())`,
      [ZONE.lat, ZONE.lng]
    );
    this.uuids.clear();
    await this.staff({ username: ADMIN, role: 'admin' });
  }

  /** Đặt đồng hồ máy chủ (Date) ở thời điểm `iso`; chỉ mock Date, bộ đếm giờ thật vẫn chạy. */
  at(iso: string): void {
    const ms = new Date(iso).getTime();
    if (!this.clockOn) {
      mock.timers.enable({ apis: ['Date'], now: ms });
      this.clockOn = true;
    } else {
      mock.timers.setTime(ms);
    }
  }

  async staff(o: StaffOpts): Promise<string> {
    const uuid = randomUUID();
    this.uuids.set(o.username, uuid);
    const shift = o.shift ?? { type: 'NORMAL', start: '08:00', end: '17:00' };
    await this.client.query(
      `INSERT INTO staff (username, name, role, type, level, pass_hash, created_at, uuid, start_date, contract,
         shift_type, shift_start_time, shift_end_time, leave_balance, locked_at, resigned_on)
       VALUES ($1, $1, $2, $3, $4, $5, '2026-01-01T00:00:00Z', $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        o.username,
        o.role ?? 'staff',
        o.type ?? 'nv',
        o.level ?? 1,
        hashPassword(PASS),
        uuid,
        o.startDate ?? '2026-01-05',
        o.contract ?? 'long',
        shift.type,
        shift.start,
        shift.end,
        o.leaveTotal ?? 12,
        o.lockedAt ?? null,
        o.resignedOn ?? null
      ]
    );
    return uuid;
  }

  uuid(username: string): string {
    return this.uuids.get(username)!;
  }

  async rawLogin(username: string, password = PASS): Promise<Response> {
    return fetch(this.base + '/api/v2/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
  }

  async login(username: string): Promise<Api> {
    const res = await this.rawLogin(username);
    if (res.status !== 201) throw new Error(`đăng nhập ${username} lỗi ${res.status}: ${await res.text()}`);
    return this.apiWith(String(res.headers.get('set-cookie')).split(';')[0]);
  }

  apiWith(cookie: string | null): Api {
    const call = async (method: string, path: string, body?: unknown): Promise<Res> => {
      const res = await fetch(this.base + path, {
        method,
        headers: { ...(cookie ? { cookie } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined
      });
      const text = await res.text();
      let parsed: any = text;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        /* giữ nguyên văn bản */
      }
      return { status: res.status, body: parsed, headers: res.headers };
    };
    return {
      get: p => call('GET', p),
      post: (p, b) => call('POST', p, b ?? {}),
      put: (p, b) => call('PUT', p, b ?? {}),
      patch: (p, b) => call('PATCH', p, b ?? {}),
      del: p => call('DELETE', p, {})
    };
  }

  async q<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
    return (await this.client.query(sql, params)).rows;
  }
}

/** Admin chấm hộ một ngày làm đủ giờ (vào/ra theo giờ VN) qua HTTP; trả cặp phản hồi. */
export async function workDay(
  admin: Api,
  uuid: string,
  date: string,
  inAt = '08:00',
  outAt = '17:00'
): Promise<[Res, Res]> {
  const a = await admin.post('/api/v2/attendance/punches', { employeeId: uuid, type: 'IN', punchedAt: `${date}T${inAt}:00+07:00` });
  const b = await admin.post('/api/v2/attendance/punches', { employeeId: uuid, type: 'OUT', punchedAt: `${date}T${outAt}:00+07:00` });
  return [a, b];
}

export const msg = (r: Res): string => `${r.status} ${JSON.stringify(r.body)}`;

/** Đọc khung SSE từ luồng; `next(ms)` trả khung kế tiếp (bỏ comment) hoặc null nếu hết giờ / luồng đóng. */
export function sseReader(res: Response) {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let pending: Promise<ReadableStreamReadResult<Uint8Array>> | null = null;
  let ended = false;
  return {
    get ended() {
      return ended;
    },
    async next(ms: number): Promise<{ event: string; data: any } | null> {
      const deadline = performance.now() + ms;
      for (;;) {
        const i = buf.indexOf('\n\n');
        if (i >= 0) {
          const frame = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const ev = /^event: (.*)$/m.exec(frame);
          const data = /^data: (.*)$/m.exec(frame);
          if (ev && data) return { event: ev[1], data: JSON.parse(data[1]) };
          continue;
        }
        const left = deadline - performance.now();
        if (left <= 0) return null;
        pending ??= reader.read();
        const chunk = await Promise.race([pending, new Promise<null>(r => setTimeout(() => r(null), left))]);
        if (chunk === null) return null;
        pending = null;
        if (chunk.done) {
          ended = true;
          return null;
        }
        buf += decoder.decode(chunk.value, { stream: true });
      }
    },
    cancel: () => reader.cancel()
  };
}
