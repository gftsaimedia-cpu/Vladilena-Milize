import { Injectable, Inject } from '@nestjs/common';
import crypto from 'node:crypto';
import { sql, type Kysely, type Selectable } from 'kysely';
import { KYSELY_DB, type DB } from '../../database';
import type { StaffTable } from '../../database/schema';
import { hashPassword, verifyPassword } from '../employees/employees.service';
import { HttpError, UnauthorizedError, BadRequestError, type Capability } from '../../common';
import { capsOf } from './domain';

// Bắt buộc SESSION_SECRET ở môi trường thật thuộc spec vận hành; giá trị dự phòng chỉ để máy dev chạy được.
const DEV_SESSION_SECRET = 'dev_secret_key_luong_nhan_su_2026';
const DAY_MS = 24 * 60 * 60 * 1000;
const INVALID_CREDENTIALS = 'Sai tên đăng nhập hoặc mật khẩu';

// Băm giả để tài khoản không tồn tại vẫn tốn đúng một lần scrypt: thời gian trả lời không lộ tên nào có thật.
let dummyHash: string | null = null;
const dummy = () => (dummyHash ??= hashPassword('dummy-password'));

export interface AuthenticatedUser {
  uuid: string;
  username: string;
  name: string;
  role: string;
  type: string;
  level: number;
  payrollSubject: boolean;
}

export type MePayload =
  | { user: null }
  | { user: AuthenticatedUser; roles: string[]; caps: Capability[]; payrollSubject: boolean; serverNow: string };

const sessionDays = () => Number(process.env.SESSION_DAYS) || 14;

function toUser(staff: Selectable<StaffTable>): AuthenticatedUser {
  const role = staff.role || 'staff';
  const flag = staff.payroll_subject;
  return {
    uuid: staff.uuid || staff.username,
    username: staff.username,
    name: staff.name,
    role,
    type: staff.type || 'nv',
    level: staff.level ?? 1,
    payrollSubject: flag === null || flag === undefined ? role !== 'admin' : Number(flag) === 1,
  };
}

@Injectable()
export class AuthService {
  constructor(@Inject(KYSELY_DB) private readonly qb: Kysely<DB>) {}

  private secret(): string {
    return process.env.SESSION_SECRET || DEV_SESSION_SECRET;
  }

  private findStaff(username: string) {
    return this.qb.selectFrom('staff').selectAll().where('username', '=', username).executeTakeFirst();
  }

  // Thứ tự kiểm: tài khoản → mật khẩu → khoá. Chỉ người có mật khẩu đúng mới biết tài khoản bị khoá.
  async login(usernameInput: string, passwordInput: string): Promise<{ user: AuthenticatedUser; token: string }> {
    const u = String(usernameInput || '').trim().toLowerCase();
    const pass = String(passwordInput ?? '');
    const staff = u && pass ? await this.findStaff(u) : undefined;
    const ok = verifyPassword(pass, staff?.pass_hash || dummy());
    if (!staff || !ok) {
      throw new HttpError(401, INVALID_CREDENTIALS, { code: 'INVALID_CREDENTIALS' });
    }
    if (staff.locked_at) {
      throw new HttpError(403, 'Tài khoản đã bị tạm khóa', { code: 'ACCOUNT_LOCKED' });
    }
    return { user: toUser(staff), token: this.createSessionToken(staff.username, Number(staff.session_version) || 0) };
  }

  async verifySession(token: string): Promise<AuthenticatedUser | null> {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null;

    const [payloadB64, sig] = parts;
    const expectedSig = crypto.createHmac('sha256', this.secret()).update(payloadB64).digest('base64url');
    if (sig.length !== expectedSig.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
      return null;
    }

    try {
      const data = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
      if (!data || typeof data.u !== 'string' || typeof data.sv !== 'number' || typeof data.exp !== 'number') {
        return null;
      }
      if (Date.now() > data.exp) return null;

      const staff = await this.findStaff(data.u);
      if (!staff || staff.locked_at) return null;
      if ((Number(staff.session_version) || 0) !== data.sv) return null;
      return toUser(staff);
    } catch {
      return null;
    }
  }

  mePayload(user: AuthenticatedUser | null): MePayload {
    if (!user) return { user: null };
    return {
      user,
      roles: [user.role],
      caps: capsOf(user.role),
      payrollSubject: user.payrollSubject,
      serverNow: new Date().toISOString(),
    };
  }

  /** Đổi mật khẩu, tăng session_version (mọi phiên cũ hết hiệu lực) và trả token mới cho thiết bị đang đổi. */
  async changePassword(username: string, oldPass: string, newPass: string): Promise<string> {
    if (!newPass || newPass.length < 6) {
      throw new BadRequestError('Mật khẩu mới phải có ít nhất 6 ký tự');
    }

    const staff = await this.findStaff(username);
    if (!staff) {
      throw new UnauthorizedError('Không tìm thấy tài khoản');
    }
    if (!verifyPassword(String(oldPass ?? ''), staff.pass_hash || '')) {
      throw new BadRequestError('Mật khẩu cũ không chính xác');
    }

    const row = await this.qb
      .updateTable('staff')
      .set({ pass_hash: hashPassword(newPass), session_version: sql<number>`${sql.ref('session_version')} + 1` })
      .where('username', '=', username)
      .returning('session_version')
      .executeTakeFirstOrThrow();
    return this.createSessionToken(username, Number(row.session_version));
  }

  createSessionToken(username: string, sessionVersion: number): string {
    const payload = Buffer.from(
      JSON.stringify({ u: username, sv: sessionVersion, exp: Date.now() + sessionDays() * DAY_MS })
    ).toString('base64url');
    const sig = crypto.createHmac('sha256', this.secret()).update(payload).digest('base64url');
    return `${payload}.${sig}`;
  }

  createCookieHeader(token: string): string {
    const secure = process.env.COOKIE_SECURE === '1' ? '; Secure' : '';
    return `session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${sessionDays() * 86400}${secure}`;
  }

  clearCookieHeader(): string {
    const secure = process.env.COOKIE_SECURE === '1' ? '; Secure' : '';
    return `session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
  }
}
