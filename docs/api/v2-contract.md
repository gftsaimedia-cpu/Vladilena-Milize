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

#### Quy ước chung: `warnings`, lỗi `DAY_CONFLICT`, trạng thái ngày
Áp dụng cho cả 7 route tạo đơn của Admin (`POST /api/v2/requests/<loại>`) và `POST /api/v2/me/requests/<loại>` (cùng thân trả về, cùng lỗi). Nguồn luật: `docs/superpowers/specs/2026-11-05-day-status-design.md`.

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

#### Các route `/api/v2/me` cho nhân viên tự nộp đơn
Mọi route chỉ cần phiên đăng nhập; danh tính luôn là người đang đăng nhập, `employeeId` hay `username` trong body bị bỏ qua. Nguồn luật: `docs/superpowers/specs/2026-11-05-staff-requests-design.md` (mục 2 và 3).

- **`GET /api/v2/me/request-context`**: một lần gọi trả đủ dữ liệu cho form: `today`, `window` (từ hôm nay tới ngày cuối tháng sau, giờ Việt Nam), `kinds` (loại đơn dùng được, `enabled: false` kèm `reason` là loại bị khoá), `months` (`closed`, `otMinutes`, `otCapMinutes`, `hasOvertime`, `hasMakeupLeave`), `leaveTypes`, `annualLeaveLeft` (`null` khi không có quyền lợi phép năm), `shiftFrames`, `days` (`workday`, `shift`, `holiday`, `claim`, `hours`), `explanationDays` và `advance`. Lỗi: `400 BAD_REQUEST`.
- **`POST /api/v2/me/requests/:kind/preview`**: body giống `POST /api/v2/me/requests/:kind`, không ghi gì. `:kind` là một trong `leave`, `leave-with-makeup`, `overtime`, `shift-change`, `explanation`, `advance`; loại khác (kể cả `isat`, không có xem trước) trả `404` mã `REQUEST_KIND_NOT_FOUND`. Luôn trả `200`:
  - hợp lệ: `{ "ok": true, "title": "Phép năm 13–16/11", "summary": { … }, "warnings": [] }`; `summary` theo loại: leave `{ dates, daysCount, annualLeaveLeftAfter }`, leave-with-makeup `{ dates, daysCount, makeupMinutesRequired, makeupMinutesPlanned }`, overtime `{ minutes, monthMinutesAfter }`, shift-change `{ dates, keptDates }`, explanation `{ cases, needs }`, advance `{ month, amount, workDays }`;
  - không hợp lệ: `{ "ok": false, "message": "<câu lỗi của server>", "code": "DAY_CONFLICT" }`; `code` chỉ có khi là xung đột ngày. Xếp chưa đủ giờ bù thì `ok: false` với câu `Còn thiếu N giờ bù`.
- **`POST /api/v2/me/requests/:kind`** (tạo đơn): cùng thân trả về và lỗi như route Admin, nhưng áp luật tự nộp (`filedBy: 'self'`):
  - ngày phải nằm trong `window` (`Chỉ chọn ngày từ 05/11 đến 31/12`), áp cho đơn nghỉ, nghỉ có làm bù (cả ngày nghỉ lẫn ngày bù), làm thêm giờ, đổi ca;
  - tháng đã chốt công thì từ chối (`Tháng 10 đã chốt công`);
  - giờ OT và giờ bù phải là giờ tròn (`Chỉ chọn giờ tròn`);
  - tạm ứng chỉ nộp ngày 16 và 17 (giờ Việt Nam) cho tháng hiện tại (`Chỉ nộp tạm ứng ngày 16 và 17`);
  - `iSAT` giữ nguyên như trước.
- **Tiêu đề do server đặt** (cả `/me` lẫn Admin): `title` client gửi bị bỏ qua. Mẫu: `Phép năm 13–16/11`, `Nghỉ có làm bù 13–14/11`, `Làm thêm 10/11 18–20h`, `Đổi ca Flex 06–15, 10–12/11`, `Giải trình 27/10`, `Tạm ứng lương tháng 11`; khoảng ngày khác tháng ghi đủ (`Phép năm 30/11–02/12`).
- **`GET /api/v2/me/today`**: thêm `reminders: [{ date, remindedAt }]`, những ngày Admin đã nhắc và còn cần giải trình, mới nhất trước. Lỗi khi lấy lời nhắc thì trả `[]`, màn không hỏng. `alert` giữ nguyên.
- **`GET /api/v2/me/attendance/:date`**: thêm hai trường:
  - `explanation`: đơn giải trình mới nhất không bị huỷ của ngày đó, dạng `{ id, status, sentAt, cases, actualCheckIn, actualCheckOut }`, hoặc `null`;
  - `due`: `{ cases, needs, remindedAt }` khi ngày cần giải trình, ngược lại `null`. Lỗi khi lấy thông tin giải trình thì cả hai là `null`, ngày công vẫn mở được.
