'use strict';

// Chỉ công cụ test dùng URL điều khiển; ứng dụng nhận DATABASE_URL của DB tạm riêng.
const invalid = () => new Error('Control database test không hợp lệ hoặc chưa được cấu hình.');
const fromRunner = process.env.TEST_PG_CONTROL_URL;
const legacy = process.env.PG_TEST_URL;
let control: URL;
try {
  control = new URL(fromRunner || legacy || '');
  if (fromRunner && legacy && new URL(fromRunner).toString() !== new URL(legacy).toString()) throw invalid();
} catch {
  throw invalid();
}
if (!['postgres:', 'postgresql:'].includes(control.protocol) || control.pathname !== '/luong_test_control')
  throw invalid();

export = { testControlUrl: fromRunner || legacy };
