import test from 'node:test';
import assert from 'node:assert/strict';
import { createStaff } from '../../web/src/services/admin-hr';

test('createStaff posts profile fields and returns server-generated credentials', async () => {
  const calls: Array<{ url: string; method: string; body?: any }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, method: String(init.method), body });
    const data = url.endsWith('/catalog/shifts')
      ? { shifts: [] }
      : {
          staff: { username: 'mai', leave: { balance: 5 } },
          created: true,
          credentials: { username: 'mai', password: 'temporary' }
        };
    return new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const result = await createStaff({
      name: 'Mai',
      type: 'nv',
      level: '1',
      contractStatus: 'probation',
      username: 'ignored',
      password: 'ignored'
    });
    assert.deepEqual(
      calls.map(c => [c.url, c.method]),
      [
        ['/api/catalog/shifts', 'GET'],
        ['/api/staff', 'POST']
      ]
    );
    assert.equal(Object.hasOwn(calls[1].body, 'username'), false);
    assert.equal(Object.hasOwn(calls[1].body, 'password'), false);
    assert.equal(calls[1].body.contractStatus, 'probation');
    assert.deepEqual(result.credentials, { username: 'mai', password: 'temporary' });
    assert.equal(result.staff.leave.balance, 5);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('createStaff reads the persisted leave balance when the create response omits it', async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = async input => {
    const url = String(input);
    calls.push(url);
    const data = url.endsWith('/catalog/shifts')
      ? { shifts: [] }
      : url.endsWith('/staff') && calls.filter(c => c.endsWith('/staff')).length === 1
        ? { staff: { username: 'mai' }, created: true, credentials: { username: 'mai', password: 'temporary' } }
        : { staff: [{ username: 'mai', leave: { balance: 3 } }] };
    return new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const result = await createStaff({ name: 'Mai', type: 'nv', level: '1' });
    assert.equal(calls.filter(c => c.endsWith('/staff')).length, 2);
    assert.equal(result.staff.leave.balance, 3);
    assert.equal(result.leaveLookupFailed, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
