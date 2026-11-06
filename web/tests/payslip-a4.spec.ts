// Bản in phiếu lương A4 (board P1, P2 của Đợt 8) trên dữ liệu giả: không page.route, không gọi /api.
// Số tiền và ngày công là tháng mẫu chung; tên, loại · bậc, hợp đồng và trạng thái nhân sự lấy theo phiếu của mã trên
// đường dẫn. Phiếu dùng ở đây là phiếu Nháp (GFT-0123); bản in không ghi trạng thái phiếu (D11, 06/11).
import { expect, test, type Page } from '@playwright/test';

const SLIP = '/in/phieu-luong/2026-10/GFT-0123';
const sheetPage = (page: Page, n: 1 | 2) => page.getByRole('region', { name: `Trang ${n}/2` });

// Bộ ghi request /api, lỗi chạy và console.error của trang hiện tại; test đầu khẳng định nó rỗng.
let calls: string[] = [];
test.beforeEach(async ({ page }) => {
  calls = [];
  page.on('request', req => {
    const url = new URL(req.url());
    if (url.pathname.startsWith('/api')) calls.push(`${req.method()} ${url.pathname}`);
  });
  page.on('pageerror', err => calls.push(`pageerror: ${err.message}`));
  page.on('console', msg => {
    if (msg.type() === 'error') calls.push(`console.error: ${msg.text()}`);
  });
});

test('the A4 slip comes from mock data: two sheets, no /api call', async ({ page }) => {
  await page.goto(SLIP);
  await expect(sheetPage(page, 1)).toBeVisible();
  await expect(sheetPage(page, 2)).toBeVisible();
  await expect(page.locator('.pl-a4')).toHaveCount(2);
  expect(calls).toEqual([]);
});

test('page 1 header follows P1 for the slip on the URL', async ({ page }) => {
  await page.goto(SLIP);
  const p1 = sheetPage(page, 1);
  await expect(p1.getByRole('img', { name: 'GFT' })).toBeVisible();
  await expect(p1.getByRole('heading', { level: 1 })).toHaveText('Phiếu lương tháng 10/2026');
  await expect(p1.locator('.sub')).toHaveText('Từ 01/10 đến 31/10/2026 · công chuẩn theo quy chế: 26 ngày');
  await expect(p1.locator('header p')).toHaveCount(1);
  await expect(p1.locator('.who > div')).toHaveText([
    /Họ tên\s*Võ Đức Thịnh/, /Loại · bậc\s*NV · Bậc 3/, /Trạng thái nhân sự\s*Chính thức/, /Kỳ lương\s*Tháng 10\/2026/
  ]);
  await expect(p1.getByRole('heading', { level: 2 })).toHaveText('Chấm công tháng 10/2026');
  await expect(p1.locator('.sh .lb')).toHaveText('Lương ngày 230.769 · số tiền tính bằng đồng');
});

test('page 2 running head follows P2', async ({ page }) => {
  await page.goto(SLIP);
  const p2 = sheetPage(page, 2);
  await expect(p2.locator('.rh b')).toHaveText('Phiếu lương tháng 10/2026 · Võ Đức Thịnh');
  await expect(p2.locator('.rh .lb')).toHaveText('NV · Bậc 3 · HĐLĐ từ 3 tháng · từ 01/10 đến 31/10/2026');
  await expect(p2.getByRole('heading', { level: 2 })).toHaveText('Tổng hợp lương');
  await expect(p2.locator('.sh .lb')).toHaveText('Số tiền tính bằng đồng');
});

test('each sheet ends with the slogan and its page number', async ({ page }) => {
  await page.goto(SLIP);
  for (const n of [1, 2] as const) {
    const ft = sheetPage(page, n).locator('footer.ft');
    await expect(ft).toContainText(`Trang ${n}/2`);
    await expect(ft.getByRole('img', { name: 'Trao trọn niềm tin, gửi trọn giải pháp.' })).toBeVisible();
  }
});

