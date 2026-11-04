# TÀI LIỆU API CONTRACT V2 (DÀNH CHO FRONTEND AGENT)

Tài liệu này đặc tả toàn bộ giao diện API của hệ thống Backend **Lương Nhân Sự V2** (NestJS Modular Monolith + PostgreSQL). Frontend Agent vui lòng tuân thủ đúng chuẩn định dạng URL, phương thức HTTP, headers và payloads dưới đây.

---

## 1. NGUYÊN TẮC CHUNG & XÁC THỰC

- **Base URL**: `http://localhost:3000`
- **Content-Type**: `application/json; charset=utf-8`
- **Xác thực**:
  - Đăng nhập qua `POST /api/login` hoặc `POST /api/v2/auth/login`.
  - Phản hồi sẽ đính kèm cookie `session=<token>` (`HttpOnly; SameSite=Lax; Path=/`). Mọi request tiếp theo từ trình duyệt sẽ tự động gửi kèm cookie này.
  - Phản hồi cũng trả về object `token` để hỗ trợ kiểm thử hoặc lưu trữ nếu cần.
- **Quy ước mã lỗi HTTP (JSON Response)**:
  - `400 Bad Request`: Dữ liệu gửi lên sai định dạng hoặc vi phạm ràng buộc nghiệp vụ.
  - `401 Unauthorized`: Chưa đăng nhập hoặc phiên làm việc hết hạn.
  - `403 Forbidden`: Tài khoản bị tạm khóa hoặc không đủ quyền hạn.
  - `404 Not Found`: Không tìm thấy tài nguyên (nhân sự, đơn từ, phiếu lương).
  - `409 Conflict`: Xung đột dữ liệu (trùng khóa, mã, ngày công đã chốt).
  - `500 Internal Server Error`: Lỗi máy chủ chưa được xử lý.
  - **Cấu trúc JSON lỗi chuẩn**:
    ```json
    {
      "error": "Thông báo lỗi chi tiết cho người dùng",
      "code": "MÃ_LỖI_CHUẨN",
      "details": {}
    }
    ```

---

## 2. BẢNG ÁNH XẠ ENDPOINT CŨ (V1) SANG MỚI (V2)

| Nghiệp vụ | Endpoint cũ (V1 Legacy) | Endpoint mới (V2 Chuẩn) | Phương thức | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| **Xác thực** | `POST /api/login` | `POST /api/v2/auth/login` (hoặc `/api/login`) | POST | Đăng nhập tài khoản |
| | `POST /api/logout` | `POST /api/v2/auth/logout` (hoặc `/api/logout`) | POST | Đăng xuất |
| | `GET /api/me` | `GET /api/v2/auth/me` (hoặc `/api/me`) | GET | Lấy thông tin tài khoản hiện tại |
| | `PUT /api/password` | `PUT /api/v2/auth/password` (hoặc `/api/password`) | PUT | Đổi mật khẩu |
| **Nhân sự** | `GET /api/staff` | `GET /api/v2/employees` | GET | Danh sách nhân viên |
| | `POST /api/staff` | `POST /api/v2/employees` | POST | Tạo mới nhân viên |
| | `PUT /api/staff/:id` | `PUT /api/v2/employees/:id` | PUT | Sửa hồ sơ nhân viên (Profile Drawer) |
| | `DELETE /api/staff/:id` | `DELETE /api/v2/employees/:id` | DELETE | Cho thôi việc (deactivate) |
| | `GET /api/catalog/positions` | `GET /api/v2/employees/meta/positions` | GET | Danh mục chức vụ & bậc lương |
| | `GET /api/catalog/shifts` | `GET /api/v2/employees/meta/shifts` | GET | Danh mục ca làm việc |
| **Chấm công** | `POST /api/punch` | `POST /api/v2/attendance/punches` | POST | Ghi nhận lượt bấm Check-in / Check-out |
| | `GET /api/punches` | `GET /api/v2/attendance/punches` | GET | Lịch sử lượt bấm công |
| | `GET /api/timesheets` | `GET /api/v2/attendance/timesheets` | GET | Bảng công chi tiết theo ngày |
| | `POST /api/timesheets/recalculate` | `POST /api/v2/attendance/recalculate` | POST | Tính toán lại công theo sự kiện |
| **Đơn từ & Giải trình** | `POST /api/leave-requests` | `POST /api/v2/requests/leave` | POST | Nộp đơn nghỉ phép |
| | `POST /api/ot-requests` | `POST /api/v2/requests/overtime` | POST | Nộp đơn làm thêm giờ |
| | `POST /api/advance-requests` | `POST /api/v2/requests/advance` | POST | Nộp đơn tạm ứng lương |
| | `POST /api/corrections` | `POST /api/v2/requests/correction` | POST | Nộp đơn bổ sung giờ chấm công |
| | `POST /api/explanations` | `POST /api/v2/requests/explanation` | POST | **Nộp đơn giải trình công (mới)** |
| | `GET /api/requests` | `GET /api/v2/requests` | GET | Danh sách đơn từ / giải trình |
| | `PATCH /api/requests/:id/review`| `PATCH /api/v2/requests/:id/review` | PATCH | Duyệt / Từ chối đơn & giải trình |
| **Đơn iSAT** | — (mới) | `POST /api/v2/requests/isat` | POST | **Nộp đơn iSAT (nghỉ Thứ Bảy có lương, chỉ nhóm Nhân viên)** |
| | — (mới) | `GET /api/v2/requests/isat/conditions` | GET | **Danh sách điều kiện tự đánh giá iSAT** |
| **Tính lương** | `POST /api/payroll/run` | `POST /api/v2/payroll/:month/calculate` | POST | Kích hoạt tính lương toàn chu kỳ |
| | `GET /api/periods/:month/payslips` | `GET /api/v2/payroll/:month` | GET | Danh sách phiếu lương tháng |
| | `GET /api/payslips/:id` | `GET /api/v2/payroll/:month/:employeeId` | GET | Chi tiết phiếu lương nhân viên |
| | `PUT /api/kpi/:username` | `PUT /api/v2/payroll/:month/kpi/:username` | PUT | Chấm điểm KPI tháng |
| **Hệ thống** | `GET /api/health` | `GET /api/v2/system/health` (hoặc `/api/health`)| GET | Kiểm tra tình trạng kết nối DB |
| | `GET /api/settings` | `GET /api/v2/system/settings` | GET | Danh sách cấu hình hệ thống |
| | `PUT /api/settings/:key` | `PUT /api/v2/system/settings/:key` | PUT | Cập nhật cấu hình |
| | `GET /api/audit` | `GET /api/v2/system/audit` | GET | Xem nhật ký kiểm toán |
| | `POST /api/periods/:month/lock` | `POST /api/v2/system/periods/:month/lock` | POST | Khóa bảng công kỳ lương |

