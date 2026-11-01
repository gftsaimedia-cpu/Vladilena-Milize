'use strict';
// Quét tự động khoá muộn: bản chụp tham số của kỳ chạy trước một đợt phát hành thiếu các khoá mới, và bộ máy đọc khoá bắt buộc bằng need()
// nên ném PARAM_MISSING nếu khoá mới không nằm trong PayrollParams.LATE_KEYS (fillLate điền mặc định). Test lấy danh sách khoá của DEFAULTS tại commit e01ecbb
// (test/fixtures/params-keys-e01ecbb.json), bỏ MỌI khoá thêm sau đó khỏi bộ tham số hiện tại, rồi tính các đầu vào của 300 ca vàng:
// phải ra đúng từng đồng và đúng dấu vân tay như bộ máy chạy bộ tham số đầy đủ (khoá thiếu đọc bằng giá trị mặc định).
// Thêm khoá mới mà bộ máy đọc bắt buộc mà quên LATE_KEYS thì test này đỏ và nêu tên khoá.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Engine = require('../../src/engine/payroll-engine');
const Params = require('../../src/engine/payroll-params');
const { readGolden, summarize } = require('../helpers/golden');

const OLD_KEYS = new Set<any>(
  JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures/params-keys-e01ecbb.json'), 'utf8'))
);
const golden = readGolden();
const clone = (value?) => JSON.parse(JSON.stringify(value));
// Hai khoá bộ máy đọc không bắt buộc: thiếu trong bản chụp cũ thì tính đúng cách lúc chụp (src/engine/payroll-engine.ts: BY_ASSIGNED, paidBreakH),
// nên bản đối chiếu đặt hai khoá này bằng cách hiểu khi thiếu: phụ cấp ca theo giờ có mặt ('present'), giờ nghỉ đêm của TTS vẫn trả (true).
const MISSING_READS_AS = Object.freeze({ 'shift.allowance.basis': 'present', 'type.tts.benefit.breakPay': true });

test('khoá muộn: mọi khoá thêm từ e01ecbb thiếu khỏi bản chụp cũ thì fillLate điền đủ, 300 ca vàng ra đúng từng đồng như bộ tham số đầy đủ', () => {
  const added = Object.keys(Params.DEFAULTS).filter(key => !OLD_KEYS.has(key));
  assert.ok(added.length > 0, 'có khoá thêm sau e01ecbb');
  const old = Object.fromEntries(Object.entries<any>(Params.DEFAULTS).filter(([key]: any) => OLD_KEYS.has(key)));
  const engine = Engine.create(old);
  const full = Engine.create({ ...Params.DEFAULTS, ...MISSING_READS_AS });
  const broken: any[] = [];
  for (const c of golden.cases) {
    try {
      assert.deepStrictEqual(
        summarize(engine.computeMonth(clone(c.input))),
        summarize(full.computeMonth(clone(c.input)))
      );
    } catch (error) {
      broken.push(`${c.id}: ${String(error.message).split('\n')[0].slice(0, 100)}`);
    }
  }
  assert.deepEqual(broken.slice(0, 5), [], `${broken.length} ca hỏng vì khoá thêm sau e01ecbb chưa có trong LATE_KEYS`);
});

test('khoá muộn: LATE_KEYS chỉ chứa khoá có trong DEFAULTS và không trùng', () => {
  const keys = Params.LATE_KEYS;
  assert.equal(new Set<any>(keys).size, keys.length, 'không trùng');
  for (const key of keys) assert.ok(Object.hasOwn(Params.DEFAULTS, key), `${key} không có trong DEFAULTS`);
});

test('khoá muộn: tám khoá request.type.<mục>.countsAbsent nằm trong LATE_KEYS (mặc định true = hành vi cũ)', () => {
  const keys = Object.keys(Params.DEFAULTS).filter(key => /^request\.type\..+\.countsAbsent$/.test(key));
  assert.equal(keys.length, 8);
  for (const key of keys) assert.ok(Params.LATE_KEYS.includes(key), key);
});
