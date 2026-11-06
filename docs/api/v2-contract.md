# TÀI LIỆU API CONTRACT V2 (DÀNH CHO FRONTEND AGENT)

Tài liệu này đặc tả toàn bộ giao diện API của hệ thống Backend **Lương Nhân Sự V2** (NestJS Modular Monolith + PostgreSQL). Frontend Agent vui lòng tuân thủ đúng chuẩn định dạng URL, phương thức HTTP, headers và payloads dưới đây.

---

## 1. NGUYÊN TẮC CHUNG & XÁC THỰC

- **Base URL**: `http://localhost:3000`
- **Content-Type**: `application/json; charset=utf-8`
- **Xác thực**:
  - Đăng nhập qua `POST /api/v2/auth/login` (không còn alias `/api/login`).
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
| **Xác thực** | `POST /api/login` | `POST /api/v2/auth/login` | POST | Đăng nhập tài khoản |
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
| | (mới) | `GET /api/v2/attendance/week` | GET | Lưới chấm công `days` ngày (tuần hoặc 4 tuần) của mọi người, BE tính ô ngày và tổng (Admin) |
| | (mới) | `GET /api/v2/attendance/employees/:username` | GET | Công cả tháng và lịch sử thao tác của một người (Admin) |
| **Tổng quan** | (mới) | `GET /api/v2/overview` | GET | Số liệu gộp cho màn Tổng quan (Admin) |
| **Đơn từ & Giải trình** | `POST /api/leave-requests` | `POST /api/v2/requests/leave` | POST | Nộp đơn nghỉ phép |
| | `POST /api/ot-requests` | `POST /api/v2/requests/overtime` | POST | Nộp đơn làm thêm giờ |
| | `POST /api/advance-requests` | `POST /api/v2/requests/advance` | POST | Nộp đơn tạm ứng lương |
| | `POST /api/explanations` | `POST /api/v2/requests/explanation` | POST | **Nộp đơn giải trình công (mới)** |
| | — (mới) | `POST /api/v2/requests/leave-with-makeup` | POST | **Nộp đơn nghỉ có làm bù** |
| | — (mới) | `POST /api/v2/requests/shift-change` | POST | **Nộp đơn đổi ca** |
| | — (mới) | `GET /api/v2/requests/leave-types` | GET | **Danh sách loại nghỉ** |
| | — (mới) | `GET /api/v2/requests/explanation-cases` | GET | **Danh sách trường hợp giải trình** |
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
| | — (mới) | `GET /api/v2/system/audit/verify` | GET | Kiểm tra chuỗi băm nhật ký |
| **Kỳ lương** | `POST /api/periods/:month/lock` | `POST /api/v2/system/periods/:month/lock` | POST | Chốt công kỳ lương |
| | — (mới) | `POST /api/v2/system/periods/:month/unlock` | POST | Mở lại công (cần lý do) |
| | — (mới) | `POST /api/v2/system/periods/:month/approve` | POST | Phê duyệt kỳ |
| | — (mới) | `POST /api/v2/system/periods/:month/unapprove` | POST | Huỷ phê duyệt (cần lý do) |
| | — (mới) | `POST /api/v2/system/periods/:month/pay` | POST | Đã trả lương |
| | — (mới) | `GET /api/v2/system/periods` & `GET /api/v2/system/periods/:month` | GET | Danh sách kỳ, chi tiết một kỳ |

---

## 3. CHI TIẾT CÁC ENDPOINT V2 THEO MODULE

### 3.1. Auth Module (Xác thực & Phiên làm việc)

#### `POST /api/v2/auth/login`
- **Mục đích**: Đăng nhập hệ thống.
- **Request Body**:
  ```json
  {
    "username": "tran-minh-ngoc",
    "password": "Mật khẩu"
  }
  ```
- **Response 201**:
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
  - `month`: `YYYY-MM`, tháng đang xem cho `work` và `summary` (mặc định tháng này theo giờ Việt Nam). Sai định dạng: `400 INVALID_MONTH`. Bộ lọc `status`/`shiftType`/`q` chỉ thu hẹp `employees`, `summary` luôn tính trên toàn bộ hồ sơ.
