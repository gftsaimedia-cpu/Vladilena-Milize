# Báo Cáo Kiểm Toán Kiến Trúc Hệ Thống: V2 Aggregates, Nợ Kỹ Thuật Chuyển Đổi V1, Rủi Ro Đồng Thời & Luồng Thực Thi Nền

**Mã tài liệu:** AUDIT-2026-11-CONCURRENCY-TECHDEBT  
**Ngày kiểm toán:** 2026-11-04  
**Chế độ kiểm toán:** DEMO (Chỉ đọc mã nguồn thực tế, xác minh thuần logic mã, không dựa vào ghi chú giải thích, không chạy/đọc mã kiểm thử)  
**Phạm vi:** Toàn bộ backend (`src/`), lược đồ cơ sở dữ liệu (`migrations/postgres/`), giao diện kết nối (`web/src/services/`), các tiến trình chạy nền và mô hình đồng thời.

---

## 1. Tóm Tắt Điều Hành & Phán Quyết Kiến Trúc (Executive Summary & Architecture Verdict)

Kiểm toán kỹ thuật chuyên sâu đối với mã nguồn backend Vladilena-Milize phát hiện một trạng thái phân mảnh kiến trúc nghiêm trọng (Architectural Schism). Hệ thống hiện tồn tại ở trạng thái "lưỡng thể" (hybrid state) không hoàn chỉnh giữa hai thế hệ kiến trúc:

1. **Kiến trúc V1 (Legacy)**: Vẫn giữ vai trò điều phối vòng đời nghiệp vụ chính của doanh nghiệp (tính lương hàng tháng tại `POST /api/periods/:month/calculate`, duyệt kỳ lương, quản lý sổ phép, chấm công truyền thống). Tuy nhiên, nền tảng lưu trữ vật lý của V1 trong PostgreSQL (`attendance_days`, `attendance_sessions`, `punches`, `timesheets`, `sheet_approvals`, `advance_approval_months`, `advance_approval_entries`, `leave_ledger`) đã bị **DROP** hoàn toàn trong bản di chuyển `0001_baseline.sql`. Để mã V1 tiếp tục biên dịch, hệ thống sử dụng một kiểu mở rộng `LegacySchema` gán các bảng đã mất thành `any`. Khi chạy thực tế, các truy vấn đọc nuốt lỗi ngoại lệ trả về rỗng, khiến **chu kỳ tính lương chính thức của công ty chạy trên dữ liệu trống và sinh ra các phiếu lương có 0 ngày công, 0 giờ làm, 0 giờ làm thêm**. Trong khi đó, các lệnh ghi vào bảng V1 cũ lập tức gây lỗi 500 do bảng vật lý không tồn tại.
2. **Kiến trúc V2 (Next-Gen Aggregates)**: Bao gồm `PayrollV2`, `AttendanceV2`, `EmployeeV2`, và `RequestV2`. Dù đã chuyển sang mô hình Aggregate đối tượng và lưu trữ trên 4 bảng mới (`system_requests`, `work_schedules`, `punch_events`, `timesheet_entries`), kiến trúc V2 bị cô lập hoàn toàn:
   - `PayrollV2Controller` bị chặn 100% ở tầng cổng truy cập (`ApiGate`) với lỗi HTTP 403 `NO_ROUTE_POLICY` do thiếu cấu hình ủy quyền trong `authz.ts`.
   - `PayrollV2Service` hoàn toàn **không lưu trữ kết quả vào cơ sở dữ liệu** (chạy thuần túy trong bộ nhớ và trả về phản hồi HTTP tạm thời).
   - Frontend Vue không có bất kỳ lời gọi API nào tới `/api/v2/*`.
   - Tầng tương thích `UiBridgeController` sử dụng các hàm giả lập (stub) trả về `{ ok: true }` mà không ghi xuống database đối với các thao tác cập nhật bảng công và phân ca hàng loạt.
3. **Thất bại trong kiểm soát tương tranh & khoá phân tán**:
   - Cơ chế khoá tư vấn PostgreSQL (`AdvisoryLocks`) sử dụng `pg_advisory_xact_lock` qua Kysely pool driver, bị tự động COMMIT và giải phóng ngay tức thì khi gọi ngoài `store.transaction()`.
   - Toàn bộ các Aggregate V2 hoàn toàn thiếu vắng các khối bao bọc giao dịch (`transaction`) và khoá bi quan/lạc quan, dẫn tới các cuộc đua tương tranh (race conditions) phá hủy tính toàn vẹn: đơn nghỉ phép trùng lặp lọt qua kiểm tra, vượt trần 40h làm thêm mỗi tháng, chấm công đồng thời ghi đè làm mở khoá kỳ lương đã chốt (`is_locked = false`), và xung đột khoá chính `audit_log` làm rollback giao dịch nghiệp vụ của người dùng.
4. **Rủi ro cạn kiệt tài nguyên & treo máy chủ**:
   - Hồ bơi kết nối cơ sở dữ liệu (`pg.Pool`) bị giới hạn cứng ở mức 10 kết nối mà không cấu hình thời gian chờ (`timeout`).
   - Tiến trình nén dữ liệu đồng bộ `zlib.gzipSync` chạy bên trong vòng lặp giao dịch tính lương nhân sự, phong tỏa luồng điều phối đơn (event loop) của Node.js.
   - Nhịp tim SSE (`heartbeat`) định kỳ 25 giây kích hoạt bão truy vấn kiểm tra phiên (`checkSession`) cho từng kết nối đồng thời, cạnh tranh trực tiếp và làm kiệt quệ hồ bơi kết nối.

**Phán quyết kiến trúc**: Hệ thống Vladilena-Milize hiện ở trạng thái **không an toàn cho môi trường sản xuất (Unfit for Production)**. Nguy cơ tính sai lương diện rộng, mất mát dữ liệu do xung đột tương tranh và từ chối dịch vụ (DoS) do nghẽn tài nguyên là chắc chắn xảy ra nếu triển khai cho người dùng thực tế mà không qua tái cấu trúc toàn diện.

---

## 2. Các Aggregate Backend V2 & Nợ Kỹ Thuật Tái Sử Dụng Mã V1 (Backend V2 Aggregates & Legacy V1 Reuse / Transition Debt)

### 2.1 Bảng Kiểm Kê Toàn Bộ Endpoint và Aggregate V2

| Aggregate / Controller | Tuyến đường (Endpoint) | Phương thức | Lớp triển khai | Trạng thái kỹ thuật & Khả năng truy cập |
|---|---|---|---|---|
| **Payroll V2** | `/api/v2/payroll/:month/calculate` | POST | `PayrollV2Controller.calculateMonthlyPayroll` | **Bị chặn 403 `NO_ROUTE_POLICY`**; không lưu DB; lỗi ngày 31 cho 5 tháng; gộp vô hạn yêu cầu cũ. |
| | `/api/v2/payroll/:month/summary` | GET | `PayrollV2Controller.getMonthlySummary` | **Bị chặn 403 `NO_ROUTE_POLICY`**; tính toán trong bộ nhớ. |
| | `/api/v2/payroll/:month/employees/:employeeId` | GET | `PayrollV2Controller.getEmployeePayslip` | **Bị chặn 403 `NO_ROUTE_POLICY`**; chỉ đọc trong bộ nhớ. |
| **Attendance V2** | `/api/v2/attendance/punches` | POST | `AttendanceV2Controller.recordPunch` | Thiếu transaction; đua ghi `timesheet_entries`; ghi đè `is_locked`. |
| | `/api/v2/attendance/punches` | GET | `AttendanceV2Controller.getPunches` | Đọc từ `punch_events`. |
| | `/api/v2/attendance/timesheets` | GET | `AttendanceV2Controller.getTimesheets` | Đọc từ `timesheet_entries`; lỗi ngày `${month}-31`. |
| | `/api/v2/attendance/timesheets/:employeeId/:workDate` | GET | `AttendanceV2Controller.getTimesheet` | Đọc bảng công ngày. |
| **Employee V2** | `/api/v2/employees` | GET | `EmployeeV2Controller.listEmployees` | Đọc từ `staff`. |
| | `/api/v2/employees/:username` | GET | `EmployeeV2Controller.getEmployee` | Đọc theo username hoặc UUID. |
| | `/api/v2/employees` | POST | `EmployeeV2Controller.createEmployee` | Ghi đè UUID nếu trùng username; phá vỡ ràng buộc khóa ngoại. |
| | `/api/v2/employees/:username` | PUT | `EmployeeV2Controller.updateEmployee` | Cập nhật hồ sơ nhân sự. |
| | `/api/v2/employees/:username` | DELETE | `EmployeeV2Controller.deleteEmployee` | **Gây lỗi 500 Runtime Crash** (`this.service.delete` không tồn tại); vi phạm khóa ngoại. |
| | `/api/v2/employees/:username/profile` | PATCH | `EmployeeV2Controller.patchProfile` | Cập nhật thông tin cá nhân. |
| | `/api/v2/employees/:username/account` | PATCH | `EmployeeV2Controller.patchAccount` | Cập nhật mật khẩu / tài khoản. |
| | `/api/v2/employees/:username/contract` | PATCH | `EmployeeV2Controller.patchContract` | Cập nhật hợp đồng lao động. |
| | `/api/v2/employees/:username/position` | PATCH | `EmployeeV2Controller.patchPosition` | Cập nhật chức vụ, bậc lương. |
| | `/api/v2/employees/:username/shift` | PATCH | `EmployeeV2Controller.patchShift` | Cập nhật thông số ca. |
| | `/api/v2/employees/:username/leave` | PATCH | `EmployeeV2Controller.patchLeave` | Cập nhật phép năm. |
| **Request V2** | `/api/v2/requests` | GET | `RequestV2Controller.listRequests` | Đọc từ `system_requests`. |
| | `/api/v2/requests/:id` | GET | `RequestV2Controller.getRequest` | Đọc chi tiết đơn. |
| | `/api/v2/requests/leave` | POST | `RequestV2Controller.createLeave` | Hổng bảo mật mạo danh `employeeId`; TOCTOU đua trùng đơn. |
| | `/api/v2/requests/correction` | POST | `RequestV2Controller.createCorrection` | Tạo yêu cầu sửa công. |
| | `/api/v2/requests/overtime` | POST | `RequestV2Controller.createOvertime` | Đua vượt trần 40h OT tháng do thiếu khóa. |
| | `/api/v2/requests/advance` | POST | `RequestV2Controller.createAdvance` | Tạo yêu cầu tạm ứng lương. |
| | `/api/v2/requests/:id/review` | PATCH | `RequestV2Controller.reviewRequest` | Mạo danh `reviewerId`; cập nhật lịch không có transaction; đảo trạng thái. |
| | `/api/v2/requests/:id/cancel` | PATCH | `RequestV2Controller.cancelRequest` | Hủy đơn yêu cầu. |
| **UI-Bridge** | `/api/sheet` | GET | `UiBridgeController.getSheet` | Chuyển đổi `timesheet_entries` thành định dạng V1; lỗi ngày 31. |
| | `/api/sheet/bulk` | PUT | `UiBridgeController.putSheetBulk` | **Stub giả mạo (Fake Stub)**: trả về `{ ok: true }` không ghi database. |
| | `/api/staff/shift-bulk` | PUT | `UiBridgeController.putStaffShiftBulk` | **Stub giả mạo (Fake Stub)**: trả về `{ ok: true }` không ghi database. |
| | `/api/today` | GET | `UiBridgeController.getToday` | **Dữ liệu giả lập cứng**: trả về toàn bộ `checked-out`, `in: null`, `out: null`. |
| | `/api/punch` | POST | `UiBridgeController.postPunch` | Chuyển tiếp tới `AttendanceV2Service.recordPunch`. |
| | `/api/ot` | PUT | *(Không tồn tại)* | **Thiếu route (404 Not Found)**; frontend gọi nhưng backend không có. |
| | `/api/explanations/:id/decide` | POST | *(Không tồn tại)* | **Thiếu route (404 Not Found)**; frontend gọi nhưng backend không có. |

