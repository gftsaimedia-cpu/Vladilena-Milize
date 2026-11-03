'use strict';
// src/platform/warnings.ts:
//   warnIf(code, violated, opts)    ghi cảnh báo khi vi phạm rồi chạy tiếp; trả true khi vi phạm
//   run(fn) / warn / take / codes   danh sách cảnh báo của MỘT yêu cầu; ngoài yêu cầu thì không có nơi nhận
//   optionalReason()                lý do không bắt buộc; quá 300 ký tự vẫn 400
//   src/platform/http.ts → send              gộp warnings vào phản hồi 2xx dạng đối tượng; lỗi thì bỏ
require('../helpers/require-isolated-database');
process.env.SESSION_SECRET = 'warnings-unit-tests';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const warnings = require('../../src/platform/warnings');
const { send } = require('../../src/platform/http');

// res giả: gom mã HTTP và thân đã gửi
const fakeRes = () => {
  const out: Record<string, any> = { status: null, body: null };
  return Object.assign(out, {
    writeHead: (status?) => (out.status = status),
    end: (data?) => (out.body = JSON.parse(data))
  });
};

test('warnIf: không ném, trả true khi vi phạm; cảnh báo vào danh sách của yêu cầu với mã và câu tiếng Việt; không vi phạm thì không ghi gì', () => {
  warnings.run(() => {
    assert.equal(warnings.warnIf('A', false, { message: 'không ghi' }), false);
    assert.equal(
      warnings.warnIf('PENDING_APPROVALS', true, {
        message: 'Còn 3 khoản chờ duyệt của tháng 10/2026.',
        count: 3,
        link: 'approvals'
      }),
      true
    );
    assert.equal(
      warnings.warnIf('PAYSLIP_NEGATIVE_NET', true, {
        message: () => 'Thực lĩnh âm: qa_nv1 -1.200.000 ₫',
        severity: 'danger'
      }),
      true
    );
    const list = warnings.take();
    assert.equal(list.length, 2);
    assert.equal(list[0].code, 'PENDING_APPROVALS');
    assert.equal(list[0].message, 'Còn 3 khoản chờ duyệt của tháng 10/2026.');
    assert.equal(list[0].count, 3);
    assert.equal(list[0].link, 'approvals');
    assert.equal(list[1].severity, 'danger');
    assert.deepEqual(warnings.codes(), ['PENDING_APPROVALS', 'PAYSLIP_NEGATIVE_NET']);
  });
});

test('warnIf: consequence nối sau message thành một câu; quiet chỉ trả true, không ghi', () => {
  warnings.run(() => {
    warnings.warnIf('A', true, { message: 'Tháng 10: vượt trần.', consequence: 'Tiền không đổi.' });
    assert.equal(warnings.warnIf('B', true, { message: 'im lặng', quiet: true }), true);
    assert.deepEqual(
      warnings.take().map(w => [w.code, w.message]),
      [['A', 'Tháng 10: vượt trần. Tiền không đổi.']]
    );
  });
});

test('warnIf: câu cảnh báo dạng hàm chỉ được gọi khi vi phạm (không tốn công dựng câu khi hợp lệ)', () => {
  let calls = 0;
  const message = () => (calls++, 'câu');
  warnings.run(() => {
    warnings.warnIf('A', false, { message });
    assert.equal(calls, 0);
    warnings.warnIf('A', true, { message });
    assert.equal(calls, 1);
  });
});

test('selfDecision: tự làm việc về chính mình chỉ cảnh báo SELF_DECISION_FORBIDDEN, người khác làm thì không', () => {
  warnings.run(() => {
    assert.equal(warnings.selfDecision(false, { doing: 'duyệt phiếu lương' }), false);
    assert.equal(warnings.selfDecision(true, { doing: 'duyệt phiếu lương' }), true);
    const [w] = warnings.take();
    assert.equal(w.code, 'SELF_DECISION_FORBIDDEN');
    assert.match(w.message, /duyệt phiếu lương của chính mình/);
  });
});

