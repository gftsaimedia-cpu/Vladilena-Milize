'use strict';
// Phiếu lương của giao diện Admin v4 (public/admin/view-phieu.js → Phieu.figures / effective / modelOf / pageOf) chạy trong vm không DOM.
// Số tiền của phiếu lấy từ BẢN CHỤP của lần tính (ở đây: kết quả calcMonth của bộ máy dùng chung); view-phieu.js chỉ gom vào đúng dòng của mẫu.
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const PayrollEngine = require('../../public/payroll-engine.js');
const { DEFAULTS } = require('../helpers/defaults-old-basis.js');

const engine = PayrollEngine.create(DEFAULTS);
const HOURLY = 6000000 / 26 / 8;
const DAILY = 6000000 / 26;

// Giao diện tối thiểu mà view-phieu.js đọc khi nạp: esc (giống public/admin/core.js), ic, actions, nhãn loại
function loadPhieu() {
  const context = vm.createContext({
    console,
    Intl,
    Date,
    Math,
    Number,
    String,
    Array,
    Object,
    Set,
    Map,
    WeakMap,
    JSON
  });
  context.window = context;
  context.PayrollEngine = PayrollEngine;
  context.PayrollParams = { DEFAULTS };
  context.Admin = {
    esc: value =>
      String(value ?? '').replace(
        /[&<>"']/g,
        c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
      ),
    ic: () => '',
    actions: {},
    TYPE_SHORT: { tts: 'TTS', ctv: 'CTV', nv: 'NV' },
    TYPE_LONG: { tts: 'Thực tập sinh', ctv: 'Chuyên trách viên', nv: 'Nhân viên' },
    fmtStamp: iso => String(iso)
  };
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../../public/admin/view-phieu.js'), 'utf8'), context, {
    filename: 'view-phieu.js'
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../../public/admin/phieu-co-dien.js'), 'utf8'), context, {
    filename: 'phieu-co-dien.js'
  });
  return context.Admin.Phieu;
}
const Phieu = loadPhieu();

const work = (tin, tout, extra = {}) => ({ kind: 'work', in: tin, out: tout, ...extra });
const nvStaff = { type: 'nv', level: 1, nightPct: 40, shiftCode: 'n1', name: 'Người thử', username: 'qa_slip' };
const clone = value => JSON.parse(JSON.stringify(value));
// Bản chụp như máy chủ lưu: kết quả calcMonth (đã có net) + điều khoản nhân sự
function snapshotOf(staff, days, holidays, mk, kpi = null) {
  const m = engine.calcMonth(staff, days, kpi, holidays, mk, null);
  return {
    snapshot: clone(m),
    staffTerms: {
      name: staff.name || 'Người thử',
      type: staff.type,
      level: staff.level,
      nightPct: staff.nightPct,
      jobTitle: staff.jobTitle || '',
      startDate: staff.startDate || null
    }
  };
}
const figuresOf = async (staff, days, holidays, mk, kpi) => {
  const p = await snapshotOf(staff, days, holidays, mk, kpi);
  return { p, m: p.snapshot, fig: Phieu.figures(p, mk, DEFAULTS, null, holidays) };
};
const N = v => Math.round(v).toLocaleString('en-US');
// Ô của một dòng phiếu theo nhãn (mẫu: <td class="..">Nhãn</td> rồi các ô số)
const slipRow = (markup, label) =>
  new RegExp(`<td class="[^"]*">${label.replace(/[()/.]/g, '\\$&')}</td>((?:<td[^>]*>[^<]*</td>)*)`).exec(
    markup
  )?.[1] || '';
