import { expect, test } from '@playwright/test';
import { inApp } from './fixtures/in-app';

// Dữ liệu giả chấm công (mock/attendance.ts) dựng từ nguồn việc chung (mock/inbox.ts): không page.route, không gọi /api.
// Mỗi test mở một trang mới nên module giả luôn bắt đầu từ trạng thái ban đầu (13 việc chờ).
const IMPORTS = `const A = await import('/src/mock/attendance.ts'); const I = await import('/src/mock/inbox.ts');`;

test.beforeEach(async ({ page }) => {
  await page.goto('/admin/tong-quan');
});

test('roster and days follow the board', async ({ page }) => {
  const out = await inApp<{
    ids: string[];
    n: number;
    first: string;
    today: { iso: string; today: boolean };
    last: string;
    start: { iso: string; periodStart: boolean; scheduled: boolean };
    sat: { iso: string; scheduled: boolean };
  }>(
    page,
    `${IMPORTS}
    const v = A.attendanceView('2026-10');
    const d = v.days;
    return {
      ids: v.rows.map(r => r.person.id),
      n: d.length,
      first: d[0].iso,
      today: { iso: d[16].iso, today: d[16].today },
      last: d[27].iso,
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
    const todo = () => A.attendanceView('2026-10').rows.flatMap(r => r.cells).filter(c => c.kind === 'todo').length;
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
    const view = () => A.attendanceView('2026-10');
    const tile = (v, key) => v.tiles.find(t => t.key === key);
    const start = view();
    const startTiles = Object.fromEntries(start.tiles.map(t => [t.key, [t.label, t.value, t.note]]));
    const order = start.pending.map(p => p.person.name + ' ' + p.date);
    const total = start.total;
    I.resolveInboxItem('ib-c1');
    const afterC1 = tile(view(), 'todo');
    I.resolveInboxItem('ib-a1');
    const afterA1 = tile(view(), 'todo');
    return { startTiles, order, total, afterC1: [afterC1.value, afterC1.note], afterA1: afterA1.value };`
  );
  expect(out.startTiles).toEqual({
    todo: ['Cần xử lý', '11', '2 quên chấm · 9 yêu cầu chờ duyệt'],
    present: ['Có mặt hôm nay', '113 / 128', '15 người chưa Check-in'],
    late: ['Đi muộn hôm nay', '7', 'trung bình 14 phút'],
    leave: ['Nghỉ có phép', '6', '3 đơn chờ duyệt'],
    absent: ['Vắng không phép', '1', 'trong tháng 10'],
    ot: ['Làm thêm tháng này', '126 giờ', '2 yêu cầu chờ duyệt']
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
  expect(out.afterC1).toEqual(['10', '1 quên chấm · 9 yêu cầu chờ duyệt']);
  expect(out.afterA1).toBe('10');
});

test('day detail and other months', async ({ page }) => {
  const out = await inApp<Record<string, any>>(
    page,
    `${IMPORTS}
    const d = A.dayDetail('le-hoang-nam', '2026-10-27');
    return {
      title: d.title,
      sub: d.sub,
      cell: { in: d.cell.in, out: d.cell.out },
      item: d.item.id,
      nobody: A.dayDetail('khong-co', '2026-10-27'),
      before: A.dayDetail('le-hoang-nam', '2026-09-30'),
      bad: A.dayDetail('le-hoang-nam', '2026-13-01'),
      september: A.attendanceView('2026-09')
    };`
  );
  expect(out.title).toBe('Lê Hoàng Nam · Thứ Ba 27/10/2026');
  expect(out.sub).toBe('Kinh doanh · Nhân viên kinh doanh · Ca HC 08:00–17:00');
  expect(out.cell).toEqual({ in: '08:12', out: null });
  expect(out.item).toBe('ib-e1');
  expect(out.nobody).toBeNull();
  expect(out.before).toBeNull();
  expect(out.bad).toBeNull();
  expect(out.september).toBeNull();
});

test('weekdayName names every day', async ({ page }) => {
  const out = await inApp<string[]>(
    page,
    `const F = await import('/src/utils/format.ts'); return [F.weekdayName('2026-10-27'), F.weekdayName('2026-11-01')];`
  );
  expect(out).toEqual(['Thứ Ba', 'Chủ nhật']);
});