---

## 3. CHI TIẾT CÁC ENDPOINT V2 THEO MODULE

### 3.1. Auth Module (Xác thực & Phiên làm việc)

#### `POST /api/v2/auth/login` (hoặc `/api/login`)
- **Mục đích**: Đăng nhập hệ thống.
- **Request Body**:
  ```json
  {
    "username": "tran-minh-ngoc",
    "password": "Mật khẩu"
  }
  ```
- **Response 200**:
  ```json
  {
    "ok": true,
    "user": {
      "uuid": "4391e6b3-8fa4-4ee9-b4be-5b232c943891",
      "username": "tran-minh-ngoc",
      "name": "Trần Minh Ngọc",
      "role": "manager",
      "type": "ctv",
      "level": 1
    },
    "token": "dHJhbi1taW5oLW5nb2MuMTc...hmac_signature"
  }
  ```

#### `GET /api/v2/auth/me` (hoặc `/api/me`)
- **Mục đích**: Lấy thông tin tài khoản đang đăng nhập từ Session Cookie.
- **Response 200**:
  ```json
  {
    "me": {
      "uuid": "4391e6b3-8fa4-4ee9-b4be-5b232c943891",
      "username": "tran-minh-ngoc",
      "name": "Trần Minh Ngọc",
      "role": "manager",
      "type": "ctv",
      "level": 1
    }
  }
  ```

---

### 3.2. Employees Module (Nhân sự & Hồ sơ Profile Drawer)

#### `GET /api/v2/employees`
- **Query Params**:
  - `status`: Lọc theo trạng thái hợp đồng (`tts`, `ctv`, `thuviec`, `nv`, `nghiviec`).
  - `shiftType`: Lọc theo ca (`NORMAL`, `FLEX`, `NIGHT`).
  - `q`: Tìm kiếm theo username hoặc họ tên.
- **Response 200**:
  ```json
  {
    "employees": [
      {
        "username": "tran-minh-ngoc",
        "profile": {
          "uuid": "4391e6b3-8fa4-4ee9-b4be-5b232c943891",
          "name": {
            "familyName": "Trần",
            "givenName": "Minh Ngọc",
            "fullName": "Trần Minh Ngọc"
          },
          "birthday": "1994-06-12",
          "dependants": 0
        },
        "account": {
          "role": "manager",
          "additionalRoles": [],
          "isLocked": false
        },
        "contract": {
          "status": "ctv",
          "term": "long",
          "hasInsurance": null,
          "position": {
            "type": "ctv",
            "level": 1,
            "jobTitle": "Chuyên trách viên"
          },
          "shift": {
            "type": "NORMAL",
            "startTime": "08:30",
            "endTime": "17:30",
            "allowancePct": 0
          },
          "leave": {
            "totalDays": 12,
            "usedDays": 0,
            "remainingDays": 12
          }
        }
      }
    ],
    "total": 1
  }
  ```
- `contract.term`: nhãn hợp đồng lưu ở cột `staff.contract`. `"long"` = HĐLĐ từ 3 tháng, `"short"` = dưới 3 tháng, `null` = theo loại nhân sự.
- `contract.hasInsurance`: cột `staff.insured`. `true` / `false`; `null` = theo mặc định của hợp đồng.

#### `PUT /api/v2/employees/:id`
- **Mục đích**: Cập nhật hồ sơ nhân sự (Profile Drawer).
- **Lưu ý**: Endpoint này **100% không còn chạm vào bảng `timesheets` cũ**, xử lý sạch sẽ không gây lỗi 500.
- **Request Body**:
  ```json
  {
    "name": "Trần Minh Ngọc (Đã Cập Nhật)",
    "birthday": "1994-06-12",
    "dependants": 1,
    "role": "manager",
    "contractStatus": "nv",
    "positionType": "ctv",
    "positionLevel": 2,
    "shiftType": "FLEX",
    "shiftStartTime": "09:00",
    "shiftEndTime": "18:00",
    "contract": "short",
    "insured": null
  }
  ```
- `contract`: `"long"` | `"short"` | `null` (`""` cũng là `null`); giá trị khác → 400 `BAD_EMPLOYEE_INPUT`. Thân dạng DTO có thể gửi `contract.term` thay thế.
- `insured`: `true` / `false` / `null` (nhận cả `1` / `0`); giá trị khác → 400. Thân dạng DTO có thể gửi `contract.hasInsurance`.
- Thiếu `contract` / `insured` thì giữ giá trị đang lưu.
- **Response 200**: Trả về object nhân viên đã cập nhật thành công.

#### `GET /api/v2/employees/meta/positions` & `GET /api/v2/employees/meta/shifts`
- **Mục đích**: Lấy danh mục chức vụ, bậc lương và các ca làm việc phục vụ dropdown trên form.

---

### 3.3. Attendance Module (Chấm công Check-in / Check-out)