const cellsOf = cells => [...cells.matchAll(/<td[^>]*>([^<]*)<\/td>/g)].map(x => x[1]);
// `paid`: các số chi trả máy chủ gửi trên phiếu (gross, insurance, tax, advance, net, overridden...); thiếu thì phiếu như bản ước tính
const pageFor = async (staff, days, holidays, mk, values = {}, kpi = null, paid = {}) => {
  const p = await snapshotOf(staff, days, holidays, mk, kpi);
  const model = Phieu.modelOf(
    { payslip: { ...p, ...paid, username: staff.username, name: staff.name } },
    mk,
    DEFAULTS,
    values,
    holidays
  );
  return { model, markup: Phieu.pageOf(model), m: p.snapshot };
};
// Tổng các dòng thu nhập trên phiếu: ô thu nhập cộng, đi trễ/về sớm trừ, thêm phần làm bù ngày lễ trả thêm
const INCOME = [
  'workBase',
  'leavePay',
  'settlePay',
  'isatPay',
  'holidayPay',
  'otPay',
  'attendance',
  'travel',
  'flexPay',
  'breakPay',
  'nightPay',
  'kpiPay'
];
const lineSum = fig =>
  INCOME.reduce((s, k) => s + fig.auto[k], 0) - fig.auto.lateCut + (fig.auto.makeupHolPremium || 0);

/* ================= các dòng phiếu cộng đúng tổng lương ================= */
test('Phiếu: các dòng thu nhập cộng đúng m.total ở các tháng điển hình (ca đêm lễ + OT, nghỉ sẽ làm bù + làm bù, phép + iSAT + nghỉ không lương)', async () => {
  const night = work('22:00', '07:00');
  const cases = [
    {
      mk: '2026-10',
      holidays: ['2026-10-07'],
      days: { '2026-10-06': night, '2026-10-08': { ...night, extraKind: 'ot', extraOut: '09:00' } }
    },
    {
      mk: '2026-09',
      holidays: [],
      days: {
        '2026-09-07': work('08:00', '14:00'),
        '2026-09-08': { kind: 'willmakeup' },
        '2026-09-09': work('08:00', '17:00', { extraKind: 'makeup', extraOut: '21:00' })
      }
    },
    {
      mk: '2026-09',
      holidays: [],
      days: {
        '2026-09-07': { kind: 'leave' },
        '2026-09-12': { kind: 'isat' },
        '2026-09-14': work('13:00', '22:00'),
        '2026-09-15': { kind: 'unpaid' }
      }
    }
  ];
  for (const [i, c] of cases.entries()) {
    const { m, fig } = await figuresOf(nvStaff, c.days, c.holidays, c.mk, { pct: 80, amt: 6000000 });
    assert.ok(fig, `ca ${i}: có phiếu`);
    assert.ok(Math.abs(lineSum(fig) - m.total) < 1, `ca ${i}: các dòng ${lineSum(fig)} khác m.total ${m.total}`);
    const eff = Phieu.effective(fig, {}, null);
    assert.equal(eff.total, m.net.gross, `ca ${i}: không sửa gì thì giữ đúng số của máy chủ`);
    assert.equal(eff.net, m.net.net);
    assert.equal(eff.touched, false);
  }
});

/* ================= làm bù ngày lễ trả thêm ================= */
const HOL = ['2026-10-07'];
// 05/10 đi làm thiếu giờ (chưa bù); 06/10 ca 15:00–22:00, làm bù đến 01:00 sáng 07/10 (ngày lễ), hệ số ngày lễ ×3
const makeupDays = lateOut => ({
  '2026-10-05': work('08:00', lateOut),
  '2026-10-06': work('15:00', '22:00', { extraKind: 'makeup', extraOut: '01:00', makeupHolRate: 3 })
});

test('Phiếu: làm bù đêm sang ngày lễ ×3, thiếu 1 giờ ngày 05/10: có dòng trả thêm riêng 57.692 ₫, các dòng cộng đúng m.total = 934.616 ₫', async () => {
  const { m, fig } = await figuresOf(nvStaff, makeupDays('16:00'), HOL, '2026-10');
  assert.ok(m.makeupHolPremium > 0);
  assert.equal(Math.round(m.total), 934616);
  assert.equal(Math.round(lineSum(fig)), 934616, `các dòng phiếu cộng ra ${lineSum(fig)}`);
  assert.equal(fig.f.makeupHolPremium, m.makeupHolPremium);
  assert.ok(Math.abs(m.makeupHolPremium - 1 * HOURLY * 2) < 1e-6, `${m.makeupHolPremium}`); // 1 giờ ngày lễ × (3 − 1)
  assert.ok(fig.f.lateCut >= 0, 'đi trễ/về sớm không âm');
});

