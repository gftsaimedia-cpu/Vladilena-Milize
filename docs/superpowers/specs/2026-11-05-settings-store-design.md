# Kho cài đặt và tham số BE v2 — thiết kế

- Ngày: 2026-11-05
- Nhánh: `claude/settings-store-7d80cb`, nền `main` @ `52819c6`
- Trạng thái: **chờ người dùng duyệt spec**
- Loại: Architectural (hệ thống con mới, đổi giao diện FE ↔ BE)
- Nguồn luật: các câu trả lời của người dùng trong chat ngày 2026-11-05 (mục 2). Không lấy luật từ `spec/` (v1). Registry v1 (`253c52a^:src/params/*`) chỉ dùng để tham khảo hình dạng.

## 1. Mục tiêu và phạm vi

Thay các API v1 mà FE đang gọi và nhận 404, cụ thể:
- `/settings/params`, `/settings/params/preview`, `/settings/params/revert`;
- `/settings/first-run`;
- `/blocks/:code/confirm`.

Đồng thời thay các hằng số đang viết cứng trong mã bằng một kho cài đặt có kiểu và có phiên bản theo tháng. Kho phục vụ các màn sau:
- Cài đặt › Cách tính lương và 6 ngăn kéo (`PayFormulaView.vue`, `pay/PayDrawer.vue`);
- Cài đặt › Tất cả cài đặt (`AllSettingsView.vue`), gồm lịch sử và Hoàn tác;
- Cài đặt › Quy tắc KPI (`KpiRulesView.vue`);
- Cài đặt › Lịch, ca & chấm công (`CalendarView.vue`): ngày trả lương, giờ ca, vùng chấm công;
- Hồ sơ nhân sự (`StaffDrawer.vue`): tuần làm việc riêng;
- App nhân viên và lưới chấm công Admin: tuần làm việc, vùng chấm công, ngày trả lương.

**Chia việc:**
- **Phiên này (settings-store) chỉ làm BE:** `src/`, `migrations/postgres/schema.sql`, `test/v2/`, `docs/`. Phạm vi gồm kho cài đặt, vùng chấm công, tuần làm việc, giờ ca, ngày trả lương và thời gian ân hạn đi trễ.
- **Phiên "Settings store FE" làm toàn bộ `web/`** (người dùng chọn tách FE, 2026-11-05):
  - màn Cài đặt, hồ sơ, app nhân viên, lưới chấm công;
  - mock, `builders/api`, `services`, test UI.
  
  Mục 5 (API) và mục 7 (giao diện) là **hợp đồng** giữa hai phiên. Muốn đổi hợp đồng thì hai phiên báo nhau trước.
- **Phiên payslip-print:** làm phần tách OT ×1,5 / ×2 / ×3 trong `payroll.service.ts`. Phiên đó đọc hệ số OT từ `settingsFor()` (mục 4).

**Phiên này xong khi:**
- spec và plan được duyệt;
- code BE xong theo plan;
- `npm test` xanh với PostgreSQL riêng ở cổng 55466.

`test:ui` thuộc phiên FE.

## 2. Quyết định đã chốt (người dùng, trong chat, 2026-11-05)

| # | Quyết định | Ví dụ của người dùng / đã duyệt |
|---|---|---|
| D1 | Sửa từ tháng M thì áp dụng cho M và mọi tháng sau; các tháng trước M giữ số cũ ("sửa từ tháng nào thì áp dụng đối với tháng đó trở về sau"). | OT ngày thường ×1,5 → ×1,6 từ tháng 11 thì cả tháng 11 tính ×1,6. Nếu từ tháng 12 thì tháng 11 vẫn ×1,5. |
| D2 | Tuần làm việc: loại nhân sự là mặc định (nv/ctv T2–T7, tts T2–T6), mỗi người có thể có tuần riêng trong hồ sơ, áp dụng từ tháng chọn. | Bình (nv) đặt T2–T6 thì thứ Bảy 12/12 không chấm công là ngày nghỉ, không tính vắng. |
| D3 | Công chuẩn của người có tuần riêng tính theo tuần của họ. | Bình nv bậc 2 (6.500.000), T2–T6, đi đủ tháng 12/2026 (23 ngày): lương ngày 295.455, lương tháng 6.500.000 × 23 ÷ 22 = 6.795.455. |
| D4 | Tuần riêng tick tuỳ ý các ngày từ T2 đến T7, bao nhiêu ngày cũng được, không có Chủ nhật. Phải tick ít nhất 1 ngày. | — |
| D5 | Công chuẩn của tuần riêng = số ngày mỗi tuần × 52 ÷ 12, làm tròn. Ra 1→4, 2→9, 3→13, 4→17, 5→22, 6→26. Người dùng tuần của loại nhân sự thì giữ `position_types.workdays`. | Châu ctv bậc 1 (6.000.000) làm T2/T4/T6 → công chuẩn 13. Đi đủ 13 ngày tháng 12 → 6.000.000, lương ngày 461.538. |
| D6 | Chấm công ở ngoài vùng thì bị chặn. Không lấy được vị trí cũng không chấm được. Ngày thiếu giờ chấm đi theo luồng giải trình đã chốt. Công ty có một vùng duy nhất, hiệu lực từ lần chấm kế tiếp sau khi lưu. | Bình ở cách văn phòng 600 m (vùng 150 m) thì nút khoá, hiện "Bạn đang cách văn phòng 600 m". |
| D7 | Giờ ca không cho sửa. 6 khung giờ cố định: Normal 08–17 / 10–19, Flex 06–15 / 13–22, Night 22–07 / 21–06. Màn chỉ hiện để xem. | — |
| D8 | Ngày trả lương: Admin chọn một ngày từ 1 đến 28 của tháng sau, mặc định 10, áp dụng từ tháng chọn. Chỉ để hiển thị, không đổi tiền. Kỳ công giữ nguyên ngày 1 → cuối tháng. | Lương tháng 11 trả ngày 10/12. Đổi thành 5 từ tháng 11 thì trả ngày 05/12. |
| D9 | Ngày trả lương rơi vào Chủ nhật hoặc ngày lễ thì giữ nguyên. | Lương tháng 12/2026: "trả Chủ nhật 10/01/2027". |
| D10 | Admin sửa được các con số tính lương trên màn Cài đặt, áp dụng từ tháng chọn, có lịch sử và Hoàn tác. Riêng tạm ứng 80% chỉ đọc, giờ ca cố định, các ô của /positions giữ ở màn Chức vụ. | — |
| D11 | Bỏ số "chưa ai xác nhận / chính sách chưa chốt". Giá trị mặc định là luật đã chốt. Màn chỉ đánh dấu mục đã sửa khác mặc định. | — |
| D12 | Không có xem trước tác động. Bấm Lưu thì hiện hộp xác nhận liệt kê thay đổi. Muốn xem tiền đổi thì tính lại lương tháng đang mở. | Hộp ghi "OT ngày thường ×1,5 → ×1,6, áp dụng từ tháng 11/2026". |
| D13 | Hướng lưu B: mỗi nhóm cài đặt một bảng có cột riêng (người dùng chọn thay cho hướng A dùng `param_versions` dạng khoá–giá trị). | — |
| D14 | Ngày nằm ngoài tuần làm việc của người đó, không có đơn đã duyệt (OT, làm bù, đổi ca) thì chặn check-in. Đây là cách áp luật 04/11 "không có lịch và không có đơn đã duyệt thì không được chấm công". Duyệt cùng thiết kế phần 3. | Bình T2–T6, thứ Bảy 12/12 không có đơn nào được duyệt thì không check-in được. Có OT đã duyệt ngày đó thì chấm bình thường. |
| D15 | Ngưỡng chuyên cần mặc định là 3 ngày đúng luật đã chốt, nên **lương sẽ đổi** so với mã hiện tại (mã đang để mất khi nghỉ từ 5 ngày). Duyệt cùng phần 3. | — |

