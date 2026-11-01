'use strict';
// Đường ghi cài đặt, nhóm CẢNH BÁO: các trường hợp dưới đây vẫn lưu (200) và trả cảnh báo trong phản hồi và nhật ký:
//   - giá trị dưới sàn luật mức cứng: PARAM_BELOW_LEGAL_FLOOR;
//   - giá trị dưới sàn mềm: PARAM_FLOOR_ACK_REQUIRED (không cần acknowledge);
//   - tháng hiệu lực đã chốt công, duyệt hoặc chi trả: PERIOD_LOCKED;
//   - lý do và căn cứ văn bản không bắt buộc; lý do quá 300 ký tự vẫn là 400 REASON_REQUIRED.
// Lỗi thật (không lưu gì) ở settings-save-failures.test.ts. Dòng param_versions chỉ-thêm-dòng nên mỗi test dùng tháng riêng.
const S = require('../helpers/settings-api');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { F, store } = S;
const monthOf = S.monthPool();

before(F.start);
after(F.stop);

const ACCOUNT = {
  staff: 'qa_plain',
  hr: 'qa_nv2',
  manager: 'qa_tts1',
  accounting: 'qa_ctv1',
  cb: 'qa_nv1',
  admin: 'admin'
};
async function setup(month?) {
  await S.seed(month);
  await F.person('qa_plain', 'staff', { type: 'nv', level: 1, startDate: '2026-01-05' });
  for (const role of ['hr', 'manager', 'accounting', 'cb']) await S.grant(ACCOUNT[role], role);
  await S.setMode('defaults-only');
}
const codesOf = (res?) => (res.data.warnings || []).map(w => w.code);
const savedValue = async (key?, month?) => {
  const rows = (await S.paramRows()).filter(r => r.key === key && r.effective_month === month);
  return rows.length ? JSON.parse((await rows.at(-1)).value_json) : undefined;
};

test(
  'R1 warn: giá trị dưới sàn luật mức cứng vẫn lưu, kèm cảnh báo PARAM_BELOW_LEGAL_FLOOR ở phản hồi và nhật ký',
  S.readyWith(S.hardFloorKey(), 'khoá có sàn luật mức hard'),
  async () => {
    const M = monthOf();
    await setup(M);
    const found = await S.hardFloorKey();
    const res = await S.saveChanges([{ key: found.key, value: found.value }], { month: M });
    assert.equal(res.status, 200, JSON.stringify(res.data).slice(0, 400));
    assert.ok(codesOf(res).includes('PARAM_BELOW_LEGAL_FLOOR'), JSON.stringify(res.data.warnings));
    assert.equal(await savedValue(found.key, M), found.value, 'giá trị dưới sàn được lưu đúng như nhập');
    const audit = (await S.auditRows('param.set')).filter(r => r.entity_id === found.key);
    assert.ok((await audit.at(-1)).after.warnings.includes('PARAM_BELOW_LEGAL_FLOOR'), 'nhật ký ghi mã cảnh báo');
  }
);

test(
  'R1 warn: giá trị dưới sàn mềm vẫn lưu không cần acknowledge, kèm cảnh báo PARAM_FLOOR_ACK_REQUIRED; acknowledge gửi kèm không đổi kết quả',
  S.readyWith(S.softFloorKey(), 'khoá có sàn mềm (cảnh báo)'),
  async () => {
    const M = monthOf();
    await setup(M);
    const found = await S.softFloorKey();
    let other: any = null;
    for (let skip = 1; skip < 12 && !other; skip += 1) {
      const next = await S.softFloorKey(skip);
      if (next && next.key !== found.key) other = next;
    }
    const missing = await S.saveChanges([{ key: found.key, value: found.value }], { month: M });
    assert.equal(missing.status, 200, JSON.stringify(missing.data).slice(0, 400));
    assert.ok(codesOf(missing).includes('PARAM_FLOOR_ACK_REQUIRED'), JSON.stringify(missing.data.warnings));
    assert.equal(await savedValue(found.key, M), found.value);
    if (!other) return;
    const acked = await S.saveChanges([{ key: other.key, value: other.value }], {
      month: M,
      extra: { acknowledge: [{ key: other.key, code: 'PARAM_FLOOR_ACK_REQUIRED' }] }
    });
    assert.equal(acked.status, 200, JSON.stringify(acked.data).slice(0, 400));
    assert.ok(codesOf(acked).includes('PARAM_FLOOR_ACK_REQUIRED'));
    assert.equal(await savedValue(other.key, M), other.value);
  }
);

