# Thiết kế G2–G4: lớp dữ liệu bất đồng bộ, PostgreSQL, NestJS + TypeScript

Ngày: 2026-10-31. Trạng thái: **đã duyệt qua ủy quyền toàn quyền** (xem `PROGRAM.md`). Viết từ mã hiện tại, không từ trí nhớ.

## 1. Hiện trạng đo được

| Số đo | Giá trị | Nguồn |
|---|---|---|
| Kho dữ liệu | `lib/db.ts` 2182 dòng, một object `store` + các nhóm con (`approvals`, `periods`, `payroll`, `roles`, `params`, `aiFindings`, `aiReviews`, `audit`) | `lib/db.ts` |
| Truy cập | `node:sqlite` `DatabaseSync` ĐỒNG BỘ | `lib/db.ts:2` |
| File gọi `store.` | 60 (lib + server.js) | `grep` |
| Hàm `store` khác nhau được gọi | ~70 (nhiều nhất: `transaction` 49, `getStaff` 43, `getSetting` 35, `periods.get` 17, `listSessions` 17, `getSheet` 15) | `grep` |
| `.prepare(` ngoài db.js | `advance-requests`, `approvals`, `attendance-sessions`, `ai-review`, `admin-presence`, `schema.js` của các module, `pay-entries`, `payroll-service`, `params/save`, `ops/shared-cache`, `server.js` | `grep` |
| `server.js` | 2485 dòng, 152 điểm `warnIf`/`throw HttpError` | `wc`, `grep` |
| File test đụng DB | 86 | `grep` |

Hệ quả cho các quyết định sau:

1. Driver PostgreSQL (`pg`, PGlite) đều **bất đồng bộ**. Không có đường nào giữ nguyên mã đồng bộ. Mọi hàm chạm DB, và mọi hàm gọi chúng, phải `async`.
2. Phần "luật nghiệp vụ" còn lẫn thật sự nằm ở `server.js` (route inline, `cleanDays`) và `lib/*.js` (không phải `lib/domain`): `roles.js`, `pay-entries.js`, `approvals.js`, `periods.js`. `lib/domain` còn lại chỉ là các module điều phối nhỏ (50–190 dòng). Vì vậy **G1 lát 5–6 gộp vào G4**: mỗi module Nest tự kéo luật + route + repository của nó ra khỏi `server.js`/`lib/*.js`; làm hai lần (class CommonJS rồi class TS) là phí.

## 2. Nguyên tắc

- **Repository là điểm truy cập DB duy nhất.** Mã nghiệp vụ không viết SQL, không gọi `store.db`. Mỗi repository một tập hợp (aggregate): `StaffRepository`, `SheetRepository`, `AttendanceRepository`, `ApprovalRepository`, `PeriodRepository`, `PayrollRepository`, `RoleRepository`, `ParamsRepository`, `SettingsRepository`, `AuditRepository`, `FindingsRepository`, … — hàm cùng mục đích nằm cùng class.
- **Giao diện repository không đổi khi đổi DB.** SQLite → PostgreSQL chỉ đổi phần cài đặt (một class mỗi aggregate), không đổi người gọi.
- **Giao dịch bằng `UnitOfWork`** (AsyncLocalStorage): `await uow.run(async () => { ... })`; repository tự lấy kết nối/giao dịch hiện hành từ ngữ cảnh. Không truyền `trx` qua tham số. Thay cho `store.transaction(fn)` (49 chỗ).
- **Một nguồn số, một nguồn schema.** Schema nằm trong migration có đánh số; kiểu TS của bảng sinh/cập nhật cùng migration (Kysely `Database` interface).
- **Hành vi tính lương giữ bit-for-bit.** Mọi bước đều chạy lại toàn bộ `npm test`; bước chuyển PostgreSQL thêm đối chiếu số liệu lương trên cùng dữ liệu thử.

## 3. Lộ trình

### G2 — Repository bất đồng bộ trên SQLite (chưa đổi DB, chưa đổi framework)