test('Phiếu: biến thể thiếu 30 phút (vào 08:30) vẫn cộng đúng m.total', async () => {
  const days = { ...makeupDays('17:00'), '2026-10-05': work('08:30', '17:00') };
  const { m, fig } = await figuresOf(nvStaff, days, HOL, '2026-10');
  assert.ok(Math.abs(lineSum(fig) - m.total) < 1, `${lineSum(fig)} vs ${m.total}`);
});

test('Phiếu: không làm bù ngày lễ thì phần trả thêm bằng 0, không có dòng "Làm bù ngày lễ (trả thêm)", các dòng cũ không đổi', async () => {
  const days = {
    '2026-10-05': work('08:00', '14:00'),
    '2026-10-06': work('08:00', '17:00', { extraKind: 'makeup', extraOut: '20:00' })
  };
  const { m, fig } = await figuresOf(nvStaff, days, [], '2026-10');
  assert.equal(m.makeupHolPremium, 0);
  assert.equal(fig.f.makeupHolPremium, 0);
  assert.ok(Math.abs(lineSum(fig) - m.total) < 1);
  const { markup } = await pageFor(nvStaff, days, [], '2026-10');
  assert.doesNotMatch(markup, /Làm bù ngày lễ \(trả thêm\)/);
});

test('Phiếu: làm bù ngày lễ không có dòng riêng: phần trả thêm 57.692 ₫ nằm trong ô Làm thêm giờ, và TỔNG LƯƠNG bằng m.total', async () => {
  const { markup, m } = await pageFor(nvStaff, makeupDays('16:00'), HOL, '2026-10');
  const { fig } = await figuresOf(nvStaff, makeupDays('16:00'), HOL, '2026-10');
  assert.doesNotMatch(markup, /Làm bù ngày lễ (trả thêm)/);
  assert.ok(fig.auto.otPay >= m.makeupHolPremium - 1e-6, 'ô Làm thêm giờ đã gồm phần trả thêm');
  assert.match(slipRow(markup, 'TỔNG LƯƠNG'), new RegExp(`>${N(m.total)}<`));
});

/* ================= OT 2.0 / OT 3.0 trên phiếu ================= */
const T13_DAYS = { '2026-10-07': work('22:00', '07:00', { extraKind: 'ot', extraOut: '11:00', preset: 'g2' }) };
const T13_HOL = ['2026-10-08'];

test('T1-3: phiếu ghi OT 2.0 = 0 giờ, OT 3.0 = 11 giờ (7 giờ ca chính + 4 giờ OT lễ), tiền OT gộp 1.055.769 ₫, các dòng cộng đúng m.total', async () => {
  const { markup, m, model } = await pageFor(nvStaff, T13_DAYS, T13_HOL, '2026-10');
  assert.equal(m.otHours, 0, 'OT rơi vào ngày lễ không vào OT ngày thường');
  assert.equal(m.holWorkHours, 11, 'OT ngày lễ = 7 giờ ca chính + 4 giờ OT');
  assert.deepEqual(cellsOf(slipRow(markup, 'OT 2.0')), ['0'], 'OT 2.0 = 0 giờ');
  assert.deepEqual(cellsOf(slipRow(markup, 'OT 3.0')), ['11'], 'OT 3.0 = 7 giờ ca chính + 4 giờ OT lễ');
  assert.match(slipRow(markup, 'OT 1.5'), />1,055,769</, 'ô tiền OT gộp OT và làm lễ');
  assert.equal(model.fig.f.ot20H, 0);
  assert.equal(model.fig.f.ot30H, 11);
  assert.equal(model.fig.f.makeupHolPremium, 0);
  assert.ok(Math.abs(lineSum(model.fig) - m.total) < 1);
  assert.match(slipRow(markup, 'TỔNG LƯƠNG'), new RegExp(`>${N(m.total)}<`));
  assert.doesNotMatch(markup, /NaN|undefined/);
});

test('T1-3: OT không chạm ngày lễ ghi vào OT 1.5 (4 giờ), OT 2.0 và OT 3.0 trống (0)', async () => {
  const { markup } = await pageFor(nvStaff, T13_DAYS, [], '2026-10');
  assert.deepEqual(cellsOf(slipRow(markup, 'OT 1.5')).slice(0, 1), ['4']);
  assert.deepEqual(cellsOf(slipRow(markup, 'OT 2.0')), ['0']);
  assert.deepEqual(cellsOf(slipRow(markup, 'OT 3.0')), ['0']);
});