test('another month or an unknown slip shows the load error', async ({ page }) => {
  for (const url of ['/in/phieu-luong/2026-11/GFT-0123', '/in/phieu-luong/2026-10/demo_a_broken']) {
    await page.goto(url);
    await expect(page.getByText('Không tải được phiếu lương.')).toBeVisible();
    await expect(page.locator('.pl-a4')).toHaveCount(0);
  }
});

const att = (page: Page) => sheetPage(page, 1).getByRole('table', { name: 'Chấm công tháng 10/2026' });
const dayRow = (page: Page, dm: string) =>
  att(page).locator('tbody tr').filter({ has: page.locator('td:first-child', { hasText: dm }) });

test('page 1 prints one row per day that needs one', async ({ page }) => {
  await page.goto(SLIP);
  await expect(att(page).locator('tbody tr')).toHaveCount(29);
  await expect(dayRow(page, '04/10')).toHaveCount(0);
  await expect(dayRow(page, '18/10')).toHaveCount(0);
  await expect(dayRow(page, '11/10').getByRole('cell').nth(1)).toHaveText('Chủ nhật');
  await expect(dayRow(page, '25/10').getByRole('cell').nth(1)).toHaveText('Chủ nhật');
  await expect(att(page).locator('tbody tr.off')).toHaveCount(8);
  for (const [mark, n] of [['work', 21], ['paid', 4], ['unpaid', 2], ['absent', 1], ['pending', 1]] as const)
    await expect(att(page).locator(`tbody .dot.m-${mark}`)).toHaveCount(n);
});

test('page 1 keeps OT, make-up and notes in their own columns', async ({ page }) => {
  await page.goto(SLIP);
  await expect(att(page).locator('thead th')).toHaveText([
    'Ngày', 'Loại ngày', 'Vào – ra', 'Giờ', 'OT', 'Làm bù', 'Ghi chú', 'Cộng / trừ', 'Thành tiền'
  ]);
  const cells = (dm: string) => dayRow(page, dm).getByRole('cell');
  await expect(cells('09/10')).toHaveText([/T6\s*09\/10/, 'Normal', '08:00–22:00', '8', '4', '', '', '+173.077', '403.846']);
  await expect(cells('22/10')).toHaveText([/T5\s*22\/10/, 'Normal', '08:00–22:00', '8', '', '4', '', '', '230.769']);
  await expect(cells('26/10')).toHaveText([/T2\s*26\/10/, 'Normal', '08:40–17:00', '7,33', '', '', 'Muộn 40 phút', '−14.423', '216.346']);
  await expect(cells('28/10')).toHaveText([/T4\s*28\/10/, 'Chờ giải trình', '08:20–17:00', '7,67', '', '', 'Muộn 20 phút', '', '0']);
  await expect(cells('05/10')).toHaveText([/T2\s*05\/10/, 'Phép năm', '', '', '', '', '', '', '230.769']);
  await expect(cells('11/10')).toHaveText([/CN\s*11\/10/, 'Chủ nhật', '08:00–12:00', '', '4', '', '', '+230.769', '230.769']);
  await expect(cells('20/10')).toHaveText([/T3\s*20\/10/, 'Nghỉ có làm bù', '', '', '', '', 'Bù 22/10, 25/10', '', '230.769']);
  const heights = await att(page).locator('tbody tr').evaluateAll(rows => rows.map(r => r.getBoundingClientRect().height));
  expect(Math.max(...heights)).toBeLessThanOrEqual(22);
});