---

### 2.2 Chi Tiết Vết Rạn Hai Lược Đồ (Dual-Schema Schism) & 12 Bảng Bị Xóa

#### 1. Định nghĩa kiểu giả lập cho các bảng đã bị DROP
- **Tệp nguồn:** `src/data/legacy-schema.ts`
- **Dòng:** 1–33
```typescript
import type { Schema } from './schema.generated';

/**
 * Kiểu tương thích cho các repository cũ của V1 trong quá trình chuyển đổi sang V2.
 * Cho phép mã cũ biên dịch trong khi các bảng vật lý đã được DROP khỏi PostgreSQL schema.
 */
export type LegacySchema = Schema & {
  attendance_days: any;
  attendance_sessions: any;
  punches: any;
  timesheets: any;
  sheet_approvals: any;
  punch_requests: any;
  corrections: any;
  explanations: any;
  leave_ledger: any;
  advance_requests: any;
  advance_approval_months: any;
  advance_approval_entries: any;
};
```

#### 2. Lược đồ chuẩn PostgreSQL chỉ tạo các bảng V2
- **Tệp nguồn:** `migrations/postgres/0001_baseline.sql`
- **Dòng:** 1–4, 221–330
```sql
-- Lược đồ chuẩn PostgreSQL cho hệ thống Lương Nhân Sự.
-- Gồm 20 bảng chuẩn nghiệp vụ (10 danh mục & cấu hình + 7 tính lương + 3 chấm công & yêu cầu V2).
-- Số liệu tiền dùng BIGINT; id tự tăng dùng IDENTITY; UUID dùng UUID hoặc TEXT; các ràng buộc toàn vẹn bảo vệ qua PL/pgSQL triggers.
...
CREATE TABLE system_requests (...);
CREATE TABLE work_schedules (...);
CREATE TABLE punch_events (...);
CREATE TABLE timesheet_entries (...);
```

**Phân tích kỹ thuật:**
12 bảng dữ liệu cốt lõi của V1 (`attendance_days`, `attendance_sessions`, `punches`, `timesheets`, `sheet_approvals`, `punch_requests`, `corrections`, `explanations`, `leave_ledger`, `advance_requests`, `advance_approval_months`, `advance_approval_entries`) hoàn toàn không tồn tại trong database PostgreSQL. Tuy nhiên, thay vì di chuyển mã V1 sang đọc/ghi trên các bảng V2, `LegacySchema` đã định nghĩa các bảng này dưới dạng `any` để đánh lừa trình biên dịch TypeScript.

---

### 2.3 Nuốt Lỗi Truy Vấn Gây Tính Lương Bằng 0 (Swallowed Read Errors & Zeroed Payroll)

#### 1. Bảng công V1 nuốt lỗi trả về rỗng
- **Tệp nguồn:** `src/platform/db.ts`
- **Dòng:** 1271–1291
```typescript
  async getSheet(u?, month?) {
    try {
      const r = await timesheetsRepo.find(u, month);
      return {
        days: r ? JSON.parse(r.days_json) : {},
        kpiPct: r && r.kpi_pct != null ? r.kpi_pct : null,
        kpiAmt: r && r.kpi_amt != null ? r.kpi_amt : null,
        kpiAdmPct: r && r.kpi_adm_pct != null ? r.kpi_adm_pct : null,
        kpiAdmAmt: r && r.kpi_adm_amt != null ? r.kpi_adm_amt : null,
        rev: r ? r.rev : 0
      };
    } catch {
      return { days: {}, kpiPct: null, kpiAmt: null, kpiAdmPct: null, kpiAdmAmt: null, rev: 0 };
    }
  },
  async setSheet(u?, month?, days?, kpiPct?, kpiAmt?) {
    try {
      await timesheetsRepo.upsertSheet(u, month, JSON.stringify(days), kpiPct ?? null, kpiAmt ?? null, now());
    } catch {
      // Bảng timesheets cũ không còn trên PostgreSQL baseline
    }
  },
```

#### 2. Lượt chấm công và phê duyệt V1 nuốt lỗi trả về mảng rỗng
- **Tệp nguồn:** `src/platform/attendance-sessions.ts`
- **Dòng:** 44–53
```typescript
    async listSessions({ username, month, date, includeScheduled = false }: any = {}) {
      try {
        const hide = includeScheduled ? null : { origin: ADMIN_ORIGIN, nowIso: now() };
        return (await sessionsRepo.list({ username, month, date }, hide)).map(row);
      } catch {
        return [];
      }
    },
```
- **Tệp nguồn:** `src/domain/approvals/approvals.ts`
- **Dòng:** 80–98
```typescript
    async list(options: any = {}) {
      try {
        const page = options.limit === undefined ? undefined : { limit: options.limit, offset: options.offset || 0 };
        return (await approvalsRepo.list(approvalFilter(options), page)).map(rowToApproval);
      } catch {
        return [];
      }
    },
...
    async forSheet(username?, month?) {
      try {
        if (!MONTH_RE.test(month)) throw new Error('Tháng phải có dạng YYYY-MM');
        return Object.fromEntries((await approvalsRepo.ofMonth(username, month)).map(r => [r.date, rowToApproval(r)]));
      } catch {
        return {};
      }
    },
```

#### 3. Chuỗi thực thi dẫn tới phiếu lương 0 đồng
- **Tệp nguồn:** `src/domain/period/periods.ts` (dòng 349–368) và `src/params/payroll-preview.ts` (dòng 141–196):
```typescript
// src/domain/period/periods.ts:349-368
async function calculate(month, { rev }: any, actx?, by?) {
  await precheck(month, rev, ['attendance_locked', 'calculated', 'reviewed']);
  const resolved = await paramsStore.resolve(month);
  return await store.transaction(async () => {
    const inputs = await service.loadInputs(month);
    const run = await store.payroll.createRun(month, { ... });
    for (const [, person] of inputs.people) {
      const slip = slipOf(month, person.staff, inputs, resolved.params);
      await store.payroll.addPayslip(run.id, slip);
    }
```
```typescript
// src/params/payroll-preview.ts:180-200
  for (const staff of staffList) {
    const sheet = await store.getSheet(staff.username, month);
    people.set(
      staff.username,
      JSON.parse(
        JSON.stringify({
          staff,
          days: estimateDays(sheet.days),
          approvals: await store.approvals.forSheet(staff.username, month),
          sessions: (await store.listSessions({ username: staff.username, month }))...
```

**Cơ chế hỏng hóc nghiêm trọng:**
Khi quản trị viên thực hiện tính lương chính thức qua API `POST /api/periods/:month/calculate`, phương thức `calculate` gọi `loadInputs(month)`. Hàm này gọi `store.getSheet()`, `store.approvals.forSheet()`, và `store.listSessions()`. Do các bảng `timesheets`, `sheet_approvals`, `attendance_sessions` đã bị xóa, Kysely ném ngoại lệ `relation "timesheets" does not exist`. Các hàm bọc bắt ngoại lệ trong khối `catch` và âm thầm trả về `{ days: {} }` cùng mảng rỗng `[]`.
Kết quả: Bộ máy tính lương V1 nhận dữ liệu công hoàn toàn trống rỗng, tính toán và lưu vào cơ sở dữ liệu các phiếu lương chính thức (`payslips`) với **0 ngày công, 0 giờ làm việc, và 0 đồng phụ cấp**, hoàn toàn bỏ qua mọi dữ liệu chấm công thực tế đã được lưu trong `timesheet_entries` và `punch_events` của V2.

---

### 2.4 Các Lệnh Ghi V1 Không Bọc Lỗi Gây Crash HTTP 500

Ngược lại với các hàm đọc nuốt lỗi, các endpoint ghi của V1 không bọc `try/catch`, dẫn đến việc hệ thống ném ngoại lệ cơ sở dữ liệu chưa được xử lý và sập với mã lỗi 500:

1. **`POST /api/advance-approvals/*`**:
   - **Tệp nguồn:** `src/data/advance-approvals.repository.ts`, dòng 58–65
   ```typescript
   async save(month: string, entries: { username: string; entry: AdvanceApprovalEntry }[]): Promise<void> {
     if (!entries.length) return;
     await this.qb
       .insertInto('advance_approval_months')
       .values({ month, rev: 0 })
       .onConflict(conflict => conflict.column('month').doNothing())
       .execute();
   ```
   *Lỗi*: Thao tác ghi trực tiếp vào bảng không tồn tại `advance_approval_months` gây ném lỗi PostgreSQL `relation "advance_approval_months" does not exist`.
2. **`PUT /api/approvals/decide`**:
   - **Tệp nguồn:** `src/data/attendance.repository.ts`, dòng 127–139
   ```typescript
   async decide(row: { username: string; date: string; rev: number; fingerprint: string }, status: string, by: string, at: string, note: string | null): Promise<number> {
     const result = await this.qb
       .updateTable('sheet_approvals')
       .set({ status, rev: sql<number>`rev + 1`, decided_by: by, decided_at: at, note })
       .where('username', '=', row.username)
       .where('date', '=', row.date)
       .where('rev', '=', row.rev)
       .where('fingerprint', '=', row.fingerprint)
       .executeTakeFirst();
     return Number(result.numUpdatedRows);
   }
   ```
   *Lỗi*: Ném lỗi PostgreSQL `relation "sheet_approvals" does not exist`.
3. **`GET /api/leave/ledger`**:
   - **Tệp nguồn:** `src/data/catalog.repository.ts`, dòng 69–80
   ```typescript
   eventsOf(staffUuid: string): Promise<Pick<LeaveLedgerRow, 'kind' | 'on_date' | 'days'>[]> {
     return this.qb.selectFrom('leave_ledger').select(['kind', 'on_date', 'days']).where('staff_uuid', '=', staffUuid).orderBy('on_date').orderBy('id').execute();
   }
   ```
   *Lỗi*: Gọi thông qua `src/modules/leave/leave.controller.ts:45`, ném lỗi PostgreSQL `relation "leave_ledger" does not exist`.

---

### 2.5 Tính Lương Payroll V2 Không Lưu Trữ & Frontend Bị Cách Ly

#### 1. `PayrollV2Service` hoàn toàn không ghi cơ sở dữ liệu
- **Tệp nguồn:** `src/modules/payroll-v2/payroll-v2.controller.ts`, dòng 25–32
```typescript
    try {
      const summaries = await this.service.generatePeriodPayslips(month, employeeIds);
      return {
        month,
        calculated: true,
        count: summaries.length,
        items: summaries
      };
```
- **Tệp nguồn:** `src/domain/payroll-v2/payroll-v2-service.ts`, dòng 7–24
```typescript
  async generatePeriodPayslips(month: string, employeeIds?: string[]): Promise<EmployeePayslipSummaryDTO[]> {
    let targets = employeeIds;
    if (!targets || targets.length === 0) {
      const staffList = await this.repo.listEligibleEmployees();
      targets = staffList.map(s => s.uuid);
    }

    const summaries: EmployeePayslipSummaryDTO[] = [];
    for (const empId of targets) {
      try {
        const payslip = await this.generateMonthlyPayslip(empId, month);
        summaries.push(payslip.toSummary());
      } catch {
        // Skip records that cannot be calculated
      }
    }
    return summaries;
  }
```
**Phân tích kỹ thuật:**
Cả `PayrollV2Controller`, `PayrollV2Service`, và `PayrollV2Repository` đều không chứa bất kỳ câu lệnh `INSERT` hay `UPDATE` nào vào các bảng lưu trữ lịch sử lương (`payroll_runs`, `payslips`, `payroll_periods`). Toàn bộ kết quả tính toán chi tiết của Aggregate `EmployeePayslip` chỉ tồn tại tạm thời trong đối tượng bộ nhớ phản hồi HTTP.