Đính chính đã báo người dùng: các mục sau **chưa** có trong v2 nên chưa vào kho. Ai cài đặt luật đó thì thêm cột tương ứng:
- mức trần bảo hiểm (20 × 2.530.000 / 20 × 5.310.000);
- luật từ 14 ngày không lương trở lên thì không đóng bảo hiểm;
- bậc trừ 30 phút;
- phần cộng thêm khi làm đêm và làm lễ ban đêm.

## 3. Dữ liệu (`migrations/postgres/schema.sql`)

Sửa thẳng `schema.sql`, không thêm file đánh số. DB dev được dựng lại từ file này.

### 3.1 Bảng có phiên bản theo tháng

Quy ước chung cho mọi bảng trong mục này:
- Mỗi bảng có `effective_month TEXT PRIMARY KEY CHECK (effective_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')`, `updated_by TEXT NOT NULL`, `updated_at TIMESTAMPTZ NOT NULL`.
- Mỗi dòng là một phiên bản đầy đủ mọi cột.
- Giá trị ở tháng M là dòng có `effective_month` lớn nhất mà ≤ M.
- Mỗi bảng được gieo sẵn một dòng `'2000-01'` bằng giá trị mặc định.

| Bảng | Cột (mặc định gieo sẵn) | Giới hạn (CHECK, cũng là giới hạn ô nhập) |
|---|---|---|
| `overtime_rules` | `weekday_rate` 1.5, `weekend_rate` 2, `holiday_rate` 3 (DOUBLE PRECISION) | ngày thường 1,5–5; cuối tuần 2–5; lễ 3–5; bước 0,01 (Ruling R1) |
| `attendance_rules` | `late_grace_minutes` 15, `diligence_lost_from_days` 3 (INTEGER) | 0–60 phút; 1–31 ngày |
| `kpi_weights` | `wework` 40, `user_score` 24, `peer` 18, `manager` 12, `self_score` 6 (INTEGER) | mỗi ô 0–100, `CHECK` tổng = 100 |
| `insurance_rates` | `bhxh_pct` 8, `bhyt_pct` 1.5, `bhtn_pct` 1 (DOUBLE PRECISION, đơn vị %) | 0–100, bước 0,01 |
| `tax_rules` | `personal_deduction` 15.500.000, `dependant_deduction` 6.200.000, `short_contract_pct` 10, `short_contract_threshold` 5.000.000 | tiền 0–1.000.000.000 (BIGINT); % 0–100 |
| `tax_brackets` | Mỗi bậc một dòng gồm `effective_month` (FK → `tax_rules`), `sort` (1..n), `upper_bound` (BIGINT, NULL ở bậc cuối), `rate_pct`. Gieo sẵn: 10tr 5%, 30tr 10%, 60tr 20%, 100tr 30%, NULL 35% | 1–10 bậc; mốc tăng dần; chỉ bậc cuối được NULL; % 0–100 |
| `pay_calendar` | `pay_day` 10 (INTEGER) | 1–28 |

Thay đổi đi kèm:
- Bỏ dòng `settings.insurance_rates`, vì `insurance_rates` thay cho nó.
- Bỏ bảng `param_versions`, cùng 2 trigger và 2 chỉ mục của nó, vì chưa có mã nào dùng.

### 3.2 Tuần làm việc riêng

```sql
CREATE TABLE staff_work_weeks (
  employee_id     TEXT NOT NULL REFERENCES staff(uuid),
  effective_month TEXT NOT NULL CHECK (effective_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  weekdays        TEXT,          -- mảng JSON các thứ 1 (T2) … 6 (T7), tăng dần, ≥ 1 phần tử; NULL = theo loại nhân sự
  updated_by      TEXT NOT NULL,
  updated_at      TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (employee_id, effective_month)
);
```

- Tuần của người X ở tháng M lấy từ dòng mới nhất của X có tháng ≤ M.
- Không có dòng nào, hoặc dòng đó có `weekdays` NULL, thì dùng `position_types.regular_dows` của loại nhân sự X ở tháng M.
- Công chuẩn không lưu mà tính như sau: tuần riêng thì theo D5; tuần của loại thì lấy `position_types.workdays`.

### 3.3 Vùng chấm công (không có phiên bản)

```sql
CREATE TABLE attendance_zone (
  id         SMALLINT PRIMARY KEY CHECK (id = 1),
  lat        DOUBLE PRECISION NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng        DOUBLE PRECISION NOT NULL CHECK (lng BETWEEN -180 AND 180),
  radius_m   INTEGER NOT NULL CHECK (radius_m BETWEEN 20 AND 5000),
  updated_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
```

