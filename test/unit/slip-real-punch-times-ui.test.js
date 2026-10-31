'use strict';
// Ô Vào – ra của phiếu A4 (public/admin/phieu-a4-days.js) và mẫu cổ điển (public/admin/phieu-co-dien.js) in giờ bấm thật của dòng ngày
// (punchIn, punchOut do máy chủ ghi): "<vào> – <ra>", bên nào không có thì --:--; ngày vắng và chờ xử lý in --:-- – --:-- (hoặc giờ vào thật);
// ngày nghỉ, nghỉ lễ, chưa tới giữ chữ cũ. Giao diện chỉ in chuỗi của máy chủ, không dời giờ theo phút cắt.
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULTS } = require('../../public/payroll-params.js');

const MONTH = '2026-10';
function loadPhieu(files) {
  const esc = value =>
    String(value ?? '').replace(
      /[&<>"']/g,
      c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
  const Admin = {
    esc,
    ic: () => '',
    actions: {},
    S: {},
    TYPE_SHORT: { nv: 'NV' },
    TYPE_LONG: { nv: 'Nhân viên' },
    levelText: () => 'Bậc 1',
    levelNames: { name: () => 'Bậc 1' },
    fmtStamp: iso => String(iso)
  };
  const context = vm.createContext({ console, window: { Admin } });
  for (const file of files)
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../../public/admin', file), 'utf8'), context, {
      filename: file
    });
  return Admin.Phieu;
}
const Phieu = loadPhieu(['view-phieu.js', 'phieu-a4.js', 'phieu-a4-days.js', 'phieu-co-dien.js']);
const text = html =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const money = { daily: 230769.23, hourly: 28846.15, bonus: 0, cut: 0, short: 0, paidOff: false };
const work = (date, over) => ({
  date,
  kind: 'work',
  shift: 'normal',
  in: '08:00',
  out: '17:00',
  hours: 8,
  total: 230769,
  cot: { luongNgay: 230769, phuCapCa: 0, lamThem: 0, truGio: 0 },
  ...money,
  ...over
});
const ROWS = [
  work('2026-10-06', { punchIn: '07:55', punchOut: '17:10' }),
  work('2026-10-07', { punchIn: '08:40', punchOut: '17:00', cutStartMin: 30, hours: 7.5 }),
  work('2026-10-08', { punchIn: '08:02', punchOut: null }),
  work('2026-10-09', { shift: 'night', in: '22:00', out: '07:00', punchIn: '21:58', punchOut: '07:05' }),
  { date: '2026-10-12', kind: 'noshow', hours: 0, total: 0, ...money, punchIn: null, punchOut: null },
  {
    date: '2026-10-13',
    kind: 'pending',
    reason: 'forgot-out',
    hours: 0,
    total: 0,
    ...money,
    punchIn: '07:58',
    punchOut: null
  },
  { date: '2026-10-14', kind: 'pending', reason: 'not-yet', hours: 0, total: 0, ...money },
  { date: '2026-10-15', kind: 'leave', hours: 0, total: 230769, ...money, paidOff: true },
  work('2026-10-16', { punchIn: null, punchOut: null })
];
function modelOf(rows) {
  const snap = { rows, net: { gross: 0, net: 0 }, trace: {} };
  const payslip = {
    username: 'qa_nv',
    snapshot: snap,
    staffTerms: { username: 'qa_nv', type: 'nv', level: 1, name: 'QA', contract: 'official' }
  };
  return Phieu.modelOf({ payslip, run: null }, MONTH, { ...DEFAULTS }, {}, []);
}
const page = html => html.match(/<tr[\s\S]*?<\/tr>/g);
function cellsOf(html, dm) {
  const tr = page(html).find(t => t.includes(`, ${dm}<`));
  assert.ok(tr, `có dòng ${dm}`);
  return tr.match(/<td[\s\S]*?<\/td>/g).map(text);
}

test('phiếu A4 trang 1: ô Vào – ra là giờ bấm thật, tiền và giờ làm giữ nguyên', () => {
  const html = Phieu.daysSheet(modelOf(ROWS), {});
  assert.deepEqual(cellsOf(html, '06/10').slice(2, 5), ['07:55 – 17:10', '8', '230.769']);
  assert.deepEqual(cellsOf(html, '07/10')[2], '08:40 – 17:00', 'trễ có phút cắt: vẫn in giờ bấm thật');
  assert.equal(cellsOf(html, '09/10')[2], '21:58 – 07:05', 'ca đêm: giờ ra là giờ sáng hôm sau, không có ngày');
});

test('phiếu A4: bên không có giờ bấm in --:--', () => {
  const html = Phieu.daysSheet(modelOf(ROWS), {});
  assert.equal(cellsOf(html, '08/10')[2], '08:02 – --:--');
  assert.equal(cellsOf(html, '16/10')[2], '--:-- – --:--');
});

test('phiếu A4: ngày vắng và quên Check-out in giờ bấm thật hoặc --:-- – --:--; ngày nghỉ và chưa tới giữ chữ cũ', () => {
  const html = Phieu.daysSheet(modelOf(ROWS), {});
  assert.deepEqual(cellsOf(html, '12/10').slice(1, 3), ['Vắng', '--:-- – --:--']);
  assert.equal(cellsOf(html, '13/10')[2], '07:58 – --:--');
  assert.equal(cellsOf(html, '14/10')[2], 'Chưa tới ngày');
  assert.equal(cellsOf(html, '15/10')[2], 'Hưởng lương ngày');
});

test('phiếu A4: dòng cũ chưa có giờ bấm (chưa qua máy chủ) in --:-- – --:--, không in giờ ca', () => {
  const html = Phieu.daysSheet(modelOf([work('2026-10-06', {})]), {});
  const io = cellsOf(html, '06/10')[2];
  assert.equal(io, '--:-- – --:--');
  assert.ok(!/08:00 – 17:00/.test(text(html)), 'không in giờ ca');
});

test('mẫu cổ điển: cột Vào – ra cũng là giờ bấm thật', () => {
  const html = Phieu.classicSheet(modelOf(ROWS));
  const tr = page(html).find(t => t.includes('06/10'));
  assert.match(text(tr), /07:55 – 17:10/);
  const tr2 = page(html).find(t => t.includes('08/10'));
  assert.match(text(tr2), /08:02 – --:--/);
});