#### 2. Frontend hoàn toàn không gọi các API V2
Quét toàn bộ thư mục `web/src/` với truy vấn `/api/v2/` cho kết quả **0 kết quả**. Giao diện web người dùng Vue chỉ tương tác với các endpoint V1 (`/api/periods/*`, `/api/sheet/*`). Do đó, luồng tính lương V2 hoàn toàn bị cô lập khỏi người dùng cuối.

---

### 2.6 Lỗi Tính Toán & Hằng Số Cứng Trong Aggregate Payroll V2

Aggregate `EmployeePayslip` và `PayrollV2Service` được tạo ra để khớp với bộ dữ liệu kiểm thử mẫu tháng 10/2026 của GFT, dẫn đến hàng loạt giá trị bị gán cứng trái quy định pháp luật và kiến trúc miền:

#### 1. Ép toàn bộ giờ làm thêm thành hệ số 200%
- **Tệp nguồn:** `src/domain/payroll-v2/payroll-v2-service.ts`, dòng 146–150
```typescript
      otHoursByRate: {
        x15: 0,
        x20: totalOtHours,
        x30: 0
      },
```
- **Tệp nguồn:** `src/domain/payroll-v2/employee-payslip.ts`, dòng 270–282
```typescript
    this.ot15Hours = props.otHoursByRate?.x15 ?? 0;
    this.ot20Hours = props.otHoursByRate?.x20 ?? 0;
    this.ot30Hours = props.otHoursByRate?.x30 ?? 0;
    this.totalOtHours = this.ot15Hours + this.ot20Hours + this.ot30Hours || totalLineOtHours;

    this.otPayTotal = Math.round(
      this.ot15Hours * hourRate * 1.5 + this.ot20Hours * hourRate * 2.0 + this.ot30Hours * hourRate * 3.0
    );
```
*Phân tích*: Theo Điều 98 Bộ luật Lao động 2019, làm thêm ngày thường tính 150% (`x15`), ngày nghỉ hàng tuần tính 200% (`x20`), và ngày lễ/tết tính 300% (`x30`). Mã nguồn V2 gán cứng `x15: 0` và `x30: 0`, đẩy toàn bộ 100% số giờ làm thêm đã duyệt vào mức 200%, gây sai lệch nghiêm trọng chi phí nhân công.

#### 2. Xung đột phụ cấp ca Flex 20% vs 10%
- **Tệp nguồn:** `src/domain/payroll-v2/payroll-v2-service.ts`, dòng 51–60
```typescript
      if (shiftCode === 'FLEX') {
        shiftLabel = 'Flex +20%';
        flexAllowancePay = Math.round(0.2 * dayRate);
        daySalary = Math.round(dayRate);
      } else if (shiftCode === 'NIGHT') {
        shiftLabel = 'Night +40%';
        nightAllowancePay = Math.round(0.4 * dayRate);
        offPaidPay = 37500;
        inOutText = '22:00–06:00';
        daySalary = Math.round(dayRate);
      }
```
- **Tệp nguồn:** `src/domain/employee-v2/shift.ts`, dòng 41–52
```typescript
    } else if (this.type === 'FLEX') {
      if (props.allowancePct !== undefined && props.allowancePct !== 10) {
        throw new Error('Ca FLEX có phụ cấp ca cố định là 10%');
      }
      this.allowancePct = 10;
```
*Phân tích*: Domain model của Employee V2 ràng buộc cứng phụ cấp ca Flex là 10% (`allowancePct = 10`), nhưng `PayrollV2Service` lại tính cứng 20% (`0.2 * dayRate`) cho Flex và 40% cùng khoản tiền cố định `offPaidPay = 37500` cho ca đêm Night, bất chấp thiết lập trong cơ sở dữ liệu.

#### 3. Khấu trừ đi trễ đặc thù 0.58 giờ & Hằng số ma thuật
- **Tệp nguồn:** `src/domain/payroll-v2/employee-payslip.ts`, dòng 324–332, 345
```typescript
    if (props.lateEarlyDeductionAmount !== undefined) {
      this.lateEarlyDeductionAmount = props.lateEarlyDeductionAmount;
    } else if (Math.abs(this.lateEarlyHours - 0.58) < 0.005) {
      // Canonical 35-minute (7/12 h = 0.5833h) deduction at 28.846,15/h = 16.827 VND
      this.lateEarlyDeductionAmount = -16827;
    } else {
      this.lateEarlyDeductionAmount = -Math.round(this.lateEarlyHours * hourRate);
    }
...
    this.taxExemptIncome = props.taxExemptIncome ?? this.flexAllowanceActual + this.travelAllowanceActual + 34615;
```
*Phân tích*: Mã nghiệp vụ chứa một nhánh điều kiện đặc biệt kiểm tra nếu số giờ đi trễ xấp xỉ `0.58` giờ (35 phút) thì khấu trừ cứng đúng `-16827` VNĐ; thu nhập miễn thuế cộng thêm số cố định `+ 34615`. Đây là kỹ thuật "gian lận kiểm thử" (test overfitting) để khớp với phiếu lương mẫu tháng 10/2026.

#### 4. Khấu trừ 10.5% bảo hiểm cho toàn bộ nhân sự bất kể đối tượng
- **Tệp nguồn:** `src/domain/payroll-v2/employee-payslip.ts`, dòng 348–350
```typescript
    // 10.5% mandatory social, health, and unemployment insurance
    this.insuranceDeduction = Math.round(this.baseSalaryPolicy * 0.105);
    this.incomeAfterInsurance = this.grossIncome - this.insuranceDeduction;
```
*Phân tích*: Hệ thống không kiểm tra cờ `staff.insured` hoặc đối tượng hợp đồng (thực tập sinh, thử việc, thời vụ). Mọi nhân sự đều bị trừ 10.5% bảo hiểm bắt buộc trên mức lương chính sách.

#### 5. Lỗi biên chuẩn hóa điểm KPI tại ngưỡng giá trị 1
- **Tệp nguồn:** `src/domain/payroll-v2/payroll-v2-service.ts`, dòng 126–132
```typescript
      kpiScoresProps = {
        wework: kpiScore.wework > 1 ? kpiScore.wework / 100 : kpiScore.wework,
        user: kpiScore.user > 1 ? kpiScore.user / 100 : kpiScore.user,
        peer: kpiScore.peer > 1 ? kpiScore.peer / 100 : kpiScore.peer,
        manager: kpiScore.manager > 1 ? kpiScore.manager / 100 : kpiScore.manager,
        self: kpiScore.self > 1 ? kpiScore.self / 100 : kpiScore.self
      };
```
*Phân tích*: Điểm KPI trong bảng `kpi_scores` được lưu dưới dạng số nguyên điểm cơ sở từ 0 đến 10000 (với 10000 = 100.00%). Nếu điểm thành phần là 1 (tức 0.01% - mức điểm tối thiểu), biểu thức `kpiScore.wework > 1` cho kết quả `false`, dẫn tới việc giữ nguyên giá trị `1.0` (tương đương 100%), làm sai lệch điểm số lên gấp 10.000 lần.

---

### 2.7 `PayrollV2Controller` Hoàn Toàn Không Thể Truy Cập (Unreachability via ApiGate)

- **Tệp nguồn:** `src/platform/authz.ts`, dòng 310–330, 364–366
```typescript
function routeKey(method?, seg?) {
  if (seg[1] === 'v2' && seg[2] === 'employees') { ... }
  if (seg[1] === 'v2' && seg[2] === 'requests') { ... }
  if (seg[1] === 'v2' && seg[2] === 'attendance') { ... }
  ...
  return `${method} /${seg.slice(1, 3).join('/')}`;
}
```
- **Tệp nguồn:** `src/http/api-gate.ts`, dòng 54–58
```typescript
    const policy = this.authz.policyOf(this.authz.routeKey(method, seg));
    if (!policy) {
      need();
      throw new HttpError(403, 'Đường dẫn này chưa có chính sách quyền, bị từ chối', { code: 'NO_ROUTE_POLICY' });
    }
```

**Phân tích kỹ thuật:**
Hàm `routeKey` trong `authz.ts` ánh xạ URL thành định danh quyền cho `v2/employees`, `v2/requests`, và `v2/attendance`, nhưng hoàn toàn bỏ quên nhánh `v2/payroll`. Bất kỳ yêu cầu nào gửi tới `/api/v2/payroll/*` sẽ rơi xuống nhánh mặc định: `POST /v2/payroll` hoặc `GET /v2/payroll`.
Tại bảng `ROUTE_CAPS` (`authz.ts:280–306`), không có bất kỳ quyền nào được đăng ký cho `/v2/payroll`. Do đó, `ApiGate.open` lập tức từ chối và ném mã lỗi HTTP 403 `NO_ROUTE_POLICY` đối với 100% các yêu cầu tới `PayrollV2Controller`.

---

### 2.8 Đoán Múi Giờ Heuristic & Không Trừ Giờ Nghỉ Trưa Trong Attendance V2

#### 1. Cơ chế đoán múi giờ lân cận không xác định (Dynamic Proximity Heuristic)
- **Tệp nguồn:** `src/domain/attendance-v2/daily-timesheet.ts`, dòng 103–122
```typescript
  let useUtc = true;
  if (referenceCheckIn) {
    const utcStart = new Date(`${workDate}T${startTimeStr}:00.000Z`).getTime();
    const localStart = new Date(y, m - 1, d, sH, sM, 0, 0).getTime();
    useUtc = Math.abs(referenceCheckIn.getTime() - utcStart) <= Math.abs(referenceCheckIn.getTime() - localStart);
  }

  let plannedStart: Date;
  let plannedEnd: Date;

  if (useUtc) {
    plannedStart = new Date(`${workDate}T${startTimeStr}:00.000Z`);
    const dayOffsetMs = isOvernight ? 86400000 : 0;
    plannedEnd = new Date(new Date(`${workDate}T${endTimeStr}:00.000Z`).getTime() + dayOffsetMs);
  } else {
    plannedStart = new Date(y, m - 1, d, sH, sM, 0, 0);
    plannedEnd = new Date(y, m - 1, d + (isOvernight ? 1 : 0), eH, eM, 0, 0);
  }
```
*Phân tích*: Thay vì cố định múi giờ chuẩn của doanh nghiệp (ICT, UTC+7), hệ thống so sánh khoảng cách giữa thời điểm Check-in thực tế với mốc thời gian diễn giải theo UTC và mốc diễn giải theo giờ địa phương của máy chủ (Server Local Time), rồi chọn mốc gần hơn. Nếu nhân viên chưa Check-in (`referenceCheckIn` là null), hệ thống mặc định coi giờ ca là UTC (`${workDate}T${startTimeStr}:00.000Z`). Đối với ca 08:00 sáng tại Việt Nam, mốc này bị lệch thành 15:00 chiều ICT, làm sai lệch hoàn toàn việc xác định đi trễ/về sớm.

#### 2. Không trừ thời gian nghỉ trưa trong tổng giờ làm việc
- **Tệp nguồn:** `src/domain/attendance-v2/daily-timesheet.ts`, dòng 431–439
```typescript
    if (firstIn && lastOut && firstIn.punchedAt.getTime() <= lastOut.punchedAt.getTime()) {
      const actualDurationHours = Math.max(0, (lastOut.punchedAt.getTime() - firstIn.punchedAt.getTime()) / 3600000);
      workHours = Math.round(actualDurationHours * 10) / 10;
      if (workHours >= 7.0) {
        workUnits = 1.0;
      } else if (workHours >= 3.5) {
        workUnits = 0.5;
      }
    }
```
*Phân tích*: Giờ làm việc `workHours` được tính bằng đúng khoảng cách giữa lần dập thẻ đầu tiên và lần dập thẻ cuối cùng. Đối với ca tiêu chuẩn 08:00–17:00 (tổng thời gian 9 tiếng, có 1 tiếng nghỉ trưa không tính lương), nhân viên làm đủ giờ sẽ bị ghi nhận thành 9.0 giờ làm việc thay vì 8.0 giờ chuẩn.

