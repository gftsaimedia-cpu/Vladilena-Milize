'use strict';
// So dòng chuyển: sau khi cắt mã từ server.js (hay lib/db.js)
// sang file mới, mọi dòng không trống của bản cũ phải xuất hiện lại NGUYÊN VĂN (bỏ khoảng trắng, kể cả số lần lặp) trong các file mới,
// ngoài phần "keo" cho phép. In hai danh sách:
//   - dòng cũ không còn ở đâu (kỳ vọng: chỉ `if (route === …) {` của khối đã chuyển thành mục bảng, và dấu đóng)
//   - dòng mới không có ở bản cũ (kỳ vọng: chỉ require, module.exports, đầu mục `'KEY': async ({…}) => {`, `const { … } = ctx;`)
// Còn lại phải bằng 0, hoặc là dòng Prettier ngắt lại ở mức thụt mới (công cụ tự nhận khi nối các dòng lại thì trùng; vẫn in ra để xem).
//
//   node test/tools/moved-lines.js                                  bản cũ = server.js ở HEAD; mới = server.js + lib/{http,request-rules,announce}.js + lib/routes/** + lib/domain/** trong cây làm việc
//   node test/tools/moved-lines.js --base=<commit> --head=<commit>  so hai commit thay vì cây làm việc (--head bỏ trống = cây làm việc)
//   node test/tools/moved-lines.js --old=lib/db.js --new=lib/db.js,lib/store/*.js     áp cho lib/db.js → lib/store/
//   thêm --verbose để in cả các dòng keo đã bỏ qua; thoát mã 1 nếu còn dòng không giải thích được.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '../..');
const squash = line => line.replace(/\s+/g, '');
const NOISE = /^[)}\]]+[;,]*$/; // dấu đóng đứng một mình: số lượng đổi theo cách bọc nên chỉ đếm, không đòi khớp

/* ---------- đọc nguồn ---------- */
function gitShow(ref, rel) {
  try {
    return execFileSync('git', ['show', `${ref}:${rel}`], {
      cwd: ROOT,
      maxBuffer: 1 << 28,
      stdio: ['ignore', 'pipe', 'ignore']
    }).toString('utf8');
  } catch {
    return null;
  }
}
function gitList(ref) {
  return execFileSync('git', ['ls-tree', '-r', '--name-only', ref], { cwd: ROOT, maxBuffer: 1 << 28 })
    .toString('utf8')
    .split('\n')
    .filter(Boolean);
}
function walk(dir) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap(entry => {
    const rel = `${dir}/${entry.name}`;
    return entry.isDirectory() ? (entry.name === 'node_modules' ? [] : walk(rel)) : [rel];
  });
}
const globToRegExp = glob =>
  new RegExp(
    '^' +
      glob
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*/g, '\u0000')
        .replace(/\*/g, '[^/]*')
        .replace(/\u0000/g, '.*') +
      '$'
  );
function expand(patterns, head) {
  const all = head ? gitList(head) : null;
  const out = [];
  for (const pattern of patterns) {
    if (!pattern.includes('*')) {
      out.push(pattern);
      continue;
    }
    const segments = pattern.split('/');
    const staticDir = segments
      .slice(
        0,
        segments.findIndex(s => s.includes('*'))
      )
      .join('/');
    const re = globToRegExp(pattern);
    const files = all ? all.filter(f => f.startsWith(staticDir + '/')) : walk(staticDir);
    out.push(...files.filter(f => re.test(f)).sort());
  }
  return [...new Set(out)];
}
function readFiles(files, ref) {
  return files.flatMap(rel => {
    const text = ref
      ? gitShow(ref, rel)
      : fs.existsSync(path.join(ROOT, rel))
        ? fs.readFileSync(path.join(ROOT, rel), 'utf8')
        : null;
    return text === null ? [] : [{ file: rel, text: text.replace(/\r\n/g, '\n') }];
  });
}

/* ---------- tách "keo" khỏi văn bản mới ---------- */
// Một câu lệnh bắt đầu ở dòng i: gom dòng tới khi ngoặc cân và dòng kết thúc bằng ; (đủ cho require và huỷ cấu trúc)
function statementEnd(lines, start) {
  let depth = 0;
  for (let i = start; i < lines.length; i++) {
    const code = lines[i].replace(/'[^']*'|"[^"]*"|`[^`]*`|\/\/.*$/g, '');
    for (const ch of code) depth += '([{'.includes(ch) ? 1 : ')]}'.includes(ch) ? -1 : 0;
    if (depth <= 0 && /;\s*(\/\/.*)?$/.test(lines[i])) return i;
    if (depth <= 0 && i > start + 60) return start;
  }
  return start;
}
const REQUIRE_STATEMENT =
  /^(?:const|let|var)\s+[\s\S]*?=\s*require\(\s*['"][^'"]+['"]\s*\)(?:\.[\w$.]+)?(?:\([^)]*\))?\s*;[ \t]*(?:\/\/[^\n]*)?/;
