# Tổng quan hệ thống Lương Nhân Sự

Đây là điểm vào của bộ SPEC. Tài liệu mô tả mã đang có trong cây này: ứng dụng làm gì, chạy thế nào, nằm ở đâu, đã làm được gì và còn gì mở. Chi tiết từng mảng nằm ở các file spec khác (mục 7). Đường dẫn tính từ gốc repo; `file:dòng` là vị trí hiện tại, mã đổi thì tìm lại theo tên hàm.

---

## 1. Bối cảnh

### 1.1 Ứng dụng là gì

Ứng dụng web nội bộ chấm công và tính lương cho một công ty ở Việt Nam. Nhân viên Check-in/Check-out theo lịch được cấp, gửi yêu cầu (nghỉ, OT, giờ bù, đi làm ngày lễ, giải trình, tạm ứng). Admin duyệt yêu cầu, sửa chấm công, chốt công và chạy bảng lương tháng gồm bảo hiểm, thuế TNCN, miễn thuế, tạm ứng, phép năm, KPI. Hệ thống phát phiếu lương cho từng người.

Loại nhân sự (chức vụ) có sẵn: Nhân viên (`nv`, 26 công chuẩn), Chuyên trách viên (`ctv`, 26 công chuẩn), Thực tập sinh (`tts`, 22 công chuẩn). Chức vụ là dữ liệu trong DB (mục 2.4): thêm chức vụ mới đi qua cùng đường lưu tham số. Quyền lợi khác nhau theo chức vụ (cờ `type.<mã>.benefit.*`). Với mặc định, TTS không có: OT, nghỉ lễ hưởng lương, phép năm, KPI, giờ nghỉ đêm có lương; chỉ NV có quyền lợi iSAT.

Ca làm: ca cố định `f1`, `f2`, `n1`, `n2` (ca ngày), `g1`, `g2` (ca đêm qua nửa đêm) và ca linh hoạt. Ca đêm thuộc ngày bắt đầu ca. Phụ cấp ca đêm theo phần trăm lương ngày (NV chọn 40 hoặc 60). Giờ làm ca và các phần trăm đều là tham số.

### 1.2 Ai dùng

| Vai trò | Vào đâu | Làm gì |
| --- | --- | --- |
| Nhân viên (`staff`) | `/nhan-vien` (giao diện Vue, `web/`) | Check-in/out, xem lịch tháng, gửi yêu cầu, giải trình, xin tạm ứng, xem thu nhập và phiếu lương của mình. |
| Admin, C&B (`cb`), kế toán (`accounting`), nhân sự (`hr`), quản lý (`manager`) và vai trò tuỳ chỉnh | `/admin` (giao diện Vue) | Theo năng lực của vai trò (`src/platform/authz.ts`): duyệt yêu cầu, sửa chấm công, tính và duyệt lương, cấu hình, xem nhật ký. |

Router Vue (`web/src/router`, kho phiên `web/src/stores/session.ts`) quyết định trang vào sau đăng nhập theo `GET /api/me`: người có năng lực quản trị vào `/admin`, còn lại vào `/nhan-vien`. Máy chủ vẫn kiểm quyền từng yêu cầu. Admin có thể thao tác thay một nhân sự (khai thay).

### 1.3 Các luồng chính từ đầu đến cuối

1. **Chấm công.** Nhân viên bấm Check-in trên ngày có lịch (hoặc ngày có OT/giờ bù đã duyệt). Máy chủ ghi một lượt (`attendance_sessions`) kèm ca được chốt lúc bấm, kiểm vùng GPS nếu bật. Check-out đóng lượt. Lượt có giờ hợp lệ thành ngày công; lượt có vấn đề (quên Check-out, ngoài ca, thiếu giờ, Check-out muộn) thành Chờ xử lý cho tới khi Admin quyết định.
2. **Yêu cầu.** Ngày nghỉ, OT, giờ bù, đi làm ngày lễ, nghỉ iSAT khai trên Lịch ước tính (`PUT /api/sheet`) thành khoản chờ duyệt (`sheet_approvals`). Admin duyệt hoặc từ chối; bộ AI rà soát theo luật có thể chặn duyệt khoản dính luật nặng.
3. **Giải trình.** Check-out muộn quá ngưỡng đi kèm giải trình ngay lúc bấm. Ngày quên chấm, vào trễ, về sớm có giải trình do Admin yêu cầu hoặc nhân viên gửi; Admin duyệt thì giờ được tính, từ chối thì ngày không tính công.
4. **Tạm ứng.** Nhân viên bấm xin (không nhập số). Số ứng tính theo quy tắc; Admin duyệt thì mới trừ vào thực lĩnh.
5. **Bảng lương tháng.** Vòng đời kỳ: mở → chốt công → tính lương → AI kiểm tra → duyệt → chi trả. Mỗi lần tính tạo bản chụp bất biến cho từng người. Admin sửa số trên phiếu có lý do; số chi trả = số tự tính áp số sửa, tính lúc đọc.
6. **Phiếu lương.** Admin xem phiếu đầy đủ, có công thức giải thích từng dòng ở phần Chi tiết, in A4. Nhân viên chỉ thấy phiếu chính thức sau khi kỳ đã chi trả; trước đó thấy số ước tính của tháng.
7. **Cuối năm.** Phép năm dư của một năm hết hạn vào cuối tháng cấu hình rồi đổi thành tiền ở phiếu tháng liền sau.

---

## 2. Kiến trúc

### 2.1 Thành phần

