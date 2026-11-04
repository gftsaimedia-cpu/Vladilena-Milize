# Đơn iSAT (BE v2) — thiết kế

Thêm loại đơn `ISAT` vào module `src/modules/requests/` để nhân sự nộp form "GFT iSAT – Thêm thời gian cho bản thân" (xin nghỉ Thứ Bảy có lương sau khi tự đánh giá 4 điều kiện). Admin đọc lại đủ mọi trường qua `GET /api/v2/requests` và `GET /api/v2/requests/:id`. Đơn được duyệt thì ghi lịch Thứ Bảy đó và phiếu lương tính ngày iSAT.

Loại: Architectural (loại đơn mới, bảng mới, endpoint mới, nối sang attendance và payroll).

## 1. Luật đã chốt (người dùng, trong chat, 2026-11-04)

| # | Luật |
|---|------|
| L1 | Họ tên, cấp bậc lấy từ hồ sơ nhân sự và **chụp** vào đơn lúc nộp. Bộ phận/Team do người nộp gõ (hồ sơ chưa có cột này). |
| L2 | Ca làm việc lấy từ hồ sơ và chụp vào đơn. |
| L3 | Không có trường "kỳ đánh giá" ở BE (không tính, không lưu). FE tự hiển thị nếu muốn. |
| L4 | Danh sách điều kiện là hằng số trong code; mỗi đơn lưu bản chụp (mã, nội dung, Đạt/Chưa đạt). Đổi điều kiện = sửa một chỗ trong code; đơn cũ giữ nội dung cũ. |
| L5 | Điều kiện nào không điền thì mặc định **Chưa đạt**. |
| L6 | Tự đánh giá dưới 4/4 → vẫn lưu đơn, tự chuyển `REJECTED` kèm ghi chú "tự đánh giá chưa đạt". Không xử lý làm bù. |
| L7 | Chỉ nhân sự loại `nv` có iSAT (cờ quyền lợi `isat` trong `position_type_benefits`, dữ liệu gieo chỉ bật cho `nv`). Không có nhánh làm bù cho Chuyên trách viên trong đơn này. |
| L8 | Duyệt đơn qua route duyệt chung `PATCH /api/v2/requests/:id/review`; không thêm kiểm vai trò ("HDO" chỉ là tên gọi trên giao diện). |
| L9 | Duyệt → ghi lịch Thứ Bảy đó **và** phiếu lương tính ngày iSAT. |
| L10 | Thứ Bảy đã duyệt iSAT mà vẫn có dòng chấm công → dòng iSAT **thay thế** dòng chấm công (mỗi ngày một dòng, không trả hai lần). |
| L11 | (Đã chốt trước đó, ngày công) Ngày iSAT trả một lương ngày cơ bản, không phụ cấp; không tính là ngày nghỉ khi xét chuyên cần. |

Quyết định thiết kế đã được duyệt: lưu nội dung form ở **bảng riêng** `isat_registrations`; bản chụp điều kiện ở **bảng con** `isat_registration_conditions` (không dùng JSONB, theo `skills/backend-design-standards` mục 1.2); thêm `GET /api/v2/requests/isat/conditions`.

## 2. Ngoài phạm vi

- Hạn chót nộp đơn; chặn nộp cho Thứ Bảy đã qua (chưa có luật).
- Phân quyền người duyệt, quyền nộp hộ người khác (chưa bàn bảo mật; giữ cách `employeeId` tuỳ chọn như các route đơn hiện có).
- Nhánh làm bù của Chuyên trách viên / nhân viên chưa đạt.
- Bảo hiểm tính "ngày có lương" gồm iSAT (nhánh bảo hiểm mở rộng chưa có trong payroll hiện tại).
- Áp migration lên bất kỳ DB nào.

## 3. Dữ liệu

File mới `migrations/postgres/0004_isat_registrations.sql` (số `0003` đã thuộc `0003_payroll_rules.sql` trên `feat/pure-v2-backend` 92dca91):