Bảng không có dòng nào nghĩa là chưa đặt vùng, khi đó không kiểm tra vị trí (Ruling R3). Không gieo sẵn dòng nào.

### 3.4 Lịch sử thay đổi

```sql
CREATE TABLE settings_changes (
  id              BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  setting         TEXT NOT NULL,   -- 'overtime' | 'attendance' | 'kpi-weights' | 'insurance' | 'tax' | 'pay-calendar' | 'work-week' | 'attendance-zone'
  field           TEXT NOT NULL,   -- tên ô phía API: 'weekdayRate', 'brackets', 'weekdays'; vùng chấm công luôn là 'zone'
  subject         TEXT,            -- uuid nhân viên khi setting = 'work-week'; NULL ở các nhóm khác
  effective_month TEXT,            -- NULL ở 'attendance-zone'
  old_json        TEXT,            -- NULL khi lần đầu đặt (tuần riêng, vùng)
  new_json        TEXT NOT NULL,
  reason          TEXT CHECK (reason IS NULL OR length(reason) BETWEEN 1 AND 300),
  changed_by      TEXT NOT NULL,
  changed_at      TIMESTAMPTZ NOT NULL
);
CREATE INDEX settings_changes_setting ON settings_changes (setting, subject, id);
```

- Có trigger chặn UPDATE và DELETE, giống `audit_log`.
- Mỗi ô đổi ghi đúng một dòng, trong cùng giao dịch với lần ghi bảng cài đặt. Riêng vùng chấm công: mỗi lần lưu ghi một dòng `field = 'zone'`, giá trị là cả `{ lat, lng, radiusM }`.

### 3.5 Giờ ca

Giờ ca nằm trong một hằng số duy nhất `src/common/shift-catalog.ts`:

| Mã | Loại (`kind`) | Giờ |
|---|---|---|
| `Normal1` | `normal` | 08:00–17:00 |
| `Normal2` | `normal` | 10:00–19:00 |
| `Flex1` | `flex` | 06:00–15:00 |
| `Flex2` | `flex` | 13:00–22:00 |
| `Night1` | `night` | 22:00–07:00 |
| `Night2` | `night` | 21:00–06:00 |

- Hằng số này khớp với các dòng trong bảng `work_shifts`.
- `requests/domain/shift-frames.ts` sẽ đọc từ hằng số này.
- Các fallback `'08:00'` / `'17:00'` ở employees, attendance và requests sẽ lấy `Normal1` từ hằng số.
- Không có bảng ghi giờ ca, không có API sửa giờ ca.

## 4. Module `settings` (BE)

`src/modules/settings/` theo mẫu controller → service → repository, logic thuần nằm trong `domain/`.

- **`domain/setting-groups.ts`**: danh mục 6 nhóm có phiên bản. Mỗi ô có:
  - tên phía API (camelCase), cột DB;
  - kiểu (`rate` | `pct` | `int` | `money` | `brackets`);
  - mặc định, nhỏ nhất, lớn nhất, bước.
  
  Hàm `validateGroupChange(group, values)` kiểm từng ô và các ràng buộc chéo: tổng KPI bằng 100, biểu thuế tăng dần. Đây là nguồn duy nhất của giới hạn: API trả các giới hạn này cho FE, và CHECK trong `schema.sql` dùng cùng con số.
- **`src/common/version-chain.ts`**: chuyển `positions/domain/version-chain.ts` sang đây. Đường dẫn cũ re-export để màn Chức vụ không đổi.
  - Lưu từ tháng M: nếu M đã có phiên bản thì sửa thẳng phiên bản đó; nếu chưa thì chép phiên bản đang hiệu lực sang M rồi sửa.
  - Các phiên bản sau M mà ô đó vẫn bằng số cũ thì nhận số mới.
  - Phiên bản sau mà Admin đã cố ý đặt số khác thì giữ nguyên.
  - *Ví dụ:* đã có OT lễ ×3,5 từ 03/2027, giờ đặt ×3,2 từ 12/2026. Tháng 12, 01, 02 dùng ×3,2; từ 03/2027 vẫn ×3,5.
  - Tuần riêng dùng cùng cơ chế, theo từng người.
- **`domain/work-week.ts`**:
  - `standardWorkdaysForWeek(n) = Math.round(n * 52 / 12)`;
  - `validateWeekdays(list)`: 1–6, không trùng, ít nhất 1 ngày;
  - `isWorkday(weekdays, date)`.
- **`domain/attendance-zone.ts`**:
  - `distanceM(a, b)` theo công thức haversine, bán kính Trái Đất 6.371.000 m;
  - `checkPunchLocation(zone, location)` trả `ok`, `{ outside, distanceM }` hoặc `no-location`.
- **`domain/pay-days.ts`**: `payDateOf(month, payDay)` trả ngày `payDay` của tháng M+1, giữ nguyên kể cả khi rơi vào Chủ nhật hoặc lễ (D9).
- **`domain/min-month.ts`**:
  - `minMonth` = tháng ngay sau kỳ lương gần nhất có `payroll_periods.status` thuộc `('approved','paid')`;
  - nếu chưa có kỳ nào như vậy thì là tháng hiện tại theo giờ Việt Nam (Ruling R7).
- **`SettingsReader`** (export cho module khác, module khác không đọc thẳng bảng):
  - `settingsFor(month, trx?)` trả bản chụp có kiểu:
    ```ts
    { overtime: { weekdayRate, weekendRate, holidayRate },
      attendance: { lateGraceMinutes, diligenceLostFromDays },
      kpiWeights: { wework, user, peer, manager, self },
      insurance: { bhxhPct, bhytPct, bhtnPct },
      tax: { personalDeduction, dependantDeduction, shortContractPct, shortContractThreshold,
             brackets: [{ upTo: number | null, ratePct }] },
      payCalendar: { payDay } }
    ```
  - `workWeekOf(employeeUuid, month)` trả `{ weekdays, source: 'type' | 'own', standardWorkdays, from }`.
  - `zone()` trả `{ lat, lng, radiusM } | null`.

## 5. API (`/api/v2`)

Mọi route mới mang đúng một dấu quyền, theo quy ước "mặc định đóng":
- đọc: `@RequireCap('config.read')`;
- ghi: `@RequireCap('config.write')`;
- các route `/me/*`: `@Authenticated()`.

