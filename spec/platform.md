# Nền tảng (platform) — đặc tả theo mã

Tài liệu mô tả hành vi của mã đang chạy ở nhánh hiện tại, đọc từ mã (không đọc từ chú thích). Đường dẫn tính từ gốc repo. `file:dòng` trỏ tới dòng hiện có; khi mã dịch chuyển thì tìm lại theo tên hàm. Chỗ mã không nhất quán hoặc chưa làm được nằm ở mục 8.

Phạm vi: cấu trúc thư mục, luồng xử lý một yêu cầu qua NestJS (`src/bootstrap.ts`, `src/http/*`), `src/platform/http.ts` (JSON, lỗi, file tĩnh), cổng quyền `ROUTE_CAPS`, đăng ký module NestJS (`src/app.module.ts`), giới hạn tải, SSE, nhật ký kiểm toán, lược đồ DB và migration, cảnh báo thay cho chặn, công tắc Agents, registry tham số và dữ liệu sinh, AI rà soát theo luật (không LLM), sao lưu / kiểm / khôi phục, sandbox và máy chủ kịch bản, biến môi trường, lệnh npm, bố cục test và cách chạy. Nghiệp vụ lương, chấm công, lịch, KPI, tạm ứng, phép chỉ được nhắc khi chạm vào nền tảng; chi tiết ở các file spec khác (`payroll-engine.md`, `payroll-period.md`, `attendance.md`, `requests.md`, `people-access.md`).

---

## 1. Phạm vi và file

### 1.0 Cấu trúc thư mục

| Đường dẫn | Nội dung |
| --- | --- |
| `src/server.ts` | Điểm vào TypeScript (chạy bằng `node --import tsx src/server.ts`, không có bước build): `src/preload.ts` đặt `UV_THREADPOOL_SIZE` và nạp `.env` (`src/env.ts`) trước mọi module khác, rồi dựng máy chủ (`src/bootstrap.ts`), gọi `start()` (`src/main.ts`) khi chạy trực tiếp. Xuất `server` kèm `server.limits = { hashGate, writeLimiter, shedder, monitor }`. Test nạp qua `test/helpers/server.ts`. |
| `scripts/seed.ts` | Script gieo tài khoản mẫu, chạy bằng `npm run seed`; khác bộ dữ liệu demo ở `scripts/db/seed-demo.ts` (`npm run seed:demo`). |
| `src/domain/` | Lớp nghiệp vụ và luật theo nhóm (route đã chuyển sang `src/modules/*`): `container.ts`, thư mục `employee`, `position`, `shift`, `leave`, `explanation`, `advance`, `attendance`, `payroll`, `timesheet`, `overtime`, `kpi`, `shared` (`Rule`, `RuleSet`, `Repository`, `DomainError`), và các file lẻ (`pay-entries`, `positions`, `shifts`, `geofence`, `holidays`, `ot`, `sheet*`, `schedule`, `work-hours`, `isat-rule`, `limits`, `ai-review`, `ai-block`, `catalog-params`…). |
| `src/ops/` | Hạ tầng vận hành trong tiến trình: giới hạn tải, bộ đo vòng lặp, bộ nhớ đệm, nhật ký truy cập. |
| `src/params/` | Registry tham số, đọc theo tháng (`store.ts`), lưu / xem trước / hoàn tác (`save.ts`), kiểm (`src/params/validate.ts`), thuộc tính mở rộng, chức vụ và khối phụ cấp là dữ liệu, `config-rev.ts`, `keys.lock.json`, `registry.data.json`. |
| `src/ai/` | AI rà soát theo luật (thuần, không mạng). |
| `public/` | Chỉ còn các mô-đun tính lương/chấm công dùng chung (UMD) mà máy chủ nạp bằng `require` (`payroll-engine.ts`, `payroll-params.ts`, `payroll-calendar.ts`, `punch.ts`, `leave.ts`, `kpi-score.ts`, `actual-hours.ts`, `approval-view.ts`, `work-schedule.ts`, `formula*.js`, `payroll-graph.ts`, `pay-*-calc.js`, `attendance-status.ts`…). Không được phục vụ ra ngoài; giao diện là ứng dụng Vue ở `web/`. |
| `web/` | Mã nguồn giao diện Vue (dựng ra `web/dist`). `src/platform/http.ts` phục vụ `web/dist` khi đã build. |
| `scripts/ops/` | Sao lưu, kiểm bản sao, diễn tập khôi phục, lùi chế độ tham số. |
| `scripts/dev/` | Sandbox (`sandbox-server.ts`, `sandbox-ops.ts`, trang điều khiển) và máy chủ kịch bản (`scenarios/`). |
| `scripts/params/` | Công cụ registry tham số (mục 4.10). |
| `scripts/loadtest/` | Bộ đo tải qua HTTP (`run.ts`, `kit/`). |
| `scripts/db/` | Công cụ DB của máy phát triển: dữ liệu mẫu, kiểm migration, đo chỉ mục, thư mục `demo/`. |
| `scripts/seed.ts` | `npm run seed`. |
| `.env.example` | Mẫu biến môi trường (`DATABASE_URL`, `PG_TEST_URL`, các control URL, `PORT`, `ADMIN_PASSWORD`, `SESSION_SECRET`, `SESSION_DAYS`, `COOKIE_SECURE`, `TRUST_PROXY`), không chứa giá trị thật. |
| `test/` | `unit/`, `api/`, `ui/`, `ops/`, `helpers/`, `fixtures/`, `tools/` (mục 4.14, 7). |
| `spec/` | Các file đặc tả này. |

### 1.1 Máy chủ HTTP và hạ tầng yêu cầu

| File | Vai trò |
| --- | --- |
| `src/bootstrap.ts`, `src/main.ts`, `src/app.module.ts`, `src/app.init.ts`, `src/env.ts` | Ứng dụng NestJS: dựng `http.Server` (tiêu đề bảo mật, file tĩnh, chuyển `/api/*` cho Nest), khởi động thật và tắt êm, đăng ký module, khởi tạo cấp ứng dụng, nạp `.env`. |
| `src/http/*` | Hạ tầng route: `ApiGuard`/`ApiGate` (phiên, `ROUTE_CAPS`, giới hạn tải, giới hạn tốc độ ghi, ngữ cảnh nhật ký, cổng khoá kỳ), `RequestScopeInterceptor`, `ApiExceptionFilter`, `NotFoundModule`, `load-control`. |
| `src/modules/*` | 20 module nghiệp vụ (controller, module, helpers, `index.ts`); bảng route sinh từ mã ở `spec/reference/api-routes.md`, bảng module ở `spec/reference/modules.md`. |
| `src/platform/http.ts` | `HttpError`, `send` (JSON, gộp cảnh báo, gzip, chỉ trả lời một lần), `readJson` (bắt buộc `application/json`, trần 1 MB), `serveStatic` (`web/dist` rồi `public/`, ETag, gzip giữ trong RAM), `securityHeaders` (CSP…), `clientIp` (`TRUST_PROXY`). |
| `src/platform/warnings.ts` | Cảnh báo thay cho chặn: `run` (AsyncLocalStorage mỗi yêu cầu), `warnIf`, `warn`, `take`, `codes`, `selfDecision`, `optionalReason`. |
| `src/platform/request-rules.ts` | `rulesFor(tháng)`: dựng các mô-đun quy tắc dùng chung (`public/*.js`) theo bộ tham số của tháng, nhớ trong một yêu cầu (AsyncLocalStorage `requestRules`). Cùng `monthParams`, `typeParam`, `benefitOf`, `levelCountOf`, `vnToday`, `nowIso`. |
| `src/platform/announce.ts` | Phát SSE sau COMMIT cho thay đổi cấu hình (`announceSetting`) và gom tháng có việc chấm công chờ (`attendanceHints` → `announceAttendance`). |
| `src/platform/config.ts` | Hằng số kỹ thuật có tên (đóng băng lúc `require`). Một số hằng là số nghiệp vụ (mục 8.2). |
| `src/platform/auth.ts` | Băm scrypt, giới hạn đoán mật khẩu (trong RAM), cookie phiên ký HMAC, `TRUST_PROXY`, mật khẩu admin đầu tiên, `SESSION_SECRET`. |
| `src/platform/authz.ts` | Năng lực (`CAPS`, 32 mục), vai trò mặc định (`ROLE_CAPS`, `ROLE_SCOPE`), vai trò tuỳ chỉnh (settings `roles.custom`), `ROUTE_CAPS` (106 khoá), `routeKey`, `gate`, `can`, `scopeOf`, `auditSensitivities`. |
| `src/ops/access-log.ts` | Nhật ký truy cập JSON mỗi yêu cầu một dòng + tiêu đề `X-Request-Id`. Tắt bằng `ACCESS_LOG=off`. |
| `src/ops/limiters.ts` | `Overloaded`, `AsyncGate` (giới hạn đồng thời băm mật khẩu), `RateLimiter` (xô token theo người), `LoadShedder` (từ chối route nặng khi nghẽn). |
| `src/ops/route-classes.ts` | `HEAVY_ROUTES`, `UNLIMITED_WRITE_ROUTES` (khoá dạng `ROUTE_CAPS`). |
| `src/ops/runtime-monitor.ts` | Đo trễ vòng lặp sự kiện (cửa sổ trượt), bộ nhớ, thời gian chạy; dùng cho `/api/health`, bộ chặn tải, nhật ký truy cập. |
| `src/ops/compute-cache.ts` | `ComputeCache`: nhớ kết quả phép tính nặng chỉ-đọc theo (khoá, số lần ghi DB, TTL). |
| `src/ops/shared-cache.ts` | Một `ComputeCache` dùng chung tiến trình, revision = `SELECT total_changes()`. |
| `src/params/config-rev.ts` | Số phiên bản chung của cấu hình (`settings.config_rev`), `EPOCH` (đổi mỗi lần khởi động), `BUILD` (= `package.json` version), `info()`. |

### 1.2 Sự kiện, nhật ký

| File | Vai trò |
| --- | --- |
| `src/platform/events.ts` | Danh mục sự kiện (`EVENTS`,), chọn người nhận + chiếu trường theo tầng quyền, SSE `GET /api/events` (`handleSse`,), `emit.*` theo nghiệp vụ, `closeUser`, `closeAll`. |
| `src/platform/audit.ts` | Ghi nhật ký phía ứng dụng: `context(me)`, `write` (gắn mã cảnh báo, hàng rào bí mật), `staffSaved`, `staffLock`, `slipOverride`, `publicRow`. |
| `src/platform/db.ts` (khối `auditStore`,) | Lưu nhật ký: chuỗi băm SHA-256 / HMAC-SHA256, `list`, `count`, `verify`, `mode`. |

### 1.3 Dữ liệu

| File | Vai trò |
| --- | --- |
| `src/platform/db.ts` | Chọn và mở PostgreSQL (`DATABASE_URL`), `transaction` (SAVEPOINT lồng được), kho staff / timesheets / settings / KPI / slip_overrides, `auditStore`, `paramsStore` (đọc `param_versions`), `periodsStore` (vòng đời kỳ), `payrollStore` (lần chạy + phiếu), `aiFindingStore`, `aiReviewStore`, `rolesStore`, `assertPeriodOpen`. Cuối file gắn thêm kho của `attendance-sessions.ts`, `approvals.ts`. |
| `src/domain/attendance/attendance-sessions.ts` | DDL `attendance_sessions`, `punch_requests` (+ cột, chỉ mục), migration `attendance_sessions_v1`, `purgePunchRequests`. |
| `src/domain/approvals/approvals.ts` | DDL `sheet_approvals`, migration `sheet_approvals_v1…v4`. |

### 1.4 src/domain: container và lớp gốc

| File | Vai trò |
| --- | --- |
| `src/app.module.ts` | Gốc module Nest: `ApiGuard`, `RequestScopeInterceptor`, `ApiExceptionFilter` toàn cục; `FEATURE_MODULES` (thứ tự đăng ký = thứ tự khớp route) rồi `NotFoundModule`. |
| `src/domain/container.ts` | Composition root: dựng lười, một lần, các repository/service (`employeeRepository`, `employees`, `positions`, `shifts`, `explanationRepository`, `explanations`, `lateCheckout`, `adminPresence`, `sessionStatus`, `leave`) và `catalogRev` / `bumpCatalogRev` / `catalogParamRows`; dựng lại khi `store.db` đổi. |
| `src/domain/shared/domain-error.ts` | `DomainError` (`httpStatus`, `code`, `details`) — `ApiExceptionFilter` trả theo nhánh "lỗi có mã". |
| `src/domain/shared/repository.ts` | Lớp gốc repository: `one/all/run/transaction`, `updateWithRev` (khoá lạc quan `rev` → 404 / 409). |
| `src/domain/shared/request.ts` | Lớp gốc "yêu cầu chờ duyệt" (trạng thái, người/lúc duyệt, ghi chú, `rev`, không tự duyệt yêu cầu của mình). |
| `src/domain/shared/catalog-change.ts` | `applyCatalogChange`: cổng khoá kỳ (`params`), giao dịch, `bumpCatalogRev`, `configRev.bump`, audit mức `pay`, SSE `params.changed` (`kind: 'catalog'`). |
| `src/domain/catalog-params.ts` | `catalog_rev` và dòng tham số sinh từ danh mục (đọc bởi `src/params/store.ts`). |
| `src/modules/employees/employees.controller.ts` | `GET /api/employees/:uuid`, `GET /api/employees/:uuid/trace`. |
| `src/modules/leave/leave.controller.ts` | `GET /api/leave/ledger`, `POST /api/leave/refresh`. |
| `src/modules/catalog/catalog.controller.ts`, `src/modules/catalog/catalog.controller.ts` | `GET/PUT /api/catalog/positions`, `PUT /api/catalog/levels`, `GET/PUT /api/catalog/shifts`. |

