import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { afterEach, describe, it } from 'node:test';
import { HttpError } from '../../src/common';
import { AuthService } from '../../src/modules/auth/auth.service';
import { hashPassword } from '../../src/modules/employees/employees.service';
import { createScriptedKysely, type ScriptedQuery } from './helpers/scripted-kysely';

const PASS = 'Matkhau@123';
const HASH = hashPassword(PASS);

function staffRow(over: Record<string, unknown> = {}) {
  return {
    username: 'nam',
    uuid: 'uuid-nam',
    name: 'Lê Hoàng Nam',
    role: 'staff',
    type: 'nv',
    level: 1,
    pass_hash: HASH,
    locked_at: null,
    session_version: 3,
    payroll_subject: null,
    ...over
  };
}

// AuthService trên Kysely giả: SELECT từ staff trả `row` (hoặc không gì), UPDATE ... RETURNING trả session_version mới.
function serviceWith(row: Record<string, unknown> | null) {
  const { db, log } = createScriptedKysely((q: ScriptedQuery) => {
    if (/^update "staff"/.test(q.sql)) return [{ session_version: Number(row?.session_version ?? 0) + 1 }];
    if (/^select .* from "staff"/.test(q.sql)) return row ? [row] : [];
    return [];
  });
  return { service: new AuthService(db), log };
}

// Token ký đúng bí mật nhưng payload tuỳ ý, để thử các payload lạ.
function signed(service: AuthService, payload: string): string {
  const b64 = Buffer.from(payload).toString('base64url');
  const sig = crypto.createHmac('sha256', (service as any).secret()).update(b64).digest('base64url');
  return `${b64}.${sig}`;
}

async function rejectsWith(p: Promise<unknown>, status: number, code: string, message?: string) {
  await assert.rejects(p, (e: any) => {
    assert.ok(e instanceof HttpError, String(e));
    assert.equal(e.status, status);
    assert.equal(e.details?.code, code);
    if (message) assert.equal(e.message, message);
    return true;
  });
}

const ENV_KEYS = ['COOKIE_SECURE', 'SESSION_DAYS'] as const;
const savedEnv = Object.fromEntries(ENV_KEYS.map(k => [k, process.env[k]]));
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

describe('Phiên đăng nhập', () => {
  it('accepts a token carrying the current session_version', async () => {
    const { service } = serviceWith(staffRow());
    const user = await service.verifySession(service.createSessionToken('nam', 3));
    assert.equal(user?.username, 'nam');
  });

  it('rejects a token with an old session_version', async () => {
    const { service } = serviceWith(staffRow({ session_version: 4 }));
    assert.equal(await service.verifySession(service.createSessionToken('nam', 3)), null);
  });

  it('rejects a token without sv', async () => {
    const { service } = serviceWith(staffRow());
    const token = signed(service, JSON.stringify({ u: 'nam', exp: Date.now() + 60_000 }));
    assert.equal(await service.verifySession(token), null);
  });

  it('rejects an expired token', async () => {
    const { service } = serviceWith(staffRow());
    const token = signed(service, JSON.stringify({ u: 'nam', sv: 3, exp: Date.now() - 1 }));
    assert.equal(await service.verifySession(token), null);
  });

  it('garbage token gives null, not an exception', async () => {
    const { service } = serviceWith(staffRow());
    for (const t of ['abc.def', 'x', '', '..', signed(service, 'not json')]) {
      assert.equal(await service.verifySession(t), null, t);
    }
  });

  it('rejects a locked account', async () => {
    const { service } = serviceWith(staffRow({ locked_at: '2026-11-01T00:00:00Z' }));
    assert.equal(await service.verifySession(service.createSessionToken('nam', 3)), null);
  });
});

