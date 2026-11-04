# Đơn từ theo luật ngày công (BE v2) — thiết kế (spec 1/3)

Spec 1 trong 3 spec ngày công, làm theo thứ tự: **Đơn từ → Chấm công → Lương theo ngày công**. Spec này lo phía đơn từ trong `src/modules/requests/`:
- nhận đủ trường của từng loại đơn;
- chặn đăng ký sai luật ngay lúc nộp;
- cho admin đọc lại mọi trường;
- khi duyệt, ghi đúng lịch (`work_schedules`) để spec 2 dựa vào.

Thêm lịch lễ công ty (module mới `holidays`). Spec này không đo giờ chấm công (spec 2) và không tính tiền (spec 3).

Loại: Architectural. Spec đổi giao diện API đơn từ, thêm bảng và module mới.

**Nguồn**
- Luật do người dùng chốt trong chat ngày 2026-11-04.
- Loại nghỉ theo `QUY ĐỊNH VỀ CHẾ ĐỘ NGHỈ.pdf` (GFT), gộp theo 6 nhóm.
- Cờ quyền lợi và `regular_dows` lấy từ dữ liệu gieo của v2 (giống luong-app).
- Code nền: `feat/pure-v2-backend` tại 92dca91.

## 1. Luật đã chốt (người dùng, chat 2026-11-04)

| # | Luật |
|---|------|
| R1 | Bỏ đơn sửa giờ (`TIME_CORRECTION`). Mọi ngày chấm công sai phải giải trình. |
| R2 | Loại nghỉ là 6 nhóm của PDF: Phép năm, Việc riêng có lương, Việc riêng không lương, Chế độ BHXH, Phúc lợi nội bộ, Không lương. Trường hợp cụ thể (kết hôn, tang, ốm đau, thai sản…) ghi ở lý do, là chữ tự do. |
| R3 | Xin Phép năm vượt số dư thì bị chặn. Số dư = `staff.leave_balance` − số ngày của các đơn Phép năm đang chờ hoặc đã duyệt. |
| R4 | Không giới hạn số ngày mỗi đơn, với mọi loại nghỉ. Không kiểm thời hạn báo trước. |
| R5 | Server tự đếm số ngày nghỉ, chỉ nguyên ngày: đếm các ngày làm việc của loại nhân sự trong khoảng (nv/ctv T2–T7, tts T2–T6, không bao giờ tính CN), bỏ ngày lễ công ty. `daysCount` client gửi bị bỏ qua. |
| R6 | Khung OT hoặc khung làm bù không được nằm trong ca và phải cách ca ít nhất 1 giờ. Không đăng ký OT hay làm bù trong khung 22h–6h. Ví dụ ca 08–17 chỉ đăng ký được 06–07 và 18–22. |
| R7 | Mỗi ngày tối đa **12 giờ**, gồm OT, làm bù và ca. Ca tính là **8 giờ làm**, nên ca 08–17 còn 4 giờ. Ngày không có ca (CN, T7 của tts, ngày lễ) được tối đa 12 giờ trong 06–22. |
| R8 | Một ngày được nhiều khung, miễn mỗi khung đúng R6 và R7 (thay luật "mỗi ngày 1 đơn OT" của v2). |
| R9 | Loại nhân sự có cờ `ot` tắt (tts) không được nộp OT. |
| R10 | Nghỉ có làm bù: nghỉ 1 ngày thì nợ đúng 8 giờ. Một đơn được nhiều ngày, nợ 8 giờ × số ngày. Phải xếp đủ lúc nộp, không thiếu, không thừa. |
| R11 | Khung bù chỉ được đặt **sau** ngày nghỉ và trong cùng tháng. Nghỉ ngày làm việc cuối tháng thì không còn chỗ, nên bị chặn. |
| R12 | Được bù vào ngày không có ca, trong 06–22. |
| R13 | Tháng nào có đơn nghỉ có làm bù (đang chờ hoặc đã duyệt) thì không được OT ngày nào trong tháng đó. |
| R14 | Đổi ca phải có đơn. Nhân sự chọn loại ca và một trong 2 khung của loại đó: Normal 08–17 / 10–19, Flex 06–15 / 13–22, Night 22–07 / 21–06. Ca luôn đúng 9 giờ có mặt (8 giờ làm + 1 giờ nghỉ). |
| R15 | Một đơn đổi ca áp dụng cho một khoảng ngày (có thể chỉ 1 ngày) và chỉ đổi lịch các ngày đó. Ca mặc định trên hồ sơ giữ nguyên. |
| R16 | Ngày trong khoảng đổi ca đã có khung OT hoặc bù (đang chờ hoặc đã duyệt) mà ca mới làm khung đó sai luật thì đơn đổi ca bị chặn. |
| R17 | Giải trình: mỗi ngày 1 đơn. Nhân sự chọn ít nhất 1 trong 7 trường hợp, được khai giờ vào/ra thực tế (tuỳ chọn) và ghi lý do. Spec 2 sẽ đối chiếu với chấm công. |
| R18 | Ngày lễ lấy từ một lịch lễ chung cho cả công ty, do Admin tick (có nút thêm nhanh 1/1, 30/4, 1/5, 2/9). Lịch này làm trong spec 1. |
| R19 | Khung OT và khung bù đã duyệt chỉ lưu trong đơn (hướng A). Spec 2 đọc trực tiếp từ đơn. |