- **Response 200** (rút gọn; `work` và `summary` mô tả ngay dưới):
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
    "total": 1,
    "summary": { "month": "2026-11", "asOf": "2026-11-06", "...": "xem bên dưới" }
  }
  ```
- `total`: số phần tử của `employees` sau bộ lọc.
- `employees[].work` (FE chỉ hiện, không tự tính): `{ active, status, statusLabel, joinedOn, tenure }`.
  - `active`: đang làm vào `summary.asOf` (đã vào làm và chưa nghỉ việc; `resignedOn` > `asOf`; trạng thái `nghiviec` không ghi ngày nghỉ thì coi như đã nghỉ).
  - `status` ∈ `ok | try | off | out` (`out` = `nghiviec`; `off` = tài khoản đang khoá; `try` = `thuviec`; còn lại `ok`) và `statusLabel` tương ứng "Chính thức", "Thử việc", "Tạm nghỉ", "Đã nghỉ việc".
  - `joinedOn`: `contract.effectiveFrom`, thiếu thì ngày tạo tài khoản theo giờ Việt Nam.
  - `tenure`: thâm niên đến `asOf` dạng chữ ("1 năm 10 tháng", "4 ngày"); rỗng khi đã nghỉ việc (`out`) hoặc chưa tới ngày vào làm.
- `summary` (cho thẻ chỉ số màn Nhân sự và số người mỗi loại ở màn Chế độ theo loại):
  - `month`, `prevMonth` (tháng trước `month`), `asOf` (hôm nay nếu `month` là tháng này, ngược lại ngày cuối `month`), `compareYear` (năm trước năm của `asOf`), `total` (mọi hồ sơ).
  - `active`, `joined`, `left`, `tenure`: mỗi mục `{ value, prev, delta: { dir: "up" | "down", value } }`. `active`: người đang làm ở `asOf` so với cuối `prevMonth`. `joined`/`left`: vào làm / nghỉ việc trong `month` so với `prevMonth`. `tenure`: thâm niên trung bình (năm, 1 chữ số thập phân) của người đang làm, so với cuối `compareYear`. `delta.dir` = `up` khi `value` >= `prev`; `delta.value` là chênh lệch tuyệt đối.
  - `inactiveAccounts`: số tài khoản chưa kích hoạt (đang khoá) trong mọi hồ sơ.
  - Đếm người đang làm ở `asOf`: `byType` (`{ "nv": 3 }`, theo `position.type`), `byLevel` (`{ "nv": { "1": 2 } }`), `byTerm` (`{ long, short, unset }`), `byStatus` (`{ ok, try, off, out }`).
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

#### `GET /api/v2/employees/:username`
- **Mục đích**: Hồ sơ đầy đủ của một nhân sự (mở ngăn kéo hồ sơ). `:username` nhận cả `username` lẫn `uuid`.
- **Quyền**: `staff.manage`.
- **Response 200**: `{ "employee": { ... } }`, `employee` cùng cấu trúc một phần tử của `GET /api/v2/employees` (`profile`, `account`, `contract`, `work` tính đến hôm nay; `POST`/`PUT` không trả `work`):
  ```json
  {
    "employee": {
      "profile": { "uuid": "2a223e27-5247-4cc5-be40-d0ebb42dc8b3", "familyName": "", "givenName": "Pw-staff", "fullName": "Pw-staff", "birthday": null, "dependants": 0 },
      "account": { "username": "pw-staff", "roles": ["staff"], "primaryRole": "staff", "isLocked": false, "lockedAt": null, "lockedBy": null, "createdAt": "2026-11-05T21:51:26.122Z" },
      "contract": {
        "position": { "type": "nv", "level": 1, "jobTitle": null },
        "shift": { "type": "NORMAL", "startTime": "08:00", "endTime": "17:00", "allowancePct": 0, "isOvernight": false },
        "leave": { "totalDays": 0, "usedDays": 0, "remainingDays": 0 },
        "status": "nv", "term": null, "effectiveFrom": null, "resignedOn": null,
        "hasInsurance": null, "isUnionMember": false, "hasTax": true, "canAdvance": true, "isDormResident": false
      },
      "work": { "active": true, "status": "ok", "statusLabel": "Chính thức", "joinedOn": "2026-11-05", "tenure": "1 ngày" }
    }
  }
  ```
- **Lỗi**: `404 EMPLOYEE_NOT_FOUND` (`Không tìm thấy nhân viên`); `403` thiếu quyền.

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
- **Response 201**:
  ```json
  {
    "punch": {
      "id": "punch-uuid",
      "employeeId": "4391e6b3-8fa4-4ee9-b4be-5b232c943891",
      "type": "IN",
      "punchedAt": "2026-11-04T08:30:00.000Z",
      "isWithinOffice": true
    },
    "timesheet": { "workDate": "2026-11-04", "status": "PRESENT", "payUnits": 0, "dayStatus": "NEEDS_EXPLANATION" }
  }
  ```
  - `timesheet` là dòng ngày (cùng dạng với phần tử của `GET /api/v2/attendance/timesheets` bên dưới) đọc lại sau khi tính, rút gọn ở ví dụ.
  - Lần chấm chạy dưới khoá của nhân sự (cùng khoá với Đơn từ) và không còn tạo dòng lịch `REGULAR` trong `work_schedules`. Body không còn nhận `shiftConfig`: ca của ngày lấy từ lịch đổi ca đã duyệt, không thì từ ca mặc định của hồ sơ.
  - `workDate` không bắt buộc. Không gửi thì ngày công là ngày (giờ Việt Nam) của `punchedAt` (mặc định bây giờ); riêng lần `OUT` chấm trước 12:00 thuộc ngày hôm trước khi ca hôm trước qua nửa đêm và hôm trước có lần vào mà chưa có lần ra (ca đêm). Có gửi `workDate` thì giữ nguyên ngày đó.
- **Lỗi**:

  | HTTP | `code` | Khi nào |
  |------|--------|---------|
  | 400 | `BAD_PUNCH_INPUT` | Dữ liệu chấm không hợp lệ (`error` là câu lỗi), ví dụ thiếu `employeeId`, `type` không phải `IN`/`OUT`. `workDate` có gửi mà không phải ngày có thật dạng `YYYY-MM-DD` (như `20261020`, ` 2026-10-20`, `2026-02-30`): `Ngày công (workDate) không hợp lệ (YYYY-MM-DD): <giá trị>`. Ba lỗi đầu vào này kiểm theo thứ tự `employeeId` → `type` → `workDate`, trước cổng kỳ (`409 PERIOD_LOCKED`) và trước mọi bước đọc hay ghi. Sau cổng kỳ: ngày công có lịch nghỉ phép / làm bù đã duyệt, hoặc dòng ngày đã khoá kỳ lương. Lần chấm không được lưu |
  | 409 | `PERIOD_LOCKED` | Tháng của **ngày công** không còn `open`: `workDate` nếu có gửi, không thì ngày công vừa xác định theo luật ca đêm ở trên (lần `OUT` lúc 05:00 ngày 01/12 của ca đêm 30/11 xét tháng 11, không xét tháng 12). Kèm `month`, `status`. Câu: `Tháng MM/YYYY đã chốt công` (`attendance_locked`, `calculated`), `Kỳ lương tháng MM/YYYY đã phê duyệt` (`approved`), `Kỳ lương tháng MM/YYYY đã trả lương` (`paid`). Xét trong khoá của nhân sự, ngay sau khi xác định ngày công và trước mọi kiểm tra khác (nghỉ đã duyệt, ngày đã khoá, ngày làm, vùng chấm công). Không ghi gì |

- Ngày công (`workDate`, giờ VN) nằm ngoài thời gian làm việc của nhân sự (trước `start_date` hoặc sau ngày nghỉ việc `resigned_on`; hai đầu còn tính) thì `409 NOT_EMPLOYED` (`Ngày dd/mm/yyyy nằm ngoài thời gian làm việc (...)`), cho cả `POST /api/v2/attendance/punches` lẫn `POST /api/v2/me/punches`; không ghi gì, không phát SSE.
- `POST /api/v2/me/punches` (nhân viên tự chấm; body `{ "kind": "IN" | "OUT", "lat", "lng", "accuracyM" }`, không gửi `workDate`, nên ngày công theo luật ca đêm như trên): cùng hai lỗi `400 BAD_PUNCH_INPUT` và `409 PERIOD_LOCKED` như trên.

#### `GET /api/v2/attendance/timesheets`
- **Query Params**: `employeeId`, `startDate` (`YYYY-MM-DD`), `endDate` (`YYYY-MM-DD`), `status` (một trong 11 giá trị `status` bên dưới).
- **Response 200**: `{ "timesheets": [...] }`, mỗi phần tử là một dòng ngày, sắp theo `workDate` rồi `employeeId`:
  ```json
  {
    "id": "row-uuid",
    "employeeId": "4391e6b3-8fa4-4ee9-b4be-5b232c943891",
    "workDate": "2026-11-03",
    "shiftType": "NORMAL",
    "shiftStartTime": "08:00",
    "shiftEndTime": "17:00",
    "shiftAllowancePct": 0,
    "actualCheckIn": "2026-11-03T01:40:00.000Z",
    "actualCheckOut": "2026-11-03T10:00:00.000Z",
    "metrics": { "workHours": 8.3, "workUnits": 0, "otHours": 0, "lateMinutes": 40, "earlyMinutes": 0 },
    "status": "PRESENT",
    "isLocked": false,
    "checkInStatus": "LATE",
    "checkOutStatus": "VALID",
    "dayStatus": "NEEDS_EXPLANATION",
    "leaveType": null,
    "sourceRequestId": null,
    "cases": [{ "code": "LATE_CHECK_IN", "minutes": 40, "affectsPay": true }],
    "explanationStatus": "NONE",
    "explanationRequestId": null,
    "payUnits": 0,
    "deductionMinutes": 0,
    "countsAsWorkday": false,
    "countsAsDayOff": false,
    "makeupMinutes": 0
  }
  ```
- **`status`** (loại ngày) có 11 giá trị: `OUTSIDE` (ngoài thời gian làm việc), `HOLIDAY` (lễ trên ngày làm), `ISAT` (iSAT đã duyệt), `LEAVE_PAID` (nghỉ có lương), `LEAVE_UNPAID` (nghỉ không lương hoặc BHXH), `LEAVE_MAKEUP` (nghỉ có làm bù), `REST` (ngoài tuần làm việc, không OT/bù), `EXTRA` (ngoài tuần làm việc, có khung OT hoặc bù đã duyệt), `PENDING` (ngày làm chưa tới mốc xét), `PRESENT` (có chấm công, hoặc có giải trình được duyệt), `ABSENT` (ngày làm đã xét, không có lần chấm).
- **Trường mới của dòng ngày**: `leaveType` (6 mã loại nghỉ, `null` khi không phải ngày `LEAVE_*`), `sourceRequestId` (đơn nghỉ / nghỉ có bù / iSAT của ngày), `cases` (các trường hợp cần giải trình `[{ code, minutes, affectsPay }]`, rỗng khi đúng giờ), `explanationStatus` (`NONE` | `PENDING` | `APPROVED` | `REJECTED`), `explanationRequestId`, `payUnits` (0 hoặc 1), `deductionMinutes`, `countsAsWorkday`, `countsAsDayOff`, `makeupMinutes`.
- **Có thể `null`**: `shiftType`, `shiftStartTime`, `shiftEndTime`, `shiftAllowancePct` rỗng trên ngày không có ca (`OUTSIDE`, `REST`, `EXTRA`, ngày lễ...). `metrics.workUnits` bằng `payUnits`; `metrics.otHours` luôn 0 (OT đo ở phiếu lương).
- `dayStatus`, `checkInStatus`, `checkOutStatus` là cột cũ, ghi cho khớp với `status` để FE cũ vẫn đọc được.

#### `GET /api/v2/attendance/timesheets/:employeeId/:workDate`
- **Mục đích**: Một dòng ngày của một nhân sự ở một ngày công (mở chi tiết ngày trong bảng công Admin).
- **Quyền**: `attendance.correct`.
- **Path**: `:employeeId` là `uuid` của nhân sự; `:workDate` dạng `YYYY-MM-DD`.
- **Response 200**: `{ "timesheet": { ... } }`, `timesheet` là đúng một phần tử như của `GET /api/v2/attendance/timesheets` (cùng các trường ở trên).
- **Lỗi**: `404 TIMESHEET_NOT_FOUND` (`Không tìm thấy bảng công`) khi chưa có dòng ngày đó (kể cả `employeeId` không tồn tại); `403` thiếu quyền.

#### `GET /api/v2/attendance/week?from=YYYY-MM-DD&days=&q=&group=&month=YYYY-MM`
- **Mục đích**: Lưới chấm công Admin do BE tính hết (ô ngày, tổng Công / Trễ / OT, cờ cần xử lý, thẻ số, danh sách việc cần xử lý); FE chỉ định dạng và hiển thị. Đọc dòng ngày dùng chung (`timesheet_entries`) như `/me`, không bảng mới.
- **Quyền**: `attendance.correct`.
- **Query**: `from` ngày có thật; cửa sổ bắt đầu từ **thứ Hai của tuần chứa `from`**. Không có `from`: `days` ≤ 7 thì tuần hôm nay (giờ Việt Nam), `days` > 7 thì tuần cách hôm nay 14 ngày (lưới 4 tuần: hôm nay ở tuần thứ ba). `days` số ngày liên tiếp, mặc định 7, tối đa 35 (`400 INVALID_DAYS` ngoài khoảng). `q` lọc theo tên hoặc `username`, không phân biệt hoa thường và dấu. `group` lọc theo mã chức vụ (`position.type`) hoặc loại ca (`shift.type`). `month` (mặc định tháng hôm nay) là tháng của cột Công / Trễ / OT và các thẻ số. Chỉ liệt kê người còn làm trong cửa sổ (đã vào làm, chưa nghỉ việc trước ngày đầu). Chưa phân trang (trả hết, `total` / `matched` để FE hiện số).
- **Response 200** (đã rút gọn; file đầy đủ: `web/tests/fixtures/api/attendance-week.json`):
  ```json
  {
    "today": "2026-10-20",
    "month": "2026-10",
    "periodState": "locked",
    "subtitle": "Kỳ công 01–31/10/2026 · hôm nay Thứ Ba 20/10",
    "tiles": [
      {
        "key": "todo",
        "label": "Cần xử lý",
        "value": 6,
        "note": "5 chưa giải trình · 1 yêu cầu chờ duyệt"
      },
      {
        "key": "present",
        "label": "Có mặt hôm nay",
        "value": 1,
        "of": 3,
        "note": "2 người chưa Check-in"
      },
      {
        "key": "late",
        "label": "Đi muộn hôm nay",
        "value": 0,
        "note": ""
      },
      {
        "key": "leave",
        "label": "Nghỉ có phép",
        "value": 0,
        "note": "1 đơn chờ duyệt"
      },
      {
        "key": "absent",
        "label": "Vắng không phép",
        "value": 4,
        "note": "trong tháng 10"
      },
      {
        "key": "ot",
        "label": "Làm thêm tháng này",
        "value": 0,
        "unit": "giờ",
        "note": "0 yêu cầu chờ duyệt"
      }
    ],
    "days": [
      {
        "iso": "2026-10-05",
        "dow": "T2",
        "dm": "05/10",
        "scheduled": true,
        "today": false,
        "monday": true,
        "periodStart": false
      },
      {
        "iso": "2026-10-20",
        "dow": "T3",
        "dm": "20/10",
        "scheduled": true,
        "today": true,
        "monday": false,
        "periodStart": false
      }
    ],
    "groups": [
      {
        "key": "nv",
        "count": 3
      }
    ],
    "rows": [
      {
        "username": "nv2",
        "name": "Trần Thị Hai",
        "initials": "TH",
        "group": "nv",
        "title": null,
        "code": "nv2",
        "startDate": "2026-01-05",
        "contract": "Nhân viên chính thức",
        "position": {
          "type": "nv",
          "level": 1,
          "jobTitle": null
        },
        "shift": {
          "type": "NORMAL",
          "startTime": "08:00",
          "endTime": "17:00",
          "allowancePct": 0,
          "isOvernight": false
        },
        "shiftText": "HC 08:00–17:00",
        "leaveLeftDays": 0,
        "days": [
          {
            "date": "2026-10-08",
            "dow": "T5",
            "day": "8",
            "today": false,
            "kind": "work",
            "base": "work",
            "text": "08:00–17:00",
            "in": "08:00",
            "out": "17:00",
            "live": false,
            "lateMinutes": 0,
            "explanationStatus": "none",
            "cases": [],
            "itemId": null,
            "label": "Đi làm",
            "aria": "Đi làm, 08:00–17:00"
          },
          {
            "date": "2026-10-20",
            "dow": "T3",
            "day": "20",
            "today": true,
            "kind": "nocheck",
            "base": "nocheck",
            "text": "HC 08:00–17:00",
            "in": null,
            "out": null,
            "live": false,
            "lateMinutes": 0,
            "explanationStatus": "none",
            "cases": [],
            "itemId": null,
            "label": "Chưa Check-in",
            "aria": "Chưa Check-in, HC 08:00–17:00"
          }
        ],
        "totals": {
          "workDays": 10,
          "lateMinutes": 40,
          "otHours": 0
        },
        "needsAction": 3
      }
    ],
    "pending": [
      {
        "id": "00000000-0000-4000-8000-0000000000aa",
        "kind": "leave",
        "group": "leave",
        "groupLabel": "Đơn nghỉ",
        "action": "decide",
        "username": "nv2",
        "name": "Trần Thị Hai",
        "initials": "TH",
        "title": null,
        "what": "Nghỉ phép",
        "when": "15/10–16/10",
        "days": [
          "2026-10-15",
          "2026-10-16"
        ],
        "age": "7 ngày",
        "date": "2026-10-15"
      }
    ],
    "total": 3,
    "matched": 3
  }
  ```
  - `rows[]`: một người, xếp theo họ tên (tiếng Việt). `group` = mã chức vụ (BE chưa có phòng ban). `days` đúng `days` ô, **một định nghĩa ô ngày duy nhất** (xem dưới). `totals` là của tháng `month`: `workDays` = số dòng ngày có `countsAsWorkday`, `lateMinutes` = tổng phút trễ, `otHours` = tổng giờ OT của đơn làm thêm **đã duyệt** có `otDate` trong tháng (giờ OT của bảng công luôn 0). `needsAction` = số ô `todo` trong cửa sổ.
  - **Ô ngày** (`rows[].days[]`, `GET /attendance/employees/:username` `days[]`): `kind` ∈ `work | late | leave | absent | todo | off | fu | nocheck`; `base` là loại trước lớp "cần xử lý". Quy tắc: ngày chưa có dòng, thuộc tuần làm: tương lai → `fu`, hôm nay → `nocheck`, quá khứ → `absent`; ngày không thuộc tuần làm (hoặc Chủ nhật) → `off`; hôm nay chưa chấm vào (kể cả dòng đã lập sẵn) → `nocheck`, **không phải** `absent`; nghỉ phép / nghỉ lễ → `leave` (`text` "Nghỉ" / "Nghỉ lễ"); có tiền phạt giờ (`deductionMinutes` > 0) → `late`; ngày có trường hợp ảnh hưởng tiền chưa giải trình duyệt → `todo`. Một đơn chờ duyệt hoặc ngày cần giải trình rơi vào ô thì `kind` = `todo` (và `itemId` = id đơn hoặc `due:<uuid>:<ngày>`), `base` giữ loại gốc. `text`: giờ "08:05–…" (đang làm), "08:00–17:00", "—" (vắng), chữ ca của `fu` / `nocheck`, rỗng khi `off`. `live`: hôm nay có giờ vào chưa có giờ ra. `label` / `aria` là chữ hiển thị / đọc màn hình.
  - `tiles[]` (6 thẻ, tính trên mọi người trong cửa sổ, không theo `q` / `group`): `todo` (số việc trong `pending`), `present` (`value` / `of`, có giờ vào hôm nay), `late`, `leave`, `absent` (số dòng `ABSENT` của tháng), `ot` (`unit` "giờ"). `note` là chữ phụ sẵn.
  - `pending[]`: việc cần xử lý có ngày rơi vào cửa sổ, một phần tử mỗi việc ở ngày đầu tiên trong cửa sổ (`date`), xếp theo ngày rồi `username`. `action` `decide` (đơn `PENDING`: giải trình, làm thêm, nghỉ phép / có làm bù, iSAT, đổi ca; ứng lương không có ngày nên không xuất hiện) hoặc `remind` (ngày cần nhắc giải trình, `kind` `explanation-due`). `group`: `att | leave | ot | exp | adv`. Đọc tối đa 500 đơn chờ.
- **Lỗi**: `400 INVALID_DATE` khi `from` không phải ngày có thật; `400 INVALID_DAYS`; `400 INVALID_MONTH`.

#### `GET /api/v2/attendance/employees/:username?month=YYYY-MM`
- **Mục đích**: Hồ sơ công cả tháng của một người cho màn / ngăn kéo chi tiết của Admin. Cùng nguồn và ô ngày với lưới tuần.
- **Quyền**: `attendance.correct`.
- **Query**: `month` bỏ trống thì tháng hiện tại (giờ Việt Nam).
- **Response 200** (rút gọn; đầy đủ: `web/tests/fixtures/api/attendance-employee.json`):
  ```json
  {
    "person": {
      "username": "nv1",
      "name": "Nguyễn Văn Một",
      "initials": "VM",
      "group": "nv",
      "title": null,
      "code": "nv1",
      "startDate": "2026-01-05",
      "contract": "Nhân viên chính thức",
      "position": {
        "type": "nv",
        "level": 1,
        "jobTitle": null
      },
      "shift": {
        "type": "NORMAL",
        "startTime": "08:00",
        "endTime": "17:00",
        "allowancePct": 0,
        "isOvernight": false
      },
      "shiftText": "HC 08:00–17:00",
      "leaveLeftDays": 0,
      "joinedMonth": "2026-01"
    },
    "month": "2026-10",
    "periodState": "locked",
    "locked": true,
    "index": 1,
    "total": 3,
    "prev": null,
    "next": "admin",
    "pending": {
      "count": 5,
      "date": "2026-10-01",
      "itemId": "due:00000000-0000-4000-8000-0000000000aa:2026-10-01",
      "group": "att",
      "text": "Quên chấm công · 01/10"
    },
    "stats": [
      {
        "key": "workDays",
        "label": "Ngày đi làm",
        "value": 11,
        "note": "trong tháng 10"
      },
      {
        "key": "late",
        "label": "Lần đi muộn",
        "value": 0,
        "note": "0 phút"
      },
      {
        "key": "ot",
        "label": "Làm thêm",
        "value": 0,
        "unit": "giờ",
        "note": ""
      },
      {
        "key": "leave",
        "label": "Phép năm còn",
        "value": 0,
        "unit": "ngày",
        "note": ""
      }
    ],
    "totals": {
      "workDays": 11,
      "standardDays": 26,
      "lateCount": 0,
      "paidLeaveDays": 0,
      "lateMinutes": 0,
      "otHours": 0,
      "absentDays": 0
    },
    "chips": {
      "work": 12,
      "late": 0,
      "leave": 0,
      "absent": 0,
      "todo": 5
    },
    "days": [
      {
        "date": "2026-10-14",
        "dow": "T4",
        "day": "14",
        "today": false,
        "kind": "work",
        "base": "work",
        "text": "08:00–17:00",
        "in": "08:00",
        "out": "17:00",
        "live": false,
        "lateMinutes": 0,
        "explanationStatus": "none",
        "cases": [],
        "itemId": null,
        "label": "Đi làm",
        "aria": "Đi làm, 08:00–17:00"
      },
      {
        "date": "2026-10-20",
        "dow": "T3",
        "day": "20",
        "today": true,
        "kind": "work",
        "base": "work",
        "text": "08:05–…",
        "in": "08:05",
        "out": null,
        "live": true,
        "lateMinutes": 0,
        "explanationStatus": "none",
        "cases": [],
        "itemId": null,
        "label": "Đi làm",
        "aria": "Đi làm, 08:05–…, đang làm"
      }
    ],
    "dayHistory": [
      {
        "date": "2026-10-20",
        "dayLabel": "Thứ Ba 20/10",
        "kind": "work",
        "tone": "work",
        "text": "08:05–…",
        "status": "Đi làm",
        "shift": "HC 08:00–17:00",
        "in": "08:05",
        "out": null,
        "itemId": null
      }
    ],
    "history": [
      {
        "at": "2026-10-20T01:00:00.000Z",
        "actor": "admin",
        "text": "attendance.recalculate: sửa giờ"
      }
    ]
  }
  ```
  - `person`: thông tin hồ sơ (`group`, `title`, `contract` chữ trạng thái hợp đồng, `startDate` ngày vào làm, `shiftText`, `leaveLeftDays`...). `days`: một ô mỗi ngày của tháng (cùng dạng ô như lưới tuần, kèm `dow`, `day`, `today`). `chips`: đếm ô theo `work | late | leave | absent | todo`. `totals`: `workDays`, `standardDays` (ngày công chuẩn theo tuần làm), `lateCount`, `paidLeaveDays`, `lateMinutes`, `otHours` (OT đã duyệt), `absentDays`. `stats[]`: 4 thẻ số (`value` số, `unit`, `note`). `locked` / `periodState`: kỳ công khoá (đã Chốt công hoặc có dòng ngày bị khoá).
  - `index` / `total` / `prev` / `next`: vị trí trong danh sách người còn làm trong tháng (xếp theo họ tên), `prev` / `next` là `username` người trước / sau, `null` ở đầu / cuối. `pending`: việc cần xử lý có ngày trong tháng (đếm, ngày đầu, chữ, `itemId`) hoặc `null`.
  - `dayHistory`: lịch sử từng ngày (mới nhất trước, đến hôm nay, bỏ ngày `off`). `history`: tối đa 50 dòng `audit_log` có `subject` = người này và `month` = tháng đang xem, mới nhất trước; `text` là `action` hoặc `action: reason`.
- **Lỗi**: `404 EMPLOYEE_NOT_FOUND` (không có nhân sự); `400 INVALID_MONTH`.

#### `GET /api/v2/overview/pending-count`
- **Mục đích**: Số trên chuông Admin, BE tính một con số duy nhất: đơn đang chờ duyệt cộng ngày cần giải trình (`GET /requests/explanations-due`), đúng hai nguồn của danh sách trong chuông. FE chỉ hiển thị.
- **Quyền**: `requests.review`.
- **Response 200**: `{ "count": 5 }`. Một trong hai nguồn lỗi thì cả route lỗi (không đếm thiếu); FE hiện trạng thái "không rõ" thay vì 0.

#### `GET /api/v2/overview?month=YYYY-MM&days=`
- **Mục đích**: Mọi con số của màn Tổng quan do BE tính; FE chỉ định dạng (tiền, tỷ ₫, ngày) và hiển thị.
- **Quyền**: `config.read`.
- **Query**: `month` bỏ trống thì tháng hiện tại. `days` số ngày làm gần nhất cho biểu đồ chấm công (mặc định 6, 1–14, `400 INVALID_DAYS` ngoài khoảng; bỏ Chủ nhật). Phần `payroll`, `period`, `kpis.payrollNet` theo `month`; phần người và công là của **hôm nay**.
- **Response 200** (rút gọn; đầy đủ: `web/tests/fixtures/api/overview.json`):
  ```json
  {
    "today": "2026-10-20",
    "month": "2026-10",
    "kpis": {
      "headcount": 3,
      "presentToday": 1,
      "notCheckedIn": 2,
      "pendingRequests": 1,
      "payrollNet": 16000000,
      "payrollGross": 16000000
    },
    "headline": {
      "blocking": 93,
      "closeOn": "2026-10-31",
      "daysLeft": 11
    },
    "attendance": {
      "today": {
        "work": 1,
        "late": 0,
        "leave": 0,
        "absent": 0,
        "todo": 0,
        "off": 0,
        "future": 0,
        "outside": 0,
        "extra": 0
      },
      "notCheckedIn": 2,
      "present": 1,
      "total": 3,
      "todayRate": 33,
      "days": [
        {
          "date": "2026-10-19",
          "dow": "T2",
          "dm": "19/10",
          "today": false,
          "present": 3,
          "total": 3,
          "rate": 100
        },
        {
          "date": "2026-10-20",
          "dow": "Hôm nay",
          "dm": "20/10",
          "today": true,
          "present": 1,
          "total": 3,
          "rate": 33
        }
      ]
    },
    "payroll": {
      "status": "calculated",
      "lines": [
        {
          "username": "nv2",
          "name": "Trần Thị Hai",
          "net": 9000000,
          "status": "draft"
        },
        {
          "username": "nv1",
          "name": "Nguyễn Văn Một",
          "net": 7000000,
          "status": "draft"
        }
      ],
      "rows": [
        {
          "username": "nv1",
          "name": "Nguyễn Văn Một",
          "initials": "VM",
          "title": null,
          "actualDays": 0,
          "standardDays": 0,
          "base": 0,
          "allowance": 0,
          "net": 7000000,
          "status": "draft"
        }
      ],
      "total": 2,
      "updatedAt": "12:00",
      "gross": 16000000,
      "insurance": 0,
      "tax": 0,
      "advance": 0,
      "deductions": 0,
      "net": 16000000,
      "netShare": 100,
      "counts": {
        "all": 2,
        "done": 0,
        "pending": 0,
        "draft": 2,
        "rejected": 0
      },
      "previous": null
    },
    "period": {
      "month": "2026-10",
      "state": "calculated",
      "label": "Chờ duyệt",
      "from": "2026-10-01",
      "to": "2026-10-31",
      "closeOn": "2026-10-31",
      "payday": "2026-11-10",
      "daysLeft": 11
    },
    "approvals": {
      "total": 93,
      "decide": 1,
      "remind": 92,
      "groups": [
        {
          "key": "leave",
          "label": "Đơn nghỉ",
          "count": 1
        },
        {
          "key": "att",
          "label": "Chấm công",
          "count": 92
        }
      ],
      "items": [
        {
          "id": "00000000-0000-4000-8000-0000000000aa",
          "kind": "leave",
          "group": "leave",
          "groupLabel": "Đơn nghỉ",
          "action": "decide",
          "username": "nv2",
          "name": "Trần Thị Hai",
          "initials": "TH",
          "title": null,
          "what": "Nghỉ phép",
          "when": "15/10–16/10",
          "days": [
            "2026-10-15",
            "2026-10-16"
          ],
          "age": "7 ngày"
        }
      ]
    }
  }
  ```
  - `kpis`: `headcount` người còn làm hôm nay; `presentToday` người đã có giờ vào (ô `work`, `late`, `todo`); `notCheckedIn` người hôm nay là ngày làm mà chưa chấm vào (không tính vắng); `pendingRequests` số đơn `PENDING` (= `approvals.decide`); `payrollNet` / `payrollGross` tổng các phiếu của lần chạy hiện tại (0 khi chưa tính).
  - `headline`: `blocking` = `approvals.total` (câu "Còn N việc phải xong trước khi chốt…"), `closeOn` ngày cuối tháng, `daysLeft` số ngày còn (≥ 0).
  - `attendance`: `today` đếm theo loại ô (`work late leave absent todo off future outside extra`; người `nocheck` nằm ở `notCheckedIn`, nên tổng các giá trị + `notCheckedIn` = `headcount`), `present`, `total`, `todayRate` (%), `days[]`: các ngày làm gần nhất cũ trước (`date`, `dow` "Hôm nay" hoặc T2…, `dm`, `today`, `present`, `total`, `rate` %).
  - `payroll`: `status`, `lines` (5 phiếu `net` cao nhất), `rows` (tối đa 6 phiếu theo tên: `title`, `actualDays` / `standardDays`, `base`, `allowance`, `net`, `status` `done | pending | draft | rejected`), `total` số phiếu, `gross`, `insurance`, `tax`, `advance`, `deductions` (= bảo hiểm + thuế + tạm ứng), `net`, `netShare` (% thực nhận / tổng thu nhập), `counts` (đếm phiếu theo trạng thái), `updatedAt` (HH:mm giờ VN), `previous` (tháng trước: `gross`, `net`, `grossDeltaPct`; `null` khi tháng trước chưa có phiếu).
  - `period`: `state` / `label` (chữ trạng thái kỳ), `from` / `to` kỳ công, `closeOn` hạn chốt (= cuối tháng), `payday` ngày trả lương (theo Lịch trả lương), `daysLeft`.
  - `approvals`: `total` = `decide` (đơn chờ duyệt) + `remind` (ngày cần nhắc giải trình), `groups[]` đếm theo nhóm, `items` 8 việc đầu (đơn chờ duyệt trước, mới nhất trước; cùng dạng `pending[]` của lưới tuần, không có `date`).
- **Lỗi**: `400 INVALID_MONTH`; `400 INVALID_DAYS`.

#### `POST /api/v2/attendance/recalculate`
- **Mục đích**: Admin tính lại dòng ngày từ nguồn sự thật (lần chấm, lịch, đơn, ngày lễ, hồ sơ), một ngày hoặc cả tháng. Dòng đã khoá kỳ lương không bị ghi lại; kết quả trả về là giá trị đang lưu.
- **Quyền**: `attendance.correct`.
- **Request Body**: `employeeId` (bắt buộc) cùng đúng một trong hai: `workDate` hoặc `month`.
  ```json
  { "employeeId": "4391e6b3-8fa4-4ee9-b4be-5b232c943891", "workDate": "2026-11-03" }
  ```
  ```json
  { "employeeId": "4391e6b3-8fa4-4ee9-b4be-5b232c943891", "month": "2026-11" }
  ```
- **Response 201**: gửi `workDate` → `{ "timesheet": { ...dòng ngày } }`; gửi `month` → `{ "timesheets": [ ...mọi dòng ngày của tháng, theo ngày tăng ] }`.
- **Lỗi**:

  | HTTP | `code` | Khi nào |
  |------|--------|---------|
  | 400 | `MISSING_PARAMS` | Thiếu `employeeId`, hoặc thiếu cả `workDate` lẫn `month` |
  | 400 | `AMBIGUOUS_PARAMS` | Gửi cả `workDate` lẫn `month` |
  | 400 | `INVALID_MONTH` | `month` không đúng `YYYY-MM` (ví dụ `2026-13`) |
  | 400 | `INVALID_DATE` | `workDate` không phải ngày có thật dạng `YYYY-MM-DD`. Câu: `Ngày công (workDate) không hợp lệ (YYYY-MM-DD): <giá trị>` |
  | 409 | `PERIOD_LOCKED` | Tháng của `workDate` (hoặc `month`) không còn `open` (câu và `month`, `status` như ở `POST .../punches`). Xét trong khoá của nhân sự, trước khi dựng lại dòng nào. Không ghi gì |

---

### 3.4. Requests Module (Đơn từ & Giải trình)

#### Quy ước chung: `warnings`, lỗi `DAY_CONFLICT`, lỗi `PERIOD_LOCKED`, trạng thái ngày
**Ngoài thời gian làm việc:** đơn có ngày (nghỉ, nghỉ có làm bù kể cả khung bù, đổi ca, OT, giải trình, iSAT) mà một ngày bất kỳ của đơn (đầu, cuối khoảng hoặc ngày đơn) nằm trước ngày vào làm hoặc sau ngày nghỉ việc thì bị từ chối `409 NOT_EMPLOYED` (xem trước: `200` với `{ ok: false, code: "NOT_EMPLOYED", message }`). Đơn không giữ ngày nào nên không trừ Phép năm.

Áp dụng cho 7 route tạo đơn của Admin (`POST /api/v2/requests/leave`, `.../leave-with-makeup`, `.../overtime`, `.../shift-change`, `.../explanation`, `.../advance`, `.../isat`) và `POST /api/v2/me/requests/:kind` với `:kind` là một trong cùng 7 tên đó (cùng thân trả về, cùng lỗi). Nguồn luật: `docs/superpowers/specs/2026-11-05-day-status-design.md`; riêng `PERIOD_LOCKED`: `docs/superpowers/specs/2026-11-05-payroll-period-lifecycle-design.md` §5.

- **Thân trả về khi tạo đơn** luôn có `warnings`, đứng cạnh `request` (không nằm trong `request`). Ví dụ trong các mục dưới chỉ ghi `created` và `request` cho gọn.
  ```json
  {
    "created": true,
    "request": { "id": "req-uuid", "type": "LEAVE", "status": "PENDING", "leaveDaysCount": 3 },
    "warnings": ["Thứ Bảy 14/11 đã có iSAT được duyệt, không tính vào đơn."]
  }
  ```
  - `warnings`: mảng chuỗi, rỗng khi không có gì để báo (đơn OT, tạm ứng, giải trình, iSAT luôn trả `[]`). Đơn vẫn được nhận; ngày bị bỏ không tính vào số ngày, Phép năm và giờ bù của đơn.
  - Hai loại cảnh báo: `Thứ Bảy dd/MM đã có iSAT được duyệt, không tính vào đơn.` (đơn nghỉ, nghỉ có làm bù, đổi ca) và `Ngày dd/MM đang nghỉ, giữ nguyên ngày nghỉ, không đổi ca.` (đơn đổi ca).
- **Lỗi xung đột ngày** `DAY_CONFLICT`: một ngày của đơn đang bị đơn khác (đang chờ hoặc đã duyệt) chiếm theo ma trận dưới đây.
  - Lúc **nộp** đơn: `400`. Lúc **duyệt** (kiểm lại thất bại): `409`, câu báo thêm ` Chỉ có thể từ chối đơn này.`, đơn giữ `PENDING` và không ghi gì; vẫn `REJECT` được.
  - Thân lỗi là JSON phẳng (bộ lọc lỗi trải `details` ra ngang hàng, không có khoá `details`): `error` là câu báo của ô bị chặn; `code`, `date`, `requestId`, `requestType`, `requestStatus` cho client biết đơn nào đang chiếm ngày. Cùng dạng ở `400` lúc nộp và `409` lúc duyệt (chỉ khác `error` có thêm câu ` Chỉ có thể từ chối đơn này.` và `requestStatus` của đơn chiếm):
    ```json
    {
      "error": "Thứ Bảy 14/11 đang có đơn iSAT chờ duyệt. Huỷ đơn iSAT hoặc chọn ngày khác.",
      "code": "DAY_CONFLICT",
      "date": "2026-11-14",
      "requestId": "isat-req-uuid",
      "requestType": "ISAT",
      "requestStatus": "PENDING"
    }
    ```
  - `requestId`, `requestType`, `requestStatus` là đơn đang chiếm ngày `date`; ba trường này là `null` khi ngày bị chặn không do đơn (iSAT trên ngày lễ).
  - Huỷ đơn (`PATCH .../cancel`) không bao giờ trả `DAY_CONFLICT`; giữ nguyên mã lỗi cũ.
  - Các lỗi khác của từng loại đơn giữ `400 BAD_REQUEST` và câu báo như các mục dưới.
- **Ma trận chỉ các ô mới** (ngày đang ở trạng thái X, nộp thêm đơn loại Y). Ô không ghi ở đây giữ nguyên luật cũ của từng loại đơn.

  | Ngày đang có | Đơn mới | Kết quả |
  |---|---|---|
  | Khung OT/bù đã duyệt | iSAT | `400` C8: `Thứ Bảy dd/MM đã có khung OT hoặc làm bù được duyệt, không chọn được cho iSAT.` |
  | Khung OT/bù đang chờ | iSAT | `400` C9: `Thứ Bảy dd/MM đang có đơn OT chờ duyệt. Huỷ đơn đó hoặc chọn Thứ Bảy khác.` (khung của đơn nghỉ có làm bù: `đơn nghỉ có làm bù`) |
  | Đổi ca (chờ hoặc đã duyệt) | Nghỉ, nghỉ có làm bù, iSAT | Được, đơn mới thay ca của ngày đó |
  | Ngày lễ | iSAT | `400` C5: `Thứ Bảy dd/MM là ngày lễ, không chọn được cho iSAT.` |
  | Nghỉ hoặc nghỉ có làm bù (chờ hoặc đã duyệt) | Đổi ca | Bỏ ngày đó, kèm cảnh báo C4 |
  | Nghỉ hoặc nghỉ có làm bù đã duyệt | iSAT | `400` C6: `Thứ Bảy dd/MM đã nghỉ theo đơn đã duyệt, không chọn được cho iSAT.` |
  | Nghỉ hoặc nghỉ có làm bù đang chờ | iSAT | `400` C7: `Thứ Bảy dd/MM đang có đơn nghỉ chờ duyệt. Huỷ đơn nghỉ hoặc chọn Thứ Bảy khác.` |
  | iSAT đã duyệt | Nghỉ, nghỉ có làm bù, đổi ca | Bỏ ngày đó, kèm cảnh báo C2; nếu mọi ngày đều bị bỏ vì iSAT thì `400` C1 |
  | iSAT đã duyệt | Khung bù, OT, giải trình | `400` C1: `Thứ Bảy dd/MM đã có iSAT được duyệt, không chọn được ngày này.` |
  | iSAT đang chờ | Nghỉ, nghỉ có làm bù, khung bù, OT, đổi ca, giải trình | `400` C3: `Thứ Bảy dd/MM đang có đơn iSAT chờ duyệt. Huỷ đơn iSAT hoặc chọn ngày khác.` |

  Đơn theo khoảng ngày xét từng ngày làm việc: gặp ô chặn thì từ chối cả đơn (báo theo ngày đầu tiên bị chặn); ô "bỏ ngày" chỉ loại ngày đó. Một ngày vừa đổi ca vừa có khung OT thì ô chặn thắng, đơn nghỉ trên ngày đó vẫn bị chặn như cũ.
- **Tác động lên trạng thái ngày** (bảng `day_status`, mỗi người mỗi ngày một dòng cho đơn nghỉ, nghỉ có làm bù, đổi ca, iSAT đang chờ hoặc đã duyệt):
  - Nộp đơn: giữ chỗ các ngày được tính ngay khi đơn còn `PENDING`. Ngày đang là ngày đổi ca bị đơn nghỉ hoặc iSAT thay thì dòng đó chuyển cho đơn mới và nhớ đơn đổi ca cũ.
  - `APPROVE`: kiểm lại ma trận trên trạng thái hiện tại; qua thì ghi lịch làm việc đúng trên các ngày đơn đang giữ (không tính lại khoảng ngày), bảng `day_status` không đổi. Đơn đổi ca không ghi đè lịch của ngày đã bị đơn nghỉ đã duyệt thay.
  - `REJECT` và huỷ (`PATCH .../cancel`): trả ngày. Ngày từng là ngày đổi ca của một đơn còn hiệu lực thì trả về đơn đổi ca đó (đã duyệt thì ghi lại lịch đổi ca); còn lại ngày về trạng thái thường (ca mặc định). Thứ Bảy iSAT được trả ngay nên đơn nghỉ hoặc OT nộp sau đó nhận được.
- **Lỗi kỳ lương đã chốt** `PERIOD_LOCKED` (`409`): ở các route tạo đơn trên và ở `PATCH /api/v2/requests/:id/review`. Đơn chạm tới các tháng của: khoảng nghỉ (cả các tháng ở giữa), các ngày khung bù, ngày OT, khoảng đổi ca, ngày giải trình, Thứ Bảy iSAT, kỳ tạm ứng (`period`). Một tháng trong đó không cho thao tác thì cả đơn bị chặn, kể cả đơn vắt qua hai tháng (ví dụ nghỉ 30/10–02/11 khi tháng 10 đã chốt công).

  | Kỳ lương của tháng | Nộp đơn (trừ giải trình) | Nộp giải trình | Duyệt / Từ chối |
  |---|---|---|---|
  | `open` (hoặc chưa có kỳ) | Được | Được | Được |
  | `attendance_locked`, `calculated` | `409` | Được | Được (ở `calculated` thì tự tính lại phiếu, xem `PATCH .../review`) |
  | `approved`, `paid` | `409` | `409` | `409` |

  - Thân lỗi phẳng như `DAY_CONFLICT`; `month` là tháng bị chặn đầu tiên (tháng tăng dần), `status` là trạng thái kỳ của tháng đó:
    ```json
    { "error": "Tháng 10/2026 đã chốt công", "code": "PERIOD_LOCKED", "month": "2026-10", "status": "attendance_locked" }
    ```
  - Câu báo: `Tháng MM/YYYY đã chốt công` (`attendance_locked`, `calculated`), `Kỳ lương tháng MM/YYYY đã phê duyệt` (`approved`), `Kỳ lương tháng MM/YYYY đã trả lương` (`paid`).
  - Không ghi gì: đơn bị chặn lúc nộp không được lưu; lúc duyệt thì đơn giữ `PENDING`. Cổng chỉ xét sau các luật riêng của từng loại đơn, nên đơn vừa sai luật vừa rơi vào tháng đã chốt nhận lỗi của luật (`400`).
  - Áp như nhau cho nhân viên tự nộp (`POST /api/v2/me/requests/:kind`) và Admin nộp thay (`POST /api/v2/requests/leave`, `.../leave-with-makeup`, `.../overtime`, `.../shift-change`, `.../explanation`, `.../advance`, `.../isat`). Giải trình nộp được tới khi kỳ được phê duyệt (người dùng chốt 05/11/2026). Ví dụ: tháng 10 chốt công ngày 01/11, ngày 03/11 Bình nộp giải trình cho 29/10 → được nhận; sau khi Phê duyệt kỳ tháng 10 thì `409` `Kỳ lương tháng 10/2026 đã phê duyệt`.
  - Xem trước (`POST /api/v2/me/requests/:kind/preview`) qua cùng cổng, cùng chỗ, nhưng vẫn trả `200`: `{ "ok": false, "message": "Tháng 10/2026 đã chốt công", "code": "PERIOD_LOCKED", "month": "2026-10", "status": "attendance_locked" }`.
  - Huỷ đơn (`PATCH .../cancel`) không qua cổng kỳ.

#### Các route `/api/v2/me` cho nhân viên tự nộp đơn
Mọi route chỉ cần phiên đăng nhập; danh tính luôn là người đang đăng nhập, `employeeId` hay `username` trong body bị bỏ qua. Nguồn luật: `docs/superpowers/specs/2026-11-05-staff-requests-design.md` (mục 2 và 3).

- **`GET /api/v2/me/request-context`**: một lần gọi trả đủ dữ liệu cho form: `today`, `window` (từ hôm nay tới ngày cuối tháng sau, giờ Việt Nam), `kinds` (loại đơn dùng được, `enabled: false` kèm `reason` là loại bị khoá), `months` (`closed`: kỳ lương của tháng không còn `open`, tức đơn loại thường không nộp được; `otMinutes`, `otCapMinutes`, `hasOvertime`, `hasMakeupLeave`), `leaveTypes`, `annualLeaveLeft` (`null` khi không có quyền lợi phép năm), `shiftFrames`, `days` (`workday`, `shift`, `holiday`, `claim`, `hours`), `explanationDays` (mỗi ngày `{ date, cases, needs, remindedAt, checkIn, checkOut }`: `checkIn`/`checkOut` là giờ vào/ra thực của ngày theo bảng công, `HH:mm` giờ Việt Nam, `null` khi chưa có lần chấm đó; gồm cả ngày của tháng đã chốt công hay đã tính lương; bỏ tháng đã phê duyệt hay đã trả lương) và `advance` (`null` khi loại tạm ứng bị khoá; mở thì `{ month, amount, workDays, from, to, windowEnd, ordersThisMonth }`: `windowEnd` là ngày cuối nộp, `<tháng>-17`; `ordersThisMonth` là số đơn tạm ứng của tháng sau khi nộp đơn này, luôn `1` vì mỗi tháng một đơn; `ratePct`: tỉ lệ tạm ứng, `80`). Lỗi: `400 BAD_REQUEST`.
  - Phần server tính để form chỉ hiện (FE không tự suy luật): `months[].otLeftMinutes` (trần 40 giờ trừ `otMinutes`); mỗi ngày trong `days` thêm `leaveCounted` (ngày đơn nghỉ giữ khi nằm trong khoảng: ngày làm, trừ Thứ Bảy có iSAT đã duyệt), `shiftChangeable` (ngày làm chưa bị đơn nào giữ) và `otHours` (như `hours` nhưng bỏ khung dài hơn số phút OT còn lại của tháng; `[]` khi tháng đã chốt hay đã có nghỉ có làm bù); `rules`: `{ makeupMinutesPerLeaveDay: 480, dayCapMinutes: 720, monthOtCapMinutes: 2400 }`; `choices`: `leave`, `leave-with-makeup`, `shift-change` mỗi loại `{ starts: ["YYYY-MM-DD"], ends: { "<từ ngày>": [{ date, daysCount, annualLeaveLeftAfter? (leave; null khi không có phép năm, tính như Phép năm), makeupMinutesRequired? (leave-with-makeup) }] } }`, riêng `leave-with-makeup` thêm `slotDates: { "<ngày nghỉ cuối>": ["YYYY-MM-DD"] }` (ngày bù chọn được), và `overtime: { dates }`. Luật chọn: ngày thuộc tháng đã chốt không bao giờ có; nghỉ dừng trước ngày bị đơn nghỉ giữ hay iSAT chờ duyệt; nghỉ có làm bù thêm cùng tháng, tháng chưa có OT và sau đó còn ngày để bù; đổi ca dừng trước ngày đã có đơn đổi ca hay iSAT chờ duyệt và khoảng phải có ít nhất một ngày đổi được. Các luật còn lại (khung chồng nhau, trần 12 giờ mỗi ngày, đủ 480 phút bù mỗi ngày nghỉ, trần OT) vẫn do xem trước và nộp đơn kiểm; form không tự chặn.
- **`GET /api/v2/me/requests/:id`**: `{ request, steps }`. `request.dates` (cũng có trong mỗi phần tử của danh sách `GET /api/v2/me/requests` và `GET /api/v2/requests`) là mảng ngày `YYYY-MM-DD` tăng dần mà đơn giữ hoặc chạm tới: nghỉ và nghỉ có làm bù (cả khoảng nghỉ cộng ngày bù), đổi ca (cả khoảng), OT, giải trình, iSAT (Thứ Bảy đăng ký); tạm ứng là `[]`. Cùng nguồn với `requestDates` dùng cho bảng công.
- **`POST /api/v2/me/requests/:kind/preview`**: body giống `POST /api/v2/me/requests/:kind`, không ghi gì. `:kind` là một trong `leave`, `leave-with-makeup`, `overtime`, `shift-change`, `explanation`, `advance`; loại khác (kể cả `isat`, không có xem trước) trả `404` mã `REQUEST_KIND_NOT_FOUND`. Luôn trả `200`:
  - hợp lệ: `{ "ok": true, "title": "Phép năm 13–16/11", "summary": { … }, "warnings": [] }`; `summary` theo loại: leave `{ dates, daysCount, annualLeaveLeftAfter }`, leave-with-makeup `{ dates, daysCount, makeupMinutesRequired, makeupMinutesPlanned }`, overtime `{ minutes, monthMinutesAfter }`, shift-change `{ dates, keptDates }`, explanation `{ cases, needs }`, advance `{ month, amount, workDays }`;
  - không hợp lệ: `{ "ok": false, "message": "<câu lỗi của server>", "code": "DAY_CONFLICT" }`; `code` chỉ có khi là xung đột ngày (`DAY_CONFLICT`) hoặc tháng đã khoá (`PERIOD_LOCKED`, kèm `month`, `status`, xem "Quy ước chung"). Xếp chưa đủ giờ bù thì `ok: false` với câu `Còn thiếu N giờ bù`.
- **`POST /api/v2/me/requests/:kind`** (tạo đơn): cùng thân trả về và lỗi như route Admin, nhưng áp luật tự nộp (`filedBy: 'self'`):
  - ngày phải nằm trong `window` (`Chỉ chọn ngày từ 05/11 đến 31/12`), áp cho đơn nghỉ, nghỉ có làm bù (cả ngày nghỉ lẫn ngày bù), làm thêm giờ, đổi ca;
  - tháng đã chốt thì `409 PERIOD_LOCKED` như route Admin (xem "Quy ước chung"; giải trình nộp được tới khi kỳ được phê duyệt);
  - giờ OT và giờ bù phải là giờ tròn (`Chỉ chọn giờ tròn`);
  - tạm ứng chỉ nộp ngày 16 và 17 (giờ Việt Nam) cho tháng hiện tại (`Chỉ nộp tạm ứng ngày 16 và 17`);
  - `iSAT` giữ nguyên như trước.
- **Tiêu đề do server đặt** (cả `/me` lẫn Admin): `title` client gửi bị bỏ qua. Mẫu: `Phép năm 13–16/11`, `Nghỉ có làm bù 13–14/11`, `Làm thêm 10/11 18–20h`, `Đổi ca Flex 06–15, 10–12/11`, `Giải trình 27/10`, `Tạm ứng lương tháng 11`; khoảng ngày khác tháng ghi đủ (`Phép năm 30/11–02/12`).
- **Giờ máy chủ cho màn nhân viên**: `GET /api/v2/me/today` thêm `now` (`HH:mm`, giờ Việt Nam); `GET /api/v2/me/attendance` thêm `today` (`YYYY-MM-DD`); `GET /api/v2/me/attendance/:date` thêm `today` và `now`. Màn nhân viên đọc "hôm nay" và "bây giờ" từ đây, không từ đồng hồ trình duyệt. `workedMinutes` của `/me/today` là số phút làm do máy chủ tính (màn chỉ tự chạy theo `now` khi còn trong ca, chưa ra).
- **`GET /api/v2/me/today`**: thêm `reminders: [{ date, remindedAt }]`, những ngày Admin đã nhắc và còn cần giải trình, mới nhất trước. Lỗi khi lấy lời nhắc thì trả `[]`, màn không hỏng. `alert` là ngày `todo` đã qua gần nhất mà giải trình chưa ở trạng thái `pending` (chưa giải trình hoặc bị từ chối vẫn nhắc; ô ngày vẫn là `todo`).
- **`GET /api/v2/me/attendance/:date`**: thêm hai trường:
  - `explanation`: đơn giải trình mới nhất không bị huỷ của ngày đó, dạng `{ id, status, sentAt, cases, actualCheckIn, actualCheckOut }`, hoặc `null`;
  - `due`: `{ cases, needs, remindedAt }` khi ngày cần giải trình, ngược lại `null`. Lỗi khi lấy thông tin giải trình thì cả hai là `null`, ngày công vẫn mở được.
- **Ô ngày công của `/me` đọc dòng ngày dùng chung** (spec attendance-core 8.2): `GET /api/v2/me/today` (mảng `week`), `GET /api/v2/me/attendance` (mảng `days`) và `GET /api/v2/me/attendance/:date` cùng trả một ô ngày `{ date, kind, leave?, in, out, lateMinutes, explanationStatus, cases }`. Không còn suy `kind` từ giờ vào / ra:
  - `kind` (thêm `outside` và `extra`) theo `status` của dòng: `OUTSIDE` → `outside`; `REST` → `off`; `EXTRA` → `extra`; `HOLIDAY`, `ISAT`, `LEAVE_PAID`, `LEAVE_UNPAID`, `LEAVE_MAKEUP` → `leave`; `PENDING` → `work` (hôm nay) hoặc `future` (sau hôm nay); `ABSENT` → `absent`; `PRESENT` → `todo` khi có mã ảnh hưởng tiền mà giải trình chưa được duyệt (chưa có, đang chờ hoặc bị từ chối), `late` khi `deductionMinutes` > 0, còn lại `work`. Ngày chưa có dòng giữ luật cũ: thứ không thuộc tuần làm → `off`, ngày sau hôm nay → `future`, ngày đã qua → `absent`.
  - `leave` (khi `kind` = `leave`) thêm `isat` và `makeup`: `holiday` | `isat` | `paid` | `unpaid` | `makeup`.
  - `explanationStatus`: `none` | `pending` | `approved` | `rejected`, chữ thường từ `explanationStatus` của dòng (`none` khi chưa có dòng). Tên này khác `explanation` ở route ngày, vốn là đối tượng đơn giải trình.
  - `cases`: `[{ code, minutes, affectsPay }]` của dòng, `[]` khi chưa có dòng hoặc đúng giờ.
  - `in` / `out` là `null` ở ngày `outside` và ngày nghỉ (`leave`); các ngày khác lấy từ lần chấm.
  - `shift` của `GET /api/v2/me/today` và `GET /api/v2/me/attendance/:date` là `null` khi dòng không có ca (nghỉ, lễ, `OUTSIDE`, `REST`, `EXTRA`) hoặc chưa có dòng, không bao giờ là đối tượng toàn `null`. Có ca thì `{ type, start, end }` (route ngày: `{ start, end }`).
  - `totals` của `GET /api/v2/me/attendance`: `workDays` = số dòng `countsAsWorkday`; `paidLeaveDays` = số dòng `LEAVE_PAID`, `HOLIDAY`, `ISAT` có `payUnits` = 1 (lễ hoặc iSAT không được trả thì không tính); `lateCount` = số ngày có `kind` = `late`; `standardDays` = số ngày làm của tuần người đó trong tháng (theo cài đặt).
- **`PATCH /api/v2/me/requests/:id/cancel`**: nhân viên huỷ đơn của chính mình (chỉ khi đơn còn `PENDING`). Body tuỳ chọn `{ "reason": "..." }`. Response 200: `{ "updated": true, "request": { ... } }` (đơn đã `CANCELLED`, cùng dạng `request` của `GET /api/v2/me/requests/:id`). Không qua cổng kỳ lương. Lỗi: `404 REQUEST_NOT_FOUND` khi không có đơn hoặc đơn là của người khác; `409 REQUEST_NOT_CANCELLABLE` khi đơn không huỷ được (đã duyệt, đã từ chối hay đã huỷ; `error` là câu lý do). Trả ngày cho đơn đổi ca như ở "Quy ước chung".
- **`GET /api/v2/me/income?month=YYYY-MM`**: thu nhập tháng của chính người đăng nhập (màn Thu nhập và thẻ trên trang chủ). `month` bỏ trống thì tháng hiện tại; chỉ xem được trong `range` (từ tháng vào làm tới tháng hiện tại). Response 200 luôn có `month`, `state`, `payslip`, `payDate` (ngày trả lương `YYYY-MM-DD` theo cài đặt `payCalendar.payDay`), `range: { from, to }` (`YYYY-MM`):
  - `state: "official"`: phiếu của người này ở lần chạy hiện tại đã được Admin duyệt (kể cả khi kỳ chưa chốt); `payslip` là chi tiết phiếu lương (cùng các trường như `details` của phiếu ở mục 3.5: `grossIncome`, `incomeAfterInsurance`, `netIncome`...).
  - `state: "estimate"`: tạm tính, không ghi DB; chỉ cộng tiền những ngày đã qua, `insuranceDeduction`, `personalIncomeTax` bằng 0 (hai khoản này chỉ tính khi chốt kỳ), `netIncome = grossIncome - advanceDeduction`.
  - `state: "unavailable"`: chưa tính được, `payslip: null` kèm `reason`, ví dụ `{ "month": "2026-11", "state": "unavailable", "payslip": null, "reason": "Thiếu cấu hình chức vụ hoặc bậc lương cho ql (QL · Bậc 1)", "payDate": "2026-12-12", "range": { "from": "2026-11", "to": "2026-11" } }`.
  - Lỗi: `400 MONTH_OUT_OF_RANGE` (kèm `range`, câu `Chỉ xem được từ tháng 11/2026 tới tháng 11/2026`) hoặc `400 INVALID_MONTH` (`Tháng không hợp lệ (định dạng YYYY-MM)`) khi `month` sai dạng.
- **`GET /api/v2/me/profile`**: `leave.remainingDays` do server tính từ đơn (cùng hàm với `annualLeaveLeft`), `0` khi không có quyền lợi phép năm; nếu không tính được thì giữ số trong hợp đồng.

#### Route Admin về giải trình (cần quyền `requests.review`)
- **`GET /api/v2/requests/explanations-due`**: mọi ngày cần giải trình của mọi nhân sự đang làm, mới nhất trước. Trả `{ "items": [{ "employeeId", "name", "date", "cases", "needs", "remindedAt", "checkIn", "checkOut" }] }`. Ngày của tháng đã chốt công hay đã tính lương vẫn có; ngày của tháng mà kỳ lương đã phê duyệt hay đã trả lương thì không.
- **`POST /api/v2/requests/explanations-due/remind`**: body `{ "employeeId", "date" }`; người nhắc lấy từ phiên Admin. Trả `{ "reminded": true, "remindedAt": "<ISO>" }`. Nhắc lại thì ghi đè lần trước. Ngày không còn cần giải trình thì `400 BAD_REQUEST` với lý do cụ thể, ví dụ `Ngày 02/11 đã có đơn giải trình`, `Ngày 02/11 không có gì cần giải trình`, `Ngày 02/11 không phải ngày làm`. Kỳ lương của tháng đã phê duyệt hay đã trả lương thì `409 PERIOD_LOCKED` (`Kỳ lương tháng 10/2026 đã phê duyệt`, kèm `month`, `status`); tháng đã chốt công hay đã tính lương vẫn nhắc được.
- Cả hai khai báo trước `GET /api/v2/requests/:id`.

#### `POST /api/v2/requests/explanation` (Đơn giải trình)
- **Mục đích**: Giải trình một ngày công có giờ chấm bất thường (vào muộn, ra sớm, thiếu giờ vào/ra…). Một ngày chỉ một đơn.
- **Request Body**:
  ```json
  {
    "employeeId": "nv01",
    "reason": "Sự cố giao thông nghẽn làn kéo dài hơn 45 phút",
    "workDate": "2026-11-04"
  }
  ```
  - `employeeId`: uuid hoặc username; đơn lưu theo uuid.
  - `workDate` (`YYYY-MM-DD`): không được sau hôm nay (giờ Việt Nam).
  - Tiêu đề do server đặt (`Giải trình dd/MM`). Các trường hợp (`cases`) do server tự tìm từ ca và bảng công của ngày đó; nếu client có gửi `cases` thì bị bỏ qua. Danh mục mã ở `GET /api/v2/requests/explanation-cases`, đơn lưu theo thứ tự của danh mục.
  - `actualCheckIn`, `actualCheckOut` (`HH:mm`): chỉ nhận khi ngày có trường hợp `MISSING_CHECK_IN` (cần giờ vào) hoặc `MISSING_CHECK_OUT` (cần giờ ra); ngày đó bắt buộc nhập. Các trường hợp khác (ví dụ `LATE_CHECK_IN`) không cần giờ, giá trị gửi lên được ghi là `null`. `needs` ở `explanationDays`/`explanations-due` cho biết ngày nào cần giờ nào.
  - Các trường khác trong body (kể cả trường giờ chấm của bản cũ) không được chuyển đi.
- **Response 201**:
  ```json
  {
    "created": true,
    "request": {
      "id": "req-uuid",
      "type": "EXPLANATION",
      "status": "PENDING",
      "explanationDate": "2026-11-04",
      "explanationCases": ["LATE_CHECK_IN"],
      "actualCheckIn": null,
      "actualCheckOut": null
    }
  }
  ```
  Ví dụ trên là ngày vào muộn: `LATE_CHECK_IN` không cần giờ nên `actualCheckIn`/`actualCheckOut` là `null`. Giờ chỉ được lưu cho ngày `MISSING_*`.
- **Lỗi `400 BAD_REQUEST`** (kiểm theo thứ tự):

  | `message` | Khi nào |
  |---|---|
  | `Thiếu employeeId của nhân viên` | Route admin không gửi `employeeId` |
  | `workDate must be a valid YYYY-MM-DD date string, got: <giá trị>` | Thiếu hoặc sai ngày |
  | `Không tìm thấy nhân sự: <id>` | Không có hồ sơ theo uuid/username |
  | `Không giải trình cho ngày trong tương lai` | `workDate` sau hôm nay |
  | `Thiếu cấu hình loại nhân sự <loại>` | Loại nhân sự chưa có cấu hình ca/lịch (cần để biết ngày làm và ca) |
  | `Ngày dd/MM không phải ngày làm` | Không có ca, trước ngày vào làm, ngày lễ, nghỉ phép hoặc Thứ Bảy iSAT |
  | `Ngày dd/MM đã có đơn giải trình` | Người đó đã có đơn giải trình cùng ngày đang chờ, đã duyệt hoặc **đã bị từ chối**. Đơn đã huỷ không chặn. Kiểm lại trong khoá khi ghi |
  | `Ngày dd/MM không có gì cần giải trình` | Giờ chấm của ngày không rơi vào trường hợp nào |
  | `Giờ thực tế không hợp lệ: <giá trị>` | `actualCheckIn`/`actualCheckOut` có giá trị nhưng không phải `HH:mm` |
  | `Nhập giờ vào thực tế` | Ngày `MISSING_CHECK_IN` mà không có `actualCheckIn` |
  | `Nhập giờ ra thực tế` | Ngày `MISSING_CHECK_OUT` mà không có `actualCheckOut` |
  | `Giờ ra phải sau giờ vào` | Cả hai giờ cùng nhập, giờ ra không sau giờ vào (ca đêm không xét) |
- **Lỗi `409 PERIOD_LOCKED`**: kỳ lương của tháng `workDate` đã phê duyệt (`Kỳ lương tháng MM/YYYY đã phê duyệt`) hoặc đã trả lương (`Kỳ lương tháng MM/YYYY đã trả lương`). Tháng đã chốt công hay đã tính lương vẫn nộp được. Xét sau mọi lỗi `400` ở trên, trong khoá (xem "Quy ước chung").
- Nộp dưới khoá `requests_<uuid>`. Đơn và các trường hợp (bảng `explanation_cases`) được ghi trong cùng một giao dịch.
- **Duyệt**: `APPROVE` đặt trạng thái ngày công `workDate` của người đó thành `VALID`; `REJECT` không đổi gì.

#### `GET /api/v2/requests/explanation-cases` (Danh sách trường hợp giải trình)
- **Response 200**: 7 trường hợp theo thứ tự hiển thị.
  ```json
  {
    "cases": [
      { "code": "LATE_CHECK_IN", "label": "Vào muộn quá 15 phút" },
      { "code": "EARLY_CHECK_OUT", "label": "Ra sớm" },
      { "code": "MISSING_CHECK_IN", "label": "Thiếu giờ vào" },
      { "code": "MISSING_CHECK_OUT", "label": "Thiếu giờ ra" },
      { "code": "EARLY_CHECK_IN", "label": "Vào sớm quá 15 phút" },
      { "code": "LATE_CHECK_OUT", "label": "Ra muộn quá 15 phút khi không có OT" },
      { "code": "FORGOT_CHECK_OUT", "label": "Quên check-out (ra muộn quá 30 phút)" }
    ]
  }
  ```

#### `POST /api/v2/requests/leave` (Đơn nghỉ)
- **Mục đích**: Admin nộp đơn nghỉ thay một nhân sự (nhân sự tự nộp qua `POST /api/v2/me/requests/:kind` với `:kind` = `leave`, cùng luật). Chỉ nghỉ nguyên ngày.
- **Request Body**:
  ```json
  {
    "employeeId": "nv01",
    "title": "Nghỉ phép năm",
    "reason": "Về quê dự đám cưới em gái",
    "leaveType": "ANNUAL",
    "startDate": "2026-11-13",
    "endDate": "2026-11-16"
  }
  ```
  - `employeeId` (bắt buộc ở route admin): uuid hoặc username. Đơn luôn lưu theo **uuid** của nhân sự.
  - `leaveType`: một trong 6 mã của `GET /api/v2/requests/leave-types`. Mã cũ `PAID`/`UNPAID` bị từ chối. Trường hợp cụ thể (kết hôn, tang, ốm đau, thai sản…) ghi ở `reason`.
  - `startDate`, `endDate`: `YYYY-MM-DD`, `startDate ≤ endDate`. Không giới hạn số ngày mỗi đơn, không kiểm thời hạn báo trước.
  - Số ngày client gửi (nếu có) **bị bỏ qua**. Server đếm `leaveDaysCount` = số **ngày làm việc** trong khoảng: thứ nằm trong `regular_dows` của loại nhân sự (nv/ctv T2–T7, tts T2–T6, không bao giờ tính CN), trừ ngày lễ công ty (§3.8). Ví dụ: nv nghỉ T6 13/11 → T2 16/11 được đếm 3 ngày (13, 14, 16); tts cùng khoảng được 2 ngày (13, 16).
- **Response 201**:
  ```json
  {
    "created": true,
    "request": {
      "id": "req-uuid",
      "employeeId": "4391e6b3-8fa4-4ee9-b4be-5b232c943891",
      "type": "LEAVE",
      "status": "PENDING",
      "leaveType": "ANNUAL",
      "leaveStartDate": "2026-11-13",
      "leaveEndDate": "2026-11-16",
      "leaveDaysCount": 3
    }
  }
  ```
- **Lỗi `400 BAD_REQUEST`** (kiểm theo thứ tự; đơn bị chặn thì không lưu):

  | Bước | `message` | Khi nào |
  |---|---|---|
  | 0 | `Thiếu employeeId của nhân viên` | Route admin không gửi `employeeId` |
  | 1 | `Loại nghỉ không hợp lệ: <mã>` | `leaveType` không thuộc 6 mã |
  | 2 | `startDate must be a valid YYYY-MM-DD date string, got: <giá trị>` (tương tự `endDate …`), `endDate (<ngày>) cannot be earlier than startDate (<ngày>)` | Ngày sai dạng, không có thật, hoặc đảo ngược |
  | 3 | `Không tìm thấy nhân sự: <employeeId>` | Không có hồ sơ theo uuid/username |
  | 3 | `Thiếu cấu hình loại nhân sự <loại>` | Loại nhân sự chưa có phiên bản `position_types` hiệu lực đến tháng của `startDate` |
  | 4 | `Khoảng nghỉ không có ngày làm việc` | Khoảng chỉ có CN, ngày nghỉ của loại nhân sự hoặc ngày lễ |
  | 5 | `Đã có đơn nghỉ trùng ngày (dd/mm – dd/mm)` | Trùng đơn nghỉ hoặc đơn nghỉ có làm bù khác đang chờ/đã duyệt; hai ngày trong ngoặc là khoảng của đơn đã có |
  | 6 | `Ngày dd/mm đã có khung OT hoặc làm bù` | Một ngày lịch trong khoảng (kể cả CN) có khung OT hoặc khung bù đang chờ/đã duyệt |
  | 7 | `Loại nhân sự này không có Phép năm` | `ANNUAL` khi cờ quyền lợi `leaveAccount` của loại nhân sự tắt (tts) |
  | 7 | `Phép năm còn <n> ngày, xin <k> ngày` | `ANNUAL` vượt số dư. Số dư = `leave_balance` (NULL tính 0) − tổng `leaveDaysCount` của các đơn `ANNUAL` đang chờ/đã duyệt có `leaveStartDate ≥ leave_balance_on` (`leave_balance_on` NULL thì tính mọi đơn). Số lẻ viết dấu phẩy, ví dụ `Phép năm còn 2,5 ngày, xin 3 ngày` |
- Hai đơn của cùng một người nộp cùng lúc được xếp hàng (khoá `requests_<uuid>`), nên không cùng lọt qua kiểm trùng ngày hay số dư.

#### `GET /api/v2/requests/leave-types` (Danh sách loại nghỉ)
- **Response 200**: 6 loại nghỉ theo thứ tự hiển thị. `payGroup` chỉ để hiển thị; tiền của từng loại do phần lương quyết định.
  ```json
  {
    "leaveTypes": [
      { "code": "ANNUAL", "label": "Phép năm", "payGroup": "PAID" },
      { "code": "PERSONAL_PAID", "label": "Việc riêng có lương", "payGroup": "PAID" },
      { "code": "PERSONAL_UNPAID", "label": "Việc riêng không lương", "payGroup": "UNPAID" },
      { "code": "SOCIAL_INSURANCE", "label": "Chế độ BHXH", "payGroup": "SOCIAL_INSURANCE" },
      { "code": "WELFARE", "label": "Phúc lợi nội bộ", "payGroup": "PAID" },
      { "code": "UNPAID", "label": "Không lương", "payGroup": "UNPAID" }
    ]
  }
  ```

#### `POST /api/v2/requests/leave-with-makeup` (Đơn nghỉ có làm bù)
- **Mục đích**: Nghỉ nguyên ngày rồi làm bù đủ giờ sau ngày nghỉ, trong cùng tháng. Mỗi ngày nghỉ nợ đúng **8 giờ** làm bù. Không có loại nghỉ (`leaveType` = `null`).
- **Request Body**:
  ```json
  {
    "employeeId": "nv01",
    "title": "Nghỉ có làm bù",
    "reason": "Việc gia đình",
    "startDate": "2026-11-10",
    "endDate": "2026-11-10",
    "slots": [
      { "date": "2026-11-12", "startTime": "18:00", "endTime": "22:00" },
      { "date": "2026-11-16", "startTime": "18:00", "endTime": "22:00" }
    ]
  }
  ```
  - `employeeId`: uuid hoặc username; đơn lưu theo uuid.
  - `startDate`, `endDate`: như đơn nghỉ. Server đếm `leaveDaysCount` = số ngày làm việc trong khoảng (cùng cách đếm với đơn nghỉ); số ngày và `leaveType` client gửi bị bỏ qua.
  - `slots`: danh sách khung bù `{ date, startTime, endTime }` (`YYYY-MM-DD`, `HH:mm`). Giờ bù của mỗi khung = giờ thực làm như khung OT (cứ 4 giờ nghỉ 1 giờ). Tổng giờ bù phải **đúng bằng** 8 × `leaveDaysCount`.
  - Mọi khung theo luật khung của đơn OT (06–22, cách ca ít nhất 1 giờ, không chồng khung OT/bù khác, ca + OT + bù ≤ 12 giờ/ngày), xét cả các khung khác trong cùng đơn. Khung bù được xếp vào CN hoặc ngày không có ca.
- **Response 201**: `makeupSlots` sắp theo ngày rồi theo giờ bắt đầu; `owedMinutes` = 480 × `leaveDaysCount`.
  ```json
  {
    "created": true,
    "request": {
      "type": "LEAVE_WITH_MAKEUP",
      "status": "PENDING",
      "leaveType": null,
      "leaveStartDate": "2026-11-10",
      "leaveEndDate": "2026-11-10",
      "leaveDaysCount": 1,
      "owedMinutes": 480,
      "makeupSlots": [
        { "date": "2026-11-12", "startTime": "18:00", "endTime": "22:00", "workMinutes": 240 },
        { "date": "2026-11-16", "startTime": "18:00", "endTime": "22:00", "workMinutes": 240 }
      ]
    }
  }
  ```
- **Lỗi `400 BAD_REQUEST`** (kiểm theo thứ tự; đơn bị chặn thì không lưu):

  | Bước | `message` | Khi nào |
  |---|---|---|
  | 0 | `Thiếu employeeId của nhân viên` | Route admin không gửi `employeeId` |
  | 1 | `startDate must be a valid YYYY-MM-DD date string, got: <giá trị>` (tương tự `endDate …`), `endDate (<ngày>) cannot be earlier than startDate (<ngày>)` | Ngày nghỉ sai dạng, không có thật, hoặc đảo ngược |
  | 2 | `slots phải là danh sách khung bù` | `slots` không phải mảng |
  | 2 | `Khung bù thứ <i> không hợp lệ` | Khung thứ i (đếm từ 1) không phải object, hoặc thiếu/sai `date`, `startTime`, `endTime` |
  | 3 | `Không tìm thấy nhân sự: <id>` / `Thiếu cấu hình loại nhân sự <loại>` | Như đơn nghỉ |
  | 3 | `Loại nhân sự này không có làm bù` | Cờ quyền lợi `makeup` của loại nhân sự tắt |
  | 4 | `Ngày nghỉ và khung bù phải nằm trong cùng một tháng` | Hai ngày nghỉ, hoặc ngày của một khung, khác tháng với `startDate` |
  | 6 | `Khoảng nghỉ không có ngày làm việc` | Như đơn nghỉ |
  | 6 | `Đã có đơn nghỉ trùng ngày (dd/mm – dd/mm)` / `Ngày dd/mm đã có khung OT hoặc làm bù` | Như đơn nghỉ |
  | 7 | `Không còn ngày trong tháng để xếp đủ giờ bù` | `endDate` là ngày cuối tháng |
  | 8 | `Tháng YYYY-MM đã có đơn OT, không nộp đơn nghỉ có làm bù được` | Tháng đó có đơn OT đang chờ/đã duyệt |
  | 9 | `Khung bù ngày dd/mm phải sau ngày nghỉ cuối dd/mm` | Khung rơi vào ngày nghỉ hoặc trước đó |
  | 9 | `Ngày dd/mm đang nghỉ, không xếp khung bù được` | Ngày của khung nằm trong đơn nghỉ khác hoặc lịch `ON_LEAVE` |
  | 9 | Các câu `Giờ khung không hợp lệ…`, `Khung … phải nằm trong 06:00–22:00`, `… phải cách ca … ít nhất 1 giờ`, `… chồng lên khung …` | Như đơn OT; khung được xét theo ngày rồi theo giờ bắt đầu |
  | 10 | `Ngày dd/mm vượt 12 giờ (ca + OT + làm bù = <n> giờ)` | Ca + khung đã có + các khung mới của ngày đó > 12 giờ |
  | 11 | `Còn thiếu <n> giờ bù` | Tổng giờ bù ít hơn 8 × `leaveDaysCount`, ví dụ `Còn thiếu 4 giờ bù` |
  | 11 | `Cần đúng <n> giờ bù, đang xếp <m> giờ` | Tổng giờ bù nhiều hơn 8 × `leaveDaysCount`, ví dụ `Cần đúng 8 giờ bù, đang xếp 12 giờ` |
- Nộp dưới khoá `requests_<uuid>` như đơn nghỉ. Đơn và các khung bù (bảng `makeup_slots`) được ghi trong cùng một giao dịch.

#### `POST /api/v2/requests/shift-change` (Đơn đổi ca)
- **Mục đích**: Đổi sang một trong 6 khung ca cho mọi **ngày làm việc** trong khoảng `startDate`–`endDate` (CN, ngày nghỉ của loại nhân sự và ngày lễ trong khoảng giữ nguyên).
- **Request Body**:
  ```json
  {
    "employeeId": "nv01",
    "title": "Đổi ca tuần sau",
    "reason": "Lịch học buổi sáng",
    "startDate": "2026-11-13",
    "endDate": "2026-11-16",
    "shiftType": "NORMAL",
    "startTime": "10:00"
  }
  ```
  - `employeeId`: uuid hoặc username; đơn lưu theo uuid.
  - `shiftType` + `startTime` chọn một khung; giờ ra lấy từ khung (`endTime` client gửi bị bỏ qua). 6 khung ca:

    | `shiftType` | `startTime` | Giờ ra |
    |---|---|---|
    | `NORMAL` | `08:00` | `17:00` |
    | `NORMAL` | `10:00` | `19:00` |
    | `FLEX` | `06:00` | `15:00` |
    | `FLEX` | `13:00` | `22:00` |
    | `NIGHT` | `22:00` | `07:00` (sáng hôm sau) |
    | `NIGHT` | `21:00` | `06:00` (sáng hôm sau) |
  - Đơn đang chờ hoặc đã duyệt đều được tính là ca của các ngày đơn đang giữ trong `day_status` khi xét đơn OT, đơn nghỉ có làm bù và đơn đổi ca nộp sau. Ngày trong khoảng mà đơn không giữ (bị bỏ lúc nộp, đã bị đơn nghỉ hoặc iSAT thay, hay đã trả về ca thường) theo lịch làm việc hoặc ca mặc định.
- **Response 201**: `{ "created": true, "request": { "type": "SHIFT_CHANGE", "status": "PENDING", "changeStartDate": "2026-11-13", "changeEndDate": "2026-11-16", "newShiftType": "NORMAL", "newStartTime": "10:00", "newEndTime": "19:00", … } }`
- **Lỗi `400 BAD_REQUEST`** (kiểm theo thứ tự):

  | `message` | Khi nào |
  |---|---|
  | `Thiếu employeeId của nhân viên` | Route admin không gửi `employeeId` |
  | `Khung ca không hợp lệ: <shiftType> <startTime>` | Cặp `shiftType` + `startTime` không thuộc 6 khung (ví dụ `NORMAL 09:00`, `CUSTOM 08:00`) |
  | `startDate must be a valid YYYY-MM-DD date string, got: <giá trị>` (tương tự `endDate …`), `endDate (<ngày>) cannot be earlier than startDate (<ngày>)` | Ngày sai dạng, không có thật, hoặc đảo ngược |
  | `Không tìm thấy nhân sự: <id>` / `Thiếu cấu hình loại nhân sự <loại>` | Như đơn nghỉ |
  | `Khoảng đổi ca không có ngày làm việc` | Khoảng chỉ có CN, ngày nghỉ của loại nhân sự hoặc ngày lễ |
  | `Ngày dd/mm đang nghỉ, không đổi ca được` | Một ngày được đổi nằm trong đơn nghỉ/nghỉ có làm bù đang chờ/đã duyệt, hoặc lịch ngày đó `ON_LEAVE` |
  | `Ngày dd/mm đã có đơn đổi ca khác` | Một ngày được đổi đang là ngày đổi ca (dòng `day_status`) của đơn đổi ca khác đang chờ/đã duyệt |
  | `dd/mm: khung OT HH:mm–HH:mm chạm ca mới HH:mm–HH:mm` (hoặc `khung bù …`) | Với ca mới, một khung OT/bù đã có của ngày được đổi hoặc của hôm sau không còn đúng luật khung (cách ca ít nhất 1 giờ). Ví dụ đổi 12/11 sang ca đêm 22:00 khi đã có OT 13/11 06:00–07:00 → `13/11: khung OT 06:00–07:00 chạm ca mới 22:00–07:00` |
  | `Ngày dd/mm vượt 12 giờ (ca + OT + làm bù = <n> giờ)` | Với ca mới, ca + khung OT/bù của ngày đó vượt 12 giờ |
- Nộp dưới khoá `requests_<uuid>` như đơn nghỉ.

#### `POST /api/v2/requests/overtime` (Đơn làm thêm OT)
- **Mục đích**: Đăng ký **một khung** OT trong một ngày. Một ngày được nhiều đơn OT, miễn các khung không chồng nhau và đúng luật bên dưới.
- **Request Body**:
  ```json
  {
    "employeeId": "nv01",
    "title": "Làm thêm hoàn thiện đợt kiểm toán hệ thống",
    "reason": "Hỗ trợ bảo trì và rà soát cơ sở dữ liệu",
    "otDate": "2026-11-12",
    "startTime": "18:00",
    "endTime": "22:00"
  }
  ```
  - `employeeId`: uuid hoặc username; đơn lưu theo uuid. `targetDate` vẫn được nhận thay cho `otDate`.
  - `startTime`, `endTime` (`HH:mm`) **bắt buộc**; không còn mặc định bắt đầu lúc 18:00.
  - `hours`/`otHours` client gửi **bị bỏ qua**; đơn không còn hệ số OT. Server tính `otHours` = giờ thực làm của khung: cứ làm 4 giờ thì nghỉ 1 giờ (`240 × ⌊L/300⌋ + min(240, L mod 300)` phút, L = độ dài khung). Ví dụ 18–22 → 4; CN 08–20 → 10; CN 06–20 → 12.
- **Luật khung** (ca của ngày xét theo thứ tự: ngày lễ → không ca; đơn đổi ca đang chờ/đã duyệt; lịch `work_schedules`; ngày làm việc → ca mặc định trên hồ sơ; còn lại → không ca):
  - khung nằm trong 06:00–22:00;
  - cách ca của hôm trước, hôm đó và hôm sau ít nhất 1 giờ, không chạm ca (ca đêm 22–07 hôm trước kéo đến 07:00 sáng nay, nên khung sáng nay phải từ 08:00). Ví dụ ca 08–17 chỉ đăng ký được 06–07 và 18–22;
  - không chồng khung OT/khung bù khác (đang chờ/đã duyệt) cùng ngày;
  - ca (tính 8 giờ, nếu ngày đó có ca) + mọi khung OT và bù của ngày ≤ 12 giờ. Ngày không có ca (CN, T7 của tts, ngày lễ) được tối đa 12 giờ trong 06–22.
- **Response 201**: `{ "created": true, "request": { "type": "OVERTIME", "status": "PENDING", "otDate": "2026-11-12", "otStartTime": "18:00", "otEndTime": "22:00", "otHours": 4, … } }`
- **Lỗi `400 BAD_REQUEST`** (kiểm theo thứ tự):

  | `message` | Khi nào |
  |---|---|
  | `otDate must be a valid YYYY-MM-DD date string, got: <giá trị>` | Thiếu hoặc sai ngày |
  | `startTime must be a valid HH:mm time string, got: <giá trị>` (tương tự `endTime …`) | Thiếu hoặc sai giờ |
  | `Không tìm thấy nhân sự: <id>` / `Thiếu cấu hình loại nhân sự <loại>` | Như đơn nghỉ |
  | `Loại nhân sự này không có OT` | Cờ quyền lợi `ot` tắt (tts) |
  | `Ngày dd/mm đang nghỉ, không đăng ký OT được` | Ngày nằm trong đơn nghỉ/nghỉ có làm bù đang chờ/đã duyệt, hoặc lịch ngày đó `ON_LEAVE` (cả iSAT) |
  | `Giờ khung không hợp lệ: HH:mm–HH:mm` | Giờ ra không sau giờ vào |
  | `Khung HH:mm–HH:mm ngày dd/mm phải nằm trong 06:00–22:00` | Khung ra ngoài 06–22 |
  | `Khung … ngày dd/mm phải cách ca HH:mm–HH:mm ít nhất 1 giờ` | Chạm ca hoặc cách ca dưới 1 giờ |
  | `Khung … ngày dd/mm chồng lên khung HH:mm–HH:mm` | Chồng khung khác cùng ngày |
  | `Ngày dd/mm vượt 12 giờ (ca + OT + làm bù = <n> giờ)` | Vượt trần ngày |
  | `Tổng số giờ làm thêm trong tháng YYYY-MM không được vượt quá 40 giờ theo Luật Lao động (đã có <x>h, đăng ký thêm <y>h)` | Tổng `otHours` các đơn OT đang chờ/đã duyệt trong tháng + đơn này > 40 |
  | `Tháng YYYY-MM đã có đơn nghỉ có làm bù, không đăng ký OT được` | Tháng đó có đơn nghỉ có làm bù đang chờ/đã duyệt |
- **Duyệt**: không ghi lịch (khung OT chỉ lưu trong đơn). Lương OT tính theo giờ có mặt thật trong khung của đơn đã duyệt, không theo `otHours` của đơn (xem "Tiền OT" ở mục Payroll). `otHours` của đơn vẫn dùng cho trần 40 giờ/tháng.

#### `POST /api/v2/requests/advance` (Đơn tạm ứng lương)
- **Request Body**:
  ```json
  {
    "employeeId": "4391e6b3-8fa4-4ee9-b4be-5b232c943891",
    "period": "2026-11"
  }
  ```
  - `employeeId`: uuid hoặc username. `period` (`YYYY-MM`, không bắt buộc): kỳ ứng, mặc định tháng hiện tại (giờ Việt Nam); Admin nộp được vào bất kỳ ngày nào.
  - Chỉ hai trường này được đọc. Số tiền, tiêu đề và lý do do server đặt: số tiền là phần được ứng của ngày công 01–15 do bộ tính lương báo, tiêu đề `Tạm ứng lương tháng M` và `reason` bằng tiêu đề. Client gửi `amount`, `title`, `reason` hay `month` thì bị bỏ qua.
- **Lỗi `400 BAD_REQUEST`**:

  | `message` | Khi nào |
  |---|---|
  | `Thiếu employeeId của nhân viên` | Không gửi `employeeId` |
  | `period must be a valid YYYY-MM period string, got: <giá trị>` | `period` sai định dạng |
  | `Tháng M đã có đơn tạm ứng` | Mỗi tháng một đơn: đã có đơn tạm ứng đang chờ hoặc đã duyệt của kỳ đó (đơn bị từ chối hoặc đã huỷ không chặn). Kiểm trong khoá nhân viên |
  | `Chưa tính được số tiền tạm ứng` | Không có bộ tính lương hoặc tính lỗi (kiểm sau lỗi trùng tháng) |
  | `Chưa có ngày công 01–15/MM` | Số tiền được ứng bằng 0 |

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
  - `saturday`: ngày `YYYY-MM-DD` hợp lệ và phải là Thứ Bảy **sắp tới**: sau hôm nay theo giờ Việt Nam. Thứ Bảy đã qua và chính hôm nay đều bị từ chối, vì iSAT phải đăng ký trước. Màn nộp đơn chỉ nên cho chọn các Thứ Bảy sắp tới.
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
  | 6 | `Chỉ đăng ký iSAT cho Thứ Bảy sắp tới` | `saturday` là hôm nay hoặc trước hôm nay (giờ Việt Nam), kể cả khi đơn sẽ tự `REJECTED`. Ví dụ: T7 07/11 lúc 09:00 thì 31/10 và 07/11 bị từ chối, 14/11 được nhận |
  | 7 | `Đã có đơn iSAT cho Thứ Bảy DD/MM/YYYY` | Người đó đã có đơn iSAT `PENDING` hoặc `APPROVED` cho cùng Thứ Bảy (kể cả khi đơn mới sẽ tự `REJECTED`). Đơn đã `REJECTED`, kể cả tự đánh giá chưa đạt, không chặn |

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

#### `GET /api/v2/requests` & `GET /api/v2/requests/:id` (Đọc đơn)
- `GET /api/v2/requests` nhận các bộ lọc `employeeId` (uuid hoặc username), `type`, `status`, `limit`, `offset`; trả `{ items: [<đơn>], total }`. `GET /api/v2/requests/:id` trả `{ request: <đơn> }`, không có thì `404 REQUEST_NOT_FOUND`.
- Mỗi đơn có các trường chung (`id`, `employeeId` = uuid, `title`, `type`, `reason`, `status`, `reviewedBy`, `reviewedAt`, `reviewNote`, `createdAt`, `updatedAt`) và các trường theo loại:

  | `type` | Trường riêng |
  |---|---|
  | `LEAVE` | `leaveType`, `leaveStartDate`, `leaveEndDate`, `leaveDaysCount` |
  | `LEAVE_WITH_MAKEUP` | `leaveStartDate`, `leaveEndDate`, `leaveDaysCount` (`leaveType` = `null`); `owedMinutes` = 480 × `leaveDaysCount`; `makeupSlots: [{ date, startTime, endTime, workMinutes }]` sắp theo ngày rồi theo giờ bắt đầu |
  | `OVERTIME` | `otDate`, `otStartTime`, `otEndTime`, `otHours` |
  | `SHIFT_CHANGE` | `changeStartDate`, `changeEndDate`, `newShiftType`, `newStartTime`, `newEndTime` |
  | `EXPLANATION` | `explanationDate`, `explanationCases: [mã]` theo thứ tự của `GET /requests/explanation-cases`, `actualCheckIn`, `actualCheckOut` |
  | `ISAT` | khối `isat` (bên dưới) |
  | `ADVANCE` | `advanceAmount`, `advancePeriod` |
- Trường không thuộc loại đơn là `null`; riêng `makeupSlots` và `explanationCases` là `[]`, `isat` là `null`. Các trường giờ bù đơn lẻ cũ (`makeupStartTime`, `makeupEndTime`) và các trường của đơn sửa giờ chấm công cũ không còn trong đơn.
- Danh sách đọc mỗi bảng con (`makeup_slots`, `explanation_cases`) bằng một truy vấn cho cả trang kết quả.

##### Khối `isat`
- `GET /api/v2/requests?type=ISAT` lọc riêng đơn iSAT (cùng các bộ lọc như mọi loại đơn).
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
    "action": "APPROVE",
    "note": "Đã xác nhận đầy đủ lý do hợp lệ"
  }
  ```
  - `action`: `APPROVE` hoặc `REJECT`; `note` không bắt buộc. Người duyệt lấy từ phiên đăng nhập.