Quy ước chung của hợp đồng:
- Tháng là chuỗi `'YYYY-MM'`, ngày là `'YYYY-MM-DD'`, giờ là `'HH:mm'`, thời điểm là chuỗi ISO UTC.
- Tiền là số đồng nguyên. Hệ số là số thực (1.5). Phần trăm là số phần trăm (8 nghĩa là 8%, 1.5 nghĩa là 1,5%).
- Thứ trong tuần: 1 = T2 … 6 = T7; Chủ nhật (0) không bao giờ có trong `weekdays`.
- Lỗi có dạng `{ "error": "<câu tiếng Việt>", "code": "<MÃ>", ...chi tiết }`, giống `ApiExceptionFilter` hiện có.

### 5.1 Các con số tính lương (6 nhóm có phiên bản theo tháng)

Tên nhóm trong đường dẫn và tên khoá trong phản hồi:

| `:group` | khoá trong `groups` | ô (`values`) |
|---|---|---|
| `overtime` | `overtime` | `weekdayRate`, `weekendRate`, `holidayRate` |
| `attendance` | `attendance` | `lateGraceMinutes`, `diligenceLostFromDays` |
| `kpi-weights` | `kpiWeights` | `wework`, `user`, `peer`, `manager`, `self` |
| `insurance` | `insurance` | `bhxhPct`, `bhytPct`, `bhtnPct` |
| `tax` | `tax` | `personalDeduction`, `dependantDeduction`, `shortContractPct`, `shortContractThreshold`, `brackets` |
| `pay-calendar` | `payCalendar` | `payDay` |

**`GET /settings?month=2026-11`** (`config.read`; bỏ `month` thì lấy tháng hiện tại theo giờ Việt Nam)

```json
{
  "month": "2026-11",
  "minMonth": "2026-11",
  "groups": {
    "overtime": {
      "from": "2000-01",
      "stamp": 0,
      "values":   { "weekdayRate": 1.5, "weekendRate": 2, "holidayRate": 3 },
      "defaults": { "weekdayRate": 1.5, "weekendRate": 2, "holidayRate": 3 },
      "limits": {
        "weekdayRate": { "min": 1.5, "max": 5, "step": 0.01 },
        "weekendRate": { "min": 2,   "max": 5, "step": 0.01 },
        "holidayRate": { "min": 3,   "max": 5, "step": 0.01 }
      }
    },
    "attendance": {
      "from": "2000-01", "stamp": 0,
      "values":   { "lateGraceMinutes": 15, "diligenceLostFromDays": 3 },
      "defaults": { "lateGraceMinutes": 15, "diligenceLostFromDays": 3 },
      "limits": { "lateGraceMinutes": { "min": 0, "max": 60, "step": 1 },
                  "diligenceLostFromDays": { "min": 1, "max": 31, "step": 1 } }
    },
    "kpiWeights": {
      "from": "2000-01", "stamp": 0,
      "values":   { "wework": 40, "user": 24, "peer": 18, "manager": 12, "self": 6 },
      "defaults": { "wework": 40, "user": 24, "peer": 18, "manager": 12, "self": 6 },
      "limits": { "wework": { "min": 0, "max": 100, "step": 1 }, "...": "giống cho user, peer, manager, self" },
      "sum": 100
    },
    "insurance": {
      "from": "2000-01", "stamp": 0,
      "values":   { "bhxhPct": 8, "bhytPct": 1.5, "bhtnPct": 1 },
      "defaults": { "bhxhPct": 8, "bhytPct": 1.5, "bhtnPct": 1 },
      "limits": { "bhxhPct": { "min": 0, "max": 100, "step": 0.01 }, "...": "giống cho bhytPct, bhtnPct" }
    },
    "tax": {
      "from": "2000-01", "stamp": 0,
      "values": {
        "personalDeduction": 15500000, "dependantDeduction": 6200000,
        "shortContractPct": 10, "shortContractThreshold": 5000000,
        "brackets": [
          { "upTo": 10000000, "ratePct": 5 }, { "upTo": 30000000, "ratePct": 10 },
          { "upTo": 60000000, "ratePct": 20 }, { "upTo": 100000000, "ratePct": 30 },
          { "upTo": null, "ratePct": 35 }
        ]
      },
      "defaults": { "...": "cùng dạng với values" },
      "limits": {
        "personalDeduction": { "min": 0, "max": 1000000000, "step": 1 },
        "dependantDeduction": { "min": 0, "max": 1000000000, "step": 1 },
        "shortContractPct": { "min": 0, "max": 100, "step": 0.01 },
        "shortContractThreshold": { "min": 0, "max": 1000000000, "step": 1 },
        "brackets": { "minRows": 1, "maxRows": 10, "upTo": { "min": 1, "max": 1000000000, "step": 1 },
                      "ratePct": { "min": 0, "max": 100, "step": 0.01 } }
      }
    },
    "payCalendar": {
      "from": "2000-01", "stamp": 0,
      "values": { "payDay": 10 }, "defaults": { "payDay": 10 },
      "limits": { "payDay": { "min": 1, "max": 28, "step": 1 } }
    }
  }
}
```

- Khoá `"..."` trong ví dụ chỉ để rút gọn; phản hồi thật có đủ từng ô.
- `from` là tháng của phiên bản đang hiệu lực ở `month`. Một ô "đã chỉnh" khi `values` khác `defaults`.
- `kpiWeights.sum` là tổng bắt buộc của 5 trọng số (100).
- Quy tắc biểu thuế: `upTo` tăng dần, chỉ bậc cuối được `null`, và bậc cuối bắt buộc là `null`.

**`PUT /settings/:group`** (`config.write`)

```json
{ "effectiveMonth": "2026-11", "values": { "weekdayRate": 1.6 }, "reason": "Theo quyết định 12/2026", "stamp": 0 }
```

- `values` chỉ gồm các ô đổi. Với `tax`, khi đổi biểu thuế thì gửi nguyên mảng `brackets`. Với `kpi-weights`, phải gửi đủ 5 ô và tổng phải bằng 100.
- `reason` có thể bỏ hoặc gửi `null`; nếu gửi thì dài 1–300 ký tự.
- `effectiveMonth` phải ≥ `minMonth`.
- Trả `200`:
  ```json
  { "ok": true, "effectiveMonth": "2026-11", "changed": ["weekdayRate"], "stamp": 17 }
  ```
  Nếu mọi ô đều bằng giá trị đang hiệu lực thì trả `"changed": []` và `stamp` không đổi.

