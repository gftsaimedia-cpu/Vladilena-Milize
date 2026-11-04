import { Injectable, Inject } from '@nestjs/common';
import crypto from 'node:crypto';
import type { Kysely } from 'kysely';
import { KYSELY_DB, type DB } from '../../database';
import { hashPassword, verifyPassword } from '../employees/employees.service';
import { UnauthorizedError, ForbiddenError, BadRequestError } from '../../common';

const SESSION_SECRET = process.env.SESSION_SECRET || 'dev_secret_key_luong_nhan_su_2026';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface AuthenticatedUser {
  uuid: string;
  username: string;
  name: string;
  role: string;
  type: string;
  level: number;
}

@Injectable()
export class AuthService {
  constructor(@Inject(KYSELY_DB) private readonly qb: Kysely<DB>) {}

  async login(usernameInput: string, passwordInput: string): Promise<{ user: AuthenticatedUser; token: string }> {
    const u = String(usernameInput || '').trim().toLowerCase();
    if (!u || !passwordInput) {
      throw new UnauthorizedError('Sai tên đăng nhập hoặc mật khẩu');
    }

    const staff = await this.qb
      .selectFrom('staff')
      .selectAll()
      .where('username', '=', u)
      .executeTakeFirst();

    if (!staff) {
      throw new UnauthorizedError('Sai tên đăng nhập hoặc mật khẩu');
    }

    if (staff.locked_at) {
      throw new ForbiddenError('Tài khoản đã bị tạm khóa');
    }

    const isValid = verifyPassword(passwordInput, staff.pass_hash || '');
    if (!isValid) {
      throw new UnauthorizedError('Sai tên đăng nhập hoặc mật khẩu');
    }

    const token = this.createSessionToken(u);
    const user: AuthenticatedUser = {
      uuid: staff.uuid || staff.username,
      username: staff.username,
      name: staff.name,
      role: staff.role || 'staff',
      type: staff.type || 'nv',
      level: staff.level || 1,
    };

    return { user, token };
  }

  async verifySession(token: string): Promise<AuthenticatedUser | null> {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 2) return null;

    const [payloadB64, sig] = parts;
    const expectedSig = crypto
      .createHmac('sha256', SESSION_SECRET)
      .update(payloadB64)
      .digest('base64url');

    if (
      sig.length !== expectedSig.length ||
      !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))
    ) {
      return null;
    }

    try {
      const data = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
      if (!data.u || !data.exp || Date.now() > data.exp) {
        return null;
      }

      const staff = await this.qb
        .selectFrom('staff')
        .selectAll()
        .where('username', '=', data.u)
        .executeTakeFirst();

      if (!staff || staff.locked_at) return null;

      return {
        uuid: staff.uuid || staff.username,
        username: staff.username,
        name: staff.name,
        role: staff.role || 'staff',
        type: staff.type || 'nv',
        level: staff.level || 1,
      };
    } catch {
      return null;
    }
  }

  async changePassword(username: string, oldPass: string, newPass: string): Promise<void> {
    if (!newPass || newPass.length < 6) {
      throw new BadRequestError('Mật khẩu mới phải có ít nhất 6 ký tự');
    }

    const staff = await this.qb
      .selectFrom('staff')
      .selectAll()
      .where('username', '=', username)
      .executeTakeFirst();

    if (!staff) {
      throw new UnauthorizedError('Không tìm thấy tài khoản');
    }

    const isValid = verifyPassword(oldPass, staff.pass_hash || '');
    if (!isValid) {
      throw new BadRequestError('Mật khẩu cũ không chính xác');
    }

    const newHash = hashPassword(newPass);
    await this.qb
      .updateTable('staff')
      .set({ pass_hash: newHash })
      .where('username', '=', username)
      .execute();
  }

  createSessionToken(username: string): string {
    const payload = Buffer.from(
      JSON.stringify({
        u: username,
        exp: Date.now() + SESSION_TTL_MS,
      })
    ).toString('base64url');

    const sig = crypto
      .createHmac('sha256', SESSION_SECRET)
      .update(payload)
      .digest('base64url');

    return `${payload}.${sig}`;
  }

  createCookieHeader(token: string): string {
    const isProd = process.env.NODE_ENV === 'production';
    const secureFlag = isProd ? '; Secure' : '';
    return `session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secureFlag}`;
  }

  clearCookieHeader(): string {
    return 'session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';
  }
}
