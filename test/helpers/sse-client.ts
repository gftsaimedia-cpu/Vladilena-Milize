'use strict';
// Máy khách SSE cho test API (GET /api/events) dùng chung: mở luồng bằng phiên của một người bịa, chờ điều kiện, gom khung nhận được.
// "Vắng mặt" được kiểm bằng tin chốt (announcement.posted tới mọi người): khi tin chốt đã tới thì mọi tin phát trước nó đã tới nếu có.
// Đặt ở đây để các file test dùng chung. Yêu cầu F.start() đã chạy (máy chủ đang nghe).
const http = require('node:http');
const assert = require('node:assert/strict');
const events = require('../../src/platform/events');
const F = require('./api-fixture');

async function openStream(who?, headers: any = {}) {
  return new Promise<any>(async (resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port: F.server.address().port,
        path: '/api/events',
        method: 'GET',
        headers: {
          Cookie: F.auth.cookieHeader(await F.auth.createSession(who), 86400),
          Accept: 'text/event-stream',
          ...headers
        }
      },
      res => {
        const stream: Record<string, any> = { status: res.statusCode, frames: [], ended: false, who, mark: 0 };
        let buffer = '';
        res.setEncoding('utf8');
        res.on('data', chunk => {
          buffer += chunk;
          let at;
          while ((at = buffer.indexOf('\n\n')) >= 0) {
            const raw = buffer.slice(0, at);
            buffer = buffer.slice(at + 2);
            if (raw.startsWith(':')) continue;
            const frame: Record<string, any> = { event: null, id: null, data: null };
            for (const line of raw.split('\n')) {
              const i = line.indexOf(': ');
              const key = line.slice(0, i);
              const value = line.slice(i + 2);
              if (key === 'event') frame.event = value;
              else if (key === 'id') frame.id = value;
              else if (key === 'data') frame.data = JSON.parse(value);
            }
            stream.frames.push(frame);
          }
        });
        res.on('end', () => (stream.ended = true));
        res.on('close', () => (stream.ended = true));
        stream.close = () => req.destroy();
        resolve(stream);
      }
    );
    req.on('error', reject);
    req.end();
  });
}
const sleep = (ms?) => new Promise<any>(resolve => setTimeout(resolve, ms));
async function until(predicate?, what?, ms = 2000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (predicate()) return;
    await sleep(10);
  }
  assert.fail(`quá ${ms} ms chờ: ${what}`);
}
const named = (stream?, name?) => stream.frames.filter(f => f.event === name);
const open = async (who?) => {
  const stream = await openStream(who);
  assert.equal(stream.status, 200, who);
  await until(() => named(stream, 'hello').length === 1, `hello của ${who}`);
  return stream;
};
// Mở hai luồng của cùng một người (hai máy) được: nhãn `who` giống nhau, nên trả về mảng theo thứ tự mở
const openMany = async (...whos) => Promise.all(await Promise.all(whos.map(open)));

// Tin chốt tới mọi luồng, rồi trả các khung ứng dụng nhận được kể từ lần chốt trước (đã bỏ hello, resync và tin chốt).
// Kết quả theo CHỈ SỐ của mảng `streams` (không theo tên, vì một người có thể mở hai luồng).
let sentinel = 0;
async function settle(streams?) {
  const id = ++sentinel;
  await events.publish('announcement.posted', { id }, { all: true });
  for (const s of streams)
    await until(
      () => s.frames.some(f => f.event === 'announcement.posted' && f.data.id === id),
      `tin chốt ${id} tới ${s.who}`
    );
  return streams.map(s => {
    const out = s.frames
      .slice(s.mark)
      .filter(f => !['hello', 'resync'].includes(f.event) && !(f.event === 'announcement.posted' && f.data.id === id));
    s.mark = s.frames.length;
    return out;
  });
}
const only = (frames?, name?) => frames.filter(f => f.event === name);
const namesOf = (frames?) => frames.map(f => f.event);

module.exports = { openStream, open, openMany, until, sleep, named, settle, only, namesOf, events };