- **Máy chủ**: Node 22+ (`engines.node >= 22.13`), ứng dụng **NestJS 10 + TypeScript** trong `src/` (Express adapter). `src/server.ts` chỉ là điểm vào CommonJS (15 dòng): đặt `UV_THREADPOOL_SIZE`, chạy thẳng TypeScript bằng `tsx` (`node --import tsx src/server.ts`, không có bước build; test và script đi qua `scripts/dev/ts.cjs` đặt `NODE_OPTIONS=--import=tsx` để cả tiến trình con nạp được `.ts`), nạp `.env` (`src/env.ts`), dựng `http.Server` (`src/bootstrap.ts`) và gọi `start()` (`src/main.ts`) khi chạy trực tiếp. Phụ thuộc chạy: `@nestjs/*`, `express`, `rxjs`, `reflect-metadata`, `pg`, `tsx` (`package.json`). Kiểm kiểu: `npm run typecheck` (`tsc --noEmit`, cũng là test `test/unit/typecheck.test.ts`). Logic nghiệp vụ nằm ở `lib/` (luật, kho dữ liệu) và `src/modules/*` (route).
- **Cơ sở dữ liệu**: **PostgreSQL** (`src/platform/db.ts`), chọn bằng biến môi trường, không có mặc định: `DATABASE_URL` cho ứng dụng; `PG_TEST_URL` là control database riêng để tạo database tạm cho test. Không hỗ trợ database trong tiến trình hoặc `DB_PATH`. Lược đồ do migration có đánh số ở `migrations/postgres/*.sql`, chạy bởi `src/data/postgres-database.ts` (bảng `schema_migrations`). Mọi truy cập DB là `async` (`await store.ready` chờ khởi tạo). Truy vấn của ứng dụng là **Kysely** ở `src/data` (kiểu bảng sinh từ migration bằng `npm run db:types`), biên dịch thẳng ra PostgreSQL (`$1`, `ILIKE`, `jsonb`; cú pháp riêng gom ở `src/data/flavor.ts`) và chạy qua đúng kết nối của ứng dụng nên nằm trong `store.transaction`. Mọi aggregate của `src/platform/db.ts` (`settings`, nhật ký, tham số, kỳ lương/lần chạy/phiếu, AI, vai trò, nhân sự, bảng công, KPI), các store `approvals`, `attendance-sessions`, `pay-entries`, `advance-requests` và các lớp `src/domain` (ca, chức vụ, sổ phép, giải trình, hồ sơ) đi qua các `*Repository` trong `src/data`. SQL thô chỉ còn ở công cụ sao lưu `src/ops/pg-backup.ts` (đọc/ghi mọi bảng theo tên), bộ điều hợp `PostgresDatabase` và kiểm sức khoẻ; `test/unit/raw-sql-ratchet.test.ts` giữ số đó chỉ giảm và cấm controller import `src/data`. Ghi đồng thời an toàn nhờ khoá tư vấn `store.lock` (`src/data/locks.ts`) và 409 cho vi phạm ràng buộc duy nhất. Danh sách bảng, ràng buộc, trigger, chỉ mục: `spec/reference/database.md`.
- **Mô-đun dùng chung trình duyệt và máy chủ (UMD) trong `public/`**: cùng một file nạp bằng `<script>` ở trình duyệt và `require` ở máy chủ. Gồm bộ máy tính lương (`payroll-engine.ts`, `payroll-calendar.ts`, `payroll-day-parts.ts`, `payroll-graph.ts`, `payroll-pins.ts`, `pay-*-calc.js`), tham số mặc định (`payroll-params.ts`), quy tắc chấm công (`punch.ts`, `actual-hours.ts`, `work-schedule.ts`), quy tắc phép và KPI (`leave.ts`, `kpi-score.ts`), duyệt khoản (`approval-view.ts`), công thức (`formula.ts`, `formula-vocab.ts`), nhãn chấm công (`attendance-status.ts`). **Số tiền chính thức chỉ do máy chủ tính**; trình duyệt dùng cùng mã để hiển thị, xem trước và kiểm.
- **Giao diện**: ứng dụng Vue 3 ở `web/` (build ra `web/dist`; `src/platform/http.ts` → `serveStatic` phục vụ `web/dist` ở "/" và mọi đường dẫn của router Vue; chưa build thì "/" trả 503 kèm cách build, `/api` vẫn chạy). Giao diện tĩnh cũ trong `public/` đã bỏ; `public/` chỉ còn các mô-đun tính lương mà máy chủ nạp bằng `require`. Tham chiếu route của giao diện: `spec/reference/web-routes.md`.
- **Sự kiện thời gian thực**: `GET /api/events` (SSE, `src/platform/events.ts`). Sự kiện: `params.changed`, `period.changed`, `approvals.changed`, `attendance.changed`, `request.decided`, `punch.corrected`, `punch.changed`, `estimate.changed`, `payslip.available`, `roles.changed`, `announcement.posted`. Phát sau khi giao dịch COMMIT; mỗi sự kiện chọn người nhận và lọc trường theo quyền; màn hình tự nối lại và đồng bộ lại bằng `configRev`.
- **Công thức**: bảy công thức tháng có tên (`tyLeNgayDiLam`, `phuCapDiLai`, `phuCapChuyenCan`, `heSoNgayKpi`, `luongKpi`, `tongThuNhap`, `tamUng`) là cây định nghĩa trong `src/engine/payroll-graph.ts`; khoá `formula.*` bị khoá nên Admin không lưu công thức, chỉ chỉnh tham số bằng biểu mẫu. Bộ máy kiểm cây theo từ vựng, đơn vị và vòng lặp mỗi khi dựng nhân tính (`src/engine/payroll-engine.ts`); cây hỏng thì báo lỗi, không quay về công thức khác.
- **Lớp domain** (`src/domain/`): lớp có trách nhiệm rõ gắn với DB: `employee`, `position`, `shift`, `leave`, `explanation`, `advance`, `attendance` (nhãn trạng thái, Admin khai thay), `payroll`, `timesheet` (luật kiểm lịch khai dạng lớp `Rule`), `overtime`, `kpi`. `src/domain/container.ts` dựng lười các repository/service một lần. Luật nghiệp vụ là lớp kế thừa `Rule` (`src/domain/shared/rule.ts`), liệt kê ở `spec/reference/rules.md`.
- **Cảnh báo** (`src/platform/warnings.ts`): các kiểm nghiệp vụ gọi `warnIf(...)`: ghi cảnh báo kèm câu hệ quả vào phản hồi và chạy tiếp. Lỗi dữ liệu (sai dạng, trái ràng buộc cứng), bảo mật, quyền, không tồn tại, quá cỡ và chống ghi đè vẫn chặn bằng lỗi 4xx.
- **Quyền**: năng lực (`CAPS`), vai trò mặc định (`admin`, `cb`, `accounting`, `hr`, `manager`, `staff`), vai trò tuỳ chỉnh lưu ở `settings`. Chính sách từng route ở `ROUTE_CAPS` (`src/platform/authz.ts`); cổng quyền chạy trước handler.
- **Khoá kỳ**: `PERIOD_STATES` ở `src/platform/db.ts`. Từ `attendance_locked` trở đi chấm công, lịch, tham số, ngày lễ bị khoá; từ `approved` trở đi KPI và số sửa phiếu bị khoá. Route ghi gọi cổng này qua `ctx.guardPeriod(...)` (`src/http/api-gate.ts`).
- **Nhật ký kiểm toán**: `audit_log` ghi cùng giao dịch với thay đổi, chuỗi băm để kiểm (`GET /api/audit/verify`).
- **Giới hạn tải**: giới hạn đồng thời băm mật khẩu, giới hạn tốc độ ghi theo người, từ chối route nặng khi vòng lặp sự kiện trễ kéo dài (`src/ops/`, dựng ở `src/http/load-control.ts`, áp ở `ApiGate`).
- **Sandbox**: máy chủ thử `scripts/dev/sandbox-server.ts` (mục 4.2).
- **Giao diện Vue** ở `web/`: front-end tách rời, gọi `/api` qua `web/src/services/*`; các spec giao diện mô tả bộ tĩnh cũ ở `public/`.

### 2.2 Một yêu cầu `/api/*` đi qua