describe('Đăng nhập', () => {
  const WRONG = 'Sai tên đăng nhập hoặc mật khẩu';

  it('unknown account and wrong password give the same error', async () => {
    await rejectsWith(serviceWith(null).service.login('ai-do', PASS), 401, 'INVALID_CREDENTIALS', WRONG);
    await rejectsWith(serviceWith(staffRow()).service.login('nam', 'sai'), 401, 'INVALID_CREDENTIALS', WRONG);
  });

  it('locked account with a wrong password does not reveal the lock', async () => {
    const { service } = serviceWith(staffRow({ locked_at: '2026-11-01' }));
    await rejectsWith(service.login('nam', 'sai'), 401, 'INVALID_CREDENTIALS', WRONG);
  });

  it('locked account with the right password says it is locked', async () => {
    const { service } = serviceWith(staffRow({ locked_at: '2026-11-01' }));
    await rejectsWith(service.login('nam', PASS), 403, 'ACCOUNT_LOCKED');
  });

  it('issues a token bound to the current session_version', async () => {
    const { service } = serviceWith(staffRow());
    const { user, token } = await service.login('  NAM ', PASS);
    assert.equal(user.username, 'nam');
    const payload = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString('utf8'));
    assert.equal(payload.sv, 3);
  });
});

describe('Đổi mật khẩu', () => {
  it('bumps session_version and returns a token for the new version', async () => {
    const { service, log } = serviceWith(staffRow());
    const token = await service.changePassword('nam', PASS, 'MoiMoi@456');
    const update = log.find(e => typeof e === 'object' && /^update "staff"/.test(e.sql)) as ScriptedQuery;
    assert.match(update.sql, /"session_version" = "session_version" \+ 1/);
    const payload = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString('utf8'));
    assert.equal(payload.sv, 4);
  });

  it('refuses a wrong old password', async () => {
    const { service } = serviceWith(staffRow());
    await assert.rejects(service.changePassword('nam', 'sai', 'MoiMoi@456'), (e: any) => e.status === 400);
  });
});

describe('/auth/me', () => {
  const base = { uuid: 'u', username: 'x', name: 'X', type: 'nv', level: 1 };

  it('anonymous gives { user: null }', () => {
    assert.deepEqual(serviceWith(null).service.mePayload(null), { user: null });
  });

  it('admin gets every capability', () => {
    const me: any = serviceWith(null).service.mePayload({ ...base, role: 'admin', payrollSubject: false });
    assert.equal(me.user.username, 'x');
    assert.deepEqual(me.roles, ['admin']);
    assert.equal(me.caps.length, 9);
    assert.equal(me.payrollSubject, false);
    assert.ok(!Number.isNaN(Date.parse(me.serverNow)));
  });

  it('staff gets no capability', () => {
    const me: any = serviceWith(null).service.mePayload({ ...base, role: 'staff', payrollSubject: true });
    assert.deepEqual(me.roles, ['staff']);
    assert.deepEqual(me.caps, []);
    assert.equal(me.payrollSubject, true);
  });

  it('payrollSubject follows payroll_subject, defaulting by role', async () => {
    const cases: Array<[string, number | null, boolean]> = [
      ['admin', null, false],
      ['staff', null, true],
      ['staff', 0, false],
      ['admin', 1, true]
    ];
    for (const [role, flag, expected] of cases) {
      const { service } = serviceWith(staffRow({ role, payroll_subject: flag }));
      const user = await service.verifySession(service.createSessionToken('nam', 3));
      assert.equal(user?.payrollSubject, expected, `${role}/${flag}`);
    }
  });
});

describe('Cookie phiên', () => {
  it('defaults to 14 days and no Secure flag', () => {
    delete process.env.COOKIE_SECURE;
    delete process.env.SESSION_DAYS;
    const cookie = serviceWith(null).service.createCookieHeader('t');
    assert.equal(cookie, 'session=t; Path=/; HttpOnly; SameSite=Lax; Max-Age=1209600');
  });

  it('adds Secure when COOKIE_SECURE=1 and follows SESSION_DAYS', () => {
    process.env.COOKIE_SECURE = '1';
    process.env.SESSION_DAYS = '1';
    const cookie = serviceWith(null).service.createCookieHeader('t');
    assert.equal(cookie, 'session=t; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400; Secure');
  });
});
