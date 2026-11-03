'use strict';
// spec:gen — dựng spec/reference/*.md TỪ MÃ (không từ trí nhớ): route, module, quyền, lược đồ DB, luật, sự kiện, cấu hình.
//   node scripts/docs/gen-spec.ts            ghi lại các file
//   node scripts/docs/gen-spec.ts --check    thoát 1 nếu file trên đĩa khác bản dựng từ mã (test/unit/spec-reference.test.ts gọi chế độ này)
// Mỗi mục dẫn tới file thật (đường dẫn#ký hiệu hoặc đường dẫn:dòng — dòng do chính script tính nên luôn đúng lúc sinh).
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'spec-gen';
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'spec', 'reference');
const rel = (abs?) => path.relative(ROOT, abs).split(path.sep).join('/');
const read = (file?) => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n/g, '\n');
const walk = (dir?, filter?) =>
  fs
    .readdirSync(path.join(ROOT, dir), { withFileTypes: true })
    .flatMap(e => {
      const r = `${dir}/${e.name}`;
      return e.isDirectory() ? walk(r, filter) : filter(r) ? [r] : [];
    })
    .sort();
const esc = (s?) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const HEADER = (title?, what?) =>
  `# ${title}\n\n> Sinh tự động bởi \`scripts/docs/gen-spec.ts\` (\`npm run spec:gen\`) từ ${what}. Đừng sửa tay: \`test/unit/spec-reference.test.ts\` so sánh file này với bản dựng từ mã.\n\n`;

