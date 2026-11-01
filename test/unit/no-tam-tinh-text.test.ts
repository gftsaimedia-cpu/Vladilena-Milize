'use strict';
// Quét public/, lib/, server.js, spec/ (không quét test/fixtures): không còn chữ "tạm tính" ở bất kỳ dạng nào.
// Dạng được bắt: hoa/thường/IN HOA, có dấu hoặc không dấu, dấu tổ hợp (NFD), gạch nối hay gạch dưới giữa hai chữ,
// thực thể HTML (&#7841; &iacute; &nbsp;), mã thoát ạ í, và chuỗi bị tách bằng nháy, dấu cộng, xuống dòng.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const TARGETS = ['src', 'spec'];
const TEXT_EXT = new Set<any>(['.js', '.cjs', '.mjs', '.ts', '.html', '.css', '.json', '.md', '.txt', '.svg']);
const SKIP_DIR = new Set<any>(['node_modules', '.git', 'fixtures']);

// chữ "tạm" và chữ "tính" ở các dạng viết khác nhau (dựng từ mã thoát để tệp này không tự chứa chữ cần tìm)
const TAM = '(?:t(?:\\u1ea1|a\\u0323|a|\\\\u1ea1|&#7841;|&#x1ea1;)m)';
const TINH = '(?:t(?:\\u00ed|i\\u0301|i|\\\\u00ed|&iacute;|&#237;|&#xed;)nh)';
// giữa hai chữ: khoảng trắng, gạch, chấm, nháy, dấu cộng, thực thể khoảng trắng, hoặc chú thích chen vào
const GAP = '(?:[\\s\\-_.\'"`+\\\\]|&nbsp;|\\\\u00a0|\\\\n|\\/\\*[\\s\\S]*?\\*\\/)*';
const PATTERN = new RegExp(TAM + GAP + TINH, 'gi');

function filesUnder(entry?) {
  const full = path.join(ROOT, entry);
  if (!fs.existsSync(full)) return [];
  const stat = fs.statSync(full);
  if (stat.isFile()) return [full];
  const out: any[] = [];
  for (const name of fs.readdirSync(full)) {
    if (SKIP_DIR.has(name)) continue;
    out.push(...filesUnder(path.join(entry, name)));
  }
  return out.filter(f => TEXT_EXT.has(path.extname(f)) || path.extname(f) === '');
}

test('Không còn chữ tạm tính trong public/, lib/, server.js, spec/', () => {
  const hits: any[] = [];
  let scanned = 0;
  for (const target of TARGETS) {
    for (const file of filesUnder(target)) {
      let text;
      try {
        text = fs.readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      if (text.includes('\0')) continue;
      scanned++;
      const lines = text.normalize('NFC').split('\n');
      lines.forEach((line, i) => {
        PATTERN.lastIndex = 0;
        if (PATTERN.test(line)) hits.push(`${path.relative(ROOT, file)}:${i + 1}: ${line.trim().slice(0, 100)}`);
      });
      // chuỗi tách qua nhiều dòng (chữ thứ nhất cuối dòng, chữ thứ hai đầu dòng sau)
      PATTERN.lastIndex = 0;
      const whole = text.normalize('NFC');
      for (const m of whole.matchAll(PATTERN)) {
        if (m[0].includes('\n')) {
          const line = whole.slice(0, m.index).split('\n').length;
          hits.push(`${path.relative(ROOT, file)}:${line}: chữ bị tách qua nhiều dòng`);
        }
      }
    }
  }
  assert.ok(scanned > 100, `chỉ quét được ${scanned} tệp, thư mục quét có thể sai`);
  assert.deepEqual(hits, []);
});

test('Bộ bắt chữ nhận ra các dạng viết khác nhau', () => {
  const samples = [
    'tạm tính',
    'Tạm tính',
    'TẠM TÍNH',
    'tạm-tính',
    'tạm_tính',
    'tam tinh',
    'tạm tính',
    't&#7841;m t&iacute;nh',
    't\\u1ea1m t\\u00ednh',
    "'tạm ' + 'tính'",
    'tạm`+`tính',
    'ta\u0323m ti\u0301nh'
  ];
  for (const s of samples) {
    PATTERN.lastIndex = 0;
    assert.ok(PATTERN.test(s.normalize('NFC')) || PATTERN.test(s), `phải bắt được: ${s}`);
  }
  for (const s of ['tạm ứng', 'tính lương', 'tạm thời', 'ước tính']) {
    PATTERN.lastIndex = 0;
    assert.ok(!PATTERN.test(s), `không được bắt nhầm: ${s}`);
  }
});