1. `lib/data/` mới: `UnitOfWork`, `Database` (cổng mở kết nối, hiện là SQLite), các `*Repository` bọc code cũ của `lib/db.ts` theo từng aggregate; mọi phương thức **trả Promise**.
2. Chuyển người gọi từng aggregate một: `await` ở mọi chỗ gọi, các hàm gọi chúng thành `async`, tới tận handler. `lib/db.ts` thu nhỏ dần rồi chỉ còn là nơi dựng `Database`.
3. Test: mỗi test thêm `await`; helper dùng chung (`api-fixture`, `period-flow`…) làm trước để 86 file đổi ít nhất.
4. Điều kiện xong: không còn `.prepare(`/`store.db` ngoài `lib/data/**`; `npm test` xanh; test kiến trúc kiểm điều đó.

### G3 — PostgreSQL

1. Thêm `kysely` + `pg`. Cổng `Database` có hai cài đặt: SQLite (giữ để so sánh) và PostgreSQL.
2. Migration có đánh số `migrations/NNNN_*.ts` dựng schema 19 bảng (kiểu `INTEGER`→`bigint/int`, `TEXT`→`text`/`jsonb`, `CHECK` giữ nguyên, trigger `payslips_frozen_update` viết lại bằng PL/pgSQL).
3. Test chạy trên PostgreSQL thật mà không cần cài máy chủ: PGlite (PostgreSQL biên dịch WASM, chạy trong tiến trình). Chạy cùng bộ test trên cả hai cài đặt.
4. Script `scripts/migrate-sqlite-to-pg` chuyển dữ liệu + **đối chiếu**: số dòng từng bảng, tổng tiền từng kỳ, phiếu lương từng người. Chỉ chạy trên dữ liệu thử/seed. DB lương thật cần người dùng xác nhận (giới hạn của ủy quyền).

### G4 — NestJS + TypeScript

1. Dựng khung Nest (adapter Fastify nếu đo được lợi, mặc định Express), `tsconfig`, build, `node --test` chạy trên TS qua `tsx`/`ts-node` hoặc build trước.
2. Chuyển **từng module theo lát dọc** (route + service + rule + repository + test), theo thứ tự rủi ro thấp → cao: `geofence`, `holidays`, `shifts`, `positions`, `staff`, `roles`, `attendance`, `sheet`/`timesheet`, `approvals`, `advance`, `payroll`/`periods`, `ai`. Sau mỗi module: route cũ trong `server.js` bị xoá, test xanh.
3. Test kiến trúc (`dependency-cruiser` hoặc kiểm tay bằng AST): module chỉ import `index` (cổng công khai) của module khác; controller không import repository; không import ruột `rules/*` từ ngoài module.
4. Điều kiện xong: `server.js` chỉ còn khởi tạo; mọi route chạy trên Nest; facade (`limits.js`, `work-hours.js`, `kpi.js`, `geofence.js`, `sheet-checks.js`) bị xoá.

## 4. Rủi ro đã biết

- **Lan truyền async**: một hàm đồng bộ gọi store đổi thành async kéo theo toàn bộ chuỗi gọi. Giảm rủi ro bằng cách đi từng aggregate và chạy test sau mỗi aggregate; callback đồng bộ (`warnings.scope(fn)`) cần phiên bản async (`scope` đã dùng AsyncLocalStorage nên `await` bên trong được).
- **`store.transaction` đồng bộ** có ngữ nghĩa "tất cả hoặc không" mà code hiện dựa vào (vd. `sheet-bulk.save`). `UnitOfWork` phải giữ đúng ngữ nghĩa, kể cả lồng nhau (savepoint).
- **Thời gian chạy test** (≈7 phút) tăng khi thêm PGlite; chấp nhận, chạy nền.
- **Ngôn ngữ**: test hiện là JS CommonJS. Giữ test JS trong lúc chuyển; thêm test TS sau.
