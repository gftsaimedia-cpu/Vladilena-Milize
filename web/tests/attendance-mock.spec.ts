import { expect, test } from '@playwright/test';
import { inApp } from './fixtures/in-app';

// Dữ liệu giả chấm công (mock/attendance.ts, trả DTO cùng dạng BE) dựng từ nguồn việc chung (mock/inbox.ts): không page.route, không gọi /api.
// Mỗi test mở một trang mới nên module giả luôn bắt đầu từ trạng thái ban đầu (13 việc chờ).
const EMP = `const E = await import('/src/mock/attendance-employee.ts');`;
const IMPORTS = `const A = await import('/src/mock/attendance.ts'); const I = await import('/src/mock/inbox.ts');`;

// Bộ ghi các request /api của trang hiện tại; test đầu tiên khẳng định nó rỗng.
let calls: string[] = [];

test.beforeEach(async ({ page }) => {
  calls = [];
  page.on('request', req => {
    const url = new URL(req.url());
    if (url.pathname.startsWith('/api')) calls.push(`${req.method()} ${url.pathname}`);
  });
  await page.goto('/admin/tong-quan');
});

test('roster and days follow the board', async ({ page }) => {
  const out = await inApp<{
    ids: string[];
    n: number;
    first: string;
    today: { iso: string; today: boolean };
    last: string;
    subtitle: string;
    start: { iso: string; periodStart: boolean; scheduled: boolean };
    sat: { iso: string; scheduled: boolean };
  }>(
    page,
    `${IMPORTS}
    const v = A.weekDto({ month: '2026-10' });
    const d = v.days;
    return {
      ids: v.rows.map(r => r.username),
      n: d.length,
      first: d[0].iso,
      today: { iso: d[16].iso, today: d[16].today },
      last: d[27].iso,
      subtitle: v.subtitle,
      start: { iso: d[20].iso, periodStart: d[20].periodStart, scheduled: d[20].scheduled },
      sat: { iso: d[19].iso, scheduled: d[19].scheduled }
    };`
  );
  expect(out.ids).toEqual([
    'nguyen-thu-ha',
    'tran-minh-quan',
    'le-hoang-nam',
    'pham-ngoc-anh',
    'vo-duc-thinh',
    'do-mai-linh',
    'bui-quoc-huy',
    'trinh-van-long',
    'ly-thanh-tam',
    'ngo-gia-bao',
    'hoang-minh-duc'
  ]);
  expect(out.n).toBe(28);
  expect(out.first).toBe('2026-10-12');
  expect(out.today).toEqual({ iso: '2026-10-28', today: true });
  expect(out.last).toBe('2026-11-08');
  expect(out.start).toEqual({ iso: '2026-11-01', periodStart: true, scheduled: false });
  expect(out.sat).toEqual({ iso: '2026-10-31', scheduled: true });
  expect(out.subtitle).toBe('Kỳ công 01–31/10/2026 · hôm nay Thứ Tư 28/10');
  expect(calls).toEqual([]);
});

