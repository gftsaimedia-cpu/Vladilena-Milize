# Cấu hình kỹ thuật và biến môi trường

> Sinh tự động bởi `scripts/docs/gen-spec.ts` (`npm run spec:gen`) từ `src/platform/config.ts` và các chỗ đọc `process.env` trong `src/`. Đừng sửa tay: `test/unit/spec-reference.test.ts` so sánh file này với bản dựng từ mã.

## Hằng số có tên (`src/platform/config.ts`, 67)

| Tên | Giá trị |
| --- | --- |
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

## Biến môi trường (18)

| Biến | Đọc ở |
| --- | --- |
| `ACCESS_LOG` | `src/ops/access-log.ts:12` |
| `AUDIT_KEY` | `src/platform/db.ts:315` |
| `COOKIE_SECURE` | `src/params/save.ts:68` `src/params/save.ts:72` `src/params/save.ts:88` `src/platform/auth.ts:276` (+1) |
| `DATABASE_URL` | `src/platform/db.ts:34` `src/platform/db.ts:43` |
| `DB_DEBUG_SQL` | `src/data/postgres-database.ts:187` |
| `DB_SQL_STATS` | `src/data/postgres-database.ts:177` |
| `DRILL_PG_CONTROL_URL` | `src/ops/pg-backup.ts:315` |
| `NODE_ENV` | `src/params/save.ts:68` `src/params/save.ts:72` `src/params/save.ts:88` |
| `PARAMS_ALLOW_ACTIVATE` | `src/params/save.ts:87` |
| `PGOPTIONS` | `src/data/postgres-database.ts:55` |
| `PORT` | `src/main.ts:89` |
| `SCHEDULE_ALLOW_EDIT` | `src/params/save.ts:67` |
| `SESSION_COOKIE_NAME` | `src/platform/auth.ts:227` |
| `SESSION_DAYS` | `src/platform/auth.ts:223` |
| `SESSION_SECRET` | `src/platform/auth.ts:216` |
| `SHIFT_ALLOW_EDIT` | `src/params/save.ts:72` |
| `UV_THREADPOOL_SIZE` | `src/preload.ts:7` `src/preload.ts:8` |
| `WEB_DIST` | `src/platform/http.ts:11` |