**Điểm thiết kế** (người dùng duyệt cùng phần thiết kế):
- D1: Phép năm cần cờ `leaveAccount`, nên theo dữ liệu gieo tts bị chặn.
- D2: Tháng đã có đơn OT (đang chờ hoặc đã duyệt) thì không nộp được đơn nghỉ có làm bù, tức R13 áp theo cả hai chiều.
- D3: Đơn giải trình bị từ chối thì không được nộp lại cho ngày đó. Chỉ đơn đã huỷ mới cho nộp lại.
- D4: Không được OT vào ngày đang nghỉ.

## 2. Ngoài phạm vi

- Đo giờ chấm công theo khung đã duyệt, xác định ngày sai, mức phạt theo trường hợp giải trình (spec 2).
- Ngày nghỉ đã bù đủ có được trả lương không; khung bù không làm thì sao; tiền nghỉ theo loại và theo cờ `paidLeave`; tích lũy phép năm (spec 3).
- Đơn tạm ứng và đơn iSAT: giữ nguyên.
- Phân quyền người duyệt, kiểm vai trò ở các route lịch lễ. Hôm nay chưa bàn bảo mật.
- Áp migration lên bất kỳ DB nào.

## 3. Code

Luật thuần, không đụng DB, đặt trong `src/modules/requests/domain/`:

| File | Nội dung |
|---|---|
| `leave-types.ts` | 6 loại nghỉ, mỗi loại có `{ code, label, payGroup }` (bảng ở §9) |
| `shift-frames.ts` | 6 khung ca (R14); tìm khung theo `(shiftType, startTime)` |
| `time-window.ts` | Giờ thực làm của khung (§5.4); kiểm một khung so với các ca quanh nó (§5.5); trần 12 giờ/ngày |
| `working-days.ts` | Đếm ngày làm việc trong khoảng theo `regular_dows`, bỏ ngày lễ |
| `explanation-cases.ts` | 7 trường hợp giải trình (§9) |

Các thay đổi khác:
- `requests.repository.ts` thêm các hàm đọc ngữ cảnh cho service:
  - hồ sơ (`uuid`, `type`, ca mặc định, `leave_balance`, `leave_balance_on`);
  - cờ quyền lợi và `regular_dows` của loại nhân sự;
  - ngày lễ trong khoảng;
  - lịch các ngày liên quan;
  - các đơn đang chờ hoặc đã duyệt trong khoảng.
  Repository cũng lưu và đọc hai bảng con.
- Module mới `src/modules/holidays/` (controller → service → repository). Module requests đọc ngày lễ qua `HolidaysRepository`.
- `src/database/schema.ts` thêm kiểu bảng bằng tay.
- `payroll.repository.ts` đổi `correction_date` thành `explanation_date` (1 chỗ đọc).
- Bỏ `createCorrectionRequest`, `CreateCorrectionParams`, `CorrectionPunchType`, route `POST /requests/correction` và `WorkSchedule.withMakeUp`. Service không còn gọi `withOvertime`.
- Mọi route tạo đơn tra `employeeId` (nhận uuid hoặc username; trống thì lấy người đăng nhập) ra `staff.uuid`. Không tìm thấy thì trả lỗi. Cột `employee_id` luôn lưu uuid.

## 4. Dữ liệu

Thêm file `migrations/postgres/000N_requests_rules.sql`, với N là số ngay sau migration của nhánh iSAT. CHECK cột `type` vì thế có `ISAT`.

