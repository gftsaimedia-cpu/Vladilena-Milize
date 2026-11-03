'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { TemporaryPostgres } = require('../../../../src/data/temporary-postgres');
const { PostgresDatabase } = require('../../../../src/data/postgres-database');
const pgBackup = require('../../../../src/ops/pg-backup');
const { boot } = require('./boot');

const OUT = path.resolve(__dirname, '..', 'out');
const CONTROL_ENV = 'SCENARIO_PG_CONTROL_URL';

function assertScenarioRuntimePlatform(platform = process.platform): void {
  if (platform === 'win32')
    throw new Error('Scenario PostgreSQL commands require Linux, WSL, or macOS so shutdown can await cleanup. Run them inside WSL on Windows.');
}

function safeErrorText(error: any): string {
  const detail = error && error.stack ? error.stack : error;
  return String(detail).replace(/postgres(?:ql)?:\/\/\S+/gi, '[URL]');
}

function scenarioControlUrl(environment: NodeJS.ProcessEnv = process.env): string {
  const value = environment[CONTROL_ENV];
  if (!value) throw new Error(`Cáº§n ${CONTROL_ENV} trÃªn mÃ¡y PostgreSQL dÃ nh riÃªng cho scenario.`);
  let control: URL;
  try {
    control = new URL(value);
  } catch {
    throw new Error(`${CONTROL_ENV} khÃ´ng há»£p lá»‡.`);
  }
  if (
    !['postgres:', 'postgresql:'].includes(control.protocol) ||
    !['/luong_test_control', '/luong_scenario_control'].includes(control.pathname)
  )
    throw new Error(`${CONTROL_ENV} pháº£i trá» tá»›i control database test/scenario riÃªng.`);
  if (environment.DATABASE_URL) {
    try {
      if (new URL(environment.DATABASE_URL).toString() === control.toString())
        throw new Error(`${CONTROL_ENV} khÃ´ng Ä‘Æ°á»£c lÃ  URL database á»©ng dá»¥ng.`);
    } catch (error) {
      if (error instanceof Error && error.message.includes(CONTROL_ENV)) throw error;
    }
  }
  return value;
}

function outputDirectory(value = OUT): string {
  const directory = path.resolve(value);
  const relative = path.relative(OUT, directory);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
    throw new Error('ThÆ° má»¥c artifact scenario pháº£i náº±m trong scripts/dev/scenarios/out/.');
  let current = OUT;
  if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink())
    throw new Error('ThÆ° má»¥c artifact scenario khÃ´ng Ä‘Æ°á»£c lÃ  symbolic link.');
  for (const part of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink())
      throw new Error('ThÆ° má»¥c artifact scenario khÃ´ng Ä‘Æ°á»£c chá»©a symbolic link.');
  }
  return directory;
}

function ensureOutputDirectory(value = OUT): string {
  const directory = outputDirectory(value);
  fs.mkdirSync(directory, { recursive: true });
  return directory;
}

function snapshotPath(value = path.join(OUT, 'scenario-year.pgbak.gz'), directory = OUT): string {
  const root = outputDirectory(directory);
  const file = path.resolve(value);
  if (path.dirname(file) !== root) throw new Error('Snapshot scenario pháº£i náº±m trá»±c tiáº¿p trong thÆ° má»¥c out Ä‘Ã£ chá»n.');
  if (!/^[a-zA-Z0-9._-]+\.pgbak\.gz$/.test(path.basename(file)))
    throw new Error('Snapshot scenario pháº£i cÃ³ Ä‘uÃ´i .pgbak.gz.');
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Snapshot scenario pháº£i lÃ  file thÆ°á»ng.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return file;
}

async function openScenarioDatabase({ controlUrl = scenarioControlUrl(), snapshot, initialLocal, variant = null, quietWarnings = true, beforeAppImport }: any) {
  const controlEnvironment = { SCENARIO_PG_CONTROL_URL: controlUrl };
  const safeControlUrl = scenarioControlUrl(controlEnvironment);
  const temporary = await TemporaryPostgres.create(safeControlUrl, 'scenario');
  let app: any;
  let closed = false;
  let migrationDatabase: any;
  const close = async () => {
    if (closed) return;
    closed = true;
    try {
      if (app && app.store && app.store.db) await app.store.db.close();
    } finally {
      await temporary.close();
    }
  };
  try {
    migrationDatabase = new PostgresDatabase({ url: temporary.url, max: 1 });
    await migrationDatabase.ready;
    await migrationDatabase.close();
    migrationDatabase = null;
    if (snapshot) await pgBackup.restore(snapshotPath(snapshot, path.dirname(path.resolve(snapshot))), temporary.url);
    app = await boot({ databaseUrl: temporary.url, initialLocal, variant, quietWarnings, beforeAppImport });
    await app.store.ready;
    await app.initialized;
    return { app, temporary, close };
  } catch (error) {
    try {
      if (migrationDatabase) await migrationDatabase.close();
    } finally {
      await close();
    }
    throw error;
  }
}

async function withScenarioDatabase(options: any, run: (app: any, temporary: any) => Promise<any>) {
  const scenario = await openScenarioDatabase(options);
  try {
    return await run(scenario.app, scenario.temporary);
  } finally {
    await scenario.close();
  }
}

async function writeSnapshot(db: any, destination: string): Promise<string> {
  const file = snapshotPath(destination, path.dirname(path.resolve(destination)));
  const parent = path.dirname(file);
  fs.mkdirSync(parent, { recursive: true });
  const temporaryDirectory = fs.mkdtempSync(path.join(parent, '.scenario-snapshot-'));
  try {
    const result = await pgBackup.backup(db, temporaryDirectory, { keep: 1 });
    fs.renameSync(result.file, file);
    return file;
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

function copySnapshot(source: string, destination: string): string {
  const sourceFile = snapshotPath(source, path.dirname(path.resolve(source)));
  const destinationFile = snapshotPath(destination, path.dirname(path.resolve(destination)));
  if (sourceFile === destinationFile) throw new Error('KhÃ´ng thá»ƒ thay snapshot nguá»“n báº±ng chÃ­nh nÃ³.');
  const tempFile = path.join(path.dirname(destinationFile), `.scenario-copy-${crypto.randomBytes(8).toString('hex')}.pgbak.gz`);
  try {
    fs.copyFileSync(sourceFile, tempFile, fs.constants.COPYFILE_EXCL);
    fs.renameSync(tempFile, destinationFile);
    return destinationFile;
  } finally {
    fs.rmSync(tempFile, { force: true });
  }
}

module.exports = {
  OUT,
  assertScenarioRuntimePlatform,
  safeErrorText,
  scenarioControlUrl,
  outputDirectory,
  ensureOutputDirectory,
  snapshotPath,
  openScenarioDatabase,
  withScenarioDatabase,
  writeSnapshot,
  copySnapshot
};