- **Response 200**: `{ "updated": true, "request": <đơn>, "recalculated": [ ... ] }`. Không có đơn → `404 REQUEST_NOT_FOUND`.
  - **Phiếu về nháp ngay khi lưu quyết định.** Với mỗi tháng của đơn mà kỳ lương đang `calculated`, trong cùng giao dịch lưu quyết định (cả `APPROVE` lẫn `REJECT`), phiếu của người nộp trong lần chạy nháp hiện tại về `draft` và mất `decidedBy`, `decidedAt`, `note` (phiếu đã ở `draft` thì giữ nguyên). Vì vậy, từ lúc quyết định được lưu, `POST /api/v2/system/periods/:month/approve` bị chặn `409 PERIOD_BLOCKED` (phiếu chưa duyệt) cho tới khi phiếu người đó được duyệt lại, kể cả khi bước tính lại dưới đây lỗi hay không chạy được (ví dụ máy chủ dừng ngay sau khi lưu). Phê duyệt kỳ gọi trong lúc đang duyệt đơn thì đợi lần duyệt đơn commit rồi mới xét, nên cũng thấy phiếu đã về nháp. Không đưa được phiếu về nháp (lỗi DB) thì cả lần duyệt đơn bị huỷ, đơn giữ `PENDING`. Tháng `open` hay `attendance_locked` không đụng tới phiếu nào.
  - `recalculated`: sau khi quyết định đã lưu, với mỗi tháng của đơn (tháng tăng dần, như ở `PERIOD_LOCKED`) mà kỳ lương đang `calculated`, phiếu lương tháng đó của người nộp được tính lại (chỉ người đó; phiếu mới ở `draft`, người khác giữ phiếu và trạng thái). Mỗi tháng một phần tử `{ "month": "2026-10", "ok": true }`. Tháng `open` hay `attendance_locked` không tính lại (lần tính cả kỳ sau Chốt công sẽ lấy dữ liệu mới), nên mảng rỗng `[]` khi không có tháng nào ở `calculated`.
  - Tính lại lỗi: `{ "month": "2026-10", "ok": false, "error": "<câu lỗi>" }`. Quyết định duyệt đơn vẫn giữ (vẫn `200`); phiếu cũ của người đó đã về `draft` lúc lưu quyết định (ở trên), nên Phê duyệt kỳ còn bị chặn tới khi phiếu được duyệt lại (Admin nên tính lại người đó trước khi duyệt). Không đọc được trạng thái kỳ của một tháng sau khi lưu (lỗi DB) thì tháng đó cũng là `ok: false` kèm `error` và không tính lại (Admin tự tính lại người đó nếu kỳ đang `calculated`; phiếu đã về `draft` lúc lưu quyết định); các tháng sau vẫn được xét.
    ```json
    {
      "updated": true,
      "request": { "id": "req-uuid", "type": "EXPLANATION", "status": "APPROVED" },
      "recalculated": [{ "month": "2026-10", "ok": false, "error": "Thiếu cấu hình bậc 9" }]
    }
    ```