test('day marks and off rows use the GFT colours', async ({ page }) => {
  await page.goto(SLIP);
  const look = (sel: string) =>
    sheetPage(page, 1).locator(sel).first().evaluate(e => {
      const c = getComputedStyle(e);
      return [c.backgroundColor, c.borderTopWidth, c.borderTopColor];
    });
  expect((await look('.lg .dot.m-work'))[0]).toBe('rgb(28, 28, 28)');
  expect((await look('.lg .dot.m-paid'))[0]).toBe('rgb(47, 90, 168)');
  expect((await look('.lg .dot.m-absent'))[0]).toBe('rgb(180, 63, 63)');
  expect(await look('.lg .dot.m-unpaid')).toEqual(['rgba(0, 0, 0, 0)', '2px', 'rgb(47, 90, 168)']);
  expect(await look('.lg .dot.m-pending')).toEqual(['rgba(0, 0, 0, 0)', '2px', 'rgb(235, 151, 61)']);
  expect((await look('tbody tr.off td'))[0]).toBe('rgb(245, 245, 245)');
});

test('page 1 ends with the summary strip and the legend, and has no money total', async ({ page }) => {
  await page.goto(SLIP);
  const p1 = sheetPage(page, 1);
  await expect(p1.locator('.sts > div')).toHaveText([
    /Ngày công\s*19 ngày/, /Ca Flex · Night\s*3 · 3 ca/, /Nghỉ có lương\s*3 ngày/, /iSAT\s*1 ngày/,
    /Không lương, BHXH\s*2 ngày/, /Vắng\s*1 ngày/, /Chờ giải trình\s*1 ngày/, /OT\s*10 giờ/,
    /Làm bù\s*8 giờ/, /Trừ giờ đi muộn\s*0,5 giờ/
  ]);
  await expect(p1.locator('.lg .keys > span')).toHaveText(['Đi làm', 'Nghỉ có lương', 'Nghỉ không lương', 'Vắng', 'Chờ giải trình']);
  for (const m of ['work', 'paid', 'unpaid', 'absent', 'pending']) await expect(p1.locator(`.lg .dot.m-${m}`)).toHaveCount(1);
  await expect(p1.locator('.lg p')).toHaveText(
    'Giờ, OT, Làm bù tính bằng giờ. OT ngày thường ×1,5, thứ 7 và Chủ nhật ×2, ngày lễ ×3. Làm bù là giờ làm để bù cho ngày đã nghỉ, không phải OT.'
  );
  await expect(p1).not.toContainText('Tổng thu nhập');
  await expect(p1).not.toContainText('Thực nhận');
});

test('prints as two A4 sheets that do not overflow, with no text under 12px', async ({ page }) => {
  await page.goto(SLIP);
  await expect(sheetPage(page, 1).locator('.lg')).toBeVisible();
  await page.emulateMedia({ media: 'print' });
  const sheets = page.locator('.pl-a4');
  await expect(sheets).toHaveCount(2);
  expect(await sheets.evaluateAll(ss => ss.map(s => s.scrollHeight <= s.clientHeight))).toEqual([true, true]);
  const small = await sheets.evaluateAll(ss =>
    ss.flatMap(s =>
      [...s.querySelectorAll('*')]
        .filter(e => [...e.childNodes].some(n => n.nodeType === 3 && (n.textContent || '').trim()))
        .filter(e => parseFloat(getComputedStyle(e).fontSize) < 12)
        .map(e => (e.textContent || '').trim())
    )
  );
  expect(small).toEqual([]);
  const gap = await sheetPage(page, 1).evaluate(
    s => s.querySelector('footer.ft')!.getBoundingClientRect().top - s.querySelector('.lg')!.getBoundingClientRect().bottom
  );
  expect(gap).toBeGreaterThanOrEqual(42);
});

const pay = (page: Page) => sheetPage(page, 2).getByRole('table', { name: 'Tổng hợp lương' });
const line = (page: Page, label: string) =>
  pay(page).locator('tr.ln').filter({ has: page.locator('td:first-child', { hasText: label }) });
const money = (t: string) => Number(t.trim().replace('−', '-').replace(/\./g, ''));