#### `POST /api/v2/attendance/punches`
- **Mục đích**: Ghi nhận lượt bấm công (Check-in hoặc Check-out).
- **Request Body**:
  ```json
  {
    "employeeId": "4391e6b3-8fa4-4ee9-b4be-5b232c943891",
    "type": "IN",
    "punchedAt": "2026-11-04T08:30:00.000Z",
    "workDate": "2026-11-04",
    "latitude": 21.028511,
    "longitude": 105.854444,
    "accuracyMeters": 5,
    "note": "Check-in văn phòng chính"
  }
  ```
- **Response 200**:
  ```json
  {
    "punch": {
      "id": "punch-uuid",
      "employeeId": "4391e6b3-8fa4-4ee9-b4be-5b232c943891",
      "type": "IN",
      "punchedAt": "2026-11-04T08:30:00.000Z",
      "isWithinOffice": true
    },
    "timesheet": {
      "status": "ABSENT",
      "checkIn": "2026-11-04T08:30:00.000Z",
      "checkOut": null,
      "metrics": {
        "workHours": 0,
        "lateMinutes": 0,
        "earlyMinutes": 0
      }
    }
  }
  ```

#### `GET /api/v2/attendance/timesheets`
- **Query Params**: `employeeId`, `month` (`YYYY-MM`), `status`.
- **Response 200**: Danh sách bảng công chi tiết theo từng ngày trong tháng.

---

### 3.4. Requests Module (Đơn từ & Giải trình)

#### `POST /api/v2/requests/explanation` (Tính năng Giải trình)
- **Mục đích**: Nộp đơn giải trình khi đi muộn, về sớm hoặc quên chấm công.
- **Request Body**:
  ```json
  {
    "employeeId": "4391e6b3-8fa4-4ee9-b4be-5b232c943891",
    "title": "Giải trình đi muộn do tắc đường cầu vượt",
    "reason": "Sự cố giao thông nghẽn làn kéo dài hơn 45 phút",
    "targetDate": "2026-11-04",
    "targetPunchType": "IN",
    "actualPunchTime": "2026-11-04T09:05:00.000Z"
  }
  ```
- **Response 201**:
  ```json
  {
    "created": true,
    "request": {
      "id": "req-uuid",
      "type": "EXPLANATION",
      "status": "PENDING",
      "title": "Giải trình đi muộn do tắc đường cầu vượt"
    }
  }
  ```

#### `POST /api/v2/requests/leave` (Đơn nghỉ phép)
- **Request Body**:
  ```json
  {
    "employeeId": "4391e6b3-8fa4-4ee9-b4be-5b232c943891",
    "title": "Nghỉ phép thường niên",
    "reason": "Giải quyết việc cá nhân gia đình",
    "leaveType": "PAID",
    "startDate": "2026-11-10",
    "endDate": "2026-11-11",
    "daysCount": 2
  }
  ```

#### `POST /api/v2/requests/overtime` (Đơn làm thêm OT)
- **Request Body**:
  ```json
  {
    "employeeId": "4391e6b3-8fa4-4ee9-b4be-5b232c943891",
    "title": "Làm thêm hoàn thiện đợt kiểm toán hệ thống",
    "reason": "Hỗ trợ bảo trì và rà soát cơ sở dữ liệu",
    "otDate": "2026-11-04",
    "otHours": 2,
    "otRateMultiplier": 1.5
  }
  ```

#### `POST /api/v2/requests/advance` (Đơn tạm ứng lương)
- **Request Body**:
  ```json
  {
    "employeeId": "4391e6b3-8fa4-4ee9-b4be-5b232c943891",
    "title": "Tạm ứng lương đầu tháng",
    "reason": "Chi tiêu gia đình đầu kỳ",
    "amount": 3000000,
    "month": "2026-11"
  }
  ```

#### `POST /api/v2/requests/isat` (Đơn iSAT — nghỉ Thứ Bảy có lương)
- **Mục đích**: Nhân sự nhóm Nhân viên tự đánh giá 4 điều kiện và xin nghỉ một ngày Thứ Bảy có lương. Máy chủ tự sinh `title` ("Đăng ký iSAT Thứ Bảy DD/MM/YYYY") và `reason` ("Tự đánh giá đạt N/4 điều kiện"); giá trị client gửi cho hai trường này bị bỏ qua.
- **Request Body**:
  ```json
  {
    "employeeId": "nguyen-van-a",
    "saturday": "2026-11-07",
    "team": "VN Pod — Vận hành",
    "conditions": {
      "NO_VIOLATION": true,
      "REPORTS_DONE": true,
      "WORK_COMPLETED": true,
      "OFFICIAL_EMPLOYEE": false
    }
  }
  ```
  - `employeeId`: tuỳ chọn, là `uuid` hoặc `username`; bỏ trống thì lấy người đăng nhập. Đơn luôn được lưu theo `uuid` của nhân sự, dù gửi `username`.
    - Vì `employee_id` là `uuid`, `GET /api/v2/requests?employeeId=<username>` và `PATCH /api/v2/requests/:id/cancel` từ phiên đăng nhập (username) đều tự đổi username sang `uuid` của nhân sự: danh sách trả cả đơn iSAT lẫn các loại đơn khác của người đó, và tác giả huỷ được đơn của mình.
  - `saturday`: ngày `YYYY-MM-DD` hợp lệ và phải là Thứ Bảy.
  - `team`: chuỗi không rỗng (cắt khoảng trắng hai đầu).
  - `conditions`: object `{mã: true|false}` theo mã ở `GET /api/v2/requests/isat/conditions`. Không gửi, thiếu mã hoặc giá trị `null` đều tính **Chưa đạt**.
  - Các trường khác trong body không được chuyển đi.
