import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AttendanceDaysJob } from '../../src/modules/attendance/attendance-days.job';

/** Chờ `ms` mili giây. */
const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/** Job với `runOnce` thay bằng bộ đếm; phụ thuộc không dùng tới nên truyền rỗng. */
class CountingJob extends AttendanceDaysJob {
  calls = 0;
  constructor(private readonly behaviour: () => Promise<void> | void = () => undefined) {
    super(null as never, null as never, null as never);
  }
  override async runOnce(): Promise<{ employees: number; days: number }> {
    this.calls += 1;
    await this.behaviour();
    return { employees: 0, days: 0 };
  }
}

describe('AttendanceDaysJob.start / stop', () => {
  it('runs once immediately, keeps running on the interval, and stops on stop()', async () => {
    const job = new CountingJob();
    try {
      job.start(50);
      assert.equal(job.calls, 1, 'chạy ngay một lần, không đợi tới tick đầu');
      await sleep(170);
      assert.ok(job.calls >= 2, `sau ~170 ms phải chạy ít nhất 2 lần, thực tế ${job.calls}`);
    } finally {
      job.stop();
    }
    const after = job.calls;
    await sleep(150);
    assert.equal(job.calls, after, 'stop() rồi thì không chạy thêm');
  });

  it('logs a failing run through console.error and keeps the timer alive', async t => {
    const errors = t.mock.method(console, 'error', () => undefined);
    const job = new CountingJob(() => {
      throw new Error('hỏng một lần');
    });
    try {
      job.start(40);
      await sleep(130);
      assert.ok(job.calls >= 2, 'timer vẫn chạy sau lỗi');
      assert.ok(errors.mock.callCount() >= 2, 'mỗi lần lỗi đều được ghi');
    } finally {
      job.stop();
    }
  });

  it('skips a tick while the previous run is still in progress', async () => {
    const job = new CountingJob(() => sleep(160));
    try {
      job.start(30);
      await sleep(120);
      assert.equal(job.calls, 1, 'lần chạy trước chưa xong thì tick sau bị bỏ qua');
      await sleep(150);
      assert.ok(job.calls >= 2, 'xong rồi thì tick kế tiếp chạy lại');
    } finally {
      job.stop();
    }
  });

  it('start() twice does not stack timers, and onModuleDestroy stops the job', async () => {
    const job = new CountingJob();
    try {
      job.start(40);
      job.start(40);
      assert.equal(job.calls, 1, 'gọi start lần hai không chạy thêm');
      job.onModuleDestroy();
      const after = job.calls;
      await sleep(120);
      assert.equal(job.calls, after);
    } finally {
      job.stop();
    }
  });
});
