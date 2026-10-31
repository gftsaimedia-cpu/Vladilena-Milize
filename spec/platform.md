# Nền tảng (platform) — đặc tả theo mã

Tài liệu mô tả hành vi của mã đang chạy ở nhánh hiện tại, đọc từ mã (không đọc từ chú thích). Đường dẫn tính từ gốc repo. `file:dòng` trỏ tới dòng hiện có; khi mã dịch chuyển thì tìm lại theo tên hàm. Chỗ mã không nhất quán hoặc chưa làm được nằm ở mục 8.

Phạm vi: cấu trúc thư mục, luồng xử lý một yêu cầu qua NestJS (`src/bootstrap.ts`, `src/http/*`), `lib/http.js` (JSON, lỗi, file tĩnh), cổng quyền `ROUTE_CAPS`, đăng ký module NestJS (`src/app.module.ts`), giới hạn tải, SSE, nhật ký kiểm toán, lược đồ DB và migration, cảnh báo thay cho chặn, công tắc Agents, registry tham số và dữ liệu sinh, AI rà soát theo luật (không LLM), sao lưu / kiểm / khôi phục, sandbox và máy chủ kịch bản, biến môi trường, lệnh npm, bố cục test và cách chạy. Nghiệp vụ lương, chấm công, lịch, KPI, tạm ứng, phép chỉ được nhắc khi chạm vào nền tảng; chi tiết ở các file spec khác (`payroll-engine.md`, `payroll-period.md`, `attendance.md`, `requests.md`, `people-access.md`).

---

## 1. Phạm vi và file

### 1.0 Cấu trúc thư mục

| Đường dẫn | Nội dung |
| --- | --- |
| `server.js` | Điểm vào (15 dòng): đặt `UV_THREADPOOL_SIZE`, nạp TypeScript (`lib/register-ts.js`), nạp `.env` (`src/env.ts`), dựng máy chủ (`src/bootstrap.ts`), gọi `start()` (`src/main.ts`) khi chạy trực tiếp. Xuất `server` kèm `server.limits = { hashGate, writeLimiter, shedder, monitor }`. |
| `seed.js` | Script gieo dữ liệu độc lập ở gốc; khác `scripts/seed.js` (lệnh `npm run seed` chạy bản trong `scripts/`). |
| `lib/` | Mã máy chủ: `db.js` (SQLite + store), `http.js`, `auth.js`, `authz.js`, `audit.js`, `events.js`, `warnings.js`, `config.js`, `periods.js`, `payroll-service.js`, `roles.js`, `pay-entries.js`, `advance-*.js`, `explanations.js`, `slip-*.js`, `findings.js`, `data-quality.js`, `period-*.js`, `request-rules.js`, `announce.js`, `approvals.js`, `attendance-sessions.js`. |
| `lib/domain/` | Lớp nghiệp vụ và luật theo nhóm (route đã chuyển sang `src/modules/*`): `container.js`, thư mục `employee`, `position`, `shift`, `leave`, `explanation`, `advance`, `attendance`, `attendance-calendar`, `payroll`, `timesheet`, `overtime`, `kpi`, `shared` (`Rule`, `RuleSet`, `Repository`, `DomainError`), và các file lẻ (`pay-entries`, `positions`, `shifts`, `geofence`, `holidays`, `ot`, `sheet*`, `schedule`, `work-hours`, `isat-rule`, `limits`, `ai-review`, `ai-block`, `catalog-params`…). |
| `lib/ops/` | Hạ tầng vận hành trong tiến trình: giới hạn tải, bộ đo vòng lặp, bộ nhớ đệm, nhật ký truy cập. |
| `lib/params/` | Registry tham số, đọc theo tháng (`store.js`), lưu / xem trước / hoàn tác (`save.js`), kiểm (`validate.js`), thuộc tính mở rộng, chức vụ và khối phụ cấp là dữ liệu, `config-rev.js`, `keys.lock.json`, `registry.data.json`. |
| `lib/ai/` | AI rà soát theo luật (thuần, không mạng). |
| `public/` | Chỉ còn các mô-đun tính lương/chấm công dùng chung (UMD) mà máy chủ nạp bằng `require` (`payroll-engine.js`, `payroll-params.js`, `payroll-calendar.js`, `punch.js`, `leave.js`, `kpi-score.js`, `actual-hours.js`, `approval-view.js`, `work-schedule.js`, `formula*.js`, `payroll-graph.js`, `pay-*-calc.js`, `attendance-status.js`…). Không được phục vụ ra ngoài; giao diện là ứng dụng Vue ở `web/`. |
| `web/` | Mã nguồn giao diện Vue (dựng ra `web/dist`). `lib/http.js` phục vụ `web/dist` khi đã build. |
| `scripts/ops/` | Sao lưu, kiểm bản sao, diễn tập khôi phục, lùi chế độ tham số. |
| `scripts/dev/` | Sandbox (`sandbox-server.cjs`, `sandbox-ops.cjs`, trang điều khiển) và máy chủ kịch bản (`scenarios/`). |
| `scripts/params/` | Công cụ registry tham số (mục 4.10). |
| `scripts/loadtest/` | Bộ đo tải qua HTTP (`run.js`, `kit/`). |
| `scripts/db/` | Công cụ DB của máy phát triển: dữ liệu mẫu, kiểm migration, đo chỉ mục, thư mục `demo/`. |
| `scripts/seed.js` | `npm run seed`. |
| `.env.example` | Mẫu biến môi trường (`PORT`, `DB_PATH`, `ADMIN_PASSWORD`, `SESSION_SECRET`, `SESSION_DAYS`, `COOKIE_SECURE`, `TRUST_PROXY`), không chứa giá trị thật. |
| `test/` | `unit/`, `api/`, `ui/`, `ops/`, `helpers/`, `fixtures/`, `tools/` (mục 4.14, 7). |
| `spec/` | Các file đặc tả này. |

### 1.1 Máy chủ HTTP và hạ tầng yêu cầu

| File | Vai trò |
| --- | --- |
| `src/bootstrap.ts`, `src/main.ts`, `src/app.module.ts`, `src/app.init.ts`, `src/env.ts` | Ứng dụng NestJS: dựng `http.Server` (tiêu đề bảo mật, file tĩnh, chuyển `/api/*` cho Nest), khởi động thật và tắt êm, đăng ký module, khởi tạo cấp ứng dụng, nạp `.env`. |
| `src/http/*` | Hạ tầng route: `ApiGuard`/`ApiGate` (phiên, `ROUTE_CAPS`, giới hạn tải, giới hạn tốc độ ghi, ngữ cảnh nhật ký, cổng khoá kỳ), `RequestScopeInterceptor`, `ApiExceptionFilter`, `NotFoundModule`, `load-control`. |
| `src/modules/*` | 20 module nghiệp vụ (controller, module, helpers, `index.ts`); bảng route sinh từ mã ở `spec/reference/api-routes.md`, bảng module ở `spec/reference/modules.md`. |
| `lib/http.js` | `HttpError`, `send` (JSON, gộp cảnh báo, gzip, chỉ trả lời một lần), `readJson` (bắt buộc `application/json`, trần 1 MB), `serveStatic` (`web/dist` rồi `public/`, ETag, gzip giữ trong RAM), `securityHeaders` (CSP…), `clientIp` (`TRUST_PROXY`). |
| `lib/warnings.js` | Cảnh báo thay cho chặn: `run` (AsyncLocalStorage mỗi yêu cầu), `warnIf`, `warn`, `take`, `codes`, `selfDecision`, `optionalReason`. |
| `lib/agents.js` | Công tắc Agents: `enabled`, `set`, `assertEnabled` (403 `AGENTS_DISABLED`). |
| `lib/request-rules.js` | `rulesFor(tháng)`: dựng các mô-đun quy tắc dùng chung (`public/*.js`) theo bộ tham số của tháng, nhớ trong một yêu cầu (AsyncLocalStorage `requestRules`). Cùng `monthParams`, `typeParam`, `benefitOf`, `levelCountOf`, `vnToday`, `nowIso`. |
| `lib/announce.js` | Phát SSE sau COMMIT cho thay đổi cấu hình (`announceSetting`) và gom tháng có việc chấm công chờ (`attendanceHints` → `announceAttendance`). |
| `lib/config.js` | Hằng số kỹ thuật có tên (đóng băng lúc `require`). Một số hằng là số nghiệp vụ (mục 8.2). |
| `lib/auth.js` | Băm scrypt, giới hạn đoán mật khẩu (trong RAM), cookie phiên ký HMAC, `TRUST_PROXY`, mật khẩu admin đầu tiên, `SESSION_SECRET`. |
| `lib/authz.js` | Năng lực (`CAPS`, 32 mục), vai trò mặc định (`ROLE_CAPS`, `ROLE_SCOPE`), vai trò tuỳ chỉnh (settings `roles.custom`), `ROUTE_CAPS` (106 khoá), `routeKey`, `gate`, `can`, `scopeOf`, `auditSensitivities`. |
| `lib/ops/access-log.js` | Nhật ký truy cập JSON mỗi yêu cầu một dòng + tiêu đề `X-Request-Id`. Tắt bằng `ACCESS_LOG=off`. |
| `lib/ops/limiters.js` | `Overloaded`, `AsyncGate` (giới hạn đồng thời băm mật khẩu), `RateLimiter` (xô token theo người), `LoadShedder` (từ chối route nặng khi nghẽn). |
| `lib/ops/route-classes.js` | `HEAVY_ROUTES`, `UNLIMITED_WRITE_ROUTES` (khoá dạng `ROUTE_CAPS`). |
| `lib/ops/runtime-monitor.js` | Đo trễ vòng lặp sự kiện (cửa sổ trượt), bộ nhớ, thời gian chạy; dùng cho `/api/health`, bộ chặn tải, nhật ký truy cập. |
| `lib/ops/compute-cache.js` | `ComputeCache`: nhớ kết quả phép tính nặng chỉ-đọc theo (khoá, số lần ghi DB, TTL). |
| `lib/ops/shared-cache.js` | Một `ComputeCache` dùng chung tiến trình, revision = `SELECT total_changes()`. |
| `lib/params/config-rev.js` | Số phiên bản chung của cấu hình (`settings.config_rev`), `EPOCH` (đổi mỗi lần khởi động), `BUILD` (= `package.json` version), `info()`. |

### 1.2 Sự kiện, nhật ký

| File | Vai trò |
| --- | --- |
| `lib/events.js` | Danh mục sự kiện (`EVENTS`,), chọn người nhận + chiếu trường theo tầng quyền, SSE `GET /api/events` (`handleSse`,), `emit.*` theo nghiệp vụ, `closeUser`, `closeAll`. |
| `lib/audit.js` | Ghi nhật ký phía ứng dụng: `context(me)`, `write` (gắn mã cảnh báo, hàng rào bí mật), `staffSaved`, `staffLock`, `slipOverride`, `publicRow`. |
| `lib/db.js` (khối `auditStore`,) | Lưu nhật ký: chuỗi băm SHA-256 / HMAC-SHA256, `list`, `count`, `verify`, `mode`. |
| `lib/findings.js` | Bỏ qua cờ AI trên phiếu lương (bảng `ai_finding_actions`), gắn trạng thái bỏ qua vào kết quả soát. |

### 1.3 Dữ liệu

| File | Vai trò |
| --- | --- |
| `lib/db.js` | Mở SQLite (`node:sqlite`, `DB_PATH` bắt buộc), PRAGMA, DDL chỉ-thêm + `addColumn` + mốc `once`, `transaction` (SAVEPOINT lồng được), kho staff / timesheets / settings / KPI / slip_overrides, `auditStore`, `paramsStore` (đọc `param_versions`), `periodsStore` (vòng đời kỳ), `payrollStore` (lần chạy + phiếu), `aiFindingStore`, `aiReviewStore`, `rolesStore`, `assertPeriodOpen`. Cuối file gắn thêm kho của `attendance-sessions.js`, `approvals.js`. |
| `lib/attendance-sessions.js` | DDL `attendance_sessions`, `punch_requests` (+ cột, chỉ mục), migration `attendance_sessions_v1`, `purgePunchRequests`. |
| `lib/approvals.js` | DDL `sheet_approvals`, migration `sheet_approvals_v1…v4`. |
| `lib/domain/employee/schema.js` | Cột danh tính trên `staff` (uuid, họ/tên, ngày nghỉ việc, số phép lưu sẵn…), cột `audit_log.subject_uuid/actor_uuid`, trigger khoá `username`/`uuid`, mốc `staff_identity_v1`. |
| `lib/domain/position/schema.js` | Bảng danh mục `benefit_types`, `position_types`, `position_type_benefits`, `position_levels`, `work_shifts`; mốc `position_catalog_v1` nạp dòng nền từ `PayrollParams.DEFAULTS`. |
| `lib/domain/leave/schema.js` | Bảng `leave_ledger`. |
| `lib/domain/explanation/schema.js` | Bảng `explanations` (nâng dạng bảng bằng RENAME → chép → DROP trong một giao dịch). |

### 1.4 lib/domain: container và lớp gốc

| File | Vai trò |
| --- | --- |
| `src/app.module.ts` | Gốc module Nest: `ApiGuard`, `RequestScopeInterceptor`, `ApiExceptionFilter` toàn cục; `FEATURE_MODULES` (thứ tự đăng ký = thứ tự khớp route) rồi `NotFoundModule`. |
| `lib/domain/container.js` | Composition root: dựng lười, một lần, các repository/service (`employeeRepository`, `employees`, `positions`, `shifts`, `explanationRepository`, `explanations`, `lateCheckout`, `adminPresence`, `sessionStatus`, `leave`) và `catalogRev` / `bumpCatalogRev` / `catalogParamRows`; dựng lại khi `store.db` đổi. |
| `lib/domain/shared/domain-error.js` | `DomainError` (`httpStatus`, `code`, `details`) — `ApiExceptionFilter` trả theo nhánh "lỗi có mã". |
| `lib/domain/shared/repository.js` | Lớp gốc repository: `one/all/run/transaction`, `updateWithRev` (khoá lạc quan `rev` → 404 / 409). |
| `lib/domain/shared/request.js` | Lớp gốc "yêu cầu chờ duyệt" (trạng thái, người/lúc duyệt, ghi chú, `rev`, không tự duyệt yêu cầu của mình). |
| `lib/domain/shared/catalog-change.js` | `applyCatalogChange`: cổng khoá kỳ (`params`), giao dịch, `bumpCatalogRev`, `configRev.bump`, audit mức `pay`, SSE `params.changed` (`kind: 'catalog'`). |
| `lib/domain/catalog-params.js` | `catalog_rev` và dòng tham số sinh từ danh mục (đọc bởi `lib/params/store.js`). |
| `src/modules/employees/employees.controller.ts` | `GET /api/employees/:uuid`, `GET /api/employees/:uuid/trace`. |
| `src/modules/leave/leave.controller.ts` | `GET /api/leave/ledger`, `POST /api/leave/refresh`. |
| `src/modules/catalog/catalog.controller.ts`, `src/modules/catalog/catalog.controller.ts` | `GET/PUT /api/catalog/positions`, `PUT /api/catalog/levels`, `GET/PUT /api/catalog/shifts`. |

### 1.5 AI rà soát theo luật (không gọi mô hình, không mạng)

| File | Vai trò |
| --- | --- |
| `lib/ai/review.js` | `review(input)`: thuần, chạy danh mục luật (`RULES`, `RUNNERS`), trả `findings`, `systemFindings`, `checked`, `checklist`, `summary`, tuỳ chọn `impacts`. |
| `lib/ai/rules-extra.js` | Hai luật thêm: `block-flags-unconfirmed`, `override-looks-like-entry`. |
| `lib/ai/thresholds.js` | Bảng ngưỡng duy nhất (`THRESHOLDS`), ánh xạ sang khoá tham số (`PARAM_KEY` hoặc `ai.threshold.<tên>`), `LIMITS`, `isRuleEnabled` (`ai.rule.<camelCase>.enabled`). |
| `lib/ai/units.js` | Hằng đơn vị (`unit.*`) và hàm ngày giờ thuần (VN = UTC+7). |
| `lib/ai/positions.js` | Đọc cờ quyền lợi chức vụ và định nghĩa khối phụ cấp từ bộ tham số phẳng. |
| `lib/ai/payroll-loader.js` | `loadPayroll(params)` = `PayrollEngine.create(params)` (bộ máy dùng chung `public/payroll-engine.js`). |
| `lib/ai/preview-suggestions.js` | Gợi ý khi xem trước thay đổi cài đặt (`formula-large-change`, `position-scope-leak`), gọi từ `lib/params/save.js`. |
| `lib/data-quality.js` | Phát hiện thiếu ngày vào làm / phép âm (số dư `ledger` của `public/leave.js` < 0); `review.js` dùng lại (luật `missing-start-date`, `negative-leave`). |
| `lib/domain/ai-review.js` | Dựng đầu vào cho `review()` chỉ bằng hàm đọc của store; `aiReviewResultCached` (cache dùng chung). |
| `lib/domain/ai-block.js` | `assertNotAiBlocked(items)`: chặn duyệt khoản dính luật nặng (409 `AI_BLOCKED`); bỏ qua khi công tắc Agents tắt. |

### 1.6 Vận hành, sandbox

