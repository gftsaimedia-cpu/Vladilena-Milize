'use strict';
// Ngân sách cỡ file: mềm 800 dòng, cứng 1.200 dòng cho file mã.
// File đã vượt 1.200 từ trước nằm trong test/fixtures/file-size-budget.json với trần = cỡ hiện tại làm tròn lên trăm tiếp theo;
// trần chỉ được GIẢM. File ngoài danh sách vượt 1.200 thì test đỏ; 801 đến 1.200 chỉ được báo (diagnostic).
//
//   node test/tools/size-budget.ts                  in các file trên ngưỡng mềm, cỡ hiện tại, trần
//   node test/tools/size-budget.ts --write          ghi lại trần: chỉ HẠ trần (và bỏ mục của file đã xuống dưới 1.200); không thêm mục mới, không nâng trần
//   node test/tools/size-budget.ts --write --allow-growth [--headroom=200]   được nâng trần / thêm mục, kèm chỗ trống (phải có lý do trong commit; dùng khi file đang được chuyển đi hay đang bị sửa nhiều)
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '../..');
const BUDGET = path.join(ROOT, 'test/fixtures/file-size-budget.json');
const CODE = /\.(?:js|cjs|mjs|ts|html|css)$/;
const SKIP_DIRS = new Set<any>([
  'node_modules',
  '.git',
  'data',
  'docs',

  'test-results',
  'GFT OFFICE',
  '.claude',
  'backups',
  'ban-giao'
]);

function walk(dir = '') {
  const abs = path.join(ROOT, dir);
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap(entry => {
    const rel = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) return SKIP_DIRS.has(entry.name) ? [] : walk(rel);
    return CODE.test(entry.name) ? [rel] : [];
  });
}
// Danh sách file theo git: đã theo dõi hoặc chưa theo dõi nhưng không bị ignore (.gitignore, .git/info/exclude).
// Nhờ vậy thư mục bàn giao hay worktree tạm bị loại khỏi git không làm đỏ test. Không có git thì null và dùng walk() với SKIP_DIRS.
function gitFiles() {
  try {
    const out = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 64 * 1024 * 1024
    });
    return out
      .split('\0')
      .filter(
        rel =>
          rel &&
          CODE.test(rel) &&
          !rel
            .split('/')
            .slice(0, -1)
            .some(seg => SKIP_DIRS.has(seg))
      )
      .filter(rel => fs.existsSync(path.join(ROOT, rel)));
  } catch {
    return null;
  }
}
function lineCount(rel?) {
  const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  if (!text) return 0;
  return text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
}
const roundUp = (n?) => (Math.floor(n / 100) + 1) * 100; // 3070 -> 3100, 2800 -> 2900
const tight = (n?) => roundUp(n - 1); // trần sát nhất cho n dòng: 2800 -> 2800, 2801 -> 2900

function measure() {
  return Object.fromEntries((gitFiles() || walk()).map(rel => [rel, lineCount(rel)]));
}
const load = () => JSON.parse(fs.readFileSync(BUDGET, 'utf8'));

module.exports = { measure, load, tight, roundUp, BUDGET, ROOT };

if (require.main === module) {
  const sizes = measure();
  const mode = process.argv.includes('--write');
  const growth = process.argv.includes('--allow-growth');
  // chỗ trống thêm khi ghi trần mới (file còn đang có người sửa nhiều), ví dụ --headroom=200
  const headroom = Number((process.argv.find(a => a.startsWith('--headroom=')) || '').slice(11)) || 0;
  const have = fs.existsSync(BUDGET)
    ? load()
    : {
        soft: 800,
        hard: 1200,
        about: 'Trần chỉ được giảm. Cập nhật bằng node test/tools/size-budget.ts --write',
        exceptions: {}
      };
  const next = { ...have, exceptions: {} as Record<string, any> };
  const notes: any[] = [];
  for (const [rel, lines] of Object.entries<any>(sizes).sort((a: any, b: any) => b[1] - a[1])) {
    if (lines <= have.soft) continue;
    const old = have.exceptions[rel];
    if (lines > have.hard) {
      const want = tight(lines) + headroom;
      if (old === undefined) {
        if (growth || !fs.existsSync(BUDGET)) next.exceptions[rel] = want;
        else
          notes.push(`KHÔNG thêm ${rel} (${lines} dòng, vượt ${have.hard}): chia file, hoặc --allow-growth kèm lý do`);
      } else if (want > old && !growth) {
        next.exceptions[rel] = old;
        notes.push(`KHÔNG nâng trần ${rel}: ${lines} dòng > ${old}`);
      } else next.exceptions[rel] = growth ? want : Math.min(old, want);
    }
    const tag = old !== undefined ? `  (trần ${old})` : lines > have.hard ? '  (CHƯA CÓ TRONG DANH SÁCH)' : '';
    console.log(`${String(lines).padStart(6)}  ${rel}${tag}`);
  }
  for (const note of notes) console.log(note);
  if (mode) {
    next.exceptions = Object.fromEntries(Object.entries<any>(next.exceptions).sort((a: any, b: any) => b[1] - a[1]));
    fs.mkdirSync(path.dirname(BUDGET), { recursive: true });
    fs.writeFileSync(BUDGET, JSON.stringify(next, null, 2) + '\n');
    console.log(`Đã ghi ${path.relative(ROOT, BUDGET)} (${Object.keys(next.exceptions).length} ngoại lệ)`);
  }
}