- Tháng của đơn đã `approved` hoặc `paid`: `409 PERIOD_LOCKED` (xem "Quy ước chung"), đơn giữ `PENDING`.
- Chỉ đơn `PENDING` duyệt được. Lúc duyệt chỉ kiểm lại **kỳ lương** của các tháng của đơn (`409 PERIOD_LOCKED` ở trên, xét trước), **xung đột ngày** (ma trận ở "Quy ước chung"; thất bại thì `409 DAY_CONFLICT`) và **ngày lễ thêm sau khi nộp** (dưới đây); không kiểm lại các luật khác: chúng đã kiểm lúc nộp, khi đó đã tính cả các đơn đang chờ. Hai lần duyệt cùng một đơn được xếp hàng (khoá `request_<id>`), rồi khoá `requests_<uuid>` của nhân sự.
- **Ngày lễ thắng đơn nghỉ.** Ngày mà đơn nghỉ hoặc đơn nghỉ có làm bù đang giữ, nếu Admin đặt thành ngày lễ sau khi nộp:
  - Đơn nghỉ: ngày đó rời khỏi đơn lúc duyệt và được trả như khi từ chối. `leaveDaysCount` giảm theo, nên số dư Phép năm cũng tự đúng. Ví dụ: nghỉ T2 09/11–T4 11/11, Admin đặt T3 10/11 là lễ rồi duyệt → đơn còn 2 ngày, chỉ T2 và T4 ghi `ON_LEAVE`.
  - Mọi ngày của đơn nghỉ đều đã thành lễ: `409 DAY_CONFLICT` `Các ngày nghỉ của đơn đều đã thành ngày lễ. Chỉ có thể từ chối đơn này.`
  - Đơn nghỉ có làm bù có ngày như vậy: `409 DAY_CONFLICT` `Ngày dd/mm đã thành ngày lễ, đơn nghỉ có làm bù cần nộp lại. Chỉ có thể từ chối đơn này.` (giờ bù đã xếp theo số ngày cũ).
  - Hai lỗi trên có `date` = ngày lễ đầu tiên, `requestId`/`requestType`/`requestStatus` là `null`. Đơn giữ `PENDING`, không ghi gì.
