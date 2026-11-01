'use strict';
// Gọi API thật của ứng dụng chạy trong cùng tiến trình qua cổng loopback ngẫu nhiên.
// Cookie phiên được cấp thẳng bằng auth.createSession (không cần mật khẩu), cấp lại theo đồng hồ kịch bản để phiên không hết hạn.
const http = require('node:http');

const REMINT_MS = 86400000; // cấp lại cookie sau một ngày theo đồng hồ kịch bản (phiên sống 14 ngày)

function createClient({ app, auth, clock }: any) {
  const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
  const cookies = new Map<any, any>(); // username → { value, at }
  let port = 0;
  const server = app.listen(0, '127.0.0.1');
  const ready = new Promise(resolve => server.once('listening', () => resolve((port = server.address().port))));

  async function cookieOf(username?) {
    const now = clock.now();
    const known = cookies.get(username);
    if (known && now - known.at < REMINT_MS) return known.value;
    const header = auth.cookieHeader(await auth.createSession(username), 14 * 86400);
    const value = header.split(';')[0];
    cookies.set(username, { value, at: now });
    return value;
  }
  // Đổi mật khẩu, khoá tài khoản: phiên cũ mất hiệu lực, lần gọi sau cấp lại
  const forget = (username?) => cookies.delete(username);

  function request(as?, method?, path?, body?) {
    return new Promise(async (resolve, reject) => {
      const data = body === undefined ? null : Buffer.from(JSON.stringify(body));
      const headers: Record<string, any> = { Accept: 'application/json' };
      if (as) headers.Cookie = await cookieOf(as);
      if (data) {
        headers['Content-Type'] = 'application/json';
        headers['Content-Length'] = data.length;
      }
      const req = http.request({ host: '127.0.0.1', port, method, path, headers, agent }, res => {
        const chunks: any[] = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json: any = null;
          try {
            json = text ? JSON.parse(text) : null;
          } catch {
            json = { raw: text.slice(0, 200) };
          }
          resolve({ status: res.statusCode, body: json });
        });
      });
      req.on('error', reject);
      if (data) req.write(data);
      req.end();
    });
  }
  async function close() {
    agent.destroy();
    await new Promise(resolve => server.close(resolve));
  }
  return { ready, request, forget, close, port: () => port };
}

module.exports = { createClient };
