'use strict';
// Chặn "xanh giả": số test `todo` của `npm test` không được tăng.
// Một test bị đặt thành todo (bởi pending() / pendingUnless() / { todo }) vẫn chạy nhưng KHÔNG làm npm test đỏ, nên một cờ sai
// (ví dụ mentions('src/server.ts', …) sau khi mã chuyển sang file khác) âm thầm tắt phủ. Hai lớp bảo vệ:
//   1. Tĩnh, nằm trong npm test (test/unit/todo-baseline.test.ts): đếm các chỗ nguồn gây todo trong test/ theo file và mỗi cờ
//      mentions('…', /mẫu/) phải còn khớp file nó nhìn. Số chỗ nguồn theo file không được tăng.
//   2. Động, chạy tay / CI sau mỗi bước chia file (công cụ này): chạy cả bộ test, đọc dòng `# todo N` và so với baseline.
//
//   node test/tools/check-todo.ts                  chạy cả bộ test (~80 giây), thoát 1 nếu fail > 0 hoặc todo > baseline
//   node test/tools/check-todo.ts --write          ghi lại baseline: chỉ HẠ (nâng cần --allow-growth kèm lý do); từ chối khi còn test đỏ (--allow-fail để bỏ qua)
//   node test/tools/check-todo.ts --write-sources  chỉ ghi lại danh sách chỗ nguồn tĩnh (nhanh, không chạy test), chỉ hạ
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '../..');
const BASELINE = path.join(ROOT, 'test/fixtures/todo-baseline.json');
const SOURCE = /\b(?:pending|pendingUnless)\(|\btodo\s*:|\.todo\(|\{\s*todo\b/g;
// Bỏ chỗ định nghĩa (red.js), chính công cụ và test của nó (có chữ pending( trong mẫu / thông báo)
const SKIP = (rel?) =>
  rel === 'test/helpers/red.ts' || rel.startsWith('test/tools/') || rel === 'test/unit/todo-baseline.test.ts';
const MENTIONS = /mentions\(\s*'([^']+)'\s*,\s*\/((?:\\.|[^/\\\n])+)\/([a-z]*)\s*\)/g;

function walk(dir?) {
  const abs = path.join(ROOT, dir);
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap(entry => {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return walk(rel);
    return /\.(js|ts)$/.test(entry.name) ? [rel] : [];
  });
}
// bỏ dòng chú thích thuần và phần chú thích cuối dòng (` // …`), vì chú thích có thể nhắc tên cờ cũ
const code = (text?) =>
  text
    .split('\n')
    .filter(line => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .map(line => line.replace(/\s\/\/\s.*$/, ''));

// { 'test/…js': số chỗ nguồn gây todo }, không tính chỗ định nghĩa trong test/helpers/red.ts
function staticSources() {
  const out: Record<string, any> = {};
  for (const rel of walk('test').sort()) {
    if (SKIP(rel)) continue;
    const n = (
      code(fs.readFileSync(path.join(ROOT, rel), 'utf8'))
        .join('\n')
        .match(SOURCE) || []
    ).length;
    if (n) out[rel] = n;
  }
  return out;
}
// Mọi cờ mentions('file', /mẫu/) trong test/: { test, file, source, flags }
function mentionFlags() {
  const out: any[] = [];
  for (const rel of walk('test').sort()) {
    if (SKIP(rel)) continue;
    for (const m of code(fs.readFileSync(path.join(ROOT, rel), 'utf8'))
      .join('\n')
      .matchAll(MENTIONS))
      out.push({ test: rel, file: m[1], source: m[2], flags: m[3] });
  }
  return out;
}
const load = () => JSON.parse(fs.readFileSync(BASELINE, 'utf8'));

module.exports = { staticSources, mentionFlags, load, BASELINE, ROOT };

if (require.main === module) {
  const write = process.argv.includes('--write'),
    writeSources = process.argv.includes('--write-sources'),
    growth = process.argv.includes('--allow-growth');
  const have = fs.existsSync(BASELINE) ? load() : null;
  const sources = staticSources();
  let summary: any = null;
  if (!writeSources) {
    const run = spawnSync(process.execPath, ['--no-warnings=ExperimentalWarning', '--test', 'test/**/*.test.ts'], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 1 << 29
    });
    const text = `${run.stdout}\n${run.stderr}`;
    const num = (name?) => Number((new RegExp(`^# ${name} (\\d+)`, 'm').exec(text) || [])[1]);
    summary = { tests: num('tests'), pass: num('pass'), fail: num('fail'), todo: num('todo') };
    console.log(`# tests ${summary.tests}  # pass ${summary.pass}  # fail ${summary.fail}  # todo ${summary.todo}`);
    if (Number.isNaN(summary.todo)) {
      console.error('Không đọc được dòng "# todo" của bộ test');
      process.exit(2);
    }
    if (have) console.log(`baseline: todo ${have.todo}, tests ${have.tests}`);
  }
  if (write || writeSources) {
    const next: Record<string, any> = {
      ...(have || {
        about: 'Số test todo của npm test không được tăng. Cập nhật: node test/tools/check-todo.ts --write'
      })
    };
    if (summary) {
      if (summary.fail > 0 && !process.argv.includes('--allow-fail')) {
        console.error(
          `KHÔNG ghi baseline khi còn ${summary.fail} test đỏ (sửa trước, hoặc --allow-fail nếu đỏ do việc khác đang làm dở)`
        );
        process.exit(1);
      }
      if (have && summary.todo > have.todo && !growth) {
        console.error(
          `KHÔNG nâng baseline todo ${have.todo} -> ${summary.todo} (chạy: node test/tools/check-todo.ts --write-sources --allow-growth, rồi ghi lý do vào thông điệp commit)`
        );
        process.exit(1);
      }
      next.todo = summary.todo;
      next.tests = summary.tests;
      next.recordedOn = new Date().toISOString().slice(0, 10);
    }
    const old = (have && have.sources) || {};
    const grew = Object.entries<any>(sources).filter(([rel, n]: any) => n > (old[rel] || 0));
    if (have && grew.length && !growth) {
      console.error(
        `KHÔNG nâng số chỗ nguồn todo: ${grew.map(([rel, n]: any) => `${rel} ${old[rel] || 0}->${n}`).join(', ')} (chạy: node test/tools/check-todo.ts --write-sources --allow-growth, rồi ghi lý do vào thông điệp commit)`
      );
      process.exit(1);
    }
    next.sources = sources;
    fs.mkdirSync(path.dirname(BASELINE), { recursive: true });
    fs.writeFileSync(BASELINE, JSON.stringify(next, null, 2) + '\n');
    console.log(`Đã ghi ${path.relative(ROOT, BASELINE)}`);
  } else if (summary) {
    const bad: any[] = [];
    if (summary.fail > 0) bad.push(`${summary.fail} test đỏ`);
    if (have && summary.todo > have.todo) bad.push(`todo tăng ${have.todo} -> ${summary.todo}`);
    if (!have) bad.push('chưa có baseline: chạy với --write');
    console.log(bad.length ? `ĐỎ: ${bad.join('; ')}` : 'Đạt: todo không tăng, không test đỏ');
    process.exit(bad.length ? 1 : 0);
  }
}
