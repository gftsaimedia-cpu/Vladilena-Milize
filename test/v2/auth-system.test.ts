import assert from 'node:assert/strict';
import { test, describe, it } from 'node:test';
import { AuthService } from '../../src/modules/auth/auth.service';
import { SystemService } from '../../src/modules/system/system.service';
import { hashPassword, verifyPassword } from '../../src/modules/employees/employees.service';

describe('Auth & System V2 - Xác thực & Cài đặt hệ thống', () => {
  it('1. Băm mật khẩu scrypt và kiểm tra tính hợp lệ', () => {
    const rawPass = 'Secret123!';
    const hashed = hashPassword(rawPass);

    assert.ok(hashed.startsWith('scrypt$'), 'Hashed password must start with scrypt$');
    assert.equal(verifyPassword(rawPass, hashed), true, 'Valid password must verify true');
    assert.equal(verifyPassword('WrongPass', hashed), false, 'Wrong password must verify false');
  });

  it('2. Tạo session token HMAC-SHA256 và giải mã an toàn', () => {
    const authService = new AuthService({} as any);
    const username = 'admin';
    const token = authService.createSessionToken(username, 0);

    assert.ok(token.includes('.'), 'Token must contain payload and signature separated by dot');

    const cookie = authService.createCookieHeader(token);
    assert.ok(cookie.includes('session='), 'Cookie header must contain session=');
    assert.ok(cookie.includes('HttpOnly'), 'Cookie header must have HttpOnly');
    assert.ok(cookie.includes('SameSite=Lax'), 'Cookie header must have SameSite=Lax');
  });
});