test('everyone works Monday to Saturday and the period adds up to 27', async ({ page }) => {
  const out = await inApp<{
    scheduled: number;
    standard: number;
    sat: boolean;
    sun: boolean;
    totals: number[];
    periods: Record<string, unknown>;
    counts: { id: string; leave: boolean; unpaid: boolean; pending: boolean }[];
  }>(
    page,
    `${IMPORTS}
    const dates = Array.from({ length: 31 }, (_, i) => '2026-10-' + String(i + 1).padStart(2, '0'));
    const byId = Object.fromEntries(A.ROSTER.map(p => [p.id, p.period]));
    return {
      scheduled: A.scheduledDays('2026-10'),
      standard: A.STANDARD_DAYS,
      sat: A.isScheduled('2026-10-31'),
      sun: A.isScheduled('2026-11-01'),
      totals: A.ROSTER.map(p => p.period.worked + p.period.leave + p.period.isat + p.period.pending + p.period.unpaid),
      periods: { nam: byId['le-hoang-nam'], linh: byId['do-mai-linh'], ha: byId['nguyen-thu-ha'] },
      counts: A.ROSTER.map(p => {
        const cells = dates.map(d => A.cellOf(p.id, d));
        const n = kind => cells.filter(c => c.kind === kind).length;
        return {
          id: p.id,
          leave: n('leave') === p.period.leave,
          unpaid: n('absent') === p.period.unpaid,
          pending: n('todo') === p.period.pending
        };
      })
    };`
  );
  expect(out.scheduled).toBe(27);
  expect(out.standard).toBe(26);
  expect(out.sat).toBe(true);
  expect(out.sun).toBe(false);
  expect(out.totals).toEqual(Array(11).fill(27));
  expect(out.periods).toEqual({
    nam: { worked: 25, leave: 1, isat: 0, pending: 1, unpaid: 0 },
    linh: { worked: 25, leave: 0, isat: 0, pending: 1, unpaid: 1 },
    ha: { worked: 25, leave: 0, isat: 0, pending: 2, unpaid: 0 }
  });
  expect(out.counts).toHaveLength(11);
  for (const c of out.counts) expect(c, c.id).toEqual({ id: c.id, leave: true, unpaid: true, pending: true });
});

test('hand-written cells match the board', async ({ page }) => {
  const out = await inApp<Record<string, any>>(
    page,
    `${IMPORTS}
    // 22/10 của Đức có việc chờ (ib-e4): trước khi xử lý ô là cần xử lý, sau đó trở về ghi nhận gốc.
    const duc = () => A.cellOf('hoang-minh-duc', '2026-10-22');
    const before = duc();
    I.resolveInboxItem('ib-e4');
    return {
      nam: A.cellOf('le-hoang-nam', '2026-10-26'),
      linh: A.cellOf('do-mai-linh', '2026-10-13'),
      bao: A.cellOf('ngo-gia-bao', '2026-10-19'),
      tam: A.cellOf('ly-thanh-tam', '2026-10-28'),
      anh: A.cellOf('pham-ngoc-anh', '2026-10-28'),
      ducBefore: { kind: before.kind, base: before.base, label: before.label },
      ducAfter: duc()
    };`
  );
  expect(out.nam).toMatchObject({ kind: 'work', text: '07:56–17:10', in: '07:56', out: '17:10', live: false });
  expect(out.linh).toMatchObject({ kind: 'absent', text: 'Vắng', aria: 'Vắng', label: 'Vắng' });
  expect(out.bao).toMatchObject({ kind: 'leave', text: 'Nghỉ, làm bù', aria: 'Nghỉ có phép, Nghỉ, làm bù' });
  expect(out.tam).toMatchObject({ kind: 'nocheck', text: 'Chưa vào', aria: 'chưa Check-in', label: 'Chưa Check-in' });
  expect(out.anh).toMatchObject({
    kind: 'late',
    live: true,
    text: '08:21–…',
    out: null,
    aria: 'Đi muộn, 08:21–…, đang làm'
  });
  expect(out.ducBefore).toEqual({ kind: 'todo', base: 'late', label: 'Cần xử lý' });
  expect(out.ducAfter).toMatchObject({ kind: 'late', base: 'late', label: 'Về sớm', text: '08:00–16:30' });
});

test('other cells follow the generator', async ({ page }) => {
  const out = await inApp<Record<string, any>>(
    page,
    `${IMPORTS}
    return {
      ha: A.cellOf('nguyen-thu-ha', '2026-10-01').text,
      nam5: A.cellOf('le-hoang-nam', '2026-10-05').text,
      nam3: A.cellOf('le-hoang-nam', '2026-10-03').text,
      nam31: A.cellOf('le-hoang-nam', '2026-10-31'),
      nam4: A.cellOf('le-hoang-nam', '2026-10-04'),
      nam112: A.cellOf('le-hoang-nam', '2026-11-02'),
      nam119: A.cellOf('le-hoang-nam', '2026-11-09')
    };`
  );
  expect(out.ha).toBe('07:45–17:00');
  expect(out.nam5).toBe('07:51–17:06');
  expect(out.nam3).toBe('07:45–17:08');
  expect(out.nam31).toMatchObject({ kind: 'fu' });
  expect(out.nam4).toMatchObject({ kind: 'off', aria: 'không có ca' });
  expect(out.nam112).toMatchObject({ kind: 'fu', text: '08:00–17:00', aria: 'ca dự kiến 08:00–17:00' });
  expect(out.nam119).toBeNull();
});