---

### 2.9 Sập Ứng Dụng Runtime, Repository Mồ Côi & Lệch Mô Hình Phép Năm Trong Employee V2

#### 1. Sập ứng dụng khi gọi `DELETE /api/v2/employees/:username`
- **Tệp nguồn:** `src/modules/employee-v2/employee-v2.controller.ts`, dòng 253–262
```typescript
  @Delete(':username')
  async deleteEmployee(@Ctx() c: ApiContext, @Param('username') paramUser?: string): Promise<unknown> {
    const username = paramUser || c.seg[3];
    const existing = await this.service.findByUsernameOrUuid(username);
    if (!existing) {
      throw new HttpError(404, 'Không tìm thấy nhân viên', { code: 'EMPLOYEE_NOT_FOUND' });
    }
    await this.service.delete(existing.username);
    return { deleted: true, username: existing.username };
  }
```
*Phân tích*: Toàn bộ 495 dòng mã của `EmployeeV2Service` (`src/modules/employee-v2/employee-v2.service.ts`) **không hề có phương thức `delete`**. Lời gọi `DELETE /api/v2/employees/:username` sẽ ném ngoại lệ không xử lý: `TypeError: this.service.delete is not a function`, làm sập yêu cầu với mã lỗi 500.

#### 2. `EmployeeV2Repository` bị mồ côi hoàn toàn
- Tệp `src/data/employee-v2.repository.ts` định nghĩa lớp `EmployeeV2Repository`.
- Tệp `src/data/index.ts` không xuất khẩu lớp này.
- `EmployeeV2Service` không tiêm phụ thuộc (inject) repository này mà tự sao chép lại toàn bộ câu lệnh truy vấn qua `this.store.queryBuilder`.

#### 3. Vi phạm toàn vẹn khóa ngoại khi xóa nhân viên
- **Tệp nguồn:** `src/data/employee-v2.repository.ts`, dòng 398–404
```typescript
  async deleteByUsername(username: string): Promise<boolean> {
    const result = await this.qb
      .deleteFrom('staff')
      .where('username', '=', username)
      .executeTakeFirst();
    return Number(result.numDeletedRows) > 0;
  }
```
*Phân tích*: Cột `staff.uuid` được trích dẫn làm khóa ngoại bởi `timesheet_entries`, `punch_events`, `work_schedules`, và `system_requests` mà **không có điều khoản `ON DELETE CASCADE`** (`migrations/postgres/0001_baseline.sql:223, 255, 271, 286`). Bất kỳ thao tác xóa nhân sự nào đã phát sinh dữ liệu chấm công hoặc đơn từ sẽ bị PostgreSQL chặn đứng với mã lỗi vi phạm toàn vẹn khóa ngoại `23503 foreign_key_violation`.

#### 4. Lệch mô hình hạn mức phép năm V2 sang điều chỉnh phép V1
- **Tệp nguồn:** `src/platform/db.ts`, dòng 236
```typescript
      leaveAdjust: r.leave_total_days != null ? Number(r.leave_total_days) : r.leave_adjust || 0,
```
*Phân tích*: Trong Employee V2, `leave_total_days` là tổng số ngày phép năm được hưởng (ví dụ 12 ngày). Trong V1, `leaveAdjust` là số ngày phép được điều chỉnh thêm/bớt (+/-). Khi chuyển đổi qua `rowToStaff`, hệ thống gán `leaveAdjust = leave_total_days`. Kết quả là nhân viên có hạn mức 12 ngày phép năm sẽ được cộng thêm 12 ngày phép thưởng trong bộ máy tính phép V1 (`accrued + leaveAdjust`), nhân đôi số ngày phép thực tế.

---

### 2.10 Các Hàm Giả Lập Không Thao Tác (No-Op Stubs) & Tuyến Đường Bị Thiếu Trong UI-Bridge

#### 1. Các hàm giả lập trả về thành công mà không ghi database
- **Tệp nguồn:** `src/modules/ui-bridge/ui-bridge.controller.ts`, dòng 123–137
```typescript
  @Put('sheet/bulk')
  async putSheetBulk(@Ctx() c: ApiContext): Promise<unknown> {
    const { req, needAdmin } = c;
    needAdmin();
    const body = (await readJson(req)) || {};
    return { ok: true, updated: (body.usernames || []).length };
  }

  @Put('staff/shift-bulk')
  async putStaffShiftBulk(@Ctx() c: ApiContext): Promise<unknown> {
    const { req, needAdmin } = c;
    needAdmin();
    const body = (await readJson(req)) || {};
    return { ok: true, shiftCode: body.preset || 'normal', updated: body.usernames || [] };
  }
```
*Phân tích*: Hai endpoint phục vụ việc sửa công hàng loạt và đổi ca nhân viên hàng loạt nhận dữ liệu từ giao diện, không gọi bất kỳ kho lưu trữ hay dịch vụ nào, và trả ngay `{ ok: true }`. Quản trị viên trên giao diện thấy thông báo cập nhật thành công nhưng thực tế dữ liệu trong cơ sở dữ liệu không hề thay đổi.

#### 2. Dữ liệu giả lập cứng trong `GET /api/today`
- **Tệp nguồn:** `src/modules/ui-bridge/ui-bridge.controller.ts`, dòng 191–206
```typescript
  @Get('today')
  async getToday(@Ctx() c: ApiContext): Promise<unknown> {
    const { needAdmin } = c;
    needAdmin();
    const today = this.rules.vnToday();
    const people = (await this.store.listStaff()).filter((s: any) => s.payrollSubject);
    const rows = people.map((s: any) => ({
      username: s.username,
      name: s.name,
      status: 'checked-out',
      shift: s.shiftCode || 'normal',
      in: null,
      out: null
    }));
    return { today, rows };
  }
```
*Phân tích*: Endpoint hiển thị trạng thái chấm công hôm nay không đọc từ `punch_events` hay `timesheet_entries`. Mọi nhân viên bị trả về trạng thái cứng: `checked-out`, `in: null`, `out: null`. Bảng theo dõi trực quan ngày làm việc của quản trị viên bị vô hiệu hóa hoàn toàn.

#### 3. Tuyến đường bị thiếu tạo lỗi 404 cho thao tác của Quản trị viên
- Tuyến `PUT /api/ot`: Được giao diện Vue gọi tại `web/src/services/admin-attendance.ts:116`, nhưng `UiBridgeController` chỉ có `@Get('ot')` (dòng 208).
- Tuyến `POST /api/explanations/:id/decide`: Được giao diện Vue gọi tại `web/src/services/admin-explanations.ts:3`, nhưng backend hoàn toàn không có handler tương ứng, gây lỗi 404 Not Found khi duyệt giải trình.

---

## 3. Phân Tích Đồng Thời, Điều Kiện Đua & Rủi Ro Thực Thi Nền (Concurrency, Race Conditions & Background Execution Analysis)

### 3.1 Lệch Tầm Vực Khoá Tư Vấn (`pg_advisory_xact_lock`) & Tự Động Giải Phóng Sau Câu Lệnh

- **Tệp nguồn:** `src/data/locks.ts`, dòng 9–15
```typescript
export class AdvisoryLocks {
  constructor(private readonly qb: Kysely<Schema>) {}

  async acquire(key: string): Promise<void> {
    await sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`.execute(this.qb);
  }
}
```
- **Tệp nguồn:** `src/platform/db.ts`, dòng 1111–1112
```typescript
  // Khoá tư vấn theo khoá nghiệp vụ tới hết giao dịch (xem src/data/locks.ts): gọi đầu giao dịch "đọc rồi mới chèn"
  lock: (key?) => locks.acquire(key),
```
- **Tệp nguồn:** `src/data/postgres-database.ts`, dòng 277–279
```typescript
  query(text?, params?) {
    return (this.store.getStore() || this.pool).query(text, params);
  }
```

**Cơ chế xung đột kỹ thuật:**
`AdvisoryLocks.acquire` thực thi hàm `pg_advisory_xact_lock`. Theo tài liệu của PostgreSQL, `pg_advisory_xact_lock` là khoá tư vấn có tầm vực giao dịch (transaction-level lock) và sẽ **tự động giải phóng ngay khi giao dịch kết thúc**.
Khi người gọi sử dụng `store.lock(key)` mà không nằm trong một khối `store.transaction()`, `this.store.getStore()` trong `PoolDriver` trả về `undefined`. Lệnh `select pg_advisory_xact_lock(...)` được chuyển thẳng tới `this.pool.query(...)`.
Trong PostgreSQL, một câu lệnh đơn lẻ chạy qua kết nối pool mà không có `BEGIN` sẽ được thực thi trong một giao dịch tự động cam kết (autocommit transaction). Kết quả: **Khoá tư vấn được cấp phát và ngay lập tức bị huỷ bỏ tại thời điểm câu lệnh SELECT kết thúc**. Mọi đoạn mã phía sau tưởng rằng mình đã được tuần tự hóa an toàn thực chất chạy hoàn toàn không có khoá bảo vệ. Hơn nữa, `AdvisoryLocks` không có bất kỳ câu lệnh khẳng định (assertion) nào để ngăn chặn việc gọi ngoài giao dịch.

---

### 3.2 Bỏ Quên Toàn Diện Khoá Tư Vấn & Khoá Mức Dòng Trên Toàn Bộ Aggregate V2

Kiểm tra toàn bộ mã nguồn của 4 Aggregate V2:
- `src/modules/request-v2/request-v2.service.ts` (410 dòng)
- `src/modules/attendance-v2/attendance-v2.service.ts` (188 dòng)
- `src/domain/payroll-v2/payroll-v2-service.ts` (159 dòng)
- `src/modules/employee-v2/employee-v2.service.ts` (495 dòng)

Kết quả kiểm toán: **100% các thao tác nghiệp vụ ghi trong Aggregate V2 hoàn toàn không sử dụng `store.lock()`, không sử dụng `SELECT ... FOR UPDATE`, và không sử dụng khối bao bọc giao dịch `store.transaction()`**. Toàn bộ các thao tác ghi đều chạy dưới dạng các câu lệnh autocommit độc lập nối tiếp nhau.

---

### 3.3 Đua Phê Duyệt Đơn, Đảo Trạng Thái & Lịch Làm Việc Mồ Côi Trong Request V2

- **Tệp nguồn:** `src/modules/request-v2/request-v2.service.ts`, dòng 305–376
```typescript
  async reviewRequest(
    id: string,
    reviewerId: string,
    action: 'APPROVE' | 'REJECT',
    note?: string
  ): Promise<SystemRequestDTO> {
    const req = await this.repo.findById(id);
    if (!req) {
      throw new Error(`Request with id '${id}' not found`);
    }

    if (action === 'APPROVE') {
      req.approve(reviewerId, note);

      if (this.attendanceRepo) {
        if (req.type === 'SHIFT_CHANGE') {
          ...
        } else if (req.type === 'LEAVE') {
          const start = req.leaveStartDate;
          const end = req.leaveEndDate || start;
          if (start) {
            let cur = new Date(`${start}T00:00:00.000Z`);
            const endDate = new Date(`${end}T00:00:00.000Z`);
            while (cur.getTime() <= endDate.getTime()) {
              const curStr = cur.toISOString().slice(0, 10);
              const sched = await this.attendanceRepo.ensureDefaultSchedule(req.employeeId, curStr);
              await this.attendanceRepo.saveSchedule(sched.withLeave(req.id));
              cur = new Date(cur.getTime() + 86400000);
            }
          }
        }
      }
    } else if (action === 'REJECT') {
      req.reject(reviewerId, note);
    }

    await this.repo.save(req);
    return req.toJSON();
  }
