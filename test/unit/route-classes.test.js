'use strict';
// Mọi khoá trong lib/ops/route-classes.js phải có thật trong ROUTE_CAPS; Check-in/out và đăng nhập không bao giờ nằm trong danh sách route nặng.
process.env.DB_PATH = ':memory:';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const authz = require('../../lib/authz');
const { HEAVY_ROUTES, UNLIMITED_WRITE_ROUTES } = require('../../lib/ops/route-classes');

test('mọi khoá route nặng và route không giới hạn ghi đều có chính sách quyền', () => {
  for (const key of [...HEAVY_ROUTES, ...UNLIMITED_WRITE_ROUTES])
    assert.ok(authz.policyOf(key), `thiếu trong ROUTE_CAPS: ${key}`);
});

test('route thiết yếu không bao giờ bị từ chối khi quá tải', () => {
  for (const key of [
    'POST /punch',
    'GET /punch',
    'GET /health',
    'GET /me',
    'GET /events',
    'POST /login',
    'POST /logout'
  ])
    assert.equal(HEAVY_ROUTES.has(key), false, key);
});
