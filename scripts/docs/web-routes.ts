'use strict';
// Bảng route của giao diện Vue, dựng từ web/src/router (dùng bởi scripts/docs/gen-spec.ts).

/**
 * @param {{ read: (file: string) => string, walk: (dir: string, filter: (f: string) => boolean) => string[], header: (title: string, what: string) => string, esc: (s: string) => string }} tools
 */
function webRoutesDoc({ read, walk, header, esc }: any) {
  const files = ['web/src/router/index.ts', ...walk('web/src/router/routes', f => f.endsWith('.ts'))];
  const rows: any[] = [];
  for (const file of files) {
    const text = read(file);
    const lines = text.split('\n');
    const consts = new Map<any, any>([...text.matchAll(/const (\w+) = \(\) => import\('([^']+)'\)/g)].map(m => [m[1], m[2]]));
    const starts: any[] = [];
    lines.forEach((line, i) => {
      const m = /^\s*(?:\{\s*)?path:\s*'([^']+)'/.exec(line);
      if (m) starts.push({ path: m[1], line: i });
    });
    starts.forEach((start, index) => {
      const end = index + 1 < starts.length ? starts[index + 1].line : lines.length;
      const block = lines.slice(start.line, end).join('\n');
      const direct = /component:\s*\(\)\s*=>\s*import\('([^']+)'\)/.exec(block);
      const named = /component:\s*(\w+)\s*[,}\n]/.exec(block);
      const redirect = /redirect:\s*('[^']*'|\(\)\s*=>[^,\n}]*)/.exec(block);
      const component = direct ? direct[1] : named && consts.get(named[1]);
      let target = '—';
      if (component) {
        const real = component.replace('@/', 'web/src/');
        target = `[\`${real}\`](../../${real})`;
      } else if (redirect) target = `chuyển hướng ${esc(redirect[1].replace(/\s+/g, ' '))}`;
      const layout = /layout:\s*'(\w+)'/.exec(block);
      const title = /title:\s*'([^']+)'/.exec(block);
      rows.push(
        `| \`${start.path}\` | ${target} | ${layout ? `\`${layout[1]}\`` : '—'} | ${title ? esc(title[1]) : '—'} | [\`${file}:${start.line + 1}\`](../../${file}#L${start.line + 1}) |`
      );
    });
  }
  let out = header('Route của giao diện Vue', '`web/src/router/index.ts` và `web/src/router/routes/*.ts`');
  out +=
    'Giao diện duy nhất là ứng dụng Vue 3 ở `web/` (máy chủ phục vụ `web/dist`; mọi đường dẫn không có đuôi file trả `index.html`, router Vue xử lý tiếp). Cột *khung* là `meta.layout` (`admin`, `phone`, `staffDesktop`, `blank`).\n\n';
  out += `Số route: **${rows.length}**.\n\n`;
  out += '| Đường dẫn | Màn / chuyển hướng | Khung | Tiêu đề | Khai báo |\n| --- | --- | --- | --- | --- |\n';
  out += rows.join('\n') + '\n';
  return out;
}

module.exports = { webRoutesDoc };
