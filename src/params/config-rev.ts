'use strict';
// Số phiên bản chung của cấu hình: một số nguyên tăng đều, lưu ở settings.config_rev (không đổi lược đồ).
// Tăng TRONG CÙNG giao dịch với mọi thay đổi cấu hình: ghi tham số, đổi params_mode, các route công tắc (checkin, geofence)
// và ngày lễ. Màn hình dùng để so khi nối lại kênh sự kiện (hello.configRev) và GET /api/settings/version.
const store = require('../platform/db');

const read = async () => {
  const value = await store.getSetting('config_rev', 0);
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
};
// Gọi bên trong store.transaction của thao tác; trả số mới
async function bump() {
  const next = (await read()) + 1;
  await store.setSetting('config_rev', next);
  return next;
}

// Lần chạy của máy chủ (đổi mỗi lần khởi động) và bản phát hành: màn hình so để biết có bản mới hoặc máy chủ vừa khởi động lại
const EPOCH = Date.now().toString(36);
const BUILD = require('../../package.json').version;
// GET /api/settings/version
const info = async () => ({ configRev: await read(), mode: await store.params.getMode(), epoch: EPOCH, build: BUILD });

export = { read, bump, info, EPOCH };
