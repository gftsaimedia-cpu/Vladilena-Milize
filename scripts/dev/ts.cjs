'use strict';
// Chạy node với trình nạp TypeScript (tsx) cho tiến trình này VÀ mọi tiến trình con (NODE_OPTIONS=--import=tsx):
// test và script nạp các file .ts của lib/ và src/, và nhiều chỗ tự sinh tiến trình con (`node -e "require('./src/platform/db')"`).
//   node scripts/dev/ts.cjs scripts/ops/pg-backup.ts backup      → node --import=tsx scripts/ops/pg-backup.ts backup
//   node scripts/dev/ts.cjs --test "test/**/*.test.ts"           → node --test … (tiến trình test con cũng nạp tsx)
const { spawn } = require('node:child_process');

const options = ['--import=tsx', process.env.NODE_OPTIONS].filter(Boolean).join(' ');
const child = spawn(process.execPath, ['--no-warnings=ExperimentalWarning', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, NODE_OPTIONS: options }
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
