// Container PostgreSQL demo và các DB trong đó. Mỗi DB được xoá rồi dựng lại từ migrations/postgres/schema.sql.
// Không bao giờ xoá container: các phiên khác có thể đang dùng DB khác trong cùng container.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { PG, SCHEMA_FILE } from './config';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function docker(args: string[], input?: string): string {
  const r = spawnSync('docker', args, { input, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw new Error(`Không chạy được docker (${r.error.message}). Docker Desktop đã bật chưa?`);
  if (r.status !== 0) throw new Error(`docker ${args.slice(0, 2).join(' ')} lỗi (mã ${r.status}): ${(r.stderr || r.stdout).trim()}`);
  return r.stdout;
}

/** Bật container nếu chưa có hoặc đang tắt, rồi chờ PostgreSQL nhận kết nối TCP (bỏ qua máy chủ tạm lúc khởi tạo). */
export async function ensureContainer(log: (m: string) => void): Promise<void> {
  const state = spawnSync('docker', ['inspect', '-f', '{{.State.Running}}', PG.container], { encoding: 'utf8' });
  if (state.error) throw new Error(`Không chạy được docker (${state.error.message}). Docker Desktop đã bật chưa?`);
  if (state.status !== 0) {
    docker(['run', '-d', '--name', PG.container, '-p', `127.0.0.1:${PG.port}:5432`, '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', PG.image]);
    log(`đã tạo container ${PG.container} ở 127.0.0.1:${PG.port}`);
  } else if (state.stdout.trim() !== 'true') {
    docker(['start', PG.container]);
    log(`đã bật lại container ${PG.container}`);
  }
  for (let i = 0; i < 90; i++) {
    const ready = spawnSync('docker', ['exec', PG.container, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '-q']);
    if (ready.status === 0) return;
    await sleep(1000);
  }
  throw new Error(`PostgreSQL trong ${PG.container} chưa sẵn sàng sau 90 giây`);
}

function checkName(db: string): void {
  if (!/^[a-z][a-z0-9_]*$/.test(db)) throw new Error(`Tên DB không hợp lệ: ${db}`);
}

export function psql(db: string, sql: string): string {
  checkName(db);
  return docker(['exec', '-i', PG.container, 'psql', '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1', '-q', '-tA'], sql);
}

export function dbExists(db: string): boolean {
  checkName(db);
  return psql('postgres', `SELECT 1 FROM pg_database WHERE datname = '${db}';`).trim() === '1';
}

/** Xoá DB (ngắt mọi kết nối đang mở tới nó), tạo lại, nạp schema.sql. */
export function recreateDb(db: string): void {
  checkName(db);
  psql('postgres', `DROP DATABASE IF EXISTS ${db} WITH (FORCE);`);
  psql('postgres', `CREATE DATABASE ${db};`);
  psql(db, fs.readFileSync(SCHEMA_FILE, 'utf8'));
}
