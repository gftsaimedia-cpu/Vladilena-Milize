'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { AsyncLocalStorage } = require('node:async_hooks');
const { PostgresSql } = require('./postgres-sql');

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'migrations', 'postgres');
const OID = Object.freeze({ BYTEA: 17, INT8: 20, NUMERIC: 1700 });
const bytea = value => (Buffer.isBuffer(value) ? value : Buffer.from(String(value).slice(2), 'hex'));

// Bộ máy PostgreSQL đứng sau cùng giao diện với node:sqlite DatabaseSync mà lib/db.js đang dùng:
//   prepare(sql).get / all / run (bất đồng bộ), exec(sql), close(), cùng thêm runTransaction và ready.
// Hai kiểu kết nối: PGlite (PostgreSQL chạy trong tiến trình, dùng cho test và thử nghiệm) và pg.Pool (máy chủ PostgreSQL thật).
class PostgresDatabase {
  #driver;
  #sql;
  #cache = new Map();
  #tx = new AsyncLocalStorage();
  #writes = 0;
  concurrent;

  // options: { url } cho pg.Pool, hoặc { memory: true } / { dataDir } cho PGlite
  constructor(options = {}) {
    this.options = options;
    this.#sql = new PostgresSql({ writes: () => this.#writes });
    if (options.url) {
      const { Pool, types } = require('pg');
      types.setTypeParser(OID.INT8, value => Number(value));
      types.setTypeParser(OID.NUMERIC, value => Number(value));
      this.#driver = new PoolDriver(new Pool({ connectionString: options.url, max: options.max || 10 }), this.#tx);
      this.concurrent = true; // mỗi giao dịch một kết nối riêng
    } else {
      const { PGlite } = require('@electric-sql/pglite');
      const parsers = { [OID.INT8]: value => Number(value), [OID.NUMERIC]: value => Number(value), [OID.BYTEA]: bytea };
      this.#driver = new LiteDriver(options.dataDir ? new PGlite(options.dataDir, { parsers }) : new PGlite({ parsers }));
      this.concurrent = false; // MỘT kết nối: lib/db.js xếp hàng giao dịch ngoài cùng
    }
    this.ready = this.#open();
  }

  // Số lần ghi đã chạy qua kết nối này (thay total_changes() của SQLite để bộ nhớ đệm biết dữ liệu đã đổi)
  get writes() {
    return this.#writes;
  }