**`GET /settings/:group/history`** (`config.read`): mới nhất trước, tối đa 200 dòng.

```json
{ "items": [
  { "id": 17, "field": "weekdayRate", "month": "2026-11", "from": 1.5, "to": 1.6,
    "by": "admin", "at": "2026-11-05T09:12:00.000Z", "reason": "Theo quyết định 12/2026" }
] }
```

- `field` là tên ô như trong `values`.
- Với `brackets`, `from` và `to` là nguyên mảng.

**Hoàn tác:** không có API riêng. FE gửi `PUT /settings/:group` với `values: { <field>: <from của dòng lịch sử> }` và `effectiveMonth` do Admin chọn (≥ `minMonth`). Lần lưu này sinh một dòng lịch sử mới.

### 5.2 Ngày trả lương theo năm

**`GET /settings/pay-days?year=2026`** (`config.read`)

```json
{ "year": 2026, "items": [
  { "month": "2026-01", "payDay": 10, "payDate": "2026-02-10" },
  { "month": "2026-12", "payDay": 10, "payDate": "2027-01-10" }
] }
```

- Luôn trả đủ 12 phần tử, từ tháng 01 đến 12.
- `payDate` là ngày `payDay` của tháng sau, giữ nguyên kể cả khi rơi vào Chủ nhật hoặc ngày lễ.
- Ngày trả lương sửa qua `PUT /settings/pay-calendar` (mục 5.1).

### 5.3 Tuần làm việc riêng

**`GET /settings/work-weeks?month=2026-12`** (`config.read`; bỏ `month` thì lấy tháng hiện tại theo giờ Việt Nam)

```json
{ "month": "2026-12", "weekdays": { "ctv-chau": [1,3,5], "nv-binh": [1,2,3,4,5], "tts-ha": [1,2,3,4,5] } }
```

- Có mọi nhân sự đã có tài khoản (`staff.uuid` khác NULL), khoá theo `username` tăng dần.
- Giá trị là tuần đang áp dụng ở tháng đó: tuần riêng nếu có, không thì tuần của loại nhân sự (giống `weekdays` của route từng người).
- Người có loại không có tuần ở tháng đó thì bỏ qua.
- `month` sai dạng hoặc trước `2000-01` → `400 BAD_SETTINGS_INPUT`, `field: "month"`.

**`GET /settings/work-weeks/:username?month=2026-12`** (`config.read`; bỏ `month` thì lấy tháng hiện tại theo giờ Việt Nam)

```json
{ "username": "nv-binh", "month": "2026-12", "minMonth": "2026-11", "weekdays": [1,2,3,4,5], "source": "own",
  "from": "2026-12", "standardWorkdays": 22, "typeWeekdays": [1,2,3,4,5,6], "typeStandardWorkdays": 26, "stamp": 21 }
```

- `source: "type"` nghĩa là đang dùng tuần của loại nhân sự; khi đó `weekdays` bằng `typeWeekdays` và `from` là `null`.
- `standardWorkdays` = `round(số ngày × 52 / 12)` khi là tuần riêng, bằng `typeStandardWorkdays` khi theo loại.

**`PUT /settings/work-weeks/:username`** (`config.write`)

```json
{ "effectiveMonth": "2026-12", "weekdays": [1,2,3,4,5], "reason": null, "stamp": 0 }
```

- `weekdays: null` nghĩa là quay về tuần của loại nhân sự, từ `effectiveMonth`.
- `weekdays` khác `null` thì có 1–6 phần tử, mỗi phần tử từ 1 đến 6, không trùng; BE lưu theo thứ tự tăng dần.
- `effectiveMonth` phải ≥ `minMonth`; `reason` như mục 5.1.
- Trả `200`:
  ```json
  { "ok": true, "weekdays": [1,2,3,4,5], "source": "own", "standardWorkdays": 22, "stamp": 22 }
  ```

**`GET /settings/work-weeks/:username/history`**: dạng giống mục 5.1; `field` luôn là `"weekdays"`, còn `from` và `to` là mảng hoặc `null`.

### 5.4 Vùng chấm công

| Route | Quyền | Thân / phản hồi |
|---|---|---|
| `GET /settings/attendance-zone` | `config.read` | `{ "zone": { "lat": 10.7769, "lng": 106.7009, "radiusM": 150 }, "stamp": 9 }`; chưa đặt vùng thì `zone` là `null`, `stamp` là 0 |
| `PUT /settings/attendance-zone` | `config.write` | Thân `{ "lat": 10.7769, "lng": 106.7009, "radiusM": 150, "reason": null, "stamp": 9 }`. Trả `{ "ok": true, "zone": {...}, "stamp": 10 }` |
| `GET /settings/attendance-zone/history` | `config.read` | dạng giống mục 5.1; `field` là `"zone"`, còn `from` và `to` là `{ lat, lng, radiusM }` hoặc `null` |

Giới hạn: `lat` từ −90 đến 90, `lng` từ −180 đến 180, `radiusM` là số nguyên từ 20 đến 5000. Không có tháng áp dụng: lưu xong có hiệu lực ngay. Không có API xoá vùng.

### 5.5 Giờ ca

`GET /employees/meta/shifts` (có sẵn, `staff.manage`) giữ nguyên các trường đang trả (`code`, `preset`, `name`, `kind`, `sort`...) và thêm hai trường `startTime`, `endTime` cho mỗi ca:

```json
{ "shifts": [
  { "code": "Normal1", "preset": "n1", "name": "Normal 1", "kind": "normal", "sort": 1, "startTime": "08:00", "endTime": "17:00" },
  { "code": "Night1",  "preset": "g1", "name": "Night 1",  "kind": "night",  "sort": 5, "startTime": "22:00", "endTime": "07:00" }
] }
```

Ca có giờ ra nhỏ hơn giờ vào là ca qua đêm (ra vào hôm sau). Không có API sửa giờ ca.

### 5.6 App nhân viên: check-in, vùng chấm công, ngày trả lương

**`GET /me/today`** (có sẵn, `@Authenticated`) giữ nguyên các trường cũ và thêm:

