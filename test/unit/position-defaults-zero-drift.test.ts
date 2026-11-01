'use strict';
// Chức vụ là dữ liệu: ba chức vụ mặc định (tts, ctv, nv) và bản sao của chúng (cùng bảng cờ quyền lợi, cùng bậc) cho CÙNG số tiền từng bit.
// Gồm: bảng cờ quyền lợi mặc định = hành vi hiện hành; 300 ca vàng và một bộ ca hạt cố định chạy với bản sao chức vụ bằng chạy với chức vụ gốc;
// bộ máy chịu được chức vụ sao chép; mã loại lạ không bao giờ rơi về `tts`.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Engine, DEFAULTS, LEGACY_DEFAULTS, golden, clone, runGolden } = require('../helpers/pay-oracle');
const { payrollEngineDifferential, digest } = require('../helpers/payroll-differential');

const NV1 = 'known-kpi-five-100-90-80-85-100';
const NV3 = 's20261015-00018';

// Cờ quyền lợi của ba chức vụ mặc định: ĐÚNG hành vi ghi cứng trong khối TYPES của test/fixtures/legacy-payroll-block.js:
// TTS không OT, không KPI, không nghỉ lễ và phép năm hưởng lương (làm bù thứ Bảy thì có); TTS không khai nghỉ;
// "Nghỉ được duyệt" và iSAT chỉ NV; TTS không có tài khoản phép và không cần ngày bắt đầu làm; TTS hợp đồng ngắn.
const FLAGS = {
  tts: {
    ot: false,
    makeup: true,
    kpi: false,
    paidHoliday: false,
    paidLeave: false,
    isat: false,
    absenceDeclarable: false,
    approvedLeave: false,
    leaveAccount: false,
    startDateRequired: false,
    defaultContract: 'short'
  },
  ctv: {
    ot: true,
    makeup: true,
    kpi: true,
    paidHoliday: true,
    paidLeave: true,
    isat: false,
    absenceDeclarable: true,
    approvedLeave: false,
    leaveAccount: true,
    startDateRequired: true,
    defaultContract: 'long'
  },
  nv: {
    ot: true,
    makeup: true,
    kpi: true,
    paidHoliday: true,
    paidLeave: true,
    isat: true,
    absenceDeclarable: true,
    approvedLeave: true,
    leaveAccount: true,
    startDateRequired: true,
    defaultContract: 'long'
  }
};
const keyOf = (position?, flag?) =>
  flag === 'startDateRequired' || flag === 'defaultContract'
    ? `type.${position}.${flag}`
    : `type.${position}.benefit.${flag}`;

test('position-defaults-zero-drift: ba chức vụ mặc định mang cờ quyền lợi đúng hành vi cứng hôm nay (OT, làm bù, KPI, khai nghỉ, nghỉ được duyệt, tài khoản phép, ngày bắt đầu, hợp đồng mặc định)', () => {
  for (const [position, flags] of Object.entries<any>(FLAGS))
    for (const [flag, expected] of Object.entries<any>(flags)) {
      const key = keyOf(position, flag);
      assert.ok(Object.hasOwn(DEFAULTS, key), `${key} phải có trong DEFAULTS`);
      assert.equal(DEFAULTS[key], expected, `${key}`);
    }
});

// Bản sao của ba chức vụ mặc định dưới mã qa_copy_<mã>: mọi khoá type.<mã>.* và level.<mã>.* chép sang, cộng khai báo position.def
const copyParams = () => {
  const over: Record<string, any> = {};
  for (const position of ['tts', 'ctv', 'nv']) {
    for (const [key, value] of Object.entries<any>(LEGACY_DEFAULTS)) {
      if (key.startsWith(`type.${position}.`))
        over[`type.qa_copy_${position}.${key.slice(`type.${position}.`.length)}`] = value;
      if (key.startsWith(`level.${position}.`))
        over[`level.qa_copy_${position}.${key.slice(`level.${position}.`.length)}`] = value;
    }
    over[`position.def.qa_copy_${position}`] = { label: 'Chức vụ thử', copiedFrom: position };
  }
  return { ...LEGACY_DEFAULTS, ...over };
};
const asCopy = (input?) => {
  const copy = clone(input);
  copy.staff.type = `qa_copy_${copy.staff.type}`;
  return copy;
};