- Tác dụng của `APPROVE` theo loại (lịch được tạo theo ca mặc định trước nếu ngày đó chưa có; ngày được ghi là các ngày đơn đã giữ lúc nộp, không tính lại khoảng ngày lúc duyệt):

  | Loại | Duyệt ghi gì |
  |---|---|
  | Nghỉ | Mỗi ngày đơn đang giữ trong `day_status` (các ngày được tính lúc nộp; ngày bị bỏ như CN, ngày lễ, Thứ Bảy iSAT đã duyệt thì không), trừ ngày đã thành ngày lễ sau khi nộp: lịch `status = "ON_LEAVE"`, `sourceRequestId` = mã đơn. `leaveDaysCount` = số ngày đơn còn giữ (bằng lúc nộp nếu không có ngày lễ mới). |
  | Nghỉ có làm bù | Các ngày nghỉ ghi như đơn nghỉ. Khung bù **không** ghi vào lịch. |
  | OT | Không ghi lịch. |
  | Đổi ca | Mỗi ngày đơn còn giữ trong `day_status`: lịch `scheduleType = "SHIFT_CHANGE"`, `shiftType`/`plannedStartTime`/`plannedEndTime` theo khung mới, `sourceRequestId` = mã đơn. Ngày bị bỏ lúc nộp (ngày nghỉ, Thứ Bảy iSAT đã duyệt) và ngày đã bị đơn nghỉ, nghỉ có làm bù hoặc iSAT thay thì không ghi. |
  | Giải trình | Trạng thái ngày công `explanationDate` thành `VALID`. |
  | iSAT | Xem "Duyệt đơn iSAT" bên dưới. |
- `REJECT` và huỷ (`PATCH /api/v2/requests/:id/cancel`) không đổi lịch làm việc, trừ trường hợp trả ngày cho một đơn đổi ca đã duyệt (ghi lại lịch đổi ca của ngày đó); trạng thái ngày được trả như ở "Quy ước chung".
- **Hai tác dụng phụ** còn tồn tại cho tới khi phần chấm công và phần lương được viết lại:
  - Chấm công không còn thấy giờ OT đã duyệt (`approved_ot_hours` luôn là 0), nên ra muộn sau ca vẫn bị gắn cờ.
  - Phần lương không còn ngày `MAKE_UP` trong lịch, nên ngày có khung bù vẫn được phụ cấp ca.
- Lương OT: phần lương không còn đọc `otHours` của đơn mà trả theo giờ có mặt thật trong khung của đơn đã duyệt (xem "Tiền OT" ở `GET /api/v2/payroll/:month/:employeeId`).

##### Duyệt đơn iSAT
- Chỉ đơn `PENDING` duyệt được, như mọi loại đơn. Tác dụng:
  - `APPROVE`: lịch làm việc của Thứ Bảy đó được ghi `scheduleType = "ISAT"`, `status = "ON_LEAVE"`, `sourceRequestId` = mã đơn (giữ nguyên ca và giờ dự kiến, giờ OT được duyệt về 0). Phiếu lương của tháng chứa Thứ Bảy đó có dòng ngày `shiftCode "ISAT"` / `shiftLabel "iSAT"` / `inOutText "Hưởng lương ngày"` trị giá **một lương ngày** (lương cơ bản ÷ ngày công chuẩn, không phụ cấp, không OT, không khấu trừ) và thay dòng chấm công cùng ngày nếu có (mỗi ngày một dòng, không trả hai lần). `isatDays` đếm số ngày iSAT, `isatPay` cộng vào thu nhập gộp; ngày iSAT không tính vào `actualWorkDays` (không tăng phụ cấp đi lại, chuyên cần) và không bị tính là ngày nghỉ khi xét chuyên cần. Ví dụ: nv bậc 1, lương cơ bản 6.000.000, đơn T7 07/11/2026 đã duyệt → phiếu tháng 2026-11 có dòng 07/11 "iSAT" 230.769 đ, `isatDays = 1`, `isatPay = 230.769`.
  - `REJECT` và huỷ (`PATCH /api/v2/requests/:id/cancel`, khi đơn còn chờ): không ảnh hưởng lương và không đổi lịch, trừ khi đơn iSAT đã thay Thứ Bảy của một đơn đổi ca còn hiệu lực. Khi đó Thứ Bảy được trả cho đơn đổi ca; nếu đơn đổi ca đã duyệt thì lịch Thứ Bảy đó được ghi lại theo ca đổi (`scheduleType = "SHIFT_CHANGE"`, `sourceRequestId` = mã đơn đổi ca).
  - Đơn iSAT mất dòng đăng ký (dữ liệu hỏng) bị từ chối khi `APPROVE` với `400` "Đơn iSAT thiếu dữ liệu đăng ký: <id>" và giữ nguyên `PENDING`; vẫn `REJECT` được.

