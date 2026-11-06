// Bật và tắt BE v2 (và vite khi serve) cho DB demo. Log của BE ghi ra thư mục tạm, không in mật khẩu.
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { pgUrl, ROOT, type Target } from './config';
import type { DemoAccounts } from './accounts-format';

export const LOG_DIR = path.join(os.tmpdir(), 'luong-demo');
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export function assertPortFree(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', () =>
      reject(new Error(`Cổng ${port} đang bận. Có thể một lần chạy trước chưa tắt; tắt nó rồi chạy lại.`))
    );
    server.once('listening', () => server.close(() => resolve()));
    server.listen(port, '127.0.0.1');
  });
}

function tail(file: string, lines = 30): string {
  try {
    return fs.readFileSync(file, 'utf8').split(/\r?\n/).slice(-lines).join('\n');
  } catch {
    return '';
  }
}

export interface Running {
  child: ChildProcess;
  logFile: string;
}

export async function startBackend(name: string, t: Target, accounts: DemoAccounts): Promise<Running> {
  await assertPortFree(t.be);
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const logFile = path.join(LOG_DIR, `${name}-be.log`);
  const out = fs.openSync(logFile, 'w');
  const child = spawn(process.execPath, ['--no-warnings=ExperimentalWarning', '--import', 'tsx', 'src/server.ts'], {
    cwd: ROOT,
    env: {
      ...process.env,
      DATABASE_URL: pgUrl(t.db),
      PORT: String(t.be),
      ADMIN_PASSWORD: accounts.adminPassword,
      SESSION_SECRET: accounts.sessionSecret,
      COOKIE_SECURE: '0'
    },
    stdio: ['ignore', out, out]
  });
  const url = `http://127.0.0.1:${t.be}/api/v2/system/health`;
  for (let i = 0; i < 120; i++) {
    if (child.exitCode !== null) throw new Error(`BE tắt ngay khi bật (mã ${child.exitCode}). Log ${logFile}:\n${tail(logFile)}`);
    try {
      await fetch(url);
      return { child, logFile };
    } catch {
      await sleep(500);
    }
  }
  stop(child);
  throw new Error(`BE không trả lời ${url} sau 60 giây. Log ${logFile}:\n${tail(logFile)}`);
}

/** Tắt tiến trình và mọi tiến trình con của nó (Windows: taskkill /T). */
export function stop(child: ChildProcess | undefined): void {
  if (!child || child.exitCode !== null || child.pid === undefined) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else child.kill('SIGTERM');
}

/** Bao một đối số cho shell (npm trên Windows cần shell: true). */
export const shellArg = (a: string): string => (/[\s"&|<>^]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);