- **`GET /api/v2/me/profile`**: `leave.remainingDays` do server tính từ đơn (cùng hàm với `annualLeaveLeft`), `0` khi không có quyền lợi phép năm; nếu không tính được thì giữ số trong hợp đồng.

#### Route Admin về giải trình (cần quyền `requests.review`)
- **`GET /api/v2/requests/explanations-due`**: mọi ngày cần giải trình của mọi nhân sự đang làm, mới nhất trước. Trả `{ "items": [{ "employeeId", "name", "date", "cases", "needs", "remindedAt" }] }`.
- **`POST /api/v2/requests/explanations-due/remind`**: body `{ "employeeId", "date" }`; người nhắc lấy từ phiên Admin. Trả `{ "reminded": true, "remindedAt": "<ISO>" }`. Nhắc lại thì ghi đè lần trước. Ngày không còn cần giải trình thì `400 BAD_REQUEST` với lý do cụ thể, ví dụ `Ngày 02/11 đã có đơn giải trình`, `Ngày 02/11 không có gì cần giải trình`, `Ngày 02/11 không phải ngày làm`, `Tháng 10 đã chốt công`.
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
  | `Tháng M đã chốt công` | Tháng của `workDate` đã chốt công |
  | `Thiếu cấu hình loại nhân sự <loại>` | Loại nhân sự chưa có cấu hình ca/lịch (cần để biết ngày làm và ca) |
  | `Ngày dd/MM không phải ngày làm` | Không có ca, trước ngày vào làm, ngày lễ, nghỉ phép hoặc Thứ Bảy iSAT |
  | `Ngày dd/MM đã có đơn giải trình` | Người đó đã có đơn giải trình cùng ngày đang chờ, đã duyệt hoặc **đã bị từ chối**. Đơn đã huỷ không chặn. Kiểm lại trong khoá khi ghi |
  | `Ngày dd/MM không có gì cần giải trình` | Giờ chấm của ngày không rơi vào trường hợp nào |
  | `Giờ thực tế không hợp lệ: <giá trị>` | `actualCheckIn`/`actualCheckOut` có giá trị nhưng không phải `HH:mm` |
  | `Nhập giờ vào thực tế` | Ngày `MISSING_CHECK_IN` mà không có `actualCheckIn` |
  | `Nhập giờ ra thực tế` | Ngày `MISSING_CHECK_OUT` mà không có `actualCheckOut` |
  | `Giờ ra phải sau giờ vào` | Cả hai giờ cùng nhập, giờ ra không sau giờ vào (ca đêm không xét) |
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
- **Mục đích**: Admin nộp đơn nghỉ thay một nhân sự (nhân sự tự nộp qua `POST /api/v2/me/requests/leave`, cùng luật). Chỉ nghỉ nguyên ngày.
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
  - Số ngày client gửi (nếu có) **bị bỏ qua**. Server đếm `leaveDaysCount` = số **ngày làm việc** trong khoảng: thứ nằm trong `regular_dows` của loại nhân sự (nv/ctv T2–T7, tts T2–T6, không bao giờ tính CN), trừ ngày lễ công ty (§3.7). Ví dụ: nv nghỉ T6 13/11 → T2 16/11 được đếm 3 ngày (13, 14, 16); tts cùng khoảng được 2 ngày (13, 16).
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
- **Response 200**: `{ "updated": true, "request": <đơn> }`. Không có đơn → `404 REQUEST_NOT_FOUND`.
- Chỉ đơn `PENDING` duyệt được. Lúc duyệt chỉ kiểm lại **xung đột ngày** (ma trận ở "Quy ước chung"; thất bại thì `409 DAY_CONFLICT`) và **ngày lễ thêm sau khi nộp** (dưới đây); không kiểm lại các luật khác: chúng đã kiểm lúc nộp, khi đó đã tính cả các đơn đang chờ. Hai lần duyệt cùng một đơn được xếp hàng (khoá `request_<id>`), rồi khoá `requests_<uuid>` của nhân sự.
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

