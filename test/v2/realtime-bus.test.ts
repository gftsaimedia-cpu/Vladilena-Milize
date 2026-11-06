import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { InProcessRealtimeBus } from '../../src/modules/realtime/realtime-bus';
import type { RealtimeEvent } from '../../src/modules/realtime/realtime-event';

const EVENT: RealtimeEvent = { type: 'attendance.changed', username: 'nv1', workDate: '2026-11-03' };

describe('InProcessRealtimeBus', () => {
  it('phát cho mọi listener đang đăng ký', () => {
    const bus = new InProcessRealtimeBus();
    const a: RealtimeEvent[] = [];
    const b: RealtimeEvent[] = [];
    bus.subscribe(e => a.push(e));
    bus.subscribe(e => b.push(e));
    bus.publish(EVENT);
    assert.deepEqual(a, [EVENT]);
    assert.deepEqual(b, [EVENT]);
  });

  it('huỷ đăng ký thì listener không nhận nữa và số listener giảm', () => {
    const bus = new InProcessRealtimeBus();
    const got: RealtimeEvent[] = [];
    const off = bus.subscribe(e => got.push(e));
    assert.equal(bus.listenerCount(), 1);
    off();
    off(); // gọi lại không sao
    assert.equal(bus.listenerCount(), 0);
    bus.publish(EVENT);
    assert.deepEqual(got, []);
  });

  it('listener ném lỗi không chặn listener khác và không làm publish ném', () => {
    const bus = new InProcessRealtimeBus();
    const got: RealtimeEvent[] = [];
    const orig = console.error;
    console.error = () => {};
    try {
      bus.subscribe(() => {
        throw new Error('hỏng');
      });
      bus.subscribe(e => got.push(e));
      assert.doesNotThrow(() => bus.publish(EVENT));
    } finally {
      console.error = orig;
    }
    assert.deepEqual(got, [EVENT]);
  });
});

describe('RealtimeController.stream', () => {
  it('đăng ký khi nối, huỷ đăng ký và dừng heartbeat khi client ngắt', async () => {
    const { RealtimeController } = require('../../src/modules/realtime/realtime.controller');
    const { EventEmitter } = require('node:events');
    const bus = new InProcessRealtimeBus();
    const controller = new RealtimeController(bus);
    const written: string[] = [];
    const req: any = Object.assign(new EventEmitter(), { user: { username: 'boss' }, socket: { setNoDelay() {}, setTimeout() {} } });
    const res: any = Object.assign(new EventEmitter(), {
      writableEnded: false,
      destroyed: false,
      status() { return res; },
      setHeader() {},
      flushHeaders() {},
      write: (c: string) => written.push(c),
    });
    controller.stream(req, res);
    assert.equal(bus.listenerCount(), 1);
    bus.publish(EVENT);
    assert.ok(written.some(w => w.startsWith('event: attendance.changed\ndata: ')));
    assert.ok(written[0].includes('event: ready'));
    req.emit('close');
    res.emit('close'); // đóng hai lần vẫn chỉ huỷ một lần
    assert.equal(bus.listenerCount(), 0);
  });
});
