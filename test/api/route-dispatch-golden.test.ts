'use strict';
// Lưới an toàn cho cách chia route của máy chủ:
// mọi khoá ROUTE_CAPS × {chưa đăng nhập, nhân sự, Admin} cùng các đường dẫn lạ phải cho đúng mã HTTP, mã lỗi, thông báo lỗi và hình dạng
// phản hồi như bảng vàng đã ghi. Hành vi đổi có chủ đích (thêm route, đổi thông báo) thì ghi lại bảng:
//   node test/tools/record-dispatch.ts --write
// Kịch bản và cách ghi nằm ở test/tools/record-dispatch.ts (chạy dưới PostgreSQL runner).
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const dispatch = require('../tools/record-dispatch');
const authz = require('../../src/platform/authz');

let recorded, golden;
before(async () => {
  recorded = JSON.parse(JSON.stringify(await dispatch.record())); // qua JSON như bản lưu: bỏ khoá undefined
  golden = await dispatch.load();
});

test('bảng vàng điều phối: kịch bản phủ MỌI khoá của ROUTE_CAPS (route mới phải có kịch bản)', () => {
  const gaps = dispatch.coverageGaps(recorded);
  assert.deepEqual(gaps.uncovered, [], 'khoá ROUTE_CAPS chưa có kịch bản trong test/tools/record-dispatch.ts');
  assert.deepEqual(gaps.unknown, [], 'kịch bản (không phải đường dẫn lạ) chạm khoá không có trong ROUTE_CAPS');
});

test('bảng vàng điều phối: mọi ô của mọi kịch bản khớp bảng đã ghi (mã HTTP, mã lỗi, thông báo, hình dạng)', () => {
  const problems = dispatch.diff(golden, recorded);
  assert.equal(
    problems.length,
    0,
    `${problems.length} chỗ lệch bảng vàng (đổi có chủ đích thì chạy node test/tools/record-dispatch.ts --write):\n` +
      problems.slice(0, 12).join('\n')
  );
});

test('bảng vàng điều phối: số khoá ROUTE_CAPS trong bảng bằng số khoá hiện có và có ba loại người dùng', () => {
  assert.equal(golden.meta.routeKeys, Object.keys(authz.ROUTE_CAPS).length);
  assert.deepEqual(golden.meta.identities, ['anon', 'staff', 'admin']);
  assert.ok(golden.scenarios.length >= 150, 'bảng quá nhỏ: bị cắt bớt?');
});

test('bảng vàng điều phối: chưa đăng nhập luôn nhận 401 ở route cần đăng nhập, không bao giờ 200 (trừ route công khai)', () => {
  const publicKeys = Object.keys(authz.ROUTE_CAPS).filter(key => authz.ROUTE_CAPS[key].public);
  for (const scenario of recorded.scenarios) {
    if (!scenario.results.anon || publicKeys.includes(scenario.key)) continue;
    assert.equal(scenario.results.anon.status, 401, `${scenario.id}: chưa đăng nhập phải 401`);
  }
});

test('bảng vàng điều phối: nhân sự không gọi được route cần năng lực Admin (403) và không đọc được lịch của người khác', () => {
  for (const scenario of recorded.scenarios) {
    const policy = authz.ROUTE_CAPS[scenario.key];
    const cell = scenario.results.staff;
    if (!cell || !policy || !policy.cap || policy.cap.startsWith('self-or:')) continue;
    assert.equal(cell.status, 403, `${scenario.id}: nhân sự phải 403`);
    assert.equal(cell.code, 'FORBIDDEN_CAP', `${scenario.id}: mã lỗi`);
  }
  const other = recorded.scenarios.find(s => s.id.includes('user=qa_nv2') && s.method === 'GET');
  assert.equal(other.results.staff.status, 403);
  assert.equal(other.results.admin.status, 200);
});

test('bảng vàng điều phối: kết quả không chứa tên người thử (chỉ khoá, kiểu và thông báo lỗi)', () => {
  const results = JSON.stringify(golden.scenarios.map(scenario => scenario.results));
  assert.ok(!/Người thử|Quản trị thử|Người mới thử/.test(results), 'lộ tên trong kết quả');
});

test('bảng vàng điều phối: so sánh bắt được đổi mã HTTP, đổi thông báo lỗi và kịch bản bị bỏ (kiểm chính công cụ)', () => {
  const tampered = JSON.parse(JSON.stringify(golden));
  tampered.scenarios[0].results.admin.status += 1;
  const withError = tampered.scenarios.slice(10).find(s => s.results.staff && s.results.staff.error);
  withError.results.staff.error += ' (đã sửa)';
  tampered.scenarios.pop();
  const problems = dispatch.diff(tampered, golden); // so với chính bảng vàng: không phụ thuộc mã đang sửa dở
  assert.equal(problems.length, 3, problems.join('\n'));
});
