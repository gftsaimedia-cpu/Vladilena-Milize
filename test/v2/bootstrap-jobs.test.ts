import 'reflect-metadata';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { mock, test } from 'node:test';
import { createServer } from '../../src/bootstrap';
import { AttendanceDaysJob } from '../../src/modules/attendance/attendance-days.job';

// FP5 #11 (spec R5): only the real entry point starts the hourly job; an app built by a test does not run it on a temp DB.
// `createServer` exposes no hook, so `AttendanceDaysJob.prototype.start` is replaced by a spy (no timer, no DB). A request to
// any /api path waits for the app to be initialised, which is when `start` would have been called.
// No DB is needed: the pg pool is lazy, and the dummy address below stops an accidental connection to a real one.

async function startedBy(opts?: { startJobs?: boolean }): Promise<number> {
  process.env.DATABASE_URL = 'postgres://dummy:dummy@127.0.0.1:1/dummy';
  const start = mock.method(AttendanceDaysJob.prototype, 'start', () => undefined);
  const server = createServer(opts);
  try {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/v2/ping`);
    assert.notEqual(res.status, 503, 'the app must have initialised, or a zero count proves nothing');
    return start.mock.callCount();
  } finally {
    await new Promise(resolve => server.close(resolve));
    start.mock.restore();
  }
}

test('createServer({ startJobs: true }) starts the hourly attendance job once', async () => {
  assert.equal(await startedBy({ startJobs: true }), 1);
});

test('createServer() and createServer({ startJobs: false }) do not start it', async () => {
  assert.equal(await startedBy(), 0);
  assert.equal(await startedBy({ startJobs: false }), 0);
});