---

### 3.5. Payroll Module (Tính lương & Phiếu lương)

Mọi endpoint dưới đây nhận `:month` dạng `YYYY-MM`; sai định dạng trả `400` với `code: "INVALID_MONTH"`. Tiền là số nguyên VND. Điểm KPI nhận và trả theo thang 0–100.

**Theo bước của kỳ lương** (§3.7; nguồn luật `docs/superpowers/specs/2026-11-05-payroll-period-lifecycle-design.md` §4):

| Kỳ của tháng | Tính lương (`POST .../calculate`) | Duyệt / từ chối phiếu (`POST .../:username/decision`) | Lưu KPI (`PUT .../kpi/:username`) |
|---|---|---|---|
| `open` | Được, chỉ là nháp; kỳ giữ `open` | `409 PAYSLIP_NOT_DECIDABLE` | Được |
| `attendance_locked` | Tính cả công ty (không gửi `employeeIds`) đưa kỳ sang `calculated`, ghi `calculated_by/at` và `current_run_id`. Tính một phần chỉ là nháp, kỳ giữ `attendance_locked` | `409 PAYSLIP_NOT_DECIDABLE` | Được |
| `calculated` | Được (cả công ty hay một phần); ghi lại `calculated_by/at` và `current_run_id` theo lần chạy mới | Được | Được |
| `approved` / `paid` | `409 PAYROLL_FINALIZED`, không lưu gì | `409 PAYSLIP_NOT_DECIDABLE` | `409 PAYROLL_FINALIZED`, không lưu gì |

- Kỳ chỉ sang `calculated` khi không ai đổi bước của kỳ trong lúc tính (ví dụ Mở lại công rồi Chốt công lại xen vào): khi đó lần chạy vẫn lưu dưới dạng nháp và Admin tính lại cả kỳ.
- `PAYSLIP_NOT_DECIDABLE` (`409`) kèm `status` (bước hiện tại của kỳ), câu `Chỉ duyệt phiếu khi kỳ lương đã tính sau chốt công`. Kiểm trước khi tìm lần chạy hay phiếu.
- `PAYROLL_FINALIZED` (`409`) khi tính lương: câu `Kỳ lương <YYYY-MM> đã phê duyệt, không thể tính lại`; khi lưu KPI: câu `Kỳ lương đã phê duyệt, không sửa KPI được`.

#### `POST /api/v2/payroll/:month/calculate`
- **Mục đích**: Kích hoạt tiến trình tính toán lương cho toàn bộ công ty hoặc danh sách nhân sự trong tháng.
- **Request Body**:
  ```json
  {
    "employeeIds": ["tran-minh-ngoc", "nguyen-van-a"]
  }
  ```
  *(Bỏ `employeeIds` hoặc gửi `[]` để tính cho toàn bộ nhân sự. Nếu gửi, `employeeIds` phải là mảng chuỗi không rỗng, mỗi phần tử là `uuid` hoặc `username`; một người được liệt kê hai lần chỉ có một phiếu. Giá trị khác (chuỗi đơn như `"u1"`, mảng có phần tử không phải chuỗi, chuỗi rỗng hoặc chỉ gồm khoảng trắng, `null`...) bị từ chối bằng `400 INVALID_EMPLOYEE_IDS` trước khi tính.)*
- **Response 201**:
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
  | 409 | `PAYROLL_FINALIZED` | Kỳ lương của tháng đã `approved` hoặc `paid` (câu `Kỳ lương <YYYY-MM> đã phê duyệt, không thể tính lại`, kiểm trước khi tính), hoặc tháng đã có lần chạy `final` |

#### `GET /api/v2/payroll/:month`
- **Mục đích**: Lấy danh sách phiếu lương của kỳ, thuộc lần chạy mới nhất chưa bị thay thế. Tháng chưa tính trả `items: []`.
- **Response 200**: `{ "month": "2026-11", "items": [ <bản ghi phiếu lương> ], "totals": { ... } }`.
- **`totals`** (BE cộng sẵn, FE chỉ hiện; luôn là tổng **cả kỳ** của mọi phiếu trong `items`, không theo bộ lọc hay trang của màn; tháng chưa tính: mọi số 0):

  | Trường | Ý nghĩa |
  |--------|---------|
  | `count` | Số phiếu |
  | `baseSalaryActual`, `kpiActualPay`, `allowance`, `otPay` | Tổng cột "Tiền ngày công" (`details.baseSalaryActual`), "Lương KPI", "Phụ cấp" (`details.totalAllowanceActual`), "Làm thêm" (`details.otPayTotal`) |
  | `lateDeduction` | Tổng cột "Trừ giờ", số **dương** (mỗi phiếu lưu `lateEarlyDeductionAmount` là số âm) |
  | `gross`, `insurance`, `tax`, `advance`, `net` | Tổng các cột cùng tên của bản ghi phiếu |
  | `deductions` | `insurance` + `tax` + `advance` |
  | `netShare` | % thực nhận trên tổng thu nhập = `round(net ÷ gross × 100)`, số nguyên; 0 khi `gross` = 0 |

  Phiếu lưu trước khi có một trường chi tiết thì trường đó tính 0 trong tổng.
- **Bản ghi phiếu lương**:

  | Trường | Ý nghĩa |
  |--------|---------|
  | `id`, `runId` | Mã phiếu và mã lần chạy chứa phiếu |
  | `username` | Tài khoản của nhân sự |
  | `status` | Trạng thái phiếu: `draft` (vừa tính), `approved` (Admin đã duyệt), `rejected` (Admin đã từ chối). Cột này còn cho phép `pending` và `error` nhưng việc tính lương không tạo ra hai giá trị đó |
  | `gross`, `insurance`, `tax`, `advance`, `net` | Tổng thu nhập, bảo hiểm, thuế TNCN, tạm ứng, thực lĩnh (số nguyên VND) |
  | `warnings` | Danh sách cờ cảnh báo của phiếu (xem bảng mã cờ bên dưới); `[]` nếu không có |
  | `details` | Toàn bộ phiếu chi tiết như lúc tính (mô tả ở mục dưới) |
  | `note` | Lý do đi kèm quyết định của Admin, đã cắt khoảng trắng hai đầu; `null` khi chưa có quyết định hoặc quyết định không kèm lý do |
  | `decidedBy` | `username` của người quyết định gần nhất; `null` khi phiếu chưa được quyết định |
  | `decidedAt` | Thời điểm quyết định gần nhất, chuỗi ISO 8601 (UTC), ví dụ `2026-11-05T03:20:11.000Z`; `null` khi chưa có quyết định |

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
  | `employeeType` | Loại nhân sự (`staff.type`: `nv`, `ctv`, `tts`); `null` khi nhân sự chưa có loại |
  | `level` | Bậc của nhân sự (`staff.level`), số nguyên; mặc định 1 |
  | `employmentStatus` | Trạng thái nhân sự (`staff.contract_status`): `probation` (thử việc), `official` (chính thức); `null` khi trống hoặc giá trị khác. Khác với `contractStatusText`, vốn là nhãn hợp đồng |
  | `remainingAnnualLeaveDays` | **Đổi nghĩa**: Phép năm còn lại tính tới hết tháng của phiếu, hoặc `null` khi loại nhân sự không có tài khoản phép. Xem "Phép năm còn lại" bên dưới. Trước đây luôn là 22 |
  | `ot15Hours`, `ot20Hours`, `ot30Hours`, `totalOtHours` | **Đổi nghĩa**: giờ OT theo hệ số ×1,5 / ×2 / ×3 và tổng, cộng từ phần giờ của các dòng ngày; không làm tròn nên có thể lẻ (ví dụ 1,3333333333333333). Không còn lấy từ `otHours` của đơn |
  | `otPayTotal` | **Đổi nghĩa**: tổng `otPay` của các dòng ngày, nên phiếu cộng ra đúng bảng chấm công |
  | `ot15Pay`, `ot20Pay`, `ot30Pay` | **Mới**: tiền OT theo hệ số ×1,5 / ×2 / ×3, cộng từ các dòng ngày; mỗi dòng làm tròn mỗi hệ số một lần. Ba số cộng lại bằng `otPayTotal`. Đi cùng giờ `ot15Hours`, `ot20Hours`, `ot30Hours` |
  | `workPay` | **Mới**: tiền ngày công và ngày nghỉ hưởng lương = `baseSalaryActual` + `paidLeavePay` + `leaveSettlementPay` + `isatPay` + `holidayPay` (chưa gồm bù, OT, phụ cấp, KPI, trừ giờ) |
  | `leaveSettlementPay`, `holidayPay`, `holidayPaidDays` | Quyết toán phép dư (hiện luôn 0, chưa có luật), tiền nghỉ lễ hưởng lương và số ngày lễ hưởng lương; FE hiện thẳng |
  | `lateMinutes` | **Mới**: tổng phút đi muộn **quá ân hạn** cộng từ các ngày của tháng (`lateMinutes` của dòng ngày chấm công). Lần muộn trong ân hạn không được ghi nên không có trong số này; 0 khi không có |
  | `rates` | **Mới**: tỉ lệ BE đã dùng để tính phiếu, lấy từ cài đặt đang áp cho tháng của phiếu (lưu cùng phiếu, nên phiếu cũ vẫn in đúng tỉ lệ lúc tính): `kpiWeights` (`wework`, `user`, `peer`, `manager`, `self`, % của lương KPI, tổng 100), `insurancePct` (`bhxh`, `bhyt`, `bhtn`, `total`, đơn vị %, ví dụ 8, 1.5, 1, 10.5), `otMultipliers` (`weekday`, `weekend`, `holiday`, ví dụ 1.5, 2, 3), `lateGraceMinutes` (ân hạn đi muộn, phút). FE in nhãn "(40%)", "BH 10,5%", "×1,5 ×2 ×3", "không quá 15 phút" từ đây, không giữ hằng số |
  | `calendar` | **Mới**: một phần tử `{ date, kind }` cho mỗi ngày của tháng, theo ngày: `kind` là `work` (đi làm có giờ), `leave` (nghỉ phép, lễ hưởng lương, nghỉ có bù hưởng lương), `isat`, `unpaid` (vắng, nghỉ không lương, ngoài thời gian làm, ngày làm không có giờ), `rest` (ngày nghỉ tuần), `future` (ngày chưa tới mốc xét). BE quyết loại ngày theo đồng hồ của nó; FE không so với ngày máy |
  | `deductionTotal` | **Mới**: khấu trừ = `insuranceDeduction` + `personalIncomeTax` + `advanceDeduction`. Với `GET /api/v2/me/income` ở trạng thái `estimate` (tạm tính chưa trừ bảo hiểm và thuế) bằng `advanceDeduction` |
  | `dayRate` | **Mới**: lương một ngày = `round(baseSalaryPolicy ÷ standardWorkdays)`, ví dụ 6.000.000 ÷ 26 = 230.769 |
  | `dailyLines[].checkIn`, `dailyLines[].checkOut` | Giờ vào và giờ ra thật của dòng ngày, `'HH:MM'` theo giờ Việt Nam (UTC+7); `null` khi thiếu một phía, và luôn `null` ở dòng nghỉ (`LEAVE`, `ISAT`, `UNPAID`). Nguồn: giờ chấm công; phía nào thiếu thì lấy giờ của giải trình đã duyệt cho đúng ngày đó (giải trình chỉ lấp chỗ thiếu, không đè giờ chấm). Giờ ra của giải trình không sau giờ vào được hiểu là giờ ra của hôm sau (ca đêm) |
  | `dailyLines[].inOutText` | **Đổi nghĩa**: dòng ca `NORMAL`, `FLEX`, `NIGHT` là `${checkIn ?? '—'}–${checkOut ?? '—'}`, ví dụ `08:12–17:05`, `08:12–—`. Trước đây ghi cứng `08:00–17:00` hoặc `22:00–06:00`. Dòng nghỉ giữ chữ cũ: `Hưởng lương ngày` (`LEAVE`, `ISAT`), `Không tính lương` (`UNPAID`) |
  | `dailyLines[].shiftLabel` | Nhãn ca do BE dựng: `Normal`, `Flex +20%`, `Night +40%` (phần trăm theo cấu hình, hiện đúng số lẻ nếu có), `Nghỉ phép`, `iSAT`, `Không lương`. FE hiển thị nguyên chữ này |
  | `dailyLines[].otHours`, `dailyLines[].otPay` | **Đổi nghĩa**: giờ OT và tiền OT thật của dòng ngày (trước đây luôn 0). Cách tính ở "Tiền OT" bên dưới |
  | `dailyLines[].dailyTotal` | **Đổi nghĩa**: `daySalary` + `flexAllowancePay` + `nightAllowancePay` + `offPaidPay` + `otPay` − `deductionAmount` (nay có `otPay`) |
  | `dailyLines[].dayOfWeekText` | **Đổi nghĩa**: thứ thật của `date` theo lịch Việt Nam, cho mọi loại dòng: `Thứ 2` … `Thứ 7`, `Chủ nhật`. Ví dụ `2026-10-01` là `Thứ 5`, `2026-10-04` là `Chủ nhật`. Trước đây là chuỗi cố định `Thứ 2 - Thứ 6` hoặc `Thứ 7` |
  | `taxMethod` | Cách tính thuế, chỉ theo nhãn hợp đồng: "HĐLĐ từ 3 tháng" → `progressive` (lũy tiến); "Dưới 3 tháng" → `flat10` (10% của `grossIncome`, chỉ khi `grossIncome` ≥ 5.000.000; dưới mức đó thuế là 0). Cờ `tax_on` và `deduct_on` của nhân sự bị bỏ qua (không có công tắc tắt thuế hay giảm trừ gia cảnh) và ngày bắt đầu hợp đồng không ảnh hưởng thuế. `none` chỉ gặp ở phiếu dựng tay không chọn cách tính thuế; việc tính lương không bao giờ cho ra `none` |
  | `dependants` | Số người phụ thuộc dùng để giảm trừ |
  | `taxExemptIncome`, `taxableIncome`, `taxAssessableIncome` | `taxExemptIncome` (phần thu nhập miễn thuế) = phần OT vượt đơn giá giờ thường (giờ OT 150% miễn 0,5, 200% miễn 1, 300% miễn 2 lần đơn giá giờ, làm tròn) + phần ca đêm miễn thuế. Phần ca đêm: với mỗi dòng ngày ca `NIGHT`, lấy số nhỏ hơn giữa `workHours` × đơn giá giờ × 0,3 và phụ cấp ca đêm của dòng đó (ngày ca đêm không được trả phụ cấp, như ngày làm bù, thì 0; dòng ca khác thì 0), cộng các dòng rồi làm tròn. `taxableIncome` (thu nhập chịu thuế) = `grossIncome` − `taxExemptIncome`. `taxAssessableIncome` (thu nhập tính thuế): `progressive` là sau bảo hiểm và giảm trừ bản thân 15.500.000 + 6.200.000 mỗi người phụ thuộc; `flat10` bằng `grossIncome` khi thuế áp dụng và 0 khi `grossIncome` dưới 5.000.000; `none` là 0 |
  | `personalIncomeTax` | Thuế TNCN phải nộp |
  | `warnings` | Cờ cảnh báo của phiếu, cùng nội dung với `warnings` của bản ghi |

  `netIncome` = `grossIncome` − `insuranceDeduction` − `personalIncomeTax` − `advanceDeduction`.

- **Luật điểm KPI (BE là chuẩn, FE theo)**: điểm mỗi thành phần 0–100, **tối đa 2 chữ số thập phân**, lưu `điểm × 100` làm tròn thành số nguyên (72,555 → 72,56; 87,5 giữ nguyên). Không có luật cắt hay làm tròn về số nguyên. `kpiTotalScorePct` = `round(units ÷ 100) ÷ 100` chỉ để hiện (2 chữ số thập phân); tiền KPI tính trên `units` chưa làm tròn (xem `kpiActualPay`). FE nhập được điểm lẻ tới 2 chữ số, hiện đúng giá trị BE trả (`kpiScores`), không tự làm tròn.

- **Tiền OT**: OT trả theo giờ có mặt thật bên trong khung của đơn OT đã duyệt, không theo số giờ ghi trên đơn.
  1. Khung OT của một đơn là `[otStartTime, otEndTime)` của ngày `otDate`, giờ Việt Nam. Đơn có giờ sai định dạng hoặc giờ kết thúc không sau giờ bắt đầu bị bỏ qua.
  2. Giờ OT của khung = số phút nguyên có mặt nằm trong khung (bỏ phần giây lẻ), rồi chia 60, không làm tròn giờ. Hai khoảng có mặt chồng nhau chỉ tính một lần. Khoảng nghỉ giữa ca và khung OT không được tính vì nằm ngoài khung.
  3. Khoảng có mặt của một dòng công là `[giờ vào, giờ ra]` ở `checkIn` / `checkOut` (giờ chấm, hoặc giờ của giải trình đã duyệt cho phía còn thiếu). Dòng thiếu một trong hai giờ không có khoảng có mặt, nên OT của nó bằng 0.
  4. Hệ số theo `otDate`: ngày có trong `company_holidays` ×3 (ngày lễ thắng cuối tuần); thứ Bảy hoặc Chủ nhật ×2; còn lại ×1,5. Mọi loại nhân sự như nhau. Ba số này nằm trong một hằng số duy nhất của phần lương (`OT_MULTIPLIERS`).
  5. OT gắn vào dòng công có `date = otDate` khi dòng đó có đủ giờ vào và giờ ra. Nếu không, OT gắn vào dòng đầu tiên có khoảng có mặt giao với khung (ví dụ ca đêm kéo sang ngày OT). Nếu cũng không có dòng nào giao thì OT bằng 0 và không tạo dòng mới.
  6. `otHours` của dòng = tổng giờ OT gắn vào dòng. `otPay` của dòng = với mỗi hệ số có trên dòng đó, `round(giờ × lương giờ × hệ số)`, rồi cộng; mỗi hệ số làm tròn một lần. Lương giờ = lương cơ bản ÷ công chuẩn ÷ 8.
  7. Cột `ot_hours` của đơn OT và của bảng chấm công không còn dùng để tính tiền. Phần OT miễn thuế vẫn theo công thức ở `taxExemptIncome`, tính trên `ot15Hours`, `ot20Hours`, `ot30Hours`.

  Ví dụ (nv bậc 1, lương cơ bản 6.000.000, công chuẩn 26 nên lương giờ ≈ 28.846; ca 08:00–17:00; đơn OT thứ Tư 07/10/2026 khung 18:00–20:00 đã duyệt):

  | Giờ ra | `otHours` | `otPay` |
  |--------|-----------|---------|
  | 19:20 (chấm công) | 1,3333… | 57.692 |
  | 20:30 (chấm công) | 2 | 86.538 |
  | thiếu giờ ra; giải trình đã duyệt ghi 19:20 | 1,3333… | 57.692 |
  | thiếu giờ ra; không có giải trình đã duyệt | 0 | 0 |

  Cùng khung 18:00–20:00, ra 20:30, vào thứ Bảy 10/10/2026: 2 × 28.846 × 2 → `otPay` 115.385. Vào ngày lễ 02/09 thì hệ số 3.

  Dòng ngày của ví dụ đầu (vào 08:00, ra 19:20):
  ```json
  {
    "date": "2026-10-07",
    "dayOfWeekText": "Thứ 4",
    "shiftCode": "NORMAL",
    "shiftLabel": "Normal",
    "inOutText": "08:00–19:20",
    "checkIn": "08:00",
    "checkOut": "19:20",
    "workHours": 8,
    "daySalary": 230769,
    "flexAllowancePay": 0,
    "nightAllowancePay": 0,
    "offPaidPay": 0,
    "otHours": 1.3333333333333333,
    "otPay": 57692,
    "deductionHours": 0,
    "deductionAmount": 0,
    "dailyTotal": 288461
  }
  ```

- **Phép năm còn lại** (`remainingAnnualLeaveDays`):
  - Loại nhân sự có phúc lợi `leaveAccount` (trong phiên bản chức vụ đang hiệu lực): `staff.leave_balance` (trống tính 0) − số ngày Phép năm đã duyệt.
  - Số ngày Phép năm đã duyệt = số dòng lịch ngày của nhân sự có trạng thái `LEAVE`, thuộc đơn nghỉ `LEAVE` với `leave_type = 'ANNUAL'` và `status = 'APPROVED'`, tính từ `leave_balance_on` (bỏ mốc này nếu trống) tới ngày cuối của tháng phiếu.
  - Loại không có `leaveAccount` (ví dụ `tts`): `null`. FE hiển thị "—", không ghi "null ngày".
  - Ví dụ: số dư 12, mốc 01/10; đã duyệt 20–21/10 và 05/11; đang chờ 27/10. Phiếu tháng 10 → 10; phiếu tháng 11 → 9.