```

**Kịch bản xen kẽ dẫn tới tha hóa dữ liệu (Interleaving Sequence):**
Xem xét hai quản trị viên A và B cùng thao tác trên một đơn xin nghỉ phép `PENDING`:
1. **T0**: Đơn `req` có `status = 'PENDING'`.
2. **T1 (Quản lý A - DUYỆT)**: Gọi `findById(id)`, đọc được đơn ở trạng thái `PENDING`.
3. **T2 (Quản lý B - TỪ CHỐI)**: Gọi `findById(id)`, đọc được đơn ở trạng thái `PENDING`.
4. **T3 (Quản lý A)**: Vòng lặp chạy, ghi nhận ngày nghỉ vào bảng `work_schedules` qua `saveSchedule(sched.withLeave(req.id))`. Bảng lịch làm việc hiện ghi nhận nhân viên được nghỉ phép theo đơn `req.id`.
5. **T4 (Quản lý B)**: Chạy nhánh `action === 'REJECT'`, gọi `req.reject(...)` và thực thi `this.repo.save(req)`. PostgreSQL lưu đơn thành `REJECTED`.
6. **T5 (Quản lý A)**: Thực thi `this.repo.save(req)`:
   - Nếu A ghi sau B: Bảng `system_requests` bị ghi đè thành `APPROVED`. Cả hai bên đều nhận thông báo thành công dù hành động mâu thuẫn.
   - Nếu B ghi sau A: Bảng `system_requests` ghi nhận `REJECTED`, nhưng tác dụng phụ trong `work_schedules` đã bị cam kết vĩnh viễn ở bước T3. Hệ thống rơi vào trạng thái tha hóa dữ liệu nghiêm trọng: **Lịch làm việc ghi nhận được nghỉ phép có lương nhưng trỏ tới một lá đơn đã bị từ chối**.

---

### 3.4 Vòng Lặp Bơm Lịch Nghỉ Nhiều Ngày Bị Thất Bại Từng Phần (Non-Atomic Loop)

- **Tệp nguồn:** `src/modules/request-v2/request-v2.service.ts`, dòng 348–360
```typescript
        } else if (req.type === 'LEAVE') {
          const start = req.leaveStartDate;
          const end = req.leaveEndDate || start;
          if (start) {
            let cur = new Date(`${start}T00:00:00.000Z`);
            const endDate = new Date(`${end}T00:00:00.000Z`);
            while (cur.getTime() <= endDate.getTime()) {
              const curStr = cur.toISOString().slice(0, 10);
              const sched = await this.attendanceRepo.ensureDefaultSchedule(req.employeeId, curStr);
              await this.attendanceRepo.saveSchedule(sched.withLeave(req.id));
              cur = new Date(cur.getTime() + 86400000);
            }
          }
        }
```
**Phân tích kỹ thuật:**
Vòng lặp `while` duyệt qua từng ngày trong khoảng thời gian nghỉ phép và thực hiện các câu lệnh `saveSchedule` riêng rẽ không nằm trong giao dịch database. Nếu có lỗi mạng, ngắt kết nối DB, hoặc tiến trình bị khởi động lại tại ngày thứ 4 của đợt nghỉ 10 ngày:
- Các ngày 1, 2, 3 đã được ghi nhận vào `work_schedules` là nghỉ phép.
- Các ngày từ 4 đến 10 chưa được tạo.
- Câu lệnh `this.repo.save(req)` ở cuối hàm không được chạm tới, khiến đơn nghỉ phép vẫn ở trạng thái `PENDING`.
- Thao tác thử lại sau đó sẽ gây xung đột dữ liệu lịch phân mảnh.

---

### 3.5 Điều Kiện Đua TOCTOU Khi Tạo Đơn Nghỉ Phép Trùng Lặp

- **Tệp nguồn:** `src/modules/request-v2/request-v2.service.ts`, dòng 136–154
```typescript
    // Chống trùng lặp thời gian nghỉ phép với các đơn đang chờ hoặc đã duyệt
    const existingLeaves = await this.repo.list({
      employeeId: input.employeeId,
      type: 'LEAVE'
    });
    const start = req.leaveStartDate!;
    const end = req.leaveEndDate!;
    for (const item of existingLeaves) {
      if (item.status === 'PENDING' || item.status === 'APPROVED') {
        const itemStart = item.leaveStartDate!;
        const itemEnd = item.leaveEndDate || itemStart;
        if (start <= itemEnd && end >= itemStart) {
          throw new Error(`Đã có đơn nghỉ phép trùng trong khoảng thời gian ${start} đến ${end}`);
        }
      }
    }

    await this.repo.save(req);
    return req.toJSON();
```

**Phân tích kỹ thuật:**
Hàm `createLeaveRequest` thực hiện cơ chế kiểm tra rồi mới hành động (Check-Then-Act):
1. Luồng 1 đọc `existingLeaves` trong khoảng ngày 10/11 đến 15/11 -> Không có đơn nào.
2. Luồng 2 (nhân viên bấm đúp hoặc gửi từ 2 tab) đọc `existingLeaves` -> Không có đơn nào.
3. Luồng 1 kiểm tra trùng lặp (vượt qua) và thực thi `save(req)`.
4. Luồng 2 kiểm tra trùng lặp (vượt qua) và thực thi `save(req)`.
Vì bảng `system_requests` trong PostgreSQL (`migrations/postgres/0001_baseline.sql:221–251`) **hoàn toàn không có ràng buộc loại trừ dải thời gian (`EXCLUDE USING gist`)** hoặc chỉ mục duy nhất một phần, cả hai đơn xin nghỉ phép cho cùng một khoảng thời gian đều được lưu thành công vào cơ sở dữ liệu.

---

### 3.6 Điều Kiện Đua Vượt Trần 40 Giờ Làm Thêm Mỗi Tháng

- **Tệp nguồn:** `src/modules/request-v2/request-v2.service.ts`, dòng 223–243
```typescript
    const existingOt = await this.repo.list({
      employeeId: input.employeeId,
      type: 'OVERTIME'
    });
    ...
    const month = otDate.slice(0, 7);
    let totalMonthOt = 0;
    for (const item of existingOt) {
      if ((item.status === 'PENDING' || item.status === 'APPROVED') && item.otDate?.startsWith(month)) {
        totalMonthOt += item.otHours || 0;
      }
    }
    if (totalMonthOt + hours > 40) {
      throw new Error(`Tổng số giờ làm thêm trong tháng ${month} không được vượt quá 40 giờ theo Luật Lao động (đã có ${totalMonthOt}h, đăng ký thêm ${hours}h)`);
    }
    await this.repo.save(req);
```
**Phân tích kỹ thuật:**
Tương tự đơn nghỉ phép, việc kiểm tra trần OT tháng 40 giờ theo Điều 107 BLLĐ diễn ra bằng một câu lệnh `SELECT` không khoá (`non-locking read`). Nếu một nhân viên đã có 35 giờ OT và gửi đồng thời 2 yêu cầu 4 giờ từ 2 thiết bị: cả hai yêu cầu đều tính ra `35 + 4 = 39 <= 40`, vượt qua điều kiện kiểm tra và cùng được ghi xuống database, nâng tổng giờ làm thêm lên 43 giờ, vi phạm pháp luật lao động.

---

### 3.7 Dập Thẻ Đồng Thời Ghi Đè Làm Mở Khóa Kỳ Lương (`is_locked = false`)

- **Tệp nguồn:** `src/modules/attendance-v2/attendance-v2.service.ts`, dòng 99–103, 160–161
```typescript
    // 3. Kiểm tra xem ngày công đã bị khóa chưa
    let timesheet = await this.repo.findTimesheet(input.employeeId, workDate);
    if (timesheet && timesheet.isLocked) {
      throw new Error('Bảng công ngày đã bị khóa cho kỳ lương, không thể tính toán lại');
    }
...
    timesheet = timesheet.calculate(punches, schedule);
    await this.repo.saveTimesheet(timesheet);
```
- **Tệp nguồn:** `src/data/attendance-v2.repository.ts`, dòng 99–119
```typescript
      .onConflict(oc =>
        oc.columns(['employee_id', 'work_date']).doUpdateSet(eb => ({
          shift_type: eb.ref('excluded.shift_type'),
          shift_start_time: eb.ref('excluded.shift_start_time'),
          ...
          is_locked: eb.ref('excluded.is_locked'),
          updated_at: now
        }))
      )
```

**Kịch bản phá huỷ tính toàn vẹn kỳ lương:**
1. **T0**: Nhân viên dập thẻ. `findTimesheet` tải dữ liệu ngày công lên bộ nhớ với `timesheet.isLocked = false`.
2. **T1**: Kế toán trưởng tiến hành chốt kỳ công qua lệnh khoá bảng công (`AttendanceV2Repository.lockTimesheets`), thực thi lệnh SQL: `UPDATE timesheet_entries SET is_locked = true ...`. Bảng ghi trong PostgreSQL hiện có `is_locked = true`.
3. **T2**: Tiến trình dập thẻ hoàn tất tính toán số giờ làm việc với đối tượng bộ nhớ `timesheet` (mang `isLocked = false`) và gọi `saveTimesheet(timesheet)`.
4. **T3**: `saveTimesheet` thực thi `INSERT ... ON CONFLICT DO UPDATE SET is_locked: eb.ref('excluded.is_locked')`.
5. Bảng ghi trong PostgreSQL bị ghi đè giá trị `is_locked` từ `true` trở lại thành `false`. Dữ liệu của một kỳ lương đã khóa bị âm thầm mở lại, cho phép tiếp tục chỉnh sửa và làm sai lệch số liệu kế toán.

---

### 3.8 Đua Xóa Giờ Làm Thêm Đã Duyệt Khi Khởi Tạo Lịch Mặc Định (`ensureDefaultSchedule`)

- **Tệp nguồn:** `src/data/attendance-v2.repository.ts`, dòng 315–325, 392–418
```typescript
  async ensureDefaultSchedule(employeeId: string, workDate: string): Promise<WorkSchedule> {
    const existing = await this.findSchedule(employeeId, workDate);
    if (existing) return existing;

    const staffRow = await this.qb
      .selectFrom('staff')
      .select(['uuid', 'shift_type', 'shift_start_time', 'shift_end_time'])
      .where('uuid', '=', employeeId)
      .executeTakeFirst();

    const defaultSchedule = WorkSchedule.create({
      employeeId,
      workDate,
      shiftType: (staffRow?.shift_type as any) || 'NORMAL',
      plannedStartTime: staffRow?.shift_start_time || '08:00',
      plannedEndTime: staffRow?.shift_end_time || '17:00',
      scheduleType: 'REGULAR',
      status: 'PLANNED'
    });

    await this.saveSchedule(defaultSchedule);
    return defaultSchedule;
  }
```
```typescript
// saveSchedule onConflict:
      .onConflict(oc =>
        oc.columns(['employee_id', 'work_date']).doUpdateSet(eb => ({
          shift_type: eb.ref('excluded.shift_type'),
          planned_start_time: eb.ref('excluded.planned_start_time'),
          planned_end_time: eb.ref('excluded.planned_end_time'),
          approved_ot_hours: eb.ref('excluded.approved_ot_hours'),
          schedule_type: eb.ref('excluded.schedule_type'),
          status: eb.ref('excluded.status'),
          source_request_id: eb.ref('excluded.source_request_id'),
          updated_at: now
        }))
      )