test('page 2 lists the pay lines of P2 in groups', async ({ page }) => {
  await page.goto(SLIP);
  await expect(pay(page).locator('thead th')).toHaveText(['Khoản', 'Số lượng', 'Theo quy chế', 'Thực tế']);
  await expect(pay(page).locator('tr.grp')).toHaveText([
    'Ngày công và lương cơ bản', 'Nghỉ phép và ngày lễ', 'Làm thêm và làm bù',
    'Phụ cấp', 'Lương KPI', 'Đi muộn, về sớm, ra ngoài'
  ]);
  const cells = (label: string) => line(page, label).getByRole('cell');
  await expect(cells('Lương cơ bản')).toHaveText(['Lương cơ bản', '19/26 ngày', '6.000.000', '4.384.615']);
  await expect(line(page, 'Lương cơ bản')).toHaveClass(/\bbb\b/);
  await expect(cells('Chờ giải trình')).toHaveText(['Chờ giải trình · 28/10, tạm tính 0 đ tới khi duyệt', '1 ngày', '', '0']);
  await expect(line(page, 'Chờ giải trình').locator('.dt')).toHaveCount(1);
  await expect(cells('Không tính lương')).toHaveText(['Không tính lương · vắng, không lương, chế độ BHXH', '3 ngày', '', '0']);
  await expect(cells('Nghỉ có lương')).toHaveText(['Nghỉ có lương · phép năm, việc riêng', '2 ngày', '', '461.538']);
  await expect(cells('Chuyên cần')).toHaveText(['Chuyên cần 25% · nghỉ từ 3 ngày nên không hưởng', '', '1.500.000', '0']);
  await expect(cells('Đi lại')).toHaveText(['Đi lại 15%', '19 ngày', '900.000', '657.692']);
  await expect(cells('Tổng phụ cấp')).toHaveText(['Tổng phụ cấp', '', '', '1.185.577']);
  await expect(pay(page).locator('tr.kpi > td > div')).toHaveText([
    /Base Wework 40%\s*85%/, /Người dùng 24%\s*90%/, /Đồng nghiệp 18%\s*80%/, /Quản lý trực tiếp 12%\s*85%/, /Tự đánh giá 6%\s*90%/
  ]);
  await expect(cells('Lương KPI')).toHaveText(['Lương KPI · theo tổng điểm', '85,6%', '6.000.000', '5.136.000']);
  await expect(cells('Đi muộn 26/10')).toHaveText(['Đi muộn 26/10 · muộn 40 phút, tính 30 phút', '0,5 giờ', '', '−14.423']);
});

test('page 2 splits OT into three rows and pays make-up hours as money', async ({ page }) => {
  await page.goto(SLIP);
  const cells = (label: string) => line(page, label).getByRole('cell');
  await expect(cells('OT ngày thường')).toHaveText(['OT ngày thường (×1,5)', '4 giờ', '', '173.077']);
  await expect(cells('OT ngày cuối tuần')).toHaveText(['OT ngày cuối tuần (×2)', '6 giờ', '', '346.154']);
  await expect(cells('OT ngày lễ')).toHaveText(['OT ngày lễ (×3)', '0 giờ', '', '0']);
  await expect(cells('Làm bù cho ngày nghỉ 20/10')).toHaveText(['Làm bù cho ngày nghỉ 20/10', '8 giờ', '', '230.769']);
});

test('the rule column holds only money and the actual column always money', async ({ page }) => {
  await page.goto(SLIP);
  await expect(pay(page).locator('tr.ln')).toHaveCount(26);
  const col = async (i: number) => (await pay(page).locator(`tr.ln > td:nth-child(${i})`).allTextContents()).map(t => t.trim());
  for (const t of await col(3)) expect(t).toMatch(/^(\d{1,3}(\.\d{3})*)?$/);
  const acts = await col(4);
  for (const t of acts) expect(t).toMatch(/^(−?\d{1,3}(\.\d{3})*|BE tính)$/);
  expect(acts.filter(t => t === 'BE tính')).toHaveLength(2);
});

