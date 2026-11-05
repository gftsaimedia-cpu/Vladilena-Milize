// Cấu hình DB demo và test đầu-cuối (spec docs/superpowers/specs/2026-11-05-demo-db-e2e-design.md).
// Chỉ scripts/demo/run.ts dùng file này (có __dirname); test Playwright không import nó.
import path from 'node:path';

export const ROOT = path.resolve(__dirname, '..', '..');
export const SCHEMA_FILE = path.join(ROOT, 'migrations', 'postgres', 'schema.sql');
/** Git bỏ qua theo luật `deploy/**\/*.local`. */
export const ACCOUNTS_FILE = path.join(ROOT, 'deploy', 'demo', 'accounts.local');

/** Một container PostgreSQL dùng chung cho mọi phiên; không phiên nào được xoá nó. */
export const PG = { container: 'luong-demo-pg', image: 'postgres:16', port: 55480 } as const;
export const pgUrl = (db: string): string => `postgres://postgres@127.0.0.1:${PG.port}/${db}`;

export interface Target {
  db: string;
  /** Cổng BE. */
  be: number;
  /** Cổng vite (FE). */
  web: number;
}

/** Mỗi lần chạy có DB và cổng riêng, để các phiên chạy song song không giẫm nhau. */
export const TARGETS = {
  /** DB demo để bấm thử: `npm run demo -- serve`. */
  demo: { db: 'luong_demo', be: 3370, web: 5170 },
  /** BE tạm khi dựng luong_demo (`npm run demo -- db`), khác cổng của serve. */
  build: { db: 'luong_demo', be: 3369, web: 0 },
  smoke: { db: 'luong_demo_smoke', be: 3379, web: 4279 },
  staff: { db: 'luong_demo_staff', be: 3371, web: 4271 },
  attendance: { db: 'luong_demo_attendance', be: 3372, web: 4272 },
  requests: { db: 'luong_demo_requests', be: 3373, web: 4273 },
  payroll: { db: 'luong_demo_payroll', be: 3374, web: 4274 },
  all: { db: 'luong_demo_all', be: 3375, web: 4275 }
} satisfies Record<string, Target>;
export type TargetName = keyof typeof TARGETS;
