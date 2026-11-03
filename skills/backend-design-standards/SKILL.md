---
name: backend-design-standards
description: Use when designing, refactoring, or implementing backend database schemas, SQL migrations, relational data types, and domain classes, entities, or value objects.
---

# Tiêu Chuẩn Thiết Kế Backend: Cơ Sở Dữ Liệu & Hướng Đối Tượng (Clean Architecture & DDD)

Tài liệu này là quy chuẩn kỹ thuật bắt buộc khi thiết kế bảng cơ sở dữ liệu (PostgreSQL/SQL), chọn kiểu dữ liệu lưu trữ, và xây dựng các lớp Domain (Entities, Value Objects, Aggregate Roots) trong toàn bộ dự án.

---

## 1. Quy Tắc Thiết Kế Cơ Sở Dữ Liệu (Database Design Standards)

### 1.1. Kiểu dữ liệu lưu trữ chuẩn mực (PostgreSQL Data Types)

| Loại dữ liệu | Kiểu dữ liệu chuẩn | Giải thích & Quy ước | Điều cấm kỵ (Anti-pattern) |
|---|---|---|---|
| **Định danh (PK / FK)** | `UUID` (ưu tiên UUID v7) | Luôn dùng UUID làm định danh bất biến công khai và khóa ngoại (`employee_id UUID`). | ❌ Không dùng số tự tăng `SERIAL` làm public ID.<br>❌ Không dùng dữ liệu nghiệp vụ (`username`, `email`) làm Foreign Key. |
| **Thời điểm sự kiện** | `TIMESTAMPTZ` | Lưu chính xác thời điểm vật lý có múi giờ (UTC). Ví dụ: `punched_at`, `created_at`. | ❌ Không dùng `TIMESTAMP` (không có timezone). |
| **Ngày tháng theo lịch** | `DATE` | Lưu ngày thuần túy không có giờ (`YYYY-MM-DD`). Ví dụ: `work_date`, `birthday`. | ❌ Không dùng `TEXT` để lưu ngày khi cần query lọc theo khoảng thời gian. |
| **Khung giờ / Thời gian ca** | `TEXT` định dạng `HH:mm` | Ví dụ: `08:00`, `17:00`, `21:00`. Dễ so sánh chuỗi theo chuẩn ISO. | ❌ Không lưu giờ ca bằng mili-giây hoặc số nguyên hỗn loạn. |
| **Số tiền / Tiền tệ** | `BIGINT` | Lưu đơn vị tiền tệ nhỏ nhất (VND đồng, cent). Tránh hoàn toàn sai số dấu phẩy động. | ❌ Cấm dùng `FLOAT` / `DOUBLE` cho tiền tệ. |
| **Chỉ số công / Giờ làm** | `REAL` hoặc `DOUBLE PRECISION` | Ví dụ: `work_hours: 7.5`, `standard_day: 1.0` hoặc `0.5`. | ❌ Không lưu chuỗi `TEXT` cho số đo tính toán. |
| **Tỷ lệ phần trăm / Phút** | `INTEGER` | Ví dụ: `allowance_pct` (0, 10, 30, 40, 60), `late_minutes: 15`. | ❌ Không lưu dạng `0.4` khi quy ước là số nguyên `%`. |
| **Cờ logic (Flag)** | `BOOLEAN` | Dùng `BOOLEAN` nguyên bản (`true`/`false`). | ❌ Không dùng số nguyên `0` và `1` cho cờ mới. |
| **Chuỗi ký tự / Enum** | `TEXT` | PostgreSQL tối ưu `TEXT` tương đương `VARCHAR`, dùng kèm `CHECK (col IN (...))`. | ❌ Không lạm dụng `VARCHAR(255)` cảm tính. |

---

### 1.2. NGUYÊN TẮC VÀNG: Cấm lạm dụng JSON/JSONB trong Database

> [!CAUTION]
> **TUYỆT ĐỐI KHÔNG LƯU CÁC ĐỐI TƯỢNG BIẾT TRƯỚC VÀO CỘT JSONB.**
> Việc nhét JSON vào DB là biểu hiện của "lười thiết kế quan hệ".

* **Tại sao cấm JSON/JSONB cho dữ liệu có cấu trúc?**
  1. **Hiệu năng kém:** Truy vấn, lọc, nhóm `GROUP BY`, tính tổng `SUM()` trên cột JSON chậm hơn gấp nhiều lần so với cột nguyên thủy.
  2. **Mất ràng buộc toàn vẹn:** JSON không thể áp dụng `CHECK (col IN (...))`, `NOT NULL`, hoặc `FOREIGN KEY` cấp cơ sở dữ liệu.
  3. **Phình to ổ đĩa:** PostgreSQL phải lưu metadata key của JSON lặp đi lặp lại trên từng dòng.
* **Quy tắc làm phẳng (Flattening Rule):**
  * Luôn tách phẳng thành từng cột riêng biệt:
    ```sql
    -- ❌ SAI: Nhét JSON
    shift_snapshot JSONB -- {"type": "NIGHT", "start": "21:00", "allowance": 40}

    -- ✔ ĐÚNG: Làm phẳng 100%
    shift_type TEXT NOT NULL,
    shift_start_time TEXT NOT NULL,
    shift_end_time TEXT NOT NULL,
    shift_allowance_pct INTEGER NOT NULL DEFAULT 0
    ```

---

### 1.3. Quy tắc Snapshot (Chống bẫy dữ liệu lịch sử)