```sql
-- Đơn theo định dạng cũ không chuyển được. DB hiện chỉ có dữ liệu giả và seed không có đơn nào.
UPDATE work_schedules SET source_request_id = NULL
 WHERE source_request_id IN (SELECT id FROM system_requests
   WHERE type IN ('TIME_CORRECTION','LEAVE_WITH_MAKEUP')
      OR (type = 'SHIFT_CHANGE' AND (new_shift_type IS NULL OR new_shift_type NOT IN ('NORMAL','FLEX','NIGHT'))));
DELETE FROM system_requests
 WHERE type IN ('TIME_CORRECTION','LEAVE_WITH_MAKEUP')
    OR (type = 'SHIFT_CHANGE' AND (new_shift_type IS NULL OR new_shift_type NOT IN ('NORMAL','FLEX','NIGHT')));

ALTER TABLE system_requests DROP CONSTRAINT system_requests_type_check;
ALTER TABLE system_requests ADD CONSTRAINT system_requests_type_check
  CHECK (type IN ('LEAVE','OVERTIME','ADVANCE','SHIFT_CHANGE','LEAVE_WITH_MAKEUP','EXPLANATION','ISAT'));

ALTER TABLE system_requests DROP CONSTRAINT system_requests_leave_type_check;
UPDATE system_requests SET leave_type = 'ANNUAL' WHERE leave_type = 'PAID';
ALTER TABLE system_requests ADD CONSTRAINT system_requests_leave_type_check
  CHECK (leave_type IS NULL OR leave_type IN
    ('ANNUAL','PERSONAL_PAID','PERSONAL_UNPAID','SOCIAL_INSURANCE','WELFARE','UNPAID'));

-- Giải trình
ALTER TABLE system_requests RENAME COLUMN correction_date TO explanation_date;
ALTER TABLE system_requests RENAME COLUMN correction_actual_time TO actual_check_in;
ALTER TABLE system_requests ADD COLUMN actual_check_out TEXT;
ALTER TABLE system_requests DROP COLUMN correction_punch_type;

-- Đổi ca: khoảng ngày riêng, không mượn leave_start_date nữa
ALTER TABLE system_requests ADD COLUMN change_start_date DATE;
ALTER TABLE system_requests ADD COLUMN change_end_date DATE;
UPDATE system_requests
   SET change_start_date = leave_start_date, change_end_date = leave_start_date, leave_start_date = NULL
 WHERE type = 'SHIFT_CHANGE';
ALTER TABLE system_requests ADD CONSTRAINT system_requests_new_shift_type_check
  CHECK (new_shift_type IS NULL OR new_shift_type IN ('NORMAL','FLEX','NIGHT'));

-- Khung bù chuyển sang bảng con
ALTER TABLE system_requests DROP COLUMN makeup_start_time;
ALTER TABLE system_requests DROP COLUMN makeup_end_time;

CREATE TABLE makeup_slots (
  request_id   UUID    NOT NULL REFERENCES system_requests(id),
  work_date    DATE    NOT NULL,
  start_time   TEXT    NOT NULL,                          -- 'HH:mm', từ '06:00'
  end_time     TEXT    NOT NULL,                          -- 'HH:mm', đến '22:00', sau start_time
  work_minutes INTEGER NOT NULL CHECK (work_minutes > 0), -- giờ thực làm (§5.4)
  PRIMARY KEY (request_id, work_date, start_time)
);
CREATE INDEX idx_makeup_slots_work_date ON makeup_slots (work_date);

CREATE TABLE explanation_cases (
  request_id UUID NOT NULL REFERENCES system_requests(id),
  case_code  TEXT NOT NULL CHECK (case_code IN ('LATE_CHECK_IN','EARLY_CHECK_OUT','MISSING_CHECK_IN',
               'MISSING_CHECK_OUT','EARLY_CHECK_IN','LATE_CHECK_OUT','FORGOT_CHECK_OUT')),
  PRIMARY KEY (request_id, case_code)
);

CREATE TABLE company_holidays (
  holiday_date DATE PRIMARY KEY,
  name         TEXT NOT NULL CHECK (length(name) > 0),
  created_by   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Cách lưu các loại đơn:
- **Đơn OT** dùng các cột sẵn có `ot_date`, `ot_start_time`, `ot_end_time`, `ot_hours`. `ot_hours` = giờ thực làm của khung ÷ 60, do server tính. Mỗi đơn OT có 1 khung.
- **Đơn nghỉ và đơn nghỉ có làm bù** dùng `leave_start_date`, `leave_end_date` và `leave_days_count` (server đếm). Riêng đơn nghỉ có làm bù để `leave_type` là `NULL`.
- **Đơn có bảng con** (khung bù, trường hợp giải trình) được ghi cùng bảng con trong **một giao dịch**.

## 5. Khái niệm dùng chung

Mọi giờ dùng dạng `HH:mm`. Khung OT và khung bù nằm trong 06:00–22:00, nên không bao giờ qua nửa đêm.

### 5.1 Cờ quyền lợi và ngày làm việc

- Cờ quyền lợi (`ot`, `makeup`, `leaveAccount`) và `regular_dows` lấy từ bản `position_types` hiệu lực mới nhất của loại nhân sự, xét đến tháng của ngày đầu tiên trong đơn.
- Không có cấu hình cho loại nhân sự đó thì trả lỗi "Thiếu cấu hình loại nhân sự".
- **Ngày làm việc**: ngày có thứ nằm trong `regular_dows` và không phải ngày lễ công ty.

### 5.2 Ca của ngày D

Xét theo thứ tự, gặp điều nào trước thì dừng:
1. D là ngày lễ công ty → không có ca.
2. Có đơn đổi ca đang chờ hoặc đã duyệt phủ D → dùng ca của đơn đó. Đơn đang chờ cũng tính, giống mọi chỗ kiểm khác.
3. Có dòng `work_schedules` cho D → dùng `planned_start_time` và `planned_end_time` của dòng đó.
4. D là ngày làm việc → dùng ca mặc định trên hồ sơ (thiếu thì lấy 08:00–17:00, như `ensureDefaultSchedule`).
5. Các trường hợp còn lại → không có ca.

Ca có giờ ra nhỏ hơn giờ vào (Night 22–07, 21–06) kéo sang sáng hôm sau. Ca được tính 8 giờ làm vào **ngày bắt đầu ca**.

### 5.3 Ngày đang nghỉ

Ngày D là ngày đang nghỉ nếu có một trong hai điều sau:
- D nằm trong khoảng `leave_start_date`–`leave_end_date` của một đơn nghỉ hoặc đơn nghỉ có làm bù đang chờ hoặc đã duyệt. Xét theo ngày lịch.
- Dòng lịch của D có `status = 'ON_LEAVE'`. Điều này phủ cả ngày iSAT.

### 5.4 Giờ thực làm của một khung

Gọi L là độ dài khung tính bằng phút. Luật là làm 4 giờ thì nghỉ 1 giờ, lặp lại:

```
work_minutes = 240 × floor(L / 300) + min(240, L mod 300)
```

| Khung | L | Giờ thực làm |
|---|---|---|
| 18–22 | 240 | 4 giờ |
| 06–07 | 60 | 1 giờ |
| CN 08–17 | 540 | 8 giờ |
| CN 08–20 | 720 | 10 giờ |
| CN 06–20 | 840 | 12 giờ |
| CN 06–22 | 960 | 13 giờ (vượt trần) |

### 5.5 Kiểm một khung [a, b) trên ngày D

Kiểm lần lượt:
1. `06:00 ≤ a < b ≤ 22:00`.
2. Xét các ca của D−1, D và D+1 theo §5.2. Ca phải nằm hoàn toàn ngoài khung, cách ít nhất 60 phút:
   - `b ≤ giờ vào ca − 60`, hoặc
   - `a ≥ giờ ra ca + 60`.
   Ví dụ ca 22–07 ngày 10/11 kéo đến 07:00 ngày 11/11, nên khung ngày 11/11 phải bắt đầu từ 08:00.
3. Không chồng lên khung OT hay khung bù nào khác của cùng người trên ngày D, kể cả các khung khác trong cùng đơn.
4. **Trần ngày**: 480 phút (nếu ca bắt đầu trên D) + tổng giờ thực làm của mọi khung OT và bù trên D (đang chờ, đã duyệt, cộng đơn đang nộp) ≤ 720 phút.

### 5.6 Khoá khi nộp

Mỗi lần nộp đơn chạy trong `txCoordinator.withLock('requests_<uuid>', …)`. Nhờ vậy hai đơn của cùng người nộp cùng lúc không thể cùng lọt qua trần ngày hay trần tháng.

## 6. Nộp đơn

Lỗi kiểm luật trả **400 `BAD_REQUEST`** kèm câu báo lỗi tiếng Việt, giống các route đơn hiện có. Mọi thân yêu cầu đều có `employeeId` (tuỳ chọn), `title` và `reason` (bắt buộc, như v2).

### 6.1 `POST /api/v2/requests/leave` — đơn nghỉ

Thân yêu cầu: `{ leaveType, startDate, endDate }`.

1. `leaveType` phải là 1 trong 6 mã (§9). Các mã cũ `PAID`/`UNPAID` của v2 bị từ chối.
2. Hai ngày đúng dạng `YYYY-MM-DD`, và `startDate ≤ endDate`.
3. `leave_days_count` = số ngày làm việc trong khoảng (§5.1). Bằng 0 thì báo "Khoảng nghỉ không có ngày làm việc".
4. Không trùng ngày nghỉ của đơn nghỉ hay đơn nghỉ có làm bù khác (đang chờ hoặc đã duyệt).
5. Không có ngày nào trong khoảng đang có khung OT hoặc khung bù (đang chờ hoặc đã duyệt).
6. Riêng `ANNUAL`:
   - Cần cờ `leaveAccount` (D1).
   - Số dư = `leave_balance` (NULL tính là 0) − tổng `leave_days_count` của các đơn `ANNUAL` đang chờ hoặc đã duyệt có `leave_start_date ≥ leave_balance_on`. `leave_balance_on` là NULL thì tính mọi đơn.
   - Số ngày xin vượt số dư thì báo "Phép năm còn 2 ngày, xin 3 ngày".

Ví dụ: nv nghỉ T6 13/11 → T2 16/11 được đếm 3 ngày (13, 14, 16). tts nghỉ cùng khoảng được đếm 2 ngày (13, 16).

### 6.2 `POST /api/v2/requests/leave-with-makeup` — đơn nghỉ có làm bù (route mới)

Thân yêu cầu: `{ startDate, endDate, slots: [{ date, startTime, endTime }] }`.

1. Cần cờ `makeup`.
2. Đếm ngày nghỉ như §6.1 (bước 2, 3, 4, 5). Số phút nợ = 480 × số ngày nghỉ.
3. Mọi ngày nghỉ và mọi khung bù nằm trong **cùng một tháng dương lịch**.
4. Mỗi khung bù:
   - có `date > endDate` (R11);
   - không phải ngày đang nghỉ;
   - đúng §5.5. Ngày không có ca thì chỉ cần nằm trong 06–22 (R12).
5. Tổng giờ thực làm của các khung phải **đúng bằng** số phút nợ. Thiếu hoặc thừa thì báo "Cần đúng 8 giờ bù, đang xếp 9 giờ".
6. Không có đơn OT nào (đang chờ hoặc đã duyệt) trong tháng đó (D2).
7. Nếu sau ngày nghỉ cuối không còn ngày nào trong tháng thì báo "Không còn ngày trong tháng để xếp đủ giờ bù".

Ví dụ ca 08–17:
- Nghỉ T3 10/11, bù 18–22 ngày 12/11 và 18–22 ngày 16/11: hợp lệ.
- Nghỉ T3 10/11 → T4 11/11 (nợ 16 giờ), bù CN 15/11 06–20 (12 giờ) và 18–22 ngày 16/11: hợp lệ.
- Nghỉ T2 30/11: bị chặn.
- Xếp 06–07 và 18–22 cùng một ngày có ca: bị chặn, vì 8 + 1 + 4 = 13 giờ.

### 6.3 `POST /api/v2/requests/overtime` — đơn OT

Thân yêu cầu: `{ otDate, startTime, endTime }`.
- `targetDate` vẫn được nhận thay cho `otDate`.
- `hours`/`otHours` client gửi bị bỏ qua.
- Bỏ cách mặc định bắt đầu lúc 18:00; thiếu giờ thì báo lỗi.

1. Cần cờ `ot` (R9). Theo cờ hiện tại tts bị chặn: "Loại nhân sự này không có OT".
2. `otDate` không phải ngày đang nghỉ (D4).
3. Khung OT đúng §5.5 (R6, R7, R8).
4. Tổng `ot_hours` của các đơn OT đang chờ hoặc đã duyệt trong tháng, cộng đơn này, không quá 40 giờ (giữ như v2).
5. Tháng đó không có đơn nghỉ có làm bù đang chờ hoặc đã duyệt (R13).

Ví dụ:
- Ca 08–17: 18–22 hợp lệ, 06–07 hợp lệ, 17–19 bị chặn (chạm ca), 07:30–08:00 bị chặn (cách ca dưới 1 giờ), 21–23 bị chặn (chạm 22h).
- Ngày lễ 02/09: 08–20 hợp lệ (10 giờ).

### 6.4 `POST /api/v2/requests/shift-change` — đơn đổi ca (route mới)

Thân yêu cầu: `{ startDate, endDate, shiftType, startTime }`.

1. `(shiftType, startTime)` phải là một trong 6 khung của R14. `new_end_time` lấy theo khung, bằng giờ vào + 9 giờ.
2. Các ngày được đổi là những ngày làm việc trong khoảng. Không có ngày nào thì báo lỗi.
3. Không ngày được đổi nào là ngày đang nghỉ.
4. Không trùng ngày với một đơn đổi ca khác đang chờ hoặc đã duyệt.
5. Lấy ca mới thay vào các ngày được đổi, rồi kiểm lại mọi khung OT và bù (đang chờ hoặc đã duyệt) trên các ngày đó và ngày kế sau theo §5.5 (bước 2 và 4). Khung nào sai thì báo ngày và khung, ví dụ "12/11: khung bù 18:00–22:00 chạm ca mới 10:00–19:00" (R16).

### 6.5 `POST /api/v2/requests/explanation` — đơn giải trình

Thân yêu cầu: `{ workDate, cases: [mã], actualCheckIn?, actualCheckOut? }`.

1. `workDate` đúng dạng ngày và không sau hôm nay (giờ Việt Nam, UTC+7).
2. `cases` là mảng có ít nhất 1 trong 7 mã (§9). Mã lạ hoặc mã lặp thì báo lỗi.
3. Giờ thực tế, nếu có, phải đúng dạng `HH:mm`.
4. Ngày đó chưa có đơn giải trình nào đang chờ, đã duyệt hoặc **bị từ chối** (D3). Đơn đã huỷ thì không chặn.

## 7. Duyệt — `PATCH /api/v2/requests/:id/review`

Chỉ duyệt được đơn đang chờ (`PENDING`), như v2. Lúc duyệt không kiểm lại luật, vì luật đã kiểm lúc nộp và lúc đó đã tính cả các đơn đang chờ.

| Loại | Duyệt (`APPROVE`) ghi gì |
|---|---|
| Nghỉ | Mỗi ngày làm việc trong khoảng: `ensureDefaultSchedule` rồi `withLeave(requestId)`. Không đánh dấu CN hay ngày không làm việc nữa (v2 hiện đánh dấu mọi ngày). |
| Nghỉ có làm bù | Các ngày nghỉ được ghi như đơn nghỉ. Khung bù không ghi vào lịch (R19). |
| OT | Không ghi lịch (R19). |
| Đổi ca | Mỗi ngày được đổi: `ensureDefaultSchedule` rồi `withShiftChange(type, start, end, requestId)`. |
| Giải trình | Giữ như v2: `updateDayStatus(…, 'VALID')`. Spec 2 sẽ định nghĩa lại. |

Từ chối (`REJECT`) và huỷ (`PATCH /:id/cancel`) không đổi lịch.

Hai tác dụng phụ còn đến trước khi spec 2 và spec 3 xong:
- Chấm công không còn thấy giờ OT đã duyệt (`approved_ot_hours` luôn là 0), nên ra muộn sau ca vẫn bị gắn cờ.
- Phần lương không còn ngày `MAKE_UP` trong lịch, nên ngày có khung bù vẫn được phụ cấp ca.

Lương OT không đổi, vì phần lương vẫn đọc `ot_hours` từ đơn đã duyệt.

## 8. Lịch lễ — module `holidays`

| Route | Việc |
|---|---|
| `GET /api/v2/holidays?year=2026` | `{ items: [{ date, name }] }`, sắp theo ngày. Không gửi `year` thì lấy năm hiện tại. |
| `POST /api/v2/holidays` | `{ date, name }`. Ngày sai dạng, tên rỗng hoặc trùng ngày thì trả 400. Thành công thì `{ created: true, holiday }`. |
| `POST /api/v2/holidays/quick-add` | `{ year }`. Thêm 01/01 "Tết Dương lịch", 30/04 "Ngày Giải phóng miền Nam", 01/05 "Quốc tế Lao động", 02/09 "Quốc khánh". Ngày đã có thì bỏ qua. Trả `{ added: [date…] }`. |
| `DELETE /api/v2/holidays/:date` | Xoá. Không có ngày đó thì trả 404 `HOLIDAY_NOT_FOUND`. |

Thêm hay xoá ngày lễ không sửa các đơn đã nộp: `leave_days_count` giữ như lúc nộp.

## 9. Admin đọc lại — `GET /api/v2/requests`, `GET /api/v2/requests/:id`

`SystemRequestDTO` theo loại:
- **Đơn nghỉ:** `leaveType`, `leaveStartDate`, `leaveEndDate`, `leaveDaysCount`.
- **Đơn nghỉ có làm bù:**
  - các trường như đơn nghỉ, nhưng `leaveType` là `null`;
  - `owedMinutes` = 480 × `leaveDaysCount`;
  - `makeupSlots: [{ date, startTime, endTime, workMinutes }]`, sắp theo ngày rồi đến giờ.
- **Đơn OT:** `otDate`, `otStartTime`, `otEndTime`, `otHours`.
- **Đơn đổi ca:** `changeStartDate`, `changeEndDate`, `newShiftType`, `newStartTime`, `newEndTime`.
- **Đơn giải trình:** `explanationDate`, `explanationCases: [mã]` theo thứ tự hằng số, `actualCheckIn`, `actualCheckOut`.

Trường không thuộc loại đơn thì là `null`; `makeupSlots` và `explanationCases` khi đó là `[]`. Các trường `correctionDate`, `correctionPunchType`, `correctionActualTime`, `makeupStartTime`, `makeupEndTime` bị bỏ khỏi DTO.

`list` và `findById` đọc mỗi bảng con bằng **một** truy vấn `request_id IN (…)` cho cả trang kết quả.

Hai route nhãn cho giao diện, khai báo trước `GET :id`:

`GET /api/v2/requests/leave-types` → `{ leaveTypes: [{ code, label, payGroup }] }`

| code | label | payGroup |
|---|---|---|
| `ANNUAL` | Phép năm | `PAID` |
| `PERSONAL_PAID` | Việc riêng có lương | `PAID` |
| `PERSONAL_UNPAID` | Việc riêng không lương | `UNPAID` |
| `SOCIAL_INSURANCE` | Chế độ BHXH | `SOCIAL_INSURANCE` |
| `WELFARE` | Phúc lợi nội bộ | `PAID` |
| `UNPAID` | Không lương | `UNPAID` |

`GET /api/v2/requests/explanation-cases` → `{ cases: [{ code, label }] }`

| code | label |
|---|---|
| `LATE_CHECK_IN` | Vào muộn quá 15 phút |
| `EARLY_CHECK_OUT` | Ra sớm |
| `MISSING_CHECK_IN` | Thiếu giờ vào |
| `MISSING_CHECK_OUT` | Thiếu giờ ra |
| `EARLY_CHECK_IN` | Vào sớm quá 15 phút |
| `LATE_CHECK_OUT` | Ra muộn quá 15 phút khi không có OT |
| `FORGOT_CHECK_OUT` | Quên check-out (ra muộn quá 30 phút) |

`payGroup` chỉ để hiển thị và để spec 3 dùng. Tiền của từng loại (cờ `paidLeave`, tts nhận 0) do spec 3 quyết định.

## 10. Test

Viết test trước, chạy bằng `node:test` với repo giả như `test/v2/requests.test.ts`.

**Domain**
- Đếm ngày làm việc:
  - 13/11 → 16/11: nv 3 ngày, tts 2 ngày.
  - Khoảng có ngày lễ thì ngày lễ bị trừ.
  - Khoảng chỉ có CN: 0 ngày.
- Giờ thực làm: theo bảng ở §5.4.
- Kiểm khung với ca 08–17:
  - 06–07 và 18–22 hợp lệ.
  - 17–19, 07:30–08:00, 21–23 bị chặn.
  - 06–07 và 18–22 cùng ngày bị chặn vì vượt 12 giờ.
- Ca đêm 22–07 ngày 10/11: khung 11/11 07:30–09:00 bị chặn, khung 08:00–12:00 hợp lệ, khung 10/11 17–21 hợp lệ.
- Ngày không có ca: 06–20 và 06–21 hợp lệ (đều 12 giờ thực làm), 06–22 bị chặn (13 giờ).
- Khung ca: đúng 6 khung hợp lệ; `NORMAL 09:00` và `CUSTOM` bị chặn.
- Mã loại nghỉ và mã trường hợp giải trình: mã lạ bị chặn.

**Service** (dùng repo giả)
- Đơn nghỉ:
  - mã cũ `PAID` bị từ chối;
  - trùng đơn nghỉ khác bị chặn;
  - nghỉ vào ngày có khung OT bị chặn;
  - số dư Phép năm: dư 2, xin 3 bị chặn; có `leave_balance_on` thì chỉ trừ đơn từ ngày đó;
  - tts xin Phép năm bị chặn.
- Đơn nghỉ có làm bù:
  - nợ 8 giờ và 16 giờ;
  - thiếu hoặc thừa giờ bị chặn;
  - khung bù trước hoặc ngay trong ngày nghỉ bị chặn;
  - khung khác tháng bị chặn;
  - nghỉ 30/11 bị chặn;
  - tháng đã có OT bị chặn;
  - bù vào CN hợp lệ.
- Đơn OT:
  - tts bị chặn;
  - tháng có đơn làm bù bị chặn;
  - ngày đang nghỉ bị chặn;
  - nhiều khung trong một ngày không chồng nhau thì hợp lệ;
  - vượt 40 giờ/tháng bị chặn;
  - `otHours` do server tính.
- Đơn đổi ca:
  - khung không có trong danh sách bị chặn;
  - chỉ đổi các ngày làm việc;
  - đụng khung bù bị chặn kèm câu lỗi;
  - trùng đơn đổi ca khác bị chặn.
- Đơn giải trình:
  - đơn có `cases` rỗng bị chặn;
  - mã lặp bị chặn;
  - ngày trong tương lai bị chặn;
  - đơn thứ hai cùng ngày bị chặn;
  - đơn trước bị từ chối thì đơn mới bị chặn;
  - đơn trước đã huỷ thì nộp lại được.
- Gửi username thì `employee_id` lưu uuid. Không có hồ sơ thì lỗi.
- Duyệt:
  - đơn nghỉ chỉ ghi lịch các ngày làm việc;
  - đơn OT và đơn làm bù không ghi lịch;
  - đơn đổi ca ghi ca mới từng ngày;
  - từ chối thì không ghi gì.
- `getById` và `listRequests` trả `makeupSlots`, `explanationCases`, `owedMinutes`. `POST /requests/correction` không còn.

**Lịch lễ:** thêm, trùng ngày, xoá, xoá ngày không có (404). Thêm nhanh chạy hai lần chỉ thêm 4 ngày một lần.

**PostgreSQL:** test mới `test/v2/requests-repository.pg.test.ts`.
- Bị bỏ qua khi không có `PG_TEST_URL`.
- Tự tạo DB tạm, chạy toàn bộ migration, kiểm:
  - lưu và đọc đơn có bảng con trong một giao dịch;
  - các CHECK mới;
  - lịch lễ.

**Cổng xác minh:** `npm test` xanh. Không chạy typecheck hay prettier. Báo cáo cuối phải ghi test PG có chạy hay không.

## 11. Tài liệu

`docs/api/v2-contract.md`:
- §3.4 (đơn từ): viết lại cho 5 route tạo đơn, hai route nhãn, các trường trả về theo loại, tác dụng khi duyệt và các lỗi 400. Bỏ `POST /requests/correction`.
- Thêm một mục cho `holidays`.

## 12. Thứ tự và phụ thuộc

1. Spec này nằm trên nhánh `feat/requests-rules`, cắt từ `feat/pure-v2-backend` 92dca91. Chưa push.
2. Plan viết sau khi người dùng duyệt spec.
3. Chỉ bắt đầu code khi nhánh iSAT (`claude/focused-saha-e55d49`) đã merge vào `feat/pure-v2-backend`, vì hai bên cùng sửa:
   - `requests.controller/service/repository`;
   - `domain/types.ts`;
   - CHECK cột `type`;
   - số migration.
   Lúc đó merge `feat/pure-v2-backend` vào nhánh này trước khi làm task đầu tiên. Migration lấy số tiếp theo.
4. Spec 2 (chấm công) đọc khung OT và khung bù đã duyệt từ đơn, cùng lịch đã ghi ở §7. Spec 3 (lương) dùng `payGroup`, `leave_days_count` và lịch lễ.
