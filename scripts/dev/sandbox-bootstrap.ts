'use strict';

const path = require('node:path');
const { spawn } = require('node:child_process');
const { TemporaryPostgres } = require('./temporary-postgres');

if (process.platform === 'win32')
  throw new Error('Sandbox PostgreSQL cần WSL/Linux hoặc macOS để dọn nhóm tiến trình an toàn.');

const controlUrl = process.env.SANDBOX_PG_CONTROL_URL;
let control: URL;
try {
  control = new URL(controlUrl || '');
} catch {
  throw new Error('Cần SANDBOX_PG_CONTROL_URL của máy chủ PostgreSQL sandbox riêng.');
}
if (
  !['postgres:', 'postgresql:'].includes(control.protocol) ||
  !['/luong_sandbox_control', '/luong_test_control'].includes(control.pathname)
)
  throw new Error('Control database sandbox phải là luong_sandbox_control hoặc luong_test_control.');

let interrupted: NodeJS.Signals | null = null;
let child: any;

function signalGroup(signal: NodeJS.Signals) {
  if (!child?.pid) return;
  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}

function interrupt(signal: NodeJS.Signals) {
  if (interrupted) return;
  interrupted = signal;
  if (!child) return;
  signalGroup(signal);
  const timer = setTimeout(() => signalGroup('SIGKILL'), 1500);
  timer.unref();
  child.once('close', () => clearTimeout(timer));
}

async function main() {
  const onSigint = () => interrupt('SIGINT');
  const onSigterm = () => interrupt('SIGTERM');
  process.on('SIGINT', onSigint);
  process.on('SIGTERM', onSigterm);
  try {
    await TemporaryPostgres.using(controlUrl, 'sandbox', async temporary => {
      console.log(`SANDBOX_DB_CREATED ${temporary.name}`);
      if (interrupted) return;
      const environment: NodeJS.ProcessEnv = {
        ...process.env,
        DATABASE_URL: temporary.url,
        DB_PATH: '',
        PG_TEST_URL: '',
        SANDBOX_PG_CONTROL_URL: controlUrl,
        SANDBOX_PG_DATABASE_NAME: temporary.name,
        NODE_OPTIONS: ['--import=tsx', process.env.NODE_OPTIONS].filter(Boolean).join(' ')
      };
      child = spawn(
        process.execPath,
        ['--no-warnings=ExperimentalWarning', path.join(__dirname, 'sandbox-server.ts')],
        {
          env: environment,
          stdio: 'inherit',
          detached: true
        }
      );
      if (interrupted) signalGroup(interrupted);
      let childError: any;
      const outcome = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(resolve => {
        child.on('error', error => (childError = error));
        child.once('close', (code, signal) => resolve({ code, signal }));
      });
      // Kể cả khi server đã thoát, không để tiến trình con còn giữ kết nối DB tạm.
      try {
        signalGroup('SIGKILL');
      } finally {
        child = null;
      }
      if (childError) throw childError;
      if (outcome.code !== 0 || outcome.signal) process.exitCode = 1;
    });
    if (interrupted) process.exitCode = interrupted === 'SIGINT' ? 130 : 143;
  } finally {
    process.off('SIGINT', onSigint);
    process.off('SIGTERM', onSigterm);
  }
}

main().catch(error => {
  const message = String(error?.message || error).replace(/postgres(?:ql)?:\/\/\S+/gi, '[URL]');
  console.error(`[sandbox] ${message}`);
  process.exitCode = 1;
});
