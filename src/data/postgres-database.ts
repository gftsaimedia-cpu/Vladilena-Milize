'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { AsyncLocalStorage } = require('node:async_hooks');
const { PostgresSql } = require('./postgres-sql');

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'migrations', 'postgres');
const SCHEMA_MARKER = '@schema:luong-postgres-fresh-v1';
const OID = Object.freeze({ INT8: 20, NUMERIC: 1700 });

// Kết nối PostgreSQL của ứng dụng (src/platform/db.ts dùng): prepare(sql).get / all / run (bất đồng bộ; tham số viết `?`, xem postgres-sql.js),
// native(sql) cho Kysely (PostgreSQL nguyên văn), exec(sql), close(), runTransaction và ready.
class PostgresDatabase {
  declare options: any;
  declare ready: any;

  #driver;
  #sql;
  #cache = new Map();
  #tx = new AsyncLocalStorage();
  #writes = 0;
  concurrent;

  constructor(options: any = {}) {
    const legacyOptions = ['memory', 'dataDir', 'isolatedFrom'].filter(key => options[key]);
    if (legacyOptions.length) {
      throw new Error(`PostgresDatabase không hỗ trợ cấu hình database cũ: ${legacyOptions.join(', ')}.`);
    }
    if (!options.url) throw new Error('PostgresDatabase cần URL PostgreSQL tường minh.');
    this.options = options;
    this.#sql = new PostgresSql();
    this.#driver = new PoolDriver(PostgresDatabase.#pool(options.url, options.max || 10), this.#tx);
    this.concurrent = true;
    this.ready = this.#open();
  }

  // Số lần ghi đã chạy qua kết nối này (để bộ nhớ đệm biết dữ liệu đã đổi; chỉ đếm ghi của tiến trình này)
  get writes() {
    return this.#writes;
  }