Khi một bản ghi trong quá khứ phụ thuộc vào hợp đồng của nhân sự (ví dụ: ngày công phụ thuộc vào ca làm việc):
* **CẤM:** Dùng Foreign Key JOIN động vào bảng hợp đồng/nhân sự hiện tại khi tính công/lương. (Vì tháng sau nhân viên đổi ca sẽ làm sai toàn bộ công tháng trước).
* **BẮT BUỘC:** Chụp lại (Snapshot) các cột ca làm việc của nhân viên **tại ngày hôm đó** vào dòng ngày công:
  * `shift_type`, `shift_start_time`, `shift_end_time`, `shift_allowance_pct`.

---

### 1.4. Quy tắc đặt tên (Naming Conventions)

1. **Bảng và Cột:** Luôn dùng `snake_case`.
2. **Tên bảng:** Luôn dùng **danh từ số nhiều** biểu thị tập hợp: `punch_events`, `timesheet_entries`, `staff_roles`.
3. **Khóa ngoại (FK):** Tên thực thể + `_id`: `employee_id REFERENCES staff(uuid)`.
4. **Cột thời gian:**
   * Thời điểm: `punched_at`, `approved_at`, `created_at`.
   * Ngày lịch: `work_date`, `start_date`, `birthday`.

---

## 2. Quy Tắc Thiết Kế Hướng Đối Tượng & Domain (Class Design Standards)

Áp dụng chuẩn Domain-Driven Design (DDD) & Clean Architecture để tách biệt nghiệp vụ khỏi Framework và Database:

```
[ HTTP Controller / CLI ]
           │
           ▼
[ Application Service ]
           │
           ▼
[ Domain Model (Entities / Value Objects / Aggregates) ] ◄── Nghiệp vụ độc lập 100%
           ▲
           │
[ Infrastructure / Repository (Kysely / DB) ]
```

---

### 2.1. Phân định rõ 3 loại Class trong Domain

#### 1. Value Object (Đối tượng giá trị - Bất biến)
* **Đặc tính:**
  * **Không có ID riêng.** Hai đối tượng bằng nhau nếu tất cả thuộc tính của chúng bằng nhau.
  * **Bất biến (Immutable):** Mọi thuộc tính đều là `readonly`. Muốn sửa đổi phải tạo ra một instance mới (`withChanges()`).
  * **Tự xác thực (Self-validating):** Ném lỗi ngay tại constructor nếu dữ liệu sai quy chuẩn.
* **Ví dụ trong hệ thống:** `PersonName`, `Position`, `Shift`, `Leave`, `WorkWindow`, `AttendanceMetrics`.

#### 2. Entity (Thực thể có danh tính)
* **Đặc tính:**
  * Có `id` duy nhất (UUID) theo suốt vòng đời.
  * Có thể thay đổi trạng thái nhưng danh tính (ID) không đổi.
* **Ví dụ:** `PunchEvent`, `EmployeeProfile`, `EmployeeAccount`.

#### 3. Aggregate Root (Cội nguồn kết tập - Người gác cổng)
* **Đặc tính:**
  * Là Entity đầu não đại diện cho một cụm nghiệp vụ chặt chẽ.
  * **Không cho phép can thiệp trực tiếp vào thực thể con.** Mọi thay đổi đều phải thông qua Aggregate Root để bảo vệ tính toàn vẹn (Invariants).
* **Ví dụ:**
  * `Employee` là Aggregate Root quản lý `EmployeeProfile`, `EmployeeAccount`, `EmployeeContract`.
  * `DailyTimesheet` là Aggregate Root quản lý các chỉ số ngày công, ca làm việc và trạng thái duyệt.

---

### 2.2. Chống mô hình "Thiếu máu" (Rich Domain Model vs Anemic Data Holder)

* **❌ Mô hình thiếu máu (Anemic Domain):** Class chỉ chứa getters/setters rỗng tuếch, còn toàn bộ tính toán nhét hết vào Service hoặc Controller.
* **✔ Mô hình giàu hành vi (Rich Domain):** Class phải tự chứa các phương thức nghiệp vụ của chính nó:
  * `dailyTimesheet.calculate(punches, policy)`: Tự so khớp và tính ra công.
  * `dailyTimesheet.applyLeave(leaveRequest)`: Tự kiểm tra và kích hoạt trừ phép.
  * `dailyTimesheet.lockForPayroll()`: Tự kiểm tra điều kiện đóng băng công.
  * `punchEvent.calculateDistanceMeters(officeCoords)`: Tự đo khoảng cách GPS.

---

### 2.3. Quy ước chuyển đổi dữ liệu (Mapping Separation)

Tách bạch rạch ròi giữa lưu trữ Database, xử lý nghiệp vụ, và giao tiếp HTTP:

```typescript
export class DomainEntity {
  // 1. Factory method khởi tạo nghiệp vụ sạch
  static create(props: DomainProps): DomainEntity;

  // 2. Tái tạo từ dữ liệu phẳng của Database (Repository dùng)
  static fromRow(row: DatabaseRow): DomainEntity;

  // 3. Xuất ra dạng dòng phẳng để INSERT / UPDATE Database (Repository dùng)
  toRow(): InsertableRow;

  // 4. Xuất ra DTO dạng JSON để trả về Client qua HTTP (Controller dùng)
  toJSON(): EntityDTO;
}
```

> [!IMPORTANT]
> * `toRow()`: Phẳng hóa 100% để lưu xuống các cột bảng cơ sở dữ liệu.
> * `toJSON()`: Chỉ dùng để tuần tự hóa dữ liệu gửi qua mạng (HTTP REST API) cho Web/Mobile App. **TUYỆT ĐỐI KHÔNG dùng `toJSON()` để ghi xuống DB!**