test('Phiếu cổ điển: tiền nghỉ ca đêm dùng phụ trội riêng, không dùng phụ cấp Night 40%', async () => {
  const { model, m } = await pageFor(nvStaff, { '2026-10-06': work('22:00', '07:00') }, [], '2026-10');
  const markup = Phieu.classicSheet(model);
  assert.equal(model.fig.f.rates.nightOne, 0.4);
  assert.equal(model.fig.f.rates.breakPremium, DEFAULTS['night.breakPremium']);
  assert.ok(Math.abs(m.breakPay - HOURLY * 1.3) < 1e-6);
  assert.ok(!markup.includes('40% phụ cấp'));
});

/* ================= mẫu phiếu, tiêu đề, vị trí ================= */
test('Phiếu in theo mẫu công ty: tiêu đề, logo, các dòng phụ cấp, TỔNG LƯƠNG đến THỰC LĨNH, chỗ ký; giờ làm lễ nằm ở OT 3.0 (7 giờ), tiền gộp 709.615, nghỉ lễ ghi ngày 7/10', async () => {
  const { markup } = await pageFor(nvStaff, { '2026-10-06': work('22:00', '07:00') }, HOL, '2026-10');
  for (const text of [
    /BẢNG CHI TIẾT LƯƠNG NHÂN VIÊN/,
    /Tháng 10\.2026 \(từ ngày 1\/10 đến ngày 31\/10\)/,
    /slip\/gft-logo\.png/,
    /slip\/gft-watermark\.png/,
    /slip\/gft-slogan\.png/,
    /Công chuẩn tính lương theo quy chế: 26/,
    /TỔNG LƯƠNG/,
    /TỔNG CÁC KHOẢN MIỄN THUẾ/,
    /THU NHẬP SAU BH BẮT BUỘC/,
    /THỰC LĨNH/,
    /<b>Người Nhận<\/b>/,
    /<i>\(Ký, ghi rõ họ tên\)<\/i>/,
    />Phụ cấp - Chuyên cần \(25% LCB\)</,
    />Phụ cấp – Đi lại \(15% LCB\)</,
    />Phụ cấp - Linh hoạt \(20% LCB\)</,
    />Phụ cấp - Off Paid \(Đêm\)</,
    />BONUS - 40% or 60% LCB \(Đêm\)</
  ])
    assert.match(markup, text);
  assert.match(slipRow(markup, 'OT 3.0'), />7</, 'bảy giờ làm ngày lễ');
  assert.match(slipRow(markup, 'OT 1.5'), /709,615/, 'ô tiền OT gộp tiền làm ngày lễ');
  assert.match(slipRow(markup, 'Nghỉ lễ hưởng lương (7/10)'), /230,769/, 'nghỉ lễ ghi kèm ngày');
  assert.doesNotMatch(markup, /NaN|undefined/);
});

test('Phiếu: ngày bắt đầu của kỳ là ngày 1, hoặc ngày vào làm nếu vào làm trong tháng đó', async () => {
  const day = { '2026-09-08': work('08:00', '17:00') };
  assert.match((await pageFor(nvStaff, day, [], '2026-09')).markup, /\(từ ngày 1\/9 đến ngày 30\/9\)/);
  const later = { ...nvStaff, startDate: '2026-09-15' };
  assert.match(
    (await pageFor(later, day, [], '2026-09')).markup,
    /\(từ ngày 15\/9 đến ngày 30\/9\)/,
    'ngày vào làm muộn hơn thì thắng'
  );
  assert.match(
    (await pageFor({ ...nvStaff, startDate: '2026-01-05' }, day, [], '2026-09')).markup,
    /\(từ ngày 1\/9 đến ngày 30\/9\)/,
    'vào làm tháng khác không đổi kỳ'
  );
});