1. `src/bootstrap.ts` (`http.createServer`): gắn tiêu đề bảo mật; đường không bắt đầu bằng `/api/` đi tới `serveStatic` (`src/platform/http.ts`). Với `/api/*`: tăng bộ đếm yêu cầu đang xử lý (trừ `/api/events`), chờ ứng dụng Nest sẵn sàng, mã hoá lại dấu `%` của URL cho Express (đường dẫn gốc giữ ở `req.rawUrl`) rồi giao cho Express/Nest.
2. `ApiGuard` → `ApiGate.open` (`src/http/api-gate.ts`): đọc phiên cookie ký HMAC → `getStaff` → tra `ROUTE_CAPS` (không có khoá: 403 `NO_ROUTE_POLICY`; chưa đăng nhập: 401; thiếu năng lực: 403 `FORBIDDEN_CAP`) → route nặng bị từ chối khi máy chủ nghẽn (503 `OVERLOADED`) → giới hạn tốc độ ghi theo người (429 `WRITE_RATE_LIMITED`) → dựng ngữ cảnh nhật ký `actx` → `ApiContext` (`@Ctx()`): `req, res, url, seg, me, policy, actx, need(), needAdmin(), guardPeriod()`.
3. `RequestScopeInterceptor` (`src/http/request-scope.interceptor.ts`): bọc handler trong `warnings.run` (gom cảnh báo của yêu cầu) và `requestRules.run` (bộ quy tắc theo tháng dựng một lần); sau khi handler xong thì phát SSE đã xếp hàng (`announceAttendance`, `announcePunches`).
4. Phương thức controller trong `src/modules/<module>/` (danh sách ở `spec/reference/api-routes.md`): đọc thân bằng `readJson`, ghi trong `store.transaction`, phát SSE sau COMMIT, trả bằng `send` (JSON, gộp cảnh báo vào phản hồi).
5. `ApiExceptionFilter` (`src/http/api-exception.filter.ts`) đổi lỗi thành phản hồi: `HttpError` → `{ error, ...details }`; lỗi có `code` và `httpStatus < 500` của store → `{ error, code, ...details }`; `Overloaded` → 503 + `Retry-After`; còn lại 500 "Lỗi máy chủ". Đường dẫn không module nào nhận: `NotFoundModule` → 404 "Không có API này" (sau cổng quyền).

### 2.3 Nơi tính tiền

`src/engine/payroll-engine.ts` (1.642 dòng) dựng "nhân" tính từ một bộ tham số:

| Hàm | Dòng | Việc |
| --- | --- | --- |
| `calcDay` | 390 | Một ngày: lương ngày, giờ thiếu, phụ cấp ca, giờ nghỉ đêm, giờ bù, OT, giờ làm ngày lễ. |
| `calcMonth` | 631 | Duyệt các ngày của tháng, cộng dồn, sổ giờ bù, đếm ngày công. |
| `finishMonth` | 802 | Giờ vượt ngưỡng, chuyên cần, phụ cấp, KPI, khối phụ cấp, khoản điền thêm, quyết toán phép, thực lĩnh. |
| `mienThueOf` | 997 | Phần thu nhập miễn thuế. |
| `baoHiemOf` | 1043 | Bảo hiểm bắt buộc. |
| `netFrame` | 1069 | Khung thực lĩnh: gross → miễn thuế → bảo hiểm → thuế → tạm ứng → net. |
| `repinMonth` | 1132 | Tính lại từ bản chụp khi Admin ghim ô số lượng. |
| `computeMonth` | 1550 | Điểm vào cho một người một tháng. |

`src/domain/payroll/payroll-service.ts` nạp đầu vào (`loadInputs`, dòng 169; `payrollPeople`, dòng 106; `computeFor`, dòng 265). `src/domain/period/periods.ts` giữ vòng đời kỳ, phiếu, ước tính. `src/domain/payroll/slip-paid.ts` và `src/domain/payroll/slip-pins.ts` tính số chi trả; `src/domain/payroll/slip-formulas.ts` dựng công thức Chi tiết.

### 2.4 Dữ liệu danh mục

Chức vụ, bậc lương, quyền lợi và ca nằm ở các bảng `position_types`, `position_levels`, `position_type_benefits`, `benefit_types`, `work_shifts` (`migrations/postgres/0001_baseline.sql`) và ở khoá `type.<mã>.*`, `level.<mã>.<bậc>.*`, `position.def.<mã>` của bộ tham số. Khối phụ cấp do C&B thêm là `block.def.<mã>` (`src/params/block-defs.ts`); thuộc tính cột thêm cho bảng bậc là `class.level.attr.<mã>` (`src/params/attributes.ts`).

---

## 3. Cấu trúc thư mục

Danh sách theo `git ls-files`, rút gọn. Hai thư mục `GFT OFFICE/` và `data/` có thể tồn tại cục bộ ngoài git (tài liệu, dữ liệu, file DB) và không phải mã của ứng dụng; các spec không mô tả nội dung của chúng.