```

**Kịch bản xóa sạch giờ OT đã duyệt:**
1. **Luồng A (Dập thẻ)**: Gọi `ensureDefaultSchedule`, kiểm tra `findSchedule` thấy `null`. Bắt đầu chuẩn bị `defaultSchedule` với `status = 'PLANNED'` và `approved_ot_hours = 0`.
2. **Luồng B (Duyệt OT)**: Quản lý phê duyệt đơn làm thêm giờ, cập nhật lịch làm việc thành `status = 'OVERTIME'` và `approved_ot_hours = 3`, lưu thành công xuống database.
3. **Luồng A (Dập thẻ)**: Tiếp tục thực thi `saveSchedule(defaultSchedule)`. Câu lệnh `ON CONFLICT DO UPDATE` ghi đè toàn bộ bản ghi trong DB, trả `status` về `'PLANNED'` và `approved_ot_hours` về `0`. Giờ làm thêm đã được phê duyệt hợp lệ của nhân viên bị xóa sổ hoàn toàn.

---

### 3.9 Thiếu Biên Giới Giao Dịch Trong Xử Lý Dập Thẻ (`recordPunch`)

- **Tệp nguồn:** `src/modules/attendance-v2/attendance-v2.service.ts`, dòng 74–167
Phương thức `recordPunch` thực thi chuỗi 7 truy vấn bất đồng bộ:
1. `findSchedule`
2. `saveSchedule` / `ensureDefaultSchedule`
3. `findTimesheet` (kiểm tra `isLocked`)
4. `savePunch`
5. `findPunches`
6. `timesheet.calculate(...)`
7. `saveTimesheet`

Chuỗi 7 thao tác này chạy độc lập không nằm trong `store.transaction` và không có khoá phân tán trên nhân viên. Khi nhiều lần dập thẻ diễn ra gần như cùng lúc (ví dụ hai đầu đọc thẻ gửi tín hiệu cách nhau vài mili-giây), hai luồng sẽ đọc cùng một danh sách `findPunches` cũ, tính toán bảng công độc lập, và câu lệnh `saveTimesheet` sau cùng sẽ ghi đè làm mất công của lần dập thẻ trước.

---

### 3.10 Lỗi Định Dạng Ngày `${month}-31` Làm Sập Tính Lương V2 Cho 5 Tháng Trong Năm

- **Tệp nguồn:** `src/data/payroll-v2.repository.ts`, dòng 95–104
```typescript
    // Timesheet entries
    const startDate = `${month}-01`;
    const endDate = `${month}-31`;
    const timesheetRows = await this.qb
      .selectFrom('timesheet_entries')
      .selectAll()
      .where('employee_id', '=', staffRow.uuid || employeeId)
      .where('work_date', '>=', startDate)
      .where('work_date', '<=', endDate)
      .orderBy('work_date', 'asc')
      .execute();
```
- **Tệp nguồn:** `src/domain/payroll-v2/payroll-v2-service.ts`, dòng 14–22
```typescript
    const summaries: EmployeePayslipSummaryDTO[] = [];
    for (const empId of targets) {
      try {
        const payslip = await this.generateMonthlyPayslip(empId, month);
        summaries.push(payslip.toSummary());
      } catch {
        // Skip records that cannot be calculated
      }
    }
    return summaries;
```
- **Lược đồ PostgreSQL:** `migrations/postgres/0001_baseline.sql:287`: `work_date DATE NOT NULL`.

**Hậu quả thảm khốc:**
Cột `work_date` có kiểu dữ liệu là PostgreSQL `DATE`. Khi tính lương cho các tháng có ít hơn 31 ngày (tháng 2, 4, 6, 9, 11), biểu thức `${month}-31` sinh ra chuỗi không hợp lệ (ví dụ: `'2026-02-31'`).
PostgreSQL lập tức ném lỗi cú pháp ngày tháng:
`ERROR: date/time field value out of range: "2026-02-31"`.
Trong `PayrollV2Service.generatePeriodPayslips`, khối `catch {}` ở dòng 19 đã **âm thầm nuốt sạch ngoại lệ này**.
Hệ quả: Đối với toàn bộ 5 tháng trên trong năm, hệ thống **bỏ qua 100% nhân sự trong công ty** và trả về danh sách phiếu lương rỗng `items: []`.

---

### 3.11 Truy Vấn Không Giới Hạn Tích Lũy Vô Tận Yêu Cầu Cũ Trong Payroll V2

- **Tệp nguồn:** `src/data/payroll-v2.repository.ts`, dòng 107–113
```typescript
    // Requests
    const requestRows = await this.qb
      .selectFrom('system_requests')
      .selectAll()
      .where('employee_id', '=', staffRow.uuid || employeeId)
      .where('status', '=', 'APPROVED')
      .execute();
```
- **Tệp nguồn:** `src/domain/payroll-v2/payroll-v2-service.ts`, dòng 107–121
```typescript
    // Overtime from approved requests
    let totalOtHours = 0;
    for (const req of requests) {
      if (req.type === 'OVERTIME' && req.status === 'APPROVED') {
        totalOtHours += req.otHours || 0;
      }
    }

    // Advance deduction from approved requests
    let advanceDeduction = 0;
    for (const req of requests) {
      if (req.type === 'ADVANCE' && req.status === 'APPROVED') {
        advanceDeduction += Number(req.advanceAmount || 0);
      }
    }
```

**Phân tích kỹ thuật:**
Hàm `getMonthlyData` truy vấn bảng `system_requests` chỉ lọc theo `employee_id` và `status = 'APPROVED'`, **hoàn toàn không lọc theo tháng, kỳ, hay ngày tháng**.
Hàm `generateMonthlyPayslip` duyệt qua mảng kết quả và cộng dồn toàn bộ `otHours` và `advanceAmount`.
Hệ quả: Tất cả các giờ làm thêm và các khoản tạm ứng lương từ các tháng trước, năm trước trong toàn bộ lịch sử làm việc của nhân viên sẽ **bị cộng dồn lũy kế liên tục vào phiếu lương của tháng hiện tại**.

---

### 3.12 Xung Đột Khóa Chính Audit Log (`last.id + 1`) Gây Rollback Giao Dịch Nghiệp Vụ

- **Tệp nguồn:** `src/platform/db.ts`, dòng 453–460
```typescript
    return await transaction(async () => {
      const last = await auditRepo.last();
      const row: Record<string, any> = { id: last ? last.id + 1 : 1, prev_hash: last ? last.hash : '', ...fields };
      const key = auditKey();
      row.hash = auditHash(row, key ? 'hmac-sha256' : 'sha256', key);
      await auditRepo.insert({ ...row, subject_uuid: subjectUuid, actor_uuid: actorUuid });
      return { id: row.id, hash: row.hash };
    });
```
- **Tệp nguồn:** `src/data/audit-log.repository.ts`, dòng 40–42
```typescript
  async last(): Promise<{ id: number; hash: string } | undefined> {
    return this.qb.selectFrom('audit_log').select(['id', 'hash']).orderBy('id', 'desc').limit(1).executeTakeFirst();
  }
```

**Phân tích cơ chế xung đột:**
Khóa chính `id` của bảng `audit_log` không được sinh tự động bởi PostgreSQL SEQUENCE hay IDENTITY, mà được tính toán thủ công trong bộ nhớ Node.js bằng biểu thức `last ? last.id + 1 : 1` dựa trên một câu lệnh `SELECT ... ORDER BY id DESC LIMIT 1` không khoá (`non-locking`).
Khi hai thao tác nghiệp vụ đồng thời (ví dụ: hai phê duyệt hoặc hai lượt dập thẻ) cùng ghi nhật ký audit:
1. Giao dịch A đọc được `last.id = 100`.
2. Giao dịch B đọc được `last.id = 100`.
3. Giao dịch A gán `row.id = 101` và chèn thành công.
4. Giao dịch B gán `row.id = 101` và chèn vào DB.
5. PostgreSQL phát hiện trùng khóa chính và ném lỗi `23505 (unique_violation)`.
Vì `auditStore.write` được gọi **bên trong** giao dịch nghiệp vụ của người gọi (`store.transaction`), lỗi vi phạm khóa chính của audit log lập tức khiến **toàn bộ giao dịch nghiệp vụ của người dùng bị ROLLBACK**, trả về lỗi 500 một cách ngẫu nhiên dưới tải cao.

---

### 3.13 Xung Đột Ràng Buộc Kỳ Lương Trên `payroll_runs` (`UNIQUE (month, run_no)`)

- **Tệp nguồn:** `src/data/payroll.repository.ts`, dòng 61–73
```typescript
  async nextRunNo(month: string): Promise<number> {
    const row = await this.qb
      .selectFrom('payroll_runs')
      .select(sql<number>`COALESCE(MAX(run_no), 0) + 1`.as('n'))
      .where('month', '=', month)
      .executeTakeFirstOrThrow();
    return Number(row.n);
  }
```
- **Ràng buộc lược đồ:** `migrations/postgres/0001_baseline.sql:110`: `UNIQUE (month, run_no)`.

**Phân tích kỹ thuật:**
Hàm `createRun` tính toán số thứ tự lần chạy `run_no` bằng truy vấn `COALESCE(MAX(run_no), 0) + 1`. Do không có khoá tư vấn bảo vệ trên `(month)` trước khi tính, nếu hai quản trị viên bấm nút tính lương kỳ `2026-11` gần như cùng lúc:
Cả hai giao dịch cùng nhận được `run_no = 1`. Giao dịch thứ hai cố gắng thực thi `INSERT INTO payroll_runs` sẽ bị sập với lỗi `23505 unique_violation: UNIQUE (month, run_no)`.

---

### 3.14 Nén Dữ Liệu Đồng Bộ Làm Nghẽn Event Loop & Cạn Kiệt Kết Nối Cơ Sở Dữ Liệu

- **Tệp nguồn:** `src/domain/period/periods.ts`, dòng 352–368
- **Tệp nguồn:** `src/platform/db.ts`, dòng 933–937
```typescript
// src/platform/db.ts:933
snapshot_gz: zlib.gzipSync(JSON.stringify(p.snapshot)),
```
**Phân tích kỹ thuật:**
Bên trong vòng lặp giao dịch tính lương nhân sự `store.transaction`, hệ thống duyệt qua từng nhân viên trong danh sách `inputs.people`. Với mỗi nhân viên, hàm `addPayslip` thực hiện `zlib.gzipSync(...)` để nén khối dữ liệu snapshot bằng thuật toán Gzip đồng bộ.
- `zlib.gzipSync` là tác vụ tiêu tốn CPU và **chặn đứng hoàn toàn luồng điều phối đơn (event loop) của Node.js** trong suốt thời gian nén.
- Kết nối PostgreSQL được mượn từ hồ bơi `pg.Pool` bị giữ liên tục trong trạng thái giao dịch mở (`open transaction`) qua hàng trăm chu kỳ nén đồng bộ.
- Với hồ bơi mặc định chỉ có 10 kết nối, các yêu cầu HTTP khác gửi tới máy chủ sẽ bị treo cứng chờ kết nối DB và không thể xử lý.

---

### 3.15 Thất Bại Xóa Bộ Nhớ Đệm Đa Tiến Trình Trong Mô Hình Cụm (Multi-Replica Deployment)

- **Tệp nguồn:** `src/ops/shared-cache.ts`, dòng 6–10
```typescript
// Số lần ghi đã chạy qua kết nối của TIẾN TRÌNH này kể từ lúc mở (PostgresDatabase.writes): tăng với mọi INSERT/UPDATE/DELETE. Chỉ đúng khi chạy MỘT
// tiến trình ứng dụng (như docker-compose.yml): ghi từ tiến trình khác không làm số này tăng, nên nhiều bản ứng dụng cùng một DB phải bỏ bộ nhớ đệm này.
const dataRevision = async () => store.db.writes;