- **Phiếu đã lưu trước khi có các trường này**: ảnh chụp cũ không được sửa. Nó thiếu các trường `workPay`, `lateMinutes`, `rates`, `calendar`, `deductionTotal`, `employeeType`, `level`, `employmentStatus`, `ot15Pay`, `ot20Pay`, `ot30Pay`, `dayRate` và `dailyLines[].checkIn` / `dailyLines[].checkOut`. Người đọc coi trường thiếu là "chưa có".
  - Các trường cũ vẫn mang nghĩa cũ trong ảnh chụp đó:
    - `dayOfWeekText` là `Thứ 2 - Thứ 6` hoặc `Thứ 7`.
    - `remainingAnnualLeaveDays` luôn là 22.
    - `otPayTotal` là số giờ ghi trên đơn × lương giờ × 2.
    - `inOutText` là chuỗi cố định `08:00–17:00` hoặc `22:00–06:00`.
  - Gọi lại `POST /api/v2/payroll/:month/calculate` ("Tính lương" lại) thì ảnh chụp mới có đủ trường và đúng nghĩa mới.

- **Cờ cảnh báo `warnings`**: mỗi phần tử có dạng `{ "code": "KPI_SCORE_MISSING", "message": "Thiếu điểm KPI; cột thiếu tính 0 điểm.", "fields": ["peer", "self"] }`. `fields` chỉ xuất hiện ở cờ có kèm danh sách (hiện chỉ `KPI_SCORE_MISSING`). Cờ không chặn việc tính, phiếu vẫn được lưu.

  | Mã cờ | Thông báo |
  |-------|-----------|
  | `KPI_PROPOSAL_MISSING` | Chưa nhập lương KPI đề xuất của tháng; lương KPI tạm tính 0. |
  | `KPI_SCORE_MISSING` | Thiếu điểm KPI; cột thiếu tính 0 điểm. |
  | `KPI_PROPOSAL_EXCEEDS_MAX` | Lương KPI đề xuất vượt mức KPI của bậc; đã tính theo mức của bậc. |
  | `NEGATIVE_NET` | Thực lĩnh âm (…): các khoản trừ lớn hơn thu nhập của kỳ. Kiểm tra bảo hiểm, tạm ứng và ngày công. Chỉ báo, không đổi số tiền (`fields: ["netIncome"]`). |

  Nhập mới qua `PUT .../kpi/:username` luôn bị từ chối khi đề xuất vượt mức tối đa, nên `KPI_PROPOSAL_EXCEEDS_MAX` chỉ còn xuất hiện khi mức tối đa của bậc giảm sau khi đã nhập đề xuất.

#### `POST /api/v2/payroll/:month/:username/decision`
- **Mục đích**: Admin duyệt hoặc từ chối phiếu lương của một người trong lần chạy hiện tại của tháng (lần chạy mới nhất chưa bị thay thế). `:username` là tài khoản của nhân sự. Quyền: `payroll.approve`.
- **Request Body**:
  ```json
  { "decision": "reject", "note": "Thiếu giờ ra ngày 07/10, nhờ nhân viên giải trình." }
  ```
  - `decision`: `"approve"` hoặc `"reject"`.
  - `note`: tuỳ chọn, lý do đi kèm; không bắt buộc cho cả hai quyết định. Được cắt khoảng trắng hai đầu; để trống, toàn khoảng trắng hoặc không phải chuỗi thì lưu `null`.
- **Tác dụng**: đặt `status` của phiếu thành `approved` hoặc `rejected`, ghi `note`, `decidedBy` (người đang đăng nhập) và `decidedAt` (giờ hiện tại). Chỉ quyết định được khi kỳ lương của tháng ở `calculated` (đã tính sau chốt công, xem bảng "Theo bước của kỳ lương" ở đầu 3.5). Phiếu đã có quyết định vẫn quyết định lại được khi kỳ còn ở `calculated`; lần sau ghi đè cả bốn trường (duyệt không kèm `note` thì xoá lý do cũ). Không đổi số tiền trên phiếu.
- **Response 201**: `{ "month": "2026-11", "payslip": <bản ghi phiếu lương> }` với `status`, `note`, `decidedBy`, `decidedAt` đã cập nhật.
- **Lỗi** (kiểm theo thứ tự):

  | HTTP | `code` | Khi nào |
  |------|--------|---------|
  | 400 | `INVALID_MONTH` | `:month` sai định dạng |
  | 400 | `INVALID_DECISION` | `decision` không phải `approve` hoặc `reject` (kể cả thiếu body) |
  | 409 | `PAYSLIP_NOT_DECIDABLE` | Kỳ lương của tháng không ở `calculated` (`open`, `attendance_locked`, `approved`, `paid`; tháng chưa có dòng kỳ tính là `open`). Câu `Chỉ duyệt phiếu khi kỳ lương đã tính sau chốt công`, kèm `status`. Kiểm trong khoá `payroll_<month>`, trước khi tìm lần chạy hay phiếu |
  | 404 | `PAYSLIP_NOT_FOUND` | Tháng chưa có lần chạy nào (kiểm trước lần chạy đã chốt) |
  | 409 | `PAYROLL_FINALIZED` | Lần chạy hiện tại của tháng đã chốt (`final`), không đổi quyết định được. Kiểm trước khi tìm phiếu, nên lần chạy đã chốt với `:username` không có phiếu vẫn trả 409 |
  | 404 | `PAYSLIP_NOT_FOUND` | Lần chạy chưa chốt nhưng nhân sự không có phiếu trong đó |

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
- **Lỗi**: kiểm tra kỳ lương trước, rồi `username`, rồi đến các điểm, rồi đến `proposedAmount`; có lỗi thì không ghi gì.

  | HTTP | `code` | Khi nào |
  |------|--------|---------|
  | 400 | `INVALID_MONTH` | `:month` sai định dạng |
  | 409 | `PAYROLL_FINALIZED` | Kỳ lương của tháng đã `approved` hoặc `paid`. Câu: `Kỳ lương đã phê duyệt, không sửa KPI được` |
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
- Lưu tuần làm việc của một người (`work-week`) hoặc nhóm cài đặt chấm công (`attendance`, ân hạn) có thay đổi thì dòng ngày công (`timesheet_entries`) được dựng lại từ tháng áp dụng tới tháng hiện tại: tuần làm chỉ cho người đó, nhóm chấm công cho mọi người đang làm. Việc này chạy sau khi lưu đã commit; nếu dựng lại lỗi thì request trả lỗi nhưng cài đặt vẫn đã lưu (Admin dùng `POST /api/v2/attendance/recalculate`).

#### `GET /api/v2/system/audit` & `GET /api/v2/system/audit/verify`
- Quyền `audit.read`. Danh sách: `?limit=&offset=&actor=&action=&from=&to=`. Tham số bỏ trống hoặc chuỗi rỗng thì không lọc; `actor` đúng username, `action` đúng mã; `from`, `to` dạng `YYYY-MM-DD` tính theo ngày giờ Việt Nam (+07:00). Sắp xếp `id` giảm dần; `limit` mặc định 25, lớn hơn 200 thì hạ về 200; `offset` mặc định 0.
- **Response 200**: `{ items, total, limit, offset, people, actions }`. Mỗi `items[]` có `id`, `at` (ISO UTC), `actor`, `actorName` (`staff.name`, `null` khi `'system'` hoặc không còn trong `staff`), `action`, `entityKind`, `entityId`, `subject`, `month`, `before`, `after` (JSON đã parse), `reason`, `sensitivity`, `requestId`. Không trả `hash`, `prev_hash`, `actor_roles`, hai cột uuid. `total` là tổng thật theo bộ lọc. `people` (`{ username, name }`) và `actions` (mã) lấy trên cả bảng, không theo bộ lọc.
- **Response 400** `BAD_REQUEST` (câu báo tiếng Việt): `limit` không phải số nguyên dương; `offset` không phải số nguyên không âm; `from` hoặc `to` sai dạng hoặc không phải ngày có thật; `from` sau `to`.
- `/verify` trả `{ ok, checked, firstBadId, reason }`; `reason` là `PREV_HASH`, `ID_GAP` hoặc `HASH` (kiểm theo thứ tự đó), dừng ở dòng sai đầu tiên, `checked` là số dòng đúng trước dòng sai. Bảng rỗng: `{ ok: true, checked: 0, firstBadId: null, reason: null }`.
- **Ghi nhật ký (nội bộ):** `AuditLog.append(trx, entry)` trả `{ id, hash }`, chạy trong transaction của nơi gọi (thao tác lỗi thì dòng nhật ký cũng bị huỷ) và nên gọi ở cuối thao tác vì khoá advisory `'audit_log'` giữ tới khi transaction kết thúc. `entry`: `actor`, `action`, `entityKind`, `entityId` bắt buộc; `actorUuid`, `actorRoles`, `subject`, `subjectUuid`, `month`, `before`, `after`, `reason`, `sensitivity` (`normal`/`pay`/`pii`), `requestId` tuỳ chọn. Mã `action` (21): `param.set`, `setting.set`, `holiday.add`, `holiday.remove`, `position.save`, `level.save`, `staff.create`, `staff.update`, `staff.delete`, `password.reset`, `request.decide` (`after.status` là `APPROVED` hoặc `REJECTED`), `request.cancel`, `punch.correct`, `period.lock`, `period.unlock`, `period.approve`, `period.unapprove`, `period.pay`, `payroll.calculate`, `payroll.decide`, `kpi.score`.
- **Kiểm tra trước khi nối:** `append` kiểm `entry` trước khi lấy khoá. Dòng không hợp lệ ném `AuditEntryError`, ra ngoài là 500 và huỷ cả transaction của nơi gọi, nên nơi gọi phải dựng đúng `entry`.
- **Giới hạn:** các trường chữ (`actor`, `action`, `entityKind`, `entityId`, `actorUuid`, `subject`, `subjectUuid`, `month`, `requestId`) dài tối đa 200 ký tự; `reason` tối đa 1000; `before`/`after` sau khi chuyển JSON tối đa 65536 ký tự; `month` dạng `YYYY-MM`. Trường tuỳ chọn là `''`, `undefined` hoặc `null` thì lưu NULL. Ký tự thay thế lẻ (nửa emoji) được đổi thành U+FFFD trước khi băm, vì PG lưu như vậy; ký tự NUL (`\u0000`) bị từ chối.
- **Khối nội dung bí mật:** `before`, `after`, `reason`, `entityId` khớp băm mật khẩu (`scrypt$…`, `pass_hash`, `password_hash`), token phiên hoặc khoá `"lat"` / `"lng"` thì bị từ chối. Cần ghi thay đổi toạ độ thì ghi cờ đã đổi, không ghi toạ độ.
- **`requestId`:** một thao tác của người dùng dùng một `requestId`. Các dòng cùng người làm, cùng `action`, cùng `requestId` trong cùng một ngày được màn hình gộp thành "× N".
- **Chỉ một lối ghi:** chỉ `AuditLog.append` được `INSERT` vào `audit_log`; ghi lối khác thì chuỗi băm hỏng.
- **Đổi so với bản trước:** response danh sách từng là `{ items, count }`, nay là `{ items, total, limit, offset, people, actions }`.

---

### 3.7. Periods Module (Kỳ lương)

Kỳ lương của một tháng đi qua năm bước: `open` (Đang chấm công) → `attendance_locked` (Đã chốt công) → `calculated` (Đã tính lương) → `approved` (Đã phê duyệt) → `paid` (Đã trả lương). Tháng chưa có dòng kỳ coi như `open`. Phần này mô tả Chốt công (`lock`), Mở lại công (`unlock`), Phê duyệt kỳ (`approve`), Huỷ phê duyệt (`unapprove`) và Đã trả lương (`pay`); bước `calculated` do tính lương cả kỳ tự đặt (xem mục Payroll). Mọi route nằm dưới `/api/v2/system/periods`. Lỗi có dạng `{ "error": "<câu tiếng Việt>", "code": "<mã>" }`.

#### `GET /api/v2/system/periods`
- Quyền `config.read`. Mọi kỳ đã có dòng, tháng mới nhất trước.
- **Response 200**: `{ "periods": [ <dòng payroll_periods> ] }`. Dòng có `month`, `status`, `rev`, `current_run_id`, `attendance_locked_by/at`, `calculated_by/at`, `approved_by/at`, `paid_by/at`, `paid_ref`, `reopen_count`.

#### `GET /api/v2/system/periods/:month`
- Quyền `config.read`. `:month` dạng `YYYY-MM`.
- **Response 200**:
  ```json
  {
    "month": "2026-10",
    "status": "attendance_locked",
    "steps": {
      "lockedAt": "2026-11-01T01:00:00.000Z", "lockedBy": "admin",
      "calculatedAt": null, "calculatedBy": null,
      "approvedAt": null, "approvedBy": null,
      "paidAt": null, "paidBy": null
    },
    "payday": "2026-11-10",
    "actions": { "unlock": { "enabled": true } }
  }
  ```
  - `payday`: ngày 10 của tháng sau. `actions` chỉ chứa các nút hiện ở trạng thái đó, tính theo trạng thái chứ không theo quyền người gọi: `lock` chỉ có khi tháng đã kết thúc (theo ngày giờ Việt Nam) và kỳ đang `open`; `unlock` có ở `attendance_locked` và `calculated`; `approve` có ở `calculated`; `unapprove` có ở `approved`; `pay` có ở `approved` từ ngày trả lương (theo giờ Việt Nam). Kỳ `paid` có `actions: {}`.
  - Ở `calculated`, `actions.approve` luôn kèm `blockers`; còn vướng thì `enabled: false` kèm `reason`:
    ```json
    "approve": {
      "enabled": false,
      "reason": "Còn 1 người chưa có phiếu · 2 phiếu chưa duyệt · 1 đơn chờ duyệt",
      "blockers": {
        "pendingRequests": 1,
        "unapprovedSlips": 2,
        "missingSlips": [{ "username": "nv.an", "name": "Nguyễn An" }]
      }
    }
    ```
    `reason` nối các phần theo thứ tự: người chưa có phiếu, phiếu chưa duyệt, đơn chờ duyệt (chỉ phần có số lớn hơn 0). `pendingRequests` là số đơn `PENDING` có ngày (nghỉ, làm bù, tăng ca, giải trình, đổi ca, kỳ ứng, Thứ Bảy iSAT) rơi vào tháng; đơn của tháng khác không tính. `unapprovedSlips` là số phiếu của lần chạy hiện tại có trạng thái khác `approved`. `missingSlips` là nhân sự chưa bị khoá (`locked_at` rỗng) mà không có phiếu trong lần chạy hiện tại, sắp theo `username`.
- Mọi route dưới đây trả cùng dạng này sau khi đổi trạng thái.

#### `POST /api/v2/system/periods/:month/lock`
- Quyền `attendance.lock`. Không có body. Chốt công: kỳ `open` (hoặc chưa có dòng) sang `attendance_locked`, ghi `attendance_locked_by/at`. Ghi nhật ký `period.lock`.
- **Response 201**: `PeriodView` như trên, `status: "attendance_locked"`.

#### `POST /api/v2/system/periods/:month/unlock`
- Quyền `attendance.lock`. Mở lại công: kỳ `attendance_locked` hoặc `calculated` về `open`; xoá `attendance_locked_by/at` và `calculated_by/at`, tăng `reopen_count`. Ghi nhật ký `period.unlock` kèm lý do đã cắt khoảng trắng hai đầu.
- **Request Body**: `{ "reason": "Chấm thay cho Châu 31/10" }`. `reason` là chuỗi, cắt khoảng trắng hai đầu xong không được rỗng.
- **Response 201**: `PeriodView`, `status: "open"`.

#### `POST /api/v2/system/periods/:month/approve`
- Quyền `payroll.approve`. Không có body. Phê duyệt kỳ: kỳ `calculated` sang `approved`; lần chạy lương hiện tại thành `final` (phiếu của lần chạy đó không sửa được nữa); ghi `approved_by/at`, `current_run_id`. Ghi nhật ký `period.approve`.
- Chạy dưới khoá `payroll_<tháng>` nên không xen vào một lần tính lương hay một quyết định duyệt phiếu. Hai lần gọi cùng lúc thì một lần thành công, lần kia nhận `409 PERIOD_STATE`.
- Đợi các lần duyệt đơn đang dở của tháng commit rồi mới xét vướng; lần duyệt đơn đó đã đưa phiếu của người nộp về `draft` (mục `PATCH /api/v2/requests/:id/review`), nên kỳ không được duyệt với phiếu cũ của người đó.
- Còn vướng (đơn chờ duyệt, phiếu chưa duyệt, người chưa có phiếu) thì `409 PERIOD_BLOCKED`, câu lỗi là `reason` ở trên, kèm `blockers`.
- **Response 201**: `PeriodView`, `status: "approved"`.

#### `POST /api/v2/system/periods/:month/unapprove`
- Quyền `payroll.approve`. Huỷ phê duyệt: kỳ `approved` về `calculated`; xoá `approved_by/at`. Lần chạy `final` thành `superseded`, rồi tạo lần chạy `draft` mới (`run_no` + 1) và chép mọi phiếu sang đó, giữ nguyên `status`, `decided_by/at`, `note`, `rev`; `current_run_id` trỏ tới lần chạy mới. Ghi nhật ký `period.unapprove` kèm lý do đã cắt khoảng trắng hai đầu.
- **Request Body**: `{ "reason": "Sai KPI Bình" }`. `reason` là chuỗi, cắt khoảng trắng hai đầu xong không được rỗng.
- **Response 201**: `PeriodView`, `status: "calculated"`. Kỳ `paid` không huỷ được (`409 PERIOD_STATE`).

#### `POST /api/v2/system/periods/:month/pay`
- Quyền `payroll.approve`. Không có body. Đã trả lương: kỳ `approved` sang `paid`, ghi `paid_by/at`. Chỉ từ ngày trả lương (theo ngày giờ Việt Nam) trở đi. Ghi nhật ký `period.pay`.
- **Response 201**: `PeriodView`, `status: "paid"`, `actions: {}`.

#### Mã lỗi
| HTTP | `code` | Khi |
|---|---|---|
| 400 | `INVALID_MONTH` | `:month` không đúng `YYYY-MM` (tháng 01 đến 12) |
| 400 | `REASON_REQUIRED` | `unlock` hoặc `unapprove` thiếu `reason`, không phải chuỗi, hoặc toàn khoảng trắng. Câu: `Cần ghi lý do` |
| 400 | `REASON_TOO_LONG` | `unlock` hoặc `unapprove` có `reason` dài hơn 1000 ký tự sau khi cắt khoảng trắng hai đầu (độ dài như nhật ký đếm). Kiểm ngay sau `REASON_REQUIRED`, trước khi đọc kỳ; không ghi gì. Câu: `Lý do tối đa 1000 ký tự` |
| 409 | `PERIOD_STATE` | Thao tác không hợp lệ ở bước hiện tại, ví dụ chốt công hai lần; kèm `month`, `status`. Câu: `Kỳ lương tháng MM/YYYY đang ở bước "<nhãn>", không làm được thao tác này` |
| 409 | `MONTH_NOT_ENDED` | `lock` khi tháng chưa kết thúc. Câu: `Tháng MM/YYYY chưa kết thúc, chưa chốt công được` |
| 409 | `PERIOD_BLOCKED` | `approve` còn vướng; kèm `blockers` (dạng như ở `GET .../:month`). Câu: `Còn <n> người chưa có phiếu · <n> phiếu chưa duyệt · <n> đơn chờ duyệt` (chỉ phần có số lớn hơn 0) |
| 409 | `BEFORE_PAYDAY` | `pay` trước ngày trả lương; kèm `payday` (`YYYY-MM-DD`). Câu: `Chưa tới ngày trả lương DD/MM/YYYY` |

**Đổi so với bản trước:** `POST .../lock` từng trả `{ ok, month, status }`, nay trả `PeriodView`; chốt lại tháng đã chốt giờ là `409 PERIOD_STATE` thay vì ghi đè; chốt trước khi hết tháng giờ là `409 MONTH_NOT_ENDED`. `GET /periods` bỏ `reviewed_by`, `reviewed_at`.

---

### 3.8. Holidays Module (Lịch lễ công ty)

Một lịch lễ chung cho cả công ty, do Admin tick. Mỗi ngày lễ gồm `date` (`YYYY-MM-DD`) và `name`; mỗi ngày chỉ có một dòng. Thêm hay xoá ngày lễ **không** sửa ngay các đơn đã nộp. Ngày lễ thêm sau khi nộp được xét khi Admin duyệt đơn nghỉ (`PATCH /api/v2/requests/:id/review`, mục "Ngày lễ thắng đơn nghỉ"); đơn đã duyệt và ngày lễ bị xoá sau khi nộp thì không đổi. Chưa kiểm vai trò ở các route này.

Mọi lỗi dưới đây có dạng `{ "error": "<câu tiếng Việt>", "code": "<mã>" }`. Ngoài `404 HOLIDAY_NOT_FOUND` và `409 PERIOD_LOCKED`, lỗi nào cũng là `400` với `code: "BAD_REQUEST"`.