test('pending items overlay their days and lift when resolved', async ({ page }) => {
  const out = await inApp<Record<string, any>>(
    page,
    `${IMPORTS}
    const todo = () => A.weekDto({ month: '2026-10' }).rows.flatMap(r => r.days).filter(c => c.kind === 'todo').length;
    const start = {
      todo: todo(),
      nam: A.cellOf('le-hoang-nam', '2026-10-27'),
      ha: A.cellOf('nguyen-thu-ha', '2026-10-29'),
      huy: A.cellOf('bui-quoc-huy', '2026-10-28')
    };
    I.resolveInboxItem('ib-e1');
    const afterE1 = { todo: todo(), nam: A.cellOf('le-hoang-nam', '2026-10-27') };
    I.resolveInboxItem('ib-l2');
    const afterL2 = A.cellOf('bui-quoc-huy', '2026-10-28');
    return { start, afterE1, afterL2 };`
  );
  expect(out.start.todo).toBe(12);
  expect(out.start.nam).toMatchObject({ kind: 'todo', itemId: 'ib-e1', text: '08:12–?', aria: 'Cần xử lý, Thiếu giờ ra' });
  expect(out.start.ha).toMatchObject({ kind: 'todo', text: 'Phép năm', itemId: 'ib-l1' });
  expect(out.start.huy).toMatchObject({ kind: 'todo', text: 'Nghỉ ốm', itemId: 'ib-l2' });
  expect(out.afterE1.todo).toBe(11);
  expect(out.afterE1.nam).toMatchObject({ kind: 'late', label: 'Đi muộn', itemId: null });
  expect(out.afterL2).toMatchObject({ kind: 'nocheck', text: 'Chưa vào', itemId: null });
});

test('tiles count pending items by scope', async ({ page }) => {
  const out = await inApp<Record<string, any>>(
    page,
    `${IMPORTS}
    const view = () => A.weekDto({ month: '2026-10' });
    const tile = (v, key) => v.tiles.find(t => t.key === key);
    const start = view();
    const startTiles = Object.fromEntries(start.tiles.map(t => [t.key, [t.label, t.value, t.of ?? t.unit ?? null, t.note]]));
    const order = start.pending.map(p => p.name + ' ' + p.date);
    const total = start.total;
    I.resolveInboxItem('ib-c1');
    const afterC1 = tile(view(), 'todo');
    I.resolveInboxItem('ib-a1');
    const afterA1 = tile(view(), 'todo');
    return { startTiles, order, total, afterC1: [afterC1.value, afterC1.note], afterA1: afterA1.value };`
  );
  expect(out.startTiles).toEqual({
    todo: ['Cần xử lý', 11, null, '2 chưa giải trình · 9 yêu cầu chờ duyệt'],
    present: ['Có mặt hôm nay', 113, 128, '15 người chưa Check-in'],
    late: ['Đi muộn hôm nay', 7, null, 'trung bình 14 phút'],
    leave: ['Nghỉ có phép', 6, null, '3 đơn chờ duyệt'],
    absent: ['Vắng không phép', 1, null, 'trong tháng 10'],
    ot: ['Làm thêm tháng này', 126, 'giờ', '2 yêu cầu chờ duyệt']
  });
  expect(out.total).toBe(128);
  expect(out.order).toEqual([
    'Trần Minh Quân 2026-10-15',
    'Hoàng Minh Đức 2026-10-22',
    'Võ Đức Thịnh 2026-10-23',
    'Lý Thanh Tâm 2026-10-26',
    'Đỗ Mai Linh 2026-10-26',
    'Trịnh Văn Long 2026-10-27',
    'Lê Hoàng Nam 2026-10-27',
    'Bùi Quốc Huy 2026-10-28',
    'Nguyễn Thu Hà 2026-10-29',
    'Ngô Gia Bảo 2026-11-01',
    'Phạm Ngọc Anh 2026-11-03'
  ]);
  expect(out.afterC1).toEqual([10, '1 chưa giải trình · 9 yêu cầu chờ duyệt']);
  expect(out.afterA1).toBe(10);
});