| File | Vai trò |
| --- | --- |
| `scripts/ops/backup-db.js` | Sao lưu nhất quán bằng `VACUUM INTO` → `integrity_check` → đổi tên → xoay vòng giữ `BACKUP_KEEP` bản. |
| `scripts/ops/backup-daily.js` | Một lệnh cho bộ lập lịch: gọi `backup()`, tuỳ chọn chạy `verify-backup.js`, ghi một dòng JSON log; kiểm hỏng thì đổi tên `.failed`. |
| `scripts/ops/check-backup.js` | Giám sát: có bản, bản mới nhất trẻ hơn `--max-age-hours`, không có `.failed`/`.partial` mới hơn. |
| `scripts/ops/verify-backup.js` | Kiểm bản sao trên bản chép tạm: integrity, foreign_key, đếm dòng, chuỗi băm nhật ký, tính lại phiếu từ bản chụp. |
| `scripts/ops/restore-drill.js` | Diễn tập khôi phục: chạy `server.js` (ứng dụng NestJS) ở tiến trình con trên bản chép, gửi 3 yêu cầu kiểm. |
| `scripts/ops/params-mode.js` | Xem / lùi `params_mode` về `defaults-only` (có sao lưu, audit `param.mode`, tăng `config_rev`). |
| `scripts/dev/sandbox-server.cjs` | Máy chủ thử: DB RAM, đồng hồ giả, chỉ loopback, nạp `server.js` (ứng dụng NestJS). |
| `scripts/dev/sandbox-ops.cjs` | Điều khiển thử tải và sao lưu/khôi phục bên trong sandbox. |
| `scripts/dev/sandbox.html`, `sandbox.js`, `sandbox-ops.js` | Trang điều khiển sandbox (trình duyệt). |
| `scripts/dev/scenarios/` | Dựng DB kịch bản gần một năm (`generate.cjs`), máy chủ xem (`server.cjs`), đối chiếu (`verify.cjs`), thư viện `lib/`; file sinh ra nằm trong `out/` (không vào git). |
| `scripts/loadtest/` | `run.js` đo tải qua HTTP (tự dựng DB tạm, hoặc nhắm `--base` vào sandbox), `kit/` (người dùng giả, kịch bản, đối soát). |
| `scripts/seed.js` | `npm run seed`. |
| `package.json` | Lệnh npm, `engines.node >= 22.13`, không có dependency chạy; devDependency `@playwright/test`, `prettier`. |

### 1.7 Công cụ test

| File | Vai trò |
| --- | --- |
| `test/tools/size-budget.js` | Ngân sách cỡ file (mềm 800, cứng 1.200 dòng; ngoại lệ trong `test/fixtures/file-size-budget.json`, trần chỉ giảm). |
| `test/tools/check-todo.js` | Số test `todo` không được tăng (baseline `test/fixtures/todo-baseline.json`). |
| `test/tools/free-identifiers.js` | Tìm tên dùng mà không khai báo (bắt `require` bị quên khi chuyển mã), dùng parser của Prettier. |
| `test/tools/moved-lines.js` | So dòng khi cắt mã từ file lớn sang file khác (từng dùng khi tách `server.js` sang `src/modules`). |
| `test/tools/record-dispatch.js` | Ghi / so "bảng vàng điều phối" (mọi khoá `ROUTE_CAPS` × 3 loại người dùng) vào `test/fixtures/route-dispatch-golden.json`. |
| `test/tools/record-schema.js` | Bản chụp lược đồ DB do `lib/db.js` dựng (`test/fixtures/db-schema-snapshot.json`). |
| `test/helpers/api-fixture.js` | Dựng máy chủ thật trên DB RAM, đồng hồ giả, `call()`, `person()`, `reset()`, `snapshot()`; bật công tắc Agents (`agents.set(true)`). |
| `test/helpers/sse-client.js`, `server-source.js` | Máy khách SSE cho test; gom văn bản mã máy chủ cho test đọc tĩnh. |
| `test/helpers/red.js`, `open-bug.js` | Test đỏ viết trước / lỗi đã biết chạy như `todo`. |
| `test/helpers/*-api.js`, `*-flow.js`, `*-fixtures.js` | Đồ dùng dựng dữ liệu qua API thật: kỳ lương (`period-api`, `period-flow`), khoản điền thêm, chức vụ, lịch, cài đặt, giải trình (`explanation-flow`). |
| `test/helpers/legacy-*.js`, `payroll-vm.js`, `golden.js`, `payroll-cases.js`, `payroll-differential.js`, `pay-oracle.js`, `formula-*.js` | Bộ so sánh bộ máy lương với khối công thức đóng băng (`test/fixtures/legacy-payroll-block.js`, `payroll-golden-v0.json`), sinh ca, đọc công thức phiếu. |

---

## 2. Dữ liệu

### 2.1 Kết nối và giao dịch

- `DB_PATH` bắt buộc; thiếu thì `lib/db.js` ném lỗi ngay khi `require` (`lib/db.js`). Thư mục cha được tạo.
- `PRAGMA journal_mode = WAL`, `busy_timeout = config.DB_BUSY_TIMEOUT_MS` (5000) (`lib/db.js`). Khoá ngoại bật (mặc định của `node:sqlite`).
- Một kết nối duy nhất cho cả tiến trình. `transaction(fn)` dùng `SAVEPOINT write_<n>`; lỗi thì `ROLLBACK TO` + `RELEASE` rồi ném tiếp; gọi lồng được (`lib/db.js`).
- Đồng hồ DB: `now()` = `new Date(Date.now()).toISOString()` để test/sandbox giả giờ được (`lib/db.js`).
- Lỗi có mã của store: `storeError(code, message, httpStatus=400, details)` → `Error` có `code`, `httpStatus`, `details` (`lib/db.js`).
- Lỗi khi khởi động mà người vận hành phải xử lý (`bootFail`, `lib/db.js`): in hướng dẫn rồi `process.exit(1)`.

### 2.2 Bảng

Không có số phiên bản lược đồ. Mọi DDL là `CREATE … IF NOT EXISTS` chạy mỗi lần mở DB, cột bổ sung qua `addColumn` (kiểm `PRAGMA table_info`), dữ liệu chuyển một lần qua mốc trong `settings`.

| Bảng | Tạo ở | Ghi chú cho nền tảng |
| --- | --- | --- |
| `staff` | `lib/db.js` + nhiều `addColumn` (,), `employee/schema.js` | Khoá `username`. Cột phiên: `locked_at`, `locked_by`, `session_version`. `payroll_subject` (null = suy từ role). `uuid` (sinh bằng SQL nếu thiếu, không đổi được — trigger). |
| `timesheets` | `lib/db.js` | Lịch ước tính theo (username, month), `days_json`, `rev`. |
| `settings` | `lib/db.js` | `key` → `value_json`. Xem 2.3. |
| `slip_overrides` | `lib/db.js` | Số Admin sửa trên phiếu; `reason`, `rev`. |
| `punches`, `corrections`, `attendance_days` | `lib/db.js` | Lượt bấm lẻ, điều chỉnh giờ, giờ chấm công gửi Admin; `context_json`, `session_id`, `session_version`. |
| `kpi_scores`, `kpi_score_log` | `lib/db.js` | Điểm ×100 (0..10000, CHECK kiểu integer). |
| `audit_log` | `lib/db.js` + `subject_uuid`, `actor_uuid` (`employee/schema.js`) | Chỉ thêm (trigger chặn UPDATE/DELETE). `sensitivity ∈ normal/pay/pii`. Chuỗi băm `prev_hash`, `hash`. Chỉ mục: `at`, `(entity_kind, entity_id, id)`, `(subject, month, id)`, `(actor, at)`, `(action, at)`, `(actor,id)`, `(action,id)`, `(month,id)`, `(entity_kind,id)`, `(subject_uuid,id)`. |
| `param_versions` | `lib/db.js`, `batch_id` | Chỉ thêm. `reason` CHECK 10..300. Đọc qua `paramsStore`. |
| `payroll_periods` | `lib/db.js` | Trạng thái kỳ, `rev`, `current_run_id`, cột "ai/lúc nào" từng bước, `reopen_count`. Không có dòng = `open`. |
| `payroll_runs`, `payslips` | `lib/db.js` | Bất biến bằng trigger: không xoá; lần chạy không đổi tham số/đầu vào/không lùi trạng thái; phiếu không đổi số; phiếu của lần chạy `final`/`superseded` không đổi gì. |
| `ai_finding_actions` | `lib/db.js` | Chỉ thêm. `action ∈ dismiss/restore`, `note` CHECK 10..300. |
| `ai_review_runs` | `lib/db.js` | Chỉ thêm. Chỉ số đếm, không tên, không tiền. |
| `staff_roles` | `lib/db.js` | Không xoá; chỉ đặt `revoked_at` một lần. Duy nhất (username, role) khi chưa thu hồi. |
| `pay_entries`, `advance_requests` | `lib/db.js` | Trigger khoá trạng thái cuối / trường tiền sau duyệt; `advance_requests` có chỉ mục duy nhất một yêu cầu `pending` mỗi (người, tháng). |
| `attendance_sessions`, `punch_requests` | `lib/attendance-sessions.js` | Một phiên mở mỗi người (unique partial index `session_one_open`). `punch_requests` là bộ nhớ chống bấm lặp theo `requestId`, `created_at` để dọn. |
| `sheet_approvals` | `lib/approvals.js` | Khoản tự khai chờ duyệt. |
| `benefit_types`, `position_types`, `position_type_benefits`, `position_levels`, `work_shifts` | `lib/domain/position/schema.js` | Danh mục có tháng áp dụng. |
| `leave_ledger` | `lib/domain/leave/schema.js` | Sổ phép, duy nhất (staff_uuid, kind, on_date). |
| `explanations` | `lib/domain/explanation/schema.js` | Giải trình. |

### 2.3 Khoá `settings`

| Khoá | Giá trị | Ai đọc / ghi |
| --- | --- | --- |
| `agents_enabled` | `'1'` \| `'0'`; vắng hoặc lạ = `'0'` (tắt) | `lib/agents.js`; ghi ở `PUT /api/settings/agents` (`src/modules/settings/settings.controller.ts`). |
| `params_mode` | `'defaults-only'` \| `'active'`; gieo `'defaults-only'` | `lib/db.js,951-954`; bật `active` ở `lib/params/save.js`; lùi bằng `scripts/ops/params-mode.js`. |
| `config_rev` | số nguyên ≥ 0 (vắng = 0) | `lib/params/config-rev.js`; `bump()` trong cùng giao dịch của mọi thay đổi cấu hình. |
| `catalog_rev` | số nguyên | `lib/domain/catalog-params.js`. |
| `session_secret` | hex | Chỉ khi không production và không có `SESSION_SECRET` (`lib/auth.js`). |
| `holidays` | `['YYYY-MM-DD']` | Đọc ở rất nhiều nơi; ghi ở `PUT /api/holidays`. |
| `holiday_names` | `{ ngày: tên }` | `lib/domain/holidays.js`. |
| `geofence` | đối tượng vùng GPS hoặc `null` | `lib/domain/geofence.js`, `PUT /api/settings/geofence`. |
| `ai_block_rules` | mảng id luật; `[]` = tắt | `lib/domain/ai-block.js`. |
| `roles.custom` | `{ rev, roles: [...] }` | `lib/authz.js`, `lib/roles.js`. |
| `advance_approvals_<YYYY-MM>` | `{ rev, users }` | `lib/domain/advance/advance-approvals.js`. |
| Mốc migration | `{ at }` | `attendance_split_v1` (`lib/db.js`), `backend_v4_v1a_v1`, `staff_payroll_subject_v1`, `staff_identity_v1` (`employee/schema.js`), `position_catalog_v1` (`position/schema.js`), `staff_shift_codes_v1` (`lib/db.js`), `sheet_approvals_v1…v4` (`lib/approvals.js`), `attendance_sessions_v1` (`lib/attendance-sessions.js,289`). |

### 2.4 Migration khi mở DB (thứ tự chạy)

1. DDL cơ bản + `addColumn` của `staff`, `timesheets`, `slip_overrides`, `punches`, `corrections`, `attendance_days` (`lib/db.js`).
2. `attendance_split_v1`: chép ngày có `src` từ `timesheets.days_json` sang `attendance_days`, BEGIN/COMMIT riêng (`lib/db.js`).
3. KPI, audit, param, kỳ lương, AI, vai trò, pay_entries, advance_requests (`lib/db.js`), cột thêm, chỉ mục.
4. `once('backend_v4_v1a_v1')` gieo `params_mode`; `once('staff_payroll_subject_v1')` đặt `payroll_subject` (admin = 0, còn lại = 1) (`lib/db.js`). `once` chạy trong `transaction` và ghi mốc cùng giao dịch.
5. Schema của `lib/domain`: employee, position (gieo danh mục), leave, explanation (`lib/db.js`), rồi `staff_shift_codes_v1` đổi mã ca ngắn sang mã danh mục.
6. Cuối file: `attendance-sessions.js` (migration phiên; lỗi → `bootFail`), `approvals.js` (migration `sheet_approvals_v1…v4`, lỗi → `bootFail`), rồi `warnings.bindSettings(getSetting)`.
7. Khi `server.js` nạp: `initApp()` (`src/app.init.ts`) gọi `Roles.reconcileStaffRole()` ghi DB ngay lúc dựng máy chủ, kể cả trong test.

Quy ước của mã: chỉ thêm bảng/cột/chỉ mục/trigger; cột mới có mặc định hoặc null; không viết lại dòng có sẵn (ngoại lệ có mốc `once`). `test/tools/record-schema.js` + `test/api/db-schema-snapshot.test.js` khoá lược đồ.

### 2.5 Kỳ lương: trạng thái và cổng khoá

Trạng thái: `open → attendance_locked → calculated → reviewed → approved → paid` (`lib/db.js`).

| Bước (`periodsStore`) | Từ | Sang | Ghi chú |
| --- | --- | --- | --- |
| `lockAttendance` | open | attendance_locked | |
| `markCalculated` | attendance_locked, calculated, reviewed | calculated | gắn `current_run_id` (lần chạy phải là `draft` của đúng tháng, nếu không 409 `RUN_INVALID`); xoá cột các bước sau. |
| `markReviewed` | calculated, reviewed | reviewed | cần `current_run_id` (409 `PERIOD_NOT_READY`). |
| `approve` | reviewed hoặc calculated (calculated kèm cảnh báo `PERIOD_STATE`) | approved | Phiếu chưa duyệt: cảnh báo `PERIOD_NOT_READY`, tự duyệt luôn, phiếu lỗi tự loại; `freezeOverrides`; lần chạy → `final` (`lib/db.js`). |
| `markPaid` | approved | paid | `paidAt` ngày hoặc ISO (400 `BAD_PAID_AT`), `reference` ≤ 100 ký tự. |
| `reopen` | trạng thái sau `to` | `to ∈ open, attendance_locked, calculated` | `paid`: cho mở, cảnh báo `PERIOD_STATE`. Mọi lần chạy draft/final → `superseded`, `current_run_id = null`, `reopen_count + 1`, xoá cột bước sau (`lib/db.js`). |

Mọi bước: `rev` không phải số nguyên ≥ 0 → 400 `BAD_REV`; `rev` lệch → 409 `PERIOD_STALE { month, rev }`; sai trạng thái → 409 `PERIOD_STATE { month, status, expected, to }`. Thành công: `rev + 1`.

**Cổng khoá kỳ** `assertPeriodOpen(month, scope)` (`lib/db.js`):

| scope | Khoá từ trạng thái |
| --- | --- |
| `attendance` | attendance_locked |
| `params` | attendance_locked |
| `kpi` | approved |
| `slip` | approved |

- scope lạ → `Error` thường (lỗi lập trình → 500).
- Tháng chưa có dòng → mở.
- Khoá: đi qua `warnIf('PERIOD_LOCKED', …)`: thêm cảnh báo `PERIOD_LOCKED { month, status, scope }`, ghi tiếp.

### 2.6 Bộ nhớ trong tiến trình (mất khi khởi động lại)

| Bộ nhớ | Ở đâu | Hết hạn / trần |
| --- | --- | --- |
| Danh sách cảnh báo của yêu cầu, `mode` đã đọc | `lib/warnings.js` (ALS) | Một yêu cầu; trần `WARN_MAX` = 50, phần dư → mục `WARNINGS_TRUNCATED`. |
| Quy tắc theo tháng | `lib/request-rules.js` (ALS `requestRules`) | Một yêu cầu. |
| Bộ tham số hiệu lực theo tháng | `lib/params/store.js` (`resolve`) | Khoá = (kết nối DB, chế độ, id dòng tham số mới nhất, `catalog_rev`); tối đa 64 tháng; xem trước (`drafts`/`active`) không vào cache. |
| File tĩnh nén sẵn | `lib/http.js` `staticCache` | Theo ETag (cỡ + mtime); chỉ file ≤ `STATIC_CACHE_MAX_BYTES` (2 MB), đuôi chữ. Không có trần số mục. |
| Kết quả nặng (soát AI, ước tính cả kỳ) | `lib/ops/shared-cache.js` | Hợp lệ khi `total_changes()` không đổi và tuổi < 15.000 ms; tối đa 64 mục. |
| Bộ máy lương của AI theo `paramsHash` | `lib/domain/ai-review.js` | Không trần (một mục mỗi bộ tham số khác nhau). |
| Đếm đăng nhập sai | `lib/auth.js` | Cửa sổ `system.login.windowMin`; ≤ `system.login.maxKeys` khoá, không đẩy khoá đang khoá ra. |
| Xô token ghi | `RateLimiter.buckets` | ≤ 10.000 khoá, bỏ khoá lâu nhất. |
| Kết nối SSE | `lib/events.js` (`conns`, `byUser`) | Theo kết nối. |
| Đối tượng domain | `lib/domain/container.js` `#built` | Dựng lại khi `store.db` khác lần trước. |

---

## 3. API

### 3.1 Luồng một yêu cầu `/api/*` (thứ tự đúng như mã)

`src/bootstrap.ts` (`http.createServer`), rồi `src/http/*` trong ứng dụng Nest:

