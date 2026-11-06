// Dựng một board design (runtime mini cho *.dc.html, kể cả board nhúng dc-import) và chụp cạnh trang FE mock.
// Dùng: node scripts/design-compare/shoot.mjs <thư-mục-ra> '[{"board":"Payroll","w":1440,"h":1240,"route":"/admin/bang-luong?thang=2026-10","session":"admin"}]'
// FE mock phải đang chạy: (cd web && npx vite --mode mock --port 5180). Cần `LD_LIBRARY_PATH` nếu thiếu thư viện Chromium.
// Ra: <thư-mục-ra>/<board>.board.png (board) và <board>.fe.png (FE). Font board là font dự phòng nên bỏ qua độ rộng chữ.
import { chromium } from '../../web/node_modules/@playwright/test/index.mjs';
import fs from 'node:fs';
import { page as dcpage } from './dcrender.mjs';

const [out, json] = process.argv.slice(2);
const base = process.env.FE_URL || 'http://127.0.0.1:5180';
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch();
for (const j of JSON.parse(json)) {
  const p = await b.newPage({ viewport: { width: j.w, height: j.h } });
  await p.setContent(dcpage(j.board, j.props || {}), { waitUntil: 'load' });
  await p.screenshot({ path: `${out}/${j.board}.board.png`, fullPage: true });
  await p.close();
  if (!j.route) continue;
  const q = await b.newPage({ viewport: { width: j.w, height: j.h } });
  if (j.session) await q.addInitScript(s => localStorage.setItem('aicb.mock.session', s), j.session);
  await q.goto(base + j.route, { waitUntil: 'networkidle' });
  await q.waitForTimeout(500);
  await q.screenshot({ path: `${out}/${j.board}.fe.png`, fullPage: true });
  await q.close();
}
await b.close();