```text
.
├── src/server.ts                  Điểm vào (15 dòng): nạp TypeScript, .env, dựng máy chủ, start()
├── tsconfig.json              Cấu hình kiểm kiểu cho src/ (không build: chạy bằng tsx)
├── src/                       Ứng dụng NestJS (TypeScript)
│   ├── bootstrap.ts, main.ts, app.module.ts, app.init.ts, env.ts
│   ├── http/                  ApiGuard/ApiGate, RequestScopeInterceptor, ApiExceptionFilter, NotFoundModule, load-control
│   ├── data/                  Lớp truy vấn có kiểu (Kysely): db-dialect.ts, schema.generated.ts (sinh từ migration), *.repository.ts (audit-log, param-versions, payroll, records, attendance, pay, settings)
│   ├── shared/                Tiện ích dùng chung của module (reason.ts)
│   └── modules/<tên>/         20 module nghiệp vụ: controller, module, helpers, index.ts (cổng công khai)
├── migrations/postgres/       Migration có đánh số cho PostgreSQL (0001_baseline.sql, 0002_seed.sql)
├── package.json               Lệnh npm, engines Node >= 22.13; phụ thuộc chạy: NestJS, express, pg, tsx
├── package-lock.json
├── Dockerfile, .dockerignore
├── .env.example               Mẫu biến môi trường (DATABASE_URL, PG_TEST_URL, control URLs, ADMIN_PASSWORD, SESSION_SECRET, SESSION_DAYS, COOKIE_SECURE, TRUST_PROXY)
├── .prettierrc.json, .editorconfig, .gitattributes, .git-blame-ignore-revs   Định dạng mã
├── .claude/launch.json        Cấu hình chạy sandbox và máy chủ thử
├── deploy/                    Mẫu cấu hình (docker-compose.yml, proxy/, systemd/, *.env.example)
├── lib/
│   ├── db.ts                  Chọn PostgreSQL qua DATABASE_URL, hàng đợi giao dịch, các kho (staff, timesheets, settings, audit, kỳ lương, phiếu)
│   ├── data/                  postgres-database.js (pg.Pool, migration), postgres-sql.js (cầu nối truy vấn)
│   ├── http.ts                HttpError, send, readJson, serveStatic, tiêu đề bảo mật, clientIp
│   ├── auth.ts                Băm scrypt, giới hạn đoán mật khẩu, cookie phiên, mật khẩu admin đầu tiên
│   ├── authz.ts, roles.ts     Năng lực, vai trò, ROUTE_CAPS, vai trò tuỳ chỉnh
│   ├── warnings.ts            cảnh báo thay cho chặn
│   ├── config.ts              Hằng số kỹ thuật có tên (giới hạn, thời gian...)
│   ├── events.ts              Danh mục sự kiện và luồng SSE
│   ├── audit.ts               Ghi nhật ký kiểm toán
│   ├── request-rules.ts       rulesFor(tháng): dựng các mô-đun quy tắc dùng chung từ tham số của tháng
│   ├── announce.ts            Phát SSE sau COMMIT cho cấu hình và chấm công
│   ├── attendance-sessions.ts Bảng lượt chấm công và bảng nhớ requestId
│   ├── approvals.js           Bảng khoản chờ duyệt và đồng bộ dòng duyệt
│   ├── explanations.ts        Giải trình Check-out muộn
│   ├── advance-requests.ts, advance-cap.ts   Yêu cầu và mức tạm ứng
│   ├── pay-entries.js         Khoản điền thêm theo người theo tháng
│   ├── payroll-service.ts     Nạp đầu vào và tính lương một người
│   ├── periods.ts             Vòng đời kỳ lương, phiếu, ước tính, danh sách kiểm
│   ├── period-stale.ts, period-warnings.ts, period-allowance.ts   Kỳ lỗi thời, cảnh báo kỳ, tình trạng chuyên cần
│   ├── slip-paid.ts, slip-pins.ts, slip-formulas.ts   Số chi trả, ghim ô số lượng, công thức Chi tiết của phiếu Admin
│   ├── (đã bỏ), (đã bỏ)   Bỏ qua cờ AI trên phiếu, phát hiện dữ liệu thiếu
│   ├── ai/                    AI rà soát theo luật: (đã bỏ) (22 luật), (đã bỏ), (đã bỏ), (đã bỏ), positions.ts, (đã bỏ), (đã bỏ)
│   ├── domain/                Lớp domain
│   │   ├── container.ts, input.ts   Dựng đối tượng, kiểm dạng đầu vào
│   │   ├── (đã bỏ), attendance/   Phiên Check-in/out; session-status.ts (nhãn), session-view.ts, admin-presence.ts (Admin khai thay)
│   │   ├── explanation/       Giải trình: lược đồ, repository, service, Check-out muộn, route
│   │   ├── employee/          Hồ sơ nhân sự theo uuid, tên, thư mục nhân sự
│   │   ├── position/, shift/  Danh mục chức vụ, bậc, quyền lợi, ca
│   │   ├── leave/, leave-days.ts   Sổ phép lưu sẵn và tính ngày phép
│   │   ├── advance/           Duyệt tạm ứng theo tháng
│   │   ├── payroll/           Đối tượng bảng lương và chính sách
│   │   ├── shared/            Repository gốc, DomainError, đổi danh mục có khoá kỳ
│   │   ├── sheet.ts, sheet-on-behalf.ts, isat-rule.ts, ot.ts, schedule.ts   Lịch ước tính: kiểm, khai thay, giới hạn, iSAT, OT, giờ làm
│   │   ├── approvals.js, (đã bỏ), (đã bỏ), holidays.ts, blocks.ts, pay-entries.js, staff.ts, positions.ts, shifts.ts, catalog-params.ts
│   ├── ops/                   Giới hạn tải, theo dõi vòng lặp, nhật ký truy cập, bộ nhớ đệm tính toán
│   └── params/                Registry (registry.data.json, registry.ts), store.ts, save.ts, validate.js, config-rev.ts, positions.ts, blocks.ts, block-defs.ts, attributes.ts, keys.lock.json, wired-flag.ts
├── public/                    Mô-đun tính lương/chấm công dùng chung (UMD) mà máy chủ nạp bằng require; không phục vụ ra ngoài
│   ├── payroll-engine.ts, payroll-params.ts, payroll-calendar.ts, payroll-day-parts.ts, payroll-graph.ts, payroll-pins.ts, pay-blocks-calc.ts, pay-entries-calc.ts, pay-options-calc.ts, pay-tail-calc.ts   Bộ máy lương
│   ├── punch.ts, actual-hours.ts, work-schedule.ts, attendance-status.ts   Chấm công và lịch
│   ├── leave.ts, kpi-score.ts, approval-view.ts, formula.ts, formula-vocab.ts
│   ├── dang-nhap/             dang-nhap.js, dang-nhap.css
│   └── slip/                  Ảnh dùng cho phiếu A4 (logo, khẩu hiệu, hình mờ)
├── scripts/
│   ├── seed.js                npm run seed: nạp mẫu vào PostgreSQL sau khi xác nhận cấu hình
│   ├── dev/                   sandbox-server.ts, sandbox-ops.ts, sandbox.html, sandbox.js, sandbox-ops.js, scenarios/ (bộ dựng DB kịch bản cả năm)
│   ├── db/                    Công cụ DB: dữ liệu demo, kiểm migration, kiểm hiệu năng (chỉ nêu tên thư mục)
│   ├── ops/                   pg-backup.js, pg-backup.js, pg-backup.js, pg-backup.js, pg-backup.js, params-mode.ts
│   ├── params/                Công cụ registry: extract-defaults, lock, check, doc, wired, plain-text, key-map...
│   └── loadtest/              Bộ đo tải qua HTTP (run.ts, kit/, runs/)
├── spec/                      Bộ SPEC này
├── test/
│   ├── unit/                  130 file test đơn vị
│   ├── api/                   test qua máy chủ thật trên PostgreSQL tạm riêng
│   ├── ui/                    8 file test logic giao diện
│   ├── ops/                   Test sao lưu
│   ├── tools/                 Công cụ kiểm tĩnh: size-budget, record-dispatch, record-schema
│   ├── helpers/               api-fixture.ts, sse-client.ts, golden.ts, ...
│   ├── fixtures/              Dữ liệu vàng và bảng đã ghi (chỉ nêu tên)
│   └── session-contract-helper.ts
└── web/                       Front-end Vue riêng; máy chủ phục vụ web/dist khi đã build (chỉ nêu tên)
```

---

## 4. Cách chạy

### 4.1 Lệnh npm

| Lệnh | Việc |
| --- | --- |
| `npm start` | `node --no-warnings=ExperimentalWarning src/server.ts`. Đọc `.env` cạnh `src/server.ts` (`src/env.ts`, không ghi đè biến đã đặt). Cần `DATABASE_URL` trỏ tới PostgreSQL. DB trống thì tạo tài khoản `admin` bằng `ADMIN_PASSWORD`, không đặt thì mật khẩu ngẫu nhiên (không hiển thị); `NODE_ENV=production` đòi mật khẩu đủ dài. |
| `npm run sandbox` | Máy chủ thử (mục 4.2). |
| `npm run seed` | `scripts/seed.ts`: nạp tài khoản mẫu vào PostgreSQL được chỉ rõ bằng `DATABASE_URL`; yêu cầu `SEED_ALLOW_REAL_DB=1`, từ chối `DB_PATH`/`PG_TEST_URL`, chỉ thêm tài khoản chưa có và không in mật khẩu. |
| `npm run seed:demo` | `scripts/db/seed-demo.ts`: nạp bộ dữ liệu demo. |
| `npm run pg:backup` | `scripts/ops/pg-backup.ts`: sao lưu nhất quán, kiểm toàn vẹn, xoay vòng. |
| `npm test` | `scripts/test/postgres-runner.ts "test/**/*.test.ts"`; cần `PG_TEST_URL` trỏ tới control PostgreSQL riêng. |
| `npm run test:unit`, `npm run test:api` | Cùng runner, chỉ lấy thư mục tương ứng. |
| `npm run format`, `format:check` | Prettier. |
| `npm run params:extract`, `params:lock`, `params:check`, `params:doc` | Công cụ registry tham số (trích mặc định, khoá danh sách khoá, kiểm, sinh tài liệu). |

Biến môi trường chính: `DATABASE_URL`, `PG_TEST_URL`, `DEMO_PG_CONTROL_URL`, `DRILL_PG_CONTROL_URL`, `SANDBOX_PG_CONTROL_URL`, `SCENARIO_PG_CONTROL_URL`, `PORT`, `ADMIN_PASSWORD`, `SESSION_SECRET`, `SESSION_DAYS`, `COOKIE_SECURE`, `TRUST_PROXY`, `WEB_DIST` (thư mục giao diện Vue), `ACCESS_LOG=off`, và các biến nới giới hạn tải (`WRITE_RATE_PER_MINUTE`, `SHED_MAX_LAG_MS`, `SHED_MAX_INFLIGHT`, `PASSWORD_HASH_CONCURRENCY`, `UV_THREADPOOL_SIZE`).