test('Phiếu: vị trí công việc là chức danh Admin nhập (đã escape), để trống thì là tên nhóm · tên level', async () => {
  const day = { '2026-09-07': work('08:00', '17:00') };
  const c1 = { type: 'ctv', level: 1, username: 'c1', name: 'CTV', shiftCode: 'n1', jobTitle: '15. NV C&B <x>' };
  assert.match(
    (await pageFor(c1, day, [], '2026-09')).markup,
    /<tr class="hd">.*<td class="">15\. NV C&amp;B &lt;x&gt;<\/td><\/tr>/
  );
  assert.match(
    (await pageFor({ ...c1, jobTitle: '' }, day, [], '2026-09')).markup,
    /<tr class="hd">.*<td class="">CTV · Fresher<\/td><\/tr>/
  );
  const bad = (await pageFor({ ...c1, name: '<img src=x onerror=alert(1)>' }, day, [], '2026-09')).markup;
  assert.doesNotMatch(bad, /<img src=x/, 'tên nhân sự đi qua esc() (N1)');
});

test('Phiếu: chỉ giờ thiếu chưa bù mới bị trừ ở dòng "Đi trễ/Về sớm/Ra ngoài": bù đủ thì 0 giờ, tiền trừ giữ nguyên −86.538 ₫ vì giờ bù trả riêng ở ô Làm thêm giờ; bù thiếu 1 giờ thì 1 giờ', async () => {
  const slip = makeupOut =>
    pageFor(
      nvStaff,
      {
        '2026-09-07': work('08:00', '14:00'),
        '2026-09-08': work('08:00', '17:00', { extraKind: 'makeup', extraOut: makeupOut })
      },
      [],
      '2026-09'
    );
  const full = await slip('20:00');
  assert.equal(full.m.short, 3);
  assert.equal(full.m.debt, 0);
  assert.doesNotMatch(full.markup, /thiếu/);
  assert.match(
    slipRow(full.markup, 'Đi trễ/Về sớm/Ra ngoài'),
    /^<td class="r blue">0<\/td><td class="r blue">-86,538<\/td>$/
  );
  const partial = await slip('19:00');
  assert.equal(partial.m.short, 3);
  assert.equal(partial.m.debt, 1);
  assert.match(
    slipRow(partial.markup, 'Đi trễ/Về sớm/Ra ngoài'),
    /^<td class="r blue">1<\/td><td class="r blue">-86,538<\/td>$/,
    'giờ chưa bù còn 1; tiền trừ là cả 3 giờ thiếu'
  );
});

/* ================= số Admin sửa trên phiếu ================= */
// Thuế TNCN lũy tiến tính độc lập từ bảng bậc trong DEFAULTS (không gọi taxFrom của bộ máy)
function progressive(assessable) {
  let tax = 0,
    lower = 0;
  for (const [upper, rate] of DEFAULTS['tax.brackets']) {
    if (assessable <= lower) break;
    tax += (Math.min(assessable, upper ?? Infinity) - lower) * rate;
    lower = upper;
  }
  return Math.round(tax);
}
const SEP_DAYS = { '2026-09-07': work('08:00', '17:00'), '2026-09-08': work('08:00', '17:00') };
const longStaff = { ...nvStaff, username: 'w', name: 'Worker', contract: 'long', insured: true };