- **Response 201**: `{ "created": true, "request": <đơn> }`. Hồ sơ nhân sự (họ tên, loại, bậc, tên bậc, ca) được chụp vào đơn lúc nộp.
  - Tự đánh giá đạt 4/4: `status` = `PENDING`, chờ duyệt.
  - Dưới 4/4: đơn vẫn được lưu nhưng `status` = `REJECTED` ngay, `reviewedBy` = `null`, `reviewNote` = "Tự đánh giá chưa đạt 4/4 (đạt N/4)". Không ghi lịch và không có tác dụng lên lương.
  ```json
  {
    "created": true,
    "request": {
      "id": "req-uuid",
      "employeeId": "4391e6b3-8fa4-4ee9-b4be-5b232c943891",
      "type": "ISAT",
      "status": "REJECTED",
      "title": "Đăng ký iSAT Thứ Bảy 07/11/2026",
      "reason": "Tự đánh giá đạt 3/4 điều kiện",
      "reviewedBy": null,
      "reviewNote": "Tự đánh giá chưa đạt 4/4 (đạt 3/4)",
      "isat": { "saturday": "2026-11-07", "passedCount": 3, "totalCount": 4 }
    }
  }
  ```
  *(Ví dụ rút gọn; khối `isat` đầy đủ ở mục "Khối `isat`" bên dưới.)*
- **Lỗi** (mọi lỗi đều là `400` với `code: "BAD_REQUEST"`, `error` là câu tiếng Việt dưới đây; kiểm tra theo đúng thứ tự):

  | Thứ tự | `error` | Khi nào |
  |--------|---------|---------|
  | 1 | `Không tìm thấy nhân sự: <id>` | `employeeId` (hoặc người đăng nhập) không khớp `uuid` hay `username` nào |
  | 2 | `iSAT chỉ áp dụng cho nhóm Nhân viên` | Loại nhân sự không bật quyền lợi `isat` |
  | 3 | `saturday phải là ngày Thứ Bảy dạng YYYY-MM-DD, nhận: <giá trị>` | Thiếu `saturday`, sai định dạng, ngày không tồn tại hoặc không phải Thứ Bảy |
  | 4 | `team (Bộ phận / Team) không được để trống` | Thiếu `team` hoặc chỉ gồm khoảng trắng |
  | 5 | `conditions phải là object {mã: true\|false}` | `conditions` gửi lên nhưng là mảng, chuỗi, số... |
  | 5 | `Mã điều kiện iSAT không hợp lệ: <mã>` | `conditions` có mã ngoài 4 mã của `GET .../isat/conditions` |
  | 5 | `Giá trị điều kiện <mã> phải là true, false hoặc null` | Giá trị điều kiện khác `true`/`false`/`null` (ví dụ chuỗi `"true"`) |
  | 6 | `Đã có đơn iSAT cho Thứ Bảy DD/MM/YYYY` | Người đó đã có đơn iSAT `PENDING` hoặc `APPROVED` cho cùng Thứ Bảy (kể cả khi đơn mới sẽ tự `REJECTED`). Đơn đã `REJECTED`, kể cả tự đánh giá chưa đạt, không chặn |

#### `GET /api/v2/requests/isat/conditions` (Danh sách điều kiện iSAT)
- **Response 200**: 4 điều kiện theo thứ tự hiển thị trên form.
  ```json
  {
    "conditions": [
      { "code": "NO_VIOLATION", "label": "Không vi phạm Nội quy lao động hoặc các quy định của Công ty trong kỳ xét duyệt" },
      { "code": "REPORTS_DONE", "label": "Thực hiện đầy đủ các báo cáo" },
      { "code": "WORK_COMPLETED", "label": "Hoàn thành công việc được giao theo kế hoạch" },
      { "code": "OFFICIAL_EMPLOYEE", "label": "Là nhân viên chính thức" }
    ]
  }
  ```

#### `GET /api/v2/requests` & `GET /api/v2/requests/:id` (khối `isat`)
- Mọi đơn trả về có trường `isat`: `null` với loại đơn khác `ISAT`. `GET /api/v2/requests?type=ISAT` lọc riêng đơn iSAT (cùng các bộ lọc `employeeId`, `status`, `limit`, `offset` như mọi loại đơn).
- **Khối `isat`** của đơn iSAT (admin đọc lại đủ mọi trường đã nộp):
  ```json
  "isat": {
    "saturday": "2026-11-07",
    "fullName": "Nguyễn Văn A",
    "team": "VN Pod — Vận hành",
    "positionType": "nv",
    "positionLevel": 2,
    "levelName": "Chuyên viên",
    "shift": { "type": "NORMAL", "startTime": "08:00", "endTime": "17:00" },
    "conditions": [
      { "code": "NO_VIOLATION", "label": "Không vi phạm Nội quy lao động hoặc các quy định của Công ty trong kỳ xét duyệt", "passed": false },
      { "code": "REPORTS_DONE", "label": "Thực hiện đầy đủ các báo cáo", "passed": true },
      { "code": "WORK_COMPLETED", "label": "Hoàn thành công việc được giao theo kế hoạch", "passed": true },
      { "code": "OFFICIAL_EMPLOYEE", "label": "Là nhân viên chính thức", "passed": true }
    ],
    "passedCount": 3,
    "totalCount": 4
  }
  ```
  - `fullName`, `positionType`, `positionLevel`, `levelName` (có thể `null` nếu danh mục không có tên bậc) và `shift` là bản chụp hồ sơ lúc nộp, không đổi khi hồ sơ nhân sự sửa sau đó.
  - `conditions` là bản chụp nội dung và kết quả (`passed`) lúc nộp, luôn đủ 4 mục theo thứ tự hiển thị; đơn cũ giữ nội dung cũ nếu danh sách điều kiện đổi sau này.

#### `PATCH /api/v2/requests/:id/review` (Duyệt / Từ chối đơn)
- **Request Body**:
  ```json
  {
    "status": "APPROVED",
    "reviewNote": "Đã xác nhận đầy đủ lý do hợp lệ"
  }
  ```