```sql
ALTER TABLE system_requests DROP CONSTRAINT system_requests_type_check;
ALTER TABLE system_requests ADD CONSTRAINT system_requests_type_check
  CHECK (type IN ('LEAVE','TIME_CORRECTION','OVERTIME','ADVANCE','SHIFT_CHANGE','LEAVE_WITH_MAKEUP','EXPLANATION','ISAT'));

CREATE TABLE isat_registrations (
  request_id       UUID PRIMARY KEY REFERENCES system_requests(id),
  saturday         DATE NOT NULL,     -- Thứ Bảy đăng ký
  full_name        TEXT NOT NULL,     -- chụp từ hồ sơ lúc nộp
  team             TEXT NOT NULL,     -- người nộp gõ
  position_type    TEXT NOT NULL,     -- chụp: 'nv'
  position_level   BIGINT NOT NULL,   -- chụp: 2
  level_name       TEXT,              -- chụp: 'Chuyên viên' (NULL nếu danh mục không có)
  shift_type       TEXT NOT NULL,     -- chụp: 'NORMAL'
  shift_start_time TEXT NOT NULL,     -- '08:00'
  shift_end_time   TEXT NOT NULL      -- '17:00'
);
CREATE INDEX idx_isat_registrations_saturday ON isat_registrations (saturday);

CREATE TABLE isat_registration_conditions (
  request_id UUID    NOT NULL REFERENCES isat_registrations(request_id),
  sort_order INTEGER NOT NULL CHECK (sort_order >= 1),  -- thứ tự hiển thị 1..4
  code       TEXT    NOT NULL CHECK (length(code) > 0),  -- 'NO_VIOLATION'
  label      TEXT    NOT NULL,                           -- nội dung lúc nộp
  passed     BOOLEAN NOT NULL,
  PRIMARY KEY (request_id, code)
);
```

- Ràng buộc CHECK cột `type` của bảng gốc được PostgreSQL tự đặt tên `system_requests_type_check`.
- Số điều kiện đạt suy ra từ các dòng con (`passed = true`), không lưu cột riêng.
- `src/database/schema.ts` thêm kiểu `IsatRegistrationsTable`, `IsatRegistrationConditionsTable` và hai mục tương ứng trong `Schema` bằng tay (script sinh kiểu đã được lưu trữ khỏi repo).
- Lưu đơn ISAT ghi `system_requests`, `isat_registrations` và `isat_registration_conditions` trong **một giao dịch**.

Hằng số điều kiện (`src/modules/requests/domain/isat.ts`):

| Mã | Nội dung |
|----|----------|
| `NO_VIOLATION` | Không vi phạm Nội quy lao động hoặc các quy định của Công ty trong kỳ xét duyệt |
| `REPORTS_DONE` | Thực hiện đầy đủ các báo cáo |
| `WORK_COMPLETED` | Hoàn thành công việc được giao theo kế hoạch |
| `OFFICIAL_EMPLOYEE` | Là nhân viên chính thức |

## 4. Nộp đơn — `POST /api/v2/requests/isat`

Thân yêu cầu:

```json
{
  "employeeId": "uuid hoặc username (tuỳ chọn; trống = người đăng nhập)",
  "saturday": "2026-11-07",
  "team": "VN Pod — Vận hành",
  "conditions": { "NO_VIOLATION": true, "REPORTS_DONE": true, "WORK_COMPLETED": true, "OFFICIAL_EMPLOYEE": false }
}
```

Xử lý theo thứ tự; mọi lỗi trả **400** `BAD_REQUEST` (giống các route đơn hiện có):

