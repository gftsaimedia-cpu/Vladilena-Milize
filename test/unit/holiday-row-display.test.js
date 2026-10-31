'use strict';
// Hiển thị dòng ngày lễ trên phiếu:
//   - ngày lễ khai đi làm mà không có Check-in/out là dòng 'noshow' (không lương lễ): không được ghi vào "Nghỉ lễ hưởng lương";
// Dòng ở đây dựng tay theo đúng các trường của calcDay để test không phụ thuộc phiên bản bộ máy.
process.env.DB_PATH = process.env.DB_PATH || ':memory:'; // lib/slip-paid.js nạp lib/db
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const PayrollEngine = require('../../public/payroll-engine.js');
const { DEFAULTS } = require('../../public/payroll-params.js');
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
const DAILY = 230769.23076923078;
const HOURLY = DAILY / 8;

// Tháng thật của bộ máy (để trang 2 có đủ số), các dòng ngày thay bằng dòng dựng tay
function monthWith(rows) {
  const m = PayrollEngine.create(DEFAULTS).computeMonth({
    staff: STAFF,
    days: { '2026-10-19': { kind: 'work', in: '22:00', out: '07:00' } },
    approvals: {},
    sessions: declaredPunches(STAFF, { '2026-10-19': { kind: 'work', in: '22:00', out: '07:00' } }),
    kpi: { pct: null, amt: null, admPct: null, admAmt: null },
    holidays: [HOLIDAY],
    month: MONTH,
    upTo: null,
    asOf: `${MONTH}-28T09:00:00+07:00`
  }).m;
  return { ...m, rows };
}
// Dòng lễ có đi làm 22:00–07:00 (2 giờ lễ, 6 giờ ngày thường 21/10) và OT 07:00–09:00 trên ngày 21/10
function holidayRow(extra = {}) {
  const r = {
    date: HOLIDAY,
    kind: 'holiday',
    shift: 'night',
    in: '22:00',
    out: '07:00',
    extraOut: '09:00',
    hours: 8,
    daily: DAILY,
    hourly: HOURLY,
    holBase: DAILY,
    normalWorkH: 6,
    holWorkH: 2,
    holWork: true,
    holWorkPay: 2 * HOURLY * 3 + 2 * HOURLY * 0.6,
    otH: 2,
    otPay: 2 * HOURLY * 1.5,
    bonus: DAILY * 0.4,
    breakPay: 37500,
    cut: 0,
    paidOff: true,
    ...extra
  };
  r.total =
    r.holBase + r.normalWorkH * r.hourly + r.holWorkPay + r.otPay + (r.makeupPay || 0) + r.bonus + r.breakPay - r.cut;
  return r;
}

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
async function render(snapshot, holidays = [HOLIDAY]) {
  const payslip = { username: STAFF.username, snapshot, staffTerms: { ...STAFF, name: 'QA', contract: 'official' } };
  const model = Phieu.modelOf({ payslip, run: null }, MONTH, { ...DEFAULTS }, {}, holidays);
  return { page1: Phieu.daysSheet(model, {}), page2: await Phieu.sheetOf(model, {}) };
}
const text = html =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
function rowCells(page1, dm) {
  const tr = page1.match(/<tr[\s\S]*?<\/tr>/g).find(t => t.includes(`, ${dm}<`));
  assert.ok(tr, `có dòng ${dm}`);
  return tr.match(/<td[\s\S]*?<\/td>/g);
}
test('ngày lễ khai đi làm mà vắng (dòng noshow): trang 1 là "Vắng", "Nghỉ lễ hưởng lương" không ghi ngày đó, paidDays.holiday 0', async () => {
  const rows = [{ date: HOLIDAY, kind: 'noshow', hours: 0, daily: DAILY, hourly: HOURLY, total: 0, paidOff: false }];
  const { page1, page2 } = await render(await withDayFigures(monthWith(rows)));
  assert.match(text(rowCells(page1, '20/10')[1]), /Vắng/);
  const line = text(page2.match(/<tr[\s\S]*?<\/tr>/g).find(t => t.includes('Nghỉ lễ hưởng lương')));
  assert.doesNotMatch(line, /20\/10/);
  assert.equal(staffDayNotesOf(rows).paidDays.holiday, 0);
});

test('staffDayNotesOf.paidDays đếm theo dòng: lễ có lương lễ, phép và iSAT hưởng lương; bỏ lễ không lương (TTS), iSAT không hưởng', () => {
  const rows = [
    holidayRow(),
    { date: '2026-10-21', kind: 'holiday', hours: 0, holBase: 0, total: 0 },
    { date: '2026-10-22', kind: 'leave', paidOff: true, total: DAILY },
    { date: '2026-10-24', kind: 'isat', paidOff: false, total: 0 },
    { date: '2026-10-31', kind: 'isat', paidOff: true, total: DAILY },
    null
  ];
  assert.deepEqual(staffDayNotesOf(rows).paidDays, { holiday: 1, leave: 1, isat: 1 });
  assert.deepEqual(staffDayNotesOf(rows).holidayShifts, [{ date: HOLIDAY, onHoliday: true }]);
});

// Thẻ Thu nhập của nhân sự (public/nhan-vien/thu-nhap.js): chỉ chữ của dòng nhỏ, số tiền là của máy chủ
function staffLines(data) {
  const dm = iso => `${iso.slice(8)}/${iso.slice(5, 7)}`;
  const NV = {
    actions: {},
    esc: v => String(v ?? ''),
    ic: () => '',
    S: { estimates: { [MONTH]: { status: 'ok', data } }, desktop: false },
    L: { dm, workdaysStdOf: () => 26, ITEM_LABEL: {} },
    fmtNum: n => Number(n).toLocaleString('vi-VN'),
    model: () => null
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../public/nhan-vien/thu-nhap.js'), 'utf8'), {
    window: { NV },
    console
  });
  return (NV.incomeSlipCard(MONTH).match(/<div class="nv-kv[\s\S]*?<\/div>/g) || []).map(text);
}

test('thẻ Thu nhập: "Tiền ngày công" ghi kèm ngày lễ có lương; "OT ngày lễ" ghi cả ca bắt đầu hôm trước', () => {
  const rows = [
    { date: '2026-10-19', kind: 'work', holWork: true, holWorkH: 6 },
    { ...holidayRow(), otH: 0, otPay: 0 }
  ];
  const data = {
    m: { count: 1, off: DAILY, holiday: 1 },
    net: { net: 1 },
    trace: { tienNgayCong: 461538, ngayDiLam: 1, tienLamLe: 813462 },
    ...staffDayNotesOf(rows)
  };
  const lines = staffLines(data);
  assert.ok(
    lines.includes('Tiền ngày công 1 trên 26 ngày công chuẩn · kể cả lương 1 ngày lễ 461.538'),
    lines.join('\n')
  );
  assert.ok(lines.includes('OT ngày lễ ca 19/10 sang ngày lễ, 20/10 813.462'), lines.join('\n'));
  // Phản hồi không có ghi chú của máy chủ: vẫn ghi ngày lễ có lương theo số đếm của tháng
  const old = staffLines({ m: data.m, net: data.net, trace: data.trace });
  assert.ok(old.includes('Tiền ngày công 1 trên 26 ngày công chuẩn · kể cả lương 1 ngày lễ 461.538'), old.join('\n'));
});
