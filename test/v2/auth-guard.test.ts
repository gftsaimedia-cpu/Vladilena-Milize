import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import { HttpError, Public, Authenticated, RequireCap } from '../../src/common';
import { AuthGuard, readSessionCookie } from '../../src/modules/auth/auth.guard';

class Routes {
  @Public() open() {}
  @Authenticated() mine() {}
  @RequireCap('staff.manage') admin() {}
  bare() {}
}

const USERS: Record<string, any> = {
  'tok-admin': { uuid: 'u1', username: 'admin', name: 'Admin', role: 'admin', type: 'ql', level: 0, payrollSubject: false },
  'tok-staff': { uuid: 'u2', username: 'nam', name: 'Nam', role: 'staff', type: 'nv', level: 1, payrollSubject: true }
};
const auth = { verifySession: async (token: string) => USERS[token] ?? null } as any;
const guard = new AuthGuard(new Reflector(), auth);

function contextFor(method: keyof Routes, cookie?: string) {
  const req: any = { headers: cookie ? { cookie } : {} };
  const ctx: any = {
    getHandler: () => Routes.prototype[method],
    getClass: () => Routes,
    switchToHttp: () => ({ getRequest: () => req })
  };
  return { ctx, req };
}

async function rejectsWith(p: Promise<unknown>, status: number, code: string) {
  await assert.rejects(p, (e: any) => e instanceof HttpError && e.status === status && e.details?.code === code);
}

describe('AuthGuard', () => {
  it('rejects a capability route without a session as 401 UNAUTHENTICATED', async () => {
    await rejectsWith(guard.canActivate(contextFor('admin').ctx), 401, 'UNAUTHENTICATED');
  });

  it('rejects an invalid token as 401', async () => {
    await rejectsWith(guard.canActivate(contextFor('admin', 'session=forged').ctx), 401, 'UNAUTHENTICATED');
  });

  it('rejects staff on a capability route as 403 FORBIDDEN', async () => {
    await rejectsWith(guard.canActivate(contextFor('admin', 'session=tok-staff').ctx), 403, 'FORBIDDEN');
  });

  it('lets admin through and sets req.user', async () => {
    const { ctx, req } = contextFor('admin', 'session=tok-admin');
    assert.equal(await guard.canActivate(ctx), true);
    assert.equal(req.user.username, 'admin');
  });

  it('lets anyone through a public route', async () => {
    assert.equal(await guard.canActivate(contextFor('open').ctx), true);
  });

  it('sets req.user on a public route when the session is valid', async () => {
    const { ctx, req } = contextFor('open', 'session=tok-staff');
    assert.equal(await guard.canActivate(ctx), true);
    assert.equal(req.user.username, 'nam');
  });

  it('lets staff through an authenticated route', async () => {
    assert.equal(await guard.canActivate(contextFor('mine', 'session=tok-staff').ctx), true);
  });

  it('rejects an authenticated route without a session', async () => {
    await rejectsWith(guard.canActivate(contextFor('mine').ctx), 401, 'UNAUTHENTICATED');
  });

  it('refuses a handler without an access rule even for admin', async () => {
    await rejectsWith(guard.canActivate(contextFor('bare', 'session=tok-admin').ctx), 403, 'FORBIDDEN');
  });
});

describe('readSessionCookie', () => {
  it('reads session among other cookies', () => {
    assert.equal(readSessionCookie('a=1; session=tok; b=2'), 'tok');
    assert.equal(readSessionCookie('xsession=bad; session=good'), 'good');
    assert.equal(readSessionCookie('a=1'), '');
    assert.equal(readSessionCookie(undefined), '');
  });
});
