'use strict';
// public/admin/view-phieu.js → Phieu.effective khi Admin sửa một ô: thực lĩnh trên phiếu A4 và hộp xem trước là SỐ CHI TRẢ máy chủ gửi
// (đã gồm khoản TRỪ đã duyệt m.net.entriesDeduct); trình duyệt không tự tính lại thực lĩnh nên không thể bỏ khoản trừ.
// Ca: known-short-nv2-full-month + khoản trừ 300.000 sau thuế (thực lĩnh bộ máy 7.522.500); Admin "sửa" một ô về đúng giá trị tự tính.
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runGolden, caseOf, DEFAULTS } = require('../helpers/pay-oracle');

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
  context.PayrollEngine = require('../../public/payroll-engine.js');
  context.PayrollParams = { DEFAULTS };
  context.Admin = {
    esc: value => String(value ?? ''),
    ic: () => '',
    actions: {},
    TYPE_SHORT: { tts: 'TTS', ctv: 'CTV', nv: 'NV' },
    TYPE_LONG: { tts: 'Thực tập sinh', ctv: 'Chuyên trách viên', nv: 'Nhân viên' },
    fmtStamp: iso => String(iso)
  };
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../../public/admin/view-phieu.js'), 'utf8'), context, {
    filename: 'view-phieu.js'
  });
  return context.Admin.Phieu;
}
const Phieu = loadPhieu();

const ID = 'known-short-nv2-full-month';
const deduct = {
  id: 1,
  direction: 'deduct',
  amount: 300000,
  label: 'Hoàn tạm ứng văn phòng phẩm',
  slipLine: null,
  taxMode: null,
  taxCap: null,
  insuranceBase: null,
  flagsConfirmedBy: null
};
async function figuresWithDeduct() {
  const { m } = await runGolden(ID, {}, input => {
    input.entries = [deduct];
  });
  const input = caseOf(ID).input;
  const snapshot = JSON.parse(JSON.stringify(m));
  const staffTerms = {
    name: 'Người thử',
    type: input.staff.type,
    level: input.staff.level,
    nightPct: input.staff.nightPct,
    jobTitle: '',
    startDate: input.staff.startDate
  };
  return { m, fig: Phieu.figures({ snapshot, staffTerms }, input.month, DEFAULTS, null, input.holidays) };
}

test('slip-entries-override: chưa sửa ô nào thì thực lĩnh trên phiếu bằng bộ máy (7.522.500, đã trừ khoản 300.000)', async () => {
  const { m, fig } = await figuresWithDeduct();
  assert.equal(m.net.entriesDeduct, 300000);
  assert.equal(m.net.net, 7522500);
  assert.equal(Phieu.effective(fig, {}, null).net, 7522500);
});

test('slip-entries-override: Admin sửa một ô về ĐÚNG giá trị tự tính thì thực lĩnh vẫn là 7.522.500 (không được bỏ khoản trừ 300.000)', async () => {
  const { m, fig } = await figuresWithDeduct();
  // số chi trả máy chủ gửi trên phiếu sau khi áp số sửa (ở đây bằng số tự tính của bộ máy, đã trừ khoản 300.000)
  const paid = {
    gross: m.net.gross,
    insurance: m.net.insurance,
    tax: m.net.tax,
    advance: m.net.advance,
    net: m.net.net,
    overridden: true
  };
  const touched = Phieu.effective(fig, { travel: fig.auto.travel }, paid);
  assert.equal(touched.touched, true);
  assert.equal(touched.net, m.net.net, `phiếu hiện ${touched.net} thay vì ${m.net.net}`);
  assert.equal(touched.net, 7522500);
  // máy chủ chưa gửi số chi trả: trình duyệt không đoán thực lĩnh (không tự tính lại, nên không thể bỏ khoản trừ)
  assert.equal(Phieu.effective(fig, { travel: fig.auto.travel }, null).net, null);
});
