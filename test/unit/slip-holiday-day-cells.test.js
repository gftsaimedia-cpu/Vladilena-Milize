'use strict';
// Ca sang ngày lễ (qa_night40, ca g2, lễ 20/10) trên trang 1 phiếu A4 (public/admin/phieu-a4-days.js): bộ máy trả giờ lễ THAY cho phần
// lương ngày của các giờ đó, giờ lễ không trừ giờ nghỉ (19/10 897.115, 20/10 741.346). Kèm: chip "Lễ" + chip ca không bị cắt,
// "Nghỉ lễ hưởng lương · ngày" chỉ liệt kê ngày lễ. Bốn cột tiền của dòng: test/unit/slip-row-columns.test.js.
process.env.DB_PATH = process.env.DB_PATH || ':memory:'; // lib/slip-paid.js nạp lib/db
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const PayrollEngine = require('../../public/payroll-engine.js');
const { DEFAULTS } = require('../helpers/defaults-old-basis.js');
const { withDayFigures, staffDayNotesOf } = require('../../lib/slip-paid.js');
const { declaredPunches } = require('../helpers/declared-punches');

const MONTH = '2026-10';
const HOLIDAY = '2026-10-20';
const STAFF = {
  username: 'qa_night40',
  type: 'nv',
  level: 1,
  nightPct: 40,
  startDate: '2025-01-06',
  shiftCode: 'Night2'
};
// Dữ liệu mẫu: 19/10 ca đêm sang lễ, 20/10 đi làm ngày lễ (đã duyệt) sang 21/10, 21/10 vắng
const OWNER_DAYS = {
  '2026-10-19': { kind: 'work', in: '22:00', out: '07:00', extraKind: 'makeup', extraIn: '07:00', extraOut: '08:00' },
  '2026-10-20': { kind: 'work', in: '22:00', out: '07:00' },
  '2026-10-21': { kind: 'noshow' }
};
function ownerMonth() {
  return PayrollEngine.create(DEFAULTS).computeMonth({
    staff: STAFF,
    days: OWNER_DAYS,
    approvals: { [HOLIDAY]: { status: 'approved', item: 'holiday_work', fingerprint: 'holiday_work|22:00-07:00' } },
    sessions: declaredPunches(STAFF, OWNER_DAYS),
    kpi: { pct: null, amt: null, admPct: null, admAmt: null },
    holidays: [HOLIDAY],
    month: MONTH,
    upTo: null,
    asOf: `${MONTH}-28T09:00:00+07:00`
  }).m;
}
const rowOf = (m, date) => m.rows.find(r => r.date === date);

function loadAdmin() {
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
  for (const file of ['view-phieu.js', 'phieu-a4.js', 'phieu-a4-days.js'])
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../../public/admin', file), 'utf8'), context, {
      filename: file
    });
  return Admin.Phieu;
}
const Phieu = loadAdmin();

async function render(snapshot, holidays = [HOLIDAY]) {
  const payslip = {
    username: STAFF.username,
    snapshot,
    staffTerms: { ...STAFF, name: 'QA Night 40', contract: 'official' }
  };
  const model = Phieu.modelOf({ payslip, run: null }, MONTH, { ...DEFAULTS }, {}, holidays);
  return { page1: Phieu.daysSheet(model, {}), page2: await Phieu.sheetOf(model, {}) };
}
// Ô của dòng ngày `dm` (dd/mm) trên trang 1: mảng chuỗi HTML của 9 ô
function cellsOf(page1, dm) {
  const tr = page1.match(/<tr[\s\S]*?<\/tr>/g).find(t => t.includes(`, ${dm}<`));
  assert.ok(tr, `có dòng ${dm}`);
  return tr.match(/<td[\s\S]*?<\/td>/g);
}
const text = html =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
test('withDayFigures trả bản sao, không sửa bản chụp gốc; staffDayNotesOf liệt kê ca có giờ lễ', async () => {
  const m = ownerMonth();
  const before = JSON.stringify(m);
  const out = await withDayFigures(m);
  assert.notEqual(out, m);
  assert.equal(JSON.stringify(m), before, 'bản chụp gốc không đổi');
  assert.equal(out.total, m.total);
  assert.equal(await withDayFigures(null), null);
  assert.deepEqual(staffDayNotesOf(m.rows).holidayShifts, [
    { date: '2026-10-19', onHoliday: false },
    { date: HOLIDAY, onHoliday: true }
  ]);
  assert.deepEqual(staffDayNotesOf(undefined), {});
});

test('trang 1: chip "Lễ" và chip ca xếp hai tầng (chip ca nằm trong .stk), không chung một dòng', async () => {
  const { page1 } = await render(await withDayFigures(ownerMonth()));
  const ca = cellsOf(page1, '20/10')[1];
  assert.match(
    ca,
    /<span class="dchip dash">Lễ<\/span><span class="stk"><span class="dchip night">Night \+40%<\/span><\/span>/
  );
  assert.doesNotMatch(cellsOf(page1, '19/10')[1], /stk/);
});

test('"Nghỉ lễ hưởng lương · ngày": không có danh sách lễ của lần tính thì chỉ liệt kê dòng ngày lễ, không có 19/10', async () => {
  const line = page2 => text(page2.match(/<tr[\s\S]*?<\/tr>/g).find(t => t.includes('Nghỉ lễ hưởng lương')));
  assert.match(line((await render(await withDayFigures(ownerMonth()), null)).page2), /Nghỉ lễ hưởng lương · 20\/10 1 ngày 230\.769/);
  assert.match(line((await render(await withDayFigures(ownerMonth()))).page2), /Nghỉ lễ hưởng lương · 20\/10 1 ngày/);
});
