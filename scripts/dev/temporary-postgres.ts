'use strict';

const crypto = require('node:crypto');
const { Pool } = require('pg');

const PURPOSES = new Set(['test', 'sandbox', 'drill', 'scenario']);

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
    run: (database: TemporaryPostgres) => Promise<T>
  ): Promise<T> {
    const database = await TemporaryPostgres.create(adminUrl, purpose);
    let result: T;
    let failure: unknown;
    let failed = false;
    try {
      result = await run(database);
    } catch (error) {
      failed = true;
      failure = error;
    }
    try {
      await database.close();
    } catch (cleanupError) {
      if (failed) throw new AggregateError([failure, cleanupError], 'Công việc và dọn database tạm đều thất bại.');
      throw cleanupError;
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
