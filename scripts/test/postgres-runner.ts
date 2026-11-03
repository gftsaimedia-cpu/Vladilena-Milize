'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { TemporaryPostgres } = require('../dev/temporary-postgres');

if (process.platform === 'win32')
  throw new Error('PostgreSQL test runner cần WSL/Linux hoặc macOS để dọn toàn bộ nhóm tiến trình an toàn.');

const argumentsList = process.argv.slice(2);
const concurrencyArgument = argumentsList.find(argument => argument.startsWith('--concurrency='));
const concurrency = concurrencyArgument ? Number(concurrencyArgument.slice('--concurrency='.length)) : 4;
const patterns = argumentsList.filter(argument => !argument.startsWith('--'));
if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 16)
  throw new Error('Concurrency phải là số nguyên từ 1 đến 16.');
if (!patterns.length || argumentsList.some(argument => argument.startsWith('--') && argument !== concurrencyArgument))
  throw new Error('Truyền ít nhất một file test và tuỳ chọn --concurrency=1..16.');
const files = patterns.flatMap(pattern => [...fs.globSync(pattern, { cwd: process.cwd() })].map(file => path.resolve(file)));
if (!files.length) throw new Error('No test files matched the supplied glob.');
const adminUrl = process.env.PG_TEST_URL;
if (!adminUrl) throw new Error('Cần PG_TEST_URL của máy chủ PostgreSQL test riêng.');
let control: URL;
try {
  control = new URL(adminUrl);
} catch {
  throw new Error('Control database test không hợp lệ.');
}
if (!['postgres:', 'postgresql:'].includes(control.protocol) || control.pathname !== '/luong_test_control')
  throw new Error('Control database test phải là luong_test_control trên máy chủ test riêng.');

const active = new Set<any>();
let interrupted: string | null = null;
let failed = false;
let nextFile = 0;

function signalChild(child, signal: NodeJS.Signals) {
  if (!child.pid) return;
  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}

function interrupt(signal: NodeJS.Signals) {
  if (interrupted) return;
  interrupted = signal;
  for (const child of active) {
    signalChild(child, signal);
    const timer = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) signalChild(child, 'SIGKILL');
    }, 1500);
    timer.unref();
    child.once('close', () => clearTimeout(timer));
  }
}

async function runFile(file: string) {
  await TemporaryPostgres.using(adminUrl, 'test', async temporary => {
    if (interrupted) return;
    const environment: NodeJS.ProcessEnv = {
      ...process.env,
      DATABASE_URL: temporary.url,
      DB_PATH: '',
      PG_TEST_URL: '',
      TEST_PG_CONTROL_URL: adminUrl,
      TEST_PG_DATABASE_NAME: temporary.name,
      NODE_ENV: 'test',
      // Các test có thể spawn Node và require module .ts không ghi phần mở rộng.
      NODE_OPTIONS: ['--import=tsx', process.env.NODE_OPTIONS].filter(Boolean).join(' ')
    };
    delete environment.NODE_TEST_CONTEXT;
    const child = spawn(process.execPath, ['--no-warnings=ExperimentalWarning', path.resolve(file)], {
      cwd: process.cwd(),
      env: environment,
      detached: true,
      stdio: 'inherit'
    });
    active.add(child);
    if (interrupted) signalChild(child, interrupted as NodeJS.Signals);
    let childError: any;
    const outcome = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(resolve => {
      child.on('error', error => (childError = error));
      child.once('close', (code, signal) => resolve({ code, signal }));
    });
    try {
      // Leader có thể đã thoát nhưng con cháu vẫn giữ process group và kết nối DB.
      signalChild(child, 'SIGKILL');
    } finally {
      active.delete(child);
    }
    if (childError) throw childError;
    if (outcome.code !== 0 || outcome.signal) failed = true;
  });
}

async function worker() {
  while (!interrupted && nextFile < files.length) {
    const file = files[nextFile++];
    try {
      await runFile(file);
    } catch (error) {
      failed = true;
      const message = String(error && error.message ? error.message : error).replace(
        /postgres(?:ql)?:\/\/\S+/gi,
        '[URL]'
      );
      console.error(`[test] ${path.basename(file)}: ${message}`);
    }
  }
}

async function main() {
  const onSigint = () => interrupt('SIGINT');
  const onSigterm = () => interrupt('SIGTERM');
  process.on('SIGINT', onSigint);
  process.on('SIGTERM', onSigterm);
  try {
    await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, () => worker()));
  } finally {
    process.off('SIGINT', onSigint);
    process.off('SIGTERM', onSigterm);
  }
  process.exitCode = interrupted ? (interrupted === 'SIGINT' ? 130 : 143) : failed ? 1 : 0;
}

main().catch(error => {
  console.error('[test] Không thể chạy test:', error.message);
  process.exitCode = 1;
});