test('Admin sửa số trên phiếu: dòng tổng, thuế, thực lĩnh là SỐ CHI TRẢ do máy chủ gửi (trình duyệt không tính lại); ô đã sửa được đánh dấu', async () => {
  const values = { workBase: 30000000, advance: 0 };
  // máy chủ đã áp số sửa: tổng, thuế lũy tiến, thực lĩnh (tính độc lập ở đây từ bảng bậc, như máy chủ)
  const { m: base, model: auto } = await pageFor(longStaff, SEP_DAYS, [], '2026-09', values);
  const total = Math.round(base.total + 30000000 - auto.fig.auto.workBase);
  const insurance = base.net.insurance;
  const tax = progressive(total - base.net.exempt - insurance - base.net.deduction);
  assert.ok(tax > 0, 'thu nhập sau khi sửa vượt ngưỡng chịu thuế');
  const paid = {
    gross: total,
    insurance,
    tax,
    advance: 0,
    net: total - insurance - tax,
    exempt: base.net.exempt,
    taxable: total - base.net.exempt,
    afterInsurance: total - insurance,
    overridden: true
  };
  const { markup, model } = await pageFor(longStaff, SEP_DAYS, [], '2026-09', values, null, paid);
  assert.equal(model.eff.total, total);
  assert.equal(model.eff.tax, tax, 'thuế là số của máy chủ');
  assert.equal(model.eff.advance, 0);
  assert.equal(model.eff.net, total - insurance - tax);
  assert.equal(model.eff.touched, true);
  assert.equal(model.eff.overridden, true);
  assert.match(slipRow(markup, 'Lương cơ bản'), /class="r blue ovr"[^>]*>30,000,000</, 'ô sửa được đánh dấu');
  assert.match(slipRow(markup, 'TỔNG LƯƠNG'), new RegExp(`>${N(total)}<`));
  assert.match(slipRow(markup, 'THUẾ TNCN'), new RegExp(`>${N(tax)}<`));
  assert.match(slipRow(markup, 'TẠM ỨNG'), /ovr[^>]*>0</);
  assert.match(slipRow(markup, 'THỰC LĨNH'), new RegExp(`>${N(total - insurance - tax)}<`));
  assert.doesNotMatch(markup, /NaN|undefined/);
});

test('Admin sửa số: số của máy chủ thắng ô sửa tay; máy chủ chưa gửi số chi trả thì phiếu đã sửa không đoán (null), chưa sửa thì giữ số bản chụp', async () => {
  const p = await snapshotOf(longStaff, SEP_DAYS, [], '2026-09');
  const fig = Phieu.figures(p, '2026-09', DEFAULTS, null, []);
  const paid = {
    gross: fig.n.gross,
    insurance: fig.n.insurance,
    tax: 123456,
    advance: fig.n.advance,
    net: 777777,
    overridden: true
  };
  const own = Phieu.effective(fig, { workBase: 30000000, tax: 123456 }, paid);
  assert.equal(own.tax, 123456);
  assert.equal(own.net, 777777);
  // máy chủ chưa gửi số chi trả: đã sửa ô thì không có tổng/thuế/thực lĩnh để hiện (không tính lại ở trình duyệt)
  const guess = Phieu.effective(fig, { workBase: 30000000 }, null);
  assert.equal(guess.touched, true);
  assert.equal(guess.tax, null);
  assert.equal(guess.net, null);
  assert.equal(guess.total, null);
  // chưa sửa ô nào: giữ số của bản chụp
  const none = Phieu.effective(fig, {}, null);
  assert.equal(none.touched, false);
  assert.equal(none.tax, fig.n.tax);
  assert.equal(none.net, fig.n.net);
});

test('Phiếu: lương KPI tính theo % và đề xuất KPI trong bản chụp; người không có KPI (TTS) có kpiAmt 0 và không có % KPI', async () => {
  const kpiStaff = { ...nvStaff };
  const withKpi = await figuresOf(kpiStaff, SEP_DAYS, [], '2026-09', { pct: 80, amt: 6000000 });
  assert.equal(Math.round(withKpi.fig.auto.kpiPay), Math.round(0.8 * 6000000));
  assert.equal(withKpi.fig.auto.kpiAmt, 6000000);
  assert.equal(withKpi.fig.auto.kpiPct, 80);
  const intern = await figuresOf({ type: 'tts', level: 1, username: 'i', name: 'I' }, SEP_DAYS, [], '2026-09', null);
  assert.equal(intern.fig.auto.kpiAmt, 0);
  assert.equal(intern.fig.auto.kpiPct, 0);
  assert.equal(intern.fig.auto.leaveLeft, 0, 'TTS không có phép năm');
  // dưới mốc đạt thì lương KPI bằng 0
  const low = await figuresOf(kpiStaff, SEP_DAYS, [], '2026-09', { pct: 60, amt: 7000000 });
  assert.equal(low.fig.auto.kpiPay, 0);
});

test('Phiếu: bản chụp thiếu net hoặc rows thì không dựng phiếu (null), không ném lỗi', () => {
  assert.equal(Phieu.figures(null, '2026-09', DEFAULTS, null, []), null);
  assert.equal(Phieu.figures({ snapshot: {}, staffTerms: {} }, '2026-09', DEFAULTS, null, []), null);
});
