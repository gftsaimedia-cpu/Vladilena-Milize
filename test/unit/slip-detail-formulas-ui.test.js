'use strict';
// Danh sách "Chi tiết" của hộp phiếu Admin (public/admin/view-phieu.js → mount) in công thức payslip.formulas của máy chủ
// dưới nhãn dòng (chỉ in chuỗi, qua esc); bản in A4 và trang ngày của phiếu không có công thức.
process.env.DB_PATH = process.env.DB_PATH || ':memory:'; // lib/slip-paid.js nạp lib/db
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const PayrollEngine = require('../../public/payroll-engine.js');
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
const snapshot = () =>
  withDayFigures(
    PayrollEngine.create(DEFAULTS).computeMonth({
      staff: STAFF,
      days: DAYS,
      approvals: {},
      sessions: declaredPunches(STAFF, DAYS),
      kpi: { pct: null, amt: null, admPct: null, admAmt: null },
      holidays: [HOLIDAY],
      month: MONTH,
      upTo: null,
      asOf: `${MONTH}-28T09:00:00+07:00`
    }).m
  );

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
  fmtStamp: iso => String(iso),
  api: () => Promise.reject(new Error('offline')),
  loadStaff: async () => {},
  qs: o => `?${new URLSearchParams(o)}`,
  errText: e => String(e && e.message),
  note: html => `<div class="note">${html}</div>`,
  reasonField: () => ''
};
const context = vm.createContext({ console, window: { Admin } });
for (const file of ['view-phieu.js', 'phieu-a4.js', 'phieu-a4-days.js'])
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../../public/admin', file), 'utf8'), context, {
    filename: file
  });
const Phieu = Admin.Phieu;

const FORMULAS = {
  workBase: '6.000.000 đ ÷ 26 ngày chuẩn × 1 ngày công',
  holidayPay: '6.000.000 đ ÷ 26 ngày chuẩn × 1 ngày lễ',
  otPay: '2 giờ lễ × 28.846,15 đ/giờ × 3 + 2 giờ đêm lễ × 28.846,15 đ/giờ × 0,6',
  nightPay: '1 ca đêm × 230.769 đ/ngày × 40%',
  net: '1 + <b>2</b>'
};
const payslip = async () => ({
  username: STAFF.username,
  snapshot: await snapshot(),
  staffTerms: { ...STAFF, name: 'QA', contract: 'official' },
  formulas: FORMULAS
});

async function chiTiet(withFormulas) {
  const box = {
    innerHTML: '',
    isConnected: true,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {}
  };
  const dlg = { root: { querySelector: () => null }, error() {} };
  const p = await payslip();
  if (!withFormulas) delete p.formulas;
  await Phieu.mount(box, dlg, { res: { payslip: p, run: null }, month: MONTH, holidays: [HOLIDAY], canRead: false });
  return box.innerHTML;
}
const pairsOf = html =>
  [...html.matchAll(/<span>([^<]*)<small class="pl-fm">([^<]*)<\/small>/g)].map(x => `${x[1]} => ${x[2]}`);
const fmTexts = html => [...html.matchAll(/<small class="pl-fm">([^<]*)<\/small>/g)].map(x => x[1]);

test('Chi tiết: mỗi dòng có công thức của máy chủ in ngay dưới nhãn, chuỗi đi qua esc', async () => {
  const html = await chiTiet(true);
  const list = html.slice(html.indexOf('pl-list'));
  const got = fmTexts(list);
  assert.ok(got.includes('1 ca đêm × 230.769 đ/ngày × 40%'), `dòng phụ cấp ca có công thức: ${got.join(' | ')}`);
  assert.ok(got.includes('1 + &lt;b&gt;2&lt;/b&gt;'), 'chuỗi lạ được escape, không thành thẻ');
  assert.doesNotMatch(list, /<b>2<\/b>/);
  // công thức nằm trong ô nhãn (cột trái), không phải ô số
  assert.match(list, /<span>[^<]*<small class="pl-fm">/);
});

test('Chi tiết: dòng không có công thức thì không có dòng phụ; máy chủ không gửi formulas thì không có dòng nào', async () => {
  const none = await chiTiet(false);
  assert.equal(fmTexts(none).length, 0);
  assert.doesNotMatch(none, /pl-fm/);
  const some = await chiTiet(true);
  assert.deepEqual(
    pairsOf(some).map(x => x.split(' => ')[0]),
    ['Lương cơ bản theo ngày công', 'Tiền nghỉ lễ', 'Thưởng ca đêm', 'Thực nhận'],
    'chỉ dòng có công thức và có số mới in công thức, đúng thứ tự dòng'
  );
});

test('bản in A4 và trang ngày của phiếu không in công thức', async () => {
  const p = await payslip();
  const model = Phieu.modelOf({ payslip: p, run: null }, MONTH, { ...DEFAULTS }, {}, [HOLIDAY]);
  for (const html of [Phieu.pageOf(model), Phieu.daysSheet(model, {})]) {
    assert.doesNotMatch(html, /pl-fm/);
    for (const f of Object.values(FORMULAS)) assert.ok(!html.includes(esc(f)) && !html.includes(f), `không có "${f}"`);
  }
});

test('thẻ Thu nhập của nhân sự (nhan-vien/thu-nhap.js) không đọc payslip.formulas', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../public/nhan-vien/thu-nhap.js'), 'utf8');
  assert.doesNotMatch(src, /formulas|pl-fm/);
});