1. `securityHeaders(res)` cho mọi phản hồi (CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: same-origin`, `Permissions-Policy`, HSTS khi `COOKIE_SECURE=1`) (`lib/http.js`).
2. Nếu `access-log` gắn (chỉ khi chạy `server.js` trực tiếp, `src/main.ts`): đặt `X-Request-Id` (nhận từ client nếu khớp `^[\w.-]{1,64}$`, không thì 12 hex) (`lib/ops/access-log.js`).
3. URL không parse được → 400 `{ error }`. Không bắt đầu bằng `/api/` → `serveStatic`.
4. `inflight.count++` (trừ `/api/events`), giảm khi `res` đóng (`src/http/load-control.ts`).
5. Chờ ứng dụng Nest khởi tạo xong (`ready`); lưu URL gốc ở `req.rawUrl`, đổi `%` thành `%25` trong `req.url` để Express không bao giờ trả 400 HTML khi gặp `%`-mã sai.
6. `ApiGuard` → `ApiGate.open` (`src/http/api-gate.ts`):
   1. `auth.readSession(cookie)` → tên đăng nhập hoặc null; `me = store.getStaff(…)`.
   2. `route = "<METHOD> /<seg1>/<seg2>"` (chỉ hai đoạn đầu sau `api`).
   3. `policy = authz.policyOf(authz.routeKey(method, seg))`. Không có → (chưa đăng nhập: 401) → 403 `NO_ROUTE_POLICY`.
   4. Không `public`: chưa đăng nhập → 401 `Chưa đăng nhập` (không có code); `authz.gate` trả lỗi → 403 `FORBIDDEN_CAP { cap }`.
   5. Route trong `HEAVY_ROUTES` và `shedder.check()` có lý do → ném `Overloaded` → 503 `OVERLOADED` + `Retry-After`.
   6. Đã đăng nhập, method ≠ GET, route không trong `UNLIMITED_WRITE_ROUTES` → `writeLimiter.take(username)`; hết token → `WriteRateLimited` → 429 `WRITE_RATE_LIMITED` + `Retry-After`.
   7. `actx = audit.context(me)` (`requestId` = `crypto.randomUUID()`, khác `X-Request-Id`).
   8. Gắn `ApiContext` (`@Ctx()`) vào yêu cầu: `req, res, url, seg, route, routeKey, me, policy, actx, need(), needAdmin(), guardPeriod(…)`.
7. `RequestScopeInterceptor`: `warnings.run(() => requestRules.run(new Map(), handler))`; handler xong thì `announceAttendance()`, `announcePunches()` (phát SSE gom trong yêu cầu).
8. Phương thức controller của module khớp route (Express khớp theo thứ tự đăng ký module ở `FEATURE_MODULES`, trong module theo thứ tự khai báo). Không module nào khớp → `NotFoundModule` → 404 `Không có API này` (đã qua bước 6, nên chưa đăng nhập vẫn nhận 401/403 trước).
9. Lỗi (`src/http/api-exception.filter.ts`): xoá `attendanceHints`, `punchHints`; nếu đã trả lời rồi → chỉ `console.error`; ngược lại:

| Lỗi | Phản hồi |
| --- | --- |
| `Overloaded` | 503 `{ error, code: 'OVERLOADED' }` + `Retry-After` |
| `HttpError` | `e.status`, `{ error: e.message, ...e.details }` (code nằm trong `details` nếu có) |
| có `code` (chuỗi) và `httpStatus` nguyên < 500 (store, `DomainError`, `lib/periods.js`, `lib/findings.js`, `lib/params/save.js`) | `httpStatus`, `{ error, code, ...details }` |
| khác (kể cả `httpStatus ≥ 500`, ví dụ `AUDIT_ARGS`, `BAD_ARGS` 500) | log, 500 `{ error: 'Lỗi máy chủ' }` |

`send()` (`lib/http.js`): chỉ trả lời một lần (bỏ qua lặng nếu đã gửi / đang nén); phản hồi 2xx dạng đối tượng được gộp `warnings` của yêu cầu (không trùng code+message với mảng `warnings` có sẵn); ≥ `HTTP_GZIP_MIN_BYTES` (1024) và client nhận gzip → nén mức 1 ở luồng nền. Luôn `Cache-Control: no-store`.

`readJson(req, allowNull)` (`lib/http.js`): có thân mà `Content-Type` ≠ `application/json` → 415 `UNSUPPORTED_MEDIA_TYPE` (chống CSRF); > 1.000.000 byte → 413 (không code, đọc hết rồi mới trả); không phải object JSON → 400 `JSON phải là object hợp lệ` (không code); thân rỗng → `{}`; `allowNull` cho phép chữ `null`.

**Hai cổng phụ trong `ApiContext`** (`src/http/api-gate.ts`):
- `needAdmin()`: khẳng định route có `policy.cap`; không kiểm thêm quyền (cổng đã kiểm). Test tĩnh `permissions-matrix` nhận dạng route chỉ-Admin bằng chuỗi `needAdmin()` ngay dưới decorator.
- `guardPeriod(...dates)`: ném `Error` nếu route không khai `periodScope`; với mỗi tháng khác nhau của các ngày/tháng truyền vào: `store.assertPeriodOpen(month, policy.periodScope)` rồi `warnFrozen(month)` (kỳ ở `approved`/`paid` → thêm cảnh báo `PERIOD_FROZEN`).

### 3.2 Chính sách quyền `ROUTE_CAPS` (`lib/authz.js`)

Dạng chính sách: `{ public: true }` (không cần đăng nhập) · `{ authenticated: true }` (A) · `{ cap: 'self-or:<nl>' }` (cổng như A; handler tự kiểm `can()`) · `{ cap: '<nl>' }` (cần năng lực ở phạm vi `all`; riêng `request.decide.*` chỉ cần có ít nhất một nhóm). Route ghi thêm `periodScope` (dùng cho `guardPeriod`) và `periodMonth` (chỉ là tài liệu).

`routeKey` (`lib/authz.js`) đặt tên tham số: `/periods/:month[/<bước>|/payslips[/:username|/decide]|/estimates/:username]`, `/settings/params/<x>`, `/staff/:u[/schedule[/preview]|/roles|/password]`, `/blocks/:code/<x>`, `/positions/:code/levels`, `/pay-entries[/bulk|/:id[/<x>]]`, `/advance-requests/:id/<x>`, `/explanations/:id/<x>`, `/catalog/positions/:code`, `/employees/:uuid[/<x>]`, `/roles/:code[/<x>]`; còn lại `METHOD /seg1/seg2`.

| Nhóm | Khoá → chính sách (periodScope) | Xử lý ở |
| --- | --- | --- |
| Công khai | `POST /login`, `POST /logout`, `GET /me`, `GET /health` → public | `src/modules/auth/auth.controller.ts` / `src/modules/system/system.controller.ts` |
| Phiên | `PUT /password` → A (`auth`); `GET /events` → A (`system`); `GET /settings/version` → A (`settings`); `GET /me/estimate` → A (`sheet`) | `src/modules/auth`, `src/modules/system`, `src/modules/settings`, `src/modules/sheet` |
| Ngày lễ | `GET /holidays` → A; `PUT /holidays` → config.payroll (attendance) | `src/modules/settings/settings.controller.ts` |
| Lịch | `GET /sheet` → self-or:attendance.read; `PUT /sheet` → A (attendance); `PUT /sheet/bulk` → request.decide.* (attendance) | `src/modules/sheet/sheet.controller.ts`, `lib/domain/sheet-bulk.js` |
| KPI | `GET /kpi/scores` → kpi.score.write; `PUT /kpi/scores` → self-or:kpi.score.write (kpi) | `src/modules/kpi/kpi.controller.ts` |
| Duyệt | `GET /approvals`, `GET /approvals/count`, `GET /alerts` → request.decide.*; `PUT /approvals/decide` → request.decide.* (attendance) | `src/modules/approvals/approvals.controller.ts` |
| Phiếu sửa | `GET /slip-override` → payroll.override; `PUT /slip-override` → payroll.override (slip) | `src/modules/periods/periods.controller.ts` |
| Chấm công | `GET /punch` → A; `POST /punch` → A (attendance); `GET /ot` → attendance.correct; `POST /ot`, `PUT /ot` → attendance.correct (attendance); `GET /today`, `GET /attendance` → attendance.read | `src/modules/attendance/attendance.controller.ts` |
| AI | `GET /ai/review` → ai.review.read; `POST /ai/findings` → ai.review.dismiss | `src/modules/ai/ai.controller.ts` |
| Công tắc | `PUT /settings/geofence` → config.payroll | `src/modules/settings/settings.controller.ts` |
| Nhân sự | `GET /staff` → profile.read; `GET /team` → payroll.view; `PUT /staff/:u`, `PUT /staff/shift-bulk` → profile.write; `PUT /staff/:u/roles`, `POST /staff/:u/password` → roles.manage; `DELETE /staff/:u` → staff.lock | `src/modules/staff/staff.controller.ts` / `src/modules/sheet/sheet.controller.ts` |
| Vai trò | `GET /roles`, `POST /roles`, `PUT /roles/:code`, `POST /roles/:code/deprecate` → roles.manage | `src/modules/roles/roles.controller.ts` |
| Chức vụ (params) | `GET /positions`, `GET /entitlements` → config.read; `POST /positions` → config.read; `POST /positions/:code/levels` → config.payroll | `src/modules/positions/positions.controller.ts` |
| Lịch theo loại nhân sự | `GET /staff/:u/schedule` → self-or:profile.read (không còn PUT và POST preview: route không có trong bảng quyền, bị 403 `NO_ROUTE_POLICY`) | `src/modules/staff/staff.controller.ts` → `lib/domain/schedule.js` (`staffView`) |
| Khối | `POST /blocks` → config.payroll; `PUT /blocks/:code/confirm` → config.legal | `src/modules/blocks/blocks.controller.ts` |
| Tham số | `GET /settings/params`, `GET /settings/first-run` → config.read; `PUT /settings/params`, `POST /settings/params/preview`, `POST /settings/params/revert` → config.read | `src/modules/settings/settings.controller.ts` → `lib/params/save.js` |
| Ca (params) | `GET /settings/shifts`, `PUT /settings/shifts` → config.read | `src/modules/settings/settings-shifts.controller.ts` → `lib/domain/shifts.js` |
| Kỳ lương | `GET /periods`, `GET /periods/:month`, `/payslips`, `/estimates`, `/estimates/:username` → payroll.view; `GET /periods/:month/payslips/:username` → self-or:payroll.view; `GET /periods/:month/verify` → audit.read; `POST /periods/:month/{lock-attendance → attendance.lock, calculate → payroll.calculate, ai-review → ai.review.read, approve → payroll.approve, mark-paid → payroll.pay, reopen → period.reopen}`; `PUT /periods/:month/payslips/decide` → payroll.approve | `src/modules/periods/periods.controller.ts` → `lib/periods.js` |
| Nhật ký | `GET /audit`, `GET /audit/verify` → audit.read | `src/modules/audit/audit.controller.ts` |
| Khoản điền thêm | `GET /pay-entries` → salary.read; `POST /pay-entries`, `/bulk`, `PUT /:id`, `POST /:id/void` → salary.write; `PUT /:id/decide` → payroll.approve; `POST /:id/confirm-flags` → config.legal | `src/modules/pay-entries/pay-entries.controller.ts` → `lib/pay-entries.js` |
| Yêu cầu ứng lương (lịch sử) | `GET /advance-requests`, `POST /advance-requests`, `POST /:id/cancel` → A; `PUT /:id/decide` → request.decide.*; gửi và duyệt đều trả 410 `ADVANCE_REQUEST_RETIRED`; chỉ đọc lịch sử và huỷ yêu cầu đang chờ dùng được | `src/modules/advance/advance-requests.handlers.ts` |
| Tạm ứng | `GET /advance-approvals`, `POST /request`, `POST /withdraw` → A; `POST /approve`, `/reject`, `/cancel`, `/approve-all` → request.decide.* | `src/modules/advance/advance-approvals.handlers.ts` |
| Giải trình | `GET /explanations`, `POST /explanations` (Check-out muộn `{sessionId,text}`, tự giải trình ngày vắng `{date,text}`, Admin yêu cầu `{username,date,prompt}`), `POST /:id/answer` → A; `POST /:id/decide` → attendance.correct | `src/modules/explanations/explanations.controller.ts` |
| Danh mục | `GET /catalog/positions`, `GET /catalog/shifts` → config.read; `PUT /catalog/positions/:code`, `PUT /catalog/levels`, `PUT /catalog/shifts` → config.payroll | `src/modules/catalog/catalog.controller.ts` |
| Nhân viên | `GET /employees/:uuid` → profile.read; `GET /employees/:uuid/trace` → audit.read | `src/modules/employees/employees.controller.ts` |
| Sổ phép | `GET /leave/ledger` → self-or:profile.read; `POST /leave/refresh` → profile.write | `src/modules/leave/leave.controller.ts` |

Vai trò mặc định và phạm vi (`lib/authz.js`): `admin` (mọi năng lực + `request.decide.*`, phạm vi all), `cb` (nhóm năng lực hồ sơ / lương / chấm công / cấu hình lương / AI / nhật ký, `request.decide.*`, all), `accounting` (xem lương và hồ sơ nhạy cảm, `payroll.pay`, `config.legal`, nhật ký, all), `hr` (hồ sơ và hợp đồng, `attendance.read`, chỉ `request.decide.leave`, all), `manager` (xem hồ sơ / chấm công, `request.decide.*`, phạm vi nhóm — `can()` xử lý phạm vi nhóm như phạm vi chính mình vì chưa có bảng phân công, `lib/authz.js`), `staff` (hồ sơ, chấm công, lương, hợp đồng của chính mình, phạm vi self). Vai trò hiệu lực = vai trò đã gán + `staff` nếu `payrollSubject` + `admin` từ cột `role` (qua `store.roles.effectiveRoles`); tài khoản khoá: không vai trò (`lib/authz.js`). Vai trò tuỳ chỉnh không được cấp `roles.manage` (`RESERVED_CAPS`). Chi tiết ma trận ở `people-access.md`.

### 3.3 Đăng ký module (`src/app.module.ts`)

Không còn bảng gửi theo `seg`: mỗi nhóm route là một module Nest (`src/modules/<tên>/`) với `<tên>.controller.ts`, `<tên>.module.ts`, `index.ts` (cổng công khai) và `<tên>.helpers.ts` (hàm phụ của module). `AppModule.register()` import `FEATURE_MODULES` theo thứ tự rồi `NotFoundModule`:

- Thứ tự import là thứ tự đăng ký route của Express: route cụ thể (`PUT /staff/shift-bulk`, trong module `sheet`) phải đứng trước route có tham số (`PUT /staff/:u`, module `staff`); `NotFoundModule` (`@All('*')`) luôn cuối.
- Module chỉ import module khác qua `index.ts` (ví dụ `attendance` dùng `cutRuleView` của `sheet`); hạ tầng không import module nghiệp vụ; `test/unit/architecture.test.js` giữ các luật đó.
- Controller nhận `@Ctx() c: ApiContext` (đã qua cổng quyền) và `@Res()` (để Nest không tự kết thúc phản hồi: `send()` có thể gửi chậm sau khi nén). Đọc đường dẫn gốc qua `c.seg`, không dùng `@Param` (xem 3.1 bước 5).
- Route mới: thêm khoá vào `ROUTE_CAPS` (`lib/authz.js`), thêm phương thức có decorator vào controller của module, chạy `npm run spec:gen`. Khi đường dẫn Express dài hơn khoá `ROUTE_CAPS` (chỉ `POST /ai/findings/dismiss`) đặt chú thích `// route-key: POST /ai/findings` ngay trên decorator.

### 3.4 Route nền tảng (chi tiết)

#### `GET /api/health` — public (`src/modules/system/system.controller.ts`)
- Chạy `SELECT 1`. Trả `{ ok: true, uptimeSec, loopLagMs: { p50, p99, max }, rssMb, heapMb }` (`lib/ops/runtime-monitor.js` → `snapshot`). Không qua bộ chặn tải.

#### `POST /api/login` — public, không giới hạn tốc độ ghi (`src/modules/auth/auth.controller.ts`)
- Vào: `{ username, password }`; `username` được `trim().toLowerCase()`.
- Khoá giới hạn = `"<ip>|<username cắt tới system.auth.usernameKeyChars ký tự>"`, ip từ `clientIp` (`TRUST_PROXY`).
- Đang bị khoá → 429 `{ error }` (không code) + `Retry-After` (giây).
- Băm luôn chạy (tên không có thật dùng `DUMMY_HASH`), qua `hashGate` (tối đa `PASSWORD_HASH_CONCURRENCY` đồng thời, hàng đợi `PASSWORD_HASH_QUEUE_MAX`; quá → 503 `OVERLOADED`).
- Sai: ghi lần sai; lần này làm địa chỉ bị khoá → 429; còn lại 401 `Sai tên đăng nhập hoặc mật khẩu` (không code).
- Đúng mà tài khoản khoá (`locked_at`) → 403 (không code), không xoá bộ đếm.
- Đúng: xoá bộ đếm; 200 `{ user (publicStaff), holidays, ...geofenceView }` + `Set-Cookie`.

#### `POST /api/logout` — public (`src/modules/auth/auth.controller.ts`)
- Có phiên: `bumpSessionVersion` (mọi cookie đã cấp cho tài khoản hết hiệu lực), `events.closeUser(u, 'logout')`. Luôn 200 `{ ok: true }` + cookie rỗng `Max-Age=0`.

#### `GET /api/me` — public (`src/modules/auth/auth.controller.ts`)
- `{ user|null, serverNow, roles, caps, payrollSubject, agentsEnabled, holidays, ...myPosition(me), ...geofenceView(me) }`.

#### `PUT /api/password` — A (`src/modules/auth/auth.controller.ts`)
- Vào `{ current, next }`. Sai mật khẩu hiện tại → 400; `next` < `PASSWORD_MIN_LENGTH` (6) → 400 (không code). Băm bất đồng bộ (không qua `hashGate`).
- Giao dịch: `setPassword` + audit `password.change`. Sau đó `bumpSessionVersion`, `closeUser(u,'password')`, cấp cookie mới.

#### `GET /api/events` — A (`src/modules/system/system.controller.ts`) — mục 5.

#### `GET /api/settings/version` — A (`src/modules/settings/settings.controller.ts`)
- `{ configRev, mode (params_mode), epoch, build }`.

#### `GET|PUT /api/settings/agents` — roles.manage (chỉ Admin), không periodScope (`src/modules/settings/settings.controller.ts`)
- Công tắc Agents là cài đặt `agents_enabled` (`'1'` bật, `'0'` tắt, mặc định tắt; `lib/agents.js`). `GET` trả `{ enabled }`; `PUT { enabled: boolean }` (kiểu khác → 400) chỉ ghi khi đổi: giao dịch `configRev.bump()` + audit `setting.agents` (before/after `{ enabled }`), sau COMMIT `announceSetting('agents')`. `GET /api/me` trả `agentsEnabled`. Khi tắt, mọi route Trợ lý AI và bước `POST /api/periods/:month/ai-review` trả 403 `AGENTS_DISABLED`, `assertNotAiBlocked` không chặn, và kỳ không có cảnh báo `AI_NOT_RUN`.

#### `PUT /api/settings/geofence` — config.payroll (`src/modules/settings/settings.controller.ts`)
- Thân `null` hoặc `{ geofence: null }` = tắt; thân khác qua `cleanGeofence`. Giao dịch: ghi `settings.geofence`, `configRev.bump()`, audit `setting.geofence` (chỉ `enabled`, `radiusM`, `centreChanged`, không ghi toạ độ); sau COMMIT `announceSetting('geofence')`. Trả `{ geofence }`.

#### `GET /api/audit` — audit.read (`src/modules/audit/audit.controller.ts`)
- Query: `limit` (mặc định `AUDIT_PAGE_DEFAULT` 50, trần `AUDIT_PAGE_MAX` 200; không nguyên dương → 400), `afterId`, `beforeId` (chuỗi số, sai → 400), `from`, `to` (`YYYY-MM-DD`, đổi thành biên ngày giờ VN sang ISO UTC bằng `vnDayIso`), `month`, `actor`, `action`, `entity` (`loại` hoặc `loại:id`), `subject`.
- Lọc mức nhạy cảm theo người xem: `normal` luôn; `pay` khi `salary.read` phạm vi all; `pii` khi `profile.sensitive.read` all (`authz.auditSensitivities`).
- Thứ tự: mới nhất trước; có `afterId` (và không `order`) thì cũ nhất trước (`lib/db.js`).
- Trả `{ rows: [publicRow], total, limit, nextBeforeId }`; `nextBeforeId` = id cuối khi trang đầy và không có `afterId`, ngược lại null. `total` đếm đủ (không đặt `cap`).

#### `GET /api/audit/verify` — audit.read (`src/modules/audit/audit.controller.ts`)
- `store.audit.verify()` → `{ ok, checked, firstBadId, reason, unverifiable }` (mục 4.7).

#### `GET /api/ai/review?month=YYYY-MM[&impacts=1]` — ai.review.read, route nặng (`src/modules/ai/ai.controller.ts`)
- `month` sai → 400 (không code). Kết quả `aiReviewResultCached(month, impacts==='1')` + `findings` gắn `dismissed: { by, at, note } | null` (`lib/findings.js` → `annotate`) + `period: { status }`.
- Trường của kết quả: `asOf, month, findings, systemFindings, checked { rules, ruleIds, staff, days, skipped, payrollErrors }, checklist, summary { total, bySeverity, byRule }, thresholds, names`, có `impacts` khi yêu cầu.
- Không ghi DB. Không phụ thuộc khoá kỳ.

#### `POST /api/ai/findings/dismiss` — ai.review.dismiss (`src/modules/ai/ai.controller.ts`, `lib/findings.js`)
- Vào `{ month, username, rule, reason }`. Đường dẫn khác `/dismiss` dưới `/ai/findings` → 404.
- Lỗi: `month` sai → 400; thiếu `username`/`rule` → 400 `BAD_ARGS`; tự bỏ qua phiếu của mình → cảnh báo `SELF_DECISION_FORBIDDEN`; lý do > 300 → 400 `REASON_REQUIRED`; chưa có lần tính → 409 `PERIOD_NOT_READY`; lần chạy không ở trạng thái `draft` → cảnh báo `PERIOD_STATE` và vẫn ghi; không phiếu → 404 `PAYSLIP_NOT_FOUND`; phiếu không có cờ → 404 `FINDING_NOT_FOUND`.
- Ghi (một giao dịch, chỉ khi chưa bỏ qua với cùng digest): dòng `ai_finding_actions` + audit `ai.finding.dismiss` (pay).
- Trả `{ month, username, rule, dismissed: true, already, by, at, remaining }`.

#### `GET /api/settings/params`, `GET /api/settings/first-run`, `PUT /api/settings/params`, `POST /api/settings/params/preview`, `POST /api/settings/params/revert` — config.read (`src/modules/settings/settings.controller.ts`)
- `month` mặc định tháng hiện tại, sai dạng → 400 `BAD_MONTH`; `group` phải nguyên. `GET` trả `paramsStore.view`/`firstRun`. Ghi / xem trước / hoàn tác đi qua `lib/params/save.js` (mục 4.10); kết quả có `notice` thì `events.emit.paramsChanged`.

#### `GET /api/employees/:uuid?month=` — profile.read (`src/modules/employees/employees.controller.ts`)
- uuid sai → 400 `BAD_UUID`; month sai → 400 `BAD_MONTH`; không có → 404 `EMPLOYEE_NOT_FOUND`. Trả `{ month, employee }`, che `position.baseSalary/kpiMax` khi thiếu `salary.read`, `birthday` khi thiếu `profile.read.pii`.

#### `GET /api/employees/:uuid/trace?beforeId=&limit=` — audit.read
- `beforeId` sai → 400 `BAD_CURSOR`. Nhật ký về người đó (dòng có `subject_uuid` + dòng ghi theo `subject = username` chưa có uuid), lọc mức nhạy cảm như `/audit`, `limit` ≤ 200.

#### `GET /api/leave/ledger?user=` — self-or:profile.read
- Người khác mà không `can(profile.read)` → 403 `FORBIDDEN_CAP`; user sai dạng → 400 `BAD_USER`; không có → 404 `STAFF_NOT_FOUND`.
- GET này ghi DB: gọi `leave.refresh(staff)` (ghi `leave_ledger`, `staff.leave_balance`). Trả `{ username, uuid, hasAccount, balance, on, summary, events }`.

#### `POST /api/leave/refresh` — profile.write
- `{ user? }` → tính lại một người (`{ checked:1, accounts, failed:0, balance }`) hoặc tất cả (`refreshAll()`). Không audit, không khoá kỳ.

Các route nghiệp vụ còn lại (sheet, punch, kpi, approvals, periods, staff, params, pay-entries, advance, explanations…) thuộc đặc tả module tương ứng.

### 3.5 Hành vi dưới khoá kỳ

- Route nền tảng (`agents`, `geofence`, `/audit*`, `/events`, `/health`, `/login`, `/me`, `/password`, `/ai/review`) không có `periodScope` → không bị khoá kỳ.
- `POST /ai/findings/dismiss`: lần chạy không ở trạng thái `draft` → cảnh báo `PERIOD_STATE`.
- Kiểm bảo mật, quyền, định dạng, không tồn tại, quá cỡ, chống ghi đè (`*_STALE`) luôn chặn, không qua `warnIf`.
- Ngoại lệ vẫn chặn: `assertNotAiBlocked` (409 `AI_BLOCKED`, chỉ khi công tắc Agents bật), khoá kỳ của tạm ứng (`src/modules/advance/advance-approvals.handlers.ts`, 409 `PERIOD_LOCKED` khi kỳ `approved`/`paid`).

---

## 4. Cách tính / quy tắc

### 4.1 Nạp môi trường và khởi động (`server.js`, `src/bootstrap.ts`, `src/main.ts`)

1. `server.js`: đặt `UV_THREADPOOL_SIZE` (mặc định `config.UV_THREADPOOL_SIZE` = 8) — nạp `lib/config.js` trước khi đọc `.env`, nên biến này đặt trong `.env` bị bỏ qua.
2. `require('./lib/register-ts')`: đăng ký `tsx` để nạp `src/**/*.ts` lúc chạy.
3. `loadDotEnv(__dirname)` (`src/env.ts`): đọc `.env` cạnh `server.js` nếu có; dòng `KEY=value` (khoá `[A-Z0-9_]+`, bỏ dòng `#`, bỏ một cặp nháy), không ghi đè biến đã có. Phải chạy trước mọi module đọc biến lúc nạp (`DB_PATH`, `SESSION_SECRET`).
4. `createServer()` (`src/bootstrap.ts`): `initApp()` (`src/app.init.ts`: `store.setDefaultContractResolver(...)`, `Roles.reconcileStaffRole()`), dựng ứng dụng Nest bất đồng bộ (`NestFactory.create(AppModule.register(), new ExpressAdapter(...), { bodyParser: false })`), trả `http.Server`; đặt `keepAliveTimeout` 65 s, `headersTimeout` 66 s, `requestTimeout` 30 s; gắn `server.limits`. Yêu cầu đến trước khi Nest sẵn sàng thì chờ.
5. `lib/db` mở DB và chạy migration khi được nạp; `hashGate`, `writeLimiter`, `shedder`, `monitor` dựng ở `src/http/load-control.ts` — giới hạn đọc env `PASSWORD_HASH_CONCURRENCY`, `WRITE_RATE_PER_MINUTE`, `SHED_MAX_LAG_MS`, `SHED_MAX_INFLIGHT` nếu là số dương (`limitOf`).
6. Chỉ khi `require.main === module`, `start(server)` (`src/main.ts`):
   - `await auth.ready` (khoá ký phiên đọc từ DB khi không đặt `SESSION_SECRET`).
   - DB chưa có ai → tạo `admin` (role admin, `type = Positions.defaultCode`, level 0). Mật khẩu: `ADMIN_PASSWORD` (production cần ≥ `system.auth.adminPasswordMinProduction` = 12 ký tự), trống → production từ chối khởi động, dev sinh ngẫu nhiên (không in).
   - In cảnh báo `TRUST_PROXY` sai dạng.
   - `purgePunchRequests(PUNCH_REQUEST_KEEP_DAYS = 30)` ngay và mỗi `PUNCH_REQUEST_PURGE_MS` (24 h), `.unref()`. Chỉ xoá dòng có `created_at` < now − 30 ngày.
   - `container.leave.start(LEAVE_REFRESH_MS = 3.600.000)`.
   - `listen(PORT || 3000)`, `monitor.start()`, `attachAccessLog`.
   - Tắt êm: SIGTERM/SIGINT/IPC `'shutdown'` → `events.closeAll()`, hẹn thoát cưỡng bức sau `SHUTDOWN_GRACE_MS` (10 s, mã `code || 1`), `server.close` → đóng DB → `exit(code)`, `closeAllConnections()`. `uncaughtException` → log + tắt êm mã 1; `unhandledRejection` → chỉ log.

### 4.2 Phiên đăng nhập (`lib/auth.js`)

- Mật khẩu: `scrypt$<salt hex 16 byte>$<hash hex 64 byte>`; so sánh `timingSafeEqual`.
- Cookie: tên `SESSION_COOKIE_NAME` (mặc định `luong_sid`), giá trị `base64url(JSON{ u, v, sv, exp }) + '.' + HMAC-SHA256(SECRET)` base64url. `v` = `system.auth.passMarkChars` (16) ký tự đầu của `HMAC('pw:' + pass_hash)` (đổi mật khẩu → phiên đã cấp vô hiệu), `sv` = `staff.session_version`, `exp` = now + `SESSION_DAYS` ngày (env `SESSION_DAYS` thắng `system.session.days` = 14).
- Thuộc tính: `Path=/; HttpOnly; SameSite=Lax; Max-Age=<giây>` + `; Secure` khi `COOKIE_SECURE=1`.
- `readSession` hợp lệ khi: chữ ký khớp, `exp > now`, `v` khớp mật khẩu hiện tại, tài khoản tồn tại, chưa khoá, `sv` (thiếu = 0) bằng `session_version`.
- `SESSION_SECRET`: env; nếu `NODE_ENV=production` hoặc `COOKIE_SECURE=1` mà thiếu → ném lỗi lúc nạp; dev sinh 32 byte lưu `settings.session_secret`.
- Giới hạn đoán (khoá `system.login.*`): 5 lần sai / 15 phút cho cùng (ip, tên) → khoá cặp 15 phút; 30 tên khác nhau sai từ một ip / 15 phút → khoá ip 15 phút; trần 5000 mục mỗi bảng. Thời gian chờ trả về = max(khoá cặp, khoá ip), làm tròn lên giây; câu báo dùng `ceil(giây/60)` phút.
- `clientIp`: không `TRUST_PROXY` (hoặc sai, phải nguyên 1..`system.auth.trustProxyMaxHops` = 10) → địa chỉ socket; có `n` → mục thứ `n` từ phải của `X-Forwarded-For`, không phải IP thì về địa chỉ socket (`lib/http.js`).

### 4.3 Cảnh báo thay cho chặn (`lib/warnings.js`)

- `warnIf(code, violated, opts)`: `violated` sai → `false`. `quiet` → chỉ trả `true`; còn lại `warn(code, text, extra)` với `text` = `message` (+ `". " + consequence`), `extra` gồm `severity`, `count`, `link`, `details`.
- `warn`: ngoài yêu cầu → bỏ; trùng (code, message) → bỏ; > 50 → đếm `dropped`.
- `take()`: danh sách + mục `WARNINGS_TRUNCATED { count }` nếu có dư. `codes()`: mã không trùng, tối đa `WARN_CODES_AUDIT_MAX` (20).
- `selfDecision(isSelf, …)` = `warnIf('SELF_DECISION_FORBIDDEN', isSelf, { message: … })`.
- `scope({ label, details }, fn)`: trong `fn` (đồng bộ) mọi `warn` đổi message thành `"<label>: <message>"` và trộn `details` vào cảnh báo, nên cùng một cảnh báo của hai người là hai mục (dùng ở `PUT /sheet/bulk`); ngoài yêu cầu thì chỉ chạy `fn`.
- `optionalReason(value, { max=300, … })`: cắt khoảng trắng; > max → lỗi 400 (code mặc định `REASON_REQUIRED`); trả chuỗi (có thể rỗng).
- Phản hồi 2xx dạng object mang `warnings: [{ code, message, severity, ...}]`; yêu cầu lỗi không mang cảnh báo.
- Audit: mọi dòng ghi trong yêu cầu có cảnh báo nhận `after.warnings = codes()`; nếu có `SELF_DECISION_FORBIDDEN`/`APPROVAL_SELF` và `entry.subject === actor` thì thêm `after.self = true` (`lib/audit.js`).

### 4.4 Giới hạn tải (`lib/ops/limiters.js`, `lib/ops/route-classes.js`)

- `RateLimiter` (ghi): mỗi tên đăng nhập một xô, dung lượng = `perMinute` (240), nạp `perMinute/60000` token/ms theo `performance.now()`. Còn ≥ 1 token → trừ 1, trả 0. Hết → `max(1, ceil((1 − tokens) / refillPerMs / 1000))` giây.
- Không giới hạn: `POST /punch`, `POST /login`, `POST /logout` (`lib/ops/route-classes.js`).
- `LoadShedder` cho `HEAVY_ROUTES` = `GET /team`, `GET /alerts`, `GET /approvals`, `GET /periods/:month/estimates`, `GET /staff`, `GET /ai/review`, `PUT /sheet/bulk`: từ chối khi `apiInflight ≥ 150` ("quá nhiều yêu cầu đang xử lý") hoặc trung vị trễ vòng lặp gần đây `p50 ≥ 150 ms` ("máy chủ đang nghẽn"). `Retry-After` 3 giây.
- `AsyncGate` (băm đăng nhập): `running < 4` chạy ngay; không thì xếp hàng nếu hàng < 200, không thì `Overloaded`.
- `RuntimeMonitor`: histogram độ phân giải 20 ms, cứ 5000 ms lưu cửa sổ đã kết thúc rồi reset; `recent()` = max của cửa sổ hiện tại và cửa sổ trước; mỗi mẫu trừ 20 ms độ phân giải, làm tròn 0,1 ms.

### 4.5 Bộ nhớ đệm phép tính nặng (`lib/ops/compute-cache.js`)

`get(key, compute)`: `rev = total_changes()`; mục có sẵn dùng lại khi `rev` bằng và `0 ≤ tuổi < 15000 ms`; không thì tính, chỉ lưu nếu `total_changes()` chưa đổi trong lúc tính; vượt 64 mục bỏ mục chèn sớm nhất. Giao dịch hoàn tác vẫn làm `total_changes()` tăng (chỉ làm mất cache, không sai). Người dùng: soát AI (`ai-review|<tháng>|<0|1>`), ước tính cả kỳ (`estimates|<tháng>`, `lib/periods.js`).

### 4.6 File tĩnh (`lib/http.js`)

- `PUBLIC` = `public/`; `WEB_DIST` = `WEB_DIST` (env) hoặc `web/dist`.
- `/` → `web/dist/index.html` nếu có (`no-cache`), không thì 503 kèm câu hướng dẫn build (không chuyển hướng).
- Giải mã đường dẫn (sai → 404), có `\0` → 404; ghép với `WEB_DIST` (nếu có index) rồi `public/`; ra ngoài thư mục gốc → 404.
- Cache: `/assets/*` trong `web/dist` → `public, max-age=31536000, immutable`; còn lại `no-cache`. ETag yếu `W/"<size hex>-<mtime hex>"`, `If-None-Match` khớp → 304.
- Đuôi `.html .js .css .svg .json .txt` ≤ 2 MB: đọc + gzip mức 9 một lần, giữ RAM; gửi gzip nếu client nhận và nhỏ hơn; `HEAD` không gửi thân. File khác: stream bằng `pipeline`.
- Có `web/dist` mà đường dẫn không đuôi và không có file → trả `index.html` (router Vue). Ngược lại 404 `Not found`.
- Kiểu MIME khai: html, js, css, png, svg, ico, jpg, webp, woff2, json, txt; đuôi khác → `application/octet-stream`.

### 4.7 Nhật ký kiểm toán

**Ghi** (`lib/audit.js` → `lib/db.js`):
1. `withWarnings` (4.3). Hàng rào: `JSON.stringify([before, after, reason, entityId])` khớp `/scrypt\$|luong_sid|pass_?hash|session_secret|"?(lat|lng)"?\s*:/i` → ném `Error` (500, cả thao tác hoàn tác).
2. Kiểm: `actor`, `action`, `entityKind`, `entityId` bắt buộc; chuỗi ≤ 200 ký tự (reason ≤ 300, requestId ≤ 100); `sensitivity ∈ normal/pay/pii`; mỗi JSON ≤ 65.536 ký tự; `actorRoles` sắp xếp; `month` qua `monthOf` (nhận ngày → tháng). Lỗi → `AUDIT_ARGS` (500).
3. Tra `uuid` của `subject` và `actor` (không vào chuỗi băm).
4. Trong `transaction`: đọc dòng cuối; `id = last.id + 1` (1 nếu trống), `prev_hash = last.hash` ('' nếu trống); `hash = 'hmac-sha256:' + HMAC(AUDIT_KEY, canonical)` nếu có `AUDIT_KEY`, không thì `'sha256:' + SHA256(canonical)`.
5. `canonical = JSON.stringify([id, prev_hash, at, actor, actor_roles, action, entity_kind, entity_id, subject, month, before_json, after_json, reason, sensitivity, request_id])` (null cho trường vắng) (`lib/db.js`).

Quy ước người gọi: gọi `audit.write` bên trong `store.transaction` của thao tác; yêu cầu bị từ chối ném trước khi ghi.

**Kiểm** `verify()` (`lib/db.js`): đọc theo trang 1000 dòng tăng dần id; dòng đầu tiên sai → `{ ok:false, checked, firstBadId, reason }` với `reason`: `PREV_HASH` (đứt nối), `ID_GAP` (id không liên tiếp), `HASH` (nội dung đổi). Dòng HMAC mà thiếu khoá: đếm `unverifiable`, chỉ kiểm nối. Kết thúc: có `unverifiable` → `{ ok:false, reason:'AUDIT_KEY_MISSING', unverifiable }`; không thì `{ ok:true, checked, reason:null }`.

**Lọc** `auditFilter` (`lib/db.js`): `actor`, `action`, `subject`, `subjectUuid`, `person {uuid, username}`, `month`, `entity`/`entityKind`/`entityId`, `from`/`to` (ngày trần = biên ngày UTC; ISO đủ thì dùng nguyên), `sensitivities`, `afterId`, `beforeId`. `count(filter, { cap })` dừng đếm ở `cap` nếu có.

**Hồ sơ nhân sự** (`lib/audit.js`): một lần lưu có thể sinh tới 3 dòng `staff.create|staff.update`: trường thường (`name, familyName, givenName, role, shiftCode, startDate, jobTitle, contractStatus, resignedOn`, kèm `passwordSet` nếu đặt mật khẩu) mức normal; trường tiền (`type, level, nightPct, idorm, contract, insured, dependants, leaveAdjust, taxOn, deductOn, advanceOn`) mức pay; `birthday` chỉ ghi `{ changed }` mức pii.

**Số sửa phiếu** (`lib/audit.js`): một dòng `slip.override` cho mỗi ô đổi, `entityId = "<user>:<tháng>:<ô>"`, pay.

### 4.8 SSE — xem mục 5.

### 4.9 AI rà soát (`lib/ai/review.js`, `lib/domain/ai-review.js`)

**Đầu vào do máy chủ dựng** (`lib/domain/ai-review.js`): tham số hiệu lực của tháng (`paramsStore.resolve(month)`), mọi staff, danh sách `insured IS NULL`, lịch ước tính của người được trả lương (mọi tháng), mọi `sheet_approvals`, mọi phiên chấm công, ngày lễ, điểm KPI 5 phần của tháng, số sửa phiếu của tháng, người được duyệt tạm ứng của tháng, bộ máy lương của tháng và tháng trước (nhớ theo `paramsHash`; nạp lỗi → `null`, luật cần tiền bị bỏ qua), các khoá `param_versions` có `effective_month = tháng`. Mỗi lần tính ghi một dòng log đếm (không tên, không tiền).

**Thuật toán `review()`** (`lib/ai/review.js`):
1. `prepare`: `asOf` ISO hợp lệ, `month` `YYYY-MM` (sai → `TypeError` → 500). Người xét = staff có `payrollSubject` (vắng thì `role !== 'admin'`). Hàng duyệt chỉ nhận item thuộc `ApprovalView.ITEMS` và trạng thái pending/approved/rejected. Khoản được soát mặc định là `pending`.
2. Với từng luật theo thứ tự `RULES`: bỏ qua (ghi `checked.skipped` kèm lý do) nếu `ai.rule.<camelCase>.enabled === false`, `skipWhen` trả lý do, cần `payroll` mà không có.
3. Chạy runner → mỗi hit thành finding: evidence chỉ được chứa trường trong `rule.fields` (khác → ném `Error`), `id = "<luật>:<user>:<ngày|tháng>"` (hệ thống: `"<luật>:system:<khoá>"`), `digest` = băm `inputs`, `approval = { rev, fingerprint }` nếu gắn khoản. Trùng `id` → bỏ.
4. Sắp: mức (high < medium < low) → user → ngày → luật. `impacts` (khi yêu cầu và có bộ máy): với mỗi khoản đang soát, `impactVnd = round(tổng thu nhập nếu duyệt − nếu từ chối)`, giả định các khoản chờ khác được duyệt.
5. `checklist`: `pending-items`, `flagged-items`, `punch-waiting`, `profile-gaps`, `kpi-unapproved`, `slip-overrides`, `holidays`.

**Danh mục luật** (`lib/ai/review.js`, `lib/ai/rules-extra.js`):

| Luật | Mức | Phạm vi | Ngưỡng | Cần |
| --- | --- | --- | --- | --- |
| `isat-frequency` | medium | item | isatPerMonth | |
| `approved-leave-frequency` | medium | item | approvedLeavePerMonth | |
| `leave-with-checkin` | high | item | — | |
| `late-declaration` | medium | item | reportDeadlineDay | |
| `previously-rejected` | medium | item | rejectedLookbackDays | |
| `repeated-edits` | low | item | repeatedEditsRev | |
| `ot-checkin-mismatch` | high | item | presenceGapMin | checkin |
| `ot-after-pending-makeup` | medium | item | — | |
| `holiday-work-review` | medium | item | — | |
| `attendance-allowance-risk` | high | item | attendMaxAbsentDays, overLimitHours | payroll |
| `large-pay-impact` | medium | item | impactVnd | payroll |
| `ot-above-team` | medium | person | otMedianFactor, otMedianMinHours, otMedianMinPeers | payroll |
| `missing-start-date` | medium | person | — (từ `lib/data-quality.js`) | |
| `negative-leave` | high | person | — (từ `lib/data-quality.js`) | |
| `missing-fixed-shift` | medium | person | — | |
| `slip-override-gap` | medium | person | slipDiffVnd, slipDiffRatio | payroll |
| `locked-with-pending` | medium | item | — | |
| `kpi-self-100-streak` | low | person | kpiFullMonths, kpiFullPct | legacyKpi |
| `net-nonpositive` | high | person | — | payroll |
| `formula-changed-recently` | low | system | paramChangePeoplePct | |
| `block-flags-unconfirmed`, `override-looks-like-entry` | (rules-extra) | | formulaChangeTotalVnd / overrideEntryRoundVnd… | |

`attendance-allowance-risk` xác định "duyệt thì giữ / mất chuyên cần" bằng cách chạy bộ máy lương hai lần (duyệt và từ chối khoản đó, các khoản chờ khác coi là duyệt) rồi so cờ chuyên cần của kết quả (`attendOk`, số ngày vắng, giờ vượt ngưỡng); ngưỡng `attendMaxAbsentDays` (khoá `type.nv.maxAbsent`) chỉ dùng để viết câu "ngày nghỉ thứ N", còn điều kiện đạt / mất do bộ máy lương xác định (số ngày tính theo từng chức vụ trong bộ máy, xem `payroll-engine.md`).

**Ngưỡng** (`lib/ai/thresholds.js`): giá trị = tham số của tháng theo khoá; vắng/null → mặc định trong bảng; khác mặc định → đánh dấu `proposal` (với khoá `ai.threshold.*`).

| Tên | Khoá tham số | Mặc định | Đơn vị |
| --- | --- | --- | --- |
| isatPerMonth | ai.threshold.isatPerMonth | 4 | lần/tháng |
| approvedLeavePerMonth | ai.threshold.approvedLeavePerMonth | 3 | lần/tháng |
| reportDeadlineDay | period.reportDeadlineDay | 3 | ngày của tháng sau |
| rejectedLookbackDays | ai.threshold.rejectedLookbackDays | 60 | ngày |
| repeatedEditsRev | ai.threshold.repeatedEditsRev | 3 | rev |
| presenceGapMin | ai.threshold.presenceGapMin | 30 | phút |
| otMedianFactor | ai.threshold.otMedianFactor | 2 | lần trung vị |
| otMedianMinHours | ai.threshold.otMedianMinHours | 8 | giờ |
| otMedianMinPeers | ai.threshold.otMedianMinPeers | 5 | người |
| attendMaxAbsentDays | type.nv.maxAbsent | 3 | ngày |
| overLimitHours | attendance.overLimitHours | 24 | giờ |
| impactVnd | ai.threshold.impactVnd | 500.000 | VND |
| slipDiffVnd | ai.threshold.slipDiffVnd | 500.000 | VND |
| slipDiffRatio | ai.threshold.slipDiffRatio | 0,2 | tỉ lệ |
| kpiFullMonths | ai.threshold.kpiFullMonths | 3 | tháng |
| kpiFullPct | (không khoá) | 100 | % |
| paramChangePeoplePct | ai.threshold.paramChangePeoplePct | 0,2 | tỉ lệ người |
| formulaChangeTotalVnd | ai.threshold.formulaChangeTotalVnd | 5.000.000 | VND |
| scopeLeakMinPeople | ai.threshold.scopeLeakMinPeople | 1 | người |
| overrideEntryRoundVnd | ai.threshold.overrideEntryRoundVnd | 100.000 | VND |

Giới hạn kỹ thuật `ai.limit.evidenceListMax` (5). Giá trị sai kiểu → `TypeError` (500).

**AI chặn duyệt** (`lib/domain/ai-block.js`): luật chặn = `settings.ai_block_rules` nếu là mảng; chưa đặt → `[]` khi `DB_PATH === ':memory:'`, ngược lại `['leave-with-checkin', 'ot-checkin-mismatch']`. Với mỗi tháng của các khoản sắp duyệt: lấy kết quả soát (cache), khoản trùng (user, date, `approval.rev`) với finding của luật chặn → 409 `AI_BLOCKED { blocked: [{ username, date, rule }] }`, khi công tắc Agents bật; tắt thì không chặn.

**Bước AI của kỳ** (`lib/periods.js`, chi tiết ở `payroll-period.md`): dùng bản tính không qua cache, gắn cờ luật vào phiếu (`payslips.flags_json`), thêm `ai_review_runs`, `markReviewed`, audit `period.ai-review`.

**Bỏ qua cờ** (`lib/findings.js`): `findingId = "slip:<luật>:<user>:<tháng>"`; digest = `"<inputs_digest | run:<id>>|<params_hash>"` của lần chạy hiện hành → tính lại với đầu vào hoặc tham số khác thì lần bỏ qua trước đó hết hiệu lực.

### 4.10 Registry tham số và dữ liệu sinh

**Thành phần**

| File | Vai trò |
| --- | --- |
| `public/payroll-params.js` | `DEFAULTS` (bản phẳng của mọi khoá tham số, khối `GENERATED` do script sinh), `resolveParamSet`, `buildParamClasses`, `canonical`, `UI_COMPONENTS`. Dùng chung trình duyệt + máy chủ. |
| `lib/params/registry.data.json` | Siêu dữ liệu duy nhất: `version`, `groups`, `types`, `aiRules`, `entries` (mỗi mục: `id`, `group`, `section`, `order`, `label`, `class`, `editableBy`, `keys` (mẫu khoá), `valueBearing`, `help`, `basis`, `defaultNote`, `capability`, `phase`, `cost`, `legal`, `firstRun`, `wired`, `unwiredKeys`, `ui.component`…). Không đọc cả file khi duyệt; tra qua `registry.js`. |
| `lib/params/registry.js` | Nạp JSON, biên dịch mẫu khoá `a.<x>.b` thành RegExp (`<x>` khớp đúng một đoạn); `entryFor(key)` chọn mẫu có nhiều chữ cố định nhất; `keysOf(entry)`. Hằng: `CLASSES` (`choice, number, table, formula, fixed, removed`), `EDITABLE_BY` (`admin, accounting, ops, locked`), `LEGAL_TIERS` (`floor, ceiling, exact, release, policy, structure`), `WRITE_CAP` (`admin → config.payroll`, `accounting → config.legal`; `ops`, `locked` không ai sửa trên màn). |
| `lib/params/store.js` | Đọc theo tháng: `resolve(month)` (bộ tham số hiệu lực, đóng băng, kèm `classes`, `rev`, `hash` sha256 của `canonical(params)`, `applied`, `skipped`), `view(month, {group})` (dữ liệu màn Cài đặt, dựng hoàn toàn từ registry), `firstRun(month)`. `params_mode = defaults-only` bỏ qua mọi dòng phiên bản và dùng `DEFAULTS`; `active` chồng các dòng `param_versions` hợp lệ lên `DEFAULTS`, rồi chồng dòng danh mục chức vụ / bậc / ca. Dòng sai cấu trúc hoặc dòng người dùng ghi cho khoá `locked/ops/fixed` bị bỏ qua và báo ở `skipped` (log một lần mỗi dòng). |
| `lib/params/save.js` | Ghi: `preview` (luôn trả dữ liệu, không ghi gì), `save` (các dòng `param_versions` + một dòng nhật ký cho mỗi khoá + `config_rev` trong một giao dịch), `revert` (thêm dòng mới mang giá trị của phiên bản được hoàn tác), `addPosition`, `addLevel`, `addBlock`, `confirmBlock`. |
| `lib/params/validate.js` | Nơi duy nhất sinh thông báo lỗi tham số: kiểm cấu trúc (kiểu, khoảng, tập phương án có `available`), liên trường (`crossChecks`), sàn / trần luật (`floor`/`ceiling`; mức `hard` chặn, mức `warn` trả cảnh báo cần xác nhận). |
| `lib/params/attributes.js`, `positions.js`, `blocks.js`, `block-defs.js` | Thuộc tính mở rộng của bậc lương, chức vụ do C&B thêm, danh mục khối phụ cấp có sẵn, khối phụ cấp do C&B thêm — đều là dữ liệu đi vào các họ khoá hiện có qua cùng đường ghi. |
| `lib/params/wired-flag.js` | `isKeyWired(entry, key)`: khoá đã nối vào bộ máy chưa. |
| `lib/params/keys.lock.json` | Danh sách tên khoá đã phát hành, chỉ thêm. |

**Lưu tham số** (`lib/params/save.js`): thân `{ changes: [{ key, value }], effectiveMonth?, reason, expectedRev, acknowledge?, basis? }`. `effectiveMonth` mặc định là tháng chưa khoá công sớm nhất (`earliestOpenMonth`; chưa có kỳ nào thì là tháng hiện tại); sớm hơn → cảnh báo `PERIOD_LOCKED` kèm `minEffectiveMonth`. `expectedRev` lệch `paramsRev` → 409 `PARAMS_STALE`. Khoá có nền `settings:*` → 400 `PARAM_BACKED_BY_SETTINGS`; khoá `ops`, `locked`, `fixed` → 400 `PARAM_LOCKED`; khoá chưa nối vào bộ máy → 400 `PARAM_NOT_WIRED` (xem trước vẫn kiểm được, liệt kê ở `notWired`). Năng lực theo `editableBy` từng khoá (lô trộn cần cả `config.payroll` và `config.legal`, thiếu một → 403 `FORBIDDEN_CAP`). Tối đa `system.params.maxChanges` (50) thay đổi một lần. Lần Lưu đầu bật `params_mode = active`: cho phép khi không phải môi trường production (`NODE_ENV` ≠ production và `COOKIE_SECURE` ≠ 1), hoặc khi `PARAMS_ALLOW_ACTIVATE=1` (`activationAllowed`, `save.js`). Sửa lịch làm việc của chức vụ cần `SCHEDULE_ALLOW_EDIT=1`, sửa giờ vào / ra của ca có sẵn (`shift.preset.<mã>.in|out`) cần `SHIFT_ALLOW_EDIT=1` trong môi trường production (`save.js,73`); môi trường khác sửa tự do.

**Sinh `DEFAULTS` và kiểm** (`scripts/params/`)

| Script | Lệnh | Việc làm |
| --- | --- | --- |
| `extract-defaults.js` | `npm run params:extract` | Ghi lại khối `GENERATED` của `public/payroll-params.js` từ mã đang chạy (mặc định của `public/actual-hours.js`, `kpi-score.js`, `approval-view.js`, `payroll-graph.js`, `lib/ai/thresholds.js`, `lib/config.js` và một số hằng có tên). Lá nào của nguồn không khớp mục nào trong `key-map.js` thì dừng. Số không có hằng trong mã nằm ở `hand-defaults.json`. `--check`: không ghi, thoát 1 nếu lệch. |
| `key-map.js` | (dữ liệu) | Bảng đường dẫn mã → khoá tham số; mục kiểu `key`, `ignore`, `derived`. |
| `check.js` | `npm run params:check` | Kiểm: `DEFAULTS` khớp mã; mỗi mục registry hợp lệ (loại, `editableBy`, nhóm, nhãn, thành phần giao diện theo loại, khuôn bảng); mọi khoá của `DEFAULTS` thuộc đúng một mục; giá trị dẫn xuất khớp bản chép trong mã; khoá đã phát hành không mất. `--counts` in số mục theo loại / `editableBy` / nhóm. Thoát 1 khi có lỗi. |
| `lock.js` | `npm run params:lock` | Thêm tên khoá vào `keys.lock.json` (chỉ thêm). |
| `doc.js` | `npm run params:doc` | Dựng bảng danh mục cấu hình từ registry (`--out`, `--check`, `--json`). |
| `wired.js` | (tay) `node scripts/params/wired.js [--write]` | Tính cờ `wired` bằng đọc tĩnh văn bản nguồn; `--write` ghi vào registry. |
| `check-fallbacks.js` | (tay) | So bản `FALLBACK` trong các mô-đun dùng chung (`actual-hours, approval-view, kpi-score, punch, leave, payroll-calendar, work-schedule`) với `DEFAULTS`. |
| `gen-formula-vocab.js` | (tay) | Sinh khối `GENERATED` của `public/formula-vocab.js` từ bộ máy lương và registry; `--check` dùng trong `params:check`. |
| `plain-text.js`, `apply-plain-text.js`, `plain-text.json`, `first-run-text.json` | (tay) | Chữ hiển thị cho Admin của từng mục (`help`, `basis`, `legalBasis`, `lockReason`) và chữ Cài đặt ban đầu; `apply-plain-text.js` vá `registry.data.json`. |
| `prove-default-graph.js`, `scan-magic-numbers.js` | (tay) | So đồ thị công thức mặc định với bộ máy từng bit trên ca vàng; quét hằng số ngoài 0 và 1 trong mã tính lương. |

Quy ước khoá: `KEY_RE = ^[a-z][a-zA-Z0-9]*(\.([a-zA-Z0-9_]+))*$`. Các họ khoá đáng nhớ: `system.*` (giới hạn kỹ thuật, `editableBy: ops`), `unit.*`, `ai.threshold.*`, `ai.rule.<id>.enabled`, `ai.limit.*`, `type.<mã>.*`, `level.<mã>.<bậc>.*`, `position.def.<mã>`, `block.def.<mã>`, `class.level.attr.<mã>`, `shift.preset.<mã>.in|out`.

### 4.11 Sao lưu và khôi phục (`scripts/ops`)

**backup-db.js** — `DB_PATH=<db> node scripts/ops/backup-db.js [thư-mục]` (không đọc `.env`):
1. Từ chối: thiếu `DB_PATH`, `:memory:`/`file:`, không phải file, thư mục đích (sau realpath) nằm trong `public/`.
2. Tên `luong-YYYYMMDD-HHMMSS.sqlite` theo giờ VN (UTC+7 cố định); trùng tên → lỗi.
3. Mở DB `readOnly`, `busy_timeout 10000`, `VACUUM INTO '<tên>.partial'`; mở bản sao `readOnly`, `PRAGMA integrity_check` phải đúng một dòng `ok`; `chmod 600`; đổi tên.
4. Xoá bản lâu nhất khớp mẫu, giữ `BACKUP_KEEP` (mặc định 30, nguyên ≥ 1) bản mới nhất (sắp theo tên).
5. Thư mục mặc định: `BACKUP_DIR` hoặc `<repo>/backups`. Mã thoát 1 khi lỗi.

**backup-daily.js** — `--db --dir [--keep] [--verify] [--log] [--label=daily|weekly|monthly]`: gọi `backup()`; `--verify` chạy `verify-backup.js` (timeout 30 phút), mã ≠ 0 (kể cả 2) → đổi tên bản được tạo thành `.failed`; ghi một dòng JSON vào `--log`. Thoát 0 chỉ khi sao lưu xong và (nếu có) kiểm trả 0.

**check-backup.js** — `--dir [--max-age-hours=26] [--log]`: đạt khi có bản đúng mẫu, bản mới nhất (theo mtime) trẻ hơn ngưỡng, không có `<tên>.failed` và không có `.failed`/`.partial` mới hơn bản lành mới nhất. Hỏng in một dòng, thoát 1.

**verify-backup.js** — `[AUDIT_KEY=…] node scripts/ops/verify-backup.js <file> [--skip-periods] [--keep-copy] [--expect-head=<id>]`:
1. Chép file (+ `-wal`, `-shm`) vào thư mục tạm (`VERIFY_TMP` hoặc tmp hệ điều hành), từ chối `.partial`, file trong `public/`, file trùng `DB_PATH`.
2. Trước khi nạp mã máy chủ: `integrity_check`, `foreign_key_check`, đếm dòng mọi bảng; thiếu `staff`/`settings` → hỏng; thiếu bảng của kỳ lương / nhật ký → chỉ báo.
3. Nạp `lib/db.js` trên bản chép (migration chạy trên bản chép), `audit.verify()`; `--expect-head` lớn hơn id cuối → hỏng (bị cắt đuôi). In "mỏ neo" id + 12 ký tự đầu của băm.
4. Mỗi kỳ có `currentRunId`: `periods.verify(tháng)`; có phiếu lệch → hỏng.
5. Mã thoát: 0 đạt, 1 hỏng, 2 một phần (thiếu `AUDIT_KEY` cho dòng HMAC). Xoá bản chép (cả khi `process.exit`).

**restore-drill.js** — `--backup=<file> [--work-dir] [--port=0] [--keep]`: chép thành `restore.sqlite` (xoá `-wal`/`-shm` sót), chạy `server.js` ở tiến trình con với `DB_PATH` bản chép, `PORT`, `SESSION_SECRET` ngẫu nhiên, `COOKIE_SECURE=0`, xoá `ADMIN_PASSWORD`; chờ khởi động ≤ 60 s; kiểm `GET /` = 200 (đã build giao diện) hoặc 503 (chưa build), `GET /api/me` = 200 và ≥ 40 byte, `GET /api/periods` không cookie = 401. Từ chối tên `luong.sqlite`, `.partial`, `.failed`.

**params-mode.js** — `status` (chỉ đọc: mode, config_rev, số dòng param_versions, id audit cuối) hoặc `defaults-only --reason "<10..300>" --yes [--backup-dir=]`: đang `defaults-only` → không làm gì; nhật ký là HMAC mà thiếu `AUDIT_KEY` → từ chối; sao lưu bằng `backup-db.js` (bắt buộc); một giao dịch: `params_mode = 'defaults-only'`, `configRev.bump()`, audit `param.mode` với actor `ops:<user hệ điều hành>`. Không đụng `param_versions`.

#### Sao lưu PostgreSQL (`scripts/ops/pg-backup.js`, `lib/ops/pg-backup.js`)

Dành cho `DB_DIALECT=postgres` (các script SQLite ở trên không dùng được cho PostgreSQL). Không cần `pg_dump`; không đọc `.env`; không in dữ liệu hay mật khẩu (URL được che `//***@`).

| Lệnh | Việc |
| --- | --- |
| `npm run pg:backup` (`pg-backup.js backup [--source=<DB>] [--dir=] [--keep=]`) | `--source` mặc định `DATABASE_URL`, `--dir` mặc định `BACKUP_DIR` hoặc `./backups`, `--keep` mặc định `BACKUP_KEEP` hoặc 30. Xuất mọi bảng trong MỘT giao dịch `REPEATABLE READ` chỉ đọc (ảnh chụp nhất quán dù app đang ghi) ra file `luong-YYYYMMDD-HHMMSS.pgbak.gz` (giờ VN); ghi file `.partial`, tự kiểm lại (`verifyFile`) rồi mới đổi tên và xoá các bản cũ vượt `keep` (chỉ file đúng mẫu tên). |
| `npm run pg:verify` (`verify --backup=<file>`) | Đọc cả file, tính lại số dòng và dấu vân tay SHA-256 từng bảng, so với header; phát hiện file cắt dở (thiếu dòng kết thúc), sửa một ô, gzip/JSON hỏng. |
| `npm run pg:drill` (`drill --backup=<file>`) | Khôi phục vào PGlite trong RAM rồi bỏ: chứng minh bản sao lưu dùng được mà không đụng DB nào; đối chiếu từng bảng và tổng tiền từng kỳ lương. |
| `npm run pg:restore` (`restore --backup=<file> --to=<DB mới> --confirm-new-empty-db`) | Chỉ vào DB MỚI (đã chạy migration, chưa có dữ liệu ngoài các bảng gieo sẵn): thiếu migration hoặc đích không rỗng thì từ chối. Một giao dịch: xoá dòng gieo sẵn, chép theo thứ tự khoá ngoại (`OVERRIDING SYSTEM VALUE`), đặt lại dãy số tự tăng, đối chiếu dấu vân tay từng bảng và tổng tiền kỳ lương TRƯỚC khi COMMIT; lệch là hoàn tác. Thiếu cờ xác nhận thì không làm gì. |

`<DB>` là `postgres://user:pass@host/db`, `pglite:<thư-mục>` hoặc `memory` (chỉ cho restore/drill). Định dạng file: gzip của NDJSON — dòng đầu là header (`format`, `version`, `createdAt`, `migrations`, `order`, `tables[{ name, rows, sha256, identity }]`, `payroll`), tiếp theo `{ t, r }` từng dòng (BYTEA dạng `{ $b64 }`), dòng cuối `{ end, rows }`. Mẫu hẹn giờ hằng ngày: `deploy/systemd/luong-pg-backup.service.example` và `deploy/systemd/luong-pg-backup.timer.example` (sao lưu rồi diễn tập khôi phục bản mới nhất). Test: `test/ops/pg-backup.test.js` (PGlite trong RAM và qua `pg.Pool` tới máy chủ socket giả).

Giới hạn: đọc cả bảng vào bộ nhớ khi xuất/khôi phục (đủ cho quy mô hiện tại; bảng lớn hơn cần xuất theo lô); chưa có sao lưu liên tục (WAL/PITR) — cần `pg_basebackup`/dịch vụ quản lý nếu yêu cầu RPO thấp hơn một ngày. Sao chép bản sao lưu ra khỏi máy chủ là việc vận hành, ngoài phạm vi script.

### 4.12 Sandbox và máy chủ kịch bản

**Sandbox** (`scripts/dev/sandbox-server.cjs`, `npm run sandbox`)

- Ghi đè env bất kể shell: `DB_PATH=':memory:'`, `SESSION_SECRET` ngẫu nhiên, cookie `luong_sandbox_sid`, `SESSION_DAYS=14`, `COOKIE_SECURE=0`, `TZ=Asia/Ho_Chi_Minh`. `global.Date` thay bằng đồng hồ đóng băng, thời điểm đầu là hằng `INITIAL_LOCAL` (07:55 sáng, ngày đầu tháng) giờ Việt Nam; `Date.now()` của mọi mô-đun máy chủ đọc đồng hồ này.
- Là tiến trình Node riêng, nạp `server.js` (ứng dụng NestJS) và chuyển yêu cầu vào `http.Server` của nó (`appServer.emit('request', …)`): mọi đường không bắt đầu bằng `/__sandbox/` (trừ `/`, `/app`, trang có đồng hồ) đi vào ứng dụng thật. Chỉ nhận loopback (socket 127.0.0.1/::1 và `Host` là 127.0.0.1/localhost) → khác 403.
- Cổng `SANDBOX_PORT` (mặc định 3104; 0 = hệ điều hành chọn), nghe `127.0.0.1`. In `SANDBOX_READY {url, initialLocal}`. Bật `monitor` của `server.limits` (vì `start()` ở `src/main.ts` chỉ tự bật khi `server.js` chạy trực tiếp). SIGINT/SIGTERM đóng gọn.
- API điều khiển (POST cần header `X-Sandbox-Control: 1` và `Origin` cùng host; thân ≤ 4096 byte):

| Đường | Việc |
| --- | --- |
| `GET /__sandbox/state` | `{ now, local, user, initialLocal, users[] }` + cookie phiên của người đang chọn. |
| `GET /__sandbox/ops` | Ảnh chụp trạng thái thử tải / sao lưu (`sandbox-ops.cjs`). |
| `POST /__sandbox/clock { local }` | Đặt đồng hồ, dạng `YYYY-MM-DDTHH:mm[:ss]` giờ Việt Nam; sai dạng → 400; lùi giờ khi đã có dữ liệu chấm công (`attendance_sessions`, `attendance_days`, `punches`, `corrections`, `timesheets`, `explanations`) → 400. |
| `POST /__sandbox/user { username }` | Chọn tài khoản (phải có trong `staff`); trả cookie phiên. |
| `POST /__sandbox/reset { confirm: true }` | Đặt lại dữ liệu thử. |
| `POST /__sandbox/<tên của sandbox-ops>` | Nạp người dùng đo tải (tối đa 1.000), chạy / huỷ đo tải (kịch bản `login, checkin, mix, admin-burst, probe`, chạy `scripts/loadtest/run.js` ở tiến trình con nhắm chính sandbox), sao lưu (`VACUUM INTO` tạm, tối đa 6 bản), kiểm (`verify-backup.js`), diễn tập (`restore-drill.js`), làm hỏng bản sao giả. File tạm nằm trong thư mục tạm riêng, xoá khi tắt. |
| `GET /`, `/__sandbox/panel.js`, `/__sandbox/ops.js` | Bảng điều khiển. |
| `GET /app` | 302 tới `/admin` (tài khoản chọn là admin) hoặc `/nhan-vien` kèm `?dong-ho-sandbox=1`; mọi đường dẫn của router Vue (không có đuôi file) khi có tham số đó được trả `index.html` của `web/dist` kèm script đóng băng `Date` chèn vào đầu `<head>` (503 nếu chưa build). |

- Reset (`resetSyntheticData`): trong một giao dịch xoá dữ liệu 13 bảng — `punch_requests, explanations, attendance_sessions, attendance_days, timesheets, slip_overrides, punches, corrections, sheet_approvals, kpi_scores, kpi_score_log, staff, settings` — rồi xoá bảng trạng thái kỳ lương theo thứ tự con trước cha — `payslips, payroll_runs, payroll_periods, ai_finding_actions, ai_review_runs, pay_entries, advance_requests`. Các bảng này có trigger chặn xoá nên sandbox gỡ trigger (đọc từ `sqlite_master`), xoá dòng, tạo lại đúng câu lệnh đã lưu. `audit_log` không bị đụng. Sau đó đồng hồ về `INITIAL_LOCAL`, gieo 7 tài khoản `qa_nv`, `qa_night40`, `qa_night60`, `qa_ctv`, `qa_tts`, `qa_admin`, `qa_cb` (ngày vào làm = ngày của đồng hồ đầu), `holidays = []`, `qa_cb` không nhận lương + vai trò `cb`, người chọn về `qa_nv`.
- Bộ nhớ trong tiến trình sandbox gồm cả DB: tắt tiến trình là mất hết.

**Máy chủ kịch bản** (`scripts/dev/scenarios/`)

- `generate.cjs` dựng DB kịch bản gần một năm vào `out/scenario-year.sqlite` (kèm `events.jsonl`, `cases.json`; `--smoke`, `--only u1,u2`); `server.cjs` mở bản làm việc `out/scenario-year.run.sqlite` (`--fresh` chép lại từ bản dựng; `--at YYYY-MM-DDTHH:mm`) ở cổng cố định 3300, `127.0.0.1`, đồng hồ đóng băng chỉ cho tiến (lưu ở `out/clock.json`), dùng lại bảng điều khiển của sandbox; `/__scenario` liệt kê dàn nhân vật, `/__scenario/as/<tài khoản>` vào thẳng giao diện; lệnh điều khiển `/__scenario/clock|user|reset|state` là tên khác của `/__sandbox/...`, cần `x-scenario-control: 1` hoặc `x-sandbox-control: 1`. `verify.cjs` đối chiếu ra `out/report.md`, `out/report.json`.

### 4.13 Biến môi trường

- **Biến môi trường mã đọc**: `DB_PATH` (bắt buộc), `PORT`, `NODE_ENV`, `COOKIE_SECURE`, `TRUST_PROXY`, `SESSION_SECRET`, `SESSION_DAYS`, `SESSION_COOKIE_NAME`, `ADMIN_PASSWORD`, `AUDIT_KEY`, `ACCESS_LOG`, `WEB_DIST`, `UV_THREADPOOL_SIZE`, `PASSWORD_HASH_CONCURRENCY`, `WRITE_RATE_PER_MINUTE`, `SHED_MAX_LAG_MS`, `SHED_MAX_INFLIGHT`, `PARAMS_ALLOW_ACTIVATE`, `SCHEDULE_ALLOW_EDIT`, `SHIFT_ALLOW_EDIT`; script: `BACKUP_DIR`, `BACKUP_KEEP`, `VERIFY_TMP`, `SANDBOX_PORT`, `SEED_PASSWORD` (`seed.js` ở gốc).

### 4.14 Lệnh npm và cách chạy test

| Lệnh | Làm gì |
| --- | --- |
| `npm start` | `node --no-warnings=ExperimentalWarning server.js` (đọc `.env`). |
| `npm run sandbox` | `scripts/dev/sandbox-server.cjs`. |
| `npm run seed` | `scripts/seed.js` (không đọc `.env`). |
| `npm run seed:demo` | `scripts/db/seed-demo.js`. |
| `npm run backup` | `scripts/ops/backup-db.js`. |
| `npm test` | `node --test "test/**/*.test.js"` (gồm `test/ops`). |
| `npm run test:unit` / `test:api` / `test:ui` | Chỉ thư mục tương ứng (không gồm `test/ops`). |
| `npm run format` / `format:check` | `prettier --write .` / `--check .` (cả repo). |
| `npm run params:extract|lock|check|doc` | `scripts/params/*` (mục 4.10). |

Một file test: `node --no-warnings=ExperimentalWarning --test <file>`. Test không cần `.env`: `test/helpers/api-fixture.js` đặt `DB_PATH=':memory:'`, `SESSION_SECRET`, bật công tắc Agents. Test API chạy `server.listen(0, '127.0.0.1')` (cổng do hệ điều hành chọn) và đồng hồ giả bằng ghi đè `Date.now`. `test/api/sandbox.test.js` chạy sandbox ở tiến trình con.

**Ngân sách cỡ file và todo** (`test/tools`)
- `size-budget.js`: đếm dòng file `.js .cjs .mjs .html .css` theo `git ls-files -co --exclude-standard` (không có git thì duyệt thư mục, bỏ `node_modules, .git, data, docs, playwright-report, test-results, GFT OFFICE, .claude, backups, ban-giao`). ≤ 800 không báo; 801..1200 chỉ in; > 1200 phải có trong `exceptions` của fixture với trần = bội trăm kế tiếp; `--write` chỉ hạ trần; `--allow-growth [--headroom=N]` cho nâng. Test: `test/unit/file-size-budget.test.js` (ba kiểm: không file vượt 1.200 ngoài danh sách, file ngoại lệ không vượt trần, ngoại lệ còn đúng thực tế).
- `check-todo.js`: (1) tĩnh trong `npm test` (`test/unit/todo-baseline.test.js`): đếm chỗ gây todo (`pending(`, `pendingUnless(`, `todo:`, `.todo(`, `{ todo`) theo file trong `test/` (bỏ `red.js`, `test/tools/`, chính test đó), không được tăng; mỗi cờ `mentions('file', /mẫu/)` phải còn khớp. (2) động khi chạy tay: chạy cả bộ test, đọc `# todo N`, đỏ khi `fail > 0` hoặc todo > baseline.
- `free-identifiers.js <đường dẫn…> [--unused] [--allow=a,b]`: in `file:dòng:cột tên` cho tên không khai báo; thoát 1 nếu có.

---

## 5. Realtime và nhật ký

### 5.1 SSE `GET /api/events` (`lib/events.js`)

- Cổng: A. `handleSse` thêm: không có `me` → 401; tổng kết nối ≥ `EVENTS_MAX_TOTAL` (3000) → 503 `EVENTS_FULL` + `Retry-After: 3`.
- Kết nối thứ `maxPerUser + 1` (5 + 1) của cùng người: đóng các kết nối lâu nhất bằng `bye { reason: 'superseded' }`.
- Tiêu đề: `text/event-stream`, `no-store, no-transform`, `X-Accel-Buffering: no`; socket timeout 0, no-delay.
- Khung: `id: <EPOCH>-<seq>` (EPOCH đổi mỗi lần khởi động), `event: <tên>`, `data: <JSON>`.
- Khung đầu `hello { epoch, serverTime, configRev, build }` kèm `retry: 3000`. Có `Last-Event-ID` → thêm `resync {}` (không phát lại tin lỡ).
- Nhịp tim mỗi `EVENTS_HEARTBEAT_SEC` (25 s): đọc lại cookie (`auth.readSession`) — mất hiệu lực (đăng xuất, đổi mật khẩu, khoá, hết hạn) → `bye { reason: 'session' }`; còn → dòng chú thích `: ping`.
- Áp lực ghi: `writableLength > 262.144` byte → đóng lặng (khách nối lại).
- `closeUser(u, reason)` gửi `bye { reason }` cho mọi kết nối của người đó; lý do dùng: `logout`, `password`, `locked`, `session`, `superseded`. `closeAll()` đóng lặng (tắt máy chủ).

**Phát** `publish(name, payload, audience)` (`lib/events.js`): tên lạ hoặc kiểu người nhận không cho phép → ném `Error` (lỗi lập trình). Mỗi lần phát đọc lại hồ sơ người nhận (một lần mỗi người); mất / bị khoá → `bye { reason:'session' }`. Người nhận nhận tầng đầu tiên đủ quyền (`scopeOf(me, cap) === 'all'`); trường ngoài `fields` bị bỏ; chỉ giữ giá trị phẳng (chuỗi, số hữu hạn, bool, null, mảng của chúng). Lỗi khi ghi một kết nối → đóng kết nối đó, không ném cho người gọi.

| Sự kiện | Người nhận | Tầng → trường | Phát ở |
| --- | --- | --- | --- |
| `params.changed` | all | `config.read` → `configRev, fromMonth, kind, groups, by`; còn lại → `configRev, fromMonth` | `emit.paramsChanged`: lưu/hoàn tác tham số (`src/modules/settings/settings.controller.ts`), khối, chức vụ, ca (`src/modules/blocks/blocks.controller.ts`, `positions.js`, `shifts.js`), danh mục (`catalog-change.js`, `kind:'catalog'`), công tắc (`announceSetting`: `agents`, `geofence`, `holidays`). |
| `period.changed` | all | `payroll.view` → `month, status, rev`; còn lại → `month, stage` (`open`/`locked`/`paid`) | `src/modules/periods/periods.controller.ts` sau mỗi bước kỳ. |
| `approvals.changed` | cap `request.decide.*` phạm vi all | `month, pending` (pending = số `sheet_approvals` đang chờ, mọi tháng) | `src/modules/approvals/approvals.controller.ts`, tạm ứng (`src/modules/advance/advance-approvals.handlers.ts`, `advance-requests.js`), giải trình (`src/modules/explanations/explanations.controller.ts`). |
| `attendance.changed` | cap `attendance.correct` phạm vi all | `kind (forgot|ot|punch|explanation), month` | `announceAttendance` (forgot), OT (`src/modules/attendance/attendance.controller.ts`), `announcePunches` (punch), giải trình có phiên (`src/modules/explanations/explanations.controller.ts`). |
| `request.decided` | users | `month, date, decision, kind` | `emit.requestsDecided` (một tin mỗi người: ngày sớm nhất, `decision:'mixed'` nếu khác nhau), `emit.advanceDecided` (`kind:'advance'`, không date). |
| `punch.corrected` | users | `month, date` | `src/modules/attendance/attendance.controller.ts`. |
| `punch.changed` | users | `month, date` | `announcePunches`, giải trình. |
| `estimate.changed` | users | `month` | lịch, KPI, khoản điền thêm, tạm ứng. |
| `payslip.available` | users (người có phiếu) | `month` | `src/modules/periods/periods.controller.ts` (sau mark-paid). |
| `roles.changed` | users | — | gán/thu vai trò (`src/modules/staff/staff.controller.ts`, `lib/roles.js`). |
| `announcement.posted` | all | `id` | Có trong danh mục; mã chạy không phát (chỉ test dùng). |

Quy ước: mọi lần phát nằm sau khi giao dịch của route đã COMMIT (dòng `emit` đặt sau `store.transaction`). `attendanceHints`/`punchHints` gom trong yêu cầu và chỉ phát nếu yêu cầu không ném lỗi.

### 5.2 Hành động nhật ký kiểm toán

| `action` | entityKind | Ghi ở | Mức |
| --- | --- | --- | --- |
| `password.change` | staff | `src/modules/auth/auth.controller.ts` | normal |
| `password.reset` | staff | `src/modules/staff/staff.controller.ts` | xem file |
| `holiday.set` | setting | `src/modules/settings/settings.controller.ts` | xem file |
| `kpi.score` | — | `src/modules/kpi/kpi.controller.ts` | xem file |
| `approval.decide` | — | `src/modules/approvals/approvals.controller.ts` | xem file |
| `slip.override` | slip_override | `lib/audit.js` | pay |
| `ot.declare`, `ot.decide` | — | `src/modules/attendance/attendance.controller.ts` | xem file |
| `setting.agents` | setting | `src/modules/settings/settings.controller.ts` | pay |
| `setting.geofence` | setting | `src/modules/settings/settings.controller.ts` (không ghi toạ độ, chỉ `enabled`, `radiusM`, `centreChanged`) | normal |
| `role.grant`, `role.revoke` | staff_role | `src/modules/staff/staff.controller.ts` | pii |
| `role.create`, `role.update`, `role.deprecate` | — | `lib/roles.js,563,595` | xem file |
| `staff.create`, `staff.update` | staff | `lib/audit.js`; `staff.update` còn ở gán ca hàng loạt (`PUT /staff/shift-bulk`) | normal / pay / pii |
| `staff.lock`, `staff.unlock` | staff | `lib/audit.js` | normal |
| `staff.payrollSubject` | staff | `lib/roles.js` và nhánh `PUT /staff/:u` trong `src/modules/staff/staff.controller.ts` | pay |
| `param.set`, `param.mode` | — | `lib/params/save.js,801`; `param.mode` cả ở `scripts/ops/params-mode.js` | xem file |
| `catalog.position.save`, `catalog.level.save`, `catalog.shift.save` | position / position-level / shift | `src/modules/catalog/catalog.controller.ts,77`, `src/modules/catalog/catalog.controller.ts` qua `catalog-change.js` | pay |
| `sheet.onBehalf` | — | `lib/domain/sheet-on-behalf.js` | xem file |
| `period.lock-attendance`, `period.calculate`, `period.ai-review`, `period.approve`, `period.mark-paid`, `period.reopen` | period | `lib/periods.js,369,404,508,523,536` | pay |
| `payslip.approve`, `payslip.return` | — | `lib/periods.js` | xem file |
| `entry.create`, `entry.update`, `entry.decide`, `entry.void`, `entry.confirmFlags` | — | `lib/pay-entries.js,457,493,523,559` | xem file |
| `advance.create`, `advance.decide`, `advance.cancel` | — | `lib/advance-requests.js,223,256` | xem file |
| `advance.request`, `advance.withdraw`, `advance.approve`, `advance.reject`, `advance.cancel` | — | `src/modules/advance/advance-approvals.handlers.ts,241` | xem file |
| `explanation.request`, `explanation.self`, `explanation.late-checkout` | — | `src/modules/explanations/explanations.controller.ts`, `late-checkout-session.js` | xem file |
| `checkout.late.apply`, `checkout.late.revert` | — | `lib/domain/explanation/late-checkout-session.js` | xem file |
| `attendance.admin.set`, `attendance.admin.remove` | attendance_session | `lib/domain/attendance/admin-presence.js,286` | normal |
| `ai.finding.dismiss` | ai-finding | `lib/findings.js` | pay |

Mọi dòng có `actor`, `actorRoles` (vai trò lúc làm), `requestId` (một UUID cho cả yêu cầu), `at` (ISO UTC). `subject_uuid`/`actor_uuid` tra lúc ghi.

---

## 6. Phụ thuộc

### 6.1 Đồ thị require chính

- `server.js` → `lib/config` (trước `.env`), `lib/register-ts`, `src/env`, `src/bootstrap`, `src/main`; `src/**` → `lib/db`, `lib/auth`, `lib/http`, `lib/request-rules`, `lib/announce`, `lib/authz`, `lib/roles`, `lib/audit`, `lib/params/*`, `lib/periods`, `lib/events`, `lib/findings`, `lib/ops/*`, `lib/explanations`, `lib/domain/*` (container, ai-review, ai-block, …), `lib/warnings`. Đồ thị không vòng do `test/unit/require-cycles.test.js` giữ (quét cả `src/`).
- `lib/db.js` → `lib/warnings` (chỉ `warnIf`, `optionalReason`), `lib/config`, `lib/domain/employee/person-name`, các schema của `lib/domain`, `lib/attendance-sessions`, `lib/approvals`. `warnings.js` không `require('./db')`.
- `lib/http.js` → `lib/auth`, `lib/warnings` (gắn `bindHttpError(HttpError)`), `lib/config`.
- `lib/warnings.js` → chỉ `lib/config` (lá; `test/unit/require-cycles.test.js` giữ).
- `lib/events.js` → `lib/db`, `lib/auth`, `lib/authz`, `lib/config`, `lib/params/config-rev`, `lib/params/registry`.
- `lib/audit.js` → `lib/db`, `lib/authz`, `lib/warnings`.
- `lib/domain/container.js` → `lib/db`, các lớp `lib/domain/*`; nạp muộn `lib/request-rules`, `lib/domain/attendance`, `lib/audit`, `lib/warnings` trong getter (tránh vòng `db ↔ params ↔ domain`).
- `lib/domain/ai-review.js` → `lib/db`, `lib/params/store`, `lib/payroll-service`, `lib/request-rules`, `lib/domain/attendance`, `lib/domain/kpi`, `lib/domain/advance`, `lib/ops/shared-cache`, (muộn) `lib/ai/review`, `lib/ai/thresholds`, `lib/ai/payroll-loader`.
- `lib/ai/*` thuần (không I/O, không đồng hồ), chỉ `require` `public/*.js` và nhau.
- `lib/params/registry.js` → `registry.data.json`, `public/payroll-params.js`; `lib/params/store.js` → `lib/db`, `registry`, `config-rev`, `attributes`, `positions`, `block-defs`, `validate`, `lib/domain/catalog-params`.

### 6.2 Ai gọi nền tảng

- Mọi handler gọi `send`, `readJson`, `HttpError` (`lib/http.js`), `warnIf`/`warn` (`lib/warnings.js`), `audit.write` (trong giao dịch), `events.emit.*` (sau giao dịch), `store.transaction`, `store.assertPeriodOpen`.
- `lib/periods.js` gọi `aiReviewResult` (bản không cache), `lib/ai/thresholds` (`THRESHOLDS` để băm), `shared-cache` (ước tính).
- `lib/params/save.js` gọi `lib/ai/preview-suggestions`, `configRev.bump`, `audit.write`.
- `scripts/ops/verify-backup.js` nạp `lib/db` và `lib/periods`; `scripts/ops/params-mode.js` nạp `lib/db`, `lib/audit`, `lib/params/config-rev`; `scripts/ops/restore-drill.js` chạy `server.js`; `scripts/dev/sandbox-server.cjs` nạp `lib/db`, `lib/auth`, `server.js`.

### 6.3 Mô-đun dùng chung trình duyệt + máy chủ (UMD trong `public/`)

| File | Máy chủ dùng ở (nền tảng) |
| --- | --- |
| `public/payroll-params.js` (`DEFAULTS`) | `lib/auth.js` (số `system.*`, `unit.*`), `lib/ai/*`, `lib/domain/position/schema.js` (gieo danh mục), `lib/approvals.js`, `lib/attendance-sessions.js`, `lib/params/*` |
| `public/payroll-engine.js` | `lib/ai/payroll-loader.js` (AI tính tiền), `lib/payroll-service.js` |
| `public/approval-view.js` | `lib/authz.js` (`DECIDE_ITEMS`), `lib/ai/review.js`, `lib/approvals.js`, `lib/request-rules.js` |
| `public/actual-hours.js`, `public/kpi-score.js` | `lib/ai/review.js`, `lib/request-rules.js` |
| `public/payroll-calendar.js` | `lib/findings.js`, `lib/request-rules.js` |
| `public/leave.js`, `public/punch.js`, `public/work-schedule.js` | `lib/request-rules.js` |
| `public/formula.js`, `public/payroll-graph.js` | `lib/params/validate.js` (kiểm công thức, đồ thị) |

### 6.4 Đổi X thì phải kiểm tra Y

- **Thêm / đổi tên route** → thêm khoá `ROUTE_CAPS` trước (không có → 403 `NO_ROUTE_POLICY`); nếu đường dẫn có tham số phải sửa `routeKey`; đặt phương thức vào controller của module (`src/modules/<tên>/`) và đăng ký module trong `FEATURE_MODULES` đúng thứ tự (route cụ thể trước route có tham số); chạy `npm run spec:gen`; cập nhật `lib/ops/route-classes.js` nếu là route nặng / không giới hạn; chạy `test/api/permissions-matrix.test.js`, `test/api/route-dispatch-golden.test.js` (`record-dispatch.js --write` khi cố ý đổi), `test/unit/route-classes.test.js`.
- **Đổi `routeKey` hay thứ tự `FEATURE_MODULES` (`src/app.module.ts`)** → route có tham số có thể nuốt route cụ thể (ví dụ `PUT /staff/:u` nuốt `PUT /staff/shift-bulk` nếu module `staff` đứng trước `sheet`); kiểm `test/api/route-dispatch-golden.test.js` và `test/unit/architecture.test.js`.
- **Đổi `send` / `HttpError` / nhánh catch** → mọi phản hồi lỗi (`error`, `code`, `details`) và việc gộp `warnings`; giao diện đọc `code`. Test hạ tầng HTTP, `security-headers`, `warnings-cases`, `warnings-no-crash`.
- **Đổi `warnIf`** → mọi chỗ cảnh báo nghiệp vụ trong `lib/db.js`, `lib/periods.js`, `lib/params/save.js`, handler; `after.warnings` trong audit; `test/unit/warnings.test.js`, `test/unit/no-control-mode.test.js`, `test/api/warnings-cases.test.js`.
- **Đổi `assertPeriodOpen` / `SCOPE_LOCKED_FROM`** → mọi route có `periodScope`, `catalog-change.js`, `lib/params/save.js`, `lib/pay-entries.js`, `lib/advance-requests.js`; `test/api/period-lifecycle.test.js`.
- **Đổi lược đồ (bảng/cột/trigger/chỉ mục)** → chỉ thêm; cập nhật bản chụp `test/tools/record-schema.js --write` khi cố ý; `verify-backup.js` (danh sách bảng), `sandbox-server.cjs` (danh sách bảng reset), `test/helpers/api-fixture.js` (`CATALOG_TABLES`, `reset`). Bảng chỉ-thêm không xoá được trong test (fixture bỏ qua) và sandbox (gỡ trigger rồi tạo lại).
- **Đổi `auditCanonical` / `auditHash`** → mọi chuỗi có sẵn không kiểm được nữa (`verify` báo `HASH` từ dòng đầu); `verify-backup.js`, `params-mode.js` (kiểm kiểu băm dòng cuối). Đổi/bỏ `AUDIT_KEY` → dòng HMAC có sẵn thành `unverifiable`.
- **Thêm trường vào `before/after` của audit** → hàng rào `SECRET_RE` (`lat`/`lng` làm hỏng cả thao tác), trần 65.536 ký tự.
- **Thêm sự kiện SSE** → khai trong `EVENTS` (tên, kiểu người nhận, tầng, trường) rồi mới phát; thêm chỗ nghe ở giao diện Vue (`web/src`); `test/api/events.test.js`.
- **Đổi `config.EVENTS_*`** → không đổi khoá registry `system.events.*` tương ứng (hai nơi), và ngược lại.
- **Đổi `lib/config.js`** → chạy `npm run params:extract` (một số hằng là nguồn của `DEFAULTS`), `params:check`; `config` đóng băng lúc nạp và nạp trước `.env`.
- **Thêm / đổi khoá tham số** → thêm vào mã nguồn mặc định, `key-map.js`, mục registry; chạy `params:extract`, `params:lock`, `params:check`; cờ `wired` qua `scripts/params/wired.js --write`.
- **Đổi bộ máy lương (`public/payroll-engine.js`) hay tham số** → kết quả AI (luật cần payroll, `impacts`), cache AI theo `paramsHash`, `verify-backup` (tính lại phiếu từ bản chụp).
- **Đổi luật AI hoặc `rule.fields`** → `EVIDENCE_FIELDS`; id finding (`<luật>:<user>:<ngày>`) và digest xác định hiệu lực lần bỏ qua; `ai_block_rules`/`DEFAULT_BLOCK_RULES` dùng id luật; khoá `ai.rule.<camelCase>.enabled`; `test/unit/ai-review*.test.js`.
- **Đổi ngưỡng AI** → `THRESHOLDS` là nguồn của `ai.threshold.*` trong `DEFAULTS`; `lib/periods.js` băm `THRESHOLDS` khi không có `result.thresholds`.
- **Đổi hành vi của `GET /`** → `restore-drill.js` (đòi `GET /` = 200 khi đã build giao diện, 503 khi chưa) và `test/api/web-dist-static.test.js`.
- **Đổi giới hạn thân yêu cầu** → `MAX_BODY_BYTES` (`lib/http.js`).
- **Đổi cookie / phiên** → SSE heartbeat (đọc lại cookie), `restore-drill`, sandbox (`luong_sandbox_sid`), `test/helpers/api-fixture.js` (`auth.createSession`).

---

## 7. Test hiện có

Bố cục: `test/unit/` (logic thuần và mô-đun dùng chung, không dựng máy chủ HTTP), `test/api/` (máy chủ thật trên DB RAM qua `api-fixture`), `test/ui/` (logic giao diện chạy trong Node: nạp mô-đun `public/` và đọc văn bản file giao diện), `test/ops/` (script sao lưu), `test/fixtures/` (dữ liệu vàng, bản chụp lược đồ, bảng điều phối, ngân sách cỡ file, baseline todo), `test/helpers/`, `test/tools/`. Tên file có tiền tố ngày (`YYYY-MM-DD-…`) là test theo từng tính năng, không khác loại.

**Máy chủ, HTTP, giới hạn tải**: test hạ tầng HTTP + DB, test tải pha 0, `security-headers`, `web-dist-static`, `server-logic-regression` (trong `test/api/`); `limiters`, `route-classes`, `compute-cache`, `require-cycles` (trong `test/unit/`).

**Quyền, điều phối**: `permissions-matrix`, `route-dispatch-golden`, `period-permissions`, `domain-catalog-routes` (`test/api/`); `domain-classes` (`test/unit/`).

**Phiên, đăng nhập**: `mvp-auth`, `verify-fixes`, test đăng nhập tài khoản khoá, test mở khoá nhật ký, `password-reset-admin` (`test/api/`); test băm mật khẩu bất đồng bộ (`test/unit/`).

**Cảnh báo / Agents**: `test/unit/warnings.test.js`, `no-control-mode` (`test/unit/`); `warnings-cases`, `warnings-no-crash`, `warnings-inventory`, `period-flow-warns`, `settings-save-warns`, `agents-toggle` (`test/api/`).

**SSE**: `events`, test realtime chấm công (`test/api/`), dùng `test/helpers/sse-client.js`.

**Nhật ký**: `audit-log`, `audit-paging`, `audit-followup-backend` (`test/api/`).

**DB, migration, kỳ lương**: `db-schema-snapshot`, `session-migration`, `kpi-scores-migration`, `period-lifecycle`, `period-lock-guards`, `period-stale`, `period-reopen`, `payslip-snapshot` (`test/api/`); `db-pay-entries` (`test/unit/`).

**Tham số**: `settings-save`, `settings-save-failures`, `settings-preview`, `save-applies-everywhere`, `params-resolve-robust`, `formula-locked`, `levels-*`, `shifts-edit` (`test/api/`); `formula-*`, `shared-rules-params`, `position-defaults-zero-drift`, `schedule-defaults-zero-drift` (`test/unit/`).

**AI**: `ai-review*` (cùng `ai-review-world.js`), `phase2-review` (`test/unit/`); `ai-review-api`, `ai-review-dismissed`, `findings`, `checklist-punch-review`, test AI chặn duyệt (`test/api/`).

**Bộ máy lương so với khối đóng băng**: `payroll-golden`, `payroll-engine-differential`, `payroll-engine-bad-staff`, `pay-tail-*` (`test/unit/`).

**Phiếu và công thức Admin**: `slip-*` (`test/unit/`), `slip-detail-formulas`, `slip-row-columns-api`, `payslip-*` (`test/api/`).

**Vận hành, sandbox**: `test/ops/backup-db.test.js`, `test/ops/backup-daily.test.js` (cũng chạy `check-backup.js`, `restore-drill.js`), `test/api/sandbox.test.js`, test sandbox đặt lại trạng thái kỳ và giải trình. Không có test riêng cho `verify-backup.js` ngoài đường `--verify` của backup-daily, không có test cho `params-mode.js`.

**Giao diện (Node)**: `test/ui/*.test.js` — nhãn chấm công, lưới chấm công Admin, lịch làm bù Admin, loại ngày, iSAT chỉ thứ Bảy, KPI 5 thành phần, yêu cầu OT ngày lễ và yêu cầu tự gửi của nhân viên.

**Công cụ**: `test/unit/file-size-budget.test.js`, `todo-baseline`, `free-identifiers`, `moved-lines`.

Không có test trình duyệt thật: `@playwright/test` là devDependency nhưng không có `playwright.config.js` hay thư mục `e2e/`.

---

## 8. Giới hạn và điểm lệch của nền tảng

Chỉ ghi nhận hành vi của mã; không phải danh sách việc đã lên lịch.

### 8.1 Số nghiệp vụ nằm rải rác

- Hằng tháng mốc: `DEFAULT_CUTOFF_MONTH` (`lib/approvals.js`).
- Số nghiệp vụ nằm trong `lib/config.js` thay vì registry: `CHECKOUT_GRACE_MIN` (30), `TAX_LONG_TERM_MONTHS` (3) (`lib/config.js`).
- `UV_THREADPOOL_SIZE` đặt trong `.env` bị bỏ qua vì `lib/config.js` được nạp trước khi `.env` được đọc (`server.js` và); chỉ biến môi trường thật của tiến trình có tác dụng.
- `scripts/ops/backup-db.js`, `backup-daily.js`, `check-backup.js`: độ lệch múi giờ VN viết cứng `7 * 3600 * 1000`; `lib/ai/units.js` đọc từ `unit.vnUtcOffsetMin`.

### 8.2 Cùng một giá trị ở nhiều nơi

- Độ dài lý do 10..300: `lib/config.js` (`REASON_MIN/MAX`), `lib/db.js` (hằng riêng), `scripts/ops/params-mode.js` (hằng riêng), `lib/approvals.js` (`DEFAULTS['control.reasonMaxLength']`), CHECK trong DDL (`lib/db.js,538,585`).
- Giới hạn SSE: `lib/events.js` đọc `config.EVENTS_*`, registry có `system.events.*`; tương tự `system.audit.page*` vs `config.AUDIT_PAGE_*`, `control.reasonMinLength` vs `config.REASON_MIN`, `system.login.*` (dùng ở `lib/auth.js`) vs `config.LOGIN_*` (chỉ là nguồn cho `extract-defaults`). `config.LOGIN_WINDOW_MIN`, `config.ATTR_MAX_PER_CLASS` không được mã chạy đọc (chỉ `scripts/params/key-map.js`).
- `MAX_BODY_BYTES = 1e6` viết cứng ở `lib/http.js` (không trong `config`), registry có `system.http.maxBodyBytes`.
- Hàm trùng: `realResolve`/`isInside` ở `scripts/ops/backup-db.js` và `verify-backup.js`; chuỗi tên theo giờ VN ở `backup-db.js`, `backup-daily.js`, `check-backup.js`; `vnDayIso` ở `src/modules/audit/audit.helpers.ts`.
- `test/session-contract-helper.js` giống hệt `test/helpers/session-contract-helper.js`.
- `seed.js` ở gốc khác `scripts/seed.js` (lệnh `npm run seed` chạy bản trong `scripts/`); bản gốc mặc định mật khẩu `'123456'` (hoặc `SEED_PASSWORD`).

### 8.3 Ba cách khoá kỳ

- `guardPeriod` (`src/http/api-gate.ts`): `assertPeriodOpen` + `warnFrozen` (cảnh báo `PERIOD_FROZEN`).
- Gọi thẳng `store.assertPeriodOpen` (không có `PERIOD_FROZEN`): `lib/domain/shared/catalog-change.js`, `lib/params/save.js`, `lib/pay-entries.js`, `lib/advance-requests.js`.
- Tự kiểm riêng, chặn cứng: `src/modules/advance/advance-approvals.handlers.ts`.
- `PUT /staff/:u/schedule` khai `periodScope: 'attendance'` (`lib/authz.js`) nhưng handler ở `lib/domain` không dùng `guardPeriod`; `periodScope` ở đây chỉ là tài liệu.

### 8.5 Hành vi dễ gây lỗi dây chuyền

- `lib/domain/ai-block.js` rẽ nhánh theo `process.env.DB_PATH === ':memory:'` → sandbox (cũng DB RAM) không có AI chặn duyệt khi chưa đặt `ai_block_rules`.
- `scripts/ops/restore-drill.js` đòi `GET /` = 302; `lib/http.js` trả 200 `index.html` khi có `web/dist` → diễn tập khôi phục không qua khi `web/dist` có mặt, trừ khi `WEB_DIST` trỏ chỗ khác.
- `initApp()` (`src/app.init.ts`) gọi `Roles.reconcileStaffRole()` ghi DB ngay khi dựng máy chủ, tức khi `require('./server')` (test, sandbox, restore-drill).
- `GET /api/leave/ledger` ghi DB (`src/modules/leave/leave.controller.ts`) → làm `total_changes()` tăng, xoá cache AI/ước tính; `POST /api/leave/refresh` ghi mà không có audit.
- `lib/ops/shared-cache.js` nhớ câu lệnh `total_changes()` trên `store.db` lần đầu, không dựng lại khi `store.db` đổi; `lib/domain/container.js` thì kiểm `store.db` đổi.
- `lib/events.js` `approvalsChanged(month)`: `pending` đếm `sheet_approvals` chờ của mọi tháng (không phải `month`), không gồm tạm ứng / giải trình, dù hai nhóm đó cũng phát sự kiện này.
- `lib/domain/shared/catalog-change.js` phát `groups: [entity.entityKind]` (chuỗi `position`, `position-level`, `shift`), còn `lib/events.js` `groupsOf` phát mã nhóm số đã sắp → cùng trường `groups` có hai kiểu giá trị.
- Lọc ngày của nhật ký: `src/modules/leave/leave.controller.ts` (`vnDayIso`) đổi `from`/`to` thành biên ngày giờ VN; `auditFilter` (`lib/db.js`) coi ngày trần là biên ngày UTC. API đi đường thứ nhất; người gọi `store.audit.list` trực tiếp với ngày trần nhận biên lệch 7 giờ.
- `src/modules/leave/leave.controller.ts` (nhánh `HttpError`) và `src/modules/leave/leave.controller.ts` (nhánh lỗi có mã của store) trải `...e.details` sau `error` / `code`: `details` có trường `error` (hoặc `code`) sẽ ghi đè.
- Mã lỗi không đều: `month` sai trả 400 có `code: 'BAD_MONTH'` ở `/settings/params`, nhưng không có code ở `/ai/review`, `/ai/findings/dismiss`, `/audit`; các lỗi 401, 403, 413 và 400 của `lib/http.js` và `POST /login` không có code.
- `PUT /api/password` băm không qua `hashGate` (chỉ `POST /login` qua).
- `lib/ai/thresholds.js` — `attendMaxAbsentDays` luôn lấy `type.nv.maxAbsent`, không theo chức vụ của người đang xét (chỉ ảnh hưởng câu chữ của luật `attendance-allowance-risk`).
- `lib/domain/ai-review.js` dựng người xem giả `{ role: 'admin' }` cho `kpiPartsView`.
- `lib/ai/review.js` (`kpi-unapproved`) viết cứng tên chức vụ trong câu hiển thị ("CTV/NV …") trong khi chức vụ là dữ liệu.

### 8.6 Mã không được gọi / thừa

- `lib/events.js` `batch()` không có nơi gọi trong mã chạy; `announcement.posted` không được phát (chỉ test); `SYSTEM_FRAMES` chỉ xuất ra.
- `package.json` devDependency `@playwright/test` không được test nào dùng.
- `ApiGate.open` (`src/http/api-gate.ts`) tính `authz.routeKey(method, seg)` hai lần trong cùng yêu cầu (một lần cho `policyOf`, một lần cho `routeKey` của bộ chặn tải).
- Cột `staff.leave_balance` và sổ phép lưu sẵn được làm mới bằng hẹn giờ `LEAVE_REFRESH_MS` chỉ khi chạy `server.js` trực tiếp; nạp qua `require` (test, sandbox) không có hẹn giờ này, nên số dư chỉ cập nhật khi có lời gọi `leave.refresh`.

### 8.7 Quy ước chưa đều

- Thiếu `'use strict'` ở đầu: `server.js`, `lib/announce.js`, `lib/attendance-sessions.js`, `lib/auth.js`, `lib/db.js`, `lib/domain/ai-review.js`, `lib/domain/approvals.js`, `lib/domain/attendance.js`, `lib/domain/positions.js`, `lib/domain/sheet.js`, `lib/domain/staff.js`, `lib/http.js`, `lib/request-rules.js` (danh sách tính bằng cách quét `server.js` và `lib/**/*.js`). File `src/**/*.ts` là module ES nên luôn ở chế độ nghiêm ngặt.
- Ngân sách cỡ file (`test/unit/file-size-budget.test.js`, `test/fixtures/file-size-budget.json`): trần mềm 800, trần cứng 1.200 dòng; ngoại lệ hiện có: `public/formula.js` (2.900), `lib/db.js` (2.300; thực tế 2.259), `public/payroll-engine.js` (1.700), `scripts/db/demo/scenarios.js` (1.600) (1.500) (1.400) (1.300). `server.js` đã xuống 15 dòng nên rời danh sách ngoại lệ. `lib/db.js` là file lớn nhất còn lại (hàng đợi giao dịch, cổng `ready`, kho dữ liệu, DDL SQLite).

### 8.8 Chưa có

- Phạm vi nhóm của vai trò chưa có bảng phân công người quản lý: `can()` coi phạm vi nhóm như phạm vi chính mình (`lib/authz.js`).
- Không có API sửa / xoá nhật ký, không có API đọc `ai_review_runs`, không có API xem `param_versions` thô (chỉ qua `GET /api/settings/params`).
- Không có thông báo qua kênh ngoài (thư, tin nhắn): sự kiện SSE chỉ là gợi ý nạp lại, không mang dữ liệu và không phát lại tin lỡ.
- Không có sao lưu hay lập lịch sao lưu bên trong ứng dụng: `scripts/ops/*` là lệnh chạy ngoài; repo không kèm tệp lập lịch cho chúng.
- Không có test trình duyệt thật (mục 7); `verify-backup.js` và `params-mode.js` không có test riêng.
