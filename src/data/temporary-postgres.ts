'use strict';

const crypto = require('node:crypto');
const { Pool } = require('pg');

const PURPOSES = new Set(['test', 'sandbox', 'drill', 'scenario', 'demo']);

/** Sở hữu một database tạm do chính tiến trình này tạo trên máy chủ PostgreSQL được chỉ định. */
class TemporaryPostgres {
  #admin: any;
  #name: string;
  #url: string;
  #closing: Promise<void> | null = null;

  private constructor(admin: any, name: string, url: string) {
    this.#admin = admin;
    this.#name = name;
    this.#url = url;
  }

  get name() {
    return this.#name;
  }

  get url() {
    return this.#url;
  }

  static async create(adminUrl: string, purpose: string): Promise<TemporaryPostgres> {
    if (!PURPOSES.has(purpose)) throw new Error('Temporary database purpose không hợp lệ.');
    let target: URL;
    try {
      target = new URL(adminUrl);
    } catch {
      throw new Error('Địa chỉ PostgreSQL test không hợp lệ.');
    }
    if (!['postgres:', 'postgresql:'].includes(target.protocol))
      throw new Error('Địa chỉ PostgreSQL test không hợp lệ.');
    let controlName: string;
    try {
      controlName = decodeURIComponent(target.pathname.slice(1));
    } catch {
      throw new Error('Tên control database không hợp lệ.');
    }
    if (![...PURPOSES].some(candidate => controlName === `luong_${candidate}_control`))
      throw new Error('Control database phải là database điều khiển riêng cho test, sandbox, drill hoặc scenario.');
    const name = `luong_${purpose}_${crypto.randomBytes(12).toString('hex')}`;
    const admin = new Pool({ connectionString: adminUrl, max: 1 });
    let created = false;
    try {
      await admin.query(`CREATE DATABASE ${name}`);
      created = true;
      target.pathname = `/${name}`;
      return new TemporaryPostgres(admin, name, target.toString());
    } catch (error) {
      try {
        if (created) await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);
      } finally {
        await admin.end();
      }
      throw error;
    }
  }

  /** Chạy công việc và luôn dọn database; giữ cả hai lỗi nếu công việc và cleanup cùng thất bại. */
  static async using<T>(
    adminUrl: string,
    purpose: string,
    run: (database: TemporaryPostgres) => Promise<T>,
    { handleSignals = false }: { handleSignals?: boolean } = {}
  ): Promise<T> {
    let database: TemporaryPostgres | null = null;
    let result: T | undefined;
    let failure: unknown;
    let failed = false;
    let interruptedBy: string | null = null;
    let closing: Promise<void> | null = null;
    let rejectInterrupted: ((error: Error) => void) | null = null;
    let cleanupFailure: unknown;
    const interrupted = handleSignals
      ? new Promise<never>((_, reject) => {
          rejectInterrupted = reject;
        })
      : null;
    const closeOwnedDatabase = () => {
      if (!database) return Promise.resolve();
      if (!closing) {
        closing = database.close();
        closing.catch(() => {});
      }
      return closing;
    };
    const onSignal = (signal: string) => {
      if (interruptedBy) return;
      interruptedBy = signal;
      // CREATE may still be in flight. Wait for it to return the owned handle, then cleanup in finally.
      if (!database) return;
      void closeOwnedDatabase().then(
        () => rejectInterrupted?.(new Error(`Temporary database operation interrupted by ${signal}.`)),
        error => rejectInterrupted?.(error)
      );
    };
    const onInterrupt = () => onSignal('SIGINT');
    const onTerminate = () => onSignal('SIGTERM');
    if (handleSignals) {
      // Attach before CREATE so a signal between database creation and callback start is remembered.
      process.once('SIGINT', onInterrupt);
      process.once('SIGTERM', onTerminate);
    }

    try {
      database = await TemporaryPostgres.create(adminUrl, purpose);
      if (interruptedBy) {
        failed = true;
        failure = new Error(`Temporary database operation interrupted by ${interruptedBy}.`);
      } else {
        const operation = Promise.resolve().then(() => run(database!));
        operation.catch(() => {});
        try {
          result = await (interrupted ? Promise.race([operation, interrupted]) : operation);
        } catch (error) {
          failed = true;
          failure = error;
        }
      }
    } catch (error) {
      failed = true;
      failure = error;
    } finally {
      try {
        await closeOwnedDatabase();
      } catch (error) {
        cleanupFailure = error;
      }
      if (handleSignals) {
        // Keep ownership handlers installed until the awaited DROP has finished.
        process.removeListener('SIGINT', onInterrupt);
        process.removeListener('SIGTERM', onTerminate);
      }
    }
    if (cleanupFailure) {
      if (failed && failure !== cleanupFailure)
        throw new AggregateError([failure, cleanupFailure], 'Công việc và dọn database tạm đều thất bại.');
      throw cleanupFailure;
    }
    if (interruptedBy && !failed) {
      failed = true;
      failure = new Error(`Temporary database operation interrupted by ${interruptedBy}.`);
    }
    if (failed) throw failure;
    return result!;
  }

  /** Chờ ngắn cho các kết nối đóng êm rồi xoá đúng database đã tạo; gọi lặp dùng cùng một kết quả. */
  close(): Promise<void> {
    if (!this.#closing) this.#closing = this.#close();
    return this.#closing;
  }

  async #close(): Promise<void> {
    try {
      for (let attempt = 0; attempt < 50; attempt++) {
        const active = await this.#admin.query('SELECT 1 FROM pg_stat_activity WHERE datname = $1 LIMIT 1', [
          this.#name
        ]);
        if (!active.rowCount) break;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      await this.#admin.query(`DROP DATABASE ${this.#name} WITH (FORCE)`);
    } finally {
      await this.#admin.end();
    }
  }
}

export = { TemporaryPostgres };