test(
  'R1 warn: lý do không bắt buộc (thiếu, rỗng, ngắn, không phải chuỗi đều lưu); quá 300 ký tự là 400 REASON_REQUIRED và không lưu gì',
  S.READY,
  async () => {
    const M = monthOf();
    await setup(M);
    const base = await S.adminKey();
    for (const reason of [undefined, null, '', '   ', 'ngắn', 12345678901, {}]) {
      const [value] = await S.differing(base, M);
      const res = await S.saveChanges([{ key: base.key, value }], { month: M, reason });
      assert.equal(res.status, 200, `reason=${JSON.stringify(reason)}: ${JSON.stringify(res.data).slice(0, 300)}`);
      assert.equal(await savedValue(base.key, M), value);
    }
    const rows = await S.rowCount();
    const [value] = await S.differing(base, M);
    const long = await S.saveChanges([{ key: base.key, value }], { month: M, reason: S.text(301) });
    assert.equal(long.status, 400, JSON.stringify(long.data).slice(0, 300));
    assert.equal(long.data.code, 'REASON_REQUIRED');
    assert.equal(await S.rowCount(), rows, 'không lưu dòng nào');
  }
);

test(
  'R1 warn: khoá nhóm pháp lý (Kế toán sửa) lưu được khi không ghi căn cứ văn bản',
  S.readyWith(S.accountingKey(), 'khoá editableBy accounting'),
  async () => {
    const M = monthOf();
    await setup(M);
    const found = await S.accountingKey();
    const values = [found.value, found.value + 1, found.value + 2];
    for (const [i, basis] of [undefined, '', '   '].entries()) {
      const res = await S.saveChanges([{ key: found.key, value: values[i] }], {
        month: M,
        extra: { basis },
        who: 'admin'
      });
      assert.equal(res.status, 200, `basis=${JSON.stringify(basis)}: ${JSON.stringify(res.data).slice(0, 300)}`);
    }
    assert.equal(await savedValue(found.key, M), values[2]);
  }
);

test(
  'R1 warn: tháng hiệu lực đã chốt công vẫn lưu, kèm cảnh báo PERIOD_LOCKED; tháng sai dạng vẫn là 400 BAD_MONTH',
  S.READY,
  async () => {
    await S.setupMonth('2026-10', 'calculated'); // tháng quản lý đầu tiên, đã chốt công
    await S.setMode('defaults-only');
    const base = await S.adminKey();
    const locked = await S.saveChanges([{ key: base.key, value: base.value }], { month: '2026-10' });
    assert.equal(locked.status, 200, JSON.stringify(locked.data).slice(0, 400));
    assert.ok(codesOf(locked).includes('PERIOD_LOCKED'), JSON.stringify(locked.data.warnings));
    assert.equal(await savedValue(base.key, '2026-10'), base.value);
    const rows = await S.rowCount();
    for (const month of ['2026-13', '2026-1', 'abc', 202611, '']) {
      const res = await S.saveChanges([{ key: base.key, value: base.value }], { month, expectedRev: 0 });
      assert.equal(res.status, 400, `month=${JSON.stringify(month)}: ${res.status}`);
      assert.equal(res.data.code, 'BAD_MONTH');
    }
    assert.equal(await S.rowCount(), rows, 'tháng sai dạng không lưu dòng nào');
  }
);

test(
  'R1 warn: kỳ khoá không theo thứ tự — tháng đã duyệt (B) khi tháng trước (A) còn mở vẫn lưu, kèm cảnh báo PERIOD_LOCKED',
  S.READY,
  async () => {
    const A = monthOf();
    const B = monthOf();
    await setup(A);
    await store.db.prepare("INSERT INTO payroll_periods (month, status, rev) VALUES (?, 'approved', 1)").run(B);
    const base = await S.adminKey();
    const res = await S.saveChanges([{ key: base.key, value: base.value }], { month: B, expectedRev: 0 });
    assert.equal(res.status, 200, JSON.stringify(res.data).slice(0, 400));
    assert.ok(codesOf(res).includes('PERIOD_LOCKED'), JSON.stringify(res.data.warnings));
    assert.equal(await savedValue(base.key, B), base.value);
  }
);

test(
  'R1 warn: một khoá có cảnh báo (sàn mềm) trong lô không cản cả lô; mọi khoá của lô đều được lưu',
  S.readyWith(S.softFloorKey() && S.adminKey(), 'khoá sàn mềm và khoá Admin sửa được'),
  async () => {
    const M = monthOf();
    await setup(M);
    const soft = await S.softFloorKey();
    const other = (await S.adminKeys()).find(k => k.key !== soft.key);
    if (!other) return;
    const [value] = await S.differing(other, M);
    const res = await S.saveChanges(
      [
        { key: other.key, value },
        { key: soft.key, value: soft.value }
      ],
      { month: M }
    );
    assert.equal(res.status, 200, JSON.stringify(res.data).slice(0, 400));
    assert.equal(res.data.saved.length, 2);
    assert.ok(codesOf(res).includes('PARAM_FLOOR_ACK_REQUIRED'));
    assert.equal(await savedValue(other.key, M), value);
    assert.equal(await savedValue(soft.key, M), soft.value);
  }
);