```json
{ "zone": { "lat": 10.7769, "lng": 106.7009, "radiusM": 150 }, "workday": true }
```

- **`zone`:** chưa đặt vùng thì là `null`, khi đó app không kiểm tra vị trí.
- **`workday`:** `true` khi hôm nay thoả ít nhất một điều kiện sau:
  - thứ của hôm nay nằm trong tuần làm việc của người đó;
  - có đơn đã duyệt cho hôm nay (OT, khung làm bù, đổi ca);
  - hôm nay đã có lịch làm việc.

  Không thoả điều kiện nào thì `workday` là `false`: app khoá nút và hiện "Hôm nay không phải ngày làm của bạn".
- **Khoảng cách:** app tự tính bằng haversine với bán kính Trái Đất 6.371.000 m, làm tròn tới mét. Khoảng cách lớn hơn `radiusM` là ngoài vùng: app khoá nút và hiện "Bạn đang cách văn phòng {distanceM} m". BE dùng đúng công thức này.
- **Không có vị trí:** `zone` khác `null` mà máy không lấy được vị trí thì app khoá nút và hiện "Không lấy được vị trí".

**`POST /me/punches`** (có sẵn) giữ nguyên thân `{ kind, lat, lng, accuracyM }`. BE kiểm tra lại theo thứ tự dưới đây; gặp điều kiện nào thì trả `400` với mã tương ứng:

| Thứ tự | Điều kiện | Mã | Thân lỗi |
|---|---|---|---|
| 1 | `workday` là `false` | `NOT_A_WORKDAY` | `{ "error": "Hôm nay không phải ngày làm của bạn", "code": "NOT_A_WORKDAY" }` |
| 2 | Có vùng, thiếu `lat` hoặc `lng` | `NO_LOCATION` | `{ "error": "Không lấy được vị trí", "code": "NO_LOCATION" }` |
| 3 | Có vùng, khoảng cách > `radiusM` | `OUTSIDE_ZONE` | `{ "error": "Bạn đang cách văn phòng 600 m", "code": "OUTSIDE_ZONE", "distanceM": 600, "radiusM": 150 }` |

`NOT_A_WORKDAY` chỉ áp cho chấm vào (`kind: IN`); chấm ra không bị chặn vì lý do này.

`POST /attendance/punches` (Admin chấm thay) không kiểm tra hai điều kiện về vị trí (Ruling R4), nhưng vẫn kiểm tra `NOT_A_WORKDAY`.

**`GET /me/income?month=2026-11`** (có sẵn) thêm `"payDate": "2026-12-10"`, lấy từ ngày trả lương của tháng đó.

### 5.7 Lỗi chung của các API cài đặt

| HTTP | `code` | Khi nào | Chi tiết thêm |
|---|---|---|---|
| 400 | `BAD_SETTINGS_INPUT` | sai kiểu, ngoài giới hạn, tháng < `minMonth`, tổng KPI ≠ 100, biểu thuế sai, `weekdays` rỗng hoặc có 0 / 7 | `field` (ví dụ `"weekdayRate"`, `"effectiveMonth"`, `"brackets"`) |
| 404 | `SETTINGS_GROUP_NOT_FOUND` | `:group` không thuộc 6 nhóm | — |
| 404 | `EMPLOYEE_NOT_FOUND` | `:username` không tồn tại | — |
| 409 | `SETTINGS_STALE` | `stamp` gửi lên khác `stamp` hiện tại (có người vừa lưu trước) | `stamp` (giá trị hiện tại) |

- **`stamp`** là `id` lớn nhất của `settings_changes` thuộc nhóm đó (với tuần riêng: của người đó; với vùng: của vùng), bằng 0 khi chưa có (Ruling R6).
  - FE lấy `stamp` từ lần `GET` gần nhất và gửi lại nguyên giá trị đó khi `PUT`.
  - `stamp` thay cho `expectedRev` / `rev` của API v1; không còn `rev` trên từng ô.
- Mọi lỗi 400 chỉ là lưới an toàn: UI đã khoá trước, theo nguyên tắc "không cho làm điều không hợp lệ".
- **Các route v1 phía FE thôi gọi:** `/settings/params*`, `/settings/first-run`, `/blocks/:code/confirm`.

**Nhật ký:** khi API ghi Nhật ký của phiên audit-log có trên `main`, mỗi lần lưu ghi thêm một dòng `audit_log` (`action: 'settings.save'`). Trước lúc đó, lịch sử chỉ lấy từ `settings_changes`.

## 6. Nơi dùng

| Nơi | Thay đổi | File | Làm khi |
|---|---|---|---|
| Chấm công | `DailyTimesheet.calculate` nhận `lateGraceMinutes` từ `settingsFor(tháng của ngày công)`, thay cho số 15 ở ngưỡng "đi trễ vẫn hợp lệ". Các số 15/30 khác giữ nguyên (Ruling R5). | `attendance/domain/daily-timesheet.ts`, `attendance.service.ts` | Ngay |
| Chấm công | `recordPunch(..., { checkZone: true })` chỉ được gọi từ `POST /me/punches`. Bỏ `officeLocation` do app gửi. Admin chấm thay qua `POST /attendance/punches` thì không kiểm tra vùng (Ruling R4). Xoá `geofence-policy.ts`. | `attendance.service.ts`, `me.controller.ts` (một dòng) | Ngay |
| Chấm công | Không có lịch cho ngày đó: nếu thứ đó không thuộc `workWeekOf` và không có đơn đã duyệt (`OVERTIME` có `ot_date`, `makeup_slots` của đơn `LEAVE_WITH_MAKEUP`, `SHIFT_CHANGE` phủ ngày đó) thì từ chối `NOT_A_WORKDAY`, không tạo lịch mặc định. Ca mặc định lấy từ hằng số. | `attendance.repository.ts`, `attendance.service.ts` | Ngay |
| Nhân sự | `meta/shifts` trả giờ ca. Fallback giờ ca lấy từ hằng số. | `employees/*` | Ngay |
| Đơn từ | `findStaffContext` lấy `regularDows` từ `workWeekOf` thay cho `position_types.regular_dows`, nên đếm ngày nghỉ và xét lễ rơi vào ngày làm đều theo người. `shift-frames.ts` đọc hằng số chung. | `requests/*` | Sau khi **staff-requests** vào `main` |
| App nhân viên | `daySummaryOf` / `monthOf`: ngày ngoài tuần của người đó là `off`, không phải `absent`. `standardDays` lấy từ `workWeekOf`. `today` trả `zone`, `workday`. `income` trả `payDate`. | `me/*` | Sau khi **staff-app** vào `main` |
| Tính lương | Đọc từ `settingsFor(month)`: trọng số KPI (`calculateKpiPay(..., weights)`), bảo hiểm (bỏ đọc `settings.insurance_rates`), thuế (`calculatePersonalIncomeTax(input, tax)`), ngưỡng chuyên cần (`props.diligenceLostFromDays`; D15). Công chuẩn lấy từ `workWeekOf`. Lễ chỉ trả khi rơi vào ngày làm của người đó. `payroll_runs.params_json` lưu bản chụp, `params_hash` = sha256, `params_rev` = `id` lớn nhất của `settings_changes`. Hệ số OT do payslip-print tự đọc `settings.overtime`. | `payroll/*` | Sau khi **payslip-print** vào `main` |

