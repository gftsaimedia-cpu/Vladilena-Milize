# Attendance, Shift Scheduling and Request Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây dựng hệ thống phân ca làm việc (`work_schedules`), chấm công theo cửa sổ thời gian ($[-15', +15']$ khi vào, $[0, +30']$ khi ra), tự động gắn cờ vi phạm kích hoạt giải trình (`NEEDS_EXPLANATION`) và đồng bộ các yêu cầu đã duyệt (đổi ca, nghỉ làm bù, tăng ca) vào lịch làm việc.

**Architecture:** Sử dụng mô hình Bảng phân ca cứng (`work_schedules`) làm nguồn chân lý duy nhất cho giờ ca mục tiêu mỗi ngày. `DailyTimesheet.calculate()` đối soát các sự kiện quẹt thẻ thực tế (`punch_events`) với `work_schedules` để xác định cờ check-in (`VALID`, `EARLY`, `LATE`, `MISSED`), cờ check-out (`VALID`, `EARLY`, `LATE_WITHOUT_OT`, `MISSED`) và trạng thái ngày công (`IN_PROGRESS`, `VALID`, `NEEDS_EXPLANATION`, `ON_LEAVE`). Khi `system_requests` được duyệt (`APPROVED`), một hook đồng bộ sẽ cập nhật trực tiếp vào `work_schedules`.

**Tech Stack:** TypeScript, PostgreSQL 16, Kysely, NestJS, Node.js Test Runner (`node:test`).