- **Response 200**: Trả về trạng thái đơn đã cập nhật. Hệ thống tự động cập nhật lịch công (`work_schedules`) hoặc trạng thái ngày công (`timesheet_entries`) tương ứng.

##### Duyệt đơn iSAT
- Chỉ đơn `PENDING` duyệt được, như mọi loại đơn. Tác dụng:
  - `APPROVE`: lịch làm việc của Thứ Bảy đó được ghi `scheduleType = "ISAT"`, `status = "ON_LEAVE"`, `sourceRequestId` = mã đơn (giữ nguyên ca và giờ dự kiến, giờ OT được duyệt về 0). Phiếu lương của tháng chứa Thứ Bảy đó có dòng ngày `shiftCode "ISAT"` / `shiftLabel "iSAT"` / `inOutText "Hưởng lương ngày"` trị giá **một lương ngày** (lương cơ bản ÷ ngày công chuẩn, không phụ cấp, không OT, không khấu trừ) và thay dòng chấm công cùng ngày nếu có (mỗi ngày một dòng, không trả hai lần). `isatDays` đếm số ngày iSAT, `isatPay` cộng vào thu nhập gộp; ngày iSAT không tính vào `actualWorkDays` (không tăng phụ cấp đi lại, chuyên cần) và không bị tính là ngày nghỉ khi xét chuyên cần. Ví dụ: nv bậc 1, lương cơ bản 6.000.000, đơn T7 07/11/2026 đã duyệt → phiếu tháng 2026-11 có dòng 07/11 "iSAT" 230.769 đ, `isatDays = 1`, `isatPay = 230.769`.
  - `REJECT`: không đổi lịch và không ảnh hưởng lương.
  - Đơn iSAT mất dòng đăng ký (dữ liệu hỏng) bị từ chối khi `APPROVE` với `400` "Đơn iSAT thiếu dữ liệu đăng ký: <id>" và giữ nguyên `PENDING`; vẫn `REJECT` được.

---

### 3.5. Payroll Module (Tính lương & Phiếu lương)

Mọi endpoint dưới đây nhận `:month` dạng `YYYY-MM`; sai định dạng trả `400` với `code: "INVALID_MONTH"`. Tiền là số nguyên VND. Điểm KPI nhận và trả theo thang 0–100.

#### `POST /api/v2/payroll/:month/calculate`
- **Mục đích**: Kích hoạt tiến trình tính toán lương cho toàn bộ công ty hoặc danh sách nhân sự trong tháng.
- **Request Body**:
  ```json
  {
    "employeeIds": ["tran-minh-ngoc", "nguyen-van-a"]
  }
  ```
  *(Bỏ `employeeIds` hoặc gửi `[]` để tính cho toàn bộ nhân sự. Nếu gửi, `employeeIds` phải là mảng chuỗi không rỗng, mỗi phần tử là `uuid` hoặc `username`; một người được liệt kê hai lần chỉ có một phiếu. Giá trị khác (chuỗi đơn như `"u1"`, mảng có phần tử không phải chuỗi, chuỗi rỗng hoặc chỉ gồm khoảng trắng, `null`...) bị từ chối bằng `400 INVALID_EMPLOYEE_IDS` trước khi tính.)*
- **Response 200**:
  ```json
  {
    "month": "2026-11",
    "calculated": true,
    "runId": 2,
    "count": 1,
    "items": [
      {
        "employeeId": "tran-minh-ngoc",
        "fullName": "Trần Minh Ngọc",
        "positionLevelText": "Nhân viên · Bậc 1",
        "month": "2026-11",
        "actualWorkDays": 22,
        "baseSalaryActual": 5076923,
        "totalAllowanceActual": 2030769,
        "kpiActualPay": 3000000,
        "grossIncome": 10107692,
        "insuranceDeduction": 630000,
        "advanceDeduction": 0,
        "netIncome": 9477692
      }
    ],
    "errors": [
      { "employeeId": "nguyen-van-a", "message": "Thiếu cấu hình chức vụ hoặc bậc lương cho nv (Nhân viên · Bậc 9)" }
    ]
  }
  ```
  - `items`: một dòng tóm tắt cho mỗi nhân sự tính được; `count` là số dòng của `items`.
  - `errors`: nhân sự **không tính được** (thiếu cấu hình chức vụ hoặc bậc lương, không tìm thấy dữ liệu...). Mỗi phần tử gồm `employeeId` (đúng giá trị đã gửi lên, hoặc `uuid` khi tính cả công ty) và `message`. Người trong `errors` không có phiếu; những người còn lại vẫn được tính và lưu. Mảng rỗng khi không ai lỗi.
  - `runId`: mã lần chạy nháp vừa lưu; là `null` khi không tính được phiếu nào (xem **Lưu trữ**).
  - Ví dụ trên: `grossIncome` = `baseSalaryActual` + `totalAllowanceActual` + `kpiActualPay` (không có OT, nghỉ phép hay trừ đi muộn) = 5.076.923 + 2.030.769 + 3.000.000 = 10.107.692. `netIncome` = `grossIncome` − `insuranceDeduction` − thuế TNCN − `advanceDeduction`; dòng tóm tắt không có thuế, ở ví dụ này thuế là 0 vì thu nhập tính thuế 10.107.692 − 630.000 − 15.500.000 < 0, nên 10.107.692 − 630.000 − 0 − 0 = 9.477.692. Nhân sự trong ví dụ có nhãn hợp đồng "HĐLĐ từ 3 tháng": luôn đóng bảo hiểm (630.000 = 10,5% × lương cơ bản 6.000.000) và tính thuế lũy tiến.
