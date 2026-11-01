'use strict';
// Quét hằng số ngoài 0 và 1 trong mã tính lương. Chỉ đọc tệp, không phụ thuộc thư viện phân tích cú pháp.
// Bỏ qua chú thích, chuỗi, biểu thức chính quy; số trong ${...} của chuỗi mẫu vẫn bị quét.
//   node scripts/params/scan-magic-numbers.ts src/engine/payroll-engine.ts [thêm tệp ...]    thoát 1 nếu có vi phạm
const fs = require('node:fs');

function scan(source?) {
  let out = '',
    i = 0;
  const n = source.length;
  while (i < n) {
    const c = source[i],
      d = source[i + 1];
    if (c === '/' && d === '/') {
      while (i < n && source[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && d === '*') {
      i += 2;
      while (i < n && !(source[i] === '*' && source[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    if (c === "'" || c === '"') {
      i++;
      while (i < n && source[i] !== c) {
        if (source[i] === '\\') i++;
        i++;
      }
      i++;
      out += '""';
      continue;
    }
    if (c === '`') {
      i++;
      while (i < n && source[i] !== '`') {
        if (source[i] === '\\') i++;
        if (source[i] === '$' && source[i + 1] === '{') {
          let depth = 1;
          i += 2;
          out += ' ';
          while (i < n && depth) {
            if (source[i] === '{') depth++;
            if (source[i] === '}') depth--;
            if (depth) out += source[i];
            i++;
          }
          continue;
        }
        i++;
      }
      i++;
      out += '""';
      continue;
    }
    if (c === '/') {
      const prev = out.replace(/\s+$/, '').slice(-1);
      if (!prev || '(,=:[!&|?{};'.includes(prev)) {
        i++;
        while (i < n && source[i] !== '/') {
          if (source[i] === '\\') i++;
          else if (source[i] === '[') {
            while (i < n && source[i] !== ']') {
              if (source[i] === '\\') i++;
              i++;
            }
          }
          i++;
        }
        i++;
        while (/[a-z]/.test(source[i] || '')) i++;
        out += '/re/';
        continue;
      }
    }
    out += c;
    i++;
  }
  const found: any[] = [];
  out.split('\n').forEach((line, index) => {
    for (const m of line.matchAll(/(?<![A-Za-z_$.\d])(\d+(?:\.\d+)?(?:e[+-]?\d+)?)(?![\w$])/gi))
      if (m[1] !== '0' && m[1] !== '1') found.push({ line: index + 1, value: m[1], text: line.trim().slice(0, 100) });
  });
  return found;
}

module.exports = { scan };
if (require.main === module) {
  let total = 0;
  for (const file of process.argv.slice(2)) {
    const found = scan(fs.readFileSync(file, 'utf8'));
    total += found.length;
    console.log(`${file}: ${found.length} hằng số ngoài 0 và 1`);
    for (const f of found) console.log(`  ${f.line}: ${f.value}  | ${f.text}`);
  }
  if (total) process.exit(1);
}
