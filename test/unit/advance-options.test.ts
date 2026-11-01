'use strict';
// Số tạm ứng và các khoá phương án của nó. Tạm ứng = advance.rate × cơ sở (lương cơ bản thực nhận của các ngày đi làm từ ngày 1 đến ngày
// advance.untilDay, advance.basis = byWorkedDays; hoặc lương cơ bản của bậc khi fixedPctByLevel). Số theo quy tắc luôn có ở trace.tamUngToiDa;
// chỉ khi Admin đã duyệt tạm ứng của người đó (input.advanceApproved) thì net.advance bằng số này và bị trừ vào thực lĩnh, chưa duyệt thì 0.
// Ca s20261015-00018: NV bậc 3 (lương cơ bản 7.000.000), 9 ngày đi làm từ ngày 1 đến ngày 15 nên cơ sở = 9 × 7.000.000 ÷ 26.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runGolden, DEFAULTS } = require('../helpers/pay-oracle');

const NV3 = 's20261015-00018';
const BASE = (9 * 7000000) / 26;
const approve = (input?) => {
  input.advanceApproved = true;
};
const asCtv = async (input?) => {
  input.staff.type = 'ctv';
  await approve(input);
};

test('chưa duyệt: net.advance 0, số theo quy tắc vẫn có ở trace.tamUngToiDa; duyệt rồi: net.advance bằng số đó và thực lĩnh giảm đúng bấy nhiêu', async () => {
  const open = (await runGolden(NV3)).m;
  const approved = (await runGolden(NV3, {}, approve)).m;
  assert.equal(open.net.advance, 0);
  assert.equal(open.trace.tamUngToiDa, Math.round(0.8 * BASE));
  assert.equal(open.trace.tamUngToiDa, 1938462);
  assert.equal(approved.net.advance, 1938462);
  assert.equal(approved.trace.tamUngToiDa, open.trace.tamUngToiDa);
  assert.equal(open.net.net - approved.net.net, 1938462);
});

test('advance.rate đổi số tạm ứng: 0,5 cho 1.211.538 (= 0,5 × 7.000.000 × 9 ÷ 26), thực lĩnh tăng đúng phần chênh', async () => {
  const full = (await runGolden(NV3, {}, approve)).m;
  const half = (await runGolden(NV3, { 'advance.rate': 0.5 }, approve)).m;
  assert.equal(half.net.advance, Math.round(0.5 * BASE));
  assert.equal(half.net.advance, 1211538);
  assert.equal(half.net.net - full.net.net, 1938462 - 1211538);
});

test('advance.eligibleTypes.nv = false: tạm ứng của NV bằng 0 và thực lĩnh tăng đúng bằng số tạm ứng; chức vụ khác giữ nguyên', async () => {
  const before = (await runGolden(NV3, {}, approve)).m;
  const off = (await runGolden(NV3, { 'advance.eligibleTypes.nv': false }, approve)).m;
  assert.equal(before.net.advance, 1938462);
  assert.equal(off.net.advance, 0);
  assert.equal(off.trace.tamUngToiDa, 0);
  assert.equal(off.net.net - before.net.net, 1938462);
  assert.equal(
    (await runGolden(NV3, { 'advance.eligibleTypes.nv': false }, asCtv)).m.net.advance,
    (await runGolden(NV3, {}, asCtv)).m.net.advance
  );
});

test('advance.basis = fixedPctByLevel: tạm ứng = 80 % × lương cơ bản của bậc (7.000.000 → 5.600.000), không phụ thuộc ngày làm; mặc định theo ngày đi làm', async () => {
  assert.equal(DEFAULTS['advance.basis'], 'byWorkedDays');
  assert.equal((await runGolden(NV3, { 'advance.basis': 'fixedPctByLevel' }, approve)).m.net.advance, 5600000);
  assert.equal((await runGolden(NV3, { 'advance.basis': 'byWorkedDays' }, approve)).m.net.advance, 1938462);
});
