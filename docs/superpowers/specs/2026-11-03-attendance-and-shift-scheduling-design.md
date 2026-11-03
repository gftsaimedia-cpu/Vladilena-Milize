# Thiết Kế Hệ Thống Phân Ca, Chấm Công Và Yêu Cầu V2 (Attendance, Shift Scheduling & Request Reconciliation)

**Ngày lập:** 2026-11-03  
**Tác giả:** Pair programming giữa Người dùng và Antigravity  
**Trạng thái:** Chờ phê duyệt (Pending Approval)

---

## 1. Bối cảnh & Lý do (Intent & The Why)

Hệ thống chấm công cũ và bản phác thảo ban đầu của V2 mắc phải các nhược điểm nghiêm trọng:
- **Tư duy chắp vá từ bản cũ:** Giữ lại các khái niệm gượng ép như `workUnits` (0, 0.5, 1.0 công), gán cứng ca `NORMAL/FLEX/NIGHT` kèm phụ cấp phần trăm cố định, tên biến lộn xộn nửa nạc nửa mỡ (`shift_code`, `night_pct`, `leave_adjust`).
- **Phân mảnh (Silo):** Chấm công (`punch_events` $\rightarrow$ `timesheet_entries`) và Yêu cầu (`system_requests`) hoàn toàn tách biệt. Chấm công tự ý tính giờ làm thêm (OT) chỉ bằng cách lấy giờ checkout trừ 17:00, trong khi đơn xin OT được duyệt thì không hề tác động đến bảng công.
- **Thiếu quy tắc cửa sổ giờ:** Không kiểm soát được giờ vào sớm, vào trễ, ra sớm hay quên bấm thẻ.