### 4.2 Sandbox

`scripts/dev/sandbox-server.ts` nạp `src/server.ts` (ứng dụng NestJS) trong một tiến trình riêng:

- DB luôn là `:memory:` (ghi đè cả biến shell), chỉ nghe `127.0.0.1`, từ chối kết nối không phải loopback.
- Cổng lấy từ `SANDBOX_PORT` (mặc định 3104; `0` để hệ điều hành chọn). Ví dụ: `SANDBOX_PORT=0 npm run sandbox`; dòng `SANDBOX_READY ...` in cổng thật.
- Đồng hồ giả: `Date` bị thay bằng đồng hồ đóng băng bắt đầu ở một mốc cố định đầu tháng (hằng `INITIAL_LOCAL`), chỉ chạy khi được đặt. Chỉ trang mở qua `/app` (tới `/admin` hoặc `/nhan-vien` kèm `?dong-ho-sandbox=1`) mới dùng đồng hồ giả: sandbox chèn script đóng băng `Date` vào `<head>` của `index.html` trong `web/dist` (cần đã build giao diện); mở thẳng một đường dẫn dùng giờ thật của trình duyệt.
- Tài khoản mẫu (mật khẩu ngẫu nhiên mỗi lần dựng, không cần đăng nhập vì cookie phiên cấp theo tài khoản đang chọn): `qa_nv`, `qa_night40`, `qa_night60`, `qa_ctv`, `qa_tts`, `qa_admin`, `qa_cb` (C&B không nhận lương).
- Đường điều khiển:

| Đường | Việc |
| --- | --- |
| `GET /__sandbox/state` | Đồng hồ, tài khoản đang chọn, danh sách tài khoản. |
| `GET /__sandbox/ops` | Ảnh chụp trạng thái thử tải và sao lưu. |
| `POST /__sandbox/clock` `{ local: 'YYYY-MM-DDTHH:mm[:ss]' }` | Đặt đồng hồ (giờ Việt Nam). Không lùi được khi đã có dữ liệu chấm công. |
| `POST /__sandbox/user` `{ username }` | Chọn tài khoản đang đóng vai. |
| `POST /__sandbox/reset` `{ confirm: true }` | Xoá dữ liệu thử và dựng lại tài khoản mẫu; xoá cả bảng kỳ lương (`payroll_periods`, `payroll_runs`, `payslips`, kết quả AI, khoản điền thêm, tạm ứng). Không đụng `audit_log`. |
| `POST /__sandbox/load-seed`, `load-run`, `load-cancel`, `backup`, `corrupt`, `verify`, `drill` | Thử tải, sao lưu, làm hỏng bản sao, kiểm và diễn tập khôi phục (`sandbox-ops.ts`). |
| `GET /` , `/app` | Trang điều khiển và lối vào giao diện của tài khoản đang chọn. |

Mọi `POST /__sandbox/*` đòi header `x-sandbox-control: 1` và `Origin` cùng địa chỉ với `Host`.

`scripts/dev/scenarios/` dựng một DB kịch bản cả năm (`scripts/dev/scenarios/generate.ts`), phục vụ nó bằng một máy chủ xem (`scripts/dev/scenarios/server.ts`) và đối chiếu kết quả (`verify.ts`); file sinh ra nằm trong `out/` (không đưa vào git).

### 4.3 Test

- Dùng `node:test`. Thư mục: `test/unit` (hàm thuần, bộ máy lương, tham số), `test/api` (khởi máy chủ thật bằng `test/helpers/api-fixture.ts`: đồng hồ giả, `call()`, `reset()`, công tắc Agents bật), `test/ui` (logic giao diện chạy trong Node), `test/ops` (sao lưu), `test/tools` (công cụ kiểm tĩnh: ngân sách cỡ file, số test `todo`, tên chưa khai báo, bảng vàng điều phối, lược đồ DB).
- `npm test` chạy các file `test/**/*.test.ts` qua PostgreSQL runner. `PG_TEST_URL` phải trỏ tới control PostgreSQL riêng; runner tạo và sở hữu một database tạm cho mỗi file, rồi dọn database đó khi file kết thúc. Fixture API dùng database của file để dựng máy chủ và dữ liệu giả; nó không tự tạo database riêng.
- `test/fixtures/` chứa dữ liệu vàng và bảng đã ghi mà một số test so sánh.

---

## 5. Đã làm được

Mỗi mục dưới đây đã đối chiếu với mã. Chi tiết quy tắc nằm ở spec của mảng tương ứng.

### 5.1 Chấm công

- Check-in/out theo lịch được cấp; mỗi lượt giữ ca chốt lúc Check-in (`plannedShift`), giờ có mặt tới giây, và mã `requestId` để bấm lại không bị ghi hai lần (`POST /api/punch`).
- Nhân viên chỉ Check-in được ở ngày có lịch làm việc (không phải ngày lễ) hoặc ngày có OT/giờ bù đã duyệt. Ngày đã khai hoặc được duyệt nghỉ (phép năm, nghỉ không lương, iSAT, nghỉ được duyệt, nghỉ sẽ làm bù) bị chặn Check-in, trừ khi ngày đó có OT hoặc giờ bù đã duyệt (`checkInDay`, `src/modules/attendance/attendance.controller.ts`; giờ bấm còn phải thuộc khung ca hoặc khoản đã duyệt: `attendance.md` 3.2b). Admin (không thuộc bảng lương) không chấm công.
- Vùng GPS (`PUT /api/settings/geofence`, `src/domain/attendance/geofence-policy.ts`): khi đã đặt vùng, Check-in thiếu vị trí hoặc ngoài vùng vẫn ghi lượt, đánh dấu "Ngoài vùng GPS" và cảnh báo. GPS không tham gia tính tiền.
- Lượt mở quá `attendance.openSessionMaxHours` thành "Quên Check-out" (Chờ xử lý).
- Check-out muộn hơn giờ kết thúc ca (cộng phần làm thêm đã khai) quá `CHECKOUT_GRACE_MIN` phút phải đi kèm giải trình; lượt giữ giờ bấm ở Chờ xử lý tới khi Admin duyệt.
- Check-out sớm hiện hộp xác nhận ("Vẫn Check-out" / "Tiếp tục làm"); Check-out xong, lượt về sớm ở trạng thái Chờ xử lý.
- Sáu nhãn lượt (`src/domain/attendance/session-status.ts`, `src/engine/attendance-status.ts`): Đã Check-in, Đã Check-out, Chờ xử lý, Được phê duyệt, Bị từ chối, Đã chấm công (lượt do Admin ghi). Ngưỡng: vào trễ hơn `attendance.graceMin`, về sớm dù một phút, Check-out muộn hơn `CHECKOUT_GRACE_MIN`.
- Bảng giờ thực tế (`src/engine/actual-hours.ts`) đổi lượt thành ngày để tính tiền; ngày khai đi làm mà không có Check-in/out hợp lệ là vắng không phép; ngày thiếu một đầu chờ Admin xử lý và trả 0 đồng cho tới khi xử lý.
- Admin khai thay (`src/domain/attendance/admin-presence.ts`, `src/domain/sheet-on-behalf.ts`): ghi lượt "Đã chấm công" theo ca Admin chọn; ca khác ca được gán thì ngày đó tính tiền theo ca Admin ghi. Giờ chấm thật của ngày đó được giữ, không bị giờ Admin khai ghi đè.
- Giải trình: Check-out muộn; ngày quên chấm, vào trễ, về sớm (Admin yêu cầu hoặc nhân viên gửi). Giải trình bị từ chối thì ngày không tính công; vào trễ/về sớm được duyệt thì tính theo làm tròn hiện hành; quên chấm được duyệt thì tính một công với giờ ca như Admin ghi.