/* ---------- 1. route ---------- */
function controllerRoutes() {
  const files = walk('src/modules', f => f.endsWith('.controller.ts'));
  const verbs = 'Get|Post|Put|Patch|Delete';
  const found: any[] = [];
  for (const file of files) {
    const lines = read(file).split('\n');
    let prefix = '';
    lines.forEach((line, i) => {
      const c = /@Controller\(\s*'([^']*)'\s*\)/.exec(line);
      if (c) prefix = c[1].replace(/^api\/?/, '');
      const m = new RegExp(`@(${verbs})\\(\\s*(?:'([^']*)')?\\s*\\)`).exec(line);
      if (!m) return;
      const override = /route-key:\s*((?:GET|POST|PUT|PATCH|DELETE) \/\S*)/.exec(lines[i - 1] || '');
      const p = '/' + [prefix, m[2] || ''].join('/').split('/').filter(Boolean).join('/');
      const method = /async\s+(\w+)\s*\(/.exec(lines.slice(i + 1, i + 4).join('\n'));
      // chú thích /** … */ ngay trên decorator làm mô tả
      let doc = '';
      for (let j = i - 1; j >= 0 && j >= i - 4; j--) {
        const d = /^\s*\/\*\*\s*(.*?)\s*\*\/\s*$/.exec(lines[j]) || /^\s*\*\s+(.*)$/.exec(lines[j]);
        if (d) doc = d[1];
        else if (/^\s*\/\//.test(lines[j]) && !doc) continue;
        else if (!/^\s*(\*|\/\*\*)/.test(lines[j])) break;
      }
      found.push({ key: override ? override[1] : `${m[1].toUpperCase()} ${p}`, path: `${m[1].toUpperCase()} /api${p}`, file, line: i + 1, method: method ? method[1] : '?', doc });
    });
  }
  return found;
}

function routesDoc() {
  const authz = require(path.join(ROOT, 'src/platform/authz.ts'));
  const routes = controllerRoutes();
  const byKey = new Map<any, any>();
  for (const r of routes) if (!byKey.has(r.key)) byKey.set(r.key, r);
  const keys = Object.keys(authz.ROUTE_CAPS).sort((a: any, b: any) => a.split(' ')[1].localeCompare(b.split(' ')[1]) || a.localeCompare(b));
  const rows = keys.map(key => {
    const policy = authz.ROUTE_CAPS[key];
    const r = byKey.get(key);
    const who = policy.public ? 'công khai' : policy.cap ? `\`${policy.cap}\`` : 'đã đăng nhập';
    const scope = policy.periodScope ? `\`${policy.periodScope}\`${policy.periodMonth ? ` (tháng: ${esc(policy.periodMonth)})` : ''}` : '—';
    const where = r ? `[\`${r.file}:${r.line}\`](../../${r.file}#L${r.line}) \`${r.method}\`` : '**không có controller**';
    return `| \`${key}\` | ${who} | ${scope} | ${where} | ${esc(r && r.doc || '')} |`;
  });
  const orphans = [...byKey.keys()].filter(k => !Object.hasOwn(authz.ROUTE_CAPS, k));
  let out = HEADER('Bảng route /api', '`src/platform/authz.ts` (`ROUTE_CAPS`) và các decorator `@Controller/@Get/@Post/@Put` trong `src/modules/**/*.controller.ts`');
  out += `Mọi route đi qua \`ApiGuard\` (\`src/http/api.guard.ts\`): đọc phiên → tra \`ROUTE_CAPS\` (không có khoá thì 403 \`NO_ROUTE_POLICY\`) → kiểm năng lực → giới hạn tải → giới hạn tốc độ ghi → dựng ngữ cảnh nhật ký. Cột *khoá kỳ* là \`periodScope\`: loại ghi mà cổng khoá kỳ (\`ctx.guardPeriod\`) áp dụng.\n\n`;
  out += `Số route: **${keys.length}**; đường dẫn không module nào nhận trả 404 sau cổng quyền (\`src/http/not-found.controller.ts\`).\n\n`;
  out += '| Khoá chính sách | Quyền | Khoá kỳ | Controller (file:dòng, phương thức) | Mô tả (chú thích trong mã) |\n| --- | --- | --- | --- | --- |\n' + rows.join('\n') + '\n';
  if (orphans.length) out += `\n**Cảnh báo:** controller khai route không có trong ROUTE_CAPS: ${orphans.map(k => `\`${k}\``).join(', ')}\n`;
  return out;
}

/* ---------- 2. module ---------- */
function modulesDoc() {
  const routes = controllerRoutes();
  const mods = fs.readdirSync(path.join(ROOT, 'src/modules'), { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name).sort();
  let out = HEADER('Module NestJS', 'cây `src/` (import và decorator)');
  out += `Luật kiến trúc do \`test/unit/architecture.test.ts\` giữ: module nghiệp vụ chỉ import module khác qua \`index.ts\`; hạ tầng (\`src/http\`, \`src/shared\`) không phụ thuộc module; \`AppModule\` (\`src/app.module.ts\`) đăng ký mọi module, \`NotFoundModule\` đứng cuối.\n\n`;
  out += '## Hạ tầng (`src/`)\n\n| File | Việc |\n| --- | --- |\n';
  const infra = [
    ['src/bootstrap.ts', 'dựng `http.Server`: tiêu đề bảo mật, file tĩnh ngoài `/api`, chuyển `/api/*` cho Nest; mã hoá lại `%` để Express không lỗi giải mã'],
    ['src/main.ts', 'khởi động thật: tạo admin đầu tiên, hẹn giờ dọn bảng nhớ lượt chấm công, sổ phép, mở cổng, tắt êm'],
    ['src/app.init.ts', 'khởi tạo cấp ứng dụng (bộ chọn hợp đồng mặc định, đồng bộ vai trò staff)'],
    ['src/app.module.ts', 'gốc module: guard, interceptor, filter toàn cục; danh sách module'],
    ['src/env.ts', 'nạp `.env` không ghi đè biến đã đặt'],
    ['src/http/api-gate.ts', 'cổng quyền, giới hạn tải, giới hạn tốc độ ghi, ngữ cảnh nhật ký, cổng khoá kỳ'],
    ['src/http/api.guard.ts', 'guard toàn cục gọi `ApiGate`'],
    ['src/http/request-scope.interceptor.ts', 'phạm vi một yêu cầu: cảnh báo, bộ quy tắc theo tháng, báo tin sau COMMIT'],
    ['src/http/api-exception.filter.ts', 'đổi mọi lỗi thành JSON (`HttpError`, lỗi có mã của store, `Overloaded`, 500)'],
    ['src/http/api-context.ts', '`ApiContext` và decorator `@Ctx()`'],
    ['src/http/load-control.ts', 'monitor, cổng băm mật khẩu, giới hạn tốc độ ghi, bộ từ chối tải'],
    ['src/http/not-found.controller.ts', '404 cho đường dẫn không module nào nhận'],
    ['src/data/*', 'lớp truy vấn có kiểu (Kysely) trên kết nối của ứng dụng: `db-dialect.ts` (chạy qua `prepare().all/run` của SQLite/PostgreSQL), `schema.generated.ts` (kiểu bảng sinh từ migration, `npm run db:types`), repository (`SettingsRepository`)'],
    ['src/shared/reason.ts', '`reasonOf`: lý do ghi nhận tối đa `config.REASON_MAX` ký tự']
  ];
  for (const [f, what] of infra) out += `| \`${f}\` | ${what} |\n`;
  out += '\n## Module nghiệp vụ (`src/modules/*`)\n\n| Module | Route | File | Import module khác |\n| --- | --- | --- | --- |\n';
  for (const m of mods) {
    const files = walk(`src/modules/${m}`, f => f.endsWith('.ts')).map(f => path.basename(f));
    const mine = routes.filter(r => r.file.startsWith(`src/modules/${m}/`));
    const deps = new Set<any>();
    for (const f of walk(`src/modules/${m}`, f => f.endsWith('.ts')))
      for (const x of read(f).matchAll(/from\s+'\.\.\/([\w-]+)'/g)) deps.add(x[1]);
    out += `| \`${m}\` | ${mine.length ? mine.map(r => `\`${r.path}\``).join('<br>') : '—'} | ${files.map(f => `\`${f}\``).join(' ')} | ${deps.size ? [...deps].map(d => `\`${d}\``).join(' ') : '—'} |\n`;
  }
  return out;
}

/* ---------- 3. quyền ---------- */
function capsDoc() {
  const authz = require(path.join(ROOT, 'src/platform/authz.ts'));
  let out = HEADER('Năng lực và vai trò', '`src/platform/authz.ts` (`CAPS`, `ROLE_CAPS`, `ROLE_SCOPE`, `DECIDE_ITEMS`)');
  out += `Nguồn: [\`src/platform/authz.ts\`](../../src/platform/authz.ts). Quyền kiểm theo *năng lực*; vai trò chỉ là tập năng lực kèm phạm vi. Vai trò tuỳ chỉnh lưu ở \`settings\` (\`src/domain/roles/roles.ts\`).\n\n`;
  out += `## Năng lực (${authz.CAPS.length})\n\n${authz.CAPS.map(c => `\`${c}\``).join(', ')}\n\n`;
  out += `## Loại khoản duyệt (\`request.decide.<loại>\`)\n\n${authz.DECIDE_ITEMS.map(c => `\`${c}\``).join(', ')}\n\n`;
  out += '## Vai trò mặc định\n\n| Vai trò | Phạm vi | Năng lực |\n| --- | --- | --- |\n';
  for (const [role, caps] of Object.entries<any>(authz.ROLE_CAPS)) {
    const list = Array.isArray(caps) ? caps : Object.keys(caps);
    const scope = authz.ROLE_SCOPE && authz.ROLE_SCOPE[role] ? JSON.stringify(authz.ROLE_SCOPE[role]) : '—';
    out += `| \`${role}\` | ${esc(scope)} | ${list.length ? list.map(c => `\`${c}\``).join(' ') : '—'} |\n`;
  }
  return out;
}

/* ---------- 4. lược đồ DB ---------- */
function splitTop(raw?) {
  const body = raw.replace(/--.*$/gm, ''); // bỏ chú thích TRƯỚC khi tách (chú thích có thể chứa dấu phẩy)
  const parts: any[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of body) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts.map(p => p.replace(/--.*$/gm, '').replace(/\s+/g, ' ').trim()).filter(Boolean);
}
function databaseDoc() {
  const file = 'migrations/postgres/0001_baseline.sql';
  const text = read(file);
  let out = HEADER('Lược đồ cơ sở dữ liệu', '`migrations/postgres/*.sql`');
  const migs = walk('migrations/postgres', f => f.endsWith('.sql'));
  out += `Migration có đánh số, chạy theo thứ tự và ghi vào \`schema_migrations\` (\`src/data/postgres-database.ts\`): ${migs.map(m => `\`${path.basename(m)}\``).join(', ')}.\n\n`;
  const tables: any[] = [];
  for (const m of text.matchAll(/CREATE TABLE (\w+)\s*\(([\s\S]*?)\n?\)\s*;/g)) {
    const line = text.slice(0, m.index).split('\n').length;
    tables.push({ name: m[1], parts: splitTop(m[2]), line });
  }
  out += `Số bảng: **${tables.length}**.\n\n`;
  for (const t of tables.sort((a: any, b: any) => a.name.localeCompare(b.name))) {
    out += `## \`${t.name}\`\n\n[\`${file}:${t.line}\`](../../${file}#L${t.line})\n\n| Cột / ràng buộc | Định nghĩa |\n| --- | --- |\n`;
    for (const p of t.parts) {
      const m = /^(PRIMARY KEY|UNIQUE|FOREIGN KEY|CHECK|CONSTRAINT)\b/i.test(p) ? ['', p.split(' ')[0], p] : /^(\w+)\s+(.*)$/.exec(p);
      out += m ? `| \`${m[1] || m[2]}\` | ${esc(m[1] ? m[2] : m[0])} |\n` : `| | ${esc(p)} |\n`;
    }
    out += '\n';
  }
  const triggers = [...text.matchAll(/CREATE TRIGGER (\w+)\s+(BEFORE|AFTER)\s+(\w+(?: OR \w+)*)\s+ON\s+(\w+)/g)];
  out += `## Trigger (${triggers.length})\n\n| Trigger | Khi | Bảng |\n| --- | --- | --- |\n`;
  for (const t of triggers.sort((a: any, b: any) => a[1].localeCompare(b[1]))) out += `| \`${t[1]}\` | ${t[2]} ${t[3]} | \`${t[4]}\` |\n`;
  const indexes = [...text.matchAll(/CREATE (UNIQUE )?INDEX (?:IF NOT EXISTS )?(\w+)\s+ON\s+(\w+)\s*\(([^)]*)\)/g)];
  out += `\n## Chỉ mục (${indexes.length})\n\n| Chỉ mục | Bảng | Cột |\n| --- | --- | --- |\n`;
  for (const i of indexes.sort((a: any, b: any) => a[2].localeCompare(b[2]))) out += `| \`${i[2]}\`${i[1] ? ' (duy nhất)' : ''} | \`${i[3]}\` | ${esc(i[4])} |\n`;
  return out;
}

/* ---------- 5. luật nghiệp vụ ---------- */
function rulesDoc() {
  const files = walk('src/domain', f => /\/rules\/[^/]+\.js$/.test(f) || /-rule\.js$/.test(f) || /\/rules\.js$/.test(f));
  let out = HEADER('Luật nghiệp vụ dạng lớp', '`src/domain/**/rules/*.js` và các file `*-rule.js` (lớp kế thừa `Rule`)');
  out += `Mỗi luật là một lớp kế thừa \`Rule\` (\`src/domain/shared/rule.ts\`), trả về \`Violation\` (\`block\` = từ chối, \`warn\` = cảnh báo kèm hệ quả); \`RuleSet\` chạy lần lượt. Con số của luật nằm ở bộ tham số (một nguồn, ví dụ \`OtLimits\` trong \`src/domain/overtime/ot-limits.ts\`), không nằm trong luật.\n\n`;
  for (const file of files) {
    const text = read(file);
    const classes = [...text.matchAll(/^class (\w+) extends (\w+)/gm)];
    if (!classes.length) continue;
    out += `## \`${file}\`\n\n| Lớp | Mã (code) | Mô tả (chú thích trên lớp) |\n| --- | --- | --- |\n`;
    for (const c of classes) {
      const line = text.slice(0, c.index).split('\n').length;
      const before = text.slice(0, c.index).split('\n').slice(-4);
      const doc = before.filter(l => l.startsWith('//')).map(l => l.replace(/^\/\/\s?/, '')).join(' ');
      const nextClass = text.indexOf('\nclass ', c.index + 5);
      const body = text.slice(c.index, nextClass < 0 ? text.length : nextClass);
      const codes = [...new Set<any>([...body.matchAll(/'([A-Z][A-Z0-9_]{4,})'/g)].map(m => m[1]))];
      const topCodes = codes.length ? codes : [...new Set<any>([...text.matchAll(/(?:const CODE\w* = |CODE: )'([A-Z][A-Z0-9_]{4,})'/g)].map(m => m[1]))];
      out += `| [\`${c[1]}\`](../../${file}#L${line}) | ${topCodes.map(x => `\`${x}\``).join(' ') || '—'} | ${esc(doc)} |\n`;
    }
    out += '\n';
  }
  return out;
}

/* ---------- 6. sự kiện thời gian thực ---------- */
function eventsDoc() {
  const events = require(path.join(ROOT, 'src/platform/events.ts'));
  let out = HEADER('Sự kiện thời gian thực (SSE)', '`src/platform/events.ts` (`EVENTS`, `SYSTEM_FRAMES`, `emit`)');
  out += `Luồng \`GET /api/events\` (module \`system\`) chỉ gợi ý nạp lại, không mang dữ liệu. Phát SAU KHI giao dịch đã COMMIT.\n\n`;
  out += `## Sự kiện (${Object.keys(events.EVENTS).length})\n\n| Khoá | Tên sự kiện |\n| --- | --- |\n`;
  for (const [k, v] of Object.entries<any>(events.EVENTS)) out += `| \`${k}\` | \`${typeof v === 'string' ? v : JSON.stringify(v)}\` |\n`;
  out += `\n## Khung hệ thống\n\n${Object.keys(events.SYSTEM_FRAMES || {}).map(k => `\`${k}\``).join(', ') || '—'}\n\n## Hàm phát (\`events.emit\`)\n\n${Object.keys(events.emit).sort().map(k => `\`${k}\``).join(', ')}\n`;
  return out;
}

