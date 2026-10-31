'use strict';
// Ngày giữ vì giải trình (dòng kind 'unpaid' có held): ô Vào – ra của phiếu A4 và mẫu cổ điển in giờ bấm thật ("08:00 – --:--"), không in chữ ghi chú;
// chip Ca ghi Bị từ chối (held 'rejected') hoặc Chờ xử lý (held 'pending'). Ngày nghỉ không lương thường (không có held) giữ chữ cũ.
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
const held = (date, over) => ({ date, kind: 'unpaid', hours: 0, total: 0, ...money, ...over });
const ROWS = [
  held('2026-10-08', { held: 'rejected', punchIn: '08:00', punchOut: null }),
  held('2026-10-09', { held: 'rejected', punchIn: '08:16', punchOut: '17:00' }),
  held('2026-10-12', { held: 'pending', punchIn: null, punchOut: null }),
  held('2026-10-13', {})
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

test('phiếu A4: ngày giải trình bị từ chối in giờ bấm thật, chip Bị từ chối', () => {
  const html = Phieu.daysSheet(modelOf(ROWS), {});
  assert.deepEqual(cellsOf(html, '08/10').slice(1, 3), ['Bị từ chối', '08:00 – --:--']);
  assert.deepEqual(cellsOf(html, '09/10').slice(1, 3), ['Bị từ chối', '08:16 – 17:00']);
});

test('phiếu A4: ngày giải trình chưa duyệt in giờ bấm (thiếu thì --:--), chip Chờ xử lý; nghỉ không lương thường giữ chữ cũ', () => {
  const html = Phieu.daysSheet(modelOf(ROWS), {});
  assert.deepEqual(cellsOf(html, '12/10').slice(1, 3), ['Chờ xử lý', '--:-- – --:--']);
  assert.deepEqual(cellsOf(html, '13/10').slice(1, 3), ['Không lương', 'Không tính lương']);
});

test('mẫu cổ điển: ngày bị từ chối in giờ bấm thật và nhãn Bị từ chối; nghỉ không lương thường giữ chữ cũ', () => {
  const html = Phieu.classicSheet(modelOf(ROWS));
  const rejected = text(page(html).find(t => t.includes('08/10')));
  assert.match(rejected, /Bị từ chối/);
  assert.match(rejected, /08:00 – --:--/);
  assert.doesNotMatch(rejected, /Không tính lương/);
  assert.match(text(page(html).find(t => t.includes('12/10'))), /Chờ xử lý.*--:-- – --:--/);
  assert.match(text(page(html).find(t => t.includes('13/10'))), /Nghỉ không lương.*Không tính lương/);
});
