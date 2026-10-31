# Cấu hình kỹ thuật và biến môi trường

> Sinh tự động bởi `scripts/docs/gen-spec.js` (`npm run spec:gen`) từ `lib/config.js` và các chỗ đọc `process.env` trong `lib/`, `src/`, `server.js`. Đừng sửa tay: `test/unit/spec-reference.test.js` so sánh file này với bản dựng từ mã.

## Hằng số có tên (`lib/config.js`, 71)

| Tên | Giá trị |
| --- | --- |
| `AGENTS_OFF` | `"0"` |
| `AGENTS_ON` | `"1"` |
| `AGENTS_SETTING_KEY` | `"agents_enabled"` |
| `APPROVAL_MAX_DECIDE_ITEMS` | `200` |
| `ATTR_MAX_PER_CLASS` | `20` |
| `AUDIT_PAGE_DEFAULT` | `50` |
| `AUDIT_PAGE_MAX` | `200` |
| `BLOCK_CONFIRM_MARK_MAX` | `128` |
| `BLOCK_LABEL_MAX` | `40` |
| `CATALOG_BASE_MONTH` | `"2000-01"` |
| `CATALOG_ROW_ID_BASE` | `1099511627776` |
| `CHECKOUT_GRACE_MIN` | `30` |
| `COMPUTE_CACHE_MAX_ENTRIES` | `64` |
| `COMPUTE_CACHE_TTL_MS` | `15000` |
| `DB_BUSY_TIMEOUT_MS` | `5000` |
| `ENTRIES_LABEL_MAX` | `80` |
| `ENTRIES_MAX_AMOUNT` | `100000000000` |
| `ENTRIES_MAX_PER_BATCH` | `200` |
| `ENTRIES_REQUIRE_APPROVAL` | `true` |
| `ERROR_ECHO_CODE_MAX` | `20` |
| `ERROR_ECHO_FIELD_MAX` | `40` |
| `ERROR_ECHO_KEY_MAX` | `60` |
| `EVENTS_HEARTBEAT_SEC` | `25` |
| `EVENTS_MAX_BACKLOG_BYTES` | `262144` |
| `EVENTS_MAX_PER_USER` | `5` |
| `EVENTS_MAX_TOTAL` | `3000` |
| `EVENTS_RETRY_MS` | `3000` |
| `HOLIDAY_NAME_MAX` | `60` |
| `HTTP_GZIP_MIN_BYTES` | `1024` |
| `HTTP_HEADERS_TIMEOUT_MS` | `66000` |
| `HTTP_KEEP_ALIVE_MS` | `65000` |
| `HTTP_REQUEST_TIMEOUT_MS` | `30000` |
| `LEAVE_REFRESH_MS` | `3600000` |
| `LOGIN_MAX_FAILURES` | `5` |
| `LOGIN_MAX_KEYS` | `5000` |
| `LOGIN_SPRAY_USERS` | `30` |
| `LOGIN_WINDOW_MIN` | `15` |
| `LOOP_LAG_RESOLUTION_MS` | `20` |
| `LOOP_LAG_WINDOW_MS` | `5000` |
| `OVERLOAD_RETRY_AFTER_SEC` | `3` |
| `PARAMS_MAX_CHANGES` | `50` |
| `PARAMS_PREVIEW_MAX_PEOPLE` | `50` |
| `PASSWORD_HASH_CONCURRENCY` | `4` |
| `PASSWORD_HASH_QUEUE_MAX` | `200` |
| `PASSWORD_MIN_LENGTH` | `6` |
| `PAYSLIP_PAGE_DEFAULT` | `50` |
| `PAYSLIP_PAGE_MAX` | `200` |
| `POSITION_CODE_MAX` | `16` |
| `POSITION_CODE_MIN` | `2` |
| `POSITION_LABEL_MAX` | `40` |
| `POSITION_SHORT_MAX` | `8` |
| `PUNCH_REQUEST_KEEP_DAYS` | `30` |
| `PUNCH_REQUEST_PURGE_MS` | `86400000` |
| `REASON_MAX` | `300` |
| `REASON_MIN` | `10` |
| `ROLES_CUSTOM_MAX` | `30` |
| `ROLE_CODE_MAX` | `32` |
| `ROLE_LABEL_MAX` | `40` |
| `SESSION_DAYS` | `14` |
| `SHED_MAX_INFLIGHT` | `150` |
| `SHED_MAX_LAG_MS` | `150` |
| `SHUTDOWN_GRACE_MS` | `10000` |
| `SQL_IN_CHUNK` | `500` |
| `STAFF_BULK_MAX` | `200` |
| `STATIC_CACHE_MAX_BYTES` | `2097152` |
| `UV_THREADPOOL_SIZE` | `8` |
| `WARN_CODES_AUDIT_MAX` | `20` |
| `WARN_MAX` | `50` |
| `WARN_NAMES_MAX` | `20` |
| `WARN_NAMES_SHORT` | `5` |
| `WRITE_RATE_PER_MINUTE` | `240` |

## Biến môi trường (17)

| Biến | Đọc ở |
| --- | --- |
| `ACCESS_LOG` | `lib/ops/access-log.js:12` |
| `AUDIT_KEY` | `lib/db.js:738` |
| `COOKIE_SECURE` | `lib/auth.js:276` `lib/http.js:40` `lib/params/save.js:69` `lib/params/save.js:73` (+1) |
| `DATABASE_URL` | `lib/db.js:19` `lib/db.js:35` `lib/db.js:35` |
| `DB_DEBUG_SQL` | `lib/data/postgres-database.js:116` |
| `DB_DIALECT` | `lib/db.js:17` |
| `DB_PATH` | `lib/db.js:18` `lib/domain/ai-block.js:18` |
| `NODE_ENV` | `lib/params/save.js:69` `lib/params/save.js:73` `lib/params/save.js:89` |
| `PARAMS_ALLOW_ACTIVATE` | `lib/params/save.js:88` |
| `PORT` | `src/main.ts:89` |
| `SCHEDULE_ALLOW_EDIT` | `lib/params/save.js:68` |
| `SESSION_COOKIE_NAME` | `lib/auth.js:227` |
| `SESSION_DAYS` | `lib/auth.js:223` |
| `SESSION_SECRET` | `lib/auth.js:216` |
| `SHIFT_ALLOW_EDIT` | `lib/params/save.js:73` |
| `UV_THREADPOOL_SIZE` | `server.js:4` `server.js:4` |
| `WEB_DIST` | `lib/http.js:11` |