  static #pool(url?, max?) {
    const { Pool, types } = require('pg');
    types.setTypeParser(OID.INT8, value => Number(value));
    types.setTypeParser(OID.NUMERIC, value => Number(value));
    let target;
    try {
      target = new URL(url);
    } catch {
      throw new Error('Địa chỉ PostgreSQL không hợp lệ.');
    }
    if (!['postgres:', 'postgresql:'].includes(target.protocol)) throw new Error('Địa chỉ PostgreSQL không hợp lệ.');
    const options = target.searchParams.getAll('options');
    if (options.length > 1) throw new Error('Địa chỉ PostgreSQL có nhiều tham số options.');
    const existingOptions = options[0] ?? process.env.PGOPTIONS ?? '';
    target.searchParams.delete('options');
    // `options` trong URL có độ ưu tiên cao hơn cấu hình Pool; đưa về một chỗ và đặt schema cuối cùng.
    const startupOptions = [existingOptions, '-c search_path=public,pg_catalog'].filter(Boolean).join(' ');
    return new Pool({ connectionString: target.toString(), max, options: startupOptions });
  }

  async #open() {
    await this.#driver.open();
    await this.#migrate();
    const ids = await this.#driver.query(
      "SELECT table_name FROM information_schema.columns WHERE table_schema = 'public' AND is_identity = 'YES'",
      []
    );
    this.#sql.identityTables = new Set<any>(ids.rows.map(row => row.table_name));
  }

  // Chỉ mở schema mới có dấu nhận diện. Kiểm tra và mọi migration cùng một giao dịch và một kết nối;
  // advisory lock ngăn hai tiến trình cùng kiểm tra một DB trống rồi cùng tạo bảng.
  async #migrate() {
    const files = fs.readdirSync(MIGRATIONS_DIR).filter(name => /^\d{4}_.+\.sql$/.test(name)).sort();
    const incompatible = () =>
      new Error('SCHEMA_INCOMPATIBLE: Database không có schema tương thích. Hãy chọn database PostgreSQL mới, trống.');
    await this.#driver.transaction(async () => {
      await this.#driver.exec('SET LOCAL search_path = public, pg_catalog');
      await this.#driver.query("SELECT pg_advisory_xact_lock(hashtextextended('luong-schema-migration-v1', 0))", []);
      const otherSchemas = await this.#driver.query(
        "SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname NOT LIKE 'pg\\_%' ESCAPE '\\' AND nspname NOT IN ('public', 'information_schema') LIMIT 1",
        []
      );
      if (otherSchemas.rows.length) throw incompatible();
      const objects = await this.#driver.query(
        "SELECT c.relname, c.relkind FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')",
        []
      );
      const migrationsTable = objects.rows.find(row => row.relname === 'schema_migrations' && row.relkind === 'r');
      let done = new Set<any>();
      if (!migrationsTable) {
        if (objects.rows.length) throw incompatible();
        // Các object như function, type hay operator có thể tồn tại dù không có bảng.
        const otherObjects = await this.#driver.query(
          "SELECT 1 FROM pg_catalog.pg_depend d JOIN pg_catalog.pg_namespace n ON d.refclassid = 'pg_catalog.pg_namespace'::regclass AND d.refobjid = n.oid WHERE n.nspname = 'public' LIMIT 1",
          []
        );
        if (otherObjects.rows.length) throw incompatible();
        await this.#driver.exec('CREATE TABLE public.schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
        await this.#driver.query('INSERT INTO public.schema_migrations (name, applied_at) VALUES ($1, $2)', [
          SCHEMA_MARKER,
          new Date().toISOString()
        ]);
      } else {
        try {
          done = new Set<any>((await this.#driver.query('SELECT name FROM public.schema_migrations', [])).rows.map(row => row.name));
        } catch {
          throw incompatible();
        }
        const known = new Set([SCHEMA_MARKER, ...files]);
        if (!done.has(SCHEMA_MARKER) || [...done].some(name => !known.has(name)) || !done.has(files[0]))
          throw incompatible();
        let missing = false;
        for (const name of files) {
          if (!done.has(name)) missing = true;
          else if (missing) throw incompatible();
        }
      }
      for (const name of files) {
        if (done.has(name)) continue;
        const body = fs.readFileSync(path.join(MIGRATIONS_DIR, name), 'utf8');
        try {
          await this.#driver.exec(body);
          await this.#driver.query('INSERT INTO public.schema_migrations (name, applied_at) VALUES ($1, $2)', [
            name,
            new Date().toISOString()
          ]);
        } catch (error) {
          throw new Error(`Migration ${name} lỗi: ${error.message}`);
        }
      }
    });
  }

  // Dịch SQL lười, ở lần chạy đầu của mỗi câu (sau khi migration xong): cần biết bảng nào có cột id tự tăng để thêm RETURNING id
  prepare(sql?) {
    return new PostgresStatement(this, sql);
  }

  // Câu lệnh PostgreSQL nguyên văn ($1, ILIKE, RETURNING...), không đổi dấu `?`. Lối vào của trình dựng truy vấn
  // Kysely (src/data); SQL thô còn lại của test và script đi qua prepare() ở trên.
  native(sql?) {
    return new NativeStatement(this, sql);
  }

  async executeNative(sql?, args?) {
    await this.ready;
    const params = args.map(value => (value === undefined || (typeof value === 'number' && !Number.isFinite(value)) ? null : value));
    return this.#run(sql, params, /^\s*(INSERT|UPDATE|DELETE)\b/i.test(sql));
  }

  translated(sql?) {
    if (!this.#cache.has(sql)) this.#cache.set(sql, this.#sql.translate(sql));
    return this.#cache.get(sql);
  }

  // Một hoặc nhiều câu (DDL); SAVEPOINT/RELEASE/ROLLBACK TO dùng được khi đã trong giao dịch
  // SAVEPOINT chỉ dùng được trong giao dịch; src/platform/db.ts mở giao dịch qua runTransaction trước khi gọi.
  async exec(sql?) {
    await this.ready;
    const text = String(sql);
    const save = /^\s*SAVEPOINT\s+(\w+)/i.exec(text);
    const release = /^\s*RELEASE\s+(?:SAVEPOINT\s+)?(\w+)/i.exec(text);
    const back = /^\s*ROLLBACK\s+TO\s+(?:SAVEPOINT\s+)?(\w+)/i.exec(text);
    if (save) {
      return this.#run(`SAVEPOINT ${save[1]}`, [], true);
    }
    if (release) {
      return this.#run(`RELEASE SAVEPOINT ${release[1]}`, [], true);
    }
    if (back) return this.#run(`ROLLBACK TO SAVEPOINT ${back[1]}`, [], true);
    await this.#run(text, [], true);
  }

  // DB_SQL_STATS=1: đếm số lần chạy từng câu lệnh và in 25 câu nhiều nhất khi đóng kết nối (tìm chỗ gửi quá nhiều truy vấn)
  #stats = process.env.DB_SQL_STATS ? new Map() : null;
  #statsMs = 0;

  async #run(text?, params?, write?) {
    if (write) this.#writes++;
    if (this.#stats) this.#stats.set(text, (this.#stats.get(text) || 0) + 1);
    const began = this.#stats ? performance.now() : 0;
    try {
      return await this.#driver.query(text, params);
    } catch (error) {
      if (process.env.DB_DEBUG_SQL) console.error('[pg-sql]', error.message, text);
      throw error;
    } finally {
      if (this.#stats) this.#statsMs += performance.now() - began;
    }
  }

  async execute(sql?, args?) {
    await this.ready;
    const translated = this.translated(sql);
    // NaN / Infinity coi là NULL: PostgreSQL từ chối "NaN" ở cột số nguyên
    const params = args.map(value => (value === undefined || (typeof value === 'number' && !Number.isFinite(value)) ? null : value));
    return this.#run(translated.text, params, translated.write);
  }

  // Giao dịch ngoài cùng: BEGIN … COMMIT trên MỘT kết nối; bên trong dùng SAVEPOINT (src/platform/db.ts gọi exec('SAVEPOINT x'))
  async runTransaction(write?) {
    await this.ready;
    return this.#driver.transaction(write);
  }

  async close() {
    await this.ready.catch(() => {}); // close() có thể đến trước khi mở xong (test không dùng DB)
    if (this.#stats?.size) {
      const top = [...this.#stats].sort((a: any, b: any) => b[1] - a[1]).slice(0, 25);
      const total = [...this.#stats.values()].reduce((s, n) => s + n, 0);
      console.error(`[sql-stats] ${total} lệnh trong ${Math.round(this.#statsMs)} ms (chờ DB), ${this.#stats.size} câu khác nhau; nhiều nhất:`);
      for (const [sql, n] of top) console.error(`  ${String(n).padStart(6)}  ${sql.replace(/\s+/g, ' ').slice(0, 150)}`);
    }
    if (this.#driver) await this.#driver.close();
  }
}

class PostgresStatement {
  declare database: any;
  declare sql: any;

  constructor(database?, sql?) {
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
  declare database: any;
  declare sql: any;

  constructor(database?, sql?) {
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

class PoolDriver {
  declare pool: any;
  declare store: any;

  constructor(pool?, store?) {
    this.pool = pool;
    this.store = store;
  }

  async open() {
    await this.pool.query('SELECT 1');
  }

  query(text?, params?) {
    return (this.store.getStore() || this.pool).query(text, params);
  }

  exec(text?) {
    return (this.store.getStore() || this.pool).query(text);
  }

  async transaction(write?) {
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

export = { PostgresDatabase };