test('danh sách cảnh báo: mỗi yêu cầu một danh sách riêng; trùng mã và câu chỉ giữ một; có trần số cảnh báo; take trả bản sao; ngoài yêu cầu thì warn không làm gì', () => {
  warnings.run(() => {
    warnings.warn('A', 'cùng câu');
    warnings.warn('A', 'cùng câu');
    warnings.warn('A', 'câu khác');
    assert.equal(warnings.take().length, 2, 'trùng mã và câu chỉ giữ một');
    for (let i = 0; i < 200; i++) warnings.warn('LOT', `dòng ${i}`);
    assert.ok(warnings.take().length <= 60, `có trần: ${warnings.take().length}`);
    const copy = warnings.take();
    copy.length = 0;
    assert.ok(warnings.take().length > 0, 'take trả bản sao');
  });
  warnings.run(() => assert.deepEqual(warnings.take(), [], 'yêu cầu mới bắt đầu từ danh sách rỗng'));
  // ngoài yêu cầu HTTP (script, test gọi thẳng)
  assert.doesNotThrow(() => warnings.warn('A', 'không có nơi nhận'));
  assert.deepEqual(warnings.take(), []);
  assert.equal(warnings.warnIf('A', true, { message: 'x' }), true, 'ngoài yêu cầu: không ném');
});

test('optionalReason: nhận lý do rỗng, thiếu, ngắn; trả chuỗi đã cắt; quá 300 ký tự là lỗi dữ liệu 400', () => {
  assert.equal(warnings.optionalReason('  đủ dài ở hai đầu có dấu cách  '), 'đủ dài ở hai đầu có dấu cách');
  assert.throws(
    () => warnings.optionalReason('x'.repeat(301)),
    error => error.status === 400
  );
  assert.equal(warnings.optionalReason('x'.repeat(300)).length, 300, 'đúng 300 ký tự được nhận');
  for (const value of [undefined, null, '', '   ', 'ngắn', 123, {}])
    assert.equal(typeof warnings.optionalReason(value), 'string', JSON.stringify(value));
  assert.equal(warnings.optionalReason(undefined), '');
});

test('send: phản hồi 2xx dạng đối tượng mang warnings của yêu cầu; mảng, 4xx và 5xx thì không; không có cảnh báo thì thân giữ nguyên', () => {
  warnings.run(() => {
    warnings.warn('PERIOD_LOCKED', 'Kỳ đã chốt công, cần tính lại.');
    const ok = fakeRes();
    send(ok, 200, { ok: true });
    assert.equal(ok.body.ok, true);
    assert.equal(ok.body.warnings.length, 1);
    assert.equal(ok.body.warnings[0].code, 'PERIOD_LOCKED');
    assert.equal(ok.body.warnings[0].message, 'Kỳ đã chốt công, cần tính lại.');
    const created = fakeRes();
    send(created, 201, { id: 1 });
    assert.equal(created.body.warnings.length, 1, '201 cũng mang');
    const list = fakeRes();
    send(list, 200, [1, 2]);
    assert.deepEqual(list.body, [1, 2], 'thân là mảng thì giữ nguyên');
    for (const status of [400, 403, 409, 500]) {
      const bad = fakeRes();
      send(bad, status, { error: 'lỗi' });
      assert.deepEqual(bad.body, { error: 'lỗi' }, `${status}: yêu cầu lỗi bỏ cảnh báo`);
    }
    const nothing = fakeRes();
    send(nothing, 200, null);
    assert.equal(nothing.body, null);
  });
  const clean = fakeRes();
  warnings.run(() => send(clean, 200, { ok: true }));
  assert.deepEqual(clean.body, { ok: true }, 'không có cảnh báo thì không thêm trường warnings');
});

test('send: thân đã có mảng warnings (PUT /settings/params) thì gộp, không lặp mã và câu', () => {
  warnings.run(() => {
    warnings.warn('PERIOD_LOCKED', 'Kỳ đã chốt công.');
    warnings.warn('B', 'câu mới');
    const res = fakeRes();
    send(res, 200, {
      ok: true,
      warnings: [
        { code: 'PERIOD_LOCKED', message: 'Kỳ đã chốt công.' },
        { code: 'PARAM_LATER_VERSION_EXISTS', message: 'có bản sau' }
      ]
    });
    assert.deepEqual(
      res.body.warnings.map(w => w.code),
      ['PERIOD_LOCKED', 'PARAM_LATER_VERSION_EXISTS', 'B']
    );
  });
});