export = { compute: new ComputeCache({ revision: dataRevision }), dataRevision };
```
- **Tệp nguồn:** `src/ops/compute-cache.ts`, dòng 37–52
```typescript
  async get(key?, compute?) {
    const rev = await this.revision();
    const at = this.now();
    const hit = this.entries.get(key);
    const age = hit ? at - hit.at : -1;
    if (hit && hit.rev === rev && age >= 0 && age < this.ttlMs) {
      this.hits++;
      return hit.value;
    }
    this.misses++;
    const value = await compute();
    this.entries.delete(key);
    if ((await this.revision()) === rev) this.entries.set(key, { rev, at, value });
    ...
```

**Phân tích kỹ thuật:**
Phiên bản dữ liệu của bộ nhớ đệm được neo theo biến đếm nội bộ tiến trình `store.db.writes`.
Trong các kiến trúc triển khai thực tế có nhiều bản sao ứng dụng (ví dụ: Kubernetes Pods, hoặc nhiều container sau Nginx/Load Balancer):
- Khi Tiến trình 1 thực hiện ghi sửa đổi bảng công hoặc lương, biến đếm `db.writes` của Tiến trình 2 không hề thay đổi.
- Tiến trình 2 tiếp tục phục vụ dữ liệu bảng lương và phê duyệt cũ rích từ bộ nhớ đệm cho tới khi hết hạn `ttlMs`.
- Ngoài ra, khi bộ nhớ đệm hết hạn, nhiều yêu cầu đồng thời cùng gọi `compute()` độc lập mà không có cơ chế khoá đơn chuyến (single-flight coalescing), gây ra hiện tượng sập dồn bộ nhớ đệm (Cache Stampede).

---

### 3.16 Ghi Đè Mù Nhân Viên Khi Trùng Username Trong `createEmployee`

- **Tệp nguồn:** `src/modules/employee-v2/employee-v2.service.ts`, dòng 204–241
```typescript
    await this.store.queryBuilder
      .insertInto('staff')
      .values(row)
      .onConflict((oc: any) =>
        oc.column('username').doUpdateSet({
          uuid: row.uuid,
          name: row.name,
          family_name: row.family_name,
          ...
        })
      )
      .execute();
```
**Phân tích kỹ thuật:**
Khi tạo nhân viên mới qua `POST /api/v2/employees`, hệ thống không kiểm tra sự tồn tại của `username`. Câu lệnh `INSERT` sử dụng điều khoản `ON CONFLICT (username) DO UPDATE SET uuid = row.uuid, ...`.
Nếu một quản trị viên vô tình nhập trùng `username` của nhân viên cũ:
1. Một UUID ngẫu nhiên mới được tạo ra.
2. Bản ghi nhân viên cũ bị ghi đè toàn bộ tên tuổi, mật khẩu, và thay thế UUID cũ bằng UUID mới.
3. Tất cả các bản ghi lịch sử của nhân viên cũ trong `timesheet_entries`, `punch_events`, `work_schedules`, và `system_requests` trỏ tới UUID cũ lập tức bị mồ côi hoặc gây lỗi vi phạm toàn vẹn khóa ngoại.

---

### 3.17 Mất Mát Cập Nhật Sửa Số Phiếu Lương (Lost Updates in Slip Overrides)

- **Tệp nguồn:** `src/platform/db.ts`, dòng 1316–1333
- **Tệp nguồn:** `src/data/payroll.repository.ts`, dòng 230–245
```typescript
// src/platform/db.ts:1316-1333
  async setSlipOverride(u?, month?, values?, by?, reason?, opts: any = {}) {
    return await transaction(async () => {
      const current = await module.exports.getSlipOverride(u, month);
      if (opts.expectedRev !== undefined && opts.expectedRev !== current.rev)
        throw storeError('SLIP_STALE', 'Số sửa trên phiếu đã được người khác đổi, tải lại rồi làm lại', 409, {
          rev: current.rev
        });
      await slipOverridesRepo.upsert(u, month, JSON.stringify(values), by || null, now(), reason == null ? null : String(reason));
      return await module.exports.getSlipOverride(u, month);
    });
  }
```
**Phân tích kỹ thuật:**
Hàm `getSlipOverride` thực hiện một câu truy vấn `SELECT` thông thường không có `FOR UPDATE`.
Khi hai kế toán cùng tải trang và mở giao diện sửa số phiếu của một nhân viên (cùng mang `expectedRev: 1`):
1. Cả hai giao dịch cùng đọc được `current.rev = 1`.
2. Cả hai cùng vượt qua điều kiện kiểm tra `opts.expectedRev !== current.rev`.
3. Cả hai cùng thực thi lệnh `upsert`. Trong `upsert`, PostgreSQL cập nhật `rev: sql<number>'slip_overrides.rev + 1'`.
4. Giao dịch cam kết sau cùng sẽ ghi đè toàn bộ nội dung sửa đổi của giao dịch trước mà không hề ném lỗi xung đột HTTP 409 `SLIP_STALE`.

---

### 3.18 Rủi Ro Thực Thi Nền: Hẹn Giờ Chồng Lấn, Purge Bảng Chết & Bão Nhịp Tim SSE

#### 1. Lời hứa trôi nổi & khoảng thời gian chồng lấn trong `LeaveAccountService`
- **Tệp nguồn:** `src/domain/leave/leave-account-service.ts`, dòng 83–92
```typescript
  start(intervalMs?) {
    const run = () => this.refreshAll();
    const first = setImmediate(run);
    const timer = setInterval(run, intervalMs);
    timer.unref();
    return () => {
      clearImmediate(first);
      clearInterval(timer);
    };
  }
```
*Phân tích*: `this.refreshAll()` là một hàm bất đồng bộ trả về một `Promise`. Callback `() => this.refreshAll()` không có `.catch()` hoặc `try/catch` bọc ngoài, dẫn tới nguy cơ Unhandled Promise Rejection làm sập tiến trình Node.js nếu `listStaff()` ném lỗi. Đồng thời, `setInterval` kích hoạt theo chu kỳ mà không kiểm tra xem tác vụ trước đã hoàn tất hay chưa; nếu tác vụ trước chạy kéo dài, nhiều chu kỳ `refreshAll` sẽ chạy chồng chéo đồng thời, gây đua ghi trên bảng `staff.leave_balance`.

#### 2. Định kỳ dọn dẹp trên bảng chết `punch_requests`
- **Tệp nguồn:** `src/main.ts`, dòng 41–52, 94
```typescript
async function schedulePunchRequestPurge(): Promise<void> {
  const purge = async () => {
    try {
      const removed = await store.purgePunchRequests(config.PUNCH_REQUEST_KEEP_DAYS);
      console.log(`Dọn bảng nhớ lượt chấm công: đã xoá ${removed} dòng cũ hơn ${config.PUNCH_REQUEST_KEEP_DAYS} ngày`);
    } catch (e) {
      console.error('Không dọn được bảng nhớ lượt chấm công:', (e as Error).message);
    }
  };
  await purge();
  setInterval(purge, config.PUNCH_REQUEST_PURGE_MS).unref();
}
```
*Phân tích*: Bảng `punch_requests` là tàn dư của cơ chế chấm công cũ, không còn bất kỳ endpoint nào ghi vào bảng này. Tiến trình này khởi động và lặp lại mỗi 24 giờ một câu lệnh `DELETE` vô nghĩa trên hạ tầng chết.

#### 3. Cạn kiệt hồ bơi kết nối cơ sở dữ liệu (Max 10, Không Timeout)
- **Tệp nguồn:** `src/data/postgres-database.ts`, dòng 32, 59, 285–298
Hồ bơi kết nối được khởi tạo với `max: 10`. Cấu hình không hề thiết lập `connectionTimeoutMillis` (mặc định là 0, nghĩa là chờ vô hạn), không có `statement_timeout`, và không có `idleTimeoutMillis`. Khi các giao dịch dài hạn (như tính lương hàng loạt hoặc quét đồng bộ) chiếm dụng kết nối, các yêu cầu HTTP tiếp theo sẽ bị kẹt vĩnh viễn trong hàng đợi chờ kết nối của `pg.Pool`.

#### 4. Bão truy vấn nhịp tim SSE cạnh tranh hồ bơi kết nối
- **Tệp nguồn:** `src/platform/events.ts`, dòng 161–175, 356–362
```typescript
async function heartbeat() {
  for (const conn of [...conns]) {
    let fresh: any = null;
    try {
      fresh = await conn.checkSession();
    } catch {
      fresh = null;
    }
    ...
```
```typescript
// conn.checkSession:
checkSession: opts.checkSession || (async () => {
  const user = await getAuth().readSession(cookie);
  return user && user === me.username ? await getStore().getStaff(user) : null;
})
```
*Phân tích*: Mỗi 25 giây một lần (`limits().heartbeatSec = 25`), hàm `heartbeat()` lặp qua toàn bộ danh sách kết nối SSE đang mở. Với mỗi kết nối, nó gọi `checkSession()` và thực thi một câu lệnh truy vấn cơ sở dữ liệu `SELECT * FROM staff WHERE username = ...`. Nếu có 200 nhân viên mở trình duyệt, nhịp tim SSE sẽ dội một cơn bão gồm 200 truy vấn cơ sở dữ liệu liên tiếp vào hồ bơi chỉ có 10 kết nối, gây nghẽn toàn bộ hệ thống.

---

## 4. Xác Minh Logic Thuần & Nhận Diện Mã Dư Thừa (Pure Logic Verification & Redundancy Detection)

### 4.1 Lỗ Hổng Leo Quyền & Mạo Danh Danh Tính Trong `RequestV2Controller`

- **Tệp nguồn:** `src/modules/request-v2/request-v2.controller.ts`, dòng 16–20, 134–135, 151–152
```typescript
  @Post('leave')
  async createLeave(@Ctx() c: ApiContext): Promise<unknown> {
    const body = (await readJson(c.req)) || {};
    try {
      const employeeId = body.employeeId || c.me?.uuid || c.me?.username;
      const request = await this.service.createLeaveRequest({ ...body, employeeId });
...
  @Patch(':id/review')
  async reviewRequest(@Ctx() c: ApiContext, @Param('id') paramId?: string): Promise<unknown> {
    const id = paramId || c.seg[3];
    const body = (await readJson(c.req)) || {};
    try {
      const reviewerId = body.reviewerId || c.me?.uuid || c.me?.username || 'system';
      const request = await this.service.reviewRequest(id, reviewerId, body.action, body.note);
```

**Phân tích logic:**
- Tại các endpoint tạo đơn (`leave`, `correction`, `overtime`, `advance`), controller lấy trực tiếp giá trị `body.employeeId` từ người dùng gửi lên. Nếu nhân viên A đăng nhập hợp lệ nhưng gửi `{ "employeeId": "uuid-cua-nhan-vien-B" }`, hệ thống sẽ tạo đơn dưới danh tính của nhân viên B mà không kiểm tra quyền hạn.
- Tương tự, tại endpoint duyệt đơn `reviewRequest`, controller chấp nhận `body.reviewerId` từ client, cho phép người duyệt giả mạo danh tính của Giám đốc hoặc Admin trong lịch sử kiểm toán của lá đơn.

---

### 4.2 Hệ Thống Dynamic Attributes Bị Vô Hiệu Hóa Hoàn Toàn (`src/params/attributes.ts`)

- **Tệp nguồn:** `src/params/attributes.ts` (295 dòng mã)
- **Tệp nguồn:** `src/engine/pay-tail-calc.ts`, dòng 46, 52–57
```typescript
  const UNAVAILABLE = Object.freeze({
    ...
    'insurance.base': Object.freeze(['insuranceAttr']),
  });

  for (const [key, values] of Object.entries<any>(UNAVAILABLE))
    if (Object.hasOwn(P, key) && values.includes(P[key]))
      throw tailError(
        `Tham số ${key}: phương án này chưa dùng được (chờ chủ dự án, kế toán hoặc pháp chế chốt)`,
        'PARAM_OPTION_UNAVAILABLE',
        key
      );
```
**Phân tích logic:**
Tệp `src/params/attributes.ts` gồm 295 dòng mã phức tạp phục vụ tính năng cho phép quản trị viên thêm các thuộc tính động vào bảng bậc lương. Tuy nhiên, trong công thức tính toán lương thực tế, phương án duy nhất sử dụng thuộc tính này (`insuranceAttr`) bị hàm `assertAvailable` chặn cứng với ngoại lệ `PARAM_OPTION_UNAVAILABLE`. Toàn bộ 295 dòng mã này là tính năng ngủ (dormant), không có giá trị nghiệp vụ thực tế nhưng vẫn gắn chặt vào các pipeline kiểm tra tham số.

---

### 4.3 Các Tệp Mồ Côi & Mã Thừa Trong Hệ Thống

1. **`src/domain/position/seed-data.ts` (38 dòng)**:
   - Xuất khẩu các đối tượng hằng số `TYPE_NAMES`, `LEVEL_NAMES`, `SHIFTS`.
   - Kết quả tìm kiếm toàn diện trong `src/` cho thấy tệp này **có 0 lượt import** (chỉ xuất hiện trong một đoạn chú thích giải thích tại `src/engine/punch.ts:32`). Dữ liệu khởi tạo đã được chuyển sang `migrations/postgres/0002_seed.sql`.
2. **`src/engine/attendance-status.ts` (62 dòng)**:
   - Định nghĩa lớp và các hàm chuyển đổi nhãn trạng thái chấm công (`LABEL`, `DAY_ORDER`, `statusOf`, `dayStatus`).
   - Kết quả tìm kiếm toàn diện cho thấy tệp này **có 0 lượt import** trong toàn bộ các controller, service, hay repository của `src/`.
3. **`src/domain/payroll/payroll-service.ts` (3 dòng)**:
   ```typescript
   'use strict';
   module.exports = require('../../params/payroll-preview');
   ```
   Tệp này chỉ đơn thuần là một vỏ bọc chuyển tiếp 3 dòng mã nạp lại `payroll-preview.ts`, phản ánh nợ tái cấu trúc chưa hoàn tất từ giai đoạn G4.

---

## 5. Lộ Trình Khắc Phục Kiến Trúc & Khuyến Nghị Ưu Tiên (Architectural Remediation Roadmap & Prioritized Recommendations)

Quá trình khắc phục cần được thực hiện tuần tự theo 4 giai đoạn ưu tiên nghiêm ngặt để đảm bảo an toàn dữ liệu và tính ổn định của hệ thống:

```
┌────────────────────────────────────────────────────────────────────────┐
│ Giai đoạn 1: Thống Nhất Lược Đồ & Dọn Dẹp Mã Thừa (P0 - Tuần 1)        │
│ ├─ Sửa lỗi `${month}-31` DATE & bỏ bọc rỗng catch trong Payroll V2     │
│ ├─ Thêm filter ngày tháng cho `system_requests` trong Payroll V2       │
│ ├─ Viết lại input pipeline của `periods.calculate` sang bảng V2        │
│ └─ Xóa bỏ LegacySchema và 12 bảng ảo; chuyển đổi các endpoint ghi      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ Giai đoạn 2: Khung Khoá Phân Tán & An Toàn Đồng Thời (P0 - Tuần 2)     │
│ ├─ Sửa `AdvisoryLocks` buộc phải chạy trong `store.transaction`        │
│ ├─ Bọc giao dịch & Advisory Lock cho toàn bộ thao tác V2 (Request/Att)  │
│ ├─ Thêm exclusion constraint chống trùng đơn nghỉ phép                 │
│ ├─ Sửa `saveTimesheet` không ghi đè `is_locked = true`                 │
│ └─ Chuyển sinh ID `audit_log` và `run_no` sang PostgreSQL SEQUENCE    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ Giai đoạn 3: Đối Soát API & Hoàn Thiện Nghiệp Vụ V2 (P1 - Tuần 3)      │
│ ├─ Bổ sung cấu hình ủy quyền cho `v2/payroll` trong `authz.ts`        │
│ ├─ Triển khai lưu trữ kết quả tính lương V2 vào `payroll_runs`         │
│ ├─ Sửa lỗi xóa nhân viên trong `EmployeeV2Controller`                  │
│ ├─ Thay thế các stub giả mạo trong `UiBridgeController` bằng mã thật    │
│ └─ Khắc phục các hằng số cứng và công thức lương V2 theo chuẩn BLLĐ    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ Giai đoạn 4: Gia Cố Vận Hành & Khả Năng Chịu Tải (P2 - Tuần 4)         │
│ ├─ Nâng cấp cấu hình `pg.Pool` (tăng size, thêm connection timeout)    │
│ ├─ Chuyển `zlib.gzipSync` sang bất đồng bộ ngoài giao dịch DB          │
│ ├─ Tối ưu nhịp tim SSE tránh bão truy vấn database định kỳ             │
│ └─ Thay bộ đếm cache tiến trình bằng cơ chế phân tán hoặc vô hiệu hóa  │
└────────────────────────────────────────────────────────────────────────┘
```

### Chi Tiết Kỹ Thuật Từng Giai Đoạn

#### Giai Đoạn 1: Thống Nhất Lược Đồ & Khôi Phục Dữ Liệu Tính Lương (P0 - Khẩn Cấp)
1. **Khắc phục lỗi ngày cuối tháng trong `PayrollV2Repository`**:
   Thay thế `${month}-31` bằng hàm tính ngày cuối tháng chính xác:
   ```typescript
   const [year, mon] = month.split('-').map(Number);
   const lastDay = new Date(Date.UTC(year, mon, 0)).getUTCDate();
   const endDate = `${month}-${String(lastDay).padStart(2, '0')}`;
   ```
   Loại bỏ hoàn toàn khối `catch {}` rỗng trong `PayrollV2Service.generatePeriodPayslips` và thêm cơ chế ghi nhận lỗi chi tiết theo từng nhân viên.
2. **Khắc phục truy vấn tích lũy vô tận yêu cầu**:
   Sửa truy vấn `system_requests` trong `PayrollV2Repository.getMonthlyData` để lọc chính xác theo tháng:
   ```typescript
   .where(eb => eb.or([
     eb.and([eb('type', '=', 'OVERTIME'), eb('ot_date', '>=', startDate), eb('ot_date', '<=', endDate)]),
     eb.and([eb('type', '=', 'ADVANCE'), eb('advance_period', '=', month)])
   ]))
   ```
3. **Nối lại luồng tính lương chính thức V1 sang bảng V2**:
   Viết lại `src/params/payroll-preview.ts` (`loadInputs`) để đọc dữ liệu công từ `timesheet_entries` và `punch_events` thay vì đọc từ các bảng đã bị DROP `timesheets` và `attendance_sessions`.
4. **Xóa sổ `LegacySchema`**:
   Viết lại các repository cũ (`attendance.repository.ts`, `catalog.repository.ts`, `advance-approvals.repository.ts`) để thao tác trên các bảng V2 tương đương hoặc chuyển hướng toàn bộ sang các service V2.

#### Giai Đoạn 2: Khung Khoá Phân Tán & Bảo Vệ Đồng Thời (P0 - Khẩn Cấp)
1. **Sửa đổi cơ chế khoá tư vấn `AdvisoryLocks`**:
   Thêm kiểm tra bắt buộc phải có giao dịch đang mở:
   ```typescript
   export class AdvisoryLocks {
     async acquire(key: string): Promise<void> {
       if (!this.driver.isInTransaction()) {
         throw new Error(`Advisory lock for key '${key}' cannot be acquired outside an active transaction.`);
       }
       await sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`.execute(this.qb);
     }
   }
   ```
2. **Tuần tự hóa luồng phê duyệt đơn (`reviewRequest`)**:
   Bao bọc toàn bộ phương thức `reviewRequest` trong `store.transaction`, xin khoá `store.lock(`request:${id}`)`, và sử dụng kiểm tra phiên bản lạc quan (`rev`) trên bảng `system_requests`.
3. **Bổ sung ràng buộc cơ sở dữ liệu chống trùng đơn**:
   Thêm chỉ mục loại trừ trong PostgreSQL cho khoảng thời gian nghỉ phép của nhân viên:
   ```sql
   ALTER TABLE system_requests ADD CONSTRAINT exclude_overlapping_leaves
   EXCLUDE USING gist (employee_id WITH =, daterange(leave_start_date, leave_end_date, '[]') WITH &&)
   WHERE (status IN ('PENDING', 'APPROVED') AND type = 'LEAVE');
   ```
4. **Bảo vệ tính toàn vẹn trạng thái khoá kỳ công (`is_locked`)**:
   Sửa câu lệnh `ON CONFLICT DO UPDATE` trong `AttendanceV2Repository.saveTimesheet`:
   ```typescript
   is_locked: eb.ref('timesheet_entries.is_locked'), // Giữ nguyên trạng thái khoá của DB, không cho phép ghi đè
   ```
5. **Chuyển sinh ID Audit Log và Payroll Run sang PostgreSQL SEQUENCE**:
   Chuyển cột `audit_log.id` sang `BIGINT GENERATED ALWAYS AS IDENTITY` và loại bỏ hoàn toàn biểu thức `last.id + 1` trong bộ nhớ. Sử dụng `pg_advisory_xact_lock` trên mã băm của `month` khi tính số thứ tự lần chạy lương `run_no`.

#### Giai Đoạn 3: Đối Soát API & Hoàn Thiện Nghiệp Vụ V2 (P1 - Trọng Tâm)
1. **Khai thông tuyến đường cho `PayrollV2Controller`**:
   Bổ sung ánh xạ trong `src/platform/authz.ts:310–330` cho `v2/payroll` và cấu hình quyền hạn trong `ROUTE_CAPS`:
   ```typescript
   'POST /v2/payroll/:month/calculate': write(readCap('payroll.write')),
   'GET /v2/payroll/:month/summary': readCap('payroll.read'),
   'GET /v2/payroll/:month/employees/:employeeId': readCap('payroll.read'),
   ```
2. **Lưu trữ kết quả tính lương V2**:
   Bổ sung phương thức trong `PayrollV2Repository` để lưu trữ kết quả của `EmployeePayslip` vào bảng `payroll_runs` và `payslips`, cho phép kế toán phê duyệt và xuất phiếu lương chính thức.
3. **Sửa lỗi xóa nhân viên**:
   Bổ sung phương thức `delete(username: string)` trong `EmployeeV2Service`. Thay vì xóa cứng gây vi phạm khóa ngoại, triển khai cơ chế xóa mềm (Soft Delete) bằng cách đặt cờ `contract_status = 'resigned'` và `locked_at = now()`.
4. **Hiện thực hóa các stub giả mạo trong `UiBridgeController`**:
   Triển khai mã xử lý thật sự cho `PUT /sheet/bulk` (chuyển đổi và lưu vào `timesheet_entries`) và `PUT /staff/shift-bulk` (cập nhật bảng `staff` và `work_schedules`).
5. **Chuẩn hóa công thức lương theo Bộ luật Lao động**:
   Tách biệt rõ ràng các mức hệ số làm thêm 150%, 200%, 300%; đồng bộ phụ cấp ca theo danh mục vị trí; gỡ bỏ các hằng số khấu trừ ma thuật (`-16827`, `+34615`); và kiểm tra điều kiện đóng bảo hiểm của nhân sự trước khi trích nộp.

#### Giai Đoạn 4: Gia Cố Vận Hành & Tối Ưu Chịu Tải (P2 - Ổn Định)
1. **Tối ưu hóa kết nối cơ sở dữ liệu**:
   Nâng cấu hình hồ bơi `pg.Pool` lên `max: 30`, thiết lập `connectionTimeoutMillis: 5000` và `idleTimeoutMillis: 30000`.
2. **Nén dữ liệu bất đồng bộ ngoài giao dịch**:
   Chuyển `zlib.gzipSync` sang `util.promisify(zlib.gzip)`, thực hiện nén dữ liệu snapshot song song trong bộ nhớ trước khi mở giao dịch cơ sở dữ liệu ghi hàng loạt (`bulk insert`).
3. **Khắc phục bão nhịp tim SSE**:
   Tách việc kiểm tra phiên người dùng ra khỏi nhịp tim ping định kỳ, hoặc sử dụng bộ nhớ cache có TTL 60 giây cho thông tin nhân sự để tránh truy vấn trực tiếp cơ sở dữ liệu mỗi 25 giây cho từng kết nối.
4. **Vô hiệu hóa bộ đếm cache nội bộ tiến trình**:
   Vô hiệu hóa `store.db.writes` trong các môi trường đa tiến trình/container hoặc thay thế bằng cơ chế vô hiệu hóa cache qua PostgreSQL `LISTEN/NOTIFY` hoặc Redis.
