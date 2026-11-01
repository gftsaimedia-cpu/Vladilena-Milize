'use strict';
// Ngân sách cỡ file: file mã mới không được vượt 1.200 dòng; file đã vượt từ trước
// nằm trong test/fixtures/file-size-budget.json với trần chỉ được giảm. 801 đến 1.200 dòng chỉ được báo (mềm).
// Hạ trần sau khi chia file: node test/tools/size-budget.ts --write
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { measure, load, tight } = require('../tools/size-budget');

const budget = load();
const sizes = measure();

test('ngân sách cỡ file: ngưỡng mềm 800, cứng 1.200 như thiết kế', () => {
  assert.equal(budget.soft, 800);
  assert.equal(budget.hard, 1200);
  assert.ok(Object.keys(sizes).length > 100, 'quét thiếu file?');
  assert.ok('src/platform/db.ts' in sizes);
});

test('ngân sách cỡ file: không file mã nào vượt 1.200 dòng trừ file trong danh sách ngoại lệ', t => {
  const over = Object.entries<any>(sizes)
    .filter(([rel, lines]: any) => lines > budget.hard && !(rel in budget.exceptions))
    .map(([rel, lines]: any) => `${rel}: ${lines} dòng`);
  assert.deepEqual(over, [], 'file mới vượt 1.200 dòng: chia nhỏ (đừng thêm vào danh sách ngoại lệ)');
  const soft = Object.entries<any>(sizes)
    .filter(([rel, lines]: any) => lines > budget.soft && lines <= budget.hard && !(rel in budget.exceptions))
    .map(([rel, lines]: any) => `${rel} ${lines}`);
  if (soft.length) t.diagnostic(`trên ngưỡng mềm ${budget.soft} (chỉ báo): ${soft.join(', ')}`);
});

test('ngân sách cỡ file: file ngoại lệ không phình quá trần đã ghi (trần chỉ được giảm)', () => {
  const grown = Object.entries<any>(budget.exceptions)
    .filter(([rel, ceiling]: any) => sizes[rel] > ceiling)
    .map(([rel, ceiling]: any) => `${rel}: ${sizes[rel]} dòng > trần ${ceiling}`);
  assert.deepEqual(
    grown,
    [],
    'đừng nâng trần: đưa mã mới vào file khác. Đang chia file thì chạy size-budget.js --write --allow-growth và ghi lý do'
  );
});

test('ngân sách cỡ file: ngoại lệ còn đúng thực tế (file đã bỏ, đổi tên hay co lại dưới 1.200 phải rút khỏi danh sách, trần phải hạ theo)', () => {
  const stale: any[] = [];
  for (const [rel, ceiling] of Object.entries<any>(budget.exceptions)) {
    if (!(rel in sizes)) stale.push(`${rel}: file không còn, xoá khỏi danh sách`);
    else if (sizes[rel] <= budget.hard)
      stale.push(`${rel}: còn ${sizes[rel]} dòng (<= ${budget.hard}), xoá khỏi danh sách`);
    else if (ceiling - tight(sizes[rel]) >= 300)
      stale.push(`${rel}: ${sizes[rel]} dòng mà trần còn ${ceiling}, hạ trần`);
  }
  assert.deepEqual(stale, [], 'chạy: node test/tools/size-budget.ts --write');
});
