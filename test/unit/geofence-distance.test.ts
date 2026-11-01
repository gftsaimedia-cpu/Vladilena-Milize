// Khoảng cách haversine dùng cho GPS check-in (PunchRules.distanceM): thử bằng các điểm đã biết.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const P = require('../../src/engine/punch');

const METERS_PER_DEGREE = (Math.PI / 180) * 6371000; // 1° cung lớn trên mặt cầu bán kính 6.371 km ≈ 111.195 m

test('GPS: hai điểm trùng nhau cách 0 m', () => {
  assert.equal(P.distanceM(10.7769, 106.7009, 10.7769, 106.7009), 0);
});

test('GPS: 1 độ vĩ tuyến ≈ 111.195 m, 1 độ kinh tuyến ở xích đạo cũng vậy', () => {
  assert.ok(Math.abs(P.distanceM(0, 0, 1, 0) - METERS_PER_DEGREE) < 0.5);
  assert.ok(Math.abs(P.distanceM(0, 0, 0, 1) - METERS_PER_DEGREE) < 0.5);
});

test('GPS: kinh tuyến co lại theo vĩ độ (ở 60° còn nửa)', () => {
  assert.ok(Math.abs(P.distanceM(60, 10, 60, 11) - METERS_PER_DEGREE / 2) < 60);
});

test('GPS: cách đúng 100 m về phía bắc cho ra 100 m (sai số dưới 0,1 m)', () => {
  const lat = 10.7769 + 100 / METERS_PER_DEGREE;
  assert.ok(Math.abs(P.distanceM(10.7769, 106.7009, lat, 106.7009) - 100) < 0.1);
});

test('GPS: đối xứng hai chiều; Hà Nội đến TP.HCM khoảng 1.137 km', () => {
  const a = P.distanceM(21.0285, 105.8542, 10.8231, 106.6297),
    b = P.distanceM(10.8231, 106.6297, 21.0285, 105.8542);
  assert.equal(a, b);
  assert.ok(Math.abs(a - 1137000) < 3000, `khoảng cách ${Math.round(a)} m`);
});

test('GPS: qua kinh tuyến 180° vẫn đi đường ngắn', () => {
  assert.ok(Math.abs(P.distanceM(0, 179.5, 0, -179.5) - METERS_PER_DEGREE) < 0.5);
});