### 5.2 Yêu cầu và duyệt

- Lịch ước tính theo tháng (`GET/PUT /api/sheet`) với các loại ngày: đi làm, làm bù, phép năm, nghỉ không lương, nghỉ được duyệt, nghỉ sẽ làm bù, iSAT, kèm OT/giờ bù/đi làm ngày lễ. Các mục khoản chờ duyệt: `isat`, `approved`, `makeup_day`, `ot`, `makeup_hours`, `holiday_work`, `leave`, `willmakeup` (`src/engine/approval-view.ts`); đi làm ngày lễ mang mục `ot`, còn `holiday_work` là tên hàng chính sách "chưa duyệt thì bỏ cả ngày".
- Duyệt theo lô (`PUT /api/approvals/decide`). Lý do từ chối không bắt buộc; người duyệt tự duyệt khoản của chính mình thì chỉ ghi cảnh báo `SELF_DECISION_FORBIDDEN` và nhật ký.
- iSAT chỉ khai được vào thứ Bảy và chỉ chức vụ có quyền lợi iSAT, chặn cả ở Admin (`src/domain/isat-rule.ts`).
- Giới hạn giờ làm: chỉ hai trần, đều chặn 400: giờ ròng một ngày (giờ ca + OT + làm thêm + làm bù, không tính giờ nghỉ giữa ca) không quá `DAY_HOURS_CAP` (12), và tổng OT một tháng cộng giờ ca chính làm ngày lễ không quá `MONTH_OT_CAP` (40). Giới hạn iSAT `isat.monthlyLimit` mặc định `null` (không giới hạn) (`src/domain/overtime/hour-limits.ts`).
- Ngày lễ: Admin đặt danh sách (`PUT /api/holidays`); khai đi làm ngày lễ mà không có Check-in/out là vắng; làm bù vào ngày lễ bị chặn.
- Tạm ứng: nhân viên bấm xin (không nhập số); Admin duyệt theo tháng; chỉ khi đã duyệt mới trừ vào thực lĩnh.
- KPI: tự chấm, Admin chấm; năm thành phần (`kpi-score.ts`).
- Sổ phép: tích luỹ theo tháng, thâm niên, năm Nhân viên, sinh nhật; phép dư hết hạn cuối tháng `leave.expiry.month` của năm sau, đổi tiền ở phiếu tháng liền sau; sổ lưu sẵn tự làm mới theo chu kỳ (`GET /api/leave/ledger`, `POST /api/leave/refresh`).

### 5.3 Bộ máy tính lương (`src/engine/payroll-engine.ts`)

- Lương ngày = lương cơ bản của bậc ÷ công chuẩn của chức vụ; giờ thiếu (vào trễ, về sớm) trừ theo lương giờ.
- Phụ cấp ca: ca đêm theo phần trăm lương ngày; ca linh hoạt theo hệ số × lương giờ × số giờ. Giờ nghỉ trong khung đêm có lương quy đổi tiền (chức vụ có `benefit.breakPay`).
- OT ngày thường: ngày có lịch × `ot.rate`; thứ Bảy/Chủ nhật ngoài lịch của người × `ot.weekendRate`; ngày lễ × `ot.holidayRate` cộng phần đêm lễ (`night.otAddRate × ot.holidayRate`). OT ngày thường chỉ tính khi trước ngày đó không còn giờ phải bù (`ot.afterMakeup`) và đã được Admin duyệt.
- Giờ bù: × 1, trả đủ số giờ bù đã duyệt, không cắt theo giờ còn nợ. Ngày có giờ bù được trả mất phụ cấp ca và giờ nghỉ đêm; ngày OT vẫn giữ phụ cấp ca.
- Ngày lễ: tách theo ngày dân sự của từng phút (ca đêm sang ngày lễ chỉ phần phút rơi vào ngày lễ trả theo hệ số lễ); ngày lễ hưởng lương theo quyền lợi của chức vụ trong thời gian làm việc; đi làm ngày lễ tính một công.
- Ngày công: ngày đi làm và ngày lễ có đi làm thật; vắng không phép như nghỉ không lương.
- Chuyên cần (`finishMonth`): số ngày nghỉ xét chuyên cần = nghỉ phép + nghỉ không lương + nghỉ được duyệt (nếu `request.type.approved.countsAbsent`) − khoản miễn + vắng + số dòng iSAT + ngày "Nghỉ, sẽ làm bù" chưa bù (nhỏ nhất của số ngày đó và làm tròn lên của giờ nợ ÷ giờ mỗi công). Đạt hay mất theo `type.<mã>.maxAbsent` và giờ vượt ngưỡng (`attendance.overLimitHours` + `attendance.overLimitTolerance`, hoặc ghi đè của chức vụ) với phép so sánh là tham số. Phụ cấp đi lại tính theo ngày thực đi làm.
- Bảo hiểm theo ngày có lương (`baoHiemOf`): ngày có lương = ngày công + phép năm hưởng lương + nghỉ lễ hưởng lương + iSAT hưởng lương; ngày không lương = công chuẩn − ngày có lương; từ `tax.insurance.skipDays` ngày trở lên (phép so sánh `tax.insurance.skipCompare`, mặc định ≥ 14) thì tháng không đóng. Tính giữa tháng thì ngày có lương mới tới mốc đó, nên chưa đủ ngày thì chưa trừ.
- Miễn thuế (`mienThueOf`) chỉ phần trả cao hơn lương giờ thường: đêm = từng ngày nhỏ nhất của (giờ đêm ngoài ngày lễ × lương giờ × `tax.exempt.nightPremium`) và phụ cấp ca đã trả ngày đó; OT ngày thường, OT cuối tuần, giờ làm ngày lễ mỗi nhóm = nhỏ nhất của (tiền trả, mức luật của nhóm) − lương giờ × số giờ; cộng khoản Admin điền thêm/khối có cờ miễn thuế (toàn phần hoặc trần); tổng miễn thuế không vượt gross.
- Thuế TNCN theo hợp đồng (`taxFrom`, `src/engine/payroll-engine.ts`): luỹ tiến có giảm trừ bản thân và người phụ thuộc cho hợp đồng dài hạn; khấu trừ theo tỷ lệ `tax.casual.rate` trên tổng thu nhập từ ngưỡng `tax.casual.threshold` cho hợp đồng ngắn hạn; bảo hiểm bắt buộc người lao động và phần công ty; khoản điền thêm; khối phụ cấp do C&B thêm; quyết toán phép dư; tạm ứng = `advance.rate` × lương cơ bản của ngày đi làm (kể cả ngày lễ đi làm, không gồm OT ngày lễ) từ đầu tháng tới `advance.untilDay`.
- Thực lĩnh = gross − bảo hiểm − thuế − tạm ứng đã duyệt − khoản trừ điền thêm; các khoản tiền làm tròn đồng trước khi cộng trừ.

### 5.4 Kỳ lương và phiếu