/* ---------- 7. cấu hình & biến môi trường ---------- */
function configDoc() {
  const config = require(path.join(ROOT, 'src/platform/config.ts'));
  let out = HEADER('Cấu hình kỹ thuật và biến môi trường', '`src/platform/config.ts` và các chỗ đọc `process.env` trong `src/`');
  out += `## Hằng số có tên (\`src/platform/config.ts\`, ${Object.keys(config).length})\n\n| Tên | Giá trị |\n| --- | --- |\n`;
  for (const k of Object.keys(config).sort()) out += `| \`${k}\` | \`${esc(JSON.stringify(config[k]))}\` |\n`;
  const sources = [...walk('src', f => f.endsWith('.ts')), 'src/server.ts'];
  const env = new Map<any, any>();
  for (const f of sources)
    read(f).split('\n').forEach((l, i) => {
      for (const m of l.matchAll(/process\.env\.([A-Z][A-Z0-9_]+)/g)) {
        if (!env.has(m[1])) env.set(m[1], []);
        env.get(m[1]).push(`${f}:${i + 1}`);
      }
    });
  out += `\n## Biến môi trường (${env.size})\n\n| Biến | Đọc ở |\n| --- | --- |\n`;
  for (const k of [...env.keys()].sort()) out += `| \`${k}\` | ${env.get(k).slice(0, 4).map(x => `\`${x}\``).join(' ')}${env.get(k).length > 4 ? ` (+${env.get(k).length - 4})` : ''} |\n`;
  return out;
}

/* ---------- 8. tham số lương ---------- */
function paramsDoc() {
  const { execFileSync } = require('node:child_process');
  const body = execFileSync(process.execPath, ['--no-warnings=ExperimentalWarning', path.join(ROOT, 'scripts/params/doc.ts')], { encoding: 'utf8', env: { ...process.env, DB_PATH: undefined, PG_TEST_URL: undefined } });
  // Khoá đã bỏ (lớp "bỏ") không còn là tham số nên không liệt kê (test/unit/no-month-rules.test.ts cấm tên các công tắc theo tháng cũ trong spec)
  const live = body
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter(line => !/^\| `[^`]+` \|.*\| bỏ \| fixed \|/.test(line))
    .join('\n');
  return HEADER('Danh mục tham số lương', '`src/params/registry.data.json` qua `scripts/params/doc.ts` (không kể các khoá lớp "bỏ")') + live;
}

