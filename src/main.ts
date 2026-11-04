import type http from 'node:http';
import { createPgPool, createKysely } from './database/kysely';
import { hashPassword } from './modules/employees/employees.service';

async function ensureFirstAdmin(): Promise<void> {
  const pool = createPgPool();
  const db = createKysely(pool);
  try {
    const existing = await db.selectFrom('staff').select(['username']).executeTakeFirst();
    if (existing) return;

    const pass = process.env.ADMIN_PASSWORD || 'Admin@123456';
    const passHash = hashPassword(pass);
    await db
      .insertInto('staff')
      .values({
        username: 'admin',
        name: 'Admin',
        role: 'admin',
        type: 'ql',
        level: 0,
        pass_hash: passHash,
        created_at: new Date().toISOString(),
      })
      .execute();
    console.log('Đã tạo tài khoản admin ban đầu.');
  } catch (err: any) {
    console.error('Không khởi tạo được tài khoản admin ban đầu:', err.message);
  } finally {
    await pool.end();
  }
}

function installShutdown(server: http.Server): void {
  let closing = false;
  const shutdown = (code: number) => {
    if (closing) return;
    closing = true;
    setTimeout(() => process.exit(code || 0), 10000).unref();
    server.close(() => {
      process.exit(code);
    });
    server.closeAllConnections();
  };

  for (const sig of ['SIGTERM', 'SIGINT'] as const) {
    process.once(sig, () => shutdown(0));
  }

  process.on('uncaughtException', (err) => {
    console.error('uncaughtException:', err);
    shutdown(1);
  });
  process.on('unhandledRejection', (reason) => {
    console.error('unhandledRejection:', reason);
  });
}

export async function start(server: http.Server): Promise<void> {
  const port = Number(process.env.PORT || 3000);
  await ensureFirstAdmin();
  server.listen(port, () => {
    console.log(`Lương Nhân Sự (V2 Modular Monolith) đang chạy tại http://localhost:${port}`);
  });
  installShutdown(server);
}