const CTX_DESTRUCTURE = /^(?:const|let|var)\s+\{[\s\S]*?\}\s*=\s*ctx\s*;[ \t]*(?:\/\/[^\n]*)?/;
const ENTRY_HEAD = /^\s*'[A-Z]+ [^']*'\s*:\s*(?:async\s*)?(?:\(|function\b|[\w$]+\s*=>)/;

// Trả { kept: [{file,line,text}], glue: {kind: [..]} }: các dòng mới còn lại để so, và các dòng keo đã tách
function stripGlue(file, text) {
  const lines = text.split('\n');
  const kept = [],
    glue = {};
  const note = (kind, i, j) => (glue[kind] = glue[kind] || []).push(...lines.slice(i, j + 1).map(l => l.trim()));
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    if (/^'use strict';?\s*$/.test(line.trim())) {
      note('use strict', i, i);
      continue;
    }
    if (/^(?:const|let|var)\s/.test(line)) {
      const end = statementEnd(lines, i);
      const statement = lines.slice(i, end + 1).join('\n');
      if (REQUIRE_STATEMENT.test(statement) && statement.replace(REQUIRE_STATEMENT, '').trim() === '') {
        note('require', i, end);
        i = end;
        continue;
      }
      if (CTX_DESTRUCTURE.test(statement) && statement.replace(CTX_DESTRUCTURE, '').trim() === '') {
        note('ctx', i, end);
        i = end;
        continue;
      }
    }
    if (/^module\.exports\b/.test(line)) {
      // `module.exports = { a, b };` nhiều dòng chỉ toàn tên: toàn bộ là keo. Còn lại (bảng handler) chỉ riêng dòng mở là keo.
      if (/\{\s*$/.test(line)) {
        let j = i + 1;
        while (j < lines.length && !/^\}\)?;?\s*$/.test(lines[j]) && /^\s*[\w$]+(\s*:\s*[\w$.]+)?,?\s*$/.test(lines[j]))
          j++;
        if (j < lines.length && /^\}\)?;?\s*$/.test(lines[j])) {
          note('module.exports', i, j);
          i = j;
          continue;
        }
      }
      if (!/\{\s*$/.test(line)) {
        const end = statementEnd(lines, i);
        note('module.exports', i, end);
        i = end;
        continue;
      }
      note('module.exports', i, i);
      continue;
    }
    if (
      /^\s*(?:routes|handlers)\s*:\s*\{\s*$/.test(line) ||
      /^\s*const\s+(?:routes|HANDLERS)\s*=\s*\{\s*$/.test(line)
    ) {
      note('bảng', i, i);
      continue;
    }
    if (ENTRY_HEAD.test(line)) {
      // đầu mục có thể bị Prettier ngắt nhiều dòng: tìm dòng kết thúc bằng `=> {` trong 15 dòng; không thấy thì chỉ dòng đầu là keo
      const limit = Math.min(lines.length, i + 15);
      let j = i;
      while (j < limit && !/=>\s*\{\s*$/.test(lines[j])) j++;
      if (j >= limit) j = i;
      note('đầu mục', i, j);
      i = j;
      continue;
    }
    kept.push({ file, line: i + 1, text: line });
  }
  return { kept, glue };
}
// Dòng cũ được phép biến mất: cổng `if (route === …) {` của khối đã chuyển thành mục bảng
const isRouteGate = squashed => /^if\(.*(?:route===|seg\[1\]===|periodKey\.includes).*\)\{?$/.test(squashed);

/* ---------- so sánh ---------- */
function compare(oldFiles, newFiles) {
  const oldEntries = oldFiles.flatMap(({ file, text }) => stripGlue(file, text).kept);
  const glue = {};
  const newEntries = [];
  for (const { file, text } of newFiles) {
    const stripped = stripGlue(file, text);
    newEntries.push(...stripped.kept);
    for (const [kind, list] of Object.entries(stripped.glue)) (glue[kind] = glue[kind] || []).push(...list);
  }
  const pool = new Map();
  for (const entry of oldEntries) {
    const key = squash(entry.text);
    if (!pool.has(key)) pool.set(key, []);
    pool.get(key).push(entry);
  }
  const added = [];
  let matched = 0;
  for (const entry of newEntries) {
    const list = pool.get(squash(entry.text));
    if (list && list.length) {
      list.pop();
      matched += 1;
    } else added.push(entry);
  }
  let removed = [...pool.values()].flat().sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);

  const result = {
    oldCount: oldEntries.length,
    newCount: newEntries.length,
    matched,
    glue,
    gates: [],
    noise: { removed: 0, added: 0 },
    reflowed: { removed: [], added: [] }
  };
  const removedAll = removed.filter(entry => !isRouteGate(squash(entry.text)));
  removed = removed.filter(entry => {
    const key = squash(entry.text);
    if (isRouteGate(key)) return (result.gates.push(entry), false);
    if (NOISE.test(key)) return ((result.noise.removed += 1), false);
    return true;
  });
  const addedKept = added.filter(entry => {
    if (NOISE.test(squash(entry.text))) return ((result.noise.added += 1), false);
    return true;
  });
  // Prettier ngắt lại dòng: dòng cũ nằm trọn trong chuỗi các dòng mới chưa khớp (hoặc ngược lại) khi bỏ khoảng trắng
  const MIN = 8;
  const addedJoined = added.map(e => squash(e.text)).join('');
  const removedJoined = removedAll.map(e => squash(e.text)).join('');
  const stillRemoved = [],
    stillAdded = [];
  for (const entry of removed) {
    const key = squash(entry.text);
    (key.length >= MIN && addedJoined.includes(key) ? result.reflowed.removed : stillRemoved).push(entry);
  }
  for (const entry of addedKept) {
    const key = squash(entry.text);
    (key.length >= MIN && removedJoined.includes(key) ? result.reflowed.added : stillAdded).push(entry);
  }
  result.removed = stillRemoved;
  result.added = stillAdded;
  return result;
}

function format(result, verbose) {
  const at = e => `${e.file}:${e.line}: ${e.text.trim()}`;
  const out = [];
  out.push(
    `Dòng cũ (không trống): ${result.oldCount}; dòng mới sau khi bỏ keo: ${result.newCount}; khớp nguyên văn: ${result.matched}`
  );
  out.push(
    `Keo mới được bỏ qua: ${
      Object.entries(result.glue)
        .map(([kind, list]) => `${kind} ${list.length}`)
        .join(', ') || 'không có'
    }`
  );
  out.push(
    `Cổng route cũ đã biến mất (cho phép): ${result.gates.length}; dấu đóng lệch: -${result.noise.removed} +${result.noise.added}`
  );
  out.push(
    `Prettier ngắt lại dòng (người duyệt xem): cũ ${result.reflowed.removed.length}, mới ${result.reflowed.added.length}`
  );
  if (verbose) {
    for (const [kind, list] of Object.entries(result.glue)) out.push(`  keo ${kind}:`, ...list.map(l => `    ${l}`));
    out.push('  cổng route:', ...result.gates.map(e => `    ${at(e)}`));
    out.push(
      '  ngắt lại (cũ):',
      ...result.reflowed.removed.map(e => `    ${at(e)}`),
      '  ngắt lại (mới):',
      ...result.reflowed.added.map(e => `    ${at(e)}`)
    );
  }
  out.push(`DÒNG CŨ KHÔNG CÒN Ở ĐÂU: ${result.removed.length}`, ...result.removed.map(e => `  - ${at(e)}`));
  out.push(`DÒNG MỚI KHÔNG CÓ Ở BẢN CŨ: ${result.added.length}`, ...result.added.map(e => `  + ${at(e)}`));
  return out.join('\n');
}

module.exports = { compare, stripGlue, format, squash };

if (require.main === module) {
  const arg = name => (process.argv.find(a => a.startsWith(`--${name}=`)) || '').slice(name.length + 3);
  const base = arg('base') || 'HEAD',
    head = arg('head') || null;
  const oldPaths = (arg('old') || 'src/server.ts').split(',').filter(Boolean);
  const newPaths = arg('new')
    ? arg('new').split(',').filter(Boolean)
    : require('../helpers/server-source').serverFiles();
  const oldFiles = readFiles(expand(oldPaths, base), base);
  if (!oldFiles.length) {
    console.error(`Không đọc được ${oldPaths.join(', ')} ở ${base}`);
    process.exit(2);
  }
  const newFiles = readFiles(expand(newPaths, head), head);
  console.log(
    `So: ${oldPaths.join(', ')} @ ${base}  ->  ${newFiles.map(f => f.file).join(', ')} @ ${head || 'cây làm việc'}`
  );
  const result = compare(oldFiles, newFiles);
  console.log(format(result, process.argv.includes('--verbose')));
  process.exit(result.removed.length || result.added.length ? 1 : 0);
}