const { webRoutesDoc } = require('./web-routes');

const FILES = {
  'api-routes.md': routesDoc,
  'modules.md': modulesDoc,
  'capabilities.md': capsDoc,
  'database.md': databaseDoc,
  'rules.md': rulesDoc,
  'events.md': eventsDoc,
  'config.md': configDoc,
  'params.md': paramsDoc,
  'web-routes.md': () => webRoutesDoc({ read, walk, header: HEADER, esc })
};

function build() {
  const out: Record<string, any> = {};
  for (const [name, fn] of Object.entries<any>(FILES)) out[name] = fn().replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').replace(/\n*$/, '\n');
  return out;
}

if (require.main === module) {
  const built = build();
  if (process.argv.includes('--check')) {
    const stale = Object.entries<any>(built).filter(([name, text]: any) => !fs.existsSync(path.join(OUT, name)) || fs.readFileSync(path.join(OUT, name), 'utf8').replace(/\r\n/g, '\n') !== text).map(([name]: any) => name);
    if (stale.length) {
      console.error('spec/reference lệch so với mã: ' + stale.join(', ') + '. Chạy: npm run spec:gen');
      process.exit(1);
    }
    console.log('spec/reference khớp mã.');
    process.exit(0);
  }
  fs.mkdirSync(OUT, { recursive: true });
  for (const [name, text] of Object.entries<any>(built)) fs.writeFileSync(path.join(OUT, name), text);
  console.log(`Đã ghi ${Object.keys(built).length} file vào spec/reference/`);
}
module.exports = { build, controllerRoutes };