- Vòng đời kỳ: `open` → `attendance_locked` → `calculated` → `reviewed` → `approved` → `paid`, mở lại về bước thấp hơn (kỳ đã `paid` mở lại được, kèm cảnh báo). Danh sách kiểm trước chốt/duyệt (`checklist`, `src/domain/period/periods.ts`).
- Tính lương tạo lần chạy và bản chụp nén cho từng người (`payslips.snapshot_gz`); duyệt kỳ biến lần chạy thành `final`. Kỳ lỗi thời được phát hiện khi dữ liệu nguồn đổi sau lần tính (`src/domain/period/period-stale.ts`).
- Admin sửa ô tiền hoặc ô số lượng trên phiếu (`slip_overrides`, `PUT /api/slip-override`) kèm lý do; số chi trả tính lúc đọc.
- Phiếu Admin: các dòng thu nhập, phụ cấp, khấu trừ, từng ngày với giờ Check-in/out thật ("HH:MM – HH:MM", thiếu một đầu thì `--:--`); phần Chi tiết có công thức dưới từng dòng (`src/domain/payroll/slip-formulas.ts`): chỉ Admin thấy, mỗi số có tên (đ, ngày, giờ, đ/giờ, đ/ngày, tên dòng), số hạng giống nhau được gộp, số hạng triệt tiêu được bỏ, phép trừ đặt trong ngoặc, công thức không ra đúng số của dòng thì không in. Phiếu nhân viên và bản in A4 không có công thức; mỗi ô tiền trên phiếu nhân viên là một số đã cộng sẵn, các ô cộng lại đúng Thành tiền.
- Nhân viên xem số ước tính của tháng đang chạy (`GET /api/me/estimate`) và chỉ xem phiếu chính thức sau khi kỳ đã chi trả (`PAYSLIP_NOT_VISIBLE` trước đó).
- Khoản điền thêm (`/api/pay-entries`): khi `system.entries.requireApproval` bật, người duyệt phải khác người lập (`SELF_DECISION_FORBIDDEN`), tắt thì khoản có hiệu lực ngay khi lập; khoản đã duyệt cộng vào tổng thu nhập, có cờ miễn thuế và bảo hiểm.

### 5.5 Giao diện (ứng dụng Vue, `web/`)

Giao diện duy nhất là ứng dụng Vue 3 ở `web/` (Admin: tổng quan, yêu cầu, chấm công & phép, KPI, bảng lương, cài đặt; nhân viên: bản điện thoại `/nv/*` và bản máy tính `/nv-may-tinh`; bản in phiếu `/in/phieu-luong/*`). Danh sách màn và route: `spec/reference/web-routes.md` (sinh từ `web/src/router`). Dữ liệu lấy qua `web/src/services/*` gọi `/api`; cập nhật trực tiếp qua SSE (`GET /api/events`).

### 5.7 Tham số, vận hành, sandbox

- Registry tham số và cách lưu theo tháng áp dụng, xem trước, hoàn tác (mục 2.1).
- Vận hành: sao lưu nhất quán, kiểm bản sao, diễn tập khôi phục, giám sát tuổi bản sao, `params_mode` (`scripts/ops/`); nhật ký truy cập JSON kèm `X-Request-Id`; bộ đo tải (`scripts/loadtest/`).
- Sandbox PostgreSQL tạm riêng với đồng hồ giả và đường điều khiển (mục 4.2).

---

## 6. Chưa làm / còn mở

Mỗi mục đã đối chiếu với mã; chỗ chưa xác nhận bằng chạy thật được ghi rõ.

### 6.1 Chấm công và giải trình

- **Check-out sớm chỉ hỏi xác nhận.** Hộp "Vẫn Check-out" / "Tiếp tục làm" không bắt nhập giải trình ngay lúc bấm. Chỉ Check-out muộn mới đòi giải trình cùng lần bấm (`CHECKOUT_NEEDS_EXPLANATION`, `src/domain/explanation/late-checkout-session.ts`).
- **Nhãn "Bị từ chối" trên màn chấm công của nhân viên.** Với giải trình quên chấm bị từ chối, màn nhân viên có thể hiện Chờ xử lý thay vì Bị từ chối; chưa xác nhận bằng chạy thật. Phần sửa nằm ở nhánh `wip/totals-rounding`, chưa vào mã này.
- **Giải trình trên ngày có đơn nghỉ bị từ chối.** Giải trình trên một ngày mà đơn nghỉ đã bị từ chối có thể không ghi lượt Admin; phần sửa cũng ở `wip/totals-rounding`.
- **OT khai ở Check-in/out không ra tiền.** `POST` và `PUT /api/ot` (`src/modules/attendance/attendance.controller.ts`, `src/modules/attendance/attendance.controller.ts`) chỉ lưu khai báo để theo dõi. Nguồn giờ làm thêm của bộ máy là Lịch ước tính (`attendance.extraSourceRule = calendar`, `src/engine/actual-hours.ts`); `otReview` của lượt bị bỏ khi dựng ngày tính tiền (`LOCKED_FIELDS`, `src/engine/actual-hours.ts`). Tiền OT chỉ ra từ OT khai trên Lịch ước tính đã được duyệt và chỉ phần có mặt liền ca (`src/domain/ot.ts`). OT chỉ được duyệt qua `POST/PUT /api/ot` không vào số ước tính.
- **`GET /api/alerts` trả 400.** Handler (`src/modules/approvals/approvals.controller.ts`) đòi tham số `month` đúng dạng `YYYY-MM`; thiếu hoặc sai dạng thì 400 với thông báo "month phải dạng YYYY-MM". Route cần năng lực `request.decide.*` (`src/platform/authz.ts`), vai trò `admin` và `cb` đều có. Nguyên nhân 400 khi quét sandbox với `qa_admin` và `qa_cb` được suy ra từ mã (lời gọi không kèm `month`, không phải do phân quyền); chưa xác nhận bằng chạy thật.

### 6.2 Hiển thị phần Chi tiết của phiếu Admin

- Một số tổng có thể lệch 1 đồng so với tổng các dòng đã in: tổng được làm tròn một lần trên số gốc, còn mỗi dòng làm tròn riêng; công thức chỉ được giữ khi lệch không quá 1 đồng mỗi bước làm tròn (`src/domain/payroll/slip-formulas.ts`, phần đầu file).
- Dòng đếm giờ thiếu chưa bù ("1 giờ thiếu + 1 giờ thiếu + …") chưa gộp số hạng giống nhau: nhánh `debtH` dùng `plus(...)` thay vì `netSum` (`src/domain/payroll/slip-formulas.ts`).
- Dòng có số lượng bằng 0 (ví dụ "× 0 ngày phép") vẫn có thể được in.
- Dòng công thức xuống hàng có thể tách số khỏi tên của nó, vì kiểu hiển thị cho phép ngắt ở bất kỳ ký tự nào (`overflow-wrap: anywhere`).

### 6.3 Điểm tính lương cần xác nhận

Mã làm như mô tả; chưa có xác nhận rằng đây là cách đúng.

