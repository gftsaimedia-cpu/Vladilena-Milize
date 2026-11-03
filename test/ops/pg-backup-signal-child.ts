'use strict';

const { TemporaryPostgres } = require('../../src/data/temporary-postgres');
const { Pool } = require('pg');
const pgBackup = require('../../src/ops/pg-backup');
const originalUsing = TemporaryPostgres.using;
const originalCreate = TemporaryPostgres.create;
const originalQuery = Pool.prototype.query;
const phase = process.env.PG_BACKUP_TEST_SIGNAL_PHASE;
const signal = process.env.PG_BACKUP_TEST_SIGNAL;
let signalSent = false;
const delay = () => new Promise(resolve => setTimeout(resolve, 200));
const emitSignal = () => {
  signalSent = true;
  process.emit(signal);
};

TemporaryPostgres.create = async function (...args) {
  const database = await originalCreate.apply(this, args);
  process.stdout.write(`DATABASE_NAME=${database.name}\n`);
  return database;
};

Pool.prototype.query = function (...args) {
  const sql = typeof args[0] === 'string' ? args[0] : args[0]?.text;
  const isCreate = /^CREATE DATABASE\b/i.test(sql || '');
  const isDrop = /^DROP DATABASE\b/i.test(sql || '');
  const query = originalQuery.apply(this, args);
  if ((!signalSent && phase === 'create' && isCreate) || (!signalSent && phase === 'cleanup' && isDrop)) {
    return (async () => {
      // Keep the query Promise unresolved while sending the signal; this does not assert that PostgreSQL is still executing SQL.
      await delay();
      emitSignal();
      return await query;
    })();
  }
  return query;
};

TemporaryPostgres.using = function (adminUrl?, purpose?, run?, options?) {
  return originalUsing.call(
    this,
    adminUrl,
    purpose,
    async database => {
      const operation = run(database);
      operation.catch(() => {});
      if (phase === 'restore') {
        await delay();
        emitSignal();
      }
      return operation;
    },
    options
  );
};

pgBackup.drill(process.argv[2], process.env.DRILL_PG_CONTROL_URL).then(
  () => {
    process.exitCode = 0;
  },
  () => {
    process.exitCode = 1;
  }
);
