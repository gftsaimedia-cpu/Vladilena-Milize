'use strict';
// Bảng công của Admin: ngày "Nghỉ, sẽ làm bù" ghi rõ nghỉ ngày nào, bù những ngày nào; ngày dự kiến bù có ký hiệu riêng.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load() {
  const A = {
    esc: s => String(s),
    S: { month: '2026-10', me: { username: 'qa_admin' } },
    actions: {},
    fmtDM: ymd => `${ymd.slice(8)}/${ymd.slice(5, 7)}`
  };
  const window = { Admin: A, ApprovalView: {}, PayrollParams: { DEFAULTS: {} } };
  const file = path.join(__dirname, '..', '..', 'public', 'admin', 'cham-cong-khai.js');
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { window, document: {}, console });
  return A.CcKhai;
}

test('Bảng công: ngày nghỉ sẽ làm bù ghi nghỉ ngày nào, bù ngày nào, giờ nào; ngày bù có ký hiệu "bù"', () => {
  const khai = load();
  khai.index({
    month: '2026-10',
    rows: [
      {
        username: 'nv1',
        days: {
          '2026-10-06': {
            kind: 'willmakeup',
            makeupPlans: [
              { date: '2026-10-11', from: '08:00', to: '12:00' },
              { date: '2026-10-12', from: '13:00', to: '17:00' }
            ]
          }
        },
        approvals: { '2026-10-06': { status: 'pending' } }
      }
    ]
  });
  const leave = khai.mark('nv1', '2026-10-06');
  assert.equal(leave.st, 'pending');
  assert.match(leave.text, /nghỉ 06\/10, bù: 11\/10 08:00–12:00; 12\/10 13:00–17:00/);
  const makeup = khai.mark('nv1', '2026-10-12');
  assert.equal(makeup.key, 'planned');
  assert.equal(makeup.st, 'pending');
  assert.match(makeup.text, /13:00–17:00 cho ngày nghỉ 06\/10, chờ xử lý/);
  assert.equal(khai.mark('nv1', '2026-10-20'), null);
  assert.equal(khai.mark('nv2', '2026-10-12'), null);
});