| Điểm | Mã hiện làm |
| --- | --- |
| Miễn thuế phần đêm so với phụ cấp ca | Phần đêm miễn thuế dùng `tax.exempt.nightPremium` (30%) trong khi phụ cấp ca đêm trả theo bậc/chức vụ (NV chọn 40 hoặc 60); miễn thuế mỗi ngày bị chặn trên bằng phụ cấp ca đã trả của ngày đó (`src/engine/payroll-engine.ts`). |
| Giờ nghỉ nằm trong ngày lễ | Phần giờ nghỉ của ca chính rơi vào ngày lễ được trả như giờ làm ngày lễ (× `ot.holidayRate` = 3), không theo mức giờ nghỉ đêm (× 1,3); các phút đó không cộng thêm giờ nghỉ đêm (`src/engine/payroll-engine.ts`: `holWorkPay`, `breakH`). |
| `isat.monthlyLimit` rỗng | `null` nghĩa là không giới hạn; ngay cả khi đặt số, bộ máy vẫn trả các ngày iSAT đúng thứ và đúng quyền lợi vượt giới hạn nếu Admin duyệt, giới hạn chỉ gây cảnh báo/chặn lúc khai (`src/domain/overtime/hour-limits.ts`). |
| Ngày chuyển sang chính thức | Hồ sơ chỉ có trạng thái thử việc/chính thức (`contract_status`) để hiển thị, không có trường ngày chuyển và không đổi tiền (`src/domain/employee/profile.ts`). |
| Điều chỉnh phép âm | `leaveAdjust` nhận số âm trong ±365, bước 0,5 (`src/modules/staff/staff.controller.ts`); số dư phép âm không bị chặn, chỉ được AI gắn cờ `negative-leave`. |
| Ca đêm bắt đầu ở ngày lễ | Tính một ngày công ở ngày bắt đầu ca (`calcMonth`, `c.kind === 'holiday' && c.hours > 0`), phần phút trong ngày lễ trả hệ số lễ, phần còn lại tính thường. |
| Giờ bù trả đủ | Giờ bù đã duyệt trả đủ × lương giờ, không giới hạn theo giờ nợ; giờ bù nhiều hơn giờ cần bù được ghi nhận là "dư" (`makeupCredit`) nhưng vẫn được trả (`calcMonth`, `src/engine/payroll-engine.ts`). |

### 6.4 Quy trình lương

Các kiểm tra của quy trình lương (chốt công, tính, AI, duyệt, chi trả) chỉ cảnh báo, không chặn (`src/platform/warnings.ts`). Danh sách kiểm được làm mềm (`soften`, `src/domain/period/periods.ts`), kỳ duyệt được từ trạng thái `calculated` (bỏ qua bước AI kiểm tra, chỉ cảnh báo `AI_NOT_RUN`), phiếu chưa xong tự được duyệt theo kỳ và phiếu lỗi tự bị loại (`src/domain/period/periods.ts`), kỳ đã chi trả mở lại được kèm cảnh báo (`src/platform/db.ts`). Mọi tháng đều tính lương theo Check-in/out.

### 6.5 Bộ test tự động

Số liệu dưới đây là kết quả của một lần chạy `node --test` với bộ báo cáo tuỳ chỉnh từ gốc cây (gồm cả `test/tools` và `test/helpers`), chưa chạy lại để đối chiếu: **3.006 test, 2.786 đạt, 220 lỗi.** Lỗi phân theo thư mục: `test/api` 133, `test/unit` 77, `test/ops` 6, `test/tools` 3, `test/helpers` 1. Lỗi phân theo file (nhóm lớn nhất):

| Lỗi | File |
| --- | --- |
| 10 | `test/api/period-lifecycle.test.ts` |
| 9 | `test/api/period-reopen.test.ts`, `test/api/me-estimate.test.ts` |
| 8 | `test/unit/ca-kiem-bang-tien.test.ts` |
| 6 | `test/unit/schedule-defaults-zero-drift.test.ts`, `test/unit/schedule-actual-hours.test.ts`, `test/api/payslip-staff-paid-view.test.ts` |
| 5 | `test/unit/pay-tail-tax-options.test.ts`, `test/api/settings-engine-zero-drift.test.ts` |
| 4 | `test/unit/schedule-workdays-computed.test.ts`, `test/unit/tax-block-exempt-flags.test.ts`, `test/api/payslip-negative-net.test.ts`, `test/api/pay-entry.test.ts` |
| 3 trở xuống | Các file còn lại (kỳ lương, phiếu, khoản điền thêm, bảng vàng, AI rà soát...) |

Nhóm nguyên nhân thấy trong thông báo lỗi (số là số lỗi của lần chạy trên):

- 53 lỗi: bước duyệt phiếu bị từ chối với `PAYSLIP_FLAGGED` vì AI gắn cờ `net-nonpositive` trên dữ liệu của test (vòng đời kỳ, mở lại kỳ, thực lĩnh âm, tổng hợp kỳ).
- 6 lỗi: không tìm thấy file cần chép (`ENOENT`).
- Các test so sánh với bảng vàng hoặc bộ so lệch (`route-dispatch-golden`, `formula-golden`, `payroll-golden`, `payroll-engine-differential`, `file-size-budget`) báo khác biệt; trong đó `file-size-budget` báo `src/domain/period/periods.ts` còn 1.196 dòng nên phải rút khỏi danh sách ngoại lệ.
- Phần còn lại là lệch số tiền giữa kết quả của mã và số test chờ (thuế, bảo hiểm, ca đêm, chuyên cần).

### 6.6 Công việc đang nằm ở nhánh khác (không thuộc mã này)

| Nhánh | Nội dung |
| --- | --- |
| `reorg/class-model` | Sườn mô hình lớp mới (đối tượng nhân viên, ca, bảng lương...) chưa là đường chạy của ứng dụng. |
| `feat/web-vue-y-trang` | Viết lại các trang bằng Vue trong `web/`. |
| `wip/totals-rounding` | Tổng gồm các dòng nguyên đồng, nhãn "Bị từ chối" trên màn chấm công, giải trình sau đơn nghỉ bị từ chối; chưa kiểm. |

---

## 7. Danh mục spec

| File | Nội dung |
| --- | --- |
| `spec/overview.md` | File này: bối cảnh, kiến trúc, cấu trúc thư mục, cách chạy, phần đã làm và phần còn mở. |
| `spec/platform.md` | Nền tảng: luồng một yêu cầu, `HttpError`, cảnh báo, công tắc Agents, `ROUTE_CAPS`, bảng gửi route, container domain, giới hạn tải, SSE, nhật ký kiểm toán, lược đồ DB và migration, sao lưu/khôi phục, sandbox, AI rà soát, công cụ test. |
| `spec/people-access.md` | Nhân sự và phân quyền: bảng `staff`, vai trò và năng lực, đăng nhập, phiên, mật khẩu, hồ sơ, danh mục chức vụ/bậc/ca, cờ quyền lợi. |
| `spec/attendance.md` | Chấm công: Check-in/out, lượt, Lịch ước tính (khai, kiểm, Admin khai thay), làm bù, OT, giải trình Check-out muộn, nhãn trạng thái, đếm ngày công. |
| `spec/requests.md` | Yêu cầu và duyệt: khoản tự khai chờ duyệt, ngày lễ, phép năm, tạm ứng, OT, làm bù, giải trình, KPI, chặn của AI, quyền duyệt, khoá kỳ theo việc. |
| `spec/payroll-engine.md` | Bộ máy tính lương: tham số, một ngày, một tháng, bảy công thức tháng, thực lĩnh, thuế, bảo hiểm, miễn thuế, ghim, tạm ứng, phép năm. |
| `spec/payroll-period.md` | Kỳ lương và phiếu: vòng đời kỳ, lần chạy, bản chụp, số sửa và số chi trả, danh sách kiểm, ước tính, khoản điền thêm, công thức Chi tiết. |