test('totals add up from the rounded lines; the slip ends with Thực nhận and the signature', async ({ page }) => {
  await page.goto(SLIP);
  await expect(pay(page).locator('tbody.lines tr.ln')).toHaveCount(19); // evaluateAll không tự chờ trang tải xong
  const rows = await pay(page).locator('tbody.lines tr.ln').evaluateAll(rs =>
    rs.map(r => [(r as HTMLTableRowElement).cells[0].textContent!.trim(), (r as HTMLTableRowElement).cells[3].textContent!.trim()])
  );
  expect(rows).toHaveLength(19);
  expect(rows.filter(([k]) => k !== 'Tổng phụ cấp').reduce((sum, [, v]) => sum + money(v), 0)).toBe(12134076);
  const sum = pay(page).locator('tbody.sum tr.ln');
  const expected = [
    ['Tổng thu nhập', '', '', '12.134.076'],
    ['Các khoản miễn thuế', '', '', 'BE tính'],
    ['Thu nhập chịu thuế', '', '', 'BE tính'],
    ['Bảo hiểm bắt buộc · BHXH 8%, BHTN 1%, BHYT 1,5%', '10,5%', '', '630.000'],
    ['Thu nhập sau bảo hiểm', '', '', '11.504.076'],
    ['Thuế TNCN', '', '', '0'],
    ['Tạm ứng · 80% lương ngày công 01–15/10', '10 ngày', '', '1.846.154']
  ];
  await expect(sum).toHaveCount(expected.length);
  for (const [i, cells] of expected.entries()) await expect(sum.nth(i).getByRole('cell')).toHaveText(cells);
  const p2 = sheetPage(page, 2);
  await expect(p2.locator('.net')).toHaveText(/Thực nhận\s*9\.657\.922 ₫/);
  expect(await p2.locator('.net').evaluate(e => getComputedStyle(e).backgroundColor)).toBe('rgb(255, 249, 236)');
  await expect(p2.locator('.end')).toContainText(/Ngày phép năm còn lại\s*8 ngày/);
  await expect(p2.locator('.end .sign')).toHaveText(/Người nhận\s*Ký, ghi rõ họ tên/);
});

test('print tables stay compact under the Gọn density', async ({ page }) => {
  await page.goto(SLIP);
  await expect(att(page).locator('tbody tr')).toHaveCount(29);
  await expect(pay(page).locator('tr.ln').first()).toBeVisible();
  await page.evaluate(() => {
    document.documentElement.dataset.density = 'gon';
  });
  await page.emulateMedia({ media: 'print' });
  // hai dòng cố ý cao hơn: dòng điểm KPI (hai dòng chữ) và dòng đầu khối tổng (đệm trên 12px); mọi ô khác ≤ 22px, còn Gọn sẽ ép 42px
  const tall = await page.locator('.pl-a4 td').evaluateAll(cs =>
    cs
      .filter(c => !c.closest('tr.kpi') && !c.closest('tbody.sum tr:first-child'))
      .filter(c => c.getBoundingClientRect().height > 22)
      .map(c => `${(c.textContent || '').trim()} (${c.getBoundingClientRect().height}px)`)
  );
  const kpi = await page.locator('.pl-a4 tr.kpi td').first().evaluate(c => c.getBoundingClientRect().height);
  const sum = await page.locator('.pl-a4 tbody.sum tr:first-child td').first().evaluate(c => c.getBoundingClientRect().height);
  expect(kpi).toBeLessThan(48);
  expect(sum).toBeLessThan(36);
  expect(tall).toEqual([]);
  const sheets = page.locator('.pl-a4');
  expect(await sheets.evaluateAll(ss => ss.map(s => s.scrollHeight <= s.clientHeight))).toEqual([true, true]);
});

test('no print cell is cut off', async ({ page }) => {
  await page.goto(SLIP);
  await page.emulateMedia({ media: 'print' });
  await expect(att(page).locator('tbody tr')).toHaveCount(29);
  await expect(pay(page).locator('tr.ln').first()).toBeVisible();
  const cut = await page.locator('.pl-a4 td').evaluateAll(cs =>
    cs.filter(c => c.scrollWidth > c.clientWidth).map(c => (c.textContent || '').trim())
  );
  expect(cut).toEqual([]);
});