**Mục tiêu của thiết kế này:** Xây dựng một luồng chuẩn nghiệp vụ thực tế:
1. Có bảng phân ca làm việc rõ ràng (`work_schedules`).
2. Mọi biến động ca (Đổi ca, Nghỉ làm bù, Tăng ca) đều thông qua Request được phê duyệt và cập nhật trực tiếp vào lịch làm việc.
3. Chấm công kiểm tra lượt quẹt thẻ theo quy tắc cửa sổ thời gian nghiêm ngặt ($[-15', +15']$ khi vào, $[0, +30']$ khi ra).
4. Phân loại cờ vi phạm chính xác và đánh dấu ngày công cần giải trình khi có bất thường.

---

## 2. Mục tiêu, Phi mục tiêu & Chống mục tiêu (Goals, Non-Goals, Anti-Goals)

### Mục tiêu (Goals)
- Tạo bảng `work_schedules` làm nguồn chân lý duy nhất (Single Source of Truth) cho kế hoạch làm việc từng ngày của nhân viên.
- Nhận diện chính xác các trạng thái Check-in (`VALID`, `EARLY`, `LATE`, `MISSED`) và Check-out (`VALID`, `EARLY`, `LATE_WITHOUT_OT`, `MISSED`).
- Bất kỳ trường hợp nào nằm ngoài cửa sổ hợp lệ (kể cả đến sớm hay về muộn quá 30 phút mà không có đơn OT duyệt) đều kích hoạt trạng thái `NEEDS_EXPLANATION` (bắt buộc nhân viên phải giải trình).
- Liên kết chặt chẽ các loại `system_requests` đã duyệt (Đổi ca cá nhân, Nghỉ kèm cam kết làm bù, Tăng ca) vào `work_schedules`.
- Quản lý trạng thái vòng đời ngày công rõ ràng (`PLANNED`, `IN_PROGRESS`, `VALID`, `NEEDS_EXPLANATION`, `ON_LEAVE`).
- Đặt tên biến chuẩn tiếng Anh nhất quán, loại bỏ toàn bộ tàn dư legacy.

### Phi mục tiêu (Non-Goals)
- Chưa thiết kế chế tài phạt tiền, trừ lương hay tính điểm chuyên cần cho các lỗi vi phạm (chế tài sẽ được thiết kế ở giai đoạn sau theo chỉ định của người dùng).
- Chưa xây dựng màn hình giao diện người dùng (UI) phức tạp; tập trung hoàn thiện API backend và kiểm thử logic trước.
- Không tự động trừ ngày nghỉ phép thành nghỉ không lương nếu ngày làm bù bị vi phạm (chỉ ghi nhận ngày làm bù bị vi phạm check-out sớm).

### Chống mục tiêu (Anti-Goals)
- **Không đẻ thêm class riêng lẻ cho từng nghiệp vụ nhỏ:** Không tạo các class riêng biệt kiểu `OvertimeAssignment`, `ShiftSwap`, `MakeUpSchedule`. Mọi biến động đều quy về cập nhật `work_schedules`.
- **Không tính OT tự động:** Tuyệt đối không cho phép nhân viên tự ý ở lại văn phòng muộn để hưởng tiền OT nếu không có đơn/lệnh OT đã được duyệt trước.
- **Không tính công mù quáng:** Không tự chia 0.5 hay 1.0 công theo số giờ trôi qua mà đối chiếu theo nghĩa vụ ca.

---

## 3. Các hướng tiếp cận & Lựa chọn (Approaches)

### Hướng 1: Mô hình "Khung ca mục tiêu động" (Dynamic Target Shift)
Hệ thống không lưu bảng lịch phân ca, mà mỗi khi chấm công sẽ quét ca mặc định trong `staff` rồi gộp với các `system_requests` đã duyệt để suy ra khung ca.
- *Đánh đổi:* Ít bảng, nhưng khó hiển thị lịch làm việc tổng quan cho nhân viên/quản trị, và tốn tài nguyên truy vấn gộp nhiều bảng mỗi lần quẹt thẻ.

### Hướng 2: Mô hình "Bảng phân ca làm việc cứng" (`work_schedules`) — **ĐÃ ĐƯỢC CHỌN**
Tạo bảng `work_schedules` lưu trữ rõ ràng từng ngày nhân viên làm ca gì, từ mấy giờ đến mấy giờ, có làm bù hay tăng ca không.
- *Đánh đổi:* Cần quản lý thêm 1 bảng, nhưng dữ liệu hoàn toàn minh bạch, truy xuất cực nhanh, hỗ trợ xem lịch làm việc trực quan và quản lý ca kíp theo chuẩn công nghiệp.
- *Lý do chọn:* Người dùng yêu cầu triển khai theo Hướng 2 để đảm bảo tính tường minh và có cơ sở đối soát rõ ràng.

---

## 4. Chi tiết Thiết kế Kỹ thuật (Detailed Specification)

### 4.1. Cấu trúc Bảng `work_schedules` (PostgreSQL)

```sql
CREATE TABLE work_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id TEXT NOT NULL REFERENCES staff(uuid),
    work_date DATE NOT NULL,
    shift_type TEXT NOT NULL,                     -- 'NORMAL', 'FLEX', 'NIGHT', 'CUSTOM'
    planned_start_time TIME NOT NULL,             -- Giờ bắt đầu ca chuẩn (ví dụ '08:00:00')
    planned_end_time TIME NOT NULL,               -- Giờ kết thúc ca chuẩn (ví dụ '17:00:00' hoặc đã cộng OT thành '22:00:00')
    approved_ot_hours REAL NOT NULL DEFAULT 0,    -- Giờ tăng ca được phê duyệt
    schedule_type TEXT NOT NULL DEFAULT 'REGULAR',-- 'REGULAR', 'SHIFT_CHANGE', 'MAKE_UP', 'OVERTIME'
    status TEXT NOT NULL DEFAULT 'PLANNED',       -- 'PLANNED', 'COMPLETED', 'ON_LEAVE', 'CANCELLED'
    source_request_id UUID REFERENCES system_requests(id), -- Request nguồn gốc (nếu là đổi ca, làm bù, OT)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_work_schedules_emp_date UNIQUE(employee_id, work_date)
);

CREATE INDEX idx_work_schedules_emp_date ON work_schedules(employee_id, work_date);
```

### 4.2. Quy tắc Cửa Sổ Giờ Chấm Công (Window of Validity)

Giả sử lịch làm việc ngày hôm đó có $T_{vào} = \text{planned\_start\_time}$ và $T_{ra} = \text{planned\_end\_time}$.

#### Quy tắc Check-in ($t_{in}$):
* **Hợp lệ (`VALID`):** Bấm trong khoảng $[T_{vào} - 15', T_{vào} + 15']$.
* **Đến sớm (`EARLY`):** Bấm trước $T_{vào} - 15'$ $\rightarrow$ Kích hoạt `NEEDS_EXPLANATION`.
* **Đi trễ (`LATE`):** Bấm sau $T_{vào} + 15'$ $\rightarrow$ Kích hoạt `NEEDS_EXPLANATION`.
* **Quên check-in (`MISSED`):** Quá $T_{vào} + 30'$ mà hoàn toàn không có bản ghi quẹt thẻ vào $\rightarrow$ Kích hoạt `NEEDS_EXPLANATION`.

#### Quy tắc Check-out ($t_{out}$):
* **Hợp lệ (`VALID`):** Bấm trong khoảng $[T_{ra}, T_{ra} + 30']$.
* **Về sớm (`EARLY`):** Bấm trước $T_{ra}$ $\rightarrow$ Kích hoạt `NEEDS_EXPLANATION`.
* **Về muộn không có đơn OT (`LATE_WITHOUT_OT`):** Bấm sau $T_{ra} + 30'$ mà không có đơn OT duyệt $\rightarrow$ Kích hoạt `NEEDS_EXPLANATION`.
* **Quên check-out (`MISSED`):** Quá $T_{ra} + 30'$ mà không có bản ghi quẹt thẻ ra $\rightarrow$ Kích hoạt `NEEDS_EXPLANATION`.

*(Nếu ngày hôm đó có duyệt đơn OT, mốc $T_{ra}$ tự động được dời theo giờ kết thúc ca OT, ví dụ từ 17:00 thành 21:00).*

### 4.3. Bảng Công Nhật (`timesheet_entries`) & Vòng Đời Ngày Công

Cấu trúc lưu trữ trạng thái ngày công:
- `check_in_status`: `'VALID' | 'EARLY' | 'LATE' | 'MISSED' | 'PENDING'`
- `check_out_status`: `'VALID' | 'EARLY' | 'LATE_WITHOUT_OT' | 'MISSED' | 'PENDING'`
- `day_status`:
  - `PLANNED`: Chưa bắt đầu ca làm việc.
  - `IN_PROGRESS`: Đã check-in hoặc đang trong khung giờ ca, chưa đến giờ tan ca để chốt.
  - `VALID`: Cả check-in và check-out đều `VALID`.
  - `NEEDS_EXPLANATION`: Bất kỳ lỗi nào (đến sớm, đi trễ, về sớm, về muộn không đơn OT, quên vào, quên ra).
  - `ON_LEAVE`: Ngày nghỉ phép / nghỉ làm bù đã được duyệt (không cần chấm công).

### 4.4. Cơ chế Request đồng bộ sang Schedule

Khi một `system_requests` chuyển trạng thái sang `APPROVED`:

1. **Request Đổi ca (`SHIFT_CHANGE`):**
   * Là đổi ca cá nhân của nhân viên (1 người xin đổi sang khung giờ ca khác).
   * Cập nhật `work_schedules` của ngày tương ứng:
     * `shift_type = request.new_shift_type`
     * `planned_start_time = request.new_start_time` (ví dụ `06:00`)
     * `planned_end_time = request.new_end_time` (ví dụ `15:00`)
     * `schedule_type = 'SHIFT_CHANGE'`
2. **Request Nghỉ phép có Làm bù (`LEAVE_WITH_MAKEUP`):**
   * **Ngày nghỉ:** Cập nhật `work_schedules` ngày nghỉ thành `status = 'ON_LEAVE'`.
   * **Ngày làm bù:** Cập nhật `work_schedules` ngày làm bù với khung giờ chỉ định:
     * `planned_start_time = request.makeup_start_time` (ví dụ `08:00`)
     * `planned_end_time = request.makeup_end_time` (ví dụ `22:00`)
     * `schedule_type = 'MAKE_UP'`
   * *Nếu ngày làm bù nhân viên về trước 22:00:* Hệ thống tính là `EARLY` check-out và đưa vào diện `NEEDS_EXPLANATION`.
3. **Request Tăng ca (`OVERTIME`):**
   * Kéo dài `planned_end_time` của ca hôm đó đến hết giờ OT và ghi nhận `approved_ot_hours`.
   * Cửa sổ quẹt thẻ ra tự động dời theo giờ kết thúc mới $[T_{OT}, T_{OT} + 30']$.
4. **Request Nghỉ không lương / Phép năm (`LEAVE`):**
   * Đặt `status = 'ON_LEAVE'` trên `work_schedules`, nhân viên không phải chấm công ngày này.

---

## 5. Những phần giao cho người lập trình (What's Left to the Builder)
- Tạo migration bổ sung bảng `work_schedules` và các cột mở rộng cho `system_requests` (ví dụ: `new_shift_type`, `new_start_time`, `new_end_time`, `makeup_start_time`, `makeup_end_time`).
- Khởi tạo lịch mặc định từ thông tin ca trong `staff` khi bắt đầu ngày mới hoặc khi nhân viên mới được tạo.
- Refactor `DailyTimesheet.calculate()` trong `src/domain/attendance-v2/daily-timesheet.ts` để đọc và đối soát với `WorkSchedule`.
- Tích hợp hook đồng bộ trong `RequestV2Service.approve()` để tự động cập nhật `work_schedules`.
- Cập nhật test suites tương ứng (`test/unit/attendance-v2-*.test.ts`, `test/unit/request-v2-*.test.ts`).