test('day cell of one person and other months', async ({ page }) => {
  const out = await inApp<Record<string, any>>(
    page,
    `${IMPORTS} ${EMP}
    const v = E.employeeDto('le-hoang-nam', '2026-10');
    const d = v.days.find(x => x.date === '2026-10-27');
    return {
      cell: { in: d.in, out: d.out, itemId: d.itemId, kind: d.kind },
      shift: v.dayHistory.find(h => h.date === '2026-10-27').shift,
      nobody: E.employeeDto('khong-co', '2026-10'),
      september: E.employeeDto('le-hoang-nam', '2026-09').days.length,
      weekSeptember: A.weekDto({ month: '2026-09' })
    };`
  );
  expect(out.cell).toEqual({ in: '08:12', out: null, itemId: 'ib-e1', kind: 'todo' });
  expect(out.shift).toBe('HC 08:00–17:00');
  expect(out.nobody).toBeNull();
  expect(out.september).toBe(0); // tháng ngoài dữ liệu giả: hồ sơ còn nhưng không có ngày nào
  expect(out.weekSeptember).toBeNull();
});

test('week filters by name and group like the backend', async ({ page }) => {
  const out = await inApp<Record<string, any>>(
    page,
    `${IMPORTS}
    const all = A.weekDto({ month: '2026-10' });
    const byName = A.weekDto({ month: '2026-10', q: 'DUC' });
    const byGroup = A.weekDto({ month: '2026-10', group: 'Sản xuất' });
    return {
      groups: all.groups,
      names: byName.rows.map(r => r.name),
      pendingNames: byName.pending.map(p => p.name),
      matched: [byName.matched, byGroup.matched, byGroup.total],
      tileTodo: byName.tiles[0].value
    };`
  );
  expect(out.groups.map((g: { key: string }) => g.key)).toEqual(['Kinh doanh', 'Kỹ thuật', 'Marketing', 'Nhân sự', 'Sản xuất', 'Tài chính']);
  expect(out.names).toEqual(['Võ Đức Thịnh', 'Hoàng Minh Đức']);
  expect(out.pendingNames).toEqual(['Hoàng Minh Đức', 'Võ Đức Thịnh']);
  expect(out.matched).toEqual([2, 4, 128]);
});

test('weekdayName names every day', async ({ page }) => {
  const out = await inApp<string[]>(
    page,
    `const F = await import('/src/utils/format.ts'); return [F.weekdayName('2026-10-27'), F.weekdayName('2026-11-01')];`
  );
  expect(out).toEqual(['Thứ Ba', 'Chủ nhật']);
});

// Hồ sơ chấm công (mock/attendance-employee.ts) dựng từ cùng ô chấm công và cùng nguồn việc chờ.