- **Lưu trữ**: Mỗi lần gọi tính được ít nhất một phiếu lương tạo một lần chạy nháp (`draft`) mới của tháng (`run_no` + 1) và chuyển các lần nháp trước thành `superseded` (lần gọi không tính được phiếu nào thì không tạo gì, xem bên dưới); `GET` chỉ trả lần chạy mới nhất chưa bị thay thế. Tháng đã có lần chạy `final` thì không tính lại được.
  - **Tính lại một phần** (gửi `employeeIds` không rỗng): lần chạy mới chứa phiếu vừa tính của những người trong danh sách, cộng nguyên vẹn phiếu nháp của mọi nhân sự khác trong lần chạy nháp trước (được sao sang lần chạy mới); nhờ đó `GET` vẫn trả đủ phiếu của cả tháng. Người trong danh sách nhưng bị lỗi không có phiếu trong lần chạy mới (lỗi nằm trong `errors`). Số phiếu của lần chạy mới = số phiếu vừa tính + số phiếu sao sang. Người bị lỗi mất phiếu nháp cũ khi có người khác trong cùng lần gọi tính được, nhưng giữ phiếu cũ khi không ai trong lần gọi tính được (ví dụ danh sách chỉ có một người và người đó lỗi), vì khi đó không lưu gì. Tính cả công ty (không gửi `employeeIds`) không sao chép gì từ lần trước.
  - **Không tính được phiếu nào** (mọi nhân sự trong danh sách đều lỗi, hoặc không có nhân sự nào để tính): không lưu gì, không có lần chạy mới và không `superseded` lần nháp trước, nên lần nháp trước vẫn là lần hiện hành. Phản hồi vẫn là 200 với `runId: null`, `count: 0`, `items: []` và `errors` mô tả từng lỗi.
- **Lỗi**:

  | HTTP | `code` | Khi nào |
  |------|--------|---------|
  | 400 | `INVALID_MONTH` | `:month` sai định dạng |
  | 400 | `INVALID_EMPLOYEE_IDS` | `employeeIds` có mặt nhưng không phải mảng các chuỗi không rỗng và không chỉ gồm khoảng trắng (`error`: `employeeIds phải là danh sách mã nhân sự`) |
  | 400 | `CALCULATE_ERROR` | Lỗi khác khi tính hoặc lưu (`error` mô tả lỗi) |
  | 409 | `PAYROLL_FINALIZED` | Kỳ lương của tháng đã chốt (`final`), không thể tính lại |

#### `GET /api/v2/payroll/:month`
- **Mục đích**: Lấy danh sách phiếu lương của kỳ, thuộc lần chạy mới nhất chưa bị thay thế. Tháng chưa tính trả `items: []`.
- **Response 200**: `{ "month": "2026-11", "items": [ <bản ghi phiếu lương> ] }`.
- **Bản ghi phiếu lương**:

  | Trường | Ý nghĩa |
  |--------|---------|
  | `id`, `runId` | Mã phiếu và mã lần chạy chứa phiếu |
  | `username` | Tài khoản của nhân sự |
  | `status` | Trạng thái phiếu; phiếu vừa tính là `draft` |
  | `gross`, `insurance`, `tax`, `advance`, `net` | Tổng thu nhập, bảo hiểm, thuế TNCN, tạm ứng, thực lĩnh (số nguyên VND) |
  | `warnings` | Danh sách cờ cảnh báo của phiếu (xem bảng mã cờ bên dưới); `[]` nếu không có |
  | `details` | Toàn bộ phiếu chi tiết như lúc tính (mô tả ở mục dưới) |