### 1.6 Vận hành, sandbox

| File | Vai trò |
| --- | --- |
| `scripts/ops/params-mode.ts` | Xem / lùi `params_mode` về `defaults-only` (có sao lưu, audit `param.mode`, tăng `config_rev`). |
| `scripts/dev/sandbox-server.ts` | Máy chủ thử: database PostgreSQL tạm riêng, đồng hồ giả, chỉ loopback, nạp `src/server.ts` (ứng dụng NestJS). |
| `scripts/dev/sandbox-ops.ts` | Điều khiển thử tải và sao lưu/khôi phục bên trong sandbox. |
| `scripts/dev/sandbox.html`, `sandbox.js`, `sandbox-ops.js` | Trang điều khiển sandbox (trình duyệt). |
| `scripts/dev/scenarios/` | Dựng DB kịch bản gần một năm (`scripts/dev/scenarios/generate.ts`), máy chủ xem (`scripts/dev/scenarios/server.ts`), đối chiếu (`verify.ts`), thư viện `lib/`; file sinh ra nằm trong `out/` (không vào git). |
| `scripts/loadtest/` | `run.ts` đo tải qua HTTP (tự dựng DB tạm, hoặc nhắm `--base` vào sandbox), `kit/` (người dùng giả, kịch bản, đối soát). |
| `scripts/seed.ts` | `npm run seed`. |
| `package.json` | Lệnh npm, `engines.node >= 22.13`, không có dependency chạy; devDependency `@playwright/test`, `prettier`. |

### 1.7 Công cụ test

| File | Vai trò |
| --- | --- |
| `test/helpers/api-fixture.ts` | Dựng máy chủ thật trên PostgreSQL tạm riêng, đồng hồ giả, `call()`, `person()`, `reset()`, `snapshot()`; bật công tắc Agents (`agents.set(true)`). |
| `test/helpers/sse-client.ts`, `server-source.ts` | Máy khách SSE cho test; gom văn bản mã máy chủ cho test đọc tĩnh. |
| `test/helpers/red.ts`, `open-bug.ts` | Test đỏ viết trước / lỗi đã biết chạy như `todo`. |
| `test/helpers/legacy-*.ts`, `payroll-vm.ts`, `golden.ts`, `payroll-cases.ts`, `payroll-differential.ts`, `pay-oracle.ts`, `formula-*.js` | Bộ so sánh bộ máy lương với khối công thức đóng băng (`test/fixtures/legacy-payroll-block.js`, `payroll-golden-v0.json`), sinh ca, đọc công thức phiếu. |

---

## 2. Dữ liệu

### 2.1 Kết nối và giao dịch

- Chọn DB bằng biến môi trường, không có mặc định: `DATABASE_URL` = PostgreSQL của ứng dụng (`pg.Pool`, tối đa 10 kết nối); `PG_TEST_URL` = control PostgreSQL riêng cho test, mỗi file test tạo database riêng rồi chỉ xoá database do chính nó tạo. `DB_PATH` không còn được hỗ trợ.
- Lược đồ do `migrations/postgres/NNNN_*.sql` dựng; `PostgresDatabase` chạy các file chưa chạy lúc mở, mỗi file một giao dịch, tên file ghi ở bảng `schema_migrations`. `db.ready` chờ xong.
- Truy vấn của ứng dụng là Kysely (`src/data`), biên dịch thẳng ra PostgreSQL qua `PostgresDatabase.native`; chỗ cú pháp riêng (`jsonb #>>`, `ILIKE`, `IS DISTINCT FROM`) nằm ở `src/data/flavor.ts`. `prepare(sql).get/all/run` còn dùng cho test, script và `src/ops`: chỉ đổi `?` thành `$n` và thêm `RETURNING id` cho INSERT (`src/data/postgres-sql.ts`).
- Giao dịch: `transaction(fn)`. PostgreSQL dùng một kết nối riêng cho mỗi giao dịch (`db.concurrent`); giao dịch lồng nhau dùng `SAVEPOINT write_<n>`, lỗi thì `ROLLBACK TO` + `RELEASE` rồi ném tiếp (`src/platform/db.ts`).
- Ghi đồng thời: mẫu "đọc xem có chưa rồi mới chèn" dùng khoá tư vấn `store.lock(khoá)` = `pg_advisory_xact_lock` (`src/data/locks.ts`) ở đầu giao dịch (Check-in/out theo người, điểm KPI theo người + tháng). Vi phạm ràng buộc duy nhất `23505` còn sót được `ApiExceptionFilter` đổi thành 409 `CONFLICT`.
- Đồng hồ DB: `now()` = `new Date(Date.now()).toISOString()` để test/sandbox giả giờ được (`src/platform/db.ts`).
- Lỗi có mã của store: `storeError(code, message, httpStatus=400, details)` → `Error` có `code`, `httpStatus`, `details` (`src/platform/db.ts`).
- Lỗi khi khởi động mà người vận hành phải xử lý (`bootFail`, `src/platform/db.ts`): in hướng dẫn rồi `process.exit(1)`.

### 2.2 Bảng

Số phiên bản lược đồ là danh sách file đã chạy trong bảng `schema_migrations` (`migrations/postgres/NNNN_*.sql`); dữ liệu nền do `0002_seed.sql` gieo.

| Bảng | Tạo ở | Ghi chú cho nền tảng |
| --- | --- | --- |
| `staff` | `migrations/postgres/0001_baseline.sql` | Khoá `username`. Cột phiên: `locked_at`, `locked_by`, `session_version`. `payroll_subject` (null = suy từ role). `uuid` (sinh bằng SQL nếu thiếu, không đổi được — trigger). |
| `timesheets` | `src/platform/db.ts` | Lịch ước tính theo (username, month), `days_json`, `rev`. |
| `settings` | `src/platform/db.ts` | `key` → `value_json`. Xem 2.3. |
| `slip_overrides` | `src/platform/db.ts` | Số Admin sửa trên phiếu; `reason`, `rev`. |
| `punches`, `corrections`, `attendance_days` | `src/platform/db.ts` | Lượt bấm lẻ, điều chỉnh giờ, giờ chấm công gửi Admin; `context_json`, `session_id`, `session_version`. |
| `kpi_scores`, `kpi_score_log` | `src/platform/db.ts` | Điểm ×100 (0..10000, CHECK kiểu integer). |
| `audit_log` | `src/platform/db.ts` + `subject_uuid`, `actor_uuid` (`migrations/postgres/0001_baseline.sql`) | Chỉ thêm (trigger chặn UPDATE/DELETE). `sensitivity ∈ normal/pay/pii`. Chuỗi băm `prev_hash`, `hash`. Chỉ mục: `at`, `(entity_kind, entity_id, id)`, `(subject, month, id)`, `(actor, at)`, `(action, at)`, `(actor,id)`, `(action,id)`, `(month,id)`, `(entity_kind,id)`, `(subject_uuid,id)`. |
| `param_versions` | `src/platform/db.ts`, `batch_id` | Chỉ thêm. `reason` CHECK 10..300. Đọc qua `paramsStore`. |
| `payroll_periods` | `src/platform/db.ts` | Trạng thái kỳ, `rev`, `current_run_id`, cột "ai/lúc nào" từng bước, `reopen_count`. Không có dòng = `open`. |
| `payroll_runs`, `payslips` | `src/platform/db.ts` | Bất biến bằng trigger: không xoá; lần chạy không đổi tham số/đầu vào/không lùi trạng thái; phiếu không đổi số; phiếu của lần chạy `final`/`superseded` không đổi gì. |
| `ai_finding_actions` | `src/platform/db.ts` | Chỉ thêm. `action ∈ dismiss/restore`, `note` CHECK 10..300. |
| `ai_review_runs` | `src/platform/db.ts` | Chỉ thêm. Chỉ số đếm, không tên, không tiền. |
| `staff_roles` | `src/platform/db.ts` | Không xoá; chỉ đặt `revoked_at` một lần. Duy nhất (username, role) khi chưa thu hồi. |
| `pay_entries`, `advance_requests` | `src/platform/db.ts` | Trigger khoá trạng thái cuối / trường tiền sau duyệt; `advance_requests` có chỉ mục duy nhất một yêu cầu `pending` mỗi (người, tháng). |
| `attendance_sessions`, `punch_requests` | `src/domain/attendance/attendance-sessions.ts` | Một phiên mở mỗi người (unique partial index `session_one_open`). `punch_requests` là bộ nhớ chống bấm lặp theo `requestId`, `created_at` để dọn. |
| `sheet_approvals` | `src/domain/approvals/approvals.ts` | Khoản tự khai chờ duyệt. |
| `benefit_types`, `position_types`, `position_type_benefits`, `position_levels`, `work_shifts` | `migrations/postgres/0001_baseline.sql` | Danh mục có tháng áp dụng. |
| `leave_ledger` | `migrations/postgres/0001_baseline.sql` | Sổ phép, duy nhất (staff_uuid, kind, on_date). |
| `explanations` | `migrations/postgres/0001_baseline.sql` | Giải trình. |

### 2.3 Khoá `settings`

| Khoá | Giá trị | Ai đọc / ghi |
| --- | --- | --- |
| `params_mode` | `'defaults-only'` \| `'active'`; gieo `'defaults-only'` | `src/platform/db.ts,951-954`; bật `active` ở `src/params/save.ts`; lùi bằng `scripts/ops/params-mode.ts`. |
| `config_rev` | số nguyên ≥ 0 (vắng = 0) | `src/params/config-rev.ts`; `bump()` trong cùng giao dịch của mọi thay đổi cấu hình. |
| `catalog_rev` | số nguyên | `src/domain/catalog-params.ts`. |
| `session_secret` | hex | Chỉ khi không production và không có `SESSION_SECRET` (`src/platform/auth.ts`). |
| `holidays` | `['YYYY-MM-DD']` | Đọc ở rất nhiều nơi; ghi ở `PUT /api/holidays`. |
| `holiday_names` | `{ ngày: tên }` | `src/domain/holidays.ts`. |
| `geofence` | đối tượng vùng GPS hoặc `null` | `src/domain/attendance/geofence-policy.ts`, `PUT /api/settings/geofence`. |
| `roles.custom` | `{ rev, roles: [...] }` | `src/platform/authz.ts`, `src/domain/roles/roles.ts`. |
| `advance_approvals_<YYYY-MM>` | `{ rev, users }` | `src/domain/advance/advance-approvals.ts`. |

### 2.4 Migration khi mở DB (thứ tự chạy)

1. `PostgresDatabase` chạy các file `migrations/postgres/NNNN_*.sql` chưa chạy: `0001_baseline.sql` (toàn bộ bảng, chỉ mục, trigger PL/pgSQL chặn sửa/xoá bảng chỉ-thêm-dòng) và `0002_seed.sql` (danh mục chức vụ, bậc, quyền lợi, ca nền, `params_mode`).
2. Khi `src/server.ts` nạp: `initApp()` (`src/app.init.ts`) gọi `Roles.reconcileStaffRole()` ghi DB ngay lúc dựng máy chủ, kể cả trong test.
3. `warnings.bindSettings(getSetting)` nối cảnh báo với cài đặt.

Quy ước của mã: đổi lược đồ = thêm file `migrations/postgres/NNNN_*.sql` mới (không sửa file đã chạy); cột mới có mặc định hoặc null; không viết lại dòng có sẵn.

### 2.5 Kỳ lương: trạng thái và cổng khoá

Trạng thái: `open → attendance_locked → calculated → reviewed → approved → paid` (`src/platform/db.ts`).

| Bước (`periodsStore`) | Từ | Sang | Ghi chú |
| --- | --- | --- | --- |
| `lockAttendance` | open | attendance_locked | |
| `markCalculated` | attendance_locked, calculated, reviewed | calculated | gắn `current_run_id` (lần chạy phải là `draft` của đúng tháng, nếu không 409 `RUN_INVALID`); xoá cột các bước sau. |
| `markReviewed` | calculated, reviewed | reviewed | cần `current_run_id` (409 `PERIOD_NOT_READY`). |
| `approve` | reviewed hoặc calculated (calculated kèm cảnh báo `PERIOD_STATE`) | approved | Phiếu chưa duyệt: cảnh báo `PERIOD_NOT_READY`, tự duyệt luôn, phiếu lỗi tự loại; `freezeOverrides`; lần chạy → `final` (`src/platform/db.ts`). |
| `markPaid` | approved | paid | `paidAt` ngày hoặc ISO (400 `BAD_PAID_AT`), `reference` ≤ 100 ký tự. |
| `reopen` | trạng thái sau `to` | `to ∈ open, attendance_locked, calculated` | `paid`: cho mở, cảnh báo `PERIOD_STATE`. Mọi lần chạy draft/final → `superseded`, `current_run_id = null`, `reopen_count + 1`, xoá cột bước sau (`src/platform/db.ts`). |

Mọi bước: `rev` không phải số nguyên ≥ 0 → 400 `BAD_REV`; `rev` lệch → 409 `PERIOD_STALE { month, rev }`; sai trạng thái → 409 `PERIOD_STATE { month, status, expected, to }`. Thành công: `rev + 1`.