test('employee DTO for Lê Hoàng Nam matches the board', async ({ page }) => {
  const out = await inApp<Record<string, any>>(
    page,
    `${IMPORTS} ${EMP}
    const v = E.employeeDto('le-hoang-nam', '2026-10');
    return {
      pos: [v.index, v.total, v.prev, v.next],
      stats: v.stats.map(s => [s.key, s.label, s.value, s.unit ?? null, s.note]),
      chips: v.chips,
      pending: v.pending,
      daysLength: v.days.length,
      off: v.days.filter(s => s.kind === 'off').length,
      todo: v.days.find(s => s.date === '2026-10-27'),
      today: v.days.filter(s => s.today).map(s => s.date),
      history: v.dayHistory.map(h => h.date).slice(0, 6),
      historyLength: v.dayHistory.length
    };`
  );
  expect(out.pos).toEqual([3, 11, 'tran-minh-quan', 'pham-ngoc-anh']);
  expect(out.stats).toEqual([
    ['workDays', 'Ngày đi làm', 25, null, 'trong tháng 10'],
    ['late', 'Lần đi muộn', 1, null, '12 phút'],
    ['ot', 'Làm thêm', 0, 'giờ', ''],
    ['leave', 'Phép năm còn', 5, 'ngày', '']
  ]);
  expect(out.chips).toEqual({ work: 22, late: 0, leave: 1, absent: 0, todo: 1 });
  expect(out.pending).toEqual({ count: 1, date: '2026-10-27', itemId: 'ib-e1', group: 'exp', text: 'Thiếu giờ ra · 27/10' });
  expect(out.daysLength).toBe(31);
  expect(out.off).toBe(4);
  expect(out.todo).toMatchObject({ dow: 'T3', day: '27', kind: 'todo', aria: 'Cần xử lý, Thiếu giờ ra' });
  expect(out.today).toEqual(['2026-10-28']);
  // Lịch sử từng ngày mới nhất trước, bỏ ngày không ca và ngày chưa tới (đủ cả tháng, không gộp).
  expect(out.history).toEqual(['2026-10-28', '2026-10-27', '2026-10-26', '2026-10-24', '2026-10-23', '2026-10-22']);
  expect(out.historyLength).toBe(24);
});

test('history rows carry the times and follow the pending item', async ({ page }) => {
  const out = await inApp<Record<string, any>>(
    page,
    `${IMPORTS} ${EMP}
    const rowsOf = v => Object.fromEntries(v.dayHistory.map(h => [h.date, h]));
    const before = E.employeeDto('le-hoang-nam', '2026-10');
    const rows = rowsOf(before);
    I.resolveInboxItem('ib-e1');
    const after = E.employeeDto('le-hoang-nam', '2026-10');
    return { live: rows['2026-10-28'], late: rows['2026-10-27'], work: rows['2026-10-26'], leave: rows['2026-10-12'], afterLate: rowsOf(after)['2026-10-27'], afterPending: after.pending };`
  );
  expect(out.live).toMatchObject({ text: '07:59–…', in: '07:59', out: null, status: 'Đi làm', tone: 'work', shift: 'HC 08:00–17:00' });
  expect(out.late).toMatchObject({ text: '08:12–?', in: '08:12', out: null, status: 'Cần xử lý', tone: 'todo', itemId: 'ib-e1' });
  expect(out.work).toMatchObject({ text: '07:56–17:10', in: '07:56', out: '17:10', status: 'Đi làm' });
  expect(out.leave).toMatchObject({ text: 'Phép năm', status: 'Nghỉ có phép', tone: 'leave' });
  expect(out.afterLate).toMatchObject({ status: 'Đi muộn', itemId: null });
  expect(out.afterPending).toBeNull();
});

test('unknown people and other months', async ({ page }) => {
  const out = await inApp<Record<string, any>>(
    page,
    `${IMPORTS} ${EMP}
    return {
      nobody: E.employeeDto('khong-co', '2026-10'),
      september: E.employeeDto('le-hoang-nam', '2026-09').days.length,
      first: E.employeeDto('nguyen-thu-ha', '2026-10').prev,
      last: E.employeeDto('hoang-minh-duc', '2026-10').next
    };`
  );
  expect(out.nobody).toBeNull();
  expect(out.september).toBe(0); // tháng ngoài dữ liệu giả: hồ sơ còn nhưng không có ngày nào
  expect(out.first).toBeNull();
  expect(out.last).toBeNull();
});
