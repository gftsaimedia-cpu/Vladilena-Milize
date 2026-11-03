'use strict';
// Đặt lại dữ liệu thử của sandbox (scripts/dev/sandbox-server.ts → resetSyntheticData) xoá luôn giải trình: sau khi đặt lại,
// danh sách giải trình trống và đồng hồ lùi lại được (không còn dữ liệu chấm công nào chặn). Sandbox chạy ở tiến trình con.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const path = require('node:path');

const project = path.resolve(__dirname, '../..');
const { testControlUrl } = require('../helpers/postgres-control');
let child,
  base,
  cookie = '',
  stderr = '';

async function call(method?, route?, body?, control = false) {
  const headers = {
    'Content-Type': 'application/json',
    ...(cookie ? { Cookie: cookie } : {}),
    ...(control ? { Origin: base, 'X-Sandbox-Control': '1' } : {})
  };
  const res = await fetch(base + route, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const setCookie = res.headers.get('set-cookie') || '';
  if (setCookie) cookie = setCookie.split(';')[0];
  const text = await res.text();
  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch {
    /* thân trả về không phải JSON */
  }
  return { status: res.status, data };
}
const control = (route?, body?) => call('POST', '/__sandbox/' + route, body, true);

before(async () => {
  child = spawn(
    process.execPath,
    ['--no-warnings=ExperimentalWarning', '--import', 'tsx', path.join(project, 'scripts/dev/sandbox-bootstrap.ts')],
    {
      cwd: project,
      env: {
        ...process.env,
        SANDBOX_PG_CONTROL_URL: testControlUrl,
        SANDBOX_PORT: '0',
        COOKIE_SECURE: '1'
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    }
  );
  child.stderr.on('data', chunk => {
    stderr += chunk.toString();
  });
  await new Promise<any>((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('Sandbox chưa sẵn sàng: ' + stderr)), 90000);
    child.once('exit', code => {
      if (!base) {
        clearTimeout(timer);
        reject(new Error(`Sandbox thoát ${code}: ${stderr}`));
      }
    });
    child.stdout.on('data', chunk => {
      output += chunk.toString();
      const match = /^SANDBOX_READY (.+)$/m.exec(output);
      if (match && !base) {
        base = JSON.parse(match[1]).url;
        clearTimeout(timer);
        resolve(undefined);
      }
    });
  });
});
after(async () => {
  if (child && child.exitCode === null) {
    const ended = once(child, 'exit');
    child.kill('SIGTERM');
    await ended;
  }
});

test('Đặt lại dữ liệu thử xoá giải trình: danh sách trống, đồng hồ lùi lại được', async () => {
  assert.equal((await control('user', { username: 'qa_admin' })).status, 200);
  assert.equal((await control('clock', { local: '2026-10-12T12:00:00' })).status, 200);
  const asked = await call('POST', '/api/explanations', {
    username: 'qa_nv',
    date: '2026-10-05',
    prompt: 'Vì sao ngày này thiếu giờ?'
  });
  assert.equal(asked.status, 200, JSON.stringify(asked.data));
  assert.equal((await call('GET', '/api/explanations')).data.items.length, 1);
  const blocked = await control('clock', { local: '2026-10-01T07:55:00' });
  assert.equal(blocked.status, 400); // còn giải trình: coi là còn dữ liệu chấm công

  assert.equal((await control('reset', { confirm: true })).status, 200);
  assert.equal((await control('user', { username: 'qa_admin' })).status, 200);
  assert.deepEqual((await call('GET', '/api/explanations')).data.items, []);
  assert.equal((await control('clock', { local: '2026-10-01T07:55:00' })).status, 200);
});