1. Tìm hồ sơ theo uuid hoặc username → không thấy: lỗi.
2. Cờ quyền lợi `isat` của loại nhân sự (bản `position_types` hiệu lực mới nhất ≤ tháng hiện tại) phải bật → không bật: "iSAT chỉ áp dụng cho nhóm Nhân viên".
3. `saturday` là ngày `YYYY-MM-DD` hợp lệ và là **Thứ Bảy**.
4. `team` là chuỗi không rỗng (cắt khoảng trắng hai đầu).
5. `conditions`: không gửi / mã thiếu / giá trị `null` → Chưa đạt (L5); gửi mà không phải object (mảng, chuỗi…) → lỗi; mã lạ → lỗi; giá trị khác `true`/`false`/`null` → lỗi. Bản chụp luôn đủ 4 điều kiện theo thứ tự hằng số.
6. Đã có đơn ISAT `PENDING` hoặc `APPROVED` của cùng người cho cùng Thứ Bảy → lỗi "Đã có đơn iSAT cho Thứ Bảy …".
7. `title` = "Đăng ký iSAT Thứ Bảy DD/MM/YYYY"; `reason` = "Tự đánh giá đạt N/4 điều kiện". Server tự sinh, bỏ qua giá trị client gửi.
8. Chụp hồ sơ: `full_name` = `staff.name`, `position_type` = `staff.type`, `position_level` = `staff.level`, `level_name` = `position_levels.name` (bản hiệu lực mới nhất ≤ tháng hiện tại, NULL nếu không có), ca = `staff.shift_type/shift_start_time/shift_end_time`. `employee_id` của đơn luôn là `staff.uuid`.
9. Trạng thái: 4/4 → `PENDING`. Dưới 4/4 → `REJECTED`, `review_note` = "Tự đánh giá chưa đạt 4/4 (đạt N/4)", `reviewed_by` = NULL, `reviewed_at` = lúc nộp.

Phản hồi giống các route tạo đơn: `{ "created": true, "request": <SystemRequestDTO> }`.

`GET /api/v2/requests/isat/conditions` → `{ "conditions": [{ "code", "label" }] }` (4 mục theo thứ tự hằng số).

## 5. Admin đọc lại

`SystemRequestDTO` thêm trường `isat`: `null` với mọi loại khác `ISAT`; với đơn ISAT:

```json
"isat": {
  "saturday": "2026-11-07",
  "fullName": "Nguyễn Văn A",
  "team": "VN Pod — Vận hành",
  "positionType": "nv",
  "positionLevel": 2,
  "levelName": "Chuyên viên",
  "shift": { "type": "NORMAL", "startTime": "08:00", "endTime": "17:00" },
  "conditions": [{ "code": "NO_VIOLATION", "label": "Không vi phạm…", "passed": false }],
  "passedCount": 3,
  "totalCount": 4
}
```

`RequestsRepository.findById` và `list` left join `isat_registrations`, rồi đọc `isat_registration_conditions` của các đơn ISAT trong kết quả bằng **một** truy vấn `request_id IN (…)` sắp theo `sort_order`; `GET /api/v2/requests?type=ISAT` lọc được nhờ bộ lọc `type` sẵn có.

## 6. Duyệt — ghi lịch

`PATCH /api/v2/requests/:id/review` với `APPROVE` trên đơn `ISAT` (chỉ đơn `PENDING`, như mọi đơn):

- `ensureDefaultSchedule(employeeId, saturday)` rồi lưu lịch đó với `schedule_type = 'ISAT'`, `status = 'ON_LEAVE'`, `source_request_id` = mã đơn.
- `ScheduleType` thêm `'ISAT'`; `WorkSchedule.withIsat(requestId)` mới (cột `work_schedules.schedule_type` là TEXT không CHECK, không cần migration).
- `REJECT` không đổi lịch.

## 7. Nối lương

