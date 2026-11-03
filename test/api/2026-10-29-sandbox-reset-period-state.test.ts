'use strict';
// Đặt lại dữ liệu thử của sandbox (scripts/dev/sandbox-server.ts → resetSyntheticData) xoá luôn trạng thái kỳ lương: kỳ đã chốt công và tính lương
// quay về chưa có lần chạy, chưa có phiếu chụp, nên sau khi đặt lại có thể tính lại từ đầu. Sandbox chạy ở tiến trình con.
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

test('Đặt lại dữ liệu thử xoá kỳ lương đã tính: kỳ về Đang mở, không còn lần chạy và phiếu', async () => {
  assert.equal((await control('user', { username: 'qa_admin' })).status, 200);
  assert.equal((await control('clock', { local: '2026-11-02T09:00:00' })).status, 200);
  const rev = async () => (await call('GET', '/api/periods/2026-10')).data.rev;
  assert.equal((await call('POST', '/api/periods/2026-10/lock-attendance', { rev: await rev() })).status, 200);
  const calculated = await call('POST', '/api/periods/2026-10/calculate', { rev: await rev() });
  assert.equal(calculated.status, 200, JSON.stringify(calculated.data));
  const before = (await call('GET', '/api/periods/2026-10')).data;
  assert.equal(before.status, 'calculated');
  assert.ok((await call('GET', '/api/periods/2026-10/payslips?pageSize=50')).data.rows.length > 0);

  assert.equal((await control('reset', { confirm: true })).status, 200);
  assert.equal((await control('user', { username: 'qa_admin' })).status, 200);
  assert.equal((await control('clock', { local: '2026-11-02T09:00:00' })).status, 200);
  const after = (await call('GET', '/api/periods/2026-10')).data;
  assert.equal(after.status, 'open');
  assert.equal((await call('GET', '/api/periods/2026-10/payslips?pageSize=50')).data.rows.length, 0);
  // kỳ lương làm lại được từ đầu sau khi đặt lại (trigger chặn xoá của bảng kỳ lương đã được tạo lại nguyên vẹn)
  assert.equal((await call('POST', '/api/periods/2026-10/lock-attendance', { rev: await rev() })).status, 200);
  const again = await call('POST', '/api/periods/2026-10/calculate', { rev: await rev() });
  assert.equal(again.status, 200, JSON.stringify(again.data));
});
