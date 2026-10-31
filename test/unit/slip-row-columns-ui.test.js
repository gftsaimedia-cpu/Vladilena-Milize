'use strict';
// Ô tiền của ngày trên phiếu: mỗi ô là MỘT số của máy chủ (cot), không dòng phụ, không chữ giải thích.
//   - trang 1 phiếu A4 (public/admin/phieu-a4-days.js, cùng bản vẽ cho màn Admin và bản in): dòng ngày lễ ca đêm 01/10 hiện đúng
//     Lương ngày 403.846 · Phụ cấp ca 129.808 · Làm thêm 207.692 · Trừ giờ — · Thành tiền 741.346;
//   - thẻ Thu nhập của nhân sự (public/nhan-vien/thu-nhap.js): dòng Làm bù, Tiền OT, OT ngày lễ chỉ có số tiền.
process.env.DB_PATH = process.env.DB_PATH || ':memory:'; // lib/slip-paid.js nạp lib/db
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const PayrollEngine = require('../../public/payroll-engine.js');
const AV = require('../../public/approval-view.js');
const { DEFAULTS } = require('../helpers/defaults-old-basis.js');
const { withDayFigures } = require('../../lib/slip-paid.js');
const { declaredPunches } = require('../helpers/declared-punches');

const MONTH = '2026-10';
const HOLIDAY = '2026-10-01';
const STAFF = {
  username: 'qa_night40',
  type: 'nv',
  level: 1,
  nightPct: 40,
  startDate: '2025-01-06',
  shiftCode: 'Night2'
};
const DAYS = {
  [HOLIDAY]: { kind: 'work', in: '22:00', out: '07:00' },
  '2026-10-05': { kind: 'work', in: '22:00', out: '07:00', extraKind: 'ot', extraIn: '', extraOut: '09:00' }
};
function approvedAll() {
  const out = {};
  for (const [date, day] of Object.entries(DAYS)) {
    const found = AV.itemOf(day, { date, holidays: [HOLIDAY], staffType: STAFF.type });
    if (found) out[date] = { item: found.item, fingerprint: found.fingerprint, status: 'approved' };
  }
  return out;
}
const snapshot = () =>
  PayrollEngine.create(DEFAULTS).computeMonth({
    staff: STAFF,
    days: DAYS,
    approvals: approvedAll(),
    sessions: declaredPunches(STAFF, DAYS),
    kpi: { pct: null, amt: null, admPct: null, admAmt: null },
    holidays: [HOLIDAY],
    month: MONTH,
    upTo: null,
    asOf: `${MONTH}-28T09:00:00+07:00`
  }).m;

function loadPhieu() {
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
const Phieu = loadPhieu();
const text = html =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
function page1Of(snap) {
  const payslip = {
    username: STAFF.username,
    snapshot: snap,
    staffTerms: { ...STAFF, name: 'QA', contract: 'official' }
  };
  const model = Phieu.modelOf({ payslip, run: null }, MONTH, { ...DEFAULTS }, {}, [HOLIDAY]);
  return Phieu.daysSheet(model, {});
}
function rowCells(page1, dm) {
  const tr = page1.match(/<tr[\s\S]*?<\/tr>/g).find(t => t.includes(`, ${dm}<`));
  assert.ok(tr, `có dòng ${dm}`);
  return tr.match(/<td[\s\S]*?<\/td>/g);
}

test('phiếu A4 dòng ngày lễ ca đêm 01/10: đúng bốn ô tiền + Thành tiền, không dòng phụ, không chữ giải thích', async () => {
  const tds = rowCells(page1Of(await withDayFigures(await snapshot())), '01/10');
  assert.equal(tds.length, 9);
  assert.deepEqual(tds.slice(4).map(text), ['403.846', '129.808', '207.692', '—', '741.346']);
  for (const td of tds.slice(4)) assert.doesNotMatch(td, /<small|<i>/, 'ô tiền không có dòng phụ');
  const row = tds
    .filter((_, i) => i !== 1)
    .map(text)
    .join(' | '); // trừ ô chip ca ("Night +40%")
  for (const label of ['lương ngày lễ', 'giờ', 'Off Paid', 'OT ngày lễ', 'làm bù', 'ngày thường', 'đến ', '+'])
    assert.ok(!row.includes(label), `dòng không còn "${label}": ${row}`);
});

test('phiếu A4 ngày có OT đã duyệt: Làm thêm là một số, không ghi số giờ và giờ kết thúc', async () => {
  const tds = rowCells(page1Of(await withDayFigures(await snapshot())), '05/10');
  const cells = tds.slice(4).map(text);
  assert.match(cells[2], /^\d{1,3}(\.\d{3})*$/, `Làm thêm chỉ là số: ${cells[2]}`);
  assert.ok(
    cells.every(c => !/giờ|đến|Off Paid/.test(c)),
    cells.join(' | ')
  );
});

test('phiếu A4 bản chụp cũ chưa có cột tiền: không phát minh số, ô thiếu là gạch ngang, Thành tiền giữ nguyên', async () => {
  const tds = rowCells(page1Of(await snapshot()), '01/10');
  assert.deepEqual(tds.slice(4).map(text), ['—', '—', '—', '—', '741.346']);
});

// Thẻ Thu nhập của nhân sự: chỉ chữ của dòng nhỏ, số tiền là của máy chủ
function staffLines(data) {
  const NV = {
    actions: {},
    esc: v => String(v ?? ''),
    ic: () => '',
    S: { estimates: { [MONTH]: { status: 'ok', data } }, desktop: false },
    L: { dm: iso => `${iso.slice(8)}/${iso.slice(5, 7)}`, workdaysStdOf: () => 26, ITEM_LABEL: {} },
    fmtNum: n => Number(n).toLocaleString('vi-VN'),
    model: () => null
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../public/nhan-vien/thu-nhap.js'), 'utf8'), {
    window: { NV },
    console
  });
  return (NV.incomeSlipCard(MONTH).match(/<div class="nv-kv[\s\S]*?<\/div>/g) || []).map(text);
}

test('thẻ Thu nhập: dòng Làm bù, Tiền OT, OT ngày lễ chỉ có số tiền, không ghi số giờ hay cách tính', () => {
  const lines = staffLines({
    m: { count: 3, makeupHours: 4, holWorkHours: 2, otHours: 2 },
    net: { net: 1 },
    trace: { tienNgayCong: 692307, lamBu: 115385, tienOt: 57692, tienLamLe: 207692 },
    holidayShifts: [{ date: HOLIDAY, onHoliday: true }]
  });
  for (const label of ['Làm bù 115.385', 'Tiền OT 57.692', 'OT ngày lễ 01/10 207.692'])
    assert.ok(lines.includes(label), `${label}\n${lines.join('\n')}`);
  assert.ok(!lines.join('\n').includes('lương giờ'), lines.join('\n'));
  assert.ok(!lines.some(l => /^(Làm bù|OT ngày lễ).* giờ/.test(l)), lines.join('\n'));
});