- **Phiếu đã lưu trước khi có các trường này**: ảnh chụp cũ không được sửa. Nó thiếu các trường `employeeType`, `level`, `employmentStatus`, `ot15Pay`, `ot20Pay`, `ot30Pay`, `dayRate` và `dailyLines[].checkIn` / `dailyLines[].checkOut`. Người đọc coi trường thiếu là "chưa có".
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

  Nhập mới qua `PUT .../kpi/:username` luôn bị từ chối khi đề xuất vượt mức tối đa, nên `KPI_PROPOSAL_EXCEEDS_MAX` chỉ còn xuất hiện khi mức tối đa của bậc giảm sau khi đã nhập đề xuất.

#### `POST /api/v2/payroll/:month/:username/decision`
- **Mục đích**: Admin duyệt hoặc từ chối phiếu lương của một người trong lần chạy hiện tại của tháng (lần chạy mới nhất chưa bị thay thế). `:username` là tài khoản của nhân sự. Quyền: `payroll.approve`.
- **Request Body**:
  ```json
  { "decision": "reject", "note": "Thiếu giờ ra ngày 07/10, nhờ nhân viên giải trình." }
  ```
  - `decision`: `"approve"` hoặc `"reject"`.
  - `note`: tuỳ chọn, lý do đi kèm; không bắt buộc cho cả hai quyết định. Được cắt khoảng trắng hai đầu; để trống, toàn khoảng trắng hoặc không phải chuỗi thì lưu `null`.
- **Tác dụng**: đặt `status` của phiếu thành `approved` hoặc `rejected`, ghi `note`, `decidedBy` (người đang đăng nhập) và `decidedAt` (giờ hiện tại). Phiếu đã có quyết định vẫn quyết định lại được khi kỳ chưa chốt; lần sau ghi đè cả bốn trường (duyệt không kèm `note` thì xoá lý do cũ). Không đổi số tiền trên phiếu.
- **Response 200**: `{ "month": "2026-11", "payslip": <bản ghi phiếu lương> }` với `status`, `note`, `decidedBy`, `decidedAt` đã cập nhật.
- **Lỗi** (kiểm theo thứ tự):

  | HTTP | `code` | Khi nào |
  |------|--------|---------|
  | 400 | `INVALID_MONTH` | `:month` sai định dạng |
  | 400 | `INVALID_DECISION` | `decision` không phải `approve` hoặc `reject` (kể cả thiếu body) |
  | 404 | `PAYSLIP_NOT_FOUND` | Tháng chưa có lần chạy nào (kiểm trước kỳ đã chốt) |
  | 409 | `PAYROLL_FINALIZED` | Lần chạy hiện tại của tháng đã chốt (`final`), không đổi quyết định được. Kiểm trước khi tìm phiếu, nên kỳ đã chốt với `:username` không có phiếu vẫn trả 409 |
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