#### `GET /api/v2/payroll/:month/:employeeId`
- **Mục đích**: Lấy phiếu lương chi tiết từng dòng (ngày công, giờ làm, ca đêm, phụ cấp, OT, KPI, thuế TNCN, bảo hiểm, thực lĩnh). `:employeeId` là `uuid` hoặc `username`.
- **Response 200**: `{ "month": "2026-11", "payslip": <bản ghi phiếu lương> }`. Phiếu chi tiết nằm ở `payslip.details`.
- **Lỗi**: `404` với `code: "PAYSLIP_NOT_FOUND"` khi tháng chưa tính hoặc nhân sự không có phiếu trong lần chạy hiện tại.
- **Các trường mới và đổi nghĩa trong `details`**:

  | Trường | Ý nghĩa |
  |--------|---------|
  | `username` | Tài khoản của nhân sự (khác `employeeId`, vốn là `uuid`) |
  | `kpiApplicable` | `true` nếu chức vụ bật phúc lợi KPI và bậc có mức KPI tối đa; `false` thì KPI = 0 và không có cờ KPI |
  | `kpiScores` | **Đổi nghĩa**: điểm từng thành phần theo thang 0–100 (`wework`, `user`, `peer`, `manager`, `self`); `null` là chưa nhập |
  | `kpiTotalScorePct` | **Đổi nghĩa**: tổng điểm KPI theo phần trăm, 0–100 (2 chữ số thập phân) = Wework×40% + user×24% + peer×18% + manager×12% + self×6%; thành phần chưa nhập tính 0 |
  | `kpiProposedAmount` | Lương KPI đề xuất của tháng; `null` là chưa nhập |
  | `kpiAppliedAmount` | Mức KPI được áp dụng = nhỏ hơn của `kpiProposedAmount` và mức KPI tối đa của bậc; chưa đề xuất thì 0 |
  | `kpiMaxSalary` | **Đổi nghĩa**: bằng `kpiAppliedAmount` (mức KPI dùng để tính), không còn là mức tối đa của bậc |
  | `kpiActualPay` | Lương KPI thực nhận = `round(kpiAppliedAmount × units / 1.000.000)`, với `units` = Σ(điểm × 100 × trọng số) của 5 thành phần (trọng số 40/24/18/12/6; thành phần chưa nhập tính 0). Tính trên `units` chưa làm tròn, không dùng `kpiTotalScorePct` đã làm tròn 2 chữ số thập phân |
  | `insuranceDeduction`, `insuranceBreakdown` | Bảo hiểm khấu trừ và từng phần `{ bhxh, bhyt, bhtn }` (mặc định 8% + 1,5% + 1% = 10,5% lương cơ bản của bậc, tỷ lệ cấu hình được). Nhãn hợp đồng "HĐLĐ từ 3 tháng" luôn đóng bảo hiểm, bất kể cờ `insured` của nhân sự; nhãn "Dưới 3 tháng" chỉ đóng khi cờ `insured` được đặt và khác 0 (để trống hoặc 0 thì bảo hiểm là 0) |
  | `contractStatusText` | Nhãn hợp đồng đã xác định của nhân sự: "HĐLĐ từ 3 tháng" hoặc "Dưới 3 tháng". Lấy từ cột `staff.contract` (`long` hoặc `short`, viết thường đúng như vậy); nhãn trống hoặc giá trị khác (kể cả một ngày) thì theo loại nhân sự: `tts` là "Dưới 3 tháng", `nv`, `ctv` và loại khác là "HĐLĐ từ 3 tháng" |
  | `taxMethod` | Cách tính thuế, chỉ theo nhãn hợp đồng: "HĐLĐ từ 3 tháng" → `progressive` (lũy tiến); "Dưới 3 tháng" → `flat10` (10% của `grossIncome`, chỉ khi `grossIncome` ≥ 5.000.000; dưới mức đó thuế là 0). Cờ `tax_on` và `deduct_on` của nhân sự bị bỏ qua (không có công tắc tắt thuế hay giảm trừ gia cảnh) và ngày bắt đầu hợp đồng không ảnh hưởng thuế. `none` chỉ gặp ở phiếu dựng tay không chọn cách tính thuế; việc tính lương không bao giờ cho ra `none` |
  | `dependants` | Số người phụ thuộc dùng để giảm trừ |
  | `taxExemptIncome`, `taxableIncome`, `taxAssessableIncome` | `taxExemptIncome` (phần thu nhập miễn thuế) = phần OT vượt đơn giá giờ thường (giờ OT 150% miễn 0,5, 200% miễn 1, 300% miễn 2 lần đơn giá giờ, làm tròn) + phần ca đêm miễn thuế. Phần ca đêm: với mỗi dòng ngày ca `NIGHT`, lấy số nhỏ hơn giữa `workHours` × đơn giá giờ × 0,3 và phụ cấp ca đêm của dòng đó (ngày ca đêm không được trả phụ cấp, như ngày làm bù, thì 0; dòng ca khác thì 0), cộng các dòng rồi làm tròn. `taxableIncome` (thu nhập chịu thuế) = `grossIncome` − `taxExemptIncome`. `taxAssessableIncome` (thu nhập tính thuế): `progressive` là sau bảo hiểm và giảm trừ bản thân 15.500.000 + 6.200.000 mỗi người phụ thuộc; `flat10` bằng `grossIncome` khi thuế áp dụng và 0 khi `grossIncome` dưới 5.000.000; `none` là 0 |
  | `personalIncomeTax` | Thuế TNCN phải nộp |
  | `warnings` | Cờ cảnh báo của phiếu, cùng nội dung với `warnings` của bản ghi |

  `netIncome` = `grossIncome` − `insuranceDeduction` − `personalIncomeTax` − `advanceDeduction`.

- **Cờ cảnh báo `warnings`**: mỗi phần tử có dạng `{ "code": "KPI_SCORE_MISSING", "message": "Thiếu điểm KPI; cột thiếu tính 0 điểm.", "fields": ["peer", "self"] }`. `fields` chỉ xuất hiện ở cờ có kèm danh sách (hiện chỉ `KPI_SCORE_MISSING`). Cờ không chặn việc tính, phiếu vẫn được lưu.

  | Mã cờ | Thông báo |
  |-------|-----------|
  | `KPI_PROPOSAL_MISSING` | Chưa nhập lương KPI đề xuất của tháng; lương KPI tạm tính 0. |
  | `KPI_SCORE_MISSING` | Thiếu điểm KPI; cột thiếu tính 0 điểm. |
  | `KPI_PROPOSAL_EXCEEDS_MAX` | Lương KPI đề xuất vượt mức KPI của bậc; đã tính theo mức của bậc. |

  Nhập mới qua `PUT .../kpi/:username` luôn bị từ chối khi đề xuất vượt mức tối đa, nên `KPI_PROPOSAL_EXCEEDS_MAX` chỉ còn xuất hiện khi mức tối đa của bậc giảm sau khi đã nhập đề xuất.

#### `PUT /api/v2/payroll/:month/kpi/:username`
- **Mục đích**: Nhập điểm đánh giá KPI và lương KPI đề xuất của tháng cho nhân viên. Có thể gửi từng phần: chỉ các trường có trong body được ghi.
- **Request Body** (mọi trường đều tùy chọn):
  ```json
  {
    "wework": 87.5,
    "user": 90,
    "peer": 85,
    "manager": 95,
    "self": 90,
    "proposedAmount": 5000000
  }
  ```
  - Điểm `wework`, `user`, `peer`, `manager`, `self`: số từ 0 đến 100, tối đa 2 chữ số thập phân (hệ thống lưu `điểm × 100` làm tròn thành số nguyên). Trọng số khi tính lương: 40% / 24% / 18% / 12% / 6%.
  - `userScore` và `selfScore` là tên khác của `user` và `self`. Gửi cả hai tên thì dùng tên ngắn (`user`, `self`).
  - `proposedAmount`: lương KPI đề xuất của tháng, số nguyên ≥ 0, không được vượt mức KPI tối đa của bậc nhân sự trong tháng đó. Nhân sự không áp dụng KPI chỉ được nhận `0` hoặc `null`.
  - Trường bỏ trống (không có trong body) giữ nguyên giá trị đang lưu; trường gửi `null` thì xóa giá trị (về "chưa nhập").