**Cổng khoá kỳ** `assertPeriodOpen(month, scope)` (`src/platform/db.ts`):

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
| Danh sách cảnh báo của yêu cầu, `mode` đã đọc | `src/platform/warnings.ts` (ALS) | Một yêu cầu; trần `WARN_MAX` = 50, phần dư → mục `WARNINGS_TRUNCATED`. |
| Quy tắc theo tháng | `src/platform/request-rules.ts` (ALS `requestRules`) | Một yêu cầu. |
| Bộ tham số hiệu lực theo tháng | `src/params/store.ts` (`resolve`) | Khoá = (kết nối DB, chế độ, id dòng tham số mới nhất, `catalog_rev`); tối đa 64 tháng; xem trước (`drafts`/`active`) không vào cache. |
| File tĩnh nén sẵn | `src/platform/http.ts` `staticCache` | Theo ETag (cỡ + mtime); chỉ file ≤ `STATIC_CACHE_MAX_BYTES` (2 MB), đuôi chữ. Không có trần số mục. |
| Kết quả nặng (soát AI, ước tính cả kỳ) | `src/ops/shared-cache.ts` | Hợp lệ khi `total_changes()` không đổi và tuổi < 15.000 ms; tối đa 64 mục. |
| Đếm đăng nhập sai | `src/platform/auth.ts` | Cửa sổ `system.login.windowMin`; ≤ `system.login.maxKeys` khoá, không đẩy khoá đang khoá ra. |
| Xô token ghi | `RateLimiter.buckets` | ≤ 10.000 khoá, bỏ khoá lâu nhất. |
| Kết nối SSE | `src/platform/events.ts` (`conns`, `byUser`) | Theo kết nối. |
| Đối tượng domain | `src/domain/container.ts` `#built` | Dựng lại khi `store.db` khác lần trước. |

---

## 3. API

### 3.1 Luồng một yêu cầu `/api/*` (thứ tự đúng như mã)

`src/bootstrap.ts` (`http.createServer`), rồi `src/http/*` trong ứng dụng Nest:

1. `securityHeaders(res)` cho mọi phản hồi (CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: same-origin`, `Permissions-Policy`, HSTS khi `COOKIE_SECURE=1`) (`src/platform/http.ts`).
2. Nếu `access-log` gắn (chỉ khi chạy `src/server.ts` trực tiếp, `src/main.ts`): đặt `X-Request-Id` (nhận từ client nếu khớp `^[\w.-]{1,64}$`, không thì 12 hex) (`src/ops/access-log.ts`).
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
| khác (kể cả `httpStatus ≥ 500`, ví dụ `AUDIT_ARGS`, `BAD_ARGS` 500) | log, 500 `{ error: 'Lỗi máy chủ' }` |

`send()` (`src/platform/http.ts`): chỉ trả lời một lần (bỏ qua lặng nếu đã gửi / đang nén); phản hồi 2xx dạng đối tượng được gộp `warnings` của yêu cầu (không trùng code+message với mảng `warnings` có sẵn); ≥ `HTTP_GZIP_MIN_BYTES` (1024) và client nhận gzip → nén mức 1 ở luồng nền. Luôn `Cache-Control: no-store`.

`readJson(req, allowNull)` (`src/platform/http.ts`): có thân mà `Content-Type` ≠ `application/json` → 415 `UNSUPPORTED_MEDIA_TYPE` (chống CSRF); > 1.000.000 byte → 413 (không code, đọc hết rồi mới trả); không phải object JSON → 400 `JSON phải là object hợp lệ` (không code); thân rỗng → `{}`; `allowNull` cho phép chữ `null`.

**Hai cổng phụ trong `ApiContext`** (`src/http/api-gate.ts`):
- `needAdmin()`: khẳng định route có `policy.cap`; không kiểm thêm quyền (cổng đã kiểm). Test tĩnh `permissions-matrix` nhận dạng route chỉ-Admin bằng chuỗi `needAdmin()` ngay dưới decorator.
- `guardPeriod(...dates)`: ném `Error` nếu route không khai `periodScope`; với mỗi tháng khác nhau của các ngày/tháng truyền vào: `store.assertPeriodOpen(month, policy.periodScope)` rồi `warnFrozen(month)` (kỳ ở `approved`/`paid` → thêm cảnh báo `PERIOD_FROZEN`).

### 3.2 Chính sách quyền `ROUTE_CAPS` (`src/platform/authz.ts`)

Dạng chính sách: `{ public: true }` (không cần đăng nhập) · `{ authenticated: true }` (A) · `{ cap: 'self-or:<nl>' }` (cổng như A; handler tự kiểm `can()`) · `{ cap: '<nl>' }` (cần năng lực ở phạm vi `all`; riêng `request.decide.*` chỉ cần có ít nhất một nhóm). Route ghi thêm `periodScope` (dùng cho `guardPeriod`) và `periodMonth` (chỉ là tài liệu).

`routeKey` (`src/platform/authz.ts`) đặt tên tham số: `/periods/:month[/<bước>|/payslips[/:username|/decide]|/estimates/:username]`, `/settings/params/<x>`, `/staff/:u[/schedule[/preview]|/roles|/password]`, `/blocks/:code/<x>`, `/positions/:code/levels`, `/pay-entries[/bulk|/:id[/<x>]]`, `/advance-requests/:id/<x>`, `/explanations/:id/<x>`, `/catalog/positions/:code`, `/employees/:uuid[/<x>]`, `/roles/:code[/<x>]`; còn lại `METHOD /seg1/seg2`.

| Nhóm | Khoá → chính sách (periodScope) | Xử lý ở |
| --- | --- | --- |
| Công khai | `POST /login`, `POST /logout`, `GET /me`, `GET /health` → public | `src/modules/auth/auth.controller.ts` / `src/modules/system/system.controller.ts` |
| Phiên | `PUT /password` → A (`auth`); `GET /events` → A (`system`); `GET /settings/version` → A (`settings`); `GET /me/estimate` → A (`sheet`) | `src/modules/auth`, `src/modules/system`, `src/modules/settings`, `src/modules/sheet` |
| Ngày lễ | `GET /holidays` → A; `PUT /holidays` → config.payroll (attendance) | `src/modules/settings/settings.controller.ts` |
| Lịch | `GET /sheet` → self-or:attendance.read; `PUT /sheet` → A (attendance); `PUT /sheet/bulk` → request.decide.* (attendance) | `src/modules/sheet/sheet.controller.ts`, `src/domain/sheet-bulk.ts` |
| KPI | `GET /kpi/scores` → kpi.score.write; `PUT /kpi/scores` → self-or:kpi.score.write (kpi) | `src/modules/kpi/kpi.controller.ts` |
| Duyệt | `GET /approvals`, `GET /approvals/count`, `GET /alerts` → request.decide.*; `PUT /approvals/decide` → request.decide.* (attendance) | `src/modules/approvals/approvals.controller.ts` |
| Phiếu sửa | `GET /slip-override` → payroll.override; `PUT /slip-override` → payroll.override (slip) | `src/modules/periods/periods.controller.ts` |
| Chấm công | `GET /punch` → A; `POST /punch` → A (attendance); `GET /ot` → attendance.correct; `POST /ot`, `PUT /ot` → attendance.correct (attendance); `GET /today`, `GET /attendance` → attendance.read | `src/modules/attendance/attendance.controller.ts` |
| Công tắc | `PUT /settings/geofence` → config.payroll | `src/modules/settings/settings.controller.ts` |
| Nhân sự | `GET /staff` → profile.read; `GET /team` → payroll.view; `PUT /staff/:u`, `PUT /staff/shift-bulk` → profile.write; `PUT /staff/:u/roles`, `POST /staff/:u/password` → roles.manage; `DELETE /staff/:u` → staff.lock | `src/modules/staff/staff.controller.ts` / `src/modules/sheet/sheet.controller.ts` |
| Vai trò | `GET /roles`, `POST /roles`, `PUT /roles/:code`, `POST /roles/:code/deprecate` → roles.manage | `src/modules/roles/roles.controller.ts` |
| Chức vụ (params) | `GET /positions`, `GET /entitlements` → config.read; `POST /positions` → config.read; `POST /positions/:code/levels` → config.payroll | `src/modules/positions/positions.controller.ts` |
| Lịch theo loại nhân sự | `GET /staff/:u/schedule` → self-or:profile.read (không còn PUT và POST preview: route không có trong bảng quyền, bị 403 `NO_ROUTE_POLICY`) | `src/modules/staff/staff.controller.ts` → `src/domain/schedule.ts` (`staffView`) |
| Khối | `POST /blocks` → config.payroll; `PUT /blocks/:code/confirm` → config.legal | `src/modules/blocks/blocks.controller.ts` |
| Tham số | `GET /settings/params`, `GET /settings/first-run` → config.read; `PUT /settings/params`, `POST /settings/params/preview`, `POST /settings/params/revert` → config.read | `src/modules/settings/settings.controller.ts` → `src/params/save.ts` |
| Ca (params) | `GET /settings/shifts`, `PUT /settings/shifts` → config.read | `src/modules/settings/settings-shifts.controller.ts` → `src/domain/shifts.ts` |
| Kỳ lương | `GET /periods`, `GET /periods/:month`, `/payslips`, `/estimates`, `/estimates/:username` → payroll.view; `GET /periods/:month/payslips/:username` → self-or:payroll.view; `GET /periods/:month/verify` → audit.read; `POST /periods/:month/{lock-attendance → attendance.lock, calculate → payroll.calculate, ai-review → ai.review.read, approve → payroll.approve, mark-paid → payroll.pay, reopen → period.reopen}`; `PUT /periods/:month/payslips/decide` → payroll.approve | `src/modules/periods/periods.controller.ts` → `src/domain/period/periods.ts` |
| Nhật ký | `GET /audit`, `GET /audit/verify` → audit.read | `src/modules/audit/audit.controller.ts` |
| Khoản điền thêm | `GET /pay-entries` → salary.read; `POST /pay-entries`, `/bulk`, `PUT /:id`, `POST /:id/void` → salary.write; `PUT /:id/decide` → payroll.approve; `POST /:id/confirm-flags` → config.legal | `src/modules/pay-entries/pay-entries.controller.ts` → `src/domain/payroll/pay-entries.ts` |
| Yêu cầu ứng lương (lịch sử) | `GET /advance-requests`, `POST /advance-requests`, `POST /:id/cancel` → A; `PUT /:id/decide` → request.decide.*; gửi và duyệt đều trả 410 `ADVANCE_REQUEST_RETIRED`; chỉ đọc lịch sử và huỷ yêu cầu đang chờ dùng được | `src/modules/advance/advance-requests.handlers.ts` |
| Tạm ứng | `GET /advance-approvals`, `POST /request`, `POST /withdraw` → A; `POST /approve`, `/reject`, `/cancel`, `/approve-all` → request.decide.* | `src/modules/advance/advance-approvals.handlers.ts` |
| Giải trình | `GET /explanations`, `POST /explanations` (Check-out muộn `{sessionId,text}`, tự giải trình ngày vắng `{date,text}`, Admin yêu cầu `{username,date,prompt}`), `POST /:id/answer` → A; `POST /:id/decide` → attendance.correct | `src/modules/explanations/explanations.controller.ts` |
| Danh mục | `GET /catalog/positions`, `GET /catalog/shifts` → config.read; `PUT /catalog/positions/:code`, `PUT /catalog/levels`, `PUT /catalog/shifts` → config.payroll | `src/modules/catalog/catalog.controller.ts` |
| Nhân viên | `GET /employees/:uuid` → profile.read; `GET /employees/:uuid/trace` → audit.read | `src/modules/employees/employees.controller.ts` |
| Sổ phép | `GET /leave/ledger` → self-or:profile.read; `POST /leave/refresh` → profile.write | `src/modules/leave/leave.controller.ts` |

Vai trò mặc định và phạm vi (`src/platform/authz.ts`): `admin` (mọi năng lực + `request.decide.*`, phạm vi all), `cb` (nhóm năng lực hồ sơ / lương / chấm công / cấu hình lương / AI / nhật ký, `request.decide.*`, all), `accounting` (xem lương và hồ sơ nhạy cảm, `payroll.pay`, `config.legal`, nhật ký, all), `hr` (hồ sơ và hợp đồng, `attendance.read`, chỉ `request.decide.leave`, all), `manager` (xem hồ sơ / chấm công, `request.decide.*`, phạm vi nhóm — `can()` xử lý phạm vi nhóm như phạm vi chính mình vì chưa có bảng phân công, `src/platform/authz.ts`), `staff` (hồ sơ, chấm công, lương, hợp đồng của chính mình, phạm vi self). Vai trò hiệu lực = vai trò đã gán + `staff` nếu `payrollSubject` + `admin` từ cột `role` (qua `store.roles.effectiveRoles`); tài khoản khoá: không vai trò (`src/platform/authz.ts`). Vai trò tuỳ chỉnh không được cấp `roles.manage` (`RESERVED_CAPS`). Chi tiết ma trận ở `people-access.md`.

### 3.3 Đăng ký module (`src/app.module.ts`)

Không còn bảng gửi theo `seg`: mỗi nhóm route là một module Nest (`src/modules/<tên>/`) với `<tên>.controller.ts`, `<tên>.module.ts`, `index.ts` (cổng công khai) và `<tên>.helpers.ts` (hàm phụ của module). `AppModule.register()` import `FEATURE_MODULES` theo thứ tự rồi `NotFoundModule`:

- Thứ tự import là thứ tự đăng ký route của Express: route cụ thể (`PUT /staff/shift-bulk`, trong module `sheet`) phải đứng trước route có tham số (`PUT /staff/:u`, module `staff`); `NotFoundModule` (`@All('*')`) luôn cuối.
- Module chỉ import module khác qua `index.ts` (ví dụ `attendance` dùng `cutRuleView` của `sheet`); hạ tầng không import module nghiệp vụ; `test/unit/architecture.test.ts` giữ các luật đó.
- Controller nhận `@Ctx() c: ApiContext` (đã qua cổng quyền) và `@Res()` (để Nest không tự kết thúc phản hồi: `send()` có thể gửi chậm sau khi nén). Đọc đường dẫn gốc qua `c.seg`, không dùng `@Param` (xem 3.1 bước 5).
- Route mới: thêm khoá vào `ROUTE_CAPS` (`src/platform/authz.ts`), thêm phương thức có decorator vào controller của module, chạy `npm run spec:gen`. Khi đường dẫn Express dài hơn khoá `ROUTE_CAPS` (chỉ `POST /ai/findings/dismiss`) đặt chú thích `// route-key: POST /ai/findings` ngay trên decorator.

### 3.4 Route nền tảng (chi tiết)

#### `GET /api/health` — public (`src/modules/system/system.controller.ts`)
- Chạy `SELECT 1`. Trả `{ ok: true, uptimeSec, loopLagMs: { p50, p99, max }, rssMb, heapMb }` (`src/ops/runtime-monitor.ts` → `snapshot`). Không qua bộ chặn tải.

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

#### `PUT /api/settings/geofence` — config.payroll (`src/modules/settings/settings.controller.ts`)
- Thân `null` hoặc `{ geofence: null }` = tắt; thân khác qua `cleanGeofence`. Giao dịch: ghi `settings.geofence`, `configRev.bump()`, audit `setting.geofence` (chỉ `enabled`, `radiusM`, `centreChanged`, không ghi toạ độ); sau COMMIT `announceSetting('geofence')`. Trả `{ geofence }`.

#### `GET /api/audit` — audit.read (`src/modules/audit/audit.controller.ts`)
- Query: `limit` (mặc định `AUDIT_PAGE_DEFAULT` 50, trần `AUDIT_PAGE_MAX` 200; không nguyên dương → 400), `afterId`, `beforeId` (chuỗi số, sai → 400), `from`, `to` (`YYYY-MM-DD`, đổi thành biên ngày giờ VN sang ISO UTC bằng `vnDayIso`), `month`, `actor`, `action`, `entity` (`loại` hoặc `loại:id`), `subject`.
- Lọc mức nhạy cảm theo người xem: `normal` luôn; `pay` khi `salary.read` phạm vi all; `pii` khi `profile.sensitive.read` all (`authz.auditSensitivities`).
- Thứ tự: mới nhất trước; có `afterId` (và không `order`) thì cũ nhất trước (`src/platform/db.ts`).
- Trả `{ rows: [publicRow], total, limit, nextBeforeId }`; `nextBeforeId` = id cuối khi trang đầy và không có `afterId`, ngược lại null. `total` đếm đủ (không đặt `cap`).

#### `GET /api/audit/verify` — audit.read (`src/modules/audit/audit.controller.ts`)
- `store.audit.verify()` → `{ ok, checked, firstBadId, reason, unverifiable }` (mục 4.7).

#### `GET /api/ai/review?month=YYYY-MM[&impacts=1]` — ai.review.read, route nặng (`(đã bỏ)`)
- Trường của kết quả: `asOf, month, findings, systemFindings, checked { rules, ruleIds, staff, days, skipped, payrollErrors }, checklist, summary { total, bySeverity, byRule }, thresholds, names`, có `impacts` khi yêu cầu.
- Không ghi DB. Không phụ thuộc khoá kỳ.

#### `GET /api/settings/params`, `GET /api/settings/first-run`, `PUT /api/settings/params`, `POST /api/settings/params/preview`, `POST /api/settings/params/revert` — config.read (`src/modules/settings/settings.controller.ts`)
- `month` mặc định tháng hiện tại, sai dạng → 400 `BAD_MONTH`; `group` phải nguyên. `GET` trả `paramsStore.view`/`firstRun`. Ghi / xem trước / hoàn tác đi qua `src/params/save.ts` (mục 4.10); kết quả có `notice` thì `events.emit.paramsChanged`.

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

### 4.1 Nạp môi trường và khởi động (`src/server.ts`, `src/bootstrap.ts`, `src/main.ts`)

1. `src/server.ts`: đặt `UV_THREADPOOL_SIZE` (mặc định `config.UV_THREADPOOL_SIZE` = 8) — nạp `src/platform/config.ts` trước khi đọc `.env`, nên biến này đặt trong `.env` bị bỏ qua.
2. `require('./lib/register-ts')`: đăng ký `tsx` để nạp `src/**/*.ts` lúc chạy.
3. `loadDotEnv(__dirname)` (`src/env.ts`): đọc `.env` cạnh `src/server.ts` nếu có; dòng `KEY=value` (khoá `[A-Z0-9_]+`, bỏ dòng `#`, bỏ một cặp nháy), không ghi đè biến đã có. Phải chạy trước mọi module đọc biến lúc nạp (`DATABASE_URL`, `SESSION_SECRET`).
4. `createServer()` (`src/bootstrap.ts`): `initApp()` (`src/app.init.ts`: `store.setDefaultContractResolver(...)`, `Roles.reconcileStaffRole()`), dựng ứng dụng Nest bất đồng bộ (`NestFactory.create(AppModule.register(), new ExpressAdapter(...), { bodyParser: false })`), trả `http.Server`; đặt `keepAliveTimeout` 65 s, `headersTimeout` 66 s, `requestTimeout` 30 s; gắn `server.limits`. Yêu cầu đến trước khi Nest sẵn sàng thì chờ.
5. `src/platform/db` mở DB và chạy migration khi được nạp; `hashGate`, `writeLimiter`, `shedder`, `monitor` dựng ở `src/http/load-control.ts` — giới hạn đọc env `PASSWORD_HASH_CONCURRENCY`, `WRITE_RATE_PER_MINUTE`, `SHED_MAX_LAG_MS`, `SHED_MAX_INFLIGHT` nếu là số dương (`limitOf`).
6. Chỉ khi `require.main === module`, `start(server)` (`src/main.ts`):
   - `await auth.ready` (khoá ký phiên đọc từ DB khi không đặt `SESSION_SECRET`).
   - DB chưa có ai → tạo `admin` (role admin, `type = Positions.defaultCode`, level 0). Mật khẩu: `ADMIN_PASSWORD` (production cần ≥ `system.auth.adminPasswordMinProduction` = 12 ký tự), trống → production từ chối khởi động, dev sinh ngẫu nhiên (không in).
   - In cảnh báo `TRUST_PROXY` sai dạng.
   - `purgePunchRequests(PUNCH_REQUEST_KEEP_DAYS = 30)` ngay và mỗi `PUNCH_REQUEST_PURGE_MS` (24 h), `.unref()`. Chỉ xoá dòng có `created_at` < now − 30 ngày.
   - `container.leave.start(LEAVE_REFRESH_MS = 3.600.000)`.
   - `listen(PORT || 3000)`, `monitor.start()`, `attachAccessLog`.
   - Tắt êm: SIGTERM/SIGINT/IPC `'shutdown'` → `events.closeAll()`, hẹn thoát cưỡng bức sau `SHUTDOWN_GRACE_MS` (10 s, mã `code || 1`), `server.close` → đóng DB → `exit(code)`, `closeAllConnections()`. `uncaughtException` → log + tắt êm mã 1; `unhandledRejection` → chỉ log.

### 4.2 Phiên đăng nhập (`src/platform/auth.ts`)

- Mật khẩu: `scrypt$<salt hex 16 byte>$<hash hex 64 byte>`; so sánh `timingSafeEqual`.
- Cookie: tên `SESSION_COOKIE_NAME` (mặc định `luong_sid`), giá trị `base64url(JSON{ u, v, sv, exp }) + '.' + HMAC-SHA256(SECRET)` base64url. `v` = `system.auth.passMarkChars` (16) ký tự đầu của `HMAC('pw:' + pass_hash)` (đổi mật khẩu → phiên đã cấp vô hiệu), `sv` = `staff.session_version`, `exp` = now + `SESSION_DAYS` ngày (env `SESSION_DAYS` thắng `system.session.days` = 14).
- Thuộc tính: `Path=/; HttpOnly; SameSite=Lax; Max-Age=<giây>` + `; Secure` khi `COOKIE_SECURE=1`.
- `readSession` hợp lệ khi: chữ ký khớp, `exp > now`, `v` khớp mật khẩu hiện tại, tài khoản tồn tại, chưa khoá, `sv` (thiếu = 0) bằng `session_version`.
- `SESSION_SECRET`: env; nếu `NODE_ENV=production` hoặc `COOKIE_SECURE=1` mà thiếu → ném lỗi lúc nạp; dev sinh 32 byte lưu `settings.session_secret`.
- Giới hạn đoán (khoá `system.login.*`): 5 lần sai / 15 phút cho cùng (ip, tên) → khoá cặp 15 phút; 30 tên khác nhau sai từ một ip / 15 phút → khoá ip 15 phút; trần 5000 mục mỗi bảng. Thời gian chờ trả về = max(khoá cặp, khoá ip), làm tròn lên giây; câu báo dùng `ceil(giây/60)` phút.
- `clientIp`: không `TRUST_PROXY` (hoặc sai, phải nguyên 1..`system.auth.trustProxyMaxHops` = 10) → địa chỉ socket; có `n` → mục thứ `n` từ phải của `X-Forwarded-For`, không phải IP thì về địa chỉ socket (`src/platform/http.ts`).

### 4.3 Cảnh báo thay cho chặn (`src/platform/warnings.ts`)

- `warnIf(code, violated, opts)`: `violated` sai → `false`. `quiet` → chỉ trả `true`; còn lại `warn(code, text, extra)` với `text` = `message` (+ `". " + consequence`), `extra` gồm `severity`, `count`, `link`, `details`.
- `warn`: ngoài yêu cầu → bỏ; trùng (code, message) → bỏ; > 50 → đếm `dropped`.
- `take()`: danh sách + mục `WARNINGS_TRUNCATED { count }` nếu có dư. `codes()`: mã không trùng, tối đa `WARN_CODES_AUDIT_MAX` (20).
- `selfDecision(isSelf, …)` = `warnIf('SELF_DECISION_FORBIDDEN', isSelf, { message: … })`.
- `scope({ label, details }, fn)`: trong `fn` (đồng bộ) mọi `warn` đổi message thành `"<label>: <message>"` và trộn `details` vào cảnh báo, nên cùng một cảnh báo của hai người là hai mục (dùng ở `PUT /sheet/bulk`); ngoài yêu cầu thì chỉ chạy `fn`.
- `optionalReason(value, { max=300, … })`: cắt khoảng trắng; > max → lỗi 400 (code mặc định `REASON_REQUIRED`); trả chuỗi (có thể rỗng).
- Phản hồi 2xx dạng object mang `warnings: [{ code, message, severity, ...}]`; yêu cầu lỗi không mang cảnh báo.
- Audit: mọi dòng ghi trong yêu cầu có cảnh báo nhận `after.warnings = codes()`; nếu có `SELF_DECISION_FORBIDDEN`/`APPROVAL_SELF` và `entry.subject === actor` thì thêm `after.self = true` (`src/platform/audit.ts`).

### 4.4 Giới hạn tải (`src/ops/limiters.ts`, `src/ops/route-classes.ts`)

- `RateLimiter` (ghi): mỗi tên đăng nhập một xô, dung lượng = `perMinute` (240), nạp `perMinute/60000` token/ms theo `performance.now()`. Còn ≥ 1 token → trừ 1, trả 0. Hết → `max(1, ceil((1 − tokens) / refillPerMs / 1000))` giây.
- Không giới hạn: `POST /punch`, `POST /login`, `POST /logout` (`src/ops/route-classes.ts`).
- `LoadShedder` cho `HEAVY_ROUTES` = `GET /team`, `GET /alerts`, `GET /approvals`, `GET /periods/:month/estimates`, `GET /staff`, `GET /ai/review`, `PUT /sheet/bulk`: từ chối khi `apiInflight ≥ 150` ("quá nhiều yêu cầu đang xử lý") hoặc trung vị trễ vòng lặp gần đây `p50 ≥ 150 ms` ("máy chủ đang nghẽn"). `Retry-After` 3 giây.
- `AsyncGate` (băm đăng nhập): `running < 4` chạy ngay; không thì xếp hàng nếu hàng < 200, không thì `Overloaded`.
- `RuntimeMonitor`: histogram độ phân giải 20 ms, cứ 5000 ms lưu cửa sổ đã kết thúc rồi reset; `recent()` = max của cửa sổ hiện tại và cửa sổ trước; mỗi mẫu trừ 20 ms độ phân giải, làm tròn 0,1 ms.

### 4.5 Bộ nhớ đệm phép tính nặng (`src/ops/compute-cache.ts`)

`get(key, compute)`: `rev = total_changes()`; mục có sẵn dùng lại khi `rev` bằng và `0 ≤ tuổi < 15000 ms`; không thì tính, chỉ lưu nếu `total_changes()` chưa đổi trong lúc tính; vượt 64 mục bỏ mục chèn sớm nhất. Giao dịch hoàn tác vẫn làm `total_changes()` tăng (chỉ làm mất cache, không sai). Người dùng: soát AI (`ai-review|<tháng>|<0|1>`), ước tính cả kỳ (`estimates|<tháng>`, `src/domain/period/periods.ts`).

### 4.6 File tĩnh (`src/platform/http.ts`)

- `PUBLIC` = `public/`; `WEB_DIST` = `WEB_DIST` (env) hoặc `web/dist`.
- `/` → `web/dist/index.html` nếu có (`no-cache`), không thì 503 kèm câu hướng dẫn build (không chuyển hướng).
- Giải mã đường dẫn (sai → 404), có `\0` → 404; ghép với `WEB_DIST` (nếu có index) rồi `public/`; ra ngoài thư mục gốc → 404.
- Cache: `/assets/*` trong `web/dist` → `public, max-age=31536000, immutable`; còn lại `no-cache`. ETag yếu `W/"<size hex>-<mtime hex>"`, `If-None-Match` khớp → 304.
- Đuôi `.html .js .css .svg .json .txt` ≤ 2 MB: đọc + gzip mức 9 một lần, giữ RAM; gửi gzip nếu client nhận và nhỏ hơn; `HEAD` không gửi thân. File khác: stream bằng `pipeline`.
- Có `web/dist` mà đường dẫn không đuôi và không có file → trả `index.html` (router Vue). Ngược lại 404 `Not found`.
- Kiểu MIME khai: html, js, css, png, svg, ico, jpg, webp, woff2, json, txt; đuôi khác → `application/octet-stream`.

### 4.7 Nhật ký kiểm toán

**Ghi** (`src/platform/audit.ts` → `src/platform/db.ts`):
1. `withWarnings` (4.3). Hàng rào: `JSON.stringify([before, after, reason, entityId])` khớp `/scrypt\$|luong_sid|pass_?hash|session_secret|"?(lat|lng)"?\s*:/i` → ném `Error` (500, cả thao tác hoàn tác).
2. Kiểm: `actor`, `action`, `entityKind`, `entityId` bắt buộc; chuỗi ≤ 200 ký tự (reason ≤ 300, requestId ≤ 100); `sensitivity ∈ normal/pay/pii`; mỗi JSON ≤ 65.536 ký tự; `actorRoles` sắp xếp; `month` qua `monthOf` (nhận ngày → tháng). Lỗi → `AUDIT_ARGS` (500).
3. Tra `uuid` của `subject` và `actor` (không vào chuỗi băm).
4. Trong `transaction`: đọc dòng cuối; `id = last.id + 1` (1 nếu trống), `prev_hash = last.hash` ('' nếu trống); `hash = 'hmac-sha256:' + HMAC(AUDIT_KEY, canonical)` nếu có `AUDIT_KEY`, không thì `'sha256:' + SHA256(canonical)`.
5. `canonical = JSON.stringify([id, prev_hash, at, actor, actor_roles, action, entity_kind, entity_id, subject, month, before_json, after_json, reason, sensitivity, request_id])` (null cho trường vắng) (`src/platform/db.ts`).

Quy ước người gọi: gọi `audit.write` bên trong `store.transaction` của thao tác; yêu cầu bị từ chối ném trước khi ghi.

**Kiểm** `verify()` (`src/platform/db.ts`): đọc theo trang 1000 dòng tăng dần id; dòng đầu tiên sai → `{ ok:false, checked, firstBadId, reason }` với `reason`: `PREV_HASH` (đứt nối), `ID_GAP` (id không liên tiếp), `HASH` (nội dung đổi). Dòng HMAC mà thiếu khoá: đếm `unverifiable`, chỉ kiểm nối. Kết thúc: có `unverifiable` → `{ ok:false, reason:'AUDIT_KEY_MISSING', unverifiable }`; không thì `{ ok:true, checked, reason:null }`.

**Lọc** `auditFilter` (`src/platform/db.ts`): `actor`, `action`, `subject`, `subjectUuid`, `person {uuid, username}`, `month`, `entity`/`entityKind`/`entityId`, `from`/`to` (ngày trần = biên ngày UTC; ISO đủ thì dùng nguyên), `sensitivities`, `afterId`, `beforeId`. `count(filter, { cap })` dừng đếm ở `cap` nếu có.

**Hồ sơ nhân sự** (`src/platform/audit.ts`): một lần lưu có thể sinh tới 3 dòng `staff.create|staff.update`: trường thường (`name, familyName, givenName, role, shiftCode, startDate, jobTitle, contractStatus, resignedOn`, kèm `passwordSet` nếu đặt mật khẩu) mức normal; trường tiền (`type, level, nightPct, idorm, contract, insured, dependants, leaveAdjust, taxOn, deductOn, advanceOn`) mức pay; `birthday` chỉ ghi `{ changed }` mức pii.

**Số sửa phiếu** (`src/platform/audit.ts`): một dòng `slip.override` cho mỗi ô đổi, `entityId = "<user>:<tháng>:<ô>"`, pay.

### 4.8 SSE — xem mục 5.

### 4.10 Registry tham số và dữ liệu sinh

**Thành phần**

| File | Vai trò |
| --- | --- |
| `src/engine/payroll-params.ts` | `DEFAULTS` (bản phẳng của mọi khoá tham số, khối `GENERATED` do script sinh), `resolveParamSet`, `buildParamClasses`, `canonical`, `UI_COMPONENTS`. Dùng chung trình duyệt + máy chủ. |
| `src/params/registry.ts` | Nạp JSON, biên dịch mẫu khoá `a.<x>.b` thành RegExp (`<x>` khớp đúng một đoạn); `entryFor(key)` chọn mẫu có nhiều chữ cố định nhất; `keysOf(entry)`. Hằng: `CLASSES` (`choice, number, table, formula, fixed, removed`), `EDITABLE_BY` (`admin, accounting, ops, locked`), `LEGAL_TIERS` (`floor, ceiling, exact, release, policy, structure`), `WRITE_CAP` (`admin → config.payroll`, `accounting → config.legal`; `ops`, `locked` không ai sửa trên màn). |
| `src/params/store.ts` | Đọc theo tháng: `resolve(month)` (bộ tham số hiệu lực, đóng băng, kèm `classes`, `rev`, `hash` sha256 của `canonical(params)`, `applied`, `skipped`), `view(month, {group})` (dữ liệu màn Cài đặt, dựng hoàn toàn từ registry), `firstRun(month)`. `params_mode = defaults-only` bỏ qua mọi dòng phiên bản và dùng `DEFAULTS`; `active` chồng các dòng `param_versions` hợp lệ lên `DEFAULTS`, rồi chồng dòng danh mục chức vụ / bậc / ca. Dòng sai cấu trúc hoặc dòng người dùng ghi cho khoá `locked/ops/fixed` bị bỏ qua và báo ở `skipped` (log một lần mỗi dòng). |
| `src/params/save.ts` | Ghi: `preview` (luôn trả dữ liệu, không ghi gì), `save` (các dòng `param_versions` + một dòng nhật ký cho mỗi khoá + `config_rev` trong một giao dịch), `revert` (thêm dòng mới mang giá trị của phiên bản được hoàn tác), `addPosition`, `addLevel`, `addBlock`, `confirmBlock`. |
| `src/params/validate.ts` | Nơi duy nhất sinh thông báo lỗi tham số: kiểm cấu trúc (kiểu, khoảng, tập phương án có `available`), liên trường (`crossChecks`), sàn / trần luật (`floor`/`ceiling`; mức `hard` chặn, mức `warn` trả cảnh báo cần xác nhận). |
| `src/params/attributes.ts`, `positions.ts`, `blocks.ts`, `block-defs.ts` | Thuộc tính mở rộng của bậc lương, chức vụ do C&B thêm, danh mục khối phụ cấp có sẵn, khối phụ cấp do C&B thêm — đều là dữ liệu đi vào các họ khoá hiện có qua cùng đường ghi. |
| `src/params/wired-flag.ts` | `isKeyWired(entry, key)`: khoá đã nối vào bộ máy chưa. |

**Lưu tham số** (`src/params/save.ts`): thân `{ changes: [{ key, value }], effectiveMonth?, reason, expectedRev, acknowledge?, basis? }`. `effectiveMonth` mặc định là tháng chưa khoá công sớm nhất (`earliestOpenMonth`; chưa có kỳ nào thì là tháng hiện tại); sớm hơn → cảnh báo `PERIOD_LOCKED` kèm `minEffectiveMonth`. `expectedRev` lệch `paramsRev` → 409 `PARAMS_STALE`. Khoá có nền `settings:*` → 400 `PARAM_BACKED_BY_SETTINGS`; khoá `ops`, `locked`, `fixed` → 400 `PARAM_LOCKED`; khoá chưa nối vào bộ máy → 400 `PARAM_NOT_WIRED` (xem trước vẫn kiểm được, liệt kê ở `notWired`). Năng lực theo `editableBy` từng khoá (lô trộn cần cả `config.payroll` và `config.legal`, thiếu một → 403 `FORBIDDEN_CAP`). Tối đa `system.params.maxChanges` (50) thay đổi một lần. Lần Lưu đầu bật `params_mode = active`: cho phép khi không phải môi trường production (`NODE_ENV` ≠ production và `COOKIE_SECURE` ≠ 1), hoặc khi `PARAMS_ALLOW_ACTIVATE=1` (`activationAllowed`, `save.ts`). Sửa lịch làm việc của chức vụ cần `SCHEDULE_ALLOW_EDIT=1`, sửa giờ vào / ra của ca có sẵn (`shift.preset.<mã>.in|out`) cần `SHIFT_ALLOW_EDIT=1` trong môi trường production (`save.ts,73`); môi trường khác sửa tự do.

**Sinh `DEFAULTS` và kiểm** (`scripts/params/`)

| Script | Lệnh | Việc làm |
| --- | --- | --- |
| `key-map.ts` | (dữ liệu) | Bảng đường dẫn mã → khoá tham số; mục kiểu `key`, `ignore`, `derived`. |
| `check.ts` | `npm run params:check` | Kiểm: `DEFAULTS` khớp mã; mỗi mục registry hợp lệ (loại, `editableBy`, nhóm, nhãn, thành phần giao diện theo loại, khuôn bảng); mọi khoá của `DEFAULTS` thuộc đúng một mục; giá trị dẫn xuất khớp bản chép trong mã; khoá đã phát hành không mất. `--counts` in số mục theo loại / `editableBy` / nhóm. Thoát 1 khi có lỗi. |
| `lock.ts` | `npm run params:lock` | Thêm tên khoá vào `keys.lock.json` (chỉ thêm). |
| `doc.ts` | `npm run params:doc` | Dựng bảng danh mục cấu hình từ registry (`--out`, `--check`, `--json`). |
| `wired.ts` | (tay) `node scripts/dev/ts.cjs scripts/params/wired.ts [--write]` | Tính cờ `wired` bằng đọc tĩnh văn bản nguồn; `--write` ghi vào registry. |
| `check-fallbacks.ts` | (tay) | So bản `FALLBACK` trong các mô-đun dùng chung (`actual-hours, approval-view, kpi-score, punch, leave, payroll-calendar, work-schedule`) với `DEFAULTS`. |
| `gen-formula-vocab.ts` | (tay) | Sinh khối `GENERATED` của `src/engine/formula-vocab.ts` từ bộ máy lương và registry; `--check` dùng trong `params:check`. |
| `plain-text.ts`, `apply-plain-text.ts`, `plain-text.json`, `first-run-text.json` | (tay) | Chữ hiển thị cho Admin của từng mục (`help`, `basis`, `legalBasis`, `lockReason`) và chữ Cài đặt ban đầu; `apply-plain-text.ts` vá `registry.data.json`. |
| `prove-default-graph.ts`, `scan-magic-numbers.ts` | (tay) | So đồ thị công thức mặc định với bộ máy từng bit trên ca vàng; quét hằng số ngoài 0 và 1 trong mã tính lương. |

Quy ước khoá: `KEY_RE = ^[a-z][a-zA-Z0-9]*(\.([a-zA-Z0-9_]+))*$`. Các họ khoá đáng nhớ: `system.*` (giới hạn kỹ thuật, `editableBy: ops`), `unit.*`, `ai.threshold.*`, `ai.rule.<id>.enabled`, `ai.limit.*`, `type.<mã>.*`, `level.<mã>.<bậc>.*`, `position.def.<mã>`, `block.def.<mã>`, `class.level.attr.<mã>`, `shift.preset.<mã>.in|out`.

### 4.11 Sao lưu và khôi phục (`scripts/ops`)

**params-mode.ts** — `status` (chỉ đọc: mode, config_rev, số dòng param_versions, id audit cuối) hoặc `defaults-only --reason "<10..300>" --yes [--backup-dir=]`: đang `defaults-only` → không làm gì; nhật ký là HMAC mà thiếu `AUDIT_KEY` → từ chối; sao lưu bằng `scripts/ops/pg-backup.ts` (bắt buộc); một giao dịch: `params_mode = 'defaults-only'`, `configRev.bump()`, audit `param.mode` với actor `ops:<user hệ điều hành>`. Không đụng `param_versions`.

#### Sao lưu PostgreSQL (`scripts/ops/pg-backup.ts`, `src/ops/pg-backup.ts`)

Không cần `pg_dump`; không đọc `.env`; không in dữ liệu hay mật khẩu (URL được che `//***@`).

| Lệnh | Việc |
| --- | --- |
| `npm run pg:backup` (`pg-backup.js backup [--source=<DB>] [--dir=] [--keep=]`) | `--source` mặc định `DATABASE_URL`, `--dir` mặc định `BACKUP_DIR` hoặc `./backups`, `--keep` mặc định `BACKUP_KEEP` hoặc 30. Xuất mọi bảng trong MỘT giao dịch `REPEATABLE READ` chỉ đọc (ảnh chụp nhất quán dù app đang ghi) ra file `luong-YYYYMMDD-HHMMSS.pgbak.gz` (giờ VN); ghi file `.partial`, tự kiểm lại (`verifyFile`) rồi mới đổi tên và xoá các bản cũ vượt `keep` (chỉ file đúng mẫu tên). |
| `npm run pg:verify` (`verify --backup=<file>`) | Đọc cả file, tính lại số dòng và dấu vân tay SHA-256 từng bảng, so với header; phát hiện file cắt dở (thiếu dòng kết thúc), sửa một ô, gzip/JSON hỏng. |
| `npm run pg:drill` (`drill --backup=<file>`) | Cần `DRILL_PG_CONTROL_URL` trỏ tới PostgreSQL control riêng có quyền `CREATEDB`; khôi phục vào database `luong_drill_*` do drill tạo, đối chiếu từng bảng và tổng lương, rồi chỉ dọn database đó. |
| `npm run pg:restore` (`restore --backup=<file> --to=<DB mới> --confirm-new-empty-db`) | Chỉ vào DB MỚI (đã chạy migration, chưa có dữ liệu ngoài các bảng gieo sẵn): thiếu migration hoặc đích không rỗng thì từ chối. Một giao dịch: xoá dòng gieo sẵn, chép theo thứ tự khoá ngoại (`OVERRIDING SYSTEM VALUE`), đặt lại dãy số tự tăng, đối chiếu dấu vân tay từng bảng và tổng tiền kỳ lương TRƯỚC khi COMMIT; lệch là hoàn tác. Thiếu cờ xác nhận thì không làm gì. |

`<DB>` là URL PostgreSQL. Drill yêu cầu `DRILL_PG_CONTROL_URL` riêng và không dùng URL ứng dụng làm nơi tạo DB tạm. Định dạng file: gzip của NDJSON — dòng đầu là header (`format`, `version`, `createdAt`, `migrations`, `order`, `tables[{ name, rows, sha256, identity }]`, `payroll`), tiếp theo `{ t, r }` từng dòng (BYTEA dạng `{ $b64 }`), dòng cuối `{ end, rows }`. Mẫu hẹn giờ hằng ngày: `deploy/systemd/luong-pg-backup.service.example` và `deploy/systemd/luong-pg-backup.timer.example` (sao lưu rồi diễn tập khôi phục bản mới nhất). Test: `test/ops/pg-backup.test.ts` chạy trên PostgreSQL riêng.

Giới hạn: đọc cả bảng vào bộ nhớ khi xuất/khôi phục (đủ cho quy mô hiện tại; bảng lớn hơn cần xuất theo lô); chưa có sao lưu liên tục (WAL/PITR) — cần `pg_basebackup`/dịch vụ quản lý nếu yêu cầu RPO thấp hơn một ngày. Sao chép bản sao lưu ra khỏi máy chủ là việc vận hành, ngoài phạm vi script.

### 4.12 Sandbox và máy chủ kịch bản

**Sandbox** (`scripts/dev/sandbox-server.ts`, `npm run sandbox`)

- Cần `SANDBOX_PG_CONTROL_URL` trỏ tới PostgreSQL control riêng có quyền `CREATEDB`; sandbox tạo database tạm riêng với tiền tố `luong_sandbox_` và dọn database do lần chạy này tạo khi thoát hoặc nhận SIGINT/SIGTERM. Không dùng URL ứng dụng kế thừa. `SESSION_SECRET` ngẫu nhiên, cookie `luong_sandbox_sid`, `SESSION_DAYS=14`, `COOKIE_SECURE=0`, `TZ=Asia/Ho_Chi_Minh`. `global.Date` thay bằng đồng hồ đóng băng, thời điểm đầu là hằng `INITIAL_LOCAL` (07:55 sáng, ngày đầu tháng) giờ Việt Nam; `Date.now()` của mọi mô-đun máy chủ đọc đồng hồ này.
- Là tiến trình Node riêng, nạp `src/server.ts` (ứng dụng NestJS) và chuyển yêu cầu vào `http.Server` của nó (`appServer.emit('request', …)`): mọi đường không bắt đầu bằng `/__sandbox/` (trừ `/`, `/app`, trang có đồng hồ) đi vào ứng dụng thật. Chỉ nhận loopback (socket 127.0.0.1/::1 và `Host` là 127.0.0.1/localhost) → khác 403.
- Cổng `SANDBOX_PORT` (mặc định 3104; 0 = hệ điều hành chọn), nghe `127.0.0.1`. In `SANDBOX_READY {url, initialLocal}`. Bật `monitor` của `server.limits` (vì `start()` ở `src/main.ts` chỉ tự bật khi `src/server.ts` chạy trực tiếp). SIGINT/SIGTERM đóng gọn.
- API điều khiển (POST cần header `X-Sandbox-Control: 1` và `Origin` cùng host; thân ≤ 4096 byte):

| Đường | Việc |
| --- | --- |
| `GET /__sandbox/state` | `{ now, local, user, initialLocal, users[] }` + cookie phiên của người đang chọn. |
| `GET /__sandbox/ops` | Ảnh chụp trạng thái thử tải / sao lưu (`sandbox-ops.ts`). |
| `POST /__sandbox/clock { local }` | Đặt đồng hồ, dạng `YYYY-MM-DDTHH:mm[:ss]` giờ Việt Nam; sai dạng → 400; lùi giờ khi đã có dữ liệu chấm công (`attendance_sessions`, `attendance_days`, `punches`, `corrections`, `timesheets`, `explanations`) → 400. |
| `POST /__sandbox/user { username }` | Chọn tài khoản (phải có trong `staff`); trả cookie phiên. |
| `POST /__sandbox/reset { confirm: true }` | Đặt lại dữ liệu thử. |
| `POST /__sandbox/<tên của sandbox-ops>` | Nạp người dùng đo tải (tối đa 1.000), chạy / huỷ đo tải (kịch bản `login, checkin, mix, admin-burst, probe`, chạy `scripts/loadtest/run.ts` ở tiến trình con nhắm chính sandbox), sao lưu (`src/ops/pg-backup.ts` → file `.pgbak.gz` tạm, tối đa 6 bản), kiểm (`pg-backup.js verify`), diễn tập (`pg-backup.js drill`), làm hỏng bản sao giả (ghi đè 16 byte giữa luồng nén; bước kiểm phải bắt được). File tạm nằm trong thư mục tạm riêng, xoá khi tắt. |
| `GET /`, `/__sandbox/panel.js`, `/__sandbox/ops.js` | Bảng điều khiển. |
| `GET /app` | 302 tới `/admin` (tài khoản chọn là admin) hoặc `/nhan-vien` kèm `?dong-ho-sandbox=1`; mọi đường dẫn của router Vue (không có đuôi file) khi có tham số đó được trả `index.html` của `web/dist` kèm script đóng băng `Date` chèn vào đầu `<head>` (503 nếu chưa build). |

- Reset (`resetSyntheticData`): trong một giao dịch PostgreSQL xoá dữ liệu 13 bảng — `punch_requests, explanations, attendance_sessions, attendance_days, timesheets, slip_overrides, punches, corrections, sheet_approvals, kpi_scores, kpi_score_log, staff, settings` — rồi xoá bảng trạng thái kỳ lương theo thứ tự con trước cha — `payslips, payroll_runs, payroll_periods, ai_finding_actions, ai_review_runs, pay_entries, advance_requests`. `audit_log` không bị đụng. Sau đó đồng hồ về `INITIAL_LOCAL`, gieo 7 tài khoản `qa_nv`, `qa_night40`, `qa_night60`, `qa_ctv`, `qa_tts`, `qa_admin`, `qa_cb` (ngày vào làm = ngày của đồng hồ đầu), `holidays = []`, `qa_cb` không nhận lương + vai trò `cb`, người chọn về `qa_nv`.
- Bộ nhớ trong tiến trình sandbox gồm cả DB: tắt tiến trình là mất hết.

**Máy chủ kịch bản** (`scripts/dev/scenarios/`)

- Cần `SCENARIO_PG_CONTROL_URL` trỏ tới PostgreSQL control riêng (`luong_test_control` hoặc `luong_scenario_control`) có quyền `CREATEDB`; không fallback sang `DATABASE_URL` hay `PG_TEST_URL`. `generate.ts [--smoke] [--out-dir <dir>] [--out <file.pgbak.gz>]` tạo snapshot PostgreSQL cùng `events.jsonl`, `cases.json`, `probes.json`; `verify.ts [--db <snapshot.pgbak.gz>] [--out-dir <dir>]` khôi phục và kiểm tra bản sao; `server.ts [--fresh] [--at <local-date>] [--out-dir <dir>]` chạy bản sao làm việc và dọn database riêng khi thoát. Artifacts mặc định nằm ở `scripts/dev/scenarios/out/`; không chỉnh snapshot nguồn.

### 4.13 Biến môi trường

- **Biến môi trường mã đọc**: `DATABASE_URL`, `PG_TEST_URL`, `DRILL_PG_CONTROL_URL`, `DEMO_PG_CONTROL_URL`, `SANDBOX_PG_CONTROL_URL`, `SCENARIO_PG_CONTROL_URL`, `PORT`, `NODE_ENV`, `COOKIE_SECURE`, `TRUST_PROXY`, `SESSION_SECRET`, `SESSION_DAYS`, `SESSION_COOKIE_NAME`, `ADMIN_PASSWORD`, `AUDIT_KEY`, `ACCESS_LOG`, `WEB_DIST`, `UV_THREADPOOL_SIZE`, `PASSWORD_HASH_CONCURRENCY`, `WRITE_RATE_PER_MINUTE`, `SHED_MAX_LAG_MS`, `SHED_MAX_INFLIGHT`, `PARAMS_ALLOW_ACTIVATE`, `SCHEDULE_ALLOW_EDIT`, `SHIFT_ALLOW_EDIT`; script: `BACKUP_DIR`, `BACKUP_KEEP`, `VERIFY_TMP`, `SANDBOX_PORT`, `SEED_PASSWORD`, `SEED_ALLOW_REAL_DB` (`scripts/seed.ts` ở gốc).

### 4.14 Lệnh npm và cách chạy test

| Lệnh | Làm gì |
| --- | --- |
| `npm start` | `node --no-warnings=ExperimentalWarning src/server.ts` (đọc `.env`, cần `DATABASE_URL`). |
| `npm run sandbox` | `scripts/dev/sandbox-bootstrap.ts`: tạo DB PostgreSQL tạm từ `SANDBOX_PG_CONTROL_URL`, chạy `sandbox-server.ts` và dọn DB khi kết thúc. |
| `npm run seed` | `scripts/seed.ts` (không đọc `.env`; cần `DATABASE_URL` và `SEED_ALLOW_REAL_DB=1`). |
| `npm run seed:demo` | `scripts/db/seed-demo.ts`. |
| `npm run pg:backup` | `scripts/ops/pg-backup.ts`. |
| `npm test` | `scripts/test/postgres-runner.ts "test/**/*.test.ts"` (gồm `test/ops`); cần `PG_TEST_URL` trỏ tới control PostgreSQL riêng. |
| `npm run test:unit` / `npm run test:api` | Cùng runner, chỉ lấy thư mục tương ứng. |
| `npm run format` / `format:check` | `prettier --write .` / `--check .` (cả repo). |
| `npm run params:extract|lock|check|doc` | `scripts/params/*` (mục 4.10). |

Chạy một file test qua `scripts/test/postgres-runner.ts <file.test.ts>` với `PG_TEST_URL` trỏ tới control PostgreSQL riêng. Runner sở hữu một database tạm cho mỗi file và dọn database đó sau khi tiến trình test kết thúc; fixture API chỉ dựng máy chủ, dữ liệu giả, `SESSION_SECRET` và công tắc Agents trong database của file. Test API dùng `server.listen(0, '127.0.0.1')` (cổng do hệ điều hành chọn) và đồng hồ giả bằng ghi đè `Date.now`. `test/api/sandbox.test.ts` chạy sandbox ở tiến trình con.

**Ngân sách cỡ file và todo** (`test/tools`)
- `size-budget.ts`: đếm dòng file `.js .cjs .mjs .html .css` theo `git ls-files -co --exclude-standard` (không có git thì duyệt thư mục, bỏ `node_modules, .git, data, docs, playwright-report, test-results, GFT OFFICE, .claude, backups, ban-giao`). ≤ 800 không báo; 801..1200 chỉ in; > 1200 phải có trong `exceptions` của fixture với trần = bội trăm kế tiếp; `--write` chỉ hạ trần; `--allow-growth [--headroom=N]` cho nâng. Test: `test/unit/file-size-budget.test.ts` (ba kiểm: không file vượt 1.200 ngoài danh sách, file ngoại lệ không vượt trần, ngoại lệ còn đúng thực tế).

---

## 5. Realtime và nhật ký

### 5.1 SSE `GET /api/events` (`src/platform/events.ts`)

- Cổng: A. `handleSse` thêm: không có `me` → 401; tổng kết nối ≥ `EVENTS_MAX_TOTAL` (3000) → 503 `EVENTS_FULL` + `Retry-After: 3`.
- Kết nối thứ `maxPerUser + 1` (5 + 1) của cùng người: đóng các kết nối lâu nhất bằng `bye { reason: 'superseded' }`.
- Tiêu đề: `text/event-stream`, `no-store, no-transform`, `X-Accel-Buffering: no`; socket timeout 0, no-delay.
- Khung: `id: <EPOCH>-<seq>` (EPOCH đổi mỗi lần khởi động), `event: <tên>`, `data: <JSON>`.
- Khung đầu `hello { epoch, serverTime, configRev, build }` kèm `retry: 3000`. Có `Last-Event-ID` → thêm `resync {}` (không phát lại tin lỡ).
- Nhịp tim mỗi `EVENTS_HEARTBEAT_SEC` (25 s): đọc lại cookie (`auth.readSession`) — mất hiệu lực (đăng xuất, đổi mật khẩu, khoá, hết hạn) → `bye { reason: 'session' }`; còn → dòng chú thích `: ping`.
- Áp lực ghi: `writableLength > 262.144` byte → đóng lặng (khách nối lại).
- `closeUser(u, reason)` gửi `bye { reason }` cho mọi kết nối của người đó; lý do dùng: `logout`, `password`, `locked`, `session`, `superseded`. `closeAll()` đóng lặng (tắt máy chủ).

**Phát** `publish(name, payload, audience)` (`src/platform/events.ts`): tên lạ hoặc kiểu người nhận không cho phép → ném `Error` (lỗi lập trình). Mỗi lần phát đọc lại hồ sơ người nhận (một lần mỗi người); mất / bị khoá → `bye { reason:'session' }`. Người nhận nhận tầng đầu tiên đủ quyền (`scopeOf(me, cap) === 'all'`); trường ngoài `fields` bị bỏ; chỉ giữ giá trị phẳng (chuỗi, số hữu hạn, bool, null, mảng của chúng). Lỗi khi ghi một kết nối → đóng kết nối đó, không ném cho người gọi.

| Sự kiện | Người nhận | Tầng → trường | Phát ở |
| --- | --- | --- | --- |
| `params.changed` | all | `config.read` → `configRev, fromMonth, kind, groups, by`; còn lại → `configRev, fromMonth` | `emit.paramsChanged`: lưu/hoàn tác tham số (`src/modules/settings/settings.controller.ts`), khối, chức vụ, ca (`src/modules/blocks/blocks.controller.ts`, `positions.ts`, `shifts.ts`), danh mục (`catalog-change.ts`, `kind:'catalog'`), công tắc (`announceSetting`: `agents`, `geofence`, `holidays`). |
| `period.changed` | all | `payroll.view` → `month, status, rev`; còn lại → `month, stage` (`open`/`locked`/`paid`) | `src/modules/periods/periods.controller.ts` sau mỗi bước kỳ. |
| `approvals.changed` | cap `request.decide.*` phạm vi all | `month, pending` (pending = số `sheet_approvals` đang chờ, mọi tháng) | `src/modules/approvals/approvals.controller.ts`, tạm ứng (`src/modules/advance/advance-approvals.handlers.ts`, `advance-requests.ts`), giải trình (`src/modules/explanations/explanations.controller.ts`). |
| `attendance.changed` | cap `attendance.correct` phạm vi all | `kind (forgot|ot|punch|explanation), month` | `announceAttendance` (forgot), OT (`src/modules/attendance/attendance.controller.ts`), `announcePunches` (punch), giải trình có phiên (`src/modules/explanations/explanations.controller.ts`). |
| `request.decided` | users | `month, date, decision, kind` | `emit.requestsDecided` (một tin mỗi người: ngày sớm nhất, `decision:'mixed'` nếu khác nhau), `emit.advanceDecided` (`kind:'advance'`, không date). |
| `punch.corrected` | users | `month, date` | `src/modules/attendance/attendance.controller.ts`. |
| `punch.changed` | users | `month, date` | `announcePunches`, giải trình. |
| `estimate.changed` | users | `month` | lịch, KPI, khoản điền thêm, tạm ứng. |
| `payslip.available` | users (người có phiếu) | `month` | `src/modules/periods/periods.controller.ts` (sau mark-paid). |
| `roles.changed` | users | — | gán/thu vai trò (`src/modules/staff/staff.controller.ts`, `src/domain/roles/roles.ts`). |
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
| `slip.override` | slip_override | `src/platform/audit.ts` | pay |
| `ot.declare`, `ot.decide` | — | `src/modules/attendance/attendance.controller.ts` | xem file |
| `setting.agents` | setting | `src/modules/settings/settings.controller.ts` | pay |
| `setting.geofence` | setting | `src/modules/settings/settings.controller.ts` (không ghi toạ độ, chỉ `enabled`, `radiusM`, `centreChanged`) | normal |
| `role.grant`, `role.revoke` | staff_role | `src/modules/staff/staff.controller.ts` | pii |
| `role.create`, `role.update`, `role.deprecate` | — | `src/domain/roles/roles.ts,563,595` | xem file |
| `staff.create`, `staff.update` | staff | `src/platform/audit.ts`; `staff.update` còn ở gán ca hàng loạt (`PUT /staff/shift-bulk`) | normal / pay / pii |
| `staff.lock`, `staff.unlock` | staff | `src/platform/audit.ts` | normal |
| `staff.payrollSubject` | staff | `src/domain/roles/roles.ts` và nhánh `PUT /staff/:u` trong `src/modules/staff/staff.controller.ts` | pay |
| `param.set`, `param.mode` | — | `src/params/save.ts,801`; `param.mode` cả ở `scripts/ops/params-mode.ts` | xem file |
| `catalog.position.save`, `catalog.level.save`, `catalog.shift.save` | position / position-level / shift | `src/modules/catalog/catalog.controller.ts,77`, `src/modules/catalog/catalog.controller.ts` qua `catalog-change.ts` | pay |
| `sheet.onBehalf` | — | `src/domain/sheet-on-behalf.ts` | xem file |
| `period.lock-attendance`, `period.calculate`, `period.ai-review`, `period.approve`, `period.mark-paid`, `period.reopen` | period | `src/domain/period/periods.ts,369,404,508,523,536` | pay |
| `payslip.approve`, `payslip.return` | — | `src/domain/period/periods.ts` | xem file |
| `entry.create`, `entry.update`, `entry.decide`, `entry.void`, `entry.confirmFlags` | — | `src/domain/payroll/pay-entries.ts,457,493,523,559` | xem file |
| `advance.create`, `advance.decide`, `advance.cancel` | — | `src/domain/advance/advance-requests.ts,223,256` | xem file |
| `advance.request`, `advance.withdraw`, `advance.approve`, `advance.reject`, `advance.cancel` | — | `src/modules/advance/advance-approvals.handlers.ts,241` | xem file |
| `explanation.request`, `explanation.self`, `explanation.late-checkout` | — | `src/modules/explanations/explanations.controller.ts`, `late-checkout-session.ts` | xem file |
| `checkout.late.apply`, `checkout.late.revert` | — | `src/domain/explanation/late-checkout-session.ts` | xem file |
| `attendance.admin.set`, `attendance.admin.remove` | attendance_session | `src/domain/attendance/admin-presence.ts,286` | normal |

Mọi dòng có `actor`, `actorRoles` (vai trò lúc làm), `requestId` (một UUID cho cả yêu cầu), `at` (ISO UTC). `subject_uuid`/`actor_uuid` tra lúc ghi.

---

## 6. Phụ thuộc

### 6.1 Đồ thị require chính

- `src/server.ts` → `src/platform/config` (trước `.env`), `lib/register-ts`, `src/env`, `src/bootstrap`, `src/main`; `src/**` → `src/platform/db`, `src/platform/auth`, `src/platform/http`, `src/platform/request-rules`, `src/platform/announce`, `src/platform/authz`, `src/domain/roles/roles`, `src/platform/audit`, `src/params/*`, `src/domain/period/periods`, `src/platform/events`, `src/domain/findings/findings`, `src/ops/*`, `src/domain/explanation/explanations`, `src/domain/*` (container, ai-review, ai-block, …), `src/platform/warnings`. Đồ thị không vòng do `test/unit/require-cycles.test.ts` giữ (quét cả `src/`).
- `src/platform/db.ts` → `src/platform/warnings` (chỉ `warnIf`, `optionalReason`), `src/platform/config`, `src/domain/employee/person-name`, các schema của `src/domain`, `src/domain/attendance/attendance-sessions`, `src/domain/approvals/approvals`. `warnings.ts` không `require('./db')`.
- `src/platform/http.ts` → `src/platform/auth`, `src/platform/warnings` (gắn `bindHttpError(HttpError)`), `src/platform/config`.
- `src/platform/warnings.ts` → chỉ `src/platform/config` (lá; `test/unit/require-cycles.test.ts` giữ).
- `src/platform/events.ts` → `src/platform/db`, `src/platform/auth`, `src/platform/authz`, `src/platform/config`, `src/params/config-rev`, `src/params/registry`.
- `src/platform/audit.ts` → `src/platform/db`, `src/platform/authz`, `src/platform/warnings`.
- `src/domain/container.ts` → `src/platform/db`, các lớp `src/domain/*`; nạp muộn `src/platform/request-rules`, `src/domain/attendance`, `src/platform/audit`, `src/platform/warnings` trong getter (tránh vòng `db ↔ params ↔ domain`).
- `src/ai/*` thuần (không I/O, không đồng hồ), chỉ `require` `public/*.js` và nhau.
- `src/params/registry.ts` → `registry.data.json`, `src/engine/payroll-params.ts`; `src/params/store.ts` → `src/platform/db`, `registry`, `config-rev`, `attributes`, `positions`, `block-defs`, `validate`, `src/domain/catalog-params`.

### 6.2 Ai gọi nền tảng

- Mọi handler gọi `send`, `readJson`, `HttpError` (`src/platform/http.ts`), `warnIf`/`warn` (`src/platform/warnings.ts`), `audit.write` (trong giao dịch), `events.emit.*` (sau giao dịch), `store.transaction`, `store.assertPeriodOpen`.
- `src/domain/period/periods.ts` gọi `aiReviewResult` (bản không cache), `src/ai/thresholds` (`THRESHOLDS` để băm), `shared-cache` (ước tính).
- `src/params/save.ts` gọi `src/ai/preview-suggestions`, `configRev.bump`, `audit.write`.
- `scripts/ops/pg-backup.ts` nạp `src/platform/db` và `src/domain/period/periods`; `scripts/ops/params-mode.ts` nạp `src/platform/db`, `src/platform/audit`, `src/params/config-rev`; `scripts/ops/pg-backup.ts` chạy `src/server.ts`; `scripts/dev/sandbox-server.ts` nạp `src/platform/db`, `src/platform/auth`, `src/server.ts`.

### 6.3 Mô-đun dùng chung trình duyệt + máy chủ (UMD trong `public/`)

| File | Máy chủ dùng ở (nền tảng) |
| --- | --- |
| `src/engine/payroll-params.ts` (`DEFAULTS`) | `src/platform/auth.ts` (số `system.*`, `unit.*`), `src/ai/*`, `migrations/postgres/0001_baseline.sql` (gieo danh mục), `src/domain/approvals/approvals.ts`, `src/domain/attendance/attendance-sessions.ts`, `src/params/*` |
| `src/engine/leave.ts`, `src/engine/punch.ts`, `src/engine/work-schedule.ts` | `src/platform/request-rules.ts` |
| `src/engine/formula.ts`, `src/engine/payroll-graph.ts` | `src/params/validate.ts` (kiểm công thức, đồ thị) |

### 6.4 Đổi X thì phải kiểm tra Y

- **Thêm / đổi tên route** → thêm khoá `ROUTE_CAPS` trước (không có → 403 `NO_ROUTE_POLICY`); nếu đường dẫn có tham số phải sửa `routeKey`; đặt phương thức vào controller của module (`src/modules/<tên>/`) và đăng ký module trong `FEATURE_MODULES` đúng thứ tự (route cụ thể trước route có tham số); chạy `npm run spec:gen`; cập nhật `src/ops/route-classes.ts` nếu là route nặng / không giới hạn; chạy `test/api/permissions-matrix.test.ts`, `test/api/route-dispatch-golden.test.ts` (`record-dispatch.ts --write` khi cố ý đổi), `test/unit/route-classes.test.ts`.
- **Đổi `routeKey` hay thứ tự `FEATURE_MODULES` (`src/app.module.ts`)** → route có tham số có thể nuốt route cụ thể (ví dụ `PUT /staff/:u` nuốt `PUT /staff/shift-bulk` nếu module `staff` đứng trước `sheet`); kiểm `test/api/route-dispatch-golden.test.ts` và `test/unit/architecture.test.ts`.
- **Đổi `send` / `HttpError` / nhánh catch** → mọi phản hồi lỗi (`error`, `code`, `details`) và việc gộp `warnings`; giao diện đọc `code`. Test hạ tầng HTTP, `security-headers`, `warnings-cases`, `warnings-no-crash`.
- **Đổi `warnIf`** → mọi chỗ cảnh báo nghiệp vụ trong `src/platform/db.ts`, `src/domain/period/periods.ts`, `src/params/save.ts`, handler; `after.warnings` trong audit; `test/unit/warnings.test.ts`, `test/unit/no-control-mode.test.ts`, `test/api/warnings-cases.test.ts`.
- **Đổi `assertPeriodOpen` / `SCOPE_LOCKED_FROM`** → mọi route có `periodScope`, `catalog-change.ts`, `src/params/save.ts`, `src/domain/payroll/pay-entries.ts`, `src/domain/advance/advance-requests.ts`; `test/api/period-lifecycle.test.ts`.
- **Đổi `auditCanonical` / `auditHash`** → mọi chuỗi có sẵn không kiểm được nữa (`verify` báo `HASH` từ dòng đầu); `scripts/ops/pg-backup.ts`, `params-mode.ts` (kiểm kiểu băm dòng cuối). Đổi/bỏ `AUDIT_KEY` → dòng HMAC có sẵn thành `unverifiable`.
- **Thêm trường vào `before/after` của audit** → hàng rào `SECRET_RE` (`lat`/`lng` làm hỏng cả thao tác), trần 65.536 ký tự.
- **Thêm sự kiện SSE** → khai trong `EVENTS` (tên, kiểu người nhận, tầng, trường) rồi mới phát; thêm chỗ nghe ở giao diện Vue (`web/src`); `test/api/events.test.ts`.
- **Đổi `config.EVENTS_*`** → không đổi khoá registry `system.events.*` tương ứng (hai nơi), và ngược lại.
- **Đổi `src/platform/config.ts`** → chạy `npm run params:extract` (một số hằng là nguồn của `DEFAULTS`), `params:check`; `config` đóng băng lúc nạp và nạp trước `.env`.
- **Thêm / đổi khoá tham số** → thêm vào mã nguồn mặc định, `key-map.ts`, mục registry; chạy `params:extract`, `params:lock`, `params:check`; cờ `wired` qua `scripts/params/wired.ts --write`.
- **Đổi bộ máy lương (`src/engine/payroll-engine.ts`) hay tham số** → kết quả AI (luật cần payroll, `impacts`), cache AI theo `paramsHash`, `verify-backup` (tính lại phiếu từ bản chụp).
- **Đổi luật AI hoặc `rule.fields`** → `EVIDENCE_FIELDS`; id finding (`<luật>:<user>:<ngày>`) và digest xác định hiệu lực lần bỏ qua; `ai_block_rules`/`DEFAULT_BLOCK_RULES` dùng id luật; khoá `ai.rule.<camelCase>.enabled`; `test/unit/ai-review*.test.ts`.
- **Đổi ngưỡng AI** → `THRESHOLDS` là nguồn của `ai.threshold.*` trong `DEFAULTS`; `src/domain/period/periods.ts` băm `THRESHOLDS` khi không có `result.thresholds`.
- **Đổi hành vi của `GET /`** → `scripts/ops/pg-backup.ts` (đòi `GET /` = 200 khi đã build giao diện, 503 khi chưa) và `test/api/web-dist-static.test.ts`.
- **Đổi giới hạn thân yêu cầu** → `MAX_BODY_BYTES` (`src/platform/http.ts`).
- **Đổi cookie / phiên** → SSE heartbeat (đọc lại cookie), `restore-drill`, sandbox (`luong_sandbox_sid`), `test/helpers/api-fixture.ts` (`auth.createSession`).

---

## 7. Test hiện có

Bố cục: `test/unit/` (logic thuần và mô-đun dùng chung, không dựng máy chủ HTTP), `test/api/` (máy chủ thật trên PostgreSQL tạm qua `api-fixture`), `test/ui/` (logic giao diện chạy trong Node: nạp mô-đun `public/` và đọc văn bản file giao diện), `test/ops/` (script sao lưu), `test/fixtures/` (dữ liệu vàng, bản chụp lược đồ, bảng điều phối, ngân sách cỡ file, baseline todo), `test/helpers/`, `test/tools/`. Tên file có tiền tố ngày (`YYYY-MM-DD-…`) là test theo từng tính năng, không khác loại.

**Máy chủ, HTTP, giới hạn tải**: test hạ tầng HTTP + DB, test tải pha 0, `security-headers`, `web-dist-static`, `server-logic-regression` (trong `test/api/`); `limiters`, `route-classes`, `compute-cache`, `require-cycles` (trong `test/unit/`).

**Quyền, điều phối**: `permissions-matrix`, `route-dispatch-golden`, `period-permissions`, `domain-catalog-routes` (`test/api/`); `domain-classes` (`test/unit/`).

**Phiên, đăng nhập**: `mvp-auth`, `verify-fixes`, test đăng nhập tài khoản khoá, test mở khoá nhật ký, `password-reset-admin` (`test/api/`); test băm mật khẩu bất đồng bộ (`test/unit/`).

**Cảnh báo / Agents**: `test/unit/warnings.test.ts`, `no-control-mode` (`test/unit/`); `warnings-cases`, `warnings-no-crash`, `warnings-inventory`, `period-flow-warns`, `settings-save-warns`, `agents-toggle` (`test/api/`).

**SSE**: `events`, test realtime chấm công (`test/api/`), dùng `test/helpers/sse-client.ts`.

**Nhật ký**: `audit-log`, `audit-paging`, `audit-followup-backend` (`test/api/`).

**DB, migration, kỳ lương**: `db-schema-snapshot`, `session-migration`, `kpi-scores-migration`, `period-lifecycle`, `period-lock-guards`, `period-stale`, `period-reopen`, `payslip-snapshot` (`test/api/`); `db-pay-entries` (`test/unit/`).

**Tham số**: `settings-save`, `settings-save-failures`, `settings-preview`, `save-applies-everywhere`, `params-resolve-robust`, `formula-locked`, `levels-*`, `shifts-edit` (`test/api/`); `formula-*`, `shared-rules-params`, `position-defaults-zero-drift`, `schedule-defaults-zero-drift` (`test/unit/`).

**AI**: `ai-review*` (cùng `(đã bỏ)`), `phase2-review` (`test/unit/`); `ai-review-api`, `ai-review-dismissed`, `findings`, `checklist-punch-review`, test AI chặn duyệt (`test/api/`).

**Bộ máy lương so với khối đóng băng**: `payroll-golden`, `payroll-engine-differential`, `payroll-engine-bad-staff`, `pay-tail-*` (`test/unit/`).

**Phiếu và công thức Admin**: `slip-*` (`test/unit/`), `slip-detail-formulas`, `slip-row-columns-api`, `payslip-*` (`test/api/`).

**Vận hành, sandbox**: (cũng chạy `scripts/ops/pg-backup.ts`, `scripts/ops/pg-backup.ts`), `test/api/sandbox.test.ts`, test sandbox đặt lại trạng thái kỳ và giải trình. Không có test riêng cho `scripts/ops/pg-backup.ts` ngoài đường `--verify` của backup-daily, không có test cho `params-mode.ts`.

**Giao diện (Node)**: `test/ui/*.test.ts` — nhãn chấm công, lưới chấm công Admin, lịch làm bù Admin, loại ngày, iSAT chỉ thứ Bảy, KPI 5 thành phần, yêu cầu OT ngày lễ và yêu cầu tự gửi của nhân viên.

**Công cụ**: `test/unit/file-size-budget.test.ts`.

Không có test trình duyệt thật: `@playwright/test` là devDependency nhưng không có `playwright.config.js` hay thư mục `e2e/`.

---

## 8. Giới hạn và điểm lệch của nền tảng

Chỉ ghi nhận hành vi của mã; không phải danh sách việc đã lên lịch.

### 8.1 Số nghiệp vụ nằm rải rác

- Hằng tháng mốc: `DEFAULT_CUTOFF_MONTH` (`src/domain/approvals/approvals.ts`).
- Số nghiệp vụ nằm trong `src/platform/config.ts` thay vì registry: `CHECKOUT_GRACE_MIN` (30), `TAX_LONG_TERM_MONTHS` (3) (`src/platform/config.ts`).
- `UV_THREADPOOL_SIZE` đặt trong `.env` bị bỏ qua vì `src/platform/config.ts` được nạp trước khi `.env` được đọc (`src/server.ts` và); chỉ biến môi trường thật của tiến trình có tác dụng.

### 8.2 Cùng một giá trị ở nhiều nơi

- Độ dài lý do 10..300: `src/platform/config.ts` (`REASON_MIN/MAX`), `src/platform/db.ts` (hằng riêng), `scripts/ops/params-mode.ts` (hằng riêng), `src/domain/approvals/approvals.ts` (`DEFAULTS['control.reasonMaxLength']`), CHECK trong DDL (`src/platform/db.ts,538,585`).
- Giới hạn SSE: `src/platform/events.ts` đọc `config.EVENTS_*`, registry có `system.events.*`; tương tự `system.audit.page*` vs `config.AUDIT_PAGE_*`, `control.reasonMinLength` vs `config.REASON_MIN`, `system.login.*` (dùng ở `src/platform/auth.ts`) vs `config.LOGIN_*` (chỉ là nguồn cho `extract-defaults`). `config.LOGIN_WINDOW_MIN`, `config.ATTR_MAX_PER_CLASS` không được mã chạy đọc (chỉ `scripts/params/key-map.ts`).
- `MAX_BODY_BYTES = 1e6` viết cứng ở `src/platform/http.ts` (không trong `config`), registry có `system.http.maxBodyBytes`.
- Hàm trùng: `realResolve`/`isInside` ở `scripts/ops/pg-backup.ts` và `scripts/ops/pg-backup.ts`; chuỗi tên theo giờ VN ở `scripts/ops/pg-backup.ts`, `scripts/ops/pg-backup.ts`, `scripts/ops/pg-backup.ts`; `vnDayIso` ở `src/modules/audit/audit.helpers.ts`.
- `test/session-contract-helper.ts` giống hệt `test/helpers/session-contract-helper.ts`.
- `scripts/seed.ts` (`npm run seed`) gieo tài khoản mẫu; `scripts/db/seed-demo.ts` (`npm run seed:demo`) dựng bộ dữ liệu demo. Root seed dùng `SEED_PASSWORD` hoặc mật khẩu mặc định `'123456'` cho tài khoản nhân viên.

### 8.3 Ba cách khoá kỳ

- `guardPeriod` (`src/http/api-gate.ts`): `assertPeriodOpen` + `warnFrozen` (cảnh báo `PERIOD_FROZEN`).
- Gọi thẳng `store.assertPeriodOpen` (không có `PERIOD_FROZEN`): `src/domain/shared/catalog-change.ts`, `src/params/save.ts`, `src/domain/payroll/pay-entries.ts`, `src/domain/advance/advance-requests.ts`.
- Tự kiểm riêng, chặn cứng: `src/modules/advance/advance-approvals.handlers.ts`.
- `PUT /staff/:u/schedule` khai `periodScope: 'attendance'` (`src/platform/authz.ts`) nhưng handler ở `src/domain` không dùng `guardPeriod`; `periodScope` ở đây chỉ là tài liệu.

### 8.5 Hành vi dễ gây lỗi dây chuyền

- `scripts/ops/pg-backup.ts` đòi `GET /` = 302; `src/platform/http.ts` trả 200 `index.html` khi có `web/dist` → diễn tập khôi phục không qua khi `web/dist` có mặt, trừ khi `WEB_DIST` trỏ chỗ khác.
- `initApp()` (`src/app.init.ts`) gọi `Roles.reconcileStaffRole()` ghi DB ngay khi dựng máy chủ, tức khi `require('./server')` (test, sandbox, restore-drill).
- `GET /api/leave/ledger` ghi DB (`src/modules/leave/leave.controller.ts`) → làm `total_changes()` tăng, xoá cache AI/ước tính; `POST /api/leave/refresh` ghi mà không có audit.
- `src/ops/shared-cache.ts` nhớ câu lệnh `total_changes()` trên `store.db` lần đầu, không dựng lại khi `store.db` đổi; `src/domain/container.ts` thì kiểm `store.db` đổi.
- `src/platform/events.ts` `approvalsChanged(month)`: `pending` đếm `sheet_approvals` chờ của mọi tháng (không phải `month`), không gồm tạm ứng / giải trình, dù hai nhóm đó cũng phát sự kiện này.
- `src/domain/shared/catalog-change.ts` phát `groups: [entity.entityKind]` (chuỗi `position`, `position-level`, `shift`), còn `src/platform/events.ts` `groupsOf` phát mã nhóm số đã sắp → cùng trường `groups` có hai kiểu giá trị.
- Lọc ngày của nhật ký: `src/modules/leave/leave.controller.ts` (`vnDayIso`) đổi `from`/`to` thành biên ngày giờ VN; `auditFilter` (`src/platform/db.ts`) coi ngày trần là biên ngày UTC. API đi đường thứ nhất; người gọi `store.audit.list` trực tiếp với ngày trần nhận biên lệch 7 giờ.
- `src/modules/leave/leave.controller.ts` (nhánh `HttpError`) và `src/modules/leave/leave.controller.ts` (nhánh lỗi có mã của store) trải `...e.details` sau `error` / `code`: `details` có trường `error` (hoặc `code`) sẽ ghi đè.
- Mã lỗi không đều: `month` sai trả 400 có `code: 'BAD_MONTH'` ở `/settings/params`, nhưng không có code ở `/ai/review`, `/ai/findings/dismiss`, `/audit`; các lỗi 401, 403, 413 và 400 của `src/platform/http.ts` và `POST /login` không có code.
- `PUT /api/password` băm không qua `hashGate` (chỉ `POST /login` qua).

### 8.6 Mã không được gọi / thừa

- `src/platform/events.ts` `batch()` không có nơi gọi trong mã chạy; `announcement.posted` không được phát (chỉ test); `SYSTEM_FRAMES` chỉ xuất ra.
- `package.json` devDependency `@playwright/test` không được test nào dùng.
- `ApiGate.open` (`src/http/api-gate.ts`) tính `authz.routeKey(method, seg)` hai lần trong cùng yêu cầu (một lần cho `policyOf`, một lần cho `routeKey` của bộ chặn tải).
- Cột `staff.leave_balance` và sổ phép lưu sẵn được làm mới bằng hẹn giờ `LEAVE_REFRESH_MS` chỉ khi chạy `src/server.ts` trực tiếp; nạp qua `require` (test, sandbox) không có hẹn giờ này, nên số dư chỉ cập nhật khi có lời gọi `leave.refresh`.

### 8.7 Quy ước chưa đều


### 8.8 Chưa có

- Phạm vi nhóm của vai trò chưa có bảng phân công người quản lý: `can()` coi phạm vi nhóm như phạm vi chính mình (`src/platform/authz.ts`).
- Không có API sửa / xoá nhật ký, không có API đọc `ai_review_runs`, không có API xem `param_versions` thô (chỉ qua `GET /api/settings/params`).
- Không có thông báo qua kênh ngoài (thư, tin nhắn): sự kiện SSE chỉ là gợi ý nạp lại, không mang dữ liệu và không phát lại tin lỡ.
- Không có sao lưu hay lập lịch sao lưu bên trong ứng dụng: `scripts/ops/*` là lệnh chạy ngoài; repo không kèm tệp lập lịch cho chúng.
- Không có test trình duyệt thật (mục 7); `scripts/ops/pg-backup.ts` và `params-mode.ts` không có test riêng.
