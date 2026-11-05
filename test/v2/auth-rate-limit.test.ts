import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HttpError } from '../../src/common';
import { AuthController } from '../../src/modules/auth/auth.controller';
import { LoginRateLimiter, MAX_FAILURES, MAX_NAMES_PER_IP, WINDOW_MS } from '../../src/modules/auth/domain';

describe('AuthController.login với giới hạn', () => {
  it('returns 429 with Retry-After and skips the password check once blocked', async () => {
    let calls = 0;
    const service: any = {
      login: async () => {
        calls++;
        throw new HttpError(401, 'Sai tên đăng nhập hoặc mật khẩu', { code: 'INVALID_CREDENTIALS' });
      },
      createCookieHeader: () => ''
    };
    const controller = new AuthController(service, new LoginRateLimiter(() => 0));
    const headers: Record<string, string> = {};
    const res: any = { setHeader: (k: string, v: string) => (headers[k] = v) };
    const req: any = { ip: '9.9.9.9' };
    for (let i = 0; i < 5; i++) {
      await assert.rejects(controller.login({ username: 'nam', password: 'x' }, req, res), (e: any) => e.status === 401);
    }
    await assert.rejects(
      controller.login({ username: 'nam', password: 'x' }, req, res),
      (e: any) => e.status === 429 && e.details?.code === 'TOO_MANY_ATTEMPTS'
    );
    assert.equal(calls, 5);
    assert.equal(headers['Retry-After'], '900');
  });

  it('a successful login clears the counter', async () => {
    let fail = true;
    const service: any = {
      login: async () => {
        if (fail) throw new HttpError(401, 'x', { code: 'INVALID_CREDENTIALS' });
        return { user: { username: 'nam' }, token: 't' };
      },
      createCookieHeader: () => 'session=t'
    };
    const limiter = new LoginRateLimiter(() => 0);
    const controller = new AuthController(service, limiter);
    const res: any = { setHeader() {} };
    const req: any = { ip: '9.9.9.9' };
    for (let i = 0; i < 4; i++) await assert.rejects(controller.login({ username: 'nam', password: 'x' }, req, res));
    fail = false;
    await controller.login({ username: 'nam', password: 'x' }, req, res);
    assert.equal(limiter.size(), 0);
  });
});

function limiterAt(start = 1_000_000) {
  const clock = { t: start };
  return { clock, limiter: new LoginRateLimiter(() => clock.t) };
}

describe('LoginRateLimiter', () => {
  it('pins the spec values', () => {
    assert.equal(MAX_FAILURES, 5);
    assert.equal(MAX_NAMES_PER_IP, 30);
    assert.equal(WINDOW_MS, 15 * 60_000);
  });

  it('blocks the 6th attempt after 5 failures within 15 minutes', () => {
    const { limiter } = limiterAt();
    for (let i = 0; i < 5; i++) {
      assert.deepEqual(limiter.check('1.1.1.1', 'nam'), { allowed: true });
      limiter.recordFailure('1.1.1.1', 'nam');
    }
    const res = limiter.check('1.1.1.1', 'nam');
    assert.equal(res.allowed, false);
    assert.ok(!res.allowed && res.retryAfterSec > 0 && res.retryAfterSec <= 900);
  });

  it('opens again once the window has passed', () => {
    const { clock, limiter } = limiterAt();
    for (let i = 0; i < 5; i++) limiter.recordFailure('1.1.1.1', 'nam');
    clock.t += WINDOW_MS + 1;
    assert.deepEqual(limiter.check('1.1.1.1', 'nam'), { allowed: true });
  });

  it('a success clears the failures of that pair', () => {
    const { limiter } = limiterAt();
    for (let i = 0; i < 4; i++) limiter.recordFailure('1.1.1.1', 'nam');
    limiter.recordSuccess('1.1.1.1', 'nam');
    for (let i = 0; i < 4; i++) limiter.recordFailure('1.1.1.1', 'nam');
    assert.deepEqual(limiter.check('1.1.1.1', 'nam'), { allowed: true });
  });

  it('other pairs are not affected', () => {
    const { limiter } = limiterAt();
    for (let i = 0; i < 5; i++) limiter.recordFailure('1.1.1.1', 'nam');
    assert.deepEqual(limiter.check('1.1.1.1', 'ha'), { allowed: true });
    assert.deepEqual(limiter.check('2.2.2.2', 'nam'), { allowed: true });
  });

  it('blocks the 31st distinct username from one address', () => {
    const { limiter } = limiterAt();
    for (let i = 0; i < 30; i++) {
      assert.deepEqual(limiter.check('1.1.1.1', `user${i}`), { allowed: true }, `user${i}`);
      limiter.recordFailure('1.1.1.1', `user${i}`);
    }
    assert.equal(limiter.check('1.1.1.1', 'user30').allowed, false);
    assert.deepEqual(limiter.check('1.1.1.1', 'user5'), { allowed: true });
    assert.deepEqual(limiter.check('2.2.2.2', 'user30'), { allowed: true });
  });

  it('normalizes username', () => {
    const { limiter } = limiterAt();
    for (let i = 0; i < 5; i++) limiter.recordFailure('1.1.1.1', i % 2 ? ' Nam ' : 'nam');
    assert.equal(limiter.check('1.1.1.1', 'NAM').allowed, false);
  });

  it('drops expired entries', () => {
    const { clock, limiter } = limiterAt();
    limiter.recordFailure('1.1.1.1', 'nam');
    limiter.recordFailure('2.2.2.2', 'ha');
    clock.t += WINDOW_MS + 1;
    limiter.recordFailure('3.3.3.3', 'an');
    assert.equal(limiter.size(), 1);
  });
});