test('position-defaults-zero-drift: 300 ca vàng chạy với bản sao chức vụ cho đúng từng bit như chạy với chức vụ gốc (cả ba chức vụ mặc định)', () => {
  const original = Engine.create(LEGACY_DEFAULTS);
  const copied = Engine.create(copyParams());
  const wrong = golden.cases.filter(
    c => digest(copied.computeMonth(asCopy(c.input))) !== digest(original.computeMonth(clone(c.input)))
  );
  assert.deepEqual(
    wrong.map(c => c.id),
    []
  );
});

test('position-defaults-zero-drift: 600 ca hạt cố định chạy với bản sao chức vụ bằng chạy với chức vụ gốc từng bit (so sánh kép)', () => {
  const original = Engine.create(LEGACY_DEFAULTS);
  const copied = Engine.create(copyParams());
  payrollEngineDifferential(input => copied.computeMonth(asCopy(input)), {
    cases: 600,
    seed: 20261016,
    label: 'position-defaults-zero-drift',
    reference: (input?) => original.computeMonth(input)
  });
});

test('position-defaults-zero-drift: nhân của bộ máy có entitlementOf(staff, hậu tố): ghi đè theo chức vụ thắng, không có thì lấy giá trị toàn cục, ba chức vụ mặc định cho cùng số như đọc thẳng khoá cũ', () => {
  const kernel = Engine.kernelFor(DEFAULTS);
  const of = kernel.entitlementOf || Engine.create(DEFAULTS).entitlementOf;
  assert.equal(typeof of, 'function', 'entitlementOf(staff, key) trong nhân hoặc ở create(params)');
  // ba chức vụ mặc định: cùng giá trị như đọc thẳng type.<mã>.<hậu tố>
  for (const position of ['tts', 'ctv', 'nv'])
    for (const suffix of ['travel', 'attendance', 'maxAbsent'])
      assert.equal(
        Object.is(of({ type: position, level: 1 }, suffix), DEFAULTS[`type.${position}.${suffix}`]),
        true,
        `${position}.${suffix}`
      );
  // ghi đè theo chức vụ thắng giá trị toàn cục; null là kế thừa
  const over = Engine.kernelFor({ ...DEFAULTS, 'type.nv.ot.rate': 2.5 });
  const ofOver = over.entitlementOf;
  assert.equal(ofOver({ type: 'nv', level: 1 }, 'ot.rate'), 2.5);
  assert.equal(ofOver({ type: 'ctv', level: 1 }, 'ot.rate'), DEFAULTS['ot.rate']);
});

test('position-copy: sao chép nv thành chức vụ thử (position.def + type.* + level.*) cho ĐÚNG số của nv (tạm ứng đã duyệt): tổng thu nhập 5.855.076, bảo hiểm 630.000, thuế 0, tạm ứng 184.615, thực lĩnh 5.040.461', async () => {
  const over = { 'position.def.qa_copy_nv': { label: 'Chức vụ thử', copiedFrom: 'nv' } };
  for (const [key, value] of Object.entries<any>(DEFAULTS)) {
    if (key.startsWith('type.nv.')) over[`type.qa_copy_nv.${key.slice('type.nv.'.length)}`] = value;
    if (key.startsWith('level.nv.')) over[`level.qa_copy_nv.${key.slice('level.nv.'.length)}`] = value;
  }
  const approve = (input?) => {
    input.advanceApproved = true;
  };
  const nv = (await runGolden(NV1, {}, approve)).m;
  const copy = (
    await runGolden(NV1, over, async input => {
      await approve(input);
      input.staff.type = 'qa_copy_nv';
    })
  ).m;
  for (const field of ['gross', 'insurance', 'tax', 'advance', 'net', 'employer'])
    assert.equal(copy.net[field], nv.net[field], field);
  assert.equal(copy.net.net, 5040461);
  assert.equal(Object.is(copy.total, nv.total), true);
  // mọi người của golden NV bậc 3 cũng khớp: sao chép là sao chép THẬT, không chỉ bậc 1
  const nv3 = (await runGolden(NV3, {}, approve)).m;
  const copy3 = (
    await runGolden(NV3, over, async input => {
      await approve(input);
      input.staff.type = 'qa_copy_nv';
    })
  ).m;
  assert.equal(copy3.net.net, nv3.net.net);
});

test('position-copy: mã loại nhân sự lạ không bao giờ rơi về tts: bộ máy ném PAYROLL_BAD_TYPE (không tính ra tiền của TTS)', async () => {
  for (const type of ['xyz', 'NV', '', 'tts ']) {
    await assert.rejects(
      async () =>
        runGolden(NV1, {}, input => {
          input.staff.type = type;
        }),
      error => error.code === 'PAYROLL_BAD_TYPE',
      JSON.stringify(type)
    );
  }
});
