'use strict';

const path = require('node:path');
const { TemporaryPostgres } = require('../../src/data/temporary-postgres');
const originalCreate = TemporaryPostgres.create;
const ROOT = path.join(__dirname, '..', '..');
const snapshot = process.argv[2];

TemporaryPostgres.create = async function (...args) {
  const database = await originalCreate.apply(this, args);
  process.stdout.write(`DATABASE_NAME=${database.name}\n`);
  return database;
};

process.argv = [
  process.argv[0],
  path.join(ROOT, 'scripts/db/demo/serve-demo.ts'),
  `--snapshot=${snapshot}`,
  '--port=0'
];
require('../../scripts/db/demo/serve-demo');
