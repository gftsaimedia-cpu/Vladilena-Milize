'use strict';

// Demo source is a verified PostgreSQL backup file. Workflows restore it into a database they create and own.
const fs = require('node:fs');
const path = require('node:path');
const { TemporaryPostgres } = require('../../../src/data/temporary-postgres');
const pgBackup = require('../../../src/ops/pg-backup');

const ROOT = path.join(__dirname, '..', '..', '..');
const CONTROL_DATABASES = new Set([
  '/luong_demo_control',
  '/luong_test_control',
  '/luong_sandbox_control',
  '/luong_drill_control',
  '/luong_scenario_control'
]);

async function demoInfo(file?) {
  try {
    if (typeof file !== 'string' || !fs.statSync(file).isFile()) return { marked: false, today: null };
    const report = await pgBackup.verifyFile(file);
    if (!report.ok) return { marked: false, today: null };
    const row = (report.rowsByTable.get('settings') || []).find(r => r.key === 'demo_dataset');
    if (!row) return { marked: false, today: null };
    const value = typeof row.value_json === 'string' ? JSON.parse(row.value_json) : row.value_json;
    if (value?.version !== 1 || typeof value.today !== 'string') return { marked: false, today: null };
    return { marked: true, today: value.today };
  } catch {
    return { marked: false, today: null };
  }
}

function demoControlUrl() {
  const value = process.env.DEMO_PG_CONTROL_URL;
  let control;
  try {
    control = new URL(value || '');
  } catch {
    throw new Error('Cần DEMO_PG_CONTROL_URL trỏ tới control PostgreSQL dành riêng cho demo.');
  }
  if (!['postgres:', 'postgresql:'].includes(control.protocol) || !CONTROL_DATABASES.has(control.pathname))
    throw new Error('DEMO_PG_CONTROL_URL phải trỏ tới database control PostgreSQL được nhận diện riêng.');
  return value;
}

async function withDemoSnapshot(file?, run?) {
  const info = await demoInfo(file);
  if (!info.marked) throw new Error('Bản sao phải là file .pgbak.gz hợp lệ có dữ liệu demo (demo_dataset).');
  const controlUrl = demoControlUrl();
  const previous = Object.fromEntries(['DATABASE_URL', 'DB_PATH', 'PG_TEST_URL'].map(k => [k, process.env[k]]));
  let interruptedBy = null;
  let stopAction = null;
  let store = null;
  const onSignal = signal => {
    if (interruptedBy) return;
    interruptedBy = signal;
    process.exitCode = 1;
    if (stopAction)
      Promise.resolve()
        .then(stopAction)
        .catch(() => {});
  };
  const onInterrupt = () => onSignal('SIGINT');
  const onTerminate = () => onSignal('SIGTERM');
  process.once('SIGINT', onInterrupt);
  process.once('SIGTERM', onTerminate);
  try {
    const result = await TemporaryPostgres.using(controlUrl, 'demo', async database => {
      if (interruptedBy) return undefined;
      const { PostgresDatabase } = require('../../../src/data/postgres-database');
      const schema = new PostgresDatabase({ url: database.url, max: 1 });
      try {
        await schema.ready;
      } finally {
        await schema.close();
      }
      if (interruptedBy) return undefined;
      await pgBackup.restore(file, database.url);
      if (interruptedBy) return undefined;

      process.env.DATABASE_URL = database.url;
      delete process.env.DB_PATH;
      delete process.env.PG_TEST_URL;
      const activeStore = require(path.join(ROOT, 'src/platform/db'));
      store = activeStore;
      await activeStore.ready;
      try {
        const restored = await activeStore.getSetting('demo_dataset');
        if (restored?.version !== 1 || restored.today !== info.today)
          throw new Error('Bản sao khôi phục không khớp với dấu demo_dataset đã kiểm tra.');
        return await run({
          database,
          info,
          store: activeStore,
          setStopAction: action => {
            stopAction = action;
            if (interruptedBy)
              Promise.resolve()
                .then(stopAction)
                .catch(() => {});
          }
        });
      } finally {
        await activeStore.db.close();
      }
    });
    if (interruptedBy) throw new Error(`Demo đã dừng theo ${interruptedBy}; database tạm đã được dọn.`);
    return result;
  } finally {
    process.removeListener('SIGINT', onInterrupt);
    process.removeListener('SIGTERM', onTerminate);
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function saveDemoSnapshot(sourceUrl?, targetFile?) {
  const target = path.resolve(String(targetFile || ''));
  if (!/\.pgbak\.gz$/i.test(target)) throw new Error('--keep phải là đường dẫn file .pgbak.gz rõ ràng.');
  if (fs.existsSync(target)) throw new Error('--keep từ chối ghi đè file đã tồn tại.');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  let reserved = false;
  const work = fs.mkdtempSync(path.join(path.dirname(target), `.${path.basename(target)}.tmp-`));
  try {
    const created = await pgBackup.backup(sourceUrl, work);
    const fd = fs.openSync(target, 'wx');
    reserved = true;
    fs.closeSync(fd);
    fs.copyFileSync(created.file, target);
    const check = await pgBackup.verifyFile(target);
    if (!check.ok || !(await demoInfo(target)).marked)
      throw new Error('File .pgbak.gz vừa tạo không đạt kiểm tra demo.');
    return { file: target, tables: check.header.tables.length, rows: check.rows };
  } catch (error) {
    if (reserved) fs.rmSync(target, { force: true });
    throw error;
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

module.exports = { demoInfo, withDemoSnapshot, saveDemoSnapshot };