#### `GET /api/v2/system/audit` & `GET /api/v2/system/audit/verify`
- Quyền `audit.read`. Danh sách: `?limit=&offset=&actor=&action=&from=&to=`. Tham số bỏ trống hoặc chuỗi rỗng thì không lọc; `actor` đúng username, `action` đúng mã; `from`, `to` dạng `YYYY-MM-DD` tính theo ngày giờ Việt Nam (+07:00). Sắp xếp `id` giảm dần; `limit` mặc định 25, lớn hơn 200 thì hạ về 200; `offset` mặc định 0.
- **Response 200**: `{ items, total, limit, offset, people, actions }`. Mỗi `items[]` có `id`, `at` (ISO UTC), `actor`, `actorName` (`staff.name`, `null` khi `'system'` hoặc không còn trong `staff`), `action`, `entityKind`, `entityId`, `subject`, `month`, `before`, `after` (JSON đã parse), `reason`, `sensitivity`, `requestId`. Không trả `hash`, `prev_hash`, `actor_roles`, hai cột uuid. `total` là tổng thật theo bộ lọc. `people` (`{ username, name }`) và `actions` (mã) lấy trên cả bảng, không theo bộ lọc.
- **Response 400** `BAD_REQUEST` (câu báo tiếng Việt): `limit` không phải số nguyên dương; `offset` không phải số nguyên không âm; `from` hoặc `to` sai dạng hoặc không phải ngày có thật; `from` sau `to`.
- `/verify` trả `{ ok, checked, firstBadId, reason }`; `reason` là `PREV_HASH`, `ID_GAP` hoặc `HASH` (kiểm theo thứ tự đó), dừng ở dòng sai đầu tiên, `checked` là số dòng đúng trước dòng sai. Bảng rỗng: `{ ok: true, checked: 0, firstBadId: null, reason: null }`.
- **Ghi nhật ký (nội bộ):** `AuditLog.append(trx, entry)` trả `{ id, hash }`, chạy trong transaction của nơi gọi (thao tác lỗi thì dòng nhật ký cũng bị huỷ) và nên gọi ở cuối thao tác vì khoá advisory `'audit_log'` giữ tới khi transaction kết thúc. `entry`: `actor`, `action`, `entityKind`, `entityId` bắt buộc; `actorUuid`, `actorRoles`, `subject`, `subjectUuid`, `month`, `before`, `after`, `reason`, `sensitivity` (`normal`/`pay`/`pii`), `requestId` tuỳ chọn. Mã `action` (17): `param.set`, `setting.set`, `holiday.add`, `holiday.remove`, `position.save`, `level.save`, `staff.create`, `staff.update`, `staff.delete`, `password.reset`, `request.decide` (`after.status` là `APPROVED` hoặc `REJECTED`), `request.cancel`, `punch.correct`, `period.lock`, `payroll.calculate`, `payroll.decide`, `kpi.score`.
- **Kiểm tra trước khi nối:** `append` kiểm `entry` trước khi lấy khoá. Dòng không hợp lệ ném `AuditEntryError`, ra ngoài là 500 và huỷ cả transaction của nơi gọi, nên nơi gọi phải dựng đúng `entry`.
- **Giới hạn:** các trường chữ (`actor`, `action`, `entityKind`, `entityId`, `actorUuid`, `subject`, `subjectUuid`, `month`, `requestId`) dài tối đa 200 ký tự; `reason` tối đa 1000; `before`/`after` sau khi chuyển JSON tối đa 65536 ký tự; `month` dạng `YYYY-MM`. Trường tuỳ chọn là `''`, `undefined` hoặc `null` thì lưu NULL. Ký tự thay thế lẻ (nửa emoji) được đổi thành U+FFFD trước khi băm, vì PG lưu như vậy; ký tự NUL (`\u0000`) bị từ chối.
- **Khối nội dung bí mật:** `before`, `after`, `reason`, `entityId` khớp băm mật khẩu (`scrypt$…`, `pass_hash`, `password_hash`), token phiên hoặc khoá `"lat"` / `"lng"` thì bị từ chối. Cần ghi thay đổi toạ độ thì ghi cờ đã đổi, không ghi toạ độ.
- **`requestId`:** một thao tác của người dùng dùng một `requestId`. Các dòng cùng người làm, cùng `action`, cùng `requestId` trong cùng một ngày được màn hình gộp thành "× N".
- **Chỉ một lối ghi:** chỉ `AuditLog.append` được `INSERT` vào `audit_log`; ghi lối khác thì chuỗi băm hỏng.
- **Đổi so với bản trước:** response danh sách từng là `{ items, count }`, nay là `{ items, total, limit, offset, people, actions }`.

#### `POST /api/v2/system/periods/:month/lock`
- Chốt và khóa bảng chấm công kỳ lương để ngăn chỉnh sửa.

---

### 3.7. Holidays Module (Lịch lễ công ty)

Một lịch lễ chung cho cả công ty, do Admin tick. Mỗi ngày lễ gồm `date` (`YYYY-MM-DD`) và `name`; mỗi ngày chỉ có một dòng. Thêm hay xoá ngày lễ **không** sửa ngay các đơn đã nộp. Ngày lễ thêm sau khi nộp được xét khi Admin duyệt đơn nghỉ (`PATCH /api/v2/requests/:id/review`, mục "Ngày lễ thắng đơn nghỉ"); đơn đã duyệt và ngày lễ bị xoá sau khi nộp thì không đổi. Chưa kiểm vai trò ở các route này.

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