**Spec:** [`docs/superpowers/specs/2026-11-03-attendance-and-shift-scheduling-design.md`](file:///C:/Users/52.AI%20UD/Vladilena-Milize/docs/superpowers/specs/2026-11-03-attendance-and-shift-scheduling-design.md)

---

## Global Constraints

- Không sử dụng các biến legacy: cấm dùng `workUnits` (0, 0.5, 1.0 công cứng), `shift_code`, `night_pct`, `leave_adjust`.
- Tên biến và trường database 100% tiếng Anh chuẩn snake_case trong SQL và camelCase trong TypeScript.
- Cửa sổ Check-in hợp lệ: $[T_{vào} - 15', T_{vào} + 15']$. Trước 15' là `EARLY`, sau 15' là `LATE`, quá 30' không bấm là `MISSED`.
- Cửa sổ Check-out hợp lệ: $[T_{ra}, T_{ra} + 30']$. Trước $T_{ra}$ là `EARLY`, sau 30' không có đơn OT là `LATE_WITHOUT_OT`, quá 30' không bấm là `MISSED`.
- Bất kỳ vi phạm nào đều đưa `day_status` về `NEEDS_EXPLANATION`.
- Giữ nguyên cơ sở dữ liệu thật PostgreSQL (`luong_local` trên cổng 5432).

---

## Review Focus

1. **Check-in sau 30 phút:** Nhân viên bấm quẹt thẻ vào lúc $T_{vào} + 45'$ $\rightarrow$ Phải phân loại là `LATE` kèm số phút trễ là 45 phút và kích hoạt `NEEDS_EXPLANATION`, không được nuốt mất bản ghi quẹt thẻ.
2. **Ca đang diễn ra (Mid-shift Evaluation):** Nhân viên vừa check-in lúc 08:05 cho ca 08:00 - 17:00 $\rightarrow$ `check_out_status` phải là `PENDING`, `day_status` phải là `IN_PROGRESS`, không được tự ý phán xét là `MISSED` check-out khi chưa hết ca.
3. **Nghỉ kèm cam kết làm bù:** Đơn duyệt ngày nghỉ 01/11 và ngày làm bù 03/11 khung 08:00 - 22:00 $\rightarrow$ Ngày 01/11 lịch có trạng thái `ON_LEAVE`; ngày 03/11 lịch có khung $[08:00, 22:00]$. Nếu ngày 03/11 nhân viên về lúc 17:00 $\rightarrow$ Phải phân loại là `EARLY` check-out và đưa vào diện `NEEDS_EXPLANATION`.
4. **Về muộn quá 30 phút không có đơn OT:** Tan ca lúc 17:00, nhân viên quẹt thẻ về lúc 18:00 mà không có đơn OT được duyệt $\rightarrow$ Phải phân loại là `LATE_WITHOUT_OT`, kích hoạt `NEEDS_EXPLANATION`, không được tính giờ OT tự do.
5. **Đơn OT được duyệt:** Đơn duyệt OT từ 17:00 đến 21:00 $\rightarrow$ Mốc $T_{ra}$ của lịch tự động chuyển thành 21:00. Nhân viên quẹt thẻ về trong khoảng $[21:00, 21:30]$ là `VALID`.

---

## Task Breakdown

### Task 1: Database Schema & Generated Types

**Files:**
- Modify: `migrations/postgres/0001_baseline.sql`
- Test: `test/unit/db-types.test.ts`
- Script: `scripts/dev/reset-and-seed.ts`

**Interfaces:**
- Produces: Bảng `work_schedules`, mở rộng bảng `system_requests` (các cột `new_shift_type`, `new_start_time`, `new_end_time`, `makeup_start_time`, `makeup_end_time`), mở rộng bảng `timesheet_entries` (`check_in_status`, `check_out_status`, `day_status`).

- [ ] **Step 1: Cập nhật định nghĩa DDL trong `migrations/postgres/0001_baseline.sql`**
  - Thêm `CREATE TABLE work_schedules (...)` với các cột: `id UUID`, `employee_id TEXT REFERENCES staff(uuid)`, `work_date DATE`, `shift_type TEXT`, `planned_start_time TIME`, `planned_end_time TIME`, `approved_ot_hours REAL`, `schedule_type TEXT`, `status TEXT`, `source_request_id UUID`, `created_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ`.
  - Mở rộng `system_requests`: thêm `new_shift_type TEXT`, `new_start_time TEXT`, `new_end_time TEXT`, `makeup_start_time TEXT`, `makeup_end_time TEXT`.
  - Mở rộng `timesheet_entries`: thêm `check_in_status TEXT NOT NULL DEFAULT 'PENDING'`, `check_out_status TEXT NOT NULL DEFAULT 'PENDING'`, `day_status TEXT NOT NULL DEFAULT 'IN_PROGRESS'`.

- [ ] **Step 2: Sinh lại TypeScript types cho Kysely**
  - Chạy: `node scripts/dev/ts.cjs scripts/docs/gen-db-types.ts`
  - Đảm bảo `src/data/schema.generated.ts` khớp với migration mới.

- [ ] **Step 3: Chạy test db-types**
  - Chạy: `node scripts/dev/ts.cjs --test test/unit/db-types.test.ts`
  - Kết quả mong muốn: PASS.

- [ ] **Step 4: Cập nhật và chạy script reset DB thật**
  - Cập nhật `scripts/dev/reset-and-seed.ts` để nạp dữ liệu mẫu lịch làm việc `work_schedules`.
  - Chạy: `node scripts/dev/ts.cjs scripts/dev/reset-and-seed.ts`
  - Kết quả mong muốn: Tạo thành công 22 bảng trong PostgreSQL container, không có lỗi.

- [ ] **Step 5: Commit**
  - `git add migrations/postgres/0001_baseline.sql src/data/schema.generated.ts scripts/dev/reset-and-seed.ts`
  - `git commit -m "feat(db): add work_schedules table and request schedule extensions"`

---

### Task 2: Domain Entity `WorkSchedule` & Enums

**Files:**
- Create: `src/domain/attendance-v2/work-schedule.ts`
- Modify: `src/domain/attendance-v2/index.ts`
- Test: `test/unit/attendance-v2-work-schedule.test.ts`

**Interfaces:**
- Produces:
  - `export type ShiftType = 'NORMAL' | 'FLEX' | 'NIGHT' | 'CUSTOM'`
  - `export type ScheduleType = 'REGULAR' | 'SHIFT_CHANGE' | 'MAKE_UP' | 'OVERTIME'`
  - `export type ScheduleStatus = 'PLANNED' | 'COMPLETED' | 'ON_LEAVE' | 'CANCELLED'`
  - `export type CheckInStatus = 'VALID' | 'EARLY' | 'LATE' | 'MISSED' | 'PENDING'`
  - `export type CheckOutStatus = 'VALID' | 'EARLY' | 'LATE_WITHOUT_OT' | 'MISSED' | 'PENDING'`
  - `export type DayStatus = 'PLANNED' | 'IN_PROGRESS' | 'VALID' | 'NEEDS_EXPLANATION' | 'ON_LEAVE'`
  - `export class WorkSchedule { ... }`

- [ ] **Step 1: Viết test cho `WorkSchedule` entity**
  - Tạo `test/unit/attendance-v2-work-schedule.test.ts` kiểm tra:
    - Khởi tạo `WorkSchedule` hợp lệ với các trường planned_start_time, planned_end_time.
    - Tính năng `withShiftChange(...)`, `withMakeUp(...)`, `withOvertime(...)`.
    - Chặn dữ liệu không hợp lệ (giờ không đúng định dạng HH:mm, start >= end với ca ngày).

- [ ] **Step 2: Chạy test để xác nhận FAIL**
  - Chạy: `node scripts/dev/ts.cjs --test test/unit/attendance-v2-work-schedule.test.ts`
  - Kết quả mong muốn: FAIL do chưa có file `work-schedule.ts`.

- [ ] **Step 3: Cài đặt `WorkSchedule` trong `src/domain/attendance-v2/work-schedule.ts`**
  - Định nghĩa class `WorkSchedule` bất biến, có đầy đủ các hàm factory và converter (`toRow`, `fromRow`, `toJSON`).
  - Export từ `src/domain/attendance-v2/index.ts`.

- [ ] **Step 4: Chạy lại test**
  - Chạy: `node scripts/dev/ts.cjs --test test/unit/attendance-v2-work-schedule.test.ts`
  - Kết quả mong muốn: PASS.

- [ ] **Step 5: Commit**
  - `git add src/domain/attendance-v2/ test/unit/attendance-v2-work-schedule.test.ts`
  - `git commit -m "feat(attendance-v2): add WorkSchedule domain entity and status enums"`

---

### Task 3: Repository for `WorkSchedule`

**Files:**
- Modify: `src/data/attendance-v2.repository.ts`
- Test: `test/unit/attendance-v2-repository.test.ts`

**Interfaces:**
- Consumes: `WorkSchedule` from Task 2.
- Produces:
  - `saveSchedule(schedule: WorkSchedule): Promise<void>`
  - `findSchedule(employeeId: string, workDate: string): Promise<WorkSchedule | null>`
  - `findSchedules(employeeId: string, startDate: string, endDate: string): Promise<WorkSchedule[]>`
  - `ensureDefaultSchedule(employeeId: string, workDate: string): Promise<WorkSchedule>`

- [ ] **Step 1: Viết test repository cho `WorkSchedule`**
  - Thêm test trong `test/unit/attendance-v2-repository.test.ts` kiểm thử lưu lịch, tìm lịch theo ngày và tạo lịch mặc định từ profile nhân viên.

- [ ] **Step 2: Chạy test để xác nhận FAIL**
  - Chạy: `node scripts/dev/ts.cjs --test test/unit/attendance-v2-repository.test.ts`
  - Kết quả mong muốn: FAIL.

- [ ] **Step 3: Cài đặt các phương thức repository trong `src/data/attendance-v2.repository.ts`**
  - Triển khai `saveSchedule`, `findSchedule`, `findSchedules`.
  - Triển khai `ensureDefaultSchedule`: nếu ngày đó chưa có dòng trong `work_schedules`, tự động query ca mặc định từ `staff` (`shift_type`, `shift_start_time`, `shift_end_time`) để tạo và lưu dòng `work_schedules` với `schedule_type = 'REGULAR'`.

- [ ] **Step 4: Chạy lại test**
  - Chạy: `node scripts/dev/ts.cjs --test test/unit/attendance-v2-repository.test.ts`
  - Kết quả mong muốn: PASS.

- [ ] **Step 5: Commit**
  - `git add src/data/attendance-v2.repository.ts test/unit/attendance-v2-repository.test.ts`
  - `git commit -m "feat(attendance-v2): add schedule persistence methods to repository"`

---

### Task 4: Refactor `DailyTimesheet` with Schedule & Window of Validity

**Files:**
- Modify: `src/domain/attendance-v2/daily-timesheet.ts`
- Modify: `src/domain/attendance-v2/work-metrics.ts`
- Test: `test/unit/attendance-v2-domain.test.ts`

**Interfaces:**
- Consumes: `WorkSchedule`, `CheckInStatus`, `CheckOutStatus`, `DayStatus` from Task 2.
- Produces: `DailyTimesheet.calculate(punches: PunchEvent[], schedule: WorkSchedule, now?: Date): DailyTimesheet`

- [ ] **Step 1: Viết unit tests kiểm thử các kịch bản cửa sổ chấm công**
  - Test case 1: Check-in lúc 07:55 ca 08:00 $\rightarrow$ `check_in_status = 'VALID'`.
  - Test case 2: Check-in lúc 07:40 ca 08:00 $\rightarrow$ `check_in_status = 'EARLY'` $\rightarrow$ `day_status = 'NEEDS_EXPLANATION'`.
  - Test case 3: Check-in lúc 08:20 ca 08:00 $\rightarrow$ `check_in_status = 'LATE'`, `late_minutes = 20` $\rightarrow$ `day_status = 'NEEDS_EXPLANATION'`.
  - Test case 4: Quá 08:30 không có quẹt thẻ vào $\rightarrow$ `check_in_status = 'MISSED'` $\rightarrow$ `day_status = 'NEEDS_EXPLANATION'`.
  - Test case 5: Đang trong ca (now = 12:00) sau khi đã vào đúng giờ $\rightarrow$ `check_out_status = 'PENDING'`, `day_status = 'IN_PROGRESS'`.
  - Test case 6: Check-out lúc 16:50 ca 17:00 $\rightarrow$ `check_out_status = 'EARLY'`, `early_minutes = 10` $\rightarrow$ `day_status = 'NEEDS_EXPLANATION'`.
  - Test case 7: Check-out lúc 17:15 ca 17:00 $\rightarrow$ `check_out_status = 'VALID'`.
  - Test case 8: Check-out lúc 18:00 ca 17:00 không có đơn OT $\rightarrow$ `check_out_status = 'LATE_WITHOUT_OT'` $\rightarrow$ `day_status = 'NEEDS_EXPLANATION'`.
  - Test case 9: Có đơn OT duyệt đến 21:00, check-out lúc 21:10 $\rightarrow$ `check_out_status = 'VALID'`, `ot_hours = 4.0`.
  - Test case 10: Ca làm bù 08:00 - 22:00, check-out lúc 17:00 $\rightarrow$ `check_out_status = 'EARLY'`, `early_minutes = 300` $\rightarrow$ `day_status = 'NEEDS_EXPLANATION'`.

- [ ] **Step 2: Chạy test để xác nhận FAIL**
  - Chạy: `node scripts/dev/ts.cjs --test test/unit/attendance-v2-domain.test.ts`
  - Kết quả mong muốn: FAIL do chưa cập nhật `calculate()`.

- [ ] **Step 3: Triển khai thuật toán tính toán mới trong `DailyTimesheet.calculate()`**
  - Sử dụng mốc giờ từ `schedule.plannedStartTime` và `schedule.plannedEndTime`.
  - Áp dụng các quy tắc cửa sổ thời gian nghiêm ngặt theo Spec §4.2.
  - Gán chính xác các cờ trạng thái `checkInStatus`, `checkOutStatus`, `dayStatus`.

- [ ] **Step 4: Chạy lại test**
  - Chạy: `node scripts/dev/ts.cjs --test test/unit/attendance-v2-domain.test.ts`
  - Kết quả mong muốn: PASS 100%.

- [ ] **Step 5: Commit**
  - `git add src/domain/attendance-v2/daily-timesheet.ts test/unit/attendance-v2-domain.test.ts`
  - `git commit -m "feat(attendance-v2): refactor timesheet calculation with window of validity"`

---

### Task 5: Request Synchronization to Schedule

**Files:**
- Modify: `src/domain/request-v2/system-request.ts`
- Modify: `src/domain/request-v2/types.ts`
- Modify: `src/modules/request-v2/request-v2.service.ts`
- Test: `test/unit/request-v2-service.test.ts`

**Interfaces:**
- Consumes: `WorkSchedule`, `AttendanceV2Repository` from Task 3.
- Produces: `reviewRequest(id, reviewerId, action, note)` đồng bộ sang `work_schedules`.

- [ ] **Step 1: Viết unit tests kiểm thử đồng bộ Request sang Schedule**
  - Test đơn `SHIFT_CHANGE`: duyệt đổi ca sang 06:00 - 15:00 $\rightarrow$ kiểm tra `work_schedules` ngày đó cập nhật đúng giờ mới và `schedule_type = 'SHIFT_CHANGE'`.
  - Test đơn `LEAVE_WITH_MAKEUP`: duyệt nghỉ ngày A, bù ngày B 08:00 - 22:00 $\rightarrow$ kiểm tra ngày A có `status = 'ON_LEAVE'`, ngày B có `schedule_type = 'MAKE_UP'` với giờ 08:00 - 22:00.
  - Test đơn `OVERTIME`: duyệt OT 3h từ 17:00 đến 20:00 $\rightarrow$ kiểm tra ngày đó có `planned_end_time = '20:00'` và `approved_ot_hours = 3.0`.
  - Test đơn `LEAVE`: duyệt nghỉ phép $\rightarrow$ kiểm tra ngày đó có `status = 'ON_LEAVE'`.

- [ ] **Step 2: Chạy test để xác nhận FAIL**
  - Chạy: `node scripts/dev/ts.cjs --test test/unit/request-v2-service.test.ts`
  - Kết quả mong muốn: FAIL.

- [ ] **Step 3: Triển khai logic đồng bộ trong `RequestV2Service.reviewRequest`**
  - Cập nhật domain `SystemRequest` để lưu trữ các trường mở rộng của ca đổi và làm bù.
  - Khi action là `'APPROVE'`, tiêm `AttendanceV2Repository` để cập nhật `work_schedules` theo Spec §4.4.

- [ ] **Step 4: Chạy lại test**
  - Chạy: `node scripts/dev/ts.cjs --test test/unit/request-v2-service.test.ts`
  - Kết quả mong muốn: PASS.

- [ ] **Step 5: Commit**
  - `git add src/domain/request-v2/ src/modules/request-v2/ test/unit/request-v2-service.test.ts`
  - `git commit -m "feat(request-v2): synchronize approved requests to work_schedules"`

---

### Task 6: End-to-End Attendance Service & Verification

**Files:**
- Modify: `src/modules/attendance-v2/attendance-v2.service.ts`
- Modify: `src/modules/attendance-v2/attendance-v2.controller.ts`
- Test: `test/unit/attendance-v2-service.test.ts`
- Script: `scripts/dev/reset-and-seed.ts`

**Interfaces:**
- Consumes: Tất cả các thành phần từ Task 1 đến Task 5.
- Produces: API hoạt động hoàn chỉnh, đáp ứng toàn bộ luồng chấm công & phân ca.

- [ ] **Step 1: Viết test tích hợp service cho toàn bộ luồng**
  - Cập nhật `test/unit/attendance-v2-service.test.ts` kiểm thử:
    - Quẹt thẻ vào ca bình thường $\rightarrow$ lấy lịch mặc định $\rightarrow$ trả về timesheet với cờ hợp lệ.
    - Quẹt thẻ khi có đơn đổi ca $\rightarrow$ lấy lịch đã đổi ca $\rightarrow$ trả về kết quả chuẩn theo giờ mới.
    - Quẹt thẻ khi có đơn làm bù $\rightarrow$ lấy lịch làm bù $\rightarrow$ về sớm bị cờ `EARLY` và `NEEDS_EXPLANATION`.

- [ ] **Step 2: Cập nhật `AttendanceV2Service.recordPunch`**
  - Trong `recordPunch`:
    1. Gọi `repo.ensureDefaultSchedule(employeeId, workDate)` để lấy hoặc tạo lịch của ngày.
    2. Nếu lịch có `status === 'ON_LEAVE'` $\rightarrow$ Không cho chấm công (báo lỗi ngày nghỉ).
    3. Lưu `PunchEvent`.
    4. Lấy tất cả punches trong ngày và gọi `timesheet.calculate(punches, schedule)`.
    5. Lưu `timesheet` và trả về kết quả.

- [ ] **Step 3: Chạy toàn bộ test suites**
  - Chạy: `node scripts/dev/ts.cjs --test "test/unit/*v2*.test.ts"`
  - Kết quả mong muốn: Tất cả test V2 đều PASS 100%.

- [ ] **Step 4: Chạy Typecheck & Spec Check**
  - Chạy: `node scripts/docs/gen-spec.ts`
  - Chạy: `npm.cmd run typecheck`
  - Chạy: `npm.cmd run spec:check`
  - Kết quả mong muốn: Không có lỗi type, spec khớp mã nguồn.

- [ ] **Step 5: Commit**
  - `git add src/modules/attendance-v2/ test/unit/attendance-v2-service.test.ts spec/reference/`
  - `git commit -m "feat(attendance-v2): complete schedule-driven punch processing and validation"`
