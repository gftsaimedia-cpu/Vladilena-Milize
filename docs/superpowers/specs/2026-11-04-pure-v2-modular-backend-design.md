# Thiết kế kiến trúc Backend thuần V2 theo mô hình Modular Monolith

- **Tác giả:** Antigravity & User
- **Ngày lập:** 2026-11-04
- **Trạng thái:** Đã qua rà soát kỹ thuật (Reviewed & Updated)
- **Tài liệu tham chiếu:** [AUDIT-2026-11-02.md](../AUDIT-2026-11-02.md), [PROGRAM.md](../PROGRAM.md), [AUDIT-2026-11-CONCURRENCY-TECHDEBT.md](../../audits/AUDIT-2026-11-CONCURRENCY-TECHDEBT.md)

---

## 1. Bối cảnh & Mục tiêu (Intent and The Why)

### 1.1. Hiện trạng
Sau nhiều đợt di trú từ SQLite/CommonJS sang PostgreSQL/NestJS/TypeScript, mã nguồn backend của dự án `Vladilena-Milize` đang rơi vào tình trạng lai tạp nghiêm trọng:
- Tồn tại song song giữa các module V1 cũ (`StaffModule`, `ApprovalsModule`, `UiBridgeModule`) và các module V2 mới (`EmployeeV2Module`, `RequestV2Module`, `AttendanceV2Module`, `PayrollV2Module`).
- Thư mục dự án bị xé nhỏ thành quá nhiều tầng phân tán (`src/modules`, `src/domain`, `src/data`, `src/engine`, `src/params`, `src/platform`, `src/ops`, `src/shared`, `src/core`, `src/http`) khiến người phát triển và bảo trì không thể nắm bắt được chức năng của từng thư mục.
- Các module cũ vẫn phụ thuộc vào tầng dữ liệu cũ ([src/platform/db.ts](file:///C:/Users/52.AI%20UD/Project/Vladilena-Milize/src/platform/db.ts)), nơi liên tục gửi các câu truy vấn SQL tìm những bảng SQLite cũ đã bị xóa khỏi PostgreSQL (`timesheets`, `sheet_approvals`, `attendance_sessions`). Điều này làm hỏng giao dịch PostgreSQL (`transaction is aborted`) và gây ra các lỗi crash 500 runtime.

### 1.2. Mục tiêu (Goals)
1. **Tinh gọn triệt để kiến trúc Backend:** Gom toàn bộ logic về 6 Feature Modules tự chứa (Self-contained) theo chuẩn Modular Monolith của NestJS: `employees`, `requests`, `attendance`, `payroll`, `auth-roles`, `system` và `database`.
2. **Loại bỏ 100% rác V1:** Di chuyển toàn bộ các module V1, các tầng domain phân tán cũ, các bộ tính toán cũ (`src/engine/`, `src/params/`, `src/platform/`) vào thư mục cách ly `legacy_archive/` (được `.gitignore`) để triệt tiêu hoàn toàn mã cũ và các truy vấn gây crash.
3. **Chuẩn hóa API V2:** Tất cả các endpoint nghiệp vụ được phục vụ nhất quán qua tiền tố `/api/v2/*` theo chuẩn RESTful.
4. **Cô lập phạm vi:** Chỉ tập trung tái cấu trúc Backend; xuất tài liệu hợp đồng API chi tiết ([docs/api/v2-contract.md](file:///C:/Users/52.AI%20UD/Project/Vladilena-Milize/docs/api/v2-contract.md)) để Agent phụ trách Frontend có căn cứ kết nối trực tiếp.

### 1.3. Điều không thuộc mục tiêu (Non-goals)
- Không can thiệp hay sửa đổi mã nguồn Frontend Vue ([web/](file:///C:/Users/52.AI%20UD/Project/Vladilena-Milize/web)) — phần này do một Agent riêng biệt phụ trách.
- Không thay đổi công thức tính lương hay các quy tắc nghiệp vụ cốt lõi đã được kiểm chứng của Payroll V2 và Attendance V2.
- Không tác động hay xóa dữ liệu trong cơ sở dữ liệu PostgreSQL thực tế.

### 1.4. Mục tiêu chống tiêu cực (Anti-goals)
- Không tạo thêm bất kỳ tầng "cầu nối" (bridge/shim/facade) trung gian tạm bợ nào.
- Không để sót lại bất kỳ câu truy vấn nào gọi vào các bảng vật lý không tồn tại (`timesheets`, `sheet_approvals`, `attendance_sessions`, `punches`, `punch_requests`, `corrections`).
- Không duy trì mã chết, mã tự sinh tham số thừa thãi.

---

## 2. Các hướng tiếp cận & Quyết định lựa chọn (Approaches)

### Hướng 1: Modular Monolith chuẩn NestJS V2 (Được người dùng phê duyệt)
- **Cấu trúc:** Mỗi tính năng là một module độc lập tự chứa (Controller, Service, Domain Models, Repository Kysely đều nằm chung trong module đó).
- **Gom nhóm các nghiệp vụ vệ tinh vào 4 module chính:**
  - `positions` (chức vụ) & `catalog` (ca làm việc) → tích hợp vào module **`employees`**.
  - `leave` (phép) & `advance` (tạm ứng) → tích hợp vào module **`requests`**.
  - `kpi`, `pay-entries`, `blocks` → tích hợp vào module **`payroll`**.
  - `audit`, `settings`, `periods` → tích hợp vào module **`system`**.
- **Xử lý mã cũ & test cũ:** Chuyển toàn bộ các thư mục rườm rà (`src/domain/`, `src/engine/`, `src/params/`, `src/platform/`, `src/ops/`, `src/data/`, `src/core/`, các module `staff`, `approvals`, `ui-bridge`) và các test cũ vào `legacy_archive/`.
- **Đánh giá:** Triệt tiêu hoàn toàn sự lai tạp, cấu trúc cực kỳ trong sáng và dễ bảo trì.

### Hướng 2: Giữ mô hình Layered phân tầng và chỉ xóa folder V1 (Bị loại bỏ)
- **Cấu trúc:** Vẫn giữ nguyên các tầng `src/modules/`, `src/domain/`, `src/data/`, chỉ xóa các thư mục con V1.
- **Đánh giá:** Bị loại vì dự án vẫn bị chia cắt thành quá nhiều tầng phân tán, không giải quyết được vấn đề người dùng phàn nàn: "quá nhiều folder tới mức không rõ folder đó làm cái gì".

---

## 3. Kiến trúc chi tiết của Backend thuần V2

### 3.1. Sơ đồ cấu trúc thư mục mới (`src/`)

```text
src/
├── main.ts                     # Điểm vào khởi động NestJS application
├── app.module.ts               # Root module đăng ký các feature modules
├── app.init.ts                 # Bootstrap & lifecycle hooks
├── env.ts                      # Đọc biến môi trường
├── database/                   # Tầng kết nối dữ liệu duy nhất
│   ├── database.module.ts      # Nest module cung cấp Database connection
│   ├── kysely.ts               # Kysely instance & dialect
│   ├── transaction.ts          # Transaction coordinator & advisory locks
│   └── schema.generated.ts     # Kiểu các bảng PostgreSQL hiện hành
├── modules/
│   ├── auth/                   # Đăng nhập, cookie session, bảo mật
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   └── auth.module.ts
│   ├── roles/                  # Phân quyền chuẩn NestJS (admin, manager, hr, staff)
│   │   ├── roles.guard.ts
│   │   └── roles.decorator.ts
│   ├── system/                 # Cài đặt hệ thống, nhật ký kiểm toán, quản lý kỳ lương
│   │   ├── system.controller.ts
│   │   ├── system.service.ts
│   │   └── system.module.ts
│   ├── employees/              # [V2] Nhân sự, Hồ sơ, Chức vụ, Ca làm việc
│   │   ├── employees.controller.ts  # Route: /api/v2/employees
│   │   ├── employees.service.ts
│   │   ├── employee.entity.ts
│   │   ├── employees.repository.ts
│   │   └── employees.module.ts
│   ├── requests/               # [V2] Đơn từ, Nghỉ phép, Đổi ca, Làm thêm, Giải trình
│   │   ├── requests.controller.ts   # Route: /api/v2/requests
│   │   ├── requests.service.ts
│   │   ├── request.entity.ts
│   │   ├── requests.repository.ts
│   │   └── requests.module.ts
│   ├── attendance/             # [V2] Chấm công & Ingestion
│   │   ├── attendance.controller.ts # Route: /api/v2/attendance
│   │   ├── attendance.service.ts
│   │   ├── timesheet-entry.entity.ts
│   │   ├── attendance.repository.ts
│   │   └── attendance.module.ts
│   └── payroll/                # [V2] Tính lương, Bảng lương, KPI & Phiếu lương
│       ├── payroll.controller.ts    # Route: /api/v2/payroll
│       ├── payroll.service.ts
│       ├── payslip.entity.ts
│       ├── payroll.repository.ts
│       └── payroll.module.ts
└── common/                     # Tiện ích chung duy nhất
    ├── guards/                 # AuthGuard, RolesGuard
    ├── interceptors/           # Response & Logging interceptor
    └── filters/                # Global HttpExceptionFilter
```

### 3.2. Danh mục chuyển dọn vào `legacy_archive/`
Toàn bộ các thư mục và tệp sau đây sẽ được di chuyển vào `legacy_archive/`:
1. `src/modules/staff/` (đã thay thế bởi `modules/employees/`)
2. `src/modules/approvals/` (đã thay thế bởi `modules/requests/`)
3. `src/modules/ui-bridge/` (bãi bỏ hoàn toàn)
4. `src/domain/` (toàn bộ 15 thư mục con phân tán: logic được tích hợp vào Entity/Service của từng module tương ứng)
5. `src/platform/` (loại bỏ `db.ts`, `attendance-sessions.ts`, `legacy-estimate.ts`, v.v.)
6. `src/engine/` (mã tính toán cũ dạng script/UMD)
7. `src/params/` (hệ thống tham số phức tạp cũ)
8. `src/ops/` (các script cache và phụ trợ cũ)
9. `src/data/` (các repository V1 cũ và `legacy-schema.ts`)
10. `src/core/` (các token DI rườm rà cũ)
11. `test/` (toàn bộ test suite V1 phụ thuộc vào các module cũ)

### 3.3. Đặc tả Hợp đồng API V2 cốt lõi (cho Agent Frontend)

| Phương thức | Đường dẫn API | Mô tả nghiệp vụ | Module chịu trách nhiệm |
|---|---|---|---|
| `GET` | `/api/v2/employees` | Lấy danh sách nhân sự (lọc ca, chức vụ, trạng thái) | `employees` |
| `GET` | `/api/v2/employees/:id` | Lấy chi tiết hồ sơ một nhân viên | `employees` |
| `POST` | `/api/v2/employees` | Thêm nhân sự mới (họ tên, ca, chức vụ, bậc, hợp đồng) | `employees` |
| `PUT` | `/api/v2/employees/:id` | Cập nhật hồ sơ, đổi chức vụ, đổi ca làm việc | `employees` |
| `DELETE`| `/api/v2/employees/:id` | Ngưng hoạt động (deactivate) nhân sự | `employees` |
| `GET` | `/api/v2/requests` | Danh sách đơn từ (Nghỉ phép, Làm thêm, Đổi ca, Giải trình) | `requests` |
| `POST` | `/api/v2/requests` | Nộp đơn yêu cầu mới (kiểm tra trần OT, trùng lặp đơn) | `requests` |
| `PUT` | `/api/v2/requests/:id/review`| Duyệt (`APPROVE`) hoặc Từ chối (`REJECT`) đơn | `requests` |
| `POST` | `/api/v2/attendance/punch` | Check-in / Check-out chấm công | `attendance` |
| `GET` | `/api/v2/attendance/timesheets`| Lấy bảng chấm công theo ngày (`timesheet_entries`) | `attendance` |
| `POST`| `/api/v2/attendance/recalculate`| Tính toán lại ngày công khi có giải trình được duyệt | `attendance` |
| `POST`| `/api/v2/payroll/:month/calculate` | Chạy tính lương chu kỳ cho toàn bộ nhân sự | `payroll` |
| `GET` | `/api/v2/payroll/:month` | Lấy danh sách phiếu lương tháng | `payroll` |
| `GET` | `/api/v2/payroll/:month/:employeeId` | Chi tiết phiếu lương nhân viên (A4/In) | `payroll` |

---

## 4. Xử lý Tranh chấp & Khóa dữ liệu (Concurrency & Advisory Locks)

Dựa trên phát hiện kỹ thuật:
- **Lỗi cũ:** `src/data/locks.ts` thực thi `pg_advisory_xact_lock` trên root query builder thay vì client giao dịch đang hoạt động, khiến khóa phân tán tự động commit và nhả ra ngay trước khi khối lệnh thực thi.
- **Giải pháp trong `src/database/transaction.ts`:**
  - `TransactionCoordinator` sẽ chạy trong phạm vi `Kysely.transaction()`.
  - Mọi thao tác lấy khóa `pg_advisory_xact_lock(key)` phải được gọi trực tiếp trên instance giao dịch (`trx`), đảm bảo khóa được giữ chặt chẽ trong suốt thời gian thực thi cho tới khi giao dịch `COMMIT` hoặc `ROLLBACK`.

---

## 5. Những quyết định kỹ thuật đã giải quyết (Builder Resolutions)

1. **Về 10 module vệ tinh:** Gom toàn bộ logic vào 4 module chính (`positions`/`catalog` vào `employees`; `leave`/`advance` vào `requests`; `kpi`/`pay-entries`/`blocks` vào `payroll`; `audit`/`settings`/`periods` vào `system`).
2. **Về tương thích Frontend:** Hard cutover sang `/api/v2/*`, xuất tài liệu `docs/api/v2-contract.md` cho Frontend Agent. Không tạo dual-routing hay facade trung gian.
3. **Về bộ test cũ:** Chuyển toàn bộ 3,000 test cũ phụ thuộc vào V1 vào `legacy_archive/test/`. Thiết lập bộ test V2 tinh gọn, trực diện cho các service và controller mới.
4. **Kiểm tra hoàn thành:** `npm run typecheck` đạt 0 lỗi, container Docker khởi động thành công và toàn bộ API V2 phản hồi đúng đặc tả hợp đồng.