Hằng số domain (`KPI_WEIGHTS`, `PERSONAL_DEDUCTION`, `BRACKETS`, `DEFAULT_INSURANCE_RATES`...) chuyển thành giá trị mặc định của tham số hàm, để test thuần cũ vẫn chạy. Giá trị chính thức đến từ `settingsFor`.

## 7. Giao diện (`web/`) — hợp đồng cho phiên "Settings store FE"

Phiên settings-store **không** sửa `web/`. Mục này mô tả những gì phiên "Settings store FE" làm trên `__MOCK__`, dựa trên API ở mục 5. Cột "Làm khi" là điều kiện bắt đầu của phiên FE.

Quy ước chung cho mọi màn:
- Ô số giới hạn theo `limits`.
- Ô tháng chỉ có các tháng từ `minMonth` trở đi.
- Nút Lưu bị khoá khi chưa có thay đổi.
- Lý do không bắt buộc.
- Bấm Lưu thì hiện hộp xác nhận "<tên ô> <cũ> → <mới>, áp dụng từ tháng MM/YYYY".
- Gặp 409 thì tải lại và báo ngắn "Có người vừa lưu trước, đã tải lại".
- Ô nhập bo góc 8px; mục không sửa được hiện chữ thường.
- Dữ liệu API được chuyển sang dạng hiển thị ở `web/src/builders/api/settings.ts`, theo quy ước BE trả nghiệp vụ, FE định dạng.

| Màn | Nội dung | Làm khi |
|---|---|---|
| Lịch, ca & chấm công | Ngày trả lương: ô 1–28 kèm ô tháng áp dụng; dấu chấm trên lịch năm vẽ theo `/settings/pay-days`. "Bắt đầu tính công: ngày 1" là chữ cố định. Bảng ca chỉ xem, giờ hiện bằng chữ. Vùng chấm công: bán kính 20–5000 m, vĩ độ, kinh độ, nút "Dùng vị trí hiện tại"; lưu có hiệu lực ngay. Thay `notConnected` của `saveCalendarSetup`. | Ngay |
| Quy tắc KPI | Trọng số đọc từ `GET /settings`, chỉ xem, kèm link sang Cách tính lương › Lương KPI. | Ngay |
| Hồ sơ nhân sự | Ngăn kéo thêm dòng "Tuần làm việc: T2–T6 · công chuẩn 22 · riêng từ 12/2026" và nút **Sửa**. Bấm Sửa mở hộp gồm: 6 ô tick T2–T7, lựa chọn "Theo loại nhân sự", ô tháng, dòng công chuẩn cập nhật ngay khi tick. Lưu khoá khi không tick ô nào hoặc chưa đổi gì. | Ngay |
| Cách tính lương | Dòng có số khác mặc định thì đánh dấu "Đã chỉnh"; bỏ dòng "N chính sách chưa chốt". Nội dung ngăn kéo:<br>• Lương theo ngày công: chỉ xem (/positions) kèm link.<br>• Tiền làm thêm giờ: ×1,5 / ×2 / ×3 sửa được.<br>• Phụ cấp: % theo loại chỉ xem kèm link; "Mất chuyên cần khi nghỉ từ … ngày" sửa được.<br>• Lương KPI: KPI tối đa chỉ xem; 5 trọng số sửa được, Lưu khoá khi tổng ≠ 100 và hiện "Tổng 98/100".<br>• Khấu trừ đi muộn: "Đi trễ tới … phút vẫn hợp lệ" sửa được.<br>• Tạm ứng: chữ "80% lương của ngày công 01–15".<br>Bỏ các ô v1 không còn trong v2. | Sau khi **admin-cleanup** vào `main` |
| Tất cả cài đặt | Chỉ hiện các nhóm có mục: OT, Phụ cấp (chuyên cần), KPI, Khấu trừ, Tạm ứng (chỉ xem), Bảo hiểm, Thuế (thêm bảng biểu thuế sửa được), Kỳ lương (ngày trả lương). Mỗi mục có lịch sử và Hoàn tác (`RevertDialog`). Giữ ô tìm kiếm. Bỏ dải "chưa ai xác nhận", bộ lọc "Chưa xác nhận" và số trên menu (`getSettingsBadges`). | Sau khi **admin-cleanup** vào `main` |
| App nhân viên | Nút check-in khoá trong ba trường hợp: ngoài vùng ("Bạn đang cách văn phòng 600 m"), không có vị trí ("Không lấy được vị trí"), `workday: false` ("Hôm nay không phải ngày làm của bạn"). Ngày ngoài tuần hiện "nghỉ". Thu nhập hiện "trả ngày 10/12". | Sau khi **staff-app** vào `main` |
| Lưới chấm công Admin | Ngày ngoài tuần của từng người hiện là nghỉ, thôi giả định T2–T7. | Sau khi **staff-app** vào `main` |

**Dữ liệu giả (`__MOCK__`):** thêm `web/src/mock/settings.ts`, có đủ phản hồi cho các API ở mục 5 với giá trị mặc định ở mục 3. Mọi người làm T2–T7, không có tuần riêng trong mock.

## 8. Kiểm thử