- `PayrollRepository.getMonthlyData` đọc thêm ngày Thứ Bảy của các đơn `ISAT` **APPROVED** của người đó có `saturday` trong tháng (lọc khoảng `>= YYYY-MM-01` và `<= ngày cuối tháng`), trả về dưới dạng `isatDates: string[]` trong `EmployeeMonthlyRawData` (qua `mapMonthRows`, như các dòng thô khác trên nền 92dca91).
- `PayrollService.generateMonthlyPayslip`: với mỗi ngày trong `isatDates`, bỏ dòng chấm công cùng ngày (L10) và thêm một dòng ngày `shiftCode 'ISAT'`, `shiftLabel 'iSAT'`, `inOutText 'Hưởng lương ngày'`, `daySalary = round(lương cơ bản / ngày công chuẩn)`, phụ cấp/OT/khấu trừ = 0, `dailyTotal = daySalary`. Danh sách dòng sắp theo ngày.
- Domain `EmployeePayslip` đã có sẵn: đếm `isatDays`, `isatPay = round(isatDays × lương ngày)` vào gross; ngày ISAT không vào `actualWorkDays` (không tăng phụ cấp đi lại/chuyên cần) và không vào số ngày nghỉ xét chuyên cần (L11).
- Ví dụ: nv bậc 1, lương cơ bản 6.000.000, đơn iSAT T7 07/11/2026 đã duyệt → phiếu tháng 2026-11 có dòng 07/11 "iSAT" 230.769 đ, `isatDays = 1`, `isatPay = 230.769`; nếu 07/11 có dòng chấm công NORMAL thì dòng đó bị thay.

## 8. Test (viết trước, `node:test`, repo giả như `test/v2/requests.test.ts`)

- Domain: Thứ Bảy hợp lệ/không phải Thứ Bảy; `team` rỗng; mã lạ; giá trị sai kiểu; thiếu điều kiện = Chưa đạt; 4/4 → PENDING; 3/4 → REJECTED kèm ghi chú, `reviewedBy` null; `title`/`reason` tự sinh; `toJSON` có khối `isat`, loại khác có `isat: null`.
- Service: không có hồ sơ → lỗi; cờ `isat` tắt (ctv/tts) → lỗi; trùng Thứ Bảy (PENDING/APPROVED) → lỗi, đơn trước đã REJECTED thì được nộp lại; `employee_id` là uuid kể cả khi gửi username; duyệt → lịch `ISAT`/`ON_LEAVE` gắn mã đơn; từ chối → không có lịch; `getById`/`listRequests` trả khối `isat`.
- Payroll: ngày iSAT đã duyệt → dòng `ISAT`, `isatDays = 1`, `isatPay = round(base/26)`, không phụ cấp; dòng chấm công cùng ngày bị thay.
- Cổng xác minh: `npm test` xanh. Không chạy typecheck/prettier (theo yêu cầu người dùng).

Chưa kiểm được bằng `npm test` (không có PostgreSQL trong bộ test): câu SQL thật của repository (join, giao dịch hai bảng), migration `0004`. Báo cáo cuối phải ghi rõ.

## 9. Tài liệu

`docs/api/v2-contract.md`: thêm dòng bảng ánh xạ; mục 3.4 thêm `POST /api/v2/requests/isat`, `GET /api/v2/requests/isat/conditions`, khối `isat` trong đơn trả về, tác dụng khi duyệt, các lỗi 400.

## 10. Ghi nhận ngoài phạm vi (không sửa trong lần này)

- Route tạo đơn và duyệt dùng `user.username` làm `employee_id` / `reviewed_by` khi không gửi id, trong khi hai cột này tham chiếu `staff(uuid)` — có thể vi phạm khoá ngoại trên DB thật. Đơn ISAT tự đổi sang uuid; các route khác giữ nguyên.
- ~~`PayrollRepository` lọc đơn theo `ot_date LIKE 'YYYY-MM%'` trên cột `DATE`~~ — đã sửa trên `feat/pure-v2-backend` 92dca91 (so sánh khoảng ngày, ngày `DATE` đổi sang chuỗi trong `mapMonthRows`).
