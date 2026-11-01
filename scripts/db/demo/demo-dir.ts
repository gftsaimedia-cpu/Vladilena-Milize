'use strict';
// DB demo nằm ở một THƯ MỤC PostgreSQL trong tiến trình (PGlite). Hai việc dùng chung của serve-demo và period-check:
//   demoInfo(dir)       → { marked, today } đọc khoá `demo_dataset` (mở chỉ để đọc ở tiến trình con, không đụng thư mục); thư mục hỏng hoặc
//                         không phải DB demo thì marked = false.
//   copyDemo(src, dst)  → sao chép nguyên thư mục (DB nguồn không đang mở), để chạy thử trên bản sao.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..', '..');
const PROBE = `const { PostgresDatabase } = require('./src/data/postgres-database');
(async () => {
  const db = new PostgresDatabase({ dataDir: process.argv[1] });
  let out = { marked: false, today: null };
  try {
    await db.ready;
    const row = await db.prepare("SELECT value_json FROM settings WHERE key = 'demo_dataset'").get();
    if (row) out = { marked: true, today: JSON.parse(row.value_json).today || null };
  } catch {}
  await db.close();
  console.log(JSON.stringify(out));
})();`;

function demoInfo(dir?) {
  // Sao chép trước để lần mở thử không ghi gì vào thư mục nguồn (PGlite ghi WAL khi mở)
  const probeDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'aicb-probe-'));
  try {
    fs.cpSync(dir, probeDir, { recursive: true });
    const r = spawnSync(process.execPath, ['--no-warnings=ExperimentalWarning', '-e', PROBE, probeDir], {
      cwd: ROOT,
      encoding: 'utf8'
    });
    return JSON.parse(String(r.stdout).trim().split('\n').pop() as string);
  } catch {
    return { marked: false, today: null };
  } finally {
    fs.rmSync(probeDir, { recursive: true, force: true });
  }
}

function copyDemo(src?, dst?) {
  fs.rmSync(dst, { recursive: true, force: true });
  fs.cpSync(src, dst, { recursive: true });
}

module.exports = { demoInfo, copyDemo };