- **BE — phiên settings-store** (`PG_TEST_URL=postgres://postgres@127.0.0.1:55466/postgres npm test`, container `luong-test-pg-settings-store`, xoá container khi xong):
  - **Phần thuần:**
    - version chain, gồm ví dụ OT lễ ×3,5 / ×3,2;
    - `standardWorkdaysForWeek` từ 1 đến 6;
    - `validateGroupChange`: biên từng ô, tổng KPI, biểu thuế tăng dần, bậc cuối NULL;
    - `distanceM` và `checkPunchLocation`;
    - `payDateOf`, gồm 10/01/2027 là Chủ nhật vẫn giữ nguyên;
    - `minMonth`.
  - **Service với fake:**
    - lưu chỉ ô đổi;
    - ghi `settings_changes`;
    - `stamp` cũ thì báo 409;
    - Hoàn tác bằng `PUT`;
    - tuần riêng `null` thì quay về tuần của loại.
  - **Test trên PostgreSQL (`*.pg.test.ts`):**
    - giá trị gieo sẵn;
    - các CHECK;
    - `settings_changes` không cho UPDATE hay DELETE;
    - `settingsFor` đọc đúng phiên bản theo tháng.
  - **Controller:** dấu quyền đúng ("mặc định đóng"); mã lỗi.
  - **Nơi dùng:**
    - đi trễ 12 phút hợp lệ với ân hạn 15 nhưng không hợp lệ với ân hạn 10;
    - chấm ngoài vùng hoặc không có vị trí bị từ chối, Admin chấm thay thì được;
    - thứ Bảy của người làm T2–T6 bị chặn, có OT đã duyệt thì được;
    - đếm ngày nghỉ theo tuần riêng (khi staff-requests đã vào `main`);
    - lương Bình 23 ÷ 22 ra 6.795.455 (khi payslip-print đã vào `main`).
- **FE — phiên "Settings store FE"** (`PW_PORT=4256 npm --prefix web run test:ui`; phiên settings-store không chạy lệnh này):
  - Lịch: ca chỉ xem, lưu vùng chấm công, lưu ngày trả lương;
  - Quy tắc KPI đọc trọng số;
  - hộp tuần làm việc trong hồ sơ: khoá khi không tick ô nào, công chuẩn 22 khi tick T2–T6;
  - sửa OT trong ngăn kéo: kiểm câu trong hộp xác nhận và thân `PUT`;
  - trọng số KPI tổng khác 100 thì khoá Lưu;
  - Hoàn tác ở Tất cả cài đặt;
  - viết lại `settings-search.spec.ts` theo API mới.
- **Không chạy** typecheck và prettier.

## 9. Ngoài phạm vi

- Mức trần bảo hiểm, luật từ 14 ngày không lương, bậc trừ 30 phút, phần cộng thêm làm đêm và lễ ban đêm (đính chính ở mục 2).
- Tách OT ×1,5 / ×2 / ×3 (phiên payslip-print).
- Xem trước tác động (D12).
- Số "chưa ai xác nhận" (D11).
- Nhiều vùng chấm công; kiểm độ chính xác GPS.
- Sửa giờ ca (D7).
- Chặn chấm công vào ngày lễ.
- Phân quyền, khoá, token: hôm nay không bàn bảo mật.
- Ghi `audit_log`, cho tới khi API của phiên audit-log có trên `main`.

## 10. Phán quyết kỹ thuật (người dùng xem khi duyệt spec)

- **R1 — Cận dưới hệ số OT là mức sàn luật (BLLĐ 2019 Điều 98):** ngày thường 1,5, cuối tuần 2, lễ 3; cận trên 5. *Lý do:* chặn trả dưới luật ngay ở ô nhập. *Rủi ro nếu sai:* công ty muốn đặt thấp hơn sàn thì không đặt được.
- **R2 — Bán kính vùng 20–5000 m**, theo v1. *Rủi ro:* văn phòng cần vùng nhỏ hơn 20 m.
- **R3 — Chưa đặt vùng thì không kiểm tra vị trí**, giữ như hiện nay. *Lý do:* nếu chặn thì không ai chấm công được. *Rủi ro:* quên đặt vùng thì chấm được ở bất kỳ đâu.
- **R4 — Admin chấm thay không bị kiểm tra vùng.** *Lý do:* đó là thao tác sửa công. *Rủi ro:* bị lợi dụng để chấm hộ, nhưng vẫn có nhật ký ghi lại.
- **R5 — Chỉ ngưỡng "đi trễ vẫn hợp lệ" (15) thành cài đặt.** Các mốc 15/30 khác của luật giải trình vẫn cố định. *Rủi ro:* Admin hạ ân hạn xuống 10 nhưng "check-in sớm quá 15 phút" vẫn là 15.
- **R6 — Chống ghi đè bằng `stamp`** (`id` lớn nhất của `settings_changes` theo nhóm/người/vùng) thay cho `rev` trên từng dòng. *Lý do:* một con số so được cho cả nhóm, kể cả khi đổi tháng áp dụng. *Rủi ro:* hai Admin sửa hai ô khác nhau cùng nhóm thì người lưu sau phải tải lại.
- **R7 — `minMonth`** = tháng ngay sau kỳ lương gần nhất đã duyệt hoặc đã trả; chưa có kỳ nào như vậy thì là tháng hiện tại. *Rủi ro:* cần sửa một tháng đã chốt thì phải mở lại kỳ trước.

## 11. Phối hợp

- **Settings store FE** (`local_6d04087e-ad96-4b60-94ca-4eaefa1f926f`): làm toàn bộ `web/` theo mục 5 và mục 7. Muốn đổi route, tên trường, mã lỗi hay `stamp` thì hai phiên nhắn nhau trước khi sửa spec.
- **payslip-print:** khi module `settings` vào nhánh, nhắn phiên này tên hàm `settingsFor(month).overtime.{weekdayRate, weekendRate, holidayRate}` để họ đọc hệ số OT. Phần nối tính lương ở mục 6 chỉ làm sau khi nhánh của họ vào `main`.
- **staff-requests, staff-app, admin-cleanup:** phần nối ở mục 6–7 chờ nhánh tương ứng vào `main`. Trước khi đụng file, kiểm bằng `git merge-base --is-ancestor <nhánh> main`.
- Phiên này không merge vào `main` và không push.