**Tháng đã chốt công** (nguồn luật `docs/superpowers/specs/2026-11-05-payroll-period-lifecycle-design.md` §5): ngày lễ của một tháng mà kỳ lương không còn `open` thì không thêm, không xoá được. `POST /api/v2/holidays` và `DELETE /api/v2/holidays/:date` trả `409 PERIOD_LOCKED` kèm `month`, `status`, câu như ở chấm công (`Tháng MM/YYYY đã chốt công`, `Kỳ lương tháng MM/YYYY đã phê duyệt`, `Kỳ lương tháng MM/YYYY đã trả lương`), và không ghi gì. `POST /api/v2/holidays/quick-add` không báo lỗi: ngày của tháng như vậy bị bỏ qua, không có trong `added`.

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

  Giữa bước 2 và bước 3: tháng của `date` không còn `open` thì `409 PERIOD_LOCKED` (xem đầu mục).

#### `POST /api/v2/holidays/quick-add`
- **Mục đích**: Thêm nhanh bốn ngày lễ cố định của một năm. Ngày đã có trong lịch thì bỏ qua và giữ nguyên tên cũ. Ngày thuộc tháng mà kỳ lương không còn `open` cũng bị bỏ qua, không báo lỗi.
- **Request Body**: `{ "year": 2026 }`. `year` là số nguyên từ 2000 đến 2100.
- **Các ngày được thêm**:

  | Ngày | Tên |
  |------|-----|
  | 01/01 | Tết Dương lịch |
  | 30/04 | Ngày Giải phóng miền Nam |
  | 01/05 | Quốc tế Lao động |
  | 02/09 | Quốc khánh |
- **Response 201**: `{ "added": ["2026-01-01", "2026-04-30", "2026-05-01", "2026-09-02"] }`. `added` chỉ gồm các ngày vừa thêm, nên gọi lần hai cho cùng năm trả `{ "added": [] }`. Ví dụ: kỳ tháng 2026-05 đã chốt công thì 01/05/2026 không được thêm và không có trong `added`.
- **Lỗi**: `400` `Năm không hợp lệ: <giá trị>` khi thiếu `year` hoặc không phải số nguyên 2000–2100.

#### `DELETE /api/v2/holidays/:date`
- **Mục đích**: Xoá một ngày lễ. `:date` dạng `YYYY-MM-DD`.
- **Response 200**: `{ "deleted": true }`
- **Lỗi**:
  - `400` `Ngày lễ không hợp lệ: <giá trị>` khi `:date` sai định dạng hoặc ngày không tồn tại.
  - `409 PERIOD_LOCKED` khi tháng của `:date` không còn `open` (xem đầu mục), kiểm trước khi tìm ngày lễ.
  - `404` `Không có ngày lễ <date>` với `code: "HOLIDAY_NOT_FOUND"` khi ngày đó không có trong lịch.
  - `400` `Ngày lễ không hợp lệ: <date>` khi `:date` sai định dạng hoặc là ngày không tồn tại.

---

### 3.9. Settings Module (Cài đặt theo tháng áp dụng)

Mọi số tính lương/chấm công đổi theo **tháng áp dụng** (`effectiveMonth`, `YYYY-MM`, từ `minMonth` trở đi; `minMonth` là tháng sau tháng đã chốt công gần nhất, không sớm hơn tháng hiện tại). Mỗi nhóm có một số phiên bản `stamp` (số nguyên không âm): ghi phải gửi lại đúng `stamp` đã đọc, sai thì `409 SETTINGS_STALE` kèm `stamp` mới, FE tải lại rồi lưu lại. Lý do `reason` tuỳ chọn, tối đa 300 ký tự (rỗng thành `null`). Quyền đọc `config.read`, ghi `config.write`.

Lỗi chung của cả mục:

  | HTTP | `code` | Ý nghĩa |
  |---|---|---|
  | 400 | `BAD_SETTINGS_INPUT` | Đầu vào sai; kèm `field` là ô sai (`month`, `year`, `radiusM`, `weekdays`, `effectiveMonth`, `stamp`...) |
  | 404 | `SETTINGS_GROUP_NOT_FOUND` | `:group` không phải một trong 6 nhóm |
  | 404 | `EMPLOYEE_NOT_FOUND` | `:username` không có nhân sự |
  | 404 | `WORK_WEEK_NOT_FOUND` | Loại nhân sự của người đó không có tuần làm việc |
  | 409 | `SETTINGS_STALE` | `stamp` cũ, kèm `stamp` hiện tại |
  | 403 | (không có) | Thiếu quyền |

6 nhóm `:group` (đường dẫn) và khoá tương ứng trong response `GET /api/v2/settings`: `overtime` → `overtime`, `attendance` → `attendance`, `kpi-weights` → `kpiWeights`, `insurance` → `insurance`, `tax` → `tax`, `pay-calendar` → `payCalendar`.

#### `GET /api/v2/settings?month=YYYY-MM`
- **Mục đích**: Toàn bộ 6 nhóm cài đặt có hiệu lực ở một tháng, kèm mặc định và biên của từng ô để FE dựng form.
- **Quyền**: `config.read`.
- **Query**: `month` bỏ trống thì tháng hiện tại.
- **Response 200** (rút gọn; mỗi nhóm cùng dạng `{ from, stamp, values, defaults, limits }`):
  ```json
  {
    "month": "2026-11",
    "minMonth": "2026-11",
    "groups": {
      "overtime": {
        "from": "2026-11", "stamp": 10,
        "values": { "weekdayRate": 1.6, "weekendRate": 2.5, "holidayRate": 3 },
        "defaults": { "weekdayRate": 1.5, "weekendRate": 2, "holidayRate": 3 },
        "limits": { "weekdayRate": { "min": 1.5, "max": 5, "step": 0.01 } }
      },
      "attendance": { "values": { "lateGraceMinutes": 10, "diligenceLostFromDays": 4 } },
      "kpiWeights": { "values": { "wework": 40, "user": 24, "peer": 18, "manager": 12, "self": 6 }, "sum": 100 },
      "insurance": { "values": { "bhxhPct": 8.5, "bhytPct": 1.5, "bhtnPct": 1 } },
      "tax": { "values": { "personalDeduction": 15500000, "dependantDeduction": 6200000, "shortContractPct": 12, "shortContractThreshold": 5000000,
                           "brackets": [ { "upTo": 10000000, "ratePct": 6 }, { "upTo": null, "ratePct": 35 } ] },
               "limits": { "brackets": { "minRows": 1, "maxRows": 10, "upTo": { "min": 1, "max": 1000000000, "step": 1 }, "ratePct": { "min": 0, "max": 100, "step": 0.01 } } } },
      "payCalendar": { "values": { "payDay": 12 }, "limits": { "payDay": { "min": 1, "max": 28, "step": 1 } } }
    }
  }
  ```
  - `from`: tháng bắt đầu của phiên bản đang hiệu lực. `limits.<ô>`: `{ min, max, step }`; riêng `tax.limits.brackets` là `{ minRows, maxRows, upTo, ratePct }`. `kpiWeights.sum` là tổng bắt buộc (100).
- **Lỗi**: `400 BAD_SETTINGS_INPUT` (`field: "month"`, `Tháng phải có dạng YYYY-MM`).

#### `PUT /api/v2/settings/:group`
- **Mục đích**: Lưu các ô của một nhóm, áp dụng từ một tháng.
- **Quyền**: `config.write`.
- **Body**: `{ "values": { <ô>: <số> }, "effectiveMonth": "2026-12", "reason": "tuỳ chọn", "stamp": 10 }`. `values` chỉ cần các ô đổi (nhóm `tax` gửi `brackets` nguyên mảng). Số ngoài `limits` thì `400`. Nhóm `kpi-weights` phải cộng đúng 100.
- **Response 200**: `{ "ok": true, "effectiveMonth": "2026-12", "changed": ["weekdayRate"], "stamp": 13 }`. Không có gì đổi thì `changed: []` và `stamp` giữ nguyên.
- **Lỗi**: `400 BAD_SETTINGS_INPUT`, `404 SETTINGS_GROUP_NOT_FOUND`, `409 SETTINGS_STALE`.

#### `GET /api/v2/settings/:group/history`
- **Mục đích**: Lịch sử đổi của một nhóm, mới nhất trước.
- **Quyền**: `config.read`.
- **Response 200**: `{ "items": [ { "id": 10, "field": "weekendRate", "month": "2026-11", "from": 2, "to": 2.5, "by": "admin", "at": "2026-11-05T21:51:49.646Z", "reason": null } ] }`. `month` là tháng áp dụng (`null` với vùng chấm công); `from` / `to` là giá trị trước / sau.
- **Lỗi**: `404 SETTINGS_GROUP_NOT_FOUND`.

#### `GET /api/v2/settings/pay-days?year=YYYY`
- **Mục đích**: Ngày trả lương của 12 tháng trong năm (lịch trả lương).
- **Quyền**: `config.read`.
- **Query**: `year` bắt buộc, 4 chữ số.
- **Response 200**: `{ "year": 2026, "items": [ { "month": "2026-01", "payDay": 10, "payDate": "2026-02-10" } ] }` (`payDate` là ngày trả của lương tháng `month`, rơi vào tháng sau).
- **Lỗi**: `400 BAD_SETTINGS_INPUT` (`field: "year"`, `Năm phải có 4 chữ số`).

#### `GET /api/v2/settings/attendance-zone`
- **Mục đích**: Vùng chấm công (toạ độ và bán kính được phép chấm).
- **Quyền**: `config.read`.
- **Response 200**: `{ "zone": { "lat": 10.7769, "lng": 106.7009, "radiusM": 150 }, "stamp": 12 }`. Chưa cấu hình thì `zone: null`.

#### `PUT /api/v2/settings/attendance-zone`
- **Mục đích**: Lưu vùng chấm công (hiệu lực ngay, không theo tháng).
- **Quyền**: `config.write`.
- **Body**: `{ "lat": 10.7769, "lng": 106.7009, "radiusM": 150, "reason": null, "stamp": 12 }`. `lat` -90..90, `lng` -180..180, `radiusM` số nguyên 20..5000.
- **Response 200**: `{ "ok": true, "zone": { "lat": 10.7769, "lng": 106.7009, "radiusM": 150 }, "stamp": 13 }`.
- **Lỗi**: `400 BAD_SETTINGS_INPUT` (`field`: `lat`, `lng`, `radiusM`, `stamp`), `409 SETTINGS_STALE` (kèm `stamp`).

#### `GET /api/v2/settings/attendance-zone/history`
- **Quyền**: `config.read`.
- **Response 200**: `{ "items": [ { "id": 12, "field": "zone", "month": null, "from": null, "to": { "lat": 10.7769, "lng": 106.7009, "radiusM": 150 }, "by": "admin", "at": "2026-11-05T21:51:53.404Z", "reason": null } ] }`.

#### `GET /api/v2/settings/work-weeks?month=YYYY-MM`
- **Mục đích**: Tuần làm việc của mọi người ở một tháng (tuần riêng nếu có, không thì tuần của loại nhân sự), cho bảng công. Người có loại không có tuần làm thì không có mặt.
- **Quyền**: `config.read`.
- **Response 200**: `{ "month": "2026-11", "weekdays": { "pw-staff": [1, 2, 3, 4, 5, 6] } }`; khoá là `username`, giá trị là các thứ làm việc (1 = Thứ Hai ... 6 = Thứ Bảy).
- **Lỗi**: `400 BAD_SETTINGS_INPUT` (`field: "month"`).

#### `GET /api/v2/settings/work-weeks/:username?month=YYYY-MM`
- **Mục đích**: Tuần làm việc của một người ở một tháng.
- **Quyền**: `config.read`.
- **Response 200**: `{ "username": "pw-staff", "month": "2026-11", "minMonth": "2026-11", "weekdays": [1,2,3,4,5,6], "source": "type", "standardWorkdays": 26, "from": null, "typeWeekdays": [1,2,3,4,5,6], "typeStandardWorkdays": 26, "standardByDays": { "1": 4, "2": 9, "3": 13, "4": 17, "5": 22, "6": 26 }, "stamp": 0 }`. `standardByDays`: công chuẩn theo số ngày làm mỗi tuần (n × 52 ÷ 12, làm tròn), để hộp chọn ngày hiện công chuẩn trước khi lưu; FE không tự tính. `source`: `"own"` (tuần riêng) hoặc `"type"` (theo loại nhân sự); `from` là tháng bắt đầu tuần riêng (`null` khi theo loại).
- **Lỗi**: `404 EMPLOYEE_NOT_FOUND`, `404 WORK_WEEK_NOT_FOUND`, `400 BAD_SETTINGS_INPUT`.

#### `PUT /api/v2/settings/work-weeks/:username`
- **Mục đích**: Đặt tuần làm việc riêng cho một người từ một tháng, hoặc quay về tuần của loại nhân sự.
- **Quyền**: `config.write`.
- **Body**: `{ "weekdays": [1,2,3,4,6], "effectiveMonth": "2026-12", "reason": null, "stamp": 0 }`. `weekdays` là danh sách thứ 1..6, không trùng, ít nhất một; `weekdays: null` = quay về tuần của loại.
- **Response 200**: `{ "ok": true, "weekdays": [1,2,3,4,6], "source": "own", "standardWorkdays": 22, "stamp": 14 }`.
- **Lỗi**: `400 BAD_SETTINGS_INPUT` (`field: "weekdays"`...), `404 EMPLOYEE_NOT_FOUND`, `404 WORK_WEEK_NOT_FOUND`, `409 SETTINGS_STALE`.

#### `GET /api/v2/settings/work-weeks/:username/history`
- **Quyền**: `config.read`.
- **Response 200**: `{ "items": [ ... ] }` cùng dạng phần tử như `GET /api/v2/settings/:group/history` (`items` rỗng khi chưa có lần đổi).
- **Lỗi**: `404 EMPLOYEE_NOT_FOUND`.

---

### 3.10. Positions Module (Chức vụ và bậc lương theo tháng)

Đọc danh mục bằng `GET /api/v2/employees/meta/positions` (mỗi chức vụ có `rev`, mỗi bậc cũng có `rev`). Ba route ghi dưới đây đều cần `config.write`, áp dụng từ `effectiveMonth` (`YYYY-MM`, không sớm hơn tháng hiện tại), có `reason` tuỳ chọn (tối đa 300 ký tự), và dùng `expectedRev` (số `rev` đã đọc) để chống ghi đè. Mã chức vụ `code` là `tts`, `ctv` hoặc `nv`. Kiểm hết mọi mục rồi mới ghi, một mục lỗi thì không mục nào được lưu.

Lỗi chung:

  | HTTP | `code` | Ý nghĩa |
  |---|---|---|
  | 400 | `BAD_REQUEST` | Đầu vào sai; kèm `field` là đường dẫn ô sai (ví dụ `items[0].changes.flexPct`) |
  | 404 | `POSITION_NOT_FOUND` | Chức vụ chưa có ở tháng áp dụng |
  | 404 | `LEVEL_NOT_FOUND` | Bậc chưa có ở tháng áp dụng |
  | 409 | `POSITION_STALE` | `expectedRev` của chức vụ đã cũ |
  | 409 | `LEVEL_STALE` | `expectedRev` của bậc đã cũ, hoặc `level` thêm mới không phải bậc kế tiếp |
  | 403 | (không có) | Thiếu quyền |

#### `PUT /api/v2/positions`
- **Mục đích**: Sửa một hay nhiều chức vụ (màn Chức vụ và bậc, Chế độ theo loại).
- **Body**: `{ "effectiveMonth": "2026-12", "reason": "tuỳ chọn", "items": [ { "code": "nv", "expectedRev": 0, "changes": { "workdays": 26, "flexPct": 10, "benefits": { "ot": true } } } ] }`. `changes` nhận: `name` (1..60 ký tự), `workdays` (1..31), `flexPct`, `travelPct`, `attendancePct`, `nightPct` (0..100; `nv` không nhận `nightPct`), `benefits` (các ô `kpi`, `idorm`, `leaveAccount`, `isat`, `ot`, `makeup`, mỗi ô boolean). Ô khác thì `400`. `items` ít nhất một, không trùng `code`.
- **Response 200**: `{ "ok": true, "effectiveMonth": "2026-12" }`.
- **Lỗi**: `400 BAD_REQUEST`, `404 POSITION_NOT_FOUND`, `409 POSITION_STALE`.

#### `PUT /api/v2/positions/:code/levels/:level`
- **Mục đích**: Sửa một bậc đã có.
- **Body**: `{ "effectiveMonth": "2026-12", "expectedRev": 0, "reason": null, "changes": { "baseSalary": 8000000, "kpiMax": 2000000, "nightPct": null, "name": "Fresher" } }`. `baseSalary`, `kpiMax` là số nguyên không âm (`kpiMax` nhận `null`); `nightPct` 0..100 hoặc `null` (theo chức vụ; riêng `nv` chỉ nhận `null`).
- **Response 200**: `{ "ok": true, "effectiveMonth": "2026-12" }`.
- **Lỗi**: `400 BAD_REQUEST`, `404 LEVEL_NOT_FOUND`, `409 LEVEL_STALE`.

#### `POST /api/v2/positions/:code/levels`
- **Mục đích**: Thêm bậc kế tiếp (bậc cao nhất đang có ở tháng áp dụng cộng 1).
- **Body**: `{ "effectiveMonth": "2026-12", "level": 5, "reason": null, "values": { "name": "Senior", "baseSalary": 12000000, "kpiMax": null, "nightPct": null } }`. Cả bốn ô của `values` bắt buộc.
- **Response 201**: `{ "ok": true, "effectiveMonth": "2026-12", "level": 5 }`.
- **Lỗi**: `400 BAD_REQUEST`, `404 POSITION_NOT_FOUND`, `409 LEVEL_STALE` (`Bậc kế tiếp ở tháng 11/2026 là bậc 5`).

---

### 3.11. Roles Module (Vai trò)

#### `GET /api/v2/roles`
- **Mục đích**: Danh sách vai trò cho dropdown phân quyền và form nhân sự (alias cũ `GET /api/roles` trả y hệt).
- **Quyền**: `staff.manage`.
- **Response 200**: `{ "roles": [ { "code": "admin", "label": "Quản trị viên (Admin)", "isDefault": true }, { "code": "manager", "label": "Quản lý (Manager)", "isDefault": true }, { "code": "staff", "label": "Nhân viên (Staff)", "isDefault": true } ] }`.

---

### 3.12. Realtime Module (Sự kiện trực tiếp, SSE)

#### `GET /api/v2/realtime/stream`
- **Mục đích**: Luồng Server-Sent Events một chiều server→client; Admin thấy ngay khi nhân viên chấm công. Dùng cookie phiên như mọi route khác (với `EventSource` thì thêm `withCredentials: true` nếu khác origin).
- **Quyền**: `attendance.correct`. Chưa đăng nhập `401`, nhân viên thường `403`. Mỗi người tối đa 5 luồng cùng lúc, quá thì `429` (`code: TOO_MANY_STREAMS`).
- **Response 200**: `Content-Type: text/event-stream`, kèm `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`, `X-Accel-Buffering: no`. Mỗi khung có dạng `event: <type>` rồi `data: <JSON>`, kết thúc bằng một dòng trống:

  ```
  retry: 3000
  event: ready
  data: {}

  event: attendance.punched
  data: {"type":"attendance.punched","username":"nv1","name":"Nguyễn Văn A","workDate":"2026-11-03","direction":"IN","at":"2026-11-03T01:40:12.000Z","time":"08:40","source":"self"}

  : ping
  ```
- **Loại khung**:
  - `ready`: gửi ngay khi nối xong, `data` là `{}`.
  - Dòng chú thích `: ping` mỗi 25 giây để proxy không cắt kết nối; `EventSource` bỏ qua dòng này.
  - `attendance.punched`: có lần chấm công mới được lưu. `direction` là `IN` hoặc `OUT`; `at` là ISO 8601 UTC; `time` là `HH:mm` giờ Việt Nam; `workDate` là ngày công (`YYYY-MM-DD`, có thể khác ngày của `at` với ca đêm); `source` là `self` (nhân viên tự chấm) hoặc `admin` (quản trị chấm hộ). Chỉ phát sau khi đã lưu thành công; chấm bị từ chối thì không có sự kiện.
  - `attendance.changed`: Admin tính lại một ngày công (`POST /api/v2/attendance/recalculate` với `workDate`). `data` là `{"type":"attendance.changed","username":"nv1","workDate":"2026-11-03"}`. Tính lại cả tháng (`month`) không phát sự kiện.
- **Kết nối lại**: SSE không phát lại sự kiện đã lỡ. Mỗi lần nối (hoặc nối lại sau khi rớt, `EventSource` tự thử lại sau `retry` = 3 giây) client phải tải lại dữ liệu đang hiển thị (bảng chấm công hôm nay) rồi mới áp sự kiện mới. Nên coi `ready` là tín hiệu "tải lại". Phiên hết hạn thì nối lại trả `401`: dừng thử và đưa về màn đăng nhập.
- **Mở rộng**: sự kiện đi qua `RealtimeBus` nên sau này đổi sang WebSocket hay PostgreSQL LISTEN/NOTIFY (nhiều instance) không đổi định dạng khung ở trên. Loại sự kiện mới chỉ được thêm, FE phải bỏ qua loại chưa biết.