- **Response 200**: `{ "updated": true, "username": "a", "month": "2026-11" }`.
- **Lỗi**: kiểm tra `username` trước, rồi đến các điểm, rồi đến `proposedAmount`; có lỗi thì không ghi gì.

  | HTTP | `code` | Khi nào |
  |------|--------|---------|
  | 400 | `INVALID_MONTH` | `:month` sai định dạng |
  | 400 | `INVALID_KPI_SCORE` | Một điểm không phải số từ 0 đến 100, hoặc `proposedAmount` không phải số nguyên ≥ 0 |
  | 400 | `KPI_NOT_APPLICABLE` | `proposedAmount` > 0 nhưng chức vụ hoặc bậc của nhân sự không áp dụng lương KPI |
  | 400 | `KPI_PROPOSAL_EXCEEDS_MAX` | `proposedAmount` lớn hơn mức KPI tối đa của bậc; `error` ghi mức tối đa, ví dụ `Lương KPI đề xuất phải nhỏ hơn hoặc bằng 6000000 đồng` |
  | 404 | `EMPLOYEE_NOT_FOUND` | Không có nhân sự nào mang `username` này |

---

### 3.6. System Module (Cài đặt & Giám sát)

#### `GET /api/v2/system/health`
- **Response 200**: `{"ok": true, "timestamp": "2026-11-04T07:55:21.259Z"}`

#### `GET /api/v2/system/settings` & `PUT /api/v2/system/settings/:key`
- Lấy và cập nhật cài đặt hệ thống.

#### `GET /api/v2/system/audit`
- Lấy nhật ký kiểm toán hệ thống.

#### `POST /api/v2/system/periods/:month/lock`
- Chốt và khóa bảng chấm công kỳ lương để ngăn chỉnh sửa.

---

### 3.7. Holidays Module (Lịch lễ công ty)

Một lịch lễ chung cho cả công ty, do Admin tick. Mỗi ngày lễ gồm `date` (`YYYY-MM-DD`) và `name`; mỗi ngày chỉ có một dòng. Thêm hay xoá ngày lễ **không** sửa các đơn đã nộp: `leave_days_count` giữ như lúc nộp. Chưa kiểm vai trò ở các route này.

Mọi lỗi dưới đây có dạng `{ "error": "<câu tiếng Việt>", "code": "<mã>" }`. Ngoài `404 HOLIDAY_NOT_FOUND`, lỗi nào cũng là `400` với `code: "BAD_REQUEST"`.

#### `GET /api/v2/holidays?year=2026`
- **Mục đích**: Danh sách ngày lễ của một năm, sắp theo ngày tăng dần.
- **Query**: `year` tuỳ chọn, số nguyên từ 2000 đến 2100. Không gửi thì lấy năm hiện tại theo giờ Việt Nam.
- **Response 200**:
  ```json
  {
    "items": [
      { "date": "2026-01-01", "name": "Tết Dương lịch" },
      { "date": "2026-09-02", "name": "Quốc khánh" }
    ]
  }
  ```
- **Lỗi**: `400` `Năm không hợp lệ: <giá trị>` khi `year` không phải số nguyên 2000–2100.

#### `POST /api/v2/holidays`
- **Mục đích**: Thêm một ngày lễ.
- **Request Body**:
  ```json
  { "date": "2026-10-10", "name": "Giỗ Tổ Hùng Vương" }
  ```
  - `date`: ngày có thật dạng `YYYY-MM-DD` (`2026-02-30` là sai).
  - `name`: chuỗi không rỗng; khoảng trắng hai đầu được cắt bỏ.
- **Response 201**: `{ "created": true, "holiday": { "date": "2026-10-10", "name": "Giỗ Tổ Hùng Vương" } }`. Người thêm (`username` của phiên đăng nhập) được ghi vào `created_by`.
- **Lỗi** (`400`, kiểm theo thứ tự):

  | Thứ tự | `error` | Khi nào |
  |--------|---------|---------|
  | 1 | `Ngày lễ không hợp lệ: <giá trị>` | Thiếu `date`, không phải chuỗi, sai định dạng hoặc ngày không tồn tại |
  | 2 | `Tên ngày lễ không được trống` | Thiếu `name`, không phải chuỗi hoặc chỉ gồm khoảng trắng |
  | 3 | `Ngày <dd/mm/yyyy> đã có trong lịch lễ` | Ngày đó đã có trong lịch (ví dụ `Ngày 02/09/2026 đã có trong lịch lễ`) |

#### `POST /api/v2/holidays/quick-add`
- **Mục đích**: Thêm nhanh bốn ngày lễ cố định của một năm. Ngày đã có trong lịch thì bỏ qua và giữ nguyên tên cũ.
- **Request Body**: `{ "year": 2026 }`. `year` là số nguyên từ 2000 đến 2100.
- **Các ngày được thêm**:

  | Ngày | Tên |
  |------|-----|
  | 01/01 | Tết Dương lịch |
  | 30/04 | Ngày Giải phóng miền Nam |
  | 01/05 | Quốc tế Lao động |
  | 02/09 | Quốc khánh |
- **Response 201**: `{ "added": ["2026-01-01", "2026-04-30", "2026-05-01", "2026-09-02"] }`. `added` chỉ gồm các ngày vừa thêm, nên gọi lần hai cho cùng năm trả `{ "added": [] }`.
- **Lỗi**: `400` `Năm không hợp lệ: <giá trị>` khi thiếu `year` hoặc không phải số nguyên 2000–2100.

#### `DELETE /api/v2/holidays/:date`
- **Mục đích**: Xoá một ngày lễ. `:date` dạng `YYYY-MM-DD`.
- **Response 200**: `{ "deleted": true }`
- **Lỗi**:
  - `404` `Không có ngày lễ <date>` với `code: "HOLIDAY_NOT_FOUND"` khi ngày đó không có trong lịch.
  - `400` `Ngày lễ không hợp lệ: <date>` khi `:date` sai định dạng hoặc là ngày không tồn tại.
