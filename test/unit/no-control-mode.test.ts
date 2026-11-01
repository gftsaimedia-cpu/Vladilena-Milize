'use strict';
// Hệ thống chỉ cảnh báo: không còn khái niệm chế độ kiểm soát (warn / block) trong mã nguồn.
// Dò văn bản của lib/, server.js, public/ và scripts/ (không dò web/): không có tên hàm, khoá cài đặt, route hay biến nào của chế độ.
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const assert = require('node:assert/strict');

const ROOT = path.join(__dirname, '../..');
const TEXT = /\.(js|cjs|mjs|json|html|css|md)$/;
const FORBIDDEN = [
  { name: 'controlMode', re: /\bcontrolMode\b/ },
  { name: 'control_mode', re: /control_mode/ },
  { name: 'control-mode', re: /control-mode/ },
  { name: 'setControlMode', re: /\bsetControlMode\b/ },
  { name: 'blockMode', re: /\bblockMode\b/ },
  { name: 'forgetMode', re: /\bforgetMode\b/ },
  { name: 'enforce(', re: /\benforce\(/ },
  { name: 'warnMode', re: /\bwarnMode\b/ },
  { name: 'chế độ chặn/cảnh báo', re: /chế độ (chặn|block|warn|'block'|chỉ cảnh báo|cảnh báo|kiểm soát)|mọi chế độ/i }
];

function files(entry?, out: any[] = []) {
  const full = path.join(ROOT, entry);
  if (!fs.existsSync(full)) return out;
  if (fs.statSync(full).isFile()) return [...out, full];
  for (const item of fs.readdirSync(full, { withFileTypes: true })) {
    if (item.name === 'node_modules') continue;
    const child = path.join(entry, item.name);
    if (item.isDirectory()) files(child, out);
    else if (TEXT.test(item.name)) out.push(path.join(ROOT, child));
  }
  return out;
}

test('lib, server.js, public và scripts không còn tên controlMode, control_mode, control-mode, blockMode, enforce()', () => {
  const hits: any[] = [];
  for (const file of ['src', 'scripts'].flatMap(entry => files(entry))) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, index) => {
      for (const { name, re } of FORBIDDEN)
        if (re.test(line)) hits.push(`${path.relative(ROOT, file).replaceAll('\\', '/')}:${index + 1} ${name}`);
    });
  }
  assert.deepEqual(hits, [], `còn dấu vết chế độ kiểm soát:\n${hits.join('\n')}`);
});

test('test/ không còn trợ giúp đặt chế độ kiểm soát', () => {
  assert.equal(fs.existsSync(path.join(ROOT, 'test/helpers/control-mode.js')), false);
  const hits = files('test')
    .filter(file => file !== __filename)
    .filter(file => /setControlMode|helpers\/control-mode/.test(fs.readFileSync(file, 'utf8')))
    .map(file => path.relative(ROOT, file).replaceAll('\\', '/'));
  assert.deepEqual(hits, []);
});
