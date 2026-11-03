'use strict';
// Vai trò tuỳ chỉnh: bảng khu vực (ma trận Không / Xem / Sửa), mã từ tên và bộ lọc năng lực của src/platform/authz.ts (không cần máy chủ).
require('../helpers/require-isolated-database');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const authz = require('../../src/platform/authz');
const roles = require('../../src/domain/roles/roles');

test('vai trò: mọi năng lực của hệ thống nằm trong một khu vực, một mục lẻ hoặc danh sách dành riêng cho Admin', () => {
  const covered = new Set<any>([
    ...roles.AREAS.flatMap(a => [...a.view, ...a.edit]),
    ...roles.EXTRAS.map(e => e.cap),
    ...authz.RESERVED_CAPS
  ]);
  assert.deepEqual(
    authz.CAPS.filter(c => !covered.has(c)),
    []
  );
  for (const cap of covered) assert.ok(authz.CAPS.includes(cap), `${cap} không phải năng lực của hệ thống`);
});

test('vai trò: năng lực dành riêng cho Admin là roles.manage, vai trò tuỳ chỉnh không bao giờ nhận được', () => {
  assert.deepEqual([...authz.RESERVED_CAPS], ['roles.manage']);
  assert.equal(authz.isGrantableCap('roles.manage'), false);
  assert.equal(authz.isGrantableCap('attendance.read'), true);
  // dữ liệu bị sửa tay vẫn bị lọc khi đọc
  assert.deepEqual(
    [...authz.customCapsOf({ caps: ['roles.manage', 'khong.co', 'report.read'], approvals: ['ot', 'lạ'] })],
    ['report.read', 'request.decide.ot']
  );
});

test('vai trò: levelsOf suy mức Không / Xem / Sửa từ tập năng lực', () => {
  assert.equal(roles.levelsOf(['profile.read', 'contract.read']).profile, 'view');
  assert.equal(roles.levelsOf(['profile.read', 'contract.read', 'profile.write', 'contract.write']).profile, 'edit');
  assert.equal(roles.levelsOf(['profile.read']).profile, 'none', 'thiếu một năng lực Xem thì chưa đủ mức Xem');
  assert.equal(roles.levelsOf(['kpi.score.write']).kpi, 'edit', 'KPI không có mức Xem riêng');
  assert.equal(roles.levelsOf([]).access, 'none');
  assert.equal(roles.levelsOf(authz.ROLE_CAPS.admin).pay, 'edit');
});

test('vai trò: mã tạo từ tên không dấu, chữ thường, gạch dưới; tên không có chữ thì không có mã', () => {
  assert.equal(roles.codeFromLabel('Trưởng nhóm Đào tạo'), 'truong_nhom_dao_tao');
  assert.equal(roles.codeFromLabel('  C&B  phụ  '), 'c_b_phu');
  assert.equal(roles.codeFromLabel('123'), null);
  assert.equal(roles.codeFromLabel('A'), null);
});

test('vai trò: loại yêu cầu duyệt được là các loại của ApprovalView trừ makeup_day (không còn dùng)', () => {
  assert.deepEqual(
    roles.APPROVAL_ITEMS.map(i => i.id).sort(),
    authz.DECIDE_ITEMS.filter(i => i !== 'makeup_day').sort()
  );
});
