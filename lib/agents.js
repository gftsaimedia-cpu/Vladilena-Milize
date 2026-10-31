'use strict';
// Công tắc Agents: settings.agents_enabled = '1' (bật) hoặc '0' (tắt, mặc định khi chưa có dòng).
// Tắt thì mọi route của Trợ lý AI trả 403 AGENTS_DISABLED và không làm gì (server.js gọi assertEnabled sau khi qua cổng quyền).
const store = require('./db');
const { HttpError } = require('./http');
const config = require('./config');

const SETTING_KEY = config.AGENTS_SETTING_KEY;
const ON = config.AGENTS_ON;
const OFF = config.AGENTS_OFF;

const enabled = () => store.getSetting(SETTING_KEY, OFF) === ON;
const set = value => store.setSetting(SETTING_KEY, value ? ON : OFF);
function assertEnabled() {
  if (!enabled()) throw new HttpError(403, 'Agents đang tắt', { code: 'AGENTS_DISABLED' });
}

module.exports = { SETTING_KEY, enabled, set, assertEnabled };
