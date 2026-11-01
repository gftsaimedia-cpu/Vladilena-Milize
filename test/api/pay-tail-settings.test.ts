'use strict';
// insurance-options và tax-options qua đường ghi cài đặt.
// Hai nhóm này do Kế toán (config.legal) sửa: căn cứ là tuỳ chọn (quá dài thì 400 BASIS_TOO_LONG), C&B (chỉ config.payroll) bị 403, phương án chưa có xác nhận
// của kế toán hoặc pháp chế bị 400 PARAM_OPTION_UNAVAILABLE, biểu thuế sai cấu trúc bị 400 và không lưu gì.
// Tất cả chạy trên DB tạm trong bộ nhớ của người bịa (qa_*); giá trị biểu thuế thêm vào chỉ là số GIẢ để thử.
const S = require('../helpers/settings-api');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { F, store } = S;
const monthOf = S.monthPool();

before(F.start);
after(F.stop);

const ACCOUNT = { accounting: 'qa_ctv1', cb: 'qa_nv1' };
async function setup(month?) {
  await S.seed(month);
  for (const role of ['accounting', 'cb']) await S.grant(ACCOUNT[role], role);
  await S.setMode('defaults-only');
}
const rowCount = async () => await S.rowCount();
const BASIS = 'Luật Bảo hiểm xã hội số 41/2024/QH15 (căn cứ thử)';
const accountant = async (month?, changes?, extra = { basis: BASIS }) =>
  await S.saveChanges(changes, { month, who: ACCOUNT.accounting, extra });

test(
  'GĐ3: Kế toán lưu được lựa chọn bảo hiểm và thuế có sẵn (kèm căn cứ), hiệu lực từ tháng áp dụng',
  { skip: S.READY.todo },
  async () => {
    const M = monthOf();
    await setup(M);
    const res = await accountant(M, [
      { key: 'insurance.base', value: 'withFlaggedAllowances' },
      { key: 'insurance.coverage.short', value: true }
    ]);
    assert.equal(res.status, 200, JSON.stringify(res.data).slice(0, 300));
    assert.deepEqual(
      res.data.saved.map(s => [s.key, s.value]),
      [
        ['insurance.base', 'withFlaggedAllowances'],
        ['insurance.coverage.short', true]
      ]
    );
    const view = (await S.paramsView(M)).data;
    assert.equal(S.valueOfKey(view, 'insurance.base'), 'withFlaggedAllowances');
  }
);

test(
  'GĐ3: căn cứ quá dài là 400 BASIS_TOO_LONG, C&B không có config.legal là 403, hai trường hợp không lưu gì; thiếu căn cứ thì vẫn lưu với căn cứ trống',
  { skip: S.READY.todo },
  async () => {
    const M = monthOf();
    await setup(M);
    const rows = await rowCount();
    const change = [{ key: 'tax.insurance.skipDays', value: 15 }];
    const tooLong = await accountant(M, change, { basis: 'x'.repeat(301) });
    assert.equal(tooLong.status, 400, JSON.stringify(tooLong.data).slice(0, 300));
    assert.equal(tooLong.data.code, 'BASIS_TOO_LONG');
    const byCb = await S.saveChanges(change, { month: M, who: ACCOUNT.cb, extra: { basis: BASIS } });
    assert.equal(byCb.status, 403, JSON.stringify(byCb.data).slice(0, 300));
    assert.equal(await rowCount(), rows, 'không dòng nào được thêm');
    const noBasis = await accountant(M, change, { basis: undefined });
    assert.equal(noBasis.status, 200, JSON.stringify(noBasis.data).slice(0, 300));
    assert.equal(await rowCount(), rows + 1, 'lưu một dòng, căn cứ trống');
  }
);

test(
  'GĐ3: phương án chưa có xác nhận của kế toán hoặc pháp chế là 400 PARAM_OPTION_UNAVAILABLE và không lưu gì',
  { skip: S.READY.todo },
  async () => {
    const M = monthOf();
    await setup(M);
    const rows = await rowCount();
    for (const [key, value] of [
      ['tax.method.long', 'flat'],
      ['tax.method.long', 'none'],
      ['tax.method.short', 'progressive'],
      ['tax.exempt.otMethod', 'byHours'],
      ['tax.arise.mode', 'custom'],
      ['insurance.floorMode', 'raiseToRegionMin'],
      ['insurance.base', 'insuranceAttr'],
      ['insurance.coverage.long', false]
    ]) {
      const res = await accountant(M, [{ key, value }]);
      assert.equal(res.status, 400, `${key}=${value}: ${JSON.stringify(res.data).slice(0, 200)}`);
      assert.equal(res.data.code, 'PARAM_OPTION_UNAVAILABLE', `${key}=${value}`);
    }
    assert.equal(await rowCount(), rows, 'không dòng nào được thêm');
  }
);

test(
  'GĐ3: biểu thuế mở cho Kế toán sửa (kèm căn cứ); biểu sai cấu trúc là 400 và không lưu gì',
  { skip: S.READY.todo },
  async () => {
    const M = monthOf();
    await setup(M);
    const rows = await rowCount();
    const bad = [
      [
        [10000000, 0.05],
        [5000000, 0.1],
        [null, 0.35]
      ], // trần không tăng dần
      [
        [10000000, 0.05],
        [30000000, 0.1]
      ], // bậc cuối có trần
      [
        [10000000, 1.5],
        [null, 0.35]
      ], // thuế suất trên 100 %
      []
    ];
    for (const value of bad) {
      const res = await accountant(M, [{ key: 'tax.brackets', value }], { basis: 'Luật thử' });
      assert.equal(res.status, 400, JSON.stringify(value));
      assert.equal(res.data.code, 'PARAM_INVALID_VALUE', JSON.stringify(value));
    }
    assert.equal(await rowCount(), rows, 'biểu sai không ghi gì');
    // Admin (config.payroll) không sửa được biểu thuế: chỉ Kế toán sửa, không cho C&B
    const byCb = await S.saveChanges([{ key: 'tax.brackets', value: [[null, 0.1]] }], {
      month: M,
      who: ACCOUNT.cb,
      extra: { basis: 'Luật thử' }
    });
    assert.equal(byCb.status, 403);
    // số GIẢ: thêm một bậc 33 % đến 200 triệu cho Kế toán (không phải mức luật)
    const ok = await accountant(
      M,
      [
        {
          key: 'tax.brackets',
          value: [
            [10000000, 0.05],
            [30000000, 0.1],
            [60000000, 0.2],
            [100000000, 0.3],
            [200000000, 0.33],
            [null, 0.35]
          ]
        }
      ],
      { basis: 'Luật thử' }
    );
    assert.equal(ok.status, 200, JSON.stringify(ok.data).slice(0, 300));
    assert.equal((await S.auditRows('param.set')).filter(r => r.entity_id === 'tax.brackets').length, 1, 'ghi nhật ký');
  }
);
