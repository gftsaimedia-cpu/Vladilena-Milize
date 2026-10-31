'use strict';
// Một chỗ biết "mã máy chủ nằm ở đâu".
// Các test đọc mã máy chủ như văn bản (không chạy nó) gọi serverSource() thay vì readFileSync('server.js'), nên
// việc chia server.js ra lib/routes, lib/domain... không làm chúng hỏng hay xanh giả.
//   serverFiles()          đường dẫn tương đối (dấu /) của mọi file mã máy chủ ĐANG CÓ, server.js đứng đầu
//   serverSource()         văn bản các file đó nối nhau (mỗi file cách nhau một dòng trống)
//   serverSourceOf(rel)    văn bản của một file trong số đó (ném lỗi nếu không phải mã máy chủ hoặc không có)
// Bộ lọc: server.js + lib/http.js + lib/request-rules.js + lib/announce.js + lib/routes/** + lib/domain/**.
// File nào trong số đó chưa có thì bỏ qua, nên trước và sau khi chia server.js kết quả của
// serverSource() chứa cùng các đoạn mã.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '../..');
const SINGLE = ['server.js', 'lib/http.js', 'lib/request-rules.js', 'lib/announce.js'];
const TREES = ['lib/routes', 'lib/domain', 'src']; // src: module NestJS (.ts)

function walk(dir) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  const out = [];
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...walk(rel));
    else if (entry.isFile() && (rel.endsWith('.js') || rel.endsWith('.ts'))) out.push(rel);
  }
  return out;
}

function serverFiles() {
  const files = SINGLE.filter(rel => fs.existsSync(path.join(ROOT, rel)));
  for (const tree of TREES) files.push(...walk(tree).sort());
  return files;
}

const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

function serverSourceOf(rel) {
  if (!serverFiles().includes(rel))
    throw new Error(`${rel} không thuộc mã máy chủ (xem test/helpers/server-source.js)`);
  return read(rel);
}

const serverSource = () => serverFiles().map(read).join('\n\n');

module.exports = { serverFiles, serverSource, serverSourceOf, ROOT };

/* ---------- khoá route trong mã máy chủ, cho các test quét route ----------
 * Dạng nhánh: `if (route === 'GET /x')`. Dạng bảng: mục `'GET /x': async ({ … }) => {` trong lib/routes/*.js.
 * Cả hai cú pháp cho cùng một khoá 'METHOD /đường dẫn', nên test quét route không phải đổi cách nhận dạng ở mỗi bước chia.
 * Khoá có tham số ('PUT /staff/:u', 'PUT /pay-entries/:id/decide') chỉ hiện ở dạng bảng; với dạng nhánh test tự dò bằng seg[…].
 */
const ROUTE_CONDITION = /route === '(GET|POST|PUT|DELETE|PATCH) (\/[^']*)'/g;
const TABLE_ENTRY = /^\s*'(GET|POST|PUT|DELETE|PATCH) (\/[^']*)'\s*:/gm;
const keysOnLine = line => [
  ...[...line.matchAll(ROUTE_CONDITION)].map(m => `${m[1]} ${m[2]}`),
  ...[...line.matchAll(TABLE_ENTRY)].map(m => `${m[1]} ${m[2]}`)
];
// Dạng Nest (src/**/*.ts): @Controller('api/tiền-tố') rồi @Get|Post|Put|Patch|Delete('đường-dẫn') → khoá 'METHOD /tiền-tố/đường-dẫn'.
const CONTROLLER = /@Controller\(\s*'([^']*)'\s*\)/;
const NEST_ROUTE = /@(Get|Post|Put|Patch|Delete)\(\s*(?:'([^']*)')?\s*\)/;
const joinPath = (...parts) =>
  '/' +
  parts
    .join('/')
    .split('/')
    .filter(Boolean)
    .join('/');
// chỉ số dòng → khoá, theo @Controller gần nhất phía trên
function nestKeysOf(lines) {
  const keys = new Map();
  let prefix = '';
  lines.forEach((line, index) => {
    const controller = CONTROLLER.exec(line);
    if (controller) prefix = controller[1].replace(/^api\/?/, '');
    const route = NEST_ROUTE.exec(line);
    if (route) keys.set(index, `${route[1].toUpperCase()} ${joinPath(prefix, route[2] || '')}`);
  });
  return keys;
}

// Mọi khoá route khai báo trong mã máy chủ
function routeKeysInSource(source = serverSource()) {
  const lines = source.split('\n');
  return new Set([...lines.flatMap(keysOnLine), ...nestKeysOf(lines).values()]);
}
// Khoá route mà handler gọi needAdmin() trong 4 dòng đầu
function adminRouteKeysInSource(source = serverSource()) {
  const lines = source.split('\n');
  const found = new Set();
  lines.forEach((line, index) => {
    const near = lines.slice(index, index + 4).join('\n');
    if (/needAdmin\(\)/.test(near)) for (const key of keysOnLine(line)) found.add(key);
  });
  for (const [index, key] of nestKeysOf(lines))
    if (/needAdmin\(\)/.test(lines.slice(index, index + 4).join('\n'))) found.add(key);
  return found;
}

module.exports.routeKeysInSource = routeKeysInSource;
module.exports.adminRouteKeysInSource = adminRouteKeysInSource;