  async #open() {
    await this.#driver.open();
    await this.#migrate();
    const ids = await this.#driver.query(
      "SELECT table_name FROM information_schema.columns WHERE table_schema = 'public' AND is_identity = 'YES'",
      []
    );
    this.#sql.identityTables = new Set(ids.rows.map(row => row.table_name));
  }

  // Chạy các file migrations/postgres/NNNN_*.sql chưa chạy, theo thứ tự; mỗi file một giao dịch. Bảng schema_migrations ghi tên file đã chạy.
  async #migrate() {
    await this.#driver.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
    const done = new Set((await this.#driver.query('SELECT name FROM schema_migrations', [])).rows.map(row => row.name));
    const files = fs.readdirSync(MIGRATIONS_DIR).filter(name => /^\d{4}_.+\.sql$/.test(name)).sort();
    for (const name of files) {
      if (done.has(name)) continue;
      const body = fs.readFileSync(path.join(MIGRATIONS_DIR, name), 'utf8');
      try {
        await this.#driver.exec(`BEGIN;\n${body}\nINSERT INTO schema_migrations (name, applied_at) VALUES ('${name}', '${new Date().toISOString()}');\nCOMMIT;`);
      } catch (error) {
        await this.#driver.exec('ROLLBACK').catch(() => {});
        throw new Error(`Migration ${name} lỗi: ${error.message}`);
      }
    }
  }

  // Dịch SQL lười, ở lần chạy đầu của mỗi câu (sau khi migration xong): cần biết bảng nào có cột id tự tăng để thêm RETURNING id
  prepare(sql) {
    return new PostgresStatement(this, sql);
  }

  // Câu lệnh PostgreSQL nguyên văn ($1, ILIKE, RETURNING...), không qua bộ dịch SQLite → PostgreSQL. Lối vào của trình dựng truy vấn
  // Kysely (src/data); SQL thô còn lại của test và script đi qua prepare() ở trên.
  native(sql) {
    return new NativeStatement(this, sql);
  }

  async executeNative(sql, args) {
    await this.ready;
    const params = args.map(value => (value === undefined || (typeof value === 'number' && !Number.isFinite(value)) ? null : value));
    return this.#run(sql, params, /^\s*(INSERT|UPDATE|DELETE)\b/i.test(sql));
  }

  translated(sql) {
    if (!this.#cache.has(sql)) this.#cache.set(sql, this.#sql.translate(sql));
    return this.#cache.get(sql);
  }

  // Một hoặc nhiều câu (DDL); SAVEPOINT/RELEASE/ROLLBACK TO dùng được khi đã trong giao dịch
  // SAVEPOINT của SQLite tự mở giao dịch nếu chưa có; PostgreSQL thì không. Với kết nối đơn (PGlite) giả lập: SAVEPOINT ngoài cùng → BEGIN
  // rồi SAVEPOINT; RELEASE điểm ngoài cùng → RELEASE rồi COMMIT. (Giao dịch của lib/db.js đã BEGIN sẵn qua runTransaction.)
  #savepoints = [];
  #inTransaction = false;
  async exec(sql) {
    await this.ready;
    const text = String(sql);
    if (/^\s*PRAGMA\b/i.test(text)) return;
    const save = /^\s*SAVEPOINT\s+(\w+)/i.exec(text);
    const release = /^\s*RELEASE\s+(?:SAVEPOINT\s+)?(\w+)/i.exec(text);
    const back = /^\s*ROLLBACK\s+TO\s+(?:SAVEPOINT\s+)?(\w+)/i.exec(text);
    if (save) {
      if (!this.concurrent && !this.#inTransaction && !this.#savepoints.length) await this.#run('BEGIN', [], false);
      this.#savepoints.push(save[1]);
      return this.#run(`SAVEPOINT ${save[1]}`, [], true);
    }
    if (release) {
      await this.#run(`RELEASE SAVEPOINT ${release[1]}`, [], true);
      const at = this.#savepoints.lastIndexOf(release[1]);
      if (at >= 0) this.#savepoints.length = at;
      if (!this.concurrent && !this.#inTransaction && !this.#savepoints.length) await this.#run('COMMIT', [], false);
      return;
    }
    if (back) return this.#run(`ROLLBACK TO SAVEPOINT ${back[1]}`, [], true);
    await this.#run(text, [], true);
  }

  async #run(text, params, write) {
    if (write) this.#writes++;
    try {
      return await this.#driver.query(text, params);
    } catch (error) {
      if (process.env.DB_DEBUG_SQL) console.error('[pg-sql]', error.message, text);
      throw error;
    }
  }

  async execute(sql, args) {
    await this.ready;
    const translated = this.translated(sql);
    if (translated.noop) return { rows: [], rowCount: 0 };
    // SQLite hiểu NaN / Infinity là NULL; PostgreSQL từ chối "NaN" ở cột số nguyên
    const params = args.map(value => (value === undefined || (typeof value === 'number' && !Number.isFinite(value)) ? null : value));
    const text = translated.dynamic ? translated.text.replace('__TOTAL_CHANGES__', String(this.#writes)) : translated.text;
    return this.#run(text, params, translated.write);
  }

  // Giao dịch ngoài cùng: BEGIN … COMMIT trên MỘT kết nối; bên trong dùng SAVEPOINT (lib/db.js gọi exec('SAVEPOINT x'))
  async runTransaction(write) {
    await this.ready;
    this.#inTransaction = true;
    try {
      return await this.#driver.transaction(write);
    } finally {
      this.#inTransaction = false;
    }
  }

  async close() {
    await this.#driver.close();
  }
}

class PostgresStatement {
  constructor(database, sql) {
    this.database = database;
    this.sql = sql;
  }

  async all(...args) {
    return (await this.database.execute(this.sql, args)).rows;
  }

  async get(...args) {
    return (await this.all(...args))[0];
  }

  // { changes, lastInsertRowid } như DatabaseSync
  async run(...args) {
    const result = await this.database.execute(this.sql, args);
    const first = this.database.translated(this.sql).wantsId ? result.rows[0] : undefined;
    return { changes: result.affectedRows ?? result.rowCount ?? 0, lastInsertRowid: first ? first.id : 0 };
  }
}

class NativeStatement {
  constructor(database, sql) {
    this.database = database;
    this.sql = sql;
  }

  async all(...args) {
    return (await this.database.executeNative(this.sql, args)).rows;
  }

  async run(...args) {
    const result = await this.database.executeNative(this.sql, args);
    return { changes: result.affectedRows ?? result.rowCount ?? 0 };
  }
}

class LiteDriver {
  constructor(lite) {
    this.lite = lite;
  }

  async open() {
    await this.lite.waitReady;
  }

  query(text, params) {
    return this.lite.query(text, params);
  }

  exec(text) {
    return this.lite.exec(text);
  }

  async transaction(write) {
    await this.lite.exec('BEGIN');
    try {
      const value = await write();
      await this.lite.exec('COMMIT');
      return value;
    } catch (error) {
      await this.lite.exec('ROLLBACK');
      throw error;
    }
  }

  async close() {
    await this.lite.close();
  }
}

class PoolDriver {
  constructor(pool, store) {
    this.pool = pool;
    this.store = store;
  }

  async open() {
    await this.pool.query('SELECT 1');
  }

  query(text, params) {
    return (this.store.getStore() || this.pool).query(text, params);
  }

  exec(text) {
    return (this.store.getStore() || this.pool).query(text);
  }

  async transaction(write) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const value = await this.store.run(client, write);
      await client.query('COMMIT');
      return value;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async close() {
    await this.pool.end();
  }
}

module.exports = { PostgresDatabase };
